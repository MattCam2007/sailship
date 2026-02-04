/**
 * Course Solver - Automatic Course Plotting (v3.0)
 *
 * CROSSING-AWARE hybrid search algorithm for optimal sail settings to intercept targets.
 *
 * v3.0 MAJOR CHANGE: Crossing-Aware Optimization
 *   - Evaluates candidates based on ORBITAL CROSSING distance, not global minimum
 *   - Phase constraint ensures planet is angularly close at crossing time
 *   - Results directly correspond to displayed ghost planets
 *
 * Algorithm features:
 *   - Denser coarse sweep (5° steps)
 *   - High simulation resolution (1000 steps for solar sail accuracy)
 *   - Expanded ultra-fine window (±2°)
 *   - Multi-horizon search (180, 365, 540, 730, 1095, 1460 days)
 *   - Gradient descent polish (50 iterations post-grid)
 *   - Iterative refinement (retry with expanded bounds if marginal)
 *
 * Estimated compute time: 30-45 seconds (user confirmed acceptable)
 *
 * Uses async/await with yields to prevent UI blocking.
 */

import { getPosition, getVelocity } from './orbital.js';
import { calculateSailThrust, applyThrust } from './orbital-maneuvers.js';
import { getJulianDate } from '../core/gameState.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEG_TO_RAD = Math.PI / 180;

const CONFIG = {
    // Search bounds
    yawMin: -60,
    yawMax: 60,
    pitchMin: -30,
    pitchMax: 30,

    // Phase 1: Coarse sweep (5° for better coverage)
    coarseStep: 5,

    // Phase 2: Fine search
    fineStep: 2,
    fineRadius: 8,
    topCandidates: 8,  // Increased from 5 to catch more candidates

    // Phase 3: Ultra-fine polish (expanded window to escape local optima)
    ultraStep: 0.1,
    ultraRadius: 2,  // Increased from 0.5 to ±2°

    // Simulation parameters (high resolution for solar sail accuracy)
    defaultMaxDays: 365,
    defaultSteps: 1000,  // Increased from 200 for ~8.5 hour intervals
    defaultDeployment: 100,

    // Multi-horizon search durations (days)
    horizons: [180, 365, 540, 730, 1095, 1460],

    // Gradient descent parameters
    gradientMaxIterations: 50,
    gradientInitialLR: 1.0,  // Initial learning rate in degrees
    gradientMinLR: 0.01,
    gradientH: 0.05,  // Finite difference step in degrees

    // Iterative refinement
    maxRefinementPasses: 3,
    refinementBoundsExpansion: 1.2,  // 20% expansion per pass

    // Quality thresholds (AU)
    interceptThreshold: 0.01,
    nearMissThreshold: 0.05,
    marginalThreshold: 0.2,

    // Yield frequency (yield to main thread every N evaluations)
    yieldFrequency: 10,

    // Timeout for entire solve operation (ms)
    maxSolveTimeMs: 90000,  // 90 seconds

    // ========================================================================
    // CROSSING-AWARE SOLVER CONFIGURATION (v3.0)
    // ========================================================================

    // Phase constraint: maximum angular separation (radians) between ship and planet
    // at crossing time for a valid intercept candidate.
    // 30° = 0.52 rad - planet must be within 30° of crossing point
    // 45° = 0.79 rad - more lenient, catches wider transfer windows
    maxPhaseAngle: 0.79,  // ~45 degrees - allows reasonable transfer windows

    // Minimum steps between crossings to consider them distinct
    // Prevents detecting the same crossing multiple times due to numerical noise
    minCrossingGap: 5,

    // Whether to use crossing-aware evaluation (can disable for debugging)
    useCrossingAware: true
};

// ============================================================================
// CROSSING DETECTION HELPERS (v3.0)
// ============================================================================

/**
 * Calculate angular separation between two 3D positions (viewed from origin).
 *
 * θ = arccos( (P1 · P2) / (|P1| × |P2|) )
 *
 * @param {Object} pos1 - First position {x, y, z}
 * @param {Object} pos2 - Second position {x, y, z}
 * @returns {number} Angular separation in radians [0, π]
 */
function calculateAngularSeparation(pos1, pos2) {
    const mag1 = Math.sqrt(pos1.x ** 2 + pos1.y ** 2 + pos1.z ** 2);
    const mag2 = Math.sqrt(pos2.x ** 2 + pos2.y ** 2 + pos2.z ** 2);

    // Guard against zero vectors
    if (mag1 < 1e-15 || mag2 < 1e-15) {
        return 0;
    }

    const dot = pos1.x * pos2.x + pos1.y * pos2.y + pos1.z * pos2.z;
    const cosAngle = dot / (mag1 * mag2);

    // Clamp to [-1, 1] to handle floating-point errors
    const clampedCos = Math.max(-1, Math.min(1, cosAngle));

    return Math.acos(clampedCos);
}

