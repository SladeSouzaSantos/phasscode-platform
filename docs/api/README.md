# API v1

A fonte de verdade são os schemas Zod em `packages/contracts/src/index.ts`. O arquivo
`packages/contracts/openapi.json` é gerado e versionado. Alterou schema: execute
`npm run contracts:generate`. `contracts:check` acusa divergências; os testes validam resposta HTTP
usando o JSON Schema do contrato e Ajv 2020-12.

`GET /health` é liveness. `GET /ready` consulta as dependências configuradas e a migration inicial,
além das migrations 002–005 quando autenticação ou reuniões estão habilitadas;
503 indica dependência indisponível. No modo memória, PostgreSQL/Redis desabilitados são declarados
como tal. Readiness não chama LLM pago e não comprova validade da chave externa.

`POST /api/v1/chat` recebe `message` e `conversationId` opcional. O servidor cria IDs. Na primeira
resposta emite `conversationToken`; nas seguintes exige `X-Conversation-Token`. Token ausente,
inválido, ID inexistente ou conversa expirada têm o mesmo erro 404. Um token perdido exige nova
conversa. Não envie tokens em query string e não use localStorage no exemplo de integração.

A resposta contém `answer`, `sources` e `meta` (`provider`, `simulated`, `promptVersion`). Fontes são
selecionadas pelo servidor, nunca IDs confiados ao texto do modelo. Conhecimento insuficiente não
autoriza inventar respostas. Nenhum provider/model/baseURL pode ser escolhido no DTO do visitante.

O cliente publicado continua sem login e sem novos campos obrigatórios. Ações de reuniões exigem
`X-Orbe-Capabilities: meetings-v1` em cada chamada e reuniões habilitadas no servidor. Sem o header,
a resposta não contém `actions` e as ferramentas de agenda não são disponibilizadas ao modelo.

HTTP: 400 validação, 403 origem não permitida, 404 acesso/conversa, 409 turno simultâneo, 413 corpo
maior que 8 KiB, 415 mídia não suportada, 429 rate limit, 502 falha do LLM, 504 timeout, 503 capacidade
local ou readiness e 500 falha interna. Erros não retornam stack ou detalhes do provedor. O header
`X-Correlation-Id` é gerado no servidor. Respostas têm `Cache-Control: no-store`.

Paginação administrativa, idempotência de reuniões, autenticação por papéis e ações do Orbe estão
implementadas localmente na Fase 3, que permanece em andamento. Veja o [guia do frontend](phase3-integration.md)
e a [auditoria da retomada](../testing/phase3-resume-audit.md). As rotas administrativas
exigem autenticação/admin, com Origin/CSRF nas escritas por cookie. O
contrato de chat será usado na implementação Java e em sua futura suíte de conformidade.

Referências da implementação: [function calling OpenAI](https://developers.openai.com/api/docs/guides/function-calling),
[ChatOpenAI](https://reference.langchain.com/javascript/langchain-openai/ChatOpenAI) e
[ferramentas LangChain](https://reference.langchain.com/javascript/langchain-core/language_models/chat_models/BaseChatModel/bindTools).
