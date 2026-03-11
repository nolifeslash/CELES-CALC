/**
 * @file constants.js
 * @module constants
 * @description Physical, mathematical, and geodetic constants for CELES-CALC.
 * All values are in SI units (meters, seconds, radians) unless noted.
 */

// ─── Mathematical ────────────────────────────────────────────────────────────

/** π */
export const PI = Math.PI;

/** Degrees → radians conversion factor */
export const DEG_TO_RAD = Math.PI / 180;

/** Radians → degrees conversion factor */
export const RAD_TO_DEG = 180 / Math.PI;

// ─── Physical ─────────────────────────────────────────────────────────────────

/** Speed of light in vacuum [m/s] — exact (SI definition) */
export const SPEED_OF_LIGHT = 299_792_458.0;

/** Gravitational parameter of Earth, GM_Earth [m³/s²] — EGM2008 */
export const GM_EARTH = 3.986_004_418e14;

/** Gravitational parameter of the Moon, GM_Moon [m³/s²] */
export const GM_MOON = 4.904_8695e12;

/** Gravitational parameter of the Sun, GM_Sun [m³/s²] */
export const GM_SUN = 1.327_124_400_18e20;

// ─── Earth (WGS84) ────────────────────────────────────────────────────────────

/** WGS84 semi-major axis (equatorial radius) [m] */
export const R_EARTH_EQUATORIAL = 6_378_137.0;

/** WGS84 semi-minor axis (polar radius) [m] — derived */
export const R_EARTH_POLAR = 6_356_752.3142;

/** Earth mean radius [m] — IUGG definition */
export const R_EARTH_MEAN = 6_371_000.0;

/** WGS84 flattening f = (a-b)/a */
export const F_EARTH = 1 / 298.257_223_563;

/** WGS84 first eccentricity squared e² = 2f − f² */
export const E2_EARTH = 2 * F_EARTH - F_EARTH * F_EARTH;

// ─── Moon ─────────────────────────────────────────────────────────────────────

/** Moon mean radius [m] — IAU 2015 */
export const R_MOON = 1_737_400.0;

// ─── Astronomical ─────────────────────────────────────────────────────────────

/** Astronomical Unit [m] — IAU 2012 exact definition */
export const AU = 1.495_978_707e11;

/** Julian Date of the J2000.0 epoch (2000 Jan 1.5 TT) */
export const J2000_JD = 2_451_545.0;

/** Earth sidereal day [s] */
export const EARTH_SIDEREAL_DAY_S = 86_164.090_5;

/** Earth solar (mean) day [s] */
export const EARTH_SOLAR_DAY_S = 86_400.0;

// ─── Time System Offsets ──────────────────────────────────────────────────────

/**
 * Constant offset: TAI − GPS [s]
 * GPS time was set equal to UTC at 1980-01-06; TAI was already 19 s ahead.
 */
export const TAI_MINUS_GPS = 19;

/**
 * Constant offset: TT − TAI [s]
 * Terrestrial Time = International Atomic Time + 32.184 s (exact)
 */
export const TT_MINUS_TAI = 32.184;

/**
 * Leap-seconds table — cumulative TAI − UTC offset effective from each date.
 *
 * Entries are sorted chronologically. To find the applicable offset for a given
 * UTC date, find the last entry whose `date` is ≤ the query date.
 *
 * Source: IERS Bulletin C / USNO
 *
 * @type {Array<{date: string, offset: number}>}
 */
export const LEAP_SECONDS = [
  { date: '1972-01-01', offset: 10 },
  { date: '1972-07-01', offset: 11 },
  { date: '1973-01-01', offset: 12 },
  { date: '1974-01-01', offset: 13 },
  { date: '1975-01-01', offset: 14 },
  { date: '1976-01-01', offset: 15 },
  { date: '1977-01-01', offset: 16 },
  { date: '1978-01-01', offset: 17 },
  { date: '1979-01-01', offset: 18 },
  { date: '1980-01-01', offset: 19 },
  { date: '1981-07-01', offset: 20 },
  { date: '1982-07-01', offset: 21 },
  { date: '1983-07-01', offset: 22 },
  { date: '1985-07-01', offset: 23 },
  { date: '1988-01-01', offset: 24 },
  { date: '1990-01-01', offset: 25 },
  { date: '1991-01-01', offset: 26 },
  { date: '1992-07-01', offset: 27 },
  { date: '1993-07-01', offset: 28 },
  { date: '1994-07-01', offset: 29 },
  { date: '1996-01-01', offset: 30 },
  { date: '1997-07-01', offset: 31 },
  { date: '1999-01-01', offset: 32 },
  { date: '2006-01-01', offset: 33 },
  { date: '2009-01-01', offset: 34 },
  { date: '2012-07-01', offset: 35 },
  { date: '2015-07-01', offset: 36 },
  { date: '2017-01-01', offset: 37 },
];
