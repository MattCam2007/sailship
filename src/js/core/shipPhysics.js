/**
 * Ship Physics Module
 *
 * Handles per-frame physics updates for ships using orbital mechanics.
 * The player ship's position is derived from orbital elements, and
 * solar sail thrust continuously modifies those elements.
 *
 * Supports Sphere of Influence (SOI) mechanics:
 * - Ships can transition between heliocentric and planetocentric reference frames
 * - Orbital elements are converted when crossing SOI boundaries
 * - Physics updates use the appropriate gravitational parameter
 */

import { getPosition, getVelocity, MU_SUN, getPeriapsis } from '../lib/orbital.js';
import { calculateSailThrust, applyThrust } from '../lib/orbital-maneuvers.js';
import { getJulianDate, isPlanningMode, getActiveJulianDate } from './gameState.js';
import { celestialBodies, getBodyByName } from '../data/celestialBodies.js';
import {
    checkSOIEntry,
    checkSOIExit,
    helioToPlanetocentric,
    planetocentricToHelio,
    stateToElements,
    getGravitationalParam,
    getSOIRadius
} from '../lib/soi.js';
import { PHYSICS_CONFIG, BODY_DISPLAY } from '../config.js';

// ============================================================================
// Visual Orbital Elements (for smooth orbit visualization)
// ============================================================================

/**
 * Lerp (linear interpolate) between two values.
 */
function lerp(a, b, t) {
    return a + (b - a) * t;
}

/**
 * Lerp between two angles, handling wraparound at 2π.
 * Always takes the shortest path around the circle.
 */
function lerpAngle(a, b, t) {
    // Normalize both angles to [0, 2π)
    const TWO_PI = 2 * Math.PI;
    a = ((a % TWO_PI) + TWO_PI) % TWO_PI;
    b = ((b % TWO_PI) + TWO_PI) % TWO_PI;

    // Find the shortest angular distance
    let diff = b - a;
    if (diff > Math.PI) {
        diff -= TWO_PI;
    } else if (diff < -Math.PI) {
        diff += TWO_PI;
    }

    // Lerp and normalize result
    let result = a + diff * t;
    return ((result % TWO_PI) + TWO_PI) % TWO_PI;
}

/**
 * Initialize visual orbital elements for a ship.
 * Called once when the ship first needs visual elements.
 */
function initVisualOrbitalElements(ship) {
    if (!ship.orbitalElements) return;

    ship.visualOrbitalElements = { ...ship.orbitalElements };
}

// Debug: track last frame's ship position to detect jumps
let lastShipPos = null;
let lastShipVel = null;
let visualDebugEnabled = false;
let frameNumber = 0;

// Comprehensive debug mode for hyperbolic orbit issues
let hyperbolicDebugEnabled = false;
let lastOrbitType = null;

/**
 * Enable/disable visual debug logging.
 * Call from console: window.setVisualDebug(true)
 */
export function setVisualDebug(enabled) {
    visualDebugEnabled = enabled;
    lastShipPos = null;
    lastShipVel = null;
    frameNumber = 0;
    console.log(`[VISUAL_DEBUG] ${enabled ? 'ENABLED' : 'DISABLED'}`);
}

/**
 * Enable comprehensive debug logging for hyperbolic orbit issues.
 * Call from console: window.setHyperbolicDebug(true)
 */
export function setHyperbolicDebug(enabled) {
    hyperbolicDebugEnabled = enabled;
    lastOrbitType = null;
    console.log(`[HYPERBOLIC_DEBUG] ${enabled ? 'ENABLED - will log every frame' : 'DISABLED'}`);
    if (enabled) {
        console.log(`[HYPERBOLIC_DEBUG] Tracking: position, velocity, orbital elements, orbit type changes`);
    }
}

if (typeof window !== 'undefined') {
    window.setVisualDebug = setVisualDebug;
    window.setHyperbolicDebug = setHyperbolicDebug;
}

/**
 * Update visual orbital elements to smoothly follow actual elements.
 * This prevents the orbit visualization from jumping when elements change rapidly.
 */
function updateVisualOrbitalElements(ship) {
    if (!ship.orbitalElements) return;

    // Initialize if needed
    if (!ship.visualOrbitalElements) {
        initVisualOrbitalElements(ship);
        return;
    }

    const actual = ship.orbitalElements;
    const visual = ship.visualOrbitalElements;
    const t = PHYSICS_CONFIG.visualElementLerpRate;

    // Check for orbit type change (elliptic <-> hyperbolic)
    const actualHyperbolic = actual.e >= 1;
    const visualHyperbolic = visual.e >= 1;
    const orbitTypeChanged = actualHyperbolic !== visualHyperbolic;

    // Check for very large changes - if the orbit has changed dramatically,
    // snap the visual elements closer to prevent excessive lag
    const aDiff = Math.abs(actual.a - visual.a) / Math.abs(actual.a);
    const eDiff = Math.abs(actual.e - visual.e);
    const ωDiff = Math.abs(actual.ω - visual.ω);

    // Debug logging for visual element lag
    if (visualDebugEnabled && ship.isPlayer) {
        frameNumber++;

        // Log position delta from last frame
        if (lastShipPos) {
            const dx = ship.x - lastShipPos.x;
            const dy = ship.y - lastShipPos.y;
            const dz = ship.z - lastShipPos.z;
            const posDelta = Math.sqrt(dx*dx + dy*dy + dz*dz);

            // Check if movement direction matches velocity direction
            const velMag = Math.sqrt(ship.velocity.x**2 + ship.velocity.y**2 + ship.velocity.z**2);
            let movementDot = 0;
            if (velMag > 1e-10 && posDelta > 1e-10) {
                movementDot = (dx * ship.velocity.x + dy * ship.velocity.y + dz * ship.velocity.z) / (posDelta * velMag);
            }

            // Log if movement is opposite to velocity (backwards!)
            if (movementDot < 0 && posDelta > 1e-8) {
                console.warn(`[VISUAL_DEBUG] Frame ${frameNumber}: 🔴 BACKWARDS MOVEMENT! dot=${movementDot.toFixed(3)}`);
                console.warn(`[VISUAL_DEBUG]   Position delta: (${dx.toExponential(3)}, ${dy.toExponential(3)}, ${dz.toExponential(3)})`);
                console.warn(`[VISUAL_DEBUG]   Velocity: (${ship.velocity.x.toExponential(3)}, ${ship.velocity.y.toExponential(3)}, ${ship.velocity.z.toExponential(3)})`);
            }

            // Log visual vs actual element differences
            if (frameNumber % 30 === 0) {  // Every 30 frames (~0.5 sec)
                console.log(`[VISUAL_DEBUG] Frame ${frameNumber}: visual vs actual elements:`);
                console.log(`[VISUAL_DEBUG]   a: ${visual.a.toFixed(4)} vs ${actual.a.toFixed(4)} (diff: ${(aDiff*100).toFixed(1)}%)`);
                console.log(`[VISUAL_DEBUG]   e: ${visual.e.toFixed(4)} vs ${actual.e.toFixed(4)} (diff: ${eDiff.toFixed(4)})`);
                console.log(`[VISUAL_DEBUG]   ω: ${(visual.ω*180/Math.PI).toFixed(1)}° vs ${(actual.ω*180/Math.PI).toFixed(1)}° (diff: ${(ωDiff*180/Math.PI).toFixed(1)}°)`);
                console.log(`[VISUAL_DEBUG]   Ship pos: (${ship.x.toFixed(4)}, ${ship.y.toFixed(4)}, ${ship.z.toFixed(4)})`);
                console.log(`[VISUAL_DEBUG]   Movement dot: ${movementDot.toFixed(3)} (1=forward, -1=backward)`);
            }
        }

        lastShipPos = { x: ship.x, y: ship.y, z: ship.z };
        lastShipVel = { ...ship.velocity };
    }

    // If orbit type changed (elliptic <-> hyperbolic), snap immediately
    // This prevents the renderer from trying to draw an ellipse for a hyperbolic orbit
    if (orbitTypeChanged) {
        if (hyperbolicDebugEnabled) {
            console.warn(`[VISUAL] Orbit type change: ${visualHyperbolic ? 'HYPER' : 'ELLIP'} → ${actualHyperbolic ? 'HYPER' : 'ELLIP'}, snapping visual elements`);
        }
        visual.a = actual.a;
        visual.e = actual.e;
        visual.i = actual.i;
        visual.Ω = actual.Ω;
        visual.ω = actual.ω;
        visual.M0 = actual.M0;
    }
    // If semi-major axis changed by more than 20% or eccentricity by more than 0.3,
    // snap visual elements to 50% of the way to actual values
    else if (aDiff > 0.2 || eDiff > 0.3) {
        visual.a = lerp(visual.a, actual.a, 0.5);
        visual.e = lerp(visual.e, actual.e, 0.5);
        visual.i = lerp(visual.i, actual.i, 0.5);
        visual.Ω = lerpAngle(visual.Ω, actual.Ω, 0.5);
        visual.ω = lerpAngle(visual.ω, actual.ω, 0.5);
        visual.M0 = lerpAngle(visual.M0, actual.M0, 0.5);
    } else {
        // Normal smooth lerping
        visual.a = lerp(visual.a, actual.a, t);
        visual.e = lerp(visual.e, actual.e, t);
        visual.i = lerp(visual.i, actual.i, t);
        visual.Ω = lerpAngle(visual.Ω, actual.Ω, t);
        visual.ω = lerpAngle(visual.ω, actual.ω, t);
        visual.M0 = lerpAngle(visual.M0, actual.M0, t);
    }

    // Copy non-interpolated values
    visual.epoch = actual.epoch;
    visual.μ = actual.μ;
}

