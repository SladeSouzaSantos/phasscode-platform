# Gate 11 — durabilidade S3 compatível com MinIO e reinicializações (CI isolada)

**Data:** 06/11/2026. **Resultado:** PASS para fixture sintético mínimo. **NÃO** comprova HA, consistência sob concorrência, backup/restore ou custo.

## Arquitetura testada

- HydraDB `ghcr.io/hydra-db/hydradb:0.3.0` configurado com `CLOUD_PROVIDER=aws` e object store S3 compatível via `AWS_ENDPOINT` para MinIO.
- MinIO mantido pela Chainguard, `cgr.dev/chainguard/minio:latest`, executado como UID 65532, e cliente `cgr.dev/chainguard/minio-client:latest-dev`.
- Todos os contêineres, a rede, o bucket, as credenciais de desenvolvimento e o volume de objeto pertencem **somente ao runner GitHub-hosted descartável**.
- API Hydra exposta exclusivamente via loopback `127.0.0.1`, com token efêmero. Nenhuma conexão ao MiniMac, Neo4j operacional, DEV, MAIN ou bucket externo.
- `consistency: strong` solicitado nas operações HTTP; isso **não** substitui teste rigoroso de contratos de consistência.

## Sequência executada e evidências

[GitHub Actions #42162965498](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42162965498), commit `d5e906d3af9b32c2cd328fe37016f2c86d1f40eb`, **success**.

1. Inicialização de MinIO novo, bucket temporário e HydraDB novo com cache `cache-1`.
2. Inserção de `Record -[:GATE11_USES]-> Skill` e `Claim -[:SUPPORTED_BY]-> Source`, com IDs sintéticos e verificação por consulta.
3. Calculado digest das duas consultas: `77b10d56d1b608bee6583cd1ce37d34e9071bc97fab174f77c181b916f8a799b`.
4. HydraDB removido e iniciado novamente com **cache-2 novo**. As duas leituras retornaram os valores esperados com **digest idêntico**.
5. HydraDB e MinIO removidos e iniciados novamente; preservado somente o diretório de objetos do bucket. Novo HydraDB com **cache-3 novo**. O digest das leituras permaneceu **idêntico**.
6. Contêineres, rede e arquivos temporários removidos: `GATE11_DISPOSABLE_RESOURCES_REMOVED`.

Marcadores: `GATE11_MINIO_SYNTHETIC_WRITE_READ_PASS`, `GATE11_HYDRA_NODE_RESTART_DURABILITY_PASS`, `GATE11_MINIO_RESTART_DURABILITY_PASS`. A CI `success` só é emitida após as verificações de valor e digest.

Códigos: [runner de containers](../../scripts/hydradb-gate11-minio-containers.sh), [verificador de escrita/releitura](../../scripts/hydradb-gate11-minio-restart.py), [workflow](../../.github/workflows/hydradb-gate11-minio-durability.yml).

## Incidente de distribuição das imagens MinIO

A [execução #42162815747](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42162815747) falhou no download de `minio/minio:RELEASE.2025-07-23T15-54-02Z`: Docker Hub respondeu com `pull access denied`. A [execução #42162882469](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42162882469) também falhou ao baixar `quay.io/minio/minio`: HTTP 401.

A referência do upstream [HydraDB v0.3.0, `scripts/minio_smoke.sh`](https://github.com/hydra-db/hydradb/blob/v0.3.0/scripts/minio_smoke.sh) usa exatamente as imagens antigas do Docker Hub. Para a CI atual, usamos uma imagem Chainguard mantida e pública, com usuário não root 65532. **Essa é uma dificuldade de reprodução do harness desatualizado, não um defeito observado no engine HydraDB.** A imagem Chainguard é referida pela tag móvel `latest`, então para futura medição e reprodução de longo prazo devemos registrar/pinar o digest OCI efetivamente usado, juntamente com o release do cliente.

## Limitações / passos pendentes

- Suíte usa apenas **dois relacionamentos e quatro nós sintéticos**, sem o contrato completo de 16 fontes/38 claims, sem volume de dados relevante.
- Não exercita degradação de MinIO sob erros, reinício durante escrita, concorrência, transações multi-comando, fencing de writer, multiple tenants, replica de MinIO, snapshots ou recovery point objetivo.
- Não prova que Orbe DEV/MAIN poderia usar Hydra sem migração e sem regressões de Bolt; Gate 9 mostrou incompatibilidade direta nas queries atuais.
- Não há benchmark p50/p95, custo real por requisição/objeto armazenado, S3 remoto ou qualificação de produção.
- Próxima entrega: pins de imagem/digest, objeto PPKS público ampliado e recuperação sob falha controlada antes de comparar desempenho.

**Avaliação delimitada:** provamos que os valores gravados no armazenamento de objetos **sobreviveram à substituição do nó HydraDB, cache e servidor MinIO**, na mesma instância GitHub-hosted com o mesmo volume do bucket. Não chamar este teste de backup independente ou HA.

## Immutable OCI image identity — verified repeat (2026-11-06)

We recorded the exact registry digests used by the restart suite and changed the [ephemeral runner script](../../scripts/hydradb-gate11-minio-containers.sh) to pull them by **digest, rather than floating tags**:

| Component | Immutable image |
| --- | --- |
| HydraDB | `ghcr.io/hydra-db/hydradb@sha256:515ee78600b5d543f9146e62e775c76a8d5d0309773c165b918ed770649a91f3` |
| MinIO | `cgr.dev/chainguard/minio@sha256:cee9a8e35885e93f14b3cb32960e5017aff74e2adfb52ba87c65003b0163886b` |
| MinIO client | `cgr.dev/chainguard/minio-client@sha256:d4367bd78c859a7629c48978cbdaa0f23a27d92ad3d59457738bc0c7f7128de2` |

**Re-run with these digest-pinned images:** [Gate 11 #42165160104](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42165160104) and [Gate 13 #42165160131](https://github.com/SladeSouzaSantos/phasscode-platform/actions/runs/42165160131) both **success**. Gate 13 returned the same public-PPKS digest `ff31a03e8697b992023097f67f6ff77ac33de3635a9836ba60c8557990ab1513` after both restarts, and cleaned the runner. These exact digests apply to **Gates 11/13 only**; other workflows' images are not claimed as digest-pinned.
