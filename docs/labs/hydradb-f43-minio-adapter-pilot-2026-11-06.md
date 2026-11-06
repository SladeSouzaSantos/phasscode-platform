# F4.3 — public PPKS adapter latency with HydraDB on MinIO object storage

**Date:** 2026-11-06. **Status:** application-level pilot **PASS**, no conclusion of general database superiority. This is the **MinIO-backed variant**, using the same contract and sample as the earlier [local-HydraDB adapter pilot](hydradb-f43-public-adapter-pilot-2026-11-06.md).

## Test and provenance

- [GitHub Actions run #42170722269 — success](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42170722269), [workflow](../../.github/workflows/hydradb-f43-minio-paired.yml); emitted artifact `hydradb-f43-minio-pilot-42170722269` and fully cleaned the ephemeral runner.
- **HydraDB v0.3.0** connected through AWS S3-compatible configuration to a **fresh Chainguard MinIO** bucket in an isolated Docker network; all MinIO/HydraDB OCI images **pinned by SHA-256 digest** via the audited Gate 11 setup. Neo4j 5.26 from a pinned OCI digest launched alongside on the **same GitHub-hosted runner**.
- Engine container limits: **1.5 CPU / 2 GiB RAM each**. MinIO ran as an additional storage service with **1 CPU / 1 GiB limit**; Neo4j's local disk store and the HydraDB/MinIO object store differ by architectural design.
- **Same seven selected public PPKS records**: 10 skills, 14 claims, 16 sources. We first verified the full Gate 10 synthetic contract and Gate 12 public claim/source semantic comparison **against the original Neo4j production adapter and independent LAB HydraDB HTTP adapter**. All **88/88 requirements and 64/64 individual source reads** in the public parity phase passed before the benchmark.
- Four application scenarios: single skill, four skills, absent Go, and a specific evidence source lookup. **16 series of 64 timed requests**, each after eight warmups, concurrency **1 and 4**; **1024 measured method invocations**. Every return validated against a typed, normalized, correct response. No errors, no mismatches.
- This evaluates **warm-cache application API latency**, not a hardware-adjusted engine benchmark; it does **not** instrument object-store requests made on each query or prove network durability/consistency.

## Measurements, single-client (concurrency=1)

p50/p95/p99 times in ms:

| Operation | Neo4j/Bolt | HydraDB/HTTP backed by MinIO |
| --- | --- | --- |
| One skill | 3.452 / 6.325 / 29.663 | **2.112 / 2.738 / 4.959** |
| Four skills | 11.562 / 31.820 / 44.176 | **7.427 / 8.287 / 8.654** |
| Absent Go | 2.312 / 2.955 / 22.825 | **1.002 / 1.377 / 5.663** |
| Specific source | 2.021 / 2.447 / 17.513 | **0.996 / 1.235 / 1.336** |

Observed throughput (completed application-method invocations per second, including client overhead):

| Operation | Neo4j/Bolt | HydraDB/MinIO HTTP |
| --- | ---: | ---: |
| One skill | 210.00 | 435.89 |
| Four skills | 69.18 | 131.99 |
| Absent Go | 339.14 | 882.43 |
| Specific source | 433.36 | 962.33 |

The report artifact also contains all **eight concurrency-4 engine series** with p50/p95/p99, throughput and response integrity counts.

## Comparison with the earlier local-HydraDB pilot

Local-HydraDB third run (pinned images): one-skill HydraDB HTTP p50 **1.978 ms**, four-skills **7.384 ms**; this **MinIO-backed run** was **2.112 ms** and **7.427 ms**, respectively. These values are close for the small **warmed** working set.

**Do not infer that MinIO adds only ~0.1 ms**, or that every graph query makes a remote S3 call. They are **different GitHub Actions executions on different ephemeral runners**, with tiny warmed caches, different co-scheduled service counts and no object-store request telemetry. Correctly, the evidence only says that the *observed hot-cache app-level responses remained low* with the HydraDB MinIO backend on this fixture.

## Causal and operational caveats

1. **Transport mismatch remains:** Neo4j uses its JavaScript Bolt driver and the original Orbe Cypher; HydraDB uses a custom HTTP adapter and changed numeric-ID query expressions.
2. Although engine Docker CPU/memory caps were equal, the **Neo4j heap/pagecache and HydraDB local caching differ**; MinIO also occupies a third container with its own resource usage.
3. **Object-store economics are not yet measured.** Need count S3-compatible GET/PUT/LIST, bytes, storage GB-month and egress, and actual compute CPU/RAM utilization for each motor.
4. No cold-cache, process restart during benchmark, replica/writer turnover, fault injection or multiuser tenant isolation was tested. Gate 13 is a separate proof of restart persistence, not of performance under failures.
5. Dataset is very small; 64 samples per series, p99 unstable; no large graphs, high concurrency, or end-to-end Orbe LLM latency.
6. Source completeness and scopes were asserted before timing and for every measured result. The tests are developer evidence, not independent database certification.

## Implications for the user and HydraDB founder

The S3-backed option can satisfy our bounded **public evidence retrieval contract** and showed promising warm application-level latency, but **it still requires a dedicated HydraDB adapter and does not directly support all Neo4j Cypher/Bolt behaviors**. It may warrant further experiments; it does **not** justify migrating the operational Orbe or claiming lower cost yet.

**Next F4.3 items:** matched cold/warm repeated tests, wider fixture/data sizes, CPU/RAM/IO telemetry, object-store traffic and a real deployment cost model, concurrency escalation, and an ADR that preserves rollback and licensing review.
