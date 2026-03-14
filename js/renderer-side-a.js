/**
 * @file renderer-side-a.js
 * @module renderer-side-a
 * @description Side-A view (orthographic, X-down) renderer for the 4-view
 * engineering visualizer.  Shows the Y-Z plane — a side view looking from the
 * +X direction.
 */

import { projectOrthographic } from './projection.js';
import {
  palette, prepareCanvas, dims,
  drawCircle, drawMarkerDot, drawLine,
  drawLabel, drawGrid, drawScaleBar, drawAxisLabel, drawViewLabel,
  extractSceneObjects,
} from './renderer-core.js';
import { getViewport } from './camera.js';
import { isLayerVisible } from './layers.js';
import { LAUNCH_SITES, GROUND_STATIONS, TTC_STATIONS } from './infrastructure.js';

/** Earth mean radius in km (matching renderer-core convention). */
const R_EARTH_KM = 6371;

/** @type {'sideA'} */
const AXIS = 'sideA';

/** View name shown in the pane chrome. */
const VIEW_LABEL = 'Side A (Y-Z)';

/**
 * Render the Side-A view (Y-Z plane, looking from +X) onto the given canvas.
 *
 * @param {HTMLCanvasElement} canvas          Target canvas element.
 * @param {object|null}       scenario        CELES-CALC scenario state (v2.0).
 * @param {object}            viewState       Camera / view-state for this pane.
 * @param {import('./layers.js').LayerState} layerState  Layer visibility state.
 * @param {{ selectedId?: string|null, hoveredId?: string|null,
 *           sightlines?: Array<{fromId:string, toId:string}> }} interactionState
 *   UI interaction state (selection, hover, sightline pairs).
 * @returns {{ projectedObjects: Array<{id:string, px:number, py:number}> }}
 *   Projected positions for hit-testing.
 */
