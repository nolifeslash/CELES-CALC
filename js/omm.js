/**
 * @file omm.js
 * @module omm
 * @description Orbit Mean-Elements Message (OMM) JSON/CSV parsing, validation,
 * and conversion for CELES-CALC.
 *
 * OMM is the CCSDS standard alternative to Two-Line Elements (TLEs).
 * CelesTrak provides GP data in OMM/JSON format via its GP Data API.
 *
 * ⚠ ACCURACY NOTE — Two-body propagation only.
 *   This module does NOT implement SGP4/SDP4. OMM records are converted to the
 *   same internal format used by tle.js and propagated using simple Keplerian
 *   (two-body) mechanics, which accumulates errors of tens of kilometres per
 *   day for low-Earth-orbit satellites. Use a proper SGP4 library for
 *   operational tracking.
 */

import {
  GM_EARTH,
  PI,
} from './constants.js';

// ─── Internal helpers ─────────────────────────────────────────────────────────

const TWO_PI = 2 * PI;
const SEC_PER_DAY = 86_400;

/**
 * Required OMM fields and their expected JS types.
 * Used by {@link validateOMM}.
 */
const REQUIRED_FIELDS = [
  ['OBJECT_NAME',        'string'],
  ['OBJECT_ID',          'string'],
  ['EPOCH',              'string'],
  ['MEAN_MOTION',        'number'],
  ['ECCENTRICITY',       'number'],
  ['INCLINATION',        'number'],
  ['RA_OF_ASC_NODE',     'number'],
  ['ARG_OF_PERICENTER',  'number'],
  ['MEAN_ANOMALY',       'number'],
  ['NORAD_CAT_ID',       'number'],
  ['BSTAR',              'number'],
];

/**
 * Convert an ISO-8601 epoch string to a Julian Date (UTC).
 * Handles the typical CelesTrak format "YYYY-MM-DDThh:mm:ss.ffffff".
 *
 * @param {string} isoEpoch - ISO-8601 date-time string.
 * @returns {number} Julian Date.
 */
function isoEpochToJD(isoEpoch) {
  const d = new Date(isoEpoch);
  // JD = Unix-ms / 86400000 + 2440587.5  (JD of Unix epoch)
  return d.getTime() / 86_400_000 + 2_440_587.5;
}

/**
 * Convert an ISO-8601 epoch to TLE-style epoch components (2-digit year and
 * fractional day-of-year).
 *
 * @param {string} isoEpoch - ISO-8601 date-time string.
 * @returns {{epochYear: number, epochDay: number}}
 */
function isoEpochToTLEComponents(isoEpoch) {
  const d = new Date(isoEpoch);
  const fullYear = d.getUTCFullYear();
  const epochYear = fullYear % 100;

  // Day-of-year: Jan 1 = day 1
  const jan1 = Date.UTC(fullYear, 0, 1);
  const epochDay = 1 + (d.getTime() - jan1) / 86_400_000;

  return { epochYear, epochDay };
}

// ─── OMM Sources ──────────────────────────────────────────────────────────────

/**
 * OMM source URLs for fetching from CelesTrak in JSON format.
 */
