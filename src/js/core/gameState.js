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
