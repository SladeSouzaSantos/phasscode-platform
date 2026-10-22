# Validação

Execute `npm ci --ignore-scripts`, `npm run check` e `npm audit --audit-level=high` na raiz.
`npm test` usa somente mock e servidores HTTP locais simulando o provedor. Não exige chave paga.

`npm run test:infrastructure` é separado e exige Compose CLI e Bash (Git Bash no Windows).
Renderiza os dois ambientes com valores sintéticos e testa scripts com ferramentas simuladas,
sem daemon, rede externa ou serviços reais. CI e release também executam essa verificação.

Os testes cobrem formato de contrato compartilhado, saúde, Swagger, mensagens e tamanho, token de
conversa, origens, rate limit, recusa de escopo, injection conhecida, concorrência, histórico,
rollback de geração, expiração, configuração, erros e timeout com abort. O adaptador LangChain é
exercitado de ponta a ponta até o transporte HTTP simulado, incluindo ferramentas nas duas APIs.
Isso não comprova disponibilidade nem comportamento de um modelo real específico.

As regressões da Fase 2 cobrem recuperação de termos (Java/JavaScript e IA), seguimentos consecutivos,
preservação de pares no histórico e exclusão de turnos recusados do contexto enviado à LLM. A suíte
de avaliação testa classificações de resultados, proveniência das fontes, continuidade, redação de
relatórios e limites do runner com transporte em memória.

A revisão pós-fase acrescenta orçamento por invocação, recusa em falhas Redis, cancelamento,
limite de rodadas, saturação do pool e matriz v3 contra o ChatService com provedor sintético.
Essa validação offline verifica fontes completas nos 22 turnos e distingue 19 elegíveis para LLM
de três determinísticos. Não comprova aprovação semântica ou real integral da v3.

`npm run eval:orbe` lista os 20 cenários/22 chamadas da matriz v3 sem usar a LLM. Com a API real configurada,
`npm run eval:orbe -- --live --max-calls=22` executa a matriz HTTP sequencial. Os relatórios ficam em
`evaluation/reports`; não contêm tokens de conversa. Esse comando é opt-in e não faz parte da CI.
Veja [a rubrica](../../evaluation/RUBRIC.md): checks determinísticos e revisão semântica têm
resultados separados, e uma passagem não é teste de carga ou garantia de segurança.

A suíte `npm run test:integration` requer `TEST_DATABASE_URL` e `TEST_REDIS_URL`. Use banco e Redis
de teste descartáveis. Ela não usa skip automático quando as variáveis faltam. Aplica migrations
duas vezes, verifica retenção de quantidade de mensagens, hash de token, rollback, lock concorrente
no PostgreSQL e rate limit entre instâncias compartilhando Redis. Os testes removem somente os
registros criados por eles; o schema fica instalado. Não apontar para produção.

Inclui ainda oito gerações simultâneas mantendo espaço para readiness e concorrência de orçamento
entre dois clientes Redis: 80 reservas disputam 11 admissões e dois provedores contra HTTP local
simulado disputam três chamadas efetivas. Valida expiração, política divergente, estado inválido
e falha fechada. Nenhuma chamada é enviada à OpenRouter.

A auditoria final acrescenta TTL/metadados Redis incoerentes, 503 no limitador por IP e recusa
de flags do SDK que imprimem/enviam mensagens. O adaptador também testa três turnos com respostas
longas e recorte do prompt/JSON/histórico sem fontes descartadas na resposta. Veja a
[conferência final por requisito](post-phase2-audit.md) e os totais consolidados no progresso.

O caminho automatizado com dependências exclusivas e sem portas publicadas é:

```bash
docker compose -f compose.test.yaml up --build --abort-on-container-exit --exit-code-from tests
docker compose -f compose.test.yaml down --volumes
```

Para executar usando a infraestrutura local, crie um banco de testes separado ou inicie outro
projeto Compose com nome/portas diferentes. A CI provisiona PostgreSQL/Redis exclusivos por job.

A validação da imagem e de inicialização Compose está no job `docker`, que espera os outros jobs.
Ele aplica migrations e faz HTTP no container. Java, Calendar e mensageria de notificações terão
suítes próprias nas fases correspondentes, sem jobs vazios que aparentem validar código ausente.

No ambiente Windows desta sessão, ferramentas que consultam a conta de usuário ou iniciam
processos filhos podem falhar no sandbox (`uv_os_get_passwd`/permissões). A execução autorizada
fora desse sandbox resolveu tsx/Vitest. Isso não implica alterar configuração do projeto.

Consulte [PROGRESS.md](../PROGRESS.md) para resultados efetivamente medidos e limitações restantes.
