/**
 * Course Solver - Automatic Course Plotting (v4.1)
 *
 * GRID-BRACKET-CONVERGENCE algorithm for optimal sail settings to intercept targets.
 * Combines grid-based reconnaissance with Nelder-Mead refinement for reliable
 * course finding at ~500 evaluations (~3-5 seconds).
 *
 * v4.1 FIX: Reliable course finding
 *   - Reconnaissance now uses 10° grid (91 probes) instead of 9 fixed probes.
 *     The crossing-aware evaluation function is highly discontinuous (small yaw
 *     changes shift orbital crossing time → planet position jumps), so sparse
 *     probing missed the narrow "valleys" where timing works out.
 *   - Fixed Nelder-Mead degenerate simplex: when top 3 recon points were
 *     collinear (e.g., all at pitch=0), the simplex was a line and could never
 *     explore the pitch dimension. Now detects and corrects this.
 *   - Horizon scouting increased to 5 diverse probes (was 2), top 3 horizons
 *     searched (was 2).
 *   - ~500 evaluations total, ~3-5 seconds
 *
 * v4.0: Artillery Bracket Search (Nelder-Mead + adaptive precision + deployment sweep)
 *
 * Previous versions (preserved features):
 *   v3.7: SOI-based intercept threshold
 *   v3.0-3.6: Crossing-aware evaluation, quadratic interpolation,
 *             dynamic resolution, shared config, refinement mode
 *
 * Uses async/await with yields to prevent UI blocking.
 */

import { getPosition, getVelocity } from './orbital.js';
import { calculateSailThrust, applyThrust } from './orbital-maneuvers.js';
import { getJulianDate } from '../core/gameState.js';
import { INTERSECTION_CONFIG, SOI_RADII } from '../config.js';

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

    // ========================================================================
    // BRACKET SEARCH CONFIGURATION (v4.1)
    // ========================================================================

    // Reconnaissance grid step (degrees)
    // 10° grid over ±60° yaw × ±30° pitch = 13 × 7 = 91 probes
    // Crossing-aware evaluation has a discontinuous landscape (small yaw changes
    // shift WHEN trajectory crosses target orbit → large jumps in distance).
    // Need sufficient sampling density to find the narrow "valley" where
    // planetary timing works out. 9 fixed probes (v4.0) was too sparse.
    reconGridStep: 10,

    // Nelder-Mead simplex parameters
    nmAlpha: 1.0,     // Reflection coefficient
    nmGamma: 2.0,     // Expansion coefficient
    nmRho: 0.5,       // Contraction coefficient
    nmSigma: 0.5,     // Shrink coefficient
    nmMaxIterations: 80,

    // Adaptive precision tolerances (degrees)
    // Keyed by transfer duration breakpoints
    precisionTiers: [
        { maxDays: 180, tolerance: 0.01 },   // Short transfer: high precision
        { maxDays: 365, tolerance: 0.1 },     // Medium: good precision
        { maxDays: 730, tolerance: 0.5 },     // Long: moderate precision
        { maxDays: Infinity, tolerance: 2.0 }, // Very long: coarse (refinements later)
    ],

    // Deployment sweep levels (percent)
    deploymentLevels: [100, 75, 50, 25],

    // Horizon scouting
    // 5 diverse probes per horizon (varied yaw + pitch) to better rank horizons
    scoutProbesPerHorizon: 5,
    topHorizonsToSearch: 3,

    // Multi-start: if first Nelder-Mead result is poor, try from different quadrant
    multiStartThreshold: 0.2,  // AU - trigger multi-start if worse than this
    multiStartQuadrants: [
        { yaw: 35, pitch: 0 },    // Raise orbit
        { yaw: -35, pitch: 0 },   // Lower orbit
        { yaw: 0, pitch: 20 },    // Incline
        { yaw: -55, pitch: -10 }, // Steep lower + south
    ],

    // ========================================================================
    // REFINEMENT MODE CONFIGURATION
    // ========================================================================
    refinementYawRadius: 20,    // ±20° yaw from seed
    refinementPitchRadius: 15,  // ±15° pitch from seed

    // Simulation parameters
    defaultMaxDays: 365,
    defaultDeployment: 100,

    // Dynamic step calculation (shared with intersection detector)
    stepsPerDay: INTERSECTION_CONFIG.stepsPerDay,
    maxSteps: INTERSECTION_CONFIG.maxSteps,
    minSteps: INTERSECTION_CONFIG.minSteps,

    // Multi-horizon search durations (days)
    horizons: [180, 365, 540, 730, 1095, 1460],

    // Quality thresholds (AU)
    interceptThresholdFallback: 0.01,
    nearMissThreshold: 0.05,
    marginalThreshold: 0.2,

    // Yield frequency (yield to main thread every N evaluations)
    yieldFrequency: 10,

    // Timeout for entire solve operation (ms)
    maxSolveTimeMs: 30000,  // 30 seconds (down from 90s - solver is much faster now)

    // ========================================================================
    // CROSSING-AWARE SOLVER CONFIGURATION (v3.0)
    // ========================================================================
    maxPhaseAngle: 0.79,  // ~45 degrees
    minCrossingGap: 5,
    useCrossingAware: true
};

// ============================================================================
// CROSSING DETECTION HELPERS (v3.0) - UNCHANGED
// ============================================================================

/**
 * Calculate angular separation between two 3D positions (viewed from origin).
 */
function calculateAngularSeparation(pos1, pos2) {
    const mag1 = Math.sqrt(pos1.x ** 2 + pos1.y ** 2 + pos1.z ** 2);
    const mag2 = Math.sqrt(pos2.x ** 2 + pos2.y ** 2 + pos2.z ** 2);

    if (mag1 < 1e-15 || mag2 < 1e-15) {
        return 0;
    }

    const dot = pos1.x * pos2.x + pos1.y * pos2.y + pos1.z * pos2.z;
    const cosAngle = dot / (mag1 * mag2);
    const clampedCos = Math.max(-1, Math.min(1, cosAngle));

    return Math.acos(clampedCos);
}

