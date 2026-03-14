/**
 * @file infrastructure-browser.js
 * @module infrastructure-browser
 * @description Pure ES module UI component for CELES-CALC's infrastructure
 * browser tab. Renders and manages an interactive browser, filter, and
 * inspector panel for launch sites, ground stations, TT&C stations, and
 * network operators.
 */

import {
  LAUNCH_SITES, GROUND_STATIONS, TTC_STATIONS, NETWORK_OPERATORS,
  filterLaunchSites, filterGroundStations, filterTTCStations, filterOperators,
  searchInfrastructure, normalizeForRFEval, confidenceBadge, confidenceLabel,
} from './infrastructure.js';

/* ================================================================
   Internal state
   ================================================================ */

/** @type {object|null} */ let _selectedRecord = null;
/** @type {string|null} */ let _selectedType   = null;
/** @type {function|null} */ let _onSelectStation = null;

const _filters = {
  launch: { status: '', country: '', text: '' },
  ground: { status: '', band: '',    text: '' },
  ttc:    { status: '', band: '',    text: '' },
  ops:    { operatorType: '',        text: '' },
};

/* ================================================================
   Public API
   ================================================================ */

/**
 * Initialize the infrastructure browser. Sets up all event listeners and
 * renders the initial list for each entity type.
 *
 * @param {function({station: import('./infrastructure.js').RFEvalRecord}):void} [onSelectStation] -
 *   Optional callback invoked with `{ station: RFEvalRecord }` when the user
 *   clicks "Use in RF Comparison".
 * @returns {void}
 */
export function initInfrastructureBrowser(onSelectStation) {
  _onSelectStation = onSelectStation ?? null;

  const btns = [
    ['infra-launch-btn-filter', _applyLaunchFilter],
    ['infra-ground-btn-filter', _applyGroundFilter],
    ['infra-ttc-btn-filter',    _applyTTCFilter],
    ['infra-ops-btn-filter',    _applyOpsFilter],
    ['infra-btn-search-global', _applyGlobalSearch],
    ['infra-clear-inspector',   _clearInspector],
  ];
  btns.forEach(([id, fn]) => _on(id, 'click', fn));

  [
    ['infra-launch-filter-text', _applyLaunchFilter],
    ['infra-ground-filter-text', _applyGroundFilter],
    ['infra-ttc-filter-text',    _applyTTCFilter],
    ['infra-ops-filter-text',    _applyOpsFilter],
    ['infra-search-global',      _applyGlobalSearch],
  ].forEach(([id, fn]) => _on(id, 'keydown', e => e.key === 'Enter' && fn()));

  _delegateClicks('infra-launch-list', 'launch_site');
  _delegateClicks('infra-ground-list', 'ground_station');
  _delegateClicks('infra-ttc-list',    'ttc_station');
  _delegateClicks('infra-ops-list',    'operator');

  _renderAll();
}

/**
 * Re-render all entity lists using the current filter state.
 * @returns {void}
 */
export function refreshBrowser() { _renderAll(); }

/* ================================================================
   Filters
   ================================================================ */

function _applyLaunchFilter() {
  Object.assign(_filters.launch, {
    status:   _val('infra-launch-filter-status'),
    country:  _val('infra-launch-filter-country').trim(),
    siteType: _val('infra-launch-filter-sitetype'),
    text:     _val('infra-launch-filter-text').trim(),
  });
  _renderList('infra-launch-list', filterLaunchSites(_safeArray(LAUNCH_SITES), _compact(_filters.launch)), 'launch_site');
}

function _applyGroundFilter() {
  Object.assign(_filters.ground, {
    status:  _val('infra-ground-filter-status'),
    country: _val('infra-ground-filter-country').trim(),
    band:    _val('infra-ground-filter-band').trim(),
    text:    _val('infra-ground-filter-text').trim(),
  });
  _renderList('infra-ground-list', filterGroundStations(_safeArray(GROUND_STATIONS), _compact(_filters.ground)), 'ground_station');
}

function _applyTTCFilter() {
  Object.assign(_filters.ttc, {
    status:  _val('infra-ttc-filter-status'),
    country: _val('infra-ttc-filter-country').trim(),
    band:    _val('infra-ttc-filter-band').trim(),
    text:    _val('infra-ttc-filter-text').trim(),
  });
  _renderList('infra-ttc-list', filterTTCStations(_safeArray(TTC_STATIONS), _compact(_filters.ttc)), 'ttc_station');
}

