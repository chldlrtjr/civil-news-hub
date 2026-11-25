"""sync_to_notion: 토큰은 환경변수로만 받고(명령행 인자는 ps·셸 기록에 남아요), 모든 요청에 timeout"""
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import sync_to_notion as stn


class TokenSourceTest(unittest.TestCase):
    def test_token_argument_is_not_used(self):
        with mock.patch.dict(os.environ, {}, clear=True), \
                mock.patch.object(sys, "argv", ["sync_to_notion.py", "secret_from_argv"]), \
                mock.patch.object(stn, "clear_existing_blocks") as clear, \
                mock.patch.object(stn, "append_blocks_to_notion") as append:
            with self.assertRaises(SystemExit):
                stn.main()
        clear.assert_not_called()
        append.assert_not_called()

    def test_env_token_still_works(self):
        with mock.patch.dict(os.environ, {"NOTION_TOKEN": "t"}, clear=True), \
                mock.patch.object(sys, "argv", ["sync_to_notion.py", "--append"]), \
                mock.patch.object(stn, "clear_existing_blocks") as clear, \
                mock.patch.object(stn, "append_blocks_to_notion", return_value=True) as append:
            stn.main()
        clear.assert_not_called()  # --append 는 그대로
        self.assertEqual(append.call_args.args[0], "t")


class TimeoutTest(unittest.TestCase):
    def test_every_urlopen_has_timeout(self):
        calls = []

        def fake(req, *a, **kw):
            calls.append(kw)
            raise OSError("offline")

        with mock.patch.object(stn.urllib.request, "urlopen", side_effect=fake):
            stn.clear_existing_blocks("t", "page")
            stn.append_blocks_to_notion("t", "page", [{"x": 1}])
        self.assertTrue(calls)
        for kw in calls:
            self.assertIn("timeout", kw)


if __name__ == "__main__":
    unittest.main()
