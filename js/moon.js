/**
 * @file moon.js
 * @module moon
 * @description Lunar coordinate functions, illumination, Earth-visibility, and
 * geometry utilities for CELES-CALC.
 *
 * Coordinate systems:
 *   Selenographic – Moon-centered lat [°, −90..+90], lon [°, −180..+180],
 *                   alt [m above mean sphere]. Longitude increases East from
 *                   the mean Earth-facing direction (near side lon = 0).
 *   Lunar-Fixed   – Moon-centered Cartesian aligned with selenographic axes:
 *                   x toward Earth (lon 0°, lat 0°), z toward lunar north pole.
 *   MCI           – Moon-Centered Inertial (approximated from simplified ECI model).
 *
 * Accuracy notes are embedded in each function. All "simplified" functions use
 * low-order analytic approximations and are suitable for visualization /
 * educational use, not operational navigation.
 */

import {
  R_MOON,
  R_EARTH_MEAN,
  DEG_TO_RAD,
  RAD_TO_DEG,
  PI,
  J2000_JD,
  AU,
} from './constants.js';
import { jdToJ2000centuries, gmstFromJD } from './time.js';
import { sunDirectionECI } from './earth.js';

// ─── Selenographic ↔ Lunar-Fixed Cartesian ───────────────────────────────────

/**
 * Convert selenographic coordinates to lunar-fixed Cartesian.
 * Analogous to geodetic→ECEF but using a spherical Moon.
 *
 * @param {number} lat_deg - Selenographic latitude  [°, −90..+90].
 * @param {number} lon_deg - Selenographic longitude [°, −180..+180].
 *   lon=0  → sub-Earth point (mean); lon=±90 → lunar limbs.
 * @param {number} alt_m   - Altitude above mean lunar sphere [m].
 * @returns {{x: number, y: number, z: number}} Lunar-fixed [m].
 */
export function selenographicToLunarFixed(lat_deg, lon_deg, alt_m) {
  const lat = lat_deg * DEG_TO_RAD;
  const lon = lon_deg * DEG_TO_RAD;
  const r = R_MOON + alt_m;
  return {
    x: r * Math.cos(lat) * Math.cos(lon),
    y: r * Math.cos(lat) * Math.sin(lon),
    z: r * Math.sin(lat),
  };
}

/**
 * Convert lunar-fixed Cartesian to selenographic coordinates.
 *
 * @param {number} x @param {number} y @param {number} z
 * @returns {{lat_deg: number, lon_deg: number, alt_m: number}}
 */
export function lunarFixedToSelenographic(x, y, z) {
  const r       = Math.sqrt(x * x + y * y + z * z);
  const lat_deg = Math.asin(z / r) * RAD_TO_DEG;
  const lon_deg = Math.atan2(y, x) * RAD_TO_DEG;
  const alt_m   = r - R_MOON;
  return { lat_deg, lon_deg, alt_m };
}

// ─── Moon position (simplified ECI) ──────────────────────────────────────────

/**
 * Approximate Moon position in J2000 ECI frame.
 *
 * @accuracy SIMPLIFIED — uses the low-precision analytic model from Meeus
 *   "Astronomical Algorithms" ch. 47 (truncated series). Typical accuracy:
 *   ~10 km in distance, ~0.1° in longitude. Not suitable for precise pointing
 *   or navigation.
 *
 * @param {number} jd - Julian Date (TT or UTC; difference negligible here).
 * @returns {{x: number, y: number, z: number}} ECI position [m].
 */
export function moonECIApprox(jd) {
  const T  = jdToJ2000centuries(jd);
  const T2 = T * T;
  const T3 = T2 * T;

  // Moon's mean longitude (degrees)
  const Lp = (218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + T3 / 538841) % 360;
  // Moon's mean anomaly
  const Mp = (134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699) % 360;
  // Moon's argument of latitude
  const F  = (93.2720950 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000) % 360;
  // Sun's mean anomaly
  const M  = (357.5291092 + 35999.0502909 * T - 0.0001536 * T2) % 360;
  // Eccentricity correction
  const E  = 1 - 0.002516 * T - 0.0000074 * T2;

  const MpR = Mp * DEG_TO_RAD;
  const MR  = M  * DEG_TO_RAD;
  const LpR = Lp * DEG_TO_RAD;
  const FR  = F  * DEG_TO_RAD;

  // Longitude perturbations (degrees × 10⁻⁶) — principal terms only
  const dLon = 6.288750 * Math.sin(MpR)
             + 1.274018 * Math.sin(2 * LpR - MpR)
             + 0.658309 * Math.sin(2 * LpR)
             + 0.213616 * Math.sin(2 * MpR)
             - 0.185596 * E * Math.sin(MR)
             - 0.114336 * Math.sin(2 * FR)
             + 0.058793 * Math.sin(2 * LpR - 2 * MpR)
             + 0.057212 * E * Math.sin(2 * LpR - MR - MpR)
             + 0.053320 * Math.sin(2 * LpR + MpR);

  // Latitude perturbations (degrees × 10⁻⁶) — principal terms
  const dLat = 5.128122 * Math.sin(FR)
             + 0.280602 * Math.sin(MpR + FR)
             + 0.277693 * Math.sin(MpR - FR)
             + 0.173237 * Math.sin(2 * LpR - FR)
             + 0.055413 * Math.sin(2 * LpR - MpR + FR)
             + 0.046271 * Math.sin(2 * LpR - MpR - FR)
             + 0.032573 * Math.sin(2 * LpR + FR);

  // Distance perturbations (km) — principal terms
  const dR_km = -20.9050 * Math.cos(MpR)
              -  3.2490 * Math.cos(2 * LpR - MpR)
              -  1.6490 * Math.cos(2 * LpR)
              -  0.3990 * E * Math.cos(MR)
              +  0.2130 * Math.cos(2 * MpR)
              -  0.1010 * Math.cos(FR + MpR);

  // Mean distance [m]
  const r_mean = 385_000_560;
  const r_m    = (r_mean + dR_km * 1000);

  // Ecliptic coordinates
  const lambda = (Lp + dLon) * DEG_TO_RAD;
  const beta   = dLat * DEG_TO_RAD;

  // Convert ecliptic → equatorial (J2000 obliquity ≈ 23.4393°)
  const eps = (23.439291111 - 0.013004167 * T) * DEG_TO_RAD;

  const x = r_m * Math.cos(beta) * Math.cos(lambda);
  const y = r_m * (Math.cos(eps) * Math.cos(beta) * Math.sin(lambda) - Math.sin(eps) * Math.sin(beta));
  const z = r_m * (Math.sin(eps) * Math.cos(beta) * Math.sin(lambda) + Math.cos(eps) * Math.sin(beta));

  return { x, y, z };
}

