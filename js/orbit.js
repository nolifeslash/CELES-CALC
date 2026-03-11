/**
 * @file orbit.js
 * @module orbit
 * @description Orbital mechanics: classical orbital elements, state vectors,
 * Hohmann transfers, propagation, and relative-motion utilities for CELES-CALC.
 *
 * All functions use SI units (meters, seconds, radians) internally unless
 * noted. Angle parameters that end in "_deg" accept / return degrees.
 *
 * Two-body (Keplerian) dynamics only — no J2 or other perturbations unless
 * explicitly stated.
 */

import { GM_EARTH, DEG_TO_RAD, RAD_TO_DEG, PI } from './constants.js';

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * 3-D dot product.
 * @param {number[]} a @param {number[]} b @returns {number}
 */
function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * 3-D cross product.
 * @param {number[]} a @param {number[]} b @returns {number[]}
 */
function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/**
 * Magnitude of a 3-vector.
 * @param {number[]} v @returns {number}
 */
function norm(v) {
  return Math.sqrt(dot(v, v));
}

/**
 * Scale a 3-vector.
 * @param {number[]} v @param {number} s @returns {number[]}
 */
function scale(v, s) {
  return [v[0] * s, v[1] * s, v[2] * s];
}

/**
 * Add two 3-vectors.
 * @param {number[]} a @param {number[]} b @returns {number[]}
 */
function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/**
 * Normalize a 3-vector to unit length.
 * @param {number[]} v @returns {number[]}
 */
function unit(v) {
  const n = norm(v);
  if (n === 0) throw new Error('Cannot normalize zero vector — check for degenerate state (r_vec or v_vec is zero).');
  return scale(v, 1 / n);
}

// ─── Orbital parameters ───────────────────────────────────────────────────────

/**
 * Orbital period for a Keplerian orbit.
 *
 * @param {number} a  - Semi-major axis [m].
 * @param {number} mu - Gravitational parameter [m³/s²] (defaults to GM_Earth).
 * @returns {number} Period [s].
 */
export function orbitalPeriod(a, mu = GM_EARTH) {
  return 2 * PI * Math.sqrt(a ** 3 / mu);
}

/**
 * Mean motion (angular rate) of a Keplerian orbit.
 *
 * @param {number} a  - Semi-major axis [m].
 * @param {number} mu - Gravitational parameter [m³/s²].
 * @returns {number} Mean motion [rad/s].
 */
export function meanMotion(a, mu = GM_EARTH) {
  return Math.sqrt(mu / a ** 3);
}

/**
 * Circular orbit velocity at radius r.
 *
 * @param {number} r  - Orbit radius from body centre [m].
 * @param {number} mu - Gravitational parameter [m³/s²].
 * @returns {number} Circular velocity [m/s].
 */
export function circularVelocity(r, mu = GM_EARTH) {
  return Math.sqrt(mu / r);
}

/**
 * Escape velocity at radius r.
 *
 * @param {number} r  - Distance from body centre [m].
 * @param {number} mu - Gravitational parameter [m³/s²].
 * @returns {number} Escape velocity [m/s].
 */
export function escapeVelocity(r, mu = GM_EARTH) {
  return Math.sqrt(2 * mu / r);
}

/**
 * Vis-viva equation — speed of an object at distance r on an orbit with
 * semi-major axis a.
 *
 * @param {number} r  - Current radius [m].
 * @param {number} a  - Semi-major axis [m] (use Infinity for parabolic).
 * @param {number} mu - Gravitational parameter [m³/s²].
 * @returns {number} Speed [m/s].
 */
export function visViva(r, a, mu = GM_EARTH) {
  return Math.sqrt(mu * (2 / r - 1 / a));
}

// ─── COE ↔ State vector ───────────────────────────────────────────────────────

/**
 * Convert Classical Orbital Elements (COEs) to a state vector.
 * Uses the perifocal (PQW) frame then rotates to ECI.
 *
 * @param {number} a        - Semi-major axis [m].
 * @param {number} e        - Eccentricity [0, 1) for elliptic.
 * @param {number} i_deg    - Inclination [°].
 * @param {number} raan_deg - Right Ascension of the Ascending Node [°].
 * @param {number} argp_deg - Argument of perigee [°].
 * @param {number} nu_deg   - True anomaly [°].
 * @param {number} [mu]     - Gravitational parameter [m³/s²].
 * @returns {{r_vec: number[], v_vec: number[]}}
 *   r_vec: Position vector [m], v_vec: velocity vector [m/s].
 */
