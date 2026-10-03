import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import app as app_module  # noqa: E402


class FakeResp:
    ok = True
    status_code = 200

    def json(self):
        return {"candidates": [{"content": {"parts": [{"text": "답변"}]}}]}


ARTICLE = {"title": "대우건설, 대형 국책사업 보폭 넓힌다", "media": "프라임경제",
           "published_at": "2026-09-30 10:00", "summary": ["대우건설이 국책사업 수주를 늘린다"]}


class ChatHistoryTest(unittest.TestCase):
    def setUp(self):
        self.client = app_module.app.test_client()

    def post(self, body):
        with mock.patch.object(app_module.requests, "post", return_value=FakeResp()) as p:
            resp = self.client.post("/api/chat", json=body, headers={"X-Gemini-Key": "test-key"})
        return resp, p.call_args.kwargs["json"]["contents"]

    def test_history_becomes_previous_turns(self):
        resp, contents = self.post({
            "query": "'국책사업'이 뭐야?", "relevantArticles": [ARTICLE],
            "history": [{"role": "user", "text": "대우건설 기사 요약해줘"},
                        {"role": "ai", "text": "대우건설이 국책사업을 늘립니다."}]})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual([c["role"] for c in contents], ["user", "model", "user"])
        self.assertEqual(contents[0]["parts"][0]["text"], "대우건설 기사 요약해줘")
        self.assertIn("'국책사업'이 뭐야?", contents[-1]["parts"][0]["text"])

    def test_without_history_sends_single_turn(self):
        _, contents = self.post({"query": "대우건설 기사 요약해줘", "relevantArticles": [ARTICLE]})
        self.assertEqual(len(contents), 1)
        self.assertEqual(contents[0]["role"], "user")

    def test_prompt_has_summary_and_term_rules(self):
        _, contents = self.post({"query": "요약해줘", "relevantArticles": [ARTICLE]})
        text = contents[-1]["parts"][0]["text"]
        self.assertIn("3줄 이내", text)
        self.assertIn("1~2문장", text)

    def test_bad_history_is_capped_and_cleaned(self):
        history = [{"role": "user", "text": f"질문{i}"} for i in range(12)]
        history += ["문자열", None, {"role": "ai", "text": "   "}, {"role": "ai", "text": "가" * 3000}]
        resp, contents = self.post({"query": "요약", "relevantArticles": [], "history": history})
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(contents[0]["parts"][0]["text"].startswith("질문8"))
        self.assertLessEqual(len(contents), 9)
        self.assertTrue(all(len(c["parts"][0]["text"]) <= 1000 for c in contents[:-1]))

    def test_leading_model_turn_dropped(self):
        _, contents = self.post({"query": "요약", "relevantArticles": [], "history": [
            {"role": "ai", "text": "인사"}, {"role": "user", "text": "질문"}, {"role": "ai", "text": "답"}]})
        self.assertEqual([c["role"] for c in contents], ["user", "model", "user"])
        self.assertEqual(contents[0]["parts"][0]["text"], "질문")

    def test_consecutive_same_role_merged(self):
        _, contents = self.post({"query": "요약", "relevantArticles": [], "history": [
            {"role": "user", "text": "가" * 900}, {"role": "user", "text": "나" * 900},
            {"role": "ai", "text": "답"}]})
        self.assertEqual([c["role"] for c in contents], ["user", "model", "user"])
        self.assertLessEqual(len(contents[0]["parts"][0]["text"]), 1000)
        self.assertTrue(contents[0]["parts"][0]["text"].startswith("가"))

    def test_local_messages_excluded(self):
        _, contents = self.post({"query": "요약", "relevantArticles": [], "history": [
            {"role": "user", "text": "질문"}, {"role": "ai", "text": "로컬 요약", "local": True}]})
        self.assertEqual(len(contents), 2)
        self.assertEqual(contents[0]["parts"][0]["text"], "질문")

    def test_history_not_a_list_is_ignored(self):
        _, contents = self.post({"query": "요약", "relevantArticles": [], "history": "oops"})
        self.assertEqual(len(contents), 1)


if __name__ == "__main__":
    unittest.main()