/**
 * Find all orbital radius crossings in a trajectory.
 *
 * Detects when ship crosses the target's semi-major axis distance from the Sun.
 * Uses the same algorithm as intersectionDetector for consistency with ghost planets.
 *
 * @param {Array} trajectory - Array of {x, y, z, time} points
 * @param {number} targetRadius - Target orbital radius (semi-major axis) in AU
 * @returns {Array} Array of crossing events: [{index, time, position, direction}, ...]
 *                  direction: 'outbound' (r increasing) or 'inbound' (r decreasing)
 */
function findRadiusCrossingsInTrajectory(trajectory, targetRadius) {
    const crossings = [];

    if (!trajectory || trajectory.length < 2) {
        return crossings;
    }

    let lastCrossingIndex = -CONFIG.minCrossingGap;  // Allow first crossing at index 0

    for (let i = 0; i < trajectory.length - 1; i++) {
        const p1 = trajectory[i];
        const p2 = trajectory[i + 1];

        const r1 = Math.sqrt(p1.x ** 2 + p1.y ** 2 + p1.z ** 2);
        const r2 = Math.sqrt(p2.x ** 2 + p2.y ** 2 + p2.z ** 2);

        // Check if segment crosses target radius
        const crossesOutbound = r1 < targetRadius && r2 >= targetRadius;
        const crossesInbound = r1 > targetRadius && r2 <= targetRadius;

        if (!crossesOutbound && !crossesInbound) {
            continue;
        }

        // Skip if too close to last crossing (prevents duplicate detection)
        if (i - lastCrossingIndex < CONFIG.minCrossingGap) {
            continue;
        }

        // Calculate exact crossing point using linear interpolation
        // (Good enough for our purposes - intersectionDetector uses quadratic
        // but linear is fine for the solver's needs)
        const radialDiff = r2 - r1;
        let t;
        if (Math.abs(radialDiff) < 1e-15) {
            t = 0.5;
        } else {
            t = (targetRadius - r1) / radialDiff;
        }
        t = Math.max(0, Math.min(1, t));

        const crossingTime = p1.time + t * (p2.time - p1.time);
        const crossingPos = {
            x: p1.x + t * (p2.x - p1.x),
            y: p1.y + t * (p2.y - p1.y),
            z: p1.z + t * (p2.z - p1.z)
        };

        crossings.push({
            index: i,
            time: crossingTime,
            position: crossingPos,
            direction: crossesOutbound ? 'outbound' : 'inbound'
        });

        lastCrossingIndex = i;
    }

    return crossings;
}

/**
 * Calculate 3D distance between two positions.
 *
 * @param {Object} pos1 - First position {x, y, z}
 * @param {Object} pos2 - Second position {x, y, z}
 * @returns {number} Distance in AU
 */
