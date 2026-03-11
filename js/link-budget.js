/**
 * @file link-budget.js
 * @module link-budget
 * @description Per-hop satellite communications link budget engine.
 *
 * Computes EIRP, free-space path loss, received power, C/N0, Eb/N0, and
 * link margin for a single hop, as well as combined uplink/downlink results.
 *
 * Formula chain:
 *   EIRP = Pt + Gt
 *   Pr   = EIRP + Gr − FSPL − Latm − Lpoint − Lpol − Lmisc
 *   C/N0 = Pr − N0
 *   Eb/N0 = C/N0 − 10·log10(Rb)
 */

import { SPEED_OF_LIGHT } from './constants.js';
import { BOLTZMANN_DB, MODULATION_PRESETS } from './rf-constants.js';

// ─── Free-space path loss ─────────────────────────────────────────────────────

/**
 * Free-space path loss in dB.
 *
 * FSPL = 20·log10(4·π·d·f / c)
 *
 * Precision tier: Exact (analytic formula).
 *
 * @param {number} freq_Hz   - Carrier frequency [Hz].
 * @param {number} distance_m - Propagation distance [m].
 * @returns {number} FSPL [dB].
 */
export function freeSpacePathLoss(freq_Hz, distance_m) {
  const fspl = (4 * Math.PI * distance_m * freq_Hz) / SPEED_OF_LIGHT;
  return 20 * Math.log10(fspl);
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Default system noise temperature [K] when not specified. */
const DEFAULT_SYSTEM_NOISE_TEMP_K = 290;

/**
 * Classify the link state from margin.
 * @param {number} margin_dB
 * @returns {string}
 */
function classifyLink(margin_dB) {
  if (margin_dB >= 6)  return 'Excellent — high availability';
  if (margin_dB >= 3)  return 'Good — standard availability';
  if (margin_dB >= 0)  return 'Marginal — reduced availability';
  return 'Link closure failure — insufficient margin';
}

// ─── Single-hop link budget ───────────────────────────────────────────────────

/**
 * Compute a complete single-hop link budget.
 *
 * Precision tier: Standard engineering approximation.
 *
 * @param {Object} params - Link parameters.
 * @param {number} params.txPower_dBW        - Transmitter power [dBW].
 * @param {number} params.txAntennaGain_dBi  - Transmit antenna gain [dBi].
 * @param {number} params.rxAntennaGain_dBi  - Receive antenna gain [dBi].
 * @param {number} params.freq_Hz            - Carrier frequency [Hz].
 * @param {number} params.bandwidth_Hz       - Channel bandwidth [Hz].
 * @param {number} params.dataRate_bps       - Data rate [bps].
 * @param {number} params.distance_m         - Link distance [m].
 * @param {number} [params.losses_dB=0]          - Miscellaneous losses [dB].
 * @param {string} [params.modulationPreset='QPSK_12'] - Key into MODULATION_PRESETS.
 * @param {number} [params.atmosphericLoss_dB=0]  - Atmospheric loss [dB].
 * @param {number} [params.pointingLoss_dB=0]     - Pointing loss [dB].
 * @param {number} [params.polarizationLoss_dB=0] - Polarization mismatch loss [dB].
 * @param {number} [params.systemNoiseTemp_K=290] - System noise temperature [K].
 * @returns {{
 *   eirp_dBW: number,
 *   fspl_dB: number,
 *   totalLoss_dB: number,
 *   rxPower_dBW: number,
 *   noiseDensity_dBW_Hz: number,
 *   systemNoiseTemp_K: number,
 *   cn0_dBHz: number,
 *   ebN0_dB: number,
 *   requiredEbN0_dB: number,
 *   margin_dB: number,
 *   maxThroughput_bps: number,
 *   serviceSuitability: string,
 *   precisionLabel: string
 * }}
 */
export function computeLinkBudget(params) {
  const {
    txPower_dBW,
    txAntennaGain_dBi,
    rxAntennaGain_dBi,
    freq_Hz,
    bandwidth_Hz,
    dataRate_bps,
    distance_m,
    losses_dB = 0,
    modulationPreset = 'QPSK_12',
    atmosphericLoss_dB = 0,
    pointingLoss_dB = 0,
    polarizationLoss_dB = 0,
    systemNoiseTemp_K = DEFAULT_SYSTEM_NOISE_TEMP_K,
  } = params;

  const eirp_dBW = txPower_dBW + txAntennaGain_dBi;
  const fspl_dB = freeSpacePathLoss(freq_Hz, distance_m);
  const totalLoss_dB = fspl_dB + atmosphericLoss_dB + pointingLoss_dB
                     + polarizationLoss_dB + losses_dB;

  const rxPower_dBW = eirp_dBW + rxAntennaGain_dBi - totalLoss_dB;

  // Noise density  N0 = k·T  →  N0_dB = BOLTZMANN_DB + 10·log10(T)
  const noiseDensity_dBW_Hz = BOLTZMANN_DB + 10 * Math.log10(systemNoiseTemp_K);

  const cn0_dBHz = rxPower_dBW - noiseDensity_dBW_Hz;
  const ebN0_dB  = cn0_dBHz - 10 * Math.log10(dataRate_bps);

  const mod = MODULATION_PRESETS[modulationPreset] || MODULATION_PRESETS.QPSK_12;
  const requiredEbN0_dB = mod.requiredEbN0_dB;
  const margin_dB = ebN0_dB - requiredEbN0_dB;

  const maxThroughput_bps = bandwidth_Hz * mod.spectralEfficiency_bps_Hz;

  return {
    eirp_dBW,
    fspl_dB,
    totalLoss_dB,
    rxPower_dBW,
    noiseDensity_dBW_Hz,
    systemNoiseTemp_K,
    cn0_dBHz,
    ebN0_dB,
    requiredEbN0_dB,
    margin_dB,
    maxThroughput_bps,
    serviceSuitability: classifyLink(margin_dB),
    precisionLabel: 'Standard engineering approximation',
  };
}

// ─── Uplink + downlink composite ──────────────────────────────────────────────

/**
 * Compute link budgets for an uplink and a downlink, then combine.
 *
 * Precision tier: Standard engineering approximation.
 *
 * @param {Object} uplinkParams   - Parameters for {@link computeLinkBudget}.
 * @param {Object} downlinkParams - Parameters for {@link computeLinkBudget}.
 * @returns {{
 *   uplink: Object,
 *   downlink: Object,
 *   worstMargin: number,
 *   summary: string
 * }}
 */
export function computeUplinkDownlink(uplinkParams, downlinkParams) {
  const uplink   = computeLinkBudget(uplinkParams);
  const downlink = computeLinkBudget(downlinkParams);
  const worstMargin = Math.min(uplink.margin_dB, downlink.margin_dB);
  const limiter = uplink.margin_dB <= downlink.margin_dB ? 'uplink' : 'downlink';

  return {
    uplink,
    downlink,
    worstMargin,
    summary: `Worst margin ${worstMargin.toFixed(1)} dB (limited by ${limiter}). `
           + `Uplink ${uplink.margin_dB.toFixed(1)} dB, `
           + `Downlink ${downlink.margin_dB.toFixed(1)} dB.`,
  };
}
