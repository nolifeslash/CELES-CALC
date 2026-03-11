# CELES-CALC

## Space–Earth–Moon Time & Location Calculator + Visualizer

A high-quality standalone static web app for Earth, Moon, and space calculations. Works in **two linked browser windows**: a Calculator (Window A) and a Visualizer (Window B).

---

## What the App Does

CELES-CALC lets you:

1. **Convert between major coordinate systems** — geodetic lat/lon/alt ↔ ECEF ↔ ECI ↔ ENU; selenographic ↔ lunar body-fixed; classical orbital elements ↔ state vectors
2. **Convert between major time systems** — UTC, TAI, TT, GPS Time, Unix, Julian Date, Modified Julian Date, ISO 8601
3. **Compute sunlit vs. darkness** — for any Earth or Moon surface point given a time
4. **Compute Earth-facing / Earth-visible lunar locations** — near-side determination, sub-Earth point
5. **Compute visibility from an observer** — above-horizon checks, line-of-sight, occultation
6. **Measure distances and angles** — great-circle, 3D Cartesian, bearing, arc length
7. **Run generic orbital helper calculations** — Hohmann transfer, plane change ΔV, vis-viva, COE ↔ state vector
8. **Parse and display tracked objects** — TLE and OMM parsing, simplified two-body propagation (clearly labeled as not SGP4)
9. **See the scenario graphically** in the linked Visualizer window with a **4-view engineering layout**
10. **Save/load/share scenarios** as JSON files using a **normalized scenario contract**

---

## Scenario State Contract (v2.0)

All data flows through a **normalized scenario object** that acts as the central contract between the Calculator and Visualizer.

The Calculator is the **authoritative owner** of the scenario. Every calculation updates it. The Visualizer **renders only from the scenario** — no ad-hoc inputs.

### Scenario Shape

```
{
  version: '2.0',
  timestamp,
  sourceModule,           // which module last updated scenario
  timeInput,              // { utc, jd, unix }
  timeSystems,            // { utcISO, jd, mjd, unixMs, leapSeconds, taiJd, ttJd, gpsWeek, gpsTOW, gpsSeconds }
  bodies,                 // { earth: {...}, moon: {...}, sun: {...} }
  observers,              // [{ type, label, lat_deg, lon_deg, alt_m, ... }]
  targets,                // [{ type, label, lat_deg, lon_deg, alt_m, ... }]
  coordinateInputs,
  convertedCoordinates,
  illuminationResults,
  visibilityResults,
  orbitResults,           // generic orbit math outputs
  trackedObjectResults,   // tracked-object pipeline outputs (TLE/OMM)
  distanceResults,
  gridResults,
  selectedObjects,        // shared selection state for cross-pane highlighting
  layers,                 // layer toggle state
  settings,               // { precision, units, darkMode, cellSize_deg }
  notes,
  warnings,               // runtime accuracy warnings
  precisionLabels         // per-result precision tier labels
}
```

### Version Migration

Scenario v1.0 files are automatically migrated to v2.0 on import. The `migrateScenario()` function:
- Moves `tleResults` → `trackedObjectResults`
- Adds missing fields with safe defaults
- Stamps `version: '2.0'`

---

## Two-Window Design

| Window | File | Purpose |
|--------|------|---------|
| **A — Calculator** | `index.html` | Numeric inputs, conversions, tables, formulas, warnings |
| **B — Visualizer** | `visualizer.html` | 4-view engineering layout + classic map/orbit/geometry views |

The Calculator **owns** the authoritative scenario state. The Visualizer **subscribes** to it.

**Sync mechanism** (layered, most-to-least preferred):

1. **BroadcastChannel** (`space-moon-calc-sync`) — live real-time sync between tabs/windows in the same browser
2. **localStorage** (`spaceMoonCalcScenario`) — persists last scenario; Visualizer loads it on startup even if Calculator is not open
3. **Manual "Load Last" / "Resend"** buttons — fallback if automatic sync stalls

If a popup blocker prevents auto-opening the Visualizer, open `visualizer.html` manually — it will auto-load the last stored scenario from localStorage.

Both windows display sync status badges.

---

## 4-View Engineering Visualizer

The Visualizer's **default mode** is a 4-viewport engineering layout:

| Pane | Projection | View |
|------|-----------|------|
| **Top View** | Orthographic (Z-down) | X-Y plan view |
| **Side A** | Orthographic (X-down) | Y-Z side projection |
| **Side B** | Orthographic (Y-down) | X-Z side projection |
| **3D View** | Perspective | Rotatable pseudo-3D |

