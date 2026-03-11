/**
 * @file tle.js
 * @module tle
 * @description Two-Line Element (TLE) parsing, validation, and simplified
 * two-body orbit propagation for CELES-CALC.
 *
 * ⚠ ACCURACY NOTE — Two-body propagation only.
 *   This module does NOT implement SGP4/SDP4. It uses simple Keplerian
 *   (two-body) propagation from the TLE epoch, which accumulates errors
 *   of tens of kilometres per day for low-Earth-orbit satellites. Use
 *   a proper SGP4 library for operational tracking.
 *
 * TLE column reference (1-indexed):
 *   Line 1: [1]    line number
 *            [3-7]  satellite number
 *            [8]    classification
 *            [10-17] COSPAR ID (international designator)
 *            [19-32] epoch (year + day-of-year with fractional day)
 *            [34-43] first derivative of mean motion (rev/day²)
 *            [45-52] second derivative of mean motion (rev/day³)
 *            [54-61] BSTAR drag term
 *            [63]    ephemeris type
 *            [65-68] element set number
 *            [69]    checksum
 *   Line 2: [1]    line number
 *            [3-7]  satellite number
 *            [9-16] inclination [deg]
 *            [18-25] RAAN [deg]
 *            [27-33] eccentricity (leading decimal assumed)
 *            [35-42] argument of perigee [deg]
 *            [44-51] mean anomaly [deg]
 *            [53-63] mean motion [rev/day]
 *            [64-68] revolution number at epoch
 *            [69]    checksum
 */

import {
  GM_EARTH,
  DEG_TO_RAD,
  RAD_TO_DEG,
  PI,
  J2000_JD,
  R_EARTH_EQUATORIAL,
} from './constants.js';
import { gmstFromJD } from './time.js';

// ─── Internal helpers ─────────────────────────────────────────────────────────

const SEC_PER_DAY = 86_400;
const TWO_PI = 2 * PI;

/**
 * Compute TLE checksum: sum of digit characters mod 10 (minus signs = 1, others ignored).
 * @param {string} line - TLE line (without trailing checksum character).
 * @returns {number} Checksum digit [0-9].
 */
function tleChecksum(line) {
  let sum = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c >= '0' && c <= '9') sum += parseInt(c, 10);
    else if (c === '-') sum += 1;
  }
  return sum % 10;
}

/**
 * Parse the TLE "decimal point assumed" format used in BSTAR and eccentricity.
 * @param {string} s - Raw field string (e.g. "12345-3" → 0.12345e-3).
 * @returns {number}
 */
function parseImpliedDecimal(s) {
  const trimmed = s.trim();
  // Eccentricity field: implied leading "0." (7 chars, pure digits)
  if (/^\d+$/.test(trimmed)) return parseFloat('0.' + trimmed);
  // BSTAR / ndot2 format: ±NNNNN±N (e.g. "12345-3" or " 12345-3")
  const match = trimmed.match(/^([+-]?\d+)([+-]\d+)$/);
  if (match) return parseFloat('0.' + match[1]) * Math.pow(10, parseInt(match[2], 10));
  return parseFloat(trimmed) || 0;
}

/**
 * Solve Kepler's equation M = E - e*sin(E) for E given M and e.
 * Uses Newton-Raphson iteration.
 * @param {number} M - Mean anomaly [rad].
 * @param {number} e - Eccentricity.
 * @returns {number} Eccentric anomaly E [rad].
 */
