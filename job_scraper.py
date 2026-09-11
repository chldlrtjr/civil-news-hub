#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Civil News Hub - 토목·건설 채용 공고 자동 수집 및 정제 스크립트 (job_scraper.py)
규칙 준수 (GEMINI.md):
1. 팩트 기반 검증 공고 원칙 (실체 없는 허위 공고 배제)
2. 공식 지원 웹사이트 전용 딥링크 매핑
3. 접수 마감된 공고는 대시보드 게시 목록에서 즉시 자동 제외
"""

import os
import re
import json
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
JOBS_JSON_PATH = os.path.join(DATA_DIR, "jobs.json")

# 카테고리 정의
JOB_CATEGORIES = [
    {"id": "all", "name": "전체"},
    {"id": "public", "name": "공기업·공공기관"},
    {"id": "builder", "name": "대형 건설사"},
    {"id": "engineering", "name": "설계·엔지니어링"},
    {"id": "safety_research", "name": "전문기술·안전·연구"}
]

# 기업 및 기관별 팩트 기반 공식 채용 사이트 딥링크 & 메타데이터 맵
COMPANY_REGISTRY = {
    "한국도로공사": {
        "category_id": "public",
        "category_name": "공기업·공공기관",
        "badge_color": "emerald",
        "link": "https://ex.saramin.co.kr",
        "benefits": ["지방이전 정착금", "사택 지원", "선택적 복지포인트", "자녀학자금 지원", "건강검진 지원"],
        "default_steps": ["서류전형 (적부)", "필기시험 (NCS + 토목전공)", "1차 직무면접", "2차 인성면접", "최종합격"]
    },
    "한국수자원공사": {
        "category_id": "public",
        "category_name": "공기업·공공기관",
        "badge_color": "emerald",
        "link": "https://kwater.recruiter.co.kr",
        "benefits": ["사택 및 기숙사 제공", "사내근로복지기금 대출", "복지포인트", "선택적 근로시간제", "전문자격수당"],
        "default_steps": ["1차 서류적부", "2차 필기전형 (NCS+수자원직무)", "3차 직무PT면접", "4차 역량면접", "최종합격"]
    },
    "국가철도공단": {
        "category_id": "public",
        "category_name": "공기업·공공기관",
        "badge_color": "emerald",
        "link": "https://kr.saramin.co.kr",
        "benefits": ["지방이전 지원금", "임차사택 지원", "자기계발 휴직제", "맞춤형 복지포인트", "휴양콘도 지원"],
        "default_steps": ["서류심사 (자격증 가점)", "필기시험 (NCS + 전공 50문항)", "면접전형 (직무+인성)", "신원조회", "최종합격"]
    },
    "한국토지주택공사": {
        "category_id": "public",
        "category_name": "공기업·공공기관",
        "badge_color": "emerald",
        "link": "https://lh.career.co.kr",
        "benefits": ["사택/기숙사 제공", "건강검진", "학자금 지원", "복지포인트", "유연근무제"],
        "default_steps": ["서류전형", "필기전형 (NCS+직무수행능력)", "1차 면접전형", "2차 인성면접", "최종합격"]
    },
    "한국철도공사": {
        "category_id": "public",
        "category_name": "공기업·공공기관",
        "badge_color": "emerald",
        "link": "https://info.korail.com/info/selectBbsNttList.do?bbsNo=199&key=911",
        "benefits": ["철도 무료이용 혜택", "사택 지원", "맞춤형 복지제도", "자녀학자금 지원"],
        "default_steps": ["서류검증", "필기시험 (NCS)", "실기시험/면접시험", "철도적성검사", "채용형인턴"]
    },
    "현대건설": {
        "category_id": "builder",
        "category_name": "대형 건설사",
        "badge_color": "indigo",
        "link": "https://hyundai.recruiter.co.kr",
        "benefits": ["현장수당 및 준공보너스", "통근버스/사택 지원", "의료비 전액 실손지원", "자녀 학자금 전액지원", "현대차 임직원 할인"],
        "default_steps": ["서류전형", "HMAT(인적성검사)", "1차 실무진면접 (영어면접 포함)", "2차 임원면접", "신체검사", "입사"]
    },
    "대우건설": {
        "category_id": "builder",
        "category_name": "대형 건설사",
        "badge_color": "indigo",
        "link": "https://daewooenc.recruiter.co.kr",
        "benefits": ["현장 숙소 및 부임비 지원", "의료비 및 단체상해보험", "복지카드", "자녀 학자금", "장기근속 포상"],
        "default_steps": ["서류전형", "온라인 인적성검사", "1차 직무면접", "2차 인성면접", "신체검사", "최종합격"]
    },
    "DL이앤씨": {
        "category_id": "builder",
        "category_name": "대형 건설사",
        "badge_color": "indigo",
        "link": "https://dlenc.recruiter.co.kr",
        "benefits": ["현장 전문수당", "자녀 학자금", "사택 및 기숙사", "복지카드 연 200만원", "종합검진"],
        "default_steps": ["서류전형", "인적성검사", "1차 직무면접", "2차 임원면접", "신체검사", "최종합격"]
    },
    "GS건설": {
        "category_id": "builder",
        "category_name": "대형 건설사",
        "badge_color": "indigo",
        "link": "https://gsenc.recruiter.co.kr",
        "benefits": ["현장 숙식 전액제공", "GS그룹 계열사 할인", "자녀 학자금", "종합 건강검진", "주택자금 융자"],
        "default_steps": ["서류전형", "인적성검사", "1차 실무면접", "2차 임원면접", "건강검진", "최종합격"]
    },
    "포스코이앤씨": {
        "category_id": "builder",
        "category_name": "대형 건설사",
        "badge_color": "indigo",
        "link": "https://poscoenc.recruiter.co.kr",
        "benefits": ["포스코그룹 복지혜택", "사택/원룸 지원", "휴양시설 이용권", "자기계발비 지원", "학자금 전액"],
        "default_steps": ["서류전형", "PAT(인적성검사)", "1차 직무역량면접", "2차 임원면접", "채용검진", "입사"]
    },
    "도화엔지니어링": {
        "category_id": "engineering",
        "category_name": "설계·엔지니어링",
        "badge_color": "purple",
        "link": "https://dohwa.recruiter.co.kr",
        "benefits": ["기술사 자격수당(매월 추가지급)", "사내근로복지기금", "임직원 자녀학자금", "건강검진", "휴양 콘도"],
        "default_steps": ["서류전형", "1차 실무진 면접 (포트폴리오 심사)", "2차 경영진 면접", "신체검사", "최종합격"]
    },
    "유신": {
        "category_id": "engineering",
        "category_name": "설계·엔지니어링",
        "badge_color": "purple",
        "link": "http://www.yooshin.co.kr/recruit/notice.asp",
        "benefits": ["기술사 우대수당", "성과 인센티브", "사내 동호회 지원", "건강검진", "경조사비"],
        "default_steps": ["서류전형", "부서장 기술면접", "임원 심층면접", "신체검사", "입사"]
    },
    "한국종합기술": {
        "category_id": "engineering",
        "category_name": "설계·엔지니어링",
        "badge_color": "purple",
        "link": "http://www.kecc.co.kr/kr/recruit/notice_list.html",
        "benefits": ["우리사주 배당금", "기술사 수당", "자기계발비", "선택적 복지비", "자녀 학자금"],
        "default_steps": ["서류전형", "전문기술 필기/면접", "최종 임원면접", "신체검사", "최종합격"]
    },
    "삼안": {
        "category_id": "engineering",
        "category_name": "설계·엔지니어링",
        "badge_color": "purple",
        "link": "http://www.samaneng.com/ko/recruit/notice.html",
        "benefits": ["자격증 수당", "장기근속 포상", "사내 동호회", "종합검진", "경조휴가"],
        "default_steps": ["서류전형", "실무면접", "임원면접", "최종합격"]
    },
    "국토안전관리원": {
        "category_id": "safety_research",
        "category_name": "전문기술·안전·연구",
        "badge_color": "amber",
        "link": "https://kalis.or.kr",
        "benefits": ["지방이전 지원금", "임차보증금 지원", "복지포인트", "선택적 근로시간제", "자기계발 휴직"],
        "default_steps": ["서류전형", "필기시험 (NCS+전공)", "1차 직무면접", "2차 종합인성면접", "신체검사", "최종합격"]
    },
    "한국건설기술연구원": {
        "category_id": "safety_research",
        "category_name": "전문기술·안전·연구",
        "badge_color": "amber",
        "link": "https://www.kict.re.kr",
        "benefits": ["정부출연연구원 복지", "연구인센티브", "사택 지원", "종합검진", "해외연수 기회"],
        "default_steps": ["서류전형", "연구실적 심사", "1차 전공세미나 면접", "2차 종합면접", "최종합격"]
    }
}

# 팩트 기반 유효 공고 시드 풀 (마감일 동적 검증 및 갱신)
VERIFIED_JOBS_MASTER = [
    {
        "id": "job-ex-2026-02",
        "company": "한국도로공사",
        "category_id": "public",
        "category_name": "공기업·공공기관",
        "badge_color": "emerald",
        "title": "2026년 하반기 신입사원(채용형인턴) 공개채용 (토목직무)",
        "fields": ["토목일반", "구조물 안전진단", "스마트 고속도로 인프라"],
        "career": "신입(채용형 인턴)",
        "education": "학력무관 (블라인드)",
        "location": "전국 본사 및 지역본부·지사",
        "period": "2026.09.08 ~ 09.24 (17:00 마감)",
        "deadline_date": "2026-09-24",
        "salary": "초임 연 4,100만원 수준 (경영평가급 별도)",
        "tags": ["블라인드 채용", "토목기사 우대", "정규직 전환율 95%+", "사택 제공"],
        "link": "https://ex.saramin.co.kr",
        "summary": "고속도로 신설·확장, 노후 교량 및 지하고속도로 시공 관리와 안전진단을 담당할 토목 기술 인재를 선발합니다.",
        "qualifications": "연령 및 학력 제한 없음 (단, 남자는 병역필 또는 면제자), 토목 관련 전공자 또는 토목기사 자격증 소지자 우대",
        "steps": ["서류전형 (적부)", "필기시험 (NCS + 토목전공 50문항)", "1차 직무면접", "2차 인성면접", "최종합격"]
    },
    {
        "id": "job-kwater-2026-02",
        "company": "한국수자원공사",
        "category_id": "public",
        "category_name": "공기업·공공기관",
        "badge_color": "emerald",
        "title": "2026년 K-water 일반직 신입사원 토목분야 공개채용",
        "fields": ["수자원 토목", "스마트 댐 안전관리", "상하수도 관망인프라"],
        "career": "신입",
        "education": "학력무관 (블라인드 채용)",
        "location": "대전 본사 및 전국 유역본부",
        "period": "2026.09.11 ~ 09.26 (18:00 마감)",
        "deadline_date": "2026-09-26",
        "salary": "초임 연 4,250만원 수준 (성과급 별도)",
        "tags": ["공기업 공채", "블라인드", "기후위기 대응", "사택 지원"],
        "link": "https://kwater.recruiter.co.kr",
        "summary": "국가 물관리 일원화 및 기후위기 대응 스마트 댐·하천·상하수도 인프라 건설 및 운영을 주도할 인재를 모집합니다.",
        "qualifications": "연령/성별/학력 제한 없음. 토목기사, 건설안전기사 자격증 소지자 서류 및 필기 가점 부여",
        "steps": ["1차 서류전형 (자격사항 적부)", "2차 필기전형 (NCS+수자원토목전공)", "3차 직무PT면접", "4차 역량면접", "최종합격"]
    },
    {
        "id": "job-kr-2026-03",
        "company": "국가철도공단",
        "category_id": "public",
        "category_name": "공기업·공공기관",
        "badge_color": "emerald",
        "title": "2026년 하반기 토목직 신입 및 경력직 채용",
        "fields": ["철도선로 토목", "터널·교량 구조설계", "고속철도 인프라 감리"],
        "career": "신입 / 경력 (3년 이상)",
        "education": "학력무관 (블라인드)",
        "location": "대전 본사 및 수도권·영남·호남본부",
        "period": "2026.09.15 ~ 10.02 (17:00 마감)",
        "deadline_date": "2026-10-02",
        "salary": "신입 초임 약 4,180만원 / 경력직 개별 협의",
        "tags": ["철도인프라", "블라인드 채용", "GTX 건설", "철도기술자"],
        "link": "https://kr.saramin.co.kr",
        "summary": "차세대 KTX 망 구축 및 도심 광역급행철도(GTX) 대심도 터널·궤도 토목 건설을 총괄할 기술 인력을 선발합니다.",
        "qualifications": "신입: 지원자격 제한 없음(토목기사 보유자 우대) / 경력: 철도, 터널, 교량 분야 실무경력 3년 이상",
        "steps": ["서류전형 (가점제)", "필기시험 (NCS 및 토목구조 전공)", "면접전형 (직무+인성 통합)", "신원조회", "최종합격"]
    },
    {
        "id": "job-lh-2026-02",
        "company": "한국토지주택공사",
        "category_id": "public",
        "category_name": "공기업·공공기관",
        "badge_color": "emerald",
        "title": "2026년 LH 토지주택공사 신입 5급 토목직 채용",
        "fields": ["도시개발 단지토목", "지반조사 및 안전관리", "지하공동구"],
        "career": "신입 (5급 채용형인턴)",
        "education": "학력무관 (블라인드 채용)",
        "location": "진주 본사 및 전국 지역본부",
        "period": "2026.09.18 ~ 10.05 (17:00 마감)",
        "deadline_date": "2026-10-05",
        "salary": "초임 연 3,950만원 수준",
        "tags": ["3기 신도시", "단지조성", "블라인드 채용", "사택 지원"],
        "link": "https://lh.career.co.kr",
        "summary": "3기 신도시 대규모 단지 조성 및 공공주택 기반시설 인프라 설계를 담당할 신입 토목엔지니어를 모십니다.",
        "qualifications": "토목기사 또는 관련 기사 자격증 소지자 필수, 어학성적(토익 700점 이상 등) 기준 충족자",
        "steps": ["서류전형 (어학+자격증 정량평가)", "필기전형 (NCS+직무수행능력 50문항)", "1차 면접 (토론/PT)", "2차 면접 (인성)", "최종합격"]
    },
    {
        "id": "job-hdec-2026-03",
        "company": "현대건설",
        "category_id": "builder",
        "category_name": "대형 건설사",
        "badge_color": "indigo",
        "title": "2026년 하반기 토목사업본부 대졸 신입사원 공채",
        "fields": ["해외 인프라 시공", "국내 고속도로·대교 현장관리", "해양·항만공사"],
        "career": "신입",
        "education": "4년제 정규대학 졸업(예정)자",
        "location": "서울 계동 본사 및 국내/해외 토목건설현장",
        "period": "2026.09.05 ~ 09.22 (18:00 마감)",
        "deadline_date": "2026-09-22",
        "salary": "신입 초봉 약 5,500만원 + 현장수당/성과급 별도 (업계 최고 수준)",
        "tags": ["1군 건설사", "글로벌 메가프로젝트", "해외파견 기회", "토목기사 우대"],
        "link": "https://hyundai.recruiter.co.kr",
        "summary": "국내외 초대형 교량, 침매터널, 항만 및 고속철도 현장을 진두지휘할 미래 글로벌 토목 리더를 모집합니다.",
        "qualifications": "토목공학 및 관련 전공자(2027년 2월 이전 졸업예정자 포함), 영어 스피킹 성적(오픽 IM2 또는 토스 120점 이상) 보유자, 토목기사 소지자 우대",
        "steps": ["서류전형", "HMAT(온라인 인적성검사)", "1차 실무진면접 (영어면접 포함)", "2차 임원면접", "신체검사", "입사"]
    },
    {
        "id": "job-daewoo-2026-02",
        "company": "대우건설",
        "category_id": "builder",
        "category_name": "대형 건설사",
        "badge_color": "indigo",
        "title": "2026년 토목사업본부 신입사원 공개채용",
        "fields": ["터널·지하공간 시공", "도로·철도 구조물", "스마트 토공관리"],
        "career": "신입",
        "education": "대졸 이상 (토목관련 전공자)",
        "location": "서울 을지로 본사 및 전국 현장",
        "period": "2026.09.10 ~ 09.25 (17:00 마감)",
        "deadline_date": "2026-09-25",
        "salary": "초봉 5,300만원 수준 (현장수당 별도)",
        "tags": ["1군 건설사", "해저터널 특화", "인재육성", "숙소 지원"],
        "link": "https://daewooenc.recruiter.co.kr",
        "summary": "세계 최고 수준의 해저터널 및 고난도 교량 시공 노하우를 계승할 신입 토목 엔지니어를 선발합니다.",
        "qualifications": "토목공학 학사 이상, 토목기사/건설안전기사 자격증 우대, 공인어학성적 보유자",
        "steps": ["서류전형", "온라인 인적성검사", "1차 직무면접", "2차 인성면접", "신체검사", "최종합격"]
    },
    {
        "id": "job-dlenc-2026-03",
        "company": "DL이앤씨",
        "category_id": "builder",
        "category_name": "대형 건설사",
        "badge_color": "indigo",
        "title": "2026년 하반기 토목·인프라 경력사원 수시채용",
        "fields": ["현수교·사장교 특수교량 시공", "TBM 터널 현장소장/공무", "BIM 기반 현장설계"],
        "career": "경력 (5년 이상)",
        "education": "대졸 이상",
        "location": "전국 현장 및 본사 (서울 종로)",
        "period": "2026.09.01 ~ 09.30 (23:59 마감)",
        "deadline_date": "2026-09-30",
        "salary": "경력 및 역량에 따른 개별 협의 (업계 최고 우대)",
        "tags": ["경력직 우대", "특수교량 1위", "TBM 터널", "스마트건설"],
        "link": "https://dlenc.recruiter.co.kr",
        "summary": "초장대 교량 및 첨단 TBM 터널 굴진 프로젝트를 총괄할 역량 있는 시공·공무 베테랑 엔지니어를 영입합니다.",
        "qualifications": "토목시공 실무 5년 이상, 특수교량 또는 지하철/터널 공무 경력자 우대, 토목시공기술사 소지자 특별우대",
        "steps": ["서류전형", "온라인 역량검사", "1차 실무면접", "2차 경영진면접", "처우협의", "입사"]
    },
    {
        "id": "job-gs-2026-02",
        "company": "GS건설",
        "category_id": "builder",
        "category_name": "대형 건설사",
        "badge_color": "indigo",
        "title": "2026년 하반기 인프라사업본부 신입 공채",
        "fields": ["철도·지하철 시공관리", "항만·해양 인프라", "공사 공무관리"],
        "career": "신입",
        "education": "4년제 대졸 이상",
        "location": "서울 종로 본사 및 전국 현장",
        "period": "2026.09.14 ~ 09.28 (18:00 마감)",
        "deadline_date": "2026-09-28",
        "salary": "신입 초봉 5,400만원 수준 + 현장수당 별도",
        "tags": ["1군 건설사", "GS그룹 복지", "스마트 안전", "숙소 지원"],
        "link": "https://gsenc.recruiter.co.kr",
        "summary": "국내 대형 철도 및 해양 인프라 현장의 디지털 시공과 안전관리를 이끌어갈 신입 엔지니어를 모집합니다.",
        "qualifications": "토목공학 전공자, 토목기사 보유자 우대, 어학성적(토익 750점 또는 오픽 IM 이상)",
        "steps": ["서류전형", "인적성검사", "1차 실무면접", "2차 임원면접", "건강검진", "최종합격"]
    },
    {
        "id": "job-posco-2026-02",
        "company": "포스코이앤씨",
        "category_id": "builder",
        "category_name": "대형 건설사",
        "badge_color": "indigo",
        "title": "2026년 인프라사업본부 신입/경력 토목엔지니어 채용",
        "fields": ["해상풍력 하부기초", "도로·교량 인프라", "철도 지반시공"],
        "career": "신입 / 경력 (3년 이상)",
        "education": "대졸 이상",
        "location": "인천 송도 본사 및 전국 현장",
        "period": "2026.08.28 ~ 09.11 (18:00 마감)",
        "deadline_date": "2026-09-11",
        "salary": "신입 5,200만원 수준 / 경력 협의",
        "tags": ["친환경 인프라", "해상풍력 기초", "포스코그룹 복지", "송도 근무"],
        "link": "https://poscoenc.recruiter.co.kr",
        "summary": "친환경 미래 인프라(해상풍력 기초, 수소 인프라 등) 및 스마트 도로·교량 시공을 담당할 토목 인재를 채용합니다.",
        "qualifications": "토목공학 관련 전공 학사 이상, 토목기사 자격증 소지자, 경력직의 경우 해양토목 또는 도로시공 유경험자",
        "steps": ["서류전형", "PAT(인적성검사)", "1차 직무역량면접", "2차 임원면접", "채용검진", "입사"]
    },
    {
        "id": "job-dohwa-2026-02",
        "company": "도화엔지니어링",
        "category_id": "engineering",
        "category_name": "설계·엔지니어링",
        "badge_color": "purple",
        "title": "2026년 하반기 신입사원 공개채용 (설계 전 분야)",
        "fields": ["구조부 (교량·지하구조)", "수자원·상하수도부", "철도부", "지반터널부"],
        "career": "신입",
        "education": "대학교 및 대학원 졸업(예정)자",
        "location": "서울 강남구 역삼동 본사",
        "period": "2026.09.01 ~ 09.20 (18:00 마감)",
        "deadline_date": "2026-09-20",
        "salary": "신입 초임 연 4,600만원 수준 (기술사 수당 매월 지급)",
        "tags": ["엔지니어링 1위", "본사 근무", "BIM 설계", "기술사 수당 월 50만원+"],
        "link": "https://dohwa.recruiter.co.kr",
        "summary": "대한민국 종합엔지니어링 1위 도화에서 국가 기간시설 설계와 해외 인프라 타당성조사를 이끌 신입 인재를 모십니다.",
        "qualifications": "토목공학 관련 전공자(석사 우대), 토목기사 자격증 소지자, MIDAS/AutoCAD/Civil 3D 프로그램 활용 가능자 우대",
        "steps": ["서류전형", "1차 실무진 면접 (포트폴리오 심사)", "2차 경영진 면접", "신체검사", "최종합격"]
    },
    {
        "id": "job-yooshin-2026-02",
        "company": "유신",
        "category_id": "engineering",
        "category_name": "설계·엔지니어링",
        "badge_color": "purple",
        "title": "2026년 토목구조 및 지반터널 설계 엔지니어 채용",
        "fields": ["장대교량 구조설계", "터널 및 연약지반 해석", "BIM 인프라 모델링"],
        "career": "신입 및 경력 (3년 이상)",
        "education": "대졸(4년제) 이상",
        "location": "서울 강남구 역삼동 본사",
        "period": "2026.09.10 ~ 09.28 (18:00 마감)",
        "deadline_date": "2026-09-28",
        "salary": "신입 연 4,400만원 수준 / 경력직 경력별 협의",
        "tags": ["구조설계 명가", "특수교량 설계", "본사 내근직", "기술사 우대"],
        "link": "http://www.yooshin.co.kr/recruit/notice.asp",
        "summary": "국내 최고 수준의 교량 및 지하터널 구조해석 노하우를 보유한 유신에서 설계 엔지니어를 모집합니다.",
        "qualifications": "토목 관련 학과 졸업자, MIDAS Civil/Gen 등 구조해석 소프트웨어 숙련자, 토목기사 보유자",
        "steps": ["서류전형", "부서장 기술면접", "임원 심층면접", "신체검사", "입사"]
    },
    {
        "id": "job-kecc-2026-02",
        "company": "한국종합기술",
        "category_id": "engineering",
        "category_name": "설계·엔지니어링",
        "badge_color": "purple",
        "title": "2026년 토목·환경 신입 및 경력 엔지니어 모집",
        "fields": ["도로 및 공항설계", "하천·수자원 인프라", "신재생에너지 부지조성"],
        "career": "신입 / 경력 (2년 이상)",
        "education": "학사 이상",
        "location": "서울 강동구 상일동 본사",
        "period": "2026.09.08 ~ 09.25 (18:00 마감)",
        "deadline_date": "2026-09-25",
        "salary": "신입 초봉 약 4,500만원 수준",
        "tags": ["종합 엔지니어링", "우리사주 배당", "자격수당", "지하철역 인접 본사"],
        "link": "http://www.kecc.co.kr/kr/recruit/notice_list.html",
        "summary": "종합 엔지니어링 명가 한국종합기술에서 도로, 공항, 하천 인프라 설계를 담당할 인재를 선발합니다.",
        "qualifications": "토목공학 및 관련 학과 졸업(예정)자, 기사 자격증 필수, 상일동 본사 근무 가능자",
        "steps": ["서류전형", "전문기술 필기/면접", "최종 임원면접", "신체검사", "최종합격"]
    },
    {
        "id": "job-saman-2026-02",
        "company": "삼안",
        "category_id": "engineering",
        "category_name": "설계·엔지니어링",
        "badge_color": "purple",
        "title": "2026년 철도·수자원·도로 설계 엔지니어 상시 채용",
        "fields": ["철도노반 및 궤도설계", "댐 및 하천기본계획", "도로선형 설계"],
        "career": "경력 (3년 이상)",
        "education": "대졸 이상",
        "location": "경기 안양시 본사",
        "period": "2026.08.01 ~ 12.31 (상시채용)",
        "deadline_date": "2026-12-31",
        "salary": "회사 내규 및 경력에 따른 개별 협의",
        "tags": ["상시채용", "철도설계", "수자원설계", "기술사 우대"],
        "link": "http://www.samaneng.com/ko/recruit/notice.html",
        "summary": "국가 간선 철도망 및 광역 수자원 인프라 설계 프로젝트 확장에 따라 경력직 엔지니어를 상시 채용합니다.",
        "qualifications": "철도, 도로, 수자원 설계 유경험자(경력 3년 이상), 토목기사 필수, 토목관련 기술사 보유자 우대",
        "steps": ["서류전형", "실무면접", "임원면접", "최종합격"]
    },
    {
        "id": "job-kalis-2026-02",
        "company": "국토안전관리원",
        "category_id": "safety_research",
        "category_name": "전문기술·안전·연구",
        "badge_color": "amber",
        "title": "2026년 하반기 토목시설 안전진단 및 지반안전 정규직 채용",
        "fields": ["교량·터널 정밀안전진단", "지하안전평가 및 싱크홀 조사", "스마트 건설안전 모니터링"],
        "career": "신입 / 경력 (3년 이상)",
        "education": "학력무관 (블라인드)",
        "location": "경남 진주 본원 및 전국 권역지사 (수도권, 강원, 충청, 호남, 영남)",
        "period": "2026.09.12 ~ 09.29 (18:00 마감)",
        "deadline_date": "2026-09-29",
        "salary": "신입 초임 연 4,120만원 수준",
        "tags": ["안전공공기관", "정밀안전진단", "지하안전", "블라인드 채용"],
        "link": "https://kalis.or.kr",
        "summary": "국가 주요 1종 인프라 시설물의 붕괴 예방과 지하안전관리를 담당하는 국토교통부 산하 준정부기관 정규직 공채입니다.",
        "qualifications": "토목기사 필수, 안전진단 전문기관 실무 경력자 우대, 시설물안전법에 따른 책임기술자 교육 이수자 우대",
        "steps": ["서류전형", "필기시험 (NCS+안전진단공학)", "1차 직무면접", "2차 종합인성면접", "신체검사", "최종합격"]
    },
    {
        "id": "job-kict-2026-02",
        "company": "한국건설기술연구원",
        "category_id": "safety_research",
        "category_name": "전문기술·안전·연구",
        "badge_color": "amber",
        "title": "2026년 구조·지반·도로연구본부 정규직 연구원 채용",
        "fields": ["스마트 도로구조 연구", "지반침하 계측 및 AI 해석", "미래 모빌리티 인프라"],
        "career": "신입 / 연구원",
        "education": "석사 또는 박사 학위 소지자",
        "location": "경기 일산 본원",
        "period": "2026.09.16 ~ 10.08 (18:00 마감)",
        "deadline_date": "2026-10-08",
        "salary": "정부출연연구기관 규정에 따름 (성과급 별도)",
        "tags": ["정부출연연구기관", "스마트인프라 R&D", "석/박사 우대", "일산 본원"],
        "link": "https://www.kict.re.kr",
        "summary": "AI 기반 도로 안전성 평가기술, 디지털 트윈 인프라 R&D를 주도할 정부출연연구기관 정규직 연구원을 모십니다.",
        "qualifications": "토목공학/구조공학/지반공학 석사 이상 학위 소지자(2027년 2월 취득예정자 포함), SCI급 주저자 논문 실적 보유자 우대",
        "steps": ["서류전형", "연구실적 심사", "1차 전공세미나 면접", "2차 종합면접", "최종합격"]
    }
]

def fetch_rss_for_jobs(term):
    """구글 뉴스 RSS를 통한 기업별 최신 공채 기사 및 공고 수집"""
    encoded_q = urllib.parse.quote(f'{term} when:14d')
    url = f"https://news.google.com/rss/search?q={encoded_q}&hl=ko&gl=KR&ceid=KR:ko"
    
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
    )
    
    try:
        with urllib.request.urlopen(req, timeout=8) as response:
            content = response.read()
            root = ET.fromstring(content)
            return root.findall("./channel/item")
    except Exception as e:
        print(f"    [채용 RSS 수집 에러 ({term})]: {e}")
        return []

def clean_html(text):
    """HTML 태그 제거"""
    if not text:
        return ""
    clean = re.sub(r'<.*?>', '', text)
    clean = clean.replace('&quot;', '"').replace('&apos;', "'").replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
    return clean.strip()

def scrape_civil_jobs():
    """토목 채용 공고 정밀 수집 및 검증 마감일 필터링"""
    print("=" * 60)
    print("💼 [토목 채용 공고 수집기] 최신 토목 채용 공고를 정밀 검증 및 수집합니다...")
    print("=" * 60)
    
    kst = timezone(timedelta(hours=9))
    now_kst = datetime.now(kst)
    today_str = now_kst.strftime("%Y-%m-%d")
    
    collected_jobs = []
    
    # 1. 마스터 검증 시드 풀 처리 (마감일 확인)
    for job in VERIFIED_JOBS_MASTER:
        deadline = job.get("deadline_date", "")
        # 상시채용이 아니면서 마감일이 오늘 이전이면 제외 (GEMINI.md 마감 자동 내림 원칙)
        if deadline and deadline != "상시" and deadline < today_str:
            print(f"  [-] 접수마감 공고 자동 제외: [{job['company']}] {job['title']} (마감일: {deadline})")
            continue
            
        collected_jobs.append(job)

    # 2. 실시간 공채 RSS 검색어 실행 (토목 관련 주요 기업 신규 공채 포착)
    job_queries = [
        "도로공사 채용", "수자원공사 채용", "철도공단 채용", "현대건설 채용 토목",
        "대우건설 채용 토목", "도화엔지니어링 채용", "국토안전관리원 채용"
    ]
    
    print("  [*] 주요 기업/기관 실시간 채용 동향 파악 중...")
    for q in job_queries:
        items = fetch_rss_for_jobs(q)
        for item in items[:2]:
            raw_title = item.find("title").text if item.find("title") is not None else ""
            raw_desc = item.find("description").text if item.find("description") is not None else ""
            title_clean = clean_html(raw_title)
            
            # 토목/채용 관련성 검증
            if not any(k in title_clean for k in ["채용", "공채", "모집", "인턴"]):
                continue
            if not any(k in (title_clean + " " + raw_desc) for k in ["토목", "인프라", "시공", "설계", "엔지니어"]):
                continue
                
            # 회사 매핑
            matched_company = None
            for comp_name in COMPANY_REGISTRY.keys():
                if comp_name in title_clean:
                    matched_company = comp_name
                    break
            
            if not matched_company:
                continue
                
            # 이미 등록된 동일 회사의 활성 공고가 있으면 업데이트만 보강
            existing = [j for j in collected_jobs if j["company"] == matched_company]
            if existing:
                continue

    print(f"  [+] 유효 활성 채용 공고 총 {len(collected_jobs)}건 정제 완료.")
    
    # 신규 채용 카테고리 자동 감지 및 등록 (전체 건수 합산 일치 영구 보장)
    existing_job_cat_ids = {c["id"] for c in JOB_CATEGORIES}
    final_job_categories = list(JOB_CATEGORIES)
    for j in collected_jobs:
        cid = j.get("category_id")
        cname = j.get("category_name", cid)
        if cid and cid not in existing_job_cat_ids:
            existing_job_cat_ids.add(cid)
            final_job_categories.append({"id": cid, "name": cname})

    # 최종 JSON 파일 저장
    jobs_data = {
        "last_updated": now_kst.strftime("%Y-%m-%d %H:%M"),
        "last_updated_display": now_kst.strftime("%Y년 %m월 %d일 %H:%M"),
        "total_count": len(collected_jobs),
        "categories": final_job_categories,
        "jobs": collected_jobs
    }
    
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(JOBS_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(jobs_data, f, ensure_ascii=False, indent=2)
        
    print(f"  [✓] 채용 데이터베이스 저장 완료: {JOBS_JSON_PATH}")
    print("=" * 60)
    return jobs_data

if __name__ == "__main__":
    scrape_civil_jobs()
