import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import daily_digest as dd


def art(i, day, cat="road_rail", related=0, opinion=False, hour=10):
    return {
        "id": str(i), "title": f"기사 {i}", "link": f"https://ex.com/{i}", "publisher": f"언론{i}",
        "category_id": cat, "category_name": "도로", "snippet": "첫 문장이다. 둘째 문장이다. 셋째.",
        "iso_date": f"2026-11-{day:02d}T{hour:02d}:00:00+09:00", "is_opinion": opinion,
        "related_articles": [{"publisher": f"타사{i}-{k}", "title": "t"} for k in range(related)],
    }


def test_only_target_date_and_no_opinion():
    arts = [art(1, 5), art(2, 6), art(3, 5, opinion=True)]
    picked = dd.select_top_articles(arts, date(2026, 11, 5))
    assert [a["id"] for a in picked] == ["1"]


def test_kst_date_boundary():
    a = art(1, 5)
    a["iso_date"] = "2026-11-04T16:00:00+00:00"  # = 11-05 01:00 KST
    assert dd.select_top_articles([a], date(2026, 11, 5))


def test_ranked_by_coverage_without_category_cap():
    arts = [art(1, 5, "road_rail", 9), art(2, 5, "road_rail", 8), art(3, 5, "road_rail", 7),
            art(4, 5, "water_port", 1), art(5, 5, "general", 0), art(6, 5, "road_rail", 6)]
    picked = [a["id"] for a in dd.select_top_articles(arts, date(2026, 11, 5))]
    assert picked == ["1", "2", "3", "6", "4"]  # 같은 분야도 보도량 순 그대로


def test_coverage_dedupes_publishers():
    a = art(1, 5)
    a["related_articles"] = [{"publisher": "언론1"}, {"publisher": "A"}, {"publisher": "A"}]
    assert dd.coverage_count(a) == 2


def test_messages_within_telegram_limits():
    items = dd.build_items([art(i, 5, related=2) for i in range(5)], use_ai=False)
    cap = dd.build_caption(items, date(2026, 11, 5))
    detail = dd.build_detail_message(items, date(2026, 11, 5))
    assert cap.startswith("📰 11월 5일(목) 토목 소식 Top 5")
    assert len(cap) <= dd.CAPTION_LIMIT and len(detail) <= dd.MESSAGE_LIMIT
    assert "외 2곳 보도" in detail


def test_render_cards_count():
    items = dd.build_items([art(i, 5) for i in range(5)], use_ai=False)
    images = dd.render_cards(items, date(2026, 11, 5))
    assert len(images) == 6 and all(img[:2] == b"\xff\xd8" for img in images)


def test_gemini_busy_retries_then_next_model(monkeypatch):
    import json as _json

    class R:
        def __init__(self, code, items=None):
            self.status_code, self.ok, self.text = code, code == 200, ""
            self._items = items

        def json(self):
            return {"candidates": [{"content": {"parts": [{"text": _json.dumps(self._items)}]}}]}

    arts = [art(1, 5), art(2, 5)]
    good = [{"headline": "h", "summary": "s"}] * 2
    calls = []

    def fake_post(url, **kw):
        calls.append(url.split("/models/")[1].split(":")[0])
        return R(503) if calls[-1] == "busy-model" else R(200, good)

    monkeypatch.setenv("GEMINI_API_KEY", "k")
    monkeypatch.setenv("GEMINI_MODEL", "busy-model")
    monkeypatch.setattr(dd.requests, "post", fake_post)
    monkeypatch.setattr(dd.time, "sleep", lambda s: None)
    assert dd.summarize_with_gemini(arts) == good
    assert calls == ["busy-model"] * dd.GEMINI_TRIES + ["gemini-3.6-flash"]


def test_fallback_strips_byline_and_cuts_title_at_word():
    a = art(1, 5)
    a["title"] = "태영건설 시공 고속도로 현장서 20대 하청 근로자 끼임 사망…중대재해 수사 착수"
    a["snippet"] = "[전국뉴스=오명진 기자] 겨울철 제설이 시작됐다. 장비를 늘렸다."
    fb = dd.fallback_summary(a)
    assert fb["summary"] == "겨울철 제설이 시작됐다. 장비를 늘렸다."
    assert fb["headline"].endswith("…") and len(fb["headline"]) <= 41
    assert "중대재해 수…" not in fb["headline"]
    for s in ["(서울=연합뉴스) 홍길동 기자 = 본문이다.", "홍길동 기자 = 본문이다."]:
        assert dd.strip_byline(s) == "본문이다."
    assert dd.strip_byline("[선제적 제설]한국도로공사") == "[선제적 제설]한국도로공사"  # 기사 말머리는 유지
