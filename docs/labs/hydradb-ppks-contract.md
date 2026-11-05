# Fase experimental 3 — contrato de busca PPKS → GraphRAG

**Escopo:** `experiment/hydradb` no clone isolado
`~/hydradb-lab/phasscode-platform`, serviço Docker
`phasscode-hydradb-lab`. Sem alterações à API Orbe, ao Neo4j DEV,
às fontes privadas de graduação ou ao banco MAIN.

## Resultado precedente — paridade de competências e proveniência

O segundo experimento em 2026-11-05 passou em ambos os motores,
confirmado pela saída e JSON do operador:

- `PPKS_GRAPH_PARITY_CASES 18 PASS`
- `PPKS_GRAPH_SEMANTIC_PARITY_PASS`
- 7 registros, 10 skills, 14 claims, 7 fontes sintéticas,
  38 nós e 42 relacionamentos.
- 18 consultas lógicas; 3 leituras cronometradas por consulta e por
  banco (54 medições por motor), precedidas de aquecimento.
- Amostra de 4 hops: HydraDB p50 **5,471 ms** (p95 6,784);
  Neo4j p50 **51,800 ms** (p95 119,564), **n=3 por motor**.
- Arquivo do operador:
  `~/hydradb-lab/benchmarks/ppks-provenance-20261105T221106Z.json`.

A amostra era uma projeção sintética e não representava todas
as fontes específicas de cada claim. Comparações absolutas de
desempenho seguem inconclusivas (protocolos/recursos distintos).

## Objetivo do próximo gate

Validar o contrato dos métodos GraphRAG de busca direta:

1. `findEvidence(requirements, {maxClaimsPerRequirement})` precisa
   identificar **claims** e **todas** as fontes correspondentes a cada uma,
   nunca apenas a primeira. A aplicação deve rejeitar uma claim sem
   todas as fontes registradas.
2. `getSource(sourceId)` deve recuperar uma fonte pública específica
   por sua chave externa textual; uma chave ausente deve retornar vazio.
3. Manter o **escopo correto**: Java profissional do SIGAA não é
   idêntico a Java em projeto de estudo; Flutter na Greencity tem
   escopo misto (engenharia/software), não exclusivamente software.
4. Manter a qualificação da fonte, por *evidence ID*:
   `code_reviewed` aplica-se somente a fontes do tipo código,
   teste ou documentação quando o registro PPKS foi revisado;
   `catalog_only` permanece declaração/catálogo, mesmo em
   registros com outras fontes revisadas.
5. Consultas parametrizadas (`$skill`, `$source`, `$limit`),
   com nomes normalizados **na ingestão**, não por `toLower`
   em Cypher; tolerância explícita a inexistência de Go/fonte.
6. Arestas `SUPPORTED_BY` por claim e fonte. Nunca elevar
   confiança apenas porque há um caminho no grafo.

## Projeção temporária para o teste

Fonte: **dois primeiros itens da stack** de cada um dos mesmos 7
registros públicos do PPKS. Os `evidenceIds` de cada tecnologia
são validados e referenciados individualmente. A amostra atual contém:

| Entidade | Quantidade esperada |
|---|---:|
| Record | 7 |
| Skill | 10 |
| Claim | 14 |
| Source (IDs específicos) | 16 |
| Nós totais | 47 |
| Arestas (HAS_CLAIM, USES_TECHNOLOGY, SUPPORTED_BY) | 60 |
| Casos de leitura | 13 |

Os 16 vértices `Source` são **metadados públicos** extraídos das
referências PPKS; o código não copia conteúdo de README, arquivos
privados, credenciais ou dados acadêmicos. O `source_key` textual
é mantido em uma propriedade; `id` interno é um inteiro aleatório
exclusivo de cada rodada.

