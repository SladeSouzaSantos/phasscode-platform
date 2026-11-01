import type { KnowledgeDocument } from '../domain/ports.js';

/**
 * Every supplied source retains a minimum core before longer sources get
 * additional space. Never silently drop a source because it is at the tail
 * of the retrieval ranking. The provider must reject an undersized budget.
 */
export const MIN_SOURCE_CONTENT = 32;
export const CORE_SOURCE_CONTENT = 220;

export interface EvidencePacket {
  documents: KnowledgeDocument[];
  originalChars: number;
  retainedChars: number;
}

/** Deterministic, nonmutating, balanced content allocation in characters. */
export function buildEvidencePacket(
  documents: readonly KnowledgeDocument[],
  totalContentChars: number,
): EvidencePacket | null {
  if (!Number.isFinite(totalContentChars) || totalContentChars < 0) return null;
  if (!documents.length) return { documents: [], originalChars: 0, retainedChars: 0 };

  const budget = Math.floor(totalContentChars);
  const minimum = documents.map((document) =>
    Math.min(document.content.length, MIN_SOURCE_CONTENT),
  );
  if (minimum.reduce((sum, n) => sum + n, 0) > budget) return null;

  // Allocate small, complete source beginnings before distributing capacity.
  const caps = documents.map((document) => Math.min(document.content.length, CORE_SOURCE_CONTENT));
  const lengths = [...minimum];
  let remaining = budget - lengths.reduce((sum, n) => sum + n, 0);
  for (let phase = 0; phase < 2 && remaining > 0; phase++) {
    const ceilings = phase === 0 ? caps : documents.map((doc) => doc.content.length);
    let active = lengths
      .map((_length, index) => index)
      .filter((index) => lengths[index]! < ceilings[index]!);
    while (active.length > 0 && remaining > 0) {
      const share = Math.max(1, Math.floor(remaining / active.length));
      let used = 0;
      for (const index of active) {
        const add = Math.min(share, ceilings[index]! - lengths[index]!, remaining - used);
        lengths[index]! += add;
        used += add;
        if (used >= remaining) break;
      }
      if (!used) break;
      remaining -= used;
      active = active.filter((index) => lengths[index]! < ceilings[index]!);
    }
  }

  const retained = documents.map((document, index) => ({
    ...document,
    content: document.content.slice(0, lengths[index]),
  }));
  return {
    documents: retained,
    originalChars: documents.reduce((sum, document) => sum + document.content.length, 0),
    retainedChars: retained.reduce((sum, document) => sum + document.content.length, 0),
  };
}

export type EvidenceTraceStage =
  'retrieved' | 'chat_bounded' | 'provider_initial' | 'provider_compacted' | 'response_sources';

/** Opt-in operational trace: IDs and lengths only, never raw messages, text, tokens or URLs. */
export function traceEvidence(
  stage: EvidenceTraceStage,
  documents: readonly Pick<KnowledgeDocument, 'id' | 'content'>[],
  reason?: 'context_budget' | 'initial' | 'model_tool',
  traceId?: string,
): void {
  if (process.env.ORBE_EVIDENCE_TRACE !== 'true') return;
  console.info(
    JSON.stringify({
      event: 'orbe_evidence_trace',
      stage,
      ...(traceId ? { traceId } : {}),
      ...(reason ? { reason } : {}),
      documentCount: documents.length,
      sources: documents.map((document) => ({
        id: document.id.slice(0, 120),
        chars: document.content.length,
      })),
    }),
  );
}
