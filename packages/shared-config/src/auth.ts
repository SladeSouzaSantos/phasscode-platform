import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((value) => value === 'true');
const schema = z.object({
  AUTH_ADMIN_EMAIL: z.string().trim().toLowerCase().max(320).pipe(z.email()),
  AUTH_PUBLIC_URL: z.url(),
  AUTH_FRONTEND_URL: z.url(),
  AUTH_GOOGLE_CLIENT_ID: z.string().min(1).max(300),
  AUTH_GOOGLE_CLIENT_SECRET: z.string().min(1).max(1000),
  AUTH_GOOGLE_ISSUER: z.url().default('https://accounts.google.com'),
  AUTH_JWT_ISSUER: z.url().optional(),
  AUTH_JWT_AUDIENCE: z.string().min(1).max(200).default('phasscode-api'),
  AUTH_JWT_KEY_ID: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
  AUTH_JWT_PRIVATE_KEY: z.string().min(100),
  AUTH_JWT_PREVIOUS_JWKS: z.string().default('{"keys":[]}'),
  AUTH_COOKIE_SECURE: bool.default(true),
  AUTH_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
  AUTH_SESSION_TTL_SECONDS: z.coerce.number().int().min(300).max(86400).default(1800),
  AUTH_SESSION_MAX_SECONDS: z.coerce.number().int().min(300).max(604800).default(28800),
  AUTH_HTTP_TIMEOUT_SECONDS: z.coerce.number().int().min(1).max(30).default(5),
});
export type EnabledAuthConfig = z.infer<typeof schema> & {
  enabled: true;
  allowedOrigins: string[];
  callbackUrl: string;
  testIssuer: boolean;
};
export type AuthConfig = { enabled: false } | EnabledAuthConfig;

export function loadAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  if (env.AUTH_ENABLED === undefined || env.AUTH_ENABLED === '' || env.AUTH_ENABLED === 'false')
    return { enabled: false };
  if (env.AUTH_ENABLED !== 'true') throw new Error('AUTH_ENABLED deve ser true ou false.');
  const input = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ''));
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new Error(
      `Configuração de autenticação inválida: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}.`,
    );
  const config = parsed.data;
  if (env.PERSISTENCE !== 'postgres' || !env.DATABASE_URL)
    throw new Error('Autenticação requer PostgreSQL configurado.');
  const publicUrl = new URL(config.AUTH_PUBLIC_URL);
  const frontendUrl = new URL(config.AUTH_FRONTEND_URL);
  const loopback = (url: URL) => ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (publicUrl.origin !== config.AUTH_PUBLIC_URL || publicUrl.username || publicUrl.password)
    throw new Error('AUTH_PUBLIC_URL deve ser uma origem explícita.');
  if (frontendUrl.username || frontendUrl.password || frontendUrl.hash)
    throw new Error('AUTH_FRONTEND_URL inválida.');
  for (const url of [publicUrl, frontendUrl]) {
    if (
      url.protocol !== 'https:' &&
      !(env.NODE_ENV !== 'production' && url.protocol === 'http:' && loopback(url))
    )
      throw new Error(
        'URLs de autenticação exigem HTTPS; HTTP somente no loopback de desenvolvimento.',
      );
  }
  if (
    !config.AUTH_COOKIE_SECURE &&
    (env.NODE_ENV === 'production' || !loopback(publicUrl) || !loopback(frontendUrl))
  )
    throw new Error('Cookie sem Secure somente no loopback de desenvolvimento/testes.');
  if (config.AUTH_JWT_ISSUER) {
    const issuer = new URL(config.AUTH_JWT_ISSUER);
    if (
      issuer.username ||
      issuer.password ||
      issuer.search ||
      issuer.hash ||
      (issuer.protocol !== 'https:' &&
        !(env.NODE_ENV !== 'production' && issuer.protocol === 'http:' && loopback(issuer)))
    )
      throw new Error('AUTH_JWT_ISSUER exige URL segura sem credenciais, query ou fragmento.');
  }
  const googleIssuer = new URL(config.AUTH_GOOGLE_ISSUER);
  const testIssuer =
    env.NODE_ENV === 'test' && googleIssuer.protocol === 'http:' && loopback(googleIssuer);
  if (config.AUTH_GOOGLE_ISSUER !== 'https://accounts.google.com' && !testIssuer)
    throw new Error('O único provedor habilitado é Google OIDC.');
  if (
    config.AUTH_ACCESS_TTL_SECONDS > config.AUTH_SESSION_TTL_SECONDS ||
    config.AUTH_SESSION_TTL_SECONDS > config.AUTH_SESSION_MAX_SECONDS
  )
    throw new Error('Tempos de acesso/sessão incompatíveis.');
  const allowedOrigins = (env.CORS_ORIGINS ?? frontendUrl.origin)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (
    !allowedOrigins.includes(frontendUrl.origin) ||
    allowedOrigins.some((value) => {
      try {
        return new URL(value).origin !== value;
      } catch {
        return true;
      }
    })
  )
    throw new Error('A origem do frontend deve estar explicitamente autorizada em CORS_ORIGINS.');
  return {
    ...config,
    enabled: true,
    allowedOrigins,
    callbackUrl: `${publicUrl.origin}/api/v1/auth/callback/google`,
    testIssuer,
  };
}
