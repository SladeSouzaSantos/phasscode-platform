# Gate 9 / F4.1 — Compatibilidade dinâmica Orbe × HydraDB v0.3.0

**Status:** matriz funcional em contêineres descartáveis concluída; **migração direta NÃO homologada**. Toda a execução ocorreu em um runner GitHub-hosted, sem Tailscale, SSH, MiniMac, volumes ou credenciais operacionais. Não houve benchmark de motores nem alteração do Orbe.

## Evidência

- [GitHub Actions #42151726372 — success](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42151726372), branch experiment/hydradb, commit e52ed8b5e9e70736861bd5a09c3f17e6067bdc0b.
- Imagens: ghcr.io/hydra-db/hydradb:0.3.0 e neo4j:5.26; tags de versão, não digests imutáveis. Congelar digests para o ADR.
- Limites de execução: 2 GiB e 1,5 CPU por contêiner, portas loopback no runner, credenciais aleatórias, fixture 100% sintético, cleanup automático confirmado.
- Contrato original: apps/orbe-node/src/adapters/neo4j-graph-queries.ts, exportado por scripts/gate9-runtime-fixture.ts sem usar dados reais.
- Instrumentação: scripts/hydradb-gate9-disposable-runtime.py (HTTP) e scripts/gate9-disposable-bolt.mjs (driver neo4j-driver).
- Documento upstream comparado: [HydraDB v0.3.0 Cypher support](https://github.com/hydra-db/hydradb/blob/v0.3.0/cypher-compat.md).

**Interpretação:** o workflow aprovado prova que a infraestrutura descartável executou e gerou resultados reproduzíveis. Não significa que todas as consultas sejam compatíveis com HydraDB.

## Matriz A — nove consultas Cypher originais do Orbe

| Consulta | Neo4j descartável | HydraDB descartável | Resultado para migração |
| --- | --- | --- | --- |
| graphConstraintCypher | Executou | HTTP 400 | ADAPT: constraints não portáveis |
| graphNodesCypher | Executou | HTTP 400 | ADAPT: UPSERT/SET mapa/IDs |
| graphRelationsCypher | Executou | HTTP 400 | ADAPT: relações e campos de origem |
| graphFindEvidenceCypher | 1 linha esperada | HTTP 400 | ADAPT: filtros, agrupamento e ligações |
| graphGetSourceCypher | 1 linha esperada | HTTP 400 | ADAPT: identidade textual/limites |
| driverCountNodesQuery | Contagem esperada (3) | HTTP 400 | ADAPT/VERIFY: count(n) e forma de MATCH |
| driverCountRelationsQuery | Contagem esperada (2) | HTTP 400 | ADAPT/VERIFY: count(r) e MATCH |
| graphPruneRelationsCypher | Executou | Aceita sem fixture equivalente | INCONCLUSIVO: pruning de snapshot não homologado |
| graphPruneNodesCypher | Executou | Aceita sem fixture equivalente | INCONCLUSIVO: pruning de snapshot não homologado |

**7/9** consultas originais foram rejeitadas pelo HydraDB (HTTP 400); **2/9** executaram sem demonstrar comportamento equivalente sobre uma projeção Orbe. Todas as nove foram executadas no Neo4j. A referência validou cardinalidades e contagens sintéticas, não todas as propriedades dos payloads de evidência.

## Matriz B — onze consultas adaptadas, com comparação de VALORES

| Operação sintética HTTP | HydraDB v0.3.0 |
| --- | --- |
| 1-hop com ID numérico e label | PASS — valor |
| filtro por igualdade em propriedade | PASS — valor |
| count(*) | PASS — valor |
| collect(scope) | PASS — coleção |
| IN positivo | PASS — valor |
| IN negativo | PASS — conjunto vazio |
| IS NULL negativo (propriedade presente) | PASS — conjunto vazio |
| IS NULL positivo (propriedade ausente) | PASS — valor |
| WITH ... ORDER BY ... LIMIT | HTTP 400 |
| toLower() | HTTP 400 |
| count(n) | HTTP 400 |

**8/11** consultas devolveram os mesmos valores que Neo4j; **3/11** deram HTTP 400. Os casos IN e IS NULL foram testados em cenários positivos e negativos.

**Divergência documentada:** o cypher-compat.md fixado em v0.3.0 afirma que IN e IS NULL não são suportados, mas a API HTTP da imagem :0.3.0 aceitou as formas simples avaliadas e retornou os valores esperados. É evidência para estas formas, não prova de suporte geral; requer esclarecimento de versão e endpoint.

## Matriz C — treze operações/marcadores de estado em grafos descartáveis

Cada sequência teve resultado correto em ambos os motores:

1. CREATE de par e relação, seguido de leitura confirmando aresta;
2. DELETE de relação, seguido de leitura confirmando ausência;
3. DETACH DELETE de nó, seguido de leitura confirmando ausência;
4. MERGE de caminho executado duas vezes, com count(*) confirmando somente uma relação;
5. SET de propriedade e leitura confirmando novo valor;
6. UNWIND parametrizado com uma linha de mapa e leitura confirmando a ingestão.

**13 passos**, incluindo **7 operações de mutação** e **6 verificações** de pós-condição. Isso não comprova operações transacionais de várias instruções, índices, isolamento concorrente ou recuperação após falhas.

## Matriz D — Bolt com neo4j-driver JavaScript

Na rodada final, HydraDB aceitou verifyConnectivity() usando o token, mas quatro consultas de leitura falharam com Neo.ClientError.Statement.InvalidSyntax:

- MATCH por ID com um salto;
- MATCH por label e um salto;
- MATCH simples por label;
- MATCH parametrizado por ID e um salto.

As mesmas quatro consultas passaram no Neo4j com o mesmo driver. Em uma execução anterior houve ERR_OUT_OF_RANGE durante a conectividade HydraDB. **Portanto, o caminho Bolt ainda não está homologado**, apesar da paridade funcional HTTP em consultas adaptadas. É necessário investigar negociação de protocolo, seleção da base e serialização, sem assumir uma causa.

## Limites e próximos passos

- Não houve teste integral do EvidenceGraphRepository, nem 16 fontes/38 claims do PPKS, nem geração de respostas de recrutadores.
- Não foram medidos p50/p95, throughput nem consumo comparável. Nenhum dado justifica afirmar maior performance de motor.
- Não houve teste de segurança operacional, multiusuário, HA, object storage S3, backups, falhas ou licença.
- Nenhum serviço ou volume do MiniMac, DEV ou MAIN foi modificado.

**Decisão:** manter Neo4j como motor operacional. No F4.2, prototipar adaptador EXCLUSIVO DO LAB com IDs numéricos, relações de proveniência, filtros sem dependência de funções rejeitadas, ordenação e limites verificáveis. Investigar Bolt em separado. Só após paridade canônica completa comparar desempenho controlado (F4.3) e emitir ADR (F4.4).

**Conclusão do diagnóstico F4.1:** compatibilidade direta reprovada no conjunto testado; compatibilidade parcial de Cypher adaptado demonstrada em condições sintéticas e descartáveis. Não é autorização para migração.
