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

## F3.3 — PPKS transfer planning, structured vacancy coverage and factual selection

- `graph-transfer-planner.ts` consumes the **curated**
  `knowledge/ppks/semantic-relations.json` and the real PPKS evidence
  projection. Only explicit **directional** `transferable_foundation` edges
  whose two endpoints have real PPKS skill IDs create a transferable-skill
  suggestion. The Java → React foundation edge is usable if Java has
  independently sourced claims; SQL/NoSQL `is_a`, `uses_language`, and
  `offers_service` relations never become experience with another tool.
  Go currently has no such curated edge, so the preview must defer to PPKS.
  An arbitrary request cannot add edges or infer transitive proficiency.
- `graph-vacancy-plan.ts` accepts **structured, explicitly extracted** vacancy
  items with an individual `mandatory` bit. Exact catalog/alias matching
  preserves desirable and required flags, keeps _all_ unknown items (Go,
  certifications, unfamiliar frameworks), and deduplicates repeated items
  without dropping a required classification. It is **not** a classifier for
  arbitrary vacancy prose; extracting those items reliably is a separate
  future task.
- `graph-recruiter-preview.ts` accepts an optional trusted vacancy plan. A
  plan containing even one unknown item triggers the existing canonical
  PPKS fallback before querying Neo4j, with
  `reason='unrecognized_requirements'` and the unknown labels retained in
  this **offline-only** result. No artificial 29-item cutoff is introduced.
- `graph-narrative-verifier.ts` accepts only a _structured plan of verified
  claim IDs_, not arbitrary LLM-written factual sentences. Each selected
  claim must exist in the appropriate requirement match with all public
  source IDs and a known scope. Final natural-language prose is generated
  by the existing controlled professional-advocacy renderer. Extra unsupported
  fields or invented IDs are rejected. This design does not claim to solve
  open-ended semantic truth checking; free prose generation remains gated.

No files in the public Orbe startup, chat route, Compose secrets or deployment
have been changed for this increment. The real DEV graph-reader continues
running unchanged; this is offline code and test qualification only.

## F3.3 — evidence-anchored extraction of signposted vacancy prose

`graph-vacancy-text.ts` extracts individual candidate requirements from
**explicitly signposted** requirements / must-have / desired-skills sections,
and from recognized `Exigimos:`, `Diferenciais:` etc. It preserves mandatory
versus desirable classification, verbatim excerpts and unknown items. It does
not assume that every arbitrary paragraph in a LinkedIn job posting was
exhaustively parsed; if no structured sections are present it aborts to the
existing PPKS fallback.

For richer semantic interpretation, a caller can inject a separately
budgeted `proposeLabels(fragments)` function (potential future LLM).
Its output is **untrusted data**: there must be one proposal for every
fragment, with exactly matching verbatim source excerpts and unique IDs.
A proposed label must occur literally in its source. If it only covers
part of an inseparable phrase (e.g. interpreting `SQL Server` as `SQL`
or `Java ou C#` as `Java`), the full phrase is preserved instead of
discarding the remainder. Model-proposed seniority, ungrounded requirements,
and extra output fields are rejected.

No actual model is invoked by this increment; the default label selector is
conservative and local. Existing `createStructuredVacancyPlanner` maps
those grounded labels to PPKS skills and retains every unknown item; the
`evaluateGraphRecruiterPreview` callback supports this planner without
changing any public Orbe route. This is a safe staging gate, not a claim of
open-ended semantic completeness. No server/Compose/secrets changes or
remote deployments were made.


## F3.3 — budgeted LLM interpretation of evidence-anchored vacancy labels

`graph-semantic-vacancy.ts` introduces an **injected** semantic label
proposer for `createEvidenceAnchoredVacancyPlanner`. It accepts ONLY an
existing `LlmInvocationFactory` (not API keys, bare clients, raw URLs or
direct provider calls). With the Orbe factory in
`adapters/fallback-llm.ts`, every actual attempt reserves the *existing*
provider-local and global Redis budgets and respects cooldowns, quotas and
per-provider deadlines. This increment makes one logical, tool-free model
request per signposted vacancy; configured provider fallback can attempt
further candidates, charging each attempt normally.

The system message restricts output to JSON with IDs, exact quoted fragments
and literal labels. The user/vacancy text is passed as untrusted data only;
no chat history, candidate private files, Neo4j passwords, API keys or
meeting tools enter the request. The model response is checked for valid
JSON, a strict schema, maximum response size and prohibited tool calls.
Then the existing *independent* source-anchoring planner checks that every
fragment is present once, quotes are verbatim, labels occur in the source,
and no composite or unknown requirement is silently discarded.
Bad proposals and unavailable models result in the canonical PPKS fallback,
not fabricated evidence. There is no LLM action or new HTTP route in the
public Orbe; composing the factory with a production app requires a later
explicit rollout and accounting of shared per-turn logical call limits.

An LLM is not a guaranteed exhaustive parser of arbitrary job descriptions.
The gate currently accepts only explicitly signposted requirement sections
and declines unsignposted prose rather than claiming full coverage.
Unit tests use offline synthetic models, including the real
`createFallbackInvocationFactory` with mocked provider/global budgets.
