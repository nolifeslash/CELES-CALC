/**
 * @file window-search.js
 * @module windowSearch
 * @description Generic window search engine reusable for launch, phasing,
 * lunar departure, and transfer window analysis in CELES-CALC.
 *
 * The engine iterates over a time span, evaluates a user-supplied scoring
 * function at each step, and returns ranked windows of opportunity.
 *
 * All epoch values are Julian Dates (JD) unless otherwise noted.
 */

import { gmstFromJD } from './time.js';
import { launchAzimuthForInclination } from './launch-sites.js';

// ─── Coarse search ──────────────────────────────────────────────────────────

/**
 * Evaluate a scoring function at regular intervals across a time span.
 *
 * @param {number}   startEpoch - Start Julian Date.
 * @param {number}   endEpoch   - End Julian Date.
 * @param {number}   step_s     - Step size [s].
 * @param {function} evaluator  - `(epoch) => {score: number, feasible: boolean, reason: string}`.
 * @returns {Array<{epoch: number, score: number, feasible: boolean, reason: string}>}
 *   All evaluated windows, unsorted.
 */
export function coarseSearch(startEpoch, endEpoch, step_s, evaluator) {
  const stepJD  = step_s / 86_400;
  const results = [];

  for (let jd = startEpoch; jd <= endEpoch; jd += stepJD) {
    const result = evaluator(jd);
    results.push({
      epoch:    jd,
      ...result,
      score:    result.score    ?? 0,
      feasible: result.feasible ?? false,
      reason:   result.reason   ?? '',
    });
  }

  return results;
}

// ─── Refine window ──────────────────────────────────────────────────────────

/**
 * Narrow down a found window by re-evaluating with a finer step around its
 * epoch.
 *
 * @param {{epoch: number}} window         - Coarse window to refine.
 * @param {function}        evaluator      - Same evaluator used in coarse search.
 * @param {number}          refinementStep_s - Finer step size [s].
 * @returns {{epoch: number, score: number, feasible: boolean, reason: string}}
 *   Best refined window.
 */
export function refineWindow(window, evaluator, refinementStep_s) {
  const halfSpan = refinementStep_s * 10 / 86_400;
  const stepJD   = refinementStep_s / 86_400;

  let best = { epoch: window.epoch, score: -Infinity, feasible: false, reason: '' };

  for (let jd = window.epoch - halfSpan; jd <= window.epoch + halfSpan; jd += stepJD) {
    const result = evaluator(jd);
    if (result.score > best.score) {
      best = {
        epoch:    jd,
        score:    result.score    ?? 0,
        feasible: result.feasible ?? false,
        reason:   result.reason   ?? '',
      };
    }
  }

  return best;
}

// ─── Rank windows ───────────────────────────────────────────────────────────

/**
 * Sort an array of windows by a chosen criterion.
 *
 * @param {Array<{epoch: number, score: number, feasible: boolean}>} windows
 * @param {'score'|'time'|'feasibility'} [sortBy='score'] - Sort criterion.
 * @returns {Array} Sorted (descending for score, ascending for time).
 */
export function rankWindows(windows, sortBy = 'score') {
  const sorted = [...windows];

  switch (sortBy) {
    case 'time':
      sorted.sort((a, b) => a.epoch - b.epoch);
      break;
    case 'feasibility':
      sorted.sort((a, b) => (b.feasible ? 1 : 0) - (a.feasible ? 1 : 0) || b.score - a.score);
      break;
    case 'score':
    default:
      sorted.sort((a, b) => b.score - a.score);
      break;
  }

  return sorted;
}

// ─── Full search pipeline ───────────────────────────────────────────────────

/**
 * Run a complete window search: coarse scan, optional refinement, ranking.
 *
 * @param {Object}   params
 * @param {number}   params.startEpoch  - Start Julian Date.
 * @param {number}   params.endEpoch    - End Julian Date.
 * @param {number}   params.stepSize_s  - Coarse step size [s].
 * @param {function} params.evaluator   - Scoring function `(epoch) => {score, feasible, reason}`.
 * @param {number}  [params.maxResults=10] - Maximum windows to return.
 * @returns {{windows: Array<{epoch: number, score: number, feasible: boolean, reason: string}>,
 *            bestWindow: Object|null,
 *            searchStats: {evaluated: number, feasible: number, rejected: number},
 *            precisionLabel: string}}
 */
export function searchWindows(params) {
  const {
    startEpoch,
    endEpoch,
    stepSize_s,
    evaluator,
    maxResults = 10,
  } = params;

  const raw = coarseSearch(startEpoch, endEpoch, stepSize_s, evaluator);

  const feasibleCount = raw.filter((w) => w.feasible).length;
  const ranked        = rankWindows(raw, 'score').slice(0, maxResults);

  return {
    windows:    ranked,
    bestWindow: ranked.length > 0 ? ranked[0] : null,
    searchStats: {
      evaluated: raw.length,
      feasible:  feasibleCount,
      rejected:  raw.length - feasibleCount,
    },
    precisionLabel: 'Generic window search — precision depends on evaluator',
  };
}

