#!/usr/bin/env python3
"""F4.3 paired HTTP query round-trip pilot (not a general engine benchmark).

Two disposable GH-hosted engines, same simple Cypher queries and expected
values, same Python HTTP client, bounded CPU/memory, small synthetic graph.
No production data; output includes metrics only, never credentials.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import base64
import json
import os
from pathlib import Path
import re
import statistics
import sys
from time import perf_counter
from urllib.error import HTTPError, URLError
from urllib.request import ProxyHandler, Request, build_opener

QUERY_CASES = (
    (
        "one_hop",
        "MATCH (a:Gate9Skill {id: 800100})-[:GATE9_SKILL]->(b) RETURN b.id AS id",
        [[800101]],
    ),
    (
        "property_filter",
        "MATCH (a:Gate9Claim) WHERE a.scope = 'professional' RETURN a.id AS id ORDER BY id LIMIT 1",
        [[800101]],
    ),
)
URLS = {
    "hydradb_http": "http://127.0.0.1:18443/v1/graphs/lab/query",
    "neo4j_http": "http://127.0.0.1:17474/db/neo4j/tx/commit",
}
MAX_BODY = 80_000


def guard(ok: bool, code: str) -> None:
    if not ok:
        raise RuntimeError(code)


def ephemeral_secrets() -> tuple[str, str, Path]:
    guard(
        os.environ.get("GATE9_ISOLATION_MODE") == "github_hosted_ephemeral"
        and os.environ.get("GITHUB_REPOSITORY") == "SladeSouzaSantos/phasscode-platform"
        and os.environ.get("GITHUB_REF") == "refs/heads/experiment/hydradb"
        and re.fullmatch(r"[0-9]+", os.environ.get("GITHUB_RUN_ID", "")) is not None,
        "GATE16_RESTRICTED_RUNNER",
    )
    temp = Path(os.environ.get("RUNNER_TEMP", "")).resolve()
    guard(temp.is_dir() and temp.is_absolute(), "GATE16_RUNNER_TEMP_REQUIRED")
    keys = [
        Path(os.environ.get("GATE9_HYDRA_TOKEN_FILE", "")),
        Path(os.environ.get("GATE9_NEO_AUTH_FILE", "")),
    ]
    for file in keys:
        guard(file.is_absolute() and file.is_file()
              and file.resolve().is_relative_to(temp.resolve())
              and not file.is_symlink(), "GATE16_PRIVATE_FILE_PATH")
    token = keys[0].read_text(encoding="utf8").strip()
    auth = keys[1].read_text(encoding="utf8").strip()
    guard(len(token) >= 32 and auth.startswith("neo4j/") and len(auth) > 32,
          "GATE16_INVALID_EPHEMERAL_AUTH")
    return token, auth, temp


def normalized(value):
    if isinstance(value, dict) and "type" in value and "value" in value:
        return normalized(value["value"])
    if isinstance(value, list):
        return [normalized(x) for x in value]
    return value


def query(engine: str, cypher: str, token: str, auth: str):
    guard(engine in URLS, "GATE16_UNAPPROVED_ENGINE")
    if engine == "hydradb_http":
        req = {"cell_id": "cell-0", "query": cypher, "parameters": {},
               "timeout_ms": 10000}
        headers = {"Content-Type": "application/json",
                   "Authorization": "Bearer " + token,
                   "X-Graph-Namespace": "lab"}
    else:
        user, password = auth.split("/", 1)
        basic = base64.b64encode((user + ":" + password).encode()).decode("ascii")
        req = {"statements": [{"statement": cypher, "parameters": {},
                               "resultDataContents": ["row"]}]}
        headers = {"Content-Type": "application/json",
                   "Authorization": "Basic " + basic}
    payload = Request(URLS[engine], method="POST",
                      headers=headers, data=json.dumps(req).encode("utf8"))
    opener = build_opener(ProxyHandler({}))
    try:
        with opener.open(payload, timeout=12) as response:
            guard(response.status == 200, "GATE16_HTTP_NON200")
            raw = response.read(MAX_BODY)
    except (URLError, HTTPError, OSError, TimeoutError) as error:
        raise RuntimeError("GATE16_HTTP_ERROR") from error
    guard(len(raw) < MAX_BODY, "GATE16_HTTP_BODY_TOO_LARGE")
    data = json.loads(raw.decode("utf8"))
    guard(isinstance(data, dict), "GATE16_RESPONSE_ENVELOPE")
    if engine == "neo4j_http":
        guard(not data.get("errors"), "GATE16_NEO4J_RESPONSE_ERROR")
        result = data.get("results")
        guard(isinstance(result, list) and len(result) == 1,
              "GATE16_NEO4J_RESULT_SHAPE")
        return [normalized(item["row"]) for item in result[0]["data"]]
    guard(not data.get("error") and not data.get("errors"),
          "GATE16_HYDRA_RESPONSE_ERROR")
    return normalized(data.get("rows"))


def pct(values: list[float], percentile: float) -> float:
    sorted_v = sorted(values)
    index = min(len(sorted_v) - 1, max(0, int(__import__("math").ceil(percentile * len(sorted_v))) - 1))
    return round(sorted_v[index], 3)


def measure(engine: str, name: str, cypher: str, expected, token: str,
            auth: str, concurrency: int, iterations: int) -> dict:
    for _ in range(8):
        guard(query(engine, cypher, token, auth) == expected,
              "GATE16_WARMUP_VALUE_DRIFT")
    def timed(_):
        t = perf_counter()
        try:
            rows = query(engine, cypher, token, auth)
            delta = (perf_counter() - t) * 1000
            return delta, ("pass" if rows == expected else "mismatch")
        except Exception:
            return (perf_counter() - t) * 1000, "error"
    start = perf_counter()
    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        batch = list(pool.map(timed, range(iterations)))
    wall = perf_counter() - start
    good = [ms for ms, status in batch if status == "pass"]
    failures = sum(1 for _, status in batch if status == "error")
    mismatches = sum(1 for _, status in batch if status == "mismatch")
    guard(len(good) == iterations and failures == 0 and mismatches == 0,
          "GATE16_RESPONSE_OR_TRANSPORT_ERRORS")
    return {
        "workload": name, "engine": engine, "concurrency": concurrency,
        "iterations": iterations, "errors": failures, "mismatches": mismatches,
        "p50Ms": pct(good, 0.50), "p95Ms": pct(good, 0.95),
        "p99Ms": pct(good, 0.99),
        "meanMs": round(statistics.mean(good), 3),
        "opsPerSecond": round(iterations / wall, 2),
    }


def run() -> None:
    token, auth, temp = ephemeral_secrets()
    stats = []
    for name, cypher, expected in QUERY_CASES:
        for concurrency in (1, 4):
            # Alternate the engine order by concurrency to reduce order bias.
            engines = ("hydradb_http", "neo4j_http") if concurrency == 4 else (
                "neo4j_http", "hydradb_http"
            )
            for engine in engines:
                stats.append(measure(
                    engine, name, cypher, expected, token, auth, concurrency, 96
                ))
    report = {
        "schemaVersion": "hydradb-f43-paired-http-pilot-v1",
        "scope": "github_hosted_ephemeral_synthetic_only",
        "samePythonClient": True,
        "sameLogicalCypherAndExpectedValues": True,
        "differentHTTPApiEnvelopes": True,
        "differentEngineImplementations": True,
        "datasetNodes": 2,
        "datasetEdges": 1,
        "dockerCpuEach": 1.5,
        "dockerMemoryMiBEach": 2048,
        "clientWarmupsPerSeries": 8,
        "observationsPerSeries": 96,
        "concurrency": [1, 4],
        "requestPool": "ThreadPoolExecutor",
        "dataStorage": "local_only",
        "resultIntegrity": "pass",
        "coldCache": "not_tested",
        "diskIO": "not_measured",
        "enginePerformanceVerdict": "inconclusive",
        "results": stats,
    }
    out = temp / ("gate16-http-pilot-" + os.environ["GITHUB_RUN_ID"] + ".json")
    guard(not out.exists() and not out.is_symlink(),
          "GATE16_REPORT_PREEXISTS")
    out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf8")
    out.chmod(0o600)
    print("GATE16_PAIRED_HTTP_PILOT_JSON", json.dumps(report, separators=(",", ":")))
    print("GATE16_PAIRED_HTTP_PILOT_PASS")


if __name__ == "__main__":
    try:
        run()
    except (RuntimeError, KeyError, OSError, ValueError):
        print("GATE16_PAIRED_HTTP_PILOT_FAILED", file=sys.stderr)
        sys.exit(1)
