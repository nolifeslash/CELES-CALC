/**
 * ui.js — Calculator UI helpers
 * Tabs, panels, validation, result rendering, copy, sync badge, theme, toast, modals.
 */

/* ================================================================
   Internal state
   ================================================================ */
let _activePrecision = 'std';   // 'edu' | 'std' | 'adv'
let _activeTheme = 'light';
let _activeTab = 'home';

/* ================================================================
   Tab navigation
   ================================================================ */
/**
 * Activate a top-level tab by its data-tab value.
 * @param {string} tabId
 */
export function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-panel').forEach(panel => {
    const id = panel.id.replace('panel-', '');
    panel.classList.toggle('active', id === tabId);
  });
  _activeTab = tabId;
}

/**
 * Wire up all top-level tab buttons using event delegation.
 * @param {function(string):void} [onSwitch] optional callback
 */
export function initTabs(onSwitch) {
  const bar = document.getElementById('tab-bar');
  if (!bar) return;
  bar.addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn');
    if (btn && btn.dataset.tab) {
      switchTab(btn.dataset.tab);
      if (onSwitch) onSwitch(btn.dataset.tab);
    }
  });
}

/**
 * Wire up sub-tab bars (buttons with data-subtab) inside a parent element.
 * @param {string} barId   id of the .sub-tab-bar element
 */
export function initSubTabs(barId) {
  const bar = document.getElementById(barId);
  if (!bar) return;
  bar.addEventListener('click', e => {
    const btn = e.target.closest('.sub-tab-btn');
    if (!btn || !btn.dataset.subtab) return;
    const panelId = btn.dataset.subtab;
    // update buttons
    bar.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.toggle('active', b === btn));
    // update panels — find sibling sub-panels
    const container = bar.nextElementSibling?.parentElement || bar.parentElement;
    container.querySelectorAll('.sub-panel').forEach(p => {
      p.classList.toggle('active', p.id === panelId);
    });
  });
}

/* ================================================================
   Panel show / hide
   ================================================================ */
export function showPanel(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}
export function hidePanel(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}
export function togglePanel(id) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('hidden');
}

/* ================================================================
   Input validation
   ================================================================ */
/**
 * Validate a numeric input. Returns parsed number or null.
 * Marks the input with .input-err class and shows an error message.
 * @param {string|HTMLInputElement} inputOrId
 * @param {object} opts  { required, min, max, label }
 * @returns {number|null}
 */
export function validateNumber(inputOrId, opts = {}) {
  const el = typeof inputOrId === 'string' ? document.getElementById(inputOrId) : inputOrId;
  if (!el) return null;
  const val = el.value.trim();
  const errEl = el.nextElementSibling?.classList?.contains('err-msg')
    ? el.nextElementSibling
    : document.getElementById(el.id + '-err');
  const setErr = msg => {
    el.classList.add('input-err');
    if (errEl) { errEl.textContent = msg; errEl.classList.add('show'); }
  };
  const clearErr = () => {
    el.classList.remove('input-err');
    if (errEl) { errEl.textContent = ''; errEl.classList.remove('show'); }
  };
  clearErr();
  if (val === '' || val === null) {
    if (opts.required !== false) { setErr(`${opts.label || 'Value'} is required`); return null; }
    return null;
  }
  const n = parseFloat(val);
  if (isNaN(n)) { setErr(`${opts.label || 'Value'} must be a number`); return null; }
  if (opts.min !== undefined && n < opts.min) { setErr(`Min value: ${opts.min}`); return null; }
  if (opts.max !== undefined && n > opts.max) { setErr(`Max value: ${opts.max}`); return null; }
  clearErr();
  return n;
}

/**
 * Validate a text / UTC input. Returns trimmed string or null.
 */
export function validateText(inputOrId, opts = {}) {
  const el = typeof inputOrId === 'string' ? document.getElementById(inputOrId) : inputOrId;
  if (!el) return null;
  const val = el.value.trim();
  const errId = el.id + '-err';
  const errEl = document.getElementById(errId) || el.nextElementSibling;
  const setErr = msg => {
    el.classList.add('input-err');
    if (errEl?.classList?.contains('err-msg')) { errEl.textContent = msg; errEl.classList.add('show'); }
  };
  const clearErr = () => {
    el.classList.remove('input-err');
    if (errEl?.classList?.contains('err-msg')) { errEl.textContent = ''; errEl.classList.remove('show'); }
  };
  clearErr();
  if (!val && opts.required !== false) { setErr(`${opts.label || 'Field'} is required`); return null; }
  return val || null;
}

