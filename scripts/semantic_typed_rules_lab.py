#!/usr/bin/env python3
"""F3.7/#43: offline, high-precision rule gate before any optional Laya classifier.

The gate never extracts skills, creates evidence or changes the Orbe API. An
unmatched/contradictory clause abstains instead of guessing an employment claim.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re

ROLES = frozenset(("mandatory", "desirable", "alternative", "context", "negated", "uncertain"))
RELATIONS = frozenset(("candidate_requirement", "company_stack", "future_stack", "project_claim", "unrelated"))
CLAUSE_BOUNDARY = re.compile(
    r"[;!?]\s+|\.(?=\s|$)\s+|,\s*(?:mas|por[eé]m|contudo|but|however)\s+|,\s*(?=n[aã]o\s+\w+)",
    re.IGNORECASE,
)
COMPANY = re.compile(r"\b(?:usamos|utilizamos|a\s+empresa\s+usa|a\s+equipe\s+utiliza|stack\s+atual|our\s+team\s+uses|we\s+use)\b", re.IGNORECASE)
FUTURE = re.compile(r"\b(?:poder[aá]\s+ser\s+utilizad[oa]|projetos?\s+futuros?|no\s+futuro|future\s+projects?|planned\s+stack)\b", re.IGNORECASE)
PROJECT = re.compile(r"\b(?:pedro\s+usou|pedro\s+utilizou|phasscode\s+platform\s*\?|in\s+the\s+project)\b", re.IGNORECASE)
NEGATED = re.compile(r"\b(?:n[aã]o\s+(?:exigimos?|precisamos?\s+de|precisa\s+de|[eé]\s+(?:necess[aá]ri[oa]|requisito)|requeremos?)|not\s+required|not\s+needed|no\s+experience\s+required)\b", re.IGNORECASE)
NOT_SUFFICIENT = re.compile(r"\b(?:n[aã]o\s+[eé]\s+suficiente|not\s+sufficient)\b", re.IGNORECASE)
DESIRABLE = re.compile(r"\b(?:diferencia(?:l|is)|desej[aá]ve(?:l|is)|nice-to-have|optional|preferred)\b", re.IGNORECASE)
MANDATORY = re.compile(r"\b(?:requisitos?|obrigat[oó]ri[oa]s?|exig(?:e|ida?|imos?)|precisamos|buscamos|contrataremos|aceitamos|requerid[oa]s?|required|must\s+have|experience\s+with|experi[eê]ncia\s+em|familiarizad[oa]s?)\b", re.IGNORECASE)
ALTERNATIVE = re.compile(r"\b(?:ou|or)\b", re.IGNORECASE)


def enclosing_clause(text: str, start: int, end: int) -> str:
    """Return only the localized clause containing the literal offset range."""
    previous = 0
    for match in CLAUSE_BOUNDARY.finditer(text):
        if start >= previous and end <= match.start():
            return text[previous:match.start()].strip()
        previous = match.end()
    if start >= previous and end <= len(text):
        return text[previous:].strip()
    return ""  # Boundary cuts the span: do not infer from partial context.


def classify(text: str, start: int, end: int, literal: str) -> dict:
    """Fail closed: abstention is a *decision*, not evidence of an unrelated skill."""
    if (not isinstance(text, str) or not isinstance(literal, str)
            or not isinstance(start, int) or isinstance(start, bool)
            or not isinstance(end, int) or isinstance(end, bool)
            or start < 0 or end <= start or end > len(text) or text[start:end] != literal):
        raise ValueError("SEMANTIC_UNGROUNDED_SPAN")
    clause = enclosing_clause(text, start, end)
    role, relation, reason = "uncertain", None, "insufficient_or_conflicting_signals"
    if not clause:
        return {"start": start, "end": end, "role": role, "relation": relation, "reason": reason, "needsClassifier": True}

    # Mixed intents without a safe local clause boundary must abstain. A
    # company using X and demanding Y in one clause does not make both skills
    # company_stack or both mandatory.
    contextual = bool(PROJECT.search(clause) or FUTURE.search(clause) or COMPANY.search(clause))
    if contextual and (MANDATORY.search(clause) or DESIRABLE.search(clause) or NEGATED.search(clause)):
        return {"start": start, "end": end, "role": role, "relation": relation,
                "reason": "mixed_context_and_requirement", "needsClassifier": True}
    if DESIRABLE.search(clause) and ALTERNATIVE.search(literal):
        return {"start": start, "end": end, "role": role, "relation": relation,
                "reason": "alternative_priority_ambiguous", "needsClassifier": True}

    # These are not requirements, regardless of a technology name's similarity.
    if PROJECT.search(clause):
        role, relation, reason = "context", "project_claim", "explicit_project_context"
    elif FUTURE.search(clause):
        role, relation, reason = "context", "future_stack", "explicit_future_context"
    elif COMPANY.search(clause):
        role, relation, reason = "context", "company_stack", "explicit_company_stack"
    elif NOT_SUFFICIENT.search(clause):
        role, relation, reason = "context", "unrelated", "insufficiency_is_not_requirement"
    else:
        negated = bool(NEGATED.search(clause) or re.fullmatch(
            r"(?:n[aã]o|not)\s+" + re.escape(literal) + r"\s*[.!?]?",
            clause.strip(), re.IGNORECASE))
        desirable = bool(DESIRABLE.search(clause))
        mandatory = bool(MANDATORY.search(clause))
        if negated and not desirable:
            role, relation, reason = "negated", "candidate_requirement", "explicit_negation"
        elif desirable and not mandatory:
            role, relation, reason = "desirable", "candidate_requirement", "explicit_optional_requirement"
        elif mandatory and not desirable and not negated:
            role = "alternative" if ALTERNATIVE.search(literal) else "mandatory"
            relation, reason = "candidate_requirement", "explicit_requirement"
        elif desirable and mandatory and re.search(r"\b(?:ter\s+experi[eê]ncia|experience\s+with)\b", clause, re.IGNORECASE):
            # A 'nice to have experience' may contain a generic experience cue.
            if not re.search(r"\b(?:obrigat[oó]ri[oa]|required|must\s+have|exige)\b", clause, re.IGNORECASE):
                role, relation, reason = "desirable", "candidate_requirement", "explicit_optional_requirement"
    return {"start": start, "end": end, "role": role, "relation": relation,
            "reason": reason, "needsClassifier": role == "uncertain"}


def evaluate_fixture(fixture: dict) -> dict:
    if (fixture.get("schemaVersion") != "semantic-hybrid-corpus-v0"
            or fixture.get("reviewStatus") != "draft_not_human_approved"
            or fixture.get("provenance") != "synthetic_examples_only"):
        raise ValueError("SEMANTIC_UNSAFE_OR_UNVERSIONED_FIXTURE")
    cases = fixture.get("cases")
    if not isinstance(cases, list) or not 1 <= len(cases) <= 256:
        raise ValueError("SEMANTIC_INVALID_CASES")
    n = resolved = role_ok = relation_ok = joint_ok = 0
    mismatch_ids = []
    by_role: dict[str, dict[str, int]] = {}
    for case in cases:
        if not isinstance(case.get("text"), str) or len(case["text"]) > 3000:
            raise ValueError("SEMANTIC_INVALID_CASE_TEXT")
        for index, annotation in enumerate(case["annotations"]):
            if annotation["role"] not in ROLES or annotation["relation"] not in RELATIONS:
                raise ValueError("SEMANTIC_UNRECOGNIZED_DRAFT_LABEL")
            decision = classify(case["text"], annotation["start"], annotation["end"], annotation["text"])
            n += 1
            group = by_role.setdefault(annotation["role"], {"total": 0, "resolved": 0, "jointCorrect": 0})
            group["total"] += 1
            if decision["needsClassifier"]:
                continue
            resolved += 1
            group["resolved"] += 1
            r = decision["role"] == annotation["role"]
            a = decision["relation"] == annotation["relation"]
            role_ok += int(r)
            relation_ok += int(a)
            joint_ok += int(r and a)
            group["jointCorrect"] += int(r and a)
            if not (r and a):
                mismatch_ids.append(f"{case['id']}:{index}")
    return {
        "reportVersion": "semantic-typed-rule-gate-v0",
        "scope": "offline_presegmented_synthetic_spans_only",
        "reviewStatus": "draft_not_human_approved",
        "totalSpans": n,
        "resolved": resolved,
        "abstained": n - resolved,
        "resolvedCoverage": round(resolved / n, 4) if n else 0,
        "roleCorrectAmongResolved": role_ok,
        "relationCorrectAmongResolved": relation_ok,
        "jointCorrectAmongResolved": joint_ok,
        "jointAccuracyAmongResolved": round(joint_ok / resolved, 4) if resolved else None,
        "jointRecallAcrossAllSpans": round(joint_ok / n, 4) if n else 0,
        "mismatchIds": mismatch_ids,
        "byDraftRole": by_role,
        "modelLoaded": False,
        "externalLlmCalls": 0,
        "graphQueries": 0,
        "publicOrbeChanged": False,
        "limitations": [
            "Rule patterns were crafted after observing draft examples; results are in-sample",
            "No automatic span extraction, confidence calibration, project evidence or live data",
            "Uncertain clauses MUST remain visible to the canonical parser, not silently dropped",
            "No automatic Laya fallback or production/shadow integration is authorized",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixture", type=Path, default=Path("evaluation/semantic-hybrid-corpus-v0.json"))
    args = parser.parse_args()
    print(json.dumps(evaluate_fixture(json.loads(args.fixture.read_text(encoding="utf-8"))),
                     ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, KeyError, TypeError, OSError) as exc:
        # Never log fixture text (even when inputs are accidentally misconfigured).
        raise SystemExit(f"SEMANTIC_TYPED_RULE_LAB_FAILED: {type(exc).__name__}") from None
