import os
import sys
import unittest
from datetime import date, datetime, timedelta, timezone
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import contest_scraper  # noqa: E402
import it_contest_scraper as it  # noqa: E402
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

    def test_civil_filter_construction_tech(self):
        """토목 취업에 도움되는 건설기술·안전·플랜트 공모전은 포함"""
        def civil(title, organizer=""):
            return wevity.is_civil({"title": title, "organizer": organizer})

        self.assertTrue(civil("2026 대한건축사협회 대학(원)생 모듈러건축 공모전", "대한건축사협회"))
        self.assertTrue(civil("SK에코플랜트 2026 콘테크 미트업 데이 공모전", "SK에코플랜트"))
        self.assertTrue(civil("디지털 트윈 기반 시설물 관리 아이디어 공모전", "OO시"))
        self.assertTrue(civil("추락사고 예방 콘텐츠 공모전", "고용노동부"))
        self.assertTrue(civil("플랜트 엔지니어링 아이디어 경진대회", "OO협회"))
        self.assertTrue(civil("공간정보 활용 경진대회", "한국국토정보공사"))
        self.assertTrue(civil("대학생 아이디어 공모전", "포스코이앤씨"))

    def test_civil_filter_excludes_pure_design(self):
        """건축/건설 분야라도 순수 건축·공간 디자인 공모전은 제외"""
        def civil(title, organizer=""):
            return wevity.is_civil({"title": title, "organizer": organizer})

        self.assertFalse(civil("제14회 한옥디자인 국제 공모전", "사단법인 한옥건축학회"))
        self.assertFalse(civil("양천구 건축공간디자인상 공모", "양천구"))
        self.assertFalse(civil("제21회 2026년 한국공간디자인 전국공모전", "한국공간디자인협회"))
        self.assertFalse(civil("2026 에어-비트 시티 건축디자인 공모전", "에어-비트 시티 미래전략위원회"))
        self.assertFalse(civil("제1회 스마트시티 디자인어워드", "OO시"))  # 디자인 어워드는 토목 키워드가 있어도 제외

    def test_missing_list_means_layout_changed(self):
        self.assertIsNone(wevity.parse_list_page("<html><body>점검중</body></html>", datetime.now(KST), 24))


DEVEVENT_MD = """
## `26년 12월`
- __[2026 HAI(하이)! - Hecto AI x Wallet Service Challenge](https://daker.ai/public/hackathons/hai)__
  - 분류: `온라인`, `무료`, `대회`, `AI`, `블록체인`
  - 주최: 헥토(Hecto)
  - 접수: 10. 26(월) 10:00 ~ 01. 05(화)

- __[AWSKRUG 세미나](https://www.meetup.com/awskrug/events/1/)__
  - 분류: `오프라인(서울 성동구)`, `무료`, `세미나`, `AI`
  - 주최: AWSKRUG
  - 접수: 12. 01(화) ~ 12. 03(목) 19:00
- __[Hello World AI 해커톤](https://hackon.kr/e/1)__
  - 분류: `오프라인(서울 강남구)`, `무료`, `모임`, `AI`
  - 주최: HACK:ON
  - 일시: 12. 12(토) 13:00
- __[쿵야 IP 로블록스 게임 콘텐츠 제작 공모전](https://www.wevity.com/?c=find&s=1&gbn=view&ix=110895)__
  - 분류: `온라인`, `무료`, `대회`, `기술일반`
  - 주최: 넷마블엠엔비
  - 접수: 09. 11(금) ~ 12. 20(일)
- __[항만 AI 기술 공모전](https://www.wevity.com/?c=find&s=1&gbn=view&ix=777)__
  - 분류: `온라인`, `무료`, `대회`, `AI`
  - 주최: 해양수산부
  - 접수: 09. 30(수) ~ 12. 02(수) 10:00
"""