A semântica da consulta direta de requisito usa dois passos lógicos:
`Claim -[:USES_TECHNOLOGY]-> Skill` e
`Claim -[:SUPPORTED_BY]-> Source`.
O limite de claims é aplicado antes da recuperação de todas as
fontes, para não eliminar fontes de um mesmo claim.

## Execução no MiniMac

Primeiro, validar o plano **sem escrita nem chamadas HTTP**:

```bash
cd ~/hydradb-lab/phasscode-platform
git pull --ff-only origin experiment/hydradb

python3 -m py_compile \
  scripts/hydradb-neo4j-ppks-evidence-contract.py \
  scripts/hydradb-ppks-contract-selftest.py

python3 scripts/hydradb-ppks-contract-selftest.py
python3 scripts/hydradb-neo4j-ppks-evidence-contract.py
```

Esperado:

```text
PPKS_CONTRACT_OFFLINE_SELFTEST_PASS
PPKS_CONTRACT_OFFLINE_CASES 13
PPKS_CONTRACT_OFFLINE_EDGES 60
PPKS_CONTRACT_COUNTS {"claims": 14, "edges": 60, "records": 7, "skills": 10, "sources": 16, "vertices": 47}
PPKS_CONTRACT_CASES 13
PPKS_CONTRACT_EVIDENCE_EDGE_COUNT 32
PPKS_CONTRACT_DRY_RUN_OK_NO_WRITES
```

Se o dry-run passar, executar apenas nos bancos existentes e saudáveis
do LAB (HydraDB /readyz 200; Neo4j-compare healthy):

```bash
python3 scripts/hydradb-neo4j-ppks-evidence-contract.py --live
```

Esperado:

```text
PPKS_CONTRACT_BOTH_ENGINES_READY
PPKS_CONTRACT_NEO4J_VERTICES 47
PPKS_CONTRACT_WRITES_PER_ENGINE 60
PPKS_CONTRACT_PARITY_CASES 13 PASS
PPKS_CONTRACT_REPORT ...
PPKS_CONTRACT_PARITY_PASS
```

Novo relatório em
`~/hydradb-lab/benchmarks/ppks-contract-*.json`, permissão 0600.
Os tempos medidos são *round-trips* HTTP locais; a prova principal
é **paridade de resultados exatos**, não vantagem de latência.
Não executar repetidamente se o primeiro caso falhar:
reportar o caso, a classe do erro e eventual HTTP status.

## Limitações e condições para avançar

O terceiro script não usa os mesmos documentos acadêmicos nem
transfere todo o schema `OrbeEvidence`; ele prova um **contrato
adaptado**, não o funcionamento integral do adapter Orbe.
Não há LLM, orçamento, endpoint de chat ou integração em DEV/MAIN.
A rotina de escrita Neo4j utiliza `MATCH` dos endpoints antes de
`MERGE` para evitar criação de vértices duplicados. A escrita HydraDB
usa `MERGE` por identidade numérica. Escritas têm protocolos diferentes
e sua velocidade **não é comparável diretamente**.

Após 13/13 casos positivos, a próxima decisão será implementar um
adapter HydraDB **separado e gated** para um Orbe de avaliação no LAB,
retendo o fallback canônico PPKS e testes de respostas de recrutadores.
Nenhum incremento deve ser promovido automaticamente.


## Incidente do autoteste offline e correção de fidelidade (2026-11-05)

A execução original compartilhada pelo operador apresentou:

```text
PPKS_CONTRACT_SELFTEST_FAILED AssertionError
PPKS_CONTRACT_PARITY_CASES 13 PASS
PPKS_CONTRACT_PARITY_PASS
```

Isso significa que os dois bancos devolveram os mesmos dados, **mas um
invariante offline do PPKS falhou**. Não confundir *paridade entre bancos*
com *fidelidade em relação à fonte canônica*.

