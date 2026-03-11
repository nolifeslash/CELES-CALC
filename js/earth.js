/**
 * @file earth.js
 * @module earth
 * @description Earth coordinate transformations, line-of-sight checks, solar
 * geometry, and surface utilities for CELES-CALC.
 *
 * Coordinate systems used:
 *   Geodetic  – WGS84 latitude (°), longitude (°), altitude (m above ellipsoid)
 *   ECEF      – Earth-Centered Earth-Fixed Cartesian (m), x toward prime
 *                meridian/equator, z toward north pole
 *   ECI       – Earth-Centered Inertial (simplified: x toward vernal equinox
 *                at J2000, z toward North Celestial Pole)
 *   ENU       – Local East-North-Up Cartesian (m)
 *   Az/El     – Azimuth (° CW from North), Elevation (° above horizon), Range (m)
 */

import {
  R_EARTH_EQUATORIAL,
  R_EARTH_MEAN,
  E2_EARTH,
  DEG_TO_RAD,
  RAD_TO_DEG,
  PI,
  J2000_JD,
} from './constants.js';
import { gmstFromJD, jdToJ2000centuries } from './time.js';

// ─── Geodetic ↔ ECEF ──────────────────────────────────────────────────────────

/**
 * Convert WGS84 geodetic coordinates to ECEF Cartesian.
 * Exact within WGS84 ellipsoid definition.
 *
 * @param {number} lat_deg - Geodetic latitude  [°, −90 to +90].
 * @param {number} lon_deg - Longitude           [°, −180 to +180].
 * @param {number} alt_m   - Altitude above WGS84 ellipsoid [m].
 * @returns {{x: number, y: number, z: number}} ECEF position in meters.
 */
export function geodeticToECEF(lat_deg, lon_deg, alt_m) {
  const lat = lat_deg * DEG_TO_RAD;
  const lon = lon_deg * DEG_TO_RAD;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  // Prime vertical radius of curvature
  const N = R_EARTH_EQUATORIAL / Math.sqrt(1 - E2_EARTH * sinLat * sinLat);
  const x = (N + alt_m) * cosLat * Math.cos(lon);
  const y = (N + alt_m) * cosLat * Math.sin(lon);
  const z = (N * (1 - E2_EARTH) + alt_m) * sinLat;
  return { x, y, z };
}

/**
 * Convert ECEF Cartesian to WGS84 geodetic coordinates.
 * Uses Bowring's iterative method (typically converges in 2–3 iterations,
 * accurate to sub-millimeter).
 *
 * @param {number} x - ECEF x [m].
 * @param {number} y - ECEF y [m].
 * @param {number} z - ECEF z [m].
 * @returns {{lat_deg: number, lon_deg: number, alt_m: number}}
 */
export function ecefToGeodetic(x, y, z) {
  const a  = R_EARTH_EQUATORIAL;
  const e2 = E2_EARTH;
  const p  = Math.sqrt(x * x + y * y);         // distance from z-axis
  const lon = Math.atan2(y, x);

  // Initial estimate for latitude (closed-form Bowring seed)
  let lat = Math.atan2(z, p * (1 - e2));

  for (let i = 0; i < 10; i++) {
    const sinLat = Math.sin(lat);
    const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);
    const latNew = Math.atan2(z + e2 * N * sinLat, p);
    if (Math.abs(latNew - lat) < 1e-12) {
      lat = latNew;
      break;
    }
    lat = latNew;
  }

  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const N   = a / Math.sqrt(1 - e2 * sinLat * sinLat);
  const alt = p / cosLat - N;

  return {
    lat_deg: lat * RAD_TO_DEG,
    lon_deg: lon * RAD_TO_DEG,
    alt_m:   Math.abs(cosLat) > 1e-10 ? alt : (Math.abs(z) / Math.abs(sinLat)) - N * (1 - e2),
  };
}

// ─── ECEF ↔ ENU ───────────────────────────────────────────────────────────────

/**
 * Convert an ECEF displacement vector to a local ENU vector at a reference
 * geodetic point.
 *
 * @param {number} dx - ECEF x displacement [m] (target − observer).
 * @param {number} dy - ECEF y displacement [m].
 * @param {number} dz - ECEF z displacement [m].
 * @param {number} lat_deg - Observer geodetic latitude  [°].
 * @param {number} lon_deg - Observer longitude [°].
 * @returns {{e: number, n: number, u: number}} East, North, Up [m].
 */
