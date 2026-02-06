/**
 * Navigation state and destination management
 *
 * Note: The old burn state machine has been removed.
 * Ship movement is now handled by orbital mechanics in shipPhysics.js.
 * This module handles destination selection, distance calculations,
 * and intercept prediction.
 */

import { getBodyByName } from '../data/celestialBodies.js';
import { getJulianDate, setTransitState, clearTransitState, getTransitState, getTrajectoryDuration } from './gameState.js';
import { getPlayerShip } from '../data/ships.js';
import { getPosition, getVelocity, meanMotion, propagateMeanAnomaly } from '../lib/orbital.js';
import { calculateSailThrust, applyThrust } from '../lib/orbital-maneuvers.js';
import { getSOIRadius, getGravitationalParam } from '../lib/soi.js';
import { solveCourse } from '../lib/course-solver.js';
import { SOI_RADII } from '../config.js';

/**
 * Get SOI-based intercept thresholds for a given body.
 * @param {string} bodyName - Name of the target body
 * @returns {Object} Threshold values {intercept, nearMiss, wideMiss}
 */
function getInterceptThresholds(bodyName) {
    const soiRadius = SOI_RADII[bodyName] || 0.02;  // Default 0.02 AU for unknown bodies
    return {
        intercept: soiRadius / 2,  // SOI/2
        nearMiss: soiRadius,       // SOI
        wideMiss: soiRadius * 5    // SOI * 5
    };
}

/**
 * Determine intercept status based on distance and SOI-based thresholds.
 * @param {number} distance - Closest approach distance in AU
 * @param {string} bodyName - Name of the target body
 * @returns {string} Status: 'INTERCEPT', 'NEAR MISS', 'WIDE MISS', or 'NO INTERCEPT'
 */
function getInterceptStatus(distance, bodyName) {
    const thresholds = getInterceptThresholds(bodyName);
    if (distance < thresholds.intercept) {
        return 'INTERCEPT';
    } else if (distance < thresholds.nearMiss) {
        return 'NEAR MISS';
    } else if (distance < thresholds.wideMiss) {
        return 'WIDE MISS';
    } else {
        return 'NO INTERCEPT';
    }
}

// Current destination
export let destination = 'MARS';

// Flight path for visualization (kept for destination indicator)
export let flightPath = [];

/**
 * Set the destination
 * @param {string} destName - Name of destination body
 */
export function setDestination(destName) {
    destination = destName;
}

/**
 * Generate flight path from player to destination
 * Disabled - was showing inaccurate trajectory
 */
export function generateFlightPath() {
    flightPath = [];
}

/**
 * Calculate distance to destination with SOI-aware information.
 *
 * @returns {Object|null} Destination info including SOI data
 */
export function getDestinationInfo() {
    const player = getPlayerShip();
    const dest = getBodyByName(destination);

    if (!player || !dest) return null;

    const dx = dest.x - player.x;
    const dy = dest.y - player.y;
    const dz = dest.z - player.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // SOI information
    const soiRadius = getSOIRadius(dest.name);
    const isDestinationPlanet = soiRadius > 0;
    const distanceToSOI = isDestinationPlanet ? Math.max(0, dist - soiRadius) : null;

    // Check if player is currently in the destination's SOI
    const playerInDestSOI = player.soiState?.isInSOI &&
                            player.soiState.currentBody === dest.name;

    // Calculate relative velocity to destination (for capture planning)
    let relativeVelocity = null;
    let captureReady = false;
    if (dest.elements && player.velocity) {
        const jd = getJulianDate();
        const destVel = getVelocity(dest.elements, jd);

        const dvx = player.velocity.x - destVel.vx;
        const dvy = player.velocity.y - destVel.vy;
        const dvz = player.velocity.z - destVel.vz;

        // Relative velocity in AU/day
        const relVelAUDay = Math.sqrt(dvx * dvx + dvy * dvy + dvz * dvz);
        // Convert to km/s: 1 AU/day = 1731.46 km/s
        relativeVelocity = relVelAUDay * 1731.46;

        // Rough check: for capture, relative velocity should be low
        // Earth escape velocity is ~11 km/s, Mars ~5 km/s
        // If relative velocity is under ~5 km/s, capture is more likely
        captureReady = relativeVelocity < 5;
    }

    return {
        distance: dist,
        soiRadius: soiRadius,
        distanceToSOI: distanceToSOI,
        isDestinationPlanet: isDestinationPlanet,
        playerInDestSOI: playerInDestSOI,
        playerSOI: player.soiState?.currentBody || 'SUN',
        playerInSOI: player.soiState?.isInSOI || false,
        relativeVelocity: relativeVelocity,
        captureReady: captureReady
    };
}

// Cache for intercept prediction (expensive calculation)
let interceptCache = {
    lastUpdate: 0,
    result: null
};
const INTERCEPT_CACHE_DURATION = 500; // ms between recalculations

