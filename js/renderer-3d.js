/**
 * @file renderer-3d.js
 * @module renderer-3d
 * @description Simple pseudo-3D (perspective) renderer for the 4-view
 * engineering visualizer.  Uses a pinhole camera model to produce a wireframe
 * / marker view that can be manually orbited via `viewState.rotation`.
 *
 * All heavy math is delegated to projection.js; this module only drives the
 * Canvas 2-D API.
 */

import { projectPerspective } from './projection.js';
import {
  palette, prepareCanvas, dims,
  drawCircle, drawMarkerDot, drawLine, drawArrowHead,
  drawLabel, drawViewLabel,
  extractSceneObjects, latLonToWorldKm,
} from './renderer-core.js';
import { getViewport } from './camera.js';
import { isLayerVisible } from './layers.js';
import { LAUNCH_SITES, GROUND_STATIONS, TTC_STATIONS } from './infrastructure.js';

/** View name shown in the pane chrome. */
const VIEW_LABEL = '3D View';

/** Pane identifier used for layer visibility lookups. */
const PANE_ID = '3d';

// ─── Rotation helpers ─────────────────────────────────────────────────────────

/**
 * Rotate a 3-D point around the Z axis.
 * @param {{x:number,y:number,z:number}} p
 * @param {number} angle  Radians
 * @returns {{x:number,y:number,z:number}}
 */
function rotZ(p, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: c * p.x - s * p.y, y: s * p.x + c * p.y, z: p.z };
}

/**
 * Rotate a 3-D point around the X axis.
 * @param {{x:number,y:number,z:number}} p
 * @param {number} angle  Radians
 * @returns {{x:number,y:number,z:number}}
 */
function rotX(p, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: p.x, y: c * p.y - s * p.z, z: s * p.y + c * p.z };
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Render the 3-D perspective view onto the given canvas.
 *
 * @param {HTMLCanvasElement} canvas          Target canvas element.
 * @param {object|null}       scenario        CELES-CALC scenario state (v2.0).
 * @param {object}            viewState       Camera / view-state for the 3-D
 *   pane.  Must include `eye`, `target`, `fov`, `distance`, and optionally
 *   `rotation` (degrees, azimuth around Z then elevation around X).
 * @param {import('./layers.js').LayerState} layerState  Layer visibility state.
 * @param {{ selectedId?: string|null, hoveredId?: string|null,
 *           sightlines?: Array<{fromId:string, toId:string}> }} interactionState
 *   UI interaction state (selection, hover, sightline pairs).
 * @returns {{ projectedObjects: Array<{id:string, px:number, py:number}> }}
 *   Projected positions for hit-testing.
 */
