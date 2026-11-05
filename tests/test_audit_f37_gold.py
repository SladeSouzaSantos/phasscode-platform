"""F3.7 gold pre-audit, without model calls or unverified truth claims."""
import copy
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("audit_f37_gold", ROOT / "scripts/audit_f37_gold.py")
assert SPEC is not None and SPEC.loader is not None
lab = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(lab)


class GoldPreauditTests(unittest.TestCase):
    def setUp(self):
        import json
        self.source = json.loads((ROOT / "evaluation/vacancies-ppks-v12.json").read_text())
        self.review = json.loads((ROOT / "evaluation/semantic-hybrid-ppks-review-v0.json").read_text())

    def test_all_original_offsets_and_denominators_are_verified(self):
        out = lab.audit(self.source, self.review)
        self.assertEqual(out["cases"], 9)
        self.assertEqual(out["spans"], 56)
        self.assertEqual(out["roleCounts"]["uncertain"], 11)
        self.assertTrue(out["allOffsetsValid"])

    def test_valid_offsets_do_not_assert_gold_or_coverage(self):
        out = lab.audit(self.source, self.review)
        self.assertFalse(out["exhaustiveCoverageEstablished"])
        self.assertEqual(out["humanReviewedSpans"], 0)
        self.assertEqual(out["unreviewedSpans"], 56)
        self.assertTrue(all(item["reviewRequired"] for item in out["caseAudit"]))

    def test_report_does_not_log_original_vacancy_messages(self):
        import json
        output = json.dumps(lab.audit(self.source, self.review))
        for case in self.source["cases"]:
            for turn in case["turns"]:
                self.assertNotIn(turn["message"], output)

    def test_altered_offset_is_rejected(self):
        bad = copy.deepcopy(self.review)
        bad["cases"][0]["spans"][0]["start"] += 1
        with self.assertRaisesRegex(ValueError, "UNGROUNDED"):
            lab.audit(self.source, bad)

    def test_extra_claim_of_human_review_is_not_silently_accepted(self):
        bad = copy.deepcopy(self.review)
        bad["reviewStatus"] = "human_approved"
        with self.assertRaisesRegex(ValueError, "UNEXPECTED_REVIEW_STATUS"):
            lab.audit(self.source, bad)

    def test_missing_case_is_rejected(self):
        bad = copy.deepcopy(self.review)
        bad["cases"].pop()
        with self.assertRaisesRegex(ValueError, "MISSING_CASE"):
            lab.audit(self.source, bad)

    def test_unexplained_uncertainty_is_rejected(self):
        bad = copy.deepcopy(self.review)
        span = next(s for c in bad["cases"] for s in c["spans"] if s["role"] == "uncertain")
        span.pop("uncertainty")
        with self.assertRaisesRegex(ValueError, "UNEXPLAINED_UNCERTAINTY"):
            lab.audit(self.source, bad)


if __name__ == "__main__":
    unittest.main()
