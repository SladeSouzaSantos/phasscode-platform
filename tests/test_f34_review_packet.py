"""F3.7: review packet must never masquerade as independently approved gold."""
import copy
import importlib.util
import json
from pathlib import Path
import unittest
ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("review_f37", ROOT / "scripts/validate_f34_review_packet.py")
assert SPEC and SPEC.loader
lab = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(lab)

class ReviewPacketTests(unittest.TestCase):
    def setUp(self):
        self.packet = json.loads(lab.PACKET.read_text())
        self.source_bytes = lab.SOURCE.read_bytes()
        self.annotation_bytes = lab.ANNOTATIONS.read_bytes()
        self.source = json.loads(self.source_bytes)
        self.provisional = json.loads(self.annotation_bytes)

    def check(self, packet=None):
        return lab.validate_packet(packet or self.packet, self.source, self.provisional,
                                   self.source_bytes, self.annotation_bytes)

    def test_all_56_spans_are_pending_human_review(self):
        d = self.check()
        self.assertEqual(d["totalCases"], 9)
        self.assertEqual(d["totalSpans"], 56)
        self.assertEqual(d["counts"]["pendingSpans"], 56)
        self.assertEqual(d["counts"]["unreviewedCases"], 9)
        self.assertFalse(d["goldSetApproved"])
        self.assertFalse(d["independentReviewVerified"])

    def test_cannot_delete_missing_spans_to_claim_coverage(self):
        p = copy.deepcopy(self.packet)
        p["cases"][0]["annotations"].pop()
        with self.assertRaisesRegex(ValueError, "SPAN_COUNT_MISMATCH"):
            self.check(p)

    def test_cannot_reanchor_or_change_provisional_label(self):
        p = copy.deepcopy(self.packet)
        p["cases"][0]["annotations"][0]["end"] += 1
        with self.assertRaisesRegex(ValueError, "SPAN_SOURCE_DRIFT"):
            self.check(p)

    def test_cannot_mark_approved_without_metadata_and_full_coverage(self):
        p = copy.deepcopy(self.packet)
        p["cases"][0]["annotations"][0].update(
            reviewDecision="approved", reviewedRole="mandatory",
            reviewedRelation="candidate_requirement")
        self.assertFalse(self.check(p)["goldSetApproved"])
        for item in p["cases"][0]["annotations"]:
            item.update(reviewDecision="approved", reviewedRole=item["sourceRole"],
                        reviewedRelation=item["sourceRelation"])
        p["cases"][0]["coverage"]["decision"] = "complete"
        p["cases"][0]["coverage"]["notes"] = "Reviewed each line"
        with self.assertRaisesRegex(ValueError, "MISSING_HUMAN_PR_ATTESTATION"):
            self.check(p)

    def test_source_sha_tampering_detected(self):
        p = copy.deepcopy(self.packet)
        p["source"]["gitBlobSha"] = "0" * 40
        with self.assertRaisesRegex(ValueError, "SOURCE_DRIFT"):
            self.check(p)

    def test_cannot_claim_complete_with_missing_omissions(self):
        p = copy.deepcopy(self.packet)
        p["cases"][0]["coverage"].update(
            decision="complete", notes="Needs review", omissions=[{"start": 0, "end": 4,
              "role": "mandatory", "relation": "candidate_requirement", "notes": "omitted"}])
        with self.assertRaisesRegex(ValueError, "COMPLETE_WITH_OMISSIONS"):
            self.check(p)

if __name__ == "__main__":
    unittest.main()
