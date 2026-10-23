# Auditoria da retomada da Fase 3

Registro histórico de 22/10. A continuação e os totais atuais estão na
[validação de 23/10](phase3-local-validation-2026-10-23.md).

Data: 22/10/2026. Branch `dev`, base `64c8414`. **Fase 3 em andamento.** Este relatório trata o
checkout inteiro como trabalho em andamento e substitui os totais históricos de
[phase3.md](phase3.md) para esta retomada. Nenhum resultado local comprova a implantação publicada.

## Estado encontrado e escopo preservado

Foram conferidos `git status`, diffs rastreados e os arquivos novos de autenticação, reuniões,
integrações, worker, contratos, migrations, prompt v4 e testes. A implementação interrompida já
continha esses módulos, mas exigia revisão de consistência, compatibilidade e nova execução dos
testes. Os arquivos novos continuam não rastreados; nenhum `git add`, commit, push, merge ou deploy
foi feito. A base HEAD permaneceu `64c8414`.

O `.env` existente não foi sobrescrito. Os testes usaram variáveis sintéticas e infraestrutura
Docker local exclusiva desta auditoria. Não houve migrations no servidor, acesso ao minimac-server,
alteração destrutiva de banco existente, promoção de conta real, envio externo ou chamada paga de
LLM. Os containers preexistentes foram preservados. Os containers novos da auditoria foram parados
ao terminar; seus bancos sintéticos ficaram disponíveis para inspeção.

## Resultado por módulo

| Módulo                         | Implementado no trabalho local                                                                                                                                                 | Validado nesta retomada                                                                                                                                                                                      | Incompleto ou pendente                                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chat público / compatibilidade | Rota, DTO, token de conversa, histórico, erros e orçamento global preservados; novas ações exigem opt-in por chamada.                                                          | Respostas comparadas ao schema estrito de `dev/64c8414`, com módulos desativados, somente auth e reuniões habilitadas; conversa inicial/continuidade e 404. HTTP compilado e imagem Docker também aprovados. | Homologação com o frontend e a API publicados; não foi feita chamada à produção.                                                                                                 |
| Autenticação e autorização     | Google OIDC/PKCE/state/nonce/assinatura, usuário separado de identidade, papéis e sessões centrais, BFF/cookie/CSRF, JWT RS256/JWKS, refresh/replay/logout.                    | Provedor OIDC HTTP local com tokens assinados, cenários inválidos, isolamento entre identidades, permissões atuais e revogação de JWT; PostgreSQL entre instâncias e regressões de concorrência.             | Login com conta Google real, configuração pública HTTPS/cookies e operação do CLI administrativo. Senha, GitHub, MFA e passkeys são roadmap; Java/Spring ainda não implementado. |
| Reuniões e administração       | Política Fortaleza/seg–sáb 09h–18h/30min/24h/buffer15min; proposta imutável, consentimento, idempotência, token de status, reserva apenas na aprovação, paginação e auditoria. | Limites de horário, PENDING sem reserva, concorrência real SQL, exclusão de intervalos/buffer, rollback/outbox, admin/CSRF, falhas, cancelamento, expiração e anonimização.                                  | UI de consentimento/admin e aceite funcional do proprietário com dados controlados.                                                                                              |
| Google Calendar                | Adaptador real FreeBusy/events, OAuth independente do login, ID determinístico, verificação de propriedade e compensação de cancelamento.                                      | Transporte HTTP local simulado, retries, conflito, mismatch, timeout/criação tardia, tombstone e reconciliação; reserva protegida em resultados incertos.                                                    | Credenciais, escopos e operações na agenda real. Incerteza sem evento/tombstone pode reter reserva indefinidamente; não existe liberação automática arbitrária.                  |
| Notificações                   | Adaptadores SMTP e Telegram separados, Message-ID estável, resumo Telegram sem dados pessoais, falhas sanitizadas e registro por canal.                                        | Transporte SMTP simulado/HTTP local Telegram, falhas, privacidade e retries; dois canais fake processados pelo worker na imagem Docker.                                                                      | Conexão TLS/entrega real, destinatários controlados e validação operacional dos canais. A janela envio externo → ACK SQL pode duplicar mensagens.                                |
| Worker / retenção              | Processo BullMQ separado, outbox SQL durável, payload Redis só com UUID, leases/CAS, retries limitados, recuperação de crash, lembretes e retenção.                            | PostgreSQL/Redis reais descartáveis, disputa de lease, deduplicação local, falhas por canal, lembrete durável, esgotamento e recuperação por versão; processo e heartbeat Docker.                            | Operação contínua e monitoramento/backlog no ambiente do proprietário; não há garantia de entrega externa exatamente uma vez.                                                    |
| Orbe v4                        | Consulta de disponibilidade e preparação de proposta; ação privada da UI, segredo fora do contexto/histórico da LLM e confirmação HTTP explícita.                              | Ferramentas simuladas, opt-in obrigatório, ausência de ferramentas para aprovar/efetivar pedidos, não exposição do token e regressões do chat.                                                               | Avaliação real do prompt v4/modelo OpenRouter e renderização/aceite no frontend. Testes determinísticos não comprovam qualidade do modelo real.                                  |
| Contratos / banco / Docker     | OpenAPI gerado, migrations incrementais, configuração compartilhada, mesma imagem API/worker, worker opt-in, probes e modelo Nginx.                                            | OpenAPI atualizado, lint/tipos/build, renderizações Compose e testes do script de release; migrations frescas e upgrade sintético 001→005; build e runtime Docker; Nginx isolado.                            | CI remota desta revisão e homologação da topologia real TLS/CORS/proxy, inclusive proxies anteriores ao Nginx; nenhum deploy foi executado.                                      |

