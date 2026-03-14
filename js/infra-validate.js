/**
 * @file infra-validate.js
 * @module infra-validate
 * @description Lightweight schema sanity checks and filtering determinism
 * tests for the CELES-CALC infrastructure database.
 *
 * These checks are intentionally minimal and browser-safe.  They run
 * in-process against the seed data and return structured results rather
 * than throwing exceptions.
 */

import {
  LAUNCH_SITES,
  GROUND_STATIONS,
  TTC_STATIONS,
  NETWORK_OPERATORS,
  filterLaunchSites,
  filterGroundStations,
  filterTTCStations,
  filterOperators,
  normalizeForRFEval,
  getInfrastructureSummary,
} from './infrastructure.js';
import {
  createEmptyScenario,
  mergeScenarioUpdates,
  scenarioToJSON,
  scenarioFromJSON,
} from './scenario.js';
import { loadStations, rankStations } from './groundstations.js';
import { searchWindows, makeLaunchWindowEvaluator } from './window-search.js';

// ─── Required field maps ──────────────────────────────────────────────────────

/** Minimum required fields per entity type. */
const REQUIRED = {
  launch_site:      ['id', 'name', 'lat_deg', 'lon_deg', 'status', 'confidence'],
  ground_station:   ['id', 'name', 'lat_deg', 'lon_deg', 'status', 'confidence', 'supportedBands'],
  ttc_station:      ['id', 'name', 'lat_deg', 'lon_deg', 'status', 'confidence', 'supportedBands'],
  network_operator: ['id', 'name', 'operatorType', 'confidence'],
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Check that each record in an array has all required fields.
 * Returns an array of error strings (empty if all records are valid).
 *
 * @param {Array<Object>} records
 * @param {string} entityType
 * @returns {string[]}
 */
function _checkRequiredFields(records, entityType) {
  const required = REQUIRED[entityType] || [];
  const errors = [];
  records.forEach((rec, i) => {
    for (const field of required) {
      if (rec[field] == null || rec[field] === '') {
        errors.push(`${entityType}[${i}] id="${rec.id ?? '?'}" missing field: ${field}`);
      }
    }
  });
  return errors;
}

/**
 * Check that coordinate fields are plausible numbers.
 *
 * @param {Array<Object>} records
 * @param {string} entityType
 * @returns {string[]}
 */
function _checkCoordinates(records, entityType) {
  const errors = [];
  records.forEach(rec => {
    if (rec.lat_deg == null || rec.lon_deg == null) return; // already caught by required check
    const lat = Number(rec.lat_deg);
    const lon = Number(rec.lon_deg);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      errors.push(`${entityType} id="${rec.id}" invalid lat_deg: ${rec.lat_deg}`);
    }
    if (isNaN(lon) || lon < -180 || lon > 180) {
      errors.push(`${entityType} id="${rec.id}" invalid lon_deg: ${rec.lon_deg}`);
    }
  });
  return errors;
}

/**
 * Check that confidence values are in [0, 1].
 *
 * @param {Array<Object>} records
 * @param {string} entityType
 * @returns {string[]}
 */
function _checkConfidence(records, entityType) {
  const errors = [];
  records.forEach(rec => {
    const c = Number(rec.confidence);
    if (isNaN(c) || c < 0 || c > 1) {
      errors.push(`${entityType} id="${rec.id}" confidence out of range: ${rec.confidence}`);
    }
  });
  return errors;
}

/**
 * Check that sourceRecords is a non-empty array on each record.
 *
 * @param {Array<Object>} records
 * @param {string} entityType
 * @returns {string[]}
 */
function _checkSourceRecords(records, entityType) {
  const errors = [];
  records.forEach(rec => {
    if (!Array.isArray(rec.sourceRecords) || rec.sourceRecords.length === 0) {
      errors.push(`${entityType} id="${rec.id}" has no sourceRecords`);
    }
  });
  return errors;
}

