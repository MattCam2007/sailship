/**
 * Core game state management
 */

import {
    GAME_START_EPOCH,
    TIME_CONFIG,
    SPEED_PRESETS,
    ZOOM_LEVELS,
    DEFAULT_DISPLAY_OPTIONS,
    DEFAULT_TRAJECTORY_CONFIG,
    AUTOPILOT_CONFIG,
} from '../config.js';

// ============================================================================
// Time State
// ============================================================================

// Game time in days since start
export let time = 0;

// Julian date for orbital calculations
export let julianDate = GAME_START_EPOCH;

// Real-time base rate: 1 real second = 1 game second
const REAL_TIME_RATE = 1 / (TIME_CONFIG.secondsPerDay * TIME_CONFIG.assumedFPS);

// Current time scale (days per frame)
export let timeScale = REAL_TIME_RATE;

// Re-export speed presets for external use
export const speedPresets = SPEED_PRESETS;

// Current speed setting name
export let currentSpeed = '1x';

// ============================================================================
// Zoom State
// ============================================================================

// Re-export zoom levels for external use
export const zoomLevels = ZOOM_LEVELS;

// Current zoom setting
export let currentZoom = 'inner';
export let scale = zoomLevels[currentZoom];

// ============================================================================
// Display Options
// ============================================================================

export const displayOptions = { ...DEFAULT_DISPLAY_OPTIONS };

// ============================================================================
// Body Filters
// ============================================================================

export const bodyFilters = {
    planet: true,
    'dwarf-planet': true,
    'major-moon': true,
    'minor-moon': false,
    asteroid: false
};

// ============================================================================
// Trajectory Prediction Configuration
// ============================================================================

export const trajectoryConfig = { ...DEFAULT_TRAJECTORY_CONFIG };

// ============================================================================
// Focus Target
// ============================================================================

// Current focus target (name of object camera centers on)
export let focusTarget = null;  // null = player ship by default

// ============================================================================
// Autopilot State
// ============================================================================

/**
 * Autopilot phases:
 * - CRUISE: Optimize for intercept (raise/lower orbit toward target)
 * - APPROACH: Near SOI boundary, optimize for velocity matching
 * - CAPTURE: Inside SOI, circularize orbit around planet
 * - ESCAPE: Inside SOI, raise orbit to escape
 */
export const AUTOPILOT_PHASES = {
    CRUISE: 'CRUISE',
    APPROACH: 'APPROACH',
    CAPTURE: 'CAPTURE',
    ESCAPE: 'ESCAPE',
};

export const autoPilotState = {
    enabled: false,
    phase: AUTOPILOT_PHASES.CRUISE,
    adjustmentRateDegPerSec: AUTOPILOT_CONFIG.adjustmentRateDegPerSec,
    adjustmentRatePctPerSec: AUTOPILOT_CONFIG.adjustmentRatePctPerSec,
};

// ============================================================================
// Time Functions
// ============================================================================

/**
 * Enable or disable autopilot
 * @param {boolean} enabled
 */
export function setAutoPilotEnabled(enabled) {
    autoPilotState.enabled = enabled;
    if (!enabled) {
        // Reset to cruise when disabled
        autoPilotState.phase = AUTOPILOT_PHASES.CRUISE;
    }
}

/**
 * Check if autopilot is enabled
 * @returns {boolean}
 */
export function isAutoPilotEnabled() {
    return autoPilotState.enabled;
}

/**
 * Set autopilot phase
 * @param {string} phase - One of AUTOPILOT_PHASES
 */
export function setAutoPilotPhase(phase) {
    if (Object.values(AUTOPILOT_PHASES).includes(phase)) {
        autoPilotState.phase = phase;
    }
}

/**
 * Get current autopilot phase
 * @returns {string}
 */
export function getAutoPilotPhase() {
    return autoPilotState.phase;
}

/**
 * Advance game time and Julian date
 */
export function advanceTime() {
    time += timeScale;
    julianDate += timeScale;
}

/**
 * Get current time in days
 * @returns {number}
 */
export function getTime() {
    return time;
}