export function coeToState(a, e, i_deg, raan_deg, argp_deg, nu_deg, mu = GM_EARTH) {
  const i    = i_deg    * DEG_TO_RAD;
  const raan = raan_deg * DEG_TO_RAD;
  const argp = argp_deg * DEG_TO_RAD;
  const nu   = nu_deg   * DEG_TO_RAD;

  const cosNu = Math.cos(nu);
  const sinNu = Math.sin(nu);

  // Semi-latus rectum
  const p = a * (1 - e * e);
  // Distance
  const r = p / (1 + e * cosNu);
  // Speed factor
  const h = Math.sqrt(mu * p);

  // Position and velocity in perifocal frame (PQW)
  const rP = [r * cosNu, r * sinNu, 0];
  const vP = [(-mu / h) * sinNu, (mu / h) * (e + cosNu), 0];

  // Rotation matrix from PQW → ECI: R3(−RAAN) · R1(−i) · R3(−argp)
  const cosRaan = Math.cos(raan), sinRaan = Math.sin(raan);
  const cosi    = Math.cos(i),    sini    = Math.sin(i);
  const cosArgp = Math.cos(argp), sinArgp = Math.sin(argp);

  // Row vectors of the rotation matrix
  const Qx = [
     cosRaan * cosArgp - sinRaan * sinArgp * cosi,
    -cosRaan * sinArgp - sinRaan * cosArgp * cosi,
     sinRaan * sini,
  ];
  const Qy = [
     sinRaan * cosArgp + cosRaan * sinArgp * cosi,
    -sinRaan * sinArgp + cosRaan * cosArgp * cosi,
    -cosRaan * sini,
  ];
  const Qz = [
     sinArgp * sini,
     cosArgp * sini,
     cosi,
  ];

  const rotate = (v) => [
    Qx[0] * v[0] + Qy[0] * v[1] + Qz[0] * v[2],
    Qx[1] * v[0] + Qy[1] * v[1] + Qz[1] * v[2],
    Qx[2] * v[0] + Qy[2] * v[1] + Qz[2] * v[2],
  ];

  return {
    r_vec: rotate(rP),
    v_vec: rotate(vP),
  };
}

/**
 * Convert a state vector (position + velocity) to Classical Orbital Elements.
 *
 * @param {number[]} r_vec - Position vector [m] (length 3).
 * @param {number[]} v_vec - Velocity vector [m/s] (length 3).
 * @param {number} [mu]    - Gravitational parameter [m³/s²].
 * @returns {{
 *   a: number, e: number, i_deg: number,
 *   raan_deg: number, argp_deg: number, nu_deg: number,
 *   period_s: number
 * }}
 */
export function stateToCOE(r_vec, v_vec, mu = GM_EARTH) {
  const r = norm(r_vec);
  const v = norm(v_vec);

  // Specific angular momentum
  const h_vec = cross(r_vec, v_vec);
  const h     = norm(h_vec);

  // Node vector (N = K × h)
  const K   = [0, 0, 1];
  const N   = cross(K, h_vec);
  const nMag = norm(N);

  // Eccentricity vector
  const e_vec = add(
    scale(r_vec, (v * v - mu / r) / mu),
    scale(v_vec, -dot(r_vec, v_vec) / mu)
  );
  const e = norm(e_vec);

  // Specific mechanical energy
  const energy = v * v / 2 - mu / r;

  // Semi-major axis (negative for hyperbolic, handled gracefully)
  const a = -mu / (2 * energy);

  // Inclination
  const i_deg = Math.acos(Math.max(-1, Math.min(1, h_vec[2] / h))) * RAD_TO_DEG;

  // RAAN
  let raan_deg;
  if (nMag < 1e-10) {
    raan_deg = 0; // equatorial orbit — RAAN undefined, set to 0
  } else {
    raan_deg = Math.acos(Math.max(-1, Math.min(1, N[0] / nMag))) * RAD_TO_DEG;
    if (N[1] < 0) raan_deg = 360 - raan_deg;
  }

  // Argument of perigee
  let argp_deg;
  if (nMag < 1e-10 || e < 1e-10) {
    argp_deg = 0; // circular or equatorial — argp undefined, set to 0
  } else {
    argp_deg = Math.acos(Math.max(-1, Math.min(1, dot(N, e_vec) / (nMag * e)))) * RAD_TO_DEG;
    if (e_vec[2] < 0) argp_deg = 360 - argp_deg;
  }

  // True anomaly
  let nu_deg;
  if (e < 1e-10) {
    // Circular: use argument of latitude
    if (nMag < 1e-10) {
      nu_deg = Math.atan2(r_vec[1], r_vec[0]) * RAD_TO_DEG;
    } else {
      nu_deg = Math.acos(Math.max(-1, Math.min(1, dot(N, r_vec) / (nMag * r)))) * RAD_TO_DEG;
      if (dot(N, v_vec) > 0) nu_deg = 360 - nu_deg;
    }
  } else {
    nu_deg = Math.acos(Math.max(-1, Math.min(1, dot(e_vec, r_vec) / (e * r)))) * RAD_TO_DEG;
    if (dot(r_vec, v_vec) < 0) nu_deg = 360 - nu_deg;
  }

  const period_s = e < 1 ? orbitalPeriod(a, mu) : Infinity;

  return { a, e, i_deg, raan_deg, argp_deg, nu_deg, period_s };
}

