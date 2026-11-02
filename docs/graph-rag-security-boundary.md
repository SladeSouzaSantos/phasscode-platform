# F3.2/F3.3 — GraphRAG public boundary (DEV, implementation in progress)

## Validated baseline (2026-11-02)

The Mac Mini DEV Neo4j is healthy with 414 nodes and 271 relations.
The PPKS seed is repeatable (identical SHA and counts on two imports).
A real bounded Java query returned 3 claims and 7 sources with complete
provenance; the read-only maintenance test left Neo4j healthy.
The API DEV and MAIN remain independent of Neo4j.

## Credential / data security

- **NEVER** pass `NEO4J_AUTH`, `NEO4J_AUTH_FILE`, `NEO4J_URI`,
  `NEO4J_PASSWORD`, or `GRAPHRAG_SEED_ENABLED` into the internet-facing
  Orbe API. The public bootstrap fails closed if any are present.
- Neo4j Community does not supply a server-enforced per-user read-only role.
  `session.READ` selects a driver transaction mode; it does not revoke
  the administrator's write privileges.
- `PublicGraphEvidenceGateway` filters the outputs of a trusted reader.
  Claims with **any** non-public/missing source are withheld entirely.
  Private/third-party source details are never returned to public callers.
- The public filtering class is **not** a process-level security boundary
  and does **not** grant authorization to connect the public API to Bolt.
  Before enabling runtime requests, implement an isolated internal reader
  process with a separate secret, fixed request/response schemas, authenticated
  transport, private-source filtering and security tests. Only that process
  may hold maintenance-side database credentials (unless Enterprise RBAC
  or a distinct read-only materialized projection is adopted).
- The current Orbe chat route is unchanged; no GraphRAG feature flag is enabled.

## F3.3 staged rollout

Build and test a typed LangGraph pipeline offline, with controlled nodes,
explicit evidence/source provenance and deterministic verification. Do not
replace the public chat orchestration or incur extra model calls until
F3.2's process isolation and F3.4's regression tests have passed.
