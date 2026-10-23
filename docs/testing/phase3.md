# Validação da Fase 3

**Registro histórico da execução interrompida.** Os resultados abaixo não representam uma nova
validação da retomada em `dev/64c8414`. A Fase 3 permanece em andamento; achados e evidências atuais
estão registrados em [phase3-resume-audit.md](phase3-resume-audit.md).

Data da execução anterior: 22/10/2026. Base inicial: `dev/c29714b`. Implementação e validação locais; sem commit,
push, publicação GHCR, acesso ao minimac-server ou uso das contas reais Google/SMTP/Telegram.

## Resultados

| Verificação                          | Resultado                                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Instalação limpa pelo lockfile       | `npm ci --ignore-scripts` aprovado                                                                     |
| Qualidade completa                   | `npm run check`: lint, formatação, TypeScript strict, OpenAPI, **222 testes locais** e build aprovados |
| Infraestrutura                       | **27 testes aprovados**: Compose real sem daemon e Git/Docker/HTTP simulados no deploy                 |
| PostgreSQL 17 e Redis 7 descartáveis | **50 testes aprovados**, incluindo autenticação, reservas, outbox, BullMQ e fluxo completo             |
| Auditoria                            | `npm audit --audit-level=high`: nenhuma vulnerabilidade reportada                                      |
| Smoke compilado                      | Health/readiness e continuidade do chat por HTTP real com mock                                         |
| Docker runtime                       | API e worker independentes, dados sintéticos, Calendar/canais fake, reserva/aprovação/cleanup/logout   |
| Nginx privado                        | `nginx -t`, `/health` 200, `/ready` externo 404, callback inválido 401 sem código/estado nos logs      |
| Gerador de chave                     | RSA3072, JWKS só público, segundo comando recusa sobrescrita e preserva arquivo existente              |

Total automatizado: **299 testes**. Não inclui smokes manuais como novos casos da suíte.
Configuração padrão mantém novos recursos desativados. O frontend já tem
[contratos implementados](../api/phase3-integration.md); homologação externa está separada em
[P3-H01 a H05](../TASKS.md).

## O que os testes comprovam

OIDC usa um servidor HTTP local com tokens RS256/JWKS assinados de verdade e a biblioteca
`openid-client`. A suíte verifica PKCE/state/nonce, callback de uso único/expirado, assinatura,
issuer/audience/expiração, e-mail verificado e isolamento do cookie de login. Login não promove
admin nem une identidades por e-mail. Sessão, CSRF/Origin, rotação/reuso, logout, JWKS/rotação de
chave e JWT com sid/papéis atuais são exercitados, inclusive entre instâncias PostgreSQL.

Reuniões verificam regras de Fortaleza, proposta imutável, hash dos segredos, consentimento,
idempotência, privacidade do status, paginação, auditoria e atomicidade da outbox. Duas aprovações
incompatíveis disputam a reserva em cinco rodadas reais: uma vence, outra recebe `409` e o rollback
não deixa eventos parciais. O teste também aprova 09h e 09h45 e recusa 09h30, respeitando o intervalo.
Chamadas externas não mantêm uma transação de reserva aberta.

Calendar usa transporte HTTP local para FreeBusy, GET/event ID determinístico, criação/releitura,
cancelamento e confirmação de ausência. Timeout, conflito, propriedade divergente e recuperação
de criação após falha local não produzem sucesso falso nem exclusão de evento alheio. Cancelar
durante criação compensa o efeito externo; reservas permanecem até cleanup verificado.

O worker testa entregas por canal, retries, deduplicação, payload Redis sem PII, lembretes,
fila BullMQ real em Redis e recuperação após crash da última tentativa. Lembrete é persistido
independentemente do resultado dos canais. Recuperação antiga usa CAS de versão e não invalida
nova aprovação/cancelamento. Depois de limpeza esgotada, uma decisão administrativa explícita
reabre trabalho auditado; replays concorrentes não criam ciclos extras.