// ============================================================================
// Ship Physics Update
// ============================================================================

/**
 * Main ship physics update - called every frame.
 *
 * This function:
 * 1. Gets current position from orbital elements
 * 2. Checks for SOI transitions (entry/exit) including trajectory crossing
 * 3. Calculates solar sail thrust based on sail state and sun distance
 * 4. Applies thrust to modify orbital elements using Gauss's equations
 * 5. Caches position/velocity for rendering
 *
 * @param {Object} ship - Ship state object (mutated)
 * @param {number} deltaTime - Time step in days
 */
export function updateShipPhysics(ship, deltaTime) {
    // Skip if ship doesn't have orbital elements (NPC ships)
    if (!ship.orbitalElements) {
        return;
    }

    // If time is paused, only update visual elements (let them catch up)
    if (deltaTime <= 0) {
        updateVisualOrbitalElements(ship);
        return;
    }

    // Use ephemeris date in planning mode, simulation date in live mode
    // This allows ship visualization to "slide" to planning date while
    // simulation state remains frozen at the moment planning mode was entered
    const julianDate = getActiveJulianDate();

    // Initialize SOI state if needed
    if (!ship.soiState) {
        ship.soiState = { currentBody: 'SUN', isInSOI: false };
    }

    // Get current position and velocity from orbital elements
    // For extreme eccentricity (e > 50), use linear interpolation for stability
    let position, velocity;
    const e = ship.orbitalElements?.e || 0;
    if (ship.extremeFlybyState && e > PHYSICS_CONFIG.extremeEccentricityThreshold && ship.soiState?.isInSOI) {
        const flyby = ship.extremeFlybyState;
        const dt = julianDate - flyby.entryTime;
        position = {
            x: flyby.entryPos.x + flyby.entryVel.vx * dt,
            y: flyby.entryPos.y + flyby.entryVel.vy * dt,
            z: flyby.entryPos.z + flyby.entryVel.vz * dt
        };
        velocity = flyby.entryVel;
    } else {
        position = getPosition(ship.orbitalElements, julianDate);
        velocity = getVelocity(ship.orbitalElements, julianDate);
    }

    // Handle SOI transitions
    if (ship.soiState.isInSOI) {
        // Currently in a planetary SOI - check for exit
        if (checkSOIExit(position, ship.soiState.currentBody)) {
            const exited = handleSOIExit(ship, position, velocity, julianDate);
            if (exited) {
                const newPos = getPosition(ship.orbitalElements, julianDate);
                const newVel = getVelocity(ship.orbitalElements, julianDate);
                updateCachedState(ship, newPos, newVel);
                // Snap visual elements to new orbit on SOI transition
                initVisualOrbitalElements(ship);
                return;
            }
            // If exit blocked by cooldown, continue with current SOI physics
        }
    } else {
        // In heliocentric space - check for SOI entry
        // Use trajectory check to catch fast-moving ships
        const planets = celestialBodies.filter(b => b.type === 'planet');
        const soiCheck = checkSOIEntryTrajectory(position, velocity, planets, deltaTime);
        if (soiCheck) {
            const entered = handleSOIEntry(ship, soiCheck.entryPos, soiCheck.entryVel, soiCheck.body, julianDate);
            if (entered) {
                const newPos = getPosition(ship.orbitalElements, julianDate);
                const newVel = getVelocity(ship.orbitalElements, julianDate);
                updateCachedStateInSOI(ship, newPos, newVel);
                // Snap visual elements to new orbit on SOI transition
                initVisualOrbitalElements(ship);
                return;
            }
            // If entry blocked by cooldown, skip physics this frame to avoid wrong trajectory
            // The ship will just continue at its current position until cooldown expires
            updateCachedState(ship, position, velocity);
            updateVisualOrbitalElements(ship);
            return;
        }
    }

    // Check for collision if in SOI
    if (ship.soiState.isInSOI) {
        const collisionPrevented = checkAndPreventCollision(ship, ship.soiState.currentBody, julianDate);
        if (collisionPrevented) {
            // Orbit was modified, update position/velocity
            const newPos = getPosition(ship.orbitalElements, julianDate);
            const newVel = getVelocity(ship.orbitalElements, julianDate);
            updateCachedStateInSOI(ship, newPos, newVel);
            initVisualOrbitalElements(ship);
            return;
        }
    }

    // Calculate absolute position (relative to Sun) for sail thrust
    let absolutePosition = position;
    if (ship.soiState.isInSOI) {
        const parent = getBodyByName(ship.soiState.currentBody);
        if (parent) {
            absolutePosition = {
                x: position.x + parent.x,
                y: position.y + parent.y,
                z: position.z + parent.z
            };
        }
    }

    const distanceFromSun = Math.sqrt(
        absolutePosition.x ** 2 +
        absolutePosition.y ** 2 +
        absolutePosition.z ** 2
    );

    // Calculate sail thrust (if sail exists and is deployed)
    let thrust = { x: 0, y: 0, z: 0 };

    if (ship.sail && ship.sail.deploymentPercent > 0) {
        thrust = calculateSailThrust(
            ship.sail,
            absolutePosition,
            velocity,
            distanceFromSun,
            ship.mass || 10000
        );
    }

    // Apply thrust to modify orbital elements
    const thrustMag = Math.sqrt(thrust.x ** 2 + thrust.y ** 2 + thrust.z ** 2);
    if (thrustMag > 1e-20) {
        ship.orbitalElements = applyThrust(
            ship.orbitalElements,
            thrust,
            deltaTime,
            julianDate
        );
    }

    // Update cached position/velocity for rendering
    let newPosition, newVelocity;

    // For extreme eccentricity cases (e > 50), use linear interpolation instead of
    // orbital mechanics to avoid numerical instability
    // (Note: `e` was already computed earlier in this function)
    if (ship.extremeFlybyState && e > PHYSICS_CONFIG.extremeEccentricityThreshold && ship.soiState?.isInSOI) {
        // Use stored entry state with linear extrapolation
        const flyby = ship.extremeFlybyState;
        const dt = julianDate - flyby.entryTime;

        newPosition = {
            x: flyby.entryPos.x + flyby.entryVel.vx * dt,
            y: flyby.entryPos.y + flyby.entryVel.vy * dt,
            z: flyby.entryPos.z + flyby.entryVel.vz * dt
        };
        newVelocity = { ...flyby.entryVel };
    } else {
        // Normal orbital mechanics calculation
        newPosition = getPosition(ship.orbitalElements, julianDate);
        newVelocity = getVelocity(ship.orbitalElements, julianDate);
    }

    if (ship.soiState.isInSOI) {
        updateCachedStateInSOI(ship, newPosition, newVelocity);
    } else {
        updateCachedState(ship, newPosition, newVelocity);
    }

    // Periodic debug logging (requires toggle)
    if (debugLoggingEnabled && ship.isPlayer) {
        periodicDebugLog(ship, newPosition, newVelocity, thrust, julianDate);
    }

    // Always-on anomaly detection for player ship
    if (ship.isPlayer) {
        checkForAnomalies(ship, newPosition, newVelocity, thrust, julianDate);
    }

    // Comprehensive hyperbolic orbit debugging
    if (hyperbolicDebugEnabled && ship.isPlayer) {
        logHyperbolicDebug(ship, newPosition, newVelocity, thrust, julianDate);
    }

    // Update visual orbital elements for smooth orbit visualization
    updateVisualOrbitalElements(ship);
}

