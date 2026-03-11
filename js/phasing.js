/**
 * @file phasing.js
 * @module phasing
 * @description Phasing orbit and simplified rendezvous / proximity operations
 * (RPO) planning for CELES-CALC.
 *
 * Close-approach logic is simplified and clearly labeled — not a high-fidelity
 * relative-motion solver.
 *
 * All functions use SI units and degrees unless otherwise noted.
 */

import { GM_EARTH, PI, R_EARTH_MEAN, DEG_TO_RAD } from './constants.js';
import { orbitalPeriod, circularVelocity, visViva } from './orbit.js';

// ─── Phasing orbit ──────────────────────────────────────────────────────────

/**
 * Compute a phasing orbit to close a phase angle after `numOrbits` phasing
 * revolutions.
 *
 * The chaser's phasing orbit period is adjusted so that after `numOrbits`
 * revolutions the chaser arrives at the target's current position.
 *
 *   T_phasing = T_target − (phaseAngle / 360) × T_target / numOrbits
 *
 * @accuracy SIMPLIFIED — two-body, co-planar, circular target orbit.
 *
 * @param {{a_m: number}} targetOrbit     - Target orbit (semi-major axis [m]).
 * @param {number}        phaseAngle_deg  - Phase angle to close [°, positive = chaser behind].
 * @param {number}       [numOrbits=1]    - Number of phasing revolutions.
 * @returns {{phasingAlt_km: number, period_s: number, totalTime_s: number,
 *            deltaV_m_s: number, precisionLabel: string}}
 */
export function computePhasingOrbit(targetOrbit, phaseAngle_deg, numOrbits = 1) {
  const r_target = targetOrbit.a_m;
  const T_target = orbitalPeriod(r_target, GM_EARTH);

  // Required phasing period so that after numOrbits revolutions the
  // angular difference is closed.
  const T_phasing = T_target - (phaseAngle_deg / 360) * T_target / numOrbits;

  // Semi-major axis of the phasing orbit (from period)
  const a_phasing = Math.cbrt(GM_EARTH * (T_phasing / (2 * PI)) ** 2);

  // Delta-v to enter and exit the phasing orbit (two burns, equal magnitude)
  const v_target  = circularVelocity(r_target, GM_EARTH);
  const v_phasing = visViva(r_target, a_phasing, GM_EARTH);
  const dvPerBurn = Math.abs(v_phasing - v_target);

  return {
    phasingAlt_km: (a_phasing - R_EARTH_MEAN) / 1_000,
    period_s:      T_phasing,
    totalTime_s:   T_phasing * numOrbits,
    deltaV_m_s:    dvPerBurn * 2,
    precisionLabel: 'Two-body co-planar approximation',
  };
}

// ─── Simplified rendezvous ──────────────────────────────────────────────────

/**
 * Plan a simplified rendezvous between a chaser and a target in similar
 * circular orbits.
 *
 * Produces a phasing leg to close the phase angle, plus a small terminal-
 * approach budget.
 *
 * @accuracy SIMPLIFIED — treats phasing and terminal approach as independent
 *   impulsive manoeuvres; no relative-motion (CW/HCW) propagation.
 *
 * @param {{a_m: number, inc_deg: number}} chaserOrbit
 * @param {{a_m: number, inc_deg: number}} targetOrbit
 * @param {Object} [params={}]
 * @param {number} [params.phaseAngle_deg=30]   - Estimated phase angle [°].
 * @param {number} [params.numOrbits=2]         - Phasing revolutions.
 * @param {number} [params.terminalDV_m_s=10]   - Terminal-approach budget [m/s].
 * @returns {{phasingLegs: Array, totalDeltaV_m_s: number, arrivalTime_s: number,
 *            servicingOpportunityScore: number, precisionLabel: string}}
 */
