/**
 * app.js — CELES-CALC Calculator window main entry point
 */
import * as Time       from './js/time.js';
import * as Earth      from './js/earth.js';
import * as Moon       from './js/moon.js';
import * as Orbit      from './js/orbit.js';
import * as TLE        from './js/tle.js';
import * as Visibility from './js/visibility.js';
import * as Grids      from './js/grids.js';
import * as Scenario   from './js/scenario.js';
import * as Sync       from './js/sync.js';
import * as UI         from './js/ui.js';
import * as OMM        from './js/omm.js';
import { SAMPLE_TLES, SAMPLE_SCENARIOS, PRESET_LOCATIONS } from './js/sample-data.js';
import { TLE_SOURCES, fetchTLEFromURL } from './js/tle.js';
import { GM_EARTH, GM_MOON, R_EARTH_MEAN } from './js/constants.js';

/* ================================================================
   State
   ================================================================ */
let _currentScenario = Scenario.createEmptyScenario();

/* ================================================================
   Bootstrap
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  UI.initTabs();
  UI.initThemeToggle('theme-toggle');
  UI.initPrecisionBar('time-prec-bar');

  // Sub-tab bars
  ['earth-sub-bar','moon-sub-bar','orbit-sub-bar','dist-sub-bar'].forEach(UI.initSubTabs);

  // Modal close
  document.getElementById('formula-modal-close')?.addEventListener('click', () => UI.hideModal('formula-modal'));
  document.querySelector('.modal-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) UI.hideModal('formula-modal');
  });

  // Feature cards on home tab
  document.querySelectorAll('.feature-card[data-goto]').forEach(card => {
    card.addEventListener('click', () => UI.switchTab(card.dataset.goto));
  });
  document.getElementById('home-viz-card')?.addEventListener('click', openVisualizer);

  // Visualizer open buttons
  document.getElementById('btn-open-viz')?.addEventListener('click',  openVisualizer);
  document.getElementById('btn-open-viz2')?.addEventListener('click', openVisualizer);

  // Export / Import
  document.getElementById('btn-export-scenario')?.addEventListener('click', exportScenario);
  document.getElementById('btn-import-scenario')?.addEventListener('click', () =>
    document.getElementById('import-file-input')?.click());
  document.getElementById('import-file-input')?.addEventListener('change', e => importScenario(e.target.files[0]));

  // Load demo
  document.getElementById('btn-load-demo')?.addEventListener('click', loadDemoScenario);

  // Tests
  document.getElementById('btn-run-tests')?.addEventListener('click', runAcceptanceTests);

  // Sync status
  Sync.onConnectionStatusChange(UI.updateSyncBadge);
  UI.updateSyncBadge(Sync.getConnectionStatus());

  wireTimeTab();
  wireEarthTab();
  wireMoonTab();
  wireOrbitTab();
  wireTLETab();
  wireVisibilityTab();
  wireDistanceTab();
});

/* ================================================================
   Sync helpers
   ================================================================ */
function syncPublish() {
  try { Sync.publishScenarioState(_currentScenario); } catch (_) {}
}

/* ================================================================
   Visualizer
   ================================================================ */
function openVisualizer() {
  window.open('visualizer.html', 'celes-visualizer',
    'width=1100,height=750,toolbar=no,menubar=no');
}

/* ================================================================
   Export / Import scenario
   ================================================================ */
function exportScenario() {
  Sync.exportScenarioFile(_currentScenario, 'celes-scenario.json');
  UI.showToast('Scenario exported', 'ok');
}
async function importScenario(file) {
  if (!file) return;
  try {
    const s = await Sync.importScenarioFile(file);
    _currentScenario = s;
    UI.showToast('Scenario imported', 'ok');
    syncPublish();
  } catch (err) {
    UI.showToast('Import failed: ' + err.message, 'err');
  }
}

/* ================================================================
   Demo scenario
   ================================================================ */
function loadDemoScenario() {
  const demo = SAMPLE_SCENARIOS.helsinki_coordinates;
  document.getElementById('time-utc').value = demo?.timeInput?.utc || '2025-06-21T12:00:00Z';
  document.getElementById('geo-lat').value  = '60.1699';
  document.getElementById('geo-lon').value  = '24.9384';
  document.getElementById('geo-alt').value  = '30';
  UI.switchTab('time');
  document.getElementById('btn-time-calc')?.click();
  UI.showToast('Demo scenario loaded — showing Helsinki coordinates', 'ok');
}

/* ================================================================
   ── TIME SYSTEMS TAB ──────────────────────────────────────────
   ================================================================ */
function wireTimeTab() {
  document.getElementById('btn-time-now')?.addEventListener('click', () => {
    document.getElementById('time-utc').value = new Date().toISOString();
  });
  document.getElementById('btn-time-demo')?.addEventListener('click', () => {
    document.getElementById('time-utc').value = '2025-06-21T12:00:00Z';
  });
  document.getElementById('btn-time-reset')?.addEventListener('click', () => {
    document.getElementById('time-utc').value = '';
    UI.clearResults('time-results');
  });
  document.getElementById('btn-time-calc')?.addEventListener('click', calcTime);
  document.getElementById('time-utc')?.addEventListener('keydown', e => { if (e.key === 'Enter') calcTime(); });
}

function calcTime() {
  const raw = document.getElementById('time-utc')?.value?.trim();
  if (!raw) { UI.renderAlert('time-results', 'Enter a date/time string.', 'warn'); return; }

  let input = raw;
  // Support "now"
  if (raw.toLowerCase() === 'now') input = new Date().toISOString();
  // Support "JD:NNNN.N"
  if (raw.toUpperCase().startsWith('JD:')) {
    const jd = parseFloat(raw.slice(3));
    if (!isNaN(jd)) input = Time.julianDateToUTC(jd);
  }

  let r;
  try { r = Time.utcToAllSystems(input); }
  catch (err) { UI.renderAlert('time-results', 'Parse error: ' + err.message, 'err'); return; }

  const greg = Time.julianDateToGregorian(r.jd);
  const mn = (v, u) => ({ value: v, unit: u, copy: true });

  UI.renderResultCards('time-results', [
    { label: 'UTC (ISO 8601)',  value: r.utcISO,        variant: 'hl' },
    { label: 'Julian Date',     value: r.jd,            unit: 'JD' },
    { label: 'Modified JD',     value: r.mjd,           unit: 'MJD' },
    { label: 'Unix Timestamp',  value: r.unixMs,        unit: 'ms' },
    { label: 'Leap Seconds',    value: r.leapSeconds,   unit: 's' },
    { label: 'TAI (JD)',        value: r.taiJd,         unit: 'JD' },
    { label: 'TT (JD)',         value: r.ttJd,          unit: 'JD' },
    { label: 'GPS Week',        value: r.gpsWeek },
    { label: 'GPS TOW',         value: r.gpsTOW,        unit: 's' },
    { label: 'GPS Seconds',     value: r.gpsSeconds,    unit: 's' },
    { label: 'Gregorian Year',  value: greg.year },
    { label: 'Month / Day',     value: `${greg.month} / ${greg.day}` },
  ], 'Conversion Results');

  _currentScenario = Scenario.buildScenarioState({ utc: r.utcISO });
  syncPublish();
}

