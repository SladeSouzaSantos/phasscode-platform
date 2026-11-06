# Gate 7 — replay determinístico de perguntas de recrutadores

**Escopo:** branch `experiment/hydradb`, MiniMac LAB isolado.
Sem alterações em DEV, MAIN, Compose, API do Orbe, chat,
LLM, bases privadas ou flags GraphRAG.

## Dependências já homologadas

Gate 3: 13/13 contratos PPKS em duas rodadas.
Gate 4: 10/10 consultas Python shadow.
Gate 5: TypeScript typecheck e Vitest 7/7.
Gate 6: TypeScript HTTP HydraDB 10/10; typecheck, Vitest 7/7 e
10 probes OFF sem rede após correção do UID.

## Objetivo

Verificar se **perguntas típicas de recrutadores** são atendidas
com um pacote **estruturado de claims e fontes públicas rastreáveis**,
preservando escopo e confiança; impedir evidências inventadas
para Go/Django e não promover projeto de estudo a emprego.

Este é um **replay determinístico**, NÃO avaliação de respostas
redigidas por uma LLM nem classificação automática da pergunta.
Cada pergunta tem requisitos conhecidos e revisados manualmente.
O teste **não garante ausência de alucinação em texto gerado**.

Arquivo: `scripts/hydradb-lab-recruiter-eval.ts`.
Reutiliza o leitor `EvidenceGraphRepository` do Gate 5 e as
funções públicas de fixture, autenticação e validação do Gate 6.
Importar as funções do Gate 6 agora **não inicia automaticamente**
a execução CLI, por meio de um guard explícito de `import.meta.url`.

### Casos cobertos

O script possui 12 cenários e 16 verificações de requisitos:
Java profissional vs estudo, Flutter misto, Node.js com fontes
de código e catálogo, TypeScript em dois projetos, Go ausente,
Java+Go combinado, React, Spring Boot apenas projeto de estudo,
Python/FastAPI no HSP, Django ausente, TypeScript limitado a
**uma claim sem perder quatro fontes**, e Java+Flutter+Go.

Inclui ainda 5 buscas por fonte (catálogo, código, testes, fonte
de experiência profissional e fonte inexistente).

- Escopos `professional`, `mixed_role`, `personal_project`,
  `study` e `unknown` são comparados com o PPKS público.
- **Java/SIGAA** deve ser profissional; **Java/Spring Boot** no
  projeto webservice é estudo, sem alegar emprego Spring Boot.
- **Flutter/Greencity** tem escopo `mixed_role`, não
  exclusivamente desenvolvimento de software.
- Go e Django devem ter **zero claims e zero fontes**, sem
  converter experiência em outras linguagens numa claim falsa.
- Todas as claims têm `sourceIds` conhecidos e fontes públicas
  completas; nenhuma claim pode ser sustentada apenas por um
  relacionamento entre skills.
- React, Spring Boot, Python, FastAPI e Django estão fora do
  conjunto de cinco tecnologias verificáveis pelo protótipo
  HydraDB. Elas continuam cobertas pelo PPKS, com
  `canonical_fallback` intencional em `shadow`.
- A resposta do adapter nunca substitui a fonte canônica:
  *graph_verified* significa que o grafo devolveu os metadados
  esperados, não que o banco é a fonte de verdade.

## Execução Gate 7 OFF, sem rede

Com `node_modules` instalado anteriormente **somente no clone LAB**:

```bash
(
  set -euo pipefail
  cd ~/hydradb-lab/phasscode-platform
  git pull --ff-only origin experiment/hydradb

  docker run --rm \
    --network none \
    --user "$(id -u):$(id -g)" \
    -e HOME=/tmp \
    -v "$PWD:/workspace" \
    -w /workspace \
    node:24 \
    sh -ec '
      npm run typecheck
      ./node_modules/.bin/vitest run \
        tests/hydradb-lab-evidence-adapter.test.ts
      node --import tsx scripts/hydradb-lab-recruiter-eval.ts --mode off
    '
)
```

Esperado: `RECRUITER_EVIDENCE_REPLAY_PASS`,
`RECRUITER_EVIDENCE_SOURCE_CHECKS 5 PASS` e
`RECRUITER_EVIDENCE_GATE7_PASS`.
Nenhum token ou relatório é lido neste modo.

## Execução Gate 7 SHADOW, HTTP real e somente leitura

