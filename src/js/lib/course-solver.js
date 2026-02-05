/**
 * Course Solver - Automatic Course Plotting (v3.7)
 *
 * CROSSING-AWARE hybrid search algorithm for optimal sail settings to intercept targets.
 *
 * v3.7 CHANGE: SOI-Based Intercept Threshold
 *   - INTERCEPT now means ship will enter target's Sphere of Influence (SOI)
 *   - Uses actual SOI radii from config.js instead of fixed 0.01 AU threshold
 *   - Venus SOI: 0.00411 AU, Earth: 0.00620 AU, Jupiter: 0.3219 AU, etc.
 *   - Prevents false "INTERCEPT" status when closest approach is outside SOI
 *   - Solution includes interceptThreshold for transparent classification
 *
 * v3.6 CHANGE: Expanded Refinement Bounds + Uber-Fine Resolution
 *   - Expanded refinement bounds to ±20° yaw, ±15° pitch (was ±15°/±10°)
 *   - Accommodates large-distance course corrections at longer horizons
 *   - Added uber-fine polish phase (0.01° resolution) for exact course plotting
 *   - "Last mile" plotting achieves sub-0.01 AU precision on intercepts
 *
 * v3.5 CHANGE: Refinement Mode (Course Refinement Feature)
 *   - Added refinementSweep() for narrow search around seed settings
 *   - Added solveWithRefinementMode() for faster mid-transit corrections
 *   - solveCourse() now accepts refinementMode and seedSettings options
 *   - When refinementMode=true, searches ±20° yaw, ±15° pitch around seed
 *   - Skips multi-horizon search, uses single horizon for speed
 *   - ~5-10 second completion vs ~30-45 seconds for full search
 *
 * v3.4 CHANGE: Display Solver's Crossing Time (Fix #4)
 *   - Added crossingJulianDate to evaluateCandidate return
 *   - Added crossingJulianDate to crossingInfo in buildSolution
 *   - UI can now display the exact crossing time the solver optimized for
 *   - Helps users see if displayed ghost differs from solver's target
 *
 * v3.3 CHANGE: Shared Configuration (Fix #3)
 *   - Import INTERSECTION_CONFIG from config.js for trajectory parameters
 *   - CONFIG.stepsPerDay/maxSteps/minSteps now reference shared config
 *   - Guarantees identical trajectory resolution between solver and detector
 *   - Eliminates configuration drift risk
 *
 * v3.2 CHANGE: Quadratic Interpolation (Fix #2)
 *   - Replaced linear interpolation with quadratic solving in findRadiusCrossingsInTrajectory
 *   - Solves ||P(t)||² = R² for exact crossing point
 *   - Matches algorithm used by intersection detector
 *   - Crossing time error reduced from 5-30 minutes to ~seconds
 *
 * v3.1 CHANGE: Dynamic Resolution (Fix #1)
 *   - Steps calculated dynamically based on duration: min(6000, max(500, days * 12))
 *   - Matches intersection detector resolution (~2 hour intervals)
 *   - For 365-day horizon: ~4380 steps (was fixed 1000)
 *   - Crossing time discrepancy reduced from ±4 hours to ±1 hour
 *
 * v3.0 MAJOR CHANGE: Crossing-Aware Optimization
 *   - Evaluates candidates based on ORBITAL CROSSING distance, not global minimum
 *   - Phase constraint ensures planet is angularly close at crossing time
 *   - Results directly correspond to displayed ghost planets
 *
 * Algorithm features:
 *   - Denser coarse sweep (5° steps)
 *   - Dynamic simulation resolution (12 steps/day, matching detector)
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

    // Phase 1: Coarse sweep (5° for better coverage)
    coarseStep: 5,

    // Phase 2: Fine search
    fineStep: 2,
    fineRadius: 8,
    topCandidates: 8,  // Increased from 5 to catch more candidates

    // Phase 3: Ultra-fine polish (expanded window to escape local optima)
    ultraStep: 0.1,
    ultraRadius: 2,  // Increased from 0.5 to ±2°

    // Phase 3.5: Uber-fine polish (v3.6 - "last mile" exact course plotting)
    uberStep: 0.01,
    uberRadius: 0.2,  // ±0.2° around best ultra result

    // ========================================================================
    // REFINEMENT MODE CONFIGURATION (Course Refinement Feature)
    // ========================================================================
    // Refinement mode uses narrower search bounds centered on seed settings
    // for faster course corrections during transit.

    // Refinement search bounds around seed settings
    // v3.6 CHANGE: Expanded bounds for large-distance course corrections
    // When courses are plotted at longer horizons, initial offsets can be larger
    refinementYawRadius: 20,    // ±20° yaw from seed (was ±15°)
    refinementPitchRadius: 15,  // ±15° pitch from seed (was ±10°)

    // Refinement grid step (finer than coarse, same as fine)
    refinementStep: 2,

    // Simulation parameters (high resolution for solar sail accuracy)
    defaultMaxDays: 365,
    defaultDeployment: 100,

    // Dynamic step calculation (Fix #1 - match intersection detector resolution)
    // Fix #3: Import shared trajectory parameters from config.js
    // This guarantees solver and intersection detector use identical resolution
    stepsPerDay: INTERSECTION_CONFIG.stepsPerDay,   // ~2 hour intervals (12 steps/day)
    maxSteps: INTERSECTION_CONFIG.maxSteps,         // Cap to prevent excessive computation
    minSteps: INTERSECTION_CONFIG.minSteps,         // Quality floor for short durations

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
    // NOTE: interceptThreshold is a FALLBACK for bodies without defined SOI.
    // For bodies with SOI_RADII defined, we use the actual SOI as the intercept threshold.
    // A true intercept means entering the target's sphere of influence.
    interceptThresholdFallback: 0.01,  // Used when target has no SOI defined
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
 * Solve for the exact crossing parameter using quadratic equation (Fix #2).
 * For P(t) = P1 + t*(P2-P1), solves ||P(t)||² = R²
 *
 * This gives exact crossing times (within floating-point precision) instead of
 * the approximate linear interpolation which had 5-30 minute errors.
 *
 * @param {Object} p1 - Start point {x, y, z}
 * @param {Object} p2 - End point {x, y, z}
 * @param {number} targetRadius - Target radius to find crossing for
 * @returns {number|null} Parameter t in [0,1] or null if no valid crossing
 */
