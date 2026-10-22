# Revisão direcionada de chat e persistência após a Fase 2

Revisão local com preservação do contrato público e da base lexical de conhecimento. Não foram
realizadas chamadas reais a LLM, mudanças de produção, commits ou alterações em volumes existentes
para executar esta revisão.

## Problemas comprovados e correções

### Admissão de turnos antes do checkout PostgreSQL

`PostgresConversationStore.runTurn` mantinha uma conexão, transação e bloqueio da conversa enquanto
aguardava o provedor externo. Com o pool padrão de dez conexões, dez conversas distintas podiam
ocupar todo o pool durante a geração. Readiness e outras consultas do mesmo pool precisavam então
aguardar uma conexão, sujeitas ao timeout de checkout de três segundos.

A correção preserva a transação e o bloqueio `FOR UPDATE NOWAIT`, mas limita a admissão de chat
antes de `pool.connect()`. Um contador em `WeakMap`, compartilhado por todas as stores que usam o
mesmo objeto pool, admite `max(1, pool.options.max - 2)` turnos. No pool padrão são oito turnos e
duas conexões reservadas para consultas. O excesso recebe `CHAT_CAPACITY_REACHED` (503) e
`Retry-After: 1`, sem uma fila adicional de chat. Falha de checkout recebe `DB_UNAVAILABLE` (503),
também com espera sugerida, sem expor o erro bruto do driver.

O contador é liberado em `finally`, inclusive quando o checkout, a geração ou a devolução do
client falham. A transação continua fazendo rollback em falhas e o mecanismo existente de 409 por
concorrência na mesma conversa permanece ativo.

Limites deliberados:

- A geração ainda ocorre dentro da transação; a correção limita a quantidade de transações longas,
  sem introduzir leases, novas tabelas ou mudanças de consistência.
- A reserva vale por objeto pool/processo. Outros consumidores podem ocupar conexões reservadas;
  ela não substitui o dimensionamento do PostgreSQL para todas as réplicas.
- Um pool de tamanho um admite um turno e não consegue reservar conexão. O runtime usa tamanho dez.
- O timeout do ChatService encerra o turno e permite rollback/liberação. Transportes devem
  respeitar o sinal de cancelamento; liberar o turno não garante que um provedor externo já tenha
  interrompido a cobrança ou o processamento.

### Orçamento insuficiente para documentos

Com `CHAT_CONTEXT_CHARS=4000` e mensagem a partir de aproximadamente mil caracteres, a reserva
existente de três mil caracteres deixa o orçamento de dados em zero. A recuperação pode encontrar
fontes, mas o array enviado ao provedor ficava vazio. Uma geração nessa situação não possuiria os
documentos iniciais usados para fundamentá-la.

O serviço agora interrompe esse caminho com `LLM_CONTEXT_LIMIT` (502), antes de chamar o provedor.
Não responde como se a informação fosse desconhecida e não cria fontes artificiais. Os demais
limites finais de serialização/contexto continuam sendo aplicados pelo adaptador real.

### Corrida entre timeout e erro do transporte

O timer chamava `abort()` antes de rejeitar a promessa do prazo. Um transporte que rejeita
imediatamente ao receber o sinal podia vencer `Promise.race`, convertendo um timeout em
`LLM_UNAVAILABLE` (502). A promessa do prazo agora é rejeitada antes do cancelamento, preservando
`LLM_TIMEOUT` (504), enquanto o transporte recebe o mesmo sinal de aborto.

### Prompt e metadados ultrapassavam a estimativa de contexto

Uma reprodução offline da terceira mensagem, com dois pares de histórico e respostas de 1725
caracteres, selecionou 3542 caracteres de histórico e 4477 de documentos. O prompt real tem 3160
caracteres: depois dos escapes JSON e metadados, o contexto medido chegava a **12469**, acima do
limite padrão de 12000. O adaptador rejeitava uma conversa válida antes do invoke, embora o conteúdo
bruto coubesse na estimativa fixa da aplicação.

