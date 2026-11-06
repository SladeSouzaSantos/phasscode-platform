# F4.2 / Item 5 — protocolo de equivalência Orbe DEV/MAIN × HydraDB

**Objetivo:** demonstrar, com evidência reproduzível e sem modificar ambientes operacionais, quais resultados do contrato de evidências do Orbe já são obtidos no Neo4j e quais um adapter HydraDB LAB consegue reproduzir.

**Escopo:** somente `experiment/hydradb` para código e execução de testes; comparativos `main`/`dev` **somente leitura de fontes Git**. Não consultar nem copiar dados privados dos bancos operacionais, não publicar segredos, não ativar HydraDB no Orbe DEV/MAIN.

**Estado em 2026-11-06:** baseline de arquivos versionados = IDENTIDADE CONFERIDA; provas de funcionalidades isoladas = PARCIAIS; **paridade funcional end-to-end DEV/MAIN ↔ HydraDB = PENDENTE**.

## 1. O que exatamente é o baseline de DEV/MAIN

Na revisão de 06/11/2026, comparamos os objetos Git para os mesmos oito caminhos nas três branches:

| Componente | Arquivo | Git blob SHA-1 |
| --- | --- | --- |
| Contrato GraphRAG | `apps/orbe-node/src/domain/evidence-graph.ts` | `d1aa460b85a81dcec1a254abb8559d9600c12f48` |
| Consultas Neo4j | `apps/orbe-node/src/adapters/neo4j-graph-queries.ts` | `ce1a588861880039d422df78ba6889365b163f87` |
| Driver Neo4j | `apps/orbe-node/src/adapters/neo4j-driver-store.ts` | `1dc6647815360e96bec1fc2aee503ae9d3111533` |
| Projeção PPKS | `apps/orbe-node/src/adapters/ppks-evidence-graph.ts` | `29fce5ebb73e9fff83fe3d81269d13183caf597a` |
| Índice de registros | `knowledge/ppks/index.json` | `6e1a1e844cebb984367dbf7a272857c2b4a5c8bb` |
| Relações semânticas | `knowledge/ppks/semantic-relations.json` | `6ff70d3a9a4b2cb1370022fffc2cd7b19d9fe73d` |
| Dependências fixadas | `package-lock.json` | `08cbb89068979107005543c38ea84c40b8089180` |
| Prompt profissional v4 | `apps/orbe-node/prompts/v4.md` | `b9e68cff1dc12abade2fd563b517097c6a8af065` |

Commits inspecionados: `main c302ec444266333756d9f35bc9c1dfd7a5e7c684`; `dev 747cd8243ac67d19b720bb7441aa0b969734f391`; `experiment/hydradb c283df67c379357b3dae0354e89a73605b59bd72`.

**Significado:** temos uma base rastreável de **código e índice**, não acesso às configurações, versões de contêiner, snapshots de dados privados ou respostas efetivamente em execução em DEV/MAIN. Não afirmar que os ambientes ao vivo são idênticos; não coletar dados operacionais sem autorização e procedimento próprio.

## 2. O que a comparação deve responder

Para o mesmo conjunto público/sintético, comparar as respostas normalizadas deste contrato de domínio:

- `EvidenceGraphRepository.findEvidence(requirements, {maxClaimsPerRequirement})`: claims por requisito, exatamente os IDs de fontes exigidos, tipos, escopo e qualificação de evidência.
- `EvidenceGraphRepository.getSource(sourceId)`: recupera a fonte pública correta ou indica ausência. Chaves textuais devem ser estáveis; IDs internos numéricos são detalhe do adapter.
- Limitação, ordenação e deduplicação determinísticas; jamais ocultar fontes de uma claim por aplicar `LIMIT` cedo demais.
- Distinguir `professional`, `mixed_role`, `professional_project`, `personal_project` e `study`, bem como `catalog_only` versus `code_reviewed`.
- Fonte ausente, Go não documentado, erro e timeout: não devolver claims fabricadas; retornar fallback canônico conforme o contrato.
- Repetição do seed/snapshot, segunda rodada e reinicialização sem vazamento entre `lab_run`.
- Se o teste pedir avaliação de linguagem natural, executá-la **fora** deste gate: o GraphDB não interpreta sozinho uma pergunta do recrutador.

