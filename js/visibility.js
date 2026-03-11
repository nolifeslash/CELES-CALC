/**
 * @file visibility.js
 * @module visibility
 * @description Visibility and line-of-sight calculations for CELES-CALC.
 *
 * Supports observers on Earth's surface, the Moon's surface, and in space
 * (spacecraft). Supports targets that are Earth points, Moon points,
 * spacecraft, the Sun, and body-to-body views.
 *
 * All angular results are in degrees; distances in meters unless suffixed _km.
 *
 * @accuracy SIMPLIFIED — uses spherical-Earth geometry and the low-precision
 *   solar/lunar models from earth.js and moon.js. Atmospheric refraction and
 *   penumbra are not modelled except where explicitly noted.
 */

import {
  R_EARTH_MEAN,
  R_EARTH_EQUATORIAL,
  R_MOON,
  AU,
  DEG_TO_RAD,
  RAD_TO_DEG,
  PI,
} from './constants.js';
import { gmstFromJD } from './time.js';
import {
  geodeticToECEF,
  ecefToECI,
  eciToECEF,
  ecefToENU,
  enuToAzElRange,
  lineOfSightCheck,
  sunDirectionECI,
  isEarthPointSunlit,
} from './earth.js';
import {
  selenographicToLunarFixed,
  moonECIApprox,
  isMoonPointSunlit,
} from './moon.js';

// ─── Observer / target type constants ────────────────────────────────────────

/** @type {string[]} Valid observer type identifiers. */
export const OBSERVER_TYPES = [
  'earth_surface',
  'moon_surface',
  'spacecraft',
];

/** @type {string[]} Valid target type identifiers. */
export const TARGET_TYPES = [
  'earth_point',
  'moon_point',
  'spacecraft',
  'sun',
  'earth_from_moon',
  'moon_from_earth',
];

// ─── Eclipse check ────────────────────────────────────────────────────────────

/**
 * Determine whether a spacecraft in ECI is eclipsed by Earth.
 * Uses cylindrical and conical shadow models.
 *
 * @param {{x:number,y:number,z:number}} posECI - Spacecraft ECI position [m].
 * @param {{x:number,y:number,z:number}} sunECI  - Sun ECI position [m] (from Earth centre).
 * @returns {{eclipsed: boolean, partial: boolean, penumbra: boolean,
 *            angularRadius_deg: number, note: string}}
 */
export function isEclipsed(posECI, sunECI) {
  const R_sun = 6.957e8; // m — solar radius (approximate)
  const R_e   = R_EARTH_EQUATORIAL;

  const sx = sunECI.x, sy = sunECI.y, sz = sunECI.z;
  const px = posECI.x,  py = posECI.y,  pz = posECI.z;

  const sunDist = Math.sqrt(sx * sx + sy * sy + sz * sz);

  // Anti-sun unit vector (Earth → away from Sun)
  const nx = -sx / sunDist, ny = -sy / sunDist, nz = -sz / sunDist;

  // Component of spacecraft position along the anti-sun axis (shadow depth)
  const dot = px * nx + py * ny + pz * nz;

  // Perpendicular displacement from the shadow axis: perp = pos - (pos·n̂)n̂
  const perpX = px - dot * nx;
  const perpY = py - dot * ny;
  const perpZ = pz - dot * nz;
  const perpDist = Math.sqrt(perpX * perpX + perpY * perpY + perpZ * perpZ);

  // Umbral cone half-angle (converging shadow behind Earth)
  const umbralHalfAngle   = Math.asin(Math.min(1, (R_sun - R_e) / sunDist));
  // Penumbral cone half-angle (expanding partial shadow)
  const penumbraHalfAngle = Math.asin(Math.min(1, (R_sun + R_e) / sunDist));

  // Shadow radii at the spacecraft's axial distance from Earth centre
  const umbralRadius   = R_e - Math.tan(umbralHalfAngle)   * dot;
  const penumbraRadius = R_e + Math.tan(penumbraHalfAngle)  * dot;

  // Spacecraft is behind Earth (positive along anti-sun axis)
  const behindEarth = dot > 0;
  const inUmbra     = behindEarth && perpDist < umbralRadius;
  const inPenumbra  = behindEarth && !inUmbra && perpDist < penumbraRadius;

  // Angular radius of Earth from spacecraft
  const r_sc = Math.sqrt(px * px + py * py + pz * pz);
  const angularRadius_deg = Math.asin(Math.min(1, R_e / r_sc)) * RAD_TO_DEG;

  return {
    eclipsed:           inUmbra,
    partial:            inPenumbra,
    penumbra:           inPenumbra,
    angularRadius_deg,
    note: 'Conical shadow model, spherical Earth. Lunar shadow not modelled.',
  };
}

