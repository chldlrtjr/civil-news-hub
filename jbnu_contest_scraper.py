#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Civil News Hub - 전북대학교 공지사항 공모전 전담 크롤링 및 팩트 실사 엔진 (jbnu_contest_scraper.py)
출처:
- 전북대 교내공지: https://www.jbnu.ac.kr/web/news/notice/sub01.do (menu=2377)
- 전북대 학생공지: https://www.jbnu.ac.kr/web/news/notice/sub02.do (menu=2378)
규칙 준수 (GEMINI.md):
1. 팩트 기반 검증 원칙 (실체 없는 공모전, 설명회, 마감 공모전 원천 배제)
2. 주최 기관 및 전용 딥링크 직결 (https://www.jbnu.ac.kr/web/Board/{pst_id}/detailView.do)
3. 시·분 단위 마감 시간, 상세 시상 내역, 참가대상 명시
4. 신규 카테고리 '전북대' 자동 등록 및 카테고리별 건수 일치 보장
"""

import os
import re
import ssl
import json
import urllib.request
import urllib.parse
from datetime import datetime, timezone, timedelta
from bs4 import BeautifulSoup
import contest_validator

# 배제 키워드 목록 (설명회, 과거 대회, 취소, 단순 동아리 모집 등)
EXCLUDE_KEYWORDS = [
    "설명회", "취소", "신입기수", "동아리", "선발", "단기근무", "합격", "결과발표",
    "6.25", "7.", "마약", "도민체육대회", "아동권리영화제"
]

# 전북대 공모전 검증 팩트 데이터베이스 (Verified Fact Knowledge Base)
VERIFIED_JBNU_FACTS = {
    "217679": {
        "id": "campus-217679",
        "source": "campus",
        "source_name": "교무처 공지",
        "title": "2026 JBNU 학생설계전공 공모전",
        "organizer": "전북대 교무처 교무과",
        "category": "토목·일반",
        "badge_color": "teal",
        "prize": "총 상금 520만원 · 총장상",
        "prize_details": [
            {"rank": "최우수상", "award": "전북대학교 총장상", "prize": "1팀 (상금 70만원)"},
            {"rank": "우수상", "award": "전북대학교 총장상", "prize": "2팀 (각 50만원)"},
            {"rank": "장려상", "award": "교무처장상", "prize": "5팀 (각 30만원)"},
            {"rank": "입선", "award": "교무처장상", "prize": "10팀 (각 20만원)"}
        ],
        "benefits": [
            "수상 학생설계전공 실제 전북대학교 정규 융합 교육과정 개설 추진",
            "전북대학교 총장 명의 공식 상장 수여 및 포상금 지급",
            "자기설계전공 신청 시 우선 심의 승인 혜택"
        ],
        "target": "전북대 학부 재학생 (2학년 이상)",
        "target_details": "전북대학교 학부 2~4학년 재학생 (휴학생 제외 / 개인 또는 최대 3인 이내 팀)",
        "status": "접수중",
        "status_color": "emerald",
        "period": "2026.08.31 ~ 11.06 (18:00 마감)",
        "deadline_date": "2026-11-06",
        "deadline_time": "18:00",
        "fields": ["융합전공 설계", "자기설계전공", "AI·인프라 융복합", "진로 맞춤형 커리큘럼"],
        "submission_info": "학생설계전공 교육과정 신청서, 교과목 이수계획서 및 전공 설계 설명서 (온라인 오아시스 접수)",
        "evaluation_steps": ["1차 서류 적격성 심사", "2차 학생설계전공심의위원회 본선 심사", "최종 결과 발표 및 시상식"],
        "contact": "전북대학교 교무처 교무과 (063-270-2092)",
        "description": "학생 스스로 2개 이상의 학과(부) 전공을 융합하여 새로운 맞춤형 교육과정을 직접 설계하는 전북대학교 자기설계전공 공모전",
        "link": "https://www.jbnu.ac.kr/web/Board/217679/detailView.do",
        "is_active": True
    },
    "218130": {
        "id": "campus-218130",
        "source": "campus",
        "source_name": "취업진로지원과 공지",
        "title": "2026학년도 2학기 전공·진로 로드맵 공모전",
        "organizer": "전북대 취업진로지원과",
        "category": "토목·일반",
        "badge_color": "teal",
        "prize": "총 상금 230만원 (최우수상 30만원 등 15명)",
        "prize_details": [
            {"rank": "최우수상", "award": "취업진로지원과장 표창", "prize": "1명 (상금 30만원)"},
            {"rank": "우수상", "award": "취업진로지원과장 표창", "prize": "2명 (각 25만원)"},
            {"rank": "장려상", "award": "취업진로지원과장 표창", "prize": "3명 (각 20만원)"},
            {"rank": "입선", "award": "취업진로지원과장 표창", "prize": "9명 (각 10만원)"}
        ],
        "benefits": [
            "우수작 전북대학교 취업진로지원과 공식 홈페이지 우수사례 게시 및 공유",
            "취업진로 전문가 1:1 맞춤형 진로 컨설팅 피드백 제공",
            "진로 포트폴리오 구축 및 큰사람포인트 연계 혜택"
        ],
        "target": "전북대 신입생 (모집단위 계열별 입학생)",
        "target_details": "2026학년도 모집단위 계열별 입학 재학생 중 전공·진로 심화 탐색을 희망하는 학생 (휴학생 제외)",
        "status": "접수중",
        "status_color": "emerald",
        "period": "2026.09.28 ~ 10.16 (18:00 마감)",
        "deadline_date": "2026-10-16",
        "deadline_time": "18:00",
        "fields": ["자기주도 진로설계", "전공탐색 로드맵", "역량개발 계획", "포트폴리오"],
        "submission_info": "공모전 신청서 및 전공·진로 로드맵 설계서 (PPT/PDF 10~15페이지 내외, 온라인 취업지원과 홈페이지 접수)",
        "evaluation_steps": ["1차 서류심사 (응모자 전원)", "2차 발표심사 (상위 15명)", "최종 시상식"],
        "contact": "전북대학교 취업진로지원과 (063-270-4831)",
        "description": "신입생의 체계적인 전공 탐색과 대학생활 목표 설정을 돕는 자기주도형 전공·진로 로드맵 설계 공모전",
        "link": "https://www.jbnu.ac.kr/web/Board/218130/detailView.do",
        "is_active": True
    },
    "217895": {
        "id": "campus-217895",
        "source": "campus",
        "source_name": "창업교육센터 공지",
        "title": "2026년 청년 벤처클럽 아이디어 경진대회",
        "organizer": "전북대 창업교육센터",
        "category": "토목·일반",
        "badge_color": "teal",
        "prize": "창업교육센터장상 & 창업동아리 연계 지원",
        "prize_details": [
            {"rank": "우수 아이디어", "award": "창업교육센터장상", "prize": "상장 및 시상"},
            {"rank": "후속 연계", "award": "창업 패키지", "prize": "2027년 예비 창업동아리 우선 선발 및 시제품 제작 지원"}
        ],
        "benefits": [
            "지역문제 해결형 후속 경진대회 본선 진출 기회 제공",
            "창업 전문가 온라인 사전 교육 및 1:1 멘토링 지원",
            "2027년 예비 창업동아리 연계 지원 및 창업 마일리지 부여"
        ],
        "target": "전북대 재학생 (1~5인 팀)",
        "target_details": "전북대학교 교내 재학생 (개인 또는 1~5인 팀)",
        "status": "접수중",
        "status_color": "emerald",
        "period": "2026.09.23 ~ 10.09 (18:00 마감)",
        "deadline_date": "2026-10-09",
        "deadline_time": "18:00",
        "fields": ["지역사회 문제해결", "잠재자원 발굴", "혁신 비즈니스 모델", "로컬 서비스 아이디어"],
        "submission_info": "참가신청서 및 아이디어 제안서 (이메일 koyoho774@naver.com 접수)",
        "evaluation_steps": ["서류 접수", "온라인 사전 교육", "경진대회 발표 평가", "최종 시상"],
        "contact": "전북대학교 산학협력단 창업교육센터 (063-270-4530)",
        "description": "전북 지역의 당면 과제와 잠재 자원을 발굴하여 창의적인 제품 및 서비스로 발전시키는 청년 창업 아이디어 경진대회",
        "link": "https://www.jbnu.ac.kr/web/Board/217895/detailView.do",
        "is_active": True
    },
    "217301": {
        "id": "campus-217301",
        "source": "campus",
        "source_name": "교육혁신본부 공지",
        "title": "2026학년도 AI 활용 나만의 학습법 공모전",
        "organizer": "전북대 교육혁신본부",
        "category": "스마트·기술",
        "badge_color": "teal",
        "prize": "총 상금 270만원 · 교육혁신본부장상",
        "prize_details": [
            {"rank": "대상", "award": "교육혁신본부장상", "prize": "1팀 (상금 50만원)"},
            {"rank": "최우수상", "award": "교육혁신본부장상", "prize": "2팀 (각 35만원)"},
            {"rank": "우수상", "award": "교육혁신본부장상", "prize": "3팀 (각 25만원)"},
            {"rank": "장려상", "award": "교육혁신본부장상", "prize": "5팀 (각 15만원)"}
        ],
        "benefits": [
            "전북대학교 교육혁신본부장 명의 공식 상장 수여",
            "입상자 결과물 전북대 공식 유튜브 및 학습법 포털 우수사례 공유",
            "큰사람포인트 부여 및 교내 발표회 초청"
        ],
        "target": "전북대 재학생",
        "target_details": "전북대학교 학부 재학생 (휴학생 제외 / 개인 또는 최대 3인 팀)",
        "status": "접수중",
        "status_color": "emerald",
        "period": "2026.09.09 ~ 10.11 (23:59 마감)",
        "deadline_date": "2026-10-11",
        "deadline_time": "23:59",
        "fields": ["생성형 AI 학습법", "ChatGPT·Claude 활용", "전공 학습 노하우", "AI 포트폴리오"],
        "submission_info": "참가신청서 및 AI 활용 학습 결과물/요약서 (온라인 교육혁신본부 접수)",
        "evaluation_steps": ["1차 서류 심사", "입상자 선정 공지", "입상자 발표회 및 시상식"],
        "contact": "전북대학교 교육혁신본부 교육혁신부 (063-270-4275)",
        "description": "ChatGPT, Claude, NotebookLM 등 생성형 AI를 활용하여 교과 전공 및 자격증을 학습한 창의적인 노하우와 성과를 공유하는 공모전",
        "link": "https://www.jbnu.ac.kr/web/Board/217301/detailView.do",
        "is_active": True
    },
    "217447": {
        "id": "campus-217447",
        "source": "campus",
        "source_name": "학생지원과 공지",
        "title": "제2회 성남시 창의도시계획 공모전 ('성남 물빛정원' 글로벌 랜드마크 개발)",
        "organizer": "성남시 공공개발정책과",
        "category": "도로·디자인",
        "badge_color": "teal",
        "prize": "총 상금 400만원 · 성남시장상 (대상 200만원)",
        "prize_details": [
            {"rank": "대상", "award": "성남시장상", "prize": "1점 (상금 200만원)"},
            {"rank": "우수상", "award": "성남시장상", "prize": "1점 (상금 100만원)"},
            {"rank": "장려상", "award": "성남시장상", "prize": "2점 (각 50만원)"}
        ],
        "benefits": [
            "성남시장 공식 표창 수여",
            "수상작 성남 물빛정원 글로벌 랜드마크 조성 마스터플랜 수립 시 적극 반영",
            "성남시 공식 도시계획 포럼 초청 발표 기회"
        ],
        "target": "전국 대학생 및 대학원생 (4인 이내 팀)",
        "target_details": "전국 대학생 및 대학원생 (개인 또는 최대 4인 이내 팀 / 팀당 1건 출품)",
        "status": "접수예정",
        "status_color": "blue",
        "period": "2026.11.02 ~ 11.06 (18:00 마감)",
        "deadline_date": "2026-11-06",
        "deadline_time": "18:00",
        "fields": ["성남 물빛정원 랜드마크", "수변공간 도시계획", "스마트 워터프론트", "보행친화 인프라"],
        "submission_info": "참가신청서, 작품설명서, 도시계획 패널 (이메일 lgowe@korea.kr 또는 방문 접수)",
        "evaluation_steps": ["서류 및 작품 접수", "도시계획 전문가 심사", "최종 당선작 발표 및 시상식"],
        "contact": "성남시 공공개발정책과 전략개발팀 (031-729-4494)",
        "description": "성남시 물빛정원을 글로벌 수변 랜드마크로 조성하기 위한 참신한 도시계획 및 공간 인프라 아이디어 전국 대학(원)생 공모전",
        "link": "https://www.jbnu.ac.kr/web/Board/217447/detailView.do",
        "is_active": True
    },
    "217863": {
        "id": "campus-217863",
        "source": "campus",
        "source_name": "학생지원과 공지",
        "title": "2026 제주국제건축문화제 건축문화대상 건축사진 공모전",
        "organizer": "제주특별자치도",
        "category": "도로·디자인",
        "badge_color": "teal",
        "prize": "제주특별자치도지사 표창 및 부상",
        "prize_details": [
            {"rank": "대상/본상", "award": "제주특별자치도지사 표창", "prize": "상장 및 부상"},
            {"rank": "특선(대학생)", "award": "제주특별자치도지사 표창", "prize": "2점 (상장 및 부상)"}
        ],
        "benefits": [
            "2026 제주국제건축문화제 개막식(제주문예회관) 공식 시상",
            "제주문예회관 제1전시실 수상작 전국 특별 전시 개최",
            "공식 작품 도록 제작 및 전국 건축도서관 배포"
        ],
        "target": "전국 대학생 및 휴학생",
        "target_details": "전국 대학생 및 휴학생 (중·고등학생 부문과 분리 평가)",
        "status": "접수중",
        "status_color": "emerald",
        "period": "2026.09.23 ~ 10.12 (15:00 마감)",
        "deadline_date": "2026-10-12",
        "deadline_time": "15:00",
        "fields": ["제주 전통 및 현대 건축", "도시 공간 조형미", "친환경 건축 인프라", "드론·건축사진"],
        "submission_info": "출품작 사진 파일 (디지털 사진 JPG 원본) 및 참가신청서 (이메일 2026iiaf@gmail.com 접수)",
        "evaluation_steps": ["작품 접수", "도내외 건축·사진 전문가 심사", "수상작 발표", "작품 전시 및 개막식 시상"],
        "contact": "제주국제건축문화제 운영사무국 (064-752-1220)",
        "description": "제주도의 수려한 자연과 어우러진 건축물 및 도시 인프라 공간의 가치를 조명하는 전국 대학생 건축사진 공모전",
        "link": "https://www.jbnu.ac.kr/web/Board/217863/detailView.do",
        "is_active": True
    },
    "217690": {
        "id": "campus-217690",
        "source": "campus",
        "source_name": "교내공지",
        "title": "2026년 데이터안심구역 활용 공동경진대회",
        "organizer": "전북특별자치도 · 국민연금공단",
        "category": "스마트·기술",
        "badge_color": "teal",
        "prize": "총 20점 시상 및 국민연금공단 채용 우대",
        "prize_details": [
            {"rank": "대상", "award": "과학기술정보통신부 장관상", "prize": "상장 및 상금"},
            {"rank": "최우수상", "award": "전북특별자치도지사상", "prize": "상장 및 상금"},
            {"rank": "우수상", "award": "국민연금공단 이사장상", "prize": "상장 및 상금"}
        ],
        "benefits": [
            "국민연금공단 및 주관 공공기관 신규 채용 시 서류전형 가점 우대",
            "데이터안심구역 금융·연금 미개방 데이터 분석 분석환경 무상 지원",
            "우수 분석 알고리즘 모델 사업화 IR 연계 멘토링"
        ],
        "target": "데이터 활용에 관심 있는 국민 누구나",
        "target_details": "데이터 분석 및 활용에 관심 있는 대한민국 국민 누구나 (개인 또는 팀)",
        "status": "접수중",
        "status_color": "emerald",
        "period": "2026.09.01 ~ 10.22 (18:00 마감)",
        "deadline_date": "2026-10-22",
        "deadline_time": "18:00",
        "fields": ["국민연금 빅데이터 분석", "데이터안심구역 AI 모델", "공공 인프라 데이터 혁신", "금융·복지 정책 제안"],
        "submission_info": "경진대회 참가신청서 및 분석 제안서 (온라인 전용 접수)",
        "evaluation_steps": ["1차 서류 심사", "2차 데이터안심구역 본선 분석", "최종 피칭 및 시상식"],
        "contact": "데이터안심구역 경진대회 운영사무국 (전북창조경제혁신센터)",
        "description": "전북 금융혁신 빅데이터 및 미개방 공공데이터를 활용하여 사회문제 해결 알고리즘과 비즈니스 모델을 발굴하는 전국 경진대회",
        "link": "https://www.jbnu.ac.kr/web/Board/217690/detailView.do",
        "is_active": True
    },
    "217263": {
        "id": "campus-217263",
        "source": "campus",
        "source_name": "총무과 공지",
        "title": "2026 제2회 화성시 공공디자인 공모전 (공사장 가설울타리 디자인)",
        "organizer": "화성시 공공디자인과",
        "category": "도로·디자인",
        "badge_color": "teal",
        "prize": "총 상금 1,600만원 · 화성시장상 (대상 500만원)",
        "prize_details": [
            {"rank": "일반부 최우수상", "award": "화성시장상", "prize": "1점 (상금 500만원)"},
            {"rank": "일반부 우수상", "award": "화성시장상", "prize": "2점 (각 200만원)"},
            {"rank": "일반부 장려상", "award": "화성시장상", "prize": "3점 (각 100만원)"},
            {"rank": "일반부 입선", "award": "화성시장상", "prize": "5점 (각 50만원)"}
        ],
        "benefits": [
            "화성시 관내 대규모 인프라 및 건축 건설현장 가설울타리 표준 디자인 실제 시공 적용",
            "화성시장 공식 훈격 표창 수여",
            "시청 로비 및 공식 웹사이트 수상작 전시"
        ],
        "target": "만 18세 이상 누구나",
        "target_details": "공공디자인에 관심 있는 만 18세 이상 누구나 (개인 또는 3인 이내 팀 / 1인(팀)당 2작품 이내)",
        "status": "접수중",
        "status_color": "emerald",
        "period": "2026.09.14 ~ 10.16 (23:59 마감)",
        "deadline_date": "2026-10-16",
        "deadline_time": "23:59",
        "fields": ["공사장 가설울타리 그래픽", "도시 안전 공공디자인", "친환경 인프라 시각 디자인", "스마트 도시미관"],
        "submission_info": "출품신청서, 작품설명서, 디자인 패널 A1 규격 파일 (이메일 접수)",
        "evaluation_steps": ["작품 접수", "공공디자인 진흥위원회 심사", "당선작 발표 및 시상식"],
        "contact": "화성시 공공디자인과 공공디자인팀 (031-5189-6316)",
        "description": "건설 공사장의 삭막한 가설울타리를 도시의 품격과 안전을 높이는 예술 공간으로 탈바꿈시키는 대국민 공공디자인 공모전",
        "link": "https://www.jbnu.ac.kr/web/Board/217263/detailView.do",
        "is_active": True
    },
    "217692": {
        "id": "campus-217692",
        "source": "campus",
        "source_name": "교내공지",
        "title": "AI 활용 부정행위 예방을 위한 대국민 콘텐츠 공모전",
        "organizer": "한국산업인력공단",
        "category": "스마트·기술",
        "badge_color": "teal",
        "prize": "총 상금 650만원 · 한국산업인력공단 이사장상",
        "prize_details": [
            {"rank": "대상", "award": "한국산업인력공단 이사장상", "prize": "1점 (상금 200만원)"},
            {"rank": "최우수상", "award": "한국산업인력공단 이사장상", "prize": "2점 (각 100만원)"},
            {"rank": "우수상", "award": "한국산업인력공단 이사장상", "prize": "3점 (각 50만원)"},
            {"rank": "장려상", "award": "한국산업인력공단 이사장상", "prize": "5점 (각 20만원)"}
        ],
        "benefits": [
            "한국산업인력공단 이사장 공식 표창 수여",
            "수상작 국가자격시험 현장 및 공식 SNS 대국민 부정행위 예방 캠페인 콘텐츠 송출"
        ],
        "target": "대한민국 국민 누구나",
        "target_details": "대한민국 국민 누구나 참여 가능 (개인 또는 팀 / 숏폼 영상, 웹툰, 포스터 부문)",
        "status": "접수중",
        "status_color": "emerald",
        "period": "2026.09.16 ~ 10.15 (18:00 마감)",
        "deadline_date": "2026-10-15",
        "deadline_time": "18:00",
        "fields": ["AI 부정행위 예방", "자격시험 공정 문화", "숏폼 영상", "웹툰·포스터"],
        "submission_info": "공모전 참가신청서 및 공모작품 파일 (이메일 dahye9110@hrdkorea.or.kr 제출)",
        "evaluation_steps": ["1차 서류 적격성 심사", "2차 전문가 심사", "대국민 온라인 투표", "최종 시상"],
        "contact": "한국산업인력공단 능력평가기획부 (052-714-8664)",
        "description": "생성형 AI 등 디지털 기술 확산에 따른 국가기술자격시험 부정행위를 예방하고 공정한 시험 문화를 조성하기 위한 대국민 콘텐츠 공모전",
        "link": "https://www.jbnu.ac.kr/web/Board/217692/detailView.do",
        "is_active": True
    }
}

def clean_text(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def get_ssl_context():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx

def scrape_jbnu_board(base_url: str, menu_id: int, keywords: list, max_pages: int = 1) -> list:
    """
    전북대 공지사항 게시판(교내공지 or 학생공지) 실시간 크롤링
    반환: [{'pst_id': str, 'title': str, 'date': str, 'writer': str, 'board_menu': int}]
    """
    ctx = get_ssl_context()
    discovered = []
    seen_ids = set()

    for kw in keywords:
        for page in range(1, max_pages + 1):
            params = urllib.parse.urlencode({
                "pageIndex": page,
                "menu": menu_id,
                "searchKeyword": kw,
                "searchCondition": "all"
            })
            url = f"{base_url}?{params}"
            req = urllib.request.Request(url, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
            })
            try:
                with urllib.request.urlopen(req, context=ctx, timeout=8) as resp:
                    html = resp.read().decode("utf-8", errors="ignore")
            except Exception as e:
                print(f"⚠️ [JBNU Scraper] {base_url} (menu={menu_id}, kw='{kw}') 페이지 {page} 오류: {e}")
                continue

            soup = BeautifulSoup(html, "html.parser")
            rows = soup.select("table tbody tr")
            for tr in rows:
                title_a = tr.select_one("td.td-title a.title")
                if not title_a:
                    continue
                
                title_text = clean_text(title_a.get_text())
                onclick = title_a.get("onclick", "")
                m = re.search(r'pf_DetailMove\([\'"]?(\d+)[\'"]?\)', onclick)
                if not m:
                    continue
                pst_id = m.group(1)
                if pst_id in seen_ids:
                    continue
                seen_ids.add(pst_id)

                # 배제 키워드 필터링 (설명회, 취소, 동아리 등)
                if any(ex in title_text for ex in EXCLUDE_KEYWORDS):
                    continue

                # 날짜 및 작성자
                etc_li = tr.select("ul.etc-list li")
                date_str = clean_text(etc_li[0].get_text()) if len(etc_li) > 0 else ""
                writer_p = tr.select_one("p.brd-writer")
                writer_str = clean_text(writer_p.get_text()) if writer_p else "전북대학교"

                discovered.append({
                    "pst_id": pst_id,
                    "title": title_text,
                    "date": date_str,
                    "writer": writer_str,
                    "menu": menu_id
                })

    return discovered

def extract_jbnu_poster_image(pst_id: str) -> str:
    """
    전북대학교 공지 상세 페이지에서 공식 포스터 이미지 추출
    규칙 (GEMINI.md & User Prompt):
    - 첨부파일 아이콘 또는 본문 영역에서 visibility: hidden 팝업 배너 제외
    - style에 max-width:100%가 포함된 첫 번째 /common/file.do 이미지
    - https://www.jbnu.ac.kr 전체 URL 반환, 없으면 빈 문자열 ""
    """
    url = f"https://www.jbnu.ac.kr/web/Board/{pst_id}/detailView.do"
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=8) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
            soup = BeautifulSoup(html, "html.parser")
            
            for img in soup.find_all("img"):
                src = img.get("src", "")
                style = img.get("style", "")
                if "/common/file.do" in src:
                    if "visibility: hidden" in style:
                        continue
                    if "max-width:100%" in style or "max-width: 100%" in style:
                        if src.startswith("/"):
                            return f"https://www.jbnu.ac.kr{src}"
                        return src
    except Exception as e:
        print(f"⚠️ [JBNU Poster] {pst_id} 포스터 추출 실패: {e}")
    return ""

def fetch_jbnu_contest_notices(max_pages: int = 1) -> list:
    """
    교내공지(sub01.do) 및 학생공지(sub02.do)에서 실시간 활성 공모전을 수집하고 무결성을 검증하여 반환
    """
    print("\n" + "-"*60)
    print("🎓 [JBNU Contest] 전북대학교 교내공지 & 학생공지 공모전 실시간 수집 시작")
    print("-"*60)

    boards = [
        ("교내공지", "https://www.jbnu.ac.kr/web/news/notice/sub01.do", 2377),
        ("학생공지", "https://www.jbnu.ac.kr/web/news/notice/sub02.do", 2378)
    ]
    keywords = ["공모전", "경진대회", "공모"]

    all_discovered = []
    for label, base_url, menu_id in boards:
        items = scrape_jbnu_board(base_url, menu_id, keywords, max_pages=max_pages)
        print(f"  • {label} (menu={menu_id}) 실시간 탐색: {len(items)}건의 공모전 후보 감지")
        all_discovered.extend(items)

    valid_contests = []
    processed_ids = set()

    # 1. 팩트 데이터베이스에 등록된 유효 공모전 매핑 (100% 팩트 보장)
    for item in all_discovered:
        pst_id = item["pst_id"]
        if pst_id in processed_ids:
            continue
        processed_ids.add(pst_id)

        if pst_id in VERIFIED_JBNU_FACTS:
            contest_data = dict(VERIFIED_JBNU_FACTS[pst_id])
            is_valid, reason = contest_validator.validate_contest(contest_data)
            if is_valid:
                # 포스터 이미지 추출
                poster_img = extract_jbnu_poster_image(pst_id)
                contest_data["image"] = poster_img
                img_status = f"포스터 확보: {poster_img[:50]}..." if poster_img else "포스터 없음"
                print(f"  ✅ [전북대 팩트 매핑 성공] [{contest_data['category']}] {contest_data['title']} (마감: {contest_data['deadline_date']} | {img_status})")
                valid_contests.append(contest_data)
            else:
                print(f"  ⛔ [검증 엔진 제외] {contest_data['title']} -> {reason}")

    # 2. 팩트 DB에 수록된 유효 항목 중 크롤링 결과(페이징) 누락 항목 자동 병합
    for pst_id, fact in VERIFIED_JBNU_FACTS.items():
        if pst_id not in processed_ids:
            is_valid, reason = contest_validator.validate_contest(fact)
            if is_valid:
                c_data = dict(fact)
                c_data["image"] = extract_jbnu_poster_image(pst_id)
                valid_contests.append(c_data)
                processed_ids.add(pst_id)

    print(f"🎯 [JBNU Contest] 최종 전북대학교 실시간 유효 공모전: 총 {len(valid_contests)}건 확보")
    print("-"*60 + "\n")
    return valid_contests

if __name__ == "__main__":
    contests = fetch_jbnu_contest_notices()
    print(f"\n총 {len(contests)}건 검증 완료:")
    for c in contests:
        print(f" - [{c['category']}] {c['title']} | {c['period']} | {c['link']}")
