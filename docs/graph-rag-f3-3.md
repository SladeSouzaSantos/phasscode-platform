# F3.3 — LangGraph.js staged rollout

## First code increment

- `@langchain/langgraph@1.5.3` locked with the official npm resolver on Node 24.
- A standalone compiled `StateGraph` has exactly six deterministic nodes:
  `parseQuestion → identifyRequirements → retrieveGraphEvidence →
generateGroundedAnswer → verifyClaims → respond`.
- The graph executes no LLM calls and no Neo4j connections by itself;
  its query adapter and requirement parser must be injected by trusted tests
  or future application composition. The public Orbe runtime is **not wired**.
- All evidence passes through `PublicGraphEvidenceGateway`: only public
  source-complete claims can be rendered. A graph outage or mixed/private
  evidence returns abstention, never a fabricated factual claim.
- The caller must retain the canonical PPKS fallback when the graph abstains.
  This workflow must **not** be used as the public chat implementation yet.
- Recursion depth is bounded by the caller. There are no cycles/checkpoints,
  no LangSmith tracing and no background tasks.
- This is **not yet** the full issue #30 acceptance: parser integration,
  generative candidate verification, safe internal gateway transport,
  recruiter regression matrix, feature flag and rollout remain pending.

## Security order of operations

1. Finish F3.2 process-isolated graph-reader gateway with independent token
   authentication and private/public separation; no admin credentials in Orbe.
2. Verify the six-node pipeline against malicious/unsupported claims and
   recruiter scenarios without extra LLM calls.
3. Add an explicit DEV-only flag with default `false` and the existing PPKS
   fallback; keep MAIN unaffected pending functional sign-off.

## F3.3 — typed HTTP reader client (offline integration)

`apps/orbe-node/src/adapters/graph-reader-http.ts` implements the same
`EvidenceGraphRepository` port used by the offline LangGraph. It uses
`http://graph-reader:8765` exclusively, with a separate bearer secret;
neither a Neo4j URI nor a Bolt admin credential is supplied to the client.
The client uses a bounded request size, response streaming size limit, 5 s
request deadline, no redirects, strict response schemas and verification
of the complete **public** source chain for each claim. Remote errors and
private response details never appear in exception text.

The adapter is **not instantiated in public `main.ts`**: no API route,
public feature flag, additional provider call or Mac Mini deployment was
introduced by this increment. Tests use Fastify `inject` as the private
transport and pass the client to LangGraph offline. The reader's token can be
mounted into a _separate unprivileged consumer_ in a later rollout; do not
copy `neo4j_auth` or seed credentials into public API. The verified DEV
`graph-reader` is left running and unchanged.

Further promotion gates: verify HTTP client/reader integration on isolated
Docker services, application-level cost and timeout budgets, semantic
requirements extraction, free-prose claim verification and explicit
fallback to the canonical PPKS without escalating the public app's privilege.

## Offline requirement identification and canonical fallback

`graph-requirements.ts` builds an explicit requirement recognizer from approved
PPKS skill labels and optional curated aliases. Its bounded matching uses
whole normalized phrases and longest-first overlap resolution (SQL Server
does not imply generic SQL; JavaScript does not imply Java). It preserves all
explicit matches, including lists longer than 29 requirements. It is _not_
an LLM-driven semantic parser: unknown concepts, synonyms and job descriptions
must not be silently declared fully covered; later milestones require a vetted
semantic extraction path with unrecognized requirements surfaced.

`graph-recruiter-preview.ts` executes LangGraph as an **offline opt-in preview**
and uses a caller-provided canonical PPKS response if graph retrieval fails,
nothing matches, or _any_ requested requirement lacks public direct evidence.
The canonical callback is explicit: no separate LLM request is initiated by
the adapter and no fallback is fabricated. No app route, config flag, HTTP
server or main bootstrap has been changed. There is no new Mac Mini deploy.
Tests verify Java versus JavaScript, SQL Server versus SQL, 40-item parsing,
complete coverage, unavailable reader and canonical fallback exactly once.


## Professional advocacy — positive but evidence-bound (offline)

The Orbe assistant represents a candidate to recruiters, not an auditor
enumerating missing credentials. The deterministic
`graph-professional-advocacy.ts` renderer prioritizes validated employment
and project claims, preserves their scope and source identifiers, and never
converts a study project into paid professional experience. It distinguishes:

- **Direct support:** positive presentation of an explicitly evidenced skill.
- **Transferable foundation:** if a skill such as Go lacks direct evidence,
  only a curated rule with **separately documented** adjacent skills can
  support a qualified explanation of learning/adaptation potential.
- **Unresolved:** missing or private sources, unsupported transfer rules and
  graph failures return to the canonical PPKS callback. Missing graph data
  never warrants the absolute claim that the candidate has never studied
  a technology.

`graph-recruiter-preview.ts` now distinguishes `verified_graph`,
`transferable_graph` and `canonical_ppks`. Transfer rules are optional,
trusted configuration only; neither arbitrary questions nor taxonomic links
can promote unrelated technologies into claimed proficiency. No LLM,
public route or runtime flag is activated. For real deployment, use a
vetted PPKS catalog and preserve unknown or job-specific requirements
rather than claiming full semantic coverage. `createSnapshotRequirementIdentifier`
extracts real skill vocabulary from the canonical PPKS graph snapshot.
