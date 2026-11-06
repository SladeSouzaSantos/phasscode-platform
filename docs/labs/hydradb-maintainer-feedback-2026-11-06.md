# HydraDB adoption feedback — a Neo4j-backed GraphRAG case study

**To:** Nishkarsh Srivastava / HydraDB maintainers  
**Prepared:** 2026-11-06  
**Project:** PHASSCODE Platform / Orbe — an evidence-grounded recruiting assistant  
**Status:** reproducible investigation, **not an Orbe migration**  
**Scope:** `experiment/hydradb`; no changes to production `main` or `dev` services

## Executive summary

Thank you for reaching out. We tested HydraDB v0.3.0 because we already had a real application using Neo4j and wanted to understand how an object-storage-native graph engine would fit an evidence-grounded GraphRAG workload. We deliberately tested **the graph retrieval and provenance contract**, not generic LLM response quality.

There were encouraging results: an adapted, public-PPKS-derived fixture maintained 13/13 logical evidence-query matches across two isolated LAB runs; eight of eleven value-checked adapted Cypher reads agreed between engines; and thirteen tested mutation/postcondition steps behaved as expected. We subsequently built a LAB-only TypeScript repository adapter implementing the **same application interface** as the Neo4j implementation: **20/20 synthetic scenarios and 24/24 individual source lookups matched**, including replay isolation and fallback. A separate MinIO-backed HydraDB test preserved two synthetic graph edges through a node/cache restart and a MinIO+node restart. However, **seven of nine original Orbe Neo4j queries returned HTTP 400 on HydraDB**, and four simple reads through the Neo4j JavaScript Bolt driver failed with `Neo.ClientError.Statement.InvalidSyntax` after connectivity succeeded. This makes HydraDB an interesting prototype target, **not a drop-in Neo4j replacement for this application at v0.3.0**.

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
| Four reads via Neo4j JS Bolt driver | `verifyConnectivity` succeeded, but **4/4 returned `InvalidSyntax`** | 4/4 passed |

The successful mutation tests covered `CREATE`, `MERGE` with repeated-idempotence check, `SET`, `UNWIND`, `DELETE` and `DETACH DELETE` with observable postconditions. The three failed adapted read forms were `WITH ... ORDER BY ... LIMIT`, `toLower()` and `count(n)`.

