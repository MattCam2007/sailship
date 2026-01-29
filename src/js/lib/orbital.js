/**
 * Keplerian Orbital Mechanics Library
 * 
 * A pure function library for computing positions and velocities of bodies
 * in Keplerian orbits. No state, no side effects, no dependencies.
 * 
 * Units: AU (Astronomical Units) for distance, days for time, radians for angles.
 * 
 * Orbital Elements Object Shape:
 * {
 *   a: number,      // semi-major axis (AU)
 *   e: number,      // eccentricity (0-1 for ellipses)
 *   i: number,      // inclination (radians)
 *   Ω: number,      // longitude of ascending node (radians)
 *   ω: number,      // argument of periapsis (radians)
 *   M0: number,     // mean anomaly at epoch (radians)
 *   epoch: number,  // Julian date of epoch
 *   μ: number       // gravitational parameter of parent body (AU³/day²)
 * }
 */

// ============================================================================
// Constants
// ============================================================================

/**
 * Sun's gravitational parameter in AU³/day²
 * Derived from: μ = GM where G*M_sun = 1.32712440018e20 m³/s²
 * Converted: 1 AU = 1.495978707e11 m, 1 day = 86400 s
 * μ = 1.32712440018e20 / (1.495978707e11)³ * (86400)² ≈ 2.9591220828559093e-4
 */
export const MU_SUN = 2.9591220828559093e-4;

/**
 * Julian date of J2000.0 epoch (January 1, 2000, 12:00 TT)
 */
export const J2000 = 2451545.0;

// ============================================================================
// Core Formula Functions
// ============================================================================

/**
 * Calculate mean motion (average angular velocity) of an orbiting body.
 *
 * Formula: n = √(μ / |a|³)
 *
 * For hyperbolic orbits (a < 0), we use the absolute value of a.
 *
 * @param {number} a - Semi-major axis (AU), negative for hyperbolic orbits
 * @param {number} μ - Gravitational parameter of central body (AU³/day²)
 * @returns {number} Mean motion (radians/day)
 */
export function meanMotion(a, μ) {
    const absA = Math.abs(a);
    return Math.sqrt(μ / (absA * absA * absA));
}

/**
 * Propagate mean anomaly forward (or backward) in time.
 *
 * Formula: M = M0 + n * Δt
 *
 * For elliptic orbits, the result is normalized to [0, 2π).
 * For hyperbolic orbits, mean anomaly is not periodic and can be any real number.
 *
 * @param {number} M0 - Mean anomaly at epoch (radians)
 * @param {number} n - Mean motion (radians/day)
 * @param {number} deltaTime - Time elapsed since epoch (days)
 * @param {boolean} [isHyperbolic=false] - True for hyperbolic orbits (skip normalization)
 * @returns {number} Mean anomaly at new time (radians)
 */
export function propagateMeanAnomaly(M0, n, deltaTime, isHyperbolic = false) {
    let M = M0 + n * deltaTime;

    if (!isHyperbolic) {
        // Normalize to [0, 2π) for elliptic orbits only
        M = M % (2 * Math.PI);
        if (M < 0) M += 2 * Math.PI;
    }
    // For hyperbolic orbits, M can be any real number (negative = approaching, positive = departing)

    return M;
}

/**
 * Solve Kepler's equation for eccentric anomaly using Newton-Raphson iteration.
 * 
 * Kepler's Equation: M = E - e * sin(E)
 * 
 * Given mean anomaly M and eccentricity e, find eccentric anomaly E.
 * Uses Newton-Raphson: E_{n+1} = E_n - (E_n - e*sin(E_n) - M) / (1 - e*cos(E_n))
 * 
 * @param {number} M - Mean anomaly (radians)
 * @param {number} e - Eccentricity (0 to <1 for ellipses)
 * @param {number} [tolerance=1e-12] - Convergence tolerance (radians)
 * @returns {number} Eccentric anomaly E (radians)
 */
