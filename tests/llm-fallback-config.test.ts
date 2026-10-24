import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../packages/shared-config/src/index.js';
import {
  LLM_FALLBACK_ENV_NAMES,
  LLM_FALLBACK_PROVIDER_IDS,
} from '../packages/shared-config/src/llm-fallback.js';
import { readRepositoryComposeEnvironment } from '../scripts/phase3-preflight.js';

const fallbackEnvironment: NodeJS.ProcessEnv = {
  LLM_FALLBACK_ENABLED: 'true',
  REDIS_URL: 'redis://127.0.0.1:6379/1',
  LLM_GLOBAL_MAX_CALLS: '40',
  LLM_OPENROUTER_API_KEY: 'synthetic-openrouter-key',
  LLM_OPENROUTER_MODEL: 'synthetic/model:free',
  LLM_OPENROUTER_MAX_CALLS: '10',
};

describe('opt-in fallback configuration', () => {
  it('keeps environment template names unique, including optional overrides', () => {
    const example = readFileSync('.env.example', 'utf8');
    const names = [...example.matchAll(/^(?:# )?([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]!);
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    expect(duplicates).toEqual([]);
    expect(new Set(LLM_FALLBACK_ENV_NAMES).size).toBe(LLM_FALLBACK_ENV_NAMES.length);
  });

  it('loads the simplified template with Node env-file semantics and safe offline defaults', () => {
    const config = loadConfig(parseEnv(readFileSync('.env.example', 'utf8')));
    expect(config.LLM_PROVIDER).toBe('mock');
    expect(config.llmFallback).toEqual({ enabled: false });
    expect(config.PERSISTENCE).toBe('memory');
    expect(config.DATABASE_URL).toBeUndefined();
    expect(config.REDIS_URL).toBeUndefined();
    expect(config.auth.enabled).toBe(false);
    expect(config.meetings.enabled).toBe(false);
    expect(config.worker.WORKER_ENABLED).toBe(false);
  });

  it('keeps default and explicit-disabled legacy configurations independent of new provider fields', () => {
    expect(loadConfig({}).llmFallback).toEqual({ enabled: false });
    const legacy = loadConfig({
      LLM_PROVIDER: 'openai',
      LLM_API_KEY: 'synthetic-legacy-key',
      LLM_MODEL: 'synthetic-legacy-model',
      REDIS_URL: 'redis://localhost:6379/1',
      LLM_GLOBAL_MAX_CALLS: '20',
      LLM_FALLBACK_ENABLED: 'false',
      LLM_COHERE_MODEL: 'incomplete-unused-provider',
    });
    expect(legacy.llmFallback).toEqual({ enabled: false });
    expect(legacy.LLM_API_KEY).toBe('synthetic-legacy-key');
    expect(() => loadConfig({ LLM_PROVIDER: 'openai' })).toThrow('LLM_API_KEY e LLM_MODEL');
  });

  it('selects real fallback independently of legacy mock without requiring legacy credentials', () => {
    const config = loadConfig(fallbackEnvironment);
    expect(config.LLM_PROVIDER).toBe('mock');
    expect(config.LLM_API_KEY).toBeUndefined();
    expect(config.llmFallback).toMatchObject({
      enabled: true,
      cooldownMs: 60000,
      maxCooldownMs: 86400000,
      maxAttemptsPerTurn: 6,
      providers: [{ id: 'openrouter', maxCalls: 10, windowMs: 86400000, timeoutMs: 5000 }],
    });
  });

  it('keeps provider order fixed and quotas independent without introducing default models', () => {
    const env: NodeJS.ProcessEnv = { ...fallbackEnvironment, LLM_GLOBAL_WINDOW_MS: '120000' };
    for (const id of ['cohere', 'groq', 'gemini']) {
      const prefix = `LLM_${id.toUpperCase()}_`;
      env[`${prefix}API_KEY`] = `synthetic-${id}-key`;
      env[`${prefix}MODEL`] = `synthetic-${id}-model`;
      env[`${prefix}MAX_CALLS`] = '5';
    }
    env.LLM_GEMINI_WINDOW_MS = '60000';
    const config = loadConfig(env).llmFallback;
    expect(config.enabled).toBe(true);
    if (!config.enabled) throw new Error('Expected enabled fixture.');
    expect(config.providers.map((provider) => provider.id)).toEqual(LLM_FALLBACK_PROVIDER_IDS);
    expect(config.providers.map((provider) => provider.windowMs)).toEqual([
      120000, 60000, 120000, 120000,
    ]);
    expect(config.providers.map((provider) => provider.maxCalls)).toEqual([10, 5, 5, 5]);
  });

  it.each(['API_KEY', 'MODEL', 'MAX_CALLS', 'WINDOW_MS'])(
    'rejects a partial provider even when only %s is configured',
    (suffix) => {
      expect(() =>
        loadConfig({ ...fallbackEnvironment, [`LLM_GEMINI_${suffix}`]: 'synthetic-partial' }),
      ).toThrow('Fallback LLM requer campos completos');
    },
  );

  it('requires one complete provider and an explicit global Redis budget', () => {
    expect(() => loadConfig({ LLM_FALLBACK_ENABLED: 'true' })).toThrow('ao menos um provedor');
    for (const field of ['REDIS_URL', 'LLM_GLOBAL_MAX_CALLS'])
      expect(() => loadConfig({ ...fallbackEnvironment, [field]: '' })).toThrow(
        'REDIS_URL e LLM_GLOBAL_MAX_CALLS',
      );
  });

  it.each(['synthetic/model', 'synthetic/model:paid', 'openrouter/auto'])(
    'rejects a paid or unrestricted OpenRouter candidate: %s',
    (model) => {
      expect(() => loadConfig({ ...fallbackEnvironment, LLM_OPENROUTER_MODEL: model })).toThrow(
        'LLM_OPENROUTER_MODEL',
      );
    },
  );

  it('accepts only the explicit OpenRouter free route and allows its reasoning option', () => {
    expect(
      loadConfig({
        ...fallbackEnvironment,
        LLM_OPENROUTER_MODEL: 'openrouter/free',
        OPENROUTER_REASONING_ENABLED: 'false',
      }).llmFallback.enabled,
    ).toBe(true);
    const withoutRouter: NodeJS.ProcessEnv = {
      LLM_FALLBACK_ENABLED: 'true',
      REDIS_URL: fallbackEnvironment.REDIS_URL,
      LLM_GLOBAL_MAX_CALLS: '40',
      LLM_GEMINI_API_KEY: 'synthetic-gemini-key',
      LLM_GEMINI_MODEL: 'synthetic-gemini-model',
      LLM_GEMINI_MAX_CALLS: '5',
      OPENROUTER_REASONING_ENABLED: 'false',
    };
    expect(() => loadConfig(withoutRouter)).toThrow('OPENROUTER_REASONING_ENABLED');
  });

  it('blocks Cohere trial in production while allowing production without that provider', () => {
    const production = {
      ...fallbackEnvironment,
      NODE_ENV: 'production',
      PERSISTENCE: 'postgres',
      DATABASE_URL: 'postgresql://synthetic:synthetic@localhost/unused',
    };
    expect(loadConfig(production).llmFallback.enabled).toBe(true);
    expect(() =>
      loadConfig({
        ...production,
        LLM_COHERE_API_KEY: 'synthetic-cohere-key',
        LLM_COHERE_MODEL: 'synthetic-cohere-model',
        LLM_COHERE_MAX_CALLS: '3',
      }),
    ).toThrow('Cohere trial');
  });

  it('bounds individual attempts by the existing total deadline', () => {
    expect(
      loadConfig({ ...fallbackEnvironment, LLM_TIMEOUT_MS: '1200' }).llmFallback,
    ).toMatchObject({ providers: [{ timeoutMs: 1200 }] });
    expect(() =>
      loadConfig({
        ...fallbackEnvironment,
        LLM_TIMEOUT_MS: '1200',
        LLM_FALLBACK_ATTEMPT_TIMEOUT_MS: '1201',
      }),
    ).toThrow('LLM_TIMEOUT_MS');
  });

  it.each([
    ['LLM_FALLBACK_ENABLED', 'yes'],
    ['LLM_FALLBACK_MAX_ATTEMPTS_PER_TURN', '7'],
    ['LLM_FALLBACK_ATTEMPT_TIMEOUT_MS', '0'],
    ['LLM_FALLBACK_COOLDOWN_MS', '0'],
    ['LLM_OPENROUTER_MAX_CALLS', '0'],
    ['LLM_OPENROUTER_WINDOW_MS', '999'],
  ])('rejects an invalid %s without echoing its value', (field, value) => {
    expect(() => loadConfig({ ...fallbackEnvironment, [field]: value })).toThrow(field);
  });

  it('rejects cooldown bounds that cannot contain the configured cooldown', () => {
    expect(() =>
      loadConfig({
        ...fallbackEnvironment,
        LLM_FALLBACK_COOLDOWN_MS: '60000',
        LLM_FALLBACK_MAX_COOLDOWN_MS: '59999',
      }),
    ).toThrow('LLM_FALLBACK_MAX_COOLDOWN_MS');
  });

  it('documents and forwards every new field in the Compose application environment', () => {
    const compose = readRepositoryComposeEnvironment();
    const example = readFileSync('.env.example', 'utf8');
    for (const field of LLM_FALLBACK_ENV_NAMES) {
      expect(compose[field]).toContain(`\${${field}:-`);
      expect(example).toMatch(new RegExp(`^(?:# )?${field}=`, 'm'));
    }
  });
});
