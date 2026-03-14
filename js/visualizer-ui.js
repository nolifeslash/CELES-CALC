/**
 * visualizer-ui.js — Visualizer window UI logic
 */
import { subscribeScenarioState, getConnectionStatus, onConnectionStatusChange,
         loadScenarioFromStorage, pauseSync, resumeSync } from './sync.js';
import { drawEarthMap, drawMoonMap, drawOrbitDiagram, drawGeometryView,
         drawMeasurements } from './visuals.js';
import { renderTopView } from './renderer-top.js';
import { renderSideAView } from './renderer-side-a.js';
import { renderSideBView } from './renderer-side-b.js';
import { render3DView } from './renderer-3d.js';
import { createViewState, resetView, fitToObjects, getViewport } from './camera.js';
import { createInteractionState, selectObject, hoverObject, clearSelection, hitTest, onInteractionChange } from './interaction.js';
import { createLayerState, setLayer, isLayerVisible, onLayerChange, DEFAULT_LAYERS } from './layers.js';
import { extractSceneObjects } from './renderer-core.js';

let _scenario = null;
let _currentTab = 'fourview';
let _layers = {};
let _syncUnsub = null;
let _statusUnsub = null;

/** Current zoom level for the orbit diagram */
let _zoomLevel = 'earth-moon';

/** Active measuring tool: 'pointer' | 'distance' | 'angle' */
let _activeTool = 'pointer';

/** Collected measurements: { type, points[], label } */
let _measurements = [];

/** Points collected for the current in-progress measurement */
let _pendingPoints = [];

/** 4-view camera states, one per pane */
let _viewStates = {
  top: null, sideA: null, sideB: null, '3d': null
};

/** Shared interaction state for the 4-view mode */
let _interactionState = null;

/** Shared layer state for the 4-view mode */
let _layerState = null;

/** Currently maximized pane id, or null */
let _maximizedPane = null;

/** Per-pane projected objects for hit-testing */
let _projectedObjects = {};

/**
 * Zoom level presets with scale metadata.
 * Each entry describes what the orbit diagram should display at that zoom.
 * @type {Object<string,{label:string, description:string}>}
 */
export const ZOOM_LEVELS = {
  'galactic':   { label: '🌌 Galactic',      description: 'Milky Way context — solar system position' },
  'solar':      { label: '☀️ Solar System',   description: 'Inner solar system with planet orbits (AU)' },
  'earth-moon': { label: '🌍🌕 Earth-Moon',   description: 'Earth-Moon system with lunar orbit' },
  'earth':      { label: '🌍 Earth',           description: 'Earth with LEO / MEO / GEO orbit rings' },
  'moon':       { label: '🌕 Moon',            description: 'Moon close-up with lunar orbits' },
};

export function initVisualizer() {
  _layers = _loadLayerPrefs();

  // Initialize 4-view states
  _viewStates.top   = createViewState('top');
  _viewStates.sideA = createViewState('sideA');
  _viewStates.sideB = createViewState('sideB');
  _viewStates['3d'] = createViewState('3d');
  _interactionState = createInteractionState();
  _layerState       = createLayerState(_loadLayerPrefs());

  // Re-render on interaction changes and update inspector
  onInteractionChange(_interactionState, () => {
    renderFourViews();
    updateObjectInspector();
  });

  // Re-render on layer changes
  onLayerChange(_layerState, () => {
    if (_currentTab === 'fourview') renderFourViews();
  });

  setupVisualizerTabs();
  setupLayerToggles();
  setupViewControls();
  setupZoomPresets();
  setupMeasuringTools();
  setupMaximizeButtons();
  setupFourViewInteraction();
  handleVisualizerResize();
  window.addEventListener('resize', handleVisualizerResize);
  _syncUnsub = subscribeScenarioState(scenario => {
    _scenario = scenario;
    updateVisualizerFromScenario(scenario);
  });
  _statusUnsub = onConnectionStatusChange(showVisualizerSyncStatus);
  showVisualizerSyncStatus(getConnectionStatus());
  document.getElementById('viz-theme-toggle')?.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', cur === 'dark' ? 'light' : 'dark');
    renderCurrentTab();
  });
  document.getElementById('viz-pause-sync')?.addEventListener('click', () => { pauseSync(); showVisualizerSyncStatus('paused'); });
  document.getElementById('viz-resume-sync')?.addEventListener('click', () => { resumeSync(); showVisualizerSyncStatus(getConnectionStatus()); });
  document.getElementById('viz-load-last')?.addEventListener('click', loadLastScenario);
}

