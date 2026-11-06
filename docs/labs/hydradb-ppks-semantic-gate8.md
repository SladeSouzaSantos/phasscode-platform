# Gate 8 — avaliação de recuperação semântica e respostas fundamentadas (proposta)

**Estado:** Fase A / preflight aprovado no MiniMac; início da Fase B implementado no LAB, **ainda não executado nem homologado**.  
**Dependência:** Gate 7 aprovado no MiniMac; ver [registro](hydradb-ppks-recruiter-eval.md).  
**Escopo permitido:** clone `~/hydradb-lab/phasscode-platform`, branch `experiment/hydradb`, somente dados públicos/sintéticos, sem integração à API, chat, Graph Reader, Neo4j operacional, `dev` ou `main`.

## Pergunta experimental

O HydraDB (como verificador de evidências PPKS em SHADOW), aliado à recuperação lexical/semântica já disponível no Orbe, **melhora de forma mensurável** a localização e a fundamentação de evidências para perguntas de recrutadores, em comparação ao PPKS canônico, **sem alterar o conteúdo factual autorizado**?

Não confundir três hipóteses distintas:
1. **Interpretação da pergunta**: extrair corretamente tecnologias, modalidade (profissional/estudo), negações, intenção e limites da pergunta.
2. **Recuperação e proveniência**: selecionar claims/escopos/fontes relevantes, com zero atribuição falsa.
3. **Geração de resposta** (teste separado, opcional): formular prosa útil com base no mesmo pacote de evidências. Uma resposta melhor não comprova vantagem do banco de dados se modelo/prompt/contexto mudarem.

## Fase A — corpus congelado e gold independente

Preparar corpus versionado `knowledge/evaluations/hydradb-gate8-recruiter.json` **sem dados privados**, composto por perguntas reais anonimizadas autorizadas ou perguntas adversariais sintéticas, **sempre identificando a origem**. Não rotular perguntas sintéticas como uso real.

Cada caso terá `id`, `question`, `origin`, `expectedRequirements` (conceito, polaridade, escopo profissional/estudo, obrigatoriedade), `expectedClaimIds`, `expectedSourceIds`, `forbiddenClaims` e `notes`. Gold deve ser revisado **antes** de rodar o sistema, sem usar saída do próprio modelo como verdade-terreno. Candidatos ausentes do fixture devem ser explicitamente `not_in_lab_fixture`, não `candidate_lacks_skill`.

Cobertura mínima planejada: paráfrases Java/SIGAA, diferença Spring Boot estudo/emprego, Flutter/Greencity `mixed_role`, Node.js e TypeScript em projetos e fontes múltiplas, Python/FastAPI/HSP, React, perguntas compostas com requisitos obrigatórios, tecnologias ausentes (Go/Django), negações, sinônimos e termos ambíguos; incluir controles de fontes ausentes e truncamento. Não promover relações entre skills a experiência profissional.

## Fase B — avaliação sem LLM e sem HydraDB obrigatório

Implementar script **isolado** que:
- carrega exclusivamente o corpus congelado e os sete PPKS públicos do LAB, com validação de esquema, versão e hash;
- recebe requisitos explicitamente anotados para medir recuperação, **sem fingir que está classificando linguagem natural**;
- executa PPKS canônico (baseline), adapter OFF e adapter SHADOW do LAB (quando HydraDB disponível e Gate 7 preservado);
- compara de maneira independente conjuntos de claims, `sourceIds`, `scope`, `verificationStatus`, identidade de fontes, cobertura e abstenções;
- publica relatório JSON sanitizado sem prompts privados, tokens, respostas de produção nem identificadores de visitantes;
- verifica invariantes de fallback e integra testes offline determinísticos com casos negativos.

**Métricas:** precisão/recall por claim e requirement, cobertura integral de `sourceIds`, taxa de abstenção correta, falsa experiência profissional (alvo zero), discrepância de escopo/nível de verificação (alvo zero), fallback por motivo, p50/p95 de execução em cenário de hardware documentado quando houver amostra suficiente. Nenhum p99 com poucas amostras e nenhuma comparação de performance entre processos/modelos não equivalentes.

A paridade do Gate 7 é pré-condição e não conta, por si só, como ganho de recuperação. Se o fixture só permite resultados idênticos, registrar **ganho incremental não demonstrado**.

## Fase C — interpretação de linguagem natural (depois do gold)

Comparar, no **mesmo corpus**:
- parser/normalizador atual com regras e léxico;
- camada semântica local já disponível, quando realmente aplicável;
- alternativa experimental, somente se custo e utilidade justificarem, mantendo versão, contexto e orçamento constantes.

