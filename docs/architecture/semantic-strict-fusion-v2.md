# F3.7 — Regras para a segunda coorte lexical + ONNX

**Decisão de método antes da inferência v2:** commit de política **`8476d91f587c98a63ad9c716a25da360a6a47331`**. A implementação em [`scripts/f37_strict_literal.py`](../../scripts/f37_strict_literal.py) prioriza lexical **somente quando a cláusula inteira representa um único rótulo de competência existente no catálogo público**, opcionalmente precedido por marcadores de obrigação explícita como `Required:`, `Experience with`, `Experiência com` e `Domínio de`. Pontuação, menções incidentais, negações, conjunções, alternativas, tecnologia composta e vocabulário não catalogado **não** recebem prioridade lexical. Um match é apenas candidato de ranking, nunca evidência de experiência ou classificação da vaga.

**Segunda coorte (v2):** [`evaluation/semantic-embedding-adversarial-v2.json`](../../evaluation/semantic-embedding-adversarial-v2.json), congelada em manifesto próprio **antes do primeiro teste ONNX v2**. São 40 casos sintéticos PT/EN elaborados após a fixação da política: 20 paráfrases, 8 citações literais, 8 OOV e 4 controles de contexto/negação. Entre os 36 trechos com requisitos, 28 rótulos esperados estão no PPKS e 8 são OOV. A coorte é nova em relação ao teste anterior, **mas foi escrita pelo assistente, sem gold independente/humano**.

## Comparação pareada

O [comparador v2](../../scripts/evaluate_f37_strict_v2.py) confronta quatro condições no mesmo corpus, mesmo checkpoint ONNX fixo, mesmo glossário e mesmo catálogo: lexical baseline, ONNX enriquecido, lexical-first ingênuo (histórico) e override lexical estrito (novo). Ele exige 68 labels, modelo e glossário com revisões fixas, coerência de IDs e denominadores. Resultados incluem Recall@1/3/5, MRR, melhorias/regressões de top-1, categorias literal/paráfrase/OOV e controles.

- OONX não reconhece automaticamente OOV. Os oito exemplos OOV ainda produzem sugestões vetoriais arbitrárias; **não é permitido promovê-las** para qualificação profissional.
- **Contexto e negação são marcados pelo fixture e excluídos antes da recuperação.** Esse controle não prova que o Orbe tenha aprendido a identificar negações.
- O benchmark é isolado e não altera configurações, endpoint HTTP, fontes PPKS, GraphRAG, Neo4j, quota LLM nem resposta pública.
- Resultados desta coorte não podem ser usados para alterar a política e depois reivindicar melhora cega. Mudança posterior exigiria um terceiro conjunto não inspecionado e uma revisão humana independente.

## Próximos gates

A #41 precisa de aprovação humana explícita das 56 anotações do F3.4 com cobertura e omissões. A #42 precisa de política OOV/negações validada fora do corpus de autoria, e CPU/RAM/cold start medidos no MiniMac **sem alterar os serviços vivos**. A #44 somente poderá considerar Shadow após paridade HTTP e teste de rollback, mediante autorização separada. Nenhuma issue é fechada apenas com o benchmark sintético v2.

## Resultado observado (05/11/2026 UTC)

A execução [GitHub Actions #41965819023](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/41965819023) foi **SUCCESS** no ambiente descartável: a versão de política literal foi comprovadamente idêntica ao commit congelado anterior à escrita do corpus; SHA-256 do corpus v2 `b43201fbd362780edfdbb146ba5a8d5a88a79e8b9fba60fb3d00a47bca24426b`.

| Condição | Hits@1 / 28 | Recall@1 | Recall@3 | Recall@5 | MRR |
| --- | ---: | ---: | ---: | ---: | ---: |
| Lexical-first ingênuo (histórico) | 14/28 | 50,00% | 82,14% | 82,14% | 0,6660 |
| ONNX enriquecido, sem override | 17/28 | 60,71% | 78,57% | 78,57% | 0,7107 |
| **Override literal estrito + ONNX** | **22/28** | **78,57%** | **82,14%** | **82,14%** | **0,8148** |

O novo override atuou em **8 casos de citação explícita**, recuperando 8/8 em top-1 (o ONNX sozinho recuperou 3/8). Houve **5 correções e nenhuma regressão de Top-1** nesse subconjunto. Nas **20 paráfrases**, o override não foi acionado; o ONNX recuperou 14/20 em top-1. Nos **8 casos fora do catálogo**, o modelo continuou oferecendo um top-1 sem correspondência, **sem promovê-lo a competência comprovada**. As 4 não-exigências foram filtradas por **anotação oracular no fixture**, não por interpretação de modalidade operacional.

Memória de pico do ONNX no runner Linux descartável: **894,03 MiB**, cold load **1.438,39 ms**, indexação **850,99 ms**, consultas totais **319,28 ms**, p95 de lote de consultas **92,39 ms**. Não são métricas medidas no MiniMac nem no endpoint HTTP.

**Interpretação:** o desenho lexical estrito parece evitar a regressão do lexical-first indiscriminado, mas a amostra ainda foi escrita/rotulada pelo assistente, com exemplos sintéticos e marcadores explícitos definidos para testar a política. Não equivale a uma avaliação cega por revisor externo. Nenhum limiar OOV foi validado; não habilitar Shadow/Active. As issues #41 e #42 permanecem abertas.

**Próximo gate reproduzível:** o [script local do MiniMac](minimac-f37-benchmark.md) pode medir memória/latência em contêiner isolado e sem deploy, mas requer execução no hardware real em checkout DEV descartável. O pacote de revisão humana das 56 anotações originais também continua pendente.
