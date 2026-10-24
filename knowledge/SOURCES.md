# Fontes da base pública e profissional

Curadoria ampliada em **21/10/2026**, no fuso `America/Sao_Paulo`. O catálogo contém **31
documentos**: perfil e competências, quatro experiências, sete formações, cursos/idiomas e projetos.
Os oito IDs originais foram preservados. O conteúdo é um retrato das fontes consultadas; a API não
atualiza a base automaticamente nem faz scraping durante o chat.

O proprietário autorizou o uso do site antigo, perfil/repositórios GitHub, LinkedIn e currículo para
esta ampliação. Os registros profissionais podem ser apresentados diretamente, respeitando sua
origem, período e escopo. Telefone, endereço residencial, documentos pessoais e outros dados privados
do currículo não foram incorporados.

## Revisão de conteúdo e comportamento do Orbe v4

Esta revisão reorganiza a base já consultada, preserva os 31 IDs e separa conteúdo para respostas
de notas de curadoria. Fontes, commits e divergências continuam registrados neste arquivo;
as respostas deixam de repetir comentários genéricos sobre ausência de auditoria. Isso não altera
os fatos nem autoriza inferir certificações, senioridade, autoria exclusiva ou resultados.

O proprietário informou, no pedido desta revisão, que testou a integração do chat no frontend
com sucesso. Essa informação substitui apenas a descrição antiga de Orbe com respostas predefinidas
no registro `web-portfolio-v2`; não demonstra integração de login, reuniões ou administração no
frontend. O registro `phasscode-platform` também passa a refletir o código local de fallback de LLMs,
preservando a diferença entre implementação e habilitação/homologação de cada serviço externo.

Nenhuma nova consulta a LinkedIn, execução de projeto de terceiros, chamada a LLM ou verificação de
disponibilidade dos links ocorreu nesta revisão editorial. Repositórios e demos são URLs já
registradas nas fontes abaixo; apresentar o endereço não significa afirmar que está online agora.

### Metadados e associações de tecnologias

- `technologies` identifica tecnologias registradas naquele projeto ou experiência. O perfil geral
  de competências não recebe essa lista: conhecer Spring Security, Quarkus ou Kubernetes não
  demonstra uso em todos os projetos, nem experiência profissional ou certificação nessas áreas.
- `category` distingue experiência profissional, projeto pessoal ou estudo quando a origem permite
  essa classificação. A categoria não é preenchida onde o contexto profissional/pessoal é incerto.
  O laboratório RAG mantém o crédito a erickwendel; não se afirma contribuição original de Pedro.
- `role` explicita a participação registrada. No SIGAA, desenvolvimento e manutenção de funcionalidades
  de um sistema de terceiros não representam propriedade ou criação exclusiva do produto.
- `visibility` descreve a disponibilidade do artefato/código ou sua natureza de terceiro, e não
  restringe a leitura do registro profissional: toda esta base é pública. `private` significa que
  o trabalho registrado não tem repositório ou demo pública identificados nesta curadoria.
- `repositoryUrl` e `demoUrl` distinguem código e demonstração. Em projetos públicos, `url` aponta
  diretamente a um desses destinos. Fontes documentais de experiências e formações continuam
  separadas; SDGP, Lithology e o panorama atualizado não recebem links genéricos como se fossem
  repositórios ou provas públicas das atualizações feitas pelo proprietário.
  Os agregados `laboratorios-frontend` e `websites-institucionais` não recebem uma URL primária:
  uma demo Monibank não sustentaria uma resposta sobre Mochila JS, assim como o site Siberian
  não é o website Greencity. Os links específicos já publicados permanecem no conteúdo.
- `relatedProjectIds` vincula Greencity ao SDGP conforme o currículo. Não vincula automaticamente
  Lithology à ACRUX/Geowellex nem o projeto de estudo Spring Boot a uma entrega profissional no SIGAA.
