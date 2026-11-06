# Tradução para revisão — NÃO ENVIADA (revisão após estudar a documentação v2)

**Para:** nishkarsh@hydradb.app  
**Assunto:** Re: HydraDB — feedback técnico com evidências do PoC Orbe/Neo4j GraphRAG

Olá, Nishkarsh!

Obrigado pelo contato e por ter observado as melhorias que fiz com Neo4j no meu portfólio. Fiquei genuinamente feliz em receber sua mensagem.

Estou desenvolvendo o Orbe, um assistente de IA para meu portfólio profissional, fundamentado em evidências. Sua mensagem me incentivou a criar um laboratório isolado para comparar nossa integração existente com o Neo4j ao **motor open-source HydraDB v0.3.0**, em vez de apenas executar uma demonstração genérica.

Testamos o mesmo contrato de evidências nos dois bancos, utilizando sete registros públicos selecionados do meu portfólio:
- **Paridade funcional:** 88/88 comparações de requisitos e 64/64 consultas de fontes específicas equivalentes com um adapter HydraDB. As 14 claims e 16 fontes selecionadas também sobreviveram aos testes de reinicialização HydraDB/MinIO, inclusive com imagens de contêiner fixadas por digest.
- **Compatibilidade de migração e Bolt:** sete das nove operações Cypher originais do Neo4j precisaram de adaptação. Reproduzimos o **exemplo JavaScript/Bolt publicado para o HydraDB self-hosted v0.3.0**, com `GRAPH_ID=default` e `MATCH` parametrizado. Em um teste adicional com versões controladas, **quatro versões do `neo4j-driver` JavaScript (5.28.3, 6.0.1, 6.1.0 e 6.2.0) falharam em todas as três tentativas cada (12/12 falhas)**. É importante notar que **todas executaram a mesma consulta no Neo4j de controle**, e a consulta também funcionou no HydraDB via HTTP. Nosso teste independente anterior com Python 6.4.1 passou 3/3. Ainda não identificamos a causa raiz.
- **Desempenho exploratório:** em uma pequena execução com cache aquecido e HydraDB usando MinIO, a mediana p50 de busca por uma competência foi 2,112 ms no HydraDB/HTTP contra 3,452 ms no Neo4j/Bolt; 1.024 chamadas apresentaram evidências equivalentes. Outra execução confirmou a direção da diferença de latência. Como transporte, formato das consultas e caches diferem, **isso não comprova que o motor HydraDB seja intrinsecamente mais rápido ou mais barato**.

Antes de responder, consultei também o **[guia BYOG v2 e migração do Neo4j](https://docs.hydradb.com/essentials/v2/bring-your-own-graph)** e a **[documentação dos SDKs v2](https://docs.hydradb.com/api-reference/v2/sdks)**. Esses materiais já explicam Cypher por HTTPS com `params`, IDs externos estáveis, importação em lotes com `MERGE`, índices e isolamento por collection. São orientações úteis, então não gostaria de perguntar o que já está documentado. Porém, **não testamos a API v2 gerenciada** e não queremos confundi-la com o motor **open-source v0.3.0** executado localmente.

Apliquei o **[guia de uso self-hosted v0.3.0](https://github.com/hydra-db/hydradb/blob/v0.3.0/USING-HYDRADB.md)** em novos grafos `default` e `lab`, removendo a verificação prévia de conexão do JavaScript. Nenhuma das mudanças resolveu o problema. Depois, repeti o exemplo parametrizado oficial com quatro versões fixadas do driver JavaScript, validando cada uma contra o Neo4j de referência. [Relatório, código e CI reproduzível](https://github.com/SladeSouzaSantos/phasscode-platform/blob/experiment/hydradb/docs/labs/hydradb-gate18-js-driver-version-matrix-2026-11-06.md).

Restaram duas perguntas especialmente relevantes:
1. O **exemplo JavaScript/Bolt publicado para o HydraDB self-hosted v0.3.0** falhou nas **quatro versões testadas do `neo4j-driver`**, embora cada uma tenha funcionado com Neo4j e a consulta tenha passado no HydraDB via HTTP; no teste anterior, o Python 6.4.1 também funcionou. Existe alguma **versão de driver Node.js/protocolo Bolt ou configuração de servidor/database oficialmente suportada** que devamos usar, ou alguma limitação conhecida dessa integração? O BYOG v2 via HTTPS seria a alternativa de integração recomendada?
2. Qual é a correspondência entre os recursos Cypher do **BYOG hospedado v2** e o motor open-source **v0.3.0**? Para esse uso com armazenamento de objetos, quais testes de falha durante escrita, recuperação ou bookmarks você priorizaria além de reinicializações normais?

Documentei a arquitetura, as adaptações do adapter, os testes bem-sucedidos e os erros observados, junto com as reproduções no GitHub Actions:

https://github.com/SladeSouzaSantos/phasscode-platform/blob/experiment/hydradb/docs/labs/hydradb-maintainer-feedback-2026-11-06.md

Uma observação prática: **não falo inglês**, então não conseguiria participar de uma chamada de voz. Gostaria muito de continuar nossa conversa **por e-mail**, usando tradução assistida, e compartilhar as reproduções dos testes.

Estou em transição de carreira, voltando a me dedicar integralmente ao desenvolvimento de software, e sigo estudando alguns aspectos internos de bancos de grafos. Fico aberto a correções sobre minha metodologia. Espero que a perspectiva de quem está desenvolvendo uma aplicação seja útil e agradeço mais uma vez pelo interesse no meu trabalho.

Atenciosamente,  
Pedro Santos

---

**Status:** RASCUNHO / NÃO ENVIADO. Nenhum endpoint gerenciado v2 foi chamado; todos os testes medidos utilizaram HydraDB open-source v0.3.0 em contêineres isolados. Branch `experiment/hydradb`; nenhuma alteração/deploy DEV ou MAIN.

**Apoio para revisão:** [matriz oficial v2 versus motor v0.3.0](hydradb-v2-docs-review-2026-11-06.md) · [versão original em inglês](hydradb-maintainer-email-draft.md).
