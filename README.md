# PHASSCODE Platform

Backend do portfólio PHASSCODE e do assistente Orbe Mágico. Este incremento entrega a fundação do
monorepo e um chat executável em Node.js, com conhecimento público estruturado, fontes e provedores
mock e real separados. O frontend React existente não foi alterado.

**Fases 1 e 2 concluídas localmente.** A base tem 31 documentos e a validação soma 102 testes
automatizados. A avaliação real e suas reexecuções estão no [fechamento da Fase 2](evaluation/reports/phase2-closeout.md).
O chat já permite integração local do frontend. A próxima entrega é o login Google OIDC da Fase 3.

Login Google OIDC, agendamento, aprovação administrativa, Google Calendar, notificações, BullMQ, Java, RabbitMQ e Kafka
fazem parte das próximas fases. Os perfis opcionais dos brokers disponibilizam infraestrutura, não
adaptadores de aplicação. Nenhum endpoint de reunião é anunciado como funcional.

## Execução rápida sem credenciais

Requisitos: Node.js 24 LTS e npm 11. Execute os comandos na raiz do repositório.

```powershell
npm ci --ignore-scripts
Copy-Item .env.example .env
npm run dev
```

No Linux/macOS, use `cp .env.example .env`. A configuração inicial usa memória e mock; o histórico
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

Requer Docker Engine ativo e Compose v2. Copie `.env.example` para `.env` e configure a senha local.
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
`127.0.0.1:3000`; os bancos e brokers não publicam portas por padrão.

Se a API Compose já estiver ativa, pare-a antes de executar outra API no host na mesma porta,
ou altere `PORT` para o processo local.

Para Node no host com dependências em containers:

```bash
docker compose -f compose.yaml -f compose.dev.yaml up -d postgres redis
# Em .env: PERSISTENCE=postgres, DATABASE_URL conforme exemplo, REDIS_URL=redis://localhost:6379
npm run migrate
npm run dev
```

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
produção. Notificações e lembretes via BullMQ começam na Fase 3.

## Chat com LLM real

No `.env`, configure:

```dotenv
LLM_PROVIDER=openai
LLM_MODEL=MODELO_DISPONIVEL_NA_SUA_CONTA
LLM_API_KEY=CHAVE_SOMENTE_NO_BACKEND
LLM_API_MODE=responses
```

Para um provedor compatível: `LLM_PROVIDER=openai-compatible`, `LLM_BASE_URL` e
`LLM_API_MODE=chat-completions`, além de modelo e chave. O servidor deve implementar tool calling
compatível com o SDK. A API do provedor é configuração do operador; visitantes não podem alterá-la.
O adaptador usa LangChain.js, timeout, cancelamento, zero retries automáticos, ferramentas de leitura
com parâmetros validados e até três chamadas ao modelo. Não há fallback silencioso para mock.

Exemplo de configuração OpenRouter:

```dotenv
LLM_PROVIDER=openai-compatible
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_API_MODE=chat-completions
LLM_API_KEY=CHAVE_COMUM_OPENROUTER_SOMENTE_NO_BACKEND
LLM_MODEL=ID_DO_MODELO_NA_OPENROUTER
# Opcional para modelos que permitem desativar reasoning:
OPENROUTER_REASONING_ENABLED=false
```

Use uma chave comum criada em <https://openrouter.ai/settings/keys>. Chaves management/provisioning
permitem administrar credenciais, mas não gerar respostas de IA. Substitua o ID do exemplo por um
modelo com suporte a ferramentas. O adaptador atual envia `strict: true` nos argumentos das
ferramentas; não exige `response_format` para a resposta final. Após editar `.env`, execute
`docker compose up -d --force-recreate api` para aplicar as variáveis ao container. O smoke real
com OpenRouter, continuidade de conversa e ferramenta executada está registrado no progresso.

`OPENROUTER_REASONING_ENABLED` é uma extensão explícita para `openai-compatible` com
`chat-completions`; vazio preserva o padrão do provedor. No modelo Nemotron usado nesta avaliação,
foi configurado `false` para reservar a saída ao texto final. Reasoning e texto podem compartilhar o
mesmo limite de tokens, causando resposta vazia quando o orçamento é consumido antes da resposta.
Esse comportamento e as opções por modelo estão na
[documentação OpenRouter](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens).

`store: false` é enviado ao provedor. Isso não configura a política de retenção da conta nem substitui
as políticas do fornecedor. Mensagens e contexto são enviados ao LLM configurado; informe esse
tratamento ao visitante antes de disponibilizar a integração publicamente.

O prompt ativo está em [`apps/orbe-node/prompts/v3.md`](apps/orbe-node/prompts/v3.md), identificado
como `orbe-v3`; as versões anteriores foram preservadas. A [base profissional](knowledge/portfolio.json) tem 31
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

Use [o cliente TypeScript](examples/frontend-client.ts) para adaptar o Orbe existente. Ele demonstra
envio, token de conversa, loading e erros com tipos inferidos do contrato. Não inclui chave do LLM.
O [guia de integração do frontend](docs/api/frontend-integration.md) detalha CORS, erros, reset,
fontes e o contrato atual. **A integração local do Orbe já pode começar**, sem exigir login.
Disponibilidade e solicitações de reunião serão integradas após os contratos e regras da Fase 3.