export function solveKepler(M, e, tolerance = 1e-12) {
    // Short-circuit for circular orbits (e ≈ 0)
    if (e < 1e-10) {
        return M;
    }
    
    // Initial guess: E = M for low eccentricity, E = π for high eccentricity
    let E = e < 0.8 ? M : Math.PI;
    
    // Newton-Raphson iteration
    const maxIterations = 50;
    for (let i = 0; i < maxIterations; i++) {
        const sinE = Math.sin(E);
        const cosE = Math.cos(E);
        const f = E - e * sinE - M;
        const fPrime = 1 - e * cosE;
        
        const delta = f / fPrime;
        E -= delta;
        
        if (Math.abs(delta) < tolerance) {
            return E;
        }
    }
    
    // If we didn't converge, return best estimate
    // (This shouldn't happen for valid inputs)
    return E;
}

/**
 * Convert eccentric anomaly to true anomaly.
 * 
 * Formula: tan(ν/2) = √((1+e)/(1-e)) * tan(E/2)
 * 
 * Or equivalently using atan2 for numerical stability:
 * ν = atan2(√(1-e²) * sin(E), cos(E) - e)
 * 
 * @param {number} E - Eccentric anomaly (radians)
 * @param {number} e - Eccentricity (0 to <1 for ellipses)
 * @returns {number} True anomaly ν (radians)
 */
export function eccentricToTrueAnomaly(E, e) {
    // Short-circuit for circular orbits
    if (e < 1e-10) {
        return E;
    }
    
    const cosE = Math.cos(E);
    const sinE = Math.sin(E);
    
    // Using atan2 formulation for numerical stability
    const y = Math.sqrt(1 - e * e) * sinE;
    const x = cosE - e;
    
    return Math.atan2(y, x);
}

// ============================================================================
// Hyperbolic Orbit Functions
// ============================================================================

/**
 * Solve the hyperbolic Kepler equation for hyperbolic anomaly.
 *
 * Hyperbolic Kepler Equation: M = e*sinh(H) - H
 *
 * Uses Newton-Raphson iteration with a good initial guess.
 *
 * @param {number} M - Mean anomaly (can be any real number for hyperbolic)
 * @param {number} e - Eccentricity (must be > 1)
 * @param {number} [tolerance=1e-12] - Convergence tolerance
 * @returns {number} Hyperbolic anomaly H
 */
export function solveKeplerHyperbolic(M, e, tolerance = 1e-12) {
    // Initial guess: use asinh for better convergence
    // For small M: H ≈ M / (e - 1)
    // For large M: H ≈ sign(M) * ln(2|M|/e)
    let H;
    if (Math.abs(M) < 1) {
        H = M / (e - 1);  // Series approximation for small M
    } else {
        H = Math.sign(M) * Math.log(2 * Math.abs(M) / e);
    }

    const maxIterations = 50;
    let prevDelta = Infinity;

    for (let i = 0; i < maxIterations; i++) {
        const sinhH = Math.sinh(H);
        const coshH = Math.cosh(H);
        const f = e * sinhH - H - M;
        const fPrime = e * coshH - 1;

        // Guard against division by near-zero
        if (Math.abs(fPrime) < 1e-15) {
            break;
        }

        const delta = f / fPrime;

        // Check for divergence and switch to bisection if needed
        if (Math.abs(delta) > Math.abs(prevDelta) * 2) {
            // Damped step to prevent oscillation
            H -= delta * 0.5;
        } else {
            H -= delta;
        }

        if (Math.abs(delta) < tolerance) {
            return H;
        }
        prevDelta = delta;
    }

    return H;
}

/**
 * Convert hyperbolic anomaly to true anomaly.
 *
 * Formula: tan(ν/2) = sqrt((e+1)/(e-1)) * tanh(H/2)
 *
 * @param {number} H - Hyperbolic anomaly
 * @param {number} e - Eccentricity (must be > 1)
 * @returns {number} True anomaly ν (radians), in range (-ν_max, +ν_max)
 */
export function hyperbolicToTrueAnomaly(H, e) {
    const tanhHalf = Math.tanh(H / 2);
    const factor = Math.sqrt((e + 1) / (e - 1));
    const tanNuHalf = factor * tanhHalf;
    return 2 * Math.atan(tanNuHalf);
}

