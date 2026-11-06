# Gate 9 / F4.1 — inventário verificável de Cypher do Orbe

**Estado:** análise estática CI PASS; compatibilidade real Bolt/Cypher com HydraDB ainda não testada. **Sem deploy ou acesso remoto neste gate**.

## Prova

- Origem: fontes versionadas do Orbe, apps/orbe-node/src/adapters/neo4j-graph-queries.ts e apps/orbe-node/src/adapters/neo4j-driver-store.ts, na branch experiment/hydradb.
- Ferramenta: evaluation/hydradb-gate9-cypher-inventory.ts, executada por scripts/gate9-cypher-inventory.ts.
- Contrato documentado: [compatibilidade HydraDB v0.3.0, análise anterior](hydradb-cypher-compatibility.md).
- [GitHub Actions #42146831024](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42146831024): typecheck, Vitest e relatório de inventário PASS, sem SSH/Tailscale/Neo4j/HydraDB/LLM.
- Verificação de drift: sete constantes Cypher exportadas e duas consultas count() do driver. Mudança de superfície, allowlist, URI fixa ou query de contagem gera falha; log não contém código privado nem credenciais.

## Operações existentes

| Operação | Status apenas documental | Diferença a resolver/testar |
| --- | --- | --- |
| graphConstraintCypher | ADAPT | CREATE CONSTRAINT não consta do subconjunto documentado |
| graphNodesCypher | ADAPT | UNWIND + SET n += mapa dinâmico; IDs textuais versus numéricos |
| graphRelationsCypher | ADAPT | MERGE de relacionamento + sourceIds como lista; projetar arestas |
| graphPruneRelationsCypher | VERIFY | IS NULL, DELETE e preservação de snapshot |
| graphPruneNodesCypher | VERIFY | IS NULL, DETACH DELETE e preservação de snapshot |
| graphFindEvidenceCypher | ADAPT | toLower, IN, WITH ORDER BY LIMIT, collect, vínculos a fontes |
| graphGetSourceCypher | ADAPT | chave pública textual e lookup interno numérico; LIMIT |
| driverCountNodesQuery | VERIFY | COUNT e representação numérica do driver |
| driverCountRelationsQuery | VERIFY | COUNT com padrão de relacionamento |

**Totais:** 9 operações identificadas; 5 com adaptação necessária conforme documentação, 4 com necessidade de verificação em runtime. ADAPT e VERIFY **não** são resultados de queries executadas no HydraDB; nenhum PASS de engine é reivindicado. O código original do Neo4j não foi alterado.

## Plano para a etapa dinâmica em laboratório

1. Congelar SHA da branch, versão do HydraDB/Neo4j e datasets sintéticos com IDs de execução únicos (lab_run).
2. Exercitar Bolt do HydraDB com driver e autenticação LAB; não reutilizar a conexão restrita bolt://neo4j:7687 do Orbe nem suas credenciais.
3. Confrontar cada operação com consulta nativa do Neo4j e tradução HydraDB quando necessária; documentar casos incompatíveis, parâmetros/limites e detalhes de erros sem registrar segredos.
4. Verificar semântica de múltiplas fontes por claim, busca de skills, escopo profissional/estudo, ordenação, limitação, exclusão, idempotência e consistência de snapshot com dataset descartável.
5. Executar provas em armazenamento/volume LAB próprios; jamais usar volumes, token de leitura ou seed dos ambientes DEV/MAIN.
6. Consolidar tabela PASS/ADAPT/UNSUPPORTED com execuções e outputs por operação; somente então planejar benchmark de desempenho comparável e custos em F4.3.

**Restrição operacional importante:** o forced-command SSH validado na etapa Gate 8B executa **apenas** OFF/SHADOW de leitura com scripts fixos. Ele não pode executar automaticamente operações de seed/delete/benchmark da F4.1. Para testes dinâmicos, preparar comando separado e controlado, revisar segurança, uso de recursos e escopo antes de permitir alteração do procedimento no MiniMac.

**Decisão atual:** compatibilidade parcial de leitura PPKS já comprovada pelos Gates 3–8; migração substituindo o adapter Neo4j no Orbe **não** está comprovada. Este inventário serve para priorizar testes reais, não para decidir troca de engine.
