#!/usr/bin/env bash
# F3.7/#42: explicit-only MiniMac diagnostic, no deployment or service access.
set -euo pipefail
MODE="--preflight"
MODEL_DIR=""
if (( $# >= 1 )); then MODE="$1"; fi
if (( $# >= 2 )); then MODEL_DIR="$2"; fi
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
case "$MODE" in
  --preflight|--install-js-deps|--prepare-model|--run) ;;
  *) echo "Usage: bash scripts/benchmark_f37_minimac.sh --preflight | --install-js-deps | --prepare-model MODEL_DIR | --run MODEL_DIR" >&2; exit 2 ;;
esac
if [[ "$(git branch --show-current)" != "dev" ]]; then
  echo "F37_MINIMAC_REQUIRES_DEV_BRANCH" >&2; exit 3
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "F37_MINIMAC_REQUIRES_CLEAN_CHECKOUT" >&2; exit 3
fi
for path in evaluation/semantic-embedding-adversarial-v2.manifest.json evaluation/semantic-embedding-adversarial-v2.json scripts/f37_strict_literal.py; do
  test -f "$path" || { echo "F37_MINIMAC_MISSING_SOURCE=$path" >&2; exit 3; }
done
echo "F37_MINIMAC_DEV_COMMIT=$(git rev-parse --short=12 HEAD)"
echo "F37_MINIMAC_HOST_ARCH=$(uname -m)"
if command -v nproc >/dev/null; then echo "F37_MINIMAC_HOST_CPUS=$(nproc)"; fi
if command -v free >/dev/null; then
  free -m | awk '/^Mem:/{ print "F37_MINIMAC_HOST_RAM_MIB="$2 }'
fi
# Node.js is deliberately not required on the Linux host. This benchmark
# runs Node 24 in a disposable Docker container; never enter the live API.
for tool in python3 docker; do
  command -v "$tool" >/dev/null || { echo "F37_MINIMAC_MISSING_TOOL=$tool" >&2; exit 3; }
done
if [[ "$MODE" == "--preflight" ]]; then
  if docker info >/dev/null 2>&1; then
    echo "F37_MINIMAC_DOCKER_READY"
  else
    echo "F37_MINIMAC_DOCKER_UNAVAILABLE"
  fi
  if [[ -d node_modules/tsx ]]; then
    echo "F37_MINIMAC_TSX_INSTALLED"
  else
    echo "F37_MINIMAC_TSX_MISSING; use --install-js-deps in a disposable DEV checkout"
  fi
  echo "F37_MINIMAC_NODE_MODE=docker_node_24 (host Node/npm not required)"
  echo "F37_MINIMAC_PREFLIGHT_ONLY_NO_DOWNLOAD_NO_DEPLOY"
  exit 0
fi

# This is an explicit, isolated npm install inside the expendable lab clone.
# It can download public npm packages (and the official Node Docker image),
# but does not access the running API container, production checkout or DBs.
if [[ "$MODE" == "--install-js-deps" ]]; then
  docker info >/dev/null 2>&1 || { echo "F37_MINIMAC_DOCKER_UNAVAILABLE" >&2; exit 3; }
  echo "F37_MINIMAC_INSTALL_JS_DEPS_DOCKER_ONLY"
  docker run --rm --network bridge --cpus 2 --memory 2g --pids-limit 128 \
    --cap-drop ALL --security-opt no-new-privileges \
    --user "$(id -u):$(id -g)" \
    --tmpfs /tmp:rw,nosuid,nodev,size=256m \
    --env HOME=/tmp --env npm_config_cache=/tmp/npm-cache \
    --mount "type=bind,src=$ROOT,dst=/lab" --workdir /lab \
    node:24-bookworm-slim npm ci --include=dev --ignore-scripts --no-audit --no-fund
  echo "F37_MINIMAC_JS_DEPS_READY_IN_LAB_CLONE"
  exit 0
fi

if [[ -z "$MODEL_DIR" || ! -d "$MODEL_DIR" ]]; then
  echo "F37_MINIMAC_MODEL_DIRECTORY_MUST_EXIST" >&2; exit 3
fi
MODEL_DIR="$(realpath "$MODEL_DIR")"
if [[ "$MODE" == "--prepare-model" ]]; then
  echo "F37_MINIMAC_PREPARE_PINNED_PUBLIC_MODEL_NETWORK_ALLOWED"
  python3 scripts/semantic_embedding_lab.py prepare --model-dir "$MODEL_DIR" >/dev/null
  python3 scripts/semantic_embedding_lab.py verify --model-dir "$MODEL_DIR" >/dev/null
  echo "F37_MINIMAC_PINNED_SHA256_VERIFIED"
  exit 0
fi
test -d node_modules/tsx || { echo "F37_MINIMAC_TSX_MISSING; run --install-js-deps" >&2; exit 3; }
docker info >/dev/null 2>&1 || { echo "F37_MINIMAC_DOCKER_UNAVAILABLE" >&2; exit 3; }

# All JavaScript runs without network or write access to the lab checkout.
# There is no need to install Node or npm on the host.
node_lab() {
  docker run --rm --network none --read-only --cpus 2 --memory 2g \
    --pids-limit 128 --cap-drop ALL --security-opt no-new-privileges \
    --user "$(id -u):$(id -g)" --env HOME=/tmp \
    --tmpfs /tmp:rw,nosuid,nodev,size=64m \
    --mount "type=bind,src=$ROOT,dst=/lab,readonly" --workdir /lab \
    node:24-bookworm-slim node --import tsx "$@"
}
TEMP_DIR="$(mktemp -d /tmp/orbe-f37-mini.XXXXXXXX)"
BUILD_CONTEXT="$TEMP_DIR/context"
REPORT_DIR="$(printenv F37_REPORT_DIR || true)"
if [[ -z "$REPORT_DIR" ]]; then
  REPORT_DIR="$HOME/orbe-f37-reports/$(date -u +%Y%m%dT%H%M%SZ)"
fi
IMAGE="orbe-f37-local-lab:$(git rev-parse --short=8 HEAD)"
cleanup() {
  docker image rm "$IMAGE" >/dev/null 2>&1 || true
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT
mkdir -p "$REPORT_DIR" "$BUILD_CONTEXT/scripts" "$BUILD_CONTEXT/evaluation" "$BUILD_CONTEXT/infrastructure/docker"
REPORT_DIR="$(realpath "$REPORT_DIR")"

# Does not access secrets or databases; the catalog contains only public PPKS labels.
python3 scripts/semantic_embedding_lab.py verify --model-dir "$MODEL_DIR" > "$REPORT_DIR/pinned-model-verified.json"
node_lab scripts/export-semantic-skill-catalog.ts > "$REPORT_DIR/catalog.json"
node_lab scripts/evaluate-semantic-lexical.ts --adversarial-v2 > "$REPORT_DIR/lexical.json"

# Narrow build context explicitly excludes .env, visitor data, DB files and app code.
cp infrastructure/docker/Dockerfile.semantic-embedding-lab "$BUILD_CONTEXT/infrastructure/docker/"
cp infrastructure/docker/semantic-embedding-requirements.txt "$BUILD_CONTEXT/infrastructure/docker/"
cp scripts/semantic_embedding_lab.py "$BUILD_CONTEXT/scripts/"
cp evaluation/semantic-embedding-onnx-manifest.json "$BUILD_CONTEXT/evaluation/"
cp evaluation/semantic-hybrid-corpus-v0.json "$BUILD_CONTEXT/evaluation/"
cp evaluation/semantic-embedding-prospective-v1.json "$BUILD_CONTEXT/evaluation/"
cp evaluation/semantic-embedding-adversarial-v2.json "$BUILD_CONTEXT/evaluation/"
docker build -f "$BUILD_CONTEXT/infrastructure/docker/Dockerfile.semantic-embedding-lab" -t "$IMAGE" "$BUILD_CONTEXT" >/dev/null

echo "F37_MINIMAC_ONNX_OFFLINE_BENCHMARK_STARTED"
docker run --rm --network none --read-only \
  --cpus 2 --memory 2g --pids-limit 128 \
  --cap-drop ALL --security-opt no-new-privileges \
  --user "$(id -u):$(id -g)" \
  --tmpfs /tmp:rw,nosuid,nodev,size=64m \
  --mount "type=bind,src=$MODEL_DIR,dst=/models,readonly" \
  --mount "type=bind,src=$REPORT_DIR/catalog.json,dst=/lab/catalog.json,readonly" \
  --mount "type=bind,src=$REPORT_DIR/lexical.json,dst=/lab/lexical.json,readonly" \
  --mount "type=bind,src=$ROOT/evaluation/semantic-embedding-adversarial-v2.json,dst=/lab/corpus.json,readonly" \
  --mount "type=bind,src=$ROOT/evaluation/semantic-skill-descriptions-v0.json,dst=/lab/descriptions.json,readonly" \
  "$IMAGE" benchmark --model-dir /models --catalog /lab/catalog.json \
  --corpus /lab/corpus.json --lexical-report /lab/lexical.json \
  --descriptions /lab/descriptions.json > "$REPORT_DIR/onnx.json"

python3 scripts/evaluate_f37_strict_v2.py \
  --catalog "$REPORT_DIR/catalog.json" --onnx-report "$REPORT_DIR/onnx.json" \
  --lexical-report "$REPORT_DIR/lexical.json" > "$REPORT_DIR/paired.json"

python3 - "$REPORT_DIR" <<'PY'
import json, sys
from pathlib import Path
root = Path(sys.argv[1])
model = json.loads((root / "onnx.json").read_text())
paired = json.loads((root / "paired.json").read_text())
print("F37_MINIMAC_REPORT", json.dumps({
    "modelRevision": model["modelRevision"],
    "peakRssMiB": model["resource"]["peakRssMiB"],
    "latencyMs": model["latencyMs"],
    "denominator": paired["denominator"],
    "methods": paired["methods"],
    "strictOverrides": paired["strictOverrides"],
    "risk": paired["risk"],
}, ensure_ascii=False, separators=(",", ":")))
PY
echo "F37_MINIMAC_REPORT_DIR=$REPORT_DIR"
echo "F37_MINIMAC_COMPLETED_NO_SERVICE_CHANGES_NO_DEPLOY"
