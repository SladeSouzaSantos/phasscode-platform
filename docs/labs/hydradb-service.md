# HydraDB LAB — ativação opcional do motor de grafos

Este procedimento preserva o **Orbe LAB atual**, DEV e MAIN. O HydraDB
é um serviço **separado** com profile `hydradb`, armazenagem isolada,
portas exclusivas no localhost e sem segredos das LLMs.

## Imagem reproduzível

A imagem oficial é publicada em `ghcr.io/hydra-db/hydradb`.
Escolhemos a versão pública **v0.3.0** como referência inicial (não
`latest`). A versão não foi compilada neste repositório.

```bash
cd ~/hydradb-lab/phasscode-platform
docker pull ghcr.io/hydra-db/hydradb:0.3.0

# Verificar se houve publicação adequada para Linux/amd64
docker image inspect --format '{{.Os}}/{{.Architecture}}' \
  ghcr.io/hydra-db/hydradb:0.3.0

# Gravar o digest imutável do manifesto em .env (sem imprimir segredos)
python3 - <<'PY'
import pathlib, subprocess, re
p=pathlib.Path('.env')
s=p.read_text()
if re.search(r'^HYDRADB_IMAGE=',s,re.M):
    raise SystemExit('ERROR: HYDRADB_IMAGE já existe; revisar antes de substituir')
im=subprocess.check_output([
    'docker','image','inspect','--format','{{index .RepoDigests 0}}',
    'ghcr.io/hydra-db/hydradb:0.3.0'],text=True).strip()
if not re.fullmatch(r'ghcr\.io/hydra-db/hydradb@sha256:[a-f0-9]{64}',im):
    raise SystemExit('ERROR: unexpected image digest')
p.write_text(s.rstrip()+'\nHYDRADB_IMAGE='+im+'\n')
p.chmod(0o600)
print('HYDRADB_IMAGE_PINNED')
PY
```

Se o `docker pull` não encontrar a imagem, **pare**. Não compile o
`main` mutável no host e não substitua a imagem por `latest`.

## Permissões de armazenamento e segredo

A imagem oficial usa **UID:GID 10001:10001**. Os diretórios criados pelo
usuário `phass` com `umask 077` não são graváveis por esse UID.
Conceda propriedade **somente aos diretórios do HydraDB**.
Preserve o token original como backup privado do usuário; crie uma cópia
independente para leitura pelo processo do contêiner.

```bash
LAB="$HOME/hydradb-lab"

# Exclusivamente dentro do laboratório; nunca /opt/projects
sudo chown -R 10001:10001 \
  "$LAB/data/hydradb/store" "$LAB/data/hydradb/cache"
sudo chmod 700 "$LAB/data/hydradb/store" "$LAB/data/hydradb/cache"

# Em algumas distribuições, install -o/-g não aceita UID sem passwd.
# Copiar como root; depois atribuir UID/GID numéricos via chown.
sudo install -m 0600 \
  "$LAB/secrets/hydradb_auth_token" \
  "$LAB/secrets/hydradb_auth_token_runtime"
sudo chown 10001:10001 "$LAB/secrets/hydradb_auth_token_runtime"
sudo chmod 0400 "$LAB/secrets/hydradb_auth_token_runtime"

cd "$LAB/phasscode-platform"
bash scripts/hydradb-service-preflight.sh
```

O preflight não cria serviços e **não imprime tokens ou variáveis LLM**.

## Subir apenas o HydraDB

Após inspeção do resultado do preflight e disponibilidade de memória:

```bash
cd ~/hydradb-lab/phasscode-platform
docker compose -p phasscode-hydradb-lab --env-file .env \
  -f compose.yaml \
  -f compose.hydradb-lab.yaml \
  -f compose.hydradb-service.lab.yaml \
  --profile hydradb \
  up -d --no-build --no-deps hydradb

# Admin HydraDB, sem LLM:
curl -fsS http://127.0.0.1:19090/readyz

# Somente contêiner do motor de grafos
docker ps --filter label=com.docker.compose.project=phasscode-hydradb-lab \
  --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
```

Portas públicas **nenhuma**. No host local apenas:
`127.0.0.1:17687` (Bolt), `127.0.0.1:18443` (HTTP) e
`127.0.0.1:19090` (Admin). O laboratório continua usando
`127.0.0.1:13003` para a API Orbe.

A consulta de teste de escrita/leitura via HTTP será feita depois que
`/readyz` responder. A configuração Bolt de roteamento é um item de
homologação separado; não pressupor paridade com Neo4j nem integração
automática com a API Orbe.

Para parar o HydraDB sem apagar dados:

```bash
docker compose -p phasscode-hydradb-lab --env-file .env \
  -f compose.yaml -f compose.hydradb-lab.yaml \
  -f compose.hydradb-service.lab.yaml \
  stop hydradb
```

**Não use `down --volumes`, `docker system prune`, nem `deploy.sh`.**
O binário HydraDB não recebe variáveis LLM, PostgreSQL ou Telegram.
Os limites iniciais são **2 GiB de memória, 1 CPU e 256 processos**,
não sizing para produção. A aplicação Orbe permanece com
`ORBE_GRAPHRAG_MODE=off`, sem conexão com HydraDB.

Referências: https://github.com/hydra-db/hydradb/blob/v0.3.0/README.md
e https://github.com/hydra-db/hydradb/blob/v0.3.0/Dockerfile .
