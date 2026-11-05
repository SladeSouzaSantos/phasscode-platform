"""F3.7 offline paired-evaluation security, dataset freezing and denominator tests."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
SPEC = importlib.util.spec_from_file_location("compare_semantic_typed_lab", ROOT / "scripts/compare_semantic_typed_lab.py")
assert SPEC is not None and SPEC.loader is not None
lab = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(lab)


class ControlledComparisonTests(unittest.TestCase):
    def setUp(self):
        self.manifest, self.examples = lab.load_frozen_holdout()

    def test_frozen_corpus_has_expected_count_and_languages(self):
        self.assertEqual(len(self.examples), 47)
        self.assertEqual(len({e["id"] for e in self.examples}), len(self.examples))
        self.assertEqual({e["language"] for e in self.examples}, {"pt", "en"})

    def test_same_draft_fixture_yields_reproducible_diagnostic(self):
        r1 = lab.evaluate()
        r2 = lab.evaluate()
        self.assertEqual(r1, r2)
        self.assertEqual(r1["denominator"], 47)
        self.assertEqual(r1["rules"]["total"], 47)
        self.assertEqual(r1["rules"]["resolved"] + r1["rules"]["abstained"], 47)
        self.assertEqual(r1["laya"]["status"], "not_executed_on_this_cohort")

    def test_first_run_safety_failure_is_visible_not_covered_up(self):
        metrics = lab.evaluate()["rules"]
        self.assertEqual(metrics["falseRequirementPromotions"], 3)
        self.assertEqual(metrics["negationPromotions"], 2)
        self.assertGreater(metrics["jointErrorsAmongResolved"], 0)
        self.assertLess(metrics["jointPrecisionAmongResolved"], 1)

    def test_abstention_is_never_scored_as_correct(self):
        rows = [dict(id="case:0", language="en", expectedRole="mandatory",
                     expectedRelation="candidate_requirement", predictedRole="uncertain",
                     predictedRelation=None, abstained=True)]
        result = lab.scored(rows, "mock")
        self.assertEqual(result["resolved"], 0)
        self.assertIsNone(result["jointPrecisionAmongResolved"])
        self.assertEqual(result["effectiveJointRecall"], 0)

    def test_diagnostics_do_not_reprint_private_like_text(self):
        report = json.dumps(lab.evaluate())
        for e in self.examples:
            self.assertNotIn(e["text"], report)
        self.assertNotIn("expressao_destacada", report)

    def test_manifest_detects_in_place_fixture_mutation(self):
        with tempfile.TemporaryDirectory() as d:
            folder = Path(d)
            shutil.copy(ROOT / "evaluation/semantic-typed-holdout-v1.manifest.json", folder)
            source = (ROOT / "evaluation/semantic-typed-holdout-v1.json").read_text(encoding="utf-8")
            (folder / "semantic-typed-holdout-v1.json").write_text(source + " ", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "FROZEN_CORPUS_CHANGED"):
                lab.load_frozen_holdout(folder / "semantic-typed-holdout-v1.manifest.json")

    def mock_laya_report(self):
        cases = [{"id": e["id"], "expectedRole": e["role"], "predictedRole": e["role"],
                  "expectedRelation": e["relation"], "predictedRelation": e["relation"],
                  "diagnosticAbstention": False} for e in self.examples]
        return {"reportVersion": "laya-typed-decision-lab-v0",
                "reviewStatus": "draft_not_human_approved", "policy": "no_active_or_shadow_promotion",
                "modelRevision": "a" * 40, "fixtureSha256": self.manifest["sha256"],
                "metrics": {"cases": cases}}

    def with_report(self, report):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "laya.json"
            path.write_text(json.dumps(report), encoding="utf-8")
            return lab.evaluate(laya_report=path)

    def test_paired_laya_same_ids_is_comparable_without_model(self):
        result = self.with_report(self.mock_laya_report())
        self.assertEqual(result["laya"]["total"], result["rules"]["total"])
        self.assertEqual(result["laya"]["jointPrecisionAmongResolved"], 1)
        # This is MOCK input validating the comparator only; no model accuracy.

    def test_reject_different_fixture_digest_even_if_ids_match(self):
        report = self.mock_laya_report()
        report["fixtureSha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "INCOMPATIBLE_REPORT"):
            self.with_report(report)

    def test_reject_incomplete_laya_report(self):
        report = self.mock_laya_report()
        report["metrics"]["cases"].pop()
        with self.assertRaisesRegex(ValueError, "DENOMINATOR_MISMATCH"):
            self.with_report(report)

    def test_reject_duplicate_sample_id(self):
        report = self.mock_laya_report()
        report["metrics"]["cases"][1]["id"] = report["metrics"]["cases"][0]["id"]
        with self.assertRaisesRegex(ValueError, "DUPLICATE_ID"):
            self.with_report(report)

    def test_reject_changed_gold_annotations(self):
        report = self.mock_laya_report()
        report["metrics"]["cases"][0]["expectedRole"] = "uncertain"
        with self.assertRaisesRegex(ValueError, "LABEL_DRIFT"):
            self.with_report(report)

    def test_reject_bogus_laya_prediction_or_non_boolean_abstention(self):
        report = self.mock_laya_report()
        report["metrics"]["cases"][0]["predictedRole"] = "verified_experience"
        with self.assertRaisesRegex(ValueError, "LABEL_DRIFT"):
            self.with_report(report)
        report = self.mock_laya_report()
        report["metrics"]["cases"][0]["diagnosticAbstention"] = "false"
        with self.assertRaisesRegex(ValueError, "LABEL_DRIFT"):
            self.with_report(report)

    def test_false_requirement_promotion_is_separately_counted(self):
        rows = [dict(id="unsafe:0", language="pt", expectedRole="negated",
                     expectedRelation="candidate_requirement", predictedRole="mandatory",
                     predictedRelation="candidate_requirement", abstained=False)]
        result = lab.scored(rows, "mock")
        self.assertEqual(result["falseRequirementPromotions"], 1)
        self.assertEqual(result["negationPromotions"], 1)
        self.assertEqual(result["jointErrorsAmongResolved"], 1)


if __name__ == "__main__":
    unittest.main()
