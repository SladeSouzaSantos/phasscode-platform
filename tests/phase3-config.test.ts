import { describe, expect, it } from 'vitest';
import { loadConfig } from '../packages/shared-config/src/index.js';
import { loadAuthConfig } from '../packages/shared-config/src/auth.js';

const authEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  PERSISTENCE: 'postgres',
  DATABASE_URL: 'postgresql://synthetic:synthetic@localhost/synthetic',
  REDIS_URL: 'redis://localhost:6379/1',
  AUTH_ENABLED: 'true',
  AUTH_ADMIN_EMAIL: 'admin@example.test',
  AUTH_PUBLIC_URL: 'https://api.example.test',
  AUTH_FRONTEND_URL: 'https://portfolio.example.test/login-complete',
  AUTH_GOOGLE_CLIENT_ID: 'synthetic-client',
  AUTH_GOOGLE_CLIENT_SECRET: 'synthetic-secret',
  AUTH_JWT_KEY_ID: 'synthetic-key',
  AUTH_JWT_PRIVATE_KEY: 'synthetic-key-placeholder-'.repeat(5),
};

describe('administrator authentication configuration', () => {
  it.each([undefined, '', '   ', 'not-an-email', 'admin@example.test,other@example.test'])(
    'requires one valid explicit admin email when authentication is enabled: %s',
    (value) => {
      const env = { ...authEnvironment };
      if (value === undefined) delete env.AUTH_ADMIN_EMAIL;
      else env.AUTH_ADMIN_EMAIL = value;
      expect(() => loadAuthConfig(env)).toThrow('AUTH_ADMIN_EMAIL');
    },
  );

  it('normalizes surrounding whitespace and case without Gmail-specific rewriting', () => {
    const config = loadAuthConfig({
      ...authEnvironment,
      AUTH_ADMIN_EMAIL: '  Admin.Name+Portfolio@Example.Test  ',
    });
    expect(config.enabled && config.AUTH_ADMIN_EMAIL).toBe('admin.name+portfolio@example.test');
  });

  it('does not require an admin email when authentication is disabled', () => {
    expect(loadAuthConfig({ AUTH_ENABLED: 'false' })).toEqual({ enabled: false });
    expect(loadAuthConfig({ AUTH_ADMIN_EMAIL: 'invalid' })).toEqual({ enabled: false });
  });
});

describe('effective CORS policy for authentication', () => {
  it('rejects a frontend outside the default API allowlist when CORS_ORIGINS is omitted', () => {
    expect(() => loadConfig(authEnvironment)).toThrow('CORS_ORIGINS');
  });

  it('accepts the default frontend without a separate CORS override', () => {
    const config = loadConfig({
      ...authEnvironment,
      AUTH_FRONTEND_URL: 'http://localhost:5173/login-complete',
    });
    expect(config.auth.enabled && config.auth.allowedOrigins).toEqual(config.corsOrigins);
    expect(config.corsOrigins).toEqual(['http://localhost:5173']);
  });

  it('uses the same normalized explicit allowlist for CORS and authentication', () => {
    const config = loadConfig({
      ...authEnvironment,
      CORS_ORIGINS: ' https://portfolio.example.test, https://admin.example.test ',
    });
    expect(config.auth.enabled && config.auth.allowedOrigins).toEqual(config.corsOrigins);
    expect(config.corsOrigins).toEqual([
      'https://portfolio.example.test',
      'https://admin.example.test',
    ]);
  });
});
