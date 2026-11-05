#!/usr/bin/env python3
"""Isolated PPKS-derived, paired HTTP graph benchmark (Neo4j LAB vs HydraDB LAB).

No network outside 127.0.0.1, no LLM calls, no private academic materials,
no DEV/MAIN credentials, no external dependencies. Raw HTTP roundtrip timings,
NOT comparable database-kernel benchmarks. '--live' writes synthetic test nodes.
"""
from __future__ import annotations

import argparse
import base64
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import secrets
import statistics
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import ProxyHandler, Request, build_opener

LAB = Path.home() / "hydradb-lab"
REPO = LAB / "phasscode-platform"
PPKS = REPO / "knowledge" / "ppks"
HYDRA_URL = "http://127.0.0.1:18443/v1/graphs/lab/query"
HYDRA_READY = "http://127.0.0.1:19090/readyz"
NEO4J_URL = "http://127.0.0.1:17474/db/neo4j/tx/commit"
PROJECT_IDS = (
    "phasscode-platform",
    "web-portfolio-v2",
    "greencity-os",
    "hsp-simulator",
    "webservice-springboot-jpa",
)
EXPERIENCE_IDS = ("experiencia-sig", "experiencia-greencity")
REPEAT_READS = 3


def fail(message: str) -> None:
    raise RuntimeError(message)


def load_env(path: Path) -> dict[str, str]:
    result = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.lstrip().startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        result[key.strip()] = value.strip()
    return result


def check_lab() -> dict[str, str]:
    if not REPO.is_dir() or not (LAB / "hydradb").is_dir():
        fail("LAB checkout or HydraDB checkout is missing")
    branch = subprocess.check_output(
        ["git", "-C", str(REPO), "branch", "--show-current"], text=True
    ).strip()
    if branch != "experiment/hydradb":
        fail("Refusing to run outside experiment/hydradb")
    env_path = REPO / ".env"
    if not env_path.is_file() or env_path.is_symlink():
        fail("Private LAB .env missing")
    if env_path.stat().st_mode & 0o077:
        fail("Private LAB .env must be chmod 600")
    env = load_env(env_path)
    if (
        env.get("COMPOSE_PROJECT_NAME") != "phasscode-hydradb-lab"
        or env.get("PHASSCODE_HTTP_PORT") != "13003"
        or env.get("PHASSCODE_USE_PROXY") != "false"
    ):
        fail("LAB isolation variables are incorrect")
    return env


def read_ppks_sample() -> list[dict[str, str]]:
    index = json.loads((PPKS / "index.json").read_text(encoding="utf-8"))
    allowed = {"projects": set(PROJECT_IDS), "experiences": set(EXPERIENCE_IDS)}
    sample = []
    for directory in ("projects", "experiences"):
        records = {entry["id"]: entry for entry in index[directory]}
        missing = allowed[directory].difference(records)
        if missing:
            fail("Missing PPKS records in " + directory + ": " + ", ".join(sorted(missing)))
        for record_id in sorted(allowed[directory]):
            entry = records[record_id]
            path = entry["path"]
            if not re.fullmatch(directory + r"/[a-z0-9-]+\.json", path):
                fail("Unsafe PPKS path")
            record = json.loads((PPKS / path).read_text(encoding="utf-8"))
            if record.get("id") != record_id or record.get("kind") != directory[:-1]:
                fail("PPKS id/kind mismatch")
            if directory == "projects":
                if record.get("identity", {}).get("visibility") != "public":
                    fail("Refusing a non-public project record")
            technologies = [
                item["name"]
                for item in record.get("stack", [])
                if item.get("evidenceIds") and isinstance(item.get("name"), str)
            ]
            if len(technologies) < 2:
                fail("Insufficient PPKS-backed technologies for " + record_id)
            for technology in technologies[:2]:
                sample.append({
                    "record_id": record_id,
                    "record_kind": record["kind"],
                    "technology": technology,
                })
    if len(sample) != 14:
        fail("Unexpected benchmark sample size")
    return sample


