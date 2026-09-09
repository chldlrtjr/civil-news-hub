// Civil News Hub - Civil Engineering Contests & Competitions Dashboard (토목 공모전 허브)

let allContests = [];
let activeCategory = 'ALL';
let activeStatus = 'ALL';
let searchQuery = '';
let sortOption = 'closingSoon'; // closingSoon | latest
let contestBookmarks = new Set();
let isBookmarkView = false;
let currentModalContest = null;

// 1. 초기화
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadBookmarks();
  setupEventListeners();
  loadContestsData();
});

// 테마 관리 (다크모드)
function initTheme() {
  const saved = localStorage.getItem('civil_theme');
  if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('civil_theme', isDark ? 'dark' : 'light');
}

// 북마크 로컬 스토리지
function loadBookmarks() {
  try {
    const saved = localStorage.getItem('civil_contest_bookmarks');
    if (saved) {
      contestBookmarks = new Set(JSON.parse(saved));
    }
  } catch (e) {
    contestBookmarks = new Set();
  }
  updateBookmarkCount();
}

function toggleContestBookmark(contestId, e) {
  if (e) e.stopPropagation();
  if (contestBookmarks.has(contestId)) {
    contestBookmarks.delete(contestId);
    showToast('북마크에서 제거되었습니다.');
  } else {
    contestBookmarks.add(contestId);
    showToast('🏆 공모전이 북마크에 저장되었습니다.');
  }
  localStorage.setItem('civil_contest_bookmarks', JSON.stringify(Array.from(contestBookmarks)));
  updateBookmarkCount();
  updateModalBookmarkState();
  renderContests();
}

function updateBookmarkCount() {
  const countEl = document.getElementById('bookmarkCount');
  if (countEl) countEl.textContent = contestBookmarks.size;
  const mobileBadge = document.getElementById('mobileBookmarkBadge');
  if (mobileBadge) {
    mobileBadge.textContent = contestBookmarks.size;
    if (contestBookmarks.size > 0) {
      mobileBadge.classList.remove('hidden');
    } else {
      mobileBadge.classList.add('hidden');
    }
  }
}

// 2. 공모전 데이터 로드
async function loadContestsData() {
  showLoading(true);
  try {
    let res;
    try {
      res = await fetch('/api/contests');
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
    const updatedEl = document.getElementById('lastUpdatedTime');
    if (updatedEl) updatedEl.textContent = `업데이트: ${data.last_updated_display || '실시간'}`;

    const activeCountBadge = document.getElementById('activeCountBadge');
    if (activeCountBadge) activeCountBadge.textContent = allContests.length;

    updateCategoryCounts();
    renderContests();
  } catch (err) {
    console.error('공모전 데이터 로드 실패:', err);
    showToast('공모전 데이터를 불러오지 못했습니다.');
  } finally {
    showLoading(false);
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
      endDate.setHours(23, 59, 59, 999);
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
      return { text: `D-${diffDays}`, days: diffDays, isUrgent: diffDays <= 7, isClosed: false };
    }
  } catch (e) {
    return { text: statusStr || '접수중', days: 100, isUrgent: false, isClosed: false };
  }
}

// 4. 필터링 및 정렬
function getFilteredContests() {
  let list = [...allContests];

  // 북마크 뷰 필터
  if (isBookmarkView) {
    list = list.filter(c => contestBookmarks.has(c.id));
  }

  // 분야(카테고리) 필터
  if (activeCategory !== 'ALL') {
    list = list.filter(c => c.category === activeCategory);
  }

  // 상태 필터 (접수중 / 접수예정 / 상시접수)
  if (activeStatus !== 'ALL') {
    list = list.filter(c => c.status === activeStatus);
  }

  // 검색어 필터
  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
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

    if (sortOption === 'closingSoon') {
      // 마감임박순: 접수중(D-Day 오름차순) -> 상시접수 -> 접수예정
      return aDday.days - bDday.days;
    } else {
      // 최신등록순
      return (b.id || '').localeCompare(a.id || '');
    }
  });

  return list;
}

