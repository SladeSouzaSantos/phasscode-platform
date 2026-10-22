import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertLlmPrivacyEnvironment, loadConfig } from '../packages/shared-config/src/index.js';
import { LangChainChatProvider } from '../apps/orbe-node/src/adapters/langchain-provider.js';

const flags = [
  'LANGCHAIN_VERBOSE',
  'LANGCHAIN_TRACING',
  'LANGCHAIN_TRACING_V2',
  'LANGSMITH_TRACING',
  'LANGSMITH_TRACING_V2',
];
const realEnvironment = {
  LLM_PROVIDER: 'openai',
  LLM_MODEL: 'test',
  LLM_API_KEY: 'SYNTHETIC_SECRET_NEVER_LOG',
  REDIS_URL: 'redis://127.0.0.1:6379',
  LLM_GLOBAL_MAX_CALLS: '1',
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('privacidade de diagnósticos LangChain/LangSmith', () => {
  it.each(flags)(
    'rejeita %s antes de ativar mock ou provedor real, sem ecoar valores secretos',
    (flag) => {
      for (const LLM_PROVIDER of ['mock', 'openai']) {
        const error = (() => {
          try {
            loadConfig({ ...realEnvironment, LLM_PROVIDER, [flag]: 'true' });
          } catch (caught) {
            return caught;
          }
        })();
        expect(error).toBeInstanceOf(Error);
        expect(String(error)).toContain(flag);
        expect(String(error)).not.toContain('SYNTHETIC_SECRET_NEVER_LOG');
      }
    },
  );

  it('aceita flags ausentes, vazias ou false e não registra as demais variáveis de ambiente', () => {
    for (const value of [undefined, '', 'false']) {
      expect(() =>
        assertLlmPrivacyEnvironment(Object.fromEntries(flags.map((flag) => [flag, value]))),
      ).not.toThrow();
    }
    expect(loadConfig({ LANGCHAIN_VERBOSE: 'false' }).LLM_PROVIDER).toBe('mock');
  });

  it.each(flags)(
    'bloqueia construção com %s herdado mesmo quando Config foi criado manualmente',
    (flag) => {
      const config = loadConfig(realEnvironment);
      const reserve = vi.fn(async () => undefined);
      const fetch = vi.fn(async () => {
        throw new Error('Nenhum transporte deve ser chamado.');
      });
      vi.stubGlobal('fetch', fetch);
      vi.stubEnv(flag, 'true');
      expect(
        () =>
          new LangChainChatProvider(config, { search: () => [] }, 'Prompt público.', { reserve }),
      ).toThrow(flag);
      expect(reserve).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});
