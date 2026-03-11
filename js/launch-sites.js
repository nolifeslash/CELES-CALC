/**
 * @file launch-sites.js
 * @module launchSites
 * @description Launch site data, access logic, and site-to-orbit feasibility
 * assessments for CELES-CALC.
 *
 * Provides built-in launch site coordinates, azimuth calculations for a
 * desired orbital inclination, Earth-rotation velocity benefit, and
 * accessible-inclination ranges.
 *
 * All functions use SI units and degrees unless otherwise noted.
 */

import { DEG_TO_RAD, RAD_TO_DEG, R_EARTH_MEAN } from './constants.js';

// ─── Built-in launch sites ──────────────────────────────────────────────────

/**
 * A small set of hardcoded major launch sites.
 *
 * @type {Array<{id: string, name: string, lat_deg: number, lon_deg: number, country: string}>}
 */
export const BUILTIN_SITES = [
  { id: 'cape_canaveral', name: 'Cape Canaveral',      lat_deg: 28.46,  lon_deg: -80.53,  country: 'USA' },
  { id: 'baikonur',       name: 'Baikonur Cosmodrome', lat_deg: 45.92,  lon_deg:  63.34,  country: 'Kazakhstan' },
  { id: 'kourou',         name: 'Kourou (CSG)',        lat_deg:  5.23,  lon_deg: -52.77,  country: 'French Guiana' },
  { id: 'vandenberg',     name: 'Vandenberg SFB',      lat_deg: 34.63,  lon_deg: -120.57, country: 'USA' },
];

// ─── Data loading ───────────────────────────────────────────────────────────

/**
 * Parse launch site records from an external JSON array.
 *
 * Each element must contain at least `id`, `name`, `lat_deg`, and `lon_deg`.
 * Extra fields are preserved.
 *
 * @param {Array<Object>} jsonArray - Raw array of site objects.
 * @returns {Array<{id: string, name: string, lat_deg: number, lon_deg: number}>}
 */
export function loadLaunchSites(jsonArray) {
  if (!Array.isArray(jsonArray)) {
    throw new Error('loadLaunchSites expects an array of site objects.');
  }
  return jsonArray.map((s) => ({
    id:      String(s.id   || s.name || 'unknown'),
    name:    String(s.name || s.id   || 'Unknown'),
    lat_deg: Number(s.lat_deg ?? s.lat ?? 0),
    lon_deg: Number(s.lon_deg ?? s.lon ?? 0),
    ...s,
  }));
}

// ─── Launch azimuth ─────────────────────────────────────────────────────────

/**
 * Compute the required launch azimuth to achieve a given orbital inclination
 * from a site at latitude `siteLat_deg`.
 *
 *   sin(azimuth) = cos(i) / cos(lat)
 *
 * When cos(i)/cos(lat) > 1 the inclination is unreachable directly; a
 * dog-leg manoeuvre is required.
 *
 * @accuracy SIMPLIFIED — assumes spherical Earth, instantaneous insertion,
 *   and no atmospheric or rotation effects beyond the basic trig relation.
 *
 * @param {number} siteLat_deg   - Launch site geodetic latitude [°].
 * @param {number} targetInc_deg - Desired orbital inclination [°, 0–180].
 * @returns {{azimuth_deg: number, dogleg_needed: boolean, note: string, precisionLabel: string}}
 */
export function launchAzimuthForInclination(siteLat_deg, targetInc_deg) {
  const latRad = Math.abs(siteLat_deg) * DEG_TO_RAD;
  const incRad = targetInc_deg * DEG_TO_RAD;

  const sinAz = Math.cos(incRad) / Math.cos(latRad);

  if (Math.abs(sinAz) > 1) {
    return {
      azimuth_deg:    NaN,
      dogleg_needed:  true,
      note:           `Inclination ${targetInc_deg}° unreachable from latitude ${siteLat_deg}° without a dog-leg manoeuvre.`,
      precisionLabel: 'Simplified spherical-Earth approximation',
    };
  }

  const azDeg = Math.asin(sinAz) * RAD_TO_DEG;
  return {
    azimuth_deg:    azDeg,
    dogleg_needed:  false,
    note:           'Direct insertion feasible.',
    precisionLabel: 'Simplified spherical-Earth approximation',
  };
}

