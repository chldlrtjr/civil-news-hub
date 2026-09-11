// Civil News Hub Frontend Application (SPA Master Controller & News Dashboard)

// PWA Service Worker 등록
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      // console.log('[SW] Registered successfully:', reg.scope);
    }).catch((err) => {
      console.warn('[SW] Registration failed:', err);
    });
  });
}

// 1. 상태 변수
let currentMainTab = 'news'; // 'news' | 'jobs' | 'contests' | 'mypage'

// 뉴스 데이터 상태
let allArticles = [];
let categories = [];
let activeNewsCategory = 'all';
let isNewsBookmarkView = false;
window.isGlobalBookmarkMode = false;
let newsSearchQuery = '';
let currentNewsSort = 'newest';
let newsBookmarks = new Set();
let userViews = {};

// 신규 기능: 읽음 상태, 북마크 개인 메모, 키워드 칩 필터
let readArticles = new Set();
let bookmarkNotes = {};
let activeKeywordFilter = '전체';
let currentEditingNoteItemId = null;

let newsKeywordChips = [
  '전체', '스마트건설', '지하안전', 'GTX', '수자원', '철도망', '신기술'
];

// 페이징 (카테고리별 초기 6개 표시, 검색/키워드 결과 초기 12개 표시)
const CATEGORY_PAGE_SIZE = 6;
const SEARCH_PAGE_SIZE = 12;
let categoryDisplayedCount = {};
let searchDisplayedCount = SEARCH_PAGE_SIZE;

// 가벼운 디바운스 유틸리티 (입력 렉 원천 차단)
function debounce(func, wait = 180) {
  let timeout;
  return function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}
window.civilDebounce = debounce;

// Lucide 아이콘 안전 렌더링 헬퍼 (예외 방지 및 안전 처리)
function safeCreateIcons() {
  if (typeof window.lucide !== 'undefined' && typeof window.lucide.createIcons === 'function') {
    try {
      window.lucide.createIcons();
    } catch (e) {
      console.warn('Lucide icon render error:', e);
    }
  }
}
window.safeCreateIcons = safeCreateIcons;

// 2. 초기화
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadNewsBookmarks();
  loadReadArticles();
  loadBookmarkNotes();
  loadUserViews();
  setupNewsEventListeners();
  renderNewsKeywordChips();
  loadNewsData();
  initTabRouting();
});

// 기사 읽음(Read) 상태 관리
function loadReadArticles() {
  try {
    const saved = localStorage.getItem('civil_read_articles');
    if (saved) {
      readArticles = new Set(JSON.parse(saved));
    }
  } catch (e) {
    readArticles = new Set();
  }
  window.readArticles = readArticles;
}

function markArticleAsRead(articleId) {
  if (!articleId) return;
  if (!readArticles.has(articleId)) {
    readArticles.add(articleId);
    localStorage.setItem('civil_read_articles', JSON.stringify(Array.from(readArticles)));
    window.readArticles = readArticles;
    // DOM 실시간 갱신
    const card = document.querySelector(`article[data-article-id="${articleId}"]`);
    if (card) {
      const titleLink = card.querySelector('h3 a');
      if (titleLink) {
        titleLink.classList.remove('font-extrabold', 'text-slate-900', 'dark:text-slate-100');
        titleLink.classList.add('font-bold', 'text-slate-600', 'dark:text-slate-400');
      }
      const readBtn = card.querySelector('.read-status-btn');
      if (readBtn) {
        readBtn.className = 'read-status-btn inline-flex items-center text-[11px] px-2 py-0.5 rounded-md font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 cursor-pointer transition hover:opacity-80';
        readBtn.innerHTML = '<i data-lucide="check" class="w-3 h-3 mr-0.5"></i>읽음';
        safeCreateIcons(readBtn);
      }
    }
  }
}
window.markArticleAsRead = markArticleAsRead;

window.toggleArticleRead = function(articleId, e) {
  if (e) e.stopPropagation();
  if (readArticles.has(articleId)) {
    readArticles.delete(articleId);
    showToast('기사를 읽지 않음으로 변경했습니다.');
  } else {
    readArticles.add(articleId);
    showToast('✓ 기사를 읽음으로 표시했습니다.');
  }
  localStorage.setItem('civil_read_articles', JSON.stringify(Array.from(readArticles)));
  window.readArticles = readArticles;
  renderArticles();
  if (currentMainTab === 'mypage') renderMyPage();
};

// 북마크 개인 한 줄 메모 관리
function loadBookmarkNotes() {
  try {
    const saved = localStorage.getItem('civil_bookmark_notes');
    if (saved) {
      bookmarkNotes = JSON.parse(saved);
    }
  } catch (e) {
    bookmarkNotes = {};
  }
  window.bookmarkNotes = bookmarkNotes;
}

window.openBookmarkNoteModal = function(itemId, itemTitle) {
  currentEditingNoteItemId = itemId;
  const modal = document.getElementById('bookmarkNoteModal');
  const titleEl = document.getElementById('noteModalItemTitle');
  const textarea = document.getElementById('bookmarkNoteText');
  const charCount = document.getElementById('noteCharCount');
  const deleteBtn = document.getElementById('deleteNoteBtn');

  if (titleEl) titleEl.textContent = itemTitle || '항목 제목';
  const existingNote = (bookmarkNotes && bookmarkNotes[itemId]) || '';
  if (textarea) {
    textarea.value = existingNote;
    if (charCount) charCount.textContent = `${existingNote.length}/200`;
  }
  if (deleteBtn) {
    deleteBtn.classList.toggle('hidden', !existingNote);
  }

  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (textarea) {
      setTimeout(() => textarea.focus(), 50);
    }
  }
};