export function updateVisualizerFromScenario(scenario) {
  _scenario = scenario;
  renderCurrentTab();
  const jd = scenario?.timeSystems?.jd;
  const statusEl = document.getElementById('viz-status-scenario');
  if (statusEl) statusEl.textContent = jd ? `JD ${jd.toFixed(4)}` : 'scenario loaded';
}

export function setupVisualizerTabs() {
  const bar = document.getElementById('viz-tab-bar');
  if (!bar) return;
  bar.addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn');
    if (!btn?.dataset.viztab) return;
    _currentTab = btn.dataset.viztab;
    bar.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.viz-tab-panel').forEach(p => {
      p.classList.toggle('active', p.id === `vtp-${_currentTab}`);
    });
    renderCurrentTab();
  });
}

export function setupLayerToggles() {
  const ids = [
    'grid', 'labels', 'orbits', 'sightlines', 'illumination', 'zones', 'measurements',
    'groundStations', 'rfLinks', 'launchSites', 'transferArcs',
    'infraLaunchSites', 'infraGroundStations', 'infraTTCStations',
  ];
  for (const id of ids) {
    const el = document.getElementById(`layer-${id}`);
    if (!el) continue;
    _layers[id] = el.checked;
    el.addEventListener('change', () => {
      _layers[id] = el.checked;
      _saveLayerPrefs();
      // Sync with 4-view layer state
      if (_layerState) setLayer(_layerState, id, el.checked);
      renderCurrentTab();
    });
  }
}

export function setupViewControls() {
  document.getElementById('viz-fit')?.addEventListener('click', () => {
    if (_currentTab === 'fourview') { fitAllViews(); } else { renderCurrentTab(); }
  });
  document.getElementById('viz-reset-view')?.addEventListener('click', () => {
    if (_currentTab === 'fourview') { resetAllViews(); } else { renderCurrentTab(); }
  });
  document.getElementById('viz-zoom-in')?.addEventListener('click',    () => renderCurrentTab());
  document.getElementById('viz-zoom-out')?.addEventListener('click',   () => renderCurrentTab());
  document.getElementById('viz-center-obs')?.addEventListener('click', () => renderCurrentTab());
}

/** Bind zoom-preset buttons to set _zoomLevel and re-render. */
export function setupZoomPresets() {
  const pairs = [
    ['viz-zoom-galactic',   'galactic'],
    ['viz-zoom-solar',      'solar'],
    ['viz-zoom-earth-moon', 'earth-moon'],
    ['viz-zoom-earth',      'earth'],
    ['viz-zoom-moon-close', 'moon'],
  ];
  for (const [id, level] of pairs) {
    document.getElementById(id)?.addEventListener('click', () => {
      _zoomLevel = level;
      renderCurrentTab();
    });
  }
}

/**
 * Wire up the measuring-tools toolbar and canvas event handlers.
 */
export function setupMeasuringTools() {
  const toolIds = { 'viz-tool-pointer': 'pointer', 'viz-tool-distance': 'distance', 'viz-tool-angle': 'angle' };
  for (const [id, tool] of Object.entries(toolIds)) {
    document.getElementById(id)?.addEventListener('click', () => {
      _activeTool = tool;
      _pendingPoints = [];
      for (const btnId of Object.keys(toolIds)) {
        document.getElementById(btnId)?.classList.toggle('active', btnId === id);
      }
    });
  }
  document.getElementById('viz-tool-clear')?.addEventListener('click', () => {
    _measurements = [];
    _pendingPoints = [];
    _setReadout('—');
    renderCurrentTab();
  });

  // Canvas click handler for measurements
  const area = document.getElementById('viz-canvas-area');
  if (area) {
    area.addEventListener('click', _handleMeasureClick);
  }
}

