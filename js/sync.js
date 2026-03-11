/**
 * @file sync.js
 * @module sync
 * @description Cross-window scenario synchronisation for CELES-CALC using
 * BroadcastChannel and localStorage, plus file import/export and shareable URLs.
 *
 * Connection states:
 *   'connected'  – BroadcastChannel is active and another tab has been heard from.
 *   'waiting'    – BroadcastChannel open but no other tab seen yet.
 *   'paused'     – Sync is temporarily suspended (e.g. user preference).
 *   'local_only' – BroadcastChannel unavailable; localStorage only.
 */

import { scenarioToJSON, scenarioFromJSON } from './scenario.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** BroadcastChannel name shared by all CELES-CALC windows. */
export const CHANNEL_NAME = 'space-moon-calc-sync';

/** localStorage key for persisting the latest scenario. */
export const STORAGE_KEY = 'spaceMoonCalcScenario';

/** localStorage key for sync connection metadata. */
const META_KEY = 'spaceMoonCalcSyncMeta';

/** Debounce delay for live sync [ms]. */
const DEBOUNCE_MS = 300;

// ─── Internal state ───────────────────────────────────────────────────────────

let _channel        = null;   // BroadcastChannel instance
let _status         = 'waiting';
let _statusListeners = [];    // (status: string) => void
let _debounceTimer  = null;

function _setStatus(s) {
  if (_status !== s) {
    _status = s;
    _statusListeners.forEach(fn => { try { fn(s); } catch (_) {} });
  }
}

// ─── Debounce helper ──────────────────────────────────────────────────────────

/**
 * Debounce a function call by `delay` ms.
 * @param {Function} fn    - Function to debounce.
 * @param {number}   delay - Delay in milliseconds.
 * @returns {Function} Debounced function.
 */
export function debounce(fn, delay = DEBOUNCE_MS) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ─── BroadcastChannel management ─────────────────────────────────────────────

/**
 * Open (or return the existing) BroadcastChannel.
 * Falls back gracefully if the API is unavailable.
 * @returns {BroadcastChannel|null}
 */
function _getChannel() {
  if (_channel) return _channel;
  if (typeof BroadcastChannel === 'undefined') {
    _setStatus('local_only');
    return null;
  }
  _channel = new BroadcastChannel(CHANNEL_NAME);
  _setStatus('waiting');
  return _channel;
}

// ─── Publish ──────────────────────────────────────────────────────────────────

/**
 * Publish a scenario state to all open CELES-CALC tabs via BroadcastChannel
 * and also persist it to localStorage.
 *
 * @param {object} scenario - Scenario object.
 */
export function publishScenarioState(scenario) {
  const json = scenarioToJSON(scenario);
  saveScenarioToStorage(scenario);
  const ch = _getChannel();
  if (ch) {
    try {
      ch.postMessage({ type: 'scenario_update', payload: json, ts: Date.now() });
      _setStatus('connected');
    } catch (err) {
      console.warn('[sync] BroadcastChannel postMessage failed:', err);
    }
  }
}

// ─── Subscribe ────────────────────────────────────────────────────────────────

/**
 * Subscribe to incoming scenario updates from other tabs.
 * Sets up both a BroadcastChannel `message` listener and a `storage` event
 * listener for cross-browser fallback.
 *
 * @param {(scenario: object, source: 'broadcast'|'storage') => void} callback
 * @returns {{ unsubscribe: () => void }} Call `.unsubscribe()` to remove listeners.
 */
export function subscribeScenarioState(callback) {
  const ch = _getChannel();

  function onMessage(event) {
    if (event.data?.type === 'scenario_update') {
      _setStatus('connected');
      try {
        const s = scenarioFromJSON(event.data.payload);
        callback(s, 'broadcast');
      } catch (err) {
        console.warn('[sync] Failed to parse broadcast scenario:', err);
      }
    }
  }

  function onStorage(event) {
    if (event.key === STORAGE_KEY && event.newValue) {
      try {
        const s = scenarioFromJSON(event.newValue);
        callback(s, 'storage');
      } catch (err) {
        console.warn('[sync] Failed to parse storage scenario:', err);
      }
    }
  }

  if (ch) ch.addEventListener('message', onMessage);
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
  }

  return {
    unsubscribe() {
      if (ch) ch.removeEventListener('message', onMessage);
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', onStorage);
      }
    },
  };
}

// ─── Connection status ────────────────────────────────────────────────────────

/**
 * Get the current sync connection status.
 * @returns {'connected'|'waiting'|'paused'|'local_only'} Current status.
 */
export function getConnectionStatus() {
  return _status;
}

/**
 * Subscribe to connection status changes.
 * @param {(status: string) => void} listener
 * @returns {{ unsubscribe: () => void }}
 */
export function onConnectionStatusChange(listener) {
  _statusListeners.push(listener);
  return {
    unsubscribe() {
      _statusListeners = _statusListeners.filter(fn => fn !== listener);
    },
  };
}

/**
 * Pause cross-window sync (messages are still stored locally).
 */
export function pauseSync() {
  _setStatus('paused');
}

/**
 * Resume cross-window sync.
 */