// ─── Earth-surface observer ───────────────────────────────────────────────────

/**
 * Compute visibility from an Earth-surface observer to an ECEF target point.
 *
 * @param {number} obsLat_deg  - Observer geodetic latitude  [°].
 * @param {number} obsLon_deg  - Observer longitude [°].
 * @param {number} obsAlt_m    - Observer altitude above WGS84 ellipsoid [m].
 * @param {{x:number,y:number,z:number}} targetECEF - Target ECEF position [m].
 * @param {number} jd          - Julian Date (UTC).
 * @returns {{
 *   visible: boolean, reason: string,
 *   el_deg: number, az_deg: number, range_m: number,
 *   sunlit: boolean, solarElevation_deg: number
 * }}
 */
export function earthObserverVisibility(obsLat_deg, obsLon_deg, obsAlt_m, targetECEF, jd) {
  const obsECEF = geodeticToECEF(obsLat_deg, obsLon_deg, obsAlt_m);
  const dx = targetECEF.x - obsECEF.x;
  const dy = targetECEF.y - obsECEF.y;
  const dz = targetECEF.z - obsECEF.z;
  const enu = ecefToENU(dx, dy, dz, obsLat_deg, obsLon_deg);
  const aer = enuToAzElRange(enu.e, enu.n, enu.u);
  const sun = isEarthPointSunlit(obsLat_deg, obsLon_deg, jd);

  // For a surface observer, elevation ≥ 0 is the correct and sufficient
  // visibility criterion. lineOfSightCheck uses a mean-radius sphere which
  // does not match the WGS84 ellipsoid, causing false blocks at high latitudes.
  // The LOS check is supplementary info only.
  const los = lineOfSightCheck(obsECEF, targetECEF);
  const visible = aer.el_deg >= 0;
  const reason  = aer.el_deg < 0
    ? `Target below horizon (el = ${aer.el_deg.toFixed(1)}°).`
    : `Visible at elevation ${aer.el_deg.toFixed(1)}°.`;

  return {
    visible,
    reason,
    el_deg:             aer.el_deg,
    az_deg:             aer.az_deg,
    range_m:            aer.range_m,
    earthLosBlocked:    !los.clear,
    sunlit:             sun.sunlit,
    solarElevation_deg: sun.solarElevation_deg,
  };
}

// ─── Moon-surface observer ────────────────────────────────────────────────────

/**
 * Compute visibility from a selenographic observer to a lunar-fixed target.
 *
 * @param {number} obsLat_sel  - Observer selenographic latitude  [°].
 * @param {number} obsLon_sel  - Observer selenographic longitude [°].
 * @param {number} obsAlt_m    - Observer altitude above mean lunar sphere [m].
 * @param {{x:number,y:number,z:number}} targetLunarFixed - Target lunar-fixed position [m].
 * @param {number} jd          - Julian Date (UTC).
 * @returns {{
 *   visible: boolean, reason: string,
 *   el_deg: number, az_deg: number, range_m: number,
 *   sunlit: boolean, solarElevation_deg: number
 * }}
 */
