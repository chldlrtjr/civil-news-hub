import os
import sys
import unittest
from datetime import date
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import contest_poster_reader as reader  # noqa: E402
import jbnu_contest_scraper as jbnu  # noqa: E402

POSTED = date(2026, 10, 8)


def raw(**kw):
    base = {
        "transcript": "제13회 대학생 물환경 공모전\n접수기간 2026. 9. 28.(월) → 10. 25.(일)\n본선대회 12. 22.(화)",
        "deadline_date": "2026-10-25",
        "deadline_time": None,
        "deadline_evidence": "접수기간 2026. 9. 28.(월) → 10. 25.(일)",
        "prize": "장관상 외 총상금 1,300만원",
        "target": "국내 대학교 재·휴학생 2~3인 팀",
    }
    base.update(kw)
    return base


class VerifyTest(unittest.TestCase):
    def verify(self, r):
        return reader.verify(r, POSTED, jbnu._find_dates)

    def test_accepts_deadline_backed_by_evidence(self):
        info = self.verify(raw())
        self.assertEqual((info["deadline"], info["deadline_time"]), (date(2026, 10, 25), "23:59"))
        self.assertEqual(info["prize"], "장관상 외 총상금 1,300만원")

    def test_rejects_evidence_not_in_transcript(self):
        self.assertIsNone(self.verify(raw(deadline_evidence="접수기간 ~ 10. 25.(일) 18:00")))

    def test_rejects_date_not_in_evidence(self):
        # 근거 문장에는 10/25인데 모델이 다른 날짜(본선일)를 마감일로 낸 경우
        self.assertIsNone(self.verify(raw(deadline_date="2026-12-22")))

    def test_label_on_line_above_evidence_is_accepted(self):
        r = raw(transcript="시상 안내\n접수 기간\n~ 2026. 12. 31.(목)\n결과 발표 2027. 1. 15.",
                deadline_date="2026-12-31", deadline_evidence="~ 2026. 12. 31.(목)")
        self.assertEqual(self.verify(r)["deadline"], date(2026, 12, 31))

    def test_rejects_event_period_without_application_context(self):
        # 실제 사례: 포스터의 '대회 일정'을 모델이 접수 마감으로 냄
        r = raw(transcript="모집 대상\nAI로 자동매매 만들고 싶은 사람\n대회 일정\n2026.10.19 ~ 11.13\n시상식 2026. 11. 30",
                deadline_date="2026-11-13", deadline_evidence="2026.10.19 ~ 11.13")
        self.assertIsNone(self.verify(r))

    def test_rejects_missing_or_out_of_window_dates(self):
        self.assertIsNone(self.verify(raw(deadline_date=None)))
        self.assertIsNone(self.verify(raw(deadline_date="2026-09-28",
                                          deadline_evidence="접수기간 2026. 9. 28.(월) → 10. 25.(일)")))

    def test_time_is_normalized_or_defaulted(self):
        r = raw(transcript="접수 2026. 10. 1. ~ 10. 25. 9:00까지", deadline_evidence="접수 2026. 10. 1. ~ 10. 25. 9:00까지")
        self.assertEqual(self.verify(dict(r, deadline_time="9:00"))["deadline_time"], "09:00")
        self.assertEqual(self.verify(dict(r, deadline_time="오후 6시"))["deadline_time"], "23:59")

    def test_long_prize_is_trimmed(self):
        self.assertLessEqual(len(self.verify(raw(prize="상" * 300))["prize"]), 100)


class ReadPosterCacheTest(unittest.TestCase):
    def test_cached_result_skips_download_and_model(self):
        cache = {"1": {"poster": "http://p/1", "raw": raw()}}
        with mock.patch.object(reader.urllib.request, "urlopen") as urlopen, \
                mock.patch.object(reader, "ask_gemini") as ask:
            info = reader.read_poster("1", "http://p/1", POSTED, jbnu._find_dates, cache, "k")
        urlopen.assert_not_called()
        ask.assert_not_called()
        self.assertEqual(info["deadline"], date(2026, 10, 25))

    def test_changed_poster_is_read_again_and_cached(self):
        cache = {"1": {"poster": "http://p/old", "raw": raw(deadline_date=None)}}
        resp = mock.MagicMock()
        resp.__enter__.return_value.read.return_value = b"img"
        resp.__enter__.return_value.headers.get_content_type.return_value = "image/png"
        with mock.patch.object(reader.urllib.request, "urlopen", return_value=resp), \
                mock.patch.object(reader, "ask_gemini", return_value=raw()) as ask:
            info = reader.read_poster("1", "http://p/new", POSTED, jbnu._find_dates, cache, "k")
        ask.assert_called_once_with(b"img", "image/png", "k")
        self.assertEqual(cache["1"]["poster"], "http://p/new")
        self.assertIsNotNone(info)

    def test_model_failure_is_not_cached(self):
        cache = {}
        resp = mock.MagicMock()
        resp.__enter__.return_value.read.return_value = b"img"
        with mock.patch.object(reader.urllib.request, "urlopen", return_value=resp), \
                mock.patch.object(reader, "ask_gemini", side_effect=reader.PosterQuotaError("429")):
            with self.assertRaises(reader.PosterQuotaError):
                reader.read_poster("1", "http://p/1", POSTED, jbnu._find_dates, cache, "k")
        self.assertEqual(cache, {})


