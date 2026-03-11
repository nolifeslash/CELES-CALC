# CELES-CALC — Formula Reference

Mathematical formulas and algorithms used throughout the application.
Source files are in [`js/`](js/).

---

## 1. Time System Conversions

> Source: [`js/time.js`](js/time.js), [`js/constants.js`](js/constants.js)

### Julian Date (Meeus algorithm)

```
If month ≤ 2: year' = year − 1, month' = month + 12
A = ⌊year / 100⌋
B = 2 − A + ⌊A / 4⌋
dayFrac = day + hour/24 + min/1440 + sec/86400
JD = ⌊365.25 (year + 4716)⌋ + ⌊30.6001 (month + 1)⌋ + dayFrac + B − 1524.5
```

### Modified Julian Date

```
MJD = JD − 2400000.5
```

### Julian Centuries since J2000.0

```
T = (JD − 2451545.0) / 36525
```

### UTC ↔ Unix Timestamp

```
JD = 2440587.5 + unixMs / 86400000
```

### Leap Seconds

A lookup table (28 entries, 1972–2017) maps UTC dates to cumulative
TAI − UTC offsets. The last entry whose date ≤ query date is used.

### TAI, TT, GPS Time

```
TAI_JD  = UTC_JD + leapSeconds / 86400
TT_JD   = TAI_JD + 32.184 / 86400
GPS_JD  = UTC_JD + (leapSeconds − 19) / 86400
gpsWeek = ⌊(GPS_JD − 2444244.5) × 86400 / 604800⌋
gpsTOW  = ((GPS_JD − 2444244.5) × 86400) mod 604800
```

Constants: TAI − GPS = 19 s (fixed since 1980-01-06), TT − TAI = 32.184 s.

### Greenwich Mean Sidereal Time (IAU 1982)

```
GMST_s = 24110.54841 + 8640184.812866 T + 0.093104 T² − 6.2×10⁻⁶ T³
       + 1.002737909350795 × UT1_s
GMST_rad = (GMST_s / 86400) × 2π    (normalised to [0, 2π))
```

---

## 2. Earth Coordinate Conversions

> Source: [`js/earth.js`](js/earth.js), [`js/constants.js`](js/constants.js)

### WGS-84 Parameters

| Symbol | Value | Description |
|--------|-------|-------------|
| a | 6 378 137.0 m | Equatorial radius |
| b | 6 356 752.3142 m | Polar radius |
| f | 1 / 298.257223563 | Flattening |
| e² | 2f − f² ≈ 0.00669438 | First eccentricity squared |
| R_mean | 6 371 000 m | Mean radius (IUGG) |

### Geodetic → ECEF

```
N = a / √(1 − e² sin²φ)          (prime vertical radius of curvature)
x = (N + h) cosφ cosλ
y = (N + h) cosφ sinλ
z = (N(1 − e²) + h) sinφ
```

### ECEF → Geodetic (Bowring iterative)

```
p = √(x² + y²)
λ = atan2(y, x)
φ₀ = atan2(z, p(1 − e²))
Iterate until |Δφ| < 10⁻¹²:
  N = a / √(1 − e² sin²φ)
  φ = atan2(z + e² N sinφ, p)
h = p / cosφ − N
```

### ECEF ↔ ENU (East-North-Up)

```
⎡e⎤   ⎡ −sinλ        cosλ       0    ⎤ ⎡Δx⎤
⎢n⎥ = ⎢ −sinφ cosλ  −sinφ sinλ  cosφ ⎥ ⎢Δy⎥
⎣u⎦   ⎣  cosφ cosλ   cosφ sinλ  sinφ ⎦ ⎣Δz⎦
```

Inverse: transpose the rotation matrix; add observer ECEF position.

### ENU → Azimuth / Elevation / Range

```
range = √(e² + n² + u²)
el    = arcsin(u / range)
az    = atan2(e, n)              (0–360°, clockwise from North)
```

### ECEF ↔ ECI (GMST rotation)

```
⎡x_eci⎤   ⎡ cosθ  −sinθ  0 ⎤ ⎡x_ecef⎤
⎢y_eci⎥ = ⎢ sinθ   cosθ  0 ⎥ ⎢y_ecef⎥       θ = GMST (rad)
⎣z_eci⎦   ⎣  0      0    1 ⎦ ⎣z_ecef⎦
```

