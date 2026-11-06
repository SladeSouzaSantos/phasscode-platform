# F4.3 second pilot — identical Cypher through the same Python HTTP client

**Prepared:** 2026-11-06. **Scope:** bounded synthetic HTTP round-trip comparison, **not** a database-engine benchmark or cost model.

## Why this second test was necessary

The first [F4.3 application-adapter pilot](hydradb-f43-public-adapter-pilot-2026-11-06.md) compared the **real Neo4j/Bolt repository implementation** with the **experimental HydraDB/HTTP repository implementation**. Its evidence was useful for application-level costs but could not isolate network/client differences.

Here, we use the **same Python standard-library HTTP client** to send **identical Cypher text and expected values** to both databases. The HTTP API shapes, database internals, storage representation and transaction overhead **still differ**; even this comparison cannot isolate pure database execution.

## Reproduction and fixture

- [GitHub Actions #42170201843 — success](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42170201843), [paired HTTP Python pilot](../../scripts/hydradb-gate16-http-pilot.py), [ephemeral engine workflow](../../.github/workflows/hydradb-gate9-runtime.yml).
- Same disposable GitHub-hosted pair as Gate 9; HydraDB 0.3.0 and Neo4j 5.26, both capped at **1.5 CPU / 2 GiB memory**.
- **Tiny synthetic graph**, just **two numeric-ID vertices (800100, 800101) and one typed edge**. Queries: one-hop `MATCH` to return target vertex ID; property-equality `MATCH` to return claim ID. Both engines returned **the same numeric values** for each case.
- Both endpoints were called via Python `urllib.request`; HydraDB's HTTP API uses scoped Bearer/typed results, while Neo4j's HTTP transactional API uses Basic authentication and JSON statement/result envelopes.
- **8 warmups + 96 timed requests per engine/query/concurrency series**; concurrency 1 and 4. **8 series × 96 = 768 timed round trips**. Errors **0**; semantic mismatches **0**.
- Cache warm only; both APIs and different response envelopes included in measured latency.

## Measurements (p50 / p95 / p99 in ms)

| Case | Concurrency | Neo4j HTTP | HydraDB HTTP |
| --- | ---: | --- | --- |
| 1-hop MATCH | 1 | 13.214 / 18.434 / 20.199 | 5.817 / 7.174 / 74.949 |
| 1-hop MATCH | 4 | 22.763 / 46.420 / 54.551 | 11.031 / 14.864 / 98.938 |
| Property filter | 1 | 11.790 / 17.290 / 118.652 | 6.664 / 7.261 / 7.631 |
| Property filter | 4 | 20.011 / 36.535 / 43.051 | 10.541 / 12.831 / 124.393 |

**Throughput at this small workload**, queries/s:

| Case | Concurrency | Neo4j HTTP | HydraDB HTTP |
| --- | ---: | ---: | ---: |
| 1-hop | 1 | 73.26 | 149.85 |
| 1-hop | 4 | 156.23 | 270.37 |
| Filter | 1 | 73.08 | 147.10 |
| Filter | 4 | 179.89 | 260.73 |

**Important observation:** HydraDB's HTTP request p50 and p95 are lower than Neo4j's in these four series, but **HydraDB had some relatively large p99 outliers (up to 124.393 ms)**, and Neo4j had a large p99 outlier on the property filter in concurrency 1 (118.652 ms). With **only 96 requests per series**, do not interpret p99 as a dependable tail-latency ranking. Repetition, instrumentation and more realistic data are required.

## Pinned OCI digest replication

We repeated the experiment using **immutable OCI digests** for both engines. [GitHub Actions #42170443030 — success](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42170443030) used:

- HydraDB `ghcr.io/hydra-db/hydradb@sha256:515ee78600b5d543f9146e62e775c76a8d5d0309773c165b918ed770649a91f3`
- Neo4j `neo4j@sha256:42ef3ebfd671ebd01fdebb6dcbe80cf7b45eef2aa3d346ef4132f7ef31e67d2f`

**All eight series passed**, returning expected values with no errors or mismatches. Another 768 HTTP calls were measured (total **1536** across both runs). Pinned second-run medians at concurrency 1:

| Query | Neo4j HTTP p50 (ms) | HydraDB HTTP p50 (ms) |
| --- | ---: | ---: |
| One hop | 8.324 | 4.220 |
| Property filter | 7.224 | 4.832 |

The relative direction of **median** latency was reproduced, but the **absolute values changed between GitHub runners**. Rare p99 spikes persisted (HydraDB one-hop 71.363 ms, Neo4j filter 137.961 ms in the second run), so tail latency cannot be reliably ranked from the sample sizes used.

## What this does and does not establish

The test shows an observed latency advantage for the **HydraDB HTTP query path** over the **Neo4j transactional HTTP query path** for *two tiny reads under the specific runner configuration*. It does **not** show HydraDB winning in large-scale graphs, joins, exact claims-source retrieval, cold caches, object-store S3 costs, concurrent writes, or general performance.

It narrows one confounder (the programming-language HTTP client), but **cannot equalize endpoint semantics, request/response serialization, graph query planner, indexing, JVM/GC, disk I/O or source-of-truth storage**.

**F4.3 remains open.** Before any technical adoption decision, compare larger datasets and S3-backed HydraDB with matched workload profiles, run replicated warm/cold tests, capture resource telemetry, evaluate dollar-cost and failure/consistency budgets. This pilot should appear in maintainer feedback as **preliminary evidence, not a product claim**.
