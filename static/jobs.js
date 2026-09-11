// Civil News Hub - Civil Engineering Recruitment Dashboard (채용 공고문)

let allJobs = [];
let activeJobCategory = 'all';
let jobSearchQuery = '';
let currentJobSort = 'deadline'; // 기본: 마감임박순
let selectedCareer = 'all';      // 전체, 신입, 경력
let selectedRegion = 'ALL';      // 전체, 수도권, 충청, 영남, 호남, 전국, 해외
let jobBookmarks = new Set();
let isJobBookmarkView = false;
let isJobUrgentFilterActive = false;

// 가벼운 디바운스 및 Lucide 국소 렌더링 헬퍼
function debounce(func, wait = 180) {
  let timeout;
  return function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

function renderJobIcons() {
  if (typeof window.safeCreateIcons === 'function') {
    window.safeCreateIcons();
  } else if (typeof window.lucide !== 'undefined' && typeof window.lucide.createIcons === 'function') {
    try { window.lucide.createIcons(); } catch (e) {}
  }
}

// 1. 초기화
document.addEventListener('DOMContentLoaded', () => {
  loadJobBookmarks();
  setupJobEventListeners();
  loadJobsData();
});

// 북마크 로컬 스토리지 관리
function loadJobBookmarks() {
  try {
    const saved = localStorage.getItem('civil_job_bookmarks');
    if (saved) {
      jobBookmarks = new Set(JSON.parse(saved));
    }
  } catch (e) {
    jobBookmarks = new Set();
  }
  window.jobBookmarks = jobBookmarks;
  updateJobBookmarkCount();
}

function toggleJobBookmark(jobId, e) {
  if (e) e.stopPropagation();
  if (jobBookmarks.has(jobId)) {
    jobBookmarks.delete(jobId);
    showJobToast('북마크에서 제거되었습니다.');
  } else {
    jobBookmarks.add(jobId);
    showJobToast('🔖 채용 공고가 북마크에 저장되었습니다.');
  }
  localStorage.setItem('civil_job_bookmarks', JSON.stringify(Array.from(jobBookmarks)));
  window.jobBookmarks = jobBookmarks;
  updateJobBookmarkCount();
  renderJobs();
}

function updateJobBookmarkCount() {
  if (window.updateGlobalBookmarkCount) {
    window.updateGlobalBookmarkCount();
  }
}

// 2. 채용 공고 데이터 로드
async function loadJobsData() {
  showJobLoading(true);
  try {
    let res;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      res = await fetch('/api/jobs', { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error('API failed');
    } catch (e) {
      res = await fetch('./data/jobs.json?t=' + Date.now());
    }

    const data = await res.json();
    allJobs = data.jobs || [];
    window.allJobs = allJobs;

    // [동적 카테고리 동기화] 새로운 채용 카테고리가 등장할 경우 카테고리 탭 목록에 자동 추가하여 전체 건수 합산 일치 보장
    syncJobCategories(data.categories);

    // 메타데이터 업데이트
    const lastUpdatedEl = document.getElementById('jobLastUpdated');
    if (lastUpdatedEl) lastUpdatedEl.textContent = data.last_updated_display || '방금 전';

    const footerUpdatedEl = document.getElementById('footerLastUpdated');
    if (footerUpdatedEl && data.last_updated_display && (!footerUpdatedEl.textContent || footerUpdatedEl.textContent === '확인 중...')) {
      footerUpdatedEl.textContent = data.last_updated_display;
    }

    const totalCountEl = document.getElementById('jobTotalCount');
    if (totalCountEl) totalCountEl.textContent = `${allJobs.length}건`;

    // 전역 북마크 모드 동기화
    if (window.isGlobalBookmarkMode) {
      isJobBookmarkView = true;
    }

    renderJobCategoryTabs();
    renderJobs();
    if (window.updateGlobalBookmarkCount) window.updateGlobalBookmarkCount();
  } catch (err) {
    console.error('채용 공고 데이터 로드 실패:', err);
    const noticeEl = document.getElementById('jobResultCountNotice');
    if (noticeEl) noticeEl.textContent = '데이터를 불러오지 못했습니다. 새로고침을 시도해 보세요.';
  } finally {
    showJobLoading(false);
  }
}

// 3. D-Day 계산 헬퍼
function calculateDday(deadlineStr) {
  if (!deadlineStr || deadlineStr === '상시' || deadlineStr.includes('상시')) {
    return { text: '상시접수', days: 999, isUrgent: false, isClosed: false };
  }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const deadline = new Date(deadlineStr);
    deadline.setHours(0, 0, 0, 0);

    const diffTime = deadline.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { text: '접수마감', days: diffDays, isUrgent: false, isClosed: true };
    } else if (diffDays === 0) {
      return { text: '오늘마감', days: 0, isUrgent: true, isClosed: false };
    } else {
      return { text: `D-${diffDays}`, days: diffDays, isUrgent: diffDays <= 3, isClosed: false };
    }
  } catch (e) {
    return { text: '접수중', days: 50, isUrgent: false, isClosed: false };
  }
}

// 3-1. 긴급(D-3) 마감 임박 공고 추출
function getUrgentJobs() {
  return allJobs.filter(j => {
    const dday = calculateDday(j.deadline_date);
    return !dday.isClosed && dday.isUrgent;
  });
}

// 3-2. 긴급 마감 임박 공고 배너 (알림 제거됨)
function renderJobUrgentBanner() {
  const container = document.getElementById('jobUrgentBannerContainer');
  if (container) {
    container.innerHTML = '';
    container.classList.add('hidden');
  }
}

// 3-3. 퀵 필터 토글 함수 (레거시 안전 처리)
window.toggleJobUrgentFilter = function() {
  isJobUrgentFilterActive = false;
  renderJobs();
};

