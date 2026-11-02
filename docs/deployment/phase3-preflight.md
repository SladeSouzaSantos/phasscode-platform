# Pré-checagem offline e homologação controlada da Fase 3

`phase3:preflight` verifica a configuração com os mesmos loaders da aplicação. Não inicia API,
worker, navegador, Docker ou migrations; não conecta ao banco, Redis ou provedores; não carrega
`.env` automaticamente nem altera arquivos. A saída contém estados, códigos e nomes de variáveis,
sem valores, URLs, tokens, chave privada ou exceções brutas.

```bash
# Apenas variáveis já disponíveis no processo:
npm run phase3:preflight -- --target=host --json

# Leitura explícita de um arquivo escolhido pelo operador; não sobrescreve esse arquivo:
node --env-file=.env --import tsx scripts/phase3-preflight.ts --target=host --json
node --env-file=.env --import tsx scripts/phase3-preflight.ts --target=compose --json
```

Sem `--json`, a saída usa texto. `--help` explica o uso. Não colar valores de configuração no chat,
relatórios ou comandos compartilhados. Execute a pré-checagem no checkout e ambiente escolhidos.

| Código de saída | Significado                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------- |
| `0`             | Pré-requisitos dos módulos reais configurados **somente offline**; nenhuma homologação realizada   |
| `2`             | Configuração incompleta: recurso desativado, simulador ou variáveis necessárias ausentes           |
| `1`             | Opção, valor, política ou combinação inválida; falha ao interpretar o template também é sanitizada |

O alvo de configuração completa é login, reuniões, Calendar real, worker e pelo menos um canal
real (SMTP ou Telegram). Manter esses recursos desligados continua válido para o chat publicado;
o código `2` informa que a Fase 3 ainda não está configurada, sem habilitar nada automaticamente.

A checagem identifica política explícita de reuniões, CORS, dependências PostgreSQL/Redis,
credenciais parciais, simuladores em produção, TTLs e margem de lease.
`AUTH_ADMIN_EMAIL` válido é requisito do login habilitado; configurar somente o e-mail Google
verificado do proprietário, sem wildcard ou lista de contas. Se uma LLM real estiver
selecionada, também confere seus pré-requisitos e orçamento. Ela não comprova disponibilidade,
conteúdo criptográfico da chave, validade de credenciais, escopos Google, entrega de mensagens,
migrations aplicadas, saúde dos serviços ou integração do navegador.

Com `LLM_FALLBACK_ENABLED=true`, a pré-checagem reconhece as credenciais, modelos e cotas por
candidato, além do orçamento global. Recusa modelo OpenRouter sem variante gratuita e Cohere
trial no ambiente efetivo de produção. Veja [llm-fallback.md](llm-fallback.md).

## Host e Compose são ambientes diferentes

`--target=host` analisa exatamente as variáveis do processo. Executar Node no host exige URLs
próprias de PostgreSQL/Redis e portas acessíveis nesse host; não usar nomes internos de containers
como se fossem endereços locais. Nenhuma porta é aberta por este comando.

`--target=compose` lê apenas `x-app.environment` do `compose.yaml` deste repositório e modela suas
interpolações. O Compose injeta `DATABASE_URL` e `REDIS_URL` internas, mesmo quando essas duas
variáveis não existem no arquivo de entrada. Nesse alvo, a senha obrigatória de PostgreSQL é
conferida pelo nome `POSTGRES_PASSWORD`; a senha e as URLs renderizadas não são exibidas.
`PHASSCODE_NODE_ENV` controla o ambiente dos containers, com padrão de produção; `NODE_ENV` do
host não altera esse padrão. As variáveis que o template não repassa não são herdadas pelo modelo.

Esse alvo não executa `docker compose config`, não valida o daemon e não lê overlays adicionais,
segredos Docker ou overrides de linha de comando. Configurações customizadas exigem conferência
separada. Não publicar a saída integral de `docker compose config`, que pode conter segredos.

## Próximas etapas com contas controladas

Estas etapas são um roteiro futuro. O preflight não as executa. Confirmar antes o ambiente, o
calendário de homologação, destinatários e a autorização para cada efeito externo. Preservar
os `.env` existentes e separar a homologação de qualquer servidor publicado.

1. Preparar as configurações privadas seguindo o [guia da Fase 3](phase3.md). Usar cliente OAuth
   Calendar independente do Google OIDC. Executar a checagem offline e resolver seus códigos.
2. No ambiente autorizado, conferir `/ready` e heartbeat do worker. Esses sinais cobrem dependências
   locais e consumo, sem provar saúde de Google, SMTP ou Telegram. Iniciar o worker pode processar
   **todo o backlog** desse banco; não usá-lo como diagnóstico sem efeitos.
3. Homologar Google OIDC no navegador com a conta autorizada em `AUTH_ADMIN_EMAIL`, callback,
   cookies, refresh, CSRF e logout. Conferir concessão inicial auditada, revogação administrativa
   e recusa de outra conta sem criar usuário ou sessão: `303` com `auth_error=AUTH_ADMIN_ONLY`
   na navegação HTML e `403 AUTH_ADMIN_ONLY` em clientes JSON. Não restaurar
   automaticamente papel revogado; recuperação usa o procedimento operacional explícito.
4. Com acesso à conta explicitamente autorizado, consultar FreeBusy no calendário escolhido.
   Conexão/autenticação SMTP sem envio e autenticação do bot Telegram são verificações externas
   separadas, ainda não oferecidas pelo preflight; não tratar configuração presente como sucesso.
5. Após autorização de escrita, solicitar um horário futuro com dados sintéticos e e-mail controlado,
   aprovar, verificar um único evento, repetir o processamento pelo mesmo identificador e cancelar.
   Confirmar a remoção e a liberação da reserva. Não apagar evento alheio nem forçar estado por SQL.
6. Autorizar explicitamente o envio aos destinatários controlados. O fluxo pode emitir solicitações,
   aprovações, confirmações, cancelamentos e lembretes; não é um único envio. Conferir recebimento,
   falhas por canal, backlog e ausência de dados pessoais no Telegram. ACK SMTP não prova entrega final.
7. Registrar revisão, data, ambiente, responsável e resultado de cada etapa, sem segredos ou tokens.
   Confirmar a integração do frontend e avaliar v4 com modelo real somente no escopo autorizado.

Para antecipar lembretes, usar um ambiente isolado com política de teste explicitamente escolhida,
sem mudar as regras do serviço publicado. SMTP/Telegram podem duplicar uma mensagem se o envio
ocorrer antes de uma queda sem confirmação SQL. Criação Calendar ambígua seguida apenas de `404`
mantém a reserva protegida; sem evidência de conclusão, ela pode exigir investigação indefinidamente.
Os detalhes de reconciliação e os requisitos de aceite permanecem no [guia operacional](phase3.md)
e na [auditoria da retomada](../testing/phase3-resume-audit.md).
