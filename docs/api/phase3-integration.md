# Integração do frontend — Fase 3 em validação

Contratos implementados em 22/10/2026. O frontend do portfólio pode integrar login, reuniões e
administração usando o [OpenAPI](../../packages/contracts/openapi.json). Não precisa implementar
um login por linguagem: a fonte de identidade é única e o BFF permanece a interface do navegador.
Google/SMTP/Telegram reais ainda exigem configuração e homologação do proprietário.
O [handoff de implementação](phase3-frontend-handoff.md) reúne a sequência para a UI e os clientes
de referência com renovação compartilhada e confirmação explícita.

## Login e sessão

1. Navegar com `window.location.assign(API + '/api/v1/auth/login/google')`. Não usar popup com
   tokens no JavaScript. O callback fixo no backend valida PKCE/state/nonce e redireciona para
   `AUTH_FRONTEND_URL`, sem código/JWT nos parâmetros do frontend.
2. Consultar `GET /api/v1/auth/session` com `credentials: 'include'`. A resposta anônima é
   `{authenticated:false,user:null,csrfToken:null,expiresAt:null}`. Quando autenticado, `user`
   contém `id`, `email`, `displayName`, `roles`; `csrfToken` e `expiresAt` acompanham a sessão.
3. Para `POST /api/v1/auth/refresh`, `/api/v1/auth/logout` e comandos administrativos, enviar
   `credentials: 'include'` e `X-CSRF-Token` obtido da sessão. O navegador inclui `Origin`.
   Atualizar o token CSRF depois do refresh. Logout retorna `204` e revoga a família da sessão.

```ts
const API = 'http://localhost:3000';
let session = await fetch(`${API}/api/v1/auth/session`, {
  credentials: 'include',
}).then((r) => r.json());

async function refreshSession() {
  const response = await fetch(`${API}/api/v1/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-CSRF-Token': session.csrfToken },
  });
  if (!response.ok) throw new Error(`Falha ao renovar: ${response.status}`);
  session = await response.json();
}
```

Guardar o CSRF em memória. A sessão fica em cookie HttpOnly/Secure/SameSite=Lax, host-only.
Nenhum access/refresh JWT é devolvido ao navegador; não criar armazenamento de JWT no localStorage.
`GET /api/v1/me` exige identidade e retorna o perfil. Papéis no React controlam a apresentação;
o backend verifica o papel atual em cada comando. `401` pede novo login; `403` pode indicar papel
insuficiente ou CSRF/Origin incorreto. Login habilitado não cria administradores automaticamente.
Com `AUTH_ENABLED=false`, as rotas auth retornam `404 AUTH_DISABLED`.

Em desenvolvimento HTTP, usar `AUTH_COOKIE_SECURE=false` e o mesmo hostname no frontend/backend
(ex.: ambos `localhost`). Em produção, servir frontend e BFF no mesmo site HTTPS, preferencialmente
na mesma origem por proxy. `credentials` não torna cookies SameSite utilizáveis entre sites distintos.
`CORS_ORIGINS` deve conter a origem exata, sem wildcard. O frontend não escolhe issuer, callback,
papel ou URL de retorno. Apenas login Google está disponível; senha/GitHub/MFA/passkeys são roadmap.

## Proposta, consentimento e pedido público

Os visitantes não precisam de login. Política confirmada: **America/Fortaleza, segunda a sábado,
09h–18h, 30 minutos, antecedência mínima de 24 horas e intervalo de 15 minutos**. O horizonte
operacional inicial é 60 dias; a consulta admite até sete dias por chamada. Horários da API são
instantes ISO 8601 com offset; exibir no fuso retornado. Pendentes não reservam horário.

| Método | Rota                                            | Dados/efeito                                                                                                                                           |
| ------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/v1/meetings/availability?from=ISO&to=ISO` | `{timeZone,durationMinutes,simulated,slots:[{start,end}]}`; sem detalhes privados                                                                      |
| POST   | `/api/v1/meetings/proposals`                    | Corpo `{start,name,email,topic}`; `201` com proposta privada, resumo, validade e `consentVersion`                                                      |
| POST   | `/api/v1/meetings/requests`                     | Após confirmação explícita: `{proposalId,confirmationToken,consent:true,consentVersion}` + `Idempotency-Key`; `201` com pedido PENDING e token privado |
| GET    | `/api/v1/meetings/requests/{id}/status`         | Exige `X-Meeting-Token`; apenas estado, horário, fuso e atualização, sem dados pessoais                                                                |

