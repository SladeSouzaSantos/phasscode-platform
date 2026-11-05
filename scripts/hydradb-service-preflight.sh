#!/usr/bin/env bash
# Read-only except for Docker metadata reads. Does not create or start any service.
set -euo pipefail
repo_dir=$(cd -- "$(dirname -- "$0")/.." && pwd -P)
[[ "$repo_dir" == "$HOME/hydradb-lab/phasscode-platform" ]] || {
  echo 'ERROR: run from the dedicated LAB checkout only' >&2; exit 1;
}
[[ "$(git -C "$repo_dir" branch --show-current)" == 'experiment/hydradb' ]] || {
  echo 'ERROR: not on the experimental branch' >&2; exit 1;
}
cd "$repo_dir"
bash scripts/hydradb-lab-preflight.sh

export LAB_REPO="$repo_dir"
python3 - <<'PY'
import os, pathlib, re, stat
root = pathlib.Path(os.environ["LAB_REPO"])
lab = root.parent
variables = {}
for line in (root / ".env").read_text(encoding="utf-8").splitlines():
    if not line or line.lstrip().startswith("#") or "=" not in line:
        continue
    k,v=line.split("=",1)
    variables[k.strip()]=v.strip()
image=variables.get("HYDRADB_IMAGE", "")
if not re.fullmatch(r"ghcr\.io/hydra-db/hydradb@sha256:[a-f0-9]{64}",image):
    raise SystemExit("ERROR: HYDRADB_IMAGE must be pinned to official GHCR sha256 digest")
for name in ["data/hydradb/store", "data/hydradb/cache"]:
    p=lab/name
    if not p.is_dir() or p.is_symlink():
        raise SystemExit("ERROR: missing or symlinked HydraDB data directory")
    if p.stat().st_uid!=10001 or p.stat().st_gid!=10001:
        raise SystemExit("ERROR: HydraDB data directory must belong to UID:GID 10001:10001")
secret=lab/"secrets/hydradb_auth_token_runtime"
if not secret.is_file() or secret.is_symlink():
    raise SystemExit("ERROR: missing or symlinked runtime secret")
if secret.stat().st_uid!=10001 or secret.stat().st_gid!=10001:
    raise SystemExit("ERROR: runtime secret must belong to UID:GID 10001:10001")
if stat.S_IMODE(secret.stat().st_mode)!=0o400:
    raise SystemExit("ERROR: runtime secret must have permission 0400")
print("HYDRADB_IMAGE_DIGEST_PINNED")
print("HYDRADB_LAB_DATA_OWNERSHIP_OK")
print("HYDRADB_RUNTIME_SECRET_OK")
PY

# Compose omits services behind profiles unless explicitly enabled during
# rendering. This only affects config inspection; no container is started.
args=(-p phasscode-hydradb-lab --env-file .env
  -f compose.yaml -f compose.hydradb-lab.yaml -f compose.hydradb-service.lab.yaml
  --profile hydradb)
docker compose "${args[@]}" config --quiet
docker compose "${args[@]}" config --format json | python3 -c '
import json, re, sys
d=json.load(sys.stdin)
h=d["services"]["hydradb"]
if d["name"]!="phasscode-hydradb-lab":
    raise SystemExit("ERROR: wrong Compose project")
if "hydradb" not in h.get("profiles", []):
    raise SystemExit("ERROR: HydraDB must remain opt-in")
if not re.fullmatch(r"ghcr\.io/hydra-db/hydradb@sha256:[a-f0-9]{64}",h["image"]):
    raise SystemExit("ERROR: image not pinned to official digest")
if h.get("user")!="10001:10001":
    raise SystemExit("ERROR: HydraDB runtime UID")
if h.get("restart") not in ("no", "none"):
    raise SystemExit("ERROR: HydraDB must not autostart after host reboot")
if float(h.get("cpus",0))>1 or int(h.get("mem_limit",0))>2147483648:
    raise SystemExit("ERROR: HydraDB resource cap exceeded")
seen=set()
for p in h.get("ports", []):
    if p.get("host_ip")!="127.0.0.1":
        raise SystemExit("ERROR: HydraDB port is not loopback only")
    seen.add((str(p.get("published")),int(p.get("target"))))
if seen != {("17687",7687),("18443",8443),("19090",9090)}:
    raise SystemExit("ERROR: HydraDB host ports")
if "backend" not in h.get("networks", {}):
    raise SystemExit("ERROR: graph not attached to LAB network")
if any(v.get("external") for v in d.get("networks", {}).values()):
    raise SystemExit("ERROR: external network detected")
if not any("/data/store"==v.get("target") for v in h.get("volumes", [])) or not any("/data/cache"==v.get("target") for v in h.get("volumes", [])):
    raise SystemExit("ERROR: data/cache mounts missing")
# Docker Compose normalizes a short secret mount to either the bare target
# name or /run/secrets/<name> depending on its output representation/version.
# Require the exact source, destination and host file, not just a matching name.
from pathlib import Path
expected_name="hydradb_auth_token"
expected_target="/run/secrets/hydradb_auth_token"
mounts=h.get("secrets", [])
if not any(
    isinstance(s, dict)
    and s.get("source")==expected_name
    and s.get("target", expected_name) in (expected_name, expected_target)
    for s in mounts
):
    raise SystemExit("ERROR: HydraDB token secret not mounted at expected target")
declared=d.get("secrets", {}).get(expected_name, {})
expected_file=Path.home()/"hydradb-lab/secrets/hydradb_auth_token_runtime"
if not isinstance(declared, dict) or Path(declared.get("file", "")).resolve() != expected_file.resolve():
    raise SystemExit("ERROR: HydraDB secret source must be the LAB runtime file")
env=h["environment"]
if env.get("GRAPH_AUTH_TOKEN_FILE")!="/run/secrets/hydradb_auth_token":
    raise SystemExit("ERROR: graph token path")
for k in env:
    if k.startswith("LLM_") or k.startswith("POSTGRES_") or k.startswith("TELEGRAM_"):
        raise SystemExit("ERROR: forbidden credential environment key in HydraDB")
print("HYDRADB_PROFILE_ISOLATED")
print("HYDRADB_PORTS_LOOPBACK_ONLY")
print("HYDRADB_CPU_RAM_LIMITS_PRESENT")
print("HYDRADB_NO_LLM_CREDENTIALS")
'
echo 'HYDRADB_PREFLIGHT_OK_NO_CHANGES'