Medir acerto exato por conjunto de requisitos, precisão/recall por tecnologia, escopo, negação, OOV e generalização em paráfrases **separadas** do desenvolvimento. A presença de um embedding/LLM não é prova de melhor classificação.

## Fase D — qualidade de resposta (opcional, autorização separada)

Somente após B/C, e caso exista justificativa de produto, avaliar respostas de recrutador em ambiente de avaliação: mesmo modelo, versão, temperatura, prompt, evidência, budget e hardware. Julgamento humano cego em fidelidade factual, utilidade, comunicação de limites e ausência de afirmações sem suporte. Reportar tokens, latência fim a fim e taxa de fallback. **Não executar na API DEV ou MAIN nesta fase.**

## Critérios de aprovação e rollback

1. Typecheck, testes, integridade do gold e replay OFF aprovados.
2. Com SHADOW, nenhuma alteração no resultado canônico, no escopo, na identidade das fontes ou em `verificationStatus`.
3. Nenhuma claim afirmando Go/Django/experiência profissional inexistente; nenhum preenchimento inventado para tecnologias fora do fixture.
4. Resultados quantitativos reproduzíveis, com falhas visíveis; amostras e limitações declaradas.
5. Queda, indisponibilidade ou divergência da projeção HydraDB levam ao PPKS canônico. A avaliação permanece somente no LAB e pode ser desativada removendo o processo de teste, sem tocar nos volumes operacionais.

**Gate 8 só estará concluído após execução local e revisão dos resultados.** Se a recuperação canônica e o verificador do grafo produzirem o mesmo pacote, classificar como paridade validada, **não** ganho semântico. Não há autorização implícita para adicionar ONNX sidecar, novas chamadas LLM, realizar merge, deploy ou trocar o Neo4j.


## Primeira implementação: preflight do corpus sintético

A preparação inicial de Fase A foi adicionada **sem classificador nem chamadas HTTP**:

- `knowledge/evaluations/hydradb-gate8-recruiter.json`: 20 perguntas **sintéticas**, 10 tecnologias, com anotação de requisitos esperados e sete etiquetas de risco. A anotação está marcada `draft_requires_independent_review` e precisa de revisão humana antes de representar gold validado.
- `scripts/hydradb-lab-gate8-corpus-check.ts`: validador offline que comprova estrutura, cobertura, unicidade e **consistência com os sete registros PPKS públicos canônicos**; não interpreta linguagem natural nem consulta HydraDB.

### Execução local do preflight (aprovada pelo operador no MiniMac)

```bash
(
  set -euo pipefail
  cd ~/hydradb-lab/phasscode-platform
  test "$(git branch --show-current)" = "experiment/hydradb"
  git pull --ff-only origin experiment/hydradb
  docker run --rm --network none \\
    --user "$(id -u):$(id -g)" -e HOME=/tmp \\
    -v "$PWD:/workspace" -w /workspace node:24 sh -ec '
      npm run typecheck
      ./node_modules/.bin/vitest run tests/hydradb-lab-evidence-adapter.test.ts
      node --import tsx scripts/hydradb-lab-gate8-corpus-check.ts
    '
)
```

Marcadores esperados: `GATE8_CORPUS_CANONICAL_FIXTURE_PARITY_PASS`, `GATE8_CORPUS_DRAFT_CHECK_PASS` e `GATE8_INDEPENDENT_GOLD_REVIEW_REQUIRED`. **Um PASS do preflight não aprova o gold, não mede precisão de interpretação, não faz leitura real no HydraDB e não conclui Gate 8.**


## Checkpoint: início da Fase B — avaliação quantitativa do referencial provisório