export function ecefToENU(dx, dy, dz, lat_deg, lon_deg) {
  const lat = lat_deg * DEG_TO_RAD;
  const lon = lon_deg * DEG_TO_RAD;
  const sinLat = Math.sin(lat), cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon), cosLon = Math.cos(lon);

  const e = -sinLon * dx + cosLon * dy;
  const n = -sinLat * cosLon * dx - sinLat * sinLon * dy + cosLat * dz;
  const u =  cosLat * cosLon * dx + cosLat * sinLon * dy + sinLat * dz;
  return { e, n, u };
}

/**
 * Convert a local ENU vector to ECEF Cartesian (as a displacement vector).
 *
 * @param {number} e - East  [m].
 * @param {number} n - North [m].
 * @param {number} u - Up    [m].
 * @param {number} lat_deg - Reference geodetic latitude  [°].
 * @param {number} lon_deg - Reference longitude [°].
 * @returns {{x: number, y: number, z: number}} ECEF displacement [m].
 */
export function enuToECEF(e, n, u, lat_deg, lon_deg) {
  const lat = lat_deg * DEG_TO_RAD;
  const lon = lon_deg * DEG_TO_RAD;
  const sinLat = Math.sin(lat), cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon), cosLon = Math.cos(lon);

  const x = -sinLon * e - sinLat * cosLon * n + cosLat * cosLon * u;
  const y =  cosLon * e - sinLat * sinLon * n + cosLat * sinLon * u;
  const z =               cosLat          * n + sinLat          * u;
  return { x, y, z };
}

// ─── ENU ↔ Az/El/Range ────────────────────────────────────────────────────────

/**
 * Convert a local ENU vector to azimuth, elevation, and range.
 *
 * @param {number} e - East  [m].
 * @param {number} n - North [m].
 * @param {number} u - Up    [m].
 * @returns {{az_deg: number, el_deg: number, range_m: number}}
 *   az_deg: Azimuth in degrees, clockwise from North [0, 360).
 *   el_deg: Elevation angle in degrees (−90 to +90).
 *   range_m: Slant range in meters.
 */
export function enuToAzElRange(e, n, u) {
  const range_m = Math.sqrt(e * e + n * n + u * u);
  const el_deg  = Math.asin(u / range_m) * RAD_TO_DEG;
  const az_rad  = Math.atan2(e, n);              // CW from North
  const az_deg  = ((az_rad * RAD_TO_DEG) % 360 + 360) % 360;
  return { az_deg, el_deg, range_m };
}

/**
 * Convert azimuth, elevation, and range to a local ENU vector.
 *
 * @param {number} az_deg  - Azimuth clockwise from North [°].
 * @param {number} el_deg  - Elevation above horizon [°].
 * @param {number} range_m - Slant range [m].
 * @returns {{e: number, n: number, u: number}} ENU vector [m].
 */
export function azElRangeToENU(az_deg, el_deg, range_m) {
  const az = az_deg * DEG_TO_RAD;
  const el = el_deg * DEG_TO_RAD;
  const cosEl = Math.cos(el);
  return {
    e: range_m * cosEl * Math.sin(az),
    n: range_m * cosEl * Math.cos(az),
    u: range_m * Math.sin(el),
  };
}

// ─── ECEF ↔ ECI ───────────────────────────────────────────────────────────────

/**
 * Rotate ECEF to ECI using GMST (simplified: only Earth rotation, no polar
 * motion or nutation corrections).
 *
 * @accuracy SIMPLIFIED — ignores polar motion and nutation.
 *   For precise conversions use the full IERS model.
 *
 * @param {number} x  - ECEF x [m].
 * @param {number} y  - ECEF y [m].
 * @param {number} z  - ECEF z [m].
 * @param {number} jd - Julian Date (UT1 / UTC).
 * @returns {{x: number, y: number, z: number}} ECI position [m].
 */
export function ecefToECI(x, y, z, jd) {
  const theta = gmstFromJD(jd);
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  return {
    x: cosT * x - sinT * y,
    y: sinT * x + cosT * y,
    z,
  };
}

