# Segurança e dados pessoais

Entradas usam Zod strict, limites HTTP e de mensagem, sem aceitar campos para escolher provedor,
URL ou implementação. CORS possui lista explícita; não substitui autenticação nem protege contra
clientes fora do navegador. Rate limiting usa Redis quando configurado, por IP, e não confia em
X-Forwarded-For sem `TRUST_PROXY` explícito. Falha de Redis não libera o chat sem limitação.
O rate limit por IP não resolve sozinho ataques distribuídos. O orçamento global agora limita
chamadas reais da LLM entre instâncias com o mesmo Redis/chave. Proteção adicional no proxy e
monitoramento continuam necessários: um atacante ainda pode consumir o orçamento e causar
indisponibilidade para outros visitantes.

Provedor real requer `LLM_GLOBAL_MAX_CALLS` explícito e Redis, inclusive fora de produção.
`LLM_GLOBAL_WINDOW_MS` define a janela fixa iniciada na primeira reserva; o relógio, incremento e
expiração são atômicos em Lua no Redis. Cada `model.invoke` conta, inclusive rodadas depois de
ferramentas, falhas do provedor e cancelamentos após reserva; não há reembolso ou retry de geração.
Mock e políticas determinísticas não reservam chamadas. Esse limite não mede tokens ou dinheiro,
não consulta saldo/cota OpenRouter e não cobre outros clientes que usam a mesma conta.

Esgotamento retorna `LLM_BUDGET_EXHAUSTED`/429 com `Retry-After` em segundos. Redis indisponível,
resposta inválida ou políticas divergentes na mesma chave retornam `LLM_BUDGET_UNAVAILABLE`/503,
sem invocar o modelo. Falha Redis no limitador por IP retorna `RATE_LIMIT_UNAVAILABLE`/503,
com `Retry-After: 1`, sem executar o chat. O frontend deve
respeitar os headers e oferecer nova tentativa manual, sem loop automático. Não trocar a chave ou
limpar Redis para liberar consumo; Redis isolado por ambiente exige repartir o orçamento da conta
entre produção e desenvolvimento. AOF e `noeviction` reduzem perda de contadores, mas não substituem
reconciliação com o provedor após perda/restauração de estado.

O pool PostgreSQL padrão tem dez conexões. A admissão de chat reserva duas para consultas/readiness
e rejeita excesso com `CHAT_CAPACITY_REACHED`/503, sem criar uma fila de turnos. Falha no checkout
retorna `DB_UNAVAILABLE`/503. Ambos oferecem `Retry-After: 1`. O controle é por pool/processo, não
distribuído. A transação e o lock por conversa ainda duram durante a geração, limitada por timeout;
isso mantém rollback/atomicidade atuais. Medir carga antes de substituir por leases e transações
curtas. Configurações com pool de tamanho um não oferecem reserva de conexão.

Produção exige PostgreSQL e Redis. Conversas usam tokens aleatórios de 256 bits, hash SHA-256 e
comparação constante; UUID não concede acesso. Tokens não são registrados nem enviados ao modelo.
Google OIDC e administração estão implementados na Fase 3, com PKCE/state/nonce, sessão opaca
HttpOnly/Secure/SameSite, Origin/CSRF e verificação do papel atual no PostgreSQL. JWT de serviço
é RS256, com issuer/audience/expiração, propósito e sid ativo; não é exposto ao navegador. Contas
externas são vinculadas por issuer/subject, sem união por e-mail ou promoção automática de admin.

O prompt e as ferramentas separam instruções de dados. A busca aceita somente texto de consulta
e lê documentos públicos. Ferramentas opcionais de reuniões consultam a agenda e preparam propostas;
confirmar o pedido exige ação HTTP do visitante, fora do modelo. Nenhuma ferramenta efetiva pedido,
aprova, cancela ou envia notificações. Tokens das propostas ficam só na resposta privada da UI,
fora do contexto e do histórico do modelo. Filtros de injection e
escopo são heurísticos e não garantem imunidade. Avaliações adversariais e controles fora do LLM
serão necessários antes de disponibilizar ações sensíveis. Renderizar respostas como texto seguro
ou Markdown sanitizado no frontend, sem aceitar HTML arbitrário.

