/**
 * Trajectory Predictor
 *
 * Computes predicted ship trajectory accounting for continuous thrust.
 * Returns an array of future positions for visualization as a spiral path.
 *
 * This is ADDITIVE to the existing Keplerian orbit display - it shows
 * where the ship will ACTUALLY go with current thrust, not the
 * instantaneous orbit if thrust stopped.
 */

import { getPosition, getVelocity } from './orbital.js';
import { calculateSailThrust, applyThrust } from './orbital-maneuvers.js';
import { SOI_RADII } from '../config.js';

// Configuration constants
const DEFAULT_DURATION_DAYS = 60;
const DEFAULT_STEPS = 200;
const DEFAULT_MASS_KG = 10000;
const CACHE_TTL_MS = 500;  // Increased from 100ms to 500ms for better performance
const MIN_THRUST_THRESHOLD = 1e-20;
const MAX_HELIOCENTRIC_RADIUS = 10;  // Stop prediction at 10 AU (beyond Jupiter)
const MIN_HELIOCENTRIC_RADIUS = 0.01;  // Stop prediction at 0.01 AU (sun collision, ~1.5M km)

// Cache for trajectory prediction
let trajectoryCache = {
    trajectory: null,
    lastUpdate: 0,
    inputHash: null
};

/**
 * Generate a hash of inputs for cache invalidation.
 */
function hashInputs(params) {
    const { orbitalElements, sail, mass, startTime, duration, steps, soiState } = params;
    return JSON.stringify({
        a: orbitalElements.a,
        e: orbitalElements.e,
        i: orbitalElements.i,
        Ω: orbitalElements.Ω,
        ω: orbitalElements.ω,
        M0: orbitalElements.M0,
        sailAngle: sail.angle,
        sailPitch: sail.pitchAngle || 0,
        sailDeploy: sail.deploymentPercent,
        mass,
        startTime: Math.round(startTime * 1000),  // Round to avoid floating point issues
        duration,
        steps,
        soiBody: soiState?.currentBody || 'SUN',
        isInSOI: soiState?.isInSOI || false
    });
}

/**
 * Predict trajectory with continuous thrust.
 *
 * Propagates the ship's orbit forward in time, applying sail thrust at each
 * step, to produce a predicted path. With zero thrust, this matches the
 * Keplerian orbit exactly.
 *
 * The prediction stops at SOI boundaries (v1 behavior) rather than
 * attempting to cross them, as SOI transitions are significant events
 * that deserve user attention.
 *
 * @param {Object} params - Prediction parameters
 * @param {Object} params.orbitalElements - Starting Keplerian elements
 * @param {Object} params.sail - Sail configuration {area, reflectivity, angle, pitchAngle, deploymentPercent, condition}
 * @param {number} params.mass - Ship mass in kg
 * @param {number} params.startTime - Julian date to start from
 * @param {number} params.duration - Days to predict ahead (default 60)
 * @param {number} params.steps - Number of position samples (default 200)
 * @param {Object} params.soiState - SOI state {currentBody, isInSOI}
 * @returns {Array} Array of {x, y, z, time, truncated?} positions in AU
 */
