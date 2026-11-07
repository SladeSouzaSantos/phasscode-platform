# PHASSCODE — Wiki técnica do projeto

> **Wiki inicial versionada em Markdown · 06/11/2026 · revisão 0.1 (estrutura inicial).**
>
> Esta documentação descreve a implementação **confirmada por leitura de código** em `phasscode-platform` e `web-portfolio-v2`; não substitui uma auditoria de cada função/linha, nem atesta o que está implantado no MiniMac. O código-fonte e a configuração real do ambiente prevalecem sobre textos históricos.

## O que estamos documentando

O **PHASSCODE** é um portfólio interativo em pixel art e um assistente profissional (**Orbe**) destinado a apresentar experiência, projetos, formação, competências e alinhamento a vagas **com evidências rastreáveis**. O projeto está dividido em dois repositórios principais:

| Camada            | Repositório                                                                  | Tecnologias-chave                                          | Entrada                                                                                     |
| ----------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Frontend          | [web-portfolio-v2](https://github.com/SladeSouzaSantos/web-portfolio-v2)     | React, TypeScript, Vite, React Router, Playwright          | [`src/App.tsx`](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/App.tsx) |
| Backend           | [phasscode-platform](https://github.com/SladeSouzaSantos/phasscode-platform) | Node 24, TypeScript, Fastify, LangChain, PostgreSQL, Redis | [`apps/orbe-node/src/main.ts`](../../apps/orbe-node/src/main.ts)                            |
| Conhecimento      | Backend / `knowledge/`                                                       | PPKS, índice de catálogo, relações semânticas curadas      | [`knowledge/ppks/README.md`](../../knowledge/ppks/README.md)                                |
| GraphRAG opcional | Backend / `apps/orbe-node/`                                                  | Neo4j, Reader HTTP privado, LangGraph                      | [Guia Active DEV](../graph-rag-active-dev.md)                                               |
| Operação e testes | Dois repositórios                                                            | GitHub Actions, Compose, CI, Playwright                    | [Deploy backend](../deployment/README.md)                                                   |

## Navegação

1. [**Arquitetura geral**](arquitetura.md) — diagramas, componentes, fronteiras, ambientes e responsabilidades.
2. [**Backend explicado pelo código**](backend.md) — inicialização, injeção de dependências, módulos, persistência, contratos e relatórios.
3. [**Lógica do Orbe, passo a passo**](orbe-fluxo-de-resposta.md) — entrada, intenção, PPKS, fontes, políticas, LLM e fluxo GraphRAG.
4. [**Frontend explicado pelo código**](frontend.md) — rotas, seções, UI, hooks, chat, transições, dados e testes.
5. [**PPKS, evidências e semântica**](conhecimento-e-evidencias.md) — modelo de fatos, proveniência, lexical, grafo curado e limites.
6. [**DEV, MAIN e deploy**](ambientes-deploy.md) — diferenças de branch, aprovação, GitHub Actions e fronteiras operacionais.
7. [**Testes, segurança e manutenção**](qualidade-e-seguranca.md) — suíte de verificações, privacidade, cotas e revisão de comportamento.
8. [**Decisões, histórico e status**](decisoes-e-evolucao.md) — módulos antigos, experimentos e ADRs sem confundir com funcionalidades atuais.
9. [**Como desenvolver e atualizar esta wiki**](guia-do-desenvolvedor.md) — fluxo de contribuição, leitura guiada e critérios para manter as páginas corretas.

## Aprofundamento do código — segunda camada

O [**Mapa do código e das funções**](mapa-do-codigo.md) é o ponto de entrada para seguir a lógica de cada módulo com **referências aos símbolos e às linhas de código**, em vez de apenas uma visão tecnológica.

| Página aprofundada                                              | Pergunta que responde                                                                             |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [\`ChatService.execute\` anotado](modulos/chatservice.md)       | Como a pergunta é interpretada, como o Orbe escolhe evidências, precedência, política e resposta? |
| [API, sessão e autorização](modulos/api-e-sessao.md)            | Como o browser, Fastify, ID/token e consentimento mantêm uma conversa?                            |
| [PPKS e recuperação](modulos/ppks-e-recuperacao.md)             | Como funcionam o ranking lexical, os anchors, os requisitos de vaga e o grafo curado?             |
| [GraphRAG/Reader/Neo4j](modulos/graphrag-e-reader.md)           | Como a API consulta grafo privado, valida fontes e abstém quando necessário?                      |
| [LLM, orçamento e fallback](modulos/llm-e-orcamento.md)         | Como são controlados modelos, contexto, quota Redis, tentativas e falhas?                         |
| [PostgreSQL e relatórios](modulos/persistencia-e-relatorios.md) | Como \`runTurn\` usa lock/transação e como funciona o opt-in de métricas?                         |
| [Frontend: fluxos e algoritmos](modulos/frontend-fluxos.md)     | Como hooks, UI, sessão e navegação animada operam?                                                |
| [Matriz de testes por módulo](modulos/matriz-testes.md)         | Quais testes existem para cada classe/função e o que ainda não foi validado?                      |

**Situação desta camada:** leitura estática de arquivos centrais do backend e frontend, diagramas e rastreabilidade de caminhos de teste. **Não** foi realizado um levantamento AST completo de todas as funções, execução de testes, validação live ou auditoria dos binários implantados. Os módulos históricos são identificados como tais; a branch \`docs/phasscode-wiki\` permanece separada de \`dev\` e \`main\`.

## Referência completa de código — terceira camada

A [**Referência técnica do código**](referencia/README.md) reúne o inventário de símbolos TypeScript/TSX em **backend e frontend, DEV e MAIN**, referências por arquivo/linha, imports diretos de testes, contratos HTTP e tabelas PostgreSQL.

| Referência                                                           | Conteúdo                                                    |
| -------------------------------------------------------------------- | ----------------------------------------------------------- |
| [Catálogo AST + métodos de geração](referencia/README.md)            | Símbolos e dependências por módulo, rastreáveis a SHAs Git  |
| [Diferenças de código DEV × MAIN](referencia/diferencas-dev-main.md) | Arquivos alterados e funções nomeadas adicionadas/removidas |
| [Contrato de API pública e histórica](referencia/contratos-api.md)   | Rotas realmente disponíveis, headers e modelos Zod          |
| [Migrations PostgreSQL 001–006](referencia/migrations-postgresql.md) | Estrutura persistida, constraints e compatibilidade         |
| [Componentes React e CSS](referencia/componentes-e-css.md)           | Design tokens, seções, estilos legados e acessibilidade     |

**Nota de versão:** os inventários AST e o comparador são gerados por um workflow da **branch documental** a partir de snapshots Git fixados. Esta camada documenta o código; não substitui validação de runtime implantado, execução integral dos testes, revisão da cobertura e auditoria de segurança.

## Como ler a documentação

- **Código atual**: afirmações verificadas na árvore das branches examinadas; links apontam para o caminho correspondente.
- **Disponível atrás de flag**: código presente, mas ativação depende de configuração/aceite. Não chamar de recurso em produção.
- **Histórico**: arquivos, migrations ou documentação que descrevem etapas anteriores, sem integração à interface pública vigente.
- **Laboratório**: scripts, benchmarks e PoCs que **não autorizam** migração do Orbe ou do MiniMac.
- **Pendente de auditoria**: itens ainda não cobertos por leitura de implementação ou por teste funcional humano.

### Baseline verificado em 06/11/2026

| Repositório | `main` consultado | `dev` consultado | Relação entre branches                                                                                       |
| ----------- | ----------------- | ---------------- | ------------------------------------------------------------------------------------------------------------ |
| Backend     | `c302ec4442…`     | `747cd8243a…`    | `dev` está **3 commits atrás** de `main`; sem arquivos exclusivos em `dev` no compare                        |
| Frontend    | `5514b5ac66…`     | `d8b7bfbc8d…`    | `dev` está **37 commits à frente** de `main`; 13 arquivos diferem, sobretudo suítes live DEV e seu preflight |

Esses SHAs **são do GitHub**, não uma inspeção de qual versão o servidor está executando. A documentação será atualizada quando o código ou o estado homologado mudar. A branch de elaboração desta wiki é `docs/phasscode-wiki`, separada de ambos os ambientes.

## Princípios de documentação

- **Rastreabilidade:** referenciar arquivo, função e teste em toda explicação de fluxo.
- **Sem falsos positivos:** não confundir curso com trabalho profissional, evidência declarada com código revisado, nem similaridade técnica com domínio comprovado.
- **Separação de ambientes:** `dev` não é `main`; deploy manual e rollbacks têm critérios próprios.
- **Segurança:** não publicar tokens, `.env`, dados de conversa, URLs internas de administração, credenciais ou conteúdo privado.
- **Evolução histórica:** quando uma decisão for substituída, registrar o que mudou e referenciar a nova verdade operacional.

## Fontes existentes que esta wiki organiza

Esta wiki **complementa** a [documentação original da arquitetura](../architecture/overview.md), o [README atual](../../README.md), [ADRs](../adr/0001-foundation.md), [GraphRAG DEV](../graph-rag-active-dev.md), [segurança](../security.md), [documentação API](../api/README.md), [testes](../testing/README.md) e [documentação de deploy](../deployment/README.md), além dos documentos do [frontend](https://github.com/SladeSouzaSantos/web-portfolio-v2/tree/main/docs). Algumas páginas históricas (Fases 1–3, auth/reuniões) descrevem código ainda versionado, **não a superfície pública atual**.

**Cobertura atual:** primeira versão arquitetural e guia de leitura de código; ainda falta uma auditoria função a função de todas as centenas de arquivos e comparação com releases realmente implantadas. A wiki não deve ser anunciada como revisão exaustiva até essa etapa.
