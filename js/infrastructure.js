/**
 * @file infrastructure.js
 * @module infrastructure
 * @description Static offline-first seed data and utility functions for
 * space-infrastructure records used by CELES-CALC.
 *
 * Provides:
 *   - Typed seed-data arrays for launch sites, ground stations, TT&C stations,
 *     and network operators.
 *   - Filtering functions for each entity type.
 *   - Lookup functions by ID.
 *   - {@link normalizeForRFEval} – converts a ground/TT&C station record into
 *     the shape expected by {@link module:groundstations~loadStations}.
 *   - Confidence helpers: {@link confidenceLabel} and {@link confidenceBadge}.
 *   - {@link searchInfrastructure} – full-text search across all entity types.
 *   - {@link getInfrastructureSummary} – entity-count summary.
 *
 * All data is embedded inline; no fetch, no dynamic imports, no bundler.
 */

/** Schema version for the infrastructure data model. @type {string} */
export const INFRASTRUCTURE_SCHEMA_VERSION = '1.1';

// ─── Schema typedefs ──────────────────────────────────────────────────────────

/**
 * @typedef {Object} SourceRecord
 * @property {string} source     - Human-readable source name.
 * @property {string} date       - ISO-8601 date string of the source record.
 * @property {number} confidence - Source confidence score in [0, 1].
 */

/**
 * @typedef {Object} InfrastructureGroup
 * @description Network membership / grouping record linking stations to a named
 *   operational group or constellation.
 * @property {string}   id          - Unique group identifier.
 * @property {string}   name        - Group / network name.
 * @property {string}   type        - 'network' | 'constellation' | 'alliance'.
 * @property {string[]} memberIds   - IDs of member station records.
 * @property {string}   [notes]     - Free-text notes.
 */

/**
 * @typedef {Object} RegulatoryReference
 * @description Placeholder for regulatory / spectrum coordination references.
 *   Not implemented in this database version; reserved for future expansion.
 * @property {string} status       - Always 'placeholder'.
 * @property {boolean} implemented - Always false.
 * @property {string} reason       - Explanation of why this is a placeholder.
 * @property {string} nextPlannedPhase - Phase when this will be populated.
 */

/**
 * A structured placeholder returned for regulatory reference lookups.
 * @type {RegulatoryReference}
 */
export const REGULATORY_REFERENCE_PLACEHOLDER = Object.freeze({
  status: 'placeholder',
  implemented: false,
  reason: 'Spectrum coordination and regulatory filing data not yet in scope',
  nextPlannedPhase: 'Regulatory / Licensing Track',
});

/**
 * @typedef {Object} LaunchSite
 * @property {string}         id                       - Unique site identifier.
 * @property {string}         name                     - Official site name.
 * @property {string[]}       aliases                  - Common alternative names.
 * @property {string}         operator                 - Operating agency / organization.
 * @property {string}         country                  - ISO 3166-1 alpha-2 country code.
 * @property {number}         lat_deg                  - Latitude [°].
 * @property {number}         lon_deg                  - Longitude [°].
 * @property {number}         elevation_m              - Site elevation above MSL [m].
 * @property {string}         siteType                 - Terrain/location category.
 * @property {string}         status                   - Operational status ('active' | 'inactive' | 'decommissioned').
 * @property {string[]}       supportedVehicleClasses  - Vehicle mass-class keys supported.
 * @property {string}         nominalAzimuthNotes      - Human-readable azimuth constraints.
 * @property {string}         typicalInclinationNotes  - Human-readable inclination notes.
 * @property {SourceRecord[]} sourceRecords            - Supporting source citations.
 * @property {number}         confidence               - Overall record confidence in [0, 1].
 * @property {string}         notes                    - Free-text notes.
 * @property {string[]}       tags                     - Searchable keyword tags.
 */

