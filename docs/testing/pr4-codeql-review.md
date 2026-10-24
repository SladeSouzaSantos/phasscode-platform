# Revisão de segurança do PR #4

Revisão sobre `dev`, partindo de `d63cc8d`, com as alterações locais anteriores preservadas.
Os [comentários do PR](https://github.com/SladeSouzaSantos/phasscode-platform/pull/4)
foram consultados diretamente: publicam os dois alertas e os respectivos fluxos, sem patch de
Autofix nos comentários. Portanto, a avaliação abaixo trata os alertas e as recomendações das
regras; não atribui ao GitHub um patch que não foi disponibilizado.

## Identificadores de cotas: falso positivo de hash de senha

O alerta [#2](https://github.com/SladeSouzaSantos/phasscode-platform/security/code-scanning/2)
corresponde a `js/insufficient-password-hash`. O caminho completo é:

1. A configuração de fallback recebe as chaves dos provedores no backend.
2. A fábrica deriva identificadores determinísticos para as chaves Redis de orçamento e cooldown.
3. `RedisLlmCallBudget` usa essas chaves para operações Lua de reserva, contagem e expiração.
   `RedisLlmCooldownStore` usa as outras chaves para ler e prolongar bloqueios temporários.
4. A chave de API original continua sendo enviada pelo SDK ao provedor escolhido. O fingerprint
   não é aceito pelo provedor, não verifica uma senha e não concede acesso à API da plataforma.
   Nenhum desses identificadores participa de login, sessões, JWT ou papéis.

A [regra de senha](https://codeql.github.com/codeql-query-help/javascript/js-insufficient-password-hash/)
recomenda uma função lenta para armazenar e verificar **senhas**. Sua
[implementação](https://github.com/github/codeql/blob/main/javascript/ql/lib/semmle/javascript/security/dataflow/InsufficientPasswordHashCustomizations.qll)
acompanha valores classificados como possíveis senhas até operações criptográficas que não
sejam algoritmos de hash de senha. O texto do alerta classifica acessos a `apiKey` dessa maneira;
ele não demonstra que o resultado seja utilizado para autenticar uma pessoa.

Mantemos SHA-256 truncado em 32 caracteres hexadecimais (128 bits) e os mesmos formatos de chave:

- Namespace: `phasscode:llm:fb:<fingerprint(globalBudgetKey)>`.
- Cota: `<namespace>:quota:<provider>:<fingerprint(apiKey)>`.
- Cooldown: `<namespace>:cool:<provider>-<fingerprint(JSON.stringify([provider, apiKey, model]))>`.

A derivação foi isolada e documentada como identificação de estado distribuído. Réplicas com
a mesma configuração continuam consultando exatamente o mesmo estado. Outra credencial ou outro
namespace isola os contadores; alterar somente o modelo mantém a cota da credencial e troca o
cooldown da rota. A ordem e a presença dos demais provedores não alteram os identificadores.
As fixtures de regressão fixam os valores anteriores, evitando uma troca acidental que liberaria
crédito novo ou apagaria logicamente um cooldown ativo.

Argon2id, bcrypt, scrypt ou PBKDF2 não corrigiriam uma vulnerabilidade de senha neste fluxo.
Um salt aleatório por réplica ou inicialização quebraria o compartilhamento; mesmo uma derivação
lenta determinística diferente mudaria as chaves e abandonaria o estado ativo. O custo adicional
também não atende a uma necessidade de verificação de senha aqui.

O fingerprint **não é criptografia nem um segredo de autenticação**. Um leitor do Redis pode
correlacionar identificadores e testar candidatos caso uma chave seja previsível. Devem ser
usadas credenciais de alta entropia emitidas pelos provedores e acesso restrito ao Redis. Colisões
em 128 bits são teoricamente possíveis, embora não tenham probabilidade prática relevante para
o pequeno conjunto de credenciais deste serviço. Não há promessa de anonimização ou de proteção
contra quem já pode alterar contadores no Redis.

Tratamento recomendado: após revisar as evidências, marcar **somente o alerta #2** como
`false positive`, com a justificativa abaixo. A
[triagem documentada pelo GitHub](https://docs.github.com/en/code-security/how-tos/manage-security-alerts/manage-code-scanning-alerts/resolve-alerts)
permite registrar o motivo para auditoria. A dispensa de um alerta afeta suas ocorrências nas
branches; não é uma exclusão global da regra. Nenhuma dispensa foi realizada nesta sessão,
nenhuma consulta foi desabilitada e a extração do helper não garante eliminar o alerta estático.

> SHA-256 derives deterministic Redis quota/cooldown identifiers for provider-issued API keys.
> The digest is never used to store or verify user passwords, authenticate requests, or replace
> the upstream API credential. Existing identifiers are preserved for cross-replica limits.
> See docs/testing/pr4-codeql-review.md and the identifier regression tests.

## Proxy de navegador: restrição efetiva de destino

O alerta [#1](https://github.com/SladeSouzaSantos/phasscode-platform/security/code-scanning/1)
corresponde a `js/request-forgery`. Trata-se de infraestrutura de teste, sem exposição pela API
de produção. Antes da correção, o fixture já escutava apenas em `127.0.0.1` e comparava
`URL.origin` com um conjunto exato de origens de servidores locais criados pelo próprio teste.
Isso já bloqueava URLs externas e portas não cadastradas. Não foi demonstrado um bypass dessa
comparação que permitisse acesso a um servidor arbitrário.

Entretanto, a URL recebida inteira ainda era entregue a `http.request`. `URL.origin` não inclui
userinfo; uma URL com credenciais podia passar pela comparação e influenciar a autenticação HTTP
automática do cliente. Também faltava uma política explícita para `Location` na resposta. O alerta
expõe um fluxo sensível que merece correção verificável, mesmo com a proteção já existente.

A conexão agora usa protocolo HTTP e endereço IPv4 loopback constantes. A porta vem de uma tabela
privada, validada e copiada das origens confiáveis do fixture; somente caminho e query vêm da
requisição. O `Host` também é reconstruído a partir do destino confiável. Credenciais em URL,
fragmentos, protocolos diferentes, hosts ou portas não autorizados e túneis `CONNECT` são recusados.
O proxy não faz resolução DNS para escolher o destino nem aceita opções de transporte do cliente.

`http.request` não segue redirecionamentos automaticamente. Além disso, respostas com `Location`
fora da lista são bloqueadas. Os redirecionamentos locais necessários ao OIDC continuam sendo
respostas HTTP reais: o navegador inicia cada novo salto e o proxy valida novamente seu destino.
Bloquear todos os `302` impediria o fluxo que o teste precisa verificar. Nenhum redirecionamento
arbitrário é autorizado e nenhuma chamada automática é feita ao próximo destino pelo proxy.

Não foi criada interceptação Playwright com `context.route`, nem foram substituídos preflights.
Cookies, Origin, CSRF, corpo e respostas relevantes continuam atravessando HTTP real. A origem
local do cenário atacante tem acesso de transporte para que a própria API e o navegador exerçam
a recusa CORS; autorização do proxy não equivale a autorização CORS da API.

O padrão resultante segue a
[recomendação de SSRF do CodeQL](https://codeql.github.com/codeql-query-help/javascript/js-request-forgery/):
selecionar o destino de rede a partir de valores confiáveis. Não se trata de um proxy genérico
para produção. Servidores locais autorizados e o processo de teste continuam sendo componentes
confiáveis; as portas são efêmeras e os serviços são encerrados ao terminar o teste.

## Verificação e limites

Verificação local em 24/10/2026, Node.js 24.11.1:

| Comando                       | Resultado                                                                          |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `npm run check`               | Lint, Prettier, typecheck, contratos, 442 testes em 31 arquivos e build aprovados. |
| `npm run test:infrastructure` | 29 testes aprovados, sem daemon ou banco.                                          |
| `npm run test:browser`        | 2 testes aprovados em navegador Chromium real local.                               |
| `npm run smoke`               | Processo compilado, health, readiness e dois turnos de chat HTTP aprovados.        |
| `git diff --check`            | Sem erros de whitespace.                                                           |

Os **473 testes** acima são únicos: os oito testes novos de identidade e os cinco do proxy já
estão incluídos nos 442 de `npm test`. A regressão adicional de navegador verifica uma navegação
para outro servidor loopback sem autorização: o Chromium recebe a recusa do proxy (403 ou
`ERR_HTTP_RESPONSE_CODE_FAILURE`) e o servidor de destino recebe zero requisições. O teste anterior
de OIDC/CORS/CSRF/refresh/logout permanece com todas as verificações, inclusive OPTIONS real e
ausência do POST vindo da origem atacante.

Os testes de réplicas usam um double compartilhado de comandos Redis e o modelo é simulado.
Verificam a derivação e a conexão da fábrica com as chaves, sem afirmar que executam Lua real.
A suíte de infraestrutura renderiza Compose com valores sintéticos e testa scripts simulados.
A integração PostgreSQL/Redis, migrations, credenciais externas e deploy não foram executados.
Nenhum `.env` existente foi alterado. O primeiro `check` parou em uma limitação do sandbox Windows
(`uv_os_get_passwd` no tsx); a execução fora do sandbox passou sem mudar a configuração do projeto.

Arquivos desta revisão, além do trabalho anterior já existente:

- `apps/orbe-node/src/adapters/fallback-llm.ts` e o novo
  `apps/orbe-node/src/adapters/fallback-redis-identities.ts`.
- `tests/llm-fallback-identities.test.ts` (novo).
- `tests/browser/fixtures.ts` e o novo `tests/browser/local-proxy.ts`.
- `tests/browser-proxy.test.ts` (novo) e `tests/auth.browser.integration.test.ts`.
- Este relatório e seu link em `docs/testing/README.md`.

O workflow `.github/workflows/security.yml` permanece intacto. O CodeQL não está instalado neste
ambiente; o status remoto dos alertas depende de uma nova análise depois de uma publicação
autorizada das alterações. Nenhum commit, push, merge ou deploy foi executado.