function distance3D(pos1, pos2) {
    const dx = pos2.x - pos1.x;
    const dy = pos2.y - pos1.y;
    const dz = pos2.z - pos1.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ============================================================================
// CORE EVALUATION
// ============================================================================

/**
 * Evaluate a single candidate sail configuration (v3.0 - CROSSING-AWARE).
 *
 * v3.0 CHANGE: Evaluates based on ORBITAL CROSSING distance, not global minimum.
 *
 * Algorithm:
 *   1. Simulate trajectory with given sail settings
 *   2. Detect all orbital radius crossings (where ship crosses target's semi-major axis)
 *   3. For each crossing, compute:
 *      - Planet's actual position at crossing time
 *      - Distance between ship and planet at crossing
 *      - Angular separation (phase constraint)
 *   4. Return the best crossing that passes phase constraint
 *
 * This ensures the solver result corresponds directly to displayed ghost planets.
 *
 * @param {number} yawDeg - Sail yaw angle in degrees
 * @param {number} pitchDeg - Sail pitch angle in degrees
 * @param {Object} ship - Ship object with orbitalElements and sail
 * @param {Object} target - Target object with elements
 * @param {Object} options - Optional parameters
 * @returns {Object} Evaluation result (synchronous for performance)
 */
export function evaluateCandidate(yawDeg, pitchDeg, ship, target, options = {}) {
    const {
        maxDays = CONFIG.defaultMaxDays,
        steps = CONFIG.defaultSteps,
        deployment = CONFIG.defaultDeployment
    } = options;

    // Validate inputs
    if (!ship?.orbitalElements || !target?.elements) {
        return {
            yawDeg,
            pitchDeg,
            minDistance: Infinity,
            timeToClosest: 0,
            status: 'INVALID',
            crossingIndex: -1,
            angularSeparationDeg: 180
        };
    }

    const startTime = getJulianDate();
    const timeStep = maxDays / steps;
    const targetRadius = target.elements.a;  // Semi-major axis

    // Clone ship orbital elements for simulation
    let simElements = { ...ship.orbitalElements };

    // Create sail configuration with override angles
    const sail = {
        ...(ship.sail || {}),
        area: ship.sail?.area || 3000000,
        reflectivity: ship.sail?.reflectivity || 0.9,
        angle: yawDeg * DEG_TO_RAD,
        pitchAngle: pitchDeg * DEG_TO_RAD,
        deploymentPercent: deployment,
        condition: ship.sail?.condition || 100,
        sailCount: ship.sail?.sailCount || 1
    };

    const mass = ship.mass || 10000;

    // Build trajectory array for crossing detection
    const trajectory = [];

    // Also track global minimum as fallback (when no crossings found)
    let globalMinDistance = Infinity;
    let globalMinDistanceTime = 0;

    // Forward simulation - build trajectory
    for (let i = 0; i <= steps; i++) {
        const simTime = startTime + i * timeStep;

        // Get positions
        const shipPos = getPosition(simElements, simTime);
        const targetPos = getPosition(target.elements, simTime);

        // Validate positions
        if (!isFinite(shipPos.x) || !isFinite(targetPos.x)) {
            break;
        }

        // Store trajectory point
        trajectory.push({
            x: shipPos.x,
            y: shipPos.y,
            z: shipPos.z,
            time: simTime
        });

        // Track global minimum as fallback
        const dx = targetPos.x - shipPos.x;
        const dy = targetPos.y - shipPos.y;
        const dz = targetPos.z - shipPos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < globalMinDistance) {
            globalMinDistance = dist;
            globalMinDistanceTime = (simTime - startTime);
        }

        // Apply sail thrust for next step
        if (i < steps && deployment > 0) {
            const velocity = getVelocity(simElements, simTime);
            const distFromSun = Math.sqrt(
                shipPos.x ** 2 + shipPos.y ** 2 + shipPos.z ** 2
            );

            // Skip if too close to sun
            if (distFromSun < 0.02) break;

            const thrust = calculateSailThrust(
                sail,
                shipPos,
                velocity,
                distFromSun,
                mass
            );

            const thrustMag = Math.sqrt(thrust.x ** 2 + thrust.y ** 2 + thrust.z ** 2);
            if (thrustMag > 1e-20) {
                const newElements = applyThrust(simElements, thrust, timeStep, simTime);

                // Validate new elements
                if (!isFinite(newElements.a) || !isFinite(newElements.e) ||
                    newElements.e < 0 || newElements.e > 50) {
                    break;
                }

                simElements = newElements;
            }
        }
    }

    // ========================================================================
    // CROSSING-AWARE EVALUATION (v3.0)
    // ========================================================================

    if (CONFIG.useCrossingAware && trajectory.length > 1) {
        // Detect all orbital radius crossings
        const crossings = findRadiusCrossingsInTrajectory(trajectory, targetRadius);

        // Evaluate each crossing
        let bestCrossing = null;
        let bestDistance = Infinity;
        let bestAngularSep = Math.PI;
        let bestCrossingIndex = -1;

        for (let ci = 0; ci < crossings.length; ci++) {
            const crossing = crossings[ci];

            // Get planet's actual position at crossing time
            const planetPos = getPosition(target.elements, crossing.time);

            // Validate planet position
            if (!isFinite(planetPos.x)) continue;

            // Calculate distance at crossing
            const crossingDistance = distance3D(crossing.position, planetPos);

            // Calculate angular separation (phase constraint)
            const angularSep = calculateAngularSeparation(crossing.position, planetPos);

            // PHASE CONSTRAINT: Skip crossings where planet is too far angularly
            // This ensures we only accept solutions where the planet is actually "there"
            if (angularSep > CONFIG.maxPhaseAngle) {
                continue;  // Planet is on the other side of its orbit
            }

            // Track best crossing that passes phase constraint
            if (crossingDistance < bestDistance) {
                bestDistance = crossingDistance;
                bestAngularSep = angularSep;
                bestCrossingIndex = ci;
                bestCrossing = crossing;
            }
        }

        // If we found a valid crossing, use it
        if (bestCrossing) {
            let status;
            if (bestDistance < CONFIG.interceptThreshold) {
                status = 'INTERCEPT';
            } else if (bestDistance < CONFIG.nearMissThreshold) {
                status = 'NEAR_MISS';
            } else if (bestDistance < CONFIG.marginalThreshold) {
                status = 'MARGINAL';
            } else {
                status = 'NO_INTERCEPT';
            }

            return {
                yawDeg,
                pitchDeg,
                minDistance: bestDistance,
                timeToClosest: bestCrossing.time - startTime,
                status,
                // v3.0 crossing metadata
                crossingIndex: bestCrossingIndex,
                totalCrossings: crossings.length,
                angularSeparationDeg: bestAngularSep * (180 / Math.PI),
                crossingDirection: bestCrossing.direction,
                usedCrossingAware: true
            };
        }

        // No valid crossings found - check if there were any crossings at all
        if (crossings.length > 0) {
            // There were crossings but all failed phase constraint
            // Return the best crossing anyway but mark as phase-constrained failure
            let bestFailedCrossing = null;
            let bestFailedDistance = Infinity;
            let bestFailedAngularSep = Math.PI;

            for (const crossing of crossings) {
                const planetPos = getPosition(target.elements, crossing.time);
                if (!isFinite(planetPos.x)) continue;
                const crossingDistance = distance3D(crossing.position, planetPos);
                const angularSep = calculateAngularSeparation(crossing.position, planetPos);

                if (crossingDistance < bestFailedDistance) {
                    bestFailedDistance = crossingDistance;
                    bestFailedAngularSep = angularSep;
                    bestFailedCrossing = crossing;
                }
            }

            if (bestFailedCrossing) {
                return {
                    yawDeg,
                    pitchDeg,
                    minDistance: bestFailedDistance,
                    timeToClosest: bestFailedCrossing.time - startTime,
                    status: 'PHASE_MISS',  // Planet exists but is too far angularly
                    crossingIndex: 0,
                    totalCrossings: crossings.length,
                    angularSeparationDeg: bestFailedAngularSep * (180 / Math.PI),
                    crossingDirection: bestFailedCrossing.direction,
                    usedCrossingAware: true
                };
            }
        }
    }

    // ========================================================================
    // FALLBACK: No crossings found - use global minimum (original behavior)
    // ========================================================================
    // This happens when trajectory doesn't cross target's orbital radius at all
    // (e.g., targeting outer planet from inner orbit without enough delta-v)

    let status;
    if (globalMinDistance < CONFIG.interceptThreshold) {
        status = 'INTERCEPT';
    } else if (globalMinDistance < CONFIG.nearMissThreshold) {
        status = 'NEAR_MISS';
    } else if (globalMinDistance < CONFIG.marginalThreshold) {
        status = 'MARGINAL';
    } else {
        status = 'NO_CROSSING';  // Different from NO_INTERCEPT to indicate no crossing found
    }

    return {
        yawDeg,
        pitchDeg,
        minDistance: globalMinDistance,
        timeToClosest: globalMinDistanceTime,
        status,
        crossingIndex: -1,
        totalCrossings: 0,
        angularSeparationDeg: 180,  // Unknown/invalid
        crossingDirection: 'none',
        usedCrossingAware: false  // Fell back to global minimum
    };
}

