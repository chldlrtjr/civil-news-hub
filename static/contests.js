// Civil News Hub - Civil Engineering Contests & Competitions Dashboard (토목 공모전 허브)

let allContests = [];
let contestActiveCategory = 'ALL';
let contestActiveStatus = 'ALL';
let contestSearchQuery = '';
let contestSortOption = 'closingSoon'; // closingSoon | latest
let contestBookmarks = new Set();
let isContestBookmarkView = false;
let isContestUrgentFilterActive = false;
let currentModalContest = null;

// 1. 초기화
document.addEventListener('DOMContentLoaded', () => {
  loadContestBookmarks();
  setupContestEventListeners();
  loadContestsData();
});

// 북마크 로컬 스토리지
function loadContestBookmarks() {
  try {
    const saved = localStorage.getItem('civil_contest_bookmarks');
    if (saved) {
      contestBookmarks = new Set(JSON.parse(saved));
    }
  } catch (e) {
    contestBookmarks = new Set();
  }
  updateContestBookmarkCount();
}

function toggleContestBookmark(contestId, e) {
  if (e) e.stopPropagation();
  if (contestBookmarks.has(contestId)) {
    contestBookmarks.delete(contestId);
    showContestToast('북마크에서 제거되었습니다.');
  } else {
    contestBookmarks.add(contestId);
    showContestToast('🏆 공모전이 북마크에 저장되었습니다.');
  }
  localStorage.setItem('civil_contest_bookmarks', JSON.stringify(Array.from(contestBookmarks)));
  updateContestBookmarkCount();
  updateModalBookmarkState();
  renderContests();
}

function updateContestBookmarkCount() {
  if (window.updateGlobalBookmarkCount) {
    window.updateGlobalBookmarkCount();
  }
}

// 2. 공모전 데이터 로드
async function loadContestsData() {
  showContestLoading(true);
  try {
    let res;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      res = await fetch('/api/contests', { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error('API route failed');
    } catch (e) {
      res = await fetch('./data/contests.json?t=' + Date.now());
    }

    const data = await res.json();
    let rawList = data.contests || [];

    // [GEMINI.md 절대 원칙] 접수마감 항목은 프론트엔드에서도 원천 배제
    allContests = rawList.filter(c => {
      if (c.status === '접수마감') return false;
      const ddayInfo = parseDdayFromPeriod(c.period, c.status);
      return !ddayInfo.isClosed;
    });

    // 메타데이터 표시
    const updatedEl = document.getElementById('contestLastUpdatedTime');
    if (updatedEl) updatedEl.textContent = `업데이트: ${data.last_updated_display || '실시간'}`;

    const activeCountBadge = document.getElementById('contestActiveCountBadge');
    if (activeCountBadge) activeCountBadge.textContent = allContests.length;

    // 전역 북마크 모드 동기화
    if (window.isGlobalBookmarkMode) {
      isContestBookmarkView = true;
    }

    updateContestCategoryCounts();
    renderContests();
  } catch (err) {
    console.error('공모전 데이터 로드 실패:', err);
    showContestToast('공모전 데이터를 불러오지 못했습니다.');
  } finally {
    showContestLoading(false);
  }
}

// 3. 접수기간 문자열에서 마감일 추출 및 D-Day 연산
function parseDdayFromPeriod(periodStr, statusStr) {
  if (!periodStr || statusStr === '상시접수' || periodStr.includes('상시')) {
    return { text: '상시접수', days: 9999, isUrgent: false, isClosed: false };
  }
  if (statusStr === '접수예정' || periodStr.includes('접수예정')) {
    return { text: '접수예정', days: 500, isUrgent: false, isClosed: false };
  }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // YYYY.MM.DD ~ MM.DD 또는 YYYY.MM.DD ~ YYYY.MM.DD 파싱
    let endDate = null;
    const match = periodStr.match(/~\s*(?:(\d{4})[.\-/])?(\d{1,2})[.\-/](\d{1,2})/);
    if (match) {
      const year = match[1] ? parseInt(match[1], 10) : today.getFullYear();
      const month = parseInt(match[2], 10) - 1;
      const day = parseInt(match[3], 10);
      endDate = new Date(year, month, day);
      endDate.setHours(0, 0, 0, 0);
    }

    if (!endDate || isNaN(endDate.getTime())) {
      return { text: statusStr || '접수중', days: 100, isUrgent: false, isClosed: false };
    }

    const diffTime = endDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { text: '접수마감', days: diffDays, isUrgent: false, isClosed: true };
    } else if (diffDays === 0) {
      return { text: '오늘마감', days: 0, isUrgent: true, isClosed: false };
    } else {
      return { text: `D-${diffDays}`, days: diffDays, isUrgent: diffDays <= 3, isClosed: false };
    }
  } catch (e) {
    return { text: statusStr || '접수중', days: 100, isUrgent: false, isClosed: false };
  }
}

