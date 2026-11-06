# Gate 8 — protocolo de revisão independente das intenções (pré-Fase C)

**Estado:** rubrica e triagem produzidas pelo assistente; **zero casos aprovados por revisor independente**.  
**Origem do corpus:** `knowledge/evaluations/hydradb-gate8-recruiter.json`, 20 perguntas sintéticas, SHA-256 `ec5dcf8746b981ca00a65879db4293f493ed3ec33721c25904bd4d677aeefad0` confirmado pelo MiniMac nos modos OFF e SHADOW da Fase B.  
**Escopo:** LAB `experiment/hydradb` apenas; nenhum acesso ao usuário real do Orbe, modelos externos, dados privados, DEV, MAIN ou banco operacional.

## Por que a revisão é necessária?

A Fase B entregou 38/38 claims e 16/16 fontes únicas com paridade canônica, mas consumiu `expectedSkills` **já fornecidas** no corpus. Portanto, ela **não extraiu** requisitos das 20 perguntas. O catálogo lexical atual (`createCatalogRequirementIdentifier`) localiza expressões explícitas com limites de palavra, enquanto `evaluation/semantic-hybrid-lexical-baseline.ts` avalia **spans previamente anotados** e usa papéis como oráculo — não detecta negação, obrigação ou intenção a partir do texto inteiro.

Além disso, a ferramenta de `requirement()` do LAB preenche `mandatory: true` para cada termo a fim de exercer o contrato de recuperação. Esse atributo **não representa a obrigatoriedade real na vaga ou na pergunta**. O próximo experimento deve tratá-lo separadamente.

## Critérios de anotação (antes de executar qualquer classificador)

1. Identificar cada **menção literal** de tecnologia, com intervalo de caracteres `start/end`; marcar quando se tratar de abreviação ou paráfrase, sem inventar sinônimos.
2. Para cada menção, separar `intentRole`: `question_target`, `negative_instruction`, `context_only`, `comparison_target` ou `ambiguous`.
3. Marcar `requestedScope` como `professional`, `mixed_role`, `personal_project`, `study`, `any` ou `undetermined`. Isso representa o que a pergunta **solicita**, não o que o candidato comprova.
4. Marcar `requestedEvidence` (`code`, `documentation`, `any`, `none`), `polarity` (`positive`, `negated`, `uncertain`) e `questionType` (`yes_no`, `compare`, `list_evidence`, `vacancy_fit`).
5. O rótulo de evidência `professional` só pode ser atribuído a claims cujo escopo canônico seja profissional. `study` e `mixed_role` não são automaticamente emprego exclusivo em desenvolvimento.
6. `Go`/`Django` sem claims no fixture LAB significa `not_in_lab_fixture`; **não** implica `candidate_never_used_skill`. Na negativa, uma tecnologia pode permanecer como menção da pergunta, mas nunca gerar competência positiva.
7. Revisar as 20 perguntas **sem consultar a predição lexical ou os relatórios de desempenho**. O próprio autor das anotações provisórias não conta como verificador independente. Registrar revisor, data, versão/hash do corpus, decisões e discordâncias.
8. Definir critérios por cenário e conjunto de menções; aferir F1 por menção e por papel, taxa de negações preservadas, confusão estudo/profissional e abstenções; relatório sintético identificado explicitamente como avaliação de perguntas fictícias.

## Triagem preliminar por cenário (não constitui gold validado)