/* ================================================================
   ── EARTH COORDINATES TAB ────────────────────────────────────
   ================================================================ */
function wireEarthTab() {
  document.getElementById('btn-geo2ecef')?.addEventListener('click',  calcGeo2ECEF);
  document.getElementById('btn-ecef2geo')?.addEventListener('click',  calcECEF2Geo);
  document.getElementById('btn-ecef2enu')?.addEventListener('click',  calcECEF2ENU);
  document.getElementById('btn-enu2ecef')?.addEventListener('click',  calcENU2ECEF);
  document.getElementById('btn-enu2azel')?.addEventListener('click',  calcENU2AzEl);
  document.getElementById('btn-azel2enu')?.addEventListener('click',  calcAzEl2ENU);
  document.getElementById('btn-ecef2eci')?.addEventListener('click',  calcECEF2ECI);
  document.getElementById('btn-eci2ecef')?.addEventListener('click',  calcECI2ECEF);
  document.getElementById('btn-obs2tgt')?.addEventListener('click',   calcObs2Tgt);
  document.getElementById('btn-solar-calc')?.addEventListener('click',calcSolar);
  document.getElementById('btn-solar-now')?.addEventListener('click', () => { document.getElementById('solar-utc').value = new Date().toISOString(); });
  document.getElementById('btn-geo-demo')?.addEventListener('click',  () => {
    document.getElementById('geo-lat').value = '60.1699';
    document.getElementById('geo-lon').value = '24.9384';
    document.getElementById('geo-alt').value = '30';
  });
  document.getElementById('btn-obs-demo')?.addEventListener('click', () => {
    ['obs-lat','obs-lon','obs-alt','tgt-lat','tgt-lon','tgt-alt']
      .forEach((id,i) => document.getElementById(id).value = ['51.5','-0.12','50','48.85','2.35','50'][i]);
  });
}

function calcGeo2ECEF() {
  const lat = UI.validateNumber('geo-lat', { label: 'Latitude',  min: -90,  max: 90  }); if (lat === null) return;
  const lon = UI.validateNumber('geo-lon', { label: 'Longitude', min: -180, max: 180 }); if (lon === null) return;
  const alt = UI.validateNumber('geo-alt', { label: 'Altitude' }) ?? 0;
  const r = Earth.geodeticToECEF(lat, lon, alt);
  UI.renderResultCards('earth-geo-results', [
    { label: 'X (ECEF)', value: r.x, unit: 'm' },
    { label: 'Y (ECEF)', value: r.y, unit: 'm' },
    { label: 'Z (ECEF)', value: r.z, unit: 'm' },
    { label: '|r|',      value: Math.sqrt(r.x**2+r.y**2+r.z**2), unit: 'm' },
  ], 'Geodetic → ECEF');
  _patchScenario({ coordinateInputs: { lat_deg: lat, lon_deg: lon, alt_m: alt }, convertedCoordinates: { ecef: r } });
}

function calcECEF2Geo() {
  const x = UI.validateNumber('ecef-x', { label: 'X' }); if (x === null) return;
  const y = UI.validateNumber('ecef-y', { label: 'Y' }); if (y === null) return;
  const z = UI.validateNumber('ecef-z', { label: 'Z' }); if (z === null) return;
  const r = Earth.ecefToGeodetic(x, y, z);
  UI.renderResultCards('earth-geo-results', [
    { label: 'Latitude',  value: r.lat_deg, unit: '°' },
    { label: 'Longitude', value: r.lon_deg, unit: '°' },
    { label: 'Altitude',  value: r.alt_m,  unit: 'm' },
  ], 'ECEF → Geodetic');
  _patchScenario({ convertedCoordinates: { geodetic: r } });
}

function calcECEF2ENU() {
  const lat = UI.validateNumber('enu-reflat'); if (lat === null) return;
  const lon = UI.validateNumber('enu-reflon'); if (lon === null) return;
  const dx  = UI.validateNumber('enu-dx'); if (dx === null) return;
  const dy  = UI.validateNumber('enu-dy'); if (dy === null) return;
  const dz  = UI.validateNumber('enu-dz'); if (dz === null) return;
  const r   = Earth.ecefToENU(dx, dy, dz, lat, lon);
  UI.renderResultCards('earth-enu-results', [
    { label: 'East (E)',  value: r.e, unit: 'm' },
    { label: 'North (N)', value: r.n, unit: 'm' },
    { label: 'Up (U)',    value: r.u, unit: 'm' },
  ], 'ECEF → ENU');
}

function calcENU2ECEF() {
  const lat = UI.validateNumber('enu-reflat'); if (lat === null) return;
  const lon = UI.validateNumber('enu-reflon'); if (lon === null) return;
  const e   = UI.validateNumber('enu-dx'); if (e === null) return;
  const n   = UI.validateNumber('enu-dy'); if (n === null) return;
  const u   = UI.validateNumber('enu-dz'); if (u === null) return;
  const r   = Earth.enuToECEF(e, n, u, lat, lon);
  UI.renderResultCards('earth-enu-results', [
    { label: 'ΔX', value: r.x, unit: 'm' },
    { label: 'ΔY', value: r.y, unit: 'm' },
    { label: 'ΔZ', value: r.z, unit: 'm' },
  ], 'ENU → ECEF');
}

function calcENU2AzEl() {
  const e = UI.validateNumber('azel-e'); if (e === null) return;
  const n = UI.validateNumber('azel-n'); if (n === null) return;
  const u = UI.validateNumber('azel-u'); if (u === null) return;
  const r = Earth.enuToAzElRange(e, n, u);
  UI.renderResultCards('earth-azel-results', [
    { label: 'Azimuth',   value: r.az_deg,  unit: '°' },
    { label: 'Elevation', value: r.el_deg,  unit: '°' },
    { label: 'Range',     value: r.range_m, unit: 'm' },
  ], 'ENU → Az/El/Range');
}

function calcAzEl2ENU() {
  const az  = UI.validateNumber('az-val'); if (az === null) return;
  const el  = UI.validateNumber('el-val'); if (el === null) return;
  const rng = UI.validateNumber('rng-val'); if (rng === null) return;
  const r   = Earth.azElRangeToENU(az, el, rng);
  UI.renderResultCards('earth-azel-results', [
    { label: 'East',  value: r.e, unit: 'm' },
    { label: 'North', value: r.n, unit: 'm' },
    { label: 'Up',    value: r.u, unit: 'm' },
  ], 'Az/El/Range → ENU');
}

