# HydraDB × Neo4j — primeira amostra PPKS (MiniMac, 2026-11-05)

## Resultado observado

Fonte: saída de terminal fornecida pelo operador do LAB em
`~/hydradb-lab/phasscode-platform` após executar
`python3 scripts/hydradb-neo4j-ppks-benchmark.py --live`.
Não houve acesso direto deste relatório ao host nem ao JSON de resultados.

- HydraDB: v0.3.0, imagem oficial GHCR por digest, armazenamento local.
- Neo4j: imagem `neo4j:5.26`, serviço `neo4j-compare` exclusivo do LAB.
- PPKS: cinco projetos + duas experiências, amostra derivada de dados
  declaradamente públicos, 14 pares de tecnologia.
- Cada motor: 14 escritas de relações sintéticas `USES_TECHNOLOGY`.
- Leituras: 42 consultas por motor; todos os valores esperados coincidiram.
- **Paridade funcional do teste sintético de 1 hop: APROVADA.**
- Latência local p50 observada: HydraDB **2,335 ms**; Neo4j **95,119 ms**.
- Arquivo gerado no host:
  `~/hydradb-lab/benchmarks/ppks-graph-20261105T204432Z.json`.
  O operador compartilhou seu conteúdo integral para esta análise.
- Escrita (14 requisições por motor): HydraDB p50 **11,062 ms** / p95 **14,611 ms**; Neo4j p50 **294,925 ms** / p95 **1.428,592 ms**.
- Leitura (42 requisições por motor): HydraDB p50 **2,335 ms** / p95 **3,387 ms**; Neo4j p50 **95,119 ms** / p95 **108,664 ms**.

## Healthcheck do Neo4j: causa provável identificada

O comando `docker compose ... up -d --wait neo4j-compare` declarou
`unhealthy`, **mas a API HTTP autenticada executou 14 escritas e
42 consultas corretamente**. O diagnóstico do operador depois mostrou:

- `NEO4J_LAB_STATE running`, `NEO4J_LAB_HEALTH unhealthy`;
- cinco healthcheck probes com `ExitCode -1`;
- `NEO4J_LAB_OOM_KILLED False` e zero reinicializações;
- binário `cypher-shell` presente;
- variável `NEO4J_AUTH` presente no contêiner;
- `cypher-shell` autenticado executou `RETURN 1` com saída 0,
  levando **16,43 s**;
- timeout original do healthcheck **8 s** com repetição a cada **10 s**;
- `docker stats`: CPU do Neo4j **75,80%** com cota **0,75 CPU**, RAM
  **602,8 MiB / 896 MiB**. HydraDB **1,42%** de CPU e
  **5,715 MiB / 2 GiB** naquele instante.

Portanto, o mecanismo de verificação tinha um timeout **mais curto do
que uma consulta autenticada comprovadamente bem-sucedida**. A
carga de verificações repetidas é uma interferência importante no
benchmark; não podemos concluir que seja o único motivo das
latências do Neo4j.

Correção isolada na branch `experiment/hydradb`, commit `e53ea725`:

- healthcheck agora usa uma **checagem TCP leve** da porta HTTP `7474`
  (sem iniciar JVM via `cypher-shell`);
- intervalo de 15 s, timeout de 5 s e período inicial de 45 s;
- a checagem TCP não comprova autenticação: **o benchmark continua
  executando `RETURN 1` autenticado pela API HTTP antes de gravar**;
- limites CPU e memória **não foram alterados**, para testar primeiro o
  efeito da mudança isoladamente.

Para aplicar somente ao serviço de comparação, preservando volumes,
HydraDB e Orbe LAB:

```bash
cd ~/hydradb-lab/phasscode-platform
git pull --ff-only origin experiment/hydradb

docker compose -p phasscode-hydradb-lab --env-file .env \
  -f compose.yaml -f compose.hydradb-lab.yaml \
  -f compose.neo4j-compare.lab.yaml --profile neo4j-compare \
  config --quiet

docker compose -p phasscode-hydradb-lab --env-file .env \
  -f compose.yaml -f compose.hydradb-lab.yaml \
  -f compose.neo4j-compare.lab.yaml --profile neo4j-compare \
  up -d --no-build --no-deps --wait neo4j-compare

docker inspect --format '{{.State.Health.Status}}' \
  phasscode-hydradb-lab-neo4j-compare-1

docker stats --no-stream \
  phasscode-hydradb-lab-hydradb-1 \
  phasscode-hydradb-lab-neo4j-compare-1
```

