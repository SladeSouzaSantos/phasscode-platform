# Tarefas da PHASSCODE Platform

Base atual: `dev/5770836`, com a implementação da Fase 3 commitada pelo proprietário.
O incremento de fallback de LLM permanece sem commit; a homologação externa segue pendente.

Este backlog separa o que já funciona dos próximos incrementos. Não representa execução,
publicação no GitHub ou autorização de deploy. Cada tarefa deve entregar código/documentação
verificável, com checks proporcionais à mudança e um commit proposto para revisão.

## Fase atual

| Fase                               | Estado                          | Evidência ou próximo marco                                                                   |
| ---------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------- |
| 1 — Fundação                       | Concluída e validada localmente | Monorepo, contratos, Docker, PostgreSQL/Redis, migrations, health e qualidade                |
| 2 — Orbe Node                      | Concluída e publicada           | PR #2 incorporada; CI/CodeQL aprovados main/dev; revisão de homologação local                |
| 3 — Login, reuniões e notificações | Em homologação                  | Código local, navegador, imagem e avaliação v4; contas externas/frontend/CI remota pendentes |
| 4 — Java                           | Pendente                        | Segunda implementação do chat e conformidade do contrato                                     |
| 5 — RabbitMQ                       | Pendente                        | Adaptadores, consumidores, retries e DLQ                                                     |
| 6 — Kafka                          | Pendente                        | Eventos, consumidores e reprocessamento                                                      |
| 7 — Observabilidade e deploy       | Pendente                        | Métricas, tracing, homologação e operação                                                    |

Na Fase 2 publicada foram aprovados 102 testes (98 locais e quatro PostgreSQL/Redis), além de
smoke Docker com persistência após reinício e smoke real OpenRouter com tool calling. Os perfis
RabbitMQ/Kafka são infraestrutura preparada; não há adaptadores implementados. CI e CodeQL estão
aprovados remotamente no fechamento da Fase 2 em `main` e `dev`. Esta revisão aguarda commit e CI próprios.

A revisão soma **195 testes aprovados**: 153 locais, 25 de infraestrutura e 17 de integração
PostgreSQL/Redis. Build, smoke, plano offline e auditoria também concluíram. A execução remota do
workflow e a avaliação real integral da v3 permanecem separadas.

## Revisão pós-Fase 2 — antes de P3-00

- [ ] **R2-00 — Definir o orçamento no ambiente local:** a conferência final encontrou provedor real
      configurado e `LLM_GLOBAL_MAX_CALLS` ausente. Escolher limite/janela conforme a conta antes de
      recriar a API; não presumir cota nem consumir LLM para descobrir o limite.
- [x] **R2-01 — Isolar ambientes:** parametrizar projeto/imagem/porta, preservar volumes existentes,
      testar renderizações equivalentes a produção/desenvolvimento e explicitar ambiente em migrations/retenção.
- [x] **R2-02 — Conter consumo real:** orçamento Redis atômico por invocação, falha fechada,
      429 com Retry-After e testes entre instâncias, sem presumir cota OpenRouter.
- [x] **R2-03 — Corrigir defeitos do chat:** conter ocupação do pool, bloquear geração sem documentos,
      preservar 504 no cancelamento, recortar contexto com prompt/JSON reais e permitir perguntas
      conceituais legítimas sobre tokens. Auditoria final também bloqueia diagnóstico SDK com conteúdo.
- [x] **R2-04 — Preparar release manual:** seguir padrão do portfólio com GHCR/digest, DAST mock,
      Tailscale/SSH e verificação; manter Nginx compartilhado e instalação de include manual.
- [ ] **R2-05 — Validar no minimac-server:** confirmar arquitetura/rede/alias, configurar environments,
      segredos, checkout e orçamento; executar release de desenvolvimento autorizada e verificar
      DNS/TLS/CORS/proxy, retenção e backups. Preparação local não comprova deploy.
- [ ] **R2-06 — Executar v3 real completa após autorização separada:** 22 mensagens HTTP, até 57
      invocações na matriz atual (teto conservador 66), com cota conferida e revisão humana.
- [x] **R2-07 — Incorporar a revisão:** código consta na base `c29714b` usada neste trabalho.
      CI remota desse SHA não foi reconferida aqui; publicação da Fase 3 está em P3-H05.

## Fase 2 — tarefas concluídas