/**
 * Check that all IDs in a collection are unique.
 *
 * @param {Array<Object>} records
 * @param {string} entityType
 * @returns {string[]}
 */
function _checkUniqueIds(records, entityType) {
  const seen = new Set();
  const errors = [];
  records.forEach(rec => {
    if (!rec.id) return;
    if (seen.has(rec.id)) {
      errors.push(`${entityType} duplicate id: ${rec.id}`);
    }
    seen.add(rec.id);
  });
  return errors;
}

// ─── Filtering determinism checks ────────────────────────────────────────────

/**
 * Verify that filter functions return deterministic, stable subsets.
 * Runs each filter twice with the same criteria and checks result equality.
 *
 * @returns {string[]} errors (empty means pass)
 */
function _checkFilterDeterminism() {
  const errors = [];
  const sameIds = (a, b) => JSON.stringify(a.map(x => x.id)) === JSON.stringify(b.map(x => x.id));

  const gs1 = filterGroundStations(GROUND_STATIONS, { status: 'active' });
  const gs2 = filterGroundStations(GROUND_STATIONS, { status: 'active' });
  if (!sameIds(gs1, gs2)) {
    errors.push('filterGroundStations is not deterministic');
  }

  const ls1 = filterLaunchSites(LAUNCH_SITES, { country: 'US' });
  const ls2 = filterLaunchSites(LAUNCH_SITES, { country: 'US' });
  if (!sameIds(ls1, ls2)) {
    errors.push('filterLaunchSites is not deterministic');
  }

  const ttc1 = filterTTCStations(TTC_STATIONS, { status: 'active' });
  const ttc2 = filterTTCStations(TTC_STATIONS, { status: 'active' });
  if (!sameIds(ttc1, ttc2)) {
    errors.push('filterTTCStations is not deterministic');
  }

  return errors;
}

/**
 * Verify that normalizeForRFEval produces valid loadStations-compatible records.
 *
 * @returns {string[]} errors
 */