/**
 * Solve for the exact crossing parameter using quadratic equation.
 * For P(t) = P1 + t*(P2-P1), solves ||P(t)||² = R²
 */
export function solveQuadraticCrossing(p1, p2, targetRadius) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dz = p2.z - p1.z;

    const a = dx * dx + dy * dy + dz * dz;
    const b = 2 * (p1.x * dx + p1.y * dy + p1.z * dz);
    const r1sq = p1.x * p1.x + p1.y * p1.y + p1.z * p1.z;
    const c = r1sq - targetRadius * targetRadius;

    if (a < 1e-20) {
        return null;
    }

    const discriminant = b * b - 4 * a * c;

    const EPSILON = 1e-10;
    if (discriminant < -EPSILON) {
        return null;
    }

    const safeDisc = Math.max(0, discriminant);
    const sqrtDisc = Math.sqrt(safeDisc);

    const t1 = (-b - sqrtDisc) / (2 * a);
    const t2 = (-b + sqrtDisc) / (2 * a);

    if (t1 >= 0 && t1 <= 1) {
        return t1;
    } else if (t2 >= 0 && t2 <= 1) {
        return t2;
    }

    return null;
}

/**
 * Find all orbital radius crossings in a trajectory.
 */
function findRadiusCrossingsInTrajectory(trajectory, targetRadius) {
    const crossings = [];

    if (!trajectory || trajectory.length < 2) {
        return crossings;
    }

    let lastCrossingIndex = -CONFIG.minCrossingGap;

    for (let i = 0; i < trajectory.length - 1; i++) {
        const p1 = trajectory[i];
        const p2 = trajectory[i + 1];

        const r1 = Math.sqrt(p1.x ** 2 + p1.y ** 2 + p1.z ** 2);
        const r2 = Math.sqrt(p2.x ** 2 + p2.y ** 2 + p2.z ** 2);

        const crossesOutbound = r1 < targetRadius && r2 >= targetRadius;
        const crossesInbound = r1 > targetRadius && r2 <= targetRadius;

        if (!crossesOutbound && !crossesInbound) {
            continue;
        }

        if (i - lastCrossingIndex < CONFIG.minCrossingGap) {
            continue;
        }

        let t = solveQuadraticCrossing(p1, p2, targetRadius);

        if (t === null) {
            const radialDiff = r2 - r1;
            if (Math.abs(radialDiff) < 1e-15) {
                t = 0.5;
            } else {
                t = Math.max(0, Math.min(1, (targetRadius - r1) / radialDiff));
            }
        }

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
 */
function distance3D(pos1, pos2) {
    const dx = pos2.x - pos1.x;
    const dy = pos2.y - pos1.y;
    const dz = pos2.z - pos1.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ============================================================================
// SOI-BASED INTERCEPT THRESHOLD - UNCHANGED
// ============================================================================

/**
 * Get the effective intercept threshold for a target body.
 */
function getInterceptThreshold(target) {
    if (!target?.name) {
        return CONFIG.interceptThresholdFallback;
    }

    const bodyName = target.name.toUpperCase();
    const soi = SOI_RADII[bodyName];

    if (soi && soi > 0) {
        return soi;
    }

    return CONFIG.interceptThresholdFallback;
}

// ============================================================================
// CORE EVALUATION - UNCHANGED
// ============================================================================

/**
 * Evaluate a single candidate sail configuration (v3.0 - CROSSING-AWARE).
 *
 * This function is the core of the solver and is UNCHANGED from v3.7.
 * The optimization is in HOW we choose which candidates to evaluate,
 * not in the evaluation itself.
 */
export function evaluateCandidate(yawDeg, pitchDeg, ship, target, options = {}) {
    const {
        maxDays = CONFIG.defaultMaxDays,
        deployment = CONFIG.defaultDeployment
    } = options;

    const rawSteps = Math.round(maxDays * CONFIG.stepsPerDay);
    const steps = options.steps || Math.min(CONFIG.maxSteps, Math.max(CONFIG.minSteps, rawSteps));

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
    const targetRadius = target.elements.a;

    let simElements = { ...ship.orbitalElements };

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

    const trajectory = [];

    let globalMinDistance = Infinity;
    let globalMinDistanceTime = 0;

    for (let i = 0; i <= steps; i++) {
        const simTime = startTime + i * timeStep;

        const shipPos = getPosition(simElements, simTime);
        const targetPos = getPosition(target.elements, simTime);

        if (!isFinite(shipPos.x) || !isFinite(targetPos.x)) {
            break;
        }

        trajectory.push({
            x: shipPos.x,
            y: shipPos.y,
            z: shipPos.z,
            time: simTime
        });

        const dx = targetPos.x - shipPos.x;
        const dy = targetPos.y - shipPos.y;
        const dz = targetPos.z - shipPos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < globalMinDistance) {
            globalMinDistance = dist;
            globalMinDistanceTime = (simTime - startTime);
        }

        if (i < steps && deployment > 0) {
            const velocity = getVelocity(simElements, simTime);
            const distFromSun = Math.sqrt(
                shipPos.x ** 2 + shipPos.y ** 2 + shipPos.z ** 2
            );

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

                if (!isFinite(newElements.a) || !isFinite(newElements.e) ||
                    newElements.e < 0 || newElements.e > 50) {
                    break;
                }

                simElements = newElements;
            }
        }
    }

    // CROSSING-AWARE EVALUATION (v3.0)
    if (CONFIG.useCrossingAware && trajectory.length > 1) {
        const crossings = findRadiusCrossingsInTrajectory(trajectory, targetRadius);

        let bestCrossing = null;
        let bestDistance = Infinity;
        let bestAngularSep = Math.PI;
        let bestCrossingIndex = -1;

        for (let ci = 0; ci < crossings.length; ci++) {
            const crossing = crossings[ci];

            const planetPos = getPosition(target.elements, crossing.time);

            if (!isFinite(planetPos.x)) continue;

            const crossingDistance = distance3D(crossing.position, planetPos);
            const angularSep = calculateAngularSeparation(crossing.position, planetPos);

            if (angularSep > CONFIG.maxPhaseAngle) {
                continue;
            }

            if (crossingDistance < bestDistance) {
                bestDistance = crossingDistance;
                bestAngularSep = angularSep;
                bestCrossingIndex = ci;
                bestCrossing = crossing;
            }
        }

        if (bestCrossing) {
            const interceptThreshold = getInterceptThreshold(target);

            let status;
            if (bestDistance < interceptThreshold) {
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
                crossingIndex: bestCrossingIndex,
                totalCrossings: crossings.length,
                angularSeparationDeg: bestAngularSep * (180 / Math.PI),
                crossingDirection: bestCrossing.direction,
                usedCrossingAware: true,
                crossingJulianDate: bestCrossing.time,
                interceptThreshold
            };
        }

        if (crossings.length > 0) {
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
                    status: 'PHASE_MISS',
                    crossingIndex: 0,
                    totalCrossings: crossings.length,
                    angularSeparationDeg: bestFailedAngularSep * (180 / Math.PI),
                    crossingDirection: bestFailedCrossing.direction,
                    usedCrossingAware: true,
                    crossingJulianDate: bestFailedCrossing.time
                };
            }
        }
    }

    // FALLBACK: No crossings found
    const interceptThreshold = getInterceptThreshold(target);

    let status;
    if (globalMinDistance < interceptThreshold) {
        status = 'INTERCEPT';
    } else if (globalMinDistance < CONFIG.nearMissThreshold) {
        status = 'NEAR_MISS';
    } else if (globalMinDistance < CONFIG.marginalThreshold) {
        status = 'MARGINAL';
    } else {
        status = 'NO_CROSSING';
    }

    return {
        yawDeg,
        pitchDeg,
        minDistance: globalMinDistance,
        timeToClosest: globalMinDistanceTime,
        status,
        crossingIndex: -1,
        totalCrossings: 0,
        angularSeparationDeg: 180,
        crossingDirection: 'none',
        usedCrossingAware: false,
        crossingJulianDate: null,
        interceptThreshold
    };
}

