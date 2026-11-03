import { describe, expect, it, vi } from 'vitest';
import { GraphReaderHttpRepository } from '../apps/orbe-node/src/adapters/graph-reader-http.js';
import { buildInternalGraphReader } from '../apps/orbe-node/src/graph-reader/app.js';
import { createGroundedRecruiterGraph } from '../apps/orbe-node/src/application/grounded-recruiter-graph.js';
import type {
  EvidenceGraphRepository,
  EvidenceSource,
  VacancyRequirement,
} from '../apps/orbe-node/src/domain/evidence-graph.js';

const token = 'A'.repeat(64);
const publicSource: EvidenceSource = {
  kind: 'source',
  id: 'source-java',
  label: 'Java publicly documented',
  origin: 'github',
  visibility: 'public',
  verificationStatus: 'code_reviewed',
};
const privateSource: EvidenceSource = {
  ...publicSource,
  id: 'source-private',
  label: 'Private academic record',
  visibility: 'private',
};
const requirement: VacancyRequirement = {
  kind: 'vacancy_requirement',
  id: 'java',
  label: 'Java',
  mandatory: true,
};
const claims = [
  {
    kind: 'claim' as const,
    id: 'claim-java-public',
    label: 'Java in professional software',
    subjectId: 'project-java',
    predicate: 'USES_TECHNOLOGY' as const,
    objectId: 'skill-java',
    scope: 'professional_project' as const,
    sourceIds: ['source-java'],
  },
  {
    kind: 'claim' as const,
    id: 'claim-java-private',
    label: 'A private claim must never be served',
    subjectId: 'project-java',
    predicate: 'USES_TECHNOLOGY' as const,
    objectId: 'skill-java',
    scope: 'study' as const,
    sourceIds: ['source-private'],
  },
];
const backend: EvidenceGraphRepository = {
  findEvidence: async (requirements) =>
    requirements.map((entry) => ({
      requirementId: entry.id,
      claims,
      sources: [publicSource, privateSource],
    })),
  getSource: async (id) => [publicSource, privateSource].find((source) => source.id === id),
};

function testTransport(
  app: ReturnType<typeof buildInternalGraphReader>,
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const response = await app.inject({
      method: init?.method ?? 'GET',
      url: new URL(String(input)).pathname,
      ...(init?.headers ? { headers: init.headers as Record<string, string> } : {}),
      ...(init?.body ? { payload: String(init.body) } : {}),
    });
    return new Response(response.body, {
      status: response.statusCode,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
}

describe('F3.2/F3.3 private HTTP evidence client, not wired to public chat', () => {
  it('retrieves only proven public Java claims through the authenticated reader', async () => {
    const server = buildInternalGraphReader({ token, evidence: backend });
    try {
      const repo = new GraphReaderHttpRepository({
        token,
        transport: testTransport(server),
      });
      const matches = await repo.findEvidence([requirement]);
      expect(matches).toHaveLength(1);
      expect(matches[0]?.claims.map((claim) => claim.id)).toEqual(['claim-java-public']);
      expect(matches[0]?.sources).toEqual([publicSource]);
      expect(JSON.stringify(matches)).not.toContain('source-private');
      expect(await repo.getSource(publicSource.id)).toEqual(publicSource);
      expect(await repo.getSource(privateSource.id)).toBeUndefined();
    } finally {
      await server.close();
    }
  });

  it('can feed the offline LangGraph without a Neo4j Bolt credential or extra LLM call', async () => {
    const server = buildInternalGraphReader({ token, evidence: backend });
    try {
      const repo = new GraphReaderHttpRepository({ token, transport: testTransport(server) });
      const graph = createGroundedRecruiterGraph({
        identifyRequirements: () => [requirement],
        evidence: repo,
      });
      const state = await graph.invoke({ question: 'Há experiência com Java?' });
      expect(state.decision).toBe('verified');
      expect(state.answer).toContain('Java in professional software');
      expect(state.answer).not.toContain('private');
    } finally {
      await server.close();
    }
  });

  it('does not disclose credentials or backend errors on 401/503', async () => {
    const server = buildInternalGraphReader({
      token,
      evidence: {
        findEvidence: vi.fn().mockRejectedValue(new Error('Neo4j secret')),
        getSource: vi.fn().mockRejectedValue(new Error('Neo4j secret')),
      },
    });
    try {
      const good = new GraphReaderHttpRepository({ token, transport: testTransport(server) });
      await expect(good.findEvidence([requirement])).rejects.toThrow(
        'GRAPH_HTTP_UNAVAILABLE',
      );
      const wrong = new GraphReaderHttpRepository({
        token: 'B'.repeat(64),
        transport: testTransport(server),
      });
      await expect(wrong.findEvidence([requirement])).rejects.toThrow(
        'GRAPH_HTTP_UNAVAILABLE',
      );
    } finally {
      await server.close();
    }
  });

  it('rejects oversized or malformed responses and never follows redirects', async () => {
    const tooLarge = new GraphReaderHttpRepository({
      token,
      transport: vi.fn(async () => new Response('x'.repeat(530_000), { status: 200 })),
    });
    await expect(tooLarge.findEvidence([requirement])).rejects.toThrow(
      'GRAPH_HTTP_INVALID_RESPONSE',
    );

    const malicious = new GraphReaderHttpRepository({
      token,
      transport: vi.fn(async () =>
        Response.json({
          matches: [
            {
              requirementId: 'java',
              claims: [claims[0]],
              sources: [privateSource],
            },
          ],
        }),
      ),
    });
    await expect(malicious.findEvidence([requirement])).rejects.toThrow(
      'GRAPH_HTTP_INVALID_RESPONSE',
    );

    const observed = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ matches: [{ requirementId: 'java', claims: [], sources: [] }] }),
    );
    const valid = new GraphReaderHttpRepository({ token, transport: observed });
    await valid.findEvidence([requirement]);
    expect(observed.mock.calls[0]?.[0]).toBe('http://graph-reader:8765/internal/evidence');
    expect(observed.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      redirect: 'error',
    });
  });

  it('keeps arbitrary requirement counts without a small fixed cap', async () => {
    const server = buildInternalGraphReader({ token, evidence: backend });
    try {
      const reader = new GraphReaderHttpRepository({ token, transport: testTransport(server) });
      const many = Array.from({ length: 33 }, (_, index) => ({
        ...requirement,
        id: `req-${index}`,
      }));
      const matches = await reader.findEvidence(many);
      expect(matches).toHaveLength(33);
      expect(matches[32]?.requirementId).toBe('req-32');
    } finally {
      await server.close();
    }
  });
});