/**
 * Convert true anomaly to hyperbolic anomaly.
 *
 * Formula: tanh(H/2) = sqrt((e-1)/(e+1)) * tan(ν/2)
 *
 * Includes FM1 fix: handles asymptotic angles safely.
 *
 * @param {number} ν - True anomaly (radians)
 * @param {number} e - Eccentricity (must be > 1)
 * @returns {number} Hyperbolic anomaly H
 */
export function trueToHyperbolicAnomaly(ν, e) {
    const tanNuHalf = Math.tan(ν / 2);
    const factor = Math.sqrt((e - 1) / (e + 1));
    let tanhHalf = factor * tanNuHalf;

    // FM1 fix: Clamp to valid atanh domain with warning
    // |tanh| must be < 1 for atanh to be defined
    const ATANH_LIMIT = 0.9999999;
    if (Math.abs(tanhHalf) >= ATANH_LIMIT) {
        console.warn(`[ORBITAL] True anomaly near asymptote limit, clamping atanh input`);
        tanhHalf = Math.sign(tanhHalf) * ATANH_LIMIT;
    }

    return 2 * Math.atanh(tanhHalf);
}

/**
 * Get the maximum true anomaly for a hyperbolic orbit.
 *
 * Beyond this angle, the hyperbola doesn't exist (asymptote).
 * Formula: ν_max = arccos(-1/e)
 *
 * @param {number} e - Eccentricity (must be > 1)
 * @returns {number} Maximum true anomaly in radians
 */
export function getHyperbolicTrueAnomalyLimit(e) {
    return Math.acos(-1 / e);
}

// ============================================================================
// Orbit Classification
// ============================================================================

/**
 * Determine the type of orbit based on eccentricity.
 *
 * @param {number} e - Eccentricity
 * @returns {string} 'circular', 'elliptic', 'parabolic', or 'hyperbolic'
 */
export function getOrbitType(e) {
    if (e < 1e-6) return 'circular';
    if (e < 0.9999) return 'elliptic';
    if (e < 1.0001) return 'parabolic';
    return 'hyperbolic';
}

/**
 * Check if an orbit is hyperbolic (unbound).
 *
 * @param {number} e - Eccentricity
 * @returns {boolean} True if e >= 1
 */
export function isHyperbolic(e) {
    return e >= 1;
}

// ============================================================================
// Radius and Position Functions
// ============================================================================

/**
 * Calculate orbital radius (distance from focus) at a given true anomaly.
 * 
 * Formula: r = a(1 - e²) / (1 + e * cos(ν))
 * 
 * This is the polar equation of an ellipse with the focus at the origin.
 * 
 * @param {number} a - Semi-major axis (AU)
 * @param {number} e - Eccentricity (0 to <1 for ellipses)
 * @param {number} trueAnomaly - True anomaly ν (radians)
 * @returns {number} Distance from focus (AU)
 */
export function orbitalRadius(a, e, trueAnomaly) {
    // For circular orbits, r = a always
    if (e < 1e-10) {
        return a;
    }
    
    const p = a * (1 - e * e);  // Semi-latus rectum
    return p / (1 + e * Math.cos(trueAnomaly));
}

/**
 * Calculate 2D position in the orbital plane.
 * 
 * The orbital plane has:
 * - x-axis pointing toward periapsis
 * - y-axis perpendicular, in the direction of orbital motion at periapsis
 * - Origin at the central body (focus)
 * 
 * Formula:
 *   x = r * cos(ν)
 *   y = r * sin(ν)
 * 
 * @param {number} r - Orbital radius (AU)
 * @param {number} trueAnomaly - True anomaly ν (radians)
 * @returns {{x: number, y: number}} Position in orbital plane (AU)
 */
export function positionInOrbitalPlane(r, trueAnomaly) {
    return {
        x: r * Math.cos(trueAnomaly),
        y: r * Math.sin(trueAnomaly)
    };
}

