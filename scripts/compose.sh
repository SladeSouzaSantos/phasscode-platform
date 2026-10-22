#!/usr/bin/env bash
# Uso: bash scripts/compose.sh <projeto> <env-file> [--proxy|--no-proxy] <argumentos Compose...>
# O arquivo de ambiente e o projeto sao sempre explicitos, inclusive em migrate/retention.
set -euo pipefail

if [[ $# -lt 3 ]]; then
  echo 'Usage: compose.sh <project-name> <env-file> [--proxy|--no-proxy] <compose arguments...>' >&2
  exit 2
fi
project=$1
env_file=$2
shift 2
[[ "$project" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || { echo 'Invalid Compose project name.' >&2; exit 2; }
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
if [[ "$env_file" != /* && ! "$env_file" =~ ^[A-Za-z]: ]]; then
  env_file="$repo_dir/$env_file"
fi
[[ -f "$env_file" ]] || { echo 'Environment file not found.' >&2; exit 2; }
proxy_mode=${PHASSCODE_USE_PROXY:-}
case "$1" in
  --proxy) proxy_mode=true; shift ;;
  --no-proxy) proxy_mode=false; shift ;;
esac
[[ -z "$proxy_mode" || "$proxy_mode" == true || "$proxy_mode" == false ]] || {
  echo 'PHASSCODE_USE_PROXY must be empty, true or false.' >&2
  exit 2
}
[[ $# -gt 0 ]] || { echo 'Compose command required.' >&2; exit 2; }
for argument in "$@"; do
  case "$argument" in
    -p*|-f*|--project-name|--project-name=*|--project-directory|--project-directory=*|--env-file|--env-file=*|--file|--file=*)
      echo 'Project, environment file and Compose files must be selected through this wrapper, not overridden in command arguments.' >&2
      exit 2
      ;;
  esac
done
cd -- "$repo_dir"
# O digest aplicado tem precedencia sobre tags locais do env-file em comandos operacionais.
# Nao executar conteudo do estado como shell; validar cada campo antes de exportar.
if [[ -e .deployment/attempted-image-ref && -z ${PHASSCODE_IMAGE:-} ]]; then
  echo 'Deployment attempt is incomplete. Inspect its database/image state and select PHASSCODE_IMAGE explicitly before proceeding.' >&2
  exit 2
fi
if [[ -e .deployment/image-ref ]]; then
  [[ -f .deployment/image-ref && -f .deployment/project-name && -f .deployment/http-port && -f .deployment/use-proxy ]] || {
    echo 'Incomplete deployment metadata; refusing a fallback to an environment-file image.' >&2
    exit 2
  }
  selected_image=$(cat -- .deployment/image-ref)
  selected_project=$(cat -- .deployment/project-name)
  selected_port=$(cat -- .deployment/http-port)
  selected_proxy=$(cat -- .deployment/use-proxy)
  [[ "$selected_image" =~ ^ghcr\.io/[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}$ &&
     "$selected_project" == "$project" &&
     "$selected_port" =~ ^[1-9][0-9]{0,4}$ &&
     ( "$selected_proxy" == true || "$selected_proxy" == false ) ]] || {
    echo 'Invalid deployment metadata or project mismatch; refusing operational changes.' >&2
    exit 2
  }
  (( 10#$selected_port <= 65535 )) || { echo 'Invalid saved HTTP port.' >&2; exit 2; }
  export PHASSCODE_IMAGE="${PHASSCODE_IMAGE:-$selected_image}"
  export PHASSCODE_HTTP_PORT="${PHASSCODE_HTTP_PORT:-$selected_port}"
  proxy_mode=${proxy_mode:-$selected_proxy}
fi
proxy_mode=${proxy_mode:-false}
files=(-f "$repo_dir/compose.yaml")
if [[ "$proxy_mode" == true ]]; then
  files+=(-f "$repo_dir/compose.proxy.yaml")
fi
# Evita imagem local de outro projeto quando -p substitui o nome presente no env-file.
export COMPOSE_PROJECT_NAME="$project"
docker compose --project-name "$project" --env-file "$env_file" "${files[@]}" "$@"
