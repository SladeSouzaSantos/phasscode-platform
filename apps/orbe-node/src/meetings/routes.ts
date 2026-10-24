import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  meetingAdminListQuerySchema,
  meetingAvailabilityQuerySchema,
  meetingProposalInputSchema,
  meetingRequestInputSchema,
} from '../../../../packages/contracts/src/meetings.js';
import { AppError } from '../domain/errors.js';
import type { MeetingService } from './service.js';

export interface MeetingAuth {
  requirePrincipal(
    request: FastifyRequest,
    options?: { admin?: boolean; csrf?: boolean },
  ): Promise<{ userId: string; roles: string[] }>;
}
const valid = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new AppError('INVALID_REQUEST', 400, 'Requisição de agendamento inválida.');
  return parsed.data;
};
const idSchema = z.strictObject({ id: z.uuid() });
export function registerMeetingRoutes(
  app: FastifyInstance,
  { service, auth }: { service: MeetingService; auth: MeetingAuth },
) {
  // Inherits the application's explicit CORS, no-store and sanitized error handler.
  app.get('/api/v1/meetings/availability', async (request) => {
    const query = valid(meetingAvailabilityQuerySchema, request.query);
    return service.availability(query.from, query.to);
  });
  app.post('/api/v1/meetings/proposals', async (request, reply) =>
    reply
      .status(201)
      .send(await service.prepareProposal(valid(meetingProposalInputSchema, request.body))),
  );
  app.post('/api/v1/meetings/requests', async (request, reply) => {
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string')
      throw new AppError('INVALID_REQUEST', 400, 'Idempotency-Key é obrigatório.');
    return reply
      .status(201)
      .send(await service.request(valid(meetingRequestInputSchema, request.body), key));
  });
  app.get('/api/v1/meetings/requests/:id/status', async (request) => {
    const id = valid(idSchema, request.params).id;
    const token = request.headers['x-meeting-token'];
    return service.status(id, typeof token === 'string' ? token : '');
  });
  app.get('/api/v1/admin/meetings', async (request) => {
    await auth.requirePrincipal(request, { admin: true });
    return service.list(valid(meetingAdminListQuerySchema, request.query));
  });
  for (const action of ['approve', 'reject', 'cancel'] as const)
    app.post(`/api/v1/admin/meetings/:id/${action}`, async (request) => {
      const principal = await auth.requirePrincipal(request, { admin: true, csrf: true });
      const id = valid(idSchema, request.params).id;
      // No command accepts caller-controlled status, Calendar IDs, roles or meeting data.
      if (
        request.body !== undefined &&
        request.body !== null &&
        (typeof request.body !== 'object' || Object.keys(request.body).length)
      )
        throw new AppError('INVALID_REQUEST', 400, 'Esta operação não aceita campos adicionais.');
      return service[action](id, principal.userId);
    });
}