/**
 * Rotate a position from the orbital plane to the ecliptic reference frame.
 * 
 * Applies three rotations in sequence:
 * 1. Rotate by ω (argument of periapsis) around z-axis
 * 2. Rotate by i (inclination) around x-axis
 * 3. Rotate by Ω (longitude of ascending node) around z-axis
 * 
 * Combined rotation matrix R = Rz(Ω) * Rx(i) * Rz(ω)
 * 
 * For a position (x, y, 0) in the orbital plane:
 *   X = x*(cos(Ω)cos(ω) - sin(Ω)sin(ω)cos(i)) - y*(cos(Ω)sin(ω) + sin(Ω)cos(ω)cos(i))
 *   Y = x*(sin(Ω)cos(ω) + cos(Ω)sin(ω)cos(i)) - y*(sin(Ω)sin(ω) - cos(Ω)cos(ω)cos(i))
 *   Z = x*sin(ω)sin(i) + y*cos(ω)sin(i)
 * 
 * @param {{x: number, y: number}} position - Position in orbital plane (AU)
 * @param {number} i - Inclination (radians)
 * @param {number} Ω - Longitude of ascending node (radians)
 * @param {number} ω - Argument of periapsis (radians)
 * @returns {{x: number, y: number, z: number}} Position in ecliptic frame (AU)
 */
export function rotateToEcliptic(position, i, Ω, ω) {
    const { x: xOrbital, y: yOrbital } = position;
    
    const cosΩ = Math.cos(Ω);
    const sinΩ = Math.sin(Ω);
    const cosω = Math.cos(ω);
    const sinω = Math.sin(ω);
    const cosi = Math.cos(i);
    const sini = Math.sin(i);
    
    // Combined rotation matrix elements
    const x = xOrbital * (cosΩ * cosω - sinΩ * sinω * cosi) 
            - yOrbital * (cosΩ * sinω + sinΩ * cosω * cosi);
    
    const y = xOrbital * (sinΩ * cosω + cosΩ * sinω * cosi) 
            - yOrbital * (sinΩ * sinω - cosΩ * cosω * cosi);
    
    const z = xOrbital * (sinω * sini) 
            + yOrbital * (cosω * sini);
    
    return { x, y, z };
}

/**
 * Calculate velocity in the orbital plane.
 * 
 * Using the vis-viva components:
 *   vx = -√(μ/p) * sin(ν)
 *   vy = √(μ/p) * (e + cos(ν))
 * 
 * where p = a(1-e²) is the semi-latus rectum.
 * 
 * @param {number} a - Semi-major axis (AU)
 * @param {number} e - Eccentricity
 * @param {number} μ - Gravitational parameter (AU³/day²)
 * @param {number} trueAnomaly - True anomaly ν (radians)
 * @returns {{vx: number, vy: number}} Velocity in orbital plane (AU/day)
 */
export function velocityInOrbitalPlane(a, e, μ, trueAnomaly) {
    // Semi-latus rectum: p = a(1-e²) for elliptic, p = |a|(e²-1) for hyperbolic
    // For near-parabolic orbits (e ≈ 1), p approaches zero which causes NaN
    let p;
    if (e >= 1) {
        // Hyperbolic orbit: use |a|(e²-1)
        p = Math.abs(a) * (e * e - 1);
    } else {
        // Elliptic orbit: use a(1-e²)
        p = a * (1 - e * e);
    }

    // Clamp semi-latus rectum to avoid division by zero for near-parabolic orbits
    const minP = 1e-12;
    if (p < minP) {
        p = minP;
    }

    const sqrtMuOverP = Math.sqrt(μ / p);

    const sinν = Math.sin(trueAnomaly);
    const cosν = Math.cos(trueAnomaly);

    return {
        vx: -sqrtMuOverP * sinν,
        vy: sqrtMuOverP * (e + cosν)
    };
}

/**
 * Rotate a velocity vector from the orbital plane to the ecliptic reference frame.
 * 
 * Uses the same rotation matrix as rotateToEcliptic.
 * 
 * @param {{vx: number, vy: number}} velocity - Velocity in orbital plane (AU/day)
 * @param {number} i - Inclination (radians)
 * @param {number} Ω - Longitude of ascending node (radians)
 * @param {number} ω - Argument of periapsis (radians)
 * @returns {{vx: number, vy: number, vz: number}} Velocity in ecliptic frame (AU/day)
 */