window.closeBookmarkNoteModal = function() {
  const modal = document.getElementById('bookmarkNoteModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
  currentEditingNoteItemId = null;
};

window.saveCurrentBookmarkNote = function() {
  if (!currentEditingNoteItemId) return;
  const textarea = document.getElementById('bookmarkNoteText');
  const noteText = textarea ? textarea.value.trim() : '';
  if (noteText) {
    bookmarkNotes[currentEditingNoteItemId] = noteText;
    showToast('✏️ 개인 메모가 저장되었습니다.');
  } else {
    delete bookmarkNotes[currentEditingNoteItemId];
    showToast('메모가 삭제되었습니다.');
  }
  localStorage.setItem('civil_bookmark_notes', JSON.stringify(bookmarkNotes));
  window.bookmarkNotes = bookmarkNotes;
  closeBookmarkNoteModal();
  if (currentMainTab === 'mypage') renderMyPage();
  else renderArticles();
};

window.deleteCurrentBookmarkNote = function() {
  if (!currentEditingNoteItemId) return;
  delete bookmarkNotes[currentEditingNoteItemId];
  localStorage.setItem('civil_bookmark_notes', JSON.stringify(bookmarkNotes));
  window.bookmarkNotes = bookmarkNotes;
  closeBookmarkNoteModal();
  showToast('메모가 삭제되었습니다.');
  if (currentMainTab === 'mypage') renderMyPage();
  else renderArticles();
};

window.quickDeleteBookmarkNote = function(itemId) {
  if (!itemId) return;
  delete bookmarkNotes[itemId];
  localStorage.setItem('civil_bookmark_notes', JSON.stringify(bookmarkNotes));
  window.bookmarkNotes = bookmarkNotes;
  showToast('메모가 삭제되었습니다.');
  if (currentMainTab === 'mypage') renderMyPage();
  else renderArticles();
};

// 북마크 메모 HTML 렌더러 (마이페이지 및 카드 공용)
function renderBookmarkNoteRow(itemId, itemTitle) {
  const note = (bookmarkNotes && bookmarkNotes[itemId]) || '';
  const escapedTitle = (itemTitle || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
  
  if (note) {
    return `
      <div class="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs gap-2" onclick="event.stopPropagation()">
        <div class="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 bg-amber-50/90 dark:bg-amber-950/40 px-3 py-1.5 rounded-xl border border-amber-200/80 dark:border-amber-900/60 flex-1 min-w-0" title="${escapeHtml(note)}">
          <span class="text-amber-700 dark:text-amber-400 font-bold flex-shrink-0 flex items-center gap-1">
            <i data-lucide="file-edit" class="w-3.5 h-3.5"></i>
            <span>메모:</span>
          </span>
          <span class="truncate font-medium">${escapeHtml(note)}</span>
        </div>
        <div class="flex items-center gap-1 flex-shrink-0">
          <button type="button" onclick="openBookmarkNoteModal('${itemId}', '${escapedTitle}')" class="px-2.5 py-1 text-slate-600 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400 font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition cursor-pointer">
            수정
          </button>
          <button type="button" onclick="quickDeleteBookmarkNote('${itemId}')" class="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg transition cursor-pointer" title="메모 삭제">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
    `;
  }

  // 마이페이지에서는 항상 메모 추가 버튼 노출
  if (currentMainTab === 'mypage') {
    return `
      <div class="mt-3.5 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs" onclick="event.stopPropagation()">
        <button type="button" onclick="openBookmarkNoteModal('${itemId}', '${escapedTitle}')" class="text-xs text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 flex items-center gap-1.5 font-medium transition py-1 cursor-pointer">
          <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
          <span>나만의 한 줄 메모 추가</span>
        </button>
      </div>
    `;
  }

  return '';
}
window.renderBookmarkNoteRow = renderBookmarkNoteRow;

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
  
  const viewEl = document.getElementById(`view-count-${articleId}`);
  if (viewEl) {
    const article = allArticles.find(a => a.id === articleId);
    const baseViews = article ? (article.views || 0) : 0;
    viewEl.textContent = (baseViews + userViews[articleId]).toLocaleString();
  }
}

// 3. 테마 설정 (다크/라이트 모드)
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

// 4. 뉴스 북마크 관리
function loadNewsBookmarks() {
  try {
    const saved = localStorage.getItem('civil_bookmarks');
    if (saved) {
      newsBookmarks = new Set(JSON.parse(saved));
    }
  } catch (e) {
    newsBookmarks = new Set();
  }
  window.newsBookmarks = newsBookmarks;
  updateGlobalBookmarkCount();
}

function toggleBookmark(articleId, e) {
  if (e) e.stopPropagation();
  if (newsBookmarks.has(articleId)) {
    newsBookmarks.delete(articleId);
    showToast('북마크에서 제거되었습니다.');
  } else {
    newsBookmarks.add(articleId);
    showToast('🔖 기사가 북마크에 저장되었습니다.');
  }
  localStorage.setItem('civil_bookmarks', JSON.stringify(Array.from(newsBookmarks)));
  window.newsBookmarks = newsBookmarks;
  updateGlobalBookmarkCount();
  renderArticles();
}

// 5. 뉴스 데이터 로드
async function loadNewsData() {
  showNewsLoading(true);
  try {
    let res;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      res = await fetch('/api/news', { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error('API failed');
    } catch (e) {
      res = await fetch('./data/news.json?t=' + Date.now());
      if (!res.ok) throw new Error('Static news.json failed with status ' + res.status);
    }

    const data = await res.json();
    allArticles = data.articles || [];
    window.allArticles = allArticles;
    categories = data.categories || [];
    
    // 메타데이터 업데이트
    const updatedEl = document.getElementById('newsLastUpdated');
    if (updatedEl) updatedEl.textContent = data.last_updated_display || '방금 전';

    const footerUpdatedEl = document.getElementById('footerLastUpdated');
    if (footerUpdatedEl) footerUpdatedEl.textContent = data.last_updated_display || '방금 전';
    
    const countEl = document.getElementById('newsTotalCount');
    if (countEl) countEl.textContent = `${allArticles.length}건`;

    // 매일 아침 크롤링된 당일 대표 트렌딩 키워드(#) 동적 연동
    if (data.trending_keywords && Array.isArray(data.trending_keywords) && data.trending_keywords.length > 0) {
      newsKeywordChips = ['전체', ...data.trending_keywords];
      if (activeKeywordFilter !== '전체' && !newsKeywordChips.includes(activeKeywordFilter)) {
        activeKeywordFilter = '전체';
      }
      renderNewsKeywordChips();
    }

    renderCategoryTabs();
    renderArticles();
  } catch (err) {
    console.error('뉴스 데이터 로드 실패:', err);
    showToast('⚠️ 뉴스 데이터를 불러오지 못했습니다.');
    const emptyState = document.getElementById('newsEmptyState');
    if (emptyState) {
      emptyState.classList.remove('hidden');
      emptyState.classList.add('flex');
    }
  } finally {
    showNewsLoading(false);
  }
}

// 카테고리 탭 렌더링 (채용 공고문과 동일한 '전체' + 각 카테고리 필터 탭 네비게이션)
function renderCategoryTabs() {
  const container = document.getElementById('newsCategoryTabs');
  if (!container) return;
  container.innerHTML = '';

  const targetCategories = [
    { id: 'all', name: '전체' },
    ...categories.filter(c => c.id !== 'all')
  ];

  targetCategories.forEach(cat => {
    let catCount = 0;
    if (cat.id === 'all') {
      catCount = allArticles.length;
    } else {
      catCount = allArticles.filter(a => a.category_id === cat.id).length;
    }

    const isCatActive = !isNewsBookmarkView && activeNewsCategory === cat.id;

    const btn = document.createElement('button');
    btn.setAttribute('data-cat-id', cat.id);
    btn.className = `category-tab-btn flex items-center gap-1.5 px-3 sm:px-4 text-xs sm:text-sm font-semibold cursor-pointer whitespace-nowrap select-none border-b-2 -mb-px ${
      isCatActive 
        ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-500' 
        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 border-transparent'
    }`;
    btn.innerHTML = `
      <span>${cat.name}</span>
      <span class="count-badge text-[11px] px-2 py-0.5 rounded-full font-semibold transition-colors ${
        isCatActive 
          ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 shadow-xs' 
          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
      }">${catCount}</span>
    `;

    btn.addEventListener('click', () => {
      if (!window.isGlobalBookmarkMode && isNewsBookmarkView) {
        isNewsBookmarkView = false;
        updateBookmarkTabStyle();
      }
      activeNewsCategory = cat.id;
      updateNewsCategoryTabStyles(cat.id);
      renderArticles();

      // 스크롤이 내려가 있는 경우 탭 네비게이션 상단으로 부드럽게 정렬
      const stickyBar = document.getElementById('categoryTabsSticky');
      if (stickyBar) {
        const isMobile = window.innerWidth < 640;
        const offset = isMobile ? 0 : 64;
        const rect = stickyBar.getBoundingClientRect();
        if (rect.top < offset) {
          const targetY = window.pageYOffset + rect.top - offset;
          window.scrollTo({ top: targetY, behavior: 'smooth' });
        }
      }
    });

    container.appendChild(btn);
  });
}

// 카테고리 탭 활성 상태 즉시 갱신 (DOM 재생성 없이 클래스만 교체하여 스크롤/터치 떨림 및 크기 변동 방지)
function updateNewsCategoryTabStyles(activeCatId) {
  const container = document.getElementById('newsCategoryTabs');
  if (!container) return;
  const buttons = container.querySelectorAll('button[data-cat-id]');
  if (buttons.length === 0) {
    renderCategoryTabs();
    return;
  }
  buttons.forEach(btn => {
    const catId = btn.getAttribute('data-cat-id');
    const isCatActive = !isNewsBookmarkView && (catId === activeCatId);
    btn.className = `category-tab-btn flex items-center gap-1.5 px-3 sm:px-4 text-xs sm:text-sm font-semibold cursor-pointer whitespace-nowrap select-none border-b-2 -mb-px ${
      isCatActive 
        ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-500' 
        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 border-transparent'
    }`;
    const badge = btn.querySelector('.count-badge');
    if (badge) {
      badge.className = `count-badge text-[11px] px-2 py-0.5 rounded-full font-semibold transition-colors ${
        isCatActive 
          ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 shadow-xs' 
          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
      }`;
    }
  });
}

function scrollToCategory(catId) {
  const target = document.getElementById(`section-${catId}`);
  if (target) {
    const isMobile = window.innerWidth < 640;
    const yOffset = isMobile ? -55 : -130;
    const y = target.getBoundingClientRect().top + window.pageYOffset + yOffset;
    window.scrollTo({ top: y, behavior: 'smooth' });
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function renderNewsKeywordChips() {
  const container = document.getElementById('newsKeywordChips');
  if (!container) return;
  container.innerHTML = '';

  const label = document.createElement('span');
  label.className = 'text-slate-400 dark:text-slate-500 font-medium flex items-center gap-1 pr-1 flex-shrink-0';
  label.innerHTML = '<i data-lucide="trending-up" class="w-3.5 h-3.5 text-blue-500"></i><span>오늘의 키워드:</span>';
  container.appendChild(label);

  newsKeywordChips.forEach(chip => {
    const isActive = activeKeywordFilter === chip;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-keyword', chip);
    btn.className = `keyword-pill px-2.5 py-1 rounded-lg text-xs transition flex-shrink-0 cursor-pointer ${
      isActive
        ? 'active bg-blue-600 text-white font-semibold shadow-xs'
        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium'
    }`;
    btn.textContent = chip === '전체' ? '전체' : `#${chip}`;
    
    btn.addEventListener('click', () => {
      if (activeKeywordFilter === chip && chip !== '전체') {
        activeKeywordFilter = '전체';
      } else {
        activeKeywordFilter = chip;
      }
      searchDisplayedCount = SEARCH_PAGE_SIZE;
      renderNewsKeywordChips();
      renderArticles();
    });

    container.appendChild(btn);
  });

  safeCreateIcons(container);
}
window.renderNewsKeywordChips = renderNewsKeywordChips;

function resetNewsKeywordAndSearch() {
  activeKeywordFilter = '전체';
  newsSearchQuery = '';
  activeNewsCategory = 'all';
  searchDisplayedCount = SEARCH_PAGE_SIZE;
  const input = document.getElementById('newsSearchInput');
  if (input) input.value = '';
  const clearBtn = document.getElementById('clearNewsSearchBtn');
  if (clearBtn) clearBtn.classList.add('hidden');
  renderNewsKeywordChips();
  updateNewsCategoryTabStyles('all');
  renderArticles();
}
window.resetNewsKeywordAndSearch = resetNewsKeywordAndSearch;

// 검색 및 필터 헬퍼 (검색어 + 키워드 칩 동시 지원)
function filterBySearch(articles) {
  let list = articles;
  if (activeKeywordFilter && activeKeywordFilter !== '전체') {
    const kw = activeKeywordFilter.toLowerCase();
    const subKeywords = kw.split('·');
    list = list.filter(a => {
      const summaryText = (a.summary_points || []).join(' ');
      const target = `${a.title || ''} ${a.snippet || ''} ${summaryText} ${a.category_name || ''}`.toLowerCase();
      return subKeywords.some(sub => target.includes(sub));
    });
  }
  if (!newsSearchQuery) return list;
  const q = newsSearchQuery.toLowerCase();
  return list.filter(a => {
    const titleMatch = (a.title || '').toLowerCase().includes(q);
    const snipMatch = (a.snippet || '').toLowerCase().includes(q);
    const pubMatch = (a.publisher || '').toLowerCase().includes(q);
    return titleMatch || snipMatch || pubMatch;
  });
}

function sortArticlesList(articles) {
  articles.sort((a, b) => {
    if (currentNewsSort === 'views') {
      const viewsA = (a.views || 0) + (userViews[a.id] || 0);
      const viewsB = (b.views || 0) + (userViews[b.id] || 0);
      return viewsB - viewsA;
    }
    if (currentNewsSort === 'oldest') {
      const dateA = a.latest_iso_date || a.iso_date || '';
      const dateB = b.latest_iso_date || b.iso_date || '';
      return dateA.localeCompare(dateB);
    }
    const dateA = a.latest_iso_date || a.iso_date || '';
    const dateB = b.latest_iso_date || b.iso_date || '';
    return dateB.localeCompare(dateA);
  });
}

// 기사 객체의 사실 기반 3줄 AI 브리핑 요약 포인트 반환 (존재 시 사용, 부재 시 지능적 분할 생성)
function generateArticleSummaryPoints(article) {
  if (Array.isArray(article.summary_points) && article.summary_points.length >= 3) {
    return article.summary_points.slice(0, 3);
  }

  const title = (article.title || '').trim();
  const snippet = (article.snippet || '').trim();
  const publisher = (article.publisher || '언론사').trim();
  const categoryName = (article.category_name || '토목').trim();

  // 1. 제목 노이즈 제거 ([속보], [단독], [포토], [사설] 등)
  const cleanTitle = title
    .replace(/^\[(단독|속보|포토|사설|기획|종합|현장|전문|인터뷰|칼럼|기고|알림|인사|부고)\]\s*/i, '')
    .trim();

  const cleanClause = (text) => {
    if (!text) return '';
    let t = text.trim().replace(/^[\s·\-:,~]+|[\s·\-:,~]+$/g, '');
    const quotePairs = [['"', '"'], ["'", "'"], ['“', '”'], ['‘', '’'], ['[', ']'], ['(', ')']];
    for (const [open, close] of quotePairs) {
      if (t.startsWith(open) && t.endsWith(close)) {
        t = t.slice(open.length, -close.length).trim();
      }
    }
    return t;
  };

  // 제목 분할: 말줄임표(… 또는 .. 이상), 하이픈(-), 쌍점(:)
  const rawParts = cleanTitle.split(/…|\.{2,}|(?:\s+-\s+)|(?:\s*:\s*)/);
  const parts = [];
  for (const p of rawParts) {
    const sub = cleanClause(p);
    if (sub.length >= 4) {
      parts.push(sub);
    }
  }

  const points = [];

  // 1번째 포인트: 핵심 안건 / 사건 개요
  if (parts.length > 0) {
    points.push(parts[0]);
  } else {
    points.push(cleanClause(cleanTitle) || title);
  }

  // 2번째 포인트: 세부 내용, 추진 목표, 사업 규모 또는 본문 스니펫 사실
  let p2 = '';
  const isDefaultSnippet = !snippet || snippet.includes('보도 - 클릭하여 원문 기사를 확인하세요') || snippet === title;
  if (!isDefaultSnippet) {
    const snippetSentences = snippet
      .split(/[\!\?]\s+|(?<=[다요음함])\.\s+|\n+/)
      .map(cleanClause)
      .filter(s => s.length >= 10);
    for (const s of snippetSentences) {
      if (!points[0].includes(s) && !s.includes(points[0])) {
        p2 = s;
        break;
      }
    }
  }

  if (!p2 && parts.length >= 2) {
    p2 = parts[1];
  }

  if (!p2) {
    const numMatch = cleanTitle.match(/(\d+[\.\d]*(?:조|억|천|만|km|m|%|호선|단계|차로|곳|개소))/);
    if (numMatch) {
      p2 = `핵심 규모 및 지표: ${numMatch[1]} 관련 세부 계획 구체화`;
    } else if (/(국토|정부|지자체|공사|철도공단|도로공사|수자원공사)/.test(cleanTitle)) {
      p2 = '주관 기관 및 유관 지자체 협력 기반 행정·인허가 및 사업 절차 진행';
    } else if (/(안전|점검|사고|예방|침하|균열|붕괴)/.test(cleanTitle)) {
      p2 = '현장 위험 요인 선제적 점검 및 안전 시공·관리 기준 강화';
    } else if (/(철도|도로|교량|터널|고속)/.test(cleanTitle)) {
      p2 = '교통 인프라 확충 및 광역 이동성 개선을 위한 설계·시공 착수';
    } else if (/(수자원|하천|항만|댐|물)/.test(cleanTitle)) {
      p2 = '치수 방재 역량 제고 및 수자원·항만 시설 인프라 현대화';
    } else {
      p2 = `${categoryName} 인프라 현장 실무 및 세부 실행 계획 검토`;
    }
  }
  points.push(p2);

  // 3번째 포인트: 파급효과, 업계 동향 및 출처 브리핑
  let p3 = '';
  if (parts.length >= 3 && !points.includes(parts[2])) {
    p3 = parts[2];
  }

  if (!p3 && !isDefaultSnippet) {
    const snippetSentences = snippet
      .split(/[\!\?]\s+|(?<=[다요음함])\.\s+|\n+/)
      .map(cleanClause)
      .filter(s => s.length >= 10);
    for (const s of snippetSentences) {
      if (!points[0].includes(s) && !points[1].includes(s)) {
        p3 = s;
        break;
      }
    }
  }

  if (!p3) {
    p3 = `[${categoryName}] ${publisher} 보도 기준 업계 동향 및 후속 절차 주목`;
  }
  points.push(p3);

  return points.slice(0, 3);
}

// 기사 본문 스니펫 정제: '원문 기사를 확인하세요' 등 무의미한 더미 문구 원천 차단 및 정갈한 팩트 요약 제공
function getArticleCleanSnippet(article) {
  let snippet = (article.snippet || '').trim();
  if (snippet.includes('원문 기사를 확인하세요') || snippet.includes('보도 - 클릭하여') || snippet.length < 10) {
    const points = generateArticleSummaryPoints(article);
    const p1 = (points[0] || '').trim();
    const p2 = (points[1] || '').trim();
    const s1 = p1 ? (p1.endsWith('.') ? p1 : p1 + '.') : '';
    const s2 = (p2 && p2 !== p1 && !p2.includes('보도 기준')) ? (p2.endsWith('.') ? p2 : p2 + '.') : '';
    return `${s1} ${s2}`.trim() || (article.title || '');
  }
  return snippet;
}

// 개별 기사 카드 HTML 생성
function renderArticleCard(article) {
  const isBookmarked = newsBookmarks.has(article.id);
  const isRead = readArticles.has(article.id);
  const badgeColorClass = `badge-${article.badge_color || 'slate'}`;
  const totalViews = (article.views || 0) + (userViews[article.id] || 0);
  const hasRelated = article.related_articles && article.related_articles.length > 0;
  const relatedCount = hasRelated ? article.related_articles.length : 0;
  const summaryPoints = generateArticleSummaryPoints(article);
  const cleanSnippet = getArticleCleanSnippet(article);

  const readBadgeHtml = isRead
    ? `<button type="button" onclick="toggleArticleRead('${article.id}', event)" class="read-status-btn inline-flex items-center text-[11px] px-2 py-0.5 rounded-md font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 cursor-pointer transition hover:opacity-80" title="읽음 완료 (클릭 시 토글)"><i data-lucide="check" class="w-3 h-3 mr-0.5"></i>읽음</button>`
    : `<button type="button" onclick="toggleArticleRead('${article.id}', event)" class="read-status-btn inline-flex items-center text-[11px] px-2 py-0.5 rounded-md font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 cursor-pointer transition" title="읽음 표시하기">안읽음</button>`;
  
  return `
    <article data-article-id="${article.id}" class="news-card flex flex-col justify-between bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl sm:rounded-3xl p-5 sm:p-7 shadow-xs hover:shadow-md hover:border-blue-400 dark:hover:border-blue-500/50 transition">
      <div>
        <div class="flex items-center justify-between gap-2 mb-3 sm:mb-3.5">
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="inline-block px-3 py-1 text-xs sm:text-sm font-semibold rounded-lg border ${badgeColorClass}">
              ${escapeHtml(article.category_name || '토목')}
            </span>
            ${readBadgeHtml}
          </div>
          <div class="flex items-center text-xs sm:text-sm text-slate-500 dark:text-slate-400 gap-3">
            <span class="flex items-center">
              <i data-lucide="clock" class="w-4 h-4 mr-1 text-slate-400"></i>
              <span>${escapeHtml(article.relative_date || '최근')}</span>
            </span>
            <span class="flex items-center text-slate-400 dark:text-slate-500 text-xs" title="조회수">
              <i data-lucide="eye" class="w-4 h-4 mr-1"></i>
              <span id="view-count-${article.id}">${totalViews.toLocaleString()}</span>회
            </span>
          </div>
        </div>

        <h3 class="${isRead ? 'font-bold text-lg sm:text-xl text-slate-600 dark:text-slate-400' : 'font-extrabold text-xl sm:text-2xl text-slate-900 dark:text-slate-100'} hover:text-blue-600 dark:hover:text-blue-400 leading-snug sm:leading-snug line-clamp-2 mb-3.5 sm:mb-4 transition tracking-tight">
          <a href="${article.link}" target="_blank" rel="noopener noreferrer" onclick="recordView('${article.id}'); markArticleAsRead('${article.id}');">
            ${escapeHtml(article.title)}
          </a>
        </h3>

        <!-- 3줄 핵심 브리핑 리스트 (상시 노출) -->
        <div class="mb-4 sm:mb-5 p-4 sm:p-5 rounded-2xl bg-blue-50/40 dark:bg-slate-800/60 border border-blue-100/70 dark:border-slate-700/60">
          <ul class="space-y-2.5 text-sm sm:text-[15px] text-slate-700 dark:text-slate-200">
            ${summaryPoints.map((point) => `
              <li class="flex items-start gap-2.5 leading-relaxed">
                <span class="w-2.5 h-2.5 rounded-full bg-blue-500 dark:bg-blue-400 mt-1.5 flex-shrink-0 shadow-xs"></span>
                <span class="flex-1">${escapeHtml(point)}</span>
              </li>
            `).join('')}
          </ul>
        </div>

        ${hasRelated ? `
        <div class="mb-3.5">
          <button 
            type="button"
            onclick="toggleRelatedArticles('${article.id}', event)"
            class="w-full flex items-center justify-between px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/80 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-700/80 transition group cursor-pointer"
          >
            <span class="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-semibold">
              <i data-lucide="layers" class="w-4 h-4"></i>
              <span>같은 내용의 타 언론사 보도 <strong class="text-blue-700 dark:text-blue-300">${relatedCount}건</strong></span>
            </span>
            <span class="flex items-center text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200 text-xs gap-1">
              <span id="related-text-${article.id}">모두보기</span>
              <i id="related-icon-${article.id}" data-lucide="chevron-down" class="w-3.5 h-3.5 transition-transform duration-200"></i>
            </span>
          </button>

          <div id="related-list-${article.id}" class="hidden space-y-2 mt-2.5 max-h-56 overflow-y-auto pr-1">
            ${(article.related_articles || []).slice().sort((r1, r2) => (r2.iso_date || r2.published_at || '').localeCompare(r1.iso_date || r1.published_at || '')).map(rel => `
              <div class="flex items-start justify-between gap-2 p-2.5 rounded-xl bg-slate-50/90 dark:bg-slate-800/50 hover:bg-blue-50/50 dark:hover:bg-slate-800 border border-slate-100 dark:border-slate-800/90 transition">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-1.5 mb-0.5">
                    <span class="inline-block px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200 truncate max-w-[120px]">
                      ${escapeHtml(rel.publisher)}
                    </span>
                    <span class="text-xs text-slate-400 dark:text-slate-500">${escapeHtml(rel.relative_date || '')}</span>
                  </div>
                  <a href="${rel.link}" target="_blank" rel="noopener noreferrer" onclick="recordView('${rel.id}'); markArticleAsRead('${article.id}');" class="text-xs sm:text-sm text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 line-clamp-1 block transition font-normal">
                    ${escapeHtml(rel.title)}
                  </a>
                </div>
                <a href="${rel.link}" target="_blank" rel="noopener noreferrer" onclick="recordView('${rel.id}'); markArticleAsRead('${article.id}');" class="flex-shrink-0 p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition" title="원문 보기">
                  <i data-lucide="external-link" class="w-4 h-4"></i>
                </a>
              </div>
            `).join('')}
          </div>
        </div>
        ` : ''}
      </div>

      <div class="pt-4 mt-auto border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
        <span class="text-sm sm:text-base font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-2 truncate max-w-[160px] sm:max-w-[220px]">
          <i data-lucide="building" class="w-4 h-4 sm:w-4.5 sm:h-4.5 flex-shrink-0 text-slate-400"></i>
          <span class="truncate">${escapeHtml(article.publisher)}</span>
        </span>

        <div class="flex items-center gap-1.5 sm:gap-2">
          <!-- 기사 공유 버튼 -->
          <button 
            onclick="shareArticle('${article.id}', event)"
            title="기사 공유하기"
            class="p-2 sm:p-2.5 rounded-xl text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <i data-lucide="share-2" class="w-4 h-4 sm:w-4.5 sm:h-4.5"></i>
          </button>

          <!-- 북마크 버튼 -->
          <button 
            onclick="toggleBookmark('${article.id}', event)"
            title="${isBookmarked ? '북마크 해제' : '북마크 추가'}"
            class="p-2 sm:p-2.5 rounded-xl transition cursor-pointer ${
              isBookmarked 
                ? 'text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40' 
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }"
          >
            <i data-lucide="bookmark" class="w-4 h-4 sm:w-4.5 sm:h-4.5 ${isBookmarked ? 'fill-amber-500 text-amber-500' : ''}"></i>
          </button>
        </div>
      </div>
      ${renderBookmarkNoteRow(article.id, article.title)}
    </article>
  `;
}
window.renderArticleCard = renderArticleCard;

// 6. 메인 뉴스 렌더링
const NEWS_CATEGORY_META = {
  general: {
    icon: 'newspaper',
    iconBg: 'bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400',
    badge: 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900'
  },
  road_rail: {
    icon: 'train',
    iconBg: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400',
    badge: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900'
  },
  water_port: {
    icon: 'droplets',
    iconBg: 'bg-cyan-100 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400',
    badge: 'bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-900'
  },
  tunnel_geo: {
    icon: 'shield-check',
    iconBg: 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400',
    badge: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900'
  },
  smart_policy: {
    icon: 'cpu',
    iconBg: 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400',
    badge: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-900'
  }
};

function renderArticles() {
  const container = document.getElementById('categorySectionsContainer');
  const emptyState = document.getElementById('newsEmptyState');
  const notice = document.getElementById('newsResultCountNotice');
  if (!container) return;

  // 북마크 모드
  if (isNewsBookmarkView) {
    const bookmarkedArticles = allArticles.filter(a => newsBookmarks.has(a.id));
    const filteredBookmarks = filterBySearch(bookmarkedArticles);
    sortArticlesList(filteredBookmarks);

    if (filteredBookmarks.length === 0) {
      container.innerHTML = '';
      if (emptyState) {
        emptyState.classList.remove('hidden');
        emptyState.classList.add('flex');
      }
      if (notice) notice.textContent = '마이페이지에 저장된 기사가 없습니다.';
      return;
    }

    if (emptyState) {
      emptyState.classList.add('hidden');
      emptyState.classList.remove('flex');
    }
    if (notice) notice.textContent = `⭐ 마이페이지 기사 총 ${filteredBookmarks.length}건`;

    container.innerHTML = `
      <section class="scroll-mt-16 sm:scroll-mt-36">
        <div class="flex items-center justify-between pb-3.5 mb-5 border-b border-slate-200/80 dark:border-slate-800 px-1">
          <div class="flex items-center gap-2.5">
            <span class="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center font-bold">
              <i data-lucide="bookmark" class="w-4 h-4 fill-amber-500 text-amber-500"></i>
            </span>
            <h3 class="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              마이페이지 · 저장한 기사
            </h3>
            <span class="text-xs px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-semibold border border-amber-200 dark:border-amber-900">
              ${filteredBookmarks.length}건
            </span>
          </div>
          <button onclick="activeNewsCategory='all'; window.toggleCurrentTabBookmark(false);" class="text-xs font-semibold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 flex items-center gap-1 cursor-pointer">
            전체 기사로 돌아가기
          </button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
          ${filteredBookmarks.map(renderArticleCard).join('')}
        </div>
      </section>
    `;
    safeCreateIcons(container);
    return;
  }

  // 검색어 또는 키워드 칩 필터 활성화 시
  if (newsSearchQuery || (activeKeywordFilter && activeKeywordFilter !== '전체')) {
    let searchResults = filterBySearch(allArticles);
    if (activeNewsCategory !== 'all') {
      searchResults = searchResults.filter(a => a.category_id === activeNewsCategory);
    }
    sortArticlesList(searchResults);

    const curCat = categories.find(c => c.id === activeNewsCategory);
    const catPrefix = (activeNewsCategory !== 'all' && curCat) ? `[${curCat.name}] ` : '';
    let filterLabel = '';
    if (newsSearchQuery && activeKeywordFilter && activeKeywordFilter !== '전체') {
      filterLabel = `${catPrefix}'${newsSearchQuery}' + #${activeKeywordFilter}`;
    } else if (newsSearchQuery) {
      filterLabel = `${catPrefix}'${newsSearchQuery}'`;
    } else {
      filterLabel = `${catPrefix}#${activeKeywordFilter}`;
    }

    if (searchResults.length === 0) {
      container.innerHTML = '';
      if (emptyState) {
        emptyState.classList.remove('hidden');
        emptyState.classList.add('flex');
      }
      if (notice) notice.textContent = `${filterLabel} 관련 기사가 없습니다.`;
      return;
    }

    if (emptyState) {
      emptyState.classList.add('hidden');
      emptyState.classList.remove('flex');
    }
    if (notice) notice.textContent = `${filterLabel} 관련 기사 총 ${searchResults.length}건`;

    const currentSearchCount = searchDisplayedCount || SEARCH_PAGE_SIZE;
    const displayedResults = searchResults.slice(0, currentSearchCount);
    const hasMoreSearch = searchResults.length > currentSearchCount;
    const remainingSearchCount = searchResults.length - currentSearchCount;

    container.innerHTML = `
      <section class="scroll-mt-16 sm:scroll-mt-36">
        <div class="flex items-center justify-between pb-3.5 mb-5 border-b border-slate-200/80 dark:border-slate-800 px-1">
          <div class="flex items-center gap-2.5">
            <span class="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
              <i data-lucide="tag" class="w-4 h-4"></i>
            </span>
            <h3 class="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              ${filterLabel} 관련 기사
            </h3>
            <span class="text-xs px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-semibold border border-blue-200 dark:border-blue-900">
              ${searchResults.length}건
            </span>
          </div>
          <button onclick="resetNewsKeywordAndSearch()" class="text-xs font-semibold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 flex items-center gap-1 cursor-pointer">
            전체 분야로 돌아가기
          </button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
          ${displayedResults.map(renderArticleCard).join('')}
        </div>

        ${hasMoreSearch ? `
          <div class="mt-5 sm:mt-6 pt-3.5 sm:pt-4 border-t border-slate-200/60 sm:border-slate-100 dark:border-slate-800 text-center">
            <button 
              onclick="loadMoreSearchResults()"
              class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 hover:bg-blue-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-semibold border border-slate-200 dark:border-slate-700 transition group shadow-xs cursor-pointer active:scale-95"
            >
              <span>검색 결과 더보기 (+${Math.min(remainingSearchCount, SEARCH_PAGE_SIZE)}개)</span>
              <i data-lucide="chevron-down" class="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-transform group-hover:translate-y-0.5"></i>
            </button>
          </div>
        ` : ''}
      </section>
    `;
    safeCreateIcons(container);
    return;
  }

  // 기본 상태: 'all'이면 모든 5개 카테고리 섹션 렌더링, 특정 카테고리가 선택되었으면 해당 카테고리만 단독 렌더링
  const renderedCategories = (activeNewsCategory === 'all')
    ? categories.filter(c => c.id !== 'all')
    : categories.filter(c => c.id === activeNewsCategory);

  const sectionsHtml = renderedCategories.map(cat => {
    let catArticles = allArticles.filter(a => a.category_id === cat.id);
    sortArticlesList(catArticles);

    if (catArticles.length === 0) return '';

    const currentCount = categoryDisplayedCount[cat.id] || CATEGORY_PAGE_SIZE;
    const displayedArticles = catArticles.slice(0, currentCount);
    const hasMore = catArticles.length > currentCount;
    const remainingCount = catArticles.length - currentCount;

    const meta = NEWS_CATEGORY_META[cat.id] || {
      icon: 'folder',
      iconBg: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
      badge: 'bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
    };

    return `
      <section id="section-${cat.id}" class="scroll-mt-16 sm:scroll-mt-36">
        <div class="flex items-center justify-between pb-3.5 mb-5 border-b border-slate-200/80 dark:border-slate-800 px-1">
          <div class="flex items-center gap-2.5">
            <span class="w-8 h-8 rounded-xl ${meta.iconBg} flex items-center justify-center font-bold">
              <i data-lucide="${meta.icon}" class="w-4 h-4"></i>
            </span>
            <h3 class="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              ${cat.name}
            </h3>
            <span class="text-xs px-2.5 py-0.5 rounded-full ${meta.badge} font-semibold border">
              총 ${catArticles.length}건
            </span>
          </div>
          ${cat.description ? `
            <span class="hidden sm:inline-block text-xs text-slate-500 dark:text-slate-400">
              ${cat.description}
            </span>
          ` : ''}
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
          ${displayedArticles.map(renderArticleCard).join('')}
        </div>

        ${hasMore ? `
          <div class="mt-5 sm:mt-6 pt-3.5 sm:pt-4 border-t border-slate-200/60 sm:border-slate-100 dark:border-slate-800 text-center">
            <button 
              onclick="loadMoreCategoryArticles('${cat.id}')"
              class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 hover:bg-blue-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-semibold border border-slate-200 dark:border-slate-700 transition group shadow-xs cursor-pointer active:scale-95"
            >
              <span>${cat.name} 기사 더보기 (+${Math.min(remainingCount, CATEGORY_PAGE_SIZE)}개)</span>
              <i data-lucide="chevron-down" class="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-transform group-hover:translate-y-0.5"></i>
            </button>
          </div>
        ` : ''}
      </section>
    `;
  }).filter(Boolean).join('');

  if (!sectionsHtml.trim()) {
    container.innerHTML = '';
    if (emptyState) {
      emptyState.classList.remove('hidden');
      emptyState.classList.add('flex');
    }
    if (notice) {
      notice.textContent = '해당 카테고리에 등록된 기사가 없습니다.';
    }
    return;
  }

  if (emptyState) {
    emptyState.classList.add('hidden');
    emptyState.classList.remove('flex');
  }

  if (notice) {
    if (activeNewsCategory === 'all') {
      notice.textContent = `주요 토목 분야별 브리핑 (총 ${allArticles.length}건)`;
    } else {
      const curCat = categories.find(c => c.id === activeNewsCategory);
      const catName = curCat ? curCat.name : '';
      const curArticles = allArticles.filter(a => a.category_id === activeNewsCategory);
      notice.textContent = `'${catName}' 관련 기사 총 ${curArticles.length}건`;
    }
  }

  container.innerHTML = sectionsHtml;
  safeCreateIcons(container);
}

function loadMoreCategoryArticles(catId) {
  const currentCount = categoryDisplayedCount[catId] || CATEGORY_PAGE_SIZE;
  categoryDisplayedCount[catId] = currentCount + CATEGORY_PAGE_SIZE;
  renderArticles();
}

function loadMoreSearchResults() {
  searchDisplayedCount = (searchDisplayedCount || SEARCH_PAGE_SIZE) + SEARCH_PAGE_SIZE;
  renderArticles();
}
window.loadMoreSearchResults = loadMoreSearchResults;

// 관련 기사 아코디언 토글
function toggleRelatedArticles(articleId, e) {
  if (e) e.stopPropagation();
  const listEl = document.getElementById(`related-list-${articleId}`);
  const iconEl = document.getElementById(`related-icon-${articleId}`);
  const textEl = document.getElementById(`related-text-${articleId}`);
  if (!listEl) return;

  const isHidden = listEl.classList.contains('hidden');
  if (isHidden) {
    listEl.classList.remove('hidden');
    if (iconEl) iconEl.classList.add('rotate-180');
    if (textEl) textEl.textContent = '접기';
  } else {
    listEl.classList.add('hidden');
    if (iconEl) iconEl.classList.remove('rotate-180');
    if (textEl) textEl.textContent = '모두보기';
  }
}


// 7. 기사 공유 (Web Share API + Clipboard Fallback)
async function shareArticle(articleId, e) {
  if (e) e.stopPropagation();
  const article = allArticles.find(a => a.id === articleId);
  if (!article) return;

  const shareTitle = `[토목 뉴스] ${article.title}`;
  const shareText = `[토목 뉴스] ${article.title}\n📰 언론사: ${article.publisher} (${article.relative_date || '최근'})\n🔗 기사링크: ${article.link}\n출처: Civil News Hub`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: shareTitle,
        text: shareText,
        url: article.link
      });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }

  // Clipboard Fallback
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(shareText).then(() => {
      showToast('📋 기사 요약 및 링크가 복사되었습니다.');
    }).catch(() => {
      copyPromptFallback(shareText);
    });
  } else {
    copyPromptFallback(shareText);
  }
}

