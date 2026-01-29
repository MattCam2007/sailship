/**
 * Central configuration for all tunable game settings.
 *
 * This file is the single source of truth for gameplay parameters,
 * physics constants, and display settings. Modify values here to
 * adjust game balance without touching logic code.
 */

import { J2000 } from './lib/orbital.js';

// ============================================================================
// Time Configuration
// ============================================================================

/**
 * Game starting epoch as Julian date.
 * J2000 + 7305 days ≈ year 2020, giving a reasonable planetary configuration.
 */
export const GAME_START_EPOCH = J2000 + 7305;

/**
 * Time calculation constants for game speed.
 */
export const TIME_CONFIG = {
    secondsPerDay: 86400,
    assumedFPS: 60,
};

/**
 * Speed presets as multipliers of real time.
 * At 1x: real time (Earth orbits in 365 real days)
 * At 100000x: Earth orbits in ~5 minutes
 */
const REAL_TIME_RATE = 1 / (TIME_CONFIG.secondsPerDay * TIME_CONFIG.assumedFPS);

export const SPEED_PRESETS = {
    pause: 0,
    '1x': 1 * REAL_TIME_RATE,
    '100x': 100 * REAL_TIME_RATE,
    '10000x': 10000 * REAL_TIME_RATE,
    '100000x': 100000 * REAL_TIME_RATE,
    '1000000x': 1000000 * REAL_TIME_RATE,
};

// ============================================================================
// Ship Configuration
// ============================================================================

/**
 * Default ship mass in kg.
 *
 * A crewed solar sail ship with life support, cargo, and structure
 * might mass around 10,000 kg (10 metric tons). This gives a
 * reasonable characteristic acceleration.
 */
export const DEFAULT_SHIP_MASS = 10000;

/**
 * Default sail configuration for player ship.
 *
 * A 1 km² sail is a reasonable size for a crewed solar sail vessel.
 * The IKAROS mission used a 200 m² sail, while proposed missions
 * like Sunjammer would have used 1200 m².
 *
 * At 1 AU with this configuration:
 * - Thrust = 2 * 4.56e-6 * 1e6 * 0.9 ≈ 8.2 N
 * - For a 10,000 kg ship: a ≈ 8.2e-4 m/s² ≈ 0.84 mm/s²
 * - This is about 0.00008 g (very gentle acceleration)
 */
export const DEFAULT_SAIL = {
    area: 3000000,           // m² (1 km² = 1,000,000 m²)
    reflectivity: 0.9,       // 90% reflective (good aluminum coating)
    angle: 0.6,              // ~35° - near optimal for orbit raising
    pitchAngle: 0,           // Out-of-plane angle (radians) - 0 = in orbital plane
    deploymentPercent: 100,  // Fully deployed
    condition: 100,          // Perfect condition
    sailCount: 1,            // Number of sails (1-20) - multiplies thrust linearly
};

// ============================================================================
// Autopilot Configuration
// ============================================================================

/**
 * Autopilot adjustment rates.
 * Controls how quickly the autopilot can change sail settings.
 */
export const AUTOPILOT_CONFIG = {
    adjustmentRateDegPerSec: 5,     // degrees per second for angle
    adjustmentRatePctPerSec: 10,    // percent per second for deployment
};

// ============================================================================
// Physics Constants
// ============================================================================

/**
 * Solar radiation pressure at 1 AU in N/m²
 *
 * The solar constant at 1 AU is approximately 1361 W/m².
 * Radiation pressure P = S/c where c = speed of light.
 * P = 1361 / 299792458 ≈ 4.54e-6 N/m²
 *
 * For a perfectly reflective sail, the effective pressure is doubled
 * due to momentum change (incoming + reflected photons).
 */
export const SOLAR_PRESSURE_1AU = 4.56e-6; // N/m²

/**
 * Conversion factor from m/s² to AU/day² for sail acceleration.
 *
 * 1 AU = 1.495978707e11 m
 * 1 day = 86400 s
 *
 * Acceleration in AU/day² = accel in m/s² * (86400²) / (1.495978707e11)
 */
export const ACCEL_CONVERSION = (86400 * 86400) / 1.495978707e11;

/**
 * Gravitational parameters in AU³/day² for planetary systems.
 * Used for moon orbits and SOI mechanics.
 *
 * Calculated from GM values converted to AU³/day²:
 * 1 AU = 1.495978707e11 m, 1 day = 86400 s
 * Conversion: GM (m³/s²) * (86400²) / (1.495978707e11)³
 */
export const GRAVITATIONAL_PARAMS = {
    mercury: 4.9125e-12,        // GM = 2.2032e13 m³/s²
    venus: 7.2435e-10,          // GM = 3.2486e14 m³/s²
    earth: 8.887692445e-10,     // GM = 3.986e14 m³/s²
    mars: 9.549535105e-11,      // GM = 4.283e13 m³/s²
    jupiter: 2.824760519e-7,    // GM = 1.267e17 m³/s²
    saturn: 8.4597151e-8,       // GM = 3.794e16 m³/s²
    uranus: 1.2920249e-8,       // GM = 5.7945e15 m³/s²
    neptune: 1.5243596e-8,      // GM = 6.8365e15 m³/s²
    pluto: 1.96e-12,            // GM = 8.7e11 m³/s²
};