/**
 * Get current Julian date for orbital calculations
 * @returns {number}
 */
export function getJulianDate() {
    return julianDate;
}

// ============================================================================
// Zoom Functions
// ============================================================================

/**
 * Set zoom level
 * @param {string} zoomName - Zoom level name
 */
export function setZoom(zoomName) {
    if (zoomLevels[zoomName]) {
        currentZoom = zoomName;
        scale = zoomLevels[zoomName];
    }
}

/**
 * Get current scale
 * @returns {number}
 */
export function getScale() {
    return scale;
}

/**
 * Get current zoom name
 * @returns {string}
 */
export function getCurrentZoom() {
    return currentZoom;
}

// ============================================================================
// Display Functions
// ============================================================================

/**
 * Toggle display option
 * @param {string} option - Option name
 * @param {boolean} value - New value
 */
export function setDisplayOption(option, value) {
    if (option in displayOptions) {
        displayOptions[option] = value;
    }
}

// ============================================================================
// Body Filter Functions
// ============================================================================

/**
 * Save filter state to localStorage
 */
export function saveBodyFilters() {
    localStorage.setItem('bodyFilters', JSON.stringify(bodyFilters));
}

/**
 * Load filter state from localStorage
 */
export function loadBodyFilters() {
    const saved = localStorage.getItem('bodyFilters');
    if (saved) {
        const parsed = JSON.parse(saved);
        Object.assign(bodyFilters, parsed);
    }
}

// ============================================================================
// Trajectory Configuration Functions
// ============================================================================

/**
 * Set trajectory prediction duration
 * @param {number} days - Duration in days
 */
export function setTrajectoryDuration(days) {
    trajectoryConfig.durationDays = Math.max(
        trajectoryConfig.minDays,
        Math.min(trajectoryConfig.maxDays, days)
    );
}

/**
 * Get trajectory prediction duration
 * @returns {number}
 */
export function getTrajectoryDuration() {
    return trajectoryConfig.durationDays;
}

// ============================================================================
// Intersection Cache Management
// ============================================================================

/**
 * Intersection cache stores detected trajectory/orbit crossings
 *
 * CRITICAL FIX (F1): Uses trajectory hash directly from trajectory predictor
 * to ensure cache invalidates when trajectory shape changes (not just length)
 *
 * Cache structure:
 * {
 *   trajectoryHash: string (from trajectory-predictor),
 *   results: Array of intersection events,
 *   timestamp: performance.now() when cached
 * }
 */
let intersectionCache = {
    trajectoryHash: null,
    results: [],
    timestamp: 0
};

/**
 * Get intersection cache
 * @returns {Object} Cache object with {trajectoryHash, results, timestamp}
 */
export function getIntersectionCache() {
    return intersectionCache;
}

/**
 * Set intersection cache with new results
 * @param {string} trajectoryHash - Hash from trajectory predictor
 * @param {Array} results - Array of intersection events
 */
export function setIntersectionCache(trajectoryHash, results) {
    intersectionCache = {
        trajectoryHash,
        results,
        timestamp: performance.now()
    };
}

/**
 * Clear intersection cache
 * Called when trajectory cache clears (FIX A2: coupling)
 */
export function clearIntersectionCache() {
    intersectionCache = {
        trajectoryHash: null,
        results: [],
        timestamp: 0
    };
}

/**
 * Check if intersection cache is valid for given trajectory hash
 *
 * FIX (F1): Validates against trajectory predictor's hash
 * This prevents stale intersection data when trajectory shape changes
 *
 * @param {string} currentTrajectoryHash - Current hash from trajectory predictor
 * @returns {boolean} True if cache is valid and fresh
 */
export function isIntersectionCacheValid(currentTrajectoryHash) {
    if (!intersectionCache.trajectoryHash) return false;
    if (intersectionCache.trajectoryHash !== currentTrajectoryHash) return false;

    // 500ms TTL (same as trajectory predictor cache)
    const age = performance.now() - intersectionCache.timestamp;
    return age < 500;
}

// ============================================================================
// Focus Functions
// ============================================================================

