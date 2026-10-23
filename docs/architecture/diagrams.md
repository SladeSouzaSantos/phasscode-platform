# Diagramas

## Incremento executável

```mermaid
flowchart LR
  F[Frontend PHASSCODE existente] -->|HTTPS /api/v1/chat| H[Fastify: validação, CORS e rate limit]
  H --> C[ChatService]
  C --> K[Conhecimento JSON público]
  C --> P[Porta ChatProvider]
  P --> M[Mock identificado]
  P --> L[LangChain + LLM configurável]
  C --> S[Porta ConversationStore]
  S --> PG[(PostgreSQL)]
  S --> MEM[Memória: desenvolvimento]
  H --> R[(Redis: rate limit)]
```

## Chat e privacidade

```mermaid
sequenceDiagram
  participant V as Visitante
  participant H as HTTP
  participant C as ChatService
  participant DB as Conversas
  participant L as Provedor
  V->>H: POST message (+ ID e token se existente)
  H->>C: DTO validado
  C->>DB: Verificar hash, retenção e obter lock
  C->>C: Escopo, conhecimento e histórico limitado
  C->>L: Mensagem + fatos públicos, sem token
  opt Ferramenta de leitura
    L->>C: search_portfolio(query)
    C->>L: Documentos públicos limitados
  end
  L-->>C: Resposta
  C->>DB: Gravar turno e commit
  C-->>V: answer + sources + meta (+ token na criação)
```

## Reuniões: Fase 3 implementada

```mermaid
stateDiagram-v2
  [*] --> PENDING: solicitação validada
  PENDING --> APPROVED: administrador aprova
  PENDING --> REJECTED: administrador recusa
  PENDING --> CANCELLED: cancelamento autorizado
  APPROVED --> CONFIRMED: revalidação e criação Calendar verificadas
  APPROVED --> FAILED: conflito ou falha externa final
  APPROVED --> CANCELLED: antes da confirmação
  FAILED --> APPROVED: retry administrativo idempotente
  FAILED --> CANCELLED: desistência
  CONFIRMED --> CANCELLED: decisão administrativa; cleanup externo pendente
```

`APPROVED` é autorização interna; `CONFIRMED` exige evento externo verificado. `CANCELLED` é a
decisão administrativa; a reserva permanece até o worker verificar a remoção externa. Falha
ambígua também preserva a reserva. Detalhes, outbox e diagrama do fluxo estão em
[meetings.md](meetings.md).
