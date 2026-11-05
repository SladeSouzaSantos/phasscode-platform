# F3.3/F3.5 — DEV-only GraphRAG shadow composition

This incremental rollout **does not replace recruiter-facing answers**.
The public /api/v1/chat request continues through the existing PPKS and
LangChainChatProvider paths. Only after the canonical answer has been
determined may the optional GraphRAG shadow evaluator inspect the question
using the private **read-only** HTTP graph-reader port.

## Explicit opt-in (for a separately approved DEV environment only)

The default is ORBE_GRAPHRAG_MODE=off. Shadow mode requires all of:

- ORBE_GRAPHRAG_MODE=shadow
- ORBE_GRAPHRAG_STAGE=dev
- ORBE_GRAPHRAG_DEV_APPROVED=true
- ORBE_GRAPH_READER_TOKEN_FILE=/run/secrets/graph_reader_token, provided
  by the DEV-only Compose overlay from a local **API-specific Docker secret**
  (43–128 URL-safe characters). The Reader uses its own UID 7474 secret,
  and Orbe API runs as node UID 1000; do not reuse the same 0400 host file
  as a bind mount for both processes. Never set ORBE_GRAPH_READER_TOKEN as a
  plain environment variable; the runtime rejects that form.

The deployment's NODE_ENV value is **not** an environment discriminator:
the runtime Docker image uses NODE_ENV=production in both DEV and PROD.
The separate DEV stage and explicit approval are required deliberately.
Do not set these values in production. Do not copy NEO4J_AUTH,
NEO4J_PASSWORD, NEO4J_URI, Bolt credentials, or seed privileges into Orbe.
The existing assertPublicOrbeGraphIsolation guard still forbids them.

These are _configuration instructions_, not a deployment. The additional
compose.graphrag.shadow.dev.yaml is intentionally not loaded by ordinary
deploy.sh/compose.sh. No existing Compose manifest, local .env file, existing
Mac Mini service, network or volume has been changed by this increment.

## Behavior, privacy and resilience

- Shadow is assembled at startup only after explicit DEV approval. The
  token is read from the fixed Docker Secret file, never from a plaintext
  environment variable. Invalid/missing secret fails startup safely.
- Reader HTTP is fixed to http://graph-reader:8765. No visitor URL, Cypher,
  elevated Bolt access or external model is permitted.
- The normal chat answer, response sources, conversation persistence, HTTP
  schema and provider metadata are unchanged for all shadow outcomes.
- The reader is called synchronously after the canonical result is ready;
  it has a bounded 5-second timeout and does not gate /health or /ready.
  A reader outage is logged as a generic shadow error and never replaces the
  canonical answer. Repeated public requests may incur shadow latency;
  assess latency and availability before approving live DEV rollout.
- Shadow telemetry contains only event, random trace ID, outcome, reason,
  requirement counts, unknown counts and rounded durationMs. Never log question, answer, model
  prompt, source URL, token, exception details or personal information.
- No additional LLM request is made. Previous shared logical model budget
  remains staged and is not yet attached to the public response generation.
  F3.3's verified GraphRAG answer is **not** sent to the visitor in shadow.

## Rollback (no data migration)

Remove the shadow overlay from the DEV API Compose configuration and recreate
only the DEV API with the existing pinned digest, preserved proxy network and
ORBE_GRAPHRAG_MODE=off (default). Do not remove the reader secret from the
private graph-reader service unless that service is independently retired.
Never copy the secret contents into a shell command or GitHub logs.
The original chat behavior resumes without a Neo4j request. Do not delete
database volumes or modify production as part of this rollback.

## Tests and promotion gates

Run:

    npx vitest run tests/graphrag-shadow-http.test.ts
    npm run check

Tests include Fastify injection plus a real loopback TCP HTTP request, flag
OFF, explicit approval, health/readiness independence, identical canonical
responses, source parity, failures without secret disclosure, and unknown Go
fallback. These tests are not equivalent to a Mac Mini deployment or to an
LLM-backed GraphRAG comparison.

Still required before activation in DEV: explicit operator confirmation,
scoped reader secret supplied by the DEV deployment, network/readiness
verification of the graph-reader service, end-to-end source checks, latency
profiling, multi-turn recruiter evaluation, exact active deployment SHA and
documented rollback rehearsal. Promotion of DEV to MAIN requires separate
user approval after F3.4 and F3.5 acceptance.

## Deployment readiness discovery and current blocker

The private reader's DEV-only overlay already mounts
`graph_reader_token` from
`PHASSCODE_GRAPH_READER_TOKEN_FILE` (default
`.secrets/graph_reader_token`). The Orbe API previously read a raw
`ORBE_GRAPH_READER_TOKEN` environment variable, which was **not provided
by the default Compose service**. The `graph-reader-secret.ts`
and `compose.graphrag.shadow.dev.yaml` bind the API to a dedicated
`graph_api_reader_token` secret whose **container target** remains
`/run/secrets/graph_reader_token`. A second host file is necessary because
the Mac Mini has confirmed the Reader's source file is owner UID 7474/mode
0400, while Orbe runs as UID 1000. No Neo4j admin credentials, Bolt URL or
import privileges enter the public API.

