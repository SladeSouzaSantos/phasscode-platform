import type { KnowledgeDocument } from '../domain/ports.js';
import { mentionedTechnologies } from '../knowledge-matching.js';

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
  requestedTechnologies: ReadonlySet<string> = new Set<string>(),
): EvidencePacket | null {
  if (!Number.isFinite(totalContentChars) || totalContentChars < 0) return null;
  if (!documents.length) return { documents: [], originalChars: 0, retainedChars: 0 };

  const budget = Math.floor(totalContentChars);
  // Put every requested technology already verified in source metadata first.
  // No fixed requirement count: the protected signature grows with the query,
  // and a genuinely insufficient budget is rejected rather than silently lost.
  const signatures = documents.map(
    (document) =>
      document.technologies
        ?.filter((label) =>
          [...mentionedTechnologies(label)].some((technology) =>
            requestedTechnologies.has(technology),
          ),
        )
        .join(', ') ?? '',
  );
  const minimum = documents.map((document, index) =>
    Math.min(
      document.content.length,
      Math.max(MIN_SOURCE_CONTENT, signatures[index]!.length ? signatures[index]!.length + 9 : 0),
    ),
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

  const retained = documents.map((document, index) => {
    const limit = lengths[index]!;
    // Under severe pressure, a factual stack signature carries more useful
    // evidence than an arbitrary prefix of the prose description. Preserve
    // exact technologies from the curated source; never infer new technologies.
    const requestedStack = signatures[index]!;
    const stack = requestedStack || document.technologies?.slice(0, 8).join(', ') || '';
    // Even when the source begins with generic prose, keep the exact requested
    // facts from its curated technologies and nearby original text. Never
    // confuse a verified study/project stack with paid employment.
    const excerpts = requestedStack
      ? (document.technologies ?? [])
          .filter((label) =>
            [...mentionedTechnologies(label)].some((technology) =>
              requestedTechnologies.has(technology),
            ),
          )
          .flatMap((label) => {
            const lower = document.content.toLowerCase();
            const full = label.toLowerCase();
            let at = lower.indexOf(full);
            if (at < 0) at = lower.indexOf(full.split(/\s+/).at(-1) ?? full);
            if (at < 0) return [];
            return [
              document.content
                .slice(
                  Math.max(0, at - 38),
                  Math.min(document.content.length, at + label.length + 52),
                )
                .replace(/\s+/g, ' ')
                .trim(),
            ];
          })
      : [];
    // Study records have no implemented technology metadata. Recover the
    // exact course rows, rather than a generic catalog preface, when compressed.
    const courseRows =
      document.id.startsWith('cursos-') && requestedTechnologies.size > 0
        ? document.content
            .split('\n')
            .filter((line) =>
              [...mentionedTechnologies(line)].some((technology) =>
                requestedTechnologies.has(technology),
              ),
            )
            .map((line) => line.trim())
        : [];
    const courseEvidence = courseRows.length
      ? ['Cursos declarados (não emprego; certificação oficial não presumida):', ...courseRows]
          .join(' ')
      : '';
    const compactEvidence =
      courseEvidence && document.content.length > limit
        ? courseEvidence + ' ' + document.content
        : requestedStack && document.content.length > limit
          ? ['Stack: ' + requestedStack + '.', ...new Set(excerpts), document.content].join(' ')
          : limit < 180 && stack && document.content.length > limit
            ? 'Stack: ' + stack + '. ' + document.content
            : document.content;
    const content = compactEvidence.slice(0, limit);
    return { ...document, content };
  });
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
