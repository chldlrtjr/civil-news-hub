import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import job_scraper  # noqa: E402


class CollectSourceTest(unittest.TestCase):
    def test_success(self):
        with mock.patch.object(job_scraper, "load_api_key", return_value="key"):
            jobs, failed = job_scraper.collect_source("잡알리오", "JOBALIO_API_KEY", lambda k: [{"id": "a"}])
        self.assertEqual((jobs, failed), ([{"id": "a"}], False))

    def test_failure_keeps_previous_and_reports(self):
        def boom(key):
            raise RuntimeError("SERVICE_KEY_IS_NOT_REGISTERED_ERROR")

        prev = [{"id": "old", "source": "잡알리오"}]
        with mock.patch.object(job_scraper, "load_api_key", return_value="key"), \
                mock.patch.object(job_scraper, "load_previous_jobs", return_value=prev):
            jobs, failed = job_scraper.collect_source("잡알리오", "JOBALIO_API_KEY", boom)
        self.assertEqual((jobs, failed), (prev, True))

    def test_missing_key_is_reported(self):
        with mock.patch.object(job_scraper, "load_api_key", return_value=""), \
                mock.patch.object(job_scraper, "load_previous_jobs", return_value=[]):
            self.assertTrue(job_scraper.collect_source("고용24 공채속보", "WORK24_API_KEY", lambda k: [])[1])

    def test_failed_sources_in_result(self):
        results = {"고용24 공채속보": ([], True), "유신 채용 페이지": ([], True)}
        with mock.patch.object(job_scraper, "collect_source", side_effect=lambda n, k, c: results.get(n, ([], False))), \
                mock.patch.object(job_scraper, "write_json_atomic"):
            data = job_scraper.scrape_civil_jobs()
        self.assertEqual(data["failed_sources"], ["고용24 공채속보", "유신 채용 페이지"])

    def test_keyless_source_called_without_key(self):
        with mock.patch.object(job_scraper, "load_api_key") as key:
            jobs, failed = job_scraper.collect_source("유신 채용 페이지", None, lambda k: [{"id": "y"}])
        key.assert_not_called()
        self.assertEqual((jobs, failed), ([{"id": "y"}], False))

    def test_direct_site_jobs_merged_and_api_duplicates_win(self):
        api = {"id": "w24-1", "company": "(주)유신", "deadline_date": "2027-01-28", "title": "공항 경력"}
        site = [{"id": "yooshin-157", "company": "유신", "deadline_date": "2027-01-28", "title": "경력직 채용"},
                {"id": "kict-1", "company": "한국건설기술연구원", "deadline_date": "2027-01-10", "title": "연수직"}]
        results = {"고용24 공채속보": ([api], False), "유신 채용 페이지": (site[:1], False), "한국건설기술연구원 채용 페이지": (site[1:], False)}
        with mock.patch.object(job_scraper, "collect_source", side_effect=lambda n, k, c: results.get(n, ([], False))), \
                mock.patch.object(job_scraper, "write_json_atomic"):
            data = job_scraper.scrape_civil_jobs()
        self.assertEqual([j["id"] for j in data["jobs"]], ["kict-1", "w24-1"])


class CareerPagesTest(unittest.TestCase):
    def test_no_broken_pages(self):
        links = [p["link"] for p in job_scraper.CAREER_PAGES]
        self.assertNotIn("http://www.dmec.co.kr", links)
        self.assertIn("https://samaneng.com/board/recruit2/index.html", links)

    def test_fixed_links_2026_11(self):
        """수자원공사 옛 주소는 '페이지를 찾을 수 없음', 포스코는 그룹 사이트(수집·안내 대상 아님), 유신은 직무 소개 페이지였음"""
        links = {p["company"]: p["link"] for p in job_scraper.CAREER_PAGES}
        self.assertEqual(links["한국수자원공사"], "https://k-water.recruiter.co.kr/career/home")
        self.assertEqual(links["포스코이앤씨"], "https://poscoenc.careerlink.kr/jobs")
        self.assertEqual(links["유신"], "https://www.yooshin.com/career/opportunities")


class JobalioCivilHintTest(unittest.TestCase):
    def _item(self, title):
        return {"recrutPbancTtl": title, "ncsCdLst": job_scraper.JOBALIO_NCS_CONSTRUCTION, "recrutPblntSn": "1",
                "pbancBgngYmd": "20261112", "pbancEndYmd": "20261127"}

    def test_water_supply_operation_is_kept(self):
        # 하수도 시설운영 공고는 이미 들어오는데 같은 종류의 상수도·정수장 공고만 빠지고 있었음
        for t in ["[한국수자원공사] 나주수도지사 특수직(지방상수도 시설운영) 채용 공고",
                  "[한국수자원공사] 통영수도센터 욕지정수장 특수직(수탁운영_지방상수도 시설운영) 채용 공고"]:
            self.assertIsNotNone(job_scraper.parse_jobalio_job(self._item(t)), t)

    def test_unrelated_construction_ncs_still_dropped(self):
        self.assertIsNone(job_scraper.parse_jobalio_job(self._item("휴게소 매장 운영 기간제근로자")))



class WebLinkTest(unittest.TestCase):
    def test_scheme_less_link_falls_back(self):
        self.assertEqual(job_scraper.web_link("www.kohom.or.kr", fallback="https://job.alio.go.kr/x"), "https://job.alio.go.kr/x")
        self.assertEqual(job_scraper.web_link(None, " https://a.kr/d ", fallback="f"), "https://a.kr/d")
        self.assertEqual(job_scraper.web_link("javascript:alert(1)", fallback="f"), "f")


if __name__ == "__main__":
    unittest.main()