function copyPromptFallback(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    showToast('📋 클립보드에 복사되었습니다.');
  } catch (err) {
    prompt('내용 복사하기:', text);
  }
  document.body.removeChild(textarea);
}

// 8. 로딩 및 토스트 메시지
let toastTimer = null;
function showToast(message) {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMessage');
  if (!toast || !toastMsg) return;
  toastMsg.textContent = message;
  
  toast.classList.remove('translate-y-20', 'opacity-0');
  toast.classList.add('translate-y-0', 'opacity-100');
  
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('translate-y-0', 'opacity-100');
    toast.classList.add('translate-y-20', 'opacity-0');
  }, 2500);
}
window.showToast = showToast;

function showNewsLoading(show) {
  const loading = document.getElementById('newsLoadingIndicator');
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

// 9. SPA 탭 전환 마스터 라우팅
let lastActiveTab = 'news';

window.switchMainTab = function(tabName, updateHash = true) {
  if (currentMainTab !== tabName && currentMainTab !== 'mypage') {
    lastActiveTab = currentMainTab;
  }
  currentMainTab = tabName;
  try {
    localStorage.setItem('civil_last_tab', tabName);
  } catch (e) {}

  const panelNews = document.getElementById('tabPanelNews');
  const panelJobs = document.getElementById('tabPanelJobs');
  const panelContests = document.getElementById('tabPanelContests');
  const panelMyPage = document.getElementById('tabPanelMyPage');

  if (panelNews) panelNews.classList.toggle('hidden', tabName !== 'news');
  if (panelJobs) panelJobs.classList.toggle('hidden', tabName !== 'jobs');
  if (panelContests) panelContests.classList.toggle('hidden', tabName !== 'contests');
  if (panelMyPage) panelMyPage.classList.toggle('hidden', tabName !== 'mypage');

  if (tabName === 'news') {
    isNewsBookmarkView = false;
    renderCategoryTabs();
    renderArticles();
  } else if (tabName === 'jobs' && typeof window.toggleJobBookmarkFilter === 'function') {
    window.toggleJobBookmarkFilter(false);
  } else if (tabName === 'contests' && typeof window.toggleContestBookmarkFilter === 'function') {
    window.toggleContestBookmarkFilter(false);
  } else if (tabName === 'mypage') {
    renderMyPage();
  }

  // GNB 버튼 스타일 갱신
  updateGnbTabStyles(tabName);

  // 모바일 하단바 탭 스타일 갱신
  updateMobileNavStyles(tabName);

  // 헤더 및 모바일 북마크 카운트 동기화
  updateGlobalBookmarkCount();

  // 북마크 탭 버튼 스타일 갱신
  updateBookmarkTabStyle();

  // URL 해시 업데이트
  if (updateHash) {
    history.replaceState(null, null, '#' + tabName);
  }

  // 상단 스크롤
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (window.lucide) window.lucide.createIcons();
};

function updateGnbTabStyles(activeTab) {
  const tabs = [
    { id: 'gnbTabNews', key: 'news' },
    { id: 'gnbTabJobs', key: 'jobs' },
    { id: 'gnbTabContests', key: 'contests' }
  ];

  tabs.forEach(t => {
    const el = document.getElementById(t.id);
    if (!el) return;
    const isActive = t.key === activeTab;
    if (isActive) {
      el.className = 'px-2.5 sm:px-3.5 py-1.5 text-xs sm:text-base font-bold tracking-tight text-blue-600 dark:text-blue-400 drop-shadow-[0_0_8px_rgba(37,99,235,0.45)] dark:drop-shadow-[0_0_10px_rgba(96,165,250,0.75)] transition flex items-center justify-center cursor-pointer flex-shrink-0 bg-transparent';
    } else {
      el.className = 'px-2.5 sm:px-3.5 py-1.5 text-xs sm:text-base font-bold tracking-tight text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300 transition flex items-center justify-center cursor-pointer flex-shrink-0 bg-transparent drop-shadow-none';
    }
  });
}

function updateMobileNavStyles(activeTab) {
  const tabs = [
    { id: 'mobileTabNews', key: 'news', activeColor: 'text-blue-600 dark:text-blue-400' },
    { id: 'mobileTabJobs', key: 'jobs', activeColor: 'text-blue-600 dark:text-blue-400' },
    { id: 'mobileTabContests', key: 'contests', activeColor: 'text-amber-500' },
    { id: 'mobileBookmarkBtn', key: 'mypage', activeColor: 'text-amber-500' }
  ];

  tabs.forEach(t => {
    const el = document.getElementById(t.id);
    if (!el) return;
    const isActive = t.key === activeTab;
    if (isActive) {
      el.className = `flex-1 relative flex flex-col items-center justify-center py-1 px-1 ${t.activeColor} font-bold transition cursor-pointer`;
    } else {
      el.className = 'flex-1 relative flex flex-col items-center justify-center py-1 px-1 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 font-medium transition cursor-pointer';
    }
  });
}

// 통합 북마크 뱃지 카운터
window.updateGlobalBookmarkCount = function() {
  const nBookmarks = window.newsBookmarks || (typeof newsBookmarks !== 'undefined' ? newsBookmarks : null);
  const jBookmarks = window.jobBookmarks || (typeof jobBookmarks !== 'undefined' ? jobBookmarks : null);
  const cBookmarks = window.contestBookmarks || (typeof contestBookmarks !== 'undefined' ? contestBookmarks : null);

  const newsCount = nBookmarks ? nBookmarks.size : 0;
  const jobsCount = jBookmarks ? jBookmarks.size : 0;
  const contestsCount = cBookmarks ? cBookmarks.size : 0;
  const totalCount = newsCount + jobsCount + contestsCount;

  const countEl = document.getElementById('bookmarkCount');
  if (countEl) countEl.textContent = totalCount;

  const mobileBadge = document.getElementById('mobileBookmarkBadge');
  if (mobileBadge) {
    mobileBadge.textContent = totalCount;
    if (totalCount > 0) {
      mobileBadge.classList.remove('hidden');
    } else {
      mobileBadge.classList.add('hidden');
    }
  }

  // 마이페이지가 열려있다면 즉시 재렌더링
  if (currentMainTab === 'mypage') {
    renderMyPage();
  }

  updateBookmarkTabStyle();
};

// 북마크 탭 버튼 스타일 갱신
function updateBookmarkTabStyle() {
  const isMyPage = (currentMainTab === 'mypage');

  const bookmarkBtn = document.getElementById('bookmarkTabBtn');
  if (bookmarkBtn) {
    if (isMyPage) {
      bookmarkBtn.className = 'flex-shrink-0 flex items-center px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-bold transition bg-amber-500 text-white shadow-sm shadow-amber-500/20 cursor-pointer border border-amber-500';
    } else {
      bookmarkBtn.className = 'flex-shrink-0 flex items-center px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium transition border border-amber-300/90 dark:border-amber-700/60 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 cursor-pointer shadow-xs';
    }
  }

  const mobileBtn = document.getElementById('mobileBookmarkBtn');
  if (mobileBtn) {
    const icon = mobileBtn.querySelector('i, svg');
    if (icon) {
      if (isMyPage) {
        icon.classList.add('fill-amber-500');
      } else {
        icon.classList.remove('fill-amber-500');
      }
    }
  }
}

// 통합 북마크 토글 (마이페이지 모드 전환)
let lastBookmarkToggleTime = 0;
window.toggleCurrentTabBookmark = function(forceState, e) {
  if (e && typeof e.stopPropagation === 'function') e.stopPropagation();

  // 모바일 터치 합성 이벤트 및 빠른 연타 방지 (250ms 쓰로틀 가드)
  const now = Date.now();
  if (typeof forceState !== 'boolean' && now - lastBookmarkToggleTime < 250) {
    return;
  }
  lastBookmarkToggleTime = now;

  if (currentMainTab === 'mypage') {
    switchMainTab(lastActiveTab || 'news');
    showToast('전체 목록으로 돌아갑니다.');
  } else {
    lastActiveTab = currentMainTab;
    switchMainTab('mypage');
    showToast('🔖 마이페이지로 이동했습니다. (저장한 항목 모아보기)');
  }
};

// URL 해시 라우팅 초기화
function initTabRouting() {
  const hash = (window.location.hash || '').replace('#', '').toLowerCase();
  let savedTab = 'news';
  try {
    savedTab = localStorage.getItem('civil_last_tab') || 'news';
  } catch (e) {}

  if (hash === 'jobs') {
    switchMainTab('jobs', false);
  } else if (hash === 'contests') {
    switchMainTab('contests', false);
  } else if (hash === 'mypage') {
    switchMainTab('mypage', false);
  } else if (hash === 'news') {
    switchMainTab('news', false);
  } else {
    // 저장된 마지막 선호 탭으로 복원 (PWA/재방문 최적화)
    switchMainTab(savedTab, false);
  }

  window.addEventListener('hashchange', () => {
    const newHash = (window.location.hash || '').replace('#', '').toLowerCase();
    if (newHash === 'jobs') switchMainTab('jobs', false);
    else if (newHash === 'contests') switchMainTab('contests', false);
    else if (newHash === 'mypage') switchMainTab('mypage', false);
    else switchMainTab('news', false);
  });
}

// 10. 통합 마이페이지 (저장한 뉴스, 채용 공고, 공모전 전체를 섹션별로 렌더링)
function renderMyPage() {
  const panelMyPage = document.getElementById('tabPanelMyPage');
  if (!panelMyPage) return;

  const articlesList = window.allArticles || (typeof allArticles !== 'undefined' ? allArticles : []);
  const nBookmarks = window.newsBookmarks || (typeof newsBookmarks !== 'undefined' ? newsBookmarks : new Set());
  const jobsList = window.allJobs || (typeof allJobs !== 'undefined' ? allJobs : []);
  const jBookmarks = window.jobBookmarks || (typeof jobBookmarks !== 'undefined' ? jobBookmarks : new Set());
  const contestsList = window.allContests || (typeof allContests !== 'undefined' ? allContests : []);
  const cBookmarks = window.contestBookmarks || (typeof contestBookmarks !== 'undefined' ? contestBookmarks : new Set());

  const bookmarkedArticles = articlesList.filter(a => nBookmarks && nBookmarks.has(a.id));
  const bookmarkedJobs = jobsList.filter(j => jBookmarks && jBookmarks.has(j.id));
  const bookmarkedContests = contestsList.filter(c => cBookmarks && cBookmarks.has(c.id));

  const totalCount = bookmarkedArticles.length + bookmarkedJobs.length + bookmarkedContests.length;

  // 통계 뱃지 갱신
  const statNews = document.getElementById('myPageNewsStat');
  const statJobs = document.getElementById('myPageJobsStat');
  const statContests = document.getElementById('myPageContestsStat');
  const statTotal = document.getElementById('myPageTotalStat');
  if (statNews) statNews.textContent = bookmarkedArticles.length;
  if (statJobs) statJobs.textContent = bookmarkedJobs.length;
  if (statContests) statContests.textContent = bookmarkedContests.length;
  if (statTotal) statTotal.textContent = totalCount;

  const overallEmpty = document.getElementById('myPageOverallEmpty');
  const sectionsWrapper = document.getElementById('myPageSectionsWrapper');

  if (totalCount === 0) {
    if (overallEmpty) overallEmpty.classList.remove('hidden');
    if (sectionsWrapper) sectionsWrapper.classList.add('hidden');
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  if (overallEmpty) overallEmpty.classList.add('hidden');
  if (sectionsWrapper) sectionsWrapper.classList.remove('hidden');

  // 1. 저장한 토목 뉴스 섹션
  const newsGrid = document.getElementById('myPageNewsGrid');
  const newsEmpty = document.getElementById('myPageNewsEmpty');
  const newsBadge = document.getElementById('myPageNewsCountBadge');
  if (newsBadge) newsBadge.textContent = `${bookmarkedArticles.length}건`;

  if (bookmarkedArticles.length === 0) {
    if (newsGrid) {
      newsGrid.innerHTML = '';
      newsGrid.classList.add('hidden');
    }
    if (newsEmpty) newsEmpty.classList.remove('hidden');
  } else {
    if (newsEmpty) newsEmpty.classList.add('hidden');
    if (newsGrid) {
      newsGrid.classList.remove('hidden');
      newsGrid.innerHTML = bookmarkedArticles.map(renderArticleCard).join('');
    }
  }

  // 2. 저장한 채용 공고 섹션
  const jobsGrid = document.getElementById('myPageJobsGrid');
  const jobsEmpty = document.getElementById('myPageJobsEmpty');
  const jobsBadge = document.getElementById('myPageJobsCountBadge');
  if (jobsBadge) jobsBadge.textContent = `${bookmarkedJobs.length}건`;

  if (bookmarkedJobs.length === 0) {
    if (jobsGrid) {
      jobsGrid.innerHTML = '';
      jobsGrid.classList.add('hidden');
    }
    if (jobsEmpty) jobsEmpty.classList.remove('hidden');
  } else {
    if (jobsEmpty) jobsEmpty.classList.add('hidden');
    if (jobsGrid) {
      jobsGrid.classList.remove('hidden');
      const jobRenderer = window.renderJobCard || (typeof renderJobCard === 'function' ? renderJobCard : null);
      if (jobRenderer) {
        jobsGrid.innerHTML = bookmarkedJobs.map(jobRenderer).join('');
      }
    }
  }

  // 3. 저장한 공모전 섹션
  const contestsGrid = document.getElementById('myPageContestsGrid');
  const contestsEmpty = document.getElementById('myPageContestsEmpty');
  const contestsBadge = document.getElementById('myPageContestsCountBadge');
  if (contestsBadge) contestsBadge.textContent = `${bookmarkedContests.length}건`;

  if (bookmarkedContests.length === 0) {
    if (contestsGrid) {
      contestsGrid.innerHTML = '';
      contestsGrid.classList.add('hidden');
    }
    if (contestsEmpty) contestsEmpty.classList.remove('hidden');
  } else {
    if (contestsEmpty) contestsEmpty.classList.add('hidden');
    if (contestsGrid) {
      contestsGrid.classList.remove('hidden');
      const contestRenderer = window.renderContestCard || (typeof renderContestCard === 'function' ? renderContestCard : null);
      if (contestRenderer) {
        contestsGrid.innerHTML = bookmarkedContests.map(contestRenderer).join('');
      }
    }
  }

  safeCreateIcons(container);
}
window.renderMyPage = renderMyPage;

// 10. 뉴스 이벤트 리스너 설정
function setupNewsEventListeners() {
  // 테마 토글
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) themeToggle.addEventListener('click', toggleTheme);

  // 새로고침 버튼
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      const icon = document.getElementById('refreshIcon');
      if (icon) icon.classList.add('animate-spin');
      
      if (currentMainTab === 'news') {
        loadNewsData().then(() => {
          showToast('최신 뉴스를 갱신했습니다.');
          setTimeout(() => { if (icon) icon.classList.remove('animate-spin'); }, 500);
        });
      } else if (currentMainTab === 'jobs') {
        if (typeof loadJobsData === 'function') {
          loadJobsData().then(() => {
            showToast('최신 채용 공고를 갱신했습니다.');
            setTimeout(() => { if (icon) icon.classList.remove('animate-spin'); }, 500);
          });
        }
      } else if (currentMainTab === 'contests') {
        if (typeof loadContestsData === 'function') {
          loadContestsData().then(() => {
            showToast('최신 공모전을 갱신했습니다.');
            setTimeout(() => { if (icon) icon.classList.remove('animate-spin'); }, 500);
          });
        }
      }
    });
  }

  // 북마크 탭 버튼 스타일 초기화
  updateBookmarkTabStyle();

  // 뉴스 검색창 (180ms 디바운스 적용으로 타이핑 렉 원천 차단)
  const searchInput = document.getElementById('newsSearchInput');
  const clearBtn = document.getElementById('clearNewsSearchBtn');
  if (searchInput && clearBtn) {
    const handleNewsSearch = debounce((query) => {
      newsSearchQuery = query;
      categoryDisplayedCount = {};
      searchDisplayedCount = SEARCH_PAGE_SIZE;
      renderArticles();
    }, 180);

    searchInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      if (val) {
        clearBtn.classList.remove('hidden');
      } else {
        clearBtn.classList.add('hidden');
      }
      handleNewsSearch(val);
    });

    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      newsSearchQuery = '';
      categoryDisplayedCount = {};
      searchDisplayedCount = SEARCH_PAGE_SIZE;
      clearBtn.classList.add('hidden');
      searchInput.focus();
      renderArticles();
    });
  }

  // 뉴스 정렬
  const sortSelect = document.getElementById('newsSortSelect');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      currentNewsSort = e.target.value;
      categoryDisplayedCount = {};
      renderArticles();
    });
  }

  // 뉴스 빈 상태 리셋 버튼
  const resetBtn = document.getElementById('newsResetFilterBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      isNewsBookmarkView = false;
      activeNewsCategory = 'all';
      newsSearchQuery = '';
      if (searchInput) searchInput.value = '';
      currentNewsSort = 'newest';
      if (sortSelect) sortSelect.value = 'newest';
      categoryDisplayedCount = {};
      if (clearBtn) clearBtn.classList.add('hidden');
      renderCategoryTabs();
      updateBookmarkTabStyle();
      renderArticles();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // 북마크 개인 메모 글자수 동기화
  const noteTextarea = document.getElementById('bookmarkNoteText');
  const noteCharCount = document.getElementById('noteCharCount');
  if (noteTextarea && noteCharCount) {
    noteTextarea.addEventListener('input', (e) => {
      noteCharCount.textContent = `${e.target.value.length}/200`;
    });
  }

  // 스크롤 스파이 활성화 (카테고리 필터 모드 규격 준수)
  setupScrollSpy();
}

