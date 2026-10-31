# PHASSCODE Platform — Orbe profissional

Backend público do **Orbe Mágico**, representante virtual de Pedro Santos.
Responde perguntas sobre experiência, projetos, formação, tecnologias e
contato profissional com base em fontes públicas verificáveis.

## Escopo atual

- `POST /api/v1/chat` — conversas com token efêmero e fontes.
- `GET /health` e `GET /ready` — saúde e dependências.
- Fastify, TypeScript, LangChain e base JSON de conhecimento.
- PostgreSQL para histórico com retenção e Redis para limites de uso.
- Provedores LLM configuráveis, fallback e orçamento global.

**Não oferece login, contas, agenda, reservas, notificações ou painel.**
O runtime público força `AUTH_ENABLED=false`, `MEETINGS_ENABLED=false` e
`WORKER_ENABLED=false`, mesmo que um `.env` legado ainda os habilite.
O worker antigo deve permanecer desligado. Código e migrations históricos
não são apagados para evitar perda de dados ou quebra dos testes legados.

O Orbe não finge ser Pedro e não inventa disponibilidade profissional.
Caso o visitante queira conversar diretamente, aponta os canais
profissionais públicos que constam na base de conhecimento.

## Execução e validação

Requer Node.js 24, npm, PostgreSQL/Redis quando configurados:

```bash
npm ci --ignore-scripts
npm run check
npm run test:integration
npm run build
npm run migrate
npm run dev
```

O `LLM_PROVIDER=mock` só devolve respostas simuladas.
Para IA real, configure o provedor, modelo, chave, `REDIS_URL` e
`LLM_GLOBAL_MAX_CALLS` no backend. Não publique essas variáveis no frontend.
Configure `CORS_ORIGINS` apenas para os sites autorizados.

Atualize os fatos profissionais em `knowledge/portfolio.json` e mantenha
`apps/orbe-node/prompts/v4.md` com instruções de escopo profissional.
Perguntas pessoais, credenciais e tentativas de injeção não são atendidas.

## Deploy no Mac Mini

| Branch | Backend                | Checkout                               |
| ------ | ---------------------- | -------------------------------------- |
| `dev`  | `devapi.phasscode.com` | `/opt/projects/phasscode-platform-dev` |
| `main` | `api.phasscode.com`    | `/opt/projects/phasscode-platform`     |

O GitHub Actions valida testes, SAST, imagem GHCR e DAST descartável.
A publicação remota é manual: selecione a branch no workflow
`.github/workflows/deploy.yml`, informe `development` para `dev` ou
`production` para `main` e escolha `apply_remote=true`.
O environment correspondente exige `ENABLE_REMOTE_DEPLOY=true`.

**O bloqueio operacional R3/R4 do DEV não foi retirado.**
A primeira parada do worker legado precisa de um procedimento
supervisionado, com auditoria do estado de outbox e backups.
Não contorne o bloqueio apagando arquivos de estado ou volumes.
Não execute `docker compose down --volumes` em produção.
Os ambientes têm bancos, volumes e portas independentes.
A porta de produção deve ser verificada antes da primeira publicação
(3000 é do Grafana e 3001 é reservada ao DEV).

O frontend do mesmo ambiente deve ser publicado depois do backend.
A documentação anterior sobre a Fase 3 é **histórica**, não descreve
as funcionalidades atuais do produto.


A base Orbe DEV foi ampliada em 31/10/2026 para 48 registros, com 42 cursos livres concluídos e novos projetos. Ver [knowledge/README.md](knowledge/README.md) e [SOURCES.md](knowledge/SOURCES.md) para fontes, limites, status acadêmicos e testes de recrutamento. O conteúdo requer redeploy do backend; não é sincronizado automaticamente com o frontend.