/** @type {LaunchSite[]} */
export const LAUNCH_SITES = [
  {
    id: 'LS-CC',
    name: 'Cape Canaveral Space Force Station',
    aliases: ['Cape Canaveral', 'CCSFS', 'KSC', 'Eastern Range'],
    operator: 'US Space Force / NASA',
    country: 'US',
    lat_deg: 28.4889,
    lon_deg: -80.5778,
    elevation_m: 3,
    siteType: 'coastal',
    status: 'active',
    supportedVehicleClasses: ['small', 'medium', 'heavy', 'super-heavy'],
    nominalAzimuthNotes: 'Eastward launches over Atlantic; typical range 35–120 deg',
    typicalInclinationNotes: '28.5° minimum direct insertion; supports SSO via dog-leg',
    sourceRecords: [
      { source: 'NASA KSC Fact Sheet',       date: '2024-01-15', confidence: 0.95 },
      { source: 'FAA launch site database',  date: '2023-11-01', confidence: 0.9  },
    ],
    confidence: 0.95,
    notes: 'Includes SLC-40, SLC-41, LC-39A/B complexes',
    tags: ['US', 'primary', 'crewed-capable'],
  },
  {
    id: 'LS-BAI',
    name: 'Baikonur Cosmodrome',
    aliases: ['Baikonur', 'Tyuratam'],
    operator: 'Roscosmos',
    country: 'KZ',
    lat_deg: 45.965,
    lon_deg: 63.305,
    elevation_m: 90,
    siteType: 'inland',
    status: 'active',
    supportedVehicleClasses: ['medium', 'heavy'],
    nominalAzimuthNotes: 'Eastward launches; constrained by populated areas to north',
    typicalInclinationNotes: '51.6° commonly used for ISS; 46°–65° operational range',
    sourceRecords: [
      { source: 'Roscosmos public records', date: '2024-02-10', confidence: 0.85 },
      { source: "Gunter's Space Page",       date: '2024-03-01', confidence: 0.8  },
    ],
    confidence: 0.85,
    notes: 'Leased from Kazakhstan; operational since 1957',
    tags: ['Russia', 'historical', 'crewed-capable'],
  },
  {
    id: 'LS-CSG',
    name: 'Guiana Space Centre',
    aliases: ['Kourou', 'CSG', 'Centre Spatial Guyanais'],
    operator: 'CNES / ESA',
    country: 'FR-GF',
    lat_deg: 5.232,
    lon_deg: -52.769,
    elevation_m: 15,
    siteType: 'coastal',
    status: 'active',
    supportedVehicleClasses: ['small', 'medium', 'heavy'],
    nominalAzimuthNotes: 'Near-equatorial; wide azimuth freedom over ocean',
    typicalInclinationNotes: '~5.2° direct insertion; excellent GTO performance',
    sourceRecords: [
      { source: 'ESA/CNES CSG overview',     date: '2024-01-20', confidence: 0.9  },
      { source: 'Arianespace user manual',   date: '2023-06-01', confidence: 0.92 },
    ],
    confidence: 0.9,
    notes: 'Supports Ariane 6, Vega-C, Soyuz (suspended)',
    tags: ['ESA', 'equatorial', 'GTO-optimized'],
  },
  {
    id: 'LS-VAFB',
    name: 'Vandenberg Space Force Base',
    aliases: ['Vandenberg', 'VSFB', 'Western Range'],
    operator: 'US Space Force',
    country: 'US',
    lat_deg: 34.7322,
    lon_deg: -120.5724,
    elevation_m: 112,
    siteType: 'coastal',
    status: 'active',
    supportedVehicleClasses: ['small', 'medium', 'heavy'],
    nominalAzimuthNotes: 'Southward launches over Pacific; supports polar and SSO',
    typicalInclinationNotes: 'Polar and sun-synchronous (97–98°) primary; retrograde capable',
    sourceRecords: [
      { source: 'US Space Force fact sheet', date: '2024-04-01', confidence: 0.92 },
      { source: 'SpaceX Vandenberg info',    date: '2024-02-15', confidence: 0.88 },
    ],
    confidence: 0.9,
    notes: 'SLC-4E (Falcon 9), SLC-6 (Delta IV Heavy retired)',
    tags: ['US', 'polar', 'SSO'],
  },
  {
    id: 'LS-TNSC',
    name: 'Tanegashima Space Center',
    aliases: ['Tanegashima', 'TNSC'],
    operator: 'JAXA',
    country: 'JP',
    lat_deg: 30.4008,
    lon_deg: 130.9689,
    elevation_m: 20,
    siteType: 'coastal-island',
    status: 'active',
    supportedVehicleClasses: ['medium', 'heavy'],
    nominalAzimuthNotes: 'Southeast over Pacific; fishing-season launch window constraints',
    typicalInclinationNotes: '30.4° minimum; GTO and SSO missions supported',
    sourceRecords: [
      { source: 'JAXA Tanegashima overview', date: '2024-03-10', confidence: 0.88 },
      { source: "Gunter's Space Page",        date: '2024-01-25', confidence: 0.8  },
    ],
    confidence: 0.85,
    notes: 'Supports H3 and Epsilon S; seasonal launch windows',
    tags: ['Japan', 'island', 'seasonal-constraints'],
  },
  {
    id: 'LS-PLEA',
    name: 'Plesetsk Cosmodrome',
    aliases: ['Plesetsk', 'NIIP-53', 'State Test Cosmodrome'],
    operator: 'Russian Aerospace Forces',
    country: 'RU',
    lat_deg: 62.9272,
    lon_deg: 40.5780,
    elevation_m: 140,
    siteType: 'inland',
    status: 'active',
    supportedVehicleClasses: ['small', 'medium', 'heavy'],
    nominalAzimuthNotes: 'Northward and eastward launches; primarily polar and high-inclination',
    typicalInclinationNotes: '62.8° minimum direct insertion; primary site for Russian polar/military launches',
    sourceRecords: [
      { source: 'Roscosmos public records',     date: '2024-02-10', confidence: 0.82 },
      { source: "Gunter's Space Page Plesetsk", date: '2024-01-20', confidence: 0.78 },
    ],
    confidence: 0.80,
    notes: 'World\'s busiest launch site historically; primary for Russian military and Soyuz/Rockot missions',
    tags: ['Russia', 'polar', 'military', 'historical'],
  },
  {
    id: 'LS-SDSC',
    name: 'Satish Dhawan Space Centre',
    aliases: ['Sriharikota', 'SDSC-SHAR', 'SHAR'],
    operator: 'ISRO',
    country: 'IN',
    lat_deg: 13.7199,
    lon_deg: 80.2304,
    elevation_m: 30,
    siteType: 'coastal-island',
    status: 'active',
    supportedVehicleClasses: ['small', 'medium', 'heavy'],
    nominalAzimuthNotes: 'Eastward over Bay of Bengal; limited polar access requires dog-leg',
    typicalInclinationNotes: '~13.7° minimum; SSO via dog-leg; GTO routinely used for GSAT series',
    sourceRecords: [
      { source: 'ISRO SHAR overview',      date: '2024-01-15', confidence: 0.87 },
      { source: 'ISRO annual report 2023', date: '2024-04-01', confidence: 0.82 },
    ],
    confidence: 0.85,
    notes: 'Primary ISRO launch complex; two launch pads (FLP and SLP); barrier island site',
    tags: ['India', 'ISRO', 'island', 'GTO'],
  },
  {
    id: 'LS-JIU',
    name: 'Jiuquan Satellite Launch Center',
    aliases: ['Jiuquan', 'JSLC', 'Shuang Cheng Tze'],
    operator: 'CNSA / PLA Strategic Support Force',
    country: 'CN',
    lat_deg: 40.9583,
    lon_deg: 100.2917,
    elevation_m: 1000,
    siteType: 'desert',
    status: 'active',
    supportedVehicleClasses: ['small', 'medium', 'heavy'],
    nominalAzimuthNotes: 'Eastward over Gobi; constrained by falldown zones in populated regions',
    typicalInclinationNotes: '42°–70° typical; primary crewed Chinese site for Shenzhou',
    sourceRecords: [
      { source: 'CNSA public announcements', date: '2024-03-01', confidence: 0.75 },
      { source: "Gunter's Space Page",       date: '2024-01-10', confidence: 0.78 },
    ],
    confidence: 0.75,
    notes: 'Oldest Chinese launch site; primary crewed mission site (Shenzhou); desert location',
    tags: ['China', 'crewed-capable', 'desert', 'CNSA'],
  },
  {
    id: 'LS-WEN',
    name: 'Wenchang Space Launch Site',
    aliases: ['Wenchang', 'WSLC'],
    operator: 'CNSA',
    country: 'CN',
    lat_deg: 19.6147,
    lon_deg: 110.9511,
    elevation_m: 10,
    siteType: 'coastal',
    status: 'active',
    supportedVehicleClasses: ['heavy', 'super-heavy'],
    nominalAzimuthNotes: 'Southeastward over South China Sea; near-equatorial latitude advantage',
    typicalInclinationNotes: '~19.6° minimum; excellent GTO performance; supports polar via dog-leg',
    sourceRecords: [
      { source: 'CNSA public announcements',    date: '2024-03-01', confidence: 0.8  },
      { source: "Gunter's Space Page Wenchang", date: '2024-02-01', confidence: 0.78 },
    ],
    confidence: 0.79,
    notes: 'Newest major Chinese launch site; coastal; latitude advantage for GTO; Long March 5/7',
    tags: ['China', 'coastal', 'GTO-optimized', 'CNSA'],
  },
  {
    id: 'LS-BOC',
    name: 'SpaceX Starbase (Boca Chica)',
    aliases: ['Boca Chica', 'Starbase', 'SpaceX South Texas'],
    operator: 'SpaceX',
    country: 'US',
    lat_deg: 25.9969,
    lon_deg: -97.1566,
    elevation_m: 5,
    siteType: 'coastal',
    status: 'active',
    supportedVehicleClasses: ['super-heavy'],
    nominalAzimuthNotes: 'Eastward/southeastward over Gulf of Mexico; FAA-licensed trajectory corridor',
    typicalInclinationNotes: 'Low inclination (26°–90°+) achievable; designed for Starship super-heavy lift',
    sourceRecords: [
      { source: 'SpaceX Starbase public site',  date: '2024-05-01', confidence: 0.85 },
      { source: 'FAA Starship EIS documents',   date: '2024-03-15', confidence: 0.82 },
    ],
    confidence: 0.83,
    notes: 'Dedicated Starship / Super Heavy launch complex; commercial; growing ops tempo',
    tags: ['US', 'SpaceX', 'Starship', 'super-heavy', 'commercial'],
  },
];

