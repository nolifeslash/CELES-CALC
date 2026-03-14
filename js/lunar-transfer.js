/**
 * @file lunar-transfer.js
 * @module lunarTransfer
 * @description Earth-to-Moon transfer planning for CELES-CALC.
 *
 * Simplified patched-two-body approximation — not full cislunar optimization.
 *
 * Uses a Hohmann-like transfer from low Earth orbit to the Moon's mean
 * orbital distance, followed by a lunar orbit insertion burn.  Window
 * scanning checks the Moon's ECI position over a time range.
 *
 * All functions use SI units and degrees unless otherwise noted.
 */

import {
  GM_EARTH,
  GM_MOON,
  R_EARTH_MEAN,
  R_MOON,
  PI,
} from './constants.js';

import {
  visViva,
  circularVelocity,
  orbitalPeriod,
} from './orbit.js';

import { moonECIApprox } from './moon.js';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Mean Earth–Moon distance [m] (used as default transfer target). */
const R_MOON_ORBIT = 384_400_000;

// ─── TLI estimate ───────────────────────────────────────────────────────────

/**
 * Estimate the trans-lunar injection (TLI) delta-V from a circular LEO.
 *
 *   a_transfer ≈ (r_departure + r_moon_orbit) / 2
 *   Δv_tli = v_transfer_periapsis − v_circular
 *
 * @accuracy SIMPLIFIED — patched-two-body; ignores lunar gravity assist,
 *   three-body effects, and departure geometry.
 *
 * @param {number} departureAlt_km  - Departure circular orbit altitude [km].
 * @param {number} [mu=GM_EARTH]    - Central body gravitational parameter [m³/s²].
 * @returns {{deltaV_m_s: number, transferDuration_s: number,
 *            precisionLabel: string}}
 */
export function estimateTLI(departureAlt_km, mu = GM_EARTH) {
  const r_dep     = R_EARTH_MEAN + departureAlt_km * 1_000;
  const a_transfer = (r_dep + R_MOON_ORBIT) / 2;

  const v_circular = circularVelocity(r_dep, mu);
  const v_tli      = visViva(r_dep, a_transfer, mu);
  const deltaV     = v_tli - v_circular;

  const transferDuration_s = orbitalPeriod(a_transfer, mu) / 2;

  return {
    deltaV_m_s:        deltaV,
    transferDuration_s,
    precisionLabel:    'Simplified patched-two-body approximation',
  };
}

// ─── LOI estimate ───────────────────────────────────────────────────────────

/**
 * Estimate the lunar orbit insertion (LOI) delta-V to capture into a
 * circular lunar orbit.
 *
 * Assumes arrival on a hyperbolic trajectory relative to the Moon with
 * excess velocity derived from the Earth–Moon transfer.
 *
 * @accuracy SIMPLIFIED — uses approximate v_infinity from vis-viva at Moon
 *   distance on the transfer ellipse, minus Moon's orbital velocity.
 *
 * @param {number} lunarOrbitAlt_km - Target circular lunar orbit altitude [km].
 * @returns {{deltaV_m_s: number, precisionLabel: string}}
 */
export function estimateLOI(lunarOrbitAlt_km) {
  const r_lunar_orbit = R_MOON + lunarOrbitAlt_km * 1_000;

  // Approximate v_infinity at Moon: velocity on transfer ellipse at Moon
  // distance minus Moon's mean orbital velocity.
  const a_transfer = (R_EARTH_MEAN + 400_000 + R_MOON_ORBIT) / 2;
  const v_arrive   = visViva(R_MOON_ORBIT, a_transfer, GM_EARTH);
  const v_moon     = circularVelocity(R_MOON_ORBIT, GM_EARTH);
  const v_inf      = Math.abs(v_arrive - v_moon);

  // Hyperbolic capture: v at periapsis of hyperbola around Moon
  const v_peri_hyp = Math.sqrt(v_inf * v_inf + 2 * GM_MOON / r_lunar_orbit);
  const v_circ_moon = circularVelocity(r_lunar_orbit, GM_MOON);

  const deltaV = v_peri_hyp - v_circ_moon;

  return {
    deltaV_m_s:     deltaV,
    precisionLabel: 'Simplified patched-two-body approximation',
  };
}

// ─── Full lunar transfer plan ───────────────────────────────────────────────

/**
 * Plan a complete Earth-to-Moon transfer.
 *
 * Combines TLI, coast, and LOI into a multi-leg mission plan with summary
 * information.  Window search returns a stub placeholder.
 *
 * @accuracy SIMPLIFIED — educational approximation; not a full cislunar
 *   trajectory optimiser.
 *
 * @param {Object} params
 * @param {number} params.departureAlt_km   - LEO departure altitude [km].
 * @param {number} params.lunarOrbitAlt_km  - Target lunar orbit altitude [km].
 * @param {number|Date} [params.departureEpoch] - Departure epoch (JD or Date).
 * @param {number} [params.payloadMass_kg]  - Payload mass [kg] (informational).
 * @returns {{feasible: boolean, tliDeltaV_m_s: number, loiDeltaV_m_s: number,
 *            totalDeltaV_m_s: number, transferDuration_s: number,
 *            missionLegs: Array, windowCandidates: Array,
 *            summary: string, precisionLabel: string}}
 */
