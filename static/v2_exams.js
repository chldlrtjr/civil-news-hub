/* 토목 학생 시험·공채 일정 (손으로 관리, 해마다 한 번 갱신).
   확정(date, 접수 기간이면 end): 공식 출처에서 확인한 날짜만. 발표 전(month): 지난해 실적 기준 '○월쯤'으로만 보여요(추측 날짜 금지).
   항목마다 출처(link)와 확인한 날(checked), 예정은 근거(basis). 화면 계산은 static/v2_core.js examList·examLabel.
   갱신 때: Q-net 2027 국가기술자격 시행계획(보통 12월 공고)이 나오면 토목기사 항목을 date 로 바꿔요. */
(function () {
  const MPM = 'https://www.mpm.go.kr/mpm/comm/newsPress/newsPressRelease/?boardId=bbs_0000000000000029&mode=view&cntId=4360&category=&pageIdx=';
  const QNET = 'https://www.q-net.or.kr/crf021.do?id=crf02101&gSite=Q&gId=&scheType=03';
  const MPM_NOTE = '인사혁신처 2026.11.5. 보도자료 「내년도 공직적격성평가·국가공무원 시험 일정 발표」. 선발 인원·과목은 2027년 1월 초 공고';
  const QNET_NOTE = (y) => `발표 전이라 2026년 실적 기준 예정이에요 (2026년: ${y}). 토목기사는 정기 기사로 해마다 3회. 정확한 날짜는 Q-net 시행계획 공고 후 확인`;
  const EXAMS = [
    // ---- 확정: 국가직 공무원 (인사혁신처 공식 보도자료 표) ----
    { id: 'exam-2027-g9-apply', type: '시험', title: '국가직 9급 공채 원서접수', org: '인사혁신처', date: '2027-01-25', end: '2027-01-29', link: MPM, checked: '2026-11-26', basis: MPM_NOTE },
    { id: 'exam-2027-g9-exam', type: '시험', title: '국가직 9급 공채 필기시험', org: '인사혁신처', date: '2027-03-27', link: MPM, checked: '2026-11-26', basis: MPM_NOTE + '. 한국사는 한국사능력검정시험 3급 이상으로 대체' },
    { id: 'exam-2027-psat-apply', type: '시험', title: '공직적격성평가(PSAT) 기본 원서접수 (7급 1차 대체)', org: '인사혁신처', date: '2027-05-17', end: '2027-05-21', link: MPM, checked: '2026-11-26', basis: MPM_NOTE },
    { id: 'exam-2027-psat-exam', type: '시험', title: '공직적격성평가(PSAT) 기본 시험 (7급 1차 대체)', org: '인사혁신처', date: '2027-07-10', link: MPM, checked: '2026-11-26', basis: MPM_NOTE },
    { id: 'exam-2027-g7-apply', type: '시험', title: '국가직 7급 공채 원서접수', org: '인사혁신처', date: '2027-07-12', end: '2027-07-16', link: MPM, checked: '2026-11-26', basis: MPM_NOTE + '. PSAT 기본 접수와 따로 내야 해요' },
    { id: 'exam-2027-g7-exam', type: '시험', title: '국가직 7급 공채 2차 필기시험', org: '인사혁신처', date: '2027-10-02', link: MPM, checked: '2026-11-26', basis: MPM_NOTE },
    // ---- 예정: 토목기사 (Q-net 2027 시행계획 발표 전) ----
    { id: 'exam-2027-cv1', type: '시험', title: '토목기사 1회 필기 원서접수', org: '한국산업인력공단(Q-net)', month: '2027-01', link: QNET, checked: '2026-11-26', basis: QNET_NOTE('필기 접수 1.12~1.15, 필기 1.30~3.3, 실기 4.18~5.6') },
    { id: 'exam-2027-cv2', type: '시험', title: '토목기사 2회 필기 원서접수', org: '한국산업인력공단(Q-net)', month: '2027-04', link: QNET, checked: '2026-11-26', basis: QNET_NOTE('필기 접수 4.20~4.23, 필기 5.9~5.29, 실기 7.18~8.5') },
    { id: 'exam-2027-cv3', type: '시험', title: '토목기사 3회 필기 원서접수', org: '한국산업인력공단(Q-net)', month: '2027-07', link: QNET, checked: '2026-11-26', basis: QNET_NOTE('필기 접수 7.20~7.23, 필기 8.7~9.1, 실기 10.24~11.15') },
    // ---- 예정: 지방직 (행정안전부·시도 공고 전) ----
    { id: 'exam-2027-l9-exam', type: '시험', title: '지방직 9급 공채 필기시험', org: '행정안전부·17개 시도', month: '2027-06', link: 'https://www.news1.kr/amp/local/moi/6199597', checked: '2026-11-26', basis: '발표 전이라 2026년 실적 기준 예정이에요 (2026년: 6.20. 전국 동시 시행, 행정안전부 발표). 원서접수는 시도별 공고(보통 3월쯤)' },
    // ---- 예정: 공기업 공채 (지난해 접수 시기 기준) ----
    { id: 'exam-2027-lh-1', type: '공채', title: 'LH 상반기 신입 공채 접수', org: '한국토지주택공사', month: '2027-04', link: 'https://www.smarttoday.co.kr/ko-kr/articles/106344', checked: '2026-11-26', basis: '2026년 실적 기준 예정 (2026년 상반기: 4.16~4.23 접수, 5·6급 262명)' },
    { id: 'exam-2027-kr-1', type: '공채', title: '국가철도공단 상반기 신입·체험형 인턴 접수', org: '국가철도공단', month: '2027-05', link: 'https://jasoseol.com/recruit/103854', checked: '2026-11-26', basis: '2026년 실적 기준 예정 (2026년 제1차: 5.4~5.11 접수)' },
    { id: 'exam-2027-kw-intern', type: '공채', title: 'K-water 체험형 인턴 접수', org: '한국수자원공사', month: '2027-06', link: 'https://www.kwater.or.kr/recr/sub01/recruitPage.do?s_mid=2289', checked: '2026-11-26', basis: '2026년 실적 기준 예정 (2026년: 6.4~6.11 접수, 260명). 정규 신입 공채 시기는 확인 못 함' },
    { id: 'exam-2027-ex-2', type: '공채', title: '한국도로공사 하반기 일반직 신입(인턴) 접수', org: '한국도로공사', month: '2027-09', link: 'https://www.outsourcing.co.kr/news/articleView.html?idxno=203810', checked: '2026-11-26', basis: '2026년 실적 기준 예정 (2026년 하반기: 9.15~9.22 접수, 100명)' },
    { id: 'exam-2027-lh-2', type: '공채', title: 'LH 하반기 신입 공채 접수', org: '한국토지주택공사', month: '2027-09', link: 'https://biz.sbs.co.kr/amp/article/20000336161', checked: '2026-11-26', basis: '2026년 실적 기준 예정 (2026년 하반기: 9.22~9.29 접수, 235명)' },
    { id: 'exam-2027-kr-2', type: '공채', title: '국가철도공단 하반기 신입·경력 접수', org: '국가철도공단', month: '2027-09', link: 'https://www.outsourcing.co.kr/news/articleView.html?idxno=203922', checked: '2026-11-26', basis: '2026년 실적 기준 예정 (2026년 제2차: 9.30~10.7 접수, 184명)' },
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = EXAMS;
  else window.CNH_EXAMS = EXAMS;
})();
