/**
 * @file camera.js
 * @module camera
 * @description Camera / view-state management for the 4-view engineering
 * visualizer in CELES-CALC.
 *
 * Each pane (top, sideA, sideB, 3d) maintains its own camera state object.
 * Functions here create, mutate, and query that state without touching the DOM.
 *
 * Coordinate conventions:
 *   - 3-D positions are {x, y, z} in kilometres (km).
 *   - `scale` is km-per-pixel (larger = more zoomed out).
 *   - `cx`, `cy` are the pixel coordinates of the world-space origin on canvas.
 *
 * This is a pure state module — no DOM access.
 */

// ─── Default constants ────────────────────────────────────────────────────────

/**
 * Default scale for orthographic panes (km per pixel).
 * Chosen so that ~50 000 km radius (GEO + margin) fills a typical 800 px half-canvas.
 * 50 000 km / 400 px ≈ 125 km/px.
 * @type {number}
 */
const DEFAULT_ORTHO_SCALE = 125;

/** Default 3-D camera distance from target [km]. */
const DEFAULT_3D_DISTANCE = 50_000;

/** Default vertical field-of-view for the 3-D pane [degrees]. */
const DEFAULT_3D_FOV = 45;

// ─── createViewState ──────────────────────────────────────────────────────────

/**
 * Create a fresh camera state object for a given pane type.
 *
 * Ortho panes ('top', 'sideA', 'sideB') get centre/scale/zoom/rotation.
 * The '3d' pane additionally gets `eye`, `target`, `fov`, and `distance`.
 *
 * @param {'top'|'sideA'|'sideB'|'3d'} type - Pane identifier.
 * @returns {object} New view-state object (see properties below).
 * @property {string}  type     - Pane type.
 * @property {number}  cx       - World-origin x-offset on canvas [px].
 * @property {number}  cy       - World-origin y-offset on canvas [px].
 * @property {number}  scale    - Km per pixel.
 * @property {number}  zoom     - Cumulative zoom multiplier (1 = default).
 * @property {number}  rotation - View rotation [degrees] (reserved, always 0).
 *
 * Additional properties for '3d':
 * @property {{x:number,y:number,z:number}} eye      - Camera position [km].
 * @property {{x:number,y:number,z:number}} target   - Look-at point [km].
 * @property {number}                        fov      - Vertical FOV [degrees].
 * @property {number}                        distance - Eye-to-target distance [km].
 */
export function createViewState(type) {
  const base = {
    type,
    cx: 0,
    cy: 0,
    scale: DEFAULT_ORTHO_SCALE,
    zoom: 1,
    rotation: 0,
  };

  if (type === '3d') {
    base.eye      = { x: 0, y: -DEFAULT_3D_DISTANCE, z: DEFAULT_3D_DISTANCE * 0.5 };
    base.target   = { x: 0, y: 0, z: 0 };
    base.fov      = DEFAULT_3D_FOV;
    base.distance = DEFAULT_3D_DISTANCE;
  }

  return base;
}

// ─── zoomView ─────────────────────────────────────────────────────────────────

/**
 * Zoom a view in or out by a multiplicative factor, keeping the given canvas
 * pixel point visually stationary.
 *
 * A factor > 1 zooms **in** (scale decreases); factor < 1 zooms **out**.
 *
 * For the '3d' pane the `distance` is adjusted instead of `scale`.
 *
 * @param {object} viewState  - Mutable view-state (modified in place).
 * @param {number} factor     - Zoom multiplier (e.g. 1.1 to zoom in 10 %).
 * @param {number} centerPx   - Canvas x-pixel that should stay fixed.
 * @param {number} centerPy   - Canvas y-pixel that should stay fixed.
 * @returns {object} The same `viewState` reference (for chaining).
 */