function _applyOpsFilter() {
  Object.assign(_filters.ops, {
    operatorType: _val('infra-ops-filter-type'),
    text:         _val('infra-ops-filter-text').trim(),
  });
  _renderList('infra-ops-list', filterOperators(_safeArray(NETWORK_OPERATORS), _compact(_filters.ops)), 'operator');
}

function _applyGlobalSearch() {
  const query = _val('infra-search-global').trim();
  const panel = document.getElementById('infra-inspector');
  if (!query) {
    if (!panel) return;
    _setInspectorHTML('<p class="infra-empty">Enter a search query.</p>');
    panel.classList.remove('infra-inspector--hidden');
    return;
  }
  const res = searchInfrastructure(query);
  const sections = [
    { label: 'Launch Sites',      type: 'launch_site',    items: res.launchSites },
    { label: 'Ground Stations',   type: 'ground_station', items: res.groundStations },
    { label: 'TT&C Stations',     type: 'ttc_station',    items: res.ttcStations },
    { label: 'Network Operators', type: 'operator',       items: res.operators },
  ].filter(s => s.items.length > 0);

  const total = sections.reduce((n, s) => n + s.items.length, 0);
  if (!panel) return;

  if (total === 0) {
    panel.innerHTML = `<p class="infra-empty">No results for <strong>${_esc(query)}</strong>.</p>`;
    panel.classList.remove('infra-inspector--hidden');
    return;
  }

  let html = `<h3 class="infra-search-title">Search: "${_esc(query)}" — ${total} result${total !== 1 ? 's' : ''}</h3>`;
  sections.forEach(s => {
    html += `<h4 class="infra-search-section">${s.label} (${s.items.length})</h4>`;
    html += s.items.map(item => _itemCardHTML(item, s.type)).join('');
  });
  panel.innerHTML = html;
  panel.classList.remove('infra-inspector--hidden');

  panel.querySelectorAll('.infra-item[data-id]').forEach(el =>
    el.addEventListener('click', () => {
      const rec = _findRecord(el.dataset.id, el.dataset.type);
      if (rec) _selectRecord(rec, el.dataset.type);
    })
  );
}

/* ================================================================
   Rendering
   ================================================================ */

function _renderAll() {
  _renderList('infra-launch-list', filterLaunchSites(_safeArray(LAUNCH_SITES), _compact(_filters.launch)), 'launch_site');
  _renderList('infra-ground-list', filterGroundStations(_safeArray(GROUND_STATIONS), _compact(_filters.ground)), 'ground_station');
  _renderList('infra-ttc-list',    filterTTCStations(_safeArray(TTC_STATIONS), _compact(_filters.ttc)), 'ttc_station');
  _renderList('infra-ops-list',    filterOperators(_safeArray(NETWORK_OPERATORS), _compact(_filters.ops)), 'operator');
}

/**
 * Render an array of records into a list container.
 * @param {string}   containerId
 * @param {object[]} items
 * @param {string}   type
 */
function _renderList(containerId, items, type) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const safeItems = _safeArray(items);
  container.innerHTML = safeItems.length === 0
    ? '<p class="infra-empty">No records match the current filters.</p>'
    : safeItems.map(item => _itemCardHTML(item, type)).join('');

  if (_selectedRecord) {
    container.querySelector(`[data-id="${_selectedRecord.id}"]`)?.classList.add('infra-item--active');
  }
}

/**
 * Build an HTML list-item card for one record.
 * @param {object} item
 * @param {string} type
 * @returns {string}
 */
function _itemCardHTML(item, type) {
  const rec = (item && typeof item === 'object') ? item : {};
  const statusCls = `status-${_esc((rec.status ?? 'unknown').replace(/\s+/g, '-'))}`;
  return `<div class="infra-item" data-id="${_esc(rec.id)}" data-type="${_esc(type)}">
  <div class="infra-item-header">
    <span class="infra-item-name">${_esc(rec.name ?? 'Unnamed')}</span>
    ${confidenceBadge(_safeConfidence(rec.confidence))}
    <span class="infra-item-status ${statusCls}">${_esc(rec.status ?? '—')}</span>
  </div>
  <div class="infra-item-meta">${_metaLine(rec, type)}</div>
</div>`;
}

/**
 * Build the meta summary line appropriate for an entity type.
 * @param {object} item
 * @param {string} type
 * @returns {string}
 */
