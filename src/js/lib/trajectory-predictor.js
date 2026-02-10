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

import { getPosition, getVelocity, MU_SUN } from './orbital.js';
import { calculateSailThrust, applyThrust } from './orbital-maneuvers.js';
import { SOI_RADII, PHYSICS_CONFIG, TRAJECTORY_ROBUSTNESS, TRAJECTORY_RENDER_CONFIG } from '../config.js';
import { getBodyByName } from '../data/celestialBodies.js';
import { getGravitationalParam } from './soi.js';

// SOI trajectory diagnostic - tracks one-shot logging per SOI stay
let soiTrajDiag = {
    lastLoggedSOIBody: null,   // Prevent repeated logging for same SOI stay
    lastLoggedReason: null,    // Last truncation reason logged (once per SOI stay)
};

// Configuration constants
const DEFAULT_DURATION_DAYS = 60;
const DEFAULT_MASS_KG = 10000;
const MIN_THRUST_THRESHOLD = 1e-20;
const MAX_HELIOCENTRIC_RADIUS = 50;  // Stop prediction at 50 AU (covers classical solar system through Neptune/Pluto)
const MIN_HELIOCENTRIC_RADIUS = 0.01;  // Stop prediction at 0.01 AU (sun collision, ~1.5M km)

// Cache TTL configuration
// Uses adaptive TTL: shorter when trajectory is changing, longer when stable
const CACHE_CONFIG = {
    baseTTL: 500,           // Base TTL in ms (when trajectory is changing)
    stableTTL: 2000,        // Extended TTL when trajectory is stable
    stableThreshold: 3      // Number of frames with same hash to consider "stable"
};

// Use the same threshold as shipPhysics for consistency
const EXTREME_ECCENTRICITY_THRESHOLD = PHYSICS_CONFIG?.extremeEccentricityThreshold || 50;

// Cache for trajectory prediction
let trajectoryCache = {
    trajectory: null,
    lastUpdate: 0,
    inputHash: null,
    stableCount: 0  // Tracks how many consecutive frames had the same hash
};

/**
 * Calculate adaptive step count based on orbital characteristics.
 *
 * Fast-rotating orbits (inner planets, high-thrust spirals) need more steps
 * to accurately capture the continuous rotation of the RTN reference frame.
 * Slow orbits (outer planets) can use fewer steps without visible error.
 *
 * @param {Object} orbitalElements - Ship's orbital elements
 * @param {number} duration - Prediction duration in days
 * @param {Object} soiState - Current SOI state {currentBody, isInSOI}
 * @returns {number} Optimal step count for this orbit
 */
function calculateAdaptiveSteps(orbitalElements, duration, soiState) {
    const { a, e } = orbitalElements;

    // Get gravitational parameter (Sun or planet)
    let μ = MU_SUN;
    if (soiState?.isInSOI && soiState.currentBody !== 'SUN') {
        μ = getGravitationalParam(soiState.currentBody);
    }

    // Calculate orbital period using Kepler's third law: T = 2π√(a³/μ)
    // For hyperbolic orbits (e >= 1), a is negative - use absolute value
    const absA = Math.abs(a);

    // Guard against degenerate orbits (would cause NaN or Infinity)
    if (!isFinite(absA) || absA < 1e-10) {
        // Fallback to minimum steps for safety
        return TRAJECTORY_RENDER_CONFIG.minSteps;
    }

    const orbitalPeriod = 2 * Math.PI * Math.sqrt(absA * absA * absA / μ);

    // Calculate steps based on duration and orbital period
    // Use stepsPerDay from config as the target resolution
    const stepsFromDuration = Math.ceil(duration * TRAJECTORY_RENDER_CONFIG.stepsPerDay);

    // For hyperbolic orbits (e >= 1), orbital period is infinite
    // Use duration-based steps only
    if (e >= 1.0 || !isFinite(orbitalPeriod) || orbitalPeriod <= 0) {
        return Math.max(
            TRAJECTORY_RENDER_CONFIG.minSteps,
            Math.min(stepsFromDuration, TRAJECTORY_RENDER_CONFIG.maxSteps)
        );
    }

    // For elliptical orbits, ensure minimum samples per orbit
    // This prevents under-sampling when predicting far into the future
    const orbitsInDuration = duration / orbitalPeriod;
    const stepsPerOrbit = 50;  // Minimum steps per orbit for smooth curves
    const stepsFromPeriod = Math.ceil(orbitsInDuration * stepsPerOrbit);

    // Use the larger of duration-based or period-based step count
    // This ensures both:
    // 1. Fine-grained time resolution (from stepsPerDay)
    // 2. Adequate orbital sampling (from stepsPerOrbit)
    const adaptiveSteps = Math.max(stepsFromDuration, stepsFromPeriod);

    // Clamp to configured min/max bounds
    return Math.max(
        TRAJECTORY_RENDER_CONFIG.minSteps,
        Math.min(adaptiveSteps, TRAJECTORY_RENDER_CONFIG.maxSteps)
    );
}