export function solveQuadraticCrossing(p1, p2, targetRadius) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dz = p2.z - p1.z;

    // Quadratic coefficients for ||P(t)||² = R²
    // Expanding: (p1.x + t*dx)² + (p1.y + t*dy)² + (p1.z + t*dz)² = R²
    // a*t² + b*t + c = 0
    const a = dx * dx + dy * dy + dz * dz;
    const b = 2 * (p1.x * dx + p1.y * dy + p1.z * dz);
    const r1sq = p1.x * p1.x + p1.y * p1.y + p1.z * p1.z;
    const c = r1sq - targetRadius * targetRadius;

    // Check for degenerate case (no movement)
    if (a < 1e-20) {
        return null;
    }

    const discriminant = b * b - 4 * a * c;

    // Epsilon tolerance for near-zero discriminant (tangent case)
    // Matches the tolerance used in intersectionDetector.js
    const EPSILON = 1e-10;
    if (discriminant < -EPSILON) {
        return null; // No real solution
    }

    // Clamp tiny negatives to zero (handles floating-point near-tangent cases)
    const safeDisc = Math.max(0, discriminant);
    const sqrtDisc = Math.sqrt(safeDisc);

    const t1 = (-b - sqrtDisc) / (2 * a);
    const t2 = (-b + sqrtDisc) / (2 * a);

    // Return the first valid solution in [0, 1]
    if (t1 >= 0 && t1 <= 1) {
        return t1;
    } else if (t2 >= 0 && t2 <= 1) {
        return t2;
    }

    return null;
}

