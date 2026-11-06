# Gate 17 — official self-hosted v0.3.0 Bolt examples: independent JS/Python reproduction

**Date:** 2026-11-06. **Status:** diagnostic completed successfully, **official JS example did not reproduce** in tested client/configuration; Python example did. **No server root cause established.**

## Why this experiment matters

After examining [official HydraDB v2 BYOG docs](https://docs.hydradb.com/essentials/v2/bring-your-own-graph) and the [self-hosted v0.3.0 user guide](https://github.com/hydra-db/hydradb/blob/v0.3.0/USING-HYDRADB.md), we noticed our previous Gate 14 used **GRAPH_ID=lab**, while the **v0.3.0 Bolt examples explicitly use database=default**, which the documentation describes as the graph ID.

The first hypothesis was that graph ID/database mismatch or an extra `verifyConnectivity()` call in our JavaScript probe caused its failures. We isolated both conditions and compared independent language drivers on fresh, disposable single-node graphs.

## Reproduction and exact scope

- [Initial match-of-graph-ID run #42217316180](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42217316180): JS used a preflight `verifyConnectivity()` call followed by the parameterized read; Python used documented driver pattern.
- [Corrected reproduction run #42217633248](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42217633248): JS added the **exact official `session({database:'default'}).run(query,{src:...})` pattern without preflight**, retaining a separate with-preflight control.
- [Isolated GitHub-hosted workflow](../../.github/workflows/hydradb-gate17-documented-bolt.yml) uses **two independent matrix jobs**, with `GRAPH_NAMESPACE=GRAPH_ID=default` and `GRAPH_NAMESPACE=GRAPH_ID=lab`; local-only endpoints `127.0.0.1:17687` (Bolt), `127.0.0.1:18443` (HTTP), `127.0.0.1:19090` (admin). No SSH, Tailscale, MiniMac or production/DEV/MAIN.
- **Exact immutable HydraDB OCI image:** `ghcr.io/hydra-db/hydradb@sha256:515ee78600b5d543f9146e62e775c76a8d5d0309773c165b918ed770649a91f3`, corresponding to v0.3.0 tested previously.
- **Drivers:** `neo4j-driver` JS **6.2.0** from project lockfile; independent `neo4j` Python **6.4.1** in an ephemeral venv. A **difference in client versions** remains a possible confounder.
- Synthetic-only graph: `MERGE (a {id: 1700100})-[:FOLLOWS]->(b {id: 1700101})`; fixed parameterized read `MATCH (a {id: $src})-[:FOLLOWS]->(b) RETURN b.id AS id`, `src=1700100`. Same logical query worked through the engine's **HTTP query API** before attempting Bolt, so data existence/query semantics were verified.
- Each client/configuration used **3 fresh sessions/drivers** per job; the JS runner explicitly records both connection and query outcomes, while Python independently checks returned values.

## Actual observed outcomes

### Primary documented JS example, no connectivity preflight (corrected run)

| Fresh graph and database | JS 6.2.0 | Python 6.4.1 |
| --- | ---: | ---: |
| `GRAPH_ID=default`, session database `default` | **0/3** correct; failures: 2× `ERR_OUT_OF_RANGE`, 1× `Neo.ClientError.Statement.InvalidSyntax` | **3/3** correct |
| `GRAPH_ID=lab`, session database `default` | **0/3** correct; failures: 1× `ERR_OUT_OF_RANGE`, 2× `InvalidSyntax` | **3/3** correct |

The Python control followed its documented `verify_connectivity()` plus `session(database="default")` pattern. In contrast, the JS primary row followed the JS guide **without** `verifyConnectivity()`.

### Control: extra JS preflight `verifyConnectivity()` (corrected run)

With `GRAPH_ID=default`, explicit session database `default`: **0/3** JS correct, all with `ERR_OUT_OF_RANGE`. On `GRAPH_ID=lab`, the same control also failed 3/3 with `ERR_OUT_OF_RANGE`.

### Additional diagnostic variants (corrected run)

- Python, `GRAPH_ID=default`: explicit database `default`, unspecified database and routed `neo4j://` with database `default` all returned **3/3 correct** on each variant.
- Python, `GRAPH_ID=lab`: explicit `lab` and routed `neo4j://` with `lab` did **not** succeed (syntax/routing errors); `default` and unspecified database each returned **3/3 correct**.
- JavaScript failed to return the expected value with explicit graph ID, unspecified database and routed URI in both matrix jobs; errors varied by attempt. These results are consistent with previous Gate 14 but more directly tied to the official example.
- In both matrix jobs, the same source data and parameterized query **passed HTTP value assertions** before the Bolt trials.

### Interpreting GitHub Actions success correctly

The job's `success` status means **all diagnostics ran, reports were saved and containers were safely removed**. The logs expressly emitted `GATE17_JS_OFFICIAL_EXAMPLE_NOT_FULLY_REPRODUCED` and `GATE17_PY_OFFICIAL_EXAMPLE_3_OF_3_PASS`, not a general Bolt compatibility pass. There are **no tests here of managed HydraDB v2 BYOG**.

## What is and is not ruled out

**Ruled out as sufficient fixes in this setup:** changing only the graph ID from `lab` to `default`; using `database: 'default'` alone; removing the extra JavaScript `verifyConnectivity()` preflight.

**Not established:** whether the failure belongs to HydraDB Bolt's handshake/parameter binding, JavaScript 6.2.0 driver protocol semantics or a particular server/advertised graph mapping; whether another JS version would succeed; whether single-node routing was configured as documented for a cluster. We have no evidence that the managed v2 HTTPS BYOG API inherits any of these outcomes.

**Maintainer follow-up request:** which Node.js Neo4j driver versions and Bolt protocol features does self-hosted HydraDB v0.3.0 support? Why does the v0.3.0 documented JavaScript example not produce the result with the pinned engine and explicit `GRAPH_ID=default`, while Python 6.4.1 does? We can share the two bounded repro scripts and output without credentials.

- [JavaScript exact-example + preflight control script](../../scripts/hydradb-gate17-documentation-parity.mjs)
- [Python independent driver comparison](../../scripts/hydradb-gate17-documentation-parity.py)
- [Existing Gate14 client/DB matrix](hydradb-gate14-bolt-driver-matrix-2026-11-06.md)
- [Documentation v2 vs v0.3 review](hydradb-v2-docs-review-2026-11-06.md)

## Gate 18 follow-up — version hypothesis now tested

[Dedicated four-JS-version matrix #42286677576](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42286677576) compared `neo4j-driver` **5.28.3, 6.0.1, 6.1.0 and 6.2.0**, each with a matching Neo4j/Bolt reference and HydraDB/HTTP value control. All four controls passed, but the documented parameterized HydraDB/Bolt read returned **0/3 correct per JS version (0/12 total)**. Adding three alternative modes produced **0/48 correct**; see [full version-matrix report](hydradb-gate18-js-driver-version-matrix-2026-11-06.md). Consequently, swapping *only* from JS 6.2.0 to one of those three older releases is not a demonstrated fix. We still have not isolated protocol/client/server root cause.

**Operational decision remains unchanged:** keep Neo4j in Orbe DEV/MAIN and the HydraDB HTTP adapter isolated in `experiment/hydradb`. This is a diagnostics-only experiment, not authorization to change application deployments.
