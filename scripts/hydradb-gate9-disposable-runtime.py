#!/usr/bin/env python3
"""Gate 9: compare EXACT Orbe Cypher and portable probes on two disposable CI engines.

LIVE mode is restricted to GitHub-hosted ephemeral services on loopback ports.
NEVER run against MiniMac, DEV, MAIN or long-lived LAB graph stores.
No source code from visitors, no LLM, no operational PPKS records.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
from pathlib import Path
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import ProxyHandler, Request, build_opener

HYDRA = "http://127.0.0.1:18443/v1/graphs/lab/query"
HYDRA_READY = "http://127.0.0.1:19090/readyz"
NEO4J = "http://127.0.0.1:17474/db/neo4j/tx/commit"
MAX_RESPONSE = 500_000
ORDER = (
    "constraint", "nodes", "relations", "findEvidence", "getSource",
    "countNodes", "countRelations", "pruneRelations", "pruneNodes",
)
PORTABLE_SEED = (
    "CREATE (a:Gate9Skill {id: 800100, label: 'Java'})"
    "-[:GATE9_SKILL]->"
    "(b:Gate9Claim {id: 800101, scope: 'professional'})"
)
PORTABLE_READS = (
    ("one_hop",
     "MATCH (a:Gate9Skill {id: 800100})-[:GATE9_SKILL]->(b) RETURN b.id AS id",
     [[800101]]),
    ("property_filter",
     "MATCH (a:Gate9Claim) WHERE a.scope = 'professional' RETURN a.id AS id ORDER BY id LIMIT 1",
     [[800101]]),
    ("aggregate_count",
     "MATCH (a:Gate9Claim) RETURN count(*) AS total",
     [[1]]),
    ("aggregate_collect",
     "MATCH (a:Gate9Claim) RETURN collect(a.scope) AS scopes",
     [[["professional"]]]),
    ("in_positive",
     "MATCH (a:Gate9Claim) WHERE a.scope IN ['professional'] RETURN a.id AS id",
     [[800101]]),
    ("in_negative",
     "MATCH (a:Gate9Claim) WHERE a.scope IN ['study'] RETURN a.id AS id",
     []),
    ("is_null_negative",
     "MATCH (a:Gate9Claim) WHERE a.scope IS NULL RETURN a.id AS id",
     []),
    ("is_null_positive",
     "MATCH (a:Gate9Skill) WHERE a.scope IS NULL RETURN a.id AS id",
     [[800100]]),
    ("with_order_limit",
     "MATCH (a:Gate9Claim) WITH a ORDER BY a.id LIMIT 1 RETURN a.id AS id",
     [[800101]]),
    ("undocumented_tolower",
     "MATCH (a:Gate9Skill) WHERE toLower(a.label) = toLower('JAVA') RETURN a.id AS id",
     [[800100]]),
    ("count_binding",
     "MATCH (a:Gate9Claim) RETURN count(a) AS total",
     [[1]]),
)

EXPECTED_ROWS = {
    "findEvidence": 1, "getSource": 1, "countNodes": 1, "countRelations": 1,
}


def fail(code: str) -> None:
    raise RuntimeError(code)


def verify_fixture(fixture: dict) -> None:
    if (
        not isinstance(fixture, dict)
        or fixture.get("version") != "gate9-exact-orbe-query-fixture-v1"
        or fixture.get("provenance") != "synthetic_laboratory_only"
        or not isinstance(fixture.get("queries"), dict)
        or not isinstance(fixture.get("params"), dict)
        or set(fixture["queries"]) != set(ORDER)
        or set(fixture["params"]) != set(ORDER)
        or not all(isinstance(fixture["queries"][name], str) for name in ORDER)
    ):
        fail("GATE9_BAD_SYNTHETIC_FIXTURE")


def validate_ci() -> tuple[dict, str, str]:
    if (
        os.environ.get("GATE9_ISOLATION_MODE") != "github_hosted_ephemeral"
        or os.environ.get("GITHUB_REPOSITORY") != "SladeSouzaSantos/phasscode-platform"
        or os.environ.get("GITHUB_REF") != "refs/heads/experiment/hydradb"
        or not os.environ.get("GITHUB_RUN_ID", "").isdecimal()
    ):
        fail("GATE9_CI_ISOLATION_REQUIRED")
    base = Path(os.environ.get("RUNNER_TEMP", ""))
    if not base.is_absolute() or not base.is_dir():
        fail("GATE9_RUNNER_TEMP_REQUIRED")
    fixture_path = Path(os.environ.get("GATE9_FIXTURE_PATH", ""))
    token_path = Path(os.environ.get("GATE9_HYDRA_TOKEN_FILE", ""))
    auth_path = Path(os.environ.get("GATE9_NEO_AUTH_FILE", ""))
    for file in (fixture_path, token_path, auth_path):
        if not file.is_absolute() or file.is_symlink() or not file.is_file():
            fail("GATE9_PRIVATE_FILE_UNAVAILABLE")
        if not file.resolve().is_relative_to(base.resolve()):
            fail("GATE9_FILE_OUTSIDE_EPHEMERAL_RUNNER")
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
    verify_fixture(fixture)
    token = token_path.read_text(encoding="utf-8").strip()
    auth = auth_path.read_text(encoding="utf-8").strip()
    if len(token) < 32 or not auth.startswith("neo4j/") or len(auth) < 32:
        fail("GATE9_AUTH_MALFORMED")
    return fixture, token, auth


def error_status(code: str) -> dict:
    return {"status": "error", "code": code[:100], "rows": None}


def query(opener, engine: str, text: str, params: dict, token: str, auth: str) -> dict:
    if engine == "hydradb":
        url = HYDRA
        payload = {
            "cell_id": "cell-0", "query": text,
            "parameters": params, "timeout_ms": 20000,
        }
        headers = {
            "Authorization": "Bearer " + token,
            "X-Graph-Namespace": "lab",
            "Content-Type": "application/json", "Accept": "application/json",
        }
    else:
        url = NEO4J
        user, password = auth.split("/", 1)
        basic = base64.b64encode((user + ":" + password).encode()).decode("ascii")
        payload = {"statements": [
            {"statement": text, "parameters": params, "resultDataContents": ["row"]}
        ]}
        headers = {"Authorization": "Basic " + basic, "Content-Type": "application/json"}

    request = Request(url, data=json.dumps(payload).encode("utf-8"),
                      headers=headers, method="POST")
    try:
        with opener.open(request, timeout=25) as response:
            if response.status != 200:
                return error_status("HTTP_" + str(response.status))
            result = json.loads(response.read(MAX_RESPONSE).decode("utf-8"))
    except HTTPError as exc:
        return error_status("HTTP_" + str(exc.code))
    except (URLError, TimeoutError, OSError):
        return error_status("TRANSPORT_ERROR")
    except (ValueError, UnicodeError):
        return error_status("MALFORMED_JSON")
    if not isinstance(result, dict):
        return error_status("INVALID_ENVELOPE")
    if engine == "neo4j":
        errors = result.get("errors")
        if errors:
            code = errors[0].get("code", "NEO4J_QUERY_ERROR")
            return error_status(str(code))
        output = result.get("results")
        if not isinstance(output, list) or len(output) != 1:
            return error_status("NEO4J_RESPONSE_SHAPE")
        rows = [r.get("row") for r in output[0].get("data", [])]
        columns = output[0].get("columns")
    else:
        if result.get("error") or result.get("errors"):
            return error_status("HYDRADB_ENGINE_ERROR")
        rows = result.get("rows")
        columns = result.get("columns")
    if not isinstance(rows, list) or not isinstance(columns, list):
        return error_status("RESULT_SHAPE")
    if any(not isinstance(row, list) or len(row) != len(columns) for row in rows):
        return error_status("RESULT_ROW_SHAPE")
    return {"status": "accepted", "code": None, "rows": len(rows), "_raw": rows}


def normalize_result(value):
    """Normalize typed HydraDB JSON scalars without recording raw payloads."""
    if isinstance(value, dict) and "type" in value and "value" in value:
        return normalize_result(value["value"])
    if isinstance(value, list):
        return [normalize_result(item) for item in value]
    return value


def portable_semantics(out: dict, expected: list[list]) -> dict:
    if out["status"] != "accepted":
        return observe(out)
    got = normalize_result(out["_raw"])
    exact = got == expected
    return {
        "status": "value_match" if exact else "value_mismatch",
        "rows": out["rows"],
        "expectedRows": len(expected),
        "code": None,
    }


def observe(out: dict, expected: int | None = None, *,
            seed: bool = False, exact_orbe: bool = False) -> dict:
    result = {key: val for key, val in out.items() if key != "_raw"}
    if result["status"] == "accepted":
        if seed:
            result["status"] = "executed"
        elif exact_orbe and expected is None:
            # E.g. prune query may complete without a populated fixture.
            result["status"] = "executed_scope_unverified"
        elif expected is not None:
            result["status"] = (
                "result_cardinality_match" if out["rows"] == expected
                else "result_cardinality_mismatch"
            )
        else:
            result["status"] = "executed"
    return result


def wait_services(opener, token: str, auth: str) -> None:
    deadline = time.monotonic() + 150
    while time.monotonic() < deadline:
        try:
            with opener.open(HYDRA_READY, timeout=3) as response:
                hydra_ok = response.status == 200
        except (HTTPError, URLError, OSError, TimeoutError):
            hydra_ok = False
        neo = query(opener, "neo4j", "RETURN 1 AS answer", {}, token, auth)
        if hydra_ok and neo["status"] == "accepted":
            print("GATE9_EPHEMERAL_ENGINES_READY")
            return
        time.sleep(2)
    fail("GATE9_ENGINE_READINESS_TIMEOUT")


def exact_suite(opener, fixture: dict, token: str, auth: str) -> list[dict]:
    # HydraDB is deliberately probed with exact, unmodified Orbe queries.
    # Neo4j is the positive-control execution. No results imply no parity.
    reports = []
    for name in ORDER:
        observations = {}
        for engine in ("neo4j", "hydradb"):
            output = query(opener, engine, fixture["queries"][name],
                           fixture["params"][name], token, auth)
            if engine == "neo4j":
                if output["status"] != "accepted":
                    fail("GATE9_NEO4J_ORBE_QUERY_FAILED_" + name)
                expected = EXPECTED_ROWS.get(name)
                if expected is not None and output["rows"] != expected:
                    fail("GATE9_NEO4J_ORBE_REFERENCE_DRIFT_" + name)
                if name == "countNodes" and output["_raw"][0][0] != 3:
                    fail("GATE9_NEO4J_NODE_COUNT_DRIFT")
                if name == "countRelations" and output["_raw"][0][0] != 2:
                    fail("GATE9_NEO4J_EDGE_COUNT_DRIFT")
            expected = EXPECTED_ROWS.get(name)
            observations[engine] = observe(
                output, expected=expected,
                seed=name in ("constraint", "nodes", "relations"),
                exact_orbe=True,
            )
        reports.append({"query": name, **observations})
    return reports


def portable_suite(opener, token: str, auth: str) -> dict:
    seeds = {}
    for engine in ("hydradb", "neo4j"):
        result = query(opener, engine, PORTABLE_SEED, {}, token, auth)
        if result["status"] != "accepted":
            fail("GATE9_PORTABLE_SEED_FAILED_" + engine)
        seeds[engine] = observe(result, seed=True)

    cases = []
    for name, cypher, expected in PORTABLE_READS:
        readings = {}
        for engine in ("neo4j", "hydradb"):
            result = query(opener, engine, cypher, {}, token, auth)
            semantic = portable_semantics(result, expected)
            if engine == "neo4j" and semantic["status"] != "value_match":
                fail("GATE9_PORTABLE_NEO4J_GOLD_DRIFT_" + name)
            readings[engine] = semantic
        cases.append({"name": name, **readings})
    return {"seed": seeds, "cases": cases}


def mutation_suite(opener, token: str, auth: str) -> list[dict]:
    """Exercise only disposable numeric-ID records and verify postconditions."""
    steps = [
        ("create_temporary_pair",
         "CREATE (a:Gate9Temp {id: 800200})-[:GATE9_TEMP]->"
         "(b:Gate9Temp {id: 800201})", {}, None),
        ("verify_created_pair",
         "MATCH (a:Gate9Temp {id: 800200})-[:GATE9_TEMP]->(b) "
         "RETURN b.id AS id", {}, [[800201]]),
        ("delete_temporary_edge",
         "MATCH (a:Gate9Temp {id: 800200})-[r:GATE9_TEMP]->(b) DELETE r",
         {}, None),
        ("verify_deleted_edge",
         "MATCH (a:Gate9Temp {id: 800200})-[:GATE9_TEMP]->(b) "
         "RETURN b.id AS id", {}, []),
        ("detach_delete_temporary_node",
         "MATCH (a:Gate9Temp {id: 800200}) DETACH DELETE a", {}, None),
        ("verify_deleted_node",
         "MATCH (a:Gate9Temp {id: 800200}) RETURN a.id AS id",
         {}, []),
        ("merge_path_first",
         "MERGE (a:Gate9Merge {id: 800301})-[:GATE9_MERGE]->"
         "(b:Gate9Merge {id: 800302})", {}, None),
        ("merge_path_again",
         "MERGE (a:Gate9Merge {id: 800301})-[:GATE9_MERGE]->"
         "(b:Gate9Merge {id: 800302})", {}, None),
        ("verify_merge_idempotence",
         "MATCH (a:Gate9Merge {id: 800301})-[:GATE9_MERGE]->(b) "
         "RETURN count(*) AS total", {}, [[1]]),
        ("set_matched_node",
         "MATCH (a:Gate9Merge {id: 800301}) SET a.status = 'ready'",
         {}, None),
        ("verify_set",
         "MATCH (a:Gate9Merge {id: 800301}) RETURN a.status AS status",
         {}, [["ready"]]),
        ("unwind_numeric_batch",
         "UNWIND $rows AS row MERGE (n {id: row.vertex}) "
         "SET n:Gate9Batch, n.label = row.label",
         {"rows": [{"vertex": 800401, "label": "alpha"}]}, None),
        ("verify_unwind",
         "MATCH (n:Gate9Batch {id: 800401}) RETURN n.label AS label",
         {}, [["alpha"]]),
    ]
    reports = []
    for name, cypher, params, expected in steps:
        result = {}
        for engine in ("neo4j", "hydradb"):
            response = query(opener, engine, cypher, params, token, auth)
            checked = (
                observe(response, seed=True)
                if expected is None else portable_semantics(response, expected)
            )
            if engine == "neo4j" and checked["status"] not in (
                "executed", "value_match",
            ):
                fail("GATE9_NEO4J_MUTATION_REFERENCE_DRIFT_" + name)
            result[engine] = checked
        reports.append({"name": name, **result})
    return reports


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--selftest", action="store_true")
    parser.add_argument("--live", action="store_true")
    args = parser.parse_args()
    if args.selftest == args.live:
        fail("GATE9_CHOOSE_EXACT_MODE")
    if args.selftest:
        verify_fixture({
            "version": "gate9-exact-orbe-query-fixture-v1",
            "provenance": "synthetic_laboratory_only",
            "queries": {name: "RETURN 1" for name in ORDER},
            "params": {name: {} for name in ORDER},
        })
        print("GATE9_RUNTIME_PROBE_SELFTEST_PASS")
        return
    fixture, token, auth = validate_ci()
    opener = build_opener(ProxyHandler({}))
    wait_services(opener, token, auth)
    exact = exact_suite(opener, fixture, token, auth)
    portable = portable_suite(opener, token, auth)
    mutations = mutation_suite(opener, token, auth)
    report = {
        "schemaVersion": "hydradb-gate9-ephemeral-runtime-v1",
        "scope": "github_hosted_ephemeral_containers_only",
        "fixture": fixture["version"],
        "operationCount": len(exact),
        "portableProbeCount": len(portable["cases"]),
        "mutationProbeCount": len(mutations),
        "exactOrbeQueries": exact,
        "portableCypher": portable,
        "mutationCypher": mutations,
        "compatibilityVerdict": "requires_adaptation_and_further_testing",
        "semanticParity": "not_established",
        "boltCompatibility": "separate_probe_required",
        "performanceClaim": "none",
        "noOperationalEnvironmentAccess": True,
    }
    print("GATE9_EPHEMERAL_RUNTIME_JSON", json.dumps(report, separators=(",", ":")))
    print("GATE9_EPHEMERAL_RUNTIME_REPORT_GENERATED")
    print("GATE9_NO_MIGRATION_OR_PRODUCTION_CLAIMS")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, KeyError) as exc:
        code = str(exc) if str(exc).startswith("GATE9_") else "INTERNAL_ERROR"
        print("GATE9_EPHEMERAL_RUNTIME_FAILED", code, file=sys.stderr)
        sys.exit(1)
