// @ts-check
// Compartilhado entre o background (importScripts), o content script e o popup.
// É um script clássico (não-módulo): as declarações abaixo ficam globais.

/**
 * O que o Modo Foco esconde/bloqueia. Cada chave vira a classe `yf-hide-<chave>` em <html>.
 * @typedef {Object} FocusHide
 * @property {boolean} shorts         Shorts (e abrir /shorts/ como vídeo normal)
 * @property {boolean} home           feed da página inicial
 * @property {boolean} related        recomendações laterais e Mixes automáticos
 * @property {boolean} endscreen      tela final e cards de sugestão no player
 * @property {boolean} comments       comentários
 * @property {boolean} livechat       chat ao vivo
 * @property {boolean} explore        Em Alta / Explorar
 * @property {boolean} notifications  sino de notificações
 * @property {boolean} searchClutter  prateleiras irrelevantes na busca
 * @property {boolean} autoplay       autoplay ao abrir vídeo e próximo vídeo automático
 */

/**
 * @typedef {Object} Settings
 * @property {number} relaxMinutes      duração do Modo Relax
 * @property {number} cooldownMinutes   duração do bloqueio após o Relax
 * @property {number} focusIdleMinutes  inatividade que encerra o Modo Foco
 * @property {boolean} askGoal          pedir o objetivo ao entrar no Foco
 * @property {number} reminderMinutes   intervalo dos lembretes no Foco (0 = desligado)
 * @property {FocusHide} focusHide
 * @property {string} exitUrl           destino do botão "Não, sair"
 * @property {string} emergencyPhrase   frase exigida para liberar durante o bloqueio
 */

/** @typedef {'focus' | 'relax'} Mode */

/**
 * @typedef {Object} Session
 * @property {Mode} mode
 * @property {number} startedAt
 * @property {number | null} relaxDeadline  timestamp (ms) em que o Relax acaba; null no Foco
 * @property {string | null} goal           objetivo informado ao entrar no Foco
 * @property {number | null} reminderAckAt  último lembrete respondido
 */

/**
 * @typedef {Object} State
 * @property {Session | null} session       null = sem sessão ativa
 * @property {number | null} cooldownUntil  timestamp (ms) em que o bloqueio termina
 * @property {boolean} resumeAtChoice       após encerrar um Foco, volta direto para a escolha de modo
 */

const YF_MINUTE = 60 * 1000;

/** @type {Record<keyof FocusHide, string>} */
const YF_FOCUS_HIDE_LABELS = {
  shorts: 'Shorts',
  home: 'Feed da página inicial',
  related: 'Recomendações laterais e Mixes',
  endscreen: 'Sugestões no fim do vídeo',
  comments: 'Comentários',
  livechat: 'Chat ao vivo',
  explore: 'Em Alta / Explorar',
  notifications: 'Notificações',
  searchClutter: 'Prateleiras irrelevantes na busca',
  autoplay: 'Autoplay',
};

/** @type {Settings} */
const YF_DEFAULT_SETTINGS = {
  relaxMinutes: 20,
  cooldownMinutes: 5,
  focusIdleMinutes: 30,
  askGoal: true,
  reminderMinutes: 15,
  focusHide: {
    shorts: true,
    home: true,
    related: true,
    endscreen: true,
    comments: true,
    livechat: true,
    explore: true,
    notifications: true,
    searchClutter: true,
    autoplay: true,
  },
  exitUrl: 'https://www.google.com',
  emergencyPhrase: 'Eu realmente preciso usar o youtube agora e isso não é uma decisão por impulso',
};

/**
 * @param {any} raw  dado cru do storage
 * @returns {Settings}
 */
function yfNormalizeSettings(raw) {
  return {
    ...YF_DEFAULT_SETTINGS,
    ...raw,
    focusHide: { ...YF_DEFAULT_SETTINGS.focusHide, ...raw?.focusHide },
  };
}

/** @returns {Promise<Settings>} */
async function yfGetSettings() {
  const { settings } = await chrome.storage.sync.get('settings');
  return yfNormalizeSettings(settings);
}

/** @param {Settings} settings */
async function yfSetSettings(settings) {
  await chrome.storage.sync.set({ settings });
}

/**
 * @param {any} raw  dado cru do storage
 * @returns {Session | null}
 */
function yfNormalizeSession(raw) {
  if (raw?.mode !== 'focus' && raw?.mode !== 'relax') return null;
  return {
    mode: raw.mode,
    startedAt: raw.startedAt ?? 0, // sessões da v1 não têm startedAt: expiram no próximo reconcile
    relaxDeadline: raw.relaxDeadline ?? null,
    goal: raw.goal ?? null,
    reminderAckAt: raw.reminderAckAt ?? null,
  };
}

/**
 * @param {any} raw  dado cru do storage
 * @returns {State}
 */
function yfNormalizeState(raw) {
  return {
    session: yfNormalizeSession(raw?.session),
    cooldownUntil: raw?.cooldownUntil ?? null,
    resumeAtChoice: raw?.resumeAtChoice ?? false,
  };
}

/** @returns {Promise<State>} */
async function yfGetState() {
  const { state } = await chrome.storage.local.get('state');
  return yfNormalizeState(state);
}

/** @param {State} state */
async function yfSetState(state) {
  await chrome.storage.local.set({ state });
}

/**
 * Último momento de atividade no Modo Foco. Fica fora de `state` para que os
 * updates frequentes não façam todas as abas re-renderizarem.
 * @returns {Promise<number | null>}
 */
async function yfGetActivity() {
  const { focusActivity } = await chrome.storage.local.get('focusActivity');
  return /** @type {any} */ (focusActivity)?.lastAt ?? null;
}

/** @param {number} lastAt */
async function yfSetActivity(lastAt) {
  await chrome.storage.local.set({ focusActivity: { lastAt } });
}

/**
 * @param {State} state
 * @param {number} [now]
 */
function yfIsCooldown(state, now = Date.now()) {
  return state.cooldownUntil !== null && state.cooldownUntil > now;
}

/**
 * Formata uma duração como "m:ss" ou "h:mm:ss".
 * @param {number} ms
 */
function yfFormatDuration(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
