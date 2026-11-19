"""웹페이지 어디에도 이모지를 쓰지 않는다 (사용자 규칙, 2026-11-19)"""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE_FILES = ["index.html", "privacy.html", "mobile.html", "contests.html", "jobs.html",
              "static/data_adapter.js", "static/tracker_core.js"]
EMOJI = re.compile("[\U0001F000-\U0001FAFF\u2600-\u27BF\u2B00-\u2BFF\uFE0F]")


def test_no_emoji_on_site():
    hits = []
    for name in SITE_FILES:
        path = os.path.join(ROOT, name)
        if not os.path.exists(path):
            continue
        text = open(path, encoding="utf-8").read()
        for m in EMOJI.finditer(text):
            line = text.count("\n", 0, m.start()) + 1
            hits.append((name, line, text[max(0, m.start() - 20):m.end() + 20]))
    assert hits == [], hits