export const OMM_SOURCES = {
  iss:      { url: 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=json', label: 'ISS (ZARYA)' },
  stations: { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json', label: 'Space Stations' },
  active:   { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json', label: 'Active Satellites' },
  gps:      { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=gps-ops&FORMAT=json', label: 'GPS Operational' },
  starlink: { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=json', label: 'Starlink' },
  weather:  { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=weather&FORMAT=json', label: 'Weather' },
  geo:      { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=geo&FORMAT=json', label: 'Geostationary' },
};

// ─── OMM Validation ───────────────────────────────────────────────────────────

/**
 * Validate a single OMM JSON object.
 * Checks presence and type of required fields and basic range constraints.
 *
 * @param {object} ommObj - A single OMM record (plain JS object).
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateOMM(ommObj) {
  const errors = [];

  if (ommObj == null || typeof ommObj !== 'object') {
    errors.push('OMM record must be a non-null object.');
    return { valid: false, errors };
  }

  // Required field presence and type
  for (const [field, expectedType] of REQUIRED_FIELDS) {
    if (!(field in ommObj)) {
      errors.push(`Missing required field "${field}".`);
    } else if (typeof ommObj[field] !== expectedType) {
      errors.push(`Field "${field}" must be of type ${expectedType} (got ${typeof ommObj[field]}).`);
    }
  }

  // Epoch must be parseable
  if (typeof ommObj.EPOCH === 'string') {
    const d = new Date(ommObj.EPOCH);
    if (isNaN(d.getTime())) errors.push('EPOCH is not a valid ISO-8601 date-time string.');
  }

  // Range checks (only if fields are present and numeric)
  if (typeof ommObj.MEAN_MOTION === 'number' && ommObj.MEAN_MOTION <= 0) {
    errors.push('MEAN_MOTION must be a positive number (rev/day).');
  }
  if (typeof ommObj.ECCENTRICITY === 'number' && (ommObj.ECCENTRICITY < 0 || ommObj.ECCENTRICITY >= 1)) {
    errors.push('ECCENTRICITY must be in [0, 1).');
  }
  if (typeof ommObj.INCLINATION === 'number' && (ommObj.INCLINATION < 0 || ommObj.INCLINATION > 180)) {
    errors.push('INCLINATION must be in [0°, 180°].');
  }

  return { valid: errors.length === 0, errors };
}

// ─── OMM Parsing ──────────────────────────────────────────────────────────────

/**
 * Parse a single OMM JSON object (as received from the CelesTrak GP Data API)
 * into a normalized tracked-object descriptor.
 *
 * ⚠ APPROXIMATE OMM INTERPRETATION — NOT SGP4.
 *   The descriptor is suitable for simplified two-body propagation only.
 *
 * @param {object} json - A single OMM record from CelesTrak.
 * @returns {{
 *   sourceType:           string,
 *   propagationModel:     string,
 *   modelBadge:           string,
 *   objectName:           string,
 *   objectId:             string,
 *   noradCatId:           number,
 *   epoch:                string,
 *   epochJD:              number,
 *   inclination_deg:      number,
 *   raan_deg:             number,
 *   eccentricity:         number,
 *   argPerigee_deg:       number,
 *   meanAnomaly_deg:      number,
 *   meanMotion_revPerDay: number,
 *   bstar:                number,
 *   classification:       string,
 *   semiMajorAxis_km:     number,
 *   period_min:           number,
 * }}
 */
export function parseOMMJSON(json) {
  const epochJD = isoEpochToJD(json.EPOCH);

  // Derive semi-major axis from mean motion via Kepler's third law
  const n_rad_s = (json.MEAN_MOTION * TWO_PI) / SEC_PER_DAY;
  const a_m = Math.cbrt(GM_EARTH / (n_rad_s * n_rad_s));
  const semiMajorAxis_km = a_m / 1_000;

  // Orbital period [min]
  const period_min = (TWO_PI / n_rad_s) / 60;

  return {
    sourceType:           'OMM',
    propagationModel:     'Keplerian (two-body)',
    modelBadge:           '⚠ Approximate OMM interpretation — not SGP4',
    objectName:           json.OBJECT_NAME   ?? '',
    objectId:             json.OBJECT_ID     ?? '',
    noradCatId:           json.NORAD_CAT_ID  ?? 0,
    epoch:                json.EPOCH         ?? '',
    epochJD,
    inclination_deg:      json.INCLINATION        ?? 0,
    raan_deg:             json.RA_OF_ASC_NODE     ?? 0,
    eccentricity:         json.ECCENTRICITY       ?? 0,
    argPerigee_deg:       json.ARG_OF_PERICENTER  ?? 0,
    meanAnomaly_deg:      json.MEAN_ANOMALY       ?? 0,
    meanMotion_revPerDay: json.MEAN_MOTION        ?? 0,
    bstar:                json.BSTAR              ?? 0,
    classification:       json.CLASSIFICATION_TYPE ?? 'U',
    semiMajorAxis_km,
    period_min,
  };
}

/**
 * Parse an array of OMM JSON objects (batch response from CelesTrak).
 *
 * @param {object[]} jsonArray - Array of OMM records.
 * @returns {Array<ReturnType<typeof parseOMMJSON>>}
 */
export function parseOMMBatch(jsonArray) {
  if (!Array.isArray(jsonArray)) {
    throw new TypeError('parseOMMBatch expects an array of OMM objects.');
  }
  return jsonArray.map(parseOMMJSON);
}

// ─── OMM → TLE-equivalent conversion ─────────────────────────────────────────

/**
 * Convert an OMM record to the same format that {@link parseTLE} in tle.js
 * returns, so that the existing {@link propagateOrbitSimple} can be used
 * directly.
 *
 * Fields not directly present in OMM (e.g. element-set number, line numbers,
 * checksums) are filled with sensible defaults.
 *
 * ⚠ This is an approximate structural mapping, not a byte-accurate TLE
 *   reconstruction.
 *
 * @param {object} ommRecord - A single OMM JSON object (CelesTrak format).
 * @returns {{
 *   lineNumber1:             number,
 *   satNumber:               number,
 *   classification:          string,
 *   intlDesignatorYear:      string,
 *   intlDesignatorLaunchNum: string,
 *   intlDesignatorPiece:     string,
 *   epochYear:               number,
 *   epochDay:                number,
 *   epochJD:                 number,
 *   firstDerivMeanMotion:    number,
 *   secondDerivMeanMotion:   number,
 *   bstar:                   number,
 *   ephemerisType:           number,
 *   elementSetNum:           number,
 *   checksum1:               number,
 *   lineNumber2:             number,
 *   inclination_deg:         number,
 *   raan_deg:                number,
 *   eccentricity:            number,
 *   argPerigee_deg:          number,
 *   meanAnomaly_deg:         number,
 *   meanMotion_revPerDay:    number,
 *   revNumAtEpoch:           number,
 *   checksum2:               number,
 * }}
 */
export function ommToTLEEquivalent(ommRecord) {
  const epochJD = isoEpochToJD(ommRecord.EPOCH);
  const { epochYear, epochDay } = isoEpochToTLEComponents(ommRecord.EPOCH);

  // Parse COSPAR ID (OBJECT_ID) into TLE international designator components
  // Format: "YYYY-NNNP" → year (2-digit), launch number, piece
  const cospar = (ommRecord.OBJECT_ID ?? '').trim();
  let intlDesignatorYear = '';
  let intlDesignatorLaunchNum = '';
  let intlDesignatorPiece = '';
  const cosparMatch = cospar.match(/^(\d{4})-(\d{3})(\S*)$/);
  if (cosparMatch) {
    intlDesignatorYear      = cosparMatch[1].slice(2);
    intlDesignatorLaunchNum = cosparMatch[2];
    intlDesignatorPiece     = cosparMatch[3] || 'A';
  }

  return {
    lineNumber1:             1,
    satNumber:               ommRecord.NORAD_CAT_ID   ?? 0,
    classification:          ommRecord.CLASSIFICATION_TYPE ?? 'U',
    intlDesignatorYear,
    intlDesignatorLaunchNum,
    intlDesignatorPiece,
    epochYear,
    epochDay,
    epochJD,
    firstDerivMeanMotion:    ommRecord.MEAN_MOTION_DOT  ?? 0,
    secondDerivMeanMotion:   ommRecord.MEAN_MOTION_DDOT ?? 0,
    bstar:                   ommRecord.BSTAR            ?? 0,
    ephemerisType:           ommRecord.EPHEMERIS_TYPE   ?? 0,
    elementSetNum:           ommRecord.ELEMENT_SET_NO   ?? 0,
    checksum1:               0,
    lineNumber2:             2,
    inclination_deg:         ommRecord.INCLINATION       ?? 0,
    raan_deg:                ommRecord.RA_OF_ASC_NODE    ?? 0,
    eccentricity:            ommRecord.ECCENTRICITY      ?? 0,
    argPerigee_deg:          ommRecord.ARG_OF_PERICENTER ?? 0,
    meanAnomaly_deg:         ommRecord.MEAN_ANOMALY      ?? 0,
    meanMotion_revPerDay:    ommRecord.MEAN_MOTION       ?? 0,
    revNumAtEpoch:           ommRecord.REV_AT_EPOCH      ?? 0,
    checksum2:               0,
  };
}

// ─── OMM Fetching ─────────────────────────────────────────────────────────────

/**
 * Fetch OMM JSON data from a URL and parse the response.
 * Expects the response to be a JSON array of OMM objects (CelesTrak format).
 *
 * @param {string} url - URL to fetch OMM JSON from.
 * @returns {Promise<Array<ReturnType<typeof parseOMMJSON>>>} Parsed OMM descriptors.
 */
export async function fetchOMMFromURL(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  const data = await response.json();
  const records = Array.isArray(data) ? data : [data];
  return parseOMMBatch(records);
}
