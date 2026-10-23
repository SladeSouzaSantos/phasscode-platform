# Arquitetura do incremento inicial

A plataforma começa com uma aplicação HTTP modular, `orbe-node`. Fastify foi escolhido pela
integração direta com TypeScript, plugins e injeção HTTP nos testes. NestJS também seria adequado,
mas sua estrutura adicional ainda não resolve uma necessidade deste incremento.

HTTP valida DTOs e traduz erros. `ChatService` coordena autorização da conversa, escopo, recuperação,
histórico, limites e geração. As portas `ConversationStore`, `KnowledgeRepository` e `ChatProvider`
permitem testar o caso de uso e trocar os adaptadores sem alterar suas regras.

O mesmo processo hospeda healthchecks, OpenAPI, autenticação e os endpoints de reuniões.
`worker-node` é um processo independente, com BullMQ/outbox e os adaptadores Calendar/notificações.
Não existe gateway separado ainda. A seleção Node/Java será configuração
interna do gateway; nunca um campo aceito do visitante.

PostgreSQL é a persistência durável. Redis implementa rate limiting compartilhado, com falha fechada
se a consulta ao broker falhar. O modo local usa memória limitada e avisa explicitamente; produção
recusa essa configuração. Nenhum dos modos exige LLM pago para testar regras.

O token de conversa é gerado pelo servidor, devolvido só na criação e armazenado apenas como hash
SHA-256. O UUID identifica a conversa, mas não autoriza acesso. Os tokens nunca são enviados ao LLM.

O histórico persistido é limitado por quantidade. A aplicação usa orçamento de caracteres para
selecionar contexto, e limita a saída e as rodadas do modelo. A recuperação lexical usa arquivos
versionados e fornece fontes ao cliente. A curadoria registra a origem dos fatos e distingue dados
históricos, declarados, previstos e ainda não confirmados. Embeddings serão avaliados conforme a
necessidade medida. Fontes retornadas são documentos consultados, sem validação automática de cada frase.

Concorrência: memória bloqueia o ID em processamento; PostgreSQL usa `FOR UPDATE NOWAIT` dentro de
uma transação que grava os dois lados do turno. Uma falha no provedor desfaz o turno inteiro.
Manter a transação durante a geração é um compromisso explícito de simplicidade, limitado pelo
timeout e pelo pool de dez conexões. Antes de escalar, medir latência e considerar reserva de turno
com lease e versionamento otimista, sem misturar respostas concorrentes.

Agendamento usa um único domínio e banco para os dois serviços de IA. A Fase 3 implementa
exclusão de intervalos no PostgreSQL, idempotência por operação e transactional outbox. O Calendar
é consultado novamente antes de criar evento com ID externo determinístico; confirmação interna
ocorre somente após sucesso verificável no calendário.

Infraestrutura futura não equivale a uma integração pronta: os perfis RabbitMQ e Kafka são apenas
serviços locais opcionais. BullMQ executa Calendar/notificações/lembretes; RabbitMQ tratará
comandos/mensagens com acknowledgments e DLQ; Kafka guardará eventos com offsets e retenção.

Os contratos e limites do incremento estão na [arquitetura de reuniões](meetings.md) e na
[autenticação central](authentication.md). O Orbe só recebe ferramentas de consulta e proposta;
criar pedido exige confirmação HTTP do visitante, e aprovação depende de papel/CSRF fora da IA.

Detalhes e consequências estão nos [ADRs](../adr/0001-foundation.md).
