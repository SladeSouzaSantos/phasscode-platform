import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../packages/shared-config/src/index.js';
import { chatResponseSchema } from '../packages/contracts/src/index.js';
import { testApp } from './helpers.js';
import { buildInternalGraphReader } from '../apps/orbe-node/src/graph-reader/app.js';
import { GraphReaderHttpRepository } from '../apps/orbe-node/src/adapters/graph-reader-http.js';
import { projectPpksEvidenceGraph } from '../apps/orbe-node/src/adapters/ppks-evidence-graph.js';
import { createGraphRagShadow } from '../apps/orbe-node/src/application/graph-rag-shadow.js';
import type {
  EvidenceGraphRepository,
  EvidenceSource,
  VacancyRequirement,
} from '../apps/orbe-node/src/domain/evidence-graph.js';
import type { FastifyInstance } from 'fastify';

const apps: FastifyInstance[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

const token = 'A'.repeat(43);
const source: EvidenceSource = {
  kind: 'source',
  id: 'source-fixture-public',
  label: 'Public synthetic Java evidence',
  origin: 'github',
  visibility: 'public',
  verificationStatus: 'code_reviewed',
};
const privateSource: EvidenceSource = {
  ...source,
  id: 'source-private-canary',
  label: 'PRIVATE_SOURCE_NOT_FOR_RECRUITER',
  visibility: 'private',
};

const evidence: EvidenceGraphRepository = {
  async findEvidence(requirements: readonly VacancyRequirement[]) {
    return requirements.map((requirement) => ({
      requirementId: requirement.id,
      claims: [
        {
          kind: 'claim' as const,
          id: 'claim-java-public-fixture',
          label: 'Java no SIGAA (fixture controlado)',
          subjectId: 'experiencia-sig',
          predicate: 'USES_TECHNOLOGY' as const,
          objectId: requirement.id,
          scope: 'professional' as const,
          sourceIds: [source.id],
        },
        {
          kind: 'claim' as const,
          id: 'claim-java-private-fixture',
          label: 'PRIVATE_CLAIM_NOT_FOR_RECRUITER',
          subjectId: 'private-project',
          predicate: 'USES_TECHNOLOGY' as const,
          objectId: requirement.id,
          scope: 'study' as const,
          sourceIds: [privateSource.id],
        },
      ],
      sources: [source, privateSource],
    }));
  },
  async getSource(id) {
    return [source, privateSource].find((item) => item.id === id);
  },
};

const config = (mode: 'off' | 'shadow') =>
  loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    RATE_LIMIT_MAX: '100',
    ORBE_GRAPHRAG_MODE: mode,
    ORBE_GRAPHRAG_STAGE: 'dev',
    ORBE_GRAPHRAG_DEV_APPROVED: 'true',
  });

describe('F3.5 socket-level shadow to internal Graph Reader (no real Neo4j)', () => {
  it('sends an authenticated request to the isolated reader but returns the unchanged PPKS answer', async () => {
    const graph = buildInternalGraphReader({ token, evidence });
    apps.push(graph);
    await graph.listen({ host: '127.0.0.1', port: 0 });
    const graphAddress = graph.server.address();
    if (!graphAddress || typeof graphAddress === 'string') throw new Error('NO_TEST_GRAPH_PORT');
    const graphPort = graphAddress.port;

    const transport = vi.fn<typeof fetch>((input, init) => {
      const url = new URL(String(input));
      expect(url.origin).toBe('http://graph-reader:8765');
      return fetch('http://127.0.0.1:' + graphPort + url.pathname, init);
    });
    const client = new GraphReaderHttpRepository({ token, transport });
    const shadow = createGraphRagShadow(await projectPpksEvidenceGraph(), client);
    const baseline = await testApp({ config: config('off') });
    const staged = await testApp({ config: config('shadow'), graphShadow: shadow });
    apps.push(baseline, staged);

    const question = 'Pedro tem experiência com Java?';
    const audit = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const ask = async (app: FastifyInstance) => {
      const result = await app.inject({
        method: 'POST',
        url: '/api/v1/chat',
        payload: { message: question },
      });
      expect(result.statusCode).toBe(200);
      return chatResponseSchema.parse(result.json());
    };
    const oldAnswer = await ask(baseline);
    const shadowAnswer = await ask(staged);
    expect(shadowAnswer.answer).toBe(oldAnswer.answer);
    expect(shadowAnswer.sources).toEqual(oldAnswer.sources);
    expect(shadowAnswer.meta).toEqual(oldAnswer.meta);
    expect(transport).toHaveBeenCalledOnce();

    const events = audit.mock.calls
      .map(([line]) => String(line))
      .filter((line) => line.includes('"event":"orbe_graphrag_shadow"'));
    expect(events).toHaveLength(1);
    const observation = JSON.parse(events[0]!) as Record<string, unknown>;
    expect(observation).toMatchObject({
      event: 'orbe_graphrag_shadow',
      mode: 'verified_graph',
      matchedRequirements: 1,
      unknownRequirements: 0,
    });
    expect(observation.durationMs).toEqual(expect.any(Number));
    expect(Object.keys(observation).sort()).toEqual(
      [
        'durationMs',
        'event',
        'matchedRequirements',
        'mode',
        'reason',
        'traceId',
        'unknownRequirements',
      ].sort(),
    );
    expect(JSON.stringify(observation)).not.toContain(question);
    expect(JSON.stringify(observation)).not.toContain('PRIVATE_');
    expect(JSON.stringify(observation)).not.toContain(token);
    expect((await staged.inject('/ready')).statusCode).toBe(200);
  });

  it('does not allow unauthenticated localhost access to internal graph routes', async () => {
    const graph = buildInternalGraphReader({ token, evidence });
    apps.push(graph);
    await graph.listen({ host: '127.0.0.1', port: 0 });
    const address = graph.server.address();
    if (!address || typeof address === 'string') throw new Error('NO_TEST_GRAPH_PORT');
    const response = await fetch('http://127.0.0.1:' + address.port + '/internal/evidence', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requirements: [] }),
    });
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain('PRIVATE_');
  });
});