// ─── Seed data: Ground Stations ───────────────────────────────────────────────

/**
 * @typedef {Object} AntennaRecord
 * @property {string}   id          - Antenna identifier (e.g. 'DSS-14').
 * @property {number}   diameter_m  - Dish diameter [m].
 * @property {string[]} bands       - Supported RF bands.
 * @property {number}   gainDb      - Peak gain [dBi].
 */

/**
 * @typedef {Object} GroundStation
 * @property {string}         id               - Unique station identifier.
 * @property {string}         name             - Official station name.
 * @property {string}         operator         - Operating agency / organization.
 * @property {string}         country          - ISO 3166-1 alpha-2 country code.
 * @property {number}         lat_deg          - Latitude [°].
 * @property {number}         lon_deg          - Longitude [°].
 * @property {number}         elevation_m      - Site elevation above MSL [m].
 * @property {AntennaRecord[]} antennas        - Antenna inventory.
 * @property {string[]}       supportedBands   - Aggregate supported RF bands.
 * @property {string[]}       capabilities     - Capability keyword list.
 * @property {string}         status           - Operational status.
 * @property {SourceRecord[]} sourceRecords    - Supporting source citations.
 * @property {number}         confidence       - Overall record confidence in [0, 1].
 * @property {string}         notes            - Free-text notes.
 * @property {string[]}       tags             - Searchable keyword tags.
 */

/** @type {GroundStation[]} */
export const GROUND_STATIONS = [
  {
    id: 'GS-GOL',
    name: 'Goldstone Deep Space Complex',
    operator: 'NASA / JPL',
    country: 'US',
    lat_deg: 35.4267,
    lon_deg: -116.89,
    elevation_m: 900,
    antennas: [
      { id: 'DSS-14', diameter_m: 70,   bands: ['S', 'X'],      gainDb: 74.0 },
      { id: 'DSS-25', diameter_m: 34,   bands: ['S', 'X', 'Ka'], gainDb: 68.0 },
    ],
    supportedBands: ['S', 'X', 'Ka'],
    capabilities: ['deep-space-tracking', 'telemetry', 'command', 'VLBI', 'radio-science'],
    status: 'active',
    sourceRecords: [
      { source: 'NASA DSN Handbook (810-005)', date: '2023-09-01', confidence: 0.95 },
      { source: 'JPL DSN Now public data',     date: '2024-04-01', confidence: 0.9  },
    ],
    confidence: 0.95,
    notes: 'Part of NASA Deep Space Network; 70 m antenna is largest steerable in DSN',
    tags: ['DSN', 'deep-space', 'NASA'],
  },
  {
    id: 'GS-CAN',
    name: 'Canberra Deep Space Communication Complex',
    operator: 'NASA / CSIRO',
    country: 'AU',
    lat_deg: -35.4014,
    lon_deg: 148.9817,
    elevation_m: 680,
    antennas: [
      { id: 'DSS-43', diameter_m: 70,   bands: ['S', 'X'],      gainDb: 74.0 },
      { id: 'DSS-36', diameter_m: 34,   bands: ['S', 'X', 'Ka'], gainDb: 68.0 },
    ],
    supportedBands: ['S', 'X', 'Ka'],
    capabilities: ['deep-space-tracking', 'telemetry', 'command', 'VLBI'],
    status: 'active',
    sourceRecords: [
      { source: 'NASA DSN Handbook (810-005)', date: '2023-09-01', confidence: 0.95 },
      { source: 'CDSCC public site',           date: '2024-01-15', confidence: 0.88 },
    ],
    confidence: 0.93,
    notes: 'Only DSN site able to contact Voyager 2 via DSS-43 S-band uplink',
    tags: ['DSN', 'deep-space', 'Southern-hemisphere'],
  },
  {
    id: 'GS-MAD',
    name: 'Madrid Deep Space Communication Complex',
    operator: 'NASA / INTA',
    country: 'ES',
    lat_deg: 40.4314,
    lon_deg: -4.2481,
    elevation_m: 830,
    antennas: [
      { id: 'DSS-63', diameter_m: 70,   bands: ['S', 'X'],      gainDb: 74.0  },
      { id: 'DSS-56', diameter_m: 34,   bands: ['X', 'Ka'],     gainDb: 68.3  },
    ],
    supportedBands: ['S', 'X', 'Ka'],
    capabilities: ['deep-space-tracking', 'telemetry', 'command', 'VLBI', 'radio-science'],
    status: 'active',
    sourceRecords: [
      { source: 'NASA DSN Handbook (810-005)', date: '2023-09-01', confidence: 0.95 },
      { source: 'INTA MDSCC overview',         date: '2024-02-01', confidence: 0.87 },
    ],
    confidence: 0.93,
    notes: 'Robledo de Chavela site; DSS-56 is newest 34 m BWG antenna',
    tags: ['DSN', 'deep-space', 'Europe'],
  },
  {
    id: 'GS-SVA',
    name: 'Svalbard Satellite Station',
    operator: 'KSAT',
    country: 'NO',
    lat_deg: 78.2307,
    lon_deg: 15.3976,
    elevation_m: 460,
    antennas: [
      { id: 'SG-1', diameter_m: 13,  bands: ['S', 'X'], gainDb: 52.0 },
      { id: 'SG-3', diameter_m: 7.3, bands: ['S', 'X'], gainDb: 46.0 },
    ],
    supportedBands: ['S', 'X'],
    capabilities: ['LEO-tracking', 'polar-coverage', 'telemetry', 'data-downlink'],
    status: 'active',
    sourceRecords: [
      { source: 'KSAT network overview',        date: '2024-03-01', confidence: 0.88 },
      { source: 'ESA ground station catalogue', date: '2023-10-01', confidence: 0.85 },
    ],
    confidence: 0.87,
    notes: 'Unique high-latitude location enables every polar orbit pass contact',
    tags: ['KSAT', 'LEO', 'polar', 'Arctic'],
  },
  {
    id: 'GS-HBK',
    name: 'Hartebeesthoek Ground Station',
    operator: 'SANSA',
    country: 'ZA',
    lat_deg: -25.887,
    lon_deg: 27.707,
    elevation_m: 1540,
    antennas: [
      { id: 'HBK-26', diameter_m: 26, bands: ['S', 'X', 'L'], gainDb: 58.0 },
      { id: 'HBK-15', diameter_m: 15, bands: ['S', 'X'],       gainDb: 52.0 },
    ],
    supportedBands: ['L', 'S', 'X'],
    capabilities: ['LEO-tracking', 'telemetry', 'VLBI', 'geodesy'],
    status: 'active',
    sourceRecords: [
      { source: 'SANSA Space Operations',  date: '2024-01-10', confidence: 0.82 },
      { source: 'IVS station catalogue',   date: '2023-07-01', confidence: 0.85 },
    ],
    confidence: 0.83,
    notes: 'Key Southern-hemisphere tracking and VLBI site',
    tags: ['SANSA', 'LEO', 'Southern-hemisphere', 'VLBI'],
  },
  {
    id: 'GS-NNO',
    name: 'New Norcia Ground Station',
    operator: 'ESA',
    country: 'AU',
    lat_deg: -31.0483,
    lon_deg: 116.1917,
    elevation_m: 252,
    antennas: [
      { id: 'NNO-35', diameter_m: 35, bands: ['S', 'X', 'Ka'], gainDb: 70.0 },
    ],
    supportedBands: ['S', 'X', 'Ka'],
    capabilities: ['deep-space-tracking', 'telemetry', 'telecommand', 'ranging', 'LEOP-support'],
    status: 'active',
    sourceRecords: [
      { source: 'ESA ESTRACK station overview', date: '2024-01-20', confidence: 0.9  },
      { source: 'ESA New Norcia factsheet',      date: '2023-08-01', confidence: 0.88 },
    ],
    confidence: 0.89,
    notes: 'ESA deep-space station in Western Australia; 35 m dish; key for lunar and interplanetary missions',
    tags: ['ESTRACK', 'ESA', 'deep-space', 'Southern-hemisphere', 'Australia'],
  },
  {
    id: 'GS-CEB',
    name: 'Cebreros Ground Station',
    operator: 'ESA',
    country: 'ES',
    lat_deg: 40.4527,
    lon_deg: -4.3675,
    elevation_m: 790,
    antennas: [
      { id: 'CEB-35', diameter_m: 35, bands: ['X', 'Ka'], gainDb: 70.2 },
    ],
    supportedBands: ['X', 'Ka'],
    capabilities: ['deep-space-tracking', 'telemetry', 'telecommand', 'ranging', 'LEOP-support'],
    status: 'active',
    sourceRecords: [
      { source: 'ESA ESTRACK station overview', date: '2024-01-20', confidence: 0.9  },
      { source: 'ESA Cebreros factsheet',        date: '2023-09-01', confidence: 0.87 },
    ],
    confidence: 0.89,
    notes: 'ESA deep-space station near Ávila, Spain; 35 m dish; primary European deep-space node',
    tags: ['ESTRACK', 'ESA', 'deep-space', 'Europe'],
  },
  {
    id: 'GS-UCH',
    name: 'Uchinoura Space Center Ground Station',
    operator: 'JAXA',
    country: 'JP',
    lat_deg: 31.2511,
    lon_deg: 131.0792,
    elevation_m: 193,
    antennas: [
      { id: 'UCH-20', diameter_m: 20, bands: ['S', 'X'],      gainDb: 57.5 },
      { id: 'UCH-10', diameter_m: 10, bands: ['S'],            gainDb: 48.0 },
    ],
    supportedBands: ['S', 'X'],
    capabilities: ['deep-space-tracking', 'telemetry', 'telecommand', 'VLBI', 'scientific'],
    status: 'active',
    sourceRecords: [
      { source: 'JAXA USC overview',    date: '2024-02-10', confidence: 0.85 },
      { source: 'JAXA annual report',   date: '2024-01-20', confidence: 0.82 },
    ],
    confidence: 0.83,
    notes: 'JAXA deep-space and scientific mission support; supported Hayabusa and Akatsuki',
    tags: ['JAXA', 'deep-space', 'Japan', 'scientific'],
  },
  {
    id: 'GS-PFS',
    name: 'Perth Ground Station',
    operator: 'NASA / CSIRO',
    country: 'AU',
    lat_deg: -31.8012,
    lon_deg: 115.8853,
    elevation_m: 75,
    antennas: [
      { id: 'HGA-26', diameter_m: 26, bands: ['S', 'X'], gainDb: 58.0 },
    ],
    supportedBands: ['S', 'X'],
    capabilities: ['LEO-tracking', 'telemetry', 'data-downlink', 'Southern-hemisphere-coverage'],
    status: 'active',
    sourceRecords: [
      { source: 'NASA GSFC ground network',  date: '2023-12-01', confidence: 0.80 },
      { source: 'CSIRO Astronomy overview',  date: '2024-01-15', confidence: 0.78 },
    ],
    confidence: 0.79,
    notes: 'Southern-hemisphere LEO contact support; part of NASA Near Space Network',
    tags: ['NASA', 'LEO', 'Southern-hemisphere', 'Australia'],
  },
];