// 3-1. 긴급(D-3) 마감 임박 공모전 추출
function getUrgentContests() {
  return allContests.filter(c => {
    if (c.status === '접수마감') return false;
    const dday = parseDdayFromPeriod(c.period, c.status);
    return !dday.isClosed && dday.isUrgent;
  });
}

// 3-2. 긴급 마감 임박 공모전 배너 동적 렌더링
function renderContestUrgentBanner() {
  const container = document.getElementById('contestUrgentBannerContainer');
  const toggleBtn = document.getElementById('contestUrgentToggleBtn');
  const countBadge = document.getElementById('contestUrgentCountBadge');
  if (!container) return;

  const urgentContests = getUrgentContests();
  const count = urgentContests.length;

  // 필터 바 퀵 토글 버튼 상태 동기화
  if (countBadge) {
    countBadge.textContent = count;
    if (count > 0) {
      countBadge.classList.remove('hidden');
    } else {
      countBadge.classList.add('hidden');
    }
  }

  if (toggleBtn) {
    if (isContestUrgentFilterActive) {
      toggleBtn.className = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-bold border border-rose-600 bg-rose-600 text-white shadow-sm shadow-rose-500/30 ring-2 ring-rose-500/30 transition cursor-pointer';
      toggleBtn.innerHTML = `
        <i data-lucide="flame" class="w-3.5 h-3.5 text-amber-200 animate-bounce"></i>
        <span>🚨 마감임박(D-3) 필터 해제</span>
        <span id="contestUrgentCountBadge" class="px-1.5 py-0.2 rounded-full text-[10px] bg-white text-rose-600 font-extrabold">${count}</span>
      `;
    } else {
      toggleBtn.className = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold border border-rose-200 dark:border-rose-900/60 bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer shadow-xs';
      toggleBtn.innerHTML = `
        <i data-lucide="flame" class="w-3.5 h-3.5 text-rose-500"></i>
        <span>🚨 마감임박(D-3)만 보기</span>
        <span id="contestUrgentCountBadge" class="${count > 0 ? '' : 'hidden'} px-1.5 py-0.2 rounded-full text-[10px] bg-rose-600 text-white font-bold">${count}</span>
      `;
    }
  }

  // D-3 이내 항목이 1개 이상 존재할 때만 배너 표시
  if (count === 0) {
    container.innerHTML = '';
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');
  container.innerHTML = `
    <div 
      onclick="toggleContestUrgentFilter()" 
      class="relative overflow-hidden rounded-2xl bg-gradient-to-r from-rose-500/15 via-red-500/10 to-amber-500/10 dark:from-rose-950/50 dark:via-red-950/40 dark:to-amber-950/30 border border-rose-300 dark:border-rose-800/80 p-3.5 sm:p-4 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group"
      role="button"
      tabindex="0"
      aria-label="마감 임박 긴급 공모전 퀵 필터"
    >
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-600 to-amber-500 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-rose-500/30 animate-pulse">
            <i data-lucide="flame" class="w-5 h-5 text-amber-200"></i>
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="inline-flex items-center gap-1 text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wide">
                🚨 마감 임박 긴급 공모전
              </span>
              <span class="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-rose-600 text-white shadow-xs animate-pulse">
                D-3 이내 (${count}건)
              </span>
            </div>
            <p class="text-xs sm:text-sm text-slate-700 dark:text-slate-200 font-medium truncate mt-0.5">
              ${isContestUrgentFilterActive 
                ? '🔥 마감 임박 긴급 공모전만 필터링 중입니다. 클릭하면 전체 공모전을 다시 확인할 수 있습니다.' 
                : `접수 마감이 3일 이내로 임박한 공모전이 총 ${count}건 있습니다! 세부 요강을 확인하고 접수해 보세요.`}
            </p>
          </div>
        </div>
        <div class="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold flex-shrink-0 transition-all ${
          isContestUrgentFilterActive 
            ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 shadow-sm' 
            : 'bg-rose-600 text-white shadow-sm shadow-rose-500/25 group-hover:bg-rose-700 group-hover:scale-105'
        }">
          <span>${isContestUrgentFilterActive ? '전체 공모전 보기' : '마감임박 모아보기'}</span>
          <i data-lucide="${isContestUrgentFilterActive ? 'x' : 'chevron-right'}" class="w-4 h-4"></i>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) lucide.createIcons();
}

// 3-3. 퀵 필터 토글 함수
window.toggleContestUrgentFilter = function() {
  isContestUrgentFilterActive = !isContestUrgentFilterActive;
  renderContestUrgentBanner();
  renderContests();
  if (isContestUrgentFilterActive) {
    const urgentCount = getUrgentContests().length;
    showContestToast(`🚨 마감 임박(D-3 이내) 공모전 ${urgentCount}건만 필터링되었습니다.`);
  } else {
    showContestToast('모든 공모전을 표시합니다.');
  }
};

// 4. 필터링 및 정렬
function getFilteredContests() {
  let list = [...allContests];

  // 북마크 뷰 필터
  if (isContestBookmarkView) {
    list = list.filter(c => contestBookmarks.has(c.id));
  }

  // 분야(카테고리) 필터
  if (contestActiveCategory !== 'ALL') {
    list = list.filter(c => c.category === contestActiveCategory);
  }

  // 상태 필터 (접수중 / 접수예정 / 상시접수)
  if (contestActiveStatus !== 'ALL') {
    list = list.filter(c => c.status === contestActiveStatus);
  }

  // 마감 임박 (D-3) 퀵 필터
  if (isContestUrgentFilterActive) {
    list = list.filter(c => {
      if (c.status === '접수마감') return false;
      const dday = parseDdayFromPeriod(c.period, c.status);
      return !dday.isClosed && dday.isUrgent;
    });
  }

  // 검색어 필터
  if (contestSearchQuery.trim()) {
    const q = contestSearchQuery.trim().toLowerCase();
    list = list.filter(c => 
      (c.title && c.title.toLowerCase().includes(q)) ||
      (c.organizer && c.organizer.toLowerCase().includes(q)) ||
      (c.category && c.category.toLowerCase().includes(q)) ||
      (c.description && c.description.toLowerCase().includes(q)) ||
      (c.prize && c.prize.toLowerCase().includes(q))
    );
  }

  // 정렬
  list.sort((a, b) => {
    const aDday = parseDdayFromPeriod(a.period, a.status);
    const bDday = parseDdayFromPeriod(b.period, b.status);

    if (contestSortOption === 'closingSoon') {
      return aDday.days - bDday.days;
    } else {
      return (b.id || '').localeCompare(a.id || '');
    }
  });

  return list;
}

// 카테고리 탭 뱃지 카운트 갱신
function updateContestCategoryCounts() {
  const tabs = document.querySelectorAll('#contestCategoryTabs .cat-pill');
  tabs.forEach(tab => {
    const cat = tab.getAttribute('data-category');
    const badge = tab.querySelector('.count-badge');
    if (!badge) return;

    if (cat === 'ALL') {
      badge.textContent = allContests.length;
    } else {
      const cnt = allContests.filter(c => c.category === cat).length;
      badge.textContent = cnt;
    }
  });
}

// [시안 B] 미니멀 언더라인 탭 스타일 갱신 (토스/애플 스타일 슬림 & 선명한 앰버 인디케이터)
function updateContestCategoryTabStyles(activeCategory = 'ALL') {
  const tabs = document.querySelectorAll('#contestCategoryTabs .cat-pill');
  tabs.forEach(tab => {
    const cat = tab.getAttribute('data-category');
    const badge = tab.querySelector('.count-badge');
    const isActive = (cat === activeCategory);

    if (isActive) {
      tab.className = 'cat-pill active category-tab-btn flex items-center gap-1.5 px-3 sm:px-4 text-xs sm:text-sm font-semibold text-amber-600 dark:text-amber-400 border-b-2 border-amber-500 -mb-px cursor-pointer whitespace-nowrap select-none';
      if (badge) {
        badge.className = 'count-badge text-[11px] px-2 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300 shadow-xs transition-colors';
      }
    } else {
      tab.className = 'cat-pill category-tab-btn flex items-center gap-1.5 px-3 sm:px-4 text-xs sm:text-sm font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 border-b-2 border-transparent -mb-px cursor-pointer whitespace-nowrap select-none';
      if (badge) {
        badge.className = 'count-badge text-[11px] px-2 py-0.5 rounded-full font-semibold bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 transition-colors';
      }
    }
  });
}

// 5. 공모전 카드 렌더링
function renderContests() {
  const grid = document.getElementById('contestCardGrid');
  const emptyState = document.getElementById('contestEmptyState');
  if (!grid || !emptyState) return;

  // 상단 긴급 배너 동기화
  renderContestUrgentBanner();

  const filtered = getFilteredContests();

  if (filtered.length === 0) {
    grid.classList.add('hidden');
    emptyState.classList.remove('hidden');
    emptyState.classList.add('flex');
    const emptyTitle = emptyState.querySelector('h3');
    const emptyDesc = emptyState.querySelector('p');
    if (isContestBookmarkView) {
      if (emptyTitle) emptyTitle.textContent = '북마크한 공모전이 없습니다';
      if (emptyDesc) emptyDesc.innerHTML = '관심 있는 공모전의 북마크 아이콘을 눌러 저장해보세요.<br><button onclick="window.toggleCurrentTabBookmark(false)" class="mt-2 text-amber-600 dark:text-amber-400 font-semibold underline cursor-pointer">전체 공모전 보기</button>';
    } else {
      if (emptyTitle) emptyTitle.textContent = '조건에 맞는 공모전이 없습니다';
      if (emptyDesc) emptyDesc.textContent = '다른 검색어를 입력하시거나 필터 조건을 변경해 보세요.';
    }
    return;
  }

  emptyState.classList.add('hidden');
  emptyState.classList.remove('flex');
  grid.classList.remove('hidden');

  grid.innerHTML = filtered.map(contest => {
    const isBookmarked = contestBookmarks.has(contest.id);
    const ddayInfo = parseDdayFromPeriod(contest.period, contest.status);

    // 상태 뱃지 스타일
    let statusBadgeClass = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
    if (contest.status === '접수예정') {
      statusBadgeClass = 'bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300 border-blue-200 dark:border-blue-800';
    } else if (contest.status === '상시접수') {
      statusBadgeClass = 'bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300 border-purple-200 dark:border-purple-800';
    }

    // 카테고리 뱃지 색상
    let catBadgeClass = 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800';
    if (contest.category === '스마트·기술') {
      catBadgeClass = 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800';
    } else if (contest.category === '도로·디자인') {
      catBadgeClass = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
    } else if (contest.category === '수자원·환경') {
      catBadgeClass = 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800';
    } else if (contest.category === '지반·안전') {
      catBadgeClass = 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800';
    }

    // D-Day 뱃지 스타일 강화: D-3 이내 항목에는 진한 붉은색/로즈 배경, animate-pulse, 불꽃(flame) 아이콘 추가
    let ddayBadgeHtml = '';
    if (ddayInfo.isUrgent) {
      ddayBadgeHtml = `
        <span class="inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-md font-bold bg-rose-600 text-white border border-rose-600 animate-pulse shadow-sm shadow-rose-500/30 flex-shrink-0">
          <i data-lucide="flame" class="w-3 h-3 text-amber-300 flex-shrink-0"></i>
          <span>${ddayInfo.text}</span>
        </span>
      `;
    } else {
      let ddayBadgeClass = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
      if (contest.status === '접수중') {
        if (ddayInfo.days <= 7) {
          ddayBadgeClass = 'bg-amber-500 text-white font-bold';
        } else {
          ddayBadgeClass = 'bg-blue-600 text-white font-bold';
        }
      }
      ddayBadgeHtml = `
        <span class="text-[11px] px-2 py-0.5 rounded-md font-semibold ${ddayBadgeClass} flex-shrink-0">
          ${ddayInfo.text}
        </span>
      `;
    }

    /*
      [GEMINI.md 핵심 레이아웃 규칙 준수]
      1행: 좌측 카테고리 뱃지, 우측 최상단 상태 뱃지 고정 (flex justify-between)
      2행: [📅 접수기간: YYYY.MM.DD ~ MM.DD (상세시간 마감)] 독립 행 배치
    */
    return `
      <div 
        class="contest-card bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 hover:border-amber-400/60 dark:hover:border-amber-500/50 hover:shadow-lg transition-all duration-200 flex flex-col justify-between cursor-pointer group"
        onclick="openContestModal('${contest.id}')"
      >
        <div>
          <!-- 1행 (상단 헤더): 좌측 카테고리 뱃지, 우측 최상단 상태 뱃지 고정 (flex justify-between) -->
          <div class="flex items-center justify-between gap-2 pb-2.5">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="text-[11px] px-2.5 py-0.5 rounded-full font-semibold border ${catBadgeClass} flex-shrink-0">
                ${contest.category || '공모전'}
              </span>
              ${ddayBadgeHtml}
            </div>
            <div class="flex items-center gap-1.5 flex-shrink-0">
              <span class="text-[11px] px-2.5 py-0.5 rounded-full font-semibold border ${statusBadgeClass}">
                ${contest.status}
              </span>
            </div>
          </div>

          <!-- 2행 (접수 기간): 독립된 전용 행으로 배치하여 줄바꿈 밀림 방지 -->
          <div class="mb-3">
            <span class="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-slate-100/80 dark:bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-200/60 dark:border-slate-700/60">
              <i data-lucide="calendar" class="w-3.5 h-3.5 text-slate-400"></i>
              <span>접수: ${contest.period || '공식 공고문 참조'}</span>
            </span>
          </div>

          <!-- 공모전 제목 -->
          <h3 class="text-base font-bold text-slate-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 transition leading-snug line-clamp-2 mb-1.5">
            ${contest.title}
          </h3>

          <!-- 주최 기관 & 대상 -->
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mb-3">
            <span class="font-medium text-slate-700 dark:text-slate-300">${contest.organizer}</span>
            <span class="text-slate-300 dark:text-slate-700">•</span>
            <span>${contest.target || '전국민'}</span>
          </div>

          <!-- 상금/포상 하이라이트 박스 -->
          <div class="p-2.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200/70 dark:border-amber-900/40 mb-3 flex items-start gap-2">
            <i data-lucide="award" class="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5"></i>
            <span class="text-xs font-semibold text-amber-800 dark:text-amber-300 line-clamp-1">
              ${contest.prize || '공식 공고문 확인'}
            </span>
          </div>

          <!-- 요약 설명 -->
          <p class="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed mb-4">
            ${contest.description || ''}
          </p>
        </div>

        <!-- 카드 하단 버튼 영역 -->
        <div class="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
          <button 
            type="button" 
            onclick="openContestModal('${contest.id}'); event.stopPropagation();"
            class="text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition flex items-center gap-1"
          >
            <span>상세 요강 보기</span>
            <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
          </button>

          <div class="flex items-center gap-1.5" onclick="event.stopPropagation();">
            <!-- 공유 버튼 -->
            <button 
              type="button"
              onclick="shareContest('${contest.id}', event)"
              class="p-1.5 rounded-lg text-slate-400 hover:text-amber-500 dark:hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              title="공모전 공유하기"
            >
              <i data-lucide="share-2" class="w-4 h-4"></i>
            </button>
            <!-- 북마크 버튼 -->
            <button 
              type="button"
              onclick="toggleContestBookmark('${contest.id}', event)" 
              class="p-1.5 rounded-lg text-slate-400 hover:text-amber-500 dark:hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              title="${isBookmarked ? '북마크 해제' : '북마크 저장'}"
            >
              <i data-lucide="bookmark" class="w-4 h-4 ${isBookmarked ? 'fill-amber-500 text-amber-500' : ''}"></i>
            </button>
            <!-- 공식 원문 접수 사이트 링크 -->
            <a 
              href="${contest.link}" 
              target="_blank" 
              rel="noopener noreferrer" 
              class="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-amber-500 text-slate-700 hover:text-white dark:bg-slate-800 dark:text-slate-300 dark:hover:text-white transition shadow-xs"
              title="공식 공고 사이트로 이동"
            >
              <span>공식 접수처</span>
              <i data-lucide="external-link" class="w-3 h-3"></i>
            </a>
          </div>
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) {
    lucide.createIcons();
  }
}