// 4. 카테고리 탭 렌더링
let JOB_CATEGORIES = [
  { id: 'all', name: '전체' },
  { id: 'public', name: '공기업·공공기관' },
  { id: 'builder', name: '대형 건설사' },
  { id: 'engineering', name: '설계·엔지니어링' },
  { id: 'safety_research', name: '전문기술·안전·연구' }
];

// 신규 채용 카테고리 동적 감지 및 등록 (전체 건수와 카테고리별 합산 불일치 방지)
function syncJobCategories(apiCategories = []) {
  const existingCatIds = new Set(JOB_CATEGORIES.map(c => c.id));

  if (Array.isArray(apiCategories)) {
    apiCategories.forEach(cat => {
      if (cat.id && !existingCatIds.has(cat.id)) {
        existingCatIds.add(cat.id);
        JOB_CATEGORIES.push({
          id: cat.id,
          name: cat.name || cat.id
        });
      }
    });
  }

  allJobs.forEach(job => {
    if (!job.category_id && !job.category_name) {
      job.category_id = 'public';
      job.category_name = '공기업·공공기관';
    } else if (!job.category_id && job.category_name) {
      job.category_id = job.category_name.trim().replace(/\s+/g, '_');
    } else if (job.category_id && !job.category_name) {
      const matched = JOB_CATEGORIES.find(c => c.id === job.category_id);
      job.category_name = matched ? matched.name : job.category_id;
    }

    if (job.category_id && job.category_id !== 'all' && !existingCatIds.has(job.category_id)) {
      existingCatIds.add(job.category_id);
      JOB_CATEGORIES.push({
        id: job.category_id,
        name: job.category_name || job.category_id
      });
    }
  });
}

function renderJobCategoryTabs() {
  const container = document.getElementById('jobCategoryTabs');
  if (!container) return;
  container.innerHTML = '';

  syncJobCategories();

  JOB_CATEGORIES.forEach(cat => {
    let count = 0;
    if (cat.id === 'all') {
      count = allJobs.length;
    } else {
      count = allJobs.filter(j => j.category_id === cat.id).length;
    }

    const isActive = !isJobBookmarkView && activeJobCategory === cat.id;

    const btn = document.createElement('button');
    btn.setAttribute('data-cat-id', cat.id);
    btn.className = `category-tab-btn flex items-center gap-1.5 px-3 sm:px-4 text-xs sm:text-sm font-semibold cursor-pointer whitespace-nowrap select-none border-b-2 -mb-px ${
      isActive
        ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-500'
        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 border-transparent'
    }`;

    btn.innerHTML = `
      <span>${cat.name}</span>
      <span class="count-badge text-[11px] px-2 py-0.5 rounded-full font-semibold transition-colors ${
        isActive
          ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 shadow-xs'
          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
      }">${count}</span>
    `;

    btn.addEventListener('click', () => {
      if (!window.isGlobalBookmarkMode && isJobBookmarkView) {
        isJobBookmarkView = false;
      }
      activeJobCategory = cat.id;
      updateJobCategoryTabStyles(cat.id);
      renderJobs();
    });

    container.appendChild(btn);
  });
}

function updateJobCategoryTabStyles(activeCatId) {
  const container = document.getElementById('jobCategoryTabs');
  if (!container) return;
  const buttons = container.querySelectorAll('button[data-cat-id]');
  if (buttons.length === 0) {
    renderJobCategoryTabs();
    return;
  }
  buttons.forEach(btn => {
    const catId = btn.getAttribute('data-cat-id');
    const isActive = !isJobBookmarkView && (catId === activeCatId);
    btn.className = `category-tab-btn flex items-center gap-1.5 px-3 sm:px-4 text-xs sm:text-sm font-semibold cursor-pointer whitespace-nowrap select-none border-b-2 -mb-px ${
      isActive
        ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-500'
        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 border-transparent'
    }`;
    const badge = btn.querySelector('.count-badge');
    if (badge) {
      badge.className = `count-badge text-[11px] px-2 py-0.5 rounded-full font-semibold transition-colors ${
        isActive
          ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 shadow-xs'
          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
      }`;
    }
  });
}


// 근무지역 매칭 판별 헬퍼
function matchJobRegion(job, regionKey) {
  if (!regionKey || regionKey === 'ALL') return true;
  const loc = (job.location || '').toLowerCase();
  const summary = (job.summary || '').toLowerCase();
  const title = (job.title || '').toLowerCase();
  const combined = `${loc} ${summary} ${title}`;

  if (regionKey === 'capital') { // 서울·수도권
    return combined.includes('서울') || combined.includes('경기') || combined.includes('인천') ||
           combined.includes('수도권') || combined.includes('안양') || combined.includes('일산') ||
           combined.includes('역삼') || combined.includes('상일') || combined.includes('종로') ||
           combined.includes('송도') || combined.includes('계동') || combined.includes('을지로') || combined.includes('본사');
  }
  if (regionKey === 'chungcheong') { // 충청·대전
    return combined.includes('대전') || combined.includes('충청') || combined.includes('세종') ||
           combined.includes('충남') || combined.includes('충북') || combined.includes('유역본부');
  }
  if (regionKey === 'yeongnam') { // 영남·대구·부산
    return combined.includes('영남') || combined.includes('진주') || combined.includes('부산') ||
           combined.includes('대구') || combined.includes('울산') || combined.includes('경남') ||
           combined.includes('경북');
  }
  if (regionKey === 'honam') { // 호남·광주
    return combined.includes('호남') || combined.includes('광주') || combined.includes('전남') ||
           combined.includes('전북');
  }
  if (regionKey === 'nationwide') { // 전국·현장
    return combined.includes('전국') || combined.includes('현장') || combined.includes('지역본부') || combined.includes('지사');
  }
  if (regionKey === 'overseas') { // 해외
    return combined.includes('해외') || combined.includes('글로벌');
  }
  return true;
}

