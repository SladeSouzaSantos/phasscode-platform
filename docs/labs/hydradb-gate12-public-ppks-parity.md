# Gate 12 — real Orbe repository parity using PUBLIC PPKS records

**Date:** 2026-11-06. **Status:** PASS, strictly bounded public repository fixture. Neither DEV nor MAIN databases/services were contacted or modified.

## Provenance and baseline

- [GitHub Actions #42164035756, success](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42164035756), commit `f63e1bd74b2bc72ff184f5f876465627d4edcc0e`.
- **Both live disposable engines:** original Orbe `Neo4jGraphStore.seed` and `Neo4jEvidenceRepository` (unchanged) vs `Gate10HydraEvidenceRepository` (LAB HTTP, numeric vertex IDs and explicit source edges).
- **Seven allowlisted public PPKS records** (each record's first two stack entries): `experiencia-greencity`, `experiencia-sig`, `greencity-os`, `hsp-simulator`, `phasscode-platform`, `web-portfolio-v2`, `webservice-springboot-jpa`. The loader reads individual `projects/` and `experiences/` JSON files only; **it does not invoke the full academic projector** and does not ingest private academic data.
- The snapshot is validated against **the original Orbe evidenceGraphSnapshotSchema**, maintaining scope, claim/source references, `code_reviewed` vs `catalog_only`, and public visibility.
- This **domain projection has 50 typed nodes and 46 domain relations**: candidate/company/engagement/project entities plus 10 skills, 14 claims and 16 source entities. It is deliberately **NOT** the same physical schema as the older 47-node/60-edge HydraDB Gate 3 fixture. Different counts across these experiments must never be directly aggregated.

## Results, measured from CI structured output

| Check | Result |
| --- | --- |
| Public PPKS records | 7 |
| Distinct skills | 10 |
| Claims from first two skills per record | 14 |
| Specific public evidence sources | 16 |
| Typed Orbe domain vertices | 50 |
| Typed Orbe domain relations | 46 |
| `findEvidence` requirement-by-requirement parity | **88/88** |
| `getSource` public specific-source parity | **64/64** |
| Replay/idempotent write (same `MERGE` fixture) | PASS |
| Read old run after writing second run | PASS |
| Read second run in isolation | PASS |
| Unknown/absent Go | No invented claim |
| Scope `unknown` handling | Excluded from `findEvidence` by both adapters, preserved as source model |
| All sources of selected claim with limit=1 | PASS |
| GitHub-hosted ephemeral container teardown | PASS |
| Live Orbe DEV/MAIN response comparison | NOT TESTED |
| HydraDB Bolt interchangeability | NOT ESTABLISHED (Gate 9) |
| Larger public PPKS/full academic domain | NOT TESTED |
| MinIO durability of this 16-source public fixture | NOT TESTED (Gate 11 exercised a smaller synthetic graph) |
| Controlled performance/cost benchmark | NOT MEASURED |

This is **four separate phases**, each running **11 requirement labels at limits 1 and 20** (22 comparisons/phase), plus **16 `getSource` checks/phase**, totaling 88 + 64. The test uses actual engine responses, validates the original Orbe domain schemas, and compares complete normalized claim/source objects, not only counts.

The four phases were: first load, repeat seed of same run, read first run after creating a second isolated run, then read the second run.

## Reproduction

- [Public PPKS data projector with allowlist](../../scripts/hydradb-gate12-public-ppks-fixture.ts)
- [LAB HydraDB EvidenceGraphRepository](../../scripts/hydradb-gate10-repository.ts)
- [Two-engine real functional comparison](../../scripts/hydradb-gate10-ephemeral-parity.ts)
- [Disposable GitHub workflow](../../.github/workflows/hydradb-gate10-parity.yml)
- [Orbe production Neo4j adapter (unchanged)](../../apps/orbe-node/src/adapters/neo4j-driver-store.ts)
- [Original EvidenceGraphRepository interface](../../apps/orbe-node/src/domain/evidence-graph.ts)

**Security:** all database writes and the test input are restricted to GitHub-hosted ephemeral containers on loopback-only ports. Do not run the workflow on the MiniMac. No SSH/Tailscale; no DEV/MAIN secret/volume used.

## Significance for Nishkarsh

The project can keep its **application-level evidence and source contract** even when the graph engine changes, but **only by introducing an adapter and changing physical IDs, query expressions and provenance edges**. The results do not support direct adoption of existing Neo4j Cypher/driver (see [Gate 9](hydradb-gate9-dynamic-compatibility-2026-11-06.md)) nor claim lower total cost or faster production responses. The main challenge is preserving **every source on every claim**, role scopes, verification status, replay isolation and correct fallbacks.

**Follow-up completed:** [Gate 13](hydradb-gate13-public-minio-durability.md) verified public-PPKS + MinIO evidence persistence through HydraDB and MinIO restarts. **Next gaps:** interrupted-write recovery and backups, controlled benchmark with equal resources/protocol and immutable image digests, resolve Bolt and document an ADR keeping Neo4j operational until criteria are met.
