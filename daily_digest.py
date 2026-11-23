#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Civil News Hub - 아침 토목 뉴스 Top 5 카드뉴스 (텔레그램 발송)

jcloud에서 만들고(08:40 --build) GitHub Actions는 발송만(09:00 --send-built) 해요.
jcloud는 학교 DNS가 api.telegram.org를 막아서 직접 못 보내요.
  1) data/news.json 에서 '전날(KST)' 기사만 추림
  2) 보도량(같은 사건을 다룬 언론사 수) 기준 Top 5 선정
  3) Codex(ChatGPT 계정 로그인)로 "~했어요" 말투 2~3문장 요약 (실패하면 기사 스니펫으로 대체)
  → data/digest.json 으로 push
  4) Actions: 1080x1350 카드 이미지 6장(표지 + 기사 5장) 생성
  5) 텔레그램 봇으로 앨범(sendMediaGroup) + 전체 캡션/원문 링크(sendMessage) 발송

사용법:
  python daily_digest.py --build         # (jcloud) 요약만 만들어 data/digest.json 저장
  python daily_digest.py --send-built    # (Actions) data/digest.json 으로 카드 만들어 발송
  python daily_digest.py                 # 한 번에 생성 후 발송 (같은 날짜는 1회만)
  python daily_digest.py --dry-run       # 발송 없이 이미지·캡션만 data/digest_out/ 에 저장
  python daily_digest.py --date 2026-11-05 --force
  python daily_digest.py --get-chat-id   # 봇에게 아무 메시지나 보낸 뒤 실행 → chat_id 확인

