/**
 * @file atmosphere.js
 * @module atmosphere
 * @description Atmospheric and propagation loss models for satellite link
 * analysis.
 *
 * All attenuation values are one-way zenith estimates in dB. Low-elevation
 * scaling uses the 1/sin(el) cosecant model clamped at 5° minimum elevation.
 *
 * @accuracy Engineering approximation — not full ITU-R P.618 / P.676.
 */

import { DEG_TO_RAD } from './constants.js';

// ─── Weather presets ──────────────────────────────────────────────────────────

/**
 * Weather / atmospheric condition presets with one-way zenith attenuation
 * estimates per band [dB].
 *
 * @type {Object<string, {name: string, rainRate_mmh: number, description: string,
 *   attenuationByBand: Object<string, number>}>}
 */
export const WEATHER_PRESETS = {
  clear_sky: {
    name: 'Clear Sky',
    rainRate_mmh: 0,
    description: 'No precipitation; gaseous absorption only.',
    attenuationByBand: { L: 0.01, S: 0.02, C: 0.04, X: 0.06, Ku: 0.12, Ka: 0.35 },
  },
  light_rain: {
    name: 'Light Rain',
    rainRate_mmh: 5,
    description: 'Light rain — 5 mm/h.',
    attenuationByBand: { L: 0.02, S: 0.05, C: 0.15, X: 0.5, Ku: 1.5, Ka: 4.0 },
  },
  heavy_rain: {
    name: 'Heavy Rain',
    rainRate_mmh: 25,
    description: 'Heavy rain — 25 mm/h.',
    attenuationByBand: { L: 0.05, S: 0.15, C: 0.6, X: 2.0, Ku: 6.0, Ka: 15.0 },
  },
  storm: {
    name: 'Storm',
    rainRate_mmh: 50,
    description: 'Severe storm — 50 mm/h.',
    attenuationByBand: { L: 0.1, S: 0.3, C: 1.2, X: 4.5, Ku: 12.0, Ka: 30.0 },
  },
  polar_dry: {
    name: 'Polar Dry',
    rainRate_mmh: 0,
    description: 'Polar dry atmosphere — low water vapour.',
    attenuationByBand: { L: 0.005, S: 0.01, C: 0.02, X: 0.04, Ku: 0.08, Ka: 0.2 },
  },
  maritime_humid: {
    name: 'Maritime Humid',
    rainRate_mmh: 2,
    description: 'Warm maritime air — elevated water vapour.',
    attenuationByBand: { L: 0.02, S: 0.04, C: 0.1, X: 0.3, Ku: 0.8, Ka: 2.0 },
  },
  desert_dry: {
    name: 'Desert Dry',
    rainRate_mmh: 0,
    description: 'Hot arid environment — very low moisture.',
    attenuationByBand: { L: 0.005, S: 0.01, C: 0.03, X: 0.05, Ku: 0.1, Ka: 0.25 },
  },
};

// ─── Elevation-angle scaling ──────────────────────────────────────────────────

/**
 * Additional atmospheric path-length factor for low elevation angles.
 * Uses 1/sin(el) model with a minimum clamp at 5°.
 *
 * Precision tier: Engineering approximation — not full ITU-R.
 *
 * @param {number} el_deg - Elevation angle [°].
 * @returns {number} Multiplicative path-length factor (≥ 1).
 */
export function lowElevationPenalty(el_deg) {
  const clampedEl = Math.max(el_deg, 5);
  return 1 / Math.sin(clampedEl * DEG_TO_RAD);
}

// ─── Combined atmospheric loss ────────────────────────────────────────────────

/**
 * Total one-way atmospheric loss for a given band, weather preset, and
 * elevation angle.
 *
 * Precision tier: Engineering approximation — not full ITU-R.
 *
 * @param {string} band - RF band key (e.g. 'Ku', 'Ka').
 * @param {string} weatherPreset - Key into WEATHER_PRESETS.
 * @param {number} el_deg - Elevation angle [°].
 * @returns {number} Atmospheric loss [dB].
 */
export function atmosphericLoss(band, weatherPreset, el_deg) {
  const preset = WEATHER_PRESETS[weatherPreset];
  if (!preset) return 0;
  const zenithAtten = preset.attenuationByBand[band] ?? 0;
  return zenithAtten * lowElevationPenalty(el_deg);
}

// ─── Ionospheric scintillation ────────────────────────────────────────────────

/**
 * Simplified ionospheric scintillation margin estimate.
 * Higher at lower frequencies; negligible above ~10 GHz.
 *
 * Precision tier: Engineering approximation — not full ITU-R.
 *
 * @param {number} freq_GHz - Carrier frequency [GHz].
 * @returns {number} Estimated scintillation margin [dB].
 */
export function ionosphericScintillation(freq_GHz) {
  if (freq_GHz <= 0) return 0;
  // Simplified inverse-square-frequency model clamped to reasonable range
  const margin = Math.min(3.0 / (freq_GHz * freq_GHz), 10);
  return Math.max(margin, 0);
}
