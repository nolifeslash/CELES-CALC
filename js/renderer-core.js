/**
 * @file renderer-core.js
 * @module renderer-core
 * @description Shared rendering utilities used by all four view-pane renderers
 * (top, sideA, sideB, perspective).  Built on the Canvas 2-D API and follows
 * the same palette / style conventions established in visuals.js.
 */

import { R_EARTH_MEAN, R_MOON, AU } from './constants.js';

/* ================================================================
   Colour palette (respects dark / light theme via <html data-theme>)
   ================================================================ */

/**
 * Return the current colour palette.  The result depends on the
 * `data-theme` attribute of `<html>`.
 *
 * @returns {{
 *   bg: string, landFill: string, landStroke: string, waterFill: string,
 *   gridLine: string, gridLabel: string,
 *   markerObs: string, markerTgt: string, markerSat: string,
 *   markerMoon: string, markerSun: string,
 *   arrowColor: string, sightLine: string, orbitArc: string,
 *   textMain: string, textDim: string,
 *   earthFill: string, earthStroke: string,
 *   moonFill: string, moonStroke: string
 * }}
 */
export function palette() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    bg:          dark ? '#000a18'   : '#cde4f5',
    landFill:    dark ? '#1a2a1a'   : '#b5c99a',
    landStroke:  dark ? '#2e4d2e'   : '#7a9a5a',
    waterFill:   dark ? '#000a18'   : '#8bbcdb',
    gridLine:    dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,80,0.15)',
    gridLabel:   dark ? '#6e7681'   : '#4466aa',
    markerObs:   '#3fb950',
    markerTgt:   '#f85149',
    markerSat:   '#388bfd',
    markerMoon:  '#d8d8d8',
    markerSun:   '#ffd700',
    arrowColor:  '#e06c75',
    sightLine:   'rgba(56,139,253,0.7)',
    orbitArc:    dark ? '#58a6ff'   : '#0969da',
    textMain:    dark ? '#e6edf3'   : '#1f2328',
    textDim:     dark ? '#8b949e'   : '#656d76',
    earthFill:   dark ? '#1a3a5c'   : '#4a9af5',
    earthStroke: dark ? '#2a6aa8'   : '#2060a0',
    moonFill:    dark ? '#2c2c2c'   : '#c8c0b0',
    moonStroke:  dark ? '#4a4a4a'   : '#888070',
    markerStation:   '#ff9800',
    markerLaunchSite:'#ff5722',
    linkGood:        '#3fb950',
    linkWarn:        '#ffd700',
    linkBad:         '#f85149',
    transferArc:     '#e040fb',
  };
}

/* ================================================================
   Canvas helpers
   ================================================================ */

/**
 * Resize a canvas to its CSS display size (HiDPI-aware) and return
 * its 2-D rendering context.
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {CanvasRenderingContext2D|null}
 */
export function prepareCanvas(canvas) {
  if (!canvas) return null;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth  || canvas.width  || 800;
  const h = canvas.clientHeight || canvas.height || 500;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width  = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/**
 * Return the physical dimensions of a canvas in CSS pixels.
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {{ w: number, h: number }}
 */
export function dims(canvas) {
  return {
    w: canvas.clientWidth  || canvas.width  || 800,
    h: canvas.clientHeight || canvas.height || 500,
  };
}

/* ================================================================
   Primitive drawing functions
   ================================================================ */

/**
 * Draw a filled and/or stroked circle.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx          Centre X (px)
 * @param {number} cy          Centre Y (px)
 * @param {number} radius      Radius (px)
 * @param {string} fillColor   CSS colour for fill (use `null` to skip)
 * @param {string} strokeColor CSS colour for stroke (use `null` to skip)
 * @param {number} [lineWidth=1]
 */
export function drawCircle(ctx, cx, cy, radius, fillColor, strokeColor, lineWidth = 1) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  if (fillColor) {
    ctx.fillStyle = fillColor;
    ctx.fill();
  }
  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draw an object marker dot with optional highlight rings for
 * selection and hover states, plus an optional text label.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number}  px         Centre X (px)
 * @param {number}  py         Centre Y (px)
 * @param {string}  color      CSS colour
 * @param {number}  [size=5]   Dot radius (px)
 * @param {string}  [label]    Text drawn to the right of the dot
 * @param {boolean} [isSelected=false]
 * @param {boolean} [isHovered=false]
 */
