# Operação no minimac-server

O fluxo preparado segue o deploy do portfólio: CI → SAST → imagem GHCR por digest → DAST
descartável → Tailscale/SSH → verificação. O backend executa a imagem Node com PostgreSQL/Redis;
não usa extração de `dist` estático nem cria outro Nginx. O workflow ainda precisa ser executado
no GitHub e validado no servidor. Esta revisão não publicou imagens nem acessou o Mac Mini.

## Checkouts e isolamento

| Ambiente        | Checkout                               | Branch | Projeto Compose          | Imagem local                   | HTTP no host     |
| --------------- | -------------------------------------- | ------ | ------------------------ | ------------------------------ | ---------------- |
| Produção        | `/opt/projects/phasscode-platform`     | `main` | `phasscode-platform`     | `phasscode-platform:local`     | `127.0.0.1:3000` |
| Desenvolvimento | `/opt/projects/phasscode-platform-dev` | `dev`  | `phasscode-platform-dev` | `phasscode-platform-dev:local` | `127.0.0.1:3001` |

Cada checkout tem seu próprio `.env`, ignorado pelo Git. Configure `COMPOSE_PROJECT_NAME`,
`PHASSCODE_IMAGE` e `PHASSCODE_HTTP_PORT` conforme a tabela. Em releases, `PHASSCODE_IMAGE` recebe
o digest GHCR testado. A porta interna permanece 3000. Não há `container_name` nem nomes globais
de volumes/redes: o Compose cria recursos distintos por projeto. PostgreSQL, Redis e os perfis
opcionais dos brokers não publicam portas no Compose base. O override `compose.dev.yaml` é somente
para Node no host; suas portas de banco/Redis também podem ser alteradas e permanecem no loopback.

O wrapper exige projeto e arquivo explícitos. Exemplos de **validação sem subir serviços**, em
seus respectivos checkouts:

```bash
bash scripts/compose.sh phasscode-platform /opt/projects/phasscode-platform/.env config --quiet
bash scripts/compose.sh phasscode-platform-dev /opt/projects/phasscode-platform-dev/.env config --quiet
npm run test:infrastructure
```

Use `config --quiet` no servidor: a saída completa de `config` pode mostrar segredos interpolados.
Os testes de infraestrutura renderizam Compose com valores sintéticos para os dois ambientes,
comparam imagens, volumes, redes e portas e exercitam deploy com Git/Docker/HTTP simulados.
Precisam do plugin Compose e Bash, mas não de daemon nem de acesso ao servidor.

Antes da primeira migração operacional, conferir `docker compose ls`, containers e volumes já
existentes. Mudar o projeto cria outro conjunto de recursos; não transfere dados antigos.
Se já houver dados, planejar backup/restauração ou migração explícita dos volumes. Não renomear,
apagar ou anexar volumes de outro ambiente automaticamente. Alterar `POSTGRES_PASSWORD` no `.env`
também não altera a senha de um volume PostgreSQL já inicializado.

## Configuração da LLM e operação

Provedor real exige chave/modelo, `REDIS_URL` e `LLM_GLOBAL_MAX_CALLS` positivo. No Compose,
PostgreSQL e Redis usam os nomes internos e a API roda com `NODE_ENV=production`, inclusive no
checkout de desenvolvimento. Configure origins específicas do frontend para cada ambiente.

`LLM_GLOBAL_WINDOW_MS` tem padrão 86400000; a janela começa na primeira reserva, pelo relógio do
Redis. Instâncias do mesmo ambiente compartilham Redis e `LLM_GLOBAL_BUDGET_KEY`, com limite/janela
iguais. Divergência de política na mesma chave ativa retorna 503. Aguarde a expiração para alterar
a política em uso; trocar a chave inicia um contador novo e exige considerar o consumo anterior.

Os Redis de produção e desenvolvimento ficam isolados. Se ambos usarem a mesma conta/chave
OpenRouter, distribua limites cuja soma caiba no orçamento disponível da conta, considerando outros
clientes externos. O controle local não consulta saldo nem conhece todas as cotas do fornecedor.
Redis AOF e `noeviction` ajudam a preservar contadores; perda/restauração de estado pode alterar a
contagem e exige reconciliação operacional. Não limpar Redis para liberar cota. Chamadas com erro
ou canceladas depois da reserva contam conservadoramente. Veja [segurança](../security.md).