// ============================================================================
// ADAPTIVE PRECISION (v4.0)
// ============================================================================

/**
 * Get convergence tolerance based on transfer duration.
 *
 * Longer transfers don't need high precision - there will be course
 * refinements later. Short transfers need accuracy.
 *
 * @param {number} maxDays - Transfer duration in days
 * @returns {number} Convergence tolerance in degrees
 */
export function getConvergenceTolerance(maxDays) {
    for (const tier of CONFIG.precisionTiers) {
        if (maxDays <= tier.maxDays) {
            return tier.tolerance;
        }
    }
    return 2.0;  // Default: coarse
}

// ============================================================================
// STRATEGIC RECONNAISSANCE (v4.0 - replaces coarseSweep)
// ============================================================================

/**
 * Phase 1: Strategic reconnaissance - systematic sampling of the parameter space.
 *
 * v4.1 CHANGE: Uses a grid sweep instead of 9 fixed probes.
 *
 * The crossing-aware evaluation function is highly discontinuous: small changes
 * in sail angle shift WHEN the trajectory crosses the target's orbit, which
 * changes WHERE the planet is at crossing time, creating large jumps in distance.
 * This means optimal solutions live in narrow "valleys" that sparse probing misses.
 *
 * Full mode: 10° grid over ±60° yaw × ±30° pitch = 91 probes per horizon.
 * Refinement mode: 5° grid around seed point within custom bounds.
 *
 * @param {Object} ship - Ship object
 * @param {Object} target - Target object
 * @param {Object} options - Solver options (maxDays, deployment, etc.)
 * @param {Object} bounds - Optional custom bounds {yawCenter, pitchCenter, yawRadius, pitchRadius}
 * @returns {Promise<Array>} Sorted evaluation results (best first)
 */
export async function strategicReconnaissance(ship, target, options = {}, bounds = null) {
    const results = [];
    const probes = [];

    if (bounds) {
        // Refinement mode: grid around seed point with 5° steps
        const { yawCenter, pitchCenter, yawRadius, pitchRadius } = bounds;
        const yawMin = Math.max(CONFIG.yawMin, yawCenter - yawRadius);
        const yawMax = Math.min(CONFIG.yawMax, yawCenter + yawRadius);
        const pitchMin = Math.max(CONFIG.pitchMin, pitchCenter - pitchRadius);
        const pitchMax = Math.min(CONFIG.pitchMax, pitchCenter + pitchRadius);
        const step = 5;

        for (let yaw = yawMin; yaw <= yawMax; yaw += step) {
            for (let pitch = pitchMin; pitch <= pitchMax; pitch += step) {
                probes.push({ yaw, pitch });
            }
        }
    } else {
        // Full mode: grid over entire parameter space
        const step = CONFIG.reconGridStep;
        for (let yaw = CONFIG.yawMin; yaw <= CONFIG.yawMax; yaw += step) {
            for (let pitch = CONFIG.pitchMin; pitch <= CONFIG.pitchMax; pitch += step) {
                probes.push({ yaw, pitch });
            }
        }
    }

    for (let i = 0; i < probes.length; i++) {
        const { yaw, pitch } = probes[i];
        const clampedYaw = Math.max(CONFIG.yawMin, Math.min(CONFIG.yawMax, yaw));
        const clampedPitch = Math.max(CONFIG.pitchMin, Math.min(CONFIG.pitchMax, pitch));

        const result = evaluateCandidate(clampedYaw, clampedPitch, ship, target, options);
        results.push(result);

        if (i % CONFIG.yieldFrequency === 0) {
            await yieldToMainThread();
        }
    }

    results.sort((a, b) => a.minDistance - b.minDistance);
    return results;
}

