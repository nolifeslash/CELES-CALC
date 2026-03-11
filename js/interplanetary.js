/**
 * @file interplanetary.js
 * @module interplanetary
 * @description Architecture placeholder for interplanetary transfer planning
 * in CELES-CALC.
 *
 * This module will eventually provide:
 *
 *   - Ephemeris-based planet positions (or import from a dedicated module).
 *   - Patched-conic interplanetary transfer design.
 *   - Integration with the Lambert solver ({@link module:lambert}) and
 *     porkchop plot generator ({@link module:porkchop}).
 *   - Gravity-assist sequencing utilities.
 *
 * Planned interface:
 *
 *   planInterplanetaryTransfer(params)
 *
 *   @param {Object} params
 *   @param {string} params.origin        - Origin body name (e.g. 'Earth').
 *   @param {string} params.destination   - Destination body name (e.g. 'Mars').
 *   @param {number} params.departureEpoch - Departure Julian Date.
 *   @param {number} params.arrivalEpoch   - Arrival Julian Date.
 *   @param {number} [params.parkingAlt_km] - Departure parking orbit [km].
 *   @param {number} [params.captureAlt_km] - Arrival capture orbit [km].
 *   @returns {{feasible: boolean, departureDV_m_s: number,
 *              arrivalDV_m_s: number, totalDV_m_s: number,
 *              transferTime_s: number, trajectory: Object,
 *              precisionLabel: string}}
 *
 * Dependencies (future):
 *   - lambert.js  — for the two-point boundary-value transfer.
 *   - porkchop.js — for departure/arrival window trade studies.
 *   - constants.js — for planetary GM values and AU.
 */

// ─── Status ─────────────────────────────────────────────────────────────────

/**
 * Module implementation status.
 * @type {string}
 */
export const INTERPLANETARY_STATUS = 'stub';

// ─── Stub planner ───────────────────────────────────────────────────────────

/**
 * Plan an interplanetary transfer between two solar-system bodies.
 *
 * @param {Object} params - See module-level JSDoc for parameter details.
 * @throws {Error} Always — planner not yet implemented.
 */
export function planInterplanetaryTransfer(params) {
  throw new Error('Interplanetary planner not yet implemented — future expansion');
}
