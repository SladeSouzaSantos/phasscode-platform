# F4.3 follow-up — MinIO-backed public PPKS benchmark with container sampling

**Date:** 2026-11-06. **Status:** successful exploratory application-adapter replication, not a fair isolated database-engine benchmark or cost estimate.

## Reproduction

- [GitHub Actions #42208031726 — success](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42208031726); work remains exclusive to `experiment/hydradb`.
- Same previous [paired MinIO adapter workflow](../../.github/workflows/hydradb-f43-minio-paired.yml) and [bounded benchmark](../../scripts/hydradb-gate15-adapter-benchmark.ts): 7 allowlisted public PPKS records, 10 skills, 14 claims, 16 individual evidence sources.
- Same original Neo4j adapter via JS Bolt 6.2.0; HydraDB via dedicated LAB HTTP adapter with S3-compatible MinIO backend; both engines have 1.5 CPU / 2 GiB quotas and pinned OCI engine images. MinIO is a third service capped at 1 CPU / 1 GiB.
- Verified full output before timing; **1024 measured method calls, 0 errors, 0 claim/source mismatches**; warm cache, concurrency 1 and 4, 8 warmups + 64 timed calls per series.
- Added [resource sampler](../../scripts/hydradb-f43-resource-sampler.py) which reads **only Docker one-shot stats** for named, ephemeral HydraDB, MinIO and Neo4j containers every ~1.5 seconds while the full original domain comparison/benchmark runs.
- Aggregate reports were printed into the workflow log and uploaded with the benchmark artifact (short-lived GitHub Actions retention). No environment, token, query payload, internal log or private academic data was collected.

## Latency replication

**Concurrency 1, p50/p95 (milliseconds):**

| Workload | Neo4j Bolt | HydraDB HTTP + MinIO |
| --- | --- | --- |
| One documented skill | 2.431 / 6.746 | **1.240 / 1.493** |
| Four skills | 7.894 / 21.935 | **4.358 / 5.083** |
| Missing Go | 1.438 / 3.875 | **0.669 / 0.721** |
| Specific public evidence source | 1.388 / 1.867 | **0.579 / 0.721** |

The relative direction of warm-cache application-level p50 latency agrees with the earlier [F4.3 MinIO run #42170722269](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42170722269), but the absolute measurements differ noticeably between ephemeral GitHub runners.

## Resource observations — do NOT interpret as cost or per-query utilization

Only **five complete samples per container** were collected during the workload. Docker-reported CPU percent is relative to a **single logical CPU**, so values above 100% are possible when several cores are used.

| Disposable service | CPU maximum (%) | Sample-mean CPU (%) | Max working set (MiB) | Sample-mean memory (MiB) | Samples |
| --- | ---: | ---: | ---: | ---: | ---: |
| HydraDB | 9.81 | 2.384 | 7.48 | 6.396 | 5 |
| MinIO | 10.33 | 3.054 | 84.33 | 66.980 | 5 |
| Neo4j | 152.10 | 109.420 | 571.00 | 379.544 | 5 |

**Why this is not enough to attribute efficiency:**

- Docker sampled CPU percentage is neither **CPU-seconds** nor resource cost. We did not continuously sample at high frequency or isolate seeding from the benchmark window; some samples may cover setup.
- Neo4j JVM heap/page cache and HydraDB cache accounting have different semantics; working-set and cgroup metrics cannot be compared as exact database-memory equivalents.
- The additional **MinIO** service and its physical storage/resource requests are separate from the HydraDB process. S3-compatible GET/PUT/LIST, number/size of objects, bytes uploaded/downloaded, egress, storage cost and cache misses were **not** recorded.
- The benchmark uses **different query shapes and transports**: original Neo4j Cypher via Bolt vs custom HydraDB HTTP queries with numeric IDs. It measures total repository-method round trips, not the server's isolated Cypher operator cost.
- Data volume and concurrency are tiny; no cold-cache, high-load, long-term cost, multiuser authorization or failure under load was measured.
- Each series is 64 requests, and p99 cannot be interpreted as a statistically reliable tail guarantee.

## Next F4.3 scientific acceptance tasks

1. Increase dataset sizes (hundreds/thousands of claims and sources from **public or synthetic** records) and repeat the same semantic assertions.
2. Collect finer-grained **total CPU-seconds**, RSS or working set, block I/O, process memory/GC where supported, per-request S3 I/O and storage volume; compare **effective cost per correct claim-source lookup**.
3. Separate cold/warm cache and startup/restart phases, and repeat across GitHub-hosted runners with serialized and randomized engine/workload order.
4. Run concurrency 1/4/10 with bounded total requests and error budget; avoid putting experimental workloads on MiniMac/DEV/MAIN.
5. Preserve evidence correctness and limits for every operation before considering an engineering adoption recommendation.

**Current F4.3 conclusion:** HydraDB/HTTP+MinIO shows encouraging, repeatable warm application-method latency in this small Orbe subset. **Neither pure engine superiority nor a cheaper production deployment has been proven.** Neo4j remains the operational Orbe graph backend.
