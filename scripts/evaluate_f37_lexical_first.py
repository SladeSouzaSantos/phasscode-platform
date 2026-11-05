#!/usr/bin/env python3
"""F3.7/#42: offline lexical-first + ONNX candidate ranking comparison.

NO user/vacancy visitor data; NO role classifier; NO PPKS/Neo4j query; NO LLM.
Model predictions are suggestions for catalog labels, NEVER verified claims.
The annotated oracle only selects evaluation examples; it is not a runtime gate.
"""
from __future__ import annotations
from collections import Counter
import argparse
import hashlib
import json
from pathlib import Path
import re
import sys
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
CORPUS = ROOT / "evaluation/semantic-embedding-prospective-v1.json"
MANIFEST = ROOT / "evaluation/semantic-embedding-prospective-v1.manifest.json"
REVISION = "033028575b040790aef3064b2a045245ee54d238"
GLOSSARY_SHA = "6734b677a4b73b672e929ee8524dc83e4ba9364f252de9adcf32109c4ab0bf60"


def normalized(text: str) -> str:
    s = unicodedata.normalize("NFKD", text).lower()
    s = "".join(c for c in s if not unicodedata.combining(c))
    return " ".join(re.sub(r"[^a-z0-9]+", " ", s).split())


def lexical_candidates(text: str, skills: list[dict]) -> list[str]:
    """Choose longest non-overlapping literal label mentions (not proof of a job requirement)."""
    t = normalized(text)
    matches = []
    for skill in skills:
        lab = normalized(skill["label"])
        if not lab:
            raise ValueError("HYBRID_EMPTY_SKILL")
        pattern = r"(?<![a-z0-9])" + re.escape(lab) + r"(?![a-z0-9])"
        for match in re.finditer(pattern, t):
            matches.append((match.start(), match.end(), skill["id"], len(lab)))
    # An explicit "Docker Swarm" should not also count as a standalone "Docker".
    selected = []
    for start, end, skill_id, length in sorted(matches, key=lambda a: (-a[3], a[0], a[2])):
        if any(not (end <= s or start >= e) for s, e, _ in selected):
            continue
        selected.append((start, end, skill_id))
    return [skill_id for _, _, skill_id in sorted(selected)]


def checked_corpus(path: Path = CORPUS, manifest_path: Path = MANIFEST) -> tuple[dict, dict]:
    m = json.loads(manifest_path.read_text(encoding="utf-8"))
    raw = path.read_bytes()
    if (m.get("schemaVersion") != "semantic-prospective-manifest-v1"
            or m.get("fixture") != "evaluation/semantic-embedding-prospective-v1.json"
            or m.get("humanReviewed") is not False
            or m.get("inCatalogLabels") != 34
            or m.get("outOfCatalogLabels") != 6
            or m.get("contextOrNegatedCases") != 4
            or m.get("caseCount") != 44
            or hashlib.sha256(raw).hexdigest() != m.get("sha256")):
        raise ValueError("HYBRID_FROZEN_CORPUS_MISMATCH")
    d = json.loads(raw)
    if d.get("reviewStatus") != "draft_not_human_approved" or len(d.get("cases", [])) != 44:
        raise ValueError("HYBRID_UNREVIEWED_FIXTURE_REQUIRED")
    return d, m


