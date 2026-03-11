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
