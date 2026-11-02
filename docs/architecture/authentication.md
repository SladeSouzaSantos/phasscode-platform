# Autenticação do portfólio: JWT, OAuth e implementações Node/Java

Atualizado em 25/10/2026: implementação da Fase 3 em homologação; login exclusivo do administrador.
Google OIDC, sessão BFF, emissão/validação JWT e autorização por papéis têm código e testes
locais no backend Node. A configuração padrão mantém `AUTH_ENABLED=false`.
Os testes usam provedor OIDC HTTP local com assinatura/JWKS reais; login na conta Google e
homologação pública ainda dependem de credenciais e execução externa autorizada. O chat continua
público: `X-Conversation-Token` autoriza somente uma conversa e não autentica um usuário.
Resultados atuais e limitações estão na [auditoria da retomada](../testing/phase3-resume-audit.md).

O frontend público também contém apenas uma demonstração de login: `ChestAccess.tsx` altera estado
React em memória após o envio do formulário, sem conferir credenciais ou chamar um servidor. Isso
foi conferido no [código do componente, revisão 2c8835f](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/2c8835fe744d494ef21978c0f5d801baf7b22149/src/components/ChestAccess.tsx).
A integração do frontend deve substituir essa simulação pelos endpoints de sessão do backend;
o repositório visual não é alterado por esta implementação.

## Identidade única, com mais de uma implementação

O requisito é oferecer autenticação com OAuth e JWT e permitir implementações equivalentes em
Node e Java com Spring. JWT é o formato do access token da API; OAuth 2.0 trata da autorização
delegada. Para login, usar OpenID Connect, que acrescenta identidade verificável ao OAuth.
ID token identifica o usuário para o cliente de login; access token autoriza recursos. A API não
aceita ID token como substituto de seu access token. Essa distinção segue o
[OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html).

Google OIDC é o único provedor de login implementado. O módulo central da PHASSCODE mantém
usuários, identidades e sessões no PostgreSQL e emite access tokens próprios com `jose`, algoritmo
RS256, audience configurada e emissor único. Não foi acrescentado outro serviço de identidade ou
infraestrutura de autenticação. Um token obtido para chamar Google Calendar ou outra API externa
não é, por isso, um token válido para a PHASSCODE API.

Node e Java usarão o mesmo emissor, audience, identidade interna e política de permissões. A
identidade externa será vinculada por `(issuer, subject)` a um único usuário do projeto; e-mail
sozinho não é uma chave segura para unir contas. Papéis serão atribuídos pelo servidor ou emissor
confiável, nunca pelo formulário ou por texto de uma conversa. A admissão Google atual é restrita
ao único administrador configurado; não existe cadastro público por login social.

O modelo lógico separará usuário, formas de login e credenciais:

| Entidade                | Responsabilidade                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `User`                  | ID interno estável, estado da conta e dados de perfil; existe independentemente do provedor de login.                            |
| `ExternalIdentity`      | Vínculo de `userId` com `provider`, `issuer` e `subject`; unicidade por `(issuer, subject)`. Inicialmente haverá somente Google. |
| `UserRole` / permissões | Fonte única de papéis e permissões vinculados ao usuário interno, comum a Node e Java.                                           |
| `Session`               | Sessão vinculada ao usuário, expiração, revogação e controle de renovação.                                                       |
| `PasswordCredential`    | Credencial opcional futura, separada do perfil e das identidades externas; nunca criada automaticamente pelo login Google.       |
| Credenciais MFA/passkey | Fatores futuros associados ao mesmo usuário, com ciclo de cadastro, uso, recuperação e revogação próprio.                        |

As tabelas atuais são `auth_users`, `auth_external_identities`, `auth_user_roles`,
`auth_sessions`, `auth_oauth_transactions` e `auth_role_audit`, na migration `002_auth.sql`.
Credenciais de senha/MFA/passkeys permanecem somente no desenho futuro, sem tabelas ou rotas
fictícias. Não haverá uma base de usuários/papéis para Node e outra para Java.
Uma identidade externa não pode pertencer a dois usuários; vincular ou desvincular formas de login
será uma ação autenticada e auditada, sem deixar o usuário sem um meio válido de acesso.

O gateway selecionará a implementação por configuração interna, preservando URL e contrato do
frontend. Somente a implementação selecionada atenderá o fluxo de login; alternar Node/Java não
criará um segundo cadastro, outro banco de identidade ou dois emissores concorrentes. Sessões,
revogações e vínculos precisam de armazenamento compartilhado e semântica compatível, ou de uma
migração que invalide explicitamente as sessões existentes ao trocar a implementação.

