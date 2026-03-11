/**
 * visuals.js — Canvas / SVG drawing functions for CELES-CALC
 *
 * All public functions accept a canvas element (or id string) and draw
 * using the 2-D canvas API.  They are pure rendering functions — they do
 * not read from the DOM beyond resolving the canvas element itself.
 */

import { DEG_TO_RAD, R_EARTH_MEAN, R_MOON, AU } from './constants.js';

/* ================================================================
   Internal colour palette (respects dark/light theme via body attr)
   ================================================================ */
function palette() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    bg:          dark ? '#000a18'   : '#cde4f5',
    landFill:    dark ? '#1a2a1a'   : '#b5c99a',
    landStroke:  dark ? '#2e4d2e'   : '#7a9a5a',
    waterFill:   dark ? '#000a18'   : '#8bbcdb',
    gridLine:    dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,80,0.15)',
    gridLabel:   dark ? '#6e7681'   : '#4466aa',
    termDay:     'rgba(255,255,128,0.10)',
    termNight:   'rgba(0,0,80,0.50)',
    termLine:    dark ? '#ffcc00'   : '#e08000',
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
    lunarFill:   dark ? '#2c2c2c'   : '#c8c0b0',
    lunarStroke: dark ? '#4a4a4a'   : '#888070',
    moonBg:      dark ? '#111111'   : '#e8e0d0',
    nearSide:    dark ? 'rgba(56,139,253,0.15)' : 'rgba(9,105,218,0.12)',
    dv:          '#e06c75',
  };
}

/* ================================================================
   Utility — resolve canvas
   ================================================================ */
function resolveCanvas(canvasOrId) {
  if (typeof canvasOrId === 'string') return document.getElementById(canvasOrId);
  return canvasOrId;
}

/** Resize canvas to its CSS display size (HiDPI-aware). Returns ctx. */
function prepareCanvas(canvas) {
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

/** Physical dimensions in CSS pixels */
function dims(canvas) {
  return { w: canvas.clientWidth || canvas.width || 800, h: canvas.clientHeight || canvas.height || 500 };
}

/* ================================================================
   projectLatLon — equirectangular projection
   ================================================================ */
/**
 * Project (lat, lon) into pixel (x, y) in an equirectangular map.
 * @param {number} lat_deg   −90 … +90
 * @param {number} lon_deg   −180 … +180
 * @param {object} proj      { type:'equirect', x0, y0, scaleX, scaleY }
 * @param {number} [width]   fallback if proj not given
 * @param {number} [height]
 * @returns {{x:number, y:number}}
 */
export function projectLatLon(lat_deg, lon_deg, proj, width = 800, height = 400) {
  const W = proj?.scaleX ? proj.scaleX * 360 : width;
  const H = proj?.scaleY ? proj.scaleY * 180 : height;
  const x0 = proj?.x0 ?? 0;
  const y0 = proj?.y0 ?? 0;
  const x = x0 + (lon_deg + 180) / 360 * W;
  const y = y0 + (90 - lat_deg)  / 180 * H;
  return { x, y };
}

/** Inverse: pixel → (lat, lon) */
export function unprojectXY(x, y, proj, width = 800, height = 400) {
  const W = proj?.scaleX ? proj.scaleX * 360 : width;
  const H = proj?.scaleY ? proj.scaleY * 180 : height;
  const x0 = proj?.x0 ?? 0;
  const y0 = proj?.y0 ?? 0;
  const lon_deg = (x - x0) / W * 360 - 180;
  const lat_deg = 90 - (y - y0) / H * 180;
  return { lat_deg, lon_deg };
}

/* ================================================================
   drawGrid — generic pixel grid
   ================================================================ */
export function drawGrid(ctx, width, height, divisions = 10) {
  const p = palette();
  ctx.save();
  ctx.strokeStyle = p.gridLine;
  ctx.lineWidth = 0.5;
  const dx = width / divisions;
  const dy = height / divisions;
  for (let i = 0; i <= divisions; i++) {
    ctx.beginPath(); ctx.moveTo(i * dx, 0); ctx.lineTo(i * dx, height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * dy); ctx.lineTo(width, i * dy); ctx.stroke();
  }
  ctx.restore();
}

/* ================================================================
   drawLatLonGrid — geographic graticule
   ================================================================ */
/**
 * Draw a lat/lon graticule on an equirectangular map.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} proj  same as projectLatLon
 * @param {{step?:number, labels?:boolean}} [opts]
 */
export function drawLatLonGrid(ctx, proj, opts = {}) {
  const p = palette();
  const step = opts.step ?? 30;
  const W = proj.w ?? 800;
  const H = proj.h ?? 400;
  ctx.save();
  ctx.strokeStyle = p.gridLine;
  ctx.lineWidth = 0.6;
  ctx.font = `10px sans-serif`;
  ctx.fillStyle = p.gridLabel;
  ctx.textBaseline = 'top';

  for (let lon = -180; lon <= 180; lon += step) {
    const { x: x1 } = projectLatLon(90, lon, proj, W, H);
    const { x: x2, y: y2 } = projectLatLon(-90, lon, proj, W, H);
    ctx.beginPath(); ctx.moveTo(x1, projectLatLon(90, lon, proj, W, H).y);
    ctx.lineTo(x2, y2); ctx.stroke();
    if (opts.labels !== false) ctx.fillText(`${lon}°`, x1 + 2, 2);
  }
  for (let lat = -90; lat <= 90; lat += step) {
    const { x: x1, y: y1 } = projectLatLon(lat, -180, proj, W, H);
    const { x: x2 } = projectLatLon(lat, 180, proj, W, H);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y1); ctx.stroke();
    if (opts.labels !== false) ctx.fillText(`${lat}°`, x1 + 2, y1 + 2);
  }
  ctx.restore();
}

