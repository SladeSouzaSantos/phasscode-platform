# Orbe v4 — apresentação profissional, recuperação e fontes

Base da correção: `dev/d63cc8d`, com árvore limpa antes das alterações. Escopo restrito a
conhecimento, comportamento, recuperação, fontes, testes e documentação. Os 31 IDs da base
foram preservados e o OpenAPI/DTO do chat permanece igual.

## Diagnóstico

O comportamento observado tinha quatro causas combinadas:

1. `v4.md` exigia uma frase fixa de não confirmação; `v3.md` reforçava qualificadores defensivos.
2. Conteúdos e títulos da base repetiam “declarado”, ausência de comprovação e limitações
   genéricas, mesmo para fatos profissionais já registrados.
3. A busca considerava menções de tecnologias em qualquer contexto: competências, cursos,
   roadmap e implementações concorriam sem metadados que diferenciassem seu uso.
4. `LangChainChatProvider` acumulava como fontes todos os documentos enviados ou encontrados
   pelas ferramentas, sem comparar com a resposta final. “Testando!” e vida afetiva caíam na
   mesma recusa geral. Além disso, o bootstrap ainda selecionava v3 sem auth/reuniões.

Agora v4 é o prompt atual em todas as implantações. Isso não habilita login, calendário ou
ferramentas de reunião: as configurações e o header de capacidade continuam necessários.
Não foi adicionada uma instrução para responder positivamente ou aceitar fatos do visitante.

## Arquivos e finalidade

| Arquivo(s)                                                                        | Alteração e finalidade                                                                                                                                         |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `knowledge/portfolio.json`                                                        | Conteúdo profissional direto, categorias, tecnologias por registro, papel/visibilidade, relacionamentos e períodos estruturados. Mantém conflitos reais e IDs. |
| `knowledge/SOURCES.md`                                                            | Preserva proveniência e dúvidas específicas; registra vínculos entre competências, experiências e projetos sem transferir stack/autoria.                       |
| `knowledge/README.md`                                                             | Documenta a curadoria, metadados opcionais e interpretação dos períodos.                                                                                       |
| `apps/orbe-node/prompts/v4.md`                                                    | Tom natural, lacunas pertinentes, recomendações de projetos e manutenção das defesas/regras de reunião.                                                        |
| `apps/orbe-node/src/domain/ports.ts`                                              | Metadados internos opcionais, acesso aos períodos e referência temporal; sem novos campos HTTP.                                                                |
| `apps/orbe-node/src/adapters/knowledge.ts`                                        | Validação dos metadados/relacionamentos, ranking por tecnologia e intenção; mantém busca em registros antigos sem metadados.                                   |
| `apps/orbe-node/src/knowledge-matching.ts`                                        | Normalização e reconhecimento de tecnologias compartilhados entre recuperação e fontes. Java continua distinto de JavaScript.                                  |
| `apps/orbe-node/src/application/sources.ts`                                       | Seleção determinística de fontes que sustentam o texto, projeção no DTO existente e preferência por links públicos apropriados.                                |
| `apps/orbe-node/src/adapters/langchain-provider.ts`                               | Retém proveniência dos trechos realmente enviados, transmite metadados/cálculos dentro do orçamento e seleciona fontes depois da resposta.                     |
| `apps/orbe-node/src/adapters/mock-provider.ts`                                    | Aplica a mesma seleção de fontes nas respostas explicitamente simuladas.                                                                                       |
| `apps/orbe-node/src/domain/experience.ts`                                         | União de intervalos mensais, gaps, confirmação de vínculo aberto e distinção entre carreira, software e tempo por empresa.                                     |
| `apps/orbe-node/src/application/experience-context.ts`                            | Insere dados calculados para perguntas de duração; recalcula após recorte e omite total completo se faltarem vínculos no contexto.                             |
| `apps/orbe-node/src/domain/security.ts`                                           | Respostas breves para teste e vida afetiva, mais reconhecimento de continuações; injection mantém prioridade.                                                  |
| `apps/orbe-node/src/application/context.ts`                                       | Exclui esses turnos do histórico elegível, inclusive em conversas antigas.                                                                                     |
| `apps/orbe-node/src/application/chat.ts`                                          | Integra políticas, referência temporal, registros de experiência e versão atual v4; preserva token, histórico, limites e ações opt-in.                         |
| `apps/orbe-node/src/main.ts`                                                      | Carrega o prompt da versão atual, independentemente de auth/reuniões.                                                                                          |
| `evaluation/evaluator.ts`                                                         | Reconhece repositório/demo documentados como URLs legítimas da mesma fonte; continua recusando URL inventada ou privada usada indevidamente.                   |
| `tests/domain.test.ts`, `tests/evaluation.test.ts`                                | Atualizam verificações obsoletas de tom e cobrem proveniência com links diretos.                                                                               |
| `tests/llm-adapter.test.ts`                                                       | Mantém testes de orçamento/contexto com respostas sintéticas que efetivamente usam as fontes; acrescenta busca irrelevante e cálculo no transporte HTTP.       |
| `tests/knowledge-relevance.test.ts`                                               | Java/SIGAA/Spring, tecnologias de projetos, fontes relevantes, links e validação/compatibilidade de metadados.                                                 |
| `tests/experience-periods.test.ts`                                                | Sobreposições, gaps, precisão mensal, datas desconhecidas, papéis mistos e base real.                                                                          |
| `tests/orbe-social-policy.test.ts`                                                | Saudações, testes, vida afetiva, continuações e preservação de injection/histórico.                                                                            |
| `tests/orbe-professional.test.ts`                                                 | Perguntas de vaga Java, Spring, SIGAA, projeto Python, sistema privado, formação, continuidade e dados de duração.                                             |
| `scripts/smoke.mjs`                                                               | Confere que o processo compilado responde com a versão v4 sem habilitar um provedor real.                                                                      |
| `README.md`, `docs/api/frontend-integration.md`, `docs/api/phase3-integration.md` | Explicam a versão ativa e o significado das fontes, sem exigir mudança no frontend.                                                                            |
| `docs/testing/README.md`, este relatório                                          | Registram diagnóstico, cenários, resultados, limites e roteiro manual não executado.                                                                           |

