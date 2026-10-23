import { z } from 'zod';
import { json, standardErrors } from './common.js';

export const authUserSchema = z.strictObject({
  id: z.uuid(),
  email: z.string().nullable(),
  displayName: z.string().max(100),
  roles: z.array(z.enum(['user', 'admin'])),
});
export const authSessionSchema = z.strictObject({
  authenticated: z.boolean(),
  user: authUserSchema.nullable(),
  csrfToken: z.string().min(43).max(43).nullable(),
  expiresAt: z.iso.datetime().nullable(),
});
export type AuthSessionResponse = z.infer<typeof authSessionSchema>;
export const authSecuritySchemes = {
  sessionCookie: {
    type: 'apiKey',
    in: 'cookie',
    name: '__Host-phasscode-session',
    description:
      'Sessão BFF opaca HttpOnly/Secure. Desenvolvimento HTTP local explicitamente habilitado usa phasscode-session.',
  },
  accessJwt: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
};
export const authJwksSchema = z.strictObject({
  keys: z
    .array(
      z.strictObject({
        kty: z.literal('RSA'),
        kid: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
        alg: z.literal('RS256'),
        use: z.literal('sig'),
        n: z.string().min(1),
        e: z.string().min(1),
      }),
    )
    .min(1)
    .max(6),
});
const redirect = {
  302: {
    description:
      'Redirecionamento fixo do fluxo Google OIDC; cookies HttpOnly, sem tokens no JSON/URL do frontend.',
  },
  ...standardErrors,
};
export const authOpenApiPaths = {
  '/api/v1/auth/login/google': {
    get: { summary: 'Iniciar login Google OIDC (quando habilitado)', responses: redirect },
  },
  '/api/v1/auth/callback/google': {
    get: {
      summary: 'Callback Google com PKCE/state/nonce e uso único',
      parameters: [
        { in: 'query', name: 'state', required: true, schema: { type: 'string' } },
        { in: 'query', name: 'code', required: true, schema: { type: 'string' } },
      ],
      responses: redirect,
    },
  },
  '/api/v1/auth/session': {
    get: {
      summary: 'Sessão do navegador e token CSRF; nenhum JWT exposto',
      responses: {
        200: { description: 'Estado da sessão', content: json(authSessionSchema) },
        ...standardErrors,
      },
    },
  },
  '/api/v1/auth/refresh': {
    post: {
      summary: 'Rotacionar sessão (Origin e X-CSRF-Token obrigatórios)',
      security: [{ sessionCookie: [] }],
      parameters: [
        { in: 'header', name: 'X-CSRF-Token', required: true, schema: { type: 'string' } },
      ],
      responses: {
        200: { description: 'Sessão rotacionada', content: json(authSessionSchema) },
        ...standardErrors,
      },
    },
  },
  '/api/v1/auth/logout': {
    post: {
      summary: 'Revogar família de sessão (Origin e X-CSRF-Token obrigatórios)',
      security: [{ sessionCookie: [] }],
      parameters: [
        { in: 'header', name: 'X-CSRF-Token', required: true, schema: { type: 'string' } },
      ],
      responses: { 204: { description: 'Sessão encerrada' }, ...standardErrors },
    },
  },
  '/api/v1/me': {
    get: {
      summary: 'Perfil autenticado',
      security: [{ sessionCookie: [] }, { accessJwt: [] }],
      responses: {
        200: { description: 'Usuário atual', content: json(authUserSchema) },
        ...standardErrors,
      },
    },
  },
  '/.well-known/jwks.json': {
    get: {
      summary: 'Chaves públicas do emissor JWT da PHASSCODE API',
      responses: {
        200: {
          description: 'JWKS RSA público da PHASSCODE; não é o conjunto de chaves do Google.',
          content: json(authJwksSchema),
        },
        ...standardErrors,
      },
    },
  },
};