export function planLunarTransfer(params) {
  const {
    departureAlt_km,
    lunarOrbitAlt_km,
    departureEpoch,
    payloadMass_kg,
  } = params;

  const tli = estimateTLI(departureAlt_km);
  const loi = estimateLOI(lunarOrbitAlt_km);

  const midCourseDV = 30;
  const totalDV = tli.deltaV_m_s + midCourseDV + loi.deltaV_m_s;

  const missionLegs = [
    { name: 'TLI burn',              type: 'transfer',   deltaV_m_s: tli.deltaV_m_s, duration_s: 0 },
    { name: 'Trans-lunar coast',     type: 'coast',      deltaV_m_s: 0,              duration_s: tli.transferDuration_s },
    { name: 'Mid-course correction', type: 'correction', deltaV_m_s: midCourseDV,    duration_s: 0 },
    { name: 'LOI burn',              type: 'insertion',   deltaV_m_s: loi.deltaV_m_s, duration_s: 0 },
  ];
  const departureJD = typeof departureEpoch === 'number'
    ? departureEpoch
    : departureEpoch instanceof Date
      ? (2_440_587.5 + departureEpoch.getTime() / 86_400_000)
      : (2_440_587.5 + Date.now() / 86_400_000);
  const windowScan = scanLunarWindows({
    startEpoch: departureJD - 1,
    endEpoch: departureJD + 1,
    step_s: 7200,
  });
  const windowCandidates = (windowScan.windows || []).slice(0, 3).map((w, i) => ({
    rank: i + 1,
    epoch_jd: w.epoch,
    moonDist_m: w.moonDist_m,
    score: Math.round((w.score ?? 0) * 10) / 10,
    reason: 'Simplified lunar-distance window score',
  }));

  const summary = [
    '─── Lunar Transfer Summary ───',
    `Departure altitude: ${departureAlt_km} km`,
    `Lunar orbit altitude: ${lunarOrbitAlt_km} km`,
    payloadMass_kg != null ? `Payload: ${payloadMass_kg} kg` : '',
    `TLI Δv:  ${tli.deltaV_m_s.toFixed(1)} m/s`,
    `MCC Δv:  ${midCourseDV} m/s`,
    `LOI Δv:  ${loi.deltaV_m_s.toFixed(1)} m/s`,
    `Total Δv: ${totalDV.toFixed(1)} m/s`,
    `Transfer time: ${(tli.transferDuration_s / 3_600).toFixed(1)} h`,
    'Precision: Simplified educational approximation',
  ].filter(Boolean).join('\n');

  return {
    feasible:           true,
    tliDeltaV_m_s:      tli.deltaV_m_s,
    loiDeltaV_m_s:      loi.deltaV_m_s,
    totalDeltaV_m_s:    totalDV,
    transferDuration_s: tli.transferDuration_s,
    missionLegs,
    windowCandidates,
    summary,
    precisionLabel:     'Simplified educational approximation',
  };
}

// ─── Lunar window scan ──────────────────────────────────────────────────────

/**
 * Scan for favourable lunar departure windows over a time range.
 *
 * Evaluates the Moon's position at each step and scores based on proximity
 * to an ideal geometry (Moon near the transfer orbit's line of apsides).
 *
 * @accuracy SIMPLIFIED — uses moonECIApprox; does not account for
 *   three-body dynamics or patched-conic targeting.
 *
 * @param {Object} params
 * @param {number} params.startEpoch - Start Julian Date.
 * @param {number} params.endEpoch   - End Julian Date.
 * @param {number} [params.step_s=3600] - Step size [s].
 * @returns {{windows: Array<{epoch: number, moonDist_m: number, score: number}>,
 *            bestEpoch: number|null, precisionLabel: string}}
 */
export function scanLunarWindows(params) {
  const {
    startEpoch,
    endEpoch,
    step_s = 3_600,
  } = params;

  const stepJD  = step_s / 86_400;
  const windows = [];

  for (let jd = startEpoch; jd <= endEpoch; jd += stepJD) {
    const pos  = moonECIApprox(jd);
    const dist = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);

    // Score: prefer Moon near mean distance (lower eccentricity effect)
    const distDev = Math.abs(dist - R_MOON_ORBIT) / R_MOON_ORBIT;
    const score   = Math.max(0, 100 * (1 - distDev * 10));

    windows.push({ epoch: jd, moonDist_m: dist, score });
  }

  windows.sort((a, b) => b.score - a.score);
  const bestEpoch = windows.length > 0 ? windows[0].epoch : null;

  return {
    windows,
    bestEpoch,
    precisionLabel: 'Simplified patched-two-body window scan',
  };
}