/**
 * Rotate ECI to ECEF (inverse of ecefToECI).
 *
 * @accuracy SIMPLIFIED — see ecefToECI.
 *
 * @param {number} x  - ECI x [m].
 * @param {number} y  - ECI y [m].
 * @param {number} z  - ECI z [m].
 * @param {number} jd - Julian Date (UT1 / UTC).
 * @returns {{x: number, y: number, z: number}} ECEF position [m].
 */
export function eciToECEF(x, y, z, jd) {
  const theta = gmstFromJD(jd);
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  return {
    x:  cosT * x + sinT * y,
    y: -sinT * x + cosT * y,
    z,
  };
}

// ─── Observer → Target ────────────────────────────────────────────────────────

/**
 * Compute azimuth, elevation, range, and horizon visibility from one geodetic
 * point to another.
 *
 * @param {number} obsLat - Observer geodetic latitude [°].
 * @param {number} obsLon - Observer longitude [°].
 * @param {number} obsAlt - Observer altitude above WGS84 ellipsoid [m].
 * @param {number} tgtLat - Target geodetic latitude [°].
 * @param {number} tgtLon - Target longitude [°].
 * @param {number} tgtAlt - Target altitude [m].
 * @returns {{az_deg: number, el_deg: number, range_m: number, aboveHorizon: boolean}}
 */
export function observerTargetAzElRange(obsLat, obsLon, obsAlt, tgtLat, tgtLon, tgtAlt) {
  const obs = geodeticToECEF(obsLat, obsLon, obsAlt);
  const tgt = geodeticToECEF(tgtLat, tgtLon, tgtAlt);
  const dx = tgt.x - obs.x;
  const dy = tgt.y - obs.y;
  const dz = tgt.z - obs.z;
  const enu = ecefToENU(dx, dy, dz, obsLat, obsLon);
  const aer = enuToAzElRange(enu.e, enu.n, enu.u);
  return { ...aer, aboveHorizon: aer.el_deg >= 0 };
}

/**
 * Alias for observerTargetAzElRange with a cleaner return shape.
 * @param {number} obsLat @param {number} obsLon @param {number} obsAlt
 * @param {number} tgtLat @param {number} tgtLon @param {number} tgtAlt
 * @returns {{above: boolean, el_deg: number, az_deg: number, range_m: number}}
 */
export function targetAboveHorizon(obsLat, obsLon, obsAlt, tgtLat, tgtLon, tgtAlt) {
  const result = observerTargetAzElRange(obsLat, obsLon, obsAlt, tgtLat, tgtLon, tgtAlt);
  return {
    above:   result.aboveHorizon,
    el_deg:  result.el_deg,
    az_deg:  result.az_deg,
    range_m: result.range_m,
  };
}

// ─── Great-circle ─────────────────────────────────────────────────────────────

/**
 * Compute the great-circle distance between two geodetic points using the
 * Vincenty formula on a sphere (mean Earth radius). For ellipsoidal distances
 * use the full Vincenty / Karney method.
 *
 * @accuracy APPROXIMATE — spherical Earth (mean radius). Error < 0.5 % for
 *   most applications; larger near the poles.
 *
 * @param {number} lat1 - Point 1 latitude [°].
 * @param {number} lon1 - Point 1 longitude [°].
 * @param {number} lat2 - Point 2 latitude [°].
 * @param {number} lon2 - Point 2 longitude [°].
 * @returns {number} Great-circle distance [m].
 */
export function greatCircleDistance(lat1, lon1, lat2, lon2) {
  const φ1 = lat1 * DEG_TO_RAD;
  const φ2 = lat2 * DEG_TO_RAD;
  const Δφ = (lat2 - lat1) * DEG_TO_RAD;
  const Δλ = (lon2 - lon1) * DEG_TO_RAD;
  const a = Math.sin(Δφ / 2) ** 2 +
            Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R_EARTH_MEAN * c;
}

/**
 * Compute initial and final bearings for the great-circle path between two
 * geodetic points.
 *
 * @param {number} lat1 @param {number} lon1
 * @param {number} lat2 @param {number} lon2
 * @returns {{initial_deg: number, final_deg: number}}
 *   Bearings are clockwise from North, in [0, 360).
 */
