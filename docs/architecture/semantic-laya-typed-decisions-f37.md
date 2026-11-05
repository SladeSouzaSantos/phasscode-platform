# F3.7/#43 — Laboratório Laya Multilingual para decisões tipadas

**Estado:** PoC experimental, **não integrada à API, PPKS, Graph Reader ou LangGraph**. Não há autorização para integrar confidence/score à decisão pública; isso exige avaliação cega, calibração e aceite.

## Objetivo

Dado um trecho de uma vaga já segmentado e seu texto completo, classificar **duas dimensões independentes** por perguntas tipadas `choice`, sem geração de texto:

- **Papel da expressão:** `mandatory`, `desirable`, `alternative`, `context`, `negated`, `uncertain`.
- **Relação com a vaga:** `candidate_requirement`, `company_stack`, `future_stack`, `project_claim`, `unrelated`.

Exemplo: *"Usamos Go internamente, mas precisamos de Java"*. Go é contexto de stack da empresa; Java é requisito do candidato. Nenhum resultado dá direito a inferir que o candidato possui as tecnologias.

O classificador **não identifica spans automaticamente** nesta fase. Recebe os offsets e os papéis de referência em `evaluation/semantic-hybrid-corpus-v0.json`. Logo, os números de acerto medem **classificação condicional a trechos pré-selecionados**, não extração de requisitos em vagas reais.

## Identidade e integridade

- [`evaluation/semantic-laya-manifest-v0.json`](../../evaluation/semantic-laya-manifest-v0.json): checkpoint `convaiinnovations/laya-multilingual` fixado pelo commit de 40 caracteres no Hugging Face e SHA-256 de `model.safetensors` e `tokenizer/tokenizer.json` retornados pela API oficial de árvores do repositório (LFS).
- SDK fixado em `laya==0.4.22`; PyTorch CPU separado, sem GPU e sem uso do Router de múltiplos modelos.
- `scripts/laya_semantic_lab.py prepare` faz o **único download permitido** e valida os dois SHA-256 antes de permitir a próxima etapa.
- `scripts/laya_semantic_lab.py benchmark` valida o diretório local e ativa `HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1` antes de carregar o checkpoint. Executar em contêiner `--network none --read-only`.
- `infrastructure/docker/Dockerfile.semantic-laya-lab` é independente das imagens da API, Graph Reader e Neo4j. Pesos jamais entram no repositório, build da aplicação ou filesystem do MiniMac operacional.

## Interpretação correta da confiança

O próprio fornecedor documenta que o checkpoint multilíngue **é distribuído sem calibração específica**, com superconfiança mensurável, e que tarefas zero-shot de decisões tipadas podem aproximar-se da chance. Portanto:

- `answer_confidence` não é probabilidade de experiência de Pedro nem garantia de que uma classificação está correta.
- Os limiares e a quantidade de abstenções são **apenas diagnósticos**, nunca gates de produção; erros de confiança alta devem ser relatados explicitamente.
- A PoC utiliza 16 exemplos sintéticos inicialmente, podendo ampliar sem dados reais de visitantes. Nenhum ECE confiável pode ser reportado com esse tamanho; usar conjunto rotulado independente e amostra adequada antes de considerar calibração.
- A relação `candidate_requirement` significa que a **vaga solicita** algo, jamais que o **candidato possui** a habilidade.
- Qualquer caso ambíguo, desconhecido ou inconsistência deve continuar no PPKS canônico na futura integração; não descartar os trechos difíceis.

## Execução proposta

Testes sem modelo:
```bash
python3 -m unittest discover -s tests -p test_laya_semantic_lab.py -v
python3 scripts/laya_semantic_lab.py dry-run --model-dir /tmp/nao-utilizado --max-spans 16
```

Em um runner temporário com acesso à rede permitido **apenas no prepare**:
```bash
docker build -f infrastructure/docker/Dockerfile.semantic-laya-lab -t orbe-f37-laya-lab:temp .
mkdir -p /tmp/orbe-laya-checkpoint
docker run --rm --cpus 2 --memory 5g --user "$(id -u):$(id -g)" \
  -e HF_HOME=/tmp/hf \
  --tmpfs /tmp:rw,nosuid,nodev,size=256m \
  --mount type=bind,src=/tmp/orbe-laya-checkpoint,dst=/models \
  orbe-f37-laya-lab:temp prepare --model-dir /models
docker run --rm --network none --read-only --cpus 2 --memory 5g \
  --cap-drop ALL --security-opt no-new-privileges --pids-limit 128 \
  --tmpfs /tmp:rw,nosuid,nodev,size=256m \
  --user "$(id -u):$(id -g)" \
  --mount type=bind,src=/tmp/orbe-laya-checkpoint,dst=/models,readonly \
  orbe-f37-laya-lab:temp benchmark --model-dir /models --max-spans 16
```

**Observação:** a execução acima contém o download do modelo em uma árvore temporária. Não executar esses comandos no MiniMac: a prioridade é preservar CPU/RAM dos serviços operacionais. A execução real ocorre em GitHub Actions descartável.

## Critérios para próxima etapa

1. Tipos e proveniência validados, sem chamadas a LLM/Neo4j e sem afetar tráfego.
2. Medição com matrizes de confusão, erros de negação/alternativas, erros de confiança alta, latência e RSS.
3. Revisão humana dos dados [#41](https://github.com/SladeSouzaSantos/phasscode-platform/issues/41) e coorte PT/EN independente. Um resultado bom no corpus sintético não autoriza o uso em produção.
4. Somente então considerar adapter `shadow` [#44](https://github.com/SladeSouzaSantos/phasscode-platform/issues/44) com flag OFF, fallback, orçamento de memória e auditoria factual.
