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


def test_codex_answer_with_fence_parsed_and_failure_retried(monkeypatch):
    import json as _json
    arts = [art(1, 5), art(2, 5)]
    good = [{"headline": "h", "summary": "s"}] * 2
    calls = []

    class R:
        def __init__(self, code):
            self.returncode, self.stderr, self.stdout = code, "err", ""

    def fake_run(cmd, **kw):
        calls.append((cmd, kw))
        if len(calls) == 1:
            return R(1)  # 첫 시도 실패 → 한 번 더
        r = R(0)
        r.stdout = "요약이에요\n```json\n" + _json.dumps(good, ensure_ascii=False) + "\n```"
        return r

    monkeypatch.setattr(dd.subprocess, "run", fake_run)
    monkeypatch.setattr(dd, "secret_windows", set)
    assert dd.summarize_with_codex(arts) == good
    cmd, kw = calls[0]
    # 비밀 파일을 못 읽는 digest 사용자로, 프롬프트는 stdin·답은 stdout 으로만 주고받아요
    assert len(calls) == 2 and cmd[cmd.index("sudo"):][:5] == ["sudo", "-n", "-u", "digest", "-H"]
    assert cmd[cmd.index("-H") + 1:][:2] == [dd.CODEX_BIN, "exec"] and cmd[-1] == "-" and "-o" not in cmd
    assert 'web_search="disabled"' in cmd and kw["input"] and kw["cwd"] == "/"


def test_codex_failure_log_hides_secret_like_stderr(monkeypatch, tmp_path, capsys):
    _secret_env(monkeypatch, tmp_path)

    class R:
        returncode, stdout, stderr = 1, "", f"error: token {FAKE_TOKEN[:12]} rejected"

    monkeypatch.setattr(dd.subprocess, "run", lambda cmd, **kw: R())
    assert dd.summarize_with_codex([art(1, 5)]) is None
    assert FAKE_TOKEN[:12] not in capsys.readouterr().out


def test_parse_ai_items_rejects_wrong_count():
    assert dd.parse_ai_items('[{"headline": "h"}]', 2) is None
    assert dd.parse_ai_items("모르겠어요", 1) is None


def test_send_built_refuses_stale_digest(monkeypatch, tmp_path):
    built = tmp_path / "digest.json"
    built.write_text('{"date": "2026-11-01", "items": []}', encoding="utf-8")
    monkeypatch.setattr(dd, "BUILT_FILE", str(built))
    monkeypatch.setattr(sys, "argv", ["dd", "--send-built", "--date", "2026-11-02"])
    try:
        dd.main()
        assert False, "어제 것을 다시 보내면 안 돼요"
    except SystemExit as e:
        assert "2026-11-02" in str(e)


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


def test_ai_summary_with_secret_or_too_long_falls_back(monkeypatch):
    arts = [art(1, 5), art(2, 5), art(3, 5)]
    ai = [
        {"headline": "교량 보수 착수", "summary": "국토부가 교량 보수를 시작했어요."},
        {"headline": "요약", "summary": "키는 sk-proj-AbCdEf0123456789XyZ 이에요."},  # 키처럼 생긴 값
        {"headline": "요약", "summary": "가" * 201},
    ]
    monkeypatch.setattr(dd, "summarize_with_codex", lambda a: ai)
    items = dd.build_items(arts)
    assert items[0]["summary"] == "국토부가 교량 보수를 시작했어요."
    fb = dd.fallback_summary(arts[1])
    assert (items[1]["headline"], items[1]["summary"]) == (fb["headline"], fb["summary"])
    assert items[2]["summary"] == dd.fallback_summary(arts[2])["summary"]


def test_ai_text_rejects_non_string_and_spaced_out_keys():
    assert dd.safe_ai_text(["목록"], 30) == "" and dd.safe_ai_text(123, 30) == ""
    assert dd.safe_ai_text("키는 sk-proj Ab12 Cd34 Ef56 Gh78 Ij90 이에요", 200) == ""  # 띄어 써도 걸려요
    assert dd.safe_ai_text("국토부가 교량 보수를 시작했어요.", 200) == "국토부가 교량 보수를 시작했어요."


