# Referência técnica do código — conclusão documental

[← Índice principal](../README.md) · [Mapa de funções](../mapa-do-codigo.md) · [Guia do desenvolvedor](../guia-do-desenvolvedor.md)

Esta seção é a **terceira camada de documentação**: inventário rastreável de símbolos TypeScript/TSX dos dois repositórios, contratos de API, migrations, componentes CSS e diferenças entre branches. A primeira e a segunda camadas explicam *por que* e *como* o sistema funciona; esta seção indexa *onde* encontrar as implementações.

## Inventários automatizados (fonte rastreável)

| Escopo | Símbolos (AST TypeScript) | Imports diretos de testes | Manifesto JSON |
| --- | --- | --- | --- |
| Backend MAIN | [Símbolos](main/simbolos-backend.md) | [Relações declaradas](main/imports-diretos-de-testes.md) | [JSON](main/manifesto-simbolos.json) |
| Frontend MAIN | [Símbolos](main/simbolos-frontend.md) | [Relações declaradas](main/imports-diretos-de-testes.md) | [JSON](main/manifesto-simbolos.json) |
| Backend DEV | [Símbolos](dev/simbolos-backend.md) | [Relações declaradas](dev/imports-diretos-de-testes.md) | [JSON](dev/manifesto-simbolos.json) |
| Frontend DEV | [Símbolos](dev/simbolos-frontend.md) | [Relações declaradas](dev/imports-diretos-de-testes.md) | [JSON](dev/manifesto-simbolos.json) |

[**Comparação dos símbolos e arquivos MAIN vs DEV**](diferencas-dev-main.md).

A geração é realizada pelo [`scripts/wiki-inventory.mjs`](../../../scripts/wiki-inventory.mjs), que usa a **AST do compilador TypeScript**, e pelo [`scripts/wiki-compare-snapshots.mjs`](../../../scripts/wiki-compare-snapshots.mjs). A execução fica limitada a clones públicos com SHAs fixados, na branch documental isolada. **Não lê `.env`, credenciais, bancos, conversas nem serviços remotos.** Os manifests contêm paths, símbolos, linhas, hashes e imports declarados, não conteúdo bruto de segredos.

Os links desta tabela se tornam válidos **após concluir a execução do workflow de geração**. Se uma execução falhar, não considerar o inventário homologado nem afirmar que as páginas foram geradas.

## Referências examinadas manualmente

- [**API: Fastify público e OpenAPI histórico**](contratos-api.md): cinco endpoints públicos, headers, DTOs e distinção das rotas de autenticação/reuniões.
- [**PostgreSQL: migrations 001–006**](migrations-postgresql.md): tabelas, relacionamentos, checksums e estados de serviço.
- [**React/CSS: componentes, temas e estilos**](componentes-e-css.md): relações entre telas e estilos, tokens da paleta, tipografia, acessibilidade e módulos históricos.
- [**Matriz crítica de testes**](../modulos/matriz-testes.md): casos relevantes de backend e frontend que precisam de execução e inspeção.

## O que o inventário garante — e o que não garante

| Propriedade | Situação |
| --- | --- |
| Símbolo e linha declarados no snapshot selecionado | Gerado por TypeScript AST quando o workflow passa |
| Conexões explícitas de `import` em testes | Identificação estática, não cobertura |
| Existência de contrato OpenAPI e scripts SQL | Fontes conferidas na branch `main` |
| Diferenças de arquivos TS/TSX de DEV e MAIN | Por SHA-256 de conteúdo e conjunto de símbolos (após geração) |
| Lógica completa de callbacks anônimos, efeitos React e chamadas dinâmicas | **Fora da abrangência automatizada**; dependem da leitura dos guias |
| Cobertura de assertions / branches ou testes passando nesta rodada | **Não demonstrada** por documentação |
| Qual SHA/digest está rodando no MiniMac DEV/MAIN | **Não verificado**; exige auditoria operacional autorizada |
| Migração HydraDB | **Não realizada**; LAB independente |

**Critério de entrega:** páginas fonte + inventários AST de MAIN e DEV gerados com sucesso, relatório de divergências, links locais válidos e nenhuma alteração em `dev`, `main` ou nos serviços implantados. A documentação é suficientemente ampla para servir como guia técnico de referência; **não** significa que cada comportamento tenha sido formalmente verificado por execução.
