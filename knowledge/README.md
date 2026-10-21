Atualize `portfolio.json` somente com informações públicas verificadas. Os registros iniciais foram
extraídos do briefing fornecido pelo proprietário em 21/10/2026. Eles descrevem o portfólio e o estado
planejado da plataforma, sem inventar experiências, certificados, formação ou serviços oferecidos.

Cada registro possui `type`, `id`, `title`, `content`, `keywords` e `url` opcional. IDs são únicos.
Reinicie a aplicação após atualizar. O carregamento valida o formato, tamanho e IDs duplicados.
A busca inicial usa termos e palavras-chave normalizados; não usa embeddings nem faz scraping.
Uma futura porta de recuperação vetorial poderá usar PostgreSQL/pgvector após medir a necessidade.
