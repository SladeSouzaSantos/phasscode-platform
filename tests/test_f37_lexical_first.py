"""F3.7 lexical-first diagnostic: no hidden acceptance, no role oracle promotion."""
import importlib.util
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("hybrid", ROOT / "scripts/evaluate_f37_lexical_first.py")
assert SPEC and SPEC.loader
lab = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(lab)


class LexicalFirstTests(unittest.TestCase):
    def test_literal_boundaries_and_longest_technology_win(self):
        skills = [
            {"id": "java", "label": "Java"},
            {"id": "javascript", "label": "JavaScript"},
            {"id": "docker", "label": "Docker"},
            {"id": "swarm", "label": "Docker Swarm"},
            {"id": "react", "label": "React"},
            {"id": "react-router", "label": "React Router"},
            {"id": "go", "label": "Go"},
        ]
        self.assertEqual(lab.lexical_candidates("JavaScript with Docker Swarm", skills),
                         ["javascript", "swarm"])
        self.assertEqual(lab.lexical_candidates("React Router is required", skills),
                         ["react-router"])
        self.assertEqual(lab.lexical_candidates("Google is hiring", skills), [])
        self.assertEqual(lab.lexical_candidates("JavaScript is not Java", skills),
                         ["javascript", "java"])
        # Literal matching is NOT a role/negation classifier.

    def test_corpus_hash_is_frozen(self):
        corpus, manifest = lab.checked_corpus()
        self.assertEqual(len(corpus["cases"]), 44)
        self.assertEqual(manifest["inCatalogLabels"], 34)
        self.assertEqual(manifest["outOfCatalogLabels"], 6)

    def fixture(self):
        corpus, manifest = lab.checked_corpus()
        public = json.loads((ROOT / "knowledge/ppks/index.json").read_text(encoding="utf-8"))
        labels = sorted({lab.normalized(x): x for kind in ("projects", "experiences")
                         for node in public[kind] for x in node["technologies"]}.values())
        skills = [{"id": f"skill-{i}", "label": name} for i, name in enumerate(labels)]
        ids = [s["id"] for s in skills]
        by_label = {lab.normalized(s["label"]): s["id"] for s in skills}
        rankings = {}
        baseline_hits = 0
        for c in corpus["cases"]:
            for i, a in enumerate(c["annotations"]):
                if a["role"] in ("context", "negated"):
                    continue
                key = f"{c['id']}:{i}"
                # All mock predictions are wrong-or-arbitrary; tests verify the
                # scorer mechanics, not actual ONNX quality.
                rankings[key] = list(ids)
                gold = by_label.get(lab.normalized(a["candidateLabels"][0]))
                if gold == ids[0]:
                    baseline_hits += 1
        model = {
            "reportVersion": "semantic-embedding-onnx-lab-v1",
            "modelRevision": lab.REVISION,
            "indexMode": "label_plus_curated_draft_description",
            "curatedDescriptionsSha256": lab.GLOSSARY_SHA,
            "rankingsBySpan": rankings,
            "totals": {"expectedInCatalog": 34, "expectedOutOfCatalog": 6,
                       "hitsAt1": baseline_hits},
        }
        lexical = {
            "reportVersion": "semantic-hybrid-lexical-baseline-v0",
            "totals": {"cases": 44, "expectedInCatalog": 34, "expectedOutOfCatalog": 6,
                       "lexicalRecallAt1": 0.0, "lexicalRecallAt3": 0.0,
                       "lexicalFalsePositives": 0},
        }
        return corpus, manifest, {"schemaVersion": "semantic-skill-catalog-v0", "skills": skills}, model, lexical

    def test_model_agnostic_hybrid_retains_oov_and_legacy_context(self):
        args = self.fixture()
        result = lab.report(*args)
        self.assertEqual(result["candidateSpans"], 40)
        self.assertEqual(result["expectedInCatalog"], 34)
        self.assertEqual(result["outOfCatalog"], 6)
        self.assertEqual(result["oracleQuarantinedContextOrNegations"], 4)
        self.assertEqual(result["risk"]["oovQueriesWithUngatedVectorSuggestion"], 6)
        self.assertEqual(result["risk"]["autoVerifiedCandidateClaims"], 0)
        self.assertTrue(result["notRuntimeClassification"])

    def test_literal_priority_cannot_create_verification(self):
        result = lab.report(*self.fixture())
        rows = result["casesSummary"]
        explicit = [r for r in rows if "-explicit-" in r["id"]]
        self.assertEqual(len(explicit), 8)
        self.assertTrue(all(r["top1CandidateSource"] == "literal" for r in explicit))
        self.assertTrue(all(r["autoVerifiedCandidateClaims"] == 0 for r in rows))
        self.assertFalse(any("sourceText" in row or "candidateProven" in row for row in rows))

    def test_missing_or_reordered_model_labels_are_rejected(self):
        args = list(self.fixture())
        args[3]["rankingsBySpan"]["pt-par-react:0"].pop()
        with self.assertRaisesRegex(ValueError, "INCOMPLETE_MODEL_RANKING"):
            lab.report(*args)

    def test_provenance_and_mismatched_denominators_rejected(self):
        args = list(self.fixture())
        args[3]["curatedDescriptionsSha256"] = "wrong"
        with self.assertRaisesRegex(ValueError, "PROVENANCE_MISMATCH"):
            lab.report(*args)
        args = list(self.fixture())
        args[4]["totals"]["expectedInCatalog"] = 33
        with self.assertRaisesRegex(ValueError, "UNPAIRED_DENOMINATORS"):
            lab.report(*args)


if __name__ == "__main__":
    unittest.main()
