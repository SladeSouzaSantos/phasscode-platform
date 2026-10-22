#!/usr/bin/env bash
# Linux: bash scripts/deploy.sh <development|production> <image@sha256:...> <git-sha> [--apply]
# Sem --apply, imprime somente o plano. Nao altera Git, Nginx, DNS, redes ou volumes existentes.
set -euo pipefail

fail() { echo "ERROR: $*" >&2; exit 1; }
[[ $# -eq 3 || ( $# -eq 4 && "$4" == '--apply' ) ]] || fail 'Invalid arguments.'
target=$1
image_ref=$2
revision=$3
[[ "$image_ref" =~ ^ghcr\.io/[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}$ ]] || fail 'An immutable GHCR digest is required.'
[[ "$revision" =~ ^[a-f0-9]{40}$ ]] || fail 'A full Git commit SHA is required.'
case "$target" in
  production) project=phasscode-platform; branch=main; port=3000 ;;
  development) project=phasscode-platform-dev; branch=dev; port=3001 ;;
  *) fail 'Choose production or development.' ;;
esac
projects_root=${PHASSCODE_PROJECTS_ROOT:-/opt/projects}
[[ "$projects_root" == /* ]] || fail 'Projects root must be absolute.'
project_dir="$projects_root/$project"
printf 'Plan: environment=%s project=%s branch=%s port=127.0.0.1:%s image=%s revision=%s\n' \
  "$target" "$project" "$branch" "$port" "$image_ref" "$revision"
if [[ ${4:-} != '--apply' ]]; then
  echo 'No changes performed. --apply is required to execute this deployment.'
  exit 0
fi

[[ -d "$project_dir/.git" && -f "$project_dir/.env" ]] || fail 'Prepare the checkout and its private .env first.'
actual_root=$(cd -- "$projects_root" && pwd -P)
actual_project=$(cd -- "$project_dir" && pwd -P)
[[ "$actual_project" == "$actual_root/$project" ]] || fail 'Project directory resolves outside its expected checkout.'
cd -- "$project_dir"
[[ $(git branch --show-current) == "$branch" ]] || fail 'Checkout branch does not match the deployment environment.'
[[ $(git rev-parse HEAD) == "$revision" ]] || fail 'Checkout revision differs from the tested release.'
[[ -z $(git status --porcelain) ]] || fail 'Checkout has uncommitted changes.'

mkdir -- .deploy-lock 2>/dev/null || fail 'Another deployment holds .deploy-lock; investigate before retrying.'
trap 'rmdir -- .deploy-lock' EXIT
export PHASSCODE_IMAGE="$image_ref"
export PHASSCODE_HTTP_PORT="$port"
export COMPOSE_PROJECT_NAME="$project"
proxy_mode=${PHASSCODE_USE_PROXY:-}
if [[ -z "$proxy_mode" && -e .deployment/image-ref ]]; then
  [[ -f .deployment/use-proxy ]] || fail 'Existing deployment is missing its proxy mode; inspect its network configuration first.'
  proxy_mode=$(cat -- .deployment/use-proxy)
fi
proxy_mode=${proxy_mode:-false}
compose=(bash "$project_dir/scripts/compose.sh" "$project" "$project_dir/.env")
case "$proxy_mode" in
  true) compose+=(--proxy) ;;
  false) compose+=(--no-proxy) ;;
  *) fail 'PHASSCODE_USE_PROXY or saved proxy mode must be true or false.' ;;
esac
"${compose[@]}" config --quiet
"${compose[@]}" --profile maintenance pull api migrate retention
image_revision=$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$image_ref")
[[ "$image_revision" == "$revision" ]] || fail 'Pulled image revision differs from the tested release; database and running services were not changed.'

# O historico descreve imagens; nao representa backup ou rollback de schema/dados.
mkdir -p -- .deployment
if [[ -f .deployment/image-ref ]]; then
  cp -- .deployment/image-ref .deployment/previous-image-ref
fi
printf '%s\n' "$image_ref" > .deployment/attempted-image-ref
"${compose[@]}" up -d --no-build --wait postgres redis
"${compose[@]}" run --rm --no-deps migrate
if ! "${compose[@]}" up -d --no-build --no-deps --wait api; then
  fail 'API failed after migration may have changed the database. No automatic database/image rollback was attempted; inspect compatibility and recover manually.'
fi
container_id=$("${compose[@]}" ps -q api)
[[ -n "$container_id" ]] || fail 'API container is missing.'
actual_image=$(docker inspect --format '{{.Config.Image}}' "$container_id")
[[ "$actual_image" == "$image_ref" ]] || fail 'Running API does not use the tested immutable image.'
actual_revision=$(docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$container_id")
[[ "$actual_revision" == "$revision" ]] || fail 'Running image revision differs from the tested release.'
curl --fail --silent --show-error --max-time 20 "http://127.0.0.1:$port/ready" |
  grep -Eq '"status"[[:space:]]*:[[:space:]]*"ready"' || fail 'Readiness verification failed; migration is not reverted automatically.'
printf '%s\n' "$project" > .deployment/project-name
printf '%s\n' "$port" > .deployment/http-port
printf '%s\n' "$proxy_mode" > .deployment/use-proxy
mv -- .deployment/attempted-image-ref .deployment/image-ref
printf 'Verified locally: %s at 127.0.0.1:%s (no LLM calls). Nginx/public verification is separate.\n' "$image_ref" "$port"