function calcECEF2ECI() {
  const x   = UI.validateNumber('eci-x'); if (x === null) return;
  const y   = UI.validateNumber('eci-y'); if (y === null) return;
  const z   = UI.validateNumber('eci-z'); if (z === null) return;
  const utc = document.getElementById('eci-utc')?.value || new Date().toISOString();
  const jd  = Time.utcToJulianDate(utc);
  const r   = Earth.ecefToECI(x, y, z, jd);
  UI.renderResultCards('earth-eci-results', [
    { label: 'X (ECI)', value: r.x, unit: 'm' },
    { label: 'Y (ECI)', value: r.y, unit: 'm' },
    { label: 'Z (ECI)', value: r.z, unit: 'm' },
  ], 'ECEF → ECI');
}

function calcECI2ECEF() {
  const x   = UI.validateNumber('eci-x'); if (x === null) return;
  const y   = UI.validateNumber('eci-y'); if (y === null) return;
  const z   = UI.validateNumber('eci-z'); if (z === null) return;
  const utc = document.getElementById('eci-utc')?.value || new Date().toISOString();
  const jd  = Time.utcToJulianDate(utc);
  const r   = Earth.eciToECEF(x, y, z, jd);
  UI.renderResultCards('earth-eci-results', [
    { label: 'X (ECEF)', value: r.x, unit: 'm' },
    { label: 'Y (ECEF)', value: r.y, unit: 'm' },
    { label: 'Z (ECEF)', value: r.z, unit: 'm' },
  ], 'ECI → ECEF');
}

function calcObs2Tgt() {
  const oLat = UI.validateNumber('obs-lat', { min:-90, max:90 }); if (oLat === null) return;
  const oLon = UI.validateNumber('obs-lon', { min:-180,max:180}); if (oLon === null) return;
  const oAlt = UI.validateNumber('obs-alt') ?? 0;
  const tLat = UI.validateNumber('tgt-lat', { min:-90, max:90 }); if (tLat === null) return;
  const tLon = UI.validateNumber('tgt-lon', { min:-180,max:180}); if (tLon === null) return;
  const tAlt = UI.validateNumber('tgt-alt') ?? 0;
  const r = Earth.observerTargetAzElRange(oLat, oLon, oAlt, tLat, tLon, tAlt);
  UI.renderResultCards('earth-obs-results', [
    { label: 'Azimuth',   value: r.az_deg,  unit: '°' },
    { label: 'Elevation', value: r.el_deg,  unit: '°' },
    { label: 'Range',     value: r.range_m, unit: 'm', variant: 'hl' },
    { label: 'Range (km)',value: r.range_m/1e3, unit: 'km' },
    { label: 'Above Horizon', value: r.aboveHorizon ? 'YES' : 'NO',
      variant: r.aboveHorizon ? 'ok' : 'err' },
  ], 'Observer → Target');
  _patchScenario({
    visibilityResults: [{ obsLat: oLat, obsLon: oLon, tgtLat: tLat, tgtLon: tLon,
      az_deg: r.az_deg, el_deg: r.el_deg, range_m: r.range_m, visible: r.aboveHorizon }],
  });
}

function calcSolar() {
  const lat = UI.validateNumber('solar-lat', { min:-90,max:90  }); if (lat === null) return;
  const lon = UI.validateNumber('solar-lon', { min:-180,max:180}); if (lon === null) return;
  const utc = document.getElementById('solar-utc')?.value || new Date().toISOString();
  const jd  = Time.utcToJulianDate(utc);
  const sub  = Earth.getSubsolarPoint(jd);
  const lit  = Earth.isEarthPointSunlit(lat, lon, jd);
  const lst  = Earth.localSolarTime(lon, jd);
  const tz   = Earth.nominalTimeZone(lon);
  UI.renderResultCards('earth-solar-results', [
    { label: 'Sub-solar Lat',   value: sub.lat_deg, unit: '°' },
    { label: 'Sub-solar Lon',   value: sub.lon_deg, unit: '°' },
    { label: 'Point Sunlit',    value: lit.sunlit ? 'YES' : 'NO',
      variant: lit.sunlit ? 'ok' : 'warn' },
    { label: 'Solar Elevation', value: lit.solarElevation_deg, unit: '°' },
    { label: 'Local Solar Time',value: lst.toFixed(3), unit: 'h' },
    { label: 'Nominal UTC Offset', value: tz.utcOffset, unit: 'h' },
  ], 'Solar Geometry');
  _patchScenario({ bodies: { earth: { subsolarLat: sub.lat_deg, subsolarLon: sub.lon_deg } } });
}

/* ================================================================
   ── MOON COORDINATES TAB ─────────────────────────────────────
   ================================================================ */
function wireMoonTab() {
  document.getElementById('btn-sel2cart')?.addEventListener('click', calcSel2Cart);
  document.getElementById('btn-cart2sel')?.addEventListener('click', calcCart2Sel);
  document.getElementById('btn-moon-pos')?.addEventListener('click', calcMoonPos);
  document.getElementById('btn-moon-pos-now')?.addEventListener('click', () => { document.getElementById('moon-pos-utc').value = new Date().toISOString(); });
  document.getElementById('btn-millum')?.addEventListener('click', calcMoonIllum);
  document.getElementById('btn-mearth')?.addEventListener('click', calcMoonEarthVis);
  document.getElementById('btn-sel-apollo11')?.addEventListener('click', () => {
    document.getElementById('sel-lat').value = '0.6741';
    document.getElementById('sel-lon').value = '23.4730';
    document.getElementById('sel-alt').value = '0';
  });
  document.getElementById('btn-millum-shackleton')?.addEventListener('click', () => {
    document.getElementById('millum-lat').value = '-89.9';
    document.getElementById('millum-lon').value = '0';
  });
  document.getElementById('btn-mearth-demo')?.addEventListener('click', () => {
    document.getElementById('mearth-lat').value = '0';
    document.getElementById('mearth-lon').value = '0';
  });
}

function calcSel2Cart() {
  const lat = UI.validateNumber('sel-lat', { min:-90,max:90 }); if (lat === null) return;
  const lon = UI.validateNumber('sel-lon', { min:-180,max:180}); if (lon === null) return;
  const alt = UI.validateNumber('sel-alt') ?? 0;
  const r   = Moon.selenographicToLunarFixed(lat, lon, alt);
  UI.renderResultCards('moon-seleno-results', [
    { label: 'X (Lunar-Fixed)', value: r.x, unit: 'm' },
    { label: 'Y (Lunar-Fixed)', value: r.y, unit: 'm' },
    { label: 'Z (Lunar-Fixed)', value: r.z, unit: 'm' },
    { label: 'Near Side',       value: Moon.isNearSide(lon) ? 'YES' : 'NO',
      variant: Moon.isNearSide(lon) ? 'ok' : 'warn' },
  ], 'Selenographic → Lunar-Fixed');
}

