import { createHash, timingSafeEqual } from 'node:crypto';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { vacancyRequirementSchema, type EvidenceGraphRepository } from '../domain/evidence-graph.js';
import { PublicGraphEvidenceGateway } from '../application/graph-public-policy.js';

const evidenceRequestSchema = z.strictObject({
  requirements: z.array(vacancyRequirementSchema),
  maxClaimsPerRequirement: z.number().int().min(1).max(20).optional(),
});
const sourceRequestSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(?:[-_.:][a-z0-9]+)*$/),
});

function fingerprint(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

export interface InternalGraphReaderOptions {
  readonly token: string;
  readonly evidence: EvidenceGraphRepository;
}

/**
 * Private read-only HTTP surface. Only an independently isolated process may
 * instantiate this application with privileged Neo4j credentials. It has no
 * arbitrary Cypher endpoint, write endpoint, or database administration route.
 */
export function buildInternalGraphReader(options: InternalGraphReaderOptions) {
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(options.token)) {
    throw new Error('GRAPH_READER_INVALID_TOKEN');
  }
  const expected = fingerprint(options.token);
  const reader = new PublicGraphEvidenceGateway(options.evidence);
  const app = Fastify({
    logger: false,
    trustProxy: false,
    bodyLimit: 65_536,
    requestTimeout: 12_000,
  });
  void app.register(rateLimit, { max: 60, timeWindow: '1 minute' });
  app.addHook('onRequest', async (request, reply) => {
    const raw = request.headers.authorization;
    const supplied = typeof raw === 'string' && raw.startsWith('Bearer ') ? raw.slice(7) : '';
    if (!timingSafeEqual(expected, fingerprint(supplied))) {
      return reply.code(401).send({ error: 'UNAUTHORIZED' });
    }
  });

  app.get('/internal/health', async () => ({ status: 'ready' }));

  app.post('/internal/evidence', async (request, reply) => {
    const parsed = evidenceRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_REQUEST' });
    const { requirements, maxClaimsPerRequirement } = parsed.data;
    if (new Set(requirements.map((value) => value.id)).size !== requirements.length) {
      return reply.code(400).send({ error: 'INVALID_REQUEST' });
    }
    try {
      const matches = await reader.findEvidence(
        requirements,
        maxClaimsPerRequirement === undefined ? {} : { maxClaimsPerRequirement },
      );
      return { matches };
    } catch {
      return reply.code(503).send({ error: 'GRAPH_READER_UNAVAILABLE' });
    }
  });

  app.post('/internal/source', async (request, reply) => {
    const parsed = sourceRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_REQUEST' });
    try {
      const source = await reader.getSource(parsed.data.id);
      return { source: source ?? null };
    } catch {
      return reply.code(503).send({ error: 'GRAPH_READER_UNAVAILABLE' });
    }
  });

  app.setErrorHandler((error, _request, reply) =>
    reply
      .code(error.statusCode === 429 ? 429 : error.statusCode === 413 ? 413 : 503)
      .send({ error: 'GRAPH_READER_UNAVAILABLE' }),
  );
  return app;
}
