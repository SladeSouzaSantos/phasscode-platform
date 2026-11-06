import { describe, expect, it } from 'vitest';
import {
  Gate10HydraEvidenceRepository,
  gate10FindQuery,
  gate10SourceQuery,
  type Gate10Transport,
} from '../scripts/hydradb-gate10-repository.js';
import {
  gate10Fixture, gate10Claims, gate10Sources, gate10Requirements,
} from '../scripts/hydradb-gate10-fixture.js';
import { graphOrCanonical } from '../apps/orbe-node/src/adapters/neo4j-driver-store.js';

const encoded = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64');
const typed = (value: unknown) => ({ type: 'string', value: encoded(value) });
const run = '2026110601';

function mockTransport(mode: 'normal'|'drop-source'|'duplicate-row'|'extra-source' = 'normal'): Gate10Transport {
  return {
    async read(query, params) {
      expect(params.run).toBe(run);
      if (query === gate10FindQuery) {
        const matches = gate10Claims.filter(x => x.objectId === 'skill-' + params.skill);
        let rows = matches.flatMap(claim =>
          claim.sourceIds.map(sourceId => {
            const source = gate10Sources.find(s => s.id === sourceId);
            if (!source) throw new Error('BAD_FIXTURE');
            return [typed(claim), typed(source)];
          }),
        );
        if (mode === 'drop-source') rows = rows.slice(1);
        if (mode === 'duplicate-row') rows.push(rows[0]!);
        if (mode === 'extra-source') rows.push([
          typed(matches[0]!), typed(gate10Sources.find(s => s.id === 'source-flutter-code')!),
        ]);
        return { columns: ['claim','source'], rows };
      }
      if (query === gate10SourceQuery) {
        const source = gate10Sources.find(x => x.id === params.source);
        return { columns: ['source'], rows: source ? [[typed(source)]] : [] };
      }
      throw new Error('UNEXPECTED_CYPHER');
    },
  };
}
function repo(mode?: Parameters<typeof mockTransport>[0]) {
  return new Gate10HydraEvidenceRepository(mockTransport(mode), run);
}

describe('Gate 10 — full Orbe EvidenceGraphRepository contract, synthetic only', () => {
  it('has a valid domain snapshot of 4 claims, 6 individual sources, mixed and study scope', () => {
    expect(gate10Fixture.nodes.filter(n => n.kind === 'claim')).toHaveLength(4);
    expect(gate10Fixture.nodes.filter(n => n.kind === 'source')).toHaveLength(6);
    expect(gate10Fixture.relations.filter(e => e.type === 'SUPPORTED_BY')).toHaveLength(6);
    expect(gate10Fixture.nodes.some(n => n.kind === 'claim' && n.scope === 'mixed_role')).toBe(true);
  });

  it('retrieves all required sources for every claim, preserving professional/study/mixed scope', async () => {
    const matches = await repo().findEvidence(gate10Requirements);
    expect(matches).toHaveLength(3);
    expect(matches[0]!.claims.map(c => [c.id, c.scope])).toEqual([
      ['claim-java-prof', 'professional'], ['claim-java-study', 'study'],
    ]);
    expect(matches[0]!.sources.map(x => x.id)).toEqual([
      'source-java-study','source-sig-catalog','source-sig-code',
    ]);
    expect(matches[1]!.claims.map(c => [c.id, c.scope])).toEqual([
      ['claim-flutter-mixed', 'mixed_role'],
      ['claim-flutter-personal', 'personal_project'],
    ]);
    expect(matches[1]!.sources).toHaveLength(3);
    expect(matches[2]).toEqual({
      requirementId: 'requirement-go', claims: [], sources: [],
    });
  });

  it('applies claim LIMIT after reading and validating every source of the selected claim', async () => {
    const matches = await repo().findEvidence(gate10Requirements, {
      maxClaimsPerRequirement: 1,
    });
    expect(matches[0]!.claims.map(c => c.id)).toEqual(['claim-java-prof']);
    expect(matches[0]!.sources.map(s => s.id)).toEqual([
      'source-sig-catalog','source-sig-code',
    ]);
    expect(matches[1]!.claims.map(c => c.id)).toEqual(['claim-flutter-mixed']);
    expect(matches[1]!.sources).toHaveLength(2);
  });

  it('returns exact individual sources and a missing-source result', async () => {
    const store = repo();
    const s = await store.getSource('source-sig-code');
    expect(s?.verificationStatus).toBe('code_reviewed');
    expect((await store.getSource('source-sig-catalog'))?.verificationStatus)
      .toBe('catalog_only');
    expect(await store.getSource('source-missing')).toBeUndefined();
  });

  it('rejects incomplete source graph rather than presenting a partial claim', async () => {
    await expect(repo('drop-source').findEvidence([gate10Requirements[0]!]))
      .rejects.toThrow('GATE10_INCOMPLETE_CLAIM_SOURCES');
  });

  it('rejects duplicated source edges and an unrelated graph source', async () => {
    await expect(repo('duplicate-row').findEvidence([gate10Requirements[0]!]))
      .rejects.toThrow('GATE10_DUPLICATE_GRAPH_EDGE');
    await expect(repo('extra-source').findEvidence([gate10Requirements[0]!]))
      .rejects.toThrow('GATE10_UNTRUSTED_GRAPH_EDGE');
  });

  it('ensures failures trigger an authoritative fallback, not fabricated graph evidence', async () => {
    const original = {
      requirementId: 'requirement-java',
      claims: [gate10Claims[0]!],
      sources: gate10Sources.filter(s =>
        gate10Claims[0]!.sourceIds.includes(s.id)),
    };
    const recovered = await graphOrCanonical(
      () => repo('drop-source').findEvidence([gate10Requirements[0]!]),
      () => [original],
    );
    expect(recovered).toEqual([original]);
  });

  it('fails closed on unapproved run key, source ID and limit', async () => {
    expect(() => new Gate10HydraEvidenceRepository(mockTransport(), 'not-a-run'))
      .toThrow('GATE10_BAD_RUN');
    await expect(repo().getSource('../../private')).rejects.toThrow('GATE10_BAD_SOURCE_ID');
    await expect(repo().findEvidence(gate10Requirements, {maxClaimsPerRequirement: NaN}))
      .rejects.toThrow('GATE10_BAD_LIMIT');
  });

  it('detects malformed, untyped or overlong graph result rows', async () => {
    const adapter = new Gate10HydraEvidenceRepository({
      async read() { return { columns:['claim','source'], rows:[['not-typed','not-typed']] }; },
    }, run);
    await expect(adapter.findEvidence([gate10Requirements[0]!]))
      .rejects.toThrow('GATE10_VALUE_INVALID');
  });
});
