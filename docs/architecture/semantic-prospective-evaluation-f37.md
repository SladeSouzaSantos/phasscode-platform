# F3.7 — Benchmark prospectivo: recuperação lexical versus ONNX

**Estado:** benchmark offline executado com sucesso em 05/11/2026 (UTC), na branch `dev`, sem alterações na API, Neo4j, LangGraph, `main` ou MiniMac. **Não aprovado para Shadow/Active.**

- Execução reproduzível: [GitHub Actions #41959079571](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/41959079571).
- Fonte: [corpus prospectivo v1](../../evaluation/semantic-embedding-prospective-v1.json) e [manifesto congelado](../../evaluation/semantic-embedding-prospective-v1.manifest.json).
- SHA-256 do corpus: `8d4d65613bcee63f91d29c865f2b2a2ae30f466ac6013a9ffc1feb80442dd6ed`.
- Modelo: `Horizon-Labs/multilingual-embedding-small`, revisão `033028575b040790aef3064b2a045245ee54d238`, ONNX INT8 quantizado de 1024 dimensões, pesos e tokenizer verificados por SHA-256.
- Glossário anterior imutável: SHA-256 `6734b677a4b73b672e929ee8524dc83e4ba9364f252de9adcf32109c4ab0bf60`, **31 descrições curadas antes deste teste**.
- Método: **44 casos PT/EN, 40 candidatos e 4 contextos/negações segregados pelo próprio fixture**; entre os 40 candidatos, **34 rótulos existentes no catálogo PPKS** e **6 rótulos fora do catálogo**. Recuperação sobre o mesmo catálogo público de **68 tecnologias**. Nenhuma decisão foi promovida ao Orbe.
- Limitação: corpus novo foi redigido antes da execução do modelo nesta coorte, mas seu autor conhecia o glossário anterior; rótulos são sintéticos e não revisados por humano. Isto é teste prospectivo de reformulação, **não validação cega independente da taxonomia**.

## Resultados no mesmo corpus e denominador de 34 rótulos recuperáveis

- **Lexical:** Recall@1 **23,53%**, Recall@3 **23,53%**, precisão lexical entre menções **53,33%**, **7 falsos positivos lexicais** e **26 falsos negativos**.
- **ONNX, indexando somente nomes:** Recall@1 **29,41%**, Recall@3 **41,18%**, Recall@5 **55,88%**, MRR primeiro acerto **0,4115**; entre as 26 paráfrases, somente **6 hits@3**.
- **ONNX, nomes e glossário preexistente:** Recall@1 **67,65%**, Recall@3 **82,35%**, Recall@5 **88,24%**, MRR **0,7548**; **21/26 paráfrases** tiveram o rótulo certo em top-3.
- Entre as oito consultas explícitas, o ONNX enriquecido recuperou **7/8** em top-3; a versão só com nomes recuperou **8/8**. O enriquecimento pode causar regressões em casos literais e não pode dispensar a busca lexical.
- **Contextos/negações:** quatro trechos foram excluídos do ranking **porque o fixture já indicava sua modalidade**. Isso **não prova** que o ONNX ou as regras consigam classificar a vaga completa.
- **OOV:** seis necessidades não existem no catálogo. O ranker ONNX ainda produz top-1 mesmo assim; esse comportamento deve ser tratado como **candidato incerto/unknown**, nunca `verified`. Não há limiar de similaridade calibrado. O relatório não mede taxa de falsos positivos *aceitos*, pois não existe gate de aceitação ativo.

## Comparação histórica, mas NÃO pareada

O glossário obtivera Recall@1 de **92,86%** em 14 rótulos conhecidos no conjunto anterior, curado após observação das perguntas (pós-hoc). No novo conjunto prospectivo de **34 rótulos conhecidos**, o Recall@1 é **67,65%**. Não subtrair essas porcentagens como se as amostras fossem iguais. O segundo resultado reduz a confiança em generalização a partir do primeiro, mas ainda não constitui gold set externo.

## Custos no runner GitHub descartável (não no Mac Mini)

- **ONNX nomes apenas:** pico de RSS **887,72 MiB**, carga **1425,7 ms**, indexação **193,78 ms**, inferência do conjunto de consultas **395,51 ms**.
- **ONNX com glossário:** pico de RSS **893,47 MiB**, carga **1423,78 ms**, indexação **848,56 ms**, inferência de consultas **395,42 ms**; p95 por lote de consultas **85,02 ms**.
- Inferência **CPU-only** com 2 CPUs, limite 2 GiB, contêiner `--network none --read-only`. Tempo por lote não é p95 HTTP, nem latência fim a fim do Orbe. **Nenhuma LLM externa, rede do modelo ou consulta Neo4j foi utilizada**.

## #41 — Auditoria do corpus F3.4 anterior

O script [`scripts/audit_f37_gold.py`](../../scripts/audit_f37_gold.py) verifica 9 cenários do F3.4, **56 spans provisórios** e **11 incertos**. Todos os offsets batem com as mensagens originais. Três cenários são perguntas acadêmicas, com relação histórica `academic_question`; **não são vagas**. Nenhum dos 56 spans possui revisão humana confirmada. O resultado não prova cobertura exaustiva dos textos nem ausência de requisitos omitidos; a #41 continua aberta.

## Decisão e próximos gates

1. **Manter ONNX fora do runtime**, como modelo *candidato* para ranking de labels públicos. Rejeitar seu uso como classificador de requisito ou evidência profissional.
2. **Preservar lexical** para menções inequívocas; planejar avaliação de fusão lexical-first com parâmetros pré-declarados em conjunto separado, garantindo que a fusão não suprima alternativas ou negativos.
3. **#41:** revisão humana de 56 spans e auditoria de cobertura das seis perguntas de recrutadores; produzir outra amostra independente com hard negatives, OOV e casos longos antes de calibrar thresholds.
4. **#42:** avaliação de falsos positivos na saída final, orçamento CPU/RAM/cold start no MiniMac e métricas por idioma/consulta de negócio, sem tocar serviço vivo.
5. **#44:** contrato tipado já implementado e validado; somente depois de gates #41/#42 considerar Shadow DEV com saída pública invariável, fallback e rollback.
6. **#45:** comparação HTTP PPKS × GraphRAG Active × Semantic Shadow com mesmo corpus e auditoria factual/humana; ainda pendente.

**Nenhuma issue adicional pode ser encerrada por este benchmark isolado.** A #43 (Laya) já foi encerrada com decisão negativa e seu histórico permanece arquivado.
