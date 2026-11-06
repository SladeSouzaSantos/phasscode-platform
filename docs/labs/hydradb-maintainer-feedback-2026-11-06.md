# HydraDB adoption feedback — a Neo4j-backed GraphRAG case study

**To:** Nishkarsh Srivastava / HydraDB maintainers  
**Prepared:** 2026-11-06  
**Project:** PHASSCODE Platform / Orbe — an evidence-grounded recruiting assistant  
**Status:** reproducible investigation, **not an Orbe migration**  
**Scope:** `experiment/hydradb`; no changes to production `main` or `dev` services

## Executive summary

Thank you for reaching out. We tested HydraDB v0.3.0 because we already had a real application using Neo4j and wanted to understand how an object-storage-native graph engine would fit an evidence-grounded GraphRAG workload. We deliberately tested **the graph retrieval and provenance contract**, not generic LLM response quality.

There were encouraging results: an adapted, public-PPKS-derived fixture maintained 13/13 logical evidence-query matches across two isolated LAB runs; eight of eleven value-checked adapted Cypher reads agreed between engines; and thirteen tested mutation/postcondition steps behaved as expected. We subsequently built a LAB-only TypeScript repository adapter implementing the **same application interface** as the Neo4j implementation: **20/20 synthetic scenarios and 24/24 individual source lookups matched**, including replay isolation and fallback. A separate MinIO-backed HydraDB test preserved two synthetic graph edges through a node/cache restart and a MinIO+node restart. However, **seven of nine original Orbe Neo4j queries returned HTTP 400 on HydraDB**, and the initial Neo4j JavaScript Bolt test failed with explicit database selection. A later, narrower Bolt matrix found that **two simple reads worked with no database selected**, while parametrized queries, explicit database selection and routed URI behavior remained problematic. This makes HydraDB an interesting prototype target, **not a drop-in Neo4j replacement for this application at v0.3.0**.

