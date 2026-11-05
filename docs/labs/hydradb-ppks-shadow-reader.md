# HydraDB LAB — leitor shadow de evidências PPKS (somente leitura)

**Estado:** protótipo de avaliação, desativado por padrão, restrito à
branch `experiment/hydradb`. **Não é o adapter TypeScript do
`EvidenceGraphRepository` do Orbe.** Não expõe rota HTTP, não
consome LLM, não altera a API, não monta volumes DEV/MAIN,
não altera Compose e não escreve em nenhum banco.

## Por que esta etapa existe

O terceiro gate homologou duas rodadas consecutivas do contrato
parametrizado PPKS com **13/13 consultas por motor em cada rodada**,
47 nós / 60 relações por amostra. No entanto, o contrato não era
consultado pelo Orbe. Antes de conectar qualquer componente de IA,
validamos um leitor passivo com duas operações de demonstração:

- `find_evidence(skill, limit)`: retorna claims com **todas** as fontes;
- `get_source(source_key)`: retorna a fonte específica ou `null`.

As operações utilizam metadados públicos de **cinco projetos e duas
experiências** já incluídos nos testes. Não usam a formação acadêmica
privada, os textos originais de documentos nem a base operacional.

## Modos e isolamento

`off` (padrão):
- usa **somente** PPKS local e não consulta HydraDB;
- retorna `status: canonical` e o resultado canônico.

`shadow` (opt-in **na linha de comando**, nunca via ambiente do Orbe):
- exige um relatório anterior `ppks-contract-*.json` com sucesso de
  paridade e o identificador `lab_run`;
- verifica que o relatório está em
  `~/hydradb-lab/benchmarks/`, pertence ao usuário, não é symlink,
  tem permissões privadas e contagens esperadas;
- consulta **somente** o HydraDB local em `127.0.0.1:18443`,
  autenticado pelo token exclusivo de `~/hydradb-lab/secrets`;
- executa Cypher *fixo e parametrizado* com
  `s.normalized_name = $skill AND s.lab_run = $run`
  ou `src.source_key = $source AND src.lab_run = $run`;
- aceita dados do banco apenas se **todas** as linhas e colunas
  corresponderem exatamente ao PPKS (incluindo quantidade, escopo,
  `source_key`, `verification` e `origin`);
- em qualquer erro, divergência, linha extra, fonte ausente ou timeout,
  retorna o PPKS canônico com `status: canonical_fallback`.

O retorno continua baseado no PPKS **mesmo quando verificado pelo
grafo**; `graph_verified` é apenas um sinal de consistência.
Não afirma que o grafo seja a fonte de verdade.
O limite (1–20) é aplicado à contagem de **claims após validação
completa**; nunca trunca as fontes associadas à claim escolhida.

`--require-graph` transforma um fallback em falha de processo (código
de saída não zero), para diagnósticos e gates de homologação. Sem esse
parâmetro o fallback permanece seguro para uso exploratório.

## Execução no MiniMac

```bash
(
  set -euo pipefail
  cd ~/hydradb-lab/phasscode-platform
  git pull --ff-only origin experiment/hydradb

  python3 -m py_compile \
    scripts/hydradb-ppks-shadow-reader.py \
    scripts/hydradb-ppks-shadow-selftest.py

  python3 scripts/hydradb-ppks-shadow-selftest.py

  # Modo canônico: ZERO consultas ao banco.
  python3 scripts/hydradb-ppks-shadow-reader.py --mode off --probe
)
```

Esperado:

```text
SHADOW_OFFLINE_SELFTEST_PASS
SHADOW_CANONICAL_SAFE_FALLBACK_PASS
SHADOW_RUN_SCOPING_PASS
SHADOW_COMPLETE_CLAIM_SOURCES_PASS
...
SHADOW_PROBE_CANONICAL_SAFE
```

Se o autoteste passar, validar o **modo shadow sem escrita**, contra
o último relatório de paridade já aprovado no LAB:

```bash
cd ~/hydradb-lab/phasscode-platform

python3 scripts/hydradb-ppks-shadow-reader.py \
  --mode shadow \
  --report ~/hydradb-lab/benchmarks/ppks-contract-20261105T225141Z.json \
  --probe --require-graph
```

Ele executa 10 leituras de verificação: Java, Flutter, TypeScript,
Node.js, Go (sem resultado esperado) e cinco buscas por fonte,
incluindo `missing-source-key` (também sem resultado).
Todos os `SHADOW_PROBE` devem mostrar `graph_verified`.
Não há queries de escrita ou novas migrações.

Consulta de exemplo, retornando a claim selecionada com **todas**
as suas fontes (em vez de truncar a lista de fontes pelo limite):

```bash
python3 scripts/hydradb-ppks-shadow-reader.py \
  --mode shadow \
  --report ~/hydradb-lab/benchmarks/ppks-contract-20261105T225141Z.json \
  --skill TypeScript --limit 1 --require-graph
```

A saída `SHADOW_EVIDENCE` contém `status`, `reason`, `claims`,
`sourceIds`, `verification`, `origin` e `sourceCount`
referentes **somente às fontes públicas da amostra**.

## Testes de falha sem tocar no banco

O `scripts/hydradb-ppks-shadow-selftest.py` usa respostas simuladas,
sem rede, para validar:

- backend saudável e comparação exata com PPKS;
- escopos `professional`, `mixed_role`, `personal_project`, `study`;
- ausência de experiência em Go e de fonte inexistente;
- limite de uma claim com quatro fontes (nenhuma perdida);
- falta de uma fonte, fonte duplicada e colunas malformadas;
- indisponibilidade simulada e fallback canônico;
- `lab_run` exigido nos parâmetros de cada leitura;
- limite inválido recusado.

**Ainda NÃO estão testados:** queda real da HydraDB no MiniMac,
paralelismo, gestão de versões/snapshots, isolamento entre tenants,
credenciais pela rede Docker da API, payload `OrbeEvidence` completo
e avaliação das respostas dos recrutadores. Nada deve ser integrado
à API até que o leitor shadow e esses gates sejam homologados.

Não rodar `down --volumes`, `--remove-orphans` nem deploy para
ambientes operacionais.