/**
 * Predict closest approach to destination with current sail settings.
 *
 * Simulates ship trajectory forward in time, accounting for continuous
 * sail thrust, and finds when/where we get closest to the destination.
 *
 * @param {number} maxDays - Maximum days to simulate (default 365)
 * @param {number} steps - Number of simulation steps (default 500, increased for solar sail accuracy)
 * @returns {Object|null} Intercept prediction data
 */
export function predictClosestApproach(maxDays = 365, steps = 500) {
    // Throttle calculation - expensive operation
    const now = Date.now();
    if (interceptCache.result && (now - interceptCache.lastUpdate) < INTERCEPT_CACHE_DURATION) {
        return interceptCache.result;
    }

    const player = getPlayerShip();
    const dest = getBodyByName(destination);

    // Ships use 'orbitalElements', celestial bodies use 'elements'
    if (!player || !dest || !player.orbitalElements || !dest.elements) {
        return null;
    }

    const julianDate = getJulianDate();
    const timeStep = maxDays / steps;

    // Clone player orbital elements for simulation
    let simElements = { ...player.orbitalElements };
    const sail = player.sail;
    const mass = player.mass || 10000;

    let minDistance = Infinity;
    let minDistanceTime = 0;
    let approachingAtMin = false;

    // Track previous distance to determine if approaching or receding
    let prevDistance = Infinity;

    for (let i = 0; i <= steps; i++) {
        const simTime = i * timeStep;
        const simJulianDate = julianDate + simTime;

        // Get simulated ship position
        const shipPos = getPosition(simElements, simJulianDate);

        // Get destination position at this future time
        const destPos = getPosition(dest.elements, simJulianDate);

        // Calculate distance
        const dx = destPos.x - shipPos.x;
        const dy = destPos.y - shipPos.y;
        const dz = destPos.z - shipPos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // Track closest approach
        if (dist < minDistance) {
            minDistance = dist;
            minDistanceTime = simTime;
            approachingAtMin = dist < prevDistance;
        }

        prevDistance = dist;

        // Apply sail thrust for next step (if not last step)
        if (i < steps && sail && sail.deploymentPercent > 0) {
            const velocity = getVelocity(simElements, simJulianDate);
            const distFromSun = Math.sqrt(
                shipPos.x ** 2 + shipPos.y ** 2 + shipPos.z ** 2
            );

            const thrust = calculateSailThrust(
                sail,
                shipPos,
                velocity,
                distFromSun,
                mass
            );

            const thrustMag = Math.sqrt(
                thrust.x ** 2 + thrust.y ** 2 + thrust.z ** 2
            );
            if (thrustMag > 1e-20) {
                simElements = applyThrust(
                    simElements,
                    thrust,
                    timeStep,
                    simJulianDate
                );
            }
        }
    }

    // Determine intercept status using SOI-based thresholds
    const status = getInterceptStatus(minDistance, destination);

    const result = {
        closestDistance: minDistance,
        timeToClosest: minDistanceTime,
        status: status,
        approaching: approachingAtMin
    };

    // Update cache
    interceptCache.result = result;
    interceptCache.lastUpdate = now;

    return result;
}

/**
 * Clear the intercept cache (call when sail settings change significantly)
 */
export function clearInterceptCache() {
    interceptCache.result = null;
    interceptCache.lastUpdate = 0;
}

// ============================================================================
// Navigation Computer - Flight Plan Computation
// ============================================================================

// Cache for navigation plan (expensive calculation)
let navPlanCache = {
    lastUpdate: 0,
    result: null,
    lastDestination: null
};
const NAV_PLAN_CACHE_DURATION = 2000; // ms between recalculations

/**
 * Strategies to test for navigation planning.
 * Each strategy represents a different sail configuration.
 */
const NAV_STRATEGIES = [
    // In-plane strategies (pitch = 0)
    { name: 'RAISE ORBIT', angleDeg: 35, pitchDeg: 0, deployment: 100 },
    { name: 'LOWER ORBIT', angleDeg: -35, pitchDeg: 0, deployment: 100 },
    { name: 'COAST', angleDeg: 0, pitchDeg: 0, deployment: 0 },
    { name: 'RADIAL OUT', angleDeg: 0, pitchDeg: 0, deployment: 100 },
    { name: 'STEEP RAISE', angleDeg: 55, pitchDeg: 0, deployment: 100 },
    { name: 'STEEP LOWER', angleDeg: -55, pitchDeg: 0, deployment: 100 },
    // 3D strategies for inclination changes
    { name: 'INCLINE NORTH', angleDeg: 0, pitchDeg: 45, deployment: 100 },
    { name: 'INCLINE SOUTH', angleDeg: 0, pitchDeg: -45, deployment: 100 },
    { name: 'RAISE + NORTH', angleDeg: 35, pitchDeg: 30, deployment: 100 },
    { name: 'RAISE + SOUTH', angleDeg: 35, pitchDeg: -30, deployment: 100 },
];

