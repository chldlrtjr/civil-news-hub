import os
import sys
import unittest
from datetime import date, datetime
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import jbnu_scraper  # noqa: E402
import swuniv_scraper  # noqa: E402


class AlbaDeadlineTest(unittest.TestCase):
    def test_dday_counts_from_today_not_registration_date(self):
        today = date(2026, 10, 28)
        # 10/27 등록 · D-23 공고의 실제 마감은 11/20 (등록일 기준으로 더하면 11/19가 됨)
        self.assertEqual(jbnu_scraper.deadline_from_dday("D-23", today), "2026-11-20")
        self.assertEqual(jbnu_scraper.deadline_from_dday("D-day", today), "2026-10-28")
        self.assertIsNone(jbnu_scraper.deadline_from_dday("상시모집", today))

    def test_work_date_rolls_into_next_year(self):
        reg = datetime(2026, 12, 20)
        self.assertEqual(jbnu_scraper.infer_work_date(1, 5, reg), datetime(2027, 1, 5))
        self.assertEqual(jbnu_scraper.infer_work_date(12, 24, reg), datetime(2026, 12, 24))


class AlbaWageTest(unittest.TestCase):
    def parse(self, wage, time_="평일", title="알바 구합니다"):
        return jbnu_scraper.parse_wage_and_work_condition("가게", title, wage, time_)

    def test_no_hardcoded_past_posting_text(self):
        r = self.parse("18만원")
        self.assertNotIn("9/15", r["pay_subtext"])
        r = self.parse("20만원", title="페스티벌 스태프")
        self.assertNotIn("2일", r["wage_display"])

    def test_plain_amount_with_specific_date_is_daily(self):
        r = self.parse("80,000", time_="10월31일 (11:30~17:30)")
        self.assertEqual((r["wage_type"], r["sort_wage"]), ("daily", 80000))
        self.assertEqual(self.parse("60,000", time_="오전 7-9시")["wage_type"], "negotiable")

    def test_large_plain_amount_is_monthly(self):
        for raw in ("1,500,000", "2800000"):
            r = self.parse(raw)
            self.assertEqual(r["wage_type"], "monthly")
            self.assertEqual(r["hourly_wage"], 0)

    def test_negotiable_has_no_invented_hourly(self):
        r = self.parse("협의")
        self.assertEqual((r["wage_type"], r["sort_wage"], r["hourly_wage"]), ("negotiable", 0, 0))


class AlbaWeeklyHoursTest(unittest.TestCase):
    def test_parsed_from_explicit_days_and_times(self):
        cases = {
            "월~금 16:00-22:00": 30,
            "월-금 오후 2-7시": 25,
            "평일 1:30~8:30": 35,                     # 오후 표기 없는 1:30~8:30
            "월수금 4:30-8:30": 12,
            "화 목 시간: 3시 50분~7시 30분": 7.3,
            "15:00-20:00 (주4일)": 20,                # 요일 정보가 뒤에 오는 경우
            "주5일 2시20분~6시20분": 20,
            "평일 16:30~20:30 / 토요일 09:00~13:00": 24,   # 요일별 시간 합산
            "월 16:30-21:00 화 15:30-21:00": 10,
            "수요일 22시~04시 금요일 21시~04시": 13,      # 자정 넘김
            "토요일, 일요일 11시30분 - 2시 20분": 5.7,
            "일 - 목 23시 ~ 08시 , 금 - 토 24시 ~ 08시": 61,  # 주를 넘어가는 요일 범위
        }
        for text, expected in cases.items():
            self.assertEqual(jbnu_scraper.parse_weekly_hours(text), expected, text)

    def test_ambiguous_or_incomplete_is_none(self):
        for text in [
            "16:30-20:30",                                   # 요일 없음
            "평일", "토, 일",                                  # 시간 없음
            "4~6시간", "2시간 ~ 4시간",                          # 하루 근무시간 범위
            "A조 : 오후 1시~4시 / B조 : 오후 2시~5시",            # 선택지
            "3시~8시 또는 3시~9시30",
            "주 2~3회", "월,수,금, 토, 일(6시~10시 사이) 주2회 선택",
            "월-금 13:00~18:00 / 09:00~15:00(1시간 휴게포함)",    # 요일 없는 대안 시간
            "10월 31일 토요일 10:30 ~ 16:30",                   # 단발 근무
            "월~일(협의 가능) / 10:30~23:00",                    # 영업시간 (주 84시간 초과)
            "협의", "",
        ]:
            self.assertIsNone(jbnu_scraper.parse_weekly_hours(text), text)

    def test_month_word_is_not_monday(self):
        self.assertIsNone(jbnu_scraper.parse_weekly_hours("월급제 16:00-22:00"))