class DevEventParseTest(unittest.TestCase):
    def test_parses_contests_and_hackathons_only(self):
        items = it.parse_devevent_readme(DEVEVENT_MD)
        self.assertEqual([c["title"] for c in items],
                         ["2026 HAI(하이)! - Hecto AI x Wallet Service Challenge", "Hello World AI 해커톤", "항만 AI 기술 공모전"])
        hai, hackon, port = items
        # 12월 섹션의 1월 마감은 다음 해, 접수 시각이 없으면 23:59
        self.assertEqual((hai["deadline_date"], hai["deadline_time"]), ("2027-01-05", "23:59"))
        self.assertEqual(hai["organizer"], "헥토(Hecto)")
        self.assertEqual(hai["track"], "it")
        self.assertNotIn("무료", hai["fields"])
        # 접수 기간 없이 행사 일시만 있으면 행사 시작 시각이 마감
        self.assertEqual((hackon["deadline_date"], hackon["deadline_time"]), ("2026-12-12", "13:00"))
        # 위비티 공고 링크는 위비티 id로 묶여 중복 제거된다
        self.assertEqual(port["id"], "wevity-777")
        self.assertEqual(port["deadline_time"], "10:00")

    def test_missing_sections_means_format_changed(self):
        self.assertIsNone(it.parse_devevent_readme("# 점검 중"))

    def test_it_filter(self):
        def keep(title):
            return it.is_it({"title": title})

        self.assertTrue(keep("현대자동차그룹 차량용 앱 개발 공모전"))
        self.assertTrue(keep("2026 사회보장 데이터를 활용한 AI 혁신 아이디어 경진대회"))
        self.assertTrue(keep("2026 동남 버그바운티 대회"))
        self.assertFalse(keep("선샤인 TIME TRAVEL 숏폼 영상 공모전"))
        self.assertFalse(keep("2026 AI 플레이 콘텐츠 제작 공모전"))
        self.assertFalse(keep("2026 대경권 캠퍼스 IR 챔피언십 (창업 공모전)"))
        self.assertFalse(keep("공모전 준비 중이라면? AI 교정 서비스 [교정의 신]과 함께!"))


class DuplicateTitleTest(unittest.TestCase):
    def test_long_title_containing_another_is_duplicate(self):
        seen = {contest_scraper.normalize_title("현대자동차그룹 차량용 앱 개발 공모전")}
        longer = contest_scraper.normalize_title("현대자동차그룹 차량용 앱 개발 공모전 (Code your App into Pleos App Market)")
        self.assertTrue(contest_scraper.is_duplicate_title(longer, seen))
        self.assertFalse(contest_scraper.is_duplicate_title(contest_scraper.normalize_title("AI 공모전 2"), {"ai공모전"}))


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


class JbnuBoardTitleFilterTest(unittest.TestCase):
    def test_only_contest_like_titles_become_candidates(self):
        # 본문에 '공모'가 들어 있어 검색에 걸린 장학금·졸업·모집 공지는 후보에서 빠져요 (2026-11-25 실제 노출 사례)
        titles = ["AI 바이브 코딩 챌린지 공모전", "2026학년도 AI Agent 활용 문제해결 경진대회 운영 안내",
                  "2027학년도 1학기 국가장학금 1차 신청 및 '신입생 전액 장학금' 안내",
                  "2026학년도 전기 졸업자격인증 신청 안내", "제27기 학생홍보대사 모집 안내"]
        rows = "".join(f'<tr><td class="td-title"><a class="title" onclick="pf_DetailMove(\'{i}\')">{t}</a></td></tr>'
                       for i, t in enumerate(titles))
        resp = mock.MagicMock()
        resp.__enter__.return_value.read.return_value = f"<table><tbody>{rows}</tbody></table>".encode()
        with mock.patch.object(jbnu.urllib.request, "urlopen", return_value=resp):
            found, _ = jbnu.scrape_jbnu_board("https://x", 1, ["공모"], max_pages=1)
        self.assertEqual([f["title"] for f in found], titles[:2])

    def test_maintenance_page_without_board_table_is_failure(self):
        # 200으로 온 점검 페이지를 성공으로 세면 전북대 공모전이 조용히 0건이 돼요 → JbnuFetchError 로 이전 항목 유지
        resp = mock.MagicMock()
        resp.__enter__.return_value.read.return_value = "<html><body>시스템 점검 중</body></html>".encode()
        with mock.patch.object(jbnu.urllib.request, "urlopen", return_value=resp):
            found, ok = jbnu.scrape_jbnu_board("https://x", 1, ["공모"], max_pages=1)
            self.assertEqual((found, ok), ([], 0))
            with self.assertRaises(jbnu.JbnuFetchError):
                jbnu.fetch_jbnu_contest_notices()


if __name__ == "__main__":
    unittest.main()