function _metaLine(item, type) {
  const parts = {
    launch_site:    [item.country, item.siteType, (item.supportedVehicleClasses ?? []).join('/')],
    ground_station: [item.country, (item.supportedBands ?? []).join(', '), (item.capabilities ?? []).slice(0, 3).join(', ')],
    ttc_station:    [item.country, item.network ?? '', (item.supportedBands ?? []).join(', ')],
    operator:       [item.country, item.operatorType ?? '', `${item.stationCount ?? 0} station${item.stationCount !== 1 ? 's' : ''}`],
  }[type] ?? [];
  return parts.filter(Boolean).map(_esc).join(' | ');
}

/* ================================================================
   Inspector panel
   ================================================================ */

/** @param {object} record  @param {string} type */
function _showInspector(record, type) {
  const panel = document.getElementById('infra-inspector');
  if (!panel) return;
  const rec = (record && typeof record === 'object') ? record : {};

  const typeLabel = { launch_site: 'Launch Site', ground_station: 'Ground Station', ttc_station: 'TT&C Station', operator: 'Network Operator' }[type] ?? type;
  const statusCls = `status-${_esc((rec.status ?? 'unknown').replace(/\s+/g, '-'))}`;
  const confidence = _safeConfidence(rec.confidence);

  const row = (label, value) => value
    ? `<div class="infra-detail-section"><strong>${label}</strong><span>${value}</span></div>`
    : '';

  let html = `<div class="infra-detail-card">
  <div class="infra-detail-header">
    <span class="infra-detail-name">${_esc(rec.name ?? 'Unnamed')}</span>
    <span class="infra-type-badge">${_esc(typeLabel)}</span>
    ${confidenceBadge(confidence)}
  </div>
  <div class="infra-detail-id">ID: <code>${_esc(rec.id)}</code></div>`;

  if (type !== 'operator' && _isValidCoordinate(rec.lat_deg, rec.lon_deg)) {
    const elev = Number.isFinite(Number(rec.elevation_m)) ? Number(rec.elevation_m) : null;
    html += row('Location', `${Number(rec.lat_deg).toFixed(4)}°, ${Number(rec.lon_deg).toFixed(4)}°${elev != null ? ` — ${elev} m elev.` : ''}`);
  }

  html += `<div class="infra-detail-section"><strong>Status</strong><span class="${statusCls}">${_esc(rec.status ?? '—')}</span></div>`;

  if (rec.operator || rec.network)
    html += row(rec.network ? 'Network / Operator' : 'Operator', _esc([rec.network, rec.operator].filter(Boolean).join(' — ')));

  if (type === 'launch_site') {
    html += row('Vehicle Classes', _esc(_safeArray(rec.supportedVehicleClasses).join(', ')));
    html += row('Azimuth', _esc(rec.nominalAzimuthNotes ?? ''));
    html += row('Inclination', _esc(rec.typicalInclinationNotes ?? ''));
  } else if (type === 'ground_station' || type === 'ttc_station') {
    html += row('Bands', _esc(_safeArray(rec.supportedBands).join(', ')));
    const capList = _safeArray(rec.capabilities ?? rec.services);
    html += row(rec.capabilities ? 'Capabilities' : 'Services', _esc(capList.join(', ')));
  } else if (type === 'operator') {
    html += row('Roles', _esc(_safeArray(rec.networkRoles).join(', ')));
    html += row('Coverage', _esc(rec.coverageDescription ?? ''));
    if (rec.stationCount != null) html += row('Stations', String(rec.stationCount));
  }

  const antennas = _safeArray(rec.antennas).filter(a => a && typeof a === 'object');
  if (antennas.length)
    html += `<div class="infra-detail-section"><strong>Antennas</strong><ul class="infra-antenna-list">${
      antennas.map(a => `<li>${_esc(a.id)} — ${_esc(a.diameter_m ?? '—')} m — ${_esc(_safeArray(a.bands).join(', '))} — ${_esc(a.gainDb ?? '—')} dBi</li>`).join('')
    }</ul></div>`;

  html += row('Confidence', `${confidenceBadge(confidence)} (${confidence.toFixed(2)})`);

  if (_safeArray(rec.sourceRecords).length)
    html += `<div class="infra-detail-section"><strong>Sources</strong><ul class="infra-source-list">${
      _safeArray(rec.sourceRecords).map(sr => {
        const src = (sr && typeof sr === 'object') ? sr : {};
        return `<li>${_esc(src.source ?? 'Unknown source')} <em>(${_esc(src.date ?? 'n/a')})</em> — ${confidenceBadge(_safeConfidence(src.confidence))}</li>`;
      }).join('')
    }</ul></div>`;

  if (rec.notes) html += row('Notes', `<p class="infra-notes">${_esc(rec.notes)}</p>`);

  if (_safeArray(rec.tags).length)
    html += `<div class="infra-detail-section"><strong>Tags</strong><div class="infra-tags">${
      _safeArray(rec.tags).map(t => `<span class="infra-tag">${_esc(t)}</span>`).join(' ')
    }</div></div>`;

  html += '<div class="infra-detail-actions">';
  if (type === 'ground_station' || type === 'ttc_station')
    html += `<button class="btn btn-primary btn-sm" id="btn-infra-use-rf">Use in RF Comparison ▶</button>`;
  if (type === 'launch_site')
    html += `<button class="btn btn-primary btn-sm" id="btn-infra-use-launch">Use in Launch Planner ▶</button>`;
  html += '</div></div>';

  _setInspectorHTML(html);

  panel.querySelector('#btn-infra-use-rf')?.addEventListener('click', () => {
    const band       = _safeArray(rec.supportedBands)[0] ?? 'X';
    const normalized = normalizeForRFEval(rec, { band });
    document.dispatchEvent(new CustomEvent('infra:selectstation', { detail: { station: normalized }, bubbles: true }));
    if (typeof _onSelectStation === 'function') _onSelectStation({ station: normalized });
  });

  panel.querySelector('#btn-infra-use-launch')?.addEventListener('click', () =>
    document.dispatchEvent(new CustomEvent('infra:selectlaunchsite', { detail: { site: rec }, bubbles: true }))
  );
  panel.classList.remove('infra-inspector--hidden');
}