export function moonObserverVisibility(obsLat_sel, obsLon_sel, obsAlt_m, targetLunarFixed, jd) {
  const obsLF = selenographicToLunarFixed(obsLat_sel, obsLon_sel, obsAlt_m);

  // Displacement in lunar-fixed frame
  const dx = targetLunarFixed.x - obsLF.x;
  const dy = targetLunarFixed.y - obsLF.y;
  const dz = targetLunarFixed.z - obsLF.z;

  // ENU on the Moon (same math as Earth ENU, just different radius body)
  const lat = obsLat_sel * DEG_TO_RAD;
  const lon = obsLon_sel * DEG_TO_RAD;
  const sinLat = Math.sin(lat), cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon), cosLon = Math.cos(lon);
  const e = -sinLon * dx + cosLon * dy;
  const n = -sinLat * cosLon * dx - sinLat * sinLon * dy + cosLat * dz;
  const u =  cosLat * cosLon * dx + cosLat * sinLon * dy + sinLat * dz;

  const range_m = Math.sqrt(e * e + n * n + u * u);
  const el_deg  = Math.asin(u / range_m) * RAD_TO_DEG;
  const az_deg  = ((Math.atan2(e, n) * RAD_TO_DEG) % 360 + 360) % 360;

  // Check if Moon body blocks LOS (spherical Moon)
  const tgtR = Math.sqrt(targetLunarFixed.x ** 2 + targetLunarFixed.y ** 2 + targetLunarFixed.z ** 2);
  const losBlocked = _lunarLOSBlocked(obsLF, targetLunarFixed);

  const sun = isMoonPointSunlit(obsLat_sel, obsLon_sel, jd);

  const visible = el_deg >= 0 && !losBlocked;
  const reason  = losBlocked
    ? 'Moon surface blocks line of sight.'
    : el_deg < 0
      ? `Target below lunar horizon (el = ${el_deg.toFixed(1)}°).`
      : `Visible at elevation ${el_deg.toFixed(1)}°.`;

  return {
    visible,
    reason,
    el_deg,
    az_deg,
    range_m,
    sunlit:             sun.sunlit,
    solarElevation_deg: sun.solarElevation_deg,
  };
}

/**
 * Simple line-of-sight check against a spherical Moon.
 * @param {{x,y,z}} p1 @param {{x,y,z}} p2
 * @returns {boolean} True if the segment intersects the Moon's sphere.
 */
function _lunarLOSBlocked(p1, p2) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y, dz = p2.z - p1.z;
  const a = dx * dx + dy * dy + dz * dz;
  const b = 2 * (p1.x * dx + p1.y * dy + p1.z * dz);
  const c = p1.x ** 2 + p1.y ** 2 + p1.z ** 2 - R_MOON ** 2;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return false;
  const sqrtD = Math.sqrt(disc);
  const t1 = (-b - sqrtD) / (2 * a);
  const t2 = (-b + sqrtD) / (2 * a);
  return t1 < 1 && t2 > 0;
}

// ─── Spacecraft observer ──────────────────────────────────────────────────────

/**
 * Compute visibility from a spacecraft in ECI to an ECEF target.
 *
 * @param {{x:number,y:number,z:number}} scECI     - Spacecraft ECI position [m].
 * @param {{x:number,y:number,z:number}} targetECEF - Target ECEF position [m].
 * @param {number} jd - Julian Date (UTC).
 * @returns {{
 *   visible: boolean, reason: string,
 *   el_deg: number, az_deg: number, range_m: number,
 *   sunlit: boolean, eclipsed: boolean
 * }}
 */
