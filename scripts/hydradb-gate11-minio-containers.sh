#!/usr/bin/env bash
# Disposable GitHub-hosted Gate 11 only. NEVER run on MiniMac.
set -euo pipefail

[[ "$GATE11_ISOLATION_MODE" == "github_hosted_ephemeral" ]] || exit 40
[[ "$GITHUB_REPOSITORY" == "SladeSouzaSantos/phasscode-platform" ]] || exit 40
[[ "$GITHUB_REF" == "refs/heads/experiment/hydradb" ]] || exit 40
[[ "$GITHUB_RUN_ID" =~ ^[0-9]+$ ]] || exit 40
[[ "$RUNNER_TEMP" == /* && -d "$RUNNER_TEMP" ]] || exit 40

ROOT="$RUNNER_TEMP/gate11-ephemeral-$GITHUB_RUN_ID"
NETWORK="gate11-network-$GITHUB_RUN_ID"
MINIO="gate11-minio-$GITHUB_RUN_ID"
HYDRA="gate11-hydra-$GITHUB_RUN_ID"
BUCKET="gate11-$GITHUB_RUN_ID"
MINIO_IMAGE="cgr.dev/chainguard/minio:latest"
MC_IMAGE="cgr.dev/chainguard/minio-client:latest-dev"
HYDRA_IMAGE="ghcr.io/hydra-db/hydradb:0.3.0"

case "$1" in
  init|minio-start|hydra-start|hydra-restart|minio-restart|cleanup) ;;
  *) echo "GATE11_INVALID_ACTION" >&2; exit 40 ;;
esac

private() {
  [[ -d "$ROOT" && ! -L "$ROOT" ]] || { echo "GATE11_MISSING_EPHEMERAL_ROOT" >&2; exit 41; }
  [[ -s "$ROOT/minio-access" && -s "$ROOT/minio-secret" && -s "$ROOT/hydra-token" ]] || exit 41
  ACCESS_KEY="$(<"$ROOT/minio-access")"
  SECRET_KEY="$(<"$ROOT/minio-secret")"
}
start_minio() {
  private
  docker run -d --name "$MINIO" --network "$NETWORK" \
    --pids-limit 256 --memory 1024m --memory-swap 1024m --cpus 1 \
    --security-opt no-new-privileges \
    -e MINIO_ROOT_USER="$ACCESS_KEY" \
    -e MINIO_ROOT_PASSWORD="$SECRET_KEY" \
    -v "$ROOT/minio-data:/data" \
    "$MINIO_IMAGE" server /data >/dev/null
  echo "GATE11_DISPOSABLE_MINIO_STARTED"
}
bucket_ready() {
  private
  local ready=0
  for i in $(seq 1 80); do
    if docker run --rm --network "$NETWORK" --entrypoint /bin/sh \
        "$MC_IMAGE" -c "mc alias set ephemeral 'http://$MINIO:9000' '$ACCESS_KEY' '$SECRET_KEY' >/dev/null" \
        >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 1
  done
  [[ "$ready" == 1 ]] || { echo "GATE11_MINIO_NOT_READY" >&2; exit 41; }
  docker run --rm --network "$NETWORK" --entrypoint /bin/sh \
    "$MC_IMAGE" -c "mc alias set ephemeral 'http://$MINIO:9000' '$ACCESS_KEY' '$SECRET_KEY' >/dev/null && mc mb --ignore-existing 'ephemeral/$BUCKET'" \
    >/dev/null
  echo "GATE11_DISPOSABLE_BUCKET_READY"
}
start_hydra() {
  local sequence="$1"
  private
  local cache="$ROOT/cache-$sequence"
  mkdir -p "$cache"
  sudo chown -R 10001:10001 "$cache"
  docker run -d --name "$HYDRA" --network "$NETWORK" \
    --cap-drop ALL --security-opt no-new-privileges \
    --pids-limit 256 --memory 2048m --memory-swap 2048m --cpus 1.5 \
    -e CLOUD_PROVIDER=aws \
    -e AWS_ACCESS_KEY_ID="$ACCESS_KEY" \
    -e AWS_SECRET_ACCESS_KEY="$SECRET_KEY" \
    -e AWS_DEFAULT_REGION=us-east-1 \
    -e AWS_ENDPOINT="http://$MINIO:9000" \
    -e AWS_BUCKET="$BUCKET" \
    -e AWS_ALLOW_HTTP=true \
    -e AWS_VIRTUAL_HOSTED_STYLE_REQUEST=false \
    -e GRAPH_NAMESPACE=lab \
    -e GRAPH_ID=lab \
    -e GRAPH_CELL_ID=cell-0 \
    -e GRAPH_CELLS=cell-0 \
    -e GRAPH_NODE_ID=node-0 \
    -e GRAPH_BOLT_NODE_ADDRESSES=node-0=127.0.0.1:17687 \
    -e GRAPH_ADVERTISED_BOLT_ADDR=127.0.0.1:17687 \
    -e GRAPH_BOLT_ADDR=0.0.0.0:7687 \
    -e GRAPH_HTTP_ADDR=0.0.0.0:8443 \
    -e GRAPH_ADMIN_ADDR=0.0.0.0:9090 \
    -e GRAPH_ALLOW_PLAINTEXT=true \
    -e GRAPH_AUTH_TOKEN_FILE=/run/secrets/hydra-token \
    -e GRAPH_DATA_CACHE_DIR=/data/cache \
    -e GRAPH_DATA_CACHE_BYTES=67108864 \
    -e RUST_MIN_STACK=33554432 \
    -e RUST_LOG=warn \
    -v "$cache:/data/cache" \
    -v "$ROOT/token-container:/run/secrets/hydra-token:ro" \
    -p 127.0.0.1:18443:8443 \
    -p 127.0.0.1:19090:9090 \
    -p 127.0.0.1:17687:7687 \
    "$HYDRA_IMAGE" >/dev/null
  echo "GATE11_DISPOSABLE_HYDRA_STARTED_CACHE_$sequence"
}

case "$1" in
  init)
    umask 077
    [[ ! -e "$ROOT" ]] || { echo "GATE11_ROOT_COLLISION" >&2; exit 41; }
    mkdir -p "$ROOT/minio-data"
    openssl rand -hex 16 > "$ROOT/minio-access"
    openssl rand -hex 32 > "$ROOT/minio-secret"
    openssl rand -hex 32 > "$ROOT/hydra-token"
    sudo install -o 10001 -g 10001 -m 0400 "$ROOT/hydra-token" "$ROOT/token-container"
    sudo chown -R 65532:65532 "$ROOT/minio-data"
    docker network create "$NETWORK" >/dev/null
    # Chainguard rebuild: original MinIO repositories were retired in 2026.
    docker pull "$MINIO_IMAGE" >/dev/null
    docker pull "$MC_IMAGE" >/dev/null
    docker pull "$HYDRA_IMAGE" >/dev/null
    echo "GATE11_DISPOSABLE_ENV_INITIALIZED"
    ;;
  minio-start)
    start_minio
    bucket_ready
    ;;
  hydra-start)
    start_hydra 1
    ;;
  hydra-restart)
    docker rm -f "$HYDRA" >/dev/null
    start_hydra 2
    ;;
  minio-restart)
    docker rm -f "$HYDRA" "$MINIO" >/dev/null
    start_minio
    bucket_ready
    start_hydra 3
    ;;
  cleanup)
    docker rm -f "$HYDRA" "$MINIO" >/dev/null 2>&1 || true
    docker network rm "$NETWORK" >/dev/null 2>&1 || true
    if [[ "$ROOT" == "$RUNNER_TEMP/gate11-ephemeral-$GITHUB_RUN_ID" && -d "$ROOT" && ! -L "$ROOT" ]]; then
      sudo rm -rf -- "$ROOT"
    fi
    echo "GATE11_DISPOSABLE_RESOURCES_REMOVED"
    ;;
esac
