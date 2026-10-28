# B2/F3 — React e Fastify reais em dependências descartáveis

Base backend: branch `dev`, commit `3d547bd1cff773989421ac4160a54c9fffbb9480` (B1).
Base frontend: branch `dev`, commit `ea2d1bcecbe75ebf0f87edca63a2062763b602f8` (F2).
Execuções locais em 26/10/2026, sem commit ou publicação da B2/F3.

O harness de B2/F3 usa um projeto Compose novo por execução. PostgreSQL e Redis
são serviços exclusivos; um terceiro contêiner executa Node 24, Chromium, React/Vite,
Fastify e um emissor OIDC local assinado. Os endpoints de autenticação continuam
passando pela validação normal de issuer, audience, assinatura, nonce, PKCE, state,
cookies e CSRF. Não existe alteração na autenticação de produção.

## Arquitetura e isolamento

| Componente                              | Destino visto pelo navegador e pela API |
| --------------------------------------- | --------------------------------------- |
| React/Vite                              | `http://127.0.0.1:5173`                 |
| API com transporte controlado de falhas | `http://127.0.0.1:3000`                 |
| Fastify real atrás do transporte        | `http://127.0.0.1:3001`                 |
| Emissor OIDC local                      | `http://127.0.0.1:4400`                 |
| Controle exclusivo do teste             | `http://127.0.0.1:4401`                 |
| Proxy do navegador com allowlist        | `http://127.0.0.1:4402`                 |
| PostgreSQL                              | `postgres:5432/phasscode_e2e`           |
| Redis da API / regressões               | `redis:6379/0` / `redis:6379/1`         |

API, frontend e emissor compartilham apenas o namespace de rede do contêiner de
testes. Isso preserva as restrições existentes de HTTP somente em loopback,
SameSite e o contexto seguro necessário a Web Locks, sem publicar portas no host.

`compose.b2-e2e.yaml` é independente dos arquivos de deploy. Todos os serviços
usam uma rede `internal: true`, sem rede externa, bind mounts, volumes persistentes
ou portas publicadas. PostgreSQL e Redis gravam em tmpfs. O navegador também usa
o proxy com destinos de loopback explicitamente permitidos pelo runtime.

O runner recusa daemon Docker remoto e colisões de projeto/tag. O contexto de
build é um diretório temporário montado a partir de uma allowlist de arquivos de
cada checkout `dev`: nunca é o diretório pai `web/`. Arquivos `.env`, diretórios
de dependências, artefatos e symlinks são recusados. O caminho de backups privados
é excluído da descoberta e da seleção. Nenhum `.env` real é carregado pelo Compose,
pelo Node ou pelo Vite. A chave JWT sintética é gerada em memória dentro do runner
e não entra na imagem nem no ambiente dos processos de frontend/navegador.

LLM usa `mock`, Calendar usa `fake`, worker permanece desligado e notificações
ficam `disabled`. Os dados e as credenciais são sintéticos. As regressões existentes
de worker, quando selecionadas, instanciam seus próprios adaptadores simulados nas
mesmas dependências descartáveis; não executam o worker implantado.

## Execução

Pré-requisitos: Docker local com Compose, imagens `postgres:17-alpine` e
`redis:7-alpine` já presentes, e ambos os checkouts na branch `dev`. O lockfile do
frontend deve fixar Playwright e playwright-core em `1.64.1`, a versão da imagem
oficial de navegador usada no Dockerfile. O build instala dependências com
`npm ci --ignore-scripts`; ele pode acessar registros de imagens/pacotes. O runtime
usa `--pull never` e a rede isolada, sem chamadas aos provedores externos.

Na raiz do backend, informando explicitamente o checkout do frontend:

```powershell
npm run test:e2e -- --frontend D:\programming_portfolio\web\web-portfolio-gameboy
```

Para executar também lint, typecheck, contrato OpenAPI, testes unitários dirigidos,
integrações PostgreSQL/Redis, build do backend e regressões do frontend dentro do
mesmo projeto novo:

```powershell
npm run test:e2e -- --frontend D:\programming_portfolio\web\web-portfolio-gameboy --regression
```

