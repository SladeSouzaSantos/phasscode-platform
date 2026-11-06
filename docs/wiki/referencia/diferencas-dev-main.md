# Diferenças verificadas entre DEV e MAIN — inventário AST

Gerado automaticamente a partir de **quatro SHAs GitHub imutáveis**. Compara hashes do conteúdo e símbolos nomeados, não imagens/container em execução. Um arquivo ausente no inventário não implica exclusão da árvore completa: apenas caminhos/linguagens definidos no coletor foram incluídos.

## backend

- MAIN: `c302ec444266333756d9f35bc9c1dfd7a5e7c684`
- DEV: `747cd8243ac67d19b720bb7441aa0b969734f391`
- Arquivos nos dois snapshots sem alteração: **237**; modificados: **0**; exclusivos MAIN: **0**; exclusivos DEV: **0**.

| Status | Arquivo TypeScript/JavaScript | Diferença de símbolos nomeados |
| ------ | ----------------------------- | ------------------------------ |

**Cuidado:** +0/−0 não significa arquivo idêntico; corpo, imports, lógica, CSS, dados ou testes podem ter mudado sem renomear símbolos.

## frontend

- MAIN: `5514b5ac6626fd68535ea8d2b2807ce681fc8de2`
- DEV: `d8b7bfbc8dff3754cb42fc6bf2541f33c360adf3`
- Arquivos nos dois snapshots sem alteração: **106**; modificados: **0**; exclusivos MAIN: **0**; exclusivos DEV: **4**.

| Status | Arquivo TypeScript/JavaScript         | Diferença de símbolos nomeados |
| ------ | ------------------------------------- | ------------------------------ |
| Só DEV | `scripts/orbe-local-playwright.mjs`   | +15 / −0                       |
| Só DEV | `scripts/preflight-orbe-live-dev.mjs` | +4 / −0                        |
| Só DEV | `scripts/read-orbe-live-request.mjs`  | +2 / −0                        |
| Só DEV | `tests/orbe-live.spec.ts`             | +6 / −0                        |

**Cuidado:** +0/−0 não significa arquivo idêntico; corpo, imports, lógica, CSS, dados ou testes podem ter mudado sem renomear símbolos.

## Critérios de interpretação

- HEADs Git são versões **de código**, não o digest de imagem implantada no MiniMac.
- Esta comparação AST não inclui CSS, SQL, JSON, dados PPKS nem arquivos não fonte; eles exigem revisão separada.
- Uma divergência DEV/MAIN não é autorização para merge ou deploy.
- Os catálogos de símbolos e relações de import direto dos testes estão em [MAIN](main/simbolos-backend.md) e [DEV](dev/simbolos-backend.md), mais os índices do frontend nas mesmas pastas.
