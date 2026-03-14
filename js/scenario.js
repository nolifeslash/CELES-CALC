/**
 * @file scenario.js
 * @module scenario
 * @description Scenario state model for CELES-CALC.
 *
 * A "scenario" is a self-contained snapshot of all user inputs and computed
 * results for a single calculation session. It can be serialised to / from
 * JSON and shared across browser tabs via sync.js.
 *
 * Schema version: '2.0'
 */

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a new, empty scenario with all required fields initialised to their
 * zero / default states.
 *
 * @returns {ScenarioObject} A fresh scenario with version '2.0'.
 */
export function createEmptyScenario() {
  return {
    version:   '2.0',
    timestamp: new Date().toISOString(),
    sourceModule: '',

    timeInput: {
      utc:  '',
      jd:   0,
      unix: 0,
    },

    timeSystems: {
      // Populated by buildScenarioState → utcToAllSystems()
      utcISO:      '',
      jd:          0,
      mjd:         0,
      unixMs:      0,
      leapSeconds: 0,
      taiJd:       0,
      ttJd:        0,
      gpsWeek:     0,
      gpsTOW:      0,
      gpsSeconds:  0,
    },

    bodies: {
      earth: {
        subsolarLat_deg: null,
        subsolarLon_deg: null,
      },
      moon: {
        positionECI:       null,   // {x, y, z} metres
        distance_km:       null,
        phase_deg:         null,
        illuminatedFrac:   null,
        sublunarLat_deg:   null,
        sublunarLon_deg:   null,
      },
      sun: {
        directionECI:   null,   // unit vector
        distance_AU:    null,
      },
    },

    observers:  [],   // Array of observer objects (see _validateObserver)
    targets:    [],   // Array of target objects

    coordinateInputs:     {},
    convertedCoordinates: {},

    illuminationResults:  [],
    visibilityResults:    [],
    orbitResults:         {},
    trackedObjectResults: [],
    distanceResults:      {},
    gridResults:          {},
    selectedObjects:      [],
    layers:               {},

    settings: {
      precision:    'standard',   // 'standard' | 'high'
      units:        'metric',     // 'metric' | 'imperial' | 'nautical'
      darkMode:     true,
      cellSize_deg: 5,
    },

    notes:           '',
    warnings:        [],
    precisionLabels: {},

    // ── SATCOM / RF extension ───────────────────────────────────────────────
    rfScenario:                  {},
    links:                       [],
    networkRoutes:               [],
    interferenceResults:         {},
    jammingResults:              {},
    sigintResults:               {},
    groundStationRecommendations: [],

    // ── Launch / Transfer extension ─────────────────────────────────────────
    launchScenario:    {},
    launchWindows:     [],
    launchSolutions:   [],
    rpoPlans:          [],
    transferPlans:     [],
    missionLegs:       [],
    deltaVBudget:      {},
    infrastructureDataRefs: {},
    infrastructure: {
      selectedStation: null,
      selectedLaunchSite: null,
    },
  };
}

// ─── Builder ──────────────────────────────────────────────────────────────────

/**
 * Build a full scenario state object from a flat inputs bag.
 *
 * @param {object} inputs
 * @param {string|Date|number} [inputs.utc]       - UTC date (ISO string, Date, or Unix ms).
 * @param {object[]}           [inputs.observers] - Array of observer descriptors.
 * @param {object[]}           [inputs.targets]   - Array of target descriptors.
 * @param {object}             [inputs.settings]  - Settings overrides.
 * @param {string}             [inputs.notes]     - Free-text notes.
 * @param {string}             [inputs.sourceModule]      - Which module last updated scenario.
 * @param {string[]}           [inputs.selectedObjects]   - Shared selection state for visualizer.
 * @param {object}             [inputs.layers]            - Layer toggle state.
 * @param {string[]}           [inputs.warnings]          - Runtime warnings/accuracy notes.
 * @param {object}             [inputs.precisionLabels]   - Per-result precision tier labels.
 * @returns {ScenarioObject} Populated scenario object.
 */
