// Civil News Hub - Civil Engineering Contests & Competitions Dashboard (토목 공모전 허브)

let allContests = [];
let contestActiveCategory = 'ALL';
let contestActiveStatus = 'ALL';
let contestActiveTarget = 'ALL';
let contestSearchQuery = '';
let contestSortOption = 'closingSoon'; // closingSoon | latest
let contestBookmarks = new Set();
let isContestBookmarkView = false;
let isContestUrgentFilterActive = false;
let currentModalContest = null;
let calendarCurrentYear = new Date().getFullYear();
let calendarCurrentMonth = new Date().getMonth();

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
  window.contestBookmarks = contestBookmarks;
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
  window.contestBookmarks = contestBookmarks;
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
    window.allContests = allContests;

    // 메타데이터 표시
    const updatedEl = document.getElementById('contestLastUpdatedTime');
    if (updatedEl) updatedEl.textContent = `업데이트: ${data.last_updated_display || '실시간'}`;

    const footerUpdatedEl = document.getElementById('footerLastUpdated');
    if (footerUpdatedEl && data.last_updated_display && (!footerUpdatedEl.textContent || footerUpdatedEl.textContent === '확인 중...')) {
      footerUpdatedEl.textContent = data.last_updated_display;
    }

    const activeCountBadge = document.getElementById('contestActiveCountBadge');
    if (activeCountBadge) activeCountBadge.textContent = allContests.length;

    // 전역 북마크 모드 동기화
    if (window.isGlobalBookmarkMode) {
      isContestBookmarkView = true;
    }

    updateContestCategoryCounts();
    renderContests();
    if (window.updateGlobalBookmarkCount) window.updateGlobalBookmarkCount();
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

// 3-2. 긴급 마감 임박 공모전 배너 (알림 제거됨)
function renderContestUrgentBanner() {
  const container = document.getElementById('contestUrgentBannerContainer');
  if (container) {
    container.innerHTML = '';
    container.classList.add('hidden');
  }
}

// 3-3. 퀵 필터 토글 함수 (레거시 안전 처리)
window.toggleContestUrgentFilter = function() {
  isContestUrgentFilterActive = false;
  renderContests();
};


// 참가대상 판별 및 매칭 헬퍼
function matchContestTarget(contest, targetKey) {
  if (!targetKey || targetKey === 'ALL') return true;
  const t = (contest.target || '').toLowerCase();
  const desc = (contest.description || '').toLowerCase();
  const combined = `${t} ${desc}`;
  if (targetKey === 'student') {
    return combined.includes('대학') || combined.includes('학생') || combined.includes('청년') || combined.includes('누구나') || combined.includes('국민');
  }
  if (targetKey === 'startup') {
    return combined.includes('스타트업') || combined.includes('기업') || combined.includes('중소') || combined.includes('창업') || combined.includes('벤처');
  }
  if (targetKey === 'general') {
    return combined.includes('국민') || combined.includes('누구나') || combined.includes('일반') || combined.includes('근로자');
  }
  return true;
}

function getContestTargetBadge(contest) {
  const t = (contest.target || '').toLowerCase();
  if (t.includes('스타트업') || t.includes('기업') || t.includes('창업')) return '🚀 스타트업·기업';
  if (t.includes('대학') || t.includes('학생')) return '🎓 대학(원)생';
  if (t.includes('국민') || t.includes('누구나')) return '👥 전 국민 누구나';
  return '💼 일반·전문가';
}

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

  // 참가대상 자격 필터
  if (contestActiveTarget !== 'ALL') {
    list = list.filter(c => matchContestTarget(c, contestActiveTarget));
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

  const notice = document.getElementById('contestResultCountNotice');
  const filtered = getFilteredContests();

  if (notice) {
    if (isContestBookmarkView) {
      notice.textContent = `⭐ 마이페이지 공모전 총 ${filtered.length}건`;
    } else if (contestSearchQuery) {
      notice.textContent = `'${contestSearchQuery}' 검색 결과 총 ${filtered.length}건`;
    } else {
      notice.textContent = `진행 중인 토목 공모전 총 ${filtered.length}건`;
    }
  }

  if (filtered.length === 0) {
    grid.classList.add('hidden');
    emptyState.classList.remove('hidden');
    emptyState.classList.add('flex');
    const emptyTitle = emptyState.querySelector('h3');
    const emptyDesc = emptyState.querySelector('p');
    if (isContestBookmarkView) {
      if (emptyTitle) emptyTitle.textContent = '마이페이지에 저장된 공모전이 없습니다';
      if (emptyDesc) emptyDesc.innerHTML = '관심 있는 공모전의 북마크 아이콘을 눌러 마이페이지에 저장해보세요.<br><button onclick="window.toggleCurrentTabBookmark(false)" class="mt-2 text-amber-600 dark:text-amber-400 font-semibold underline cursor-pointer">전체 공모전 보기</button>';
    } else {
      if (emptyTitle) emptyTitle.textContent = '조건에 맞는 공모전이 없습니다';
      if (emptyDesc) emptyDesc.textContent = '다른 검색어를 입력하시거나 필터 조건을 변경해 보세요.';
    }
    return;
  }

  emptyState.classList.add('hidden');
  emptyState.classList.remove('flex');
  grid.classList.remove('hidden');

  grid.innerHTML = filtered.map(renderContestCard).join('');

  if (window.lucide) {
    lucide.createIcons();
  }
}

