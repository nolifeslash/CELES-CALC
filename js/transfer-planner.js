/**
 * @file transfer-planner.js
 * @module transferPlanner
 * @description Orbit-to-orbit transfer planning for CELES-CALC.
 *
 * Provides Hohmann, bi-elliptic, plane-change, and combined transfer
 * calculations with structured output and comparison utilities.
 *
 * Two-body (Keplerian) dynamics only.  All functions use SI units and
 * degrees unless otherwise noted.
 */

import {
  GM_EARTH,
  DEG_TO_RAD,
  PI,
  R_EARTH_MEAN,
} from './constants.js';

import {
  hohmannDeltaV,
  planeChangeDeltaV,
  visViva,
  circularVelocity,
  orbitalPeriod,
} from './orbit.js';

// ─── Hohmann transfer ───────────────────────────────────────────────────────

/**
 * Plan a Hohmann transfer between two co-planar circular orbits.
 *
 * Wraps {@link hohmannDeltaV} and adds structured output.
 *
 * @param {number} r1_m - Radius of departure circular orbit [m].
 * @param {number} r2_m - Radius of target circular orbit [m].
 * @param {number} [mu=GM_EARTH] - Gravitational parameter [m³/s²].
 * @returns {{transferType: string, dv1_m_s: number, dv2_m_s: number,
 *            totalDeltaV_m_s: number, transferTime_s: number,
 *            precisionLabel: string}}
 */
export function planHohmannTransfer(r1_m, r2_m, mu = GM_EARTH) {
  const h = hohmannDeltaV(r1_m, r2_m, mu);

  return {
    transferType:    'Hohmann',
    dv1_m_s:         h.dv1,
    dv2_m_s:         h.dv2,
    totalDeltaV_m_s: h.dvTotal,
    transferTime_s:  h.transferTime_s,
    precisionLabel:  'Two-body Keplerian — no perturbations',
  };
}

// ─── Bi-elliptic transfer ───────────────────────────────────────────────────

/**
 * Plan a bi-elliptic transfer: three burns via an intermediate apoapsis.
 *
 *   Burn 1 — depart r1 onto transfer ellipse 1 (r1 → rIntermediate)
 *   Burn 2 — at rIntermediate, transition to transfer ellipse 2
 *   Burn 3 — circularise at r2
 *
 * @param {number} r1_m             - Radius of departure orbit [m].
 * @param {number} r2_m             - Radius of target orbit [m].
 * @param {number} rIntermediate_m  - Apoapsis of intermediate transfer [m].
 * @param {number} [mu=GM_EARTH]    - Gravitational parameter [m³/s²].
 * @returns {{transferType: string, dv1_m_s: number, dv2_m_s: number,
 *            dv3_m_s: number, totalDeltaV_m_s: number, transferTime_s: number,
 *            comparisonWithHohmann: {hohmannDV_m_s: number, saving_m_s: number},
 *            precisionLabel: string}}
 */
export function planBiEllipticTransfer(r1_m, r2_m, rIntermediate_m, mu = GM_EARTH) {
  // Transfer ellipse 1: periapsis r1, apoapsis rIntermediate
  const a1 = (r1_m + rIntermediate_m) / 2;
  // Transfer ellipse 2: periapsis r2, apoapsis rIntermediate
  const a2 = (r2_m + rIntermediate_m) / 2;

  const vc1 = circularVelocity(r1_m, mu);
  const vc2 = circularVelocity(r2_m, mu);

  // Burn 1: depart r1
  const v1_departure = visViva(r1_m, a1, mu);
  const dv1 = Math.abs(v1_departure - vc1);

  // Burn 2: at intermediate apoapsis, transition ellipses
  const v_arrive_intermediate = visViva(rIntermediate_m, a1, mu);
  const v_depart_intermediate = visViva(rIntermediate_m, a2, mu);
  const dv2 = Math.abs(v_depart_intermediate - v_arrive_intermediate);

  // Burn 3: circularise at r2
  const v_arrive_r2 = visViva(r2_m, a2, mu);
  const dv3 = Math.abs(vc2 - v_arrive_r2);

  const totalDV = dv1 + dv2 + dv3;
  const transferTime_s = orbitalPeriod(a1, mu) / 2 + orbitalPeriod(a2, mu) / 2;

  // Compare with Hohmann
  const hohmann = hohmannDeltaV(r1_m, r2_m, mu);

  return {
    transferType:    'Bi-elliptic',
    dv1_m_s:         dv1,
    dv2_m_s:         dv2,
    dv3_m_s:         dv3,
    totalDeltaV_m_s: totalDV,
    transferTime_s,
    comparisonWithHohmann: {
      hohmannDV_m_s: hohmann.dvTotal,
      saving_m_s:    hohmann.dvTotal - totalDV,
    },
    precisionLabel: 'Two-body Keplerian — no perturbations',
  };
}

