// @ts-check
// Roda em toda página do YouTube (document_start). Mostra a pergunta inicial, a escolha
// de modo, o objetivo, os lembretes e a tela de bloqueio; aplica o Modo Foco.
// Lê o estado direto do storage e pede mudanças ao background por mensagem.

(() => {
  const ACTIVITY_THROTTLE_MS = 60 * 1000;
  const GOAL_MIN_LENGTH = 3;

  /** @type {State} */
  let state = yfNormalizeState(undefined);
  /** @type {Settings} */
  let settings = yfNormalizeSettings(undefined);
  let loaded = false;

  /** Passo local antes de existir sessão. @type {'ask' | 'choose' | 'goal'} */
  let gateStep = 'ask';
  let emergencyOpen = false;

  /** @typedef {'loading' | 'ask' | 'choose' | 'goal' | 'reminder' | 'cooldown' | 'emergency' | 'none'} View */
  /** @type {View | null} */
  let currentView = null;

  const html = document.documentElement;

  // ---- Elementos hospedeiros (Shadow DOM isola nossos estilos dos do YouTube) ----

  const overlayHost = document.createElement('yf-overlay');
  // Estilo inline para cobrir a página antes mesmo do CSS carregar (sem "flash" do conteúdo).
  overlayHost.style.cssText =
    'position:fixed;inset:0;z-index:2147483647;display:block;background:#0f0f0f;';
  const overlayRoot = overlayHost.attachShadow({ mode: 'open' });
  const overlayContent = document.createElement('div');
  overlayRoot.append(stylesheet(), overlayContent);

  // Atalhos de teclado do YouTube (k, f, /, ...) não devem reagir ao que é digitado no overlay.
  for (const type of ['keydown', 'keyup', 'keypress']) {
    overlayHost.addEventListener(type, (e) => e.stopPropagation());
  }

  html.append(overlayHost);

  function stylesheet() {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('src/content/overlay.css');
    return link;
  }

  // ---- Helpers ----

  /**
   * Cria um elemento. Props "onX" viram listeners; `false`/`null` são ignorados.
   * @param {string} tag
   * @param {Record<string, any>} [props]
   * @param {...(Node | string | null | false | undefined)} children
   * @returns {HTMLElement}
   */
  function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value === false || value == null) continue;
      if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
      else if (key === 'class') el.className = value;
      else el.setAttribute(key, value === true ? '' : String(value));
    }
    for (const child of children) {
      if (child != null && child !== false) el.append(child);
    }
    return el;
  }

  /** @param {any} msg */
  async function send(msg) {
    try {
      return await chrome.runtime.sendMessage(msg);
    } catch (err) {
      // Acontece quando a extensão é recarregada e esta aba ainda roda o script antigo.
      console.warn('[YouTube Focus]', err);
      return null;
    }
  }

  function isFocusActive() {
    return state.session?.mode === 'focus' && !yfIsCooldown(state);
  }

  function isReminderDue() {
    const session = state.session;
    if (session?.mode !== 'focus' || settings.reminderMinutes <= 0) return false;
    if (document.visibilityState !== 'visible') return false;
    const since = session.reminderAckAt ?? session.startedAt;
    return Date.now() - since >= settings.reminderMinutes * YF_MINUTE;
  }

  /** @returns {View} */
  function computeView() {
    if (!loaded) return 'loading';
    if (yfIsCooldown(state)) return emergencyOpen ? 'emergency' : 'cooldown';
    if (!state.session) return state.resumeAtChoice && gateStep === 'ask' ? 'choose' : gateStep;
    if (isReminderDue()) return 'reminder';
    return 'none';
  }

  // ---- Telas do overlay ----

  function viewAsk() {
    return h('div', { class: 'card' },
      h('h1', {}, 'Você realmente quer usar o YouTube agora?'),
      h('p', { class: 'muted' }, 'Pare um segundo e pense no que você veio fazer aqui.'),
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary', onclick: exitYoutube }, 'Não, sair'),
        h('button', { class: 'btn', onclick: () => { gateStep = 'choose'; render(); } }, 'Sim, continuar'),
      ),
    );
  }

  function chooseFocus() {
    if (settings.askGoal) {
      gateStep = 'goal';
      render();
    } else {
      send({ type: 'chooseMode', mode: 'focus' });
    }
  }

  function viewChoose() {
    return h('div', { class: 'card' },
      h('h1', {}, 'Como você quer usar?'),
      h('div', { class: 'modes' },
        h('button', { class: 'mode', onclick: chooseFocus },
          h('strong', {}, 'Modo Foco'),
          h('span', {}, `Sem distrações e sem limite de tempo. Termina após ${settings.focusIdleMinutes} min de inatividade ou quando você encerrar.`),
        ),
        h('button', { class: 'mode', onclick: () => send({ type: 'chooseMode', mode: 'relax' }) },
          h('strong', {}, 'Modo Relax'),
          h('span', {}, `Tudo liberado por ${settings.relaxMinutes} min. Ao acabar (ou encerrar), o YouTube fica bloqueado por ${settings.cooldownMinutes} min.`),
        ),
      ),
      h('p', { class: 'muted small hint' }, 'Para trocar de modo depois, é preciso encerrar a sessão.'),
      h('button', { class: 'btn link', onclick: exitYoutube }, 'Mudei de ideia, sair'),
    );
  }

  function viewGoal() {
    const input = /** @type {HTMLInputElement} */ (h('input', {
      type: 'text',
      maxlength: 140,
      autocomplete: 'off',
      placeholder: 'Ex.: assistir a aula de cálculo, ver o tutorial de Git…',
    }));
    const start = /** @type {HTMLButtonElement} */ (h('button', { class: 'btn primary', disabled: true }, 'Começar'));

    const isValid = () => input.value.trim().length >= GOAL_MIN_LENGTH;
    input.addEventListener('input', () => { start.disabled = !isValid(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && isValid()) start.click();
    });
    start.addEventListener('click', () => {
      start.disabled = true;
      send({ type: 'chooseMode', mode: 'focus', goal: input.value });
    });
    queueMicrotask(() => input.focus());

    return h('div', { class: 'card' },
      h('h1', {}, 'O que você veio fazer no YouTube?'),
      h('p', { class: 'muted' }, 'Seu objetivo fica visível durante a sessão e aparece nos lembretes.'),
      input,
      h('div', { class: 'actions' },
        h('button', { class: 'btn', onclick: () => { gateStep = 'choose'; render(); } }, 'Voltar'),
        start,
      ),
    );
  }

  function viewReminder() {
    const session = state.session;
    const elapsed = session ? Date.now() - session.startedAt : 0;
    return h('div', { class: 'card' },
      h('h1', {}, 'Ainda está fazendo o que veio fazer?'),
      session?.goal
        ? h('blockquote', { class: 'goal' }, session.goal)
        : h('p', { class: 'muted' }, 'Lembre-se do motivo de ter aberto o YouTube.'),
      h('p', { class: 'muted small' }, `Você está no Modo Foco há ${Math.round(elapsed / YF_MINUTE)} min.`),
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary', onclick: () => send({ type: 'endSession' }) }, 'Encerrar sessão'),
        h('button', { class: 'btn', onclick: () => send({ type: 'ackReminder' }) }, 'Sim, continuar'),
      ),
    );
  }

  function viewCooldown() {
    return h('div', { class: 'card' },
      h('h1', {}, 'YouTube bloqueado'),
      h('p', { class: 'muted' }, 'Sua sessão de Relax terminou. Faça outra coisa por um tempo.'),
      h('div', { class: 'countdown', 'data-cooldown': true }, ''),
      h('p', { class: 'muted small' }, 'até liberar de novo'),
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary', onclick: exitYoutube }, 'Sair do YouTube'),
        h('button', { class: 'btn', onclick: () => { emergencyOpen = true; render(); } }, 'Liberar por emergência'),
      ),
    );
  }

  function viewEmergency() {
    const target = settings.emergencyPhrase;

    const input = /** @type {HTMLTextAreaElement} */ (h('textarea', {
      rows: 3,
      autocomplete: 'off',
      autocorrect: 'off',
      autocapitalize: 'off',
      spellcheck: 'false',
      placeholder: 'Digite a frase exatamente como acima',
    }));
    const status = h('p', { class: 'status' }, `0 / ${target.length} caracteres`);
    const confirm = /** @type {HTMLButtonElement} */ (h('button', { class: 'btn primary', disabled: true }, 'Liberar'));

    // Sem colar, arrastar, autocorretor ou menu de contexto: a frase precisa ser digitada.
    for (const type of ['paste', 'drop', 'dragover', 'contextmenu']) {
      input.addEventListener(type, (e) => e.preventDefault());
    }
    input.addEventListener('beforeinput', (e) => {
      if (/^insertFrom(Paste|Drop|Yank)|^insertReplacementText/.test(e.inputType)) e.preventDefault();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (!confirm.disabled) confirm.click();
    });
    input.addEventListener('input', () => {
      const value = input.value;
      const onTrack = target.startsWith(value);
      input.classList.toggle('error', !onTrack);
      confirm.disabled = value !== target;
      status.textContent = onTrack
        ? `${value.length} / ${target.length} caracteres`
        : 'Há um erro de digitação. Corrija para continuar.';
      status.classList.toggle('error', !onTrack);
    });

    confirm.addEventListener('click', async () => {
      confirm.disabled = true;
      const result = await send({ type: 'emergencyUnlock', phrase: input.value });
      if (!result?.ok) {
        status.textContent = 'Frase incorreta.';
        status.classList.add('error');
      }
      // Em caso de sucesso, o storage muda e a tela volta para a pergunta inicial.
    });

    queueMicrotask(() => input.focus());

    return h('div', { class: 'card' },
      h('h1', {}, 'Liberar por emergência'),
      h('p', { class: 'muted' }, 'Digite a frase abaixo exatamente, sem nenhum erro:'),
      h('blockquote', { class: 'phrase', oncopy: (/** @type {Event} */ e) => e.preventDefault() }, target),
      input,
      status,
      h('div', { class: 'actions' },
        h('button', { class: 'btn', onclick: () => { emergencyOpen = false; render(); } }, 'Cancelar'),
        confirm,
      ),
      h('p', { class: 'muted small' }, 'Bloqueio termina em ', h('span', { 'data-cooldown': true }, '')),
    );
  }

  // ---- Moldura com frase de efeito ----
  // Telas de entrada e de bloqueio mostram uma frase acima do card. Na entrada, a frase
  // aparece sozinha no centro e, após QUOTE_INTRO_MS, sobe para revelar o card (animação em CSS).
  // Navegar entre telas da mesma moldura só troca o card: a frase permanece.

  const QUOTE_INTRO_MS = 3000;
  /** @type {Set<View>} */
  const QUOTE_VIEWS = new Set(['ask', 'choose', 'goal', 'cooldown', 'emergency']);
  /** @type {Set<View>} */
  const INTRO_VIEWS = new Set(['ask', 'choose', 'goal']);

  /** @type {{ screen: HTMLElement, slot: HTMLElement, timer?: ReturnType<typeof setTimeout> } | null} */
  let quoteFrame = null;

  /**
   * @param {HTMLElement} card
   * @param {boolean} intro  espera antes de revelar o card (só quando a moldura nasce)
   */
  function showInQuoteFrame(card, intro) {
    if (quoteFrame) {
      quoteFrame.slot.firstElementChild?.replaceChildren(h('div', { class: 'card-swap' }, card));
      return;
    }

    const quote = yfRandomQuote();
    const slot = h('div', { class: 'card-slot' }, h('div', { class: 'card-slot-inner' }, h('div', {}, card)));
    const screen = h('div', { class: `screen with-quote ${intro ? 'intro' : 'revealed'}` },
      h('figure', { class: 'quote' },
        h('blockquote', {}, `“${quote.text}”`),
        h('figcaption', {}, `— ${quote.author}`),
      ),
      slot,
    );
    quoteFrame = { screen, slot };
    overlayContent.replaceChildren(screen);

    if (!intro) return;
    // Enquanto a frase está sozinha, o card não recebe cliques nem foco.
    slot.inert = true;
    quoteFrame.timer = setTimeout(() => {
      screen.classList.replace('intro', 'revealed');
      slot.inert = false;
      slot.querySelector('input')?.focus();
    }, QUOTE_INTRO_MS);
  }

  function destroyQuoteFrame() {
    if (!quoteFrame) return;
    clearTimeout(quoteFrame.timer);
    quoteFrame = null;
  }

  // ---- Render / atualização ----

  function applyFocusClasses() {
    const active = currentView === 'none' && isFocusActive();
    for (const key of /** @type {(keyof FocusHide)[]} */ (Object.keys(settings.focusHide))) {
      html.classList.toggle(`yf-hide-${key}`, active && settings.focusHide[key]);
    }
  }

  function render() {
    if (yfIsCooldown(state) || state.session) gateStep = 'ask';
    if (!yfIsCooldown(state)) emergencyOpen = false;

    const view = computeView();
    const overlayVisible = view !== 'none';

    html.classList.toggle('yf-locked', overlayVisible);

    if (view !== currentView) {
      currentView = view;
      overlayHost.style.display = overlayVisible ? 'block' : 'none';
      const builders = {
        loading: null, ask: viewAsk, choose: viewChoose, goal: viewGoal, reminder: viewReminder,
        cooldown: viewCooldown, emergency: viewEmergency, none: null,
      };
      const build = builders[view];
      if (build && QUOTE_VIEWS.has(view)) {
        showInQuoteFrame(build(), INTRO_VIEWS.has(view));
      } else {
        destroyQuoteFrame();
        overlayContent.replaceChildren(...(build ? [h('div', { class: 'screen' }, build())] : []));
      }
      if (overlayVisible) {
        pauseVideos();
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      }
    }

    applyFocusClasses();
    updateTimers();
    applyFocusRedirects();
  }

  function updateTimers() {
    if (state.cooldownUntil !== null) {
      const text = yfFormatDuration(state.cooldownUntil - Date.now());
      overlayRoot.querySelectorAll('[data-cooldown]').forEach((el) => { el.textContent = text; });
    }
  }

  function pauseVideos() {
    document.querySelectorAll('video').forEach((v) => v.pause());
  }

  function isVideoPlaying() {
    return [...document.querySelectorAll('video')].some((v) => !v.paused && !v.ended);
  }

  function exitYoutube() {
    location.href = settings.exitUrl;
  }

  /**
   * No Foco, evita feeds infinitos: /shorts/ID abre como vídeo normal, Mixes
   * automáticos (list=RD...) abrem só o vídeo e Em Alta/Explorar voltam para o início.
   */
  function applyFocusRedirects() {
    if (currentView !== 'none' || !isFocusActive()) return;
    const hide = settings.focusHide;

    const shorts = location.pathname.match(/^\/shorts\/([^/?#]+)/);
    if (hide.shorts && shorts) {
      location.replace(`/watch?v=${encodeURIComponent(shorts[1])}`);
      return;
    }

    const params = new URLSearchParams(location.search);
    const videoId = params.get('v');
    if (hide.related && location.pathname === '/watch' && videoId && params.get('list')?.startsWith('RD')) {
      location.replace(`/watch?v=${encodeURIComponent(videoId)}`);
      return;
    }

    if (hide.explore && /^\/feed\/(trending|explore)/.test(location.pathname)) {
      location.replace('/');
    }
  }

  // ---- Autoplay (Foco) ----

  /** Bloqueia o play automático até o usuário interagir com a página. */
  let autoplayGuard = false;
  let autonavHandled = false;

  function armAutoplayGuard() {
    autoplayGuard = location.pathname === '/watch';
    autonavHandled = false;
  }

  function isAutoplayBlocked() {
    return currentView === 'none' && isFocusActive() && settings.focusHide.autoplay;
  }

  /** Desliga o "próximo vídeo automático" do player, uma vez por navegação. */
  function disableAutonav() {
    if (autonavHandled || !isAutoplayBlocked()) return;
    const toggle = document.querySelector('.ytp-autonav-toggle-button');
    if (!toggle) return;
    if (toggle.getAttribute('aria-checked') === 'true' && toggle instanceof HTMLElement) toggle.click();
    autonavHandled = true;
  }

  // ---- Atividade (inatividade encerra o Foco) ----

  let lastActivitySent = 0;

  function markActive() {
    if (!loaded || !isFocusActive()) return;
    const now = Date.now();
    if (now - lastActivitySent < ACTIVITY_THROTTLE_MS) return;
    lastActivitySent = now;
    send({ type: 'activity' });
  }

  // ---- Loop ----

  let reconcilePending = false;
  async function requestReconcile() {
    if (reconcilePending) return;
    reconcilePending = true;
    await send({ type: 'reconcile' });
    reconcilePending = false;
  }

  function tick() {
    if (!loaded) return;

    // O YouTube recria partes do DOM; garante que nossos elementos continuam na página.
    if (!overlayHost.isConnected) html.append(overlayHost);

    // Prazo vencido localmente: o background aplica a transição (o alarm pode atrasar).
    const now = Date.now();
    const deadline = state.session?.relaxDeadline;
    const relaxExpired = deadline != null && deadline <= now;
    const cooldownExpired = state.cooldownUntil !== null && state.cooldownUntil <= now;
    if (relaxExpired || cooldownExpired) requestReconcile();

    if (computeView() !== currentView) render();
    if (currentView !== 'none') pauseVideos();
    else if (isVideoPlaying()) markActive();
    disableAutonav();
    updateTimers();
  }

  // ---- Inicialização ----

  document.addEventListener('play', (e) => {
    if (!(e.target instanceof HTMLMediaElement)) return;
    // Nada toca por trás do overlay; no Foco, nada toca sozinho ao abrir um vídeo.
    if (currentView !== 'none' || (autoplayGuard && isAutoplayBlocked())) e.target.pause();
  }, true);

  for (const type of ['pointerdown', 'keydown']) {
    document.addEventListener(type, () => { autoplayGuard = false; }, true);
  }
  for (const type of ['mousemove', 'keydown', 'wheel', 'scroll', 'click', 'touchstart']) {
    document.addEventListener(type, markActive, { capture: true, passive: true });
  }

  // Navegação interna do YouTube (SPA) não recarrega a página.
  document.addEventListener('yt-navigate-start', armAutoplayGuard);
  document.addEventListener('yt-navigate-finish', () => {
    armAutoplayGuard();
    applyFocusRedirects();
  });
  document.addEventListener('visibilitychange', () => {
    if (loaded) render();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.state) state = yfNormalizeState(changes.state.newValue);
    else if (area === 'sync' && changes.settings) settings = yfNormalizeSettings(changes.settings.newValue);
    else return;
    if (loaded) render();
  });

  armAutoplayGuard();

  (async () => {
    // Pedir ao background garante que prazos vencidos (Relax, cooldown, inatividade) já foram aplicados.
    const fromBackground = await send({ type: 'reconcile' });
    [state, settings] = await Promise.all([
      fromBackground ? yfNormalizeState(fromBackground) : yfGetState(),
      yfGetSettings(),
    ]);
    loaded = true;
    render();
    setInterval(tick, 500);
  })();
})();
