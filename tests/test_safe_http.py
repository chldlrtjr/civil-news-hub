import io
import os
import sys
import unittest
from datetime import date
from unittest import mock

import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import safe_http  # noqa: E402
import scraper  # noqa: E402
import contest_poster_reader as reader  # noqa: E402
import jbnu_contest_scraper as jbnu  # noqa: E402
import swuniv_scraper  # noqa: E402

# 가짜 DNS: 호스트 → IP (네트워크 없이)
DNS = {
    "news.example.com": "93.184.216.34",
    "www.jbnu.ac.kr": "203.254.129.1",
    "swuniv.jbnu.ac.kr": "203.254.129.2",
    "intranet.example.com": "10.0.0.5",
    "metadata.example.com": "169.254.169.254",
    "mapped.example.com": "::ffff:127.0.0.1",
    "other.example.org": "8.8.8.8",
    # is_global 이 True 로 나오지만 막아야 하는 주소 (검수 I-1)
    "nat64.example.com": "64:ff9b::7f00:1",
    "translated.example.com": "::ffff:0:127.0.0.1",
    "compat.example.com": "::127.0.0.1",
    "mcast.example.com": "224.0.0.1",
    "mcast6.example.com": "ff02::1",
}


def fake_dns(host, port, *a, **k):
    ip = host if host[0].isdigit() or ":" in host else DNS[host]
    return [(None, None, None, "", (ip, port))]


class Raw:
    def __init__(self, data, clock=None):
        self.buf, self.clock = io.BytesIO(data), clock

    def read1(self, n, decode_content=True):
        if self.clock:
            self.clock.append(self.clock[-1] + 4)  # 읽을 때마다 4초씩 흐름 (조금씩 흘려 보내는 서버)
        return self.buf.read(n)

    def close(self):
        pass


def resp(status=200, body=b"", headers=None, clock=None):
    r = requests.Response()
    r.status_code = status
    r.headers.update(headers or {"Content-Type": "text/html; charset=utf-8"})
    r.raw = Raw(body, clock)
    return r