Os guias de [integração do frontend](../api/phase3-integration.md),
[autenticação](../architecture/authentication.md), [reuniões](../architecture/meetings.md) e
[configuração](../deployment/phase3.md) descrevem esses contratos. O frontend já pode ser desenvolvido
contra o ambiente local; habilitação pública depende das pendências acima.

## Defeitos encontrados e corrigidos

1. **Chat legado podia receber um campo novo incompatível com clientes estritos.** O schema
   anterior rejeita propriedades adicionais. Tornar `actions` opcional no OpenAPI não bastava.
   Agora a chamada precisa de `X-Orbe-Capabilities: meetings-v1` para disponibilizar ferramentas de
   agenda e receber ações. Sem o header, o servidor não envia `actions`, mesmo que um provider o
   produza. O header também integra o preflight CORS. O fixture
   `tests/fixtures/chat-v1-response.schema.json` congela o schema anterior; não foi afrouxado para
   aceitar o resultado novo. Corpo do pedido e autenticação da conversa continuam iguais.
2. **Logout/replay podia competir com refresh e deixar uma sessão sucessora ativa.** Rotação e
   revogação agora usam o mesmo mutex transacional por família, antes dos locks de linha.
   Testes PostgreSQL reproduzem ambas as ordens relevantes entre instâncias e impedem mudar
   família/usuário durante rotação. Depois da revogação não sobra sucessora válida.
3. **Timeout de criação seguido de GET 404 no Calendar podia liberar a reserva cedo demais.**
   A intenção de criação é persistida antes da rede, por lease/CAS. Uma criação pode aparecer
   depois do timeout; 404 isolado não comprova que ela foi abortada. O cancelamento incerto mantém
   a reserva e retorna `CALENDAR_RECONCILIATION_PENDING` até existir evidência suficiente, como
   remoção verificada do evento próprio ou tombstone. Conflito conhecido numa primeira tentativa
   pode liberar a reserva; conflito depois de tentativa ambígua não pode. A migration 005 cobre
   conservadoramente registros de versões anteriores. Não foi criado comando de liberação forçada.
4. **Consulta válida de 31 dias com buffer podia ultrapassar o limite interno do adaptador.**
   O limite interno agora admite a expansão nas duas bordas, continuando limitado. O formatador
   de fuso é reutilizado em vez de recriado por minuto. Há regressões para o intervalo máximo.
5. **Configuração podia aceitar frontend fora do CORS efetivo ou ignorar ajustes no Compose.**
   Auth e API agora usam a mesma allowlist normalizada, inclusive quando `CORS_ORIGINS` é omitido.
   Compose encaminha os TTLs/timeouts de auth, limites/TTL de propostas e timeout de notificações
   que já existiam no loader. O OpenAPI de `Idempotency-Key` agora inclui o regex real do servidor.
6. **O fluxo integrado assumia um horário fixo livre entre execuções.** Um timeout interrompido
   deixou uma reserva sintética protegida, como esperado. O teste agora seleciona um horário
   retornado pela disponibilidade, sem liberar a reserva incerta para fazer a repetição passar.
   A execução final usou outro banco descartável novo.

## Evidências executadas

