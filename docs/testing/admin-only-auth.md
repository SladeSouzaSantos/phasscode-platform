# Login Google exclusivo do administrador

Implementação local de 25/10/2026 na branch `dev`, partindo de `440255c`.

## Política de acesso

`AUTH_ADMIN_EMAIL` é obrigatório quando `AUTH_ENABLED=true`. O endereço é configurado somente
no ambiente privado do backend. O template permanece vazio; Docker Compose e préflight já
repassam e validam a variável. O `.env` existente não foi alterado.

O callback Google valida assinatura/JWKS, issuer, audience, expiração, PKCE, state, nonce e
`email_verified === true`. O endereço completo precisa ser válido e corresponder à configuração,
ignorando maiúsculas e espaços nas extremidades. Não são removidos pontos ou aliases `+`.
Outra conta é recusada antes de criar cadastro ou sessão. Clientes com
`Accept: application/json` recebem `403 AUTH_ADMIN_ONLY` com a mensagem:

> Acesso negado. Apenas o administrador tem acesso.

Essa recusa acontece antes de criar usuário, identidade ou sessão. E-mail/papel fornecidos em
query, corpo ou JWT não substituem a política do servidor. E-mail é critério de admissão; o vínculo
continua sendo `(issuer, subject)`, sem unir contas por coincidência de endereço, conforme o
[modelo de identidade do Google OIDC](https://developers.google.com/identity/openid-connect/openid-connect).

## Retorno ao portfólio

O início do login admite `returnTo` opcional como caminho relativo, com query/hash, de até 1024
bytes UTF-8. O backend resolve o caminho exclusivamente na origem de `AUTH_FRONTEND_URL`, recusa
URLs absolutas/externas, `//`, barras invertidas e formas inseguras e vincula o destino ao cookie
inteiro cujo hash é armazenado na transação OAuth. Não foi necessária migration. Sem parâmetro,
o retorno usa o endereço fixo configurado.
Um `auth_error` anterior é removido antes do sucesso ou da inclusão do código de falha atual.

No sucesso, o callback continua retornando `302`. Em navegação HTML, uma falha depois de validar
state e consumir a transação retorna `303` ao destino vinculado, preservando path/query/hash e
acrescentando somente um código público `auth_error`: `AUTH_ADMIN_ONLY`, `AUTH_REQUIRED`,
`AUTH_LOGIN_FAILED`, `AUTH_PROVIDER_UNAVAILABLE` ou `AUTH_UNAVAILABLE`. Não são enviados tokens,
código OAuth, e-mail ou mensagens do provedor. `Accept: application/json` mantém status HTTP/JSON
de erro. Callback sem state/prova de navegador válida ou replay não redireciona e não limpa
uma sessão administrativa existente.
`Accept: application/json` tem precedência sobre a indicação de navegação; sem ela, o servidor
reconhece `Sec-Fetch-Mode: navigate` ou `Accept: text/html` quando não há Sec-Fetch-Mode. Sem esses
indicadores mantém JSON. As respostas do callback usam `Cache-Control: no-store` e
`Referrer-Policy: no-referrer`, evitando cache e envio da URL com código OAuth no Referer.

A UI do proprietário deve reconhecer `AUTH_ADMIN_ONLY`, apresentar a mensagem constante acima
como texto e remover o parâmetro com `history.replaceState`, sem iniciar login automaticamente.
O [guia de integração](../api/phase3-integration.md) inclui exemplos de `URLSearchParams`, leitura
segura do código e preservação da página do portfólio. O frontend não foi modificado neste trabalho.

## Provisionamento e sessões

A conta admitida recebe o papel `admin` no primeiro provisionamento, com auditoria na mesma
transação PostgreSQL. O bloqueio de `auth_users` é compartilhado com o CLI; as consultas seguintes
leem papéis e histórico após adquirir esse bloqueio. Ausência de histórico administrativo é
requisito para a concessão inicial. Papel já revogado e usuário desabilitado não são promovidos
novamente. O CLI registra inclusive uma revogação quando o papel já está ausente, impedindo uma
concessão inicial posterior que contradiga esse veto. A recuperação exige `auth:admin -- grant`.

Cookies e JWTs de serviço consultam e-mail, estado e papéis atuais da fonte central. Sessões
fora da política ou sem `admin` não dão acesso a perfil, administração, refresh ou emissão de JWT.
`GET /api/v1/auth/session` retorna estado anônimo e limpa o cookie nesses casos. O callback de uma
identidade validada recusada pela política também limpa a sessão do navegador. Um callback inválido
sem prova de state/navegador não pode encerrar uma sessão administrativa válida.

Rotação, detecção de reuso e mutex por família continuam no store. Logout permanece disponível para
revogar a própria família antiga com Origin/CSRF válidos. JWTs continuam internos ao backend;
nenhum token Google é persistido. Portfólio, chat e fluxo público de pedidos de reunião permanecem
públicos. A autorização do Google Calendar continua independente do login.

## Validação inicial da política administrativa

- `npm run check`: lint, Prettier, typecheck, contratos OpenAPI, **473 testes em 32 arquivos** e
  build aprovados.
- `npm run test:infrastructure`: **29 testes aprovados**, verificando Compose e scripts com
  valores sintéticos, sem daemon ou bancos reais.
- `npm run test:browser`: **3 testes aprovados** com Chromium real local. Cobrem conta autorizada,
  recusa de outra conta Google sem sessão, chat público, cookies, OIDC, CORS, CSRF, refresh/logout
  e bloqueio do proxy para porta loopback não autorizada.
- `npm run smoke`: aprovado com o script original, verificando aplicação compilada, `/health`,
  `/ready` e dois turnos de `POST /api/v1/chat` em memória/mock.

São **505 testes únicos**; as execuções direcionadas já estão incluídas nesse total. A suíte local
de auth verifica ainda endereços parecidos, aliases, e-mail não verificado, query adulterada,
provisionamento de usuário existente, concessão única, veto, revogação, mudança do e-mail configurado
e recusa de cookies/JWTs anteriores. O store tem testes de rollback/auditoria com comandos simulados;
eles verificam ordenação e atomicidade solicitada, sem afirmar que executam SQL real.

Duas tentativas iniciais do smoke excederam a janela existente de seis segundos. Uma sondagem
isolada atingiu `/health` em 1.958 ms e `/ready` em 1.962 ms; o script original passou tanto em
ambiente sintético mínimo quanto na repetição de `npm run smoke` sem perfil de shell. Nenhum
timeout, assertiva ou código do smoke foi alterado. A causa dos dois timeouts não foi determinada.

Foram preparadas cinco regressões PostgreSQL para concorrência de concessão, auditoria única,
perfil por issuer/subject, veto/desabilitação e revogação concorrente. A suíte PostgreSQL e o fluxo
integrado com worker não foram executados nesta revisão. Não houve conexão com bancos existentes,
execução de migrations, acesso às contas Google/Calendar/SMTP/Telegram, commit, push, merge ou deploy.
O frontend continua com o proprietário; contratos e instruções já descrevem `AUTH_ADMIN_ONLY`.

## Revalidação do retorno ao frontend

Após a correção de navegação, em 25/10/2026:

- `npm run check`: lint, Prettier, typecheck, contratos OpenAPI, **543 testes em 34 arquivos** e
  build aprovados.
- `npm run test:browser`: **4 testes aprovados** com Chromium real local. A recusa volta ao caminho,
  query e fragmento originais com `303` e `auth_error=AUTH_ADMIN_ONLY`, sem criar sessão. O login
  autorizado preserva o mesmo destino; OIDC, cookies, CORS, CSRF, refresh/logout e bloqueio do proxy
  continuam passando.
- `npm run smoke`: aprovado com a aplicação compilada, `/health`, `/ready` e dois turnos de
  `POST /api/v1/chat` em memória/mock.

São **547 testes únicos nesta revalidação**. As novas regressões verificam adulteração do cookie
completo, destinos externos/inseguros, callbacks sem prova, replay, cancelamento no provedor,
nonce inválido, prioridade de JSON e ausência de dados privados no retorno. As respostas locais
do proxy podem preservar fragmentos de `Location` apenas depois de validar seu destino na lista
explícita; fragmentos em destinos de requisição HTTP continuam bloqueados. Nenhum redirecionamento
é seguido automaticamente pelo proxy.

Os 29 testes de infraestrutura registrados acima pertencem à validação inicial e não foram
reexecutados neste incremento. As limitações de homologação externa e PostgreSQL permanecem:
não houve conexão com bancos existentes, migrations, acesso aos provedores reais, alteração do
`.env`, commit, push, merge ou deploy. O frontend do proprietário precisa enviar `returnTo` no
início do login para preservar a página exata; sem ele o retorno usa `AUTH_FRONTEND_URL`.
