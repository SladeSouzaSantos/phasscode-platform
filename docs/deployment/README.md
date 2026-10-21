# Operação local e deploy futuro

O ambiente inicial executa somente API, migrations, PostgreSQL e Redis. Copie `.env.example` para
`.env`, configure senha e execute `docker compose up -d --build --wait api`. Migrations são um
serviço de inicialização; a API depende do término bem-sucedido. Mudanças de senha de um volume
PostgreSQL já criado exigem alteração explícita no banco, não apenas da variável de ambiente.

Checklist prático de validação local: `npm run check`, auditoria, suíte de integração real, build
da imagem, readiness, chat e reinício preservando conversas. Nunca usar `down --volumes` para
atualizar um ambiente com dados que precisam ser preservados. Na CI os volumes são descartáveis.

Para homologação, definir segredos fora do Git, domínio/TLS, origins, limites, retenção, backups,
alarmes e credenciais do provedor. Agendar o comando de retenção uma vez ao dia e acompanhar falhas.
Executar migrations como etapa controlada de release com backup e estratégia de rollback por
migration corretiva; não editar SQL já aplicado.

O Mac Mini já possui Nginx Docker compartilhado com:

```nginx
include /opt/projects/*/nginx.conf;
```

Preservar `/opt/docker-stack/proxy/nginx/conf.d/projects.conf`. O arquivo
`infrastructure/nginx.conf.example` é uma proposta para o include do projeto, sem novo proxy.
Após validação local e autorização de publicação: confirmar rede externa do Nginx, conectar a API
com alias único `phasscode-api`, remover sua porta publicada, escolher domínio/certificado reais,
configurar `TRUST_PROXY` somente para a rede/IP confiável e testar `nginx -t` antes do reload.
O exemplo usa domínio `.example` e caminhos REPLACE deliberadamente; não deve ser instalado sem
configuração. Não altera automaticamente produção, DNS, credenciais ou servidor.

Branches: `dev` integra incrementos; `main` recebe PR revisado com CI exigida. Pipelines produzem
artefatos internos e imagens de teste, sem push de imagem nem acesso SSH. Para publicação futura,
usar workflow_dispatch, environment protegido com aprovação explícita, permissões mínimas e tags
imutáveis. O job Java só deve existir quando a Fase 4 fornecer aplicação e testes reais.

Perfis RabbitMQ/Kafka são opcionais e locais. Não ativam consumidores nem substituem BullMQ.
Configuração de produção de brokers será uma decisão operacional própria, validada nas Fases 5–6.