class AlbaFailureTest(unittest.TestCase):
    def test_unreachable_board_raises_and_keeps_file(self):
        with mock.patch.object(jbnu_scraper.urllib.request, "urlopen", side_effect=OSError("down")), \
                mock.patch.object(jbnu_scraper.os, "replace") as replace:
            with self.assertRaises(jbnu_scraper.AlbaFetchError):
                jbnu_scraper.scrape_jbnu_albas(max_pages=1)
            replace.assert_not_called()


class SwunivPeriodTest(unittest.TestCase):
    ref = date(2026, 10, 28)

    def period(self, text, ref=None):
        return swuniv_scraper.parse_period_from_string(text, ref=ref or self.ref)

    def test_digits_without_separator_are_not_split(self):
        # '17:00'의 17이 1월 7일로, '27'이 2월 7일로 해석되던 문제
        self.assertIsNone(self.period("-일시: 2026.08.19(수) 13:20 ~ 17:00 -장소"))
        self.assertEqual(self.period("신청기간: 2026. 5. 21.(목) ~ 27.(수)", ref=date(2026, 5, 21)),
                         (date(2026, 5, 21), date(2026, 5, 27)))

    def test_year_inference_after_new_year(self):
        # 12월에 올라온 '~ 1.15' 공고는 다음 해 1월 15일
        end = self.period("모집 (~1.15까지)", ref=date(2026, 12, 10))[1]
        self.assertEqual(end, date(2027, 1, 15))
        self.assertEqual(self.period("12.20 ~ 1.10 동계 캠프")[1], date(2027, 1, 10))

    def test_two_digit_year(self):
        self.assertEqual(self.period("26.10.27(화) ~ 26.11.08(일)"), (date(2026, 10, 27), date(2026, 11, 8)))

    def test_parse_dday_single_date_uses_inferred_year(self):
        now = datetime(2026, 12, 20, 10, 0, tzinfo=swuniv_scraper.KST)
        self.assertEqual(swuniv_scraper.parse_dday("~ 1/10", now)["deadline_date"], "2027-01-10")

    def test_manual_fact_only_matches_exact_title(self):
        self.assertIn("2026년 외부 경진대회 및 학회 참가 지원 안내", swuniv_scraper.MANUAL_NOTICE_FACTS)
        self.assertNotIn("2027년 외부 경진대회 및 학회 참가 지원 안내", swuniv_scraper.MANUAL_NOTICE_FACTS)


class SwunivDuplicateTest(unittest.TestCase):
    def test_same_program(self):
        self.assertTrue(swuniv_scraper.is_same_program(
            "2026 동계 일본 해외 인턴십 프로그램 참가자 모집", "[모집] 2026 동계 일본 해외 인턴십 프로그램 참가자 모집 안내"))

    def test_different_programs_sharing_generic_words(self):
        self.assertFalse(swuniv_scraper.is_same_program(
            "2026 동계 일본 해외 인턴십 프로그램 참가자 모집", "2026 SW 코딩캠프 프로그램 참가자 모집"))


class SwunivFailureTest(unittest.TestCase):
    def test_both_boards_unreachable_raises(self):
        with mock.patch.object(swuniv_scraper, "safe_fetch", return_value=None), \
                mock.patch.object(swuniv_scraper.os, "replace") as replace:
            with self.assertRaises(swuniv_scraper.SwunivFetchError):
                swuniv_scraper.save_swuniv_programs()
            replace.assert_not_called()


if __name__ == "__main__":
    unittest.main()