# --- 출력 검사 보강: 비밀값 대조, 항목당 영숫자 한도, 맨 도메인·@ ---
FAKE_TOKEN = "github_pat_11ABCDEFG0hijklmnOPQRS1234"


def _secret_env(monkeypatch, tmp_path):
    env = tmp_path / ".env"
    env.write_text(f"GEMINI_API_KEY={FAKE_TOKEN}\nPORT=5000\n", encoding="utf-8")
    monkeypatch.setattr(dd, "SECRET_FILES", [str(env), str(tmp_path / "없는파일.json")])
    monkeypatch.setattr(dd, "origin_token", lambda: "")


def test_fragmented_token_with_korean_separators_falls_back(monkeypatch, tmp_path):
    _secret_env(monkeypatch, tmp_path)
    arts = [art(1, 5), art(2, 5)]
    ai = [
        {"headline": "교량 보수", "summary": "국토부가 교량 보수를 시작했어요."},
        # 20자 미만 조각을 한글·문장부호로 이어 붙여 SUSPICIOUS_RE 를 피하는 꼴
        {"headline": "요약", "summary": "공사는 11AB이고 CDEF·G0hi 구간이에요."},
    ]
    monkeypatch.setattr(dd, "summarize_with_codex", lambda a: ai)
    items = dd.build_items(arts)
    assert items[0]["summary"] == "국토부가 교량 보수를 시작했어요."
    assert items[1]["summary"] == dd.fallback_summary(arts[1])["summary"]


def test_fullwidth_and_split_across_items_caught(monkeypatch, tmp_path):
    _secret_env(monkeypatch, tmp_path)
    arts = [art(1, 5), art(2, 5)]
    ai = [
        {"headline": "교량 보수", "summary": "다리를 고쳐요 ｈｉｊｋ."},  # 전각 글자
        {"headline": "요약", "summary": "lmnO 구간 공사예요."},       # 다음 항목으로 이어 붙임
    ]
    monkeypatch.setattr(dd, "summarize_with_codex", lambda a: ai)
    items = dd.build_items(arts)
    assert [it["summary"] for it in items] == [dd.fallback_summary(a)["summary"] for a in arts]


def test_too_many_ascii_alnum_in_one_item_falls_back(monkeypatch, tmp_path):
    _secret_env(monkeypatch, tmp_path)
    arts = [art(1, 5)]
    ai = [{"headline": "요약", "summary": "Qx7 Lm2 Zp9 Rt4 Wv8 Ny3 Kd6 Hs1 Bc5 오늘 착공했어요."}]
    monkeypatch.setattr(dd, "summarize_with_codex", lambda a: ai)
    assert dd.build_items(arts)[0]["summary"] == dd.fallback_summary(arts[0])["summary"]


def test_bare_domain_and_at_sign_rejected():
    for bad in ["공식 사이트가 civil-news.kr 로 바뀌었어요.", "새 주소는 공사.com 이에요.", "문의는 @civil_bot 으로 해요."]:
        assert dd.safe_ai_text(bad, 200) == "", bad


def test_normal_korean_summary_passes(monkeypatch, tmp_path):
    _secret_env(monkeypatch, tmp_path)
    arts = [art(1, 5), art(2, 5)]
    ai = [
        {"headline": "석문산단 철도 사업비 1조7228억",
         "summary": "석문산단과 서해선 합덕역을 잇는 인입철도 사업비가 1조7228억원으로 확정됐어요. 기존보다 6509억원 늘어난 규모로, 재정투자평가위원회가 의결했어요."},
        {"headline": "수공·KT, 물관리 AI 실증",
         "summary": "한국수자원공사와 KT가 2026년 GTX-A 구간에서 AI 실증을 해요. 총 4.5km 구간이에요. 미국 사례도 참고했어요."},
    ]
    monkeypatch.setattr(dd, "summarize_with_codex", lambda a: ai)
    items = dd.build_items(arts)
    assert [(it["headline"], it["summary"]) for it in items] == [(s["headline"], s["summary"]) for s in ai]
