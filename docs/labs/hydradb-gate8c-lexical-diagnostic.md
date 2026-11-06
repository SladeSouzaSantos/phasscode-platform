# Gate 8C — diagnóstico lexical de perguntas completas (LAB)

**Estado:** diagnóstico automatizado PASS; revisão independente pendente. Este documento NÃO é uma homologação de NLP nem de ganho semântico do HydraDB.

## Prova reproduzível

- Branch: experiment/hydradb.
- Fonte: knowledge/evaluations/hydradb-gate8-recruiter.json; SHA-256 ec5dcf8746b981ca00a65879db4293f493ed3ec33721c25904bd4d677aeefad0.
- Anotações separadas (assistente, provisórias): knowledge/evaluations/hydradb-gate8c-intent-draft.json; 20 perguntas sintéticas, 30 menções de tecnologias, duas menções em instrução negativa.
- Runner: GitHub-hosted, sem Tailscale, SSH, HydraDB, Neo4j, LLM ou dados privados.
- [GitHub Actions #42146070426](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42146070426): typecheck PASS, 9/9 testes Vitest PASS; marcadores GATE8C_DRAFT_STRUCTURAL_PARITY_PASS, GATE8C_WHOLE_QUESTION_LEXICAL_BASELINE_RECORDED, HYDRADB_GATE8C_OFFLINE_CI_PASS.

## Comparação, com limites

| Métrica de menções literais | Léxico atual | Alias TS experimental |
| --- | ---: | ---: |
| Menções esperadas pelo draft | 30 | 30 |
| Verdadeiros positivos contra draft | 29 | 30 |
| Falsos positivos contra draft | 0 | 0 |
| Falsos negativos contra draft | 1 | 0 |
| Casos com conjunto completo de menções | 19/20 | 20/20 |
| Precisão de menções | 1.0000 | 1.0000 |
| Recall de menções | 0.9667 | 1.0000 |
| F1 de menções | 0.9831 | 1.0000 |
| Menções negativas reconhecidas e marcadas mandatory=true | 2 | 2 |

**Falha encontrada:** na pergunta “Ele desenvolveu alguma aplicação usando TS?”, o identificador explícito não reconhece TS como TypeScript. Um alias TS→TypeScript **não aprovado e aplicado somente em memória no avaliador** identifica essa menção. Não foi alterada a taxonomia usada em runtime pelo Orbe.

**Outro limite crítico:** o identificador atual retorna mandatory=true em qualquer menção, inclusive nas duas instruções negativas envolvendo Go e Django. A tag mandatory é o formato do contrato, não uma inferência de obrigatoriedade ou de capacidade do candidato. O avaliador **não calcula** precisão de negação, papel da menção, escopo profissional/estudo, obrigatoriedade ou qualidade da resposta, pois o reconhecedor não produz essas previsões.

## Método e segregação

O script evaluation/hydradb-gate8c-intent-diagnostic.ts executa createCatalogRequirementIdentifier sobre o **texto integral** de cada pergunta. Para cada caso, compara o conjunto de labels detectados com as menções literais anotadas por autor assistente. Garante integridade do hash de fonte, IDs, spans UTF-16, rótulos, papel da negação e cobertura; comparação com alternativa de alias TS ocorre isoladamente, sem modificar catálogo ou API.

A pontuação é CONCORDÂNCIA COM ANOTAÇÃO PROVISÓRIA DO MESMO AUTOR. A hipótese TS foi derivada do corpus, não avaliada em holdout. Mesmo 100% aqui não informa acurácia de NLP em produção nem ganho de HydraDB. Os testes não consultam evidências, vértices, fontes ou o banco.

Comandos locais, sem internet, em checkout com node_modules instalados:

~~~bash
npm run typecheck
./node_modules/.bin/vitest run tests/gate8c-intent-diagnostic.test.ts
node --import tsx scripts/gate8c-intent-diagnostic.ts
~~~

## O que falta antes de declarar o Gate 8C encerrado

1. Revisor humano independente, com [packet de perguntas sem anotações](hydradb-gate8c-human-review-packet.md), marca os spans, conceitos, negações, papel e escopo sem consultar rótulos ou resultados anteriores.
2. Registrar data, revisor, divergências e revisão de gold. O protocolo deve permitir correção dos rótulos provisórios; nunca rotular automaticamente como human-approved ao passar na CI.
3. Introduzir holdout novo (ou perguntas reais anonimizadas e autorizadas), separado do conjunto usado para criar TS. Aferir a generalização do léxico.
4. Se quisermos medir interpretação de intenção/escopo/negação, utilizar classificador que realmente emita essas previsões e contabilizar seus erros. Não usar flags de referência como previsões do modelo.
5. Manter essa avaliação separada de benchmarks de HydraDB × Neo4j e de qualquer geração de prosa do Orbe.

**Decisão provisória:** preservar o léxico atual, registrar a lacuna TS e a incapacidade de classificar negações; não adicionar modelo ONNX/LLM automaticamente. Trabalhar em paralelo na trilha de compatibilidade do motor, com segurança, antes de um benchmark comparativo controlado.
