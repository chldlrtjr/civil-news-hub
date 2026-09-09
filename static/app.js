// Civil News Hub Frontend Application (SPA Master Controller & News Dashboard)

// 1. 상태 변수
let currentMainTab = 'news'; // 'news' | 'jobs' | 'contests'

// 뉴스 데이터 상태
let allArticles = [];
let categories = [];
let activeNewsCategory = 'general';
let isNewsBookmarkView = false;
let newsSearchQuery = '';
let currentNewsSort = 'newest';
let newsBookmarks = new Set();
let userViews = {};

// 페이징 (카테고리별 초기 6개 표시)
const CATEGORY_PAGE_SIZE = 6;
let categoryDisplayedCount = {};

// 2. 초기화
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadNewsBookmarks();
  loadUserViews();
  setupNewsEventListeners();
  loadNewsData();
  initTabRouting();
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
  updateGlobalBookmarkCount();
}

function toggleBookmark(articleId, e) {
  if (e) e.stopPropagation();
  if (newsBookmarks.has(articleId)) {
    newsBookmarks.delete(articleId);
    showToast('북마크에서 제거되었습니다.');
  } else {
    newsBookmarks.add(articleId);
    showToast('⭐ 기사가 북마크에 저장되었습니다.');
  }
  localStorage.setItem('civil_bookmarks', JSON.stringify(Array.from(newsBookmarks)));
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
    }

    const data = await res.json();
    allArticles = data.articles || [];
    categories = data.categories || [];
    
    // 메타데이터 업데이트
    const updatedEl = document.getElementById('newsLastUpdated');
    if (updatedEl) updatedEl.textContent = data.last_updated_display || '방금 전';
    
    const countEl = document.getElementById('newsTotalCount');
    if (countEl) countEl.textContent = `${allArticles.length}건`;

    renderCategoryTabs();
    renderArticles();
  } catch (err) {
    console.error('뉴스 데이터 로드 실패:', err);
    showToast('⚠️ 뉴스 데이터를 불러오지 못했습니다.');
  } finally {
    showNewsLoading(false);
  }
}