// 6. 상세 모달 팝업
function openContestModal(contestId) {
  const contest = allContests.find(c => c.id === contestId);
  if (!contest) return;

  currentModalContest = contest;
  const modal = document.getElementById('contestDetailModal');
  if (!modal) return;

  const ddayInfo = parseDdayFromPeriod(contest.period, contest.status);

  const catEl = document.getElementById('modalCategoryBadge');
  if (catEl) catEl.textContent = contest.category || '공모전';
  const statusEl = document.getElementById('modalStatusBadge');
  if (statusEl) statusEl.textContent = contest.status;
  const ddayEl = document.getElementById('modalDdayBadge');
  if (ddayEl) {
    if (ddayInfo.isUrgent) {
      ddayEl.className = 'inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-bold bg-rose-600 text-white border border-rose-600 animate-pulse shadow-xs';
      ddayEl.innerHTML = `<i data-lucide="flame" class="w-3.5 h-3.5 text-amber-300"></i><span>${ddayInfo.text}</span>`;
    } else {
      ddayEl.className = 'text-xs px-2.5 py-0.5 rounded-full font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300';
      ddayEl.textContent = ddayInfo.text;
    }
  }
  const titleEl = document.getElementById('modalTitle');
  if (titleEl) titleEl.textContent = contest.title;
  const orgEl = document.getElementById('modalOrganizer');
  if (orgEl) orgEl.textContent = `주최/주관: ${contest.organizer}`;
  const periodEl = document.getElementById('modalPeriod');
  if (periodEl) periodEl.textContent = contest.period || '공식 공고문 확인';
  const prizeEl = document.getElementById('modalPrize');
  if (prizeEl) prizeEl.textContent = contest.prize || '공식 공고문 확인';
  const targetEl = document.getElementById('modalTarget');
  if (targetEl) targetEl.textContent = contest.target || '전국민 누구나 / 관련 분야 전공자 및 기업';
  const descEl = document.getElementById('modalDescription');
  if (descEl) descEl.textContent = contest.description || '세부 요강 및 제출 양식은 공식 접수처 웹사이트를 참조하시기 바랍니다.';

  const officialLink = document.getElementById('modalOfficialLink');
  if (officialLink) {
    officialLink.href = contest.link;
  }

  updateModalBookmarkState();

  // 모달 표시
  modal.classList.remove('invisible', 'opacity-0');
  const backdrop = modal.querySelector('#contestModalBackdrop');
  if (backdrop) backdrop.classList.remove('opacity-0');
  document.body.style.overflow = 'hidden';
  if (window.lucide) lucide.createIcons();
}

