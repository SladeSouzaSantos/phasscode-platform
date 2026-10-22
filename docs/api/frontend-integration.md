# Integração com o frontend do portfólio

O chat da Fase 2 já tem contrato implementado para iniciar a integração local do Orbe. A avaliação
de encerramento da fase e suas evidências ficam em [PROGRESS.md](../PROGRESS.md). Login real,
agendamento e administração ainda não têm endpoints disponíveis. Este trabalho não altera o
repositório do frontend nem publica o backend.

## Chat disponível agora

Base local: `http://localhost:3000`. Contrato: `GET /api/v1/openapi.json`; Swagger: `/docs/`.
O frontend usa somente a URL pública do backend; chaves LLM e URLs internas não pertencem ao bundle.
Se usar Vite, uma variável como `VITE_API_BASE_URL=http://localhost:3000` pode conter essa URL,
sem credenciais.

Criar conversa com `POST /api/v1/chat` e `Content-Type: application/json`:

```json
{ "message": "Quais tecnologias usa o portfólio?" }
```

A resposta contém os campos abaixo. O token ilustrativo deve ser substituído pelo valor real
emitido pelo servidor, que só é devolvido na criação:

```json
{
  "conversationId": "d0ff27c4-13ee-4ea5-8c4b-021471d77b22",
  "conversationToken": "TOKEN_OPACO_EMITIDO_PELO_SERVIDOR",
  "answer": "Resposta fundamentada na base pública.",
  "sources": [],
  "meta": {
    "provider": "openai-compatible",
    "simulated": false,
    "promptVersion": "orbe-v3"
  }
}
```

Para continuar, envie o `conversationId` no JSON e `X-Conversation-Token` no header:

```http
POST /api/v1/chat
Content-Type: application/json
X-Conversation-Token: TOKEN_OPACO_EMITIDO_PELO_SERVIDOR

{
  "conversationId": "d0ff27c4-13ee-4ea5-8c4b-021471d77b22",
  "message": "E quais projetos usam essas tecnologias?"
}
```

Guarde ID/token apenas na memória da instância do cliente. Recarregar a página inicia uma nova
conversa; não use query string, logs ou `localStorage` para persistir o token. O token de conversa
não é JWT nem login do portfólio. Não envie `Authorization` para o chat atual.

O [cliente TypeScript de exemplo](../../examples/frontend-client.ts) implementa envio, continuidade,
cancelamento por `AbortSignal` e reset. Seu import de tipos aponta para este monorepo: em outro
repositório, gere tipos do OpenAPI ou copie os tipos equivalentes do contrato ao adaptar o cliente.
Ele não inclui tratamento visual completo de cada código de erro; os comportamentos abaixo devem
ser implementados no frontend.

## Comportamento da interface

- Mostrar loading e bloquear envios simultâneos na mesma conversa; a API ainda não faz streaming.
- Exibir `answer` como texto ou Markdown sanitizado, sem HTML arbitrário. Mostrar aviso de
  simulação quando `meta.simulated` for `true`.
- Exibir `sources` como referências: cada item contém `type`, `id`, `title` e `url` opcional.
  Criar links somente para URLs HTTP(S) seguras. Fontes representam documentos consultados; não
  significam que cada frase foi validada automaticamente.
- Limitar a mensagem a 2000 caracteres. O corpo HTTP inteiro admite até 8192 bytes.
- Oferecer “Nova conversa”, apagando o par ID/token. Não prometer recuperação de um token perdido.
- Explicar que mensagens são processadas pelo provedor de IA configurado, usando o aviso de
  privacidade do portfólio antes da abertura pública.

Erros usam `{ "error": { "code": "...", "message": "...", "correlationId": "..." } }`.
O header `X-Correlation-Id` também permite informar uma referência de suporte sem mostrar detalhes
internos. O mesmo `404` protege token incorreto, conversa inexistente e conversa expirada.

| HTTP                       | Ação no frontend                                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `400`, `413`, `415`        | Corrigir mensagem, tamanho ou `Content-Type`; não repetir o mesmo pedido automaticamente.                                                     |
| `403`                      | Conferir origem autorizada no backend; a configuração CORS precisa corresponder à URL do frontend.                                            |
| `404`                      | Limpar ID/token, informar que a conversa não está disponível e permitir iniciar outra. Preservar o texto digitado para novo envio consciente. |
| `409`                      | Aguardar o turno atual antes de permitir outro envio.                                                                                         |
| `429`                      | Respeitar `Retry-After` e liberar nova tentativa manual após a espera; pode ser limite por IP ou orçamento global da LLM.                     |
| `502`, `503`, `504`, `500` | Manter o texto, encerrar loading e mostrar falha com correlação; permitir nova tentativa.                                                     |

