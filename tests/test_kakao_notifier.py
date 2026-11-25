import os
import stat
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import kakao_notifier


@unittest.skipIf(os.name == "nt", "Windows 는 파일 권한 비트를 쓰지 않아요")
class SaveTokensPermissionTest(unittest.TestCase):
    def test_token_file_stays_owner_only(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "kakao_token.json")
            with open(path + ".tmp", "w") as f:  # 예전에 남은 .tmp (umask 권한)
                f.write("{}")
            os.chmod(path + ".tmp", 0o664)
            old = kakao_notifier.TOKEN_FILE
            kakao_notifier.TOKEN_FILE = path
            try:
                kakao_notifier.save_tokens({"access_token": "x"})
            finally:
                kakao_notifier.TOKEN_FILE = old
            self.assertEqual(stat.S_IMODE(os.stat(path).st_mode), 0o600)


if __name__ == "__main__":
    unittest.main()