export function rotateVelocityToEcliptic(velocity, i, Ω, ω) {
    const { vx: vxOrbital, vy: vyOrbital } = velocity;
    
    const cosΩ = Math.cos(Ω);
    const sinΩ = Math.sin(Ω);
    const cosω = Math.cos(ω);
    const sinω = Math.sin(ω);
    const cosi = Math.cos(i);
    const sini = Math.sin(i);
    
    const vx = vxOrbital * (cosΩ * cosω - sinΩ * sinω * cosi) 
             - vyOrbital * (cosΩ * sinω + sinΩ * cosω * cosi);
    
    const vy = vxOrbital * (sinΩ * cosω + cosΩ * sinω * cosi) 
             - vyOrbital * (sinΩ * sinω - cosΩ * cosω * cosi);
    
    const vz = vxOrbital * (sinω * sini) 
             + vyOrbital * (cosω * sini);
    
    return { vx, vy, vz };
}

// ============================================================================
// High-Level Functions
// ============================================================================

/**
 * MAIN ENTRY POINT: Calculate the 3D position of a body in its orbit.
 *
 * Takes orbital elements and a Julian date, returns Cartesian coordinates
 * in the ecliptic reference frame centered on the parent body.
 *
 * Supports both elliptic (e < 1) and hyperbolic (e >= 1) orbits.
 *
 * Steps:
 * 1. Calculate mean motion from semi-major axis and gravitational parameter
 * 2. Propagate mean anomaly from epoch to target date
 * 3. Solve Kepler's equation for eccentric/hyperbolic anomaly
 * 4. Convert anomaly to true anomaly
 * 5. Calculate orbital radius
 * 6. Get position in orbital plane
 * 7. Rotate to ecliptic frame
 *
 * @param {Object} elements - Orbital elements
 * @param {number} elements.a - Semi-major axis (AU), negative for hyperbolic
 * @param {number} elements.e - Eccentricity (0 to <1 for elliptic, >=1 for hyperbolic)
 * @param {number} elements.i - Inclination (radians)
 * @param {number} elements.Ω - Longitude of ascending node (radians)
 * @param {number} elements.ω - Argument of periapsis (radians)
 * @param {number} elements.M0 - Mean anomaly at epoch (radians)
 * @param {number} elements.epoch - Julian date of epoch
 * @param {number} elements.μ - Gravitational parameter (AU³/day²)
 * @param {number} julianDate - Target Julian date
 * @returns {{x: number, y: number, z: number}} Position in ecliptic frame (AU)
 */
export function getPosition(elements, julianDate) {
    const { a, e, i, Ω, ω, M0, epoch, μ } = elements;

    // Time since epoch
    const deltaTime = julianDate - epoch;

    // Step 1: Mean motion (uses |a| internally for hyperbolic)
    const n = meanMotion(a, μ);

    // Determine orbit type
    const hyperbolic = e >= 1;

    let ν;  // True anomaly

    if (hyperbolic) {
        // Hyperbolic orbit
        const M = propagateMeanAnomaly(M0, n, deltaTime, true);
        const H = solveKeplerHyperbolic(M, e);
        ν = hyperbolicToTrueAnomaly(H, e);
    } else {
        // Elliptic orbit
        const M = propagateMeanAnomaly(M0, n, deltaTime, false);
        const E = solveKepler(M, e);
        ν = eccentricToTrueAnomaly(E, e);
    }

    // Step 5: Orbital radius
    const r = orbitalRadius(a, e, ν);

    // Step 6: Position in orbital plane
    const posOrbital = positionInOrbitalPlane(r, ν);

    // Step 7: Rotate to ecliptic frame
    const result = rotateToEcliptic(posOrbital, i, Ω, ω);

    // FM6: Validate result to catch NaN/Infinity
    if (!isFinite(result.x) || !isFinite(result.y) || !isFinite(result.z)) {
        console.error('[ORBITAL] getPosition produced invalid result:', result, 'elements:', elements);
        // Return origin as fallback to prevent crash
        return { x: 0, y: 0, z: 0 };
    }

    return result;
}

