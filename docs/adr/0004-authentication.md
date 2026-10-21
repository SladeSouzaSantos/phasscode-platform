# ADR 0004 — Identidade única com OIDC e JWT em Node e Java

Estado: decisão de arquitetura aceita; implementação pendente. Data: 21/10/2026.

## Contexto

O portfólio possui uma interface de login demonstrativa e o proprietário quer OAuth, JWT e
implementações alternativas, incluindo Java/Spring. Na Fase 2, o backend só implementa autorização
de conversas por token opaco. Não há login de usuário ou administração autenticada.

## Decisão

Adotar OAuth 2.0 com OpenID Connect para login, Authorization Code + PKCE `S256` e verificações
de `state`/`nonce`. JWT será o formato dos access tokens da PHASSCODE API, verificados por
assinatura/JWKS, emissor, audience e validade. ID token não substituirá access token.

Google OIDC será a primeira tarefa da Fase 3 e o único provedor no primeiro incremento de
autenticação. Um emissor comum, cujo produto/serviço será escolhido na implementação, manterá a
identidade das duas implementações. Node e Java/Spring respeitarão o mesmo contrato, audience,
fonte de usuários e permissões; a seleção será interna ao gateway, sem bancos de usuários próprios
por linguagem.

Separar `User`, `ExternalIdentity` (`provider`, `issuer`, `subject`) e credenciais. O vínculo externo
terá unicidade por `(issuer, subject)` e apontará para o ID interno estável. E-mail coincidente não
autorizará união de contas; futuros vínculos exigirão autenticação explícita e prova de controle.

Preferir BFF na mesma origem do portfólio, sessão opaca em cookie `HttpOnly`/`Secure`, proteção
CSRF e tokens OAuth no servidor. Renovação, rotação/revogação e logout serão parte do contrato.
Usar bibliotecas mantidas e serviços de identidade existentes; não implementar criptografia própria.

O chat permanecerá público. Autenticação de visitante será opcional; autenticação e autorização
administrativa serão obrigatórias antes de expor operações de aprovação ou dados pessoais da
Fase 3. Credenciais delegadas de Google Calendar serão separadas das credenciais de login.

O desenho admite futuros e-mail/senha com Argon2id, verificação de e-mail, recuperação por token
aleatório com hash, expiração e uso único, limitação de tentativas e proteção contra força bruta;
também GitHub, MFA e passkeys. Essas extensões terão implementação própria posteriormente, sem
stubs ou rotas anunciadas como disponíveis no primeiro incremento Google.

## Consequências

A integração do chat pode começar ao fechar a Fase 2. A autenticação será implementada na Fase 3,
começando por Google OIDC; o frontend aguardará esse contrato para substituir o login demonstrativo.
A Fase 4 incluirá
a alternativa Spring Security, com testes de conformidade e estado de sessão compatível ou
migração explícita ao trocar a implementação.

As rotas em [frontend-integration.md](../api/frontend-integration.md) são uma proposta, não endpoints
implementados. Detalhes de segurança e decisões pendentes constam em
[authentication.md](../architecture/authentication.md).

Referências: [OIDC Core](https://openid.net/specs/openid-connect-core-1_0.html),
[RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html),
[RFC 8725](https://www.rfc-editor.org/rfc/rfc8725.html),
[Spring Resource Server JWT](https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/jwt.html).
