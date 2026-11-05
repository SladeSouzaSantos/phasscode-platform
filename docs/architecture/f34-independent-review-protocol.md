# F3.7 / #41 — Pacote para revisão humana independente

A auditoria automatizada confirmou que os **56 offsets existentes** nos **9 cenários F3.4** apontam para o texto correto. **Isso não confirma completude nem verdade-terreno**. Os cenários incluem **6 mensagens de recrutamento** e **3 perguntas acadêmicas** (`academic_question`), que não devem ser consideradas vagas.

Arquivo de trabalho: [`evaluation/semantic-f34-human-review-template-v1.json`](../../evaluation/semantic-f34-human-review-template-v1.json).

## Procedimento de revisão

1. Um revisor **independente de quem elaborou o corpus e os prompts** abre cada mensagem integral no [fixture original](../../evaluation/vacancies-ppks-v12.json). Confere cada um dos 56 spans e **procura requisitos omitidos** em cada cláusula, inclusive conjunções, barras, alternativas e negações.
2. Para cada anotação, altera `reviewDecision` de `pending` para `approved` ou `corrected`. Preenche `reviewedRole` e `reviewedRelation`; toda correção exige uma justificativa em `notes`. **Não reescreve offsets originais nem a fonte histórica.**
3. Após percorrer o **texto todo**, marca `coverage.decision` como `complete` ou `requires_corrections`; itens omitidos devem entrar em `coverage.omissions` com offsets, papel, relação e justificativa. Deixar uma lista vazia **não** equivale a dizer que não há omissões enquanto a cobertura está pendente.
4. Quando todos os spans e a cobertura de um caso estiverem revisados, preenche `reviewer.identity`, `reviewedAt` (UTC ISO 8601) e `pullRequest` da revisão assinada. O revisor deve registrar seu aceite no próprio PR. Revisão pessoal assinada e aprovação efetiva são **verificadas fora deste script**.
5. Executar `python3 scripts/validate_f34_review_packet.py` e `python3 -m unittest discover -s tests -p test_f34_review_packet.py -v`. O validador rejeita alterações da fonte, spans apagados, metadados de aprovação incompletos e omissões incompatíveis, mas **nunca** emite `goldSetApproved=true` automaticamente.
6. Revisão humana concluída gera **novo fixture versionado**, após conferência do PR e controle de concordância/revisão de conflitos; não sobrescrever a baseline original. Separar material de treinamento, desenvolvimento e teste cego.

### Esquema de anotação

- Papel: `mandatory`, `desirable`, `alternative`, `context`, `negated`, `uncertain`, `unknown`.
- Relação: `candidate_requirement`, `company_stack`, `future_stack`, `project_claim`, `unrelated` e `academic_question` para os cenários acadêmicos históricos.
- `alternative` e `unknown` não podem ser promovidos a requisito singular confirmado sem contexto; `company_stack` não implica requisito do candidato; descrição de projeto não prova trabalho profissional; negações devem ser preservadas.
- Exigir atenção especial a **Java vs JavaScript**, **SQL vs SQL Server**, **Java/C++ ou C#**, **Node.js/TypeScript**, **React ou Vue**, Go não documentado, graduação concluída versus em andamento, e competên­cias transferíveis sem comprovante direto.
- **Atenção:** o revisor deve classificar as próprias frases originais, não as respostas geradas pelo Orbe.

Este pacote não depende da Laya e não dispara modelo, API, banco, rede ou deploy. Até a revisão externa, a issue #41 permanece **aberta**.