O adaptador agora mede o conteúdo serializado do prompt, referências e mensagens antes da primeira
reserva. Remove pares antigos completos; se necessário, remove documentos de menor prioridade e
reduz o primeiro documento sem esvaziá-lo. Se nem prompt/pergunta e um fato mínimo couberem, mantém
o erro de limite sem reservar cota ou invocar o modelo. Fontes são registradas somente depois da
seleção final, evitando atribuição de documentos descartados. Nas respostas de ferramentas, a
medição considera JSON escapado, `tool_calls` e `tool_call_id`. Esse orçamento em caracteres não
equivale à contagem de tokens nem aos bytes completos do transporte HTTP.

### Pergunta conceitual sobre token recusada

“Qual é o papel do token de autenticação no login JWT?” era identificada como pedido de extração
de segredo pelo trecho genérico “qual … token de autenticação”. O filtro agora distingue perguntas
conceituais sobre papel, função, formato, tipo, validade, finalidade ou duração de um token dos
pedidos de revelar credenciais. Pedidos diretos para mostrar/revelar tokens, chaves ou prompt
interno continuam bloqueados. Essa heurística continua sendo somente uma camada de proteção.

## Regressões adicionadas

- `tests/postgres-admission.test.ts`: limite compartilhado por pool, espaço para readiness,
  rejeição imediata sem checkout, recuperação após falha de checkout/geração/devolução e limite
  explícito para pool de tamanho um.
- `tests/postgres.integration.test.ts`: oito gerações concorrentes em PostgreSQL real, readiness e
  consulta durante a ocupação, nona solicitação recusada, uma falha externa e recuperação posterior.
- `tests/context.test.ts`: nenhum provedor chamado sem documentos por falta de orçamento; pergunta
  conceitual legítima versus extração de tokens; erro 504 preservado com transporte que rejeita
  imediatamente ao receber `abort`.
- `tests/llm-adapter.test.ts`: terceira mensagem com prompt real e respostas longas; descarte de
  documentos sem fontes artificiais; redução com escapes; limite irredutível sem reserva/invoke;
  resultado de ferramenta com escapes e ID. São transportes HTTP locais simulados, sem provedor pago.

## Validação local executada

Em 22/10/2026 (`America/Sao_Paulo`), o comando
`npx vitest run tests/context.test.ts tests/domain.test.ts tests/postgres-admission.test.ts`
aprovou **48 testes em três arquivos**. A execução anterior do subconjunto context/admission aprovou
27 testes em dois arquivos. Não houve chamada externa a LLM nesses testes.

Após a correção de contexto serializado, a suíte do adaptador aprovou **18 testes**, incluindo
cinco regressões novas, com transporte HTTP local simulado.

A verificação ESLint dos arquivos de código/teste desta revisão passou sem avisos. A formatação
dos arquivos foi aplicada com Prettier. A execução final da integração
PostgreSQL/Redis em ambiente descartável é registrada separadamente em `docs/PROGRESS.md`; a
presença do novo caso de integração no código não constitui, sozinha, prova de execução aprovada.

## Limites do chat preservados

O histórico é finito, recortado por pares completos e filtra as recusas determinísticas. Uma
continuação após a pergunta original sair dessa janela pode perder a âncora; a API não oferece
memória ilimitada. A busca é lexical, sem embeddings, e não mede verdade ou relevância semântica
por si só. O prompt exige uso das fontes e distinção entre fatos, declarações e dados ausentes.

A revisão não prova resistência exaustiva a prompt injection nem fidelidade de toda saída de LLM.
O provedor real monta as fontes a partir dos documentos disponibilizados/consultados, sem aceitar
IDs arbitrários gerados pelo modelo. Fontes listadas representam documentos consultados, não uma
atribuição exata de cada frase. Ferramentas continuam somente de leitura, sem rede arbitrária,
execução de comandos ou agendamento.