// ─── Anomaly conversions ──────────────────────────────────────────────────────

/**
 * Convert eccentric anomaly to true anomaly.
 *
 * @param {number} E_deg - Eccentric anomaly [°].
 * @param {number} e     - Eccentricity.
 * @returns {number} True anomaly [°], in [0, 360).
 */
export function eccentricToTrueAnomaly(E_deg, e) {
  const E = E_deg * DEG_TO_RAD;
  const nu = 2 * Math.atan2(
    Math.sqrt(1 + e) * Math.sin(E / 2),
    Math.sqrt(1 - e) * Math.cos(E / 2)
  );
  return ((nu * RAD_TO_DEG) % 360 + 360) % 360;
}

/**
 * Convert true anomaly to eccentric anomaly.
 *
 * @param {number} nu_deg - True anomaly [°].
 * @param {number} e      - Eccentricity.
 * @returns {number} Eccentric anomaly [°], in [0, 360).
 */
export function trueToEccentricAnomaly(nu_deg, e) {
  const nu = nu_deg * DEG_TO_RAD;
  const E  = 2 * Math.atan2(
    Math.sqrt(1 - e) * Math.sin(nu / 2),
    Math.sqrt(1 + e) * Math.cos(nu / 2)
  );
  return ((E * RAD_TO_DEG) % 360 + 360) % 360;
}

/**
 * Solve Kepler's equation M = E − e·sin(E) for E given M and e,
 * using Newton-Raphson iteration.
 *
 * @param {number} M_deg - Mean anomaly [°].
 * @param {number} e     - Eccentricity [0, 1).
 * @param {number} [tol=1e-12] - Convergence tolerance in radians.
 * @returns {number} Eccentric anomaly [°], in [0, 360).
 */
export function meanToEccentricAnomaly(M_deg, e, tol = 1e-12) {
  const M = ((M_deg * DEG_TO_RAD) % (2 * PI) + 2 * PI) % (2 * PI);
  // Initial guess
  let E = e < 0.8 ? M : PI;
  for (let i = 0; i < 100; i++) {
    const dE = (M - E + e * Math.sin(E)) / (1 - e * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < tol) break;
  }
  return ((E * RAD_TO_DEG) % 360 + 360) % 360;
}

// ─── Propagation ──────────────────────────────────────────────────────────────

/**
 * Propagate Keplerian orbital elements forward by a time step using two-body
 * dynamics (only mean anomaly changes).
 *
 * @param {{a:number, e:number, i_deg:number, raan_deg:number,
 *           argp_deg:number, nu_deg:number}} coe - Classical orbital elements.
 * @param {number} dt_s - Time step [s] (negative = backward propagation).
 * @param {number} [mu] - Gravitational parameter [m³/s²].
 * @returns {typeof coe} New orbital elements with updated true anomaly.
 */
