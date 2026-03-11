/**
 * @file grids.js
 * @module grids
 * @description Grid-cell calculations for Earth-facing and sunlit lunar grids
 * in CELES-CALC.
 *
 * The lunar surface is divided into a regular latitude/longitude grid.
 * Functions compute:
 *   • Which grid cell a selenographic point falls into.
 *   • Whether a cell is on the near (Earth-facing) side.
 *   • Whether a cell is sunlit at a given time.
 *   • Full enumeration of all grid cells or polar-region cells.
 *
 * All angular parameters are in degrees unless the parameter name ends in _rad.
 */

import { DEG_TO_RAD, RAD_TO_DEG, PI } from './constants.js';
import { isMoonPointSunlit } from './moon.js';

// ─── Grid cell ID helpers ─────────────────────────────────────────────────────

/**
 * Generate a deterministic string ID for a grid cell from its row/column.
 *
 * @param {number} row - Row index (0-based; row 0 = south pole band).
 * @param {number} col - Column index (0-based; col 0 = westernmost band).
 * @returns {string} e.g. "R012C045"
 */
export function gridCellId(row, col) {
  return `R${String(row).padStart(3, '0')}C${String(col).padStart(3, '0')}`;
}

/**
 * Parse a grid cell ID back to {row, col}.
 * @param {string} id - e.g. "R012C045"
 * @returns {{row: number, col: number}}
 */
export function parseGridCellId(id) {
  const m = id.match(/^R(\d+)C(\d+)$/);
  if (!m) throw new Error(`Invalid grid cell ID: "${id}"`);
  return { row: parseInt(m[1], 10), col: parseInt(m[2], 10) };
}

// ─── Generic grid geometry ────────────────────────────────────────────────────

/**
 * Compute the row/column indices and cell-centre coordinates for a given
 * latitude/longitude and cell size.
 *
 * @param {number} lat_deg      - Latitude  [°, −90..+90].
 * @param {number} lon_deg      - Longitude [°, −180..+180).
 * @param {number} cellSize_deg - Cell edge size in degrees (must divide 180 and 360 evenly).
 * @returns {{row: number, col: number, centerLat: number, centerLon: number,
 *            cellId: string, latMin: number, latMax: number, lonMin: number, lonMax: number}}
 */
function latLonToCell(lat_deg, lon_deg, cellSize_deg) {
  const latNorm = Math.max(-90, Math.min(90,  lat_deg));
  const lonNorm = ((lon_deg + 180) % 360 + 360) % 360 - 180; // → [−180, +180)

  const numRows = Math.round(180 / cellSize_deg);
  const numCols = Math.round(360 / cellSize_deg);

  const row = Math.min(numRows - 1, Math.floor((latNorm + 90) / cellSize_deg));
  const col = Math.min(numCols - 1, Math.floor((lonNorm + 180) / cellSize_deg));

  const latMin    = -90 + row * cellSize_deg;
  const latMax    = latMin + cellSize_deg;
  const lonMin    = -180 + col * cellSize_deg;
  const lonMax    = lonMin + cellSize_deg;
  const centerLat = (latMin + latMax) / 2;
  const centerLon = (lonMin + lonMax) / 2;

  return {
    row, col,
    centerLat, centerLon,
    latMin, latMax, lonMin, lonMax,
    cellId: gridCellId(row, col),
  };
}

// ─── Earth-facing grid ────────────────────────────────────────────────────────

/**
 * Compute the Earth-facing index for a selenographic longitude.
 * Returns a value from 0 (sub-Earth point, lon = 0°) to 1 (limb, lon = ±90°),
 * or undefined for the far side (|lon| > 90°).
 *
 * @param {number} lon_deg - Selenographic longitude [°].
 * @returns {number|undefined} Earth-facing index in [0, 1], or undefined if far side.
 */
export function getEarthFacingIndex(lon_deg) {
  const wrapped = ((lon_deg + 180) % 360 + 360) % 360 - 180;
  if (Math.abs(wrapped) > 90) return undefined;
  return Math.abs(wrapped) / 90;
}