function _checkNormalization() {
  const errors = [];
  const required = ['name', 'lat_deg', 'lon_deg', 'alt_m', 'antennaGain_dBi', 'band', 'costIndex', 'hasRedundancy', 'capabilities'];

  [...GROUND_STATIONS, ...TTC_STATIONS].forEach(rec => {
    const norm = normalizeForRFEval(rec, { band: 'X' });
    for (const field of required) {
      if (norm[field] == null) {
        errors.push(`normalizeForRFEval(${rec.id}) missing field: ${field}`);
      }
    }
    if (typeof norm.antennaGain_dBi !== 'number' || norm.antennaGain_dBi < 0) {
      errors.push(`normalizeForRFEval(${rec.id}) invalid antennaGain_dBi: ${norm.antennaGain_dBi}`);
    }
    if (typeof norm.costIndex !== 'number' || norm.costIndex <= 0) {
      errors.push(`normalizeForRFEval(${rec.id}) invalid costIndex: ${norm.costIndex}`);
    }
  });
  return errors;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ValidationResult
 * @property {boolean}  pass     True if no errors were found.
 * @property {number}   total    Total number of checks run.
 * @property {number}   passed   Number of checks that passed.
 * @property {number}   failed   Number of checks that failed.
 * @property {string[]} errors   List of error messages (empty when pass=true).
 */

/**
 * Run all lightweight validation checks against the infrastructure seed data.
 *
 * Checks include:
 * - Required fields present on every record
 * - Coordinate plausibility
 * - Confidence values in [0, 1]
 * - Source record presence
 * - ID uniqueness
 * - Filter function determinism
 * - Normalization output completeness
 *
 * @returns {ValidationResult}
 */
export function validateInfrastructure() {
  const allErrors = [];

  // Required fields
  allErrors.push(..._checkRequiredFields(LAUNCH_SITES,      'launch_site'));
  allErrors.push(..._checkRequiredFields(GROUND_STATIONS,   'ground_station'));
  allErrors.push(..._checkRequiredFields(TTC_STATIONS,      'ttc_station'));
  allErrors.push(..._checkRequiredFields(NETWORK_OPERATORS, 'network_operator'));

  // Coordinates
  allErrors.push(..._checkCoordinates(LAUNCH_SITES,    'launch_site'));
  allErrors.push(..._checkCoordinates(GROUND_STATIONS, 'ground_station'));
  allErrors.push(..._checkCoordinates(TTC_STATIONS,    'ttc_station'));

  // Confidence
  allErrors.push(..._checkConfidence(LAUNCH_SITES,      'launch_site'));
  allErrors.push(..._checkConfidence(GROUND_STATIONS,   'ground_station'));
  allErrors.push(..._checkConfidence(TTC_STATIONS,      'ttc_station'));
  allErrors.push(..._checkConfidence(NETWORK_OPERATORS, 'network_operator'));

  // Source records
  allErrors.push(..._checkSourceRecords(LAUNCH_SITES,      'launch_site'));
  allErrors.push(..._checkSourceRecords(GROUND_STATIONS,   'ground_station'));
  allErrors.push(..._checkSourceRecords(TTC_STATIONS,      'ttc_station'));
  allErrors.push(..._checkSourceRecords(NETWORK_OPERATORS, 'network_operator'));

  // ID uniqueness
  allErrors.push(..._checkUniqueIds(LAUNCH_SITES,      'launch_site'));
  allErrors.push(..._checkUniqueIds(GROUND_STATIONS,   'ground_station'));
  allErrors.push(..._checkUniqueIds(TTC_STATIONS,      'ttc_station'));
  allErrors.push(..._checkUniqueIds(NETWORK_OPERATORS, 'network_operator'));

  // Behavioral checks
  allErrors.push(..._checkFilterDeterminism());
  allErrors.push(..._checkNormalization());

  const summary = getInfrastructureSummary();
  const totalChecks = summary.total + 7; // record checks + behavioral checks
  const failed = allErrors.length;
  return {
    pass:   failed === 0,
    total:  totalChecks,
    passed: totalChecks - failed,
    failed,
    errors: allErrors,
  };
}

/**
 * Run infrastructure-only smoke checks (schema + filter behavior + RF normalization).
 * Alias kept explicit for dev-facing checks in browser console and docs.
 *
 * @returns {ValidationResult}
 */
export function runInfrastructureSmokeChecks() {
  return validateInfrastructure();
}

/**
 * Lightweight UI smoke checks for Infrastructure tab wiring.
 * Safe to run in browser at any time; does not throw on missing DOM.
 *
 * @returns {ValidationResult}
 */
export function runUiSmokeChecks() {
  const errors = [];
  const requiredIds = [
    'infra-launch-btn-filter',
    'infra-ground-btn-filter',
    'infra-ttc-btn-filter',
    'infra-ops-btn-filter',
    'infra-launch-list',
    'infra-ground-list',
    'infra-ttc-list',
    'infra-ops-list',
    'infra-inspector',
    'infra-btn-validate',
  ];
  const behavioralCheckCount = 8; // launch, ground, TT&C, operator filters + normalization + selected station record + default input sanity

  if (typeof document === 'undefined') {
    errors.push('UI smoke checks require a browser document context');
  } else {
    requiredIds.forEach(id => {
      if (!document.getElementById(id)) {
        errors.push(`Missing infrastructure UI element: #${id}`);
      }
    });
  }

  // Ensure deterministic filtering and non-empty seed set for browser list rendering.
  const launchActive = filterLaunchSites(LAUNCH_SITES, { status: 'active' });
  if (!Array.isArray(launchActive) || launchActive.length === 0) {
    errors.push('Launch-site active filter returned no records');
  }

  const groundBandX = filterGroundStations(GROUND_STATIONS, { band: 'X' });
  if (!Array.isArray(groundBandX) || groundBandX.length === 0) {
    errors.push('Ground-station X-band filter returned no records');
  }

  const ttcBandS = filterTTCStations(TTC_STATIONS, { band: 'S' });
  if (!Array.isArray(ttcBandS) || ttcBandS.length === 0) {
    errors.push('TT&C S-band filter returned no records');
  }

  const governmentalOps = filterOperators(NETWORK_OPERATORS, { operatorType: 'governmental' });
  if (!Array.isArray(governmentalOps) || governmentalOps.length === 0) {
    errors.push('Operator-type filter returned no governmental operators');
  }

  const normalized = normalizeForRFEval(GROUND_STATIONS[0], { band: 'X' });
  if (!normalized?.name || !normalized?.band) {
    errors.push('normalizeForRFEval failed for infrastructure-selected station');
  }
  if (!normalized?.infraId) {
    errors.push('normalizeForRFEval did not preserve infraId for selected-station flow');
  }

  if (typeof document !== 'undefined') {
    const launchAltDefault = parseFloat(document.getElementById('lto-alt')?.value ?? '');
    const launchIncDefault = parseFloat(document.getElementById('lto-inc')?.value ?? '');
    const launchPayloadDefault = parseFloat(document.getElementById('lto-payload')?.value ?? '');
    if (!Number.isFinite(launchAltDefault) || !Number.isFinite(launchIncDefault) || !Number.isFinite(launchPayloadDefault)) {
      errors.push('Launch planner default inputs are missing (alt/inc/payload)');
    }

    const stationAltDefault = parseFloat(document.getElementById('st-alt')?.value ?? '');
    const stationIncDefault = parseFloat(document.getElementById('st-inc')?.value ?? '');
    if (!Number.isFinite(stationAltDefault) || !Number.isFinite(stationIncDefault)) {
      errors.push('RF station-comparison default inputs are missing (alt/inc)');
    }
  }

  const totalChecks = requiredIds.length + behavioralCheckCount;
  const failed = errors.length;
  return {
    pass: failed === 0,
    total: totalChecks,
    passed: totalChecks - failed,
    failed,
    errors,
  };
}

/**
 * Lightweight RF integration smoke checks for infrastructure-selected stations.
 *
 * @returns {ValidationResult}
 */
export function runRfIntegrationSmokeChecks() {
  const errors = [];
  const selected = normalizeForRFEval(GROUND_STATIONS[0], { band: 'X' });
  const stations = loadStations([selected]);
  const ranked = rankStations(stations, {
    orbitAlt_km: 550,
    inclination_deg: 53,
    band: selected.band,
    weatherPreset: 'clear_sky',
    optimizationMode: 'highest_margin',
  });
  if (!Array.isArray(ranked) || ranked.length !== 1) {
    errors.push('RF ranking did not return exactly one ranked station for selected-station flow');
  }
  const score = ranked[0]?.score;
  if (!Number.isFinite(score)) {
    errors.push('RF ranking returned non-finite station score');
  }
  if (ranked[0]?.station?.infraId !== selected.infraId) {
    errors.push('RF ranking did not preserve selected station infraId');
  }

  const totalChecks = 3;
  const failed = errors.length;
  return {
    pass: failed === 0,
    total: totalChecks,
    passed: totalChecks - failed,
    failed,
    errors,
  };
}

/**
 * Lightweight launch/window smoke checks for feasible and infeasible cases.
 *
 * @returns {ValidationResult}
 */
export function runLaunchPlannerSmokeChecks() {
  const errors = [];
  const nowJD = 2_440_587.5 + Date.now() / 86_400_000;

  const feasibleEval = makeLaunchWindowEvaluator({
    site: LAUNCH_SITES[0],
    targetInc_deg: 51.6,
    targetRaan_deg: 40,
    targetAlt_km: 400,
  });
  const feasibleWindows = searchWindows({
    startEpoch: nowJD,
    endEpoch: nowJD + 0.5,
    stepSize_s: 3600,
    evaluator: feasibleEval,
    maxResults: 5,
  }).windows;
  if (!Array.isArray(feasibleWindows) || feasibleWindows.length === 0) {
    errors.push('Launch window search returned no windows for a feasible setup');
  }
  if (!feasibleWindows.some(w => w.feasible === true)) {
    errors.push('Launch window search did not mark any feasible windows for feasible setup');
  }

  const infeasibleEval = makeLaunchWindowEvaluator({
    site: LAUNCH_SITES.find(s => Number(s.lat_deg) > 60) || LAUNCH_SITES[0],
    targetInc_deg: 10,
    targetRaan_deg: 30,
    targetAlt_km: 400,
  });
  const infeasibleWindows = searchWindows({
    startEpoch: nowJD,
    endEpoch: nowJD + 0.25,
    stepSize_s: 3600,
    evaluator: infeasibleEval,
    maxResults: 4,
  }).windows;
  if (!infeasibleWindows.every(w => w.feasible === false)) {
    errors.push('Infeasible launch setup produced feasible windows unexpectedly');
  }
  if (!infeasibleWindows.every(w => typeof w.reason === 'string' && w.reason.length > 0)) {
    errors.push('Infeasible launch windows are missing explanatory reason strings');
  }

  const totalChecks = 4;
  const failed = errors.length;
  return {
    pass: failed === 0,
    total: totalChecks,
    passed: totalChecks - failed,
    failed,
    errors,
  };
}

/**
 * Scenario import/export round-trip checks for infrastructure/RF/launch branches.
 *
 * @returns {ValidationResult}
 */
export function runScenarioRoundTripChecks() {
  const errors = [];
  const scenario = mergeScenarioUpdates(createEmptyScenario(), {
    selectedObjects: ['sat-25544'],
    layers: { infraGroundStations: true, launchSites: false },
    warnings: ['demo warning'],
    precisionLabels: { trackedObjects: 'Simplified educational approximation' },
    infrastructureDataRefs: { selectedStationId: 'GS-GOL', selectedLaunchSiteId: 'LS-CC' },
    infrastructure: {
      selectedStation: normalizeForRFEval(GROUND_STATIONS[0], { band: 'X' }),
      selectedLaunchSite: LAUNCH_SITES[0],
    },
    rfScenario: { selectedBand: 'X' },
    links: [{ label: 'L1', margin_dB: 3.2 }],
    networkRoutes: [{ name: 'Direct', score: 0.9 }],
    groundStationRecommendations: [{ id: 'GS-GOL', name: 'Goldstone', lat_deg: 35.4, lon_deg: -116.8, score: 0.9 }],
    launchScenario: { launchToOrbit: { feasible: true } },
    launchWindows: [{ rank: 1, epochISO: '2026-01-01T00:00:00Z' }],
    launchSolutions: [{ site: 'LS-CC', precisionLabel: 'Simplified engineering approximation' }],
    trackedObjectResults: [{ satNumber: 25544, x_eci: 1, y_eci: 2, z_eci: 3 }],
  });
  const roundTrip = scenarioFromJSON(scenarioToJSON(scenario));
  const checks = [
    ['selectedObjects', Array.isArray(roundTrip.selectedObjects) && roundTrip.selectedObjects[0] === 'sat-25544'],
    ['layers', roundTrip.layers?.infraGroundStations === true],
    ['warnings', Array.isArray(roundTrip.warnings) && roundTrip.warnings.length === 1],
    ['precisionLabels', roundTrip.precisionLabels?.trackedObjects != null],
    ['infrastructureDataRefs', roundTrip.infrastructureDataRefs?.selectedStationId === 'GS-GOL'],
    ['rfScenario', roundTrip.rfScenario?.selectedBand === 'X'],
    ['links', Array.isArray(roundTrip.links) && roundTrip.links.length === 1],
    ['networkRoutes', Array.isArray(roundTrip.networkRoutes) && roundTrip.networkRoutes.length === 1],
    ['groundStationRecommendations', Array.isArray(roundTrip.groundStationRecommendations) && roundTrip.groundStationRecommendations.length === 1],
    ['launch windows/solutions', Array.isArray(roundTrip.launchWindows) && Array.isArray(roundTrip.launchSolutions)],
    ['trackedObjectResults', Array.isArray(roundTrip.trackedObjectResults) && roundTrip.trackedObjectResults.length === 1],
  ];
  checks.forEach(([label, ok]) => {
    if (!ok) errors.push(`Scenario round-trip failed branch: ${label}`);
  });

  const totalChecks = checks.length;
  const failed = errors.length;
  return {
    pass: failed === 0,
    total: totalChecks,
    passed: totalChecks - failed,
    failed,
    errors,
  };
}

/**
 * Render validation results into a DOM element.
 *
 * @param {HTMLElement} container  Target element for the results HTML.
 * @returns {ValidationResult}
 */
export function renderValidationResults(container) {
  const infraResult = runInfrastructureSmokeChecks();
  const uiResult = runUiSmokeChecks();
  const rfResult = runRfIntegrationSmokeChecks();
  const launchResult = runLaunchPlannerSmokeChecks();
  const scenarioResult = runScenarioRoundTripChecks();
  const result = {
    pass: infraResult.pass && uiResult.pass && rfResult.pass && launchResult.pass && scenarioResult.pass,
    total: infraResult.total + uiResult.total + rfResult.total + launchResult.total + scenarioResult.total,
    passed: infraResult.passed + uiResult.passed + rfResult.passed + launchResult.passed + scenarioResult.passed,
    failed: infraResult.failed + uiResult.failed + rfResult.failed + launchResult.failed + scenarioResult.failed,
    errors: [...infraResult.errors, ...uiResult.errors, ...rfResult.errors, ...launchResult.errors, ...scenarioResult.errors],
  };

  let html = `<div class="card"><div class="card-title">Infrastructure Validation</div>`;
  html += `<div class="infra-inspector-row">
    <span class="infra-inspector-label">Status</span>
    <span class="infra-inspector-value">
      <span class="conf-badge ${result.pass ? 'conf-high' : 'conf-low'}">
        ${result.pass ? 'PASS' : 'FAIL'}
      </span>
      ${result.passed}/${result.total} checks passed
    </span>
  </div>`;

  html += `<div class="infra-inspector-row">
    <span class="infra-inspector-label">Infrastructure Checks</span>
    <span class="infra-inspector-value">${infraResult.passed}/${infraResult.total}</span>
  </div>`;
  html += `<div class="infra-inspector-row">
    <span class="infra-inspector-label">UI Smoke Checks</span>
    <span class="infra-inspector-value">${uiResult.passed}/${uiResult.total}</span>
  </div>`;
  html += `<div class="infra-inspector-row">
    <span class="infra-inspector-label">RF Integration Checks</span>
    <span class="infra-inspector-value">${rfResult.passed}/${rfResult.total}</span>
  </div>`;
  html += `<div class="infra-inspector-row">
    <span class="infra-inspector-label">Launch Planner Checks</span>
    <span class="infra-inspector-value">${launchResult.passed}/${launchResult.total}</span>
  </div>`;
  html += `<div class="infra-inspector-row">
    <span class="infra-inspector-label">Scenario Round-Trip Checks</span>
    <span class="infra-inspector-value">${scenarioResult.passed}/${scenarioResult.total}</span>
  </div>`;

  if (result.errors.length > 0) {
    html += `<div style="margin-top:8px;font-size:var(--fs-sm)">`;
    for (const err of result.errors) {
      html += `<div style="color:var(--col-err);padding:2px 0">⚠ ${err}</div>`;
    }
    html += `</div>`;
  } else {
    html += `<div style="color:var(--col-ok);font-size:var(--fs-sm);margin-top:6px">
      All seed data records pass schema and behavioral checks.
    </div>`;
  }

  html += `</div>`;
  container.innerHTML = html;
  return result;
}