/* ================================================================
   drawTerminator — day/night line on equirectangular map
   ================================================================ */
/**
 * Shade the night side and draw the solar terminator line.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} subsolarLat  degrees
 * @param {number} subsolarLon  degrees
 * @param {object} proj
 */
export function drawTerminator(ctx, subsolarLat, subsolarLon, proj) {
  if (isNaN(subsolarLat) || isNaN(subsolarLon)) return;
  const p = palette();
  const W = proj.w ?? 800;
  const H = proj.h ?? 400;
  const slat = subsolarLat * DEG_TO_RAD;
  const slon = subsolarLon * DEG_TO_RAD;

  // Build terminator polyline: points where solar elevation = 0
  const pts = [];
  for (let lon = -180; lon <= 180; lon += 1) {
    const lrad = lon * DEG_TO_RAD;
    // solar elevation = 0 → sinφ·sinσ + cosφ·cosσ·cos(λ-λs) = 0
    // → tanφ = -cos(λ-λs)/tanσ  (near-equatorial approximation fails at σ→0, handled below)
    const cosCoef = Math.cos(lrad - slon);
    if (Math.abs(Math.sin(slat)) < 1e-6) {
      // sub-solar point near equator
      const lat = 90 * (cosCoef > 0 ? -1 : 1);
      pts.push({ lon, lat });
    } else {
      const tanLat = -cosCoef / Math.tan(slat);
      const lat = Math.atan(tanLat) * (180 / Math.PI);
      pts.push({ lon, lat });
    }
  }

  // Fill night side (simple: for each column, shade either top or bottom)
  ctx.save();
  ctx.fillStyle = p.termNight;
  // Draw terminator polygon by going along terminator, then one edge
  ctx.beginPath();
  pts.forEach((pt, i) => {
    const { x, y } = projectLatLon(pt.lat, pt.lon, proj, W, H);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  // Determine night side: check if subsolar lon+90 is night
  const testLon = subsolarLon + 91;
  const testLat = 0;
  const isNightRight = !_isPointSunlit(testLat, testLon, subsolarLat, subsolarLon);
  if (isNightRight) {
    const { x: xR } = projectLatLon(0, 180, proj, W, H);
    ctx.lineTo(xR, H);
    ctx.lineTo(0, H);
    ctx.lineTo(projectLatLon(pts[0].lat, pts[0].lon, proj, W, H).x, projectLatLon(pts[0].lat, pts[0].lon, proj, W, H).y);
  } else {
    const { x: xL } = projectLatLon(0, -180, proj, W, H);
    ctx.lineTo(xL, 0);
    ctx.lineTo(W, 0);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.lineTo(0, 0);
  }
  ctx.closePath();
  ctx.fill();

  // Draw terminator line
  ctx.strokeStyle = p.termLine;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  pts.forEach((pt, i) => {
    const { x, y } = projectLatLon(pt.lat, pt.lon, proj, W, H);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function _isPointSunlit(lat, lon, subLat, subLon) {
  const phi = lat * DEG_TO_RAD;
  const lam = lon * DEG_TO_RAD;
  const ps  = subLat * DEG_TO_RAD;
  const ls  = subLon * DEG_TO_RAD;
  return Math.sin(phi) * Math.sin(ps) + Math.cos(phi) * Math.cos(ps) * Math.cos(lam - ls) > 0;
}

/* ================================================================
   drawMarker
   ================================================================ */
/**
 * Draw a labelled marker on the canvas.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {string} label
 * @param {'observer'|'target'|'satellite'|'moon'|'sun'|'point'} type
 */
export function drawMarker(ctx, x, y, label, type = 'point') {
  const p = palette();
  const colours = {
    observer:  p.markerObs,
    target:    p.markerTgt,
    satellite: p.markerSat,
    moon:      p.markerMoon,
    sun:       p.markerSun,
    point:     '#aaa',
  };
  const col = colours[type] || '#aaa';
  ctx.save();
  ctx.fillStyle = col;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;

  if (type === 'sun') {
    // Sun symbol: circle with rays
    ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = col;
    for (let a = 0; a < 8; a++) {
      const ang = a * Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(x + 9 * Math.cos(ang), y + 9 * Math.sin(ang));
      ctx.lineTo(x + 13 * Math.cos(ang), y + 13 * Math.sin(ang));
      ctx.stroke();
    }
  } else if (type === 'satellite') {
    // Diamond
    ctx.beginPath();
    ctx.moveTo(x, y - 6); ctx.lineTo(x + 5, y);
    ctx.lineTo(x, y + 6); ctx.lineTo(x - 5, y);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  } else {
    // Circle
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  }

  if (label) {
    ctx.fillStyle = p.textMain;
    ctx.font = 'bold 11px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + 8, y);
  }
  ctx.restore();
}

/* ================================================================
   drawArrow
   ================================================================ */
export function drawArrow(ctx, x1, y1, x2, y2, color = '#f85149', label = '') {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle   = color;
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  // Arrowhead
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const sz = 10;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - sz * Math.cos(ang - 0.4), y2 - sz * Math.sin(ang - 0.4));
  ctx.lineTo(x2 - sz * Math.cos(ang + 0.4), y2 - sz * Math.sin(ang + 0.4));
  ctx.closePath();
  ctx.fill();
  if (label) {
    ctx.fillStyle = color;
    ctx.font = '11px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, (x1 + x2) / 2 + 6, (y1 + y2) / 2 - 6);
  }
  ctx.restore();
}

/* ================================================================
   drawSightLine
   ================================================================ */
/**
 * Draw a dashed or solid line between two canvas points.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number,y:number}} from
 * @param {{x:number,y:number}} to
 * @param {string} [color]
 * @param {boolean} [dashed]
 */
export function drawSightLine(ctx, from, to, color = 'rgba(56,139,253,0.7)', dashed = true) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  if (dashed) ctx.setLineDash([8, 5]);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/* ================================================================
   drawOrbitArc
   ================================================================ */
/**
 * Draw a Keplerian orbit arc (projected onto orbital plane).
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ a:number, e:number }} coe   semi-major axis (m) and eccentricity
 * @param {number} centerX  pixel center of central body
 * @param {number} centerY
 * @param {number} scale    pixels per metre (e.g. 1/50000)
 */
export function drawOrbitArc(ctx, coe, centerX, centerY, scale) {
  const p = palette();
  const { a, e } = coe;
  if (!a || isNaN(a)) return;
  const b = a * Math.sqrt(1 - e * e);
  const c = a * e;   // focal offset

  ctx.save();
  ctx.strokeStyle = p.orbitArc;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  // Draw ellipse with focus at (centerX, centerY)
  // Center of ellipse shifted by c towards apoapsis
  const cx = centerX - c * scale;
  ctx.beginPath();
  ctx.ellipse(cx, centerY, a * scale, b * scale, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/* ================================================================
   drawDeltaVArrow
   ================================================================ */
export function drawDeltaVArrow(ctx, position, direction, magnitude, label) {
  const p = palette();
  const norm = Math.sqrt(direction.x ** 2 + direction.y ** 2) || 1;
  const len = Math.min(60, Math.max(20, magnitude / 50));
  const x2 = position.x + (direction.x / norm) * len;
  const y2 = position.y + (direction.y / norm) * len;
  drawArrow(ctx, position.x, position.y, x2, y2, p.dv, label);
}

/* ================================================================
   drawEarthMap — equirectangular Earth diagram with terminator
   ================================================================ */
/**
 * Draw a simplified equirectangular Earth map.
 * @param {HTMLCanvasElement|string} canvasOrId
 * @param {object} scenario  CELES-CALC scenario state
 * @param {object} [layers]  layer visibility flags
 */
export function drawEarthMap(canvasOrId, scenario, layers = {}) {
  const canvas = resolveCanvas(canvasOrId);
  if (!canvas) return;
  const ctx = prepareCanvas(canvas);
  if (!ctx) return;
  const { w, h } = dims(canvas);
  const p = palette();

  // Background (ocean)
  ctx.fillStyle = p.waterFill;
  ctx.fillRect(0, 0, w, h);

  const proj = { x0: 0, y0: 0, w, h };

  // Simple continental outlines (very low-res polygon approximation)
  _drawSimplifiedContinents(ctx, proj, p);

  // Graticule
  if (layers.grid !== false) {
    drawLatLonGrid(ctx, proj, { step: 30 });
  }

  // Terminator
  if (layers.illumination !== false && scenario?.bodies?.earth?.subsolarLat !== undefined) {
    const slat = scenario.bodies.earth.subsolarLat ?? 0;
    const slon = scenario.bodies.earth.subsolarLon ?? 0;
    drawTerminator(ctx, slat, slon, proj);
  } else if (layers.illumination !== false && scenario?.timeSystems?.jd) {
    // Fallback: approximate from JD using a simple solar declination model
    const jd = scenario.timeSystems.jd;
    const T = (jd - 2451545.0) / 36525;
    const L = (280.46646 + 36000.76983 * T) % 360;
    const M = (357.52911 + 35999.05029 * T) * DEG_TO_RAD;
    const lam = (L + 1.914602 * Math.sin(M) + 0.019993 * Math.sin(2 * M)) * DEG_TO_RAD;
    const eps = (23.439291 - 0.013004 * T) * DEG_TO_RAD;
    const slat = Math.asin(Math.sin(eps) * Math.sin(lam)) * (180 / Math.PI);
    const GMST = ((280.46061837 + 360.98564736629 * (jd - 2451545.0)) % 360 + 360) % 360;
    const slon = ((Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)) * (180 / Math.PI)) - GMST + 540) % 360 - 180;
    drawTerminator(ctx, slat, slon, proj);
  }

  // Observers
  if (layers.labels !== false && scenario?.observers) {
    for (const obs of scenario.observers) {
      if (obs.lat_deg !== undefined && obs.lon_deg !== undefined) {
        const { x, y } = projectLatLon(obs.lat_deg, obs.lon_deg, proj, w, h);
        drawMarker(ctx, x, y, obs.name || 'Obs', 'observer');
      }
    }
  }

  // Targets
  if (layers.labels !== false && scenario?.targets) {
    for (const tgt of scenario.targets) {
      if (tgt.lat_deg !== undefined && tgt.lon_deg !== undefined) {
        const { x, y } = projectLatLon(tgt.lat_deg, tgt.lon_deg, proj, w, h);
        drawMarker(ctx, x, y, tgt.name || 'Tgt', 'target');
      }
    }
  }

  // Sight lines between observers and targets
  if (layers.sightlines !== false && scenario?.visibilityResults) {
    for (const vr of scenario.visibilityResults) {
      if (vr.obsLat !== undefined && vr.tgtLat !== undefined) {
        const from = projectLatLon(vr.obsLat, vr.obsLon, proj, w, h);
        const to   = projectLatLon(vr.tgtLat, vr.tgtLon, proj, w, h);
        drawSightLine(ctx, from, to, vr.visible ? 'rgba(63,185,80,0.8)' : 'rgba(248,81,73,0.6)', true);
      }
    }
  }

  _drawMapBorder(ctx, w, h, p);
  _drawLabel(ctx, 'EARTH', w, h, p);
}

/* ================================================================
   drawMoonMap — lunar near-side/far-side schematic
   ================================================================ */
export function drawMoonMap(canvasOrId, scenario, layers = {}) {
  const canvas = resolveCanvas(canvasOrId);
  if (!canvas) return;
  const ctx = prepareCanvas(canvas);
  if (!ctx) return;
  const { w, h } = dims(canvas);
  const p = palette();

  // Background
  ctx.fillStyle = p.moonBg;
  ctx.fillRect(0, 0, w, h);

  const proj = { x0: 0, y0: 0, w, h };

  // Near-side highlight
  if (layers.zones !== false) {
    const { x: nx, y: ny } = projectLatLon(0, 0, proj, w, h);
    const grd = ctx.createRadialGradient(nx, ny, 0, nx, ny, w / 4);
    grd.addColorStop(0, 'rgba(56,139,253,0.2)');
    grd.addColorStop(1, 'rgba(56,139,253,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
  }

  // Graticule
  if (layers.grid !== false) {
    drawLatLonGrid(ctx, proj, { step: 30 });
  }

  // Major craters / landmarks
  const landmarks = [
    { lat: 0.7, lon: 23.5, name: 'Mare\nTranq.' },
    { lat: -10, lon: -20,  name: 'Mare\nCogn.' },
    { lat: 30,  lon: -30,  name: 'Mare\nImb.' },
    { lat: -89.9, lon: 0,  name: 'S.Pole' },
    { lat: 89.9,  lon: 0,  name: 'N.Pole' },
  ];
  if (layers.labels !== false) {
    for (const lm of landmarks) {
      const { x, y } = projectLatLon(lm.lat, lm.lon, proj, w, h);
      ctx.fillStyle = p.textDim;
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(lm.name, x, y);
    }
    ctx.textAlign = 'left';
  }

  // Terminator on Moon (sub-solar point)
  if (layers.illumination !== false && scenario?.timeSystems?.jd) {
    const jd = scenario.timeSystems.jd;
    const subSolar = _moonSubsolarApprox(jd);
    drawTerminator(ctx, subSolar.lat, subSolar.lon, proj);
  }

  // Sub-Earth point
  if (layers.labels !== false && scenario?.timeSystems?.jd) {
    const jd = scenario.timeSystems.jd;
    const { lat: seLat, lon: seLon } = _moonSubEarthApprox(jd);
    const { x, y } = projectLatLon(seLat, seLon, proj, w, h);
    drawMarker(ctx, x, y, 'Sub-⊕', 'observer');
  }

  // Moon observers
  if (layers.labels !== false && scenario?.observers) {
    for (const obs of scenario.observers) {
      if (obs.type === 'moon_surface' && obs.lat_deg !== undefined) {
        const { x, y } = projectLatLon(obs.lat_deg, obs.lon_deg ?? 0, proj, w, h);
        drawMarker(ctx, x, y, obs.name || 'MObs', 'target');
      }
    }
  }

  _drawMapBorder(ctx, w, h, p);
  _drawLabel(ctx, 'MOON', w, h, p);
}

/* ================================================================
   drawOrbitDiagram — orbit schematic with zoom-level presets
   ================================================================ */
/**
 * Draw a zoom-level–aware orbit diagram.
 * @param {HTMLCanvasElement|string} canvasOrId
 * @param {object} scenario  CELES-CALC scenario state
 * @param {object} [layers]  layer visibility flags
 * @param {'galactic'|'solar'|'earth-moon'|'earth'|'moon'} [zoomLevel='earth-moon']
 */
export function drawOrbitDiagram(canvasOrId, scenario, layers = {}, zoomLevel = 'earth-moon') {
  const canvas = resolveCanvas(canvasOrId);
  if (!canvas) return;
  const ctx = prepareCanvas(canvas);
  if (!ctx) return;
  const { w, h } = dims(canvas);
  const p = palette();

  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;

  // Background grid
  if (layers.grid !== false) drawGrid(ctx, w, h, 10);

  switch (zoomLevel) {
    case 'galactic':   _drawGalacticView(ctx, w, h, cx, cy, p, layers); break;
    case 'solar':      _drawSolarView(ctx, w, h, cx, cy, p, layers);    break;
    case 'earth':      _drawEarthCloseup(ctx, w, h, cx, cy, p, layers); break;
    case 'moon':       _drawMoonCloseup(ctx, w, h, cx, cy, p, layers);  break;
    case 'earth-moon':
    default:
      _drawEarthMoonView(ctx, w, h, cx, cy, p, layers, scenario);
      break;
  }

  _drawLabel(ctx, `ORBIT · ${zoomLevel.toUpperCase()}`, w, h, p);
}

/* ── Galactic zoom ──────────────────────────────────────────────── */
/**
 * Draw a schematic Milky Way top-down view with the Sun's position.
 * @param {CanvasRenderingContext2D} ctx
 */
function _drawGalacticView(ctx, w, h, cx, cy, p, layers) {
  // Milky Way ellipse (simplified spiral)
  ctx.save();
  ctx.strokeStyle = p.gridLine;
  ctx.lineWidth = 0.8;
  const galR = Math.min(w, h) * 0.42;
  // Draw concentric spiral arms
  for (let arm = 0; arm < 4; arm++) {
    ctx.beginPath();
    ctx.strokeStyle = `rgba(100,160,255,${0.08 + arm * 0.03})`;
    ctx.lineWidth = galR * 0.12;
    const offset = (arm * Math.PI) / 2;
    for (let t = 0.3; t < 2.8; t += 0.05) {
      const r = galR * 0.15 * t;
      const a = t * 1.2 + offset;
      const px = cx + r * Math.cos(a);
      const py = cy + r * Math.sin(a);
      t === 0.3 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  // Galactic centre bulge
  const bulge = ctx.createRadialGradient(cx, cy, 0, cx, cy, galR * 0.18);
  bulge.addColorStop(0, 'rgba(255,230,160,0.35)');
  bulge.addColorStop(1, 'rgba(255,230,160,0)');
  ctx.fillStyle = bulge;
  ctx.beginPath(); ctx.arc(cx, cy, galR * 0.18, 0, Math.PI * 2); ctx.fill();

  // Sun position (~8.2 kpc from centre ≈ 60% of visible radius)
  const sunDist = galR * 0.6;
  const sunAngle = -Math.PI * 0.35;
  const sunX = cx + sunDist * Math.cos(sunAngle);
  const sunY = cy + sunDist * Math.sin(sunAngle);
  ctx.fillStyle = '#ffd700';
  ctx.beginPath(); ctx.arc(sunX, sunY, 4, 0, Math.PI * 2); ctx.fill();
  if (layers.labels !== false) {
    ctx.fillStyle = p.textMain;
    ctx.font = 'bold 11px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('☉ Solar System', sunX + 8, sunY);
  }

  // Scale label
  ctx.fillStyle = p.textDim;
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('~100 000 ly diameter', cx, cy + galR + 18);
  ctx.textAlign = 'left';
  ctx.restore();
}

/* ── Solar System zoom ──────────────────────────────────────────── */
/**
 * Draw inner solar system: Sun + Mercury, Venus, Earth, Mars orbits to scale.
 * @param {CanvasRenderingContext2D} ctx
 */
function _drawSolarView(ctx, w, h, cx, cy, p, layers) {
  ctx.save();
  // Orbital radii in AU
  const planets = [
    { name: 'Mercury', rAU: 0.387, color: '#b0b0b0' },
    { name: 'Venus',   rAU: 0.723, color: '#e6c87a' },
    { name: 'Earth',   rAU: 1.000, color: '#4a9af5' },
    { name: 'Mars',    rAU: 1.524, color: '#e06040' },
  ];
  const maxAU = 1.8;
  const scale = (Math.min(w, h) * 0.44) / maxAU;

  // Sun
  const sunGrd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 10);
  sunGrd.addColorStop(0, '#fff8a0');
  sunGrd.addColorStop(1, '#ffd700');
  ctx.fillStyle = sunGrd;
  ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fill();
  if (layers.labels !== false) {
    ctx.fillStyle = p.textDim;
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Sun', cx, cy + 18);
  }

  // Planet orbits and markers
  for (const pl of planets) {
    const r = pl.rAU * scale;
    ctx.strokeStyle = `rgba(255,255,255,0.15)`;
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();

    // Planet dot (arbitrary angle for visual spread)
    const angle = pl.rAU * 4.5;
    const px = cx + r * Math.cos(angle);
    const py = cy + r * Math.sin(angle);
    ctx.fillStyle = pl.color;
    ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();
    if (layers.labels !== false) {
      ctx.fillStyle = p.textMain;
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(pl.name, px + 7, py + 3);
    }
  }

  // AU scale bar
  ctx.fillStyle = p.textDim;
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  const barY = cy + maxAU * scale + 20;
  ctx.fillText('1 AU', cx, barY);
  ctx.strokeStyle = p.textDim;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - scale / 2, barY - 8);
  ctx.lineTo(cx + scale / 2, barY - 8);
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.restore();
}

/* ── Earth-Moon zoom (default) ──────────────────────────────────── */
/**
 * Draw the Earth-Moon system with scenario orbits overlaid.
 * @param {CanvasRenderingContext2D} ctx
 */
function _drawEarthMoonView(ctx, w, h, cx, cy, p, layers, scenario) {
  const lunarDist = 384400; // km
  const maxDim = Math.min(w, h) * 0.44;
  const kmPerPx = (lunarDist * 1.2) / maxDim;

  // Earth
  const earthRpx = Math.max(6, R_EARTH_MEAN / 1000 / kmPerPx);
  const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, earthRpx);
  grd.addColorStop(0, '#1a5a8a');
  grd.addColorStop(1, '#0d3052');
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.arc(cx, cy, earthRpx, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#2878aa'; ctx.lineWidth = 1; ctx.stroke();
  if (layers.labels !== false) {
    ctx.fillStyle = p.textDim;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Earth', cx, cy);
    ctx.textAlign = 'left';
  }

  // Lunar orbit ring
  const moonOrbitPx = lunarDist / kmPerPx;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 0.8;
  ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.arc(cx, cy, moonOrbitPx, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Moon marker (placed at angle=0 for simplicity)
  const moonRpx = Math.max(3, R_MOON / 1000 / kmPerPx);
  const moonX = cx + moonOrbitPx;
  const moonY = cy;
  ctx.fillStyle = p.markerMoon;
  ctx.beginPath(); ctx.arc(moonX, moonY, Math.max(moonRpx, 4), 0, Math.PI * 2); ctx.fill();
  if (layers.labels !== false) {
    ctx.fillStyle = p.textMain;
    ctx.font = '10px sans-serif';
    ctx.fillText('Moon', moonX + Math.max(moonRpx, 4) + 4, moonY + 3);
  }

  // Distance annotation
  if (layers.measurements !== false) {
    ctx.save();
    ctx.strokeStyle = p.textDim;
    ctx.lineWidth = 0.6;
    ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(moonX, moonY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = p.textDim;
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('384 400 km', (cx + moonX) / 2, cy - 8);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  // Overlay scenario orbits (same logic as original)
  _drawScenarioOrbits(ctx, w, h, cx, cy, p, layers, scenario);
}

/**
 * Draw scenario-specific orbit arcs (shared by earth-moon and other levels).
 * @param {CanvasRenderingContext2D} ctx
 */
function _drawScenarioOrbits(ctx, w, h, cx, cy, p, layers, scenario) {
  const or = scenario?.orbitResults;
  if (or && layers.orbits !== false) {
    const a = or.a ?? or.sma_m;
    const e = or.e ?? 0;
    if (a) {
      const maxDim = Math.min(w, h) * 0.44;
      const scale  = maxDim / a;
      drawOrbitArc(ctx, { a, e }, cx, cy, scale);
      if (or.r_vec) {
        const rx = or.r_vec[0] * scale;
        const ry = or.r_vec[1] * scale;
        drawMarker(ctx, cx + rx, cy - ry, 'SC', 'satellite');
      }
    }
  }

  const tler = scenario?.tleResults;
  if (tler && layers.orbits !== false) {
    const a_m = tler.a_m ?? ((6378137 + (tler.alt_km ?? 400) * 1000));
    if (a_m) {
      const maxDim = Math.min(w, h) * 0.44;
      const scale = maxDim / a_m;
      drawOrbitArc(ctx, { a: a_m, e: tler.eccentricity ?? 0 }, cx, cy, scale);
    }
  }

  const hr = scenario?.orbitResults?.hohmann;
  if (hr && layers.orbits !== false) {
    const r1 = hr.r1; const r2 = hr.r2;
    const maxDim = Math.min(w, h) * 0.44;
    const scale = maxDim / Math.max(r1, r2);
    ctx.save();
    ctx.strokeStyle = p.markerObs;
    ctx.lineWidth = 1; ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(cx, cy, r1 * scale, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = p.markerTgt;
    ctx.beginPath(); ctx.arc(cx, cy, r2 * scale, 0, Math.PI * 2); ctx.stroke();
    const at = (r1 + r2) / 2;
    const et = Math.abs(r2 - r1) / (r2 + r1);
    ctx.strokeStyle = '#ffd700'; ctx.setLineDash([4, 3]);
    drawOrbitArc(ctx, { a: at, e: et }, cx, cy, scale);
    ctx.restore();
  }
}

/* ── Earth close-up zoom ────────────────────────────────────────── */
/**
 * Draw Earth with LEO, MEO, GEO orbit altitude rings.
 * @param {CanvasRenderingContext2D} ctx
 */
function _drawEarthCloseup(ctx, w, h, cx, cy, p, layers) {
  // Earth radius ≈ 6 371 km; GEO alt ≈ 35 786 km → orbital radius ≈ 42 157 km
  const earthR_km = R_EARTH_MEAN / 1000;
  const geoR_km   = earthR_km + 35786;
  const maxDim    = Math.min(w, h) * 0.44;
  const kmPerPx   = geoR_km * 1.15 / maxDim;
  const earthRpx  = earthR_km / kmPerPx;

  // Earth
  const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, earthRpx);
  grd.addColorStop(0, '#1a5a8a');
  grd.addColorStop(1, '#0d3052');
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.arc(cx, cy, earthRpx, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#2878aa'; ctx.lineWidth = 1; ctx.stroke();
  if (layers.labels !== false) {
    ctx.fillStyle = p.textDim;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Earth', cx, cy);
    ctx.textAlign = 'left';
  }

  // Orbit rings
  const orbits = [
    { name: 'LEO (400 km)',    alt: 400,   color: '#3fb950' },
    { name: 'MEO (20 200 km)', alt: 20200, color: '#d29922' },
    { name: 'GEO (35 786 km)', alt: 35786, color: '#f85149' },
  ];
  for (const orb of orbits) {
    const rPx = (earthR_km + orb.alt) / kmPerPx;
    ctx.save();
    ctx.strokeStyle = orb.color;
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = 0.7;
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.arc(cx, cy, rPx, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    if (layers.labels !== false) {
      ctx.fillStyle = orb.color;
      ctx.font = '10px sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(orb.name, cx + rPx + 6, cy);
    }
    ctx.restore();
  }
}

/* ── Moon close-up zoom ─────────────────────────────────────────── */
/**
 * Draw Moon close-up with low-lunar-orbit ring.
 * @param {CanvasRenderingContext2D} ctx
 */
function _drawMoonCloseup(ctx, w, h, cx, cy, p, layers) {
  const moonR_km = R_MOON / 1000; // ≈ 1 737 km
  const lloAlt   = 100;           // km — low lunar orbit
  const maxDim   = Math.min(w, h) * 0.38;
  const kmPerPx  = (moonR_km * 1.4) / maxDim;
  const moonRpx  = moonR_km / kmPerPx;

  // Moon surface
  const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, moonRpx);
  grd.addColorStop(0, '#555');
  grd.addColorStop(1, '#333');
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.arc(cx, cy, moonRpx, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = p.lunarStroke; ctx.lineWidth = 1; ctx.stroke();
  if (layers.labels !== false) {
    ctx.fillStyle = p.textDim;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Moon', cx, cy);
    ctx.textAlign = 'left';
  }

  // LLO ring
  const lloPx = (moonR_km + lloAlt) / kmPerPx;
  ctx.save();
  ctx.strokeStyle = '#58a6ff';
  ctx.lineWidth = 1.2;
  ctx.setLineDash([5, 3]);
  ctx.beginPath(); ctx.arc(cx, cy, lloPx, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  if (layers.labels !== false) {
    ctx.fillStyle = '#58a6ff';
    ctx.font = '10px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('LLO (100 km)', cx + lloPx + 6, cy);
  }
  ctx.restore();

  // Frozen orbit (higher)
  const frozenAlt = 750;
  const frozenPx = (moonR_km + frozenAlt) / kmPerPx;
  ctx.save();
  ctx.strokeStyle = '#d29922';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 5]);
  ctx.beginPath(); ctx.arc(cx, cy, frozenPx, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  if (layers.labels !== false) {
    ctx.fillStyle = '#d29922';
    ctx.font = '10px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('Frozen (750 km)', cx + frozenPx + 6, cy - 14);
  }
  ctx.restore();
}

/* ================================================================
   drawGeometryView — observer/target geometry
   ================================================================ */
export function drawGeometryView(canvasOrId, scenario, layers = {}) {
  const canvas = resolveCanvas(canvasOrId);
  if (!canvas) return;
  const ctx = prepareCanvas(canvas);
  if (!ctx) return;
  const { w, h } = dims(canvas);
  const p = palette();

  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h * 0.65;

  // Earth surface arc
  ctx.save();
  const er = Math.min(w, h) * 0.45;
  ctx.strokeStyle = '#2878aa';
  ctx.lineWidth = 2;
  ctx.fillStyle = '#0d3052';
  ctx.beginPath();
  ctx.arc(cx, cy + er * 0.2, er, Math.PI, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  ctx.restore();

  // Observer position on surface
  const obsEl = scenario?.visibilityResults?.[0]?.el_deg ?? 30;
  const obsAng = -Math.PI * 0.6;
  const obsX = cx + er * Math.cos(obsAng);
  const obsY = (cy + er * 0.2) + er * Math.sin(obsAng);

  if (layers.labels !== false) {
    drawMarker(ctx, obsX, obsY, 'Observer', 'observer');
  }

  // Target (simplified: above horizon)
  const el_deg = scenario?.visibilityResults?.[0]?.el_deg ?? 35;
  const az_rad = (scenario?.visibilityResults?.[0]?.az_deg ?? 90) * DEG_TO_RAD;
  const rng_scaled = Math.min(w, h) * 0.35;
  const surfNorm = obsAng - Math.PI / 2;
  const tgtAng = surfNorm - (el_deg * DEG_TO_RAD);
  const tgtX = obsX + rng_scaled * Math.cos(tgtAng);
  const tgtY = obsY + rng_scaled * Math.sin(tgtAng);

  if (layers.sightlines !== false) {
    const visible = scenario?.visibilityResults?.[0]?.visible ?? true;
    drawSightLine(ctx,
      { x: obsX, y: obsY },
      { x: tgtX, y: tgtY },
      visible ? 'rgba(63,185,80,0.8)' : 'rgba(248,81,73,0.7)',
      !visible
    );
  }
  if (layers.labels !== false) {
    drawMarker(ctx, tgtX, tgtY, 'Target', 'target');
  }

  // Horizon line
  if (layers.measurements !== false) {
    ctx.save();
    ctx.strokeStyle = p.gridLine;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    const horizLen = 120;
    const hAng = surfNorm;
    ctx.beginPath();
    ctx.moveTo(obsX - horizLen * Math.cos(hAng), obsY - horizLen * Math.sin(hAng));
    ctx.lineTo(obsX + horizLen * Math.cos(hAng), obsY + horizLen * Math.sin(hAng));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = p.textDim;
    ctx.font = '10px sans-serif';
    ctx.fillText('Horizon', obsX + horizLen * 0.6 * Math.cos(hAng) + 4, obsY + horizLen * 0.6 * Math.sin(hAng));
    ctx.restore();
  }

  // Elevation angle annotation
  if (layers.measurements !== false && el_deg > 0) {
    ctx.save();
    ctx.strokeStyle = '#d29922';
    ctx.fillStyle   = '#d29922';
    ctx.lineWidth   = 1;
    const arcR = 40;
    ctx.beginPath();
    ctx.arc(obsX, obsY, arcR, surfNorm, tgtAng, false);
    ctx.stroke();
    ctx.font = '11px sans-serif';
    ctx.fillText(`el: ${el_deg.toFixed(1)}°`, obsX + arcR + 5, obsY - 5);
    ctx.restore();
  }

  _drawLabel(ctx, 'GEOMETRY', w, h, p);
}

/* ================================================================
   drawObserverHorizon — horizon circle view (polar plot)
   ================================================================ */
export function drawObserverHorizon(canvasOrId, observer, targets) {
  const canvas = resolveCanvas(canvasOrId);
  if (!canvas) return;
  const ctx = prepareCanvas(canvas);
  if (!ctx) return;
  const { w, h } = dims(canvas);
  const p = palette();
  const cx = w / 2; const cy = h / 2;
  const R = Math.min(w, h) / 2 - 20;

  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, w, h);

  // Horizon circle rings
  ctx.save();
  for (let el = 0; el <= 90; el += 30) {
    const r = R * (1 - el / 90);
    ctx.strokeStyle = el === 0 ? p.termLine : p.gridLine;
    ctx.lineWidth = el === 0 ? 1.5 : 0.6;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    if (layers?.labels !== false && el > 0) {
      ctx.fillStyle = p.textDim;
      ctx.font = '9px sans-serif';
      ctx.fillText(`${el}°`, cx + r + 3, cy);
    }
  }
  // N/S/E/W labels
  const dirs = [['N', 0], ['E', 90], ['S', 180], ['W', 270]];
  for (const [lbl, az] of dirs) {
    const ang = (az - 90) * DEG_TO_RAD;
    ctx.fillStyle = p.textMain;
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(lbl, cx + (R + 12) * Math.cos(ang), cy + (R + 12) * Math.sin(ang));
  }
  ctx.textAlign = 'left';

  // Plot targets
  if (Array.isArray(targets)) {
    for (const tgt of targets) {
      const az = tgt.az_deg ?? 0;
      const el = tgt.el_deg ?? 0;
      if (el < 0) continue; // below horizon
      const r = R * (1 - el / 90);
      const ang = (az - 90) * DEG_TO_RAD;
      const tx = cx + r * Math.cos(ang);
      const ty = cy + r * Math.sin(ang);
      drawMarker(ctx, tx, ty, tgt.name || '', tgt.type === 'sun' ? 'sun' : 'target');
    }
  }
  ctx.restore();

  _drawLabel(ctx, 'HORIZON', w, h, p);
}

/* ================================================================
   drawMeasurements — overlay measurement lines / angles on canvas
   ================================================================ */
/**
 * Draw user-placed measurement annotations.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{type:string, points:Array<{x:number,y:number}>, label:string}>} measurements
 */
export function drawMeasurements(ctx, measurements) {
  if (!measurements || !measurements.length) return;
  const p = palette();
  ctx.save();

  for (const m of measurements) {
    if (m.type === 'distance' && m.points.length === 2) {
      const [a, b] = m.points;
      // Line
      ctx.strokeStyle = '#f0c040';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 3]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.setLineDash([]);
      // End markers
      for (const pt of [a, b]) {
        ctx.fillStyle = '#f0c040';
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2); ctx.fill();
      }
      // Label at midpoint
      if (m.label) {
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        const tw = ctx.measureText(m.label).width;
        ctx.fillRect(mx - tw / 2 - 4, my - 16, tw + 8, 18);
        ctx.fillStyle = '#f0c040';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(m.label, mx, my - 7);
        ctx.textAlign = 'left';
      }
    } else if (m.type === 'angle' && m.points.length === 3) {
      const [a, vertex, b] = m.points;
      // Lines from vertex to both ends
      ctx.strokeStyle = '#60d0f0';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(vertex.x, vertex.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      // Angle arc
      const ang1 = Math.atan2(a.y - vertex.y, a.x - vertex.x);
      const ang2 = Math.atan2(b.y - vertex.y, b.x - vertex.x);
      ctx.strokeStyle = '#60d0f0';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(vertex.x, vertex.y, 20, ang1, ang2); ctx.stroke();
      // Point markers
      for (const pt of [a, vertex, b]) {
        ctx.fillStyle = '#60d0f0';
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2); ctx.fill();
      }
      // Label
      if (m.label) {
        const midAng = (ang1 + ang2) / 2;
        const lx = vertex.x + 30 * Math.cos(midAng);
        const ly = vertex.y + 30 * Math.sin(midAng);
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        const tw = ctx.measureText(m.label).width;
        ctx.fillRect(lx - tw / 2 - 4, ly - 8, tw + 8, 16);
        ctx.fillStyle = '#60d0f0';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(m.label, lx, ly);
        ctx.textAlign = 'left';
      }
    }
  }
  ctx.restore();
}

/* ================================================================
   Private helpers
   ================================================================ */
function _drawMapBorder(ctx, w, h, p) {
  ctx.save();
  ctx.strokeStyle = p.landStroke;
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, w, h);
  ctx.restore();
}

function _drawLabel(ctx, text, w, h, p) {
  ctx.save();
  ctx.font = 'bold 11px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(text, w - 6, h - 4);
  ctx.textAlign = 'left';
  ctx.restore();
}

/** Very simplified continental outline drawing */
function _drawSimplifiedContinents(ctx, proj, p) {
  ctx.save();
  ctx.fillStyle   = p.landFill;
  ctx.strokeStyle = p.landStroke;
  ctx.lineWidth   = 0.7;
  const W = proj.w; const H = proj.h;

  // North America (approx bounding box + polygon)
  _drawPolygon(ctx, proj, W, H, [
    [70,-140],[70,-55],[50,-55],[25,-77],[15,-85],[15,-90],[20,-105],[30,-110],[45,-125],[60,-140],[70,-140]
  ], p);
  // South America
  _drawPolygon(ctx, proj, W, H, [
    [12,-72],[12,-60],[0,-50],[-10,-38],[-35,-55],[-55,-65],[-55,-68],[-45,-73],[-12,-77],[12,-72]
  ], p);
  // Europe
  _drawPolygon(ctx, proj, W, H, [
    [71,28],[70,32],[60,30],[55,25],[50,20],[44,28],[38,26],[37,15],[42,3],[45,-1],[50,-5],[58,-4],[60,5],[65,14],[71,28]
  ], p);
  // Africa
  _drawPolygon(ctx, proj, W, H, [
    [37,10],[36,25],[30,33],[22,37],[12,43],[0,42],[-10,40],[-35,26],[-35,18],[-20,15],[-15,12],[-5,-8],[0,-5],[5,-2],[5,10],[10,15],[15,10],[20,15],[25,33],[35,33],[37,10]
  ], p);
  // Asia + Russia (simplified)
  _drawPolygon(ctx, proj, W, H, [
    [71,180],[71,140],[65,150],[60,142],[55,135],[45,140],[38,140],[25,120],[10,110],[5,100],[10,80],[22,70],[30,60],[37,36],[42,28],[50,30],[55,37],[60,55],[65,55],[70,68],[72,80],[72,130],[71,180]
  ], p);
  // Australia
  _drawPolygon(ctx, proj, W, H, [
    [-15,135],[-15,145],[-22,151],[-33,152],[-38,147],[-38,140],[-32,126],[-22,114],[-18,122],[-15,135]
  ], p);
  // Antarctica (approx)
  _drawPolygon(ctx, proj, W, H, [
    [-70,-180],[-70,180],[-90,180],[-90,-180],[-70,-180]
  ], p);

  ctx.restore();
}

function _drawPolygon(ctx, proj, W, H, points, p) {
  if (!points.length) return;
  ctx.beginPath();
  points.forEach(([lat, lon], i) => {
    const { x, y } = projectLatLon(lat, lon, proj, W, H);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function _moonSubsolarApprox(jd) {
  // Very approximate
  const T = (jd - 2451545.0) / 36525;
  const L0 = 218.3165 + 481267.8813 * T;
  const lon = ((L0 % 360) + 360) % 360 - 180;
  const lat = 1.5 * Math.sin((L0 * 2) * DEG_TO_RAD);
  return { lat, lon };
}
function _moonSubEarthApprox(jd) {
  const T = (jd - 2451545.0) / 36525;
  // libration rough approximation
  const lat = 6.7 * Math.sin((93.3 + 483202 * T) * DEG_TO_RAD);
  const lon = 7.9 * Math.sin((125.0 - 1934 * T) * DEG_TO_RAD);
  return { lat, lon };
}
