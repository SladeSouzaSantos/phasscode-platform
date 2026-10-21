# Autenticação do portfólio: JWT, OAuth e implementações Node/Java

Estado em 21/10/2026: arquitetura planejada para a Fase 3; nenhuma rota de login, sessão, emissão
de JWT ou administração está implementada. A Fase 2 entrega um chat público. Seu
`X-Conversation-Token` autoriza somente uma conversa e não autentica um usuário.

O frontend público também contém apenas uma demonstração de login: `ChestAccess.tsx` altera estado
React em memória após o envio do formulário, sem conferir credenciais ou chamar um servidor. Isso
foi conferido no [código do componente, revisão 2c8835f](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/2c8835fe744d494ef21978c0f5d801baf7b22149/src/components/ChestAccess.tsx).
A futura integração deve substituir essa simulação por uma sessão verificada no backend.

## Identidade única, com mais de uma implementação

O requisito é oferecer autenticação com OAuth e JWT e permitir implementações equivalentes em
Node e Java com Spring. JWT é o formato do access token da API; OAuth 2.0 trata da autorização
delegada. Para login, usar OpenID Connect, que acrescenta identidade verificável ao OAuth.
ID token identifica o usuário para o cliente de login; access token autoriza recursos. A API não
aceitará ID token como substituto de seu access token. Essa distinção segue o
[OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html).

Google OIDC será o primeiro login implementado, como primeira tarefa da Fase 3. Adotar um emissor
de identidade do projeto que suporte essa federação e emita access tokens JWT destinados à
audience da PHASSCODE API. O produto/serviço central de identidade ainda será escolhido durante
essa implementação. Um token obtido para chamar Google Calendar ou outra API externa não é, por
isso, um token válido para a PHASSCODE API.

Node e Java usarão o mesmo emissor, audience, identidade interna e política de permissões. A
identidade externa será vinculada por `(issuer, subject)` a um único usuário do projeto; e-mail
sozinho não é uma chave segura para unir contas. Papéis serão atribuídos pelo servidor ou emissor
confiável, nunca pelo formulário ou por texto de uma conversa. Login social não concede `admin`.

O modelo lógico separará usuário, formas de login e credenciais:

| Entidade                | Responsabilidade                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `User`                  | ID interno estável, estado da conta e dados de perfil; existe independentemente do provedor de login.                            |
| `ExternalIdentity`      | Vínculo de `userId` com `provider`, `issuer` e `subject`; unicidade por `(issuer, subject)`. Inicialmente haverá somente Google. |
| `UserRole` / permissões | Fonte única de papéis e permissões vinculados ao usuário interno, comum a Node e Java.                                           |
| `Session`               | Sessão vinculada ao usuário, expiração, revogação e controle de renovação.                                                       |
| `PasswordCredential`    | Credencial opcional futura, separada do perfil e das identidades externas; nunca criada automaticamente pelo login Google.       |
| Credenciais MFA/passkey | Fatores futuros associados ao mesmo usuário, com ciclo de cadastro, uso, recuperação e revogação próprio.                        |

Esse modelo é uma separação de responsabilidades, não migrations já criadas. Se o serviço de
identidade administrar senhas ou fatores, esses segredos permanecerão nele; a aplicação manterá
apenas os vínculos necessários. Não haverá uma base de usuários/papéis para Node e outra para Java.
Uma identidade externa não pode pertencer a dois usuários; vincular ou desvincular formas de login
será uma ação autenticada e auditada, sem deixar o usuário sem um meio válido de acesso.

O gateway selecionará a implementação por configuração interna, preservando URL e contrato do
frontend. Somente a implementação selecionada atenderá o fluxo de login; alternar Node/Java não
criará um segundo cadastro, outro banco de identidade ou dois emissores concorrentes. Sessões,
revogações e vínculos precisam de armazenamento compartilhado e semântica compatível, ou de uma
migração que invalide explicitamente as sessões existentes ao trocar a implementação.

## Fluxo escolhido para o navegador

