# PHASSCODE Platform

Backend do portfólio PHASSCODE e do assistente Orbe Mágico. Este incremento entrega a fundação do
monorepo e um chat executável em Node.js, com conhecimento público estruturado, fontes e provedores
mock e real separados. O frontend React existente não foi alterado.

Agendamento, aprovação administrativa, Google Calendar, notificações, BullMQ, Java, RabbitMQ e Kafka
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
```

Use uma chave comum criada em <https://openrouter.ai/settings/keys>. Chaves management/provisioning
permitem administrar credenciais, mas não gerar respostas de IA. Substitua o ID do exemplo por um
modelo com suporte a ferramentas. O adaptador atual envia `strict: true` nos argumentos das
ferramentas; não exige `response_format` para a resposta final. Após editar `.env`, execute
`docker compose up -d --force-recreate api` para aplicar as variáveis ao container. O smoke real
com OpenRouter, continuidade de conversa e ferramenta executada está registrado no progresso.

`store: false` é enviado ao provedor. Isso não configura a política de retenção da conta nem substitui
as políticas do fornecedor. Mensagens e contexto são enviados ao LLM configurado; informe esse
tratamento ao visitante antes de disponibilizar a integração publicamente.

O prompt está em `apps/orbe-node/prompts/v1.md`. A base em `knowledge/portfolio.json` contém apenas
fatos fornecidos pelo proprietário. Edite e reinicie para atualizar. A recuperação lexical é simples;
embeddings/pgvector serão avaliados quando houver volume que os justifique.

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
Disponibilidade e solicitações de reunião serão integradas após os contratos e regras da Fase 3.

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
- Fase 3: serviço único de reuniões, OAuth Google, disponibilidade, aprovação, exclusão de conflitos,
  idempotência, transactional outbox, worker BullMQ e notificações.
- Fase 4: Java LTS/Spring Boot/LangChain4j, conformidade do contrato e seleção pelo gateway.
- Fases 5–6: adaptadores RabbitMQ e Kafka com suas semânticas próprias e testes reais.
- Fase 7: métricas/tracing, homologação, operação e publicação controlada.

Para a próxima fase serão necessários OAuth client/secret e refresh token Google Calendar,
calendários autorizados, bot token/chat ID Telegram, SMTP e autenticação administrativa/OIDC.
Nenhuma dessas credenciais é necessária para a execução do chat em mock ou com a LLM configurada.

CI roda em PRs e branches `dev`/`main`, com análise estática, auditoria, integração, build e smoke
Docker. Artefatos ficam no workflow por sete dias. Não há deploy remoto nem publicação automática
de imagens. Configure proteção de `main` e aprovação por ambiente antes de adicionar deploy.

O exemplo de proxy preserva o Nginx existente e seu include `/opt/projects/*/nginx.conf`.
Não altera domínio, DNS, certificados, servidor ou infraestrutura compartilhada.

Veja [progresso e ponto exato de continuação](docs/PROGRESS.md),
[arquitetura](docs/architecture/overview.md), [segurança](docs/security.md) e
[deploy futuro](docs/deployment/README.md). Limitações e resultados medidos estão registrados no
progresso; arquivos criados não significam integrações externas validadas.
