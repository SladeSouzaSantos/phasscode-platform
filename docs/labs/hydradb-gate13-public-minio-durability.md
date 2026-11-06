# Gate 13 — public PPKS evidence survives HydraDB and MinIO restarts

**Date:** 2026-11-06. **Status:** PASS for bounded, explicitly public seven-record PPKS subset. **No operational deployment or databases accessed.**

## Reproducible evidence

- [GitHub Actions run #42164536310 — success](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42164536310), commit `57a2eedb302a14af155d54588ab9fa476902e6b3`.
- [Live public PPKS write + read validator](../../scripts/hydradb-gate13-public-minio-parity.ts), [container controller](../../scripts/hydradb-gate11-minio-containers.sh), [isolated CI workflow](../../.github/workflows/hydradb-gate13-public-minio.yml).
- The same seven explicitly allowed PPKS records and first two stack entries per record as [Gate 12](hydradb-gate12-public-ppks-parity.md). Schema-validated public domain projection contains **7 records, 10 skills, 14 claims, 16 sources**, 50 typed Orbe nodes and 46 domain relations. No private academic material was loaded.
- Actual HydraDB graph for this test stores claims, skills, sources and **46 graph edges** with numeric internal IDs, externally meaningful evidence source keys and a strictly isolated `lab_run`.
- MinIO is provided by a disposable **Chainguard** container, stored on a private GitHub runner volume. HydraDB uses the S3-compatible endpoint and a fresh local cache for each new node.
- Network/API bound to loopback; ephemeral credentials and the bucket never leave the GitHub-hosted runner.

## Three-stage restart sequence

| Stage | Experiment | Result |
| --- | --- | --- |
| 1 — write/read | Insert 46 graph edges into HydraDB over the MinIO object store, read application-level evidence contract | **PASS** |
| 2 — new HydraDB node/cache | Remove and restart HydraDB with a **new empty local cache** while keeping MinIO and bucket data | **PASS**, same SHA-256 |
| 3 — replace both services | Restart MinIO and HydraDB, preserve only the bucket's ephemeral volume, create another fresh HydraDB cache | **PASS**, same SHA-256 |

Expected and observed answer digest in all three stages:

```text
ff31a03e8697b992023097f67f6ff77ac33de3635a9836ba60c8557990ab1513
```

Each verification recomputes outputs from the **public PPKS source fixture** and checks complete typed claim/source objects, including source IDs, scope and evidence verification status — **not only the digest of previous graph results**. It validates 11 requirements (10 documented technologies + absent Go), 16 specific `getSource` lookups, and absence of an unknown source. Of the **14 claims**, **12 are eligible for evidence search** because two project claims have `unknown` scope. Those unknown-scoped claims are stored but correctly excluded from the repository's qualified `findEvidence` contract. There are **30 claim-to-source references** across the 12 qualified claims, all checked.

The logs include:

- `GATE13_PUBLIC_MINIO_FIRST_READ_JSON`
- `GATE13_PUBLIC_MINIO_WRITE_READ_PASS`
- `GATE13_PUBLIC_MINIO_RESTART_PARITY_PASS` (twice)
- `GATE13_PUBLIC_HYDRA_NODE_RESTART_PASS`
- `GATE13_PUBLIC_MINIO_SERVICE_RESTART_PASS`
- `GATE11_DISPOSABLE_RESOURCES_REMOVED`

## What this demonstrates — and what it does not

**Proven:** the bounded subset of the real project's publicly declared claim/source relationships is queryable with a LAB-specific HydraDB adapter, and the exact normalized application-level evidence result can be recovered after the two replacement/restart sequences in the same ephemeral runner with the same MinIO bucket data.

**Not proven:**

- Direct migration of the original Neo4j Cypher/Bolt driver (Gate 9 found incompatibilities).
- Full production Orbe or all PPKS records, particularly private academic evidence.
- Recovery after kill during in-flight writes, corruption, loss of the object-storage volume, multi-writer fencing, backups or HA.
- Concurrent read/write correctness, large datasets, version upgrades, long-term integrity, object-storage cost or HydraDB performance compared with Neo4j.
- Strict S3 durability guarantees or benchmark of different object-store vendors.
- Immutable OCI image digests (currently public image tags; should pin digests before controlled comparisons).

This is stronger than Gate 11's two-edge synthetic smoke, but it remains an **application-specific PoC, not deployment certification**. Continue operating Orbe with Neo4j until the outstanding conditions are reviewed and an explicit ADR is approved.
