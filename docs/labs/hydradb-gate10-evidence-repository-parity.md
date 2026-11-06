# Gate 10 — paridade real do contrato EvidenceGraphRepository (LAB)

**Data:** 06/11/2026. **Status:** PASS em fixture sintético delimitado; não autorizado substituir o Neo4j. Nenhuma modificação em dev/main, serviços MiniMac ou dados reais PPKS.

## Implementação

Em `experiment/hydradb`:

- [Fixture sintético tipado pelo contrato ORIGINAL do Orbe](../../scripts/hydradb-gate10-fixture.ts): 19 nós, 10 relações, 4 claims, 6 fontes, 2 competências documentadas (Java, Flutter) e Go ausente. Inclui `professional`, `study`, `mixed_role` e `personal_project`, `code_reviewed` e `catalog_only`.
- [Adapter HydraDB LAB](../../scripts/hydradb-gate10-repository.ts): implementa `EvidenceGraphRepository` com consultas Cypher fixas, base64 de payloads tipados, IDs numéricos físicos e chaves externas textuais; fonte completa antes de `LIMIT`; rejeição de fontes/arestas faltantes/duplicadas; transporte HTTP somente loopback CI, sem exportação na API do Orbe.
- [Runner de comparação real](../../scripts/hydradb-gate10-ephemeral-parity.ts): inicializa Neo4j via `Neo4jGraphStore.seed` e consultas originais de `Neo4jEvidenceRepository`, inicializa HydraDB com MERGE em vértices numéricos e arestas `SUPPORTED_BY`, executa os mesmos métodos de domínio. Todos os resultados são normalizados por claims e fontes, **sem ocultar escopos ou diferenças de verificação**.
- [Testes de falha/fallback em memória](../../tests/hydradb-gate10-repository.test.ts): recusa claim incompleta, fonte extrínseca, aresta duplicada, entrada inválida; `graphOrCanonical` preserva resposta canônica quando o grafo falha.
- [CI offline](../../.github/workflows/hydradb-gate10-offline.yml) e [CI descartável de engines](../../.github/workflows/hydradb-gate10-parity.yml), ambos apenas na branch experimental, sem Tailscale ou SSH.

## Evidência executada

- [GitHub Actions #42161919256 — offline unit/typecheck PASS](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42161919256).
- [GitHub Actions #42162281328 — engines reais e adapter parity PASS](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42162281328), SHA `aa62d9edf5dbd57a825fe5bef7ce8909bb09e42e`.
- Marcadores do runner: `GATE10_EPHEMERAL_PAIR_READY`, `GATE10_REPOSITORY_CONTRACT_PASS`, `GATE10_DISPOSABLE_CLEANUP_COMPLETE`.

| Asserção | Resultado |
| --- | --- |
| Identidade do código de contrato DEV/MAIN/LAB | 8/8 arquivos versionados, comprovados no Gate anterior |
| Execução de métodos `findEvidence` no mesmo fixture | 20/20 cenários de valores/paridade |
| `getSource` com fontes específicas (repetição de quatro fases) | 24/24 comparações de fontes existentes |
| Ausência de Go e fonte desconhecida | Vazio/undefined, sem inventar experiência |
| Limite de uma claim preservando todas as suas fontes | PASS |
| Repetir a mesma projeção (MERGE/idempotência de resultados) | PASS |
| Inserir uma segunda rodada, consultar primeira sem contaminação | PASS |
| Consultar a segunda rodada com seus dados isolados | PASS |
| Falha injetada no grafo -> fallback `graphOrCanonical` | PASS |
| Contrato completo do PPKS atual, não apenas o fixture | NÃO TESTADO |
| Persistência com MinIO/restart | NÃO TESTADO no Gate 10 |
| Transações/snapshots idênticos ao Neo4j | NÃO TESTADO |
| Bolt HydraDB com driver de produção | NÃO PASSOU no Gate 9; não testado nesta suíte |
| Performance e custo | NÃO MEDIDO |

### Separação dos dados históricos

Gate 3 comparou 7 registros públicos PPKS, 10 skills, 14 claims e 16 fontes, 47 vértices e 60 arestas, em 13 consultas × duas rodadas. Gate 8 usou 20 perguntas sintéticas de recrutadores com 38 claims/103 vínculos por ocorrência como aferição de **paridade e fallback de evidências**. **Gate 10 é uma terceira fixture:** 19 nós do contrato TypeScript e 10 relações lógicas, com subset físico Hydra de claims/skills/sources.

Os números dos três conjuntos **não** devem ser somados nem entendidos como equivalência integral do snapshot real.

## Limitações e próximo aceite

A prova atual é uma **portabilidade funcional delimitada, não uma migração**. Os dados são inteiramente sintéticos para evitar expor registros privados acadêmicos. Na etapa seguinte, queremos validar o mesmo port num corpus público maior (preferencialmente a projeção PPKS validada em Gate 3), durabilidade de object storage MinIO e reabertura após reinicialização, além de resolver o Bolt. Não modificar o Orbe em DEV/MAIN antes desses resultados e de uma decisão arquitetural explícita.

**Feedback ao mantenedor:** mostramos por que a aplicação utiliza evidências individualmente qualificadas e quais alterações de identidade, Cypher e origem foram necessárias para reproduzir o contrato de busca.