Retenção diária e migrations devem usar o wrapper do ambiente correto. Após uma release, mantenha
o digest selecionado pelo deploy para esses comandos; não use uma tag local de outro checkout.
O script salva `.deployment/image-ref`, `project-name`, `http-port` e `use-proxy`; o wrapper valida esses campos
e os aplica sobre valores antigos do `.env`. Uma tentativa incompleta deixa `attempted-image-ref`
e bloqueia operações sem seleção explícita de imagem e inspeção do estado. Não apagar esses
registros para contornar a verificação; eles também não constituem backup do banco.

```bash
# Exemplo de operação futura, após preparar e revisar o ambiente de desenvolvimento:
bash scripts/compose.sh phasscode-platform-dev /opt/projects/phasscode-platform-dev/.env run --rm migrate
bash scripts/compose.sh phasscode-platform-dev /opt/projects/phasscode-platform-dev/.env --profile maintenance run --rm retention
```

Na primeira ativação do proxy, usar `--proxy` após o arquivo `.env` e configurar a rede/alias
confirmados. Depois de uma release, o wrapper recupera o modo salvo quando não há escolha explícita;
um redeploy sem variável de proxy não remove essa ligação. `--no-proxy` ou `PHASSCODE_USE_PROXY=false`
são escolhas explícitas. O estado não cria redes nem presume seus nomes/aliases.
Migrations são transacionais, com advisory lock/checksums; nunca editar SQL já aplicado. Antes de
publicar, ter backup testado e estratégia de recuperação. Rollback de imagem não reverte schema ou
dados: o script falha com diagnóstico e não anuncia rollback automático do banco.

## Nginx compartilhado

O arquivo `/opt/docker-stack/proxy/nginx/conf.d/projects.conf` mantém exatamente a arquitetura:

```nginx
include /opt/projects/*/nginx.conf;
```

Somente [`infrastructure/nginx.conf.example`](../../infrastructure/nginx.conf.example) é versionado;
`/nginx.conf` é ignorado. O deploy não copia, instala, recarrega ou altera o Nginx. Os domínios
propostos são `api.phasscode.com` e `devapi.phasscode.com`; DNS, TLS, mounts, upstream e a rede real
precisam ser confirmados antes da instalação manual de cada include.

Dentro de um container Nginx, `127.0.0.1` aponta para o próprio container. A publicação da API no
loopback do host não fica acessível por acrescentar `host-gateway` ou `host.docker.internal`.
Se confirmar uma rede externa já usada pelo proxy, o override opt-in `compose.proxy.yaml` conecta
somente a API a ela. Configure `PHASSCODE_PROXY_NETWORK` com o nome confirmado e
`PHASSCODE_PROXY_ALIAS` com aliases exclusivos e diferentes entre os ambientes. PostgreSQL/Redis
continuam na rede privada. A API conserva sua porta de loopback para verificações locais e precisa
de saída HTTPS para a LLM. Se o proxy já usar host networking, a alternativa pelo loopback exige
verificação dessa topologia; não a presuma nem abra a API em `0.0.0.0`.