/**
 * Backward-compatible alias for {@link moonECIApprox}.
 * @deprecated Use moonECIApprox instead.
 * @param {number} jd
 * @returns {{x: number, y: number, z: number}}
 */
export function moonECEFApprox(jd) {
  return moonECIApprox(jd);
}

/**
 * Return the Earth–Moon distance at a given Julian Date.
 *
 * @accuracy SIMPLIFIED — uses the truncated analytic model from moonECIApprox.
 *
 * @param {number} jd - Julian Date.
 * @returns {number} Earth–Moon distance [m].
 */
export function earthMoonDistance(jd) {
  const pos = moonECIApprox(jd);
  return Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
}

// ─── Sub-Earth and Sub-solar points on the Moon ───────────────────────────────

/**
 * Return the selenographic coordinates of the sub-Earth point
 * (the point on the lunar surface directly facing Earth at a given time).
 *
 * @accuracy SIMPLIFIED — uses the truncated Moon ECI position. Libration is
 *   NOT modeled; the sub-Earth point is computed from the geometric direction
 *   from Moon to Earth in the equatorial frame, then mapped to selenographic
 *   coordinates assuming the lunar prime meridian points toward Earth (mean
 *   libration = 0).
 *
 * @param {number} jd - Julian Date.
 * @returns {{lat_deg: number, lon_deg: number, note: string}}
 */
export function getSubEarthPoint(jd) {
  // Direction from Moon to Earth in ECI = −(Moon ECI position) / |r|
  const moon = moonECIApprox(jd);
  const r = Math.sqrt(moon.x ** 2 + moon.y ** 2 + moon.z ** 2);
  const dx = -moon.x / r;
  const dy = -moon.y / r;
  const dz = -moon.z / r;

  // Selenographic lat/lon of this direction (spherical approximation)
  const lat_deg = Math.asin(Math.max(-1, Math.min(1, dz))) * RAD_TO_DEG;
  const lon_deg = Math.atan2(dy, dx) * RAD_TO_DEG;

  return {
    lat_deg,
    lon_deg,
    note: 'Simplified — physical libration not modeled.',
  };
}

/**
 * Return the selenographic coordinates of the sub-solar point on the Moon
 * (the point directly facing the Sun).
 *
 * @accuracy SIMPLIFIED — uses low-precision solar model.
 *
 * @param {number} jd - Julian Date.
 * @returns {{lat_deg: number, lon_deg: number, note: string}}
 */
export function getSubsolarMoonPoint(jd) {
  // Sun direction in ECI (unit vector from Earth, also valid from Moon to ~0.01°)
  const sun = sunDirectionECI(jd);
  const moon = moonECIApprox(jd);
  const moonR = Math.sqrt(moon.x ** 2 + moon.y ** 2 + moon.z ** 2);

  // Direction from Moon to Sun ≈ direction from Earth to Sun (Moon–Earth distance ≪ Earth–Sun)
  // For better accuracy, compute actual vector from Moon to Sun:
  const sunPos = { x: sun.x * AU, y: sun.y * AU, z: sun.z * AU };
  const dx = sunPos.x - moon.x;
  const dy = sunPos.y - moon.y;
  const dz = sunPos.z - moon.z;
  const dr = Math.sqrt(dx * dx + dy * dy + dz * dz);

  // Rotate this ECI unit vector into the lunar-fixed frame using the sub-Earth point
  // as the reference for the x-axis orientation (simplified).
  // The full transformation requires the lunar libration angles (IAU MOON PA frame).
  // Here we approximate: selenographic = equatorial (mean orientation).
  const ux = dx / dr, uy = dy / dr, uz = dz / dr;
  const lat_deg = Math.asin(Math.max(-1, Math.min(1, uz))) * RAD_TO_DEG;
  const lon_deg = Math.atan2(uy, ux) * RAD_TO_DEG;

  return {
    lat_deg,
    lon_deg,
    note: 'Simplified — lunar libration not modeled; sub-solar lon approximated in equatorial plane.',
  };
}

