/**
 * @file projection.js
 * @module projection
 * @description Orthographic and simple perspective projection utilities for
 * the 4-view engineering visualizer in CELES-CALC.
 *
 * Projection types:
 *   Orthographic – parallel projection onto one of three principal planes
 *                  ('top', 'sideA', 'sideB'). Used for engineering diagram views.
 *   Perspective  – simple pinhole-camera projection for a free 3-D view.
 *
 * Coordinate conventions:
 *   3-D positions are {x, y, z} in kilometres (km).
 *   2-D canvas positions are {px, py} in pixels (origin at top-left).
 *   Depth values are signed distances in km (positive = in front of camera).
 *
 * This is a pure math module — no DOM access.
 */

import {
  R_EARTH_EQUATORIAL,
  R_EARTH_MEAN,
  R_MOON,
} from './constants.js';

// ─── View-scaling constants (km) ─────────────────────────────────────────────

/** Equatorial radius of the Earth [km] (WGS-84, from R_EARTH_EQUATORIAL). */
export const EARTH_RADIUS_KM = R_EARTH_EQUATORIAL / 1000;

/** Average Earth–Moon centre-to-centre distance [km]. */
export const MOON_DISTANCE_KM = 384_400;

/** Geostationary orbit radius from Earth's centre [km]. */
export const GEO_RADIUS_KM = 42_164;

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Subtract two 3-D vectors.
 * @param {{x:number,y:number,z:number}} a
 * @param {{x:number,y:number,z:number}} b
 * @returns {{x:number,y:number,z:number}}
 */
function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/**
 * Cross product of two 3-D vectors.
 * @param {{x:number,y:number,z:number}} a
 * @param {{x:number,y:number,z:number}} b
 * @returns {{x:number,y:number,z:number}}
 */
function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/**
 * Dot product of two 3-D vectors.
 * @param {{x:number,y:number,z:number}} a
 * @param {{x:number,y:number,z:number}} b
 * @returns {number}
 */
function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/**
 * Normalise a 3-D vector to unit length.
 * @param {{x:number,y:number,z:number}} v
 * @returns {{x:number,y:number,z:number}}
 */
