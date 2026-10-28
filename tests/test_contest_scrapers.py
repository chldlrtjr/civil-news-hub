import os
import sys
import unittest
from datetime import date, datetime, timedelta, timezone
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import contest_scraper  # noqa: E402
import jbnu_contest_scraper as jbnu  # noqa: E402
import wevity_contest_scraper as wevity  # noqa: E402

KST = timezone(timedelta(hours=9))


class FixedDatetime(datetime):
    now_value = datetime(2026, 10, 27, 19, 1, tzinfo=KST)

    @classmethod
    def now(cls, tz=None):
        return cls.now_value


class DdayTest(unittest.TestCase):
    def dday(self, d, t="18:00"):
        with mock.patch.object(contest_scraper, "datetime", FixedDatetime):
            return contest_scraper.calculate_contest_dday(d, t)

    def test_counts_calendar_days_not_24h_blocks(self):
        # 10/27 19:01 기준 10/29 18:00 마감은 47시간 남았어도 달력상 D-2
        self.assertEqual(self.dday("2026-10-29")["text"], "D-2")
        self.assertEqual(self.dday("2026-10-28")["text"], "D-1")

    def test_same_day_before_and_after_deadline(self):
        self.assertEqual(self.dday("2026-10-27", "23:59")["text"], "오늘마감")
        self.assertTrue(self.dday("2026-10-27", "18:00")["is_closed"])

    def test_unparseable_date_is_hidden(self):
        self.assertTrue(self.dday("2026-13-40")["is_closed"])
        self.assertTrue(self.dday("곧 마감")["is_closed"])


class ExtractDeadlineTest(unittest.TestCase):
    posted = date(2026, 10, 23)

    def test_until_with_korean_date_and_time(self):
        text = "나 . 공모기간 : 2026 년 11 월 4 일 수요일 오전 10 시까지 다 . 응모자격"
        self.assertEqual(jbnu.extract_deadline(text, self.posted), (date(2026, 11, 4), "10:00"))

    def test_range_after_keyword_uses_end_date(self):
        text = "다 . ( 공모기간 )2026.10. 21.( 수 )~11. 20.( 금 ) 라 . ( 참가자격 )"
        self.assertEqual(jbnu.extract_deadline(text, self.posted), (date(2026, 11, 20), "23:59"))

    def test_bracket_label_period(self):
        text = "ㅇ ( 기간 ) 2026.10.7.( 수 ) ~ 10.30.( 금 ) ㅇ ( 참가자격 ) 청년"
        self.assertEqual(jbnu.extract_deadline(text, date(2026, 10, 13)), (date(2026, 10, 30), "23:59"))

    def test_picks_application_deadline_not_event_or_award_date(self):
        text = ("대회일시 : 2026. 11. 07.( 토 ) 14:00 ~ 16:00 ※ 신청기간 : ~ 2026. 11. 04.( 수 ) 23:59 까지 "
                "3 . 시 상 식 : 2026. 11. 20.( 금 ) 09:30")
        self.assertEqual(jbnu.extract_deadline(text, self.posted), (date(2026, 11, 4), "23:59"))

    def test_ignores_unlabeled_support_period(self):
        text = "□ 지원 기간 ㅇ 1차년도: 협약체결일 ~ 2027년 2월 28일 □ 접수기간: 공고일~ 11월 10일(화)까지"
        self.assertEqual(jbnu.extract_deadline(text, date(2026, 10, 28))[0], date(2026, 11, 10))

    def test_title_tilde(self):
        found = jbnu.extract_deadline("", date(2026, 10, 21), title="Idea Camp 참여자 모집(~10.29. 목)")
        self.assertEqual(found[0], date(2026, 10, 29))

    def test_no_deadline(self):
        text = "기후에너지환경부에서 「제13회 대학생 물환경 정책·기술 공모전」을 개최합니다."
        self.assertIsNone(jbnu.extract_deadline(text, self.posted))

    def test_month_day_rolls_into_next_year(self):
        found = jbnu.extract_deadline("접수 마감: 1월 15일", date(2026, 12, 20))
        self.assertEqual(found[0], date(2027, 1, 15))


