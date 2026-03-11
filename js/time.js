/**
 * @file time.js
 * @module time
 * @description Time-system conversion functions for CELES-CALC.
 *
 * Supported systems:
 *   UTC  – Coordinated Universal Time
 *   TAI  – International Atomic Time  (UTC + leap seconds)
 *   TT   – Terrestrial Time           (TAI + 32.184 s)
 *   GPS  – GPS Time                   (TAI − 19 s, continuous since 1980-01-06)
 *   Unix – milliseconds since 1970-01-01T00:00:00Z
 *   JD   – Julian Date
 *   MJD  – Modified Julian Date       (JD − 2 400 000.5)
 *
 * Accuracy note:
 *   All conversions are exact within floating-point precision EXCEPT where
 *   explicitly labeled "approximate" or "simplified". Earth-orientation
 *   corrections (ΔUT1, polar motion) are NOT applied; the caller is responsible
 *   for adding them when sub-arcsecond accuracy is required.
 */

import {
  J2000_JD,
  TAI_MINUS_GPS,
  TT_MINUS_TAI,
  LEAP_SECONDS,
} from './constants.js';

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Julian Date of the Unix epoch (1970-01-01T00:00:00 UTC). */
const JD_UNIX_EPOCH = 2_440_587.5;

/** Julian Date of the GPS epoch (1980-01-06T00:00:00 UTC). */
const JD_GPS_EPOCH = 2_444_244.5;

/** Seconds per day */
const SEC_PER_DAY = 86_400;

/**
 * Resolve a flexible date input to a JS Date object.
 * @param {string|Date|number} input - ISO 8601 string, Date, or Unix ms.
 * @returns {Date}
 */
function toDate(input) {
  if (input instanceof Date) return input;
  if (typeof input === 'number') return new Date(input);
  return new Date(input);
}

// ─── Julian Date ──────────────────────────────────────────────────────────────

/**
 * Convert a calendar date/time to a Julian Date.
 * Exact for the proleptic Gregorian calendar (algorithm: Meeus, "Astronomical
 * Algorithms" 2nd ed., ch. 7).
 *
 * @param {number} year  - Full year (e.g. 2024).
 * @param {number} month - Month (1–12).
 * @param {number} day   - Day of month (1–31).
 * @param {number} [hour=0]   - UTC hour (0–23).
 * @param {number} [min=0]    - Minute (0–59).
 * @param {number} [sec=0.0]  - Second including fractional part (0–60).
 * @returns {number} Julian Date.
 */
export function gregorianToJulianDate(year, month, day, hour = 0, min = 0, sec = 0.0) {
  if (month <= 2) {
    year -= 1;
    month += 12;
  }
  const A = Math.floor(year / 100);
  const B = 2 - A + Math.floor(A / 4);
  const dayFraction = day + hour / 24 + min / 1440 + sec / SEC_PER_DAY;
  return Math.floor(365.25 * (year + 4716)) +
         Math.floor(30.6001 * (month + 1)) +
         dayFraction + B - 1524.5;
}

/**
 * Convert a Julian Date to a Gregorian calendar object.
 * Exact (Meeus algorithm).
 *
 * @param {number} jd - Julian Date.
 * @returns {{year: number, month: number, day: number,
 *            hour: number, minute: number, second: number}}
 */
export function julianDateToGregorian(jd) {
  const jd0 = jd + 0.5;
  const Z = Math.floor(jd0);
  const F = jd0 - Z;

  let A;
  if (Z < 2_299_161) {
    A = Z;
  } else {
    const alpha = Math.floor((Z - 1_867_216.25) / 36_524.25);
    A = Z + 1 + alpha - Math.floor(alpha / 4);
  }

  const B = A + 1524;
  const C = Math.floor((B - 122.1) / 365.25);
  const D = Math.floor(365.25 * C);
  const E = Math.floor((B - D) / 30.6001);

  const dayWithFrac = B - D - Math.floor(30.6001 * E) + F;
  const day    = Math.floor(dayWithFrac);
  const month  = E < 14 ? E - 1 : E - 13;
  const year   = month > 2 ? C - 4716 : C - 4715;

  const dayFrac  = dayWithFrac - day;
  const totalSec = dayFrac * SEC_PER_DAY;
  const hour     = Math.floor(totalSec / 3600);
  const minute   = Math.floor((totalSec % 3600) / 60);
  const second   = totalSec % 60;

  return { year, month, day, hour, minute, second };
}

/**
 * Convert a UTC Date or ISO 8601 string to a Julian Date.
 *
 * @param {string|Date} input - UTC date as ISO 8601 string or Date object.
 * @returns {number} Julian Date (UTC).
 */