Para repetir apenas cenários dirigidos, `--grep` aceita o texto de seleção do
Playwright, preservado como argumento e registrado em `testFilter`. Uma execução
filtrada não representa aceite da suíte completa:

```powershell
npm run test:e2e -- --frontend D:\programming_portfolio\web\web-portfolio-gameboy --grep 'callback replay|dropped ACK|ACK held|without Web Locks'
```

`--regression-only` permite retomar os checks em um projeto novo sem iniciar
API/OIDC/Vite F3 nem repetir os E2E. Implica `--regression` e registra
`integratedSkipped: true`; não fornece evidência de execução dos 28 cenários.
Os modos filtrado e de regressões têm mensagens finais próprias para evitar
atribuir a eles o resultado de uma suíte integrada completa.

`--frontend-regression-only` retoma somente a matriz frontend, sem repetir E2E
ou checks backend aprovados. `--frontend-grep TEXT`, permitido apenas nesse
modo, seleciona a suíte geral filtrada e não executa F1/F2/Fase 3/Orbe nem
atribui a ela os dois testes de política que podem não ter sido selecionados.
Sem opções de seleção, toda a matriz frontend e ambos os testes de `main` são
exigidos. Para retomar apenas suítes pendentes, a opção abaixo aceita uma lista
sem duplicatas dentre `default,f1,f2,phase3,orbe`, na ordem canônica:

```powershell
npm run test:e2e -- --frontend D:\programming_portfolio\web\web-portfolio-gameboy --frontend-regression-only --frontend-suites phase3,orbe
```

Esse modo ainda aplica migrations no banco novo, executa typecheck, build `main`
e scanner, mas não repete suítes omitidas nem os E2E. Sem `default`, os dois
testes de política ficam explicitamente marcados como não executados nessa
retomada; sua evidência deve vir de uma execução que realmente os incluiu.
O escopo, as suítes e os filtros são registrados em JSON.

Não executar `scripts/b2-runtime.mjs` diretamente no host. Esse arquivo exige o
contêiner preparado pelo harness e sua marca de propriedade. As migrations reais
são chamadas diretamente por Node, antes de iniciar o runtime, sem os scripts que
carregam `.env`. As regressões começam depois do encerramento dos processos da
API, OIDC e Vite, evitando interferência com os cenários de navegador. O frontend
é construído com a política de `main` e flags hostis; o bundle é inspecionado por
sentinelas de segredos e URLs que deveriam ser eliminadas. A suíte geral e as
suítes F1, F2, Fase 3 e Orbe executam sem retries, com relatórios separados.

## Evidências e limpeza

Os artefatos ficam por padrão em `.docker-local/b2-e2e/<projeto-uuid>/`, ignorado
pelo Git. `--artifacts DIR` seleciona outro diretório pai; cada execução cria seu
próprio subdiretório e recusa sobrescrever um existente. O runner extrai JSON e
HTML do contêiner identificado pelo projeto antes de removê-lo. Os relatórios
contêm apenas cenários/dados sintéticos; não são artefatos publicados do frontend.

`source-manifest.json` registra os SHAs dos checkouts e os hashes das fontes
efetivamente copiadas, inclusive mudanças locais do harness. `runtime-summary.json`
registra fases/duração e modos de integração. `isolation.json` registra a imagem,
rede, contêiner, resultado e situação da limpeza, sem chave JWT ou chave de controle.
Falha de execução também tenta extrair os relatórios e encerrar o projeto.

Na retomada frontend `ba4ad297-6ad6-44cf-af53-c719d0e55ec9`, a inspeção adicional
`runtime-isolation-verification.json` registrou os três IDs dos serviços próprios:
nenhuma porta publicada, bind mount ou volume persistente; tmpfs de PostgreSQL em
`/var/lib/postgresql/data` e Redis em `/data`. Nenhuma variável de ambiente foi
incluída nessa inspeção.