export function greatCircleBearing(lat1, lon1, lat2, lon2) {
  const φ1 = lat1 * DEG_TO_RAD;
  const φ2 = lat2 * DEG_TO_RAD;
  const Δλ = (lon2 - lon1) * DEG_TO_RAD;

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const initial_deg = ((Math.atan2(y, x) * RAD_TO_DEG) % 360 + 360) % 360;

  // Final bearing = reverse bearing from point 2 → point 1, reversed
  const yR = Math.sin(-Δλ) * Math.cos(φ1);
  const xR = Math.cos(φ2) * Math.sin(φ1) - Math.sin(φ2) * Math.cos(φ1) * Math.cos(-Δλ);
  const final_deg = (((Math.atan2(yR, xR) * RAD_TO_DEG) + 180) % 360 + 360) % 360;

  return { initial_deg, final_deg };
}

// ─── Solar geometry ───────────────────────────────────────────────────────────

/**
 * Approximate unit vector from Earth to Sun in J2000 ECI frame.
 *
 * @accuracy SIMPLIFIED — low-precision analytic model (Spencer 1971 / Meeus
 *   ch. 25 truncated). Accurate to ~0.01° in ecliptic longitude. Does NOT
 *   account for aberration or nutation.
 *
 * @param {number} jd - Julian Date (TT or UTC; difference negligible here).
 * @returns {{x: number, y: number, z: number}} Unit vector toward the Sun (ECI).
 */
export function sunDirectionECI(jd) {
  const T = jdToJ2000centuries(jd);

  // Geometric mean longitude of the Sun (degrees)
  const L0 = (280.46646 + 36000.76983 * T) % 360;
  // Mean anomaly of the Sun (degrees)
  const M  = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) % 360;
  const Mrad = M * DEG_TO_RAD;

  // Equation of centre (degrees)
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mrad)
           + (0.019993 - 0.000101 * T) * Math.sin(2 * Mrad)
           + 0.000289 * Math.sin(3 * Mrad);

  // Sun's true longitude (degrees)
  const sunLon = L0 + C;

  // Obliquity of the ecliptic (degrees) — approximate
  const eps = 23.439291111 - 0.013004167 * T;
  const epsRad = eps * DEG_TO_RAD;
  const lonRad = sunLon * DEG_TO_RAD;

  const x = Math.cos(lonRad);
  const y = Math.sin(lonRad) * Math.cos(epsRad);
  const z = Math.sin(lonRad) * Math.sin(epsRad);
  return { x, y, z };
}

/**
 * Compute the sub-solar point (geodetic lat/lon of the point on Earth directly
 * below the Sun) at a given Julian Date.
 *
 * @accuracy SIMPLIFIED — uses the low-precision solar model above.
 *
 * @param {number} jd - Julian Date (UTC).
 * @returns {{lat_deg: number, lon_deg: number}}
 */
export function getSubsolarPoint(jd) {
  // Sun direction in ECI
  const sun = sunDirectionECI(jd);
  // Rotate to ECEF
  const theta = gmstFromJD(jd);
  const cosT = Math.cos(theta), sinT = Math.sin(theta);
  const sx = cosT * sun.x + sinT * sun.y;
  const sy = -sinT * sun.x + cosT * sun.y;
  const sz = sun.z;

  const lat_deg = Math.asin(sz) * RAD_TO_DEG;
  const lon_deg = Math.atan2(sy, sx) * RAD_TO_DEG;
  return { lat_deg, lon_deg };
}

/**
 * Determine whether a surface point on Earth is sunlit (in daylight).
 *
 * @accuracy SIMPLIFIED — uses the low-precision solar model; does not model
 *   atmospheric refraction or partial shadow (penumbra).
 *
 * @param {number} lat_deg - Geodetic latitude [°].
 * @param {number} lon_deg - Longitude [°].
 * @param {number} jd      - Julian Date (UTC).
 * @returns {{sunlit: boolean, solarElevation_deg: number,
 *            note: string}}
 */
