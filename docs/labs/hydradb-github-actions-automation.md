# HydraDB LAB — automacao GitHub Actions + Tailscale + SSH restrito

**Estado:** teste OFF no GitHub aprovado; teste SHADOW remoto desligado ate a autorizacao do operador. **Branch:** experiment/hydradb. Nenhuma alteracao em dev, main ou nos servicos de producao.

## Motivo do desenho

O repositorio GitHub e publico e o MiniMac executa servicos operacionais. Por isso **nao** instalar um runner self-hosted persistente no proprio MiniMac. O job usa um runner GitHub-hosted descartavel e a conexao Tailscale ja existente no repositorio. O acesso SSH usa uma chave **nova e dedicada**, diferente das chaves de deploy.

No MiniMac, authorized_keys inclui a opcao restrict,command, que limita essa chave a uma copia fixa do script em ~/.local/libexec/hydradb-lab-ci-forced-command. O comando remoto aceito deve ser exatamente um commit SHA de 40 caracteres. O script valida hostname, usuario, caminho LAB, branch, commit e configuracao; nao permite shell arbitrario. Nao usa sudo nem altera Docker Compose ou volumes.

A chave restringe o comando SSH, mas **nao transforma o host em um sandbox perfeito**: o script executa testes versionados dentro de Docker e o SHADOW precisa de rede de host para acessar o HydraDB vinculado ao loopback. Portanto, conferir alteracoes da branch antes de autorizar rodadas remotas.

## Funcionamento

Workflow: .github/workflows/hydradb-lab-validate.yml.

- offline: automatizado em push de arquivos relevantes da branch experiment/hydradb, sem segredos, banco, LLM ou acesso ao MiniMac. Typecheck, 14 testes, checagem do corpus e Gate 8 OFF.
- minimac-shadow: ignorado por padrao. Exige a variavel de repositorio HYDRADB_LAB_REMOTE_APPROVED=true, job OFF aprovado e as duas secrets especificas do LAB: HYDRADB_LAB_SSH_PRIVATE_KEY e HYDRADB_LAB_SSH_KNOWN_HOSTS.
- GitHub usa push como gatilho enquanto o arquivo existir apenas na branch experimental. workflow_dispatch exige o arquivo na branch padrao; **nao** copiar o workflow para main somente para habilitar esse botao.

## Unica configuracao no MiniMac — operador

Antes, alterar a senha SSH exposta anteriormente na conversa com passwd. Nao compartilhar senha, token ou chave privada neste chat.

Acessar o MiniMac na sua sessao Tailscale e copiar este bloco:

~~~bash
(
  set -euo pipefail
  cd ~/hydradb-lab/phasscode-platform
  test "$(git branch --show-current)" = experiment/hydradb
  git pull --ff-only origin experiment/hydradb
  bash -n scripts/hydradb-lab-ci-bootstrap.sh
  bash -n scripts/hydradb-lab-ci-forced-command.sh
  bash scripts/hydradb-lab-ci-bootstrap.sh
)
~~~

O bootstrap exige gh autenticado com acesso ao repositorio. Ele gera um par Ed25519 local em ~/.ssh/hydradb_lab_ci_ed25519, registra apenas a chave publica restrita em authorized_keys, copia o script de comando fixo para ~/.local/libexec e envia a chave privada LAB e a chave publica SSH do host para secrets do GitHub pelo gh, sem imprimi-las.

Saida esperada: HYDRADB_LAB_CI_KEY_RESTRICTED_AND_SECRETS_REGISTERED. Nenhum runner e instalado, nenhuma porta SSH publica e aberta e nenhum contêiner e iniciado.

**Depois de revisar o workflow**, habilitar expressamente a etapa remota:

~~~bash
gh variable set HYDRADB_LAB_REMOTE_APPROVED \
  --repo SladeSouzaSantos/phasscode-platform --body true
~~~

Avisar que a configuracao foi concluida. Um novo push em caminho monitorado inicia a etapa SHADOW; a conexao e as leituras reais ainda precisam ser homologadas.

## Revogacao

Interromper novos jobs remotos imediatamente sem afetar OFF:

~~~bash
gh variable set HYDRADB_LAB_REMOTE_APPROVED \
  --repo SladeSouzaSantos/phasscode-platform --body false
~~~

Opcionalmente revogar as duas secrets especificas e remover **somente** a linha correspondente a chave publica HydraDB LAB em authorized_keys. Nao limpar chaves alheias, Docker volumes ou configuracoes de DEV/MAIN.

## Aceite e limites

- [x] Workflow restrito a branch experiment/hydradb; token do workflow somente leitura.
- [x] Testes OFF rodaram automaticamente em GitHub-hosted.
- [x] Chave SSH dedicada, host key pin e comando forcado preparados em codigo.
- [ ] Operador executa bootstrap no MiniMac e habilita explicitamente variavel remota.
- [ ] Rodada GitHub Actions executa e confirma OFF + SHADOW reais no MiniMac.
- [ ] Operador decide se mantem acesso habilitado ou revoga variavel.

Esta automacao e do **Gate 8**. Ela nao executa por padrao benchmark de concorrencia, limpeza, seeds, deploy, migracoes, teste de LLM ou troca Neo4j/HydraDB. Os demais gates exigem novos protocolos de seguranca e teste.