| Verificação                    | Resultado                                                                                                                                                                                                                                                 |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                | Aprovado: ESLint, Prettier, TypeScript strict, `contracts:check`, **238 testes locais** e build.                                                                                                                                                          |
| `npm run test:infrastructure`  | **28 testes aprovados**, incluindo Compose e simulações do script de release, sem executar deploy remoto.                                                                                                                                                 |
| `npm run test:integration`     | **57 testes aprovados em 6 arquivos**, com PostgreSQL 17 e Redis 7 exclusivos e banco final fresco.                                                                                                                                                       |
| `npm audit --audit-level=high` | Nenhuma vulnerabilidade reportada no lockfile auditado.                                                                                                                                                                                                   |
| `npm run smoke`                | HTTP real do build com provider mock: health/readiness, chat e continuidade.                                                                                                                                                                              |
| Build Docker                   | Imagem local `phasscode-phase3-resume:r1` compilada; dependências de produção instaladas pelo lockfile, API/worker na mesma imagem e execução como `node`.                                                                                                |
| Runtime Docker                 | API e worker separados; migrations 001–005 presentes, readiness, chat legado/continuidade/404, sessão anônima/admin401, proposta/consentimento e PENDING sem reserva; duas entregas fake e heartbeat aprovados. Não houve promoção administrativa manual. |
| Upgrade de banco sintético     | 001 com conversa/hash/histórico existentes → 002–004 → 005. Histórico/hash e checksum 001 preservados, backfill de criação incerta preservou reserva FAILED e repetir migrations foi no-op.                                                               |
| Nginx isolado                  | `nginx -t`, health200/readiness404 externo e callback inválido401. Segundo proxy com upstream indisponível retornou502; código/estado sintéticos ausentes dos logs do callback em ambos.                                                                  |

**Total: 323 testes automatizados aprovados (238 + 28 + 57).** Smokes e conferências operacionais
não são contados como novos casos da suíte. Não se afirma que a CI remota executou esses resultados.

Houve execuções intermediárias malsucedidas: o sandbox Windows falhou antes de iniciar tsx com
`uv_os_get_passwd`; a execução autorizada fora do sandbox passou. Uma execução concorrente com
build Docker atingiu o timeout do fluxo integrado. A repetição em banco reutilizado encontrou a
reserva sintética deixada pela interrupção; o fluxo isolado passou após escolher a disponibilidade
retornada, e a suíte completa final passou em banco novo sem aumentar seu timeout. Esses resultados
não foram ocultados nem tratados como falhas do Google real.

## Migrations e proteção dos dados

- `001_conversations.sql` permanece sem alterações em relação a HEAD. Conversas e tokens legados
  continuam acessíveis pelo mesmo contrato. O migrador verifica checksum e usa lock/transações.
- `002_auth.sql`, `003_meetings.sql` e `004_notifications.sql` são os arquivos novos já presentes no
  trabalho interrompido; foram revisados e aplicados somente em bancos descartáveis. Criam
  identidade/sessão, reuniões/auditoria/outbox/exclusão de intervalos e entregas por canal.
- `005_calendar_create_uncertainty.sql` foi adicionada nesta auditoria. Adiciona a coluna
  `calendar_create_uncertain` e faz backfill conservador em reservas APPROVED/FAILED/CANCELLED
  sem identidade externa verificada. Não remove tabelas, reuniões ou reservas e não altera 001–004.
- Aplicar migrations no servidor continua fora do escopo autorizado. O guia de deploy é um
  procedimento futuro; a existência de um serviço Compose `migrate` não significa que ele foi
  executado contra um ambiente existente nesta sessão.

## Pendências para aceite da Fase 3

1. Homologar login Google, domínio/callback exatos, cookies/CSRF e rotação de sessão no navegador
   pela topologia real; validar atribuição/revogação administrativa pelo procedimento operacional.
2. Homologar a autorização Calendar independente, FreeBusy, criação/verificação/cancelamento e
   recuperação de falhas em calendário controlado, sem liberar reservas por SQL.
3. Validar SMTP/Telegram reais e a operação contínua do worker, observando backlog, esgotamento,
   lembretes, retenção e a possibilidade de envio duplicado após resultado externo ambíguo.
4. Implementar/integrar frontend de login, sessão, formulário/consentimento, acompanhamento e
   administração; habilitar o header do Orbe somente no cliente que renderiza suas ações.
5. Avaliar prompt v4 com o modelo real e revisar respostas/ações; confirmar TLS/CORS/logs/proxy
   no ambiente autorizado e a CI remota antes de qualquer release futuro.

Os itens correspondem às homologações P3-H01 a H05 de [TASKS.md](../TASKS.md). E-mail/senha,
GitHub/vinculação, MFA/passkeys e Java/Spring continuam incrementos futuros definidos na arquitetura,
sem implementações parciais apresentadas como prontas.

O teste operacional manual do CLI `auth:admin grant/revoke` permanece pendente. Na execução
anterior, a revisão automática de aprovação rejeitou a concessão administrativa por considerá-la
vedada naquela sessão. O comando não foi executado nem contornado. Os testes de autorização usam
somente usuários/papéis sintéticos em bancos descartáveis; isso não valida o CLI com a conta real
do proprietário.
