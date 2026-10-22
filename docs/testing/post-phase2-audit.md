# Conferência final antes da Fase 3

Auditoria em 22/10/2026, pelo Codex, sobre o diff local da branch `dev` (`85ebca3`). Foram
reconferidos os dez itens do anexo “Revisão pós-Fase 2 e correções antes da Fase 3” e os arquivos
de referência do deploy do portfólio. A primeira revisão tinha lacunas; esta passagem encontrou,
corrigiu e testou os pontos descritos abaixo. Não é uma revisão humana ou uma garantia exaustiva
de segurança.

## Requisitos e evidências

| Item solicitado              | Estado da entrega local        | Evidência e limite                                                                                                                                                                                                                   |
| ---------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Preservar funcionalidades | Atendido                       | Diff contra a base confirma contratos, catálogo de 31 documentos, prompt `orbe-v3`, lockfile e relatórios anteriores preservados; testes existentes mantidos.                                                                        |
| 2. Isolar Docker e operações | Atendido                       | Compose parametrizado; testes com dois projetos; volumes/redes privados; API/migrations/retenção usam ambiente, digest, porta e modo de proxy selecionados.                                                                          |
| 3. Preservar Nginx           | Atendido no modelo             | Include compartilhado preservado e `/nginx.conf` ignorado; nenhuma instalação automática; rede/alias/TLS exigem confirmação no servidor. Modelo testado em Nginx descartável.                                                        |
| 4. Orçamento global real     | Atendido                       | Reserva atômica Redis antes de cada invocação, inclusive tool calling; mock/políticas não contam; 429/503; concorrência e corrupção do contador testadas com Redis real. Cota da conta não foi consultada.                           |
| 5. Revisar chat e PostgreSQL | Atendido                       | Continuidade, pares de histórico, argumentos, fontes, cancelamento, indisponibilidade, lock/rollback e admissão revisados; recorte final mede prompt e JSON; testes de três turnos e oito gerações concorrentes.                     |
| 6. Matriz v3                 | Atendido offline               | 20 cenários/22 turnos, fontes compatíveis, políticas e continuidade verificadas sem LLM. Execução real integral e revisão humana permanecem pendentes, conforme a restrição do anexo.                                                |
| 7. Privacidade e segurança   | Atendido no código e guia      | Rate limit por IP + orçamento global, CORS/TRUST_PROXY, erros e logs revisados; flags do SDK que expõem conteúdo rejeitadas; readiness interna no modelo Nginx. Aviso no frontend, retenção agendada e backups dependem de operação. |
| 8. Documentação atualizada   | Atendido                       | README, PROGRESS, TASKS, deployment, security, frontend e testes atualizados; PR #2 e CI histórica distinguem-se deste diff ainda local.                                                                                             |
| 9. Validações                | Atendido localmente            | 195 testes aprovados, build, smoke, auditoria, plano offline e imagem runtime com PostgreSQL/Redis. Workflows/serviços remotos não foram executados.                                                                                 |
| 10. Git e entrega            | Atendido dentro da autorização | Trabalho em `dev`, alterações preservadas, sem commit/push/merge ou configuração remota; inventário e commits propostos na entrega.                                                                                                  |

O fluxo preparado acompanha as etapas do portfólio, com implementação própria para backend:
CI → SAST → GHCR por digest → DAST descartável → Tailscale/SSH → verificação. Não usa o Nginx
de arquivos estáticos como imagem da API. SAST usa auditoria/CodeQL; o Semgrep bloqueante do
frontend não foi copiado. CodeQL publica resultados e requer regra remota de code scanning para
bloquear automaticamente por achados. Não houve alteração dessa configuração no GitHub.

## Lacunas encontradas e corrigidas nesta passagem

- **Deploy:** SHA OCI era conferido depois de migrations. Agora a imagem puxada é validada antes
  de iniciar dependências, migrar ou ativar a API; a revisão em execução também é conferida.
- **Proxy:** ausência de opção em redeploy podia remover a rede do proxy. O modo aplicado agora
  é persistido em `.deployment/use-proxy` e recuperado; sua alteração precisa ser explícita.
