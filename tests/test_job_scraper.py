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
        results = {"JOBALIO_API_KEY": ([], False), "WORK24_API_KEY": ([], True)}
        with mock.patch.object(job_scraper, "collect_source", side_effect=lambda n, k, c: results[k]), \
                mock.patch.object(job_scraper, "write_json_atomic"):
            data = job_scraper.scrape_civil_jobs()
        self.assertEqual(data["failed_sources"], ["고용24 공채속보"])


class CareerPagesTest(unittest.TestCase):
    def test_no_broken_pages(self):
        links = [p["link"] for p in job_scraper.CAREER_PAGES]
        self.assertNotIn("http://www.dmec.co.kr", links)
        self.assertIn("https://samaneng.com/board/recruit2/index.html", links)


if __name__ == "__main__":
    unittest.main()