export function spacecraftVisibility(scECI, targetECEF, jd) {
  // Convert spacecraft to ECEF for LOS check
  const scECEF = eciToECEF(scECI.x, scECI.y, scECI.z, jd);

  const dx = targetECEF.x - scECEF.x;
  const dy = targetECEF.y - scECEF.y;
  const dz = targetECEF.z - scECEF.z;
  const range_m = Math.sqrt(dx * dx + dy * dy + dz * dz);

  // Nadir angle: angle between spacecraft nadir and target direction
  const scR  = Math.sqrt(scECEF.x ** 2 + scECEF.y ** 2 + scECEF.z ** 2);
  const nadirX = -scECEF.x / scR, nadirY = -scECEF.y / scR, nadirZ = -scECEF.z / scR;
  const cosEl = (dx * nadirX + dy * nadirY + dz * nadirZ) / range_m;
  const el_deg = Math.acos(Math.max(-1, Math.min(1, cosEl))) * RAD_TO_DEG - 90;

  // Azimuth from spacecraft nadir frame (simplified: relative to East)
  const lat_sc = Math.asin(scECEF.z / scR) * RAD_TO_DEG;
  const lon_sc = Math.atan2(scECEF.y, scECEF.x) * RAD_TO_DEG;
  const enu = ecefToENU(dx, dy, dz, lat_sc, lon_sc);
  const aer = enuToAzElRange(enu.e, enu.n, enu.u);
  const az_deg = aer.az_deg;

  const los = lineOfSightCheck(scECEF, targetECEF);

  // Eclipse check
  const sunDir = sunDirectionECI(jd);
  const sunECI = {
    x: sunDir.x * AU, y: sunDir.y * AU, z: sunDir.z * AU,
  };
  const ecl = isEclipsed(scECI, sunECI);

  const visible = los.clear;
  const reason  = !los.clear
    ? 'Earth blocks line of sight.'
    : `Target in view, range ${(range_m / 1000).toFixed(1)} km.`;

  return {
    visible,
    reason,
    el_deg: aer.el_deg,
    az_deg,
    range_m,
    sunlit:   !ecl.eclipsed && !ecl.partial,
    eclipsed: ecl.eclipsed,
  };
}

// ─── Generic dispatcher ───────────────────────────────────────────────────────

/**
 * Compute visibility between an observer and a target using typed descriptors.
 *
 * observer shape: { type, lat_deg?, lon_deg?, alt_m?, x_eci?, y_eci?, z_eci?,
 *                   x_ecef?, y_ecef?, z_ecef?, lat_sel?, lon_sel? }
 * target  shape: { type, lat_deg?, lon_deg?, alt_m?, x_eci?, y_eci?, z_eci?,
 *                   x_ecef?, y_ecef?, z_ecef?, lat_sel?, lon_sel? }
 *
 * @param {object} observer - Observer descriptor (see above).
 * @param {object} target   - Target descriptor (see above).
 * @param {object} scenario - Scenario object (for jd).
 * @returns {{visible: boolean, reason: string, el_deg: number, az_deg: number,
 *            range_m: number, sunlit: boolean, note: string}}
 */
