#!/usr/bin/env bash
# F3.2 DEV-only GraphRAG reader maintenance. Never touches MAIN or volumes.
# Usage: bash scripts/graph-reader-dev.sh preflight|prepare-token|start|probe|status|stop
set -euo pipefail

action=${1:-}
case "$action" in
  preflight|prepare-token|start|probe|status|stop) ;;
  *) echo 'Usage: bash scripts/graph-reader-dev.sh preflight|prepare-token|start|probe|status|stop' >&2; exit 2 ;;
esac

cd "$(dirname "${BASH_SOURCE[0]}")/.."
project=phasscode-platform-dev
api="$project-api-1"
neo4j="$project-neo4j-1"
token_file=.secrets/graph_reader_token

die() { echo "GRAPH_READER_PREFLIGHT_FAILED: $*" >&2; exit 1; }
[[ "$(git branch --show-current)" == dev ]] || die 'Requires dev branch'
[[ -z "$(git status --porcelain)" ]] || die 'Git checkout must be clean'
[[ ! -e .deploy-lock && ! -L .deploy-lock ]] || die 'Deployment lock present'
[[ ! -e .deployment/attempted-image-ref && ! -e .deployment/attempted-phase ]] ||
  die 'Unreconciled deployment state'

api_health=$(docker inspect "$api" --format '{{.State.Health.Status}}')
[[ "$api_health" == healthy ]] || die 'DEV API not healthy'
neo4j_health=$(docker inspect "$neo4j" --format '{{.State.Health.Status}}')
[[ "$neo4j_health" == healthy ]] || die 'DEV Neo4j not healthy'
[[ "$(docker inspect "$neo4j" --format '{{json .HostConfig.PortBindings}}')" == '{}' ]] ||
  die 'Neo4j exposes host ports'

