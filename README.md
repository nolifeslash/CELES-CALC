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
11. **RF link budget analysis** — per-hop link budget with FSPL, atmospheric losses, C/N₀, Eb/N₀, margin, and throughput estimates
12. **Ground station comparison & optimization** — rank and select ground stations by weighted score across margin, throughput, latency, resilience
13. **Interference & jamming assessment** — simplified contested-RF analysis with J/S, J/N, degradation state, and mitigation comparison
14. **SIGINT opportunity assessment** — geometry-plus-signal-strength collection opportunity scoring (educational model only)
15. **Launch-to-orbit feasibility** — launch azimuth, Earth rotation benefit, delta-V estimates, vehicle suitability
16. **Orbit-to-orbit transfer planning** — Hohmann, bi-elliptic, plane change, and combined transfer comparison
17. **Phasing & RPO planning** — phasing orbit calculation, rendezvous opportunity, servicing mission planning
18. **Lunar transfer planning** — TLI/LOI delta-V estimates, transfer duration, mission leg sequencing
19. **Mission delta-V budgets** — structured budget builder with standard mission presets
20. **Launch window search** — simplified MVP: coarse scan with inclination feasibility + RAAN proximity scoring, ranked results, per-window accept/reject reasons
21. **Infrastructure Browser** — browse, filter, and inspect a source-backed seed database of launch sites, ground stations, TT&C stations, and network operators; select records to use in RF or launch analysis

---

## Infrastructure Database

CELES-CALC includes a **source-aware infrastructure planning database** for space operations infrastructure.

### Entity Types

| Entity | Description |
|---|---|
| `launch_site` | Orbital launch facilities (location, vehicle classes, azimuth/inclination notes) |
| `ground_station` | Tracking and data-downlink stations (antennas, bands, capabilities) |
| `ttc_station` | Telemetry, tracking, and command stations (services, bands, network) |
| `network_operator` | Operator/network records linking stations to organizations |

### Data Model

Every record includes:
- **Identity** — `id`, `name`, `aliases`, `operator`, `country`
- **Location** — `lat_deg`, `lon_deg`, `elevation_m`
- **Status** — `active` / `historical` / `proposed`
- **Capability fields** — bands, services, vehicle classes, antennas
- **Provenance** — `sourceRecords[]` with source title, date, and per-source confidence
- **Confidence** — overall `confidence` score in [0, 1]; `high` ≥ 0.9, `medium` ≥ 0.7, `low` < 0.7
- **Tags / notes** — free-text fields for context and caveats

### Seed Data Coverage (MVP)

The current database contains:
- **10 launch sites**: Cape Canaveral, Baikonur, Guiana Space Centre, Vandenberg, Tanegashima, Plesetsk, Satish Dhawan (Sriharikota), Jiuquan, Wenchang, SpaceX Starbase
- **9 ground stations**: Goldstone, Canberra, Madrid (DSN); Svalbard (KSAT); Hartebeesthoek (SANSA); New Norcia, Cebreros (ESA/ESTRACK); Uchinoura (JAXA); Perth (NASA/CSIRO)
- **6 TT&C stations**: Kiruna (ESTRACK/ESA); White Sands (NASA/TDRS); ISTRAC Bangalore (ISRO); Cebreros TT&C (ESA); Aussaguel (CNES); Uchinoura (JAXA)
- **6 network operators**: NASA DSN, KSAT, ESA ESTRACK, CNES, JAXA, NASA Space Network (TDRS)

**Important:** This is a **starter seed database**, not global completeness. Coverage will expand in future passes. Treat all records as planning-grade approximations unless the source record explicitly states higher precision.

### Source and Confidence Policy

- Values marked `confidence ≥ 0.9` come from official documentation (DSN Handbook, ESA ESTRACK, operator fact sheets)
- Values marked `confidence < 0.8` are secondary or aggregated — use with caution
- If a technical field is not publicly documented, the record omits it or provides a conservative approximation with an explanatory note
- The database does not claim to represent hidden capabilities, classified systems, or non-public technical parameters

### Infrastructure Browser UI

The **Infrastructure** tab provides:
- Sub-tab browsing for each entity type (Launch Sites, Ground Stations, TT&C Stations, Operators)
- Filters by status, country, RF band, operator type, and free-text search
- Inspector panel showing full record details including source list and confidence
- **"Use in RF Comparison"** button — pushes a selected ground/TTC station into the RF station comparison
- **"Use in Launch Planner"** button — loads a launch site into the launch planning workflow
- Global search across all entity types
- **Validate tab** — runs `validateInfrastructure()` in-browser to check schema and behavioral integrity

### RF Integration