export function renderSideAView(canvas, scenario, viewState, layerState, interactionState) {
  const ctx = prepareCanvas(canvas);
  if (!ctx) return { projectedObjects: [] };

  const { w, h } = dims(canvas);
  const p = palette();

  // 1. Background
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, w, h);

  // 2. Viewport
  const viewport = getViewport(viewState, w, h);

  // 3. Grid
  if (isLayerVisible(layerState, 'grid', AXIS)) {
    drawGrid(ctx, viewport, w, h, AXIS);
  }

  // 4. Extract scene objects
  const sceneObjects = extractSceneObjects(scenario);

  if (sceneObjects.length === 0) {
    _drawPlaceholder(ctx, w, h, p);
    drawViewLabel(ctx, VIEW_LABEL, w, h);
    return { projectedObjects: [] };
  }

  // 5. Project all objects
  const projected = sceneObjects.map(obj => ({
    ...obj,
    ...projectOrthographic({ x: obj.x, y: obj.y, z: obj.z }, AXIS, viewport),
  }));

  const byId = Object.create(null);
  for (const po of projected) byId[po.id] = po;

  // 6. Earth body
  if (isLayerVisible(layerState, 'earthBody', AXIS)) {
    const earth = byId['earth'];
    if (earth && earth.radius_km) {
      const rPx = earth.radius_km / viewport.scale;
      drawCircle(ctx, earth.px, earth.py, rPx, p.earthFill, p.earthStroke, 1.5);
    }
  }

  // 7. Moon body
  if (isLayerVisible(layerState, 'moonBody', AXIS)) {
    const moon = byId['moon'];
    if (moon && moon.radius_km) {
      const rPx = moon.radius_km / viewport.scale;
      drawCircle(ctx, moon.px, moon.py, Math.max(rPx, 3), p.moonFill, p.moonStroke, 1.5);
    }
  }

  // 8. Orbit arcs
  if (isLayerVisible(layerState, 'orbits', AXIS)) {
    for (const obj of projected) {
      if (!obj.orbitPoints) continue;
      _drawOrbitPath(ctx, obj.orbitPoints, viewport, p.orbitArc);
    }
  }

  // 9. Sightlines
  const { selectedId = null, hoveredId = null, sightlines = [] } = interactionState || {};
  if (isLayerVisible(layerState, 'sightlines', AXIS)) {
    for (const sl of sightlines) {
      const from = byId[sl.fromId];
      const to = byId[sl.toId];
      if (from && to) {
        drawLine(ctx, from.px, from.py, to.px, to.py, p.sightLine, true);
      }
    }
  }

  // 10a. RF link lines
  if (isLayerVisible(layerState, 'rfLinks', AXIS)) {
    for (const obj of projected) {
      if (obj.type !== 'link') continue;
      const end = projectOrthographic({ x: obj.endX, y: obj.endY, z: obj.endZ }, AXIS, viewport);
      drawLine(ctx, obj.px, obj.py, end.px, end.py, obj.color, false, 2);
    }
  }

  // 10b. Markers
  const showLabels = isLayerVisible(layerState, 'labels', AXIS);
  for (const obj of projected) {
    if (obj.type === 'earth' || obj.type === 'moon' || obj.type === 'link') continue;
    if (obj.type === 'observer'       && !isLayerVisible(layerState, 'observers', AXIS)) continue;
    if (obj.type === 'target'         && !isLayerVisible(layerState, 'targets', AXIS)) continue;
    if (obj.type === 'satellite'      && !isLayerVisible(layerState, 'trackedObjects', AXIS)) continue;
    if (obj.type === 'ground_station' && !isLayerVisible(layerState, 'groundStations', AXIS)) continue;
    if (obj.type === 'launch_site'    && !isLayerVisible(layerState, 'launchSites', AXIS)) continue;
    if (obj.type === 'transfer_arc')  continue;

    const isSel = obj.id === selectedId;
    const isHov = obj.id === hoveredId;
    const size = obj.type === 'ground_station' ? 7 : 5;
    drawMarkerDot(ctx, obj.px, obj.py, obj.color, size,
      showLabels ? obj.label : undefined, isSel, isHov);
  }

  // 10c. Infrastructure overlays (static seed data)
  const earthObj = byId['earth'];
  if (earthObj) {
    if (isLayerVisible(layerState, 'infraLaunchSites', AXIS)) {
      _drawInfraMarkers(ctx, LAUNCH_SITES, viewport, '#ff5722', 4, showLabels, AXIS);
    }
    if (isLayerVisible(layerState, 'infraGroundStations', AXIS)) {
      _drawInfraMarkers(ctx, GROUND_STATIONS, viewport, '#2196f3', 5, showLabels, AXIS);
    }
    if (isLayerVisible(layerState, 'infraTTCStations', AXIS)) {
      _drawInfraMarkers(ctx, TTC_STATIONS, viewport, '#9c27b0', 5, showLabels, AXIS);
    }
  }

  // 11. Chrome
  drawAxisLabel(ctx, w, h, AXIS);
  drawViewLabel(ctx, VIEW_LABEL, w, h);
  drawScaleBar(ctx, viewport, w, h);

  // 12. Projected positions
  return {
    projectedObjects: projected.map(o => ({ id: o.id, px: o.px, py: o.py })),
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Draw connected line segments for an orbit path projected onto this axis.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{x:number,y:number,z:number}>} orbitPoints
 * @param {{cx:number,cy:number,scale:number}} viewport
 * @param {string} color
 * @private
 */
function _drawOrbitPath(ctx, orbitPoints, viewport, color) {
  if (!orbitPoints || orbitPoints.length < 2) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();

  const first = projectOrthographic(orbitPoints[0], AXIS, viewport);
  ctx.moveTo(first.px, first.py);

  for (let i = 1; i < orbitPoints.length; i++) {
    const pt = projectOrthographic(orbitPoints[i], AXIS, viewport);
    ctx.lineTo(pt.px, pt.py);
  }

  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/**
 * Draw infrastructure site markers from a static array of infrastructure records.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{lat_deg:number,lon_deg:number,name?:string,status?:string}>} records
 * @param {{cx:number,cy:number,scale:number}} viewport
 * @param {string} color  Fill color.
 * @param {number} size   Dot radius in pixels.
 * @param {boolean} showLabels  Whether to render name labels.
 * @param {string} axis   Projection axis.
 * @private
 */
function _drawInfraMarkers(ctx, records, viewport, color, size, showLabels, axis) {
  for (const rec of records) {
    if (rec.lat_deg == null || rec.lon_deg == null) continue;
    const lat = rec.lat_deg * Math.PI / 180;
    const lon = rec.lon_deg * Math.PI / 180;
    const pos = {
      x: R_EARTH_KM * Math.cos(lat) * Math.cos(lon),
      y: R_EARTH_KM * Math.cos(lat) * Math.sin(lon),
      z: R_EARTH_KM * Math.sin(lat),
    };
    const { px, py } = projectOrthographic(pos, axis, viewport);
    const label = showLabels ? rec.name : undefined;
    drawMarkerDot(ctx, px, py, color, size, label, false, false);
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
