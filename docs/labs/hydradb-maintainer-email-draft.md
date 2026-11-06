# Draft only — not sent

**To:** nishkarsh@hydradb.app  
**Subject:** Re: HydraDB — feedback from a hands-on Neo4j/GraphRAG migration PoC

Hi Nishkarsh,

Thanks for reaching out! I'd be happy to chat for 10 minutes.

Your object-storage-native graph approach caught my interest because I'm building Orbe, an evidence-grounded AI assistant for my developer portfolio. We already use Neo4j for optional GraphRAG retrieval over a versioned professional evidence base, so I tried adapting our actual graph retrieval contract to HydraDB v0.3.0 rather than just running a generic benchmark.

I set up isolated HydraDB and Neo4j 5.26 experiments and documented both the changes needed and the results:

- **What worked:** An adapter using numeric graph IDs, explicit claim→source provenance edges and supported Cypher preserved the same Orbe repository outputs for **88/88 requirement-level comparisons and 64/64 source lookups** on seven public portfolio records. A separate MinIO-backed run recovered **14 claims and 16 sources**, with identical result digests after restarting HydraDB and MinIO.
- **Where migration was not plug-and-play:** Seven of our nine original Neo4j Cypher operations returned HTTP 400 in HydraDB. The Neo4j JavaScript driver could establish Bolt connectivity, but four basic `MATCH` reads returned `InvalidSyntax`.
- **A documentation discrepancy:** Simple `IN` and `IS NULL` forms worked in the v0.3.0 HTTP runtime, although the pinned Cypher-support document lists them as unsupported.
- **One setup issue:** The upstream MinIO smoke script references Docker images that were unavailable from Docker Hub/Quay in our runner. We were able to reproduce the durability test using maintained Chainguard MinIO images.

These are deliberately limited functional results, not evidence of a speed/cost advantage or a production-ready replacement for Neo4j. We have not changed our deployed Orbe environment.

I put together a reproducible technical case study with the architecture, adaptation strategy, scripts and GitHub Actions logs:  
https://github.com/SladeSouzaSantos/phasscode-platform/blob/experiment/hydradb/docs/labs/hydradb-maintainer-feedback-2026-11-06.md

I'd particularly appreciate your perspective on the recommended Bolt/JavaScript driver configuration, the intended v0.3.0 Cypher subset and the most useful object-storage failure tests for a workload like this.

I'd be glad to compare notes in a short call and share any minimal repros.

Best regards,  
Pedro Santos

---

**Sending status:** DRAFT ONLY. No email has been sent. Verify the report and final links before sending. The runnable scope is `experiment/hydradb`, not a production migration.