export function drawMarkerDot(ctx, px, py, color, size = 5, label, isSelected = false, isHovered = false) {
  const p = palette();
  ctx.save();

  // Hover glow ring
  if (isHovered) {
    ctx.beginPath();
    ctx.arc(px, py, size + 6, 0, Math.PI * 2);
    ctx.fillStyle = _withAlpha(color, 0.18);
    ctx.fill();
  }

  // Selection ring
  if (isSelected) {
    ctx.beginPath();
    ctx.arc(px, py, size + 3, 0, Math.PI * 2);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Main dot
  ctx.beginPath();
  ctx.arc(px, py, size, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Label
  if (label) {
    ctx.fillStyle = p.textMain;
    ctx.font = 'bold 11px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(label, px + size + 4, py);
  }

  ctx.restore();
}

/**
 * Draw an orbit ellipse (optionally dashed).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} centerPx     Centre X of ellipse (px)
 * @param {number} centerPy     Centre Y of ellipse (px)
 * @param {number} semiMajorPx  Semi-major axis in pixels
 * @param {number} semiMinorPx  Semi-minor axis in pixels
 * @param {number} rotation     Rotation angle (radians, CCW from +X)
 * @param {string} color        CSS colour
 * @param {boolean} [dashed=false]
 */
export function drawOrbitEllipse(ctx, centerPx, centerPy, semiMajorPx, semiMinorPx, rotation, color, dashed = false) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  if (dashed) ctx.setLineDash([8, 5]);
  ctx.beginPath();
  ctx.ellipse(centerPx, centerPy, semiMajorPx, semiMinorPx, rotation, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/**
 * Draw a straight line (optionally dashed).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @param {string} color      CSS colour
 * @param {boolean} [dashed=false]
 * @param {number}  [lineWidth=1.5]
 */
export function drawLine(ctx, x1, y1, x2, y2, color, dashed = false, lineWidth = 1.5) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  if (dashed) ctx.setLineDash([8, 5]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/**
 * Draw a filled arrowhead at the end-point of a line.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x1     Line start X
 * @param {number} y1     Line start Y
 * @param {number} x2     Line end X (arrowhead tip)
 * @param {number} y2     Line end Y (arrowhead tip)
 * @param {string} color  CSS colour
 * @param {number} [size=10]  Arrow size in pixels
 */
export function drawArrowHead(ctx, x1, y1, x2, y2, color, size = 10) {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - size * Math.cos(ang - 0.4), y2 - size * Math.sin(ang - 0.4));
  ctx.lineTo(x2 - size * Math.cos(ang + 0.4), y2 - size * Math.sin(ang + 0.4));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Draw a text label at the given position.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} px        X position (px)
 * @param {number} py        Y position (px)
 * @param {string} [color]   CSS colour (defaults to palette textMain)
 * @param {string} [align='left']  CanvasTextAlign value
 * @param {number} [fontSize=11]   Font size in px
 */
export function drawLabel(ctx, text, px, py, color, align = 'left', fontSize = 11) {
  const p = palette();
  ctx.save();
  ctx.fillStyle = color || p.textMain;
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, px, py);
  ctx.restore();
}

/* ================================================================
   View-pane chrome helpers
   ================================================================ */

/**
 * Draw a coordinate grid appropriate for the given axis orientation.
 *
 * - `'top'`   → X (horizontal) / Y (vertical) grid, labels in km
 * - `'sideA'` → Y (horizontal) / Z (vertical) grid
 * - `'sideB'` → X (horizontal) / Z (vertical) grid
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ cx: number, cy: number, scale: number }} viewport
 *   Centre of the viewport in world-km and the current scale (px per km).
 * @param {number} width   Canvas CSS width
 * @param {number} height  Canvas CSS height
 * @param {'top'|'sideA'|'sideB'} axis
 */
export function drawGrid(ctx, viewport, width, height, axis) {
  const p = palette();
  ctx.save();
  ctx.strokeStyle = p.gridLine;
  ctx.lineWidth = 0.5;
  ctx.fillStyle = p.gridLabel;
  ctx.font = '10px sans-serif';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  const scale = viewport.scale || 1;
  const spacing = _niceGridSpacing(width / scale);

  const axisLabels = _axisLetters(axis);
  const hLabel = axisLabels.h;
  const vLabel = axisLabels.v;

  // World-space bounds visible in the viewport
  const worldLeft   = viewport.cx - (width  / 2) / scale;
  const worldRight  = viewport.cx + (width  / 2) / scale;
  const worldTop    = viewport.cy - (height / 2) / scale;
  const worldBottom = viewport.cy + (height / 2) / scale;

  const firstH = Math.floor(worldLeft  / spacing) * spacing;
  const firstV = Math.floor(worldTop   / spacing) * spacing;

  // Vertical grid lines (horizontal axis)
  for (let w = firstH; w <= worldRight; w += spacing) {
    const px = (w - viewport.cx) * scale + width / 2;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, height);
    ctx.stroke();
    const txt = _formatKm(w);
    ctx.fillText(`${hLabel}${txt}`, px + 2, 2);
  }

  // Horizontal grid lines (vertical axis)
  for (let v = firstV; v <= worldBottom; v += spacing) {
    const py = (v - viewport.cy) * scale + height / 2;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(width, py);
    ctx.stroke();
    const txt = _formatKm(v);
    ctx.fillText(`${vLabel}${txt}`, 2, py + 2);
  }

  ctx.restore();
}

/**
 * Draw a scale bar in the bottom-right corner.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ cx: number, cy: number, scale: number }} viewport
 * @param {number} width   Canvas CSS width
 * @param {number} height  Canvas CSS height
 */
export function drawScaleBar(ctx, viewport, width, height) {
  const p = palette();
  const scale = viewport.scale || 1;

  // Choose a nice round distance that maps to roughly 80-150 px
  const targetPx = 100;
  const targetKm = targetPx / scale;
  const nice = _niceRound(targetKm);
  const barPx = nice * scale;

  const margin = 12;
  const x0 = width  - margin - barPx;
  const y0 = height - margin;

  ctx.save();
  ctx.strokeStyle = p.textDim;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x0 + barPx, y0);
  ctx.stroke();

  // End ticks
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, y0 - 4);
  ctx.lineTo(x0, y0 + 4);
  ctx.moveTo(x0 + barPx, y0 - 4);
  ctx.lineTo(x0 + barPx, y0 + 4);
  ctx.stroke();

  // Label
  ctx.fillStyle = p.textDim;
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(_formatKm(nice), x0 + barPx / 2, y0 - 4);

  ctx.restore();
}