## Fluxo escolhido para o navegador

`AUTH_ADMIN_EMAIL` é obrigatório quando `AUTH_ENABLED=true`. Após validar a identidade OIDC,
o backend exige e-mail verificado pelo Google e comparação exata com esse valor, removendo
espaços nas extremidades e ignorando maiúsculas/minúsculas. Pontos e aliases com `+` não são
normalizados; domínios, nomes parecidos ou e-mails fornecidos por query não concedem acesso.
O valor é configuração do backend, sem endereço de proprietário fixo no código.
Uma conta fora da política é recusada antes de persistir usuário/identidade ou criar sessão.
Clientes JSON recebem `403 AUTH_ADMIN_ONLY` com “Acesso negado. Apenas o administrador tem acesso.”;
uma navegação HTML com transação válida retorna `303` ao portfólio com o código público
`auth_error=AUTH_ADMIN_ONLY`. A verificação de e-mail não
substitui assinatura, issuer, audience, nonce ou subject e não vincula contas por e-mail.

O primeiro login dessa identidade admitida concede `admin` uma única vez por usuário, somente
se não há histórico administrativo em `auth_role_audit`. A concessão e sua auditoria são
transacionais. Um papel revogado ou usuário desabilitado nunca é restabelecido pelo login.
Recuperação exige ação explícita do operador pelo CLI auditado. Revogar pelo CLI registra o veto
mesmo quando o papel já está ausente. O perfil do mesmo `(issuer, subject)` pode ser atualizado
com os dados validados, sem criar vínculo por coincidência de e-mail.