Logs estruturados registram códigos e correlação; não registram corpo, histórico, token de conversa,
Authorization nem exceções brutas do provedor. Chaves LLM ficam somente em ambiente backend. `.env`
está ignorado por Git e Docker. A API envia `store: false` ao modelo; isso não habilita Zero Data
Retention na conta do fornecedor. Avalie contrato, localização e retenção do provedor antes de
enviar dados de visitantes.

`LANGCHAIN_VERBOSE=true` pode instalar callbacks que imprimem mensagens completas, independentemente
do logger HTTP. A configuração e o construtor do provedor rejeitam esse modo e também
`LANGCHAIN_TRACING`, `LANGCHAIN_TRACING_V2`, `LANGSMITH_TRACING` e `LANGSMITH_TRACING_V2` quando
habilitados com `true`. Tracing de conteúdo exige uma decisão futura explícita de privacidade;
não é ativado neste incremento. Valores de outras variáveis não entram no erro de configuração.

`/ready` consulta PostgreSQL/Redis e fica disponível para probes internos. O modelo Nginx bloqueia
essa rota externamente; a verificação pública usa `/health`, que não consulta os bancos. A API
continua publicada apenas no loopback do host. O modelo precisa ser instalado manualmente para
essa restrição valer no servidor. Cotas de LLM não substituem proteção operacional contra DoS.

Retenção padrão: sete dias desde a última atividade, até doze mensagens por conversa. Acesso a
conversa expirada é negado; execute diariamente `db:retention` ou o serviço `retention` para exclusão
física em cascata. Backups precisam da própria política de expiração. O modo memória elimina
conversas expiradas ao processar solicitações e perde todas ao reiniciar.

Para operação pública, documentar finalidade,
base legal adequada, aviso de privacidade, contato do controlador e processo de exclusão/solicitação
do titular. Estas são tarefas de configuração e governança do projeto, não uma declaração de
conformidade jurídica automática com LGPD.

Visitantes podem enviar dados pessoais espontaneamente. Não existe detecção/anonimização automática
que garanta sua remoção: conteúdo aceito pode ser persistido no histórico e enviado ao provedor
externo com o contexto da conversa. O frontend deve mostrar aviso antes do primeiro envio,
desencorajar dados pessoais/sensíveis e disponibilizar contato e processo de exclusão. A exclusão
local não comprova exclusão no fornecedor ou em backups. Não registrar corpos para diagnosticar
abuso; usar código público, correlação e métricas sem conteúdo. Na Fase 3, nome/e-mail/assunto são
coletados para a proposta e confirmação do pedido. Oferecer formulário direto para quem não quiser
enviar esses dados ao provedor LLM. Propostas expiram; a retenção anonimiza PII elegível após 90 dias
e preserva auditoria. Worker e manutenção executam a limpeza; backups têm política separada.

Tokens do login Google não são persistidos; cookies opacos são guardados por hash. A credencial
offline do Calendar é configuração privada independente e fica fora do banco/Git. Usar escopos
mínimos, rotação/revogação e calendário autorizado. Persistência futura exige secret manager ou
criptografia autenticada padrão com chave separada. Não enviar tokens em e-mail/Telegram. Jobs
Redis contêm só UUID de outbox, entregas SQL registram estado/códigos e canais minimizam PII.

Compose não publica bancos/brokers por padrão; overrides locais limitam portas ao loopback. Redis
e brokers locais não estão configurados para redes não confiáveis. Produção requer rede restrita,
TLS, credenciais rotacionadas, backups testados e Nginx existente configurado manualmente.