function calcCart2Sel() {
  const x = UI.validateNumber('moon-cx'); if (x === null) return;
  const y = UI.validateNumber('moon-cy'); if (y === null) return;
  const z = UI.validateNumber('moon-cz'); if (z === null) return;
  const r = Moon.lunarFixedToSelenographic(x, y, z);
  UI.renderResultCards('moon-seleno-results', [
    { label: 'Latitude',  value: r.lat_deg, unit: '°' },
    { label: 'Longitude', value: r.lon_deg, unit: '°' },
    { label: 'Altitude',  value: r.alt_m,  unit: 'm' },
    { label: 'Near Side', value: Moon.isNearSide(r.lon_deg) ? 'YES' : 'NO',
      variant: Moon.isNearSide(r.lon_deg) ? 'ok' : 'warn' },
  ], 'Lunar-Fixed → Selenographic');
}

function calcMoonPos() {
  const utc = document.getElementById('moon-pos-utc')?.value || new Date().toISOString();
  const jd  = Time.utcToJulianDate(utc);
  const eci = Moon.moonECIApprox(jd);
  const dist = Moon.earthMoonDistance(jd);
  const sub  = Moon.getSubEarthPoint(jd);
  const subSol = Moon.getSubsolarMoonPoint(jd);
  UI.renderResultCards('moon-pos-results', [
    { label: 'X (ECI)', value: eci.x, unit: 'm' },
    { label: 'Y (ECI)', value: eci.y, unit: 'm' },
    { label: 'Z (ECI)', value: eci.z, unit: 'm' },
    { label: 'Earth-Moon Distance', value: dist/1e3, unit: 'km', variant: 'hl' },
    { label: 'Sub-Earth Lat', value: sub.lat_deg, unit: '°' },
    { label: 'Sub-Earth Lon', value: sub.lon_deg, unit: '°' },
    { label: 'Sub-Solar Lat', value: subSol.lat_deg, unit: '°' },
    { label: 'Sub-Solar Lon', value: subSol.lon_deg, unit: '°' },
  ], 'Moon Position');
  _patchScenario({ bodies: { moon: { subEarthLat: sub.lat_deg, subEarthLon: sub.lon_deg, distance_m: dist } } });
}

function calcMoonIllum() {
  const lat = UI.validateNumber('millum-lat', { min:-90,max:90 }); if (lat === null) return;
  const lon = UI.validateNumber('millum-lon', { min:-180,max:180}); if (lon === null) return;
  const utc = document.getElementById('millum-utc')?.value || new Date().toISOString();
  const jd  = Time.utcToJulianDate(utc);
  const r   = Moon.isMoonPointSunlit(lat, lon, jd);
  const el  = Moon.solarElevationAtMoonPoint(lat, lon, jd);
  UI.renderResultCards('moon-illum-results', [
    { label: 'Sunlit',           value: r.sunlit ? 'YES' : 'NO', variant: r.sunlit ? 'ok' : 'warn' },
    { label: 'Solar Elevation',  value: r.solarElevation_deg, unit: '°' },
    { label: 'Near Side',        value: Moon.isNearSide(lon) ? 'YES' : 'NO' },
  ], 'Lunar Illumination');
}

function calcMoonEarthVis() {
  const lat = UI.validateNumber('mearth-lat', { min:-90,max:90 }); if (lat === null) return;
  const lon = UI.validateNumber('mearth-lon', { min:-180,max:180}); if (lon === null) return;
  const utc = document.getElementById('mearth-utc')?.value || new Date().toISOString();
  const jd  = Time.utcToJulianDate(utc);
  const r   = Moon.isMoonPointEarthVisible(lat, lon, jd);
  const el  = Moon.earthElevationAtMoonPoint(lat, lon, jd);
  UI.renderResultCards('moon-earthvis-results', [
    { label: 'Earth Visible',    value: r.visible ? 'YES' : 'NO', variant: r.visible ? 'ok' : 'warn' },
    { label: 'Earth Elevation',  value: r.earthElevation_deg, unit: '°' },
    { label: 'Near Side',        value: Moon.isNearSide(lon) ? 'YES' : 'NO' },
  ], 'Earth Visibility from Moon');
}

/* ================================================================
   ── SPACE/ORBITAL TAB ─────────────────────────────────────────
   ================================================================ */
function wireOrbitTab() {
  document.getElementById('btn-orbit-params')?.addEventListener('click', calcOrbitParams);
  document.getElementById('btn-coe2state')?.addEventListener('click',   calcCOE2State);
  document.getElementById('btn-state2coe')?.addEventListener('click',   calcState2COE);
  document.getElementById('btn-anom-calc')?.addEventListener('click',   calcAnomalies);
  document.getElementById('btn-hohmann')?.addEventListener('click',     calcHohmann);
  document.getElementById('btn-plane-change')?.addEventListener('click',calcPlaneChange);
  document.getElementById('btn-orbit-iss')?.addEventListener('click', () => {
    document.getElementById('op-a').value = '6778137';
    document.getElementById('op-body').value = 'earth';
  });
  document.getElementById('btn-coe-iss')?.addEventListener('click', () => {
    ['coe-a','coe-e','coe-i','coe-raan','coe-argp','coe-nu']
      .forEach((id,i) => document.getElementById(id).value = ['6778137','0.001','51.6','235','45','0'][i]);
  });
  document.getElementById('btn-hoh-geo')?.addEventListener('click', () => {
    document.getElementById('hoh-r1').value = '6778137';
    document.getElementById('hoh-r2').value = '42164000';
  });
}

function _mu(bodyId) { return bodyId === 'moon' ? GM_MOON : GM_EARTH; }

function calcOrbitParams() {
  const a    = UI.validateNumber('op-a', { label: 'a', min: 1e3 }); if (a === null) return;
  const body = document.getElementById('op-body')?.value || 'earth';
  const mu   = _mu(body);
  const T    = Orbit.orbitalPeriod(a, mu);
  const Vc   = Orbit.circularVelocity(a, mu);
  const Ve   = Orbit.escapeVelocity(a, mu);
  const n    = Orbit.meanMotion(a, mu);
  UI.renderResultCards('orbit-params-results', [
    { label: 'Period',             value: T,     unit: 's', variant: 'hl' },
    { label: 'Period (min)',       value: T/60,  unit: 'min' },
    { label: 'Circular Velocity',  value: Vc,    unit: 'm/s' },
    { label: 'Escape Velocity',    value: Ve,    unit: 'm/s' },
    { label: 'Mean Motion',        value: n,     unit: 'rad/s' },
    { label: 'Altitude (above R)', value: (a - R_EARTH_MEAN)/1e3, unit: 'km' },
  ], 'Orbital Parameters');
}