def get_json(opener, url: str, body: dict, headers: dict[str, str]) -> dict:
    request = Request(
        url, data=json.dumps(body, separators=(",", ":")).encode("utf-8"),
        headers=headers, method="POST",
    )
    with opener.open(request, timeout=30) as response:
        if response.status != 200:
            fail(f"Query endpoint HTTP {response.status}")
        parsed = json.loads(response.read(1_000_000).decode("utf-8"))
    if not isinstance(parsed, dict):
        fail("Unexpected API response envelope")
    return parsed


def neo4j(opener, auth: str, query: str) -> dict:
    basic = base64.b64encode(auth.encode("utf-8")).decode("ascii")
    data = get_json(
        opener, NEO4J_URL,
        {"statements": [{"statement": query, "resultDataContents": ["row"]}]},
        {"Authorization": "Basic " + basic, "Content-Type": "application/json"},
    )
    if data.get("errors"):
        error = data["errors"][0]
        fail("Neo4j query failed: " + str(error.get("code", "unknown")))
    results = data.get("results", [])
    if len(results) != 1:
        fail("Unexpected Neo4j response count")
    return results[0]


def hydradb(opener, token: str, query: str) -> dict:
    return get_json(
        opener, HYDRA_URL,
        {"cell_id": "cell-0", "query": query, "timeout_ms": 25000},
        {
            "Authorization": "Bearer " + token,
            "X-Graph-Namespace": "lab",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )


def value_hydra(result: dict) -> int:
    if result.get("columns") != ["id"] or len(result.get("rows", [])) != 1:
        fail("HydraDB query did not return one id")
    value = result["rows"][0][0]
    if not isinstance(value, dict) or value.get("type") not in (
        "integer", "signed_integer", "vertex_id"
    ) or not isinstance(value.get("value"), int):
        fail("Unexpected HydraDB result type")
    return value["value"]


def value_neo4j(result: dict) -> int:
    if result.get("columns") != ["id"] or len(result.get("data", [])) != 1:
        fail("Neo4j query did not return one id")
    row = result["data"][0].get("row")
    if not isinstance(row, list) or len(row) != 1 or not isinstance(row[0], int):
        fail("Unexpected Neo4j result type")
    return row[0]


def percentile(values: list[float], percent: float) -> float:
    ordered = sorted(values)
    position = (len(ordered) - 1) * percent
    low = int(position)
    high = min(low + 1, len(ordered) - 1)
    return round(
        ordered[low] + (ordered[high] - ordered[low]) * (position - low), 3
    )


def stats(values: list[float]) -> dict:
    return {
        "requests": len(values),
        "p50_ms": percentile(values, .50),
        "p95_ms": percentile(values, .95),
        "mean_ms": round(statistics.mean(values), 3),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--live", action="store_true",
        help="Actually insert 14 synthetic PPKS-derived edges in EACH lab graph",
    )
    args = parser.parse_args()
    env = check_lab()
    sample = read_ppks_sample()
    print("PPKS_SOURCE_PUBLIC_RECORDS_7")
    print("PPKS_BENCHMARK_RELATION_PAIRS", len(sample))
    if not args.live:
        print("DRY_RUN_ONLY_USE_--live_FOR_ISOLATED_WRITES")
        return

    auth = env.get("NEO4J_LAB_AUTH", "")
    if not re.fullmatch(r"neo4j/[A-Za-z0-9_-]{32,}", auth):
        fail("Set a unique NEO4J_LAB_AUTH in the LAB .env first")
    token_file = LAB / "secrets" / "hydradb_auth_token"
    token = token_file.read_text(encoding="utf-8").strip()
    if len(token) < 32:
        fail("HydraDB LAB auth token missing or malformed")
    opener = build_opener(ProxyHandler({}))
    with opener.open(HYDRA_READY, timeout=10) as response:
        if response.status != 200:
            fail("HydraDB is not ready")
    print("HYDRADB_READY")
    baseline = neo4j(opener, auth, "RETURN 1 AS id")
    if value_neo4j(baseline) != 1:
        fail("Neo4j benchmark service is unavailable")
    print("NEO4J_LAB_READY")

    # Two unique synthetic vertices per edge. We are testing PPKS-derived
    # relationship lookups, NOT shared-skill/multi-hop graph parity yet.
    run_seed = secrets.randbelow(900_000_000) + 100_000_000
    pairs = [
        (run_seed * 1000 + i * 2, run_seed * 1000 + i * 2 + 1)
        for i in range(len(sample))
    ]
    write_times = {"hydradb": [], "neo4j": []}
    read_times = {"hydradb": [], "neo4j": []}
    for left, right in pairs:
        create = (
            f"CREATE (a {{id: {left}}})"
            f"-[:USES_TECHNOLOGY]->(b {{id: {right}}})"
        )
        for engine in ("hydradb", "neo4j"):
            start = time.perf_counter()
            if engine == "hydradb":
                hydradb(opener, token, create)
            else:
                neo4j(opener, auth, create)
            write_times[engine].append((time.perf_counter() - start) * 1000)
    print("PAIRED_PPKS_WRITES_OK", len(pairs))

    for left, right in pairs:
        query = (
            f"MATCH (a {{id: {left}}})"
            "-[:USES_TECHNOLOGY]->(b) RETURN b.id AS id"
        )
        if value_hydra(hydradb(opener, token, query)) != right:
            fail("HydraDB mismatch during warmup")
        if value_neo4j(neo4j(opener, auth, query)) != right:
            fail("Neo4j mismatch during warmup")
        for rep in range(REPEAT_READS):
            engines = ("hydradb", "neo4j") if rep % 2 == 0 else ("neo4j", "hydradb")
            for engine in engines:
                start = time.perf_counter()
                if engine == "hydradb":
                    got = value_hydra(hydradb(opener, token, query))
                else:
                    got = value_neo4j(neo4j(opener, auth, query))
                read_times[engine].append((time.perf_counter() - start) * 1000)
                if got != right:
                    fail("Result mismatch for engine " + engine)

    print("PAIRED_PPKS_READS_MATCH", len(pairs) * REPEAT_READS)
    report = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "kind": "isolated_ppks_relationship_microbenchmark",
        "source": "knowledge/ppks/index.json and seven record files",
        "sample_metadata": sample,
        "relations": len(pairs),
        "read_repetitions_per_relation": REPEAT_READS,
        "write": {k: stats(v) for k,v in write_times.items()},
        "read": {k: stats(v) for k,v in read_times.items()},
        "parity": "passed: synthetic 1-hop id lookups",
        "methodology_warning": (
            "Sequential small-sample HTTP roundtrip timings using different "
            "vendor HTTP APIs; results include transport/serialization and "
            "cannot establish graph-engine throughput, full PPKS compatibility, "
            "or production sizing. No shared skill nodes, multihop, query planner "
            "equivalence or LLM evaluations are tested."
        ),
    }
    output_dir = LAB / "benchmarks"
    output_dir.mkdir(exist_ok=True)
    name = datetime.now(timezone.utc).strftime("ppks-graph-%Y%m%dT%H%M%SZ.json")
    dest = output_dir / name
    with dest.open("x", encoding="utf-8") as file:
        file.write(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    dest.chmod(0o600)
    print("HYDRADB_READ_P50_MS", report["read"]["hydradb"]["p50_ms"])
    print("NEO4J_READ_P50_MS", report["read"]["neo4j"]["p50_ms"])
    print("BENCHMARK_REPORT", dest)
    print("PPKS_PAIRED_GRAPH_SMOKE_OK")


if __name__ == "__main__":
    try:
        main()
    except HTTPError as error:
        print("PPKS_BENCHMARK_HTTP_ERROR", error.code, file=sys.stderr)
        sys.exit(1)
    except (URLError, OSError, RuntimeError, ValueError, KeyError, subprocess.CalledProcessError) as error:
        print("PPKS_BENCHMARK_FAILED:", error, file=sys.stderr)
        sys.exit(1)