class ResultDateTest(unittest.TestCase):
    def test_find_result_date_picks_latest_announcement(self):
        posted = date(2026, 11, 1)
        text = "접수: 11. 20.(금)까지 ○ 1차 결과 발표 : 2026. 12. 1. ○ 최종 수상자 발표 : 2026. 12. 7.(월) 18:00 ○ 시상식 12. 20."
        self.assertEqual(jbnu.find_result_date(text, posted), "2026-12-07")

    def test_find_result_date_ignores_deadline_and_ceremony(self):
        posted = date(2026, 11, 1)
        self.assertEqual(jbnu.find_result_date("접수 마감 11. 20. / 시상식 12. 20.", posted), "")
        self.assertEqual(jbnu.find_result_date("", posted), "")

    def test_find_result_date_short_dates_roll_year(self):
        posted = date(2026, 11, 25)
        self.assertEqual(jbnu.find_result_date("합격자 발표: 1월 5일", posted), "2027-01-05")

    def test_make_card_carries_result_date(self):
        item = {"pst_id": "1", "title": "공모전", "date": "2026-11-01", "menu": 2377}
        card = jbnu.make_card(item, "결과 발표: 2026. 12. 7.", "", date(2026, 11, 20), "18:00")
        self.assertEqual(card["result_date"], "2026-12-07")

    def test_find_result_date_stops_at_separator_or_next_keyword(self):
        posted = date(2026, 11, 1)
        self.assertEqual(jbnu.find_result_date("결과 발표: 개별 통보 ○ 시상식: 12. 20.", posted), "")
        self.assertEqual(jbnu.find_result_date("결과 안내: 추후 공지 / 접수 마감 11. 30.", posted), "")
        self.assertEqual(jbnu.find_result_date("최종 공고일로부터 3일 이내 제출, 11. 25.까지", posted), "")

    def test_make_card_drops_result_date_not_after_deadline(self):
        item = {"pst_id": "1", "title": "공모전", "date": "2026-11-01", "menu": 2377}
        card = jbnu.make_card(item, "결과 발표: 2026. 11. 10.", "", date(2026, 11, 20), "18:00")
        self.assertEqual(card["result_date"], "")

    def test_find_result_date_poster_line_layout(self):
        posted = date(2026, 11, 1)
        self.assertEqual(jbnu.find_result_date("운영 일정\n결과 발표\n2027. 1. 15.(금) 예정\n세부 내용", posted), "2027-01-15")
        self.assertEqual(jbnu.find_result_date("입상자 발표회: 2026. 11. 5.(목) 16:00", posted), "")
        self.assertEqual(jbnu.find_result_date("최종 발표\n및 심사\n11/27", posted), "")


WEVITY_DETAIL = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "wevity_detail.html"), encoding="utf-8").read()


