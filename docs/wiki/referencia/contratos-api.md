# Referência das APIs — contratos reais e superfície pública

[← Wiki](../README.md) · [API e sessão](../modulos/api-e-sessao.md) · [Código de montagem Fastify](../../../apps/orbe-node/src/http/app.ts)

**Baseline:** backend `main` `c302ec444266333756d9f35bc9c1dfd7a5e7c684`, examinado em 06/11/2026. A documentação diferencia o [contrato OpenAPI completo](../../../packages/contracts/openapi.json) (que inclui fases anteriores) da superfície do runtime atual, **`publicOnly: true`**.

## Rotas realmente registradas no modo público

| Método | Endpoint                     | Entrada                                                                  | Saída / erros relevantes                                                                                                     |
| ------ | ---------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/health`                    | Sem body                                                                 | `200 {status:"ok"}` — liveness, não disponibilidade do banco                                                                 |
| GET    | `/ready`                     | Sem body                                                                 | `200/503`, status `ready/not_ready`, dependências `postgres/redis/phase3` conforme configuração                              |
| GET    | `/api/v1/openapi.json`       | Sem body                                                                 | Documento 3.1 restrito a estas cinco rotas, sem securitySchemes de auth                                                      |
| POST   | `/api/v1/chat`               | JSON estrito, `message` de 1 a 2.000 caracteres e `conversationId?` UUID | `ChatResponse` com `answer`, `sources` (máx. 10), `conversationId`, `conversationToken` somente na primeira resposta, `meta` |
| POST   | `/api/v1/chat/report-optout` | JSON estrito `{conversationId}`, header `X-Conversation-Token`           | `{withdrawn:true}`; requer sessão válida e store com suporte                                                                 |

Implementação: [`app.ts:234–354`](../../../apps/orbe-node/src/http/app.ts#L234-L354), contratos de [`chatRequestSchema`/`chatResponseSchema`](../../../packages/contracts/src/index.ts).

### Headers de chat

- `X-Conversation-Token`: token aleatório de continuação; armazenado em memória no frontend, **não** em cache de transcrição.
- `X-Orbe-Report-Consent: yes`: opt-in de relatório, **somente ao iniciar** a conversa; em continuação retorna `INVALID_REQUEST`.
- `X-Orbe-Capabilities: meetings-v1`: ainda existe no contrato de compatibilidade; **não significa que reuniões estejam habilitadas** no modo público.
- `X-Correlation-Id`: correlação da chamada; o servidor sanitiza logs e cabeçalhos sigilosos.
- `Retry-After`: instrução de espera em erros aplicáveis de rate-limit ou orçamento.

### Modelo da resposta

```ts
type ChatResponse = {
  conversationId: string;
  conversationToken?: string; // somente primeiro turno
  answer: string;
  sources: Array<{
    type: 'profile' | 'project' | 'service' | 'platform';
    id: string;
    title: string;
    url?: string;
  }>; // máximo 10
  actions?: unknown[]; // campo histórico/condicional, não habilitado no público
  meta: {
    provider: 'mock' | 'openai' | 'openai-compatible';
    simulated: boolean;
    promptVersion: string;
    deterministic?: boolean;
  };
};
```

O DTO é apresentado para compreensão, não substitui os schemas Zod. O `ChatService` aplica `chatResponseSchema.parse` antes do retorno e a API usa `chatRequestSchema.safeParse`. [`orbeClient.ts`](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/services/orbeClient.ts) também valida o contrato no navegador.

### Tratamento de erros

| Situação                   | Código observado na implementação | Status |
| -------------------------- | --------------------------------- | -----: |
| Body/header inválido       | `INVALID_REQUEST`                 |    400 |
| Mesmo histórico ocupado    | `CONVERSATION_BUSY`               |    409 |
| Rate limit indisponível    | `RATE_LIMIT_UNAVAILABLE`          |    503 |
| Budget da LLM esgotado     | `LLM_BUDGET_EXHAUSTED`            |    429 |
| Budget da LLM indisponível | `LLM_BUDGET_UNAVAILABLE`          |    503 |
| Timeout de LLM             | `LLM_TIMEOUT`                     |    504 |
| Falha genérica de LLM      | `LLM_UNAVAILABLE`                 |    502 |

O OpenAPI geral inclui uma coleção de **erros padronizados**; isso não significa que todos os códigos listados sejam produzidos em todas as rotas. Não publicar dumps ou textos internos na resposta.

## Rotas históricas/condicionais

O arquivo [`openapi.json`](../../../packages/contracts/openapi.json) também descreve autenticação Google OIDC, sessão, administração, reuniões e notificações de fases anteriores. [`buildApp`](../../../apps/orbe-node/src/http/app.ts#L257-L279) **filtra essas rotas em `publicOnly`**, e a inicialização atual [`main.ts`](../../../apps/orbe-node/src/main.ts) usa essa opção. As tabelas SQL e componentes antigos podem continuar no código sem estarem publicados.

**Orientação:** para alterações no contrato, atualizar `packages/contracts/src/index.ts`, regenerar `packages/contracts/openapi.json` via `npm run contracts:generate`, atualizar `orbeClient`, e verificar `npm run contracts:check` junto de testes HTTP/browser.

**Limitação da revisão:** não executei requisições live à API DEV/MAIN; esta página descreve a implementação do GitHub em SHA fixo, não comprova o runtime implantado.