// ============================================================================
// PHASE 1: COARSE SWEEP
// ============================================================================

/**
 * Phase 1: Coarse grid search over parameter space.
 *
 * Sweeps yaw from -60° to +60° and pitch from -30° to +30° in 5° steps.
 * Returns results sorted by closest approach distance.
 *
 * @param {Object} ship - Ship object
 * @param {Object} target - Target object
 * @param {Object} options - Optional parameters
 * @param {Function} onProgress - Progress callback (0-1)
 * @returns {Promise<Array>} Sorted array of evaluation results
 */
export async function coarseSweep(ship, target, options = {}, onProgress = null) {
    const results = [];
    const candidates = [];

    // Generate candidate grid
    for (let yaw = CONFIG.yawMin; yaw <= CONFIG.yawMax; yaw += CONFIG.coarseStep) {
        for (let pitch = CONFIG.pitchMin; pitch <= CONFIG.pitchMax; pitch += CONFIG.coarseStep) {
            candidates.push({ yaw, pitch });
        }
    }

    const total = candidates.length;

    // Evaluate all candidates with yielding
    for (let i = 0; i < candidates.length; i++) {
        const { yaw, pitch } = candidates[i];
        const result = evaluateCandidate(yaw, pitch, ship, target, options);
        results.push(result);

        // Yield to main thread periodically
        if (i % CONFIG.yieldFrequency === 0) {
            onProgress?.(i / total);
            await yieldToMainThread();
        }
    }

    // Sort by distance (closest first)
    results.sort((a, b) => a.minDistance - b.minDistance);

    return results;
}

