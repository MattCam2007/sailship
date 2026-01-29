/**
 * Gravity Assist Calculations Library
 *
 * Pure function library for computing gravitational slingshot parameters.
 * Handles hyperbolic flybys and predicts delta-V from planetary encounters.
 *
 * Key Concepts:
 * - v∞ (hyperbolic excess velocity): asymptotic velocity far from planet
 * - δ (turning angle): how much the trajectory bends
 * - ΔV: velocity change in heliocentric frame from the assist
 *
 * Units: AU for distance, AU/day for velocity, radians for angles.
 */

import { MU_SUN } from './orbital.js';

console.log('[GRAVITY_ASSIST] Module loaded');

// ============================================================================
// Hyperbolic Excess Velocity
// ============================================================================

/**
 * Calculate hyperbolic excess velocity (v∞) for a hyperbolic orbit.
 *
 * v∞ is the asymptotic velocity far from the planet, where the ship
 * has escaped the planet's gravity but still feels no force.
 *
 * Formula: v∞ = √(-μ/a)
 * (a is negative for hyperbolic orbits, so -μ/a is positive)
 *
 * @param {Object} orbitalElements - Orbital elements {a, e, μ, ...}
 * @returns {number} Hyperbolic excess velocity in AU/day, or 0 for elliptic orbits
 */
export function getHyperbolicExcessVelocity(orbitalElements) {
    const { a, e, μ } = orbitalElements;

    // Only hyperbolic orbits have v∞
    if (e < 1.0) {
        return 0;
    }

    // For parabolic orbits (e = 1.0), use special case
    if (Math.abs(e - 1.0) < 1e-10) {
        // For parabolic escape, v∞ → 0 (just barely escaping)
        return 0;
    }

    // Hyperbolic: v∞ = √(-μ/a)
    // (a is negative for hyperbolic, so -μ/a is positive)
    return Math.sqrt(-μ / a);
}

// ============================================================================
// Turning Angle
// ============================================================================

/**
 * Calculate the turning angle (δ) for a hyperbolic flyby.
 *
 * The turning angle is how much the trajectory bends around the planet.
 * It depends on the periapsis distance and approach velocity.
 *
 * Formula: δ = 2 × arcsin(1 / (1 + r_p × v∞² / μ))
 *
 * @param {number} vInfinity - Hyperbolic excess velocity (AU/day)
 * @param {number} periapsis - Periapsis distance (AU)
 * @param {number} mu - Gravitational parameter of planet (AU³/day²)
 * @returns {number} Turning angle in radians
 */
export function getTurningAngle(vInfinity, periapsis, mu) {
    // Guard against zero velocity
    if (vInfinity < 1e-15) {
        return 0;
    }

    // Formula: δ = 2 × arcsin(1 / (1 + r_p × v∞² / μ))
    const ratio = periapsis * vInfinity * vInfinity / mu;
    const argument = 1 / (1 + ratio);

    // Clamp to valid arcsin domain [-1, 1]
    const clampedArg = Math.max(-1, Math.min(1, argument));

    return 2 * Math.asin(clampedArg);
}

// ============================================================================
// Gravity Assist Prediction
// ============================================================================

/**
 * Predict the exit velocity and ΔV from a gravity assist flyby.
 *
 * This is a simplified 2D implementation that assumes:
 * - Approach is in the plane of the planet's orbit
 * - Periapsis is at the optimal location for the maneuver type
 *
 * @param {Object} vApproach - Ship velocity before flyby {vx, vy, vz} in AU/day (heliocentric)
 * @param {number} rPeriapsis - Periapsis distance in AU
 * @param {Object} vPlanet - Planet velocity {vx, vy, vz} in AU/day (heliocentric)
 * @param {number} mu - Gravitational parameter of planet (AU³/day²)
 * @returns {Object} {vExit: {vx, vy, vz}, deltaV: number, turningAngle: number}
 */
export function predictGravityAssist(vApproach, rPeriapsis, vPlanet, mu) {
    // 1. Convert to planet-relative frame
    const vRel = {
        vx: vApproach.vx - vPlanet.vx,
        vy: vApproach.vy - vPlanet.vy,
        vz: vApproach.vz - vPlanet.vz
    };

    // 2. Compute v∞ magnitude
    const vInfinity = Math.sqrt(vRel.vx * vRel.vx + vRel.vy * vRel.vy + vRel.vz * vRel.vz);

    if (vInfinity < 1e-15) {
        // No relative velocity, no gravity assist
        return {
            vExit: { ...vApproach },
            deltaV: 0,
            turningAngle: 0
        };
    }

    // 3. Compute turning angle
    const delta = getTurningAngle(vInfinity, rPeriapsis, mu);

    // 4. Rotate v∞ vector by turning angle
    // Simplified 2D: rotate in the plane perpendicular to approach
    // For trailing flyby (ship slower than planet): rotate forward
    // For leading flyby (ship faster than planet): rotate backward

    // Determine rotation direction based on approach geometry
    // Simplified: assume rotation in xy-plane
    const cosD = Math.cos(delta);
    const sinD = Math.sin(delta);

    // Rotate the relative velocity vector
    // This is a simplification - in 3D, we'd need to compute the rotation axis
    const vRelRotated = {
        vx: vRel.vx * cosD - vRel.vy * sinD,
        vy: vRel.vx * sinD + vRel.vy * cosD,
        vz: vRel.vz // z-component unchanged in 2D rotation
    };

    // 5. Convert back to heliocentric frame
    const vExit = {
        vx: vRelRotated.vx + vPlanet.vx,
        vy: vRelRotated.vy + vPlanet.vy,
        vz: vRelRotated.vz + vPlanet.vz
    };

    // 6. Compute ΔV magnitude
    const dvx = vExit.vx - vApproach.vx;
    const dvy = vExit.vy - vApproach.vy;
    const dvz = vExit.vz - vApproach.vz;
    const deltaVMag = Math.sqrt(dvx * dvx + dvy * dvy + dvz * dvz);

    return {
        vExit: vExit,
        deltaV: deltaVMag,
        turningAngle: delta
    };
}

// ============================================================================
// Asymptotic Angle
// ============================================================================

/**
 * Calculate the asymptotic angle (angle from periapsis to asymptote).
 *
 * For hyperbolic orbits, the trajectory approaches/departs at a specific
 * angle from the periapsis direction.
 *
 * Formula: ν_max = arccos(-1/e)
 *
 * @param {number} eccentricity - Orbital eccentricity (must be >= 1)
 * @returns {number} Asymptotic angle in radians
 */
export function getAsymptoticAngle(eccentricity) {
    if (eccentricity < 1.0) {
        return 0; // No asymptote for elliptic orbits
    }

    return Math.acos(-1 / eccentricity);
}

// ============================================================================
// B-Plane Targeting (Stub for future implementation)
// ============================================================================

/**
 * Calculate the B-plane impact parameter for a flyby.
 *
 * The B-plane is perpendicular to the approach velocity, and the
 * impact parameter B determines how close the trajectory passes to the planet.
 *
 * Formula: B² = r_p² + 2r_p μ/v∞²
 *
 * @param {number} vInfinity - Hyperbolic excess velocity (AU/day)
 * @param {number} periapsis - Periapsis distance (AU)
 * @param {number} mu - Gravitational parameter (AU³/day²)
 * @returns {number} Impact parameter B in AU
 */
export function getBPlane(vInfinity, periapsis, mu) {
    const rp2 = periapsis * periapsis;
    const term2 = 2 * periapsis * mu / (vInfinity * vInfinity);
    return Math.sqrt(rp2 + term2);
}