- `experiencePeriod` registra apenas os meses e áreas já presentes no histórico: ACRUX
  `2014-02`–`2015-01`, SIG `2016-06`–`2017-02`, Geowellex `2017-03`–`2018-10` e Greencity desde
  `2019-02`, com atuação atual confirmada em `2026-10-21`. Geowellex e Greencity combinam software
  e atividades de engenharia/dados geológicos; seus períodos não demonstram dedicação integral
  ao desenvolvimento. Datas de mês não informam dias exatos nem duração contratual exata.

| Associação para respostas       | Evidência específica e distinção                                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Java profissional               | ACRUX: Java/H2/NetBeans; SIGAA: Java/Hibernate/JBoss/PostgreSQL. Currículo p. 2 e `experiencia.json`.                                                                     |
| Java / Spring Boot em estudo    | `webservice-springboot3-jpa`: `pom.xml` e `UserResource.java`; exemplo de consultas com Spring Data JPA/H2, sem CRUD completo ou autenticação.                            |
| Python / APIs / simulação solar | `hsp_simulator`: dependências, `api.py` e `SolarRepository`; FastAPI/Pydantic/Streamlit e Docker. Django/JWT aparecem em outro projeto, `sistema_gestao_empresarial_api`. |
| Flutter / engenharia            | ReserGas tem repositório Flutter/Dart; SDGP é experiência profissional com tecnologias descritas no CV e sem código público identificado.                                 |
| React / TypeScript              | `web-portfolio-v2`: `package.json` e frontend; não atribuir React ao backend Django por haver um frontend separado.                                                       |
| IA / LangChain                  | PHASSCODE Platform usa LangChain; LangChain Intro é estudo LangChain/LangGraph; o laboratório RAG credita material de terceiros.                                          |
| Docker / infraestrutura         | Código local da PHASSCODE Platform e configurações presentes em HSP Simulator e Greencity API Orçamento; isso não confirma operação em produção ou uso de Kubernetes.     |

As lacunas remanescentes são específicas: data de conclusão FacPrisma, mês de conclusão UnP,
atribuição/stack de Lithology, equivalência SDGP/Greencity Solutions e ERP/repositório público.
Essas lacunas só precisam aparecer na resposta quando forem relevantes à pergunta.

## Fontes e acesso