/**
 * Sphere of Influence radii in AU.
 *
 * GAMEPLAY VALUES - enlarged for easier capture.
 * Realistic values commented out for reference.
 *
 * Realistic (Hill sphere): r_SOI = a * (m_planet / m_sun)^0.4
 */
export const SOI_RADII = {
    MERCURY: 0.1,       // Realistic: 0.00112
    VENUS: 0.1,         // Realistic: 0.00411
    EARTH: 0.1,         // Realistic: 0.00620
    MARS: 0.1,          // Realistic: 0.00386
    JUPITER: 0.4,       // Realistic: 0.3219
};

/**
 * Physics simulation configuration.
 * Controls numerical stability and simulation behavior.
 */
export const PHYSICS_CONFIG = {
    /**
     * Eccentricity threshold for extreme hyperbolic flybys.
     * When e > this value, use linear interpolation instead of Keplerian math
     * to avoid numerical instability near asymptotes.
     */
    extremeEccentricityThreshold: 50,

    /**
     * SOI transition cooldown in game days.
     * Prevents rapid entry/exit oscillation at SOI boundaries.
     * ~2.4 hours at default time scale.
     */
    soiTransitionCooldown: 0.1,

    /**
     * Visual orbital element smoothing rate.
     * Higher = faster response, lower = smoother transitions.
     * 0.25 means visual elements move 25% toward actual elements per frame.
     */
    visualElementLerpRate: 0.25,

    /**
     * Minimum periapsis multiplier for collision detection.
     * Periapsis must be at least planet radius × this value.
     * 1.1 = 10% safety margin above surface.
     */
    minPeriapsisMultiplier: 1.1,
};

// ============================================================================
// Display Configuration
// ============================================================================

/**
 * Zoom levels in pixels per AU.
 */
export const ZOOM_LEVELS = {
    system: 50,       // Whole solar system view
    inner: 200,       // Inner planets
    local: 800,       // Single planet region
    tactical: 3000,   // Close tactical view
    approach: 12000,  // Planet approach scale
    orbital: 50000,   // High orbit scale (~50,000-200,000 km altitude)
};

/**
 * Scale-based rendering configuration.
 * Controls transition from fixed-size to physically-scaled planet rendering.
 */
export const SCALE_RENDERING_CONFIG = {
    minScreenSize: 20,      // Start blend transition (pixels)
    maxScreenSize: 100,     // End blend transition (pixels)
    sunAlwaysScaled: true,  // Sun bypasses fixed rendering
    kmToAU: 1 / 149597870.7 // km to AU conversion constant
};

/**
 * Default trajectory prediction configuration.
 * Controls how far into the future the predicted path extends.
 */
export const DEFAULT_TRAJECTORY_CONFIG = {
    durationDays: 60,      // Default prediction length
    minDays: 30,           // Minimum allowed
    maxDays: 730,          // Maximum: 2 years
};

/**
 * Default display options.
 */
export const DEFAULT_DISPLAY_OPTIONS = {
    showStarfield: true,            // Background star map with date-accurate positions
    showOrbits: true,
    showLabels: true,
    showTrajectory: true,
    showGrid: true,
    showPredictedTrajectory: true,  // Spiral path showing where ship will go with thrust
    showIntersectionMarkers: true,  // Ghost planets at trajectory intersection points
};

/**
 * Visual properties for celestial bodies.
 * Keyed by body name, contains display-only properties.
 *
 * radius: Fixed pixel size for small/distant rendering
 * physicalRadiusKm: Actual astronomical radius for scale calculations
 * color: Visual color
 */
