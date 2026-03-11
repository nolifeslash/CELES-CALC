/**
 * visualizer-ui.js — Visualizer window UI logic
 */
import { subscribeScenarioState, getConnectionStatus, onConnectionStatusChange,
         loadScenarioFromStorage, pauseSync, resumeSync } from './sync.js';
import { drawEarthMap, drawMoonMap, drawOrbitDiagram, drawGeometryView } from './visuals.js';

let _scenario = null;
let _currentTab = 'earth-map';
let _layers = {};
let _syncUnsub = null;
let _statusUnsub = null;

export function initVisualizer() {
  _layers = loadLayerState();
  setupVisualizerTabs();
  setupLayerToggles();
  setupViewControls();
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
  const ids = ['grid','labels','orbits','sightlines','illumination','zones','measurements'];
  for (const id of ids) {
    const el = document.getElementById(`layer-${id}`);
    if (!el) continue;
    _layers[id] = el.checked;
    el.addEventListener('change', () => {
      _layers[id] = el.checked;
      saveLayerState();
      renderCurrentTab();
    });
  }
}

export function setupViewControls() {
  document.getElementById('viz-fit')?.addEventListener('click',        () => renderCurrentTab());
  document.getElementById('viz-reset-view')?.addEventListener('click', () => renderCurrentTab());
  document.getElementById('viz-zoom-in')?.addEventListener('click',    () => renderCurrentTab());
  document.getElementById('viz-zoom-out')?.addEventListener('click',   () => renderCurrentTab());
  document.getElementById('viz-center-obs')?.addEventListener('click', () => renderCurrentTab());
}

export function handleVisualizerResize() {
  const area = document.getElementById('viz-canvas-area');
  if (!area) return;
  const canvases = area.querySelectorAll('canvas');
  canvases.forEach(c => {
    c.width  = area.clientWidth  || 800;
    c.height = area.clientHeight || 500;
  });
  renderCurrentTab();
}

export function renderCurrentTab() {
  if (!_scenario && _currentTab !== 'combined') {
    _drawPlaceholder(_currentTab);
    return;
  }
  switch (_currentTab) {
    case 'earth-map':  drawEarthMap('canvas-earth',     _scenario, _layers); break;
    case 'moon-map':   drawMoonMap('canvas-moon',       _scenario, _layers); break;
    case 'orbit-diag': drawOrbitDiagram('canvas-orbit', _scenario, _layers); break;
    case 'geometry':   drawGeometryView('canvas-geometry', _scenario, _layers); break;
    case 'combined':
      drawEarthMap('canvas-combined-earth',     _scenario, _layers);
      drawMoonMap('canvas-combined-moon',       _scenario, _layers);
      drawOrbitDiagram('canvas-combined-orbit', _scenario, _layers);
      drawGeometryView('canvas-combined-geo',   _scenario, _layers);
      break;
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

function loadLayerState() {
  try { return JSON.parse(localStorage.getItem('celes-layers') || '{}'); } catch { return {}; }
}
function saveLayerState() {
  localStorage.setItem('celes-layers', JSON.stringify(_layers));
}
