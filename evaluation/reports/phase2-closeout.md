# Fechamento local da Fase 2

Data: 21/10/2026, America/Sao_Paulo. Revisão: agente Codex, não revisão humana.

## Configuração e escopo

API Docker local com PostgreSQL/Redis, provedor `openai-compatible`, API `chat-completions`, modelo
`nvidia/nemotron-3.5-super-vl:free`. Configuração final: `orbe-v3`, timeout 30000 ms, saída de 800
tokens, contexto de 12000 caracteres e `OPENROUTER_REASONING_ENABLED=false`. Não houve troca de
modelo nem fallback para mock.

SHA-256 do prompt ativo: `2b7863b9708e1d30e07d6ba208aab1b420262f591484786c0ae5621e71b60912`.
O hash do catálogo final validado nos relatórios v3 é
`e448c4c30e29df8257c92f77465f5bcd20a2b1ff1c8dff5f16c8ee7e936dc86e`.

## Evidências

O núcleo teve uma passagem completa de **16 cenários/18 turnos**, todos aprovados, com o catálogo
anterior de oito documentos: [JSON](orbe-2026-10-21T21-10-10-887Z.json) e
[revisão semântica pelo agente](phase2-semantic-review.md).

Depois da ampliação para 31 documentos, foram executadas regressões direcionadas. A confirmação
direta do proprietário sobre Greencity, FacPrisma e UNISUL alterou novamente os fatos esperados;
esses casos foram reexecutados com a matriz v3. As evidências finais por caso são:

| Cenário                                | Relatório                                | Resultado e revisão semântica pelo agente                                                                          |
| -------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Certificação Kubernetes não confirmada | [v2](orbe-2026-10-21T23-40-11-132Z.json) | Pass; distingue competências/cursos de certificação, sem negar qualificação                                        |
| Experiência SIG/SIGAA                  | [v2](orbe-2026-10-21T23-40-28-450Z.json) | Pass; período, Java, Hibernate, JBoss e PostgreSQL sustentados pelas fontes                                        |
| ReserGas                               | [v2](orbe-2026-10-21T23-41-15-885Z.json) | Pass; finalidade e Flutter/Dart corretos, sem prometer precisão validada                                           |
| Empregador atual confirmado            | [v3](orbe-2026-10-21T23-45-35-298Z.json) | Pass; reconhece Greencity com a confirmação do proprietário em 21/10/2026                                          |
| Formação atualizada                    | [v3](orbe-2026-10-21T23-45-51-368Z.json) | Pass; preserva divergência UnP, somente SegInfo concluída na FacPrisma e UNISUL trancada/previsão dezembro de 2027 |
| API Laravel de orçamentos              | [v3](orbe-2026-10-21T23-46-00-656Z.json) | Pass; PHP/Laravel/DomPDF/Blade e geração de PDF fundamentados                                                      |

Os três últimos relatórios usam o catálogo final e o mesmo prompt/configuração. Os três primeiros
usam a revisão anterior dos 31 documentos; o conteúdo específico desses fatos não foi alterado
pela confirmação posterior. Isso não equivale a executar integralmente a matriz v3 de 20 cenários
contra o catálogo final. A inspeção com ChatService real e provider simulado confirmou que nenhuma
fonte obrigatória fica ausente ou truncada nos 22 turnos atuais com contexto de 12000 caracteres.

Foram feitas 51 mensagens HTTP de avaliação registradas nesses relatórios, incluindo passagens,
falhas e reexecuções. Esse total não representa número de chamadas ao modelo: alguns casos são
políticas determinísticas, e um turno pode usar várias rodadas de ferramenta. O diagnóstico de
tokens e os smokes anteriores são atividades separadas.

## Falhas e correções preservadas

- A primeira passagem teve dois cenários com falhas de transporte/provedor. O socket fechava após
  dez segundos, antes do limite da geração; foi corrigido e coberto por teste em conexão HTTP real.
- A resposta inicial sobre certificação começou com “Não”, antes de explicar a ausência de dados.
  Reprovada semanticamente, embora o check lexical passasse. O prompt v3 corrigiu essa distinção e
  as reexecuções reconheceram a incerteza.
- Continuações sofreram timeout/resposta vazia. Um diagnóstico sem imprimir raciocínio mostrou
  591 tokens de reasoning entre 731 tokens de saída, próximo do limite total de 800. O controle
  explícito de reasoning foi implementado, testado no transporte e aplicado; a passagem completa
  posterior aprovou ambos os cenários de continuidade.
- Na expansão, a consulta sobre empregador teve timeout de 30 segundos antes da atualização do
  proprietário. O caso atualizado passou depois, com HTTP 200. A falha anterior permanece no relatório.
- A resposta inicial do caso Laravel explicou corretamente função e PDF, mas omitiu o nome do
  framework. A pergunta foi tornada explícita sobre tecnologias, mantendo o check Laravel, e a
  reexecução passou. Não se apagou a falha nem se flexibilizou a exigência de fonte.

O ciclo real de `search_portfolio` havia sido validado com uma execução de ferramenta, fontes e
resposta final. A suíte de SDK também cobre rodadas, parâmetros, orçamento e erros usando HTTP
simulado. Não se deduz chamada de ferramenta apenas de `simulated=false` nos relatórios da matriz.

## Limites da conclusão

98 testes locais e quatro de integração real passaram; build, smoke e Compose foram verificados.
Esta é uma conclusão do incremento local. Não comprova desempenho sob carga, estabilidade de um
modelo gratuito, segurança exaustiva, credenciais profissionais auditadas ou publicação do backend.
Os resultados automáticos mantêm `humanReview: pending`; a revisão semântica registrada foi feita
pelo Codex. Revisões históricas não são apresentadas como resultados da matriz atual.
