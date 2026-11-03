import { describe, expect, it, vi } from 'vitest';
import {
  PublicGraphEvidenceGateway,
  assertPublicOrbeGraphIsolation,
} from '../apps/orbe-node/src/application/graph-public-policy.js';
import type {
  EvidenceGraphMatch,
  EvidenceGraphRepository,
  EvidenceSource,
  VacancyRequirement,
} from '../apps/orbe-node/src/domain/evidence-graph.js';

const publicSource: EvidenceSource = {
  kind: 'source',
  id: 'source-public',
  label: 'Public repository',
  origin: 'github',
  visibility: 'public',
  verificationStatus: 'code_reviewed',
};
const privateSource: EvidenceSource = {
  ...publicSource,
  id: 'source-private',
  label: 'Private academic document',
  origin: 'academic_record',
  visibility: 'private',
};
const thirdPartySource: EvidenceSource = {
  ...publicSource,
  id: 'source-third-party',
  visibility: 'third_party',
};
const requirement = (id: string): VacancyRequirement => ({
  kind: 'vacancy_requirement',
  id,
  label: 'Java',
  mandatory: true,
});
const claim = (id: string, sourceIds: string[]) => ({
  kind: 'claim' as const,
  id,
  label: 'Java experience',
  subjectId: 'candidate',
  predicate: 'USES_TECHNOLOGY' as const,
  objectId: 'skill-java',
  scope: 'professional' as const,
  sourceIds,
});
const upstream = (matches: EvidenceGraphMatch[]): EvidenceGraphRepository => ({
  findEvidence: vi.fn().mockResolvedValue(matches),
  getSource: vi.fn(async (id: string) =>
    [publicSource, privateSource, thirdPartySource].find((source) => source.id === id),
  ),
});

describe('F3.2: deny-by-default public graph evidence boundary', () => {
  it('excludes claims with private or third-party sources without leaking their labels', async () => {
    const reader = new PublicGraphEvidenceGateway(
      upstream([
        {
          requirementId: 'java',
          claims: [
            claim('public-only', ['source-public']),
            claim('private-only', ['source-private']),
            claim('mixed', ['source-public', 'source-private']),
            claim('third-party', ['source-third-party']),
          ],
          sources: [publicSource, privateSource, thirdPartySource],
        },
      ]),
    );
    const result = await reader.findEvidence([requirement('java')]);
    expect(result[0]?.claims.map((item) => item.id)).toEqual(['public-only']);
    expect(result[0]?.sources).toEqual([publicSource]);
    expect(JSON.stringify(result)).not.toContain('Private academic document');
    expect(JSON.stringify(result)).not.toContain('source-private');
    expect(JSON.stringify(result)).not.toContain('source-third-party');
    expect(await reader.getSource('source-private')).toBeUndefined();
    expect(await reader.getSource('source-third-party')).toBeUndefined();
    expect(await reader.getSource('source-public')).toEqual(publicSource);
  });

  it('does not truncate a list of requirements and keeps original IDs', async () => {
    const requests = Array.from({ length: 32 }, (_, index) => requirement('req-' + index));
    const matches = requests.map((item) => ({
      requirementId: item.id,
      claims: [claim('claim-' + item.id, ['source-public'])],
      sources: [publicSource],
    }));
    const reader = new PublicGraphEvidenceGateway(upstream(matches));
    const result = await reader.findEvidence(requests);
    expect(result).toHaveLength(32);
    expect(result[31]?.requirementId).toBe('req-31');
  });

  it('fails closed on missing requirements, mismatched order and invalid limits', async () => {
    const reader = new PublicGraphEvidenceGateway(upstream([]));
    await expect(reader.findEvidence([requirement('java')])).rejects.toThrow(
      'GRAPH_PUBLIC_INVALID_RESULT_COUNT',
    );
    await expect(reader.findEvidence([], { maxClaimsPerRequirement: 0 })).rejects.toThrow(
      'GRAPH_PUBLIC_INVALID_LIMIT',
    );
    const wrong = new PublicGraphEvidenceGateway(
      upstream([{ requirementId: 'react', claims: [], sources: [] }]),
    );
    await expect(wrong.findEvidence([requirement('java')])).rejects.toThrow(
      'GRAPH_PUBLIC_REQUIREMENT_MISMATCH',
    );
  });

  it('does not expose Neo4j administrator credentials in the public application', () => {
    expect(() => assertPublicOrbeGraphIsolation({ NODE_ENV: 'production' })).not.toThrow();
    for (const key of [
      'NEO4J_AUTH',
      'NEO4J_AUTH_FILE',
      'NEO4J_URI',
      'NEO4J_PASSWORD',
      'GRAPHRAG_SEED_ENABLED',
    ]) {
      expect(() => assertPublicOrbeGraphIsolation({ [key]: 'value' })).toThrow(
        'ORBE_PUBLIC_GRAPH_PRIVILEGE_FORBIDDEN',
      );
    }
  });
});
