# Tarefas da PHASSCODE Platform

Atualizado em 21/10/2026. Base: commit local `984d0e9`, branch `dev`.

Este backlog separa o que já funciona dos próximos incrementos. Não representa execução,
publicação no GitHub ou autorização de deploy. Cada tarefa deve entregar código/documentação
verificável, com checks proporcionais à mudança e um commit proposto para revisão.

## Fase atual

| Fase                               | Estado                          | Evidência ou próximo marco                                                          |
| ---------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------- |
| 1 — Fundação                       | Concluída e validada localmente | Monorepo, contratos, Docker, PostgreSQL/Redis, migrations, health e qualidade       |
| 2 — Orbe Node                      | Concluída localmente            | Base de 31 documentos, avaliação real, regressões e integração do chat documentadas |
| 3 — Login, reuniões e notificações | Próxima fase                    | Começar por Google OIDC/JWT, depois reuniões, Calendar, administração e BullMQ      |
| 4 — Java                           | Pendente                        | Segunda implementação do chat e conformidade do contrato                            |
| 5 — RabbitMQ                       | Pendente                        | Adaptadores, consumidores, retries e DLQ                                            |
| 6 — Kafka                          | Pendente                        | Eventos, consumidores e reprocessamento                                             |
| 7 — Observabilidade e deploy       | Pendente                        | Métricas, tracing, homologação e operação                                           |

Já entregues: 102 testes automatizados (98 testes locais e 4 de integração com PostgreSQL/Redis),
smoke Docker com persistência após reinício e smoke real OpenRouter com tool calling. Os perfis
RabbitMQ/Kafka são infraestrutura preparada; não há adaptadores implementados. CI e CodeQL estão
aprovados remotamente na fundação publicada; o incremento atual ainda aguarda commit e CI próprios.

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

## Próximo incremento — Fase 3

As regras de disponibilidade e os registros de reuniões serão únicos para Node e Java. Começar
com um módulo coeso; separar serviço HTTP adicional apenas quando houver responsabilidade própria.

- [ ] **P3-00 — Implementar primeiro o login Google OIDC, sessão e JWT.**
  - Decisão do proprietário: primeira tarefa da Fase 3, após fechar a Fase 2. Implementar apenas
    Google OIDC neste primeiro incremento, com Authorization Code/PKCE, state/nonce, biblioteca
    mantida e emissor central confiável. Definir o contrato OpenAPI antes de integrar o frontend.
  - Separar `User`, `ExternalIdentity` por `(issuer, subject)`, credenciais, sessões e papéis.
    Não unir contas automaticamente por e-mail. Uma única fonte de identidade/permissões atenderá
    Node e Java/Spring; nenhum backend terá um cadastro independente.
  - Sessão do navegador por cookie HttpOnly/Secure/SameSite, proteção CSRF, renovação/revogação
    e JWT de API validado por assinatura, algoritmos permitidos, issuer, audience e expiração.
  - Aceite: testar callback inválido/replay, PKCE/state/nonce, sessão/logout/CSRF, JWT inválido ou
    expirado e distinção 401/403. Login não concede administração automaticamente. Portfólio/Orbe
    continuam públicos; consentimento e credenciais Google Calendar ficam independentes.
  - Referências: [arquitetura](architecture/authentication.md), [ADR 0004](adr/0004-authentication.md)
    e [contrato proposto para frontend](api/frontend-integration.md). Escolher/configurar serviço
    emissor e cliente Google; não criar implementações parciais de senha ou GitHub.

- [ ] **P3-01 — Formalizar domínio e contratos de reuniões.**
  - Definir fuso, expediente/dias, duração, antecedência e intervalo entre reuniões; precisar as
    transições PENDING/APPROVED/REJECTED/CONFIRMED/CANCELLED/FAILED.
  - Definir quando uma solicitação reserva horário, como expira e como conflitos de solicitações
    pendentes são tratados. Versionar DTOs/erros dos endpoints públicos e administrativos.
  - Aceite: regras e transições testadas, incluindo horários limítrofes e cancelamento/falha; nenhuma
    transição declara confirmação antes de verificar o evento externo.

