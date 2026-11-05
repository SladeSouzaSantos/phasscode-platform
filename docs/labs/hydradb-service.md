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

O endpoint `/readyz` **retorna HTTP 200 sem corpo** quando está pronto,
então a saída vazia de `curl -fsS` é normal. Confira o código de status:

```bash
curl -sS -o /dev/null -w 'HYDRADB_READY_HTTP_%{http_code}\\n' \\
  http://127.0.0.1:19090/readyz
```

## Primeira prova de gravação e leitura por Cypher

Use o teste HTTP local sem dependências externas, com o token **original**
privado de `~/hydradb-lab/secrets/hydradb_auth_token` (não a cópia
`_runtime`, propriedade do UID 10001):

```bash
cd ~/hydradb-lab/phasscode-platform
python3 scripts/hydradb-http-smoke.py
```

O script valida readiness 200, cria dois nós **sintéticos com IDs aleatórios**
e uma relação `FOLLOWS` no grafo LAB `lab`, lê o vínculo e exige
correspondência exata do ID. Usa autenticação Bearer **somente na memória**
do processo Python, não imprime token nem faz chamadas LLM/Orbe.

Saída de sucesso:

```text
HYDRADB_READY_HTTP_200
HYDRADB_WRITE_HTTP_200
HYDRADB_READ_MATCH_OK
HYDRADB_SYNTHETIC_GRAPH_SMOKE_OK
```

**Este teste deixa dois nós e uma relação no armazenamento de teste do
HydraDB.** Se uma etapa falhar após a escrita, o registro sintético poderá
permanecer, mas não há alterações no PostgreSQL do Orbe, Neo4j DEV ou MAIN.
Não repetir contra outro endpoint ou com credenciais de produção.

A configuração Bolt de roteamento é um item de homologação separado; não
pressupor paridade com Neo4j nem integração automática com a API Orbe.

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


## Primeira comparação PPKS: HydraDB × Neo4j do LAB

Esta etapa **não usa o Neo4j da DEV**. Subimos outro banco de referência
somente em `phasscode-hydradb-lab`, em volume
`phasscode-hydradb-lab_neo4j-compare-data`, com uma porta HTTP restrita
a `127.0.0.1:17474`. Não existem portas Bolt da referência publicadas.

### 1. Preparar a senha **nova** do Neo4j de comparação

```bash
cd ~/hydradb-lab/phasscode-platform

python3 - <<'PY'
from pathlib import Path
import os, secrets

env = Path(".env")
if not env.is_file() or env.is_symlink():
    raise SystemExit("LAB .env ausente/inseguro")
content = env.read_text(encoding="utf-8")
if any(line.startswith("NEO4J_LAB_AUTH=") for line in content.splitlines()):
    print("NEO4J_LAB_AUTH_ALREADY_PRESENT")
else:
    with env.open("a", encoding="utf-8") as f:
        f.write("\nNEO4J_LAB_AUTH=neo4j/" + secrets.token_urlsafe(36) + "\n")
    os.chmod(env, 0o600)
    print("NEO4J_LAB_AUTH_GENERATED")
PY

python3 scripts/hydradb-neo4j-ppks-benchmark.py
```

Este último comando é um **dry-run** e apenas confirma os 7 registros públicos
do PPKS e os 14 pares tecnológicos extraídos. Não faz chamadas de rede nem
grava nos grafos.

### 2. Iniciar apenas a referência Neo4j LAB

```bash
docker compose -p phasscode-hydradb-lab --env-file .env \
  -f compose.yaml -f compose.hydradb-lab.yaml \
  -f compose.neo4j-compare.lab.yaml --profile neo4j-compare \
  config --quiet

docker compose -p phasscode-hydradb-lab --env-file .env \
  -f compose.yaml -f compose.hydradb-lab.yaml \
  -f compose.neo4j-compare.lab.yaml --profile neo4j-compare \
  up -d --no-build --no-deps --wait neo4j-compare
```

`neo4j-compare` utiliza `neo4j:5.26`, limite de 896 MiB RAM, 0,75 CPU,
128 MiB de heap inicial, 256 MiB de heap máximo e 128 MiB de page cache.
A primeira inicialização pode demorar; confirme pelo `docker ps` sem
reiniciar DEV/MAIN. Os limites são apenas de laboratório.

### 3. Medir paridade de uma relação curta (sem LLM)

```bash
python3 scripts/hydradb-neo4j-ppks-benchmark.py --live
```

