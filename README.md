# PHASSCODE Platform — Orbe profissional

Backend público do **Orbe Mágico**, assistente do portfólio profissional de Pedro
Santos. Seu objetivo é **ajudar recrutadores** a entender experiência, projetos,
formação, competências técnicas e aderência a vagas, usando evidências públicas
rastreáveis. Não substitui entrevistas, avaliação humana nem decisões de contratação.

## Escopo atual

- `POST /api/v1/chat` — conversas com token efêmero e fontes.
- `GET /health` e `GET /ready` — saúde e dependências.
- Fastify, TypeScript, LangChain e base de conhecimento profissional versionada (PPKS).
- Busca lexical ponderada, grafo semântico curado e seleção de evidências por competência.
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

## Arquitetura da resposta ao recrutador

```text
Pergunta do recrutador / requisitos de uma vaga
  └─> proteção de entrada, intenção e continuidade da conversa
       └─> recuperação PPKS (lexical + conceitos e vínculos curados)
            ├─> experiência profissional documentada
            ├─> projetos pessoais e projetos de estudo
            └─> graduação, pós-graduação, cursos e competências declaradas
                 └─> seleção de fontes e limites de contexto
                      └─> respostas determinísticas quando cabíveis
                           ou LLM com orçamento e fallback
                            └─> auditoria de afirmações e referências públicas
                                 └─> resposta do Orbe
```

A base `knowledge/portfolio.json` é enriquecida pelas fichas do
[PPKS](knowledge/ppks/README.md), incluindo experiências, projetos e registros
acadêmicos. A recuperação combina termos explícitos com o
`SemanticKnowledgeGraph` versionado em
`knowledge/ppks/semantic-relations.json` para localizar evidências de conceitos
como orientação a objetos, SQL e arquitetura de componentes.

**Relação técnica não comprova experiência.** Saber Java não prova domínio de
React; experiência com SQL não equivale a experiência em SQL Server; e um curso
não equivale a vínculo profissional. O Orbe preserva essa distinção e não deve
inventar qualificação para preencher lacunas. Vagas com requisitos desconhecidos,
negações ou alternativas ambíguas exigem interpretação conservadora e podem
retornar ao fluxo canônico.

O GraphRAG (LangGraph, Neo4j e um Reader HTTP interno de leitura) é **opcional**:

- `off` (**padrão**): resposta canônica baseada no PPKS e LLM, sem Reader privado.
- `shadow` (**somente DEV, opt-in**): compara o caminho do grafo sem substituir
  a resposta entregue ao visitante.
- `active` (**somente DEV, opt-in**): permite respostas verificadas pelo grafo,
  com fontes públicas completas. Dúvidas e falhas retornam ao caminho canônico.

Os modos `shadow` e `active` exigem aprovação explícita e configuração
separada no ambiente **DEV**, incluindo token do Reader fornecido por secret
Docker. Os overlays
[`compose.graphrag.shadow.dev.yaml`](compose.graphrag.shadow.dev.yaml) e
[`compose.graphrag.active.dev.yaml`](compose.graphrag.active.dev.yaml)
não fazem parte do deploy padrão. Consulte
[GraphRAG Shadow DEV](docs/graph-rag-shadow-dev.md) e
[GraphRAG Active DEV](docs/graph-rag-active-dev.md).
Não exponha credenciais Neo4j/Bolt à API pública.

### Recuperação semântica — F3.7

A pesquisa de embeddings ONNX foi **qualificada apenas em laboratório**.
Na coorte sintética v2, com 28 competências esperadas dentro do catálogo,
a recuperação Top-1 foi de 14/28 (lexical-first ingênuo), 17/28 (ONNX) e
22/28 (regra lexical estrita + ONNX). Os oito exemplos fora do catálogo
continuaram recebendo sugestões vetoriais não confiáveis, e a classificação
de contexto/negação foi fornecida pelo próprio conjunto de teste.

No benchmark isolado do MiniMac (05/11/2026), o processo ONNX teve pico de
**882,58 MiB de RSS**, carga fria de **3,36 s** e p95 de **319 ms por lote**
de consultas. Esses números **não são latência HTTP nem prova de melhoria
das respostas reais do Orbe**.

**Decisão deste ciclo:** manter a recuperação PPKS + grafo curado existente;
**não** instalar um serviço ONNX, não ativar uma integração ONNX em Shadow e
não acrescentar inferência ao caminho público. O benchmark e as propostas
continuam documentados como experimentos, sujeitos a avaliação independente:

- [Comparação lexical estrita + ONNX v2](docs/architecture/semantic-strict-fusion-v2.md)
- [Benchmark reproduzível no MiniMac via Docker](docs/architecture/minimac-f37-benchmark.md)
- [Contrato diagnóstico do planejador semântico](docs/architecture/semantic-planner-no-laya-f37.md)

A revisão de código e os testes automatizados não substituem a **homologação
manual das respostas com recrutadores** no ambiente DEV. Não declarar essa
homologação concluída antes de verificar respostas e fontes reais.

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

O desenvolvimento **local fora do Docker** requer Node.js 24 e npm 11+.
PostgreSQL e Redis são necessários quando configurados; o MiniMac utiliza
contêineres e não precisa ter Node.js instalado no host.

```bash
npm ci --ignore-scripts
npm run check              # lint, formato, tipos, contratos, PPKS, testes e build
npm run test:integration
npm run test:browser
npm run test:neo4j         # requer ambiente de integração apropriado
npm run migrate
npm run dev
```

Os testes de recuperação e de respostas para recrutadores incluem
`tests/knowledge-relevance.test.ts`, `tests/semantic-graph.test.ts`,
`tests/graph-vacancy-coverage.test.ts` e
`tests/orbe-recruiter-scenarios.test.ts`. Também existem avaliadores
offline executáveis com `npm run eval:orbe:graphrag:offline` e
`npm run eval:orbe:semantic:lexical`. Um teste com provedor `mock` não
comprova o comportamento de uma LLM real.

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
O merge `dev` → `main` **não publica automaticamente** a versão nova no
Mac Mini: é necessário um deploy manual específico do ambiente, seguido
de verificação de saúde e testes das respostas e fontes. O GraphRAG
experimental e os benchmarks ONNX não devem ser tratados como recursos
ativos de produção pelo simples fato de o código estar na `main`.

## Curadoria e manutenção

A base profissional foi ampliada em 31/10/2026 para 48 registros,
incluindo projetos, formações e 42 cursos livres declarados como concluídos.
A situação de cada formação deve ser interpretada individualmente; um curso
em andamento ou uma graduação pendente não é titulação concluída.

Para atualizar conteúdo, revise
[knowledge/README.md](knowledge/README.md),
[knowledge/SOURCES.md](knowledge/SOURCES.md) e
[knowledge/ppks/README.md](knowledge/ppks/README.md). Depois valide com
`npm run ppks:check`, rode a suíte e publique o backend do ambiente desejado.
O catálogo **não** é atualizado automaticamente a partir de GitHub, LinkedIn
ou alterações do frontend. Não comite currículos privados, credenciais,
transcrições de visitantes, documentos acadêmicos pessoais nem `.env`.

O objetivo de manutenção é corrigir fatos, fontes e regressões observáveis,
sem ampliar a arquitetura por experimentação sem benefício comprovado para
recrutadores.
