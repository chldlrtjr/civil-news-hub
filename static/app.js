// Civil News Hub Frontend Application

let allArticles = [];
let categories = [];
let activeCategory = 'general';
let isBookmarkView = false;
let searchQuery = '';
let currentSort = 'newest'; // 기본 정렬: 최신순 복원
let bookmarks = new Set();
let userViews = {};

// 페이징 (카테고리별 분할: 기본 6개씩 표시 및 개별 더보기)
const CATEGORY_PAGE_SIZE = 6;
let categoryDisplayedCount = {};

// 공모전 상태
let allContests = [];
let activeContestCategory = 'all';
let contestSearchQuery = '';

// 1. 초기화
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadBookmarks();
  loadUserViews();
  setupEventListeners();
  loadNewsData();
  loadContestsData();
});

// 조회수 로컬 스토리지 관리
function loadUserViews() {
  try {
    const saved = localStorage.getItem('civil_user_views');
    if (saved) {
      userViews = JSON.parse(saved);
    }
  } catch (e) {
    userViews = {};
  }
}

function recordView(articleId) {
  if (!userViews[articleId]) {
    userViews[articleId] = 0;
  }
  userViews[articleId] += 1;
  localStorage.setItem('civil_user_views', JSON.stringify(userViews));
  
  // UI의 조회수 엘리먼트 즉시 업데이트
  const viewEl = document.getElementById(`view-count-${articleId}`);
  if (viewEl) {
    const article = allArticles.find(a => a.id === articleId);
    const baseViews = article ? (article.views || 0) : 0;
    viewEl.textContent = (baseViews + userViews[articleId]).toLocaleString();
  }
}

// 2. 테마 설정 (다크/라이트 모드)
function initTheme() {
  const savedTheme = localStorage.getItem('civil_theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  if (savedTheme === 'light') {
    document.documentElement.classList.remove('dark');
  } else if (savedTheme === 'dark' || prefersDark) {
    document.documentElement.classList.add('dark');
  }
}

function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('civil_theme', isDark ? 'dark' : 'light');
}

// 3. 북마크 로컬 스토리지 관리
function loadBookmarks() {
  try {
    const saved = localStorage.getItem('civil_bookmarks');
    if (saved) {
      bookmarks = new Set(JSON.parse(saved));
    }
  } catch (e) {
    bookmarks = new Set();
  }
  updateBookmarkCount();
}

function toggleBookmark(articleId, e) {
  if (e) e.stopPropagation();
  if (bookmarks.has(articleId)) {
    bookmarks.delete(articleId);
    showToast('북마크에서 제거되었습니다.');
  } else {
    bookmarks.add(articleId);
    showToast('⭐ 기사가 북마크에 저장되었습니다.');
  }
  localStorage.setItem('civil_bookmarks', JSON.stringify(Array.from(bookmarks)));
  updateBookmarkCount();
  renderArticles();
}

function updateBookmarkCount() {
  const countEl = document.getElementById('bookmarkCount');
  if (countEl) {
    countEl.textContent = bookmarks.size;
  }
}

// 4. 뉴스 데이터 로드 (API 우선, 실패 시 정적 파일 폴백)
async function loadNewsData() {
  showLoading(true);
  try {
    let response = await fetch('/api/news').catch(() => null);
    if (!response || !response.ok) {
      // 정적 호스팅(GitHub Pages 등) 환경 대응 (캐시 방지 타임스탬프 추가)
      response = await fetch('./data/news.json?t=' + Date.now());
    }
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    allArticles = data.articles || [];
    
    // 카테고리 01 -> 05 순차 정렬 (토목 종합 -> 도로·교량·철도 -> 수자원 -> 터널 -> 스마트건설·정책)
    categories = (data.categories || [])
      .filter(c => c.id !== 'all')
      .slice()
      .sort((a, b) => (CATEGORY_ORDER[a.id] ?? 99) - (CATEGORY_ORDER[b.id] ?? 99));
    
    // 마지막 업데이트 및 총 건수 표시
    const lastUpEl = document.getElementById('lastUpdated');
    if (lastUpEl) lastUpEl.textContent = data.last_updated_display || data.last_updated || '방금 전';
    const totalCountEl = document.getElementById('totalCount');
    if (totalCountEl) totalCountEl.textContent = `${allArticles.length}건`;
    
    renderCategoryTabs();
    renderArticles();
  } catch (error) {
    console.error('뉴스 데이터 로딩 실패:', error);
    const noticeEl = document.getElementById('resultCountNotice');
    if (noticeEl) noticeEl.textContent = '데이터를 불러오지 못했습니다. 새로고침을 시도해 보세요.';
  } finally {
    showLoading(false);
  }
}

