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
  production)
    project=phasscode-platform
    branch=main
    # PROD requires an explicit, verified free loopback port. Never overwrite Grafana/DEV.
    port=${PHASSCODE_HTTP_PORT:-}
    [[ "$port" =~ ^[1-9][0-9]{3,4}$ ]] || fail 'Production requires an explicit numeric PHASSCODE_HTTP_PORT.'
    (( 10#$port >= 1024 && 10#$port <= 65535 )) || fail 'PHASSCODE_HTTP_PORT must be between 1024 and 65535.'
    [[ "$port" != 3000 && "$port" != 3001 ]] || fail 'PHASSCODE_HTTP_PORT 3000 (Grafana) and 3001 (DEV) are reserved.'
    ;;
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
# R4: an interrupted attempt may already have changed schema or sent external effects.
# Refuse a second attempt before touching the deployment lock, state or services.
[[ ! -L .deployment ]] || fail 'R4_UNSAFE_STATE_DIR: .deployment must not be a symlink.'
[[ ! -e .deployment/attempted-image-ref && ! -L .deployment/attempted-image-ref &&
   ! -e .deployment/attempted-phase && ! -L .deployment/attempted-phase ]] ||
  fail 'R4_UNRECONCILED_ATTEMPT: supervised recovery is required before retrying.'

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
# A running or unreviewed legacy worker must be retired before any migration.
# Docker label discovery is read-only and restricted to the exact Compose project.
[[ ! -L .deployment/worker-retired && ! -L .deployment/worker-stop-attempted ]] ||
  fail 'LEGACY_WORKER_UNSAFE_STATE: inspect the deployment metadata.'
[[ ! -e .deployment/worker-stop-attempted ]] ||
  fail 'LEGACY_WORKER_STOP_INCOMPLETE: inspect and reconcile the supervised retirement.'
worker_filter=("label=com.docker.compose.project=$project" "label=com.docker.compose.service=worker")
worker_all=$(docker ps --all --filter "${worker_filter[0]}" --filter "${worker_filter[1]}" --format '{{.ID}}')
worker_running=$(docker ps --filter "${worker_filter[0]}" --filter "${worker_filter[1]}" --format '{{.ID}}')
[[ -z "$worker_running" ]] ||
  fail 'LEGACY_WORKER_RUNNING: retire the legacy worker with scripts/retire-worker.sh before deployment.'
if [[ -n "$worker_all" ]]; then
  [[ "$worker_all" != *
image_revision=$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$image_ref")
[[ "$image_revision" == "$revision" ]] || fail 'Pulled image revision differs from the tested release; database and running services were not changed.'

# O historico descreve imagens; nao representa backup ou rollback de schema/dados.
mkdir -p -- .deployment
# Only fixed phase names; never secrets or visitor content.
mark_attempt_phase() { printf '%s\n' "$1" > .deployment/attempted-phase; }
if [[ -f .deployment/image-ref ]]; then
  cp -- .deployment/image-ref .deployment/previous-image-ref
fi
printf '%s\n' "$image_ref" > .deployment/attempted-image-ref
# Do not stop/restart workers in the general-purpose deploy path.
# Recheck after pulling in case an operator restarted the retired service.
[[ -z "$(docker ps --filter "${worker_filter[0]}" --filter "${worker_filter[1]}" --format '{{.ID}}')" ]] ||
  fail 'LEGACY_WORKER_RUNNING: a worker appeared during release preparation; supervised recovery required.'
mark_attempt_phase 'dependencies-start-requested'
"${compose[@]}" up -d --no-build --wait postgres redis
mark_attempt_phase 'migration-requested'
"${compose[@]}" run --rm --no-deps migrate
mark_attempt_phase 'api-start-requested'
if ! "${compose[@]}" up -d --no-build --no-deps --wait api; then
  fail 'API failed after migration may have changed the database. No automatic database/image rollback was attempted; inspect compatibility and recover manually.'
fi
container_id=$("${compose[@]}" ps -q api)
[[ -n "$container_id" ]] || fail 'API container is missing.'
actual_image=$(docker inspect --format '{{.Config.Image}}' "$container_id")
[[ "$actual_image" == "$image_ref" ]] || fail 'Running API does not use the tested immutable image.'
actual_revision=$(docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$container_id")
[[ "$actual_revision" == "$revision" ]] || fail 'Running image revision differs from the tested release.'
mark_attempt_phase 'readiness-requested'
curl --fail --silent --show-error --max-time 20 "http://127.0.0.1:$port/ready" |
  grep -Eq '"status"[[:space:]]*:[[:space:]]*"ready"' || fail 'Readiness verification failed; migration is not reverted automatically.'
printf '%s\n' "$project" > .deployment/project-name
printf '%s\n' "$port" > .deployment/http-port
printf '%s\n' "$proxy_mode" > .deployment/use-proxy
mark_attempt_phase 'promotion-requested'
mv -- .deployment/attempted-image-ref .deployment/image-ref
rm -- .deployment/attempted-phase
printf 'Verified locally: %s at 127.0.0.1:%s (no LLM calls). Nginx/public verification is separate.\n' "$image_ref" "$port"
\\n'* ]] || fail 'LEGACY_WORKER_MULTIPLE: inspect legacy containers manually.'
  [[ -f .deployment/worker-retired &&
     "$(cat -- .deployment/worker-retired)" == "$project" ]] ||
    fail 'LEGACY_WORKER_UNRECONCILED: inspect backlog and retire the old worker before deployment.'
fi
services=(api migrate retention)
"${compose[@]}" --profile maintenance pull "${services[@]}"
image_revision=$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$image_ref")
[[ "$image_revision" == "$revision" ]] || fail 'Pulled image revision differs from the tested release; database and running services were not changed.'

# O historico descreve imagens; nao representa backup ou rollback de schema/dados.
mkdir -p -- .deployment
# Only fixed phase names; never secrets or visitor content.
mark_attempt_phase() { printf '%s\n' "$1" > .deployment/attempted-phase; }
if [[ -f .deployment/image-ref ]]; then
  cp -- .deployment/image-ref .deployment/previous-image-ref
fi
printf '%s\n' "$image_ref" > .deployment/attempted-image-ref
mark_attempt_phase 'worker-stop-requested'
# Drain the previous worker before schema changes; no database rollback is implied on failure.
"${compose[@]}" --profile worker stop worker
mark_attempt_phase 'dependencies-start-requested'
"${compose[@]}" up -d --no-build --wait postgres redis
mark_attempt_phase 'migration-requested'
"${compose[@]}" run --rm --no-deps migrate
mark_attempt_phase 'api-start-requested'
if ! "${compose[@]}" up -d --no-build --no-deps --wait api; then
  fail 'API failed after migration may have changed the database. No automatic database/image rollback was attempted; inspect compatibility and recover manually.'
fi
container_id=$("${compose[@]}" ps -q api)
[[ -n "$container_id" ]] || fail 'API container is missing.'
actual_image=$(docker inspect --format '{{.Config.Image}}' "$container_id")
[[ "$actual_image" == "$image_ref" ]] || fail 'Running API does not use the tested immutable image.'
actual_revision=$(docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$container_id")
[[ "$actual_revision" == "$revision" ]] || fail 'Running image revision differs from the tested release.'
if [[ "$worker_enabled" == true ]]; then
  mark_attempt_phase 'worker-start-requested'
  "${compose[@]}" --profile worker up -d --no-build --no-deps --wait worker || fail 'Worker failed after migration. Investigate outbox and configuration; no automatic rollback was attempted.'
  worker_id=$("${compose[@]}" --profile worker ps -q worker)
  [[ -n "$worker_id" ]] || fail 'Worker container is missing.'
  [[ $(docker inspect --format '{{.Config.Image}}' "$worker_id") == "$image_ref" ]] || fail 'Worker does not use the tested immutable image.'
  [[ $(docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$worker_id") == "$revision" ]] || fail 'Worker revision differs from the tested release.'
fi
mark_attempt_phase 'readiness-requested'
curl --fail --silent --show-error --max-time 20 "http://127.0.0.1:$port/ready" |
  grep -Eq '"status"[[:space:]]*:[[:space:]]*"ready"' || fail 'Readiness verification failed; migration is not reverted automatically.'
printf '%s\n' "$project" > .deployment/project-name
printf '%s\n' "$port" > .deployment/http-port
printf '%s\n' "$proxy_mode" > .deployment/use-proxy
mark_attempt_phase 'promotion-requested'
mv -- .deployment/attempted-image-ref .deployment/image-ref
rm -- .deployment/attempted-phase
printf 'Verified locally: %s at 127.0.0.1:%s (no LLM calls). Nginx/public verification is separate.\n' "$image_ref" "$port"