O script lê o catálogo `knowledge/ppks/index.json` e os arquivos de cinco
projetos e duas experiências publicamente declarados. Ele importa nos dois
bancos a **mesma amostra de 14 relações**, usando nós **sintéticos**
`id`-a-`id` e relação `USES_TECHNOLOGY`. Lê as relações de volta,
exige igualdade dos IDs e mede os tempos dos **round-trips HTTP locais**.
Uma amostra pequena e duas APIs HTTP diferentes **não demonstram que um
motor de banco é mais rápido que outro**. Esses tempos servem para
diagnóstico inicial, não dimensionamento ou decisão de migração.

Os resultados completos ficam sob
`~/hydradb-lab/benchmarks/ppks-graph-*.json` (modo 0600).
O teste deixa dados sintéticos nos bancos do laboratório; não copia
documentos acadêmicos privados, não consulta APIs LLM e não acessa
`/opt/projects/phasscode-platform-dev` ou MAIN.

**Limites desta etapa:** não reproduz o grafo compartilhado de habilidades,
o esquema `OrbeEvidence`, claims/evidências, as consultas completas
`graphFindEvidenceCypher`/`graphGetSourceCypher`, multihop, indexação
nem isolamento entre agentes. Sem validar esses itens, não conectar HydraDB
ao pipeline de recrutamento do Orbe.

Para parar **somente o comparador**, mantendo os volumes:

```bash
docker compose -p phasscode-hydradb-lab --env-file .env \
  -f compose.yaml -f compose.hydradb-lab.yaml \
  -f compose.neo4j-compare.lab.yaml stop neo4j-compare
```


## Segundo benchmark: competências compartilhadas + proveniência

Referência arquitetural:
[compatibilidade Cypher HydraDB × Orbe](hydradb-cypher-compatibility.md).
**Este teste não porta o GraphRAG atual**, porque o HydraDB v0.3.0
não implementa todas as expressões presentes nas consultas Neo4j do Orbe.

Os 7 registros públicos selecionados (5 projetos + 2 experiências)
continuam os mesmos do teste 1. A nova projeção sintética contém:

- 7 vértices `Record` (projeto ou experiência) com escopo;
- 10 vértices `Skill` **compartilhados** (ex.: Java, Flutter, TypeScript);
- 14 vértices `Claim` (tecnologia associada a registro);
- 7 vértices `Source`, com `verificationStatus` do registro original;
- 42 arestas `HAS_CLAIM`, `USES_TECHNOLOGY` e `SUPPORTED_BY`.

Os vértices recebem IDs numéricos **aleatórios e exclusivos para cada
rodada**, sem colidir com o modelo textual original do PPKS. Não são
copiados documentos acadêmicos, currículos privados ou textos completos
para nenhum banco. Os `Source` são marcadores sintéticos: uma
verificação de `code_reviewed` pertence ao **registro PPKS**, não
certifica isoladamente cada claim.

### 1. Atualizar e testar o plano sem gravar

```bash
cd ~/hydradb-lab/phasscode-platform
git pull --ff-only origin experiment/hydradb

python3 scripts/hydradb-neo4j-ppks-provenance-benchmark.py
```

Saída esperada (os números de skills dependem do catálogo atual):

```text
PPKS_GRAPH_PLAN_COUNTS {"claims": 14, "edges": 42, "records": 7, "skills": 10, "sources": 7}
PPKS_GRAPH_QUERY_CASES 18
PPKS_GRAPH_SHARED_SKILL_CASES Flutter Java TypeScript
PPKS_GRAPH_DRY_RUN_OK_NO_WRITES
```

### 2. Testar equivalência entre os dois LABs

**Pré-condição:** Neo4j de comparação `healthy`; HydraDB
`/readyz` 200; ambas as instâncias permanecem isoladas em
`phasscode-hydradb-lab` (verifique no Docker se necessário).

```bash
cd ~/hydradb-lab/phasscode-platform
python3 scripts/hydradb-neo4j-ppks-provenance-benchmark.py --live
```

O teste `shared_peer_4_hop` busca **outros** registros que compartilham
Flutter ou Dart com `greencity-os`: a origem é excluída explicitamente
por `WHERE peer.id <> <id numérico do registro>`. Na amostra, o único
par esperado é `experiencia-greencity`, não o próprio projeto.
Isso evita depender das diferenças de unicidade de relacionamentos
entre motores Cypher.

