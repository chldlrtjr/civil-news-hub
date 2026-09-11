// Civil News Hub - AI Briefing Chatbot Controller (Option 2: Gemini 1.5 Flash + Local RAG)
// Silent Internal Version: v1.0.23

(function () {
  let isChatbotOpen = false;
  let isGenerating = false;
  let isConfigOpen = false;
  let chatHistory = [];
  let geminiApiKey = '';
  let hasServerApiKey = false;
  let serverModelName = 'gemini-1.5-flash';
  let isBodyLocked = false;

  // 1. 초기화
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChatbot);
  } else {
    initChatbot();
  }

  function initChatbot() {
    loadApiKey();
    injectChatbotUI();
    setupChatbotListeners();
    loadChatSession();
    checkServerStatus();
  }

  async function checkServerStatus() {
    try {
      const res = await fetch('/api/chat/status');
      if (res.ok) {
        const data = await res.json();
        hasServerApiKey = !!data.has_server_key;
        if (data.model) serverModelName = data.model;
      }
    } catch (e) {
      hasServerApiKey = false;
    }
    updateApiStatusBadge();
  }


  function loadApiKey() {
    try {
      geminiApiKey = localStorage.getItem('civil_gemini_api_key') || '';
    } catch (e) {
      geminiApiKey = '';
    }
  }

  function saveApiKey(key) {
    geminiApiKey = (key || '').trim();
    try {
      if (geminiApiKey) {
        localStorage.setItem('civil_gemini_api_key', geminiApiKey);
      } else {
        localStorage.removeItem('civil_gemini_api_key');
      }
    } catch (e) {}
    updateApiStatusBadge();
  }

  // 2. 챗봇 UI 동적 주입
  function injectChatbotUI() {
    if (document.getElementById('civilChatbotRoot')) return;

    const root = document.createElement('div');
    root.id = 'civilChatbotRoot';
    root.innerHTML = `
      <!-- 플로팅 트리거 버튼 (모바일 하단 탭바 높이를 고려하여 bottom-20 배치) -->
      <button 
        id="chatbotFloatingBtn" 
        type="button"
        aria-label="토목 뉴스 AI 챗봇 열기"
        class="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-40 flex items-center gap-2 px-3.5 sm:px-4 py-2.5 sm:py-3 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-800 text-white rounded-full shadow-xl shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer border border-white/20 select-none group"
      >
        <span class="relative flex h-2.5 w-2.5">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400"></span>
        </span>
        <i data-lucide="sparkles" class="w-4 h-4 text-amber-300 group-hover:rotate-12 transition-transform"></i>
        <span class="text-xs sm:text-sm font-bold tracking-tight">AI 기사 질문</span>
      </button>

      <!-- 모바일 배경 딤 & 터치 스크롤 방지 오버레이 -->
      <div 
        id="chatbotBackdrop" 
        class="fixed inset-0 z-40 bg-slate-950/40 dark:bg-slate-950/60 backdrop-blur-xs hidden opacity-0 transition-opacity duration-300"
      ></div>

      <!-- 챗봇 창 모달 / 패널 (모바일 화면 하단 완전 밀착 도킹 & 데스크탑 우하단 고정) -->
      <div 
        id="chatbotWindow" 
        class="fixed inset-x-0 bottom-0 sm:inset-x-auto sm:bottom-6 sm:right-6 z-50 hidden flex-col w-full sm:w-[440px] h-[85vh] h-[85dvh] sm:h-[620px] max-h-[92vh] max-h-[92dvh] bg-white dark:bg-slate-900 border-t sm:border border-slate-200/90 dark:border-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden transition-all duration-300 transform scale-100 opacity-0 backdrop-blur-xl origin-bottom sm:origin-bottom-right"
        style="box-sizing: border-box;"
      >
        <!-- 챗봇 헤더 (터치 액션 고정) -->
        <div class="flex items-center justify-between px-4 py-3 bg-slate-900 dark:bg-slate-950 text-white border-b border-slate-800 select-none flex-shrink-0 touch-none">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/30">
              <i data-lucide="bot" class="w-4 h-4"></i>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="text-xs sm:text-sm font-bold tracking-tight text-white flex items-center gap-1">
                  토목 뉴스 AI 브리핑
                </h3>
                <span id="chatbotModeBadge" class="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  로컬 요약 모드
                </span>
              </div>
              <p id="chatbotSubHeader" class="text-[11px] text-slate-400">237건 팩트 기사 기반 실시간 Q&A</p>
            </div>
          </div>

          <!-- 우측 헤더 제어 버튼들 -->
          <div class="flex items-center gap-1">
            <button 
              id="chatbotConfigToggleBtn" 
              type="button" 
              class="p-1.5 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-slate-800 transition cursor-pointer"
              title="Gemini API 키 설정"
            >
              <i data-lucide="key" class="w-4 h-4"></i>
            </button>
            <button 
              id="chatbotResetHistoryBtn" 
              type="button" 
              class="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="대화 내역 초기화"
            >
              <i data-lucide="rotate-ccw" class="w-4 h-4"></i>
            </button>
            <button 
              id="chatbotCloseBtn" 
              type="button" 
              class="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="챗봇 닫기"
            >
              <i data-lucide="x" class="w-4 h-4"></i>
            </button>
          </div>
        </div>

        <!-- API 키 설정 서랍 (접이식) -->
        <div id="chatbotConfigDrawer" class="hidden px-4 py-3 bg-slate-50 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 flex-shrink-0">
          <div class="flex items-center justify-between mb-1.5">
            <span class="font-bold flex items-center gap-1 text-slate-900 dark:text-white">
              <i data-lucide="shield-check" class="w-3.5 h-3.5 text-blue-500"></i>
              Google Gemini API 키 설정
            </span>
            <a 
              href="https://aistudio.google.com/app/apikey" 
              target="_blank" 
              rel="noopener noreferrer" 
              class="text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-semibold flex items-center gap-0.5"
            >
              무료 키 발급 &rarr;
            </a>
          </div>
          <p class="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
            입력하신 키는 본인 브라우저(Local Storage)에만 안전히 저장되며 외부로 전송되지 않습니다.
          </p>
          <div id="chatbotServerKeyNotice" class="hidden"></div>
          <div class="flex gap-1.5">
            <input 
              type="password" 
              id="chatbotApiKeyInput" 
              placeholder="AIzaSy... (Gemini API Key)"
              class="flex-1 px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
            <button 
              id="chatbotSaveKeyBtn" 
              type="button" 
              class="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition cursor-pointer flex-shrink-0"
            >
              저장
            </button>
            <button 
              id="chatbotClearKeyBtn" 
              type="button" 
              class="px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:text-rose-500 bg-slate-200 dark:bg-slate-800 rounded-lg transition cursor-pointer flex-shrink-0"
              title="키 삭제"
            >
              삭제
            </button>
          </div>
        </div>

        <!-- 추천 질문 칩 바 -->
        <div class="px-3.5 py-2 bg-slate-100/70 dark:bg-slate-950/40 border-b border-slate-200/60 dark:border-slate-800/80 overflow-x-auto scrollbar-none flex items-center gap-1.5 flex-shrink-0 select-none">
          <span class="text-[11px] font-semibold text-slate-400 dark:text-slate-500 flex-shrink-0 mr-0.5">추천:</span>
          <button type="button" class="quick-prompt-btn px-2.5 py-1 rounded-full text-[11px] font-medium bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition flex-shrink-0 whitespace-nowrap cursor-pointer shadow-2xs">
            🚇 GTX-A 개통 및 예산은?
          </button>
          <button type="button" class="quick-prompt-btn px-2.5 py-1 rounded-full text-[11px] font-medium bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition flex-shrink-0 whitespace-nowrap cursor-pointer shadow-2xs">
            🛡️ 지하안전평가 개정 핵심
          </button>
          <button type="button" class="quick-prompt-btn px-2.5 py-1 rounded-full text-[11px] font-medium bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition flex-shrink-0 whitespace-nowrap cursor-pointer shadow-2xs">
            ✈️ 가덕도 신공항 입찰 현황
          </button>
          <button type="button" class="quick-prompt-btn px-2.5 py-1 rounded-full text-[11px] font-medium bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition flex-shrink-0 whitespace-nowrap cursor-pointer shadow-2xs">
            🏗️ 2026 스마트건설 동향
          </button>
        </div>

        <!-- 메시지 리스트 스크롤 영역 (독립 스크롤 보장) -->
        <div 
          id="chatbotMessagesContainer" 
          class="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 text-xs sm:text-sm bg-white dark:bg-slate-900/50 overscroll-contain"
          style="flex: 1 1 0%; min-height: 0; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch;"
        >
          <!-- JS로 동적 메시지 렌더링 -->
        </div>

        <!-- 하단 입력 바 (화면 맨 아래 밀착 고정) -->
        <div 
          id="chatbotInputContainer" 
          class="p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex-shrink-0 mt-auto"
          style="flex-shrink: 0; margin-top: auto;"
        >
          <form id="chatbotInputForm" class="flex items-center gap-2">
            <input 
              type="text" 
              id="chatbotTextInput" 
              placeholder="기사에 대해 궁금한 점을 입력하세요..." 
              autocomplete="off"
              class="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-slate-800/80 border border-transparent focus:border-blue-500 dark:focus:border-blue-400 rounded-xl text-xs sm:text-sm placeholder-slate-400 focus:bg-white dark:focus:bg-slate-900 focus:outline-none transition shadow-inner"
            />
            <button 
              type="submit" 
              id="chatbotSendBtn"
              class="w-10 h-10 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white flex items-center justify-center transition flex-shrink-0 shadow-md shadow-blue-600/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i data-lucide="send" class="w-4 h-4"></i>
            </button>
          </form>
          <div class="flex items-center justify-between mt-2 px-1 text-[10px] text-slate-400 dark:text-slate-500 select-none">
            <span>💡 팩트 기사 기반 AI RAG 브리핑</span>
            <span id="chatbotStatusIndicator">준비 완료</span>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(root);
    refreshIcons();
    updateApiStatusBadge();
  }

  function refreshIcons() {
    if (window.safeCreateIcons) {
      window.safeCreateIcons();
    } else if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons();
    }
  }

  function updateApiStatusBadge() {
    const badge = document.getElementById('chatbotModeBadge');
    const input = document.getElementById('chatbotApiKeyInput');
    const subHeader = document.getElementById('chatbotSubHeader');
    const serverNotice = document.getElementById('chatbotServerKeyNotice');
    if (input) input.value = geminiApiKey || '';

    const count = (window.allArticles && window.allArticles.length) || 237;
    if (subHeader) {
      subHeader.textContent = `${count}건 팩트 기사 기반 실시간 Q&A`;
    }

    if (serverNotice) {
      if (hasServerApiKey) {
        serverNotice.className = 'p-2.5 mb-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-[11px] text-emerald-800 dark:text-emerald-300 flex items-center gap-2';
        serverNotice.innerHTML = `
          <i data-lucide="check-circle-2" class="w-4 h-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400"></i>
          <div>
            <span class="font-bold">서버 무료 연동 활성:</span> 서버에 Gemini API가 등록되어 방문자 누구나 키 없이 바로 이용하실 수 있습니다.
          </div>
        `;
      } else {
        serverNotice.className = 'p-2.5 mb-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300 flex items-center gap-2';
        serverNotice.innerHTML = `
          <i data-lucide="info" class="w-4 h-4 flex-shrink-0 text-blue-500"></i>
          <div>
            <span class="font-bold">안내:</span> 서버 환경변수 미등록 시 아래에 개인 무료 키를 등록하면 즉시 Gemini AI 브리핑이 활성화됩니다.
          </div>
        `;
      }
      refreshIcons();
    }

    if (badge) {
      if (geminiApiKey) {
        badge.className = 'text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30';
        badge.textContent = 'Gemini 1.5 (개인 키)';
      } else if (hasServerApiKey) {
        badge.className = 'text-[10px] px-2 py-0.5 rounded-full font-semibold bg-blue-500/20 text-blue-300 border border-blue-400/30';
        badge.textContent = 'Gemini (서버 무료 이용)';
      } else {
        badge.className = 'text-[10px] px-2 py-0.5 rounded-full font-semibold bg-amber-500/20 text-amber-300 border border-amber-400/30';
        badge.textContent = '로컬 요약 모드';
      }
    }
  }


  // 3. 이벤트 리스너 설정
  function setupChatbotListeners() {
    const floatBtn = document.getElementById('chatbotFloatingBtn');
    const windowEl = document.getElementById('chatbotWindow');
    const closeBtn = document.getElementById('chatbotCloseBtn');
    const resetBtn = document.getElementById('chatbotResetHistoryBtn');
    const configBtn = document.getElementById('chatbotConfigToggleBtn');
    const saveKeyBtn = document.getElementById('chatbotSaveKeyBtn');
    const clearKeyBtn = document.getElementById('chatbotClearKeyBtn');
    const form = document.getElementById('chatbotInputForm');
    const textInput = document.getElementById('chatbotTextInput');

    if (floatBtn) {
      floatBtn.addEventListener('click', () => toggleChatbotWindow(true));
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', () => toggleChatbotWindow(false));
    }
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        chatHistory = [];
        initWelcomeMessage();
        if (window.showToast) window.showToast('💬 대화 내역이 초기화되었습니다.');
      });
    }
    if (configBtn) {
      configBtn.addEventListener('click', () => {
        isConfigOpen = !isConfigOpen;
        const drawer = document.getElementById('chatbotConfigDrawer');
        if (drawer) drawer.classList.toggle('hidden', !isConfigOpen);
      });
    }
    if (saveKeyBtn) {
      saveKeyBtn.addEventListener('click', () => {
        const input = document.getElementById('chatbotApiKeyInput');
        if (input) {
          saveApiKey(input.value);
          const drawer = document.getElementById('chatbotConfigDrawer');
          if (drawer) drawer.classList.add('hidden');
          isConfigOpen = false;
          if (window.showToast) window.showToast('🔑 Gemini API 키가 브라우저에 저장되었습니다!');
        }
      });
    }
    if (clearKeyBtn) {
      clearKeyBtn.addEventListener('click', () => {
        saveApiKey('');
        const input = document.getElementById('chatbotApiKeyInput');
        if (input) input.value = '';
        if (window.showToast) window.showToast('키가 삭제되었습니다. (로컬 요약 모드 전환)');
      });
    }
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const q = textInput.value.trim();
        if (!q || isGenerating) return;
        textInput.value = '';
        handleUserMessage(q);
      });
    }

    // 추천 질문 칩 클릭
    const quickBtns = document.querySelectorAll('.quick-prompt-btn');
    quickBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.textContent.replace(/^[^\s]+\s*/, '').trim();
        if (!text || isGenerating) return;
        handleUserMessage(text);
      });
    });

    // 배경 딤(Backdrop) 터치/클릭 시 닫기 및 배경 터치 스크롤 차단
    const backdropEl = document.getElementById('chatbotBackdrop');
    if (backdropEl) {
      backdropEl.addEventListener('click', () => toggleChatbotWindow(false));
      backdropEl.addEventListener('touchmove', (e) => {
        e.preventDefault();
      }, { passive: false });
    }

    // ESC 키 입력 시 챗봇 닫기 지원
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isChatbotOpen) {
        toggleChatbotWindow(false);
      }
    });

    // 뷰포트 크기 변경 시 모바일 스크롤락 상태 보정
    window.addEventListener('resize', () => {
      if (isChatbotOpen) {
        if (window.innerWidth >= 768) {
          unlockBodyScroll();
        } else {
          lockBodyScroll();
        }
      }
    });
  }

  // 모바일 화면 챗봇 오픈 시 뒷배경 스크롤 완전 락(Lock)
  function lockBodyScroll() {
    if (window.innerWidth < 768 && !isBodyLocked) {
      document.documentElement.classList.add('chatbot-open-lock');
      document.body.classList.add('chatbot-open-lock');
      isBodyLocked = true;
    }
  }

  // 모바일 챗봇 닫힘 시 뒷배경 스크롤 락 해제
  function unlockBodyScroll() {
    if (isBodyLocked) {
      document.documentElement.classList.remove('chatbot-open-lock');
      document.body.classList.remove('chatbot-open-lock');
      isBodyLocked = false;
    }
  }

  function saveChatSession() {
    try {
      sessionStorage.setItem('civil_chatbot_history', JSON.stringify(chatHistory));
    } catch (e) {}
  }

  function loadChatSession() {
    try {
      // 페이지 로드/새로고침 시 챗봇이 자동 오픈되어 하단 네비게이션 바 및 화면을 가리지 않도록 플래그 초기화
      sessionStorage.removeItem('civil_chatbot_open');

      const saved = sessionStorage.getItem('civil_chatbot_history');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          chatHistory = parsed;
          renderChatHistory();
        } else {
          initWelcomeMessage();
        }
      } else {
        initWelcomeMessage();
      }
    } catch (e) {
      initWelcomeMessage();
    }
  }

  function renderChatHistory() {
    const container = document.getElementById('chatbotMessagesContainer');
    if (!container) return;
    initWelcomeMessage();
    chatHistory.forEach(item => {
      if (item.role === 'user') {
        renderUserMessageDOM(item.text);
      } else if (item.role === 'ai') {
        renderAiMessageDOM(item.text, item.sources, item.isGemini);
      }
    });
    refreshIcons();
    scrollToBottom();
  }

  function toggleChatbotWindow(forceState) {
    const windowEl = document.getElementById('chatbotWindow');
    const floatBtn = document.getElementById('chatbotFloatingBtn');
    const backdropEl = document.getElementById('chatbotBackdrop');
    if (!windowEl) return;

    if (typeof forceState === 'boolean') {
      isChatbotOpen = forceState;
    } else {
      isChatbotOpen = !isChatbotOpen;
    }

    if (isChatbotOpen) {
      checkServerStatus();
      updateApiStatusBadge();

      // 모바일 배경 스크롤 차단 활성화
      lockBodyScroll();

      // 배경 딤 오버레이 표시
      if (backdropEl) {
        backdropEl.classList.remove('hidden');
        requestAnimationFrame(() => {
          backdropEl.classList.remove('opacity-0');
          backdropEl.classList.add('opacity-100');
        });
      }

      windowEl.classList.remove('hidden');
      windowEl.classList.add('is-open', 'flex');
      requestAnimationFrame(() => {
        windowEl.classList.remove('opacity-0');
        windowEl.classList.add('opacity-100');
        const textInput = document.getElementById('chatbotTextInput');
        if (textInput && window.innerWidth >= 640) textInput.focus();
        scrollToBottom();
      });
      setTimeout(scrollToBottom, 100);
      setTimeout(scrollToBottom, 300);
      if (floatBtn) floatBtn.classList.add('hidden');
    } else {
      // 모바일 배경 스크롤 차단 해제
      unlockBodyScroll();

      // 배경 딤 오버레이 숨김
      if (backdropEl) {
        backdropEl.classList.remove('opacity-100');
        backdropEl.classList.add('opacity-0');
        setTimeout(() => backdropEl.classList.add('hidden'), 250);
      }

      windowEl.classList.remove('opacity-100');
      windowEl.classList.add('opacity-0');
      setTimeout(() => {
        windowEl.classList.remove('is-open', 'flex');
        windowEl.classList.add('hidden');
        if (floatBtn) floatBtn.classList.remove('hidden');
      }, 250);
    }
  }
  window.openCivilChatbot = () => toggleChatbotWindow(true);

  // 4. 초기 환영 메시지
  function initWelcomeMessage() {
    const container = document.getElementById('chatbotMessagesContainer');
    if (!container) return;

    const count = (window.allArticles && window.allArticles.length) || 237;

    container.innerHTML = `
      <div class="flex items-start gap-2.5">
        <div class="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white flex-shrink-0 mt-0.5 shadow-sm">
          <i data-lucide="bot" class="w-4 h-4"></i>
        </div>
        <div class="space-y-2 max-w-[85%]">
          <div class="p-3.5 rounded-2xl rounded-tl-none bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700/80 leading-relaxed text-xs sm:text-sm">
            <p class="font-bold text-slate-900 dark:text-white mb-1.5 flex items-center gap-1.5">
              <span>안녕하세요! Civil AI 브리핑입니다.</span> 🏗️
            </p>
            <p class="text-slate-600 dark:text-slate-300 mb-2">
              최신 토목 기사 <strong>${count}건</strong>의 실시간 데이터를 기반으로 사업비, 완공 일정, 핵심 공법, 정책 이슈를 알기 쉽게 설명해 드립니다.
            </p>
            <div class="p-2 rounded-xl bg-blue-50 dark:bg-slate-900/60 border border-blue-100 dark:border-slate-700 text-[11px] text-blue-800 dark:text-blue-300">
              💡 <strong>Tip</strong>: 상단 <strong>[추천 질문 칩]</strong>을 누르시거나 궁금하신 토목 키워드를 자유롭게 질문해 보세요!
            </div>
          </div>
        </div>
      </div>
    `;

    refreshIcons();
  }

  // 기사 데이터 보장 헬퍼
  async function ensureArticlesLoaded() {
    if (window.allArticles && window.allArticles.length > 0) {
      return window.allArticles;
    }
    try {
      const res = await fetch('./data/news.json?t=' + Date.now());
      if (res.ok) {
        const data = await res.json();
        window.allArticles = data.articles || [];
        return window.allArticles;
      }
    } catch (e) {
      console.warn('Chatbot article fetch fallback warning:', e);
    }
    return window.allArticles || [];
  }

  // 5. 메시지 전송 및 처리
  async function handleUserMessage(query) {
    if (!query) return;

    // (1) 유저 메시지 렌더링
    appendUserMessage(query);

    // (2) AI 생각 중 인디케이터 표시
    const loadingId = appendLoadingIndicator();
    isGenerating = true;
    updateSendBtnState(true);

    try {
      // (3) 기사 데이터 로드 보장 및 검색
      await ensureArticlesLoaded();
      const relevantArticles = retrieveRelevantArticles(query, 4);

      // (4) Gemini API 호출 (서버 프록시 또는 개인 키 활용)
      // 만약 서버 키도 없고 개인 키도 없다면 즉시 로컬 RAG 팩트 브리핑 카드로 분기
      if (!hasServerApiKey && !geminiApiKey) {
        await new Promise(r => setTimeout(r, 600)); // 자연스러운 UX 딜레이
        removeMessage(loadingId);
        appendLocalRagFallbackMessage(query, relevantArticles);
      } else {
        try {
          const aiResponseText = await callGeminiApi(query, relevantArticles);
          removeMessage(loadingId);
          appendAiMessage(aiResponseText, relevantArticles, true);
        } catch (apiErr) {
          if (apiErr.message === 'KEY_MISSING') {
            removeMessage(loadingId);
            appendLocalRagFallbackMessage(query, relevantArticles);
          } else {
            throw apiErr;
          }
        }
      }
    } catch (err) {
      console.error('Chatbot Generation Error:', err);
      removeMessage(loadingId);
      appendErrorMessage(err.message || 'AI 답변 처리 중 오류가 발생했습니다.');
    } finally {
      isGenerating = false;
      updateSendBtnState(false);
      scrollToBottom();
    }
  }

  // 6. 로컬 RAG 기사 검색 알고리즘
  function retrieveRelevantArticles(query, limit = 4) {
    const articles = window.allArticles || [];
    if (articles.length === 0) return [];

    const qLower = query.toLowerCase();
    // 특수문자 제거 후 토큰화 (2글자 이상)
    const tokens = qLower.replace(/[^\w가-힣\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 2);

    const scored = articles.map(art => {
      let score = 0;
      const title = (art.title || '').toLowerCase();
      const summary = (art.summary || []).join(' ').toLowerCase();
      const body = (art.body || art.content || '').toLowerCase();
      const cat = (art.category_name || '').toLowerCase();

      // 완전 일치 가산점
      if (title.includes(qLower)) score += 20;
      if (summary.includes(qLower)) score += 10;

      // 토큰 매칭 가산점
      tokens.forEach(tok => {
        if (title.includes(tok)) score += 6;
        if (summary.includes(tok)) score += 3;
        if (body.includes(tok)) score += 1;
        if (cat.includes(tok)) score += 2;
      });

      return { article: art, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.filter(s => s.score > 0).slice(0, limit).map(s => s.article);
  }

  // 7. Google Gemini API 호출 (서버 프록시 우선, 클라이언트 직접 호출 폴백)
  async function callGeminiApi(query, relevantArticles) {
    // 1. 백엔드 서버 프록시 /api/chat 호출 시도
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(geminiApiKey ? { 'Authorization': `Bearer ${geminiApiKey}` } : {})
        },
        body: JSON.stringify({
          query,
          relevantArticles,
          customApiKey: geminiApiKey || ''
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.answer) {
          return data.answer;
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        if (errData.error === 'KEY_MISSING' && !geminiApiKey) {
          throw new Error('KEY_MISSING');
        }
        if (errData.message) {
          throw new Error(errData.message);
        }
      }
    } catch (err) {
      if (err.message === 'KEY_MISSING' || (err.message && err.message.includes('Gemini API'))) {
        throw err;
      }
      console.warn('Backend proxy /api/chat error, trying direct Gemini client call:', err);
    }

    // 2. 서버 프록시 사용 불가 환경(GitHub Pages 등)이고 개인 키가 있는 경우 직접 호출
    if (geminiApiKey) {
      return await callGeminiApiDirect(query, relevantArticles);
    }

    throw new Error('KEY_MISSING');
  }

  async function callGeminiApiDirect(query, relevantArticles) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;

    let contextText = '';
    if (relevantArticles.length > 0) {
      contextText = relevantArticles.map((art, idx) => {
        const sumText = Array.isArray(art.summary) ? art.summary.join('\n• ') : art.summary || '';
        return `[기사 ${idx + 1}]
- 제목: ${art.title}
- 매체/일시: ${art.media || '언론사'} (${art.published_at || art.date || ''})
- 주요 내용:
• ${sumText}`;
      }).join('\n\n');
    } else {
      contextText = '직접 관련된 최신 기사를 찾지 못했습니다. 일반 토목·인프라 공학 및 건설 지식을 바탕으로 설명하되, "제공된 기사 데이터베이스에는 직접 언급되지 않았습니다"라는 점을 먼저 명시하세요.';
    }

    const systemPrompt = `당신은 대한민국 토목·인프라 및 건설 엔지니어링 분야 전문 AI 연구원입니다.
사용자의 질문에 대해 아래 제공된 [참고 기사 데이터]를 바탕으로 팩트에 입각하여 친절하고 전문적으로 답변하세요.

답변 지침:
1. 기사에 나온 구체적인 수치(사업비, 공사비, 노선 길이, 완공/착공 연도 등)가 있다면 명확히 밝히세요.
2. 읽기 편하게 불릿 기호(•)와 굵은 글씨(**)를 사용하여 핵심 위주로 일목요연하게 작성하세요.
3. 기사에 없는 내용은 허구로 꾸며내지 말고 솔직하게 밝히세요.
4. 한국어로 정중하고 격식 있는 어조(~합니다, ~입니다)로 답변하세요.`;

    const prompt = `${systemPrompt}

[참고 기사 데이터]
${contextText}

[사용자 질문]
${query}`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1200
        }
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const errMsg = errData.error?.message || `HTTP ${res.status}`;
      if (res.status === 400 || res.status === 403) {
        throw new Error(`Gemini API Key 오류 (${errMsg}). 상단 🔑 설정에서 올바른 키를 입력해 주세요.`);
      }
      throw new Error(`Gemini API 호출 실패: ${errMsg}`);
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text;
    if (!text) throw new Error('AI 답변을 생성하지 못했습니다.');
    return text;
  }


  // 8. 메시지 렌더링 헬퍼들
  function renderUserMessageDOM(text) {
    const container = document.getElementById('chatbotMessagesContainer');
    if (!container) return;

    const el = document.createElement('div');
    el.className = 'flex items-end justify-end gap-2';
    el.innerHTML = `
      <div class="p-3 rounded-2xl rounded-tr-none bg-blue-600 text-white max-w-[85%] leading-relaxed text-xs sm:text-sm shadow-sm select-text">
        ${escapeHtml(text)}
      </div>
    `;
    container.appendChild(el);
  }

  function appendUserMessage(text) {
    renderUserMessageDOM(text);
    chatHistory.push({ role: 'user', text: text });
    saveChatSession();
    scrollToBottom();
  }

  function renderAiMessageDOM(markdownText, sources = [], isGemini = true) {
    const container = document.getElementById('chatbotMessagesContainer');
    if (!container) return;

    const el = document.createElement('div');
    el.className = 'flex items-start gap-2.5';

    const formattedContent = formatMarkdown(markdownText);
    const sourceBadgesHtml = renderSourceChips(sources);

    el.innerHTML = `
      <div class="w-7 h-7 rounded-lg ${isGemini ? 'bg-indigo-600' : 'bg-blue-600'} flex items-center justify-center text-white flex-shrink-0 mt-0.5 shadow-sm">
        <i data-lucide="${isGemini ? 'sparkles' : 'bot'}" class="w-4 h-4"></i>
      </div>
      <div class="space-y-2 max-w-[88%] select-text">
        <div class="p-3.5 rounded-2xl rounded-tl-none bg-slate-100 dark:bg-slate-800/90 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700/80 leading-relaxed text-xs sm:text-sm shadow-2xs">
          ${formattedContent}
          ${sourceBadgesHtml}
        </div>
      </div>
    `;

    container.appendChild(el);
  }

  function appendAiMessage(markdownText, sources = [], isGemini = true) {
    renderAiMessageDOM(markdownText, sources, isGemini);
    chatHistory.push({ role: 'ai', text: markdownText, sources: sources, isGemini: isGemini });
    saveChatSession();
    refreshIcons();
    scrollToBottom();
  }

  function appendLocalRagFallbackMessage(query, articles) {
    const container = document.getElementById('chatbotMessagesContainer');
    if (!container) return;

    let bodyHtml = '';
    if (articles.length === 0) {
      bodyHtml = `
        <p class="text-slate-600 dark:text-slate-300">
          <strong>'${escapeHtml(query)}'</strong>와 직접 일치하는 기사를 찾지 못했습니다. 다른 토목 관련 키워드(예: GTX, 지하안전, 가덕도, 스마트건설 등)로 검색해 보세요.
        </p>
      `;
    } else {
      bodyHtml = `
        <div class="space-y-3">
          <div class="flex items-center gap-1.5 text-[11px] font-bold text-blue-600 dark:text-blue-400">
            <i data-lucide="file-text" class="w-3.5 h-3.5"></i>
            <span>관련 기사 핵심 요약 브리핑 (총 ${articles.length}건)</span>
          </div>

          <div class="space-y-2.5">
            ${articles.map((art) => {
              const bullets = Array.isArray(art.summary) ? art.summary : [art.summary || ''];
              return `
                <div class="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 space-y-1">
                  <div class="flex items-center justify-between gap-1 text-[11px]">
                    <span class="font-bold text-slate-900 dark:text-white line-clamp-1">${escapeHtml(art.title)}</span>
                    <span class="text-[10px] text-slate-400 flex-shrink-0">${escapeHtml(art.media || '')}</span>
                  </div>
                  <ul class="text-[11px] text-slate-600 dark:text-slate-300 space-y-0.5 pl-3 list-disc">
                    ${bullets.map(b => `<li>${escapeHtml(b)}</li>`).join('')}
                  </ul>
                  <div class="pt-1 text-right">
                    <a href="${escapeHtml(art.link || art.url || '#')}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                      <span>원문 보기</span>
                      <i data-lucide="external-link" class="w-3 h-3"></i>
                    </a>
                  </div>
                </div>
              `;
            }).join('')}
          </div>

          ${hasServerApiKey ? '' : `
          <div class="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-[11px] text-amber-800 dark:text-amber-300 flex items-center justify-between gap-2">
            <span>✨ <strong>Gemini API 키</strong>를 등록하시면 유려한 AI 문장으로 종합 분석해 드립니다!</span>
            <button onclick="document.getElementById('chatbotConfigToggleBtn')?.click()" class="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-bold text-[10px] flex-shrink-0 cursor-pointer">
              키 등록
            </button>
          </div>
          `}
        </div>
      `;
    }

    const el = document.createElement('div');
    el.className = 'flex items-start gap-2.5';
    el.innerHTML = `
      <div class="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white flex-shrink-0 mt-0.5 shadow-sm">
        <i data-lucide="newspaper" class="w-4 h-4"></i>
      </div>
      <div class="space-y-2 max-w-[90%] select-text">
        <div class="p-3.5 rounded-2xl rounded-tl-none bg-slate-100 dark:bg-slate-800/90 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700/80 leading-relaxed text-xs sm:text-sm shadow-2xs">
          ${bodyHtml}
        </div>
      </div>
    `;

    container.appendChild(el);
    refreshIcons();
    scrollToBottom();
  }

  function appendLoadingIndicator() {
    const container = document.getElementById('chatbotMessagesContainer');
    if (!container) return null;

    const id = 'loadingMsg_' + Date.now();
    const el = document.createElement('div');
    el.id = id;
    el.className = 'flex items-start gap-2.5';
    el.innerHTML = `
      <div class="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white flex-shrink-0 mt-0.5 shadow-sm">
        <i data-lucide="sparkles" class="w-4 h-4 animate-spin"></i>
      </div>
      <div class="p-3 rounded-2xl rounded-tl-none bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs flex items-center gap-1.5">
        <span class="w-2 h-2 rounded-full bg-blue-600 animate-bounce"></span>
        <span class="w-2 h-2 rounded-full bg-blue-600 animate-bounce [animation-delay:0.2s]"></span>
        <span class="w-2 h-2 rounded-full bg-blue-600 animate-bounce [animation-delay:0.4s]"></span>
        <span class="ml-1 text-[11px] font-medium">기사 팩트 분석 중...</span>
      </div>
    `;
    container.appendChild(el);
    refreshIcons();
    scrollToBottom();
    return id;
  }

  function appendErrorMessage(errText) {
    const container = document.getElementById('chatbotMessagesContainer');
    if (!container) return;

    const el = document.createElement('div');
    el.className = 'flex items-start gap-2.5';
    el.innerHTML = `
      <div class="w-7 h-7 rounded-lg bg-rose-600 flex items-center justify-center text-white flex-shrink-0 mt-0.5 shadow-sm">
        <i data-lucide="alert-circle" class="w-4 h-4"></i>
      </div>
      <div class="p-3 rounded-2xl rounded-tl-none bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs leading-relaxed max-w-[85%]">
        <p class="font-bold mb-0.5">⚠️ 오류가 발생했습니다</p>
        <p>${escapeHtml(errText)}</p>
      </div>
    `;
    container.appendChild(el);
    refreshIcons();
    scrollToBottom();
  }

  function removeMessage(id) {
    if (!id) return;
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  function renderSourceChips(sources) {
    if (!sources || sources.length === 0) return '';
    return `
      <div class="mt-3 pt-2.5 border-t border-slate-200 dark:border-slate-700/80">
        <div class="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
          <i data-lucide="link" class="w-3 h-3"></i>
          <span>인용된 토목 기사 출처 (${sources.length}건)</span>
        </div>
        <div class="flex flex-wrap gap-1.5">
          ${sources.map(s => `
            <a 
              href="${escapeHtml(s.link || s.url || '#')}" 
              target="_blank" 
              rel="noopener noreferrer" 
              class="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-blue-500 text-slate-700 dark:text-slate-300 hover:text-blue-600 transition"
            >
              <span class="font-bold text-blue-600 dark:text-blue-400">[${escapeHtml(s.media || '기사')}]</span>
              <span class="line-clamp-1 max-w-[150px]">${escapeHtml(s.title || '')}</span>
              <i data-lucide="external-link" class="w-2.5 h-2.5 flex-shrink-0 text-slate-400"></i>
            </a>
          `).join('')}
        </div>
      </div>
    `;
  }

  function updateSendBtnState(disabled) {
    const btn = document.getElementById('chatbotSendBtn');
    const input = document.getElementById('chatbotTextInput');
    const indicator = document.getElementById('chatbotStatusIndicator');
    if (btn) btn.disabled = disabled;
    if (input) input.disabled = disabled;
    if (indicator) {
      indicator.textContent = disabled ? '답변 작성 중...' : '준비 완료';
      indicator.className = disabled ? 'text-blue-500 font-semibold' : 'text-slate-400 dark:text-slate-500';
    }
  }

  function scrollToBottom(smooth = false) {
    const container = document.getElementById('chatbotMessagesContainer');
    if (!container) return;
    const doScroll = () => {
      if (smooth) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      } else {
        container.scrollTop = container.scrollHeight;
      }
    };
    doScroll();
    requestAnimationFrame(doScroll);
    setTimeout(doScroll, 80);
    setTimeout(doScroll, 250);
  }

  // 마크다운 파서 (코드, 볼드, 불릿, 줄바꿈)
  function formatMarkdown(text) {
    if (!text) return '';
    let escaped = escapeHtml(text);
    // Code blocks / inline code
    escaped = escaped.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-blue-600 dark:text-blue-300 font-mono text-[11px]">$1</code>');
    // **bold**
    escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-slate-900 dark:text-white">$1</strong>');
    // bullet lines (• or - or *)
    escaped = escaped.replace(/^[•\-\*]\s+(.*)$/gm, '<li class="ml-3.5 list-disc my-0.5">$1</li>');
    // line breaks
    escaped = escaped.replace(/\n\n/g, '<div class="h-2"></div>');
    escaped = escaped.replace(/\n/g, '<br/>');
    return escaped;
  }

  function escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
})();
