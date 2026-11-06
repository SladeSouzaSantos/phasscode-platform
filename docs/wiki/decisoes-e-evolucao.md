# Evolução, decisões e arquitetura atual

[← Wiki](README.md) · [Arquitetura](arquitetura.md) · [DEV/MAIN](ambientes-deploy.md)

## 1. O problema que orienta o projeto

O PHASSCODE começou como um portfólio interativo e evoluiu para uma aplicação com backend próprio. O objetivo atual do Orbe é **apresentar a trajetória do profissional a recrutadores com evidências e clareza**. Isso impõe decisões concretas: recuperar informações reais, explicar transferibilidade sem inventar experiência, limitar custo de LLM, preservar privacidade e permitir testes isolados.

O projeto contém **histórias técnicas de diferentes fases**. Esta página separa decisões atuais, opções ainda condicionais e iniciativas que deixaram de compor o produto público.

## 2. Linha de evolução técnica — síntese das fontes versionadas

| Etapa | Motivação e evolução | Evidência no repositório | Situação em relação ao runtime público |
| --- | --- | --- | --- |
| Fundamentos backend | API HTTP modular, portas de domínio e camadas de storage | [ADR 0001](../adr/0001-foundation.md), [`domain/ports.ts`](../../apps/orbe-node/src/domain/ports.ts) | A separação por portas/adapters continua presente |
| Chat e persistência | Token de continuidade, PostgreSQL, limites, orçamento e provedores | [ADR 0002](../adr/0002-chat-and-storage.md), [`application/chat.ts`](../../apps/orbe-node/src/application/chat.ts) | Ativo no serviço público |
| Fase de autenticação/reuniões | Código para Google, agenda, administração e worker | [ADR 0004](../adr/0004-authentication.md), [`auth/`](../../apps/orbe-node/src/auth/), [`meetings/`](../../apps/orbe-node/src/meetings/) | **Histórico / fora da superfície pública atual** |
| Simplificação do portfólio e Orbe | Retirada de login, painel e reuniões do produto exposto; foco em recrutadores | [README backend](../../README.md), [README frontend](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/README.md) | Escopo público atual |
| PPKS | Fichas técnicas, classificação, trilhas e proveniência individual | [PPKS v1](../../knowledge/ppks/README.md), [`knowledge/portfolio.json`](../../knowledge/portfolio.json) | Base canônica versionada |
| Recuperação semântica | Busca lexical e relações conceituais curadas, com guardrails | [`semantic-graph.ts`](../../apps/orbe-node/src/adapters/semantic-graph.ts), [F3.7](../architecture/semantic-hybrid-f37.md) | Código semântico curado disponível; propostas adicionais exigem aceite |
| GraphRAG com Neo4j/LangGraph | Validar relações e fontes no grafo, mantendo fallback | [GraphRAG active](../graph-rag-active-dev.md), [GraphRAG shadow](../graph-rag-shadow-dev.md) | Opcional, DEV-only por aprovação; **off por padrão** |
| Embeddings ONNX | Estudar recuperação de sinônimos e baixa latência local | [fusão estrita](../architecture/semantic-strict-fusion-v2.md), [benchmark no MiniMac](../architecture/minimac-f37-benchmark.md) | **Laboratório; não ativado no runtime público** |
| HydraDB | Estudar portabilidade de interface, Cypher/Bolt, S3 e custo | [`experiment/hydradb`](https://github.com/SladeSouzaSantos/phasscode-platform/tree/experiment/hydradb) | **Experimento isolado; não é a base operacional** |

Esta linha do tempo é **síntese editorial das decisões documentadas**, não inventário exaustivo dos commits, dos deployments ou dos estados da infraestrutura.

## 3. Decisões arquiteturais atuais

### Manter o Orbe orientado a evidências

Toda afirmação profissional relevante deve encontrar fundamento em `knowledge/` e, quando apropriado, fontes de projeto ou experiência. O LLM pode organizar o texto, mas não é a origem da verdade. O [PPKS](conhecimento-e-evidencias.md) diferencia evidência catalogada, revisada e não confirmada.

### Separar interfaces e infraestrutura

O [`ChatService`](../../apps/orbe-node/src/application/chat.ts) conhece portas e políticas, não precisa ser reescrito apenas porque a fonte de dados deixa de ser JSON ou Neo4j. [`Neo4jGraphStore`](../../apps/orbe-node/src/adapters/neo4j-driver-store.ts) e [`GraphReaderHttpRepository`](../../apps/orbe-node/src/adapters/graph-reader-http.ts) são detalhes de infraestrutura com limites de acesso.

### Evitar que experimentos alterem produção

GraphRAG Shadow/Active exige autorização explícita em DEV; ONNX/embeddings e HydraDB são experimentos condicionados a evidência de ganho/correção. **Nenhuma dessas iniciativas autoriza alterar `main` automaticamente**.

### Não prometer funcionalidades desativadas

Embora haja arquivos antigos de autenticação, sessões, administração, calendário e worker, o [frontend público](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/App.tsx) não os expõe e o [bootstrap](../../apps/orbe-node/src/main.ts) força `publicOnly: true`. Qualquer reintrodução deve ser tratada como **nova decisão de produto e segurança**.

## 4. Como registrar uma decisão futura

Usar um ADR curto com:

1. **Contexto** — problema, restrições e impactos no Orbe.
2. **Alternativas** — por exemplo, manter lexical/PPKS, ativar GraphRAG, adicionar embedding ou usar outro storage.
3. **Decisão** — o que será aplicado, em qual branch e em qual ambiente.
4. **Evidências** — teste, SHA, p50/p95 quando relevante, cobertura semântica e revisão humana.
5. **Riscos e rollback** — falha de provedor, custo, segredos, dados e compatibilidade.
6. **Status** — proposta, laboratório, aprovado DEV, homologado DEV ou disponível em MAIN.

Nunca transformar **aprovado para laboratório** em **disponível na produção** sem evidência de release.

## 5. Guia de referências históricas

- [`docs/TASKS.md`](../TASKS.md) e [`docs/PROGRESS.md`](../PROGRESS.md) — registros de atividades; podem conter tarefas superadas.
- [`docs/adr/`](../adr/) — justificativas originais, sujeitas a ADRs posteriores.
- [`docs/architecture/`](../architecture/) — decisões de semântica e relatórios experimentais.
- [`docs/graph-rag-*.md`](../graph-rag-active-dev.md) — modos e limites do grafo.
- [`evaluation/`](../../evaluation/) — conjuntos e rubricas, diferenciando teste sintético de validação real.
- [Frontend `docs/`](https://github.com/SladeSouzaSantos/web-portfolio-v2/tree/main/docs) — handoffs antigos e documentação atual; consultar o README para distinguir o escopo público.

## 6. Pendências da documentação completa

Esta primeira wiki explica **módulos e fluxos principais**. Para declarar a documentação *integral* do código, ainda precisamos de inventário função-a-função, contratos de todo o banco/migrations, APIs internas do Reader, uma matriz completa de testes por módulo, cobertura CSS/design tokens, histórico reconciliado dos dois repositórios e validação contra os SHAs realmente implantados. Consulte o [guia do desenvolvedor](guia-do-desenvolvedor.md) para a estratégia de manutenção contínua.
