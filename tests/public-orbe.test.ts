import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { testApp } from './helpers.js';

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('public professional Orbe runtime', () => {
  it('exposes only chat, public OpenAPI and health checks', async () => {
    const app = await testApp({ publicOnly: true });
    apps.push(app);
    const spec = (await app.inject('/api/v1/openapi.json')).json<{
      paths: Record<string, unknown>;
      components: { securitySchemes: Record<string, unknown> };
    }>();
    expect(Object.keys(spec.paths).sort()).toEqual([
      '/api/v1/chat',
      '/api/v1/chat/report-optout',
      '/api/v1/openapi.json',
      '/health',
      '/ready',
    ]);
    expect(spec.components.securitySchemes).toEqual({});
    for (const url of [
      '/docs/',
      '/api/v1/auth/session',
      '/api/v1/admin/meetings',
      '/api/v1/meetings/availability',
      '/.well-known/jwks.json',
    ]) {
      expect((await app.inject(url)).statusCode, url).toBe(404);
    }
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/chat',
      payload: { message: 'Quais são os projetos de Pedro em React?' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveProperty('answer');
    const optout = await app.inject({
      method: 'POST',
      url: '/api/v1/chat/report-optout',
      payload: { conversationId: response.json().conversationId },
    });
    expect(optout.statusCode).toBe(400);
  });
});