// ============================================================================
// PHASE 2: FINE SEARCH
// ============================================================================

/**
 * Phase 2: Fine search around top candidates.
 *
 * For each top candidate, searches ±8° in 2° steps.
 * Returns the single best result found.
 *
 * @param {Array} topCandidates - Top candidates from coarse sweep
 * @param {Object} ship - Ship object
 * @param {Object} target - Target object
 * @param {Object} options - Optional parameters
 * @param {Function} onProgress - Progress callback (0-1)
 * @returns {Promise<Object>} Best refined result
 */
export async function fineSearch(topCandidates, ship, target, options = {}, onProgress = null) {
    let best = topCandidates[0];

    // Early termination if already have intercept
    if (best.minDistance < CONFIG.interceptThreshold) {
        return best;
    }

    let evalCount = 0;
    const totalEvals = topCandidates.length * Math.pow((CONFIG.fineRadius * 2 / CONFIG.fineStep + 1), 2);

    for (const candidate of topCandidates) {
        const centerYaw = candidate.yawDeg;
        const centerPitch = candidate.pitchDeg;

        for (let yaw = centerYaw - CONFIG.fineRadius; yaw <= centerYaw + CONFIG.fineRadius; yaw += CONFIG.fineStep) {
            for (let pitch = centerPitch - CONFIG.fineRadius; pitch <= centerPitch + CONFIG.fineRadius; pitch += CONFIG.fineStep) {
                // Clamp to valid range
                const clampedYaw = Math.max(CONFIG.yawMin, Math.min(CONFIG.yawMax, yaw));
                const clampedPitch = Math.max(CONFIG.pitchMin, Math.min(CONFIG.pitchMax, pitch));

                const result = evaluateCandidate(clampedYaw, clampedPitch, ship, target, options);

                if (result.minDistance < best.minDistance) {
                    best = result;
                }

                evalCount++;

                // Yield periodically
                if (evalCount % CONFIG.yieldFrequency === 0) {
                    onProgress?.(evalCount / totalEvals);
                    await yieldToMainThread();
                }

                // Early termination on intercept
                if (best.minDistance < CONFIG.interceptThreshold) {
                    return best;
                }
            }
        }
    }

    return best;
}

// ============================================================================
// PHASE 3: ULTRA-FINE POLISH
// ============================================================================

/**
 * Phase 3: Ultra-fine polish around best result.
 *
 * Searches ±2° in 0.1° steps for final grid precision.
 * Expanded window allows escaping local optima.
 *
 * @param {Object} candidate - Best result from fine search
 * @param {Object} ship - Ship object
 * @param {Object} target - Target object
 * @param {Object} options - Optional parameters
 * @param {Function} onProgress - Progress callback (0-1)
 * @returns {Promise<Object>} Final polished result
 */
export async function ultraFinePolish(candidate, ship, target, options = {}, onProgress = null) {
    let best = candidate;

    const centerYaw = candidate.yawDeg;
    const centerPitch = candidate.pitchDeg;

    let evalCount = 0;
    const totalEvals = Math.pow((CONFIG.ultraRadius * 2 / CONFIG.ultraStep + 1), 2);

    for (let yaw = centerYaw - CONFIG.ultraRadius; yaw <= centerYaw + CONFIG.ultraRadius; yaw += CONFIG.ultraStep) {
        for (let pitch = centerPitch - CONFIG.ultraRadius; pitch <= centerPitch + CONFIG.ultraRadius; pitch += CONFIG.ultraStep) {
            // Clamp to valid range
            const clampedYaw = Math.max(CONFIG.yawMin, Math.min(CONFIG.yawMax, yaw));
            const clampedPitch = Math.max(CONFIG.pitchMin, Math.min(CONFIG.pitchMax, pitch));

            const result = evaluateCandidate(clampedYaw, clampedPitch, ship, target, options);

            if (result.minDistance < best.minDistance) {
                best = result;
            }

            evalCount++;

            // Yield periodically
            if (evalCount % CONFIG.yieldFrequency === 0) {
                onProgress?.(evalCount / totalEvals);
                await yieldToMainThread();
            }
        }
    }

    return best;
}