O backend implementa Backend for Frontend (BFF), preferencialmente na mesma origem do portfólio
pelo proxy. `openid-client` conduz Authorization Code com PKCE `S256`, `state` e `nonce`, com
verificação explícita da assinatura do ID token por JWKS (`enableNonRepudiationChecks`). A
transação é vinculada a cookie do navegador e consumida atomicamente antes da troca do código.
Ela expira em dez minutos. O callback é fixo na configuração. `returnTo` opcional no início do
login permite somente caminho relativo de até 1024 bytes UTF-8, com query/hash, na origem exata
de `AUTH_FRONTEND_URL`. URLs absolutas, `//`, barras invertidas e formas inseguras são recusadas.
O destino é vinculado ao cookie inteiro cujo hash integra a transação OAuth, sem migration nova;
alterá-lo no callback ou cookie invalida a prova de navegador. Sem parâmetro, o retorno usa
`AUTH_FRONTEND_URL`. Não há implicit flow ou password grant. O fluxo segue a
[RFC 9700, recomendações para OAuth 2.0](https://www.rfc-editor.org/rfc/rfc9700.html).

O navegador recebe somente cookie de sessão opaco, `HttpOnly`, `Secure`, host-only,
`SameSite=Lax` e caminho `/`. O banco guarda hash SHA-256 do segredo aleatório de 256 bits;
access JWT e tokens Google não são persistidos. A sessão padrão dura trinta minutos, com limite
absoluto de oito horas. HTTPS e cookie Secure são obrigatórios em produção. HTTP/inseguro somente
é permitido por configuração explícita no loopback de desenvolvimento/testes.

`AuthService.issueAccessToken` emite JWT curto apenas em memória, para encaminhamento interno
futuro a outra implementação da API. Nenhuma rota devolve JWT ao frontend. O BFF autentica o cookie
por seu hash e sessão ativa; chamadas Bearer verificam assinatura RS256, `iss`, `aud`, `exp`,
`iat`, `nbf` quando presente e tipo `at+jwt`, usando `jose` e JWKS confiável. ID token Google
não substitui esse access token. O `sid` deve corresponder a uma sessão ativa no banco e os papéis
são lidos novamente da fonte central. URL de chaves recebida do token não é confiada. As
regras de tipos e validação seguem a [RFC 8725, boas práticas JWT](https://www.rfc-editor.org/rfc/rfc8725.html).

Access tokens duram cinco minutos por padrão. O cookie opaco também representa a credencial de
renovação da sessão, sem refresh token Google: `/auth/refresh` serializa a rotação no PostgreSQL,
revoga a sessão anterior e muda cookie e CSRF. Rotação, detecção de reuso e logout usam o mesmo
advisory lock transacional por família, antes de bloquear e alterar suas sessões. Esse mutex vale
entre processos: um refresh concorrente não pode criar uma sessão sucessora ativa depois de a
família ser revogada. Não há chamada de rede durante essa transação.
Reutilizar a credencial antiga na renovação revoga
toda a família. O frontend deve serializar renovações, pois duas tentativas concorrentes com a
mesma credencial são tratadas como reutilização. Logout revoga a família e invalida imediatamente
cookies e JWTs na API Node, que consulta `sid` e papéis no banco. Registros necessários à detecção
de reutilização permanecem até o vencimento absoluto da família.

A chave de assinatura privada PKCS8 fica somente no ambiente do backend. `AUTH_JWT_KEY_ID` é
explícito; `/.well-known/jwks.json` publica apenas chaves RSA públicas de pelo menos 2048 bits.
`AUTH_JWT_PREVIOUS_JWKS` permite sobreposição de chaves públicas antigas durante rotação; IDs
duplicados ou material privado são recusados. Remover uma chave antiga somente após o período de
validade/cache dos consumidores. Não há criptografia ou protocolo próprios.

## Autorização, CORS e CSRF

O chat, o portfólio e a solicitação de reuniões continuam públicos. Login é exclusivo do
administrador e não substitui o token de conversa.
Antes de liberar listagem de solicitações, dados pessoais ou decisões de reuniões, exigir sessão
válida e permissão administrativa. Cada ação fará sua autorização no servidor e produzirá uma
trilha de auditoria sem tokens ou credenciais.

Sessões por cookie exigem proteção CSRF nas operações que alteram estado, inclusive renovação e
logout: `Origin` permitido e `X-CSRF-Token` da sessão. `GET /auth/session` informa o token CSRF,
perfil e expiração, sem expor credencial de acesso. `SameSite` e CORS são controles complementares.
Se frontend e BFF precisarem de origens diferentes, configurar somente origens exatas,
`credentials` e cookies compatíveis com a topologia escolhida; não copiar a configuração atual do
chat em uma implantação sem login. Quando o login está habilitado, o CORS permite credenciais
somente nas origens explícitas. A preferência por mesma origem reduz essa configuração.
O carregador de autenticação recebe a mesma lista normalizada usada pelo CORS HTTP. Uma origem
de frontend fora dessa lista impede a inicialização, inclusive quando `CORS_ORIGINS` foi omitido
e o padrão da API permanece `http://localhost:5173`.

Uma sessão ausente/expirada retorna `401`; identidade fora da política ou sem papel administrativo
retorna `403 AUTH_ADMIN_ONLY`. Isso vale também para cookies e JWTs emitidos antes da restrição ou
de uma revogação: a política e o papel são lidos da fonte central, sem confiar em claims antigos.
`GET /auth/session` retorna estado anônimo sem cookie ou para uma conta não admitida, sem expor
perfil ou CSRF. Com `AUTH_ENABLED=false`, os endpoints de autenticação
recusam a operação com `404 AUTH_DISABLED`. O `404` de conversa continua
sem revelar se o problema é ID, token ou expiração.

O callback de uma identidade validada e recusada pela política limpa cookies de transação e sessão.
Um callback inválido sem prova de state/navegador não encerra uma sessão administrativa válida.
Em navegação HTML, falhas posteriores à validação e consumo da transação retornam `303` ao destino
vinculado com um `auth_error` fixo: `AUTH_ADMIN_ONLY`, `AUTH_REQUIRED`, `AUTH_LOGIN_FAILED`,
`AUTH_PROVIDER_UNAVAILABLE` ou `AUTH_UNAVAILABLE`. Não são transportados tokens, código OAuth,
e-mail ou mensagens do provedor. Respostas API com `Accept: application/json` conservam seu status
HTTP/JSON; state inválido ou replay não permite redirecionar. O sucesso continua usando `302`.
Refresh recusado por `AUTH_ADMIN_ONLY`
também limpa a sessão do navegador. Logout continua permitindo revogar uma família antiga com
Origin/CSRF válidos, mesmo quando a conta deixou de atender à política de admissão.

## Google primeiro, extensões posteriores

O primeiro incremento implementa somente Google OIDC, sessão, JWT e autorização. Google deve
confirmar `email_verified`, e o e-mail autorizado só limita admissão: ele nunca une contas.
A política de concessão inicial e revogação administrativa permanece auditada no banco.
Não criar endpoints fictícios, botões ativos ou adaptadores vazios de e-mail/senha,
GitHub, MFA ou passkeys para apresentar esses recursos como disponíveis.

As extensões aprovadas para o desenho futuro são:

- **E-mail/senha:** credencial independente com Argon2id, salt individual e parâmetros versionados
  por biblioteca mantida; calibrar custo de memória/tempo na implantação e permitir atualização
  do hash no login. A função é especificada na [RFC 9106](https://www.rfc-editor.org/rfc/rfc9106.html).
  Implementar verificação de e-mail, limitação por conta e origem, proteção contra força bruta e
  mensagens que evitem enumerar contas. Cadastro e recuperação terão respostas equivalentes
  quando a conta existir ou não. Ver [OWASP Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html).
- **Recuperação de senha:** token aleatório de uso único, curto prazo de expiração e somente hash
  no armazenamento; consumo atômico, invalidação após uso e tratamento de sessões existentes.
  O reset não fará login automaticamente. A mesma disciplina de uso único/expiração valerá para
  verificação de e-mail. Ver [OWASP Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
- **GitHub e vinculação de contas:** adicionar como identidade externa no mesmo usuário, exigindo
  sessão válida, autenticação recente e prova de controle do novo provedor. Não unir contas só
  porque os e-mails coincidem. O adaptador ou a federação resolverá a identidade segundo o
  protocolo do provedor; não presumir que todo provedor OAuth implementa OIDC.
- **MFA e passkeys:** evoluir no mesmo serviço de identidade, com requisitos de fator/recuperação
  definidos para ações sensíveis. Passkeys usarão bibliotecas WebAuthn/FIDO e validação de
  challenge, origem e RP ID, conforme [WebAuthn](https://www.w3.org/TR/webauthn-3/).
  Login social sozinho não prova que a sessão satisfaz uma política MFA.

## Implementação por fase

| Marco                     | Entrega                                                                                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fase 2                    | Chat público, token de conversa e guia de integração; contrato preservado.                                                                           |
| Primeira tarefa da Fase 3 | Google OIDC em Node/BFF, identidade central PostgreSQL, sessão, JWT, papéis e CSRF implementados; validação com Google real e homologação pendentes. |
| Fase 4                    | Implementar o mesmo contrato com Java/Spring Boot, validar conformidade e selecionar a implementação internamente.                                   |

E-mail/senha, GitHub, MFA e passkeys serão incrementos posteriores à entrega Google, com aceite
e implementação próprios; a arquitetura preparada não significa que essas formas já funcionam.

Na alternativa Java, Spring Security OAuth2 Client/OAuth2 Login tratará o fluxo OIDC; OAuth2
Resource Server validará JWT nas APIs. Configurar explicitamente audience e mapeamento de papéis
para manter as mesmas regras do Node. A documentação do Spring descreve
[OAuth2 Client](https://docs.spring.io/spring-security/reference/servlet/oauth2/client/index.html),
[OAuth2 Login](https://docs.spring.io/spring-security/reference/servlet/oauth2/login/index.html) e
[Resource Server JWT](https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/jwt.html).
Não criar criptografia ou um protocolo próprio para demonstrar as duas linguagens.

Validar somente a assinatura offline no Spring não mantém a revogação imediata da API Node.
A alternativa Java precisará consultar o estado central de sessão/papéis pelo `sid` ou delegar a
validação a uma chamada autenticada e confiável ao `/api/v1/me`. O emissor, audience, usuários e
permissões permanecem os mesmos; a integração Java ainda não está implementada.

Os testes de conformidade cobrirão sessão válida, logout, renovação concorrente, CSRF,
`state`/`nonce` incorretos, PKCE inválido, JWT expirado/assinatura inválida/issuer ou audience
incorretos, rotação JWKS e proibição de acesso administrativo sem papel. A mesma matriz deve
passar nas duas implementações.

## Google Calendar é uma autorização separada

Login com Google e permissão de acesso ao calendário têm finalidades e escopos diferentes.
Autorizar calendários do proprietário será uma integração administrativa própria, com consentimento,
escopos mínimos e credenciais armazenadas no backend. Visitantes não precisam conceder acesso ao
seu Google Calendar para conversar ou solicitar uma reunião. Revogar a integração do calendário
não deve transformar uma sessão de login em uma credencial de calendário, ou vice-versa.

O esboço de rotas e a divisão entre integração disponível e futura estão no
[guia do frontend](../api/frontend-integration.md). A decisão está registrada na
[ADR 0004](../adr/0004-authentication.md).
