import { z } from 'zod';
import { json, standardErrors as errors } from './common.js';
import { meetingProposalResponseSchema } from './meetings.js';
import { meetingOpenApiPaths } from './meetings.js';
import { authOpenApiPaths, authSecuritySchemes } from './auth.js';
export * from './auth.js';
export * from './meetings.js';
export { errorResponseSchema } from './common.js';

export const chatRequestSchema = z.strictObject({
  conversationId: z.uuid().optional(),
  message: z.string().trim().min(1).max(2000),
});
export const sourceSchema = z.strictObject({
  type: z.enum(['profile', 'project', 'service', 'platform']),
  id: z.string().min(1),
  title: z.string().min(1),
  url: z.url().optional(),
});
export const chatResponseSchema = z.strictObject({
  conversationId: z.uuid(),
  conversationToken: z.string().min(43).max(128).optional(),
  answer: z.string().min(1).max(8000),
  sources: z.array(sourceSchema).max(10),
  actions: z
    .array(
      z.strictObject({
        type: z.literal('confirm_meeting_request'),
        proposal: meetingProposalResponseSchema,
      }),
    )
    .max(1)
    .optional(),
  meta: z.strictObject({
    provider: z.enum(['mock', 'openai', 'openai-compatible']),
    simulated: z.boolean(),
    promptVersion: z.string(),
  }),
});
export const healthResponseSchema = z.strictObject({ status: z.literal('ok') });
export const readyResponseSchema = z.strictObject({
  status: z.enum(['ready', 'not_ready']),
  persistence: z.enum(['memory', 'postgres']),
  dependencies: z.record(z.string(), z.enum(['up', 'down', 'disabled'])),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type ProviderName = ChatResponse['meta']['provider'];

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'PHASSCODE Platform',
    version: '0.1.0',
    description:
      'Orbe público, login Google OIDC e reuniões com aprovação administrativa. Recursos opcionais dependem da configuração da implantação. Java é fase posterior.',
  },
  servers: [{ url: 'http://localhost:3000', description: 'Desenvolvimento local' }],
  components: { securitySchemes: authSecuritySchemes },
  paths: {
    ...authOpenApiPaths,
    ...meetingOpenApiPaths(errors),
    '/health': {
      get: {
        summary: 'Liveness do processo',
        responses: { 200: { description: 'Processo ativo', content: json(healthResponseSchema) } },
      },
    },
    '/ready': {
      get: {
        summary: 'Conectividade e migrations das dependências configuradas',
        responses: {
          200: { description: 'Pronto', content: json(readyResponseSchema) },
          503: { description: 'Dependência indisponível', content: json(readyResponseSchema) },
        },
      },
    },
    '/api/v1/chat': {
      post: {
        operationId: 'sendChatMessage',
        summary: 'Mensagem ao Orbe Mágico',
        description:
          'Sem conversationId cria conversa e retorna conversationToken UMA vez. Ao continuar, envie X-Conversation-Token. Token inválido, ausente ou conversa expirada retornam 404. Sem streaming. O campo meta.simulated identifica respostas mock. Máximo HTTP 8192 bytes.',
        parameters: [
          {
            in: 'header',
            name: 'X-Orbe-Capabilities',
            required: false,
            description:
              'meetings-v1 habilita ferramentas e actions de reunião quando configuradas. Sem este header, a resposta preserva o formato legado, sem actions.',
            schema: { type: 'string', enum: ['meetings-v1'] },
          },
          {
            in: 'header',
            name: 'X-Conversation-Token',
            required: false,
            schema: { type: 'string', minLength: 43, maxLength: 128 },
          },
        ],
        requestBody: { required: true, content: json(chatRequestSchema) },
        responses: {
          200: {
            description: 'Resposta fundamentada ou recusa de escopo',
            content: json(chatResponseSchema),
            headers: { 'X-Correlation-Id': { schema: { type: 'string' } } },
          },
          ...errors,
        },
      },
    },
    '/api/v1/admin/conversations': {
      get: {
        operationId: 'listAdminConversationInsights',
        summary: 'Consultar resumos temáticos e intenções heurísticas das conversas do Orbe',
        description:
          'Somente administrador. Sem texto bruto, identificadores de visitantes, email ou tokens. Os totais consideram conversas no intervalo da retenção configurada; só há registros após a migration e ativação do recurso. Contagens atualizadas por mensagem, não por abertura do widget.',
        security: [{ sessionCookie: [] }, { accessJwt: [] }],
        parameters: [
          {
            in: 'query',
            name: 'limit',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 50, default: 25 },
          },
          {
            in: 'query',
            name: 'offset',
            required: false,
            schema: { type: 'integer', minimum: 0, maximum: 10000, default: 0 },
          },
        ],
        responses: {
          200: {
            description:
              'Agregados anônimos e lista paginada; classificação heurística, não verificação da identidade ou intenção real.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    retentionDays: { type: 'integer', minimum: 1 },
                    generatedAt: { type: 'string', format: 'date-time' },
                    totals: {
                      type: 'object',
                      additionalProperties: false,
                      properties: {
                        conversations: { type: 'integer', minimum: 0 },
                        questions: { type: 'integer', minimum: 0 },
                      },
                      required: ['conversations', 'questions'],
                    },
                    intents: {
                      type: 'array',
                      items: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                          name: { type: 'string' },
                          total: { type: 'integer', minimum: 0 },
                        },
                        required: ['name', 'total'],
                      },
                    },
                    topics: {
                      type: 'array',
                      items: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                          name: { type: 'string' },
                          total: { type: 'integer', minimum: 0 },
                        },
                        required: ['name', 'total'],
                      },
                    },
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          intent: {
                            type: 'string',
                            enum: [
                              'unknown',
                              'curiosity',
                              'technical',
                              'opportunity',
                              'business',
                              'meeting',
                            ],
                          },
                          summary: { type: 'string', maxLength: 300 },
                          topics: { type: 'array', items: { type: 'string' } },
                          turns: { type: 'integer', minimum: 1 },
                          createdAt: { type: 'string', format: 'date-time' },
                          updatedAt: { type: 'string', format: 'date-time' },
                        },
                        required: [
                          'id',
                          'intent',
                          'summary',
                          'topics',
                          'turns',
                          'createdAt',
                          'updatedAt',
                        ],
                      },
                    },
                    nextOffset: { type: ['integer', 'null'], minimum: 0 },
                  },
                  required: [
                    'retentionDays',
                    'generatedAt',
                    'totals',
                    'intents',
                    'topics',
                    'items',
                    'nextOffset',
                  ],
                },
              },
            },
          },
          ...errors,
        },
      },
    },
    '/api/v1/openapi.json': {
      get: {
        summary: 'Contrato OpenAPI',
        responses: { 200: { description: 'Documento OpenAPI 3.1' } },
      },
    },
  },
};
