#!/usr/bin/env python3
"""Best-effort, non-privileged F4.3 resource telemetry for *only* GH-owned containers.

Executed concurrently with the existing disposable MinIO adapter benchmark.
Docker's one-shot stats are sampling observations, not total CPU-seconds or
accurate S3 request accounting. Never collect environments, logs or credentials.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from time import monotonic, sleep

ALLOWED_SERVICES = ("gate11-hydra", "gate11-minio", "f43-neo")
CPU_RE = re.compile(r"^\d+(?:\.\d+)?%$")
MEM_RE = re.compile(r"^(\d+(?:\.\d+)?)(B|KiB|MiB|GiB|kB|MB|GB)$")
MULT = {"B":1,"KiB":1024,"MiB":1024**2,"GiB":1024**3,
        "kB":1000,"MB":1000**2,"GB":1000**3}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def scope() -> tuple[Path, list[str]]:
    require(os.environ.get("GATE10_ISOLATION_MODE") == "github_hosted_ephemeral"
        and os.environ.get("GATE11_ISOLATION_MODE") == "github_hosted_ephemeral"
        and os.environ.get("GITHUB_REPOSITORY") == "SladeSouzaSantos/phasscode-platform"
        and os.environ.get("GITHUB_REF") == "refs/heads/experiment/hydradb"
        and re.fullmatch(r"\d+", os.environ.get("GITHUB_RUN_ID", "")) is not None,
        "F43_TELEMETRY_GITHUB_ONLY")
    root = Path(os.environ.get("RUNNER_TEMP", "")).resolve()
    require(root.is_dir() and root.is_absolute(), "F43_TELEMETRY_RUNNER_TEMP")
    rid = os.environ["GITHUB_RUN_ID"]
    return (root / f"f43-resource-samples-{rid}.jsonl",
            [f"{name}-{rid}" for name in ALLOWED_SERVICES])


def mem_mib(s: str) -> float | None:
    match = MEM_RE.fullmatch(s.strip())
    if not match:
        return None
    return round(float(match.group(1))*MULT[match.group(2)]/1024**2,3)


def one_sample(containers: list[str]) -> dict:
    # No shell, no logging of Docker environment, fixed per-run containers.
    proc = subprocess.run([
        "docker", "stats", "--no-stream", "--no-trunc",
        "--format", "{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}",
        *containers,
    ], capture_output=True, text=True, timeout=15, check=False)
    if proc.returncode != 0:
        return {"status":"stats_unavailable"}
    result: dict[str, dict] = {}
    for line in proc.stdout.splitlines():
        tokens = line.split("|")
        if len(tokens) != 3 or tokens[0] not in containers:
            continue
        cpu = tokens[1].strip()
        memory = tokens[2].split("/",1)[0].strip()
        if not CPU_RE.fullmatch(cpu):
            continue
        result[tokens[0]] = {
            "cpuPercent": float(cpu[:-1]),
            "workingSetMiB": mem_mib(memory),
        }
    return {"status":"sampled" if len(result)==len(containers) else "partial",
            "containers":result}


def collect() -> None:
    path, containers = scope()
    require(not path.exists() and not path.is_symlink(), "F43_SAMPLE_ALREADY_EXISTS")
    end = monotonic() + 480
    with path.open("x",encoding="utf8") as outfile:
        while monotonic() < end:
            sample = one_sample(containers)
            outfile.write(json.dumps(sample,separators=(",",":"))+"\n")
            outfile.flush()
            sleep(1.5)


def summary() -> None:
    path, containers = scope()
    require(path.is_file() and not path.is_symlink(), "F43_SAMPLE_MISSING")
    per = {name:[] for name in containers}
    bad = 0
    for raw in path.read_text(encoding="utf8").splitlines():
        try:
            row = json.loads(raw)
            if row.get("status") != "sampled":
                bad += 1
                continue
            for name in containers:
                val = row["containers"][name]
                if val["workingSetMiB"] is not None:
                    per[name].append(val)
        except (KeyError, ValueError, TypeError):
            bad += 1
    def describe(rows: list[dict]) -> dict:
        return {
            "samples":len(rows),
            "cpuPercentMax":max((x["cpuPercent"] for x in rows),default=None),
            "cpuPercentAverageOfSamples":round(sum(x["cpuPercent"] for x in rows)/len(rows),3)
                if rows else None,
            "workingSetMiBMax":max((x["workingSetMiB"] for x in rows),default=None),
            "workingSetMiBAverageOfSamples":round(
                sum(x["workingSetMiB"] for x in rows)/len(rows),3) if rows else None,
        }
    report = {
        "schema":"hydradb-f43-container-sampler-v1",
        "measurement":"docker_stats_one_shot_approximate_during_benchmark",
        "limitations": [
            "not_cpu_seconds",
            "not_cpu_time_per_query",
            "docker_memory_is_not_storage_iops",
            "minio_requests_and_storage_cost_not_measured",
            "benchmark_and_monitor_share_runner_resources",
        ],
        "containers":{
            name.split("-"+os.environ["GITHUB_RUN_ID"])[0]:describe(rows)
            for name, rows in per.items()
        },
        "partialOrFailedSamples":bad,
    }
    outfile=path.with_suffix(".summary.json")
    require(not outfile.exists() and not outfile.is_symlink(),
        "F43_SUMMARY_ALREADY_EXISTS")
    outfile.write_text(json.dumps(report,indent=2)+"\n",encoding="utf8")
    outfile.chmod(0o600)
    print("F43_RESOURCE_TELEMETRY_JSON",json.dumps(report,separators=(",",":")))
    print("F43_RESOURCE_TELEMETRY_REPORTED")


if __name__=="__main__":
    try:
        parser=argparse.ArgumentParser()
        parser.add_argument("--mode",choices=["collect","summarize"],required=True)
        args=parser.parse_args()
        if args.mode=="collect":
            collect()
        else:
            summary()
    except (RuntimeError, OSError, subprocess.SubprocessError, ValueError):
        print("F43_RESOURCE_TELEMETRY_UNAVAILABLE",file=sys.stderr)
        sys.exit(1)