// ─── Seed data: TT&C Stations ─────────────────────────────────────────────────

/**
 * @typedef {Object} TTCStation
 * @property {string}         id             - Unique station identifier.
 * @property {string}         name           - Official station name.
 * @property {string}         network        - Network affiliation (e.g. 'ESTRACK').
 * @property {string}         operator       - Operating agency / organization.
 * @property {string}         country        - ISO 3166-1 alpha-2 country code.
 * @property {number}         lat_deg        - Latitude [°].
 * @property {number}         lon_deg        - Longitude [°].
 * @property {number}         elevation_m    - Site elevation above MSL [m].
 * @property {string[]}       supportedBands - Supported RF bands.
 * @property {AntennaRecord[]} antennas      - Antenna inventory.
 * @property {string[]}       services       - Service keyword list.
 * @property {string}         status         - Operational status.
 * @property {SourceRecord[]} sourceRecords  - Supporting source citations.
 * @property {number}         confidence     - Overall record confidence in [0, 1].
 * @property {string}         notes          - Free-text notes.
 * @property {string[]}       tags           - Searchable keyword tags.
 */

/** @type {TTCStation[]} */
export const TTC_STATIONS = [
  {
    id: 'TTC-ESA-KIR',
    name: 'Kiruna TT&C Station',
    network: 'ESTRACK',
    operator: 'ESA',
    country: 'SE',
    lat_deg: 67.857,
    lon_deg: 20.964,
    elevation_m: 403,
    supportedBands: ['S', 'X'],
    antennas: [
      { id: 'KIR-15', diameter_m: 15, bands: ['S', 'X'], gainDb: 52.0 },
      { id: 'KIR-13', diameter_m: 13, bands: ['S'],       gainDb: 48.0 },
    ],
    services: ['telemetry', 'telecommand', 'ranging', 'LEO-support', 'SSO-support'],
    status: 'active',
    sourceRecords: [
      { source: 'ESA ESTRACK station list',      date: '2024-02-01', confidence: 0.92 },
      { source: 'ESA Ground Facilities Overview', date: '2023-06-01', confidence: 0.9  },
    ],
    confidence: 0.91,
    notes: 'High-latitude ESTRACK node; first-pass contact for many ESA LEO missions',
    tags: ['ESTRACK', 'LEO', 'polar', 'ESA'],
  },
  {
    id: 'TTC-NASA-WGS',
    name: 'White Sands Complex',
    network: 'TDRS / SN',
    operator: 'NASA',
    country: 'US',
    lat_deg: 32.5007,
    lon_deg: -106.6086,
    elevation_m: 1450,
    supportedBands: ['S', 'Ku', 'Ka'],
    antennas: [
      { id: 'WSGT-1', diameter_m: 18, bands: ['S', 'Ku'],       gainDb: 57.0 },
      { id: 'STGT-2', diameter_m: 18, bands: ['S', 'Ku', 'Ka'], gainDb: 58.0 },
    ],
    services: ['TDRS-relay', 'telemetry', 'telecommand', 'data-relay', 'S-band-return'],
    status: 'active',
    sourceRecords: [
      { source: 'NASA SN Users Guide (453-SNUG)', date: '2023-08-01', confidence: 0.93 },
      { source: 'NASA GSFC TDRS overview',        date: '2024-01-15', confidence: 0.9  },
    ],
    confidence: 0.92,
    notes: 'Ground terminal for TDRS relay satellites; provides near-continuous LEO coverage',
    tags: ['NASA', 'TDRS', 'relay', 'TT&C'],
  },
  {
    id: 'TTC-ISRO-BLR',
    name: 'ISTRAC Bangalore TT&C',
    network: 'ISTRAC',
    operator: 'ISRO',
    country: 'IN',
    lat_deg: 13.0341,
    lon_deg: 77.5116,
    elevation_m: 920,
    supportedBands: ['S', 'X'],
    antennas: [
      { id: 'BLR-11', diameter_m: 11,  bands: ['S'],       gainDb: 46.0 },
      { id: 'BLR-7',  diameter_m: 7.2, bands: ['S', 'X'], gainDb: 42.0 },
    ],
    services: ['telemetry', 'telecommand', 'ranging', 'orbit-determination'],
    status: 'active',
    sourceRecords: [
      { source: 'ISRO ISTRAC overview',      date: '2023-12-01', confidence: 0.8  },
      { source: 'ISRO annual report 2023',   date: '2024-04-01', confidence: 0.78 },
    ],
    confidence: 0.79,
    notes: 'Primary hub of ISRO TT&C network; supports IRS and GSAT series',
    tags: ['ISRO', 'ISTRAC', 'TT&C', 'India'],
  },
  {
    id: 'TTC-ESA-CEB',
    name: 'Cebreros TT&C Station',
    network: 'ESTRACK',
    operator: 'ESA',
    country: 'ES',
    lat_deg: 40.4527,
    lon_deg: -4.3675,
    elevation_m: 790,
    supportedBands: ['X', 'Ka'],
    antennas: [
      { id: 'CEB-35', diameter_m: 35, bands: ['X', 'Ka'], gainDb: 70.2 },
    ],
    services: ['telemetry', 'telecommand', 'ranging', 'deep-space-tracking', 'LEOP-support'],
    status: 'active',
    sourceRecords: [
      { source: 'ESA ESTRACK station overview', date: '2024-01-20', confidence: 0.9  },
      { source: 'ESA Cebreros factsheet',        date: '2023-09-01', confidence: 0.87 },
    ],
    confidence: 0.89,
    notes: 'ESA primary European deep-space TT&C node; 35 m antenna; supports BepiColombo, JUICE',
    tags: ['ESTRACK', 'ESA', 'deep-space', 'Europe', 'Spain'],
  },
  {
    id: 'TTC-CNES-AUS',
    name: 'Aussaguel TT&C Station',
    network: 'CNES Ground Network',
    operator: 'CNES',
    country: 'FR',
    lat_deg: 43.4258,
    lon_deg: 1.4867,
    elevation_m: 240,
    supportedBands: ['S', 'X', 'Ku'],
    antennas: [
      { id: 'AUS-11', diameter_m: 11, bands: ['S', 'X'],     gainDb: 47.0 },
      { id: 'AUS-3',  diameter_m: 3.8, bands: ['S', 'Ku'],   gainDb: 38.0 },
    ],
    services: ['telemetry', 'telecommand', 'ranging', 'orbit-determination', 'GEO-support'],
    status: 'active',
    sourceRecords: [
      { source: 'CNES SINTRA ground segment overview', date: '2024-01-10', confidence: 0.82 },
      { source: 'CNES annual report 2023',              date: '2024-03-15', confidence: 0.78 },
    ],
    confidence: 0.80,
    notes: 'CNES TT&C hub near Toulouse; supports Spot, Pleiades, and CNES scientific missions',
    tags: ['CNES', 'France', 'TT&C', 'GEO-support', 'Europe'],
  },
  {
    id: 'TTC-JAXA-UCH',
    name: 'Uchinoura TT&C Station',
    network: 'JAXA SDS',
    operator: 'JAXA',
    country: 'JP',
    lat_deg: 31.2511,
    lon_deg: 131.0792,
    elevation_m: 193,
    supportedBands: ['S', 'X'],
    antennas: [
      { id: 'UCH-20', diameter_m: 20, bands: ['S', 'X'], gainDb: 57.5 },
      { id: 'UCH-10', diameter_m: 10, bands: ['S'],       gainDb: 48.0 },
    ],
    services: ['telemetry', 'telecommand', 'ranging', 'scientific-support', 'orbit-determination'],
    status: 'active',
    sourceRecords: [
      { source: 'JAXA USC overview',  date: '2024-02-10', confidence: 0.85 },
      { source: 'JAXA annual report', date: '2024-01-20', confidence: 0.82 },
    ],
    confidence: 0.83,
    notes: 'JAXA TT&C for scientific and deep-space missions; Hayabusa primary contact site',
    tags: ['JAXA', 'Japan', 'TT&C', 'deep-space', 'scientific'],
  },
];