/**
 * Handle a click on the canvas area for measuring tools.
 * @param {MouseEvent} e
 */
function _handleMeasureClick(e) {
  if (_activeTool === 'pointer') return;

  // Find the active canvas to compute coordinates relative to it
  const activePanel = document.querySelector('.viz-tab-panel.active canvas');
  if (!activePanel) return;
  const rect = activePanel.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;

  _pendingPoints.push({ x, y });

  if (_activeTool === 'distance' && _pendingPoints.length === 2) {
    const [p1, p2] = _pendingPoints;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const distPx = Math.sqrt(dx * dx + dy * dy);
    // Approximate km using current canvas scale (use canvas width ≈ map width)
    const canvasW = activePanel.clientWidth || 800;
    const kmPerPx = _estimateKmPerPx(canvasW);
    const distKm = distPx * kmPerPx;
    const label = distKm >= 1e6
      ? `${(distKm / 1e6).toFixed(2)} M km`
      : distKm >= 1000
        ? `${(distKm / 1000).toFixed(2)}k km`
        : `${distKm.toFixed(1)} km`;
    _measurements.push({ type: 'distance', points: [p1, p2], label });
    _setReadout(label);
    _pendingPoints = [];
    renderCurrentTab();
  } else if (_activeTool === 'angle' && _pendingPoints.length === 3) {
    const [a, vertex, b] = _pendingPoints;
    const v1 = { x: a.x - vertex.x, y: a.y - vertex.y };
    const v2 = { x: b.x - vertex.x, y: b.y - vertex.y };
    const dot = v1.x * v2.x + v1.y * v2.y;
    const m1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y) || 1;
    const m2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y) || 1;
    const angle = Math.acos(Math.max(-1, Math.min(1, dot / (m1 * m2)))) * (180 / Math.PI);
    const label = `${angle.toFixed(1)}°`;
    _measurements.push({ type: 'angle', points: [a, vertex, b], label });
    _setReadout(label);
    _pendingPoints = [];
    renderCurrentTab();
  }
}

/**
 * Estimate kilometres per canvas pixel based on the current tab and zoom.
 * @param {number} canvasW  canvas width in CSS pixels
 * @returns {number}
 */
function _estimateKmPerPx(canvasW) {
  if (_currentTab === 'earth-map') return 40075 / canvasW;          // Earth circumference in km
  if (_currentTab === 'moon-map')  return 10921 / canvasW;          // Moon circumference in km
  if (_currentTab === 'orbit-diag') {
    const halfW = canvasW / 2; // half-canvas represents visible radius
    const scaleMap = {
      'galactic':   1e13 / halfW,               // km — approximate Milky Way half-diameter (~50k ly)
      'solar':      6e8  / halfW,               // km — ~4 AU outer visible radius
      'earth-moon': 384400 * 2.5 / halfW,      // km — 2.5× lunar distance fits in half-canvas
      'earth':      80000 / halfW,              // km — GEO altitude + margin
      'moon':       5000  / halfW,              // km — Moon radius + orbit margin
    };
    return scaleMap[_zoomLevel] ?? (384400 * 2.5 / halfW);
  }
  return 40075 / canvasW;
}

/**
 * Update the readout span in the toolbar.
 * @param {string} text
 */
function _setReadout(text) {
  const el = document.getElementById('viz-tool-readout');
  if (el) el.textContent = text;
}

export function handleVisualizerResize() {
  const area = document.getElementById('viz-canvas-area');
  if (!area) return;
  // Resize classic-mode canvases
  const classicCanvases = area.querySelectorAll('.viz-tab-panel:not(#vtp-fourview) canvas');
  classicCanvases.forEach(c => {
    c.width  = area.clientWidth  || 800;
    c.height = area.clientHeight || 500;
  });
  // Resize 4-view canvases to match their pane containers
  const fourViewCanvases = ['canvas-top', 'canvas-sideA', 'canvas-sideB', 'canvas-3d'];
  for (const id of fourViewCanvases) {
    const c = document.getElementById(id);
    if (!c) continue;
    const pane = c.parentElement;
    if (pane) {
      c.width  = pane.clientWidth  || 400;
      c.height = pane.clientHeight || 300;
    }
  }
  renderCurrentTab();
}

