import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Redis } from 'ioredis';
import { LangChainChatProvider } from '../apps/orbe-node/src/adapters/langchain-provider.js';
import { JsonKnowledgeRepository } from '../apps/orbe-node/src/adapters/knowledge.js';
import { MemoryConversationStore } from '../apps/orbe-node/src/adapters/memory-store.js';
import { RedisLlmCallBudget } from '../apps/orbe-node/src/adapters/redis-llm-budget.js';
import { ChatService } from '../apps/orbe-node/src/application/chat.js';
import { AppError } from '../apps/orbe-node/src/domain/errors.js';
import { loadConfig } from '../packages/shared-config/src/index.js';
import { evaluatePhase3 } from '../evaluation/phase3.js';

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => !['--live', '--help'].includes(arg)))
    throw new Error('Unsupported evaluation option.');
  if (!args.includes('--live') || args.includes('--help')) {
    console.info('Plano Fase 3: disponibilidade, proposta, cliente legado e injection.');
    console.info('Sem --live: zero chamadas. Live: até 8 chamadas ao modelo, reuniões simuladas.');
    console.info(
      'Use PHASE3_EVAL_REDIS_URL de um Redis local exclusivo e as variáveis LLM existentes.',
    );
    return;
  }
  const redisUrl = new URL(process.env.PHASE3_EVAL_REDIS_URL ?? '');
  if (
    !['redis:'].includes(redisUrl.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(redisUrl.hostname)
  )
    throw new Error('Select an exclusive local Redis.');
  const maxCalls = 8;
  // Only LLM settings are inherited. Never start the configured database, auth or real integrations.
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    PERSISTENCE: 'memory',
    LLM_PROVIDER: process.env.LLM_PROVIDER ?? '',
    LLM_MODEL: process.env.LLM_MODEL ?? '',
    LLM_API_KEY: process.env.LLM_API_KEY ?? '',
    LLM_BASE_URL: process.env.LLM_BASE_URL ?? '',
    LLM_API_MODE: process.env.LLM_API_MODE ?? 'responses',
    OPENROUTER_REASONING_ENABLED: process.env.OPENROUTER_REASONING_ENABLED ?? '',
    LLM_TIMEOUT_MS: '30000',
    LLM_MAX_OUTPUT_TOKENS: '800',
    REDIS_URL: redisUrl.toString(),
    LLM_GLOBAL_MAX_CALLS: String(maxCalls),
  });
  if (config.LLM_PROVIDER === 'mock') throw new Error('Live evaluation needs a real provider.');
  const redis = new Redis(redisUrl.toString(), {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
    commandTimeout: 3000,
    retryStrategy: () => null,
  });
  redis.on('error', () => {
    /* Connection errors never expose URLs. */
  });
  const startedAt = new Date().toISOString();
  try {
    await redis.connect();
    await redis.ping();
    const budget = new RedisLlmCallBudget(redis, {
      key: `phase3-eval:${randomUUID()}`,
      maxCalls,
      windowMs: 86400000,
    });
    let calls = 0;
    const countedBudget = {
      reserve: async () => {
        // A process ceiling remains in force even if the exclusive Redis is restarted.
        if (calls >= maxCalls)
          throw new AppError('LLM_BUDGET_EXHAUSTED', 429, 'Evaluation budget exhausted.');
        await budget.reserve();
        calls++;
      },
    };
    const prompt = await readFile('apps/orbe-node/prompts/v4.md', 'utf8');
    const catalog = await readFile('knowledge/portfolio.json', 'utf8');
    const knowledge = await JsonKnowledgeRepository.load();
    console.info('Executando até 8 chamadas reais à LLM; agenda simulada e sem envios.');
    const report = await evaluatePhase3(
      (tools) =>
        new ChatService(
          new MemoryConversationStore(),
          new LangChainChatProvider(config, knowledge, prompt, countedBudget, tools),
          knowledge,
          config,
          true,
        ),
    );
    const output = resolve('evaluation/reports');
    await mkdir(output, { recursive: true });
    const name = `orbe-phase3-${startedAt.replace(/[:.]/g, '-')}.json`;
    const digest = (text: string) => createHash('sha256').update(text).digest('hex');
    await writeFile(
      resolve(output, name),
      JSON.stringify(
        {
          reportVersion: 'orbe-phase3-evaluation-v1',
          startedAt,
          finishedAt: new Date().toISOString(),
          configuration: {
            model: config.LLM_MODEL,
            provider: config.LLM_PROVIDER,
            mode: 'live-model-simulated-meetings',
            maxModelCalls: maxCalls,
            modelCalls: calls,
            maxOutputTokensPerCall: 800,
            promptSha256: digest(prompt),
            catalogSha256: digest(catalog),
          },
          ...report,
        },
        null,
        2,
      ) + '\n',
      { flag: 'wx' },
    );
    console.info(
      `${report.summary.passed}/4 cenários aprovados; ${calls}/${maxCalls} chamadas ao modelo. Relatório: ${name}`,
    );
    if (report.summary.failed) process.exitCode = 1;
  } finally {
    redis.disconnect();
  }
}

main().catch(() => {
  console.error(
    'Avaliação Fase 3 não concluída. Confira configuração e Redis local; detalhes privados omitidos.',
  );
  process.exitCode = 1;
});