export function buildScenarioState(inputs = {}) {
  const scenario = createEmptyScenario();
  scenario.timestamp = new Date().toISOString();

  // ── Time ───────────────────────────────────────────────────────────────────
  let dateInput = inputs.utc ?? inputs.date ?? new Date();
  if (typeof dateInput === 'string' && dateInput.trim() === '') dateInput = new Date();
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);

  // Inline time conversion (avoids a circular dep on time.js at this layer)
  const unixMs   = d.getTime();
  const jd       = 2_440_587.5 + unixMs / 86_400_000;
  const mjd      = jd - 2_400_000.5;

  // Approximate leap-seconds lookup (covers years 1972–2017+)
  const leapTable = [
    ['1972-01-01', 10], ['1972-07-01', 11], ['1973-01-01', 12],
    ['1974-01-01', 13], ['1975-01-01', 14], ['1976-01-01', 15],
    ['1977-01-01', 16], ['1978-01-01', 17], ['1979-01-01', 18],
    ['1980-01-01', 19], ['1981-07-01', 20], ['1982-07-01', 21],
    ['1983-07-01', 22], ['1985-07-01', 23], ['1988-01-01', 24],
    ['1990-01-01', 25], ['1991-01-01', 26], ['1992-07-01', 27],
    ['1993-07-01', 28], ['1994-07-01', 29], ['1996-01-01', 30],
    ['1997-07-01', 31], ['1999-01-01', 32], ['2006-01-01', 33],
    ['2009-01-01', 34], ['2012-07-01', 35], ['2015-07-01', 36],
    ['2017-01-01', 37],
  ];
  const isoDate   = d.toISOString().slice(0, 10);
  let leapSeconds = 10;
  for (const [date, offset] of leapTable) {
    if (isoDate >= date) leapSeconds = offset;
  }
  const taiJd     = jd + leapSeconds / 86_400;
  const ttJd      = taiJd + 32.184 / 86_400;
  const gpsSeconds = (jd - 2_444_244.5) * 86_400 - (leapSeconds - 19);
  const gpsWeek    = Math.max(0, Math.floor(gpsSeconds / 604_800));
  const gpsTOW     = Math.max(0, gpsSeconds - gpsWeek * 604_800);

  scenario.timeInput = { utc: d.toISOString(), jd, unix: unixMs };

  scenario.timeSystems = {
    utcISO:      d.toISOString(),
    jd,  mjd,
    unixMs,
    leapSeconds,
    taiJd, ttJd,
    gpsWeek, gpsTOW, gpsSeconds,
  };

  // ── Observers / targets ────────────────────────────────────────────────────
  if (Array.isArray(inputs.observers)) {
    scenario.observers = inputs.observers.map(_normaliseObserver);
  }
  if (Array.isArray(inputs.targets)) {
    scenario.targets = inputs.targets.map(_normaliseTarget);
  }

  // ── Coordinate inputs ──────────────────────────────────────────────────────
  if (inputs.coordinateInputs) {
    scenario.coordinateInputs = { ...inputs.coordinateInputs };
  }

  // ── Settings ───────────────────────────────────────────────────────────────
  if (inputs.settings) {
    scenario.settings = { ...scenario.settings, ...inputs.settings };
  }

  // ── Notes ──────────────────────────────────────────────────────────────────
  if (typeof inputs.notes === 'string') {
    scenario.notes = inputs.notes;
  }

  // ── New v2.0 fields ───────────────────────────────────────────────────────
  if (typeof inputs.sourceModule === 'string') {
    scenario.sourceModule = inputs.sourceModule;
  }
  if (Array.isArray(inputs.selectedObjects)) {
    scenario.selectedObjects = [...inputs.selectedObjects];
  }
  if (inputs.layers && typeof inputs.layers === 'object') {
    scenario.layers = { ...inputs.layers };
  }
  if (Array.isArray(inputs.warnings)) {
    scenario.warnings = [...inputs.warnings];
  }
  if (inputs.precisionLabels && typeof inputs.precisionLabels === 'object') {
    scenario.precisionLabels = { ...inputs.precisionLabels };
  }
  if (inputs.infrastructure && typeof inputs.infrastructure === 'object') {
    scenario.infrastructure = {
      ...scenario.infrastructure,
      ...inputs.infrastructure,
    };
  }

  return scenario;
}

/**
 * Normalise / fill defaults for an observer descriptor.
 *
 * The spread `...obs` is placed FIRST so that the explicit normalised
 * property assignments that follow it always override whatever raw
 * (possibly `undefined`) values the caller passed in.  In JavaScript
 * the last definition of a key in an object literal wins, so:
 *
 *   { ...obs, lat_deg: obs.lat_deg ?? obs.lat ?? 0 }
 *
 * ensures `lat_deg` is always the coalesced value even when
 * `obs.lat_deg` is explicitly `undefined` or the key is absent.
 * Placing the spread last (original bug) would have allowed explicit
 * `undefined` values in `obs` to silently override the coalesced
 * default.  Extra unknown properties from `obs` are still preserved.
 *
 * @param {object} obs
 * @returns {object}
 */
