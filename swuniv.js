/**
 * 전북대학교 SW중심대학사업단 프로그램 전담 모듈 (swuniv.js)
 * - 출처: https://swuniv.jbnu.ac.kr/main/jbnusw?gc=Program&do=list&page=1
 * - 규칙 준수 (GEMINI.md):
 *   - 시안 B 기반 미니멀 언더라인 탭 (font-semibold 고정, overscroll-behavior none)
 *   - 전체 건수와 개별 카테고리 건수 100% 일치 보장
 *   - 북마크 리본 아이콘 표준화 (<i data-lucide="bookmark"></i>)
 *   - 모바일 무경계 & 쾌적한 피드 레이아웃
 */

(function() {
  'use strict';

  let allPrograms = [];
  let currentCategory = 'all';
  let currentSort = 'recent'; // recent, deadline, point_high
  let swBookmarks = new Set();
  let selectedProgram = null;

  // 북마크 로드
  try {
    const saved = localStorage.getItem('civil_swuniv_bookmarks');
    if (saved) {
      swBookmarks = new Set(JSON.parse(saved));
    }
  } catch (e) {
    swBookmarks = new Set();
  }

  function saveBookmarks() {
    try {
      localStorage.setItem('civil_swuniv_bookmarks', JSON.stringify([...swBookmarks]));
    } catch (e) {}
  }

  // Lucide 아이콘 안전 생성
  function safeCreateIcons(container) {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      try {
        if (container) {
          window.lucide.createIcons({ root: container });
        } else {
          window.lucide.createIcons();
        }
      } catch (err) {
        console.warn('Lucide icon render warning:', err);
      }
    }
  }

  // 데이터 로드
  async function loadSwUnivData() {
    const indicator = document.getElementById('swunivLoadingIndicator');
    const container = document.getElementById('swunivContainer');

    if (indicator) indicator.classList.remove('hidden');
    if (container) container.classList.add('hidden');

    try {
      let resp;
      const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

      if (isLocal) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2000);
          resp = await fetch('/api/swuniv-programs?t=' + Date.now(), { signal: controller.signal });
          clearTimeout(timeoutId);
          if (!resp.ok) throw new Error('Local API failed');
        } catch (e) {
          resp = await fetch('./data/swuniv_programs.json?t=' + Date.now());
        }
      } else {
        try {
          resp = await fetch('./data/swuniv_programs.json?t=' + Date.now());
          if (!resp.ok) throw new Error('Relative fetch failed');
        } catch (e) {
          resp = await fetch('data/swuniv_programs.json?t=' + Date.now());
        }
      }

      if (!resp || !resp.ok) throw new Error('Data fetch failed');
      const data = await resp.json();
      allPrograms = data.programs || [];
    } catch (err) {
      console.error('❌ SW중심대학사업단 데이터 로드 실패:', err);
      allPrograms = [];
    } finally {
      if (indicator) indicator.classList.add('hidden');
      if (container) container.classList.remove('hidden');
      renderSwCategoryTabs();
      renderSwCards();
    }
  }

  // 카테고리 탭 렌더링 (시안 B: 미니멀 언더라인 바)
  function renderSwCategoryTabs() {
    const tabContainer = document.getElementById('swunivCategoryTabs');
    if (!tabContainer) return;

    // 카테고리 목록 동적 집계
    const counts = { all: allPrograms.length };
    allPrograms.forEach(p => {
      const cat = p.category || '일반';
      counts[cat] = (counts[cat] || 0) + 1;
    });

    const categoryList = ['all'];
    // 우선순위 정렬 카테고리
    const priority = ['SW융합', '산학협력', '교육', 'SW가치확산', '교육환경지원', 'SW기초', 'SW전공'];
    priority.forEach(cat => {
      if (counts[cat]) categoryList.push(cat);
    });

    // 기타 카테고리 추가
    Object.keys(counts).forEach(cat => {
      if (!categoryList.includes(cat)) {
        categoryList.push(cat);
      }
    });

    const categoryEmojiMap = {
      'all': '✨',
      'SW융합': '🧩',
      '산학협력': '🤝',
      '교육': '📖',
      'SW가치확산': '🌐',
      '교육환경지원': '🛠️',
      'SW기초': '💻',
      'SW전공': '🎓'
    };

    tabContainer.innerHTML = categoryList.map(cat => {
      const isAll = (cat === 'all');
      const label = isAll ? '전체' : cat;
      const count = counts[cat] || 0;
      const emoji = categoryEmojiMap[cat] || '📌';
      const isActive = (currentCategory === cat);

      const activeClasses = isActive
        ? 'border-b-2 border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 font-semibold'
        : 'border-b-2 border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 font-semibold';

      const badgeClasses = isActive
        ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 font-semibold'
        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 font-semibold';

      return `
        <button
          type="button"
          onclick="window.handleSwCategoryClick('${cat}')"
          class="flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm whitespace-nowrap cursor-pointer transition-colors select-none ${activeClasses}"
          style="font-weight: 600 !important;"
        >
          <span>${emoji}</span>
          <span>${label}</span>
          <span class="px-1.5 py-0.2 rounded-full text-[10px] sm:text-xs leading-none ${badgeClasses}" style="font-weight: 600 !important;">${count}</span>
        </button>
      `;
    }).join('');
  }

  // 필터링 및 정렬
  function getFilteredAndSortedPrograms() {
    let list = [...allPrograms];

    // 1. 카테고리 필터
    if (currentCategory !== 'all') {
      list = list.filter(p => (p.category || '일반') === currentCategory);
    }

    // 2. 정렬
    if (currentSort === 'deadline') {
      // 마감임박순: 접수중/임박(days_left >= 0) 우선 오름차순, 마감(-1)은 뒤로
      list.sort((a, b) => {
        const aLeft = a.days_left !== undefined ? a.days_left : 999;
        const bLeft = b.days_left !== undefined ? b.days_left : 999;
        const aClosed = (aLeft < 0 || a.status === '접수마감');
        const bClosed = (bLeft < 0 || b.status === '접수마감');
        if (aClosed && !bClosed) return 1;
        if (!aClosed && bClosed) return -1;
        return aLeft - bLeft;
      });
    } else if (currentSort === 'point_high') {
      // 포인트 높은순
      list.sort((a, b) => {
        const aPt = parseInt((a.point || '0').replace(/[^0-9]/g, '')) || 0;
        const bPt = parseInt((b.point || '0').replace(/[^0-9]/g, '')) || 0;
        return bPt - aPt;
      });
    }
    // 'recent'는 원본 수집 순서(최신 등록순) 유지

    return list;
  }

  // 프로그램 카드 렌더링
  function renderSwCards() {
    const grid = document.getElementById('swunivGrid');
    const countNotice = document.getElementById('swunivResultCountNotice');
    if (!grid) return;

    const list = getFilteredAndSortedPrograms();

    if (countNotice) {
      const catLabel = currentCategory === 'all' ? '전체' : currentCategory;
      countNotice.innerHTML = `총 <strong class="text-indigo-600 dark:text-indigo-400 font-bold">${list.length}</strong>건의 SW 프로그램이 있습니다. (${catLabel})`;
    }

    if (list.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full py-16 text-center text-slate-400 dark:text-slate-500">
          <i data-lucide="inbox" class="w-10 h-10 mx-auto mb-2 opacity-50"></i>
          <p class="text-sm">선택한 카테고리에 해당하는 프로그램이 없습니다.</p>
        </div>
      `;
      safeCreateIcons(grid);
      return;
    }

    grid.innerHTML = list.map(program => {
      const isBookmarked = swBookmarks.has(program.id);
      const isClosed = program.status === '접수마감';
      const isToday = program.status === '오늘마감';
      const isUpcoming = program.status === '접수예정';

      // D-Day 뱃지 스타일
      let ddayBadgeClass = 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
      if (isClosed) {
        ddayBadgeClass = 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';
      } else if (isToday) {
        ddayBadgeClass = 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 font-extrabold';
      } else if (isUpcoming) {
        ddayBadgeClass = 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 font-extrabold';
      } else {
        ddayBadgeClass = 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 font-extrabold';
      }

      // 썸네일 fallback
      const thumbnailHtml = program.thumbnail
        ? `<img src="${program.thumbnail}" alt="${program.title}" loading="lazy" class="w-full h-44 sm:h-48 object-cover group-hover:scale-105 transition-transform duration-300" onerror="this.parentElement.style.display='none'" />`
        : '';

      const pointBadge = (program.point && program.point !== '-')
        ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-bold text-[11px] border border-amber-200/80 dark:border-amber-800/60">
             <span>⭐</span>
             <span>${program.point} P</span>
           </span>`
        : '';

      const bookmarkFill = isBookmarked
        ? 'fill-amber-500 text-amber-500'
        : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200';

      return `
        <article 
          class="group bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-sm hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 transition-all duration-200 flex flex-col justify-between"
          data-program-id="${program.id}"
        >
          <!-- 상단 썸네일 이미지 영역 -->
          ${thumbnailHtml ? `
            <div class="relative overflow-hidden bg-slate-100 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800/60">
              ${thumbnailHtml}
              <div class="absolute top-2.5 left-2.5">
                <span class="px-2.5 py-1 rounded-lg text-xs font-bold bg-black/60 backdrop-blur-md text-white shadow-xs">
                  ${program.category || '일반'}
                </span>
              </div>
              <div class="absolute top-2.5 right-2.5">
                <span class="px-2.5 py-1 rounded-lg text-xs ${ddayBadgeClass} shadow-xs font-extrabold">
                  ${program.dday}
                </span>
              </div>
            </div>
          ` : ''}

          <!-- 카드 본문 -->
          <div class="p-4 sm:p-5 flex-1 flex flex-col justify-between">
            <div>
              ${!thumbnailHtml ? `
                <div class="flex items-center justify-between gap-2 mb-2.5">
                  <span class="px-2.5 py-0.5 rounded-md text-xs font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
                    ${program.category || '일반'}
                  </span>
                  <span class="px-2.5 py-0.5 rounded-md text-xs ${ddayBadgeClass} font-extrabold">
                    ${program.dday}
                  </span>
                </div>
              ` : ''}

              <!-- 헤드라인 제목 -->
              <h3 class="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 leading-snug group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-2 mb-3">
                <a href="${program.link}" target="_blank" rel="noopener noreferrer" class="hover:underline">
                  ${program.title}
                </a>
              </h3>

              <!-- 메타 정보 박스 -->
              <div class="space-y-1.5 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800/80 mb-4">
                <div class="flex items-center justify-between">
                  <span class="text-slate-400 dark:text-slate-500 font-medium">신청기간</span>
                  <span class="font-semibold text-slate-800 dark:text-slate-200">${program.apply_period}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-slate-400 dark:text-slate-500 font-medium">활동기간</span>
                  <span class="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[180px] sm:max-w-[210px]" title="${program.activity_period}">${program.activity_period}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-slate-400 dark:text-slate-500 font-medium">정원 / 장소</span>
                  <span class="font-medium text-slate-700 dark:text-slate-300">${program.capacity !== '-' ? program.capacity : '공고참조'} · ${program.location !== '-' ? program.location : '교내/온라인'}</span>
                </div>
              </div>
            </div>

            <!-- 하단 푸터 액션 영역 -->
            <div class="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
              <div class="flex items-center gap-1.5">
                ${pointBadge}
              </div>

              <div class="flex items-center gap-1.5">
                <!-- 북마크 버튼 -->
                <button
                  type="button"
                  onclick="window.toggleSwBookmark('${program.id}', event)"
                  class="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                  title="${isBookmarked ? '북마크 해제' : '북마크 저장'}"
                >
                  <i data-lucide="bookmark" class="w-4 h-4 ${bookmarkFill}"></i>
                </button>

                <!-- 공유하기 버튼 -->
                <button
                  type="button"
                  onclick="window.shareSwProgram('${program.id}', event)"
                  class="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                  title="링크 복사 및 공유"
                >
                  <i data-lucide="share-2" class="w-4 h-4"></i>
                </button>

                <!-- 공식 신청 바로가기 버튼 -->
                <a
                  href="${program.link}"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold ${isClosed ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs shadow-indigo-500/20'} transition cursor-pointer"
                >
                  <span>${isClosed ? '공고보기' : '신청하기'}</span>
                  <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                </a>
              </div>
            </div>
          </div>
        </article>
      `;
    }).join('');

    safeCreateIcons(grid);
  }

  // 북마크 토글
  window.toggleSwBookmark = function(progId, e) {
    if (e) e.stopPropagation();
    if (swBookmarks.has(progId)) {
      swBookmarks.delete(progId);
      if (typeof window.showToast === 'function') {
        window.showToast('북마크에서 제거되었습니다.');
      }
    } else {
      swBookmarks.add(progId);
      if (typeof window.showToast === 'function') {
        window.showToast('✓ 북마크에 저장되었습니다.');
      }
    }
    saveBookmarks();
    renderSwCards();
    if (typeof window.updateGlobalBookmarkCount === 'function') {
      window.updateGlobalBookmarkCount();
    }
  };

  // 공유하기
  window.shareSwProgram = function(progId, e) {
    if (e) e.stopPropagation();
    const prog = allPrograms.find(p => p.id === progId);
    if (!prog) return;

    if (navigator.share) {
      navigator.share({
        title: `[SW중심대학사업단] ${prog.title}`,
        text: `${prog.title}\n신청기간: ${prog.apply_period}`,
        url: prog.link
      }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(prog.link).then(() => {
        if (typeof window.showToast === 'function') {
          window.showToast('📋 프로그램 링크가 클립보드에 복사되었습니다.');
        } else {
          alert('프로그램 링크가 복사되었습니다.');
        }
      });
    }
  };

  // 카테고리 클릭 핸들러
  window.handleSwCategoryClick = function(cat) {
    currentCategory = cat;
    renderSwCategoryTabs();
    renderSwCards();
  };

  // 정렬 변경 핸들러
  window.handleSwSortChange = function(sortValue) {
    currentSort = sortValue;
    renderSwCards();
  };

  // 전역 초기화 함수
  window.initSwUniv = function() {
    if (allPrograms.length === 0) {
      loadSwUnivData();
    } else {
      renderSwCategoryTabs();
      renderSwCards();
    }
  };

  // 북마크 목록 조회를 위한 외부 노출 (마이페이지용)
  window.getSwBookmarks = function() {
    return allPrograms.filter(p => swBookmarks.has(p.id));
  };
  window.getSwBookmarksCount = function() {
    return swBookmarks.size;
  };

})();
