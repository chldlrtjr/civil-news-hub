import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import fail_alert


class FailAlertTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.state = os.path.join(self.dir.name, ".cron_fail_state")

    def tearDown(self):
        self.dir.cleanup()

    def run_once(self, current, sent_ok=True):
        """cron_scrape.sh 한 회차: 판정 → 알림을 보냈고 성공했으면 기록"""
        kind = fail_alert.check(self.state, current)
        if kind and sent_ok:
            fail_alert.mark_sent(self.state, current)
        return kind

    def test_single_failure_then_recovery_sends_nothing(self):
        self.assertEqual(self.run_once("contest_scraper.py"), "")
        self.assertEqual(self.run_once(""), "")

    def test_two_in_a_row_alerts_once(self):
        self.assertEqual(self.run_once("contest_scraper.py"), "")
        self.assertEqual(self.run_once("contest_scraper.py"), "fail")
        self.assertEqual(self.run_once("contest_scraper.py"), "")
        self.assertEqual(self.run_once("contest_scraper.py"), "")

    def test_recovery_only_after_alert(self):
        self.run_once("a.py")
        self.run_once("a.py")
        self.assertEqual(self.run_once(""), "recover")
        self.assertEqual(self.run_once(""), "")

    def test_changed_failure_list_needs_two_runs(self):
        self.run_once("a.py")
        self.run_once("a.py")
        self.assertEqual(self.run_once("a.py b.py"), "")
        self.assertEqual(self.run_once("a.py b.py"), "fail")

    def test_send_failure_retries_next_run(self):
        self.run_once("a.py")
        self.assertEqual(self.run_once("a.py", sent_ok=False), "fail")
        self.assertEqual(self.run_once("a.py"), "fail")
        self.assertEqual(self.run_once("a.py"), "")

    def test_legacy_one_line_state_means_already_alerted(self):
        with open(self.state, "w") as f:
            f.write("contest_scraper.py\n")
        self.assertEqual(self.run_once(""), "recover")

    def test_missing_state_and_success_is_quiet(self):
        self.assertEqual(self.run_once(""), "")


if __name__ == "__main__":
    unittest.main()
