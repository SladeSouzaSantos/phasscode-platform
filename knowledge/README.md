Atualize `portfolio.json` com fontes profissionais autorizadas e fatos públicos rastreáveis. A
curadoria ampliada de 21/10/2026 combina o briefing, a implementação local, o site antigo, GitHub e
o currículo e as confirmações atuais do proprietário nesta sessão. São **31 documentos**: 17 registros de perfil, experiências,
formação, cursos e idiomas; 13 registros de projetos; e um da plataforma. Os oito IDs originais
foram preservados. Proveniência, arquivos/commits, páginas do CV e divergências estão em
[SOURCES.md](SOURCES.md).

Autodeclarações podem ser relatadas como tal: não é necessário esconder a trajetória conhecida por
falta de verificação independente. Preserve o status da fonte prioritária. Em 21/10/2026, o proprietário
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

Cada registro possui `type`, `id`, `title`, `content`, `keywords` e `url` opcional. IDs são únicos.
Reinicie a aplicação após atualizar. O carregamento valida o formato, tamanho e IDs duplicados.
A busca inicial usa termos e palavras-chave normalizados; não usa embeddings nem faz scraping.
Uma futura porta de recuperação vetorial poderá usar PostgreSQL/pgvector após medir a necessidade.