O script autentica por HTTP local sem imprimir credenciais. O Neo4j
primeiro recebe **38 MERGEs de vértices individuais** (sem cronometrar);
depois o script grava 42 relações usando `MATCH` dos endpoints antes de
`MERGE` da relação. Isso é necessário porque `MERGE` de um caminho inteiro
não vinculado no Neo4j pode **duplicar vértices**, mesmo se nós com as mesmas
propriedades existirem. No HydraDB os 42 relacionamentos usam upsert
numérico por ID, segundo o contrato da versão testada. Como os fluxos
de escrita são diferentes, a latência de escrita **não é comparação justa**
entre motores. O teste compara **resultados**, não apenas HTTP 200.

Após preparar os nós, grava os mesmos 42 vínculos nos dois bancos,
testa 18 casos lógicos
(recuperação de skills e status de fonte por registro, skills
compartilhadas, peers por caminho de 4 hops), fazendo um aquecimento
não cronometrado e três leituras medidas por caso e por banco. Verifica
**resultado exato**, não só sucesso HTTP.

Critério de aceite:

```text
PPKS_GRAPH_BOTH_ENGINES_READY
PPKS_GRAPH_NEO4J_VERTICES_SEEDED 38
PPKS_GRAPH_WRITES_PER_ENGINE 42
PPKS_GRAPH_PARITY_CASES 18 PASS
PPKS_GRAPH_SEMANTIC_PARITY_PASS
```

Relatório novo:
`~/hydradb-lab/benchmarks/ppks-provenance-*.json`,
somente legível pelo proprietário (modo 0600).
Ele inclui latências agregadas por **tipo de consulta**, não uma
alegação de superioridade de desempenho.

Em caso de `PPKS_GRAPH_QUERY_FAILED`, envie o nome do caso e o status
HTTP para investigar **compatibilidade funcional**, sem recriar
contêineres. O motor pode rejeitar uma sintaxe do subconjunto Cypher; o
script não tentará substituir a consulta por outra sem apresentar a
incompatibilidade. Dados sintéticos gravados antes da falha podem
permanecer nos volumes do LAB.

**Não alterar DEV/MAIN nem integrar HydraDB ao Orbe** após este teste
isolado. O próximo gate será a representação fiel de evidências PPKS
e um adapter dedicado ao HydraDB, com fallback validado.

### Reteste após falha de duplicação Neo4j

Na primeira execução do segundo benchmark, o `dry-run` passou, as
42 operações por motor retornaram sucesso, mas a primeira consulta
`record_skills` em `experiencia-greencity` **falhou na validação de
resultados do Neo4j**. A revisão do código indicou que o teste aplicava
`MERGE (a)-[:REL]->(b)` com nós não previamente vinculados. O Neo4j
pode criar duplicatas dos endpoints quando o padrão completo não existe.

O script foi corrigido para garantir nós únicos por ID **em cada nova
rodada**, usando IDs numéricos aleatórios novos (sem reaproveitar os
dados da tentativa anterior). Registros sintéticos da tentativa
anterior permanecem isolados no volume de comparação; não executar
`down -v` nem apagar dados de DEV/MAIN.

Para reproduzir com diagnóstico de erro contextualizado (sem tokens ou
payloads completos):

```bash
cd ~/hydradb-lab/phasscode-platform
git pull --ff-only origin experiment/hydradb
python3 scripts/hydradb-neo4j-ppks-provenance-benchmark.py
python3 scripts/hydradb-neo4j-ppks-provenance-benchmark.py --live
```

**Não considerar paridade aprovada** até obter
`PPKS_GRAPH_PARITY_CASES 18 PASS`. Qualquer falha seguinte, inclusive
sintaxe Cypher HydraDB, deve ser tratada como bloqueio real de
compatibilidade para investigar, não como motivo para habilitar o adapter.


## Terceiro gate: contrato de claims e fontes específicas

O segundo benchmark terminou com `PPKS_GRAPH_PARITY_CASES 18 PASS`.
O resultado e seus limites estão registrados em
[hydradb-ppks-benchmark-2026-11-05.md](hydradb-ppks-benchmark-2026-11-05.md).

O próximo teste mantém **cada `evidenceId` do PPKS** na associação
claim→fonte e mede recuperação parametrizada semelhante ao contrato
`findEvidence` / `getSource`, ainda com projeção simplificada e
sem ligação ao Orbe.

Procedimento, pré-condições e critérios de aprovação:
[hydradb-ppks-contract.md](hydradb-ppks-contract.md).

```bash
cd ~/hydradb-lab/phasscode-platform
git pull --ff-only origin experiment/hydradb

python3 -m py_compile scripts/hydradb-neo4j-ppks-evidence-contract.py \
  scripts/hydradb-ppks-contract-selftest.py

python3 scripts/hydradb-ppks-contract-selftest.py
python3 scripts/hydradb-neo4j-ppks-evidence-contract.py

# Só depois do dry-run e com Neo4j-compare healthy, HydraDB ready:
python3 scripts/hydradb-neo4j-ppks-evidence-contract.py --live
```

