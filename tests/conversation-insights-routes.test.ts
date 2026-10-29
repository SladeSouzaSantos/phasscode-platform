import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../apps/orbe-node/src/domain/errors.js';
import { registerConversationInsightsRoutes } from '../apps/orbe-node/src/http/conversation-insights-routes.js';
import type { PostgresConversationInsights } from '../apps/orbe-node/src/adapters/conversation-insights.js';

const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('GET admin/conversations', () => {
  function setup(allowAdmin: boolean) {
    const app = Fastify();
    apps.push(app);
    const list = vi.fn(async () => ({
      retentionDays: 7,
      generatedAt: '2026-10-28T19:00:00.000Z',
      totals: { conversations: 1, questions: 2 },
      intents: [{ name: 'technical', total: 1 }],
      topics: [{ name: 'Tecnologias', total: 1 }],
      items: [],
      nextOffset: null,
    }));
    const auth = {
      requirePrincipal: vi.fn(async () => {
        if (!allowAdmin) throw new AppError('AUTH_ADMIN_ONLY', 403, 'Acesso negado.');
        return { userId: 'synthetic-admin', roles: ['admin'] };
      }),
    };
    registerConversationInsightsRoutes(app, {
      insights: { list } as unknown as PostgresConversationInsights,
      auth,
      retentionDays: 7,
    });
    return { app, list, auth };
  }
  it('nega a visitante antes de consultar dados privados', async () => {
    const { app, list } = setup(false);
    const response = await app.inject({ method: 'GET', url: '/api/v1/admin/conversations' });
    expect(response.statusCode).toBe(403);
    expect(list).not.toHaveBeenCalled();
  });
  it('usa escopo de administração e retorna métricas sem mensagens', async () => {
    const { app, list, auth } = setup(true);
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/conversations?limit=10&offset=20',
    });
    expect(response.statusCode).toBe(200);
    expect(auth.requirePrincipal).toHaveBeenCalledWith(expect.anything(), { admin: true });
    expect(list).toHaveBeenCalledWith({ limit: 10, offset: 20, retentionDays: 7 });
    expect(response.json().totals).toEqual({ conversations: 1, questions: 2 });
  });
  it('recusa parâmetros desconhecidos ou paginação excessiva', async () => {
    const { app, list } = setup(true);
    for (const query of ['limit=500', 'offset=-1', 'unexpected=value']) {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/conversations?' + query,
      });
      expect(response.statusCode).toBe(400);
    }
    expect(list).not.toHaveBeenCalled();
  });
});
