# Fallback de LLM

O backend pode alternar **OpenRouter → Gemini → Groq → Cohere**, nessa ordem, usando um modelo
e uma chave por provedor. O recurso começa desativado; provedores sem configuração são ignorados.
`LLM_FALLBACK_ENABLED=true` seleciona a cadeia real mesmo com `LLM_PROVIDER=mock`. As variáveis
legadas `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL` e `LLM_API_MODE` ficam fora dessa seleção.
Desativar a flag restaura a configuração legada. Não existe troca automática para mock.

Não é necessário duplicar a chave OpenRouter em `LLM_API_KEY` e `LLM_OPENROUTER_API_KEY`.
Com a cadeia ativa, use somente os campos por provedor e remova os campos genéricos inativos,
se desejar. Os dois conjuntos continuam aceitos para preservar as configurações anteriores.
No exemplo, as janelas por provedor ficam comentadas: todas herdam a janela global até que
um override seja explicitamente configurado.

## Configurar as contas

1. OpenRouter: crie uma chave comum em [API Keys](https://openrouter.ai/settings/keys), escolha um
   modelo gratuito com ferramentas. O backend aceita somente IDs terminados em `:free` ou
   `openrouter/free`, conforme a [documentação de variantes gratuitas](https://openrouter.ai/docs/guides/routing/model-variants/free).
   O roteador gratuito pode selecionar modelos diferentes; confira sua qualidade no Orbe.
2. Gemini: crie uma chave em [Google AI Studio](https://aistudio.google.com/apikey). Escolha um
   modelo com tool calling e **Free Tier** na [tabela oficial](https://ai.google.dev/gemini-api/docs/pricing).
   Use projeto sem faturamento habilitado para permanecer no plano gratuito. A chave é da Gemini
   API, independente dos clientes OAuth do login e Calendar.
3. Groq: crie uma chave em [Groq Console](https://console.groq.com/keys), mantenha a conta no
   **Free Plan** e selecione um [modelo com ferramentas](https://console.groq.com/docs/tool-use).
   Consulte os limites da conta em [Rate Limits](https://console.groq.com/docs/rate-limits).
4. Cohere: a chave de avaliação gratuita serve somente para experimentação permitida pelos termos.
   **Ela não permite produção nem uso comercial.** O backend recusa esse candidato quando
   `NODE_ENV=production`; no Compose, o valor efetivo é `PHASSCODE_NODE_ENV`, cujo padrão é
   `production`. Para o portfólio publicado, deixe os quatro campos Cohere vazios. Veja
   [Cohere Pricing](https://cohere.com/pricing) e [limites de avaliação](https://docs.cohere.com/docs/rate-limits).

Não há modelo predefinido para Gemini/Groq/Cohere: disponibilidade, preços e permissões mudam.
Selecione IDs exatos disponíveis na conta, com **tool calling**. A resposta final é texto;
`response_format` não é necessário. As ferramentas são validadas localmente por Zod em todos os
transportes, inclusive quando o provedor não suporta `strict`. Modelos OpenRouter que exigem
replay de metadados próprios de reasoning ainda precisam de qualificação específica; a integração
não implementa todas as extensões de todos os modelos.

Uma chave Gemini ou Groq não informa ao backend se a conta é gratuita ou faturada. Por isso,
as cotas locais **não garantem custo zero** nem substituem as configurações de faturamento da
conta. O sistema não habilita cobrança nem faz upgrade de plano; usa somente os IDs escolhidos
pelo operador, sem selecionar modelos substitutos automaticamente.

## Preencher o `.env` existente

Acrescente os novos campos de [.env.example](../../.env.example), preservando os demais valores.
Exemplo inicial **com OpenRouter apenas**, com uma cota local escolhida para demonstração:

```dotenv
LLM_FALLBACK_ENABLED=true
LLM_GLOBAL_MAX_CALLS=30
LLM_GLOBAL_WINDOW_MS=86400000
LLM_TIMEOUT_MS=15000
LLM_FALLBACK_ATTEMPT_TIMEOUT_MS=4000
LLM_FALLBACK_MAX_ATTEMPTS_PER_TURN=6
LLM_FALLBACK_COOLDOWN_MS=60000
LLM_FALLBACK_MAX_COOLDOWN_MS=86400000

LLM_OPENROUTER_API_KEY=SUA_CHAVE_OPENROUTER
LLM_OPENROUTER_MODEL=openrouter/free
LLM_OPENROUTER_MAX_CALLS=10
LLM_OPENROUTER_WINDOW_MS=86400000
```

Os números acima são limites internos de exemplo, **não cotas prometidas pelos fornecedores**.
Redis e `LLM_GLOBAL_MAX_CALLS` são obrigatórios. No host, configure `REDIS_URL` para seu Redis;
o Compose usa o endereço interno já definido no projeto.

Para acrescentar Gemini e Groq, preencha cada trio abaixo. Substitua os nomes ilustrativos por
IDs reais do catálogo gratuito; não envie segredos pelo chat ou ao repositório:

```dotenv
LLM_GEMINI_API_KEY=SUA_CHAVE_GEMINI
LLM_GEMINI_MODEL=ID_GEMINI_FREE_COM_TOOLS
LLM_GEMINI_MAX_CALLS=10
LLM_GEMINI_WINDOW_MS=86400000

LLM_GROQ_API_KEY=SUA_CHAVE_GROQ
LLM_GROQ_MODEL=ID_GROQ_FREE_COM_TOOLS
LLM_GROQ_MAX_CALLS=10
LLM_GROQ_WINDOW_MS=86400000
```

Para experimentar Cohere em desenvolvimento não comercial, preencha também
`LLM_COHERE_API_KEY`, `LLM_COHERE_MODEL` e `LLM_COHERE_MAX_CALLS`.
`LLM_COHERE_WINDOW_MS` permite escolher uma janela maior conforme o limite de avaliação da conta.
Não altere o modo do servidor publicado para contornar a restrição de produção.

| Variáveis                                       | Regra                                                                                                       |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `LLM_FALLBACK_ENABLED`                          | `false` por padrão; `true` ativa somente os candidatos novos.                                               |
| `LLM_{OPENROUTER,GEMINI,GROQ,COHERE}_API_KEY`   | Uma chave privada por provedor.                                                                             |
| `LLM_{OPENROUTER,GEMINI,GROQ,COHERE}_MODEL`     | Um ID exato por provedor; sem modelos predefinidos.                                                         |
| `LLM_{OPENROUTER,GEMINI,GROQ,COHERE}_MAX_CALLS` | Cota local explícita, de 1 a 1.000.000 reservas por janela.                                                 |
| `LLM_{OPENROUTER,GEMINI,GROQ,COHERE}_WINDOW_MS` | Vazio herda a janela global; de 1 segundo a 31 dias.                                                        |
| `LLM_FALLBACK_ATTEMPT_TIMEOUT_MS`               | Prazo de uma tentativa; vazio deriva `min(5000, LLM_TIMEOUT_MS)`; nunca supera o prazo total.               |
| `LLM_FALLBACK_MAX_ATTEMPTS_PER_TURN`            | De 1 a 6; padrão 6, compartilhado entre todas as rodadas e provedores.                                      |
| `LLM_FALLBACK_COOLDOWN_MS`                      | Pausa após falha transitória; padrão 60 segundos.                                                           |
| `LLM_FALLBACK_MAX_COOLDOWN_MS`                  | Teto de pausa; padrão 24 horas; cobre a pausa básica. Falta de crédito/chave/modelo inválido usa esse teto. |

Para desabilitar um candidato, deixe **todos os seus campos vazios**. Configuração parcial
impede a inicialização. `OPENROUTER_REASONING_ENABLED`, quando definido, aplica-se somente ao
candidato OpenRouter e exige sua presença. URLs são fixas nos adaptadores oficiais; visitantes
e variáveis de ambiente não podem mudar os destinos da cadeia.

Ao aplicar depois no seu ambiente, será necessário reconstruir a imagem com o código novo e
recriar a API com as variáveis novas. Somente `--force-recreate` com uma imagem anterior não inclui
esta implementação. Nenhum build de release, deploy ou alteração de `.env` é realizado por este guia.

## Limite de conversa versus cotas reais

O frontend define `VITE_ORBE_MAX_USER_TURNS=100` para 100 perguntas por
conversa. `0` desliga apenas o limite de perguntas na interface.
O frontend precisa ser recompilado para aplicar essa variável de ambiente.

O backend controla o consumo independentemente por meio de
`LLM_GLOBAL_MAX_CALLS`, `LLM_*_MAX_CALLS` e limites HTTP.
Uma pergunta pode gerar várias chamadas, inclusive tentativas de fallback.
Modelos gratuitos continuam sujeitos a cotas reais, por isso esses orçamentos
devem permanecer positivos e explícitos no servidor.

Quando todos os candidatos estão sob cota ou cooldown, a API retorna
`LLM_PROVIDERS_LIMITED` (503), com `Retry-After`, se calculável;
o frontend exibe a condição ao visitante. A cota global retorna
`LLM_BUDGET_EXHAUSTED` (429). Erros de conexão ou timeout continuam distintos.

## Comportamento e limites

- Status upstream 402, 408, 429, 5xx, falha de rede e timeout individual permitem avançar.
  Chave inválida (401) e modelo removido (404) também avançam, com pausa longa.
- Erros 400/403/422, recusas de política reconhecidas, respostas/ferramentas inválidas, problemas
  de contexto e falhas da agenda não são repetidos em outro provedor.
- `Retry-After` em segundos ou data HTTP é respeitado até o teto configurado. A pausa é
  persistida no Redis e compartilhada por rota/modelo/credencial entre réplicas no mesmo namespace.
  Não há espera ativa dentro da requisição; os próximos turnos podem ignorar o candidato pausado.
- Cada tentativa HTTP reserva primeiro a cota do provedor e depois a global. Reservas, falhas e
  cancelamentos não são reembolsados. Uma recusa global ou cancelamento depois da primeira reserva
  pode consumir crédito local sem enviar HTTP; esse comportamento é conservador.
- Cota local de um provedor esgotada permite avançar. **Cota global esgotada interrompe toda a
  cadeia** com `LLM_BUDGET_EXHAUSTED` (429). Redis indisponível interrompe as chamadas.
- O prazo `LLM_TIMEOUT_MS` é único para toda a resposta; não é multiplicado pelos provedores.
  Com pouco tempo restante, a requisição pode terminar antes de tentar os quatro.
- O turno tem até três rodadas bem-sucedidas do modelo e duas rodadas de ferramentas. A seleção
  avança pela cadeia e não retorna a um provedor anterior no mesmo turno. Ferramentas já
  executadas e a proposta privada permanecem no mesmo fluxo; o fallback não reinicia o chat.
- Todos indisponíveis resultam em erro explícito; todos pausados podem resultar em 503 com
  `Retry-After`. A criação de reuniões continua exigindo confirmação fora da LLM.

Os contadores por credencial e o global usam operações atômicas Redis. Réplicas devem compartilhar
namespace e políticas de cotas. Alterar limite/janela de uma chave com janela ativa causa recusa
por política divergente; espere sua expiração antes de trocar a política. Não limpe o banco para
renovar crédito. As cotas contam chamadas, não tokens/minuto nem limites externos de outros apps.

O endpoint `POST /api/v1/chat` conserva seu contrato, tokens e opt-in de reuniões. Por compatibilidade,
`meta.provider` permanece `openai-compatible`, sem revelar a lista de fornecedores. Os logs de
invocação concluída incluem somente provedor, número acumulado de tentativas no turno e uso de
fallback. Erros brutos, chaves e prompts não são registrados por esse recurso.

O contexto da conversa poderá ser enviado a mais de um fornecedor. As assinaturas de ferramentas
Gemini são preservadas no replay; importação de chamadas de outro provedor segue a exceção
[documentada pelo Google](https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures#faqs).
Parâmetros não suportados são omitidos em cada transporte. `store:false` é enviado à OpenRouter;
isso não configura retenção nas contas externas. Atualize a informação ao visitante sobre os
fornecedores efetivamente habilitados e confira as políticas do plano gratuito escolhido.

## Validação

`npm run check` valida configuração, cotas, controlador, adaptadores HTTP locais, assinaturas de
ferramentas, compatibilidade legada e ausência de efeitos duplicados. `npm run test:integration`
acrescenta Redis real descartável e concorrência entre instâncias. `npm run test:infrastructure`
confere a interpolação das variáveis no Compose, sem iniciar serviços.

Não foram chamadas as contas reais dos quatro provedores para qualificar esta alteração. Depois
de configurar suas chaves, a homologação externa continua necessária. `eval:orbe:phase3 -- --live`
também respeita a cadeia e o teto global próprio de oito tentativas; com o fallback ativo, pode
enviar os dados da avaliação a qualquer um dos candidatos configurados. A execução sem `--live`
continua sem chamadas. Consulte o [relatório de validação](../testing/llm-fallback-2026-10-24.md).