function solveKepler(M, e) {
  let E = M;
  for (let i = 0; i < 50; i++) {
    const dE = (M - E + e * Math.sin(E)) / (1 - e * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  return E;
}

/**
 * Convert TLE epoch (YY + day-of-year) to Julian Date (UTC).
 * @param {number} epochYear  - Two-digit year from TLE (e.g. 24 → 2024, 99 → 1999).
 * @param {number} epochDay   - Day of year with fractional part (e.g. 323.12345678).
 * @returns {number} Julian Date.
 */
function tleEpochToJD(epochYear, epochDay) {
  const fullYear = epochYear >= 57 ? 1900 + epochYear : 2000 + epochYear;
  // JD of Jan 0.0 (Dec 31.0 of prior year) = Meeus algorithm
  const y = fullYear - 1;
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  const jd0 = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * 13) + 1.5 + B - 1524.5;
  // Jan 1.0 = jd0 + 1, then add (epochDay - 1)
  return jd0 + epochDay;
}

// ─── TLE Parsing ──────────────────────────────────────────────────────────────

/**
 * Parse TLE line 1 and line 2 into a structured object.
 * Field values are returned in their natural units (degrees, rev/day, etc.).
 *
 * @param {string} line1 - TLE Line 1 (69 characters).
 * @param {string} line2 - TLE Line 2 (69 characters).
 * @returns {{
 *   lineNumber1: number,
 *   satNumber: number,
 *   classification: string,
 *   intlDesignatorYear: string,
 *   intlDesignatorLaunchNum: string,
 *   intlDesignatorPiece: string,
 *   epochYear: number,
 *   epochDay: number,
 *   epochJD: number,
 *   firstDerivMeanMotion: number,
 *   secondDerivMeanMotion: number,
 *   bstar: number,
 *   ephemerisType: number,
 *   elementSetNum: number,
 *   checksum1: number,
 *   lineNumber2: number,
 *   inclination_deg: number,
 *   raan_deg: number,
 *   eccentricity: number,
 *   argPerigee_deg: number,
 *   meanAnomaly_deg: number,
 *   meanMotion_revPerDay: number,
 *   revNumAtEpoch: number,
 *   checksum2: number,
 * }}
 */
export function parseTLE(line1, line2) {
  const l1 = line1.padEnd(69, ' ');
  const l2 = line2.padEnd(69, ' ');

  // Line 1 fields (1-indexed columns → 0-indexed JS slice)
  const epochYearRaw = parseInt(l1.slice(18, 20), 10);
  const epochDay     = parseFloat(l1.slice(20, 32));

  // First derivative of mean motion: format "±.NNNNN" (rev/day²)
  const ndot1Raw = l1.slice(33, 43).trim();
  const firstDerivMeanMotion = parseFloat(ndot1Raw.replace(/^([+-]?)\./, '$10.')) || 0;

  // Second derivative: implied decimal format
  const secondDerivMeanMotion = parseImpliedDecimal(l1.slice(44, 52));

  // BSTAR: implied decimal format
  const bstar = parseImpliedDecimal(l1.slice(53, 61));

  // Epoch JD
  const epochJD = tleEpochToJD(epochYearRaw, epochDay);

  return {
    // Line 1
    lineNumber1:             parseInt(l1[0], 10),
    satNumber:               parseInt(l1.slice(2, 7), 10),
    classification:          l1[7].trim() || 'U',
    intlDesignatorYear:      l1.slice(9, 11).trim(),
    intlDesignatorLaunchNum: l1.slice(11, 14).trim(),
    intlDesignatorPiece:     l1.slice(14, 17).trim(),
    epochYear:               epochYearRaw,
    epochDay,
    epochJD,
    firstDerivMeanMotion,
    secondDerivMeanMotion,
    bstar,
    ephemerisType:           parseInt(l1[62], 10) || 0,
    elementSetNum:           parseInt(l1.slice(64, 68), 10) || 0,
    checksum1:               parseInt(l1[68], 10),
    // Line 2
    lineNumber2:             parseInt(l2[0], 10),
    inclination_deg:         parseFloat(l2.slice(8, 16)),
    raan_deg:                parseFloat(l2.slice(17, 25)),
    eccentricity:            parseFloat('0.' + l2.slice(26, 33).trim()),
    argPerigee_deg:          parseFloat(l2.slice(34, 42)),
    meanAnomaly_deg:         parseFloat(l2.slice(43, 51)),
    meanMotion_revPerDay:    parseFloat(l2.slice(52, 63)),
    revNumAtEpoch:           parseInt(l2.slice(63, 68), 10) || 0,
    checksum2:               parseInt(l2[68], 10),
  };
}

// ─── TLE Validation ───────────────────────────────────────────────────────────

/**
 * Validate TLE line 1 and line 2.
 * Checks line numbers, lengths, checksums, and basic range constraints.
 *
 * @param {string} line1 - TLE Line 1.
 * @param {string} line2 - TLE Line 2.
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateTLE(line1, line2) {
  const errors = [];

  if (typeof line1 !== 'string' || typeof line2 !== 'string') {
    errors.push('Both lines must be strings.');
    return { valid: false, errors };
  }

  const l1 = line1.trim();
  const l2 = line2.trim();

  if (l1.length < 69) errors.push(`Line 1 must be at least 69 characters (got ${l1.length}).`);
  if (l2.length < 69) errors.push(`Line 2 must be at least 69 characters (got ${l2.length}).`);

  if (l1[0] !== '1') errors.push('Line 1 must start with "1".');
  if (l2[0] !== '2') errors.push('Line 2 must start with "2".');

  if (l1.length >= 69) {
    const expected1 = tleChecksum(l1.slice(0, 68));
    const given1    = parseInt(l1[68], 10);
    if (expected1 !== given1) errors.push(`Line 1 checksum mismatch (expected ${expected1}, got ${given1}).`);
  }

  if (l2.length >= 69) {
    const expected2 = tleChecksum(l2.slice(0, 68));
    const given2    = parseInt(l2[68], 10);
    if (expected2 !== given2) errors.push(`Line 2 checksum mismatch (expected ${expected2}, got ${given2}).`);
  }

  // Satellite numbers should match
  if (l1.length >= 7 && l2.length >= 7) {
    const sat1 = parseInt(l1.slice(2, 7), 10);
    const sat2 = parseInt(l2.slice(2, 7), 10);
    if (!isNaN(sat1) && !isNaN(sat2) && sat1 !== sat2) {
      errors.push(`Satellite numbers do not match (line1: ${sat1}, line2: ${sat2}).`);
    }
  }

  // Mean motion must be positive
  if (l2.length >= 63) {
    const mm = parseFloat(l2.slice(52, 63));
    if (isNaN(mm) || mm <= 0) errors.push('Mean motion must be a positive number (rev/day).');
  }

  // Inclination in [0, 180]
  if (l2.length >= 16) {
    const inc = parseFloat(l2.slice(8, 16));
    if (isNaN(inc) || inc < 0 || inc > 180) errors.push('Inclination must be in [0°, 180°].');
  }

  return { valid: errors.length === 0, errors };
}

// ─── TLE → Keplerian ─────────────────────────────────────────────────────────

/**
 * Convert a parsed TLE to Keplerian orbital elements.
 *
 * @param {ReturnType<typeof parseTLE>} parsed - Parsed TLE object.
 * @returns {{
 *   a:         number,  Semi-major axis [m]
 *   e:         number,  Eccentricity
 *   i_deg:     number,  Inclination [°]
 *   raan_deg:  number,  Right ascension of ascending node [°]
 *   argp_deg:  number,  Argument of perigee [°]
 *   M0_deg:    number,  Mean anomaly at epoch [°]
 *   n_rad_per_s: number, Mean motion [rad/s]
 *   epochJD:   number,  Epoch as Julian Date
 *   T_s:       number,  Orbital period [s]
 * }}
 */
export function tleToKeplerian(parsed) {
  // Mean motion: rev/day → rad/s
  const n_rad_per_s = (parsed.meanMotion_revPerDay * TWO_PI) / SEC_PER_DAY;

  // Semi-major axis from Kepler's third law: n² a³ = GM
  const a = Math.cbrt(GM_EARTH / (n_rad_per_s * n_rad_per_s));

  const T_s = TWO_PI / n_rad_per_s;

  return {
    a,
    e:           parsed.eccentricity,
    i_deg:       parsed.inclination_deg,
    raan_deg:    parsed.raan_deg,
    argp_deg:    parsed.argPerigee_deg,
    M0_deg:      parsed.meanAnomaly_deg,
    n_rad_per_s,
    epochJD:     parsed.epochJD,
    T_s,
  };
}

// ─── Simplified two-body propagation ─────────────────────────────────────────

/**
 * Propagate a TLE orbit to a given Julian Date using simplified two-body
 * (Keplerian) mechanics. No SGP4 perturbations are applied.
 *
 * ⚠ SIMPLIFIED TWO-BODY PROPAGATION — NOT SGP4.
 *   Errors grow to tens of kilometres per day for LEO satellites due to
 *   atmospheric drag and J2 oblateness effects being ignored.
 *
 * @param {ReturnType<typeof parseTLE>} parsed - Parsed TLE.
 * @param {number} jd - Target Julian Date (UTC).
 * @returns {{
 *   lat_deg:  number,  Sub-satellite geodetic latitude  [°]
 *   lon_deg:  number,  Sub-satellite longitude [°]
 *   alt_km:   number,  Altitude above mean Earth radius [km]
 *   x_eci:    number,  ECI x [m]
 *   y_eci:    number,  ECI y [m]
 *   z_eci:    number,  ECI z [m]
 *   x_ecef:   number,  ECEF x [m]
 *   y_ecef:   number,  ECEF y [m]
 *   z_ecef:   number,  ECEF z [m]
 *   r_m:      number,  Orbital radius [m]
 *   trueAnomaly_deg: number,
 *   note:     string
 * }}
 */
export function propagateOrbitSimple(parsed, jd) {
  const kep = tleToKeplerian(parsed);
  const { a, e, i_deg, raan_deg, argp_deg, M0_deg, n_rad_per_s, epochJD } = kep;

  // Time since epoch [s]
  const dt_s = (jd - epochJD) * SEC_PER_DAY;

  // Mean anomaly at target time
  const M = ((M0_deg * DEG_TO_RAD) + n_rad_per_s * dt_s) % TWO_PI;
  const M_norm = ((M % TWO_PI) + TWO_PI) % TWO_PI;

  // Eccentric anomaly (Newton-Raphson)
  const E = solveKepler(M_norm, e);

  // True anomaly
  const sinNu = (Math.sqrt(1 - e * e) * Math.sin(E)) / (1 - e * Math.cos(E));
  const cosNu = (Math.cos(E) - e) / (1 - e * Math.cos(E));
  const nu    = Math.atan2(sinNu, cosNu);

  // Orbital radius
  const r_m = a * (1 - e * Math.cos(E));

  // Position in perifocal (PQW) frame
  const cosNuV = Math.cos(nu), sinNuV = Math.sin(nu);
  const px = r_m * cosNuV;
  const py = r_m * sinNuV;

  // Rotation angles
  const i    = i_deg    * DEG_TO_RAD;
  const raan = raan_deg * DEG_TO_RAD;
  const argp = argp_deg * DEG_TO_RAD;

  // Perifocal → ECI (3-1-3 Euler rotation: -argp, -i, -raan)
  const cosO = Math.cos(raan), sinO = Math.sin(raan);
  const cosI = Math.cos(i),    sinI = Math.sin(i);
  const cosW = Math.cos(argp), sinW = Math.sin(argp);

  // Combined rotation matrix R = Rz(-raan) Rx(-i) Rz(-argp)
  const x_eci = (cosO * cosW - sinO * sinW * cosI) * px + (-cosO * sinW - sinO * cosW * cosI) * py;
  const y_eci = (sinO * cosW + cosO * sinW * cosI) * px + (-sinO * sinW + cosO * cosW * cosI) * py;
  const z_eci = (sinW * sinI)                      * px + (cosW * sinI)                       * py;

  // ECI → ECEF (rotate by GMST)
  const theta = gmstFromJD(jd);
  const cosT  = Math.cos(theta), sinT = Math.sin(theta);
  const x_ecef =  cosT * x_eci + sinT * y_eci;
  const y_ecef = -sinT * x_eci + cosT * y_eci;
  const z_ecef = z_eci;

  // Geodetic lat/lon/alt (spherical approximation for display)
  const lat_deg = Math.asin(Math.max(-1, Math.min(1, z_ecef / r_m))) * RAD_TO_DEG;
  const lon_deg = ((Math.atan2(y_ecef, x_ecef) * RAD_TO_DEG) % 360 + 360) % 360;
  const lonWrapped = lon_deg > 180 ? lon_deg - 360 : lon_deg;
  const alt_km  = (r_m - R_EARTH_EQUATORIAL) / 1_000;

  return {
    lat_deg,
    lon_deg: lonWrapped,
    alt_km,
    x_eci,  y_eci,  z_eci,
    x_ecef, y_ecef, z_ecef,
    r_m,
    trueAnomaly_deg: nu * RAD_TO_DEG,
    note: 'Simplified two-body propagation — not SGP4. Errors grow ~km/day in LEO.',
  };
}

// ─── Sample TLEs ─────────────────────────────────────────────────────────────

/**
 * A small collection of representative TLEs for testing and demonstration.
 * These are example epoch data and may not be current.
 */
export const SAMPLE_TLES = {
  iss: {
    name: 'ISS (ZARYA)',
    line1: '1 25544U 98067A   24165.51851852  .00012345  00000-0  22306-3 0  9994',
    line2: '2 25544  51.6403 147.1824 0004256  83.4717  35.8101 15.50117619456789',
  },
  noaa19: {
    name: 'NOAA 19',
    line1: '1 33591U 09005A   24165.50000000  .00000082  00000-0  66246-4 0  9998',
    line2: '2 33591  99.1742 252.3718 0014081 102.5145 257.7460 14.12335648790123',
  },
  gpsSVN23: {
    name: 'GPS BIIR-3  (PRN 11)',
    line1: '1 25933U 99055A   24165.50000000 -.00000048  00000-0  00000-0 0  9994',
    line2: '2 25933  55.2236 215.6884 0168750  79.4234 282.5028  2.00567034179876',
  },
  molniya: {
    name: 'MOLNIYA 1-91',
    line1: '1 25847U 99039A   24165.50000000 -.00000136  00000-0  00000-0 0  9992',
    line2: '2 25847  63.3802 223.4516 7276410 281.5271  10.4512  2.00602430182345',
  },
};
