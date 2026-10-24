# PHASSCODE Platform

Backend do portfólio PHASSCODE e do assistente Orbe Mágico. O monorepo oferece
chat público em Node.js, login Google OIDC e agendamento com aprovação administrativa,
Google Calendar e notificações assíncronas. O frontend React é integrado separadamente.

**Fase 3 em homologação, com implementação local e contratos disponíveis.** Login, reuniões,
administração e ações do Orbe têm contratos para integração do frontend. Veja o
[guia da Fase 3](docs/api/phase3-integration.md), a [configuração](docs/deployment/phase3.md)
e a [validação de 23/10](docs/testing/phase3-local-validation-2026-10-23.md). As funções novas começam desativadas;
habilitá-las exige PostgreSQL/Redis e as configurações próprias dos provedores.
As Fases 1 e 2 e sua avaliação real estão no [fechamento anterior](evaluation/reports/phase2-closeout.md).
A retomada anterior partiu de `dev/64c8414`; a implementação da Fase 3 está em `dev/5770836`.
A validação inclui suites locais e PostgreSQL/Redis descartáveis,
navegador real com OIDC local, qualificação da imagem com API/worker separados e avaliação v4
autorizada na OpenRouter. Evidências e limites estão no relatório; não comprovam funcionamento
nas contas externas ou no servidor publicado. O proprietário confirmou que configurará os provedores
e implementará a UI; o [handoff do frontend](docs/api/phase3-frontend-handoff.md) já está disponível.

O portfólio e o Orbe continuam públicos. Login Google não concede papel administrativo; cookies
HttpOnly protegem a sessão, e JWTs de serviço permanecem no backend. Autorização Calendar é
independente do login. Java/Spring, RabbitMQ e Kafka continuam nas próximas fases; seus perfis de
infraestrutura não representam adaptadores implementados.

## Execução rápida sem credenciais

Requisitos: Node.js 24 LTS e npm 11. Execute os comandos na raiz do repositório.

```powershell
npm ci --ignore-scripts
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm run dev
```

No Linux/macOS, use `test -f .env || cp .env.example .env`. Preserve um `.env` existente e confira
suas opções antes de iniciar. A configuração inicial usa memória e mock; o histórico
se perde ao reiniciar e esse modo não é permitido em produção. O mock devolve textos extraídos da
base e inclui `meta.simulated: true` e um aviso na resposta. Não representa geração por LLM.

```powershell
Invoke-RestMethod http://localhost:3000/health
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/v1/chat `
  -ContentType 'application/json' -Body '{"message":"Quais tecnologias usa o portfólio?"}'
```

```bash
curl -H 'Content-Type: application/json' \
  -d '{"message":"Quais tecnologias usa o portfólio?"}' \
  http://localhost:3000/api/v1/chat
