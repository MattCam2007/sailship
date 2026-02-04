/**
 * Course Solver - Automatic Course Plotting
 *
 * Hybrid coarse-to-fine search algorithm that calculates optimal sail settings
 * (yaw, pitch) to intercept a target planet.
 *
 * Algorithm:
 *   Phase 1 (Coarse):    91 evaluations at 10° resolution
 *   Phase 2 (Fine):     405 evaluations at 2° resolution around top 5
 *   Phase 3 (Ultra):    121 evaluations at 0.1° resolution around best
 *   Total:             ~617 evaluations, ~6 seconds
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

    // Phase 1: Coarse sweep
    coarseStep: 10,

    // Phase 2: Fine search
    fineStep: 2,
    fineRadius: 8,
    topCandidates: 5,

    // Phase 3: Ultra-fine polish (matches UI ULTRA resolution of 0.1°)
    ultraStep: 0.1,
    ultraRadius: 0.5,

    // Simulation parameters
    defaultMaxDays: 365,
    defaultSteps: 200,
    defaultDeployment: 100,

    // Quality thresholds (AU)
    interceptThreshold: 0.01,
    nearMissThreshold: 0.05,
    marginalThreshold: 0.2,

    // Yield frequency (yield to main thread every N evaluations)
    yieldFrequency: 10
};

// ============================================================================
// CORE EVALUATION
// ============================================================================

/**
 * Evaluate a single candidate sail configuration.
 *
 * Simulates the ship's trajectory with given yaw/pitch settings and finds
 * the closest approach to the target.
 *
 * @param {number} yawDeg - Sail yaw angle in degrees
 * @param {number} pitchDeg - Sail pitch angle in degrees
 * @param {Object} ship - Ship object with orbitalElements and sail
 * @param {Object} target - Target object with elements
 * @param {Object} options - Optional parameters
 * @returns {Promise<Object>} Evaluation result
 */