Reproduction: [Gate 9 CI run #42151726372](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42151726372) and the [full compatibility matrix](hydradb-gate9-dynamic-compatibility-2026-11-06.md).

## 1. The application we started with

Orbe supports an individual developer's public professional portfolio. It needs to answer recruiter questions accurately about technologies, experience, projects, courses, and their supporting evidence.

The backend is TypeScript/Fastify; the canonical professional knowledge base is a versioned PPKS set of structured records. An optional GraphRAG path uses LangGraph, Neo4j and a bounded internal graph reader. A language model can formulate the response, but **claims and sources must be grounded**; retrieval is not permission to invent expertise or assert employment. `off` is the documented default; `shadow` and `active` are explicit DEV opt-in modes. This description comes from repository code/docs, **not from a fresh audit of running deployments**.

Original logical path:

```text
Recruiter's question
  → Orbe lexical/curated retrieval and optional graph orchestration
  → canonical PPKS evidence (source of truth)
  → optional Neo4j projection / internal graph reader
  → qualified claims + individual source references
  → response with scope and evidence; fallback to canonical PPKS
```

The TypeScript `EvidenceGraphRepository` exposes `findEvidence(requirements, options)` and `getSource(sourceId)`. Evidence claims carry `subjectId`, `objectId`, `predicate`, `scope` and `sourceIds`; source records carry a verification status. We cannot equate a study project with professional employment, infer a certification from a graph edge, or return a claim when one of its required sources is missing.

**Why Neo4j originally fit:** a mature Cypher/Bolt ecosystem, atomic seed transactions, useful constraints/uniqueness semantics, a JavaScript driver and a direct projection from a source-controlled PPKS graph. **Why evaluate HydraDB:** to explore the object-storage graph approach and its retrieval/operational fit. We have **not yet** established a lower cost or faster end-to-end service.

Source code:
- [Graph domain contract](../../apps/orbe-node/src/domain/evidence-graph.ts)
- [Canonical PPKS projector](../../apps/orbe-node/src/adapters/ppks-evidence-graph.ts)
- [Fixed Neo4j Cypher queries and seed plan](../../apps/orbe-node/src/adapters/neo4j-graph-queries.ts)
- [Neo4j driver and transaction handling](../../apps/orbe-node/src/adapters/neo4j-driver-store.ts)
- [Orbe architecture README](../../README.md)

### What 'DEV/MAIN parity' means in this case

As of 2026-11-06, we inspected GitHub branches, not live deployments:

| Repository branch | Commit inspected | Relevant source files |
| --- | --- | --- |
| `main` | `c302ec444266333756d9f35bc9c1dfd7a5e7c684` | Four baseline files checked |
| `dev` | `747cd8243ac67d19b720bb7441aa0b969734f391` | Same four Git blob SHA-1s |
| `experiment/hydradb` | `c283df67c379357b3dae0354e89a73605b59bd72` | Same four Git blob SHA-1s |

This source-code comparison is also **independently reproducible in GitHub Actions**: [8/8 pinned Git blobs PASS — run #42160931106](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42160931106), using the [read-only baseline manifest](../../knowledge/evaluations/hydradb-orbe-source-baseline-v1.json) and [comparison script](../../scripts/hydradb-orbe-baseline-parity-check.py). It additionally verifies the PPKS index, semantic-relations JSON, package-lock and prompt v4, for **eight identical files** in all three branches.

The four exactly matching files are `domain/evidence-graph.ts`, `adapters/ppks-evidence-graph.ts`, `adapters/neo4j-graph-queries.ts` and `adapters/neo4j-driver-store.ts`. This establishes **source-code identity for that baseline**, not live database equality, identical environment variables, deployed SHA, current records, or response equivalence. No operational DEV/MAIN data was copied.

## 2. What we changed to work with HydraDB

We ported **a controlled subset of our evidence contract** into a separate LAB, not the running Orbe application.

| Area | Neo4j starting point | HydraDB LAB adaptation | Reason |
| --- | --- | --- | --- |
| Identity | External string IDs also used as graph IDs | Numeric internal vertex IDs; preserve external source keys as properties | Different accepted physical representation |
| Queries | Original fixed Cypher with `toLower`, `IN`, `WITH ... ORDER BY ... LIMIT`, constraint DDL, `count(n)` | Supported numeric-ID traversals and parameterized filters; normalize skill names on ingestion | Original query forms were not directly portable |
| Evidence model | Claim's `sourceIds` references and graph relationships | Explicit `SUPPORTED_BY` edges to every individual source vertex | Preserve claim-level provenance and avoid first-source-only results |
| Scope | Professional, mixed-role, project and study distinctions | Verify `mixed_role`, `professional`, `study` and per-source verification levels against PPKS | Avoid overstating professional experience |
| Dataset isolation | Original projection re-created from canonical source | Every LAB vertex/read uses a unique `lab_run` marker | Prevent a retained previous run from contaminating the next |
| Safety | Bounded Neo4j reads and canonical fallback | Read-only HydraDB shadow verification; mismatches/errors trigger canonical fallback | Experiment must not change recruiter-facing claims |
| Verification | Application tests plus graph contracts | Independent LAB, two-engine value comparisons, temporary CI containers, gated read-only MiniMac SHADOW | Make regressions reproducible without deployment risk |

**Correction discovered during testing:** an early query returned 12 rows instead of 6 because two retained copies of the fixture were read without a run-scoped filter. This was a **test-isolation issue**, not evidence of a HydraDB engine defect. Another early simplified fixture incorrectly categorized a Greencity role as wholly professional rather than `mixed_role`. We corrected the projection and kept its subsequent results distinct from the earlier sample.

See [PPKS contract and run-isolation correction](hydradb-ppks-contract.md), [shadow adapter](hydradb-ppks-ts-shadow-adapter.md) and [exploratory benchmark methodology](hydradb-ppks-benchmark-2026-11-05.md).

## 3. Evidence and observed results

### A. Evidence/provenance fidelity in LAB

The richer public-PPKS-derived fixture contained **7 records, 10 skills, 14 claims, 16 specific source IDs, 47 vertices and 60 relations**. On two separate runs, **13/13 logical evidence-query cases per engine** matched, with isolated run IDs. The suite checked sources by ID, claim-source completeness and role scope.

This proves **parity for the adapted fixture**, not that the original Neo4j adapter runs unmodified on HydraDB.

### B. Read-only recruiter scenarios in LAB

The Gate 8 OFF/SHADOW [MiniMac CI run #42144901903](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42144901903) succeeded. A separate 20-question synthetic evaluation consumed **pre-annotated technology requirements** and recorded **38/38 claim matches**, **103/103 source references**, **36 `graph_verified` decisions** and **10 expected `canonical_fallback` decisions**.

This validates selected evidence/fallback contracts, **not** human-reviewed natural-language understanding, response quality or database performance. Do not combine these counts as if they all came from the 47-vertex fixture.

### C. Exact Orbe Cypher vs adapted Cypher — reproducible disposable CI

[GitHub Actions run #42151726372](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42151726372) used two *fresh* GitHub-hosted containers, HydraDB `ghcr.io/hydra-db/hydradb:0.3.0` and Neo4j `neo4j:5.26`, synthetic data, randomly generated local credentials and disposable storage.

| Comparison | HydraDB observed | Neo4j control |
| --- | --- | --- |
| Nine **unmodified** Orbe Cypher operations | **7 HTTP 400**; 2 executed without validating full prune semantics | All 9 executed |
| Eleven **adapted** read probes, checking returned values | **8/11 matched**; 3 HTTP 400 | 11/11 matched |
| Thirteen mutation and postcondition steps | **13/13 passed** | 13/13 passed |
| Four reads via Neo4j JS Bolt driver (original, explicit `database:'lab'` setup) | **4/4 failed** | 4/4 passed |

**Additional, independent Bolt finding (digest-pinned #42171683734):** three fresh JavaScript-driver attempts per database variant exposed inconsistent connectivity and query behavior with JS `neo4j-driver` **6.2.0**. A separate **Python Neo4j driver 6.4.1** tested the *same ephemeral HydraDB graph*: the labeled read, 1-hop read and **bound-parameter 1-hop read all matched** with `database=default`, database omitted, and routed `neo4j://` to `default`; all three were rejected with `database=lab`. In contrast, repeated JavaScript trials showed `ERR_OUT_OF_RANGE` or `InvalidSyntax` and `ServiceUnavailable` on routing. No single configuration can yet be recommended for the Orbe TypeScript client. [Full repeated JS / independent Python Bolt matrix](hydradb-gate14-bolt-driver-matrix-2026-11-06.md), [run #42171683734](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42171683734). This is evidence of a driver/configuration-dependent interoperability gap, **not an identified root cause**.

**Gate 14 supersedes any general claim that Bolt cannot read from HydraDB:** [run #42169010048](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42169010048) using JavaScript neo4j-driver **6.2.0** returned **correct values for two simple `MATCH` reads** with a `bolt://` session **without** an explicit database. A parameterized one-hop read still failed with `InvalidSyntax` (the identical Cypher succeeded over HTTP). Explicit database names `lab`/`default` produced `ERR_OUT_OF_RANGE` during connectivity; routed `neo4j://` produced `ServiceUnavailable`. Another literal-only query failed on **both HTTP and Bolt**, indicating a query-language limitation, not a Bolt-only defect. [Minimal matrix and reproducible report](hydradb-gate14-bolt-driver-matrix-2026-11-06.md). These are observations, not root-cause attribution.

The successful mutation tests covered `CREATE`, `MERGE` with repeated-idempotence check, `SET`, `UNWIND`, `DELETE` and `DETACH DELETE` with observable postconditions. The three failed adapted read forms were `WITH ... ORDER BY ... LIMIT`, `toLower()` and `count(n)`.

Simple `IN` and `IS NULL` predicates passed **both positive and negative value controls over HTTP**, even though the pinned upstream [v0.3.0 Cypher documentation](https://github.com/hydra-db/hydradb/blob/v0.3.0/cypher-compat.md) describes them as unsupported. This is worth clarifying, but **does not prove general support**.

**Interpretation:** the CI marked success because the diagnostic completed and reported mismatches correctly. It did **not** certify the original Orbe Cypher as HydraDB-compatible.

### D. EvidenceGraphRepository end-to-end contract across both engines (Gate 10)

The [real disposable engine run #42162281328](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42162281328) used **the original production Neo4jGraphStore seed and Neo4jEvidenceRepository class unchanged** as a reference, with a **new LAB-only HydraDB EvidenceGraphRepository** over fixed HTTP Cypher. Both repositories consumed a schema-validated **synthetic fixture (19 nodes, 10 domain relations, 4 claims, 6 individual sources)**.

The results were **20/20 application-method scenario comparisons and 24/24 specific-source lookups**, including professional Java, study Java, mixed-role Flutter, personal-project Flutter, explicit absence of Go, one-claim limits retaining all supporting sources, deterministic per-source evidence status, idempotent seeding, separate run IDs, and injected failure with canonical fallback. This is a **meaningful application-interface reproduction**, not a live Orbe rollout or complete copy of all PPKS records.

[Gate 10 verified report](hydradb-gate10-evidence-repository-parity.md), [adapter source](../../scripts/hydradb-gate10-repository.ts), [real comparison runner](../../scripts/hydradb-gate10-ephemeral-parity.ts).

### E. Reproducing real *public PPKS* evidence through the original Orbe repository (Gate 12)

The expanded [Gate 12 GitHub Actions run #42164035756](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42164035756) then reused **the same original Orbe Neo4j adapter** against a larger, **allowlisted seven-record public PPKS dataset**: 10 skills, 14 claims and 16 individual evidence sources. This was **not the smaller fully invented four-claim Gate 10 fixture**.

The domain-validated PPKS projection for this test had **50 nodes and 46 domain relations** (its physical scheme includes candidate/company/engagement nodes, different from the older 47-node/60-edge Gate 3 fixture). We compared every returned **claim, role scope, evidence source and verification status**, including the source-existence method, unknown Go, limits of one and twenty claims, replaying the ingestion and isolating consecutive runs.

The combined real-engine report confirmed **88/88 requirement-level comparisons and 64/64 individual source lookups** with identical normalized application-level outputs. No private academic data was read, and neither DEV nor MAIN databases were accessed. It demonstrates evidence-contract reproducibility **for a selected public subset**, not a complete Orbe migration or production readiness.

[Gate 12 report and test provenance](hydradb-gate12-public-ppks-parity.md), [public-only fixture](../../scripts/hydradb-gate12-public-ppks-fixture.ts), [two-engine comparator](../../scripts/hydradb-gate10-ephemeral-parity.ts).

### F. Object-storage durability across restarts (Gate 11)

The [MinIO experiment #42162965498](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42162965498) connected HydraDB to a fresh, S3-compatible **MinIO bucket** in an ephemeral GitHub runner and wrote two synthetic relationships: record→skill and claim→supporting source. It read back both values, **replaced HydraDB with a new empty local cache**, read again, then **replaced the MinIO container and HydraDB node while keeping the same bucket data** and read again.

All three reads produced the same result SHA-256 digest: `77b10d56d1b608bee6583cd1ce37d34e9071bc97fab174f77c181b916f8a799b`. We subsequently reproduced this object-store test using immutable image digests (Gate 11 pinned run #42165160104). This demonstrates simple persistence in that setup, **not backup/restore, high availability, competing writers, or consistency under load**.

The initial MinIO harness failed for non-database reasons: Docker Hub no longer served the upstream v0.3.0 script's `minio/minio` image, and Quay returned HTTP 401. We recovered using a maintained **Chainguard MinIO container**, with no change to the HydraDB engine. This is potentially useful reproducibility feedback for HydraDB's [v0.3.0 MinIO smoke script](https://github.com/hydra-db/hydradb/blob/v0.3.0/scripts/minio_smoke.sh).

[Gate 11 durability and registry incident report](hydradb-gate11-minio-durability-2026-11-06.md).

### G. Public PPKS source evidence survives object-store restarts (Gate 13)

After establishing application-level parity on seven public PPKS records in Gate 12, we persisted **the same 14 claims and 16 individual source records** through the MinIO-backed HydraDB graph, rather than only the two synthetic relations from Gate 11. The [Gate 13 CI run #42164536310](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42164536310) was successful and verified **46 graph edges**, all sources and the original PPKS evidence contract before and after **replacing the HydraDB node/local cache**, then again after **restarting MinIO plus HydraDB** with the same object-store data.

The three checks returned identical normalized results with SHA-256 `ff31a03e8697b992023097f67f6ff77ac33de3635a9836ba60c8557990ab1513`. The query contract verified **11 requirements, 16 individual sources and 30 claim-source references** on the 12 eligible claims; the remaining two unknown-scope claims were correctly excluded from recruiter-facing search. All data came from the public subset; no academic or operational DEV/MAIN data was read.

**Limit:** this proves only persistence with the same isolated MinIO bucket volume under two service restart sequences. It does **not** test a crash during writes, multi-writer behavior, backups, simultaneous failures or object-storage durability guarantees. [Reproducible report and scripts](hydradb-gate13-public-minio-durability.md).

### H. F4.3 performance pilots: promising latency, deliberately limited conclusions

We subsequently ran **three bounded forms of controlled but not yet equivalent benchmark** on GitHub-hosted, disposable, Docker resource-limited graph engines. The older MiniMac HTTP microbenchmark had unequal CPU/memory quotas and query paths; its much larger ratio **must not be presented as a fair engine-performance comparison**.

**First, the actual Orbe repository interface (Gate 15):** On the same seven public PPKS records, we compared the *unchanged Neo4j/Bolt adapter* against our *HydraDB/HTTP LAB adapter*. Each run measured **1024 method requests** (four workflows, concurrency 1/4, eight warmups + 64 measured per group), validating every response. **Three independent runs passed**, including a third with **immutable OCI image digests** and driver 6.2.0, without errors or claim/source mismatches. At concurrency 1 in the third run, the median for **one skill** was **3.601 ms Neo4j/Bolt vs 1.978 ms HydraDB/HTTP**; for **four skills**, **10.868 vs 7.384 ms**. [Report and three run links](hydradb-f43-public-adapter-pilot-2026-11-06.md).

**Second, identical text over the same HTTP client (Gate 16):** Both databases received the same two simple Cypher statements from Python `urllib`. In the pinned-digest repetition, the 1-hop query p50 was **8.324 ms Neo4j HTTP vs 4.220 ms HydraDB HTTP**; a property filter was **7.224 vs 4.832 ms**. Each of the two runs measured **768 simple HTTP round trips** with zero semantic mismatches. This reduces *one* confounder (client language), but the HTTP server protocol and transaction semantics still differ; there were **rare p99 spikes on both engines**. [Paired HTTP methodology and results](hydradb-f43-paired-http-pilot-2026-11-06.md).

**Third, the same public PPKS application interface with HydraDB actually backed by MinIO object storage:** [run #42170722269](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42170722269) validated the domain contract and completed another **1024 measured application-method calls without errors or mismatches**. The median for one skill was **3.452 ms Neo4j/Bolt vs 2.112 ms HydraDB/HTTP/MinIO**; four skills **11.562 vs 7.427 ms**. This test uses **S3-compatible MinIO as HydraDB's durable store**, not only local storage. [Full warm-cache MinIO benchmark and caveats](hydradb-f43-minio-adapter-pilot-2026-11-06.md).

**Interpretation:** HydraDB's adapted HTTP path showed **lower observed median application-request latency** across these limited pilots. This is interesting evidence for our workload, **not** proof that HydraDB's internal query engine beats Neo4j, nor that it is cheaper at scale. The storage models, physical query plans, Bolt/HTTP overhead, GC/cache configuration and MinIO's third container are different; **cold caches, large datasets, S3 request counts, operational dollar costs, CPU/RAM/I/O time series and full Orbe+LLM latency remain unmeasured**. We would welcome a recommendation for a fair next benchmark design.

## 4. What our migration attempt did not prove

- Orbe `main` or `dev` has **not been switched to HydraDB**; no end-to-end recruiter responses were directly compared between a deployed HydraDB Orbe and deployed Neo4j Orbe.
- A full `EvidenceGraphRepository` implementation in HydraDB is **not yet validated** for all typed entities and the entire current public PPKS snapshot.
- **Bolt query compatibility remains partial**: two simple reads work with implicit database selection; parameterized queries, explicit database naming and routed URI behavior are not yet working in our v0.3.0 JS-driver matrix (Gate 14).
- The original Neo4j snapshot/transaction, pruning and uniqueness guarantees are **not yet proven equivalent**.
- **MinIO persistence across node/cache and service restarts passed** on a synthetic fixture (Gate 11) and the 14-claim/16-source public subset (Gate 13). **Preliminary warm-cache adapter performance pilots also passed** (F4.3), but interrupted writes, fencing, backups, tenancy, bookmarks, object-storage I/O cost, cold-cache/large-data benchmarking and a controlled production-scale comparison remain open.
- Our synthetic labels are not independent human-reviewed gold for an NLP claim.

For an externally useful conclusion, all of these should remain identified as gaps, not silently upgraded into successes.

## 5. Questions for Nishkarsh / where feedback could help

1. **Bolt v0.3.0 / cross-language driver discrepancy**: In separate pinned-run tests, JS `neo4j-driver` 6.2.0 failed repeatedly or behaved inconsistently under explicit/implicit database selection and routing. However, Python driver 6.4.1 successfully ran three `MATCH` queries, including `$id` binding, with `default` or unspecified database and even routed `neo4j://` to `default` (while `lab` failed). Are there documented driver-version/protocol differences, graph/namespace mappings or client options that explain this? We can share [independent JS/Python reproductions](hydradb-gate14-bolt-driver-matrix-2026-11-06.md) and [CI output #42171683734](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42171683734).
2. **Cypher support contract**: Are simple `IN` and `IS NULL` expressions intentionally supported in the v0.3.0 HTTP query path despite the documentation? Are `WITH ... ORDER BY ... LIMIT`, `toLower` and `count(n)` expected to be added, or should an adapter deliberately avoid them?
3. **Neo4j migration idioms**: What is the recommended schema/query pattern for string business keys mapped to numeric vertex IDs, claim-to-source provenance edges, deterministic pagination and constrained/idempotent upserts?
4. **Object-store durability**: Our basic MinIO write→restart→read experiment passed across HydraDB cache and MinIO service replacements. What *next* fault/consistency tests would you recommend for interrupted writes, writer takeover, read-your-writes, bookmarks and recovery? Could the upstream MinIO smoke harness be updated to pull a maintained, publicly accessible image?
5. **Performance and cost**: We have preliminary warm-cache pilots: real Orbe adapter versus adapter (Bolt vs HTTP), identical tiny Cypher sent via the same Python HTTP client, and an S3-compatible MinIO-backed HydraDB adapter. What production-representative dataset, protocol approach, object-store request/byte metrics and cost model would you recommend to make the next comparison genuinely fair?

Written discussion would be ideal: **I don't speak English, so I cannot comfortably participate in a voice call, but I'd be very glad to continue by email with translation assistance** and share minimal reproductions. I also appreciate that you took the time to notice the Neo4j improvements in my portfolio. I'm transitioning back into dedicated software development and still learning more about graph database internals, so I welcome corrections to my test methodology. The findings are application-level feedback rather than a claim that the engine is generally broken.

## 6. What remains before calling it a migration

**We now have two reproducible application-interface comparisons: Gate 10's wholly synthetic fixture and Gate 12's selected public PPKS fixture, the latter with 88/88 requirement and 64/64 source parity checks**. Both use the original Neo4j repository and an adapted HydraDB LAB implementation. Replay/idempotence, evidence scoping, source completeness and safe fallback were tested under bounded conditions. **Gate 11 proved minimal MinIO persistence and Gate 13 reproduced restart persistence for the public PPKS claim/source subset.**

Next we intend to **expand beyond the seven public records / first-two-skills-per-record subset**, resolve the remaining Bolt parameter/database/routing questions, and test interrupted-write recovery, backups and stronger isolation. Gate 13 has already proven basic MinIO restart persistence of the selected public source dataset, so that check is no longer pending. **Initial bounded F4.3 measurements are now available**, but controlled large-data performance, cold-cache testing and operational cost evaluation remain pending.

**Verdict remains: HydraDB requires a dedicated adapter; it is not yet a drop-in Neo4j replacement for the deployed Orbe service.** The [acceptance protocol](hydradb-dev-main-parity-plan.md) distinguishes completed synthetic checks from pending real-application and larger-fixture checks.

## 7. How to reproduce and audit the claims

- [F4.3 — S3/MinIO-backed public-PPKS adapter pilot](hydradb-f43-minio-adapter-pilot-2026-11-06.md)
- [F4.3 — three local-adapter pilot runs and measurements](hydradb-f43-public-adapter-pilot-2026-11-06.md)
- [F4.3 — two paired Python HTTP/Cypher pilots](hydradb-f43-paired-http-pilot-2026-11-06.md)
- [Gate 13 — public PPKS object-store durability report](hydradb-gate13-public-minio-durability.md)
- [Gate 13 — reproducible public-data MinIO CI](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42164536310)
- [Gate 12 — public PPKS adapter parity report (88 requirements, 64 sources)](hydradb-gate12-public-ppks-parity.md)
- [Gate 12 — real two-engine public parity CI](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42164035756)
- [Gate 10 — application-interface parity report](hydradb-gate10-evidence-repository-parity.md)
- [Gate 10 — real two-engine parity run](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42162281328)
- [Gate 11 — MinIO restart and durability report](hydradb-gate11-minio-durability-2026-11-06.md)
- [Gate 11 — MinIO real CI run](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42162965498)
- [Exact Orbe Cypher fixture generator](../../scripts/gate9-runtime-fixture.ts)
- [Disposable HydraDB/Neo4j GitHub Actions workflow](../../.github/workflows/hydradb-gate9-runtime.yml)
- [HTTP compatibility + mutation runner](../../scripts/hydradb-gate9-disposable-runtime.py)
- [Gate 14 — Bolt matrix report (partial positive results)](hydradb-gate14-bolt-driver-matrix-2026-11-06.md)
- [Gate 14 — real diagnostic run](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42169010048)
- [Bolt driver reproducer](../../scripts/gate9-disposable-bolt.mjs)
- [Full original-query and portable-query matrix](hydradb-gate9-dynamic-compatibility-2026-11-06.md)
- [Read-only OFF/SHADOW workflow](../../.github/workflows/hydradb-lab-validate.yml)
- [PPKS evidence/claim contract](hydradb-ppks-contract.md)
- [GitHub issue F4.1 / Gate 9](https://github.com/SladeSouzaSantos/phasscode-platform/issues/36)
- [GitHub issue F4.2 / experimental PoC](https://github.com/SladeSouzaSantos/phasscode-platform/issues/37)

**Release identity:** the Gates 11 and 13 durability runs were repeated with immutable HydraDB/MinIO OCI digests ([Gate 11 #42165160104](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42165160104), [Gate 13 #42165160131](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42165160131)). **Later** Gate 9 diagnostics and F4.3 adapter comparison runs also used pinned HydraDB/Neo4j images ([Bolt #42171683734](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42171683734), [adapter #42169837428](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42169837428)); initial earlier runs were version-tag based. This still does **not** settle unequal Bolt/HTTP transport, native query shapes, CPU/cache/GC implementation, S3 traffic, larger datasets and total operational costs.

---

**Summary for maintainers:** HydraDB successfully supported useful adapted graph operations in our experiments, especially numeric-ID traversal, basic aggregates and mutation primitives. Porting a real evidence-backed Neo4j application still required data-model and Cypher changes. We can provide clear reproductions for the Bolt queries and runtime/documentation discrepancies. We would welcome guidance on compatibility, best-practice migration and object-storage durability before proceeding to performance comparisons.
