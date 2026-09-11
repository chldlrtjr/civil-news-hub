#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Civil News Hub - 토목 공모전 데이터 무결성 전수 검증 테스트 (test_contests_integrity.py)
목적:
- data/contests.json 내 마감/과거/블랙리스트 공모전 존재 여부 전수 검사
- 전체 건수와 개별 카테고리 탭 합산 100% 일치 검증 (GEMINI.md Rule 1-⑥)
- 위반 시 exit(1)로 CI 및 자동화 파이프라인 즉각 중단
"""

import os
import sys
import json
from datetime import datetime, timezone, timedelta
import contest_validator

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
CONTESTS_JSON_PATH = os.path.join(DATA_DIR, "contests.json")

def run_integrity_test():
    print("="*70)
    print("🛡️ [Civil News Hub] 공모전 데이터 무결성 전수 검증 테스트 시작")
    print("="*70)

    if not os.path.exists(CONTESTS_JSON_PATH):
        print(f"❌ [치명적 실패] 파일이 존재하지 않습니다: {CONTESTS_JSON_PATH}")
        sys.exit(1)

    with open(CONTESTS_JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    contests = data.get("contests", [])
    total_count = data.get("total_count", 0)
    categories = data.get("categories", [])

    print(f"📊 점검 대상: 총 {len(contests)}건 / 명시된 total_count: {total_count}건")
    print(f"📁 카테고리: {categories}")

    # 1. 건수 일치성 검증 (Rule 1-⑥)
    if len(contests) != total_count:
        print(f"❌ [실패] 실제 공모전 수({len(contests)}) != total_count({total_count})")
        sys.exit(1)

    cat_sum = 0
    for cat in categories:
        if cat == "ALL":
            continue
        cnt = len([c for c in contests if c.get("category") == cat])
        cat_sum += cnt

    if len(contests) != cat_sum:
        print(f"❌ [실패] 전체 공모전 수({len(contests)}) != 개별 카테고리 합계({cat_sum}) (Rule 1-⑥ 위반)")
        sys.exit(1)
    print(f"✅ [검증 1 통과] 전체 건수({total_count}) == 카테고리 합산({cat_sum}) 100% 일치")

    # 2. 공모전별 팩트 무결성 검증 (Rule 1-①, 1-⑤, 1-⑦)
    failures = []
    now_kst = contest_validator.get_current_kst()

    for idx, c in enumerate(contests, 1):
        is_valid, reason = contest_validator.validate_contest(c, current_time=now_kst)
        if not is_valid:
            failures.append((c.get("title", f"공모전 #{idx}"), reason))
        else:
            print(f"  {idx}. [{c.get('category')}] {c.get('title')} ({c.get('status')}) -> ✅ 정상")

    if failures:
        print("\n" + "!" * 70)
        print(f"🚨 [무결성 위반 감지] 총 {len(failures)}건의 부적격 공모전이 발견되었습니다:")
        for title, reason in failures:
            print(f"   - ❌ {title}: {reason}")
        print("!" * 70 + "\n")
        sys.exit(1)

    print("="*70)
    print("🎉 [테스트 성공] 모든 공모전 데이터가 100% 실시간 유효하며 무결성을 충족합니다!")
    print("="*70)
    sys.exit(0)

if __name__ == "__main__":
    run_integrity_test()
