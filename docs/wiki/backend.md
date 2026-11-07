# Backend — leitura guiada do código

[← Wiki](README.md) · [Arquitetura](arquitetura.md) · [Fluxo Orbe](orbe-fluxo-de-resposta.md)

## 1. O que executa de fato

A entrada da aplicação pública é [`apps/orbe-node/src/main.ts`](../../apps/orbe-node/src/main.ts). O bootstrap segue esta sequência conceitual:

1. Validar ambiente e isolamento público/GraphRAG via [configuração Zod](../../packages/shared-config/src/index.ts) e [política de grafo](../../apps/orbe-node/src/application/graph-public-policy.ts).
2. Carregar [base `knowledge/portfolio.json`](../../knowledge/portfolio.json) via `JsonKnowledgeRepository`.
3. Conforme a flag, projetar o [PPKS para grafo tipado](../../apps/orbe-node/src/adapters/ppks-evidence-graph.ts) e montar o Reader privado [`GraphReaderHttpRepository`](../../apps/orbe-node/src/adapters/graph-reader-http.ts).
4. Selecionar [`MemoryConversationStore`](../../apps/orbe-node/src/adapters/memory-store.ts) em desenvolvimento ou [`PostgresConversationStore`](../../apps/orbe-node/src/adapters/postgres-store.ts), conforme `PERSISTENCE`.
5. Conectar Redis quando configurado, criar [orçamento global](../../apps/orbe-node/src/adapters/redis-llm-budget.ts), provedor `mock` ou [`LangChainChatProvider`](../../apps/orbe-node/src/adapters/langchain-provider.ts), e o [fallback de provedores](../../apps/orbe-node/src/adapters/fallback-llm.ts) quando habilitado.
6. Construir o servidor por [`buildApp({... publicOnly: true })`](../../apps/orbe-node/src/http/app.ts), com as portas opcionais do grafo e o Reader de evidências externas.
7. Iniciar listeners e configurar encerramento controlado, sem expor segredos dos provedores.

**Por que esta estrutura?** O domínio principal recebe dependências por interface e não conhece detalhes SQL/HTTP; as implementações reais ficam em `adapters/`, com regras no nível de `application/` e protocolos em `http/`.

## 2. Organização de pastas

| Local                                                                       | O que significa                                    | Exemplos                                                     |
| --------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| [`apps/orbe-node/src/domain`](../../apps/orbe-node/src/domain/)             | Tipos, contratos e erros do negócio                | `ports.ts`, `security.ts`, `evidence-graph.ts`               |
| [`apps/orbe-node/src/application`](../../apps/orbe-node/src/application/)   | Serviços, decisões e políticas de resposta         | `chat.ts`, `canonical-claims.ts`, `graph-active-answer.ts`   |
| [`apps/orbe-node/src/adapters`](../../apps/orbe-node/src/adapters/)         | Persistência, conhecimento, LLM, Neo4j, Redis      | `postgres-store.ts`, `knowledge.ts`, `neo4j-driver-store.ts` |
| [`apps/orbe-node/src/http`](../../apps/orbe-node/src/http/)                 | API Fastify, validação e erros                     | `app.ts`                                                     |
| [`apps/orbe-node/src/graph-reader`](../../apps/orbe-node/src/graph-reader/) | Serviço privado de leitura de grafo                | `app.ts`, `main.ts`                                          |
| [`apps/report-node`](../../apps/report-node/)                               | Envio opcional de métricas agregadas               | `src/main.ts`, `report-format.ts`                            |
| [`apps/worker-node`](../../apps/worker-node/)                               | Código histórico de worker                         | Não ativo no Orbe público                                    |
| [`packages/contracts`](../../packages/contracts/)                           | Contratos de API e esquemas compartilhados         | DTOs de conversa, OpenAPI                                    |
| [`packages/database`](../../packages/database/)                             | SQL, migrations e pool PostgreSQL                  | Persistência e evolução do esquema                           |
| [`packages/shared-config`](../../packages/shared-config/)                   | Validação e normalização de configuração           | `loadConfig`                                                 |
| [`knowledge`](../../knowledge/)                                             | Catálogo e evidências profissionais                | PPKS, relações curadas                                       |
| [`evaluation`](../../evaluation/)                                           | Cenários de recuperação/recrutamento e indicadores | Rubricas, avaliações offline                                 |

## 3. O servidor HTTP (`buildApp`)

Arquivo: [`apps/orbe-node/src/http/app.ts`](../../apps/orbe-node/src/http/app.ts).

