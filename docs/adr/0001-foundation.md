# ADR 0001 — Aplicação modular e portas para o chat

Estado: aceita. Data: 21/10/2026.

Contexto: é necessário entregar uma base executável em Node antes de adicionar Java, calendário e
três mecanismos diferentes de mensageria. O repositório continha apenas o README inicial.

Decisão: npm workspaces, Node 24 LTS, TypeScript strict e Fastify. Uma aplicação HTTP com domínio,
aplicação, portas e adaptadores. Contratos e configuração ficam em packages reutilizáveis. Tipos de
DTO são inferidos do Zod; um pacote shared-types duplicaria a fonte de verdade e não foi criado.

Consequências: menos processos para desenvolver e testar; contratos preservam a futura separação.
Gateway, scheduling-api, Java e worker não serão diretórios vazios para simular serviços completos.
Imports relativos ESM `.js` permitem build único sem empacotador. Os exports de packages apontam
para fonte TypeScript para ferramentas do monorepo; distribuir SDK exigirá um build próprio.