/**
 * Fast numeric hash combining function (FNV-1a inspired).
 * Mixes a new numeric value into an existing hash.
 * Uses multiply-XOR with a large prime for good distribution.
 *
 * Note: operates on JS doubles, not 32-bit ints. The bitwise OR
 * truncates to 32-bit int after each mix to keep values bounded.
 *
 * @param {number} hash - Current hash value
 * @param {number} value - Value to mix in
 * @returns {number} Updated hash
 */
function hashMix(hash, value) {
    // Convert value to integer bits for mixing
    // Multiply by large prime to spread floating-point values across int range
    const bits = (value * 2654435761) | 0;
    // XOR and multiply (FNV-1a style)
    hash = (hash ^ bits) | 0;
    hash = Math.imul(hash, 16777619);
    return hash;
}

/**
 * Generate a numeric hash of inputs for cache invalidation.
 *
 * Uses FNV-1a inspired numeric hashing instead of JSON.stringify for
 * performance — eliminates string allocation and JSON serialization
 * overhead on every frame.
 *
 * IMPORTANT: Orbital elements are rounded to prevent cache thrashing from
 * tiny floating-point variations that occur every frame due to thrust application.
 * Without rounding, the hash would change every frame, defeating the cache.
 *
 * Precision levels:
 * - Semi-major axis (a): 6 decimals (~0.15 km at 1 AU) - enough for orbit shape
 * - Eccentricity (e): 6 decimals - enough for orbit shape
 * - Angles (i, Ω, ω, M0): 4 decimals (~0.0001 rad ≈ 0.006°) - visual precision
 * - Sail angle/pitch: 2 decimals (0.01 rad ≈ 0.6°) - slider precision
 * - Deployment: Integer percent - slider precision
 *
 * IMPORTANT: If new fields are added to the prediction inputs, they MUST
 * be included here or the cache may return stale results.
 */
function hashInputs(params) {
    const { orbitalElements, sail, mass, startTime, duration, steps, soiState, extremeFlybyState } = params;

    // FNV offset basis
    let h = 2166136261;

    // Orbital elements (rounded to prevent floating-point drift)
    h = hashMix(h, Math.round(orbitalElements.a * 1e6));    // 6 decimal places
    h = hashMix(h, Math.round(orbitalElements.e * 1e6));    // 6 decimal places
    h = hashMix(h, Math.round(orbitalElements.i * 1e4));    // 4 decimal places
    h = hashMix(h, Math.round(orbitalElements.Ω * 1e4));    // 4 decimal places
    h = hashMix(h, Math.round(orbitalElements.ω * 1e4));    // 4 decimal places
    h = hashMix(h, Math.round(orbitalElements.M0 * 1e4));   // 4 decimal places

    // Sail parameters
    h = hashMix(h, Math.round(sail.angle * 100));            // 2 decimal places
    h = hashMix(h, Math.round((sail.pitchAngle || 0) * 100));
    h = hashMix(h, Math.round(sail.deploymentPercent));      // Integer
    h = hashMix(h, sail.sailCount || 1);                     // Integer sail count

    // Ship and time parameters
    h = hashMix(h, Math.round(mass));                        // Integer kg
    h = hashMix(h, Math.round(startTime * 1000));            // Millisecond precision
    h = hashMix(h, duration);
    h = hashMix(h, steps);

    // SOI state — convert body name to a stable numeric code
    const soiBody = soiState?.currentBody || 'SUN';
    h = hashMix(h, soiBodyCode(soiBody));
    h = hashMix(h, soiState?.isInSOI ? 1 : 0);

    // Extreme flyby state
    h = hashMix(h, extremeFlybyState ? 1 : 0);
    h = hashMix(h, Math.round((extremeFlybyState?.entryTime || 0) * 1000));

    return h;
}