// 4-1. 급여 분석 파서 (연간 환산 만원 단위 도출)
function parseSalaryAmount(salaryStr) {
  if (!salaryStr || typeof salaryStr !== 'string') return 0;
  const str = salaryStr.trim();
  if (!str) return 0;
  if (!/\d/.test(str)) return 0;

  // 월급 여부 확인 (연/연봉/초봉/연간 등의 연단위 키워드가 없고 월/월급 키워드가 있는 경우)
  let isMonthly = false;
  const hasYearly = /연봉|연\s*\d|초봉|초임\s*연|연간/i.test(str);
  if (!hasYearly && /(?:^|[^\w가-힣])(?:월|월급)\s*[\d,]/i.test(str)) {
    isMonthly = true;
  }

  // 억 단위 체크 (예: 1억원, 1억 2,000만원)
  const eokMatch = str.match(/(\d+)\s*억(?:\s*([\d,]+)\s*만?원?)?/);
  if (eokMatch && !str.includes('~') && !str.includes('-')) {
    const eok = parseInt(eokMatch[1], 10) * 10000;
    const man = eokMatch[2] ? parseFloat(eokMatch[2].replace(/,/g, '')) : 0;
    const total = eok + man;
    return Math.round(isMonthly ? total * 12 : total);
  }

  // 범위 표기 파싱 (예: 4,800만원 ~ 5,200만원, 4,800 ~ 5,200만원, 3500-4000만원)
  const rangeMatch = str.match(/([\d,]+(?:\.\d+)?)\s*(?:만원|만)?\s*[-~]\s*([\d,]+(?:\.\d+)?)\s*(?:만원|만)?/);
  if (rangeMatch) {
    const num1 = parseFloat(rangeMatch[1].replace(/,/g, ''));
    const num2 = parseFloat(rangeMatch[2].replace(/,/g, ''));
    if (!isNaN(num1) && !isNaN(num2)) {
      const avg = (num1 + num2) / 2;
      return Math.round(isMonthly ? avg * 12 : avg);
    }
  }

  // 단일 금액 (예: 5,000만원 이상, 4,100만원 수준)
  const singleMatch = str.match(/([\d,]+(?:\.\d+)?)\s*(?:만원|만)/);
  if (singleMatch) {
    const num = parseFloat(singleMatch[1].replace(/,/g, ''));
    if (!isNaN(num)) {
      return Math.round(isMonthly ? num * 12 : num);
    }
  }

  // 폴백: 연, 초봉, 월, 연봉, 초임 뒤의 숫자
  const fallbackMatch = str.match(/(?:연|초봉|월|연봉|초임)\s*(?:약\s*)?([\d,]+(?:\.\d+)?)/);
  if (fallbackMatch) {
    const num = parseFloat(fallbackMatch[1].replace(/,/g, ''));
    if (!isNaN(num)) {
      return Math.round(isMonthly ? num * 12 : num);
    }
  }

  return 0;
}

// 5. 정렬 및 필터링
function filterAndSortJobs() {
  let list = allJobs.slice();

  // (1) 북마크 모드
  if (isJobBookmarkView) {
    list = list.filter(j => jobBookmarks.has(j.id));
    if (activeJobCategory !== 'all') {
      list = list.filter(j => j.category_id === activeJobCategory);
    }
  } else if (activeJobCategory !== 'all') {
    list = list.filter(j => j.category_id === activeJobCategory);
  }

  // (2) 경력 구분 필터
  if (selectedCareer === 'entry') {
    list = list.filter(j => j.career && (j.career.includes('신입') || j.career.includes('인턴')));
  } else if (selectedCareer === 'experienced') {
    list = list.filter(j => j.career && (j.career.includes('경력') || j.career.includes('석·박사')));
  }

  // (2-1) 근무지역 필터
  if (selectedRegion !== 'ALL') {
    list = list.filter(j => matchJobRegion(j, selectedRegion));
  }

  // (2-2) 마감 임박 (D-3) 퀵 필터
  if (isJobUrgentFilterActive) {
    list = list.filter(j => {
      const ddayInfo = calculateDday(j.deadline_date);
      return !ddayInfo.isClosed && ddayInfo.isUrgent;
    });
  }

  // (3) 검색어 필터
  if (jobSearchQuery) {
    const q = jobSearchQuery.toLowerCase();
    list = list.filter(j => {
      const matchComp = (j.company || '').toLowerCase().includes(q);
      const matchTitle = (j.title || '').toLowerCase().includes(q);
      const matchSummary = (j.summary || '').toLowerCase().includes(q);
      const matchLoc = (j.location || '').toLowerCase().includes(q);
      const matchFields = (j.fields || []).some(f => f.toLowerCase().includes(q));
      const matchTags = (j.tags || []).some(t => t.toLowerCase().includes(q));
      return matchComp || matchTitle || matchSummary || matchLoc || matchFields || matchTags;
    });
  }

  // (4) 마감된 공고 제외 (GEMINI.md 원칙: 접수마감 항목 내림)
  list = list.filter(j => {
    const ddayInfo = calculateDday(j.deadline_date);
    return !ddayInfo.isClosed;
  });

  // (5) 정렬
  if (currentJobSort === 'deadline') {
    list.sort((a, b) => {
      const da = calculateDday(a.deadline_date).days;
      const db = calculateDday(b.deadline_date).days;
      return da - db;
    });
  } else if (currentJobSort === 'salary_high') {
    // 💰 연봉/급여 높은순: 미기재/내규(0)는 최하단 정렬
    list.sort((a, b) => {
      const sa = parseSalaryAmount(a.salary);
      const sb = parseSalaryAmount(b.salary);
      if (sa === 0 && sb === 0) return (a.company || '').localeCompare(b.company || '', 'ko');
      if (sa === 0) return 1;
      if (sb === 0) return -1;
      if (sb !== sa) return sb - sa;
      return (a.company || '').localeCompare(b.company || '', 'ko');
    });
  } else if (currentJobSort === 'salary_low') {
    // 💰 연봉/급여 낮은순: 미기재/내규(0)는 최하단 정렬
    list.sort((a, b) => {
      const sa = parseSalaryAmount(a.salary);
      const sb = parseSalaryAmount(b.salary);
      if (sa === 0 && sb === 0) return (a.company || '').localeCompare(b.company || '', 'ko');
      if (sa === 0) return 1;
      if (sb === 0) return -1;
      if (sa !== sb) return sa - sb;
      return (a.company || '').localeCompare(b.company || '', 'ko');
    });
  } else if (currentJobSort === 'company') {
    list.sort((a, b) => (a.company || '').localeCompare(b.company || '', 'ko'));
  } else if (currentJobSort === 'newest') {
    list.sort((a, b) => (b.id || '').localeCompare(a.id || ''));
  }

  return list;
}

