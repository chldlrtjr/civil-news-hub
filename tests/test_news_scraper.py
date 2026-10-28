import os
import sys
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import scraper  # noqa: E402

KST = timezone(timedelta(hours=9))
CAT = scraper.CATEGORIES[1]


def rfc822(dt):
    return dt.strftime("%a, %d %b %Y %H:%M:%S +0900")


class ProcessCandidateTest(unittest.TestCase):
    def process(self, title, pub_date, link="https://example.com/a/1", seen=None):
        return scraper.process_candidate_article(
            title, link, pub_date, "", "테스트일보", CAT, KST, set() if seen is None else seen)

    def test_id_is_stable_across_processes(self):
        # 내장 hash()와 달리 링크가 같으면 언제 실행해도 같은 ID
        now = rfc822(datetime.now(KST))
        a = self.process("국도 77호선 교량 착공", now)
        b = self.process("국도 77호선 교량 착공", now)
        self.assertEqual(a["id"], b["id"])
        self.assertEqual(a["id"], "f1d001462aa0")  # sha1("https://example.com/a/1")[:12]
        self.assertNotIn("views", a)

    def test_unknown_or_old_date_is_dropped(self):
        self.assertIsNone(self.process("국도 77호선 교량 착공", ""))
        old = rfc822(datetime.now(KST) - timedelta(days=scraper.MAX_ARTICLE_AGE_DAYS + 1))
        self.assertIsNone(self.process("국도 77호선 교량 착공", old))

    def test_dedup_uses_whole_title(self):
        seen = set()
        now = rfc822(datetime.now(KST))
        # 앞 20글자가 같아도 다른 기사면 둘 다 수집
        self.assertIsNotNone(self.process("국토교통부 2026년 도로 정비 기본계획 발표 수도권", now, "https://e.com/1", seen))
        self.assertIsNotNone(self.process("국토교통부 2026년 도로 정비 기본계획 발표 영남권", now, "https://e.com/2", seen))
        self.assertIsNone(self.process("국토교통부 2026년 도로 정비 기본계획 발표 영남권", now, "https://e.com/3", seen))

    def test_excludes_corporate_donation_news(self):
        now = rfc822(datetime.now(KST))
        self.assertIsNone(self.process("한국도로공사 충북본부, 청주 취약계층에 온누리상품권 300만원 기탁", now))


class PublisherResolveTest(unittest.TestCase):
    def test_clean_site_name(self):
        self.assertEqual(scraper.clean_site_name("울산매일 - 울산최초, 최고의 조간신문"), "울산매일")
        self.assertEqual(scraper.clean_site_name("컨슈머타임스(Consumertimes)"), "컨슈머타임스")
        self.assertEqual(scraper.clean_site_name("국제신문"), "국제신문")

    def test_resolves_once_per_domain_and_falls_back_to_domain(self):
        arts = [
            {"link": "https://www.ulsanpress.net/news/1", "publisher": "네이버뉴스"},
            {"link": "https://www.ulsanpress.net/news/2", "publisher": "네이버뉴스"},
            {"link": "https://jtv.co.kr/news/article.php?id=1", "publisher": "네이버뉴스"},
            {"link": "https://news.google.com/rss/articles/x", "publisher": "언론사"},
            {"link": "https://www.yna.co.kr/1", "publisher": "연합뉴스"},
        ]
        names = {"https://www.ulsanpress.net/news/1": "울산신문", "https://jtv.co.kr/news/article.php?id=1": ""}
        with mock.patch.object(scraper, "fetch_site_name", side_effect=lambda u: names[u]) as fetch:
            scraper.resolve_unknown_publishers(arts)
        self.assertEqual(fetch.call_count, 2)
        self.assertEqual([a["publisher"] for a in arts], ["울산신문", "울산신문", "jtv.co.kr", "언론사", "연합뉴스"])


