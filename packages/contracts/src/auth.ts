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
      'Redirecionamento do fluxo Google OIDC; retorno somente à origem configurada, cookies HttpOnly e nenhum token no frontend.',
  },
  ...standardErrors,
};
export const authOpenApiPaths = {
  '/api/v1/auth/login/google': {
    get: {
      summary: 'Iniciar login Google OIDC exclusivo do administrador (quando habilitado)',
      parameters: [
        {
          in: 'query',
          name: 'returnTo',
          required: false,
          description:
            'Caminho relativo iniciado por uma única barra, com query/hash opcionais; máximo de 1024 bytes UTF-8. Resolvido exclusivamente na origem de AUTH_FRONTEND_URL e vinculado à transação do navegador. URLs absolutas, externas, //, barras invertidas e variantes inseguras são recusadas. Omitido: retorno fixo AUTH_FRONTEND_URL.',
          schema: { type: 'string', maxLength: 1024, pattern: '^/(?!/)' },
          example: '/portfolio?section=projetos#contato',
        },
      ],
      responses: redirect,
    },
  },
  '/api/v1/auth/callback/google': {
    get: {
      summary: 'Callback Google com PKCE/state/nonce e admissão exclusiva do administrador',
      parameters: [
        { in: 'query', name: 'state', required: true, schema: { type: 'string' } },
        {
          in: 'query',
          name: 'code',
          required: false,
          description:
            'Código Google obrigatório no sucesso; ausente quando o provedor recusa o login.',
          schema: { type: 'string' },
        },
        {
          in: 'query',
          name: 'error',
          required: false,
          description:
            'Recusa do provedor, mapeada a código público fixo sem refletir o valor recebido.',
          schema: { type: 'string' },
        },
      ],
      responses: {
        ...redirect,
        303: {
          description:
            'Navegação HTML: falha após validar state e transação do navegador retorna ao destino confiável com auth_error público. Sem estado válido/replay não há redirecionamento. Accept application/json preserva status HTTP/JSON.',
          headers: {
            Location: {
              description:
                'Destino vinculado ao login na origem de AUTH_FRONTEND_URL, com path/query/hash preservados e auth_error contendo somente AUTH_ADMIN_ONLY, AUTH_REQUIRED, AUTH_LOGIN_FAILED, AUTH_PROVIDER_UNAVAILABLE ou AUTH_UNAVAILABLE; sem código OAuth, tokens, e-mail ou mensagem interna.',
              schema: { type: 'string', format: 'uri' },
            },
          },
        },
        403: {
          ...standardErrors[403],
          description:
            'JSON/API: AUTH_ADMIN_ONLY para conta Google verificada fora da política administrativa ou papel revogado. Sem cadastro ou sessão. Navegação HTML retorna 303 após validar a transação. Acesso negado. Apenas o administrador tem acesso.',
        },
      },
    },
  },
  '/api/v1/auth/session': {
    get: {
      summary:
        'Sessão administrativa do navegador e CSRF; contas não admitidas retornam estado anônimo',
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