- [x] **P2-01 — Ampliar a base de conhecimento com fatos verificáveis.**
  - Entrega: ampliar `knowledge/portfolio.json` com perfil profissional, experiências, formação,
    competências, projetos e formas públicas de contato que tenham fontes disponíveis.
  - Insumos: informações públicas fornecidas pelo proprietário e fontes públicas verificáveis.
    O que não puder ser confirmado continua explicitamente ausente; não preencher por suposição.
  - Aceite: cada registro tem origem identificável; descrição e tecnologias correspondem às fontes;
    projetos concluídos e planejados são distinguidos; a busca recupera os registros relevantes.
  - Evidência: 31 documentos e fontes em [SOURCES.md](../knowledge/SOURCES.md), incluindo as
    confirmações atuais do proprietário sobre Greencity, FacPrisma e UNISUL.

- [x] **P2-02 — Criar uma matriz versionada de avaliação do Orbe.**
  - Entrega: casos com pergunta, contexto anterior quando aplicável, fatos/fontes esperados e
    comportamentos proibidos. Cobrir informações conhecidas, lacunas, continuidade, ferramenta,
    assuntos fora do escopo, tentativas de injection e pedidos de reuniões ainda indisponíveis.
  - Aceite: critérios verificam fatos e comportamento, sem depender da reprodução literal de uma
    frase do modelo. Cobertura determinística continua executável sem chave e sem serviço pago.
  - Evidência: [matriz v3 e rubrica](../evaluation/RUBRIC.md), 20 cenários/22 turnos, runner opt-in
    e testes do avaliador sem chamada paga.

- [x] **P2-03 — Executar a avaliação real com OpenRouter e registrar resultados.**
  - Entrega: execução controlada da matriz com modelo/configuração identificados, respostas,
    fontes consultadas, tempos e falhas observados. Dados dos testes devem ser públicos/sintéticos.
  - Aceite: verificar fidelidade às fontes, reconhecimento de informação ausente, continuidade e
    ciclo de ferramenta; conferir recusas e ausência de falsas confirmações de reuniões. Registrar
    também casos malsucedidos. Não generalizar um smoke para desempenho sob carga.
  - Execução real é separada da CI padrão e respeita os limites da conta/modelo configurados.
  - Dependência: P2-02; a avaliação final usa a base consolidada em P2-01.
  - Evidência: [fechamento e relatórios](../evaluation/reports/phase2-closeout.md). Passagem completa
    do núcleo anterior e regressões nos seis cenários novos/afetados; as três últimas atualizações
    foram reavaliadas com o catálogo final. Não se afirma passagem integral da matriz v3.

- [x] **P2-04 — Corrigir desvios e registrar o fechamento da fase.**
  - Entrega: ajustes em conhecimento, recuperação, seleção de contexto ou prompt conforme os
    resultados da matriz; testes de regressão para defeitos concretos encontrados.
  - Aceite: casos essenciais da matriz aprovados; limitações restantes documentadas; lint,
    formatação, tipos, testes e build pertinentes aprovados; atualizar `PROGRESS.md` com evidências.
    Se houver mudança em persistência/Redis, executar novamente a integração correspondente.
  - Dependência: P2-03. Nenhuma garantia absoluta de imunidade a injection ou alucinação é presumida.
  - Evidência: recuperação/contexto/escopo, timeout de socket, prompt de incerteza e controle de
    reasoning corrigidos; 102 testes, build, smoke e Compose aprovados. Revisão semântica pelo Codex
    registrada separadamente da revisão humana, que permanece pendente nos relatórios automáticos.

**Marco de conclusão da Fase 2:** base pública útil e verificável, avaliação executada, desvios
essenciais corrigidos e evidências registradas. A integração LLM real já está validada; não precisa
ser reimplementada. Embeddings/pgvector permanecem uma evolução condicionada à necessidade medida.

## Fase 3 — implementação em andamento e validação da retomada

Os itens marcados abaixo registram implementação presente no trabalho local. Não equivalem a
fechamento da fase: a [auditoria da retomada](testing/phase3-resume-audit.md) separa os testes
executados das homologações e tarefas operacionais pendentes.

As regras de disponibilidade e os registros de reuniões serão únicos para Node e Java. Começar
com um módulo coeso; separar serviço HTTP adicional apenas quando houver responsabilidade própria.

