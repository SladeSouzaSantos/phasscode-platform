#!/usr/bin/env python3
"""F3.7/#42: isolated, checksum-pinned ONNX int8 embedding experiment.

- prepare: the ONLY network-enabled operation; immutable Hugging Face revision,
  exactly two files, SHA256 verification and atomic writes.
- verify and benchmark: local files only, with no access to user data, Neo4j,
  Redis, production secrets or remote LLMs.
- benchmark: candidate ranking over already annotated synthetic spans. It does
  not extract requirements, classify their role or claim verified experience.
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
import tempfile
import time
from urllib.parse import quote
from urllib.request import Request, urlopen

MODEL_REPOSITORY = "Horizon-Labs/multilingual-embedding-small"
MODEL_FILES = frozenset({"onnx/model_quantized.onnx", "tokenizer.json"})


def parse_manifest(path: Path) -> dict:
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if manifest.get("schemaVersion") != "semantic-embedding-onnx-manifest-v1":
        raise ValueError("INVALID_EMBEDDING_MANIFEST_VERSION")
    if manifest.get("modelRepo") != MODEL_REPOSITORY:
        raise ValueError("INVALID_EMBEDDING_MODEL_ID")
    if not re.fullmatch(r"[0-9a-f]{40}", manifest.get("revision", "")):
        raise ValueError("EMBEDDING_MODEL_REVISION_MUST_BE_SHA")
    if manifest.get("embeddingDimensions") != 1024 or manifest.get("outputName") != "sentence_embedding":
        raise ValueError("INVALID_EMBEDDING_MODEL_CONTRACT")
    if not isinstance(manifest.get("maxTokens"), int) or not 1 <= manifest["maxTokens"] <= 512:
        raise ValueError("INVALID_EMBEDDING_TOKEN_LIMIT")
    files = manifest.get("files")
    if not isinstance(files, list) or {item.get("path") for item in files} != MODEL_FILES:
        raise ValueError("EMBEDDING_MODEL_FILE_ALLOWLIST_MISMATCH")
    for item in files:
        if not re.fullmatch(r"[0-9a-f]{64}", item.get("sha256", "")):
            raise ValueError("INVALID_EMBEDDING_MODEL_CHECKSUM")
    return manifest


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def verify_files(manifest: dict, directory: Path) -> dict:
    files = {}
    for item in manifest["files"]:
        path = directory / item["path"]
        if not path.is_file() or path.is_symlink():
            raise ValueError("EMBEDDING_MODEL_ARTIFACT_MISSING")
        digest = file_hash(path)
        if digest != item["sha256"]:
            raise ValueError("EMBEDDING_MODEL_ARTIFACT_SHA256_MISMATCH")
        files[item["path"]] = {"sha256": digest, "sizeBytes": path.stat().st_size}
    return files


def prepare(manifest: dict, directory: Path) -> dict:
    directory.mkdir(parents=True, exist_ok=True)
    for item in manifest["files"]:
        path = directory / item["path"]
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists() and file_hash(path) == item["sha256"]:
            continue
        url = (
            "https://huggingface.co/"
            + MODEL_REPOSITORY
            + "/resolve/"
            + manifest["revision"]
            + "/"
            + quote(item["path"], safe="/")
        )
        fd, temp = tempfile.mkstemp(prefix=".hf-model-", dir=str(path.parent))
        try:
            downloaded = 0
            digest = hashlib.sha256()
            with os.fdopen(fd, "wb") as output:
                with urlopen(Request(url, headers={"User-Agent": "orbe-semantic-lab/0.1"}), timeout=90) as response:
                    while True:
                        block = response.read(1024 * 1024)
                        if not block:
                            break
                        downloaded += len(block)
                        # Guard against unexpected upstream payloads.
                        if downloaded > (600 * 1024 * 1024 if item["path"].endswith(".onnx") else 90 * 1024 * 1024):
                            raise ValueError("EMBEDDING_MODEL_ARTIFACT_TOO_LARGE")
                        digest.update(block)
                        output.write(block)
            if digest.hexdigest() != item["sha256"]:
                raise ValueError("EMBEDDING_MODEL_ARTIFACT_SHA256_MISMATCH")
            os.replace(temp, path)
        finally:
            if os.path.exists(temp):
                os.unlink(temp)
    return verify_files(manifest, directory)


def normalized(text: str) -> str:
    import unicodedata
    value = unicodedata.normalize("NFKD", text)
    value = "".join(char for char in value if not unicodedata.combining(char))
    return " ".join(re.sub(r"[^a-z0-9]+", " ", value.lower()).split())


def percentile(values: list[float], pct: float) -> float | None:
    if not values:
        return None
    sorted_values = sorted(values)
    position = (len(sorted_values) - 1) * pct
    lower = math.floor(position)
    upper = math.ceil(position)
    return sorted_values[lower] * (upper - position) + sorted_values[upper] * (position - lower) if upper != lower else sorted_values[lower]


def evaluate_rankings(corpus: dict, catalog: dict, rankings: dict) -> dict:
    """Pure evaluator: rankings are IDs ordered by cosine, not verified facts."""
    if corpus.get("schemaVersion") != "semantic-hybrid-corpus-v0":
        raise ValueError("EMBEDDING_LAB_INVALID_CORPUS")
    if corpus.get("reviewStatus") != "draft_not_human_approved":
        raise ValueError("EMBEDDING_LAB_UNREVIEWED_CORPUS_REQUIRED")
    if catalog.get("schemaVersion") != "semantic-skill-catalog-v0":
        raise ValueError("EMBEDDING_LAB_INVALID_SKILL_CATALOG")
    skills = catalog["skills"]
    by_label = {normalized(item["label"]): item["id"] for item in skills}
    if len(by_label) != len(skills):
        raise ValueError("EMBEDDING_LAB_AMBIGUOUS_SKILL_LABELS")
    all_ids = {item["id"] for item in skills}
    if len(all_ids) != len(skills):
        raise ValueError("EMBEDDING_LAB_DUPLICATE_SKILL_IDS")
    expected = 0
    out_of_catalog = 0
    hits = {1: 0, 3: 0, 5: 0}
    first_reciprocal = 0.0
    first_denominator = 0
    candidate_spans = 0
    context_or_negated = 0
    first_wrong = 0
    cases = []
    for case in corpus["cases"]:
        counted = 0
        case_known = 0
        case_oov = 0
        case_hits3 = 0
        for index, annotation in enumerate(case["annotations"]):
            start, end = annotation["start"], annotation["end"]
            if case["text"][start:end] != annotation["text"]:
                raise ValueError("EMBEDDING_LAB_UNGROUNDED_SPAN")
            if annotation["role"] in ("context", "negated") or annotation["relation"] != "candidate_requirement":
                context_or_negated += 1
                continue
            candidate_spans += 1
            counted += 1
            key = f"{case['id']}:{index}"
            ranking = rankings.get(key)
            if not isinstance(ranking, list) or len(ranking) != len(all_ids) or set(ranking) != all_ids:
                raise ValueError("EMBEDDING_LAB_INCOMPLETE_RANKING")
            expected_ids = set()
            for label in annotation["candidateLabels"]:
                skill = by_label.get(normalized(label))
                if skill:
                    expected_ids.add(skill)
                else:
                    out_of_catalog += 1
                    case_oov += 1
            expected += len(expected_ids)
            case_known += len(expected_ids)
            for k in hits:
                hit = len(expected_ids.intersection(ranking[:k]))
                hits[k] += hit
                if k == 3:
                    case_hits3 += hit
            if expected_ids:
                first_denominator += 1
                ranks = [ranking.index(skill) for skill in expected_ids]
                first_reciprocal += 1 / (min(ranks) + 1)
                if ranking[0] not in expected_ids:
                    first_wrong += 1
        cases.append({
            "id": case["id"],
            "candidateSpans": counted,
            "knownLabels": case_known,
            "outOfCatalog": case_oov,
            "hitsAt3": case_hits3,
        })
    return {
        "cases": len(cases),
        "skills": len(skills),
        "candidateSpans": candidate_spans,
        "contextOrNegatedSpansQuarantinedByFixture": context_or_negated,
        "expectedInCatalog": expected,
        "expectedOutOfCatalog": out_of_catalog,
        "hitsAt1": hits[1],
        "hitsAt3": hits[3],
        "hitsAt5": hits[5],
        "recallAt1": round(hits[1] / expected, 4) if expected else None,
        "recallAt3": round(hits[3] / expected, 4) if expected else None,
        "recallAt5": round(hits[5] / expected, 4) if expected else None,
        "mrrFirstKnown": round(first_reciprocal / first_denominator, 4) if first_denominator else None,
        "top1NotInExpectedLabel": first_wrong,
        "casesSummary": cases,
    }


def benchmark(manifest: dict, directory: Path, skills_path: Path, corpus_path: Path, lexical_path: Path | None) -> dict:
    # Verification is required on EVERY run, even in --network none.
    verified = verify_files(manifest, directory)
    import numpy as np
    import onnxruntime as ort
    import tokenizers

    corpus = json.loads(corpus_path.read_text(encoding="utf-8"))
    catalog = json.loads(skills_path.read_text(encoding="utf-8"))
    if len(corpus.get("cases", [])) != 16 or len(catalog.get("skills", [])) < 1:
        raise ValueError("EMBEDDING_LAB_UNEXPECTED_FIXTURE_COUNTS")

    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 2
    opts.inter_op_num_threads = 1
    opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    start_load = time.perf_counter()
    session = ort.InferenceSession(
        str(directory / "onnx/model_quantized.onnx"),
        sess_options=opts,
        providers=["CPUExecutionProvider"],
    )
    tokenizer = tokenizers.Tokenizer.from_file(str(directory / "tokenizer.json"))
    tokenizer.enable_truncation(max_length=manifest["maxTokens"])
    tokenizer.enable_padding(direction="right", pad_id=0, pad_token="<pad>")
    load_ms = (time.perf_counter() - start_load) * 1000

    def embed(texts: list[str], batch_size: int = 8):
        result = []
        elapsed = []
        inputs = {item.name: item.type for item in session.get_inputs()}
        for base in range(0, len(texts), batch_size):
            chunk = texts[base:base + batch_size]
            encodings = tokenizer.encode_batch(chunk, add_special_tokens=True)
            feed = {}
            for name, dtype in inputs.items():
                if name == "input_ids":
                    val = [entry.ids for entry in encodings]
                elif name == "attention_mask":
                    val = [entry.attention_mask for entry in encodings]
                elif name == "token_type_ids":
                    val = [[0] * len(entry.ids) for entry in encodings]
                else:
                    raise ValueError("EMBEDDING_LAB_UNSUPPORTED_ONNX_INPUT")
                feed[name] = np.asarray(val, dtype=np.int64 if dtype == "tensor(int64)" else np.int32)
            tick = time.perf_counter()
            vectors = session.run([manifest["outputName"]], feed)[0]
            elapsed.append((time.perf_counter() - tick) * 1000)
            if vectors.ndim != 2 or vectors.shape != (len(chunk), manifest["embeddingDimensions"]):
                raise ValueError("EMBEDDING_LAB_INVALID_VECTOR_DIMENSIONS")
            if not np.isfinite(vectors).all():
                raise ValueError("EMBEDDING_LAB_NONFINITE_VECTOR")
            norms = np.linalg.norm(vectors, axis=1)
            if not np.allclose(norms, 1.0, atol=0.035):
                raise ValueError("EMBEDDING_LAB_NON_NORMALIZED_VECTOR")
            result.append(vectors.astype(np.float32))
        return np.vstack(result), elapsed

    labels = [skill["label"] for skill in catalog["skills"]]
    ids = [skill["id"] for skill in catalog["skills"]]
    index_start = time.perf_counter()
    skill_vectors, skill_batches = embed(labels)
    index_ms = (time.perf_counter() - index_start) * 1000
    queries = []
    query_keys = []
    for case in corpus["cases"]:
        for i, annotation in enumerate(case["annotations"]):
            if annotation["relation"] == "candidate_requirement" and annotation["role"] not in ("context", "negated"):
                query_keys.append(f"{case['id']}:{i}")
                queries.append(annotation["text"])
    query_start = time.perf_counter()
    query_vectors, query_batches = embed(queries)
    query_ms = (time.perf_counter() - query_start) * 1000
    similarities = query_vectors @ skill_vectors.T
    rankings = {}
    for i, key in enumerate(query_keys):
        order = sorted(range(len(ids)), key=lambda j: (-float(similarities[i, j]), ids[j]))
        rankings[key] = [ids[j] for j in order]
    metrics = evaluate_rankings(corpus, catalog, rankings)
    if lexical_path:
        lexical = json.loads(lexical_path.read_text(encoding="utf-8"))
        if lexical.get("reportVersion") != "semantic-hybrid-lexical-baseline-v0":
            raise ValueError("EMBEDDING_LAB_INVALID_LEXICAL_REFERENCE")
        if (
            lexical["totals"]["cases"] != metrics["cases"]
            or lexical["totals"]["expectedInCatalog"] != metrics["expectedInCatalog"]
            or lexical["totals"]["expectedOutOfCatalog"] != metrics["expectedOutOfCatalog"]
        ):
            raise ValueError("EMBEDDING_LAB_MISMATCHED_DENOMINATORS")
    else:
        lexical = None
    return {
        "reportVersion": "semantic-embedding-onnx-lab-v1",
        "mode": "offline_onnx_quantized_cosine_ranking",
        "reviewStatus": corpus["reviewStatus"],
        "modelRepo": manifest["modelRepo"],
        "modelRevision": manifest["revision"],
        "modelSha256": verified["onnx/model_quantized.onnx"]["sha256"],
        "embeddingDimensions": manifest["embeddingDimensions"],
        "modelCalls": 0,
        "neo4jQueries": 0,
        "networkCallsDuringBenchmark": 0,
        "runtime": {"onnxruntime": ort.__version__, "numpy": np.__version__, "tokenizers": tokenizers.__version__},
        "latencyMs": {
            "load": round(load_ms, 2),
            "index": round(index_ms, 2),
            "queryTotal": round(query_ms, 2),
            "indexBatchP50": round(statistics.median(skill_batches), 2),
            "indexBatchP95": round(percentile(skill_batches, 0.95), 2),
            "queryBatchP50": round(statistics.median(query_batches), 2),
            "queryBatchP95": round(percentile(query_batches, 0.95), 2),
        },
        "resource": {"peakRssMiB": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 2)},
        "totals": metrics,
        "lexicalReference": {
            "recallAt1": lexical["totals"]["lexicalRecallAt1"],
            "recallAt3": lexical["totals"]["lexicalRecallAt3"],
            "expectedInCatalog": lexical["totals"]["expectedInCatalog"],
        } if lexical else None,
        "limitations": [
            "Synthetic provisional spans; not human-approved ground truth.",
            "Role/negation/context labels are oracle annotations, not model predictions.",
            "Cosine similarity is not a probability of candidate experience.",
            "Only in-catalog labels are ranked. OOV items are counted, never dismissed.",
            "No automatic threshold or promotion of vector results to factual evidence.",
            "Cold start/memory/p95 on this runner may differ from the Mac Mini.",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["prepare", "verify", "benchmark"])
    parser.add_argument("--manifest", type=Path, default=Path("evaluation/semantic-embedding-onnx-manifest.json"))
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--catalog", type=Path, default=Path("/tmp/semantic-skill-catalog.json"))
    parser.add_argument("--corpus", type=Path, default=Path("evaluation/semantic-hybrid-corpus-v0.json"))
    parser.add_argument("--lexical-report", type=Path)
    args = parser.parse_args()
    manifest = parse_manifest(args.manifest)
    if args.command == "prepare":
        files = prepare(manifest, args.model_dir)
        result = {"status": "EMBEDDING_ARTIFACTS_VERIFIED", "modelRevision": manifest["revision"], "files": files}
    elif args.command == "verify":
        files = verify_files(manifest, args.model_dir)
        result = {"status": "EMBEDDING_ARTIFACTS_VERIFIED", "modelRevision": manifest["revision"], "files": files}
    else:
        result = benchmark(manifest, args.model_dir, args.catalog, args.corpus, args.lexical_report)
    print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as err:
        # Fail closed, without printing arbitrary user text or file contents.
        print(f"SEMANTIC_EMBEDDING_LAB_FAILED: {type(err).__name__}", file=sys.stderr)
        sys.exit(1)
