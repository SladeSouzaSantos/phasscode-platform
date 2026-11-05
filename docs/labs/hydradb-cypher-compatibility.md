# Compatibilidade Orbe GraphRAG × HydraDB v0.3.0 — análise estática

**Status:** bloqueios arquiteturais identificados; nenhuma integração com
a API Orbe foi criada. Estes achados são obtidos comparando o código da
branch experimental com o contrato documentado em
[cypher-compat.md upstream v0.3.0](https://github.com/hydra-db/hydradb/blob/v0.3.0/cypher-compat.md).
O subconjunto documentado não substitui testes de integração.

## Consultas que o Orbe executa atualmente no Neo4j

Fontes:
- `apps/orbe-node/src/adapters/neo4j-graph-queries.ts`
- `apps/orbe-node/src/adapters/neo4j-driver-store.ts`
- `apps/orbe-node/src/adapters/ppks-evidence-graph.ts`

| Operação atual | Diferença documentada no HydraDB | Consequência |
|---|---|---|
| `graphFindEvidenceCypher`: `toLower(skill.label) = toLower($skill)` | As expressões documentadas são comparações de propriedade; chamada a `toLower` não consta no subconjunto | Normalizar nome na ingestão e usar propriedade indexável `normalized_name`, mantendo nomes humanos |
| `graphFindEvidenceCypher`: `claim.scope IN [...]` | `IN` é explicitamente não suportado | Reescrever para igualdade/OR, preferencialmente predicado indexável por escopo |
| `graphFindEvidenceCypher`: `source.id IN claim.sourceIds` | `IN` não suportado; listas não são valores escalares persistidos | Modelar `SUPPORTED_BY` como arestas, nunca perder rastreabilidade |
| `graphFindEvidenceCypher`: `WITH claim ORDER BY claim.id LIMIT $limit` | `WITH` suporta apenas repasse de bindings, sem ordenação nem `LIMIT` | Reformular paginação/consulta em duas etapas ou top-K depois de `RETURN` |
| `graphGetSourceCypher`: `source.id = $id` com string PPKS | Identificadores internos de nós HydraDB devem ser inteiros não negativos | Adotar mapeamento estável e auditável de ID textual externo para UID numérico |
| `graphConstraintCypher`: `CREATE CONSTRAINT ...` | DDL equivalente não aparece no subconjunto de Cypher documentado | Validar unicidade de ID na projeção e no adapter, não presumir constraint |
| `graphNodesCypher`: `SET n += row.properties` | O `UNWIND` implementa `SET` de propriedades individuais, não atualização dinâmica de mapa | Explicitar propriedades e permitir extensão por versão de schema |
| `graphRelationsCypher`: `MERGE` de relações com `key` e atributos `sourceIds` | `MERGE` e `UNWIND` aceitos em formas restritas, ids internos numéricos e escalares | Definir conversão para IDs, propriedades e arestas de origem |

## Por que benchmark simples não basta

O teste anterior apenas gravou pares `(a {id})-[:USES_TECHNOLOGY]->(b {id})`
e comparou uma leitura 1-hop. **Não verificou** a busca de reclamações
(evidências), `payload`, claims, escopos, normalização de skills, IDs
externos, origem declarada versus código revisado nem vinculações
recrutador-vaga.

Uma migração direta via `bolt://` não preservaria o comportamento
existente: o adapter Neo4j atual é intencionalmente restrito a
`bolt://neo4j:7687` e às consultas aprovadas. Qualquer estudo HydraDB
deve ter interface própria e *feature gate* restrito ao LAB.

## Próximo experimento

Criar um grafo derivado de **cinco projetos e duas experiências públicas**
com:
- nó `Record` por projeto/vínculo;
- nó `Skill` compartilhado por nome de tecnologia;
- nó `Claim` por afirmação `Record usa Skill`;
- nó `Source` por registro PPKS, com `verificationStatus` explícito;
- arestas `HAS_CLAIM`, `USES_TECHNOLOGY`, `SUPPORTED_BY`.

As consultas devem verificar recuperação de competências, fontes e
compartilhamento entre registros (incluindo Java, Flutter, TypeScript),
com cardinalidade e equivalência exatas nos dois bancos. Usar apenas
IDs numéricos e propriedades escalares aceitos pelo HydraDB.

**Limite de interpretação:** esta é uma projeção simplificada para
compatibilidade semântica, **não** a migração integral da implementação
`OrbeEvidence`. Não alterar DEV/MAIN, não enviar dados acadêmicos
privados e não habilitar GraphRAG no Orbe LAB antes dos testes.
