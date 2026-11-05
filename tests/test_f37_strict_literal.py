"""Independent invariants for restrictive literal-first candidate ranking."""
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("strict_lexical", ROOT / "scripts/f37_strict_literal.py")
assert spec and spec.loader
lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)

SKILLS = [
    {"id": "java", "label": "Java"},
    {"id": "js", "label": "JavaScript"},
    {"id": "docker", "label": "Docker"},
    {"id": "swarm", "label": "Docker Swarm"},
    {"id": "fastapi", "label": "FastAPI"},
    {"id": "python", "label": "Python"},
    {"id": "spring", "label": "Spring Boot"},
    {"id": "react-router", "label": "React Router"},
    {"id": "go", "label": "Go"},
]

class StrictLiteralPolicyTests(unittest.TestCase):
    def test_wrapped_and_exact_literal_are_single_skill_candidates(self):
        for text, expected in (
            ("Java", "java"),
            ("Required: JavaScript", "js"),
            ("Experiência com Docker Swarm.", "swarm"),
            ("Knowledge of React Router", "react-router"),
            ("Spring Boot is required", "spring"),
            ("Must know FastAPI", "fastapi"),
            ("Go", "go"),
        ):
            with self.subTest(text=text):
                self.assertEqual(lab.strict_literal_skill_id(text, SKILLS), expected)

    def test_technology_as_explanation_is_not_promoted(self):
        for text in (
            "Build APIs in Python using FastAPI",
            "Spring Boot simplifies the Java ecosystem",
            "With Java and Spring Boot",
            "JavaScript and Java are different languages",
            "Deploy Docker Swarm on an infrastructure cluster",
            "Knowledge of Java or Kotlin",
            "Experience with Python and REST endpoints",
            "Required Python, React, or Go",
        ):
            with self.subTest(text=text):
                self.assertIsNone(lab.strict_literal_skill_id(text, SKILLS))

    def test_negated_technology_is_never_forced(self):
        for text in (
            "Java is not required",
            "Não é necessário experiência com Docker",
            "Sem Java obrigatório",
            "No Python experience required",
            "Experience with Go is dispensable",
        ):
            with self.subTest(text=text):
                self.assertIsNone(lab.strict_literal_skill_id(text, SKILLS))

    def test_unknown_explicit_requirement_stays_untrusted(self):
        for text in ("Required: Kotlin", "Experiência com Kubernetes", "SQL Server", "Rust"):
            with self.subTest(text=text):
                self.assertIsNone(lab.strict_literal_skill_id(text, SKILLS))

    def test_literal_policy_never_merges_partial_names(self):
        self.assertEqual(lab.strict_literal_skill_id("JavaScript", SKILLS), "js")
        self.assertEqual(lab.strict_literal_skill_id("Java", SKILLS), "java")
        self.assertEqual(lab.strict_literal_skill_id("Docker Swarm", SKILLS), "swarm")
        self.assertIsNone(lab.strict_literal_skill_id("Docker plus Swarm", SKILLS))

    def test_rank_fallback_is_copy_with_no_reordering(self):
        ids = [s["id"] for s in SKILLS]
        ranked = ids[::-1]
        output, force = lab.reorder_candidate_rankings("Experience with Java in the Spring ecosystem", SKILLS, ranked)
        self.assertFalse(force)
        self.assertEqual(output, ranked)
        self.assertIsNot(output, ranked)

    def test_literal_override_never_adds_or_removes_catalog_ids(self):
        ids = [s["id"] for s in SKILLS]
        output, force = lab.reorder_candidate_rankings("Required: Java", SKILLS, ids[::-1])
        self.assertTrue(force)
        self.assertEqual(output[0], "java")
        self.assertEqual(set(output), set(ids))

    def test_malformed_model_rankings_fail_closed(self):
        ids = [s["id"] for s in SKILLS]
        for bad in (ids[:-1], ids[:-1] + ["java"], ids + ["kotlin"]):
            with self.subTest(bad=bad):
                with self.assertRaisesRegex(ValueError, "UNPAIRED"):
                    lab.reorder_candidate_rankings("Java", SKILLS, bad)

    def test_ambiguous_catalog_label_fails_closed(self):
        broken = SKILLS + [{"id": "different", "label": "jáva"}]
        with self.assertRaisesRegex(ValueError, "AMBIGUOUS"):
            lab.strict_literal_skill_id("Java", broken)

if __name__ == "__main__":
    unittest.main()
