#!/usr/bin/env bash
# Operator-installed copy outside the Git checkout, executed only by an
# OpenSSH restrict,command= key. No generic remote shell or deploy.
set -euo pipefail
umask 077
export PATH=/usr/local/bin:/usr/bin:/bin

die() { printf 'HYDRADB_CI_DENIED_%s\n' "$1" >&2; exit 1; }
[[ "$(id -un)" == "phass" ]] || die USER
[[ "$(hostname -s)" == "macmini-server" ]] || die HOST
[[ -v SSH_ORIGINAL_COMMAND ]] || die MISSING_COMMAND
[[ "$SSH_ORIGINAL_COMMAND" =~ ^[a-f0-9]{40}$ ]] || die COMMAND
sha="$SSH_ORIGINAL_COMMAND"
lab="$HOME/hydradb-lab/phasscode-platform"
[[ ! -L "$HOME/hydradb-lab" && ! -L "$lab" ]] || die SYMLINK
[[ -d "$lab/.git" ]] || die LAB_MISSING
cd "$lab"
[[ "$(pwd -P)" == "$lab" ]] || die PATH
[[ "$(git branch --show-current)" == "experiment/hydradb" ]] || die BRANCH
[[ -z "$(git status --porcelain)" ]] || die DIRTY_CHECKOUT
[[ -f .env && ! -L .env ]] || die ENV
grep -qxF 'COMPOSE_PROJECT_NAME=phasscode-hydradb-lab' .env || die PROJECT
grep -qxF 'PHASSCODE_HTTP_PORT=13003' .env || die PORT
grep -qxF 'ORBE_GRAPHRAG_MODE=off' .env || die GRAPH_MODE
[[ -s "$HOME/hydradb-lab/benchmarks/ppks-contract-20261105T225141Z.json" ]] || die REPORT
[[ -s "$HOME/hydradb-lab/secrets/hydradb_auth_token" ]] || die TOKEN

# Never execute source-controlled scripts on the host.
git fetch --no-tags origin experiment/hydradb
[[ "$(git rev-parse FETCH_HEAD)" == "$sha" ]] || die WRONG_SHA
git merge --ff-only "$sha"
[[ "$(git rev-parse HEAD)" == "$sha" ]] || die REVISION
printf 'HYDRADB_CI_LAB_COMMIT %s\n' "$sha"

# The host's private .env is overlaid with a synthetic no-secret .env.
safe_env="$(mktemp "$HOME/hydradb-lab/ci-synthetic-env.XXXXXXXX")"
trap 'rm -f "$safe_env"' EXIT
printf '%s\n' \
  'COMPOSE_PROJECT_NAME=phasscode-hydradb-lab' \
  'PHASSCODE_HTTP_PORT=13003' \
  'ORBE_GRAPHRAG_MODE=off' > "$safe_env"
chmod 600 "$safe_env"

docker run --rm \
  --network none \
  --user "$(id -u):$(id -g)" \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --pids-limit 128 --memory 512m --cpus 0.75 \
  -e HOME=/tmp \
  -v "$lab:/workspace" \
  -v "$safe_env:/workspace/.env:ro" \
  -w /workspace node:24 sh -ec '
    npm run typecheck
    ./node_modules/.bin/vitest run \
      tests/hydradb-lab-evidence-adapter.test.ts \
      tests/hydradb-lab-gate8-score.test.ts
    node --import tsx scripts/hydradb-lab-gate8-corpus-check.ts
    node --import tsx scripts/hydradb-lab-gate8-evaluate.ts --mode off
  '
echo HYDRADB_LAB_REMOTE_OFF_PASS

token="$HOME/hydradb-lab/secrets/hydradb_auth_token"
docker run --rm \
  --network host \
  --user "$(id -u):$(id -g)" \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --pids-limit 96 --memory 384m --cpus 0.75 \
  -e HOME=/tmp \
  -v "$lab:/workspace:ro" \
  -v "$safe_env:/workspace/.env:ro" \
  -v "$HOME/hydradb-lab/benchmarks:/lab-reports:ro" \
  -v "$token:/run/secrets/hydradb_auth_token:ro" \
  -w /workspace node:24 \
  node --import tsx scripts/hydradb-lab-gate8-evaluate.ts \
    --mode shadow \
    --report /lab-reports/ppks-contract-20261105T225141Z.json \
    --token-file /run/secrets/hydradb_auth_token \
    --require-graph
echo HYDRADB_LAB_REMOTE_SHADOW_PASS