function closeContestModal() {
  const modal = document.getElementById('contestDetailModal');
  if (!modal) return;
  modal.classList.add('invisible', 'opacity-0');
  document.body.style.overflow = '';
  currentModalContest = null;
}

function updateModalBookmarkState() {
  if (!currentModalContest) return;
  const btn = document.getElementById('modalBookmarkBtn');
  if (!btn) return;

  const isBookmarked = contestBookmarks.has(currentModalContest.id);
  btn.innerHTML = `
    <i data-lucide="bookmark" class="w-4 h-4 text-amber-500 ${isBookmarked ? 'fill-amber-500' : ''}"></i>
    <span>${isBookmarked ? '북마크됨' : '북마크'}</span>
  `;
  if (window.lucide) lucide.createIcons();
}

// 6-1. 공모전 캘린더 등록 헬퍼
function toggleContestCalendarMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('contestCalendarMenu');
  if (!menu) return;
  menu.classList.toggle('hidden');
}

// 외부 클릭 시 공모전 캘린더 메뉴 닫기
document.addEventListener('click', () => {
  const menu = document.getElementById('contestCalendarMenu');
  if (menu && !menu.classList.contains('hidden')) {
    menu.classList.add('hidden');
  }
});

function getContestDateStrings(contest) {
  let dateStr = '';
  const match = (contest.period || '').match(/~\s*(?:(\d{4})[.\-/])?(\d{1,2})[.\-/](\d{1,2})/);
  if (match) {
    const year = match[1] ? match[1] : new Date().getFullYear();
    const m = match[2].padStart(2, '0');
    const d = match[3].padStart(2, '0');
    dateStr = `${year}-${m}-${d}`;
  } else {
    const today = new Date();
    dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  }

  const clean = dateStr.replace(/-/g, '');
  const d = new Date(dateStr);
  d.setDate(d.getDate() + 1);
  const nextClean = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  return { start: clean, end: nextClean };
}

