"""No-model unit tests for the F3.7/#42 offline semantic ranking evaluator."""
from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "semantic_embedding_lab.py"
SPEC = importlib.util.spec_from_file_location("semantic_embedding_lab", SCRIPT)
assert SPEC and SPEC.loader
lab = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(lab)


def single_case(source, annotations):
    return {
        "schemaVersion": "semantic-hybrid-corpus-v0",
        "reviewStatus": "draft_not_human_approved",
        "cases": [{
            "id": "case-1",
            "text": source,
            "annotations": [
                {
                    "start": source.index(text),
                    "end": source.index(text) + len(text),
                    "text": text,
                    "role": role,
                    "relation": relation,
                    "candidateLabels": labels,
                }
                for text, role, relation, labels in annotations
            ],
        }],
    }


class SemanticEmbeddingLabTests(unittest.TestCase):
    def setUp(self):
        self.catalog = {
            "schemaVersion": "semantic-skill-catalog-v0",
            "skills": [
                {"id": "skill-java", "label": "Java"},
                {"id": "skill-javascript", "label": "JavaScript"},
                {"id": "skill-sql-server", "label": "SQL Server"},
            ],
        }

    def test_manifest_is_immutable_and_allowlisted(self):
        manifest = lab.parse_manifest(
            SCRIPT.parents[1] / "evaluation" / "semantic-embedding-onnx-manifest.json"
        )
        self.assertEqual(manifest["embeddingDimensions"], 1024)
        self.assertEqual(len(manifest["revision"]), 40)
        self.assertEqual(
            {entry["path"] for entry in manifest["files"]},
            lab.MODEL_FILES,
        )

    def test_manifest_rejects_moving_branch_revision(self):
        path = SCRIPT.parents[1] / "evaluation" / "semantic-embedding-onnx-manifest.json"
        data = json.loads(path.read_text())
        data["revision"] = "main"
        with tempfile.TemporaryDirectory() as temp:
            bad = Path(temp) / "manifest.json"
            bad.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError, "MUST_BE_SHA"):
                lab.parse_manifest(bad)

    def test_fails_closed_if_model_files_missing(self):
        manifest = lab.parse_manifest(
            SCRIPT.parents[1] / "evaluation" / "semantic-embedding-onnx-manifest.json"
        )
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaisesRegex(ValueError, "ARTIFACT_MISSING"):
                lab.verify_files(manifest, Path(temp))

    def test_rankings_keep_java_and_javascript_separate(self):
        c = single_case(
            "JavaScript",
            [("JavaScript", "mandatory", "candidate_requirement", ["JavaScript"])],
        )
        result = lab.evaluate_rankings(c, self.catalog, {
            "case-1:0": ["skill-javascript", "skill-java", "skill-sql-server"]
        })
        self.assertEqual(result["hitsAt1"], 1)
        self.assertEqual(result["expectedInCatalog"], 1)
        self.assertEqual(result["top1NotInExpectedLabel"], 0)

    def test_out_of_catalog_is_reported_not_treated_as_missing_claim(self):
        c = single_case(
            "Java ou Kotlin",
            [("Java ou Kotlin", "alternative", "candidate_requirement", ["Java", "Kotlin"])],
        )
        result = lab.evaluate_rankings(c, self.catalog, {
            "case-1:0": ["skill-java", "skill-javascript", "skill-sql-server"]
        })
        self.assertEqual(result["expectedInCatalog"], 1)
        self.assertEqual(result["expectedOutOfCatalog"], 1)
        self.assertEqual(result["hitsAt1"], 1)

    def test_context_not_promoted_to_candidate_requirement(self):
        c = single_case(
            "Nossa stack é JavaScript; buscamos Java.",
            [
                ("JavaScript", "context", "company_stack", ["JavaScript"]),
            ],
        )
        result = lab.evaluate_rankings(c, self.catalog, {})
        self.assertEqual(result["contextOrNegatedSpansQuarantinedByFixture"], 1)
        self.assertEqual(result["candidateSpans"], 0)
        self.assertIsNone(result["recallAt1"])

    def test_rejects_invented_span_and_incomplete_ranking(self):
        c = single_case(
            "Java",
            [("Java", "mandatory", "candidate_requirement", ["Java"])],
        )
        c["cases"][0]["annotations"][0]["text"] = "Go"
        with self.assertRaisesRegex(ValueError, "UNGROUNDED_SPAN"):
            lab.evaluate_rankings(c, self.catalog, {})
        c["cases"][0]["annotations"][0]["text"] = "Java"
        with self.assertRaisesRegex(ValueError, "INCOMPLETE_RANKING"):
            lab.evaluate_rankings(c, self.catalog, {"case-1:0": ["skill-java"]})


if __name__ == "__main__":
    unittest.main()
