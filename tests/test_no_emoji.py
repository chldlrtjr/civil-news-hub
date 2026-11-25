"""웹페이지 어디에도 이모지를 쓰지 않는다 (사용자 규칙, 2026-11-19)"""
import glob
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE_FILES = sorted(os.path.relpath(p, ROOT) for pat in ("*.html", "static/**/*.js")
                    for p in glob.glob(os.path.join(ROOT, pat), recursive=True)
                    if not p.endswith("cnh_data_bundle.js"))  # \uC218\uC9D1 \uB370\uC774\uD130 \uBC88\uB4E4(\uD654\uBA74\uC5D0 \uC548 \uC4F0\uB294 \uC774\uBAA8\uC9C0 \uD544\uB4DC \uD3EC\uD568)\uC740 \uC81C\uC678
EMOJI = re.compile("[\U0001F000-\U0001FAFF\u2600-\u27BF\u2B00-\u2BFF\uFE0F\u231A\u231B\u23E9-\u23FA\u25FD\u25FE\u203C\u2049]")


def test_no_emoji_on_site():
    hits = []
    for name in SITE_FILES:
        path = os.path.join(ROOT, name)
        text = open(path, encoding="utf-8").read()
        for m in EMOJI.finditer(text):
            line = text.count("\n", 0, m.start()) + 1
            hits.append((name, line, text[max(0, m.start() - 20):m.end() + 20]))
    assert hits == [], hits