Somente se `healthy`, repetir:

```bash
python3 scripts/hydradb-neo4j-ppks-benchmark.py --live
```

O comando `up` pode recriar apenas o serviço `neo4j-compare`; seu
volume nomeado continua preservado. **Não use `--remove-orphans` ou
`down --volumes`**. Sem relatório da segunda execução, não reivindicar
melhoria de latência nem nova relação de velocidade entre bancos.

## Interpretação correta

As duas APIs HTTP são diferentes: HydraDB usa
`POST /v1/graphs/lab/query`; Neo4j usa
`POST /db/neo4j/tx/commit`. O teste inclui abertura de conexão,
serialização, transação, tratamento HTTP, implementação e overhead JVM.
Os limites de recursos também são diferentes (HydraDB até 1 CPU/2 GiB;
Neo4j até 0,75 CPU/896 MiB, com heap e page cache restritos).
A amostra é pequena e a consulta é trivial.

A razão p50 aproximada de **40,7×** refere-se somente ao
**tempo de resposta HTTP observado neste microbenchmark**, não a
throughput, eficiência de GraphBLAS, eficiência de indexação, ou
desempenho geral de bases de grafos.

Não recomendar migrar produção nem ativar o GraphRAG do LAB baseado
nesses valores.

## Próximos critérios de homologação

1. Diagnosticar healthcheck do Neo4j e repetir comparação com ambos
   os serviços saudáveis, controle de recursos e protocolo equivalente
   quando possível (Bolt usando o mesmo driver).
2. Exercitar identidade real de competências: vários projetos
   compartilhando um mesmo nó Skill, preservando escopo profissional
   vs. estudo, fontes e origem das alegações.
3. Validar o subconjunto Cypher necessário no Orbe:
   `graphFindEvidenceCypher`, `graphGetSourceCypher`, filtros, ordenação,
   agregação, parametrização, limites, leitura de evidências e suporte
   a índice/snapshot.
4. Medir p50/p95 em mais repetições e tamanhos (carga fria vs. aquecida,
   1 e vários hops), RAM e CPU do processo com recursos equivalentes.
5. Somente depois avaliar um adapter HydraDB **exclusivo do LAB**,
   com fallback para PPKS e testes de regressão com perguntas de recrutadores.

**Proibição operacional:** jamais montar dados/volumes de `dev` ou
`main`, exportar arquivos acadêmicos privados para o grafo de
benchmark ou habilitar HydraDB no Orbe operacional.


## Segunda rodada — healthcheck corrigido e serviço saudável

Saída e JSON do operador (2026-11-05 21:24:27 UTC):

- Neo4j: **healthy**, CPU instantânea 3,39%, RAM 341,3 MiB / 896 MiB.
- HydraDB: CPU instantânea 1,66%, RAM 5,973 MiB / 2 GiB.
- Sem alterações nas cotas de CPU/RAM entre as duas rodadas.
- Escrita, 14 requisições por banco:
  - HydraDB: p50 **9,007 ms**, p95 **12,696 ms**, média **9,088 ms**.
  - Neo4j: p50 **174,668 ms**, p95 **849,865 ms**, média **287,772 ms**.
- Leitura, 42 requisições por banco:
  - HydraDB: p50 **2,342 ms**, p95 **3,277 ms**, média **2,453 ms**.
  - Neo4j: p50 **76,361 ms**, p95 **93,227 ms**, média **55,108 ms**.
- Comparação dos mesmos cenários: **42/42 leituras por banco corretas**
  e 14/14 pares de relações gravados em ambos.
- Relatório no MiniMac:
  `~/hydradb-lab/benchmarks/ppks-graph-20261105T212427Z.json`.

A latência p50 de leitura do Neo4j caiu **19,7%** entre rodadas; o
p50 de escrita caiu **40,8%**. A CPU instantânea caiu de 75,80% para
3,39%; as amostras foram colhidas em momentos distintos e **não**
equivalem a uso médio de CPU durante cada benchmark.