**Causa:** o auxiliar `load_public_records()` em
`scripts/hydradb-neo4j-ppks-provenance-benchmark.py` atribuía
`professional` a qualquer registro de `experiences`, sem considerar
`areas`. O vínculo `experiencia-greencity`, no entanto, contém
`software-development` **e** `engineering`: conforme a projeção
canônica `ppks-evidence-graph.ts`, deve receber `mixed_role`.
O `experiencia-sig` contém desenvolvimento de software e mantém
`professional`. A assertiva de escopo Flutter no autoteste estava
**correta**; corrigimos o projetor, não a expectativa.

Aplicadas duas salvaguardas na branch experimental:
- O auxiliar agora determina `mixed_role` quando um vínculo tem
  `engineering`, preservando `professional` para vínculo apenas de
  desenvolvimento.
- O teste de contrato verifica **independentemente** os registros PPKS
  para detectar `PPKS_SCOPE_PROJECTION_DRIFT` antes de permitir escrita
  em qualquer banco LAB.
- As asserções offline foram nomeadas para que a próxima falha
  identifique o invariante específico, e não apenas `AssertionError`.

O relatório anterior `ppks-contract-20261105T222456Z.json` permanece
evidência de **paridade HTTP** com o escopo incorreto. Ele **não**
deve ser usado como prova definitiva de fidelidade de escopos.
Nova execução completa é necessária após o ajuste.

### Revalidação após correção

```bash
cd ~/hydradb-lab/phasscode-platform
git pull --ff-only origin experiment/hydradb
python3 -m py_compile \
  scripts/hydradb-neo4j-ppks-provenance-benchmark.py \
  scripts/hydradb-neo4j-ppks-evidence-contract.py \
  scripts/hydradb-ppks-contract-selftest.py

python3 scripts/hydradb-ppks-contract-selftest.py &&
python3 scripts/hydradb-neo4j-ppks-evidence-contract.py &&
python3 scripts/hydradb-neo4j-ppks-evidence-contract.py --live
```

O encadeamento com `&&` impede a execução com escrita caso o
autoteste offline ou o dry-run falhe. Os dois serviços de banco
precisam continuar prontos, mas não exigem reinício. Os novos IDs
aleatórios isolam os dados da rodada corrigida. Não usar
`docker compose down -v` nem `--remove-orphans`.

Critério de aceite **dos dois aspectos**, sem exceções:
`PPKS_CONTRACT_OFFLINE_SELFTEST_PASS` e
`PPKS_CONTRACT_PARITY_CASES 13 PASS` na mesma revisão de código.


## Incidente de contaminação entre rodadas (2026-11-05)

Na revalidação posterior à correção de `mixed_role`, o operador
comprovou:

```text
PPKS_CONTRACT_OFFLINE_SELFTEST_PASS
PPKS_CONTRACT_DRY_RUN_OK_NO_WRITES
PPKS_CONTRACT_NEO4J_VERTICES 47
PPKS_CONTRACT_WRITES_PER_ENGINE 60
PPKS_CONTRACT_CASE_FAILED find_evidence Java hydradb ValueError CONTRACT_ROW_MISMATCH_GOT_12_EXPECTED_6
```

**Gate de execução real ainda bloqueado.** A falha não prova que o
HydraDB duplicou linhas dentro do mesmo grafo lógico. A causa foi
encontrada no script: o mesmo banco experimental persiste as rodadas
anteriores, com novos IDs numéricos por execução, enquanto
`find_evidence` selecionava **todos** os nós `Skill` cuja propriedade
`normalized_name` era igual a `java`. Assim os IDs numéricos
impediam colisões em escritas, **mas não isolavam leituras**.
O resultado 12/6 é consistente com duas cópias da amostra no banco.

### Correção de isolamento lógico

As duas implementações de teste recebem `lab_run` em **todos os
47 vértices** de uma rodada. O valor é um identificador aleatório
decimal exclusivo daquela projeção (não é credencial). O `lab_run`
é exigido via parâmetro `$run` em **todas as 13 consultas**:
`find_evidence`, `bounded_claims` e `get_source`.

