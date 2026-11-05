# HydraDB LAB — Orbe experimental e isolado

**Estado:** baseline preparado; HydraDB ainda não está conectado ao Orbe.
**Branch:** `experiment/hydradb`. Nunca executar esses comandos em `dev` ou `main`.

## Objetivo e separação

Ter uma terceira instância de teste do Orbe com **PostgreSQL, Redis, rede,
volumes e porta privados**, preservando a mesma seleção de provedores/modelos
e as mesmas chaves LLM da DEV em `.env` **não versionado**. As cotas dos
provedores externos, contudo, continuam compartilhadas por conta, mesmo
quando os contadores Redis são independentes.

| Ambiente | Docker Compose | Porta API no host | Checkout |
| --- | --- | --- | --- |
| MAIN | `phasscode-platform` | `127.0.0.1:3002` | `/opt/projects/phasscode-platform` |
| DEV | `phasscode-platform-dev` | `127.0.0.1:3001` | `/opt/projects/phasscode-platform-dev` |
| HydraDB LAB | `phasscode-hydradb-lab` | `127.0.0.1:13003` | `~/hydradb-lab/phasscode-platform` |

O LAB utiliza o `compose.yaml` habitual mais
[`compose.hydradb-lab.yaml`](../../compose.hydradb-lab.yaml), que limita
API (512 MiB / 0,75 CPU), PostgreSQL (384 MiB / 0,5 CPU), Redis
(192 MiB / 0,25 CPU) e migração (384 MiB / 0,5 CPU). O nome do projeto
isola automaticamente as redes e os volumes nomeados. Nenhum overlay de
proxy ou GraphRAG é habilitado no baseline.

**Pré-requisitos existentes no MiniMac:**

- `~/hydradb-lab/phasscode-platform` em `experiment/hydradb`;
- `~/hydradb-lab/hydradb` clonado do repositório oficial;
- `~/hydradb-lab/phasscode-platform/.env` privado, com credenciais de
  PostgreSQL diferentes da DEV e variáveis LLM copiadas da DEV;
- `~/hydradb-lab/hydradb.env` e `~/hydradb-lab/secrets/` privados;
- `PHASSCODE_HTTP_PORT=13003`, `PHASSCODE_USE_PROXY=false`,
  `LLM_GLOBAL_MAX_CALLS=30`, `ORBE_GRAPHRAG_MODE=off`.

**Não versionar nem compartilhar o conteúdo dos arquivos privados.**
O processo HydraDB futuramente iniciado não deve receber chaves de LLM,
senhas PostgreSQL ou Redis.

## 1. Atualizar a branch experimental

```bash
cd "$HOME/hydradb-lab/phasscode-platform"
git pull --ff-only origin experiment/hydradb
git branch --show-current
```

## 2. Validar configuração, sem iniciar contêineres

```bash
bash scripts/hydradb-lab-preflight.sh
```

Espera-se `LAB_PREFLIGHT_OK_NO_CONTAINERS_STARTED`. O script valida
separação de senhas, banco, Redis, porta loopback, projeto, volumes, rede,
limites de recursos e orçamento LLM **sem imprimir segredos**.

## 3. Iniciar SOMENTE Orbe LAB, como baseline

Após aprovação do preflight, se não houver deploy operacional simultâneo
nem pressão de memória/CPU no host:

```bash
cd "$HOME/hydradb-lab/phasscode-platform"
docker compose \
  -p phasscode-hydradb-lab \
  --env-file .env \
  -f compose.yaml -f compose.hydradb-lab.yaml \
  up -d --build --wait api

curl --fail --silent --show-error \
  http://127.0.0.1:13003/ready
```

A primeira construção local da API pode demandar CPU/RAM acima dos
limites dos serviços, pois os limites Compose só se aplicam aos
contêineres em execução, **não à compilação da imagem**. Verificar
`free -h` e `docker stats --no-stream` antes/depois. O endpoint
`/ready` não invoca provedores LLM; somente perguntas no chat
consomem cotas externas.

Para observar apenas o LAB:

```bash
docker ps --filter label=com.docker.compose.project=phasscode-hydradb-lab \
  --format 'table {{.Names}}\t{{.Status}}'
docker compose -p phasscode-hydradb-lab --env-file .env \
  -f compose.yaml -f compose.hydradb-lab.yaml ps
```

Para **parar sem apagar dados**, no diretório do LAB:

```bash
docker compose -p phasscode-hydradb-lab --env-file .env \
  -f compose.yaml -f compose.hydradb-lab.yaml stop
```

Nunca executar `down --volumes`, `docker volume prune` ou
`scripts/deploy.sh` nesse laboratório. A documentação de produção
exige um procedimento de release próprio; o LAB não é alvo do pipeline
`development/production`.

## 4. HydraDB (próxima fase separada)

O repositório [hydra-db/hydradb](https://github.com/hydra-db/hydradb)
usa Rust, `libcypher-parser` e SuiteSparse GraphBLAS. Confirmar dependências
e compatibilidade do subconjunto OpenCypher antes da primeira compilação,
especialmente porque o MiniMac tem quatro CPUs e executa os ambientes
existentes. O HydraDB oferece armazenamento local para laboratório e
servidores Bolt, HTTP e Admin; não assumir equivalência total com Neo4j.

`~/hydradb-lab/hydradb.env` destina-se ao futuro processo HydraDB,
**não** ao PostgreSQL da API nem à configuração Compose do Orbe. Os
caminhos `/data` e `/run/secrets` desse arquivo somente terão efeito
após montagens explícitas no futuro contêiner. Nenhum endpoint do Orbe
usa HydraDB até que haja um adapter dedicado, testes pareados, revisão
de fontes e integração experimental aprovada.