export function utcToJulianDate(input) {
  const d = toDate(input);
  // Millisecond precision; JD_UNIX_EPOCH is exact.
  return JD_UNIX_EPOCH + d.getTime() / (SEC_PER_DAY * 1000);
}

/**
 * Convert a Julian Date to a UTC ISO 8601 string.
 *
 * @param {number} jd - Julian Date (UTC).
 * @returns {string} UTC ISO 8601 string (millisecond precision).
 */
export function julianDateToUTC(jd) {
  const unixMs = (jd - JD_UNIX_EPOCH) * SEC_PER_DAY * 1000;
  return new Date(unixMs).toISOString();
}

/**
 * Convert a Julian Date to a Modified Julian Date.
 * MJD = JD − 2 400 000.5
 *
 * @param {number} jd - Julian Date.
 * @returns {number} Modified Julian Date.
 */
export function julianDateToMJD(jd) {
  return jd - 2_400_000.5;
}

/**
 * Convert a Modified Julian Date to a Julian Date.
 *
 * @param {number} mjd - Modified Julian Date.
 * @returns {number} Julian Date.
 */
export function mjdToJulianDate(mjd) {
  return mjd + 2_400_000.5;
}

// ─── Unix ─────────────────────────────────────────────────────────────────────

/**
 * Convert a UTC string or Date to a Unix timestamp in milliseconds.
 *
 * @param {string|Date} input - UTC date input.
 * @returns {number} Unix timestamp in milliseconds.
 */
export function utcToUnix(input) {
  return toDate(input).getTime();
}

/**
 * Convert a Unix timestamp (milliseconds) to a UTC ISO 8601 string.
 *
 * @param {number} unixMs - Unix timestamp in milliseconds.
 * @returns {string} UTC ISO 8601 string.
 */
export function unixToUTC(unixMs) {
  return new Date(unixMs).toISOString();
}

// ─── Leap seconds ─────────────────────────────────────────────────────────────

/**
 * Format a Gregorian calendar object as an ISO date string "YYYY-MM-DD".
 * Used internally for leap-second table lookups.
 * @param {number} year @param {number} month @param {number} day
 * @returns {string}
 */