- [x] **P3-00 — Implementar primeiro o login Google OIDC, sessão e JWT.**
  - Decisão do proprietário: primeira tarefa da Fase 3, após fechar a Fase 2. Implementar apenas
    Google OIDC neste primeiro incremento, com Authorization Code/PKCE, state/nonce, biblioteca
    mantida e emissor central confiável. Definir o contrato OpenAPI antes de integrar o frontend.
  - Separar `User`, `ExternalIdentity` por `(issuer, subject)`, credenciais, sessões e papéis.
    Não unir contas automaticamente por e-mail. Uma única fonte de identidade/permissões atenderá
    Node e Java/Spring; nenhum backend terá um cadastro independente.
  - Sessão do navegador por cookie HttpOnly/Secure/SameSite, proteção CSRF, renovação/revogação
    e JWT de API validado por assinatura, algoritmos permitidos, issuer, audience e expiração.
  - Aceite: testar callback inválido/replay, PKCE/state/nonce, sessão/logout/CSRF, JWT inválido ou
    expirado e distinção 401/403. Login exclusivo do e-mail Google verificado de `AUTH_ADMIN_EMAIL`,
    com bootstrap administrativo inicial auditado e recusa de outras contas antes de cadastro/
    sessão. Revogação não é revertida automaticamente. Portfólio/Orbe
    continuam públicos; consentimento e credenciais Google Calendar ficam independentes.
  - Referências: [arquitetura](architecture/authentication.md), [ADR 0004](adr/0004-authentication.md)
    e [contrato implementado para frontend](api/phase3-integration.md). O módulo central AuthService,
    PostgreSQL, openid-client e jose implementam OIDC/BFF/emissão JWT; cliente real Google exige
    configuração do proprietário. Não há implementações parciais de senha ou GitHub.

- [x] **P3-01 — Formalizar domínio e contratos de reuniões.**
  - Definir fuso, expediente/dias, duração, antecedência e intervalo entre reuniões; precisar as
    transições PENDING/APPROVED/REJECTED/CONFIRMED/CANCELLED/FAILED.
  - Definir quando uma solicitação reserva horário, como expira e como conflitos de solicitações
    pendentes são tratados. Versionar DTOs/erros dos endpoints públicos e administrativos.
  - Aceite: regras e transições testadas, incluindo horários limítrofes e cancelamento/falha; nenhuma
    transição declara confirmação antes de verificar o evento externo.

- [x] **P3-02 — Persistir reuniões com concorrência, idempotência, auditoria e outbox.**
  - Criar migrations de solicitações/reuniões, consulta de status por token, operações idempotentes,
    restrições de intervalos, histórico administrativo e eventos da transactional outbox.
  - Aceite: transações não perdem eventos; repetição de uma operação não duplica seu efeito;
    confirmações concorrentes sobrepostas são impedidas; dados particulares exigem autorização.
  - Dependência: P3-01. Validar concorrência real antes de permitir criação no Calendar.

- [x] **P3-03 — Proteger a administração.**
  - Usar a autenticação de P3-00 e implementar papéis/permissões para listar, aprovar, rejeitar e
    cancelar, com trilha de auditoria e sem credenciais administrativas no navegador.
  - Aceite: acessos sem identidade ou papel adequado são negados nos testes HTTP; operações
    administrativas autorizadas ficam auditadas. Nenhum endpoint administrativo é exposto antes disso.
  - Dependências: P3-00 e contratos de P3-01; pode evoluir em paralelo à persistência.

- [x] **P3-04 — Implementar disponibilidade e aprovação com Google Calendar.**
  - Criar porta de calendário, fake explícito e adaptador real FreeBusy/events; revalidar conflitos
    ao aprovar; usar identificador externo estável e reconciliar falhas entre banco e calendário.
  - Aceite: aprovação obrigatória funciona; CONFIRMED exige sucesso externo verificável;
    reprocessamento não cria eventos duplicados; somente intervalos disponíveis são publicados,
    sem detalhes privados de compromissos. Testes padrão usam fake; teste real usa calendário autorizado.
  - Dependências: P3-02/P3-03 e configuração OAuth/calendários para a validação externa.