Para a topologia de rede Docker confirmada, o modelo usa `proxy_pass` com variável e resolver para
renovar o endereço quando a API muda de IP. Verifique o resolver dentro do container antes da
instalação. Referências: [proxy_pass do Nginx](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass)
e [DNS em redes Docker](https://docs.docker.com/engine/network/#dns-services). O modelo bloqueia
`/ready` externamente; probes internos continuam consultando a API no loopback/rede privada.
O endpoint público `/health` não acessa PostgreSQL/Redis.

No Mac Mini, primeiro inspecione as redes do container Nginx e teste o upstream **de dentro desse
container**, com as ferramentas disponíveis. Depois adapte o modelo para a terminação TLS real,
valide `nginx -t` e faça reload controlado do proxy existente. Não remover o include compartilhado.
Configure `TRUST_PROXY` somente para os IPs/CIDRs confirmados de proxies confiáveis; não use uma
rede compartilhada ampla sem analisar quem pode ingressar nela. O modelo sobrescreve headers de
encaminhamento recebidos; uma cadeia com CDN precisa de configuração própria de IP real.

## Release manual no GitHub

[`deploy.yml`](../../.github/workflows/deploy.yml) tem apenas `workflow_dispatch`:

1. Executar `dev`/`development` ou `main`/`production`; o workflow rejeita combinações diferentes.
2. Testes, smoke, integração descartável, auditoria e CodeQL precedem a imagem GHCR `linux/amd64`.
   Confirmar essa arquitetura no Mac Mini antes da primeira release. A imagem leva SHA OCI, SBOM e
   proveniência; DAST e deploy recebem o mesmo digest imutável.
3. ZAP lê OpenAPI com alvo sobrescrito para a API descartável, em mock e sem chave de LLM. Os
   relatórios duram 14 dias; falhas definidas em `.ci/zap-rules.conf` bloqueiam a release.
4. `apply_remote=false` publica/testa a imagem sem aplicar no servidor. Para aplicação manual,
   exigir `apply_remote=true` e `ENABLE_REMOTE_DEPLOY=true` no environment GitHub correspondente.
5. Tailscale prefere OAuth completo; credencial parcial falha. A authkey é alternativa somente
   quando nenhum dos dois campos OAuth foi configurado. SSH valida fingerprint obrigatório.
6. No checkout preparado, confirmar branch/árvore limpa, fazer fast-forward somente para o SHA
   testado, puxar a imagem e validar seu SHA OCI **antes** de iniciar dependências ou executar
   migrations. Só depois aplicar migrations e ativar API, conferir digest/SHA em execução e `/ready` local.
   Não enviar mensagem ao chat nessa verificação.

Configure os environments `development` e `production`, suas regras de branch/aprovação e os
segredos `SERVER_HOST`, `SERVER_USER`, `SSH_PRIVATE_KEY`, `SSH_HOST_FINGERPRINT`,
`TAILSCALE_OAUTH_CLIENT_ID`/`TAILSCALE_OAUTH_SECRET` (ou `TAILSCALE_AUTHKEY`). O host SSH deve ser
alcançável pela tailnet e a tag `TAILSCALE_TAGS` precisa estar autorizada na ACL. Para imagem privada,
`GHCR_PULL_TOKEN` deve permitir somente leitura do pacote. O token de pull usa configuração Docker
temporária no servidor. O checkout também precisa ter acesso Git de leitura já preparado.

Variáveis por environment: `ENABLE_REMOTE_DEPLOY`, `TAILSCALE_TAGS`, `PHASSCODE_USE_PROXY` e
`API_PUBLIC_URL`. A última deve ser a origem HTTPS real; se ausente, o workflow informa que só
validou readiness local. A verificação pública usa `/health`; ela não comprova a revisão da imagem atrás de um CDN;
a verificação do digest/SHA ocorre localmente no servidor. Credenciais LLM e banco ficam no `.env`
privado do checkout, nunca nas entradas do workflow.

O SAST usa auditoria de dependências e CodeQL. O job CodeQL analisa/publica resultados, mas não
reprova automaticamente por todos os achados; configurar uma regra de code scanning no GitHub
é uma etapa remota separada. O Semgrep bloqueante do frontend não foi copiado para este backend.
Não tratar um job verde como garantia de ausência de vulnerabilidades. ZAP bloqueia as regras
marcadas como FAIL e auditoria bloqueia vulnerabilidades a partir do nível configurado.

O script também oferece plano sem mutações:

```bash
bash scripts/deploy.sh development ghcr.io/OWNER/REPO@sha256:DIGEST SHA_COMPLETO
# Só na execução autorizada, substituir os placeholders e acrescentar --apply.
```

O fluxo remoto, GHCR, Tailscale, SSH, ZAP, DNS/TLS e o include instalado ainda dependem de execução
externa. A configuração local revisada não comprova esses serviços. Após o primeiro deploy em
desenvolvimento, verificar `/ready` internamente e `/health`, CORS e erros pelo proxy/frontend; testar chat real
somente com orçamento conferido e autorização para consumir LLM.

Nunca usar `down --volumes` em ambientes com dados. Esse comando fica restrito às stacks
descartáveis de testes/DAST. RabbitMQ/Kafka são perfis opcionais de infraestrutura; Google OIDC,
Calendar, BullMQ e Java continuam nas próximas fases, sem integrações funcionais neste incremento.