/**
 * Convert SOI body name to a stable numeric code for hashing.
 * Uses character code sum — simple but sufficient for cache keys
 * since body names are short and distinct.
 */
function soiBodyCode(name) {
    let code = 0;
    for (let i = 0; i < name.length; i++) {
        code = code * 31 + name.charCodeAt(i);
    }
    return code | 0;
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
 * @param {number} params.steps - Number of position samples (optional, auto-calculated if omitted)
 * @param {Object} params.soiState - SOI state {currentBody, isInSOI}
 * @param {Object} params.extremeFlybyState - Optional extreme flyby state for linear interpolation
 * @returns {Array} Array of {x, y, z, time, truncated?} positions in AU
 */
export function predictTrajectory(params) {
    const {
        orbitalElements,
        sail,
        mass = DEFAULT_MASS_KG,
        startTime,
        duration = DEFAULT_DURATION_DAYS,
        steps,  // Optional - will be auto-calculated if not provided
        soiState = null,
        extremeFlybyState = null
    } = params;

    // Calculate adaptive step count if not explicitly provided
    // This ensures optimal accuracy for all orbit types without manual tuning
    const adaptiveSteps = steps !== undefined
        ? steps
        : calculateAdaptiveSteps(orbitalElements, duration, soiState);

    // Create resolved params with ACTUAL step count for cache hash
    // This prevents cache collisions when different orbits need different step counts
    const resolvedParams = {
        ...params,
        steps: adaptiveSteps
    };

    // Check cache
    const now = Date.now();
    const hash = hashInputs(resolvedParams);

    // Adaptive TTL: use longer TTL when trajectory is stable
    const isStable = trajectoryCache.stableCount >= CACHE_CONFIG.stableThreshold;
    const ttl = isStable ? CACHE_CONFIG.stableTTL : CACHE_CONFIG.baseTTL;

    if (trajectoryCache.trajectory &&
        trajectoryCache.inputHash === hash &&
        (now - trajectoryCache.lastUpdate) < ttl) {
        return trajectoryCache.trajectory;
    }

    // Track stability for adaptive TTL
    const hashMatches = trajectoryCache.inputHash === hash;
    const newStableCount = hashMatches ? trajectoryCache.stableCount + 1 : 0;

    // Propagate trajectory
    const trajectory = [];
    const timeStep = duration / adaptiveSteps;

    // Clone orbital elements for simulation (don't modify original)
    let simElements = { ...orbitalElements };

    // Early validation: bail out if starting elements are already corrupt
    // This prevents cascading errors and console spam
    // Note: a can be negative for hyperbolic orbits (e >= 1), so we check |a| > 0
    if (!isFinite(simElements.a) || !isFinite(simElements.e) ||
        !isFinite(simElements.i) || !isFinite(simElements.Ω) ||
        !isFinite(simElements.ω) || !isFinite(simElements.M0) ||
        Math.abs(simElements.a) < 1e-10 || simElements.e < 0) {
        // Return empty trajectory - elements are invalid
        return [];
    }

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

    // Detect extreme eccentricity - use linear interpolation like shipPhysics.js does
    // This is critical for very fast flybys where orbital mechanics break down
    const useLinearInterpolation = extremeFlybyState &&
        simElements.e > EXTREME_ECCENTRICITY_THRESHOLD &&
        isInSOI;

    // SOI DIAGNOSTIC: Log once per SOI stay when trajectory prediction starts in SOI
    if (isInSOI && currentBody !== 'SUN' && soiTrajDiag.lastLoggedSOIBody !== currentBody) {
        soiTrajDiag.lastLoggedSOIBody = currentBody;
        soiTrajDiag.lastLoggedReason = null;
        console.log(
            `[TRAJ_DIAG] Starting trajectory prediction in ${currentBody} SOI | ` +
            `e=${simElements.e.toFixed(4)} a=${simElements.a.toFixed(6)} | ` +
            `SOI_radius=${soiRadius?.toFixed(6) || 'N/A'} AU | ` +
            `linearInterp=${useLinearInterpolation} | ` +
            `steps=${adaptiveSteps} (adaptive) duration=${duration}d`
        );
        if (useLinearInterpolation && extremeFlybyState) {
            console.log(
                `[TRAJ_DIAG] EXTREME FLYBY linear interp: entryPos=(${extremeFlybyState.entryPos.x.toFixed(6)},${extremeFlybyState.entryPos.y.toFixed(6)},${extremeFlybyState.entryPos.z.toFixed(6)}) ` +
                `entryVel=(${extremeFlybyState.entryVel.vx.toFixed(6)},${extremeFlybyState.entryVel.vy.toFixed(6)},${extremeFlybyState.entryVel.vz.toFixed(6)})`
            );
        }
    }
    // Reset one-shot tracker when leaving SOI
    if (!isInSOI) {
        soiTrajDiag.lastLoggedSOIBody = null;
    }

    for (let i = 0; i < adaptiveSteps; i++) {
        const simTime = startTime + i * timeStep;

        // Get position from current orbital elements (planetocentric when in SOI)
        // For extreme eccentricity flybys, use linear interpolation instead of orbital mechanics
        // This matches the behavior in shipPhysics.js for consistency
        let position;
        if (useLinearInterpolation) {
            // Linear interpolation from entry state
            const dt = simTime - extremeFlybyState.entryTime;
            position = {
                x: extremeFlybyState.entryPos.x + extremeFlybyState.entryVel.vx * dt,
                y: extremeFlybyState.entryPos.y + extremeFlybyState.entryVel.vy * dt,
                z: extremeFlybyState.entryPos.z + extremeFlybyState.entryVel.vz * dt
            };
        } else {
            position = getPosition(simElements, simTime);
        }

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
                // SOI DIAGNOSTIC: Log truncation once per SOI stay (no repeats)
                if (soiTrajDiag.lastLoggedReason !== 'SOI_EXIT') {
                    soiTrajDiag.lastLoggedReason = 'SOI_EXIT';
                    const timeInSOI = (i * timeStep).toFixed(2);
                    console.log(
                        `[TRAJ_DIAG] TRUNCATED at step ${i}/${adaptiveSteps} (SOI_EXIT) | ` +
                        `${trajectory.length} points rendered | ` +
                        `dist=${distFromOrigin.toFixed(6)} > SOI*1.1=${(soiRadius*1.1).toFixed(6)} | ` +
                        `${timeInSOI}d into prediction | ` +
                        `linearInterp=${useLinearInterpolation} | ` +
                        `e=${simElements.e.toFixed(4)}`
                    );
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

        // Convert position to heliocentric for rendering
        // When in SOI, position is planetocentric - need to add planet position
        let renderPosition = position;
        if (isInSOI && currentBody !== 'SUN') {
            const parent = getBodyByName(currentBody);
            if (parent && parent.elements) {
                const planetPos = getPosition(parent.elements, simTime);
                renderPosition = {
                    x: position.x + planetPos.x,
                    y: position.y + planetPos.y,
                    z: position.z + planetPos.z
                };
            }
        }

        // Position passed all checks - safe to add to trajectory (in heliocentric coords)
        trajectory.push({
            x: renderPosition.x,
            y: renderPosition.y,
            z: renderPosition.z,
            time: simTime
        });

        // Apply thrust for next step (if not last step and thrust is active)
        // Don't apply thrust if too close to sun - physics breaks down and corrupts orbital elements
        const tooCloseToSun = !isInSOI && distFromOrigin < MIN_HELIOCENTRIC_RADIUS * 2.0;

        // Skip thrust application for extreme flybys - the flyby is so fast that sail thrust
        // has negligible effect, and orbital elements are not meaningful anyway
        if (i < adaptiveSteps - 1 && effectiveThrust && !tooCloseToSun && !useLinearInterpolation) {
            // ================================================================
            // RK2 MIDPOINT INTEGRATION WITH ADAPTIVE SUB-STEPPING
            // ================================================================
            // Primary: RK2 midpoint method for accuracy.
            // Fallback: If element changes per step exceed thresholds (|Δe| or
            // |Δa/a| too large), redo the step with N smaller Euler sub-steps.
            // Sub-steps recompute thrust direction at each sub-position, preventing
            // the large ΔV that causes stateToElements to produce bad elements.
            //
            // Sub-stepping is internal only — the output trajectory point count
            // is unchanged, so the cache and intersection detection are unaffected.

            const velocity = getVelocity(simElements, simTime);

            // Get heliocentric position/velocity for thrust calculation
            let thrustPosition = position;
            let thrustVelocity = velocity;
            let distFromSun = distFromOrigin;

            if (isInSOI && currentBody !== 'SUN') {
                const parent = getBodyByName(currentBody);
                if (parent && parent.elements) {
                    const planetPos = getPosition(parent.elements, simTime);
                    const planetVel = getVelocity(parent.elements, simTime);
                    thrustPosition = {
                        x: position.x + planetPos.x,
                        y: position.y + planetPos.y,
                        z: position.z + planetPos.z
                    };
                    thrustVelocity = {
                        vx: velocity.vx + planetVel.vx,
                        vy: velocity.vy + planetVel.vy,
                        vz: velocity.vz + planetVel.vz
                    };
                    distFromSun = Math.sqrt(
                        thrustPosition.x ** 2 +
                        thrustPosition.y ** 2 +
                        thrustPosition.z ** 2
                    );
                }
            }

            // Step 1: Calculate thrust at start of step
            const thrustStart = calculateSailThrust(
                sail,
                thrustPosition,
                thrustVelocity,
                distFromSun,
                mass
            );

            const thrustStartMag = Math.sqrt(
                thrustStart.x ** 2 + thrustStart.y ** 2 + thrustStart.z ** 2
            );

            if (thrustStartMag > MIN_THRUST_THRESHOLD) {
                const maxE = TRAJECTORY_ROBUSTNESS.maxEccentricity;
                const prevElements = simElements;  // Save for possible sub-stepping

                // Step 2: Propagate to midpoint using start thrust (half step)
                const midTime = simTime + timeStep / 2;
                const midElements = applyThrust(simElements, thrustStart, timeStep / 2, simTime);

                // Validate midpoint elements
                let stepFailed = false;
                if (!isFinite(midElements.a) || !isFinite(midElements.e) ||
                    midElements.e < 0 || midElements.e > maxE) {
                    // Midpoint failed - fall back to Euler (use start thrust for full step)
                    const newElements = applyThrust(simElements, thrustStart, timeStep, simTime);
                    if (!isFinite(newElements.a) || !isFinite(newElements.e) ||
                        !isFinite(newElements.i) || !isFinite(newElements.Ω) ||
                        !isFinite(newElements.ω) || !isFinite(newElements.M0) ||
                        newElements.e < 0 || newElements.e > maxE) {
                        stepFailed = true;
                    } else {
                        simElements = newElements;
                    }
                } else {
                    // Step 3: Get position/velocity at midpoint for thrust recalculation
                    const midPos = getPosition(midElements, midTime);
                    const midVel = getVelocity(midElements, midTime);

                    let midThrustPos = midPos;
                    let midThrustVel = midVel;
                    let midDistFromSun = Math.sqrt(midPos.x ** 2 + midPos.y ** 2 + midPos.z ** 2);

                    if (isInSOI && currentBody !== 'SUN') {
                        const parent = getBodyByName(currentBody);
                        if (parent && parent.elements) {
                            const planetPosMid = getPosition(parent.elements, midTime);
                            const planetVelMid = getVelocity(parent.elements, midTime);
                            midThrustPos = {
                                x: midPos.x + planetPosMid.x,
                                y: midPos.y + planetPosMid.y,
                                z: midPos.z + planetPosMid.z
                            };
                            midThrustVel = {
                                vx: midVel.vx + planetVelMid.vx,
                                vy: midVel.vy + planetVelMid.vy,
                                vz: midVel.vz + planetVelMid.vz
                            };
                            midDistFromSun = Math.sqrt(
                                midThrustPos.x ** 2 + midThrustPos.y ** 2 + midThrustPos.z ** 2
                            );
                        }
                    }

                    // Step 4: Calculate thrust at midpoint
                    const thrustMid = calculateSailThrust(
                        sail,
                        midThrustPos,
                        midThrustVel,
                        midDistFromSun,
                        mass
                    );

                    // Step 5: Apply midpoint thrust for the FULL step from original state
                    const newElements = applyThrust(prevElements, thrustMid, timeStep, simTime);

                    // Validate new orbital elements
                    if (!isFinite(newElements.a) || !isFinite(newElements.e) ||
                        !isFinite(newElements.i) || !isFinite(newElements.Ω) ||
                        !isFinite(newElements.ω) || !isFinite(newElements.M0) ||
                        newElements.e < 0 || newElements.e > maxE) {
                        stepFailed = true;
                    } else {
                        simElements = newElements;
                    }
                }

                // ============================================================
                // ADAPTIVE SUB-STEPPING
                // ============================================================
                // If the RK2 step failed outright, or if element changes are
                // too large (indicating the step size was too aggressive for
                // the dynamics), redo from prevElements with smaller sub-steps.
                // Each sub-step recomputes thrust direction, preventing the
                // large single-step ΔV that causes stateToElements instability.
                const {
                    substepEccentricityThreshold: eThresh,
                    substepSemiMajorAxisThreshold: aThresh,
                    substepCount: N
                } = TRAJECTORY_ROBUSTNESS;

                const needsSubstepping = stepFailed || (
                    !stepFailed && (
                        Math.abs(simElements.e - prevElements.e) > eThresh ||
                        (Math.abs(prevElements.a) > 1e-10 &&
                         Math.abs(simElements.a - prevElements.a) / Math.abs(prevElements.a) > aThresh)
                    )
                );

                if (needsSubstepping) {
                    // Redo from prevElements with N smaller Euler sub-steps
                    let subElems = prevElements;
                    const subDt = timeStep / N;
                    let subFailed = false;

                    for (let j = 0; j < N; j++) {
                        const subTime = simTime + j * subDt;
                        const subPos = getPosition(subElems, subTime);
                        const subVel = getVelocity(subElems, subTime);

                        // Convert to heliocentric for thrust calculation
                        let subThrustPos = subPos;
                        let subThrustVel = subVel;
                        let subDist = Math.sqrt(subPos.x ** 2 + subPos.y ** 2 + subPos.z ** 2);

                        if (isInSOI && currentBody !== 'SUN') {
                            const parent = getBodyByName(currentBody);
                            if (parent && parent.elements) {
                                const pPos = getPosition(parent.elements, subTime);
                                const pVel = getVelocity(parent.elements, subTime);
                                subThrustPos = {
                                    x: subPos.x + pPos.x,
                                    y: subPos.y + pPos.y,
                                    z: subPos.z + pPos.z
                                };
                                subThrustVel = {
                                    vx: subVel.vx + pVel.vx,
                                    vy: subVel.vy + pVel.vy,
                                    vz: subVel.vz + pVel.vz
                                };
                                subDist = Math.sqrt(
                                    subThrustPos.x ** 2 + subThrustPos.y ** 2 + subThrustPos.z ** 2
                                );
                            }
                        }

                        const subThrust = calculateSailThrust(
                            sail, subThrustPos, subThrustVel, subDist, mass
                        );
                        const subNew = applyThrust(subElems, subThrust, subDt, subTime);

                        if (!isFinite(subNew.a) || !isFinite(subNew.e) ||
                            subNew.e < 0 || subNew.e > maxE) {
                            subFailed = true;
                            break;
                        }
                        subElems = subNew;
                    }

                    if (subFailed) {
                        // Sub-stepping also failed — truncate trajectory
                        if (trajectory.length > 0) {
                            trajectory[trajectory.length - 1].truncated = 'ORBITAL_INSTABILITY';
                        }
                        break;
                    }
                    simElements = subElems;
                }
            }
        }
    }

    // SOI DIAGNOSTIC: Warn about very short trajectories in SOI (once per SOI stay)
    if (isInSOI && currentBody !== 'SUN' && trajectory.length < 10 &&
        soiTrajDiag.lastLoggedReason !== 'LOW_POINTS') {
        soiTrajDiag.lastLoggedReason = 'LOW_POINTS';
        const lastTruncReason = trajectory.length > 0 ? (trajectory[trajectory.length - 1].truncated || 'NONE') : 'EMPTY';
        console.warn(
            `[TRAJ_DIAG] ⚠️ VERY SHORT TRAJECTORY in ${currentBody} SOI: only ${trajectory.length} points | ` +
            `truncation=${lastTruncReason} | e=${simElements.e.toFixed(4)} | ` +
            `linearInterp=${useLinearInterpolation} | ` +
            `This will make the predicted path nearly invisible`
        );
    }

    // Update cache with stability tracking
    trajectoryCache = {
        trajectory,
        lastUpdate: now,
        inputHash: hash,
        stableCount: newStableCount
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
        inputHash: null,
        stableCount: 0
    };
}

/**
 * Get cached trajectory if available, null otherwise.
 * Useful for checking cache state without triggering recalculation.
 */
export function getCachedTrajectory() {
    const now = Date.now();
    // Use adaptive TTL
    const isStable = trajectoryCache.stableCount >= CACHE_CONFIG.stableThreshold;
    const ttl = isStable ? CACHE_CONFIG.stableTTL : CACHE_CONFIG.baseTTL;

    if (trajectoryCache.trajectory &&
        (now - trajectoryCache.lastUpdate) < ttl) {
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
    // Use adaptive TTL
    const isStable = trajectoryCache.stableCount >= CACHE_CONFIG.stableThreshold;
    const ttl = isStable ? CACHE_CONFIG.stableTTL : CACHE_CONFIG.baseTTL;

    if (trajectoryCache.inputHash &&
        (now - trajectoryCache.lastUpdate) < ttl) {
        return trajectoryCache.inputHash;
    }
    return null;
}

/**
 * Debug function: Calculate and log adaptive step count for current orbit.
 * Call from console: window.debugTrajectorySteps()
 */
export function debugTrajectorySteps(ship, durationDays = 60) {
    if (!ship || !ship.orbitalElements) {
        console.log('[DEBUG] No ship or orbital elements available');
        return;
    }

    const steps = calculateAdaptiveSteps(ship.orbitalElements, durationDays, ship.soiState);
    const { a, e } = ship.orbitalElements;

    let μ = MU_SUN;
    if (ship.soiState?.isInSOI && ship.soiState.currentBody !== 'SUN') {
        μ = getGravitationalParam(ship.soiState.currentBody);
    }

    const absA = Math.abs(a);
    const orbitalPeriod = e < 1.0 ? 2 * Math.PI * Math.sqrt(absA * absA * absA / μ) : Infinity;
    const timeStepDays = durationDays / steps;
    const timeStepHours = timeStepDays * 24;

    console.log('\n========== TRAJECTORY ADAPTIVE RESOLUTION DEBUG ==========');
    console.log(`[DEBUG] Orbit: a=${a.toFixed(6)} AU, e=${e.toFixed(4)}`);
    console.log(`[DEBUG] Reference: ${ship.soiState?.isInSOI ? ship.soiState.currentBody : 'SUN'}`);
    console.log(`[DEBUG] Orbital period: ${orbitalPeriod === Infinity ? 'HYPERBOLIC' : orbitalPeriod.toFixed(2) + ' days'}`);
    console.log(`[DEBUG] Prediction duration: ${durationDays} days`);
    console.log(`[DEBUG] Adaptive step count: ${steps}`);
    console.log(`[DEBUG] Time per step: ${timeStepHours.toFixed(2)} hours (${timeStepDays.toFixed(4)} days)`);

    if (orbitalPeriod !== Infinity) {
        const angularVelDegPerDay = 360 / orbitalPeriod;
        const frameRotationPerStep = angularVelDegPerDay * timeStepDays;
        console.log(`[DEBUG] RTN frame rotation per step: ${frameRotationPerStep.toFixed(3)}°`);
        console.log(`[DEBUG] Total frame rotation over prediction: ${(frameRotationPerStep * steps).toFixed(1)}°`);
    }

    console.log(`[DEBUG] Config limits: min=${TRAJECTORY_RENDER_CONFIG.minSteps}, max=${TRAJECTORY_RENDER_CONFIG.maxSteps}`);
    console.log('========== END DEBUG ==========\n');

    return steps;
}

// Make debug function available globally
if (typeof window !== 'undefined') {
    window.debugTrajectorySteps = debugTrajectorySteps;
}

console.log('[TRAJECTORY_PREDICTOR] Module loaded with adaptive resolution');
console.log('[TRAJECTORY_PREDICTOR] Use window.debugTrajectorySteps(ship) to inspect step calculation');