export function keplerPropagate(coe, dt_s, mu = GM_EARTH) {
  const { a, e, i_deg, raan_deg, argp_deg, nu_deg } = coe;

  // Current eccentric anomaly → mean anomaly
  const E0_deg = trueToEccentricAnomaly(nu_deg, e);
  const E0     = E0_deg * DEG_TO_RAD;
  const M0     = E0 - e * Math.sin(E0);

  // Propagate mean anomaly
  const n   = meanMotion(a, mu);
  const M1  = ((M0 + n * dt_s) % (2 * PI) + 2 * PI) % (2 * PI);
  const M1_deg = M1 * RAD_TO_DEG;

  // Solve Kepler for new E then convert to true anomaly
  const E1_deg  = meanToEccentricAnomaly(M1_deg, e);
  const nu1_deg = eccentricToTrueAnomaly(E1_deg, e);

  return { a, e, i_deg, raan_deg, argp_deg, nu_deg: nu1_deg };
}

// ─── Manoeuvres ───────────────────────────────────────────────────────────────

/**
 * Compute Hohmann transfer delta-v values between two co-planar circular orbits.
 *
 * @param {number} r1 - Radius of departure circular orbit [m].
 * @param {number} r2 - Radius of target circular orbit [m].
 * @param {number} [mu] - Gravitational parameter [m³/s²].
 * @returns {{dv1: number, dv2: number, dvTotal: number, transferTime_s: number}}
 *   dv1:            First burn delta-v  [m/s] (positive = prograde).
 *   dv2:            Second burn delta-v [m/s] (positive = prograde).
 *   dvTotal:        Total |dv1| + |dv2| [m/s].
 *   transferTime_s: Half-period of the transfer ellipse [s].
 */
export function hohmannDeltaV(r1, r2, mu = GM_EARTH) {
  const vc1 = circularVelocity(r1, mu);
  const vc2 = circularVelocity(r2, mu);
  const aTransfer = (r1 + r2) / 2;

  // Speed at periapsis and apoapsis of transfer ellipse
  const vp = visViva(r1, aTransfer, mu);
  const va = visViva(r2, aTransfer, mu);

  const dv1 = vp - vc1;
  const dv2 = vc2 - va;
  const dvTotal = Math.abs(dv1) + Math.abs(dv2);
  const transferTime_s = orbitalPeriod(aTransfer, mu) / 2;

  return { dv1, dv2, dvTotal, transferTime_s };
}

/**
 * Delta-v required for a pure plane change at constant speed.
 *
 * @param {number} v          - Current orbital speed [m/s].
 * @param {number} deltaI_deg - Plane change angle [°].
 * @returns {number} Delta-v [m/s] (always positive).
 */
export function planeChangeDeltaV(v, deltaI_deg) {
  return 2 * v * Math.sin((deltaI_deg * DEG_TO_RAD) / 2);
}

// ─── RTN Frame & Relative Motion ─────────────────────────────────────────────

/**
 * Compute the Radial-Transverse-Normal (RTN / LVLH) unit vectors from a
 * state vector.
 *
 * @param {number[]} r_vec - Position vector [m].
 * @param {number[]} v_vec - Velocity vector [m/s].
 * @returns {{rHat: number[], tHat: number[], nHat: number[]}}
 *   rHat: Radial (away from body), tHat: Transverse (along-track ≈ velocity),
 *   nHat: Normal (cross-track, completing right-handed frame).
 */
export function rtnFromState(r_vec, v_vec) {
  const rHat = unit(r_vec);
  const nHat = unit(cross(r_vec, v_vec));
  const tHat = cross(nHat, rHat);
  return { rHat, tHat, nHat };
}

/**
 * Express the relative position of a deputy satellite with respect to a chief
 * satellite in the chief's RTN frame.
 *
 * @param {number[]} r_chief  - Chief position vector [m].
 * @param {number[]} v_chief  - Chief velocity vector [m/s].
 * @param {number[]} r_deputy - Deputy position vector [m].
 * @returns {{rRTN: number[]}}
 *   rRTN: [R, T, N] relative position components [m].
 */
export function relativePositionRTN(r_chief, v_chief, r_deputy) {
  const { rHat, tHat, nHat } = rtnFromState(r_chief, v_chief);
  const dr = [
    r_deputy[0] - r_chief[0],
    r_deputy[1] - r_chief[1],
    r_deputy[2] - r_chief[2],
  ];
  const rRTN = [dot(dr, rHat), dot(dr, tHat), dot(dr, nHat)];
  return { rRTN };
}
