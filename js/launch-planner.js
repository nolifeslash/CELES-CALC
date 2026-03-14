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

import {
  searchWindows,
  makeLaunchWindowEvaluator,
} from './window-search.js';

import {
  utcToJulianDate,
  julianDateToUTC,
} from './time.js';

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
 * Computes launch azimuth, Earth-rotation benefit, insertion delta-V, vehicle
 * suitability, and a ranked list of upcoming launch windows.
 *
 * Window search uses a simplified coarse scan over the requested horizon.
 * If `targetRaan_deg` is supplied the windows are scored by RAAN proximity
 * (RAAN ≈ GMST + site longitude — simplified spherical-Earth approximation).
 * If no RAAN target is given all feasible windows receive equal base scores.
 *
 * @accuracy SIMPLIFIED — engineering approximation.  Does not model full
 *   ascent trajectory, atmospheric drag profile, or staging.  RAAN targeting
 *   uses a zeroth-order Earth-rotation model; errors grow for high-latitude
 *   sites and inclinations far from the site latitude.
 *
 * @param {Object} params
 * @param {Object|string} params.site              - Site object or built-in id.
 * @param {number}        params.targetAlt_km      - Target orbit altitude [km].
 * @param {number}        params.targetInc_deg     - Target inclination [°].
 * @param {number}       [params.targetRaan_deg]   - Target RAAN [°] (optional).
 * @param {number}        params.payloadMass_kg    - Payload mass [kg].
 * @param {Object|string} params.vehicleClass      - Vehicle object or class key.
 * @param {Date|number}  [params.epoch]            - Search start (Date or JD); defaults to now.
 * @param {number}       [params.searchHorizon_days=7]  - Window search span [days].
 * @param {number}       [params.maxWindows=5]          - Max windows to return.
 * @param {number}       [params.maxDogleg_deg=10]      - Maximum acceptable dog-leg [°].
 * @returns {{feasible: boolean, azimuth_deg: number,
 *            earthRotationBenefit_m_s: number, insertionDeltaV_m_s: number,
 *            vehicleSuitability: Object, nextWindows: Array,
 *            windowSearchStats: Object, warnings: string[],
 *            precisionLabel: string}}
 */
export function planLaunch(params) {
  const {
    targetAlt_km,
    targetInc_deg,
    targetRaan_deg,
    payloadMass_kg,
    maxDogleg_deg = 10,
    searchHorizon_days = 7,
    maxWindows = 5,
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
    warnings.push(
      'RAAN targeting uses a simplified model (RAAN ≈ GMST + site longitude). ' +
      'Engineering approximation only — not a precision targeting tool.'
    );
  }

  const feasible = !azResult.dogleg_needed && vehResult.suitable && targetAlt_km >= 100;

  // ── Window search ────────────────────────────────────────────────────────
  let nextWindows       = [];
  let windowSearchStats = { evaluated: 0, feasible: 0, rejected: 0 };

  if (targetAlt_km >= 100) {
    // Resolve search start epoch (JD)
    let startJD;
    if (params.epoch !== undefined) {
      startJD = (params.epoch instanceof Date)
        ? utcToJulianDate(params.epoch)
        : Number(params.epoch);
    } else {
      startJD = utcToJulianDate(new Date());
    }

    const evaluator = makeLaunchWindowEvaluator({
      site,
      targetInc_deg,
      targetRaan_deg,
      targetAlt_km,
    });

    // Slots per day for 30-minute step: 24h × 2 = 48
    const SLOTS_PER_DAY = 48;
    const searchResult = searchWindows({
      startEpoch: startJD,
      endEpoch:   startJD + searchHorizon_days,
      stepSize_s: 1800,       // 30-minute coarse step
      evaluator,
      // Fetch enough candidates so de-clustering can select one per 18-hour period
      // across the full horizon.
      maxResults: Math.ceil(searchHorizon_days * SLOTS_PER_DAY) + maxWindows,
    });

    windowSearchStats = searchResult.searchStats;

    // De-cluster: keep at most one window per 18-hour period so results
    // are spread across the horizon rather than all piled near one peak.
    const MIN_SEP_JD = 18 / 24;
    const dedupedWindows = [];
    for (const w of searchResult.windows) {
      const tooClose = dedupedWindows.some(
        (prev) => Math.abs(w.epoch - prev.epoch) < MIN_SEP_JD
      );
      if (!tooClose) {
        dedupedWindows.push(w);
        if (dedupedWindows.length >= maxWindows) break;
      }
    }

    nextWindows = dedupedWindows.map((w, i) => ({
      rank:             i + 1,
      epoch_jd:         w.epoch,
      epochISO:         julianDateToUTC(w.epoch),
      score:            w.score,
      feasible:         w.feasible,
      reason:           w.reason,
      raanAchieved_deg: w.raanAchieved_deg ?? null,
      raanError_deg:    w.raanError_deg    ?? null,
    }));

    if (nextWindows.length === 0) {
      warnings.push(
        'No feasible windows found in the search horizon — ' +
        'check inclination accessibility from this site.'
      );
    }
  } else {
    warnings.push('Target altitude below 100 km — window search skipped.');
  }

  return {
    feasible,
    azimuth_deg:              azResult.azimuth_deg,
    earthRotationBenefit_m_s: rotResult.benefit_m_s,
    insertionDeltaV_m_s:      dvResult.deltaV_m_s,
    vehicleSuitability:       vehResult,
    nextWindows,
    windowSearchStats,
    warnings,
    precisionLabel: 'Simplified engineering approximation — not a full dynamics solver',
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