export function isTargetVisible(observer, target, scenario) {
  const jd = scenario?.timeInput?.jd ?? 2_451_545.0;
  const note = 'Simplified two-body / low-precision models.';

  // ── Earth surface observer ────────────────────────────────────────────────
  if (observer.type === 'earth_surface') {
    const obsLat = observer.lat_deg ?? 0;
    const obsLon = observer.lon_deg ?? 0;
    const obsAlt = observer.alt_m   ?? 0;

    let targetECEF;
    if (target.type === 'earth_point' || target.type === 'moon_from_earth') {
      if (target.type === 'moon_from_earth') {
        // Target is the Moon's centre
        const moonECI = moonECIApprox(jd);
        targetECEF = eciToECEF(moonECI.x, moonECI.y, moonECI.z, jd);
      } else {
        targetECEF = target.x_ecef != null
          ? { x: target.x_ecef, y: target.y_ecef, z: target.z_ecef }
          : geodeticToECEF(target.lat_deg ?? 0, target.lon_deg ?? 0, target.alt_m ?? 0);
      }
      const result = earthObserverVisibility(obsLat, obsLon, obsAlt, targetECEF, jd);
      return { ...result, note };
    }

    if (target.type === 'spacecraft') {
      const tgtECI = { x: target.x_eci, y: target.y_eci, z: target.z_eci };
      const tgtECEF = eciToECEF(tgtECI.x, tgtECI.y, tgtECI.z, jd);
      const result = earthObserverVisibility(obsLat, obsLon, obsAlt, tgtECEF, jd);
      return { ...result, note };
    }

    if (target.type === 'sun') {
      const sunDir = sunDirectionECI(jd);
      const sunECEF = eciToECEF(sunDir.x * AU, sunDir.y * AU, sunDir.z * AU, jd);
      const result = earthObserverVisibility(obsLat, obsLon, obsAlt, sunECEF, jd);
      return { ...result, note: 'Sun direction from Earth surface.' };
    }
  }

  // ── Moon surface observer ─────────────────────────────────────────────────
  if (observer.type === 'moon_surface') {
    const obsLat = observer.lat_sel  ?? observer.lat_deg ?? 0;
    const obsLon = observer.lon_sel  ?? observer.lon_deg ?? 0;
    const obsAlt = observer.alt_m    ?? 0;

    if (target.type === 'moon_point') {
      const tgtLF = target.x != null
        ? { x: target.x, y: target.y, z: target.z }
        : selenographicToLunarFixed(target.lat_sel ?? 0, target.lon_sel ?? 0, target.alt_m ?? 0);
      const result = moonObserverVisibility(obsLat, obsLon, obsAlt, tgtLF, jd);
      return { ...result, note };
    }

    if (target.type === 'earth_from_moon') {
      // Earth direction in lunar-fixed frame: Moon's x-axis points to Earth (mean)
      const earthLF = { x: R_MOON * 60 * 1_000, y: 0, z: 0 }; // far point toward Earth
      const result = moonObserverVisibility(obsLat, obsLon, obsAlt, earthLF, jd);
      return { ...result, note: 'Earth direction approx. along lunar x-axis (mean libration).' };
    }

    if (target.type === 'spacecraft') {
      // Convert spacecraft ECI to lunar-fixed
      const moonECI = moonECIApprox(jd);
      const moonECEF = eciToECEF(moonECI.x, moonECI.y, moonECI.z, jd);
      const scECEF  = eciToECEF(target.x_eci, target.y_eci, target.z_eci, jd);
      const relX = scECEF.x - moonECEF.x;
      const relY = scECEF.y - moonECEF.y;
      const relZ = scECEF.z - moonECEF.z;
      const result = moonObserverVisibility(obsLat, obsLon, obsAlt, { x: relX, y: relY, z: relZ }, jd);
      return { ...result, note: 'Spacecraft position relative to Moon (simplified).' };
    }
  }

  // ── Spacecraft observer ───────────────────────────────────────────────────
  if (observer.type === 'spacecraft') {
    const scECI = { x: observer.x_eci, y: observer.y_eci, z: observer.z_eci };

    if (target.type === 'earth_point') {
      const tgtECEF = target.x_ecef != null
        ? { x: target.x_ecef, y: target.y_ecef, z: target.z_ecef }
        : geodeticToECEF(target.lat_deg ?? 0, target.lon_deg ?? 0, target.alt_m ?? 0);
      const result = spacecraftVisibility(scECI, tgtECEF, jd);
      return { ...result, note };
    }

    if (target.type === 'spacecraft') {
      const tgtECI  = { x: target.x_eci, y: target.y_eci, z: target.z_eci };
      const tgtECEF = eciToECEF(tgtECI.x, tgtECI.y, tgtECI.z, jd);
      const result = spacecraftVisibility(scECI, tgtECEF, jd);
      return { ...result, note };
    }
  }

  return {
    visible: false,
    reason: `Unsupported observer type "${observer.type}" or target type "${target.type}".`,
    el_deg: null, az_deg: null, range_m: null,
    sunlit: null,
    note,
  };
}

// ─── Human-readable summary ───────────────────────────────────────────────────

/**
 * Produce a human-readable one-line visibility summary.
 *
 * @param {object} observer - Observer descriptor.
 * @param {object} target   - Target descriptor.
 * @param {number} jd       - Julian Date (UTC).
 * @returns {string} Summary string.
 */
export function visibilitySummary(observer, target, jd) {
  const scenario = { timeInput: { jd } };
  const result = isTargetVisible(observer, target, scenario);

  const rangeTxt = result.range_m != null
    ? `, range ${(result.range_m / 1000).toFixed(1)} km`
    : '';
  const elTxt = result.el_deg != null ? `, el ${result.el_deg.toFixed(1)}°` : '';
  const azTxt = result.az_deg != null ? `, az ${result.az_deg.toFixed(1)}°` : '';

  const status = result.visible ? 'VISIBLE' : 'NOT VISIBLE';
  return `[${status}] ${result.reason}${elTxt}${azTxt}${rangeTxt}`;
}