Simple `IN` and `IS NULL` predicates passed **both positive and negative value controls over HTTP**, even though the pinned upstream [v0.3.0 Cypher documentation](https://github.com/hydra-db/hydradb/blob/v0.3.0/cypher-compat.md) describes them as unsupported. This is worth clarifying, but **does not prove general support**.

**Interpretation:** the CI marked success because the diagnostic completed and reported mismatches correctly. It did **not** certify the original Orbe Cypher as HydraDB-compatible.

### D. EvidenceGraphRepository end-to-end contract across both engines (Gate 10)

The [real disposable engine run #42162281328](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42162281328) used **the original production Neo4jGraphStore seed and Neo4jEvidenceRepository class unchanged** as a reference, with a **new LAB-only HydraDB EvidenceGraphRepository** over fixed HTTP Cypher. Both repositories consumed a schema-validated **synthetic fixture (19 nodes, 10 domain relations, 4 claims, 6 individual sources)**.

The results were **20/20 application-method scenario comparisons and 24/24 specific-source lookups**, including professional Java, study Java, mixed-role Flutter, personal-project Flutter, explicit absence of Go, one-claim limits retaining all supporting sources, deterministic per-source evidence status, idempotent seeding, separate run IDs, and injected failure with canonical fallback. This is a **meaningful application-interface reproduction**, not a live Orbe rollout or complete copy of all PPKS records.

[Gate 10 verified report](hydradb-gate10-evidence-repository-parity.md), [adapter source](../../scripts/hydradb-gate10-repository.ts), [real comparison runner](../../scripts/hydradb-gate10-ephemeral-parity.ts).

### E. Object-storage durability across restarts (Gate 11)

The [MinIO experiment #42162965498](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42162965498) connected HydraDB to a fresh, S3-compatible **MinIO bucket** in an ephemeral GitHub runner and wrote two synthetic relationships: record→skill and claim→supporting source. It read back both values, **replaced HydraDB with a new empty local cache**, read again, then **replaced the MinIO container and HydraDB node while keeping the same bucket data** and read again.

All three reads produced the same result SHA-256 digest: `77b10d56d1b608bee6583cd1ce37d34e9071bc97fab174f77c181b916f8a799b`. This demonstrates simple persistence in that setup, **not backup/restore, high availability, competing writers, or consistency under load**.

The initial MinIO harness failed for non-database reasons: Docker Hub no longer served the upstream v0.3.0 script's `minio/minio` image, and Quay returned HTTP 401. We recovered using a maintained **Chainguard MinIO container**, with no change to the HydraDB engine. This is potentially useful reproducibility feedback for HydraDB's [v0.3.0 MinIO smoke script](https://github.com/hydra-db/hydradb/blob/v0.3.0/scripts/minio_smoke.sh).

[Gate 11 durability and registry incident report](hydradb-gate11-minio-durability-2026-11-06.md).

### F. Performance: exploratory data only

We captured local HTTP round-trip samples during the earlier MiniMac PPKS experiments, but they used unequal execution paths and limited sample sizes; one 4-hop example had only three readings per engine. We therefore **do not claim that HydraDB is faster or cheaper** from those results. The next performance protocol must use matching datasets, operation mix, warm/cold cache states, network topology, concurrency, image digests and resource limits, with explicit p50/p95, throughput and error rates.

## 4. What our migration attempt did not prove

- Orbe `main` or `dev` has **not been switched to HydraDB**; no end-to-end recruiter responses were directly compared between a deployed HydraDB Orbe and deployed Neo4j Orbe.
- A full `EvidenceGraphRepository` implementation in HydraDB is **not yet validated** for all typed entities and the entire current public PPKS snapshot.
- The driver can establish a Bolt connection on the tested setup, but the four read queries failed: **Bolt query compatibility remains open**.
- The original Neo4j snapshot/transaction, pruning and uniqueness guarantees are **not yet proven equivalent**.
- **Limited MinIO write→read→node/cache restart→read and MinIO restart→read passed**, but interrupted-write recovery, multi-writer fencing, backups, concurrency, authorization/tenancy, bookmarks, operational cost and controlled performance remain open.
- Our synthetic labels are not independent human-reviewed gold for an NLP claim.

For an externally useful conclusion, all of these should remain identified as gaps, not silently upgraded into successes.

## 5. Questions for Nishkarsh / where feedback could help

1. **Bolt v0.3.0**: Is there a recommended Neo4j JavaScript driver version, connection URI, database/namespace or Cypher transport configuration for simple `MATCH` reads? In our minimal case, `verifyConnectivity` succeeded, then four reads failed with `Neo.ClientError.Statement.InvalidSyntax`; an earlier run also saw `ERR_OUT_OF_RANGE` during connectivity. [Reproducer](../../scripts/gate9-disposable-bolt.mjs).
2. **Cypher support contract**: Are simple `IN` and `IS NULL` expressions intentionally supported in the v0.3.0 HTTP query path despite the documentation? Are `WITH ... ORDER BY ... LIMIT`, `toLower` and `count(n)` expected to be added, or should an adapter deliberately avoid them?
3. **Neo4j migration idioms**: What is the recommended schema/query pattern for string business keys mapped to numeric vertex IDs, claim-to-source provenance edges, deterministic pagination and constrained/idempotent upserts?
4. **Object-store durability**: Our basic MinIO write→restart→read experiment passed across HydraDB cache and MinIO service replacements. What *next* fault/consistency tests would you recommend for interrupted writes, writer takeover, read-your-writes, bookmarks and recovery? Could the upstream MinIO smoke harness be updated to pull a maintained, publicly accessible image?
5. **Performance and cost**: What production-representative workload and metrics should we use to compare object storage-backed HydraDB against a similarly provisioned Neo4j instance without misleading results?

We would be happy to discuss the smallest reproductions in a short call, then send follow-up findings. The request is for engineering guidance, not a claim that the database is generally broken.

## 6. What remains before calling it a migration

**We have now passed a bounded version of the same Orbe application interface across both graph engines in Gate 10**, using original Neo4j repository code and a LAB-only HydraDB implementation on identical synthetic evidence. The run also validated replay/idempotence and fallback. **Gate 11 independently passed a minimal object-store restart/read proof.**

Next we intend to test this interface against a *larger, public-PPKS-derived fixture*, verify source completeness at scale, record immutable image digests, investigate the outstanding Bolt issue and test interrupted-write recovery and stronger isolation. Controlled performance and cost evaluation come **only after** these semantic and operational questions.

**Verdict remains: HydraDB requires a dedicated adapter; it is not yet a drop-in Neo4j replacement for the deployed Orbe service.** The [acceptance protocol](hydradb-dev-main-parity-plan.md) distinguishes completed synthetic checks from pending real-application and larger-fixture checks.

## 7. How to reproduce and audit the claims

- [Gate 10 — application-interface parity report](hydradb-gate10-evidence-repository-parity.md)
- [Gate 10 — real two-engine parity run](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42162281328)
- [Gate 11 — MinIO restart and durability report](hydradb-gate11-minio-durability-2026-11-06.md)
- [Gate 11 — MinIO real CI run](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42162965498)
- [Exact Orbe Cypher fixture generator](../../scripts/gate9-runtime-fixture.ts)
- [Disposable HydraDB/Neo4j GitHub Actions workflow](../../.github/workflows/hydradb-gate9-runtime.yml)
- [HTTP compatibility + mutation runner](../../scripts/hydradb-gate9-disposable-runtime.py)
- [Bolt driver reproducer](../../scripts/gate9-disposable-bolt.mjs)
- [Full original-query and portable-query matrix](hydradb-gate9-dynamic-compatibility-2026-11-06.md)
- [Read-only OFF/SHADOW workflow](../../.github/workflows/hydradb-lab-validate.yml)
- [PPKS evidence/claim contract](hydradb-ppks-contract.md)
- [GitHub issue F4.1 / Gate 9](https://github.com/SladeSouzaSantos/phasscode-platform/issues/36)
- [GitHub issue F4.2 / experimental PoC](https://github.com/SladeSouzaSantos/phasscode-platform/issues/37)

**Release identity caveat:** the disposable CI used version tags, not pinned OCI digests. Before making hard engine-to-engine benchmark claims we will pin image digests and record the precise Node.js driver version, CPU/memory limits and dataset hash.

---

**Summary for maintainers:** HydraDB successfully supported useful adapted graph operations in our experiments, especially numeric-ID traversal, basic aggregates and mutation primitives. Porting a real evidence-backed Neo4j application still required data-model and Cypher changes. We can provide clear reproductions for the Bolt queries and runtime/documentation discrepancies. We would welcome guidance on compatibility, best-practice migration and object-storage durability before proceeding to performance comparisons.
