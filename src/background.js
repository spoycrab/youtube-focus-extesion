// @ts-check
// Service worker: única fonte de verdade das transições de estado.
// O estado vive em chrome.storage (o worker pode ser descarregado a qualquer momento);
// as abas reagem via chrome.storage.onChanged.

importScripts('shared/storage.js');

const ALARM_RELAX_END = 'relax-end';
const ALARM_COOLDOWN_END = 'cooldown-end';
const ALARM_FOCUS_IDLE = 'focus-idle';

// Alarms podem disparar alguns ms antes/depois; tolerância para considerar um prazo vencido.
const DEADLINE_TOLERANCE_MS = 1000;
const GOAL_MAX_LENGTH = 140;

/** Inicia o bloqueio e encerra a sessão atual. */
async function startCooldown() {
  const settings = await yfGetSettings();
  const until = Date.now() + settings.cooldownMinutes * YF_MINUTE;
  /** @type {State} */
  const next = { session: null, cooldownUntil: until, resumeAtChoice: false };
  await yfSetState(next);
  await chrome.alarms.clear(ALARM_RELAX_END);
  await chrome.alarms.clear(ALARM_FOCUS_IDLE);
  await chrome.alarms.create(ALARM_COOLDOWN_END, { when: until });
  return next;
}

/** Agenda a expiração do Foco a partir da última atividade. @param {number} lastAt */
async function scheduleFocusIdle(lastAt) {
  const settings = await yfGetSettings();
  await chrome.alarms.create(ALARM_FOCUS_IDLE, { when: lastAt + settings.focusIdleMinutes * YF_MINUTE });
}

/**
 * Aplica prazos vencidos. Chamado pelos alarms e sempre que alguém pede o estado,
 * para cobrir alarms atrasados ou o worker ter ficado descarregado.
 * @returns {Promise<State>}
 */
async function reconcile() {
  const state = await yfGetState();
  const now = Date.now() + DEADLINE_TOLERANCE_MS;

  if (state.cooldownUntil !== null && state.cooldownUntil <= now) {
    state.cooldownUntil = null;
    await yfSetState(state);
  }

  const session = state.session;
  if (session?.mode === 'relax' && session.relaxDeadline !== null && session.relaxDeadline <= now) {
    return startCooldown();
  }

  if (session?.mode === 'focus') {
    const [settings, lastAt] = await Promise.all([yfGetSettings(), yfGetActivity()]);
    const idleSince = lastAt ?? session.startedAt;
    if (idleSince + settings.focusIdleMinutes * YF_MINUTE <= now) {
      // Expirou por inatividade: a próxima visita começa pela pergunta inicial.
      const next = { ...state, session: null, resumeAtChoice: false };
      await yfSetState(next);
      await chrome.alarms.clear(ALARM_FOCUS_IDLE);
      return next;
    }
  }
  return state;
}

/**
 * Só inicia um modo quando não há sessão nem bloqueio: para trocar, é preciso encerrar antes.
 * @param {Mode} mode
 * @param {string | null} goal
 */
async function chooseMode(mode, goal) {
  const state = await reconcile();
  if (yfIsCooldown(state) || state.session) return state;

  const now = Date.now();
  /** @type {Session} */
  const session = { mode, startedAt: now, relaxDeadline: null, goal: null, reminderAckAt: null };

  if (mode === 'relax') {
    const settings = await yfGetSettings();
    session.relaxDeadline = now + settings.relaxMinutes * YF_MINUTE;
    await chrome.alarms.create(ALARM_RELAX_END, { when: session.relaxDeadline });
  } else {
    session.goal = goal?.trim().slice(0, GOAL_MAX_LENGTH) || null;
    await yfSetActivity(now);
    await scheduleFocusIdle(now);
  }

  /** @type {State} */
  const next = { session, cooldownUntil: null, resumeAtChoice: false };
  await yfSetState(next);
  return next;
}

/** Relax encerrado sempre vira bloqueio; Foco encerrado volta para a escolha de modo. */
async function endSession() {
  const state = await reconcile();
  if (!state.session) return state;
  if (state.session.mode === 'relax') return startCooldown();

  const next = { ...state, session: null, resumeAtChoice: true };
  await yfSetState(next);
  await chrome.alarms.clear(ALARM_FOCUS_IDLE);
  return next;
}

async function recordActivity() {
  const state = await yfGetState();
  if (state.session?.mode !== 'focus') return { ok: false };
  const now = Date.now();
  await yfSetActivity(now);
  await scheduleFocusIdle(now);
  return { ok: true };
}

