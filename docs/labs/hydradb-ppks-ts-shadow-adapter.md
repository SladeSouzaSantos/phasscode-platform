# Gate 5 — adapter TypeScript shadow do HydraDB no LAB

**Branch:** `experiment/hydradb` somente. **Não foi ligado ao Orbe**:
não altera `main.ts`, rotas, configuração, Compose, modo GraphRAG ou
nenhuma instância DEV/MAIN. O adapter é importável somente quando um
teste/consumidor explícito referenciar o módulo `scripts/`.

## Evidências anteriores

- Gate 3: duas rodadas consecutivas, 13/13 consultas parametrizadas
  por motor com PPKS, sem vazamento entre `lab_run`.
- Gate 4: dez consultas do leitor Python shadow conferidas com o
  PPKS, além de autotestes offline de fallback e proveniência.
- Gate 5: **implementado, ainda sem homologação no MiniMac**.

## Contrato e política de segurança

`scripts/hydradb-lab-evidence-adapter.ts` implementa
`EvidenceGraphRepository` e recebe o `canonical` como dependência
**injetada**; esse repository deve ser baseado no PPKS, não no Neo4j.
Não constrói/projeta nem transmite fontes acadêmicas privadas.

- **Padrão `off`:** lê exclusivamente o repository PPKS; nenhuma
  chamada de rede é feita.
- **Opt-in `shadow`:** exige `runKey` decimal de uma rodada do
  LAB aprovada e `HydraLabReadTransport` explícito.
- Usa somente as duas consultas Cypher fixas:
  `hydraLabFindCypher` e `hydraLabSourceCypher`, com `$run`,
  `$skill`, `$source` como parâmetros.
- O cliente HTTP opcional e restrito a loopback
  `127.0.0.1:18443` (namespace `lab`) aceita somente essas consultas.
  Token não é lido do .env ou injetado automaticamente. Não há escrita.
- Só verifica o conjunto de tecnologias públicas previsto
  (`Java`, `Flutter`, `TypeScript`, `Node.js`, `Go`).
  Qualquer outra tecnologia continua sendo atendida pelo PPKS sem
  consultar HydraDB.
- Mantém `mixed_role` de Greencity, `professional` do SIGAA,
  `study` de projetos acadêmicos e `catalog_only` versus
  `code_reviewed` por fonte.
- Retorna **exatamente as claims e fontes canônicas**, mesmo quando
  a verificação HydraDB é positiva. As leituras graph só observam
  equivalência de campos, ordem não relevante e contagem de duplicados.
- Uma claim que não tiver **todas** as suas fontes presentes no
  resultado canônico não é devolvida; o adapter não pode inventar fontes.
- Um `limit` de 1 claim preserva **todas** as fontes da claim
  selecionada. Se a consulta canônica tiver 20 claims, a verificação
  shadow é omitida porque poderia haver truncamento do conjunto
  total (não afirmar paridade sem prova).
- Erro, timeout, resposta malformada, fonte ausente, linha adicional ou
  discrepância de escopo resultam em
  `status: canonical_fallback` **somente na telemetria segura**:
  o retorno permanece o PPKS canônico.
- A telemetria tem campos `operation`, `status`, `reason`;
  jamais guarda pergunta, evidência, token, URL, dados pessoais,
  erros HTTP ou texto de recrutadores.

Esta interface é **um adapter shadow de verificação**, e ainda NÃO um
adapter ativo de busca que substitui o PPKS. Ela não transforma os
47 nós sintéticos em `OrbeEvidence` real.

## Testes unitários — sem rede e sem banco

`tests/hydradb-lab-evidence-adapter.test.ts` usa mocks.
Cobre:
1. OFF não chama graph, limite por claim preserva fontes;
2. Java profissional + estudo, Flutter misto + projeto pessoal;
3. fontes verificadas, de catálogo e privadas;
4. Go ausente, fonte ausente, input não aprovado;
5. linha ausente/extra, campos malformados e erro de transporte:
   saída permanece canônica;
6. runKey obrigatório, parametrização e rejeição de Cypher de escrita
   antes de tentar rede.

Rodar na branch experimental, após dependências instaladas
localmente **no clone de LAB**, e sem acessar DEV:

```bash
cd ~/hydradb-lab/phasscode-platform
git pull --ff-only origin experiment/hydradb
node --version
npm run typecheck
npx vitest run tests/hydradb-lab-evidence-adapter.test.ts
```

Se `node_modules` não existir no clone, não tente usar
`/opt/projects/phasscode-platform-dev/node_modules`; instale as
dependências pelo lockfile **somente neste checkout**
(`npm ci --ignore-scripts`) após conferir Node 24/npm 11.
Nenhuma execução depende do HydraDB estar ligado.

**Gate de conclusão:** `npm run typecheck` e os testes do adapter
passarem. Depois, planejar uma prova de consulta HTTP real via TS,
com credencial local do LAB e snapshot de dados explicitamente
públicos, antes de qualquer integração na API.

## Critérios que ainda faltam antes de integração

- fonte de verdade PPKS pública injetada no adapter TypeScript sem
  carregar dados acadêmicos privados;
- transporte HTTP real homologado em LAB;
- recuperação real de `EvidenceClaim` e `EvidenceSource` do
  `OrbeEvidence` (não apenas metadados sintéticos);
- testes de indisponibilidade real, timeout, estresse e reconexão;
- avaliação de perguntas de recrutadores e verificação de que
  nenhuma resposta inventa experiência nem fonte;
- aprovação explícita para futura integração em um ambiente de
  avaliação, preservando DEV e MAIN.


## Homologação do Gate 5 no MiniMac

O operador atualizou o clone LAB até `8eed10a` e executou os
comandos dentro de `node:24`, com Node instalado isoladamente
no contêiner e dependências no checkout do LAB.

Resultados confirmados pelo terminal:

```text
> phasscode-platform@0.1.0 typecheck
> tsc --noEmit

✓ tests/hydradb-lab-evidence-adapter.test.ts (7 tests)
Test Files 1 passed (1)
Tests 7 passed (7)
```

**Gate 5: APROVADO**, para interface TypeScript,
parametrização e mocks de fallback. O teste não acessou o HydraDB
real a partir de TypeScript, portanto o Gate 6 precisa de execução
HTTP real.

O próximo procedimento está em
[hydradb-ppks-ts-http-gate.md](hydradb-ppks-ts-http-gate.md):
um executor TypeScript sem acesso à formação acadêmica privada,
com `--mode off` offline e `--mode shadow --require-graph`
usando o token do LAB por arquivo privado.
