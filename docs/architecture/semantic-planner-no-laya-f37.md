# ADR F3.7 — SemanticPlanner independente de Laya

**Decisão:** aceita em 04/11/2026 para a linha de desenvolvimento `dev`.  
**Escopo:** arquitetura e contrato diagnóstico, não aprovação de deploy, Shadow ou Active.  
**Relacionadas:** [#40](https://github.com/SladeSouzaSantos/phasscode-platform/issues/40), [#41](https://github.com/SladeSouzaSantos/phasscode-platform/issues/41), [#42](https://github.com/SladeSouzaSantos/phasscode-platform/issues/42), [#43](https://github.com/SladeSouzaSantos/phasscode-platform/issues/43), [#44](https://github.com/SladeSouzaSantos/phasscode-platform/issues/44), [#45](https://github.com/SladeSouzaSantos/phasscode-platform/issues/45).

## Contexto e motivação

A PoC da Laya Multilingual não apresentou ganho mensurável para classificação de requisitos no domínio do Orbe. A execução [#41952853665](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/41952853665) comparou 47 spans **sintéticos e previamente delimitados** nos mesmos casos PT/EN:

- Papel correto: 15/47; relação correta: 18/47.
- Papel e relação simultaneamente corretos, antes do gate: 7/47.
- Falsas promoções positivas entre saídas brutas: 14; três relacionadas a negações.
- Abstenções com limiar diagnóstico 0,85: 47/47. Zero falsos positivos **aceitos** aqui significa zero decisões aceitas, não modelo confiável.
- Pico de memória: cerca de 2,25 GiB; p95 de aproximadamente 505 ms por par de perguntas no runner, **não** no MiniMac.

O gate determinístico resolveu 21/47 spans sem erro no mesmo conjunto **depois** de correções motivadas pelo próprio corpus. Esse resultado é **pós-hoc e não cego**, sem evidência de generalização. A recuperação semântica ONNX também requer conjunto independente, falsos positivos, RAM e p95 no hardware real antes de qualquer promoção.

## Decisão

**Laya não é dependência da arquitetura do Orbe.** A linha de integração Laya foi rejeitada para esta versão, sem afirmar impossibilidade de outro experimento futuro. A PoC fica arquivada no histórico da issue #43, sem pesos em imagens de produção e sem acoplamento à API.

O pipeline pretendido é:

1. Texto original da vaga, imutável, com segmentação, offsets e cobertura rastreável;
2. Busca lexical para tecnologias explícitas e negativas;
3. Ranking ONNX **opcional** somente de rótulos candidatos do catálogo público PPKS, sem transformar similaridade em prova ou classificação;
4. Classificador determinístico de modalidade, negação, alternativa e relação, com **abstenção** quando há conflito ou escopo desconhecido;
5. **Opcionalmente**, a LLM generativa já utilizada pelo Orbe pode sugerir uma decisão tipada para ambiguidade residual, usando o mesmo controlador de orçamento, timeouts e auditoria existente, **sem chamada obrigatória por requisito**;
6. Validador de integridade e completude dos spans; alternativas, unknowns, negações e itens fora de escopo não podem desaparecer;
7. Recuperação pelo PPKS e Graph Reader de claims públicos com fonte HTTPS verificável;
8. Resposta canônica ou GraphRAG somente após verificação factual, mantendo fallback PPKS.

A etapa 5 **não foi implementada no novo SemanticPlanner**. O normalizador orçamentado existente, `graph-semantic-vacancy.ts`, é uma capacidade separada e não autoriza automaticamente inferir papéis ou fatos do candidato.

## Contrato inicial entregue em DEV

`apps/orbe-node/src/application/semantic-planner-port.ts` define `SemanticPlannerPort` e `validateSemanticPlannerProposal` com schemas Zod estritos.

- **Somente diagnóstico:** saída com `mode=diagnostic_only`; sem caminho para geração de resposta ou chamada à API.
- **Proveniência:** ID, offsets e excerto idênticos ao texto de entrada; mesmo conjunto de IDs, sem exclusão, duplicidade ou sobreposição.
- **Sem provas inventadas:** rótulos de competências só podem indicar IDs públicos do PPKS conhecidos no input; campos extras como `claimIds` são rejeitados.
- **Sem certeza falsa:** score de busca não é probabilidade de experiência; a tipagem impede promover contexto de empresa a prioridade da vaga e exige agrupamento explícito para alternativas.
- **Abstenção explícita:** papel `uncertain`, relação nula, prioridade `none`, origem nula e zero candidatos; nunca contar como acerto ou requisito atendido.
- **Sem serviços novos:** nenhum modelo adicional, container, flag, conexão de banco, rede ou segredo do Orbe é exigido.

Um contrato não comprova a interpretação **semântica** correta de uma frase. A eventual ligação ao LangGraph precisa de normalização adicional, provas de cobertura e auditoria de requisitos completos. Não associar `suggested` a `verified`.

## Gates antes de Shadow

- #41: gold set revisado por humano e novo holdout independente PT/EN, incluindo vagas longas, negações e alternativas.
- #42: comparação ONNX versus lexical em dados cegos e negativos difíceis; medição real de CPU/RAM/latência e política de cache por SHA.
- #44: testes de contrato, parity pública com Shadow, fallback sem LLM adicional, limites de latência, telemetria sem texto de visitante e rollback `off -> shadow -> off`.
- #45: benchmark controlado PPKS / GraphRAG Active / Semantic Shadow no mesmo corpus e ADR de rollout.

Não alterar `main`, produção, MiniMac, quotas LLM, PostgreSQL, Redis ou Neo4j por esta decisão. Os workflows disparados por push na `dev` são qualificação de código; deploy remoto requer ação manual explícita. O código antigo da PoC Laya fica **arquivado para auditoria e reprodutibilidade**, não para integração operacional.
