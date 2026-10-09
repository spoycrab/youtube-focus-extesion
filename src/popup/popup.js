// @ts-check
// Popup da extensão: status da sessão, encerrar sessão e configurações.

const END_CONFIRM_TIMEOUT_MS = 4000;

/** @type {State} */
let state = yfNormalizeState(undefined);
/** @type {Settings} */
let settings = yfNormalizeSettings(undefined);
/** @type {number | null} */
let lastActivityAt = null;
let endConfirmArmed = false;
/** @type {ReturnType<typeof setTimeout> | undefined} */
let endConfirmTimer;

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

const form = /** @type {HTMLFormElement} */ ($('settings'));
const fields = /** @type {HTMLFieldSetElement} */ ($('settings-fields'));
const btnEnd = /** @type {HTMLButtonElement} */ ($('btn-end'));

/** @param {string} name */
const field = (name) => /** @type {HTMLInputElement} */ (form.elements.namedItem(name));

function renderStatus() {
  const now = Date.now();
  const session = state.session;
  const cooldown = yfIsCooldown(state, now);

  let mode = '';
  let label = 'Sem sessão ativa';
  let timeText = '';
  if (cooldown && state.cooldownUntil !== null) {
    mode = 'cooldown';
    label = 'YouTube bloqueado';
    timeText = `Libera em ${yfFormatDuration(state.cooldownUntil - now)}`;
  } else if (session?.mode === 'relax' && session.relaxDeadline !== null) {
    mode = 'relax';
    label = 'Modo Relax';
    timeText = `${yfFormatDuration(session.relaxDeadline - now)} restantes`;
  } else if (session?.mode === 'focus') {
    mode = 'focus';
    label = 'Modo Foco';
    const idleSince = lastActivityAt ?? session.startedAt;
    const idleLeft = idleSince + settings.focusIdleMinutes * YF_MINUTE - now;
    timeText = `Encerra após ${settings.focusIdleMinutes} min de inatividade (${yfFormatDuration(idleLeft)} se ficar parado)`;
  }

  $('status-dot').className = `dot ${mode}`;
  $('status-label').textContent = label;
  $('status-time').textContent = timeText;
  $('status-goal').textContent = session?.mode === 'focus' && session.goal ? `Objetivo: ${session.goal}` : '';

  btnEnd.hidden = !session || cooldown;
  btnEnd.textContent = endConfirmArmed
    ? `Clique de novo: bloqueio de ${settings.cooldownMinutes} min`
    : 'Encerrar sessão';
  btnEnd.classList.toggle('danger', endConfirmArmed);

  const locked = cooldown || session != null;
  fields.disabled = locked;
  const note = $('locked-note');
  note.hidden = !locked;
  note.textContent = cooldown
    ? 'Configurações bloqueadas durante o bloqueio.'
    : 'Encerre a sessão atual para alterar as configurações.';
}

function buildFocusHideChecks() {
  const container = $('focus-hide');
  for (const [key, text] of Object.entries(YF_FOCUS_HIDE_LABELS)) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = `focusHide.${key}`;
    const label = document.createElement('label');
    label.className = 'check';
    label.append(input, text);
    container.append(label);
  }
}

function fillForm() {
  for (const name of ['relaxMinutes', 'cooldownMinutes', 'focusIdleMinutes', 'reminderMinutes', 'exitUrl', 'emergencyPhrase']) {
    field(name).value = String(settings[/** @type {keyof Settings} */ (name)]);
  }
  field('askGoal').checked = settings.askGoal;
  for (const [key, value] of Object.entries(settings.focusHide)) {
    field(`focusHide.${key}`).checked = value;
  }
}

function readForm() {
  /** @type {Record<string, boolean>} */
  const focusHide = {};
  for (const key of Object.keys(YF_FOCUS_HIDE_LABELS)) {
    focusHide[key] = field(`focusHide.${key}`).checked;
  }
  return {
    relaxMinutes: field('relaxMinutes').value,
    cooldownMinutes: field('cooldownMinutes').value,
    focusIdleMinutes: field('focusIdleMinutes').value,
    reminderMinutes: field('reminderMinutes').value,
    askGoal: field('askGoal').checked,
    focusHide,
    exitUrl: field('exitUrl').value,
    emergencyPhrase: field('emergencyPhrase').value,
  };
}

btnEnd.addEventListener('click', () => {
  // Encerrar o Relax inicia o bloqueio: pede um segundo clique.
  if (state.session?.mode === 'relax' && !endConfirmArmed) {
    endConfirmArmed = true;
    clearTimeout(endConfirmTimer);
    endConfirmTimer = setTimeout(() => { endConfirmArmed = false; renderStatus(); }, END_CONFIRM_TIMEOUT_MS);
    renderStatus();
    return;
  }
  endConfirmArmed = false;
  clearTimeout(endConfirmTimer);
  chrome.runtime.sendMessage({ type: 'endSession' });
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const result = await chrome.runtime.sendMessage({ type: 'saveSettings', settings: readForm() });
  const out = $('save-result');
  out.textContent = result?.ok ? 'Salvo!' : result?.error ?? 'Erro ao salvar.';
  out.className = `result ${result?.ok ? 'ok' : 'error'}`;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.state) state = yfNormalizeState(changes.state.newValue);
  if (area === 'local' && changes.focusActivity) lastActivityAt = /** @type {any} */ (changes.focusActivity.newValue)?.lastAt ?? null;
  if (area === 'sync' && changes.settings) settings = yfNormalizeSettings(changes.settings.newValue);
  renderStatus();
});

(async () => {
  buildFocusHideChecks();
  const [fresh, loadedSettings, activity] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'reconcile' }),
    yfGetSettings(),
    yfGetActivity(),
  ]);
  state = yfNormalizeState(fresh);
  settings = loadedSettings;
  lastActivityAt = activity;
  fillForm();
  renderStatus();
  setInterval(renderStatus, 1000);
})();