function _normaliseObserver(obs) {
  return {
    ...obs,
    type:    obs.type    ?? 'earth_surface',
    label:   obs.label   ?? '',
    lat_deg: obs.lat_deg ?? obs.lat ?? 0,
    lon_deg: obs.lon_deg ?? obs.lon ?? 0,
    alt_m:   obs.alt_m   ?? obs.alt ?? 0,
    x_eci:   obs.x_eci   ?? null,
    y_eci:   obs.y_eci   ?? null,
    z_eci:   obs.z_eci   ?? null,
  };
}

/**
 * Normalise / fill defaults for a target descriptor.
 *
 * Same spread-first convention as {@link _normaliseObserver} — see that
 * function's documentation for the reasoning.
 *
 * @param {object} tgt
 * @returns {object}
 */
function _normaliseTarget(tgt) {
  return {
    ...tgt,
    type:    tgt.type    ?? 'earth_point',
    label:   tgt.label   ?? '',
    lat_deg: tgt.lat_deg ?? tgt.lat ?? 0,
    lon_deg: tgt.lon_deg ?? tgt.lon ?? 0,
    alt_m:   tgt.alt_m   ?? tgt.alt ?? 0,
    x_eci:   tgt.x_eci   ?? null,
    y_eci:   tgt.y_eci   ?? null,
    z_eci:   tgt.z_eci   ?? null,
  };
}

// ─── Migration ────────────────────────────────────────────────────────────────

/**
 * Migrate a scenario object to version '2.0'.
 *
 * - If version is '1.0' or missing, upgrades to '2.0'.
 * - Moves `tleResults` → `trackedObjectResults` when present.
 * - Fills any missing v2.0 fields with their defaults.
 * - Already-v2.0 scenarios are returned with defaults filled in for any
 *   absent keys (defensive back-fill).
 *
 * @param {object} scenario - Scenario object (any version).
 * @returns {object} A valid v2.0 scenario (new object; input is not mutated).
 */
export function migrateScenario(scenario) {
  const inputScenario = (scenario && typeof scenario === 'object') ? scenario : {};
  const base = createEmptyScenario();
  const migrated = mergeScenarioUpdates(base, inputScenario);

  // ── tleResults → trackedObjectResults ──────────────────────────────────────
  if (inputScenario.tleResults != null && inputScenario.tleResults !== undefined) {
    const tleData = inputScenario.tleResults;
    if (Array.isArray(tleData)) {
      migrated.trackedObjectResults = tleData;
    } else if (tleData && typeof tleData === 'object') {
      migrated.trackedObjectResults = Object.values(tleData);
    }
    // Non-object/non-array tleData (e.g. string, number) is silently dropped
    delete migrated.tleResults;
  } else if (inputScenario.tleResults === null) {
    delete migrated.tleResults;
  }

  // Stamp version
  migrated.version = '2.0';
  const arrayFields = [
    'observers', 'targets', 'illuminationResults', 'visibilityResults',
    'trackedObjectResults', 'selectedObjects', 'warnings', 'links',
    'networkRoutes', 'groundStationRecommendations', 'launchWindows',
    'launchSolutions', 'rpoPlans', 'transferPlans', 'missionLegs',
  ];
  arrayFields.forEach(key => {
    if (!Array.isArray(migrated[key])) migrated[key] = [...base[key]];
  });

  const objectFields = [
    'timeInput', 'timeSystems', 'bodies', 'coordinateInputs', 'convertedCoordinates',
    'orbitResults', 'distanceResults', 'gridResults', 'layers', 'settings',
    'precisionLabels', 'rfScenario', 'launchScenario', 'deltaVBudget',
    'infrastructureDataRefs', 'interferenceResults',
    'jammingResults', 'sigintResults',
  ];
  objectFields.forEach(key => {
    if (!migrated[key] || typeof migrated[key] !== 'object' || Array.isArray(migrated[key])) {
      migrated[key] = { ...base[key] };
    }
  });
  if (!migrated.infrastructure || typeof migrated.infrastructure !== 'object' || Array.isArray(migrated.infrastructure)) {
    migrated.infrastructure = { ...base.infrastructure };
  } else {
    migrated.infrastructure = {
      selectedStation: migrated.infrastructure.selectedStation ?? null,
      selectedLaunchSite: migrated.infrastructure.selectedLaunchSite ?? null,
    };
  }

  return migrated;
}

// ─── Validation ───────────────────────────────────────────────────────────────