/**
 * Simulate trajectory with a specific sail configuration.
 * Similar to predictClosestApproach but with custom sail settings.
 *
 * @param {Object} sailOverride - Sail settings to use {angleDeg, deployment}
 * @param {number} maxDays - Maximum days to simulate
 * @param {number} steps - Number of simulation steps (default 400 for quick nav planning)
 * @returns {Object} Simulation result {closestDistance, timeToClosest, status}
 */
function simulateWithStrategy(sailOverride, maxDays = 365, steps = 400) {
    const player = getPlayerShip();
    const dest = getBodyByName(destination);

    if (!player || !dest || !player.orbitalElements || !dest.elements) {
        return null;
    }

    const julianDate = getJulianDate();
    const timeStep = maxDays / steps;

    // Clone player orbital elements for simulation
    let simElements = { ...player.orbitalElements };

    // Create sail state with overridden settings (including pitch for 3D maneuvers)
    const sail = player.sail ? {
        ...player.sail,
        angle: sailOverride.angleDeg * Math.PI / 180,
        pitchAngle: (sailOverride.pitchDeg || 0) * Math.PI / 180,
        deploymentPercent: sailOverride.deployment
    } : null;

    const mass = player.mass || 10000;

    let minDistance = Infinity;
    let minDistanceTime = 0;

    for (let i = 0; i <= steps; i++) {
        const simTime = i * timeStep;
        const simJulianDate = julianDate + simTime;

        const shipPos = getPosition(simElements, simJulianDate);
        const destPos = getPosition(dest.elements, simJulianDate);

        const dx = destPos.x - shipPos.x;
        const dy = destPos.y - shipPos.y;
        const dz = destPos.z - shipPos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < minDistance) {
            minDistance = dist;
            minDistanceTime = simTime;
        }

        // Apply sail thrust for next step
        if (i < steps && sail && sail.deploymentPercent > 0) {
            const velocity = getVelocity(simElements, simJulianDate);
            const distFromSun = Math.sqrt(
                shipPos.x ** 2 + shipPos.y ** 2 + shipPos.z ** 2
            );

            const thrust = calculateSailThrust(
                sail,
                shipPos,
                velocity,
                distFromSun,
                mass
            );

            const thrustMag = Math.sqrt(
                thrust.x ** 2 + thrust.y ** 2 + thrust.z ** 2
            );
            if (thrustMag > 1e-20) {
                simElements = applyThrust(
                    simElements,
                    thrust,
                    timeStep,
                    simJulianDate
                );
            }
        }
    }

    // Determine status using SOI-based thresholds
    const status = getInterceptStatus(minDistance, destination);

    return {
        closestDistance: minDistance,
        timeToClosest: minDistanceTime,
        status: status
    };
}

/**
 * Calculate the phase angle between ship and destination.
 * Positive means destination is ahead (counterclockwise) of ship.
 *
 * @returns {number} Phase angle in degrees (-180 to 180)
 */
function calculatePhaseAngle() {
    const player = getPlayerShip();
    const dest = getBodyByName(destination);

    if (!player || !dest) return 0;

    const shipAngle = Math.atan2(player.y, player.x);
    const destAngle = Math.atan2(dest.y, dest.x);

    let phase = (destAngle - shipAngle) * 180 / Math.PI;

    // Normalize to -180 to 180
    while (phase > 180) phase -= 360;
    while (phase < -180) phase += 360;

    return phase;
}

/**
 * Compute navigation plan by testing multiple strategies.
 * Finds the best sail configuration to intercept the destination.
 *
 * @returns {Object|null} Navigation plan with recommended settings
 */
