/**
 * @file quality.js
 * @module quality
 * @description Service quality classification and mission-impact translation
 * for satellite communications links.
 *
 * Maps numeric link-budget metrics (margin, throughput, Eb/N0) into
 * human-readable quality tiers and suitability assessments.
 */

// ─── Throughput classification ────────────────────────────────────────────────

/**
 * Classify a data rate into a throughput tier.
 *
 * Precision tier: Classification heuristic.
 *
 * | Tier       | Range           |
 * |------------|-----------------|
 * | very_low   | < 1 kbps        |
 * | low        | 1–100 kbps      |
 * | medium     | 100 kbps–1 Mbps |
 * | high       | 1–100 Mbps      |
 * | very_high  | > 100 Mbps      |
 *
 * @param {number} dataRate_bps - Data rate [bps].
 * @returns {string} Tier label.
 */
export function throughputClass(dataRate_bps) {
  if (dataRate_bps < 1_000)          return 'very_low';
  if (dataRate_bps < 100_000)        return 'low';
  if (dataRate_bps < 1_000_000)      return 'medium';
  if (dataRate_bps < 100_000_000)    return 'high';
  return 'very_high';
}

// ─── BER classification ───────────────────────────────────────────────────────

/**
 * Classify expected bit-error-rate quality from Eb/N0 margin.
 *
 * Precision tier: Classification heuristic.
 *
 * @param {number} ebN0_dB         - Achieved Eb/N0 [dB].
 * @param {number} requiredEbN0_dB - Required Eb/N0 for target BER [dB].
 * @returns {string} 'excellent'|'good'|'marginal'|'poor'.
 */
export function berClass(ebN0_dB, requiredEbN0_dB) {
  const excess = ebN0_dB - requiredEbN0_dB;
  if (excess >= 6) return 'excellent';
  if (excess >= 3) return 'good';
  if (excess >= 0) return 'marginal';
  return 'poor';
}

// ─── Availability classification ──────────────────────────────────────────────

/**
 * Classify link availability from link margin.
 *
 * Precision tier: Classification heuristic.
 *
 * @param {number} margin_dB - Link margin [dB].
 * @returns {string} 'high_availability'|'standard'|'reduced'|'outage_risk'.
 */
export function availabilityClass(margin_dB) {
  if (margin_dB >= 6) return 'high_availability';
  if (margin_dB >= 3) return 'standard';
  if (margin_dB >= 0) return 'reduced';
  return 'outage_risk';
}

// ─── Service suitability ──────────────────────────────────────────────────────

/**
 * Determine whether the link meets a given service profile's needs.
 *
 * Precision tier: Classification heuristic.
 *
 * @param {Object} params
 * @param {number} params.margin_dB        - Link margin [dB].
 * @param {string} params.throughputClass  - Result of {@link throughputClass}.
 * @param {string} params.berClass         - Result of {@link berClass}.
 * @param {string} [params.serviceProfile='general'] - Service profile name
 *   (e.g. 'voice', 'video', 'telemetry', 'broadband', 'general').
 * @returns {{
 *   suitable: boolean,
 *   rating: string,
 *   reasons: string[],
 *   recommendation: string
 * }}
 */
export function serviceSuitability(params) {
  const {
    margin_dB,
    throughputClass: tpClass,
    berClass: brClass,
    serviceProfile = 'general',
  } = params;

  const reasons = [];

  // Margin assessment
  if (margin_dB < 0) reasons.push('Negative link margin — link does not close.');
  else if (margin_dB < 3) reasons.push('Thin margin — susceptible to fading.');

  // BER assessment
  if (brClass === 'poor') reasons.push('BER quality poor — high error rate expected.');
  else if (brClass === 'marginal') reasons.push('BER quality marginal — may need FEC enhancement.');

  // Profile-specific throughput checks
  const throughputOrder = ['very_low', 'low', 'medium', 'high', 'very_high'];
  const tpIdx = throughputOrder.indexOf(tpClass);

  const profileMinThroughput = {
    telemetry: 0,   // very_low acceptable
    voice: 1,       // low minimum
    general: 1,
    video: 3,       // high minimum
    broadband: 3,
  };
  const requiredIdx = profileMinThroughput[serviceProfile] ?? 1;

  if (tpIdx < requiredIdx) {
    reasons.push(`Throughput '${tpClass}' below minimum for '${serviceProfile}' profile.`);
  }

  // Overall rating
  let rating;
  if (reasons.length === 0 && margin_dB >= 6 && brClass === 'excellent') {
    rating = 'excellent';
  } else if (reasons.length === 0) {
    rating = 'good';
  } else if (margin_dB >= 0 && brClass !== 'poor') {
    rating = 'marginal';
  } else {
    rating = 'unsuitable';
  }

  const suitable = rating === 'excellent' || rating === 'good';

  let recommendation;
  if (suitable) {
    recommendation = 'Link meets service requirements.';
  } else if (rating === 'marginal') {
    recommendation = 'Link may work with reduced reliability. Consider margin improvements.';
  } else {
    recommendation = 'Link does not meet service requirements. Re-engineer link parameters.';
  }

  return { suitable, rating, reasons, recommendation };
}

// ─── Mission impact summary ───────────────────────────────────────────────────

/**
 * Produce a human-readable mission-impact summary from quality results.
 *
 * Precision tier: Narrative summary.
 *
 * @param {Object} qualityResults
 * @param {string} qualityResults.throughputClass
 * @param {string} qualityResults.berClass
 * @param {string} qualityResults.availabilityClass
 * @param {Object} qualityResults.suitability - Result of {@link serviceSuitability}.
 * @returns {string} Human-readable summary paragraph.
 */
export function missionImpactSummary(qualityResults) {
  const {
    throughputClass: tp,
    berClass: ber,
    availabilityClass: avail,
    suitability,
  } = qualityResults;

  const lines = [
    `Throughput tier: ${tp}.`,
    `Bit-error quality: ${ber}.`,
    `Availability class: ${avail}.`,
    `Service rating: ${suitability.rating}.`,
  ];

  if (suitability.reasons.length > 0) {
    lines.push(`Concerns: ${suitability.reasons.join(' ')}`);
  }

  lines.push(suitability.recommendation);

  return lines.join(' ');
}
