import { describe, expect, it, vi, afterEach } from 'vitest';
import { loadConfig } from '../packages/shared-config/src/index.js';
import { JsonKnowledgeRepository } from '../apps/orbe-node/src/adapters/knowledge.js';
import { MemoryConversationStore } from '../apps/orbe-node/src/adapters/memory-store.js';
import { ChatService } from '../apps/orbe-node/src/application/chat.js';
import { MockChatProvider } from '../apps/orbe-node/src/adapters/mock-provider.js';
import type { ChatProvider, GenerationInput } from '../apps/orbe-node/src/domain/ports.js';

afterEach(() => vi.useRealTimers());
describe('configuração', () => {
  it('falha cedo se produção usar memória ou não configurar Redis', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow('Produção requer');
    expect(() => loadConfig({ PERSISTENCE: 'postgres' })).toThrow('DATABASE_URL');
  });
  it('não inclui valores secretos nos erros de validação', () => {
    expect(() => loadConfig({ LLM_PROVIDER: 'openai', LLM_API_KEY: 'secret' })).toThrow(
      'LLM_MODEL',
    );
    expect(() => loadConfig({ PORT: 'secret' })).toThrow('Configuração inválida: PORT');
  });
  it('preserva o padrão do provedor quando reasoning não foi configurado', () => {
    expect(loadConfig().OPENROUTER_REASONING_ENABLED).toBeUndefined();
    expect(
      loadConfig({ OPENROUTER_REASONING_ENABLED: '' }).OPENROUTER_REASONING_ENABLED,
    ).toBeUndefined();
  });
  it.each(['true', 'false'])(
    'aceita controle explícito de reasoning=%s no modo compatível',
    (enabled) => {
      const config = loadConfig({
        LLM_PROVIDER: 'openai-compatible',
        LLM_API_MODE: 'chat-completions',
        LLM_BASE_URL: 'https://example.com/v1',
        LLM_API_KEY: 'test-only',
        LLM_MODEL: 'test',
        OPENROUTER_REASONING_ENABLED: enabled,
      });
      expect(config.OPENROUTER_REASONING_ENABLED).toBe(enabled === 'true');
    },
  );
  it.each(['yes', '1', '0', 'FALSE', 'secret-never-echo'])(
    'recusa booleano inválido de reasoning %#',
    (enabled) => {
      expect(() => loadConfig({ OPENROUTER_REASONING_ENABLED: enabled })).toThrow(
        'Configuração inválida: OPENROUTER_REASONING_ENABLED',
      );
    },
  );
  it.each([
    { LLM_PROVIDER: 'mock', LLM_API_MODE: 'chat-completions' },
    { LLM_PROVIDER: 'openai', LLM_API_MODE: 'chat-completions' },
    { LLM_PROVIDER: 'openai-compatible', LLM_API_MODE: 'responses' },
  ])('recusa controle de reasoning em modo incompatível %#', (mode) => {
    expect(() => loadConfig({ ...mode, OPENROUTER_REASONING_ENABLED: 'false' })).toThrow(
      'OPENROUTER_REASONING_ENABLED requer',
    );
  });
  it.each(['*', 'https://example.com/path', 'file:///secret', ''])('recusa CORS %s', (origin) =>
    expect(() => loadConfig({ CORS_ORIGINS: origin })).toThrow('CORS_ORIGINS'),
  );
});
describe('conhecimento e conversas', () => {
  it('recupera fatos públicos e distingue cursos declarados de credenciais não confirmadas', async () => {
    const knowledge = await JsonKnowledgeRepository.load();
    expect(knowledge.search('React').map((doc) => doc.id)).toContain('web-portfolio-v2');
    expect(knowledge.search('certificado Kubernetes').map((doc) => doc.id)).toContain(
      'trajetoria-a-confirmar',
    );
    expect(knowledge.search('xilofone interplanetário')).toEqual([]);
    const service = new ChatService(
      new MemoryConversationStore(),
      new MockChatProvider(),
      knowledge,
      loadConfig(),
    );
    const response = await service.execute({ message: 'Quais certificados você tem?' });
    expect(response.sources.map((source) => source.id)).toContain('cursos-declarados');
    expect(response.answer).toContain('autodeclarados');
    expect(response.answer).toContain('Não há confirmação de certificação Kubernetes');
  });
  it('limita histórico por quantidade e orçamento de contexto', async () => {
    const seen: GenerationInput[] = [];
    const provider: ChatProvider = {
      name: 'mock',
      generate: async (input) => {
        seen.push(input);
        return { answer: 'x'.repeat(3000), sources: [] };
      },
    };
    const service = new ChatService(
      new MemoryConversationStore(4),
      provider,
      await JsonKnowledgeRepository.load(),
      loadConfig({ CHAT_HISTORY_MESSAGES: '4', CHAT_CONTEXT_CHARS: '4000' }),
    );
    const first = await service.execute({ message: 'Projetos PHASSCODE' });
    for (let i = 0; i < 5; i++)
      await service.execute(
        { message: 'Projetos PHASSCODE', conversationId: first.conversationId },
        first.conversationToken,
      );
    expect(seen.at(-1)!.history.length).toBeLessThanOrEqual(4);
    expect(
      seen.at(-1)!.history.reduce((sum, message) => sum + message.content.length, 0),
    ).toBeLessThanOrEqual(2000);
  });
  it('não grava turno se a geração falhar e permite repetir', async () => {
    let fails = false;
    let seenHistory = 0;
    const service = new ChatService(
      new MemoryConversationStore(),
      {
        name: 'mock',
        generate: async ({ history }) => {
          seenHistory = history.length;
          if (fails) throw new Error('external failure');
          return { answer: 'ok', sources: [] };
        },
      },
      await JsonKnowledgeRepository.load(),
      loadConfig(),
    );
    const first = await service.execute({ message: 'Projetos PHASSCODE' });
    fails = true;
    await expect(
      service.execute(
        { message: 'Projetos PHASSCODE', conversationId: first.conversationId },
        first.conversationToken,
      ),
    ).rejects.toMatchObject({ code: 'LLM_UNAVAILABLE' });
    fails = false;
    await service.execute(
      { message: 'Projetos PHASSCODE', conversationId: first.conversationId },
      first.conversationToken,
    );
    expect(seenHistory).toBe(2);
  });
  it('limita conversas em memória e expira por retenção', async () => {
    vi.useFakeTimers();
    const service = new ChatService(
      new MemoryConversationStore(12, 1, 1),
      new MockChatProvider(),
      await JsonKnowledgeRepository.load(),
      loadConfig(),
    );
    const first = await service.execute({ message: 'Projetos PHASSCODE' });
    await expect(service.execute({ message: 'oi' })).rejects.toMatchObject({ status: 503 });
    vi.setSystemTime(Date.now() + 2 * 86400000);
    await expect(
      service.execute(
        { message: 'oi', conversationId: first.conversationId },
        first.conversationToken,
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect((await service.execute({ message: 'oi' })).conversationId).toBeTruthy();
  });
});