function toISODateString(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Return the number of leap seconds (TAI − UTC) applicable at a given UTC JD.
 * Uses the IERS leap-seconds table from constants.js.
 * For dates before 1972-01-01, returns 10 (the first tabulated value).
 *
 * @param {number} jd - Julian Date in UTC scale.
 * @returns {number} TAI − UTC offset in integer seconds.
 */
export function getCurrentLeapSeconds(jd) {
  const { year, month, day } = julianDateToGregorian(jd);
  const utcStr = toISODateString(year, month, day);

  let offset = LEAP_SECONDS[0].offset;
  for (const entry of LEAP_SECONDS) {
    if (utcStr >= entry.date) {
      offset = entry.offset;
    } else {
      break;
    }
  }
  return offset;
}

// ─── TAI / TT / GPS ───────────────────────────────────────────────────────────

/**
 * Convert a UTC Julian Date to a TAI Julian Date.
 * TAI = UTC + leap seconds
 *
 * @param {number} jd - Julian Date in UTC scale.
 * @returns {number} Julian Date in TAI scale.
 */
export function utcToTAI(jd) {
  const leapSec = getCurrentLeapSeconds(jd);
  return jd + leapSec / SEC_PER_DAY;
}

/**
 * Convert a TAI Julian Date to a Terrestrial Time Julian Date.
 * TT = TAI + 32.184 s (exact, constant offset).
 *
 * @param {number} taiJd - Julian Date in TAI scale.
 * @returns {number} Julian Date in TT scale.
 */
export function taiToTT(taiJd) {
  return taiJd + TT_MINUS_TAI / SEC_PER_DAY;
}

/**
 * Convert a UTC Julian Date directly to a Terrestrial Time Julian Date.
 * TT = UTC + leap seconds + 32.184 s
 *
 * @param {number} jd - Julian Date in UTC scale.
 * @returns {number} Julian Date in TT scale.
 */
export function utcToTT(jd) {
  return taiToTT(utcToTAI(jd));
}

/**
 * Convert a UTC Julian Date to GPS Time components.
 * GPS Time is a continuous atomic scale; it does not include leap seconds.
 * GPS Time = TAI − 19 s = UTC + (leap seconds − 19 s)
 *
 * @param {number} jd - Julian Date in UTC scale.
 * @returns {{gpsWeek: number, gpsSeconds: number, gpsTOW: number}}
 *   gpsWeek   – GPS week number (integer, rolls over every 1024 weeks in legacy receivers).
 *   gpsTOW    – GPS Time Of Week in seconds [0, 604800).
 *   gpsSeconds – Total seconds elapsed since GPS epoch (1980-01-06T00:00:00 UTC).
 */
export function utcToGPSTime(jd) {
  const leapSec = getCurrentLeapSeconds(jd);
  const gpsJd = jd + (leapSec - TAI_MINUS_GPS) / SEC_PER_DAY;
  const gpsSeconds = (gpsJd - JD_GPS_EPOCH) * SEC_PER_DAY;
  const gpsWeek = Math.floor(gpsSeconds / 604_800);
  const gpsTOW  = gpsSeconds - gpsWeek * 604_800;
  return { gpsWeek, gpsSeconds, gpsTOW };
}

/**
 * Convert GPS week + time-of-week to a UTC Julian Date.
 * Leap-second correction is applied using the IERS table.
 *
 * @param {number} gpsWeek - GPS week number.
 * @param {number} gpsTOW  - GPS Time Of Week in seconds.
 * @returns {number} Julian Date in UTC scale.
 */
export function gpsTimeToUTC(gpsWeek, gpsTOW) {
  const gpsSeconds = gpsWeek * 604_800 + gpsTOW;
  // First approximation: GPS JD (no leap seconds)
  const gpsJd = JD_GPS_EPOCH + gpsSeconds / SEC_PER_DAY;
  // GPS = TAI - 19s, so TAI JD:
  const taiJd = gpsJd + TAI_MINUS_GPS / SEC_PER_DAY;
  // Approximate UTC JD (use as lookup key for leap seconds)
  const approxUtcJd = taiJd - 37 / SEC_PER_DAY; // safe upper bound
  const leapSec = getCurrentLeapSeconds(approxUtcJd);
  return taiJd - leapSec / SEC_PER_DAY;
}

// ─── Composite ────────────────────────────────────────────────────────────────

/**
 * Convert a date input to all supported time representations at once.
 *
 * @param {string|Date|number} dateInput - UTC date as ISO string, Date, or Unix ms.
 * @returns {{
 *   utcISO:      string,
 *   jd:          number,
 *   mjd:         number,
 *   unixMs:      number,
 *   leapSeconds: number,
 *   taiJd:       number,
 *   ttJd:        number,
 *   gpsWeek:     number,
 *   gpsTOW:      number,
 *   gpsSeconds:  number,
 * }}
 */
export function utcToAllSystems(dateInput) {
  const d = toDate(dateInput);
  const jd  = utcToJulianDate(d);
  const mjd = julianDateToMJD(jd);
  const leapSeconds = getCurrentLeapSeconds(jd);
  const taiJd = utcToTAI(jd);
  const ttJd  = taiToTT(taiJd);
  const { gpsWeek, gpsTOW, gpsSeconds } = utcToGPSTime(jd);

  return {
    utcISO: d.toISOString(),
    jd,
    mjd,
    unixMs: d.getTime(),
    leapSeconds,
    taiJd,
    ttJd,
    gpsWeek,
    gpsTOW,
    gpsSeconds,
  };
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/**
 * Return Julian centuries since the J2000.0 epoch (TT scale).
 * T = (JD_TT − 2451545.0) / 36525
 *
 * @param {number} jd - Julian Date (TT scale recommended; UTC acceptable for
 *   low-accuracy use where the ~1 min TT−UTC difference is negligible).
 * @returns {number} T in Julian centuries.
 */
export function jdToJ2000centuries(jd) {
  return (jd - J2000_JD) / 36_525;
}

/**
 * Greenwich Mean Sidereal Time from a Julian Date.
 *
 * @accuracy SIMPLIFIED — uses the IAU 1982 polynomial truncated to the linear
 *   term. Error grows to ~0.1 s/century. For sub-arcsecond work use the full
 *   IAU 2006/2000A precession-nutation model.
 *
 * @param {number} jd - Julian Date (UT1; UTC is acceptable for most purposes).
 * @returns {number} GMST in radians, normalized to [0, 2π).
 */
export function gmstFromJD(jd) {
  // IAU 1982 GMST at 0h UT1 + sidereal rate (Meeus, ch. 12)
  const T = jdToJ2000centuries(jd);
  // GMST in seconds of time at 0h UT1 for the given Julian Date
  const gmst_s = 24110.54841 +
                  8640184.812866 * T +
                  0.093104 * T * T -
                  6.2e-6 * T * T * T;
  // Add the sidereal rotation for the fractional UT day
  const ut1_s = (jd - Math.floor(jd - 0.5) - 0.5) * SEC_PER_DAY;
  const omega  = 1.002737909350795; // ratio of mean solar to sidereal day
  const total_s = gmst_s + omega * ut1_s;

  // Convert seconds-of-time → radians (24 h = 2π rad)
  const TWO_PI = 2 * Math.PI;
  const rad = (total_s / SEC_PER_DAY) * TWO_PI;
  return ((rad % TWO_PI) + TWO_PI) % TWO_PI;
}
