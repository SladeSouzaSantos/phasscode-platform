# F3.3 — Resposta GraphRAG ativa, DEV-only

## Estado e fronteira

Este incremento introduz um modo **ativo separado** de `off` e `shadow`.
O modo padrão continua `ORBE_GRAPHRAG_MODE=off` e **nenhum deploy
padrão passa automaticamente a usar o grafo**.

- `off`: Orbe responde com PPKS/LLM, sem montar token do Reader.
- `shadow`: Orbe responde com PPKS/LLM e observa o grafo **depois**
  da resposta canônica, sem alterar `answer`, `sources` ou `meta`.
- `active`: após verificar escopo, segurança e precedência de respostas
  estruturadas, a API DEV chama o `StateGraph` tipado com o Reader HTTP
  interno. **Somente** uma seleção `verified_graph`, de claims com
  proveniência pública completa e URLs HTTPS disponíveis, pode ser
  devolvida ao visitante. Qualquer falha ou abstenção segue uma vez pelo
  fluxo PPKS/LLM atual, sem gerar uma chamada LLM extra pela seleção.

O modo `active` **não** é um verificador semântico universal de
prosa gerada por LLM. A resposta elegível é composta determinísticamente
a partir de claims selecionadas pelo verificador tipado; não interpreta
automaticamente toda vaga do LinkedIn. Este piloto conservador não
promete cobertura de todas as consultas de recrutadores.

### Consultas elegíveis

- Pergunta **focada em uma tecnologia explícita** e sem qualificadores
  estranhos ao escopo, por exemplo `Pedro sabe Java?`.
- Vaga com seções **sinalizadas** (`Requisitos: Java` e
  `Diferenciais: React`), contanto que o planejador reconheça a
  **totalidade** dos itens/claúsulas. Se houver itens desconhecidos
  (ex. Go), alternativa ambígua (ex. Java ou C#), falta de proveniência,
  fontes sem URL HTTPS, mais de dez fontes ou falha do Reader,
  o Orbe mantém a resposta canônica.

Perguntas abertas de carreira, duração, formação, projetos em lista,
turnos ambíguos e matrizes que excedam o limite de citações continuam
no fluxo canônico; respostas determinísticas existentes sempre têm
precedência. Um pedido de agendamento e perguntas fora do escopo jamais
disparam o modo ativo.

## Segurança

Apenas a API do projeto Docker **phasscode-platform-dev** pode receber,
sob opt-in explícito, o token do Graph Reader já existente. A API não
recebe `neo4j_auth`, URI Bolt nem segredos do processo seed. O
`GraphReaderHttpRepository` restringe o destino a
`http://graph-reader:8765`, timeouts, payloads e schemas. A
`PublicGraphEvidenceGateway` elimina claims privadas/incompletas.

O modo ativo requer simultaneamente:

```dotenv
ORBE_GRAPHRAG_MODE=active
ORBE_GRAPHRAG_STAGE=dev
ORBE_GRAPHRAG_DEV_APPROVED=true
ORBE_GRAPH_READER_TOKEN_FILE=/run/secrets/graph_reader_token
```

**Não** incluir essas variáveis no `.env` de produção. O overlay
`compose.graphrag.active.dev.yaml` deve ser utilizado **em lugar**
de `compose.graphrag.shadow.dev.yaml`. Ambos são excluídos do deploy
normal. NODE_ENV=production **não** diferencia o Mac Mini DEV do MAIN,
portanto não deve ser usado como prova de ambiente.

## Qualificação e homologação

Verificar antes de qualquer ativação:

1. CI de `dev` incluindo lint, format, types, unitários, integração,
   Browser, Neo4j real descartável, Docker, SAST, imagem e DAST.
2. Revisão das permissões dos secrets DEV `graph_reader_token` (UID 7474)
   e `graph_api_reader_token` (UID 1000), mesmo valor sem jamais
   imprimir o token. Sem host ports para Reader ou Neo4j.
3. SHA/OCI digest da API DEV e do Reader compatíveis; Reader autenticado
   `GET /internal/health` HTTP 200; API, Neo4j, PostgreSQL e Redis
   saudáveis, sem deploy lock.
4. Configuração Compose `config --quiet` com os overlays de Neo4j,
   Reader e **Active** (sem Shadow). Inspecionar a *configuração final*
   antes de recriar somente a API com `--no-deps --no-build --pull never`.
   Não executar `down` nem remover volumes.
5. Teste Playwright real com conversas novas e 2/3 turnos, fontes no
   contrato público e telemetria `orbe_graphrag_active` saneada:
   `mode=verified_graph` ou `mode=canonical_ppks`, `traceId`
   aleatório e duração. Sem prompts/respostas/tokens nos logs.
6. Comparar contra o fluxo anterior com o mesmo conjunto de perguntas;
   medir 503 (fallback LLM), tempo e exatidão por claim, incluindo
   vínculo SIGAA ≠ soma de ACRUX+SIGAA e cadeia de provedores por projeto.

**Rollback:** recriar **somente API DEV** com a mesma imagem pinada e
overlays existentes, mas **sem** o overlay Active. O default `off`
restaura a composição canônica; não modificar Neo4j/Reader, PostgreSQL,
Redis, volumes, `main` ou produção.

A milestone F3 não é concluída pelo simples merge de código: o aceite
F3.3 exige CI e prova funcional DEV, seguido das métricas F3.4/F3.5.
