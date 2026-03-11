/**
 * @file lambert.js
 * @module lambert
 * @description Architecture placeholder for a Lambert solver in CELES-CALC.
 *
 * A Lambert solver computes the transfer orbit between two position vectors
 * given a time of flight.  This module defines the planned interface but does
 * not yet contain an implementation.
 *
 * Planned interface:
 *
 *   solveLambert(r1_vec, r2_vec, tof_s, mu, params)
 *
 *   @param {number[]} r1_vec  - Initial position vector [m].
 *   @param {number[]} r2_vec  - Final position vector [m].
 *   @param {number}   tof_s   - Time of flight [s].
 *   @param {number}   mu      - Gravitational parameter [m³/s²].
 *   @param {Object}  [params] - Optional solver parameters
 *     (e.g., {prograde: true, revolutions: 0}).
 *   @returns {{v1_vec: number[], v2_vec: number[], converged: boolean}}
 *
 * Future expansion will implement a robust universal-variable or Gooding
 * algorithm.
 */

// ─── Status ─────────────────────────────────────────────────────────────────

/**
 * Module implementation status.
 * @type {string}
 */
export const LAMBERT_STATUS = 'stub';

// ─── Stub solver ────────────────────────────────────────────────────────────

/**
 * Solve Lambert's problem for a two-body transfer.
 *
 * @param {number[]} r1_vec  - Initial position vector [m].
 * @param {number[]} r2_vec  - Final position vector [m].
 * @param {number}   tof_s   - Time of flight [s].
 * @param {number}   mu      - Gravitational parameter [m³/s²].
 * @param {Object}  [params] - Solver parameters (e.g., {prograde, revolutions}).
 * @throws {Error} Always — solver not yet implemented.
 */
export function solveLambert(r1_vec, r2_vec, tof_s, mu, params) {
  throw new Error('Lambert solver not yet implemented — future expansion');
}
