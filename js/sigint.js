/**
 * @file sigint.js
 * @module sigint
 * @description SIGINT opportunity assessment — simplified educational model.
 *
 * Estimates detection likelihood, intercept opportunity, and geolocation class
 * based on geometry and received signal strength. All outputs are labelled as
 * simplified educational models and must not be treated as operational tools.
 *
 * Precision tier: Simplified educational model — geometry + signal-strength
 * opportunity assessor only.
 */

import { SPEED_OF_LIGHT } from './constants.js';
import { freeSpacePathLoss } from './link-budget.js';

// ─── Detection assessment ─────────────────────────────────────────────────────

/**
 * Assess detection opportunity for a single emitter / collector pair.
 *
 * Simplified educational model — geometry + signal-strength opportunity
 * assessor only.
 *
 * @param {Object} params
 * @param {number} params.emitterEIRP_dBW        - Emitter EIRP [dBW].
 * @param {number} params.freq_Hz                - Emitter frequency [Hz].
 * @param {number} params.emitterDistance_m       - Emitter-to-collector distance [m].
 * @param {number} params.collectorSensitivity_dBW - Collector minimum detectable signal [dBW].
 * @param {number} params.collectorGain_dBi      - Collector antenna gain [dBi].
 * @param {number} [params.dwellTime_s=1]        - Collection dwell time [s].
 * @returns {{
 *   receivedPower_dBW: number,
 *   snrExcess_dB: number,
 *   detectionScore: number,
 *   interceptOpportunity: string,
 *   geolocationClass: string,
 *   limitingFactors: string[],
 *   precisionLabel: string
 * }}
 */
export function assessDetection(params) {
  const {
    emitterEIRP_dBW,
    freq_Hz,
    emitterDistance_m,
    collectorSensitivity_dBW,
    collectorGain_dBi,
    dwellTime_s = 1,
  } = params;

  const fspl_dB = freeSpacePathLoss(freq_Hz, emitterDistance_m);
  const receivedPower_dBW = emitterEIRP_dBW - fspl_dB + collectorGain_dBi;

  // Integration gain from dwell time (simplified: 5·log10)
  const integrationGain_dB = 5 * Math.log10(Math.max(dwellTime_s, 0.001));
  const effectivePower = receivedPower_dBW + integrationGain_dB;

  const snrExcess_dB = effectivePower - collectorSensitivity_dBW;

  // Detection score 0–100
  const detectionScore = Math.max(0, Math.min(100,
    50 + snrExcess_dB * 5));

  // Intercept opportunity classification
  let interceptOpportunity;
  if (detectionScore >= 80) interceptOpportunity = 'excellent';
  else if (detectionScore >= 55) interceptOpportunity = 'good';
  else if (detectionScore >= 30) interceptOpportunity = 'marginal';
  else interceptOpportunity = 'unlikely';

  // Geolocation class (simplified: needs sufficient SNR and frequency)
  let geolocationClass;
  if (snrExcess_dB >= 20 && freq_Hz > 1e9)       geolocationClass = 'high';
  else if (snrExcess_dB >= 10 && freq_Hz > 500e6) geolocationClass = 'medium';
  else if (snrExcess_dB >= 3)                      geolocationClass = 'low';
  else                                              geolocationClass = 'none';

  // Limiting factors
  const limitingFactors = [];
  if (snrExcess_dB < 3) limitingFactors.push('Insufficient SNR for reliable detection.');
  if (emitterDistance_m > 40_000_000) limitingFactors.push('Extreme range reduces intercept probability.');
  if (dwellTime_s < 0.1) limitingFactors.push('Short dwell time limits integration gain.');
  if (freq_Hz < 100e6) limitingFactors.push('Low frequency — wide beam limits geolocation.');

  return {
    receivedPower_dBW,
    snrExcess_dB,
    detectionScore,
    interceptOpportunity,
    geolocationClass,
    limitingFactors,
    precisionLabel: 'Simplified educational model — geometry+signal-strength opportunity assessor only',
  };
}

// ─── Multi-scenario comparison ────────────────────────────────────────────────

/**
 * Rank multiple SIGINT collection scenarios by detection score.
 *
 * Simplified educational model — geometry + signal-strength opportunity
 * assessor only.
 *
 * @param {Array<Object>} scenarios - Array of parameter objects for
 *   {@link assessDetection}.
 * @returns {Array<{params: Object, result: Object, rank: number}>}
 *   Sorted best-first by detectionScore.
 */
export function compareCollectionOpportunities(scenarios) {
  const assessed = scenarios.map(params => ({
    params,
    result: assessDetection(params),
  }));

  assessed.sort((a, b) => b.result.detectionScore - a.result.detectionScore);

  return assessed.map((entry, idx) => ({
    ...entry,
    rank: idx + 1,
  }));
}

// ─── Emitter classification ───────────────────────────────────────────────────

/**
 * Very simplified emitter classification based on RF characteristics.
 *
 * Simplified educational model — geometry + signal-strength opportunity
 * assessor only.
 *
 * @param {number} freq_Hz      - Centre frequency [Hz].
 * @param {number} bandwidth_Hz - Signal bandwidth [Hz].
 * @param {number} dutyCycle    - Duty cycle (0–1).
 * @returns {{
 *   category: string,
 *   confidence: string,
 *   description: string,
 *   precisionLabel: string
 * }}
 */
export function classifyEmitter(freq_Hz, bandwidth_Hz, dutyCycle) {
  const freq_GHz = freq_Hz / 1e9;
  const bw_MHz   = bandwidth_Hz / 1e6;

  let category;
  let description;

  if (dutyCycle < 0.05 && bw_MHz < 5) {
    category = 'pulsed_radar';
    description = 'Pulsed radar — low duty cycle, narrow bandwidth.';
  } else if (dutyCycle > 0.9 && bw_MHz < 0.05) {
    category = 'continuous_wave';
    description = 'Continuous-wave emitter — high duty cycle, very narrow band.';
  } else if (bw_MHz > 20) {
    category = 'wideband_data';
    description = 'Wideband data link — wide bandwidth suggests digital comms.';
  } else if (freq_GHz < 0.5 && bw_MHz < 0.2) {
    category = 'hf_narrowband';
    description = 'HF/VHF narrowband — possible voice or telemetry.';
  } else if (bw_MHz >= 0.2 && bw_MHz <= 20) {
    category = 'standard_comms';
    description = 'Standard communications link — moderate bandwidth.';
  } else {
    category = 'unknown';
    description = 'Unclassified emitter — insufficient distinguishing features.';
  }

  // Confidence is always low for this simplified model
  const confidence = 'low';

  return {
    category,
    confidence,
    description,
    precisionLabel: 'Simplified educational model — geometry+signal-strength opportunity assessor only',
  };
}
