# F4.3 — first controlled public-PPKS adapter latency pilot

**Prepared:** 2026-11-06. **Status:** pilot PASS with correct responses; **NOT** a proof of engine-level superiority or cost advantage.

## Reproducible scope

- [GitHub Actions #42169405208 — success](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42169405208). Benchmark routine: [hydradb-gate15-adapter-benchmark.ts](../../scripts/hydradb-gate15-adapter-benchmark.ts), invoked **after** successful same-domain Gate 10/12 evidence checks in [hydradb-gate10-ephemeral-parity.ts](../../scripts/hydradb-gate10-ephemeral-parity.ts).
- Both live database engines are disposable containers **on the same GitHub-hosted Linux runner**, with container quotas of **1.5 CPUs and 2 GiB each**. Neo4j 5.26 is given a max heap of 512 MiB; its heap/pagecache and HydraDB memory architecture are **not physically equivalent**.
- Same allowlisted public data subset from the Orbe PPKS: **7 records, 10 skills, 14 claims, 16 individual sources**. The original production **Neo4jGraphStore / Neo4jEvidenceRepository** ran against Neo4j. An independent **LAB-only** EvidenceGraphRepository adapter ran against HydraDB 0.3.0.
- The experiment measures **application-level query round trips**: **Neo4j driver 6.2.0 via Bolt** versus **HydraDB REST HTTP via Node fetch**. These are intentionally the working integrations, **not identical transports**; Bolt compatibility on HydraDB is still partial.
- Four operations: `findEvidence` for a documented skill; four documented skills; missing Go; and `getSource` for a specific source. Each series had **8 warmups + 64 measured operations**, at **concurrency 1 or 4**, giving **16 distinct series and 1024 measured method calls**.
- All measured responses were validated against a canonicalized reference **outside the timed database-call interval**, preserving the typed claim/source contract. **0 transport errors, 0 semantic mismatches.**
- Concurrency level 4 deliberately reversed the engine order to reduce systematic test-order bias; it is not a randomized crossover study. **Warm-cache only**, no cold-start claim.

## Observed read latency

**p50 / p95 / p99 in milliseconds**, rounded to 3 decimals:

| Operation | Concurrency | Neo4j via Bolt p50/p95/p99 | HydraDB via HTTP p50/p95/p99 |
| --- | ---: | --- | --- |
| One skill | 1 | 3.890 / 20.965 / 30.053 | 2.035 / 2.730 / 2.903 |
| Four skills | 1 | 11.039 / 37.625 / 39.508 | 7.375 / 7.829 / 9.222 |
| Absent Go | 1 | 2.324 / 3.651 / 26.681 | 0.925 / 1.012 / 1.217 |
| Specific source | 1 | 2.134 / 3.081 / 22.645 | 0.926 / 1.000 / 1.045 |
| One skill | 4 | 9.869 / 47.758 / 77.522 | 6.903 / 9.602 / 12.464 |
| Four skills | 4 | 27.707 / 65.138 / 67.308 | 24.422 / 30.010 / 33.665 |
| Absent Go | 4 | 5.266 / 6.538 / 7.021 | 2.177 / 3.154 / 4.415 |
| Specific source | 4 | 5.014 / 12.015 / 12.531 | 2.089 / 2.816 / 3.216 |

**Throughput observed** in completed application-level calls per second; affected by client overhead, network/transport, request fan-out and engine execution:

| Operation | Concurrency | Neo4j/Bolt ops/s | HydraDB/HTTP ops/s |
| --- | ---: | ---: | ---: |
| One skill | 1 | 176.57 | 463.99 |
| Four skills | 1 | 69.53 | 133.99 |
| Absent Go | 1 | 335.82 | 1064.68 |
| Specific source | 1 | 355.76 | 1064.34 |
| One skill | 4 | 231.62 | 580.32 |
| Four skills | 4 | 101.01 | 158.79 |
| Absent Go | 4 | 731.69 | 1648.28 |
| Specific source | 4 | 739.60 | 1833.45 |

## Correct reading of the results

**Observed:** the HydraDB HTTP LAB adapter returned lower p50/p95 and higher measured throughput than the Neo4j Bolt adapter in all eight bounded conditions **in this run**, while preserving tested domain values.

**Not established:** that HydraDB's query executor or storage engine is faster than Neo4j. There are critical remaining confounders:

1. **Protocol mismatch:** Bolt (official Neo4j driver) vs HTTP (custom HydraDB adapter); different request preparation, session handling, network round trips, connection pooling and result hydration.
2. **Different physical representations / Cypher:** the Neo4j adapter executes the real Orbe queries; HydraDB uses numeric IDs and different Cypher shapes. These differ in query count, row shapes and indexes.
3. **Resource equalization is partial:** matching container ceilings does not equalize managed JVM heap, GC, page cache or HydraDB local caching behavior; no continuous CPU/RAM/I/O sampling was recorded.
4. **HydraDB used local file storage**, not the MinIO object store used in Gates 11 and 13. Therefore these numbers do not represent the actual object-storage-backed latency/cost profile.
5. **Dataset and sample sizes:** just seven records, 64 timings per series, one runner, warmed cache and concurrency only 1/4. In particular, p99 from 64 samples is a noisy statistic.
6. No cold-cache, reload, start-time, network latency, node-failure, cache pressure, S3 request charges, object storage pricing, host-specific JVM tuning, or full end-to-end Orbe response time was measured.

The historical MiniMac microbenchmark's much larger p50 ratio (40.7×) is **not comparable** to this better-controlled, much smaller pilot; memory/CPU and transport paths were not matched. Do **not** combine their ratios.

## Acceptance steps to complete F4.3

- Capture exact **immutable OCI digests** for both images and the Neo4j JS driver version (the workflow logs record image identity; re-run pinned).
- Compare identical HTTP query paths/semantics where feasible and separately report **adapter-protocol overhead** instead of attributing all differences to the database.
- Run an equivalent workload with **HydraDB + actual MinIO** (not local filesystem) and add cold/warm phases, more realistic fixture sizes and repetition across multiple runner launches.
- Continuously record CPU, RSS, I/O, cache read/write, S3 object requests and resulting storage size. Include actual cost model for the intended deployment scale.
- Expand concurrency with caps and timeouts (e.g. 1/4/10) on disposable GitHub-hosted infrastructure only; verify every returned claim and source under load.
- Include explicit server-side Cypher execution when supported by both engines and disclose when transport or data-model equivalence is impossible.
- Create an architectural decision record (F4.4) only when the remaining integration/performance/cost signals are trustworthy.

**Operational decision:** Neo4j remains the production reference. No action was taken on DEV/MAIN/MiniMac, no email sent, and this pilot does not authorize migration.