Inverse: transpose the rotation matrix.

### Great-Circle Distance (Haversine)

```
a = sin²(Δφ/2) + cosφ₁ cosφ₂ sin²(Δλ/2)
c = 2 atan2(√a, √(1−a))
d = R_mean × c
```

Accuracy: ≈ ±0.5 % (spherical approximation).

### Initial & Final Bearing

```
bearing = atan2(sinΔλ cosφ₂,  cosφ₁ sinφ₂ − sinφ₁ cosφ₂ cosΔλ)
```

Final bearing: (initial bearing + 180°) mod 360°.

### Solar Position (truncated Meeus / Spencer)

```
L₀ = (280.46646 + 36000.76983 T) mod 360        (mean longitude)
M  = (357.52911 + 35999.05029 T) mod 360         (mean anomaly)
C  = (1.914602 − 0.004817 T) sinM
   + (0.019993 − 0.000101 T) sin2M
   + 0.000289 sin3M                              (equation of centre)
λ_sun = L₀ + C                                   (true longitude)
ε  = 23.439291 − 0.013004 T                      (obliquity)
Sun ECI unit vector: [cosλ,  sinλ cosε,  sinλ sinε]
```

Accuracy: ≈ ±0.01° in ecliptic longitude.

### Solar Elevation at a Ground Point

```
sin(el) = sinφ sinφ_s + cosφ cosφ_s cos(Δλ)
sunlit  = el > 0°
```

### Equation of Time / Local Solar Time

```
eot_min = −7.655 sinM + 9.873 sin(2M + 3.588) + 0.439 sin(4M + 0.072)
LST     = UTC_h + lon/15 + eot_min/60           (mod 24 h)
```

### Line-of-Sight (Ray–Sphere)

Given two ECEF points **p₁**, **p₂** and Earth radius R:

```
d = p₂ − p₁
a = d·d,  b = 2(p₁·d),  c = p₁·p₁ − R²
Δ = b² − 4ac
Blocked if Δ ≥ 0 and both roots t satisfy 0 < t < 1
```

---

## 3. Moon Coordinate Conversions

> Source: [`js/moon.js`](js/moon.js)

### Constants

- Moon radius R_m = 1 737 400 m (IAU 2015)
- GM_moon = 4.9048695 × 10¹² m³/s²

### Selenographic ↔ Cartesian (spherical Moon)

```
r = R_m + alt
x = r cosφ cosλ        (toward Earth at 0°,0°)
y = r cosφ sinλ
z = r sinφ             (toward north pole)
```

Inverse:

```
φ   = arcsin(z / r)
λ   = atan2(y, x)
alt = √(x²+y²+z²) − R_m
```

### Moon Position in ECI (Meeus ch. 47, truncated)

Mean elements (degrees, T in Julian centuries from J2000):

```
L' = 218.3164477 + 481267.88123421 T − 0.0015786 T²
D  = 297.8501921 + 445267.1114034 T  − 0.0018819 T²
M  = 357.5291092 + 35999.0502909 T   − 0.0001536 T²
M' = 134.9633964 + 477198.8675055 T  + 0.0087414 T²
F  = 93.2720950  + 483202.0175233 T  − 0.0036539 T²
E  = 1 − 0.002516 T − 0.0000074 T²
```

Principal longitude perturbation terms (degrees):

```
Δλ ≈  6.288750 sinM'
    + 1.274018 sin(2D − M')
    + 0.658309 sin2D
    + 0.213616 sin2M'
    − 0.185596 E sinM
    − 0.114336 sin2F
    + …
```

Principal latitude perturbation terms (degrees):

```
Δβ ≈  5.128122 sinF
    + 0.280602 sin(M' + F)
    + 0.277693 sin(M' − F)
    + …
```

Distance perturbation (km):

```
Δr ≈ −20.905 cosM' − 3.249 cos(2D − M') − 1.649 cos2D + …
```

Ecliptic → equatorial:

```
x = r cosβ cosλ
y = r (cosε cosβ sinλ − sinε sinβ)
z = r (sinε cosβ sinλ + cosε sinβ)
```

Accuracy: ≈ ±10 km distance, ±0.1° longitude.

### Sub-Earth Point on Moon