export function predictTrajectory(params) {
    const {
        orbitalElements,
        sail,
        mass = DEFAULT_MASS_KG,
        startTime,
        duration = DEFAULT_DURATION_DAYS,
        steps = DEFAULT_STEPS,
        soiState = null
    } = params;

    // Check cache
    const now = Date.now();
    const hash = hashInputs(params);

    if (trajectoryCache.trajectory &&
        trajectoryCache.inputHash === hash &&
        (now - trajectoryCache.lastUpdate) < CACHE_TTL_MS) {
        return trajectoryCache.trajectory;
    }

    // Propagate trajectory
    const trajectory = [];
    const timeStep = duration / steps;

    // Clone orbital elements for simulation (don't modify original)
    let simElements = { ...orbitalElements };

    // Check if thrust is effectively zero
    const effectiveThrust = sail.deploymentPercent > 0 &&
                            sail.area > 0 &&
                            (sail.condition || 100) > 0;

    // Determine SOI boundary for truncation
    const isInSOI = soiState?.isInSOI || false;
    const currentBody = soiState?.currentBody || 'SUN';
    const soiRadius = isInSOI && currentBody !== 'SUN'
        ? (SOI_RADII[currentBody] || 0.1)
        : null;

    for (let i = 0; i < steps; i++) {
        const simTime = startTime + i * timeStep;

        // Get position from current orbital elements
        const position = getPosition(simElements, simTime);

        // Validate position (guard against numerical issues)
        if (!isFinite(position.x) || !isFinite(position.y) || !isFinite(position.z)) {
            // If we hit numerical issues, stop propagation here
            console.warn(`[TRAJECTORY] Invalid position at step ${i}, truncating`);
            break;
        }

        // Calculate distance from origin (Sun or parent body)
        const distFromOrigin = Math.sqrt(
            position.x ** 2 + position.y ** 2 + position.z ** 2
        );

        // SOI boundary check
        if (isInSOI && soiRadius) {
            // When in SOI, stop if we exceed SOI radius (escape)
            if (distFromOrigin > soiRadius * 1.1) {
                // Don't push this position - beyond SOI boundary
                // Mark previous point as truncated
                if (trajectory.length > 0) {
                    trajectory[trajectory.length - 1].truncated = 'SOI_EXIT';
                }
                break;
            }
        } else {
            // When heliocentric, check boundary conditions
            // Stop at maximum display distance (too far out)
            if (distFromOrigin > MAX_HELIOCENTRIC_RADIUS) {
                // Don't push this position - it's beyond boundary
                // Mark previous point as truncated
                if (trajectory.length > 0) {
                    trajectory[trajectory.length - 1].truncated = 'MAX_DISTANCE';
                }
                break;
            }

            // Stop when approaching sun too closely
            // At < 2× collision radius, orbital mechanics break down (high eccentricity, small semi-major axis)
            // getPosition() produces invalid geometry (90° turns, straight lines, hyperbolic paths)
            if (distFromOrigin < MIN_HELIOCENTRIC_RADIUS * 2.0) {
                // Mark previous point as truncated and stop cleanly
                if (trajectory.length > 0) {
                    trajectory[trajectory.length - 1].truncated = 'SUN_APPROACH';
                }
                break;
            }
        }

        // Position passed all checks - safe to add to trajectory
        trajectory.push({
            x: position.x,
            y: position.y,
            z: position.z,
            time: simTime
        });

        // Apply thrust for next step (if not last step and thrust is active)
        // Don't apply thrust if too close to sun - physics breaks down and corrupts orbital elements
        const tooCloseToSun = !isInSOI && distFromOrigin < MIN_HELIOCENTRIC_RADIUS * 2.0;

        if (i < steps - 1 && effectiveThrust && !tooCloseToSun) {
            const velocity = getVelocity(simElements, simTime);

            // Calculate distance from sun for solar pressure
            // For SOI, we need heliocentric distance - approximate with origin distance
            // (This is a simplification; full accuracy would need planet positions)
            const distFromSun = isInSOI ? 1.0 : distFromOrigin;  // Assume ~1 AU when in SOI

            // Calculate thrust vector
            const thrust = calculateSailThrust(
                sail,
                position,
                velocity,
                distFromSun,
                mass
            );

            // Check if thrust is significant
            const thrustMag = Math.sqrt(thrust.x ** 2 + thrust.y ** 2 + thrust.z ** 2);

            if (thrustMag > MIN_THRUST_THRESHOLD) {
                // Apply thrust to get new orbital elements
                const newElements = applyThrust(simElements, thrust, timeStep, simTime);

                // Validate new orbital elements to prevent angular momentum flips
                // Check for NaN or extreme values that indicate numerical breakdown
                if (!isFinite(newElements.a) || !isFinite(newElements.e) ||
                    !isFinite(newElements.i) || !isFinite(newElements.Ω) ||
                    !isFinite(newElements.ω) || !isFinite(newElements.M0)) {
                    // Orbital elements corrupted - stop trajectory here
                    if (trajectory.length > 0) {
                        trajectory[trajectory.length - 1].truncated = 'ORBITAL_INSTABILITY';
                    }
                    break;
                }

                // Check for extreme eccentricity that indicates instability
                if (newElements.e > 0.99 || newElements.e < 0) {
                    // Eccentricity becoming hyperbolic or negative - stop
                    if (trajectory.length > 0) {
                        trajectory[trajectory.length - 1].truncated = 'ECCENTRIC_INSTABILITY';
                    }
                    break;
                }

                simElements = newElements;
            }
        }
    }

    // Update cache
    trajectoryCache = {
        trajectory,
        lastUpdate: now,
        inputHash: hash
    };

    return trajectory;
}

/**
 * Clear the trajectory cache.
 * Call this when sail settings change significantly or ship state changes.
 *
 * NOTE: Intersection cache is coupled to trajectory cache and should be cleared
 * when this is called. This is handled in gameState.js to avoid circular dependencies.
 */
export function clearTrajectoryCache() {
    trajectoryCache = {
        trajectory: null,
        lastUpdate: 0,
        inputHash: null
    };
}

/**
 * Get cached trajectory if available, null otherwise.
 * Useful for checking cache state without triggering recalculation.
 */
export function getCachedTrajectory() {
    const now = Date.now();
    if (trajectoryCache.trajectory &&
        (now - trajectoryCache.lastUpdate) < CACHE_TTL_MS) {
        return trajectoryCache.trajectory;
    }
    return null;
}

/**
 * Get the hash of the cached trajectory inputs.
 * Used by intersection detector to synchronize cache invalidation.
 *
 * @returns {string|null} Hash string if cache is valid, null otherwise
 */
export function getTrajectoryHash() {
    const now = Date.now();
    if (trajectoryCache.inputHash &&
        (now - trajectoryCache.lastUpdate) < CACHE_TTL_MS) {
        return trajectoryCache.inputHash;
    }
    return null;
}

console.log('[TRAJECTORY_PREDICTOR] Module loaded');