// ============================================================================
// PHASE 4: GRADIENT DESCENT POLISH
// ============================================================================

/**
 * Phase 4: Gradient descent optimization for continuous refinement.
 *
 * Uses finite differences to estimate gradient and hill-climb to
 * the local minimum. This finds optimal values between grid points.
 *
 * @param {Object} candidate - Best result from ultra-fine polish
 * @param {Object} ship - Ship object
 * @param {Object} target - Target object
 * @param {Object} options - Optional parameters
 * @param {Function} onProgress - Progress callback (0-1)
 * @returns {Promise<Object>} Gradient-optimized result
 */
export async function gradientDescentPolish(candidate, ship, target, options = {}, onProgress = null) {
    let yaw = candidate.yawDeg;
    let pitch = candidate.pitchDeg;
    let best = candidate;
    let learningRate = CONFIG.gradientInitialLR;

    const h = CONFIG.gradientH;
    const maxIter = CONFIG.gradientMaxIterations;

    for (let i = 0; i < maxIter; i++) {
        // Compute gradient using central finite differences
        const evalYawPlus = evaluateCandidate(yaw + h, pitch, ship, target, options);
        const evalYawMinus = evaluateCandidate(yaw - h, pitch, ship, target, options);
        const evalPitchPlus = evaluateCandidate(yaw, pitch + h, ship, target, options);
        const evalPitchMinus = evaluateCandidate(yaw, pitch - h, ship, target, options);

        const gradYaw = (evalYawPlus.minDistance - evalYawMinus.minDistance) / (2 * h);
        const gradPitch = (evalPitchPlus.minDistance - evalPitchMinus.minDistance) / (2 * h);

        // Update with gradient descent (move in direction of steepest decrease)
        const newYaw = Math.max(CONFIG.yawMin, Math.min(CONFIG.yawMax, yaw - learningRate * gradYaw));
        const newPitch = Math.max(CONFIG.pitchMin, Math.min(CONFIG.pitchMax, pitch - learningRate * gradPitch));

        const newResult = evaluateCandidate(newYaw, newPitch, ship, target, options);

        // Adaptive learning rate: reduce if no improvement
        if (newResult.minDistance >= best.minDistance) {
            learningRate *= 0.5;
            if (learningRate < CONFIG.gradientMinLR) {
                break;  // Converged
            }
        } else {
            // Accept new position
            yaw = newYaw;
            pitch = newPitch;
            best = newResult;
        }

        // Yield periodically
        if (i % 5 === 0) {
            onProgress?.(i / maxIter);
            await yieldToMainThread();
        }

        // Early termination on intercept
        if (best.minDistance < CONFIG.interceptThreshold) {
            break;
        }
    }

    return best;
}

// ============================================================================
// SINGLE HORIZON SOLVER
// ============================================================================

/**
 * Solve for optimal course at a single time horizon.
 *
 * Runs all phases: coarse → fine → ultra → gradient descent
 *
 * @param {Object} ship - Ship object
 * @param {Object} target - Target object
 * @param {Object} options - Optional parameters including maxDays
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object>} Best result for this horizon
 */
async function solveForHorizon(ship, target, options = {}, onProgress = null) {
    const horizonDays = options.maxDays || CONFIG.defaultMaxDays;

    // Phase 1: Coarse sweep
    const coarseResults = await coarseSweep(ship, target, options, (p) => {
        onProgress?.({ subPhase: 'coarse', progress: p });
    });

    // Check for early termination
    if (coarseResults[0].minDistance < CONFIG.interceptThreshold) {
        return coarseResults[0];
    }

    // Phase 2: Fine search
    const topCandidates = coarseResults.slice(0, CONFIG.topCandidates);
    const fineResult = await fineSearch(topCandidates, ship, target, options, (p) => {
        onProgress?.({ subPhase: 'fine', progress: p });
    });

    // Check for early termination
    if (fineResult.minDistance < CONFIG.interceptThreshold) {
        return fineResult;
    }

    // Phase 3: Ultra-fine polish
    const ultraResult = await ultraFinePolish(fineResult, ship, target, options, (p) => {
        onProgress?.({ subPhase: 'ultra', progress: p });
    });

    // Check for early termination
    if (ultraResult.minDistance < CONFIG.interceptThreshold) {
        return ultraResult;
    }

    // Phase 4: Gradient descent polish
    const gradientResult = await gradientDescentPolish(ultraResult, ship, target, options, (p) => {
        onProgress?.({ subPhase: 'gradient', progress: p });
    });

    return gradientResult;
}