A proposta expira em 30 minutos e está vinculada a dados imutáveis. Exibir nome/e-mail/assunto,
horário/fuso e aviso de tratamento dos dados antes do botão explícito “Confirmar solicitação”.
Não enviar o POST automaticamente ao receber uma resposta do Orbe. Mostrar quando `simulated:true`.
Cancelar o formulário não cria pedido; a proposta expira. Correções nos dados geram nova proposta.

Gerar `crypto.randomUUID()` como `Idempotency-Key` uma vez por confirmação e preservar a mesma
chave/corpo em retries após falha de rede. Outra chave não transforma proposta consumida em novo
pedido. Chave reaproveitada com corpo diferente retorna `409 IDEMPOTENCY_CONFLICT`. Guardar
`id` + `meetingToken` de forma privada para acompanhamento; nunca colocar tokens em URL, logs,
analytics ou mensagens do modelo. Perder o token não dá acesso por nome/e-mail. O mesmo segredo
opaco da confirmação é usado como token de status, sendo persistido somente por hash no servidor.

PENDING pode coexistir com outros pedidos para o mesmo horário. Aprovação reserva o intervalo e
gera trabalho assíncrono; somente o worker, depois de verificar o evento externo, muda para
CONFIRMED. Mostrar APPROVED como “aprovado, aguardando confirmação da agenda”, nunca “confirmado”.
`409 MEETING_SLOT_UNAVAILABLE` pede nova consulta; `503 CALENDAR_UNAVAILABLE` é falha temporária,
sem fallback para horários falsos. O status particular retorna o mesmo `404` para UUID válido
desconhecido ou token inválido/ausente; UUID malformado retorna `400`.
Pedidos PENDING expiram após sete dias ou quando seu horário passa. Propostas expiradas e PII
antiga são tratadas pela rotina de retenção documentada na operação.

## Orbe e ação de confirmação

O chat mantém seu contrato público anterior e adiciona `actions` opcional:

```ts
// Além de conversationId, answer, sources, meta e conversationToken inicial:
type ChatAction = {
  type: 'confirm_meeting_request';
  proposal: {
    proposalId: string;
    confirmationToken: string;
    expiresAt: string;
    consentVersion: string;
    simulated: boolean;
    summary: {
      start: string;
      end: string;
      timeZone: string;
      name: string;
      email: string;
      topic: string;
    };
  };
};
```

Renderizar essa ação como o mesmo formulário de confirmação acima. `confirmationToken` é uma
capacidade privada da UI. Para receber `actions`, enviar `X-Orbe-Capabilities: meetings-v1` em cada
chamada de chat. Sem esse header, ferramentas de agenda e ações permanecem desativadas no chat,
mesmo com reuniões habilitadas no servidor, preservando o formato dos clientes já publicados.

Não devolver `confirmationToken` ao chat. O servidor exclui esse segredo de resultados
de ferramentas, contexto do modelo e histórico. As únicas ferramentas de agenda do modelo são
consulta e preparação de proposta. Não existem ferramentas para efetivar pedido, aprovar,
cancelar ou enviar notificações. O prompt atual é `orbe-v4` também sem os módulos habilitados;
as ferramentas continuam dependendo da configuração e do header de capacidade. Mensagens ao Orbe são enviadas ao provedor de LLM;
oferecer também formulário direto para quem não desejar compartilhar dados pessoais pelo chat.

## Administração

`GET /api/v1/admin/meetings?limit=25&status=PENDING` exige papel `admin`, com paginação por
`nextCursor` opaco. Não usar números de página nem ordenar no frontend como se toda a base
estivesse carregada. Os itens administrativos têm nome, e-mail, assunto, versão e falha resumida.

Os POSTs `/api/v1/admin/meetings/{id}/approve`, `/reject` e `/cancel` não aceitam dados da reunião
no corpo e exigem sessão/admin/CSRF. Retries da mesma decisão são idempotentes quando o estado
já permite a mesma resposta. `409` indica conflito/transição inválida; atualizar lista/status.
Cancelar uma reserva preserva sua proteção até verificar a remoção no Calendar. Falhas de
notificação não desfazem decisões. SMTP comunica o visitante; Telegram informa o administrador
sem nome, e-mail ou assunto do visitante. O backend mantém auditoria da decisão.

Todos os erros seguem `{error:{code,message,correlationId}}`. Respeitar `Retry-After` em `429/503`.
O limite inicial das rotas da Fase 3 é compartilhado por IP: 20 requisições/minuto. Evitar polling
agressivo; atualizar em ações do usuário ou intervalos moderados. O chat mantém sua cota própria.
