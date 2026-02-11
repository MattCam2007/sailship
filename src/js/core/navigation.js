/**
 * Navigation state and destination management
 *
 * Note: The old burn state machine has been removed.
 * Ship movement is now handled by orbital mechanics in shipPhysics.js.
 * This module handles destination selection, distance calculations,
 * and intercept prediction.
 */

import { getBodyByName } from '../data/celestialBodies.js';
import { getJulianDate, setTransitState, getTransitState, getTrajectoryDuration } from './gameState.js';
import { getPlayerShip } from '../data/ships.js';
import { getPosition, getVelocity, meanMotion, propagateMeanAnomaly } from '../lib/orbital.js';
import { calculateSailThrust, applyThrust } from '../lib/orbital-maneuvers.js';
import { getSOIRadius } from '../lib/soi.js';
import { evaluateCandidate } from '../lib/evaluate-trajectory.js';
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

// Course Plotter and Launch Windows features have been removed.
// The evaluateCandidate function from evaluate-trajectory.js is still available
// for trajectory prediction and autopilot features.