// ─── Launch window evaluator ─────────────────────────────────────────────────

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Build a launch-window scoring function for use with `searchWindows`.
 *
 * The evaluator scores each candidate epoch by:
 *   1. Inclination feasibility — whether the site latitude can reach `targetInc_deg`
 *      without a dog-leg maneuver.
 *   2. RAAN proximity (if `targetRaan_deg` is supplied) — how closely the achieved
 *      RAAN matches the target using a coarse Earth-rotation model:
 *        RAAN_achieved ≈ GMST + site.lon_deg  (simplified spherical-Earth)
 *   3. Earth-rotation benefit — a small latitude-based bonus favouring equatorial sites.
 *
 * @accuracy SIMPLIFIED — engineering approximation.
 *   - RAAN model uses GMST + site longitude (zeroth-order; ignores orbit-plane geometry).
 *   - Does not model ascent trajectory, atmospheric drag, or staging.
 *   - Intended for planning-level window selection, not precision targeting.
 *
 * @param {Object}         params
 * @param {{lat_deg: number, lon_deg: number, name?: string}} params.site
 * @param {number}         params.targetInc_deg   - Target orbit inclination [°].
 * @param {number}        [params.targetRaan_deg]  - Target RAAN [°] (optional).
 * @param {number}        [params.targetAlt_km]   - Target orbit altitude [km] (for feasibility).
 * @returns {function(epoch_jd: number): {score: number, feasible: boolean, reason: string,
 *            raanAchieved_deg: number, raanError_deg: number|null}}
 */
export function makeLaunchWindowEvaluator(params) {
  const { site, targetInc_deg, targetRaan_deg, targetAlt_km } = params;

  // Pre-compute inclination feasibility — time-independent
  const azResult = launchAzimuthForInclination(site.lat_deg, targetInc_deg);
  const incFeasible = !azResult.dogleg_needed;

  // Minimum altitude sanity check
  const altFeasible = targetAlt_km == null || targetAlt_km >= 100;

  // Earth rotation latitude bonus weight (small, ≤ 0.1)
  const latBonus = 0.1 * Math.cos(site.lat_deg * DEG_TO_RAD);

  return function evaluateLaunchWindow(epoch_jd) {
    // Approximate RAAN achievable from this site at this epoch.
    // RAAN ≈ GMST_deg + site.lon_deg  (simplified — no orbit-plane correction)
    const gmst_rad = gmstFromJD(epoch_jd);
    const gmst_deg = gmst_rad * RAD_TO_DEG;
    const raanAchieved_deg = ((gmst_deg + site.lon_deg) % 360 + 360) % 360;

    // ── Inclination feasibility (primary gate) ───────────────────────────────
    if (!incFeasible) {
      return {
        score:            0,
        feasible:         false,
        reason:           `Inclination ${targetInc_deg.toFixed(1)}° unreachable from lat ${site.lat_deg.toFixed(1)}° without dog-leg`,
        raanAchieved_deg: Math.round(raanAchieved_deg * 10) / 10,
        raanError_deg:    null,
      };
    }

    if (!altFeasible) {
      return {
        score:            0,
        feasible:         false,
        reason:           `Target altitude ${targetAlt_km} km is below minimum (100 km)`,
        raanAchieved_deg: Math.round(raanAchieved_deg * 10) / 10,
        raanError_deg:    null,
      };
    }

    // ── RAAN proximity score ─────────────────────────────────────────────────
    let raanError_deg = null;
    let raanScore     = 1.0;
    const reasons     = [];

    if (targetRaan_deg != null) {
      // Shortest angular distance, normalised to [0, 180]
      raanError_deg = Math.abs(((raanAchieved_deg - targetRaan_deg + 180 + 360) % 360) - 180);
      // cos²(Δ/2): 1.0 at perfect alignment, 0.0 at 180° opposite
      raanScore = Math.cos((raanError_deg / 2) * DEG_TO_RAD) ** 2;

      if (raanError_deg < 5) {
        reasons.push(`Excellent RAAN alignment (Δ${raanError_deg.toFixed(1)}°)`);
      } else if (raanError_deg < 20) {
        reasons.push(`Good RAAN alignment (Δ${raanError_deg.toFixed(1)}°)`);
      } else if (raanError_deg < 45) {
        reasons.push(`Moderate RAAN offset Δ${raanError_deg.toFixed(1)}° — small plane-change penalty`);
      } else {
        reasons.push(`Large RAAN offset Δ${raanError_deg.toFixed(1)}° — significant plane-change cost`);
      }
    } else {
      reasons.push('No RAAN target — inclination-only scoring');
    }

    reasons.push(`Direct insertion feasible (az ${azResult.azimuth_deg.toFixed(1)}°)`);

    // ── Combined score ───────────────────────────────────────────────────────
    const score = Math.max(0, raanScore + latBonus * raanScore);

    return {
      score:            Math.round(score * 1000) / 1000,
      feasible:         true,
      reason:           reasons.join('; '),
      raanAchieved_deg: Math.round(raanAchieved_deg * 10) / 10,
      raanError_deg:    raanError_deg != null ? Math.round(raanError_deg * 10) / 10 : null,
    };
  };
}