/**
 * Set focus target
 * @param {string|null} targetName - Object name or null for player ship
 */
export function setFocusTarget(targetName) {
    focusTarget = targetName;
}

/**
 * Get current focus target
 * @returns {string|null}
 */
export function getFocusTarget() {
    return focusTarget;
}

// ============================================================================
// Speed Functions
// ============================================================================

/**
 * Set time scale (game speed)
 * @param {string} speedName - Speed preset name
 */
export function setSpeed(speedName) {
    if (!speedPresets[speedName]) {
        console.warn(`Unknown speed preset: ${speedName}`);
        return;
    }

    // Prevent speed changes in planning mode (time is frozen)
    // This check is needed because UI speed buttons should be blocked
    if (planningModeState.enabled) {
        console.warn('[PLANNING] Cannot change speed in planning mode - simulation frozen');
        return;
    }

    currentSpeed = speedName;
    timeScale = speedPresets[speedName];
}

/**
 * Get current speed name
 * @returns {string}
 */
export function getCurrentSpeed() {
    return currentSpeed;
}

/**
 * Set custom time scale (game speed) by multiplier value
 * @param {number} multiplier - Speed multiplier (1.0 = normal speed)
 */
export function setCustomSpeed(multiplier) {
    const value = Math.max(0, multiplier);
    currentSpeed = 'custom';
    timeScale = value * REAL_TIME_RATE;
}

// ============================================================================
// Time Travel State (astronomy-engine integration)
// ============================================================================

/**
 * Time Travel State
 *
 * Allows players to position planets at any historical/future date using
 * accurate ephemeris data from astronomy-engine.
 *
 * This is SEPARATE from simulation time (time, julianDate above).
 * - Simulation time: Game progression (player ship physics)
 * - Ephemeris time: Where planets are positioned for display
 *
 * When enabled, celestial bodies use ephemeris data instead of Keplerian propagation.
 */
export const timeTravelState = {
    enabled: false,
    referenceDate: new Date(),  // "Now" = slider center position
    offsetDays: 0,              // Days offset from reference (slider position)
    scale: 'month',             // Time scale: 'hour' | 'day' | 'week' | 'month' | 'year'
};

/**
 * Time scales define how much time ±100% slider movement represents
 */
export const TIME_SCALES = {
    hour: 1/24,      // ±1 hour
    day: 1,          // ±1 day
    week: 7,         // ±1 week
    month: 30,       // ±1 month
    year: 365,       // ±1 year
    decade: 3650,    // ±10 years
    century: 36500,  // ±100 years
};

/**
 * Planning mode state
 *
 * When enabled:
 * - Simulation is frozen (timeScale forced to 0)
 * - Ship position calculated at ephemeris date (not simulation date)
 * - Trajectory predicts from ephemeris date
 * - All visualizations synchronized to ephemeris date
 *
 * Files that MUST use getActiveJulianDate() for planning mode support:
 * - shipPhysics.js (ship position calculation)
 * - celestialBodies.js (planet positioning)
 * - renderer.js (trajectory prediction)
 * - main.js (intersection detection)
 *
 * When adding new date-dependent features, use getActiveJulianDate()
 * instead of getJulianDate() for rendering/visualization.
 */
export const planningModeState = {
    enabled: false,                    // Planning mode active
    frozenSpeed: null,                 // Saved speed when entering planning mode
    frozenJulianDate: null,            // Saved simulation date when entering planning
};

/**
 * Enable or disable planning mode
 * @param {boolean} enabled - Whether to enable planning mode
 * @throws {Error} If date conversion fails or time travel cannot be enabled
 */
