import { afterEach, describe, expect, it, vi } from 'vitest';
import net from 'node:net';
import tls from 'node:tls';
import {
  inspectPhase3Environment,
  readRepositoryComposeEnvironment,
  runPhase3Preflight,
} from '../scripts/phase3-preflight.js';

const environment = (): NodeJS.ProcessEnv => ({
  NODE_ENV: 'test',
  PERSISTENCE: 'postgres',
  DATABASE_URL: 'postgresql://offline:private-database-canary@localhost/offline',
  REDIS_URL: 'redis://:private-redis-canary@localhost:6379/1',
  AUTH_ENABLED: 'true',
  AUTH_ADMIN_EMAIL: 'private-admin-canary@example.test',
  AUTH_PUBLIC_URL: 'https://api.example.test',
  AUTH_FRONTEND_URL: 'https://portfolio.example.test/login-complete',
  CORS_ORIGINS: 'https://portfolio.example.test',
  AUTH_GOOGLE_CLIENT_ID: 'private-login-id-canary',
  AUTH_GOOGLE_CLIENT_SECRET: 'private-login-secret-canary',
  AUTH_JWT_KEY_ID: 'offline-key',
  AUTH_JWT_PRIVATE_KEY: 'private-signing-canary-'.repeat(8),
  MEETINGS_ENABLED: 'true',
  MEETINGS_TIMEZONE: 'America/Fortaleza',
  MEETINGS_WORKDAYS: '1,2,3,4,5,6',
  MEETINGS_WORK_START: '09:00',
  MEETINGS_WORK_END: '18:00',
  MEETINGS_DURATION_MINUTES: '30',
  MEETINGS_MIN_NOTICE_MINUTES: '1440',
  MEETINGS_BUFFER_MINUTES: '15',
  MEETINGS_MAX_HORIZON_DAYS: '60',
  GOOGLE_CALENDAR_MODE: 'google',
  GOOGLE_CALENDAR_ID: 'private-calendar-canary',
  GOOGLE_CALENDAR_CLIENT_ID: 'private-calendar-client-canary',
  GOOGLE_CALENDAR_CLIENT_SECRET: 'private-calendar-secret-canary',
  GOOGLE_CALENDAR_REFRESH_TOKEN: 'private-refresh-canary',
  WORKER_ENABLED: 'true',
  NOTIFICATION_MODE: 'real',
  SMTP_HOST: 'private-smtp-canary.example.test',
  SMTP_FROM: 'private-recipient-canary@example.test',
  SMTP_USER: 'private-smtp-user-canary',
  SMTP_PASSWORD: 'private-smtp-password-canary',
  TELEGRAM_BOT_TOKEN: 'private-bot-canary',
  TELEGRAM_CHAT_ID: 'private-chat-canary',
});
afterEach(() => vi.restoreAllMocks());