Não repetir silenciosamente uma mensagem após timeout de rede: a solicitação anterior pode ter
sido concluída e o chat ainda não oferece chave de idempotência. Cancelar a espera no navegador
também não prova que o servidor cancelou ou desfez o processamento.

`LLM_BUDGET_EXHAUSTED` identifica o 429 global. `LLM_BUDGET_UNAVAILABLE`,
`CHAT_CAPACITY_REACHED`, `DB_UNAVAILABLE` e `RATE_LIMIT_UNAVAILABLE` são 503 transitórios; os três últimos sugerem
`Retry-After: 1`. Preservar o texto digitado, encerrar loading e permitir tentativa consciente.
Mensagens aceitas podem conter dados pessoais enviados espontaneamente: o aviso deve informar
persistência temporária e envio ao provedor externo, desencorajar dados sensíveis e indicar contato
para exclusão. Não há anonimização automática garantida.

## CORS e ambiente

O backend já permite `http://localhost:5173` por padrão. Para outra porta ou domínio, configure
`CORS_ORIGINS` no ambiente do backend com origens exatas separadas por vírgula, sem caminho ou
wildcard. `http://127.0.0.1:5173` e `http://localhost:5173` são origens diferentes.

O preflight permite `Content-Type` e `X-Conversation-Token`; expõe `X-Correlation-Id` e `Retry-After`.
O chat atual usa `credentials: false`: o cliente não precisa de `credentials: 'include'`. Login
por cookie precisará da configuração própria descrita na arquitetura; apenas acrescentar esse
parâmetro no frontend não implementa autenticação.

No Docker, após mudar variáveis, recrie a API com `docker compose up -d --force-recreate api`.
A publicação de uma URL HTTPS e a configuração do proxy são um marco posterior; este guia já
permite desenvolvimento local com o frontend existente.

## Login futuro: contrato proposto, não implementado

O login visual atual será substituído quando a autenticação da Fase 3 estiver implementada.
Sua primeira tarefa será Google OIDC, usando OAuth 2.0 com access tokens JWT e uma sessão de
navegador administrada pelo BFF. Esse primeiro incremento disponibilizará apenas login Google.
Node e Java/Spring atenderão o mesmo contrato externo; o frontend não escolherá a linguagem e
não terá que manter dois logins. Papéis retornados à interface servem para apresentação; toda
permissão continua sendo verificada no backend.

Os nomes abaixo são uma proposta a versionar no OpenAPI antes da implementação; inicialmente,
`{provider}` aceitará somente `google`:

| Método | Rota proposta                      | Comportamento esperado                                                                                   |
| ------ | ---------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/v1/auth/login/{provider}`    | Iniciar redirecionamento ao provedor permitido; destino de retorno validado.                             |
| `GET`  | `/api/v1/auth/callback/{provider}` | Receber retorno OIDC, validar fluxo e criar sessão por cookie; sem tokens na URL do frontend.            |
| `GET`  | `/api/v1/auth/session`             | Informar `authenticated`, identidade resumida e papéis; sem access/refresh token na resposta.            |
| `POST` | `/api/v1/auth/refresh`             | Renovar sessão/tokens no servidor, com proteção CSRF; pode ser dispensado se o BFF renovar internamente. |
| `POST` | `/api/v1/auth/logout`              | Invalidar sessão/revogar renovação, remover cookie e retornar `204`; exigir proteção CSRF.               |
| `GET`  | `/api/v1/me`                       | Consultar perfil autenticado; `401` sem sessão válida.                                                   |

`session` pode retornar `200` com `{ "authenticated": false, "user": null }` para mostrar a tela
anônima. Em sessão válida, `user` terá um ID interno estável, nome de exibição e papéis. Os DTOs,
o mecanismo de obtenção do token CSRF e o esquema de erros ainda serão registrados no contrato.
Nenhuma dessas rotas está no OpenAPI atual.

O provedor inicial está definido: Google OIDC. O serviço emissor central de identidade será
escolhido na implementação da primeira tarefa da Fase 3. `User`, identidades externas e credenciais
serão entidades separadas, com uma única fonte de usuários/papéis/permissões para Node e Java.
Futuras opções de e-mail/senha, GitHub, MFA e passkeys usarão o mesmo usuário interno, sem junção
automática por e-mail. Não integrar formulários/botões dessas opções antes dos respectivos
contratos e implementações; elas não serão simuladas como funcionalidades prontas.

Login do visitante continuará opcional para o chat; administração de reuniões exigirá identidade e
papel permitido. Google Calendar terá consentimento e tokens próprios no backend, separados do
login social. O usuário será avisado novamente quando os contratos de autenticação e reuniões
estiverem prontos para integrar.

Decisões e referências: [arquitetura de autenticação](../architecture/authentication.md) e
[ADR 0004](../adr/0004-authentication.md).