// ============================================================================
// NELDER-MEAD SIMPLEX CONVERGENCE (v4.0 - replaces fine/ultra/uber/gradient)
// ============================================================================

/**
 * Phase 2: Nelder-Mead simplex optimization - "artillery bracketing" in 2D.
 *
 * Takes a triangle of 3 points, evaluates which is worst, and:
 *   - Reflects away from the worst ("too far left → go right")
 *   - Expands if we're going in a good direction ("keep going!")
 *   - Contracts if we overshot ("back off a bit")
 *   - Shrinks if stuck ("reduce the search area")
 *
 * This naturally brackets the target: each step makes an intelligent
 * decision about where to shoot next based on all previous results.
 *
 * Converges to the adaptive precision tolerance for the transfer duration.
 *
 * @param {Object} ship - Ship object
 * @param {Object} target - Target object
 * @param {Array} initialPoints - Best 3+ points from reconnaissance
 * @param {Object} options - Solver options
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object>} Best result found
 */
export async function nelderMeadSearch(ship, target, initialPoints, options = {}, onProgress = null) {
    const tolerance = getConvergenceTolerance(options.maxDays || CONFIG.defaultMaxDays);
    const interceptThreshold = getInterceptThreshold(target);
    const maxIter = CONFIG.nmMaxIterations;

    // Initialize simplex from best 3 reconnaissance points
    // Must form a proper triangle (not collinear) for 2D Nelder-Mead to work
    let simplex = [];
    for (let i = 0; i < Math.min(3, initialPoints.length); i++) {
        simplex.push({
            yaw: initialPoints[i].yawDeg,
            pitch: initialPoints[i].pitchDeg,
            value: initialPoints[i].minDistance,
            result: initialPoints[i]
        });
    }

    // If we don't have 3 distinct points, add perturbations
    while (simplex.length < 3) {
        const base = simplex[0];
        simplex.push({
            yaw: base.yaw + (simplex.length === 1 ? 10 : 0),
            pitch: base.pitch + (simplex.length === 2 ? 10 : 0),
            value: Infinity,
            result: null
        });
    }

    // v4.1 FIX: Check for degenerate (collinear) simplex
    // If top 3 recon points are all at the same pitch (common for in-plane
    // transfers where pitch=0 dominates), the simplex is a line and Nelder-Mead
    // can never explore the pitch dimension. Perturb the worst vertex off the line.
    const crossProduct2D =
        (simplex[1].yaw - simplex[0].yaw) * (simplex[2].pitch - simplex[0].pitch) -
        (simplex[1].pitch - simplex[0].pitch) * (simplex[2].yaw - simplex[0].yaw);
    const simplexArea = Math.abs(crossProduct2D) / 2;

    if (simplexArea < 1.0) {
        // Simplex is nearly degenerate - perturb worst vertex to create 2D spread
        // Use ±10° pitch offset from best point to ensure pitch exploration
        const bestYaw = simplex[0].yaw;
        const bestPitch = simplex[0].pitch;
        simplex[2] = {
            yaw: bestYaw,
            pitch: clampPitch(bestPitch + 10),
            value: Infinity,
            result: null
        };
        // Also ensure second vertex differs in yaw
        if (Math.abs(simplex[1].yaw - simplex[0].yaw) < 2) {
            simplex[1] = {
                yaw: clampYaw(bestYaw + 10),
                pitch: bestPitch,
                value: Infinity,
                result: null
            };
        }
    }

    // Ensure initial simplex points are evaluated
    for (let i = 0; i < simplex.length; i++) {
        if (!simplex[i].result) {
            const clampedYaw = clampYaw(simplex[i].yaw);
            const clampedPitch = clampPitch(simplex[i].pitch);
            const result = evaluateCandidate(clampedYaw, clampedPitch, ship, target, options);
            simplex[i].value = result.minDistance;
            simplex[i].result = result;
        }
    }

    const { nmAlpha, nmGamma, nmRho, nmSigma } = CONFIG;
    let evalCount = 0;

    for (let iter = 0; iter < maxIter; iter++) {
        // Sort: best (lowest distance) first
        simplex.sort((a, b) => a.value - b.value);

        // Check convergence: simplex diameter < tolerance
        const diameter = simplexDiameter(simplex);
        if (diameter < tolerance) {
            break;
        }

        // Early termination on intercept
        if (simplex[0].value < interceptThreshold) {
            break;
        }

        // Centroid of all vertices except worst
        const cx = (simplex[0].yaw + simplex[1].yaw) / 2;
        const cy = (simplex[0].pitch + simplex[1].pitch) / 2;

        const worst = simplex[2];

        // REFLECT: Try reflecting worst through centroid
        const rx = cx + nmAlpha * (cx - worst.yaw);
        const ry = cy + nmAlpha * (cy - worst.pitch);
        const reflected = await evalPoint(rx, ry, ship, target, options);
        evalCount++;

        if (reflected.value < simplex[0].value) {
            // Reflected is best so far - try EXPANDING further
            const ex = cx + nmGamma * (rx - cx);
            const ey = cy + nmGamma * (ry - cy);
            const expanded = await evalPoint(ex, ey, ship, target, options);
            evalCount++;

            if (expanded.value < reflected.value) {
                simplex[2] = expanded;  // Accept expansion
            } else {
                simplex[2] = reflected;  // Accept reflection
            }
        } else if (reflected.value < simplex[1].value) {
            // Better than second worst - accept reflection
            simplex[2] = reflected;
        } else {
            // Reflected is still poor - try CONTRACTING
            if (reflected.value < worst.value) {
                // Outside contraction
                const ocx = cx + nmRho * (rx - cx);
                const ocy = cy + nmRho * (ry - cy);
                const contracted = await evalPoint(ocx, ocy, ship, target, options);
                evalCount++;

                if (contracted.value <= reflected.value) {
                    simplex[2] = contracted;
                } else {
                    // Contraction failed - SHRINK toward best
                    await shrinkSimplex(simplex, ship, target, options);
                    evalCount += 2;
                }
            } else {
                // Inside contraction
                const icx = cx + nmRho * (worst.yaw - cx);
                const icy = cy + nmRho * (worst.pitch - cy);
                const contracted = await evalPoint(icx, icy, ship, target, options);
                evalCount++;

                if (contracted.value < worst.value) {
                    simplex[2] = contracted;
                } else {
                    // Contraction failed - SHRINK toward best
                    await shrinkSimplex(simplex, ship, target, options);
                    evalCount += 2;
                }
            }
        }

        // Yield periodically
        if (iter % 5 === 0) {
            onProgress?.(iter / maxIter);
            await yieldToMainThread();
        }
    }

    // Return best vertex
    simplex.sort((a, b) => a.value - b.value);
    return { best: simplex[0].result, evalCount };
}

