import { describe, expect, it, vi } from 'vitest';
import { buildInternalGraphReader } from '../apps/orbe-node/src/graph-reader/app.js';
import type { EvidenceGraphRepository, EvidenceSource } from '../apps/orbe-node/src/domain/evidence-graph.js';

const token = 'A'.repeat(43);
const publicSource: EvidenceSource = {
  kind: 'source',
  id: 'source-java-public',
  label: 'Java code',
  origin: 'github',
  visibility: 'public',
  verificationStatus: 'code_reviewed',
};
const privateSource: EvidenceSource = {
  ...publicSource,
  id: 'source-private',
  label: 'Private degree document',
  visibility: 'private',
};
const sourceIds = ['source-java-public', 'source-private'];
const evidence: EvidenceGraphRepository = {
  findEvidence: vi.fn(async () => [
    {
      requirementId: 'java',
      claims: [
        {
          kind: 'claim' as const,
          id: 'claim-java-public',
          label: 'Java confirmed',
          subjectId: 'candidate',
          predicate: 'USES_TECHNOLOGY' as const,
          objectId: 'skill-java',
          scope: 'professional' as const,
          sourceIds: [publicSource.id],
        },
        {
          kind: 'claim' as const,
          id: 'claim-java-mixed',
          label: 'Unpublishable Java claim',
          subjectId: 'candidate',
          predicate: 'USES_TECHNOLOGY' as const,
          objectId: 'skill-java',
          scope: 'study' as const,
          sourceIds,
        },
      ],
      sources: [publicSource, privateSource],
    },
  ]),
  getSource: vi.fn(async (id: string) =>
    [publicSource, privateSource].find((source) => source.id === id),
  ),
};
const payload = {
  requirements: [
    { kind: 'vacancy_requirement', id: 'java', label: 'Java', mandatory: true },
  ],
};

describe('F3.2 isolated internal HTTP graph-reader', () => {
  it('denies unauthenticated and incorrect-token requests', async () => {
    const app = buildInternalGraphReader({ token, evidence });
    try {
      expect((await app.inject({ method: 'GET', url: '/internal/health' })).statusCode).toBe(401);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/internal/evidence',
            headers: { authorization: 'Bearer ' + 'B'.repeat(43) },
            payload,
          })
        ).statusCode,
      ).toBe(401);
      expect((await app.inject({
        method: 'GET',
        url: '/internal/health',
        headers: { authorization: 'Bearer ' + token },
      })).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('serves only source-complete public evidence without a Neo4j query input', async () => {
    const app = buildInternalGraphReader({ token, evidence });
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/internal/evidence',
        headers: { authorization: 'Bearer ' + token },
        payload,
      });
      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(result.matches[0].claims.map((value: { id: string }) => value.id)).toEqual([
        'claim-java-public',
      ]);
      expect(result.matches[0].sources).toEqual([publicSource]);
      expect(response.body).not.toContain('source-private');
      expect(response.body).not.toContain('Unpublishable Java claim');
      const forbidden = await app.inject({
        method: 'POST',
        url: '/internal/evidence',
        headers: { authorization: 'Bearer ' + token },
        payload: { ...payload, cypher: 'MATCH (n) DETACH DELETE n' },
      });
      expect(forbidden.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('does not disclose private or third-party source details by direct ID', async () => {
    const app = buildInternalGraphReader({ token, evidence });
    try {
      const headers = { authorization: 'Bearer ' + token };
      const privateResponse = await app.inject({
        method: 'POST',
        url: '/internal/source',
        headers,
        payload: { id: 'source-private' },
      });
      expect(privateResponse.statusCode).toBe(200);
      expect(privateResponse.json()).toEqual({ source: null });
      expect(privateResponse.body).not.toContain('Private degree');
      const publicResponse = await app.inject({
        method: 'POST',
        url: '/internal/source',
        headers,
        payload: { id: publicSource.id },
      });
      expect(publicResponse.json()).toEqual({ source: publicSource });
    } finally {
      await app.close();
    }
  });

  it('fails closed when backend fails without leaking internal details', async () => {
    const failing: EvidenceGraphRepository = {
      findEvidence: vi.fn().mockRejectedValue(new Error('password=REDACT_ME')),
      getSource: vi.fn().mockRejectedValue(new Error('password=REDACT_ME')),
    };
    const app = buildInternalGraphReader({ token, evidence: failing });
    try {
      const result = await app.inject({
        method: 'POST',
        url: '/internal/evidence',
        headers: { authorization: 'Bearer ' + token },
        payload,
      });
      expect(result.statusCode).toBe(503);
      expect(result.body).not.toContain('REDACT_ME');
    } finally {
      await app.close();
    }
  });

  it('rejects absent, short and invalid service tokens at initialization', () => {
    for (const value of ['', 'unsafe', 'A'.repeat(43) + '/']) {
      expect(() => buildInternalGraphReader({ token: value, evidence })).toThrow(
        'GRAPH_READER_INVALID_TOKEN',
      );
    }
  });
});
