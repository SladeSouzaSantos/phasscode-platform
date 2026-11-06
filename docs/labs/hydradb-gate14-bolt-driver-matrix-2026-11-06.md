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

**Correction to Gate 9:** its earlier four failed Bolt queries used an explicit `database:'lab'` session. Gate 14 demonstrates that **two of those types of reads actually work if the database is not explicitly supplied**, while the parameterized pattern fails independently in that tested path. Therefore the simple claim 'all Bolt queries fail in v0.3.0' would be **incorrect**.

## Important limits

- Errors are classified by the official JS driver, not decoded from internal HydraDB server traces. `ERR_OUT_OF_RANGE` may arise from protocol/database response handling, but the test **does not identify a root cause**.
- HTTP rejecting `RETURN 1` shows it is not useful as a stand-alone Bolt compatibility probe for this release.
- Routed URI may require other advertised addresses or topology settings; this standalone single-node experiment does **not** characterize supported production routing.
- The current [upstream issue #308](https://github.com/hydra-db/hydradb/issues/308) concerns a **different** Python driver v5 identification problem (the upstream reporter says Python driver v6 works). Our results are with **JavaScript driver 6.2.0** and must not be conflated with that issue.
- No claim about transaction bookmarks, session concurrency or mixed read/write capabilities under Bolt.
- The observed result is a useful maintainer issue candidate **after review**, not a security finding.

## Suggested follow-up for Nishkarsh

1. What is the recommended **JS neo4j-driver 6.x** configuration for a single-node namespace/graph (`GRAPH_NAMESPACE=lab`, `GRAPH_ID=lab`, `GRAPH_CELL_ID=cell-0`), especially **explicit database naming**?
2. Is the demonstrated `MATCH (a {id: $id})` parameter rejection expected, or a version-specific parser/parameter binder gap on Bolt? The same exact query returned the expected value over HTTP.
3. How should routed `neo4j://` clients be configured for the Docker single-node local lab with an advertised Bolt address? Does the server require a different hostname/advertisement?
4. Is there a known upstream regression or a recommended minimal reproduction using the JS driver? We can share a concise redacted log and reproducible workflow.

**Migration decision:** keep Neo4j operational. The HydraDB Lab HTTP adapter is independent of Bolt. Do not present JS Bolt interoperability as ready until explicit database/params/routing behavior is tested and corrected or documented.
