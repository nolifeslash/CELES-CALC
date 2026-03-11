/**
 * @file sample-data.js
 * @module sample-data
 * @description Sample scenarios, TLEs, and preset locations for CELES-CALC.
 *
 * All sample scenarios follow the ScenarioObject schema from scenario.js.
 * TLE epoch values are illustrative — update them from a live source
 * (e.g. CelesTrak) for operational use.
 */

// ─── Sample TLEs ─────────────────────────────────────────────────────────────

/**
 * Representative Two-Line Elements for common satellites.
 * These are example epoch data for educational / testing purposes.
 * Fetch current TLEs from CelesTrak or Space-Track for operational use.
 */
export const SAMPLE_TLES = {
  iss: {
    name: 'ISS (ZARYA)',
    noradId: 25544,
    line1: '1 25544U 98067A   24165.51851852  .00012345  00000-0  22306-3 0  9994',
    line2: '2 25544  51.6403 147.1824 0004256  83.4717  35.8101 15.50117619456789',
    description: 'International Space Station — ~408 km LEO, 51.6° inclination.',
  },
  noaa19: {
    name: 'NOAA 19',
    noradId: 33591,
    line1: '1 33591U 09005A   24165.50000000  .00000082  00000-0  66246-4 0  9998',
    line2: '2 33591  99.1742 252.3718 0014081 102.5145 257.7460 14.12335648790123',
    description: 'NOAA-19 weather satellite — ~870 km sun-synchronous polar orbit.',
  },
  gpsPRN11: {
    name: 'GPS BIIR-3 (PRN 11)',
    noradId: 25933,
    line1: '1 25933U 99055A   24165.50000000 -.00000048  00000-0  00000-0 0  9994',
    line2: '2 25933  55.2236 215.6884 0168750  79.4234 282.5028  2.00567034179876',
    description: 'GPS Block IIR satellite — ~20 200 km MEO, 55° inclination.',
  },
  molniya: {
    name: 'MOLNIYA 1-91',
    noradId: 25847,
    line1: '1 25847U 99039A   24165.50000000 -.00000136  00000-0  00000-0 0  9992',
    line2: '2 25847  63.3802 223.4516 7276410 281.5271  10.4512  2.00602430182345',
    description: 'Molniya-orbit satellite — highly elliptical, 63.4° inclination.',
  },
};

// ─── Preset locations ─────────────────────────────────────────────────────────

/**
 * Commonly used geographic and selenographic reference points.
 */
export const PRESET_LOCATIONS = {
  // ── Earth surface ──────────────────────────────────────────────────────────
  helsinki: {
    lat: 60.1699, lon: 25.0282, alt: 0,
    name: 'Helsinki, Finland',
    type: 'earth_surface',
    note: 'Capital of Finland; 60°N, 25°E.',
  },
  greenwich: {
    lat: 51.4769, lon:  0.0005, alt: 46,
    name: 'Royal Observatory, Greenwich',
    type: 'earth_surface',
    note: 'Prime meridian reference point.',
  },
  houston: {
    lat: 29.5614, lon: -95.0825, alt: 15,
    name: 'Johnson Space Center, Houston TX',
    type: 'earth_surface',
    note: 'NASA JSC mission control.',
  },
  kourou: {
    lat: 5.2322, lon: -52.7736, alt: 14,
    name: 'Guiana Space Centre, Kourou',
    type: 'earth_surface',
    note: 'ESA launch site, near equator.',
  },
  baikonur: {
    lat: 45.9200, lon: 63.3420, alt: 90,
    name: 'Baikonur Cosmodrome',
    type: 'earth_surface',
    note: 'Kazakhstan; Soyuz / Proton launch site.',
  },
  canaveral: {
    lat: 28.4622, lon: -80.5272, alt: 3,
    name: 'Cape Canaveral / KSC',
    type: 'earth_surface',
    note: 'NASA / SpaceX launch complex.',
  },
  northPole: {
    lat:  90.0, lon: 0.0, alt: 0,
    name: 'North Pole',
    type: 'earth_surface',
    note: 'Geographic north pole.',
  },
  southPole: {
    lat: -90.0, lon: 0.0, alt: 2_835,
    name: 'South Pole (Amundsen–Scott Station)',
    type: 'earth_surface',
    note: 'Antarctic plateau, ~2835 m elevation.',
  },
  // ── Lunar surface ──────────────────────────────────────────────────────────
  apollo11: {
    lat:  0.6741, lon: 23.4733, alt: 0,
    name: 'Apollo 11 Landing Site (Mare Tranquillitatis)',
    type: 'moon_surface',
    note: 'First crewed lunar landing: 1969-07-20 (EDT) / 1969-07-21 02:56 UTC.',
  },
  apollo12: {
    lat: -3.0128, lon: -23.4219, alt: 0,
    name: 'Apollo 12 Landing Site (Oceanus Procellarum)',
    type: 'moon_surface',
  },
  apollo14: {
    lat: -3.6454, lon: -17.4713, alt: 0,
    name: 'Apollo 14 Landing Site (Fra Mauro)',
    type: 'moon_surface',
  },
  apollo15: {
    lat: 26.1322, lon:  3.6339, alt: 0,
    name: 'Apollo 15 Landing Site (Hadley Rille)',
    type: 'moon_surface',
  },
  apollo16: {
    lat: -8.9734, lon: 15.5011, alt: 0,
    name: 'Apollo 16 Landing Site (Descartes Highlands)',
    type: 'moon_surface',
  },
  apollo17: {
    lat: 20.1911, lon: 30.7723, alt: 0,
    name: 'Apollo 17 Landing Site (Taurus–Littrow)',
    type: 'moon_surface',
  },
  lunarNorthPole: {
    lat:  89.9, lon: 0.0, alt: 0,
    name: 'Lunar North Pole (approx.)',
    type: 'moon_surface',
  },
  lunarSouthPole: {
    lat: -89.9, lon: 0.0, alt: 0,
    name: 'Lunar South Pole (approx.)',
    type: 'moon_surface',
    note: 'Target region for Artemis and ISRO Chandrayaan missions.',
  },
  shackletonCrater: {
    lat: -89.67, lon: 0.0, alt: 0,
    name: 'Shackleton Crater rim',
    type: 'moon_surface',
    note: 'Near-permanent sunlight on rim; permanently shadowed interior.',
  },
  subEarth: {
    lat: 0.0, lon: 0.0, alt: 0,
    name: 'Sub-Earth Point (mean)',
    type: 'moon_surface',
    note: 'Selenographic origin; faces Earth.',
  },
};

