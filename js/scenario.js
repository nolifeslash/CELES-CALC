/**
 * @file scenario.js
 * @module scenario
 * @description Scenario state model for CELES-CALC.
 *
 * A "scenario" is a self-contained snapshot of all user inputs and computed
 * results for a single calculation session. It can be serialised to / from
 * JSON and shared across browser tabs via sync.js.
 *
 * Schema version: '1.0'
 */

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a new, empty scenario with all required fields initialised to their
 * zero / default states.
 *
 * @returns {ScenarioObject} A fresh scenario with version '1.0'.
 */
export function createEmptyScenario() {
  return {
    version:   '1.0',
    timestamp: new Date().toISOString(),

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

    visibilityResults:    [],
    illuminationResults:  [],
    orbitResults:         {},
    distanceResults:      {},
    gridResults:          {},
    tleResults:           {},

    settings: {
      precision:    'standard',   // 'standard' | 'high'
      units:        'metric',     // 'metric' | 'imperial' | 'nautical'
      darkMode:     true,
      cellSize_deg: 5,
    },

    notes: '',
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

  return scenario;
}

/**
 * Normalise / fill defaults for an observer descriptor.
 * @param {object} obs
 * @returns {object}
 */
function _normaliseObserver(obs) {
  return {
    type:    obs.type    ?? 'earth_surface',
    label:   obs.label   ?? '',
    lat_deg: obs.lat_deg ?? obs.lat ?? 0,
    lon_deg: obs.lon_deg ?? obs.lon ?? 0,
    alt_m:   obs.alt_m   ?? obs.alt ?? 0,
    x_eci:   obs.x_eci   ?? null,
    y_eci:   obs.y_eci   ?? null,
    z_eci:   obs.z_eci   ?? null,
    ...obs,
  };
}

/**
 * Normalise / fill defaults for a target descriptor.
 * @param {object} tgt
 * @returns {object}
 */
function _normaliseTarget(tgt) {
  return {
    type:    tgt.type    ?? 'earth_point',
    label:   tgt.label   ?? '',
    lat_deg: tgt.lat_deg ?? tgt.lat ?? 0,
    lon_deg: tgt.lon_deg ?? tgt.lon ?? 0,
    alt_m:   tgt.alt_m   ?? tgt.alt ?? 0,
    x_eci:   tgt.x_eci   ?? null,
    y_eci:   tgt.y_eci   ?? null,
    z_eci:   tgt.z_eci   ?? null,
    ...tgt,
  };
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

  if (scenario.version !== '1.0') {
    errors.push(`Unsupported scenario version: "${scenario.version}". Expected "1.0".`);
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
  const base   = createEmptyScenario();
  return mergeScenarioUpdates(base, parsed);
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

  const parts = [`CELES-CALC Scenario v${scenario.version ?? '?'}`];
  parts.push(`Time: ${utc}`);
  if (obsCount > 0) parts.push(`${obsCount} observer${obsCount !== 1 ? 's' : ''}`);
  if (tgtCount > 0) parts.push(`${tgtCount} target${tgtCount !== 1 ? 's' : ''}`);
  if (visCount > 0) parts.push(`${visCount} visibility result${visCount !== 1 ? 's' : ''}`);
  if (scenario.notes) parts.push(`Notes: ${scenario.notes.slice(0, 80)}`);

  return parts.join(' | ');
}