// ─── Earth rotation benefit ─────────────────────────────────────────────────

/**
 * Velocity benefit from Earth's rotation at a given latitude.
 *
 * v_benefit ≈ 465.1 · cos(lat)   [m/s]
 *
 * @accuracy SIMPLIFIED — uses mean equatorial rotation speed (465.1 m/s).
 *
 * @param {number} siteLat_deg - Geodetic latitude [°].
 * @returns {{benefit_m_s: number, precisionLabel: string}}
 */
export function earthRotationBenefit(siteLat_deg) {
  const EQUATORIAL_SPEED_M_S = 465.1;
  const latRad = siteLat_deg * DEG_TO_RAD;
  return {
    benefit_m_s:    EQUATORIAL_SPEED_M_S * Math.cos(latRad),
    precisionLabel: 'Simplified — mean equatorial rotation speed',
  };
}

// ─── Accessible inclinations ────────────────────────────────────────────────

/**
 * Return the range of orbital inclinations directly reachable from a launch
 * site at a given latitude (no dog-leg).
 *
 * Minimum achievable inclination equals the site latitude; maximum is
 * 180° − latitude.  Retrograde orbits (i > 90°) are always geometrically
 * possible but may carry a delta-v penalty.
 *
 * @param {number} siteLat_deg - Geodetic latitude [°].
 * @returns {{min_deg: number, max_deg: number, retrograde_possible: boolean, precisionLabel: string}}
 */
export function accessibleInclinations(siteLat_deg) {
  const absLat = Math.abs(siteLat_deg);
  return {
    min_deg:              absLat,
    max_deg:              180 - absLat,
    retrograde_possible:  true,
    precisionLabel:       'Geometric constraint — spherical Earth',
  };
}

// ─── Site-to-orbit feasibility ──────────────────────────────────────────────

/**
 * Assess whether a launch site can reach a target orbit.
 *
 * Checks inclination accessibility, estimates the Earth-rotation benefit,
 * and flags potential issues.
 *
 * @accuracy SIMPLIFIED — geometric constraints only, no atmospheric or
 *   range-safety analysis.
 *
 * @param {{lat_deg: number, lon_deg: number, name?: string}} site
 *   Launch site with at minimum `lat_deg` and `lon_deg`.
 * @param {{alt_km: number, inc_deg: number}} targetOrbit
 *   Target orbit altitude [km] and inclination [°].
 * @returns {{feasible: boolean, azimuth_deg: number, rotationBenefit_m_s: number,
 *            dogleg_needed: boolean, warnings: string[], precisionLabel: string}}
 */
export function siteToOrbitFeasibility(site, targetOrbit) {
  const warnings = [];

  const azResult   = launchAzimuthForInclination(site.lat_deg, targetOrbit.inc_deg);
  const rotBenefit = earthRotationBenefit(site.lat_deg);
  const access     = accessibleInclinations(site.lat_deg);

  if (azResult.dogleg_needed) {
    warnings.push(azResult.note);
  }
  if (targetOrbit.inc_deg > 90) {
    warnings.push('Retrograde orbit — Earth-rotation benefit becomes a penalty.');
  }
  if (targetOrbit.alt_km < 160) {
    warnings.push('Target altitude below 160 km — orbit will decay rapidly.');
  }

  const feasible = !azResult.dogleg_needed && targetOrbit.alt_km >= 100;

  return {
    feasible,
    azimuth_deg:          azResult.azimuth_deg,
    rotationBenefit_m_s:  rotBenefit.benefit_m_s,
    dogleg_needed:        azResult.dogleg_needed,
    inclination_range:    access,
    warnings,
    precisionLabel:       'Simplified educational approximation',
  };
}