def item(pst_id, title, d="2026-10-08"):
    return {"pst_id": pst_id, "title": title, "date": d, "writer": "", "menu": 2377}


class JbnuPosterFlowTest(unittest.TestCase):
    def run_fetch(self, items, read_poster):
        board = mock.patch.object(jbnu, "scrape_jbnu_board", side_effect=[(items, 1), ([], 1)])
        detail = mock.patch.object(jbnu, "fetch_jbnu_post_detail", return_value=("붙임 포스터 참조", "http://p/x"))
        with board, detail, \
                mock.patch.object(jbnu, "VERIFIED_JBNU_FACTS", {}), \
                mock.patch.object(jbnu.contest_poster_reader, "load_cache", return_value={}), \
                mock.patch.object(jbnu.contest_poster_reader, "save_cache"), \
                mock.patch.object(jbnu.contest_poster_reader, "load_api_key", return_value="k"), \
                mock.patch.object(jbnu.contest_poster_reader, "read_poster", side_effect=read_poster) as rp, \
                mock.patch.object(jbnu.contest_validator, "validate_contest", return_value=(True, "")):
            return jbnu.fetch_jbnu_contest_notices(), rp

    def test_poster_only_notice_becomes_card_with_prize_and_target(self):
        info = reader.verify(raw(), POSTED, jbnu._find_dates)
        result, _ = self.run_fetch([item("218185", "(기후에너지환경부) 물환경 공모전 개최 안내")], lambda *a: info)
        self.assertEqual(len(result), 1)
        c = result[0]
        self.assertEqual((c["deadline_date"], c["deadline_source"]), ("2026-10-25", "poster"))
        self.assertEqual(c["prize"], "장관상 외 총상금 1,300만원")
        self.assertIn("물환경", c["description"])

    def test_unverified_poster_is_not_shown(self):
        result, _ = self.run_fetch([item("1", "(기관) 어떤 공모전 안내")], lambda *a: None)
        self.assertEqual(result, [])

    def test_quota_error_stops_remaining_posters(self):
        def boom(*a):
            raise reader.PosterQuotaError("429")
        result, rp = self.run_fetch([item("2", "(가) 공모전 A"), item("1", "(나) 공모전 B")], boom)
        self.assertEqual(result, [])
        self.assertEqual(rp.call_count, 1)

    def test_repost_with_different_prefix_keeps_newest(self):
        info = reader.verify(raw(), POSTED, jbnu._find_dates)
        result, rp = self.run_fetch([
            item("218237", "(전주시도시재생지원센터) 2026 전주시 도시재생 유휴부지 아이디어 공모전 개최 안내"),
            item("218429", "(전주시도시재생센터) 2026 전주시 도시재생 유휴부지 아이디어 공모전 개최 안내"),
        ], lambda *a: info)
        self.assertEqual([c["id"] for c in result], ["campus-218429"])
        self.assertEqual(rp.call_count, 1)


class RepostKeyTest(unittest.TestCase):
    def test_extension_notice_matches_original(self):
        self.assertEqual(jbnu.repost_key("(교육부) 개인정보보호 사례 공모전 안내 (기간연장)"),
                         jbnu.repost_key("(교육부) 개인정보보호 사례 공모전 안내"))

    def test_different_contests_differ(self):
        self.assertNotEqual(jbnu.repost_key("(한림대학교) CSI 경진대회"), jbnu.repost_key("(영남대학교) 자작 미래자동차 경진대회"))


if __name__ == "__main__":
    unittest.main()