## Exemplos antes/depois

Os textos abaixo ilustram o comportamento desejado a partir dos fatos da base. **Não são
resultados de uma avaliação real de LLM nesta correção.** Os testes determinísticos verificam
registros, instruções, transporte, fontes e políticas; não comprovam qualidade semântica de todos
os modelos externos.

**Qualificações para vaga Java**

Antes: “Pedro declara [...] competências autodeclaradas [...] sem comprovação de certificações”.

Depois: “Pedro trabalhou com Java no desenvolvimento e na manutenção do SIGAA, usando Hibernate,
JBoss e PostgreSQL. Também tem um projeto público de estudo com Spring Boot, Spring Data JPA e H2:
o Webservice Spring Boot e JPA. Posso apresentar esse projeto ou detalhar sua experiência profissional.”

O exemplo não transfere Spring Boot para o emprego no SIGAA. As fontes do cenário de teste são
`experiencia-sig` e `webservice-springboot-jpa`, com o repositório específico do projeto.

**Tempo de experiência**

Antes: “Não é possível afirmar [...] não posso confirmar [...] interrupções ou sobreposições”.

Depois: “A trajetória inclui o estágio na ACRUX, desenvolvimento de sistemas acadêmicos na SIG
Software e atuação com software junto a atividades de engenharia na Geowellex e na Greencity.
Na Greencity, o vínculo registrado começa em fevereiro de 2019. Posso separar os períodos por
empresa ou detalhar a experiência com Java.”

Se a pergunta pedir duração Java, o cálculo dos dois vínculos exclusivos registrados soma
aproximadamente **19 meses**, sem sobreposição. Isso descreve os períodos com datas disponíveis,
não toda a experiência em software nem senioridade. Para Greencity, até a última confirmação de
outubro/2026, são aproximadamente **92 meses de vínculo**, sem atribuí-los integralmente a Java
ou desenvolvimento. Datas com precisão mensal usam diferença entre meses, não dias contratuais.

**Sistema privado/de terceiros**

Depois: “No SIGAA, Pedro participou do desenvolvimento e da manutenção de funcionalidades de
sistemas acadêmicos. O sistema pertence a terceiros; essa atuação pode ser apresentada sem um
repositório pessoal do produto.” A ausência de link não invalida as atividades registradas.

**Mensagens breves e pessoais**

- “Testando!” recebe “Estou por aqui! Posso apresentar as experiências, os projetos e as
  tecnologias de Pedro. O que você gostaria de conhecer?”
- “Ele tem namorada?” recebe “Não tenho informações públicas sobre a vida afetiva de Pedro.
  Posso apresentar sua trajetória profissional, projetos ou formas de contato.”
- Ataques que começam com saudação, teste ou pergunta pessoal continuam sujeitos à recusa de
  injection. Perguntas profissionais acompanhadas de saudação continuam no fluxo normal.

## Associações e fontes

- **Java:** ACRUX/SIGAA como experiência; Spring Boot/JPA como estudo público. Java do roadmap
  da plataforma não é promovido a implementação atual.
- **Python:** HSP Simulator com FastAPI e simulação solar; SDGP como contexto profissional
  sem inventar repositório público. Não transferir Python para o ReserGas, cuja stack é Flutter/Dart.