A latência p50 de leitura na segunda rodada foi **32,6 vezes menor**
para HydraDB *nesses requests HTTP*. Não chamar isso de vantagem geral
de desempenho do banco; transportes, JVM, cache, modelo e cotas diferem.

**Status do incidente:** healthcheck Neo4j resolvido operacionalmente.
**Status do benchmark:** paridade sintética 1-hop aprovada; desempenho
comparativo inconclusivo. Próximo gate é compatibilidade semântica com
claims, fontes e compartilhamento de competências, não integração do Orbe.


## Segundo benchmark semântico — primeira tentativa rejeitada

Saída do operador após atualização para commit `132c54e`:

```text
PPKS_GRAPH_PLAN_COUNTS {"claims": 14, "edges": 42, "records": 7, "skills": 10, "sources": 7}
PPKS_GRAPH_QUERY_CASES 18
PPKS_GRAPH_BOTH_ENGINES_READY
PPKS_GRAPH_WRITES_PER_ENGINE 42
PPKS_GRAPH_QUERY_FAILED neo4j record_skills experiencia-greencity HTTP - error_class ValueError
PPKS_GRAPH_TEST_FAILED ValueError Semantic parity failed; see preceding case
```

**Resultado: REPROVADO.** A ausência de HTTP error indica que a validação
levantou `ValueError`, mas essa mensagem genérica **não distingue**
mismatch de linhas, colunas ou erro de Cypher retornado pelo Neo4j.
Não reivindicar causa empírica conclusiva até obter o novo diagnóstico.

**Causa estrutural encontrada por inspeção do script:** o plano original
usava as mesmas 42 strings `MERGE (a {...})-[:REL]->(b {...})` para
ambos os motores. No Neo4j, o `MERGE` do *caminho completo não vinculado*
pode criar nós novos quando o relacionamento está ausente; não garante
reutilizar nós já criados pela mesma propriedade `id`. Isso é
incompatível com o modelo de identidade numérica do HydraDB e pode
desconectar claims de suas fontes/skills.

Correção restrita ao LAB: para Neo4j, upsert separado de **38 vértices**
seguido de 42 `MATCH` dos endpoints + `MERGE` da relação.
O HydraDB mantém as 42 operações existentes. O script agora informa
o motivo seguro da falha (contagem de linhas ou código de consulta),
sem ecoar credenciais, Cypher bruto ou respostas HTTP completas.

O reteste utiliza identificadores numéricos aleatórios *novos*, mantendo
as observações malformadas da primeira tentativa dentro do volume LAB;
não há modificação ou limpeza de volumes DEV/MAIN. Resultado do reteste
**pendente**: não marcar paridade de 18 casos como aprovada previamente.


## Segundo benchmark — resultado parcial e correção de semântica do peer

Saída após o ajuste de identidade de nós Neo4j (`a82ca38`):

```text
PPKS_GRAPH_NEO4J_VERTICES_SEEDED 38
PPKS_GRAPH_WRITES_PER_ENGINE 42
PPKS_GRAPH_QUERY_FAILED neo4j shared_peer_4_hop greencity-os HTTP - error_class ValueError reason neo4j: result mismatch for shared_peer_4_hop:greencity-os; got 1 rows, expected 2
```

A execução avançou até o último dos 18 cenários, mas **a suíte completa
ainda não foi aprovada**. Os resultados intermediários não devem ser
tratados como confirmação de paridade completa.

**Causa identificada na expectativa:** o planejador calculava
`peer_keys` incluindo o próprio `greencity-os`. O Cypher 5 do Neo4j
não reutiliza o mesmo relacionamento na mesma cláusula `MATCH`.
Na volta `Record→Claim→Skill←Claim←Record`, a autovinculação
reutilizaria arestas e não entra no resultado padrão. A documentação
oficial confirma essa regra:
https://neo4j.com/docs/cypher-manual/5/patterns/unique-relationship-paths/ .

A correção em `experiment/hydradb`, commit `6222536`:
- exclui o registro de origem do conjunto esperado;
- inclui `WHERE peer.id <> <numeric_id>` na consulta de 4 hops, para que
  ambos os bancos executem a **mesma semântica explícita**;
- mantém os demais 17 cenários e a validação de linhas/colunas intactos.