// 스크롤 스파이 (채용 공고문과 동일하게 카테고리 탭 클릭 시 해당 카테고리만 단독 필터링되므로 고정 유지)
function setupScrollSpy() {
  // 채용 공고문 네비게이션 표준에 맞춰 스크롤 위치에 따른 탭 강제 변경을 방지하고 사용자가 선택한 카테고리를 유지합니다.
}

// 11. 유틸리티
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 12. 스마트폰 모바일 접속 QR 모달 제어
window.openQrModal = async function() {
  const modal = document.getElementById('qrModal');
  const qrImg = document.getElementById('qrCodeImg');
  const urlText = document.getElementById('localIpUrlText');
  if (!modal) return;

  try {
    const res = await fetch('/api/network-info');
    if (res.ok) {
      const info = await res.json();
      if (info.mobile_url) {
        if (urlText) urlText.textContent = info.mobile_url;
        if (qrImg) qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(info.mobile_url)}`;
      }
    }
  } catch (e) {}

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  if (window.lucide) window.lucide.createIcons();
};

window.toggleQrModal = function(show) {
  const modal = document.getElementById('qrModal');
  if (!modal) return;
  if (show) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (window.lucide) window.lucide.createIcons();
  } else {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
};

window.copyLocalIpUrl = function() {
  const urlText = document.getElementById('localIpUrlText');
  const text = (urlText && urlText.textContent) || 'https://diverse-tattoo-exterior-reporting.trycloudflare.com/#news';
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('📋 모바일 접속 주소가 복사되었습니다.');
    });
  } else {
    prompt('모바일 접속 주소:', text);
  }
};