export async function evaluateCandidate(yawDeg, pitchDeg, ship, target, options = {}) {
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
            status: 'INVALID'
        };
    }

    const startTime = getJulianDate();
    const timeStep = maxDays / steps;

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

    let minDistance = Infinity;
    let minDistanceTime = 0;

    // Forward simulation
    for (let i = 0; i <= steps; i++) {
        const simTime = startTime + i * timeStep;

        // Get positions
        const shipPos = getPosition(simElements, simTime);
        const targetPos = getPosition(target.elements, simTime);

        // Validate positions
        if (!isFinite(shipPos.x) || !isFinite(targetPos.x)) {
            break;
        }

        // Calculate distance
        const dx = targetPos.x - shipPos.x;
        const dy = targetPos.y - shipPos.y;
        const dz = targetPos.z - shipPos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // Track closest approach
        if (dist < minDistance) {
            minDistance = dist;
            minDistanceTime = i * timeStep;
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

    // Determine status
    let status;
    if (minDistance < CONFIG.interceptThreshold) {
        status = 'INTERCEPT';
    } else if (minDistance < CONFIG.nearMissThreshold) {
        status = 'NEAR_MISS';
    } else if (minDistance < CONFIG.marginalThreshold) {
        status = 'MARGINAL';
    } else {
        status = 'NO_INTERCEPT';
    }

    return {
        yawDeg,
        pitchDeg,
        minDistance,
        timeToClosest: minDistanceTime,
        status
    };
}

// ============================================================================
// PHASE 1: COARSE SWEEP
// ============================================================================

/**
 * Phase 1: Coarse grid search over parameter space.
 *
 * Sweeps yaw from -60° to +60° and pitch from -30° to +30° in 10° steps.
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
        const result = await evaluateCandidate(yaw, pitch, ship, target, options);
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

                const result = await evaluateCandidate(clampedYaw, clampedPitch, ship, target, options);

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
 * Searches ±0.5° in 0.1° steps for final precision.
 * Matches UI ULTRA resolution mode for consistent precision.
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

            const result = await evaluateCandidate(clampedYaw, clampedPitch, ship, target, options);

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
// MAIN SOLVER
// ============================================================================

/**
 * Solve for optimal course to target.
 *
 * Orchestrates the three-phase search:
 *   1. Coarse sweep (91 evaluations)
 *   2. Fine search (up to 405 evaluations)
 *   3. Ultra-fine polish (121 evaluations at 0.1° resolution)
 *
 * @param {Object} ship - Ship object with orbitalElements and sail
 * @param {Object} target - Target object with elements
 * @param {Object} options - Optional parameters
 * @param {Function} onProgress - Progress callback ({phase, progress, message})
 * @returns {Promise<Object|null>} Course solution or null
 */
export async function solveCourse(ship, target, options = {}, onProgress = null) {
    const startTimeMs = Date.now();
    let totalEvaluations = 0;

    // Validate inputs
    if (!ship?.orbitalElements || !target?.elements) {
        return null;
    }

    // Phase 1: Coarse sweep
    onProgress?.({ phase: 1, progress: 0, message: 'Scanning parameter space...' });

    const coarseResults = await coarseSweep(ship, target, options, (p) => {
        onProgress?.({ phase: 1, progress: p, message: 'Scanning parameter space...' });
    });

    totalEvaluations += coarseResults.length;

    // Check for early termination
    if (coarseResults[0].minDistance < CONFIG.interceptThreshold) {
        return buildSolution(coarseResults[0], {
            totalEvaluations,
            computeTimeMs: Date.now() - startTimeMs,
            phases: { coarse: true, fine: false, ultra: false }
        });
    }

    // Phase 2: Fine search
    onProgress?.({ phase: 2, progress: 0, message: 'Refining top candidates...' });

    const topCandidates = coarseResults.slice(0, CONFIG.topCandidates);
    const fineResult = await fineSearch(topCandidates, ship, target, options, (p) => {
        onProgress?.({ phase: 2, progress: p, message: 'Refining top candidates...' });
    });

    // Estimate fine evaluations (may be less due to early termination)
    totalEvaluations += CONFIG.topCandidates * 81; // Approximate

    // Check for early termination
    if (fineResult.minDistance < CONFIG.interceptThreshold) {
        return buildSolution(fineResult, {
            totalEvaluations,
            computeTimeMs: Date.now() - startTimeMs,
            phases: { coarse: true, fine: true, ultra: false }
        });
    }

    // Phase 3: Ultra-fine polish
    onProgress?.({ phase: 3, progress: 0, message: 'Final optimization...' });

    const ultraResult = await ultraFinePolish(fineResult, ship, target, options, (p) => {
        onProgress?.({ phase: 3, progress: p, message: 'Final optimization...' });
    });

    totalEvaluations += 121; // 11x11 grid at 0.1° resolution

    return buildSolution(ultraResult, {
        totalEvaluations,
        computeTimeMs: Date.now() - startTimeMs,
        phases: { coarse: true, fine: true, ultra: true }
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
    let quality;
    if (result.minDistance < CONFIG.interceptThreshold) {
        quality = 'INTERCEPT';
    } else if (result.minDistance < CONFIG.nearMissThreshold) {
        quality = 'NEAR_MISS';
    } else if (result.minDistance < CONFIG.marginalThreshold) {
        quality = 'MARGINAL';
    } else {
        quality = 'NO_SOLUTION';
    }

    // Calculate confidence (based on search depth)
    let confidence = 0.5; // Base confidence from coarse
    if (metrics.phases.fine) confidence += 0.3;
    if (metrics.phases.ultra) confidence += 0.2;

    return {
        // Recommended settings
        yawDeg: result.yawDeg,
        pitchDeg: result.pitchDeg,
        deployment: CONFIG.defaultDeployment,

        // Predicted outcome
        minDistance: result.minDistance,
        timeToClosest: result.timeToClosest,
        status: result.status,

        // Quality assessment
        quality,
        confidence,

        // Search metrics
        searchMetrics: {
            totalEvaluations: metrics.totalEvaluations,
            computeTimeMs: metrics.computeTimeMs,
            phases: metrics.phases
        }
    };
}

/**
 * Yield to main thread to prevent UI blocking.
 */
function yieldToMainThread() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

console.log('[COURSE_SOLVER] Module loaded');
