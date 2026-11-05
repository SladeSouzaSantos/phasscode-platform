#!/usr/bin/env python3
"""LAB-only contract test: PPKS claim-to-evidence provenance and safe lookups.

Dry-run by default. A live run writes ONLY to isolated HydraDB/Neo4j LABs.
The sample comprises seven publicly declared PPKS records and the first two
documented technologies per record; it never ingests private academic data.
This is a graph-adapter *contract prototype*, not an Orbe integration.
"""
from __future__ import annotations

import argparse
import base64
from collections import defaultdict
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import runpy
import secrets
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import ProxyHandler, build_opener

REPO = Path.home() / "hydradb-lab" / "phasscode-platform"
LAB = REPO.parent
UPSTREAM = runpy.run_path(
    str(REPO / "scripts/hydradb-neo4j-ppks-provenance-benchmark.py")
)
CORE = UPSTREAM["COMMON"]


def node(alias: str, label: str, ident: int, properties: dict[str, str]) -> str:
    """Use a strict scalar allowlist that also permits trusted PPKS enums.

    Stage-two only needed human-readable names; stage-three needs machine
    enums like code_reviewed, mixed_role and ppks_catalog (underscores).
    The allowlist still rejects quotes, backslashes and Cypher operators.
    """
    if alias not in ("a", "b", "n") or label not in (
        "Record", "Skill", "Claim", "Source"
    ):
        raise ValueError("PPKS_CONTRACT_INVALID_VERTEX_LABEL")
    if not isinstance(ident, int) or ident < 0:
        raise ValueError("PPKS_CONTRACT_INVALID_NUMERIC_ID")
    fields = [f"id: {ident}"]
    for key, value in properties.items():
        if not re.fullmatch(r"[a-z_]{1,40}", key):
            raise ValueError("PPKS_CONTRACT_INVALID_PROPERTY")
        if not isinstance(value, str) or not re.fullmatch(
            r"[A-Za-z0-9._+/# _-]{1,120}", value
        ):
            raise ValueError("PPKS_CONTRACT_INVALID_SCALAR")
        fields.append(f"{key}: '{value}'")
    return f"({alias}:{label} {{{', '.join(fields)}}})"


NODE = node
READ_ROWS = UPSTREAM["json_rows"]
METRICS = UPSTREAM["metrics"]
REPEATS = 3
REVIEWED_TYPES = {"source_code", "test", "documentation"}
REQUIRED_SKILLS = ("Java", "Flutter", "TypeScript")


def fail(code: str) -> None:
    raise ValueError(code)


def data_fixture() -> list[dict]:
    # Uses the same exact seven publicly declared records as stage two.
    records = UPSTREAM["load_public_records"]()
    result = []
    for record in records:
        ident = record["key"]
        directory = "experiences" if ident.startswith("experiencia-") else "projects"
        path = REPO / "knowledge" / "ppks" / directory / f"{ident}.json"
        source = json.loads(path.read_text(encoding="utf-8"))
        if source.get("id") != ident or source.get("kind") != directory[:-1]:
            fail("PPKS_RECORD_IDENTITY_MISMATCH")
        if directory == "projects" and source.get("identity", {}).get("visibility") != "public":
            fail("PPKS_NONPUBLIC_PROJECT")
        if source.get("sync", {}).get("verificationStatus") not in (
            "code_reviewed", "catalog_only"
        ):
            fail("PPKS_INVALID_VERIFICATION_STATUS")
        evidence = {}
        for item in source.get("evidence", []):
            eid = item.get("id")
            if not isinstance(eid, str) or not re.fullmatch(r"[a-z0-9-]{1,80}", eid):
                fail("PPKS_INVALID_EVIDENCE_KEY")
            if eid in evidence:
                fail("PPKS_DUPLICATE_SOURCE")
            # The adapter stores only public metadata, not raw source text/URLs.
            reviewed = (source["sync"]["verificationStatus"] == "code_reviewed"
                        and item.get("type") in REVIEWED_TYPES)
            evidence[eid] = {
                "source_key": ident + "--" + eid,
                "verification": "code_reviewed" if reviewed else "catalog_only",
                "origin": "github" if reviewed else "ppks_catalog",
                "visibility": "public",
            }
        stack = {item["name"]: item for item in source.get("stack", [])}
        claims = []
        for skill in record["skills"]:
            if skill not in stack:
                fail("PPKS_SKILL_MISSING")
            evidence_ids = stack[skill].get("evidenceIds")
            if not isinstance(evidence_ids, list) or not evidence_ids:
                fail("PPKS_CLAIM_WITHOUT_SOURCE")
            if len(evidence_ids) != len(set(evidence_ids)):
                fail("PPKS_DUPLICATE_CLAIM_SOURCE")
            if any(eid not in evidence for eid in evidence_ids):
                fail("PPKS_UNKNOWN_CLAIM_SOURCE")
            claims.append({
                "skill": skill,
                "source_keys": sorted(evidence[eid]["source_key"] for eid in evidence_ids),
            })
        # Select only evidence references actually attached to these 2 claims.
        selected = {key for claim in claims for key in claim["source_keys"]}
        sources = {v["source_key"]: v for v in evidence.values()
                   if v["source_key"] in selected}
        result.append({
            "key": ident, "scope": record["scope"], "claims": claims,
            "sources": sources,
        })
    if len(result) != 7 or sum(len(r["claims"]) for r in result) != 14:
        fail("PPKS_SAMPLE_CHANGED")
    return result