class MoreSourceInfoTest(unittest.TestCase):
    """위비티 상세·데브이벤트 접수 시작일 수집 + 출처 간 교차 검증"""

    def test_devevent_keeps_apply_start_date(self):
        hai = it.parse_devevent_readme(DEVEVENT_MD)[0]
        self.assertEqual(hai["start_date"], "2026-10-26")
        self.assertEqual(hai["period"], "2026.10.26 ~ 01.05 마감")
        hackon = it.parse_devevent_readme(DEVEVENT_MD)[1]
        self.assertEqual(hackon["start_date"], "")  # 접수 기간 없이 행사 일시만

    def test_parse_wevity_detail(self):
        d = wevity.parse_detail(WEVITY_DETAIL, date(2026, 11, 19))
        self.assertEqual((d["start_date"], d["end_date"]), ("2026-11-02", "2026-11-29"))
        self.assertEqual(d["target"], "기타")
        self.assertEqual((d["prize_total"], d["prize_first"]), ("1천만원이하", "50만원"))
        self.assertTrue(d["homepage"].startswith("https://www.djtc.kr/"))
        self.assertEqual(d["result_date"], "")  # '발표평가 및 시상'은 결과 발표가 아님
        self.assertIsNone(wevity.parse_detail("<html>점검중</html>", date(2026, 11, 19)))

    def test_apply_detail_cross_checks_list_deadline(self):
        item = {"id": "wevity-1", "title": "t", "deadline_date": "2026-11-28", "period": "~ 2026.11.28 마감", "target": ""}
        detail = {"start_date": "2026-11-02", "end_date": "2026-11-29", "target": "대학생", "prize_total": "1천만원이하",
                  "prize_first": "50만원", "homepage": "https://x.kr", "result_date": ""}
        msg = wevity.apply_detail(item, detail)
        self.assertIn("2026-11-28", msg)
        self.assertEqual((item["deadline_date"], item["start_date"]), ("2026-11-29", "2026-11-02"))
        self.assertEqual(item["period"], "2026.11.02 ~ 11.29 마감")
        self.assertEqual((item["target"], item["prize_first"], item["deadline_source"]), ("대학생", "50만원", "wevity_detail"))
        same = {"id": "wevity-2", "title": "t", "deadline_date": "2026-11-29", "period": "", "target": ""}
        self.assertEqual(wevity.apply_detail(same, detail), "")

    def test_enrich_uses_cache_and_caps_fetches(self):
        today = date(2026, 11, 19)
        items = [{"id": f"wevity-{i}", "title": "t", "deadline_date": "2026-11-29", "period": "", "target": "",
                  "link": f"https://www.wevity.com/?ix={i}"} for i in range(4)]
        cache = {"wevity-0": {"fetched": "2026-11-19", "detail": {"start_date": "2026-11-01", "end_date": "2026-11-29",
                 "target": "", "prize_total": "", "prize_first": "", "homepage": "", "result_date": ""}}}
        fetched = []
        def fake_get(url):
            fetched.append(url)
            return WEVITY_DETAIL
        wevity.enrich_with_details(items, cache, today, get_html=fake_get, max_fetch=2)
        self.assertEqual(len(fetched), 2)                      # 캐시 1건은 다시 안 받고, 새 3건 중 2건까지만
        self.assertEqual(items[0]["start_date"], "2026-11-01")  # 캐시 사용
        self.assertEqual(items[1]["start_date"], "2026-11-02")  # 새로 받은 상세
        self.assertNotIn("start_date", items[3])               # 이번 회차 한도 초과 → 다음 회차에
        self.assertIn("wevity-1", cache)

    def test_merge_duplicates_cross_checks_sources(self):
        dev = {"id": "wevity-9", "source": "devevent", "title": "항만 AI 기술 공모전", "deadline_date": "2026-12-03",
               "start_date": "2026-09-30", "period": "2026.09.30 ~ 12.03 마감", "target": ""}
        wev = {"id": "wevity-9", "source": "wevity", "title": "항만 AI 기술 공모전", "deadline_date": "2026-12-02",
               "deadline_source": "wevity_detail", "start_date": "", "period": "~ 2026.12.02 마감", "target": "대학생"}
        kept, notes = contest_scraper.merge_duplicates([dev, wev])
        self.assertEqual(len(kept), 1)
        self.assertEqual(kept[0]["deadline_date"], "2026-12-02")   # 상세 페이지로 확인한 마감일 우선
        self.assertEqual(kept[0]["start_date"], "2026-09-30")      # 빈 칸은 다른 출처로 채움
        self.assertEqual(kept[0]["target"], "대학생")
        self.assertEqual(len(notes), 1)
        self.assertIn("2026-12-03", notes[0])
        same = dict(dev, deadline_date="2026-12-02")
        self.assertEqual(contest_scraper.merge_duplicates([same, wev])[1], [])


class FuzzyResultDateTest(unittest.TestCase):
    """'11월 말' '12월 중'처럼 날짜 없이 적힌 발표 시기도 글자 그대로 남김 (계산용 대략 날짜 + 표시용 글자)"""

    def test_fuzzy_month_phrases_from_real_posters(self):
        p = date(2026, 11, 1)
        self.assertEqual(jbnu.find_result_info("결과 발표 / 시상 : 11월 말\n시상 내역", p), ("2026-11-30", "11월 말"))
        self.assertEqual(jbnu.find_result_info("결과발표. 2026. 12월 중 * 수상 결과 발표 일정은 변경", p), ("2026-12-20", "12월 중"))
        self.assertEqual(jbnu.find_result_info("수상발표 및 시상\n'26. 11월 말 / 12월 중\n(일정 추후 확정)", p), ("2026-11-30", "11월 말"))
        self.assertEqual(jbnu.find_result_info("합격자 발표: 1월 초", date(2026, 11, 25)), ("2027-01-10", "1월 초"))
        self.assertEqual(jbnu.find_result_info("최종 결과 안내: 12월 하순", p), ("2026-12-31", "12월 하순"))

    def test_exact_date_has_no_label_and_none_is_empty(self):
        p = date(2026, 11, 1)
        self.assertEqual(jbnu.find_result_info("최종 수상자 발표 : 2026. 12. 7.(월)", p), ("2026-12-07", ""))
        self.assertEqual(jbnu.find_result_info("결과 발표: 개별 통보", p), ("", ""))

    def test_make_card_carries_result_label(self):
        item = {"pst_id": "1", "title": "공모전", "date": "2026-11-01", "menu": 2377}
        card = jbnu.make_card(item, "결과 발표: 12월 중", "", date(2026, 11, 20), "18:00")
        self.assertEqual((card["result_date"], card["result_label"]), ("2026-12-20", "12월 중"))