export function isEarthPointSunlit(lat_deg, lon_deg, jd) {
  const sub = getSubsolarPoint(jd);
  // Compute elevation of Sun above local horizon using great-circle formula
  const φ = lat_deg * DEG_TO_RAD;
  const φs = sub.lat_deg * DEG_TO_RAD;
  const Δλ = (sub.lon_deg - lon_deg) * DEG_TO_RAD;

  // Altitude angle of the Sun = 90° − zenith angle
  const sinEl = Math.sin(φ) * Math.sin(φs) +
                Math.cos(φ) * Math.cos(φs) * Math.cos(Δλ);
  const solarElevation_deg = Math.asin(Math.max(-1, Math.min(1, sinEl))) * RAD_TO_DEG;

  return {
    sunlit: solarElevation_deg > 0,
    solarElevation_deg,
    note: 'Simplified — no atmospheric refraction or penumbra modeling.',
  };
}

// ─── Local Solar Time & Time Zone ─────────────────────────────────────────────

/**
 * Compute Local Solar Time (LST) in decimal hours [0, 24).
 *
 * @accuracy APPROXIMATE — uses the equation of time from the same low-precision
 *   solar model; accurate to ~1–2 minutes.
 *
 * @param {number} lon_deg - Observer longitude [°, −180 to +180].
 * @param {number} jd      - Julian Date (UTC).
 * @returns {number} Local Solar Time in decimal hours.
 */
export function localSolarTime(lon_deg, jd) {
  const T = jdToJ2000centuries(jd);
  // Mean anomaly (degrees)
  const M = (357.52911 + 35999.05029 * T) % 360;
  // Equation of time in minutes (approximate, Meeus)
  const Mrad = M * DEG_TO_RAD;
  const eot_min = -7.655 * Math.sin(Mrad)
                + 9.873 * Math.sin(2 * Mrad + 3.588)
                + 0.439 * Math.sin(4 * Mrad + 0.072);

  const utcFraction = (jd - Math.floor(jd + 0.5) + 0.5); // fraction of UTC day [0,1)
  const utc_hours   = utcFraction * 24;
  const lst = utc_hours + lon_deg / 15 + eot_min / 60;
  return ((lst % 24) + 24) % 24;
}

/**
 * Return the nominal (theoretical) UTC offset for a longitude and a UTC band
 * label. This does NOT reflect political time zones.
 *
 * @param {number} lon_deg - Longitude [°, −180 to +180].
 * @returns {{utcOffset: number, bandLabel: string}}
 *   utcOffset: Integer hour offset from UTC (−12 to +12).
 *   bandLabel: e.g. "UTC+5".
 */
export function nominalTimeZone(lon_deg) {
  const offset = Math.round(lon_deg / 15);
  const label  = offset >= 0 ? `UTC+${offset}` : `UTC${offset}`;
  return { utcOffset: offset, bandLabel: label };
}

// ─── Line-of-sight ────────────────────────────────────────────────────────────

/**
 * Check whether two positions in ECEF have an unobstructed line of sight
 * (i.e., the line segment does not pass through the Earth's interior, modeled
 * as a sphere of mean radius).
 *
 * @param {{x:number,y:number,z:number}} pos1_ecef - First  position [m].
 * @param {{x:number,y:number,z:number}} pos2_ecef - Second position [m].
 * @returns {{clear: boolean, interceptsEarth: boolean}}
 */
export function lineOfSightCheck(pos1_ecef, pos2_ecef) {
  const { x: x1, y: y1, z: z1 } = pos1_ecef;
  const { x: x2, y: y2, z: z2 } = pos2_ecef;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const dz = z2 - z1;

  // Quadratic: |P1 + t*(P2-P1)|² = R² for t in [0,1]
  const a = dx * dx + dy * dy + dz * dz;
  const b = 2 * (x1 * dx + y1 * dy + z1 * dz);
  const c = x1 * x1 + y1 * y1 + z1 * z1 - R_EARTH_MEAN * R_EARTH_MEAN;

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) {
    return { clear: true, interceptsEarth: false };
  }

  const sqrtD = Math.sqrt(discriminant);
  const t1 = (-b - sqrtD) / (2 * a);
  const t2 = (-b + sqrtD) / (2 * a);

  // Intercepts Earth if the intersection interval overlaps [0, 1]
  const interceptsEarth = t1 < 1 && t2 > 0;
  return { clear: !interceptsEarth, interceptsEarth };
}