const VALID_OBSERVER_TYPES = ['earth_surface', 'moon_surface', 'spacecraft'];
const VALID_TARGET_TYPES   = ['earth_point', 'moon_point', 'spacecraft', 'sun',
  'earth_from_moon', 'moon_from_earth'];
const VALID_PRECISIONS = ['standard', 'high'];
const VALID_UNITS      = ['metric', 'imperial', 'nautical'];

/**
 * Validate a scenario object against expected schema.
 *
 * @param {object} scenario - Scenario to validate.
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateScenario(scenario) {
  const errors = [];

  if (!scenario || typeof scenario !== 'object') {
    return { valid: false, errors: ['Scenario must be an object.'] };
  }

  if (scenario.version !== '2.0' && scenario.version !== '1.0') {
    errors.push(`Unsupported scenario version: "${scenario.version}". Expected "2.0".`);
  }
  if (scenario.version === '1.0') {
    errors.push('Scenario uses version "1.0". Consider migrating to "2.0" via migrateScenario().');
  } else if (!scenario.version) {
    errors.push('Scenario version is missing. Consider migrating to "2.0" via migrateScenario().');
  }

  // Time
  if (typeof scenario.timeInput?.jd !== 'number' || !isFinite(scenario.timeInput.jd)) {
    errors.push('timeInput.jd must be a finite number.');
  }

  // Observers
  if (!Array.isArray(scenario.observers)) {
    errors.push('scenario.observers must be an array.');
  } else {
    scenario.observers.forEach((obs, i) => {
      if (!VALID_OBSERVER_TYPES.includes(obs.type)) {
        errors.push(`observers[${i}].type "${obs.type}" is not valid.`);
      }
    });
  }

  // Targets
  if (!Array.isArray(scenario.targets)) {
    errors.push('scenario.targets must be an array.');
  } else {
    scenario.targets.forEach((tgt, i) => {
      if (!VALID_TARGET_TYPES.includes(tgt.type)) {
        errors.push(`targets[${i}].type "${tgt.type}" is not valid.`);
      }
    });
  }

  // Settings
  if (scenario.settings) {
    if (!VALID_PRECISIONS.includes(scenario.settings.precision)) {
      errors.push(`settings.precision "${scenario.settings.precision}" is not valid.`);
    }
    if (!VALID_UNITS.includes(scenario.settings.units)) {
      errors.push(`settings.units "${scenario.settings.units}" is not valid.`);
    }
    if (typeof scenario.settings.cellSize_deg !== 'number' ||
        scenario.settings.cellSize_deg <= 0) {
      errors.push('settings.cellSize_deg must be a positive number.');
    }
  }

  // ── SATCOM / RF arrays ────────────────────────────────────────────────────
  const rfArrayFields = [
    ['links',                        'scenario.links'],
    ['networkRoutes',                'scenario.networkRoutes'],
    ['groundStationRecommendations', 'scenario.groundStationRecommendations'],
  ];
  for (const [field, label] of rfArrayFields) {
    if (scenario[field] !== undefined && !Array.isArray(scenario[field])) {
      errors.push(`${label} must be an array.`);
    }
  }
  if (scenario.rfScenario !== undefined && typeof scenario.rfScenario !== 'object') {
    errors.push('scenario.rfScenario must be an object.');
  }

  // ── Launch / Transfer arrays ─────────────────────────────────────────────
  const launchArrayFields = [
    ['launchWindows',   'scenario.launchWindows'],
    ['launchSolutions', 'scenario.launchSolutions'],
    ['rpoPlans',        'scenario.rpoPlans'],
    ['transferPlans',   'scenario.transferPlans'],
    ['missionLegs',     'scenario.missionLegs'],
  ];
  for (const [field, label] of launchArrayFields) {
    if (scenario[field] !== undefined && !Array.isArray(scenario[field])) {
      errors.push(`${label} must be an array.`);
    }
  }
  if (scenario.infrastructureDataRefs !== undefined &&
      (typeof scenario.infrastructureDataRefs !== 'object' || scenario.infrastructureDataRefs === null)) {
    errors.push('scenario.infrastructureDataRefs must be an object.');
  }
  if (scenario.infrastructure !== undefined &&
      (typeof scenario.infrastructure !== 'object' || scenario.infrastructure === null)) {
    errors.push('scenario.infrastructure must be an object.');
  }

  return { valid: errors.length === 0, errors };
}

// ─── Merge / update ───────────────────────────────────────────────────────────

/**
 * Produce a new scenario by deep-merging `updates` into `base`.
 * Arrays in `updates` replace (not append to) arrays in `base`.
 * Scalar / object fields in `updates` recursively override `base`.
 *
 * @param {object} base    - Existing scenario.
 * @param {object} updates - Partial scenario updates.
 * @returns {object} New merged scenario (base and updates are not mutated).
 */