/**
 * Evaluate a point with clamping to valid bounds.
 */
async function evalPoint(yaw, pitch, ship, target, options) {
    const clampedYaw = clampYaw(yaw);
    const clampedPitch = clampPitch(pitch);
    const result = evaluateCandidate(clampedYaw, clampedPitch, ship, target, options);
    return {
        yaw: clampedYaw,
        pitch: clampedPitch,
        value: result.minDistance,
        result
    };
}

/**
 * Shrink simplex toward best vertex.
 */
async function shrinkSimplex(simplex, ship, target, options) {
    const best = simplex[0];
    for (let i = 1; i < simplex.length; i++) {
        simplex[i].yaw = best.yaw + CONFIG.nmSigma * (simplex[i].yaw - best.yaw);
        simplex[i].pitch = best.pitch + CONFIG.nmSigma * (simplex[i].pitch - best.pitch);

        const clampedYaw = clampYaw(simplex[i].yaw);
        const clampedPitch = clampPitch(simplex[i].pitch);
        const result = evaluateCandidate(clampedYaw, clampedPitch, ship, target, options);
        simplex[i].value = result.minDistance;
        simplex[i].result = result;
    }
}

/**
 * Calculate the diameter (max edge length) of a simplex.
 */
function simplexDiameter(simplex) {
    let maxDist = 0;
    for (let i = 0; i < simplex.length; i++) {
        for (let j = i + 1; j < simplex.length; j++) {
            const dist = Math.sqrt(
                (simplex[i].yaw - simplex[j].yaw) ** 2 +
                (simplex[i].pitch - simplex[j].pitch) ** 2
            );
            if (dist > maxDist) maxDist = dist;
        }
    }
    return maxDist;
}

function clampYaw(yaw) {
    return Math.max(CONFIG.yawMin, Math.min(CONFIG.yawMax, yaw));
}

function clampPitch(pitch) {
    return Math.max(CONFIG.pitchMin, Math.min(CONFIG.pitchMax, pitch));
}

// ============================================================================
// HORIZON SCOUTING (v4.0 - replaces exhaustive multi-horizon search)
// ============================================================================

/**
 * Quick horizon scout: evaluate several candidates per horizon to rank them.
 *
 * v4.1 CHANGE: Increased from 2 to 5 probes per horizon with pitch diversity.
 *
 * Uses diverse probe angles to better identify which horizons have favorable
 * planetary alignment. The old 2-probe approach (both at pitch=0, same yaw
 * direction) could miss good horizons where the optimal angle was different.
 *
 * @param {Object} ship - Ship object
 * @param {Object} target - Target object
 * @param {Object} baseOptions - Base solver options
 * @returns {Promise<Array>} Top horizon durations sorted by potential, with eval count
 */
export async function scoutHorizons(ship, target, baseOptions = {}) {
    const horizons = baseOptions.horizons || CONFIG.horizons;
    const results = [];
    let evalCount = 0;

    // Determine smart probe angles based on target geometry
    const targetA = target.elements?.a || 1;
    const shipA = ship.orbitalElements?.a || 1;
    const goingInward = targetA < shipA;

    // 5 diverse probes: primary direction, steep, opposite, center, and with pitch
    const primaryYaw = goingInward ? -35 : 35;
    const steepYaw = goingInward ? -55 : 55;
    const oppositeYaw = goingInward ? 20 : -20;

    const scoutProbes = [
        { yaw: primaryYaw, pitch: 0 },     // Primary direction
        { yaw: steepYaw, pitch: 0 },       // Steep version
        { yaw: 0, pitch: 0 },              // Center/radial
        { yaw: oppositeYaw, pitch: 0 },    // Opposite direction (covers edge cases)
        { yaw: primaryYaw, pitch: 15 },    // Primary with inclination
    ];

    for (const maxDays of horizons) {
        const horizonOptions = { ...baseOptions, maxDays };
        let bestProbe = null;

        for (const probe of scoutProbes) {
            const result = evaluateCandidate(probe.yaw, probe.pitch, ship, target, horizonOptions);
            evalCount++;

            if (!bestProbe || result.minDistance < bestProbe.minDistance) {
                bestProbe = result;
            }
        }

        results.push({
            maxDays,
            bestDistance: bestProbe.minDistance,
            bestResult: bestProbe,
            status: bestProbe.status
        });

        await yieldToMainThread();
    }

    // Sort by best distance (most promising first)
    results.sort((a, b) => a.bestDistance - b.bestDistance);

    return { horizons: results, evalCount };
}

