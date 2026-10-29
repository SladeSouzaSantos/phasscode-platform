import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError } from '../domain/errors.js';
import type { PostgresConversationInsights } from '../adapters/conversation-insights.js';

const querySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).default(25),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});

interface AdminAuth {
  requirePrincipal(
    request: FastifyRequest,
    options?: { admin?: boolean; csrf?: boolean },
  ): Promise<{ userId: string; roles: string[] }>;
}

export function registerConversationInsightsRoutes(
  app: FastifyInstance,
  {
    insights,
    auth,
    retentionDays,
  }: {
    insights: PostgresConversationInsights;
    auth: AdminAuth;
    retentionDays: number;
  },
) {
  app.get('/api/v1/admin/conversations', async (request) => {
    // Authenticate before parsing; the route must never expose visitor insights.
    await auth.requirePrincipal(request, { admin: true });
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success)
      throw new AppError('INVALID_REQUEST', 400, 'Consulta administrativa inválida.');
    return insights.list({ ...parsed.data, retentionDays });
  });
}
