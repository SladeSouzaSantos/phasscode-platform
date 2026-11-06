# Draft only — NOT SENT (updated after v2 documentation review)

**To:** nishkarsh@hydradb.app  
**Subject:** Re: HydraDB — evidence-based feedback from an Orbe/Neo4j GraphRAG PoC

Hi Nishkarsh,

Thank you for reaching out and for noticing the Neo4j improvements in my portfolio. I was genuinely pleased to hear from you.

I'm building Orbe, an evidence-grounded AI assistant for my developer portfolio. Your message prompted me to create an isolated test lab comparing our existing Neo4j integration with the **open-source HydraDB v0.3.0 engine**, rather than relying on a generic demo.

We tested the same application-level evidence contract in both databases, with seven selected public portfolio records:
- **Functional parity:** 88/88 requirement comparisons and 64/64 individual source lookups matched using a HydraDB-specific adapter. The selected 14 claims and 16 source records also survived HydraDB/MinIO restart tests, including a run with pinned container image digests.
- **Migration compatibility:** Seven of nine original Neo4j Cypher operations were rejected without adaptation. Our reproduced Bolt results differed by client: JavaScript `neo4j-driver` 6.2.0 produced inconsistent connectivity/query errors, whereas Python driver 6.4.1 successfully executed three `MATCH` reads (including a bound parameter) using `default` or an unspecified database on the same isolated graph.
- **Exploratory performance:** In a small, warm-cache, MinIO-backed application-adapter run, one-skill retrieval had a p50 of 2.112 ms with HydraDB/HTTP vs 3.452 ms with Neo4j/Bolt; 1,024 measured calls returned equivalent evidence. A separate run reproduced the latency direction. Since transports, query shapes and caching differ, **this is not a claim that HydraDB's engine is intrinsically faster or cheaper**.

Before writing, I also reviewed your **[hosted v2 BYOG and Neo4j migration guide](https://docs.hydradb.com/essentials/v2/bring-your-own-graph)** and the **[v2 SDK documentation](https://docs.hydradb.com/api-reference/v2/sdks)**. They already explain HTTPS Cypher queries with `params`, externally owned IDs, batched `MERGE` imports, indexes and collection scoping. Those are helpful answers, so I don't want to ask you to repeat them. However, we haven't tested the **managed v2 API**, and we don't want to conflate it with the self-hosted **v0.3.0** engine.

I also checked the **[self-hosted v0.3.0 usage guide](https://github.com/hydra-db/hydradb/blob/v0.3.0/USING-HYDRADB.md)**: it already includes a JavaScript Bolt example with `database: 'default'` and a bound parameter. This makes our inconsistent JavaScript results a useful concrete reproduction of a difference from the documented example, rather than a request for basic driver instructions.

Two questions remain particularly useful:
1. For self-hosted v0.3.0, is there a recommended **JavaScript Neo4j Bolt driver/database/routing configuration**, or are the differences we observed between JS and Python drivers known? Is managed v2 BYOG the intended alternative to that particular Bolt path?
2. How closely do the **hosted v2 BYOG Cypher features** correspond to the open-source v0.3.0 engine? For our object-storage workload, which interrupted-write/recovery or bookmark tests would you prioritize beyond clean service restarts?

I documented the architecture, the adapter changes, both successful and unsuccessful tests, and the GitHub Actions reproductions here:

https://github.com/SladeSouzaSantos/phasscode-platform/blob/experiment/hydradb/docs/labs/hydradb-maintainer-feedback-2026-11-06.md

One practical note: **I don't speak English**, so I wouldn't be able to join a voice call. I'd be very happy to continue **by email**, using translation assistance, and share the exact reproductions.

I'm transitioning back to full-time software development and still learning more about graph database internals, so I welcome corrections to my testing methodology. I hope this application developer's perspective is useful, and I appreciate your interest in my work.

Best regards,  
Pedro Santos

---

**Status:** DRAFT / NOT SENT. No managed v2 HydraDB endpoint has been called; all measured tests were on isolated open-source v0.3.0 containers. The repository branch is `experiment/hydradb`; no DEV/MAIN changes or deployments.

**Review notes:** [documentation v2 vs v0.3 matrix](hydradb-v2-docs-review-2026-11-06.md) · [Portuguese review version](hydradb-maintainer-email-draft-ptbr.md).