- **Flutter:** ReserGas público e SDGP profissional privado, com papéis distintos.
- **React/TypeScript:** repositório do portfólio; não atribuir React aos laboratórios HTML/CSS/JS.
- **IA/LangChain:** plataforma e laboratórios próprios; contribuições com material de terceiros
  preservam a atribuição, sem autoria original exclusiva.
- **Docker:** apenas os projetos cujos arquivos já inspecionados na proveniência sustentam essa
  tecnologia; não atribuir infraestrutura a qualquer projeto pelo contexto do proprietário.

A seleção usa pergunta, texto final, assunto/tecnologias e novidade dos fatos. Aplica-se somente
a documentos que couberam no contexto e foram realmente enviados, incluindo ferramentas.
Trechos recuperados e depois descartados não viram fonte. A preferência é por poucas fontes úteis,
com limite máximo de dez do contrato, sem corte obrigatório em três. Há fallback lexical para
registros antigos sem metadados; vínculos explicitamente curados prevalecem quando presentes.

URLs de repositório/demo vêm dos registros; nenhuma URL é construída a partir de nomes.
Agregados de vários sites/laboratórios sem um destino primário inequívoco ficam sem URL de fonte;
links individuais já registrados no conteúdo podem ser usados na resposta pertinente. Não houve
verificação de disponibilidade ao vivo de repositórios ou demos nesta correção.

## Validação

| Verificação                   | Resultado                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------- |
| `npm run lint`                | Aprovado, sem avisos.                                                            |
| `npm run format:check`        | Aprovado.                                                                        |
| `npm run typecheck`           | Aprovado.                                                                        |
| `npm run contracts:check`     | Aprovado, sem alteração do OpenAPI.                                              |
| `npm test`                    | **429 testes aprovados**, 29 arquivos; provedores simulados.                     |
| `npm run build`               | Aprovado.                                                                        |
| `npm run test:infrastructure` | **29 testes aprovados**, ferramentas simuladas e sem serviços reais.             |
| `npm run smoke`               | Aprovado: processo compilado, health, readiness, v4 e dois turnos HTTP com mock. |

Total de **458 testes aprovados** nesta correção. Nenhuma chamada a LLM real, alteração de banco
ou execução de migrations. Não foram executadas as integrações que exigem PostgreSQL/Redis real,
o teste de navegador com OIDC ou deploy; não são apresentados como homologados nesta revisão.

Falhas encontradas e corrigidas durante o trabalho:

- Testes antigos exigiam “autodeclarados” e fontes acumuladas para respostas sintéticas sem fatos.
  As asserções passaram a distinguir cursos de credenciais e a atribuir somente fontes usadas.
- O filtro por tecnologia inicialmente excluía registros antigos cujo único sinal estava no
  conteúdo. Foi restaurada a compatibilidade lexical quando não há metadados.
- Tipos opcionais de metadados foram alinhados à saída do Zod com `exactOptionalPropertyTypes`.
- Dois avisos de variáveis não utilizadas foram corrigidos; nenhuma regra de lint foi relaxada.

## Limites e confirmações ainda necessárias

O tom real depende do modelo; não foram feitas chamadas a OpenRouter, Gemini, Groq ou Cohere.
Não há garantia determinística de cada frase gerada: prompt, dados e seleção de fontes são camadas
de controle, não um auditor semântico completo. Formação e vínculos preservam as confirmações
anteriores; não houve atualização inventada por passagem do tempo.

Continuam específicas: atribuição/stack do Lithology; equivalência entre SDGP e Greencity
Solutions; datas divergentes da UnP; datas de conclusão não informadas; certificações profissionais
não registradas e formações provisórias do catálogo v2. Esses pontos estão em `knowledge/SOURCES.md`
e só devem afetar respostas em que forem pertinentes. Não é necessário fornecer código privado
para registrar experiência profissional.

Não houve alteração em `.env`, credenciais, contratos HTTP, migrations, bancos, frontend, branch
`main` ou módulos Auth/Calendar/worker/notificações. Não houve commit, push, merge, PR ou deploy.
As integrações que exigem bancos e contas externas não foram reexecutadas; as suítes locais
incluem regressões de auth, reuniões, fallback, privacidade e compatibilidade do chat.

## Próximas melhorias fora deste escopo

Separar registros agregados de demos, medir precisão/recall com perguntas reais anonimizadas e
avaliar recuperação vetorial somente se os resultados justificarem. Novos fatos devem vir do
proprietário ou de material primário identificado, sem atribuir stacks por associação.

Homologação manual proposta, **não executada**: repetir a conversa da Izabel; perguntar sobre
Spring Boot, SIGAA, Docker/Python/Flutter e sistema privado; seguir com “Pode mostrar o projeto?”
e “Tem o link?”; comparar duração Java e Greencity; perguntar sobre formação trancada, teste e
vida afetiva; verificar fontes e recusas de injection. Para testar uma LLM real, obter antes
autorização com destinos, conteúdo e limite de chamadas definidos.
