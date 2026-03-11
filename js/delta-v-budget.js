/**
 * @file delta-v-budget.js
 * @module deltaVBudget
 * @description Mission delta-V budget builder for CELES-CALC.
 *
 * Provides utilities to create, assemble, and display delta-V budgets for
 * multi-leg missions.  Includes preset budgets for common mission profiles.
 *
 * All delta-V values are in m/s.
 */

import { GM_EARTH, R_EARTH_MEAN } from './constants.js';
import { hohmannDeltaV, circularVelocity } from './orbit.js';

// ─── Budget creation ────────────────────────────────────────────────────────

/**
 * Create an empty delta-V budget.
 *
 * @returns {{legs: Array, totalDeltaV_m_s: number, reserve_m_s: number,
 *            contingency_pct: number}}
 */
export function createBudget() {
  return {
    legs:            [],
    totalDeltaV_m_s: 0,
    reserve_m_s:     0,
    contingency_pct: 0,
  };
}

// ─── Budget manipulation ────────────────────────────────────────────────────

/**
 * Add a leg to a delta-V budget.
 *
 * Mutates and returns the budget for chaining convenience.
 *
 * @param {Object} budget - Budget created by {@link createBudget}.
 * @param {{name: string, type: string, deltaV_m_s: number,
 *          duration_s?: number, note?: string}} leg
 * @returns {Object} The updated budget.
 */
export function addLeg(budget, leg) {
  budget.legs.push({
    name:       leg.name       || 'Unnamed leg',
    type:       leg.type       || 'burn',
    deltaV_m_s: leg.deltaV_m_s || 0,
    duration_s: leg.duration_s ?? 0,
    note:       leg.note       || '',
  });
  return budget;
}

// ─── Totals computation ─────────────────────────────────────────────────────

/**
 * Compute budget totals, applying reserve and contingency.
 *
 * @param {Object} budget - Budget with legs, reserve_m_s, contingency_pct.
 * @returns {{totalDeltaV_m_s: number, withReserve_m_s: number,
 *            withContingency_m_s: number,
 *            breakdown: Array<{name: string, deltaV_m_s: number}>,
 *            precisionLabel: string}}
 */
export function computeTotals(budget) {
  const breakdown = budget.legs.map((l) => ({
    name:       l.name,
    deltaV_m_s: l.deltaV_m_s,
  }));

  const totalDV        = budget.legs.reduce((sum, l) => sum + l.deltaV_m_s, 0);
  const withReserve    = totalDV + (budget.reserve_m_s || 0);
  const withContingency = withReserve * (1 + (budget.contingency_pct || 0) / 100);

  budget.totalDeltaV_m_s = totalDV;

  return {
    totalDeltaV_m_s:     totalDV,
    withReserve_m_s:     withReserve,
    withContingency_m_s: Math.round(withContingency * 10) / 10,
    breakdown,
    precisionLabel:      'Summed impulsive delta-V budget',
  };
}

// ─── Display ────────────────────────────────────────────────────────────────

/**
 * Format a budget as a human-readable table string.
 *
 * @param {Object} budget
 * @returns {string} Multi-line table suitable for console or text display.
 */
export function budgetToTable(budget) {
  const totals = computeTotals(budget);
  const lines  = [];

  lines.push('┌─────────────────────────────────┬────────────┐');
  lines.push('│ Leg                             │   Δv (m/s) │');
  lines.push('├─────────────────────────────────┼────────────┤');

  for (const leg of totals.breakdown) {
    const name = leg.name.padEnd(31);
    const dv   = leg.deltaV_m_s.toFixed(1).padStart(10);
    lines.push(`│ ${name} │ ${dv} │`);
  }

  lines.push('├─────────────────────────────────┼────────────┤');
  lines.push(`│ ${'TOTAL'.padEnd(31)} │ ${totals.totalDeltaV_m_s.toFixed(1).padStart(10)} │`);
  lines.push(`│ ${'+ Reserve'.padEnd(31)} │ ${totals.withReserve_m_s.toFixed(1).padStart(10)} │`);
  lines.push(`│ ${'+ Contingency'.padEnd(31)} │ ${totals.withContingency_m_s.toFixed(1).padStart(10)} │`);
  lines.push('└─────────────────────────────────┴────────────┘');

  return lines.join('\n');
}

// ─── Standard budgets ───────────────────────────────────────────────────────

/**
 * Preset delta-V budgets for common mission profiles.
 *
 * Each factory returns a pre-populated budget ready for {@link computeTotals}.
 *
 * @type {{leoToGeo: function(): Object,
 *         leoToMoon: function(): Object,
 *         leoServicing: function(): Object}}
 */
export const standardBudgets = {
  /**
   * LEO (400 km) → GEO (35 786 km) via Hohmann + plane change.
   * @returns {Object} Pre-populated budget.
   */
  leoToGeo() {
    const budget = createBudget();
    budget.reserve_m_s     = 50;
    budget.contingency_pct = 5;

    const r1 = R_EARTH_MEAN + 400_000;
    const r2 = R_EARTH_MEAN + 35_786_000;
    const h  = hohmannDeltaV(r1, r2, GM_EARTH);

    addLeg(budget, { name: 'GTO injection',       type: 'transfer', deltaV_m_s: Math.abs(h.dv1) });
    addLeg(budget, { name: 'GEO circularisation',  type: 'transfer', deltaV_m_s: Math.abs(h.dv2) });
    addLeg(budget, { name: 'Plane change (~28°)',   type: 'plane_change',
                     deltaV_m_s: 2 * circularVelocity(r2, GM_EARTH) * Math.sin((28 * Math.PI / 180) / 2) });
    addLeg(budget, { name: 'Station-keeping (15 yr)', type: 'maintenance', deltaV_m_s: 50,
                     note: '~3–4 m/s per year' });
    return budget;
  },

  /**
   * LEO (400 km) → Low Lunar Orbit (100 km) — simplified.
   * @returns {Object} Pre-populated budget.
   */
  leoToMoon() {
    const budget = createBudget();
    budget.reserve_m_s     = 75;
    budget.contingency_pct = 10;

    addLeg(budget, { name: 'TLI (trans-lunar injection)', type: 'transfer', deltaV_m_s: 3_150 });
    addLeg(budget, { name: 'Mid-course corrections',       type: 'correction', deltaV_m_s: 30 });
    addLeg(budget, { name: 'LOI (lunar orbit insertion)',   type: 'insertion', deltaV_m_s: 850 });
    return budget;
  },

  /**
   * LEO servicing mission — chaser to target in similar LEO orbit.
   * @returns {Object} Pre-populated budget.
   */
  leoServicing() {
    const budget = createBudget();
    budget.reserve_m_s     = 25;
    budget.contingency_pct = 10;

    addLeg(budget, { name: 'Phasing',               type: 'phasing',     deltaV_m_s: 15 });
    addLeg(budget, { name: 'Terminal approach',      type: 'rendezvous',  deltaV_m_s: 10 });
    addLeg(budget, { name: 'Proximity operations',   type: 'service',     deltaV_m_s: 10 });
    addLeg(budget, { name: 'Departure / separation', type: 'departure',   deltaV_m_s: 5 });
    return budget;
  },
};