// 직무 경력 및 근무지역 뱃지 헬퍼
function getJobCareerBadge(careerStr) {
  const c = (careerStr || '').toLowerCase();
  if (c.includes('인턴')) return { text: '신입·인턴', cls: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800' };
  if (c.includes('신입')) return { text: '신입', cls: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-800' };
  if (c.includes('경력')) return { text: '경력직', cls: 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border-purple-200 dark:border-purple-800' };
  return { text: '경력무관', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700' };
}

function getJobRegionBadge(locStr) {
  const loc = (locStr || '').toLowerCase();
  if (loc.includes('서울') || loc.includes('경기') || loc.includes('인천') || loc.includes('수도권')) return '수도권';
  if (loc.includes('대전') || loc.includes('충청') || loc.includes('세종')) return '충청·대전';
  if (loc.includes('부산') || loc.includes('대구') || loc.includes('울산') || loc.includes('경북') || loc.includes('경남') || loc.includes('영남')) return '영남권';
  if (loc.includes('광주') || loc.includes('전북') || loc.includes('전남') || loc.includes('호남')) return '호남권';
  if (loc.includes('해외')) return '해외';
  return '전국·현장';
}

// 6. 공고 카드 HTML 생성
function renderJobCard(job) {
  const isBookmarked = jobBookmarks.has(job.id);
  const ddayInfo = calculateDday(job.deadline_date);
  const careerBadge = getJobCareerBadge(job.career);
  const regionBadge = getJobRegionBadge(job.location);

  // D-Day 배지 스타일: 알림/점멸(animate-pulse, flame) 없는 차분한 디자인
  let ddayBadgeHtml = '';
  if (ddayInfo.isUrgent) {
    ddayBadgeHtml = `
      <span class="text-xs sm:text-sm px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full border border-rose-200 dark:border-rose-900/60 bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 font-semibold flex-shrink-0">
        ${ddayInfo.text}
      </span>
    `;
  } else if (ddayInfo.days === 999) {
    ddayBadgeHtml = `
      <span class="text-xs sm:text-sm px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full border border-emerald-200 dark:border-emerald-800 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 font-semibold flex-shrink-0">
        ${ddayInfo.text}
      </span>
    `;
  } else if (ddayInfo.days <= 7) {
    ddayBadgeHtml = `
      <span class="text-xs sm:text-sm px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full border border-amber-200 dark:border-amber-800 bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 font-semibold flex-shrink-0">
        ${ddayInfo.text}
      </span>
    `;
  } else {
    ddayBadgeHtml = `
      <span class="text-xs sm:text-sm px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full border border-blue-200 dark:border-blue-800 bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 font-semibold flex-shrink-0">
        ${ddayInfo.text}
      </span>
    `;
  }

  // 카테고리 뱃지 색상
  let catBadgeClass = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700';
  if (job.category_id === 'public') {
    catBadgeClass = 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-800';
  } else if (job.category_id === 'builder') {
    catBadgeClass = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
  } else if (job.category_id === 'engineering') {
    catBadgeClass = 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800';
  } else if (job.category_id === 'safety_research') {
    catBadgeClass = 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800';
  }

  // 모집 분야 칩 (최대 3개)
  const fieldsHtml = (job.fields || []).slice(0, 3).map(f => `
    <span class="inline-flex items-center text-xs px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700 font-medium">
      ${f}
    </span>
  `).join('');

  // 혜택/우대 태그 (최대 2개)
  const tagsHtml = (job.tags || []).slice(0, 2).map(t => `
    <span class="text-xs text-blue-600 dark:text-blue-400 font-medium">
      #${t}
    </span>
  `).join(' ');

  // 급여 정보 돋보이는 뱃지
  let salaryBadgeHtml = '';
  if (job.salary) {
    const salaryVal = parseSalaryAmount(job.salary);
    if (salaryVal > 0) {
      salaryBadgeHtml = `
        <div class="mb-3 flex items-center gap-2 text-xs sm:text-sm px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50/80 dark:from-emerald-950/60 dark:to-teal-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-semibold shadow-2xs" title="예상 급여/처우: ${job.salary}">
          <span class="flex-shrink-0 text-base">💰</span>
          <span class="truncate font-bold">${job.salary}</span>
        </div>
      `;
    } else {
      salaryBadgeHtml = `
        <div class="mb-3 flex items-center gap-2 text-xs sm:text-sm px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-medium" title="급여/처우: ${job.salary}">
          <span class="flex-shrink-0 text-sm">💰</span>
          <span class="truncate">${job.salary}</span>
        </div>
      `;
    }
  }

  return `
    <article 
      class="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl sm:rounded-3xl p-5 sm:p-7 shadow-xs hover:shadow-md hover:border-blue-300 dark:hover:border-slate-700 transition flex flex-col justify-between group cursor-pointer"
      onclick="openJobModal('${job.id}')"
    >
      <div>
        <!-- 상단: 카테고리 + 기업명 + D-Day 뱃지 -->
        <div class="flex items-center justify-between gap-2 mb-2">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-xs sm:text-sm px-2.5 sm:px-3 py-1 rounded-lg font-semibold border ${catBadgeClass} flex-shrink-0">
              ${job.category_name || '토목'}
            </span>
            <span class="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-200 truncate">
              ${job.company}
            </span>
          </div>
          ${ddayBadgeHtml}
        </div>

        <!-- 2행: 세부 자격 및 지역 뱃지 (신입/경력 + 지역 + 학력) -->
        <div class="flex items-center gap-1.5 flex-wrap mb-3 text-xs">
          <span class="px-2 py-0.5 rounded-md font-semibold text-[11px] border ${careerBadge.cls}">
            ${careerBadge.text}
          </span>
          <span class="px-2 py-0.5 rounded-md font-medium text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            📍 ${regionBadge}
          </span>
          ${job.education ? `
            <span class="px-2 py-0.5 rounded-md text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60">
              🎓 ${escapeHtml(job.education)}
            </span>
          ` : ''}
        </div>

        <!-- 공고 제목 -->
        <h3 class="text-base sm:text-xl font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition leading-snug line-clamp-2 mb-3">
          ${job.title}
        </h3>

        <!-- 급여 정보 돋보이는 뱃지 -->
        ${salaryBadgeHtml}

        <!-- 주요 정보 (근무지, 경력, 모집분야) -->
        <div class="space-y-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-4">
          <div class="flex items-center gap-2">
            <i data-lucide="map-pin" class="w-4 h-4 text-slate-400 flex-shrink-0"></i>
            <span class="truncate">${job.location || '전국'}</span>
            <span class="text-slate-300 dark:text-slate-700">·</span>
            <i data-lucide="briefcase" class="w-4 h-4 text-slate-400 flex-shrink-0"></i>
            <span class="truncate">${job.career || '신입'}</span>
          </div>
          <div class="flex flex-wrap gap-1.5 pt-1">
            ${fieldsHtml}
          </div>
        </div>

        <!-- 혜택/우대 태그 -->
        ${tagsHtml ? `
          <div class="flex flex-wrap gap-2 mb-4">
            ${tagsHtml}
          </div>
        ` : ''}
      </div>

      <!-- 카드 하단: 접수 기간 및 버튼들 -->
      <div class="pt-4 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs sm:text-sm text-slate-400 mt-2">
        <span class="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">
          📅 ${job.period}
        </span>
        <div class="flex items-center gap-1.5 sm:gap-2" onclick="event.stopPropagation()">
          <!-- 공유 버튼 -->
          <button 
            onclick="shareJob('${job.id}', event)"
            class="p-2 sm:p-2.5 rounded-xl text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            title="채용 공고 공유하기"
          >
            <i data-lucide="share-2" class="w-4 h-4 sm:w-4.5 sm:h-4.5"></i>
          </button>
          <!-- 북마크 버튼 -->
          <button 
            onclick="toggleJobBookmark('${job.id}', event)"
            class="p-2 sm:p-2.5 rounded-xl text-slate-400 hover:text-amber-500 dark:hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            title="${isBookmarked ? '북마크 해제' : '북마크 저장'}"
          >
            <i data-lucide="bookmark" class="w-4 h-4 sm:w-4.5 sm:h-4.5 ${isBookmarked ? 'fill-amber-500 text-amber-500' : ''}"></i>
          </button>
          <!-- 공식 원문 공고 링크 -->
          <a 
            href="${job.link}" 
            target="_blank" 
            rel="noopener noreferrer" 
            class="inline-flex items-center gap-1 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 border border-blue-200 dark:border-slate-700 transition shadow-2xs"
            title="공식 채용사이트로 이동"
          >
            <span>지원</span>
            <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
          </a>
        </div>
      </div>
      ${typeof window.renderBookmarkNoteRow === 'function' ? window.renderBookmarkNoteRow(job.id, job.title) : ''}
    </article>
  `;
}
window.renderJobCard = renderJobCard;

// 7. 메인 렌더링
function renderJobs() {
  const container = document.getElementById('jobListContainer');
  const notice = document.getElementById('jobResultCountNotice');
  const emptyState = document.getElementById('jobEmptyState');
  if (!container) return;

  const filtered = filterAndSortJobs();

  // 상단 긴급 배너 렌더링 동기화
  renderJobUrgentBanner();

  if (notice) {
    if (isJobBookmarkView) {
      notice.textContent = `⭐ 마이페이지 채용 공고 총 ${filtered.length}건`;
    } else if (jobSearchQuery) {
      notice.textContent = `'${jobSearchQuery}' 검색 결과 총 ${filtered.length}건`;
    } else {
      notice.textContent = `진행 중인 토목 채용 공고 총 ${filtered.length}건`;
    }
  }

  if (filtered.length === 0) {
    container.innerHTML = '';
    if (emptyState) {
      emptyState.classList.remove('hidden');
      emptyState.classList.add('flex');
      const emptyTitle = emptyState.querySelector('h3');
      const emptyDesc = emptyState.querySelector('p');
      if (isJobBookmarkView) {
        if (emptyTitle) emptyTitle.textContent = '마이페이지에 저장된 채용 공고가 없습니다';
        if (emptyDesc) emptyDesc.innerHTML = '마음에 드는 공고의 북마크 아이콘을 눌러 마이페이지에 저장해보세요.<br><button onclick="window.toggleCurrentTabBookmark(false)" class="mt-2 text-blue-600 dark:text-blue-400 font-semibold underline cursor-pointer">전체 채용 공고 보기</button>';
      } else {
        if (emptyTitle) emptyTitle.textContent = '검색된 채용 공고가 없습니다';
        if (emptyDesc) emptyDesc.textContent = '다른 검색어를 입력하시거나 카테고리 필터를 변경해 보세요.';
      }
    }
    return;
  }

  if (emptyState) {
    emptyState.classList.add('hidden');
    emptyState.classList.remove('flex');
  }

  container.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
      ${filtered.map(renderJobCard).join('')}
    </div>
  `;

  renderJobIcons();
}

// 8. 상세 팝업 모달
function openJobModal(jobId) {
  const job = allJobs.find(j => j.id === jobId);
  if (!job) return;

  const modal = document.getElementById('jobDetailModal');
  const modalContent = document.getElementById('jobModalContent');
  if (!modal || !modalContent) return;

  const ddayInfo = calculateDday(job.deadline_date);

  modalContent.innerHTML = `
    <!-- 모달 헤더 -->
    <div class="flex items-start justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
      <div>
        <div class="flex items-center gap-2 mb-1.5">
          <span class="text-xs px-2.5 py-0.5 rounded-md font-semibold bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            ${job.category_name}
          </span>
          <span class="text-xs font-bold text-slate-800 dark:text-slate-200">
            ${job.company}
          </span>
          ${ddayInfo.isUrgent 
            ? `<span class="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 border">
                 ${ddayInfo.text}
               </span>`
            : `<span class="text-xs px-2.5 py-0.5 rounded-full font-bold ${ddayInfo.days <= 7 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-blue-50 text-blue-700 border-blue-200'} border">
                 ${ddayInfo.text}
               </span>`}
        </div>
        <h2 class="text-lg sm:text-xl font-bold text-slate-900 dark:text-white leading-snug">
          ${job.title}
        </h2>
      </div>
      <button onclick="closeJobModal()" class="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer">
        <i data-lucide="x" class="w-5 h-5"></i>
      </button>
    </div>

    <!-- 모달 본문 상세 -->
    <div class="py-5 space-y-4 text-sm text-slate-700 dark:text-slate-300 max-h-[65vh] overflow-y-auto pr-1">
      <!-- 기본 요약 박스 -->
      <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-2 text-xs sm:text-sm">
        <div class="flex items-center justify-between">
          <span class="text-slate-500 dark:text-slate-400">📅 접수 기간:</span>
          <span class="font-bold text-slate-800 dark:text-slate-200">${job.period}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-slate-500 dark:text-slate-400">📍 근무 지역:</span>
          <span class="font-medium text-slate-800 dark:text-slate-200">${job.location || '전국'}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-slate-500 dark:text-slate-400">🎓 지원 자격:</span>
          <span class="font-medium text-slate-800 dark:text-slate-200">${job.education || '대졸 이상'} (${job.career || '신입'})</span>
        </div>
        ${job.salary ? `
          <div class="flex items-center justify-between">
            <span class="text-slate-500 dark:text-slate-400">💰 처우/보수:</span>
            <span class="font-semibold text-emerald-600 dark:text-emerald-400">${job.salary}</span>
          </div>
        ` : ''}
      </div>

      <!-- 상세 설명 -->
      <div>
        <h4 class="font-bold text-slate-900 dark:text-white mb-1.5 flex items-center gap-1.5">
          <i data-lucide="info" class="w-4 h-4 text-blue-500"></i>
          <span>직무 및 공고 개요</span>
        </h4>
        <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50/50 dark:bg-slate-800/30 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
          ${job.summary}
        </p>
      </div>

      <!-- 모집 부문 -->
      <div>
        <h4 class="font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
          <i data-lucide="layers" class="w-4 h-4 text-blue-500"></i>
          <span>모집 분야 / 직무</span>
        </h4>
        <div class="flex flex-wrap gap-1.5">
          ${(job.fields || []).map(f => `
            <span class="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 font-medium text-xs border border-blue-200 dark:border-blue-800">
              ${f}
            </span>
          `).join('')}
        </div>
      </div>

      <!-- 지원 자격 및 우대 사항 -->
      <div>
        <h4 class="font-bold text-slate-900 dark:text-white mb-1.5 flex items-center gap-1.5">
          <i data-lucide="check-circle-2" class="w-4 h-4 text-emerald-500"></i>
          <span>지원 자격 및 우대 사항</span>
        </h4>
        <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50/50 dark:bg-slate-800/30 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
          ${job.qualifications || '토목공학 및 관련 학과 전공자, 토목기사 및 관련 기사 자격증 소지자 우대'}
        </p>
      </div>

      <!-- 전형 절차 -->
      ${job.steps && job.steps.length ? `
        <div>
          <h4 class="font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
            <i data-lucide="git-branch" class="w-4 h-4 text-indigo-500"></i>
            <span>전형 절차</span>
          </h4>
          <div class="flex flex-wrap items-center gap-1.5 text-xs">
            ${job.steps.map((step, sIdx) => `
              <span class="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold border border-slate-200 dark:border-slate-700">
                ${sIdx + 1}. ${step}
              </span>
              ${sIdx < job.steps.length - 1 ? '<i data-lucide="chevron-right" class="w-3.5 h-3.5 text-slate-400"></i>' : ''}
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>

    <!-- 모달 푸터 액션 -->
    <div class="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5">
      <!-- 좌측: 북마크 & 캘린더 등록 -->
      <div class="flex items-center gap-2">
        <button 
          onclick="toggleJobBookmark('${job.id}'); openJobModal('${job.id}');"
          class="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shadow-xs"
        >
          <i data-lucide="bookmark" class="w-4 h-4 ${jobBookmarks.has(job.id) ? 'fill-amber-500 text-amber-500' : 'text-slate-400'}"></i>
          <span>${jobBookmarks.has(job.id) ? '북마크됨' : '북마크'}</span>
        </button>

        <!-- 캘린더 등록 드롭다운 버튼 -->
        <div class="relative inline-block text-left" id="jobCalendarDropdown">
          <button 
            type="button"
            onclick="toggleJobCalendarMenu(event)"
            class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium border border-blue-200 dark:border-blue-800/80 bg-blue-50/70 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition cursor-pointer shadow-xs"
            title="마감 일정을 캘린더에 저장"
          >
            <i data-lucide="calendar-plus" class="w-4 h-4 text-blue-600 dark:text-blue-400"></i>
            <span>캘린더 등록</span>
            <i data-lucide="chevron-down" class="w-3.5 h-3.5 opacity-70"></i>
          </button>

          <!-- 캘린더 팝오버 메뉴 -->
          <div id="jobCalendarMenu" class="hidden absolute left-0 bottom-full mb-2 w-48 rounded-xl bg-white dark:bg-slate-800 shadow-xl border border-slate-200 dark:border-slate-700 py-1.5 z-30 transition-all">
            <button 
              type="button"
              onclick="addJobToGoogleCalendar('${job.id}'); event.stopPropagation();"
              class="w-full text-left px-3.5 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-700 flex items-center gap-2 transition"
            >
              <i data-lucide="calendar" class="w-4 h-4 text-blue-500"></i>
              <span>Google 캘린더 추가 ↗</span>
            </button>
            <button 
              type="button"
              onclick="downloadJobIcs('${job.id}'); event.stopPropagation();"
              class="w-full text-left px-3.5 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-700 flex items-center gap-2 transition"
            >
              <i data-lucide="download" class="w-4 h-4 text-emerald-500"></i>
              <span>iCal / 갤럭시 (.ics) 저장</span>
            </button>
          </div>
        </div>

        <!-- 공유 버튼 -->
        <button 
          type="button"
          onclick="shareJob('${job.id}', event)"
          class="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer shadow-xs"
          title="공고 링크 및 요약 정보 공유"
        >
          <i data-lucide="share-2" class="w-4 h-4 text-blue-500"></i>
          <span>공유</span>
        </button>
      </div>

      <!-- 우측: 닫기 & 공식 지원처 바로가기 -->
      <div class="flex items-center gap-2 w-full sm:w-auto justify-end">
        <button onclick="closeJobModal()" class="px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer">
          닫기
        </button>
        <a 
          href="${job.link}" 
          target="_blank" 
          rel="noopener noreferrer" 
          class="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-500/20 transition active:scale-95"
        >
          <span>공식 채용사이트 지원</span>
          <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
        </a>
      </div>
    </div>
  `;

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  document.body.style.overflow = 'hidden';
  renderJobIcons();
}

function closeJobModal() {
  const modal = document.getElementById('jobDetailModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.body.style.overflow = '';
  }
}

// 8-1. 캘린더 연동 헬퍼 함수
function toggleJobCalendarMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('jobCalendarMenu');
  if (!menu) return;
  menu.classList.toggle('hidden');
}

// 외부 클릭 시 메뉴 닫기
document.addEventListener('click', () => {
  const menu = document.getElementById('jobCalendarMenu');
  if (menu && !menu.classList.contains('hidden')) {
    menu.classList.add('hidden');
  }
});

function getJobDateStrings(job) {
  let dateStr = job.deadline_date;
  if (!dateStr || dateStr === '상시' || !dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const match = (job.period || '').match(/~\s*(?:(\d{4})[.\-/])?(\d{1,2})[.\-/](\d{1,2})/);
    if (match) {
      const year = match[1] ? match[1] : new Date().getFullYear();
      const m = match[2].padStart(2, '0');
      const d = match[3].padStart(2, '0');
      dateStr = `${year}-${m}-${d}`;
    } else {
      const today = new Date();
      dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    }
  }

  const clean = dateStr.replace(/-/g, '');
  const d = new Date(dateStr);
  d.setDate(d.getDate() + 1);
  const nextClean = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  
  return { start: clean, end: nextClean };
}

function addJobToGoogleCalendar(jobId) {
  const job = allJobs.find(j => j.id === jobId);
  if (!job) return;

  const dates = getJobDateStrings(job);
  const title = `[채용마감] ${job.company} - ${job.title}`;
  const details = `[Civil News Hub 채용 마감 알림]\n\n기업/기관: ${job.company}\n직무분야: ${(job.fields || []).join(', ')}\n접수기간: ${job.period}\n급여/처우: ${job.salary || '회사 내규'}\n\n🔗 공식 지원 링크: ${job.link}`;
  
  const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE` +
    `&text=${encodeURIComponent(title)}` +
    `&dates=${dates.start}/${dates.end}` +
    `&details=${encodeURIComponent(details)}` +
    `&location=${encodeURIComponent(job.location || '온라인 접수')}`;

  window.open(gcalUrl, '_blank', 'noopener,noreferrer');
  showJobToast('Google 캘린더 등록 창이 열렸습니다.');
}

function downloadJobIcs(jobId) {
  const job = allJobs.find(j => j.id === jobId);
  if (!job) return;

  const dates = getJobDateStrings(job);
  const title = `[채용마감] ${job.company} - ${job.title}`;
  const details = `[Civil News Hub 채용 마감 알림]\\n기업: ${job.company}\\n직무: ${(job.fields || []).join(', ')}\\n접수기간: ${job.period}\\n\\n공식 링크: ${job.link}`;
  const dtstamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const icsData = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Civil News Hub//Recruit Calendar//KO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:job-${job.id}@civilnewshub.com`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;VALUE=DATE:${dates.start}`,
    `DTEND;VALUE=DATE:${dates.end}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${details}`,
    `LOCATION:${job.location || '온라인 접수'}`,
    'STATUS:CONFIRMED',
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  const blob = new Blob([icsData], { type: 'text/calendar;charset=utf-8;' });
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.setAttribute('download', `${job.company}_채용마감일정.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);

  showJobToast('📅 캘린더 파일(.ics)이 다운로드되었습니다.');
}

// 8-2. 채용 공고 SNS 및 링크 공유 (Web Share API + Clipboard Fallback)
async function shareJob(jobId, e) {
  if (e) e.stopPropagation();
  const job = allJobs.find(j => j.id === jobId);
  if (!job) return;

  const shareTitle = `[토목 채용] ${job.company} - ${job.title}`;
  const shareText = `[토목 채용] ${job.company} - ${job.title}\n📅 접수기간: ${job.period}\n📍 근무지역: ${job.location || '전국'}\n🔗 공식링크: ${job.link}\n출처: Civil News Hub`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: shareTitle,
        text: shareText,
        url: job.link
      });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return; // 취소한 경우
    }
  }

  // Web Share API 미지원 또는 데스크톱 Fallback: 클립보드 복사
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(shareText).then(() => {
      showJobToast('📋 채용 공고 공유 문구가 복사되었습니다.');
    }).catch(() => {
      copyJobPromptFallback(shareText);
    });
  } else {
    copyJobPromptFallback(shareText);
  }
}

function copyJobPromptFallback(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    showJobToast('📋 채용 공고 공유 문구가 복사되었습니다.');
  } catch (err) {
    prompt('채용 공고 내용 복사:', text);
  }
  document.body.removeChild(textarea);
}

// 9. 토스트 메시지
function showJobToast(msg) {
  if (window.showToast) {
    window.showToast(msg);
  } else {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMessage');
    if (!toast || !toastMsg) return;
    toastMsg.textContent = msg;
    toast.classList.remove('translate-y-20', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');
    setTimeout(() => {
      toast.classList.remove('translate-y-0', 'opacity-100');
      toast.classList.add('translate-y-20', 'opacity-0');
    }, 2500);
  }
}

// 10. 로딩 상태
function showJobLoading(show) {
  const loading = document.getElementById('jobLoadingIndicator');
  const container = document.getElementById('jobListContainer');
  if (loading) {
    if (show) {
      loading.style.display = 'flex';
      loading.classList.remove('hidden');
      loading.classList.add('flex');
    } else {
      loading.style.display = 'none';
      loading.classList.add('hidden');
      loading.classList.remove('flex');
    }
  }
  if (container) {
    if (show) {
      container.style.display = 'none';
      container.classList.add('hidden');
    } else {
      container.style.display = 'block';
      container.classList.remove('hidden');
    }
  }
}

// 11. 이벤트 리스너 등록
function setupJobEventListeners() {
  // 검색어 입력 (180ms 디바운스 적용으로 타이핑 렉 원천 차단)
  const searchInput = document.getElementById('jobSearchInput');
  const clearBtn = document.getElementById('clearJobSearchBtn');
  if (searchInput && clearBtn) {
    const handleJobSearch = debounce((query) => {
      jobSearchQuery = query;
      renderJobs();
    }, 180);

    searchInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      if (val) {
        clearBtn.classList.remove('hidden');
      } else {
        clearBtn.classList.add('hidden');
      }
      handleJobSearch(val);
    });

    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      jobSearchQuery = '';
      clearBtn.classList.add('hidden');
      searchInput.focus();
      renderJobs();
    });
  }

  // 정렬 선택
  const sortSelect = document.getElementById('jobSortSelect');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      currentJobSort = e.target.value;
      renderJobs();
    });
  }

  // 경력 구분 필터 (전체, 신입, 경력)
  const careerBtns = document.querySelectorAll('.career-filter-btn');
  careerBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      careerBtns.forEach(b => {
        b.classList.remove('bg-blue-600', 'text-white');
        b.classList.add('bg-white', 'dark:bg-slate-900', 'text-slate-600', 'dark:text-slate-300');
      });
      btn.classList.add('bg-blue-600', 'text-white');
      btn.classList.remove('bg-white', 'dark:bg-slate-900', 'text-slate-600', 'dark:text-slate-300');
      selectedCareer = btn.dataset.career || 'all';
      renderJobs();
    });
  });

  // 근무지역 필터 칩 바 (전체, 수도권, 충청, 영남, 호남, 전국, 해외)
  const regionGroup = document.getElementById('regionFilterGroup');
  if (regionGroup) {
    regionGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.region-pill');
      if (!btn) return;

      regionGroup.querySelectorAll('.region-pill').forEach(b => {
        b.classList.remove('active', 'bg-blue-600', 'text-white', 'font-semibold');
        b.classList.add('bg-white', 'dark:bg-slate-900', 'text-slate-600', 'dark:text-slate-300', 'border', 'border-slate-200', 'dark:border-slate-800');
      });

      btn.classList.add('active', 'bg-blue-600', 'text-white', 'font-semibold');
      btn.classList.remove('bg-white', 'dark:bg-slate-900', 'text-slate-600', 'dark:text-slate-300', 'border', 'border-slate-200', 'dark:border-slate-800');

      selectedRegion = btn.getAttribute('data-region') || 'ALL';
      renderJobs();
    });
  }

  // 모달 바깥 클릭 시 닫기
  const modal = document.getElementById('jobDetailModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeJobModal();
    });
  }

  // ESC 키로 모달 닫기
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeJobModal();
      if (typeof closeContestModal === 'function') closeContestModal();
    }
  });
}

// 외부 노출 북마크 토글 함수
window.toggleJobBookmarkFilter = function(forceState) {
  if (typeof forceState === 'boolean') {
    isJobBookmarkView = forceState;
  } else {
    isJobBookmarkView = !isJobBookmarkView;
  }
  renderJobCategoryTabs();
  renderJobs();
  return isJobBookmarkView;
};