- Fastify é configurado com limite de corpo, timeouts, ID de correlação e sanitização dos logs.
- `@fastify/helmet`, CORS por origins explícitas e rate limiting por IP protegem a superfície HTTP.
- O modo `publicOnly: true` rejeita autenticação/reuniões habilitadas e reduz a superfície pública.
- `GET /health` informa disponibilidade do processo; `GET /ready` verifica dependências essenciais.
- `GET /api/v1/openapi.json` disponibiliza o contrato público reduzido.
- `POST /api/v1/chat` valida body, token de continuidade no cabeçalho e consentimento opcional de relatórios; chama `ChatService.execute`.
- `POST /api/v1/chat/report-optout` revoga a autorização de relatório de uma conversa, com verificação da credencial.
- Os erros externos recebem mensagens controladas; detalhes internos não devem ser expostos aos visitantes.

[DTOs e OpenAPI](../../packages/contracts/src/index.ts) são a referência para clientes, não descrições históricas de endpoints removidos.

## 4. Conversas: porta e implementação

A [interface `ConversationStore`](../../apps/orbe-node/src/domain/ports.ts) define execução do turno e controle de acesso. Duas implementações documentadas:

- [`MemoryConversationStore`](../../apps/orbe-node/src/adapters/memory-store.ts): ferramenta de desenvolvimento; não usar para afirmar persistência após reinicializações.
- [`PostgresConversationStore`](../../apps/orbe-node/src/adapters/postgres-store.ts): transação durável por turno, locking e atualização de histórico, hash de token e retenção.

A criação produz `conversationId` UUID e **token aleatório**; o UUID sozinho **não autoriza** acesso ao histórico. O token é hasheado no servidor antes da validação. O frontend mantém a credencial no cliente em memória; ela não deve aparecer em logs, analytics, URLs ou commits. Consulte [`domain/security.ts`](../../apps/orbe-node/src/domain/security.ts).

### Falhas e concorrência

- Sem token válido para conversa existente: a resposta é de conversa não encontrada, em vez de expor existência/identidade de terceiros.
- O backend limita concorrência, histórico e orçamento de contexto; timeout e erro do provedor são traduzidos para códigos públicos.
- Uma falha de Redis quando necessário **não** autoriza ultrapassar rate limit ou orçamento de LLM.
- A lógica de `runTurn` governa persistência de mensagens do visitante e do Orbe, não um simples `INSERT` sem atomicidade.

## 5. Modelos de IA e fallback

A [porta `ChatProvider`](../../apps/orbe-node/src/domain/ports.ts) separa o caso de uso de um fornecedor de IA.

- [`MockChatProvider`](../../apps/orbe-node/src/adapters/mock-provider.ts) serve testes; **não demonstra qualidade do modelo real**.
- [`LangChainChatProvider`](../../apps/orbe-node/src/adapters/langchain-provider.ts) prepara mensagens, documentos, instruções do [prompt v4](../../apps/orbe-node/prompts/v4.md) e limites de geração.
- [`RedisLlmCallBudget`](../../apps/orbe-node/src/adapters/redis-llm-budget.ts) limita **invocações reais**, não tokens ou gasto monetário exato.
- [`fallback-llm.ts`](../../apps/orbe-node/src/adapters/fallback-llm.ts) organiza alternativas de provedor; não significa capacidade ilimitada nem sucesso garantido.

Não inserir chaves de API em `VITE_*`, browser, Markdown ou logs.

## 6. Relatórios opcionais, separados do chat público

O [`apps/report-node/src/main.ts`](../../apps/report-node/src/main.ts) executa leituras de PostgreSQL, reserva de tarefas e envio ao Telegram quando explicitamente configurado. O propósito é **métrica agregada**, não salvar transcrições no sistema de relatórios. A autorização deve ser dada antes de iniciar a conversa, pode ser retirada e não apaga mensagens já enviadas ao Telegram. A entrega pode raramente ser duplicada após falha entre aceitação e confirmação.

Não confundir esse serviço com o antigo `worker-node` de reuniões.

## 7. Primeiro roteiro de leitura do backend

```text
apps/orbe-node/src/main.ts
  → apps/orbe-node/src/http/app.ts :: buildApp
  → apps/orbe-node/src/application/chat.ts :: ChatService.execute
  → apps/orbe-node/src/domain/ports.ts :: interfaces
  → apps/orbe-node/src/adapters/knowledge.ts :: JsonKnowledgeRepository
  → apps/orbe-node/src/adapters/postgres-store.ts :: PostgresConversationStore
  → apps/orbe-node/src/adapters/langchain-provider.ts :: LangChainChatProvider
  → apps/orbe-node/src/application/graph-active-answer.ts (somente DEV opt-in)
```

Continue em [**Lógica do Orbe**](orbe-fluxo-de-resposta.md), onde o método `ChatService.execute` é detalhado por blocos de decisão.
