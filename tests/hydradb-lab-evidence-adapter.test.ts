import { describe, expect, it, vi } from 'vitest';
import type {
  EvidenceClaim,
  EvidenceGraphMatch,
  EvidenceGraphRepository,
  EvidenceSource,
  VacancyRequirement,
} from '../apps/orbe-node/src/domain/evidence-graph.js';
import {
  HydraDbLabShadowEvidenceRepository,
  createHydraLabReadTransport,
  hydraLabFindCypher,
  hydraLabSourceCypher,
  type HydraLabReadTransport,
  type LabShadowDecision,
} from '../scripts/hydradb-lab-evidence-adapter.js';

const requirement = (skill: string): VacancyRequirement => ({
  kind: 'vacancy_requirement', id: 'requirement-' + skill.toLowerCase().replace('.', '-'),
  label: skill, mandatory: true,
});

const source = (
  id: string, status: EvidenceSource['verificationStatus'],
  origin: EvidenceSource['origin'],
  visibility: EvidenceSource['visibility'] = 'public',
): EvidenceSource => ({
  kind: 'source', id, label: 'PPKS: ' + id,
  verificationStatus: status, origin, visibility,
});

const sources: EvidenceSource[] = [
  source('source-experiencia-sig-catalog', 'catalog_only', 'ppks_catalog'),
  source('source-webservice-springboot-jpa-repo', 'code_reviewed', 'github'),
  source('source-phasscode-platform-catalog', 'catalog_only', 'ppks_catalog'),
  source('source-phasscode-platform-ports', 'code_reviewed', 'github'),
  source('source-phasscode-platform-knowledge-adapter', 'code_reviewed', 'github'),
  source('source-phasscode-platform-tests', 'code_reviewed', 'github'),
  source('source-web-portfolio-v2-catalog', 'catalog_only', 'ppks_catalog'),
  source('source-web-portfolio-v2-tests', 'code_reviewed', 'github'),
  source('source-web-portfolio-v2-chat-ui', 'code_reviewed', 'github'),
  source('source-experiencia-greencity-catalog', 'catalog_only', 'ppks_catalog'),
  source('source-greencity-os-catalog', 'catalog_only', 'ppks_catalog'),
  source('source-secret-academic-record', 'owner_confirmed', 'academic_record', 'private'),
];

const claim = (
  id: string, record: string, skill: string, scope: EvidenceClaim['scope'],
  sourceIds: string[],
): EvidenceClaim => ({
  kind: 'claim', id, label: record + ': ' + skill,
  subjectId: record, objectId: 'skill-' + skill.toLowerCase(),
  predicate: 'USES_TECHNOLOGY', scope, sourceIds,
});

const claims: Record<string, EvidenceClaim[]> = {
  Java: [
    claim('claim-experiencia-sig-skill-java', 'experiencia-sig', 'Java', 'professional',
      ['source-experiencia-sig-catalog']),
    claim('claim-webservice-springboot-jpa-skill-java', 'webservice-springboot-jpa',
      'Java', 'study', ['source-webservice-springboot-jpa-repo']),
  ],
  TypeScript: [
    claim('claim-phasscode-platform-skill-typescript', 'phasscode-platform',
      'TypeScript', 'personal_project', [
        'source-phasscode-platform-catalog',
        'source-phasscode-platform-ports',
        'source-phasscode-platform-knowledge-adapter',
        'source-phasscode-platform-tests',
      ]),
    claim('claim-web-portfolio-v2-skill-typescript', 'web-portfolio-v2',
      'TypeScript', 'personal_project', [
        'source-web-portfolio-v2-catalog', 'source-web-portfolio-v2-tests',
        'source-web-portfolio-v2-chat-ui',
      ]),
  ],
  Flutter: [
    claim('claim-experiencia-greencity-skill-flutter', 'experiencia-greencity',
      'Flutter', 'mixed_role', ['source-experiencia-greencity-catalog']),
    claim('claim-greencity-os-skill-flutter', 'greencity-os', 'Flutter',
      'personal_project', ['source-greencity-os-catalog']),
  ],
  Go: [],
};

const byId = new Map(sources.map((entry) => [entry.id, entry]));
const makeCanonical = (): EvidenceGraphRepository => ({
  async findEvidence(requirements) {
    return requirements.map((r): EvidenceGraphMatch => {
      const selected = claims[r.label] ?? [];
      const used = new Set(selected.flatMap((c) => c.sourceIds));
      return {
        requirementId: r.id, claims: selected,
        sources: sources.filter((entry) => used.has(entry.id)),
      };
    });
  },
  async getSource(id) { return byId.get(id); },
});