function calcCOE2State() {
  const a    = UI.validateNumber('coe-a');    if (a === null) return;
  const e    = UI.validateNumber('coe-e');    if (e === null) return;
  const i    = UI.validateNumber('coe-i');    if (i === null) return;
  const raan = UI.validateNumber('coe-raan'); if (raan === null) return;
  const argp = UI.validateNumber('coe-argp'); if (argp === null) return;
  const nu   = UI.validateNumber('coe-nu');   if (nu === null) return;
  const r    = Orbit.coeToState(a, e, i, raan, argp, nu);
  UI.renderResultCards('orbit-coe2state-results', [
    { label: 'rx', value: r.r_vec[0], unit: 'm' },
    { label: 'ry', value: r.r_vec[1], unit: 'm' },
    { label: 'rz', value: r.r_vec[2], unit: 'm' },
    { label: 'vx', value: r.v_vec[0], unit: 'm/s' },
    { label: 'vy', value: r.v_vec[1], unit: 'm/s' },
    { label: 'vz', value: r.v_vec[2], unit: 'm/s' },
    { label: '|r|', value: Math.sqrt(r.r_vec.reduce((s,v)=>s+v*v,0)), unit: 'm' },
    { label: '|v|', value: Math.sqrt(r.v_vec.reduce((s,v)=>s+v*v,0)), unit: 'm/s' },
  ], 'COE → State Vector');
  _patchScenario({ orbitResults: { a, e, i_deg: i, raan_deg: raan, argp_deg: argp, nu_deg: nu, r_vec: r.r_vec, v_vec: r.v_vec } });
}

function calcState2COE() {
  const rx = UI.validateNumber('sv-rx'); if (rx === null) return;
  const ry = UI.validateNumber('sv-ry'); if (ry === null) return;
  const rz = UI.validateNumber('sv-rz'); if (rz === null) return;
  const vx = UI.validateNumber('sv-vx'); if (vx === null) return;
  const vy = UI.validateNumber('sv-vy'); if (vy === null) return;
  const vz = UI.validateNumber('sv-vz'); if (vz === null) return;
  const r  = Orbit.stateToCOE([rx,ry,rz],[vx,vy,vz]);
  UI.renderResultCards('orbit-state2coe-results', [
    { label: 'Semi-major axis a', value: r.a,        unit: 'm', variant: 'hl' },
    { label: 'Eccentricity e',    value: r.e },
    { label: 'Inclination i',     value: r.i_deg,    unit: '°' },
    { label: 'RAAN Ω',            value: r.raan_deg, unit: '°' },
    { label: 'Arg. of Perigee ω', value: r.argp_deg, unit: '°' },
    { label: 'True Anomaly ν',    value: r.nu_deg,   unit: '°' },
    { label: 'Period T',          value: r.period_s, unit: 's' },
  ], 'State Vector → COE');
  _patchScenario({ orbitResults: r });
}

function calcAnomalies() {
  const e = UI.validateNumber('anom-e', { min:0, max:0.9999 }); if (e === null) return;
  const M = UI.validateNumber('anom-M'); if (M === null) return;
  const E = Orbit.meanToEccentricAnomaly(M, e);
  const nu = Orbit.eccentricToTrueAnomaly(E, e);
  UI.renderResultCards('orbit-anomaly-results', [
    { label: 'Mean Anomaly M',      value: M,  unit: '°' },
    { label: 'Eccentric Anomaly E', value: E,  unit: '°', variant: 'hl' },
    { label: 'True Anomaly ν',      value: nu, unit: '°', variant: 'hl' },
  ], 'Anomaly Conversions');
}

function calcHohmann() {
  const r1   = UI.validateNumber('hoh-r1', { label: 'r₁', min: 1e5 }); if (r1 === null) return;
  const r2   = UI.validateNumber('hoh-r2', { label: 'r₂', min: 1e5 }); if (r2 === null) return;
  const body = document.getElementById('hoh-body')?.value || 'earth';
  const r    = Orbit.hohmannDeltaV(r1, r2, _mu(body));
  UI.renderResultCards('orbit-hohmann-results', [
    { label: 'ΔV₁',            value: r.dv1,            unit: 'm/s', variant: 'hl' },
    { label: 'ΔV₂',            value: r.dv2,            unit: 'm/s', variant: 'hl' },
    { label: 'Total ΔV',       value: r.dvTotal,         unit: 'm/s', variant: 'hl' },
    { label: 'Transfer Time',  value: r.transferTime_s,  unit: 's' },
    { label: 'Transfer Time',  value: r.transferTime_s/3600, unit: 'h' },
  ], 'Hohmann Transfer');
  _patchScenario({ orbitResults: { hohmann: { r1, r2, ...r } } });
}

function calcPlaneChange() {
  const v  = UI.validateNumber('pc-v',  { label: 'v', min: 0 }); if (v === null) return;
  const di = UI.validateNumber('pc-di', { label: 'Δi'        }); if (di === null) return;
  const dv = Orbit.planeChangeDeltaV(v, di);
  UI.renderResultCards('orbit-plane-results', [
    { label: 'Plane Change ΔV', value: dv, unit: 'm/s', variant: 'hl' },
  ], 'Plane Change');
}

/* ================================================================
   ── TLE TOOLS TAB ─────────────────────────────────────────────
   ================================================================ */
function wireTLETab() {
  document.getElementById('btn-tle-parse')?.addEventListener('click',     calcTLEParse);
  document.getElementById('btn-tle-propagate')?.addEventListener('click', calcTLEPropagate);
  document.getElementById('btn-omm-parse')?.addEventListener('click',     calcOMMParse);
  document.querySelectorAll('[data-sample-tle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = SAMPLE_TLES[btn.dataset.sampleTle];
      if (!s) return;
      document.getElementById('tle-name').value  = s.name;
      document.getElementById('tle-line1').value = s.line1;
      document.getElementById('tle-line2').value = s.line2;
    });
  });

  // TLE streaming from internet
  document.getElementById('btn-tle-fetch')?.addEventListener('click', handleTLEFetch);
}

async function handleTLEFetch() {
  const sourceKey = document.getElementById('tle-stream-source')?.value;
  const source = TLE_SOURCES[sourceKey];
  if (!source) return;

  const statusEl  = document.getElementById('tle-stream-status');
  const listEl    = document.getElementById('tle-stream-results');
  const fetchBtn  = document.getElementById('btn-tle-fetch');

  statusEl.innerHTML = '<div class="alert alert-info">Fetching TLEs from CelesTrak…</div>';
  listEl.innerHTML = '';
  fetchBtn.disabled = true;

  try {
    const tles = await fetchTLEFromURL(source.url);
    if (tles.length === 0) {
      statusEl.innerHTML = '<div class="alert alert-warn">No TLEs returned for this source.</div>';
      return;
    }
    statusEl.innerHTML = `<div class="alert alert-info">Loaded <b>${tles.length}</b> TLE(s) from ${escapeHTML(source.label)}. Click one to load it.</div>`;
    listEl.innerHTML = tles.map((t, i) =>
      `<div class="tle-stream-item" data-tle-idx="${i}">` +
        `<div class="tle-item-name">${escapeHTML(t.name)}</div>` +
        `<div class="tle-item-line">${escapeHTML(t.line1)}</div>` +
      `</div>`
    ).join('');

    listEl.querySelectorAll('.tle-stream-item').forEach(item => {
      item.addEventListener('click', () => {
        const idx = parseInt(item.dataset.tleIdx, 10);
        const tle = tles[idx];
        if (!tle) return;
        document.getElementById('tle-name').value  = tle.name;
        document.getElementById('tle-line1').value = tle.line1;
        document.getElementById('tle-line2').value = tle.line2;
        UI.showToast(`Loaded: ${tle.name}`, 'ok');
      });
    });
  } catch (err) {
    statusEl.innerHTML = `<div class="alert alert-warn">Failed to fetch TLEs: ${escapeHTML(err.message)}. This may be due to CORS restrictions or network issues.</div>`;
  } finally {
    fetchBtn.disabled = false;
  }
}