- [x] **P3-05 — Entregar notificações assíncronas e lembretes.**
  - Implementar dispatcher da outbox e worker BullMQ independente, entregas registradas,
    SMTP/Telegram separados, retries/backoff, deduplicação e lembretes atrasados.
  - Aceite: falha do canal não altera o estado transacional da reunião; eventos não desaparecem;
    reprocessamento é controlado e observável. Documentar os limites de deduplicação quando um
    fornecedor externo não oferece envio idempotente.
  - Dependências: P3-02 e contratos dos eventos; acompanhar o fluxo de P3-04.

- [x] **P3-06 — Conectar ferramentas do Orbe aos casos de uso de reuniões.**
  - Adicionar consulta de horários e solicitação de reunião pelas mesmas regras/contratos HTTP,
    com confirmação explícita dos dados do visitante antes de efetuar a solicitação.
  - Aceite: o assistente não inventa disponibilidade nem contorna aprovação/autorização; testes
    cobrem o fluxo visitante → solicitação → decisão administrativa → Calendar → notificação.
  - Dependências: P3-04 e integração operacional de P3-05.

**Evidências:** [validação da Fase 3](testing/phase3.md), [arquitetura de reuniões](architecture/meetings.md),
[integração do frontend](api/phase3-integration.md) e [operação](deployment/phase3.md). Política confirmada:
Fortaleza, seg–sáb 09h–18h, duração de 30 minutos, antecedência de 24 horas, intervalo de 15 minutos
e reserva na aprovação. Grade de 15 minutos, PENDING até sete dias/fim do horário e dados pessoais
elegíveis anonimizados após 90 dias.

### Homologação externa e entrega do incremento

Etapa local adicional de 23/10, com [evidências](testing/phase3-local-validation-2026-10-23.md):

- [x] **P3-L01:** preflight offline host/Compose, sanitizado e sem efeitos.
- [x] **P3-L02:** navegador real local com OIDC assinado, cookie HttpOnly, CORS/CSRF e sessão.
- [x] **P3-L03:** qualificação reproduzível da imagem com API/worker separados e dependências
      exclusivas; CI preparada com job de navegador, sem execução remota nesta sessão.
- [x] **P3-L04:** avaliação v4 autorizada: 4/4 cenários e quatro chamadas à OpenRouter, com reuniões
      simuladas. Conferência semântica pelo Codex registrada; revisão humana permanece pendente.
- [x] **P3-L05:** contratos, clientes e [handoff](api/phase3-frontend-handoff.md) entregues ao proprietário,
      que confirmou manter a implementação visual consigo.

O proprietário confirmou que ainda não configurou as credenciais. Os itens externos continuam abertos:

- [ ] **P3-H01 — Google OIDC real:** configurar cliente/callback/URLs/TLS, chave de assinatura e admin;
      conferir login/logout/refresh/CSRF no navegador do proprietário com a sessão segura.
- [ ] **P3-H02 — Calendar autorizado:** consentimento OAuth separado, calendário de homologação,
      criação/cancelamento reais e reconciliação verificados com autorização explícita.
- [ ] **P3-H03 — Canais reais:** testar SMTP e/ou Telegram com destinatários controlados; conferir
      credenciais, TLS, rate limits e a janela de duplicação após envio sem ACK SQL.
- [ ] **P3-H04 — Frontend e servidor:** o proprietário integra contratos e aviso de privacidade;
      homologar proxy/CORS/DNS/TLS/backup/retention e executar release autorizada no minimac-server.
- [ ] **P3-H05 — Publicação:** revisar diff, criar commit e conferir CI/CodeQL remotos deste incremento.
      Implementação e testes locais não significam push ou deploy.

Segredos ficam fora do Git e do chat. Esses itens não são implementações incompletas: faltam
configuração, credenciais, aprovação das ações externas e validação com as contas reais.

## Incremento antes da Fase 4 — fallback de LLM

- [x] **LLM-F01:** OpenRouter → Gemini → Groq → Cohere opt-in, chaves/modelos/cotas por candidato,
      Redis compartilhado para cooldown e limites, deadline único e preservação das ferramentas.
- [x] **LLM-F02:** contrato de chat legado preservado, parâmetros por transporte e assinaturas
      Gemini validados; configuração, preflight, Compose, README e [guia](deployment/llm-fallback.md).
- [x] **LLM-F03:** 452 testes únicos aprovados, smoke compilado, build/qualificação Docker e
      bootstrap isolado dos quatro candidatos. [Evidências](testing/llm-fallback-2026-10-24.md).