describe('preflight offline da Fase 3', () => {
  it('confere configuração completa sem homologar, conectar ou chamar provedores', () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('NETWORK_FORBIDDEN'));
    const socket = vi.spyOn(net.Socket.prototype, 'connect').mockImplementation(() => {
      throw new Error('NETWORK_FORBIDDEN');
    });
    const secureSocket = vi.spyOn(tls, 'connect').mockImplementation(() => {
      throw new Error('NETWORK_FORBIDDEN');
    });
    const loadEnv = vi.spyOn(process, 'loadEnvFile').mockImplementation(() => {
      throw new Error('ENV_READ_FORBIDDEN');
    });
    const env = environment();
    const original = { ...env };
    const report = inspectPhase3Environment(env);
    expect(report).toMatchObject({
      exitCode: 0,
      status: 'configured_offline',
      effects: 'none',
      externalHomologation: 'not_performed',
      target: 'host',
      issues: [],
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(socket).not.toHaveBeenCalled();
    expect(secureSocket).not.toHaveBeenCalled();
    expect(loadEnv).not.toHaveBeenCalled();
    expect(env).toEqual(original);
  });
  it('lista campos e recursos faltantes sem tratar a configuração padrão como homologada', () => {
    const result = inspectPhase3Environment({});
    expect(result.exitCode).toBe(2);
    expect(result.features.auth).toBe('disabled');
    expect(
      result.issues.some((issue) => issue.variables.includes('AUTH_GOOGLE_CLIENT_SECRET')),
    ).toBe(true);
    expect(result.issues.some((issue) => issue.variables.includes('REDIS_URL'))).toBe(true);
    expect(result.issues.some((issue) => issue.code === 'CONFIGURE_AT_LEAST_ONE_CHANNEL')).toBe(
      true,
    );
  });
  it.each([
    'AUTH_ADMIN_EMAIL',
    'AUTH_GOOGLE_CLIENT_SECRET',
    'GOOGLE_CALENDAR_REFRESH_TOKEN',
    'DATABASE_URL',
    'REDIS_URL',
  ])('classifica ausência de %s como incompleta, não como valor inválido', (name) => {
    const env = environment();
    delete env[name];
    const result = inspectPhase3Environment(env);
    expect(result.issues.filter((issue) => issue.severity === 'invalid')).toEqual([]);
    expect(result.exitCode).toBe(2);
    expect(result.issues.some((issue) => issue.variables.includes(name))).toBe(true);
  });
  it('aceita SMTP ou Telegram completos sem exigir os dois', () => {
    const smtp = environment();
    delete smtp.TELEGRAM_BOT_TOKEN;
    delete smtp.TELEGRAM_CHAT_ID;
    expect(inspectPhase3Environment(smtp).exitCode).toBe(0);
    const telegram = environment();
    for (const name of ['SMTP_HOST', 'SMTP_FROM', 'SMTP_USER', 'SMTP_PASSWORD'])
      delete telegram[name];
    expect(inspectPhase3Environment(telegram).exitCode).toBe(0);
    delete telegram.TELEGRAM_CHAT_ID;
    const incomplete = inspectPhase3Environment(telegram);
    expect(incomplete.exitCode).toBe(2);
    expect(incomplete.issues.some((issue) => issue.variables.includes('TELEGRAM_CHAT_ID'))).toBe(
      true,
    );
  });
  it.each([
    'AUTH_ENABLED',
    'AUTH_ADMIN_EMAIL',
    'GOOGLE_CALENDAR_MODE',
    'OUTBOX_LEASE_MS',
    'MEETINGS_TIMEZONE',
    'AUTH_COOKIE_SECURE',
  ])('rejeita valor inválido em %s sem devolvê-lo', (name) => {
    const env = { ...environment(), [name]: 'DO_NOT_PRINT_PRIVATE_BAD_VALUE' };
    const result = runPhase3Preflight(['--json'], env);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain(name);
    expect(result.output).not.toContain('DO_NOT_PRINT_PRIVATE_BAD_VALUE');
  });
  it('detecta CORS divergente, TTL incompatível e lease insuficiente pelos loaders', () => {
    const cors = inspectPhase3Environment({
      ...environment(),
      CORS_ORIGINS: 'https://elsewhere.example.test',
    });
    expect(cors.exitCode).toBe(1);
    expect(cors.issues.some((issue) => issue.variables.includes('CORS_ORIGINS'))).toBe(true);
    expect(
      inspectPhase3Environment({
        ...environment(),
        AUTH_ACCESS_TTL_SECONDS: '900',
        AUTH_SESSION_TTL_SECONDS: '300',
      }).exitCode,
    ).toBe(1);
    const lease = inspectPhase3Environment({
      ...environment(),
      MEETINGS_CALENDAR_LEASE_SECONDS: '60',
      GOOGLE_CALENDAR_HTTP_TIMEOUT_MS: '30000',
    });
    expect(lease.exitCode).toBe(1);
    expect(
      lease.issues.some((issue) => issue.variables.includes('MEETINGS_CALENDAR_LEASE_SECONDS')),
    ).toBe(true);
  });
  it('separa simuladores de provedores reais e recusa fake em produção', () => {
    const fake = { ...environment(), GOOGLE_CALENDAR_MODE: 'fake', NOTIFICATION_MODE: 'fake' };
    expect(inspectPhase3Environment(fake).exitCode).toBe(2);
    expect(inspectPhase3Environment({ ...fake, NODE_ENV: 'production' }).exitCode).toBe(1);
  });
  it('respeita o orçamento e a privacidade do provedor de LLM sem fazer chamadas', () => {
    const env = {
      ...environment(),
      LLM_PROVIDER: 'openai',
      LLM_API_KEY: 'private-llm-canary',
      LLM_MODEL: 'synthetic',
    };
    expect(inspectPhase3Environment(env).exitCode).toBe(2);
    expect(inspectPhase3Environment({ ...env, LLM_GLOBAL_MAX_CALLS: '10' }).exitCode).toBe(0);
    expect(
      inspectPhase3Environment({ ...env, LLM_GLOBAL_MAX_CALLS: '10', LANGCHAIN_VERBOSE: 'true' })
        .exitCode,
    ).toBe(1);
  });
  it('não inclui valores, tokens, URLs, chave ou erros brutos no texto nem no JSON', () => {
    const env = environment();
    env.AUTH_PUBLIC_URL = 'https://private-url-canary.example.test/invalid-path';
    for (const args of [[], ['--json']]) {
      const result = runPhase3Preflight(args, env);
      expect(result.exitCode).toBe(1);
      for (const value of Object.values(env).filter((value) => value?.includes('private-')))
        expect(result.output).not.toContain(value);
      expect(result.output).not.toContain('Error:');
      expect(result.output).not.toContain('https://');
    }
  });
  it('reconhece fallback real com configuração legada mock sem exigir credenciais legadas', () => {
    const env = {
      ...environment(),
      LLM_PROVIDER: 'mock',
      LLM_FALLBACK_ENABLED: 'true',
      LLM_GLOBAL_MAX_CALLS: '40',
      LLM_OPENROUTER_API_KEY: 'private-fallback-key-canary',
      LLM_OPENROUTER_MODEL: 'synthetic/model:free',
      LLM_OPENROUTER_MAX_CALLS: '10',
    };
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('NETWORK_FORBIDDEN'));
    expect(inspectPhase3Environment(env).exitCode).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    const missing = { ...env, LLM_OPENROUTER_MODEL: '' };
    const result = runPhase3Preflight(['--json'], missing);
    expect(result.exitCode).toBe(2);
    expect(result.output).toContain('LLM_OPENROUTER_MODEL');
    expect(result.output).not.toContain('private-fallback-key-canary');
    expect(result.output).not.toContain('LLM_API_KEY');
    expect(inspectPhase3Environment({ ...env, LLM_GLOBAL_MAX_CALLS: '' }).exitCode).toBe(2);
  });
  it('identifica ausência de candidatos e falhas de política gratuita sem valores privados', () => {
    const absent = inspectPhase3Environment({
      ...environment(),
      LLM_FALLBACK_ENABLED: 'true',
      LLM_GLOBAL_MAX_CALLS: '40',
    });
    expect(absent.exitCode).toBe(2);
    expect(absent.issues.some((issue) => issue.code === 'FALLBACK_PROVIDER_REQUIRED')).toBe(true);
    const paid = runPhase3Preflight(['--json'], {
      ...environment(),
      LLM_FALLBACK_ENABLED: 'true',
      LLM_GLOBAL_MAX_CALLS: '40',
      LLM_OPENROUTER_API_KEY: 'private-fallback-key-canary',
      LLM_OPENROUTER_MODEL: 'private-paid-model-canary',
      LLM_OPENROUTER_MAX_CALLS: '10',
    });
    expect(paid.exitCode).toBe(1);
    expect(paid.output).toContain('LLM_OPENROUTER_MODEL');
    expect(paid.output).not.toContain('private-paid-model-canary');
    const cohere = inspectPhase3Environment({
      ...environment(),
      NODE_ENV: 'production',
      LLM_FALLBACK_ENABLED: 'true',
      LLM_GLOBAL_MAX_CALLS: '40',
      LLM_COHERE_API_KEY: 'private-fallback-key-canary',
      LLM_COHERE_MODEL: 'synthetic-cohere-model',
      LLM_COHERE_MAX_CALLS: '10',
    });
    expect(cohere.exitCode).toBe(1);
    expect(cohere.issues.some((issue) => issue.variables.includes('LLM_COHERE_API_KEY'))).toBe(
      true,
    );
  });
  it('avalia a restrição Cohere pelo ambiente efetivo do Compose e não pelo host', () => {
    const env = {
      ...environment(),
      NODE_ENV: 'development',
      PHASSCODE_NODE_ENV: 'production',
      POSTGRES_PASSWORD: 'private-postgres-canary',
      LLM_FALLBACK_ENABLED: 'true',
      LLM_GLOBAL_MAX_CALLS: '40',
      LLM_COHERE_API_KEY: 'private-fallback-key-canary',
      LLM_COHERE_MODEL: 'synthetic-cohere-model',
      LLM_COHERE_MAX_CALLS: '10',
    };
    expect(inspectPhase3Environment(env).exitCode).toBe(0);
    const result = inspectPhase3Environment(env, {
      target: 'compose',
      composeEnvironment: readRepositoryComposeEnvironment(),
    });
    expect(result.exitCode).toBe(1);
    expect(result.issues.some((issue) => issue.variables.includes('LLM_COHERE_API_KEY'))).toBe(
      true,
    );
    expect(JSON.stringify(result)).not.toContain('private-fallback-key-canary');
  });
  it('modela URLs injetadas pelo Compose sem exigir URLs do host e preserva o input', () => {
    const env: NodeJS.ProcessEnv = {
      ...environment(),
      PHASSCODE_NODE_ENV: 'test',
      POSTGRES_PASSWORD: 'private-postgres-canary',
    };
    delete env.DATABASE_URL;
    delete env.REDIS_URL;
    const original = { ...env };
    expect(inspectPhase3Environment(env).exitCode).toBe(2);
    const composeEnvironment = readRepositoryComposeEnvironment();
    const report = inspectPhase3Environment(env, { target: 'compose', composeEnvironment });
    expect(report).toMatchObject({
      exitCode: 0,
      target: 'compose',
      scope: 'repository_compose_model',
    });
    expect(JSON.stringify(report)).not.toContain('private-postgres-canary');
    expect(JSON.stringify(report)).not.toContain('postgresql://');
    expect(env).toEqual(original);
    delete env.POSTGRES_PASSWORD;
    expect(inspectPhase3Environment(env, { target: 'compose', composeEnvironment }).exitCode).toBe(
      2,
    );
  });
  it('usa PHASSCODE_NODE_ENV do Compose e ignora NODE_ENV do host nesse modelo', () => {
    const env = {
      ...environment(),
      NODE_ENV: 'test',
      POSTGRES_PASSWORD: 'synthetic',
      GOOGLE_CALENDAR_MODE: 'fake',
      NOTIFICATION_MODE: 'fake',
    };
    const composeEnvironment = readRepositoryComposeEnvironment();
    expect(inspectPhase3Environment(env, { target: 'compose', composeEnvironment }).exitCode).toBe(
      1,
    );
    expect(
      inspectPhase3Environment(
        { ...env, PHASSCODE_NODE_ENV: 'test' },
        { target: 'compose', composeEnvironment },
      ).exitCode,
    ).toBe(2);
  });
  it('não acessa template em modo host e mantém erros de opções/template sanitizados', () => {
    const template = vi.fn(() => {
      throw new Error('private-template-error-canary');
    });
    expect(runPhase3Preflight(['--json'], environment(), template).exitCode).toBe(0);
    expect(template).not.toHaveBeenCalled();
    expect(
      runPhase3Preflight(['--target=private-argument-canary'], environment(), template),
    ).toMatchObject({ exitCode: 1 });
    const failure = runPhase3Preflight(['--target=compose'], environment(), template);
    expect(failure.exitCode).toBe(1);
    expect(failure.output).not.toContain('private-template-error-canary');
    expect(runPhase3Preflight(['--help'], {}, template).output).toContain('Sem rede');
    expect(runPhase3Preflight(['--target=host', '--target=compose'], {}, template).exitCode).toBe(
      1,
    );
  });
  it('falha fechado para interpolação Compose não suportada, sem mostrar o template', () => {
    for (const value of [
      '${PRIVATE:+private-template-canary}',
      '${PRIVATE:-${NESTED}}',
      '$${PRIVATE}',
    ]) {
      const result = runPhase3Preflight(['--target=compose', '--json'], environment(), () => ({
        ...readRepositoryComposeEnvironment(),
        AUTH_GOOGLE_CLIENT_SECRET: value,
      }));
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('PREFLIGHT_INTERNAL_ERROR');
      expect(result.output).not.toContain(value);
    }
  });
});
