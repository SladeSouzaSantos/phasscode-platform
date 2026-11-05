"""Standard-library regression tests for the offline F3.7 high-precision rule gate."""
from __future__ import annotations
import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "semantic_typed_rules_lab.py"
SPEC = importlib.util.spec_from_file_location("semantic_typed_rules_lab", SCRIPT)
assert SPEC and SPEC.loader
lab = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(lab)


def decide(text, literal, occurrence=0):
    start = -1
    for _ in range(occurrence + 1):
        start = text.index(literal, start + 1)
    return lab.classify(text, start, start + len(literal), literal)


class TypedRulesTests(unittest.TestCase):
    def check(self, text, literal, role, relation, occurrence=0):
        result = decide(text, literal, occurrence)
        self.assertEqual((result["role"], result["relation"]), (role, relation))
        self.assertEqual(result["needsClassifier"], role == "uncertain")

    def test_alternatives_and_section_headers(self):
        t = "Requisitos: Java ou Kotlin. Diferenciais: React."
        self.check(t, "Java ou Kotlin", "alternative", "candidate_requirement")
        self.check(t, "React", "desirable", "candidate_requirement")

    def test_two_distinct_company_and_requirement_clauses(self):
        t = "Usamos Go internamente, mas precisamos de Java."
        self.check(t, "Go", "context", "company_stack")
        self.check(t, "Java", "mandatory", "candidate_requirement")

    def test_never_promote_future_stack(self):
        t = "Go poderá ser utilizado em projetos futuros. Experiência atual com Docker é obrigatória."
        self.check(t, "Go", "context", "future_stack")
        self.check(t, "Docker", "mandatory", "candidate_requirement")

    def test_negation_is_not_positive_requirement(self):
        t = "Não exigimos Kotlin. Java é desejável."
        self.check(t, "Kotlin", "negated", "candidate_requirement")
        self.check(t, "Java", "desirable", "candidate_requirement")

    def test_negated_not_required_not_assumed(self):
        self.check("Não precisa de experiência com AWS. Docker é obrigatório.", "AWS", "negated", "candidate_requirement")

    def test_java_javascript_boundary(self):
        t = "Experiência em JavaScript, não Java."
        self.check(t, "JavaScript", "mandatory", "candidate_requirement")
        self.check(t, "Java", "negated", "candidate_requirement", occurrence=1)

    def test_sql_not_sufficient_not_required(self):
        t = "SQL Server é requisito obrigatório; SQL genérico não é suficiente."
        self.check(t, "SQL Server", "mandatory", "candidate_requirement")
        self.check(t, "SQL genérico", "context", "unrelated")

    def test_project_attribution_not_experience(self):
        self.check("Pedro usou Flutter no backend PHASSCODE Platform?", "Flutter", "context", "project_claim")

    def test_english_modalities(self):
        t = "Experience with Java or Kotlin is required. Docker is a nice-to-have."
        self.check(t, "Java or Kotlin", "alternative", "candidate_requirement")
        self.check(t, "Docker", "desirable", "candidate_requirement")

    def test_unclear_is_abstention_not_fake_requirement(self):
        self.check("Java e Python fazem parte da discussão.", "Java", "uncertain", None)

    def test_conflict_abstains(self):
        self.check("Docker é obrigatório e também desejável.", "Docker", "uncertain", None)

    def test_reject_ungrounded_span(self):
        with self.assertRaisesRegex(ValueError, "UNGROUNDED"):
            lab.classify("Java é obrigatório", 0, 4, "Go")
        with self.assertRaisesRegex(ValueError, "UNGROUNDED"):
            lab.classify("Java", True, 4, "Java")

    def test_non_synthetic_fixture_rejected(self):
        with self.assertRaisesRegex(ValueError, "UNSAFE_OR_UNVERSIONED"):
            lab.evaluate_fixture({"schemaVersion": "semantic-hybrid-corpus-v0", "reviewStatus": "approved", "provenance": "visitors", "cases": []})

    def test_report_contains_only_ids_not_text(self):
        fixture = {"schemaVersion": "semantic-hybrid-corpus-v0", "reviewStatus": "draft_not_human_approved", "provenance": "synthetic_examples_only", "cases": [{"id": "one", "text": "Java é obrigatório.", "annotations": [{"start": 0, "end": 4, "text": "Java", "role": "mandatory", "relation": "candidate_requirement"}]}]}
        report = lab.evaluate_fixture(fixture)
        self.assertEqual((report["resolved"], report["jointCorrectAmongResolved"]), (1, 1))
        self.assertNotIn("Java é obrigatório", str(report))


if __name__ == "__main__":
    unittest.main()
