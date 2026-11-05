#!/usr/bin/env python3
"""F3.7 offline same-denominator comparison of rules and optionally Laya.

Synthetic fixture only. Never loads weights, contacts services, uses visitor data,
or converts predictions into verified candidate employment evidence.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re

from semantic_typed_rules_lab import ROLES, RELATIONS, classify

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "evaluation/semantic-typed-holdout-v1.manifest.json"
POSITIVE = frozenset(("mandatory", "desirable", "alternative"))


def load_frozen_holdout(manifest_path: Path = MANIFEST) -> tuple[dict, list[dict]]:
    m = json.loads(manifest_path.read_text(encoding="utf-8"))
    if (m.get("schemaVersion") != "semantic-typed-holdout-manifest-v1"
            or m.get("reviewStatus") != "synthetic_draft_not_human_reviewed"
            or m.get("noModelAssistedLabels") is not True
            or m.get("policy") != "diagnostic_only_no_model_promotion"
            or not re.fullmatch(r"[a-f0-9]{64}", str(m.get("sha256")))):
        raise ValueError("SEMANTIC_INVALID_HOLDOUT_MANIFEST")
    # Must stay within the repository. The manifest is not a user-provided path.
    if m.get("fixture") != "evaluation/semantic-typed-holdout-v1.json":
        raise ValueError("SEMANTIC_UNAPPROVED_FIXTURE_PATH")
    path = manifest_path.parent / "semantic-typed-holdout-v1.json"
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if digest != m["sha256"]:
        raise ValueError("SEMANTIC_FROZEN_CORPUS_CHANGED")
    data = json.loads(raw)
    if (data.get("schemaVersion") != "semantic-hybrid-corpus-v0"
            or data.get("reviewStatus") != "draft_not_human_approved"
            or data.get("provenance") != "synthetic_examples_only"
            or data.get("cohort") != m.get("cohort")):
        raise ValueError("SEMANTIC_UNSAFE_HOLDOUT")
    cases = data.get("cases")
    if not isinstance(cases, list) or len(cases) != m.get("caseCount"):
        raise ValueError("SEMANTIC_CASE_COUNT_DRIFT")
    examples = []
    case_ids = set()
    for c in cases:
        text = c["text"]
        if (not isinstance(c.get("id"), str) or not re.fullmatch(r"[a-z0-9-]{3,90}", c["id"])
                or c["id"] in case_ids or c.get("language") not in ("pt", "en")
                or not isinstance(text, str) or not 1 <= len(text) <= 900):
            raise ValueError("SEMANTIC_BAD_CASE")
        case_ids.add(c["id"])
        spans = c["annotations"]
        if not isinstance(spans, list) or not 1 <= len(spans) <= 6:
            raise ValueError("SEMANTIC_BAD_SPAN_LIST")
        previous_end = -1
        for i, a in enumerate(sorted(spans, key=lambda x: x["start"])):
            start, end = a["start"], a["end"]
            if (not isinstance(start, int) or isinstance(start, bool)
                    or not isinstance(end, int) or isinstance(end, bool)
                    or start < previous_end or start < 0 or start >= end or end > len(text)
                    or text[start:end] != a.get("text")
                    or a.get("role") not in ROLES or a.get("relation") not in RELATIONS):
                raise ValueError("SEMANTIC_INVALID_HOLDOUT_SPAN")
            previous_end = end
            examples.append({"id": f"{c['id']}:{i}", "language": c["language"],
                             "text": text, "start": start, "end": end, "literal": a["text"],
                             "role": a["role"], "relation": a["relation"]})
    if len(examples) != m.get("spanCount"):
        raise ValueError("SEMANTIC_SPAN_COUNT_DRIFT")
    return m, examples


def scored(rows: list[dict], label: str) -> dict:
    """Selective risk and coverage; count abstentions in effective recall denominator."""
    total = len(rows)
    accepted = [r for r in rows if not r["abstained"]]
    joint_correct = sum(r["predictedRole"] == r["expectedRole"] and r["predictedRelation"] == r["expectedRelation"] for r in accepted)
    false_promotions = sum(r["predictedRole"] in POSITIVE and
                           (r["expectedRole"] not in POSITIVE or r["expectedRelation"] != "candidate_requirement") for r in accepted)
    wrong_negations = sum(r["expectedRole"] == "negated" and r["predictedRole"] in POSITIVE for r in accepted)
    # Diagnostic only: do NOT hide unsafe raw Laya outputs behind an abstention.
    # Selective metrics above remain the ONLY outputs considered by a future gate.
    raw_role_correct = sum(r["predictedRole"] == r["expectedRole"] for r in rows)
    raw_relation_correct = sum(r["predictedRelation"] == r["expectedRelation"] for r in rows)
    raw_joint_correct = sum(r["predictedRole"] == r["expectedRole"] and r["predictedRelation"] == r["expectedRelation"] for r in rows)
    raw_false_promotions = sum(r["predictedRole"] in POSITIVE and
                               (r["expectedRole"] not in POSITIVE or r["expectedRelation"] != "candidate_requirement") for r in rows)
    raw_negation_promotions = sum(r["expectedRole"] == "negated" and r["predictedRole"] in POSITIVE for r in rows)
    details = {}
    for kind in ("language", "expectedRole", "expectedRelation"):
        b = {}
        for r in rows:
            bucket = b.setdefault(r[kind], {"total": 0, "resolved": 0, "correctJoint": 0})
            bucket["total"] += 1
            if not r["abstained"]:
                bucket["resolved"] += 1
                bucket["correctJoint"] += int(r["predictedRole"] == r["expectedRole"] and r["predictedRelation"] == r["expectedRelation"])
        details[kind] = b
    return {
        "name": label,
        "total": total,
        "resolved": len(accepted),
        "abstained": total - len(accepted),
        "coverage": round(len(accepted) / total, 4) if total else None,
        "jointPrecisionAmongResolved": round(joint_correct / len(accepted), 4) if accepted else None,
        "effectiveJointRecall": round(joint_correct / total, 4) if total else None,
        "jointErrorsAmongResolved": len(accepted) - joint_correct,
        "falseRequirementPromotions": false_promotions,
        "negationPromotions": wrong_negations,
        "rawUngated": {
            "policy": "diagnostic_only_predictions_not_authorized_requirements",
            "roleCorrect": raw_role_correct,
            "relationCorrect": raw_relation_correct,
            "jointCorrect": raw_joint_correct,
            "jointAccuracy": round(raw_joint_correct / total, 4) if total else None,
            "falseRequirementPromotions": raw_false_promotions,
            "negationPromotions": raw_negation_promotions,
        },
        "groups": details,
        "discrepancyIds": [r["id"] for r in accepted if r["predictedRole"] != r["expectedRole"] or r["predictedRelation"] != r["expectedRelation"]],
        "abstentionIds": [r["id"] for r in rows if r["abstained"]],
    }


def build_rule_rows(examples: list[dict]) -> list[dict]:
    rows = []
    for e in examples:
        result = classify(e["text"], e["start"], e["end"], e["literal"])
        rows.append({"id": e["id"], "language": e["language"],
                     "expectedRole": e["role"], "expectedRelation": e["relation"],
                     "predictedRole": result["role"], "predictedRelation": result["relation"],
                     "abstained": result["needsClassifier"]})
    return rows


def load_laya_rows(report_path: Path, manifest: dict, examples: list[dict]) -> list[dict]:
    result = json.loads(report_path.read_text(encoding="utf-8"))
    if (result.get("reportVersion") != "laya-typed-decision-lab-v0"
            or result.get("reviewStatus") != "draft_not_human_approved"
            or result.get("policy") != "no_active_or_shadow_promotion"
            or result.get("fixtureSha256") != manifest["sha256"]
            or not re.fullmatch(r"[a-f0-9]{40}", str(result.get("modelRevision")))):
        raise ValueError("LAYA_COMPARISON_INCOMPATIBLE_REPORT")
    cases = result.get("metrics", {}).get("cases", [])
    if not isinstance(cases, list) or len(cases) != len(examples):
        raise ValueError("LAYA_COMPARISON_DENOMINATOR_MISMATCH")
    lookup = {}
    for row in cases:
        key = row.get("id")
        if key in lookup or not isinstance(key, str):
            raise ValueError("LAYA_COMPARISON_DUPLICATE_ID")
        lookup[key] = row
    if set(lookup) != {e["id"] for e in examples}:
        raise ValueError("LAYA_COMPARISON_COHORT_MISMATCH")
    rows = []
    for e in examples:
        record = lookup[e["id"]]
        if (record.get("expectedRole") != e["role"]
                or record.get("expectedRelation") != e["relation"]
                or record.get("predictedRole") not in ROLES
                or record.get("predictedRelation") not in RELATIONS
                or type(record.get("diagnosticAbstention")) is not bool):
            raise ValueError("LAYA_COMPARISON_LABEL_DRIFT")
        rows.append({"id": e["id"], "language": e["language"],
                     "expectedRole": e["role"], "expectedRelation": e["relation"],
                     "predictedRole": record["predictedRole"],
                     "predictedRelation": record["predictedRelation"],
                     "abstained": record["diagnosticAbstention"]})
    return rows


def evaluate(manifest_path: Path = MANIFEST, laya_report: Path | None = None) -> dict:
    manifest, examples = load_frozen_holdout(manifest_path)
    rule = scored(build_rule_rows(examples), "deterministic_rule_gate")
    report = {
        "reportVersion": "semantic-typed-controlled-comparison-v1",
        "corpusSha256": manifest["sha256"],
        "corpusStatus": "synthetic_draft_not_human_reviewed",
        "cohort": manifest["cohort"],
        "denominator": len(examples),
        "rules": rule,
        "laya": {"status": "not_executed_on_this_cohort"},
        "externalLlmCalls": 0,
        "graphQueries": 0,
        "publicOrbeChanged": False,
        "limitations": [
            "Spans and labels are supplied by a synthetic provisional fixture, not extracted from real vacancies",
            "Frozen before this first rule evaluation, but not independently human reviewed or fully blind",
            "Laya must run separately on precisely the same cohort to make a paired comparison",
            "Abstentions are NOT correct predictions and remain in the effective recall denominator",
            "Scores cannot verify candidate skills or authorize production or shadow integration",
        ],
    }
    if laya_report is not None:
        report["laya"] = scored(load_laya_rows(laya_report, manifest, examples), "laya_diagnostic_gate")
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--laya-report", type=Path)
    parser.add_argument("--manifest", type=Path, default=MANIFEST)
    args = parser.parse_args()
    print(json.dumps(evaluate(args.manifest, args.laya_report), ensure_ascii=False, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, TypeError, OSError, KeyError, json.JSONDecodeError) as exc:
        raise SystemExit(f"SEMANTIC_COMPARISON_FAILED: {type(exc).__name__}") from None
