import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { projectPpksEvidenceGraph } from '../apps/orbe-node/src/adapters/ppks-evidence-graph.js';
import { createGraphRagActive } from '../apps/orbe-node/src/application/graph-active-answer.js';
import { analyzeVacancyEvidenceCoverage } from '../apps/orbe-node/src/application/graph-vacancy-coverage.js';
import { evaluateGraphRecruiterPreview } from '../apps/orbe-node/src/application/graph-recruiter-preview.js';
import { createSnapshotRequirementIdentifier } from '../apps/orbe-node/src/application/graph-requirements.js';
import type {
  EvidenceClaim,
  EvidenceGraphRepository,
  EvidenceGraphSnapshot,
  EvidenceSource,
} from '../apps/orbe-node/src/domain/evidence-graph.js';

const caseSchema = z.object({
  id: z.string().min(1),
  category: z.string().min(1),
  turns: z.array(z.object({ message: z.string().trim().min(1) })).min(1),
});
const corpusSchema = z.object({
  version: z.string().min(1),
  cases: z.array(caseSchema).min(1),
});

export type OfflineRecruiterMatrixReport = {
  reportVersion: 'orbe-graphrag-offline-matrix-v2';
  mode: 'offline_ppks_projection';
  corpusVersion: string;
  baselineComparison: 'not_run';
  liveLlmCalls: 0;
  graphDatabaseQueries: 0;
  totals: {
    cases: number;
    turns: number;
    verified: number;
    transferable: number;
    canonicalFallback: number;
    /** Uses the real Active decision policy on offline PPKS claims, not Neo4j. */
    activePolicyVerified: number;
    activePolicyFallback: number;
    unknownRequirements: number;
    uninterpretedClauses: number;
  };
  cases: Array<{
    id: string;
    category: string;
    turns: Array<{
      index: number;
      /** Legacy preview mode: does not enforce Active free-prose policy. */
      mode: 'verified_graph' | 'transferable_graph' | 'canonical_ppks';
      reason: string;
      /** Decision of createGraphRagActive with the same offline evidence repository. */
      activePolicyMode: 'verified_graph' | 'canonical_ppks';
      activePolicySourceCount: number;
      recognizedRequirements: number;
      vacancyCoverageStatus: 'eligible' | 'needs_review' | 'no_requirements';
      unknownRequirements: number;
      uninterpretedClauses: number;
    }>;
  }>;
};

/**
 * Offline, read-only fixture adapter. It maps real PPKS claims and provenance
 * into EvidenceGraphRepository, but is NOT a Neo4j integration test or a
 * public-serving reader. Only USES_TECHNOLOGY claims can match a skill.
 */
export function createOfflineSnapshotEvidenceRepository(
  snapshot: EvidenceGraphSnapshot,
): EvidenceGraphRepository {
  const sourceById = new Map<string, EvidenceSource>();
  const technologyClaims = new Map<string, EvidenceClaim[]>();
  for (const node of snapshot.nodes) {
    if (node.kind === 'source') sourceById.set(node.id, node);
    if (node.kind === 'claim' && node.predicate === 'USES_TECHNOLOGY') {
      const claims = technologyClaims.get(node.objectId) ?? [];
      claims.push(node);
      technologyClaims.set(node.objectId, claims);
    }
  }
  return {
    async findEvidence(requirements, options) {
      const limit = options?.maxClaimsPerRequirement ?? 5;
      return requirements.map((requirement) => {
        const claims = (technologyClaims.get(requirement.id) ?? []).slice(0, limit);
        const sourceIds = new Set(claims.flatMap((claim) => claim.sourceIds));
        return {
          requirementId: requirement.id,
          claims,
          sources: [...sourceIds]
            .map((id) => sourceById.get(id))
            .filter((source): source is EvidenceSource => Boolean(source)),
        };
      });
    },
    async getSource(id) {
      return sourceById.get(id);
    },
  };
}

