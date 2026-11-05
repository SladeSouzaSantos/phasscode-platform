# HydraDB × Neo4j — primeira amostra PPKS (MiniMac, 2026-11-05)

## Resultado observado

Fonte: saída de terminal fornecida pelo operador do LAB em
`~/hydradb-lab/phasscode-platform` após executar
`python3 scripts/hydradb-neo4j-ppks-benchmark.py --live`.
Não houve acesso direto deste relatório ao host nem ao JSON de resultados.

- HydraDB: v0.3.0, imagem oficial GHCR por digest, armazenamento local.
- Neo4j: imagem `neo4j:5.26`, serviço `neo4j-compare` exclusivo do LAB.
- PPKS: cinco projetos + duas experiências, amostra derivada de dados
  declaradamente públicos, 14 pares de tecnologia.
- Cada motor: 14 escritas de relações sintéticas `USES_TECHNOLOGY`.
- Leituras: 42 consultas por motor; todos os valores esperados coincidiram.
- **Paridade funcional do teste sintético de 1 hop: APROVADA.**
- Latência local p50 observada: HydraDB **2,335 ms**; Neo4j **95,119 ms**.
- Arquivo gerado no host:
  `~/hydradb-lab/benchmarks/ppks-graph-20261105T204432Z.json`.
  O relatório JSON contém as estatísticas completas; seu conteúdo
  não foi inspecionado aqui.

## Anomalia bloqueante para conclusões de desempenho

O comando `docker compose ... up -d --wait neo4j-compare` informou
`container ... is unhealthy` após aguardar. **Apesar disso, a API HTTP
do Neo4j respondeu e executou as 14 escritas e 42 leituras corretamente.**

Não atribuir a falha de healthcheck a senha, OOM, JVM, timeout ou
versão sem evidência de `docker inspect` / healthcheck logs. A API ter
funcionado não prova que todos os processos do contêiner estejam saudáveis.

Executar somente no LAB:

```bash
cd ~/hydradb-lab/phasscode-platform
python3 scripts/hydradb-neo4j-health-diagnostic.py
```

O script lê estados e códigos dos últimos probes sem imprimir
variáveis de ambiente, senha, token ou logs completos. Executa apenas
`RETURN 1` no `cypher-shell` local com autenticação herdada do
próprio contêiner. Não modifica configuração ou dados.

## Interpretação correta

As duas APIs HTTP são diferentes: HydraDB usa
`POST /v1/graphs/lab/query`; Neo4j usa
`POST /db/neo4j/tx/commit`. O teste inclui abertura de conexão,
serialização, transação, tratamento HTTP, implementação e overhead JVM.
Os limites de recursos também são diferentes (HydraDB até 1 CPU/2 GiB;
Neo4j até 0,75 CPU/896 MiB, com heap e page cache restritos).
A amostra é pequena e a consulta é trivial.

A razão p50 aproximada de **40,7×** refere-se somente ao
**tempo de resposta HTTP observado neste microbenchmark**, não a
throughput, eficiência de GraphBLAS, eficiência de indexação, ou
desempenho geral de bases de grafos.

Não recomendar migrar produção nem ativar o GraphRAG do LAB baseado
nesses valores.

## Próximos critérios de homologação

1. Diagnosticar healthcheck do Neo4j e repetir comparação com ambos
   os serviços saudáveis, controle de recursos e protocolo equivalente
   quando possível (Bolt usando o mesmo driver).
2. Exercitar identidade real de competências: vários projetos
   compartilhando um mesmo nó Skill, preservando escopo profissional
   vs. estudo, fontes e origem das alegações.
3. Validar o subconjunto Cypher necessário no Orbe:
   `graphFindEvidenceCypher`, `graphGetSourceCypher`, filtros, ordenação,
   agregação, parametrização, limites, leitura de evidências e suporte
   a índice/snapshot.
4. Medir p50/p95 em mais repetições e tamanhos (carga fria vs. aquecida,
   1 e vários hops), RAM e CPU do processo com recursos equivalentes.
5. Somente depois avaliar um adapter HydraDB **exclusivo do LAB**,
   com fallback para PPKS e testes de regressão com perguntas de recrutadores.

**Proibição operacional:** jamais montar dados/volumes de `dev` ou
`main`, exportar arquivos acadêmicos privados para o grafo de
benchmark ou habilitar HydraDB no Orbe operacional.