### Features
- All four panes render the **same scenario simultaneously**
- **Selecting an object** in one pane highlights it in **all panes**
- **Shared layer toggles** with optional per-pane overrides
- **Maximize** any single pane / **restore** 4-view layout
- **Fit All** / **Reset All** views
- **Object Inspector** sidebar shows selected object details

### Rendered Objects
- Earth body (at origin)
- Moon body (from scenario)
- Observer points (green markers)
- Target points (red markers)
- Tracked objects / satellites (blue markers with orbit arcs)
- Sightlines between observer-target pairs
- Coordinate grid with axis labels and scale bar

The **classic views** (Earth Map, Moon Map, Orbit Diagram, Geometry View, Combined) remain available as secondary tabs.

---

## Tracked Objects vs. Generic Orbit Math

These two pipelines are **clearly separated** in both code and UI.

### Pipeline 1 — Generic Orbit Math (Space/Orbital tab)
- COE ↔ Cartesian state vectors
- Vis-viva equation
- Hohmann transfer ΔV
- Plane change ΔV
- Orbital period, velocity, mean motion
- Anomaly conversions (M → E → ν)
- RTN / LVLH frame

### Pipeline 2 — Tracked Objects (Tracked Objects tab)
- **TLE parsing** — extracts NORAD catalog number, epoch, Keplerian elements, BSTAR
- **OMM parsing** — CelesTrak GP JSON format
- **Simplified propagation** — two-body Keplerian (clearly labeled as **not SGP4**)
- Results include **model badges** showing propagation model
- Results route to `scenario.trackedObjectResults` (not `orbitResults`)
- Visualizer renders tracked-object positions and orbit arcs from this dedicated pipeline

### Accuracy Labels for Tracked Objects

Every tracked-object result displays:
- **Source type**: TLE or OMM
- **Propagation model**: Keplerian (two-body) — NOT SGP4
- **Model badge**: visible warning that results are approximate educational interpretations
- **Precision label**: "Simplified educational approximation"

> **SGP4 is not implemented** in this version. The code is architected for future drop-in SGP4 support — vendor `satellite.js` into `js/vendor/` and update `tle.js`.

---

## How to Run Locally

### Option 1 — Open directly (simplest)

```bash
open index.html        # macOS
xdg-open index.html    # Linux
start index.html       # Windows
```

> **Note:** Some browsers block ES module imports from `file://` URLs. If you see module errors, use Option 2.

### Option 2 — Tiny local server (recommended)

```bash
# Python 3
python3 -m http.server 8080
# then open http://localhost:8080

# Node.js (npx)
npx serve .
```

Open `http://localhost:8080` for the Calculator. The Visualizer button will open `visualizer.html` automatically.

---

## Accuracy Limits

Every calculation is labeled with one of three precision tiers:

| Label | Meaning |
|-------|---------|
| **Exact conversion** | Mathematically exact by definition (e.g. TAI = UTC + leap seconds) |
| **Standard engineering approximation** | WGS84 geodetic/ECEF, simplified GMST rotation, two-body orbital mechanics |
| **Simplified educational model** | Analytic Sun direction, simplified Moon position (Meeus truncated), lunar sub-Earth point, TLE/OMM two-body propagation |

**Full precision** for many operations would require:
- Live Earth Orientation Parameters (EOP)
- High-fidelity ephemerides (e.g. JPL DE440)
- SGP4/SDP4 for tracked-object propagation
- IERS Conventions for precise frame transformations

---

## Supported Systems

### Time Systems
- UTC, TAI, TT, GPS Time (week + TOW), Unix timestamp (ms), Julian Date (JD), Modified Julian Date (MJD), ISO 8601
- Leap-second table included through 2017-01-01 (offset 37 s)

### Earth Coordinates
- Geodetic latitude / longitude / altitude (WGS84)
- ECEF Cartesian (m)
- ECI (simplified GMST rotation, labeled)
- ENU local topocentric
- Azimuth / Elevation / Range
- Great-circle distance and bearing
- Day/night status, local solar time, nominal timezone band

### Moon Coordinates
- Selenographic latitude / longitude / altitude
- Lunar body-fixed Cartesian
- Earth-facing / sunlit determination
- Sub-Earth and subsolar point (simplified analytic)
- Earth elevation at lunar surface point

### Generic Orbital Mechanics
- Classical Orbital Elements (COE): a, e, i, Ω, ω, ν
- State vector (position + velocity)
- Vis-viva, circular/escape velocity
- Hohmann transfer ΔV, plane change ΔV
- RTN frame

