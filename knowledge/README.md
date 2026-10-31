Atualize `portfolio.json` com fontes profissionais autorizadas e fatos públicos rastreáveis. A
curadoria ampliada de 21/10/2026 combina o briefing, a implementação local, o site antigo, GitHub e
o currículo e as confirmações atuais do proprietário nesta sessão. São **31 documentos**: 17 registros de perfil, experiências,
formação, cursos e idiomas; 13 registros de projetos; e um da plataforma. Os oito IDs originais
foram preservados. Proveniência, arquivos/commits, páginas do CV e divergências estão em
[SOURCES.md](SOURCES.md).

Informações profissionais registradas devem ser apresentadas diretamente. A proveniência fica em
`SOURCES.md`; ressalvas na resposta só são necessárias quando uma lacuna, divergência ou pergunta
de verificação as torna pertinentes. Ausência de repositório público não invalida experiência em
empresa nem transforma um sistema de terceiros em projeto pessoal. Em 21/10/2026, o proprietário
confirmou atuação atual na Greencity, conclusão somente da pós em Segurança da Informação/FacPrisma
(sem data informada) e Ciência da Computação/UNISUL trancada nas últimas disciplinas, com nova previsão
para dezembro de 2027. Essas correções prevalecem sobre o currículo/site antigos; não se presume
matrícula ativa ou conclusão das demais áreas da FacPrisma. “Atualmente” em material antigo, sozinho,
não confirma vínculo hoje, e previsão de conclusão não comprova diploma concluído. Cursos livres e
competências não comprovam certificações de fornecedores. Datas divergentes, como a conclusão da
UnP, permanecem identificadas até esclarecimento.

O currículo está possivelmente desatualizado. Seu PDF, texto integral, telefone, endereço e outros
dados privados não foram incorporados ao repositório. LinkedIn bloqueou acesso automatizado: nenhum
fato foi inventado a partir dessa página. Não inclua segredos, credenciais, agenda privada ou dados
de visitantes na base.

Cada registro possui `type`, `id`, `title`, `content`, `keywords` e `url` opcional. IDs são únicos;
os 31 IDs anteriores foram preservados. Metadados opcionais incluem `technologies`, `category`
(profissional/pessoal/estudo/contribuição), `role`, `visibility`, `relatedProjectIds`, `repositoryUrl`
e `demoUrl`. Omitir um campo desconhecido é preferível a inferir seu valor. As tecnologias de um
projeto devem corresponder ao seu material, não a uma lista global de competências ou roadmap.
Relacionamentos só podem apontar para IDs existentes. Repositório, demonstração e evidência
documental têm funções distintas; agregados sem um link primário apropriado ficam sem `url`.

`experiencePeriod` registra meses explícitos (`start`, `end`) ou confirmação do vínculo aberto
(`currentAsOf`), além de `areas`. A união de intervalos estima meses decorridos, sem duplicar
sobreposições e sem preencher lacunas. Greencity e Geowellex têm áreas mistas e não sustentam
dedicação integral a desenvolvimento ou a uma tecnologia específica. Os cálculos em contexto
não são uma medida de senioridade nem um total exaustivo de experiência em software.

Reinicie a aplicação após atualizar. O carregamento valida o formato, tamanho e IDs duplicados.
A busca pondera termos, tecnologias reais e intenção de experiência/projeto. A seleção de fontes
compara os registros fornecidos com a resposta final; não retorna automaticamente tudo que foi
consultado. Não usa embeddings nem faz scraping.
Uma futura porta de recuperação vetorial poderá usar PostgreSQL/pgvector após medir a necessidade.

## Atualização do catálogo profissional (31/10/2026)

O Orbe usa uma **curadoria versionada no backend**, não consome automaticamente
o catálogo React da Academia Arcana. A sincronização editorial desta revisão
foi baseada nas listas `src/data/formacoes.ts`, `projetos.ts` e
`arquivoProjetos.ts` do frontend `web-portfolio-v2/dev` na revisão
`6efb48ed1450e728fbacf1e9b0e378eb1b6dd113`.

São **48 registros**: 31 anteriores preservados e 17 novos (oito projetos,
seis trilhas de cursos, resumo Hackers do Bem e duas pós-graduações UNIPDS).
Todos os **42 cursos livres** estão marcados como concluídos por confirmação
do autor. Quatro certificados Hackers do Bem somam **320 horas** e não foram
incluídos no repositório. Não há certificados de fabricantes inferidos.

Cada resposta cita páginas públicas ou repositórios reais quando apropriado;
JSON e caminhos de código locais não são apresentados como fontes externas.
O conteúdo é estático até uma nova revisão/redeploy do **backend**. Mudanças no
frontend não atualizam a base em tempo real. O Orbe não faz scraping contínuo.
Para novos cursos e projetos, sincronize e revise a procedência antes de
publicar novamente.

A validação de comportamento de recrutadores usa
`tests/orbe-recruiter-scenarios.test.ts`, e a avaliação HTTP opcional usa
`evaluation/recruiter-cases.json` com `--matrix=`, sempre limitada e explícita.
A execução de testes simulados não comprova respostas de um provedor LLM real.