export function clearErrors(formEl) {
  if (!formEl) return;
  formEl.querySelectorAll('.input-err').forEach(el => el.classList.remove('input-err'));
  formEl.querySelectorAll('.err-msg').forEach(el => { el.textContent = ''; el.classList.remove('show'); });
}

/* ================================================================
   Result rendering
   ================================================================ */
const PREC_MAP = { edu: 3, std: 6, adv: 12 };

/**
 * Format a number according to active precision.
 * @param {number} value
 * @param {number|null} [overrideSigFigs]
 * @returns {string}
 */
export function formatNumber(value, overrideSigFigs = null) {
  if (value === undefined || value === null || isNaN(value)) return '—';
  const sf = overrideSigFigs ?? PREC_MAP[_activePrecision] ?? 6;
  if (Math.abs(value) === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1e-4 && abs < 1e9) {
    // Fixed notation — decide decimal places from sigfigs
    const decimals = Math.max(0, sf - 1 - Math.floor(Math.log10(abs)));
    return value.toFixed(Math.min(decimals, 15));
  }
  return value.toPrecision(sf);
}

/**
 * Format an angle in degrees with DMS option.
 * @param {number} deg
 * @param {'deg'|'dms'} [fmt]
 */
export function formatAngle(deg, fmt = 'deg') {
  if (isNaN(deg)) return '—';
  if (fmt === 'dms') {
    const sign = deg < 0 ? '-' : '';
    const abs = Math.abs(deg);
    const d = Math.floor(abs);
    const mFull = (abs - d) * 60;
    const m = Math.floor(mFull);
    const s = ((mFull - m) * 60).toFixed(2);
    return `${sign}${d}° ${m}′ ${s}″`;
  }
  return formatNumber(deg) + '°';
}

/**
 * Format a distance in metres, converting to km/AU as appropriate.
 * @param {number} meters
 * @param {'m'|'km'|'auto'} [unit]
 */
export function formatDistance(meters, unit = 'auto') {
  if (isNaN(meters)) return '—';
  if (unit === 'm') return formatNumber(meters) + ' m';
  if (unit === 'km') return formatNumber(meters / 1e3) + ' km';
  if (Math.abs(meters) >= 1e9) return formatNumber(meters / 1.496e11) + ' AU';
  if (Math.abs(meters) >= 1e6) return formatNumber(meters / 1e3) + ' km';
  return formatNumber(meters) + ' m';
}

/**
 * Format seconds as h m s or days.
 */
export function formatDuration(seconds) {
  if (isNaN(seconds)) return '—';
  if (seconds < 60) return formatNumber(seconds) + ' s';
  if (seconds < 3600) return formatNumber(seconds / 60) + ' min';
  if (seconds < 86400) return formatNumber(seconds / 3600) + ' h';
  return formatNumber(seconds / 86400) + ' days';
}

/**
 * Render result cards into a container.
 * @param {string} containerId
 * @param {Array<{label:string, value:*, unit?:string, variant?:string, copy?:boolean}>} items
 * @param {string} [title]
 */
export function renderResultCards(containerId, items, title = '') {
  const container = document.getElementById(containerId);
  if (!container) return;
  let html = '';
  if (title) html += `<div class="card-title mt-sm">${title}</div>`;
  html += '<div class="results-grid">';
  for (const item of items) {
    const val = item.value ?? '—';
    const variant = item.variant ? ` ${item.variant}` : '';
    const unit = item.unit ? `<span class="ru">${item.unit}</span>` : '';
    const copyBtn = item.copy !== false
      ? `<button class="copy-val" title="Copy" data-copy="${escapeAttr(String(val))}">⎘</button>`
      : '';
    html += `<div class="result-card${variant}">
      <div class="rl">${item.label}</div>
      <div class="rv">${formatValue(val)}${unit}</div>
      ${copyBtn}
    </div>`;
  }
  html += '</div>';
  container.innerHTML = html;
  // bind copy buttons
  container.querySelectorAll('.copy-val').forEach(btn => {
    btn.addEventListener('click', () => {
      copyToClipboard(btn.dataset.copy);
      showToast('Copied!', 'ok', 1500);
    });
  });
}