def graph_plan(records: list[dict]) -> dict:
    # Fresh numeric IDs prevent collision with prior LAB smoke attempts.
    base = (secrets.randbelow(1 << 40) + (1 << 42)) * 10000
    skills = sorted({c["skill"] for r in records for c in r["claims"]})
    source_keys = sorted({key for r in records for key in r["sources"]})
    if not set(REQUIRED_SKILLS).issubset(skills):
        fail("PPKS_SHARED_SKILLS_MISSING")
    record_ids = {r["key"]: base + 100 + i for i, r in enumerate(records)}
    skill_ids = {skill: base + 500 + i for i, skill in enumerate(skills)}
    source_ids = {key: base + 1000 + i for i, key in enumerate(source_keys)}
    vertices = {}
    hydra_writes = []
    neo_edges = []
    claim_ids = {}
    claim_counter = 0
    for record in records:
        rid = record_ids[record["key"]]
        vertices[rid] = ("Record", {
            "record_key": record["key"], "scope": record["scope"],
        })
        for key, source in record["sources"].items():
            vertices[source_ids[key]] = ("Source", source)
        for claim in record["claims"]:
            cid = base + 2000 + claim_counter
            claim_counter += 1
            claim_ids[(record["key"], claim["skill"])] = cid
            vertices[cid] = ("Claim", {
                "record_key": record["key"], "scope": record["scope"],
                "technology": claim["skill"], "predicate": "USES_TECHNOLOGY",
            })
            vertices[skill_ids[claim["skill"]]] = ("Skill", {
                "name": claim["skill"],
                "normalized_name": claim["skill"].casefold(),
            })
            edges = [
                (rid, cid, "HAS_CLAIM"),
                (cid, skill_ids[claim["skill"]], "USES_TECHNOLOGY"),
            ]
            edges += [(cid, source_ids[key], "SUPPORTED_BY")
                      for key in claim["source_keys"]]
            for left, right, relation in edges:
                ll, lp = vertices[left]
                rl, rp = vertices[right]
                hydra_writes.append(
                    f"MERGE {NODE('a', ll, left, lp)}"
                    f"-[:{relation}]->{NODE('b', rl, right, rp)}"
                )
                neo_edges.append(
                    f"MATCH (a:{ll} {{id: {left}}}), "
                    f"(b:{rl} {{id: {right}}}) "
                    f"MERGE (a)-[:{relation}]->(b)"
                )
    expected_edges = 28 + sum(
        len(c["source_keys"]) for r in records for c in r["claims"]
    )
    if len(hydra_writes) != expected_edges:
        fail("GRAPH_EDGE_COUNT_MISMATCH")
    if len(vertices) != 7 + len(skills) + len(source_keys) + 14:
        fail("GRAPH_VERTEX_COUNT_MISMATCH")
    neo_vertices = [
        "MERGE " + NODE("n", label, ident, props)
        for ident, (label, props) in sorted(vertices.items())
    ]
    return {
        "records": records,
        "skill_ids": skill_ids,
        "source_ids": source_ids,
        "neo_vertices": neo_vertices,
        "neo_edges": neo_edges,
        "hydra_writes": hydra_writes,
        "counts": {
            "records": 7, "skills": len(skills),
            "claims": 14, "sources": len(source_keys),
            "vertices": len(vertices), "edges": expected_edges,
        },
    }


