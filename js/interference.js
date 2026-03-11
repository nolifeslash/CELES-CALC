/**
 * @file interference.js
 * @module interference
 * @description Simplified interference and jamming analysis for satellite
 * communications links.
 *
 * Computes received jammer power, J/S, J/N ratios, and recommends mitigation
 * options. All models are first-order free-space approximations.
 *
 * Precision tier: Engineering approximation — simplified free-space model.
 */

import { SPEED_OF_LIGHT } from './constants.js';
import { freeSpacePathLoss } from './link-budget.js';

// ─── Jammer mode definitions ──────────────────────────────────────────────────

/**
 * Jammer operating mode presets.
 *
 * @type {Object<string, {name: string, bandwidthFactor: number}>}
 */
export const JAMMER_MODES = {
  spot:    { name: 'Spot',    bandwidthFactor: 1  },
  barrage: { name: 'Barrage', bandwidthFactor: 10 },
  swept:   { name: 'Swept',   bandwidthFactor: 5  },
};

// ─── Core interference calculations ──────────────────────────────────────────

/**
 * Received jammer power at the victim receiver.
 *
 * Precision tier: Engineering approximation — free-space only.
 *
 * @param {number} jammerEIRP_dBW - Jammer EIRP [dBW].
 * @param {number} distance_m     - Distance from jammer to victim [m].
 * @param {number} freq_Hz        - Jammer centre frequency [Hz].
 * @returns {number} Received jammer power [dBW].
 */
export function computeJammerPower(jammerEIRP_dBW, distance_m, freq_Hz) {
  const fspl_dB = freeSpacePathLoss(freq_Hz, distance_m);
  return jammerEIRP_dBW - fspl_dB;
}

/**
 * Jammer-to-signal ratio.
 *
 * @param {number} jammerReceived_dBW - Received jammer power [dBW].
 * @param {number} signalReceived_dBW - Received desired-signal power [dBW].
 * @returns {number} J/S [dB].
 */
export function computeJtoS(jammerReceived_dBW, signalReceived_dBW) {
  return jammerReceived_dBW - signalReceived_dBW;
}

/**
 * Jammer-to-noise ratio.
 *
 * @param {number} jammerReceived_dBW - Received jammer power [dBW].
 * @param {number} noiseFloor_dBW     - Receiver noise floor [dBW].
 * @returns {number} J/N [dB].
 */
export function computeJtoN(jammerReceived_dBW, noiseFloor_dBW) {
  return jammerReceived_dBW - noiseFloor_dBW;
}

// ─── Full interference assessment ─────────────────────────────────────────────

/**
 * Comprehensive interference / jamming assessment.
 *
 * Precision tier: Engineering approximation — simplified free-space model.
 *
 * @param {Object} params
 * @param {number} params.signalPower_dBW   - Desired signal power at receiver [dBW].
 * @param {number} params.noisePower_dBW    - Receiver noise power [dBW].
 * @param {number} params.jammerEIRP_dBW    - Jammer EIRP [dBW].
 * @param {number} params.jammerDistance_m   - Distance jammer → victim [m].
 * @param {number} params.freq_Hz           - Centre frequency [Hz].
 * @param {string} [params.jammerMode='spot'] - Key into JAMMER_MODES.
 * @param {number} [params.bandwidth_Hz=1e6] - Victim channel bandwidth [Hz].
 * @returns {{
 *   jammerReceived_dBW: number,
 *   jToS_dB: number,
 *   jToN_dB: number,
 *   marginDegradation_dB: number,
 *   state: string,
 *   mitigationOptions: string[],
 *   precisionLabel: string
 * }}
 */
export function assessInterference(params) {
  const {
    signalPower_dBW,
    noisePower_dBW,
    jammerEIRP_dBW,
    jammerDistance_m,
    freq_Hz,
    jammerMode = 'spot',
    bandwidth_Hz = 1e6,
  } = params;

  const mode = JAMMER_MODES[jammerMode] || JAMMER_MODES.spot;

  // Jammer power spread across its bandwidth factor
  const effectiveJammerEIRP = jammerEIRP_dBW - 10 * Math.log10(mode.bandwidthFactor);
  const jammerReceived_dBW = computeJammerPower(effectiveJammerEIRP, jammerDistance_m, freq_Hz);

  const jToS_dB = computeJtoS(jammerReceived_dBW, signalPower_dBW);
  const jToN_dB = computeJtoN(jammerReceived_dBW, noisePower_dBW);

  // Degradation: increase in effective noise floor due to jammer
  const noiseLinear   = Math.pow(10, noisePower_dBW / 10);
  const jammerLinear  = Math.pow(10, jammerReceived_dBW / 10);
  const newNoiseFloor = 10 * Math.log10(noiseLinear + jammerLinear);
  const marginDegradation_dB = newNoiseFloor - noisePower_dBW;

  // State classification
  let state;
  if (jToS_dB < -10) {
    state = 'resilient';
  } else if (jToS_dB < 0) {
    state = 'degraded';
  } else {
    state = 'denied';
  }

  // Mitigation options based on scenario
  const mitigationOptions = [];
  if (jToS_dB > -10) mitigationOptions.push('bigger_antenna');
  if (jToS_dB > -6)  mitigationOptions.push('narrower_beam');
  if (jToS_dB > -3)  mitigationOptions.push('power_increase');
  if (jToS_dB > 0) {
    mitigationOptions.push('band_switch');
    mitigationOptions.push('coding_change');
    mitigationOptions.push('alt_station');
    mitigationOptions.push('alt_route');
  }

  return {
    jammerReceived_dBW,
    jToS_dB,
    jToN_dB,
    marginDegradation_dB,
    state,
    mitigationOptions,
    precisionLabel: 'Engineering approximation — simplified free-space model',
  };
}

// ─── Mitigation comparison ────────────────────────────────────────────────────

/**
 * Mitigation effect estimates in dB improvement to J/S.
 * @type {Object<string, number>}
 */
const MITIGATION_EFFECTS = {
  bigger_antenna:  6,
  narrower_beam:  10,
  power_increase:  3,
  band_switch:    15,
  coding_change:   4,
  alt_station:    12,
  alt_route:      20,
};

/**
 * Evaluate a list of candidate mitigations against a baseline interference
 * assessment.
 *
 * Precision tier: Engineering approximation — indicative improvement deltas.
 *
 * @param {Object} baseResult   - Result from {@link assessInterference}.
 * @param {string[]} mitigations - Array of mitigation keys to evaluate.
 * @returns {Array<{mitigation: string, improvement_dB: number, newJtoS_dB: number, newState: string}>}
 */
export function compareMitigations(baseResult, mitigations) {
  return mitigations.map(m => {
    const improvement_dB = MITIGATION_EFFECTS[m] ?? 0;
    const newJtoS_dB = baseResult.jToS_dB - improvement_dB;

    let newState;
    if (newJtoS_dB < -10) {
      newState = 'resilient';
    } else if (newJtoS_dB < 0) {
      newState = 'degraded';
    } else {
      newState = 'denied';
    }

    return { mitigation: m, improvement_dB, newJtoS_dB, newState };
  });
}
