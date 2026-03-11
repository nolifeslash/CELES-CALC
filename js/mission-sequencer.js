/**
 * @file mission-sequencer.js
 * @module missionSequencer
 * @description Mission leg sequencing for CELES-CALC.
 *
 * Provides utilities to build, validate, and display multi-leg mission
 * sequences with absolute-time timelines and human-readable summaries.
 *
 * All durations are in seconds.  Epochs are Julian Dates (JD).
 */

// ─── Mission leg types ──────────────────────────────────────────────────────

/**
 * Canonical mission leg type labels.
 *
 * @type {Object<string, string>}
 */
export const MISSION_LEG_TYPES = {
  launch:      'Launch',
  insertion:   'Orbit Insertion',
  phasing:     'Phasing',
  transfer:    'Transfer',
  rendezvous:  'Rendezvous',
  service:     'Service/Operations',
  departure:   'Departure',
  disposal:    'Disposal',
};

// ─── Sequence creation ──────────────────────────────────────────────────────

/**
 * Create an empty mission sequence.
 *
 * @returns {{legs: Array, status: string}}
 */
export function createMissionSequence() {
  return {
    legs:   [],
    status: 'planning',
  };
}

// ─── Leg management ─────────────────────────────────────────────────────────

/**
 * Add a leg to a mission sequence.
 *
 * @param {Object} mission - Mission created by {@link createMissionSequence}.
 * @param {{type: string, name?: string, deltaV_m_s?: number,
 *          duration_s?: number, notes?: string}} leg
 * @returns {Object} The updated mission.
 */
export function addMissionLeg(mission, leg) {
  const typeLabel = MISSION_LEG_TYPES[leg.type] || leg.type || 'Unknown';

  mission.legs.push({
    type:       leg.type       || 'unknown',
    name:       leg.name       || typeLabel,
    deltaV_m_s: leg.deltaV_m_s ?? 0,
    duration_s: leg.duration_s ?? 0,
    notes:      leg.notes      || '',
  });

  return mission;
}

// ─── Validation ─────────────────────────────────────────────────────────────

/**
 * Preferred leg ordering — used by {@link validateSequence} to flag
 * out-of-order legs.
 * @type {string[]}
 */
const LEG_ORDER = [
  'launch', 'insertion', 'phasing', 'transfer',
  'rendezvous', 'service', 'departure', 'disposal',
];

/**
 * Validate that a mission sequence has a sensible leg ordering.
 *
 * Returns warnings for out-of-order legs and missing common legs.
 *
 * @param {Object} mission
 * @returns {{valid: boolean, warnings: string[], precisionLabel: string}}
 */
export function validateSequence(mission) {
  const warnings = [];

  if (mission.legs.length === 0) {
    return {
      valid:          false,
      warnings:       ['Mission has no legs.'],
      precisionLabel: 'Structural validation only',
    };
  }

  // Check ordering
  let lastIdx = -1;
  for (const leg of mission.legs) {
    const idx = LEG_ORDER.indexOf(leg.type);
    if (idx !== -1 && idx < lastIdx) {
      warnings.push(`Leg "${leg.name}" (${leg.type}) appears out of typical order.`);
    }
    if (idx !== -1) lastIdx = idx;
  }

  // Common-sense checks
  const types = new Set(mission.legs.map((l) => l.type));
  if (!types.has('launch') && !types.has('insertion')) {
    warnings.push('Sequence has no launch or insertion leg — intentional?');
  }

  return {
    valid:          warnings.length === 0,
    warnings,
    precisionLabel: 'Structural validation only',
  };
}

// ─── Timeline ───────────────────────────────────────────────────────────────

/**
 * Build an absolute-time timeline from a mission sequence.
 *
 * @param {Object} mission    - Mission sequence.
 * @param {number} startEpoch - Mission start epoch (Julian Date).
 * @returns {{timeline: Array<{name: string, startEpoch: number, endEpoch: number,
 *            deltaV_m_s: number}>, totalDuration_s: number,
 *            precisionLabel: string}}
 */
export function sequenceToTimeline(mission, startEpoch) {
  const timeline = [];
  let currentEpoch = startEpoch;

  for (const leg of mission.legs) {
    const durationJD = (leg.duration_s || 0) / 86_400;
    timeline.push({
      name:       leg.name,
      startEpoch: currentEpoch,
      endEpoch:   currentEpoch + durationJD,
      deltaV_m_s: leg.deltaV_m_s,
    });
    currentEpoch += durationJD;
  }

  const totalDuration_s = mission.legs.reduce((sum, l) => sum + (l.duration_s || 0), 0);

  return {
    timeline,
    totalDuration_s,
    precisionLabel: 'Cumulative duration — no epoch refinement',
  };
}

// ─── Summary ────────────────────────────────────────────────────────────────

/**
 * Produce a human-readable summary of a mission sequence.
 *
 * @param {Object} mission
 * @returns {string} Multi-line text summary.
 */
export function missionSummary(mission) {
  const lines = [];
  lines.push(`Mission status: ${mission.status}`);
  lines.push(`Total legs: ${mission.legs.length}`);
  lines.push('');

  let totalDV = 0;
  let totalTime = 0;

  for (let i = 0; i < mission.legs.length; i++) {
    const leg = mission.legs[i];
    totalDV   += leg.deltaV_m_s;
    totalTime += leg.duration_s || 0;

    const dvStr   = leg.deltaV_m_s > 0 ? `Δv ${leg.deltaV_m_s.toFixed(1)} m/s` : 'coast';
    const durStr  = leg.duration_s > 0  ? `${(leg.duration_s / 3600).toFixed(1)} h` : 'instantaneous';
    lines.push(`  ${i + 1}. [${leg.type}] ${leg.name} — ${dvStr}, ${durStr}`);
  }

  lines.push('');
  lines.push(`Total Δv: ${totalDV.toFixed(1)} m/s`);
  lines.push(`Total duration: ${(totalTime / 3600).toFixed(1)} h`);

  return lines.join('\n');
}