export function computeNavigationPlan() {
    // Check cache
    const now = Date.now();
    if (navPlanCache.result &&
        navPlanCache.lastDestination === destination &&
        (now - navPlanCache.lastUpdate) < NAV_PLAN_CACHE_DURATION) {
        return navPlanCache.result;
    }

    const player = getPlayerShip();
    const dest = getBodyByName(destination);

    if (!player || !dest) {
        return null;
    }

    // Calculate phase angle for display
    const phaseAngle = calculatePhaseAngle();

    // Get destination orbital info
    const destA = dest.elements ? dest.elements.a : 1;
    const shipA = player.orbitalElements ? player.orbitalElements.a : 1;

    // Test each strategy
    const results = [];
    const thresholds = getInterceptThresholds(destination);
    for (const strategy of NAV_STRATEGIES) {
        const sim = simulateWithStrategy(strategy);
        if (sim) {
            results.push({
                ...strategy,
                ...sim,
                achievesIntercept: sim.closestDistance < thresholds.intercept
            });
        }
    }

    // Sort: prefer intercepts, then by closest distance, then by time
    results.sort((a, b) => {
        // Intercepts first
        if (a.achievesIntercept && !b.achievesIntercept) return -1;
        if (!a.achievesIntercept && b.achievesIntercept) return 1;

        // Among intercepts, prefer fastest
        if (a.achievesIntercept && b.achievesIntercept) {
            return a.timeToClosest - b.timeToClosest;
        }

        // Among non-intercepts, prefer closest approach
        return a.closestDistance - b.closestDistance;
    });

    const best = results[0];

    if (!best) {
        return null;
    }

    // Get current sail settings for comparison
    const currentAngleDeg = player.sail ?
        Math.round(player.sail.angle * 180 / Math.PI) : 0;
    const currentPitchDeg = player.sail ?
        Math.round((player.sail.pitchAngle || 0) * 180 / Math.PI) : 0;
    const currentDeployment = player.sail ?
        Math.round(player.sail.deploymentPercent) : 0;

    // Calculate deviation from recommended (including pitch for 3D)
    const angleDiff = Math.abs(currentAngleDeg - best.angleDeg);
    const pitchDiff = Math.abs(currentPitchDeg - (best.pitchDeg || 0));
    const deployDiff = Math.abs(currentDeployment - best.deployment);

    let deviationStatus;
    if (angleDiff <= 5 && pitchDiff <= 5 && deployDiff <= 10) {
        deviationStatus = 'OPTIMAL';
    } else if (angleDiff <= 15 && pitchDiff <= 15 && deployDiff <= 25) {
        deviationStatus = 'ACCEPTABLE';
    } else {
        deviationStatus = 'ADJUST SAIL';
    }

    // Calculate progress (based on semi-major axis for raise/lower strategies)
    let progress = 0;
    if (destA !== shipA) {
        const initialA = 0.95; // Approximate starting position
        const targetA = destA;
        const currentA = shipA;

        if (targetA > initialA) {
            // Raising orbit
            progress = Math.min(100, Math.max(0,
                ((currentA - initialA) / (targetA - initialA)) * 100
            ));
        } else {
            // Lowering orbit
            progress = Math.min(100, Math.max(0,
                ((initialA - currentA) / (initialA - targetA)) * 100
            ));
        }
    }

    const result = {
        // Recommended strategy
        strategyName: best.name,
        recommendedAngle: best.angleDeg,
        recommendedPitch: best.pitchDeg || 0,
        recommendedDeployment: best.deployment,

        // Predicted outcome
        willIntercept: best.achievesIntercept,
        closestApproach: best.closestDistance,
        estimatedArrival: best.timeToClosest,
        status: best.status,

        // Current state comparison
        currentAngle: currentAngleDeg,
        currentPitch: currentPitchDeg,
        currentDeployment: currentDeployment,
        deviationStatus: deviationStatus,

        // Navigation info
        phaseAngle: phaseAngle,
        progress: progress,

        // All tested strategies (for debugging/display)
        allStrategies: results
    };

    // Update cache
    navPlanCache.result = result;
    navPlanCache.lastUpdate = now;
    navPlanCache.lastDestination = destination;

    return result;
}

/**
 * Clear the navigation plan cache (call when destination changes)
 */
export function clearNavPlanCache() {
    navPlanCache.result = null;
    navPlanCache.lastUpdate = 0;
}

// ============================================================================
// Approach Phase Planning - Velocity Matching Before SOI Entry
// ============================================================================

/**
 * Compute approach plan - just use the standard nav plan.
 * Keep it simple.
 *
 * @returns {Object|null} Approach plan with recommended settings
 */
export function computeApproachPlan() {
    // Just use the regular navigation plan
    return computeNavigationPlan();
}

// ============================================================================
// Capture Phase Planning - Orbit Circularization Inside SOI
// ============================================================================

/**
 * Determine orbital phase for a ship inside an SOI.
 *
 * Two strategies:
 * 1. For extreme flybys (e > 50) or when extremeFlybyState exists:
 *    Use distance-based detection. The ship moves in a near-straight line,
 *    so track whether distance to parent body is increasing or decreasing.
 * 2. For normal orbits: Propagate mean anomaly from epoch.
 *
 * @param {Object} player - The player ship object (needs orbitalElements + soiState)
 * @returns {Object} { currentM, nearPeriapsis, nearApoapsis, inbound, isExtremeFlyby }
 */