// ─── Seed data: Network Operators ─────────────────────────────────────────────

/**
 * @typedef {Object} NetworkOperator
 * @property {string}         id                   - Unique operator identifier.
 * @property {string}         name                 - Organization name.
 * @property {string}         operatorType         - 'governmental' | 'commercial' | 'private'.
 * @property {string}         country              - ISO 3166-1 alpha-2 (or 'EU') country code.
 * @property {number}         stationCount         - Approximate total number of stations in the full operational network (not limited to seeded records).
 * @property {string}         coverageDescription  - Human-readable coverage summary.
 * @property {string[]}       networkRoles         - Role keyword list.
 * @property {string}         website              - Public website URL.
 * @property {string[]}       stationIds           - IDs of seed stations that belong to this operator.
 * @property {SourceRecord[]} sourceRecords        - Supporting source citations.
 * @property {number}         confidence           - Overall record confidence in [0, 1].
 * @property {string}         notes                - Free-text notes.
 */

/** @type {NetworkOperator[]} */
export const NETWORK_OPERATORS = [
  {
    id: 'NO-DSN',
    name: 'NASA Deep Space Network',
    operatorType: 'governmental',
    country: 'US',
    stationCount: 3,
    coverageDescription:
      'Near-continuous deep-space coverage via three complexes spaced ~120° in longitude (Goldstone, Canberra, Madrid)',
    networkRoles: [
      'deep-space-tracking', 'telemetry', 'telecommand', 'VLBI', 'radio-science', 'navigation',
    ],
    website: 'https://eyes.nasa.gov/dsn/dsn.html',
    stationIds: ['GS-GOL', 'GS-CAN', 'GS-MAD'],
    sourceRecords: [
      { source: 'NASA DSN Handbook (810-005)', date: '2023-09-01', confidence: 0.96 },
      { source: 'JPL DSN public site',         date: '2024-03-01', confidence: 0.92 },
    ],
    confidence: 0.95,
    notes: 'Operated by JPL; supports all NASA interplanetary and selected partner missions',
  },
  {
    id: 'NO-KSAT',
    name: 'Kongsberg Satellite Services',
    operatorType: 'commercial',
    country: 'NO',
    stationCount: 25,
    coverageDescription:
      'Global ground-station network with polar, equatorial, and mid-latitude sites; strong Arctic/Antarctic presence',
    networkRoles: [
      'LEO-support', 'data-downlink', 'TT&C-relay', 'hosted-payload-ops', 'launch-support',
    ],
    website: 'https://www.ksat.no',
    stationIds: ['GS-SVA'],
    sourceRecords: [
      { source: 'KSAT corporate overview',   date: '2024-03-01', confidence: 0.88 },
      { source: 'KSAT annual report 2023',   date: '2024-02-15', confidence: 0.85 },
    ],
    confidence: 0.87,
    notes: 'Major commercial provider; Svalbard and TrollSat sites enable every-orbit polar contact',
  },
  {
    id: 'NO-ESTRACK',
    name: 'ESA ESTRACK Network',
    operatorType: 'governmental',
    country: 'EU',
    stationCount: 10,
    coverageDescription:
      'European and worldwide stations supporting ESA LEO, MEO, GEO, and deep-space missions',
    networkRoles: [
      'telemetry', 'telecommand', 'ranging', 'deep-space-tracking', 'LEOP-support', 'data-relay',
    ],
    website: 'https://www.esa.int/Enabling_Support/Operations/ESA_Ground_Stations/ESTRACK_network',
    stationIds: ['TTC-ESA-KIR'],
    sourceRecords: [
      { source: 'ESA ESTRACK overview',          date: '2024-01-20', confidence: 0.9  },
      { source: 'ESA Ground Facilities brochure', date: '2023-06-01', confidence: 0.88 },
    ],
    confidence: 0.9,
    notes: 'Core stations at Kiruna, Kourou, Cebreros, New Norcia, and Malargüe',
    stationIds: ['TTC-ESA-KIR', 'TTC-ESA-CEB', 'GS-NNO', 'GS-CEB'],
  },
  {
    id: 'NO-CNES',
    name: 'CNES Ground Network (SINTRA)',
    operatorType: 'governmental',
    country: 'FR',
    stationCount: 6,
    coverageDescription:
      'French national ground network supporting CNES scientific, Earth-observation, and GEO missions from European and overseas stations',
    networkRoles: [
      'telemetry', 'telecommand', 'ranging', 'orbit-determination', 'LEO-support', 'GEO-support',
    ],
    website: 'https://www.cnes.fr',
    stationIds: ['TTC-CNES-AUS'],
    sourceRecords: [
      { source: 'CNES SINTRA overview',    date: '2024-01-10', confidence: 0.82 },
      { source: 'CNES annual report 2023', date: '2024-03-15', confidence: 0.79 },
    ],
    confidence: 0.80,
    notes: 'Operates Aussaguel, Kourou, and overseas stations; supports Spot/Pleiades/Jason series',
  },
  {
    id: 'NO-JAXA',
    name: 'JAXA Space Tracking and Data Acquisition Network (STANC)',
    operatorType: 'governmental',
    country: 'JP',
    stationCount: 5,
    coverageDescription:
      'Japanese national network for scientific, deep-space, and Earth-observation mission TT&C; includes Sagamihara, Uchinoura, and overseas cooperating sites',
    networkRoles: [
      'telemetry', 'telecommand', 'ranging', 'deep-space-tracking', 'orbit-determination', 'scientific',
    ],
    website: 'https://www.jaxa.jp',
    stationIds: ['TTC-JAXA-UCH', 'GS-UCH'],
    sourceRecords: [
      { source: 'JAXA STANC overview',    date: '2024-02-10', confidence: 0.83 },
      { source: 'JAXA annual report 2023', date: '2024-01-20', confidence: 0.80 },
    ],
    confidence: 0.81,
    notes: 'Supports H-II missions, Hayabusa, Akatsuki, and international cooperative missions',
  },
  {
    id: 'NO-NASA-SN',
    name: 'NASA Space Network (TDRS)',
    operatorType: 'governmental',
    country: 'US',
    stationCount: 2,
    coverageDescription:
      'NASA relay network using TDRS geosynchronous relay satellites; White Sands ground terminals provide near-continuous LEO and select MEO coverage',
    networkRoles: [
      'data-relay', 'TDRS-relay', 'telemetry', 'telecommand', 'S-band-return', 'LEO-support',
    ],
    website: 'https://www.nasa.gov/directorates/heo/scan/services/networks/txt_sn.html',
    stationIds: ['TTC-NASA-WGS'],
    sourceRecords: [
      { source: 'NASA SN Users Guide (453-SNUG)', date: '2023-08-01', confidence: 0.93 },
      { source: 'NASA GSFC SN overview',          date: '2024-01-15', confidence: 0.90 },
    ],
    confidence: 0.91,
    notes: 'TDRS constellation provides ~85–100% LEO contact coverage; supplement to DSN for near-Earth',
  },
];

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Case-insensitive substring check.
 *
 * @param {string} haystack - String to search within.
 * @param {string} needle   - Substring to find.
 * @returns {boolean}
 */