/**
 * Check if ship trajectory crossed through any SOI during the time step.
 * This catches fast-moving ships that might skip over an SOI in a single frame.
 *
 * Uses line-sphere intersection to find if the trajectory passed through the SOI.
 *
 * @param {Object} position - Ship position at start of timestep
 * @param {Object} velocity - Ship velocity {vx, vy, vz} in AU/day
 * @param {Array} planets - Array of planet objects
 * @param {number} deltaTime - Time step in days
 * @returns {Object|null} Entry info if crossing detected
 */
function checkSOIEntryTrajectory(position, velocity, planets, deltaTime) {
    // Calculate end position (approximate linear trajectory)
    const endPos = {
        x: position.x + velocity.vx * deltaTime,
        y: position.y + velocity.vy * deltaTime,
        z: position.z + velocity.vz * deltaTime
    };

    for (const planet of planets) {
        const soiRadius = getSOIRadius(planet.name);
        if (soiRadius <= 0) continue;

        // Check if we're currently inside (standard check)
        const dx = position.x - planet.x;
        const dy = position.y - planet.y;
        const dz = position.z - planet.z;
        const currentDist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (currentDist < soiRadius) {
            return {
                body: planet.name,
                entryPos: position,
                entryVel: velocity,
                distance: currentDist
            };
        }

        // Line-sphere intersection test for trajectory crossing
        // Line from position to endPos, sphere at planet with radius soiRadius
        const lineDir = {
            x: endPos.x - position.x,
            y: endPos.y - position.y,
            z: endPos.z - position.z
        };
        const lineLen = Math.sqrt(lineDir.x ** 2 + lineDir.y ** 2 + lineDir.z ** 2);
        if (lineLen < 1e-10) continue;

        // Normalize direction
        const dir = {
            x: lineDir.x / lineLen,
            y: lineDir.y / lineLen,
            z: lineDir.z / lineLen
        };

        // Vector from line start to sphere center
        const toCenter = {
            x: planet.x - position.x,
            y: planet.y - position.y,
            z: planet.z - position.z
        };

        // Project toCenter onto line direction
        const proj = toCenter.x * dir.x + toCenter.y * dir.y + toCenter.z * dir.z;

        // Closest point on line to sphere center
        const closestOnLine = {
            x: position.x + dir.x * Math.max(0, Math.min(lineLen, proj)),
            y: position.y + dir.y * Math.max(0, Math.min(lineLen, proj)),
            z: position.z + dir.z * Math.max(0, Math.min(lineLen, proj))
        };

        // Distance from closest point to sphere center
        const distToCenter = Math.sqrt(
            (closestOnLine.x - planet.x) ** 2 +
            (closestOnLine.y - planet.y) ** 2 +
            (closestOnLine.z - planet.z) ** 2
        );

        if (distToCenter < soiRadius) {
            // Trajectory crosses SOI! Find entry point
            // Use the closest approach point as the entry position
            const entryFraction = Math.max(0, Math.min(1, proj / lineLen));
            const entryPos = {
                x: position.x + lineDir.x * entryFraction,
                y: position.y + lineDir.y * entryFraction,
                z: position.z + lineDir.z * entryFraction
            };

            console.log(`SOI trajectory crossing detected: ${planet.name}, closest approach: ${distToCenter.toFixed(6)} AU`);

            return {
                body: planet.name,
                entryPos: entryPos,
                entryVel: velocity,
                distance: distToCenter
            };
        }
    }

    return null;
}

// Cooldown to prevent rapid SOI cycling (in Julian days)
let lastSOITransitionTime = 0;
let lastSOITransitionBody = null;  // Track which body had the last transition

// Throttle flyby messages
let lastFlybyLogTime = 0;
let lastFlybyBody = null;
const FLYBY_LOG_COOLDOWN = 1.0; // Only log once per day of game time

// ============================================================================
// Collision Detection
// ============================================================================

/**
 * Check if ship's periapsis is below planet's surface.
 * If collision detected, auto-circularize at safe altitude.
 *
 * @param {Object} ship - Ship object with orbital elements
 * @param {string} planetName - Name of planet in SOI
 * @param {number} julianDate - Current Julian date
 * @returns {boolean} True if collision was prevented
 */
function checkAndPreventCollision(ship, planetName, julianDate) {
    if (!ship.orbitalElements) return false;

    // Get planet data
    const bodyDisplay = BODY_DISPLAY[planetName];
    if (!bodyDisplay || !bodyDisplay.physicalRadiusKm) {
        return false; // No radius data for this body
    }

    // Calculate periapsis
    const periapsisAU = getPeriapsis(ship.orbitalElements);
    const periapsisKm = periapsisAU * 149597870.7;

    // Safe altitude = planet radius × safety factor
    const safeAltitudeKm = bodyDisplay.physicalRadiusKm * PHYSICS_CONFIG.minPeriapsisMultiplier;

    // Check for collision
    if (periapsisKm < safeAltitudeKm) {
        console.warn(`\n⚠️ COLLISION PREVENTED: ${planetName}`);
        console.warn(`   Periapsis: ${periapsisKm.toFixed(0)} km (${(periapsisKm - bodyDisplay.physicalRadiusKm).toFixed(0)} km altitude)`);
        console.warn(`   Safe altitude: ${(safeAltitudeKm - bodyDisplay.physicalRadiusKm).toFixed(0)} km`);
        console.warn(`   Auto-circularizing at safe altitude...`);

        // Circularize at safe altitude
        const safeRadiusAU = safeAltitudeKm / 149597870.7;
        const mu = ship.orbitalElements.μ;

        // For circular orbit: e = 0, a = r
        ship.orbitalElements.a = safeRadiusAU;
        ship.orbitalElements.e = 0;
        ship.orbitalElements.M0 = 0; // Reset mean anomaly

        // Preserve orientation (i, Ω, ω unchanged)

        console.warn(`   New orbit: circular at ${safeRadiusAU.toFixed(6)} AU (${safeAltitudeKm.toFixed(0)} km)`);
        console.warn(`   Ship is now in stable orbit around ${planetName}\n`);

        return true;
    }

    return false;
}

/**
 * Handle transition from heliocentric to planetocentric reference frame.
 *
 * @param {Object} ship - Ship object
 * @param {Object} shipPosHelio - Ship position in heliocentric frame
 * @param {Object} shipVelHelio - Ship velocity in heliocentric frame
 * @param {string} planetName - Name of planet being entered
 * @param {number} julianDate - Current Julian date
 * @returns {boolean} True if entry was handled, false if blocked by cooldown
 */
