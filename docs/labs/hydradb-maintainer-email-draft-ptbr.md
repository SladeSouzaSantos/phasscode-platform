# Tradução para revisão — não enviada

**Para:** nishkarsh@hydradb.app  
**Assunto:** Re: HydraDB — feedback prático de uma integração Neo4j/GraphRAG

Olá, Nishkarsh!

Obrigado pela mensagem e por ter observado o trabalho com Neo4j no meu portfólio. Fiquei genuinamente feliz com o seu contato — é muito significativo saber que alguém que está desenvolvendo um banco de grafos se interessou pelo que venho construindo.

Estou desenvolvendo o Orbe, um assistente de IA para meu portfólio profissional que utiliza evidências verificáveis. Nossa integração GraphRAG já usa Neo4j, então sua mensagem me incentivou a testar o HydraDB v0.3.0 com o contrato de uma aplicação real, em vez de apenas executar uma demonstração genérica.

Preparei um laboratório completamente isolado com Neo4j e HydraDB, utilizando registros públicos do meu portfólio e workflows reproduzíveis no GitHub Actions. Estas foram algumas observações iniciais:

- **Resultados funcionais:** com um adapter específico para HydraDB, IDs numéricos e relacionamentos explícitos entre claims e fontes, reproduzimos **88/88 comparações de requisitos e 64/64 consultas de fontes específicas** de sete registros públicos do portfólio. Em testes delimitados de durabilidade, 14 claims e 16 fontes também sobreviveram a reinicializações do HydraDB e do MinIO.
- **Diferenças na adaptação:** sete das nossas nove operações Cypher originais do Neo4j foram rejeitadas pelo HydraDB sem modificações.
- **Investigação Bolt/driver:** o driver JavaScript Neo4j 6.2.0 apresentou resultados inconsistentes entre execuções: sucesso ocasional em `MATCH` simples, mas falhas frequentes `ERR_OUT_OF_RANGE`, `InvalidSyntax` e de roteamento. Em teste independente com o mesmo motor, o **driver Python Neo4j 6.4.1 retornou os três valores esperados (inclusive `MATCH` parametrizado) com a base `default`, com base omitida ou com roteamento para `default`**; com `lab`, falhou. Isso sugere uma interação entre cliente e configuração que merece investigação, e não uma falha geral do Bolt. Temos reproduções mínimas versionadas dos dois clientes.
- **Documentação:** casos simples positivos e negativos de `IN` e `IS NULL` funcionaram por HTTP, embora a documentação da versão v0.3.0 consultada os liste como não suportados.
- **Desempenho preliminar F4.3:** em um teste delimitado, com **HydraDB armazenando no MinIO** e cache aquecido, a mediana p50 para uma competência foi **2,112 ms (HydraDB/HTTP) contra 3,452 ms (Neo4j/Bolt)**; para quatro competências, **7,427 contra 11,562 ms**. As **1.024 chamadas medidas** retornaram evidências equivalentes. Como transporte, consultas e armazenamento diferem, **não estamos afirmando superioridade intrínseca do motor nem menor custo operacional**.

Preparei um estudo de caso técnico com decisões de arquitetura, scripts, workflows, resultados e limitações:  
https://github.com/SladeSouzaSantos/phasscode-platform/blob/experiment/hydradb/docs/labs/hydradb-maintainer-feedback-2026-11-06.md

Gostaria especialmente de conhecer sua orientação sobre o funcionamento esperado do Bolt com diferentes nomes de banco/namespace, o suporte a parâmetros e as estratégias de migração Cypher para aplicações GraphRAG centradas em evidências.

Uma observação: **não falo inglês**, então uma chamada de voz não seria viável para mim. Ficaria muito satisfeito em continuar nossa conversa **por e-mail**, utilizando tradução assistida, e compartilhar testes adicionais ou reproduções mínimas.

Estou também em transição de carreira, retornando a uma atuação dedicada ao desenvolvimento de software, e continuo estudando alguns aspectos internos dos bancos de grafos. Estou aberto a correções e sugestões para aperfeiçoar meus testes. Minhas observações são do ponto de vista de um desenvolvedor de aplicações, e espero que possam ser úteis ao projeto.

Muito obrigado novamente pelo contato!

Atenciosamente,  
Pedro Santos

---

**Status: apenas tradução de referência para revisão pessoal. NADA foi enviado.** O arquivo principal em inglês está em [hydradb-maintainer-email-draft.md](hydradb-maintainer-email-draft.md). Manter as duas versões alinhadas antes do envio.