function escapeHTML(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str));
  return d.innerHTML;
}

function _getTLEInputs() {
  return {
    line1: document.getElementById('tle-line1')?.value?.trim(),
    line2: document.getElementById('tle-line2')?.value?.trim(),
  };
}

function _showModelBadge(text) {
  const el = document.getElementById('tle-model-badge');
  if (!el) return;
  if (text) { el.textContent = text; el.style.display = 'block'; }
  else { el.style.display = 'none'; }
}

function calcTLEParse() {
  const { line1, line2 } = _getTLEInputs();
  if (!line1 || !line2) { UI.renderAlert('tle-results','Enter TLE Line 1 and Line 2','warn'); return; }
  const val = TLE.validateTLE(line1, line2);
  if (!val.valid) { UI.renderAlert('tle-results', 'TLE validation errors: ' + val.errors.join('; '), 'err'); return; }
  const parsed = TLE.parseTLE(line1, line2);
  const kep    = TLE.tleToKeplerian(parsed);
  _showModelBadge('⚠ Source: TLE | Model: Keplerian two-body | NOT SGP4 — approximate educational interpretation');
  UI.renderResultCards('tle-results', [
    { label: 'Source Type',      value: 'TLE', variant: 'hl' },
    { label: 'Sat Number',       value: parsed.satNumber },
    { label: 'Epoch JD',         value: parsed.epochJD,         unit: 'JD' },
    { label: 'Inclination',      value: parsed.inclination_deg, unit: '°' },
    { label: 'RAAN',             value: parsed.raan_deg,        unit: '°' },
    { label: 'Eccentricity',     value: parsed.eccentricity },
    { label: 'Arg. Perigee',     value: parsed.argPerigee_deg,  unit: '°' },
    { label: 'Mean Anomaly',     value: parsed.meanAnomaly_deg, unit: '°' },
    { label: 'Mean Motion',      value: parsed.meanMotion_revPerDay, unit: 'rev/day' },
    { label: 'BSTAR',            value: parsed.bstar },
    { label: 'Semi-major axis',  value: kep.a/1e3, unit: 'km' },
    { label: 'Period',           value: kep.T_s/60, unit: 'min' },
    { label: 'Propagation',      value: 'Keplerian (two-body) — not SGP4' },
  ], 'TLE Parsed — Tracked Object');
  _patchScenario({
    trackedObjectResults: [{
      sourceType: 'TLE', propagationModel: 'Keplerian (two-body)',
      modelBadge: '⚠ Approximate TLE interpretation — not SGP4',
      ...parsed, ...kep,
    }],
    precisionLabels: { trackedObjects: 'Simplified educational approximation' },
  });
}

function calcTLEPropagate() {
  const { line1, line2 } = _getTLEInputs();
  if (!line1 || !line2) { UI.renderAlert('tle-results','Enter TLE Line 1 and Line 2','warn'); return; }
  const parsed = TLE.parseTLE(line1, line2);
  const utcStr = document.getElementById('tle-epoch')?.value?.trim();
  const jd = utcStr ? Time.utcToJulianDate(utcStr) : parsed.epochJD;
  const r  = TLE.propagateOrbitSimple(parsed, jd);
  _showModelBadge('⚠ Source: TLE | Model: Keplerian two-body propagation | NOT SGP4 — errors grow ~km/day in LEO');
  UI.renderResultCards('tle-results', [
    { label: 'Source Type',  value: 'TLE', variant: 'hl' },
    { label: 'Model',        value: 'Keplerian (two-body) — NOT SGP4' },
    { label: 'Latitude',     value: r.lat_deg, unit: '°' },
    { label: 'Longitude',    value: r.lon_deg, unit: '°' },
    { label: 'Altitude',     value: r.alt_km,  unit: 'km', variant: 'hl' },
    { label: 'X (ECI)',      value: r.x_eci,   unit: 'm' },
    { label: 'Y (ECI)',      value: r.y_eci,   unit: 'm' },
    { label: 'Z (ECI)',      value: r.z_eci,   unit: 'm' },
    { label: 'True Anomaly', value: r.trueAnomaly_deg, unit: '°' },
  ], 'TLE Propagated — Tracked Object');
  _patchScenario({
    trackedObjectResults: [{
      sourceType: 'TLE', propagationModel: 'Keplerian (two-body)',
      modelBadge: '⚠ Simplified two-body propagation — not SGP4',
      lat_deg: r.lat_deg, lon_deg: r.lon_deg, alt_km: r.alt_km,
      x_eci: r.x_eci, y_eci: r.y_eci, z_eci: r.z_eci,
    }],
    precisionLabels: { trackedObjects: 'Simplified educational approximation' },
  });
}

function calcOMMParse() {
  const raw = document.getElementById('omm-json')?.value?.trim();
  if (!raw) { UI.renderAlert('tle-results', 'Paste OMM JSON data', 'warn'); return; }
  let data;
  try { data = JSON.parse(raw); } catch (e) { UI.renderAlert('tle-results', 'Invalid JSON: ' + e.message, 'err'); return; }

  // Support single object or array
  const records = Array.isArray(data) ? data : [data];
  if (records.length === 0) { UI.renderAlert('tle-results', 'No OMM records found', 'warn'); return; }

  const first = records[0];
  const val = OMM.validateOMM(first);
  if (!val.valid) { UI.renderAlert('tle-results', 'OMM validation errors: ' + val.errors.join('; '), 'err'); return; }

  const parsed = OMM.parseOMMJSON(first);
  _showModelBadge('⚠ Source: OMM | Model: Keplerian two-body | NOT SGP4 — approximate educational interpretation');
  UI.renderResultCards('tle-results', [
    { label: 'Source Type',      value: 'OMM', variant: 'hl' },
    { label: 'Object Name',     value: parsed.objectName },
    { label: 'NORAD ID',        value: parsed.noradCatId },
    { label: 'Epoch',           value: parsed.epoch },
    { label: 'Inclination',     value: parsed.inclination_deg, unit: '°' },
    { label: 'RAAN',            value: parsed.raan_deg,        unit: '°' },
    { label: 'Eccentricity',    value: parsed.eccentricity },
    { label: 'Arg. Perigee',    value: parsed.argPerigee_deg,  unit: '°' },
    { label: 'Mean Anomaly',    value: parsed.meanAnomaly_deg, unit: '°' },
    { label: 'Mean Motion',     value: parsed.meanMotion_revPerDay, unit: 'rev/day' },
    { label: 'BSTAR',           value: parsed.bstar },
    { label: 'Semi-major axis', value: parsed.semiMajorAxis_km, unit: 'km' },
    { label: 'Period',          value: parsed.period_min, unit: 'min' },
    { label: 'Propagation',     value: 'Keplerian (two-body) — not SGP4' },
  ], 'OMM Parsed — Tracked Object');
  _patchScenario({
    trackedObjectResults: [parsed],
    precisionLabels: { trackedObjects: 'Simplified educational approximation' },
  });
}

