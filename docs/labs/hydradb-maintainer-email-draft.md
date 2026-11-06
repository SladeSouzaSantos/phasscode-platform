# Draft only — not sent

**To:** nishkarsh@hydradb.app  
**Subject:** Re: HydraDB — hands-on feedback from a Neo4j/GraphRAG integration

Hi Nishkarsh,

Thank you for your message and for noticing the Neo4j work in my portfolio. I was genuinely happy to hear from you — it means a lot to know that someone developing a graph database took an interest in what I've been building.

I'm working on Orbe, an AI assistant for my developer portfolio that uses verified professional evidence. Our existing GraphRAG integration uses Neo4j, so your message motivated me to test HydraDB v0.3.0 against that real application contract rather than just try a generic demo.

I put together a fully isolated Neo4j/HydraDB lab, using public portfolio records and reproducible GitHub Actions workflows. Some early findings:

- **Functional results:** Using a HydraDB-specific adapter with numeric IDs and explicit claim-to-source relationships, we reproduced **88/88 requirement comparisons and 64/64 individual source lookups** from seven public portfolio records. All 14 claims and 16 sources also survived HydraDB and MinIO restarts in our limited durability tests.
- **Migration differences:** Seven of our nine original Neo4j Cypher operations were rejected by HydraDB without adaptation.
- **Bolt/driver detail:** With the JavaScript Neo4j driver 6.2.0, two simple `MATCH` reads worked when no database was specified. However, parameterized `MATCH`, explicit database selection, and routed URI configurations still failed in different ways. We have a minimal reproduction.
- **Documentation:** Simple positive and negative `IN` and `IS NULL` queries worked over HTTP, although the pinned v0.3.0 documentation lists these forms as unsupported.
- **Preliminary F4.3 performance:** In a bounded, warm-cache run with **HydraDB backed by MinIO**, the one-skill p50 was **2.112 ms (HydraDB/HTTP) versus 3.452 ms (Neo4j/Bolt)**, and four-skill retrieval was **7.427 versus 11.562 ms**. All **1,024 measured application-method calls** returned equivalent evidence. Because transport, query shapes and storage differ, we are **not** claiming intrinsic engine superiority or lower operating cost.

The full case study, technical decisions, reproduction scripts, workflow logs, and limitations are here:  
https://github.com/SladeSouzaSantos/phasscode-platform/blob/experiment/hydradb/docs/labs/hydradb-maintainer-feedback-2026-11-06.md

I'd especially appreciate your guidance on the intended Bolt database/namespace behavior, parameter support, and Cypher migration patterns for evidence-heavy GraphRAG applications.

One note: **I don't speak English**, so a voice call wouldn't work for me. I'd be very happy to continue our conversation **by email**, using translation assistance, and share additional tests or minimal reproductions.

I'm also transitioning back into a dedicated software-development career, and I'm still learning about some graph database internals. I welcome corrections or suggestions to improve how I'm testing. My observations are from an application developer's perspective, and I hope they can be useful to the project.

Thanks again for reaching out!

Best regards,  
Pedro Santos

---

**Sending status: DRAFT ONLY. NOT SENT.** Review the technical report and recipient before sending. This experiment does not represent an actual migration of Orbe DEV/MAIN. All experiments are in `experiment/hydradb` with isolated test data.
