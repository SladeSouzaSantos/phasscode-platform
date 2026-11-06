#!/usr/bin/env python3
"""Independent Python driver 6.4.1 Bolt semantics on disposable Gate 9 pair.

Read only a synthetic graph seeded in the GitHub-hosted runner. The JS and
Python driver matrices use the same URI/database variants and Cypher.
No production access, secrets, raw errors or sensitive log output.
"""
from __future__ import annotations

from importlib.metadata import version
import json
import os
from pathlib import Path
import re
import sys

from neo4j import GraphDatabase


CASES = (
    ("labeled_node",
     "MATCH (a:Gate9Claim {id: 800101}) RETURN a.id AS id",
     {}, 800101),
    ("one_hop",
     "MATCH (a:Gate9Skill {id: 800100})-[:GATE9_SKILL]->(b) RETURN b.id AS id",
     {}, 800101),
    ("parameterized_one_hop",
     "MATCH (a:Gate9Skill {id: $id})-[:GATE9_SKILL]->(b) RETURN b.id AS id",
     {"id": 800100}, 800101),
)
VARIANTS = (
    ("bolt_lab", "bolt://127.0.0.1:17687", "lab"),
    ("bolt_default", "bolt://127.0.0.1:17687", "default"),
    ("bolt_unspecified", "bolt://127.0.0.1:17687", None),
    ("routed_default", "neo4j://127.0.0.1:17687", "default"),
)


def require(ok: bool, code: str) -> None:
    if not ok:
        raise RuntimeError(code)


def private(name: str) -> str:
    root = Path(os.environ["RUNNER_TEMP"]).resolve()
    path = Path(os.environ.get(name, ""))
    require(path.is_absolute() and not path.is_symlink()
            and path.resolve().is_relative_to(root) and path.is_file(),
            "GATE14_PY_FILE_OUTSIDE_RUNNER")
    return path.read_text(encoding="utf8").strip()


def code(error: BaseException) -> str:
    raw = getattr(error, "code", None)
    if not isinstance(raw, str):
        raw = type(error).__name__
    return re.sub(r"[^a-zA-Z0-9_.-]", "_", raw[:90])


def run_variant(name: str, uri: str, database: str | None, password: str) -> dict:
    try:
        with GraphDatabase.driver(
            uri, auth=("neo4j", password),
            connection_timeout=6, max_transaction_retry_time=0,
            max_connection_pool_size=1,
        ) as driver:
            try:
                driver.verify_connectivity()
            except Exception as exc:
                return {
                    "mode": name, "connectivity": "failed",
                    "code": code(exc), "cases": [],
                }
            results = []
            for case_name, cypher, params, expected in CASES:
                try:
                    kwargs = {} if database is None else {"database": database}
                    with driver.session(**kwargs) as session:
                        records = list(session.run(cypher, params))
                    got = records[0]["id"] if len(records) == 1 else None
                    results.append({
                        "name": case_name,
                        "status": "value_match" if got == expected else "value_mismatch",
                        "count": len(records),
                    })
                except Exception as exc:
                    results.append({
                        "name": case_name, "status": "bolt_rejected",
                        "code": code(exc),
                    })
            return {"mode": name, "connectivity": "ok", "cases": results}
    except Exception as exc:
        return {"mode": name, "connectivity": "failed",
                "code": code(exc), "cases": []}


def main() -> None:
    require(
        os.environ.get("GATE9_ISOLATION_MODE") == "github_hosted_ephemeral"
        and os.environ.get("GITHUB_REPOSITORY") == "SladeSouzaSantos/phasscode-platform"
        and os.environ.get("GITHUB_REF") == "refs/heads/experiment/hydradb"
        and re.fullmatch(r"[0-9]+", os.environ.get("GITHUB_RUN_ID", "")) is not None,
        "GATE14_PY_RESTRICTED_SCOPE",
    )
    token = private("GATE9_HYDRA_TOKEN_FILE")
    neo_auth = private("GATE9_NEO_AUTH_FILE")
    require(len(token) >= 32 and neo_auth.startswith("neo4j/")
            and len(neo_auth) > 32, "GATE14_PY_BAD_AUTH")
    control = run_variant("neo4j_control", "bolt://127.0.0.1:17688",
                          "neo4j", neo_auth[6:])
    require(control["connectivity"] == "ok"
            and len(control["cases"]) == len(CASES)
            and all(c["status"] == "value_match" for c in control["cases"]),
            "GATE14_PY_NEO4J_CONTROL_FAILED")
    report = {
        "schemaVersion": "hydradb-gate14-python-bolt-v1",
        "scope": "github_hosted_ephemeral_only",
        "driver": "neo4j Python", "driverVersion": version("neo4j"),
        "neo4jControl": control,
        "hydraVariants": [
            run_variant(name, uri, database, token)
            for name, uri, database in VARIANTS
        ],
        "noOperationalAccess": True,
    }
    print("GATE14_PYTHON_BOLT_MATRIX_JSON", json.dumps(report, separators=(",", ":")))
    print("GATE14_PYTHON_BOLT_DIAGNOSTIC_PASS")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, KeyError):
        print("GATE14_PYTHON_BOLT_DIAGNOSTIC_FAILED", file=sys.stderr)
        sys.exit(1)
