# Entrega da revisão pós-Fase 2

Revisão concluída localmente em 22/10/2026, na branch `dev`, sobre `85ebca3`. A Fase 2 publicada
pela PR #2 permanece preservada. Nenhum commit, push, deploy, publicação de imagem ou chamada real
à LLM foi realizado neste incremento.

## Resultado e validação

Corrigidos isolamento Docker, ausência de orçamento global por invocação, saturação do pool por
gerações longas, geração sem documentos por falta de contexto, corrida no timeout, recusa de
pergunta conceitual sobre tokens e buscas inúteis depois da última rodada do modelo. Os comandos
operacionais preservam a imagem aplicada para migrations/retenção, mesmo diante de `.env` antigo.

Foram aprovados **195 testes**: 153 locais, 25 de infraestrutura e 17 PostgreSQL/Redis. Também
passaram instalação pelo lockfile, lint, formatação, tipos, contrato OpenAPI, build, smoke HTTP,
auditoria (zero vulnerabilidades reportadas) e plano offline v3. A stack descartável exclusiva foi
removida após os testes. [PROGRESS.md](../PROGRESS.md) registra comandos, correções de validação e
limites; a [revisão do chat](post-phase2-chat-review.md) detalha os defeitos e as regressões.

## Arquivos alterados ou adicionados

A [auditoria final](post-phase2-audit.md) confere os dez requisitos, registra as lacunas adicionais
corrigidas e separa a implementação local das pendências operacionais e de autorização.

Infraestrutura e operação:

- `.env.example`, `.gitignore`, `package.json`.
- `compose.yaml`, `compose.dev.yaml`, `compose.test.yaml`, `compose.proxy.yaml`.
- `.ci/zap-rules.conf`.
- `.github/actions/tailscale-connect/action.yml`.
- `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`.
- `infrastructure/nginx.conf.example`.
- `scripts/compose.sh`, `scripts/deploy.sh`.

Aplicação, orçamento e avaliação:

- `packages/shared-config/src/index.ts`.
- `apps/orbe-node/src/main.ts`, `http/app.ts`.
- `apps/orbe-node/src/application/chat.ts`.
- `apps/orbe-node/src/domain/errors.ts`, `security.ts`, `llm-budget.ts`, `llm-limits.ts`.
- `apps/orbe-node/src/adapters/langchain-provider.ts`, `postgres-store.ts`, `redis-llm-budget.ts`.
- `evaluation/schema.ts`, `scripts/evaluate-orbe.ts`.

Testes:

- `tests/context.test.ts`, `domain.test.ts`, `http.test.ts`, `llm-adapter.test.ts`.
- `tests/evaluation-context.test.ts`, `infrastructure.test.ts`.
- `tests/llm-budget.test.ts`, `llm-budget.integration.test.ts`.
- `tests/llm-privacy.test.ts`.
- `tests/postgres-admission.test.ts`, `postgres.integration.test.ts`.

Documentação:

- `README.md`, `docs/PROGRESS.md`, `docs/TASKS.md`, `docs/security.md`.
- `docs/api/frontend-integration.md`, `docs/deployment/README.md`, `docs/testing/README.md`.
- `evaluation/RUBRIC.md`, `docs/testing/post-phase2-chat-review.md`, `post-phase2-audit.md` e este relatório.

O contrato JSON público, prompt `orbe-v3`, catálogo de 31 documentos, relatórios reais anteriores,
lockfile e os arquivos do frontend fornecidos como referência permanecem preservados.

## O que ainda depende de execução externa

O workflow manual está preparado; GHCR, ZAP, Tailscale, SSH e deploy precisam de sua primeira
execução no GitHub/servidor. Confirmar arquitetura Linux/amd64, ambientes/segredos, orçamento,
backups, rede/aliases do proxy, DNS/TLS e o include manual seguindo o
[guia do Mac Mini](../deployment/README.md). O Nginx compartilhado não foi alterado.

Antes de recriar uma API com provedor real, definir `LLM_GLOBAL_MAX_CALLS`. O contador não consulta
saldo OpenRouter nem mede tokens/custo. A v3 exige 22 mensagens HTTP, com até 57 invocações na
matriz atual e teto conservador de 66. Não houve aprovação integral real da v3. Somente após
conferir o orçamento e obter autorização separada, o comando proposto é:

```bash
npm run eval:orbe -- --live --max-calls=22
```

A integração local do frontend com o chat já pode continuar. Google OIDC/JWT é a primeira tarefa
da Fase 3; Calendar, BullMQ, Java e adaptadores RabbitMQ/Kafka continuam planejados.

Melhorias condicionadas à necessidade: medir carga/latência para decidir por leases e transações
curtas, acrescentar métricas de uso sem conteúdo pessoal e fixar revisões de actions/imagens após
o primeiro fluxo validado. Exposição pública ainda exige aviso de privacidade, tratamento de
solicitações de exclusão e proteção operacional contra abuso no proxy.

## Commits propostos, sem execução

```text
fix(infra): isolate environments and prepare manual releases
fix(orbe): enforce global LLM budget and bound chat concurrency
docs: record post-phase-2 review and deployment guide
```

Separar os trechos de `.env.example` entre infraestrutura e orçamento ao preparar esses commits.
Conferir a nova CI depois da publicação autorizada; os checks já aprovados de `main`/`dev`
correspondem à PR #2, não a este diff.
