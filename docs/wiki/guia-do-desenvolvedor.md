# Guia de leitura, desenvolvimento e manutenção da wiki

[← Wiki](README.md) · [Backend](backend.md) · [Frontend](frontend.md)

## 1. Para compreender o PHASSCODE do zero

**Roteiro recomendado em cinco passagens:**

1. **Visão do produto:** leia os READMEs do [backend](../../README.md) e [frontend](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/README.md). Entenda o que o Orbe público **faz** e o que foi descontinuado.
2. **Caminho HTTP:** siga [`src/App.tsx`](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/App.tsx) → [`OrbAssistant.tsx`](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/components/OrbAssistant.tsx) → [`useOrbeChat.ts`](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/hooks/useOrbeChat.ts) → [`orbeClient.ts`](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/services/orbeClient.ts) → [`buildApp`](../../apps/orbe-node/src/http/app.ts).
3. **Decisão de negócio:** leia [`ChatService.execute`](../../apps/orbe-node/src/application/chat.ts) junto da página [Fluxo de resposta](orbe-fluxo-de-resposta.md); observe precedência de respostas estruturadas, políticas e fallback.
4. **Evidência:** siga [`knowledge/portfolio.json`](../../knowledge/portfolio.json) → [PPKS](../../knowledge/ppks/) → [`JsonKnowledgeRepository`](../../apps/orbe-node/src/adapters/knowledge.ts) → [`evidence-packet.ts`](../../apps/orbe-node/src/application/evidence-packet.ts).
5. **Operação e qualidade:** leia [ambientes](ambientes-deploy.md), [segurança](qualidade-e-seguranca.md), [deploy](../deployment/README.md), [testes](../testing/README.md) e [CI](../../.github/workflows/ci.yml).

## 2. Como estudar uma função de código

Para cada fluxo, preencha uma ficha técnica:

| Campo             | Pergunta                                                                |
| ----------------- | ----------------------------------------------------------------------- |
| Arquivo e símbolo | Qual função/classe implementa a regra?                                  |
| Entrada           | Quem chama, quais parâmetros e esquemas são aceitos?                    |
| Pré-condição      | Quais flags, serviços, permissões e dados são exigidos?                 |
| Algoritmo         | Qual sequência de decisões e transformações acontece?                   |
| Saída             | Qual DTO, efeito colateral ou alteração em banco é produzido?           |
| Erros             | Quais códigos, timeouts, limites e fallbacks são previstos?             |
| Testes            | Qual caso de teste cobre sucesso, falha, ausência de dados e regressão? |
| Decisão           | Por que foi construída assim e quais alternativas foram rejeitadas?     |
| Fronteira         | Existe em DEV, MAIN, laboratório ou apenas em código legado?            |

Uma wiki confiável descreve **contrato, execução, limites e motivação**, não apenas o nome das tecnologias.

### Exemplo: `ChatService.execute`

- **Entrada:** DTO de chat, token opcional, opções/consentimento.
- **Dependências:** `ConversationStore`, `KnowledgeRepository`, `ChatProvider` e portas opcionais.
- **Algoritmo:** valida continuidade, reescreve elipses, recupera evidências, dá precedência a respostas canônicas, tenta GraphRAG elegível, limita contexto e invoca IA quando necessário.
- **Saída:** resposta validada, fontes públicas, identificador e metadados do turno.
- **Falhas:** sem token válido, limite de contexto, provedor indisponível, quota, timeout e indisponibilidade opcional do Reader.
- **Testes:** procurar cenários relacionados em [`tests/`](../../tests/) e [`evaluation/`](../../evaluation/).
- **Risco de regressão:** uma nova política não pode transformar curso em emprego, nem retirar todas as fontes de um requisito de vaga.

## 3. Desenvolver em segurança

Antes de executar:

```bash
# Backend, no seu checkout local não operacional:
npm ci --ignore-scripts
npm run check

# Frontend, no seu checkout local:
npm ci
npm run build
npm run test:orbe
```

Os comandos acima são **referência de desenvolvimento**, não uma autorização para rodar testes live ou conectar no MiniMac. Testes de integração e GraphRAG exigem infraestrutura apropriada e limites próprios. Nunca publicar o `.env`, tokens de conversas ou dumps privados em issues/commits.

## 4. Alterações por tipo de módulo

| Se você alterar              | Atualize também                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| Contratos HTTP ou DTOs       | [Backend](backend.md), [Frontend](frontend.md), OpenAPI e testes de cliente                           |
| `ChatService` ou políticas   | [Fluxo Orbe](orbe-fluxo-de-resposta.md), rubrica e testes de recrutamento                             |
| PPKS / dados profissionais   | [Conhecimento](conhecimento-e-evidencias.md), índice PPKS, `src/data/` do frontend e testes de fontes |
| GraphRAG / Reader / Neo4j    | [Arquitetura](arquitetura.md), segurança, fluxos e documentação DEV específica                        |
| LLM / limites / Redis        | [Backend](backend.md), [Qualidade](qualidade-e-seguranca.md), erros de cliente e testes de falha      |
| Navegação, tema, animações   | [Frontend](frontend.md), Playwright e acessibilidade                                                  |
| CI, Compose, deploy          | [Ambientes](ambientes-deploy.md), versão do workflow e procedimentos de rollback                      |
| Nova estratégia arquitetural | [Decisões](decisoes-e-evolucao.md) e ADR versionado                                                   |

## 5. Como publicar esta wiki

A primeira versão foi construída em uma **branch documental isolada**, `docs/phasscode-wiki`, a partir do `main` do backend. Isso **não** altera o checkout PROD/DEV, não habilita o GitHub Wiki automaticamente e não publica um site de documentação.

Fluxo sugerido:

1. Revisar Markdown e links, confrontando cada fluxo com o commit usado como baseline.
2. Abrir PR **somente documental** para `dev` ou `main`, respeitando o plano de promoção adotado.
3. Evitar mudança de código de produção como requisito de documentação.
4. Depois da aprovação, adicionar um link no README principal para `docs/wiki/README.md`.
5. Para uma wiki visual pesquisável, avaliar GitHub Pages/MkDocs **em etapa separada**, com build estático, versionamento por branch e sem publicar segredos. O Markdown atual já pode ser lido no GitHub.

## 6. O que falta para ser uma wiki exaustiva

**Backlog documental verificável**, sem misturar com funcionalidades futuras:

- [ ] Gerar inventário completo de arquivos, símbolos exportados, funções principais e chamadas internas em backend e frontend.
- [ ] Criar páginas por subsistema (PostgreSQL/migrations, Reader interno, serviços LLM, analytics, componentes visuais, CSS/design tokens).
- [ ] Ligar cada endpoint de OpenAPI à implementação, testes e códigos de erro.
- [ ] Documentar cada fluxo alternativo e regras de segurança de chamadas externas.
- [ ] Conciliar documentação antiga com o produto público atual e registrar obsolescência.
- [ ] Conferir versões SHAs e estados efetivos das releases no MiniMac, **somente mediante auditoria autorizada**.
- [ ] Revisão humana de código e texto antes de chamar a wiki de documentação integral.
- [ ] Automatizar verificação de links internos, arquivos inexistentes e atualização de baseline no CI documental.

O critério para marcar uma área **completa** é possuir: fonte exata, contratos, fluxos, testes de sucesso/falha, restrições, ambiente e revisão de alguém que conheça o comportamento real. A documentação parcial atual já funciona como ponto de entrada para aprendizado e manutenção, mas não substitui essa etapa.