**Critério inegociável:** normalizar identificadores internos, mas **não** normalizar para longe diferenças substantivas: duplicações, vínculos ausentes, escopo, verificações de fonte, ordem onde semântica exigir, valores ausentes e erros.

## 3. Fixtures e conjuntos de teste que NÃO devem ser misturados

**Fixture PPKS de evidência:** 7 registros públicos, 10 skills, 14 claims, 16 fontes específicas, 47 vértices e 60 relações. A suíte prévia comparou 13 consultas parametrizadas em dois runs isolados por motor; consultar [contrato](hydradb-ppks-contract.md). É a base para os próximos métodos `findEvidence` e `getSource`.

**Fixture de 20 perguntas:** o Gate 8 comparou 38 claims/103 referências por ocorrência, com requisitos previamente anotados e fallback. É outra composição; útil para testar orquestração, **não** para substituir a prova do contrato de 47 nós nem para reivindicar compreensão NLP.

**Fixture Gate 9 de compatibilidade:** operações exatas e sintéticas em instâncias efêmeras; 7/9 consultas Orbe rejeitadas pelo HydraDB, 8/11 leituras adaptadas iguais, 13/13 passos de mutação/pós-condição iguais. **Isso não comprova** que os resultados finais do mesmo adapter Orbe sejam equivalentes. Ver [matriz](hydradb-gate9-dynamic-compatibility-2026-11-06.md).

## 4. Estratégia de execução segura, em ordem

### Etapa A — congelar o baseline e a evidência

1. Registrar o commit de cada branch e os blobs dos arquivos acima, mais o hash do fixture derivado de conteúdo público/sintético.
2. Construir uma *golden output* a partir do **código canônico PPKS e do adapter Neo4j testado em contêiner novo**, não de consultas aos bancos operacionais.
3. Fixar image digests (além de tags), Node.js e versão do driver e parâmetros de memória/CPU. Evitar usar imagens atualizadas sob a mesma tag.
4. Criar metadados de proveniência: query ID, fixture hash, origem pública, SHA do contrato, engine, versão, run ID, modo de leitura e status.

### Etapa B — implementar o adapter HydraDB **somente no LAB**

1. Encapsular as diferenças de ID (strings de negócio ↔ vértices numéricos) em um mapeamento verificável e estável dentro do fixture.
2. Projetar cada claim e **todas** as fontes com relações `SUPPORTED_BY` e propriedades de escopo/qualificação.
3. Usar somente o subconjunto Cypher que passou em teste de valores; evitar nas consultas de leitura as formas rejeitadas `WITH ... ORDER BY ... LIMIT`, `toLower()` e `count(n)` até haver suporte confirmado.
4. Não depender da compatibilidade Bolt antes de resolver os quatro `InvalidSyntax`. Um transporte HTTP LAB explícito pode ser usado para aferir a semântica, mas não equivale ao driver Neo4j operacional.
5. Isolar escrita, token, rede e volumes de teste. Proibir acesso aos Compose ou volumes DEV/MAIN.

### Etapa C — paridade dos resultados do Orbe

Para cada cenário, comparar duas execuções reais no mesmo runner/fixture descartável: referência `Neo4j + adapter existente` versus `HydraDB + adapter experimental`.

| Cenário obrigatório | Assert |
| --- | --- |
| Java profissional | Claim e fontes com escopo profissional; sem transformar formação em experiência |
| Java em estudo | Escopo de estudo distinto, sem elevação indevida |
| Flutter em atividade mista | `mixed_role` preservado |
| Uma claim com várias fontes | Não perder fonte ao limitar claims |
| `code_reviewed` vs `catalog_only` | Status por evidência, não por todo o registro |
| Fonte específica existente ou ausente | `getSource` exato e ausência explícita |
| Go ausente no fixture | Zero claims, sem sugerir experiência |
| Requisito que não está catalogado | Resultado vazio e fallback sem alucinação |
| Dados repetidos após novo run | Isolamento, nenhum vínculo extra |
| Idempotência do import | Mesmo resultado e contagens lógicas após repetição |
| Falha parcial do grafo | Nunca substituir a resposta canônica com dados incompletos |

**Aprovação funcional:** 100% dos casos aprovados no Neo4j devem ter objetos de saída semanticamente idênticos no HydraDB (comparação por esquema, IDs de evidência, tipos, escopos, status, fontes completas). Zero claims extras ou fontes perdidas. Qualquer diferença exige evidência de erro e motivo, sem omitir casos do denominador.

