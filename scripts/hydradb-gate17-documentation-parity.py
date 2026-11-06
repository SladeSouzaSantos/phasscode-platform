#!/usr/bin/env python3
"""Official v0.3.0 Python Bolt example, compared to JS on identical GH-only graph.

Driver package neo4j==6.4.1 installed in temporary virtualenv; no production
access. This is a diagnostic, success means an honest report, not query parity.
"""
from __future__ import annotations

from importlib.metadata import version
import json
import os
from pathlib import Path
import re
import sys

from neo4j import GraphDatabase

ID = 1700100
EXPECTED = 1700101
QUERY = "MATCH (a {id: $src})-[:FOLLOWS]->(b) RETURN b.id AS id"


def require(check: bool, name: str) -> None:
    if not check:
        raise RuntimeError(name)


def private_token() -> str:
    root = Path(os.environ["RUNNER_TEMP"]).resolve()
    file = Path(os.environ.get("GATE17_TOKEN_FILE", ""))
    require(file.is_absolute() and not file.is_symlink()
            and file.resolve().is_relative_to(root), "GATE17_TOKEN_SCOPE")
    token = file.read_text(encoding="utf8").strip()
    require(len(token) >= 32, "GATE17_TOKEN_BAD")
    return token


def err_code(exc: BaseException) -> str:
    raw = getattr(exc, "code", None)
    if not isinstance(raw, str):
        raw = type(exc).__name__
    return re.sub(r"[^a-zA-Z0-9_.-]", "_", raw[:90])


def trial(database: str | None, uri: str, token: str) -> dict:
    report = {"database": database, "uriScheme": uri.split(":")[0]}
    try:
        with GraphDatabase.driver(
            uri, auth=("neo4j", token),
            connection_timeout=6, max_transaction_retry_time=0,
            max_connection_pool_size=1,
        ) as driver:
            try:
                driver.verify_connectivity()
                report["connectivity"] = "ok"
            except Exception as exc:
                report["connectivity"] = "failed"
                report["connectError"] = err_code(exc)
            options = {} if database is None else {"database": database}
            try:
                with driver.session(**options) as session:
                    records = list(session.run(QUERY, {"src": ID}))
                ids = [rec["id"] for rec in records]
                report["query"] = (
                    "value_match" if ids == [EXPECTED] else "value_mismatch"
                )
                report["rows"] = len(ids)
            except Exception as exc:
                report["query"] = "failed"
                report["queryError"] = err_code(exc)
    except Exception as exc:
        report["connectivity"] = "failed"
        report["connectError"] = err_code(exc)
        report["query"] = "failed"
    return report


def main() -> None:
    graph = os.getenv("GATE17_GRAPH_ID")
    require(
        os.getenv("GATE17_ISOLATION_MODE") == "github_hosted_ephemeral"
        and os.getenv("GITHUB_REPOSITORY") == "SladeSouzaSantos/phasscode-platform"
        and os.getenv("GITHUB_REF") == "refs/heads/experiment/hydradb"
        and re.fullmatch(r"[0-9]+", os.getenv("GITHUB_RUN_ID", "")) is not None
        and graph in ("lab", "default"),
        "GATE17_PY_RUNNER_RESTRICTED",
    )
    token = private_token()
    variants = [
        ("documented_default", "default", "bolt://127.0.0.1:17687"),
        ("configured_graph_explicit", graph, "bolt://127.0.0.1:17687"),
        ("unspecified", None, "bolt://127.0.0.1:17687"),
        ("routed_graph", graph, "neo4j://127.0.0.1:17687"),
    ]
    output = []
    for name, database, uri in variants:
        results = [trial(database, uri, token) for _ in range(3)]
        output.append({"variant": name, "trials": results})
    primary = output[0]["trials"]
    wins = sum(row.get("query") == "value_match" for row in primary)
    report = {
        "schemaVersion": "hydradb-gate17-official-python-example-v1",
        "scope": "github_ephemeral_only",
        "graphId": graph,
        "driver": "neo4j Python", "driverVersion": version("neo4j"),
        "officialDefaultPassCount": wins, "officialDefaultTrials": 3,
        "runs": output, "noOperationalAccess": True, "hostedV2Used": False,
    }
    path = Path(os.environ.get("GATE17_PY_REPORT_FILE", ""))
    root = Path(os.environ["RUNNER_TEMP"]).resolve()
    require(path.is_absolute() and not path.is_symlink()
            and path.resolve().is_relative_to(root)
            and not path.exists(), "GATE17_PY_REPORT_SCOPE")
    path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf8")
    path.chmod(0o600)
    print("GATE17_PY_OFFICIAL_EXAMPLE_JSON", json.dumps(report, separators=(",", ":")))
    print("GATE17_PY_OFFICIAL_EXAMPLE_3_OF_3_PASS"
          if wins == 3 else "GATE17_PY_OFFICIAL_EXAMPLE_NOT_FULLY_REPRODUCED")
    print("GATE17_PY_DIAGNOSTIC_REPORTED")


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, ValueError, KeyError):
        print("GATE17_PY_DIAGNOSTIC_FAILED", file=sys.stderr)
        sys.exit(1)