/** Clear the inspector and deselect any active list item. */
function _clearInspector() {
  _selectedRecord = null;
  _selectedType   = null;
  document.querySelectorAll('.infra-item--active').forEach(el => el.classList.remove('infra-item--active'));
  const panel = document.getElementById('infra-inspector');
  if (panel) {
    panel.classList.add('infra-inspector--hidden');
    _setInspectorHTML('');
  }
}

/* ================================================================
   Selection
   ================================================================ */

/** @param {object} record  @param {string} type */
function _selectRecord(record, type) {
  _selectedRecord = record;
  _selectedType   = type;
  document.querySelectorAll('.infra-item--active').forEach(el => el.classList.remove('infra-item--active'));
  document.querySelector(`.infra-item[data-id="${record.id}"][data-type="${type}"]`)?.classList.add('infra-item--active');
  _showInspector(record, type);
}

/* ================================================================
   Utilities
   ================================================================ */

/**
 * Attach a delegated click listener on a list container.
 * @param {string} containerId
 * @param {string} type
 */
function _delegateClicks(containerId, type) {
  document.getElementById(containerId)?.addEventListener('click', e => {
    const item = e.target.closest('.infra-item[data-id]');
    if (!item) return;
    const rec = _findRecord(item.dataset.id, type);
    if (rec) _selectRecord(rec, type);
  });
}

/** Attach an event listener to an element by ID. */
function _on(id, event, fn) {
  document.getElementById(id)?.addEventListener(event, fn);
}

/** Get the current value of a form element by ID, or ''. */
function _val(id) { return document.getElementById(id)?.value ?? ''; }

/**
 * Strip empty/falsy values from a filter object.
 * Numeric zero is preserved since it can be a valid `confidenceMin` value.
 */
function _compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v != null && v !== false));
}

/**
 * Look up a record by ID across all seed arrays.
 * @param {string} id
 * @param {string} type
 * @returns {object|null}
 */
function _findRecord(id, type) {
  const map = {
    launch_site: _safeArray(LAUNCH_SITES),
    ground_station: _safeArray(GROUND_STATIONS),
    ttc_station: _safeArray(TTC_STATIONS),
    operator: _safeArray(NETWORK_OPERATORS),
  };
  return (map[type] ?? []).find(s => s.id === id) ?? null;
}

/**
 * Escape a value for safe insertion as HTML text content.
 * @param {*} value
 * @returns {string}
 */
function _esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function _safeConfidence(value) {
  const c = Number(value);
  if (!Number.isFinite(c)) return 0;
  return Math.max(0, Math.min(1, c));
}

function _isValidCoordinate(lat, lon) {
  const latNum = Number(lat);
  const lonNum = Number(lon);
  return Number.isFinite(latNum) && Number.isFinite(lonNum)
    && latNum >= -90 && latNum <= 90
    && lonNum >= -180 && lonNum <= 180;
}

function _setInspectorHTML(html) {
  const body = document.getElementById('infra-inspector-body');
  if (body) {
    body.innerHTML = html;
    return;
  }
  const panel = document.getElementById('infra-inspector');
  if (panel) panel.innerHTML = html;
}