const runKey = '52115000533000';
const typed = (rows: string[][], columns: string[]) => ({
  columns, rows: rows.map((row) => row.map((value) => ({ type: 'string', value }))),
});
const sourceKey = (id: string) => {
  for (const record of [
    'experiencia-sig', 'experiencia-greencity', 'greencity-os',
    'webservice-springboot-jpa', 'phasscode-platform', 'web-portfolio-v2',
  ]) {
    const prefix = 'source-' + record + '-';
    if (id.startsWith(prefix)) return record + '--' + id.slice(prefix.length);
  }
  return undefined;
};

function mockTransport(): HydraLabReadTransport {
  return {
    async read(query, params) {
      expect(params.run).toBe(runKey);
      if (query === hydraLabFindCypher) {
        const rows: string[][] = [];
        for (const [skill, items] of Object.entries(claims)) {
          if (skill.toLowerCase() !== params.skill) continue;
          for (const item of items) {
            for (const id of item.sourceIds) {
              const src = byId.get(id)!;
              rows.push([
                item.subjectId, item.scope, sourceKey(id)!,
                src.verificationStatus, src.origin,
              ]);
            }
          }
        }
        return typed(rows, ['record', 'scope', 'source', 'verification', 'origin']);
      }
      if (query === hydraLabSourceCypher) {
        const match = [...byId.values()].find((s) => sourceKey(s.id) === params.source);
        const rows = match
          ? [[sourceKey(match.id)!, match.verificationStatus, match.origin]]
          : [];
        return typed(rows, ['source', 'verification', 'origin']);
      }
      throw new Error('unexpected_query');
    },
  };
}