function handleSOIEntry(ship, shipPosHelio, shipVelHelio, planetName, julianDate) {
    // Check cooldown to prevent rapid cycling - only applies to the SAME body
    if (lastSOITransitionBody === planetName &&
        julianDate - lastSOITransitionTime < PHYSICS_CONFIG.soiTransitionCooldown) {
        return false;
    }

    const planet = getBodyByName(planetName);
    if (!planet || !planet.elements) {
        console.warn(`SOI Entry: Planet ${planetName} not found or has no elements`);
        return false;
    }

    // Get planet's heliocentric position and velocity
    const planetPosHelio = getPosition(planet.elements, julianDate);
    const planetVelHelio = getVelocity(planet.elements, julianDate);

    // DEBUG: Log heliocentric states
    const shipVelMag = Math.sqrt(shipVelHelio.vx**2 + shipVelHelio.vy**2 + shipVelHelio.vz**2) * 1731.46;
    const planetVelMag = Math.sqrt(planetVelHelio.vx**2 + planetVelHelio.vy**2 + planetVelHelio.vz**2) * 1731.46;
    console.log(`\n========== SOI ENTRY: ${planetName} ==========`);
    console.log(`[SOI ENTRY] Ship helio pos: (${shipPosHelio.x.toFixed(6)}, ${shipPosHelio.y.toFixed(6)}, ${shipPosHelio.z.toFixed(6)}) AU`);
    console.log(`[SOI ENTRY] Ship helio vel: (${shipVelHelio.vx.toFixed(6)}, ${shipVelHelio.vy.toFixed(6)}, ${shipVelHelio.vz.toFixed(6)}) AU/day = ${shipVelMag.toFixed(2)} km/s`);
    console.log(`[SOI ENTRY] Planet helio pos: (${planetPosHelio.x.toFixed(6)}, ${planetPosHelio.y.toFixed(6)}, ${planetPosHelio.z.toFixed(6)}) AU`);
    console.log(`[SOI ENTRY] Planet helio vel: (${planetVelHelio.vx.toFixed(6)}, ${planetVelHelio.vy.toFixed(6)}, ${planetVelHelio.vz.toFixed(6)}) AU/day = ${planetVelMag.toFixed(2)} km/s`);

    // Convert ship state to planetocentric frame
    const { pos, vel } = helioToPlanetocentric(
        shipPosHelio,
        { vx: shipVelHelio.vx, vy: shipVelHelio.vy, vz: shipVelHelio.vz },
        planetPosHelio,
        planetVelHelio
    );

    // DEBUG: Log planetocentric state
    const relVelMag = Math.sqrt(vel.vx**2 + vel.vy**2 + vel.vz**2) * 1731.46;
    const relPosMag = Math.sqrt(pos.x**2 + pos.y**2 + pos.z**2);
    console.log(`[SOI ENTRY] Relative pos: (${pos.x.toFixed(6)}, ${pos.y.toFixed(6)}, ${pos.z.toFixed(6)}) AU, dist=${relPosMag.toFixed(6)} AU`);
    console.log(`[SOI ENTRY] Relative vel: (${vel.vx.toFixed(6)}, ${vel.vy.toFixed(6)}, ${vel.vz.toFixed(6)}) AU/day = ${relVelMag.toFixed(2)} km/s`);

    // Get gravitational parameter and SOI radius
    const mu = getGravitationalParam(planetName);
    const soiRadius = getSOIRadius(planetName);

    // Calculate orbital energy: E = v²/2 - μ/r
    const r = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
    const v2 = vel.vx * vel.vx + vel.vy * vel.vy + vel.vz * vel.vz;
    const orbitalEnergy = v2 / 2 - mu / r;

    // Convert planetocentric state to orbital elements
    const newElements = stateToElements(pos, vel, mu, julianDate);

    // Determine trajectory type based on orbital energy
    // E < 0: bound (elliptical), E >= 0: unbound (hyperbolic/parabolic)
    if (orbitalEnergy >= 0 || newElements.e >= 1.0) {
        const relVelKmS = Math.sqrt(v2) * 1731.46;
        console.log(`[SOI ENTRY] HYPERBOLIC TRAJECTORY: ${planetName} - e=${newElements.e.toFixed(3)}, velocity ${relVelKmS.toFixed(1)} km/s (exceeds escape velocity)`);
        console.log(`[SOI ENTRY] Ship will perform flyby and exit SOI unless velocity is reduced`);

        // Warn about extreme eccentricity - these are essentially straight-line flybys
        if (newElements.e > PHYSICS_CONFIG.extremeEccentricityThreshold) {
            console.warn(`[SOI ENTRY] ⚠️ EXTREME ECCENTRICITY: e=${newElements.e.toFixed(1)} - treating as straight-line flyby`);
            console.warn(`[SOI ENTRY] This typically happens with enlarged SOI radii and high approach velocity`);
            // Store the original state vector for more stable position tracking
            ship.extremeFlybyState = {
                entryPos: { ...pos },
                entryVel: { ...vel },
                entryTime: julianDate
            };
        }
    }

    ship.orbitalElements = newElements;

    // Update SOI state
    ship.soiState = {
        currentBody: planetName,
        isInSOI: true
    };

    // Set cooldown for this specific body
    lastSOITransitionTime = julianDate;
    lastSOITransitionBody = planetName;

    // Log with orbit type info
    const orbitType = ship.orbitalElements.e >= 1.0 ? 'HYPERBOLIC (will exit SOI)' :
                      ship.orbitalElements.e > 0.9 ? 'HIGHLY ELLIPTICAL' :
                      ship.orbitalElements.e > 0.5 ? 'ELLIPTICAL' : 'NEAR-CIRCULAR';
    console.log(`[SOI ENTRY] FINAL: a=${ship.orbitalElements.a.toFixed(6)} AU, e=${ship.orbitalElements.e.toFixed(4)} (${orbitType})`);

    // DEBUG: Verify by computing position/velocity from new elements
    const verifyPos = getPosition(ship.orbitalElements, julianDate);
    const verifyVel = getVelocity(ship.orbitalElements, julianDate);
    const verifyVelMag = Math.sqrt(verifyVel.vx**2 + verifyVel.vy**2 + verifyVel.vz**2) * 1731.46;
    console.log(`[SOI ENTRY] VERIFY pos from elements: (${verifyPos.x.toFixed(6)}, ${verifyPos.y.toFixed(6)}, ${verifyPos.z.toFixed(6)}) AU`);
    console.log(`[SOI ENTRY] VERIFY vel from elements: (${verifyVel.vx.toFixed(6)}, ${verifyVel.vy.toFixed(6)}, ${verifyVel.vz.toFixed(6)}) AU/day = ${verifyVelMag.toFixed(2)} km/s`);
    console.log(`========== END SOI ENTRY ==========\n`);

    return true;
}

/**
 * Handle transition from planetocentric to heliocentric reference frame.
 *
 * @param {Object} ship - Ship object
 * @param {Object} shipPosPlanet - Ship position relative to planet
 * @param {Object} shipVelPlanet - Ship velocity relative to planet
 * @param {number} julianDate - Current Julian date
 * @returns {boolean} True if exit was handled, false if blocked
 */