// ─── Plane change ───────────────────────────────────────────────────────────

/**
 * Plan a pure plane-change manoeuvre at constant speed.
 *
 * Wraps {@link planeChangeDeltaV} with structured output.
 *
 * @param {number} v_m_s       - Orbital speed at the manoeuvre point [m/s].
 * @param {number} deltaInc_deg - Plane change angle [°].
 * @returns {{transferType: string, deltaV_m_s: number, precisionLabel: string}}
 */
export function planPlaneChange(v_m_s, deltaInc_deg) {
  const dv = planeChangeDeltaV(v_m_s, deltaInc_deg);

  return {
    transferType:   'Plane change',
    deltaV_m_s:     dv,
    precisionLabel: 'Two-body Keplerian — instantaneous impulse',
  };
}

// ─── Combined transfer ──────────────────────────────────────────────────────

/**
 * Plan a combined altitude-change and/or plane-change transfer.
 *
 * Evaluates Hohmann and (optionally) bi-elliptic strategies, adds a plane
 * change leg if the inclination differs, and returns the best option.
 *
 * @accuracy SIMPLIFIED — treats altitude change and plane change as
 *   independent impulsive burns; does not optimise combined manoeuvres.
 *
 * @param {Object} params
 * @param {{a_m: number, inc_deg: number}} params.initialOrbit
 * @param {{a_m: number, inc_deg: number}} params.targetOrbit
 * @param {{biEllipticRatio?: number}} [params.options={}]
 *   `biEllipticRatio` — if provided, sets rIntermediate = ratio × max(r1, r2).
 * @returns {{transferType: string, legs: Array, totalDeltaV_m_s: number,
 *            transferTime_s: number,
 *            comparison: Object|null, precisionLabel: string}}
 */
export function planCombinedTransfer(params) {
  const { initialOrbit, targetOrbit, options = {} } = params;
  const r1 = initialOrbit.a_m;
  const r2 = targetOrbit.a_m;
  const mu = GM_EARTH;

  const legs = [];
  let totalDV = 0;
  let totalTime = 0;
  let comparison = null;

  // Altitude-change leg
  if (Math.abs(r1 - r2) > 1) {
    const hohmann = planHohmannTransfer(r1, r2, mu);
    legs.push({
      name:       'Altitude change (Hohmann)',
      type:       'transfer',
      deltaV_m_s: hohmann.totalDeltaV_m_s,
      duration_s: hohmann.transferTime_s,
    });
    totalDV   += hohmann.totalDeltaV_m_s;
    totalTime += hohmann.transferTime_s;

    // Bi-elliptic comparison if requested
    if (options.biEllipticRatio) {
      const rInt = options.biEllipticRatio * Math.max(r1, r2);
      const biE  = planBiEllipticTransfer(r1, r2, rInt, mu);
      comparison = {
        hohmann:    hohmann,
        biElliptic: biE,
        betterOption: biE.totalDeltaV_m_s < hohmann.totalDeltaV_m_s ? 'bi-elliptic' : 'Hohmann',
      };
    }
  }

  // Plane-change leg
  const deltaInc = Math.abs(targetOrbit.inc_deg - initialOrbit.inc_deg);
  if (deltaInc > 0.01) {
    const vAtTarget = circularVelocity(r2, mu);
    const pc = planPlaneChange(vAtTarget, deltaInc);
    legs.push({
      name:       `Plane change (${deltaInc.toFixed(2)}°)`,
      type:       'plane_change',
      deltaV_m_s: pc.deltaV_m_s,
      duration_s: 0,
    });
    totalDV += pc.deltaV_m_s;
  }

  return {
    transferType:    legs.length > 1 ? 'Combined' : (legs[0]?.name ?? 'None'),
    legs,
    totalDeltaV_m_s: totalDV,
    transferTime_s:  totalTime,
    comparison,
    precisionLabel:  'Two-body Keplerian — independent impulsive burns',
  };
}

// ─── Compare transfers ──────────────────────────────────────────────────────

/**
 * Rank a list of transfer options by total delta-V.
 *
 * @param {Array<{totalDeltaV_m_s: number, transferType: string}>} options
 * @returns {Array} Sorted ascending by totalDeltaV_m_s, each annotated with rank.
 */
export function compareTransfers(options) {
  const sorted = [...options].sort((a, b) => a.totalDeltaV_m_s - b.totalDeltaV_m_s);
  return sorted.map((o, idx) => ({ ...o, rank: idx + 1 }));
}