- [ ] **P3-02 — Persistir reuniões com concorrência, idempotência, auditoria e outbox.**
  - Criar migrations de solicitações/reuniões, consulta de status por token, operações idempotentes,
    restrições de intervalos, histórico administrativo e eventos da transactional outbox.
  - Aceite: transações não perdem eventos; repetição de uma operação não duplica seu efeito;
    confirmações concorrentes sobrepostas são impedidas; dados particulares exigem autorização.
  - Dependência: P3-01. Validar concorrência real antes de permitir criação no Calendar.

- [ ] **P3-03 — Proteger a administração.**
  - Usar a autenticação de P3-00 e implementar papéis/permissões para listar, aprovar, rejeitar e
    cancelar, com trilha de auditoria e sem credenciais administrativas no navegador.
  - Aceite: acessos sem identidade ou papel adequado são negados nos testes HTTP; operações
    administrativas autorizadas ficam auditadas. Nenhum endpoint administrativo é exposto antes disso.
  - Dependências: P3-00 e contratos de P3-01; pode evoluir em paralelo à persistência.

- [ ] **P3-04 — Implementar disponibilidade e aprovação com Google Calendar.**
  - Criar porta de calendário, fake explícito e adaptador real FreeBusy/events; revalidar conflitos
    ao aprovar; usar identificador externo estável e reconciliar falhas entre banco e calendário.
  - Aceite: aprovação obrigatória funciona; CONFIRMED exige sucesso externo verificável;
    reprocessamento não cria eventos duplicados; somente intervalos disponíveis são publicados,
    sem detalhes privados de compromissos. Testes padrão usam fake; teste real usa calendário autorizado.
  - Dependências: P3-02/P3-03 e configuração OAuth/calendários para a validação externa.

- [ ] **P3-05 — Entregar notificações assíncronas e lembretes.**
  - Implementar dispatcher da outbox e worker BullMQ independente, entregas registradas,
    SMTP/Telegram separados, retries/backoff, deduplicação e lembretes atrasados.
  - Aceite: falha do canal não altera o estado transacional da reunião; eventos não desaparecem;
    reprocessamento é controlado e observável. Documentar os limites de deduplicação quando um
    fornecedor externo não oferece envio idempotente.
  - Dependências: P3-02 e contratos dos eventos; acompanhar o fluxo de P3-04.

- [ ] **P3-06 — Conectar ferramentas do Orbe aos casos de uso de reuniões.**
  - Adicionar consulta de horários e solicitação de reunião pelas mesmas regras/contratos HTTP,
    com confirmação explícita dos dados do visitante antes de efetuar a solicitação.
  - Aceite: o assistente não inventa disponibilidade nem contorna aprovação/autorização; testes
    cobrem o fluxo visitante → solicitação → decisão administrativa → Calendar → notificação.
  - Dependências: P3-04 e integração operacional de P3-05.

**Insumos externos da Fase 3:** cliente Google OIDC e serviço central de identidade; separadamente,
expediente, calendários autorizados e OAuth Calendar, SMTP e Telegram bot/chat. Não são bloqueios para começar
domínio e testes com adaptadores simulados explícitos. Segredos ficam fora do Git e do chat.

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
- [ ] **E-03 — Revisar, commitar e publicar o fechamento da Fase 2.** As alterações deste incremento
      permanecem locais. Executar a CI no novo commit quando sua publicação for autorizada.
- [ ] **E-02 — Integrar o Orbe no frontend, pelo proprietário.** O chat já pode ser integrado localmente;
      [guia](api/frontend-integration.md) e cliente TypeScript estão disponíveis. Conectar ao componente
      React e testar loading, respostas, fontes e erros é uma tarefa do repositório frontend.
      Login e reuniões terão avisos próprios quando seus contratos estiverem implementados.

Publicar o backend na internet não é requisito para encerrar a avaliação local da Fase 2. Não fazer
deploy, alterações de DNS/Nginx compartilhado ou commits/pushes adicionais como efeito deste plano.

Ordem imediata: **revisar o incremento concluído → P3-00 Google OIDC → domínio/contratos de reuniões**.
O proprietário já pode desenvolver a integração do chat em paralelo no frontend.