/**
 * Get Earth-facing grid cell metadata for a selenographic point.
 *
 * @param {number} lat_deg      - Selenographic latitude  [°].
 * @param {number} lon_deg      - Selenographic longitude [°].
 * @param {number} [cellSize_deg=5] - Grid resolution [°].
 * @returns {{cellId: string, row: number, col: number,
 *            centerLat: number, centerLon: number,
 *            earthFacingIndex: number|undefined,
 *            isNearSide: boolean,
 *            distFromSubEarth_deg: number}}
 */
export function getEarthFacingGridCell(lat_deg, lon_deg, cellSize_deg = 5) {
  const cell = latLonToCell(lat_deg, lon_deg, cellSize_deg);
  const earthFacingIndex = getEarthFacingIndex(cell.centerLon);

  // Angular distance from sub-Earth point (selenographic lon=0, lat=0)
  const lat = lat_deg * DEG_TO_RAD;
  const lon = lon_deg * DEG_TO_RAD;
  const cosD = Math.cos(lat) * Math.cos(lon);
  const distFromSubEarth_deg = Math.acos(Math.max(-1, Math.min(1, cosD))) * RAD_TO_DEG;

  return {
    cellId: cell.cellId,
    row:    cell.row,
    col:    cell.col,
    centerLat: cell.centerLat,
    centerLon: cell.centerLon,
    latMin: cell.latMin, latMax: cell.latMax,
    lonMin: cell.lonMin, lonMax: cell.lonMax,
    earthFacingIndex,
    isNearSide: earthFacingIndex !== undefined,
    distFromSubEarth_deg,
  };
}

/**
 * Return all grid cells on the near (Earth-facing) hemisphere of the Moon.
 * The near side is defined as selenographic longitude in (−90°, +90°).
 *
 * @param {number} [cellSize_deg=5] - Grid resolution [°].
 * @returns {Array<ReturnType<typeof getEarthFacingGridCell>>}
 */
export function earthFacingHemisphere(cellSize_deg = 5) {
  const cells = [];
  const numRows = Math.round(180 / cellSize_deg);
  const numCols = Math.round(360 / cellSize_deg);

  for (let r = 0; r < numRows; r++) {
    for (let c = 0; c < numCols; c++) {
      const centerLat = -90 + (r + 0.5) * cellSize_deg;
      const centerLon = -180 + (c + 0.5) * cellSize_deg;
      if (Math.abs(centerLon) < 90) {
        cells.push(getEarthFacingGridCell(centerLat, centerLon, cellSize_deg));
      }
    }
  }
  return cells;
}

// ─── Sunlit grid ──────────────────────────────────────────────────────────────

/**
 * Get sunlit grid cell metadata for a selenographic point at a given time.
 *
 * @param {number} lat_deg      - Selenographic latitude  [°].
 * @param {number} lon_deg      - Selenographic longitude [°].
 * @param {number} jd           - Julian Date (UTC).
 * @param {number} [cellSize_deg=5] - Grid resolution [°].
 * @returns {{cellId: string, row: number, col: number,
 *            centerLat: number, centerLon: number,
 *            sunlit: boolean, solarElevation_deg: number,
 *            cellCenter: {lat: number, lon: number}}}
 */
export function getSunlitGridCell(lat_deg, lon_deg, jd, cellSize_deg = 5) {
  const cell = latLonToCell(lat_deg, lon_deg, cellSize_deg);
  const illum = isMoonPointSunlit(cell.centerLat, cell.centerLon, jd);

  return {
    cellId:     cell.cellId,
    row:        cell.row,
    col:        cell.col,
    centerLat:  cell.centerLat,
    centerLon:  cell.centerLon,
    latMin: cell.latMin, latMax: cell.latMax,
    lonMin: cell.lonMin, lonMax: cell.lonMax,
    sunlit:            illum.sunlit,
    solarElevation_deg: illum.solarElevation_deg,
    cellCenter: { lat: cell.centerLat, lon: cell.centerLon },
  };
}

/**
 * Return all grid cells on the sunlit hemisphere at a given Julian Date.
 * "Sunlit" means solar elevation > 0 at the cell centre.
 *
 * @param {number} subsolarLon  - Subsolar selenographic longitude [°].
 * @param {number} [cellSize_deg=5] - Grid resolution [°].
 * @returns {Array<{cellId, row, col, centerLat, centerLon, distFromSubsolar_deg}>}
 */
