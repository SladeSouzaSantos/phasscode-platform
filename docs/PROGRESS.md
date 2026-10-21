# Progresso e continuidade

Atualizado em 21/10/2026, America/Sao_Paulo.

## Incremento entregue

Fase 1 implementada e validada: npm workspaces, Node.js 24, TypeScript strict, Fastify, configuração
validada, contratos Zod/OpenAPI, Swagger, PostgreSQL/Redis, migrations controladas, Dockerfile
multi-stage, Compose, healthchecks, testes, lint/formatação e workflows independentes do frontend.

Fase 2 iniciada com endpoint funcional: `POST /api/v1/chat`, recuperação lexical, fontes públicas,
prompt versionado, histórico limitado, tokens de conversa, modos mock e real separados, LangChain,
tool calling somente de leitura, orçamento compartilhado entre rodadas, timeout/cancelamento,
erros seguros, rate limiting, CORS e retenção. Não há fallback silencioso para respostas simuladas.

Somente fatos fornecidos no briefing e o stack do frontend público foram usados. Formação,
biografia, certificados, clientes e experiência não foram inventados. O frontend não foi alterado.

## Verificações efetivamente executadas

| Verificação                                        | Resultado                                                              |
| -------------------------------------------------- | ---------------------------------------------------------------------- |
| Instalação npm e lockfile                          | Concluída                                                              |
| ESLint                                             | Aprovado; atualizado para ESLint 10 suportado                          |
| Prettier                                           | Aprovado                                                               |
| TypeScript strict                                  | Aprovado                                                               |
| Conformidade do OpenAPI gerado                     | Aprovada                                                               |
| Unitários, HTTP, contrato e SDK simulado           | 32 testes aprovados                                                    |
| Build Node.js                                      | Aprovado                                                               |
| Smoke do build em processo e socket HTTP reais     | Aprovado: health, ready e dois turnos                                  |
| Integração PostgreSQL 17 + Redis 7 reais em Docker | 4 testes aprovados                                                     |
| Auditoria npm                                      | Nenhuma vulnerabilidade reportada na instalação/auditoria desta sessão |
| YAML de Compose e workflows                        | Parse aprovado; Compose validado pelo CLI                              |
| Dockerfile multi-stage de runtime                  | Build aprovado                                                         |
| Compose completo                                   | Migrations concluídas; API, PostgreSQL e Redis saudáveis               |
| Reinício da API                                    | Conversa retomada com o mesmo ID/token após reiniciar                  |
| Usuário do container API                           | UID 1000, sem root                                                     |
| Smoke real OpenRouter — HTTP                       | Dois turnos aprovados, mesma conversa e `simulated=false`              |
| Smoke real OpenRouter — ferramenta                 | Uma execução de `search_portfolio`, fontes e resposta final aprovadas  |

Total: 36 testes automatizados, além dos smokes de processo e Compose. O adaptador real LangChain
foi testado contra HTTP simulado para Responses/Chat Completions, incluindo respostas de
ferramentas. Posteriormente, três chamadas funcionais foram validadas com o modelo OpenRouter
gratuito configurado (dois turnos HTTP e um smoke do ciclo de ferramenta); elas não alteram a
contagem de testes automatizados. A CI e o CodeQL estão configurados, mas o
workflow remoto ainda não foi executado; a publicação no GitHub permanece pendente.

O Docker inicialmente estava inacessível no sandbox e houve falha de rede no pull e erro 500
durante atualização do Desktop. Após acesso autorizado ao contexto desktop-linux e recuperação
do daemon, as imagens e integrações foram validadas. O primeiro teste Redis expôs um problema de
inicialização do cliente de teste; foi corrigido para aguardar conexão antes de enviar comandos,
e os quatro testes passaram na reexecução. Não há bloqueio Docker restante desta sessão.

Ferramentas locais: Node 24.11.1, npm 11.6.2 e Docker Desktop/Engine funcionais. O Java local é 8 e
Maven não está disponível; isso não bloqueia este incremento. A Fase 4 deverá usar Java LTS
compatível com a versão de Spring Boot/LangChain4j selecionada e fazer validação própria.

## Estado operacional

O ambiente foi validado inicialmente em mock usando `.env.example`. Atualmente o Compose usa `.env`
com OpenRouter, `LLM_PROVIDER=openai-compatible` e `LLM_API_MODE=chat-completions`, publicado apenas
em `127.0.0.1:3000`. Swagger: `http://localhost:3000/docs/`. Bancos não publicam portas. Os volumes
locais de desenvolvimento foram preservados. Para parar: `docker compose down`.
Os containers exclusivos da suíte de testes foram removidos com
`docker compose -f compose.test.yaml down --volumes`. O comando de retenção também foi executado
com sucesso no banco local e não removeu conversas recentes.

### Validação posterior com OpenRouter — 21/10/2026

O proprietário criou `.env` com chave e modelo OpenRouter. Foram corrigidas somente as opções
`LLM_PROVIDER=openai-compatible` e `LLM_API_MODE=chat-completions`, preservando sua chave e o modelo
`nvidia/nemotron-3.5-super-vl:free`. A API foi recriada com `docker compose` usando esse `.env`.
PostgreSQL, Redis e readiness permanecem saudáveis. O arquivo `.env` está ignorado pelo Git.

