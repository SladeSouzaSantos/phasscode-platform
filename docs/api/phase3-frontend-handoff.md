# Integração da Fase 3 no portfólio

A implementação visual continua com o proprietário, em seu repositório do frontend. Este roteiro
entrega os contratos e clientes de referência do backend; não comprova que o portfólio publicado
já usa login ou agendamento. Google OIDC, Calendar e notificações reais ainda não estão configurados.

## Arquivos de referência

- [OpenAPI](../../packages/contracts/openapi.json): schemas, endpoints, headers, erros e segurança.
- [Contrato comentado](phase3-integration.md): ciclo de sessão, consentimento e estados.
- [OrbeClient](../../examples/frontend-client.ts): chat existente; opt-in de reuniões desligado por padrão.
- [Phase3Client](../../examples/phase3-client.ts): sessão/CSRF, renovação compartilhada, logout,
  disponibilidade, propostas, confirmação, acompanhamento e comandos administrativos.

Copiar/adaptar os clientes e os tipos necessários para o projeto visual. Os imports relativos dos
exemplos apontam para este monorepo; não são um pacote npm publicado. Não importar módulos do
servidor, variáveis privadas ou bibliotecas Google/JWT no bundle do navegador. O frontend conhece
somente a origem pública da API. Nenhum client secret, refresh token Google ou chave JWT vai para
variáveis `VITE_*`.

## Sequência de implementação

1. **Preservar o chat público.** Manter `POST /api/v1/chat`, token de conversa em memória e tratamento
   do 404 como conversa indisponível. O login não é requisito para conversar. Inicialmente usar
   `new OrbeClient(API)`; sem opt-in a resposta mantém o formato legado, mesmo com reuniões ativas.