export function zoomView(viewState, factor, centerPx, centerPy) {
  if (factor <= 0) return viewState;

  if (viewState.type === '3d') {
    viewState.distance = Math.max(1, viewState.distance / factor);
    _update3DEye(viewState);
    viewState.zoom *= factor;
    return viewState;
  }

  const newScale = viewState.scale / factor;

  // Shift cx/cy so the world point under (centerPx, centerPy) stays put.
  viewState.cx = centerPx + (viewState.cx - centerPx) * (viewState.scale / newScale);
  viewState.cy = centerPy + (viewState.cy - centerPy) * (viewState.scale / newScale);
  viewState.scale = newScale;
  viewState.zoom *= factor;

  return viewState;
}

// ─── panView ──────────────────────────────────────────────────────────────────

/**
 * Pan the view by a pixel delta.
 *
 * For orthographic panes the canvas origin is shifted directly.
 * For the '3d' pane the target is shifted in the camera's screen-plane
 * and the eye follows.
 *
 * @param {object} viewState - Mutable view-state (modified in place).
 * @param {number} dxPx      - Horizontal pixel delta (positive = pan right).
 * @param {number} dyPx      - Vertical pixel delta (positive = pan down).
 * @returns {object} The same `viewState` reference (for chaining).
 */
export function panView(viewState, dxPx, dyPx) {
  if (viewState.type === '3d') {
    // Convert pixel delta to km delta in the camera's screen-plane.
    // Factor 0.001 gives a comfortable drag sensitivity: 1 px ≈ 0.1 % of
    // the eye-to-target distance, so a 1000 px drag ≈ full-distance shift.
    const kmPerPx = viewState.distance * 0.001;
    viewState.target.x += dxPx * kmPerPx;
    viewState.target.y += dyPx * kmPerPx;
    _update3DEye(viewState);
    return viewState;
  }

  viewState.cx += dxPx;
  viewState.cy += dyPx;
  return viewState;
}

// ─── fitToObjects ─────────────────────────────────────────────────────────────

/**
 * Auto-fit the view so that all supplied objects are visible with padding.
 *
 * For orthographic panes the bounding box of the projected coordinates is
 * computed and scale/centre are set accordingly.
 *
 * For the '3d' pane the bounding sphere is used to set `distance`.
 *
 * @param {object}                         viewState - Mutable view-state.
 * @param {{x:number,y:number,z:number}[]} objects   - Positions in km.
 * @param {number}                         width     - Canvas width [px].
 * @param {number}                         height    - Canvas height [px].
 * @param {number}                         [padding=0.1] - Fractional margin
 *   (0.1 = 10 % on each side).
 * @returns {object} The same `viewState` reference (for chaining).
 */
export function fitToObjects(viewState, objects, width, height, padding = 0.1) {
  if (!objects || objects.length === 0) return viewState;

  if (viewState.type === '3d') {
    _fitToObjects3D(viewState, objects, padding);
    return viewState;
  }

  // Determine which two coordinates matter for this axis.
  const uv = objects.map(p => _orthoUV(p, viewState.type));

  let uMin =  Infinity, uMax = -Infinity;
  let vMin =  Infinity, vMax = -Infinity;
  for (const { u, v } of uv) {
    if (u < uMin) uMin = u;
    if (u > uMax) uMax = u;
    if (v < vMin) vMin = v;
    if (v > vMax) vMax = v;
  }

  let spanU = uMax - uMin || 1;
  let spanV = vMax - vMin || 1;

  spanU *= (1 + 2 * padding);
  spanV *= (1 + 2 * padding);

  const scaleU = spanU / width;
  const scaleV = spanV / height;
  const scale  = Math.max(scaleU, scaleV);

  const centreU = (uMin + uMax) / 2;
  const centreV = (vMin + vMax) / 2;

  viewState.scale = scale;
  viewState.cx    = width  / 2 - centreU / scale;
  viewState.cy    = height / 2 + centreV / scale;
  viewState.zoom  = DEFAULT_ORTHO_SCALE / scale;

  return viewState;
}

// ─── resetView ────────────────────────────────────────────────────────────────