/**
 * Draw axis-direction labels in the bottom-left corner
 * (e.g. "X →", "Y ↑").
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width   Canvas CSS width
 * @param {number} height  Canvas CSS height
 * @param {'top'|'sideA'|'sideB'} axis
 */
export function drawAxisLabel(ctx, width, height, axis) {
  const p = palette();
  const labels = _axisLetters(axis);

  ctx.save();
  ctx.font = 'bold 11px sans-serif';
  ctx.fillStyle = p.textDim;
  ctx.textBaseline = 'bottom';
  ctx.textAlign = 'left';
  ctx.fillText(`${labels.h} →`, 8, height - 18);
  ctx.fillText(`${labels.v} ↑`, 8, height - 4);
  ctx.restore();
}

/**
 * Draw the view name label in the top-left corner
 * (e.g. "Top View", "Side A (Y-Z)").
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} width   Canvas CSS width
 * @param {number} height  Canvas CSS height
 */
export function drawViewLabel(ctx, text, width, height) {
  ctx.save();
  ctx.font = 'bold 11px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(text, 6, 4);
  ctx.restore();
}

/* ================================================================
   Scene extraction
   ================================================================ */

/**
 * @typedef {object} SceneObject
 * @property {string}  id           Unique identifier
 * @property {'earth'|'moon'|'observer'|'target'|'satellite'|'sun'} type
 * @property {string}  label        Display name
 * @property {number}  x            ECI-like X coordinate (km)
 * @property {number}  y            ECI-like Y coordinate (km)
 * @property {number}  z            ECI-like Z coordinate (km)
 * @property {number|null}  radius_km   Body radius in km, or null
 * @property {string}  color        CSS colour
 * @property {Array<{x:number, y:number, z:number}>|null} orbitPoints
 *           Sampled points along the orbit arc (km), or null
 */

/**
 * Extract all renderable objects from a scenario into a normalised array.
 *
 * Produces entries for:
 * - **Earth** at the origin
 * - **Moon** from `scenario.bodies.moon`
 * - **Sun** direction (placed at a display distance)
 * - Each **observer** that carries ECI coordinates
 * - Each **target** that carries ECI coordinates
 * - Each **tracked object** (satellite) from `scenario.trackedObjectResults`
 *
 * All positions are returned in **kilometres** in an ECI-like frame.
 *
 * @param {object} scenario  CELES-CALC scenario state (v2.0)
 * @returns {SceneObject[]}
 */
