# Validação

Execute `npm ci --ignore-scripts`, `npm run check` e `npm audit --audit-level=high` na raiz.
`npm test` usa somente mock e servidores HTTP locais simulando o provedor. Não exige chave paga.

Os testes cobrem formato de contrato compartilhado, saúde, Swagger, mensagens e tamanho, token de
conversa, origens, rate limit, recusa de escopo, injection conhecida, concorrência, histórico,
rollback de geração, expiração, configuração, erros e timeout com abort. O adaptador LangChain é
exercitado de ponta a ponta até o transporte HTTP simulado, incluindo ferramentas nas duas APIs.
Isso não comprova disponibilidade nem comportamento de um modelo real específico.

A suíte `npm run test:integration` requer `TEST_DATABASE_URL` e `TEST_REDIS_URL`. Use banco e Redis
de teste descartáveis. Ela não usa skip automático quando as variáveis faltam. Aplica migrations
duas vezes, verifica retenção de quantidade de mensagens, hash de token, rollback, lock concorrente
no PostgreSQL e rate limit entre instâncias compartilhando Redis. Os testes removem somente os
registros criados por eles; o schema fica instalado. Não apontar para produção.

O caminho automatizado com dependências exclusivas e sem portas publicadas é:

```bash
docker compose -f compose.test.yaml up --build --abort-on-container-exit --exit-code-from tests
docker compose -f compose.test.yaml down --volumes
```

Para executar usando a infraestrutura local, crie um banco de testes separado ou inicie outro
projeto Compose com nome/portas diferentes. A CI provisiona PostgreSQL/Redis exclusivos por job.

A validação da imagem e de inicialização Compose está no job `docker`, que espera os outros jobs.
Ele aplica migrations e faz HTTP no container. Java, Calendar e mensageria de notificações terão
suítes próprias nas fases correspondentes, sem jobs vazios que aparentem validar código ausente.

No ambiente Windows desta sessão, ferramentas que consultam a conta de usuário ou iniciam
processos filhos podem falhar no sandbox (`uv_os_get_passwd`/permissões). A execução autorizada
fora desse sandbox resolveu tsx/Vitest. Isso não implica alterar configuração do projeto.

Consulte [PROGRESS.md](../PROGRESS.md) para resultados efetivamente medidos e limitações restantes.
