// Civil News Hub Frontend Application

let allArticles = [];
let categories = [];
let activeCategory = 'all';
let isBookmarkView = false;
let searchQuery = '';
let currentSort = 'newest';
let bookmarks = new Set();
let userViews = {};

// 1. 초기화
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadBookmarks();
  loadUserViews();
  setupEventListeners();
  loadNewsData();
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
      // 정적 호스팅(GitHub Pages 등) 환경 대응
      response = await fetch('./data/news.json');
    }
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    allArticles = data.articles || [];
    categories = data.categories || [];
    
    // 마지막 업데이트 및 총 건수 표시
    document.getElementById('lastUpdated').textContent = data.last_updated_display || data.last_updated || '방금 전';
    document.getElementById('totalCount').textContent = `${allArticles.length}건`;
    
    renderCategoryTabs();
    renderArticles();
  } catch (error) {
    console.error('뉴스 데이터 로딩 실패:', error);
    document.getElementById('resultCountNotice').textContent = '데이터를 불러오지 못했습니다. 새로고침을 시도해 보세요.';
  } finally {
    showLoading(false);
  }
}

// 5. 카테고리 탭 렌더링
function renderCategoryTabs() {
  const tabsContainer = document.getElementById('categoryTabs');
  tabsContainer.innerHTML = '';
  
  categories.forEach(cat => {
    // 해당 카테고리 기사 수 계산
    const count = cat.id === 'all' 
      ? allArticles.length 
      : allArticles.filter(a => a.category_id === cat.id).length;
    
    const isActive = !isBookmarkView && activeCategory === cat.id;
    
    const btn = document.createElement('button');
    btn.className = `flex-shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition ${
      isActive
        ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
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
      isBookmarkView = false;
      activeCategory = cat.id;
      renderCategoryTabs();
      updateBookmarkTabStyle();
      renderArticles();
    });
    
    tabsContainer.appendChild(btn);
  });
}

function updateBookmarkTabStyle() {
  const bookmarkBtn = document.getElementById('bookmarkTabBtn');
  if (isBookmarkView) {
    bookmarkBtn.className = 'flex-shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition bg-amber-500 text-white shadow-sm shadow-amber-500/20';
  } else {
    bookmarkBtn.className = 'flex-shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition border border-amber-300 dark:border-amber-900/60 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300 hover:bg-amber-100';
  }
}

// 6. 기사 목록 필터링 및 렌더링
function renderArticles() {
  const grid = document.getElementById('articleGrid');
  const emptyState = document.getElementById('emptyState');
  const notice = document.getElementById('resultCountNotice');
  
  // 필터링 적용
  let filtered = allArticles.filter(article => {
    // 북마크 모드
    if (isBookmarkView) {
      if (!bookmarks.has(article.id)) return false;
    } else {
      // 카테고리 필터
      if (activeCategory !== 'all' && article.category_id !== activeCategory) {
        return false;
      }
    }
    
    // 검색어 필터
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchTitle = article.title.toLowerCase().includes(q);
      const matchSnippet = article.snippet.toLowerCase().includes(q);
      const matchPub = article.publisher.toLowerCase().includes(q);
      if (!matchTitle && !matchSnippet && !matchPub) return false;
    }
    
    return true;
  });
  
  // 정렬 적용
  filtered.sort((a, b) => {
    if (currentSort === 'views') {
      const viewsA = (a.views || 0) + (userViews[a.id] || 0);
      const viewsB = (b.views || 0) + (userViews[b.id] || 0);
      return viewsB - viewsA;
    }
    if (currentSort === 'oldest') {
      return (a.iso_date || '').localeCompare(b.iso_date || '');
    }
    return (b.iso_date || '').localeCompare(a.iso_date || '');
  });
  
  // 카운트 표시
  notice.textContent = `총 ${filtered.length}개의 기사가 표시되었습니다.`;
  
  if (filtered.length === 0) {
    grid.innerHTML = '';
    emptyState.classList.remove('hidden');
    emptyState.classList.add('flex');
    return;
  }
  
  emptyState.classList.add('hidden');
  emptyState.classList.remove('flex');
  
  // 카드 HTML 생성
  grid.innerHTML = filtered.map(article => {
    const isBookmarked = bookmarks.has(article.id);
    const badgeColorClass = `badge-${article.badge_color || 'slate'}`;
    const totalViews = (article.views || 0) + (userViews[article.id] || 0);
    
    return `
      <article class="news-card flex flex-col justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-blue-400 dark:hover:border-blue-500/50">
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
          <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-400 line-clamp-3 leading-relaxed mb-4">
            ${escapeHtml(article.snippet)}
          </p>
        </div>

        <!-- 하단 액션 영역 -->
        <div class="pt-4 mt-auto border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
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
              class="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <i data-lucide="share-2" class="w-4 h-4"></i>
            </button>

            <!-- 북마크 버튼 -->
            <button 
              onclick="toggleBookmark('${article.id}', event)"
              title="${isBookmarked ? '북마크 해제' : '북마크 추가'}"
              class="p-1.5 rounded-lg transition ${
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
  }).join('');
  
  // Lucide 아이콘 새로 렌더링
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
      categories = data.data.categories || [];
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
  const grid = document.getElementById('articleGrid');
  if (show) {
    loading.classList.remove('hidden');
    grid.classList.add('hidden');
  } else {
    loading.classList.add('hidden');
    grid.classList.remove('hidden');
  }
}

// 11. 이벤트 리스너 등록
function setupEventListeners() {
  // 테마 토글
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  
  // 새로고침 버튼
  document.getElementById('refreshBtn').addEventListener('click', triggerRefresh);
  
  // 북마크 탭 버튼
  document.getElementById('bookmarkTabBtn').addEventListener('click', () => {
    isBookmarkView = !isBookmarkView;
    renderCategoryTabs();
    updateBookmarkTabStyle();
    renderArticles();
  });
  
  // 검색어 입력
  const searchInput = document.getElementById('searchInput');
  const clearBtn = document.getElementById('clearSearchBtn');
  
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim();
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
    clearBtn.classList.add('hidden');
    searchInput.focus();
    renderArticles();
  });
  
  // 정렬 셀렉트
  document.getElementById('sortSelect').addEventListener('change', (e) => {
    currentSort = e.target.value;
    renderArticles();
  });
  
  // 빈 상태 리셋 버튼
  document.getElementById('resetFilterBtn').addEventListener('click', () => {
    isBookmarkView = false;
    activeCategory = 'all';
    searchQuery = '';
    searchInput.value = '';
    clearBtn.classList.add('hidden');
    renderCategoryTabs();
    updateBookmarkTabStyle();
    renderArticles();
  });
}

// 12. 유틸리티: HTML 이스케이프
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