export function extractSceneObjects(scenario) {
  if (!scenario) return [];

  const p = palette();
  /** @type {SceneObject[]} */
  const objects = [];

  // ── Earth (always at origin) ────────────────────────────────────────────
  objects.push({
    id:          'earth',
    type:        'earth',
    label:       'Earth',
    x:           0,
    y:           0,
    z:           0,
    radius_km:   R_EARTH_MEAN / 1000,
    color:       p.earthFill,
    orbitPoints: null,
  });

  // ── Moon ────────────────────────────────────────────────────────────────
  const moon = scenario.bodies?.moon;
  if (moon?.positionECI) {
    const pos = moon.positionECI; // metres
    objects.push({
      id:          'moon',
      type:        'moon',
      label:       'Moon',
      x:           pos.x / 1000,
      y:           pos.y / 1000,
      z:           pos.z / 1000,
      radius_km:   R_MOON / 1000,
      color:       p.markerMoon,
      orbitPoints: null,
    });
  }

  // ── Sun (direction vector, placed at a display distance) ────────────────
  const sun = scenario.bodies?.sun;
  if (sun?.directionECI) {
    const dir = sun.directionECI;
    // Place the sun marker at 1.2 × Moon distance (or 400 000 km fallback)
    const displayDist = moon?.distance_km ? moon.distance_km * 1.2 : 400_000;
    const norm = Math.sqrt(dir[0] ** 2 + dir[1] ** 2 + dir[2] ** 2) || 1;
    objects.push({
      id:          'sun',
      type:        'sun',
      label:       'Sun ☉',
      x:           (dir[0] / norm) * displayDist,
      y:           (dir[1] / norm) * displayDist,
      z:           (dir[2] / norm) * displayDist,
      radius_km:   null,
      color:       p.markerSun,
      orbitPoints: null,
    });
  }

  // ── Observers ───────────────────────────────────────────────────────────
  if (Array.isArray(scenario.observers)) {
    scenario.observers.forEach((obs, i) => {
      if (obs.x_eci == null || obs.y_eci == null || obs.z_eci == null) return;
      objects.push({
        id:          `obs-${i}`,
        type:        'observer',
        label:       obs.label || obs.name || `Obs ${i + 1}`,
        x:           obs.x_eci / 1000,
        y:           obs.y_eci / 1000,
        z:           obs.z_eci / 1000,
        radius_km:   null,
        color:       p.markerObs,
        orbitPoints: null,
      });
    });
  }

  // ── Targets ─────────────────────────────────────────────────────────────
  if (Array.isArray(scenario.targets)) {
    scenario.targets.forEach((tgt, i) => {
      if (tgt.x_eci == null || tgt.y_eci == null || tgt.z_eci == null) return;
      objects.push({
        id:          `tgt-${i}`,
        type:        'target',
        label:       tgt.label || tgt.name || `Tgt ${i + 1}`,
        x:           tgt.x_eci / 1000,
        y:           tgt.y_eci / 1000,
        z:           tgt.z_eci / 1000,
        radius_km:   null,
        color:       p.markerTgt,
        orbitPoints: null,
      });
    });
  }

  // ── Tracked objects (satellites) ────────────────────────────────────────
  if (Array.isArray(scenario.trackedObjectResults)) {
    scenario.trackedObjectResults.forEach((sat, i) => {
      if (sat.x_eci == null || sat.y_eci == null || sat.z_eci == null) return;

      // Build orbit sample points from Keplerian elements if available
      let orbitPoints = null;
      if (sat.a && sat.e != null) {
        orbitPoints = _sampleKeplerianOrbit(sat);
      }

      objects.push({
        id:          `sat-${sat.satNumber ?? i}`,
        type:        'satellite',
        label:       sat.label || sat.name || `Sat ${sat.satNumber ?? i + 1}`,
        x:           sat.x_eci / 1000,
        y:           sat.y_eci / 1000,
        z:           sat.z_eci / 1000,
        radius_km:   null,
        color:       p.markerSat,
        orbitPoints,
      });
    });
  }

  // ── Ground stations ──────────────────────────────────────────────
  if (Array.isArray(scenario.groundStationRecommendations)) {
    scenario.groundStationRecommendations.forEach((gs, i) => {
      if (gs.lat_deg == null || gs.lon_deg == null) return;
      // Convert lat/lon to approximate ECI position (on Earth surface)
      const R = R_EARTH_MEAN;
      const lat = gs.lat_deg * Math.PI / 180;
      const lon = gs.lon_deg * Math.PI / 180;
      objects.push({
        id:        `gs-${gs.id || i}`,
        type:      'ground_station',
        label:     gs.name || gs.label || `Station ${i + 1}`,
        x:         (R * Math.cos(lat) * Math.cos(lon)) / 1000,
        y:         (R * Math.cos(lat) * Math.sin(lon)) / 1000,
        z:         (R * Math.sin(lat)) / 1000,
        radius_km: null,
        color:     '#ff9800',
        orbitPoints: null,
        score:     gs.score,
      });
    });
  }

  // ── RF Links ─────────────────────────────────────────────────────
  if (Array.isArray(scenario.links)) {
    scenario.links.forEach((link, i) => {
      if (!link.from || !link.to) return;
      objects.push({
        id:        `link-${i}`,
        type:      'link',
        label:     link.label || `Link ${i + 1}`,
        x:         (link.from.x || 0) / 1000,
        y:         (link.from.y || 0) / 1000,
        z:         (link.from.z || 0) / 1000,
        endX:      (link.to.x || 0) / 1000,
        endY:      (link.to.y || 0) / 1000,
        endZ:      (link.to.z || 0) / 1000,
        radius_km: null,
        color:     link.margin_dB > 3 ? '#3fb950' : link.margin_dB > 0 ? '#ffd700' : '#f85149',
        orbitPoints: null,
        margin_dB: link.margin_dB,
      });
    });
  }

  // ── Launch sites ─────────────────────────────────────────────────
  if (scenario.launchScenario?.site) {
    const site = scenario.launchScenario.site;
    if (site.lat_deg != null && site.lon_deg != null) {
      const R = R_EARTH_MEAN;
      const lat = site.lat_deg * Math.PI / 180;
      const lon = site.lon_deg * Math.PI / 180;
      objects.push({
        id:        'launch-site',
        type:      'launch_site',
        label:     site.name || 'Launch Site',
        x:         (R * Math.cos(lat) * Math.cos(lon)) / 1000,
        y:         (R * Math.cos(lat) * Math.sin(lon)) / 1000,
        z:         (R * Math.sin(lat)) / 1000,
        radius_km: null,
        color:     '#ff5722',
        orbitPoints: null,
      });
    }
  }

  // ── Transfer arcs ────────────────────────────────────────────────
  if (Array.isArray(scenario.transferPlans)) {
    scenario.transferPlans.forEach((tp, i) => {
      if (tp.transferOrbit?.a && tp.transferOrbit?.e != null) {
        const orbitPoints = _sampleKeplerianOrbit({
          a: tp.transferOrbit.a,
          e: tp.transferOrbit.e,
          i_deg: tp.transferOrbit.i_deg || 0,
          raan_deg: tp.transferOrbit.raan_deg || 0,
          argp_deg: tp.transferOrbit.argp_deg || 0,
        });
        objects.push({
          id:        `transfer-${i}`,
          type:      'transfer_arc',
          label:     tp.label || `Transfer ${i + 1}`,
          x:         0,
          y:         0,
          z:         0,
          radius_km: null,
          color:     '#e040fb',
          orbitPoints,
        });
      }
    });
  }

  return objects;
}