// 공모전 단일 카드 렌더링 (마이페이지 및 메인 그리드 공용)
function renderContestCard(contest) {
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

  // D-Day 뱃지 스타일: 알림/점멸(animate-pulse, flame) 없는 차분한 디자인
  let ddayBadgeHtml = '';
  if (ddayInfo.isUrgent) {
    ddayBadgeHtml = `
      <span class="inline-flex items-center text-xs sm:text-sm px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-lg font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800 flex-shrink-0">
        ${ddayInfo.text}
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
      <span class="text-xs sm:text-sm px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-lg font-semibold ${ddayBadgeClass} flex-shrink-0">
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
      class="contest-card bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl p-5 sm:p-7 border border-slate-200 dark:border-slate-800 hover:border-amber-400/60 dark:hover:border-amber-500/50 hover:shadow-lg transition-all duration-200 flex flex-col justify-between cursor-pointer group"
      onclick="openContestModal('${contest.id}')"
    >
      <div>
        <!-- 1행 (상단 헤더): 좌측 카테고리 뱃지, 우측 최상단 상태 뱃지 고정 (flex justify-between) -->
        <div class="flex items-center justify-between gap-2 pb-3">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-xs sm:text-sm px-3 py-1 rounded-full font-semibold border ${catBadgeClass} flex-shrink-0">
              ${contest.category || '공모전'}
            </span>
            ${ddayBadgeHtml}
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <span class="text-xs sm:text-sm px-3 py-1 rounded-full font-semibold border ${statusBadgeClass}">
              ${contest.status}
            </span>
          </div>
        </div>

        <!-- 2행 (접수 기간 & 참가 대상 뱃지) -->
        <div class="flex items-center gap-1.5 flex-wrap mb-3.5">
          <span class="inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-100/80 dark:bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
            <i data-lucide="calendar" class="w-4 h-4 text-slate-400"></i>
            <span>접수: ${contest.period || '공식 공고문 참조'}</span>
          </span>
          <span class="inline-flex items-center text-xs font-semibold px-2.5 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200/80 dark:border-amber-900/60">
            ${getContestTargetBadge(contest)}
          </span>
        </div>

        <!-- 공모전 제목 -->
        <h3 class="text-base sm:text-xl font-bold text-slate-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 transition leading-snug line-clamp-2 mb-2">
          ${contest.title}
        </h3>

        <!-- 주최 기관 & 대상 -->
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-3.5">
          <span class="font-medium text-slate-700 dark:text-slate-300">${contest.organizer}</span>
          <span class="text-slate-300 dark:text-slate-700">•</span>
          <span>${contest.target || '전국민'}</span>
        </div>

        <!-- 요약 설명 -->
        <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed mb-4">
          ${contest.description || ''}
        </p>
      </div>

      <!-- 카드 하단 버튼 영역 -->
      <div class="pt-4 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
        <!-- 공모전 보상 (상금 / 혜택 뱃지) -->
        <div class="flex items-center min-w-0 pr-1 flex-1" title="공모전 보상: ${contest.prize || '공식 공고문 확인'}">
          <span class="inline-flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-bold text-amber-800 dark:text-amber-300 bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/60 px-2.5 sm:px-3 py-1.5 rounded-xl truncate shadow-2xs">
            <i data-lucide="award" class="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0"></i>
            <span class="truncate">${contest.prize || '공식 공고문 확인'}</span>
          </span>
        </div>

        <div class="flex items-center gap-1.5 sm:gap-2 flex-shrink-0" onclick="event.stopPropagation();">
          <!-- 공유 버튼 -->
          <button 
            type="button"
            onclick="shareContest('${contest.id}', event)"
            class="p-2 sm:p-2.5 rounded-xl text-slate-400 hover:text-amber-500 dark:hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            title="공모전 공유하기"
          >
            <i data-lucide="share-2" class="w-4 h-4 sm:w-4.5 sm:h-4.5"></i>
          </button>
          <!-- 북마크 버튼 -->
          <button 
            type="button"
            onclick="toggleContestBookmark('${contest.id}', event)" 
            class="p-2 sm:p-2.5 rounded-xl text-slate-400 hover:text-amber-500 dark:hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            title="${isBookmarked ? '북마크 해제' : '북마크 저장'}"
          >
            <i data-lucide="bookmark" class="w-4 h-4 sm:w-4.5 sm:h-4.5 ${isBookmarked ? 'fill-amber-500 text-amber-500' : ''}"></i>
          </button>
          <!-- 공식 원문 접수 사이트 링크 -->
          <a 
            href="${contest.link}" 
            target="_blank" 
            rel="noopener noreferrer" 
            class="inline-flex items-center gap-1 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold bg-slate-100 hover:bg-amber-500 text-slate-700 hover:text-white dark:bg-slate-800 dark:text-slate-300 dark:hover:text-white transition shadow-2xs whitespace-nowrap flex-shrink-0"
            title="공식 접수처 바로가기"
          >
            <span>접수</span>
            <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
          </a>
        </div>
      </div>
      ${typeof window.renderBookmarkNoteRow === 'function' ? window.renderBookmarkNoteRow(contest.id, contest.title) : ''}
    </div>
  `;
}
window.renderContestCard = renderContestCard;

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
      ddayEl.className = 'text-xs px-2.5 py-0.5 rounded-full font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800';
      ddayEl.textContent = ddayInfo.text;
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

  // 참가대상 자격 필터 그룹 (전체, 대학(원)생, 스타트업·기업, 전 국민 누구나)
  const targetGroup = document.getElementById('contestTargetFilterGroup');
  if (targetGroup) {
    targetGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.target-pill');
      if (!btn) return;

      targetGroup.querySelectorAll('.target-pill').forEach(b => {
        b.classList.remove('active', 'bg-amber-500', 'text-white', 'font-semibold');
        b.classList.add('bg-white', 'dark:bg-slate-900', 'text-slate-600', 'dark:text-slate-300', 'border', 'border-slate-200', 'dark:border-slate-800', 'font-medium');
      });
      btn.classList.add('active', 'bg-amber-500', 'text-white', 'font-semibold');
      btn.classList.remove('bg-white', 'dark:bg-slate-900', 'text-slate-600', 'dark:text-slate-300', 'border', 'border-slate-200', 'dark:border-slate-800', 'font-medium');

      contestActiveTarget = btn.getAttribute('data-target') || 'ALL';
      renderContests();
    });
  }

  // 필터 초기화 버튼
  const resetBtn = document.getElementById('contestResetFilterBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      contestActiveCategory = 'ALL';
      contestActiveStatus = 'ALL';
      contestActiveTarget = 'ALL';
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

      if (targetGroup) {
        targetGroup.querySelectorAll('.target-pill').forEach(b => {
          b.classList.remove('active', 'bg-amber-500', 'text-white', 'font-semibold');
          b.classList.add('bg-white', 'dark:bg-slate-900', 'text-slate-600', 'dark:text-slate-300', 'border', 'border-slate-200', 'dark:border-slate-800', 'font-medium');
        });
        const allTarget = targetGroup.querySelector('[data-target="ALL"]');
        if (allTarget) {
          allTarget.classList.add('active', 'bg-amber-500', 'text-white', 'font-semibold');
          allTarget.classList.remove('bg-white', 'dark:bg-slate-900', 'text-slate-600', 'dark:text-slate-300', 'border', 'border-slate-200', 'dark:border-slate-800', 'font-medium');
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

// 9. 공모전 마감 일정 캘린더 (월간 캘린더 뷰 모달)
function escapeContestHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function parseContestDeadlineDate(periodStr) {
  if (!periodStr || periodStr.includes('상시')) return null;
  const today = new Date();
  const match = periodStr.match(/~\s*(?:(\d{4})[.\-/])?(\d{1,2})[.\-/](\d{1,2})/);
  if (match) {
    const year = match[1] ? parseInt(match[1], 10) : today.getFullYear();
    const month = parseInt(match[2], 10) - 1; // 0-indexed
    const day = parseInt(match[3], 10);
    const dateObj = new Date(year, month, day);
    if (!isNaN(dateObj.getTime())) {
      return { year, month, day, dateObj };
    }
  }
  return null;
}

function openContestCalendarModal() {
  const modal = document.getElementById('contestCalendarModal');
  const backdrop = document.getElementById('contestCalendarBackdrop');
  if (!modal || !backdrop) return;

  // 기본 현재 날짜 기준
  const today = new Date();
  calendarCurrentYear = today.getFullYear();
  calendarCurrentMonth = today.getMonth();

  renderContestCalendar(calendarCurrentYear, calendarCurrentMonth);

  modal.classList.remove('invisible', 'opacity-0');
  modal.classList.add('visible', 'opacity-100');
  backdrop.classList.remove('opacity-0');
  backdrop.classList.add('opacity-100');
  document.body.classList.add('overflow-hidden');
  if (window.lucide) lucide.createIcons();
}

function closeContestCalendarModal() {
  const modal = document.getElementById('contestCalendarModal');
  const backdrop = document.getElementById('contestCalendarBackdrop');
  if (!modal || !backdrop) return;

  modal.classList.remove('visible', 'opacity-100');
  modal.classList.add('invisible', 'opacity-0');
  backdrop.classList.remove('opacity-100');
  backdrop.classList.add('opacity-0');
  document.body.classList.remove('overflow-hidden');
}

function changeCalendarMonth(delta) {
  calendarCurrentMonth += delta;
  if (calendarCurrentMonth < 0) {
    calendarCurrentMonth = 11;
    calendarCurrentYear -= 1;
  } else if (calendarCurrentMonth > 11) {
    calendarCurrentMonth = 0;
    calendarCurrentYear += 1;
  }
  renderContestCalendar(calendarCurrentYear, calendarCurrentMonth);
}

function renderContestCalendar(year, month) {
  const monthDisplay = document.getElementById('calendarCurrentMonthDisplay');
  const daysGrid = document.getElementById('calendarDaysGrid');
  const timelineTitle = document.getElementById('calendarMonthTimelineTitle');
  const timelineList = document.getElementById('calendarTimelineList');
  if (!daysGrid) return;

  if (monthDisplay) {
    monthDisplay.textContent = `${year}년 ${month + 1}월`;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 이 달의 1일의 요일 (0: 일, 1: 월, ... 6: 토)
  const firstDay = new Date(year, month, 1).getDay();
  // 이 달의 총 일수
  const totalDays = new Date(year, month + 1, 0).getDate();
  // 지난 달의 총 일수
  const prevMonthTotalDays = new Date(year, month, 0).getDate();

  // 이 달 마감 공모전 모으기
  const monthContests = [];
  const dayContestMap = {};
  allContests.forEach(c => {
    if (c.status === '접수마감') return;
    const dead = parseContestDeadlineDate(c.period);
    if (dead && dead.year === year && dead.month === month) {
      const item = { ...c, deadlineDay: dead.day, deadlineDate: dead.dateObj };
      monthContests.push(item);
      if (!dayContestMap[dead.day]) {
        dayContestMap[dead.day] = [];
      }
      dayContestMap[dead.day].push(item);
    }
  });

  // 캘린더 일자 그리드 생성
  let gridHtml = '';

  // 이전 달 날짜 패딩
  for (let i = firstDay - 1; i >= 0; i--) {
    const prevDay = prevMonthTotalDays - i;
    gridHtml += `
      <div class="p-1 sm:p-1.5 rounded-xl bg-slate-50/50 dark:bg-slate-900/40 text-slate-300 dark:text-slate-700 min-h-[56px] sm:min-h-[68px] flex flex-col justify-start select-none border border-transparent">
        <span class="text-[11px] font-semibold">${prevDay}</span>
      </div>
    `;
  }

  // 이번 달 일자
  for (let day = 1; day <= totalDays; day++) {
    const currentDayDate = new Date(year, month, day);
    const dayOfWeek = currentDayDate.getDay();
    const isToday = (today.getFullYear() === year && today.getMonth() === month && today.getDate() === day);
    const items = dayContestMap[day] || [];
    const hasItems = items.length > 0;

    let dayColorClass = 'text-slate-700 dark:text-slate-300';
    if (dayOfWeek === 0) dayColorClass = 'text-rose-500';
    if (dayOfWeek === 6) dayColorClass = 'text-blue-500';

    gridHtml += `
      <div 
        class="relative flex flex-col items-start p-1 sm:p-1.5 rounded-xl border transition cursor-pointer min-h-[56px] sm:min-h-[68px] ${
          isToday
            ? 'border-amber-400 bg-amber-50/40 dark:bg-amber-950/20'
            : hasItems
            ? 'border-amber-200 dark:border-amber-900/60 bg-white dark:bg-slate-800 hover:border-amber-400 shadow-xs'
            : 'border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900/50 hover:bg-slate-50 dark:hover:bg-slate-800/40'
        }"
        onclick="${hasItems ? `scrollToCalendarTimelineDay(${day})` : ''}"
        title="${hasItems ? `${day}일 마감 공모전 ${items.length}건` : ''}"
      >
        <div class="flex items-center justify-between w-full mb-0.5">
          <span class="text-[11px] sm:text-xs font-bold ${dayColorClass} ${isToday ? 'px-1.5 py-0.2 rounded-md bg-amber-500 text-white' : ''}">
            ${day}
          </span>
          ${hasItems ? `
            <span class="px-1 py-0.2 rounded-full text-[9px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-300/80">
              ${items.length}
            </span>
          ` : ''}
        </div>
        ${hasItems ? `
          <div class="w-full space-y-0.5 overflow-hidden mt-0.5">
            ${items.slice(0, 1).map(c => `
              <div class="truncate text-[9px] sm:text-[10px] text-amber-900 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/60 rounded px-1 py-0.5 font-medium leading-tight">
                ${escapeContestHtml(c.title)}
              </div>
            `).join('')}
            ${items.length > 1 ? `
              <div class="text-[9px] text-amber-600 dark:text-amber-400 font-semibold pl-0.5">
                +${items.length - 1}개 더보기
              </div>
            ` : ''}
          </div>
        ` : ''}
      </div>
    `;
  }

  // 다음 달 날짜 패딩 (7의 배수 맞춤)
  const remainingCells = (7 - ((firstDay + totalDays) % 7)) % 7;
  for (let d = 1; d <= remainingCells; d++) {
    gridHtml += `
      <div class="p-1 sm:p-1.5 rounded-xl bg-slate-50/50 dark:bg-slate-900/40 text-slate-300 dark:text-slate-700 min-h-[56px] sm:min-h-[68px] flex flex-col justify-start select-none border border-transparent">
        <span class="text-[11px] font-semibold">${d}</span>
      </div>
    `;
  }

  daysGrid.innerHTML = gridHtml;

  // 타임라인 리스트 렌더링
  if (timelineTitle) {
    timelineTitle.textContent = `${year}년 ${month + 1}월 마감 예정 공모전 (${monthContests.length}건)`;
  }

  if (timelineList) {
    if (monthContests.length === 0) {
      timelineList.innerHTML = `
        <div class="py-6 text-center text-slate-400 dark:text-slate-500 text-xs">
          이 달에 마감 예정인 등록 공모전이 없습니다.
        </div>
      `;
    } else {
      monthContests.sort((a, b) => a.deadlineDay - b.deadlineDay);
      timelineList.innerHTML = monthContests.map(c => {
        const dday = parseDdayFromPeriod(c.period, c.status);
        return `
          <div id="calendarTimelineItem-${c.deadlineDay}" class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-3 hover:border-amber-400 transition cursor-pointer" onclick="closeContestCalendarModal(); openContestModal('${c.id}');">
            <div class="flex items-center gap-2.5 min-w-0">
              <span class="px-2 py-1 rounded-lg text-[11px] font-bold ${dday.isUrgent ? 'bg-rose-500 text-white' : 'bg-amber-500 text-white'} flex-shrink-0">
                ${c.deadlineDay}일 (${dday.text})
              </span>
              <div class="min-w-0">
                <h5 class="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                  ${escapeContestHtml(c.title)}
                </h5>
                <p class="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  ${escapeContestHtml(c.organizer)} · 🎁 ${escapeContestHtml(c.prize || '공고 참조')}
                </p>
              </div>
            </div>
            <button class="px-2.5 py-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 rounded-lg flex-shrink-0 hover:bg-amber-100 transition">
              상세보기
            </button>
          </div>
        `;
      }).join('');
    }
  }

  if (window.lucide) lucide.createIcons();
}

function scrollToCalendarTimelineDay(day) {
  const el = document.getElementById(`calendarTimelineItem-${day}`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ring-2', 'ring-amber-400');
    setTimeout(() => el.classList.remove('ring-2', 'ring-amber-400'), 1500);
  }
}

// 전역 바인딩
window.openContestCalendarModal = openContestCalendarModal;
window.closeContestCalendarModal = closeContestCalendarModal;
window.changeCalendarMonth = changeCalendarMonth;
window.renderContestCalendar = renderContestCalendar;
window.scrollToCalendarTimelineDay = scrollToCalendarTimelineDay;