class TrendingKeywordsTest(unittest.TestCase):
    def test_fallback_only_uses_keywords_present_in_articles(self):
        arts = [{"title": "GTX-C 노선 착공", "snippet": ""}, {"title": "고속도로 확장 개통", "snippet": ""}]
        kws = scraper.extract_trending_keywords(arts)
        self.assertNotIn("지천댐", kws)
        for kw in kws:
            self.assertTrue(any(kw.lower() in (a["title"] + a["snippet"]).lower() for a in arts), kw)

    def test_no_articles_no_keywords(self):
        self.assertEqual(scraper.extract_trending_keywords([]), [])


class NaverDirectDateTest(unittest.TestCase):
    HTML = """
    <div class="card"><a href="https://news.example.com/1"><span class="sds-headline1">교량 보수 공사 착공</span></a>
      <span class="sds-body1">본문</span>
      <span class="sds-profile-info-subtext">2026.10.20.</span></div>
    """

    def test_absolute_date_is_parsed_not_treated_as_now(self):
        resp = mock.Mock(status_code=200, text=self.HTML)
        now = datetime(2026, 10, 28, 21, 0, tzinfo=KST)
        with mock.patch.object(scraper.requests, "get", return_value=resp):
            items = scraper.scrape_naver_news_direct("교량", now_kst=now)
        self.assertEqual(len(items), 1)
        self.assertTrue(items[0]["pubDate"].startswith("Tue, 20 Oct 2026"))

    def test_http_error_returns_none(self):
        with mock.patch.object(scraper.requests, "get", return_value=mock.Mock(status_code=503, text="")):
            self.assertIsNone(scraper.scrape_naver_news_direct("교량"))


class FailureHandlingTest(unittest.TestCase):
    def test_zero_articles_does_not_overwrite(self):
        with mock.patch.object(scraper, "fetch_rss_for_term", return_value=None), \
                mock.patch.object(scraper, "scrape_naver_news_direct", return_value=None), \
                mock.patch.dict(os.environ, {"NAVER_CLIENT_ID": "", "NAVER_CLIENT_SECRET": ""}), \
                mock.patch.object(scraper.os, "replace") as replace:
            with self.assertRaises(scraper.NewsFetchError):
                scraper.scrape_civil_news()
            replace.assert_not_called()

    def test_api_hub_failure_falls_back_to_direct_and_is_reported(self):
        now = rfc822(datetime.now(KST))
        direct = [{"title": "국도 77호선 교량 착공", "link": "https://e.com/n1", "originallink": "https://e.com/n1",
                   "publisher": "테스트일보", "pubDate": now, "description": ""}]
        with mock.patch.object(scraper, "fetch_rss_for_term", return_value=[]), \
                mock.patch.object(scraper, "fetch_naver_news_for_term", return_value=None), \
                mock.patch.object(scraper, "scrape_naver_news_direct", return_value=direct) as direct_mock, \
                mock.patch.object(scraper, "cluster_related_articles", side_effect=lambda a: ([dict(x, related_articles=[]) for x in a], 0)), \
                mock.patch.dict(os.environ, {"NAVER_CLIENT_ID": "id", "NAVER_CLIENT_SECRET": "secret"}), \
                mock.patch.object(scraper.os, "replace"), \
                mock.patch("builtins.open", mock.mock_open()):
            result = scraper.scrape_civil_news()
        self.assertTrue(direct_mock.called)
        self.assertEqual(result["total_count"], 1)
        self.assertEqual(result["failed_sources"], ["네이버 API HUB"])

    def test_non_google_link_works_without_decoder(self):
        html = '<meta property="og:image" content="https://cdn.example.com/photo/1.jpg">'
        with mock.patch.object(scraper, "googlenewsdecoder", None), \
                mock.patch.object(scraper.requests, "get", return_value=mock.Mock(status_code=200, text=html)):
            self.assertEqual(scraper.extract_news_og_image("https://news.example.com/1"), "https://cdn.example.com/photo/1.jpg")
            self.assertEqual(scraper.extract_news_og_image("https://news.google.com/rss/articles/abc"), "")


if __name__ == "__main__":
    unittest.main()
