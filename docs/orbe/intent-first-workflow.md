# Intent-first Orbe workflow (DEV)

The initial turn preparation now uses a dedicated LangGraph graph:
context resolution, intent classification, conditional retrieval, and then the
existing canonical ChatService response pipeline. It does not introduce any
additional LLM calls or semantic classifiers.

- `application/intent/`: context reconstruction and deterministic retrieval intent.
- `application/workflows/`: typed state and conditional career/portfolio routes.
- `application/tools/`: turn-scoped model tools and deterministic application capabilities.
- `adapters/langchain-provider.ts`: model invocation, transcript, context limits and response audit.

The public tool allowlist remains `search_portfolio` only. Meeting capabilities
are still disabled by the public startup path. The graph reader is not a model
tool; the shared read-only graph capability is called by the existing
recruiter graph. Shadow and Active policies remain unchanged.

Intent labels are retrieval hints, not security decisions. The original
ChatService policies, exact experience calculations, source checks, fallbacks
and final response generation remain authoritative. A later increment can move
additional response stages into the graph after regression evaluation. No
semantic intent classifier, autonomous GraphRAG tool, or additional model
permissions are enabled by this refactor.

Regression coverage includes typo-based career duration, technology ellipsis,
isolated follow-ups, policy classification and tool schema/allowlist validation.
Run `npm run check` and the existing HTTP and browser suites before a manual DEV
deployment. Do not change GraphRAG Shadow or production configuration.