- Site antigo: [PHASSCODE](https://phasscode.com/), lido sem login em 21/10/2026, com catálogos
  [experiência](https://phasscode.com/assets/json/experiencia.json),
  [formação](https://phasscode.com/assets/json/formacao.json) e
  [projetos](https://phasscode.com/assets/json/portfolio.json). A revisão desses JSONs também foi
  conferida pelo conector GitHub no repositório `website-portfolio`.
- Competências do site: arquivos públicos `skills_back-end.json`, `skills_front-end.json`,
  `skills_database.json`, `skills_frameworks.json`, `skills_methodologies.json` e
  `skills_tools.json` sob [assets/json](https://phasscode.com/assets/json/skills_back-end.json).
  As barras/porcentagens de habilidade são apresentação autodeclarada, não medidas objetivas;
  seus números não foram importados.
- Repositórios: consulta pelo conector GitHub, usando somente fontes com visibilidade pública.
  A lista da conta pode conter projetos de estudo e código de terceiros; posse do repositório
  não demonstra autoria original exclusiva.
- LinkedIn: [perfil solicitado](https://www.linkedin.com/in/phasscode/) e
  [educação](https://www.linkedin.com/in/phasscode/details/education/) retornaram bloqueio de
  acesso automatizado (HTTP 999). Nenhum curso, emprego ou diploma foi atribuído a conteúdo
  supostamente lido nessas páginas. A URL do perfil permanece um canal público de contato.
- Currículo autorizado: **Pedro_Santos_Desenvolvedor.pdf**, quatro páginas, lido localmente.
  Metadado de modificação: **28/10/2025**; isso não comprova data de atualização de cada
  declaração. O proprietário avisou que o arquivo pode estar desatualizado. SHA-256:
  `79036dd20c6b32c9ae124964301246457e7955c69c39ce1daaed9c7771eafc56`.
  O PDF, seu texto integral, o caminho pessoal e dados privados não foram versionados.
  Página 1: nome, formação e idiomas; página 2: experiências e SDGP; página 3:
  Lithology, ReserGas e início das competências/cursos; páginas 3–4: estudos complementares.

## Confirmação atual do proprietário e precedência

Em **21/10/2026**, o proprietário esclareceu diretamente nesta sessão:

- Atua atualmente na **Greencity Sustainable Energy**.
- Concluiu **somente a pós-graduação em Segurança da Informação na FacPrisma**. A data de
  conclusão não foi informada; não se generaliza a conclusão às outras áreas citadas no CV.
- **Trancou Ciência da Computação na UNISUL nas últimas disciplinas**. Sua nova previsão de
  conclusão é **dezembro de 2027**; não se presume matrícula ativa, conclusão ou garantia de
  cumprimento da previsão.

Essas declarações atuais são a fonte prioritária para os três estados corrigidos e substituem as
informações desatualizadas do currículo/site. O início histórico na Greencity (fev/2019), instituição
UNISUL e início de curso (jul/2023) continuam atribuídos às fontes históricas. A confirmação atual
não atualiza automaticamente os demais campos históricos do currículo.

Regras de precedência: aplicar a confirmação direta mais recente aos campos corrigidos; preservar
as demais informações históricas com atribuição; registrar divergências não resolvidas; nunca
inferir uma data de conclusão não informada ou transformar previsão em conclusão. A previsão antiga
de dez/2026 para UNISUL e a descrição ampla de Computação/TIC com previsão jul/2026 para FacPrisma
ficam registradas apenas como **histórico substituído**, sem representar o status atual.

## Revisões imutáveis consultadas

| Repositório público                                                                                                                                | Commit                                     | Data do commit (UTC) |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------- |
| [web-portfolio-v2](https://github.com/SladeSouzaSantos/web-portfolio-v2/tree/2c8835fe744d494ef21978c0f5d801baf7b22149)                             | `2c8835fe744d494ef21978c0f5d801baf7b22149` | 21/10/2026 17:42:29  |
| [website-portfolio](https://github.com/SladeSouzaSantos/website-portfolio/tree/12e65582882c3c6bed9981fd2fd2447423f808ca)                           | `12e65582882c3c6bed9981fd2fd2447423f808ca` | 15/05/2026           |
| [Perfil SladeSouzaSantos](https://github.com/SladeSouzaSantos/SladeSouzaSantos/tree/422002e56e1f0a8f47acc40977b3501cdcaad95d)                      | `422002e56e1f0a8f47acc40977b3501cdcaad95d` | 08/02/2026 19:03:23  |
| [integracao_apis_llms](https://github.com/SladeSouzaSantos/integracao_apis_llms/tree/98be28bd7d4f2d66a903aeaae68a0b6ac225ce0c)                     | `98be28bd7d4f2d66a903aeaae68a0b6ac225ce0c` | 25/07/2026 20:03:06  |
| [reser_gas](https://github.com/SladeSouzaSantos/reser_gas/tree/2a0f2c8e791a8541b905808b66d97e373340e5b7)                                           | `2a0f2c8e791a8541b905808b66d97e373340e5b7` | 20/10/2025 21:10:59  |
| [hsp_simulator](https://github.com/SladeSouzaSantos/hsp_simulator/tree/c7da7eab1e7a0f67a7d45007f1d8bd3a81e4855a)                                   | `c7da7eab1e7a0f67a7d45007f1d8bd3a81e4855a` | 23/02/2026 17:04:26  |
| [greencity-api-orcamento](https://github.com/SladeSouzaSantos/greencity-api-orcamento/tree/984af242d75fc85868519f5cc01a12d77a992745)               | `984af242d75fc85868519f5cc01a12d77a992745` | 23/02/2026 17:10:26  |
| [sistema_gestao_empresarial_api](https://github.com/SladeSouzaSantos/sistema_gestao_empresarial_api/tree/a5f812365019855be2f57c9476963544593235db) | `a5f812365019855be2f57c9476963544593235db` | 07/01/2026 05:15:24  |
| [webservice-springboot3-jpa](https://github.com/SladeSouzaSantos/webservice-springboot3-jpa/tree/bec22f975ca798d0472f539eea2193c3bdccb0ec)         | `bec22f975ca798d0472f539eea2193c3bdccb0ec` | 21/04/2024 01:51:56  |
| [embeddings-neo4j-rag](https://github.com/SladeSouzaSantos/embeddings-neo4j-rag/tree/a281458176b95cd82daf20ca121456bc60a6ec87)                     | `a281458176b95cd82daf20ca121456bc60a6ec87` | 24/06/2026 22:05:16  |

A PHASSCODE Platform é descrita pela implementação local e pelo briefing autorizado. A fundação
foi publicada em `dev` no commit `984d0e9f0a7fb0f9503dbb8631176e1926b21e59` e integrada à
[main no commit e78ef0a](https://github.com/SladeSouzaSantos/phasscode-platform/commit/e78ef0ac10c9c9e8b213c3dda864d3cba2de230a).
Na curadoria original, o incremento de fechamento/ampliação da Fase 2 ainda estava local.
Os estados posteriores de código são acompanhados em [progresso](../docs/PROGRESS.md); o teste de
integração do chat relatado pelo proprietário nesta revisão é registrado separadamente acima.
Publicação de código, por si só, não demonstra deploy de todos os módulos.

## Perfil e registros originais

| ID estável               | Origem e conteúdo                                                                                                                                                                                                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `web-portfolio-v2`       | README.md, package.json, src/App.tsx, src/components/OrbAssistant.tsx e ChestAccess.tsx na revisão acima, para stack e identidade visual. Integração posterior do chat testada pelo proprietário no pedido desta revisão; não estender essa confirmação ao login. Domínios informados no briefing. |
| `phasscode-platform`     | [README](../README.md), [progresso](../docs/PROGRESS.md), implementação local e briefing. Distingue chat disponível dos módulos planejados e da integração separada do frontend.                                                                                                                   |
| `pedro-santos`           | README do perfil GitHub, perfil.ts do frontend v2, site antigo, CV p. 1 e confirmação atual do proprietário em 21/10/2026. Nome e apresentação autodeclarados; atuação atual na Greencity confirmada nesta sessão.                                                                                 |
| `competencias-publicas`  | perfil.ts, README do perfil e catálogos skills_* do site antigo. Tecnologias autodeclaradas; sem percentuais, certificações ou tempo de experiência inferidos.                                                                                                                                     |
| `contato-publico`        | perfil.ts e README do perfil GitHub. GitHub, LinkedIn, site e e-mail já publicados pelo autor; nenhum telefone/endereço do CV. Nenhum contato foi enviado.                                                                                                                                         |
| `trajetoria-a-confirmar` | CV pp. 1–4, catálogos históricos e confirmação direta do proprietário de 21/10/2026. Reconhece vínculo atual Greencity, conclusão de Segurança da Informação/FacPrisma e CC trancada com previsão dez/2027; mantém apenas pendências específicas restantes.                                        |
| `smart-model-router`     | integracao_apis_llms/smart-model-router-gateway: package.json, src/server.ts e src/openrouterService.ts. O código implementa POST /chat; o exemplo /v1/chat/completions no README geral diverge e não foi usado como contrato real.                                                                |
| `langchain-intro`        | integracao_apis_llms/langchain-intro: package.json, src/graph/graph.ts e árvore tests/. Laboratório StateGraph com uppercase/lowercase/fallback. Testes presentes não significam executados nesta curadoria.                                                                                       |

## Experiência profissional registrada

Fonte comum: [experiencia.json do site](https://phasscode.com/assets/json/experiencia.json),
[arquivo preservado no GitHub](https://github.com/SladeSouzaSantos/website-portfolio/blob/12e65582882c3c6bed9981fd2fd2447423f808ca/build-website/assets/json/experiencia.json)
e currículo p. 2. O catálogo de projetos complementa a participação no SIGAA; Lithology consta
na p. 3 do CV. Para o vínculo atual Greencity, prevalece a confirmação direta do proprietário em
21/10/2026, conforme a regra de precedência acima.

| ID                      | Cargo, período e escopo declarado                                                                                                                                | Status de interpretação                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `experiencia-acrux`     | Estagiário Programador de Sistemas, fev/2014–jan/2015; software de calhas, Java/H2/NetBeans, Scrum.                                                              | Histórico profissional; não associar o nome Lithology ao estágio sem esclarecer a divergência.                                    |
| `experiencia-sig`       | Desenvolvedor de Sistemas na SIG Software e Consultoria em TI, jun/2016–fev/2017; SIGAA, Java/Hibernate/JBoss/PostgreSQL, Scrum, revisão/testes/documentação.    | Participação declarada; não atribuir autoria exclusiva do SIGAA.                                                                  |
| `experiencia-geowellex` | Mud Logging/Desenvolvedor de Sistemas, mar/2017–out/2018; estoque web HTML/CSS/JavaScript/PHP/MySQL e dados geológicos.                                          | Histórico declarado; associação de Lithology tem divergência entre fontes.                                                        |
| `experiencia-greencity` | Engenheiro de Projetos Fotovoltaicos/Desenvolvedor Web e Mobile, início histórico fev/2019; aplicativo Flutter e backends Python/PHP, PDF e projetos de energia. | Atuação atual confirmada diretamente pelo proprietário em 21/10/2026; cargo/início/atividades permanecem atribuídos ao histórico. |

## Formação e estudos registrados

Fonte comum dos seis primeiros cursos:
[formacao.json](https://phasscode.com/assets/json/formacao.json),
[arquivo preservado](https://github.com/SladeSouzaSantos/website-portfolio/blob/12e65582882c3c6bed9981fd2fd2447423f808ca/build-website/assets/json/formacao.json)
e currículo p. 1. Não se exige um diploma verificável para relatar a declaração autorizada; o status
deve ser mantido conforme a fonte prioritária, sem converter previsão em conclusão. As atualizações
atuais de UNISUL e FacPrisma vêm da confirmação direta do proprietário, conforme a precedência acima.

| ID                          | Curso e instituição                                                    | Status preservado                                                                                                                                                                                           |
| --------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `formacao-computacao`       | Bacharelado Ciência da Computação, UNISUL.                             | Confirmação do proprietário em 21/10/2026: trancado nas últimas disciplinas, nova previsão dez/2027. Substitui status antigo e previsão dez/2026 do CV; não inferir matrícula ativa ou graduação concluída. |
| `formacao-gestao-ti`        | Tecnólogo Gestão da Tecnologia da Informação, UNIBF.                   | Site: abr/2024–ago/2025; CV: conclusão ago/2025. Conclusão declarada.                                                                                                                                       |
| `formacao-eletrotecnica`    | Técnico Eletrotécnica, Escola Politécnica Brasileira.                  | Site: out/2020–out/2022; CV: conclusão out/2022.                                                                                                                                                            |
| `formacao-energia-eletrica` | Pós-graduação Engenharia Elétrica e de Sistema(s) de Energia, Unyleya. | Site: set/2018–set/2020; CV: conclusão set/2020.                                                                                                                                                            |
| `formacao-eolica`           | Especialização Técnica Energia Eólica, CTGAS-ER.                       | Site: ago/2016–set/2017; CV: conclusão set/2017.                                                                                                                                                            |
| `formacao-petroleo`         | Engenharia de Petróleo e Gás, Universidade Potiguar/UnP.               | Conclusão declarada; CV: dez/2014; site: fev/2010–fev/2015. Divergência de mês/ano preservada, sem escolher uma fonte como diploma oficial.                                                                 |
| `formacao-prisma`           | Pós-graduação em Segurança da Informação, FacPrisma.                   | Confirmação do proprietário em 21/10/2026: somente esta pós concluída, sem data de conclusão informada. Descrição ampla/previsão jul/2026 do CV substituída para o status; não concluir outras áreas.       |
| `cursos-declarados`         | Cursos Alura, DIO e Udemy resumidos por área.                          | CV pp. 3–4; cursos declarados sem datas/links de credenciais verificados. Não equivalem automaticamente a certificação de fornecedor.                                                                       |
| `idiomas-declarados`        | Português fluente; espanhol e inglês básicos em leitura.               | CV p. 1; autodeclaração, sem inferir fluência de conversação ou avaliação independente.                                                                                                                     |

## Projetos adicionais

| ID                          | Evidências                                                                                                                                                                            | Limites                                                                                                                                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resergas`                  | reser_gas/README.md, resergas/pubspec.yaml, casos de uso como calcular_factor_z.dart e árvore resergas/test/. Flutter/Dart e propriedades de gás.                                     | Inspeção de código, sem execução; não importar alegação de cobertura de 100% ou precisão validada. O CV p. 3 também descreve o projeto; sua cronologia de criação não foi confirmada.                                                                          |
| `hsp-simulator`             | hsp_simulator/README.md, requirements.txt, api.py e services/solar_repository.py. FastAPI/Pydantic, Streamlit, providers e fallback; catálogo antigo apresenta HSP Simulator/HSP API. | Sem confirmar métricas de erro, escalabilidade, uptime, dados ao vivo ou funcionalidades de persistência/controle de acesso anunciadas genericamente no catálogo.                                                                                              |
| `greencity-api-orcamento`   | README.md, composer.json, routes/api.php e app/Http/Controllers/Api/OrcamentoController.php. Laravel/DomPDF/Blade, cálculo e geração de PDF.                                          | README/PHP e composer.json divergem em versão; não prometer runtime. Não validar projeções financeiras, conformidade de cálculos ou deploy pela leitura do código. Swagger anunciado no site não foi assumido disponível sem evidência no código inspecionado. |
| `gestao-empresarial-api`    | sistema_gestao_empresarial_api/README.md, requirements.txt, accounts/views/signin.py e accounts/auth.py. Django/DRF/SimpleJWT; access/refresh no login.                               | API distinta do login PHASSCODE. O catálogo lista ERP Greencity sem URL; versão/equivalência exata não foi confirmada. Não chamar de ERP completo/seguro com base apenas na descrição.                                                                         |
| `webservice-springboot-jpa` | webservice-springboot3-jpa/pom.xml e resources/UserResource.java. Java17/SpringBoot3.2.3/JPA/H2, GET /users e /users/{id}.                                                            | Exemplo de estudo com consultas; não afirmar CRUD completo, auth ou implementação Java do Orbe.                                                                                                                                                                |
| `embeddings-neo4j-rag`      | package.json, src/index.ts e src/ai.ts. LangChain/HuggingFace/Neo4jVectorStore/PDF e recuperação por similaridade.                                                                    | package.json credita erickwendel; registrar laboratório no perfil, sem reivindicar autoria original exclusiva. RAG experimental separado do chat lexical atual.                                                                                                |
| `greencity-sdgp`            | CV p. 2 descreve SDGP, Flutter/Dart/Firebase/Python/PHP e geração de propostas PDF. portfolio.json descreve Greencity Solutions com Flutter/Dart/SQL.                                 | Sem repositório identificado para esses aplicativos; não unificar automaticamente nomes, versões ou persistência.                                                                                                                                              |
| `lithology`                 | CV p. 3 descreve software desktop para dados de calhas e Excel/PDF; [skills_database.json](https://phasscode.com/assets/json/skills_database.json) menciona Lithology/H2.             | CV associa à Geowellex; site associa ao estágio ACRUX. Não escolher uma atribuição exclusiva ou stack completa sem esclarecer a divergência.                                                                                                                   |
| `websites-institucionais`   | portfolio.json: Siberian Web Solutions (WordPress) e website Greencity (WordPress/PHP).                                                                                               | Projetos declarados, sem validar disponibilidade, autoria exclusiva, métricas SEO ou oferta comercial atual.                                                                                                                                                   |
| `laboratorios-frontend`     | portfolio.json: Monibank, Mochila JS, Número Secreto e Teclado de Som, com links publicados.                                                                                          | Demonstrações HTML/CSS/JS; não inferir autoria original exclusiva, operação atual ou produto bancário real.                                                                                                                                                    |

Os arquivos externos e aplicativos de terceiros não foram executados nesta curadoria. Os testes
deste backend e a avaliação de respostas são documentados separadamente; presença de um teste em
outro repositório não prova que sua execução foi validada nesta sessão.

## Atualizações resolvidas e divergências restantes

1. **Vínculo atual resolvido por declaração atual:** o proprietário confirmou atuação na Greencity
   em 21/10/2026. O início fev/2019 continua atribuído ao histórico; não era confirmação atual por
   mera leitura do termo “Atualmente” em material antigo.
2. **UNISUL e FacPrisma atualizadas:** CC está trancada nas últimas disciplinas, previsão dez/2027;
   Segurança da Informação/FacPrisma foi concluída segundo o proprietário, sem data informada.
   Não estender essa conclusão a Arquitetura de Software, Big Data, Mobile ou IA. A data exata
   de conclusão de Segurança da Informação permanece não informada; seu status está atualizado.
3. **UnP:** preservar conclusão declarada e registrar CV dez/2014 versus site fev/2015. A fonte
   não esclarece se se trata de colação, término acadêmico ou atualização editorial; não inferir.
4. **Lithology:** associação Geowellex no CV versus ACRUX no texto H2 do site. Pode haver fases
   distintas, mas isso não foi confirmado. O trecho de Java do Orbe demonstrativo do frontend v2
   não resolve sozinho a atribuição/stack.
5. **SDGP/Greencity Solutions:** descrições relacionadas, com nomes/persistência diferentes e
   sem URL de código para comprovar equivalência.
6. **Catálogo v2 provisório:** contém datas diferentes de algumas fontes e duas pós UNIPDS com
   situação a revisar. Não foram promovidas automaticamente a formação confirmada ou usadas para
   substituir as declarações do currículo/site histórico.
7. **Certificações:** cursos livres, trilhas e competências não comprovam certificação profissional
   Kubernetes/AWS/Java. A base não confirma essas credenciais e tampouco conclui que o autor não as
   possui.
8. **LinkedIn:** conteúdo bloqueado; se disponibilizado posteriormente, registrar o novo acesso e
   conferir divergências antes de sobrescrever datas.
9. **Serviços, preços e agenda:** projetos entregues/declarados não provam oferta comercial, preços
   atuais, disponibilidade de contratação ou horários de reunião.

## Atualização técnica da Fase 3 — 22/10/2026

O registro `phasscode-platform` reflete o código local de autenticação, reuniões e worker,
autorizado pelo proprietário. Não altera seus dados profissionais. Configuração e homologação
nas contas externas continuam pendentes. Regras de horário vêm da resposta direta do proprietário:
America/Fortaleza, segunda a sábado 09h–18h, 30 minutos, antecedência de 24 horas, intervalo de 15 minutos
e reserva somente na aprovação. Disponibilidade concreta sempre exige consulta à API/Calendar;
esta fonte não afirma que um horário está livre. Ver [progresso](../docs/PROGRESS.md).

Atualizações futuras devem preservar a fonte da declaração, a distinção entre histórico e estado
atual e os conflitos ainda não resolvidos. Não remova informação profissional conhecida apenas
porque não há código público ou certificado anexado; preserve seu escopo e limite temporal.
