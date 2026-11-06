# Gate 14 — isolating Bolt compatibility with Neo4j JavaScript driver

**Date:** 2026-11-06. **Verdict:** partial success for direct Bolt read queries; parametrization, explicit database selection and routing remain unproven in tested configuration. **No claim that all Bolt is broken.**

## Reproduction

- [GitHub Actions #42169010048 — successful diagnostic run](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42169010048).
- [Minimal JS driver/HTTP matrix reproducer](../../scripts/hydradb-gate14-bolt-matrix.mjs).
- [Disposable two-engine Docker setup](../../.github/workflows/hydradb-gate9-runtime.yml).
- **HydraDB image:** v0.3.0, **Neo4j control:** v5.26, **official JavaScript neo4j-driver:** **6.2.0** (pinned via package-lock).
- Same synthetic seed: `Gate9Skill` vertex `800100` linked via `GATE9_SKILL` to `Gate9Claim` vertex `800101`. Queries tested with literal and parameter forms; HTTP and Bolt each operate against ephemeral engine graph in the same GitHub-hosted runner.
- No SSH/Tailscale, DEV/MAIN/MiniMac databases, company data, operational secrets or LLM.

## Result matrix

| Connection / query | Result |
| --- | --- |
| Neo4j control `bolt://127.0.0.1:17688`, explicit `neo4j` | **4/4** expected values; connectivity OK |
| HydraDB HTTP, three `MATCH` variants | **3/3** expected values |
| HydraDB HTTP `RETURN 1 AS id` | HTTP 400 (not just Bolt) |
| HydraDB `bolt://127.0.0.1:17687`, session **without** database | Connected; labeled node MATCH **PASS** and 1-hop MATCH **PASS** |
| Same Bolt session, parameterized 1-hop `$id` | `Neo.ClientError.Statement.InvalidSyntax` |
| Same Bolt session, `RETURN 1 AS id` | `Neo.ClientError.Statement.InvalidSyntax` (HTTP rejects too) |
| HydraDB Bolt session with explicit database `lab` | `verifyConnectivity()` `ERR_OUT_OF_RANGE` |
| HydraDB Bolt session with explicit database `default` | `verifyConnectivity()` `ERR_OUT_OF_RANGE` |
| HydraDB routed `neo4j://127.0.0.1:17687` with `lab` | `ServiceUnavailable` |
| HydraDB routed `neo4j://127.0.0.1:17687` with `default` | `ServiceUnavailable` |

**Correction to Gate 9:** its earlier four failed Bolt queries used an explicit `database:'lab'` session. Gate 14 demonstrates **partial positive Bolt reads in some connection/database configurations**, while parameterization, explicit database behavior and routing remain unresolved. **Neither 'all Bolt fails' nor 'omit database always works' is supported by the two runs.**

## Subsequent digest-pinned run — configuration outcomes were NOT stable across runs

The initial table above describes [run #42169010048](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42169010048) using the `:0.3.0` release tag. We repeated the matrix with **the image pinned by OCI digest** in [run #42170443030 — success](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42170443030), while retaining the same JS driver version **6.2.0** and synthetic fixture.

| HydraDB connection mode | Initial tag-based run | Later pinned-digest run |
| --- | --- | --- |
| Direct Bolt, explicit `lab` | `ERR_OUT_OF_RANGE` during connectivity | Connected, but every one of four queries returned `InvalidSyntax` |
| Direct Bolt, explicit `default` | `ERR_OUT_OF_RANGE` during connectivity | Connected; labeled and 1-hop reads returned correct values, parameterized read and `RETURN 1` rejected |
| Direct Bolt, **database omitted** | Connected; two simple reads correct; parametrized failed | `ERR_OUT_OF_RANGE` during connectivity |
| Routed `neo4j://`, explicit `lab` or `default` | `ServiceUnavailable` | `ServiceUnavailable` |
| Same `MATCH` via HTTP | Correct values for 3/3 supported query forms | Same |

**This matters for the feedback:** it would be **incorrect to recommend 'omit database' as a reliable workaround**, or to assert that `database: default` reliably works. The observed configuration outcome **varied between separate runs**. The initial run used a version tag without its digest recorded; therefore **image drift, startup/readiness, timing and client behavior have not been distinguished**. The pinned image digest alone does not establish the reason for the discrepancy. The bound-parameter failure when Bolt MATCH could run remained reproducible, while the identical query succeeded over HTTP.

A subsequent test was added to run **three fresh JS-driver sessions per variant** within the same pinned-image runner and to compare the independent **Python neo4j-driver 6.4.1**; report their outcome separately before advising the maintainer on the actual root cause.

## Independent driver cross-check — same pinned HydraDB image, JS versus Python

A further [GitHub Actions #42171683734 — success](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42171683734) tested **three fresh JavaScript driver sessions per configuration** on the immutable-image HydraDB v0.3.0 test instance. It also ran a separate **official Python Neo4j driver 6.4.1** against the same seeded graph and compared each result with Neo4j control.

**JavaScript neo4j-driver 6.2.0 (three trials per configuration):**

| Mode | Result |
| --- | --- |
| Direct Bolt, explicit `lab` | 2 connected but all four statements rejected with `InvalidSyntax`; 1 failed with `ERR_OUT_OF_RANGE` |
| Direct Bolt, explicit `default` | 3/3 connectivity failures `ERR_OUT_OF_RANGE` |
| Direct Bolt, database unspecified | 3/3 connectivity failures `ERR_OUT_OF_RANGE` |
| Routed URI `neo4j://`, explicit `lab` | 3/3 `ServiceUnavailable` |
| Routed URI `neo4j://`, explicit `default` | 3/3 `ServiceUnavailable` |

**Python driver 6.4.1, same isolated graph (one trial per configuration):**

| Mode | Connectivity | Labeled node, one-hop, parameterized one-hop |
| --- | --- | --- |
| Direct Bolt, explicit `lab` | Connected | **0/3**: `InvalidSyntax` |
| Direct Bolt, explicit `default` | Connected | **3/3 value matches** |
| Direct Bolt, database unspecified | Connected | **3/3 value matches** |
| Routed `neo4j://`, explicit `default` | Connected | **3/3 value matches** |

Neo4j reference controls passed for both clients. Three comparable `MATCH` statements over HydraDB HTTP also matched values; the separate `RETURN 1` statement failed on HTTP as well.

**Interpretation:** the **same engine image and synthetic records** yield different observed results through the two language drivers. Database name `lab` versus `default` is relevant for Python. This is strong evidence of *configuration/client-path-dependent interoperability*, but not proof of a HydraDB server defect or its root cause. Client implementations and versions differ (JS 6.2.0 vs Python 6.4.1), and the Python matrix was not repeated multiple times. Crucially, do **not** recommend Python as a drop-in replacement for the TypeScript Orbe backend or assume that `default` fixes JS.

Reproduction: [JS repeated matrix](../../scripts/hydradb-gate14-bolt-matrix.mjs), [Python driver 6.4.1 matrix](../../scripts/hydradb-gate14-python-bolt.py), [isolated CI](../../.github/workflows/hydradb-gate9-runtime.yml). Neither client is connected to operational Orbe or MiniMac.

## Important limits

- Errors are classified by the official JS driver, not decoded from internal HydraDB server traces. `ERR_OUT_OF_RANGE` may arise from protocol/database response handling, but the test **does not identify a root cause**.
- HTTP rejecting `RETURN 1` shows it is not useful as a stand-alone Bolt compatibility probe for this release.
- Routed URI may require other advertised addresses or topology settings; this standalone single-node experiment does **not** characterize supported production routing.
- The current [upstream issue #308](https://github.com/hydra-db/hydradb/issues/308) concerns a **different** Python driver v5 identification problem (the upstream reporter says Python driver v6 works). Our results are with **JavaScript driver 6.2.0** and must not be conflated with that issue.
- No claim about transaction bookmarks, session concurrency or mixed read/write capabilities under Bolt.
- The observed result is a useful maintainer issue candidate **after review**, not a security finding.

## Reconciliation with official self-hosted v0.3.0 and hosted v2 docs

[Self-hosted v0.3.0 `USING-HYDRADB.md` — Python and JavaScript Bolt examples](https://github.com/hydra-db/hydradb/blob/v0.3.0/USING-HYDRADB.md) **already recommend** a direct `bolt://` driver and `database=default` (the graph ID) with a parameterized `MATCH`. Hence the question is not how to write a basic Bolt query. **Our pinned JS driver 6.2.0 test was inconsistent even with the documented `default` shape, while the Python 6.4.1 control passed** on the same synthetic graph, albeit with a test deployment configured `GRAPH_ID=lab`. The server-side root cause or version compatibility is **not established**.

The separate [managed v2 BYOG guide](https://docs.hydradb.com/essentials/v2/bring-your-own-graph) supports parameterized Cypher over **HTTP `POST /byog/query`**, not the old Neo4j driver's Bolt protocol. Do not cite it as a fix for the local self-hosted v0.3.0 driver issues. See [version/API documentation reconciliation](hydradb-v2-docs-review-2026-11-06.md).

## Suggested follow-up for Nishkarsh

1. What is the recommended **JS neo4j-driver 6.x** configuration for a single-node namespace/graph (`GRAPH_NAMESPACE=lab`, `GRAPH_ID=lab`, `GRAPH_CELL_ID=cell-0`), especially **explicit database naming**?
2. Is the demonstrated `MATCH (a {id: $id})` parameter rejection expected, or a version-specific parser/parameter binder gap on Bolt? The same exact query returned the expected value over HTTP.
3. How should routed `neo4j://` clients be configured for the Docker single-node local lab with an advertised Bolt address? Does the server require a different hostname/advertisement?
4. Is there a known upstream regression or a recommended minimal reproduction using the JS driver? We can share a concise redacted log and reproducible workflow.

**Migration decision:** keep Neo4j operational. The HydraDB Lab HTTP adapter is independent of Bolt. Do not present JS Bolt interoperability as ready until explicit database/params/routing behavior is tested and corrected or documented.