The station comparison tool in the RF/SATCOM tab now uses the infrastructure database:
- Candidate stations come from `GROUND_STATIONS` + `TTC_STATIONS`
- `normalizeForRFEval()` converts each record into the format expected by the weighted optimizer
- Antenna gain is selected for the requested band (highest-gain antenna for that band, fallback to overall best)
- Cost index is derived from operator type (governmental: 0.8, KSAT commercial: 1.0, other: 1.2)
- Results table includes a Confidence column

### Visualizer Overlays

The visualizer renders infrastructure markers on **all four engineering views** (Top, Side A, Side B, 3D):
- 🔴 **Launch sites** (orange-red, `infraLaunchSites` layer)
- 🔵 **Ground stations** (blue, `infraGroundStations` layer)
- 🟣 **TT&C stations** (purple, `infraTTCStations` layer)

Toggle visibility using the layer checkboxes in the visualizer sidebar. Labels show when the Labels layer is active.

### Validation

`js/infra-validate.js` provides:
- `validateInfrastructure()` / `runInfrastructureSmokeChecks()` for data/schema integrity checks
- `runUiSmokeChecks()` for lightweight Infrastructure-tab UI wiring checks
- `runRfIntegrationSmokeChecks()` for selected-station → RF ranking integration checks
- `runLaunchPlannerSmokeChecks()` for feasible/infeasible launch-window sanity checks
- `runScenarioRoundTripChecks()` for scenario import/export branch-preservation checks

Infrastructure checks cover:
- Required fields present on all records
- Coordinate plausibility
- Confidence values in [0, 1]
- Source record presence
- ID uniqueness
- Filter function determinism
- RF normalization output completeness

Run the checks at any time from the **Infrastructure → Validate** sub-tab in the Calculator.

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
  precisionLabels,        // per-result precision tier labels
  rfScenario,             // RF scenario configuration
  links,                  // [] link budget results
  networkRoutes,          // [] route comparison results
  interferenceResults,    // interference/jamming assessments
  jammingResults,         // jamming-specific results
  sigintResults,          // SIGINT opportunity assessments
  groundStationRecommendations, // [] ranked station list
  launchScenario,         // launch configuration
  launchWindows,          // [] launch window candidates
  launchSolutions,        // [] ranked launch solutions
  rpoPlans,               // [] RPO/phasing plans
  transferPlans,          // [] transfer plan options
  missionLegs,            // [] mission leg sequence
  deltaVBudget,           // structured delta-V budget
  infrastructure: {       // infrastructure selection state
    selectedStation,      // normalizeForRFEval() output for selected GS/TTC
    selectedLaunchSite,   // selected launch site record
  }
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

---

## RF / SATCOM / SIGINT (Expansion 1)

The SATCOM expansion adds practical RF link planning, ground station optimization, interference analysis, and SIGINT opportunity assessment.

| Feature | Module | Precision |
|---------|--------|-----------|
| Link budget (per-hop) | `js/link-budget.js` | Standard engineering approximation |
| Atmospheric loss presets | `js/atmosphere.js` | Engineering approximation (not ITU-R) |
| Antenna gain/beamwidth | `js/antennas.js` | Standard engineering approximation |
| Ground station ranking | `js/groundstations.js` | Simplified scoring model |
| Interference/jamming | `js/interference.js` | Simplified educational model |
| Route comparison | `js/satcom-network.js` | Engineering approximation |
| Service quality | `js/quality.js` | Simplified classification |
| SIGINT opportunity | `js/sigint.js` | Simplified educational model |

Seven service profiles and seven weather/climate presets are defined in `data/service-profiles.sample.json` and `data/weather-profiles.sample.json`.

> **Accuracy note:** The RF models use simplified engineering approximations. They do NOT implement full ITU-R propagation models. The SIGINT module is educational only — not intelligence-grade.

---

## Launch / Transfer / RPO (Expansion 2)

The launch expansion adds mission access planning, orbit transfer calculations, RPO planning, and lunar transfer estimation.

| Feature | Module | Precision |
|---------|--------|-----------|
| Launch site access | `js/launch-sites.js` | Standard engineering approximation |
| Vehicle suitability | `js/launch-vehicles.js` | Simplified classification |
| Launch-to-orbit | `js/launch-planner.js` | Simplified engineering approximation |
| Window search | `js/window-search.js` | Simplified MVP — inclination + RAAN proximity scoring |
| Orbit transfer | `js/transfer-planner.js` | Two-body (Keplerian) |
| Phasing / RPO | `js/phasing.js` | Simplified educational approximation |
| Delta-V budget | `js/delta-v-budget.js` | Standard engineering approximation |
| Mission sequencing | `js/mission-sequencer.js` | Planning framework |
| Lunar transfer | `js/lunar-transfer.js` | Simplified patched-two-body |

Stub architecture for future expansion: `js/lambert.js`, `js/porkchop.js`, `js/interplanetary.js`.

> **Accuracy note:** Launch calculations are mission-planning access tools, NOT full dynamics solvers. Window search uses a simplified coarse scan with inclination feasibility and RAAN proximity scoring (RAAN ≈ GMST + site longitude — zeroth-order approximation). Lunar transfer uses simplified patched-two-body, not full cislunar optimization.

