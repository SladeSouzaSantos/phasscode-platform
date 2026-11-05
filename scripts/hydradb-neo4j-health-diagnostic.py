#!/usr/bin/env python3
"""Read-only, redacted Neo4j LAB healthcheck diagnosis.

Verify the container belongs to the lab before inspecting. Never print
docker inspect environment, credential values, healthcheck command, or logs.
"""
from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
import time

LAB = Path.home() / "hydradb-lab" / "phasscode-platform"
CID = "phasscode-hydradb-lab-neo4j-compare-1"


def docker_json(*arguments: str):
    p = subprocess.run(
        ["docker", *arguments], text=True, capture_output=True, check=True
    )
    result = json.loads(p.stdout)
    if not result:
        raise ValueError("Docker inspect returned no containers")
    return result[0]


def main() -> None:
    branch = subprocess.check_output(
        ["git", "-C", str(LAB), "branch", "--show-current"], text=True
    ).strip()
    if branch != "experiment/hydradb":
        raise RuntimeError("Wrong checkout branch")
    d = docker_json("inspect", CID)
    labels = d.get("Config", {}).get("Labels") or {}
    if (
        labels.get("com.docker.compose.project") != "phasscode-hydradb-lab"
        or labels.get("com.docker.compose.service") != "neo4j-compare"
    ):
        raise RuntimeError("Refusing to inspect non-LAB container")

    state = d.get("State") or {}
    health = state.get("Health") or {}
    print("NEO4J_LAB_STATE", state.get("Status", "unknown"))
    print("NEO4J_LAB_HEALTH", health.get("Status", "missing"))
    print("NEO4J_LAB_OOM_KILLED", bool(state.get("OOMKilled")))
    print("NEO4J_LAB_RESTART_COUNT", d.get("RestartCount", 0))
    print("NEO4J_LAB_MEM_LIMIT_MIB", (d.get("HostConfig") or {}).get("Memory", 0) // 1048576)
    logs = health.get("Log") or []
    print("NEO4J_HEALTHCHECK_LOG_COUNT", len(logs))
    for i, entry in enumerate(logs[-5:], 1):
        print("NEO4J_PROBE", i, "EXIT", entry.get("ExitCode", "unknown"))
    # Do not echo Log[].Output: stdout may carry secrets in a broken image.
    # Use 'docker exec', not access to DEV/MAIN.
    probes = [
        ("NEO4J_CYPHER_SHELL_BINARY", "command -v cypher-shell >/dev/null 2>&1"),
        ("NEO4J_AUTH_ENV_PRESENT", "test -n \"$NEO4J_AUTH\""),
        ("NEO4J_SHELL_AUTH_PROBE", 'cypher-shell -u neo4j -p "${NEO4J_AUTH#neo4j/}" "RETURN 1" >/dev/null 2>&1'),
    ]
    for name, code in probes:
        t0 = time.perf_counter()
        try:
            p = subprocess.run(
                ["docker", "exec", CID, "sh", "-c", code],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=20,
                check=False,
            )
            print(name, "EXIT", p.returncode, "ELAPSED_S", round(time.perf_counter() - t0, 2))
        except subprocess.TimeoutExpired:
            print(name, "TIMEOUT_20S")
    print("NEO4J_LAB_HEALTH_DIAGNOSTIC_FINISHED")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError) as exc:
        print("NEO4J_HEALTH_DIAGNOSTIC_FAILED:", type(exc).__name__, file=sys.stderr)
        sys.exit(1)