- [ ] **LLM-F04:** proprietário configura os modelos gratuitos/chaves/cotas e homologa os candidatos
      reais autorizados. Cohere trial não entra em produção; Gemini/Groq dependem do plano da conta.
      Sem alteração de `.env`, chamadas reais, commit ou deploy neste incremento.

## Evolução de autenticação após Google OIDC

- [ ] **AUTH-01 — E-mail/senha:** credenciais independentes de `User`, Argon2id, verificação de
      e-mail, recuperação com token de uso único/expirável armazenado por hash, invalidação após
      uso, rate limiting e proteção contra força bruta/enumeração. Sem password grant OAuth.
- [ ] **AUTH-02 — GitHub e vinculação:** OAuth GitHub pelo mesmo núcleo central, vincular/remover
      identidades com sessão e reautenticação/prova de controle. Conflitos e e-mails iguais não
      podem provocar associação automática ou permitir tomar uma conta.
- [ ] **AUTH-03 — MFA:** segundo fator, recuperação e reautenticação de operações sensíveis,
      especialmente administração; política comum aos serviços.
- [ ] **AUTH-04 — Passkeys:** WebAuthn com credenciais independentes, desafios de uso único,
      validação de origin/RP ID e fluxo seguro de recuperação/remoção.

Essas tarefas registram requisitos; não existem endpoints, stubs ou credenciais locais desses
métodos. Sua implementação será priorizada depois de validar o primeiro fluxo Google.

## Fases seguintes

- [ ] **P4-01:** configurar Java LTS/build compatíveis e criar Spring Boot/LangChain4j executável.
- [ ] **P4-02:** implementar o mesmo contrato de chat e conhecimento com testes de conformidade.
- [ ] **P4-03:** selecionar Node/Java por configuração interna do gateway e reutilizar o único módulo/
      serviço de reuniões, sem duplicar regras ou banco.
- [ ] **P4-04:** implementar autenticação compatível em Spring Security OAuth2 Client/Resource Server,
      com o mesmo emissor, usuários/papéis, sessões e matriz de conformidade de P3-00.
- [ ] **P5-01:** implementar RabbitMQ com exchanges, routing keys, acknowledgments, retries e DLQ.
- [ ] **P5-02:** testar consumidores idempotentes e comunicação Node/Java; documentar diferenças para BullMQ.
- [ ] **P6-01:** versionar eventos de domínio e implementar produtores/consumidores Kafka.
- [ ] **P6-02:** definir tópicos, chaves/ordenação, grupos, retenção e reprocessamento; testar replay.
- [ ] **P7-01:** adicionar métricas, tracing e acompanhamento de falhas, latência e uso/custo do LLM.
- [ ] **P7-02:** validar retenção operacional, privacidade, proteção contra abuso/cotas e backups.
- [ ] **P7-03:** preparar homologação e integrar o Nginx existente com configuração específica do projeto.
- [ ] **P7-04:** preparar publicação/release com permissões mínimas e aprovação explícita para produção.

## Entregas paralelas e limites do backlog

- [x] **E-01 — Publicar a fundação e conferir a primeira CI remota.** Confirmado por leitura do
      GitHub: `dev/984d0e9` publicado e PR #1 incorporada em `main/e78ef0a`; Backend CI e CodeQL
      concluíram com sucesso nas duas branches. Essa validação é do primeiro incremento.
- [x] **E-03 — Publicar o fechamento da Fase 2.** PR #2 em `main/7357329`, sincronizada em
      `dev/85ebca3`, com CI/CodeQL aprovados nas duas branches. A revisão pós-fase é outro incremento.
- [ ] **E-02 — Integrar o Orbe no frontend, pelo proprietário.** O chat já pode ser integrado localmente;
      [guia](api/frontend-integration.md) e cliente TypeScript estão disponíveis. Conectar ao componente
      React e testar loading, respostas, fontes e erros é uma tarefa do repositório frontend.
      Login e reuniões agora têm [contratos implementados](api/phase3-integration.md) para integração.

Publicar o backend na internet não é requisito para encerrar a avaliação local da Fase 2. Não fazer
deploy, alterações de DNS/Nginx compartilhado ou commits/pushes adicionais como efeito deste plano.

Ordem imediata: **revisar/publicar Fase 3 → integrar frontend → homologação autorizada → Fase 4 Java**.
Os contratos de chat, login e reuniões já permitem desenvolver o frontend em paralelo.
