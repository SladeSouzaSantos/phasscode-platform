# F3.7/#42 — PoC de embeddings ONNX INT8, isolada e sem deploy

**Status:** laboratório experimental, **não integrado** ao chat/GraphRAG. Não fornece comprovação de experiência; o objetivo é comparar **ranking de candidatos de skills do PPKS** contra o baseline lexical. **Nenhum modelo é baixado no build, CI de release ou startup da API.**

## Identidade e integridade do modelo

- Repositório: [Horizon-Labs/multilingual-embedding-small](https://huggingface.co/Horizon-Labs/multilingual-embedding-small).
- Checkpoint **imutável** e checksums dos artefatos em [`evaluation/semantic-embedding-onnx-manifest.json`](../../evaluation/semantic-embedding-onnx-manifest.json). Inspeção em 2026-11-04 via API do Hugging Face e arquivo oficial `SHA256SUMS`.
- ONNX quantizado INT8, cerca de **269 MB**, `sentence_embedding` de **1024 dimensões**, vetores normalizados; até 512 tokens (limite de laboratório: **256 tokens**). Licença anunciada Apache-2.0, sujeita à revisão jurídica/supply chain antes de promoção.
- **Dois arquivos permitidos no download:** `onnx/model_quantized.onnx` e `tokenizer.json`. O downloader faz streaming para arquivo temporário, verifica SHA-256 e só então promove atomicamente para a pasta do modelo. Se houver divergência, falha sem usar arquivo suspeito.
- O laboratório não usa `trust_remote_code`, `transformers` ou um checkpoint remoto na inferência; executa o ONNX local no CPU Execution Provider do `onnxruntime` e carrega o tokenizer como arquivo JSON local.

## Dados de entrada e denominadores

1. `evaluation/semantic-hybrid-corpus-v0.json`: **16 cenários sintéticos, 31 spans** provisórios, não validados por humanos. Os exemplos já têm offsets e papéis anotados.
2. `scripts/export-semantic-skill-catalog.ts`: exporta **apenas nomes e IDs dos nós de tecnologia** da projeção PPKS, nunca claims, histórias profissionais, fontes privadas ou cursos.
3. `scripts/evaluate-semantic-lexical.ts`: gera a referência lexical sobre **o mesmo corpus**. O runner ONNX verifica os mesmos denominadores `cases`, `expectedInCatalog`, `expectedOutOfCatalog`.

Métricas: recall@1/@3/@5, MRR do primeiro acerto conhecido, quantidade de termos fora do catálogo, top1 divergente, latência de carga, indexação, consulta (p50/p95 de lotes), pico de RSS e versões da runtime.

**Não reportar "precisão factual" a partir dessas métricas:** o modelo ranqueia todos os 68 nomes catalogados mesmo quando não há experiência, há negação ou o item está fora do catálogo. Os trechos contextuais são ignorados **porque o fixture forneceu esse papel**. O Laya ainda não foi integrado. Portanto nem o método lexical nem embeddings classificam a obrigatoriedade nesta PoC.

## Reproduzir em um runner Linux descartável

Primeiro, num checkout de laboratório **fora do MiniMac operacional**, com Node 24 e dependências de teste:

```bash
npm ci --ignore-scripts
mkdir -p /tmp/orbe-f37-model
node --import tsx scripts/export-semantic-skill-catalog.ts > /tmp/semantic-skill-catalog.json
node --import tsx scripts/evaluate-semantic-lexical.ts > /tmp/semantic-lexical-reference.json
python3 -m unittest discover -s tests -p test_semantic_embedding_lab.py -v
```

O **download verificado** é uma etapa explicitamente separada e com rede somente durante sua execução:

```bash
python3 scripts/semantic_embedding_lab.py prepare --model-dir /tmp/orbe-f37-model
python3 scripts/semantic_embedding_lab.py verify --model-dir /tmp/orbe-f37-model
```

Construir a imagem de CPU para avaliar sem rede:

```bash
docker build -f infrastructure/docker/Dockerfile.semantic-embedding-lab -t orbe-f37-onnx-lab:local .
docker run --rm --network none --read-only \
  --cap-drop ALL --security-opt no-new-privileges \
  --cpus 2 --memory 2g --pids-limit 128 \
  --tmpfs /tmp:rw,nosuid,nodev,size=64m \
  --user "$(id -u):$(id -g)" \
  --mount "type=bind,src=/tmp/orbe-f37-model,dst=/models,readonly" \
  --mount "type=bind,src=/tmp/semantic-skill-catalog.json,dst=/lab/catalog.json,readonly" \
  --mount "type=bind,src=/tmp/semantic-lexical-reference.json,dst=/lab/lexical.json,readonly" \
  orbe-f37-onnx-lab:local benchmark \
  --model-dir /models --catalog /lab/catalog.json --lexical-report /lab/lexical.json
```

> O caminho `/tmp` é intencional para runner descartável. Não instalar pesos/Node/Python nem sobrescrever a árvore `/opt/projects/phasscode-platform-dev` do MiniMac. Em um runner GitHub Actions os arquivos podem ficar em `$RUNNER_TEMP` antes de serem montados no Docker.

## Segurança e limites

- **Rede do benchmark desabilitada;** `--read-only`, sem segredos, sem conexão ao projeto Compose DEV ou volumes de bancos.
- Não usar entradas reais de visitantes, documentos privados nem chaves externas. Relatórios contêm somente IDs sintéticos, números agregados e hashes de modelo.
- Cache e índice não são persistidos nesta PoC, pois o catálogo tem poucas dezenas de rótulos. Reavaliar versão do PPKS e cache apenas após benchmark.
- Limites de 2 CPU / 2 GiB definidos **para o laboratório**, não promessas de que o MiniMac suportará os dois modelos Laya + embeddings. Falhas de memória devem bloquear integração.
- A classificação de `mandatory/desirable/alternative/context/negated` será avaliada separadamente em [#43](https://github.com/SladeSouzaSantos/phasscode-platform/issues/43).
- A integração ao LangGraph permanece **default OFF** [#44](https://github.com/SladeSouzaSantos/phasscode-platform/issues/44). A aceitação necessita corpus revisado [#41](https://github.com/SladeSouzaSantos/phasscode-platform/issues/41), regressões e comparação F3.4.