function _contains(haystack, needle) {
  return String(haystack).toLowerCase().includes(needle.toLowerCase());
}

/**
 * Return true if any element of `arr` contains `needle`.
 *
 * @param {string[]} arr    - Array of strings to test.
 * @param {string}   needle - Substring to find.
 * @returns {boolean}
 */
function _arrayContains(arr, needle) {
  return Array.isArray(arr) && arr.some(item => _contains(item, needle));
}

// ─── Filtering functions ──────────────────────────────────────────────────────

/**
 * @typedef {Object} LaunchSiteFilter
 * @property {string}   [status]        - Match on status field (case-insensitive).
 * @property {string}   [country]       - Match on country code (case-insensitive).
 * @property {string}   [siteType]      - Match on siteType field (case-insensitive).
 * @property {string}   [vehicleClass]  - Require supportedVehicleClasses to include this value.
 * @property {number}   [confidenceMin] - Minimum confidence score inclusive.
 * @property {string}   [text]          - Substring search across name, aliases, operator, tags.
 */

/**
 * Filter an array of launch-site records by optional criteria.
 *
 * @param {LaunchSite[]}    sites   - Source array (defaults to {@link LAUNCH_SITES}).
 * @param {LaunchSiteFilter} filter - Filter options (all fields optional).
 * @returns {LaunchSite[]} Matching records.
 */
