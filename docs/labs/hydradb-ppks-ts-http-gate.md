# Gate 6 — TypeScript shadow sobre HTTP real, HydraDB LAB

## Situação inicial

O **Gate 5** foi homologado pelo operador no MiniMac:

```text
> phasscode-platform@0.1.0 typecheck
> tsc --noEmit

✓ tests/hydradb-lab-evidence-adapter.test.ts (7 tests)
Test Files 1 passed (1)
Tests 7 passed (7)
```

Isso confirma tipagem e mocks, mas **não** a execução HTTP real do
adapter TypeScript.

## Implementação do Gate 6

O arquivo `scripts/hydradb-lab-ts-live-check.ts` executa o adapter
já aprovado com `createHydraLabReadTransport` contra o serviço HydraDB
do **mesmo laboratório** no `127.0.0.1:18443`.

O executor **não importa `ppks-evidence-graph.ts`**, pois a projeção
completa inclui fontes acadêmicas privadas. Em vez disso, monta
diretamente um `EvidenceGraphRepository` canônico de forma separada
usando **apenas sete registros públicos explicitamente permitidos**
(5 projetos e 2 experiências), selecionando somente os dois primeiros
itens da stack, idênticos ao fixture de benchmark.

Validadores fail-closed:
- checkout na branch `experiment/hydradb`, com .env privado,
  Compose project `phasscode-hydradb-lab`, porta 13003 e
  `ORBE_GRAPHRAG_MODE=off`;
- PPKS exato: 7 registros, 10 competências, 14 claims, 16 fontes
  específicas, 47 nós, 60 arestas; `mixed_role` Greencity e
  `professional` SIGAA;
- relatório `ppks-contract-*.json` privado (UID/0600) numa pasta
  de benchmarks permitida, com `parity: PASS`, contagens e
  `lab_run` decimal;
- token HydraDB carregado apenas de arquivo privado (UID/0600),
  nunca do código, Git ou variável de ambiente;
- duas consultas Cypher fixas e parametrizadas, `$run`
  obrigatório, com timeout HTTP e somente namespace `lab`;
- o modo OFF não recebe token/relatório e executa **sem rede**;
- em SHADOW, exige que as 10 leituras verifiquem exatamente
  a resposta canônica (incluindo zero resultados de Go e fonte
  inexistente); com `--require-graph`, qualquer fallback
  reprova o gate.

Não há comandos `MERGE`, `CREATE`, `SET` ou `DELETE` no executor
nem no adapter, rota Fastify, escrita, LLM, acesso a DEV/MAIN,
mutações do `docker compose` ou alteração de flags.

### 1. Atualizar, conferir TypeScript e executar OFF sem rede

No MiniMac, **somente no checkout LAB**:

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
      ./node_modules/.bin/vitest run tests/hydradb-lab-evidence-adapter.test.ts
      node --import tsx scripts/hydradb-lab-ts-live-check.ts --mode off
    '
)
```

As dependências devem estar em `node_modules` do **próprio LAB**
(instaladas pelo Gate 5); não montar pastas DEV/MAIN. A primeira
execução não tem rede e não lê token nem relatório.

Critério de aprovação inicial:

```text
Test Files 1 passed (1)
Tests 7 passed (7)
TS_SHADOW_PROBE skill Java canonical CLAIMS 2 SOURCES 6
...
TS_SHADOW_OFF_CANONICAL_PASS
```

### 2. Teste SHADOW HTTP, somente leitura

Para o Docker em Linux, `--network host` permite que o processo
Node dentro do contêiner alcance o endereço **loopback local**
`127.0.0.1:18443` do HydraDB. É proposital: o endpoint não é
publicado na rede externa e o executor usa URL fixa. O contêiner
recebe somente o checkout LAB em read-only, relatórios LAB em
read-only e **um arquivo de token** montado em read-only.

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
    node --import tsx scripts/hydradb-lab-ts-live-check.ts \
      --mode shadow \
      --report /lab-reports/ppks-contract-20261105T225141Z.json \
      --token-file /run/secrets/hydradb_auth_token \
      --require-graph
)
```

Critério de aceite:
- 5 buscas por competência: Java, Flutter, TypeScript, Node.js, Go;
- 5 buscas de fonte específica, incluindo fonte inexistente;
- os 10 status são `graph_verified`, sem `canonical_fallback`;
- `TS_SHADOW_HTTP_ALL_VERIFIED`;
- nenhum token, URL privado ou conteúdo de fontes privadas nos logs.

Um resultado `TS_SHADOW_GATE_FAILED ...` deve ser enviado sem logs
brutos do Docker ou impressão de variáveis de ambiente. Se o status
mostrar fallback, não force o resultado; analise a divergência e
corrija o script na branch experimental. Não exclua volumes.

## Restrições remanescentes