export function setPlanningMode(enabled) {
    if (enabled === planningModeState.enabled) {
        return; // No change needed
    }

    planningModeState.enabled = enabled;

    if (enabled) {
        // Entering planning mode
        try {
            // Save current state
            planningModeState.frozenSpeed = currentSpeed;
            planningModeState.frozenJulianDate = julianDate;

            // Freeze simulation (single time-blocking strategy: timeScale = 0)
            // This is the ONLY mechanism for blocking time advancement
            // Planning mode is conceptually a "smart pause" with time travel
            timeScale = 0;

            // Enable time travel if not already enabled
            if (!timeTravelState.enabled) {
                setTimeTravelEnabled(true);

                // Convert Julian date to JS Date for reference
                const currentDate = julianToDate(julianDate);
                if (!currentDate || isNaN(currentDate.getTime())) {
                    throw new Error('Failed to convert Julian date to calendar date');
                }

                setReferenceDate(currentDate);
                setTimeOffset(0); // Start at current simulation date
            }

            console.log('[PLANNING] Entered planning mode - simulation frozen at JD',
                julianDate.toFixed(2));
        } catch (error) {
            console.error('[PLANNING] Failed to enable planning mode:', error);

            // Rollback state
            planningModeState.enabled = false;
            planningModeState.frozenSpeed = null;
            planningModeState.frozenJulianDate = null;

            throw error;
        }
    } else {
        // Exiting planning mode

        // Validate and restore speed
        const speedToRestore = speedPresets[planningModeState.frozenSpeed] !== undefined
            ? planningModeState.frozenSpeed
            : 'pause'; // Fallback to pause if frozen speed is invalid

        setSpeed(speedToRestore);

        console.log('[PLANNING] Exited planning mode - simulation resumed at speed',
            currentSpeed);

        // Clear frozen state
        planningModeState.frozenSpeed = null;
        planningModeState.frozenJulianDate = null;
    }
}

/**
 * Check if planning mode is active
 * @returns {boolean} True if in planning mode
 */
export function isPlanningMode() {
    return planningModeState.enabled;
}

/**
 * Get the "active date" for calculations
 * - In planning mode: returns ephemeris date
 * - In live mode: returns simulation date
 * @returns {number} Julian date
 */
export function getActiveJulianDate() {
    return planningModeState.enabled ? getEphemerisJulianDate() : julianDate;
}

/**
 * Enable or disable time travel feature
 * @param {boolean} enabled
 */
export function setTimeTravelEnabled(enabled) {
    timeTravelState.enabled = enabled;
}

/**
 * Set reference date ("now" = slider center)
 * @param {Date} date - JavaScript Date object
 */
export function setReferenceDate(date) {
    // Clamp to astronomy-engine valid range: 1900-2100
    const minDate = new Date('1900-01-01T00:00:00Z');
    const maxDate = new Date('2100-12-31T23:59:59Z');

    if (date < minDate) date = minDate;
    if (date > maxDate) date = maxDate;

    timeTravelState.referenceDate = date;
}

/**
 * Set time offset in days (slider position)
 * @param {number} days - Days offset from reference date
 */
export function setTimeOffset(days) {
    timeTravelState.offsetDays = days;
}

/**
 * Set time scale (defines slider range)
 * @param {string} scale - One of TIME_SCALES keys
 */
export function setTimeScale(scale) {
    if (TIME_SCALES[scale] !== undefined) {
        timeTravelState.scale = scale;
    }
}

/**
 * Get absolute ephemeris date (reference + offset)
 * @returns {Date} JavaScript Date object
 */
export function getEphemerisDate() {
    const offsetMs = timeTravelState.offsetDays * 86400000;  // days to milliseconds
    return new Date(timeTravelState.referenceDate.getTime() + offsetMs);
}

/**
 * Get ephemeris Julian date for orbital calculations
 * @returns {number} Julian date
 */
export function getEphemerisJulianDate() {
    const date = getEphemerisDate();
    // JS Date → Julian Date: (ms / ms_per_day) + JD_of_unix_epoch
    return (date.getTime() / 86400000) + 2440587.5;
}

/**
 * Convert Julian date to JavaScript Date
 * @param {number} jd - Julian date
 * @returns {Date} JavaScript Date object
 */
export function julianToDate(jd) {
    return new Date((jd - 2440587.5) * 86400000);
}

/**
 * Convert JavaScript Date to Julian date
 * @param {Date} date - JavaScript Date object
 * @returns {number} Julian date
 */
export function dateToJulian(date) {
    return (date.getTime() / 86400000) + 2440587.5;
}
