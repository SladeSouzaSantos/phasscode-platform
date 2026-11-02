# Validação

Execute `npm ci --ignore-scripts`, `npm run check` e `npm audit --audit-level=high` na raiz.
`npm test` usa somente mock e servidores HTTP locais simulando o provedor. Não exige chave paga.

A [validação do login exclusivo do administrador](admin-only-auth.md) registra a política de
`AUTH_ADMIN_EMAIL`, provisionamento auditado, sessões anteriores e os checks locais de 25/10.

A [revisão dos alertas CodeQL do PR #4](pr4-codeql-review.md) explica a finalidade dos fingerprints
Redis, a restrição de destinos do proxy e a correção de CORS/reflexão no servidor sintético.
Inclui a justificativa do falso positivo de hash (#4) e as regressões de cotas, CORS, CSRF e OIDC.

A [correção profissional do Orbe v4](orbe-v4-professional.md) documenta o tom das respostas,
associações de experiências/projetos, seleção de fontes e cálculos mensais, com as regressões
locais e os limites da validação sem LLM real.

O [incremento de fallback de LLM de 24/10](llm-fallback-2026-10-24.md) registra 452 testes únicos
aprovados, cadeia HTTP simulada, cooldown/cotas Redis entre instâncias e qualificação da imagem.
Os quatro candidatos reais não foram chamados; o [guia](../deployment/llm-fallback.md) descreve
ativação, modelos gratuitos e as restrições de produção da Cohere trial.

A Fase 3 permanece em homologação. A [validação de 23/10](phase3-local-validation-2026-10-23.md)
registra os resultados atuais: preflight, navegador, qualificação da imagem e avaliação v4 autorizada.
A [auditoria da retomada](phase3-resume-audit.md) registra os defeitos corrigidos e os 323 testes
de 22/10; [phase3.md](phase3.md) preserva a execução interrompida anterior.
Nenhuma migration foi executada no servidor nem houve sobrescrita de `.env` real.

`npm run test:browser` é opt-in e separado da integração PostgreSQL: usa Chromium real com OIDC e
páginas locais, sem contas externas. Consulte [auth-browser.md](auth-browser.md). A qualificação
reproduzível usa `npm run smoke:phase3:docker -- --image IMAGEM_CANDIDATA_LOCAL`, sempre em um novo
projeto privado com dados sintéticos, sem ler `.env` ou reutilizar bancos existentes.
`npm run phase3:preflight` não faz rede; configuração presente não equivale a homologação real.

As suítes da Fase 3 cobrem OIDC com issuer/JWKS assinados locais, sessões/CSRF/JWT,
propostas/consentimento, reservas e corridas SQL, Calendar/SMTP/Telegram simulados e BullMQ real
contra Redis descartável. Um fluxo integrado atravessa a API, login, aprovação, worker, canais e
cancelamento. Fakes não comprovam credenciais ou comportamento das contas externas do proprietário.
As regressões da retomada incluem o opt-in `X-Orbe-Capabilities: meetings-v1` e a ausência de ações
em clientes legados, mutex de rotação/logout/reuso por família e a migration aditiva
`005_calendar_create_uncertainty.sql`. Criação externa ambígua mantém a reserva: um GET `404`
posterior não finaliza cancelamento sem evidência suficiente, nem um conflito encontrado no retry
prova que a escrita anterior foi abortada. Sem essa evidência, a proteção pode permanecer por
prazo indefinido. Conflito conhecido antes de qualquer ambiguidade tem tratamento distinto.

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
no PostgreSQL e rate limit entre instâncias compartilhando Redis. A suíte também exercita
retenção sobre a base inteira; o cleanup remove fixtures e o schema fica instalado. Usar
exclusivamente PostgreSQL/Redis descartáveis, sem dados reais ou de desenvolvimento compartilhado.

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
Ele aplica migrations e faz HTTP no container. Calendar e notificações já têm suítes locais e
integração com dependências descartáveis; as contas externas seguem pendentes. Java terá sua
própria validação na Fase 4, sem jobs vazios que aparentem validar código ausente.

No ambiente Windows desta sessão, ferramentas que consultam a conta de usuário ou iniciam
processos filhos podem falhar no sandbox (`uv_os_get_passwd`/permissões). A execução autorizada
fora desse sandbox resolveu tsx/Vitest. Isso não implica alterar configuração do projeto.

Consulte [PROGRESS.md](../PROGRESS.md) para resultados efetivamente medidos e limitações restantes.