O teste usa **47 nós e 60 relações sintéticas**, dos quais 16 são
fontes específicas, e verifica **13 cenários parametrizados**.
Todos os dados gravados permanecem exclusivamente nos bancos LAB.


## Quarto gate: leitor shadow externo e fallback PPKS

Após **duas rodadas consecutivas de 13/13 casos** do terceiro
contrato, o laboratório pode executar um protótipo de leitura
com `--mode off` ou `--mode shadow`.

Este script não integra nem modifica o servidor do Orbe e não usa
`ORBE_GRAPHRAG_MODE=active`. Não realiza escrita no HydraDB.

Ver [hydradb-ppks-shadow-reader.md](hydradb-ppks-shadow-reader.md)
para pré-condições, isolamento por `lab_run`, validação com PPKS,
fallback, autotestes offline e comandos de uso.

```bash
cd ~/hydradb-lab/phasscode-platform
git pull --ff-only origin experiment/hydradb

python3 -m py_compile \
  scripts/hydradb-ppks-shadow-reader.py \
  scripts/hydradb-ppks-shadow-selftest.py

python3 scripts/hydradb-ppks-shadow-selftest.py

python3 scripts/hydradb-ppks-shadow-reader.py --mode off --probe

# Somente depois, usando o relatório da 2a rodada aprovada:
python3 scripts/hydradb-ppks-shadow-reader.py \
  --mode shadow \
  --report ~/hydradb-lab/benchmarks/ppks-contract-20261105T225141Z.json \
  --probe --require-graph
```

Um `canonical_fallback` durante a prova com
`--require-graph` reprova o gate; retorna o resultado
canônico seguro, mas indica indisponibilidade ou
divergência da projeção consultada. O fallback não
autoriza ativar HydraDB no Orbe operacional.


## Gate 4 aprovado; Gate 5 TypeScript isolado

O operador homologou o quarto gate: autotestes offline aprovados,
10 consultas em OFF (`canonical`) e 10 em SHADOW
(`graph_verified`), inclusive resultados vazios de Go e
`missing-source-key`.

Agora existe uma implementação TypeScript **fora do runtime do Orbe**:
`scripts/hydradb-lab-evidence-adapter.ts`, compatível com a interface
`EvidenceGraphRepository`. A interface recebe um repository PPKS
canônico por injeção; o resultado permanece canônico e o HydraDB
apenas valida paridade. A criação de um transporte HTTP real é
explícita e limitada a loopback. Nenhum componente da API a importa.

**Gate 5 pendente de execução dos testes TypeScript** no MiniMac:

```bash
cd ~/hydradb-lab/phasscode-platform
git pull --ff-only origin experiment/hydradb
npm run typecheck
npx vitest run tests/hydradb-lab-evidence-adapter.test.ts
```

Requisitos e limites em
[hydradb-ppks-ts-shadow-adapter.md](hydradb-ppks-ts-shadow-adapter.md).
Não habilitar HydraDB no backend DEV/MAIN e não alterar
`ORBE_GRAPHRAG_MODE` no LAB.


## Gate 5 homologado; Gate 6 — TypeScript HTTP real (pendente)

O operador executou `npm run typecheck` e
`vitest run tests/hydradb-lab-evidence-adapter.test.ts` no
`node:24` do LAB: typecheck aprovado, **7/7 testes** aprovados.

O Gate 6 adiciona `scripts/hydradb-lab-ts-live-check.ts`,
um executável isolado, sem mudanças no backend Orbe:

- PPKS canônico carregado de **sete registros públicos explicitamente
  selecionados**, sem chamar `projectPpksEvidenceGraph()` e sem
  acesso aos dados acadêmicos privados;
- modo `off` executado no Docker sem rede;
- modo `shadow` acessa somente HydraDB LAB em loopback,
  com relatório de paridade anterior, `lab_run` e token em
  arquivo privado montado em read-only;
- dez consultas de integração que exigem `graph_verified`;
- nenhuma escrita ou ativação GraphRAG no Orbe.

Passos completos de execução (incluindo as flags de isolamento
do contêiner): [hydradb-ppks-ts-http-gate.md](hydradb-ppks-ts-http-gate.md).

**Gate 6 ainda não homologado no MiniMac.** Não avançar com
integração no processo da API até passar.