/**
 * Calculate the 3D velocity of a body in its orbit.
 *
 * Takes orbital elements and a Julian date, returns velocity vector
 * in the ecliptic reference frame.
 *
 * Supports both elliptic (e < 1) and hyperbolic (e >= 1) orbits.
 *
 * @param {Object} elements - Orbital elements (same as getPosition)
 * @param {number} elements.a - Semi-major axis (AU), negative for hyperbolic
 * @param {number} elements.e - Eccentricity (0 to <1 for elliptic, >=1 for hyperbolic)
 * @param {number} elements.i - Inclination (radians)
 * @param {number} elements.Ω - Longitude of ascending node (radians)
 * @param {number} elements.ω - Argument of periapsis (radians)
 * @param {number} elements.M0 - Mean anomaly at epoch (radians)
 * @param {number} elements.epoch - Julian date of epoch
 * @param {number} elements.μ - Gravitational parameter (AU³/day²)
 * @param {number} julianDate - Target Julian date
 * @returns {{vx: number, vy: number, vz: number}} Velocity in ecliptic frame (AU/day)
 */
export function getVelocity(elements, julianDate) {
    const { a, e, i, Ω, ω, M0, epoch, μ } = elements;

    // Time since epoch
    const deltaTime = julianDate - epoch;

    // Mean motion (uses |a| internally for hyperbolic)
    const n = meanMotion(a, μ);

    // Determine orbit type
    const hyperbolic = e >= 1;

    let ν;  // True anomaly

    if (hyperbolic) {
        // Hyperbolic orbit
        const M = propagateMeanAnomaly(M0, n, deltaTime, true);
        const H = solveKeplerHyperbolic(M, e);
        ν = hyperbolicToTrueAnomaly(H, e);
    } else {
        // Elliptic orbit
        const M = propagateMeanAnomaly(M0, n, deltaTime, false);
        const E = solveKepler(M, e);
        ν = eccentricToTrueAnomaly(E, e);
    }

    // Velocity in orbital plane
    const velOrbital = velocityInOrbitalPlane(a, e, μ, ν);

    // Rotate to ecliptic frame
    const result = rotateVelocityToEcliptic(velOrbital, i, Ω, ω);

    // FM6: Validate result to catch NaN/Infinity
    if (!isFinite(result.vx) || !isFinite(result.vy) || !isFinite(result.vz)) {
        console.error('[ORBITAL] getVelocity produced invalid result:', result, 'elements:', elements);
        // Return zero velocity as fallback to prevent crash
        return { vx: 0, vy: 0, vz: 0 };
    }

    return result;
}

// ============================================================================
// Orbital Geometry Helpers
// ============================================================================

/**
 * Calculate periapsis distance (closest approach to central body).
 *
 * Formula: r_p = |a| × (1 - e)
 *
 * Works for both elliptic (a > 0, e < 1) and hyperbolic (a < 0, e >= 1) orbits.
 *
 * @param {Object} elements - Orbital elements {a, e, ...}
 * @returns {number} Periapsis distance in AU
 */
export function getPeriapsis(elements) {
    const { a, e } = elements;
    return Math.abs(a) * (1 - e);
}

/**
 * Calculate apoapsis distance (farthest point from central body).
 *
 * Formula: r_a = a × (1 + e)
 *
 * For elliptic orbits (e < 1): returns finite distance
 * For hyperbolic orbits (e >= 1): returns Infinity (no apoapsis)
 *
 * @param {Object} elements - Orbital elements {a, e, ...}
 * @returns {number} Apoapsis distance in AU, or Infinity for hyperbolic orbits
 */
export function getApoapsis(elements) {
    const { a, e } = elements;

    // Hyperbolic orbits have no apoapsis
    if (e >= 1.0) {
        return Infinity;
    }

    return a * (1 + e);
}

