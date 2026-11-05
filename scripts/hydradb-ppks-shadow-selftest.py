#!/usr/bin/env python3
"""Offline mocks: shadow result parity, complete sources, fallback, run scope."""
from __future__ import annotations

from pathlib import Path
import runpy
import sys

REPO = Path.home() / "hydradb-lab" / "phasscode-platform"
S = runpy.run_path(str(REPO / "scripts/hydradb-ppks-shadow-reader.py"))


def mock_response(columns: list[str], rows: list[tuple]) -> dict:
    return {
        "columns": columns,
        "rows": [
            [{"type": "string", "value": str(item)} for item in row]
            for row in rows
        ],
    }


def main() -> None:
    records = S["STAGE"]["data_fixture"]()
    key = "52115000533000"

    def verified_backend(cypher: str, params: dict) -> dict:
        assert ".lab_run = $run" in cypher, "SHADOW_UNSCOPED_QUERY"
        assert params.get("run") == key, "SHADOW_RUN_MISMATCH"
        if cypher == S["FIND_QUERY"]:
            _, rows = S["canonical_find"](records, params["skill"])
            return mock_response(S["FIND_COLUMNS"], rows)
        if cypher == S["SOURCE_QUERY"]:
            _, rows = S["canonical_source"](records, params["source"])
            return mock_response(S["SOURCE_COLUMNS"], rows)
        raise AssertionError("SHADOW_UNEXPECTED_QUERY")

    off = S["ShadowReader"](records)
    assert off.find_evidence("Java")["status"] == "canonical"
    assert off.get_source("nonexistent")["source"] is None

    healthy = S["ShadowReader"](records, key, verified_backend)
    java = healthy.find_evidence("Java", 20)
    assert java["status"] == "graph_verified"
    assert len(java["claims"]) == 2
    assert {c["scope"] for c in java["claims"]} == {
        "professional", "study"
    }
    flutter = healthy.find_evidence("Flutter", 20)
    assert flutter["status"] == "graph_verified"
    assert {c["scope"] for c in flutter["claims"]} == {
        "mixed_role", "personal_project"
    }
    typescript = healthy.find_evidence("TypeScript", 1)
    assert typescript["status"] == "graph_verified"
    assert len(typescript["claims"]) == 1
    # A claim limit MUST NOT truncate its four evidence references.
    assert len(typescript["claims"][0]["sourceIds"]) == 4
    assert typescript["sourceCount"] == 4
    assert healthy.find_evidence("Go")["claims"] == []
    assert healthy.get_source("missing-source-key")["source"] is None
    assert healthy.get_source("phasscode-platform--ports")["source"][
        "verification"
    ] == "code_reviewed"
    assert healthy.get_source("phasscode-platform--catalog")["source"][
        "verification"
    ] == "catalog_only"

    def missing_source(cypher: str, params: dict) -> dict:
        result = verified_backend(cypher, params)
        if cypher == S["FIND_QUERY"] and params["skill"] == "java":
            result["rows"] = result["rows"][:-1]
        return result

    partial = S["ShadowReader"](records, key, missing_source)
    fallback = partial.find_evidence("Java")
    assert fallback["status"] == "canonical_fallback"
    assert len(fallback["claims"]) == 2  # canonical data survives
    assert fallback["reason"] == "GRAPH_UNAVAILABLE_OR_MISMATCH"

    def extra_source(cypher: str, params: dict) -> dict:
        result = verified_backend(cypher, params)
        if cypher == S["FIND_QUERY"] and params["skill"] == "java":
            result["rows"].append(result["rows"][0])
        return result

    assert S["ShadowReader"](records, key, extra_source).find_evidence(
        "Java"
    )["status"] == "canonical_fallback"

    def bad_columns(cypher: str, params: dict) -> dict:
        result = verified_backend(cypher, params)
        result["columns"] = ["untrusted"]
        return result

    assert S["ShadowReader"](records, key, bad_columns).get_source(
        "phasscode-platform--catalog"
    )["status"] == "canonical_fallback"

    def timeout_backend(cypher: str, params: dict) -> dict:
        raise TimeoutError("simulated graph outage")

    unavailable = S["ShadowReader"](records, key, timeout_backend)
    assert unavailable.find_evidence("Flutter")["status"] == "canonical_fallback"
    assert unavailable.get_source("phasscode-platform--ports")[
        "status"
    ] == "canonical_fallback"
    try:
        healthy.find_evidence("Java", 0)
    except ValueError:
        pass
    else:
        raise AssertionError("SHADOW_LIMIT_ZERO_ACCEPTED")

    print("SHADOW_OFFLINE_SELFTEST_PASS")
    print("SHADOW_CANONICAL_SAFE_FALLBACK_PASS")
    print("SHADOW_RUN_SCOPING_PASS")
    print("SHADOW_COMPLETE_CLAIM_SOURCES_PASS")


if __name__ == "__main__":
    try:
        main()
    except (AssertionError, ValueError, OSError, KeyError) as exc:
        print("SHADOW_SELFTEST_FAILED", type(exc).__name__,
              str(exc)[:100], file=sys.stderr)
        sys.exit(1)
