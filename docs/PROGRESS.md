# Progresso e continuidade

Atualizado em 21/10/2026, America/Sao_Paulo.

## Estado atual

**Fases 1 e 2 concluídas e validadas localmente.** A próxima entrega é P3-00: login Google OIDC,
sessão e JWT, antes dos endpoints administrativos e do agendamento.

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

## Validação executada

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

## Estado operacional e publicação

Compose usa `.env` ignorado pelo Git, OpenRouter em `chat-completions`, modelo
`nvidia/nemotron-3.5-super-vl:free`, timeout de 30 segundos, saída de 800 tokens e contexto de
12.000 caracteres. A API publica somente `127.0.0.1:3000`; bancos não publicam portas. Volumes de
desenvolvimento foram preservados. O ambiente exclusivo de integração foi removido após os testes.

A fundação foi publicada pelo proprietário em `dev/984d0e9` e incorporada pela PR #1 em
`main/e78ef0a`. Foram conferidos os resultados de [Backend CI](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/39670852615)
e [CodeQL](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/39670852661): sucesso.
As alterações de fechamento desta fase permanecem locais e ainda não têm commit ou CI próprios.
Não houve novo push, deploy, alteração de DNS, certificados ou Nginx compartilhado por este trabalho.

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