필요 환경변수(.env): TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (발송할 때만). 요약에는 codex CLI 로그인이 필요해요
"""

import os
import io
import re
import sys
import json
import argparse
import subprocess
import tempfile
from datetime import datetime, timedelta, timezone

import requests
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))

NEWS_FILE = os.path.join(BASE_DIR, "data", "news.json")
OUT_DIR = os.path.join(BASE_DIR, "data", "digest_out")
SENT_STATE_FILE = os.path.join(BASE_DIR, "data", ".digest_last_sent")
BUILT_FILE = os.path.join(BASE_DIR, "data", "digest.json")  # jcloud가 만들어 push, Actions가 읽어 발송
SITE_URL = "https://civil-news-hub.vercel.app/"

KST = timezone(timedelta(hours=9))
TOP_N = 5
WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"]

TELEGRAM_API = "https://api.telegram.org/bot{token}/{method}"
CAPTION_LIMIT = 1024   # 텔레그램 사진 캡션 최대 길이
MESSAGE_LIMIT = 4096   # 텔레그램 일반 메시지 최대 길이


# ---------------------------------------------------------------------------
# 1. 기사 선정
# ---------------------------------------------------------------------------
def article_date_kst(article):
    raw = article.get("iso_date") or ""
    try:
        return datetime.fromisoformat(raw).astimezone(KST).date()
    except ValueError:
        return None


def coverage_count(article):
    """같은 사건을 다룬 언론사 수 (본 기사 포함, 언론사 중복 제거)"""
    publishers = {article.get("publisher") or ""}
    for rel in article.get("related_articles") or []:
        publishers.add(rel.get("publisher") or rel.get("link") or "")
    publishers.discard("")
    return max(1, len(publishers))


def select_top_articles(articles, target_date, top_n=TOP_N):
    """target_date(KST) 기사 중 보도량 → 최신순으로 정렬해 top_n 선정 (분야 제한 없음)"""
    pool = [
        a for a in articles
        if article_date_kst(a) == target_date and not a.get("is_opinion") and a.get("title")
    ]
    pool.sort(key=lambda a: (coverage_count(a), a.get("iso_date") or ""), reverse=True)
    return pool[:top_n]


# ---------------------------------------------------------------------------
# 2. 요약 (Gemini, 실패 시 스니펫 대체)
# ---------------------------------------------------------------------------
def clean_text(text):
    text = re.sub(r"\s+", " ", text or "").strip()
    return re.sub(r"\.{2,}$|…$", "", text).strip()


BRACKET_BYLINE_RE = re.compile(r"^\s*[\[(【][^\])】]*(?:=|기자)[^\])】]*[\])】]\s*")  # [전국뉴스=오명진 기자] / (서울=연합뉴스)
NAME_BYLINE_RE = re.compile(r"^\s*[가-힣]{2,4}\s*(?:기자|특파원)\s*=\s*")  # 홍길동 기자 =


def strip_byline(text):
    return NAME_BYLINE_RE.sub("", BRACKET_BYLINE_RE.sub("", text))


def short_title(title, limit=40):
    """글자 수 제한을 넘으면 단어 경계에서 자르고 … 붙임"""
    if len(title) <= limit:
        return title
    cut = title[:limit]
    space = cut.rfind(" ")
    return (cut[:space] if space >= limit // 2 else cut).rstrip(" ·…,") + "…"


def fallback_summary(article):
    """완결된 문장('~다.' / '~요.')만 최대 2개 사용 — 스니펫 끝의 잘린 문장은 버림"""
    snippet = strip_byline(clean_text(article.get("snippet")))
    complete = re.findall(r"[^.]*?[다요]\.", snippet)
    body = " ".join(s.strip() for s in complete[:2]).strip()
    if not body and snippet:
        body = snippet[:110] + "…"
    return {"headline": short_title(clean_text(article.get("title"))), "summary": body or clean_text(article.get("title"))}


def build_prompt(articles):
    lines = []
    for i, a in enumerate(articles, 1):
        related = "; ".join(r.get("title", "") for r in (a.get("related_articles") or [])[:4])
        lines.append(
            f"[{i}] 제목: {a.get('title')}\n언론사: {a.get('publisher')}\n분야: {a.get('category_name')}\n"
            f"본문 일부: {clean_text(a.get('snippet'))}\n관련 보도 제목: {related or '없음'}"
        )
    return (
        "너는 토목·건설 분야 카드뉴스 에디터야. 아래 기사 각각을 요약해.\n"
        "규칙:\n"
        "- headline: 카드 제목, 22자 이내, 핵심 사실 위주, 낚시성 표현 금지\n"
        "- summary: 2~3문장, '~했어요/~래요' 같은 친근한 존댓말, 120자 안팎\n"
        "- 주어진 제목·본문·관련 보도에 있는 사실만 사용하고 추측·숫자 창작 금지\n"
        "- 특정 기관의 주장이나 계획이면 그렇다고 밝혀(예: '국토부 계획이에요')\n"
        '출력: JSON 배열만. 형식 [{"headline": "...", "summary": "..."}] , 기사 순서 유지\n\n'
        + "\n\n".join(lines)
    )


CODEX_TIMEOUT = 300  # 초
CODEX_TRIES = 2


def parse_ai_items(text, n):
    """Codex 답에서 JSON 배열만 꺼냄 (```json 펜스나 앞뒤 설명이 붙어도 됨)"""
    start, end = text.find("["), text.rfind("]")
    if start < 0 or end < start:
        return None
    try:
        items = json.loads(text[start:end + 1])
    except ValueError:
        return None
    if isinstance(items, list) and len(items) == n and all(isinstance(x, dict) for x in items):
        return items
    return None


def summarize_with_codex(articles):
    """jcloud에 ChatGPT 계정으로 로그인한 Codex CLI로 요약. 실패하면 None → 스니펫 요약"""
    prompt = build_prompt(articles)
    for attempt in range(CODEX_TRIES):
        with tempfile.TemporaryDirectory() as tmp:
            out = os.path.join(tmp, "answer.txt")
            try:
                r = subprocess.run(
                    ["codex", "exec", "--skip-git-repo-check", "--ephemeral", "-s", "read-only", "-C", tmp, "-o", out, "-"],
                    input=prompt, capture_output=True, text=True, encoding="utf-8", timeout=CODEX_TIMEOUT,
                )
            except (OSError, subprocess.TimeoutExpired) as e:
                print(f"[-] Codex 실행 실패: {e}")
                continue
            text = ""
            if os.path.exists(out):
                with open(out, encoding="utf-8") as f:
                    text = f.read()
        items = parse_ai_items(text, len(articles)) if r.returncode == 0 else None
        if items:
            print("[+] Codex 요약 완료")
            return items
        print(f"[-] Codex 요약 실패 ({attempt + 1}/{CODEX_TRIES}, 코드 {r.returncode}): {(r.stderr or text)[-300:]}")
    return None


def build_items(articles, use_ai=True):
    ai = summarize_with_codex(articles) if use_ai else None
    items = []
    for i, a in enumerate(articles):
        fb = fallback_summary(a)
        s = ai[i] if ai else {}
        items.append({
            "rank": i + 1,
            "headline": clean_text(s.get("headline")) or fb["headline"],
            "summary": clean_text(s.get("summary")) or fb["summary"],
            "title": a.get("title", ""),
            "link": a.get("link", ""),
            "publisher": a.get("publisher", ""),
            "category_id": a.get("category_id") or "general",
            "category_name": a.get("category_name") or "토목 종합",
            "coverage": coverage_count(a),
        })
    return items


# ---------------------------------------------------------------------------
# 3. 텍스트 (캡션 / 상세 메시지)
# ---------------------------------------------------------------------------
def date_label(d):
    return f"{d.month}월 {d.day}일({WEEKDAYS[d.weekday()]})"


def build_caption(items, target_date):
    head = f"📰 {date_label(target_date)} 토목 소식 Top {len(items)}\n옆으로 넘겨 보세요 👉\n\n"
    lines = [f"{it['rank']:02d} {it['headline']}" for it in items]
    return (head + "\n".join(lines))[:CAPTION_LIMIT]


def build_detail_message(items, target_date, with_links=True):
    parts = [f"<b>{date_label(target_date)} 토목 소식 Top {len(items)}</b>"]
    for it in items:
        publisher = html_escape(it["publisher"])
        source = f"<a href=\"{html_escape(it['link'])}\">{publisher}</a>" if with_links else publisher
        parts.append(
            f"<b>{it['rank']:02d} {html_escape(it['headline'])}</b>\n"
            f"{html_escape(it['summary'])}\n"
            f"└ {source}"
            + (f" 외 {it['coverage'] - 1}곳 보도" if it["coverage"] > 1 else "")
        )
    parts.append(f"🔎 더 보기: {SITE_URL}#news")
    text = "\n\n".join(parts)
    # HTML 태그 중간이 잘리면 parse 오류가 나므로 자르지 않고 링크를 빼서 재구성
    if len(text) > MESSAGE_LIMIT and with_links:
        return build_detail_message(items, target_date, with_links=False)
    return text


def html_escape(s):
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


# ---------------------------------------------------------------------------
# 4. 카드 이미지 (Pillow)
# ---------------------------------------------------------------------------
W, H = 1080, 1350
BG = (14, 22, 38)
PANEL = (24, 35, 58)
TEXT = (240, 244, 250)
MUTED = (150, 163, 186)
ACCENT = (255, 196, 61)
CATEGORY_COLORS = {
    "general": (96, 165, 250), "road_rail": (52, 211, 153), "water_port": (34, 211, 238),
    "tunnel_geo": (251, 191, 36), "smart_policy": (129, 140, 248),
}

FONT_CANDIDATES = {
    "bold": [
        "/usr/share/fonts/truetype/nanum/NanumGothicExtraBold.ttf",
        "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
        "C:/Windows/Fonts/malgunbd.ttf",
        "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    ],
    "regular": [
        "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "C:/Windows/Fonts/malgun.ttf",
        "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    ],
}


def load_font(weight, size):
    from PIL import ImageFont
    for path in [os.path.join(BASE_DIR, "static", "fonts", f"digest-{weight}.ttf")] + FONT_CANDIDATES[weight]:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    raise RuntimeError("한글 폰트를 찾지 못했어요. 서버에서 `sudo apt install -y fonts-nanum` 을 실행해 주세요.")


def wrap_text(draw, text, font, max_width, max_lines):
    """한글은 글자 단위, 공백 기준 우선으로 줄바꿈"""
    lines, current = [], ""
    for word in (text or "").split(" "):
        candidate = f"{current} {word}".strip()
        if draw.textlength(candidate, font=font) <= max_width:
            current = candidate
            continue
        if current:
            lines.append(current)
        current = ""
        for ch in word:  # 한 단어가 너무 길면 글자 단위로 자름
            if draw.textlength(current + ch, font=font) > max_width:
                lines.append(current)
                current = ch
            else:
                current += ch
    if current:
        lines.append(current)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        last = lines[-1]
        while last and draw.textlength(last + "…", font=font) > max_width:
            last = last[:-1]
        lines[-1] = last + "…"
    return lines


def draw_lines(draw, xy, lines, font, fill, spacing):
    x, y = xy
    for line in lines:
        draw.text((x, y), line, font=font, fill=fill)
        y += font.size + spacing
    return y


def draw_footer(draw, page, total):
    f = load_font("regular", 30)
    draw.text((80, H - 90), "Civil News Hub · 매일 아침 9시", font=f, fill=MUTED)
    label = f"{page} / {total}"
    draw.text((W - 80 - draw.textlength(label, font=f), H - 90), label, font=f, fill=MUTED)


def render_cover(items, target_date, total):
    from PIL import Image, ImageDraw
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((80, 90, 380, 150), radius=30, fill=ACCENT)
    d.text((110, 100), "토목 NEWS", font=load_font("bold", 36), fill=BG)
    d.text((80, 200), f"{target_date.year} · {WEEKDAYS[target_date.weekday()]}요일", font=load_font("regular", 40), fill=MUTED)
    d.text((80, 255), f"{target_date.month}월 {target_date.day}일", font=load_font("bold", 130), fill=TEXT)
    d.text((80, 410), f"어제 토목 소식 Top {len(items)}", font=load_font("bold", 64), fill=ACCENT)

    y = 540
    f_num, f_head = load_font("bold", 36), load_font("bold", 40)
    for it in items:
        color = CATEGORY_COLORS.get(it["category_id"], CATEGORY_COLORS["general"])
        d.rounded_rectangle((80, y, W - 80, y + 100), radius=20, fill=PANEL)
        d.rounded_rectangle((105, y + 25, 155, y + 75), radius=12, fill=color)
        num = str(it["rank"])
        d.text((130 - d.textlength(num, font=f_num) / 2, y + 28), num, font=f_num, fill=BG)
        line = wrap_text(d, it["headline"], f_head, W - 80 - 185 - 30, 1)[0]
        d.text((185, y + 27), line, font=f_head, fill=TEXT)
        y += 120
    draw_footer(d, 1, total)
    return img


def render_article(it, target_date, page, total):
    from PIL import Image, ImageDraw
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    color = CATEGORY_COLORS.get(it["category_id"], CATEGORY_COLORS["general"])

    d.text((80, 90), f"{it['rank']:02d}", font=load_font("bold", 150), fill=color)
    f_badge = load_font("bold", 32)
    badge_w = d.textlength(it["category_name"], font=f_badge) + 50
    d.rounded_rectangle((80, 290, 80 + badge_w, 350), radius=30, outline=color, width=3)
    d.text((105, 300), it["category_name"], font=f_badge, fill=color)
    d.text((W - 80 - d.textlength(date_label(target_date), font=f_badge), 300), date_label(target_date), font=f_badge, fill=MUTED)

    f_head = load_font("bold", 66)
    y = draw_lines(d, (80, 400), wrap_text(d, it["headline"], f_head, W - 160, 3), f_head, TEXT, 22)
    d.line((80, y + 30, 200, y + 30), fill=ACCENT, width=6)

    f_body = load_font("regular", 42)
    draw_lines(d, (80, y + 80), wrap_text(d, it["summary"], f_body, W - 160, 8), f_body, TEXT, 26)

    f_src = load_font("regular", 32)
    src = f"출처 · {it['publisher']}" + (f" 외 {it['coverage'] - 1}곳 보도" if it["coverage"] > 1 else "")
    d.text((80, H - 160), wrap_text(d, src, f_src, W - 160, 1)[0], font=f_src, fill=MUTED)
    draw_footer(d, page, total)
    return img


def render_cards(items, target_date):
    total = len(items) + 1
    cards = [render_cover(items, target_date, total)]
    cards += [render_article(it, target_date, i + 2, total) for i, it in enumerate(items)]
    out = []
    for img in cards:
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=92)
        out.append(buf.getvalue())
    return out


# ---------------------------------------------------------------------------
# 5. 텔레그램 발송
# ---------------------------------------------------------------------------
def telegram_call(method, token, **kwargs):
    try:
        resp = requests.post(TELEGRAM_API.format(token=token, method=method), timeout=60, **kwargs)
    except requests.RequestException as e:
        # 예외 메시지에 봇 토큰이 포함된 URL이 들어가므로 로그에 남지 않게 가림
        raise RuntimeError(f"텔레그램 {method} 연결 실패: {str(e).replace(token, '<TOKEN>')}") from None
    data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
    if not data.get("ok"):
        raise RuntimeError(f"텔레그램 {method} 실패: {resp.status_code} {resp.text[:300]}")
    return data["result"]


def send_to_telegram(images, caption, detail, token, chat_id):
    media, files = [], {}
    for i, img in enumerate(images):
        key = f"card{i}"
        files[key] = (f"{key}.jpg", img, "image/jpeg")
        entry = {"type": "photo", "media": f"attach://{key}"}
        if i == 0:
            entry["caption"] = caption
        media.append(entry)
    telegram_call("sendMediaGroup", token, data={"chat_id": chat_id, "media": json.dumps(media, ensure_ascii=False)}, files=files)
    telegram_call("sendMessage", token, data={
        "chat_id": chat_id, "text": detail, "parse_mode": "HTML", "disable_web_page_preview": "true",
    })


def print_chat_ids(token):
    updates = telegram_call("getUpdates", token, data={})
    if not updates:
        print("[*] 받은 메시지가 없어요. 텔레그램에서 봇에게 아무 메시지나 보낸 뒤 다시 실행해 주세요.")
    for u in updates:
        chat = (u.get("message") or u.get("channel_post") or {}).get("chat") or {}
        if chat:
            print(f"chat_id={chat.get('id')}  ({chat.get('type')}: {chat.get('title') or chat.get('first_name') or ''})")


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
def main():
    p = argparse.ArgumentParser(description="아침 토목 뉴스 Top 5 카드뉴스 (텔레그램)")
    p.add_argument("--date", help="대상 날짜 YYYY-MM-DD (기본: KST 기준 어제)")
    p.add_argument("--dry-run", action="store_true", help="발송하지 않고 data/digest_out/ 에 저장")
    p.add_argument("--force", action="store_true", help="이미 발송한 날짜여도 다시 발송")
    p.add_argument("--no-ai", action="store_true", help="Codex 요약 없이 스니펫 사용")
    p.add_argument("--build", action="store_true", help="요약만 만들어 data/digest.json 에 저장 (jcloud)")
    p.add_argument("--send-built", action="store_true", help="data/digest.json 으로 발송 (Actions)")
    p.add_argument("--get-chat-id", action="store_true", help="봇이 받은 메시지에서 chat_id 출력")
    args = p.parse_args()

    token = (os.environ.get("TELEGRAM_BOT_TOKEN") or "").strip()
    chat_id = (os.environ.get("TELEGRAM_CHAT_ID") or "").strip()

    if args.get_chat_id:
        if not token:
            sys.exit("[-] TELEGRAM_BOT_TOKEN 이 .env 에 없어요.")
        print_chat_ids(token)
        return

    target_date = (datetime.strptime(args.date, "%Y-%m-%d").date() if args.date
                   else (datetime.now(KST) - timedelta(days=1)).date())

    if not (args.dry_run or args.build or args.force) and os.path.exists(SENT_STATE_FILE):
        with open(SENT_STATE_FILE, encoding="utf-8") as f:
            if f.read().strip() == target_date.isoformat():
                print(f"[*] {target_date} 다이제스트는 이미 발송했어요. (--force 로 재발송)")
                return

    if args.send_built:
        with open(BUILT_FILE, encoding="utf-8") as f:
            built = json.load(f)
        # jcloud가 오늘 못 만들었으면 어제 것을 다시 보내지 않고 실패로 끝내 Actions 실패 메일로 알게 함
        if built.get("date") != target_date.isoformat():
            sys.exit(f"[-] jcloud가 만든 {target_date} 요약이 없어요 (있는 것: {built.get('date')})")
        items = built["items"]
    else:
        with open(NEWS_FILE, encoding="utf-8") as f:
            articles = json.load(f).get("articles", [])
        top = select_top_articles(articles, target_date)
        if not top:
            print(f"[-] {target_date} 기사가 없어 발송하지 않아요.")
            return
        items = build_items(top, use_ai=not args.no_ai)

    if args.build:
        with open(BUILT_FILE, "w", encoding="utf-8") as f:
            json.dump({"date": target_date.isoformat(), "items": items}, f, ensure_ascii=False, indent=1)
        print(f"[+] {target_date} 요약 저장: {BUILT_FILE}")
        return

    images = render_cards(items, target_date)
    caption = build_caption(items, target_date)
    detail = build_detail_message(items, target_date)

    if args.dry_run:
        os.makedirs(OUT_DIR, exist_ok=True)
        for i, img in enumerate(images):
            with open(os.path.join(OUT_DIR, f"card_{i}.jpg"), "wb") as f:
                f.write(img)
        with open(os.path.join(OUT_DIR, "message.txt"), "w", encoding="utf-8") as f:
            f.write(caption + "\n\n---\n\n" + detail)
        print(f"[+] dry-run 저장 완료: {OUT_DIR}")
        print(caption)
        return

    if not token or not chat_id:
        sys.exit("[-] TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 가 .env 에 없어요.")
    send_to_telegram(images, caption, detail, token, chat_id)
    with open(SENT_STATE_FILE, "w", encoding="utf-8") as f:
        f.write(target_date.isoformat())
    print(f"[+] {target_date} 토목 소식 Top {len(items)} 텔레그램 발송 완료")


if __name__ == "__main__":
    main()
