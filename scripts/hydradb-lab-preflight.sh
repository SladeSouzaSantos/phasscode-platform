#!/usr/bin/env bash
# Read-only, fail-closed validation of the third Orbe (HydraDB LAB) environment.
# This file does not start containers, touch volumes, or print credentials.
set -euo pipefail

repo_dir=$(cd -- "$(dirname -- "$0")/.." && pwd -P)
export LAB_REPO="$repo_dir"
[[ "$(git -C "$repo_dir" branch --show-current)" == "experiment/hydradb" ]] || {
  echo "ERROR: checkout must use branch experiment/hydradb" >&2
  exit 1
}
[[ "$repo_dir" == "$HOME/hydradb-lab/phasscode-platform" ]] || {
  echo "ERROR: run only from the dedicated home-directory lab clone" >&2
  exit 1
}
[[ -f "$repo_dir/.env" && ! -L "$repo_dir/.env" ]] || {
  echo "ERROR: missing or symlinked private LAB .env" >&2
  exit 1
}
[[ -d "$HOME/hydradb-lab/hydradb/.git" ]] || {
  echo "ERROR: separate HydraDB source checkout is missing" >&2
  exit 1
}
[[ -f "$HOME/hydradb-lab/hydradb.env" && ! -L "$HOME/hydradb-lab/hydradb.env" ]] || {
  echo "ERROR: private HydraDB config is missing" >&2
  exit 1
}

python3 - <<'PY'
import os
import pathlib
import stat

p = pathlib.Path(os.environ["LAB_REPO"]) / ".env"
other = pathlib.Path("/opt/projects/phasscode-platform-dev/.env")
mode = stat.S_IMODE(p.stat().st_mode)
if mode & 0o077:
    raise SystemExit("ERROR: LAB .env must not be group/world readable")

def get(path, key):
    if not path.is_file():
        return None
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.lstrip().startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        if k.strip() == key:
            return v.strip()
    return None

expected = {
    "COMPOSE_PROJECT_NAME": "phasscode-hydradb-lab",
    "PHASSCODE_HTTP_PORT": "13003",
    "PHASSCODE_USE_PROXY": "false",
    "POSTGRES_DB": "phasscode_lab",
    "POSTGRES_USER": "phasscode_lab",
    "ORBE_GRAPHRAG_MODE": "off",
    "ORBE_REPORTS_ENABLED": "false",
    "AUTH_ENABLED": "false",
    "MEETINGS_ENABLED": "false",
    "WORKER_ENABLED": "false",
}
for k, v in expected.items():
    if get(p, k) != v:
        raise SystemExit(f"ERROR: LAB setting {k} is not isolated")
if not get(p, "POSTGRES_PASSWORD"):
    raise SystemExit("ERROR: missing LAB database password")
if get(p, "POSTGRES_PASSWORD") == get(other, "POSTGRES_PASSWORD"):
    raise SystemExit("ERROR: LAB and DEV database passwords must differ")
if get(p, "LLM_GLOBAL_BUDGET_KEY") != "phasscode:hydradb:lab":
    raise SystemExit("ERROR: LAB LLM budget key is not isolated")
if get(p, "LLM_GLOBAL_MAX_CALLS") != "30":
    raise SystemExit("ERROR: expected initial LAB LLM call cap of 30")
if get(p, "LLM_PROVIDER") == "mock" and get(p, "LLM_FALLBACK_ENABLED") != "true":
    raise SystemExit("ERROR: real LLM access is not configured")
print("LAB_PRIVATE_ENV_OK")
PY

args=(-p phasscode-hydradb-lab --env-file "$repo_dir/.env" -f "$repo_dir/compose.yaml" -f "$repo_dir/compose.hydradb-lab.yaml")
docker compose "${args[@]}" config --quiet
# Rendered secrets stay strictly inside the pipe to Python; print checks only.
docker compose "${args[@]}" config --format json | python3 -c '
import json, sys
from urllib.parse import urlparse

d = json.load(sys.stdin)
if d.get("name") != "phasscode-hydradb-lab":
    raise SystemExit("ERROR: project name")
services = d["services"]
api = services["api"]
env = api["environment"]
db = urlparse(env["DATABASE_URL"])
if not (db.scheme == "postgresql" and db.hostname == "postgres" and
        db.port == 5432 and db.path == "/phasscode_lab"):
    raise SystemExit("ERROR: database connection")
if env.get("REDIS_URL") != "redis://redis:6379":
    raise SystemExit("ERROR: Redis connection")
if env.get("ORBE_GRAPHRAG_MODE") != "off":
    raise SystemExit("ERROR: do not enable graph modes in baseline")
if env.get("LLM_GLOBAL_BUDGET_KEY") != "phasscode:hydradb:lab":
    raise SystemExit("ERROR: LLM budget key")
if str(env.get("LLM_GLOBAL_MAX_CALLS")) != "30":
    raise SystemExit("ERROR: LLM call budget")
if not any(str(port.get("published")) == "13003" and
           port.get("host_ip") == "127.0.0.1" and
           port.get("target") == 3000 for port in api.get("ports", [])):
    raise SystemExit("ERROR: LAB API must bind only 127.0.0.1:13003")
for name in ("postgres", "redis", "api", "migrate"):
    if not services[name].get("mem_limit") or not services[name].get("cpus"):
        raise SystemExit("ERROR: missing lab CPU/RAM cap on " + name)
if any(v.get("external") for v in d.get("networks", {}).values()):
    raise SystemExit("ERROR: shared external Docker network")
for v in d.get("volumes", {}).values():
    if not v.get("name", "").startswith("phasscode-hydradb-lab_"):
        raise SystemExit("ERROR: volume name is not lab-scoped")
print("LAB_POSTGRES_REDIS_ISOLATED")
print("LAB_LLM_CONFIG_PRESENT")
print("LAB_PORT_LOOPBACK_ONLY")
print("LAB_CPU_RAM_CAPS_PRESENT")
print("LAB_NETWORK_VOLUMES_ISOLATED")
'
echo "LAB_PREFLIGHT_OK_NO_CONTAINERS_STARTED"