WEVITY_HTML = """
<ul class="list">
  <li class="top"><div class="tit">공모전명</div><div class="organ">주최사</div><div class="day">현재현황</div></li>
  <li><div class="tit"><a href="?c=find&amp;s=1&amp;mode=ing&amp;gub=1&amp;cidx=24&amp;gbn=view&amp;gp=1&amp;ix=111976">
      2026 유휴공간 활성화 아이디어 공모전 <span class="stat new">신규</span></a>
      <div class="sub-tit">분야 : 건축/건설/인테리어, 기획/아이디어</div></div>
    <div class="organ">문화정원</div><div class="day">D-12 <span class="dday ing">접수중</span></div></li>
  <li><div class="tit"><a href="?c=find&amp;ix=222">오늘 마감 공모전</a></div>
    <div class="organ">A</div><div class="day">D-day <span class="dday ing">접수중</span></div></li>
  <li><div class="tit"><a href="?c=find&amp;ix=333">마감된 공모전</a></div>
    <div class="organ">B</div><div class="day">마감 <span class="dday end">마감</span></div></li>
</ul>
"""


class WevityParseTest(unittest.TestCase):
    def test_parse_list_page(self):
        today = datetime(2026, 10, 28, 9, 0, tzinfo=KST)
        items = wevity.parse_list_page(WEVITY_HTML, today, 24)
        self.assertEqual([c["id"] for c in items], ["wevity-111976", "wevity-222"])
        first = items[0]
        self.assertEqual(first["title"], "2026 유휴공간 활성화 아이디어 공모전")
        self.assertEqual(first["organizer"], "문화정원")
        self.assertEqual(first["deadline_date"], "2026-11-09")
        self.assertEqual(first["fields"], ["건축/건설/인테리어", "기획/아이디어"])
        self.assertEqual(items[1]["deadline_date"], "2026-10-28")

    def test_civil_filter(self):
        def civil(title, organizer=""):
            return wevity.is_civil({"title": title, "organizer": organizer})

        self.assertTrue(civil("용산국제업무지구 AI 스마트도시 아이디어 공모", "서울특별시"))
        self.assertTrue(civil("[한국도로공사] AI 활용 아이디어 공모전", "한국도로공사"))
        self.assertTrue(civil("위험현장 사고조사 아이디어 공모전", "국토안전관리원"))
        self.assertFalse(civil("[의정부도시공사] AI 혁신 아이디어 공모전", "의정부도시공사"))  # '도시공사' ≠ '시공'
        self.assertFalse(civil("2026 해양 창업아이디어 공모전", "부산항만공사"))  # 주최기관명 일부 일치만으로는 불인정
        self.assertFalse(civil("2026 제43회 골든스케일디자인어워드", "사단법인 한국실내건축가협회"))
        self.assertFalse(civil("초량천~산복도로 스토리텔링 공모전", "부산 동구"))

    def test_missing_list_means_layout_changed(self):
        self.assertIsNone(wevity.parse_list_page("<html><body>점검중</body></html>", datetime.now(KST), 24))


class SourceFallbackTest(unittest.TestCase):
    def test_failed_source_keeps_previous_items(self):
        previous = [
            {"id": "wevity-1", "source": "wevity", "title": "이전 위비티"},
            {"id": "fc-ex", "title": "예전 수동 항목 (source 없음)"},
            {"id": "campus-1", "source": "campus", "title": "이전 전북대"},
        ]

        def boom():
            raise wevity.WevityFetchError("timeout")

        sources = [
            ("manual", "수동 등록", lambda: [{"id": "fc-new", "title": "새 수동"}]),
            ("campus", "전북대 공지", lambda: [{"id": "campus-2", "source": "campus", "title": "새 전북대"}]),
            ("wevity", "위비티", boom),
        ]
        with mock.patch.object(contest_scraper, "SOURCES", sources), \
                mock.patch.object(contest_scraper, "load_previous_contests", return_value=previous):
            raw, failed = contest_scraper.collect_raw_contests()

        self.assertEqual(failed, ["위비티"])
        self.assertEqual([c["id"] for c in raw], ["fc-new", "campus-2", "wevity-1"])
        self.assertEqual(raw[0]["source"], "manual")


if __name__ == "__main__":
    unittest.main()