class SafeFetchTest(unittest.TestCase):
    def setUp(self):
        p = mock.patch.object(safe_http.socket, "getaddrinfo", side_effect=fake_dns)
        p.start()
        self.addCleanup(p.stop)

    def get(self, *responses):
        return mock.patch.object(safe_http.requests, "get", side_effect=list(responses))

    def test_normal_response_passes(self):
        with self.get(resp(body="<p>안녕</p>".encode())) as get:
            r = safe_http.fetch("https://news.example.com/a", headers={"User-Agent": "x"}, timeout=4)
        self.assertEqual((r.status_code, r.text), (200, "<p>안녕</p>"))
        self.assertEqual(get.call_args.kwargs["allow_redirects"], False)
        self.assertTrue(get.call_args.kwargs["stream"])
        self.assertEqual(get.call_args.kwargs["headers"], {"User-Agent": "x"})

    def test_public_redirect_is_followed(self):
        with self.get(resp(302, headers={"Location": "https://other.example.org/b"}), resp(body=b"ok")) as get:
            r = safe_http.fetch("https://news.example.com/a")
        self.assertEqual((r.content, r.url), (b"ok", "https://other.example.org/b"))
        self.assertEqual(get.call_args.args[0], "https://other.example.org/b")

    def test_redirect_to_internal_address_is_refused(self):
        for loc in ["http://127.0.0.1:6800/", "http://intranet.example.com/", "http://metadata.example.com/latest",
                    "http://[::1]/", "http://mapped.example.com/", "/x"]:
            with self.subTest(loc=loc), self.get(resp(301, headers={"Location": loc})) as get:
                start = "http://127.0.0.1/a" if loc == "/x" else "https://news.example.com/a"
                with self.assertRaises(safe_http.BlockedError):
                    safe_http.fetch(start)
                self.assertLessEqual(get.call_count, 1)

    def test_non_web_scheme_is_refused(self):
        for url in ["file:///etc/passwd", "ftp://news.example.com/a", "gopher://news.example.com/"]:
            with self.subTest(url=url), self.get() as get:
                with self.assertRaises(safe_http.BlockedError):
                    safe_http.fetch(url)
                get.assert_not_called()

    def test_too_many_redirects(self):
        hops = [resp(302, headers={"Location": f"https://news.example.com/{i}"}) for i in range(5)]
        with self.get(*hops) as get, self.assertRaises(safe_http.BlockedError):
            safe_http.fetch("https://news.example.com/a")
        self.assertEqual(get.call_count, 4)  # 처음 1번 + 리다이렉트 3번

    def test_declared_size_over_limit_gives_up_without_reading(self):
        big = resp(body=b"x", headers={"Content-Type": "image/png", "Content-Length": str(11 * 1024 * 1024)})
        with self.get(big), self.assertRaises(safe_http.BlockedError):
            safe_http.fetch("https://news.example.com/p.png", image=True)
        self.assertEqual(big.raw.buf.tell(), 0)

    def test_html_declared_over_limit_is_read_and_cut(self):
        n = safe_http.HTML_MAX + 5000
        with self.get(resp(body=b"a" * n, headers={"Content-Type": "text/html", "Content-Length": str(n)})):
            self.assertEqual(len(safe_http.fetch("https://news.example.com/a").content), safe_http.HTML_MAX)

    def test_malformed_content_length_is_ignored(self):
        for cl in ["10, 10", "abc", "-5", " "]:
            with self.subTest(cl=cl):
                with self.get(resp(body=b"<p>ok</p>", headers={"Content-Type": "text/html", "Content-Length": cl})):
                    self.assertEqual(safe_http.fetch("https://news.example.com/a").content, b"<p>ok</p>")
                with self.get(resp(body=b"img", headers={"Content-Type": "image/png", "Content-Length": cl})):
                    self.assertEqual(safe_http.fetch("https://news.example.com/p", image=True).content, b"img")

    def test_backslash_userinfo_trick_is_refused(self):
        # urlsplit 은 www.jbnu.ac.kr 로, requests(urllib3)는 127.0.0.1:6800 으로 읽는 주소 (검수 C-1 재현)
        url = "http://127.0.0.1:6800\\@www.jbnu.ac.kr/common/file.do"
        self.assertFalse(safe_http.allowed(url, safe_http.JBNU_HOSTS))
        for hosts in (safe_http.JBNU_HOSTS, None):
            with self.subTest(hosts=hosts), self.get() as get:
                with self.assertRaises(safe_http.BlockedError):
                    safe_http.fetch(url, hosts=hosts)
                get.assert_not_called()
        with self.get(resp(302, headers={"Location": url})) as get, self.assertRaises(safe_http.BlockedError):
            safe_http.fetch("https://www.jbnu.ac.kr/a", hosts=safe_http.JBNU_HOSTS)
        self.assertEqual(get.call_count, 1)  # 리다이렉트 Location 도 같은 검사

    def test_odd_characters_userinfo_and_bad_port_are_refused(self):
        for url in ["https://user@www.jbnu.ac.kr/a", "https://a:b@news.example.com/", "https://news.example.com/a b",
                    "https://news.example.com/a\tb", "https://news.example.com/\x00", "https://news.example.com/\x7f",
                    "https://news.example.com\\x/", " https://news.example.com/", "https://news.example.com/a\n",
                    "https://news.example.com:99999/", "https://news.example.com:x/"]:
            with self.subTest(url=url), self.get() as get:
                self.assertFalse(safe_http.allowed(url))
                with self.assertRaises(safe_http.BlockedError):
                    safe_http.fetch(url)
                get.assert_not_called()
        self.assertTrue(safe_http.allowed("https://WWW.JBNU.ac.kr:443/a?x=1&y=%20#t", safe_http.JBNU_HOSTS))
        self.assertTrue(safe_http.allowed("http://[2001:db8::1]:8080/a"))

    def test_special_addresses_that_look_global_are_refused(self):
        for host in ["nat64.example.com", "translated.example.com", "compat.example.com", "mcast.example.com",
                     "mcast6.example.com", "0.0.0.0", "[::]"]:
            with self.subTest(host=host), self.get() as get:
                with self.assertRaises(safe_http.BlockedError):
                    safe_http.fetch(f"http://{host}/")
                get.assert_not_called()

    def test_html_over_limit_is_cut(self):
        with self.get(resp(body=b"a" * (safe_http.HTML_MAX + 5000))):
            r = safe_http.fetch("https://news.example.com/a")
        self.assertEqual(len(r.content), safe_http.HTML_MAX)

    def test_image_over_limit_gives_up(self):
        with self.get(resp(body=b"a" * (safe_http.IMAGE_MAX + 1), headers={"Content-Type": "image/png"})), \
                self.assertRaises(safe_http.BlockedError):
            safe_http.fetch("https://news.example.com/p.png", image=True)

    def test_image_must_have_image_type(self):
        for ctype in ["text/html", "application/octet-stream", "image/svg+xml", ""]:
            with self.subTest(ctype=ctype), self.get(resp(body=b"x", headers={"Content-Type": ctype})), \
                    self.assertRaises(safe_http.BlockedError):
                safe_http.fetch("https://news.example.com/p", image=True)
        with self.get(resp(body=b"img", headers={"Content-Type": "image/JPEG; q=1"})):
            self.assertEqual(safe_http.fetch("https://news.example.com/p", image=True).content, b"img")

    def test_host_outside_allow_list_is_refused(self):
        with self.get() as get, self.assertRaises(safe_http.BlockedError):
            safe_http.fetch("https://other.example.org/common/file.do", hosts=safe_http.JBNU_HOSTS)
        get.assert_not_called()
        with self.get(resp(302, headers={"Location": "https://other.example.org/x"})), \
                self.assertRaises(safe_http.BlockedError):
            safe_http.fetch("https://www.jbnu.ac.kr/a", hosts=safe_http.JBNU_HOSTS)

    def test_total_time_limit(self):
        clock = [0]
        with self.get(resp(body=b"a" * 1_000_000, clock=clock)), \
                mock.patch.object(safe_http.time, "monotonic", side_effect=lambda: clock[-1]), \
                self.assertRaises(safe_http.BlockedError):
            safe_http.fetch("https://news.example.com/a", deadline=10)


