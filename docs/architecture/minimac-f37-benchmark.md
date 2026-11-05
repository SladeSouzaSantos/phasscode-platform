# F3.7 — Benchmark ONNX isolado no MiniMac (sem deploy)

**Objetivo:** medir carga fria, RSS, indexação e p50/p95 por lote em um processo Docker Linux descartável do MiniMac, para complementar as medições feitas em runner GitHub. Não mede p95 HTTP nem tempo de resposta com um processo de modelo permanentemente quente.

**Requisitos:** um checkout **descartável e limpo** do repositório na branch `dev`, `python3`, Node.js, Docker e dependências JS instaladas apenas nesse checkout separado. **Não executar no diretório de produção** nem ler/alterar arquivos `.env`.

```bash
# Diagnóstico inofensivo: não baixa modelos nem executa inferência
bash scripts/benchmark_f37_minimac.sh --preflight

# Preparação voluntária da versão pública imutável; aceita download de pesos
mkdir -p "$HOME/f37-onnx-model"
bash scripts/benchmark_f37_minimac.sh --prepare-model "$HOME/f37-onnx-model"

# Caso necessário, instalar JS SOMENTE em uma cópia DEV descartável
npm ci --ignore-scripts

# Executar inferência em contêiner sem rede, com catálogo público e corpus sintético
bash scripts/benchmark_f37_minimac.sh --run "$HOME/f37-onnx-model"
```

O script verifica os pesos e tokenizer por SHA256, prepara um **contexto Docker mínimo**, sem segredos nem código da API, executa a inferência com `--network none --read-only`, 2 CPUs, limite de 2 GiB, sem PostgreSQL/Redis/Neo4j/LLM, e remove a imagem de laboratório ao final. Salva relatórios em `$HOME/orbe-f37-reports/...`; usa somente rótulos públicos do PPKS e casos sintéticos v2.

Compartilhar apenas a linha `F37_MINIMAC_REPORT` e o SHA da branch `dev`. O relatório permite comparar latência, cold start e memória com o runner GitHub, **não** comprova homologação Shadow. Medidas de processos quentes, falhas, budget em concorrência, revisão humana #41, OOV/negações e paridade HTTP seguem pendentes. Nenhum deploy remoto é acionado pelo script.