api_revision=$(docker inspect "$api" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')
[[ "$api_revision" =~ ^[0-9a-f]{40}$ ]] || die 'DEV API has no revision label'
git cat-file -e "$api_revision^{commit}" || die 'Deployed revision unavailable locally'
git merge-base --is-ancestor "$api_revision" HEAD ||
  die 'API image revision is not an ancestor of the DEV checkout'
image=$(docker inspect "$api" --format '{{.Config.Image}}')
[[ "$image" =~ ^ghcr\.io/[a-z0-9._/-]+@sha256:[0-9a-f]{64}$ ]] ||
  die 'API must use an immutable GHCR digest'
docker image inspect "$image" >/dev/null ||
  die 'Deployed immutable image is not present locally'

[[ -d .secrets && ! -L .secrets ]] || die 'Private .secrets directory required'
[[ -f .secrets/neo4j_auth && ! -L .secrets/neo4j_auth ]] ||
  die 'Neo4j secret file missing or symlinked'
[[ "$(stat -c '%u:%g:%a' .secrets/neo4j_auth)" == '7474:7474:400' ]] ||
  die 'Neo4j secret must be 7474:7474 mode 0400'

# Ensure the public API does not receive either private graph-reader secret.
if docker inspect "$api" --format '{{range .Mounts}}{{println .Destination}}{{end}}' |
  grep -Eq '^/run/secrets/(neo4j_auth|graph_reader_token)$'; then
  die 'Graph secret was mounted into public DEV API'
fi

check_token_file() {
  [[ -f "$token_file" && ! -L "$token_file" ]] || die 'Reader token file missing or symlinked'
  [[ "$(stat -c '%u:%g:%a' "$token_file")" == '7474:7474:400' ]] ||
    die 'Reader token must be 7474:7474 mode 0400'
}

if [[ "$action" == prepare-token ]]; then
  if [[ ! -e "$token_file" && ! -L "$token_file" ]]; then
    command -v openssl >/dev/null || die 'openssl required to generate a token'
    tmp=$(mktemp .secrets/.graph-reader-token.XXXXXXXX)
    trap 'rm -f -- "$tmp"' EXIT
    openssl rand -hex 32 > "$tmp"
    # GNU install -o/-g resolves names via passwd/group on some hosts.
    # Neo4j's UID/GID 7474 may exist only numerically in the container.
    sudo install -m 0400 -- "$tmp" "$token_file"
    sudo chown 7474:7474 -- "$token_file"
    rm -f -- "$tmp"
    trap - EXIT
    echo 'New private GraphRAG reader token created; its value was not printed.'
  else
    echo 'Existing GraphRAG reader token preserved; no rotation.'
  fi
fi

if [[ "$action" != preflight ]]; then
  check_token_file
fi

export PHASSCODE_IMAGE="$image"
compose=(
  docker compose -p "$project" --env-file .env
  -f compose.yaml -f compose.graphrag.dev.yaml
  -f compose.graphrag.reader.dev.yaml
  --profile graphrag --profile graphrag-reader
)
if [[ "$action" != preflight ]]; then
  "${compose[@]}" config --quiet
fi

echo "GRAPH_READER_PREFLIGHT_OK api_revision=$api_revision"
if [[ "$action" == preflight || "$action" == prepare-token ]]; then exit 0; fi

# Wait for the graph reader's own HTTP listener to become ready. Compose
# "Started" only means that the container process was launched, not that its
# Neo4j connectivity check and Fastify listen() have completed.
wait_reader() {
  local reader_id state exit_code attempt
  reader_id=$("${compose[@]}" ps -aq graph-reader)
  [[ -n "$reader_id" ]] || die 'graph-reader container was not created'

  for ((attempt = 1; attempt <= 30; attempt++)); do
    state=$(docker inspect "$reader_id" --format '{{.State.Status}}')
    if [[ "$state" != running ]]; then
      exit_code=$(docker inspect "$reader_id" --format '{{.State.ExitCode}}')
      die "graph-reader exited before HTTP readiness: state=$state exit_code=$exit_code. Inspect: docker logs --tail 40 $reader_id"
    fi
    # An unauthenticated health request MUST return 401. This tests readiness
    # without mounting/printing the private bearer token or Neo4j password.
    if docker exec "$reader_id" node -e '
      fetch("http://127.0.0.1:8765/internal/health", {
        signal: AbortSignal.timeout(1500),
      }).then((response) => {
        process.exit(response.status === 401 ? 0 : 1);
      }).catch(() => process.exit(1));
    ' >/dev/null 2>&1; then
      echo 'GRAPH_READER_HTTP_READY'
      return 0
    fi
    sleep 1
  done
  die "graph-reader HTTP readiness timed out after 30 checks. Inspect: docker logs --tail 40 $reader_id"
}

case "$action" in
  start)
    # The existing API, Neo4j and database must not be restarted or recreated.
    "${compose[@]}" up -d --no-deps graph-reader
    wait_reader
    echo 'Only graph-reader was started and HTTP readiness was verified.'
    ;;
  stop)
    "${compose[@]}" stop graph-reader
    echo 'Only graph-reader was stopped. Volumes and databases were not changed.'
    ;;
  status)
    "${compose[@]}" ps graph-reader
    docker ps --filter "label=com.docker.compose.project=$project" \
      --format 'table {{.Names}}\t{{.Status}}'
    ;;
  probe)
    wait_reader
    reader_id=$("${compose[@]}" ps -q graph-reader)
    [[ -n "$reader_id" ]] || die 'graph-reader not started'
    [[ "$(docker inspect "$reader_id" --format '{{.State.Running}}')" == true ]] ||
      die 'graph-reader is not running'
    [[ "$(docker inspect "$reader_id" --format '{{json .HostConfig.PortBindings}}')" == '{}' ]] ||
      die 'graph-reader exposes host ports'
    network="$project"_backend
    docker network inspect "$network" >/dev/null || die 'DEV backend network missing'
    # Disposable probe has ONLY the reader token, never the privileged Neo4j secret.
    docker run --rm --pull=never --network "$network" \
      --user 7474:7474 --cap-drop ALL --security-opt no-new-privileges \
      --read-only \
      --mount "type=bind,source=$PWD/$token_file,target=/run/secrets/graph_reader_token,readonly" \
      --entrypoint node "$image" --input-type=module -e '
        import { readFileSync } from "node:fs";
        const token = readFileSync("/run/secrets/graph_reader_token", "utf8").trim();
        const base = "http://graph-reader:8765";
        const request = async (method, path, body, authorization) => {
          const headers = { ...(authorization ? { authorization } : {}) };
          if (body !== undefined) headers["content-type"] = "application/json";
          const response = await fetch(base + path, {
            method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
            signal: AbortSignal.timeout(8000),
          });
          return { status: response.status, payload: await response.json() };
        };
        const assert = (condition, message) => {
          if (!condition) throw new Error("GRAPH_READER_PROBE_FAILED: " + message);
        };
        const good = "Bearer " + token;
        assert((await request("GET", "/internal/health")).status === 401, "anonymous health");
        assert((await request("GET", "/internal/health", undefined, "Bearer wrong")).status === 401, "wrong token");
        assert((await request("GET", "/internal/health", undefined, good)).status === 200, "authenticated health");
        const body = { requirements: [{ kind: "vacancy_requirement", id: "java", label: "Java", mandatory: true }] };
        const evidence = await request("POST", "/internal/evidence", body, good);
        assert(evidence.status === 200, "Java lookup");
        const matches = evidence.payload.matches;
        assert(Array.isArray(matches) && matches.length === 1, "requirement identity");
        const match = matches[0];
        assert(match.requirementId === "java" && match.claims.length > 0, "Java claims");
        const sourceMap = new Map(match.sources.map(s => [s.id, s]));
        assert(match.sources.every(s => s.visibility === "public"), "private source leakage");
        assert(match.claims.every(c => c.sourceIds.length > 0 && c.sourceIds.every(id => sourceMap.has(id))), "incomplete provenance");
        const src = await request("POST", "/internal/source", { id: match.sources[0].id }, good);
        assert(src.status === 200 && src.payload.source?.visibility === "public", "source lookup");
        const forbidden = await request("POST", "/internal/evidence", { ...body, cypher: "MATCH (n) DETACH DELETE n" }, good);
        assert(forbidden.status === 400, "arbitrary Cypher accepted");
        console.log("GRAPH_READER_PROBE_OK claims=" + match.claims.length + " public_sources=" + match.sources.length);
      '
    docker inspect "$api" --format 'API={{.State.Health.Status}}'
    docker inspect "$neo4j" --format 'NEO4J={{.State.Health.Status}}'
    ;;
esac
