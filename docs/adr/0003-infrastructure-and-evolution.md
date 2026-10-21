# ADR 0003 — Infraestrutura local e evolução independente

Estado: aceita. Data: 21/10/2026.

Contexto: PostgreSQL será a fonte de verdade e Redis/BullMQ a primeira solução assíncrona. A
produção futura já possui Nginx compartilhado e não pode ser alterada automaticamente.

Decisão: Compose com migrations antes da API, healthchecks e volumes. Bancos e brokers sem portas
publicadas no arquivo padrão. Override local publica dependências somente no loopback. Dockerfile
multi-stage executa aplicação com usuário node. Perfis RabbitMQ e Kafka são opcionais e não
implementam adaptadores; o ambiente inicial precisa apenas PostgreSQL e Redis.

CI executa qualidade Node, integração, auditoria, CodeQL, imagem e smoke Compose. Java será incluído
quando existir código Java verificável. Publicação de artefatos é interna ao workflow, com retenção
curta. Não há deploy remoto. A integração ao Nginx é apenas documentada e possui exemplo separado.

Consequências: funcionamento dos containers deve ser comprovado com Docker Engine ativo. Até lá,
validação sintática de Compose não prova runtime. Perfis locais de brokers não são produção.
Segredos, TLS, redes externas, backups e aprovação por ambiente serão configurados em homologação.
