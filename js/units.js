/**
 * @file units.js
 * @module units
 * @description Unit conversion utilities and angle-normalization helpers for CELES-CALC.
 * All functions are pure (no side-effects) and accept / return plain numbers.
 */

import { DEG_TO_RAD, RAD_TO_DEG, PI } from './constants.js';

// ─── Length ───────────────────────────────────────────────────────────────────

/**
 * Convert meters to kilometers.
 * @param {number} m - Distance in meters.
 * @returns {number} Distance in kilometers.
 */
export function metersToKm(m) {
  return m / 1000;
}

/**
 * Convert kilometers to meters.
 * @param {number} km - Distance in kilometers.
 * @returns {number} Distance in meters.
 */
export function kmToMeters(km) {
  return km * 1000;
}

/**
 * Convert meters to statute miles.
 * @param {number} m - Distance in meters.
 * @returns {number} Distance in statute miles.
 */
export function metersToMiles(m) {
  return m / 1609.344;
}

/**
 * Convert statute miles to meters.
 * @param {number} miles - Distance in statute miles.
 * @returns {number} Distance in meters.
 */
export function milesToMeters(miles) {
  return miles * 1609.344;
}

/**
 * Convert meters to nautical miles.
 * 1 NM = 1852 m (exact, BIPM definition).
 * @param {number} m - Distance in meters.
 * @returns {number} Distance in nautical miles.
 */
export function metersToNauticalMiles(m) {
  return m / 1852;
}

/**
 * Convert nautical miles to meters.
 * @param {number} nm - Distance in nautical miles.
 * @returns {number} Distance in meters.
 */
export function nauticalMilesToMeters(nm) {
  return nm * 1852;
}

// ─── Angle ────────────────────────────────────────────────────────────────────

/**
 * Convert degrees to radians.
 * @param {number} deg - Angle in degrees.
 * @returns {number} Angle in radians.
 */
export function degToRad(deg) {
  return deg * DEG_TO_RAD;
}

/**
 * Convert radians to degrees.
 * @param {number} rad - Angle in radians.
 * @returns {number} Angle in degrees.
 */
export function radToDeg(rad) {
  return rad * RAD_TO_DEG;
}

/**
 * Normalize an angle in degrees to the half-open interval [0, 360).
 * @param {number} deg - Angle in degrees (any value).
 * @returns {number} Angle normalized to [0, 360).
 */
export function normalizeAngleDeg(deg) {
  return ((deg % 360) + 360) % 360;
}

/**
 * Normalize an angle in radians to the half-open interval [0, 2π).
 * @param {number} rad - Angle in radians (any value).
 * @returns {number} Angle normalized to [0, 2π).
 */
export function normalizeAngleRad(rad) {
  const TWO_PI = 2 * PI;
  return ((rad % TWO_PI) + TWO_PI) % TWO_PI;
}

/**
 * Clamp a latitude to the valid geodetic range [−90, 90].
 * Values outside this range are clamped (not wrapped) because a latitude
 * beyond the poles has no meaningful geodetic interpretation.
 * @param {number} deg - Latitude in degrees.
 * @returns {number} Latitude clamped to [−90, 90].
 */
export function wrapLatitude(deg) {
  return Math.max(-90, Math.min(90, deg));
}

/**
 * Wrap a longitude to the half-open interval [−180, 180).
 * @param {number} deg - Longitude in degrees (any value).
 * @returns {number} Longitude in [−180, 180).
 */
export function wrapLongitude(deg) {
  const wrapped = ((deg + 180) % 360 + 360) % 360 - 180;
  // Edge case: +180 maps to −180
  return wrapped === 180 ? -180 : wrapped;
}

// ─── Time ─────────────────────────────────────────────────────────────────────

/**
 * Convert seconds to minutes.
 * @param {number} s - Time in seconds.
 * @returns {number} Time in minutes.
 */
export function secondsToMinutes(s) {
  return s / 60;
}

/**
 * Convert minutes to seconds.
 * @param {number} min - Time in minutes.
 * @returns {number} Time in seconds.
 */
export function minutesToSeconds(min) {
  return min * 60;
}

/**
 * Convert seconds to hours.
 * @param {number} s - Time in seconds.
 * @returns {number} Time in hours.
 */
export function secondsToHours(s) {
  return s / 3600;
}

/**
 * Convert hours to seconds.
 * @param {number} h - Time in hours.
 * @returns {number} Time in seconds.
 */
export function hoursToSeconds(h) {
  return h * 3600;
}

/**
 * Convert seconds to days.
 * @param {number} s - Time in seconds.
 * @returns {number} Time in days.
 */
export function secondsToDays(s) {
  return s / 86400;
}

/**
 * Convert days to seconds.
 * @param {number} d - Time in days.
 * @returns {number} Time in seconds.
 */
export function daysToSeconds(d) {
  return d * 86400;
}
