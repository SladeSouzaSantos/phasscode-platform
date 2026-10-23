# ADR 0004 — Identidade única com OIDC e JWT em Node e Java

Estado: decisão aceita; implementação Node da Fase 3 disponível com validação local simulada.
Atualizado em 22/10/2026. Integração Google real e homologação pública pendentes.

## Contexto

O portfólio possui uma interface de login demonstrativa e o proprietário quer OAuth, JWT e
implementações alternativas, incluindo Java/Spring. Na Fase 2, o backend implementava somente
autorização de conversas por token opaco, sem login de usuário ou administração autenticada.

## Decisão

Adotar OAuth 2.0 com OpenID Connect para login, Authorization Code + PKCE `S256` e verificações
de `state`/`nonce`. JWT será o formato dos access tokens da PHASSCODE API, verificados por
assinatura/JWKS, emissor, audience e validade. ID token não substituirá access token.

Google OIDC é o único provedor implementado. O módulo central da PHASSCODE usa PostgreSQL para
identidades/sessões/papéis, `openid-client` para Google e `jose` para emissão RS256 e JWKS público.
Não acrescentar outro serviço de identidade neste incremento. Node e a futura alternativa
Java/Spring respeitarão o mesmo contrato, emissor, audience, fonte de usuários e permissões;
a seleção será interna, sem bancos de usuários próprios por linguagem.

Separar `User`, `ExternalIdentity` (`provider`, `issuer`, `subject`) e credenciais. O vínculo externo
terá unicidade por `(issuer, subject)` e apontará para o ID interno estável. E-mail coincidente não
autorizará união de contas; futuros vínculos exigirão autenticação explícita e prova de controle.

BFF com sessão opaca em cookie `HttpOnly`/`Secure`/`SameSite=Lax`, hash no banco e proteção de
origem/CSRF nas mutações. `openid-client` valida PKCE/state/nonce, com verificação de assinatura
do ID token explicitamente habilitada. Transações de login são vinculadas ao navegador e de uso
único. Os tokens Google são descartados após obter a identidade validada.

JWTs da plataforma duram cinco minutos por padrão e são emitidos somente em memória para uso
interno/futuro encaminhamento; não são persistidos nem expostos por rotas ao navegador. Sessões
duram trinta minutos, até oito horas absolutas por padrão. Renovação rotaciona cookie/CSRF e
revoga a sessão antiga; reutilização na renovação revoga a família. Logout revoga a família.
A API Node verifica `sid` e papéis no banco também para JWT Bearer; isso permite revogação imediata.
Bibliotecas mantidas implementam assinatura e protocolos; não há criptografia própria.

O chat permanecerá público. Autenticação de visitante será opcional; autenticação e autorização
administrativa serão obrigatórias antes de expor operações de aprovação ou dados pessoais da
Fase 3. Credenciais delegadas de Google Calendar serão separadas das credenciais de login.

O desenho admite futuros e-mail/senha com Argon2id, verificação de e-mail, recuperação por token
aleatório com hash, expiração e uso único, limitação de tentativas e proteção contra força bruta;
também GitHub, MFA e passkeys. Essas extensões terão implementação própria posteriormente, sem
stubs ou rotas anunciadas como disponíveis no primeiro incremento Google.

## Consequências

A integração do chat permanece disponível. O frontend já pode desenvolver contra o contrato Node
de sessão/Google OIDC; o uso com conta Google depende da configuração e validação externa.
Login social não atribui administração; a promoção é offline e auditada no banco.
A Fase 4 incluirá
a alternativa Spring Security, com testes de conformidade e estado de sessão compatível ou
migração explícita ao trocar a implementação. Verificação JWT offline no Spring isoladamente não
preserva revogação imediata: consultar sessão/papéis centrais ou `/api/v1/me` autenticado do emissor.

Os endpoints implementados constam do OpenAPI e do
[guia de integração](../api/frontend-integration.md). `AUTH_ENABLED=false` preserva a execução
anterior sem login e recusa autenticação com erro explícito. Detalhes de segurança e evolução constam em
[authentication.md](../architecture/authentication.md).

Referências: [OIDC Core](https://openid.net/specs/openid-connect-core-1_0.html),
[RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html),
[RFC 8725](https://www.rfc-editor.org/rfc/rfc8725.html),
[Spring Resource Server JWT](https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/jwt.html).
