# Gate 18 — JavaScript Neo4j driver 5.x/6.x versus HydraDB v0.3.0 official Bolt example

**Data:** 06/11/2026. **Status:** four GitHub-hosted disposable jobs **SUCCESS as diagnostics**, but **0/48 HydraDB JavaScript Bolt reads returned the expected answer** across the 4 versions × 4 configurations × 3 repetitions. Four independently version-matched Neo4j control queries passed. **Do not mistake CI success for driver compatibility.**

## Objective and provenance

After Gate 17 demonstrated that changing `GRAPH_ID` to `default` and skipping JavaScript `verifyConnectivity()` did **not** fix the reproduced [official self-hosted v0.3.0 Bolt example](https://github.com/hydra-db/hydradb/blob/v0.3.0/USING-HYDRADB.md), Gate 18 tested whether the failure was a **regression isolated to JavaScript `neo4j-driver` 6.2.0**.

- [GitHub Actions #42286677576 — all four matrix jobs successful](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42286677576), commit `8d66fa3d3e1e6b1e0fe42719846c364708ab6ac2`.
- [Fixed diagnostic script](../../scripts/hydradb-gate18-js-version-matrix.mjs); [dedicated GitHub-hosted workflow](../../.github/workflows/hydradb-gate18-js-driver-versions.yml).
- Versions installed in **separate, temporary npm package roots** through exact package specifiers and `package-lock.json` + `npm ci --ignore-scripts`: `5.28.3`, `6.0.1`, `6.1.0`, `6.2.0`. Uploaded ephemeral lockfiles permit later dependency audit.
- Each job used **Node.js v24.22.2**, **HydraDB v0.3.0 OCI pinned** `ghcr.io/hydra-db/hydradb@sha256:515ee78600b5d543f9146e62e775c76a8d5d0309773c165b918ed770649a91f3` and **Neo4j OCI pinned** `neo4j@sha256:42ef3ebfd671ebd01fdebb6dcbe80cf7b45eef2aa3d346ef4132f7ef31e67d2f`, with 1.5 vCPU / 2 GiB per DB.
- Both databases were new **disposable and unconnected to operational Orbe or MiniMac**. `GRAPH_NAMESPACE=GRAPH_ID=default` and Bolt `bolt://127.0.0.1:17687` followed the official self-hosted example.
- Fixed **synthetic** graph: `MERGE (a {id: 1800100})-[:FOLLOWS]->(b {id: 1800101})`; read: `MATCH (a {id: $src})-[:FOLLOWS]->(b) RETURN b.id AS id`, `src=1800100`. HTTP seeded and **asserted the expected data/value** in HydraDB. Neo4j graph was seeded **via the same JS driver version** under test, then its `bolt://` one-hop result was asserted for that exact version.
- Four configurations per JS version, 3 fresh-driver attempts each: **official direct Bolt with `database=default`, no preflight**; direct Bolt with preflight; direct Bolt with database omitted; routed `neo4j://` with `default` without preflight.
- Secrets, tokens and raw error stacks were not exported; report records only classified status/code and measured version. All test containers/temp package roots were removed.

## Verified results from the CI structured logs

| JS `neo4j-driver` | Native Neo4j Bolt control | HydraDB HTTP control | HydraDB documented direct Bolt (no preflight) | Direct Bolt + preflight | Direct Bolt no database | Routed `neo4j://` |
| --- | --- | --- | --- | --- | --- | --- |
| 5.28.3 | **PASS** (1/1) | **PASS** | **0/3** | 0/3 | 0/3 | 0/3 |
| 6.0.1 | **PASS** (1/1) | **PASS** | **0/3** | 0/3 | 0/3 | 0/3 |
| 6.1.0 | **PASS** (1/1) | **PASS** | **0/3** | 0/3 | 0/3 | 0/3 |
| 6.2.0 | **PASS** (1/1) | **PASS** | **0/3** | 0/3 | 0/3 | 0/3 |

All **48 HydraDB Bolt attempts** failed to return the correct value: 31 **`ERR_OUT_OF_RANGE`**, 5 **`Neo.ClientError.Statement.InvalidSyntax`**, 12 **`ServiceUnavailable`** (all routed). The Neo4j and HydraDB HTTP controls passed for every job. These codes were recorded by the JS client/driver; **their presence does not prove the component where the underlying fault originated**.

For the **exact published `database=default` / no-preflight version of the example**, **all 12 attempts failed** across 5.28.3, 6.0.1, 6.1.0 and 6.2.0. Note that the cross-language [Gate17 Python Neo4j 6.4.1 control](hydradb-gate17-official-v03-bolt-reproduction.md) returned **3/3 expected values** in an independent run using the same HydraDB release and query shape, though not with an identical Python/JavaScript driver version.

## What can and cannot be concluded

**Supported by evidence:**

- The Bolt interoperability problem is **not unique to JavaScript driver 6.2.0**, nor corrected just by switching from that release to **any of the three tested older JS versions**.
- The version-matched JavaScript driver **successfully communicates with actual Neo4j** for the tested one-hop statement.
- The same query and data **exist and work via the HydraDB v0.3.0 HTTP API**.
- The available facts make **cross-driver Bolt compatibility or version/protocol negotiation** a more specific maintainer question than generic Cypher support. Some `InvalidSyntax` and `ERR_OUT_OF_RANGE` may occur at different transport and query handling stages; we did **not** instrument the server/handshake to isolate them.

**Not demonstrated:**

- A general failure of every JavaScript Bolt driver release or all HydraDB configurations; four specific versions and 4 fixed configs only.
- The source-level root cause, a server bug, or feature completeness of managed HydraDB v2.
- End-to-end production Orbe migration, concurrency/throughput, cost efficiency, or security/durability consequences.
- Equivalence of Python v6.4.1 and JS v6.2.0 protocol negotiation. Driver language and version both differ between positive Python and negative JavaScript observations.

## Next step

Share **this minimal reproducible version matrix with Nishkarsh by email**, asking for a confirmed JavaScript driver version, Bolt protocol negotiation/database-mapping expectations and whether a current self-hosted release contains compatibility fixes. Do not promise a fix or silently change the live Orbe adapter.

For engineering follow-up, the next test (after maintainer guidance) would instrument **only sanitized Bolt HELLO/LOGON handshake metadata and advertised addresses** and use a version confirmed by the maintainer. Avoid enabling verbose logs that might contain graph queries, auth tokens or user content. Continue to use the isolated branch and GitHub-hosted ephemeral services.

**Operational status:** `experiment/hydradb` only; **no** modification to `dev`/`main`, MiniMac, hosted v2 services, or email sending.
