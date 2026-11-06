# Testes, qualidade, segurança e privacidade

[← Wiki](README.md) · [Ambientes](ambientes-deploy.md) · [Orbe](orbe-fluxo-de-resposta.md)

## 1. Pirâmide de validação

| Camada | O que prova | O que **não** prova |
| --- | --- | --- |
| Typecheck/lint/format | Consistência estrutural do código | Qualidade semântica das respostas |
| Unitários | Regras/políticas em cenários delimitados | Integração real com todos os provedores |
| Integração | PostgreSQL/Redis/API/Neo4j em ambientes de teste | Estado da release implantada |
| E2E browser mock | UI, navegação, fontes, contrato e erros simulados | Comportamento de LLM real |
| E2E live DEV autorizado | Contrato/respostas observadas no DEV atual | Ausência de alucinação em todas as vagas |
| Revisão humana | Plausibilidade factual, tom e cobertura de fontes | Garantia matemática universal |

Backend: [`package.json`](../../package.json), [`tests/`](../../tests/), [`evaluation/`](../../evaluation/), [`docs/testing/`](../testing/). Frontend: [`package.json`](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/package.json), [`tests/`](https://github.com/SladeSouzaSantos/web-portfolio-v2/tree/main/tests).

## 2. Comandos de validação (backend)

Ambiente de desenvolvimento com Node 24 e dependências de teste isoladas:

```bash
npm ci --ignore-scripts
npm run check
npm run test:integration
npm run test:browser
npm run test:neo4j
```

**Atenção:** os últimos comandos podem exigir bancos/contêineres apropriados; consultar scripts e README antes da execução. O [`package.json`](../../package.json) governa a disponibilidade exata e a semântica dos comandos. Avaliadores adicionais de relevância e GraphRAG estão em [`evaluation/`](../../evaluation/). Testar com `LLM_PROVIDER=mock` valida lógica, não capacidade do modelo real.

## 3. Comandos e critérios (frontend)

```bash
npm ci
npm run build
npx playwright install chromium
npx playwright test tests/portfolio.spec.ts tests/routing.spec.ts tests/orbe-public.spec.ts tests/orbe-client.spec.ts
npm run test:orbe
```

Para `dev` live, seguir [guia controlado](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/dev/docs/ORBE-LIVE-PLAYWRIGHT-DEV.md), nunca disparar a suíte live acidentalmente. O Playwright deve cobrir acessibilidade, dispositivos estreitos, interação por teclado, transições, loaders e erros de rede.

## 4. Segurança por fronteira

### HTTP

- Entradas tipadas/validadas e body limit; CORS explícito e Helmet.
- Rate limit global para chat no Fastify e Redis quando configurado, sem falha aberta.
- Correlação por `X-Correlation-Id` e logs com headers sensíveis e body censurados.
- `X-Forwarded-For` somente sob proxies explicitamente confiáveis.

Fonte: [`http/app.ts`](../../apps/orbe-node/src/http/app.ts), [política de segurança](../security.md).

### Conversas e IA

- Token de conversa aleatório e hash SHA-256 no armazenamento; `conversationId` não é senha.
- Limites de histórico, tamanho, duração e orçamento global de chamadas no Redis.
- Escopo profissional restrito; perguntas pessoais/injeção recebem políticas próprias.
- Páginas externas são **conteúdo não confiável**; não obedecer instruções encontradas em descrições de vagas.
- Provedor/modelo/chave **não são campos aceitos do visitante**.
- Não registrar texto livre, tokens ou cookies nos relatórios de diagnóstico do GraphRAG.

Fontes: [`domain/security.ts`](../../apps/orbe-node/src/domain/security.ts), [`redis-llm-budget.ts`](../../apps/orbe-node/src/adapters/redis-llm-budget.ts), [`public-evidence.ts`](../../apps/orbe-node/src/application/public-evidence.ts), [`graph-public-policy.ts`](../../apps/orbe-node/src/application/graph-public-policy.ts).

### Relatórios

Relatórios são opt-in e agregados, sem transcrição. Revogação impede novos envios ainda não efetuados; não apaga comunicação já entregue ao Telegram. A execução e o armazenamento são distintos do worker histórico. Fontes: [README](../../README.md) e [`apps/report-node/`](../../apps/report-node/).

## 5. Critérios de qualidade do Orbe (negócio)

Ao homologar uma resposta, verificar:

1. **Afirmação factual** correta para experiência, projeto, formação e situação atual.
2. **Categoria de atuação** preservada: profissional, mista, pessoal, estudo e desconhecida.
3. **Ausências** reconhecidas; não inventar experiência em tecnologias de vaga.
4. **Fontes individualizadas**, públicas e sem links internos/segredos.
5. **Continuidade** adequada (“E com Go?” altera o requisito, não cria vaga Java+Go).
6. **Limites** de contexto, LLM, fonte e histórico respeitados.
7. **Fallback** funcional diante de falha opcional de grafo ou indisponibilidade controlada.
8. **Privacidade** no comportamento e nos dados de observabilidade.

A [rubrica de avaliação](../../evaluation/RUBRIC.md) e os [testes do recrutador](../../tests/) devem servir de base, mas exigem revisão humana para conclusões sobre relevância e persuasão.

## 6. Revisão de documentação faz parte da qualidade

Toda mudança em componentes críticos deve trazer atualização correspondente da wiki: contrato, portas, política, teste e decisão de arquitetura. Evitar manuais que descrevem recursos históricos como disponíveis ou que divulgam topologia privada/credenciais. Consulte [guia do desenvolvedor](guia-do-desenvolvedor.md).