/* ================================================================
   Internal helpers
   ================================================================ */

/**
 * Sample 120 points along a Keplerian orbit for rendering.
 * All positions in km, in the perifocal frame (unrotated ECI).
 *
 * @param {object} sat  Tracked-object result with Keplerian elements
 * @returns {Array<{x:number, y:number, z:number}>|null}
 * @private
 */
function _sampleKeplerianOrbit(sat) {
  const a = sat.a;            // semi-major axis, metres
  const e = sat.e ?? 0;
  const i_rad  = (sat.i_deg    ?? 0) * Math.PI / 180;
  const raan   = (sat.raan_deg ?? 0) * Math.PI / 180;
  const argp   = (sat.argp_deg ?? 0) * Math.PI / 180;

  if (!a || isNaN(a) || e >= 1) return null;

  const b = a * Math.sqrt(1 - e * e);
  const points = [];
  const N = 120;

  for (let k = 0; k <= N; k++) {
    const E = (k / N) * 2 * Math.PI;
    // Perifocal coordinates (metres)
    const xP = a * (Math.cos(E) - e);
    const yP = b * Math.sin(E);

    // Rotate perifocal → ECI via argument of perigee, inclination, RAAN
    const cosW = Math.cos(argp);
    const sinW = Math.sin(argp);
    const cosI = Math.cos(i_rad);
    const sinI = Math.sin(i_rad);
    const cosO = Math.cos(raan);
    const sinO = Math.sin(raan);

    const x = (cosO * cosW - sinO * sinW * cosI) * xP +
              (-cosO * sinW - sinO * cosW * cosI) * yP;
    const y = (sinO * cosW + cosO * sinW * cosI) * xP +
              (-sinO * sinW + cosO * cosW * cosI) * yP;
    const z = (sinW * sinI) * xP + (cosW * sinI) * yP;

    points.push({ x: x / 1000, y: y / 1000, z: z / 1000 });
  }

  return points;
}