function handleSOIExit(ship, shipPosPlanet, shipVelPlanet, julianDate) {
    const planetName = ship.soiState.currentBody;

    // Check cooldown to prevent rapid cycling - only applies to the SAME body
    if (lastSOITransitionBody === planetName &&
        julianDate - lastSOITransitionTime < PHYSICS_CONFIG.soiTransitionCooldown) {
        return false;
    }
    const planet = getBodyByName(planetName);
    if (!planet || !planet.elements) {
        console.warn(`SOI Exit: Planet ${planetName} not found`);
        return false;
    }

    // Get planet's heliocentric position and velocity
    const planetPosHelio = getPosition(planet.elements, julianDate);
    const planetVelHelio = getVelocity(planet.elements, julianDate);

    // DEBUG: Log planetocentric state before conversion
    const relVelMag = Math.sqrt(shipVelPlanet.vx**2 + shipVelPlanet.vy**2 + shipVelPlanet.vz**2) * 1731.46;
    const relPosMag = Math.sqrt(shipPosPlanet.x**2 + shipPosPlanet.y**2 + shipPosPlanet.z**2);
    console.log(`\n========== SOI EXIT: ${planetName} ==========`);
    console.log(`[SOI EXIT] Ship planet-relative pos: (${shipPosPlanet.x.toFixed(6)}, ${shipPosPlanet.y.toFixed(6)}, ${shipPosPlanet.z.toFixed(6)}) AU, dist=${relPosMag.toFixed(6)} AU`);
    console.log(`[SOI EXIT] Ship planet-relative vel: (${shipVelPlanet.vx.toFixed(6)}, ${shipVelPlanet.vy.toFixed(6)}, ${shipVelPlanet.vz.toFixed(6)}) AU/day = ${relVelMag.toFixed(2)} km/s`);
    const planetVelMag = Math.sqrt(planetVelHelio.vx**2 + planetVelHelio.vy**2 + planetVelHelio.vz**2) * 1731.46;
    console.log(`[SOI EXIT] Planet helio vel: (${planetVelHelio.vx.toFixed(6)}, ${planetVelHelio.vy.toFixed(6)}, ${planetVelHelio.vz.toFixed(6)}) AU/day = ${planetVelMag.toFixed(2)} km/s`);

    // Convert ship state to heliocentric frame
    const { pos, vel } = planetocentricToHelio(
        shipPosPlanet,
        { vx: shipVelPlanet.vx, vy: shipVelPlanet.vy, vz: shipVelPlanet.vz },
        planetPosHelio,
        planetVelHelio
    );

    // DEBUG: Log heliocentric state after conversion
    const helioVelMag = Math.sqrt(vel.vx**2 + vel.vy**2 + vel.vz**2) * 1731.46;
    console.log(`[SOI EXIT] Ship helio pos: (${pos.x.toFixed(6)}, ${pos.y.toFixed(6)}, ${pos.z.toFixed(6)}) AU`);
    console.log(`[SOI EXIT] Ship helio vel: (${vel.vx.toFixed(6)}, ${vel.vy.toFixed(6)}, ${vel.vz.toFixed(6)}) AU/day = ${helioVelMag.toFixed(2)} km/s`);

    // Convert heliocentric state to orbital elements around Sun
    ship.orbitalElements = stateToElements(pos, vel, MU_SUN, julianDate);

    // Update SOI state
    ship.soiState = {
        currentBody: 'SUN',
        isInSOI: false
    };

    // Clear extreme flyby state if it was set
    if (ship.extremeFlybyState) {
        delete ship.extremeFlybyState;
    }

    // Set cooldown for this specific body
    lastSOITransitionTime = julianDate;
    lastSOITransitionBody = planetName;

    console.log(`[SOI EXIT] FINAL: a=${ship.orbitalElements.a.toFixed(4)} AU, e=${ship.orbitalElements.e.toFixed(4)}`);

    // DEBUG: Verify by computing position/velocity from new elements
    const verifyPos = getPosition(ship.orbitalElements, julianDate);
    const verifyVel = getVelocity(ship.orbitalElements, julianDate);
    const verifyVelMag = Math.sqrt(verifyVel.vx**2 + verifyVel.vy**2 + verifyVel.vz**2) * 1731.46;
    console.log(`[SOI EXIT] VERIFY pos from elements: (${verifyPos.x.toFixed(6)}, ${verifyPos.y.toFixed(6)}, ${verifyPos.z.toFixed(6)}) AU`);
    console.log(`[SOI EXIT] VERIFY vel from elements: (${verifyVel.vx.toFixed(6)}, ${verifyVel.vy.toFixed(6)}, ${verifyVel.vz.toFixed(6)}) AU/day = ${verifyVelMag.toFixed(2)} km/s`);
    console.log(`========== END SOI EXIT ==========\n`);

    return true;
}

/**
 * Update cached position/velocity for heliocentric state.
 */
function updateCachedState(ship, position, velocity) {
    ship.x = position.x;
    ship.y = position.y;
    ship.z = position.z;

    ship.velocity = {
        x: velocity.vx,
        y: velocity.vy,
        z: velocity.vz
    };
}

/**
 * Update cached position/velocity when in SOI.
 * Converts planetocentric position to heliocentric for rendering.
 */
function updateCachedStateInSOI(ship, positionRelative, velocityRelative) {
    const parent = getBodyByName(ship.soiState.currentBody);
    if (parent) {
        // Store absolute (heliocentric) position for rendering
        ship.x = positionRelative.x + parent.x;
        ship.y = positionRelative.y + parent.y;
        ship.z = positionRelative.z + parent.z;
    } else {
        ship.x = positionRelative.x;
        ship.y = positionRelative.y;
        ship.z = positionRelative.z;
    }

    ship.velocity = {
        x: velocityRelative.vx,
        y: velocityRelative.vy,
        z: velocityRelative.vz
    };
}

/**
 * Update all ships with orbital elements.
 * 
 * @param {Array} ships - Array of ship objects
 * @param {number} deltaTime - Time step in days
 */
export function updateAllShipPhysics(ships, deltaTime) {
    ships.forEach(ship => {
        if (ship.orbitalElements) {
            updateShipPhysics(ship, deltaTime);
        }
    });
}

// ============================================================================
// Debug Logging
// ============================================================================

console.log('[SHIP_PHYSICS] Module loaded');

// Periodic debug logging control
let lastDebugLogTime = 0;
const DEBUG_LOG_INTERVAL = 0.1; // Log every 0.1 game days when enabled
let debugLoggingEnabled = false;
let lastLoggedVelocity = null;
let lastLoggedPosition = null;

// Always-on anomaly detection (separate from verbose logging)
let lastKnownState = null;
let anomalyCheckInterval = 0.05; // Check every 0.05 game days
let lastAnomalyCheckTime = 0;
let frameCount = 0;
let lastFrameLogTime = Date.now();

// Hyperbolic debug state
let hyperbolicFrameCount = 0;
let lastHyperbolicLogTime = Date.now();

/**
 * Comprehensive debug logging for hyperbolic orbit issues.
 * Logs every frame when enabled.
 */