// ─── Sample scenarios ─────────────────────────────────────────────────────────

/**
 * Complete sample scenario objects illustrating common CELES-CALC use cases.
 * Each scenario follows the ScenarioObject schema from scenario.js.
 */
export const SAMPLE_SCENARIOS = {
  // ── Coordinate conversion ────────────────────────────────────────────────
  helsinki_coordinates: {
    version:   '1.0',
    timestamp: '2024-06-14T12:00:00.000Z',
    timeInput: { utc: '2024-06-14T12:00:00.000Z', jd: 2_460_475.0, unix: 1_718_366_400_000 },
    timeSystems: {
      utcISO: '2024-06-14T12:00:00.000Z', jd: 2_460_475.0, mjd: 60_474.5,
      unixMs: 1_718_366_400_000, leapSeconds: 37,
      taiJd: 2_460_475.000_428, ttJd: 2_460_475.000_800,
      gpsWeek: 2319, gpsTOW: 388837.0, gpsSeconds: 1_400_257_637.0,
    },
    bodies: { earth: {}, moon: {}, sun: {} },
    observers: [{
      type:    'earth_surface',
      label:   'Helsinki',
      lat_deg: 60.1699,
      lon_deg: 25.0282,
      alt_m:   0,
    }],
    targets: [],
    coordinateInputs: {
      input: { lat: 60.1699, lon: 25.0282, alt: 0, system: 'geodetic_WGS84' },
    },
    convertedCoordinates: {
      geodetic:  { lat_deg: 60.1699, lon_deg: 25.0282, alt_m: 0 },
      ecef_m:    { x: 2_892_113.4, y: 1_342_024.9, z: 5_511_039.2 },
      eci_m:     { x: null, y: null, z: null, note: 'JD required' },
    },
    visibilityResults: [], illuminationResults: [],
    orbitResults: {}, distanceResults: {}, gridResults: {}, tleResults: {},
    settings: { precision: 'standard', units: 'metric', darkMode: true, cellSize_deg: 5 },
    notes: 'Convert Helsinki geodetic coordinates to ECEF and ECI.',
  },

  // ── Apollo 11 landing site ───────────────────────────────────────────────
  lunar_landing_site: {
    version:   '1.0',
    timestamp: '2024-06-14T12:00:00.000Z',
    timeInput: { utc: '2024-06-14T12:00:00.000Z', jd: 2_460_475.0, unix: 1_718_366_400_000 },
    timeSystems: {
      utcISO: '2024-06-14T12:00:00.000Z', jd: 2_460_475.0, mjd: 60_474.5,
      unixMs: 1_718_366_400_000, leapSeconds: 37,
      taiJd: 2_460_475.000_428, ttJd: 2_460_475.000_800,
      gpsWeek: 2319, gpsTOW: 388837.0, gpsSeconds: 1_400_257_637.0,
    },
    bodies: { earth: {}, moon: {}, sun: {} },
    observers: [{
      type:    'moon_surface',
      label:   'Apollo 11 Landing Site',
      lat_deg: 0.6741,
      lon_deg: 23.4733,
      alt_m:   0,
    }],
    targets: [{ type: 'earth_from_moon', label: 'Earth direction' }],
    coordinateInputs: {
      input: { lat: 0.6741, lon: 23.4733, system: 'selenographic' },
    },
    convertedCoordinates: {
      selenographic:  { lat_deg: 0.6741,  lon_deg: 23.4733, alt_m: 0 },
      lunarFixed_m:   { x: 1_594_345.0,  y:  687_743.0, z:  20_390.0 },
    },
    visibilityResults: [], illuminationResults: [],
    orbitResults: {}, distanceResults: {}, gridResults: {}, tleResults: {},
    settings: { precision: 'standard', units: 'metric', darkMode: true, cellSize_deg: 5 },
    notes: 'Apollo 11 Mare Tranquillitatis landing site coordinates and Earth-facing visibility.',
  },

  // ── Hohmann transfer LEO → GEO ───────────────────────────────────────────
  hohmann_transfer: {
    version:   '1.0',
    timestamp: '2024-06-14T12:00:00.000Z',
    timeInput: { utc: '2024-06-14T12:00:00.000Z', jd: 2_460_475.0, unix: 1_718_366_400_000 },
    timeSystems: {
      utcISO: '2024-06-14T12:00:00.000Z', jd: 2_460_475.0, mjd: 60_474.5,
      unixMs: 1_718_366_400_000, leapSeconds: 37,
      taiJd: 2_460_475.000_428, ttJd: 2_460_475.000_800,
      gpsWeek: 2319, gpsTOW: 388837.0, gpsSeconds: 1_400_257_637.0,
    },
    bodies: { earth: {}, moon: {}, sun: {} },
    observers: [], targets: [],
    coordinateInputs: {},
    convertedCoordinates: {},
    visibilityResults: [],
    illuminationResults: [],
    orbitResults: {
      hohmann: {
        type:          'hohmann_transfer',
        r1_m:          6_778_137,       // LEO ~400 km
        r2_m:         42_164_170,       // GEO
        deltaV1_m_s:   2_425.3,         // first burn
        deltaV2_m_s:   1_478.2,         // second burn
        totalDeltaV_m_s: 3_903.5,
        transferTime_s:  18_927.0,
        transferTime_hr: 5.257,
        semiMajorAxis_m: 24_471_153,
        note:          'Ideal coplanar Hohmann, two-body, no inclination change.',
      },
    },
    distanceResults: {}, gridResults: {}, tleResults: {},
    settings: { precision: 'standard', units: 'metric', darkMode: true, cellSize_deg: 5 },
    notes: 'LEO (400 km) to GEO (35 786 km) Hohmann transfer Δv budget.',
  },

  // ── ISS visibility from Helsinki ─────────────────────────────────────────
  iss_visibility: {
    version:   '1.0',
    timestamp: '2024-06-14T20:30:00.000Z',
    timeInput: { utc: '2024-06-14T20:30:00.000Z', jd: 2_460_475.3542, unix: 1_718_397_000_000 },
    timeSystems: {
      utcISO: '2024-06-14T20:30:00.000Z', jd: 2_460_475.3542, mjd: 60_474.854,
      unixMs: 1_718_397_000_000, leapSeconds: 37,
      taiJd: 2_460_475.354_656, ttJd: 2_460_475.355_029,
      gpsWeek: 2319, gpsTOW: 419637.0, gpsSeconds: 1_400_288_437.0,
    },
    bodies: { earth: {}, moon: {}, sun: {} },
    observers: [{
      type:    'earth_surface',
      label:   'Helsinki observer',
      lat_deg: 60.1699,
      lon_deg: 25.0282,
      alt_m:   0,
    }],
    targets: [{
      type:    'spacecraft',
      label:   'ISS',
      x_eci:   -3_850_000,
      y_eci:    5_200_000,
      z_eci:    3_100_000,
      note:     'Example ECI position — compute from TLE for real pass.',
    }],
    coordinateInputs: {},
    convertedCoordinates: {},
    visibilityResults: [{
      observerLabel: 'Helsinki observer',
      targetLabel:   'ISS',
      visible:       true,
      el_deg:        22.4,
      az_deg:        287.1,
      range_m:       862_000,
      sunlit:        true,
      eclipsed:      false,
      reason:        'Target in view, range 862.0 km.',
      note:          'Simplified two-body / low-precision models.',
    }],
    illuminationResults: [],
    orbitResults: {}, distanceResults: {}, gridResults: {},
    tleResults: {
      iss: {
        satName:  'ISS (ZARYA)',
        satNumber: 25544,
        propagatedAt: '2024-06-14T20:30:00.000Z',
        lat_deg:  52.4,
        lon_deg:  24.7,
        alt_km:   408.2,
        note:     'Simplified two-body propagation — not SGP4.',
      },
    },
    settings: { precision: 'standard', units: 'metric', darkMode: true, cellSize_deg: 5 },
    notes: 'Check if the ISS is visible from Helsinki at a given moment.',
  },

  // ── Lunar surface illumination ───────────────────────────────────────────
  lunar_illumination: {
    version:   '1.0',
    timestamp: '2024-06-14T12:00:00.000Z',
    timeInput: { utc: '2024-06-14T12:00:00.000Z', jd: 2_460_475.0, unix: 1_718_366_400_000 },
    timeSystems: {
      utcISO: '2024-06-14T12:00:00.000Z', jd: 2_460_475.0, mjd: 60_474.5,
      unixMs: 1_718_366_400_000, leapSeconds: 37,
      taiJd: 2_460_475.000_428, ttJd: 2_460_475.000_800,
      gpsWeek: 2319, gpsTOW: 388837.0, gpsSeconds: 1_400_257_637.0,
    },
    bodies: { earth: {}, moon: {}, sun: {} },
    observers: [{
      type:    'moon_surface',
      label:   'Shackleton Crater Rim',
      lat_deg: -89.67,
      lon_deg:   0.0,
      alt_m:     0,
    }],
    targets: [{ type: 'sun', label: 'Sun' }],
    coordinateInputs: {},
    convertedCoordinates: {},
    visibilityResults: [],
    illuminationResults: [{
      site:              'Shackleton Crater Rim',
      lat_deg:           -89.67,
      lon_deg:             0.0,
      sunlit:            true,
      solarElevation_deg:  1.6,
      note:              'Near-continuous illumination on crater rim; simplified model.',
    }],
    orbitResults: {}, distanceResults: {},
    gridResults: {
      polarGrid: {
        cellSize_deg: 5,
        southPolarCells: 4,
        note: 'Polar grid centred on south pole; run polarModeGrid() for full data.',
      },
    },
    tleResults: {},
    settings: { precision: 'standard', units: 'metric', darkMode: true, cellSize_deg: 5 },
    notes: 'Check solar illumination at Shackleton Crater rim (lunar south pole region).',
  },

  // ── Earth–Moon distance ───────────────────────────────────────────────────
  earth_moon_distance: {
    version:   '1.0',
    timestamp: '2024-06-14T12:00:00.000Z',
    timeInput: { utc: '2024-06-14T12:00:00.000Z', jd: 2_460_475.0, unix: 1_718_366_400_000 },
    timeSystems: {
      utcISO: '2024-06-14T12:00:00.000Z', jd: 2_460_475.0, mjd: 60_474.5,
      unixMs: 1_718_366_400_000, leapSeconds: 37,
      taiJd: 2_460_475.000_428, ttJd: 2_460_475.000_800,
      gpsWeek: 2319, gpsTOW: 388837.0, gpsSeconds: 1_400_257_637.0,
    },
    bodies: { earth: {}, moon: {}, sun: {} },
    observers: [], targets: [],
    coordinateInputs: {},
    convertedCoordinates: {},
    visibilityResults: [],
    illuminationResults: [],
    orbitResults: {},
    distanceResults: {
      earthMoon: {
        distance_km:  384_748,
        distance_AU:  0.002_572,
        lightTime_s:  1.283,
        angularDiam_deg: 0.518,
        note: 'Computed from simplified low-precision lunar position model.',
      },
      earthSun: {
        distance_AU: 1.015,
        distance_km: 151_849_800,
        lightTime_min: 8.454,
        note: 'Computed from simplified solar model.',
      },
    },
    gridResults: {}, tleResults: {},
    settings: { precision: 'standard', units: 'metric', darkMode: true, cellSize_deg: 5 },
    notes: 'Earth–Moon and Earth–Sun distances on 2024-06-14.',
  },
};
