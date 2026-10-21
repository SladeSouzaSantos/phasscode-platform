# Segurança e dados pessoais

Entradas usam Zod strict, limites HTTP e de mensagem, sem aceitar campos para escolher provedor,
URL ou implementação. CORS possui lista explícita; não substitui autenticação nem protege contra
clientes fora do navegador. Rate limiting usa Redis quando configurado, por IP, e não confia em
X-Forwarded-For sem `TRUST_PROXY` explícito. Falha de Redis não libera o chat sem limitação.
Antes de exposição pública, definir cotas globais de custo e proteção adicional contra abuso
distribuído no proxy. O rate limit por IP não resolve sozinho ataques distribuídos.

Produção exige PostgreSQL e Redis. Conversas usam tokens aleatórios de 256 bits, hash SHA-256 e
comparação constante; UUID não concede acesso. Tokens não são registrados nem enviados ao modelo.
Não há login/admin neste incremento porque não há endpoints administrativos. A Fase 3 deve usar
OIDC/JWT verificável, emissor/audiência e papéis antes de liberar aprovações ou listagem de PII.

O prompt e a ferramenta de busca separam instruções de dados. A ferramenta aceita somente texto de
consulta e lê documentos públicos; não escreve nem faz fetch de URLs. Filtros de injection e
escopo são heurísticos e não garantem imunidade. Avaliações adversariais e controles fora do LLM
serão necessários antes de disponibilizar ações sensíveis. Renderizar respostas como texto seguro
ou Markdown sanitizado no frontend, sem aceitar HTML arbitrário.

Logs estruturados registram códigos e correlação; não registram corpo, histórico, token de conversa,
Authorization nem exceções brutas do provedor. Chaves LLM ficam somente em ambiente backend. `.env`
está ignorado por Git e Docker. A API envia `store: false` ao modelo; isso não habilita Zero Data
Retention na conta do fornecedor. Avalie contrato, localização e retenção do provedor antes de
enviar dados de visitantes.

Retenção padrão: sete dias desde a última atividade, até doze mensagens por conversa. Acesso a
conversa expirada é negado; execute diariamente `db:retention` ou o serviço `retention` para exclusão
física em cascata. Backups precisam da própria política de expiração. O modo memória elimina
conversas expiradas ao processar solicitações e perde todas ao reiniciar.

Não peça informações pessoais no chat nesta fase. Para operação pública, documentar finalidade,
base legal adequada, aviso de privacidade, contato do controlador e processo de exclusão/solicitação
do titular. Estas são tarefas de configuração e governança do projeto, não uma declaração de
conformidade jurídica automática com LGPD.

Tokens OAuth Google e refresh tokens ainda não são armazenados. A implementação futura deve usar
secret manager ou criptografia autenticada com biblioteca padrão e chave fora do banco, escopos
mínimos, rotação/revogação e autorização explícita dos calendários. Não enviar tokens em e-mail ou
Telegram. Notificações devem carregar o mínimo de dados necessário e ter trilha operacional.

Compose não publica bancos/brokers por padrão; overrides locais limitam portas ao loopback. Redis
e brokers locais não estão configurados para redes não confiáveis. Produção requer rede restrita,
TLS, credenciais rotacionadas, backups testados e Nginx existente configurado manualmente.
