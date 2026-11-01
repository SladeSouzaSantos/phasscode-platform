# PPKS Semantic Relations v1.0

This is a **small, curated semantic graph**, not a database and not an inference of personal proficiency.
Source: `knowledge/ppks/semantic-relations.json`; contract: `schemas/semantic-relations-v1.schema.json`.

## Node and edge contract

Nodes represent **technologies, databases, platforms, languages, frameworks, and concepts**.
Edges express a limited, named relationship: `is_a`, `uses_language`,
`offers_service`, `uses_concept`, `supports_concept`,
`compatible_with` or `transferable_foundation`.

A relationship describes the **technical ecosystem** and must not be treated
as proof the developer has used both endpoints. The `skill` field (when present)
connects to the already validated PPKS `academic/skills.json` evidence map.
Direct experience is always attached to actual retained `KnowledgeDocument` IDs.

## Recruitment examples

- **SQL** is a query language used by **MySQL** and **PostgreSQL**. The
  recorded Geowellex/PHP/MySQL work remains a *declared professional experience*,
  independent from SIGAA/PostgreSQL. Knowledge of SQL is transferable, but not
  proof of having used every relational database.
- **NoSQL** covers different database families. **Redis** is an example of a
  key-value datastore. **Cloud Firestore** and **Firebase Realtime Database**
  are NoSQL services offered by the **Firebase platform**. The existing
  Greencity SDGP/Firebase record does **not** prove which Firebase database
  service was implemented.
- **Java** provides experience with object-oriented programming. **React** is
  primarily component-oriented, using functional components, composition,
  state, and Hooks. OOP foundations can help with software organization, but
  they do not replace JavaScript/TypeScript and React skills. Here, direct React
  evidence already exists in the author's `web-portfolio-v2` repository.

## Runtime and safety

The graph is loaded **once at application initialization** into memory. A
small relational summary is recomputed while the provider compacts context,
so only **retained documents** may appear as personal evidence. The graph
does not contact GitHub, invoke a LLM, open a network connection, expose
private documents, or change the public chat response contract.

Every source assertion must remain scoped as a **project**, a **professional
experience**, an **academic record**, or a **course**. No transfer relation
should ever be promoted to professional experience or verified implementation.

The graph uses the existing PPKS validation command:
`npm run ppks:check`, plus `tests/semantic-graph.test.ts`.

## When to consider a graph database

A database such as Neo4j is optional later, if the curated graph becomes large,
requires interactive multi-hop queries, or needs independently updated graph
records. First measure recall and factual precision in recruiter evaluations.
A migration should preserve these stable node and edge IDs and provenance.