Este é um teste de **integração HTTP e equivalência de metadados
públicos sintéticos**, não uma migração do GraphRAG completo.
O adapter retorna o conteúdo canônico do PPKS tanto com sucesso quanto
com falha do grafo; o HydraDB atua em shadow somente.

Para um futuro Gate 7, ainda faltam (a) replay automatizado
de perguntas de recrutadores, (b) verificação de ausência de alucinações
em respostas, (c) recuperação real após queda e (d) decisão explícita
sobre integração em serviço próprio no LAB. DEV e MAIN seguem intactos.


## Primeira execução do Gate 6 — HTTP confirmado; TypeScript corrigido e pendente de reteste

O operador executou os dois comandos documentados no MiniMac, no
checkout `experiment/hydradb` atualizado até `be88147`.

**Primeiro comando:** o `npm run typecheck` encontrou dois erros
`TS2722` em `scripts/hydradb-lab-ts-live-check.ts`, linhas
279 e 306, pois o tipo de `process.getuid` é opcional no Node.
Como o shell estava em `set -euo pipefail`, o Vitest e o modo OFF
não foram executados nessa tentativa.

**Segundo comando:** a integração TypeScript → HydraDB real em
modo `shadow --require-graph` passou:

```text
TS_SHADOW_PROBE skill Java graph_verified CLAIMS 2 SOURCES 6
TS_SHADOW_PROBE skill Flutter graph_verified CLAIMS 2 SOURCES 2
TS_SHADOW_PROBE skill TypeScript graph_verified CLAIMS 2 SOURCES 7
TS_SHADOW_PROBE skill Node.js graph_verified CLAIMS 1 SOURCES 4
TS_SHADOW_PROBE skill Go graph_verified CLAIMS 0 SOURCES 0
TS_SHADOW_PROBE source phasscode-platform--ports graph_verified RESULTS 1
TS_SHADOW_PROBE source phasscode-platform--catalog graph_verified RESULTS 1
TS_SHADOW_PROBE source experiencia-sig--catalog graph_verified RESULTS 1
TS_SHADOW_PROBE source web-portfolio-v2--tests graph_verified RESULTS 1
TS_SHADOW_PROBE source missing-source-key graph_verified RESULTS 0
TS_SHADOW_HTTP_CANONICAL_SAFE
TS_SHADOW_HTTP_ALL_VERIFIED
```

Isso comprova leitura HTTP real em 10/10 consultas públicas, mas
**não encerra a homologação completa** enquanto `typecheck` e
modo OFF não forem aprovados na mesma revisão.

**Correção:** commit `34a7d39` aplica
`process.getuid?.()`, verifica explicitamente se o runtime suporta
UID Unix e rejeita (fail-closed) a falta desse recurso antes de
conferir dono e permissões de token e relatório. Ambas as verificações
de proprietário `stat.uid` continuam obrigatórias.

### Reteste focado após correção

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
      node --import tsx scripts/hydradb-lab-ts-live-check.ts --mode off
    '
)
```

**Critérios faltantes:** `tsc --noEmit` sem erro, 7/7 testes
Vitest e `TS_SHADOW_OFF_CANONICAL_PASS`. A integração HTTP já
foi aprovada com o script anterior; após o reteste de tipagem,
repetir a leitura SHADOW é uma verificação adicional recomendada,
mas sem mudanças de consultas ou credenciais.


## Gate 6 — homologação concluída após correção TS2722

Após atualização para `6d519f4`, o operador executou novamente
o `node:24` em ambiente Docker sem rede:

```text
> phasscode-platform@0.1.0 typecheck
> tsc --noEmit

✓ tests/hydradb-lab-evidence-adapter.test.ts (7 tests)
Test Files 1 passed (1)
Tests 7 passed (7)
...
TS_SHADOW_PROBE skill Java canonical CLAIMS 2 SOURCES 6
TS_SHADOW_PROBE skill Flutter canonical CLAIMS 2 SOURCES 2
TS_SHADOW_PROBE skill TypeScript canonical CLAIMS 2 SOURCES 7
TS_SHADOW_PROBE skill Node.js canonical CLAIMS 1 SOURCES 4
TS_SHADOW_PROBE skill Go canonical CLAIMS 0 SOURCES 0
TS_SHADOW_OFF_CANONICAL_PASS
```

Em execução anterior do mesmo Gate 6, o modo SHADOW TypeScript
verificou com sucesso **10/10 leituras HTTP reais** no HydraDB
LAB (`TS_SHADOW_HTTP_ALL_VERIFIED`), incluindo consultas negativas
de Go e fonte inexistente.

**GATE 6: HOMOLOGADO**, somando typecheck, sete testes com mocks,
modo OFF sem rede e consultas SHADOW com dados reais do LAB.
A correção `process.getuid?.()` não modificou a query nem o
transporte HTTP. O gate continua limitado ao corpus público
sintético e não comprova integração ao chat ou respostas LLM.

Próximo passo:
[Gate 7 — replay de evidências de recrutadores](hydradb-ppks-recruiter-eval.md).