/**
 * Render a result card with arbitrary HTML body.
 * @param {string} containerId
 * @param {string} title
 * @param {string} bodyHTML
 * @param {string} [variant]
 */
export function renderResultCard(containerId, title, bodyHTML, variant = '') {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = `<div class="card${variant ? ' ' + variant : ''} mt-sm">
    ${title ? `<div class="card-title">${title}</div>` : ''}
    ${bodyHTML}
  </div>`;
}

/**
 * Render a table into a container.
 * @param {string} containerId
 * @param {string[]} headers
 * @param {Array<string[]>} rows
 * @param {string} [title]
 */
export function renderTable(containerId, headers, rows, title = '') {
  const container = document.getElementById(containerId);
  if (!container) return;
  let html = title ? `<div class="card-title mt-sm">${title}</div>` : '';
  html += '<div class="rtable-wrap"><table class="rtable"><thead><tr>';
  for (const h of headers) html += `<th>${h}</th>`;
  html += '</tr></thead><tbody>';
  for (const row of rows) {
    html += '<tr>';
    for (const cell of row) html += `<td>${cell ?? '—'}</td>`;
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  container.innerHTML = html;
}

/** Clear a results area */
export function clearResults(containerId) {
  const el = document.getElementById(containerId);
  if (el) el.innerHTML = '';
}

/** Show an alert in a container */
export function renderAlert(containerId, message, type = 'info') {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
}

/* ================================================================
   Clipboard
   ================================================================ */
export function copyToClipboard(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => _fallbackCopy(text));
  } else {
    _fallbackCopy(text);
  }
}
function _fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (_) { /* ignore */ }
  document.body.removeChild(ta);
}

/* ================================================================
   Example-fill helper
   ================================================================ */
/**
 * Attach demo/example fill behaviour to a button.
 * @param {string} btnId
 * @param {Record<string, string|number>} values  map of elementId → value
 */
export function attachExampleFill(btnId, values) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.addEventListener('click', () => {
    for (const [id, val] of Object.entries(values)) {
      const el = document.getElementById(id);
      if (el) el.value = val;
    }
  });
}

/* ================================================================
   Reset button helper
   ================================================================ */
export function attachResetButton(btnId, fieldIds) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.addEventListener('click', () => {
    for (const id of fieldIds) {
      const el = document.getElementById(id);
      if (el) el.value = '';
    }
  });
}

/* ================================================================
   Precision selector
   ================================================================ */
export function initPrecisionBar(barId, callback) {
  const bar = document.getElementById(barId);
  if (!bar) return;
  bar.querySelectorAll('button[data-prec]').forEach(btn => {
    btn.addEventListener('click', () => {
      _activePrecision = btn.dataset.prec;
      bar.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
      if (callback) callback(_activePrecision);
    });
  });
}
export function getActivePrecision() { return _activePrecision; }
export function setActivePrecision(prec) { _activePrecision = prec; }

/* ================================================================
   Sync badge
   ================================================================ */
const _syncColors = {
  connected:  'connected',
  waiting:    'waiting',
  paused:     'paused',
  local_only: 'local_only',
};
const _syncLabels = {
  connected:  '● synced',
  waiting:    '○ waiting',
  paused:     '⏸ paused',
  local_only: '◌ local only',
};

export function updateSyncBadge(status) {
  const badge = document.getElementById('sync-badge');
  const label = document.getElementById('sync-label');
  if (!badge) return;
  // Replace all classes in one shot so we never accumulate stale status classes.
  badge.className = `sync-dot ${_syncColors[status] || 'local_only'}`;
  if (label) label.textContent = _syncLabels[status] || status;
}

/* ================================================================
   Dark / Light mode
   ================================================================ */
export function initThemeToggle(btnId = 'theme-toggle') {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  // Load stored preference
  const stored = localStorage.getItem('celes-theme');
  if (stored) setTheme(stored);
  btn.addEventListener('click', () => setTheme(_activeTheme === 'dark' ? 'light' : 'dark'));
}

export function setTheme(theme) {
  _activeTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('celes-theme', theme);
  // update button icon
  const btn = document.getElementById('theme-toggle') || document.getElementById('viz-theme-toggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀' : '🌙';
}

export function getTheme() { return _activeTheme; }

/* ================================================================
   Formula / Help modal
   ================================================================ */
export function showModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.add('open');
}
export function hideModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.remove('open');
}

