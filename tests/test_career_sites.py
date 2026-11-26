import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import career_sites  # noqa: E402

TODAY = "2026-11-27"


def ys_row(sn, kind, state, dept, title, period):
    return f"""<li onclick="link('/career/opportunities/{sn}');">
    <div class="top-wrap"><h3 class="blue">{kind}</h3><h4 class="blue">{state}</h4></div>
    <h2>{dept}</h2><h1>{title}</h1><h5>{period}</h5></li>"""


def ys_page(*rows):
    return '<section class="limited-wrap opportunities"><ul class="opportunities-list">' + "".join(rows) + "</ul></section>"


def kict_row(sn, title, period, state="ing", label="진행중"):
    return f"""<ul class="notice"><li class="W8 m-hidden" aria-title="번호">1</li>
    <li class="title" aria-title="채용공고"><a href="/announcementRecruitWeb/getAnnouncementRecruitView.es"
      onclick="egov_recruit_detail(this.href, '{sn}', '1'); return false;">{title}</a></li>
    <li class="W20" aria-title="공고기간">{period}</li><li class="W10" aria-title="작성자">인적자원실</li>
    <li class="W15" aria-title="진행상태"><span class="state {state}">{label}</span></li></ul>"""


def kict_page(*rows):
    return '<div class="dbody" id="listView">' + "".join(rows) + "</div>"


class YooshinTest(unittest.TestCase):
    def test_open_civil_posting(self):
        jobs = career_sites.parse_yooshin(ys_page(ys_row(157, "경력", "모집중", "공항부(공항)", "경력직 채용", "2026.10.29 ~\n 2027.01.28 ")), TODAY)
        self.assertEqual(len(jobs), 1)
        j = jobs[0]
        self.assertEqual((j["id"], j["company"], j["title"], j["deadline_date"]), ("yooshin-157", "유신", "[공항부(공항)] 경력직 채용", "2027-01-28"))
        self.assertEqual(j["period"], "2026.10.29 ~ 2027.01.28")
        self.assertEqual(j["link"], "https://www.yooshin.com/career/opportunities/157")
        self.assertEqual((j["career"], j["fields"], j["source"]), ("경력", ["공항부(공항)"], career_sites.YOOSHIN))

    def test_rolling_posting_has_no_deadline(self):
        jobs = career_sites.parse_yooshin(ys_page(ys_row(153, "경력", "모집중", "교통인프라부문(도로부)", "전력망사업 경력직 채용(구조/토질)", "2026.09.29 ~\n  채용 시 마감 ")), TODAY)
        self.assertEqual((jobs[0]["deadline_date"], jobs[0]["period"]), ("", "2026.09.29 ~ 채용 시 마감"))

    def test_closed_expired_and_non_civil_dropped(self):
        page = ys_page(
            ys_row(148, "경력", "마감", "해외업무부", "토목 경력직", "2026.07.06 ~ 2027.10.30"),          # 사이트가 마감 표시
            ys_row(150, "경력", "모집중", "도로부", "도로 경력직", "2026.07.06 ~ 2026.11.26"),           # 모집중 표시지만 날짜가 지남
            ys_row(151, "경력", "모집중", "해외업무부(해외업무)", "자금·채권관리 정규직 채용", "2026.11.01 ~ 2026.12.30"),  # 토목 무관
            ys_row(152, "공채", "모집중", "2027년", "(주)유신 2027년 신입사원 공개채용", "2026.11.20 ~ 2026.12.01"))  # 전 직군 공채는 포함
        self.assertEqual([j["id"] for j in career_sites.parse_yooshin(page, TODAY)], ["yooshin-152"])

    def test_layout_change_raises(self):
        with self.assertRaises(career_sites.ParseError):
            career_sites.parse_yooshin("<html>점검 중</html>", TODAY)
        with self.assertRaises(career_sites.ParseError):  # 줄은 있는데 날짜를 하나도 못 읽으면 구조가 바뀐 것
            career_sites.parse_yooshin(ys_page(ys_row(1, "경력", "모집중", "도로부", "도로", "상시")), TODAY)

    def test_empty_list_is_fine(self):
        self.assertEqual(career_sites.parse_yooshin(ys_page(), TODAY), [])


class KictTest(unittest.TestCase):
    def test_open_student_posting(self):
        jobs = career_sites.parse_kict(kict_page(kict_row(3351, "2027년(1회) 연수직(학생연구원, 인턴) 채용 공고", "2026/11/20 ~ 2026/12/01")), TODAY)
        j = jobs[0]
        self.assertEqual((j["id"], j["company"], j["deadline_date"], j["period"]), ("kict-3351", "한국건설기술연구원", "2026-12-01", "2026.11.20 ~ 2026.12.01"))
        self.assertEqual(j["link"], "https://www.kict.re.kr/announcementRecruitWeb/getAnnouncementRecruitView.es?mid=a10513030000&id=3351")
        self.assertTrue(j["is_intern"])
        self.assertEqual(j["career"], "인턴")

    def test_in_progress_badge_after_deadline_is_dropped(self):
        # 실제로 마감 지난 공고에 '진행중'이 남아 있어요
        page = kict_page(kict_row(3340, "2027년 전기 학·연협동 학생연구원 채용 공고", "2026/09/08 ~ 2026/09/18"),
                         kict_row(3339, "2026년 연수직 채용", "2026/11/20 ~ 2026/12/01", "end", "완료"),
                         kict_row(3348, "2026년 3차 장애인 제한경쟁(기간제근로자) 채용공고", "2026/11/20 ~ 2026/12/01"))
        self.assertEqual(career_sites.parse_kict(page, TODAY), [])

    def test_layout_change_raises(self):
        with self.assertRaises(career_sites.ParseError):
            career_sites.parse_kict("<html></html>", TODAY)
        with self.assertRaises(career_sites.ParseError):
            career_sites.parse_kict(kict_page(kict_row(1, "연수직 채용", "상시 모집")), TODAY)