function getOrbitalPhase(player) {
    const { a, e, M0, epoch, μ } = player.orbitalElements;
    const isExtremeFlyby = e > 50 || !!player.extremeFlybyState;

    if (isExtremeFlyby) {
        // Distance-based approach: compute ship-planet distance and its rate of change
        // For extreme flybys, Keplerian mean anomaly is numerically unreliable
        const parent = getBodyByName(player.soiState.currentBody);
        if (!parent) {
            return { currentM: 0, nearPeriapsis: true, nearApoapsis: false, inbound: false, isExtremeFlyby: true };
        }

        // Ship helio position is in player.x/y/z, planet helio position in parent.x/y/z
        const dx = player.x - parent.x;
        const dy = player.y - parent.y;
        const dz = player.z - parent.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // Use velocity dot position to determine if approaching or receding
        // If velocity · position < 0, ship is moving toward planet (inbound)
        // If velocity · position > 0, ship is moving away (outbound)
        let vx, vy, vz;
        if (player.extremeFlybyState) {
            vx = player.extremeFlybyState.entryVel.vx;
            vy = player.extremeFlybyState.entryVel.vy;
            vz = player.extremeFlybyState.entryVel.vz;
        } else {
            const vel = getVelocity(player.orbitalElements, getJulianDate());
            vx = vel.vx;
            vy = vel.vy;
            vz = vel.vz;
        }

        // Radial velocity: dot product of relative position and relative velocity
        const radialVel = dx * vx + dy * vy + dz * vz;
        const inbound = radialVel < 0;

        // For extreme flybys, periapsis is just the closest approach point.
        // Since the trajectory is nearly straight, periapsis occurs when radial velocity ≈ 0
        // (transitioning from inbound to outbound). We'll call it "near periapsis" when
        // |radialVel| is small relative to total velocity.
        const vMag = Math.sqrt(vx * vx + vy * vy + vz * vz);
        const radialFraction = Math.abs(radialVel) / (dist * vMag + 1e-30);
        const nearPeriapsis = radialFraction < 0.3;

        return { currentM: 0, nearPeriapsis, nearApoapsis: false, inbound, isExtremeFlyby: true };
    }

    // Normal orbit: propagate mean anomaly from epoch
    const jd = getJulianDate();
    const deltaTime = jd - epoch;
    const n = meanMotion(Math.abs(a), μ);
    const isHyperbolic = e >= 1.0;

    const currentM = propagateMeanAnomaly(M0, n, deltaTime, isHyperbolic);

    if (isHyperbolic) {
        const nearPeriapsis = Math.abs(currentM) < 0.5;
        const inbound = currentM < 0;
        return { currentM, nearPeriapsis, nearApoapsis: false, inbound, isExtremeFlyby: false };
    } else {
        const normalizedM = ((currentM % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        const nearPeriapsis = normalizedM < Math.PI / 4 || normalizedM > 7 * Math.PI / 4;
        const nearApoapsis = normalizedM > 3 * Math.PI / 4 && normalizedM < 5 * Math.PI / 4;
        const inbound = normalizedM > Math.PI;
        return { currentM: normalizedM, nearPeriapsis, nearApoapsis, inbound, isExtremeFlyby: false };
    }
}

/**
 * Compute capture plan for orbit circularization inside a planetary SOI.
 *
 * When inside a planet's SOI with a hyperbolic or highly elliptical orbit,
 * we need to circularize to achieve stable orbit. Strategy:
 * - At periapsis: fire retrograde thruster to reduce velocity (Oberth effect: burns are
 *   most efficient at periapsis where velocity is highest)
 * - Use sail for continuous braking between burns
 * - Goal: reduce eccentricity toward 0
 *
 * Thruster timing: The Oberth effect means a retrograde burn at periapsis removes
 * more orbital energy than the same burn anywhere else. For hyperbolic arrivals
 * (e >= 1), a periapsis retrograde burn can convert the orbit to elliptical.
 * For elliptical orbits, periapsis retrograde burns lower the apoapsis.
 *
 * @returns {Object|null} Capture plan with recommended settings
 */
export function computeCapturePlan() {
    const player = getPlayerShip();

    if (!player || !player.orbitalElements || !player.soiState?.isInSOI) {
        return null;
    }

    const { a, e } = player.orbitalElements;

    // Get current orbital phase (properly propagated, distance-based for extreme flybys)
    const phase = getOrbitalPhase(player);
    const { nearPeriapsis, nearApoapsis, isExtremeFlyby } = phase;

    let recommendedAngle;
    let recommendedDeployment;
    let strategy;
    let thrusterAction = null;  // { direction, when } - tells autopilot when to auto-fire

    const hasFuel = player.thruster && player.thruster.deltaVRemaining > 0;

    if (e >= 1.0) {
        // HYPERBOLIC - must brake immediately or we'll fly right through.
        // For extreme flybys (e > 50), the ship traverses the SOI in seconds.
        // Don't wait for periapsis - fire retrograde NOW every chance we get.
        // For moderate hyperbolic (1 < e < 50), prefer periapsis for Oberth effect.
        if (isExtremeFlyby) {
            strategy = 'EMERGENCY CAPTURE';
            recommendedAngle = -55;
            recommendedDeployment = 100;
            // Fire immediately and continuously - no time to wait
            if (hasFuel) {
                thrusterAction = { direction: 'retrograde', when: 'NOW' };
            }
        } else if (nearPeriapsis) {
            strategy = 'CAPTURE BURN';
            recommendedAngle = -55;
            recommendedDeployment = 100;
            if (hasFuel) {
                thrusterAction = { direction: 'retrograde', when: 'NOW' };
            }
        } else {
            strategy = 'CAPTURE BURN';
            recommendedAngle = -55;
            recommendedDeployment = 100;
            if (hasFuel) {
                thrusterAction = { direction: 'retrograde', when: 'AT_PERIAPSIS' };
            }
        }
    } else if (e > 0.9) {
        // Highly eccentric - aggressive braking, thruster helps
        strategy = 'EMERGENCY BRAKE';
        recommendedAngle = -55;
        recommendedDeployment = 100;
        if (hasFuel && nearPeriapsis) {
            thrusterAction = { direction: 'retrograde', when: 'NOW' };
        } else if (hasFuel) {
            thrusterAction = { direction: 'retrograde', when: 'AT_PERIAPSIS' };
        }
    } else if (e > 0.5) {
        // Elliptical orbit - circularization
        if (nearPeriapsis) {
            // At periapsis - retrograde to lower apoapsis
            strategy = 'LOWER APOAPSIS';
            recommendedAngle = -35;
            recommendedDeployment = 100;
            if (hasFuel && e > 0.7) {
                thrusterAction = { direction: 'retrograde', when: 'NOW' };
            }
        } else if (nearApoapsis) {
            // At apoapsis - retrograde to lower periapsis (circularize)
            strategy = 'CIRCULARIZE';
            recommendedAngle = -35;
            recommendedDeployment = 100;
        } else {
            strategy = 'BRAKING';
            recommendedAngle = e > 0.7 ? -35 : -25;
            recommendedDeployment = 75;
        }
    } else if (e > 0.1) {
        // Mildly elliptical - fine-tuning
        strategy = 'FINE TUNING';
        recommendedAngle = -15;
        recommendedDeployment = 50;
    } else {
        // Nearly circular - stable orbit achieved!
        strategy = 'STABLE ORBIT';
        recommendedAngle = 0;
        recommendedDeployment = 0;
    }

    // Calculate orbit characteristics
    const periapsis = a * (1 - e);
    const apoapsis = e < 1.0 ? a * (1 + e) : Infinity;
    const parentBody = player.soiState.currentBody;

    const recommendedPitch = 0;

    return {
        strategyName: strategy,
        recommendedAngle: recommendedAngle,
        recommendedPitch: recommendedPitch,
        recommendedDeployment: recommendedDeployment,
        eccentricity: e,
        semiMajorAxis: a,
        periapsis: periapsis,
        apoapsis: apoapsis,
        parentBody: parentBody,
        isStable: e < 0.1,
        nearPeriapsis: nearPeriapsis,
        nearApoapsis: nearApoapsis,
        thrusterAction: thrusterAction,
    };
}

// ============================================================================
// Slingshot Phase Planning - Gravity Assist Flyby
// ============================================================================

/**
 * Compute slingshot plan for gravity assist inside a planetary SOI.
 *
 * When performing a gravity slingshot, we want to:
 * - Maintain or increase velocity through the flyby
 * - Fire prograde thruster at periapsis (Oberth effect maximizes energy gain)
 * - Let gravity bend our trajectory
 * - Exit SOI with higher heliocentric velocity
 *
 * The Oberth effect: A prograde burn at periapsis (closest approach) is
 * much more effective than the same burn elsewhere because kinetic energy
 * gain = F * v * dt, and velocity is highest at periapsis.
 *
 * @returns {Object|null} Slingshot plan with recommended settings
 */
export function computeSlingshotPlan() {
    const player = getPlayerShip();

    if (!player || !player.orbitalElements || !player.soiState?.isInSOI) {
        return null;
    }

    const { a, e } = player.orbitalElements;

    // Get current orbital phase (properly propagated, distance-based for extreme flybys)
    const orbPhase = getOrbitalPhase(player);
    const { nearPeriapsis, inbound, isExtremeFlyby } = orbPhase;
    const outbound = !inbound && !nearPeriapsis;

    let strategy;
    let recommendedAngle;
    let recommendedDeployment;
    let thrusterAction = null;

    const hasFuel = player.thruster && player.thruster.deltaVRemaining > 0;

    if (e >= 1.0) {
        // Already on hyperbolic trajectory (flyby in progress)
        if (isExtremeFlyby) {
            // Extreme flyby: fire prograde NOW for maximum boost
            strategy = nearPeriapsis ? 'PERIAPSIS BOOST' : (inbound ? 'INBOUND BOOST' : 'OUTBOUND BOOST');
            recommendedAngle = 35;
            recommendedDeployment = 100;
            if (hasFuel) {
                thrusterAction = { direction: 'prograde', when: 'NOW' };
            }
        } else if (nearPeriapsis) {
            strategy = 'PERIAPSIS BOOST';
            recommendedAngle = 35;
            recommendedDeployment = 100;
            if (hasFuel) {
                thrusterAction = { direction: 'prograde', when: 'NOW' };
            }
        } else if (inbound) {
            strategy = 'APPROACH PERIAPSIS';
            recommendedAngle = 0;
            recommendedDeployment = 0;
            if (hasFuel) {
                thrusterAction = { direction: 'prograde', when: 'AT_PERIAPSIS' };
            }
        } else {
            strategy = 'EXITING SOI';
            recommendedAngle = 35;
            recommendedDeployment = 100;
        }
    } else {
        // Elliptical orbit during slingshot mode - need to escape
        // This happens if the ship was captured but player wants to slingshot
        if (nearPeriapsis) {
            strategy = 'ESCAPE BOOST';
            recommendedAngle = 45;
            recommendedDeployment = 100;
            if (hasFuel) {
                thrusterAction = { direction: 'prograde', when: 'NOW' };
            }
        } else if (inbound) {
            strategy = 'APPROACH PERIAPSIS';
            recommendedAngle = 35;
            recommendedDeployment = 100;
            if (hasFuel) {
                thrusterAction = { direction: 'prograde', when: 'AT_PERIAPSIS' };
            }
        } else {
            strategy = 'RAISING ORBIT';
            recommendedAngle = 45;
            recommendedDeployment = 100;
        }
    }

    const periapsis = a * (1 - e);
    const parentBody = player.soiState.currentBody;

    return {
        strategyName: strategy,
        recommendedAngle: recommendedAngle,
        recommendedPitch: 0,
        recommendedDeployment: recommendedDeployment,
        eccentricity: e,
        semiMajorAxis: a,
        periapsis: periapsis,
        parentBody: parentBody,
        nearPeriapsis: nearPeriapsis,
        inbound: inbound,
        outbound: outbound,
        isHyperbolic: e >= 1.0,
        thrusterAction: thrusterAction,
    };
}

// ============================================================================
// Escape Phase Planning - Leave SOI
// ============================================================================

/**
 * Compute escape plan to leave current SOI and return to heliocentric space.
 *
 * To escape, we need to raise orbital energy above escape velocity.
 * Strategy: thrust prograde (positive sail angle) to increase velocity.
 *
 * @returns {Object|null} Escape plan with recommended settings
 */
export function computeEscapePlan() {
    const player = getPlayerShip();

    if (!player || !player.orbitalElements || !player.soiState?.isInSOI) {
        return null;
    }

    const { a, e } = player.orbitalElements;

    // To escape: need e >= 1 (hyperbolic)
    // Strategy: always thrust prograde to add energy
    let strategy;
    let recommendedAngle;
    let recommendedDeployment;

    if (e >= 0.9) {
        // Already on escape trajectory
        strategy = 'ESCAPE IMMINENT';
        recommendedAngle = 35;
        recommendedDeployment = 100;
    } else if (e >= 0.5) {
        // Elliptical, working toward escape
        strategy = 'RAISING ORBIT';
        recommendedAngle = 45;
        recommendedDeployment = 100;
    } else {
        // Low orbit - need significant energy addition
        strategy = 'BUILDING ENERGY';
        recommendedAngle = 35;
        recommendedDeployment = 100;
    }

    return {
        strategyName: strategy,
        recommendedAngle: recommendedAngle,
        recommendedPitch: 0,  // Escape is purely energy addition, no inclination change needed
        recommendedDeployment: recommendedDeployment,
        eccentricity: e,
        semiMajorAxis: a,
        parentBody: player.soiState.currentBody,
        escapeReady: e >= 0.9,
    };
}

// ============================================================================
// Optimal Course Computation - Hybrid Coarse-to-Fine Search
// ============================================================================

// Cache for computed course
let optimalCourseCache = {
    result: null,
    destination: null,
    computing: false,
    progress: null
};

/**
 * Get the current course computation state.
 * @returns {Object} { computing, progress, result }
 */
export function getCourseComputationState() {
    return {
        computing: optimalCourseCache.computing,
        progress: optimalCourseCache.progress,
        result: optimalCourseCache.result
    };
}

/**
 * Compute optimal course to current destination.
 *
 * Supports two modes:
 *
 * FULL MODE (default):
 *   Phase 1: Coarse sweep (91 evaluations)
 *   Phase 2: Fine search (405 evaluations)
 *   Phase 3: Ultra-fine polish (49 evaluations)
 *   + Multi-horizon search and iterative refinement
 *
 * REFINEMENT MODE (when isRefinementMode() returns true):
 *   - Narrow search around current sail settings
 *   - Single horizon (uses current trajectory duration)
 *   - Faster completion (~5-10s vs ~30-45s)
 *
 * @param {Function} onProgress - Progress callback ({phase, progress, message})
 * @returns {Promise<Object|null>} Course solution or null
 */
export async function computeOptimalCourse(onProgress = null) {
    // Prevent concurrent computations
    if (optimalCourseCache.computing) {
        console.log('[NAVIGATION] Course computation already in progress');
        return null;
    }

    const player = getPlayerShip();
    const target = getBodyByName(destination);

    if (!player || !target) {
        console.warn('[NAVIGATION] Cannot compute course: missing player or target');
        return null;
    }

    // Mark as computing
    optimalCourseCache.computing = true;
    optimalCourseCache.progress = { phase: 0, progress: 0, message: 'Starting...' };
    optimalCourseCache.destination = destination;

    try {
        // Check for refinement mode
        const useRefinementMode = isRefinementMode();
        const seedSettings = useRefinementMode ? getRefinementSeedSettings() : null;

        // Build solver options
        const solverOptions = {};

        if (useRefinementMode && seedSettings) {
            // Refinement mode: narrow search around current settings
            solverOptions.refinementMode = true;
            solverOptions.seedSettings = seedSettings;
            solverOptions.maxDays = getTrajectoryDuration();  // Use current trajectory slider setting

            console.log(`[NAVIGATION] Using REFINEMENT mode (seed: yaw=${seedSettings.yawDeg.toFixed(1)}°, ` +
                        `pitch=${seedSettings.pitchDeg.toFixed(1)}°, horizon=${solverOptions.maxDays}d)`);
        } else {
            console.log('[NAVIGATION] Using FULL mode (multi-horizon search)');
        }

        const result = await solveCourse(player, target, solverOptions, (progress) => {
            optimalCourseCache.progress = progress;
            onProgress?.(progress);
        });

        // Store result
        optimalCourseCache.result = result;
        optimalCourseCache.computing = false;

        if (result) {
            const modeLabel = result.usedRefinementMode ? 'REFINEMENT' : 'FULL';
            console.log(`[NAVIGATION] Course computed (${modeLabel}): yaw=${result.yawDeg.toFixed(1)}°, ` +
                        `pitch=${result.pitchDeg.toFixed(1)}°, ` +
                        `distance=${result.minDistance.toFixed(4)} AU, ` +
                        `quality=${result.quality}`);
        }

        return result;

    } catch (error) {
        console.error('[NAVIGATION] Course computation failed:', error);
        optimalCourseCache.computing = false;
        optimalCourseCache.result = null;
        return null;
    }
}

/**
 * Get cached optimal course result.
 * @returns {Object|null} Cached course or null
 */
export function getCachedOptimalCourse() {
    // Invalidate if destination changed
    if (optimalCourseCache.destination !== destination) {
        optimalCourseCache.result = null;
    }
    return optimalCourseCache.result;
}

/**
 * Clear the optimal course cache.
 */
export function clearOptimalCourseCache() {
    optimalCourseCache.result = null;
    optimalCourseCache.destination = null;
}

// ============================================================================
// Refinement Mode Detection (Course Refinement Feature)
// ============================================================================

/**
 * Maximum angular difference (degrees) between current and applied sail settings
 * for refinement mode to be active. If player adjusts sails beyond this threshold,
 * we assume they're making a major course change and should use full search.
 */
const REFINEMENT_DRIFT_THRESHOLD = 20;

/**
 * Check if course refinement mode should be used.
 *
 * Refinement mode is active when:
 * 1. A course has been applied (transit state active)
 * 2. Current destination matches the transit destination
 * 3. Current sail settings are within ±20° of the applied course (F1 review finding)
 *
 * When active, re-plotting uses narrower search bounds around current settings.
 *
 * @returns {boolean} True if refinement mode should be used
 */
export function isRefinementMode() {
    const transit = getTransitState();

    // Check if transit is active
    if (!transit.active) {
        return false;
    }

    // Check if destination matches
    if (transit.destination !== destination) {
        return false;
    }

    // Check if current sail settings are close to applied course (F1)
    const player = getPlayerShip();
    if (!player || !player.sail) {
        return false;
    }

    const currentYawDeg = (player.sail.angle || 0) * (180 / Math.PI);
    const currentPitchDeg = (player.sail.pitchAngle || 0) * (180 / Math.PI);

    const yawDiff = Math.abs(currentYawDeg - transit.appliedCourse.yawDeg);
    const pitchDiff = Math.abs(currentPitchDeg - transit.appliedCourse.pitchDeg);

    // If sail settings have drifted too far, use full search
    if (yawDiff > REFINEMENT_DRIFT_THRESHOLD || pitchDiff > REFINEMENT_DRIFT_THRESHOLD) {
        return false;
    }

    return true;
}

/**
 * Get the seed settings for refinement mode.
 * Returns the current sail settings to center the narrow search around.
 *
 * @returns {Object|null} { yawDeg, pitchDeg, deployment } or null if not in refinement mode
 */
export function getRefinementSeedSettings() {
    if (!isRefinementMode()) {
        return null;
    }

    const player = getPlayerShip();
    if (!player || !player.sail) {
        return null;
    }

    return {
        yawDeg: (player.sail.angle || 0) * (180 / Math.PI),
        pitchDeg: (player.sail.pitchAngle || 0) * (180 / Math.PI),
        deployment: player.sail.deploymentPercent || 100
    };
}

/**
 * Apply computed course to ship sail.
 * @param {Object} course - Course solution from computeOptimalCourse
 * @returns {boolean} True if applied successfully
 */
export function applyComputedCourse(course) {
    if (!course) return false;

    const player = getPlayerShip();
    if (!player || !player.sail) return false;

    // Apply sail settings
    player.sail.angle = course.yawDeg * Math.PI / 180;
    player.sail.pitchAngle = course.pitchDeg * Math.PI / 180;
    player.sail.deploymentPercent = course.deployment;

    // Set transit state for course refinement feature
    // This enables re-plotting to use narrower search bounds
    setTransitState(destination, course, getJulianDate());

    console.log(`[NAVIGATION] Applied course: yaw=${course.yawDeg.toFixed(1)}°, ` +
                `pitch=${course.pitchDeg.toFixed(1)}°, deployment=${course.deployment}%`);

    return true;
}
