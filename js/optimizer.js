/**
 * @file optimizer.js
 * @module optimizer
 * @description General-purpose weighted optimiser for ground station and route
 * selection.
 *
 * Provides configurable weight sets for different optimisation objectives and
 * a generic scoring / ranking framework used by groundstations.js and other
 * modules.
 */

// ─── Default weights ──────────────────────────────────────────────────────────

/**
 * Default metric weights for candidate scoring.
 *
 * Score = w_cov·coverage + w_margin·margin + w_avail·availability
 *       + w_lat·latency + w_resil·resilience − w_cost·cost
 *
 * @type {{coverage: number, margin: number, availability: number,
 *         latency: number, resilience: number, cost: number}}
 */
export const DEFAULT_WEIGHTS = {
  coverage:     0.20,
  margin:       0.25,
  availability: 0.20,
  latency:      0.10,
  resilience:   0.15,
  cost:         0.10,
};

// ─── Optimisation mode presets ────────────────────────────────────────────────

/**
 * Preset weight configurations for each optimisation objective.
 *
 * @type {Object<string, {coverage: number, margin: number, availability: number,
 *        latency: number, resilience: number, cost: number}>}
 */
export const OPTIMIZATION_MODES = {
  highest_margin: {
    coverage: 0.10, margin: 0.50, availability: 0.15,
    latency: 0.05,  resilience: 0.10, cost: 0.10,
  },
  highest_throughput: {
    coverage: 0.10, margin: 0.40, availability: 0.15,
    latency: 0.10,  resilience: 0.10, cost: 0.15,
  },
  lowest_latency: {
    coverage: 0.10, margin: 0.10, availability: 0.10,
    latency: 0.50,  resilience: 0.10, cost: 0.10,
  },
  most_resilient: {
    coverage: 0.10, margin: 0.15, availability: 0.20,
    latency: 0.05,  resilience: 0.40, cost: 0.10,
  },
  cheapest: {
    coverage: 0.10, margin: 0.10, availability: 0.10,
    latency: 0.05,  resilience: 0.05, cost: 0.60,
  },
  best_ttc: {
    coverage: 0.25, margin: 0.25, availability: 0.25,
    latency: 0.05,  resilience: 0.15, cost: 0.05,
  },
  best_eo: {
    coverage: 0.20, margin: 0.30, availability: 0.15,
    latency: 0.15,  resilience: 0.10, cost: 0.10,
  },
  best_mixed: {
    coverage: 0.20, margin: 0.25, availability: 0.20,
    latency: 0.10,  resilience: 0.15, cost: 0.10,
  },
};

// ─── Weighted scoring ─────────────────────────────────────────────────────────

/**
 * Compute a weighted composite score from a metrics object.
 *
 * All metric values are expected to be normalised to [0, 1].
 * Cost is subtracted (lower cost is better).
 *
 * Score = Σ(w_i · m_i)  for i ≠ cost,  minus  w_cost · cost
 *
 * Precision tier: Deterministic weighted sum.
 *
 * @param {Object} metrics - Metric values keyed by name
 *   (coverage, margin, availability, latency, resilience, cost).
 * @param {Object} [weights] - Weight values keyed by metric name. Defaults to
 *   {@link DEFAULT_WEIGHTS}.
 * @returns {number} Composite score (higher is better).
 */
export function computeWeightedScore(metrics, weights = DEFAULT_WEIGHTS) {
  let score = 0;
  for (const key of Object.keys(weights)) {
    const w = weights[key] ?? 0;
    const m = metrics[key] ?? 0;
    if (key === 'cost') {
      score -= w * m;
    } else {
      score += w * m;
    }
  }
  return score;
}

// ─── Candidate ranking ────────────────────────────────────────────────────────

/**
 * Rank an array of candidates using a supplied scoring function and weights.
 *
 * Precision tier: Deterministic weighted ranking.
 *
 * @param {Array<Object>} candidates - Candidate objects (arbitrary shape).
 * @param {function(Object): Object} scoreFunction - Function that takes a
 *   candidate and returns a metrics object {coverage, margin, …} with
 *   normalised values.
 * @param {Object} [weights] - Weight overrides.
 * @returns {Array<{candidate: Object, metrics: Object, score: number, rank: number}>}
 *   Sorted best-first.
 */
export function rankCandidates(candidates, scoreFunction, weights = DEFAULT_WEIGHTS) {
  const scored = candidates.map(candidate => {
    const metrics = scoreFunction(candidate);
    const score = computeWeightedScore(metrics, weights);
    return { candidate, metrics, score };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.map((entry, idx) => ({
    ...entry,
    rank: idx + 1,
  }));
}