**Resultado do MiniMac informado pelo operador:** fast-forward \`9737fa1..415fee2\` bem-sucedido; \`tsc --noEmit\` PASS; Vitest 7/7; \`GATE8_CORPUS_DRAFT_CASES 20 SKILLS 10 RISK_TAGS 7\`, \`GATE8_CORPUS_CANONICAL_FIXTURE_PARITY_PASS\`, \`GATE8_CORPUS_DRAFT_CHECK_PASS\`. A indicação \`GATE8_INDEPENDENT_GOLD_REVIEW_REQUIRED\` permanece intencional.

Foi acrescentada uma fotografia explícita da proveniência \`knownSourceEvidence\` no JSON (11 associações tecnologia→registro, 16 fontes públicas distintas), derivada dos mesmos sete PPKS públicos; o checker exige agora correspondência de cada fonte, vínculo \`claim→source\`, origem \`github/ppks_catalog\` e \`verificationStatus\`. Esta referência **não** foi validada por avaliador independente.

Arquivos de Fase B publicados (ainda não executados no MiniMac):

- \`scripts/hydradb-lab-gate8-score.ts\`: métrica pura de concordância com o draft (claims, fontes, vínculos, escopo, distinção profissional/estudo e abstenção), incluindo detecção de duplicações;
- \`tests/hydradb-lab-gate8-score.test.ts\`: testes unitários de precisão referencial, promoção indevida de escopo, inflação de nível de verificação, fontes/vínculos ausentes, links duplicados, abstenção correta e atribuição falsa;
- \`scripts/hydradb-lab-gate8-evaluate.ts\`: executa 20 perguntas **como rótulos de requisitos fornecidos manualmente**, sem extrair termos automaticamente da prosa; compara PPKS canônico e adapter OFF/SHADOW. Emite JSON sanitizado, identificado como \`draft_public_fixture_agreement_only\`, com SHA-256 do corpus, métricas e motivos de fallback, **sem registrar as perguntas**.

**Atenção:** \`draftClaimPrecision\` e \`draftClaimRecall\` medem acordo com anotações do mesmo fixture público, **não** precisão semântica independente; a arquitetura SHADOW sempre devolve o canônico. Mesmo uma pontuação de 1.0 **não demonstra benefício de HydraDB nem melhora nas respostas do Orbe**.

### Execução Fase B OFF, sem rede

Exige \`node_modules\` já instalado apenas no clone do LAB:

\`\`\`bash
(
  set -euo pipefail
  cd ~/hydradb-lab/phasscode-platform
  test "$(git branch --show-current)" = "experiment/hydradb"
  git pull --ff-only origin experiment/hydradb

  docker run --rm \
    --network none \
    --user "$(id -u):$(id -g)" \
    -e HOME=/tmp \
    -v "$PWD:/workspace:ro" \
    -w /workspace \
    node:24 sh -ec '
      npm run typecheck
      ./node_modules/.bin/vitest run \
        tests/hydradb-lab-evidence-adapter.test.ts \
        tests/hydradb-lab-gate8-score.test.ts
      node --import tsx scripts/hydradb-lab-gate8-corpus-check.ts
      node --import tsx scripts/hydradb-lab-gate8-evaluate.ts --mode off
    '
)
\`\`\`

Critério de aprovação: \`GATE8_REFERENCE_SOURCE_PARITY_PASS\` (preflight), \`GATE8_DRAFT_REFERENCE_RETRIEVAL_PASS\`, \`GATE8_INDEPENDENT_GOLD_REVIEW_REQUIRED\` e \`GATE8_NO_INCREMENTAL_SEMANTIC_GAIN_DEMONSTRATED\`, além de TypeScript/Vitest sem falhas.

### Execução Fase B SHADOW real, HTTP local e somente leitura

Executar somente após OFF aprovado, reutilizando o mesmo \`lab_run\` do Gate 7 (não iniciar novos seeds):

\`\`\`bash
(
  set -euo pipefail
  cd ~/hydradb-lab/phasscode-platform
  REPORT="$HOME/hydradb-lab/benchmarks/ppks-contract-20261105T225141Z.json"
  TOKEN="$HOME/hydradb-lab/secrets/hydradb_auth_token"
  test -s "$REPORT"
  test -s "$TOKEN"

  docker run --rm \
    --network host \
    --user "$(id -u):$(id -g)" \
    --cap-drop ALL \
    --security-opt no-new-privileges \
    --pids-limit 96 --memory 384m --cpus 0.75 \
    -e HOME=/tmp \
    -v "$PWD:/workspace:ro" \
    -v "$HOME/hydradb-lab/benchmarks:/lab-reports:ro" \
    -v "$TOKEN:/run/secrets/hydradb_auth_token:ro" \
    -w /workspace \
    node:24 \
    node --import tsx scripts/hydradb-lab-gate8-evaluate.ts \
      --mode shadow \
      --report "/lab-reports/$(basename "$REPORT")" \
      --token-file /run/secrets/hydradb_auth_token \
      --require-graph
)
\`\`\`

Critério de aprovação: \`GATE8_SHADOW_CANONICAL_PARITY_PASS\` e \`GATE8_SHADOW_SUPPORTED_FIXTURE_VERIFIED_PASS\`, mantendo as mesmas claims, fontes e níveis de evidência do modo OFF. Habilidades sem projeção HydraDB LAB devem permanecer em fallback canônico. Nenhuma execução foi feita pelo assistente no MiniMac; é indispensável conferir a saída do operador.

**Próximo passo após homologar Fase B:** revisão humana independente do draft e, só então, testes de *interpretação* de perguntas com baselines atuais do Orbe. Não adicionar LLM nem ONNX sidecar como consequência implícita.
