# Frontend — mapa de componentes, design system e CSS

[← Wiki](../README.md) · [Frontend](../frontend.md) · [Fluxos](../modulos/frontend-fluxos.md)

**Fonte:** [`web-portfolio-v2`](https://github.com/SladeSouzaSantos/web-portfolio-v2/tree/main/src), SHA `5514b5ac6626`. A análise considera **18 arquivos CSS** localizados em `src/styles/`, além da estrutura de componentes React. A presença de um arquivo de estilo não garante que ele seja importado no runtime público; o uso precisa ser confirmado pelo grafo de imports.

## Componentes públicos e responsabilidades

| Área de interface | TSX central | CSS principal | Interações |
| --- | --- | --- | --- |
| Composição, rotas | [App.tsx](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/App.tsx) | [app.css](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/styles/app.css) | Hash/Router, cenas, preloader, Orbe |
| Navegação e tema | [Navbar.tsx](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/components/Navbar.tsx) | [navbar.css](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/styles/navbar.css) | Seção, tema, teclado |
| Sobre | [Sobre.tsx](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/sections/Sobre.tsx) | [secao_sobre_mim.css](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/styles/secao_sobre_mim.css) | Perfil, competências |
| Projetos | [Projetos.tsx](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/sections/Projetos.tsx) | [secao_projetos.css](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/styles/secao_projetos.css) | Cartazes e detalhes |
| Arquivo de Missões | [ArquivoProjetos.tsx](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/sections/ArquivoProjetos.tsx) | [arquivo_projetos.css](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/styles/arquivo_projetos.css) | Catálogo e filtros |
| Experiência | [Experiencia.tsx](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/sections/Experiencia.tsx) | [secao_experiencia.css](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/styles/secao_experiencia.css) | Cronologia e fichas |
| Formação | [Formacao.tsx](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/sections/Formacao.tsx) | [secao_academica.css](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/styles/secao_academica.css) | Cartões, trilhas e modais |
| Assistente Orbe | [OrbAssistant.tsx](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/components/OrbAssistant.tsx) | [orbe_assistant.css](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/styles/orbe_assistant.css) | Canvas, chat, histórico e fontes |
| Projetos 3D/flip | [CartazMissao.tsx](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/components/CartazMissao.tsx) | [projetos-flip.css](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/styles/projetos-flip.css) | Cartas e efeitos |

## Design tokens e regras de tipografia

A [`paleta_cores.css`](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/styles/paleta_cores.css) define tema **escuro** por `:root`, `body.modo-escuro` e `html.dark`; tema **claro** por `body.modo-claro` e `html:not(.dark)`.

| Família de tokens | Exemplos reais do CSS |
| --- | --- |
| Fundos | `--bg-principal`, `--bg-container`, `--bg-card-elevado`, `--bg-overlay-modal` |
| Bordas | `--borda-suave`, `--borda-foco`, `--borda-moldura-rpg`, `--borda-ouro` |
| Texto | `--texto-principal`, `--texto-secundario`, `--texto-ciano`, `--texto-verde` |
| Acentos | `--acento-ouro`, `--acento-ciano`, `--acento-vermelho` |
| Sombras | `--sombra-projetada` |

Exemplo: tema escuro `--bg-principal: #080d12`, `--texto-principal: #f1f5f9`. Tema claro `--bg-principal: #e2e8f0`, `--texto-principal: #0f172a`. Esses valores são referência documental de **baseline**, não sugestão para alterar o design.

A folha [`tipografia.css`](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/styles/tipografia.css) utiliza fonte local `Press Start 2P` e variáveis `--fonte-titulo`, `--fonte-texto`, `--fonte-interface`. A escala tipográfica e `line-height` foram ajustadas para legibilidade em pixel art, e há override específico `@media (max-width: 480px)`. **Não incluir ou redistribuir o arquivo da fonte na wiki.**

## Preloader, transições e acessibilidade

- [`sitePreloader.ts`](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/lib/sitePreloader.ts): capa inicial durante primeira pintura.
- [`useSectionTransition.tsx`](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/hooks/useSectionTransition.tsx): wipe circular `clip-path`, bloqueio de interações durante a troca, precarga da cena WebP e respeito a `prefers-reduced-motion`.
- [`orbRenderer.ts`](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/src/effects/orbRenderer.ts): desenho do Orbe no canvas, separado da lógica do chat.
- [`site-loading.spec.ts`](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/tests/site-loading.spec.ts), [`section-circle-transition.spec.ts`](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/tests/section-circle-transition.spec.ts) e [`accessibility.spec.ts`](https://github.com/SladeSouzaSantos/web-portfolio-v2/blob/main/tests/accessibility.spec.ts): testes candidatos ao revisar o UX.

**Acessibilidade é comportamento, não somente CSS:** foco no modal, teclado, nome acessível de controles, redução de movimento, tamanhos em 320–480px e contraste precisam de inspeção/Playwright.

## Estilos históricos preservados

Os arquivos `admin_dashboard.css`, `admin_meetings.css`, `auth_callback_notice.css`, `auth_session_notice.css`, `login_modal.css` e `meetings.css` pertencem a módulos desenvolvidos em fases anteriores e **não justificam afirmar que autenticação/reuniões sejam funcionalidades públicas vigentes**. A análise de imports/rotas deve definir o uso.

## Como atualizar esta parte da wiki

Ao alterar design tokens, revisar **ambos os temas**, estilos das seções, modais e testes responsivos. Quando atualizar CSS, identificar classes/seletores dependentes de um componente React. Evitar mudar estilos globais ou fontes para "corrigir" uma única seção; preferir hierarquia da classe/módulo e preservar reduced motion.

**Limite:** documento obtido de leitura de código/CSS, sem análise completa da cascata, screenshots ou execução live. O inventário de símbolos TSX complementa o mapa de componentes.
