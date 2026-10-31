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

## Relatórios opcionais do Orbe (opt-in)

O Orbe pode registrar **somente métricas agregadas e etiquetas controladas**, sem
armazenar transcrições no sistema de relatórios. O visitante precisa marcar
explicitamente a autorização antes de iniciar a conversa; a autorização pode
ser revogada durante a sessão pelo chat. O histórico normal do Orbe continua
sujeito a `CHAT_RETENTION_DAYS=7` e ao máximo de 12 mensagens.

Com autorização, cada conversa produz um relatório após 24h da primeira pergunta
e outro para cada janela subsequente de 24h em que haja novas perguntas. Um
consolidado diário do dia anterior é disparado a partir das **09h no fuso
America/Fortaleza**, usando apenas conversas autorizadas. São registrados
somente contadores, intenções prováveis, categorias de assunto e IDs de projetos
públicos, sem texto livre, nome, e-mail, IP ou histórico da conversa. Os relatórios
não fazem chamadas de LLM.

O envio utiliza um processo **separado do worker legado de reuniões**, com
consulta periódica ao PostgreSQL, tentativas limitadas, leases para concorrência
e mensagens privadas no Telegram. Não há garantia de exatamente uma entrega:
uma interrupção entre o Telegram aceitar a mensagem e a confirmação no banco
pode causar uma duplicação rara. A revogação impede novos envios sempre que
ainda não tenham sido transmitidos; não pode apagar mensagens já recebidas
no Telegram.

No backend (nunca no frontend), configure `ORBE_REPORTS_ENABLED=true`,
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` e, opcionalmente,
`ORBE_REPORTS_POLL_MS=60000`. O Compose executa apenas a API por padrão.
Após as migrations, habilite explicitamente o serviço `reports` com o
perfil `reports` no mesmo projeto. O arquivo `.env` do Mac Mini deve ter
suas credenciais protegidas e jamais deve ser versionado. Não reative
`WORKER_ENABLED` para utilizar esta funcionalidade.

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

O GitHub Actions utiliza três workflows essenciais: `Backend CI` (PR e gate interno),
`Static security analysis` (PR e verificação semanal) e `Backend release`
(push para qualificar/publicar imagem, dispatch manual para aplicar no Mac Mini).
O Release valida testes, SAST, imagem GHCR e DAST descartável; somente o
`workflow_dispatch` com `apply_remote=true` pode iniciar o deploy remoto.
A publicação remota é manual: selecione a branch no workflow
`.github/workflows/deploy.yml`, informe `development` para `dev` ou
`production` para `main` e escolha `apply_remote=true`.
O environment correspondente exige `ENABLE_REMOTE_DEPLOY=true`.

**O bloqueio R3/R4 agora é condicional e fail-closed.**
Se houver worker legado ou estado operacional não reconciliado, o deploy é recusado.
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
