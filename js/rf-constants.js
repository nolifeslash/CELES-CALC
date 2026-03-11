/**
 * @file rf-constants.js
 * @module rf-constants
 * @description RF constants, frequency band definitions, and modulation presets
 * for satellite communications link analysis.
 *
 * Band boundaries follow standard ITU/IEEE radar-band conventions.
 * Modulation presets give typical spectral efficiency and required Eb/N0
 * values for common DVB-S2-class coding schemes.
 */

import { SPEED_OF_LIGHT } from './constants.js';

// ─── Physical RF constants ────────────────────────────────────────────────────

/** Boltzmann constant expressed in dBW/K/Hz */
export const BOLTZMANN_DB = -228.6;

/** Re-export for convenience — speed of light in vacuum [m/s] */
export { SPEED_OF_LIGHT } from './constants.js';

// ─── Frequency band definitions ───────────────────────────────────────────────

/**
 * Standard RF frequency bands with min/max boundaries in GHz.
 *
 * @type {Object<string, {label: string, fMin_GHz: number, fMax_GHz: number}>}
 */
export const RF_BANDS = {
  VHF: { label: 'VHF',  fMin_GHz: 0.03,  fMax_GHz: 0.3   },
  UHF: { label: 'UHF',  fMin_GHz: 0.3,   fMax_GHz: 1     },
  L:   { label: 'L',    fMin_GHz: 1,      fMax_GHz: 2     },
  S:   { label: 'S',    fMin_GHz: 2,      fMax_GHz: 4     },
  C:   { label: 'C',    fMin_GHz: 4,      fMax_GHz: 8     },
  X:   { label: 'X',    fMin_GHz: 8,      fMax_GHz: 12    },
  Ku:  { label: 'Ku',   fMin_GHz: 12,     fMax_GHz: 18    },
  Ka:  { label: 'Ka',   fMin_GHz: 26.5,   fMax_GHz: 40    },
  V:   { label: 'V',    fMin_GHz: 40,     fMax_GHz: 75    },
  W:   { label: 'W',    fMin_GHz: 75,     fMax_GHz: 110   },
};

// ─── Modulation presets ───────────────────────────────────────────────────────

/**
 * Common modulation and coding presets.
 *
 * @type {Object<string, {name: string, spectralEfficiency_bps_Hz: number, requiredEbN0_dB: number}>}
 */
export const MODULATION_PRESETS = {
  BPSK_12:    { name: 'BPSK 1/2',     spectralEfficiency_bps_Hz: 0.5,  requiredEbN0_dB: 2.5  },
  QPSK_12:    { name: 'QPSK 1/2',     spectralEfficiency_bps_Hz: 1.0,  requiredEbN0_dB: 4.0  },
  QPSK_34:    { name: 'QPSK 3/4',     spectralEfficiency_bps_Hz: 1.5,  requiredEbN0_dB: 5.5  },
  '8PSK_34':  { name: '8PSK 3/4',     spectralEfficiency_bps_Hz: 2.25, requiredEbN0_dB: 8.5  },
  '16APSK_56':{ name: '16APSK 5/6',   spectralEfficiency_bps_Hz: 3.33, requiredEbN0_dB: 11.0 },
};

// ─── Band lookup ──────────────────────────────────────────────────────────────

/**
 * Return the standard band name for a given frequency.
 *
 * @param {number} freq_GHz - Frequency [GHz].
 * @returns {string|null} Band key (e.g. 'Ku') or null if out of range.
 */
export function bandForFrequency(freq_GHz) {
  for (const [key, band] of Object.entries(RF_BANDS)) {
    if (freq_GHz >= band.fMin_GHz && freq_GHz < band.fMax_GHz) {
      return key;
    }
  }
  return null;
}