function normalise(v) {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (len === 0) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

// ─── Orthographic projection ──────────────────────────────────────────────────

/**
 * Extract the two projected coordinates from a 3-D point for the given
 * orthographic axis.
 *
 * | axis    | looking from | u (→ screen right) | v (→ screen up) |
 * |---------|-------------|--------------------|--------------------|
 * | 'top'   | +Z          | +X                 | +Y                 |
 * | 'sideA' | +X          | +Y                 | +Z                 |
 * | 'sideB' | +Y          | +X                 | +Z                 |
 *
 * @param {{x:number,y:number,z:number}} p
 * @param {'top'|'sideA'|'sideB'} axis
 * @returns {{u:number, v:number}} Projected km coordinates (right, up).
 */
function orthoUV(p, axis) {
  switch (axis) {
    case 'top':   return { u:  p.x, v:  p.y };
    case 'sideA': return { u:  p.y, v:  p.z };
    case 'sideB': return { u:  p.x, v:  p.z };
    default:
      throw new Error(`Unknown orthographic axis: "${axis}"`);
  }
}

/**
 * Project a 3-D point onto a 2-D canvas coordinate using orthographic
 * (parallel) projection along a principal axis.
 *
 * @param {{x:number, y:number, z:number}} point3D
 *   Position in km.
 * @param {'top'|'sideA'|'sideB'} axis
 *   - `'top'`   — Z-down view (XY plane). Looking from +Z toward origin.
 *   - `'sideA'` — X-down view (YZ plane). Looking from +X toward origin.
 *   - `'sideB'` — Y-down view (XZ plane). Looking from +Y toward origin.
 * @param {{cx:number, cy:number, scale:number}} viewport
 *   `cx`, `cy` — centre of the viewport in pixels.
 *   `scale` — km per pixel (larger = more zoomed out).
 * @returns {{px:number, py:number}} Canvas pixel coordinates.
 */
export function projectOrthographic(point3D, axis, viewport) {
  const { cx, cy, scale } = viewport;
  const { u, v } = orthoUV(point3D, axis);
  return {
    px: cx + u / scale,
    py: cy - v / scale,       // screen-Y is inverted (down = +py)
  };
}

// ─── Perspective projection ───────────────────────────────────────────────────

/**
 * Project a 3-D point using a simple pinhole-camera perspective transform.
 *
 * The camera is defined by an eye position, a target it looks at, a vertical
 * field-of-view angle, and near/far clip distances. An implicit world-up of
 * {0, 0, 1} is used; if the view direction is nearly parallel to +Z or −Z the
 * fallback up vector {0, 1, 0} is substituted.
 *
 * @param {{x:number, y:number, z:number}} point3D
 *   Position in km.
 * @param {{eye:{x:number,y:number,z:number}, target:{x:number,y:number,z:number}, fov:number, near:number, far:number}} camera
 *   `eye`    — camera position [km].
 *   `target` — look-at point [km].
 *   `fov`    — vertical field of view [degrees].
 *   `near`   — near clip distance [km].
 *   `far`    — far clip distance [km].
 * @param {{width:number, height:number}} viewport
 *   Viewport dimensions in pixels.
 * @returns {{px:number, py:number, depth:number}|null}
 *   Canvas pixel coordinates and signed depth in km, or `null` if the point
 *   is behind the camera (depth < near) or beyond the far plane.
 */
export function projectPerspective(point3D, camera, viewport) {
  const { eye, target, fov, near, far } = camera;
  const { width, height } = viewport;

  // Camera basis vectors
  const forward = normalise(sub(target, eye));

  // Choose a world-up that is not parallel to forward
  let worldUp = { x: 0, y: 0, z: 1 };
  if (Math.abs(dot(forward, worldUp)) > 0.99) {
    worldUp = { x: 0, y: 1, z: 0 };
  }

  const right = normalise(cross(forward, worldUp));
  const up    = cross(right, forward);

  // Vector from eye to point, expressed in camera space
  const rel = sub(point3D, eye);
  const camX =  dot(rel, right);
  const camY =  dot(rel, up);
  const camZ =  dot(rel, forward);   // depth along view direction

  // Clip against near/far planes
  if (camZ < near || camZ > far) return null;

  // Perspective divide
  const fovRad   = fov * (Math.PI / 180);
  const focalLen = (height / 2) / Math.tan(fovRad / 2);

  const px = (width  / 2) + (camX / camZ) * focalLen;
  const py = (height / 2) - (camY / camZ) * focalLen;   // screen-Y inverted

  return { px, py, depth: camZ };
}

// ─── Inverse orthographic ─────────────────────────────────────────────────────

/**
 * Convert canvas pixel coordinates back to partial 3-D world coordinates
 * (inverse of {@link projectOrthographic}).
 *
 * Because the orthographic projection collapses one axis, the returned object
 * contains only the two recoverable coordinates; the third is set to `0`.
 *
 * | axis    | returned fields with real values | field set to 0 |
 * |---------|----------------------------------|----------------|
 * | 'top'   | x, y                             | z              |
 * | 'sideA' | y, z                             | x              |
 * | 'sideB' | x, z                             | y              |
 *
 * @param {number} px - Canvas x-pixel.
 * @param {number} py - Canvas y-pixel.
 * @param {'top'|'sideA'|'sideB'} axis
 * @param {{cx:number, cy:number, scale:number}} viewport
 * @returns {{x:number, y:number, z:number}} Partial 3-D position [km].
 */
export function unprojectOrthographic(px, py, axis, viewport) {
  const { cx, cy, scale } = viewport;
  const u =  (px - cx) * scale;
  const v = -(py - cy) * scale;       // invert screen-Y

  switch (axis) {
    case 'top':   return { x: u, y: v, z: 0 };
    case 'sideA': return { x: 0, y: u, z: v };
    case 'sideB': return { x: u, y: 0, z: v };
    default:
      throw new Error(`Unknown orthographic axis: "${axis}"`);
  }
}

// ─── Auto-fit view extents ────────────────────────────────────────────────────

/**
 * Compute viewport parameters (centre pixel and scale) that fit all given 3-D
 * points into an orthographic view with the specified padding.
 *
 * The returned object can be spread directly into a viewport argument for
 * {@link projectOrthographic}.
 *
 * @param {{x:number,y:number,z:number}[]} objects
 *   Array of positions in km.
 * @param {'top'|'sideA'|'sideB'} axis
 *   Projection axis.
 * @param {{padFraction?:number, canvasWidth?:number, canvasHeight?:number}} [padding]
 *   `padFraction` — fraction of the bounding-box span to add as margin
 *       (default `0.1` = 10 %).
 *   `canvasWidth`, `canvasHeight` — target canvas size in pixels
 *       (default 800 × 600).
 * @returns {{cx:number, cy:number, scale:number}}
 *   Viewport parameters: centre pixel and km-per-pixel scale factor.
 */
export function computeViewExtents(objects, axis, padding = {}) {
  const {
    padFraction  = 0.1,
    canvasWidth  = 800,
    canvasHeight = 600,
  } = padding;

  if (!objects || objects.length === 0) {
    return { cx: canvasWidth / 2, cy: canvasHeight / 2, scale: 1 };
  }

  // Project every point to its (u, v) pair
  let uMin =  Infinity, uMax = -Infinity;
  let vMin =  Infinity, vMax = -Infinity;

  for (const p of objects) {
    const { u, v } = orthoUV(p, axis);
    if (u < uMin) uMin = u;
    if (u > uMax) uMax = u;
    if (v < vMin) vMin = v;
    if (v > vMax) vMax = v;
  }

  // Handle degenerate case (all points identical)
  let spanU = uMax - uMin;
  let spanV = vMax - vMin;
  if (spanU === 0 && spanV === 0) {
    spanU = 1;
    spanV = 1;
  }

  // Add padding
  const padU = spanU * padFraction;
  const padV = spanV * padFraction;
  spanU += 2 * padU;
  spanV += 2 * padV;

  // Scale is the larger of horizontal or vertical extent per pixel
  const scaleU = spanU / canvasWidth;
  const scaleV = spanV / canvasHeight;
  const scale  = Math.max(scaleU, scaleV);

  // Centre of bounding box maps to centre of canvas
  const centreU = (uMin + uMax) / 2;
  const centreV = (vMin + vMax) / 2;

  const cx = canvasWidth  / 2 - centreU / scale;
  const cy = canvasHeight / 2 + centreV / scale;   // invert V for screen-Y

  return { cx, cy, scale };
}