// ============================================================================
// MULTI-HORIZON SEARCH
// ============================================================================

/**
 * Search across multiple time horizons to find optimal transfer time.
 *
 * Different horizons capture different planetary phase alignments.
 * For Venus, optimal transfer might be 180 days; for Jupiter, 1095 days.
 *
 * @param {Object} ship - Ship object
 * @param {Object} target - Target object
 * @param {Object} options - Optional parameters
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object>} Best result across all horizons
 */
export async function solveMultiHorizon(ship, target, options = {}, onProgress = null) {
    const horizons = options.horizons || CONFIG.horizons;
    let overallBest = { minDistance: Infinity };
    let bestHorizon = horizons[0];

    for (let i = 0; i < horizons.length; i++) {
        const maxDays = horizons[i];

        onProgress?.({
            phase: 'multi-horizon',
            horizonIndex: i,
            horizonCount: horizons.length,
            currentHorizon: maxDays,
            message: `Searching ${maxDays} day horizon...`
        });

        const horizonOptions = { ...options, maxDays };
        const result = await solveForHorizon(ship, target, horizonOptions, (subProgress) => {
            onProgress?.({
                phase: 'multi-horizon',
                horizonIndex: i,
                horizonCount: horizons.length,
                currentHorizon: maxDays,
                subPhase: subProgress.subPhase,
                subProgress: subProgress.progress,
                message: `Horizon ${maxDays}d: ${subProgress.subPhase}`
            });
        });

        if (result.minDistance < overallBest.minDistance) {
            overallBest = result;
            bestHorizon = maxDays;
        }

        // Early termination if intercept found
        if (result.minDistance < CONFIG.interceptThreshold) {
            break;
        }

        await yieldToMainThread();
    }

    return {
        ...overallBest,
        horizonDays: bestHorizon
    };
}

// ============================================================================
// ITERATIVE REFINEMENT
// ============================================================================

/**
 * Iteratively refine search with expanded bounds if result is marginal.
 *
 * If the best solution is > 0.05 AU, expand search bounds and retry.
 * This catches cases where optimal is near edge of search space.
 *
 * @param {Object} ship - Ship object
 * @param {Object} target - Target object
 * @param {Object} options - Optional parameters
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object>} Best refined result
 */
async function solveWithRefinement(ship, target, options = {}, onProgress = null) {
    let best = await solveMultiHorizon(ship, target, options, onProgress);

    // If we have an intercept or near miss, we're done
    if (best.minDistance < CONFIG.nearMissThreshold) {
        return best;
    }

    // Iterative refinement for marginal results
    for (let pass = 1; pass <= CONFIG.maxRefinementPasses; pass++) {
        onProgress?.({
            phase: 'refinement',
            pass,
            maxPasses: CONFIG.maxRefinementPasses,
            message: `Refinement pass ${pass}/${CONFIG.maxRefinementPasses}...`
        });

        // Expand search bounds around best result
        const expandedOptions = {
            ...options,
            // Focus search around current best with expanded window
            customBounds: {
                yawMin: Math.max(CONFIG.yawMin, best.yawDeg - 20 * pass),
                yawMax: Math.min(CONFIG.yawMax, best.yawDeg + 20 * pass),
                pitchMin: Math.max(CONFIG.pitchMin, best.pitchDeg - 10 * pass),
                pitchMax: Math.min(CONFIG.pitchMax, best.pitchDeg + 10 * pass)
            }
        };

        // Re-run multi-horizon search with expanded bounds
        const refinedResult = await solveMultiHorizon(ship, target, expandedOptions, onProgress);

        if (refinedResult.minDistance < best.minDistance) {
            best = refinedResult;
        }

        // Stop if we achieved near miss or better
        if (best.minDistance < CONFIG.nearMissThreshold) {
            break;
        }

        await yieldToMainThread();
    }

    return best;
}

// ============================================================================
// MAIN SOLVER
// ============================================================================

/**
 * Solve for optimal course to target.
 *
 * Enhanced v2.0 algorithm:
 *   1. Multi-horizon search (180-1460 days)
 *   2. For each horizon: coarse → fine → ultra → gradient descent
 *   3. Iterative refinement if result is marginal
 *
 * @param {Object} ship - Ship object with orbitalElements and sail
 * @param {Object} target - Target object with elements
 * @param {Object} options - Optional parameters
 * @param {Function} onProgress - Progress callback ({phase, progress, message})
 * @returns {Promise<Object|null>} Course solution or null
 */