```bash
(
  set -euo pipefail
  cd ~/hydradb-lab/phasscode-platform
  docker run --rm \
    --network host \
    --user "$(id -u):$(id -g)" \
    --cap-drop ALL \
    --security-opt no-new-privileges \
    --pids-limit 96 --memory 384m --cpus 0.75 \
    -e HOME=/tmp \
    -v "$PWD:/workspace:ro" \
    -v "$HOME/hydradb-lab/benchmarks:/lab-reports:ro" \
    -v "$HOME/hydradb-lab/secrets/hydradb_auth_token:/run/secrets/hydradb_auth_token:ro" \
    -w /workspace \
    node:24 \
    node --import tsx scripts/hydradb-lab-recruiter-eval.ts \
      --mode shadow \
      --report /lab-reports/ppks-contract-20261105T225141Z.json \
      --token-file /run/secrets/hydradb_auth_token \
      --require-graph
)
```

Esperado: `RECRUITER_EVIDENCE_GATE7_PASS`.
Para as skills efetivamente suportadas, cada leitura precisa
retornar `graph_verified`; as tecnologias fora do fixture
são `canonical_fallback` deliberado. Fontes são verificadas
por identidade, escopo e `verificationStatus`.

## Simular indisponibilidade sem parar o banco

A falha `outage` é injetada **no transporte do processo de teste**;
o HydraDB permanece saudável. Reutilize o comando SHADOW acima,
substituindo `--require-graph` por `--simulate outage`.
Todas as respostas estruturadas devem continuar iguais ao PPKS,
e o teste precisa finalizar em `RECRUITER_EVIDENCE_GATE7_PASS`
com `canonical_fallback` nas consultas suportadas.

Existem também `--simulate missing-source` e
`--simulate extra-row`, que manipulam apenas a **resposta lida
em memória** para provar detecção de evidências incompletas ou
duplicadas. Nenhuma dessas simulações grava no banco, reinicia
contêiner, apaga volumes ou altera DEV/MAIN.

## Gates e limitações

O Gate 7 somente estará homologado após:
1. `typecheck`, Vitest e replay OFF aprovados no MiniMac;
2. replay SHADOW real, com verificação integral das skills
   suportadas pelo fixture;
3. fallback simulado sem variação do resultado canônico;
4. inspeção dos casos negativos e de escopo.

Os resultados não medem compreensão da linguagem natural,
recall em todo PPKS, latência concorrente, recuperabilidade
de uma falha física no processo do HydraDB nem geração
de texto natural. Testes de LLM e perguntas realmente
abertas ainda dependem de um Gate 8 separado e autorização
de integração em ambiente de avaliação.


## Homologação no MiniMac — Gate 7 aprovado

**Evidência:** saída da execução local fornecida pelo operador após fast-forward `6d519f4..9737fa1` na branch `experiment/hydradb`. O teste terminou com `=== GATE 7: TODAS AS ETAPAS APROVADAS ===`; nenhuma alteração de runtime, DEV ou MAIN foi executada por este procedimento.

| Prova | Resultado observado |
| --- | --- |
| `npm run typecheck` | PASS (`tsc --noEmit`) |
| Vitest do adapter | 7/7 PASS |
| OFF, sem rede | 12 cenários / 16 requisitos; 0 verificados, 0 fallback, 16 canônicos; 5/5 fontes; PASS |
| SHADOW HTTP real | 12 cenários / 16 requisitos; 11 `graph_verified`, 5 `canonical_fallback` intencionais; 5/5 fontes; PASS |
| Falha de transporte injetada (`outage`) | 0 verificados, 16 fallbacks; 5/5 fontes; PASS |
| Resposta manipulada (`missing-source`) | 3 verificados, 13 fallbacks; 5/5 fontes; PASS |
| Resposta manipulada (`extra-row`) | 3 verificados, 13 fallbacks; 5/5 fontes; PASS |

As três verificações mantidas em `graph_verified` nos cenários `missing-source` e `extra-row` são consultas vazias de **Go** (não havia linha a remover ou duplicar). Esse resultado está alinhado ao contrato do protótipo; **não** prova detecção de corrupção em resultados originalmente vazios. O cenário `outage` apenas injeta falha no transporte do processo de teste, sem derrubar fisicamente o HydraDB.

O replay demonstrou a preservação de `scope`, `verificationStatus`, fontes públicas e do retorno canônico. **Gate 7 homologado no escopo do LAB.** A evidência não equivale a compreensão de linguagem natural, avaliação da prosa gerada, cobertura do PPKS completo, teste de concorrência ou adoção do HydraDB na aplicação.

**Próxima trilha:** desenho de Gate 8 em [hydradb-ppks-semantic-gate8.md](hydradb-ppks-semantic-gate8.md). Nenhum aumento de escopo operacional é autorizado por esta homologação.
