/**
 * @file satcom-network.js
 * @module satcom-network
 * @description Route comparison and multi-hop analysis for satellite
 * communication networks.
 *
 * Models individual route legs (propagation delay, loss) and composes them
 * into full routes for latency / margin / throughput comparison.
 */

import { SPEED_OF_LIGHT } from './constants.js';
import { freeSpacePathLoss } from './link-budget.js';

// ─── Route type definitions ───────────────────────────────────────────────────

/**
 * Canonical route type labels.
 * @type {Object<string, string>}
 */
export const ROUTE_TYPES = {
  direct:       'Direct-to-Ground',
  relay:        'Relay-to-Ground',
  isl:          'Inter-Satellite Link',
  lunar_relay:  'Lunar Relay',
};

// ─── Single route leg ─────────────────────────────────────────────────────────

/**
 * Compute metrics for one hop (route leg).
 *
 * Precision tier: Standard engineering approximation.
 *
 * @param {Object} params
 * @param {number} params.distance_m  - Hop distance [m].
 * @param {number} params.freq_Hz     - Carrier frequency [Hz].
 * @param {number} [params.extraLoss_dB=0] - Additional per-hop losses [dB].
 * @param {string} [params.label='']  - Human-readable leg label.
 * @returns {{
 *   label: string,
 *   distance_m: number,
 *   propagationDelay_s: number,
 *   fspl_dB: number,
 *   legLoss_dB: number,
 *   precisionLabel: string
 * }}
 */
export function computeRouteLeg(params) {
  const {
    distance_m,
    freq_Hz,
    extraLoss_dB = 0,
    label = '',
  } = params;

  const propagationDelay_s = distance_m / SPEED_OF_LIGHT;
  const fspl_dB = freeSpacePathLoss(freq_Hz, distance_m);
  const legLoss_dB = fspl_dB + extraLoss_dB;

  return {
    label,
    distance_m,
    propagationDelay_s,
    fspl_dB,
    legLoss_dB,
    precisionLabel: 'Standard engineering approximation',
  };
}

// ─── Full route composition ───────────────────────────────────────────────────

/**
 * Compose multiple legs into a complete route and aggregate metrics.
 *
 * Precision tier: Standard engineering approximation.
 *
 * @param {Array<Object>} legs - Array of results from {@link computeRouteLeg}.
 * @returns {{
 *   hopCount: number,
 *   oneWayLatency_s: number,
 *   rtt_s: number,
 *   pathBottleneck: string,
 *   totalLoss_dB: number,
 *   legs: Array<Object>,
 *   precisionLabel: string
 * }}
 */
export function computeRoute(legs) {
  let totalDelay = 0;
  let totalLoss  = 0;
  let worstLeg   = { legLoss_dB: -Infinity, label: 'none' };

  for (const leg of legs) {
    totalDelay += leg.propagationDelay_s;
    totalLoss  += leg.legLoss_dB;
    if (leg.legLoss_dB > worstLeg.legLoss_dB) {
      worstLeg = leg;
    }
  }

  return {
    hopCount: legs.length,
    oneWayLatency_s: totalDelay,
    rtt_s: 2 * totalDelay,
    pathBottleneck: worstLeg.label || `Leg with ${worstLeg.legLoss_dB.toFixed(1)} dB loss`,
    totalLoss_dB: totalLoss,
    legs,
    precisionLabel: 'Standard engineering approximation',
  };
}

// ─── Route comparison ─────────────────────────────────────────────────────────

/**
 * Compare multiple candidate routes and recommend the best.
 *
 * Routes are ranked by a composite score favouring lower latency, lower loss,
 * and fewer hops.
 *
 * Precision tier: Heuristic ranking.
 *
 * @param {Array<{name: string, route: Object}>} routes - Named route objects
 *   from {@link computeRoute}.
 * @returns {{
 *   ranked: Array<{name: string, route: Object, score: number}>,
 *   recommended: string,
 *   reasoning: string,
 *   precisionLabel: string
 * }}
 */
export function compareRoutes(routes) {
  if (routes.length === 0) {
    return {
      ranked: [],
      recommended: 'none',
      reasoning: 'No candidate routes provided.',
      precisionLabel: 'Heuristic ranking',
    };
  }

  // Normalisation references
  const maxLatency = Math.max(...routes.map(r => r.route.oneWayLatency_s), 1e-9);
  const maxLoss    = Math.max(...routes.map(r => r.route.totalLoss_dB), 1);
  const maxHops    = Math.max(...routes.map(r => r.route.hopCount), 1);

  const scored = routes.map(r => {
    const latencyNorm = 1 - r.route.oneWayLatency_s / maxLatency;
    const lossNorm    = 1 - r.route.totalLoss_dB / maxLoss;
    const hopsNorm    = 1 - r.route.hopCount / maxHops;
    const score = 0.4 * latencyNorm + 0.4 * lossNorm + 0.2 * hopsNorm;
    return { name: r.name, route: r.route, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  const reasoning = `'${best.name}' selected — `
    + `${best.route.hopCount} hop(s), `
    + `${(best.route.oneWayLatency_s * 1000).toFixed(1)} ms one-way latency, `
    + `${best.route.totalLoss_dB.toFixed(1)} dB total path loss.`;

  return {
    ranked: scored,
    recommended: best.name,
    reasoning,
    precisionLabel: 'Heuristic ranking',
  };
}