async function ackReminder() {
  const state = await yfGetState();
  if (!state.session) return state;
  const next = { ...state, session: { ...state.session, reminderAckAt: Date.now() } };
  await yfSetState(next);
  return next;
}

/** @param {string} phrase */
async function emergencyUnlock(phrase) {
  const settings = await yfGetSettings();
  if (phrase !== settings.emergencyPhrase) return { ok: false };

  await chrome.alarms.clear(ALARM_COOLDOWN_END);
  await chrome.alarms.clear(ALARM_RELAX_END);
  await chrome.alarms.clear(ALARM_FOCUS_IDLE);
  await yfSetState({ session: null, cooldownUntil: null, resumeAtChoice: false });
  return { ok: true };
}

/**
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 */
function isIntInRange(value, min, max) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max;
}

/** @param {any} input */
async function saveSettings(input) {
  const state = await reconcile();
  if (yfIsCooldown(state)) {
    return { ok: false, error: 'Não é possível alterar as configurações durante o bloqueio.' };
  }
  if (state.session) {
    return { ok: false, error: 'Encerre a sessão atual para alterar as configurações.' };
  }

  if (!isIntInRange(input.relaxMinutes, 1, 600)) {
    return { ok: false, error: 'Tempo de Relax deve ser um número inteiro entre 1 e 600 minutos.' };
  }
  if (!isIntInRange(input.cooldownMinutes, 1, 1440)) {
    return { ok: false, error: 'Tempo de bloqueio deve ser um número inteiro entre 1 e 1440 minutos.' };
  }
  if (!isIntInRange(input.focusIdleMinutes, 5, 240)) {
    return { ok: false, error: 'Inatividade do Foco deve ser um número inteiro entre 5 e 240 minutos.' };
  }
  if (!isIntInRange(input.reminderMinutes, 0, 120)) {
    return { ok: false, error: 'Intervalo de lembrete deve ser um número inteiro entre 0 e 120 minutos.' };
  }

  const exitUrl = String(input.exitUrl ?? '').trim();
  if (!/^https?:\/\/\S+$/.test(exitUrl) || /youtube\.com/i.test(exitUrl)) {
    return { ok: false, error: 'URL de saída inválida (precisa começar com http:// ou https:// e não ser do YouTube).' };
  }
  const emergencyPhrase = String(input.emergencyPhrase ?? '').trim();
  if (emergencyPhrase.length < 10) {
    return { ok: false, error: 'A frase de emergência precisa ter pelo menos 10 caracteres.' };
  }

  /** @type {FocusHide} */
  const focusHide = { ...YF_DEFAULT_SETTINGS.focusHide };
  for (const key of /** @type {(keyof FocusHide)[]} */ (Object.keys(focusHide))) {
    focusHide[key] = input.focusHide?.[key] === true;
  }

  await yfSetSettings({
    relaxMinutes: Number(input.relaxMinutes),
    cooldownMinutes: Number(input.cooldownMinutes),
    focusIdleMinutes: Number(input.focusIdleMinutes),
    askGoal: input.askGoal === true,
    reminderMinutes: Number(input.reminderMinutes),
    focusHide,
    exitUrl,
    emergencyPhrase,
  });
  return { ok: true };
}

chrome.runtime.onStartup.addListener(() => {
  reconcile();
});

chrome.runtime.onInstalled.addListener(() => {
  reconcile();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if ([ALARM_RELAX_END, ALARM_COOLDOWN_END, ALARM_FOCUS_IDLE].includes(alarm.name)) reconcile();
});

// ---- Mensagens do content script e do popup ----

/** @param {any} msg */
async function handleMessage(msg) {
  switch (msg?.type) {
    case 'reconcile':
      return reconcile();
    case 'chooseMode':
      if (msg.mode !== 'focus' && msg.mode !== 'relax') throw new Error(`Modo inválido: ${msg.mode}`);
      return chooseMode(msg.mode, typeof msg.goal === 'string' ? msg.goal : null);
    case 'endSession':
      return endSession();
    case 'activity':
      return recordActivity();
    case 'ackReminder':
      return ackReminder();
    case 'emergencyUnlock':
      return emergencyUnlock(String(msg.phrase ?? ''));
    case 'saveSettings':
      return saveSettings(msg.settings ?? {});
    default:
      throw new Error(`Mensagem desconhecida: ${msg?.type}`);
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg).then(sendResponse, (err) => sendResponse({ ok: false, error: String(err) }));
  return true; // resposta assíncrona
});
