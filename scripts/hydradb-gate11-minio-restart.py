#!/usr/bin/env python3
"""Gate 11: disposable MinIO object-store durability proof, no MiniMac.

Checks a synthetic record/skill and claim/source relation before and after
replacing the HydraDB node (empty local cache), and after replacing MinIO.
No private PPKS records, shared volumes, operational credentials or ports.
"""
from __future__ import annotations

import argparse
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import ProxyHandler, Request, build_opener


URL = "http://127.0.0.1:18443/v1/graphs/lab/query"
READY = "http://127.0.0.1:19090/readyz"
QUERIES = (
    (
        "skill_edge",
        "MATCH (r:Gate11Record {id: 940101})-[:GATE11_USES]->(s) "
        "RETURN s.id AS id",
        [[940102]],
    ),
    (
        "source_provenance",
        "MATCH (c:Gate11Claim {id: 940103})-[:SUPPORTED_BY]->(src) "
        "RETURN src.verification AS verification",
        [["code_reviewed"]],
    ),
)
WRITES = (
    "CREATE (r:Gate11Record {id: 940101})-[:GATE11_USES]->"
    "(s:Gate11Skill {id: 940102, skill: 'Java'})",
    "CREATE (c:Gate11Claim {id: 940103})-[:SUPPORTED_BY]->"
    "(src:Gate11Source {id: 940104, verification: 'code_reviewed'})",
)


def check(ok: bool, code: str) -> None:
    if not ok:
        raise RuntimeError(code)


def get_paths() -> tuple[Path, str]:
    check(
        os.getenv("GATE11_ISOLATION_MODE") == "github_hosted_ephemeral"
        and os.getenv("GITHUB_REPOSITORY") == "SladeSouzaSantos/phasscode-platform"
        and os.getenv("GITHUB_REF") == "refs/heads/experiment/hydradb"
        and re.fullmatch(r"[0-9]+", os.getenv("GITHUB_RUN_ID", "")) is not None,
        "GATE11_RUNNER_RESTRICTION",
    )
    root = Path(os.getenv("RUNNER_TEMP", "")).resolve()
    check(root.is_absolute() and root.is_dir(), "GATE11_RUNNER_TEMP")
    token = Path(os.getenv("GATE11_TOKEN_FILE", ""))
    signature = Path(os.getenv("GATE11_SIGNATURE_FILE", ""))
    for path in (token, signature):
        check(path.is_absolute() and path.resolve().is_relative_to(root)
              and not path.is_symlink(), "GATE11_FILE_OUTSIDE_RUNNER")
    check(token.is_file(), "GATE11_TOKEN_MISSING")
    secret = token.read_text(encoding="utf8").strip()
    check(len(secret) >= 32, "GATE11_BAD_TOKEN")
    return signature, secret


def read_only_headers(token: str) -> dict[str, str]:
    return {
        "Authorization": "Bearer " + token,
        "X-Graph-Namespace": "lab",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def post(opener, token: str, cypher: str) -> dict:
    request = Request(
        URL, method="POST", headers=read_only_headers(token),
        data=json.dumps({
            "cell_id": "cell-0", "query": cypher,
            "timeout_ms": 15000, "consistency": "strong",
        }).encode("utf8"),
    )
    try:
        with opener.open(request, timeout=20) as response:
            check(response.status == 200, "GATE11_QUERY_HTTP_BAD_STATUS")
            obj = json.loads(response.read(200000).decode("utf8"))
    except HTTPError as error:
        raise RuntimeError("GATE11_QUERY_HTTP_" + str(error.code)) from None
    except (URLError, TimeoutError, OSError, ValueError, UnicodeError):
        raise RuntimeError("GATE11_QUERY_UNAVAILABLE") from None
    check(isinstance(obj, dict) and not obj.get("error") and not obj.get("errors"),
          "GATE11_QUERY_REPORTED_ERROR")
    return obj


def normalize(value):
    if isinstance(value, dict) and "type" in value and "value" in value:
        return normalize(value["value"])
    if isinstance(value, list):
        return [normalize(x) for x in value]
    return value


def assert_retrievable(opener, token: str) -> str:
    values = []
    for name, query, expected in QUERIES:
        obj = post(opener, token, query)
        check(isinstance(obj.get("columns"), list)
              and isinstance(obj.get("rows"), list),
              "GATE11_RESULT_SHAPE")
        got = normalize(obj["rows"])
        check(got == expected, "GATE11_RESULT_MISMATCH_" + name)
        values.append({"name": name, "rows": got})
    return sha256(json.dumps(values, sort_keys=True).encode("utf8")).hexdigest()


def wait_node(opener) -> None:
    for _ in range(110):
        try:
            with opener.open(READY, timeout=2) as response:
                if response.status == 200:
                    return
        except (HTTPError, URLError, TimeoutError, OSError):
            pass
        time.sleep(1)
    raise RuntimeError("GATE11_GRAPH_NODE_NOT_READY")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=("seed", "verify"), required=True)
    args = parser.parse_args()
    signature_file, token = get_paths()
    opener = build_opener(ProxyHandler({}))
    wait_node(opener)

    if args.mode == "seed":
        check(not signature_file.exists(), "GATE11_SIGNATURE_ALREADY_EXISTS")
        for query in WRITES:
            post(opener, token, query)
        signature = assert_retrievable(opener, token)
        signature_file.write_text(signature + "\n", encoding="utf8")
        signature_file.chmod(0o600)
        print("GATE11_MINIO_SYNTHETIC_WRITE_READ_PASS")
        print("GATE11_EXPECTED_DIGEST", signature)
    else:
        check(signature_file.is_file() and not signature_file.is_symlink(),
              "GATE11_SIGNATURE_NOT_FOUND")
        expected = signature_file.read_text(encoding="utf8").strip()
        check(re.fullmatch(r"[0-9a-f]{64}", expected) is not None,
              "GATE11_SIGNATURE_INVALID")
        actual = assert_retrievable(opener, token)
        check(actual == expected, "GATE11_OBJECT_STORE_PERSISTENCE_MISMATCH")
        print("GATE11_RESTART_READ_PARITY_PASS")
        print("GATE11_VERIFIED_DIGEST", actual)


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, KeyError):
        print("GATE11_MINIO_PROBE_FAILED_CHECK_DISPOSABLE_RUN",
              file=sys.stderr)
        sys.exit(1)