/* ================================================================
   ── VISIBILITY TAB ────────────────────────────────────────────
   ================================================================ */
function wireVisibilityTab() {
  document.getElementById('btn-vis-calc')?.addEventListener('click', calcVisibility);
  document.getElementById('btn-vis-now')?.addEventListener('click', () => {
    document.getElementById('vis-utc').value = new Date().toISOString();
  });
  document.getElementById('btn-vis-demo')?.addEventListener('click', () => {
    ['vis-obs-lat','vis-obs-lon','vis-obs-alt','vis-tgt-lat','vis-tgt-lon','vis-tgt-alt','vis-utc']
      .forEach((id,i) => document.getElementById(id).value =
        ['51.5','-0.12','50','48.85','2.35','50', new Date().toISOString()][i]);
  });
}

function calcVisibility() {
  const oLat = UI.validateNumber('vis-obs-lat'); if (oLat === null) return;
  const oLon = UI.validateNumber('vis-obs-lon'); if (oLon === null) return;
  const oAlt = UI.validateNumber('vis-obs-alt') ?? 0;
  const tLat = UI.validateNumber('vis-tgt-lat'); if (tLat === null) return;
  const tLon = UI.validateNumber('vis-tgt-lon'); if (tLon === null) return;
  const tAlt = UI.validateNumber('vis-tgt-alt') ?? 0;
  const utc  = document.getElementById('vis-utc')?.value || new Date().toISOString();
  const jd   = Time.utcToJulianDate(utc);

  const obsType = document.getElementById('vis-obs-type')?.value || 'earth_surface';
  const tgtType = document.getElementById('vis-tgt-type')?.value || 'earth_point';

  let result;
  try {
    const observer = { type: obsType, lat_deg: oLat, lon_deg: oLon, alt_m: oAlt };
    const target   = { type: tgtType, lat_deg: tLat, lon_deg: tLon, alt_m: tAlt };
    result = Visibility.isTargetVisible(observer, target, { timeInput: { jd }, timeSystems: { jd } });
  } catch (e) {
    // Fallback: simple Az/El check
    const r = Earth.observerTargetAzElRange(oLat, oLon, oAlt, tLat, tLon, tAlt);
    result = { visible: r.aboveHorizon, el_deg: r.el_deg, az_deg: r.az_deg, range_m: r.range_m, reason: r.aboveHorizon ? 'above horizon' : 'below horizon' };
  }

  UI.renderResultCards('vis-results', [
    { label: 'Visible',   value: result.visible ? 'YES' : 'NO', variant: result.visible ? 'ok' : 'err' },
    { label: 'Reason',    value: result.reason ?? '—' },
    { label: 'Elevation', value: result.el_deg,  unit: '°' },
    { label: 'Azimuth',   value: result.az_deg,  unit: '°' },
    { label: 'Range',     value: result.range_m, unit: 'm' },
    { label: 'Range (km)',value: result.range_m != null ? result.range_m/1e3 : null, unit: 'km' },
    ...(result.sunlit !== undefined ? [{ label: 'Target Sunlit', value: result.sunlit ? 'YES' : 'NO' }] : []),
  ], 'Visibility Result');
  _patchScenario({
    visibilityResults: [{ obsLat: oLat, obsLon: oLon, tgtLat: tLat, tgtLon: tLon,
      visible: result.visible, az_deg: result.az_deg, el_deg: result.el_deg, range_m: result.range_m }],
  });
}

/* ================================================================
   ── DISTANCE & MEASUREMENT TAB ───────────────────────────────
   ================================================================ */
function wireDistanceTab() {
  document.getElementById('btn-gc-calc')?.addEventListener('click',    calcGreatCircle);
  document.getElementById('btn-em-calc')?.addEventListener('click',    calcEarthMoon);
  document.getElementById('btn-grid-calc')?.addEventListener('click',  calcGridIllum);
  document.getElementById('btn-em-now')?.addEventListener('click',   () => { document.getElementById('em-utc').value   = new Date().toISOString(); });
  document.getElementById('btn-grid-now')?.addEventListener('click', () => { document.getElementById('grid-utc').value = new Date().toISOString(); });
  document.getElementById('btn-gc-demo')?.addEventListener('click', () => {
    ['gc-lat1','gc-lon1','gc-lat2','gc-lon2']
      .forEach((id,i) => document.getElementById(id).value = ['51.5','-0.12','40.71','-74.01'][i]);
  });
}

function calcGreatCircle() {
  const lat1 = UI.validateNumber('gc-lat1'); if (lat1 === null) return;
  const lon1 = UI.validateNumber('gc-lon1'); if (lon1 === null) return;
  const lat2 = UI.validateNumber('gc-lat2'); if (lat2 === null) return;
  const lon2 = UI.validateNumber('gc-lon2'); if (lon2 === null) return;
  const dist = Earth.greatCircleDistance(lat1, lon1, lat2, lon2);
  const bear = Earth.greatCircleBearing(lat1, lon1, lat2, lon2);
  UI.renderResultCards('dist-gc-results', [
    { label: 'Distance',           value: dist/1e3, unit: 'km', variant: 'hl' },
    { label: 'Distance (m)',       value: dist,     unit: 'm' },
    { label: 'Distance (miles)',   value: dist/1609.344, unit: 'mi' },
    { label: 'Initial Bearing',    value: bear.initial_deg, unit: '°' },
    { label: 'Final Bearing',      value: bear.final_deg,   unit: '°' },
  ], 'Great-Circle Distance');
  _patchScenario({ distanceResults: { greatCircle_m: dist } });
}