## Login com JWT e OAuth/OIDC

Login real será a primeira entrega da Fase 3, começando somente com **Google OpenID Connect**.
O login visual do frontend consultado ainda é uma simulação em memória. O token de conversa atual
não é JWT nem autentica usuários. Portfólio e Orbe continuarão públicos; funcionalidades específicas,
especialmente a administração, exigirão autenticação e autorização.

A [arquitetura de autenticação](docs/architecture/authentication.md) separa `User`, identidades
vinculadas e credenciais. Node e Java/Spring usarão uma única fonte de usuários, papéis e permissões,
com contratos compatíveis. O navegador usará sessão por cookie HttpOnly/Secure/SameSite e proteção
CSRF; os serviços validarão os access tokens JWT. O consentimento Google Calendar será independente
do login. A decisão está na [ADR 0004](docs/adr/0004-authentication.md).

E-mail/senha com Argon2id, verificação de e-mail, recuperação segura e proteção contra força bruta;
vinculação GitHub; MFA e passkeys estão no roadmap. Não há implementações parciais desses métodos.

## Arquitetura e estrutura

Fastify oferece HTTP, validação de transporte e testes por injeção com pouca estrutura adicional.
O caso de uso depende de portas para geração, conhecimento e conversas. Adaptadores implementam
memória/PostgreSQL e mock/LangChain. Um único app modular evita separar serviços antes de haver
necessidade operacional; gateway, Java e worker surgirão quando tiverem função executável própria.

```text
apps/orbe-node/           HTTP, aplicação, domínio, adaptadores e prompt versionado
packages/contracts/      Zod, tipos inferidos e OpenAPI gerado
packages/shared-config/  configuração validada por ambiente
packages/database/       pool, migrations e retenção
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
npm run smoke
npm audit --audit-level=high
# Depois de alterar schemas:
npm run contracts:generate
```

`check` executa lint, formatação, tipos, conformidade do arquivo OpenAPI, testes e build.
Os testes padrão não requerem credenciais nem bancos. O adaptador real é testado com servidor HTTP
simulado para Responses e Chat Completions, incluindo o ciclo de tool calling.

Avaliação do Orbe com a API real já configurada:

```bash
npm run eval:orbe
# Opt-in: 20 cenários / 22 mensagens HTTP sequenciais, consumindo a cota da LLM:
npm run eval:orbe -- --live --max-calls=22
# Repetir somente um caso:
npm run eval:orbe -- --live --case=followup-build
```

Sem `--live`, o comando apenas lista o plano. Os relatórios preservam respostas, fontes, tempos e
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

Essa suíte falha explicitamente se as URLs não forem fornecidas. Ela aplica migrations e remove
apenas os registros criados pelos testes. Consulte [o guia de testes](docs/testing/README.md).

## Evolução e operação

- Fase 1: monorepo, configuração, contratos, Docker, PostgreSQL/Redis, migrations, health e qualidade.
- Fase 2: chat Node com mock, adaptador real configurável, conhecimento, ferramentas e proteções.
- Fase 3: primeiro login Google OIDC/JWT; serviço único de reuniões, OAuth Calendar, disponibilidade, aprovação, exclusão de conflitos,
  idempotência, transactional outbox, worker BullMQ e notificações.
- Fase 4: Java LTS/Spring Boot/LangChain4j, autenticação Spring Security com identidade compartilhada,
  conformidade dos contratos e seleção pelo gateway.
- Fases 5–6: adaptadores RabbitMQ e Kafka com suas semânticas próprias e testes reais.
- Fase 7: métricas/tracing, homologação, operação e publicação controlada.

Para a próxima fase serão necessários configuração central de identidade e cliente Google OIDC;
separadamente, OAuth client/secret e refresh token Google Calendar, calendários autorizados,
bot token/chat ID Telegram e SMTP.
Nenhuma dessas credenciais é necessária para a execução do chat em mock ou com a LLM configurada.

CI roda em PRs e branches `dev`/`main`, com análise estática, auditoria, integração, build e smoke
Docker. A fundação foi publicada pelo proprietário na PR #1; [Backend CI](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/39670852615)
e [CodeQL](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/39670852661) passaram em
`main` no commit `e78ef0a`. O incremento local de fechamento da Fase 2 ainda precisa de commit e CI
próprios. Artefatos ficam no workflow por sete dias. Não há deploy remoto nem publicação automática
de imagens. Configure proteção de `main` e aprovação por ambiente antes de adicionar deploy.

O exemplo de proxy preserva o Nginx existente e seu include `/opt/projects/*/nginx.conf`.
Não altera domínio, DNS, certificados, servidor ou infraestrutura compartilhada.

Veja [progresso e ponto exato de continuação](docs/PROGRESS.md),
[tarefas por fase e critérios de conclusão](docs/TASKS.md),
[arquitetura](docs/architecture/overview.md), [segurança](docs/security.md) e
[deploy futuro](docs/deployment/README.md). Limitações e resultados medidos estão registrados no
progresso; arquivos criados não significam integrações externas validadas.