export const BODY_DISPLAY = {
    // Sun
    SOL:      { radius: 15, color: '#ffdd44', physicalRadiusKm: 696000 },

    // Planets
    MERCURY:  { radius: 4,  color: '#b5b5b5', physicalRadiusKm: 2440 },
    VENUS:    { radius: 6,  color: '#e8c44c', physicalRadiusKm: 6052 },
    EARTH:    { radius: 6,  color: '#4c9ee8', physicalRadiusKm: 6371 },
    MARS:     { radius: 5,  color: '#e85d4c', physicalRadiusKm: 3390 },
    JUPITER:  { radius: 12, color: '#d4a574', physicalRadiusKm: 69911 },
    SATURN:   { radius: 11, color: '#fad5a5', physicalRadiusKm: 58232 },
    URANUS:   { radius: 9,  color: '#afd5e8', physicalRadiusKm: 25362 },
    NEPTUNE:  { radius: 9,  color: '#5b7fcf', physicalRadiusKm: 24622 },

    // Dwarf Planets
    CERES:    { radius: 3,  color: '#888888', physicalRadiusKm: 476 },
    PLUTO:    { radius: 3,  color: '#d4c4a4', physicalRadiusKm: 1188 },
    ERIS:     { radius: 3,  color: '#b4a494', physicalRadiusKm: 1163 },
    MAKEMAKE: { radius: 3,  color: '#c4b4a4', physicalRadiusKm: 715 },
    HAUMEA:   { radius: 3,  color: '#a49484', physicalRadiusKm: 816 },

    // Major Moons - Earth
    LUNA:     { radius: 3,  color: '#c0c0c0', physicalRadiusKm: 1737 },

    // Major Moons - Mars
    PHOBOS:   { radius: 2,  color: '#8c6c5c', physicalRadiusKm: 11 },
    DEIMOS:   { radius: 2,  color: '#9c7c6c', physicalRadiusKm: 6 },

    // Major Moons - Jupiter
    IO:       { radius: 4,  color: '#e8d85c', physicalRadiusKm: 1822 },
    EUROPA:   { radius: 3,  color: '#c4b8a4', physicalRadiusKm: 1561 },
    GANYMEDE: { radius: 4,  color: '#999999', physicalRadiusKm: 2634 },
    CALLISTO: { radius: 4,  color: '#787878', physicalRadiusKm: 2410 },

    // Major Moons - Saturn
    MIMAS:    { radius: 2,  color: '#d8d4c8', physicalRadiusKm: 198 },
    ENCELADUS:{ radius: 2,  color: '#f0ece0', physicalRadiusKm: 252 },
    TETHYS:   { radius: 3,  color: '#e0dcd0', physicalRadiusKm: 531 },
    DIONE:    { radius: 3,  color: '#d0ccc0', physicalRadiusKm: 561 },
    RHEA:     { radius: 3,  color: '#c8c4b8', physicalRadiusKm: 764 },
    TITAN:    { radius: 5,  color: '#e8a85c', physicalRadiusKm: 2575 },
    IAPETUS:  { radius: 3,  color: '#b8b4a8', physicalRadiusKm: 735 },

    // Major Moons - Uranus
    MIRANDA:  { radius: 2,  color: '#b8c4d0', physicalRadiusKm: 236 },
    ARIEL:    { radius: 3,  color: '#c0ccd8', physicalRadiusKm: 579 },
    UMBRIEL:  { radius: 3,  color: '#989ca4', physicalRadiusKm: 585 },
    TITANIA:  { radius: 3,  color: '#d0d8e0', physicalRadiusKm: 789 },
    OBERON:   { radius: 3,  color: '#c4ccd4', physicalRadiusKm: 761 },

    // Major Moons - Neptune
    TRITON:   { radius: 4,  color: '#d8c4d0', physicalRadiusKm: 1353 },
    PROTEUS:  { radius: 2,  color: '#a0a8b0', physicalRadiusKm: 210 },

    // Major Moons - Pluto
    CHARON:   { radius: 3,  color: '#b4a8a0', physicalRadiusKm: 606 },

    // Minor Moons - Jupiter
    AMALTHEA: { radius: 2,  color: '#887860', physicalRadiusKm: 83 },
    THEBE:    { radius: 2,  color: '#786850', physicalRadiusKm: 49 },
    HIMALIA:  { radius: 2,  color: '#888878', physicalRadiusKm: 85 },
    ELARA:    { radius: 2,  color: '#787868', physicalRadiusKm: 43 },

    // Minor Moons - Saturn
    HYPERION: { radius: 2,  color: '#c8c0b4', physicalRadiusKm: 135 },
    PHOEBE:   { radius: 2,  color: '#685850', physicalRadiusKm: 106 },
    JANUS:    { radius: 2,  color: '#d0c8bc', physicalRadiusKm: 90 },
    EPIMETHEUS:{ radius: 2, color: '#c8c0b4', physicalRadiusKm: 58 },

    // Minor Moons - Uranus
    PUCK:     { radius: 2,  color: '#a8b0b8', physicalRadiusKm: 81 },

    // Minor Moons - Neptune
    NEREID:   { radius: 2,  color: '#888898', physicalRadiusKm: 170 },
    LARISSA:  { radius: 2,  color: '#989ca8', physicalRadiusKm: 97 },

    // Asteroids
    VESTA:    { radius: 3,  color: '#a89878', physicalRadiusKm: 263 },
    PALLAS:   { radius: 3,  color: '#988870', physicalRadiusKm: 256 },
    JUNO:     { radius: 2,  color: '#887860', physicalRadiusKm: 123 },
    HYGIEA:   { radius: 3,  color: '#786850', physicalRadiusKm: 217 },
    EROS:     { radius: 2,  color: '#888878', physicalRadiusKm: 8 },
};

/**
 * Default colors for ships by faction/type.
 */
export const SHIP_COLORS = {
    player: '#4ce88d',
    mcrn: '#e85d4c',
    unn: '#4c9ee8',
};