class CollectTest(unittest.TestCase):
    def test_fetch_uses_safe_http_with_host_lock(self):
        r = mock.Mock(status_code=200, text=ys_page())
        with mock.patch.object(career_sites.safe_http, "fetch", return_value=r) as f:
            self.assertEqual(career_sites.collect_yooshin(TODAY), [])
        self.assertEqual(f.call_args.kwargs["hosts"], {"www.yooshin.com"})
        self.assertIn("civil-news-hub", f.call_args.kwargs["headers"]["User-Agent"])

    def test_http_error_raises(self):
        with mock.patch.object(career_sites.safe_http, "fetch", return_value=mock.Mock(status_code=503, text="")):
            with self.assertRaises(career_sites.ParseError):
                career_sites.collect_kict(TODAY)


if __name__ == "__main__":
    unittest.main()


class CategoryNameTest(unittest.TestCase):
    def test_same_as_job_scraper(self):
        import job_scraper
        for cid, name in career_sites.CATEGORY_NAMES.items():
            self.assertEqual(job_scraper.CATEGORY_NAMES[cid], name)


def rc(sn, title, end, status="IN_SUBMISSION", career="CAREER", kind="GENERAL", tags=("수시",)):
    return {"positionSn": sn, "title": title, "submissionStatus": status, "openStatus": "OPEN", "careerType": career,
            "recruitmentType": kind, "startDateTime": "2026-11-20T00:00:00", "endDateTime": end,
            "tagList": [{"tagSn": 1, "tagName": t} for t in tags]}


def rc_page(*rows):
    return {"pagination": {"page": 1, "size": 100, "totalCount": len(rows), "totalPages": 1}, "list": list(rows)}


class RecruiterTest(unittest.TestCase):
    def parse(self, data, site=None):
        return career_sites.parse_recruiter(data, site or career_sites.RECRUITER_SITES[0], TODAY)

    def test_open_civil_posting(self):
        j = self.parse(rc_page(rc(1, "[DL이앤씨] 토목사업본부 교량 경력직 채용", "2026-12-27T23:59:59")))[0]
        self.assertEqual((j["id"], j["company"], j["deadline_date"], j["period"]), ("dlenc-1", "DL이앤씨", "2026-12-27", "2026.11.20 ~ 2026.12.27"))
        self.assertEqual(j["link"], "https://dlenc.recruiter.co.kr/career/jobs/1")
        self.assertEqual((j["career"], j["category_id"], j["tags"]), ("경력", "builder", ["수시"]))

    def test_new_grad_open_hiring_is_kept(self):
        j = self.parse(rc_page(rc(2, "2026년 GS건설 하반기 신입사원 채용", "2026-12-01T23:00:59", career="NEW", tags=("신입",))))[0]
        self.assertEqual(j["career"], "신입")

    def test_closed_expired_non_civil_dropped(self):
        page = rc_page(rc(3, "토목 경력직", "2026-12-27T23:59:59", status="POST_SUBMISSION"),  # 접수 끝
                       rc(4, "토목 경력직", "2026-11-26T23:59:59"),                             # 날짜 지남
                       rc(5, "[DL이앤씨] 건축구조모듈러팀(재료part) 경력직 채용", "2026-12-27T23:59:59"),  # 건축 '구조'
                       rc(6, "[DL이앤씨] 주택사업본부 하자소송관리 경력직 채용", "2026-12-09T23:59:59"))
        self.assertEqual(self.parse(page), [])

    def test_permanent_pool_is_rolling(self):
        j = self.parse(rc_page(rc(7, "토목 시공 상시 채용", "2028-12-31T23:59:59", kind="PERMANENT", career="NEW_CAREER")))[0]
        self.assertEqual((j["deadline_date"], j["period"], j["career"]), ("", "2026.11.20 ~ 채용 시 마감", "신입·경력"))

    def test_bad_shape_raises(self):
        for bad in [{"code": "IllegalArgumentException"}, [], {"pagination": {}, "list": [{"positionSn": 1}]}]:
            with self.subTest(bad=bad), self.assertRaises(career_sites.ParseError):
                self.parse(bad)

    def test_collect_posts_with_prefix_and_host_lock(self):
        r = mock.Mock(status_code=200)
        r.json.return_value = rc_page()
        with mock.patch.object(career_sites.safe_http, "fetch", return_value=r) as f:
            self.assertEqual(career_sites.collect_recruiter(career_sites.RECRUITER_SITES[2], TODAY), [])
        kw = f.call_args.kwargs
        self.assertEqual(kw["hosts"], {"api-recruiter.recruiter.co.kr"})
        self.assertEqual(kw["headers"]["prefix"], "dohwa.recruiter.co.kr")
        self.assertEqual(kw["json_body"]["pageableRq"]["page"], 1)

    def test_sites_list_has_all_sources(self):
        self.assertEqual([n for n, _ in career_sites.SITES],
                         ["유신 채용 페이지", "한국건설기술연구원 채용 페이지", "DL이앤씨 채용 페이지", "GS건설 채용 페이지", "도화엔지니어링 채용 페이지"])
