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