export function resumeSync() {
  _setStatus(_channel ? 'waiting' : 'local_only');
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

/**
 * Save a scenario to localStorage.
 * @param {object} scenario
 */
export function saveScenarioToStorage(scenario) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, scenarioToJSON(scenario));
    localStorage.setItem(META_KEY, JSON.stringify({ savedAt: new Date().toISOString() }));
  } catch (err) {
    console.warn('[sync] localStorage write failed:', err);
  }
}

/**
 * Load the last scenario from localStorage, or return null.
 * @returns {object|null}
 */
export function loadScenarioFromStorage() {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return scenarioFromJSON(raw);
  } catch (err) {
    console.warn('[sync] Failed to parse stored scenario:', err);
    return null;
  }
}

/** Alias for loadScenarioFromStorage for backwards-compatibility. */
export function getLastStoredScenario() {
  return loadScenarioFromStorage();
}

/**
 * Remove the stored scenario from localStorage.
 */
export function clearStoredScenario() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(META_KEY);
}

// ─── File import / export ─────────────────────────────────────────────────────

/**
 * Trigger a browser download of the scenario as a JSON file.
 *
 * @param {object} scenario - Scenario to export.
 * @param {string} [filename] - Override default filename.
 */
export function exportScenarioFile(scenario, filename) {
  const json    = scenarioToJSON(scenario);
  const blob    = new Blob([json], { type: 'application/json' });
  const url     = URL.createObjectURL(blob);
  const ts      = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
  const name    = filename ?? `celes-calc-scenario-${ts}.json`;
  const anchor  = document.createElement('a');
  anchor.href     = url;
  anchor.download = name;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Read a JSON scenario file selected by the user.
 *
 * @param {File} file - File object (from an <input type="file"> or drag-and-drop).
 * @returns {Promise<object>} Resolves to the parsed scenario object.
 */
export function importScenarioFile(file) {
  return new Promise((resolve, reject) => {
    if (!(file instanceof Blob)) {
      reject(new Error('importScenarioFile: argument must be a File or Blob.'));
      return;
    }
    const reader = new FileReader();
    reader.onload  = event => {
      try {
        resolve(scenarioFromJSON(event.target.result));
      } catch (err) {
        reject(new Error(`importScenarioFile: JSON parse error — ${err.message}`));
      }
    };
    reader.onerror = () => reject(new Error('importScenarioFile: File read error.'));
    reader.readAsText(file);
  });
}

// ─── Share URL ────────────────────────────────────────────────────────────────

/**
 * Encode a compact subset of the scenario as a base64-URL string and append it
 * as the URL hash fragment.
 *
 * Only the fields needed to restore a meaningful shared view are included:
 * version, timeInput, observers, targets, settings.
 *
 * @param {object} scenario
 * @returns {string} Full URL with encoded scenario in the hash fragment.
 */
export function generateShareURL(scenario) {
  const compact = {
    v:  scenario.version,
    ti: scenario.timeInput,
    ob: scenario.observers,
    tg: scenario.targets,
    s:  scenario.settings,
    n:  scenario.notes,
  };
  const json    = JSON.stringify(compact);
  const encoded = _toBase64URL(json);
  const base    = typeof location !== 'undefined'
    ? `${location.origin}${location.pathname}`
    : 'https://celes-calc.local/';
  return `${base}#share=${encoded}`;
}

/**
 * Parse a share URL generated by {@link generateShareURL} and restore a
 * scenario object from the embedded data.
 *
 * @param {string} [url] - URL to parse. Defaults to `location.href`.
 * @returns {object|null} Partial scenario, or null if no share fragment found.
 */
export function parseShareURL(url) {
  const href = url ?? (typeof location !== 'undefined' ? location.href : '');
  const hashIdx = href.indexOf('#share=');
  if (hashIdx === -1) return null;
  const encoded = href.slice(hashIdx + 7);
  try {
    const json    = _fromBase64URL(encoded);
    const compact = JSON.parse(json);
    return {
      version:    compact.v  ?? '1.0',
      timeInput:  compact.ti ?? { utc: '', jd: 0, unix: 0 },
      observers:  compact.ob ?? [],
      targets:    compact.tg ?? [],
      settings:   compact.s  ?? {},
      notes:      compact.n  ?? '',
    };
  } catch (err) {
    console.warn('[sync] parseShareURL: failed to decode share fragment:', err);
    return null;
  }
}

// ─── Base64-URL helpers ───────────────────────────────────────────────────────

/**
 * Encode a string to a URL-safe base64 string.
 * @param {string} str
 * @returns {string}
 */
function _toBase64URL(str) {
  // btoa is available in all modern browsers and Node ≥ 16
  const b64 = typeof btoa !== 'undefined'
    ? btoa(unescape(encodeURIComponent(str)))
    : Buffer.from(str, 'utf8').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decode a URL-safe base64 string back to a plain string.
 * @param {string} b64url
 * @returns {string}
 */
function _fromBase64URL(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
  return typeof atob !== 'undefined'
    ? decodeURIComponent(escape(atob(padded)))
    : Buffer.from(padded, 'base64').toString('utf8');
}
