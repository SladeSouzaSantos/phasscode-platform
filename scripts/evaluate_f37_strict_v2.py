#!/usr/bin/env python3
"""F3.7 diagnostic: fixed strict-literal rerank vs naive lexical-first vs ONNX.

The strictly constrained policy was frozen at 8476d91 before authoring the v2
cohort. The v2 cohort is synthetic, not independently human-reviewed.
No model is called here; all model rankings are supplied by the isolated lab.
No candidate claim is accepted or verified by this evaluator.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import sys

from f37_strict_literal import normalize, reorder_candidate_rankings, strict_literal_skill_id
from evaluate_f37_lexical_first import lexical_candidates

ROOT = Path(__file__).resolve().parents[1]
CORPUS = ROOT / "evaluation/semantic-embedding-adversarial-v2.json"
MANIFEST = ROOT / "evaluation/semantic-embedding-adversarial-v2.manifest.json"
MODEL_REVISION = "033028575b040790aef3064b2a045245ee54d238"
GLOSSARY_SHA = "6734b677a4b73b672e929ee8524dc83e4ba9364f252de9adcf32109c4ab0bf60"
POLICY_COMMIT = "8476d91f587c98a63ad9c716a25da360a6a47331"


def load_frozen_corpus() -> tuple[dict, dict]:
    raw = CORPUS.read_bytes()
    m = json.loads(MANIFEST.read_text(encoding="utf-8"))
    d = json.loads(raw)
    if (
        m.get("schemaVersion") != "semantic-adversarial-v2-manifest"
        or m.get("fixture") != "evaluation/semantic-embedding-adversarial-v2.json"
        or m.get("frozenPolicyCommit") != POLICY_COMMIT
        or m.get("authoredAfterPolicyCommit") is not True
        or m.get("humanReviewed") is not False
        or hashlib.sha256(raw).hexdigest() != m.get("fixtureSha256")
        or m.get("caseCount") != 40
        or m.get("inCatalogLabels") != 28
        or m.get("outOfCatalogLabels") != 8
        or m.get("contextNegatedControls") != 4
        or d.get("schemaVersion") != "semantic-hybrid-corpus-v0"
        or d.get("reviewStatus") != "draft_not_human_approved"
        or len(d.get("cases", [])) != 40
    ):
        raise ValueError("F37_V2_FROZEN_CORPUS_MISMATCH")
    return d, m


def compare(corpus: dict, manifest: dict, catalog: dict, onnx: dict, lexical: dict) -> dict:
    if (
        catalog.get("schemaVersion") != "semantic-skill-catalog-v0"
        or not isinstance(catalog.get("skills"), list)
        or onnx.get("reportVersion") != "semantic-embedding-onnx-lab-v1"
        or onnx.get("modelRevision") != MODEL_REVISION
        or onnx.get("indexMode") != "label_plus_curated_draft_description"
        or onnx.get("curatedDescriptionsSha256") != GLOSSARY_SHA
        or lexical.get("reportVersion") != "semantic-hybrid-lexical-baseline-v0"
    ):
        raise ValueError("F37_V2_PROVENANCE_MISMATCH")
    skills = catalog["skills"]
    by_id = {s["id"]: s for s in skills}
    by_label = {normalize(s["label"]): s["id"] for s in skills}
    if len(by_id) != len(skills) or len(by_label) != len(skills) or len(skills) != 68:
        raise ValueError("F37_V2_CATALOG_DRIFT")
    rankings = onnx.get("rankingsBySpan")
    if not isinstance(rankings, dict):
        raise ValueError("F37_V2_MISSING_RANKINGS")

    expected_ids = set()
    outcomes: dict[str, dict] = {
        name: {"hits": {1: 0, 3: 0, 5: 0}, "reciprocal": 0.0}
        for name in ("lexical_first_naive", "onnx_enriched", "strict_literal_first")
    }
    by_group = defaultdict(lambda: {
        "known": 0, "oov": 0,
        "strictTop1Hits": 0, "onnxTop1Hits": 0,
        "strictOverrides": 0,
    })
    overrides = 0
    strict_improvements = 0
    strict_regressions = 0
    known_labels = 0
    oov = 0
    quarantined = 0
    context_literal_mentions = 0
    context_strict_overrides = 0
    result_rows = []
    for case in corpus["cases"]:
        if len(case.get("annotations", [])) != 1:
            raise ValueError("F37_V2_UNEXPECTED_ANNOTATIONS")
        a = case["annotations"][0]
        if (a["start"], a["end"], a["text"]) != (0, len(case["text"]), case["text"]):
            raise ValueError("F37_V2_UNGROUNDED_SPAN")
        key = f"{case['id']}:0"
        group = (
            "paraphrase" if "-para-" in case["id"] else
            "explicit" if "-lit-" in case["id"] else
            "out_of_catalog" if "-oov-" in case["id"] else
            "nonrequirement" if "-nonreq-" in case["id"] else
            "unrecognized"
        )
        if group == "unrecognized":
            raise ValueError("F37_V2_UNEXPECTED_GROUP")
        is_requirement = a["relation"] == "candidate_requirement" and a["role"] not in ("negated", "context")
        if not is_requirement:
            if key in rankings:
                raise ValueError("F37_V2_ORACLE_LEAK_IN_MODEL")
            quarantined += 1
            context_literal_mentions += len(lexical_candidates(a["text"], skills))
            context_strict_overrides += strict_literal_skill_id(a["text"], skills) is not None
            continue

        raw = rankings.get(key)
        if not isinstance(raw, list) or len(raw) != len(by_id) or set(raw) != set(by_id):
            raise ValueError("F37_V2_UNPAIRED_MODEL_RANKING")
        label_set = {by_label[normalize(x)] for x in a["candidateLabels"] if normalize(x) in by_label}
        missing = sum(normalize(x) not in by_label for x in a["candidateLabels"])
        if len(label_set) > 1 or (len(label_set) == 1 and missing):
            raise ValueError("F37_V2_AMBIGUOUS_TEST_ORACLE")
        known_labels += len(label_set)
        oov += missing
        if label_set:
            by_group[group]["known"] += 1
        else:
            by_group[group]["oov"] += 1

        naive_literal = lexical_candidates(a["text"], skills)
        naive = naive_literal + [sid for sid in raw if sid not in naive_literal]
        strict, forced = reorder_candidate_rankings(a["text"], skills, raw)
        overrides += forced
        by_group[group]["strictOverrides"] += forced
        strict_hit = bool(label_set and strict[0] in label_set)
        model_hit = bool(label_set and raw[0] in label_set)
        strict_improvements += strict_hit and not model_hit
        strict_regressions += model_hit and not strict_hit
        by_group[group]["strictTop1Hits"] += strict_hit
        by_group[group]["onnxTop1Hits"] += model_hit

        candidate_rankings = {
            "lexical_first_naive": naive,
            "onnx_enriched": raw,
            "strict_literal_first": strict,
        }
        for name, ranked in candidate_rankings.items():
            for top_k in (1, 3, 5):
                outcomes[name]["hits"][top_k] += len(label_set.intersection(ranked[:top_k]))
            if label_set:
                outcomes[name]["reciprocal"] += 1.0 / (min(ranked.index(x) for x in label_set) + 1)
        expected_ids.add(key)
        result_rows.append({
            "id": key,
            "group": group,
            "language": case["language"],
            "expectedInCatalog": bool(label_set),
            "strictOverride": forced,
            "strictCorrectTop1": strict_hit,
            "onnxCorrectTop1": model_hit,
            "naiveCorrectTop1": bool(label_set and naive[0] in label_set),
            "allCandidatesStillUntrusted": True,
        })

    if (
        set(rankings) != expected_ids
        or len(expected_ids) != 36
        or known_labels != manifest["inCatalogLabels"]
        or oov != manifest["outOfCatalogLabels"]
        or quarantined != manifest["contextNegatedControls"]
        or lexical["totals"]["cases"] != 40
        or lexical["totals"]["expectedInCatalog"] != known_labels
        or lexical["totals"]["expectedOutOfCatalog"] != oov
        or onnx["totals"]["expectedInCatalog"] != known_labels
        or onnx["totals"]["expectedOutOfCatalog"] != oov
        or outcomes["onnx_enriched"]["hits"][1] != onnx["totals"]["hitsAt1"]
    ):
        raise ValueError("F37_V2_UNPAIRED_DENOMINATORS")

    def ratio(n: int | float, d: int) -> float | None:
        return round(n / d, 4) if d else None

    methods = {
        name: {
            "hitsAt1": scores["hits"][1],
            "hitsAt3": scores["hits"][3],
            "hitsAt5": scores["hits"][5],
            "recallAt1": ratio(scores["hits"][1], known_labels),
            "recallAt3": ratio(scores["hits"][3], known_labels),
            "recallAt5": ratio(scores["hits"][5], known_labels),
            "mrr": ratio(scores["reciprocal"], known_labels),
        }
        for name, scores in outcomes.items()
    }
    return {
        "reportVersion": "f37-strict-fusion-prospective-v2",
        "policyLockedBeforeCorpus": POLICY_COMMIT,
        "corpusSha256": manifest["fixtureSha256"],
        "modelRevision": MODEL_REVISION,
        "glossarySha256": GLOSSARY_SHA,
        "reviewStatus": "synthetic_author_labeled_not_human_gold",
        "denominator": {
            "cases": 40,
            "candidateSpans": 36,
            "inCatalogLabels": known_labels,
            "outOfCatalogLabels": oov,
            "oracleQuarantinedContextOrNegation": quarantined,
        },
        "methods": methods,
        "strictOverrides": overrides,
        "strictTop1Improvements": strict_improvements,
        "strictTop1Regressions": strict_regressions,
        "rawLiteralMentionsInNonrequirements": context_literal_mentions,
        "strictOverrideInNonrequirements": context_strict_overrides,
        "groups": dict(sorted(by_group.items())),
        "risk": {
            "untrustedOovTop1Suggestions": oov,
            "autoVerifiedSkills": 0,
            "inputRolesAreOracleLabels": True,
            "modelClassifiesRole": False,
            "safeOovAcceptanceThresholdValidated": False,
        },
        "casesSummary": result_rows,
        "limitations": [
            "New author-labeled synthetic cohort with policy commit frozen earlier; no independent human label approval.",
            "Roles, candidate spans and nonrequirements are provided by oracle labels; no model classifies them.",
            "All ranked top1 results are untrusted suggestions; eight OOV queries still return unrelated skills.",
            "Do not tune the strict lexical policy on this cohort, or claim readiness for active or Shadow.",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, required=True)
    parser.add_argument("--onnx-report", type=Path, required=True)
    parser.add_argument("--lexical-report", type=Path, required=True)
    args = parser.parse_args()
    corpus, manifest = load_frozen_corpus()
    result = compare(corpus, manifest,
                     json.loads(args.catalog.read_text(encoding="utf-8")),
                     json.loads(args.onnx_report.read_text(encoding="utf-8")),
                     json.loads(args.lexical_report.read_text(encoding="utf-8")))
    print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, TypeError, KeyError, IndexError) as exc:
        print(f"F37_STRICT_FUSION_FAILED: {type(exc).__name__}", file=sys.stderr)
        sys.exit(1)