/**
 * Return a CSS colour string with overridden alpha.
 *
 * @param {string} color  Hex ('#rrggbb') or any CSS colour
 * @param {number} alpha  0–1
 * @returns {string}
 * @private
 */
function _withAlpha(color, alpha) {
  if (color.startsWith('#') && color.length === 7) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  // Already rgba / named — return a simple translucent white as fallback
  return `rgba(200,200,200,${alpha})`;
}

/**
 * Choose a "nice" grid spacing (in world-km) that yields roughly 6–12
 * grid lines across the provided world-width.
 *
 * @param {number} worldWidth  Visible extent in km
 * @returns {number}
 * @private
 */
function _niceGridSpacing(worldWidth) {
  const raw = worldWidth / 8;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  if (norm < 1.5) return mag;
  if (norm < 3.5) return 2 * mag;
  if (norm < 7.5) return 5 * mag;
  return 10 * mag;
}

/**
 * Round a value to the nearest "nice" number for a scale bar.
 *
 * @param {number} val
 * @returns {number}
 * @private
 */
function _niceRound(val) {
  if (val <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(val)));
  const norm = val / mag;
  if (norm < 1.5) return mag;
  if (norm < 3.5) return 2 * mag;
  if (norm < 7.5) return 5 * mag;
  return 10 * mag;
}

/**
 * Format a distance in km for grid / scale-bar labels.
 *
 * @param {number} km
 * @returns {string}
 * @private
 */
function _formatKm(km) {
  const abs = Math.abs(km);
  if (abs >= 1e6)  return `${(km / 1e6).toFixed(1)}M km`;
  if (abs >= 1e3)  return `${(km / 1e3).toFixed(1)}k km`;
  if (abs >= 1)    return `${km.toFixed(0)} km`;
  return `${(km * 1000).toFixed(0)} m`;
}

/**
 * Return the horizontal and vertical axis letters for a view pane.
 *
 * @param {'top'|'sideA'|'sideB'} axis
 * @returns {{ h: string, v: string }}
 * @private
 */
function _axisLetters(axis) {
  switch (axis) {
    case 'top':   return { h: 'X', v: 'Y' };
    case 'sideA': return { h: 'Y', v: 'Z' };
    case 'sideB': return { h: 'X', v: 'Z' };
    default:      return { h: 'X', v: 'Y' };
  }
}

// ─── Shared infrastructure helpers ───────────────────────────────────────────

/** Earth radius used for placing infrastructure markers on Earth's surface [km]. */
const _R_INFRA_KM = 6371;

/**
 * Convert a geodetic latitude/longitude to an ECEF world-space point in km,
 * assuming a spherical Earth with radius {@link _R_INFRA_KM}.
 *
 * Used by all four renderers to place infrastructure seed-data markers on the
 * Earth surface without duplicating the conversion formula.
 *
 * @param {number} lat_deg - Geodetic latitude in degrees (−90 to 90).
 * @param {number} lon_deg - Longitude in degrees (−180 to 180).
 * @returns {{x:number, y:number, z:number}} ECEF position in km.
 */
export function latLonToWorldKm(lat_deg, lon_deg) {
  const lat = lat_deg * (Math.PI / 180);
  const lon = lon_deg * (Math.PI / 180);
  return {
    x: _R_INFRA_KM * Math.cos(lat) * Math.cos(lon),
    y: _R_INFRA_KM * Math.cos(lat) * Math.sin(lon),
    z: _R_INFRA_KM * Math.sin(lat),
  };
}