export function render3DView(canvas, scenario, viewState, layerState, interactionState) {
  const ctx = prepareCanvas(canvas);
  if (!ctx) return { projectedObjects: [] };

  const { w, h } = dims(canvas);
  const p = palette();

  // 1. Background
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, w, h);

  // 2. Camera setup from viewState
  const vp = getViewport(viewState, w, h);
  const camera = {
    eye:    vp.eye,
    target: vp.target,
    fov:    vp.fov,
    near:   vp.near,
    far:    vp.far,
  };
  const vpSize = { width: w, height: h };

  // 3. Extract scene objects
  const sceneObjects = extractSceneObjects(scenario);

  if (sceneObjects.length === 0) {
    _drawPlaceholder(ctx, w, h, p);
    _drawAxesGizmo(ctx, w, h, p, viewState);
    drawViewLabel(ctx, VIEW_LABEL, w, h);
    return { projectedObjects: [] };
  }

  // 4. Project all objects with perspective
  /** @type {Array<object & {px:number, py:number, depth:number}>} */
  const projected = [];
  for (const obj of sceneObjects) {
    const result = projectPerspective(
      { x: obj.x, y: obj.y, z: obj.z }, camera, vpSize,
    );
    if (!result) continue;
    projected.push({ ...obj, px: result.px, py: result.py, depth: result.depth });
  }

  // Sort far-to-near so nearer objects paint on top
  projected.sort((a, b) => b.depth - a.depth);

  const byId = Object.create(null);
  for (const po of projected) byId[po.id] = po;

  // 5. Earth body
  if (isLayerVisible(layerState, 'earthBody', PANE_ID)) {
    const earth = byId['earth'];
    if (earth && earth.radius_km) {
      const rPx = _perspectiveRadius(earth.radius_km, earth.depth, camera.fov, h);
      drawCircle(ctx, earth.px, earth.py, rPx, p.earthFill, p.earthStroke, 1.5);
    }
  }

  // 6. Moon body
  if (isLayerVisible(layerState, 'moonBody', PANE_ID)) {
    const moon = byId['moon'];
    if (moon && moon.radius_km) {
      const rPx = _perspectiveRadius(moon.radius_km, moon.depth, camera.fov, h);
      drawCircle(ctx, moon.px, moon.py, Math.max(rPx, 3), p.moonFill, p.moonStroke, 1.5);
    }
  }

  // 7. Orbit arcs (as projected line segments)
  if (isLayerVisible(layerState, 'orbits', PANE_ID)) {
    for (const obj of sceneObjects) {
      if (!obj.orbitPoints) continue;
      _drawOrbitPath3D(ctx, obj.orbitPoints, camera, vpSize, p.orbitArc);
    }
  }

  // 8. Sightlines
  const { selectedId = null, hoveredId = null, sightlines = [] } = interactionState || {};
  if (isLayerVisible(layerState, 'sightlines', PANE_ID)) {
    for (const sl of sightlines) {
      const from = byId[sl.fromId];
      const to = byId[sl.toId];
      if (from && to) {
        drawLine(ctx, from.px, from.py, to.px, to.py, p.sightLine, true);
      }
    }
  }

  // 9a. RF link lines (drawn before markers so markers paint on top)
  if (isLayerVisible(layerState, 'rfLinks', PANE_ID)) {
    for (const obj of projected) {
      if (obj.type !== 'link') continue;
      const endPt = projectPerspective(
        { x: obj.endX, y: obj.endY, z: obj.endZ }, camera, vpSize,
      );
      if (endPt) {
        drawLine(ctx, obj.px, obj.py, endPt.px, endPt.py, obj.color, false, 2);
      }
    }
  }

  // 9b. Markers (depth-sorted — farther first, already sorted)
  const showLabels = isLayerVisible(layerState, 'labels', PANE_ID);
  for (const obj of projected) {
    if (obj.type === 'earth' || obj.type === 'moon' || obj.type === 'link') continue;
    if (obj.type === 'observer'       && !isLayerVisible(layerState, 'observers', PANE_ID)) continue;
    if (obj.type === 'target'         && !isLayerVisible(layerState, 'targets', PANE_ID)) continue;
    if (obj.type === 'satellite'      && !isLayerVisible(layerState, 'trackedObjects', PANE_ID)) continue;
    if (obj.type === 'ground_station' && !isLayerVisible(layerState, 'groundStations', PANE_ID)) continue;
    if (obj.type === 'launch_site'    && !isLayerVisible(layerState, 'launchSites', PANE_ID)) continue;
    if (obj.type === 'transfer_arc')  continue;

    const isSel = obj.id === selectedId;
    const isHov = obj.id === hoveredId;
    const size = obj.type === 'ground_station' ? 7 : 5;
    drawMarkerDot(ctx, obj.px, obj.py, obj.color, size,
      showLabels ? obj.label : undefined, isSel, isHov);
  }

  // 9c. Infrastructure overlays (static seed data — perspective projection)
  const earthObj = byId['earth'];
  const selectedStationId = scenario?.infrastructure?.selectedStation?.infraId ?? null;
  const selectedLaunchSiteId = scenario?.infrastructure?.selectedLaunchSite?.id ?? null;
  if (earthObj) {
    if (isLayerVisible(layerState, 'infraLaunchSites', PANE_ID)) {
      _drawInfraMarkers3D(ctx, LAUNCH_SITES, camera, vpSize, '#ff5722', 4, showLabels, selectedLaunchSiteId);
    }
    if (isLayerVisible(layerState, 'infraGroundStations', PANE_ID)) {
      _drawInfraMarkers3D(ctx, GROUND_STATIONS, camera, vpSize, '#2196f3', 5, showLabels, selectedStationId);
    }
    if (isLayerVisible(layerState, 'infraTTCStations', PANE_ID)) {
      _drawInfraMarkers3D(ctx, TTC_STATIONS, camera, vpSize, '#9c27b0', 5, showLabels, selectedStationId);
    }
  }

  // 10. Chrome: axes gizmo + view label
  _drawAxesGizmo(ctx, w, h, p, viewState);
  drawViewLabel(ctx, VIEW_LABEL, w, h);

  // 11. Return projected positions
  return {
    projectedObjects: projected.map(o => ({ id: o.id, px: o.px, py: o.py })),
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Approximate screen-space radius for a sphere at a given depth.
 *
 * @param {number} radiusKm  World radius in km.
 * @param {number} depth     Camera-space depth (km).
 * @param {number} fov       Vertical FOV (degrees).
 * @param {number} height    Canvas height (px).
 * @returns {number} Radius in pixels.
 * @private
 */
function _perspectiveRadius(radiusKm, depth, fov, height) {
  if (depth <= 0) return 0;
  const fovRad = fov * (Math.PI / 180);
  const focalLen = (height / 2) / Math.tan(fovRad / 2);
  return (radiusKm / depth) * focalLen;
}

/**
 * Draw connected line segments for an orbit path using perspective projection.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{x:number,y:number,z:number}>} orbitPoints
 * @param {object} camera
 * @param {{width:number,height:number}} vpSize
 * @param {string} color
 * @private
 */
function _drawOrbitPath3D(ctx, orbitPoints, camera, vpSize, color) {
  if (!orbitPoints || orbitPoints.length < 2) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();

  let started = false;
  for (let i = 0; i < orbitPoints.length; i++) {
    const pt = projectPerspective(orbitPoints[i], camera, vpSize);
    if (!pt) {
      started = false;
      continue;
    }
    if (!started) {
      ctx.moveTo(pt.px, pt.py);
      started = true;
    } else {
      ctx.lineTo(pt.px, pt.py);
    }
  }

  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/**
 * Draw a small RGB axes gizmo in the bottom-left corner to indicate
 * orientation (X = red, Y = green, Z = blue).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w  Canvas width.
 * @param {number} h  Canvas height.
 * @param {object} p  Palette.
 * @param {object} viewState
 * @private
 */
function _drawAxesGizmo(ctx, w, h, p, viewState) {
  const cx = 40;
  const cy = h - 40;
  const len = 28;

  // Build rotation angles from camera direction
  const eye = viewState.eye || { x: 0, y: -1, z: 0.5 };
  const tgt = viewState.target || { x: 0, y: 0, z: 0 };
  const dx = eye.x - tgt.x;
  const dy = eye.y - tgt.y;
  const dz = eye.z - tgt.z;
  const azimuth = Math.atan2(dx, -dy);
  const dist2D = Math.sqrt(dx * dx + dy * dy);
  const elevation = Math.atan2(dz, dist2D);

  const axes = [
    { label: 'X', color: '#e06c75', dir: { x: 1, y: 0, z: 0 } },
    { label: 'Y', color: '#98c379', dir: { x: 0, y: 1, z: 0 } },
    { label: 'Z', color: '#61afef', dir: { x: 0, y: 0, z: 1 } },
  ];

  ctx.save();
  for (const ax of axes) {
    let d = ax.dir;
    d = rotZ(d, -azimuth);
    d = rotX(d, elevation - Math.PI / 2);

    const ex = cx + d.x * len;
    const ey = cy - d.z * len;

    drawLine(ctx, cx, cy, ex, ey, ax.color, false, 2);
    drawArrowHead(ctx, cx, cy, ex, ey, ax.color, 6);
    drawLabel(ctx, ax.label, ex + (d.x > 0 ? 4 : -10), ey + (d.z > 0 ? -6 : 10),
      ax.color, 'center', 10);
  }
  ctx.restore();
}

/**
 * Draw infrastructure site markers using perspective projection.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{lat_deg:number,lon_deg:number,name?:string}>} records
 * @param {object} camera  Perspective camera object.
 * @param {{width:number,height:number}} vpSize
 * @param {string} color  Fill color.
 * @param {number} size   Dot radius in pixels.
 * @param {boolean} showLabels  Whether to render name labels.
 * @private
 */
function _drawInfraMarkers3D(ctx, records, camera, vpSize, color, size, showLabels, selectedId = null) {
  for (const rec of (Array.isArray(records) ? records : [])) {
    const lat = Number(rec?.lat_deg);
    const lon = Number(rec?.lon_deg);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
    const pos = latLonToWorldKm(lat, lon);
    const result = projectPerspective(pos, camera, vpSize);
    if (!result) continue;
    const isSelected = selectedId != null && rec?.id === selectedId;
    const label = (showLabels || isSelected) ? rec?.name : undefined;
    drawMarkerDot(ctx, result.px, result.py, color, size, label, isSelected, false);
  }
}

/**
 * Draw placeholder text when no scenario data is available.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 * @param {object} p
 * @private
 */
function _drawPlaceholder(ctx, w, h, p) {
  ctx.fillStyle = p.textDim;
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('No scenario loaded', w / 2, h / 2);
}