export function mergeScenarioUpdates(base, updates) {
  if (!updates || typeof updates !== 'object') return { ...base };
  const result = { ...base };
  for (const key of Object.keys(updates)) {
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') continue;
    const val = updates[key];
    if (Array.isArray(val)) {
      result[key] = [...val];
    } else if (val !== null && typeof val === 'object' && !Array.isArray(base[key])) {
      result[key] = mergeScenarioUpdates(base[key] ?? {}, val);
    } else {
      result[key] = val;
    }
  }
  return result;
}

// ─── Serialisation ────────────────────────────────────────────────────────────

/**
 * Serialise a scenario to a compact JSON string.
 *
 * @param {object} scenario - Scenario to serialise.
 * @returns {string} JSON string.
 */
export function scenarioToJSON(scenario) {
  return JSON.stringify(scenario, null, 2);
}

/**
 * Deserialise a JSON string to a scenario object.
 * Fills in any missing required fields from a fresh empty scenario so that
 * older saved files continue to work after schema additions.
 *
 * @param {string} jsonStr - JSON string.
 * @returns {object} Scenario object.
 * @throws {Error} If the string is not valid JSON.
 */
export function scenarioFromJSON(jsonStr) {
  const parsed = JSON.parse(jsonStr);
  // migrateScenario internally merges into a fresh empty scenario, so pass
  // parsed directly to avoid the double-merge overhead.
  return migrateScenario(parsed);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

/**
 * Return a short human-readable summary of a scenario.
 *
 * @param {object} scenario
 * @returns {string}
 */
export function getScenarioSummary(scenario) {
  const utc = scenario.timeInput?.utc || 'unknown time';
  const obsCount = (scenario.observers?.length ?? 0);
  const tgtCount = (scenario.targets?.length ?? 0);
  const visCount = (scenario.visibilityResults?.length ?? 0);

  // SATCOM / RF counts
  const linkCount   = (scenario.links?.length ?? 0);
  const routeCount  = (scenario.networkRoutes?.length ?? 0);
  const gsRecCount  = (scenario.groundStationRecommendations?.length ?? 0);

  // Launch / Transfer counts
  const launchWinCount = (scenario.launchWindows?.length ?? 0);
  const launchSolCount = (scenario.launchSolutions?.length ?? 0);
  const rpoCount       = (scenario.rpoPlans?.length ?? 0);
  const xferCount      = (scenario.transferPlans?.length ?? 0);
  const legCount       = (scenario.missionLegs?.length ?? 0);

  const parts = [`CELES-CALC Scenario v${scenario.version ?? '?'}`];
  parts.push(`Time: ${utc}`);
  if (obsCount > 0) parts.push(`${obsCount} observer${obsCount !== 1 ? 's' : ''}`);
  if (tgtCount > 0) parts.push(`${tgtCount} target${tgtCount !== 1 ? 's' : ''}`);
  if (visCount > 0) parts.push(`${visCount} visibility result${visCount !== 1 ? 's' : ''}`);

  // SATCOM / RF
  if (linkCount > 0)  parts.push(`${linkCount} link${linkCount !== 1 ? 's' : ''}`);
  if (routeCount > 0) parts.push(`${routeCount} network route${routeCount !== 1 ? 's' : ''}`);
  if (gsRecCount > 0) parts.push(`${gsRecCount} ground station recommendation${gsRecCount !== 1 ? 's' : ''}`);

  // Launch / Transfer
  if (launchWinCount > 0) parts.push(`${launchWinCount} launch window${launchWinCount !== 1 ? 's' : ''}`);
  if (launchSolCount > 0) parts.push(`${launchSolCount} launch solution${launchSolCount !== 1 ? 's' : ''}`);
  if (rpoCount > 0)       parts.push(`${rpoCount} RPO plan${rpoCount !== 1 ? 's' : ''}`);
  if (xferCount > 0)      parts.push(`${xferCount} transfer plan${xferCount !== 1 ? 's' : ''}`);
  if (legCount > 0)       parts.push(`${legCount} mission leg${legCount !== 1 ? 's' : ''}`);

  if (scenario.notes) parts.push(`Notes: ${scenario.notes.slice(0, 80)}`);

  return parts.join(' | ');
}
