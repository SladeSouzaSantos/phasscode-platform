# F3.7/#43 — Gate determinístico de papéis e relações (laboratório offline)

**Status:** experimento somente em \`dev\`; não integrado a Fastify, LangGraph, PPKS, Graph Reader, Neo4j, Laya ou aos serviços publicados. Nenhuma flag operacional é alterada.

## Motivação

A primeira PoC de \`laya-multilingual\`, com 16 spans sintéticos já delimitados, obteve 2/16 acertos de papel e 7/16 acertos de relação; o limiar diagnóstico de 0,85 levou a 16/16 abstenções. Isso **não** autoriza ativar um classificador zero-shot. Antes de considerar Laya para casos difíceis, precisamos de um **controle determinístico de alta precisão** com abstenção explícita.

O arquivo \`scripts/semantic_typed_rules_lab.py\` aplica sinais literais e limites de cláusulas para interpretar apenas **spans já fornecidos com offsets corretos**. São duas dimensões separadas:

- Papel: \`mandatory\`, \`desirable\`, \`alternative\`, \`context\`, \`negated\` ou \`uncertain\`.
- Relação: \`candidate_requirement\`, \`company_stack\`, \`future_stack\`, \`project_claim\`, \`unrelated\`, ou \`null\` em abstenção.

A saída \`needsClassifier=true\` significa **não resolvido**. Ela **não invoca** automaticamente Laya nem descarta a cláusula. A relação \`candidate_requirement\` descreve uma **exigência da vaga** e nunca prova experiência do candidato.

## Cuidados e limitações

1. Este gate **não descobre spans nem skills**. Os offsets são validados contra o texto imutável; spans desconectados são rejeitados. O nome de uma tecnologia ou pontuação de embedding não constitui evidência profissional.
2. Regras são intencionalmente incompletas. Múltiplos sinais incompatíveis, frases compostas, condições, escopos e linguagem não prevista devem abster-se. Classificação de empresa/futuro/projeto precede obrigatoriedade para evitar promoção indevida.
3. O benchmark disponível contém somente exemplos **sintéticos e não revisados por humanos**; as regras foram escritas **após** observar esses casos. Portanto, qualquer acerto nele é **in-sample**: não há evidência de generalização, calibração, qualidade final do Orbe ou segurança para rollout.
4. A avaliação não imprime textos de vaga nos relatórios, não acessa rede, não baixa modelos, não consulta bancos e não executa LLM.
5. **Nenhuma integração shadow/Active antes de concluir #41, #42 e #43 com benchmark cego**, orçamento de RAM/CPU real, falso positivo e plano de fallback. A #44 permanece bloqueada.

## Como reproduzir sem serviços

Da raiz do repositório:

\`\`\`bash
python3 -m unittest discover -s tests -p test_semantic_typed_rules_lab.py -v
python3 scripts/semantic_typed_rules_lab.py \
  --fixture evaluation/semantic-hybrid-corpus-v0.json
\`\`\`

O relatório inclui cobertura das decisões, abstenções, acerto conjunto entre casos resolvidos e IDs de discrepâncias — **não inclui o texto das vagas**. Porcentagens são apenas diagnóstico dentro do fixture.

## Continuação recomendada

Congelar um corpus **independente** PT/EN (sem adaptar os padrões após ver o gabarito), medir \`precision/recall\` por papel/relação e o impacto das abstenções; comparar gate lexical, Laya e composição em **offline**, nunca promovendo similaridade ou \`confidence\` para prova. Somente casos não resolvidos podem ser candidatos à Laya após validação da PoC.

Issues relacionadas: #40 (épico), #41 (gold set), #42 (ONNX), #43 (Laya e decisões), #44 (contratos shadow).