// ============================================================================
// DEPLOYMENT SWEEP (v4.0 - new, multi-sail awareness)
// ============================================================================

/**
 * Phase 3: Test deployment levels at the best angle.
 *
 * The solver previously always used 100% deployment. But with multiple sails
 * or certain transfer geometries, lower deployment can sometimes yield
 * better results (less aggressive thrust allows better phasing).
 *
 * @param {Object} ship - Ship object
 * @param {Object} target - Target object
 * @param {Object} bestResult - Best result from Nelder-Mead (at 100% deployment)
 * @param {Object} options - Solver options (maxDays, etc.)
 * @returns {Promise<Object>} Best result across all deployment levels, with eval count
 */
export async function deploymentSweep(ship, target, bestResult, options = {}) {
    let best = bestResult;
    let evalCount = 0;

    const yaw = bestResult.yawDeg;
    const pitch = bestResult.pitchDeg;

    for (const deployPct of CONFIG.deploymentLevels) {
        // Skip 100% if that's what we already have
        if (deployPct === (options.deployment || CONFIG.defaultDeployment)) {
            continue;
        }

        const deployOptions = { ...options, deployment: deployPct };
        const result = evaluateCandidate(yaw, pitch, ship, target, deployOptions);
        evalCount++;

        if (result.minDistance < best.minDistance) {
            best = result;
            // Store the deployment that was used
            best._deploymentOverride = deployPct;
        }

        await yieldToMainThread();
    }

    return { best, evalCount };
}

// ============================================================================
// SINGLE HORIZON SOLVER (v4.0 - bracket search pipeline)
// ============================================================================

/**
 * Solve for optimal course at a single time horizon.
 *
 * v4.0 pipeline: reconnaissance → Nelder-Mead → deployment sweep
 * Replaces: coarse → fine → ultra → uber → gradient descent
 *
 * @param {Object} ship - Ship object
 * @param {Object} target - Target object
 * @param {Object} options - Solver options (maxDays, etc.)
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object>} Best result for this horizon, with eval count
 */
async function solveForHorizon(ship, target, options = {}, onProgress = null) {
    const interceptThreshold = getInterceptThreshold(target);
    let totalEvals = 0;

    // Phase 1: Strategic Reconnaissance
    onProgress?.({ subPhase: 'recon', progress: 0 });
    const reconResults = await strategicReconnaissance(ship, target, options, options.reconBounds || null);
    totalEvals += reconResults.length;

    // Check for early termination
    if (reconResults[0].minDistance < interceptThreshold) {
        return { result: reconResults[0], totalEvals };
    }

    // Phase 2: Nelder-Mead Convergence
    onProgress?.({ subPhase: 'converge', progress: 0.3 });
    const nmResult = await nelderMeadSearch(ship, target, reconResults, options, (p) => {
        onProgress?.({ subPhase: 'converge', progress: 0.3 + p * 0.5 });
    });
    totalEvals += nmResult.evalCount;

    let best = nmResult.best;

    // Check for early termination
    if (best.minDistance < interceptThreshold) {
        return { result: best, totalEvals };
    }

    // Phase 2b: Multi-start if result is poor
    if (best.minDistance > CONFIG.multiStartThreshold) {
        onProgress?.({ subPhase: 'multistart', progress: 0.8 });

        for (const quadrant of CONFIG.multiStartQuadrants) {
            // Skip if this is close to where we already searched
            const dist = Math.sqrt(
                (quadrant.yaw - best.yawDeg) ** 2 +
                (quadrant.pitch - best.pitchDeg) ** 2
            );
            if (dist < 15) continue;  // Already explored this region

            // Quick recon from this quadrant
            const altRecon = await strategicReconnaissance(ship, target, options, {
                yawCenter: quadrant.yaw,
                pitchCenter: quadrant.pitch,
                yawRadius: 20,
                pitchRadius: 10
            });
            totalEvals += altRecon.length;

            // If recon found something better, run Nelder-Mead from there
            if (altRecon[0].minDistance < best.minDistance) {
                const altNm = await nelderMeadSearch(ship, target, altRecon, options);
                totalEvals += altNm.evalCount;

                if (altNm.best.minDistance < best.minDistance) {
                    best = altNm.best;
                }

                // Early termination
                if (best.minDistance < interceptThreshold) {
                    break;
                }
            }

            await yieldToMainThread();
        }
    }

    // Phase 3: Deployment Sweep
    onProgress?.({ subPhase: 'deployment', progress: 0.9 });
    const deployResult = await deploymentSweep(ship, target, best, options);
    totalEvals += deployResult.evalCount;
    best = deployResult.best;

    return { result: best, totalEvals };
}

// ============================================================================
// MAIN SOLVER (v4.0)
// ============================================================================

