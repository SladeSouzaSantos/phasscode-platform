# F3.7/#42 — Baseline lexical de recuperação de rótulos do PPKS

**Status:** implementado para avaliação offline; métricas ainda são provisórias, **não há modelo instalado**.  
**Branch:** `dev`, sem alteração nos serviços do Orbe e sem deploy.

## O que é medido

O script `npm run eval:orbe:semantic:lexical` extrai os rótulos de tecnologia do **snapshot real PPKS** e utiliza o identificador de correspondência lexical da F3.3. Reproduz o corpus sintético `evaluation/semantic-hybrid-corpus-v0.json` (16 casos, 31 spans).

Cada exemplo já tem um **span fornecido pelo fixture**, com papel/relação definidos provisoriamente. O programa mede apenas se o identificador recupera os IDs de habilidades esperados **naquele trecho**. O baseline NÃO encontra spans na vaga inteira, NÃO compreende prioridades ou relações por conta própria e NÃO infere comprovação de experiência.

- `expectedInCatalog`: quantos rótulos esperados realmente existem no PPKS.
- `expectedOutOfCatalog`: nomes que não fazem parte do catálogo e **não entram no denominador de falsos negativos**. Não deduzir que eles não são requisitos da vaga.
- `lexicalTruePositives`, `lexicalFalsePositives`, `lexicalFalseNegatives`: confrontam somente IDs já existentes no PPKS contra os alvos do fixture.
- `lexicalPrecision`, `lexicalRecall`, `lexicalRecallAt1`, `lexicalRecallAt3`, `lexicalMrrFirstKnown`: medidas descritivas da detecção lexical por trecho. **A ordem de menção não é ranking vetorial**, e a acurácia dessas medidas não é um ganho de GraphRAG nem de LLM.
- `quarantinedLexicalMentions`: menções lexicais em trechos de negação/contexto/stack de empresa que seriam falsamente promovidas a requisitos por simples busca de palavras. O filtro que as isola **usa o rótulo de relação presente no fixture**, não um classificador implementado.
- `ambiguousSpans`: spans candidatos marcados como `uncertain` pelo corpus provisório; não são elegíveis automaticamente.

Os relatórios imprimem IDs públicos dos fixtures e agregados. Não incluem prompts completos, mensagens de visitantes, textos privados ou segredos. Consulta de grafo = 0; chamadas de LLM = 0; vetores = 0.

## Como reproduzir

No checkout de desenvolvimento que possua Node e dependências de teste:

```bash
npm ci --ignore-scripts
npm run eval:orbe:semantic:coverage
npm run eval:orbe:semantic:lexical
npx vitest run tests/semantic-hybrid-lexical-baseline.test.ts
```

**Mac Mini:** não instalar dependências no checkout usado pelo deploy. Caso o host não disponha de Node, usar um contêiner de teste descartável, com build `--target test` e montagem **somente leitura** do diretório `evaluation`. O avaliador nunca altera bancos, Reader, Neo4j, Redis, quotas ou serviços. O comando acima não requer `OPENROUTER_API_KEY` ou outras chaves.

## Próximos gates

1. Congelar e revisar com pessoa responsável os rótulos do fixture (#41), corrigindo pré-conceitos e casos em que uma barra representa _ou_, _e_, versão ou outro qualificador.
2. Executar baseline lexical e registrar relatório com SHA e versão do catálogo PPKS.
3. Rodar o **mesmo corpus/denominadores** com `Horizon-Labs/multilingual-embedding-small` em laboratório isolado (#42), medindo Recall@k/MRR, FPR, RAM, CPU, latências e termos fora do catálogo.
4. Avaliar `convaiinnovations/laya-multilingual` em separado como classificador de **papel e relação** (#43), com calibração e restrição de segurança.
5. Somente após benchmark, aprovar proposta de shadow (#44) e comparar qualidade das respostas HTTP (#45).

**Critério invariável:** a similaridade vetorial escolhe candidatos a evidência, mas **não comprova** tecnologia, experiência profissional, empresa, curso ou vínculo. Casos desconhecidos e cláusulas não interpretadas não devem desaparecer da vaga.
