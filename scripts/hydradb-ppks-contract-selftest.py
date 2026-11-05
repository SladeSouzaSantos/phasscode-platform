#!/usr/bin/env python3
"""Offline assertions for the stage-three PPKS contract; does not touch DBs."""
from __future__ import annotations

from collections import Counter
from pathlib import Path
import runpy
import sys

ROOT = Path.home() / "hydradb-lab" / "phasscode-platform"
STAGE = runpy.run_path(str(ROOT / "scripts/hydradb-neo4j-ppks-evidence-contract.py"))


def main() -> None:
    records = STAGE["data_fixture"]()
    plan = STAGE["graph_plan"](records)
    cases = STAGE["query_cases"](plan)
    counts = plan["counts"]
    assert counts == {
        "records": 7, "skills": 10, "claims": 14,
        "sources": 16, "vertices": 47, "edges": 60,
    }, "PPKS_CONTRACT_COUNTS_CHANGED"
    assert len(plan["neo_vertices"]) == 47
    assert len(plan["neo_edges"]) == 60
    assert len(plan["hydra_writes"]) == 60
    # Regression: persistent LAB datasets must NEVER be queried without a
    # unique benchmark-run boundary. Numeric IDs alone only isolate writes;
    # previous unscoped Java reads returned 12 rows instead of 6.
    run_key = plan["run_key"]
    assert isinstance(run_key, str) and run_key.isdecimal(), \
        "PPKS_LAB_RUN_KEY_MISSING"
    expected_tag = "lab_run: '" + run_key + "'"
    assert all(expected_tag in vertex for vertex in plan["neo_vertices"]), \
        "PPKS_NEO4J_VERTEX_WITHOUT_RUN_MARKER"
    assert all(write.count(expected_tag) == 2 for write in plan["hydra_writes"]), \
        "PPKS_HYDRADB_EDGE_WITHOUT_RUN_MARKERS"
    assert all(
        case["params"].get("run") == run_key
        and "$run" in case["query"]
        and ".lab_run = $run" in case["query"]
        for case in cases
    ), "PPKS_UNSCOPED_READ_COULD_LEAK_PRIOR_RUN"
    # Every new run has a fresh marker even when the record/skill names
    # remain identical across runs. This is required to keep retries isolated.
    another = STAGE["graph_plan"](records)
    assert run_key != another["run_key"], "PPKS_REUSED_RUN_MARKER"
    assert cases[0]["params"]["run"] != STAGE["query_cases"](another)[0]["params"]["run"], \
        "PPKS_REPEATED_FIXTURE_QUERY_SCOPE"
    # Machine enums contain underscores; reject executable Cypher punctuation.
    safe = STAGE["node"]("n", "Source", 5, {
        "verification": "code_reviewed",
        "origin": "ppks_catalog",
    })
    assert "'code_reviewed'" in safe and "'ppks_catalog'" in safe
    try:
        STAGE["node"]("n", "Source", 6, {"origin": "x' RETURN *"})
    except ValueError:
        pass
    else:
        raise AssertionError("Unsafe Cypher literal was accepted")
    assert len(cases) == 13
    assert Counter(c["name"] for c in cases) == {
        "find_evidence": 5, "bounded_claims": 3, "get_source": 5
    }, "PPKS_CONTRACT_CASE_COUNT_CHANGED"

    by_key = {(c["name"], c["key"]): c for c in cases}
    java = by_key[("find_evidence", "Java")]["rows"]
    assert {row[1] for row in java} == {"professional", "study"}, \
        "PPKS_JAVA_PROFESSIONAL_STUDY_SCOPE_MISMATCH"
    assert all(row[3] in {"code_reviewed", "catalog_only"} for row in java)
    flutter = by_key[("find_evidence", "Flutter")]["rows"]
    assert {row[1] for row in flutter} == {
        "mixed_role", "personal_project"
    }, "PPKS_FLUTTER_MIXED_ROLE_SCOPE_MISMATCH"
    assert not by_key[("find_evidence", "Go")]["rows"], "PPKS_GO_FALSE_EXPERIENCE"
    assert not by_key[("get_source", "missing-source-key")]["rows"], \
        "PPKS_MISSING_SOURCE_WAS_PRESENT"
    assert by_key[("get_source", "phasscode-platform--ports")]["rows"] == [
        ("phasscode-platform--ports", "code_reviewed", "github")
    ]
    assert by_key[("get_source", "phasscode-platform--catalog")]["rows"] == [
        ("phasscode-platform--catalog", "catalog_only", "ppks_catalog")
    ]
    # Contract source-of-truth: this is a mixed engineering/software
    # engagement, whereas Java in SIGAA is an exclusively software role.
    records_by_key = {record["key"]: record for record in records}
    assert records_by_key["experiencia-greencity"]["scope"] == "mixed_role", \
        "GREENCITY_MUST_BE_MIXED_ROLE"
    assert records_by_key["experiencia-sig"]["scope"] == "professional", \
        "SIGAA_MUST_BE_PROFESSIONAL"
    for case in cases:
        assert case["params"], "A_CONTRACT_QUERY_HAS_NO_PARAMETERS"
        assert "$" in case["query"], "A_QUERY_IS_NOT_PARAMETERIZED"
        assert "source" not in case["params"] or isinstance(
            case["params"]["source"], str
        )
    print("PPKS_CONTRACT_OFFLINE_SELFTEST_PASS")
    print("PPKS_CONTRACT_OFFLINE_CASES", len(cases))
    print("PPKS_CONTRACT_OFFLINE_EDGES", counts["edges"])


if __name__ == "__main__":
    try:
        main()
    except (AssertionError, OSError, ValueError, KeyError) as exc:
        print("PPKS_CONTRACT_SELFTEST_FAILED", type(exc).__name__,
              str(exc)[:120], file=sys.stderr)
        sys.exit(1)