O fluxo completo de integração atravessa a API real por injeção Fastify, OIDC assinado local,
PostgreSQL/Redis, sessão, visitante público, consentimento, admin/CSRF, worker, Calendar fake,
dois canais fake, status privado, cancelamento e logout. O smoke Docker acrescenta o processo
compilado com API e worker separados e heartbeat. O chat permanece público antes/depois do login.

Ferramentas LangChain são chamadas por um servidor LLM HTTP local: consulta e preparação geram
uma ação para a UI, sem token da proposta nas mensagens do modelo. Não há ferramenta para efetivar
pedido ou decisão administrativa. Falha de agenda é fechada, injection conhecida continua recusada
e a resposta de proposta não pode declarar que a reunião já foi registrada/confirmada.

## Correções encontradas na validação

- GiST pode abortar disputa de reservas com deadlock `40P01`. A reserva curta agora usa advisory
  lock por calendário antes dos locks de linhas; exclusion constraint permanece como autoridade.
  `23P01` e `40P01` retornam `409` após rollback, sem detalhes do driver.
- Resultado Calendar incerto não libera reserva por mudança de estado. Cleanup usa lease/CAS e
  precisa verificar ausência antes de liberar. Propriedade divergente não autoriza DELETE.
- Esgotamento antigo respeita a versão atual; lembretes sobrevivem a falha dos canais e recuperação
  da última tentativa. Falha de canal não altera estado transacional da reunião.
- Socket HTTP considera os orçamentos OIDC/Calendar, além da LLM. O callback OAuth não fica em
  access log do modelo Nginx. Cookie sem Secure só é permitido no loopback de desenvolvimento/teste.
- Nodemailer foi atualizado para `10.2.0` depois da auditoria apontar a linha antiga vulnerável.

## Reprodução

```bash
npm ci --ignore-scripts
npm run check
npm run test:infrastructure
npm run smoke
npm audit --audit-level=high
# Definir exclusivamente URLs de PostgreSQL/Redis DESCARTÁVEIS:
npm run test:integration
```

Os testes não fazem skip quando faltam URLs de integração. `compose.test.yaml` oferece ambiente
descartável; também é possível usar containers exclusivos com portas aleatórias no loopback.
Nesta execução foram usados `phasscode-p3-pg-20261022` e `phasscode-p3-redis-20261022`, sem volumes
do projeto. API/worker/proxy de smoke usam o mesmo prefixo e rede de teste própria. Nenhum volume
existente de desenvolvimento/produção foi removido. Credenciais e dados reais do `.env` não foram
alterados, lidos para envio externo ou incluídos nos relatórios.

Um teste de fixture precisou de cast explícito `timestamptz` no PostgreSQL. Outro fixture passou
a usar horários exclusivos porque reservas FAILED/CANCELLED incertas corretamente continuam
ativas. O teste de ponta a ponta usa IP exclusivo por execução para não consumir o próprio limite
por IP ao ser repetido. A suíte passou depois das correções, preservando asserções de concorrência.

## Limites e pendências externas

Não houve login Google real, escrita em agenda real, envio SMTP/Telegram real, avaliação paga v4,
deploy remoto ou validação do frontend do proprietário. A exclusão SQL é compartilhada, mas
Google não oferece transação atômica FreeBusy+insert com escritores externos. SMTP/Telegram
podem duplicar envio se houver queda antes do ACK SQL; não se afirma entrega exatamente uma vez.
O fake de Calendar é memória por processo, para testes explícitos, e é proibido em produção.

O teste manual do CLI `grant/revoke` foi bloqueado pela revisão automática de aprovação, que
interpretou a concessão administrativa como vedada nesta sessão. O comando não foi executado;
o arquivo temporário dessa conferência foi removido. O CLI está implementado e passou tipos/lint;
os testes de papéis/autorização usam registros sintéticos nos bancos descartáveis. Nenhum papel
foi concedido a uma conta real. Esse limite não é uma validação operacional do comando com o
usuário do proprietário.
