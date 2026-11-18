"""Tests for server/ask.py. Start: python3 -m unittest server/test_ask.py"""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ask  # noqa: E402

DATA = Path(__file__).resolve().parents[1] / "data"


class Context(unittest.TestCase):
    def test_programme_context(self):
        prog = json.loads((DATA / "cis-b.json").read_text())
        ctx = ask.build_context(prog, {"major": "web"}, "en")
        self.assertIn(prog["name"], ctx)
        self.assertIn("Semester 6:", ctx)
        self.assertIn("The viewer picked:", ctx)
        self.assertIn("3D Prototyping and Scripting", ctx)
        self.assertLess(len(ctx), 30000)          # stays cheap per question

    def test_every_programme_builds(self):
        for f in DATA.glob("*.json"):
            if f.name in ("index.json", "checked.json"):
                continue
            prog = json.loads(f.read_text())
            if "courses" in prog:
                self.assertTrue(ask.build_context(prog, {}, "de"))


class Limits(unittest.TestCase):
    def test_quota_detection(self):
        self.assertTrue(ask.is_quota_error(429, ""))
        self.assertTrue(ask.is_quota_error(400, '{"errors":[{"code":4006,"message":"you have used up your daily free allocation of 10,000 neurons"}]}'))
        self.assertFalse(ask.is_quota_error(500, "internal error"))

    def test_per_ip_limit(self):
        ask._hits.clear(); ask._day.update(date="", count=0, quota_until=0)
        for _ in range(ask.PER_IP[0]):
            self.assertIsNone(ask.allow("1.2.3.4", 1000.0))
        self.assertEqual(ask.allow("1.2.3.4", 1001.0), "limit")
        self.assertIsNone(ask.allow("5.6.7.8", 1001.0))


if __name__ == "__main__":
    unittest.main()