### Tracked Objects
- TLE parsing and validation
- OMM (JSON) parsing and validation
- Simplified two-body propagation (**not SGP4** — clearly labeled)
- Subpoint estimation and altitude
- Model badges on all results

---

## File Structure

```
CELES-CALC/
├── index.html          # Window A: Calculator
├── visualizer.html     # Window B: Visualizer (4-view default)
├── style.css           # Shared styles (dark/light themes)
├── visualizer.css      # Visualizer-specific styles
├── app.js              # Calculator entry point
├── visualizer.js       # Visualizer entry point
├── README.md
├── formulas.md         # Formula reference
└── js/
    ├── constants.js    # Physical/math constants
    ├── units.js        # Unit conversions
    ├── time.js         # Time system conversions
    ├── earth.js        # Earth coordinate functions
    ├── moon.js         # Moon coordinate functions
    ├── orbit.js        # Generic orbital mechanics (Pipeline 1)
    ├── tle.js          # TLE parsing + propagation (Pipeline 2)
    ├── omm.js          # OMM parsing + validation (Pipeline 2)
    ├── visibility.js   # Visibility & line-of-sight
    ├── grids.js        # Lunar grid cell calculations
    ├── scenario.js     # Scenario state model (v2.0 contract)
    ├── sync.js         # Cross-window sync
    ├── ui.js           # Calculator UI helpers
    ├── visuals.js      # Classic canvas drawing functions
    ├── visualizer-ui.js # Visualizer window logic
    ├── sample-data.js  # Sample scenarios & presets
    ├── projection.js   # Orthographic + perspective projection math
    ├── camera.js       # Camera/view state management
    ├── interaction.js  # Shared selection/hover state
    ├── layers.js       # Layer toggle management
    ├── renderer-core.js # Shared rendering primitives
    ├── renderer-top.js  # Top view renderer (X-Y)
    ├── renderer-side-a.js # Side A renderer (Y-Z)
    ├── renderer-side-b.js # Side B renderer (X-Z)
    └── renderer-3d.js  # 3D perspective renderer
```

---

## How Sync Works

```
Calculator (index.html)
  ├─ Every calculation → _patchScenario() → syncPublish()
  │     ├─ BroadcastChannel.postMessage(scenario)
  │     └─ localStorage.setItem('spaceMoonCalcScenario', JSON.stringify(scenario))
  └─ Scenario version: 2.0 (auto-migrates from 1.0)

Visualizer (visualizer.html)
  ├─ On startup → loadLastScenario() from localStorage
  ├─ BroadcastChannel.onmessage → updateVisualizerFromScenario(scenario)
  ├─ Renders from scenario only (no ad-hoc inputs)
  └─ "Load Last" button → reads localStorage
```

---

## How to Extend

1. **Add a new coordinate system**: add functions to the relevant module, wire up inputs in `index.html`, add handler in `app.js`, update `buildScenarioState()` in `scenario.js`, add rendering in renderers.
2. **Add SGP4**: vendor `satellite.js` into `js/vendor/`, update `tle.js` propagation functions to use SGP4 instead of two-body. Update model badges to reflect SGP4/TEME-derived results.
3. **Add real ephemerides**: replace analytic functions in `moon.js`/`earth.js` with ephemeris lookups.
4. **Add new visualizer layers**: update `layers.js` `DEFAULT_LAYERS`, add rendering in `renderer-core.js` and each view renderer.
5. **Add per-pane layer overrides**: use `setPaneOverride()` / `clearPaneOverride()` in `layers.js`.

---

## Known Limitations

- GMST/ECI rotation is simplified (no polar motion, no UT1-UTC correction)
- Moon position uses truncated Meeus series (~0.3° accuracy)
- TLE/OMM propagation is simplified two-body (**no SGP4** — errors grow ~km/day in LEO)
- Leap seconds table is static through 2017
- No political timezone map (only nominal geometric bands)
- No EOP or light-time correction
- 3D view uses canvas-based pseudo-perspective (not WebGL)
- OMM fetching requires network access to CelesTrak (may be blocked by CORS in some environments)

---

## Future Roadmap

- Bundle real SGP4 library (satellite.js)
- JPL DE440 ephemeris support
- Political timezone database
- Mars coordinate support
- Ground track plotting
- Conjunction detection
- Export graphics as PNG/SVG
- Mobile-friendly layout
- WebGL-based 3D view upgrade
- Per-pane camera persistence