2. **Substituir o login demonstrativo pelo Google.** A ação de entrar navega para
   `client.googleLoginUrl`, sem popup ou tokens no JavaScript. Para preservar a página de origem,
   acrescentar `returnTo` com `URLSearchParams`, usando `location.pathname + location.search +
location.hash`, conforme o [exemplo de integração](phase3-integration.md#login-e-sessão).
   O destino precisa pertencer à origem de `AUTH_FRONTEND_URL`; o caminho é limitado a 1024 bytes
   UTF-8 e não admite URL absoluta, `//` ou barras invertidas. Sem parâmetro, o retorno fixo é mantido.
   Ao carregar a página de retorno, chamar `client.getSession()`. Renderizar usuário/papéis somente
   a partir da resposta. Não ativar
   formulários de senha, GitHub ou MFA: essas formas de login ainda são roadmap. Com `AUTH_DISABLED`,
   apresentar a função como indisponível e preservar o restante do portfólio público.
   O login é exclusivo do administrador: para outra conta Google, uma navegação HTML volta com
   `303` e `auth_error=AUTH_ADMIN_ONLY`, sem sessão. Comparar o código exato e mostrar o texto
   constante “Acesso negado. Apenas o administrador tem acesso.”; remover apenas `auth_error`
   com `history.replaceState`, preservando os demais parâmetros e hash. Não refletir o valor
   como HTML nem usá-lo como autorização. `Accept: application/json` preserva o erro `403` em JSON.
   Outros códigos de retorno e regras de state/replay estão no guia. Não iniciar logins em loop.
   Onde houver tela de acesso negado da UI, oferecer volta ao portfólio público e uma tentativa
   manual com a conta correta; não bloquear chat/reuniões. A recusa administrativa de uma identidade
   validada limpa os cookies; callback sem prova válida não encerra uma sessão administrativa.
3. **Gerenciar a sessão.** Os cookies são HttpOnly; o cliente usa `credentials: 'include'` nas rotas
   autenticadas e guarda CSRF somente em memória. Chamar `client.refresh()` antes da expiração quando
   necessário. Chamadas concorrentes na mesma instância compartilham uma única renovação; logout
   espera uma renovação em andamento. Não criar uma instância por componente nem renovar em todos
   os fetches. Coordenação entre abas é responsabilidade adicional do frontend; o exemplo não
   coordena abas/processos. Em 401, pedir novo login; em `403 AUTH_ADMIN_ONLY`, mostrar acesso negado;
   nos outros 403, conferir papel/Origin/CSRF. Sessão fora da política retorna estado anônimo. Não repetir
   mutações automaticamente para tentar corrigir um erro de autenticação.
4. **Consultar disponibilidade.** Usar `client.availability(from, to)` em janelas de até sete dias.
   Exibir `start`/`end` no `timeZone` retornado, inicialmente `America/Fortaleza`. A API entrega os
   instantes ISO, sem dados dos compromissos privados. Permitir escolher somente um slot retornado;
   ainda assim, tratar 409 porque a disponibilidade pode mudar. Identificar explicitamente
   `simulated:true` como teste.
5. **Preparar e revisar.** Usar `client.prepareProposal({start,name,email,topic})`. A proposta contém
   resumo imutável, expiração, token e versão de consentimento. Exibir os dados e o aviso de
   tratamento antes do botão “Confirmar solicitação”. Alterar dados exige nova proposta; fechar o
   formulário não cria pedido. Não guardar tokens em URL, analytics, logs ou armazenamento persistente.
6. **Confirmar somente no clique.** Criar uma chave UUID por confirmação e preservar chave e corpo
   se houver retry após falha de rede. `client.confirmRequest` é a única etapa que cria o PENDING.
   Nunca chamar esse método ao receber uma proposta/resposta da IA, ao montar o componente ou ao
   atualizar um estado React.
7. **Acompanhar e administrar.** Guardar `id` e `meetingToken` somente em memória e consultar com
   `client.status`. Para administração, usar `listMeetings` com cursor e `decide`; cada comando exige
   autenticação/admin no servidor e CSRF por cookie. Esconder botões por papel é apenas apresentação.
   Não incluir `AUTH_ADMIN_EMAIL` no bundle nem aceitar e-mail/papel por query para liberar acesso.
   Depois de 409, atualizar lista/disponibilidade. Evitar polling agressivo: o limite das rotas da
   Fase 3 é compartilhado por IP, inicialmente 20 requisições/minuto.

Exemplo de confirmação, chamado exclusivamente pelo botão após revisar a proposta:

```ts
const confirmation = {
  input: {
    proposalId: proposal.proposalId,
    confirmationToken: proposal.confirmationToken,
    consent: true as const,
    consentVersion: proposal.consentVersion,
  },
  idempotencyKey: crypto.randomUUID(),
};

async function onConfirmButtonClick() {
  // Desabilitar o botão enquanto envia. Reutilizar este objeto em um retry.
  const pending = await client.confirmRequest(confirmation.input, confirmation.idempotencyKey);
  // Estado privado em memória; nunca usar query string ou console.log.
  setPrivateMeeting({ id: pending.id, meetingToken: pending.meetingToken });
}
```

## Ativar ações do Orbe por último

Depois de implementar o formulário acima, usar `new OrbeClient(API, { meetingActions: true })`.
Esse cliente envia `X-Orbe-Capabilities: meetings-v1` em cada chamada. Quando receber
`actions[].type === 'confirm_meeting_request'`, renderizar a proposta no mesmo componente de
revisão/consentimento; não enviar `confirmationToken` de volta ao chat. A IA não efetiva o pedido,
não aprova, não cancela nem envia notificações. O formulário direto continua disponível para quem
preferir não enviar dados pessoais à LLM.

| Estado      | Texto/efeito sugerido                                                                                      |
| ----------- | ---------------------------------------------------------------------------------------------------------- |
| `PENDING`   | Solicitação enviada, aguardando análise; horário ainda não reservado.                                      |
| `APPROVED`  | Aprovada pela administração, aguardando confirmação da agenda.                                             |
| `CONFIRMED` | Evento verificado na agenda; não implica aceite do visitante ou link de videoconferência.                  |
| `REJECTED`  | Solicitação não aprovada.                                                                                  |
| `CANCELLED` | Decisão de cancelamento registrada; não afirmar que a remoção externa terminou apenas por esse estado.     |
| `FAILED`    | Não confirmada; aguardar orientação/atualização. O horário pode continuar protegido durante reconciliação. |

## Ambiente e aceite do proprietário

Em HTTP local, manter frontend e API no mesmo hostname (por exemplo, ambos `localhost` em portas
diferentes), CORS explícito e `AUTH_COOKIE_SECURE=false` somente no loopback autorizado. Em produção,
usar HTTPS/cookies Secure e preferir BFF na mesma origem/site. Os exemplos não escolhem os domínios
do servidor nem executam deploy. A preparação dos provedores está no
[guia operacional](../deployment/phase3.md) e no [preflight](../deployment/phase3-preflight.md).

O proprietário deve validar na UI: chat anônimo; login/logout; sessão expirada; visitante sem papel
admin; erros de CSRF/CORS; proposta expirada; consentimento explícito; retry sem duplicação; conflito
de horário; estados assíncronos; modo simulado visível; ausência de tokens nos logs e URLs. O
[smoke do navegador](../testing/auth-browser.md) valida o comportamento local dos cookies e fetch,
usando páginas de teste. Ele não executa essa matriz no frontend do proprietário.
