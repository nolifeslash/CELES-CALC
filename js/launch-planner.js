/**
 * @file launch-planner.js
 * @module launchPlanner
 * @description Launch-to-orbit feasibility calculator for CELES-CALC.
 *
 * Mission-planning access tool, not a full launch dynamics solver.
 * Combines launch-site geometry, vehicle suitability, and simplified
 * insertion delta-V estimation to produce a quick feasibility report.
 *
 * All functions use SI units and degrees unless otherwise noted.
 */

import {
  BUILTIN_SITES,
  launchAzimuthForInclination,
  earthRotationBenefit,
  accessibleInclinations,
  siteToOrbitFeasibility,
} from './launch-sites.js';

import {
  VEHICLE_CLASSES,
  vehicleSuitability,
  estimateInsertionDeltaV,
} from './launch-vehicles.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Resolve a site parameter that may be an object or a built-in site id.
 * @param {Object|string} site
 * @returns {{lat_deg: number, lon_deg: number, name: string}}
 */
function resolveSite(site) {
  if (typeof site === 'string') {
    const found = BUILTIN_SITES.find((s) => s.id === site);
    if (!found) throw new Error(`Unknown built-in site id: "${site}".`);
    return found;
  }
  return site;
}

/**
 * Resolve a vehicle class that may be an object or a VEHICLE_CLASSES key.
 * @param {Object|string} vehicleClass
 * @returns {Object}
 */
function resolveVehicle(vehicleClass) {
  if (typeof vehicleClass === 'string') {
    const found = VEHICLE_CLASSES[vehicleClass];
    if (!found) throw new Error(`Unknown vehicle class: "${vehicleClass}".`);
    return found;
  }
  return vehicleClass;
}

// ─── Launch planning ────────────────────────────────────────────────────────

/**
 * Plan a launch from a site to a target orbit.
 *
 * Computes launch azimuth, Earth-rotation benefit, insertion delta-V, and
 * vehicle suitability.  Window search is a placeholder — returns an empty
 * array for `nextWindows`.
 *
 * @accuracy SIMPLIFIED — educational approximation; does not model full
 *   ascent trajectory, atmospheric drag profile, or staging.
 *
 * @param {Object} params
 * @param {Object|string} params.site          - Site object or built-in id.
 * @param {number}        params.targetAlt_km  - Target orbit altitude [km].
 * @param {number}        params.targetInc_deg - Target inclination [°].
 * @param {number}       [params.targetRaan_deg] - Target RAAN [°] (optional).
 * @param {number}        params.payloadMass_kg - Payload mass [kg].
 * @param {Object|string} params.vehicleClass  - Vehicle object or class key.
 * @param {Date|number}  [params.epoch]        - Epoch (Date or JD).
 * @param {number}       [params.maxDogleg_deg=10] - Maximum acceptable dog-leg [°].
 * @returns {{feasible: boolean, azimuth_deg: number,
 *            earthRotationBenefit_m_s: number, insertionDeltaV_m_s: number,
 *            vehicleSuitability: Object, nextWindows: Array,
 *            warnings: string[], precisionLabel: string}}
 */
export function planLaunch(params) {
  const {
    targetAlt_km,
    targetInc_deg,
    targetRaan_deg,
    payloadMass_kg,
    maxDogleg_deg = 10,
  } = params;

  const site    = resolveSite(params.site);
  const vehicle = resolveVehicle(params.vehicleClass);
  const warnings = [];

  // Azimuth & rotation benefit
  const azResult  = launchAzimuthForInclination(site.lat_deg, targetInc_deg);
  const rotResult = earthRotationBenefit(site.lat_deg);

  if (azResult.dogleg_needed) {
    warnings.push(azResult.note);
  }

  // Insertion delta-V
  const dvResult = estimateInsertionDeltaV(targetAlt_km, targetInc_deg, site.lat_deg);

  // Vehicle suitability
  const vehResult = vehicleSuitability(vehicle, payloadMass_kg, {
    alt_km:  targetAlt_km,
    inc_deg: targetInc_deg,
  });

  if (!vehResult.suitable) {
    warnings.push(`Vehicle "${vehicle.name}" may not have sufficient capacity.`);
  }

  if (targetRaan_deg !== undefined) {
    warnings.push('RAAN-targeted launch window search is a placeholder — not yet implemented.');
  }

  const feasible = !azResult.dogleg_needed && vehResult.suitable && targetAlt_km >= 100;

  return {
    feasible,
    azimuth_deg:              azResult.azimuth_deg,
    earthRotationBenefit_m_s: rotResult.benefit_m_s,
    insertionDeltaV_m_s:      dvResult.deltaV_m_s,
    vehicleSuitability:       vehResult,
    nextWindows:              [],
    warnings,
    precisionLabel:           'Simplified educational approximation',
  };
}

// ─── Quick feasibility ──────────────────────────────────────────────────────

/**
 * Quick feasibility check: can a site/vehicle/orbit combination work?
 *
 * @param {{lat_deg: number, lon_deg: number}} site
 * @param {{alt_km: number, inc_deg: number}} orbit
 * @param {{payloadLEO_kg?: number, payloadGTO_kg?: number}} vehicle
 * @returns {{feasible: boolean, warnings: string[], precisionLabel: string}}
 */
export function assessLaunchFeasibility(site, orbit, vehicle) {
  const siteResult = siteToOrbitFeasibility(site, orbit);
  const vehResult  = vehicleSuitability(vehicle, 0, orbit);

  const feasible = siteResult.feasible && vehResult.suitable;

  return {
    feasible,
    warnings:       [...siteResult.warnings, ...vehResult.notes],
    precisionLabel: 'Simplified educational approximation',
  };
}
