# API e sessão — React → Fastify → PostgreSQL

[← Mapa](../mapa-do-codigo.md) · [ChatService](chatservice.md) · [Persistência](persistencia-e-relatorios.md)

## 1. Objetivo e contratos

Uma sessão de chat permite continuar **um único histórico autorizado** sem login de usuário. `conversationId` identifica; **`conversationToken` autoriza**. A API foi desenhada para não expor tokens a analíticos ou LLM e para recusar sessões inválidas sem revelar conversas de terceiros.

| Origem | Símbolo/linha | Responsabilidade |
| --- | --- | --- |
| Frontend | [`createOrbeClient` / `send`](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/services/orbeClient.ts#L168-L307) | Validar URL/payload, manter credencial só em memória e chamar HTTP |
| Frontend | [`useOrbeChat`](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/hooks/useOrbeChat.ts#L28-L200) | Prevenir dupla chamada, abort, histórico visível, retries manuais |
| Backend | [`buildApp` / rota chat](../../../apps/orbe-node/src/http/app.ts#L280-L325) | CORS, rate-limit, schema, headers e consentimento |
| Backend | [`ChatService.execute`](../../../apps/orbe-node/src/application/chat.ts#L77-L94) | Gerar/validar ID e token + chamar `runTurn` |
| Store | [`PostgresConversationStore.runTurn`](../../../apps/orbe-node/src/adapters/postgres-store.ts#L18-L140) | Hash, lock, histórico e transação |

## 2. Primeira pergunta

```mermaid
sequenceDiagram
    participant U as Recrutador
    participant F as useOrbeChat
    participant C as orbeClient
    participant H as POST /api/v1/chat
    participant S as ChatService
    participant P as PostgreSQL
    U->>F: "Pedro conhece Java?"
    F->>C: send(message) sem ID/token
    C->>H: {message}, Content-Type JSON
    H->>H: Parse Zod + rate limit
    H->>S: execute(data, undefined, consent)
    S->>P: runTurn(isNew, SHA-256(token), callback)
    P->>P: BEGIN; insert; lock; histórico
    S->>S: buscar evidência; compor resposta
    P->>P: guardar dois lados do turno; COMMIT
    H-->>C: {conversationId, conversationToken, answer, sources, meta}
    C->>C: guardar ID/token em memória
    C-->>F: ChatReply sem token na UI
    F-->>U: resposta e fontes
```

Ver [`chat.ts:77–94`](../../../apps/orbe-node/src/application/chat.ts#L77-L94) e [`chat.ts:510–545`](../../../apps/orbe-node/src/application/chat.ts#L510-L545). O cliente **exige token em resposta à nova conversa** e valida esquema; se não houver, devolve erro de protocolo.

## 3. Continuação de conversa

O cliente serializa `{ conversationId, message }`, envia `X-Conversation-Token`, **não aceita** que a API devolva um novo token em uma continuação e exige o **mesmo** identificador de conversa. O código está em [`orbeClient.ts:194–295`](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/services/orbeClient.ts#L194-L295).

O backend valida o cabeçalho e o [formato do token](../../../apps/orbe-node/src/application/chat.ts#L77-L94), depois localiza conversa por ID/hash e janela de retenção com `FOR UPDATE NOWAIT` ([`postgres-store.ts:50–71`](../../../apps/orbe-node/src/adapters/postgres-store.ts#L50-L71)). **Não usar UUID sozinho como autenticação.**

### Token em memória ≠ transcrição cacheada

- [`orbeClient.ts`](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/services/orbeClient.ts#L194-L203): `conversation` fica numa closure em memória; `reset()` invalida e cancela a request.
- [`orbeTranscript.ts`](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/services/orbeTranscript.ts#L12-L80): cache de **texto recente** para apresentação, TTL de 24h e limite 256 KB, sem `conversationToken`; portanto restaurar o painel visual **não recupera por si só** as credenciais do backend.
- Se a API devolve 404, [`orbeClient.ts:259–261`](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/services/orbeClient.ts#L259-L261) descarta a sessão.
- Nem o token nem o body de chat são destinados a logs de diagnóstico; consulte [`orbeClient.ts:187–192`](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/services/orbeClient.ts#L187-L192).

## 4. Limites e cancelamento

| Condição | Comportamento | Fonte |
| --- | --- | --- |
| Mensagem vazia/acima do limite | Erro local antes do envio | [`orbeClient.ts:205–219`](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/services/orbeClient.ts#L205-L219) |
| Corpo acima de 8.192 bytes | Erro de validação no cliente/servidor | `TextEncoder` frontend; `bodyLimit` Fastify |
| Requisição já ativa | `OrbeClientError('busy')` | [`orbeClient.ts:212–215`](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/services/orbeClient.ts#L212-L215) |
| Timeout de cliente | `AbortController` e `OrbeClientError('timeout')`; default **45 segundos** | [`orbeClient.ts:228–240`](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/services/orbeClient.ts#L228-L240) |
| Timeout de provider | Erro tipado `LLM_TIMEOUT` 504 | [`chat.ts:369–413`](../../../apps/orbe-node/src/application/chat.ts#L369-L413) |
| Limite/rate limit | 429 ou 503 com retry após erro de quota/Redis, quando aplicável | [`http/app.ts`](../../../apps/orbe-node/src/http/app.ts), [`redis-llm-budget.ts`](../../../apps/orbe-node/src/adapters/redis-llm-budget.ts) |
| 404 de conversa | Limpa credencial no cliente; nova sessão poderá ser iniciada | [`orbeClient.ts:259–260`](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/services/orbeClient.ts#L259-L260) |

**Importante:** abortar o `fetch` **não prova** que o servidor interrompeu sua transação ou a chamada já despachada ao provedor. A UI sinaliza corretamente que a pergunta pode ter sido processada; não deve fazer retry automático em loop.

## 5. Endpoints públicos realmente montados

[`buildApp` no modo público](../../../apps/orbe-node/src/http/app.ts#L234-L354) reduz o OpenAPI aos seguintes caminhos:

| Rota | Método | Objetivo | Controle |
| --- | --- | --- | --- |
| `/health` | GET | Processo disponível | Não prova dependências |
| `/ready` | GET | Store/Redis prontas ou 503 | Não prova GraphRAG nem verdade factual |
| `/api/v1/openapi.json` | GET | Contrato público | Não expõe auth/reuniões |
| `/api/v1/chat` | POST | Novo turno/continuação | Body, token, consentimento, limites |
| `/api/v1/chat/report-optout` | POST | Retirar consentimento | `conversationId` + token da conversa |

**Atenção:** código legado de `/auth`, `/meetings` e admin só é registrado quando **não** se usa `publicOnly`; o bootstrap público passa `publicOnly: true` ([`main.ts:127–138`](../../../apps/orbe-node/src/main.ts#L127-L138)).

## 6. Consentimento para relatórios

`X-Orbe-Report-Consent: yes` é enviado somente **na primeira pergunta** quando há opt-in, antes de haver sessão ([cliente:244–247](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/services/orbeClient.ts#L244-L247)). O Fastify **rejeita** esse header em uma continuação com `conversationId` ([`app.ts:311–323`](../../../apps/orbe-node/src/http/app.ts#L311-L323)).

Para revogar, o frontend invoca `POST /api/v1/chat/report-optout` com token, o backend exige ID/token e a store atualiza consentimento e exclui os resumos ainda pendentes ([`postgres-store.ts:141–163`](../../../apps/orbe-node/src/adapters/postgres-store.ts#L141-L163)). Relatórios já entregues externamente não podem ser retirados do canal.

## 7. Testes de referência

- Backend HTTP: [`tests/http.test.ts`](../../../tests/http.test.ts), [`tests/public-orbe.test.ts`](../../../tests/public-orbe.test.ts), [`tests/chat-compatibility.test.ts`](../../../tests/chat-compatibility.test.ts).
- Sessão/BD: [`tests/postgres.integration.test.ts`](../../../tests/postgres.integration.test.ts), [`tests/postgres-admission.test.ts`](../../../tests/postgres-admission.test.ts).
- Frontend: [`tests/orbe-client.spec.ts`](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/tests/orbe-client.spec.ts), [`tests/orbe-api.spec.ts`](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/tests/orbe-api.spec.ts), [`tests/orbe-public.spec.ts`](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/tests/orbe-public.spec.ts).

Essas são **referências de testes existentes**, não declaração de cobertura integral nem resultado de execução nesta rodada.