export function filterLaunchSites(sites = LAUNCH_SITES, filter = {}) {
  const { status, country, siteType, vehicleClass, confidenceMin, text } = filter;
  return sites.filter(s => {
    if (status        && !_contains(s.status,   status))        return false;
    if (country       && !_contains(s.country,  country))       return false;
    if (siteType      && !_contains(s.siteType, siteType))      return false;
    if (vehicleClass  && !_arrayContains(s.supportedVehicleClasses, vehicleClass)) return false;
    if (confidenceMin !== undefined && s.confidence < confidenceMin)               return false;
    if (text) {
      const q = text.toLowerCase();
      const hit =
        _contains(s.name,     q) ||
        _arrayContains(s.aliases,  q) ||
        _contains(s.operator, q) ||
        _arrayContains(s.tags, q);
      if (!hit) return false;
    }
    return true;
  });
}

/**
 * @typedef {Object} GroundStationFilter
 * @property {string} [status]        - Match on status field (case-insensitive).
 * @property {string} [country]       - Match on country code (case-insensitive).
 * @property {string} [band]          - Require supportedBands to include this value.
 * @property {string} [capability]    - Require capabilities to include this value.
 * @property {string} [operatorId]    - Substring match against operator string.
 * @property {number} [confidenceMin] - Minimum confidence score inclusive.
 * @property {string} [text]          - Substring search across name, operator, tags.
 */

/**
 * Filter an array of ground-station records by optional criteria.
 *
 * @param {GroundStation[]}    stations - Source array (defaults to {@link GROUND_STATIONS}).
 * @param {GroundStationFilter} filter  - Filter options (all fields optional).
 * @returns {GroundStation[]} Matching records.
 */
export function filterGroundStations(stations = GROUND_STATIONS, filter = {}) {
  const { status, country, band, capability, operatorId, confidenceMin, text } = filter;
  return stations.filter(s => {
    if (status        && !_contains(s.status,   status))   return false;
    if (country       && !_contains(s.country,  country))  return false;
    if (band          && !_arrayContains(s.supportedBands,  band))       return false;
    if (capability    && !_arrayContains(s.capabilities,    capability)) return false;
    if (operatorId    && !_contains(s.operator, operatorId))             return false;
    if (confidenceMin !== undefined && s.confidence < confidenceMin)     return false;
    if (text) {
      const q = text.toLowerCase();
      const hit =
        _contains(s.name,     q) ||
        _contains(s.operator, q) ||
        _arrayContains(s.tags, q);
      if (!hit) return false;
    }
    return true;
  });
}

/**
 * @typedef {Object} TTCStationFilter
 * @property {string} [status]        - Match on status field (case-insensitive).
 * @property {string} [country]       - Match on country code (case-insensitive).
 * @property {string} [band]          - Require supportedBands to include this value.
 * @property {string} [service]       - Require services to include this value.
 * @property {string} [operatorId]    - Substring match against operator string.
 * @property {number} [confidenceMin] - Minimum confidence score inclusive.
 * @property {string} [text]          - Substring search across name, operator, tags.
 */

/**
 * Filter an array of TT&C station records by optional criteria.
 *
 * @param {TTCStation[]}    stations - Source array (defaults to {@link TTC_STATIONS}).
 * @param {TTCStationFilter} filter  - Filter options (all fields optional).
 * @returns {TTCStation[]} Matching records.
 */
export function filterTTCStations(stations = TTC_STATIONS, filter = {}) {
  const { status, country, band, service, operatorId, confidenceMin, text } = filter;
  return stations.filter(s => {
    if (status        && !_contains(s.status,   status))   return false;
    if (country       && !_contains(s.country,  country))  return false;
    if (band          && !_arrayContains(s.supportedBands, band))    return false;
    if (service       && !_arrayContains(s.services,       service)) return false;
    if (operatorId    && !_contains(s.operator, operatorId))         return false;
    if (confidenceMin !== undefined && s.confidence < confidenceMin) return false;
    if (text) {
      const q = text.toLowerCase();
      const hit =
        _contains(s.name,     q) ||
        _contains(s.operator, q) ||
        _arrayContains(s.tags, q);
      if (!hit) return false;
    }
    return true;
  });
}

/**
 * @typedef {Object} OperatorFilter
 * @property {string} [operatorType]  - Match on operatorType field (case-insensitive).
 * @property {string} [country]       - Match on country code (case-insensitive).
 * @property {string} [role]          - Require networkRoles to include this value.
 * @property {number} [confidenceMin] - Minimum confidence score inclusive.
 * @property {string} [text]          - Substring search across name, coverageDescription, networkRoles.
 */

/**
 * Filter an array of network-operator records by optional criteria.
 *
 * @param {NetworkOperator[]} operators - Source array (defaults to {@link NETWORK_OPERATORS}).
 * @param {OperatorFilter}    filter    - Filter options (all fields optional).
 * @returns {NetworkOperator[]} Matching records.
 */
export function filterOperators(operators = NETWORK_OPERATORS, filter = {}) {
  const { operatorType, country, role, confidenceMin, text } = filter;
  return operators.filter(op => {
    if (operatorType  && !_contains(op.operatorType, operatorType))     return false;
    if (country       && !_contains(op.country,      country))          return false;
    if (role          && !_arrayContains(op.networkRoles, role))        return false;
    if (confidenceMin !== undefined && op.confidence < confidenceMin)   return false;
    if (text) {
      const q = text.toLowerCase();
      const hit =
        _contains(op.name,                q) ||
        _contains(op.coverageDescription, q) ||
        _arrayContains(op.networkRoles,   q);
      if (!hit) return false;
    }
    return true;
  });
}

// ─── Lookup functions ─────────────────────────────────────────────────────────

/**
 * Look up a launch site by its unique ID.
 *
 * @param {string} id - Site identifier (e.g. 'LS-CC').
 * @returns {LaunchSite|undefined} Matching record, or undefined if not found.
 */
export function getLaunchSiteById(id) {
  return LAUNCH_SITES.find(s => s.id === id);
}

/**
 * Look up a ground station by its unique ID.
 *
 * @param {string} id - Station identifier (e.g. 'GS-GOL').
 * @returns {GroundStation|undefined} Matching record, or undefined if not found.
 */
export function getGroundStationById(id) {
  return GROUND_STATIONS.find(s => s.id === id);
}

/**
 * Look up a TT&C station by its unique ID.
 *
 * @param {string} id - Station identifier (e.g. 'TTC-ESA-KIR').
 * @returns {TTCStation|undefined} Matching record, or undefined if not found.
 */
export function getTTCStationById(id) {
  return TTC_STATIONS.find(s => s.id === id);
}

/**
 * Look up a network operator by its unique ID.
 *
 * @param {string} id - Operator identifier (e.g. 'NO-DSN').
 * @returns {NetworkOperator|undefined} Matching record, or undefined if not found.
 */
export function getOperatorById(id) {
  return NETWORK_OPERATORS.find(op => op.id === id);
}

// ─── RF evaluation normalization ──────────────────────────────────────────────

/**
 * Cost-index heuristic table.
 * Commercial operators pay a premium; governmental agencies receive a discount.
 */