```
d = −moonECI / |moonECI|
lat = arcsin(d_z)
lon = atan2(d_y, d_x)
```

Note: physical libration is not modelled.

### Near-Side Detection

```
near_side = |lon_wrapped| < 90°
```

---

## 4. Orbital Mechanics

> Source: [`js/orbit.js`](js/orbit.js), [`js/constants.js`](js/constants.js)

### Constants

| Symbol | Value | Description |
|--------|-------|-------------|
| μ_Earth | 3.986004418 × 10¹⁴ m³/s² | Earth GM |
| μ_Moon | 4.9048695 × 10¹² m³/s² | Moon GM |
| μ_Sun | 1.32712440018 × 10²⁰ m³/s² | Sun GM |
| c | 299 792 458 m/s | Speed of light |
| AU | 1.495978707 × 10¹¹ m | Astronomical unit |

### Vis-Viva Equation

```
v = √(μ (2/r − 1/a))
```

### Kepler's Third Law — Period

```
T = 2π √(a³ / μ)
```

### Mean Motion

```
n = √(μ / a³)        (rad/s)
```

### Circular & Escape Velocity

```
v_circ   = √(μ / r)
v_escape = √(2μ / r)
```

### Classical Orbital Elements (COE) → State Vector

```
p = a(1 − e²)                              (semi-latus rectum)
r = p / (1 + e cosν)                        (radius)
h = √(μ p)                                 (specific angular momentum)

Perifocal frame:
  r_pqw = [r cosν,  r sinν,  0]
  v_pqw = (μ/h) [−sinν,  e + cosν,  0]

Rotate by 3-1-3 Euler angles (−Ω, −i, −ω) → ECI
```

### State Vector → COE

```
h = r × v
e_vec = (v²/μ − 1/r) r − (r·v/μ) v
n_vec = ẑ × h                             (node vector)

a = −μ / (2 (v²/2 − μ/r))
e = |e_vec|
i = arccos(h_z / |h|)
Ω = arccos(n_x / |n|)      (if n_y < 0: Ω = 360° − Ω)
ω = arccos(n·e / |n||e|)   (if e_z < 0: ω = 360° − ω)
ν = arccos(e·r / |e||r|)   (if r·v < 0: ν = 360° − ν)
```

Special cases for circular (e ≈ 0) and equatorial (i ≈ 0) orbits
use argument of latitude or true longitude instead.

### Anomaly Conversions

**Eccentric ↔ True anomaly:**

```
ν = 2 atan2(√(1+e) sin(E/2),  √(1−e) cos(E/2))
E = 2 atan2(√(1−e) sin(ν/2),  √(1+e) cos(ν/2))
```

**Mean → Eccentric anomaly (Newton–Raphson):**

```
E₀ = M  (or π if e ≥ 0.8)
Iterate (≤ 100 steps, tol = 10⁻¹²):
  ΔE = (M − E + e sinE) / (1 − e cosE)
  E ← E + ΔE
```

### Keplerian Propagation

```
1.  ν₀ → E₀ → M₀ = E₀ − e sinE₀
2.  M(t) = (M₀ + n Δt) mod 2π
3.  Solve Kepler → E(t) → ν(t)
4.  COE → state vector at new ν
```

Two-body only; perturbations (J₂, drag, etc.) are not modelled.

### Hohmann Transfer (coplanar circular orbits)

```
a_t = (r₁ + r₂) / 2                       (transfer semi-major axis)
v_p = √(μ (2/r₁ − 1/a_t))                 (periapsis velocity)
v_a = √(μ (2/r₂ − 1/a_t))                 (apoapsis velocity)
Δv₁ = v_p − √(μ/r₁)                       (first burn)
Δv₂ = √(μ/r₂) − v_a                       (second burn)
t_transfer = π √(a_t³ / μ)                 (half-period of transfer)
```

### Simple Plane Change

```
Δv = 2 v sin(Δi / 2)
```

### RTN Frame (Radial–Transverse–Normal)

```
r̂ = r / |r|
n̂ = (r × v) / |r × v|
t̂ = n̂ × r̂
```

---

## 5. Visibility & Geometry

> Source: [`js/visibility.js`](js/visibility.js), [`js/earth.js`](js/earth.js)

### Eclipse Detection (conical shadow model)