function addContestToGoogleCalendar() {
  if (!currentModalContest) return;
  const contest = currentModalContest;

  const dates = getContestDateStrings(contest);
  const title = `[공모전마감] ${contest.organizer} - ${contest.title}`;
  const details = `[Civil News Hub 공모전 마감 알림]\n\n공모전명: ${contest.title}\n주최/주관: ${contest.organizer}\n분야: ${contest.category}\n접수기간: ${contest.period}\n총 상금/포상: ${contest.prize || '공식 공고 확인'}\n\n🔗 공식 접수처: ${contest.link}`;

  const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE` +
    `&text=${encodeURIComponent(title)}` +
    `&dates=${dates.start}/${dates.end}` +
    `&details=${encodeURIComponent(details)}` +
    `&location=${encodeURIComponent(contest.organizer || '온라인 접수')}`;

  window.open(gcalUrl, '_blank', 'noopener,noreferrer');
  showContestToast('Google 캘린더 등록 창이 열렸습니다.');
}

function downloadContestIcs() {
  if (!currentModalContest) return;
  const contest = currentModalContest;

  const dates = getContestDateStrings(contest);
  const title = `[공모전마감] ${contest.organizer} - ${contest.title}`;
  const details = `[Civil News Hub 공모전 마감 알림]\\n공모전: ${contest.title}\\n주최: ${contest.organizer}\\n접수기간: ${contest.period}\\n상금: ${contest.prize || '공식 공고 확인'}\\n\\n공식 링크: ${contest.link}`;
  const dtstamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const icsData = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Civil News Hub//Contest Calendar//KO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:contest-${contest.id}@civilnewshub.com`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;VALUE=DATE:${dates.start}`,
    `DTEND;VALUE=DATE:${dates.end}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${details}`,
    `LOCATION:${contest.organizer || '온라인 접수'}`,
    'STATUS:CONFIRMED',
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  const blob = new Blob([icsData], { type: 'text/calendar;charset=utf-8;' });
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.setAttribute('download', `${contest.title.replace(/[\/\\:*?"<>|]/g, '_')}_마감일정.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);

  showContestToast('📅 캘린더 파일(.ics)이 다운로드되었습니다.');
}

// 6-2. 공모전 SNS 및 링크 공유 (Web Share API + Clipboard Fallback)
async function shareContest(contestId, e) {
  if (e) e.stopPropagation();
  const contest = allContests.find(c => c.id === contestId);
  if (!contest) return;

  const shareTitle = `[토목 공모전] ${contest.organizer} - ${contest.title}`;
  const shareText = `[토목 공모전] ${contest.organizer} - ${contest.title}\n📅 접수기간: ${contest.period || '공고문 참조'}\n🎁 시상내역: ${contest.prize || '공고문 참조'}\n🔗 공식접수처: ${contest.link}\n출처: Civil News Hub`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: shareTitle,
        text: shareText,
        url: contest.link
      });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }

  // Web Share 미지원 환경: 클립보드 복사
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(shareText).then(() => {
      showContestToast('📋 공모전 요강 공유 문구가 복사되었습니다.');
    }).catch(() => {
      copyContestPromptFallback(shareText);
    });
  } else {
    copyContestPromptFallback(shareText);
  }
}

