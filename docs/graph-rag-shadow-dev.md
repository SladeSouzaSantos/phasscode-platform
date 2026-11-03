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
  by the DEV-only Compose overlay from a local Docker secret
  (43–128 URL-safe characters). Never set ORBE_GRAPH_READER_TOKEN as a plain
  environment variable; the runtime rejects that form.

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
by the default Compose service**. The new `graph-reader-secret.ts`
and `compose.graphrag.shadow.dev.yaml` fix the binding without passing
a privileged Neo4j username, password, Bolt URL or import credential to
the public API.

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
permissions, forbidden raw token or administrative Neo4j variables in
`.env`, and the combined **DEV-only** Compose configuration. It must
fail on a mismatched image and never pulls, seeds, migrates or restarts
services. The second read-only stage additionally requires one running
private Neo4j and reader container, no host-published ports, and Neo4j
health:

```bash
bash scripts/preflight-graphrag-shadow-dev.sh <FULL_40_CHAR_DEV_SHA> --require-running
```

**Do not run either command against** `/opt/projects/phasscode-platform`
(production). These preflights cannot validate the private reader's
authentication end-to-end without an authorized live environment.

### Manual rollout sequence — requires separate operator approval

1. Approve the pinned DEV SHA, run the existing manual
   `workflow_dispatch` release with `target=development` and
   `apply_remote=true` only after checking all existing safety gates.
   This normal deployment leaves shadow OFF because it does not load
   the optional overlay.
2. Prepare separate local DEV secrets for Neo4j and graph-reader,
   with `chmod 600`; do not print, upload or place the secrets in
   `.env` or workflow inputs. Run the read-only preflight.
3. With explicit permission, use the existing isolated
   `compose.graphrag.dev.yaml` and `compose.graphrag.reader.dev.yaml`
   to start and seed DEV Neo4j and the internal reader. Confirm they
   share only the DEV backend network and publish no host ports.
   Repeat the preflight with `--require-running`.
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
