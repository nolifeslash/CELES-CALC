/**
 * @file antennas.js
 * @module antennas
 * @description Antenna gain, beamwidth, effective area, and pointing-loss
 * models for satellite communications analysis.
 *
 * Includes common antenna presets and parametric calculation functions for
 * parabolic reflectors and generic aperture antennas.
 */

import { SPEED_OF_LIGHT, PI } from './constants.js';

// ─── Antenna presets ──────────────────────────────────────────────────────────

/**
 * Common antenna type presets.
 *
 * @type {Object<string, {name: string, gain_dBi: number, beamwidth_deg: number}>}
 */
export const ANTENNA_PRESETS = {
  omni:          { name: 'Omnidirectional',    gain_dBi: 0,  beamwidth_deg: 360 },
  patch:         { name: 'Patch',              gain_dBi: 6,  beamwidth_deg: 90  },
  yagi:          { name: 'Yagi',               gain_dBi: 12, beamwidth_deg: 30  },
  parabolic_1m:  { name: 'Parabolic 1 m',      gain_dBi: 30, beamwidth_deg: 5   },
  parabolic_3m:  { name: 'Parabolic 3 m',      gain_dBi: 40, beamwidth_deg: 1.7 },
  parabolic_7m:  { name: 'Parabolic 7 m',      gain_dBi: 46, beamwidth_deg: 0.7 },
  phased_array:  { name: 'Phased Array',       gain_dBi: 35, beamwidth_deg: 3   },
};

// ─── Parametric models ────────────────────────────────────────────────────────

/**
 * Parabolic antenna gain.
 *
 * G = 10·log10( η·(π·D·f / c)² )
 *
 * Precision tier: Standard engineering formula.
 *
 * @param {number} diameter_m   - Dish diameter [m].
 * @param {number} freq_Hz      - Operating frequency [Hz].
 * @param {number} [efficiency=0.55] - Aperture efficiency (0–1).
 * @returns {number} Gain [dBi].
 */
export function parabolicGain(diameter_m, freq_Hz, efficiency = 0.55) {
  const ratio = (PI * diameter_m * freq_Hz) / SPEED_OF_LIGHT;
  return 10 * Math.log10(efficiency * ratio * ratio);
}

/**
 * Half-power beamwidth of a parabolic antenna.
 *
 * θ₃dB ≈ 70·c / (f·D)   [degrees]
 *
 * Precision tier: Standard engineering approximation.
 *
 * @param {number} diameter_m - Dish diameter [m].
 * @param {number} freq_Hz    - Operating frequency [Hz].
 * @returns {number} Half-power beamwidth [°].
 */
export function halfPowerBeamwidth(diameter_m, freq_Hz) {
  return 70 * SPEED_OF_LIGHT / (freq_Hz * diameter_m);
}

/**
 * Effective aperture area from gain and frequency.
 *
 * Ae = G_linear · λ² / (4·π)
 *
 * Precision tier: Exact (analytic formula).
 *
 * @param {number} gain_dBi - Antenna gain [dBi].
 * @param {number} freq_Hz  - Operating frequency [Hz].
 * @returns {number} Effective area [m²].
 */
export function effectiveArea(gain_dBi, freq_Hz) {
  const gainLinear = Math.pow(10, gain_dBi / 10);
  const lambda = SPEED_OF_LIGHT / freq_Hz;
  return (gainLinear * lambda * lambda) / (4 * PI);
}

/**
 * Pointing loss for off-axis offset using a Gaussian beam approximation.
 *
 * L = 12·(θ_offset / θ₃dB)²   [dB]
 *
 * Precision tier: Standard engineering approximation.
 *
 * @param {number} offset_deg    - Off-axis pointing offset [°].
 * @param {number} beamwidth_deg - Half-power beamwidth [°].
 * @returns {number} Pointing loss [dB] (positive value = loss).
 */
export function pointingLoss(offset_deg, beamwidth_deg) {
  if (beamwidth_deg <= 0) return 0;
  const ratio = offset_deg / beamwidth_deg;
  return 12 * ratio * ratio;
}