A limpeza usa exclusivamente `docker compose --project-name <uuid>` com o mesmo
arquivo e ambiente vazio da execução. A própria tag de imagem só é removida após
confirmar seu label de propriedade. Não há `prune`, limpeza global ou referência
aos projetos DEV/PROD. SIGINT/SIGTERM interrompem a execução; a limpeza tem prazo
próprio e não reutiliza o sinal já cancelado. Se a limpeza falhar, o erro informa
exatamente qual projeto descartável deve ser inspecionado.

## Resultado e limites

### Aceite local concluído, aguardando revisão

O aceite reúne fases aprovadas em três execuções preservadas. Não foi um único
processo `--regression` inteiramente verde: as falhas de sincronização dos testes
legados interromperam duas execuções, e somente as suítes pendentes foram
retomadas. Seus resultados parciais continuam nos relatórios e no histórico.

- **A:** `phasscode-b2-e2e-d8bbd4ab-0f76-4f5d-b8d7-f3302ce47b5f` — E2E e backend.
- **B:** `phasscode-b2-e2e-ba4ad297-6ad6-44cf-af53-c719d0e55ec9` — geral, F1, F2 e política `main`.
- **C:** `phasscode-b2-e2e-38824b61-a586-443d-8f39-3077a83b54bb` — retomada Fase 3/Orbe.

| Validação                                      | Aprovados | Falhos | Ignorados | Duração   | Fonte                                   |
| ---------------------------------------------- | --------- | ------ | --------- | --------- | --------------------------------------- |
| React/Fastify integrado                        | 28        | 0      | 0         | 67,454 s  | A, `playwright-f3.json`                 |
| Unitários backend dirigidos, 10 arquivos       | 202       | 0      | 0         | 9,91 s    | A, `runner-output.log`                  |
| Integração PostgreSQL/Redis, 9 arquivos        | 113       | 0      | 0         | 19,34 s   | A, `runner-output.log`                  |
| Frontend geral                                 | 196       | 0      | 0         | 132,494 s | B, `frontend-default/report.json`       |
| Frontend F1                                    | 29        | 0      | 0         | 93,997 s  | B, `frontend-f1/report.json`            |
| Frontend F2                                    | 20        | 0      | 0         | 79,213 s  | B, `frontend-f2/report.json`            |
| Frontend Fase 3                                | 56        | 0      | 0         | 161,909 s | C, `frontend-phase3/report.json`        |
| Frontend Orbe                                  | 22        | 0      | 0         | 56,780 s  | C, `frontend-orbe/report.json`          |
| Guards do orquestrador, após seleção de suítes | 7         | 0      | 0         | 1,78 s    | Vitest dirigido no checkout, sem Docker |

As durações de testes são as dos runners Vitest/Playwright, sem incluir o build
da imagem. Todos os relatórios Playwright de aceite têm zero flaky e zero retries.
Os 21 testes OIDC estão dentro dos 202; os sete guards são uma execução separada.
Os 578 unitários em 37 arquivos, aprovados em 22,53 s antes da interrupção,
permanecem evidência histórica: não foram repetidos nesta retomada nem somados
aos 202, pois há sobreposição.

Em A passaram migrations reais 001–005 (0,690 s), reset exclusivo das fixtures
(0,042 s), lint backend (5,705 s), tipos (24,892 s), contrato OpenAPI (1,431 s)
e build backend (6,334 s). Depois das últimas opções do CLI, sintaxe, Prettier,
ESLint dos arquivos alterados, os sete guards e `npm run typecheck` no checkout
também passaram. Nenhuma fonte de produção foi modificada desde A.

Em C passaram typecheck frontend (11,640 s), build de produção `main` com flags
hostis (6,663 s) e scanner dos artefatos (0,007 s). Os dois testes de política
`main` passaram dentro dos 196 de B, com `policyTestsPassed: true`.
Em C foram corretamente marcados como não executados, porque `default` não
foi selecionada. O JS gerado em B e C tem o mesmo SHA-256
`77743eebb74f163d6a7a3f0ca2a35c537ff2ca7073f78794d85a6e44b6913199`.
O scanner não encontrou as URLs proibidas, chaves ou sentinelas procuradas;
nenhum `.env` real foi fonte do build.