/**
 * Find all orbital radius crossings in a trajectory.
 *
 * Detects when ship crosses the target's semi-major axis distance from the Sun.
 * Uses the same quadratic algorithm as intersectionDetector for consistency with ghost planets.
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

        // Calculate exact crossing point using QUADRATIC solving (Fix #2)
        // This matches the intersection detector's algorithm for consistency
        // and reduces crossing time error from 5-30 minutes to ~seconds
        let t = solveQuadraticCrossing(p1, p2, targetRadius);

        if (t === null) {
            // Fallback to linear if quadratic fails (rare edge case)
            const radialDiff = r2 - r1;
            if (Math.abs(radialDiff) < 1e-15) {
                t = 0.5;  // Midpoint if radii are essentially equal
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
// SOI-BASED INTERCEPT THRESHOLD
// ============================================================================

/**
 * Get the effective intercept threshold for a target body.
 *
 * A true "intercept" means the ship will enter the target's sphere of influence.
 * For bodies with defined SOI, we use that as the threshold.
 * For bodies without SOI (asteroids, etc.), we fall back to the default threshold.
 *
 * @param {Object} target - Target object with name property
 * @returns {number} Intercept threshold in AU
 */
function getInterceptThreshold(target) {
    if (!target?.name) {
        return CONFIG.interceptThresholdFallback;
    }

    // Look up SOI by body name (SOI_RADII uses uppercase keys)
    const bodyName = target.name.toUpperCase();
    const soi = SOI_RADII[bodyName];

    if (soi && soi > 0) {
        return soi;
    }

    // No SOI defined for this body - use fallback
    return CONFIG.interceptThresholdFallback;
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
        deployment = CONFIG.defaultDeployment
    } = options;

    // Calculate steps dynamically based on duration (Fix #1 - match intersection detector)
    // Formula: min(maxSteps, max(minSteps, duration * stepsPerDay))
    // This ensures consistent ~2 hour intervals matching the intersection detector
    const rawSteps = Math.round(maxDays * CONFIG.stepsPerDay);
    const steps = options.steps || Math.min(CONFIG.maxSteps, Math.max(CONFIG.minSteps, rawSteps));

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
            // Get SOI-based intercept threshold for this target
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
                // v3.0 crossing metadata
                crossingIndex: bestCrossingIndex,
                totalCrossings: crossings.length,
                angularSeparationDeg: bestAngularSep * (180 / Math.PI),
                crossingDirection: bestCrossing.direction,
                usedCrossingAware: true,
                // Fix #4: Store crossing Julian date for UI display
                crossingJulianDate: bestCrossing.time,
                // Store threshold used for downstream comparisons
                interceptThreshold
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
                    usedCrossingAware: true,
                    // Fix #4: Store crossing Julian date for UI display
                    crossingJulianDate: bestFailedCrossing.time
                };
            }
        }
    }

    // ========================================================================
    // FALLBACK: No crossings found - use global minimum (original behavior)
    // ========================================================================
    // This happens when trajectory doesn't cross target's orbital radius at all
    // (e.g., targeting outer planet from inner orbit without enough delta-v)

    // Get SOI-based intercept threshold for this target
    const interceptThreshold = getInterceptThreshold(target);

    let status;
    if (globalMinDistance < interceptThreshold) {
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
        usedCrossingAware: false,  // Fell back to global minimum
        // Fix #4: No crossing found, so no crossing date
        crossingJulianDate: null,
        // Store threshold used for downstream comparisons
        interceptThreshold
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
// REFINEMENT SWEEP (Course Refinement Feature)
// ============================================================================

/**
 * Refinement sweep: narrow search centered on seed settings.
 *
 * Used when re-plotting a course during transit. Instead of the full 91-point
 * coarse grid, searches ±15° yaw and ±10° pitch around the current sail settings
 * with 2° resolution (~120 evaluations).
 *
 * This is faster than full search and sufficient for mid-course corrections.
 *
 * @param {Object} ship - Ship object
 * @param {Object} target - Target object
 * @param {Object} seedSettings - { yawDeg, pitchDeg } to center search around
 * @param {Object} options - Optional parameters
 * @param {Function} onProgress - Progress callback (0-1)
 * @returns {Promise<Array>} Sorted array of evaluation results
 */
export async function refinementSweep(ship, target, seedSettings, options = {}, onProgress = null) {
    const results = [];
    const candidates = [];

    const { yawDeg: seedYaw, pitchDeg: seedPitch } = seedSettings;

    // Calculate bounds centered on seed settings
    const yawMin = Math.max(CONFIG.yawMin, seedYaw - CONFIG.refinementYawRadius);
    const yawMax = Math.min(CONFIG.yawMax, seedYaw + CONFIG.refinementYawRadius);
    const pitchMin = Math.max(CONFIG.pitchMin, seedPitch - CONFIG.refinementPitchRadius);
    const pitchMax = Math.min(CONFIG.pitchMax, seedPitch + CONFIG.refinementPitchRadius);

    // Generate candidate grid with finer resolution
    for (let yaw = yawMin; yaw <= yawMax; yaw += CONFIG.refinementStep) {
        for (let pitch = pitchMin; pitch <= pitchMax; pitch += CONFIG.refinementStep) {
            candidates.push({ yaw, pitch });
        }
    }

    const total = candidates.length;
    console.log(`[COURSE_SOLVER] Refinement sweep: ${total} candidates ` +
                `(yaw ${yawMin.toFixed(0)}° to ${yawMax.toFixed(0)}°, ` +
                `pitch ${pitchMin.toFixed(0)}° to ${pitchMax.toFixed(0)}°)`);

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

    // Get SOI-based intercept threshold for this target
    const interceptThreshold = getInterceptThreshold(target);

    // Early termination if already have intercept
    if (best.minDistance < interceptThreshold) {
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
                if (best.minDistance < interceptThreshold) {
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
// PHASE 3.5: UBER-FINE POLISH (v3.6 - "LAST MILE" EXACT PLOTTING)
// ============================================================================

/**
 * Phase 3.5: Uber-fine polish for exact course plotting.
 *
 * Searches ±0.2° in 0.01° steps for maximum precision.
 * This "last mile" phase achieves sub-0.01 AU intercept accuracy.
 *
 * @param {Object} candidate - Best result from ultra-fine polish
 * @param {Object} ship - Ship object
 * @param {Object} target - Target object
 * @param {Object} options - Optional parameters
 * @param {Function} onProgress - Progress callback (0-1)
 * @returns {Promise<Object>} Final uber-polished result
 */
export async function uberFinePolish(candidate, ship, target, options = {}, onProgress = null) {
    let best = candidate;

    const centerYaw = candidate.yawDeg;
    const centerPitch = candidate.pitchDeg;

    let evalCount = 0;
    const totalEvals = Math.pow((CONFIG.uberRadius * 2 / CONFIG.uberStep + 1), 2);

    for (let yaw = centerYaw - CONFIG.uberRadius; yaw <= centerYaw + CONFIG.uberRadius; yaw += CONFIG.uberStep) {
        for (let pitch = centerPitch - CONFIG.uberRadius; pitch <= centerPitch + CONFIG.uberRadius; pitch += CONFIG.uberStep) {
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

    // Get SOI-based intercept threshold for this target
    const interceptThreshold = getInterceptThreshold(target);

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
        if (best.minDistance < interceptThreshold) {
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
 * Runs all phases: coarse → fine → ultra → uber → gradient descent
 *
 * @param {Object} ship - Ship object
 * @param {Object} target - Target object
 * @param {Object} options - Optional parameters including maxDays
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object>} Best result for this horizon
 */
async function solveForHorizon(ship, target, options = {}, onProgress = null) {
    const horizonDays = options.maxDays || CONFIG.defaultMaxDays;

    // Get SOI-based intercept threshold for this target
    const interceptThreshold = getInterceptThreshold(target);

    // Phase 1: Coarse sweep
    const coarseResults = await coarseSweep(ship, target, options, (p) => {
        onProgress?.({ subPhase: 'coarse', progress: p });
    });

    // Check for early termination
    if (coarseResults[0].minDistance < interceptThreshold) {
        return coarseResults[0];
    }

    // Phase 2: Fine search
    const topCandidates = coarseResults.slice(0, CONFIG.topCandidates);
    const fineResult = await fineSearch(topCandidates, ship, target, options, (p) => {
        onProgress?.({ subPhase: 'fine', progress: p });
    });

    // Check for early termination
    if (fineResult.minDistance < interceptThreshold) {
        return fineResult;
    }

    // Phase 3: Ultra-fine polish
    const ultraResult = await ultraFinePolish(fineResult, ship, target, options, (p) => {
        onProgress?.({ subPhase: 'ultra', progress: p });
    });

    // Check for early termination
    if (ultraResult.minDistance < interceptThreshold) {
        return ultraResult;
    }

    // Phase 3.5: Uber-fine polish (v3.6 - "last mile" exact plotting)
    const uberResult = await uberFinePolish(ultraResult, ship, target, options, (p) => {
        onProgress?.({ subPhase: 'uber', progress: p });
    });

    // Check for early termination
    if (uberResult.minDistance < interceptThreshold) {
        return uberResult;
    }

    // Phase 4: Gradient descent polish
    const gradientResult = await gradientDescentPolish(uberResult, ship, target, options, (p) => {
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

    // Get SOI-based intercept threshold for this target
    const interceptThreshold = getInterceptThreshold(target);

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
        if (result.minDistance < interceptThreshold) {
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
// REFINEMENT MODE SOLVER (Course Refinement Feature)
// ============================================================================

/**
 * Solve for optimal course using refinement mode.
 *
 * Refinement mode is used when re-plotting during transit. Instead of the full
 * multi-horizon search, it:
 *   1. Uses narrow search bounds around seed settings (±20° yaw, ±15° pitch)
 *   2. Skips multi-horizon search (uses single horizon from current trajectory)
 *   3. Still applies fine, ultra-fine, uber-fine, and gradient descent polish
 *
 * This is significantly faster than full search (~5-10 seconds vs ~30-45 seconds).
 *
 * @param {Object} ship - Ship object
 * @param {Object} target - Target object
 * @param {Object} seedSettings - { yawDeg, pitchDeg, deployment } to center search around
 * @param {Object} options - Optional parameters (including maxDays)
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object>} Best result from refinement search
 */
async function solveWithRefinementMode(ship, target, seedSettings, options = {}, onProgress = null) {
    const maxDays = options.maxDays || CONFIG.defaultMaxDays;

    // Get SOI-based intercept threshold for this target
    const interceptThreshold = getInterceptThreshold(target);

    console.log(`[COURSE_SOLVER] Running refinement mode (seed: yaw=${seedSettings.yawDeg.toFixed(1)}°, ` +
                `pitch=${seedSettings.pitchDeg.toFixed(1)}°, horizon=${maxDays}d)`);

    onProgress?.({
        phase: 'refinement-mode',
        progress: 0,
        message: 'Refinement search...'
    });

    // Phase 1: Refinement sweep (replaces coarse sweep)
    const refinementResults = await refinementSweep(ship, target, seedSettings, options, (p) => {
        onProgress?.({ phase: 'refinement-mode', subPhase: 'sweep', progress: p * 0.25, message: 'Refinement sweep...' });
    });

    // Check for early termination
    if (refinementResults[0].minDistance < interceptThreshold) {
        return { ...refinementResults[0], horizonDays: maxDays };
    }

    // Phase 2: Fine search around top candidates
    const topCandidates = refinementResults.slice(0, CONFIG.topCandidates);
    const fineResult = await fineSearch(topCandidates, ship, target, options, (p) => {
        onProgress?.({ phase: 'refinement-mode', subPhase: 'fine', progress: 0.25 + p * 0.25, message: 'Fine search...' });
    });

    // Check for early termination
    if (fineResult.minDistance < interceptThreshold) {
        return { ...fineResult, horizonDays: maxDays };
    }

    // Phase 3: Ultra-fine polish
    const ultraResult = await ultraFinePolish(fineResult, ship, target, options, (p) => {
        onProgress?.({ phase: 'refinement-mode', subPhase: 'ultra', progress: 0.5 + p * 0.15, message: 'Ultra-fine polish...' });
    });

    // Check for early termination
    if (ultraResult.minDistance < interceptThreshold) {
        return { ...ultraResult, horizonDays: maxDays };
    }

    // Phase 3.5: Uber-fine polish (v3.6 - "last mile" exact plotting)
    const uberResult = await uberFinePolish(ultraResult, ship, target, options, (p) => {
        onProgress?.({ phase: 'refinement-mode', subPhase: 'uber', progress: 0.65 + p * 0.15, message: 'Uber-fine polish...' });
    });

    // Check for early termination
    if (uberResult.minDistance < interceptThreshold) {
        return { ...uberResult, horizonDays: maxDays };
    }

    // Phase 4: Gradient descent polish
    const gradientResult = await gradientDescentPolish(uberResult, ship, target, options, (p) => {
        onProgress?.({ phase: 'refinement-mode', subPhase: 'gradient', progress: 0.8 + p * 0.2, message: 'Gradient descent...' });
    });

    return { ...gradientResult, horizonDays: maxDays };
}

// ============================================================================
// MAIN SOLVER
// ============================================================================

/**
 * Solve for optimal course to target.
 *
 * Enhanced v3.6 algorithm with refinement mode support:
 *
 * FULL MODE (default):
 *   1. Multi-horizon search (180-1460 days)
 *   2. For each horizon: coarse → fine → ultra → uber → gradient descent
 *   3. Iterative refinement if result is marginal
 *
 * REFINEMENT MODE (when options.refinementMode = true):
 *   1. Single horizon search with narrow bounds (±20° yaw, ±15° pitch)
 *   2. Refinement sweep → fine → ultra → uber → gradient descent
 *   3. Faster completion (~5-10s vs ~30-45s)
 *
 * @param {Object} ship - Ship object with orbitalElements and sail
 * @param {Object} target - Target object with elements
 * @param {Object} options - Optional parameters:
 *   - refinementMode: boolean - Use narrow search around seedSettings
 *   - seedSettings: { yawDeg, pitchDeg, deployment } - Center for refinement search
 *   - maxDays: number - Horizon for single-horizon search
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
        let result;

        // Check for refinement mode
        if (options.refinementMode && options.seedSettings) {
            // Use refinement mode: narrow search around seed settings
            onProgress?.({ phase: 'starting', progress: 0, message: 'Refinement mode: narrow search...' });
            result = await solveWithRefinementMode(ship, target, options.seedSettings, options, onProgress);
        } else {
            // Use full mode: multi-horizon search
            result = await solveWithRefinement(ship, target, options, onProgress);
        }

        const computeTimeMs = Date.now() - startTimeMs;

        onProgress?.({ phase: 'complete', progress: 1, message: 'Course computation complete' });

        const solution = buildSolution(result, {
            computeTimeMs,
            horizonDays: result.horizonDays
        });

        // Add refinement mode flag to solution
        solution.usedRefinementMode = options.refinementMode || false;

        return solution;
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
    // Use SOI-based intercept threshold from result (set by evaluateCandidate)
    // Fall back to default if not available (backwards compatibility)
    const interceptThreshold = result.interceptThreshold || CONFIG.interceptThresholdFallback;

    // Determine quality rating
    // v3.0: Account for new status types (PHASE_MISS, NO_CROSSING)
    // v3.7: Use SOI-based intercept threshold for accurate intercept classification
    let quality;
    if (result.minDistance < interceptThreshold) {
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
        // Fix #4: Added crossingJulianDate for UI display of solver's computed crossing time
        // v3.7: Added interceptThreshold (SOI-based) for transparent intercept classification
        crossingInfo: {
            crossingIndex: result.crossingIndex ?? -1,
            totalCrossings: result.totalCrossings ?? 0,
            angularSeparationDeg: result.angularSeparationDeg ?? 180,
            crossingDirection: result.crossingDirection ?? 'unknown',
            usedCrossingAware: result.usedCrossingAware ?? false,
            crossingJulianDate: result.crossingJulianDate ?? null,
            interceptThreshold: interceptThreshold  // SOI radius for this target
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

console.log('[COURSE_SOLVER] Module v3.7 loaded - SOI-based intercept threshold (true intercept = enter SOI)');