export function sunlitHemisphere(subsolarLon, cellSize_deg = 5) {
  const cells = [];
  const numRows = Math.round(180 / cellSize_deg);
  const numCols = Math.round(360 / cellSize_deg);

  for (let r = 0; r < numRows; r++) {
    for (let c = 0; c < numCols; c++) {
      const centerLat = -90 + (r + 0.5) * cellSize_deg;
      const centerLon = -180 + (c + 0.5) * cellSize_deg;
      const dLon = ((centerLon - subsolarLon + 180) % 360 + 360) % 360 - 180;
      if (Math.abs(dLon) <= 90) {
        const cellId = gridCellId(r, c);
        cells.push({ cellId, row: r, col: c, centerLat, centerLon,
          distFromSubsolar_deg: Math.abs(dLon) });
      }
    }
  }
  return cells;
}

// ─── Full grid enumeration ────────────────────────────────────────────────────

/**
 * Return metadata for every grid cell covering the entire lunar surface.
 *
 * @param {number} [cellSize_deg=5] - Grid resolution [°].
 * @returns {Array<{cellId, row, col, centerLat, centerLon, isNearSide, earthFacingIndex,
 *                  latMin, latMax, lonMin, lonMax, areaSqKm}>}
 */
export function getLunarGridCells(cellSize_deg = 5) {
  const MOON_RADIUS_KM = 1_737.4;
  const cells = [];
  const numRows = Math.round(180 / cellSize_deg);
  const numCols = Math.round(360 / cellSize_deg);

  for (let r = 0; r < numRows; r++) {
    const latMin    = -90 + r * cellSize_deg;
    const latMax    = latMin + cellSize_deg;
    const centerLat = (latMin + latMax) / 2;

    // Area of spherical zone cell
    const dLon_rad = cellSize_deg * DEG_TO_RAD;
    const sinDiff  = Math.sin(latMax * DEG_TO_RAD) - Math.sin(latMin * DEG_TO_RAD);
    const areaSqKm = MOON_RADIUS_KM ** 2 * dLon_rad * sinDiff;

    for (let c = 0; c < numCols; c++) {
      const lonMin    = -180 + c * cellSize_deg;
      const lonMax    = lonMin + cellSize_deg;
      const centerLon = (lonMin + lonMax) / 2;
      const earthFacingIndex = getEarthFacingIndex(centerLon);

      cells.push({
        cellId: gridCellId(r, c),
        row:    r,
        col:    c,
        centerLat,
        centerLon,
        latMin, latMax,
        lonMin, lonMax,
        isNearSide:        earthFacingIndex !== undefined,
        earthFacingIndex:  earthFacingIndex ?? null,
        areaSqKm:          Math.abs(areaSqKm),
      });
    }
  }
  return cells;
}

// ─── Polar grid ───────────────────────────────────────────────────────────────

/**
 * Return grid cells for both polar regions (|lat| > 60°).
 * Polar cells are of special interest for permanently shadowed / sunlit regions
 * and polar landing sites.
 *
 * @param {number} [cellSize_deg=5]   - Base grid resolution [°].
 * @param {number} [poleLatitude=60]  - Latitude threshold for polar region [°].
 * @returns {{north: Array, south: Array}}
 */
export function polarModeGrid(cellSize_deg = 5, poleLatitude = 60) {
  const all   = getLunarGridCells(cellSize_deg);
  const north = all.filter(c => c.centerLat >  poleLatitude);
  const south = all.filter(c => c.centerLat < -poleLatitude);
  return { north, south };
}

// ─── Grid-level solar illumination ───────────────────────────────────────────

/**
 * Compute sunlit / shadow status for every grid cell at a given Julian Date.
 * Returns only cells where sunlit status has been computed.
 *
 * @param {number} jd               - Julian Date (UTC).
 * @param {number} [cellSize_deg=5] - Grid resolution [°].
 * @returns {Array<{cellId, centerLat, centerLon, sunlit, solarElevation_deg}>}
 */
export function computeGridIllumination(jd, cellSize_deg = 5) {
  const all = getLunarGridCells(cellSize_deg);
  return all.map(cell => {
    const illum = isMoonPointSunlit(cell.centerLat, cell.centerLon, jd);
    return {
      cellId:            cell.cellId,
      centerLat:         cell.centerLat,
      centerLon:         cell.centerLon,
      sunlit:            illum.sunlit,
      solarElevation_deg: illum.solarElevation_deg,
    };
  });
}