/**
 * Replays the nine existing recruiter/academic prompts without contacting
 * the LLM, Neo4j, HTTP APIs, Redis or the public ChatService.
 *
 * The canonical PPKS callback is a fixed sentinel for routing verification.
 * The legacy preview and the actual Active policy are reported separately:
 * a preview can find claims even when the Active parser abstains on a long
 * recruitment prompt or when full HTTPS provenance is missing.
 * This report MUST NOT be described as an answer-quality or v0.1.0 baseline
 * comparison. It stores IDs/counters, never candidate answers or prompts.
 */
export async function evaluateOfflineRecruiterMatrix(
  corpusText: string,
  snapshot: EvidenceGraphSnapshot,
): Promise<OfflineRecruiterMatrixReport> {
  const corpus = corpusSchema.parse(JSON.parse(corpusText) as unknown);
  const ids = corpus.cases.map((item) => item.id);
  if (new Set(ids).size !== ids.length) throw new Error('GRAPH_MATRIX_DUPLICATE_CASE_ID');
  const identifyRequirements = createSnapshotRequirementIdentifier(snapshot);
  const evidence = createOfflineSnapshotEvidenceRepository(snapshot);
  const activePolicy = createGraphRagActive(snapshot, evidence);

  const cases: OfflineRecruiterMatrixReport['cases'] = [];
  let turns = 0;
  let verified = 0;
  let transferable = 0;
  let canonicalFallback = 0;
  let activePolicyVerified = 0;
  let activePolicyFallback = 0;
  let unknownRequirements = 0;
  let uninterpretedClauses = 0;

  for (const item of corpus.cases) {
    const evaluations: (typeof cases)[number]['turns'] = [];
    for (const [index, turn] of item.turns.entries()) {
      const parsed = identifyRequirements(turn.message);
      const coverage = analyzeVacancyEvidenceCoverage(turn.message);
      // The identifier's catalog recognition is NOT proof that all human
      // vacancy requirements were extracted. Coverage is diagnostic only.
      const preview = await evaluateGraphRecruiterPreview(turn.message, {
        evidence,
        identifyRequirements: () => parsed,
        canonicalPpks: () => 'CANONICAL_PPKS_FALLBACK_OFFLINE',
      });
      // Same Active gate as the public adapter, but no network, model or Neo4j.
      // This checks local eligibility only; it does not measure response quality.
      const activeResponse = await activePolicy.answer(turn.message);
      const activePolicyMode = activeResponse ? 'verified_graph' : 'canonical_ppks';
      if (activeResponse) activePolicyVerified += 1;
      else activePolicyFallback += 1;

      if (preview.mode === 'verified_graph') verified += 1;
      else if (preview.mode === 'transferable_graph') transferable += 1;
      else canonicalFallback += 1;

      unknownRequirements += preview.unrecognizedRequirements?.length ?? 0;
      uninterpretedClauses += coverage.uninterpreted.length;
      turns += 1;
      evaluations.push({
        index,
        mode: preview.mode,
        reason: preview.reason,
        activePolicyMode,
        activePolicySourceCount: activeResponse?.sources.length ?? 0,
        recognizedRequirements: parsed.length,
        vacancyCoverageStatus: coverage.status,
        unknownRequirements: preview.unrecognizedRequirements?.length ?? 0,
        uninterpretedClauses: coverage.uninterpreted.length,
      });
    }
    cases.push({ id: item.id, category: item.category, turns: evaluations });
  }

  return {
    reportVersion: 'orbe-graphrag-offline-matrix-v2',
    mode: 'offline_ppks_projection',
    corpusVersion: corpus.version,
    baselineComparison: 'not_run',
    liveLlmCalls: 0,
    graphDatabaseQueries: 0,
    totals: {
      cases: cases.length,
      turns,
      verified,
      transferable,
      canonicalFallback,
      activePolicyVerified,
      activePolicyFallback,
      unknownRequirements,
      uninterpretedClauses,
    },
    cases,
  };
}

export async function evaluateStoredOfflineRecruiterMatrix(): Promise<OfflineRecruiterMatrixReport> {
  const corpus = await readFile('evaluation/vacancies-ppks-v12.json', 'utf8');
  const snapshot = await projectPpksEvidenceGraph();
  return evaluateOfflineRecruiterMatrix(corpus, snapshot);
}