// ─── Illumination & Visibility ────────────────────────────────────────────────

/**
 * Compute the solar elevation angle at a given selenographic point.
 *
 * @accuracy SIMPLIFIED — see getSubsolarMoonPoint.
 *
 * @param {number} lat_deg - Selenographic latitude [°].
 * @param {number} lon_deg - Selenographic longitude [°].
 * @param {number} jd      - Julian Date.
 * @returns {number} Solar elevation angle [°], negative if below horizon.
 */
export function solarElevationAtMoonPoint(lat_deg, lon_deg, jd) {
  const sub = getSubsolarMoonPoint(jd);
  const φ  = lat_deg  * DEG_TO_RAD;
  const φs = sub.lat_deg * DEG_TO_RAD;
  const Δλ = (sub.lon_deg - lon_deg) * DEG_TO_RAD;
  const sinEl = Math.sin(φ) * Math.sin(φs) +
                Math.cos(φ) * Math.cos(φs) * Math.cos(Δλ);
  return Math.asin(Math.max(-1, Math.min(1, sinEl))) * RAD_TO_DEG;
}

/**
 * Determine whether a selenographic point is sunlit.
 *
 * @accuracy SIMPLIFIED — ignores lunar topography and penumbra.
 *
 * @param {number} lat_deg @param {number} lon_deg @param {number} jd
 * @returns {{sunlit: boolean, solarElevation_deg: number, note: string}}
 */
export function isMoonPointSunlit(lat_deg, lon_deg, jd) {
  const solarElevation_deg = solarElevationAtMoonPoint(lat_deg, lon_deg, jd);
  return {
    sunlit: solarElevation_deg > 0,
    solarElevation_deg,
    note: 'Simplified — no topography or penumbra modeling.',
  };
}

/**
 * Compute the Earth elevation angle at a given selenographic point.
 *
 * @accuracy SIMPLIFIED — see getSubEarthPoint.
 *
 * @param {number} lat_deg @param {number} lon_deg @param {number} jd
 * @returns {number} Earth elevation angle [°].
 */
export function earthElevationAtMoonPoint(lat_deg, lon_deg, jd) {
  const sub = getSubEarthPoint(jd);
  const φ  = lat_deg     * DEG_TO_RAD;
  const φe = sub.lat_deg * DEG_TO_RAD;
  const Δλ = (sub.lon_deg - lon_deg) * DEG_TO_RAD;
  const sinEl = Math.sin(φ) * Math.sin(φe) +
                Math.cos(φ) * Math.cos(φe) * Math.cos(Δλ);
  return Math.asin(Math.max(-1, Math.min(1, sinEl))) * RAD_TO_DEG;
}

/**
 * Determine whether Earth is visible above the horizon at a selenographic point.
 *
 * @accuracy SIMPLIFIED — flat-horizon, spherical Moon, no libration.
 *
 * @param {number} lat_deg @param {number} lon_deg @param {number} jd
 * @returns {{visible: boolean, earthElevation_deg: number, note: string}}
 */
export function isMoonPointEarthVisible(lat_deg, lon_deg, jd) {
  const earthElevation_deg = earthElevationAtMoonPoint(lat_deg, lon_deg, jd);
  return {
    visible: earthElevation_deg > 0,
    earthElevation_deg,
    note: 'Simplified — no libration modeled; near-side/far-side boundary assumed at lon ±90°.',
  };
}

/**
 * Determine whether a selenographic longitude is on the near side of the Moon
 * (i.e., the hemisphere facing Earth, mean libration = 0).
 *
 * @param {number} lon_deg - Selenographic longitude [°].
 * @returns {boolean} True if lon is in (−90°, +90°), i.e., near side.
 */
export function isNearSide(lon_deg) {
  const wrapped = ((lon_deg + 180) % 360 + 360) % 360 - 180;
  return wrapped > -90 && wrapped < 90;
}

// ─── Local ENU on the Moon ────────────────────────────────────────────────────

/**
 * Convert a lunar local ENU vector to azimuth, elevation, and range.
 * Uses the same geometry as the Earth version.
 *
 * @param {number} e - East  [m].
 * @param {number} n - North [m].
 * @param {number} u - Up    [m].
 * @returns {{az_deg: number, el_deg: number, range_m: number}}
 */
export function lunarENUToAzElRange(e, n, u) {
  const range_m = Math.sqrt(e * e + n * n + u * u);
  const el_deg  = Math.asin(u / range_m) * RAD_TO_DEG;
  const az_deg  = ((Math.atan2(e, n) * RAD_TO_DEG) % 360 + 360) % 360;
  return { az_deg, el_deg, range_m };
}
