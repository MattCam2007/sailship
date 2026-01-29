/**
 * Navigation state and destination management
 *
 * Note: The old burn state machine has been removed.
 * Ship movement is now handled by orbital mechanics in shipPhysics.js.
 * This module handles destination selection, distance calculations,
 * and intercept prediction.
 */

import { getBodyByName } from '../data/celestialBodies.js';
import { getJulianDate } from './gameState.js';
import { getPlayerShip } from '../data/ships.js';
import { getPosition, getVelocity } from '../lib/orbital.js';
import { calculateSailThrust, applyThrust } from '../lib/orbital-maneuvers.js';
import { getSOIRadius, getGravitationalParam } from '../lib/soi.js';

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
 * @param {number} steps - Number of simulation steps (default 200)
 * @returns {Object|null} Intercept prediction data
 */
export function predictClosestApproach(maxDays = 365, steps = 200) {
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

    // Determine intercept status
    let status;
    if (minDistance < 0.01) {
        status = 'INTERCEPT';
    } else if (minDistance < 0.05) {
        status = 'NEAR MISS';
    } else if (minDistance < 0.2) {
        status = 'WIDE MISS';
    } else {
        status = 'NO INTERCEPT';
    }

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
 * @param {number} steps - Number of simulation steps
 * @returns {Object} Simulation result {closestDistance, timeToClosest, status}
 */
function simulateWithStrategy(sailOverride, maxDays = 365, steps = 200) {
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

    // Determine status
    let status;
    if (minDistance < 0.01) {
        status = 'INTERCEPT';
    } else if (minDistance < 0.05) {
        status = 'NEAR MISS';
    } else if (minDistance < 0.2) {
        status = 'WIDE MISS';
    } else {
        status = 'NO INTERCEPT';
    }

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
    for (const strategy of NAV_STRATEGIES) {
        const sim = simulateWithStrategy(strategy);
        if (sim) {
            results.push({
                ...strategy,
                ...sim,
                achievesIntercept: sim.closestDistance < 0.01
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
 * Compute capture plan for orbit circularization inside a planetary SOI.
 *
 * When inside a planet's SOI with a hyperbolic or highly elliptical orbit,
 * we need to circularize to achieve stable orbit. Strategy:
 * - At periapsis: thrust prograde to raise apoapsis
 * - At apoapsis: thrust retrograde to lower periapsis
 * - Goal: reduce eccentricity toward 0
 *
 * @returns {Object|null} Capture plan with recommended settings
 */
export function computeCapturePlan() {
    const player = getPlayerShip();

    if (!player || !player.orbitalElements || !player.soiState?.isInSOI) {
        return null;
    }

    const { a, e, M0 } = player.orbitalElements;

    // Determine orbital phase from mean anomaly
    // M0 near 0 or 2π = near periapsis
    // M0 near π = near apoapsis
    const normalizedM = M0 % (2 * Math.PI);
    const nearPeriapsis = normalizedM < Math.PI / 4 || normalizedM > 7 * Math.PI / 4;
    const nearApoapsis = normalizedM > 3 * Math.PI / 4 && normalizedM < 5 * Math.PI / 4;

    let recommendedAngle;
    let recommendedDeployment;
    let strategy;

    if (e > 0.9) {
        // Highly eccentric / nearly hyperbolic - need aggressive braking
        strategy = 'EMERGENCY BRAKE';
        recommendedAngle = -55;  // Strong retrograde
        recommendedDeployment = 100;
    } else if (e > 0.5) {
        // Elliptical orbit - circularization needed
        if (nearPeriapsis) {
            // At periapsis - thrust prograde to raise apoapsis
            strategy = 'RAISE APOAPSIS';
            recommendedAngle = 35;
            recommendedDeployment = 100;
        } else if (nearApoapsis) {
            // At apoapsis - thrust retrograde to lower periapsis
            strategy = 'LOWER PERIAPSIS';
            recommendedAngle = -35;
            recommendedDeployment = 100;
        } else {
            // Between - coast or gentle adjustment
            strategy = 'CIRCULARIZING';
            recommendedAngle = e > 0.7 ? -25 : 0;
            recommendedDeployment = 75;
        }
    } else if (e > 0.1) {
        // Mildly elliptical - fine-tuning
        strategy = 'FINE TUNING';
        recommendedAngle = nearPeriapsis ? 15 : -15;
        recommendedDeployment = 50;
    } else {
        // Nearly circular - stable orbit achieved!
        strategy = 'STABLE ORBIT';
        recommendedAngle = 0;
        recommendedDeployment = 0;  // Coast
    }

    // Calculate orbit characteristics
    const periapsis = a * (1 - e);
    const apoapsis = a * (1 + e);
    const parentBody = player.soiState.currentBody;

    // For capture, pitch is typically 0 (circularization is in-plane)
    // but could be non-zero if we need to match destination inclination
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