```
sin θ_u = (R_sun − R_earth) / d_sun         (umbral half-angle)
sin θ_p = (R_sun + R_earth) / d_sun         (penumbral half-angle)

depth     = s_eci · (−sun_dir)               (distance along shadow axis)
perp_dist = |s − depth × sun_dir|            (distance from axis)
r_u = R_earth − tan(θ_u) × depth            (umbra radius at depth)
r_p = R_earth + tan(θ_p) × depth            (penumbra radius at depth)

in_umbra    = depth > 0  AND  perp_dist < r_u
in_penumbra = depth > 0  AND  NOT in_umbra  AND  perp_dist < r_p
```

### Earth Observer Visibility

1. Observer geodetic → ECEF
2. Target → ECEF
3. Δ ECEF → ENU
4. ENU → azimuth / elevation / range
5. Visible if elevation ≥ 0° and line-of-sight is clear

### Moon-Surface Visibility

Same flow as Earth observer, substituting selenographic coordinates
and lunar radius for the ray–sphere LOS check.

### Angular Radius of Earth (from spacecraft)

```
θ = arcsin(R_earth / |r_sc|)
```

### Lunar Grid Cells

> Source: [`js/grids.js`](js/grids.js)

```
row = min(numRows−1, ⌊(lat + 90) / cellSize⌋)
col = min(numCols−1, ⌊(lon + 180) / cellSize⌋)
cellId = "R" + zeroPad(row,3) + "C" + zeroPad(col,3)
```

**Spherical cell area:**

```
A = R_m² × Δλ_rad × (sin φ_max − sin φ_min)
```

**Earth-facing index** (near-side only):

```
index = |lon| / 90          (0 at sub-Earth, 1 at limb)
```

---

## 6. TLE Parsing

> Source: [`js/tle.js`](js/tle.js)

### Line Format

| Field | Line | Columns | Example | Description |
|-------|------|---------|---------|-------------|
| Catalog # | 1 | 03–07 | 25544 | NORAD ID |
| Epoch year | 1 | 19–20 | 24 | 2-digit year (≥57 → 1900s) |
| Epoch day | 1 | 21–32 | 046.29583 | Day of year + fraction |
| B* drag | 1 | 54–61 | 36557-4 | Modified scientific notation |
| Inclination | 2 | 09–16 | 51.6400 | Degrees |
| RAAN | 2 | 18–25 | 208.9163 | Degrees |
| Eccentricity | 2 | 27–33 | 0006703 | Implied leading "0." |
| Arg perigee | 2 | 35–42 | 130.5360 | Degrees |
| Mean anomaly | 2 | 44–51 | 229.6840 | Degrees |
| Mean motion | 2 | 53–63 | 15.72 | Revolutions / day |

### Checksum

```
sum = Σ digit_values + (count of '−' signs)
checksum = sum mod 10
```

### TLE Epoch → Julian Date

```
fullYear = epochYear ≥ 57 ? 1900 + epochYear : 2000 + epochYear
JD = dateToJD(fullYear, 1, 0) + epochDay
```

### TLE → Keplerian Elements

```
n = meanMotion_rev/day × 2π / 86400        (rad/s)
a = ∛(μ_Earth / n²)                        (semi-major axis)
T = 2π / n                                  (period, s)
```

Remaining elements (i, Ω, e, ω, M₀) are read directly from the TLE.

### Simplified Propagation from TLE

```
1.  Δt = (JD_target − JD_epoch) × 86400     (seconds)
2.  M  = (M₀ + n × Δt) mod 2π
3.  Solve Kepler → E → ν
4.  r  = a(1 − e cosE)
5.  Perifocal → ECI (3-1-3 Euler rotation)
6.  ECI → ECEF (rotate by GMST)
7.  ECEF → geodetic lat/lon/alt
```

Accuracy: errors ≈ km/day in LEO (no SGP4 perturbation model).

---

## Unit Conversions

> Source: [`js/units.js`](js/units.js)

| Conversion | Factor |
|------------|--------|
| m → km | ÷ 1 000 |
| m → statute mi | ÷ 1 609.344 |
| m → nautical mi | ÷ 1 852 |
| radians → degrees | × 180/π |
| seconds → minutes | ÷ 60 |
| seconds → hours | ÷ 3 600 |
| seconds → days | ÷ 86 400 |

Angle normalisation: `((x mod period) + period) mod period`.