/**
 * Reset a view-state back to its defaults for the given pane type.
 *
 * Equivalent to re-creating the state but preserves the same object reference.
 *
 * @param {object} viewState - Mutable view-state (modified in place).
 * @returns {object} The same `viewState` reference (for chaining).
 */
export function resetView(viewState) {
  const fresh = createViewState(viewState.type);
  Object.assign(viewState, fresh);
  return viewState;
}

// ─── getViewport ──────────────────────────────────────────────────────────────

/**
 * Derive a viewport descriptor suitable for the projection functions in
 * `projection.js`.
 *
 * For orthographic panes this returns `{cx, cy, scale}`.
 * For the '3d' pane it returns the camera + viewport size expected by
 * `projectPerspective`.
 *
 * @param {object} viewState - Current view-state.
 * @param {number} width     - Canvas width [px].
 * @param {number} height    - Canvas height [px].
 * @returns {{cx:number, cy:number, scale:number}|{eye:object, target:object, fov:number, near:number, far:number, width:number, height:number}}
 */
export function getViewport(viewState, width, height) {
  if (viewState.type === '3d') {
    return {
      eye:    { ...viewState.eye },
      target: { ...viewState.target },
      fov:    viewState.fov,
      near:   viewState.distance * 0.001,
      far:    viewState.distance * 100,
      width,
      height,
    };
  }

  return {
    cx:    viewState.cx || width  / 2,
    cy:    viewState.cy || height / 2,
    scale: viewState.scale,
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Extract the two projected coordinates from a 3-D point for the given
 * orthographic axis. Mirrors the logic in projection.js without creating
 * a module dependency.
 *
 * @param {{x:number,y:number,z:number}} p
 * @param {'top'|'sideA'|'sideB'} axis
 * @returns {{u:number, v:number}}
 * @private
 */
function _orthoUV(p, axis) {
  switch (axis) {
    case 'top':   return { u:  p.x, v:  p.y };
    case 'sideA': return { u:  p.y, v:  p.z };
    case 'sideB': return { u:  p.x, v:  p.z };
    default:      return { u:  p.x, v:  p.y };
  }
}

/**
 * Recompute the 3-D eye position from target + distance, maintaining the
 * current viewing direction.
 *
 * @param {object} viewState - Mutable '3d' view-state.
 * @private
 */
function _update3DEye(viewState) {
  const dx = viewState.eye.x - viewState.target.x;
  const dy = viewState.eye.y - viewState.target.y;
  const dz = viewState.eye.z - viewState.target.z;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
  const s = viewState.distance / len;
  viewState.eye.x = viewState.target.x + dx * s;
  viewState.eye.y = viewState.target.y + dy * s;
  viewState.eye.z = viewState.target.z + dz * s;
}

/**
 * Fit a '3d' view-state to the bounding sphere of the given objects.
 *
 * @param {object}                         viewState
 * @param {{x:number,y:number,z:number}[]} objects
 * @param {number}                         padding
 * @private
 */
function _fitToObjects3D(viewState, objects, padding) {
  // Compute centroid
  let sx = 0, sy = 0, sz = 0;
  for (const p of objects) { sx += p.x; sy += p.y; sz += p.z; }
  const n = objects.length;
  const cx = sx / n, cy = sy / n, cz = sz / n;

  // Bounding-sphere radius from centroid
  let maxR = 0;
  for (const p of objects) {
    const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
    const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (r > maxR) maxR = r;
  }
  maxR = maxR || 1;

  // Distance needed so the sphere fits within the FOV
  const fovRad = (viewState.fov * Math.PI) / 180;
  const dist = (maxR * (1 + padding)) / Math.sin(fovRad / 2);

  viewState.target   = { x: cx, y: cy, z: cz };
  viewState.distance = dist;

  // Place eye along the default viewing direction
  viewState.eye = {
    x: cx,
    y: cy - dist,
    z: cz + dist * 0.5,
  };
}
