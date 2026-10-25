# Configuração e operação da Fase 3

Fase 3 em andamento, sob auditoria em 22/10/2026. Os adaptadores reais têm código local, mas Google OIDC/Calendar,
SMTP/Telegram e o `minimac-server` precisam de homologação com as contas do proprietário.
Este guia descreve procedimentos futuros para um ambiente explicitamente escolhido e autorizado;
não registra sua execução no servidor. Na auditoria da retomada, migrations foram aplicadas
somente em bancos descartáveis. Nenhum servidor ou `.env` existente foi modificado, e não houve
login Google real, envio externo, commit, push, merge ou deploy. Conferir a
[auditoria da retomada](../testing/phase3-resume-audit.md) antes de preparar a homologação.

Em 23/10 o proprietário confirmou que ainda não configurou os provedores. O
[preflight offline e runbook](phase3-preflight.md) lista campos faltantes e etapas de homologação,
sem conectar ou alterar arquivos. Os novos resultados locais estão na
[validação de 23/10](../testing/phase3-local-validation-2026-10-23.md); a UI segue com o proprietário
pelo [handoff](../api/phase3-frontend-handoff.md).

## Preparar login Google

Usar `.env.example` como referência sem substituir um `.env` já configurado. Segredos permanecem
no ambiente privado do checkout; não colar no chat, issue ou workflow. Criar um cliente web Google
para login, com callback exato `AUTH_PUBLIC_URL/api/v1/auth/callback/google`, e consentimento apenas
`openid email profile`. O backend usa [openid-client](https://github.com/panva/openid-client) para
Authorization Code/PKCE/state/nonce e verificação de assinatura do ID token.

1. Configurar PostgreSQL/Redis, aplicar `npm run migrate` e gerar a chave com `npm run auth:keygen`.
   Antes de aplicar migrations, conferir a URL e o ambiente; na reprodução desta auditoria usar
   exclusivamente PostgreSQL/Redis descartáveis. Não executar esses passos no servidor como
   parte da revisão local. Migrations 001–004 existentes permanecem intactas; a nova
   `005_calendar_create_uncertainty.sql` adiciona e preenche conservadoramente a flag de incerteza
   de criação Calendar. Não editar migrations já aplicadas nem tentar rollback de dados.
   O comando cria **novos** arquivos ignorados em `.secrets/`, sem imprimir nem sobrescrever chaves.
   Copiar os campos do fragmento privado para o `.env` escolhido, preservar `\n` literal no PEM e
   proteger o arquivo com permissões/ACL do operador. Não compartilhar a chave privada.
2. Preencher `AUTH_PUBLIC_URL` (origem da API), `AUTH_FRONTEND_URL` (origem e retorno padrão), cliente Google,
   `AUTH_JWT_KEY_ID`, `AUTH_JWT_PRIVATE_KEY` e `AUTH_ADMIN_EMAIL`. Inserir manualmente o endereço
   Google exato confirmado pelo proprietário no ambiente privado escolhido, preservando o `.env`
   existente; não publicar esse valor no bundle ou em exemplos versionados. Definir
   `AUTH_ENABLED=true`. Sem e-mail
   válido a aplicação recusa habilitar auth. A origem do frontend deve estar em `CORS_ORIGINS`.
3. Em produção, ambas as URLs usam HTTPS e `AUTH_COOKIE_SECURE=true`. Somente para HTTP local,
   usar `NODE_ENV=development`, URLs loopback e `AUTH_COOKIE_SECURE=false`. No Compose, a variável
   equivalente é `PHASSCODE_NODE_ENV`; seu padrão continua `production`.
4. Fazer login com a conta Google autorizada e conferir `/api/v1/me` e `roles`. O primeiro login
   válido concede `admin` uma única vez por usuário, na mesma transação do registro de auditoria,
   se não existe histórico administrativo. Usuário desabilitado ou com histórico de revogação
   não é promovido novamente. Outra conta é recusada sem cadastro ou sessão: JSON recebe
   `403 AUTH_ADMIN_ONLY` e navegação HTML retorna `303` ao portfólio com `auth_error=AUTH_ADMIN_ONLY`.
   Não há parâmetro do frontend para escolher outro e-mail ou contornar a política.
5. Para revogar ou recuperar explicitamente o acesso depois de uma revogação, conferir UUID e
   identidade vinculada no ambiente correto e usar o CLI auditado:

```bash
# Host, com DATABASE_URL do ambiente escolhido:
npm run auth:admin -- grant UUID_DO_USUARIO
npm run auth:admin -- revoke UUID_DO_USUARIO

# Container, usando a mesma imagem/ambiente selecionados pelo wrapper:
bash scripts/compose.sh phasscode-platform-dev /opt/projects/phasscode-platform-dev/.env \
  exec -T api node dist/packages/database/src/admin-role.js grant UUID_DO_USUARIO
```

O comando é transacional, idempotente e registra `auth_role_audit`; a revogação registra um veto
mesmo se o papel já estava ausente, evitando bootstrap posterior inadvertido. Não usar o CLI para
admitir outro e-mail: além do papel, toda sessão exige a política `AUTH_ADMIN_EMAIL` atual.
O bootstrap é exclusivo da identidade Google validada e admitida, não do primeiro visitante.
O cookie normal dura 30 minutos, com máximo absoluto
de oito horas; refresh rotaciona o segredo e CSRF. Reuso de sessão rotacionada revoga a família.
Refresh, reuso e logout compartilham um mutex transacional por família no PostgreSQL, impedindo
uma sucessora ativa de escapar de uma revogação concorrente. O frontend também deve serializar
seus refreshes para não provocar a própria proteção de reuso.

Verificar também recusa de outra conta Google e de aliases/pontos diferentes, revogação imediata
em cookie/JWT e manutenção do chat/pedidos públicos sem login. Alterar `AUTH_ADMIN_EMAIL` exige
recriar a API para aplicar a configuração e sincronizá-la entre réplicas; não modifica nem une
identidades existentes. Cookies antigos fora da política não concedem acesso. A recusa de uma
identidade validada limpa cookies de login/sessão; callback inválido sem state/prova de navegador
não encerra uma sessão administrativa válida. Refresh negado por `AUTH_ADMIN_ONLY` limpa a sessão.
Para retornar à página inicial do login, o frontend pode enviar `returnTo` relativo com path/query/hash;
apenas a origem de `AUTH_FRONTEND_URL` é admitida, mesmo havendo outras origens em `CORS_ORIGINS`.
O retorno é vinculado à transação do navegador e não requer nova migration. Conferir sucesso `302`,
falha navegacional `303` com código público e erro JSON preservado com `Accept: application/json`.
Callback inválido/replay nunca deve redirecionar. Instruções de apresentação e limpeza de
`auth_error` estão no [guia do frontend](../api/phase3-integration.md).

JWTs RS256 de serviço duram até cinco minutos e ficam no backend; o endpoint JWKS publica somente
chaves públicas. Para rotação, usar novo `KEY_ID`/chave, incluir a chave pública anterior em
`AUTH_JWT_PREVIOUS_JWKS` e retirá-la depois da janela de validade dos tokens antigos. Preservar
o mesmo issuer/audience da implantação. Nunca colocar chave privada nesse JWKS.

O [modelo Nginx](../../infrastructure/nginx.conf.example) suprime access/error logs do callback,
cujos parâmetros contêm código/estado OAuth, inclusive em falhas de upstream. Aplicar exclusão
equivalente no CDN e proxies anteriores.
O modelo agora admite até 100 segundos de espera, cobrindo configurações maiores dos provedores.
Não foi instalado no servidor por este incremento.

## Autorizar Calendar separadamente

Usar outro cliente/consentimento OAuth, independente do login. Ativar Calendar API e escolher um
calendário do proprietário para homologação. Obter um refresh token pelo fluxo de consentimento
offline do Google e guardá-lo em `GOOGLE_CALENDAR_REFRESH_TOKEN`, junto do client ID/secret
**desse cliente**, não dos campos `AUTH_GOOGLE_*`. O login do portfólio nunca solicita escopos Calendar.

Para um calendário pertencente à conta autorizadora, os escopos
`https://www.googleapis.com/auth/calendar.events.owned` e
`https://www.googleapis.com/auth/calendar.events.freebusy` cobrem as operações usadas; conferir
permissões e consentimento realmente concedidos. Referências Google:
[escopos Calendar](https://developers.google.com/workspace/calendar/api/auth),
[FreeBusy](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query),
[criação de evento](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert)
e [autorização offline](https://developers.google.com/identity/protocols/oauth2/web-server).
Calendários compartilhados podem exigir outro escopo/permissão; validar antes de habilitar pedidos.

Configurar `GOOGLE_CALENDAR_MODE=google`, ID do calendário e os três campos OAuth próprios.
Access tokens são renovados pela biblioteca `google-auth-library`; não ficam no banco. Segredos
do operador ficam fora do Git. Se houver banco de credenciais no futuro, usar secret manager ou
criptografia autenticada com chave separada, sem criar armazenamento plaintext improvisado.

Definir `MEETINGS_ENABLED=true` depois de preparar auth/admin/Calendar. A política da amostra
corresponde à resposta do proprietário: Fortaleza, seg–sáb 09h–18h, 30 minutos, 24 horas de
antecedência e intervalo de 15 minutos. Horizonte de 60 dias, propostas válidas por 30 minutos,
PENDING por sete dias/fim do horário e retenção de 90 dias são limites
operacionais documentados, configuráveis onde há variável própria. Aprovação reaplica a antecedência
mínima. A lease Calendar deve cobrir pelo menos seis timeouts HTTP; padrão de 120s com timeout de 10s.

Em testes locais, `GOOGLE_CALENDAR_MODE=fake` é explícito e as respostas indicam `simulated:true`.
Fakes são recusados em produção e não substituem automaticamente erros do Google. O fake é memória
local de cada processo: não representa uma agenda compartilhada entre API e worker nem sobrevive
a restart. A exclusão de reservas PostgreSQL continua compartilhada; validar concorrência Calendar
externa exige o modo real e um calendário autorizado.

Para oferecer propostas pelo Orbe, o frontend atualizado deve enviar
`X-Orbe-Capabilities: meetings-v1` em `POST /api/v1/chat` e implementar a confirmação explícita
de `actions`. Sem esse header, o chat conserva o formato legado mesmo com reuniões habilitadas;
não há proposta criada pela LLM. O formulário HTTP direto continua independente dessa opção.

## Worker e canais

Configurar `WORKER_ENABLED=true`, Redis e `NOTIFICATION_MODE=real`. SMTP e Telegram são adaptadores
independentes; habilitar os canais desejados. Produção exige Calendar real e pelo menos um canal
real. Para SMTP, preencher host/porta/from e, se necessário, usuário/senha; porta587 exige STARTTLS,
porta465 usa `SMTP_SECURE=true`. Não desabilitar validação TLS. Telegram usa bot token/chat ID.

```bash
# Desenvolvimento no host (configuração já preenchida):
npm run worker:dev

# Compose, mesma imagem/ambiente da API:
bash scripts/compose.sh phasscode-platform-dev /opt/projects/phasscode-platform-dev/.env \
  --profile worker up -d --no-build --wait api worker
```

O script de release lê apenas o flag `WORKER_ENABLED` da configuração renderizada, sem expor os
segredos. Depois de validar o SHA OCI, drena o worker antigo, aplica migrations e ativa API/worker
na mesma imagem por digest, verificando healthchecks e SHA. Worker permanece opt-in. Falha de
migration ou worker mantém o release incompleto; não existe rollback automático do banco.

Outbox SQL é a fonte durável; BullMQ recebe só `outboxId`. Leases/CAS, retry exponencial de até
300s e registro por canal evitam perda de trabalho e reenvio de entregas já confirmadas. A outbox
esgotada permanece visível com `OUTBOX_ATTEMPTS_EXHAUSTED`; não apagar nem liberar reserva por SQL.
SMTP/Telegram não oferecem confirmação transacional com nosso banco: queda após envio e antes
do ACK pode duplicar mensagem. Não há garantia de entrega exatamente uma vez.

Falha de canal não desfaz reunião. O lembrete é durável, uma hora antes de reunião confirmada;
é descartado se o estado/versão mudar ou o horário já passar. SMTP usa texto mínimo; Telegram
exclui nome, e-mail e assunto do visitante. Calendar usa `sendUpdates=none`; notificações são dos
canais configurados. CONFIRMED comprova evento no calendário do proprietário, não aceite do
convidado, envio de convite Google ou criação de link de videoconferência.

O worker mantém heartbeat em `/tmp/phasscode-worker-heartbeat`, validando Redis, SQL e consumo.
O healthcheck expira após 30s. Na API, `/ready` inclui as migrations da Fase 3; `/health` continua
somente liveness. Probes não consultam Google nem enviam notificações. Verificar backlog e falhas
separadamente; processo saudável não comprova saúde dos canais externos.

## Retenção e recuperação

O worker executa retenção a cada hora. `db:retention`/perfil `maintenance` também remove conversas
expiradas, propostas não consumidas expiradas e transações OAuth vencidas; preserva hashes de
sessões até um dia após a expiração absoluta para detecção de replay. Usuários/identidades não
são apagados automaticamente. Backups precisam de política própria.

PENDING vencido vira CANCELLED com auditoria. Após 90 dias, dados pessoais de reuniões elegíveis e
propostas vinculadas são anonimizados, sem apagar a trilha de decisões. Segredos antigos deixam
de autorizar status. Rotina periódica não promete exclusão no minuto exato do vencimento.

Em falha Calendar incerta, a reserva continua, mesmo com FAILED/CANCELLED. O operador pode cancelar
pela API e aguardar remoção/reconciliação verificável antes de pedir outro horário. Se a limpeza
esgotar as tentativas, novo cancelamento administrativo reabre um ciclo auditado, com nova versão;
replays durante trabalho ativo ou depois da remoção continuam idempotentes. Um evento
pré-existente com propriedade divergente é recusado e nunca apagado pelo adaptador. Não alterar
ID externo/reserva/status diretamente para “corrigir” o problema. Google não fornece transação
atômica FreeBusy+insert: outros escritores externos ainda podem criar conflitos nessa janela.

`calendar_create_uncertain` é persistido antes da tentativa de criação. Um conflito comprovado
antes do insert pode liberar a reserva quando não há tentativa anterior incerta. Depois de
ambiguidade, conflitos em retries e GET `404` não provam que o insert antigo foi abortado.
Cancelamento sem ID externo verificado retorna `CALENDAR_RECONCILIATION_PENDING` se encontra
somente `404`, preservando a reserva. Recuperar o evento correto e verificar sua remoção, ou
obter evidência de cancelamento já concluído, permite finalizar. Sem essa evidência, a reserva
pode permanecer retida indefinidamente; nem o fim da lease nem retries esgotados a liberam.
Investigar com o proprietário em uma operação autorizada; não contornar por SQL nem prometer
liberação após um prazo fixo.

O aviso de privacidade do frontend deve explicar histórico/LLM e processamento de dados da reunião.
Para agendar sem compartilhar nome/e-mail com a LLM, usar o formulário direto. Homologar com dados
sintéticos e destinatários controlados antes de abrir as novas funções ao público.