export function renderCurrentTab() {
  if (_currentTab === 'fourview') {
    renderFourViews();
    return;
  }
  if (!_scenario && _currentTab !== 'combined') {
    _drawPlaceholder(_currentTab);
    return;
  }
  switch (_currentTab) {
    case 'earth-map':  drawEarthMap('canvas-earth',     _scenario, _layers); break;
    case 'moon-map':   drawMoonMap('canvas-moon',       _scenario, _layers); break;
    case 'orbit-diag': drawOrbitDiagram('canvas-orbit', _scenario, _layers, _zoomLevel); break;
    case 'geometry':   drawGeometryView('canvas-geometry', _scenario, _layers); break;
    case 'combined':
      drawEarthMap('canvas-combined-earth',     _scenario, _layers);
      drawMoonMap('canvas-combined-moon',       _scenario, _layers);
      drawOrbitDiagram('canvas-combined-orbit', _scenario, _layers, _zoomLevel);
      drawGeometryView('canvas-combined-geo',   _scenario, _layers);
      break;
  }
  // Overlay measurements on active canvas
  if (_measurements.length && _layers.measurements !== false) {
    const activeCanvas = document.querySelector('.viz-tab-panel.active canvas');
    if (activeCanvas) {
      const ctx = activeCanvas.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawMeasurements(ctx, _measurements);
    }
  }
}

export function showVisualizerSyncStatus(status) {
  const el = document.getElementById('viz-sync-indicator') || document.getElementById('viz-sync-status');
  if (!el) return;
  const labels = { connected:'● synced', waiting:'○ waiting', paused:'⏸ paused', local_only:'◌ local only' };
  el.textContent = labels[status] || status;
  el.className = status;
}

export function loadLastScenario() {
  const s = loadScenarioFromStorage();
  if (s) {
    _scenario = s;
    updateVisualizerFromScenario(s);
    showVisualizerSyncStatus('local_only');
  }
}

function _drawPlaceholder(tabId) {
  const idMap = {
    'earth-map':'canvas-earth','moon-map':'canvas-moon',
    'orbit-diag':'canvas-orbit','geometry':'canvas-geometry',
  };
  const cid = idMap[tabId];
  if (!cid) return;
  const canvas = document.getElementById(cid);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  ctx.fillStyle = dark ? '#0d1117' : '#f0f2f5';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = dark ? '#484f58' : '#9198a1';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Waiting for scenario data…', canvas.width / 2, canvas.height / 2);
  ctx.font = '13px sans-serif';
  ctx.fillText('Perform a calculation in the Calculator window', canvas.width / 2, canvas.height / 2 + 28);
  ctx.textAlign = 'left';
}

function _loadLayerPrefs() {
  try { return JSON.parse(localStorage.getItem('celes-layers') || '{}'); } catch { return {}; }
}
function _saveLayerPrefs() {
  localStorage.setItem('celes-layers', JSON.stringify(_layers));
}

// ─── 4-View Engineering Functions ─────────────────────────────────────────────

/**
 * Render all 4 panes simultaneously.
 */
function renderFourViews() {
  if (!_scenario) {
    ['canvas-top','canvas-sideA','canvas-sideB','canvas-3d'].forEach(id => _drawPlaceholder4View(id));
    return;
  }
  _projectedObjects.top = renderTopView(
    document.getElementById('canvas-top'), _scenario, _viewStates.top, _layerState, _interactionState
  );
  _projectedObjects.sideA = renderSideAView(
    document.getElementById('canvas-sideA'), _scenario, _viewStates.sideA, _layerState, _interactionState
  );
  _projectedObjects.sideB = renderSideBView(
    document.getElementById('canvas-sideB'), _scenario, _viewStates.sideB, _layerState, _interactionState
  );
  _projectedObjects['3d'] = render3DView(
    document.getElementById('canvas-3d'), _scenario, _viewStates['3d'], _layerState, _interactionState
  );
}

