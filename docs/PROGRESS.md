# Progresso e continuidade

Atualizado em 22/10/2026, America/Sao_Paulo.

## Estado atual

**Fases 1 e 2 concluídas e publicadas pela PR #2.** A revisão pós-Fase 2 prepara homologação no
`minimac-server`. A próxima entrega funcional é P3-00: Google OIDC, sessão e JWT. Esta revisão
ainda é local e precisa de seu próprio commit e CI.

O chat já permite integração local do frontend em `http://localhost:3000/api/v1/chat`.
Swagger: `http://localhost:3000/docs/`. O [guia do frontend](api/frontend-integration.md) e o
[cliente TypeScript](../examples/frontend-client.ts) registram o contrato disponível. O proprietário
implementará a integração visual em seu repositório; esse frontend permanece sem alterações aqui.

## Entregas concluídas

A fundação usa Node.js 24, TypeScript strict, Fastify, npm workspaces, contratos Zod/OpenAPI,
Swagger, PostgreSQL/Redis, migrations, Docker/Compose, healthchecks e CI. O Orbe oferece chat com
fontes, histórico limitado, token de conversa emitido uma vez, ferramentas públicas somente de
leitura, mock explícito e integração real LangChain/OpenRouter, sem fallback silencioso.

A base foi ampliada de dois para **31 documentos**: perfil, quatro experiências, sete formações,
cursos, idiomas e projetos. A curadoria usa o portfólio antigo, repositórios públicos, currículo
autorizado e confirmações diretas do proprietário. [SOURCES.md](../knowledge/SOURCES.md) registra
revisões, páginas do currículo, origem e conflitos. O LinkedIn bloqueou a leitura pública; nenhum
conteúdo dele foi presumido. O PDF e seu texto integral não foram incorporados ao Git.

Confirmações de 21/10/2026 prevalecem sobre o currículo antigo:

- Atuação atual na Greencity Sustainable Energy.
- Somente a pós em Segurança da Informação concluída na FacPrisma, sem data de conclusão informada.
- Ciência da Computação/UNISUL trancada nas últimas disciplinas, com previsão de conclusão em
  dezembro de 2027.

A divergência da conclusão da UnP (dezembro/2014 no CV, fevereiro/2015 no site), a associação de
Lithology e outros pontos históricos permanecem identificados. Cursos livres não são tratados como
certificações profissionais verificadas.

## Validação histórica da Fase 2

| Verificação                                              | Resultado                                                                    |
| -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Lint, formatação, TypeScript e conformidade OpenAPI      | Aprovados                                                                    |
| Testes locais: domínio, HTTP, contexto, SDK e avaliação  | 98 aprovados                                                                 |
| Integração PostgreSQL 17 + Redis 7 em ambiente exclusivo | 4 aprovados, reexecutados nesta etapa                                        |
| Build e smoke em processo/socket HTTP reais              | Aprovados                                                                    |
| Conexão HTTP com geração acima de dez segundos           | Regressão aprovada                                                           |
| Imagem e Compose com a base atual                        | API, PostgreSQL e Redis saudáveis; migrations concluídas                     |
| Auditoria de dependências durante build Docker           | Nenhuma vulnerabilidade reportada                                            |
| Núcleo real OpenRouter, matriz v1 e catálogo anterior    | 16 cenários / 18 turnos aprovados em uma passagem completa                   |
| Ampliação de conhecimento e atualização do proprietário  | Seis cenários novos ou afetados avaliados, com reexecuções registradas       |
| Recuperação no catálogo atual, matriz v3                 | Fontes obrigatórias presentes e completas nos 22 turnos, verificação sem LLM |

São **102 testes automatizados**, além dos smokes e chamadas reais. A matriz disponível agora é
`orbe-phase2-v3`, com 20 cenários/22 turnos. Ela evoluiu durante a curadoria; não foi executada
integralmente numa única passagem contra o catálogo final de 31 documentos. O fechamento combina
a passagem completa anterior com regressões direcionadas e revisão semântica pelo Codex. Não se
declara uma aprovação integral da v3 nem revisão humana realizada.

Resultados, configurações, falhas e a correspondência entre cenários e relatórios estão em
[phase2-closeout.md](../evaluation/reports/phase2-closeout.md). Os relatórios automáticos mantêm
`humanReview: pending`. Essa amostra não mede carga, estabilidade estatística ou segurança exaustiva.

