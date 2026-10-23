# Progresso e continuidade

Atualizado em 23/10/2026, America/Sao_Paulo.

## Estado atual

**Fase 3 em homologação, com implementação local e contratos disponíveis.** A retomada parte de `dev/64c8414`, que
inclui a revisão de segurança e deploy pós-Fase 2. Este incremento ainda não foi commitado,
publicado ou implantado; não há comprovação das contas externas ou do minimac-server.

Há contratos implementados para **Google OIDC, sessão, reuniões e administração**.
O [guia da Fase 3](api/phase3-integration.md) e o [OpenAPI](../packages/contracts/openapi.json)
definem os contratos locais. Em 23/10 o proprietário confirmou que ainda não configurou os provedores
e que a UI continuará sob sua responsabilidade. O [handoff](api/phase3-frontend-handoff.md) inclui
clientes e sequência de integração. O frontend permanece em seu próprio repositório e não foi
alterado. Portfólio e Orbe continuam públicos.

## Implementação local da Fase 3 em revisão

- Google OIDC com biblioteca mantida, Code/PKCE/state/nonce/assinatura, transação de uso único e
  vínculo `(issuer,subject)`. Usuários, identidades, papéis e sessões ficam no PostgreSQL central.
- BFF com cookie opaco HttpOnly/Secure/SameSite, Origin/CSRF, rotação/reuso/logout. JWT RS256 de
  serviço, JWKS e revogação por sessão; nenhum JWT ou token Google no navegador. Admin só por
  atribuição explícita e auditada do operador. Senha/GitHub/MFA/passkeys seguem no roadmap.
  Rotação, reuso e logout compartilham mutex transacional por família, impedindo uma sucessora
  ativa de escapar de revogação concorrente entre instâncias.
- Política confirmada: America/Fortaleza, seg–sáb 09h–18h, 30min, 24h de antecedência e buffer de
  15min. Grade de 15min. Solicitação pendente não reserva horário; aprovação faz reserva SQL.
- Propostas privadas com TTL, confirmação explícita e consentimento, idempotência, status por
  token hash, paginação administrativa, auditoria e exclusão de intervalos entre instâncias.
- Calendar real FreeBusy/events com OAuth próprio, ID determinístico e verificação/reconciliação.
  CONFIRMED exige sucesso externo verificável. Falhas incertas e cancelamentos mantêm a reserva
  até verificar a remoção; não há transação atômica com outros escritores do Google.
  A migration aditiva `005_calendar_create_uncertainty.sql` persiste a ambiguidade e marca reservas
  antigas conservadoramente. Um conflito antes do insert pode liberar reserva sem tentativa
  anterior incerta; depois de ambiguidade, um conflito em retry ou GET `404` não basta. Cancelamento
  sem evidência externa suficiente conserva a reserva, potencialmente por prazo indefinido.
- Worker BullMQ independente, outbox durável, leases/CAS, SMTP/Telegram separados, retries,
  entregas por canal e lembretes. Redis recebe apenas UUID, sem dados do visitante. Falha de
  canal não desfaz reunião; envio sem ACK SQL ainda pode duplicar notificações.
- Ferramentas do Orbe consultam horários e preparam proposta. O token vai só para uma ação privada
  da UI; criar pedido exige confirmação HTTP, e aprovar exige identidade/admin/CSRF fora da IA.
  O chat exige `X-Orbe-Capabilities: meetings-v1` para essas ferramentas e ações; clientes sem o
  opt-in preservam a resposta legada mesmo quando reuniões estão habilitadas.
- Compose/Docker incluem worker opt-in e a mesma imagem no release; template Nginx exclui códigos
  OAuth dos logs. Retenção trata propostas, sessões e PII sem apagar a trilha administrativa.

Resultados atuais em [testing/phase3-local-validation-2026-10-23.md](testing/phase3-local-validation-2026-10-23.md).
Passaram **361 testes**: 275 locais, 28 de infraestrutura, 57 de integração e um de navegador,
além de lint, formatação, tipos, contratos, build, smoke HTTP, qualificação Docker e auditoria sem
vulnerabilidades reportadas. O harness de infraestrutura foi otimizado mantendo casos e timeouts.
A etapa de 23/10 acrescentou preflight offline, navegador real com OIDC local, qualificação
reproduzível da imagem/CI e avaliação autorizada do v4: quatro cenários aprovados, com quatro
chamadas reais à OpenRouter e reuniões simuladas. Dois cenários são de política determinística.
A [conferência semântica](../evaluation/reports/phase3-semantic-review.md) preserva a revisão humana
como pendente. Nenhuma credencial Google/Calendar/canal foi presumida.
A [auditoria de 22/10](testing/phase3-resume-audit.md) registra 323 testes e o upgrade sintético
001→005 preservando histórico/hash; o Nginx isolado não registrou código/estado OAuth. Esses
resultados e [phase3.md](testing/phase3.md) são históricos; os novos totais estão no relatório atual.
As migrations foram executadas somente em bases descartáveis.
As novas funções começam desativadas. Configuração em [.env.example](../.env.example) e
[deployment/phase3.md](deployment/phase3.md); não houve alteração das credenciais reais do `.env`.

## Histórico preservado

Fases 1 e 2 publicadas pelas PRs #1/#2. A base contém 31 documentos públicos com proveniência em
[SOURCES.md](../knowledge/SOURCES.md). Confirmações do proprietário: atua na Greencity; concluiu
somente Segurança da Informação na FacPrisma; Ciência da Computação/UNISUL está trancada, com
previsão de dezembro/2027. O LinkedIn não foi presumido quando sua leitura pública falhou.

A integração real OpenRouter e a avaliação anterior estão no
[fechamento da Fase 2](../evaluation/reports/phase2-closeout.md). A revisão posterior teve
195 testes e está registrada em [post-phase2-validation.md](testing/post-phase2-validation.md)
e na [auditoria](testing/post-phase2-audit.md). São evidências históricas; a matriz v3 completa
não foi reexecutada integralmente; a avaliação v4 de 23/10 tem escopo próprio e limitado.

## Pendências e continuidade

Revisar as limitações registradas e concluir as homologações externas. A Fase 3 permanece em
andamento; não avançar para a Fase 4 como se a homologação estivesse concluída. Nenhum commit,
push, merge ou deploy está autorizado nesta retomada. Em trabalho posterior explicitamente
autorizado, configurar/homologar Google OIDC e,
separadamente, Calendar e canais, com destinatários e calendário controlados; integrar o frontend
e validar TLS/CORS/proxy no ambiente de desenvolvimento autorizado. As tarefas externas estão em
[TASKS.md](TASKS.md), P3-H01 a H05. Credenciais, consumo LLM e ações reais não foram presumidos.

A Fase 4 implementará Java/Spring usando os mesmos contratos e a identidade central, sem outra
base de usuários ou regras de agenda. RabbitMQ, Kafka e observabilidade continuam nas fases
seguintes. Nenhum commit, push, merge, mensagem externa, migration no servidor, sobrescrita de
`.env` existente ou deploy foi executado nesta auditoria.
