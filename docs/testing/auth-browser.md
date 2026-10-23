# Smoke de autenticação no navegador local

Esta suíte opt-in usa um navegador Chromium real em modo headless, a API Fastify por HTTP,
duas páginas mínimas de teste e um issuer OIDC local. Os ID tokens são assinados RS256 e
verificados por JWKS usando o adaptador de autenticação real. A aprovação no provedor é
simulada por um redirecionamento local; não existe acesso à conta Google.

```bash
npm run test:browser
```

No Windows, o fixture procura Edge e Chrome nos caminhos padrão. Para outra instalação,
configurar `PHASSCODE_BROWSER_EXECUTABLE_PATH` ou `PHASSCODE_BROWSER_CHANNEL` (`msedge`,
`chrome` ou `chromium`), somente um deles. Sem navegador instalado/configurado, usar o
Chromium gerenciado pelo Playwright. Em CI Linux, preparar o ambiente antes da suíte:

```bash
npx playwright-core install --with-deps chromium
npm run test:browser
```

Instalar o navegador exige acesso à distribuição do Playwright e dependências do sistema;
esse preparo não faz parte do smoke. A execução da suíte usa somente endereços IPv4 loopback
e portas efêmeras. Um proxy HTTP local encaminha somente a lista exata de origens dos fixtures
e bloqueia destinos externos, inclusive conexões CONNECT e tráfego HTTP(S) de fundo.
Service workers e tarefas de rede de fundo do navegador ficam desativados.

Não há interceptação de requisições por `context.route`: a versão instalada do Playwright pode
responder automaticamente ao preflight nesse modo. Assim, OPTIONS e a decisão CORS são exercitados
pelo navegador e pela API reais, passando somente pelo proxy local com origens restritas.

A configuração é construída com dados sintéticos em memória. O fixture não carrega `.env`,
nenhuma conexão PostgreSQL/Redis é aberta, nenhuma migration ou concessão administrativa é
executada. O frontend do proprietário não é alterado. O teste não grava screenshots, vídeos,
traces ou tokens em arquivos.

## O que é conferido

- Chat público antes e depois do login, com o formato legado sem `actions`.
- Redirecionamento de login, callback fixo e sessão obtida com credenciais do navegador.
- Cookie HttpOnly/host-only/SameSite=Lax, inacessível por `document.cookie`.
- Sessão anônima quando `fetch` omite credenciais e perfil autenticado quando as inclui.
- Preflight CORS real e recusa de outra origem local, inclusive com CSRF válido.
- Recusa de mutação sem CSRF ou com valor incorreto.
- Duas renovações serializadas, trocando cookie e CSRF, seguidas de logout e invalidação.
- Ausência de tokens de acesso/renovação na resposta e de armazenamento no localStorage/sessionStorage.

O fixture usa HTTP loopback com `AUTH_COOKIE_SECURE=false` explicitamente. Cookies Secure,
TLS, domínio público, comportamento dos proxies, Google real e o frontend do proprietário
continuam sujeitos à homologação externa. Este resultado complementa as suítes unitárias e
PostgreSQL; não substitui a validação concorrente ou comprova a implantação publicada.

Execução local em 23/10/2026: **1/1 teste aprovado**, usando Edge headless no Windows e
`playwright-core` 1.64.1. Duração registrada: 11,07 segundos, incluindo inicialização e limpeza.
Formatação, ESLint dos arquivos do smoke e typecheck também foram conferidos na implementação;
as evidências consolidadas da revisão ficam no relatório de retomada.
