/**
 * @file groundstations.js
 * @module groundstations
 * @description Ground station ranking and optimisation for satellite link
 * planning.
 *
 * Scores and ranks candidate ground stations against a configurable set of
 * weighted criteria (coverage, margin, availability, latency, resilience,
 * cost). Supports multiple optimisation modes (highest_margin,
 * highest_throughput, lowest_latency, etc.).
 */

import { SPEED_OF_LIGHT, R_EARTH_EQUATORIAL, DEG_TO_RAD } from './constants.js';
import { atmosphericLoss, WEATHER_PRESETS } from './atmosphere.js';
import { computeWeightedScore, OPTIMIZATION_MODES } from './optimizer.js';

// ─── Station loader ───────────────────────────────────────────────────────────

/**
 * Parse an array of raw station records into a normalised internal format.
 *
 * @param {Array<Object>} jsonArray - Raw station records. Each must include at
 *   minimum: {name, lat_deg, lon_deg, alt_m}.
 * @returns {Array<Object>} Normalised station objects.
 */
export function loadStations(jsonArray) {
  return jsonArray.map(s => ({
    name:           s.name           ?? 'Unnamed',
    lat_deg:        s.lat_deg        ?? 0,
    lon_deg:        s.lon_deg        ?? 0,
    alt_m:          s.alt_m          ?? 0,
    antennaGain_dBi: s.antennaGain_dBi ?? 30,
    band:           s.band           ?? 'X',
    costIndex:      s.costIndex      ?? 1.0,
    hasRedundancy:  s.hasRedundancy  ?? false,
    capabilities:   s.capabilities   ?? [],
    confidence:     Number.isFinite(Number(s.confidence)) ? Number(s.confidence) : 0,
    sourceRecords:  Array.isArray(s.sourceRecords) ? s.sourceRecords : [],
    infraId:        s.infraId ?? null,
  }));
}

// ─── Single station evaluation ────────────────────────────────────────────────

/**
 * Evaluate a single station for a given mission scenario.
 *
 * Precision tier: Engineering approximation with heuristic scoring.
 *
 * @param {Object} station - Normalised station from {@link loadStations}.
 * @param {Object} params
 * @param {number} params.orbitAlt_km        - Satellite orbit altitude [km].
 * @param {number} params.inclination_deg    - Orbit inclination [°].
 * @param {string} [params.band='X']         - RF band key.
 * @param {string} [params.serviceProfile='general'] - Service profile.
 * @param {string} [params.weatherPreset='clear_sky'] - Key into WEATHER_PRESETS.
 * @param {string} [params.optimizationMode='highest_margin'] - Scoring mode.
 * @returns {{
 *   station: Object,
 *   coverage: number,
 *   margin: number,
 *   availability: number,
 *   latency: number,
 *   resilience: number,
 *   cost: number,
 *   score: number,
 *   reasons: string[],
 *   precisionLabel: string
 * }}
 */
export function evaluateStation(station, params) {
  const {
    orbitAlt_km,
    inclination_deg,
    band = 'X',
    serviceProfile = 'general',
    weatherPreset  = 'clear_sky',
    optimizationMode = 'highest_margin',
  } = params;

  const reasons = [];

  // Coverage heuristic — higher latitude stations better for high-inclination orbits
  const latMatch = 1 - Math.abs(Math.abs(station.lat_deg) - inclination_deg) / 90;
  const coverage = Math.max(0, Math.min(1, latMatch));
  if (coverage < 0.3) reasons.push('Low orbital coverage for this inclination.');

  // Margin heuristic — antenna gain vs. atmospheric loss
  const minElev = 10; // assume 10° minimum elevation
  const atmLoss = atmosphericLoss(band, weatherPreset, minElev);
  const gainNorm = Math.min(station.antennaGain_dBi / 46, 1); // 46 dBi = max reference
  const lossNorm = Math.max(0, 1 - atmLoss / 30);
  const margin = gainNorm * lossNorm;
  if (margin < 0.4) reasons.push('Margin may be thin under these conditions.');

  // Availability — weather-driven
  const preset = WEATHER_PRESETS[weatherPreset];
  const availability = preset ? Math.max(0, 1 - preset.rainRate_mmh / 60) : 0.9;

  // Latency — one-way propagation delay normalised
  const slantRange_m = (orbitAlt_km * 1000 + R_EARTH_EQUATORIAL);
  const delay_s = slantRange_m / SPEED_OF_LIGHT;
  const latency = Math.max(0, 1 - delay_s / 0.3); // 300 ms = worst-case GEO

  // Resilience — based on redundancy flag
  const resilience = station.hasRedundancy ? 1.0 : 0.5;
  if (!station.hasRedundancy) reasons.push('No site redundancy.');

  // Cost — inverted cost index
  const cost = Math.min(station.costIndex, 5) / 5;

  // Weighted score
  const weights = OPTIMIZATION_MODES[optimizationMode] ?? OPTIMIZATION_MODES.highest_margin;
  const metrics = { coverage, margin, availability, latency, resilience, cost };
  const score = computeWeightedScore(metrics, weights);

  return {
    station,
    coverage,
    margin,
    availability,
    latency,
    resilience,
    cost,
    score,
    reasons,
    precisionLabel: 'Engineering approximation with heuristic scoring',
  };
}

// ─── Station ranking ──────────────────────────────────────────────────────────

/**
 * Rank an array of stations for a given scenario.
 *
 * Precision tier: Heuristic ranking.
 *
 * @param {Array<Object>} stations - Normalised stations from {@link loadStations}.
 * @param {Object} params - Evaluation parameters (see {@link evaluateStation}).
 * @returns {Array<Object>} Scored results sorted best-first.
 */
export function rankStations(stations, params) {
  const results = stations.map(s => evaluateStation(s, params));
  results.sort((a, b) => b.score - a.score);
  return results;
}

// ─── Score computation ────────────────────────────────────────────────────────

/**
 * Compute a single station score from pre-computed metrics.
 *
 * Score = w_cov·coverage + w_margin·margin + w_avail·availability
 *       + w_lat·latency + w_resil·resilience − w_cost·cost
 *
 * Precision tier: Weighted heuristic.
 *
 * @param {Object} metrics - {coverage, margin, availability, latency, resilience, cost}.
 * @param {Object} [weights] - Weight overrides (defaults from optimizer.js).
 * @returns {number} Composite score (higher is better).
 */
export function computeStationScore(metrics, weights) {
  return computeWeightedScore(metrics, weights);
}