/**
 * Draw a placeholder on a 4-view canvas when no scenario is loaded.
 */
function _drawPlaceholder4View(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || canvas.width || 400;
  const h = canvas.clientHeight || canvas.height || 300;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width  = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  ctx.fillStyle = dark ? '#0d1117' : '#f0f2f5';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = dark ? '#484f58' : '#9198a1';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Waiting for scenario…', w / 2, h / 2);
  ctx.textAlign = 'left';
}

/**
 * Wire click events on 4-view canvases for object selection.
 */
function setupFourViewInteraction() {
  const panes = ['top', 'sideA', 'sideB', '3d'];
  for (const pane of panes) {
    const canvas = document.getElementById(`canvas-${pane}`);
    if (!canvas) continue;
    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const objects = _projectedObjects[pane]?.projectedObjects ?? [];
      const hitId = hitTest(objects, px, py, 15);
      if (hitId) {
        selectObject(_interactionState, hitId);
      } else {
        clearSelection(_interactionState);
      }
    });
  }
}

/**
 * Wire maximize/restore buttons on 4-view panes.
 */
function setupMaximizeButtons() {
  document.querySelectorAll('.pane-maximize').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const pane = btn.dataset.pane;
      const grid = document.getElementById('fourview-grid');
      if (_maximizedPane === pane) {
        _maximizedPane = null;
        grid.classList.remove('maximized');
        grid.querySelectorAll('.fourview-pane').forEach(p => p.classList.remove('maximized-pane'));
        btn.textContent = '⤢';
      } else {
        // Restore label on previously maximized pane button
        if (_maximizedPane) {
          const prevBtn = grid.querySelector(`.pane-maximize[data-pane="${_maximizedPane}"]`);
          if (prevBtn) prevBtn.textContent = '⤢';
        }
        _maximizedPane = pane;
        grid.classList.add('maximized');
        grid.querySelectorAll('.fourview-pane').forEach(p => {
          p.classList.toggle('maximized-pane', p.dataset.pane === pane);
        });
        btn.textContent = '⤡';
      }
      handleVisualizerResize();
    });
  });
}

/**
 * Fit all 4-view panes to show all objects.
 */
export function fitAllViews() {
  if (!_scenario) return;
  const objects = extractSceneObjects(_scenario);
  const points = objects.map(o => ({ x: o.x, y: o.y, z: o.z }));
  for (const key of Object.keys(_viewStates)) {
    const canvas = document.getElementById(`canvas-${key}`);
    if (canvas) {
      fitToObjects(_viewStates[key], points, canvas.clientWidth || 400, canvas.clientHeight || 300, 0.1);
    }
  }
  renderFourViews();
}

/**
 * Reset all 4-view panes to defaults.
 */
export function resetAllViews() {
  for (const key of Object.keys(_viewStates)) {
    if (_viewStates[key]) resetView(_viewStates[key]);
  }
  renderFourViews();
}

/**
 * Update the sidebar object inspector with the selected object's details.
 */
function updateObjectInspector() {
  const el = document.getElementById('viz-object-inspector');
  if (!el) return;
  const selId = _interactionState?.selectedId;
  if (!selId || !_scenario) {
    el.textContent = 'No selection';
    return;
  }
  const objects = extractSceneObjects(_scenario);
  const obj = objects.find(o => o.id === selId);
  if (!obj) {
    el.textContent = 'No selection';
    return;
  }
  const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const lines = [`<b>${esc(obj.label || obj.id)}</b>`];
  lines.push(`Type: ${esc(obj.type)}`);
  lines.push(`X: ${obj.x.toFixed(1)} km`);
  lines.push(`Y: ${obj.y.toFixed(1)} km`);
  lines.push(`Z: ${obj.z.toFixed(1)} km`);
  if (obj.radius_km) lines.push(`Radius: ${obj.radius_km.toFixed(1)} km`);
  el.innerHTML = lines.join('<br>');
}