To prepare a particular immutable release on the Mac Mini **after an
explicitly authorized standard DEV deployment** and after the operator
has created secrets locally, work only in
`/opt/projects/phasscode-platform-dev` and run:

```bash
bash scripts/preflight-graphrag-shadow-dev.sh <FULL_40_CHAR_DEV_SHA>
```

The preflight is deliberately read-only. It checks branch/checkout,
clean Git status, immutable GHCR digest and image revision, the recorded
DEV port 3001/project/proxy mode, local secret presence and 0600/0400
permissions, **byte equality without printing either bearer token**,
the dedicated API secret's UID 1000 ownership, forbidden raw token or
administrative Neo4j variables in `.env`, and the combined **DEV-only**
Compose configuration. Secret lengths use `stat`, not `wc -c < secret`:
the latter returned misleading READER_SECRET_TOO_SHORT when `phass` could
not read a valid 65-byte 0400 file. Run the complete preflight with `sudo`
to permit the silent `cmp -s` check. It must
fail on a mismatched image and never pulls, seeds, migrates or restarts
services. The second read-only stage additionally requires one running
private Neo4j and reader container, no host-published ports, and Neo4j
health **and checks the running Reader OCI revision matches the pinned DEV API
release** (a prior Reader revision must be upgraded before this passes):

```bash
sudo bash scripts/preflight-graphrag-shadow-dev.sh <FULL_40_CHAR_DEV_SHA> --require-running
```

**Do not run either command against** `/opt/projects/phasscode-platform`
(production). These preflights cannot validate the private reader's
authentication end-to-end without an authorized live environment.

### Mac Mini DEV finding: graph is already populated, but shadow is OFF

The owner verified the DEV Mac Mini at API SHA `bc66c449...`:
Neo4j 5.26 healthy; reader running privately; the internal authenticated
`GET /internal/health` returned HTTP 200, and read-only
`POST /internal/evidence` for Java returned HTTP 200 with 3 claims
and 7 source records. The Reader's OCI revision was `29c35cf9...`,
different from the API. Public Orbe was `ORBE_GRAPHRAG_MODE=off`.
These tests validate graph queryability, **not recruiter-facing GraphRAG**.

The API-specific secret is created **by the operator on the DEV host**,
not by CI, the repository, or the regular deploy. After deploying the
new pinned DEV code and verifying the checkout, use a privileged
operation only within `/opt/projects/phasscode-platform-dev`:

```bash
# Preserve the Reader's UID 7474/mode 0400 secret untouched.
# The API copy has the identical token bytes, owned by node (UID 1000).
sudo install -o 1000 -g 1000 -m 0400 \
  .secrets/graph_reader_token .secrets/graph_api_reader_token

# Metadata and exact equality only; never cat/echo the token.
sudo bash scripts/preflight-graphrag-shadow-dev.sh <FULL_40_CHAR_DEV_SHA>
```

The second `--require-running` gate requires the private Reader to use
the exact same pinned OCI revision as the new API. Upgrading only the
Reader is a separate controlled change (same immutable digest, DEV
Compose project, `--no-deps`, preserve Neo4j volume and proxy); only
then may the API shadow overlay be approved. Do not run a broad
`docker compose down` or change the production Compose project.

### Manual rollout sequence — requires separate operator approval

1. Approve the pinned DEV SHA, run the existing manual
   `workflow_dispatch` release with `target=development` and
   `apply_remote=true` only after checking all existing safety gates.
   This normal deployment leaves shadow OFF because it does not load
   the optional overlay.
2. Verify the pre-existing Neo4j and reader DEV secrets; make the
   dedicated API token file as above (`0400`, UID 1000), without changing
   the Reader file (`0400`, UID 7474). Do not print, upload or put
   secret values in `.env`/workflow inputs. Run the read-only preflight.
3. With explicit permission, keep the existing healthy isolated
   Neo4j and its seeded evidence **intact** (Java already has 3 claims
   and 7 public source records). Update only the Graph Reader to the
   current immutable backend DEV image revision, without restarting
   Neo4j or deleting volumes. Repeat the read-only preflight
   with `--require-running`. Confirm no host ports are published.
4. Only then, using the **same recorded immutable image**, port 3001,
   proxy mode and Compose project, add
   `compose.graphrag.shadow.dev.yaml` to the DEV API operation.
   Do not use a bare Compose command that omits the existing proxy
   overlay. Recreate only the DEV API; **never run database migrations
   or delete volumes as part of shadow activation**.
5. Compare the baseline and shadow `/api/v1/chat` answers and sources
   on matched questions and 2–3 turn sequences. Verify `/health` and
   `/ready` remain independent of the graph, measure `durationMs`,
   and confirm source IDs and graph provenance without leaking source
   text to logs. Record the image digest, deployed SHA, results and
   operator-approved rollback.

The normal DEV release path must not implicitly enable shadow, and the
main/production path must never include these Compose overlays. An
additional `tests/graphrag-shadow-reader-network.test.ts` uses a real
loopback TCP listener for the internal reader and the public Fastify
route, exercising the actual client and authentication **without**
connecting to a real Neo4j database or the Mac Mini.

**Current deployment status:** Code and tests only. No secret files
created, no remote host changes, no Mac Mini DEV shadow activation,
no Grafana/Nginx/proxy changes, no main merge and no benchmark of
real LLM-backed recruiter answers.
