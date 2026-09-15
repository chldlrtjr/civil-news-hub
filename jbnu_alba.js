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
        const getWage = (j) => (j.sort_wage !== undefined ? j.sort_wage : (j.estimate_amt || 0));
        return getWage(b) - getWage(a);
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

      // 급여 형태 및 조건별 테마 스타일
      let payBoxClass = 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200/60 dark:border-emerald-800/50 text-emerald-900 dark:text-emerald-200';
      let payBadge = job.pay_badge || '⏱️ 시급제 알바';
      let payHighlight = job.pay_highlight || job.wage_display || job.monthly_estimate || '급여 협의';
      let paySubtext = job.pay_subtext || job.estimate_subtext || job.work_time || '';

      if (job.wage_type === 'daily') {
        payBoxClass = 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-200/60 dark:border-amber-800/50 text-amber-950 dark:text-amber-200';
      } else if (job.wage_type === 'monthly') {
        payBoxClass = 'bg-blue-50/80 dark:bg-blue-950/30 border-blue-200/60 dark:border-blue-800/50 text-blue-950 dark:text-blue-200';
      } else if (job.wage_type === 'negotiable') {
        payBoxClass = 'bg-slate-50/90 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300';
      }

      // D-Day 뱃지
      let ddayClass = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
      if (isUrgent) {
        ddayClass = 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 font-black';
      } else if (job.dday && job.dday.includes('D-')) {
        ddayClass = 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 font-bold';
      }

      html += `
        <article class="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md hover:border-emerald-400 dark:hover:border-emerald-600 transition flex flex-col justify-between group cursor-pointer"
          onclick="window.open('${job.link}', '_blank', 'noopener,noreferrer')">
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
            <h3 class="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-snug group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition">
              ${job.title}
            </h3>

            <!-- 4행: 근무 조건 요약 -->
            <div class="space-y-1.5 text-xs text-slate-600 dark:text-slate-400 pt-1">
              <div class="flex items-center justify-between">
                <span class="text-slate-400">급여 안내</span>
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

            <!-- 5행: 핵심 하이라이트 - 팩트 기반 급여 & 근무 안내 박스 -->
            <div class="p-3.5 rounded-2xl border ${payBoxClass} text-center transition">
              <div class="text-[11px] font-bold tracking-tight opacity-90">${payBadge}</div>
              <div class="text-base sm:text-lg font-black mt-0.5 tracking-tight">
                ${payHighlight}
              </div>
              <div class="text-[10px] opacity-80 mt-0.5 truncate" title="${paySubtext}">
                ${paySubtext}
              </div>
            </div>
          </div>

          <!-- 6행: 하단 푸터 액션 바 -->
          <div class="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2" onclick="event.stopPropagation()">
            <div class="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 font-medium">
              <i data-lucide="calendar" class="w-3.5 h-3.5"></i>
              <span>${job.reg_date || '최근 등록'}</span>
            </div>

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
          </div>
        </article>
      `;
    });

    grid.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
  }

  // 공고 바로가기 (알바 클릭 시 공고 원문 새 창 이동)
  window.openAlbaModal = function(id) {
    const job = allAlbas.find(j => j.id === id);
    if (job && job.link) {
      window.open(job.link, '_blank', 'noopener,noreferrer');
    }
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

  // ==========================================
  // 전북대학교 아르바이트 일정 캘린더 엔진
  // ==========================================
  let albaCalendarCurrentYear = new Date().getFullYear();
  let albaCalendarCurrentMonth = new Date().getMonth();
  let albaCalendarFilter = 'all'; // 'all', 'deadline', 'work'
  let albaCalendarSelectedDay = null; // null: 이번 달 전체, 숫자(1~31): 해당 일자 알바만 필터링

  function getJobScheduleInfo(job) {
    const today = new Date();
    let deadlineDateObj = null;
    let deadlineStr = job.deadline_date;

    if (!deadlineStr && job.dday) {
      if (job.dday === 'D-day' || job.dday === 'D-0' || job.dday === 'D-Day') {
        deadlineStr = job.reg_date || today.toISOString().slice(0, 10);
      } else if (job.dday.startsWith('D-')) {
        const days = parseInt(job.dday.replace('D-', ''), 10);
        if (!isNaN(days)) {
          const base = job.reg_date ? new Date(job.reg_date) : new Date();
          base.setDate(base.getDate() + days);
          deadlineStr = base.toISOString().slice(0, 10);
        }
      }
    }

    if (deadlineStr) {
      const parts = deadlineStr.split('-');
      if (parts.length === 3) {
        deadlineDateObj = {
          year: parseInt(parts[0], 10),
          month: parseInt(parts[1], 10) - 1, // 0-indexed
          day: parseInt(parts[2], 10),
          dateStr: deadlineStr
        };
      }
    }

    const workDateObjs = [];
    const rawWorkDates = (job.work_dates && Array.isArray(job.work_dates)) ? [...job.work_dates] : [];
    
    // 비정형 텍스트 보조 파싱 (단기 알바 근무일자 추출)
    if (rawWorkDates.length === 0) {
      const fullTxt = (job.title || '') + ' ' + (job.work_time || '');
      const rangeMatch = fullTxt.match(/(\d{1,2})[/\.월]\s*(\d{1,2})일?\s*[~-]\s*(\d{1,2})[/\.월]\s*(\d{1,2})일?/);
      if (rangeMatch) {
        const m1 = parseInt(rangeMatch[1], 10), d1 = parseInt(rangeMatch[2], 10);
        const m2 = parseInt(rangeMatch[3], 10), d2 = parseInt(rangeMatch[4], 10);
        const curY = job.reg_date ? parseInt(job.reg_date.split('-')[0], 10) : today.getFullYear();
        const start = new Date(curY, m1 - 1, d1);
        const end = new Date(curY, m2 - 1, d2);
        if (end >= start && (end - start) / (1000 * 60 * 60 * 24) <= 31) {
          const cur = new Date(start);
          while (cur <= end) {
            rawWorkDates.push(cur.toISOString().slice(0, 10));
            cur.setDate(cur.getDate() + 1);
          }
        }
      }
      const singleMatches = fullTxt.matchAll(/(\d{1,2})월\s*(\d{1,2})일/g);
      for (const sm of singleMatches) {
        const m = parseInt(sm[1], 10), d = parseInt(sm[2], 10);
        const curY = job.reg_date ? parseInt(job.reg_date.split('-')[0], 10) : today.getFullYear();
        const ds = `${curY}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (!rawWorkDates.includes(ds)) rawWorkDates.push(ds);
      }
    }

    rawWorkDates.forEach(ds => {
      const p = ds.split('-');
      if (p.length === 3) {
        workDateObjs.push({
          year: parseInt(p[0], 10),
          month: parseInt(p[1], 10) - 1,
          day: parseInt(p[2], 10),
          dateStr: ds
        });
      }
    });

    return {
      deadline: deadlineDateObj,
      workDates: workDateObjs
    };
  }

  function openAlbaCalendarModal() {
    const modal = document.getElementById('albaCalendarModal');
    const backdrop = document.getElementById('albaCalendarBackdrop');
    if (!modal || !backdrop) return;

    const today = new Date();
    albaCalendarCurrentYear = today.getFullYear();
    albaCalendarCurrentMonth = today.getMonth();
    albaCalendarSelectedDay = null; // 초기화: 전체 일정

    renderAlbaCalendar(albaCalendarCurrentYear, albaCalendarCurrentMonth);

    modal.classList.remove('invisible', 'opacity-0');
    modal.classList.add('visible', 'opacity-100');
    backdrop.classList.remove('opacity-0');
    backdrop.classList.add('opacity-100');
    document.body.classList.add('overflow-hidden');
    if (window.lucide) window.lucide.createIcons();
  }

  function closeAlbaCalendarModal() {
    const modal = document.getElementById('albaCalendarModal');
    const backdrop = document.getElementById('albaCalendarBackdrop');
    if (!modal || !backdrop) return;

    modal.classList.remove('visible', 'opacity-100');
    modal.classList.add('invisible', 'opacity-0');
    backdrop.classList.remove('opacity-100');
    backdrop.classList.add('opacity-0');
    document.body.classList.remove('overflow-hidden');
  }

  function changeAlbaCalendarMonth(delta) {
    albaCalendarCurrentMonth += delta;
    if (albaCalendarCurrentMonth < 0) {
      albaCalendarCurrentMonth = 11;
      albaCalendarCurrentYear -= 1;
    } else if (albaCalendarCurrentMonth > 11) {
      albaCalendarCurrentMonth = 0;
      albaCalendarCurrentYear += 1;
    }
    albaCalendarSelectedDay = null; // 월 변경 시 날짜 선택 초기화
    renderAlbaCalendar(albaCalendarCurrentYear, albaCalendarCurrentMonth);
  }

  function resetAlbaCalendarToToday() {
    const today = new Date();
    albaCalendarCurrentYear = today.getFullYear();
    albaCalendarCurrentMonth = today.getMonth();
    albaCalendarSelectedDay = today.getDate(); // 오늘 일자 자동 선택
    renderAlbaCalendar(albaCalendarCurrentYear, albaCalendarCurrentMonth);
  }

  function selectAlbaCalendarDay(day) {
    if (day === null) {
      albaCalendarSelectedDay = null;
    } else if (albaCalendarSelectedDay === day) {
      albaCalendarSelectedDay = null; // 이미 선택된 날짜 재클릭 시 전체 보기 토글
    } else {
      albaCalendarSelectedDay = day;
    }
    renderAlbaCalendar(albaCalendarCurrentYear, albaCalendarCurrentMonth);

    // 날짜 선택 시 하단 타임라인으로 부드럽게 스크롤
    if (albaCalendarSelectedDay !== null) {
      setTimeout(() => {
        const timelineTitle = document.getElementById('albaCalendarMonthTimelineTitle');
        if (timelineTitle) {
          timelineTitle.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 50);
    }
  }

  function setAlbaCalendarFilter(type) {
    albaCalendarFilter = type;
    const btnAll = document.getElementById('albaCalFilterAll');
    const btnDead = document.getElementById('albaCalFilterDeadline');
    const btnWork = document.getElementById('albaCalFilterWork');

    const activeCls = ['bg-emerald-600', 'text-white', 'shadow-xs'];
    const inactiveCls = ['text-slate-600', 'dark:text-slate-300', 'hover:bg-slate-200', 'dark:hover:bg-slate-700'];

    [btnAll, btnDead, btnWork].forEach(btn => {
      if (!btn) return;
      btn.classList.remove(...activeCls, ...inactiveCls);
    });

    if (type === 'all' && btnAll) btnAll.classList.add(...activeCls);
    else if (btnAll) btnAll.classList.add(...inactiveCls);

    if (type === 'deadline' && btnDead) btnDead.classList.add(...activeCls);
    else if (btnDead) btnDead.classList.add(...inactiveCls);

    if (type === 'work' && btnWork) btnWork.classList.add(...activeCls);
    else if (btnWork) btnWork.classList.add(...inactiveCls);

    renderAlbaCalendar(albaCalendarCurrentYear, albaCalendarCurrentMonth);
  }

  function renderAlbaCalendar(year, month) {
    const monthDisplay = document.getElementById('albaCalendarCurrentMonthDisplay');
    const daysGrid = document.getElementById('albaCalendarDaysGrid');
    const timelineTitle = document.getElementById('albaCalendarMonthTimelineTitle');
    const timelineList = document.getElementById('albaCalendarTimelineList');
    if (!daysGrid) return;

    if (monthDisplay) {
      monthDisplay.textContent = `${year}년 ${month + 1}월`;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevMonthTotalDays = new Date(year, month, 0).getDate();

    // 이 달의 스케줄 이벤트 수집
    const monthEvents = [];
    const dayEventMap = {};

    allAlbas.forEach(job => {
      const sched = getJobScheduleInfo(job);

      // 마감일 수집
      if (albaCalendarFilter === 'all' || albaCalendarFilter === 'deadline') {
        if (sched.deadline && sched.deadline.year === year && sched.deadline.month === month) {
          const item = {
            job,
            type: 'deadline',
            typeLabel: '⏱️ 마감',
            day: sched.deadline.day,
            dateStr: sched.deadline.dateStr
          };
          monthEvents.push(item);
          if (!dayEventMap[sched.deadline.day]) dayEventMap[sched.deadline.day] = [];
          dayEventMap[sched.deadline.day].push(item);
        }
      }

      // 단기·행사 근무일 수집
      if (albaCalendarFilter === 'all' || albaCalendarFilter === 'work') {
        (sched.workDates || []).forEach(w => {
          if (w.year === year && w.month === month) {
            const item = {
              job,
              type: 'work',
              typeLabel: '⚡ 근무일',
              day: w.day,
              dateStr: w.dateStr
            };
            monthEvents.push(item);
            if (!dayEventMap[w.day]) dayEventMap[w.day] = [];
            dayEventMap[w.day].push(item);
          }
        });
      }
    });

    // 캘린더 일자 그리드 생성
    let gridHtml = '';

    // 이전 달 패딩
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
      const isSelected = (albaCalendarSelectedDay === day);
      const items = dayEventMap[day] || [];
      const hasItems = items.length > 0;

      let dayColorClass = 'text-slate-700 dark:text-slate-300';
      if (dayOfWeek === 0) dayColorClass = 'text-rose-500';
      if (dayOfWeek === 6) dayColorClass = 'text-blue-500';

      gridHtml += `
        <div 
          class="relative flex flex-col items-start p-1 sm:p-1.5 rounded-xl border transition cursor-pointer min-h-[56px] sm:min-h-[68px] ${
            isSelected
              ? 'ring-2 ring-emerald-500 border-emerald-500 bg-emerald-100/70 dark:bg-emerald-950/80 shadow-md transform scale-[1.02] z-10'
              : isToday
              ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-xs hover:border-emerald-400'
              : hasItems
              ? 'border-emerald-200 dark:border-emerald-900/60 bg-white dark:bg-slate-800 hover:border-emerald-400 shadow-xs'
              : 'border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900/50 hover:bg-slate-50 dark:hover:bg-slate-800/40'
          }"
          onclick="selectAlbaCalendarDay(${day})"
          title="${day}일 클릭: ${hasItems ? `${items.length}건 일정 보기` : '이 날짜 알바 보기'}"
        >
          <div class="flex items-center justify-between w-full mb-0.5">
            <span class="text-[11px] sm:text-xs font-bold ${dayColorClass} ${
              isSelected
                ? 'px-1.5 py-0.2 rounded-md bg-emerald-700 text-white font-black'
                : isToday
                ? 'px-1.5 py-0.2 rounded-md bg-emerald-600 text-white'
                : ''
            }">
              ${day}
            </span>
            ${hasItems ? `
              <span class="px-1 py-0.2 rounded-full text-[9px] font-bold ${
                isSelected
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300/80'
              }">
                ${items.length}
              </span>
            ` : ''}
          </div>
          ${hasItems ? `
            <div class="w-full space-y-0.5 overflow-hidden mt-0.5">
              ${items.slice(0, 1).map(ev => `
                <div class="truncate text-[9px] sm:text-[10px] ${ev.type === 'work' ? 'text-amber-900 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/60' : 'text-emerald-900 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/60'} rounded px-1 py-0.5 font-medium leading-tight">
                  ${ev.type === 'work' ? '⚡ ' : '⏱️ '}${escapeAlbaHtml(ev.job.company || ev.job.title)}
                </div>
              `).join('')}
              ${items.length > 1 ? `
                <div class="text-[9px] ${isSelected ? 'text-emerald-800 dark:text-emerald-200 font-extrabold' : 'text-emerald-600 dark:text-emerald-400 font-semibold'} pl-0.5">
                  +${items.length - 1}개 더보기
                </div>
              ` : ''}
            </div>
          ` : ''}
        </div>
      `;
    }

    // 다음 달 패딩
    const remainingCells = (7 - ((firstDay + totalDays) % 7)) % 7;
    for (let d = 1; d <= remainingCells; d++) {
      gridHtml += `
        <div class="p-1 sm:p-1.5 rounded-xl bg-slate-50/50 dark:bg-slate-900/40 text-slate-300 dark:text-slate-700 min-h-[56px] sm:min-h-[68px] flex flex-col justify-start select-none border border-transparent">
          <span class="text-[11px] font-semibold">${d}</span>
        </div>
      `;
    }

    daysGrid.innerHTML = gridHtml;

    // 해당 날짜 클릭 시 해당 날짜 알바들만 필터링
    const displayEvents = (albaCalendarSelectedDay !== null)
      ? monthEvents.filter(ev => ev.day === albaCalendarSelectedDay)
      : monthEvents;

    // 타임라인 타이틀 렌더링
    if (timelineTitle) {
      if (albaCalendarSelectedDay !== null) {
        const dt = new Date(year, month, albaCalendarSelectedDay);
        const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
        const dayName = dayNames[dt.getDay()];
        timelineTitle.innerHTML = `
          <div class="flex items-center justify-between w-full">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-emerald-600 dark:text-emerald-400 font-black">${month + 1}월 ${albaCalendarSelectedDay}일 (${dayName})</span>
              <span>알바 일정 (${displayEvents.length}건)</span>
            </div>
            <button 
              type="button" 
              onclick="selectAlbaCalendarDay(null); event.stopPropagation();" 
              class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700 transition cursor-pointer flex-shrink-0"
              title="이번 달 전체 일정 다시 보기"
            >
              <i data-lucide="rotate-ccw" class="w-3 h-3"></i>
              <span>전체 날짜 보기</span>
            </button>
          </div>
        `;
      } else {
        const filterLabel = albaCalendarFilter === 'deadline' ? '마감 예정' : albaCalendarFilter === 'work' ? '근무·행사' : '전체';
        timelineTitle.innerHTML = `
          <div class="flex items-center justify-between w-full">
            <span>${year}년 ${month + 1}월 알바 ${filterLabel} 일정 (${monthEvents.length}건)</span>
            <span class="text-[11px] font-normal text-slate-400 dark:text-slate-500 hidden sm:inline">
              달력의 날짜를 누르면 그 날짜의 알바만 모아봅니다.
            </span>
          </div>
        `;
      }
    }

    if (timelineList) {
      if (displayEvents.length === 0) {
        if (albaCalendarSelectedDay !== null) {
          timelineList.innerHTML = `
            <div class="py-10 text-center text-slate-400 dark:text-slate-500 text-xs">
              <div class="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-2 text-slate-400">
                <i data-lucide="calendar-x" class="w-5 h-5"></i>
              </div>
              <p class="font-semibold text-slate-700 dark:text-slate-300 mb-1">
                ${month + 1}월 ${albaCalendarSelectedDay}일에는 등록된 알바 일정이 없습니다.
              </p>
              <p class="text-[11px] text-slate-400">달력에서 숫자가 표시된 다른 날짜를 눌러보세요.</p>
              <button onclick="selectAlbaCalendarDay(null)" class="mt-3 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/80 text-emerald-700 dark:text-emerald-300 text-xs font-bold transition cursor-pointer border border-emerald-300/80 dark:border-emerald-800 inline-flex items-center gap-1">
                <i data-lucide="rotate-ccw" class="w-3 h-3"></i>
                <span>이번 달 전체 일정 (${monthEvents.length}건) 보기</span>
              </button>
            </div>
          `;
        } else {
          timelineList.innerHTML = `
            <div class="py-8 text-center text-slate-400 dark:text-slate-500 text-xs">
              이 달에 등록된 알바 일정이 없습니다.
            </div>
          `;
        }
      } else {
        displayEvents.sort((a, b) => {
          if (a.day !== b.day) return a.day - b.day;
          return a.type === 'work' ? -1 : 1;
        });

        const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

        timelineList.innerHTML = displayEvents.map(ev => {
          const dt = new Date(year, month, ev.day);
          const dayName = dayNames[dt.getDay()];
          const isWork = ev.type === 'work';
          const badgeClass = isWork ? 'bg-amber-500 text-white' : (ev.job.is_urgent ? 'bg-rose-500 text-white' : 'bg-emerald-600 text-white');
          const typeLabel = isWork ? '⚡ 근무일' : `⏱️ 마감 (${ev.job.dday || 'D-Day'})`;

          return `
            <div id="albaTimelineItem-${ev.day}" class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-emerald-400 dark:hover:border-emerald-600 transition cursor-pointer" onclick="window.open('${ev.job.link}', '_blank', 'noopener,noreferrer')">
              <div class="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
                <div class="flex flex-col items-center justify-center w-14 py-1.5 rounded-xl ${badgeClass} flex-shrink-0 text-center shadow-xs">
                  <span class="text-xs font-black leading-none">${ev.day}일</span>
                  <span class="text-[10px] font-semibold opacity-90">(${dayName})</span>
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-1.5 mb-1">
                    <span class="px-2 py-0.5 rounded-md text-[10px] font-extrabold ${isWork ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300' : 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300'}">
                      ${typeLabel}
                    </span>
                    <span class="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                      ${ev.job.category_emoji || '📌'} ${escapeAlbaHtml(ev.job.company || '전북대')}
                    </span>
                  </div>
                  <h5 class="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                    ${escapeAlbaHtml(ev.job.title)}
                  </h5>
                  <div class="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    <span class="font-bold text-emerald-600 dark:text-emerald-400">
                      💰 ${escapeAlbaHtml(ev.job.wage_display || ev.job.wage_raw)}
                    </span>
                    <span>·</span>
                    <span class="truncate">
                      ⏱️ ${escapeAlbaHtml(ev.job.work_time || '시간 협의')}
                    </span>
                  </div>
                </div>
              </div>
              <div class="flex items-center justify-end sm:flex-shrink-0">
                <button class="px-3 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/80 hover:bg-emerald-200 dark:hover:bg-emerald-900 rounded-xl transition flex items-center gap-1">
                  <span>공고 바로가기</span>
                  <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    if (window.lucide) window.lucide.createIcons();
  }

  function scrollToAlbaTimelineDay(day) {
    const el = document.getElementById(`albaTimelineItem-${day}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-emerald-500');
      setTimeout(() => el.classList.remove('ring-2', 'ring-emerald-500'), 1500);
    }
  }

  function escapeAlbaHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // 캘린더 전역 바인딩
  window.openAlbaCalendarModal = openAlbaCalendarModal;
  window.closeAlbaCalendarModal = closeAlbaCalendarModal;
  window.changeAlbaCalendarMonth = changeAlbaCalendarMonth;
  window.resetAlbaCalendarToToday = resetAlbaCalendarToToday;
  window.selectAlbaCalendarDay = selectAlbaCalendarDay;
  window.setAlbaCalendarFilter = setAlbaCalendarFilter;
  window.scrollToAlbaTimelineDay = scrollToAlbaTimelineDay;

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
