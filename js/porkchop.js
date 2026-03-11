/**
 * @file porkchop.js
 * @module porkchop
 * @description Architecture placeholder for porkchop plot generation in
 * CELES-CALC.
 *
 * A porkchop plot visualises the delta-V cost of interplanetary (or
 * cislunar) transfers as a function of departure and arrival dates.
 *
 * This module defines the planned interface but does not yet contain an
 * implementation.  It will depend on the Lambert solver ({@link module:lambert})
 * once that is available.
 *
 * Planned interface:
 *
 *   generatePorkchop(params)
 *
 *   @param {Object} params
 *   @param {number} params.departureStart - Start of departure window (JD).
 *   @param {number} params.departureEnd   - End of departure window (JD).
 *   @param {number} params.arrivalStart   - Start of arrival window (JD).
 *   @param {number} params.arrivalEnd     - End of arrival window (JD).
 *   @param {number} params.step_days      - Grid step [days].
 *   @param {number} params.mu             - Gravitational parameter [m³/s²].
 *   @returns {{grid: number[][], departureDates: number[], arrivalDates: number[],
 *              minDV: number, bestDeparture: number, bestArrival: number}}
 */

// ─── Status ─────────────────────────────────────────────────────────────────

/**
 * Module implementation status.
 * @type {string}
 */
export const PORKCHOP_STATUS = 'stub';

// ─── Stub generator ─────────────────────────────────────────────────────────

/**
 * Generate a porkchop plot grid.
 *
 * @param {Object} params - See module-level JSDoc for parameter details.
 * @throws {Error} Always — generator not yet implemented.
 */
export function generatePorkchop(params) {
  throw new Error('Porkchop generator not yet implemented — future expansion');
}