// 카테고리 탭 렌더링 (전체 기사 탭 없이 5개 카테고리 섹션 바로가기 네비게이션)
function renderCategoryTabs() {
  const container = document.getElementById('newsCategoryTabs');
  if (!container) return;
  container.innerHTML = '';

  const targetCategories = categories.filter(c => c.id !== 'all');

  targetCategories.forEach(cat => {
    const isCatActive = !isNewsBookmarkView && activeNewsCategory === cat.id;
    const catCount = allArticles.filter(a => a.category_id === cat.id).length;

    const btn = document.createElement('button');
    btn.className = `flex-shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition cursor-pointer ${
      isCatActive 
        ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-500/30' 
        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
    }`;
    btn.innerHTML = `<span>${cat.name}</span><span class="text-[10px] px-1.5 py-0.2 rounded-full ${isCatActive ? 'bg-blue-800/60 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}">${catCount}</span>`;
    btn.addEventListener('click', () => {
      if (isNewsBookmarkView) {
        isNewsBookmarkView = false;
        updateBookmarkTabStyle();
        renderArticles();
      }
      activeNewsCategory = cat.id;
      renderCategoryTabs();
      scrollToCategory(cat.id);
    });
    container.appendChild(btn);
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

// 검색 및 필터 헬퍼
function filterBySearch(articles) {
  if (!newsSearchQuery) return articles;
  const q = newsSearchQuery.toLowerCase();
  return articles.filter(a => {
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
  const badgeColorClass = `badge-${article.badge_color || 'slate'}`;
  const totalViews = (article.views || 0) + (userViews[article.id] || 0);
  const hasRelated = article.related_articles && article.related_articles.length > 0;
  const relatedCount = hasRelated ? article.related_articles.length : 0;
  const summaryPoints = generateArticleSummaryPoints(article);
  const cleanSnippet = getArticleCleanSnippet(article);
  
  return `
    <article class="news-card flex flex-col justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-blue-400 dark:hover:border-blue-500/50 transition">
      <div>
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

        <h3 class="font-bold text-base text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 leading-snug line-clamp-2 mb-2 transition">
          <a href="${article.link}" target="_blank" rel="noopener noreferrer" onclick="recordView('${article.id}')">
            ${escapeHtml(article.title)}
          </a>
        </h3>

        <!-- 3줄 핵심 브리핑 리스트 (상시 노출) -->
        <div class="mb-3.5 p-3 rounded-xl bg-slate-50/80 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800">
          <ul class="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
            ${summaryPoints.map((point) => `
              <li class="flex items-start gap-2 leading-relaxed">
                <span class="w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-blue-400 mt-1.5 flex-shrink-0"></span>
                <span class="flex-1 line-clamp-2">${escapeHtml(point)}</span>
              </li>
            `).join('')}
          </ul>
        </div>

        ${hasRelated ? `
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

      <div class="pt-3 mt-auto border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
        <span class="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1 truncate max-w-[120px] sm:max-w-[140px]">
          <i data-lucide="building" class="w-3.5 h-3.5 flex-shrink-0 text-slate-400"></i>
          <span class="truncate">${escapeHtml(article.publisher)}</span>
        </span>

        <div class="flex items-center gap-1.5">
          <!-- 기사 공유 버튼 -->
          <button 
            onclick="shareArticle('${article.id}', event)"
            title="기사 공유하기"
            class="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
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

          <!-- 원문 보러가기 버튼 -->
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

// 6. 메인 뉴스 렌더링
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
      if (notice) notice.textContent = '북마크된 기사가 없습니다.';
      return;
    }

    if (emptyState) {
      emptyState.classList.add('hidden');
      emptyState.classList.remove('flex');
    }
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
          <button onclick="activeNewsCategory='all'; isNewsBookmarkView=false; renderCategoryTabs(); updateBookmarkTabStyle(); renderArticles();" class="text-xs text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 flex items-center gap-1 cursor-pointer">
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

  // 검색어가 있을 때
  if (newsSearchQuery) {
    const searchResults = filterBySearch(allArticles);
    sortArticlesList(searchResults);

    if (searchResults.length === 0) {
      container.innerHTML = '';
      if (emptyState) {
        emptyState.classList.remove('hidden');
        emptyState.classList.add('flex');
      }
      if (notice) notice.textContent = `'${newsSearchQuery}' 검색 결과가 없습니다.`;
      return;
    }

    if (emptyState) {
      emptyState.classList.add('hidden');
      emptyState.classList.remove('flex');
    }
    if (notice) notice.textContent = `'${newsSearchQuery}' 검색 결과 총 ${searchResults.length}건`;

    container.innerHTML = `
      <section class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl p-5 sm:p-7 shadow-xs">
        <div class="flex items-center justify-between pb-4 mb-5 border-b border-slate-100 dark:border-slate-800">
          <div class="flex items-center gap-2">
            <h3 class="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              '${newsSearchQuery}' 검색 결과
              <span class="text-xs px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-semibold border border-blue-200 dark:border-blue-900">
                ${searchResults.length}건
              </span>
            </h3>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          ${searchResults.map(renderArticleCard).join('')}
        </div>
      </section>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  // 기본 상태: 모든 5개 카테고리 섹션을 한 페이지에 전부 순서대로 렌더링
  const renderedCategories = categories.filter(c => c.id !== 'all');

  const sectionsHtml = renderedCategories.map(cat => {
    let catArticles = allArticles.filter(a => a.category_id === cat.id);
    sortArticlesList(catArticles);

    if (catArticles.length === 0) return '';

    const currentCount = categoryDisplayedCount[cat.id] || CATEGORY_PAGE_SIZE;
    const displayedArticles = catArticles.slice(0, currentCount);
    const hasMore = catArticles.length > currentCount;
    const remainingCount = catArticles.length - currentCount;

    return `
      <section id="section-${cat.id}" class="scroll-mt-16 sm:scroll-mt-36 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl sm:rounded-3xl p-5 sm:p-7 shadow-xs">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-5 border-b border-slate-100 dark:border-slate-800 gap-2">
          <div>
            <div class="flex items-center gap-2">
              <span class="px-2.5 py-0.5 rounded-md text-xs font-bold bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                ${cat.code || '섹션'}
              </span>
              <h3 class="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                ${cat.name}
              </h3>
              <span class="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-semibold border border-slate-200 dark:border-slate-700">
                총 ${catArticles.length}건
              </span>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
              ${cat.description || '최신 토목 인프라 및 기술 뉴스'}
            </p>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          ${displayedArticles.map(renderArticleCard).join('')}
        </div>

        ${hasMore ? `
          <div class="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
            <button 
              onclick="loadMoreCategoryArticles('${cat.id}')"
              class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 hover:bg-blue-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-semibold border border-slate-200 dark:border-slate-700 transition group shadow-xs cursor-pointer active:scale-95"
            >
              <span>${cat.name} 기사 더보기 (+${Math.min(remainingCount, CATEGORY_PAGE_SIZE)}개)</span>
              <i data-lucide="chevron-down" class="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-transform group-hover:translate-y-0.5"></i>
            </button>
          </div>
        ` : ''}
      </section>
    `;
  }).filter(Boolean).join('');

  if (emptyState) {
    emptyState.classList.add('hidden');
    emptyState.classList.remove('flex');
  }

  if (notice) {
    notice.textContent = `주요 토목 분야별 브리핑 (총 ${allArticles.length}건)`;
  }

  container.innerHTML = sectionsHtml;
  if (window.lucide) window.lucide.createIcons();
}

function loadMoreCategoryArticles(catId) {
  const currentCount = categoryDisplayedCount[catId] || CATEGORY_PAGE_SIZE;
  categoryDisplayedCount[catId] = currentCount + CATEGORY_PAGE_SIZE;
  renderArticles();
}

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
window.switchMainTab = function(tabName, updateHash = true) {
  currentMainTab = tabName;

  const panelNews = document.getElementById('tabPanelNews');
  const panelJobs = document.getElementById('tabPanelJobs');
  const panelContests = document.getElementById('tabPanelContests');

  if (panelNews) panelNews.classList.toggle('hidden', tabName !== 'news');
  if (panelJobs) panelJobs.classList.toggle('hidden', tabName !== 'jobs');
  if (panelContests) panelContests.classList.toggle('hidden', tabName !== 'contests');

  // GNB 버튼 스타일 갱신
  updateGnbTabStyles(tabName);

  // 모바일 하단바 탭 스타일 갱신
  updateMobileNavStyles(tabName);

  // 헤더 및 모바일 북마크 카운트 동기화
  updateGlobalBookmarkCount();

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
    { id: 'mobileTabContests', key: 'contests', activeColor: 'text-amber-500' }
  ];

  tabs.forEach(t => {
    const el = document.getElementById(t.id);
    if (!el) return;
    const isActive = t.key === activeTab;
    if (isActive) {
      el.className = `flex flex-col items-center justify-center py-1 px-3 ${t.activeColor} font-bold transition cursor-pointer`;
    } else {
      el.className = 'flex flex-col items-center justify-center py-1 px-3 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 font-medium transition cursor-pointer';
    }
  });
}

// 통합 북마크 뱃지 카운터
window.updateGlobalBookmarkCount = function() {
  let count = 0;
  if (currentMainTab === 'news') {
    count = newsBookmarks.size;
  } else if (currentMainTab === 'jobs') {
    count = (typeof jobBookmarks !== 'undefined') ? jobBookmarks.size : 0;
  } else if (currentMainTab === 'contests') {
    count = (typeof contestBookmarks !== 'undefined') ? contestBookmarks.size : 0;
  }

  const countEl = document.getElementById('bookmarkCount');
  if (countEl) countEl.textContent = count;

  const mobileBadge = document.getElementById('mobileBookmarkBadge');
  if (mobileBadge) {
    mobileBadge.textContent = count;
    if (count > 0) {
      mobileBadge.classList.remove('hidden');
    } else {
      mobileBadge.classList.add('hidden');
    }
  }

  updateBookmarkTabStyle();
};

// 북마크 탭 버튼 스타일 갱신
function updateBookmarkTabStyle() {
  let isCurrentBookmarkActive = false;
  if (currentMainTab === 'news') {
    isCurrentBookmarkActive = isNewsBookmarkView;
  } else if (currentMainTab === 'jobs') {
    isCurrentBookmarkActive = (typeof isJobBookmarkView !== 'undefined') ? isJobBookmarkView : false;
  } else if (currentMainTab === 'contests') {
    isCurrentBookmarkActive = (typeof isContestBookmarkView !== 'undefined') ? isContestBookmarkView : false;
  }

  const bookmarkBtn = document.getElementById('bookmarkTabBtn');
  if (bookmarkBtn) {
    if (isCurrentBookmarkActive) {
      bookmarkBtn.className = 'flex-shrink-0 flex items-center px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium transition bg-amber-500 text-white shadow-sm shadow-amber-500/20 cursor-pointer border border-amber-500';
    } else {
      bookmarkBtn.className = 'flex-shrink-0 flex items-center px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium transition border border-amber-300/90 dark:border-amber-700/60 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 cursor-pointer shadow-xs';
    }
  }

  const mobileBtn = document.getElementById('mobileBookmarkBtn');
  if (mobileBtn) {
    if (isCurrentBookmarkActive) {
      mobileBtn.className = 'relative flex flex-col items-center justify-center py-1 px-3 text-amber-500 font-bold transition cursor-pointer';
    } else {
      mobileBtn.className = 'relative flex flex-col items-center justify-center py-1 px-3 text-slate-500 dark:text-slate-400 hover:text-amber-500 dark:hover:text-amber-400 font-medium transition cursor-pointer';
    }
  }
}

// 통합 북마크 토글
window.toggleCurrentTabBookmark = function() {
  if (currentMainTab === 'news') {
    isNewsBookmarkView = !isNewsBookmarkView;
    renderCategoryTabs();
    updateBookmarkTabStyle();
    renderArticles();
  } else if (currentMainTab === 'jobs') {
    if (window.toggleJobBookmarkFilter) {
      window.toggleJobBookmarkFilter();
    }
  } else if (currentMainTab === 'contests') {
    if (window.toggleContestBookmarkFilter) {
      window.toggleContestBookmarkFilter();
    }
  }
  updateBookmarkTabStyle();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// URL 해시 라우팅 초기화
function initTabRouting() {
  const hash = (window.location.hash || '').replace('#', '').toLowerCase();
  if (hash === 'jobs') {
    switchMainTab('jobs', false);
  } else if (hash === 'contests') {
    switchMainTab('contests', false);
  } else {
    switchMainTab('news', false);
  }

  window.addEventListener('hashchange', () => {
    const newHash = (window.location.hash || '').replace('#', '').toLowerCase();
    if (newHash === 'jobs') switchMainTab('jobs', false);
    else if (newHash === 'contests') switchMainTab('contests', false);
    else switchMainTab('news', false);
  });
}

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

  // 북마크 탭 버튼 (헤더 및 모바일 하단바)
  const bookmarkTabBtn = document.getElementById('bookmarkTabBtn');
  if (bookmarkTabBtn) bookmarkTabBtn.addEventListener('click', window.toggleCurrentTabBookmark);

  const mobileBookmarkBtn = document.getElementById('mobileBookmarkBtn');
  if (mobileBookmarkBtn) mobileBookmarkBtn.addEventListener('click', window.toggleCurrentTabBookmark);

  // 뉴스 검색창
  const searchInput = document.getElementById('newsSearchInput');
  const clearBtn = document.getElementById('clearNewsSearchBtn');
  if (searchInput && clearBtn) {
    searchInput.addEventListener('input', (e) => {
      newsSearchQuery = e.target.value.trim();
      categoryDisplayedCount = {};
      if (newsSearchQuery) {
        clearBtn.classList.remove('hidden');
      } else {
        clearBtn.classList.add('hidden');
      }
      renderArticles();
    });

    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      newsSearchQuery = '';
      categoryDisplayedCount = {};
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
      activeNewsCategory = (categories[0] && categories[0].id) || 'general';
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

  // 스크롤 스파이 활성화
  setupScrollSpy();
}

// 스크롤 시 현재 뷰포트에 위치한 섹션을 감지하여 상단 카테고리 탭 active 동기화
function setupScrollSpy() {
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (currentMainTab !== 'news' || isNewsBookmarkView || newsSearchQuery) return;
    if (!ticking) {
      window.requestAnimationFrame(() => {
        const targetCategories = categories.filter(c => c.id !== 'all');
        const scrollPosition = window.pageYOffset + (window.innerWidth < 640 ? 80 : 180);
        
        for (let i = targetCategories.length - 1; i >= 0; i--) {
          const cat = targetCategories[i];
          const section = document.getElementById(`section-${cat.id}`);
          if (section && section.offsetTop <= scrollPosition) {
            if (activeNewsCategory !== cat.id) {
              activeNewsCategory = cat.id;
              renderCategoryTabs();
            }
            break;
          }
        }
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
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
  const text = (urlText && urlText.textContent) || 'http://192.168.25.58:8000/#news';
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('📋 모바일 접속 주소가 복사되었습니다.');
    });
  } else {
    prompt('모바일 접속 주소:', text);
  }
};

