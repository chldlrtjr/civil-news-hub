"""kakao_auth_receiver: 토큰 재발급용 로컬 수신 서버 하드닝 검사"""
import os
import sys
import threading
import unittest
import urllib.error
import urllib.parse
import urllib.request
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import kakao_auth_receiver as kar


class _Res:
    def __init__(self, data, status=200):
        self._data, self.status_code, self.text = data, status, "ok"

    def json(self):
        return self._data


class ReceiverTest(unittest.TestCase):
    def setUp(self):
        self.httpd = kar.make_server(0)
        self.port = self.httpd.server_address[1]
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.state_patch = mock.patch.object(kar, "STATE", "good-state")
        self.state_patch.start()

    def tearDown(self):
        self.state_patch.stop()
        self.httpd.shutdown()
        self.httpd.server_close()

    def _get(self, path, method="GET"):
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}{path}", method=method)
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                return r.status, r.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode("utf-8", "replace")

    def _cb(self, code="c", state="good-state"):
        return "/?" + urllib.parse.urlencode({"code": code, "state": state})

    def test_binds_loopback_only(self):
        self.assertEqual(self.httpd.server_address[0], "127.0.0.1")

    def test_does_not_serve_files(self):
        status, body = self._get("/kakao_auth_receiver.py")
        self.assertNotEqual(status, 200)
        self.assertNotIn("import", body)
        status, _ = self._get("/kakao_auth_receiver.py", method="HEAD")
        self.assertNotEqual(status, 200)

    def test_wrong_or_missing_state_rejected_without_token_request(self):
        with mock.patch.object(kar.requests, "post") as post:
            self.assertEqual(self._get(self._cb(state="bad"))[0], 400)
            self.assertEqual(self._get("/?code=c")[0], 400)
        post.assert_not_called()

    def test_error_message_is_escaped(self):
        with mock.patch.object(kar.requests, "post",
                               return_value=_Res({"error_description": "<script>alert(1)</script>"})):
            status, body = self._get(self._cb())
        self.assertEqual(status, 500)
        self.assertNotIn("<script>", body)
        self.assertIn("&lt;script&gt;", body)

    def test_success_saves_via_notifier_with_timeouts(self):
        tokens = {"access_token": "a", "refresh_token": "r"}
        with mock.patch.object(kar.requests, "post", return_value=_Res(tokens)) as post, \
                mock.patch.object(kar.kakao_notifier, "save_tokens") as save, \
                mock.patch.object(kar, "server_instance", None):
            status, _ = self._get(self._cb())
        self.assertEqual(status, 200)
        save.assert_called_once_with(tokens)
        self.assertTrue(post.call_args_list)
        for call in post.call_args_list:
            self.assertIn("timeout", call.kwargs)

    def test_auth_url_carries_state(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(kar.build_auth_url("st8")).query)
        self.assertEqual(q["state"], ["st8"])
        self.assertEqual(q["redirect_uri"], [kar.REDIRECT_URI])


class StateTest(unittest.TestCase):
    def test_state_is_random(self):
        self.assertGreaterEqual(len(kar.STATE), 32)


if __name__ == "__main__":
    unittest.main()