class CallerTest(unittest.TestCase):
    """호출부가 안전 모듈을 거치는지 (네트워크 없이)"""

    def setUp(self):
        p = mock.patch.object(safe_http.socket, "getaddrinfo", side_effect=fake_dns)
        p.start()
        self.addCleanup(p.stop)

    def test_article_redirected_inside_gives_empty_meta(self):
        with mock.patch.object(safe_http.requests, "get",
                               return_value=resp(302, headers={"Location": "http://127.0.0.1:43829/"})) as get:
            meta = scraper.fetch_article_meta("https://news.example.com/1")
            self.assertEqual(scraper.fetch_site_name("https://news.example.com/1"), "")
        self.assertEqual(meta, {"image": "", "description": ""})
        self.assertEqual(get.call_count, 2)

    def test_article_euc_kr_still_decoded(self):
        html = '<meta property="og:site_name" content="전북일보 - 지역 신문">'.encode("euc-kr")
        with mock.patch.object(safe_http.requests, "get", return_value=resp(body=html, headers={"Content-Type": "text/html"})):
            self.assertEqual(scraper.fetch_site_name("https://news.example.com/1"), "전북일보")

    def test_poster_off_allow_list_is_not_downloaded(self):
        with mock.patch.object(safe_http.requests, "get") as get, mock.patch.object(reader, "ask_gemini") as ask:
            for url in ["file:///etc/passwd", "https://other.example.org/common/file.do?x=1"]:
                with self.subTest(url=url), self.assertRaises(safe_http.BlockedError):
                    reader.read_poster("1", url, date(2026, 10, 1), jbnu._find_dates, {}, "k")
        get.assert_not_called()
        ask.assert_not_called()

    def test_poster_must_be_image(self):
        with mock.patch.object(safe_http.requests, "get", return_value=resp(body=b"<html>")), \
                mock.patch.object(reader, "ask_gemini") as ask, self.assertRaises(safe_http.BlockedError):
            reader.read_poster("1", "https://www.jbnu.ac.kr/common/file.do?x=1", date(2026, 10, 1), jbnu._find_dates, {}, "k")
        ask.assert_not_called()

    def test_jbnu_poster_src_must_be_jbnu(self):
        def page(src):
            return f'<div class="com-post-content-01">본문</div><img src="{src}" style="max-width:100%">'.encode()
        cases = {
            "/common/file.do?id=1": "https://www.jbnu.ac.kr/common/file.do?id=1",
            "file:///etc/common/file.do": "",
            "//other.example.org/common/file.do": "",
            "https://other.example.org/common/file.do": "",
        }
        for src, want in cases.items():
            with self.subTest(src=src), mock.patch.object(safe_http.requests, "get", return_value=resp(body=page(src))):
                self.assertEqual(jbnu._read_post_detail("1"), ("본문", want))

    def test_swuniv_offsite_link_is_not_fetched(self):
        with mock.patch.object(safe_http.requests, "get") as get, mock.patch.object(swuniv_scraper.time, "sleep"):
            self.assertIsNone(swuniv_scraper.safe_fetch("file:///etc/passwd"))
            self.assertIsNone(swuniv_scraper.safe_fetch("https://other.example.org/x"))
        get.assert_not_called()
        with mock.patch.object(safe_http.requests, "get", return_value=resp(body="표".encode())):
            self.assertEqual(swuniv_scraper.safe_fetch("https://swuniv.jbnu.ac.kr/main/jbnusw?gc=Program"), "표")


if __name__ == "__main__":
    unittest.main()
