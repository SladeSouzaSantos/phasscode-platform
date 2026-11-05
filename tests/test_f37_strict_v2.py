"""Strict cohort comparison must remain paired, synthetic and fail-closed."""
from pathlib import Path
import importlib.util
import json
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
spec=importlib.util.spec_from_file_location("strict_cohort",ROOT/"scripts/evaluate_f37_strict_v2.py")
assert spec and spec.loader
lab=importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)

class StrictCohortTests(unittest.TestCase):
    def test_frozen_manifest_counts_and_policy_commit(self):
        d,m=lab.load_frozen_corpus()
        self.assertEqual(len(d["cases"]),40)
        self.assertEqual(m["inCatalogLabels"],28)
        self.assertEqual(m["outOfCatalogLabels"],8)
        self.assertEqual(m["frozenPolicyCommit"],lab.POLICY_COMMIT)
        self.assertFalse(m["humanReviewed"])

    def test_new_holdout_contains_all_control_categories(self):
        d,_=lab.load_frozen_corpus()
        ids=[x["id"] for x in d["cases"]]
        self.assertEqual(sum("-para-" in x for x in ids),20)
        self.assertEqual(sum("-lit-" in x for x in ids),8)
        self.assertEqual(sum("-oov-" in x for x in ids),8)
        self.assertEqual(sum("-nonreq-" in x for x in ids),4)

    def test_fixture_uses_no_claimed_human_reviewer(self):
        d,_=lab.load_frozen_corpus()
        self.assertEqual(d["reviewStatus"],"draft_not_human_approved")
        self.assertTrue(all("reviewer" not in c for c in d["cases"]))

if __name__=="__main__":
    unittest.main()