const FORMULA_DOCS = {
  time: {
    title: 'Time System Formulas',
    content: `Julian Date (JD) from Gregorian:
  JD = 367·Y - INT(7·(Y+INT((M+9)/12))/4) + INT(275·M/9) + D + 1721013.5 + UT/24

  MJD = JD - 2400000.5
  TT  = TAI + 32.184 s
  TAI = UTC + leap_seconds(epoch)
  GPS = TAI - 19 s  →  week = floor((GPS_s)/604800),  TOW = GPS_s mod 604800`,
  },
  earth: {
    title: 'Earth Coordinate Formulas (WGS-84)',
    content: `Geodetic → ECEF:
  N = a / sqrt(1 - e²·sin²φ)
  X = (N + h)·cosφ·cosλ
  Y = (N + h)·cosφ·sinλ
  Z = (N·(1-e²) + h)·sinφ

  ECEF → ENU (rotation matrix R):
  E =  -sinλ·ΔX + cosλ·ΔY
  N =  -sinφ·cosλ·ΔX - sinφ·sinλ·ΔY + cosφ·ΔZ
  U =   cosφ·cosλ·ΔX + cosφ·sinλ·ΔY + sinφ·ΔZ

  GMST (radians):
  θ = 280.46061837 + 360.98564736629·(JD-2451545.0) + …  (mod 2π)`,
  },
  moon: {
    title: 'Lunar Geometry',
    content: `Selenographic → Lunar-Fixed Cartesian:
  X = (R_moon + h)·cosφ·cosλ
  Y = (R_moon + h)·cosφ·sinλ
  Z = (R_moon + h)·sinφ    R_moon ≈ 1,737,400 m

  Sub-Earth point: inverse of Moon-ECI unit vector rotated to selenographic frame.
  Solar elevation at lunar point: angle between local surface normal and Sun direction.`,
  },
  orbit: {
    title: 'Orbital Mechanics',
    content: `Vis-viva:  v² = GM·(2/r - 1/a)
  Period:   T = 2π·sqrt(a³/GM)
  Circ vel: Vc = sqrt(GM/r)

  COE → ECI position/velocity:
  1. Compute perifocal frame vectors P, Q from ω, RAAN, i.
  2. r_pf = [r·cosν, r·sinν, 0],  v_pf = sqrt(GM/p)·[-sinν, e+cosν, 0]
  3. Rotate to ECI via R3(−RAAN)·R1(−i)·R3(−ω)

  Hohmann: ΔV₁ = √(GM/r₁)·(√(2r₂/(r₁+r₂)) - 1)
           ΔV₂ = √(GM/r₂)·(1 - √(2r₁/(r₁+r₂)))`,
  },
};

export function renderFormulaSection(moduleId) {
  const doc = FORMULA_DOCS[moduleId];
  const titleEl = document.getElementById('formula-modal-title');
  const bodyEl  = document.getElementById('formula-modal-body');
  if (!titleEl || !bodyEl) return;
  if (doc) {
    titleEl.textContent = doc.title;
    bodyEl.innerHTML = `<div class="formula-box">${escapeHTML(doc.content)}</div>`;
  } else {
    titleEl.textContent = 'Formulas';
    bodyEl.innerHTML = '<p class="text-muted">No formula documentation available for this module.</p>';
  }
  showModal('formula-modal');
}

/* ================================================================
   Toast notification system
   ================================================================ */
let _toastTimer = null;

/**
 * Show a toast notification.
 * @param {string} message
 * @param {'info'|'ok'|'warn'|'err'} [type]
 * @param {number} [duration] ms
 */
export function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'fadeOut .3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/* ================================================================
   Unit selector handling
   ================================================================ */
/**
 * Build a simple unit select element.
 * @param {string} selectId
 * @param {string[]} units
 * @param {string} defaultUnit
 * @param {function} onChange
 */
export function initUnitSelector(selectId, units, defaultUnit, onChange) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = units.map(u => `<option value="${u}" ${u===defaultUnit?'selected':''}>${u}</option>`).join('');
  sel.addEventListener('change', () => onChange(sel.value));
}

/* ================================================================
   Helpers
   ================================================================ */
function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function formatValue(val) {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'number') return formatNumber(val);
  return escapeHTML(String(val));
}
