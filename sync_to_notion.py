#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Notion 자동 포트폴리오 동기화 스크립트
NOTION_PORTFOLIO_GUIDE.md 내용을 Notion 공식 API를 통해 지정한 페이지로 자동 등록/동기화합니다.
"""

import os
import sys
import re
import json
import urllib.request
import urllib.error

PAGE_ID = "3d5009a14e198038ba3ff62b74d18e03"
FILE_PATH = os.path.join(os.path.dirname(__file__), "NOTION_PORTFOLIO_GUIDE.md")

def parse_inline(text):
    """
    마크다운 인라인 요소(링크, 굵게, 인라인 코드)를 노션 rich_text 포맷으로 변환
    """
    text = text.replace("<br>", "\n").replace("<br/>", "\n").replace("<br />", "\n")
    token_pattern = re.compile(r"(\[([^\]]+)\]\((https?://[^\)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`)")
    rich_text = []
    last_idx = 0

    for match in token_pattern.finditer(text):
        start, end = match.span()
        if start > last_idx:
            chunk = text[last_idx:start]
            if chunk:
                rich_text.append({"type": "text", "text": {"content": chunk[:2000]}})
        
        full, link_text, link_url, bold_text, code_text = match.groups()
        if link_text and link_url:
            rich_text.append({
                "type": "text",
                "text": {"content": link_text[:2000], "link": {"url": link_url}}
            })
        elif bold_text:
            rich_text.append({
                "type": "text",
                "text": {"content": bold_text[:2000]},
                "annotations": {"bold": True}
            })
        elif code_text:
            rich_text.append({
                "type": "text",
                "text": {"content": code_text[:2000]},
                "annotations": {"code": True}
            })
        last_idx = end

    if last_idx < len(text):
        chunk = text[last_idx:]
        if chunk:
            rich_text.append({"type": "text", "text": {"content": chunk[:2000]}})

    return rich_text if rich_text else [{"type": "text", "text": {"content": text[:2000]}}]

def parse_markdown_to_blocks(md_content):
    blocks = []
    lines = md_content.split("\n")
    in_code_block = False
    code_lang = "plain_text"
    code_lines = []
    table_lines = []

    def flush_table():
        nonlocal table_lines, blocks
        if not table_lines:
            return
        rows = []
        for l in table_lines:
            # 구분행 (|---|---|) 건너뛰기
            if re.match(r"^\|?(\s*:?-+:?\s*\|?)+$", l.strip()):
                continue
            cells = [c.strip() for c in l.strip().strip("|").split("|")]
            rows.append(cells)
        if rows:
            table_width = max(len(r) for r in rows)
            children = []
            for r in rows:
                while len(r) < table_width:
                    r.append("")
                children.append({
                    "type": "table_row",
                    "table_row": {
                        "cells": [parse_inline(c) for c in r]
                    }
                })
            blocks.append({
                "object": "block",
                "type": "table",
                "table": {
                    "table_width": table_width,
                    "has_column_header": True,
                    "has_row_header": False,
                    "children": children
                }
            })
        table_lines = []

    for line in lines:
        stripped = line.strip()

        # 표(Table) 라인 수집
        if stripped.startswith("|") and stripped.endswith("|"):
            table_lines.append(stripped)
            continue
        else:
            if table_lines:
                flush_table()

        # 코드 블록 처리
        if stripped.startswith("```"):
            if in_code_block:
                code_text = "\n".join(code_lines)[:2000]
                blocks.append({
                    "object": "block",
                    "type": "code",
                    "code": {
                        "rich_text": [{"type": "text", "text": {"content": code_text}}],
                        "language": code_lang if code_lang in [
                            "javascript", "typescript", "python", "html", "css", "json", "sql", "shell", "bash", "markdown", "mermaid"
                        ] else "plain_text"
                    }
                })
                in_code_block = False
                code_lines = []
            else:
                in_code_block = True
                lang = stripped[3:].strip().lower()
                code_lang = lang if lang else "plain_text"
            continue

        if in_code_block:
            code_lines.append(line)
            continue

        if not stripped:
            continue

        # 구분선
        if stripped in ["---", "***", "___"]:
            blocks.append({
                "object": "block",
                "type": "divider",
                "divider": {}
            })
            continue

        # 헤딩 1
        if stripped.startswith("# "):
            content = stripped[2:].strip()
            blocks.append({
                "object": "block",
                "type": "heading_1",
                "heading_1": {"rich_text": parse_inline(content)}
            })
            continue

        # 헤딩 2
        if stripped.startswith("## "):
            content = stripped[3:].strip()
            blocks.append({
                "object": "block",
                "type": "heading_2",
                "heading_2": {"rich_text": parse_inline(content)}
            })
            continue

        # 헤딩 3
        if stripped.startswith("### "):
            content = stripped[4:].strip()
            blocks.append({
                "object": "block",
                "type": "heading_3",
                "heading_3": {"rich_text": parse_inline(content)}
            })
            continue

        # 인용구 / 콜아웃
        if stripped.startswith("> "):
            content = stripped[2:].strip()
            blocks.append({
                "object": "block",
                "type": "callout",
                "callout": {
                    "icon": {"type": "emoji", "emoji": "💡"},
                    "rich_text": parse_inline(content)
                }
            })
            continue

        # 불릿 리스트
        if stripped.startswith("- ") or stripped.startswith("* "):
            content = stripped[2:].strip()
            blocks.append({
                "object": "block",
                "type": "bulleted_list_item",
                "bulleted_list_item": {"rich_text": parse_inline(content)}
            })
            continue

        # 번호 리스트
        num_match = re.match(r"^\d+\.\s+(.*)", stripped)
        if num_match:
            content = num_match.group(1).strip()
            blocks.append({
                "object": "block",
                "type": "numbered_list_item",
                "numbered_list_item": {"rich_text": parse_inline(content)}
            })
            continue

        # 일반 본문 문단
        blocks.append({
            "object": "block",
            "type": "paragraph",
            "paragraph": {"rich_text": parse_inline(stripped)}
        })

    # 루프 종료 후 남은 표 flush
    if table_lines:
        flush_table()

    return blocks

def append_blocks_to_notion(token, page_id, blocks):
    url = f"https://api.notion.com/v1/blocks/{page_id}/children"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28"
    }

    chunk_size = 40  # 안정적인 일괄 업로드 청크 크기
    total_chunks = (len(blocks) + chunk_size - 1) // chunk_size
    print(f"📦 총 {len(blocks)}개 노션 블록(표, 서식, 코드블록 포함) 변환 완료! ({total_chunks}회 분할 업로드 시작)")

    for i in range(0, len(blocks), chunk_size):
        chunk = blocks[i:i + chunk_size]
        payload = json.dumps({"children": chunk}).encode("utf-8")
        req = urllib.request.Request(url, data=payload, headers=headers, method="PATCH")

        try:
            with urllib.request.urlopen(req) as resp:
                if resp.status == 200:
                    current_idx = (i // chunk_size) + 1
                    print(f"  ✅ [{current_idx}/{total_chunks}] 블록 업로드 완료 ({len(chunk)}개)")
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8")
            print(f"❌ HTTP Error {e.code}: {err_body}")
            if e.code == 404:
                print("\n⚠️ [연결 필요] 노션 페이지에 해당 API Integration이 연결되지 않았습니다.")
                print("👉 해결 방법: 노션 웹 페이지 우측 상단 '···' 클릭 -> '연결(Connect to)' -> 발급한 Integration 선택")
            elif e.code == 401:
                print("\n⚠️ [인증 오류] 노션 API 토큰이 유효하지 않습니다.")
            return False
        except Exception as e:
            print(f"❌ 네트워크 오류: {e}")
            return False

    return True

def main():
    token = os.environ.get("NOTION_TOKEN")
    if len(sys.argv) > 1:
        token = sys.argv[1].strip()

    if not token:
        print("=" * 60)
        print("📌 Notion 자동 업로드를 위한 토큰(API Key)이 필요합니다.")
        print("사용법:")
        print("  1) python3 sync_to_notion.py <노션_시크릿_토큰>")
        print("  2) export NOTION_TOKEN='secret_xxx' && python3 sync_to_notion.py")
        print("=" * 60)
        sys.exit(1)

    if not os.path.exists(FILE_PATH):
        print(f"❌ 파일을 찾을 수 없습니다: {FILE_PATH}")
        sys.exit(1)

    with open(FILE_PATH, "r", encoding="utf-8") as f:
        content = f.read()

    print(f"🚀 노션 페이지(ID: {PAGE_ID})로 포트폴리오 업로드를 시작합니다...")
    blocks = parse_markdown_to_blocks(content)
    success = append_blocks_to_notion(token, PAGE_ID, blocks)

    if success:
        print("\n🎉 모든 내용이 노션에 성공적으로 업로드되었습니다!")
        print(f"🔗 확인 링크: https://app.notion.com/p/{PAGE_ID}")

if __name__ == "__main__":
    main()