O [resumo de aceite](../../.docker-local/b2-e2e/phasscode-b2-e2e-38824b61-a586-443d-8f39-3077a83b54bb/acceptance-summary.json)
referencia os relatórios e seus hashes, distinguindo as três execuções.
Os HTMLs ficam em `playwright-report/index.html` de A e
`frontend-<suite>/html/index.html` de B/C. A
[verificação final de limpeza](../../.docker-local/b2-e2e/phasscode-b2-e2e-38824b61-a586-443d-8f39-3077a83b54bb/resource-cleanup-verification.json)
registrou em `2026-10-26T20:32:01.109Z` zero containers, redes, volumes e tags
de runner para cada um dos nove projetos identificados. As camadas de cache
do build não foram alvo de limpeza global. A inspeção de runtime de C também
confirmou tmpfs e ausência de portas/binds/volumes persistentes.

Os SHAs de referência e a branch `dev` foram preservados, com stage vazio.
Os patches completos para revisão são externos aos repositórios; não houve
commit, push, PR, merge ou deploy. Isso conclui a validação local B2/F3,
sem declarar a Fase 3 funcionalmente homologada no ambiente DEV.

### Histórico das execuções de 26/10/2026

Os diretórios abaixo estão em `.docker-local/b2-e2e/`, ignorados pelo Git e
preservados para revisão. Um resultado parcial não foi contado como aceite.

| Sufixo UUID do projeto `phasscode-b2-e2e-` | Resultado                                                                                                                                                                                                                                                                     |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `a2828645-7745-409c-ad71-f8787b12e1e0`     | 0 aprovados, 1 falho e 27 ignorados; cinco migrations aplicadas; 4,406 s de Playwright. Helper recebeu 403 do proxy ao usar CONNECT.                                                                                                                                          |
| `da94c9e8-2e64-4573-8b24-7586fb9023f8`     | 25 aprovados, 1 timeout e 2 ignorados; 120,603 s. Navegação bloqueada pelo diálogo ainda aberto.                                                                                                                                                                              |
| `b51c8da2-c915-4fe1-8b3e-4f4450427249`     | Falha de build por EOF no registry público MCR; nenhum container ou teste iniciado.                                                                                                                                                                                           |
| `4c0b9271-21d9-4f0f-9dc6-0de5648e7ba9`     | Seleção dirigida: 4 aprovados, 0 falhos e 0 ignorados; 28,765 s. Não substitui a suíte completa.                                                                                                                                                                              |
| `5ceed85e-4ce6-40ea-aa70-f1371f0b8f7d`     | E2E: 28 aprovados, 0 falhos/ignorados, 142,610 s; 202 unitários dirigidos aprovados. Integrações: 108 aprovadas e 5 falhas por contaminação de configuração/fixtures entre fases; frontend ainda não iniciado.                                                                |
| `d8bbd4ab-0f76-4f5d-b8d7-f3302ce47b5f`     | E2E: 28/28, 67,454 s; reset próprio aprovado; 202 unitários e 113 integrações aprovados, com tipos/lint/contrato/build. Build `main` e scan aprovados. Frontend geral: 195 aprovados e 1 falha de sincronização de teste de tema; demais suítes frontend ainda não iniciadas. |
| `474d625d-5e44-4ca1-85f9-7c29242d7701`     | Tema dirigido: 1 aprovado, 0 falhos/ignorados, 40,365 s de Playwright; tipos, build `main` e scan aprovados. E2E e backend não repetidos.                                                                                                                                     |
| `ba4ad297-6ad6-44cf-af53-c719d0e55ec9`     | Geral: 196/196; F1: 29/29; F2: 20/20. Fase 3: 55 aprovados e 1 falha de sincronização no teste legado de logout; Orbe ainda não iniciado. E2E/backend não repetidos.                                                                                                          |
| `38824b61-a586-443d-8f39-3077a83b54bb`     | Retomada selecionada: Fase 3 56/56 em 161,909 s; Orbe 22/22 em 56,780 s, sem falhas/ignorados/flaky. Tipos, build `main` e scan aprovados; E2E/backend/geral/F1/F2 não repetidos. Limpeza concluída.                                                                          |