function logHyperbolicDebug(ship, position, velocity, thrust, julianDate) {
    hyperbolicFrameCount++;
    const now = Date.now();
    const frameInterval = now - lastHyperbolicLogTime;

    const { a, e, i, Ω, ω, M0, μ } = ship.orbitalElements;
    const visual = ship.visualOrbitalElements || {};

    // Determine orbit type
    const orbitType = e >= 1 ? 'HYPERBOLIC' : e > 0.9 ? 'HIGH_ELLIPTIC' : 'ELLIPTIC';
    const orbitChanged = lastOrbitType !== null && lastOrbitType !== orbitType;

    // Position and velocity magnitudes
    const r = Math.sqrt(position.x**2 + position.y**2 + position.z**2);
    const vMag = Math.sqrt(velocity.vx**2 + velocity.vy**2 + velocity.vz**2);
    const vKmS = vMag * 1731.46;

    // Angular momentum (for direction checking)
    const hx = position.y * velocity.vz - position.z * velocity.vy;
    const hy = position.z * velocity.vx - position.x * velocity.vz;
    const hz = position.x * velocity.vy - position.y * velocity.vx;
    const hMag = Math.sqrt(hx**2 + hy**2 + hz**2);

    // Direction indicators
    const rdotv = position.x * velocity.vx + position.y * velocity.vy + position.z * velocity.vz;

    // Orbital energy
    const energy = (vMag * vMag) / 2 - μ / r;

    // Thrust magnitude
    const thrustMag = Math.sqrt(thrust.x**2 + thrust.y**2 + thrust.z**2);
    const thrustMmS2 = thrustMag * 1731.46 * 1000 / 86400;

    // Cached display position (what renderer sees)
    const displayPos = { x: ship.x, y: ship.y, z: ship.z };
    const displayDist = Math.sqrt(displayPos.x**2 + displayPos.y**2 + displayPos.z**2);

    // Position delta between actual and display
    const posDeltaFromDisplay = Math.sqrt(
        (position.x - ship.x)**2 +
        (position.y - ship.y)**2 +
        (position.z - ship.z)**2
    );

    // Visual elements delta
    const visualEDelta = visual.e !== undefined ? Math.abs(e - visual.e) : 0;
    const visualADelta = visual.a !== undefined ? Math.abs(a - visual.a) / Math.abs(a) : 0;

    // Log orbit type change immediately
    if (orbitChanged) {
        console.warn(`\n🔄 ORBIT TYPE CHANGE: ${lastOrbitType} → ${orbitType}`);
        console.warn(`   e: ${e.toFixed(6)}, a: ${a.toFixed(6)} AU, energy: ${energy.toExponential(3)}`);
    }
    lastOrbitType = orbitType;

    // Log every frame (throttled to console)
    console.log(
        `[HYP] f${hyperbolicFrameCount} | ` +
        `${orbitType} e=${e.toFixed(4)} a=${a.toFixed(4)} | ` +
        `r=${r.toFixed(4)} v=${vKmS.toFixed(1)}km/s | ` +
        `${rdotv > 0 ? 'OUT' : 'IN'} ${hz > 0 ? 'PRO' : 'RET'} | ` +
        `SOI=${ship.soiState?.isInSOI ? ship.soiState.currentBody : 'SUN'}`
    );

    // Log position details
    console.log(
        `[HYP]   pos: actual(${position.x.toFixed(5)}, ${position.y.toFixed(5)}, ${position.z.toFixed(5)}) ` +
        `display(${displayPos.x.toFixed(5)}, ${displayPos.y.toFixed(5)}, ${displayPos.z.toFixed(5)}) ` +
        `delta=${posDeltaFromDisplay.toExponential(2)}`
    );

    // Log velocity details
    console.log(
        `[HYP]   vel: (${velocity.vx.toFixed(6)}, ${velocity.vy.toFixed(6)}, ${velocity.vz.toFixed(6)}) | ` +
        `cached: (${ship.velocity?.x?.toFixed(6) || 'N/A'}, ${ship.velocity?.y?.toFixed(6) || 'N/A'}, ${ship.velocity?.z?.toFixed(6) || 'N/A'})`
    );

    // Log orbital elements
    console.log(
        `[HYP]   elements: a=${a.toFixed(6)} e=${e.toFixed(6)} i=${(i*180/Math.PI).toFixed(2)}° ` +
        `Ω=${(Ω*180/Math.PI).toFixed(2)}° ω=${(ω*180/Math.PI).toFixed(2)}° M0=${(M0*180/Math.PI).toFixed(2)}°`
    );

    // Log visual elements comparison
    if (visual.e !== undefined) {
        console.log(
            `[HYP]   visual:   a=${visual.a?.toFixed(6) || 'N/A'} e=${visual.e?.toFixed(6) || 'N/A'} | ` +
            `delta: a=${(visualADelta*100).toFixed(1)}% e=${visualEDelta.toFixed(4)}`
        );
    }

    // Log angular momentum and energy
    console.log(
        `[HYP]   h=(${hx.toFixed(6)}, ${hy.toFixed(6)}, ${hz.toFixed(6)}) |h|=${hMag.toFixed(6)} | ` +
        `E=${energy.toExponential(3)} (${energy < 0 ? 'BOUND' : 'UNBOUND'})`
    );

    // Log thrust if active
    if (thrustMag > 1e-15) {
        console.log(
            `[HYP]   thrust: (${thrust.x.toExponential(3)}, ${thrust.y.toExponential(3)}, ${thrust.z.toExponential(3)}) ` +
            `= ${thrustMmS2.toFixed(4)} mm/s²`
        );
    }

    // Check for anomalies
    const anomalies = [];
    if (posDeltaFromDisplay > 0.001) {
        anomalies.push(`POS_DELTA=${posDeltaFromDisplay.toFixed(4)}AU`);
    }
    if (visualEDelta > 0.1) {
        anomalies.push(`VISUAL_E_LAG=${visualEDelta.toFixed(3)}`);
    }
    if (e >= 1 && visual.e !== undefined && visual.e < 1) {
        anomalies.push(`VISUAL_NOT_HYPERBOLIC`);
    }
    if (!isFinite(a) || !isFinite(e)) {
        anomalies.push(`INVALID_ELEMENTS`);
    }
    if (e >= 1 && a > 0) {
        anomalies.push(`WRONG_SMA_SIGN(hyperbolic needs a<0)`);
    }
    if (e < 1 && a < 0) {
        anomalies.push(`WRONG_SMA_SIGN(elliptic needs a>0)`);
    }

    if (anomalies.length > 0) {
        console.warn(`[HYP] ⚠️ ANOMALIES: ${anomalies.join(', ')}`);
    }

    // Log frame timing every 60 frames
    if (hyperbolicFrameCount % 60 === 0) {
        const avgFrameTime = frameInterval / 60;
        console.log(`[HYP] === Frame timing: ${avgFrameTime.toFixed(1)}ms avg, ${(1000/avgFrameTime).toFixed(1)} fps ===`);
        lastHyperbolicLogTime = now;
    }
}

/**
 * Always-on anomaly detection - warns when something suspicious happens.
 * This runs every frame but only logs when it detects problems.
 */