def query_cases(plan: dict) -> list[dict]:
    records = plan["records"]
    cases = []
    # Equivalent of bounded, direct requirement lookup. Normalize at ingestion,
    # use query parameters rather than interpolating recruiter-facing text.
    for skill in ("Java", "Flutter", "TypeScript", "Node.js", "Go"):
        expected = []
        for record in records:
            for claim in record["claims"]:
                if claim["skill"].casefold() != skill.casefold():
                    continue
                for source_key in claim["source_keys"]:
                    source = record["sources"][source_key]
                    expected.append((
                        record["key"], record["scope"], source_key,
                        source["verification"], source["origin"],
                    ))
        cases.append({
            "name": "find_evidence", "key": skill,
            "query": (
                "MATCH (s:Skill)<-[:USES_TECHNOLOGY]-(c:Claim)"
                "-[:SUPPORTED_BY]->(src:Source) "
                "WHERE s.normalized_name = $skill "
                "RETURN c.record_key AS record, c.scope AS scope, "
                "src.source_key AS source, src.verification AS verification, "
                "src.origin AS origin ORDER BY record, source"
            ),
            "params": {"skill": skill.casefold()},
            "columns": ["record", "scope", "source", "verification", "origin"],
            "rows": sorted(expected),
        })
    # Bounded candidate retrieval is done before fetching the attached
    # evidence: avoids losing source rows when a row limit is imposed.
    for skill in ("Java", "Flutter", "TypeScript"):
        claims = sorted({
            (record["key"], record["scope"])
            for record in records for claim in record["claims"]
            if claim["skill"] == skill
        })
        cases.append({
            "name": "bounded_claims", "key": skill,
            "query": (
                "MATCH (s:Skill)<-[:USES_TECHNOLOGY]-(c:Claim) "
                "WHERE s.normalized_name = $skill "
                "RETURN c.record_key AS record, c.scope AS scope "
                "ORDER BY record LIMIT $limit"
            ),
            "params": {"skill": skill.casefold(), "limit": 1},
            "columns": ["record", "scope"],
            "rows": claims[:1],
        })
    source_by_key = {key: source for record in records
                     for key, source in record["sources"].items()}
    for key in (
        "phasscode-platform--ports",
        "phasscode-platform--catalog",
        "experiencia-sig--catalog",
        "web-portfolio-v2--tests",
        "missing-source-key",
    ):
        expected = []
        if key in source_by_key:
            meta = source_by_key[key]
            expected.append((
                meta["source_key"], meta["verification"], meta["origin"]
            ))
        elif key != "missing-source-key":
            fail("PPKS_REQUIRED_SOURCE_MISSING")
        cases.append({
            "name": "get_source", "key": key,
            "query": (
                "MATCH (src:Source) WHERE src.source_key = $source "
                "RETURN src.source_key AS source, "
                "src.verification AS verification, src.origin AS origin LIMIT 1"
            ),
            "params": {"source": key},
            "columns": ["source", "verification", "origin"],
            "rows": expected,
        })
    return cases