---

## Data Infrastructure

Sample infrastructure data files are in the `data/` directory:

| File | Contents |
|------|----------|
| `data/launch-sites.sample.json` | 5 launch sites with coordinates, capabilities (schema reference) |
| `data/ground-stations.sample.json` | 5 ground stations with antenna specs (schema reference) |
| `data/ttc-stations.sample.json` | 3 TT&C stations (schema reference) |
| `data/network-operators.sample.json` | 3 network operators (schema reference) |
| `data/launch-vehicles.sample.json` | 5 vehicle profiles (small → tug) |
| `data/bands.sample.json` | 7 RF band definitions |
| `data/service-profiles.sample.json` | 7 service profiles |
| `data/weather-profiles.sample.json` | 7 weather presets |

> **Note:** The active seed data is embedded directly in `js/infrastructure.js` (10 launch sites, 9 ground stations, 6 TT&C stations, 6 operators). The `data/*.sample.json` files are schema-reference snapshots of the original MVP records.

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

> **Note:** Some browsers block ES module imports from `file://` URLs. If you see module errors, use Option 2 or 3.

### Option 2 — serve.py (recommended — zero dependencies)

```bash
python3 serve.py            # http://localhost:8080  (auto-opens browser)
python3 serve.py 9000       # use a custom port
```

`serve.py` is included in the repository root. It uses only the Python 3 standard library — no `pip install` required. It automatically opens the Calculator in your default browser.

### Option 3 — Other local servers

```bash
# Recommended Python built-in static server
python -m http.server 8000
# Windows launcher equivalent
py -m http.server 8000
# Explicit python3 binary
python3 -m http.server 8000
# then open http://localhost:8000

# Node.js (npx)
npx serve .
```

Open `http://localhost:8000` for the Calculator. The Visualizer button will open `visualizer.html` automatically.
You can also open both windows directly:
- Calculator: `http://localhost:8000/index.html`
- Visualizer: `http://localhost:8000/visualizer.html`

> **Why local HTTP mode is preferred:** module loading, two-window Calculator↔Visualizer sync (`BroadcastChannel` + `localStorage`), and popup/open-window behavior are more reliable under `http://localhost` than direct `file://` opening.

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
├── serve.py            # Zero-dependency local dev server (Python 3)
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
    ├── renderer-3d.js  # 3D perspective renderer
    ├── rf-constants.js # RF band definitions & modulation presets
    ├── link-budget.js  # Per-hop link budget engine
    ├── atmosphere.js   # Atmospheric/propagation loss presets
    ├── antennas.js     # Antenna models & gain calculations
    ├── interference.js # Interference & jamming assessment
    ├── quality.js      # Service quality translation
    ├── satcom-network.js # Route comparison (direct/relay/ISL)
    ├── groundstations.js # Ground station ranking & optimization
    ├── sigint.js       # SIGINT opportunity assessor
    ├── optimizer.js    # Generic weighted optimizer
    ├── launch-sites.js # Launch site data & access logic
    ├── launch-vehicles.js # Vehicle profiles & suitability
    ├── launch-planner.js  # Launch-to-orbit feasibility
    ├── window-search.js   # Generic window search engine
    ├── transfer-planner.js # Orbit-to-orbit transfer planning
    ├── phasing.js      # Phasing & RPO planning
    ├── delta-v-budget.js # Mission delta-V budget builder
    ├── mission-sequencer.js # Mission leg sequencing
    ├── lunar-transfer.js # Earth-to-Moon transfer MVP
    ├── infrastructure.js  # Infrastructure seed data + filtering/RF normalization
    ├── infrastructure-browser.js # Infrastructure browser/filter/inspector UI
    ├── infra-validate.js  # Lightweight schema & behavioral validation
    ├── lambert.js      # (stub) Lambert orbit solver
    ├── porkchop.js     # (stub) Porkchop plot generator
    └── interplanetary.js # (stub) Interplanetary transfer
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
6. **Extend the infrastructure database**: add records to `js/infrastructure.js` `LAUNCH_SITES`, `GROUND_STATIONS`, `TTC_STATIONS`, or `NETWORK_OPERATORS`. Follow the existing schema; include `sourceRecords` and `confidence` on every new record. Run `validateInfrastructure()` to verify.
7. **Deepen RF integration**: update `normalizeForRFEval()` in `infrastructure.js` to incorporate additional fields (e.g., automationLevel, redundancyClass) into the optimizer inputs.

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
- Infrastructure database is seed-only (31 records total in this pass) — not a global directory
- Infrastructure visualizer overlays use simplified ECEF positioning (no LMST rotation) — positions are geographic, not sidereal-time-corrected
- Station comparison scoring is a heuristic model (no measured link budgets)

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