| Caso | Ponto que o revisor deve confirmar |
| --- | --- |
| `java-profissional` | Java é alvo de consulta sobre experiência **profissional**, sem extrapolar anos ou projetos |
| `java-estudo` | Java aparece com contraste entre emprego e **projeto de estudo** |
| `spring-profissional` | A pergunta busca Spring Boot em **emprego anterior**; evidência de estudo não pode ser promovida |
| `java-spring-diferenca` | Java e Spring Boot são dois alvos de **comparação de escopos** |
| `flutter-greencity` | A palavra “exclusivamente” questiona trabalho exclusivo em programação; preservar `mixed_role` |
| `flutter-projeto` | Filtrar experiências por **projetos pessoais**; menção a Flutter não garante que todo claim tenha esse escopo |
| `node-provas` | Node.js com demanda explícita de **código e documentação**, sem inflar `catalog_only` |
| `typescript-fontes` | TypeScript, projetos e **fontes**; preservar todos os vínculos e `verificationStatus` |
| `typescript-parafrase` | `TS` é **abreviação**, não o rótulo literal `TypeScript`; requer alias aprovado para reconhecimento lexical |
| `go-ausente` | Go é pergunta sobre existência de experiência, não afirmação positiva; ausência é **no LAB** |
| `django-ausente` | Django é pergunta de existência de evidências; nenhuma claim no fixture não prova ausência global |
| `react-projeto` | React com ênfase em projetos **públicos**; não converter em experiência profissional |
| `hsp-stack` | Python e FastAPI são dois alvos do **mesmo projeto**, com escopo `unknown` no fixture |
| `java-go` | Java e Go aparecem como requisitos de vaga; distinguir cobertura parcial e falta de evidência LAB |
| `java-flutter-go` | Comparação de três tecnologias com escopos e fontes diferentes; não generalizar experiência |
| `sem-go-mas-java` | `Go` aparece em **instrução negativa** (“sem alegar”), enquanto Java é alvo positivo |
| `negacao-django` | `Django` é **instrução negativa** (“não invente”); Python é alvo positivo |
| `web-fullstack` | Node.js e TypeScript como **dois alvos**, não inferir que todas as fontes provam full-stack profissional |
| `mobile-web` | Flutter + React; recuperar evidências independentes para cada tecnologia |
| `senioridade-sem-extrapolar` | Pergunta sobre ambas serem experiência **profissional remunerada**; Java e Spring Boot requerem respostas diferenciadas |

## Entregáveis para desbloquear a Fase C

- [x] Gerar arquivo separado de **anotações textuais provisórias** que corresponda literalmente ao hash congelado, sem alterar o corpus aprovado na Fase B: `knowledge/evaluations/hydradb-gate8c-intent-draft.json`.
- [x] Validar automaticamente `start/end`, menções, `intentRole`, `requestedScope`, `polarity` e IDs dos 20 cenários; 9/9 testes GitHub Actions PASS; nunca inferir `approved` a partir de testes.
- [ ] Obter **revisão independente** com [packet sem predições](hydradb-gate8c-human-review-packet.md) e registrar discordâncias/resoluções, mantendo histórico do gold.
- [x] Construir diagnóstico de pergunta inteira com `createCatalogRequirementIdentifier`; não confundir detecção de **menções** com inferência de escopo/negação. Consulte [diagnóstico e limites](hydradb-gate8c-lexical-diagnostic.md).
- [ ] Comparar interpretação lexical com o baseline já presente no Orbe; apenas depois considerar alternativa semântica, mediante custo/benefício mensurável.
- [ ] Nenhuma chamada LLM/ONNX, seed, merge, deploy ou alteração do Orbe operacional é autorizada neste protocolo.

**Decisão provisória:** a Fase B está encerrada e homologada; o Gate 8 como um todo continua aberto. O experimento de NLP ainda não existe e não há ganho semântico demonstrado.


## Primeiro diagnóstico Gate 8C (sem gold humano)

[Workflow #42146070426](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42146070426): `npm run typecheck` PASS, Vitest 9/9 PASS, comparação lexical por **pergunta inteira** executada offline. Baseline 29/30 menções, 19/20 perguntas exatas; piloto **não aprovado** de alias TS identificou 30/30, 20/20. As duas menções negativas continuam reconhecidas com `mandatory:true` porque o reconhecedor não infere papel/intenção. Esses valores não são acurácia NLP, não representam avaliação independente e não medem ganho HydraDB.
