/**
 * Trajectory Evaluation - Pure Function Module
 *
 * Contains the core evaluateCandidate() function used by both the course solver
 * and launch window analyzer. Extracted into a standalone module so it can be
 * imported by Web Workers without pulling in browser-dependent modules.
 *
 * All functions in this module are PURE - no state, no side effects, no DOM access.
 */

import { getPosition, getVelocity, J2000 } from './orbital.js';
import { calculateSailThrust, applyThrust } from './orbital-maneuvers.js';
import { INTERSECTION_CONFIG, SOI_RADII, GAME_START_EPOCH } from '../config.js';

// ============================================================================
// CONFIGURATION (subset relevant to trajectory evaluation)
// ============================================================================

const DEG_TO_RAD = Math.PI / 180;

const EVAL_CONFIG = {
    // Default simulation parameters
    defaultMaxDays: 365,
    defaultDeployment: 100,

    // Step calculation (shared with intersection detector)
    stepsPerDay: INTERSECTION_CONFIG.stepsPerDay,
    maxSteps: INTERSECTION_CONFIG.maxSteps,
    minSteps: INTERSECTION_CONFIG.minSteps,

    // Crossing-aware evaluation
    useCrossingAware: true,
    phaseAnglePenaltyThreshold: 0.79,  // ~45 degrees
    phaseAnglePenaltyWeight: 2.0,
    minCrossingGap: 5,

    // Quality thresholds (AU)
    interceptThresholdFallback: 0.01,
    nearMissThreshold: 0.05,
    marginalThreshold: 0.2,
};

