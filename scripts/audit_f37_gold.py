#!/usr/bin/env python3
"""F3.7/#41: immutable, read-only audit of provisional F3.4 vacancy annotations.

Produces only source hashes, IDs, counts and validation findings. It NEVER
prints vacancy messages or asserts that provisional labels are human gold.
"""
from __future__ import annotations

import hashlib
import json
from collections import Counter
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "evaluation/vacancies-ppks-v12.json"
REVIEW = ROOT / "evaluation/semantic-hybrid-ppks-review-v0.json"
ROLES = {"mandatory", "desirable", "alternative", "context", "negated", "uncertain", "unknown"}
RELATIONS = {"candidate_requirement", "company_stack", "future_stack", "project_claim", "unrelated"}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def audit(source: dict, review: dict) -> dict:
    if not isinstance(source, dict) or not isinstance(review, dict):
        raise ValueError("GOLD_INVALID_INPUT")
    if review.get("reviewStatus") != "assistant_provisional_not_human_validated":
        raise ValueError("GOLD_UNEXPECTED_REVIEW_STATUS")
    if review.get("sourceVersion") != source.get("version"):
        raise ValueError("GOLD_SOURCE_VERSION_MISMATCH")
    source_cases = source.get("cases")
    annotated = review.get("cases")
    if not isinstance(source_cases, list) or not isinstance(annotated, list):
        raise ValueError("GOLD_INVALID_CASE_LIST")
    by_id = {x["id"]: x for x in source_cases}
    if len(by_id) != len(source_cases) or len({x["id"] for x in annotated}) != len(annotated):
        raise ValueError("GOLD_DUPLICATE_CASE")
    if set(by_id) != {x["id"] for x in annotated}:
        raise ValueError("GOLD_MISSING_CASE")

    report = []
    role_counts = Counter()
    relation_counts = Counter()
    total_spans = 0
    unreviewed = 0
    for case in annotated:
        original = by_id[case["id"]]
        turn = case.get("turnIndex")
        turns = original.get("turns", [])
        if type(turn) is not int or turn < 0 or turn >= len(turns):
            raise ValueError("GOLD_INVALID_TURN")
        message = turns[turn].get("message")
        if not isinstance(message, str) or not message:
            raise ValueError("GOLD_INVALID_MESSAGE")
        spans = case.get("spans")
        if not isinstance(spans, list) or not spans:
            raise ValueError("GOLD_EMPTY_CASE")
        if case.get("coverageClaim") != "partial_annotations_only":
            raise ValueError("GOLD_UNSUPPORTED_COVERAGE_CLAIM")
        last_end = -1
        count_uncertain = 0
        for span in sorted(spans, key=lambda x: x["start"]):
            start, end, text = span["start"], span["end"], span["text"]
            if (type(start) is not int or type(end) is not int
                    or start < last_end or start < 0 or start >= end or end > len(message)
                    or message[start:end] != text):
                raise ValueError("GOLD_UNGROUNDED_OR_OVERLAPPING_SPAN")
            if span.get("role") not in ROLES or span.get("relation") not in RELATIONS:
                raise ValueError("GOLD_INVALID_LABEL")
            if span.get("reviewStatus") != "assistant_provisional_not_human_validated":
                raise ValueError("GOLD_UNVERIFIED_SPAN_STATUS")
            if span["role"] == "uncertain":
                count_uncertain += 1
                if not span.get("uncertainty"):
                    raise ValueError("GOLD_UNEXPLAINED_UNCERTAINTY")
            role_counts[span["role"]] += 1
            relation_counts[span["relation"]] += 1
            last_end = end
        total_spans += len(spans)
        unreviewed += len(spans)
        report.append({
            "id": case["id"],
            "turnIndex": turn,
            "annotatedSpans": len(spans),
            "uncertainSpans": count_uncertain,
            "reviewRequired": True,
            "exhaustiveCoverageEstablished": False,
        })

    return {
        "reportVersion": "orbe-f37-gold-preaudit-v1",
        "source": "evaluation/vacancies-ppks-v12.json",
        "review": "evaluation/semantic-hybrid-ppks-review-v0.json",
        "reviewStatus": "assistant_provisional_not_human_validated",
        "cases": len(report),
        "spans": total_spans,
        "humanReviewedSpans": 0,
        "unreviewedSpans": unreviewed,
        "roleCounts": dict(sorted(role_counts.items())),
        "relationCounts": dict(sorted(relation_counts.items())),
        "caseAudit": report,
        "allOffsetsValid": True,
        "exhaustiveCoverageEstablished": False,
        "limitations": [
            "Valid offsets do not prove that every requirement was annotated.",
            "Unknown=0 is not a coverage claim.",
            "Provisional assistant-authored labels require independent human review.",
            "No candidate employment fact is established by vacancy annotations.",
        ],
    }


def run(source_path: Path = SOURCE, review_path: Path = REVIEW) -> dict:
    src = json.loads(source_path.read_text(encoding="utf-8"))
    rev = json.loads(review_path.read_text(encoding="utf-8"))
    output = audit(src, rev)
    output["sourceSha256"] = sha256(source_path)
    output["reviewSha256"] = sha256(review_path)
    return output


if __name__ == "__main__":
    try:
        print(json.dumps(run(), sort_keys=True, ensure_ascii=False, separators=(",", ":")))
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        print(f"GOLD_PREAUDIT_FAILED: {type(exc).__name__}", file=sys.stderr)
        sys.exit(1)