O único peer esperado para `greencity-os` nessa amostra é
`experiencia-greencity`, por compartilharem Flutter e Dart.
Um resultado com zero peers ou com o próprio registro continua sendo
reprovado. Como HydraDB é um subconjunto de Cypher, essa cláusula
também precisa ser **verificada em runtime**, não apenas presumida
por constar no documento upstream.

O reteste usa IDs aleatórios novos; dados sintéticos anteriores
permanecem isolados no laboratório. Nenhum volume deve ser apagado.

```bash
cd ~/hydradb-lab/phasscode-platform
git pull --ff-only origin experiment/hydradb
python3 -m py_compile scripts/hydradb-neo4j-ppks-provenance-benchmark.py
python3 scripts/hydradb-neo4j-ppks-provenance-benchmark.py
python3 scripts/hydradb-neo4j-ppks-provenance-benchmark.py --live
```

Critério de conclusão: `PPKS_GRAPH_PARITY_CASES 18 PASS` e
`PPKS_GRAPH_SEMANTIC_PARITY_PASS` em uma nova execução real.


## Segundo benchmark semântico — homologação concluída

Após exclusão explícita do próprio projeto na consulta de pares de
competências, o operador executou a suíte na branch experimental e
compartilhou o JSON `ppks-provenance-20261105T221106Z.json`
(2026-11-05 22:11:06 UTC).

**Resultado confirmado:**

```text
PPKS_GRAPH_PLAN_COUNTS {"claims": 14, "edges": 42, "records": 7, "skills": 10, "sources": 7}
PPKS_GRAPH_QUERY_CASES 18
PPKS_GRAPH_BOTH_ENGINES_READY
PPKS_GRAPH_NEO4J_VERTICES_SEEDED 38
PPKS_GRAPH_WRITES_PER_ENGINE 42
PPKS_GRAPH_PARITY_CASES 18 PASS
PPKS_GRAPH_SEMANTIC_PARITY_PASS
```

São **18/18 cenários** aprovados por banco, 54 leituras medidas por
banco (18 cenários × 3 repetições) e os mesmos valores retornados.
As verificações incluem 4 saltos e validação das fontes sintéticas.

| Leitura (p50 ms) | HydraDB | Neo4j | Amostras por motor |
|---|---:|---:|---:|
| Competências do registro | 3,742 | 14,144 | 21 |
| Proveniência do registro | 4,160 | 14,327 | 21 |
| Competência compartilhada | 4,607 | 11,429 | 9 |
| Peer de 4 relacionamentos | 5,471 | 51,800 | 3 |

Escrita p50: HydraDB **7,469 ms**, Neo4j **83,816 ms**
(42 chamadas por motor, porém **fluxos de escrita diferentes** e
38 upserts Neo4j fora da medição).

O experimento foi aprovado em **paridade semântica simplificada**.
As latências não constituem um benchmark controlado dos motores,
principalmente no caso de quatro relacionamentos (n=3).

O próximo teste foi separado no
[contrato de claims e fontes específicas](hydradb-ppks-contract.md).
Ele amplia a representação de 7 fontes sintéticas de registro para
16 **IDs específicos de evidência** associados individualmente
a cada claim. Não há integração com o Orbe operacional.


## Retificação de fidelidade PPKS (após a terceira suíte)

Os resultados do segundo benchmark de 18 casos comprovam que as
**duas implementações receberam e recuperaram a mesma projeção
sintética**, mas a projeção original simplificava incorretamente o
escopo da experiência `experiencia-greencity` como `professional`
em vez de `mixed_role` (engenharia + software).

Isso não invalida a comparação pontual de round-trips nem as
correspondências exatas entre os bancos para o dataset usado,
mas **impede classificar aquela rodada como fiel ao escopo do PPKS**.

A origem do erro foi corrigida em
`scripts/hydradb-neo4j-ppks-provenance-benchmark.py` e foi
adicionada validação de integridade em
`scripts/hydradb-neo4j-ppks-evidence-contract.py`, que recusa
qualquer discrepância de escopo antes de gravar.
A revalidação das 13 consultas da terceira suíte é obrigatória e
está descrita em [hydradb-ppks-contract.md](hydradb-ppks-contract.md).

Manter as duas medidas separadas no relatório final:
**paridade de resultados entre motores** versus
**fidelidade semântica à fonte canônica**.
