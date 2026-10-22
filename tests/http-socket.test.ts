import { setTimeout as delay } from 'node:timers/promises';
import { expect, it } from 'vitest';
import { loadConfig } from '../packages/shared-config/src/index.js';
import { testApp } from './helpers.js';

it('mantém o socket aberto durante uma geração válida acima de dez segundos', async () => {
  const app = await testApp({
    config: loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', LLM_TIMEOUT_MS: '12000' }),
    provider: {
      name: 'mock',
      generate: async () => {
        await delay(10_200);
        return { answer: 'O portfólio usa React, TypeScript e Vite.', sources: [] };
      },
    },
  });
  try {
    const origin = await app.listen({ host: '127.0.0.1', port: 0 });
    const response = await fetch(`${origin}/api/v1/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Quais tecnologias usa o portfólio?' }),
      signal: AbortSignal.timeout(17_000),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).answer).toContain('Vite');
  } finally {
    await app.close();
  }
}, 20_000);
