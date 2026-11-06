# Provisional ADR — retain Neo4j for Orbe; continue HydraDB as isolated research adapter

**Status:** PROVISIONAL / REVIEW REQUIRED, not authorized for deployment.  
**Date:** 2026-11-06  
**Related:** [F4.1 issue #36](https://github.com/SladeSouzaSantos/phasscode-platform/issues/36), [F4.2 #37](https://github.com/SladeSouzaSantos/phasscode-platform/issues/37), [F4.3 #38](https://github.com/SladeSouzaSantos/phasscode-platform/issues/38), [F4.4 #39](https://github.com/SladeSouzaSantos/phasscode-platform/issues/39).

## Decision being evaluated

Continue running **Neo4j as the operational graph engine in Orbe DEV/MAIN** and keep HydraDB v0.3.0 as a **separate, read-only application-equivalence LAB** with **no authorized merge/deploy**. An eventual switch would require an explicit later ADR approval and a rollback plan.

This is an **engineering recommendation based on bounded reproducible evidence**, not a judgment that HydraDB is fundamentally unsuitable.

## Context / options

The Orbe assistant answers recruiter questions using public, verifiable PPKS professional evidence. The canonical knowledge base is source-controlled, and the optional graph is a rebuildable projection; source completeness and professional-versus-study scopes are more important than any single-query latency improvement.

We compared:

1. **Keep Neo4j** and its working original Cypher/JavaScript driver adapter (baseline).
2. **Replace Neo4j directly with HydraDB** without query changes — rejected by direct compatibility evidence.
3. **Implement a dedicated HydraDB repository adapter in LAB**, validate semantic parity, test MinIO object-store operation, and decide later — **current experimental track**.
4. **Enable a multi-engine SHADOW in operational environments** — not authorized; introducing new infrastructure there is outside this LAB's agreed safety scope.

## Evidence matrix

| Decision criterion | Evidence status |
| --- | --- |
| Original Orbe fixed Cypher accepted by HydraDB | **Not compatible as-is**: 7/9 rejected in v0.3.0 HTTP Gate 9 |
| Same Orbe EvidenceGraphRepository results on a public subset | **PASS**: 88/88 requirements + 64/64 source lookups, Gate 12 |
| Recover the public subset from MinIO after node/service restarts | **PASS limited**: 14 claims / 16 sources preserved, Gate 13 |
| Bolt interoperability | **Driver/config-dependent**: repeated JS 6.2.0 errors in multiple modes; independent Python 6.4.1 matched all 3 reads (incl. bound parameter) using `default` or unspecified database and routed `default` on the same pinned HydraDB image (Gate 14 follow-up #42171683734) |
| Warm application-adapter latency | **Promising, bounded**: three local-Hydra adapter runs and one MinIO-backed run, lower observed p50 than Neo4j/Bolt, F4.3 |
| Same Python HTTP client, same Cypher | **Promising, tiny fixture**: two one-hop/filter runs with lower observed HydraDB HTTP medians, high p99 outliers on some groups |
| Cold cache, large public dataset, high concurrency | **Not tested** |
| Full PPKS / actual DEV/MAIN database outputs | **Not tested**; only source-code baseline equivalence checked |
| S3/MinIO request count, storage/network usage, monthly cost | **Not measured** |
| Interrupted writes, backup restore, HA / multiwriter | **Not tested** |
| Licensing / distribution obligations | **Pending review**: upstream HydraDB v0.3.0 [LICENSE](https://github.com/hydra-db/hydradb/blob/v0.3.0/LICENSE) is **AGPL-3.0**; avoid assumptions about legal obligations or alternative commercial licenses without verification |

## Technology and rationale

- **Neo4j**: remains a stable operational choice because existing Cypher, constraints, transaction/driver semantics and application fallback are already integrated.
- **HydraDB**: potentially useful where a graph backed by durable object storage and disposable compute aligns with future operating requirements. Our LAB-only application adapter can preserve evidence/source semantics, but it uses **numeric physical IDs, an explicit source-edge model and a different Cypher subset/HTTP transport**. The partial JS Bolt behavior makes a drop-in driver swap unjustified.
- **MinIO**: supported S3-compatible storage used in isolated tests, without asserting identical behavior to AWS S3 under high load or failure.
- **LLM/GraphRAG**: independent of graph-engine selection; retrieval correctness should be compared on known requirements and sources, and answer-generation quality must be tested separately.
- **GitHub Actions**: allows ephemeral, reproducible, resource-bounded experiments on an external runner without touching MiniMac production. Existing remote Gate 8 forced-command SSH authorization remains unchanged.

## Why not migrate now

A single-digit millisecond p50 advantage on a small, warm public subset does not resolve missing direct Cypher compatibility, Bolt parameters, S3 cost, failure recovery, backups, licensing or the total cost of running a dedicated adapter. One cannot generalize small identical-outcome tests into proof of production equivalence.

## Required evidence for an approval or rejection

- Investigate the reproduced JS 6.2.0 versus Python 6.4.1 Bolt discrepancy, database selection, bound parameters and routing with maintainers. Preserve version-pinned JS/Python minimal repros and do not assume Python success makes TypeScript compatible.
- Expand the corpus to **all eligible public PPKS records and claims**, preserve every source ID, status and professional scope, then repeat controlled application-equivalence tests.
- Run true object-store read/write load on cold and warm caches, more than one dataset size, staged concurrency, object request/byte metrics, CPU/RAM/I/O telemetry, and model S3+compute cost versus Neo4j.
- Test interrupted writes, failures/restarts in the middle of work, recovery/restore, snapshot correctness and access isolation.
- Review the **AGPL-3.0 license** implications, security controls, upgrade/maintenance posture, SLA expectations and alternative licensing if relevant, with appropriate expertise.
- Write a tested rollback route and seek explicit approval before any changes to Orbe DEV or MAIN.

## External feedback

A concise, evidence-based [email draft](hydradb-maintainer-email-draft.md) and [full case study](hydradb-maintainer-feedback-2026-11-06.md) are available for **user review**. The user **does not speak English and requests written email correspondence only**. There is also a [Portuguese review translation](hydradb-maintainer-email-draft-ptbr.md). No email has been sent and no upstream GitHub issue opened.

**Outcome:** Maintain the current Neo4j deployment; keep testing HydraDB separately. Neither F4.3 (comprehensive benchmark/cost) nor F4.4 (formal final adoption ADR) should be marked complete based on the bounded pilots.