function shareCurrentModalContest() {
  if (!currentModalContest) return;
  shareContest(currentModalContest.id);
}

function copyContestPromptFallback(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    showContestToast('📋 공모전 요강 공유 문구가 복사되었습니다.');
  } catch (err) {
    prompt('공모전 정보 복사하기:', text);
  }
  document.body.removeChild(textarea);
}

// 7. 이벤트 리스너 설정
function setupContestEventListeners() {
  // 검색창 입력
  const searchInput = document.getElementById('contestSearchInput');
  const clearSearchBtn = document.getElementById('clearContestSearchBtn');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      contestSearchQuery = e.target.value;
      if (clearSearchBtn) {
        if (contestSearchQuery.trim()) {
          clearSearchBtn.classList.remove('hidden');
        } else {
          clearSearchBtn.classList.add('hidden');
        }
      }
      renderContests();
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      contestSearchQuery = '';
      clearSearchBtn.classList.add('hidden');
      renderContests();
    });
  }

  // 상태 필터 버튼 그룹 (전체, 접수중, 접수예정, 상시)
  const statusGroup = document.getElementById('contestStatusFilterGroup');
  if (statusGroup) {
    statusGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.status-pill');
      if (!btn) return;

      statusGroup.querySelectorAll('.status-pill').forEach(b => {
        b.classList.remove('bg-white', 'dark:bg-slate-900', 'shadow-xs', 'text-slate-900', 'dark:text-white', 'font-semibold');
      });
      btn.classList.add('bg-white', 'dark:bg-slate-900', 'shadow-xs', 'text-slate-900', 'dark:text-white', 'font-semibold');

      contestActiveStatus = btn.getAttribute('data-status');
      renderContests();
    });
    // 기본 활성 상태 스타일 지정
    const defaultActive = statusGroup.querySelector('[data-status="ALL"]');
    if (defaultActive) {
      defaultActive.classList.add('bg-white', 'dark:bg-slate-900', 'shadow-xs', 'text-slate-900', 'dark:text-white', 'font-semibold');
    }
  }

  // 정렬 셀렉트
  const sortSelect = document.getElementById('contestSortSelect');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      contestSortOption = e.target.value;
      renderContests();
    });
  }

  // 분야(카테고리) 탭 (시안 B: 미니멀 언더라인 탭)
  const categoryTabs = document.getElementById('contestCategoryTabs');
  if (categoryTabs) {
    categoryTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.cat-pill');
      if (!btn) return;

      contestActiveCategory = btn.getAttribute('data-category');
      updateContestCategoryTabStyles(contestActiveCategory);
      renderContests();
    });
    // 기본 ALL 탭 스타일 초기화
    updateContestCategoryTabStyles(contestActiveCategory);
  }

  // 필터 초기화 버튼
  const resetBtn = document.getElementById('contestResetFilterBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      contestActiveCategory = 'ALL';
      contestActiveStatus = 'ALL';
      contestSearchQuery = '';
      isContestBookmarkView = false;
      if (searchInput) searchInput.value = '';
      if (clearSearchBtn) clearSearchBtn.classList.add('hidden');

      if (categoryTabs) {
        updateContestCategoryTabStyles('ALL');
      }

      if (statusGroup) {
        statusGroup.querySelectorAll('.status-pill').forEach(b => {
          b.classList.remove('bg-white', 'dark:bg-slate-900', 'shadow-xs', 'text-slate-900', 'dark:text-white', 'font-semibold');
        });
        const allStatus = statusGroup.querySelector('[data-status="ALL"]');
        if (allStatus) {
          allStatus.classList.add('bg-white', 'dark:bg-slate-900', 'shadow-xs', 'text-slate-900', 'dark:text-white', 'font-semibold');
        }
      }

      renderContests();
    });
  }

  // 모달 닫기 이벤트
  const closeBtn = document.getElementById('closeModalBtn');
  if (closeBtn) closeBtn.addEventListener('click', closeContestModal);

  const backdrop = document.getElementById('contestModalBackdrop');
  if (backdrop) backdrop.addEventListener('click', closeContestModal);

  const modalBookmark = document.getElementById('modalBookmarkBtn');
  if (modalBookmark) {
    modalBookmark.addEventListener('click', () => {
      if (currentModalContest) {
        toggleContestBookmark(currentModalContest.id);
      }
    });
  }
}

// 8. 로딩 및 토스트
function showContestLoading(show) {
  const loading = document.getElementById('contestLoadingState');
  const grid = document.getElementById('contestCardGrid');
  if (loading) {
    if (show) {
      loading.classList.remove('hidden');
      loading.classList.add('flex');
    } else {
      loading.classList.add('hidden');
      loading.classList.remove('flex');
    }
  }
  if (grid && show) {
    grid.classList.add('hidden');
  }
}

function showContestToast(msg) {
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

// 외부에서 호출 가능한 북마크 토글 함수
window.toggleContestBookmarkFilter = function(forceState) {
  if (typeof forceState === 'boolean') {
    isContestBookmarkView = forceState;
  } else {
    isContestBookmarkView = !isContestBookmarkView;
  }
  renderContests();
  return isContestBookmarkView;
};