Após a retomada, foram identificados os recursos dos projetos anteriores e
confirmadas contagens zero de containers, redes, volumes e tags de runner.
A correção inicial do helper usa `fetch` real no navegador com cookie HttpOnly;
o replay usa a fixture HTTP independente e reenvia também a prova original do
callback, mantida somente em memória. Na retomada, os três últimos cenários
foram ajustados para fechar o diálogo pela UI antes de navegar ou consultar o
aviso global, e a seleção dirigida confirmou os quatro casos pendentes de aceite.

O runner ganhou seleção `--grep`, relatórios separados das regressões frontend
e progresso sanitizado por fase. O Dockerfile preserva as camadas de instalação
quando somente as fontes mudam. Não houve mudança de lógica de negócio para
obter aprovação dos testes.

O diagnóstico das cinco falhas de regressão identificou quatro testes legados
herdando `MEETINGS_ENABLED=true` sem a política de horários e um teste de fila
encontrando duas entradas porque havia outbox remanescente dos E2E. Os checks
agora recebem ambiente mínimo separado, sem flags AUTH/MEETINGS da API.
No modo completo, o controle do projeto descartável confirma um único reset
das fixtures antes de encerrar API/Vite e iniciar as regressões. Nenhuma
asserção, regra de autenticação, política de reuniões ou retry foi enfraquecido.

A falha da suíte geral em `theme-transition.spec.ts` comparava o tema antes da
intenção de navegar com o tema após um unmount que o Router podia adiar. A espera
aceitava um frame histórico e a animação podia terminar entre RPCs. O ajuste é
somente no teste: mantém a Animation nativa pausada em 1/4 da expansão e verifica
essa condição imediatamente antes de navegar. Permanecem as exigências de
cancelamento (`idle`), ausência da máscara, tema preservado e próximo toggle
completo. Nenhuma fonte de produto foi alterada.

O segundo ajuste legado foi em `phase3-api.spec.ts`: descartar a identidade local
ocorre antes de terminar o preflight sob Web Locks e receber o ACK de logout.
O teste agora aguarda a confirmação global antes de exigir exatamente um POST,
CSRF correto e ausência de credenciais no storage/DOM. A sessão `user` dessa
fixture é apenas um caso defensivo de UI; não representa autenticação de conta
comum no backend real, cuja política admin-only permaneceu intacta.

### Limites

O harness valida React/Fastify/PostgreSQL/Redis reais com OIDC local, não uma conta
Google, TLS de publicação, Calendar, SMTP ou Telegram reais. A emissão OIDC e o
transporte de falhas são fixtures, sem substituir as rotas Fastify sob teste.

Os unitários dirigidos incluem autenticação, reuniões, configuração da Fase 3,
Calendar/notificações e a fixture OIDC. Os guards do orquestrador são verificados
separadamente no checkout, sem Docker. A suíte unitária completa do backend foi
executada antes da interrupção; seu resultado histórico não é apresentado como
uma nova execução. O contexto não inclui `.env.example` nem outros arquivos de
suporte desnecessários ao fluxo integrado.

Nenhuma etapa publica imagem, abre PR, faz push ou executa deploy. O frontend
não possui lint configurado; o harness registra seu typecheck separadamente,
sem atribuir a ele um resultado de lint.

## Arquivos da entrega

- Modificado: `package.json`, apenas para registrar `test:e2e`.
- Novos: `compose.b2-e2e.yaml`, `infrastructure/docker/B2.Dockerfile`,
  `scripts/b2-e2e.mjs`, `scripts/b2-e2e.d.mts`, `scripts/b2-runtime.mjs`,
  `tests/b2-harness.test.ts`, `tests/b2-oidc.test.ts`,
  `tests/e2e/local-oidc.ts`, `tests/e2e/runtime.ts` e este documento.

São onze arquivos. Não há mudança em `apps/`, `packages/`, contratos B1,
migrations, configurações de deploy, lockfile ou arquivos reais de ambiente.

Referências primárias: [redes internas Compose](https://docs.docker.com/reference/compose-file/networks/#internal),
[contextos de build](https://docs.docker.com/build/concepts/context/) e
[imagem oficial Playwright](https://playwright.dev/docs/docker).
