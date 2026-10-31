# PHASSCODE Project Knowledge Schema (PPKS) — v1.0

O PPKS não substitui o catálogo público `knowledge/portfolio.json` nem confunde
um projeto autoral com vínculo profissional. Ele acrescenta uma camada de
evidências e explicações técnicas estruturadas para o Orbe.

## Arquivos

- `schemas/project-v1.schema.json`: contrato das fichas técnicas de projeto.
- `schemas/experience-v1.schema.json`: contrato de experiências profissionais.
- `schemas/index-v1.schema.json`: contrato do índice compacto.
- `projects/<id>.json`: uma ficha técnica por projeto do catálogo.
- `experiences/<id>.json`: uma ficha profissional por vínculo.
- `index.json`: índice gerado a partir das fichas, nunca editado manualmente.

As fichas `catalog_only` **não são auditorias integrais de código**.
Campos desconhecidos permanecem nulos, vazios ou `unknown`/ `not_verified`.
`verified` requer referência a um artefato inspecionável, enquanto `declared`
significa informação presente no catálogo. `inferred` NÃO prova implementação.
Os registros `experiences` podem confirmar tecnologias de trabalho sem
apresentar como pública uma base de código corporativa.

## Datas e sincronização futura

A ficha registra campos distintos:

| Campo                     | Interpretação                                                   |
| ------------------------- | --------------------------------------------------------------- |
| `sync.sourceRepository`   | Repo `owner/repo`, quando identificado                          |
| `sync.sourcePath`         | Subdiretório de origem, se for monorepo                         |
| `sync.sourceRef`          | Branch ou referência consultada                                 |
| `sync.sourceCommit`       | SHA exato do commit da referência consultada                    |
| `sync.lastModifiedAt`     | Data UTC do commit do **ref consultado**, não `repo.updated_at` |
| `sync.checkedAt`          | Quando o GitHub/catálogo foi consultado                         |
| `sync.analyzedAt`         | Quando a ficha técnica foi gerada/atualizada                    |
| `sync.reviewedAt`         | Quando as evidências foram revisadas editorialmente             |
| `sync.verificationStatus` | `catalog_only`, `code_reviewed`, `pending_review`               |
| `sync.syncEligible`       | Se o registro tem repo apto à futura sincronização              |

O `sourceCommit` é o principal identificador de mudança; a data auxilia
exibição e auditoria. Para projetos dentro de monorepos, o sincronizador
deverá consultar commits com `path=<sourcePath>` para evitar reanálise
causada por alterações não relacionadas. Não usar `updated_at` da
configuração do repositório como prova de alteração de código.

### Fluxo planejado (não habilitado)

Futuro comando `npm run ppks:sync -- --dry-run`:

1. Listar repositórios e projetos novos da conta GitHub com paginação e limites.
2. Comparar SHA remoto por branch/path com `sourceCommit` local.
3. Sinalizar `new`, `changed`, `unchanged`, `deleted_or_private` e
   `review_required`, sem excluir automaticamente fichas históricas.
4. Analisar somente código e documentação de projetos novos/alterados.
5. Criar proposta de alteração revisável (PR); nunca promover inferências
   para `verified` nem publicar segredos automaticamente.
6. Após aprovação, regenerar índice e executar testes de recrutamento.

O comando **ainda não foi implementado**; nenhuma varredura automática ou
alteração não revisada do GitHub é feita atualmente.

## Validação e índice

```bash
npm run ppks:index
npm run ppks:check
```

Ambos são **locais e sem rede**; o primeiro reconstrói `index.json`, o
segundo valida os JSON Schemas, as referências de evidência, IDs, períodos,
correspondência com os projetos/experiências do catálogo e
consistência do índice. `npm run check` também executa `ppks:check`.

## Uso pelo Orbe

O Orbe pode escolher fichas usando o índice pequeno e recuperar as seções
técnicas relevantes dos projetos encontrados, sempre preservando:

- experiência profissional versus projeto pessoal e estudo;
- arquitetura implementada versus sugerida;
- evidências concretas versus declarações;
- `not_documented` versus `not_implemented`;
- limites existentes de contexto e máximo de documentos por busca.

Não expor ao visitante caminho interno como URL de fonte externa.