// 카테고리 탭 뱃지 카운트 갱신
function updateCategoryCounts() {
  const tabs = document.querySelectorAll('#categoryTabs .cat-pill');
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

// 5. 공모전 카드 렌더링
function renderContests() {
  const grid = document.getElementById('contestCardGrid');
  const emptyState = document.getElementById('emptyState');
  if (!grid || !emptyState) return;

  const filtered = getFilteredContests();

  if (filtered.length === 0) {
    grid.classList.add('hidden');
    emptyState.classList.remove('hidden');
    emptyState.classList.add('flex');
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

    // D-Day 뱃지 스타일
    let ddayBadgeClass = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
    if (ddayInfo.isUrgent) {
      ddayBadgeClass = 'bg-rose-500 text-white font-bold animate-pulse';
    } else if (contest.status === '접수중') {
      ddayBadgeClass = 'bg-blue-600 text-white font-bold';
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
              <span class="text-[11px] px-2 py-0.5 rounded-md font-semibold ${ddayBadgeClass} flex-shrink-0">
                ${ddayInfo.text}
              </span>
            </div>
            <div class="flex items-center gap-1.5 flex-shrink-0">
              <span class="text-[11px] px-2.5 py-0.5 rounded-full font-semibold border ${statusBadgeClass}">
                ${contest.status}
              </span>
              <button 
                onclick="toggleContestBookmark('${contest.id}', event)" 
                class="p-1 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                title="${isBookmarked ? '북마크 해제' : '북마크 저장'}"
              >
                <i data-lucide="bookmark" class="w-4 h-4 ${isBookmarked ? 'fill-amber-500 text-amber-500' : ''}"></i>
              </button>
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

          <a 
            href="${contest.link}" 
            target="_blank" 
            rel="noopener noreferrer" 
            onclick="event.stopPropagation();"
            class="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-amber-500 text-slate-700 hover:text-white dark:bg-slate-800 dark:text-slate-300 dark:hover:text-white transition shadow-xs"
            title="공식 공고 사이트로 이동"
          >
            <span>공식 접수처</span>
            <i data-lucide="external-link" class="w-3 h-3"></i>
          </a>
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

  document.getElementById('modalCategoryBadge').textContent = contest.category || '공모전';
  document.getElementById('modalStatusBadge').textContent = contest.status;
  document.getElementById('modalDdayBadge').textContent = ddayInfo.text;
  document.getElementById('modalTitle').textContent = contest.title;
  document.getElementById('modalOrganizer').textContent = `주최/주관: ${contest.organizer}`;
  document.getElementById('modalPeriod').textContent = contest.period || '공식 공고문 확인';
  document.getElementById('modalPrize').textContent = contest.prize || '공식 공고문 확인';
  document.getElementById('modalTarget').textContent = contest.target || '전국민 누구나 / 관련 분야 전공자 및 기업';
  document.getElementById('modalDescription').textContent = contest.description || '세부 요강 및 제출 양식은 공식 접수처 웹사이트를 참조하시기 바랍니다.';

  const officialLink = document.getElementById('modalOfficialLink');
  if (officialLink) {
    officialLink.href = contest.link;
  }

  updateModalBookmarkState();

  // 모달 표시
  modal.classList.remove('invisible', 'opacity-0');
  modal.querySelector('#contestModalBackdrop').classList.remove('opacity-0');
  if (window.lucide) lucide.createIcons();
}

function closeContestModal() {
  const modal = document.getElementById('contestDetailModal');
  if (!modal) return;
  modal.classList.add('invisible', 'opacity-0');
  currentModalContest = null;
}

function updateModalBookmarkState() {
  if (!currentModalContest) return;
  const btn = document.getElementById('modalBookmarkBtn');
  if (!btn) return;

  const isBookmarked = contestBookmarks.has(currentModalContest.id);
  btn.innerHTML = `
    <i data-lucide="bookmark" class="w-4 h-4 text-amber-500 ${isBookmarked ? 'fill-amber-500' : ''}"></i>
    <span>${isBookmarked ? '북마크 해제' : '북마크 저장'}</span>
  `;
  if (window.lucide) lucide.createIcons();
}

// 7. 이벤트 리스너 설정
function setupEventListeners() {
  // 테마 토글
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }

  // 새로고침 버튼
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      const icon = document.getElementById('refreshIcon');
      if (icon) icon.classList.add('animate-spin');
      loadContestsData().then(() => {
        setTimeout(() => {
          if (icon) icon.classList.remove('animate-spin');
        }, 500);
      });
    });
  }

  // 북마크 탭 토글 버튼 (헤더 및 모바일 하단바)
  const bookmarkTabBtn = document.getElementById('bookmarkTabBtn');
  const mobileBookmarkBtn = document.getElementById('mobileBookmarkBtn');
  
  const handleContestBookmarkToggle = () => {
    isBookmarkView = !isBookmarkView;
    if (bookmarkTabBtn) {
      if (isBookmarkView) {
        bookmarkTabBtn.classList.add('ring-2', 'ring-amber-500', 'bg-amber-100', 'dark:bg-amber-900/60');
      } else {
        bookmarkTabBtn.classList.remove('ring-2', 'ring-amber-500', 'bg-amber-100', 'dark:bg-amber-900/60');
      }
    }
    if (mobileBookmarkBtn) {
      if (isBookmarkView) {
        mobileBookmarkBtn.className = 'relative flex flex-col items-center justify-center py-1 px-3 text-amber-500 font-bold transition cursor-pointer';
      } else {
        mobileBookmarkBtn.className = 'relative flex flex-col items-center justify-center py-1 px-3 text-slate-500 dark:text-slate-400 hover:text-amber-500 dark:hover:text-amber-400 font-medium transition cursor-pointer';
      }
    }
    renderContests();
  };

  if (bookmarkTabBtn) {
    bookmarkTabBtn.addEventListener('click', handleContestBookmarkToggle);
  }
  if (mobileBookmarkBtn) {
    mobileBookmarkBtn.addEventListener('click', handleContestBookmarkToggle);
  }

  // 검색창 입력
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      if (clearSearchBtn) {
        if (searchQuery.trim()) {
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
      searchQuery = '';
      clearSearchBtn.classList.add('hidden');
      renderContests();
    });
  }

  // 상태 필터 버튼 그룹 (전체, 접수중, 접수예정, 상시)
  const statusGroup = document.getElementById('statusFilterGroup');
  if (statusGroup) {
    statusGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.status-pill');
      if (!btn) return;

      statusGroup.querySelectorAll('.status-pill').forEach(b => {
        b.classList.remove('bg-white', 'dark:bg-slate-900', 'shadow-xs', 'text-slate-900', 'dark:text-white', 'font-semibold');
      });
      btn.classList.add('bg-white', 'dark:bg-slate-900', 'shadow-xs', 'text-slate-900', 'dark:text-white', 'font-semibold');

      activeStatus = btn.getAttribute('data-status');
      renderContests();
    });
    // 기본 활성 상태 스타일 지정
    const defaultActive = statusGroup.querySelector('[data-status="ALL"]');
    if (defaultActive) {
      defaultActive.classList.add('bg-white', 'dark:bg-slate-900', 'shadow-xs', 'text-slate-900', 'dark:text-white', 'font-semibold');
    }
  }

  // 정렬 셀렉트
  const sortSelect = document.getElementById('sortSelect');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      sortOption = e.target.value;
      renderContests();
    });
  }

  // 분야(카테고리) 탭
  const categoryTabs = document.getElementById('categoryTabs');
  if (categoryTabs) {
    categoryTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.cat-pill');
      if (!btn) return;

      categoryTabs.querySelectorAll('.cat-pill').forEach(b => {
        b.classList.remove('bg-amber-500', 'text-white', 'font-semibold', 'shadow-sm');
        b.classList.add('text-slate-600', 'dark:text-slate-300');
      });

      btn.classList.add('bg-amber-500', 'text-white', 'font-semibold', 'shadow-sm');
      btn.classList.remove('text-slate-600', 'dark:text-slate-300');

      activeCategory = btn.getAttribute('data-category');
      renderContests();
    });
    // 기본 ALL 탭 스타일
    const allCatTab = categoryTabs.querySelector('[data-category="ALL"]');
    if (allCatTab) {
      allCatTab.classList.add('bg-amber-500', 'text-white', 'font-semibold', 'shadow-sm');
      allCatTab.classList.remove('text-slate-600', 'dark:text-slate-300');
    }
  }

  // 필터 초기화 버튼
  const resetBtn = document.getElementById('resetFilterBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      activeCategory = 'ALL';
      activeStatus = 'ALL';
      searchQuery = '';
      isBookmarkView = false;
      if (searchInput) searchInput.value = '';
      if (clearSearchBtn) clearSearchBtn.classList.add('hidden');
      if (bookmarkTabBtn) bookmarkTabBtn.classList.remove('ring-2', 'ring-amber-500', 'bg-amber-100', 'dark:bg-amber-900/60');

      // 탭 스타일 초기화
      if (categoryTabs) {
        categoryTabs.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('bg-amber-500', 'text-white', 'font-semibold'));
        const allTab = categoryTabs.querySelector('[data-category="ALL"]');
        if (allTab) allTab.classList.add('bg-amber-500', 'text-white', 'font-semibold');
      }

      if (statusGroup) {
        statusGroup.querySelectorAll('.status-pill').forEach(b => b.classList.remove('bg-white', 'dark:bg-slate-900', 'shadow-xs', 'text-slate-900', 'dark:text-white'));
        const allStatus = statusGroup.querySelector('[data-status="ALL"]');
        if (allStatus) allStatus.classList.add('bg-white', 'dark:bg-slate-900', 'shadow-xs', 'text-slate-900', 'dark:text-white');
      }

      renderContests();
    });
  }

  // 모달 닫기
  const closeBtn = document.getElementById('closeContestModalBtn');
  const backdrop = document.getElementById('contestModalBackdrop');
  if (closeBtn) closeBtn.addEventListener('click', closeContestModal);
  if (backdrop) backdrop.addEventListener('click', closeContestModal);

  // 모달 내부 북마크 버튼
  const modalBookmarkBtn = document.getElementById('modalBookmarkBtn');
  if (modalBookmarkBtn) {
    modalBookmarkBtn.addEventListener('click', () => {
      if (currentModalContest) {
        toggleContestBookmark(currentModalContest.id);
      }
    });
  }

  // ESC 키로 모달 닫기
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeContestModal();
  });
}

// 8. 유틸리티 (로딩, 토스트)
function showLoading(isLoading) {
  const loading = document.getElementById('loadingState');
  const grid = document.getElementById('contestCardGrid');
  if (loading && grid) {
    if (isLoading) {
      loading.classList.remove('hidden');
      loading.classList.add('flex');
      grid.classList.add('hidden');
    } else {
      loading.classList.add('hidden');
      loading.classList.remove('flex');
    }
  }
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  const msgEl = document.getElementById('toastMessage');
  if (!toast || !msgEl) return;

  msgEl.textContent = msg;
  toast.classList.remove('translate-y-20', 'opacity-0');
  toast.classList.add('translate-y-0', 'opacity-100');

  setTimeout(() => {
    toast.classList.add('translate-y-20', 'opacity-0');
    toast.classList.remove('translate-y-0', 'opacity-100');
  }, 2500);
}