/**
 * Solve for optimal course to target.
 *
 * v4.0 Algorithm: Artillery Bracket Search
 *
 * FULL MODE (default):
 *   1. Horizon Scout: quick probes across 6 horizons → pick top 2
 *   2. For each top horizon: recon → Nelder-Mead → deployment sweep
 *   3. Return best across horizons
 *
 * REFINEMENT MODE (when options.refinementMode = true):
 *   1. Single horizon with recon centered on seed settings
 *   2. Nelder-Mead → deployment sweep
 *   3. Faster completion (~0.5-2s vs ~1-3s full)
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

    if (!ship?.orbitalElements || !target?.elements) {
        return null;
    }

    onProgress?.({ phase: 'starting', progress: 0, message: 'Initializing grid-bracket search...' });

    try {
        let bestResult = null;
        let bestHorizon = CONFIG.defaultMaxDays;

        if (options.refinementMode && options.seedSettings) {
            // ============================================================
            // REFINEMENT MODE: narrow search around seed settings
            // ============================================================
            const maxDays = options.maxDays || CONFIG.defaultMaxDays;

            onProgress?.({ phase: 'refinement-mode', progress: 0, message: 'Refinement bracket search...' });

            console.log(`[COURSE_SOLVER] Refinement mode: seed yaw=${options.seedSettings.yawDeg.toFixed(1)}°, ` +
                        `pitch=${options.seedSettings.pitchDeg.toFixed(1)}°, horizon=${maxDays}d`);

            const horizonOptions = {
                ...options,
                maxDays,
                reconBounds: {
                    yawCenter: options.seedSettings.yawDeg,
                    pitchCenter: options.seedSettings.pitchDeg,
                    yawRadius: CONFIG.refinementYawRadius,
                    pitchRadius: CONFIG.refinementPitchRadius
                }
            };

            const { result, totalEvals } = await solveForHorizon(ship, target, horizonOptions, (subProgress) => {
                onProgress?.({
                    phase: 'refinement-mode',
                    subPhase: subProgress.subPhase,
                    progress: subProgress.progress,
                    message: `Refinement: ${subProgress.subPhase}`
                });
            });

            bestResult = result;
            bestHorizon = maxDays;
            totalEvaluations = totalEvals;

        } else {
            // ============================================================
            // FULL MODE: horizon scout → deep search on top horizons
            // ============================================================
            onProgress?.({ phase: 'scouting', progress: 0, message: 'Scouting horizons...' });

            console.log('[COURSE_SOLVER] Full mode: grid-bracket search with horizon scouting');

            // Phase 0: Scout horizons
            const scoutResult = await scoutHorizons(ship, target, options);
            totalEvaluations += scoutResult.evalCount;

            const topHorizons = scoutResult.horizons.slice(0, CONFIG.topHorizonsToSearch);

            console.log(`[COURSE_SOLVER] Top horizons: ${topHorizons.map(h =>
                `${h.maxDays}d (${h.bestDistance.toFixed(4)} AU)`).join(', ')}`);

            const interceptThreshold = getInterceptThreshold(target);

            // Deep search on top horizons
            for (let i = 0; i < topHorizons.length; i++) {
                const horizon = topHorizons[i];

                onProgress?.({
                    phase: 'deep-search',
                    horizonIndex: i,
                    horizonCount: topHorizons.length,
                    currentHorizon: horizon.maxDays,
                    message: `Searching ${horizon.maxDays}d horizon...`
                });

                const horizonOptions = { ...options, maxDays: horizon.maxDays };

                const { result, totalEvals } = await solveForHorizon(ship, target, horizonOptions, (subProgress) => {
                    onProgress?.({
                        phase: 'deep-search',
                        horizonIndex: i,
                        horizonCount: topHorizons.length,
                        currentHorizon: horizon.maxDays,
                        subPhase: subProgress.subPhase,
                        subProgress: subProgress.progress,
                        message: `${horizon.maxDays}d: ${subProgress.subPhase}`
                    });
                });

                totalEvaluations += totalEvals;

                if (!bestResult || result.minDistance < bestResult.minDistance) {
                    bestResult = result;
                    bestHorizon = horizon.maxDays;
                }

                // Early termination if intercept found
                if (result.minDistance < interceptThreshold) {
                    console.log(`[COURSE_SOLVER] Intercept found at ${horizon.maxDays}d horizon, stopping`);
                    break;
                }

                await yieldToMainThread();
            }
        }

        const computeTimeMs = Date.now() - startTimeMs;

        onProgress?.({ phase: 'complete', progress: 1, message: 'Course computation complete' });

        if (!bestResult) {
            return null;
        }

        const solution = buildSolution(bestResult, {
            computeTimeMs,
            horizonDays: bestHorizon,
            totalEvaluations
        });

        solution.usedRefinementMode = options.refinementMode || false;

        console.log(`[COURSE_SOLVER] Complete: ${totalEvaluations} evals in ${computeTimeMs}ms ` +
                    `(yaw=${bestResult.yawDeg.toFixed(1)}°, pitch=${bestResult.pitchDeg.toFixed(1)}°, ` +
                    `dist=${bestResult.minDistance.toFixed(4)} AU, quality=${solution.quality})`);

        return solution;
    } catch (error) {
        console.error('[COURSE_SOLVER] Error:', error);
        return null;
    }
}

/**
 * Legacy single-horizon solve for backward compatibility.
 */
export async function solveCourseSimple(ship, target, options = {}, onProgress = null) {
    const startTimeMs = Date.now();

    if (!ship?.orbitalElements || !target?.elements) {
        return null;
    }

    const { result, totalEvals } = await solveForHorizon(ship, target, options, onProgress);
    const computeTimeMs = Date.now() - startTimeMs;

    return buildSolution(result, {
        computeTimeMs,
        horizonDays: options.maxDays || CONFIG.defaultMaxDays,
        totalEvaluations: totalEvals
    });
}

// ============================================================================
// LEGACY EXPORTS (for backward compatibility with tests)
// ============================================================================

/**
 * Legacy coarse sweep - now uses strategic reconnaissance.
 * Kept for backward compatibility with existing tests.
 */
export async function coarseSweep(ship, target, options = {}, onProgress = null) {
    const results = [];
    const candidates = [];

    // Generate the same 91-point grid for backward compatibility
    for (let yaw = CONFIG.yawMin; yaw <= CONFIG.yawMax; yaw += 5) {
        for (let pitch = CONFIG.pitchMin; pitch <= CONFIG.pitchMax; pitch += 5) {
            candidates.push({ yaw, pitch });
        }
    }

    const total = candidates.length;

    for (let i = 0; i < candidates.length; i++) {
        const { yaw, pitch } = candidates[i];
        const result = evaluateCandidate(yaw, pitch, ship, target, options);
        results.push(result);

        if (i % CONFIG.yieldFrequency === 0) {
            onProgress?.(i / total);
            await yieldToMainThread();
        }
    }

    results.sort((a, b) => a.minDistance - b.minDistance);
    return results;
}

