# F3.7 — Benchmark ONNX isolado no MiniMac (sem deploy)

**Objetivo:** medir carga fria, RSS, indexação e p50/p95 por lote em um contêiner Linux descartável do MiniMac, complementando os resultados em runner GitHub. Não mede p95 HTTP nem resposta com modelo permanentemente quente.

**Requisitos no host:** somente `git`, `bash`, `python3` e Docker. **Node.js e npm não precisam estar instalados no Linux:** todas as exportações JS e a instalação de dependências usam um contêiner separado `node:24-bookworm-slim`. O modelo ONNX é executado em outro contêiner com limites de recursos. Usar exclusivamente a cópia descartável `~/orbe-f37-lab`, branch `dev` e checkout limpo — **não** usar o checkout operacional em `/opt/projects/phasscode-platform-dev` nem alterar os serviços vivos.

```bash
cd "$HOME/orbe-f37-lab"
git pull --ff-only origin dev

# 1. Inspecionar host e clone SEM download/inferência
bash scripts/benchmark_f37_minimac.sh --preflight

# 2. Preparar o modelo com pesos públicos fixados e SHA256 verificado
mkdir -p "$HOME/f37-onnx-model"
bash scripts/benchmark_f37_minimac.sh \
  --prepare-model "$HOME/f37-onnx-model"

# 3. Baixar as dependências JS apenas para o clone experimental.
#    O npm roda em um contêiner temporário Node 24.
bash scripts/benchmark_f37_minimac.sh --install-js-deps

# 4. Inferir isoladamente e comparar os rankings, sem deploy
bash scripts/benchmark_f37_minimac.sh \
  --run "$HOME/f37-onnx-model"
```

O **`--preflight` não exige nem baixa Node.js**. O comando `--install-js-deps` pode baixar a imagem pública do Node e dependências npm; grava `node_modules` somente no checkout experimental, sob o UID do usuário `phass`, sem instalar nada globalmente. O comando `--prepare-model` baixa exclusivamente os pesos do modelo fixado no manifesto (sem depender de Node). No `--run`, o contêiner Node lê o repositório montado **somente para leitura, com `--network none`**, e o contêiner ONNX usa contexto Docker reduzido, `--network none --read-only`, 2 CPUs e limite de 2 GiB. Nenhum comando opera via `docker exec` nos contêineres de API, PostgreSQL, Neo4j, Redis ou Nginx.

O benchmark produz o conjunto `paired.json` e o resumo `F37_MINIMAC_REPORT` em `$HOME/orbe-f37-reports/...`; usa só rótulos públicos do PPKS e casos sintéticos v2. Compartilhar a **linha `F37_MINIMAC_REPORT`**, sem segredos ou arquivos `.env`. Aferições de warm steady-state, concorrência real, revisão humana da #41, OOV/negações e paridade HTTP ainda são pré-requisitos para promover Shadow/Active. **O script não dispara deploy.**