describe('HydraDB LAB: EvidenceGraphRepository shadow adapter (no Orbe API wiring)', () => {
  it('defaults to OFF, never invokes graph and preserves a complete claim after limiting', async () => {
    const repo = new HydraDbLabShadowEvidenceRepository(makeCanonical());
    const output = await repo.findEvidence([requirement('TypeScript')], {
      maxClaimsPerRequirement: 1,
    });
    expect(output[0]?.claims).toHaveLength(1);
    expect(output[0]?.sources).toHaveLength(4);
    expect(output[0]?.sources.map((s) => s.verificationStatus)).toContain('catalog_only');
    expect(output[0]?.sources.map((s) => s.verificationStatus)).toContain('code_reviewed');
  });

  it('verifies Java professional/study scopes and Flutter mixed role without changing results', async () => {
    const decisions: LabShadowDecision[] = [];
    const canonical = makeCanonical();
    const shadow = new HydraDbLabShadowEvidenceRepository(canonical, {
      mode: 'shadow', runKey, transport: mockTransport(),
      onDecision: (d) => decisions.push(d),
    });
    const output = await shadow.findEvidence([
      requirement('Java'), requirement('Flutter'), requirement('Go'),
    ]);
    expect(output[0]?.claims.map((c) => c.scope)).toEqual(['professional', 'study']);
    expect(output[1]?.claims.map((c) => c.scope)).toEqual([
      'mixed_role', 'personal_project',
    ]);
    expect(output[2]?.claims).toHaveLength(0);
    expect(decisions).toHaveLength(3);
    expect(decisions.every((d) => d.status === 'graph_verified')).toBe(true);
    expect(decisions.every((d) => !JSON.stringify(d).includes('Java'))).toBe(true);
  });

  it('rejects missing/extra rows and errors, always returns unchanged canonical evidence', async () => {
    const canonical = makeCanonical();
    const expected = await canonical.findEvidence([requirement('Java')], {
      maxClaimsPerRequirement: 20,
    });
    for (const scenario of ['missing', 'extra', 'outage', 'malformed'] as const) {
      const base = mockTransport();
      const decisions: LabShadowDecision[] = [];
      const transport: HydraLabReadTransport = {
        async read(query, params) {
          if (scenario === 'outage') throw new Error('token-that-must-not-log');
          const value = await base.read(query, params);
          if (query !== hydraLabFindCypher) return value;
          if (scenario === 'malformed') return { columns: ['invalid'], rows: [] };
          const shape = value as { columns: string[]; rows: unknown[] };
          if (scenario === 'missing') return { ...shape, rows: shape.rows.slice(1) };
          return { ...shape, rows: [...shape.rows, shape.rows[0]] };
        },
      };
      const shadow = new HydraDbLabShadowEvidenceRepository(canonical, {
        mode: 'shadow', runKey, transport, onDecision: (d) => decisions.push(d),
      });
      const actual = await shadow.findEvidence([requirement('Java')], {
        maxClaimsPerRequirement: 20,
      });
      expect(actual).toEqual(expected);
      expect(decisions).toEqual([{
        operation: 'findEvidence', status: 'canonical_fallback',
        reason: 'UNAVAILABLE_OR_MISMATCH',
      }]);
    }
  });

  it('verifies individual public sources but does not send private sources to HydraDB', async () => {
    const transport = mockTransport();
    const read = vi.spyOn(transport, 'read');
    const decisions: LabShadowDecision[] = [];
    const repository = new HydraDbLabShadowEvidenceRepository(makeCanonical(), {
      mode: 'shadow', runKey, transport, onDecision: (d) => decisions.push(d),
    });
    const src = await repository.getSource('source-phasscode-platform-ports');
    expect(src).toMatchObject({ origin: 'github', verificationStatus: 'code_reviewed' });
    expect(decisions.at(-1)?.status).toBe('graph_verified');

    const catalog = await repository.getSource('source-phasscode-platform-catalog');
    expect(catalog).toMatchObject({ verificationStatus: 'catalog_only' });
    expect(decisions.at(-1)?.status).toBe('graph_verified');

    const called = read.mock.calls.length;
    const academic = await repository.getSource('source-secret-academic-record');
    expect(academic?.visibility).toBe('private');
    expect(read).toHaveBeenCalledTimes(called);
    expect(decisions.at(-1)?.reason).toBe('UNSUPPORTED_PUBLIC_FIXTURE');

    expect(await repository.getSource('source-phasscode-platform-no-such-source')).toBeUndefined();
    expect(decisions.at(-1)?.status).toBe('graph_verified');
  });

  it('preserves canonical getSource on an outage or source mismatch', async () => {
    const canonical = makeCanonical();
    for (const scenario of ['outage', 'extra_source'] as const) {
      const decisions: LabShadowDecision[] = [];
      const transport: HydraLabReadTransport = {
        async read(query, params) {
          if (scenario === 'outage') throw new Error('private-token-must-not-leak');
          const result = await mockTransport().read(query, params);
          if (query !== hydraLabSourceCypher) return result;
          const shaped = result as { columns: string[]; rows: unknown[] };
          return { ...shaped, rows: [...shaped.rows, shaped.rows[0]] };
        },
      };
      const repo = new HydraDbLabShadowEvidenceRepository(canonical, {
        mode: 'shadow', runKey, transport, onDecision: (d) => decisions.push(d),
      });
      const actual = await repo.getSource('source-phasscode-platform-catalog');
      expect(actual).toEqual(await canonical.getSource('source-phasscode-platform-catalog'));
      expect(decisions).toEqual([{
        operation: 'getSource', status: 'canonical_fallback',
        reason: 'UNAVAILABLE_OR_MISMATCH',
      }]);
      expect(JSON.stringify(decisions)).not.toContain('private-token');
    }
  });

  it('never sends unexpected skill text or untrusted source IDs to the graph', async () => {
    const transport = mockTransport();
    const read = vi.spyOn(transport, 'read');
    const decisions: LabShadowDecision[] = [];
    const repo = new HydraDbLabShadowEvidenceRepository(makeCanonical(), {
      mode: 'shadow', runKey, transport, onDecision: (d) => decisions.push(d),
    });
    const outputs = await repo.findEvidence([{
      kind: 'vacancy_requirement', id: 'malicious',
      label: 'GraphQL\\\") DETACH DELETE n //', mandatory: true,
    }]);
    expect(outputs[0]?.claims).toHaveLength(0);
    expect(read).not.toHaveBeenCalled();
    expect(decisions[0]?.reason).toBe('UNSUPPORTED_PUBLIC_FIXTURE');
    await expect(repo.getSource('source-foo-\u000a-delete')).rejects.toThrow(
      'LAB_INVALID_SOURCE_ID',
    );
  });

  it('refuses invalid run keys and unapproved Cypher before network transport', async () => {
    expect(() => new HydraDbLabShadowEvidenceRepository(makeCanonical(), {
      mode: 'shadow', runKey: 'invalid', transport: mockTransport(),
    })).toThrow('LAB_INVALID_RUN_KEY');
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ columns: [], rows: [] }), { status: 200 },
    ));
    const transport = createHydraLabReadTransport('x'.repeat(36), fetcher as typeof fetch);
    await expect(transport.read('MATCH (n) DETACH DELETE n', {})).rejects.toThrow(
      'LAB_UNAPPROVED_CYPHER',
    );
    expect(fetcher).not.toHaveBeenCalled();
    await transport.read(hydraLabFindCypher, { skill: 'java', run: runKey });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:18443/v1/graphs/lab/query');
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body)) as {
      query: string;
      parameters: Record<string, string>;
    };
    expect(body.query).toContain('$run');
    expect(body.parameters).toEqual({ skill: 'java', run: runKey });
    expect(body.query).not.toContain('DETACH DELETE');
  });
});
