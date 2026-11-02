# F3.2 — Neo4j optional DEV (in progress)

## Driver / seed / disposable CI verification

- Official npm workspace dependency: `neo4j-driver@6.2.0` with a generated lockfile.
- `Neo4jGraphStore` uses managed read/write transactions and closes each session.
  A constraint is created separately; the four PPKS operations share one atomic write transaction.
- The maintenance-only `graph-seed` Compose profile reads a local Docker secret and is never
  invoked by the public Orbe API. Community RBAC cannot enforce least-privilege read-only:
  **do not give the application the seed credentials**.
- `compose.graphrag.test.yaml` runs an ephemeral Neo4j test project with synthetic
  authentication, no published ports, and no durable graph volume.
- The `neo4j` CI job must pass before the Docker qualification gate. Normal DEV/MAIN
  deployment remains manual-only and unchanged.
- All environment names, data volumes, and network namespaces remain scoped to
  `COMPOSE_PROJECT_NAME`. No live Neo4j rollout has been authorized.

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

The Mac Mini preflight on 2026-11-02 reported 7.2 GiB total RAM, 5.7 GiB
available RAM, and 178 GiB disk available. Limit the optional Neo4j DEV
container to 1024 MiB with an explicit 256 MiB JVM heap and 128 MiB page cache
to preserve native-memory headroom. These are **starting values for DEV only**;
inspect actual memory and restarts during homologation before changing limits.


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
records. The seed runner executes schema creation separately and its four data
operations **in one write transaction**. Reapplying the same snapshot must
not duplicate graph records; the disposable Neo4j job checks the counts.

`Neo4jEvidenceRepository` is a read-only, narrow query contract. The official
`neo4j-driver` connection factory and disposable integration tests exist,
but the read-only access boundary requires review before any public traffic.
Its returned claims require all referenced source IDs to be present; no
cross-skill inference is performed.

## Next acceptance gates

1. Official driver dependency with reproducible npm lockfile; connection
   lifecycle, read/write transactions and timeouts.
2. Ephemeral database integration: seed twice, counts unchanged, no external
   published ports, stale record cleanup and unavailable-database fallback.
3. Secret isolation and measured resource footprint on the DEV server.
4. CI green; only then consider a **DEV-only** opt-in deploy and functional test.
