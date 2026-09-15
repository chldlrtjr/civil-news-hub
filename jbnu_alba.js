/**
 * 전북대학교 아르바이트 (JBNU Alba) - 디자인 3: 핀터레스트 매소너리 보드 & 스마트 수입 계산기
 * 규칙 준수 (GEMINI.md):
 * - 시안 B 기반 미니멀 언더라인 탭 (font-semibold 고정, overscroll-behavior none)
 * - 전체 건수와 카테고리 건수 100% 일치
 * - 북마크 리본 아이콘 표준화
 * - 모바일 무경계 & 쾌적한 피드 레이아웃
 */

(function() {
  'use strict';

  let allAlbas = [];
  let currentAlbaCategory = 'all';
  let currentAlbaSort = 'wage_high';
  let albaBookmarks = new Set();

  // 북마크 로드
  try {
    const saved = localStorage.getItem('civil_jbnu_alba_bookmarks');
    if (saved) {
      albaBookmarks = new Set(JSON.parse(saved));
    }
  } catch (e) {
    albaBookmarks = new Set();
  }

  function saveBookmarks() {
    try {
      localStorage.setItem('civil_jbnu_alba_bookmarks', JSON.stringify([...albaBookmarks]));
    } catch (e) {}
  }

  // 데이터 로드 (GitHub Pages 상대경로 ./data/ 완벽 지원)
  async function loadJbnuAlbaData() {
    const indicator = document.getElementById('jbnuAlbaLoadingIndicator');
    const container = document.getElementById('jbnuAlbaContainer');
    
    if (indicator) indicator.classList.remove('hidden');
    if (container) container.classList.add('hidden');

    try {
      let resp;
      const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      
      if (isLocal) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2000);
          resp = await fetch('/api/jbnu-albas?t=' + Date.now(), { signal: controller.signal });
          clearTimeout(timeoutId);
          if (!resp.ok) throw new Error('Local API failed');
        } catch (e) {
          resp = await fetch('./data/jbnu_albas.json?t=' + Date.now());
        }
      } else {
        // GitHub Pages 등 정적 호스팅 환경: 도메인 루트(/)가 아닌 상대 경로(./data/...)로 즉각 요청
        try {
          resp = await fetch('./data/jbnu_albas.json?t=' + Date.now());
          if (!resp.ok) throw new Error('Relative fetch failed');
        } catch (e) {
          resp = await fetch('data/jbnu_albas.json?t=' + Date.now());
        }
      }

      if (!resp || !resp.ok) throw new Error('Data fetch failed');
      const data = await resp.json();
      allAlbas = data.jobs || [];
    } catch (err) {
      console.error('❌ 전북대 알바 데이터 최종 로드 실패:', err);
      allAlbas = [];
    } finally {
      if (indicator) indicator.classList.add('hidden');
      if (container) container.classList.remove('hidden');
      renderAlbaCategoryTabs();
      renderAlbaCards();
    }
  }

  // 카테고리 탭 렌더링 (GEMINI.md 시안 B: 미니멀 언더라인 바 규격)
  function renderAlbaCategoryTabs() {
    const tabContainer = document.getElementById('jbnuAlbaCategoryTabs');
    if (!tabContainer) return;

    // 카테고리별 건수 집계
    const counts = { all: allAlbas.length };
    const categories = [
      { id: 'all', name: '전체', emoji: '✨' },
      { id: '교육', name: '학원·과외', emoji: '📚' },
      { id: '사무', name: '사무·행정', emoji: '💼' },
      { id: '제조', name: '제조·물류', emoji: '🏭' },
      { id: '외식', name: '카페·식당', emoji: '☕' },
      { id: '매장', name: '매장·서비스', emoji: '🏬' },
      { id: '기타', name: '일반·기타', emoji: '📌' }
    ];

    allAlbas.forEach(job => {
      const catId = job.category_id || '기타';
      counts[catId] = (counts[catId] || 0) + 1;
    });

    let html = '';
    categories.forEach(cat => {
      const count = counts[cat.id] || 0;
      const isActive = currentAlbaCategory === cat.id;

      if (isActive) {
        html += `
          <button onclick="window.selectAlbaCategory('${cat.id}')"
            class="alba-cat-tab border-b-2 border-emerald-600 dark:border-emerald-500 text-emerald-600 dark:text-emerald-400 font-semibold py-3 px-3 text-xs sm:text-sm flex items-center gap-1.5 transition-colors cursor-pointer flex-shrink-0 -mb-px">
            <span>${cat.emoji} ${cat.name}</span>
            <span class="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 font-semibold">${count}</span>
          </button>
        `;
      } else {
        html += `
          <button onclick="window.selectAlbaCategory('${cat.id}')"
            class="alba-cat-tab border-b-2 border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-semibold py-3 px-3 text-xs sm:text-sm flex items-center gap-1.5 transition-colors cursor-pointer flex-shrink-0 -mb-px">
            <span>${cat.emoji} ${cat.name}</span>
            <span class="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-semibold">${count}</span>
          </button>
        `;
      }
    });

    tabContainer.innerHTML = html;
  }

  // 카테고리 선택
  window.selectAlbaCategory = function(catId) {
    currentAlbaCategory = catId;
    renderAlbaCategoryTabs();
    renderAlbaCards();
  };

  // 정렬 변경
  window.handleAlbaSortChange = function(sortKey) {
    currentAlbaSort = sortKey;
    renderAlbaCards();
  };

  // 알바 카드 렌더링 (디자인 3: 핀터레스트 매소너리 & 스마트 수입 계산기)
  function renderAlbaCards() {
    const grid = document.getElementById('jbnuAlbaGrid');
    const countNotice = document.getElementById('jbnuAlbaResultCountNotice');
    if (!grid) return;

    // 필터링
    let filtered = allAlbas.filter(job => {
      if (currentAlbaCategory === 'all') return true;
      return (job.category_id || '기타') === currentAlbaCategory;
    });

    // 정렬
    filtered.sort((a, b) => {
      if (currentAlbaSort === 'wage_high') {
        return (b.estimate_amt || 0) - (a.estimate_amt || 0);
      } else if (currentAlbaSort === 'deadline') {
        const getDays = (d) => {
          if (!d) return 999;
          const m = d.match(/D-(\d+)/);
          return m ? parseInt(m[1], 10) : 900;
        };
        return getDays(a.dday) - getDays(b.dday);
      } else if (currentAlbaSort === 'views') {
        return (parseInt(b.views, 10) || 0) - (parseInt(a.views, 10) || 0);
      }
      return 0; // 최신순
    });

    // 건수 업데이트
    if (countNotice) {
      countNotice.innerHTML = `총 <strong class="text-emerald-600 dark:text-emerald-400 font-extrabold">${filtered.length}</strong>건의 아르바이트 공고`;
    }

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full py-16 text-center text-slate-500">
          <div class="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3 text-2xl">
            🔍
          </div>
          <p class="font-bold text-slate-700 dark:text-slate-300">해당 분류의 알바 공고가 없습니다.</p>
          <p class="text-xs text-slate-400 mt-1">다른 카테고리를 선택해 보세요.</p>
        </div>
      `;
      return;
    }

    let html = '';
    filtered.forEach(job => {
      const isBookmarked = albaBookmarks.has(job.id);
      const isUrgent = job.is_urgent;

      // 스마트 수입 박스 테마 컬러
      let incomeBoxClass = 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200/60 dark:border-emerald-800/50 text-emerald-800 dark:text-emerald-300';
      let incomeBadge = '💡 스마트 월 예상 수입';
      if (job.wage_type === 'daily') {
        incomeBoxClass = 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-200/60 dark:border-amber-800/50 text-amber-800 dark:text-amber-300';
        incomeBadge = '⚡ 단기 집중 예상 수입';
      } else if (job.wage_type === 'monthly') {
        incomeBoxClass = 'bg-blue-50/80 dark:bg-blue-950/30 border-blue-200/60 dark:border-blue-800/50 text-blue-800 dark:text-blue-300';
        incomeBadge = '💼 정규 파트 예상 월급';
      }

      // D-Day 뱃지
      let ddayClass = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
      if (isUrgent) {
        ddayClass = 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 font-black';
      } else if (job.dday && job.dday.includes('D-')) {
        ddayClass = 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 font-bold';
      }

      html += `
        <article class="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md hover:border-emerald-300 dark:hover:border-emerald-700 transition flex flex-col justify-between group">
          <div class="space-y-3.5">
            <!-- 1행: 카테고리 뱃지 & D-day -->
            <div class="flex items-center justify-between">
              <span class="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                <span>${job.category_emoji || '📚'}</span>
                <span>${job.category_name || '학원·과외'}</span>
              </span>
              <span class="text-xs px-2.5 py-1 rounded-full ${ddayClass}">
                ${job.dday || '접수중'}
              </span>
            </div>

            <!-- 2행: 기업/상호명 -->
            <div class="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
              <span class="font-extrabold text-blue-600 dark:text-blue-400 truncate max-w-[200px]">
                ${job.company || '전북대 인근'}
              </span>
              <span class="flex items-center gap-1">
                <i data-lucide="eye" class="w-3.5 h-3.5"></i> ${job.views || '0'}
              </span>
            </div>

            <!-- 3행: 공고 헤드라인 제목 -->
            <h3 class="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-snug group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition cursor-pointer" onclick="window.openAlbaModal('${job.id}')">
              ${job.title}
            </h3>

            <!-- 4행: 근무 조건 요약 -->
            <div class="space-y-1.5 text-xs text-slate-600 dark:text-slate-400 pt-1">
              <div class="flex items-center justify-between">
                <span class="text-slate-400">급여 형태</span>
                <strong class="font-black text-slate-900 dark:text-slate-200 text-sm text-emerald-600 dark:text-emerald-400">
                  ${job.wage_display}
                </strong>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-slate-400">근무 시간</span>
                <span class="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[200px]" title="${job.work_time}">
                  ${job.work_time}
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-slate-400">모집 인원</span>
                <span class="font-medium text-slate-700 dark:text-slate-300">
                  ${job.person}
                </span>
              </div>
            </div>

            <!-- 5행: 핵심 하이라이트 - 스마트 월 수입 자동 계산 박스 -->
            <div class="p-3.5 rounded-2xl border ${incomeBoxClass} text-center transition">
              <div class="text-[11px] font-bold tracking-tight opacity-90">${incomeBadge}</div>
              <div class="text-base sm:text-lg font-black mt-0.5 tracking-tight">
                ${job.monthly_estimate}
              </div>
              <div class="text-[10px] opacity-75 mt-0.5">
                ${job.estimate_subtext}
              </div>
            </div>
          </div>

          <!-- 6행: 하단 푸터 액션 바 -->
          <div class="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
            <div class="flex items-center gap-1">
              <!-- 북마크 리본 버튼 -->
              <button onclick="window.toggleAlbaBookmark('${job.id}', event)"
                class="p-2 rounded-xl text-slate-400 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                title="북마크 저장">
                <i data-lucide="bookmark" class="w-4 h-4 ${isBookmarked ? 'fill-amber-500 text-amber-500' : ''}"></i>
              </button>
              <!-- 공유 버튼 -->
              <button onclick="window.shareAlba('${job.id}', event)"
                class="p-2 rounded-xl text-slate-400 hover:text-blue-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                title="공유하기">
                <i data-lucide="share-2" class="w-4 h-4"></i>
              </button>
            </div>

            <!-- 상세보기 버튼 -->
            <button onclick="window.openAlbaModal('${job.id}')"
              class="px-4 py-2 rounded-xl bg-slate-900 hover:bg-emerald-600 text-white text-xs font-bold transition flex items-center gap-1 shadow-xs cursor-pointer">
              상세보기 <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </article>
      `;
    });

    grid.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
  }

  // 모달 열기
  window.openAlbaModal = function(id) {
    const job = allAlbas.find(j => j.id === id);
    if (!job) return;

    const modal = document.getElementById('jbnuAlbaModal');
    if (!modal) return;

    document.getElementById('modalAlbaCompany').innerText = job.company;
    document.getElementById('modalAlbaTitle').innerText = job.title;
    document.getElementById('modalAlbaWage').innerText = job.wage_display;
    document.getElementById('modalAlbaEstimate').innerText = job.monthly_estimate;
    document.getElementById('modalAlbaEstimateSub').innerText = job.estimate_subtext;
    document.getElementById('modalAlbaTime').innerText = job.work_time;
    document.getElementById('modalAlbaPerson').innerText = job.person;
    document.getElementById('modalAlbaViews').innerText = job.views + '회';
    document.getElementById('modalAlbaDate').innerText = job.reg_date;
    document.getElementById('modalAlbaLink').href = job.link;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.style.overflow = 'hidden';
  };

  // 모달 닫기
  window.closeAlbaModal = function() {
    const modal = document.getElementById('jbnuAlbaModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.body.style.overflow = '';
  };

  // 북마크 토글
  window.toggleAlbaBookmark = function(id, e) {
    if (e) e.stopPropagation();
    if (albaBookmarks.has(id)) {
      albaBookmarks.delete(id);
      showAlbaToast('🔖 알바 공고 북마크를 해제했습니다.');
    } else {
      albaBookmarks.add(id);
      showAlbaToast('⭐ 알바 공고가 마이페이지에 저장되었습니다.');
    }
    saveBookmarks();
    renderAlbaCards();
  };

  // 공유하기
  window.shareAlba = function(id, e) {
    if (e) e.stopPropagation();
    const job = allAlbas.find(j => j.id === id);
    if (!job) return;

    if (navigator.share) {
      navigator.share({
        title: `[전북대 알바] ${job.company} - ${job.title}`,
        text: `급여: ${job.wage_display} (${job.monthly_estimate}) | 근무시간: ${job.work_time}`,
        url: job.link
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(job.link).then(() => {
        showAlbaToast('🔗 공고 링크가 클립보드에 복사되었습니다.');
      });
    }
  };

  function showAlbaToast(msg) {
    if (typeof window.showToast === 'function') {
      window.showToast(msg);
      return;
    }
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-2xl bg-slate-900 text-white text-xs font-bold shadow-xl flex items-center gap-2 animate-fade-in';
    toast.innerHTML = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }

  // 전역 초기화 함수 노출
  window.initJbnuAlba = function() {
    if (allAlbas && allAlbas.length > 0) {
      const indicator = document.getElementById('jbnuAlbaLoadingIndicator');
      const container = document.getElementById('jbnuAlbaContainer');
      if (indicator) indicator.classList.add('hidden');
      if (container) container.classList.remove('hidden');
      renderAlbaCategoryTabs();
      renderAlbaCards();
    } else {
      loadJbnuAlbaData();
    }
  };

  // DOMContentLoaded 또는 즉시 로드 (스크립트 로드 시점과 무관하게 100% 보장)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      loadJbnuAlbaData();
    });
  } else {
    loadJbnuAlbaData();
  }

})();