const _COST_INDEX_RULES = [
  { pattern: /ksat|commercial|private/i, costIndex: 1.0  },
  { pattern: /nasa|esa|jaxa|isro|csiro|inta|sansa|cnes/i, costIndex: 0.8 },
];
const _COST_INDEX_DEFAULT = 1.2;

/**
 * Derive a cost index from an operator name string using keyword heuristics.
 *
 * @param {string} operatorStr - Operator name (e.g. 'NASA / JPL').
 * @returns {number} Cost index (0.8 = governmental, 1.0 = commercial/KSAT, 1.2 = other).
 */
function _deriveCostIndex(operatorStr) {
  for (const rule of _COST_INDEX_RULES) {
    if (rule.pattern.test(operatorStr)) return rule.costIndex;
  }
  return _COST_INDEX_DEFAULT;
}

/**
 * @typedef {Object} RFEvalRecord
 * @property {string}         name          - Station name.
 * @property {number}         lat_deg       - Latitude [°].
 * @property {number}         lon_deg       - Longitude [°].
 * @property {number}         alt_m         - Altitude above MSL [m].
 * @property {number}         antennaGain_dBi - Best antenna gain for the requested band [dBi].
 * @property {string}         band          - RF band key used for gain selection.
 * @property {number}         costIndex     - Relative cost index (lower = cheaper).
 * @property {boolean}        hasRedundancy - True if more than one antenna is present.
 * @property {string[]}       capabilities  - Capability / service keyword list.
 * @property {number}         confidence    - Source confidence score in [0, 1].
 * @property {SourceRecord[]} sourceRecords - Supporting source citations.
 * @property {string}         infraId       - Original record ID from the seed data.
 */

/**
 * Convert a {@link GroundStation} or {@link TTCStation} record into the
 * normalized shape expected by
 * {@link module:groundstations~loadStations loadStations}.
 *
 * Antenna gain selection: the antenna with the highest `gainDb` that supports
 * the requested `band` is chosen.  If no antenna supports that band, the
 * antenna with the highest `gainDb` overall is used.  If the record has no
 * antenna inventory, a default gain of 30 dBi is applied.
 *
 * @param {GroundStation|TTCStation} stationRecord - Source infrastructure record.
 * @param {Object} [options]           - Normalization options.
 * @param {string} [options.band='X'] - Preferred RF band for antenna-gain selection.
 * @returns {RFEvalRecord} Normalized station record ready for RF evaluation.
 */
export function normalizeForRFEval(stationRecord, { band = 'X' } = {}) {
  const antennas = Array.isArray(stationRecord.antennas) ? stationRecord.antennas : [];

  // Select best antenna for the requested band, fall back to highest gain overall.
  let selectedGain = 30; // dBi default
  if (antennas.length > 0) {
    const bandMatches = antennas.filter(a => Array.isArray(a.bands) && a.bands.includes(band));
    const pool = bandMatches.length > 0 ? bandMatches : antennas;
    const gains = pool.map(a => a.gainDb).filter(g => typeof g === 'number' && isFinite(g));
    if (gains.length > 0) selectedGain = Math.max(...gains);
  }

  const capabilities = Array.isArray(stationRecord.capabilities)
    ? stationRecord.capabilities
    : (Array.isArray(stationRecord.services) ? stationRecord.services : []);

  return {
    name:            stationRecord.name,
    lat_deg:         stationRecord.lat_deg,
    lon_deg:         stationRecord.lon_deg,
    alt_m:           stationRecord.elevation_m ?? 0,
    antennaGain_dBi: selectedGain,
    band,
    costIndex:       _deriveCostIndex(stationRecord.operator ?? ''),
    hasRedundancy:   antennas.length > 1,
    capabilities,
    confidence:      stationRecord.confidence,
    sourceRecords:   stationRecord.sourceRecords ?? [],
    infraId:         stationRecord.id,
  };
}

// ─── Confidence helpers ───────────────────────────────────────────────────────

/**
 * Convert a numeric confidence score to a human-readable label.
 *
 * | Score      | Label    |
 * |------------|----------|
 * | >= 0.9     | 'high'   |
 * | >= 0.7     | 'medium' |
 * | < 0.7      | 'low'    |
 *
 * @param {number} score - Confidence score in [0, 1].
 * @returns {'high'|'medium'|'low'} Confidence label.
 */
export function confidenceLabel(score) {
  if (score >= 0.9) return 'high';
  if (score >= 0.7) return 'medium';
  return 'low';
}

/**
 * Build an HTML badge element string for a confidence score.
 *
 * The badge uses CSS classes `conf-badge` and `conf-<label>` so the host
 * stylesheet controls the visual styling.
 *
 * @param {number} score - Confidence score in [0, 1].
 * @returns {string} HTML string, e.g. `'<span class="conf-badge conf-high">High</span>'`.
 */
export function confidenceBadge(score) {
  const label = confidenceLabel(score);
  const display = label.charAt(0).toUpperCase() + label.slice(1);
  return `<span class="conf-badge conf-${label}">${display}</span>`;
}

// ─── Cross-entity search ──────────────────────────────────────────────────────

/**
 * @typedef {Object} InfrastructureSearchResult
 * @property {LaunchSite[]}      launchSites      - Matching launch sites.
 * @property {GroundStation[]}   groundStations   - Matching ground stations.
 * @property {TTCStation[]}      ttcStations      - Matching TT&C stations.
 * @property {NetworkOperator[]} operators        - Matching network operators.
 */

/**
 * Search across all infrastructure entity types using a plain-text query.
 *
 * Each entity type is searched using its own `text` filter, which covers the
 * most descriptive string fields and tag arrays for that type.
 *
 * @param {string} query - Search string (case-insensitive substring match).
 * @returns {InfrastructureSearchResult} Results bucketed by entity type.
 */
export function searchInfrastructure(query) {
  const q = String(query ?? '').trim();
  return {
    launchSites:    filterLaunchSites(LAUNCH_SITES,       { text: q }),
    groundStations: filterGroundStations(GROUND_STATIONS, { text: q }),
    ttcStations:    filterTTCStations(TTC_STATIONS,        { text: q }),
    operators:      filterOperators(NETWORK_OPERATORS,     { text: q }),
  };
}

// ─── Summary ──────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} InfrastructureSummary
 * @property {number} launchSites    - Count of seed launch sites.
 * @property {number} groundStations - Count of seed ground stations.
 * @property {number} ttcStations    - Count of seed TT&C stations.
 * @property {number} operators      - Count of seed network operators.
 * @property {number} total          - Sum of all entity counts.
 */

/**
 * Return a count summary of all seed infrastructure entities.
 *
 * @returns {InfrastructureSummary}
 */
export function getInfrastructureSummary() {
  const launchSites    = LAUNCH_SITES.length;
  const groundStations = GROUND_STATIONS.length;
  const ttcStations    = TTC_STATIONS.length;
  const operators      = NETWORK_OPERATORS.length;
  return {
    launchSites,
    groundStations,
    ttcStations,
    operators,
    total: launchSites + groundStations + ttcStations + operators,
  };
}
