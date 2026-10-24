# Validação do fallback de LLM — 24/10/2026

Base: branch `dev`, commit `5770836`. O incremento permanece sem commit e sem deploy.
O endpoint `POST /api/v1/chat` mantém o contrato existente; a cadeia é opt-in e começa desligada.

## Resultados

| Verificação                     | Resultado                                                                                                                                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                 | Aprovado: lint, formatação, tipos, contratos, 359 testes locais e build.                                                                                                                       |
| Regressão adicional de contexto | Aprovada posteriormente: sete casos em `llm-fallback.test.ts`, incluindo um novo caso; **360 testes locais únicos** no total.                                                                  |
| `npm run test:integration`      | **63 testes aprovados**, oito arquivos, PostgreSQL/Redis novos e descartáveis. Inclui quatro casos de cooldown Redis e dois do fallback com HTTP local.                                        |
| `npm run test:infrastructure`   | **29 testes aprovados**; interpolação Compose com valores sintéticos, sem daemon ou deploy.                                                                                                    |
| `npm run smoke`                 | Processo compilado, health/readiness e dois turnos HTTP com mock aprovados; fallback explicitamente desligado.                                                                                 |
| Build Docker runtime            | Aprovado, imagem local `phasscode-llm-fallback:20261024`.                                                                                                                                      |
| `smoke:phase3:docker`           | Aprovado com essa imagem: projeto descartável, API/worker separados, integrações simuladas e cleanup próprio.                                                                                  |
| Bootstrap do fallback na imagem | Aprovado com os quatro candidatos sintéticos, Redis e `LLM_PROVIDER=mock`; flag selecionou `openai-compatible`. Rede Docker interna sem internet, somente readiness e saudação determinística. |

Total: **452 testes únicos aprovados**, além dos smokes e da qualificação de imagem. O navegador
não foi reexecutado neste incremento; sua validação anterior está no relatório de 23/10.
As contas reais de OpenRouter/Gemini/Groq/Cohere não foram chamadas nesta validação.

Imagem qualificada:
`sha256:819b0dc6b478c9b6ffb641bc2d63a991e08e4832ab6d1f44fd1f0887950cbede`.
Os dados PostgreSQL/Redis de teste ficaram em tmpfs, sem reutilizar bancos existentes.
Migrations ocorreram apenas no PostgreSQL descartável da integração/qualificação.

## Cobertura do incremento

- Ordem fixa dos quatro candidatos, exclusão dos ausentes e recusa de credenciais/modelo/cota
  incompletos. Sem dependências SDK adicionais ou alterações no OpenAPI.
- Recusa de modelos OpenRouter sem variante gratuita; restrição de Cohere trial em produção,
  inclusive ao modelar o `PHASSCODE_NODE_ENV` efetivo do Compose.
- HTTP simulado 402/408/429/5xx, falhas de conexão, chave/modelo indisponíveis, `Retry-After`
  numérico/data, timeout por tentativa e cancelamento global.
- Erros de política/requisição/ferramentas, problemas de contexto e falhas Redis/globalbudget
  interrompem o fluxo; não iniciam outro fornecedor.
- Até seis tentativas por turno, sem retry automático do SDK, deadline global preservado e
  progressão monotônica dos candidatos durante as rodadas de ferramentas.
- Cooldown Redis atômico entre clientes; concorrência conserva maior TTL, expiração libera
  probes e estado sem TTL/corrompido é recusado.
- Falha OpenRouter seguida de Gemini com dois clientes Redis; outro turno ignora o OpenRouter
  pausado, e a cota global impede uma quarta chamada HTTP. Cota local esgotada não envia HTTP
  ao candidato nem consome a global por essa negativa.
- Cadeia HTTP completa até Cohere preserva a resposta aceita pelo schema estrito legado,
  incluindo continuidade/token da conversa, sem campos novos em `meta`.
- Troca depois de preparar proposta mantém a ação privada, executa a preparação uma única vez
  e não envia o token de confirmação ao próximo modelo. Aprovação permanece fora da LLM.
- Assinaturas Gemini são preservadas em múltiplas rodadas; traces externos têm origem explícita.
  Ausência de assinatura própria obrigatória falha antes de ferramentas. Outros transportes
  não recebem esses metadados privados do Gemini.
- Medição do contexto inclui metadados brutos e JSON efetivamente transmitido. O novo caso
  confirma que escaping excessivo impede HTTP e reservas de ambas as cotas.
- Preflight offline reconhece as novas variáveis; avaliadores exibem teto conservador de seis
  tentativas por mensagem, e a avaliação v4 conserva seu próprio teto global de oito tentativas.

## Limites da evidência

Os testes comprovam configuração, transporte compatível e comportamento da aplicação contra
fixtures controladas. Não comprovam validade das chaves, disponibilidade/qualidade dos modelos,
gratuidade da conta, cotas externas, retenção dos fornecedores ou sucesso no minimac-server.
Modelos devem oferecer tool calling; extensões específicas de reasoning OpenRouter continuam
exigindo qualificação própria. Não há fallback automático após erro semântico ou de política.

Nenhum `.env` existente foi sobrescrito, nem houve commit, push, merge, publicação de imagem,
deploy ou migrations no servidor. A UI do portfólio permanece sob responsabilidade do proprietário;
não precisa mudar seu contrato HTTP para usar o fallback. O guia de ativação está em
[deployment/llm-fallback.md](../deployment/llm-fallback.md). A homologação externa da Fase 3
permanece uma etapa independente.

## Revisão das variáveis de ambiente

A revisão seguinte confirmou 112 nomes distintos no exemplo anterior, sem duplicação literal.
O template foi reorganizado por host/Compose e por modo de LLM, ficando com 103 atribuições
ativas únicas: as quatro janelas opcionais por provedor ficaram comentadas e as cinco flags
de diagnóstico desativadas por padrão saíram do exemplo. A URL do PostgreSQL no host ficou
vazia para não repetir credenciais já definidas para o Compose.

Os nomes dos campos de fallback agora têm uma definição compartilhada pelo loader e preflight.
Duas regressões verificam unicidade do template e leitura com as mesmas regras do env-file do
Node, conservando os padrões offline. Nessa revisão, `npm run check` passou com **362 testes
locais**, lint, formatação, tipos, contratos e build; `test:infrastructure` passou com **29 testes**.
As integrações Redis/PostgreSQL, navegador e qualificação Docker não foram repetidas nessa
limpeza sem mudança de comportamento. Os resultados anteriores acima permanecem históricos.
O `.env` existente foi preservado.
