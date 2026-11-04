import { describe, expect, it } from 'vitest';
import {
  evaluateSemanticLexicalBaseline,
  evaluateStoredSemanticLexicalBaseline,
} from '../evaluation/semantic-hybrid-lexical-baseline.js';
import type { EvidenceGraphSnapshot } from '../apps/orbe-node/src/domain/evidence-graph.js';

const snapshot: EvidenceGraphSnapshot = {
  schemaVersion: '1.0',
  nodes: [
    { kind: 'skill', id: 'skill-java', label: 'Java' },
    { kind: 'skill', id: 'skill-javascript', label: 'JavaScript' },
    { kind: 'skill', id: 'skill-sql', label: 'SQL' },
    { kind: 'skill', id: 'skill-sql-server', label: 'SQL Server' },
  ],
  relations: [],
};

function fixture(
  items: Array<{
    id: string;
    source: string;
    fragments: Array<{
      text: string;
      role: 'mandatory' | 'alternative' | 'context';
      relation: 'candidate_requirement' | 'company_stack';
      labels: string[];
    }>;
  }>,
) {
  return JSON.stringify({
    schemaVersion: 'semantic-hybrid-corpus-v0',
    reviewStatus: 'draft_not_human_approved',
    provenance: 'synthetic_examples_only',
    purpose: 'Synthetic retrieval hard negatives',
    cases: items.map((item) => ({
      id: item.id,
      language: 'pt',
      text: item.source,
      annotations: item.fragments.map((part) => {
        // The isolated skill may occur after a longer name (Java after JavaScript).
        const start = item.source.lastIndexOf(part.text);
        if (start < 0) throw new Error('TEST_FIXTURE_MISSING_SPAN');
        return {
          start,
          end: start + part.text.length,
          text: part.text,
          role: part.role,
          relation: part.relation,
          priority: part.role === 'context' ? 'none' : 'mandatory',
          candidateLabels: part.labels,
          ...(part.role === 'alternative' ? { alternativeGroup: 'alt-1' } : {}),
        };
      }),
    })),
  });
}

describe('F3.7/#42 lexical candidate retrieval baseline', () => {
  it('does not confuse JavaScript with Java or SQL Server with SQL', () => {
    const data = fixture([
      {
        id: 'js-negative',
        source: 'JavaScript não é Java',
        fragments: [
          {
            text: 'JavaScript',
            role: 'mandatory',
            relation: 'candidate_requirement',
            labels: ['JavaScript'],
          },
        ],
      },
      {
        id: 'sql-negative',
        source: 'Requisitos: SQL Server',
        fragments: [
          {
            text: 'SQL Server',
            role: 'mandatory',
            relation: 'candidate_requirement',
            labels: ['SQL Server'],
          },
        ],
      },
    ]);
    const report = evaluateSemanticLexicalBaseline(data, snapshot);
    expect(report.totals).toMatchObject({
      cases: 2,
      candidateSpans: 2,
      expectedInCatalog: 2,
      lexicalTruePositives: 2,
      lexicalFalsePositives: 0,
      lexicalFalseNegatives: 0,
      lexicalPrecision: 1,
      lexicalRecall: 1,
    });
  });

  it('reports an OOV alternative without hallucinating a Kotlin catalog skill', () => {
    const data = fixture([
      {
        id: 'alternative-oov',
        source: 'Java ou Kotlin',
        fragments: [
          {
            text: 'Java ou Kotlin',
            role: 'alternative',
            relation: 'candidate_requirement',
            labels: ['Java', 'Kotlin'],
          },
        ],
      },
    ]);
    const report = evaluateSemanticLexicalBaseline(data, snapshot);
    expect(report.totals).toMatchObject({
      candidateSpans: 1,
      expectedInCatalog: 1,
      expectedOutOfCatalog: 1,
      lexicalTruePositives: 1,
      lexicalFalsePositives: 0,
      lexicalFalseNegatives: 0,
      ambiguousSpans: 0,
    });
    expect(report.limitations).toEqual(
      expect.arrayContaining([expect.stringContaining('Out-of-catalog')]),
    );
  });

  it('quarantines lexical mentions in employer context, not claiming they are required', () => {
    const data = fixture([
      {
        id: 'employer-context',
        source: 'Nossa empresa usa JavaScript mas precisamos de Java.',
        fragments: [
          {
            text: 'JavaScript',
            role: 'context',
            relation: 'company_stack',
            labels: ['JavaScript'],
          },
          {
            text: 'Java',
            role: 'mandatory',
            relation: 'candidate_requirement',
            labels: ['Java'],
          },
        ],
      },
    ]);
    const report = evaluateSemanticLexicalBaseline(data, snapshot);
    expect(report.totals).toMatchObject({
      candidateSpans: 1,
      quarantinedLexicalMentions: 1,
      lexicalTruePositives: 1,
      lexicalFalsePositives: 0,
    });
  });

  it('rejects source-offset drift instead of inferring a different requirement', () => {
    const source = fixture([
      {
        id: 'unaligned',
        source: 'Java',
        fragments: [
          {
            text: 'Java',
            role: 'mandatory',
            relation: 'candidate_requirement',
            labels: ['Java'],
          },
        ],
      },
    ]);
    const parsed = JSON.parse(source) as {
      cases: Array<{ annotations: Array<{ text: string }> }>;
    };
    parsed.cases[0]!.annotations[0]!.text = 'Go';
    expect(() => evaluateSemanticLexicalBaseline(JSON.stringify(parsed), snapshot)).toThrow(
      'SEMANTIC_LEXICAL_UNGROUNDED_SPAN',
    );
  });

  it('replays the provisional 16-case synthetic corpus without LLM or graph calls', async () => {
    const report = await evaluateStoredSemanticLexicalBaseline();
    expect(report).toMatchObject({
      reportVersion: 'semantic-hybrid-lexical-baseline-v0',
      mode: 'lexical_skill_mention_retrieval_only',
      reviewStatus: 'draft_not_human_approved',
      modelCalls: 0,
      graphQueries: 0,
      vectorQueries: 0,
    });
    expect(report.totals).toMatchObject({
      cases: 16,
      spans: 31,
    });
    expect(report.totals.expectedInCatalog).toBeGreaterThan(0);
    expect(report.totals.candidateSpans).toBeGreaterThan(0);
    expect(report.totals.lexicalTruePositives).toBeGreaterThan(0);
    expect(report.cases.every((item) => item.id && item.spans > 0)).toBe(true);
    expect(JSON.stringify(report)).not.toContain('Buscamos conhecimento');
    expect(await evaluateStoredSemanticLexicalBaseline()).toEqual(report);
  });
});
