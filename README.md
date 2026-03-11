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
7. **Run orbital helper calculations** — Hohmann transfer, plane change ΔV, vis-viva, COE ↔ state vector
8. **Parse and propagate TLEs** — extract TLE fields, simplified two-body propagation
9. **See the scenario graphically** in the linked Visualizer window (Window B)
10. **Save/load/share scenarios** as JSON files

---

## Two-Window Design

| Window | File | Purpose |
|--------|------|---------|
| **A — Calculator** | `index.html` | Numeric inputs, conversions, tables, formulas, warnings |
| **B — Visualizer** | `visualizer.html` | Canvas graphics: Earth map, Moon map, orbit diagram, geometry view |

The Calculator **owns** the authoritative scenario state. The Visualizer **subscribes** to it.

**Sync mechanism** (layered, most-to-least preferred):

1. **BroadcastChannel** (`space-moon-calc-sync`) — live real-time sync between tabs/windows in the same browser
2. **localStorage** (`spaceMoonCalcScenario`) — persists last scenario; Visualizer loads it on startup even if Calculator is not open
3. **Manual "Resend to Visualizer"** button — fallback if automatic sync stalls

If a popup blocker prevents auto-opening the Visualizer, open `visualizer.html` manually — it will auto-load the last stored scenario from localStorage.

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
| **Simplified educational model** | Analytic Sun direction, simplified Moon position (Meeus truncated), lunar sub-Earth point |

**Full precision** for many operations would require live Earth Orientation Parameters (EOP), high-fidelity ephemerides (e.g. JPL DE440), and the IERS Conventions.

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

### Orbital
- Classical Orbital Elements (COE): a, e, i, Ω, ω, ν
- State vector (position + velocity)
- Vis-viva, circular/escape velocity
- Hohmann transfer ΔV, plane change ΔV
- RTN frame
- TLE parsing + simplified two-body propagation (not SGP4)

---

## File Structure

```
CELES-CALC/
├── index.html          # Window A: Calculator
├── visualizer.html     # Window B: Visualizer
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
    ├── orbit.js        # Orbital mechanics
    ├── tle.js          # TLE parsing + propagation
    ├── visibility.js   # Visibility & line-of-sight
    ├── grids.js        # Lunar grid cell calculations
    ├── scenario.js     # Scenario state model
    ├── sync.js         # Cross-window sync
    ├── ui.js           # Calculator UI helpers
    ├── visuals.js      # Canvas drawing functions
    ├── visualizer-ui.js # Visualizer window logic
    └── sample-data.js  # Sample scenarios & presets
```

---

## How Sync Works

```
Calculator (index.html)
  ├─ Every calculation → buildScenarioState() → publishScenarioState()
  │     ├─ BroadcastChannel.postMessage(scenario)
  │     └─ localStorage.setItem('spaceMoonCalcScenario', JSON.stringify(scenario))
  └─ "Resend to Visualizer" button → explicit republish

Visualizer (visualizer.html)
  ├─ On startup → loadLastScenario() from localStorage
  ├─ BroadcastChannel.onmessage → updateVisualizerFromScenario(scenario)
  └─ "Use current calculator state" button → reads localStorage
```

---

## How to Extend

1. **Add a new coordinate system**: add functions to the relevant module, wire up inputs in `index.html`, add handler in `app.js`, update `buildScenarioState()` in `scenario.js`, add rendering in `visuals.js`.
2. **Add SGP4**: vendor `satellite.js` into `js/vendor/`, update `tle.js` to use it.
3. **Add real ephemerides**: replace analytic functions in `moon.js`/`earth.js` with ephemeris lookups.

---

## Known Limitations

- GMST/ECI rotation is simplified (no polar motion, no UT1-UTC correction)
- Moon position uses truncated Meeus series (~0.3° accuracy)
- TLE propagation is simplified two-body (no SGP4)
- Leap seconds table is static through 2017
- No political timezone map (only nominal geometric bands)
- No EOP or light-time correction

---

## Future Roadmap

- Bundle real SGP4 library
- JPL DE440 ephemeris support
- Political timezone database
- Mars coordinate support
- Ground track plotting
- Conjunction detection
- Export graphics as PNG/SVG
- Mobile-friendly layout