### Etapa D — persistência MinIO e continuidade

Somente após a paridade funcional: criar HydraDB + armazenamento MinIO **efêmero e isolado**, executar escrita→leitura→reinicialização→leitura, comparar o mesmo fixture e verificar invariantes de escopo, duplicação e proveniência. Testar interrupções e cenários de recuperação sob limites de recursos, sem destruir dados fora do projeto efêmero.

Registrar:
- estratégia e custo de object storage por perfil de carga, sem afirmar vantagem não medida;
- consistência após restart, read-your-writes e eventual bookmark/driver support;
- backup/restore e isolamento de tenants;
- erros conhecidos e condição de rollback.

**A aprovação de MinIO/persistência não foi obtida em 06/11/2026.** Não confundir as escritas descartáveis da F4.1 com durabilidade em armazenamento de objetos.

### Etapa E — benchmarks científicos comparáveis (F4.3)

Executar somente depois da paridade: mesmo fixture, consulta lógica, protocolo de transporte ou custo de protocolo segregado, recursos CPU/RAM, número de repetições suficiente, fases cold/warm, limite de concorrência, gravação de p50/p95/p99, throughput, falhas e custo operacional. **Não usar** os p50 exploratórios anteriores para concluir superioridade; foram caminhos/recursos distintos, alguns com n=3.

### Etapa F — empacotamento do feedback

Entregar ao Nishkarsh:
1. [Case study em inglês](hydradb-maintainer-feedback-2026-11-06.md) (contexto → arquitetura → mudanças → resultados → perguntas);
2. links para workflows e scripts (reprodutores HTTP/Bolt);
3. artefatos de execução contendo métricas e diffs **sem credenciais/dados privados**;
4. uma tabela honestamente classificada PASS / ADAPT / FAIL / NOT TESTED;
5. perguntas ao mantenedor sobre Bolt, Cypher, MinIO e recomendações para portabilidade.

## 5. Checklist de aceite (estado atual)

| Gate | Situação | Evidência / condição |
| --- | --- | --- |
| Identidade de código-base DEV/MAIN/LAB (8 arquivos) | **PASS, fonte Git** | Blobs listados na seção 1 |
| Consultas originais Orbe em Neo4j descartável | **PASS parcial** | 9 consultas executaram; contagens/linhas específicas conferidas |
| Compatibilidade direta de consultas originais no HydraDB | **NÃO PASSOU** | 7/9 HTTP 400; 2 sem semântica completa |
| Consultas HydraDB adaptadas (fixture simplificado) | **PASS parcial** | 8/11 leituras, 13/13 operações/pós-condições |
| Contrato PPKS adaptado em LAB, por run | **PASS delimitado** | 13/13 casos × 2 runs por motor |
| Shadow com fallback canônico | **PASS delimitado** | Gate 8, 36 verificações + 10 fallbacks esperados |
| Mesmo `EvidenceGraphRepository` end-to-end nos dois adapters | **PENDENTE** | Necessária golden output + casos completos |
| Bolt como transporte de leitura substituível | **NÃO PASSOU** | 4 InvalidSyntax no cliente JS |
| MinIO: persistência/restart/recuperação | **NÃO TESTADO** | Suíte de durabilidade separada |
| Desempenho/custo comparável | **NÃO TESTADO** | F4.3 com protocolo controlado |
| Troca de DEV/MAIN para HydraDB | **NÃO AUTORIZADA** | Neo4j continua sendo a referência operacional |

### Critério para declarar a etapa concluída

**Concluir o item 5 de equivalência funcional somente quando a mesma versão do contrato do Orbe, com um fixture público/sintético congelado, gerar objetos semanticamente idênticos via Neo4j e HydraDB em CI, e passar repetição, falha e no-loss-of-evidence.** MinIO/restart é um aceite operacional complementar, não um atalho para a paridade. Os testes de performance vêm depois.

**Nota sobre acesso remoto:** o SSH restrito do MiniMac está autorizado **somente** a executar a suíte Gate 8 OFF/SHADOW. Não ampliar os comandos permitidos para importar/deletar dados; realizar os testes dinâmicos preferencialmente em GitHub-hosted descartável ou em infraestrutura LAB revista separadamente.