function checkForAnomalies(ship, position, velocity, thrust, julianDate) {
    frameCount++;

    // Log frame rate and orbital elements every 5 real seconds
    const now = Date.now();
    if (now - lastFrameLogTime > 5000) {
        const fps = frameCount / ((now - lastFrameLogTime) / 1000);
        const { a, e, i } = ship.orbitalElements;
        const vMag = Math.sqrt(velocity.vx**2 + velocity.vy**2 + velocity.vz**2);
        const vKmS = vMag * 1731.46;

        // Compute h_z to check orbit direction
        const hz = position.x * velocity.vy - position.y * velocity.vx;
        const orbitDir = hz > 0 ? 'PRO' : 'RETRO';

        console.log(`[STATUS] ${fps.toFixed(1)} fps | JD=${julianDate.toFixed(2)} | SOI=${ship.soiState?.isInSOI ? ship.soiState.currentBody : 'SUN'}`);
        console.log(`[STATUS] Orbit: a=${a.toFixed(4)} AU, e=${e.toFixed(4)}, i=${(i*180/Math.PI).toFixed(2)}° | v=${vKmS.toFixed(1)} km/s | ${orbitDir}`);

        // Warn if orbit is escaping or retrograde
        if (e >= 0.95) {
            console.warn(`[STATUS] ⚠️ HIGH ECCENTRICITY: e=${e.toFixed(4)} - orbit may become hyperbolic!`);
        }
        if (hz < 0) {
            console.warn(`[STATUS] ⚠️ RETROGRADE ORBIT (h_z=${hz.toFixed(6)})`);
        }

        frameCount = 0;
        lastFrameLogTime = now;
    }

    // Only check anomalies at intervals (not every frame)
    if (julianDate - lastAnomalyCheckTime < anomalyCheckInterval) {
        return;
    }
    lastAnomalyCheckTime = julianDate;

    const r = Math.sqrt(position.x**2 + position.y**2 + position.z**2);
    const vMag = Math.sqrt(velocity.vx**2 + velocity.vy**2 + velocity.vz**2);
    const vKmS = vMag * 1731.46;

    // Compute key orbital indicators
    const rdotv = position.x * velocity.vx + position.y * velocity.vy + position.z * velocity.vz;
    const hz = position.x * velocity.vy - position.y * velocity.vx;

    const currentState = {
        r, vMag, vKmS, rdotv, hz,
        a: ship.orbitalElements.a,
        e: ship.orbitalElements.e,
        position: { ...position },
        velocity: { ...velocity },
        julianDate
    };

    if (lastKnownState) {
        const anomalies = [];

        // Check for velocity direction reversal
        const dotProduct = (velocity.vx * lastKnownState.velocity.vx +
                          velocity.vy * lastKnownState.velocity.vy +
                          velocity.vz * lastKnownState.velocity.vz) / (vMag * lastKnownState.vMag);

        if (dotProduct < 0) {
            anomalies.push(`VELOCITY REVERSAL (dot=${dotProduct.toFixed(3)})`);
        } else if (dotProduct < 0.8) {
            const angleDeg = Math.acos(Math.min(1, dotProduct)) * 180 / Math.PI;
            anomalies.push(`LARGE DIRECTION CHANGE (${angleDeg.toFixed(1)}°)`);
        }

        // Check for prograde/retrograde flip
        if ((hz > 0 && lastKnownState.hz < 0) || (hz < 0 && lastKnownState.hz > 0)) {
            anomalies.push(`ORBIT FLIP (h_z: ${lastKnownState.hz.toFixed(4)} → ${hz.toFixed(4)})`);
        }

        // Check for sudden speed change (>20%)
        const speedChange = Math.abs(vMag - lastKnownState.vMag) / lastKnownState.vMag;
        if (speedChange > 0.2) {
            anomalies.push(`SPEED JUMP (${(speedChange*100).toFixed(1)}%: ${lastKnownState.vKmS.toFixed(1)} → ${vKmS.toFixed(1)} km/s)`);
        }

        // Check for sudden semi-major axis change (>10%)
        const aChange = Math.abs(ship.orbitalElements.a - lastKnownState.a) / lastKnownState.a;
        if (aChange > 0.1) {
            anomalies.push(`SMA JUMP (${(aChange*100).toFixed(1)}%: ${lastKnownState.a.toFixed(4)} → ${ship.orbitalElements.a.toFixed(4)} AU)`);
        }

        // Check for eccentricity going crazy
        if (ship.orbitalElements.e > 1.5 || ship.orbitalElements.e < 0) {
            anomalies.push(`INVALID ECCENTRICITY (e=${ship.orbitalElements.e.toFixed(4)})`);
        }

        // Check for position teleport (moved more than expected)
        const posChange = Math.sqrt(
            (position.x - lastKnownState.position.x)**2 +
            (position.y - lastKnownState.position.y)**2 +
            (position.z - lastKnownState.position.z)**2
        );
        const expectedMove = lastKnownState.vMag * (julianDate - lastKnownState.julianDate);
        if (posChange > expectedMove * 3 && posChange > 0.001) {
            anomalies.push(`POSITION TELEPORT (moved ${posChange.toFixed(4)} AU, expected ~${expectedMove.toFixed(4)} AU)`);
        }

        // Log any anomalies found
        if (anomalies.length > 0) {
            console.warn(`\n[ANOMALY] ⚠️ JD=${julianDate.toFixed(2)}, SOI=${ship.soiState?.isInSOI ? ship.soiState.currentBody : 'SUN'}`);
            anomalies.forEach(a => console.warn(`[ANOMALY] ${a}`));
            console.warn(`[ANOMALY] Before: r=${lastKnownState.r.toFixed(4)} AU, v=${lastKnownState.vKmS.toFixed(1)} km/s, a=${lastKnownState.a.toFixed(4)}, e=${lastKnownState.e.toFixed(4)}`);
            console.warn(`[ANOMALY] After:  r=${r.toFixed(4)} AU, v=${vKmS.toFixed(1)} km/s, a=${ship.orbitalElements.a.toFixed(4)}, e=${ship.orbitalElements.e.toFixed(4)}`);
            console.warn(`[ANOMALY] h_z=${hz.toFixed(6)} (${hz > 0 ? 'PROGRADE' : 'RETROGRADE'}), r·v=${rdotv.toFixed(6)} (${rdotv > 0 ? 'OUT' : 'IN'})\n`);
        }
    }

    lastKnownState = currentState;
}

/**
 * Enable/disable periodic debug logging.
 * Call from browser console: window.toggleOrbitalDebug()
 */
export function toggleOrbitalDebug() {
    debugLoggingEnabled = !debugLoggingEnabled;
    lastLoggedVelocity = null;
    lastLoggedPosition = null;
    lastDebugLogTime = 0;
    console.log(`Orbital debug logging: ${debugLoggingEnabled ? 'ENABLED' : 'DISABLED'}`);
    if (debugLoggingEnabled) {
        console.log('Will log every 0.1 game days. Watch for DIRECTION CHANGE and SPEED CHANGE warnings.');
    }
    return debugLoggingEnabled;
}

/**
 * Periodic debug logging for tracking orbital changes over time.
 */
function periodicDebugLog(ship, position, velocity, thrust, julianDate) {
    // Only log at intervals
    if (julianDate - lastDebugLogTime < DEBUG_LOG_INTERVAL) {
        return;
    }
    lastDebugLogTime = julianDate;

    const { a, e, i, ω, Ω, M0 } = ship.orbitalElements;
    const r = Math.sqrt(position.x**2 + position.y**2 + position.z**2);
    const vMag = Math.sqrt(velocity.vx**2 + velocity.vy**2 + velocity.vz**2);
    const vKmS = vMag * 1731.46;

    // Compute direction indicators
    const rdotv = position.x * velocity.vx + position.y * velocity.vy + position.z * velocity.vz;
    const hz = position.x * velocity.vy - position.y * velocity.vx; // z-component of angular momentum

    // Thrust magnitude
    const thrustMag = Math.sqrt(thrust.x**2 + thrust.y**2 + thrust.z**2);
    const thrustMmS2 = thrustMag * 1731.46 * 1000 / 86400; // Convert AU/day² to mm/s²

    // Check for significant changes from last log
    let warnings = [];
    if (lastLoggedVelocity) {
        const lastVMag = Math.sqrt(lastLoggedVelocity.vx**2 + lastLoggedVelocity.vy**2 + lastLoggedVelocity.vz**2);
        const speedChange = Math.abs(vMag - lastVMag) / lastVMag * 100;

        // Dot product of velocity directions
        const dotProduct = (velocity.vx * lastLoggedVelocity.vx +
                          velocity.vy * lastLoggedVelocity.vy +
                          velocity.vz * lastLoggedVelocity.vz) / (vMag * lastVMag);

        // Check for direction reversal (dot product < 0 means > 90° change)
        if (dotProduct < 0) {
            warnings.push(`⚠️ DIRECTION REVERSAL! dot=${dotProduct.toFixed(3)}`);
        } else if (dotProduct < 0.9) {
            const angleDeg = Math.acos(Math.min(1, dotProduct)) * 180 / Math.PI;
            warnings.push(`⚠️ DIRECTION CHANGE: ${angleDeg.toFixed(1)}°`);
        }

        if (speedChange > 10) {
            warnings.push(`⚠️ SPEED CHANGE: ${speedChange.toFixed(1)}%`);
        }

        // Check for h_z sign change (prograde/retrograde flip)
        const lastHz = lastLoggedPosition.x * lastLoggedVelocity.vy - lastLoggedPosition.y * lastLoggedVelocity.vx;
        if ((hz > 0 && lastHz < 0) || (hz < 0 && lastHz > 0)) {
            warnings.push(`⚠️ ORBIT DIRECTION FLIP! h_z: ${lastHz.toFixed(6)} → ${hz.toFixed(6)}`);
        }
    }

    // Log current state
    console.log(`[PHYSICS] t=${julianDate.toFixed(2)} | r=${r.toFixed(4)}AU v=${vKmS.toFixed(2)}km/s | a=${a.toFixed(4)} e=${e.toFixed(3)} | thrust=${thrustMmS2.toFixed(4)}mm/s²`);
    console.log(`[PHYSICS] pos=(${position.x.toFixed(4)}, ${position.y.toFixed(4)}, ${position.z.toFixed(4)}) vel=(${velocity.vx.toFixed(6)}, ${velocity.vy.toFixed(6)}, ${velocity.vz.toFixed(6)})`);
    console.log(`[PHYSICS] r·v=${rdotv.toFixed(6)} (${rdotv > 0 ? 'OUT' : 'IN'}) | h_z=${hz.toFixed(6)} (${hz > 0 ? 'PRO' : 'RETRO'})`);

    if (warnings.length > 0) {
        console.warn(`[PHYSICS] ${warnings.join(' | ')}`);
    }

    // Store for comparison
    lastLoggedVelocity = { ...velocity };
    lastLoggedPosition = { ...position };
}