## Ajustes derivados da avaliação

- Recuperação por termos completos, aliases, ponderação de especificidade e frases exatas para
  distinguir Java/JavaScript e priorizar o projeto solicitado.
- Continuações consecutivas preservam o tópico. O histórico seleciona pares completos e exclui
  turnos recusados por escopo, injection ou funcionalidades indisponíveis.
- O escopo reconhece palavras-chave dos novos documentos, sem exigir nomes de projetos no código.
- O socket HTTP aguarda o orçamento da LLM; antes encerrava a conexão após dez segundos.
- Prompt ativo `orbe-v3` distingue informação não confirmada de negação de uma qualificação.
- `OPENROUTER_REASONING_ENABLED` permite controlar explicitamente a extensão do provedor; vazio
  preserva seu padrão. Localmente é `false`, evitando consumir o pequeno orçamento de saída antes
  do texto final. Raciocínio interno nunca é usado como resposta alternativa.

Ocorreram timeouts, indisponibilidade e resposta vazia durante a avaliação; os registros foram
preservados. No caso Laravel, a pergunta foi ajustada para pedir tecnologias explicitamente,
mantendo o check do framework e as fontes; a reexecução passou.

## Revisão pós-Fase 2

O contrato do chat e os 31 documentos foram preservados. Este incremento entrega:

- Compose com projeto, imagem, porta, volumes e redes privados separados por ambiente, override
  de proxy opt-in e scripts com projeto/arquivo de ambiente explícitos.
- Orçamento global Redis atômico por invocação real, incluindo tool calling; 429 com Retry-After,
  falha fechada em indisponibilidade e nenhum fallback mock. Limite deve ser escolhido pelo operador.
- Admissão PostgreSQL de oito turnos por pool padrão de dez, preservando espaço para readiness.
  Transações ainda duram durante a geração; leases/transações curtas dependem de carga demonstrada.
- Bloqueio de geração sem documentos por falta de contexto, 504 preservado no cancelamento e
  correção da recusa de perguntas conceituais legítimas sobre tokens. A busca continua lexical.
- Máximo de três invocações e duas rodadas com três buscas locais por turno. A terceira chamada
  não executa buscas que nunca seriam consumidas por outra geração.
- Release manual seguindo o portfólio: CI/SAST, GHCR por digest, DAST mock descartável,
  Tailscale/SSH e verificação. Configuração e execução externas ainda pendentes.

A [revisão do chat](testing/post-phase2-chat-review.md) registra evidências e limites. A v3 mantém
20 cenários/22 turnos. A regressão offline usa o ChatService real com provedor sintético para
verificar fontes completas e políticas, sem avaliar geração: 19 turnos elegíveis e três
determinísticos, até 57 invocações (38 adicionais após ferramentas) e 114 buscas locais. O plano
imprime também o teto conservador de 66 invocações para quaisquer 22 turnos. `--max-calls=22`
limita HTTP, não chamadas ao modelo. Não foi executado `--live` nesta revisão; aprovação integral
real da v3 e revisão humana continuam pendentes.

## Estado operacional e publicação

Validação desta revisão, em 22/10/2026:

| Verificação                          | Resultado                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------- |
| `npm ci --ignore-scripts`            | Concluído, lockfile preservado                                                        |
| `npm run check`                      | Lint, formatação, tipos, contrato OpenAPI, **153 testes locais** e build aprovados    |
| `npm run test:infrastructure`        | **25 testes aprovados**, Compose real sem daemon e scripts com ferramentas simuladas  |
| PostgreSQL 17 + Redis 7 descartáveis | **17 testes aprovados**, incluindo concorrência do orçamento e headroom do pool       |
| `npm run smoke`                      | Processo compilado, health/readiness e dois turnos por socket HTTP aprovados com mock |
| `npm audit --audit-level=high`       | Nenhuma vulnerabilidade reportada                                                     |
| `npm run eval:orbe`                  | Plano v3, 20 cenários/22 mensagens e tetos de consumo; zero chamadas HTTP/LLM         |

Total: **195 testes automatizados**. O primeiro `check` parou por formatação em `docs/TASKS.md`;
após corrigir, a execução completa passou. A instalação npm inicialmente falhou no sandbox ao
gravar seu cache/log; foi repetida com acesso permitido e concluiu. O projeto Docker exclusivo
`phasscode-review-20261022-r1` foi conferido vazio, criado para integração e removido com seus dados
descartáveis após o sucesso. Nenhum volume existente de desenvolvimento/produção foi removido.

