#!/usr/bin/env bash
# Run the same deterministic quality checks as CI in a disposable toolchain.
# Intentionally does not mount /var/run/docker.sock: infrastructure tests only require the Compose CLI.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

test -f infrastructure/docker/Dockerfile.quality
command -v docker >/dev/null || { echo '[PHASSCODE] Docker CLI is required.' >&2; exit 1; }

docker build -t phasscode-quality:node24 - < infrastructure/docker/Dockerfile.quality

docker run --rm \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -v "$ROOT:/work" \
  -w /work \
  phasscode-quality:node24 \
  bash -euo pipefail -c '
    docker compose version
    npm ci --ignore-scripts
    npm run check
    npm run test:infrastructure
    npm run smoke
  '