// ============================================================================
// GEOMETRY HELPERS
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

    let lastCrossingIndex = -EVAL_CONFIG.minCrossingGap;

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

        if (i - lastCrossingIndex < EVAL_CONFIG.minCrossingGap) {
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
// SOI-BASED INTERCEPT THRESHOLD
// ============================================================================

/**
 * Get the effective intercept threshold for a target body.
 *
 * Returns SOI/2 to match the gameplay definition in navigation.js:getInterceptThresholds().
 */
export function getInterceptThreshold(target) {
    if (!target?.name) {
        return EVAL_CONFIG.interceptThresholdFallback;
    }

    const bodyName = target.name.toUpperCase();
    const soi = SOI_RADII[bodyName];

    if (soi && soi > 0) {
        return soi / 2;
    }

    return EVAL_CONFIG.interceptThresholdFallback;
}

// ============================================================================
// CORE EVALUATION FUNCTION
// ============================================================================

/**
 * Evaluate a single candidate sail configuration (v3.0 - CROSSING-AWARE).
 *
 * This is the hot function called hundreds-to-thousands of times during
 * course solving and launch window scanning. It is PURE and stateless,
 * making it safe for Web Worker execution.
 *
 * @param {number} yawDeg - Sail yaw angle in degrees
 * @param {number} pitchDeg - Sail pitch angle in degrees
 * @param {Object} ship - Ship object with orbitalElements and sail
 * @param {Object} target - Target object with elements and name
 * @param {Object} options - { startJulianDate, maxDays, deployment, steps }
 * @returns {Object} Evaluation result (synchronous)
 */
export function evaluateCandidate(yawDeg, pitchDeg, ship, target, options = {}) {
    const {
        maxDays = EVAL_CONFIG.defaultMaxDays,
        deployment = EVAL_CONFIG.defaultDeployment
    } = options;

    const rawSteps = Math.round(maxDays * EVAL_CONFIG.stepsPerDay);
    const steps = options.steps || Math.min(EVAL_CONFIG.maxSteps, Math.max(EVAL_CONFIG.minSteps, rawSteps));

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

    // startJulianDate should always be provided by callers. Fall back to
    // game start epoch for backward compatibility (tests, console usage).
    const startTime = options.startJulianDate || GAME_START_EPOCH;

    const timeStep = maxDays / steps;

    // For eccentric targets, compute crossing radii at perihelion, semi-major axis, and aphelion.
    const targetA = target.elements.a;
    const targetE = target.elements.e || 0;
    let targetRadii;
    if (targetE > 0.05 && targetE < 0.95) {
        const perihelion = targetA * (1 - targetE);
        const aphelion = targetA * (1 + targetE);
        targetRadii = [perihelion, targetA, aphelion];
    } else {
        targetRadii = [targetA];
    }

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

    // CROSSING-AWARE EVALUATION
    if (EVAL_CONFIG.useCrossingAware && trajectory.length > 1) {
        let allCrossings = [];
        for (const radius of targetRadii) {
            const crossings = findRadiusCrossingsInTrajectory(trajectory, radius);
            allCrossings = allCrossings.concat(crossings);
        }

        let bestCrossing = null;
        let bestDistance = Infinity;
        let bestRawDistance = Infinity;
        let bestAngularSep = Math.PI;
        let bestCrossingIndex = -1;

        for (let ci = 0; ci < allCrossings.length; ci++) {
            const crossing = allCrossings[ci];

            const planetPos = getPosition(target.elements, crossing.time);

            if (!isFinite(planetPos.x)) continue;

            const crossingDistance = distance3D(crossing.position, planetPos);
            let angularSep = calculateAngularSeparation(crossing.position, planetPos);

            if (!isFinite(angularSep)) {
                angularSep = Math.PI;
            }

            // Phase angle penalty (v4.2)
            let effectiveDistance = crossingDistance;
            if (angularSep > EVAL_CONFIG.phaseAnglePenaltyThreshold) {
                const excessAngle = angularSep - EVAL_CONFIG.phaseAnglePenaltyThreshold;
                effectiveDistance = crossingDistance * (1 + EVAL_CONFIG.phaseAnglePenaltyWeight * excessAngle / Math.PI);
            }

            if (effectiveDistance < bestDistance) {
                bestDistance = effectiveDistance;
                bestRawDistance = crossingDistance;
                bestAngularSep = angularSep;
                bestCrossingIndex = ci;
                bestCrossing = crossing;
            }
        }

        if (bestCrossing) {
            const interceptThreshold = getInterceptThreshold(target);

            let status;
            if (bestRawDistance < interceptThreshold) {
                status = 'INTERCEPT';
            } else if (bestRawDistance < EVAL_CONFIG.nearMissThreshold) {
                status = 'NEAR_MISS';
            } else if (bestRawDistance < EVAL_CONFIG.marginalThreshold) {
                status = 'MARGINAL';
            } else {
                status = 'PHASE_MISS';
            }

            return {
                yawDeg,
                pitchDeg,
                minDistance: bestRawDistance,
                timeToClosest: (bestCrossing.time - startTime),
                status,
                crossingIndex: bestCrossingIndex,
                totalCrossings: allCrossings.length,
                angularSeparationDeg: bestAngularSep * (180 / Math.PI),
                crossingDirection: bestCrossing.direction,
                usedCrossingAware: true,
                crossingJulianDate: bestCrossing.time,
                interceptThreshold: getInterceptThreshold(target)
            };
        }

        // Crossings found but all failed planet distance check
        if (allCrossings.length > 0) {
            const bestFailedCrossing = allCrossings.reduce((best, crossing) => {
                const planetPos = getPosition(target.elements, crossing.time);
                if (!isFinite(planetPos.x)) return best;
                const d = distance3D(crossing.position, planetPos);
                return (!best || d < best.distance) ? { ...crossing, distance: d } : best;
            }, null);

            if (bestFailedCrossing) {
                return {
                    yawDeg,
                    pitchDeg,
                    minDistance: bestFailedCrossing.distance,
                    timeToClosest: (bestFailedCrossing.time - startTime),
                    status: 'PHASE_MISS',
                    crossingIndex: 0,
                    totalCrossings: allCrossings.length,
                    angularSeparationDeg: 180,
                    crossingDirection: bestFailedCrossing.direction || 'unknown',
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
    } else if (globalMinDistance < EVAL_CONFIG.nearMissThreshold) {
        status = 'NEAR_MISS';
    } else if (globalMinDistance < EVAL_CONFIG.marginalThreshold) {
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