Preferir um Backend for Frontend (BFF) servido na mesma origem do portfólio pelo proxy. O backend
conduzirá Authorization Code com PKCE `S256`, validará `state` e `nonce` e trocará o código no
servidor. Redirect URIs e destinos de retorno terão lista explícita. Código, verifier e estado
serão de uso único e curta duração. Não usar implicit flow nem password grant. O fluxo segue a
[RFC 9700, recomendações para OAuth 2.0](https://www.rfc-editor.org/rfc/rfc9700.html).

O BFF guardará access/refresh tokens no servidor e entregará ao navegador uma sessão opaca em
cookie `HttpOnly`, `Secure`, host-only e `SameSite=Lax` quando compatível com o retorno do login.
O cookie terá expiração e caminho definidos; HTTPS será obrigatório no ambiente publicado. O
frontend não guardará access/refresh tokens em `localStorage`. Uma exceção local para HTTP de
desenvolvimento deve ser explícita e não pode chegar à configuração de produção.

O BFF enviará o access token JWT às APIs por `Authorization: Bearer`. A validação usará biblioteca
mantida, chaves públicas JWKS de um emissor configurado, algoritmos permitidos e conferência de
assinatura, `iss`, `aud`, `exp`, `nbf` quando presente e tipo/finalidade do token. URL de chaves
recebida do próprio token não será confiada. Decodificar o payload não valida a identidade. As
regras de tipos e validação seguem a [RFC 8725, boas práticas JWT](https://www.rfc-editor.org/rfc/rfc8725.html).

Access tokens terão validade curta, inicialmente cinco a dez minutos, ajustável após medir a
operação. Renovação será serializada por sessão, com rotação de refresh token e detecção de
reutilização quando suportadas pelo emissor. Logout invalidará a sessão e solicitará revogação do
refresh token. Um JWT já emitido pode continuar válido até expirar; operações administrativas que
exijam revogação imediata também consultarão o estado da sessão/identidade. Segredos e refresh
tokens serão protegidos no servidor, com biblioteca e gerenciamento de chaves existentes.

## Autorização, CORS e CSRF

O chat continuará público: login do visitante é opcional e não substitui o token de conversa.
Antes de liberar listagem de solicitações, dados pessoais ou decisões de reuniões, exigir sessão
válida e permissão administrativa. Cada ação fará sua autorização no servidor e produzirá uma
trilha de auditoria sem tokens ou credenciais.

Sessões por cookie exigirão proteção CSRF em operações que alteram estado, inclusive renovação e
logout, com token CSRF e verificação de origem. `SameSite` e CORS são controles complementares.
Se frontend e BFF precisarem de origens diferentes, configurar somente origens exatas,
`credentials` e cookies compatíveis com a topologia escolhida; não copiar a configuração atual do
chat, que usa `credentials: false`. A preferência por mesma origem reduz essa configuração.

Uma sessão autenticada ausente/expirada retornará `401`; identidade sem permissão retornará `403`.
Esses códigos pertencem ao futuro contrato de autenticação. O `404` de conversa atual continuará
sem revelar se o problema é ID, token ou expiração.

## Google primeiro, extensões posteriores

O primeiro incremento de autenticação implementará somente Google OIDC, sessão, JWT e
autorização. Não criar endpoints fictícios, botões ativos ou adaptadores vazios de e-mail/senha,
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

| Marco                     | Entrega                                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fase 2                    | Chat público, token de conversa e guia de integração; login permanece planejado.                                                                        |
| Primeira tarefa da Fase 3 | Implementar Google OIDC em Node/BFF com identidade única, sessão, JWT, papéis, CSRF e testes; definir o serviço emissor antes de liberar administração. |
| Fase 4                    | Implementar o mesmo contrato com Java/Spring Boot, validar conformidade e selecionar a implementação internamente.                                      |

E-mail/senha, GitHub, MFA e passkeys serão incrementos posteriores à entrega Google, com aceite
e implementação próprios; a arquitetura preparada não significa que essas formas já funcionam.

Na alternativa Java, Spring Security OAuth2 Client/OAuth2 Login tratará o fluxo OIDC; OAuth2
Resource Server validará JWT nas APIs. Configurar explicitamente audience e mapeamento de papéis
para manter as mesmas regras do Node. A documentação do Spring descreve
[OAuth2 Client](https://docs.spring.io/spring-security/reference/servlet/oauth2/client/index.html),
[OAuth2 Login](https://docs.spring.io/spring-security/reference/servlet/oauth2/login/index.html) e
[Resource Server JWT](https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/jwt.html).
Não criar criptografia ou um protocolo próprio para demonstrar as duas linguagens.

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