// 카테고리 순서: 1위 토목 종합, 2위 도로·교량·철도, 3위 수자원·하천·항만, 4위 터널·지반·안전, 5위 스마트건설·정책
const CATEGORY_ORDER = {
  'general': 1,
  'road_rail': 2,
  'water_port': 3,
  'tunnel_geo': 4,
  'smart_policy': 5
};

const CATEGORY_META = {
  'general': {
    num: '01',
    icon: 'layout-grid',
    badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800'
  },
  'road_rail': {
    num: '02',
    icon: 'route',
    badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
  },
  'water_port': {
    num: '03',
    icon: 'waves',
    badgeClass: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800'
  },
  'tunnel_geo': {
    num: '04',
    icon: 'shield-alert',
    badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800'
  },
  'smart_policy': {
    num: '05',
    icon: 'cpu',
    badgeClass: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
  }
};

function getCategoryDisplayLimit(catId) {
  return categoryDisplayedCount[catId] || CATEGORY_PAGE_SIZE;
}

function loadMoreCategory(catId) {
  categoryDisplayedCount[catId] = getCategoryDisplayLimit(catId) + CATEGORY_PAGE_SIZE;
  renderArticles();
}

function scrollToCategory(catId) {
  if (catId === 'all' || catId === 'top') {
    if (isBookmarkView) {
      isBookmarkView = false;
      updateBookmarkTabStyle();
      renderCategoryTabs();
      renderArticles();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  if (isBookmarkView) {
    isBookmarkView = false;
    updateBookmarkTabStyle();
    renderArticles();
  }

  activeCategory = catId;
  renderCategoryTabs();

  const targetSection = document.getElementById(`category-section-${catId}`);
  if (targetSection) {
    targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// 5. 카테고리 탭 렌더링
function renderCategoryTabs() {
  const tabsContainer = document.getElementById('categoryTabs');
  if (!tabsContainer) return;
  tabsContainer.innerHTML = '';
  
  categories.filter(c => c.id !== 'all').forEach(cat => {
    // 해당 카테고리 기사 수 계산
    const count = allArticles.filter(a => a.category_id === cat.id).length;
    
    const isActive = !isBookmarkView && activeCategory === cat.id;
    
    const btn = document.createElement('button');
    btn.className = `flex-shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition cursor-pointer ${
      isActive
        ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20 ring-2 ring-blue-500/30'
        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
    }`;
    
    btn.innerHTML = `
      <span>${cat.name}</span>
      <span class="text-[10px] px-1.5 py-0.2 rounded-full ${
        isActive
          ? 'bg-blue-800/60 text-white'
          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
      }">${count}</span>
    `;
    
    btn.addEventListener('click', () => {
      scrollToCategory(cat.id);
    });
    
    tabsContainer.appendChild(btn);
  });
}

function updateBookmarkTabStyle() {
  const bookmarkBtn = document.getElementById('bookmarkTabBtn');
  if (!bookmarkBtn) return;
  if (isBookmarkView) {
    bookmarkBtn.className = 'flex-shrink-0 flex items-center px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition bg-amber-500 text-white shadow-sm shadow-amber-500/20 cursor-pointer border border-amber-500';
  } else {
    bookmarkBtn.className = 'flex-shrink-0 flex items-center px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition border border-amber-300/90 dark:border-amber-700/60 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 cursor-pointer shadow-xs';
  }
}

// 검색어 필터링 헬퍼
function filterBySearch(articles) {
  if (!searchQuery) return articles;
  const q = searchQuery.toLowerCase();
  return articles.filter(article => {
    const matchTitle = (article.title || '').toLowerCase().includes(q);
    const matchSnippet = (article.snippet || '').toLowerCase().includes(q);
    const matchPub = (article.publisher || '').toLowerCase().includes(q);
    const matchRelated = (article.related_articles || []).some(rel =>
      (rel.title || '').toLowerCase().includes(q) || (rel.publisher || '').toLowerCase().includes(q)
    );
    return matchTitle || matchSnippet || matchPub || matchRelated;
  });
}

// 정렬 헬퍼
function sortArticlesList(articles) {
  articles.sort((a, b) => {
    if (currentSort === 'views') {
      const viewsA = (a.views || 0) + (userViews[a.id] || 0);
      const viewsB = (b.views || 0) + (userViews[b.id] || 0);
      return viewsB - viewsA;
    }
    if (currentSort === 'oldest') {
      const dateA = a.latest_iso_date || a.iso_date || '';
      const dateB = b.latest_iso_date || b.iso_date || '';
      return dateA.localeCompare(dateB);
    }
    const dateA = a.latest_iso_date || a.iso_date || '';
    const dateB = b.latest_iso_date || b.iso_date || '';
    return dateB.localeCompare(dateA);
  });
}

// 개별 기사 카드 렌더링 헬퍼
function renderArticleCard(article) {
  const isBookmarked = bookmarks.has(article.id);
  const badgeColorClass = `badge-${article.badge_color || 'slate'}`;
  const totalViews = (article.views || 0) + (userViews[article.id] || 0);
  const hasRelated = article.related_articles && article.related_articles.length > 0;
  const relatedCount = hasRelated ? article.related_articles.length : 0;
  
  return `
    <article class="news-card flex flex-col justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-blue-400 dark:hover:border-blue-500/50 transition">
      <div>
        <!-- 상단 메타: 카테고리 뱃지 & 발행일 & 조회수 -->
        <div class="flex items-center justify-between gap-2 mb-3">
          <span class="inline-block px-2.5 py-1 text-xs font-semibold rounded-md border ${badgeColorClass}">
            ${escapeHtml(article.category_name || '토목')}
          </span>
          <div class="flex items-center text-xs text-slate-500 dark:text-slate-400 gap-2.5">
            <span class="flex items-center">
              <i data-lucide="clock" class="w-3.5 h-3.5 mr-1 text-slate-400"></i>
              <span>${escapeHtml(article.relative_date || '최근')}</span>
            </span>
            <span class="flex items-center text-slate-400 dark:text-slate-500 text-[11px]" title="조회수">
              <i data-lucide="eye" class="w-3.5 h-3.5 mr-0.5"></i>
              <span id="view-count-${article.id}">${totalViews.toLocaleString()}</span>회
            </span>
          </div>
        </div>

        <!-- 기사 제목 (클릭 시 새 탭으로 원문 이동 및 조회수 증가) -->
        <h3 class="font-bold text-base text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 leading-snug line-clamp-2 mb-2 transition">
          <a href="${article.link}" target="_blank" rel="noopener noreferrer" onclick="recordView('${article.id}')">
            ${escapeHtml(article.title)}
          </a>
        </h3>

        <!-- 기사 요약 -->
        <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-400 line-clamp-3 leading-relaxed mb-3">
          ${escapeHtml(article.snippet)}
        </p>

        ${hasRelated ? `
        <!-- 중복/관련 보도자료 아코디언 버튼 (조회수 1등 기사가 메인 타이틀) -->
        <div class="mb-3">
          <button 
            type="button"
            onclick="toggleRelatedArticles('${article.id}', event)"
            class="w-full flex items-center justify-between px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/80 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-lg border border-slate-200/80 dark:border-slate-700/80 transition group cursor-pointer"
          >
            <span class="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-semibold">
              <i data-lucide="layers" class="w-3.5 h-3.5"></i>
              <span>같은 내용의 타 언론사 보도 <strong class="text-blue-700 dark:text-blue-300">${relatedCount}건</strong></span>
            </span>
            <span class="flex items-center text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200 text-[11px] gap-1">
              <span id="related-text-${article.id}">모두보기</span>
              <i id="related-icon-${article.id}" data-lucide="chevron-down" class="w-3.5 h-3.5 transition-transform duration-200"></i>
            </span>
          </button>

          <!-- 펼쳐지는 타 언론사 기사 목록 (최신순 정렬) -->
          <div id="related-list-${article.id}" class="hidden space-y-1.5 mt-2 max-h-52 overflow-y-auto pr-1">
            ${(article.related_articles || []).slice().sort((r1, r2) => (r2.iso_date || r2.published_at || '').localeCompare(r1.iso_date || r1.published_at || '')).map(rel => `
              <div class="flex items-start justify-between gap-2 p-2 rounded-lg bg-slate-50/90 dark:bg-slate-800/50 hover:bg-blue-50/50 dark:hover:bg-slate-800 border border-slate-100 dark:border-slate-800/90 transition">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-1.5 mb-0.5">
                    <span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200 truncate max-w-[100px]">
                      ${escapeHtml(rel.publisher)}
                    </span>
                    <span class="text-[10px] text-slate-400 dark:text-slate-500">${escapeHtml(rel.relative_date || '')}</span>
                  </div>
                  <a href="${rel.link}" target="_blank" rel="noopener noreferrer" onclick="recordView('${rel.id}')" class="text-xs text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 line-clamp-1 block transition font-normal">
                    ${escapeHtml(rel.title)}
                  </a>
                </div>
                <a href="${rel.link}" target="_blank" rel="noopener noreferrer" onclick="recordView('${rel.id}')" class="flex-shrink-0 p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition" title="원문 보기">
                  <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                </a>
              </div>
            `).join('')}
          </div>
        </div>
        ` : ''}
      </div>

      <!-- 하단 액션 영역 -->
      <div class="pt-3 mt-auto border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
        <!-- 언론사 정보 -->
        <span class="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1 truncate max-w-[120px] sm:max-w-[140px]">
          <i data-lucide="building" class="w-3.5 h-3.5 flex-shrink-0 text-slate-400"></i>
          <span class="truncate">${escapeHtml(article.publisher)}</span>
        </span>

        <!-- 액션 버튼들 -->
        <div class="flex items-center gap-1.5">
          <!-- 링크 복사 버튼 -->
          <button 
            onclick="copyArticleLink('${encodeURIComponent(article.link)}', event)"
            title="기사 링크 복사"
            class="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <i data-lucide="share-2" class="w-4 h-4"></i>
          </button>

          <!-- 북마크 버튼 -->
          <button 
            onclick="toggleBookmark('${article.id}', event)"
            title="${isBookmarked ? '북마크 해제' : '북마크 추가'}"
            class="p-1.5 rounded-lg transition cursor-pointer ${
              isBookmarked 
                ? 'text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40' 
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }"
          >
            <i data-lucide="star" class="w-4 h-4 ${isBookmarked ? 'fill-amber-400' : ''}"></i>
          </button>

          <!-- 원문 보러가기 버튼 (클릭 시 조회수 증가) -->
          <a 
            href="${article.link}" 
            target="_blank" 
            rel="noopener noreferrer"
            onclick="recordView('${article.id}')"
            class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-600 dark:hover:text-white transition"
          >
            <span>원문</span>
            <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
          </a>
        </div>
      </div>
    </article>
  `;
}

// 6. 카테고리별 섹션 분할 및 12개씩 렌더링 (1, 2, 3 분할 뷰)
function renderArticles() {
  const container = document.getElementById('categorySectionsContainer');
  const emptyState = document.getElementById('emptyState');
  const notice = document.getElementById('resultCountNotice');
  if (!container) return;

  // 1. 북마크 모드
  if (isBookmarkView) {
    const bookmarkedArticles = allArticles.filter(a => bookmarks.has(a.id));
    const filteredBookmarks = filterBySearch(bookmarkedArticles);
    sortArticlesList(filteredBookmarks);

    if (filteredBookmarks.length === 0) {
      container.innerHTML = '';
      emptyState.classList.remove('hidden');
      emptyState.classList.add('flex');
      if (notice) notice.textContent = '북마크된 기사가 없습니다.';
      return;
    }

    emptyState.classList.add('hidden');
    emptyState.classList.remove('flex');
    if (notice) notice.textContent = `⭐ 북마크 기사 총 ${filteredBookmarks.length}건`;

    container.innerHTML = `
      <section class="bg-white dark:bg-slate-900/80 border border-amber-200 dark:border-amber-900/60 rounded-2xl sm:rounded-3xl p-5 sm:p-7 shadow-xs">
        <div class="flex items-center justify-between pb-4 mb-5 border-b border-amber-100 dark:border-amber-900/40">
          <div class="flex items-center gap-2.5">
            <span class="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center font-bold">
              <i data-lucide="star" class="w-4 h-4 fill-amber-400"></i>
            </span>
            <h3 class="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              저장한 북마크 기사
              <span class="text-xs px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-semibold border border-amber-200 dark:border-amber-900">
                ${filteredBookmarks.length}건
              </span>
            </h3>
          </div>
          <button onclick="scrollToCategory('all')" class="text-xs text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 flex items-center gap-1 cursor-pointer">
            전체 기사로 돌아가기
          </button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          ${filteredBookmarks.map(renderArticleCard).join('')}
        </div>
      </section>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  // 2. 카테고리별 섹션 분할 렌더링 (1, 2, 3... 분할 뷰)
  const targetCategories = categories.filter(c => c.id !== 'all');
  let totalMatchingCount = 0;
  let totalWithDupsCount = 0;
  let sectionsHtml = '';

  targetCategories.forEach((cat, idx) => {
    // 해당 카테고리 기사 가져오기
    let catArticles = allArticles.filter(a => a.category_id === cat.id);
    catArticles = filterBySearch(catArticles);
    sortArticlesList(catArticles);

    const catCount = catArticles.length;
    if (catCount === 0) return;

    totalMatchingCount += catCount;
    totalWithDupsCount += catArticles.reduce((acc, a) => acc + 1 + (a.related_articles ? a.related_articles.length : 0), 0);

    // 6개 단위 페이징
    const limit = getCategoryDisplayLimit(cat.id);
    const visibleArticles = catArticles.slice(0, limit);
    const hasMore = catCount > limit;
    const remaining = catCount - limit;

    const meta = CATEGORY_META[cat.id] || {
      num: String(idx + 1).padStart(2, '0'),
      icon: 'newspaper',
      badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700'
    };

    sectionsHtml += `
      <section 
        id="category-section-${cat.id}" 
        class="scroll-mt-32 sm:scroll-mt-36 bg-white dark:bg-slate-900/60 border border-slate-200/90 dark:border-slate-800 rounded-2xl sm:rounded-3xl p-5 sm:p-7 shadow-xs hover:border-slate-300 dark:hover:border-slate-700/80 transition-colors"
      >
        <!-- 섹션 헤더 (1, 2, 3 구분) -->
        <div class="flex items-center justify-between pb-3.5 sm:pb-4 mb-5 border-b border-slate-100 dark:border-slate-800">
          <div class="flex items-center gap-2.5 sm:gap-3">
            <span class="flex-shrink-0 flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-xl font-bold text-xs sm:text-sm ${meta.badgeClass} border">
              ${meta.num}
            </span>
            <div class="flex items-center gap-2">
              <i data-lucide="${meta.icon}" class="w-4 h-4 text-slate-500 dark:text-slate-400"></i>
              <h3 class="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                ${cat.name}
              </h3>
              <span class="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold border border-slate-200/80 dark:border-slate-700">
                ${catCount}건
              </span>
            </div>
          </div>
        </div>

        <!-- 6개 기사 카드 그리드 -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          ${visibleArticles.map(renderArticleCard).join('')}
        </div>

        <!-- 섹션 하단 영역 (더보기 버튼 중앙 + 상단으로 퀵버튼 오른쪽 아래 배치) -->
        <div class="relative pt-6 sm:pt-7 mt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4">
          <!-- 좌측 여백 균형용 빈 영역 -->
          <div class="hidden sm:block w-28 flex-shrink-0"></div>

          <!-- 중앙 영역 (기사 더보기 버튼) -->
          <div class="flex flex-col items-center justify-center text-center flex-1">
            ${hasMore ? `
              <button 
                onclick="loadMoreCategory('${cat.id}')"
                class="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 text-blue-600 dark:text-blue-400 font-semibold text-xs sm:text-sm border border-slate-200 dark:border-slate-700 shadow-sm transition active:scale-95 cursor-pointer"
              >
                <i data-lucide="chevron-down" class="w-4 h-4"></i>
                <span>${cat.name} 기사 더보기 (+${Math.min(CATEGORY_PAGE_SIZE, remaining)}개)</span>
              </button>
              <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
                ${catCount}개 중 ${visibleArticles.length}개 표시 중
              </p>
            ` : (catCount > CATEGORY_PAGE_SIZE ? `
              <p class="text-xs text-slate-400 dark:text-slate-500">
                모든 ${catCount}개의 기사를 불러왔습니다.
              </p>
            ` : `
              <p class="text-[11px] text-slate-400 dark:text-slate-500">
                총 ${catCount}개의 기사
              </p>
            `)}
          </div>

          <!-- 우측 영역: 상단으로 버튼 (오른쪽 아래 배치) -->
          <div class="w-full sm:w-28 flex justify-end flex-shrink-0">
            <button 
              onclick="scrollToCategory('top')" 
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-300 bg-slate-50 dark:bg-slate-800/90 hover:bg-blue-50 dark:hover:bg-slate-700 border border-slate-200/90 dark:border-slate-700/80 shadow-xs transition active:scale-95 cursor-pointer"
              title="상단 카테고리로 이동"
            >
              <i data-lucide="arrow-up" class="w-3.5 h-3.5"></i>
              <span>상단으로</span>
            </button>
          </div>
        </div>
      </section>
    `;
  });

  if (totalMatchingCount === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    emptyState.classList.add('flex');
    if (notice) notice.textContent = '검색된 기사가 없습니다.';
    return;
  }

  emptyState.classList.add('hidden');
  emptyState.classList.remove('flex');

  if (notice) {
    if (totalWithDupsCount > totalMatchingCount) {
      notice.textContent = `주요 토픽 ${totalMatchingCount}개 (타 언론사 중복 보도 포함 총 ${totalWithDupsCount}건)`;
    } else {
      notice.textContent = `총 ${totalMatchingCount}개의 기사가 준비되어 있습니다.`;
    }
  }

  container.innerHTML = sectionsHtml;
  if (window.lucide) window.lucide.createIcons();
}

// 중복/관련 기사 아코디언 토글 함수
function toggleRelatedArticles(articleId, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const list = document.getElementById(`related-list-${articleId}`);
  const icon = document.getElementById(`related-icon-${articleId}`);
  const text = document.getElementById(`related-text-${articleId}`);
  if (!list) return;

  const isHidden = list.classList.contains('hidden');
  if (isHidden) {
    list.classList.remove('hidden');
    if (icon) icon.classList.add('rotate-180');
    if (text) text.textContent = '접기';
  } else {
    list.classList.add('hidden');
    if (icon) icon.classList.remove('rotate-180');
    if (text) text.textContent = '모두보기';
  }
  if (window.lucide) {
    window.lucide.createIcons();
  }
}


// 7. 실시간 기사 재수집 (새로고침 버튼)
async function triggerRefresh() {
  const btn = document.getElementById('refreshBtn');
  const icon = document.getElementById('refreshIcon');
  
  btn.disabled = true;
  btn.classList.add('opacity-70');
  icon.classList.add('animate-spin-fast');
  showToast('🔄 최신 토목 기사를 수집하고 있습니다...');
  
  try {
    const res = await fetch('/api/refresh', { method: 'POST' });
    const data = await res.json();
    
    if (data.success && data.data) {
      allArticles = data.data.articles || [];
      categories = (data.data.categories || [])
        .filter(c => c.id !== 'all')
        .slice()
        .sort((a, b) => (CATEGORY_ORDER[a.id] ?? 99) - (CATEGORY_ORDER[b.id] ?? 99));
      document.getElementById('lastUpdated').textContent = data.data.last_updated_display || '방금 전';
      document.getElementById('totalCount').textContent = `${allArticles.length}건`;
      
      renderCategoryTabs();
      renderArticles();
      showToast('✅ 최신 기사 수집이 완료되었습니다!');
    } else {
      throw new Error(data.error || '수집 실패');
    }
  } catch (err) {
    console.error('새로고침 실패:', err);
    showToast('⚠️ 새로고침 중 오류가 발생했습니다.');
  } finally {
    btn.disabled = false;
    btn.classList.remove('opacity-70');
    icon.classList.remove('animate-spin-fast');
  }
}

// 8. 링크 복사
function copyArticleLink(encodedUrl, e) {
  if (e) e.stopPropagation();
  const url = decodeURIComponent(encodedUrl);
  navigator.clipboard.writeText(url).then(() => {
    showToast('📋 기사 링크가 복사되었습니다.');
  }).catch(() => {
    prompt('기사 링크:', url);
  });
}

// 9. 토스트 메시지
let toastTimer = null;
function showToast(message) {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMessage');
  toastMsg.textContent = message;
  
  toast.classList.remove('translate-y-20', 'opacity-0');
  toast.classList.add('translate-y-0', 'opacity-100');
  
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('translate-y-0', 'opacity-100');
    toast.classList.add('translate-y-20', 'opacity-0');
  }, 2500);
}

// 10. 로딩 상태 제어
function showLoading(show) {
  const loading = document.getElementById('loadingIndicator');
  const container = document.getElementById('categorySectionsContainer');
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
function setupEventListeners() {
  // 테마 토글
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) themeToggle.addEventListener('click', toggleTheme);
  
  // 새로고침 버튼
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) refreshBtn.addEventListener('click', triggerRefresh);
  
  // 북마크 탭 버튼
  const bookmarkTabBtn = document.getElementById('bookmarkTabBtn');
  if (bookmarkTabBtn) {
    bookmarkTabBtn.addEventListener('click', () => {
      isBookmarkView = !isBookmarkView;
      categoryDisplayedCount = {};
      renderCategoryTabs();
      updateBookmarkTabStyle();
      renderArticles();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
  
  // 검색어 입력
  const searchInput = document.getElementById('searchInput');
  const clearBtn = document.getElementById('clearSearchBtn');
  
  if (searchInput && clearBtn) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim();
      categoryDisplayedCount = {};
      if (searchQuery) {
        clearBtn.classList.remove('hidden');
      } else {
        clearBtn.classList.add('hidden');
      }
      renderArticles();
    });
    
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      searchQuery = '';
      categoryDisplayedCount = {};
      clearBtn.classList.add('hidden');
      searchInput.focus();
      renderArticles();
    });
  }
  
  // 정렬 셀렉트
  const sortSelect = document.getElementById('sortSelect');
  if (sortSelect) {
    sortSelect.value = currentSort;
    sortSelect.addEventListener('change', (e) => {
      currentSort = e.target.value;
      categoryDisplayedCount = {};
      renderArticles();
    });
  }
  
  // 빈 상태 리셋 버튼
  const resetFilterBtn = document.getElementById('resetFilterBtn');
  if (resetFilterBtn) {
    resetFilterBtn.addEventListener('click', () => {
      isBookmarkView = false;
      activeCategory = 'general';
      searchQuery = '';
      if (searchInput) searchInput.value = '';
      currentSort = 'newest';
      if (sortSelect) sortSelect.value = 'newest';
      categoryDisplayedCount = {};
      if (clearBtn) clearBtn.classList.add('hidden');
      renderCategoryTabs();
      updateBookmarkTabStyle();
      renderArticles();
    });
  }

  // 공모전 레이어 이벤트 리스너
  const openContestBtn = document.getElementById('openContestBtn');
  if (openContestBtn) {
    openContestBtn.addEventListener('click', openContestLayer);
  }

  const closeContestBtn = document.getElementById('closeContestBtn');
  if (closeContestBtn) {
    closeContestBtn.addEventListener('click', closeContestLayer);
  }

  const closeContestBottomBtn = document.getElementById('closeContestBottomBtn');
  if (closeContestBottomBtn) {
    closeContestBottomBtn.addEventListener('click', closeContestLayer);
  }

  const contestBackdrop = document.getElementById('contestBackdrop');
  if (contestBackdrop) {
    contestBackdrop.addEventListener('click', closeContestLayer);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeContestLayer();
    }
  });

  const contestSearchInput = document.getElementById('contestSearchInput');
  if (contestSearchInput) {
    contestSearchInput.addEventListener('input', (e) => {
      contestSearchQuery = e.target.value.trim();
      renderContests();
    });
  }
}

// 12. 공모전 데이터 로드 및 레이어 인터랙션
async function loadContestsData() {
  try {
    let res = await fetch('/api/contests').catch(() => null);
    if (!res || !res.ok) {
      res = await fetch('./data/contests.json?t=' + Date.now());
    }
    if (!res.ok) return;
    const data = await res.json();
    // 접수마감된 공모전은 서비스에서 즉시 내림(제외) 처리
    allContests = (data.contests || []).filter(c => c.status !== '접수마감');
    
    // 버튼 뱃지 업데이트
    const countBadge = document.getElementById('contestBtnCount');
    if (countBadge) {
      countBadge.textContent = `${allContests.length}건`;
    }
    const lastUp = document.getElementById('contestLastUpdated');
    if (lastUp) {
      lastUp.textContent = `최근 업데이트: ${data.last_updated_display || '실시간'}`;
    }
  } catch (err) {
    console.error('공모전 데이터 로드 실패:', err);
  }
}

function openContestLayer() {
  const layer = document.getElementById('contestLayer');
  const content = document.getElementById('contestContent');
  if (!layer || !content) return;

  layer.classList.remove('invisible', 'opacity-0');
  layer.classList.add('visible', 'opacity-100');
  
  content.classList.remove('translate-y-full', 'sm:translate-y-8', 'sm:scale-95');
  content.classList.add('translate-y-0', 'sm:translate-y-0', 'sm:scale-100');
  document.body.style.overflow = 'hidden';

  renderContestCategories();
  renderContests();
  if (window.lucide) window.lucide.createIcons();
}

function closeContestLayer() {
  const layer = document.getElementById('contestLayer');
  const content = document.getElementById('contestContent');
  if (!layer || !content) return;

  content.classList.remove('translate-y-0', 'sm:translate-y-0', 'sm:scale-100');
  content.classList.add('translate-y-full', 'sm:translate-y-8', 'sm:scale-95');
  
  layer.classList.remove('visible', 'opacity-100');
  layer.classList.add('invisible', 'opacity-0');
  document.body.style.overflow = '';
}

function renderContestCategories() {
  const container = document.getElementById('contestCategoryFilter');
  if (!container) return;

  const categories = [
    { id: 'all', name: '전체' },
    { id: '스마트·기술', name: '스마트·기술' },
    { id: '도로·디자인', name: '도로·디자인' },
    { id: '수자원·환경', name: '수자원·환경' },
    { id: '지반·안전', name: '지반·안전' },
    { id: '학회·대학생', name: '학회·대학생' }
  ];

  container.innerHTML = categories.map(cat => {
    const isActive = activeContestCategory === cat.id;
    const count = cat.id === 'all' 
      ? allContests.length 
      : allContests.filter(c => c.category === cat.id).length;

    return `
      <button 
        onclick="selectContestCategory('${cat.id}')"
        class="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
          isActive 
            ? 'bg-blue-600 text-white shadow-sm' 
            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
        }"
      >
        <span>${cat.name}</span>
        <span class="text-[10px] px-1.5 py-0.2 rounded-full ${
          isActive ? 'bg-blue-800 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
        }">${count}</span>
      </button>
    `;
  }).join('');
}

function selectContestCategory(catId) {
  activeContestCategory = catId;
  renderContestCategories();
  renderContests();
}

function renderContests() {
  const grid = document.getElementById('contestGrid');
  const emptyState = document.getElementById('contestEmptyState');
  if (!grid) return;

  let filtered = allContests.filter(contest => {
    if (activeContestCategory !== 'all' && contest.category !== activeContestCategory) {
      return false;
    }
    if (contestSearchQuery) {
      const q = contestSearchQuery.toLowerCase();
      const matchTitle = (contest.title || '').toLowerCase().includes(q);
      const matchOrg = (contest.organizer || '').toLowerCase().includes(q);
      const matchDesc = (contest.description || '').toLowerCase().includes(q);
      if (!matchTitle && !matchOrg && !matchDesc) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    grid.innerHTML = '';
    emptyState.classList.remove('hidden');
    emptyState.classList.add('flex');
    return;
  }

  emptyState.classList.add('hidden');
  emptyState.classList.remove('flex');

  grid.innerHTML = filtered.map(c => {
    const badgeColor = `badge-${c.badge_color || 'blue'}`;
    const statusColor = c.status === '접수중' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
      : c.status === '상시접수' ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-300 dark:border-purple-800'
      : c.status === '접수마감' ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-300 dark:border-slate-700'
      : 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300 dark:border-blue-800';

    return `
      <div class="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 sm:p-5 flex flex-col justify-between hover:border-blue-400 dark:hover:border-blue-500 transition shadow-sm hover:shadow-md">
        <div>
          <!-- 상단 헤더: 카테고리 (좌) & 접수 상태 (우측 상단 고정) -->
          <div class="flex items-center justify-between gap-2 mb-2">
            <span class="inline-block px-2.5 py-0.5 text-[11px] font-semibold rounded-md border ${badgeColor} flex-shrink-0">
              ${escapeHtml(c.category || '토목·일반')}
            </span>
            <span class="inline-block px-2.5 py-0.5 text-[10.5px] sm:text-[11px] font-bold rounded-full border ${statusColor} flex-shrink-0">
              ${escapeHtml(c.status || '진행중')}
            </span>
          </div>

          <!-- 접수 기간 안내 -->
          ${c.period ? `
            <div class="mb-2.5">
              <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[10.5px] sm:text-[11px] font-medium border border-slate-200 dark:border-slate-700" title="접수기간: ${escapeHtml(c.period)}">
                <i data-lucide="calendar" class="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 flex-shrink-0"></i>
                <span class="text-slate-500 dark:text-slate-400 font-normal">접수기간:</span>
                <span class="font-bold text-slate-800 dark:text-slate-100">${escapeHtml(c.period)}</span>
              </span>
            </div>
          ` : ''}

          <!-- 공모전 제목 -->
          <h3 class="font-bold text-sm sm:text-base text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 leading-snug mb-2 line-clamp-2 transition">
            <a href="${c.link}" target="_blank" rel="noopener noreferrer">
              ${escapeHtml(c.title)}
            </a>
          </h3>

          <!-- 주관기관 -->
          <div class="flex items-center text-xs text-slate-500 dark:text-slate-400 mb-2 gap-1">
            <i data-lucide="building-2" class="w-3.5 h-3.5 text-slate-400 flex-shrink-0"></i>
            <span class="font-medium truncate">${escapeHtml(c.organizer)}</span>
          </div>

          <!-- 요약 설명 -->
          <p class="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 mb-3 leading-relaxed">
            ${escapeHtml(c.description || '')}
          </p>
        </div>

        <!-- 하단 정보 & 액션 버튼 -->
        <div class="pt-3 mt-auto border-t border-slate-100 dark:border-slate-700/80 flex items-center justify-between gap-2">
          <!-- 상금/혜택 정보 -->
          <div class="text-[11px] font-semibold text-amber-600 dark:text-amber-400 truncate max-w-[170px] sm:max-w-[200px]" title="${escapeHtml(c.prize)}">
            <i data-lucide="gift" class="w-3 h-3 inline mr-1"></i>${escapeHtml(c.prize)}
          </div>

          <!-- 공고 바로가기 버튼 -->
          <a 
            href="${c.link}" 
            target="_blank" 
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-sm transition active:scale-95"
          >
            <span>공고문</span>
            <i data-lucide="external-link" class="w-3 h-3"></i>
          </a>
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();
}

// 13. 유틸리티: HTML 이스케이프
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
