#!/usr/bin/env python3
"""Git-source parity gate only; NEVER checks deployed application behavior.

Fetch only public Git refs in an ephemeral GitHub-hosted runner, then compare
the same approved eight paths to a pinned baseline. No network calls here,
no DB clients, no secrets, no application execution, no deployment changes.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import re
import subprocess
import sys


MANIFEST_PATH = "knowledge/evaluations/hydradb-orbe-source-baseline-v1.json"
REFS = ("origin/main", "origin/dev", "HEAD")
EXPECTED_REPO = "SladeSouzaSantos/phasscode-platform"
EXPECTED_REF = "refs/heads/experiment/hydradb"


def gate(condition: bool, code: str) -> None:
    if not condition:
        raise RuntimeError(code)


def git(*args: str) -> str:
    return subprocess.check_output(
        ("git", *args), text=True, stderr=subprocess.DEVNULL, timeout=15
    ).strip()


def run() -> None:
    gate(os.getenv("GITHUB_REPOSITORY") == EXPECTED_REPO, "BASELINE_WRONG_REPO")
    gate(os.getenv("GITHUB_REF") == EXPECTED_REF, "BASELINE_WRONG_REF")
    gate(os.getenv("RUNNER_TEMP", "").startswith("/"), "BASELINE_RUNNER_REQUIRED")
    gate(os.getenv("GITHUB_RUN_ID", "").isdigit(), "BASELINE_RUN_ID_REQUIRED")
    gate(git("branch", "--show-current") in ("experiment/hydradb", ""),
         "BASELINE_WRONG_CHECKOUT")
    data = json.loads(Path(MANIFEST_PATH).read_text(encoding="utf-8"))
    gate(data.get("schemaVersion") == "hydradb-orbe-source-baseline-v1"
         and data.get("repository") == EXPECTED_REPO, "BASELINE_BAD_MANIFEST")
    files = data.get("files")
    gate(isinstance(files, dict) and len(files) == 8, "BASELINE_FILE_COUNT")
    gate(set(data.get("observedBranchCommits", {}))
         == {"main", "dev", "experiment/hydradb"}, "BASELINE_REFS_MISSING")

    comparisons = []
    for path, expected_blob in sorted(files.items()):
        gate(
            isinstance(path, str)
            and re.fullmatch(r"[A-Za-z0-9._/-]+", path) is not None
            and ".." not in path.split("/")
            and isinstance(expected_blob, str)
            and re.fullmatch("[a-f0-9]{40}", expected_blob) is not None,
            "BASELINE_INVALID_PATH_OR_HASH",
        )
        observed = {ref: git("rev-parse", f"{ref}:{path}") for ref in REFS}
        gate(len(set(observed.values())) == 1, "BASELINE_BRANCH_BLOB_DRIFT")
        gate(all(blob == expected_blob for blob in observed.values()),
             "BASELINE_PINNED_BLOB_DRIFT")
        comparisons.append({"path": path, "gitBlob": expected_blob})
    reported = {ref: git("rev-parse", ref) for ref in REFS}
    print("HYDRADB_ORBE_SOURCE_BASELINE_JSON", json.dumps({
        "schemaVersion": data["schemaVersion"],
        "scope": data["evidenceScope"],
        "branches": reported,
        "identicalFileCount": len(comparisons),
        "files": comparisons,
        "runtimeParity": "not_tested",
        "dataParity": "not_tested",
        "adapterParity": "not_tested",
        "migrationApproved": False,
    }, sort_keys=True, separators=(",", ":")))
    print("HYDRADB_ORBE_SOURCE_BASELINE_8_OF_8_PASS")
    print("HYDRADB_ORBE_RUNTIME_PARITY_NOT_ESTABLISHED")


if __name__ == "__main__":
    try:
        run()
    except (RuntimeError, OSError, ValueError, KeyError,
            subprocess.CalledProcessError, subprocess.TimeoutExpired):
        # Do not leak local paths and manifests to log on error.
        print("HYDRADB_ORBE_BASELINE_FAILED_CHECK_MANIFEST_OR_GIT_REFS",
              file=sys.stderr)
        sys.exit(1)
