#!/usr/bin/env python3
"""F3.7/#41: validate a human-review PACKET, not assert human review.

Any human-approved status must be verified out-of-band via an actual independent
GitHub PR review. This tool only checks internal consistency and source binding.
No model, network, secrets or professional candidate evidence.
"""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "evaluation/vacancies-ppks-v12.json"
ANNOTATIONS = ROOT / "evaluation/semantic-hybrid-ppks-review-v0.json"
PACKET = ROOT / "evaluation/semantic-f34-human-review-template-v1.json"

ROLES = {"mandatory", "desirable", "alternative", "context", "negated", "uncertain", "unknown"}
RELATIONS = {"candidate_requirement", "company_stack", "future_stack", "project_claim", "unrelated", "academic_question"}


def blob_sha(data: bytes) -> str:
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()


def validate_packet(packet: dict, original: dict, provisional: dict, source_bytes: bytes, annotation_bytes: bytes) -> dict:
    if (packet.get("schemaVersion") != "orbe-f37-f34-human-review-template-v1"
        or packet.get("source") != {"path": "evaluation/vacancies-ppks-v12.json", "gitBlobSha": blob_sha(source_bytes)}
        or packet.get("provisionalAnnotations") != {"path": "evaluation/semantic-hybrid-ppks-review-v0.json", "gitBlobSha": blob_sha(annotation_bytes)}):
        raise ValueError("REVIEW_SOURCE_DRIFT")
    case_lookup = {c["id"]: c for c in original["cases"]}
    original_annotations = {c["id"]: c for c in provisional["cases"]}
    if (len(case_lookup) != 9 or len(original_annotations) != 9 or
        len(packet.get("cases", [])) != 9 or
        {c["id"] for c in packet["cases"]} != set(case_lookup)):
        raise ValueError("REVIEW_CASE_COUNT_MISMATCH")
    counts = {"pendingSpans": 0, "changedSpans": 0, "approvedSpans": 0, "unreviewedCases": 0, "reviewedCases": 0}
    for case in packet["cases"]:
        case_id = case["id"]
        ref = original_annotations[case_id]
        original_case = case_lookup[case_id]
        turn = ref["turnIndex"]
        if case.get("turnIndex") != turn or case.get("kind") not in ("recruiter_vacancy", "academic_question"):
            raise ValueError("REVIEW_BAD_CASE_POINTER")
        expect_kind = "academic_question" if any(s["relation"] == "academic_question" for s in ref["spans"]) else "recruiter_vacancy"
        if case["kind"] != expect_kind:
            raise ValueError("REVIEW_BAD_CASE_KIND")
        message = original_case["turns"][turn]["message"]
        entries = case.get("annotations")
        if not isinstance(entries, list) or len(entries) != len(ref["spans"]):
            raise ValueError("REVIEW_SPAN_COUNT_MISMATCH")
        for i, (item, a) in enumerate(zip(entries, ref["spans"])):
            if (item.get("anchorId") != f"{case_id}:{i}" or
                item.get("start") != a["start"] or item.get("end") != a["end"] or
                item.get("sourceRole") != a["role"] or item.get("sourceRelation") != a["relation"] or
                message[a["start"]:a["end"]] != a["text"]):
                raise ValueError("REVIEW_SPAN_SOURCE_DRIFT")
            choice = item.get("reviewDecision")
            if choice == "pending":
                if any(item.get(k) is not None for k in ("reviewedRole", "reviewedRelation", "notes")):
                    raise ValueError("REVIEW_PENDING_HAS_DECISION")
                counts["pendingSpans"] += 1
            elif choice in ("approved", "corrected"):
                if item.get("reviewedRole") not in ROLES or item.get("reviewedRelation") not in RELATIONS:
                    raise ValueError("REVIEW_INVALID_REVIEWED_LABEL")
                if choice == "corrected":
                    if not isinstance(item.get("notes"), str) or len(item["notes"].strip()) < 5:
                        raise ValueError("REVIEW_CORRECTION_UNEXPLAINED")
                    counts["changedSpans"] += 1
                else:
                    if (item["reviewedRole"] != a["role"] or item["reviewedRelation"] != a["relation"]):
                        raise ValueError("REVIEW_APPROVAL_CHANGED_LABEL")
                    counts["approvedSpans"] += 1
            else:
                raise ValueError("REVIEW_INVALID_DECISION")
        coverage = case.get("coverage", {})
        omissions = coverage.get("omissions")
        if not isinstance(omissions, list):
            raise ValueError("REVIEW_INVALID_OMISSIONS")
        if coverage.get("decision") == "pending":
            if coverage.get("notes") is not None or omissions:
                raise ValueError("REVIEW_PENDING_COVERAGE_DRIFT")
        elif coverage.get("decision") in ("complete", "requires_corrections"):
            if not isinstance(coverage.get("notes"), str) or len(coverage["notes"].strip()) < 5:
                raise ValueError("REVIEW_UNEXPLAINED_COVERAGE")
            if coverage["decision"] == "complete" and omissions:
                raise ValueError("REVIEW_COMPLETE_WITH_OMISSIONS")
            for omit in omissions:
                if not isinstance(omit, dict) or set(omit) != {"start", "end", "role", "relation", "notes"}:
                    raise ValueError("REVIEW_INVALID_OMISSION")
                begin, end = omit["start"], omit["end"]
                if type(begin) is not int or type(end) is not int or begin < 0 or begin >= end or end > len(message):
                    raise ValueError("REVIEW_INVALID_OMISSION_OFFSETS")
                if omit["role"] not in ROLES or omit["relation"] not in RELATIONS:
                    raise ValueError("REVIEW_INVALID_OMISSION_LABEL")
        else:
            raise ValueError("REVIEW_INVALID_COVERAGE")
        reviewer = case.get("reviewer", {})
        is_pending = coverage["decision"] == "pending" or any(x["reviewDecision"] == "pending" for x in entries)
        if is_pending:
            if any(reviewer.get(k) is not None for k in ("identity", "reviewedAt", "pullRequest")):
                raise ValueError("REVIEW_PREMATURE_REVIEWER_ATTESTATION")
            counts["unreviewedCases"] += 1
        else:
            if (not isinstance(reviewer.get("identity"), str) or not reviewer["identity"].strip()
                or not isinstance(reviewer.get("reviewedAt"), str) or not reviewer["reviewedAt"].endswith("Z")
                or not isinstance(reviewer.get("pullRequest"), str) or not re.fullmatch(
                    r"https://github.com/SladeSouzaSantos/phasscode-platform/pull/[0-9]+", reviewer["pullRequest"])):
                raise ValueError("REVIEW_MISSING_HUMAN_PR_ATTESTATION")
            counts["reviewedCases"] += 1
    return {
        "reportVersion": "f37-f34-review-packet-check-v1",
        "totalCases": len(packet["cases"]),
        "totalSpans": sum(len(c["annotations"]) for c in packet["cases"]),
        "counts": counts,
        "independentReviewVerified": False,
        "goldSetApproved": False,
        "reason": "Source integrity and review packet schema only. Verify reviewers and actual PR approvals outside this script.",
    }


def main() -> int:
    pkt = json.loads(PACKET.read_text(encoding="utf-8"))
    source = SOURCE.read_bytes()
    original = ANNOTATIONS.read_bytes()
    out = validate_packet(pkt, json.loads(source), json.loads(original), source, original)
    print(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, OSError, KeyError, TypeError, IndexError) as exc:
        print(f"F37_REVIEW_PACKET_FAILED: {type(exc).__name__}", file=sys.stderr)
        sys.exit(1)
