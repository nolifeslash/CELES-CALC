/**
 * @file launch-vehicles.js
 * @module launchVehicles
 * @description Launch vehicle profiles, classification, and suitability
 * assessment for CELES-CALC.
 *
 * Provides generic vehicle classes, a loader for external vehicle data, and
 * simplified insertion delta-V estimation.
 *
 * All functions use SI units and degrees unless otherwise noted.
 */

import { DEG_TO_RAD, R_EARTH_MEAN, GM_EARTH } from './constants.js';
import { circularVelocity } from './orbit.js';

// ─── Vehicle classes ────────────────────────────────────────────────────────

/**
 * Generic vehicle class profiles.
 *
 * @type {Object<string, {name: string, payloadLEO_kg?: number,
 *        payloadGTO_kg?: number, deltaV_m_s?: number, note?: string}>}
 */
export const VEHICLE_CLASSES = {
  small: {
    name:           'Small',
    payloadLEO_kg:  500,
    payloadGTO_kg:  0,
  },
  medium: {
    name:           'Medium',
    payloadLEO_kg:  10_000,
    payloadGTO_kg:  5_000,
  },
  heavy: {
    name:           'Heavy',
    payloadLEO_kg:  25_000,
    payloadGTO_kg:  12_000,
  },
  super_heavy: {
    name:           'Super Heavy/Reusable',
    payloadLEO_kg:  100_000,
    payloadGTO_kg:  30_000,
  },
  tug: {
    name:       'Tug/Kick Stage',
    deltaV_m_s: 2_000,
    note:       'Upper stage only',
  },
};

// ─── Data loading ───────────────────────────────────────────────────────────

/**
 * Parse vehicle records from an external JSON array.
 *
 * Each element should contain at least `name` and either `payloadLEO_kg` or
 * `deltaV_m_s`.  Extra fields are preserved.
 *
 * @param {Array<Object>} jsonArray - Raw array of vehicle objects.
 * @returns {Array<Object>} Normalised vehicle records.
 */
export function loadVehicles(jsonArray) {
  if (!Array.isArray(jsonArray)) {
    throw new Error('loadVehicles expects an array of vehicle objects.');
  }
  return jsonArray.map((v) => ({
    name:           String(v.name || 'Unknown'),
    payloadLEO_kg:  Number(v.payloadLEO_kg ?? v.payload_leo_kg ?? 0),
    payloadGTO_kg:  Number(v.payloadGTO_kg ?? v.payload_gto_kg ?? 0),
    deltaV_m_s:     Number(v.deltaV_m_s    ?? 0),
    ...v,
  }));
}

// ─── Suitability assessment ─────────────────────────────────────────────────

/**
 * Determine whether a vehicle is suitable for a given payload and target orbit.
 *
 * Compares the payload mass against the vehicle's advertised capability for
 * the target orbit class (LEO or GTO).
 *
 * @accuracy SIMPLIFIED — uses the vehicle's advertised payload numbers
 *   without accounting for trajectory-specific performance curves.
 *
 * @param {{payloadLEO_kg?: number, payloadGTO_kg?: number, name?: string}} vehicle
 * @param {number} payloadMass_kg - Payload mass [kg].
 * @param {{alt_km: number, inc_deg?: number}} targetOrbit
 * @returns {{suitable: boolean, margin_pct: number, rating: string,
 *            notes: string[], precisionLabel: string}}
 */
export function vehicleSuitability(vehicle, payloadMass_kg, targetOrbit) {
  const notes = [];
  const isGTO = targetOrbit.alt_km > 2_000;
  const capacity = isGTO
    ? (vehicle.payloadGTO_kg || 0)
    : (vehicle.payloadLEO_kg || 0);

  if (capacity === 0) {
    return {
      suitable:       false,
      margin_pct:     -100,
      rating:         'No capability',
      notes:          [`Vehicle has no published ${isGTO ? 'GTO' : 'LEO'} payload capacity.`],
      precisionLabel: 'Simplified class-based estimate',
    };
  }

  const margin_pct = ((capacity - payloadMass_kg) / capacity) * 100;
  let rating;

  if (margin_pct < 0)       rating = 'Over capacity';
  else if (margin_pct < 10) rating = 'Marginal';
  else if (margin_pct < 30) rating = 'Adequate';
  else                       rating = 'Comfortable';

  if (margin_pct < 0) {
    notes.push(`Payload exceeds ${isGTO ? 'GTO' : 'LEO'} capacity by ${(-margin_pct).toFixed(1)}%.`);
  }
  if (targetOrbit.inc_deg !== undefined && targetOrbit.inc_deg > 90) {
    notes.push('Retrograde orbit reduces effective payload capacity.');
  }

  return {
    suitable:       margin_pct >= 0,
    margin_pct:     Math.round(margin_pct * 10) / 10,
    rating,
    notes,
    precisionLabel: 'Simplified class-based estimate',
  };
}

// ─── Insertion delta-V estimate ─────────────────────────────────────────────

/**
 * Simplified estimate for total delta-V from ground to a circular orbit.
 *
 * Uses:
 *   v_orbit = circularVelocity(R_Earth + alt)
 *   Δv_total ≈ v_orbit + gravity_loss + drag_loss + steering_loss − rotation_benefit
 *
 * @accuracy SIMPLIFIED — empirical loss estimates; not a trajectory simulation.
 *
 * @param {number} targetAlt_km  - Target circular orbit altitude [km].
 * @param {number} targetInc_deg - Target inclination [°].
 * @param {number} siteLat_deg   - Launch site latitude [°].
 * @returns {{deltaV_m_s: number, gravityLoss_m_s: number, dragLoss_m_s: number,
 *            steeringLoss_m_s: number, rotationBenefit_m_s: number,
 *            precisionLabel: string}}
 */
export function estimateInsertionDeltaV(targetAlt_km, targetInc_deg, siteLat_deg) {
  const r = R_EARTH_MEAN + targetAlt_km * 1_000;
  const vOrbit = circularVelocity(r, GM_EARTH);

  // Empirical loss budgets (typical values)
  const gravityLoss_m_s  = 1_200;
  const dragLoss_m_s     = 150;
  const steeringLoss_m_s = 200;

  // Earth-rotation benefit (reduced for high inclinations)
  const EQUATORIAL_SPEED = 465.1;
  const latRad = siteLat_deg * DEG_TO_RAD;
  const incRad = targetInc_deg * DEG_TO_RAD;
  const rotationBenefit_m_s = EQUATORIAL_SPEED * Math.cos(latRad) * Math.cos(incRad);

  const deltaV_m_s = vOrbit + gravityLoss_m_s + dragLoss_m_s + steeringLoss_m_s
                    - Math.max(0, rotationBenefit_m_s);

  return {
    deltaV_m_s:     Math.round(deltaV_m_s),
    gravityLoss_m_s,
    dragLoss_m_s,
    steeringLoss_m_s,
    rotationBenefit_m_s: Math.round(Math.max(0, rotationBenefit_m_s)),
    precisionLabel: 'Simplified empirical estimate — not a trajectory simulation',
  };
}
