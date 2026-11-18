"""Exercise local reviews through the same CLI used by an installed skill."""

from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "scripts/notebook.py"


class NotebookTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.folder = Path(temporary.name)
        self.market = {
            "source": "https://example.org/guide/restore", "pattern": "restore-selection",
            "product": "Example", "checked": "2026-04-15", "observation": "Restore the selected items.",
            "conditions": "The original destination is known.", "tags": ["recovery"]
        }
        self.manifest = self.folder / "review.json"
        self.html = self.folder / "draft.html"
        self.write_review()

    def write_review(self):
        self.manifest.write_text(json.dumps({"market": [self.market], "proposals": [
            {"title": "Private case title", "tags": ["recovery"]}
        ]}), encoding="utf-8")
        self.html.write_text("<html><body>{{id:1}} Private draft</body></html>", encoding="utf-8")

    def cli(self, *args, success=True):
        result = subprocess.run([sys.executable, SCRIPT, *args], capture_output=True, text=True,
                                env=dict(os.environ, UX_OPPORTUNITIES_HOME=str(self.folder / "notebook")))
        if success:
            self.assertEqual(result.returncode, 0, result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0)
        return result.stdout.strip() if success else result.stderr.strip()

    def save(self, project="alpha", run="one"):
        return self.cli("save", project, run, self.manifest, self.html)

    def test_adoption_stays_pending_until_result_and_search_keeps_private_data_in_its_case(self):
        # Arrange
        self.save()
        self.cli("feedback", "alpha/one/1", "Customer X agreed.", "--decision", "adopted")
        self.assertTrue(json.loads(self.cli("history", "alpha"))[0]["pending"])

        # Act
        args = ("feedback", "alpha/one/1", "Customer X could no longer find the action.",
                "--outcome", "worsened", "--lesson", "Hidden recovery controls were missed.",
                "--conditions", "Recovery is an infrequent task.")
        self.cli(*args)
        self.cli(*args)

        # Assert
        case = json.loads(self.cli("history", "alpha"))[0]
        self.assertFalse(case["pending"])
        self.assertEqual(len(case["feedback"]), 2)
        self.assertEqual(case["feedback"][0]["outcome"], None)
        self.assertEqual(case["feedback"][1]["note"], "Customer X could no longer find the action.")
        self.assertEqual(json.loads(self.cli("history", "beta")), [])
        shared = self.cli("search", "recovery")
        self.assertNotIn("Customer X", shared)
        self.assertNotIn("Private", shared)
        self.assertNotIn("alpha", shared)
        outcomes = [entry for entry in json.loads(shared) if entry["kind"] == "reported-outcome"]
        self.assertEqual([entry["outcome"] for entry in outcomes], ["worsened"])

    def test_parallel_reviews_reuse_market_evidence_and_exports_survive_file_loss(self):
        # Arrange
        self.assertEqual(json.loads(self.cli("search", "recovery")), [])

        # Act
        with ThreadPoolExecutor(max_workers=3) as pool:
            paths = list(pool.map(self.save, ["alpha", "beta", "alpha"]))
        Path(paths[0]).unlink()
        restored = self.cli("report", "alpha", "one")

        # Assert
        self.assertEqual(restored, paths[0])
        self.assertEqual(paths[0], paths[2])
        self.assertNotEqual(paths[0], paths[1])
        self.assertEqual(Path(restored).read_text(), "<html><body>alpha/one/1 Private draft</body></html>")
        self.assertEqual(len(json.loads(self.cli("search", "recovery"))), 1)
        self.assertEqual(len(json.loads(self.cli("history", "alpha"))), 1)

    def test_reopening_an_earlier_case_preserves_newer_observations_from_the_same_day(self):
        # Arrange
        self.save()
        self.market["observation"] = "Restore previews the selected items first."
        self.write_review()
        self.save("beta", "later")

        # Act
        self.market["observation"] = "Restore the selected items."
        self.write_review()
        self.save()

        # Assert
        shared = json.loads(self.cli("search", "recovery"))
        self.assertEqual([item["observation"] for item in shared], ["Restore previews the selected items first."])

    def test_changed_existing_review_preserves_the_original_report_and_shared_evidence(self):
        # Arrange
        original = Path(self.save())
        self.market["observation"] = "An uncommitted observation."
        self.write_review()
        self.html.write_text("<html>Changed {{id:1}}</html>")

        # Act
        error = self.cli("save", "alpha", "one", self.manifest, self.html, success=False)

        # Assert
        self.assertIn("different content", error)
        self.assertIn("Private draft", original.read_text())
        self.assertNotIn("uncommitted", self.cli("search", "recovery"))

    def test_zero_recommendations_produces_a_readable_report_without_inventing_history(self):
        # Arrange
        self.manifest.write_text('{"market":[],"proposals":[]}')
        self.html.write_text("<html>Only the first screen was available.</html>")

        # Act
        path = Path(self.save())

        # Assert
        self.assertEqual(path.read_text(), "<html>Only the first screen was available.</html>")
        self.assertEqual(json.loads(self.cli("history", "alpha")), [])
        self.assertEqual(json.loads(self.cli("search", "recovery")), [])


if __name__ == "__main__":
    unittest.main()
