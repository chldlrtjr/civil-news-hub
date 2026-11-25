"""외부에서 받은 XML(구글 뉴스 RSS·고용24)에 DTD/엔티티 선언이 있으면 파싱하지 않고 거부"""
import io
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import job_scraper  # noqa: E402
import scraper  # noqa: E402

BOMB = b'<?xml version="1.0"?><!DOCTYPE r [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;">]><r>&b;</r>'
RSS = b'<?xml version="1.0"?><rss><channel><item><title>t</title></item></channel></rss>'


def fake_urlopen(body):
    class R(io.BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False
    return mock.patch("urllib.request.urlopen", return_value=R(body))


class XmlGuardTest(unittest.TestCase):
    def test_work24_rejects_dtd(self):
        with fake_urlopen(BOMB), mock.patch.object(job_scraper.ET, "fromstring", wraps=job_scraper.ET.fromstring) as parse:
            with self.assertRaises(ValueError):
                job_scraper.call_work24("210L21", {})
        parse.assert_not_called()

    def test_work24_normal_xml_still_parses(self):
        with fake_urlopen(b"<root><dhsOpenEmpInfo/></root>"):
            self.assertEqual(len(job_scraper.call_work24("210L21", {}).findall("dhsOpenEmpInfo")), 1)

    def test_rss_rejects_dtd(self):
        with fake_urlopen(BOMB), mock.patch.object(scraper.ET, "fromstring", wraps=scraper.ET.fromstring) as parse:
            self.assertIsNone(scraper.fetch_rss_for_term("토목"))
        parse.assert_not_called()

    def test_rss_normal_xml_still_parses(self):
        with fake_urlopen(RSS):
            self.assertEqual(len(scraper.fetch_rss_for_term("토목")), 1)

    def test_lowercase_doctype_rejected(self):
        with fake_urlopen(b'<!doctype r [<!entity a "x">]><r/>'):
            self.assertIsNone(scraper.fetch_rss_for_term("토목"))


if __name__ == "__main__":
    unittest.main()