```

Abra Swagger em <http://localhost:3000/docs/> e o contrato em
<http://localhost:3000/api/v1/openapi.json>. Para executar compilado: `npm run build` e `npm start`.

## Docker e persistência

Requer Docker Engine ativo e Compose v2. Crie `.env` a partir do exemplo somente se ainda não existir
e configure a senha local. Os comandos desta seção são procedimentos de operação; a auditoria da
retomada usou dependências descartáveis, sem migrations no servidor ou alteração do `.env` real.
Se usar caracteres reservados em `POSTGRES_PASSWORD`, codifique-os na URI ou escolha uma senha
alfanumérica aleatória; a interpolação do Compose não faz URL encoding.

```bash
docker compose up -d --build --wait api
docker compose ps
docker compose logs --tail=100 api migrate
curl --fail http://localhost:3000/ready
```

O Compose força PostgreSQL e Redis para a API e aplica migrations em um serviço de inicialização
antes de liberar o processo HTTP. Os dados usam volumes persistentes. A API publica apenas
`127.0.0.1:${PHASSCODE_HTTP_PORT:-3000}`; os bancos e brokers não publicam portas por padrão.
Cada checkout deve configurar `COMPOSE_PROJECT_NAME`, `PHASSCODE_IMAGE` e `PHASSCODE_HTTP_PORT`
distintos. Produção e desenvolvimento no Mac Mini usam portas sugeridas 3000 e 3001, com a porta
interna 3000. Volumes e redes privadas pertencem ao projeto Compose. Veja o
[procedimento operacional](docs/deployment/README.md) antes de executar migrations ou retenção no servidor.

Se a API Compose já estiver ativa, pare-a antes de executar outra API no host na mesma porta,
ou altere `PORT` para o processo local.

Para Node no host com dependências em containers:

```bash
docker compose -f compose.yaml -f compose.dev.yaml up -d postgres redis
# Em .env: PERSISTENCE=postgres, DATABASE_URL=postgresql://USUARIO:SENHA_CODIFICADA@localhost:5432/BASE
# e REDIS_URL=redis://localhost:6379; use as credenciais/portas escolhidas para o banco local.
npm run migrate
npm run dev
```

No `.env.example`, `NODE_ENV`, `HOST`, `PORT`, `DATABASE_URL` e `REDIS_URL` são opções do processo
Node no host. No Compose, `PHASSCODE_NODE_ENV` escolhe o ambiente do container e
`PHASSCODE_HTTP_PORT` escolhe a porta publicada; as URLs dos bancos são derivadas internamente
dos campos `POSTGRES_*` e dos serviços. As opções são independentes. O env-file do Node não
expande `${POSTGRES_*}` em `DATABASE_URL`: informe uma URI completa somente quando rodar no host.

Migrations são transacionais, usam advisory lock e verificam checksums. Não edite uma migration
aplicada; crie a próxima. Para parar sem remover dados: `docker compose down`.

Limpeza periódica de histórico (agende diariamente em homologação/produção):

```bash
docker compose --profile maintenance run --rm retention
# Ou no host com DATABASE_URL configurada:
npm run db:retention
```

Os perfis `rabbitmq` e `kafka` são opcionais e independentes. O ambiente padrão usa somente Redis.
Eles serão conectados e validados nas Fases 5 e 6. O Kafka local usa um nó KRaft; não é um cluster de
produção. O worker BullMQ da Fase 3 é opt-in pelo perfil `worker`.

## Chat com LLM real

Escolha um modo de execução; os blocos de credenciais de provedor único e fallback são
alternativos. A seleção é:

| `LLM_FALLBACK_ENABLED` | `LLM_PROVIDER`                  | Credenciais utilizadas                                                                                 |
| ---------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `false`                | `mock`                          | Nenhuma; respostas simuladas.                                                                          |
| `false`                | `openai` ou `openai-compatible` | `LLM_API_KEY`, `LLM_MODEL` e opções genéricas.                                                         |
| `true`                 | Qualquer um dos valores acima   | Somente `LLM_OPENROUTER_*`, `LLM_GEMINI_*`, `LLM_GROQ_*` e `LLM_COHERE_*` dos candidatos configurados. |

O Orbe também oferece fallback opt-in **OpenRouter → Gemini → Groq → Cohere**, com chaves,
modelos e cotas separados, cooldown no Redis e prazo total por resposta. Veja o
[guia de configuração](docs/deployment/llm-fallback.md). A configuração começa desativada e
preserva o chat existente. OpenRouter aceita somente variantes gratuitas nesse modo;
Gemini/Groq exigem conta/modelo no plano gratuito. Cohere trial fica restrita a experimentação
não comercial e é recusada em produção. O recurso não garante gratuidade de uma conta faturada.

Para usar um provedor único, configure no `.env`:

```dotenv
LLM_PROVIDER=openai
LLM_FALLBACK_ENABLED=false
LLM_MODEL=MODELO_DISPONIVEL_NA_SUA_CONTA
LLM_API_KEY=CHAVE_SOMENTE_NO_BACKEND
LLM_API_MODE=responses
REDIS_URL=redis://localhost:6379
# Exemplo operacional: escolha o limite conforme sua conta, sem presumir uma cota gratuita.
LLM_GLOBAL_MAX_CALLS=60
LLM_GLOBAL_WINDOW_MS=86400000
```

Para usar a cadeia, defina `LLM_FALLBACK_ENABLED=true` e preencha chave, modelo e cota de cada
candidato conforme o guia. Nesse modo, você pode remover `LLM_API_KEY`, `LLM_MODEL`,
`LLM_BASE_URL` e `LLM_API_MODE` do seu `.env`: esses campos genéricos ficam inativos. Não repita
a mesma chave nos dois blocos. As janelas por provedor herdam `LLM_GLOBAL_WINDOW_MS`; os quatro
`LLM_<PROVEDOR>_WINDOW_MS` aparecem comentados no exemplo para overrides opcionais. A cota global
e as cotas de cada fornecedor têm funções diferentes e continuam independentes.

Para um provedor compatível: `LLM_PROVIDER=openai-compatible`, `LLM_BASE_URL` e
`LLM_API_MODE=chat-completions`, além de modelo e chave. O servidor deve implementar tool calling
compatível com o SDK. A API do provedor é configuração do operador; visitantes não podem alterá-la.
O adaptador usa LangChain.js, timeout, cancelamento, zero retries automáticos e ferramentas limitadas
com parâmetros validados. São até três rodadas do modelo; a cadeia permite até seis tentativas
HTTP no total, incluindo falhas e continuação após ferramentas. Não há fallback silencioso para mock.
Provedor real exige Redis e `LLM_GLOBAL_MAX_CALLS` explícito, inclusive em desenvolvimento. O contador
atômico é compartilhado pelas instâncias que usam o mesmo Redis e `LLM_GLOBAL_BUDGET_KEY`. Cada
invocação conta, inclusive após ferramentas e tentativas que falham; mock e políticas determinísticas
não contam. Esgotamento retorna `LLM_BUDGET_EXHAUSTED` (429) com `Retry-After`; falha no controle
retorna 503, sem chamar o modelo. O orçamento limita chamadas, não tokens nem custo financeiro.

Alternativa de provedor único usando OpenRouter, com os mesmos controles globais acima:

```dotenv
LLM_PROVIDER=openai-compatible
LLM_FALLBACK_ENABLED=false
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_API_MODE=chat-completions
LLM_API_KEY=CHAVE_COMUM_OPENROUTER_SOMENTE_NO_BACKEND
LLM_MODEL=ID_DO_MODELO_NA_OPENROUTER
# Opcional para modelos que permitem desativar reasoning:
OPENROUTER_REASONING_ENABLED=false
```

Use uma chave comum criada em <https://openrouter.ai/settings/keys>. Chaves management/provisioning
permitem administrar credenciais, mas não gerar respostas de IA. Substitua o ID do exemplo por um
modelo com suporte a ferramentas. O modo de provedor único envia `strict: true` nas ferramentas;
na cadeia, os parâmetros variam por transporte e a validação local permanece obrigatória.
Nenhum modo exige `response_format` para a resposta final. Após editar `.env`, execute
`docker compose up -d --force-recreate api` para aplicar as variáveis ao container. O smoke real
com OpenRouter, continuidade de conversa e ferramenta executada está registrado no progresso.

`OPENROUTER_REASONING_ENABLED` é uma extensão explícita para `openai-compatible` com
`chat-completions`, ou para o candidato OpenRouter da cadeia; vazio preserva o padrão do provedor.
No modelo Nemotron usado nesta avaliação,
foi configurado `false` para reservar a saída ao texto final. Reasoning e texto podem compartilhar o
mesmo limite de tokens, causando resposta vazia quando o orçamento é consumido antes da resposta.
Esse comportamento e as opções por modelo estão na
[documentação OpenRouter](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens).

O modo de provedor único envia `store: false`; na cadeia, esse campo é enviado à OpenRouter e
omitido nos outros transportes. Isso não configura a política de retenção da conta nem substitui
as políticas do fornecedor. Mensagens e contexto podem ser enviados aos candidatos habilitados;
informe esse tratamento ao visitante antes de disponibilizar a integração publicamente.
Flags `LANGCHAIN_VERBOSE`, `LANGCHAIN_TRACING`, `LANGCHAIN_TRACING_V2`, `LANGSMITH_TRACING` e
`LANGSMITH_TRACING_V2` não precisam ser configuradas: o padrão é desativado e `true` é recusado
para impedir diagnóstico automático com mensagens completas.

O prompt sem módulos da Fase 3 permanece em [`apps/orbe-node/prompts/v3.md`](apps/orbe-node/prompts/v3.md),
identificado como `orbe-v3`. Habilitar auth ou reuniões seleciona [`v4.md`](apps/orbe-node/prompts/v4.md);
ferramentas de reunião ainda exigem o opt-in HTTP descrito abaixo. As versões anteriores foram
preservadas. A [base profissional](knowledge/portfolio.json) tem 31
documentos sobre perfil, quatro experiências, sete formações, cursos, idiomas, projetos, contato e lacunas. Sua
[proveniência](knowledge/SOURCES.md) registra fontes e revisões consultadas. Formação e experiência
preservam o status declarado nas fontes; previsões de conclusão e vínculos atuais não são presumidos
a partir de materiais antigos. O currículo
fornecido pelo proprietário foi usado apenas para curadoria de informações profissionais; o PDF e
dados pessoais desnecessários não foram incorporados. O LinkedIn bloqueou a leitura pública e não
foi tratado como verificado. Edite a base e reinicie para
atualizar. A recuperação lexical pondera termos e mantém o contexto de continuações; embeddings/
pgvector serão avaliados quando houver volume que os justifique.

## Contrato e integração com o frontend

| Método | Endpoint               | Comportamento                                        |
| ------ | ---------------------- | ---------------------------------------------------- |
| GET    | `/health`              | Processo HTTP ativo                                  |
| GET    | `/ready`               | Migrations/PostgreSQL e Redis configurados respondem |
| POST   | `/api/v1/chat`         | Chat, fontes e metadados do provedor                 |
| GET    | `/api/v1/openapi.json` | OpenAPI 3.1 gerado dos schemas Zod                   |
| GET    | `/docs/`               | Swagger UI                                           |

Primeira mensagem: `{ "message": "Quais projetos usam React?" }`. A resposta inclui
`conversationId` e um `conversationToken` retornado uma única vez. Para continuar, envie
`conversationId` no JSON e o token no header `X-Conversation-Token`. Guarde-o apenas em memória do
cliente. Sem token válido, a conversa retorna 404. Uma nova conversa sempre recebe UUID do servidor.

Erros têm formato `{ "error": { "code", "message", "correlationId" } }`. Toda resposta fornece
`X-Correlation-Id`. Chat aceita até 2000 caracteres; o corpo HTTP tem limite de 8 KiB. Requisições
concorrentes na mesma conversa retornam 409. Rate limit retorna 429 e orientações nos headers.
O frontend deve tratar também o 429 global e os 503 transitórios, respeitar `Retry-After` e
permitir nova tentativa por ação do visitante. Não usar retries automáticos do chat.

Use [o cliente TypeScript](examples/frontend-client.ts) para adaptar o Orbe existente. Ele demonstra
envio, token de conversa, loading e erros com tipos inferidos do contrato. Não inclui chave do LLM.
O [guia de integração do frontend](docs/api/frontend-integration.md) detalha CORS, erros, reset,
fontes e o contrato atual. **A integração local do Orbe já pode começar**, sem exigir login.
Login e reuniões também podem ser integrados pelo [guia da Fase 3](docs/api/phase3-integration.md).
O cliente atualizado deve enviar `X-Orbe-Capabilities: meetings-v1` para receber ferramentas de
reunião e `actions`, e renderizar o formulário de confirmação antes do POST de consentimento.
Sem esse header, o chat preserva a resposta legada, sem `actions`, mesmo com reuniões habilitadas.

## Login com JWT e OAuth/OIDC

O código local de login usa **Google OpenID Connect**; a homologação com Google real está pendente.
O frontend pode preparar a substituição de sua simulação pelo fluxo BFF. O token de conversa não autentica usuários; portfólio e Orbe continuam
públicos. Administração exige identidade e papel atual; login social não concede `admin`.

A [arquitetura de autenticação](docs/architecture/authentication.md) separa `User`, identidades
vinculadas e credenciais. Node e Java/Spring usarão uma única fonte de usuários, papéis e permissões,
com contratos compatíveis. O navegador usa sessão por cookie HttpOnly/Secure/SameSite e proteção
CSRF; JWTs de serviço ficam no backend. O consentimento Google Calendar é independente
do login. A decisão está na [ADR 0004](docs/adr/0004-authentication.md).
Refresh, detecção de reuso e logout usam o mesmo mutex por família no PostgreSQL. A proteção de
revogação vale entre instâncias; o frontend deve serializar suas próprias renovações.

E-mail/senha com Argon2id, verificação de e-mail, recuperação segura e proteção contra força bruta;
vinculação GitHub; MFA e passkeys estão no roadmap. Não há implementações parciais desses métodos.

## Arquitetura e estrutura

Fastify oferece HTTP, validação de transporte e testes por injeção com pouca estrutura adicional.
O caso de uso depende de portas para geração, conhecimento e conversas. Adaptadores implementam
memória/PostgreSQL e mock/LangChain. Um único app modular evita separar serviços antes de haver
necessidade operacional. O worker BullMQ é separado; gateway e Java permanecem na evolução.

```text
apps/orbe-node/           HTTP, aplicação, domínio, adaptadores e prompt versionado
apps/worker-node/         dispatcher SQL, BullMQ, entregas e lembretes
packages/contracts/      Zod, tipos inferidos e OpenAPI gerado
packages/shared-config/  configuração validada por ambiente
packages/database/       pool, migrations e retenção
packages/integrations/   adaptadores Google Calendar, SMTP e Telegram
knowledge/               fatos públicos editáveis
infrastructure/          Docker, migrations e exemplo para Nginx existente
tests/                   domínio, HTTP, contrato, SDK e integração externa local
evaluation/              matriz, schemas, critérios e relatórios de avaliação da LLM
scripts/                 smoke e execução controlada da avaliação
examples/                cliente para o frontend existente
docs/                    arquitetura, decisões, segurança, validação e continuidade
.github/workflows/       qualidade, integração, imagem e CodeQL
```

## Qualidade e testes

```bash
npm run check
npm run test:infrastructure # Requer Compose CLI e Bash; não inicia containers.
npm run smoke
npm audit --audit-level=high
# Depois de alterar schemas:
npm run contracts:generate
```

`check` executa lint, formatação, tipos, conformidade do arquivo OpenAPI, testes e build.
Os testes padrão não requerem credenciais nem bancos. O adaptador real é testado com servidor HTTP
simulado para Responses e Chat Completions, incluindo o ciclo de tool calling.

Verificações específicas da Fase 3:

```bash
npm run phase3:preflight -- --target=compose --json # Offline; usa somente variáveis do processo.
npm run test:browser # Edge/Chrome instalado ou Chromium gerenciado; apenas loopback.
npm run smoke:phase3:docker -- --image IMAGEM_CANDIDATA_LOCAL # Teste privado descartável.
npm run eval:orbe:phase3 # Apenas plano; --live exige escopo autorizado e Redis exclusivo.
```

Para ler explicitamente o `.env` existente no preflight, sem alterá-lo:
`node --env-file=.env --import tsx scripts/phase3-preflight.ts --target=compose --json`.
O código 2 informa configuração incompleta. Veja [pré-checagem e runbook](docs/deployment/phase3-preflight.md).

Avaliação do Orbe com a API real já configurada:

```bash
npm run eval:orbe
# Somente após autorização separada e conferência do orçamento:
# 22 mensagens HTTP; até 66 chamadas ao modelo no teto conservador.
npm run eval:orbe -- --live --max-calls=22
# Repetir somente um caso:
npm run eval:orbe -- --live --case=followup-build
```

Sem `--live`, o comando apenas lista o plano e os tetos de consumo. A regressão offline da matriz
verifica 19 turnos elegíveis para LLM e três determinísticos: até 57 invocações na v3 atual, incluindo
até 38 adicionais após ferramentas. São até duas rodadas com três buscas locais cada por turno;
as buscas não são chamadas ao provedor. `--max-calls` limita HTTP, não a cota da LLM. A revisão
pós-Fase 2 não executa `--live` nem declara aprovação integral real da v3.
Os relatórios preservam respostas, fontes, tempos e
falhas, sem tokens de conversa. Aprovação automática não substitui revisão semântica. Consulte a
[matriz e rubrica](evaluation/RUBRIC.md) e os [resultados registrados](docs/PROGRESS.md).

Integração com PostgreSQL/Redis reais exige banco de testes descartável:

```bash
docker compose -f compose.test.yaml up --build --abort-on-container-exit --exit-code-from tests
docker compose -f compose.test.yaml down --volumes
```

Esse ambiente não publica portas e usa banco exclusivo de testes. Se já tiver dependências de teste
no host, configure as URLs e rode diretamente:

```powershell
$env:TEST_DATABASE_URL='postgresql://test:test@localhost:5432/phasscode_test'
$env:TEST_REDIS_URL='redis://localhost:6379/1'
npm run test:integration
```

Essa suíte falha explicitamente se as URLs não forem fornecidas. Ela aplica migrations e exercita
retenção na base inteira; deve usar exclusivamente dependências descartáveis. O cleanup remove
fixtures, mas o schema instalado permanece. Consulte [o guia de testes](docs/testing/README.md).

## Evolução e operação

- Fase 1: monorepo, configuração, contratos, Docker, PostgreSQL/Redis, migrations, health e qualidade.
- Fase 2: chat Node com mock, adaptador real configurável, conhecimento, ferramentas e proteções.
- Fase 3: primeiro login Google OIDC/JWT; serviço único de reuniões, OAuth Calendar, disponibilidade, aprovação, exclusão de conflitos,
  idempotência, transactional outbox, worker BullMQ e notificações.
- Fase 4: Java LTS/Spring Boot/LangChain4j, autenticação Spring Security com identidade compartilhada,
  conformidade dos contratos e seleção pelo gateway.
- Fases 5–6: adaptadores RabbitMQ e Kafka com suas semânticas próprias e testes reais.
- Fase 7: métricas/tracing, homologação, operação e publicação controlada.

Para homologar a Fase 3, configurar cliente Google OIDC e a chave do emissor central implementado;
separadamente, OAuth client/secret e refresh token Calendar, calendário autorizado e canais SMTP/Telegram.
Nenhuma dessas credenciais é necessária para a execução do chat em mock ou com a LLM configurada.

A migration aditiva `005_calendar_create_uncertainty.sql` persiste a incerteza de criação no
Calendar. Conflito comprovado antes do insert, sem tentativa anterior ambígua, pode liberar a
reserva; depois de ambiguidade, um retry com conflito ou GET `404` não resolve a escrita anterior.
O cancelamento exige evidência externa suficiente e pode conservar a reserva indefinidamente
se ela não aparecer. Detalhes e recuperação estão na [arquitetura de reuniões](docs/architecture/meetings.md).

CI roda em PRs e branches `dev`/`main`, com análise estática, auditoria, integração, build e smoke
Docker. A [PR #2](https://github.com/SladeSouzaSantos/phasscode-platform/pull/2) foi incorporada em
`main/7357329`: [Backend CI](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/39697791259)
e [CodeQL](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/39697791304) aprovados.
Em `dev/85ebca3`, também passaram [CI](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/39697973470)
e [CodeQL](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/39697973426). Esses resultados
são da Fase 2 publicada; esta revisão precisa de seu próprio commit e CI.

O workflow de deploy preparado segue o portfólio: testes, SAST, imagem GHCR por digest, DAST em
ambiente descartável com mock, Tailscale/SSH e verificação. É acionado manualmente e depende da
configuração dos ambientes, segredos e servidor descrita no [guia](docs/deployment/README.md).
Nenhum deploy, push de imagem, alteração remota ou instalação de Nginx foi executado nesta revisão.

O exemplo de proxy preserva o Nginx existente e seu include `/opt/projects/*/nginx.conf`.
Não altera domínio, DNS, certificados, servidor ou infraestrutura compartilhada.

Veja [progresso e ponto exato de continuação](docs/PROGRESS.md),
[tarefas por fase e critérios de conclusão](docs/TASKS.md),
[arquitetura](docs/architecture/overview.md), [segurança](docs/security.md) e
[operação e deploy](docs/deployment/README.md). Limitações e resultados medidos estão registrados no
progresso; arquivos criados não significam integrações externas validadas.