As consultas recuperam exclusivamente as claims e fontes ligadas à
amostra com aquele marcador, mesmo que os bancos preservem
outras rodadas. Os registros e links PPKS continuam os mesmos.
`validate_run_isolation()` roda antes de qualquer escrita e falha
fechado quando detectar um vértice não marcado ou consulta sem
filtro/valor correspondente; o autoteste offline também verifica
o mesmo requisito e diferentes marcadores por plano.

Nenhum volume deve ser apagado. Não executar `--remove-orphans`,
`down -v`, `deploy.sh` ou comandos no Neo4j de DEV.

### Revalidação

```bash
(
  set -euo pipefail
  cd ~/hydradb-lab/phasscode-platform
  git pull --ff-only origin experiment/hydradb

  python3 -m py_compile \
    scripts/hydradb-neo4j-ppks-provenance-benchmark.py \
    scripts/hydradb-neo4j-ppks-evidence-contract.py \
    scripts/hydradb-ppks-contract-selftest.py

  python3 scripts/hydradb-ppks-contract-selftest.py
  python3 scripts/hydradb-neo4j-ppks-evidence-contract.py
  python3 scripts/hydradb-neo4j-ppks-evidence-contract.py --live
)
```

Critérios: `PPKS_CONTRACT_OFFLINE_SELFTEST_PASS`,
`PPKS_CONTRACT_DRY_RUN_OK_NO_WRITES`,
`PPKS_CONTRACT_PARITY_CASES 13 PASS` e
`PPKS_CONTRACT_PARITY_PASS` na mesma revisão e rodada.
Após isso, **repetir o `--live`** para confirmar que leituras
de uma nova execução não incorporam dados da anterior; cada execução
gera IDs numéricos novos e um `lab_run` distinto.
A conclusão de compatibilidade funcional segue limitada à
projeção sintética de 7 registros públicos, não ao GraphRAG real.


## Terceiro gate — homologação com duas rodadas isoladas

O operador executou, na revisão `bfda98d`, o autoteste offline,
o dry-run e **duas execuções reais consecutivas** do terceiro contrato
de evidências. Ambas passaram, sem excluir dados antigos:

```text
PPKS_CONTRACT_OFFLINE_SELFTEST_PASS
PPKS_CONTRACT_DRY_RUN_OK_NO_WRITES

=== RODADA 1 ===
PPKS_CONTRACT_BOTH_ENGINES_READY
PPKS_CONTRACT_NEO4J_VERTICES 47
PPKS_CONTRACT_WRITES_PER_ENGINE 60
PPKS_CONTRACT_PARITY_CASES 13 PASS
PPKS_CONTRACT_PARITY_PASS

=== RODADA 2 ===
PPKS_CONTRACT_BOTH_ENGINES_READY
PPKS_CONTRACT_NEO4J_VERTICES 47
PPKS_CONTRACT_WRITES_PER_ENGINE 60
PPKS_CONTRACT_PARITY_CASES 13 PASS
PPKS_CONTRACT_PARITY_PASS
```

Relatórios criados no MiniMac (conteúdo dos novos JSONs não foi
examinado nesta atualização):

- `~/hydradb-lab/benchmarks/ppks-contract-20261105T225133Z.json`
- `~/hydradb-lab/benchmarks/ppks-contract-20261105T225141Z.json`

**Gate 3 — APROVADO:** offline + 13/13 consultas por motor em cada
rodada, sem mistura de evidências de execuções anteriores.
A aceitação refere-se somente aos sete registros públicos e ao
contrato experimental. Não confere compatibilidade integral com
`OrbeEvidence` nem equivalência de desempenho entre motores.

A etapa seguinte é um leitor `shadow` **read-only e fora do
processo do Orbe**, documentado em
[hydradb-ppks-shadow-reader.md](hydradb-ppks-shadow-reader.md).
Ainda não existe qualquer ativação de HydraDB na API de recrutamento.
