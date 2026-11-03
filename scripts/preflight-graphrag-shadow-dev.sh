#!/usr/bin/env bash
# Read-only preflight. NO docker up/down, Git mutation, seed, migration or deploy.
# Mac Mini DEV only: bash scripts/preflight-graphrag-shadow-dev.sh <40-char-DEV-SHA> [--require-running]
set -euo pipefail
fail() { printf 'GRAPH_SHADOW_PREFLIGHT_BLOCKED: %s\n' "$1" >&2; exit 1; }
[[ $# -eq 1 || ( $# -eq 2 && "$2" == '--require-running' ) ]] ||
  fail 'USAGE_EXPECTED_DEV_SHA'
expected_sha=$1
[[ "$expected_sha" =~ ^[a-f0-9]{40}$ ]] || fail 'INVALID_EXPECTED_SHA'
[[ "$(pwd -P)" == /opt/projects/phasscode-platform-dev ]] ||
  fail 'WRONG_DIRECTORY_NOT_DEV'
[[ "$(git branch --show-current)" == dev ]] || fail 'WRONG_BRANCH_NOT_DEV'
[[ "$(git rev-parse HEAD)" == "$expected_sha" ]] || fail 'DEV_SHA_NOT_DEPLOY_CANDIDATE'
[[ -z "$(git status --porcelain)" ]] || fail 'CHECKOUT_NOT_CLEAN'
[[ -f .env && ! -L .env ]] || fail 'DEV_ENV_MISSING_OR_SYMLINK'
[[ -f compose.yaml && -f compose.graphrag.dev.yaml &&
   -f compose.graphrag.reader.dev.yaml && -f compose.graphrag.shadow.dev.yaml ]] ||
  fail 'GRAPHRAG_COMPOSE_OVERLAY_MISSING'
[[ -f .deployment/image-ref && ! -L .deployment/image-ref ]] ||
  fail 'NO_PINNED_DEV_IMAGE'
image_ref=$(cat .deployment/image-ref)
[[ "$image_ref" =~ ^ghcr\.io/[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}$ ]] ||
  fail 'DEV_IMAGE_NOT_IMMUTABLE'

# Never let the public runtime receive the Neo4j admin credential or a raw
# bearer token via environment. Only the reader-token secret is permitted.
if grep -Eq '^[[:space:]]*(ORBE_GRAPH_READER_TOKEN|NEO4J_AUTH|NEO4J_URI|NEO4J_PASSWORD)[[:space:]]*=' .env; then
  fail 'PRIVILEGED_OR_PLAINTEXT_ENV_FORBIDDEN'
fi
if grep -Eq '^[[:space:]]*ORBE_GRAPHRAG_MODE[[:space:]]*=[[:space:]]*shadow' .env; then
  fail 'SHADOW_MUST_BE_OPT_IN_OVERLAY_NOT_BASE_ENV'
fi
for file in .secrets/neo4j_auth .secrets/graph_reader_token; do
  [[ -f "$file" && ! -L "$file" ]] || fail 'LOCAL_SECRET_FILE_MISSING_OR_SYMLINK'
  perm=$(stat -c %a "$file")
  [[ "$perm" == 600 || "$perm" == 400 ]] || fail 'LOCAL_SECRET_PERMISSIONS_TOO_BROAD'
done
# Validate bytes without printing any secret value.
[[ $(wc -c < .secrets/graph_reader_token) -ge 43 ]] ||
  fail 'READER_SECRET_TOO_SHORT'
[[ $(wc -c < .secrets/graph_reader_token) -le 129 ]] ||
  fail 'READER_SECRET_TOO_LONG'
[[ $(wc -c < .secrets/neo4j_auth) -ge 19 ]] ||
  fail 'NEO4J_SECRET_TOO_SHORT'

command -v docker >/dev/null || fail 'DOCKER_NOT_FOUND'
[[ -f .deployment/project-name && ! -L .deployment/project-name &&
   -f .deployment/http-port && ! -L .deployment/http-port &&
   -f .deployment/use-proxy && ! -L .deployment/use-proxy ]] ||
  fail 'INCOMPLETE_PINNED_DEV_METADATA'
[[ "$(cat .deployment/project-name)" == phasscode-platform-dev ]] ||
  fail 'WRONG_DEPLOYMENT_PROJECT'
[[ "$(cat .deployment/http-port)" == 3001 ]] ||
  fail 'WRONG_DEV_HTTP_PORT'
proxy_mode=$(cat .deployment/use-proxy)
[[ "$proxy_mode" == true || "$proxy_mode" == false ]] ||
  fail 'INVALID_PROXY_MODE'
image_revision=$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$image_ref" 2>/dev/null) ||
  fail 'PINNED_DEV_IMAGE_NOT_AVAILABLE'
[[ "$image_revision" == "$expected_sha" ]] ||
  fail 'PINNED_IMAGE_SHA_NOT_CURRENT_DEV'

export COMPOSE_PROJECT_NAME=phasscode-platform-dev
export PHASSCODE_IMAGE="$image_ref"
export PHASSCODE_HTTP_PORT=3001
files=(-f compose.yaml)
if [[ "$proxy_mode" == true ]]; then
  files+=(-f compose.proxy.yaml)
fi
files+=(-f compose.graphrag.dev.yaml -f compose.graphrag.reader.dev.yaml -f compose.graphrag.shadow.dev.yaml)
docker compose --project-name phasscode-platform-dev --env-file .env \
  "${files[@]}" config --quiet || fail 'DEV_COMPOSE_CONFIG_INVALID'

if [[ $# -eq 2 ]]; then
  for service in neo4j graph-reader; do
    ids=$(docker ps -q \
      --filter "label=com.docker.compose.project=phasscode-platform-dev" \
      --filter "label=com.docker.compose.service=$service")
    [[ $(wc -w <<< "$ids") -eq 1 ]] || fail 'DEV_GRAPH_SERVICE_NOT_RUNNING'
    [[ -z "$(docker port "$ids")" ]] || fail 'DEV_GRAPH_SERVICE_PORT_EXPOSED_ON_HOST'
    if [[ $service == neo4j ]]; then
      [[ "$(docker inspect --format '{{.State.Health.Status}}' "$ids")" == healthy ]] ||
        fail 'NEO4J_NOT_HEALTHY'
    fi
  done
fi
printf 'GRAPH_SHADOW_PREFLIGHT_OK stage=dev sha=%s mode=read-only require_running=%s\n' \
  "$expected_sha" "$([[ $# -eq 2 ]] && echo yes || echo no)"
