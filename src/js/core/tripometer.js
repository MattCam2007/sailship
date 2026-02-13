/**
 * Tripometer Module
 *
 * Tracks cumulative distance traveled and elapsed trip time since last reset.
 * Distance is accumulated frame-by-frame from ship position deltas.
 * Provides average speed calculation.
 */

import { getPlayerShip } from '../data/ships.js';
import { getTime } from './gameState.js';
import { getShipVelocityKmS } from './shipPhysics.js';

// ============================================================================
// Tripometer State
// ============================================================================

const KM_PER_AU = 149597870.7;

let tripState = {
    distanceAU: 0,          // Cumulative distance traveled in AU
    startTime: 0,           // Game time (days) when trip started
    lastPos: null,          // Last known ship position {x, y, z}
    minSpeedKmS: Infinity,  // Minimum instantaneous speed recorded
    maxSpeedKmS: 0,         // Maximum instantaneous speed recorded
    hasSpeedSample: false,  // True once at least one speed sample taken
};

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Update tripometer with current ship position.
 * Call once per frame after ship physics update.
 */
export function updateTripometer() {
    const player = getPlayerShip();
    if (!player) return;

    const pos = { x: player.x, y: player.y, z: player.z };

    if (tripState.lastPos) {
        const dx = pos.x - tripState.lastPos.x;
        const dy = pos.y - tripState.lastPos.y;
        const dz = pos.z - tripState.lastPos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // Guard against teleport-like jumps (e.g. save/load, cheat nudge)
        // A ship moving at ~100 km/s covers ~0.00004 AU/frame at 60fps 1x speed
        // At max time warp this could be larger, but 1 AU/frame is unreasonable
        if (dist < 1) {
            tripState.distanceAU += dist;
        }

        // Track min/max instantaneous speed (only after baseline position established)
        const speed = getShipVelocityKmS(player);
        if (isFinite(speed) && speed > 0) {
            tripState.hasSpeedSample = true;
            if (speed < tripState.minSpeedKmS) tripState.minSpeedKmS = speed;
            if (speed > tripState.maxSpeedKmS) tripState.maxSpeedKmS = speed;
        }
    }

    tripState.lastPos = pos;
}

/**
 * Reset the tripometer to zero.
 */
export function resetTripometer() {
    const player = getPlayerShip();
    tripState.distanceAU = 0;
    tripState.startTime = getTime();
    tripState.lastPos = null;
    tripState.minSpeedKmS = Infinity;
    tripState.maxSpeedKmS = 0;
    tripState.hasSpeedSample = false;
}

/**
 * Get trip distance in AU.
 * @returns {number}
 */
export function getTripDistanceAU() {
    return tripState.distanceAU;
}

/**
 * Get trip elapsed time in days.
 * @returns {number}
 */
export function getTripElapsedDays() {
    return getTime() - tripState.startTime;
}

/**
 * Get average speed in km/s over the trip.
 * @returns {number}
 */
export function getTripAvgSpeedKmS() {
    const days = getTripElapsedDays();
    if (days <= 0) return 0;
    // AU/day -> km/s: multiply by KM_PER_AU / 86400
    return (tripState.distanceAU / days) * (KM_PER_AU / 86400);
}

/**
 * Get minimum speed in km/s recorded since last reset.
 * @returns {number}
 */
export function getTripMinSpeedKmS() {
    return tripState.hasSpeedSample ? tripState.minSpeedKmS : 0;
}

/**
 * Get maximum speed in km/s recorded since last reset.
 * @returns {number}
 */
export function getTripMaxSpeedKmS() {
    return tripState.maxSpeedKmS;
}

/**
 * Format trip distance with adaptive units and fixed widths.
 * Uses leading zeros for consistent display width at high speeds.
 * @returns {string}
 */
export function formatTripDistance() {
    const au = tripState.distanceAU;
    const km = au * KM_PER_AU;

    if (au >= 1) {
        // Format: "000.000 AU" (up to 999.999 AU)
        const wholePart = Math.floor(au);
        const decimalPart = (au - wholePart).toFixed(3).substring(1); // ".XXX"
        return String(wholePart).padStart(3, '0') + decimalPart + ' AU';
    } else if (km >= 1000000) {
        // Format: "000.00 M km" (up to 999.99 M km)
        const mKm = km / 1000000;
        const wholePart = Math.floor(mKm);
        const decimalPart = (mKm - wholePart).toFixed(2).substring(1); // ".XX"
        return String(wholePart).padStart(3, '0') + decimalPart + ' M km';
    } else if (km >= 1000) {
        // Format: "000.0 K km" (up to 999.9 K km)
        const kKm = km / 1000;
        const wholePart = Math.floor(kKm);
        const decimalPart = (kKm - wholePart).toFixed(1).substring(1); // ".X"
        return String(wholePart).padStart(3, '0') + decimalPart + ' K km';
    } else {
        // Format: "000 km" (up to 999 km)
        return String(Math.floor(km)).padStart(3, '0') + ' km';
    }
}