function calcEarthMoon() {
  const utc = document.getElementById('em-utc')?.value || new Date().toISOString();
  const jd  = Time.utcToJulianDate(utc);
  const d   = Moon.earthMoonDistance(jd);
  const AU  = 1.496e11;
  UI.renderResultCards('dist-em-results', [
    { label: 'Earth–Moon Distance', value: d/1e3,    unit: 'km', variant: 'hl' },
    { label: 'In AU',               value: d/AU,     unit: 'AU' },
    { label: 'In Earth radii',      value: d/R_EARTH_MEAN },
  ], 'Earth–Moon Distance');
  _patchScenario({ distanceResults: { earthMoon_m: d } });
}

function calcGridIllum() {
  const utc      = document.getElementById('grid-utc')?.value || new Date().toISOString();
  const jd       = Time.utcToJulianDate(utc);
  const cellSize = parseFloat(document.getElementById('grid-cell')?.value) || 30;
  let cells;
  try { cells = Grids.computeGridIllumination(jd, cellSize); }
  catch (e) { UI.renderAlert('dist-grid-results', 'Error: ' + e.message, 'err'); return; }

  const headers = ['Cell ID', 'Lat (°)', 'Lon (°)', 'Sunlit', 'Solar El (°)'];
  const rows = cells.slice(0, 200).map(c => [
    c.cellId,
    c.centerLat.toFixed(1),
    c.centerLon.toFixed(1),
    c.sunlit ? '☀ YES' : '🌑 NO',
    c.solarElevation_deg?.toFixed(1) ?? '—',
  ]);
  UI.renderTable('dist-grid-results', headers, rows,
    `Lunar Grid Illumination (${cells.length} cells, cell size = ${cellSize}°)`);
  _patchScenario({ gridResults: { cellSize_deg: cellSize, cells: cells.slice(0,50) } });
}

/* ================================================================
   Scenario helpers
   ================================================================ */
function _patchScenario(patch) {
  _currentScenario = Scenario.mergeScenarioUpdates(_currentScenario, patch);
  syncPublish();
}

/* ================================================================
   ── ACCEPTANCE TESTS ─────────────────────────────────────────
   ================================================================ */
export function runAcceptanceTests() {
  const tests = [
    { name: 'Time: UTC→JD epoch', fn: () => {
      const r = Time.utcToAllSystems('2000-01-01T12:00:00Z');
      return Math.abs(r.jd - 2451545.0) < 1e-6;
    }},
    { name: 'Time: GPS week at J2000', fn: () => {
      const r = Time.utcToAllSystems('2000-01-01T12:00:00Z');
      return typeof r.gpsWeek === 'number' && r.gpsWeek > 0;
    }},
    { name: 'Earth: Geodetic→ECEF (equator/prime meridian)', fn: () => {
      const r = Earth.geodeticToECEF(0, 0, 0);
      return Math.abs(r.x - 6378137) < 10 && Math.abs(r.y) < 1 && Math.abs(r.z) < 1;
    }},
    { name: 'Earth: ECEF round-trip', fn: () => {
      const ecef = Earth.geodeticToECEF(51.5, -0.12, 50);
      const geo  = Earth.ecefToGeodetic(ecef.x, ecef.y, ecef.z);
      return Math.abs(geo.lat_deg - 51.5) < 0.0001 && Math.abs(geo.lon_deg - (-0.12)) < 0.0001;
    }},
    { name: 'Earth: Great-circle distance (London–Paris ~340 km)', fn: () => {
      const d = Earth.greatCircleDistance(51.5, -0.12, 48.85, 2.35);
      return d > 330000 && d < 360000;
    }},
    { name: 'Moon: Selenographic round-trip', fn: () => {
      const cart = Moon.selenographicToLunarFixed(0, 0, 0);
      const back = Moon.lunarFixedToSelenographic(cart.x, cart.y, cart.z);
      return Math.abs(back.lat_deg) < 0.001 && Math.abs(back.lon_deg) < 0.001;
    }},
    { name: 'Moon: isNearSide(0)=true, isNearSide(180)=false', fn: () => {
      return Moon.isNearSide(0) === true && Moon.isNearSide(180) === false;
    }},
    { name: 'Orbit: circular velocity ISS altitude', fn: () => {
      const Vc = Orbit.circularVelocity(6778137);
      return Math.abs(Vc - 7669) < 50;
    }},
    { name: 'Orbit: period at ISS altitude ~92 min', fn: () => {
      const T = Orbit.orbitalPeriod(6778137);
      return Math.abs(T/60 - 92.68) < 1;
    }},
    { name: 'Orbit: COE→State round-trip (state→COE)', fn: () => {
      const sv = Orbit.coeToState(6778137, 0.001, 51.6, 45, 90, 0);
      const coe = Orbit.stateToCOE(sv.r_vec, sv.v_vec);
      return Math.abs(coe.a - 6778137) < 100 && Math.abs(coe.i_deg - 51.6) < 0.01;
    }},
    { name: 'Orbit: Hohmann LEO→GEO total ΔV ~3940 m/s', fn: () => {
      const h = Orbit.hohmannDeltaV(6778137, 42164000);
      return Math.abs(h.dvTotal - 3940) < 100;
    }},
    { name: 'TLE: parse ISS TLE', fn: () => {
      const s = SAMPLE_TLES.iss;
      const v = TLE.validateTLE(s.line1, s.line2);
      return v.valid === true;
    }},
    { name: 'Scenario: createEmptyScenario has version 2.0', fn: () => {
      const s = Scenario.createEmptyScenario();
      return s.version === '2.0';
    }},
    { name: 'Scenario: v1.0 migrates to v2.0', fn: () => {
      const old = { version: '1.0', tleResults: { satNumber: 25544 }, timeInput: { jd: 2451545, utc: '', unix: 0 } };
      const migrated = Scenario.migrateScenario(old);
      return migrated.version === '2.0' && Array.isArray(migrated.trackedObjectResults);
    }},
  ];

  const area = document.getElementById('test-results-area');
  area.classList.remove('hidden');
  let pass = 0; let fail = 0;
  let html = '<div class="card"><div class="card-title">Acceptance Tests</div>';
  for (const t of tests) {
    let ok; let err = '';
    try { ok = !!t.fn(); } catch (e) { ok = false; err = e.message; }
    if (ok) pass++; else fail++;
    html += `<div class="test-row ${ok?'pass':'fail'}">
      <span class="tn">${t.name}</span>
      <span class="ts">${ok ? '✓ PASS' : '✗ FAIL'}</span>
      ${err ? `<span class="te">${err}</span>` : ''}
    </div>`;
  }
  html += `<hr class="divider"/>
    <div class="test-row"><span class="tn"><b>Total: ${tests.length}</b></span>
    <span class="ts" style="color:var(--col-ok)">${pass} passed</span>
    ${fail > 0 ? `<span class="ts" style="color:var(--col-err)">${fail} failed</span>` : ''}
    </div></div>`;
  area.innerHTML = html;
  UI.showToast(`Tests: ${pass}/${tests.length} passed`, fail === 0 ? 'ok' : 'warn');
}
