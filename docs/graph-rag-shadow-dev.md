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
- ORBE_GRAPH_READER_TOKEN set to a separately mounted, appropriately scoped
  read-only reader bearer token (43–128 URL-safe characters).

The deployment's NODE_ENV value is **not** an environment discriminator:
the runtime Docker image uses NODE_ENV=production in both DEV and PROD.
The separate DEV stage and explicit approval are required deliberately.
Do not set these values in production. Do not copy NEO4J_AUTH,
NEO4J_PASSWORD, NEO4J_URI, Bolt credentials, or seed privileges into Orbe.
The existing assertPublicOrbeGraphIsolation guard still forbids them.

These are *configuration instructions*, not a deployment. The repository's
Compose manifests, environment files and Mac Mini services are unchanged.

## Behavior, privacy and resilience

- Shadow is assembled at startup only for the three explicitly approved
  settings. Invalid/missing reader token fails startup safely, before serving.
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
  requirement counts and unknown counts. Never log question, answer, model
  prompt, source URL, token, exception details or personal information.
- No additional LLM request is made. Previous shared logical model budget
  remains staged and is not yet attached to the public response generation.
  F3.3's verified GraphRAG answer is **not** sent to the visitor in shadow.

## Rollback (no data migration)

Remove ORBE_GRAPH_READER_TOKEN from the public runtime environment and set
ORBE_GRAPHRAG_MODE=off (or omit all GraphRAG variables), then restart only
the DEV Orbe API through the existing approved deployment procedure.
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
