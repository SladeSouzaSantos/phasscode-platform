# PPKS — Pipeline de evidências (fases 1–4)

## Objetivo

Respostas para recrutadores devem separar a **experiência profissional**, os
**projetos autorais**, a **formação**, os **cursos** e as **relações conceituais**
entre tecnologias. O grafo não comprova uso profissional por associação.

## Fluxo

1. `JsonKnowledgeRepository.search` seleciona registros curados, usando
   vínculos profissionais, projetos e, para consultas de recrutamento, candidatos
   diretos e de um salto seguro do grafo de competências.
2. `ChatService` constrói um pacote balanceado; histórico só consome o espaço
   efetivamente utilizado. Os registros preservam IDs, títulos, natureza e
   tecnologias originais.
3. `LangChainChatProvider` compacta o texto dos registros conjuntamente, sem
   descartar documentos inteiros simplesmente por estarem no fim da lista.
   Em contexto extremamente curto, o resumo prioriza tecnologias explicitamente
   registradas no catálogo; não inventa tecnologias inferidas.
4. Relações do grafo são contexto **opcional**. Se faltar espaço, são retiradas
   antes da eliminação de fontes. O resultado de uma ferramenta pode utilizar
   parte da reserva de contexto, mantendo uma margem para o protocolo.
5. `reconcileDocumentedClaims` verifica contradições negativas específicas
   contra as **fontes efetivamente usadas**; não transforma projetos pessoais
   em experiência empregatícia.
6. `selectSources` emite apenas referências selecionadas dentre as fontes
   efetivamente acessíveis neste turno.

## Observabilidade operacional

Sem habilitação, nenhuma trilha de evidências é impressa. No ambiente DEV,
defina `ORBE_EVIDENCE_TRACE=true` na configuração do container e reinicie
a API por meio do deploy habitual. Não ligue por padrão em produção.

As linhas JSON de log terão `event=orbe_evidence_trace`, identificador
**aleatório por turno** e etapas `retrieved`, `chat_bounded`,
`provider_initial`, `provider_compacted`, `response_sources`.
As linhas contêm somente os IDs das fontes e suas quantidades de caracteres;
não incluem perguntas, respostas, tokens, URLs ou identificadores de visitantes.

Acompanhe um `traceId` único para saber se a evidência chegou ao provedor,
foi compactada e apareceu nas citações. A presença no prompt não obriga a
LLM a utilizar o fato; asserções negativas incorretas precisam passar pela
reconciliação e pelas avaliações semânticas.

## Critérios de regressão

- React: `web-portfolio-v2` é projeto real; Java no SIGAA oferece bases
  transferíveis de POO, mas não substitui Hooks/JSX/React.
- Bancos: MySQL na Geowellex e PostgreSQL no SIGAA são registros profissionais
  distintos; Redis é usado em projeto autoral; Firebase não comprova Firestore.
- O catálogo completo de 42 cursos e as referências exigidas nas matrizes
  de avaliação devem continuar acessíveis.
- Em orçamento insuficiente, retornar `LLM_CONTEXT_LIMIT` antes de solicitar
  resposta especulativa. A API pública e seu contrato permanecem inalterados.
