"""F3.7/#41/#42: prospective cohort integrity, not human-approved gold."""
import copy
import hashlib
import json
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]
CORPUS = ROOT / "evaluation/semantic-embedding-prospective-v1.json"
MANIFEST = ROOT / "evaluation/semantic-embedding-prospective-v1.manifest.json"


def verify():
    m = json.loads(MANIFEST.read_text(encoding="utf-8"))
    raw = CORPUS.read_bytes()
    d = json.loads(raw)
    if (m["schemaVersion"] != "semantic-prospective-manifest-v1"
            or m["fixture"] != "evaluation/semantic-embedding-prospective-v1.json"
            or m["humanReviewed"] is not False
            or m["authoredBeforeFirstModelRun"] is not True
            or d["reviewStatus"] != "draft_not_human_approved"
            or d["provenance"] != "synthetic_examples_only"
            or hashlib.sha256(raw).hexdigest() != m["sha256"]):
        raise ValueError("PROSPECTIVE_CHECKSUM_OR_PROVENANCE")
    git_blob = hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()
    if git_blob != m["gitBlobSha"]:
        raise ValueError("PROSPECTIVE_GIT_BLOB_DRIFT")
    known = json.loads((ROOT / "knowledge/ppks/index.json").read_text(encoding="utf-8"))
    labels = {label for section in ("projects", "experiences")
              for record in known[section] for label in record["technologies"]}
    case_ids = set()
    positive, oov, negative = 0, 0, 0
    for case in d["cases"]:
        if case["id"] in case_ids or case["language"] not in ("pt", "en"):
            raise ValueError("PROSPECTIVE_DUPLICATE_CASE")
        case_ids.add(case["id"])
        if len(case["annotations"]) != 1:
            raise ValueError("PROSPECTIVE_UNEXPECTED_SPAN_COUNT")
        ann = case["annotations"][0]
        if ann["start"] != 0 or ann["end"] != len(case["text"]) or ann["text"] != case["text"]:
            raise ValueError("PROSPECTIVE_UNGROUNDED_SPAN")
        if len(ann["candidateLabels"]) != 1:
            raise ValueError("PROSPECTIVE_UNEXPECTED_LABEL_COUNT")
        if ann["role"] in ("negated", "context"):
            negative += 1
            if ann["priority"] != "none":
                raise ValueError("PROSPECTIVE_NEGATIVE_PROMOTION")
        elif ann["role"] == "mandatory" and ann["relation"] == "candidate_requirement":
            if ann["candidateLabels"][0] in labels:
                positive += 1
            else:
                oov += 1
        else:
            raise ValueError("PROSPECTIVE_UNSUPPORTED_ROLE")
    if (len(case_ids), positive, oov, negative) != (
        m["caseCount"], m["inCatalogLabels"], m["outOfCatalogLabels"],
        m["contextOrNegatedCases"]
    ):
        raise ValueError("PROSPECTIVE_DENOMINATOR_MISMATCH")
    return d, m


class ProspectiveCohortTests(unittest.TestCase):
    def test_checksum_and_source_blob_pinned(self):
        d, m = verify()
        self.assertEqual(len(d["cases"]), 44)
        self.assertEqual(m["inCatalogLabels"], 34)
        self.assertEqual(m["outOfCatalogLabels"], 6)
        self.assertEqual(m["contextOrNegatedCases"], 4)

    def test_not_human_gold_or_verified_candidate_claim(self):
        d, m = verify()
        self.assertFalse(m["humanReviewed"])
        self.assertEqual(d["reviewStatus"], "draft_not_human_approved")
        self.assertEqual(m["scope"], "synthetic_prospective_ranking_not_candidate_claims")
        self.assertFalse(any("verifiedCandidate" in c for c in d["cases"]))

    def test_pt_en_and_hard_negatives_are_present(self):
        d, _ = verify()
        self.assertEqual({c["language"] for c in d["cases"]}, {"pt", "en"})
        ids = [c["id"] for c in d["cases"]]
        self.assertEqual(sum("-par-" in x for x in ids), 26)
        self.assertEqual(sum("-explicit-" in x for x in ids), 8)
        self.assertEqual(sum("-oov-" in x for x in ids), 6)
        self.assertEqual(sum("-context-" in x or "-negation-" in x or "-project-" in x for x in ids), 4)

    def test_contained_data_is_synthetic_only(self):
        d, _ = verify()
        self.assertTrue(all(len(c["text"]) <= 200 for c in d["cases"]))
        self.assertTrue(all(not c.get("turns") for c in d["cases"]))


if __name__ == "__main__":
    unittest.main()
