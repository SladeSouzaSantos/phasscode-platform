import { z } from 'zod';

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
  meta: z.strictObject({
    provider: z.enum(['mock', 'openai', 'openai-compatible']),
    simulated: z.boolean(),
    promptVersion: z.string(),
  }),
});
export const errorResponseSchema = z.strictObject({
  error: z.strictObject({
    code: z.string(),
    message: z.string(),
    correlationId: z.string(),
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

const schema = (value: z.ZodType) => z.toJSONSchema(value, { target: 'draft-2020-12' });
const json = (value: z.ZodType) => ({ 'application/json': { schema: schema(value) } });
const errors = Object.fromEntries(
  [400, 403, 404, 409, 413, 415, 429, 500, 502, 503, 504].map((status) => [
    status,
    {
      description: 'Erro padronizado; nenhuma mensagem ou credencial interna.',
      content: json(errorResponseSchema),
    },
  ]),
);
export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'PHASSCODE Platform',
    version: '0.1.0',
    description: 'Fundação e Orbe Node. Agendamento e Java são fases posteriores.',
  },
  servers: [{ url: 'http://localhost:3000', description: 'Desenvolvimento local' }],
  paths: {
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
    '/api/v1/openapi.json': {
      get: {
        summary: 'Contrato OpenAPI',
        responses: { 200: { description: 'Documento OpenAPI 3.1' } },
      },
    },
  },
};
