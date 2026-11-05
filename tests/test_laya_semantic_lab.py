"""Offline-only typed decision guardrails for F3.7/#43; no model weights."""
from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "laya_semantic_lab.py"
SPEC = importlib.util.spec_from_file_location("laya_semantic_lab", SCRIPT)
assert SPEC and SPEC.loader
lab = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(lab)


class LayaSemanticLabTests(unittest.TestCase):
    def setUp(self):
        self.manifest = SCRIPT.parents[1] / "evaluation" / "semantic-laya-manifest-v0.json"
        self.fixture = SCRIPT.parents[1] / "evaluation" / "semantic-hybrid-corpus-v0.json"

    def test_model_revision_sdk_and_hashes_are_pinned(self):
        model = lab.load_manifest(self.manifest)
        self.assertEqual(model["repository"], "convaiinnovations/laya-multilingual")
        self.assertEqual(len(model["revision"]), 40)
        self.assertEqual(model["pythonPackage"], "laya==0.4.22")
        self.assertEqual(len(model["verifiedLfsSha256"]), 2)

    def test_model_validation_rejects_unpinned_revision(self):
        model = json.loads(self.manifest.read_text())
        model["revision"] = "main"
        with tempfile.TemporaryDirectory() as tmp:
            file = Path(tmp) / "manifest.json"
            file.write_text(json.dumps(model))
            with self.assertRaisesRegex(ValueError, "UNPINNED_REVISION"):
                lab.load_manifest(file)

    def test_model_validation_fails_closed_on_missing_files(self):
        model = lab.load_manifest(self.manifest)
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(ValueError, "MISSING_OR_SYMLINK_MODEL_FILE"):
                lab.verify_checkpoint(model, Path(tmp))

    def test_synthetic_spans_have_literal_source_offsets(self):
        cases = lab.load_fixture(self.fixture, 64)
        self.assertGreaterEqual(len(cases), 16)
        self.assertEqual(len({entry["id"] for entry in cases}), len(cases))
        self.assertTrue(all(entry["span"] in entry["text"] for entry in cases))

    def test_choice_rejects_missing_or_nonfinite_uncalibrated_confidence(self):
        self.assertEqual(
            lab.validate_choice({"choice": "mandatory", "answer_confidence": 0.9}, lab.ROLES),
            ("mandatory", 0.9),
        )
        with self.assertRaisesRegex(ValueError, "UNKNOWN_CHOICE"):
            lab.validate_choice({"choice": "approved"}, lab.ROLES)
        with self.assertRaisesRegex(ValueError, "INVALID_UNCALIBRATED_CONFIDENCE"):
            lab.validate_choice({"choice": "mandatory", "answer_confidence": float("nan")}, lab.ROLES)

    def test_low_confidence_is_a_diagnostic_abstention_not_factual_evidence(self):
        examples = [{"id": "s:0", "role": "mandatory", "relation": "candidate_requirement"}]
        outputs = [{
            "role": {"choice": "mandatory", "answer_confidence": 0.7},
            "relation": {"choice": "candidate_requirement", "answer_confidence": 0.9},
        }]
        report = lab.summarize(examples, outputs, [12.0])
        self.assertEqual(report["roleAccuracy"], 1)
        self.assertEqual(report["relationAccuracy"], 1)
        self.assertEqual(report["diagnosticAbstentions"], 1)
        self.assertEqual(report["incorrectDespiteHighConfidence"], 0)

    def test_high_confidence_can_still_be_wrong(self):
        examples = [{"id": "s:0", "role": "alternative", "relation": "company_stack"}]
        outputs = [{
            "role": {"choice": "mandatory", "answer_confidence": 0.97},
            "relation": {"choice": "candidate_requirement", "answer_confidence": 0.95},
        }]
        report = lab.summarize(examples, outputs, [17.0])
        self.assertEqual(report["roleAccuracy"], 0)
        self.assertEqual(report["relationAccuracy"], 0)
        self.assertEqual(report["diagnosticAbstentions"], 0)
        self.assertEqual(report["incorrectDespiteHighConfidence"], 1)


if __name__ == "__main__":
    unittest.main()