/**
 * Legacy fine search - kept for backward compatibility with tests.
 */
export async function fineSearch(topCandidates, ship, target, options = {}, onProgress = null) {
    let best = topCandidates[0];
    const interceptThreshold = getInterceptThreshold(target);

    if (best.minDistance < interceptThreshold) {
        return best;
    }

    let evalCount = 0;
    const fineRadius = 8;
    const fineStep = 2;
    const totalEvals = topCandidates.length * Math.pow((fineRadius * 2 / fineStep + 1), 2);

    for (const candidate of topCandidates) {
        const centerYaw = candidate.yawDeg;
        const centerPitch = candidate.pitchDeg;

        for (let yaw = centerYaw - fineRadius; yaw <= centerYaw + fineRadius; yaw += fineStep) {
            for (let pitch = centerPitch - fineRadius; pitch <= centerPitch + fineRadius; pitch += fineStep) {
                const clampedYaw = clampYaw(yaw);
                const clampedPitch = clampPitch(pitch);

                const result = evaluateCandidate(clampedYaw, clampedPitch, ship, target, options);

                if (result.minDistance < best.minDistance) {
                    best = result;
                }

                evalCount++;

                if (evalCount % CONFIG.yieldFrequency === 0) {
                    onProgress?.(evalCount / totalEvals);
                    await yieldToMainThread();
                }

                if (best.minDistance < interceptThreshold) {
                    return best;
                }
            }
        }
    }

    return best;
}

/**
 * Legacy ultra-fine polish - kept for backward compatibility with tests.
 */
export async function ultraFinePolish(candidate, ship, target, options = {}, onProgress = null) {
    let best = candidate;

    const centerYaw = candidate.yawDeg;
    const centerPitch = candidate.pitchDeg;
    const ultraRadius = 2;
    const ultraStep = 0.1;

    let evalCount = 0;
    const totalEvals = Math.pow((ultraRadius * 2 / ultraStep + 1), 2);

    for (let yaw = centerYaw - ultraRadius; yaw <= centerYaw + ultraRadius; yaw += ultraStep) {
        for (let pitch = centerPitch - ultraRadius; pitch <= centerPitch + ultraRadius; pitch += ultraStep) {
            const clampedYaw = clampYaw(yaw);
            const clampedPitch = clampPitch(pitch);

            const result = evaluateCandidate(clampedYaw, clampedPitch, ship, target, options);

            if (result.minDistance < best.minDistance) {
                best = result;
            }

            evalCount++;

            if (evalCount % CONFIG.yieldFrequency === 0) {
                onProgress?.(evalCount / totalEvals);
                await yieldToMainThread();
            }
        }
    }

    return best;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Build complete solution object with quality metrics.
 */
function buildSolution(result, metrics) {
    const interceptThreshold = result.interceptThreshold || CONFIG.interceptThresholdFallback;

    let quality;
    if (result.minDistance < interceptThreshold) {
        quality = 'INTERCEPT';
    } else if (result.minDistance < CONFIG.nearMissThreshold) {
        quality = 'NEAR_MISS';
    } else if (result.minDistance < CONFIG.marginalThreshold) {
        quality = 'MARGINAL';
    } else if (result.status === 'PHASE_MISS') {
        quality = 'PHASE_MISS';
    } else if (result.status === 'NO_CROSSING') {
        quality = 'NO_CROSSING';
    } else {
        quality = 'NO_SOLUTION';
    }

    let confidence;
    if (quality === 'INTERCEPT') {
        confidence = 0.95;
    } else if (quality === 'NEAR_MISS') {
        confidence = 0.85;
    } else if (quality === 'MARGINAL') {
        const angularSep = result.angularSeparationDeg || 180;
        if (angularSep < 15) {
            confidence = 0.7;
        } else if (angularSep < 30) {
            confidence = 0.6;
        } else {
            confidence = 0.5;
        }
    } else if (quality === 'PHASE_MISS') {
        confidence = 0.2;
    } else if (quality === 'NO_CROSSING') {
        confidence = 0.1;
    } else {
        confidence = 0.3;
    }

    // Determine deployment: use override if deployment sweep found a better one
    const deployment = result._deploymentOverride || CONFIG.defaultDeployment;

    return {
        // Recommended settings
        yawDeg: result.yawDeg,
        pitchDeg: result.pitchDeg,
        deployment,

        // Predicted outcome
        minDistance: result.minDistance,
        timeToClosest: result.timeToClosest,
        status: result.status,

        // Transfer time
        horizonDays: metrics.horizonDays,

        // Quality assessment
        quality,
        confidence,

        // Crossing-aware metadata
        crossingInfo: {
            crossingIndex: result.crossingIndex ?? -1,
            totalCrossings: result.totalCrossings ?? 0,
            angularSeparationDeg: result.angularSeparationDeg ?? 180,
            crossingDirection: result.crossingDirection ?? 'unknown',
            usedCrossingAware: result.usedCrossingAware ?? false,
            crossingJulianDate: result.crossingJulianDate ?? null,
            interceptThreshold: interceptThreshold
        },

        // Search metrics
        searchMetrics: {
            computeTimeMs: metrics.computeTimeMs,
            horizonDays: metrics.horizonDays,
            totalEvaluations: metrics.totalEvaluations || 0,
            algorithm: 'grid-bracket-v4.1'
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

console.log('[COURSE_SOLVER] Module v4.1 loaded - Grid-Bracket Search (91-probe recon + Nelder-Mead convergence)');