Na conferência final, a imagem runtime também foi reconstruída e testada com configuração de
produção, PostgreSQL/Redis descartáveis e mock, incluindo restart, retenção e Nginx privado.
O modelo de proxy passou por troca de IP da API sem reload; `/ready` interno respondeu 200 e
externo 404, com `/health` público 200. Não houve publicação GHCR, ZAP, Tailscale, SSH ou deploy remoto.

A [auditoria requisito a requisito](testing/post-phase2-audit.md) registra lacunas adicionais
corrigidas: pré-validação OCI, persistência do modo de proxy, contexto com prompt/JSON, integridade
de TTL Redis, 503 no limitador por IP, bloqueio de diagnóstico SDK e atualização do modelo Nginx.
Um teste de infraestrutura atingiu dez segundos sob build concorrente; o limite específico foi
ajustado para 30 segundos e a suíte isolada passou 25/25, sem remover asserções.
Os projetos exclusivos `phasscode-audit-tests-20261022-r2` e `phasscode-audit-runtime-20261022`
foram removidos após a validação, preservando dados existentes dos demais ambientes.

Na avaliação anterior, o Compose usou `.env` ignorado pelo Git, OpenRouter em `chat-completions`, modelo
`nvidia/nemotron-3.5-super-vl:free`, timeout de 30 segundos, saída de 800 tokens e contexto de
12.000 caracteres. A API publica somente `127.0.0.1:3000`; bancos não publicam portas. Volumes de
desenvolvimento foram preservados. O ambiente exclusivo de integração foi removido após os testes.
Nenhum segredo local foi alterado nesta revisão. Antes de recriar uma API real, configurar
`LLM_GLOBAL_MAX_CALLS`. Instâncias do mesmo ambiente compartilham Redis/chave/política;
ambientes isolados precisam repartir a cota da conta se usarem o mesmo provedor/credencial.
Na conferência final, o `.env` local continua sem esse limite; foi verificada somente sua
presença/validade, sem imprimir segredos. A API real revisada requer configurá-lo antes de iniciar.

A fundação foi publicada pela PR #1. A [PR #2](https://github.com/SladeSouzaSantos/phasscode-platform/pull/2)
publicou o fechamento da Fase 2 em `main/7357329`, sincronizado em `dev/85ebca3`.
Conferidos remotamente: [CI main](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/39697791259),
[CodeQL main](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/39697791304),
[CI dev](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/39697973470) e
[CodeQL dev](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/39697973426), todos aprovados.
Esses checks são do fechamento publicado; esta revisão aguarda commit e CI próprios.
Não houve commit, push, deploy, publicação GHCR ou alteração de DNS, certificados e Nginx nesta revisão.

Os arquivos fornecidos do frontend orientaram o fluxo preparado; não foram editados.
O [guia do Mac Mini](deployment/README.md) separa plano, aplicação manual e configuração externa.
O include compartilhado `/opt/projects/*/nginx.conf` permanece.

No diagnóstico inicial, a chave OpenRouter de gerenciamento não permitia inferência. O proprietário
a substituiu por uma chave comum e a integração real passou. Chaves, hashes de chaves e tokens de
conversa não foram registrados nos relatórios.

## Próxima fase

Seguir [TASKS.md](TASKS.md), começando por **P3-00 — Google OIDC**. O chat e o portfólio continuam
públicos; o login será exigido para funções específicas, especialmente administração. Separar
`User`, identidades vinculadas, credenciais e sessões; Node e Java/Spring compartilharão identidade,
papéis e contratos. Detalhes na [arquitetura de autenticação](architecture/authentication.md).

E-mail/senha com Argon2id e recuperação/verificação seguras, GitHub com vinculação, MFA e passkeys
estão no roadmap, sem stubs. O consentimento Google Calendar será independente do login Google.
Após autenticação, implementar domínio/contratos de reuniões, persistência concorrente/idempotente,
Calendar, outbox, worker BullMQ e notificações. Java, RabbitMQ, Kafka e publicação vêm nas fases
seguintes. O proprietário será avisado quando os contratos de login e reuniões estiverem integráveis.
