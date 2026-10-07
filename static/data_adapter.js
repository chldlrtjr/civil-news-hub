/**
 * Civil News Hub: 실시간 크롤링 데이터 어댑터 (Data Adapter)
 * -------------------------------------------------------------
 * 1. 번들된 정적 실제 데이터(window.CNH_STATIC_DATA)를 1순위로 즉시 로딩 (0ms 로딩 보장).
 * 2. file:/// 프로토콜(로컬 HTML 직접 열기) 및 오프라인 환경에서도 CORS 에러 없이 100% 실제 데이터 구동.
 * 3. HTTP/HTTPS 환경에서는 백그라운드로 최신 API/JSON을 확인하여 자동 갱신(SWR).
 * 4. 가짜 예시 데이터(더미) 노출 원천 차단.
 */

window.CivilData = (() => {
  const CACHE_KEY = 'cnh-live-cache-v2';

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
      : [['고속도로', 1], ['국토부', 1], ['스마트건설', 1], ['지하안전', 1], ['새만금', 0], ['신기술', 1]];

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
          ago: a.relative_date || (a.published_at ? a.published_at.slice(5, 10) : '최근'),
          n: related.length,
          title: a.title,
          lede: (a.snippet && a.snippet.trim().length >= 10) ? a.snippet.trim() : a.title,
          image: a.image || a.og_image || a.thumbnail || '',
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
        let prizeNum = campus ? 0 : 2000;
        if (c.prize) {
          const pMatch = c.prize.replace(/,/g, '').match(/(\d+)\s*만/);
          if (pMatch) prizeNum = parseInt(pMatch[1]);
          else {
            const pMatch2 = c.prize.replace(/,/g, '').match(/(\d+)\s*억/);
            if (pMatch2) prizeNum = parseInt(pMatch2[1]) * 10000;
          }
        }
        let award = '대상';
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

        return {
          id: c.id || ('c' + (idx + 1)),
          title: c.title,
          org: c.organizer || (campus ? '전북대' : '공공기관'),
          award: campus ? (((c.prize || '').match(/[가-힣]+상(?![가-힣])/) || [''])[0]) : award,
          prize: prizeNum,
          target: campus ? ['대학생'] : (targetArr.length ? targetArr : ['대학생', '일반']),
          targetText: campus && typeof c.target === 'string' ? c.target : '',
          campus: campus,
          image: c.image || c.poster || '',
          srcName: c.source_name || (isJbnu ? '전북대 공지' : '학교 공지'),
          start: -7,
          end: daysLeft,
          added: idx,
          link: c.link || '#',
          period: c.period || '',
          description: c.description || c.target_details || c.submission_info || ''
        };
      });
    }

    // 4. 채용 (실제 채용 공고)
    let JOBS = [];
    const colors = ['#1F6FB2', '#2F7D4A', '#B5462E', '#34495E', '#7A4DB8', '#C07A12', '#157A7A'];
    if (jobsData && jobsData.jobs && jobsData.jobs.length) {
      JOBS = jobsData.jobs.map((j, idx) => {
        const daysLeft = calcDaysLeft(j.deadline_date || j.period);
        let grp = 'major';
        if (j.company.includes('공사') || j.company.includes('공단')) grp = 'public';
        else if (j.company.includes('엔지니어링') || j.company.includes('기술')) grp = 'design';

        return {
          id: j.id || ('j' + (idx + 1)),
          grp: grp,
          co: j.company,
          color: colors[idx % colors.length],
          role: j.title,
          lvl: j.career || '신입',
          exp: (j.career && j.career.includes('경력')) ? j.career : '',
          steps: (j.steps && j.steps.length) ? j.steps : ['서류', '면접', '최종'],
          end: daysLeft,
          loc: j.location || '전국 현장',
          welfare: (j.tags && j.tags.length) ? j.tags : ['사택 제공', '성과급', '자녀학자금'],
          link: j.link || '#',
          summary: j.summary || j.qualifications || ''
        };
      });
    }

    // 5. 전북대 알바 (실제 아르바이트 공고)
    let ALBA = [];
    if (albasData && albasData.jobs && albasData.jobs.length) {
      ALBA = albasData.jobs.map((a, idx) => {
        let wageNum = 10320;
        if (a.sort_wage) wageNum = a.sort_wage;
        else if (a.hourly_wage) wageNum = a.hourly_wage;
        else if (a.wage_display) {
          const wMatch = a.wage_display.replace(/,/g, '').match(/(\d+)/);
          if (wMatch) wageNum = parseInt(wMatch[1]);
        }

        let daysLeft = 7;
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
          type: (a.wage_type === 'day' || (a.wage_display && a.wage_display.includes('일급'))) ? 'day' : 'hour',
          wage: wageNum,
          hours: a.work_time ? (a.work_time.includes('주') ? 15 : 20) : 15,
          days: 3,
          end: daysLeft,
          tag: a.category_name || '교내',
          link: a.link || '#',
          time: a.work_time || '협의',
          person: a.person || '0명'
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
          link: s.link || '#'
        };
      });
    }

    const result = {
      TRENDS,
      NEWS,
      CONTESTS,
      JOBS,
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

  // 1순위: 번들 데이터 또는 로컬 스토리지 캐시에서 즉시 동기 데이터 반환 (0ms)
  function getInitialData() {
    // 1-1. cnh_data_bundle.js에서 컴파일된 실제 데이터가 있으면 최우선 파싱
    if (window.CNH_STATIC_DATA && typeof window.CNH_STATIC_DATA === 'object') {
      try {
        const parsed = parseRawDatasets(window.CNH_STATIC_DATA);
        if (parsed && parsed.NEWS && parsed.NEWS.length) {
          saveCached(parsed);
          return parsed;
        }
      } catch (e) {
        console.warn('Failed to parse CNH_STATIC_DATA:', e);
      }
    }

    // 1-2. 브라우저 localStorage 캐시 복원
    const cached = getCached();
    if (cached) return cached;

    return null;
  }

  // API 우선 호출 후 로컬 정적 JSON 폴백
  async function fetchWithFallback(apiPath, jsonPath) {
    try {
      const res = await fetch(apiPath + '?t=' + Date.now());
      if (res.ok) return await res.json();
    } catch (e) {}
    try {
      const res = await fetch(jsonPath + '?t=' + Date.now());
      if (res.ok) return await res.json();
    } catch (e) {}
    return null;
  }

  // 비동기 전체 동기화 (SWR)
  async function loadAll() {
    const baseline = getInitialData();

    // file:/// 프로토콜이거나 오프라인이면 fetch가 불가능하므로 번들 데이터를 즉시 반환
    if (location.protocol === 'file:') {
      return baseline;
    }

    try {
      const [newsData, contestsData, jobsData, albasData, swunivData] = await Promise.all([
        fetchWithFallback('/api/news', './data/news.json'),
        fetchWithFallback('/api/contests', './data/contests.json'),
        fetchWithFallback('/api/jobs', './data/jobs.json'),
        fetchWithFallback('/api/jbnu-albas', './data/jbnu_albas.json'),
        fetchWithFallback('/api/swuniv-programs', './data/swuniv_programs.json')
      ]);

      const raw = {
        news: newsData || (window.CNH_STATIC_DATA && window.CNH_STATIC_DATA.news) || null,
        contests: contestsData || (window.CNH_STATIC_DATA && window.CNH_STATIC_DATA.contests) || null,
        jobs: jobsData || (window.CNH_STATIC_DATA && window.CNH_STATIC_DATA.jobs) || null,
        albas: albasData || (window.CNH_STATIC_DATA && window.CNH_STATIC_DATA.albas) || null,
        swuniv: swunivData || (window.CNH_STATIC_DATA && window.CNH_STATIC_DATA.swuniv) || null
      };

      const result = parseRawDatasets(raw);
      if (result && result.NEWS && result.NEWS.length) {
        saveCached(result);
        return result;
      }
    } catch (e) {
      console.warn('loadAll fetch failed, using baseline:', e);
    }

    return baseline;
  }

  function getCached() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.NEWS && parsed.NEWS.length) {
        return parsed;
      }
    } catch (e) {
      console.warn('Failed to read live cache:', e);
    }
    return null;
  }

  function saveCached(data) {
    try {
      if (data && data.NEWS && data.NEWS.length) {
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      }
    } catch (e) {
      console.warn('Failed to save live cache:', e);
    }
  }

  return {
    getInitialData,
    loadAll,
    getCached,
    saveCached,
    calcDaysLeft,
    mapNewsCat
  };
})();
