# ADR em elaboração — F3.7 Semântica híbrida local para o Orbe

**Status:** proposta técnica, **não implantada**, revisão humana e benchmark pendentes.  
**Branch alvo:** `dev` somente. **Épico:** [#40](https://github.com/SladeSouzaSantos/phasscode-platform/issues/40).  
**Dependências de aceite:** [F3.4/#31](https://github.com/SladeSouzaSantos/phasscode-platform/issues/31), [F3.5/#32](https://github.com/SladeSouzaSantos/phasscode-platform/issues/32).

## Motivação / evidência de base

No corpus `evaluation/vacancies-ppks-v12.json`, o avaliador offline v2 (SHA `a936180a`) observou **9 casos / 9 turnos, 2 preview verified vs 0 Active-policy verified**, 9 cláusulas não interpretadas no total. **0 chamadas LLM e 0 consultas Neo4j**. São indicadores de **cobertura da política offline**, não de qualidade do modelo generativo nem benchmark de Neo4j. O runtime DEV no SHA `89a120a8` já homologou 5/5 respostas curtas HTTP em Active com fontes; não degradar esse comportamento.

## Hipótese, não premissa

Um pipeline de **extração estruturada + recuperação semântica local + classificação tipada de casos ambíguos** pode melhorar a cobertura de vagas em português mantendo a proveniência e os limites do PPKS/GraphRAG. Não assumir que o classificador é mais preciso ou mais barato que o parser sem benchmark.

## Modelos candidatos (revisão/licença/consumo a confirmar no laboratório)

| Finalidade | Checkpoint inicial | Papel estrito |
| --- | --- | --- |
| Recuperação e ranking de candidatos | [Horizon-Labs/multilingual-embedding-small](https://huggingface.co/Horizon-Labs/multilingual-embedding-small) (141M, 1024 dimensões; ONNX int8 candidato) | Aproximar **rótulos públicos do PPKS**, nunca afirmar comprovação |
| Decisão semântica ambígua | [convaiinnovations/laya-multilingual](https://huggingface.co/convaiinnovations/laya-multilingual) (322M) | Classificar modalidade, negação e relação para **spans originais** |
| Síntese textual | LLM canônica + fallback atual do Orbe | Formular narrativa **após** verificar evidências, sob auditoria factual |

Ambos os cartões indicam licença Apache-2.0; **pin de revisão, checksum, revisão de dependências, precisão em PT/EN e requisitos de CPU/RAM** são gates de laboratório. A confiança de Laya é pontuação do classificador em uma tarefa; não é a probabilidade de Pedro possuir competência. Similaridade cosseno de embeddings **não é probabilidade**.

## Pipeline proposto

```text
Vaga original (imutável)
  -> segmentação em cláusulas + offsets e cobertura total
  -> interpretação determinística, itens explícitos/negações/alternativas
  -> embeddings (top-k candidatos do catálogo público PPKS)
  -> Laya Multilingual (somente spans ambíguos; decisões tipadas)
  -> auditor de integridade: cada span representado, unknown preservado,
     alternativa não convertida em conjunção, negação não invertida
  -> consulta pública verificada via Graph Reader/PPKS
  -> geração canônica + factual guard da F3.3
```

**Fallback:** ao detectar ambiguidade residual, falta de versão do modelo, HTTP 503, timeout, problema de fonte, orçamento de recursos, contradição ou exclusão de requisito → **PPKS canônico**. Nunca retirar requisitos para elevar artificialmente a elegibilidade `verified_graph`.

## Contrato candidato (ainda não é API pública)

```ts
type SemanticSpan = Readonly<{
  start: number; // índice na string original, inclusivo
  end: number;   // exclusivo
  text: string;  // deve ser === source.slice(start, end)
  role: 'mandatory' | 'desirable' | 'alternative' | 'context' | 'negated' | 'uncertain';
  relation: 'candidate_requirement' | 'company_stack' | 'future_stack' | 'project_claim' | 'unrelated';
  alternativeGroup?: string;
  candidates: readonly { skillId: string; score: number; method: 'lexical' | 'embedding' }[];
  classification?: { label: string; confidence: number; modelRevision: string };
}>;
```

Este é **contrato candidato**, não autorização para atribuir competências. Toda consulta ao grafo ainda requer `sourceIds` públicos íntegros, fonte HTTPS e escopo profissional/projeto/estudo correto. Nomes de tecnologias novas no texto da vaga permanecem desconhecidos até corresponderem à fonte literal ou terem equivalência curada; nunca inferir por semelhança.

## Serviços, flags e segurança

- `ORBE_SEMANTIC_HYBRID_ENABLED=false` é **nome de flag proposto**, **não existe ainda no serviço**.
- Primeiro PoC offline de `evaluation/semantic-hybrid-corpus-v0.json` com corpus sintético e anotação pendente. Em seguida, shadow DEV sem alterar output público. Só posteriormente discutir Active.
- Modelos e caches em processo/container **separado** da API, de `graph-reader`, Neo4j, PostgreSQL e Redis. **Não baixar pesos no Dockerfile da API**.
- Sem acesso a dados pessoais, chaves de API, conversa de visitantes, tokens, autenticação, volume do banco ou rede dos serviços operacionais.
- Download inicial autorizado e pinado; execução dos benchmarks sem rede por padrão; logs somente contagens, IDs de fixture, SHA/revisões e latências, sem conteúdo original de usuários.
- Monitorar RSS, CPU, tempo de cold start, p50/p95, incidentes e disponibilidade antes de decidir se a infraestrutura suporta a carga.
- Preferir indexação determinística por PPKS `sourceCommit` + versão do modelo + dimensão dos embeddings; invalidar cache na mudança do catálogo.
- Mesmo em shadow, nenhuma probabilidade bruta ou decisão do modelo pode ser exposta como fato para recrutadores.

## Plano e critérios de aceite

1. [#41](https://github.com/SladeSouzaSantos/phasscode-platform/issues/41): revisar corpus F3.4 e rotular verdade-terreno, incluindo positivos, negativos, PT/EN, frases longas, alternativas e negações.
2. [#42](https://github.com/SladeSouzaSantos/phasscode-platform/issues/42): PoC retrieval embeddings; Recall@k, MRR, falsos positivos, CPU, RAM e latência.
3. [#43](https://github.com/SladeSouzaSantos/phasscode-platform/issues/43): PoC Laya Multilingual; qualidade tipada, matriz de confusão, limiares/abstenção, latência.
4. [#44](https://github.com/SladeSouzaSantos/phasscode-platform/issues/44): introduzir porta e adapter `shadow` **apenas após os PoCs**; fallback exercitado.
5. [#45](https://github.com/SladeSouzaSantos/phasscode-platform/issues/45): benchmark comparativo e decisão documentada; nenhuma promoção sem aceite.

**F3.4 não precisa estar encerrada para iniciar #41–#43**, mas metodologia e corpus precisam estar fixados para comparar as versões. **Não habilitar #44 nem fazer deploy dos modelos** antes de validação de precisão, segurança e recursos.
