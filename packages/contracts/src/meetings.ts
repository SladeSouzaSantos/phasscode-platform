import { z } from 'zod';
import { json } from './common.js';

export const meetingStatusSchema = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CONFIRMED',
  'CANCELLED',
  'FAILED',
]);
const instant = z.iso.datetime({ offset: true });
export const meetingProposalInputSchema = z.strictObject({
  start: instant,
  name: z.string().trim().min(2).max(120),
  email: z.email().max(254),
  topic: z.string().trim().min(3).max(1000),
});
export const meetingSummarySchema = meetingProposalInputSchema.extend({
  end: instant,
  timeZone: z.string(),
});
export const meetingProposalResponseSchema = z.strictObject({
  proposalId: z.uuid(),
  confirmationToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  expiresAt: instant,
  summary: meetingSummarySchema,
  consentVersion: z.string().min(1),
  simulated: z.boolean(),
});
export const meetingRequestInputSchema = z.strictObject({
  proposalId: z.uuid(),
  confirmationToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  consent: z.literal(true),
  consentVersion: z.string().min(1).max(80),
});
export const meetingStatusResponseSchema = z.strictObject({
  id: z.uuid(),
  status: meetingStatusSchema,
  start: instant,
  end: instant,
  timeZone: z.string(),
  updatedAt: instant,
});
export const meetingRequestResponseSchema = meetingStatusResponseSchema.extend({
  meetingToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
export const meetingAvailabilityQuerySchema = z.strictObject({ from: instant, to: instant });
export const meetingAvailabilityResponseSchema = z.strictObject({
  timeZone: z.string(),
  durationMinutes: z.number().int(),
  simulated: z.boolean(),
  slots: z.array(z.strictObject({ start: instant, end: instant })).max(1000),
});
export const meetingAdminItemSchema = meetingStatusResponseSchema.extend({
  name: z.string(),
  email: z.email(),
  topic: z.string(),
  createdAt: instant,
  version: z.number().int(),
  failureCode: z.string().nullable(),
});
export const meetingAdminListQuerySchema = z.strictObject({
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: meetingStatusSchema.optional(),
});
export const meetingAdminListResponseSchema = z.strictObject({
  items: z.array(meetingAdminItemSchema).max(100),
  nextCursor: z.string().nullable(),
});
export type MeetingProposalInput = z.infer<typeof meetingProposalInputSchema>;
export type MeetingProposalResponse = z.infer<typeof meetingProposalResponseSchema>;
export type MeetingRequestInput = z.infer<typeof meetingRequestInputSchema>;
export type MeetingStatus = z.infer<typeof meetingStatusSchema>;
export type MeetingStatusResponse = z.infer<typeof meetingStatusResponseSchema>;
export type MeetingRequestResponse = z.infer<typeof meetingRequestResponseSchema>;
export type MeetingAdminItem = z.infer<typeof meetingAdminItemSchema>;
export type MeetingAdminListQuery = z.infer<typeof meetingAdminListQuerySchema>;

const id = { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } };
const body = (schema: z.ZodType) => ({ required: true, content: json(schema) });
export function meetingOpenApiPaths(errors: Record<string, unknown>) {
  const response = (schema: z.ZodType, status = 200) => ({
    [status]: { description: 'Operação concluída.', content: json(schema) },
    ...errors,
  });
  const adminRead = [{ sessionCookie: [] }, { accessJwt: [] }];
  return {
    '/api/v1/meetings/availability': {
      get: {
        summary: 'Horários livres, sem detalhes de compromissos',
        parameters: ['from', 'to'].map((name) => ({
          in: 'query',
          name,
          required: true,
          schema: { type: 'string', format: 'date-time' },
        })),
        responses: response(meetingAvailabilityResponseSchema),
      },
    },
    '/api/v1/meetings/proposals': {
      post: {
        summary: 'Preparar proposta privada; ainda não cria solicitação',
        requestBody: body(meetingProposalInputSchema),
        responses: response(meetingProposalResponseSchema, 201),
      },
    },
    '/api/v1/meetings/requests': {
      post: {
        summary: 'Confirmar proposta com consentimento explícito',
        description:
          'O token da proposta confirma uma única solicitação; retries com a mesma chave e corpo retornam a mesma reunião. O mesmo segredo funciona como token privado de consulta. Não enviar tokens para o modelo.',
        parameters: [
          {
            in: 'header',
            name: 'Idempotency-Key',
            required: true,
            schema: {
              type: 'string',
              minLength: 8,
              maxLength: 128,
              pattern: '^[A-Za-z0-9:_-]{8,128}$',
            },
          },
        ],
        requestBody: body(meetingRequestInputSchema),
        responses: response(meetingRequestResponseSchema, 201),
      },
    },
    '/api/v1/meetings/requests/{id}/status': {
      get: {
        summary: 'Consultar estado com token privado',
        parameters: [
          id,
          {
            in: 'header',
            name: 'X-Meeting-Token',
            required: true,
            schema: { type: 'string', minLength: 43, maxLength: 43 },
          },
        ],
        responses: response(meetingStatusResponseSchema),
      },
    },
    '/api/v1/admin/meetings': {
      get: {
        summary: 'Listar solicitações; exige papel admin',
        description:
          'Aceita cookie de sessão ou access JWT vinculado a sessão ativa no servidor. Exige identidade admitida pela política administrativa e papel admin atual. Esta leitura não exige X-CSRF-Token.',
        security: adminRead,
        parameters: [
          { in: 'query', name: 'cursor', schema: { type: 'string' } },
          { in: 'query', name: 'limit', schema: { type: 'integer', minimum: 1, maximum: 100 } },
          { in: 'query', name: 'status', schema: z.toJSONSchema(meetingStatusSchema) },
        ],
        responses: response(meetingAdminListResponseSchema),
      },
    },
    ...Object.fromEntries(
      ['approve', 'reject', 'cancel'].map((action) => [
        `/api/v1/admin/meetings/{id}/${action}`,
        {
          post: {
            summary: `${action}: operação administrativa auditada`,
            description:
              'Exige cookie de sessão ativo, identidade admitida pela política administrativa, papel admin atual, Origin permitido e X-CSRF-Token correspondente à sessão. Authorization Bearer isolado não autoriza o comando nem substitui cookie, Origin ou CSRF.',
            security: [{ sessionCookie: [] }],
            parameters: [
              id,
              {
                in: 'header',
                name: 'Origin',
                required: true,
                description:
                  'O servidor exige uma origem presente na allowlist configurada. Header controlado pelo navegador; não defini-lo manualmente no fetch. Não é uma credencial de autenticação.',
                schema: { type: 'string', format: 'uri' },
              },
              {
                in: 'header',
                name: 'X-CSRF-Token',
                required: true,
                description:
                  'Token CSRF da sessão por cookie, obtido em GET /api/v1/auth/session. Obrigatório em todo comando, inclusive quando Authorization também está presente.',
                schema: { type: 'string' },
              },
            ],
            responses: response(meetingStatusResponseSchema),
          },
        },
      ]),
    ),
  };
}
