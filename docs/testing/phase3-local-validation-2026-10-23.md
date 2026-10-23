# Pendências locais da Fase 3 — 23/10/2026

Base: `dev/64c8414`, com o trabalho local ainda sem commit. Este registro complementa a
[auditoria de 22/10](phase3-resume-audit.md). **A Fase 3 permanece em homologação**; o proprietário
confirmou que ainda não configurou Google OIDC, Calendar ou notificações e que implementará o frontend.

## Entregas desta etapa

- Pré-checagem offline `phase3:preflight`, com os loaders reais, alvos host/Compose, saída
  sanitizada e nenhuma rede, migration, worker ou leitura implícita de `.env`.
- Smoke de navegador real com Edge/Chromium, OIDC local assinado, redirecionamento HTTP,
  cookie HttpOnly, credenciais, preflight CORS real, CSRF, renovação e logout. O fixture permite
  somente suas origens loopback e não acessa Google.
- Qualificação reproduzível da imagem com API/worker separados, PostgreSQL/Redis exclusivos,
  rede interna sem portas e chave sintética efêmera. Confere o ID exato da imagem, checksums
  das migrations, chat legado, consentimento/idempotência, PENDING sem reserva e dois canais fake.
  A limpeza alcança somente o projeto UUID novo criado pelo comando.
- CI preparada para o smoke de navegador e a qualificação da imagem selecionada. Os jobs
  remotos não foram executados: continuam dependentes de uma publicação futura autorizada.
- Cliente de referência do frontend para auth/CSRF/renovação compartilhada, propostas,
  confirmação explícita, acompanhamento e administração. O cliente de chat mantém o padrão
  legado; ações exigem opção explícita. O [roteiro do proprietário](../api/phase3-frontend-handoff.md)
  define a sequência da integração visual e os cuidados com tokens e estados assíncronos.
- Avaliador v4 opt-in com teto de oito chamadas ao modelo, fixtures de reuniões e relatórios
  sem tokens. O plano padrão não chama o provedor. Os testes locais verificam que disponibilidade
  inventada e divulgação de token falham, sem persistir o segredo no relatório.

## Evidências

| Verificação                     | Resultado                                                                                                                                                                              |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                 | Aprovado: lint, formatação, tipos, OpenAPI, **275 testes locais** e build.                                                                                                             |
| Navegador                       | **1/1 aprovado**, Edge headless em HTTP loopback; detalhes em [auth-browser.md](auth-browser.md).                                                                                      |
| Avaliação v4 autorizada         | **4/4 cenários aprovados; 4/8 chamadas ao modelo** na OpenRouter. Dois cenários com geração/ferramentas e dois com barreiras determinísticas.                                          |
| Preflight da configuração local | `incomplete`, código de processo **2**, sem efeitos. Auth/reuniões/Calendar/worker/canais estão desativados e faltam credenciais; falta também `LLM_GLOBAL_MAX_CALLS` para a LLM real. |
| Build Docker                    | Imagem local `phasscode-phase3-closeout:r1` compilada; nenhuma publicação.                                                                                                             |
| PostgreSQL/Redis descartáveis   | **57/57 testes integrados aprovados**, em banco novo exclusivo; navegador separado desta suíte.                                                                                        |
| Infraestrutura                  | **28/28 aprovados**; harness otimizado sem alterar casos, asserções ou timeouts.                                                                                                       |
| Qualificação Docker             | API/worker separados na mesma imagem fixada pelo ID, cinco migrations/checksums, consentimento/idempotência/PENDING e dois canais fake; projeto de teste limpo.                        |
| Auditoria e smoke               | Zero vulnerabilidades reportadas; smoke HTTP compilado aprovado.                                                                                                                       |

**Total: 361 testes automatizados aprovados (275 locais + 28 infraestrutura + 57 integração +
1 navegador).** A avaliação com LLM e os smokes operacionais têm contagens separadas.

Execuções intermediárias tiveram timeouts intermitentes no harness Bash/Windows, inclusive em uma
repetição sem build ativo. O caso isolado e a suíte original depois passaram. O harness foi otimizado
reutilizando snapshots imutáveis de releases fake realmente executadas e validadas; cada cenário
recebe cópia independente, e falhas/transições posteriores continuam executadas. Os mesmos 28 casos
passaram em 33,77s, contra 59,59s antes, sem alterar asserções ou limites de tempo.

A primeira qualificação Docker encontrou uma falha real do novo runner no Windows: o ambiente
reduzido removia caminhos usados para localizar o plugin Compose. Esses caminhos de sistema foram
preservados, mantendo credenciais de aplicação excluídas; uma regressão foi adicionada. A execução
real seguinte passou e limpou seu projeto. Os dois containers adicionais de PostgreSQL/Redis desta
etapa foram parados; seus dados sintéticos ficaram preservados. Nenhum recurso preexistente foi removido.

O [JSON da avaliação](../../evaluation/reports/orbe-phase3-2026-10-23T05-28-13-586Z.json) registra
modelo, hashes do prompt/catálogo e contagem de chamadas. A
[conferência semântica pelo Codex](../../evaluation/reports/phase3-semantic-review.md) é separada
da revisão humana, que permanece pendente. Não houve consultas à agenda nem notificações reais.

## Comandos reproduzíveis

```bash
npm run check
npm run test:infrastructure
npm run test:browser
npm run smoke
npm audit --audit-level=high

# Imagem já compilada localmente; rede e dados exclusivos do próprio teste:
npm run smoke:phase3:docker -- --image IMAGEM_CANDIDATA_LOCAL

# Configuração do processo, sem carregar arquivo:
npm run phase3:preflight -- --target=host --json
# Escolha explícita de arquivo, sem sobrescrevê-lo e sem conectar:
node --env-file=.env --import tsx scripts/phase3-preflight.ts --target=compose --json

# Apenas plano, sem chamada ao provedor:
npm run eval:orbe:phase3
```

`test:integration` continua separado e exige `TEST_DATABASE_URL`/`TEST_REDIS_URL` de bancos
descartáveis; a suíte de navegador tem configuração opt-in própria. Preparação do browser em CI:
`npx playwright-core install --with-deps chromium`. O smoke Docker recusa daemon remoto e fixa
a imagem candidata pelo ID antes do startup. Não lê o `.env` do projeto.

## O que depende do proprietário

1. Preencher as configurações privadas tomando `.env.example` como referência, sem substituir
   os valores existentes; definir orçamento de LLM e escolher um calendário/destinatários de teste.
2. Homologar o login Google e a autorização Calendar independente, com as operações externas
   controladas descritas no [runbook](../deployment/phase3-preflight.md).
3. Homologar recebimento SMTP/Telegram, execução contínua do worker, lembretes e recuperação.
4. Implementar a UI conforme o [handoff](../api/phase3-frontend-handoff.md), que foi solicitado pelo
   proprietário; não foi feita alteração em seu repositório visual.
5. Conferir TLS/CORS/proxy no servidor e CI remota desta revisão após autorização futura de
   publicação. Commit, push, merge, deploy e migrations no servidor não foram executados.

A operação manual do CLI administrativo continua sem execução: houve bloqueio da revisão
automática na sessão anterior, sem tentativa de contorná-lo. A avaliação OpenRouter teve uma
rejeição inicial por falta de escopo específico do envio; depois da autorização explícita do
proprietário para conteúdo, destino e teto de oito chamadas, foi executada e concluída no limite.

Nenhum `.env` existente foi sobrescrito. Os testes e migrations desta etapa usam somente dados
sintéticos e dependências descartáveis; os serviços e bancos preexistentes permanecem preservados.