/**
 * Log current orbital state for debugging.
 * Call from browser console: window.logOrbitalState()
 */
export function logOrbitalState(ship) {
    if (!ship || !ship.orbitalElements) {
        console.log('No ship orbital elements available');
        return;
    }

    const { a, e, i, Ω, ω, M0, μ } = ship.orbitalElements;
    const julianDate = getJulianDate();

    // Get current position and velocity
    const pos = getPosition(ship.orbitalElements, julianDate);
    const vel = getVelocity(ship.orbitalElements, julianDate);

    const r = Math.sqrt(pos.x**2 + pos.y**2 + pos.z**2);
    const vMag = Math.sqrt(vel.vx**2 + vel.vy**2 + vel.vz**2);
    const vKmS = vMag * 1731.46;

    // Check orbital direction via r·v
    const rdotv = pos.x * vel.vx + pos.y * vel.vy + pos.z * vel.vz;

    // Angular momentum
    const hx = pos.y * vel.vz - pos.z * vel.vy;
    const hy = pos.z * vel.vx - pos.x * vel.vz;
    const hz = pos.x * vel.vy - pos.y * vel.vx;
    const hMag = Math.sqrt(hx**2 + hy**2 + hz**2);

    // Orbital energy
    const energy = (vMag * vMag) / 2 - μ / r;

    console.log(`\n========== ORBITAL STATE DEBUG ==========`);
    console.log(`[ORBIT] Reference: ${ship.soiState?.isInSOI ? ship.soiState.currentBody : 'SUN'}`);
    console.log(`[ORBIT] Elements: a=${a.toFixed(6)} AU, e=${e.toFixed(4)}, i=${(i*180/Math.PI).toFixed(2)}°`);
    console.log(`[ORBIT] Elements: Ω=${(Ω*180/Math.PI).toFixed(2)}°, ω=${(ω*180/Math.PI).toFixed(2)}°, M0=${(M0*180/Math.PI).toFixed(2)}°`);
    console.log(`[ORBIT] Position: (${pos.x.toFixed(6)}, ${pos.y.toFixed(6)}, ${pos.z.toFixed(6)}) AU, r=${r.toFixed(6)} AU`);
    console.log(`[ORBIT] Velocity: (${vel.vx.toFixed(6)}, ${vel.vy.toFixed(6)}, ${vel.vz.toFixed(6)}) AU/day = ${vKmS.toFixed(2)} km/s`);
    console.log(`[ORBIT] r·v = ${rdotv.toFixed(6)} → ${rdotv > 0 ? 'OUTBOUND (moving away)' : 'INBOUND (moving closer)'}`);
    console.log(`[ORBIT] Angular momentum h = (${hx.toFixed(6)}, ${hy.toFixed(6)}, ${hz.toFixed(6)}), |h|=${hMag.toFixed(6)}`);
    console.log(`[ORBIT] h_z ${hz > 0 ? '> 0 → PROGRADE (CCW from above)' : '< 0 → RETROGRADE (CW from above)'}`);
    console.log(`[ORBIT] Specific energy = ${energy.toExponential(4)} → ${energy < 0 ? 'BOUND' : 'UNBOUND'}`);
    console.log(`[ORBIT] Periapsis: ${(a*(1-e)).toFixed(6)} AU, Apoapsis: ${(a*(1+e)).toFixed(6)} AU`);
    console.log(`========== END ORBITAL STATE ==========\n`);
}

// Make debug functions available globally
if (typeof window !== 'undefined') {
    window.toggleOrbitalDebug = toggleOrbitalDebug;
    window.logOrbitalState = logOrbitalState;
    // Note: Call as logOrbitalState(getPlayerShip()) from console
    // The getPlayerShip function is available via: import { getPlayerShip } from './data/ships.js'
}

// ============================================================================
// Diagnostic Functions
// ============================================================================

/**
 * Get orbital information for display.
 * 
 * @param {Object} ship - Ship with orbital elements
 * @returns {Object|null} Orbital info or null if not applicable
 */
export function getOrbitalInfo(ship) {
    if (!ship.orbitalElements) {
        return null;
    }
    
    const { a, e, i } = ship.orbitalElements;
    
    // Calculate orbital period in days
    const μ = ship.orbitalElements.μ;
    const period = 2 * Math.PI * Math.sqrt(a * a * a / μ);
    
    // Calculate periapsis and apoapsis
    const periapsis = a * (1 - e);
    const apoapsis = a * (1 + e);
    
    // Current distance from sun
    const r = Math.sqrt(ship.x ** 2 + ship.y ** 2 + ship.z ** 2);
    
    return {
        semiMajorAxis: a,
        eccentricity: e,
        inclination: i * 180 / Math.PI,  // Convert to degrees for display
        period: period,
        periodYears: period / 365.25,
        periapsis: periapsis,
        apoapsis: apoapsis,
        currentDistance: r
    };
}

/**
 * Get current sail thrust info for display.
 * 
 * @param {Object} ship - Ship with sail state
 * @returns {Object|null} Thrust info or null if not applicable
 */
export function getThrustInfo(ship) {
    if (!ship.sail || !ship.orbitalElements) {
        return null;
    }
    
    const r = Math.sqrt(ship.x ** 2 + ship.y ** 2 + ship.z ** 2);
    if (r < 0.01) return null;
    
    // Solar pressure at this distance (N/m²)
    const solarPressure = 4.56e-6 / (r * r);
    
    // Effective area
    const { area, reflectivity, angle, deploymentPercent, condition } = ship.sail;
    const effectiveArea = area * (deploymentPercent / 100) * (condition / 100);
    
    // Thrust magnitude: F = 2 * P * A * cos²(θ) * ρ
    const cosAngle = Math.cos(angle);
    const thrustN = 2 * solarPressure * effectiveArea * cosAngle * cosAngle * reflectivity;
    
    // Acceleration in m/s²
    const mass = ship.mass || 10000;
    const accelMS2 = thrustN / mass;
    
    // Acceleration in g's
    const accelG = accelMS2 / 9.81;
    
    return {
        thrustNewtons: thrustN,
        accelerationMS2: accelMS2,
        accelerationG: accelG,
        sailAngleDeg: angle * 180 / Math.PI,
        effectiveAreaKM2: effectiveArea / 1e6,
        solarPressureNM2: solarPressure,
        distanceAU: r
    };
}

/**
 * Predict future orbital state.
 * 
 * This is useful for trajectory preview without modifying actual state.
 * 
 * @param {Object} ship - Ship with orbital elements
 * @param {number} daysAhead - Days in the future to predict
 * @param {number} steps - Number of prediction steps
 * @returns {Array} Array of predicted positions {x, y, z}
 */
export function predictTrajectory(ship, daysAhead, steps = 50) {
    if (!ship.orbitalElements) {
        return [];
    }
    
    const predictions = [];
    const julianDate = getJulianDate();
    const timeStep = daysAhead / steps;
    
    // Clone orbital elements for prediction
    let elements = { ...ship.orbitalElements };
    
    for (let i = 0; i <= steps; i++) {
        const futureDate = julianDate + i * timeStep;
        
        // Get position at this time
        const pos = getPosition(elements, futureDate);
        predictions.push({
            x: pos.x,
            y: pos.y,
            z: pos.z,
            time: i * timeStep
        });
        
        // If we want to account for thrust in prediction, we could apply it here
        // For now, we just use unperturbed orbit
    }
    
    return predictions;
}
