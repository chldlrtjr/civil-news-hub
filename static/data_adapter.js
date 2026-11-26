/**
 * Civil News Hub: 실시간 크롤링 데이터 어댑터 (Data Adapter)
 * -------------------------------------------------------------
 * 번들된 실제 데이터(window.CNH_STATIC_DATA)를 화면용 모양으로 바꿔요 (file:/// 로 열어도 동작).
 * 가짜 예시 데이터(더미)는 넣지 않아요.
 */

window.CivilData = (() => {
  // 날짜 기반 남은 일수 (D-Day) 계산 유틸
  function calcDaysLeft(dateStr) {
    if (!dateStr) return 99;
    const match = dateStr.match(/(\d{4})[-.](\d{2})[-.](\d{2})/);
    if (!match) return 99;
    const target = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    const diff = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
    return isNaN(diff) ? 99 : diff;
  }

  // 뉴스 카테고리 매핑
  function mapNewsCat(rawCatId) {
    if (!rawCatId) return 'general';
    const s = String(rawCatId).toLowerCase();
    if (s.includes('road') || s.includes('rail')) return 'road';
    if (s.includes('water') || s.includes('port')) return 'water';
    if (s.includes('tunnel') || s.includes('geo')) return 'tunnel';
    if (s.includes('smart') || s.includes('bim')) return 'smart';
    return 'general';
  }

  // 원본 JSON 데이터셋들을 프론트엔드 포맷으로 일괄 변환
  function parseRawDatasets(raw) {
    if (!raw) return null;
    const newsData = raw.news || null;
    const contestsData = raw.contests || null;
    const jobsData = raw.jobs || null;
    const albasData = raw.albas || null;
    const swunivData = raw.swuniv || null;

    // 1. 트렌딩 키워드 (실제 크롤링된 실시간 키워드)
    const TRENDS = (newsData && newsData.trending_keywords && newsData.trending_keywords.length)
      ? newsData.trending_keywords.map((kw, idx) => [kw, idx % 2 === 0 ? 1 : 0])
      : [];

    // 2. 뉴스 (실제 크롤링 기사)
    let NEWS = [];
    if (newsData && newsData.articles && newsData.articles.length) {
      NEWS = newsData.articles.map((a, idx) => {
        const related = (a.related_articles || []).map(r => ({
          publisher: r.publisher || '관련언론',
          title: r.title || a.title,
          link: r.link || a.link || '#'
        }));
        return {
          id: a.id || ('n' + (idx + 1)),
          cat: mapNewsCat(a.category_id),
          src: a.publisher || '토목뉴스',
          iso: a.iso_date || '',  // 탭 복귀 때 'N분 전'을 다시 계산하려고 남겨요 (index.html visibilitychange)
          ago: (window.CNHv2 && CNHv2.relTime(a.iso_date, Date.now())) || a.relative_date || (a.published_at ? a.published_at.slice(5, 10) : '최근'),
          n: related.length,
          title: a.title,
          lede: (a.snippet && a.snippet.trim().length >= 10) ? a.snippet.trim() : a.title,
          image: a.is_curated_image ? '' : (a.image || a.og_image || a.thumbnail || ''),
          isCurated: false,
          link: a.link || '#',
          clusters: related
        };
      });
    }

    // 3. 공모전 (실제 검증된 공모전)
    let CONTESTS = [];
    if (contestsData && contestsData.contests && contestsData.contests.length) {
      CONTESTS = contestsData.contests.map((c, idx) => {
        const isJbnu = c.category === '전북대' || (c.id && (c.id.includes('jbnu') || c.id.startsWith('campus-')));
        const campus = c.source === 'campus' || isJbnu;
        // 상금을 알 수 없으면 0 → 카드에 '총 상금' 대신 '○○에서 모집'으로 표시 (임의 금액 표기 금지)
        let prizeNum = 0;
        if (c.prize) {
          const pMatch = c.prize.replace(/,/g, '').match(/(\d+)\s*만/);
          if (pMatch) prizeNum = parseInt(pMatch[1]);
          else {
            const pMatch2 = c.prize.replace(/,/g, '').match(/(\d+)\s*억/);
            if (pMatch2) prizeNum = parseInt(pMatch2[1]) * 10000;
          }
        }
        let award = '';
        if (c.prize && c.prize.includes('장관상')) award = '장관상';
        else if (c.prize && c.prize.includes('사장상')) award = '사장상';
        else if (c.prize && c.prize.includes('이사장상')) award = '이사장상';
        else if (c.prize && c.prize.includes('협회장상')) award = '협회장상';
        else if (c.prize && c.prize.includes('시장상')) award = '시장상';
        else if (c.prize && c.prize.includes('총장상')) award = '총장상';
        else if (c.prize && c.prize.includes('도지사')) award = '도지사상';
        else if (c.prize && c.prize.includes('센터장상')) award = '센터장상';

        let targetArr = ['대학생', '일반'];
        if (Array.isArray(c.target)) targetArr = c.target;
        else if (typeof c.target === 'string') {
          targetArr = c.target.split(/[,/·\s]+/).filter(t => t.length >= 2).slice(0, 2);
        }

        const daysLeft = (c.dday_info && typeof c.dday_info.days === 'number')
          ? c.dday_info.days
          : (c.days_left ?? calcDaysLeft(c.deadline_date || c.period));

        let category = c.category;
        if (category === '전북대 토목') category = '토목';
        if (!category || category === '일반') {
          if (c.track === 'it') category = '컴퓨터공학';
          else if (c.track === 'civil') category = '토목';
          else category = campus ? '전북대' : '토목';
        }

        return {
          id: c.id || ('c' + (idx + 1)),
          title: c.title,
          category: category,
          org: c.organizer || (campus ? '전북대' : '공공기관'),
          award: campus ? (((c.prize || '').match(/[가-힣]+상(?![가-힣])/) || [''])[0]) : award,
          prize: prizeNum,
          target: campus ? ['대학생'] : (targetArr.length ? targetArr : ['대학생', '일반']),
          targetText: campus && typeof c.target === 'string' ? c.target : '',
          campus: campus,
          image: c.image || c.poster || '',
          srcName: c.source_name || (isJbnu ? '전북대 공지' : '주최 측'),
          start: -7,
          end: daysLeft,
          added: idx,
          link: c.link || '#',
          period: c.period || '',
          startDate: c.start_date || '',
          deadline: c.deadline_date || '',
          resultDate: c.result_date || '',
          resultLabel: c.result_label || '',
          track: c.track === 'it' ? 'it' : 'civil',
          description: c.description || c.target_details || c.submission_info || ''
        };
      });
    }

    // 4. 채용 (실제 채용 공고)
    let JOBS = [];
    const JOB_GRP = { public: 'public', builder: 'major', engineering: 'design' };
    const colors = ['#1F6FB2', '#2F7D4A', '#B5462E', '#34495E', '#7A4DB8', '#C07A12', '#157A7A'];
    if (jobsData && jobsData.jobs && jobsData.jobs.length) {
      JOBS = jobsData.jobs.map((j, idx) => {
        const daysLeft = calcDaysLeft(j.deadline_date || j.period);

        return {
          id: j.id || ('j' + (idx + 1)),
          grp: JOB_GRP[j.category_id] || 'major',
          co: j.company,
          color: colors[idx % colors.length],
          role: j.title,
          lvl: j.career || '경력무관',
          career: j.career || '',  // 판정용 원래 값 (CNHv2.studentJob 이 화면용 기본값 '경력무관'을 학생 공고로 세지 않게)
          exp: '',
          steps: (j.steps && j.steps.length) ? j.steps : ['공고 원문 참조'],
          end: daysLeft,
          deadline: j.deadline_date || '',
          period: j.period || '',
          loc: j.location || '공고 원문 참조',
          welfare: j.tags || [],
          link: j.link || '#',
          summary: j.summary || ''
        };
      });
    }
    // 공채속보에 안 올라오는 주요 기관·기업의 공식 채용 페이지 링크
    const CAREER_PAGES = ((jobsData && jobsData.career_pages) || []).map(p => ({
      co: p.company, grp: JOB_GRP[p.category_id] || 'major', link: p.link
    }));

    // 5. 전북대 알바 (실제 아르바이트 공고)
    let ALBA = [];
    if (albasData && albasData.jobs && albasData.jobs.length) {
      ALBA = albasData.jobs.map((a, idx) => {
        // 급여 유형: hour(시급) · day(일급) · month(월급) · nego(협의·금액 불명확)
        // 공고에 금액이 없거나 해석이 안 되면 임의 시급을 넣지 않고 원문(wage_display)을 그대로 보여 줌
        const TYPE = { hourly: 'hour', daily: 'day', monthly: 'month' };
        const type = (a.sort_wage && TYPE[a.wage_type]) || 'nego';
        const wageNum = type === 'nego' ? 0 : a.sort_wage;

        let daysLeft = 99;  // D-day가 없으면 마감일 미상 (상시)
        if (a.dday) {
          const dMatch = a.dday.match(/D[-]?(\d+)/i);
          if (dMatch) daysLeft = parseInt(dMatch[1]);
          else if (a.dday.includes('오늘') || a.dday.includes('Day')) daysLeft = 0;
        } else if (a.deadline_date) {
          daysLeft = calcDaysLeft(a.deadline_date);
        }

        return {
          id: a.id || ('a' + (idx + 1)),
          title: a.title,
          where: a.company || '전북대학교',
          type: type,
          wage: wageNum,
          wageText: a.wage_display || '급여 협의',
          // 공고 근무시간에서 계산한 주 근무시간 (요일·시간이 명확하지 않으면 null → 월 수입 추정 안 함)
          hours: a.weekly_hours || null,
          // 일급 공고는 공고에 적힌 근무일 수 기준 (없으면 1일)
          days: (a.work_dates && a.work_dates.length) || 1,
          end: daysLeft,
          tag: a.category_name || '교내',
          link: a.link || '#',
          time: a.work_time || '협의',
          person: a.person || '0명',
          reg_date: a.reg_date || '',
          deadline_date: a.deadline_date || '',
          wage_display: a.wage_display || '',
          monthly_estimate: a.monthly_estimate || ''
        };
      });
    }

    // 6. 전북대 SW (실제 프로그램)
    let SW = [];
    if (swunivData && swunivData.programs && swunivData.programs.length) {
      SW = swunivData.programs.map((s, idx) => {
        let daysLeft = s.days_left;
        if (daysLeft === undefined && s.deadline_date) {
          daysLeft = calcDaysLeft(s.deadline_date);
        }
        return {
          id: s.id || ('s' + (idx + 1)),
          title: s.title,
          kind: s.category || '프로그램',
          when: s.activity_period || s.apply_period || '상세 공고 참조',
          end: daysLeft ?? 5,
          seats: s.capacity || '정원 마감 시',
          image: s.thumbnail || s.image || '',
          link: s.link || '#',
          deadline_date: s.deadline_date || '',
          location: s.location || '-',
          point: s.point || '-'
        };
      });
    }

    const result = {
      TRENDS,
      NEWS,
      CONTESTS,
      JOBS,
      CAREER_PAGES,
      ALBA,
      SW,
      meta: {
        newsCount: NEWS.length,
        contestsCount: CONTESTS.length,
        jobsCount: JOBS.length,
        albaCount: ALBA.length,
        swCount: SW.length,
        lastUpdated: (newsData && newsData.last_updated_display) || '실시간 최신'
      }
    };
    return result;
  }

  // 번들(cnh_data_bundle.js)이 곧 최신 데이터예요: data/*.json 과 같은 커밋으로 함께 배포돼서 다시 받을 필요가 없어요
  function getInitialData() {
    if (window.CNH_STATIC_DATA && typeof window.CNH_STATIC_DATA === 'object') {
      try {
        const parsed = parseRawDatasets(window.CNH_STATIC_DATA);
        if (parsed && parsed.NEWS && parsed.NEWS.length) return parsed;
      } catch (e) {
        console.warn('Failed to parse CNH_STATIC_DATA:', e);
      }
    }
    return null;
  }

  return {
    getInitialData,
    calcDaysLeft,
    mapNewsCat
  };
})();