def report(corpus: dict, manifest: dict, catalog: dict, embeddings: dict, lexical: dict) -> dict:
    if (catalog.get("schemaVersion") != "semantic-skill-catalog-v0"
            or not isinstance(catalog.get("skills"), list)
            or embeddings.get("reportVersion") != "semantic-embedding-onnx-lab-v1"
            or embeddings.get("modelRevision") != REVISION
            or embeddings.get("indexMode") != "label_plus_curated_draft_description"
            or embeddings.get("curatedDescriptionsSha256") != GLOSSARY_SHA
            or lexical.get("reportVersion") != "semantic-hybrid-lexical-baseline-v0"):
        raise ValueError("HYBRID_PROVENANCE_MISMATCH")
    skills = catalog["skills"]
    by_id = {x["id"]: x for x in skills}
    by_label = {normalized(x["label"]): x["id"] for x in skills}
    if len(by_id) != len(skills) or len(by_label) != len(skills):
        raise ValueError("HYBRID_DUPLICATE_PUBLIC_SKILL")
    if len(skills) != 68:
        raise ValueError("HYBRID_CATALOG_VERSION_MISMATCH")
    ranked = embeddings.get("rankingsBySpan")
    if not isinstance(ranked, dict):
        raise ValueError("HYBRID_MISSING_RANKINGS")
    rows = []
    known = 0
    oov = 0
    quarantined = 0
    hits = Counter()
    baseline_hits = Counter()
    first_reciprocal = 0.0
    baseline_reciprocal = 0.0
    literal_priority = 0
    raw_nonreq_mentions = 0
    for c in corpus["cases"]:
        for i, a in enumerate(c["annotations"]):
            if c["text"][a["start"]:a["end"]] != a["text"]:
                raise ValueError("HYBRID_UNGROUNDED_SPAN")
            key = f"{c['id']}:{i}"
            literal = lexical_candidates(a["text"], skills)
            is_candidate = a["relation"] == "candidate_requirement" and a["role"] not in ("context", "negated")
            if not is_candidate:
                if key in ranked:
                    raise ValueError("HYBRID_ORACLE_LEAK_IN_RANKING")
                quarantined += 1
                raw_nonreq_mentions += len(literal)
                continue
            raw = ranked.get(key)
            if not isinstance(raw, list) or len(raw) != len(by_id) or set(raw) != set(by_id):
                raise ValueError("HYBRID_INCOMPLETE_MODEL_RANKING")
            # Lexical-first fixed *before* this run. No learned threshold or changes to the model.
            fused = literal + [sid for sid in raw if sid not in literal]
            expected = {by_label[normalized(lab)] for lab in a["candidateLabels"] if normalized(lab) in by_label}
            unseen = sum(normalized(lab) not in by_label for lab in a["candidateLabels"])
            oov += unseen
            known += len(expected)
            literal_priority += bool(literal)
            for k in (1, 3, 5):
                hits[k] += len(set(fused[:k]).intersection(expected))
                baseline_hits[k] += len(set(raw[:k]).intersection(expected))
            if expected:
                first_reciprocal += 1 / (min(fused.index(sid) for sid in expected) + 1)
                baseline_reciprocal += 1 / (min(raw.index(sid) for sid in expected) + 1)
            rows.append({
                "id": key, "language": c["language"],
                "isOutOfCatalog": len(expected) == 0,
                "literalCandidates": len(literal),
                "lexicalMatchesExpected": len(set(literal).intersection(expected)),
                "fusionTop1Correct": bool(expected and fused[0] in expected),
                "vectorTop1Correct": bool(expected and raw[0] in expected),
                "fusedTop3HitCount": len(set(fused[:3]).intersection(expected)),
                "vectorTop3HitCount": len(set(raw[:3]).intersection(expected)),
                "top1CandidateSource": "literal" if literal else "semantic_untrusted",
                # Suggestions are NEVER accepted as verified candidate evidence.
                "autoVerifiedCandidateClaims": 0,
            })
    if (len(rows), known, oov, quarantined) != (
        manifest["inCatalogLabels"] + manifest["outOfCatalogLabels"],
        manifest["inCatalogLabels"], manifest["outOfCatalogLabels"],
        manifest["contextOrNegatedCases"],
    ):
        raise ValueError("HYBRID_EXPECTED_DENOMINATOR_DRIFT")
    if set(ranked) != {row["id"] for row in rows}:
        raise ValueError("HYBRID_WRONG_COHORT")
    if (lexical["totals"]["cases"] != manifest["caseCount"]
            or lexical["totals"]["expectedInCatalog"] != known
            or lexical["totals"]["expectedOutOfCatalog"] != oov
            or embeddings["totals"]["expectedInCatalog"] != known
            or embeddings["totals"]["expectedOutOfCatalog"] != oov
            or sum(x["vectorTop1Correct"] for x in rows) != embeddings["totals"]["hitsAt1"]):
        raise ValueError("HYBRID_UNPAIRED_DENOMINATORS")

    def ratio(n: int | float, d: int) -> float | None:
        return round(n / d, 4) if d else None

    return {
        "reportVersion": "f37-lexical-first-fusion-diagnostic-v1",
        "modelRevision": REVISION,
        "curatedDescriptionsSha256": GLOSSARY_SHA,
        "corpusSha256": manifest["sha256"],
        "reviewStatus": "synthetic_prospective_not_human_approved",
        "notRuntimeClassification": True,
        "cases": manifest["caseCount"],
        "candidateSpans": len(rows),
        "expectedInCatalog": known,
        "outOfCatalog": oov,
        "oracleQuarantinedContextOrNegations": quarantined,
        "rawLexicalMentionsInContextOrNegations": raw_nonreq_mentions,
        "lexicalPrioritySpanCount": literal_priority,
        "semanticFallbackSpanCount": len(rows) - literal_priority,
        "fusion": {
            "recallAt1": ratio(hits[1], known), "recallAt3": ratio(hits[3], known),
            "recallAt5": ratio(hits[5], known),
            "mrrFirstKnown": ratio(first_reciprocal, len([r for r in rows if not r["isOutOfCatalog"]])),
            "hitsAt1": hits[1], "hitsAt3": hits[3], "hitsAt5": hits[5],
        },
        "onnxEnrichedBaseline": {
            "recallAt1": ratio(baseline_hits[1], known),
            "recallAt3": ratio(baseline_hits[3], known),
            "recallAt5": ratio(baseline_hits[5], known),
            "mrrFirstKnown": ratio(baseline_reciprocal, len([r for r in rows if not r["isOutOfCatalog"]])),
        },
        "lexicalBaseline": {
            "recallAt1": lexical["totals"]["lexicalRecallAt1"],
            "recallAt3": lexical["totals"]["lexicalRecallAt3"],
            "falsePositiveMentions": lexical["totals"]["lexicalFalsePositives"],
        },
        "risk": {
            "oovQueriesWithUngatedVectorSuggestion": sum(r["isOutOfCatalog"] for r in rows),
            "oovQueriesWithLiteralCandidate": sum(r["isOutOfCatalog"] and r["literalCandidates"] > 0 for r in rows),
            "autoVerifiedCandidateClaims": 0,
            "modelCannotDetermineRequirementRole": True,
            "negationsQuarantinedByOracleNotAClassifier": True,
        },
        "casesSummary": rows,  # No text, only synthetic IDs and aggregates.
        "limitations": [
            "Fusion policy is evaluated post hoc on a previously inspected synthetic cohort.",
            "The input spans and candidate requirement labels are oracle annotations, not extracted by the model.",
            "Literal matches and embeddings are only public catalog label suggestions, never proof of a qualification.",
            "No OOV rejection threshold has been calibrated; six vector top1 suggestions remain untrusted.",
            "This is not a blind human gold set, not an HTTP latency test and not a MiniMac benchmark.",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", type=Path, required=True)
    parser.add_argument("--onnx-report", type=Path, required=True)
    parser.add_argument("--lexical-report", type=Path, required=True)
    args = parser.parse_args()
    corpus, manifest = checked_corpus()
    result = report(corpus, manifest, json.loads(args.catalog.read_text(encoding="utf-8")),
                    json.loads(args.onnx_report.read_text(encoding="utf-8")),
                    json.loads(args.lexical_report.read_text(encoding="utf-8")))
    print(json.dumps(result, ensure_ascii=False, sort_keys=True, separators=(",", ":")))
    return 0

if __name__ == "__main__":
    try:
        sys.exit(main())
    except (KeyError, IndexError, TypeError, ValueError, OSError) as exc:
        print(f"F37_HYBRID_COMPARISON_FAILED: {type(exc).__name__}", file=sys.stderr)
        sys.exit(1)
