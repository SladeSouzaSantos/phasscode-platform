#!/usr/bin/env python3
"""F3.7/#43 Laya multilingual isolated typed-decision benchmark.

Training, API integrations, user conversations, databases and service secrets are
out of scope. Only synthetic, draft-labeled clauses are evaluated.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import resource
import statistics
import sys
import time

ROLES = ("mandatory", "desirable", "alternative", "context", "negated", "uncertain")
RELATIONS = (
    "candidate_requirement", "company_stack", "future_stack",
    "project_claim", "unrelated",
)

QUESTIONS = {
    "role": {
        "type": "choice",
        "instructions": "Qual é a função da expressão destacada na frase completa de recrutamento?",
        "criteria": {
            "mandatory": "Habilidade ou experiência exigida obrigatoriamente pela vaga",
            "desirable": "Habilidade desejável ou diferencial, não obrigatória",
            "alternative": "Alternativas permitidas, como Java OU Kotlin",
            "context": "Contexto explicativo, sem exigir uma habilidade ao candidato",
            "negated": "A frase diz explicitamente que essa habilidade não é exigida",
            "uncertain": "O texto não permite decidir a função com segurança",
        },
    },
    "relation": {
        "type": "choice",
        "instructions": "A expressão descreve o que é pedido ao candidato, o que já existe na empresa, o futuro, a atribuição de projeto, ou outro contexto?",
        "criteria": {
            "candidate_requirement": "Requisito para o candidato desta vaga",
            "company_stack": "Tecnologia utilizada pela organização, não necessariamente exigida",
            "future_stack": "Tecnologia planejada para o futuro, não exigida agora",
            "project_claim": "Afirmação ou pergunta sobre associação entre projeto e tecnologia",
            "unrelated": "Outro contexto não classificável como requisito da vaga",
        },
    },
}

FILES = frozenset({
    "config.json", "encoder/config.json", "rl_agent_config.json",
    "model.safetensors", "tokenizer/tokenizer.json",
    "tokenizer/tokenizer_config.json",
})


def load_manifest(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("schemaVersion") != "semantic-laya-manifest-v0":
        raise ValueError("LAYA_BAD_MANIFEST_VERSION")
    if data.get("repository") != "convaiinnovations/laya-multilingual":
        raise ValueError("LAYA_UNEXPECTED_REPOSITORY")
    if not re.fullmatch(r"[0-9a-f]{40}", data.get("revision", "")):
        raise ValueError("LAYA_UNPINNED_REVISION")
    if data.get("pythonPackage") != "laya==0.4.22":
        raise ValueError("LAYA_UNPINNED_SDK")
    if set(data.get("allowedFiles", [])) != FILES:
        raise ValueError("LAYA_UNSAFE_FILE_ALLOWLIST")
    if set(data.get("policy", {}).get("requiredRoles", [])) != set(ROLES):
        raise ValueError("LAYA_ROLE_SCHEMA_MISMATCH")
    if set(data.get("policy", {}).get("requiredRelations", [])) != set(RELATIONS):
        raise ValueError("LAYA_RELATION_SCHEMA_MISMATCH")
    hashes = data.get("verifiedLfsSha256", [])
    if {item.get("path") for item in hashes} != {"model.safetensors", "tokenizer/tokenizer.json"}:
        raise ValueError("LAYA_INCOMPLETE_WEIGHT_HASHES")
    for entry in hashes:
        if not re.fullmatch(r"[0-9a-f]{64}", entry.get("sha256", "")):
            raise ValueError("LAYA_INVALID_WEIGHT_HASH")
        if not isinstance(entry.get("sizeBytes"), int) or entry["sizeBytes"] <= 0:
            raise ValueError("LAYA_INVALID_WEIGHT_SIZE")
    return data


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as reader:
        for block in iter(lambda: reader.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def verify_checkpoint(manifest: dict, root: Path) -> dict:
    for name in manifest["allowedFiles"]:
        file_path = root / name
        if not file_path.is_file() or file_path.is_symlink():
            raise ValueError("LAYA_MISSING_OR_SYMLINK_MODEL_FILE")
    checksums = {}
    for entry in manifest["verifiedLfsSha256"]:
        target = root / entry["path"]
        if target.stat().st_size != entry["sizeBytes"] or sha256_file(target) != entry["sha256"]:
            raise ValueError("LAYA_WEIGHT_SHA256_MISMATCH")
        checksums[entry["path"]] = entry["sha256"]
    return checksums


def prepare_checkpoint(manifest: dict, root: Path) -> dict:
    # Explicitly network-enabled. Never run this inside the production API.
    from huggingface_hub import snapshot_download
    root.mkdir(parents=True, exist_ok=True)
    snapshot_download(
        repo_id=manifest["repository"],
        revision=manifest["revision"],
        allow_patterns=manifest["allowedFiles"],
        local_dir=str(root),
        max_workers=2,
    )
    return verify_checkpoint(manifest, root)


def load_fixture(path: Path, limit: int) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("schemaVersion") != "semantic-hybrid-corpus-v0":
        raise ValueError("LAYA_INVALID_FIXTURE_VERSION")
    if data.get("reviewStatus") != "draft_not_human_approved":
        raise ValueError("LAYA_FIXTURE_NOT_MARKED_DRAFT")
    if data.get("provenance") != "synthetic_examples_only":
        raise ValueError("LAYA_NON_SYNTHETIC_FIXTURE_FORBIDDEN")
    cases = data.get("cases")
    if not isinstance(cases, list) or not 1 <= len(cases) <= 64:
        raise ValueError("LAYA_BAD_FIXTURE_SIZE")
    if not 1 <= limit <= 64:
        raise ValueError("LAYA_INVALID_SAMPLE_LIMIT")
    all_cases = []
    for case in cases:
        source = case["text"]
        if not isinstance(source, str) or not 1 <= len(source) <= 900:
            raise ValueError("LAYA_UNSAFE_FIXTURE_TEXT")
        spans = sorted(case["annotations"], key=lambda item: item["start"])
        last_end = -1
        safe_spans = []
        for index, span in enumerate(spans):
            start, end = span["start"], span["end"]
            if not isinstance(start, int) or not isinstance(end, int):
                raise ValueError("LAYA_INVALID_SPAN_OFFSETS")
            if start < last_end or end > len(source) or source[start:end] != span["text"]:
                raise ValueError("LAYA_UNGROUNDED_OR_OVERLAPPING_SPAN")
            last_end = end
            if span["role"] not in ROLES or span["relation"] not in RELATIONS:
                raise ValueError("LAYA_UNKNOWN_GOLD_LABEL")
            safe_spans.append({
                "id": f"{case['id']}:{index}",
                "text": source,
                "span": span["text"],
                "role": span["role"],
                "relation": span["relation"],
            })
        all_cases.append(safe_spans)
    # Round-robin: select one span per distinct case before repeating a case.
    # This avoids overrepresenting early examples when CPU budget limits N.
    result = []
    for i in range(max(map(len, all_cases))):
        for case_spans in all_cases:
            if i < len(case_spans):
                result.append(case_spans[i])
                if len(result) >= limit:
                    return result
    return result

def validate_choice(answer: dict, choices: tuple[str, ...]) -> tuple[str, float | None]:
    if not isinstance(answer, dict) or answer.get("choice") not in choices:
        raise ValueError("LAYA_UNKNOWN_CHOICE")
    confidence = answer.get("answer_confidence")
    if confidence is None:
        return answer["choice"], None
    if not isinstance(confidence, (float, int)) or not math.isfinite(confidence) or not 0 <= confidence <= 1:
        raise ValueError("LAYA_INVALID_UNCALIBRATED_CONFIDENCE")
    return answer["choice"], float(confidence)


def summarize(examples: list[dict], outputs: list[dict], timings_ms: list[float]) -> dict:
    if len(examples) != len(outputs) or len(examples) != len(timings_ms):
        raise ValueError("LAYA_MISSING_RESULTS")
    counts = {"role": 0, "relation": 0}
    confidence_samples = []
    by_role = {}
    abstentions_085 = 0
    high_conf_errors = 0
    case_summaries = []
    for example, output in zip(examples, outputs):
        role, role_conf = validate_choice(output["role"], ROLES)
        relation, relation_conf = validate_choice(output["relation"], RELATIONS)
        role_ok = role == example["role"]
        relation_ok = relation == example["relation"]
        counts["role"] += int(role_ok)
        counts["relation"] += int(relation_ok)
        by_role.setdefault(example["role"], {"samples": 0, "correct": 0})
        by_role[example["role"]]["samples"] += 1
        by_role[example["role"]]["correct"] += int(role_ok)
        confidences = [val for val in (role_conf, relation_conf) if val is not None]
        confidence_samples.extend(confidences)
        # Diagnostic gate only. Even high confidence MUST NOT enable public answers.
        low_confidence = len(confidences) != 2 or min(confidences) < 0.85
        abstentions_085 += int(low_confidence)
        high_conf_errors += int(not low_confidence and not (role_ok and relation_ok))
        case_summaries.append({
            "id": example["id"],
            "expectedRole": example["role"],
            "predictedRole": role,
            "expectedRelation": example["relation"],
            "predictedRelation": relation,
            "diagnosticAbstention": low_confidence,
        })
    n = len(examples)
    return {
        "examples": n,
        "roleAccuracy": round(counts["role"] / n, 4) if n else None,
        "relationAccuracy": round(counts["relation"] / n, 4) if n else None,
        "roleByClass": by_role,
        "diagnosticConfidenceThreshold": 0.85,
        "diagnosticAbstentions": abstentions_085,
        "incorrectDespiteHighConfidence": high_conf_errors,
        "meanUncalibratedAnswerConfidence": round(statistics.mean(confidence_samples), 4) if confidence_samples else None,
        "latencyMs": {
            "mean": round(statistics.mean(timings_ms), 2) if timings_ms else None,
            "p95": round(sorted(timings_ms)[min(n - 1, math.ceil(n * 0.95) - 1)], 2) if n else None,
        },
        "cases": case_summaries,
    }


def benchmark(manifest: dict, model_dir: Path, fixture: Path, max_spans: int) -> dict:
    weights = verify_checkpoint(manifest, model_dir)
    examples = load_fixture(fixture, max_spans)
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["USE_TF"] = "0"
    os.environ["TOKENIZERS_PARALLELISM"] = "false"
    import torch
    import laya
    torch.set_num_threads(2)
    start = time.perf_counter()
    agent = laya.load(str(model_dir), device="cpu")
    load_ms = round((time.perf_counter() - start) * 1000, 2)
    results = []
    timings = []
    for ex in examples:
        start = time.perf_counter()
        result = agent.predict({"frase_completa": ex["text"], "expressao_destacada": ex["span"]}, QUESTIONS)
        timings.append((time.perf_counter() - start) * 1000)
        if not isinstance(result, dict) or not isinstance(result.get("answers"), dict):
            raise ValueError("LAYA_INVALID_ANSWER_ENVELOPE")
        results.append(result["answers"])
    metrics = summarize(examples, results, timings)
    return {
        "reportVersion": "laya-typed-decision-lab-v0",
        "mode": "offline_synthetic_typed_choice",
        "reviewStatus": "draft_not_human_approved",
        "modelRevision": manifest["revision"],
        "layaSdk": manifest["pythonPackage"],
        "weightsSha256": weights["model.safetensors"],
        "modelLoadMs": load_ms,
        "peakRssMiB": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 2),
        "externalLlmCalls": 0,
        "graphQueries": 0,
        "networkCallsDuringBenchmark": 0,
        "calibrationStatus": "UNCALIBRATED_NOT_APPROVED",
        "policy": "no_active_or_shadow_promotion",
        "metrics": metrics,
        "limitations": [
            "Synthetic draft annotations only; not validated on unseen recruiter vacancies",
            "Confidence numbers are NOT calibrated for candidate requirements",
            "Accuracy and diagnostic abstention threshold do not prove model safety",
            "The classifier does not parse arbitrary spans or verify professional evidence",
            "CPU timings in GitHub runner do not predict MiniMac performance",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["prepare", "verify", "benchmark", "dry-run"])
    parser.add_argument("--manifest", type=Path, default=Path("evaluation/semantic-laya-manifest-v0.json"))
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--fixture", type=Path, default=Path("evaluation/semantic-hybrid-corpus-v0.json"))
    parser.add_argument("--max-spans", type=int, default=16)
    args = parser.parse_args()
    manifest = load_manifest(args.manifest)
    if args.command == "dry-run":
        samples = load_fixture(args.fixture, args.max_spans)
        result = {"status": "LAYA_DRY_RUN_OK", "cases": len(samples), "questionsPerCase": 2, "modelLoaded": False}
    elif args.command == "prepare":
        result = {"status": "LAYA_PREPARE_SHA256_OK", "checksums": prepare_checkpoint(manifest, args.model_dir)}
    elif args.command == "verify":
        result = {"status": "LAYA_VERIFY_SHA256_OK", "checksums": verify_checkpoint(manifest, args.model_dir)}
    else:
        result = benchmark(manifest, args.model_dir, args.fixture, args.max_spans)
    print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as err:
        # Deliberately no tracebacks, model file paths, input text or credentials.
        print(f"LAYA_LAB_FAILED: {type(err).__name__}", file=sys.stderr)
        sys.exit(1)
