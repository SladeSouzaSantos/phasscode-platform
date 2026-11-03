# F3.4 — initial recruiter regression matrix (DEV-only, offline)

## Purpose and scope

The initial GraphRAG regression runner replays the **existing** nine cases
in `evaluation/vacancies-ppks-v12.json`: six role/vacancy scenarios and
three academic scenarios, already curated for recruiter-facing Orbe.
It uses the real deterministic PPKS evidence projection, not fabricated
candidate qualifications or new LinkedIn downloads.

Run from the repository root with Node 24:

```bash
npm ci --ignore-scripts
npm run eval:orbe:graphrag:offline
npx vitest run tests/graphrag-recruiter-offline.test.ts
```

The command emits a structured JSON report to stdout with only case IDs,
turn indices, modes, reasons, counts, and diagnostic coverage statuses.
It deliberately omits questions, answers, private sources and credentials.
Output is deterministic for the same PPKS/catalog checkout.

## Architecture and safety

- `evaluation/graphrag-recruiter-offline.ts` uses
  `projectPpksEvidenceGraph`, `createSnapshotRequirementIdentifier`,
  `analyzeVacancyEvidenceCoverage` and the real
  `evaluateGraphRecruiterPreview` control flow.
- The isolated `EvidenceGraphRepository` test adapter reads the in-memory
  PPKS projection. It is **not** a Neo4j, network or live HTTP integration
  test; the existing public-only gateway still filters private claims.
- The canonical PPKS callback is a **sentinel** used to verify routing. A
  fallback here is not a measured complete natural-language PPKS answer.
- Existing recruiter prompts are conversational: vacancy-text coverage is
  diagnostic **only** and is never silently treated as an exhaustive analysis
  of the quoted job requirements.
- In addition to the corpus, tests exercise explicit 33+ technology lists,
  unknown Go, mixed professional/study evidence, no invented experience years,
  private source rejection and 2/3-turn **independent** fixture replay.
- No LLM calls, Redis budget reservations, Neo4j queries, API routes,
  credentials, production data, chat history or HTTP requests occur.

## Interpretation of the output

`verified_graph` means that the deterministic public-only gate found
source-complete matching claims in this snapshot. It is **not** a holistic
recruiter assessment or an assurance that a particular job is a full match.
`canonical_ppks` means a safe fallback route, not an automated pass/fail
about the candidate's ability.

`baselineComparison: not_run` is mandatory: this offline matrix does not
run the historical v0.1.0 model and cannot claim improved response quality.
Likewise, a multi-turn fixture merely counts successive independent prompts;
it **does not** demonstrate conversational follow-up memory.

## Remaining acceptance gates

1. F3.3: finish safe DEV-only chat composition behind a flag that defaults
   OFF, with a shared per-turn model-call budget and canonical PPKS fallback.
2. F3.4: run equivalent _actual responses_ against baseline v0.1.0 and
   GraphRAG in a controlled environment; report source/claim correctness,
   persuasive professional tone, studies versus jobs, requirements coverage,
   and per-model costs without comparing unrelated environments.
3. F3.4: real 2/3-turn HTTP conversations and authentic vacancy descriptions
   with human-reviewed expected requirements, including alternatives.
4. F3.5: CI, privacy, DEV deploy SHA, observability, rollback/feature-flag
   OFF checks and security acceptance before any main promotion.

Work remains exclusively in `dev`; no production or public Orbe activation.
