# ADR 0002 — Conhecimento público, provedores e conversas privadas

Estado: aceita. Data: 21/10/2026.

Contexto: faltam dados biográficos verificados e credenciais reais. Precisamos testar sem custo e
sem confundir respostas simuladas com geração de IA.

Decisão: JSON público validado, recuperação lexical e prompt versionado. Mock identificado no texto
e em metadados, adaptador LangChain separado com configuração por ambiente. Ferramenta única de
busca apenas de leitura, lista permitida, argumentos validados e limite de rodadas. API OpenAI usa
Responses por padrão; provedores compatíveis podem usar Chat Completions. `store: false` é enviado.

Conversas usam UUID do servidor e token aleatório de 256 bits entregue uma vez. Hash fica no banco,
sem criptografia própria. Não há endpoint de leitura pública do histórico. PostgreSQL usa transação
por turno; memória é explicitamente descartável. Retenção padrão de sete dias sem uso e poda do
histórico por quantidade; remoção física requer executar o job diário documentado.

Consequências: mock permite execução imediata; real requer chave e modelo válidos. A busca não tem
semântica vetorial e perguntas vagas podem não encontrar fatos. Heurísticas e prompts reduzem
injection/alucinação, sem garantir imunidade. Antes de ampliar ferramentas, adicionar avaliação
adversarial e autorização independente de ações. pgvector só será adotado mediante necessidade.