A chamada real ao chat retornou `502 LLM_UNAVAILABLE`; o diagnóstico direto ao provedor retornou
`401 User not found.`. A consulta autenticada `GET /api/v1/key` retornou 200 e confirmou as flags
`is_management_key=true` e `is_provisioning_key=true`. O container carrega a mesma chave do arquivo
local; a comparação foi feita por hash somente em memória, sem exibir chave nem hash.

A primeira chave era gerencial e não permitia inferência, conforme a documentação oficial:
<https://openrouter.ai/docs/guides/overview/auth/management-api-keys>. O proprietário substituiu a
credencial por uma chave comum. A consulta autenticada passou a informar `is_management_key=false`
e `is_provisioning_key=false`; foi confirmado que o container usa a nova chave do arquivo local.
Nenhuma chave, hash ou token de conversa foi exibido no diagnóstico.

Após a troca, `POST /api/v1/chat` retornou HTTP 200 com `meta.simulated=false` e respondeu que o
frontend usa React, TypeScript e Vite. A primeira resposta levou aproximadamente 3,1 segundos.
Uma segunda mensagem, com o mesmo ID e token, respondeu `Vite` à pergunta sobre a ferramenta de
build e não reemitiu token. A medida é pontual, sem caracterizar desempenho sob carga.

Também foi exercitado o adaptador real com contexto inicial vazio e repositório público
instrumentado apenas para contar buscas: o modelo solicitou `search_portfolio`, a ferramenta foi
executada uma vez e o modelo produziu resposta final com fontes em aproximadamente 5,6 segundos.
O teste usou a configuração atual, incluindo `strict: true`, sem alterar o código da aplicação.
Esse sucesso não estabelece garantia universal de conformidade estrita do provedor.

A integração real, continuidade de conversa e ciclo de ferramenta estão validados. A Fase 2
permanece em andamento para complementação dos dados públicos e avaliação sistemática de
qualidade, comportamento adversarial e latência. Nenhuma credencial foi criada nem revogada pelo
agente; a troca foi feita pelo proprietário no `.env`, que permanece ignorado pelo Git.

Nenhum servidor remoto, DNS, domínio, certificado, credencial ou Nginx compartilhado foi alterado.
Primeiro commit de implementação preparado com Conventional Commits. A publicação remota
permanece pendente. Mensagem do incremento:

```text
feat: bootstrap backend platform and implement Orbe chat
```

## Credenciais e configuração externa

IA real está configurada localmente com OpenRouter. Em uma instalação nova: `LLM_API_KEY` e
`LLM_MODEL`; `LLM_BASE_URL` e modo de API para outro provedor compatível. A chave precisa permitir
inferência e o modelo precisa de capacidade de tool calling. O operador
deve validar qualidade, custos e política de dados antes de exposição pública.

Fase 3: OAuth client ID/secret e refresh token Google com escopos mínimos, IDs dos calendários
autorizados, credenciais SMTP, Telegram bot token/chat ID e autenticação administrativa por provedor
de identidade. Variáveis futuras não são fingidas como já suportadas pela aplicação.

## Continuar exatamente daqui

1. Confirmar `npm run check`, `npm run smoke` e a suíte em `compose.test.yaml` após qualquer mudança.
2. Complementar `knowledge/portfolio.json` com dados públicos verificados e avaliar respostas com
   LLM real configurado. Testar consultas adversariais; heurísticas não garantem ausência de injection.
3. Iniciar Fase 3 pelo domínio de reuniões e contratos: expediente, fuso America/Sao_Paulo, duração,
   antecedência, intervalos e máquina de estados. Não distribuir regras entre Node e Java.
4. Adicionar migration de solicitações/reuniões com exclusão de intervalos, chave de idempotência,
   auditoria, outbox e acesso ao status por token. Testar concorrência real antes de criar eventos.
5. Implementar portas de calendário e adaptadores fake explícito/Google FreeBusy + events. Revalidar
   conflitos e só marcar CONFIRMED após criação verificável; usar identificador externo estável e
   reconciliação para falhas intermediárias.
6. Proteger os endpoints administrativos com autenticação e papéis verificáveis antes de expô-los.
7. Implementar outbox dispatcher e notification-worker BullMQ com retries, backoff, deduplicação,
   entregas auditáveis e adaptadores SMTP/Telegram separados. Telegram/e-mail não alteram o estado
   transacional da reunião. Considerar impossibilidade de exactly-once em envio externo genérico.
8. Só depois: Java com conformidade do contrato, gateway com seleção interna, RabbitMQ, Kafka e
   observabilidade/homologação. Perfis dos brokers existem, mas seus adaptadores não foram
   implementados nem esses brokers executados nesta sessão.

Antes de publicação, definir cotas globais de custo, proteção contra abuso distribuído, aviso de
privacidade, rotina diária de retenção e backups. A fundação não é uma declaração de prontidão
para produção de todas as fases planejadas.