- **Contexto:** três turnos legítimos podiam gerar 12.469 caracteres para limite de 12.000. O
  adaptador recorta pares antigos e documentos antes de reservar/invocar; fontes descartadas não
  aparecem na resposta. Escapes JSON e identificadores de ferramentas entram na medição.
- **Redis:** metadados corrompidos podiam reabrir janela e liberar crédito. Hash existente exige
  contador/prazo válidos e expiração coerente; inconsistências retornam 503 sem reparar o contador.
- **Indisponibilidade:** Redis falhando no hook de rate limit retornava 500. Agora retorna
  `RATE_LIMIT_UNAVAILABLE`/503 com `Retry-After: 1`, sem geração e sem dados do driver.
- **Privacidade:** `LANGCHAIN_VERBOSE=true` podia imprimir mensagens completas pelo SDK. Bootstrap
  e construtor rejeitam as cinco flags de verbose/tracing documentadas; regressões verificam a recusa.
- **Nginx:** upstream fixo podia manter IP antigo após recriação. O modelo usa resolução dinâmica
  na topologia Docker confirmada. Também bloqueia `/ready` externamente; verificação pública usa
  `/health`, sem consultas ao banco. Nenhuma dessas mudanças foi instalada no proxy compartilhado.

## Validação final executada

- `npm run check`: lint, formatação, tipos, contrato, **153 testes locais** e build aprovados.
- `npm run test:infrastructure`: **25 testes aprovados**, sem skips.
- Integração descartável: **17 testes aprovados**, cinco PostgreSQL/HTTP e doze orçamento Redis.
- `npm run smoke`, `npm run eval:orbe` sem `--live` e `npm audit --audit-level=high` aprovados;
  auditoria sem vulnerabilidades reportadas. Instalação pelo lockfile já havia concluído nesta revisão.
- Imagem runtime reconstruída e executada com `NODE_ENV=production`, PostgreSQL/Redis exclusivos,
  migrations e provedor mock. Testados contrato/fontes/CORS, continuação após restart e retenção.
- Modelo em Nginx privado descartável: configuração válida, proxy de chat/health, `/ready` externo
  404 e interno 200, e troca do IP da API sem reload do proxy.

O primeiro rerun de infraestrutura durante o build runtime teve um timeout de teste: a orquestração
de dois deploys simulados e retenção levou 16,2 segundos para um limite de dez. O cenário recebeu
limite de 30 segundos, com subprocessos também limitados; a suíte isolada passou 25/25 em 34 segundos.
Nenhuma asserção funcional foi removida. Os projetos `phasscode-audit-tests-20261022-r2` e
`phasscode-audit-runtime-20261022` foram criados exclusivamente para a auditoria e removidos com
seus dados descartáveis. Nenhum volume existente de desenvolvimento/produção foi removido.

## Pendências reais e próximo passo

1. **Configuração local:** conferido apenas por presença/validade, sem imprimir segredos: o `.env`
   usa provedor real e ainda não define `LLM_GLOBAL_MAX_CALLS`. Escolher limite/janela conforme a
   conta antes de recriar a API. Não foi definido um valor por suposição nem alterada a credencial.
2. **Checkpoint Git:** revisar/autorizar os commits e publicar para executar CI/CodeQL deste
   incremento. Os checks já aprovados de `main`/`dev` pertencem à PR #2.
3. **Homologação:** confirmar arquitetura, rede/aliases, TLS/DNS, environments/segredos, retenção
   e backups e executar o fluxo no Mac Mini quando autorizado. GHCR, ZAP, Tailscale e SSH preparados
   não equivalem a serviços validados externamente.
4. **LLM real:** v3 integral/revisão humana ainda pendentes. São 22 mensagens HTTP, até 57 chamadas
   na matriz atual ou teto conservador de 66; executar somente com orçamento conferido e autorização
   separada. Não houve consumo de LLM nesta auditoria.

A implementação e a revisão local pedidas estão cobertas após essas correções. Recomenda-se
fechar o checkpoint de configuração e commit/CI antes de iniciar P3-00. Homologação e avaliação
real são marcos externos separados; não se declara a plataforma pronta para produção. A Fase 3
continua começando por Google OIDC/JWT, sem antecipação de login, Calendar ou ferramentas de agenda.