def paired_query(opener, engine: str, query: str, params: dict,
                 token: str, neo_auth: str) -> dict:
    body = CORE["get_json"]
    if engine == "hydradb":
        return body(
            opener, CORE["HYDRA_URL"],
            {"cell_id": "cell-0", "query": query, "parameters": params,
             "timeout_ms": 25000},
            {
                "Authorization": "Bearer " + token,
                "X-Graph-Namespace": "lab",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
        )
    user, password = neo_auth.split("/", 1)
    credentials = base64.b64encode(
        f"{user}:{password}".encode("utf-8")
    ).decode("ascii")
    data = body(
        opener, CORE["NEO4J_URL"],
        {"statements": [{"statement": query, "parameters": params,
                         "resultDataContents": ["row"]}]},
        {
            "Authorization": "Basic " + credentials,
            "Content-Type": "application/json",
        },
    )
    if data.get("errors"):
        fail("NEO4J_QUERY_" + str(data["errors"][0].get("code", "UNKNOWN")))
    if len(data.get("results", [])) != 1:
        fail("NEO4J_RESULT_ENVELOPE")
    return data["results"][0]


def verify(engine: str, result: dict, case: dict) -> None:
    if result.get("columns") != case["columns"]:
        fail("CONTRACT_COLUMN_MISMATCH")
    got = READ_ROWS(engine, result)
    expected = tuple(tuple(x) for x in case["rows"])
    if sorted(got) != sorted(expected):
        # The body (and names) stay private; only cardinality is printed.
        fail(f"CONTRACT_ROW_MISMATCH_GOT_{len(got)}_EXPECTED_{len(expected)}")


def run() -> None:
    arg = argparse.ArgumentParser(description=__doc__)
    arg.add_argument("--live", action="store_true",
                     help="Write only the 7-record PPKS fixture to both LAB databases")
    args = arg.parse_args()
    env = CORE["check_lab"]()
    if env.get("ORBE_GRAPHRAG_MODE") != "off":
        fail("ORBE_LAB_GRAPH_MUST_BE_OFF")
    sample = data_fixture()
    plan = graph_plan(sample)
    cases = query_cases(plan)
    print("PPKS_CONTRACT_COUNTS", json.dumps(plan["counts"], sort_keys=True))
    print("PPKS_CONTRACT_CASES", len(cases))
    print("PPKS_CONTRACT_EVIDENCE_EDGE_COUNT",
          plan["counts"]["edges"] - 28)
    if not args.live:
        print("PPKS_CONTRACT_DRY_RUN_OK_NO_WRITES")
        return

    from urllib.request import ProxyHandler, build_opener
    auth = env.get("NEO4J_LAB_AUTH", "")
    if not re.fullmatch(r"neo4j/[A-Za-z0-9_-]{32,}", auth):
        fail("NEO4J_LAB_AUTH_INVALID")
    token = (LAB / "secrets" / "hydradb_auth_token").read_text(
        encoding="utf-8"
    ).strip()
    if len(token) < 32:
        fail("HYDRADB_LAB_TOKEN_INVALID")
    UPSTREAM["assert_comparator_healthy"]()
    opener = build_opener(ProxyHandler({}))
    with opener.open(CORE["HYDRA_READY"], timeout=8) as response:
        if response.status != 200:
            fail("HYDRADB_NOT_READY")
    if CORE["value_neo4j"](
        CORE["neo4j"](opener, auth, "RETURN 1 AS id")
    ) != 1:
        fail("NEO4J_QUERY_NOT_READY")
    print("PPKS_CONTRACT_BOTH_ENGINES_READY")

    for n, cypher in enumerate(plan["neo_vertices"], 1):
        try:
            CORE["neo4j"](opener, auth, cypher)
        except Exception as error:
            fail(f"NEO4J_VERTEX_WRITE_{n}_FAILED_{type(error).__name__}")
    print("PPKS_CONTRACT_NEO4J_VERTICES", len(plan["neo_vertices"]))

    calls = {
        "hydradb": lambda cypher: CORE["hydradb"](opener, token, cypher),
        "neo4j": lambda cypher: CORE["neo4j"](opener, auth, cypher),
    }
    for i, (h, n) in enumerate(zip(plan["hydra_writes"],
                                   plan["neo_edges"], strict=True), 1):
        for engine, query in (("hydradb", h), ("neo4j", n)):
            try:
                calls[engine](query)
            except Exception as error:
                fail(f"{engine.upper()}_EDGE_{i}_FAILED_{type(error).__name__}")
    print("PPKS_CONTRACT_WRITES_PER_ENGINE", len(plan["hydra_writes"]))

    samples = {engine: defaultdict(list) for engine in calls}
    for case in cases:
        for repetition in range(REPEATS + 1):
            engines = ("hydradb", "neo4j") if repetition % 2 == 0 else (
                "neo4j", "hydradb")
            for engine in engines:
                try:
                    started = time.perf_counter()
                    data = paired_query(
                        opener, engine, case["query"], case["params"],
                        token, auth
                    )
                    elapsed = (time.perf_counter() - started) * 1000
                    verify(engine, data, case)
                except Exception as error:
                    print(
                        "PPKS_CONTRACT_CASE_FAILED", case["name"], case["key"],
                        engine, type(error).__name__,
                        (str(error)[:100] if isinstance(error, ValueError)
                         else "HTTP_" + str(getattr(error, "code", "-"))),
                        file=sys.stderr
                    )
                    raise ValueError("CONTRACT_PARITY_FAILURE") from None
                if repetition > 0:
                    samples[engine][case["name"]].append(elapsed)

    print("PPKS_CONTRACT_PARITY_CASES", len(cases), "PASS")
    report = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "scenario": "ppks_claim_specific_source_contract",
        "counts": plan["counts"],
        "cases": [{"name": c["name"], "key": c["key"],
                   "expected_rows": len(c["rows"])} for c in cases],
        "repetitions": REPEATS,
        "latency_by_case": {
            engine: {key: METRICS(values) for key, values in types.items()}
            for engine, types in samples.items()
        },
        "parity": "PASS: parameterized claim-source retrieval in both LAB engines",
        "limitations": (
            "Only two PPKS technologies per public record; no private academic "
            "evidence, no raw documentation, no real OrbeEvidence payload, "
            "no real GraphRAG adapter or answer generation. "
            "HTTP protocols and resource caps are not equivalent."
        ),
    }
    directory = LAB / "benchmarks"
    directory.mkdir(exist_ok=True)
    output = directory / datetime.now(timezone.utc).strftime(
        "ppks-contract-%Y%m%dT%H%M%SZ.json"
    )
    with output.open("x", encoding="utf-8") as stream:
        json.dump(report, stream, indent=2, ensure_ascii=False)
        stream.write("\n")
    output.chmod(0o600)
    print("PPKS_CONTRACT_REPORT", output)
    print("PPKS_CONTRACT_PARITY_PASS")


if __name__ == "__main__":
    try:
        run()
    except Exception as err:
        print("PPKS_CONTRACT_FAILED", type(err).__name__,
              str(err)[:120] if isinstance(err, ValueError)
              else "UNEXPECTED_ERROR", file=sys.stderr)
        sys.exit(1)
