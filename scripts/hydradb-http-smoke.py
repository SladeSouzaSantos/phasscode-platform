#!/usr/bin/env python3
"""Small authenticated HydraDB write/read smoke for the isolated MiniMac lab.

No third-party dependencies, LLM calls, production credentials, or Orbe changes.
Creates only two synthetic graph nodes and one relationship in the LAB graph.
"""
from __future__ import annotations

import json
from pathlib import Path
import secrets
import subprocess
import sys
from urllib.error import HTTPError, URLError
from urllib.request import ProxyHandler, Request, build_opener

LAB = Path.home() / "hydradb-lab"
ROOT = LAB / "phasscode-platform"
TOKEN_FILE = LAB / "secrets" / "hydradb_auth_token"
BASE_URL = "http://127.0.0.1:18443"
ADMIN_READY = "http://127.0.0.1:19090/readyz"
QUERY_URL = BASE_URL + "/v1/graphs/lab/query"


def fail(message: str) -> None:
    raise RuntimeError(message)


def check_environment() -> None:
    if Path(__file__).resolve() != (ROOT / "scripts/hydradb-http-smoke.py").resolve():
        fail("Execute somente pelo checkout dedicado do HydraDB LAB.")
    branch = subprocess.check_output(
        ["git", "-C", str(ROOT), "branch", "--show-current"], text=True
    ).strip()
    if branch != "experiment/hydradb":
        fail("Branch incorreta: experimento deve rodar em experiment/hydradb.")


def query(opener, token: str, cypher: str, *, bookmark: str | None = None) -> dict:
    payload = {"cell_id": "cell-0", "query": cypher, "timeout_ms": 20000}
    if bookmark:
        payload["bookmark"] = bookmark
    request = Request(
        QUERY_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": "Bearer " + token,
            "X-Graph-Namespace": "lab",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    with opener.open(request, timeout=25) as response:
        if response.status != 200:
            fail(f"Query HTTP {response.status}")
        data = json.loads(response.read(500_000).decode("utf-8"))
    if not isinstance(data, dict):
        fail("Contrato HTTP inesperado: resposta não é um objeto.")
    return data


def main() -> None:
    check_environment()
    token = TOKEN_FILE.read_text(encoding="utf-8").strip()
    if len(token) < 32:
        fail("Token de laboratório ausente ou inválido.")
    opener = build_opener(ProxyHandler({}))
    with opener.open(ADMIN_READY, timeout=8) as response:
        if response.status != 200:
            fail(f"HydraDB /readyz HTTP {response.status}")
    print("HYDRADB_READY_HTTP_200")

    left = secrets.randbelow(2**45) + 10_000_000_000
    right = left + 1
    write = query(
        opener, token,
        f"CREATE (a {{id: {left}}})-[:FOLLOWS]->(b {{id: {right}}})",
    )
    print("HYDRADB_WRITE_HTTP_200")
    bookmark = write.get("bookmark")
    read = query(
        opener, token,
        f"MATCH (a {{id: {left}}})-[:FOLLOWS]->(b) RETURN b.id AS id",
        bookmark=bookmark if isinstance(bookmark, str) else None,
    )
    if read.get("columns") != ["id"] or len(read.get("rows", [])) != 1:
        fail("Consulta de leitura não retornou uma linha com a coluna id.")
    value = read["rows"][0][0]
    if not isinstance(value, dict) or value.get("type") not in (
        "integer", "signed_integer", "vertex_id"
    ) or value.get("value") != right:
        fail("Valor recuperado não corresponde ao nó gravado.")
    print("HYDRADB_READ_MATCH_OK")
    print("HYDRADB_SYNTHETIC_GRAPH_SMOKE_OK")


if __name__ == "__main__":
    try:
        main()
    except HTTPError as error:
        # Error body is never echoed; avoids exposing credentials or request data.
        print(f"HYDRADB_SMOKE_FAILED_HTTP_{error.code}", file=sys.stderr)
        sys.exit(1)
    except (URLError, OSError, ValueError, RuntimeError, subprocess.CalledProcessError) as error:
        # Paths and OS error messages may disclose local info, not authentication.
        print(f"HYDRADB_SMOKE_FAILED: {error}", file=sys.stderr)
        sys.exit(1)
