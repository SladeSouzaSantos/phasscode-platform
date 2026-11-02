# F3.2 — Neo4j optional DEV (in progress)

The Neo4j graph is a rebuildable **read model**. PPKS stays canonical and PostgreSQL
continues to own conversations and transactional state. Nothing is wired into Orbe
runtime yet; the F3.1 baseline remains the default behavior.

## Security boundaries

- `compose.graphrag.dev.yaml` is a **separate explicit overlay** so ordinary
  `compose.yaml` and `compose.dev.yaml` commands stay untouched.
- Neo4j has **no host port bindings** (neither 7474 nor 7687). A Compose profile
  `graphrag` prevents accidental startup without opt-in.
- A local Docker secret file supplies Neo4j authentication. Never commit the file
  or paste its contents into GitHub Issues, CI logs or chat.
- The Community edition cannot enforce fine-grained read-only roles through RBAC.
  Do not connect a public Orbe runtime with the import account. A separate,
  least-privilege runtime identity requires verified Enterprise RBAC or an
  equivalent audited gateway **before enabling live graph queries**.
- Do not publish production services using this overlay. No remote deployment
  is authorized by this work.

## DEV operator instructions (not yet authorized for deployment)

Create a private file with exactly `neo4j/<strong random password>` at
`.secrets/neo4j_auth`, permissions 0600. Store only that file on the DEV server
and ensure it is Git-ignored.

After validation and explicit authorization, to start **only** Neo4j:

```sh
docker compose --env-file .env \
  -f compose.yaml -f compose.graphrag.dev.yaml \
  --profile graphrag up -d --no-deps neo4j
```

No `--profile graphrag` in existing deploy workflows. The Neo4j data volume is
persistent only for this DEV overlay. Never run `down --volumes` against
the existing application project.

## Prepared import/query contracts

`planNeo4jGraphSeed` produces one deterministic snapshot SHA, fixed parameterized
Cypher operations for upserting nodes/relations and removing stale projection
records. A future runner must execute schema creation separately and the four
seed operations **in one write transaction**. Reapplying the same snapshot must
not duplicate graph records; dry-run counts will be checked against a disposable
Neo4j integration environment.

`Neo4jEvidenceRepository` is a read-only, narrow query contract. The official
`neo4j-driver` connection factory, read-only account/access boundary and live
integration tests will be added before it can receive any production traffic.
Its returned claims require all referenced source IDs to be present; no
cross-skill inference is performed.

## Next acceptance gates

1. Official driver dependency with reproducible npm lockfile; connection
   lifecycle, read/write transactions and timeouts.
2. Ephemeral database integration: seed twice, counts unchanged, no external
   published ports, stale record cleanup and unavailable-database fallback.
3. Secret isolation and measured resource footprint on the DEV server.
4. CI green; only then consider a **DEV-only** opt-in deploy and functional test.