export function planRendezvous(chaserOrbit, targetOrbit, params = {}) {
  const {
    phaseAngle_deg = 30,
    numOrbits      = 2,
    terminalDV_m_s = 10,
  } = params;

  const phasingResult = computePhasingOrbit(targetOrbit, phaseAngle_deg, numOrbits);

  // Plane-change penalty if inclinations differ
  const deltaInc = Math.abs(targetOrbit.inc_deg - chaserOrbit.inc_deg);
  const vTarget  = circularVelocity(targetOrbit.a_m, GM_EARTH);
  const planeChangeDV = deltaInc > 0.01
    ? 2 * vTarget * Math.sin((deltaInc * DEG_TO_RAD) / 2)
    : 0;

  const phasingLegs = [
    { name: 'Phasing burn (enter)', deltaV_m_s: phasingResult.deltaV_m_s / 2, duration_s: 0 },
    { name: 'Phasing drift',        deltaV_m_s: 0,                            duration_s: phasingResult.totalTime_s },
    { name: 'Phasing burn (exit)',   deltaV_m_s: phasingResult.deltaV_m_s / 2, duration_s: 0 },
  ];

  if (planeChangeDV > 0.01) {
    phasingLegs.push({ name: 'Plane change', deltaV_m_s: planeChangeDV, duration_s: 0 });
  }
  phasingLegs.push({ name: 'Terminal approach', deltaV_m_s: terminalDV_m_s, duration_s: 3_600 });

  const totalDV = phasingResult.deltaV_m_s + planeChangeDV + terminalDV_m_s;

  // Simple opportunity score: lower delta-V and shorter time → higher score
  const score = Math.max(0, 100 - totalDV / 10 - phasingResult.totalTime_s / 36_000);

  return {
    phasingLegs,
    totalDeltaV_m_s:          totalDV,
    arrivalTime_s:            phasingResult.totalTime_s + 3_600,
    servicingOpportunityScore: Math.round(score),
    precisionLabel:           'Simplified two-body RPO approximation',
  };
}

// ─── Servicing mission plan ─────────────────────────────────────────────────

/**
 * Build a simplified servicing mission plan.
 *
 * Supports three mission types: inspection (fly-by), service (proximity ops),
 * and deorbit (disposal).
 *
 * @accuracy SIMPLIFIED — budget-level estimates; not a trajectory design.
 *
 * @param {Object} params
 * @param {{a_m: number, inc_deg: number}} params.chaserOrbit
 * @param {{a_m: number, inc_deg: number}} params.targetSatState
 * @param {'inspection'|'service'|'deorbit'} [params.missionType='inspection']
 * @param {number} [params.reserveDeltaV_m_s=25]
 * @returns {{feasible: boolean, legs: Array, deltaVBudget: Object,
 *            missionTimeline: Array, opportunityScore: number,
 *            precisionLabel: string}}
 */
export function servicingMissionPlan(params) {
  const {
    chaserOrbit,
    targetSatState,
    missionType     = 'inspection',
    reserveDeltaV_m_s = 25,
  } = params;

  const rendezvous = planRendezvous(chaserOrbit, targetSatState);
  const legs = [...rendezvous.phasingLegs];

  // Mission-type-specific operations
  let opsDV = 0;
  let opsDuration = 0;

  switch (missionType) {
    case 'inspection':
      opsDV       = 5;
      opsDuration = 7_200;
      legs.push({ name: 'Inspection fly-by', deltaV_m_s: opsDV, duration_s: opsDuration });
      break;
    case 'service':
      opsDV       = 15;
      opsDuration = 86_400;
      legs.push({ name: 'Proximity operations', deltaV_m_s: 10,    duration_s: 43_200 });
      legs.push({ name: 'Servicing',            deltaV_m_s: 5,     duration_s: 43_200 });
      break;
    case 'deorbit':
      opsDV       = 50;
      opsDuration = 14_400;
      legs.push({ name: 'Capture & attach',     deltaV_m_s: 10,    duration_s: 7_200 });
      legs.push({ name: 'De-orbit burn',        deltaV_m_s: 40,    duration_s: 7_200 });
      break;
    default:
      break;
  }

  // Departure / safe-separation
  const departureDV = 5;
  legs.push({ name: 'Departure / separation', deltaV_m_s: departureDV, duration_s: 1_800 });

  const totalDV = rendezvous.totalDeltaV_m_s + opsDV + departureDV;

  const deltaVBudget = {
    rendezvous_m_s:  rendezvous.totalDeltaV_m_s,
    operations_m_s:  opsDV,
    departure_m_s:   departureDV,
    reserve_m_s:     reserveDeltaV_m_s,
    total_m_s:       totalDV + reserveDeltaV_m_s,
  };

  // Timeline
  let cumTime = 0;
  const missionTimeline = legs.map((leg) => {
    const entry = { name: leg.name, start_s: cumTime, duration_s: leg.duration_s };
    cumTime += leg.duration_s;
    return entry;
  });

  return {
    feasible:         true,
    legs,
    deltaVBudget,
    missionTimeline,
    opportunityScore: rendezvous.servicingOpportunityScore,
    precisionLabel:   'Simplified budget-level servicing estimate',
  };
}
