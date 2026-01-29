/**
 * Ships and contacts data
 *
 * Player ship uses Keplerian orbital elements and solar sail physics.
 * NPC ships use simple drift for now (can be upgraded later).
 */

import { MU_SUN, J2000 } from '../lib/orbital.js';
import { getJulianDate } from '../core/gameState.js';
import {
    GAME_START_EPOCH,
    DEFAULT_SAIL,
    DEFAULT_SHIP_MASS,
    SHIP_COLORS,
    SOLAR_PRESSURE_1AU,
} from '../config.js';

// Re-export defaults for external use (e.g., creating new ships, tests)
export { DEFAULT_SAIL, DEFAULT_SHIP_MASS };

/**
 * Create orbital elements for a ship starting in a circular orbit.
 *
 * @param {number} radius - Orbital radius in AU
 * @param {number} initialAngle - Initial position angle in radians
 * @returns {Object} Orbital elements
 */
function createCircularOrbit(radius, initialAngle = 0) {
    return {
        a: radius,                    // Semi-major axis (AU)
        e: 0.02,                      // Small eccentricity (nearly circular)
        i: 0.001,                     // Very small inclination (radians)
        Ω: 0,                         // Longitude of ascending node
        ω: 0,                         // Argument of periapsis
        M0: initialAngle,             // Mean anomaly at epoch (sets initial position)
        epoch: GAME_START_EPOCH,      // Same epoch as game start
        μ: MU_SUN                     // Orbiting the sun
    };
}

/**
 * Ships array containing all vessels.
 *
 * The player ship now uses orbital elements for position calculation,
 * with position/velocity cached each frame for rendering.
 */
export const ships = [
    {
        name: 'ROCINANTE',
        type: 'ship',
        isPlayer: true,

        // Orbital state - ship starts in Earth-like orbit
        // Slightly inside Earth's orbit for variety
        orbitalElements: createCircularOrbit(0.95, Math.PI / 4),

        // Ship mass in kg (affects acceleration from sail thrust)
        mass: DEFAULT_SHIP_MASS,

        // Solar sail state
        sail: { ...DEFAULT_SAIL },

        // SOI (Sphere of Influence) state for planetary orbit mechanics
        soiState: {
            currentBody: 'SUN',    // Parent body: 'SUN', 'EARTH', 'MARS', etc.
            isInSOI: false,        // True when inside a planetary SOI
        },

        // Cached position/velocity (updated each frame from orbital elements)
        // These are used by the renderer and other systems
        x: 0,
        y: 0,
        z: 0,
        velocity: { x: 0, y: 0, z: 0 },

        // Display properties
        color: SHIP_COLORS.player,

        // For compatibility with existing navigation system
        burning: false,
        destination: null
    },
    {
        name: 'MCRN DONNAGER',
        type: 'ship',
        x: 1.4, y: -0.2, z: 0.01,
        velocity: { x: -0.0005, y: 0.001, z: 0 },
        color: SHIP_COLORS.mcrn,
        isPlayer: false
    },
    {
        name: 'UNN AGATHA KING',
        type: 'ship',
        x: 0.95, y: 0.15, z: -0.01,
        velocity: { x: 0.0008, y: -0.0003, z: 0 },
        color: SHIP_COLORS.unn,
        isPlayer: false
    }
];

/**
 * Get the player's ship
 * @returns {Object|undefined} The player ship
 */
export function getPlayerShip() {
    return ships.find(s => s.isPlayer);
}

/**
 * Update non-player ship positions (drift)
 * @param {number} timeScale - Days per frame
 */
export function updateNPCShips(timeScale) {
    ships.forEach(ship => {
        if (!ship.isPlayer) {
            ship.x += ship.velocity.x * timeScale;
            ship.y += ship.velocity.y * timeScale;
            ship.z += ship.velocity.z * timeScale;
        }
    });
}

/**
 * Set the sail angle for a ship.
 *
 * @param {Object} ship - Ship object with sail state
 * @param {number} angle - New sail angle in radians (-π/2 to π/2)
 *                         Positive = prograde (raise orbit)
 *                         Negative = retrograde (lower orbit)
 *                         0 = face sun directly
 */
export function setSailAngle(ship, angle) {
    if (ship.sail) {
        ship.sail.angle = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, angle));
    }
}

/**
 * Set the sail pitch angle (out-of-plane thrust direction).
 *
 * @param {Object} ship - Ship object with sail state
 * @param {number} pitch - New pitch angle in radians (-π/2 to π/2)
 *                         Positive = thrust toward orbital north (increases inclination)
 *                         Negative = thrust toward orbital south (decreases inclination)
 *                         0 = thrust stays in orbital plane
 */
export function setSailPitch(ship, pitch) {
    if (ship.sail) {
        ship.sail.pitchAngle = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
    }
}

/**
 * Set the number of sails (thrust multiplier).
 *
 * @param {Object} ship - Ship object with sail state
 * @param {number} count - Number of sails (1-20)
 */
export function setSailCount(ship, count) {
    if (ship.sail) {
        ship.sail.sailCount = Math.max(1, Math.min(20, Math.round(count)));
    }
}

/**
 * Set sail deployment percentage.
 *
 * @param {Object} ship - Ship object with sail state
 * @param {number} percent - Deployment percentage (0-100)
 */
export function setSailDeployment(ship, percent) {
    if (ship.sail) {
        ship.sail.deploymentPercent = Math.max(0, Math.min(100, percent));
    }
}

/**
 * Get current sail thrust magnitude for display purposes.
 *
 * @param {Object} ship - Ship object with sail state and position
 * @returns {number} Current thrust acceleration in m/s² (for UI display)
 */
export function getCurrentThrustAccel(ship) {
    if (!ship.sail || !ship.orbitalElements) {
        return 0;
    }

    // Calculate distance from sun
    const r = Math.sqrt(ship.x ** 2 + ship.y ** 2 + ship.z ** 2);
    if (r < 0.01) return 0;

    // Solar pressure at this distance
    const P = SOLAR_PRESSURE_1AU / (r * r);

    // Effective area
    const { area, reflectivity, angle, pitchAngle = 0, deploymentPercent, condition, sailCount = 1 } = ship.sail;
    const effectiveArea = area * (deploymentPercent / 100) * (condition / 100);

    // Thrust magnitude: F = 2 * P * A * cos²(yaw) * cos²(pitch) * ρ * sailCount
    const cosAngle = Math.cos(angle);
    const cosPitch = Math.cos(pitchAngle);
    const thrustN = 2 * P * effectiveArea * cosAngle * cosAngle * cosPitch * cosPitch * reflectivity * sailCount;

    // Acceleration in m/s²
    return thrustN / (ship.mass || DEFAULT_SHIP_MASS);
}

/**
 * Initialize player ship orbital elements with current Julian date.
 * Called during game initialization.
 */
export function initializePlayerShip() {
    const player = getPlayerShip();
    if (player && player.orbitalElements) {
        // Ensure epoch is set to current game time
        player.orbitalElements.epoch = getJulianDate();
    }
}

// Expose debug helpers on window
if (typeof window !== 'undefined') {
    window.getPlayerShip = getPlayerShip;
    window.ships = ships;
}
