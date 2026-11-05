#!/usr/bin/env python3
"""Second-stage, isolated PPKS semantic-parity test for HydraDB and Neo4j.

Dry-run by default. '--live' writes a synthetic, public-PPKS-derived graph
to the TWO LAB graph stores. No Orbe/DEV/MAIN calls and no LLM usage.
No third-party Python dependencies; uses the first-stage HTTP client helpers.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import runpy
import secrets
import statistics
import subprocess
import sys
import time

REPO = Path.home() / "hydradb-lab" / "phasscode-platform"
LAB = REPO.parent
COMMON = runpy.run_path(str(REPO / "scripts/hydradb-neo4j-ppks-benchmark.py"))
REPETITIONS = 3


def assert_quoted(value: str) -> str:
    """A strict allowlist for tiny, publicly curated PPKS scalar literals."""
    if not re.fullmatch(r"[A-Za-z0-9._+/# -]{1,90}", value):
        raise ValueError("Unsafe PPKS scalar in a synthetic Cypher query")
    return "'" + value + "'"


def node(alias: str, label: str, ident: int, properties: dict[str, str]) -> str:
    props = [f"id: {ident}"]
    props.extend(f"{key}: {assert_quoted(value)}" for key, value in properties.items())
    return f"({alias}:{label} {{{', '.join(props)}}})"


def json_rows(engine: str, result: dict) -> tuple[tuple[str, ...], ...]:
    if engine == "hydradb":
        columns = result.get("columns")
        rows = result.get("rows")
        if not isinstance(columns, list) or not isinstance(rows, list):
            raise ValueError("HydraDB response shape mismatch")
        decoded = []
        for row in rows:
            if len(row) != len(columns):
                raise ValueError("HydraDB row shape mismatch")
            values = []
            for value in row:
                if not isinstance(value, dict) or value.get("type") != "string":
                    raise ValueError("HydraDB string expected")
                if not isinstance(value.get("value"), str):
                    raise ValueError("HydraDB invalid string value")
                values.append(value["value"])
            decoded.append(tuple(values))
        return tuple(decoded)
    columns = result.get("columns")
    data = result.get("data")
    if not isinstance(columns, list) or not isinstance(data, list):
        raise ValueError("Neo4j response shape mismatch")
    decoded = []
    for entry in data:
        row = entry.get("row")
        if not isinstance(row, list) or len(row) != len(columns):
            raise ValueError("Neo4j row shape mismatch")
        if not all(isinstance(value, str) for value in row):
            raise ValueError("Neo4j string expected")
        decoded.append(tuple(row))
    return tuple(decoded)


def load_public_records() -> list[dict]:
    pairs = COMMON["read_ppks_sample"]()
    grouped: dict[str, list[str]] = defaultdict(list)
    for pair in pairs:
        grouped[pair["record_id"]].append(pair["technology"])
    records = []
    for record_id in sorted(grouped):
        group = "experiences" if record_id.startswith("experiencia-") else "projects"
        p = REPO / "knowledge" / "ppks" / group / (record_id + ".json")
        item = json.loads(p.read_text(encoding="utf-8"))
        if item.get("id") != record_id or item.get("kind") != group[:-1]:
            raise ValueError("PPKS record mismatch")
        if group == "projects" and item.get("identity", {}).get("visibility") != "public":
            raise ValueError("Only public projects are eligible")
        status = item.get("sync", {}).get("verificationStatus")
        if status not in ("code_reviewed", "catalog_only"):
            raise ValueError("Unrecognized PPKS verification status")
        nature = item.get("identity", {}).get("nature", "unknown")
        scope = "professional" if group == "experiences" else {
            "professional": "professional_project",
            "personal": "personal_project",
            "study": "study",
        }.get(nature, "unknown")
        records.append({
            "key": record_id, "scope": scope, "verification": status,
            "skills": grouped[record_id],
        })
    if len(records) != 7 or sum(len(r["skills"]) for r in records) != 14:
        raise ValueError("Unexpected PPKS test corpus")
    return records


def graph_plan(records: list[dict]) -> dict:
    # Each run uses a fresh numeric subspace. All IDs fit in signed 63 bits.
    base = (secrets.randbelow(1 << 40) + (1 << 42)) * 10000
    skills = sorted({skill for record in records for skill in record["skills"]})
    record_ids = {r["key"]: base + 100 + i for i, r in enumerate(records)}
    skill_ids = {skill: base + 500 + i for i, skill in enumerate(skills)}
    source_ids = {r["key"]: base + 1000 + i for i, r in enumerate(records)}
    claim_ids = {}
    writes = []
    count = 0
    for record in records:
        record_key = record["key"]
        rid = record_ids[record_key]
        sid = source_ids[record_key]
        record_node = node("r", "Record", rid, {
            "record_key": record_key, "scope": record["scope"],
        })
        source_node = node("src", "Source", sid, {
            "record_key": record_key, "verification": record["verification"],
        })
        for skill in record["skills"]:
            cid = base + 2000 + count
            count += 1
            claim_ids[(record_key, skill)] = cid
            claim_node = node("c", "Claim", cid, {
                "record_key": record_key, "technology": skill,
                "scope": record["scope"],
            })
            skill_node = node("s", "Skill", skill_ids[skill], {"name": skill})
            writes.extend([
                f"MERGE {record_node}-[:HAS_CLAIM]->{claim_node}",
                f"MERGE {claim_node}-[:USES_TECHNOLOGY]->{skill_node}",
                f"MERGE {claim_node}-[:SUPPORTED_BY]->{source_node}",
            ])
    assert count == 14 and len(writes) == 42
    return {
        "records": records,
        "record_ids": record_ids, "skill_ids": skill_ids,
        "source_ids": source_ids, "claim_ids": claim_ids, "writes": writes,
        "counts": {"records": 7, "skills": len(skills), "claims": 14,
                   "sources": 7, "edges": len(writes)},
    }


def query_cases(plan: dict) -> list[dict]:
    records = plan["records"]
    cases = []
    for r in records:
        key = r["key"]
        rid = plan["record_ids"][key]
        cases.append({
            "name": "record_skills", "key": key,
            "cypher": (
                f"MATCH (r:Record {{id: {rid}}})-[:HAS_CLAIM]->"
                "(c:Claim)-[:USES_TECHNOLOGY]->(s:Skill) "
                "RETURN s.name AS skill, c.scope AS scope ORDER BY skill"
            ),
            "columns": ["skill", "scope"],
            "rows": sorted((skill, r["scope"]) for skill in r["skills"]),
        })
        cases.append({
            "name": "record_provenance", "key": key,
            "cypher": (
                f"MATCH (r:Record {{id: {rid}}})-[:HAS_CLAIM]->"
                "(c:Claim)-[:SUPPORTED_BY]->(src:Source) "
                "RETURN src.record_key AS record, src.verification AS verification "
                "ORDER BY record"
            ),
            "columns": ["record", "verification"],
            "rows": [(key, r["verification"])] * len(r["skills"]),
        })
    for technology in ("Flutter", "Java", "TypeScript"):
        skill_id = plan["skill_ids"][technology]
        expected = sorted(
            (r["key"], r["scope"]) for r in records
            if technology in r["skills"]
        )
        cases.append({
            "name": "shared_skill", "key": technology,
            "cypher": (
                f"MATCH (s:Skill {{id: {skill_id}}})"
                "<-[:USES_TECHNOLOGY]-(c:Claim)"
                "<-[:HAS_CLAIM]-(r:Record) "
                "RETURN r.record_key AS record, c.scope AS scope ORDER BY record"
            ),
            "columns": ["record", "scope"],
            "rows": expected,
        })
    rid = plan["record_ids"]["greencity-os"]
    peer_keys = sorted({
        r["key"] for r in records
        if set(r["skills"]) & {"Flutter", "Dart"}
    })
    cases.append({
        "name": "shared_peer_4_hop", "key": "greencity-os",
        "cypher": (
            f"MATCH (r:Record {{id: {rid}}})"
            "-[:HAS_CLAIM]->(c:Claim)"
            "-[:USES_TECHNOLOGY]->(s:Skill)"
            "<-[:USES_TECHNOLOGY]-(c2:Claim)"
            "<-[:HAS_CLAIM]-(peer:Record) "
            "RETURN DISTINCT peer.record_key AS record ORDER BY record"
        ),
        "columns": ["record"],
        "rows": [(key,) for key in peer_keys],
    })
    return cases


def verify(engine: str, result: dict, case: dict) -> None:
    if result.get("columns") != case["columns"]:
        raise ValueError(f"{engine}: wrong columns for {case['name']}:{case['key']}")
    got = json_rows(engine, result)
    expected = tuple(tuple(row) for row in case["rows"])
    if sorted(got) != sorted(expected):
        raise ValueError(
            f"{engine}: result mismatch for {case['name']}:{case['key']}; "
            f"got {len(got)} rows, expected {len(expected)}"
        )


def percentile(values: list[float], fraction: float) -> float:
    values = sorted(values)
    if not values:
        raise ValueError("No samples")
    p = (len(values) - 1) * fraction
    lo = int(p)
    return round(values[lo] + (values[min(lo + 1, len(values)-1)] - values[lo])
                 * (p - lo), 3)


def metrics(values: list[float]) -> dict:
    return {
        "samples": len(values), "p50_ms": percentile(values, .5),
        "p95_ms": percentile(values, .95),
        "mean_ms": round(statistics.mean(values), 3),
    }


def assert_comparator_healthy() -> None:
    d = json.loads(subprocess.check_output(
        ["docker", "inspect", "phasscode-hydradb-lab-neo4j-compare-1"],
        text=True,
    ))[0]
    labels = d.get("Config", {}).get("Labels", {})
    if (labels.get("com.docker.compose.project") != "phasscode-hydradb-lab"
        or labels.get("com.docker.compose.service") != "neo4j-compare"):
        raise ValueError("Neo4j comparison container does not belong to LAB")
    if d.get("State", {}).get("Health", {}).get("Status") != "healthy":
        raise ValueError("Neo4j comparison container is not healthy")


def main() -> None:
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true",
                        help="Write a NEW test graph into both isolated LAB databases")
    args = parser.parse_args()
    env = COMMON["check_lab"]()
    if env.get("ORBE_GRAPHRAG_MODE") != "off":
        raise ValueError("Orbe LAB must remain in graph OFF mode")
    records = load_public_records()
    plan = graph_plan(records)
    cases = query_cases(plan)
    print("PPKS_GRAPH_PLAN_COUNTS", json.dumps(plan["counts"], sort_keys=True))
    print("PPKS_GRAPH_QUERY_CASES", len(cases))
    print("PPKS_GRAPH_SHARED_SKILL_CASES Flutter Java TypeScript")
    if not args.live:
        print("PPKS_GRAPH_DRY_RUN_OK_NO_WRITES")
        return

    from urllib.error import HTTPError, URLError
    from urllib.request import ProxyHandler, build_opener
    import re
    auth = env.get("NEO4J_LAB_AUTH", "")
    if not re.fullmatch(r"neo4j/[A-Za-z0-9_-]{32,}", auth):
        raise ValueError("Missing isolated Neo4j LAB auth")
    token = (LAB / "secrets" / "hydradb_auth_token").read_text().strip()
    if len(token) < 32:
        raise ValueError("Missing HydraDB LAB token")
    assert_comparator_healthy()
    opener = build_opener(ProxyHandler({}))
    from urllib.request import Request
    with opener.open("http://127.0.0.1:19090/readyz", timeout=8) as ready:
        if ready.status != 200:
            raise ValueError("HydraDB is not ready")
    if COMMON["value_neo4j"](COMMON["neo4j"](opener, auth, "RETURN 1 AS id")) != 1:
        raise ValueError("Neo4j authentication query failed")
    print("PPKS_GRAPH_BOTH_ENGINES_READY")

    call = {
        "hydradb": lambda cypher: COMMON["hydradb"](opener, token, cypher),
        "neo4j": lambda cypher: COMMON["neo4j"](opener, auth, cypher),
    }
    write_latency = {"hydradb": [], "neo4j": []}
    for idx, cypher in enumerate(plan["writes"], 1):
        for engine in ("hydradb", "neo4j"):
            try:
                started = time.perf_counter()
                call[engine](cypher)
                write_latency[engine].append((time.perf_counter() - started) * 1000)
            except Exception as exc:
                raise ValueError(f"Write {idx}/42 failed in {engine}: "
                                 f"{type(exc).__name__} "
                                 f"HTTP={getattr(exc, 'code', '-')}"
                                 ) from None
    print("PPKS_GRAPH_WRITES_PER_ENGINE", len(plan["writes"]))

    reads: dict[str, dict[str, list[float]]] = {
        engine: defaultdict(list) for engine in call
    }
    for case in cases:
        for rep in range(REPETITIONS + 1):  # first pass is an unmeasured warm-up
            engines = ("hydradb", "neo4j") if rep % 2 == 0 else ("neo4j", "hydradb")
            for engine in engines:
                try:
                    started = time.perf_counter()
                    result = call[engine](case["cypher"])
                    elapsed = (time.perf_counter() - started) * 1000
                    verify(engine, result, case)
                except Exception as exc:
                    print("PPKS_GRAPH_QUERY_FAILED", engine,
                          case["name"], case["key"],
                          "HTTP", getattr(exc, "code", "-"),
                          "error_class", type(exc).__name__, file=sys.stderr)
                    # Do not print queries or HTTP bodies; preserve lab credentials.
                    raise ValueError("Semantic parity failed; see preceding case") from None
                if rep > 0:
                    reads[engine][case["name"]].append(elapsed)
    print("PPKS_GRAPH_PARITY_CASES", len(cases), "PASS")
    report = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "scenario": "ppks_shared_skills_and_provenance_synthetic",
        "scope": "five public projects and two publicly declared experiences",
        "counts": plan["counts"],
        "repetitions_per_case": REPETITIONS,
        "cases": [{"name": c["name"], "key": c["key"],
                   "expected_rows": len(c["rows"])} for c in cases],
        "parity": "PASS: exact result sets in both LAB graph stores",
        "write_latency": {e: metrics(values) for e, values in write_latency.items()},
        "read_latency_by_case": {
            e: {name: metrics(values) for name, values in classes.items()}
            for e, classes in reads.items()
        },
        "limitations": (
            "Synthetic claims and provenance nodes derived from public PPKS metadata, "
            "not an import of production Neo4j OrbeEvidence schema. "
            "Different HTTP protocols, CPU/memory limits and engine architectures; "
            "do not infer overall graph database performance. "
            "Real graphFindEvidenceCypher and graphGetSourceCypher are NOT tested."
        ),
    }
    out = LAB / "benchmarks"
    out.mkdir(exist_ok=True)
    output = out / datetime.now(timezone.utc).strftime(
        "ppks-provenance-%Y%m%dT%H%M%SZ.json"
    )
    with output.open("x", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
        f.write("\n")
    output.chmod(0o600)
    print("PPKS_GRAPH_REPORT", output)
    print("PPKS_GRAPH_SEMANTIC_PARITY_PASS")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        # Restrict visibility to error type and message from our own validations.
        # HTTPError bodies, credentials and raw queries are never printed.
        print("PPKS_GRAPH_TEST_FAILED", type(exc).__name__,
              str(exc) if not hasattr(exc, "code") else "HTTP " + str(exc.code),
              file=sys.stderr)
        sys.exit(1)