export async function solveCourse(ship, target, options = {}, onProgress = null) {
    const startTimeMs = Date.now();

    // Validate inputs
    if (!ship?.orbitalElements || !target?.elements) {
        return null;
    }

    onProgress?.({ phase: 'starting', progress: 0, message: 'Initializing course solver...' });

    try {
        // Run the full solver with refinement
        const result = await solveWithRefinement(ship, target, options, onProgress);

        const computeTimeMs = Date.now() - startTimeMs;

        onProgress?.({ phase: 'complete', progress: 1, message: 'Course computation complete' });

        return buildSolution(result, {
            computeTimeMs,
            horizonDays: result.horizonDays
        });
    } catch (error) {
        console.error('[COURSE_SOLVER] Error:', error);
        return null;
    }
}

/**
 * Legacy single-horizon solve for backward compatibility.
 *
 * @param {Object} ship - Ship object
 * @param {Object} target - Target object
 * @param {Object} options - Optional parameters
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object|null>} Course solution
 */
export async function solveCourseSimple(ship, target, options = {}, onProgress = null) {
    const startTimeMs = Date.now();

    if (!ship?.orbitalElements || !target?.elements) {
        return null;
    }

    const result = await solveForHorizon(ship, target, options, onProgress);
    const computeTimeMs = Date.now() - startTimeMs;

    return buildSolution(result, {
        computeTimeMs,
        horizonDays: options.maxDays || CONFIG.defaultMaxDays
    });
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Build complete solution object with quality metrics.
 */
function buildSolution(result, metrics) {
    // Determine quality rating
    // v3.0: Account for new status types (PHASE_MISS, NO_CROSSING)
    let quality;
    if (result.minDistance < CONFIG.interceptThreshold) {
        quality = 'INTERCEPT';
    } else if (result.minDistance < CONFIG.nearMissThreshold) {
        quality = 'NEAR_MISS';
    } else if (result.minDistance < CONFIG.marginalThreshold) {
        quality = 'MARGINAL';
    } else if (result.status === 'PHASE_MISS') {
        quality = 'PHASE_MISS';  // New: crossed orbit but planet was elsewhere
    } else if (result.status === 'NO_CROSSING') {
        quality = 'NO_CROSSING';  // New: didn't cross target's orbital radius
    } else {
        quality = 'NO_SOLUTION';
    }

    // Calculate confidence based on result quality
    // v3.0: Factor in angular separation for crossing-aware results
    let confidence;
    if (quality === 'INTERCEPT') {
        confidence = 0.95;
    } else if (quality === 'NEAR_MISS') {
        confidence = 0.85;
    } else if (quality === 'MARGINAL') {
        // v3.0: Boost confidence if angular separation is good
        const angularSep = result.angularSeparationDeg || 180;
        if (angularSep < 15) {
            confidence = 0.7;  // Good phase alignment
        } else if (angularSep < 30) {
            confidence = 0.6;
        } else {
            confidence = 0.5;
        }
    } else if (quality === 'PHASE_MISS') {
        confidence = 0.2;  // Low confidence - wrong timing
    } else if (quality === 'NO_CROSSING') {
        confidence = 0.1;  // Very low - can't reach target's orbit
    } else {
        confidence = 0.3;
    }

    return {
        // Recommended settings
        yawDeg: result.yawDeg,
        pitchDeg: result.pitchDeg,
        deployment: CONFIG.defaultDeployment,

        // Predicted outcome
        minDistance: result.minDistance,
        timeToClosest: result.timeToClosest,
        status: result.status,

        // Transfer time
        horizonDays: metrics.horizonDays,

        // Quality assessment
        quality,
        confidence,

        // v3.0: Crossing-aware metadata
        crossingInfo: {
            crossingIndex: result.crossingIndex ?? -1,
            totalCrossings: result.totalCrossings ?? 0,
            angularSeparationDeg: result.angularSeparationDeg ?? 180,
            crossingDirection: result.crossingDirection ?? 'unknown',
            usedCrossingAware: result.usedCrossingAware ?? false
        },

        // Search metrics
        searchMetrics: {
            computeTimeMs: metrics.computeTimeMs,
            horizonDays: metrics.horizonDays
        }
    };
}

/**
 * Yield to main thread to prevent UI blocking.
 */
function yieldToMainThread() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Get current configuration (for debugging/testing)
 */
export function getConfig() {
    return { ...CONFIG };
}

console.log('[COURSE_SOLVER] Module v3.0 loaded - Crossing-aware optimization with phase constraints');
