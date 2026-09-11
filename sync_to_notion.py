#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Notion 자동 포트폴리오 동기화 스크립트
NOTION_PORTFOLIO_GUIDE.md 내용을 Notion 공식 API를 통해 지정한 페이지로 자동 등록/동기화합니다.
기존 블록을 깔끔히 덮어쓰기(초기화 후 재등록)하여 중복 누적을 방지합니다.
"""

import os
import sys
import re
import json
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor

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

        if stripped.startswith("|") and stripped.endswith("|"):
            table_lines.append(stripped)
            continue
        else:
            if table_lines:
                flush_table()

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

        if stripped in ["---", "***", "___"]:
            blocks.append({
                "object": "block",
                "type": "divider",
                "divider": {}
            })
            continue

        if stripped.startswith("# "):
            content = stripped[2:].strip()
            blocks.append({
                "object": "block",
                "type": "heading_1",
                "heading_1": {"rich_text": parse_inline(content)}
            })
            continue

        if stripped.startswith("## "):
            content = stripped[3:].strip()
            blocks.append({
                "object": "block",
                "type": "heading_2",
                "heading_2": {"rich_text": parse_inline(content)}
            })
            continue

        if stripped.startswith("### "):
            content = stripped[4:].strip()
            blocks.append({
                "object": "block",
                "type": "heading_3",
                "heading_3": {"rich_text": parse_inline(content)}
            })
            continue

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

        if stripped.startswith("- ") or stripped.startswith("* "):
            content = stripped[2:].strip()
            blocks.append({
                "object": "block",
                "type": "bulleted_list_item",
                "bulleted_list_item": {"rich_text": parse_inline(content)}
            })
            continue

        num_match = re.match(r"^\d+\.\s+(.*)", stripped)
        if num_match:
            content = num_match.group(1).strip()
            blocks.append({
                "object": "block",
                "type": "numbered_list_item",
                "numbered_list_item": {"rich_text": parse_inline(content)}
            })
            continue

        blocks.append({
            "object": "block",
            "type": "paragraph",
            "paragraph": {"rich_text": parse_inline(stripped)}
        })

    if table_lines:
        flush_table()

    return blocks

def clear_existing_blocks(token, page_id):
    """
    페이지에 이미 존재하는 블록들을 정리(Archive)하여 중복 생성을 원천 방지
    """
    headers = {"Authorization": f"Bearer {token}", "Notion-Version": "2022-06-28"}
    url = f"https://api.notion.com/v1/blocks/{page_id}/children"
    block_ids = []
    start_cursor = None

    while True:
        target_url = url + (f"?start_cursor={start_cursor}" if start_cursor else "")
        req = urllib.request.Request(target_url, headers=headers)
        try:
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read().decode())
                for b in data.get("results", []):
                    block_ids.append(b["id"])
                if data.get("has_more") and data.get("next_cursor"):
                    start_cursor = data["next_cursor"]
                else:
                    break
        except Exception:
            break

    if block_ids:
        print(f"🧹 기존 {len(block_ids)}개 블록을 정리하여 최신 내용으로 교체 준비 중...")
        def del_block(bid):
            del_req = urllib.request.Request(f"https://api.notion.com/v1/blocks/{bid}", headers=headers, method="DELETE")
            try:
                with urllib.request.urlopen(del_req) as r:
                    return True
            except Exception:
                return False

        with ThreadPoolExecutor(max_workers=5) as executor:
            list(executor.map(del_block, block_ids))
        print("✨ 기존 블록 정리 완료!")

def append_blocks_to_notion(token, page_id, blocks):
    url = f"https://api.notion.com/v1/blocks/{page_id}/children"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28"
    }

    chunk_size = 40
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
            return False
        except Exception as e:
            print(f"❌ 네트워크 오류: {e}")
            return False

    return True

def main():
    token = os.environ.get("NOTION_TOKEN")
    append_mode = False
    
    for arg in sys.argv[1:]:
        if arg == "--append":
            append_mode = True
        elif not token:
            token = arg.strip()

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

    print(f"🚀 노션 페이지(ID: {PAGE_ID}) 동기화를 시작합니다...")
    if not append_mode:
        clear_existing_blocks(token, PAGE_ID)

    blocks = parse_markdown_to_blocks(content)
    success = append_blocks_to_notion(token, PAGE_ID, blocks)

    if success:
        print("\n🎉 모든 내용이 노션에 성공적으로 업로드되었습니다!")
        print(f"🔗 확인 링크: https://app.notion.com/p/{PAGE_ID}")

if __name__ == "__main__":
    main()
