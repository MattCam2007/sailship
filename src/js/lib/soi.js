/**
 * Sphere of Influence (SOI) Mechanics Library
 *
 * Handles detection of SOI boundaries and conversion between
 * heliocentric and planetocentric reference frames using the
 * "patched conics" approach.
 *
 * When a ship crosses an SOI boundary, its orbital elements are
 * converted to the new reference frame's gravitational parameter.
 */

import { MU_SUN } from './orbital.js';
import { SOI_RADII, GRAVITATIONAL_PARAMS } from '../config.js';

console.log('[SOI] Module loaded');

// Debug flag for verbose stateToElements logging
let soiDebugEnabled = false;
export function setSOIDebug(enabled) {
    soiDebugEnabled = enabled;
    console.log(`SOI debug logging: ${enabled ? 'ENABLED' : 'DISABLED'}`);
}
if (typeof window !== 'undefined') {
    window.setSOIDebug = setSOIDebug;
}

// ============================================================================
// SOI Radius and Gravitational Parameter Lookups
// ============================================================================

/**
 * Get the SOI radius for a celestial body.
 *
 * @param {string} bodyName - Name of the body (e.g., 'EARTH', 'MARS')
 * @returns {number} SOI radius in AU, or 0 if body has no SOI
 */
export function getSOIRadius(bodyName) {
    return SOI_RADII[bodyName] || 0;
}

/**
 * Get the gravitational parameter (μ) for a body.
 *
 * @param {string} bodyName - Name of the body
 * @returns {number} Gravitational parameter in AU³/day²
 */
export function getGravitationalParam(bodyName) {
    if (bodyName === 'SUN') {
        return MU_SUN;
    }
    // GRAVITATIONAL_PARAMS uses lowercase keys
    const key = bodyName.toLowerCase();
    return GRAVITATIONAL_PARAMS[key] || MU_SUN;
}

// ============================================================================
// SOI Boundary Detection
// ============================================================================

/**
 * Check if a ship has entered any planetary SOI.
 *
 * When multiple SOIs overlap, chooses the dominant one (largest μ/r²).
 *
 * @param {Object} shipPos - Ship position {x, y, z} in heliocentric frame (AU)
 * @param {Array} bodies - Array of celestial body objects with positions
 * @returns {Object|null} {body: name, distance: AU, soiRadius: AU} if inside SOI, null otherwise
 */
export function checkSOIEntry(shipPos, bodies) {
    const overlappingSOIs = [];

    // Collect all overlapping SOIs
    for (const body of bodies) {
        const soiRadius = getSOIRadius(body.name);
        if (soiRadius <= 0) continue;

        const dx = shipPos.x - body.x;
        const dy = shipPos.y - body.y;
        const dz = shipPos.z - body.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (distance < soiRadius) {
            const mu = getGravitationalParam(body.name);
            const gravityStrength = mu / (distance * distance); // μ/r²

            overlappingSOIs.push({
                body: body.name,
                distance: distance,
                soiRadius: soiRadius,
                gravityStrength: gravityStrength
            });
        }
    }

    // No SOI detected
    if (overlappingSOIs.length === 0) {
        return null;
    }

    // Single SOI - return it
    if (overlappingSOIs.length === 1) {
        return overlappingSOIs[0];
    }

    // Multiple SOIs - choose dominant one (largest μ/r²)
    overlappingSOIs.sort((a, b) => b.gravityStrength - a.gravityStrength);
    const dominant = overlappingSOIs[0];

    console.log(`[SOI] Multiple SOIs detected, choosing ${dominant.body} (dominant gravity)`);
    console.log(`[SOI]   Candidates: ${overlappingSOIs.map(s => `${s.body} (${s.gravityStrength.toExponential(2)})`).join(', ')}`);

    return dominant;
}

/**
 * Check if a ship should exit its current SOI.
 *
 * Uses a small hysteresis factor (1.01x) to prevent rapid cycling
 * at the SOI boundary.
 *
 * @param {Object} shipPosRelative - Ship position relative to SOI parent {x, y, z}
 * @param {string} parentBody - Name of current SOI parent body
 * @returns {boolean} True if ship should exit SOI
 */
export function checkSOIExit(shipPosRelative, parentBody) {
    const soiRadius = getSOIRadius(parentBody);
    if (soiRadius <= 0) return true;

    const distance = Math.sqrt(
        shipPosRelative.x * shipPosRelative.x +
        shipPosRelative.y * shipPosRelative.y +
        shipPosRelative.z * shipPosRelative.z
    );

    // Exit at 1.01x SOI radius for hysteresis
    return distance > soiRadius * 1.01;
}

// ============================================================================
// Reference Frame Conversions
// ============================================================================

/**
 * Convert heliocentric state to planetocentric state.
 *
 * @param {Object} shipPosHelio - Ship position in heliocentric frame {x, y, z}
 * @param {Object} shipVelHelio - Ship velocity in heliocentric frame {vx, vy, vz}
 * @param {Object} planetPosHelio - Planet position in heliocentric frame
 * @param {Object} planetVelHelio - Planet velocity in heliocentric frame
 * @returns {Object} {pos: {x,y,z}, vel: {vx,vy,vz}} in planetocentric frame
 */
export function helioToPlanetocentric(shipPosHelio, shipVelHelio, planetPosHelio, planetVelHelio) {
    return {
        pos: {
            x: shipPosHelio.x - planetPosHelio.x,
            y: shipPosHelio.y - planetPosHelio.y,
            z: shipPosHelio.z - planetPosHelio.z
        },
        vel: {
            vx: shipVelHelio.vx - planetVelHelio.vx,
            vy: shipVelHelio.vy - planetVelHelio.vy,
            vz: shipVelHelio.vz - planetVelHelio.vz
        }
    };
}

/**
 * Convert planetocentric state to heliocentric state.
 *
 * @param {Object} shipPosPlanet - Ship position relative to planet {x, y, z}
 * @param {Object} shipVelPlanet - Ship velocity relative to planet {vx, vy, vz}
 * @param {Object} planetPosHelio - Planet position in heliocentric frame
 * @param {Object} planetVelHelio - Planet velocity in heliocentric frame
 * @returns {Object} {pos: {x,y,z}, vel: {vx,vy,vz}} in heliocentric frame
 */
export function planetocentricToHelio(shipPosPlanet, shipVelPlanet, planetPosHelio, planetVelHelio) {
    return {
        pos: {
            x: shipPosPlanet.x + planetPosHelio.x,
            y: shipPosPlanet.y + planetPosHelio.y,
            z: shipPosPlanet.z + planetPosHelio.z
        },
        vel: {
            vx: shipVelPlanet.vx + planetVelHelio.vx,
            vy: shipVelPlanet.vy + planetVelHelio.vy,
            vz: shipVelPlanet.vz + planetVelHelio.vz
        }
    };
}

// ============================================================================
// State Vector to Orbital Elements Conversion
// ============================================================================

/**
 * Convert Cartesian state vector (position + velocity) to Keplerian orbital elements.
 *
 * This is the inverse of getPosition/getVelocity from orbital.js.
 * Essential for SOI transitions where we need to compute new orbital
 * elements after converting to a new reference frame.
 *
 * Supports both elliptic (e < 1) and hyperbolic (e >= 1) orbits.
 *
 * Uses the standard algorithm:
 * 1. Compute orbital energy to get semi-major axis (vis-viva equation)
 * 2. Compute angular momentum vector
 * 3. Compute eccentricity vector
 * 4. Derive inclination, RAAN, argument of periapsis, true anomaly
 * 5. Convert true anomaly to mean anomaly (using appropriate equation for orbit type)
 *
 * @param {Object} pos - Position {x, y, z} in AU
 * @param {Object} vel - Velocity {vx, vy, vz} in AU/day
 * @param {number} mu - Gravitational parameter of parent body (AU³/day²)
 * @param {number} epoch - Julian date for the new elements
 * @returns {Object} Orbital elements {a, e, i, Ω, ω, M0, epoch, μ}
 */
export function stateToElements(pos, vel, mu, epoch) {
    // Position and velocity magnitudes
    const r = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
    const v2 = vel.vx * vel.vx + vel.vy * vel.vy + vel.vz * vel.vz;

    // DEBUG: Log input state vector (gated)
    const vMag = Math.sqrt(v2);
    const vKmS = vMag * 1731.46; // Convert AU/day to km/s
    if (soiDebugEnabled) {
        console.log(`[stateToElements] INPUT: pos=(${pos.x.toFixed(6)}, ${pos.y.toFixed(6)}, ${pos.z.toFixed(6)}) AU, r=${r.toFixed(6)} AU`);
        console.log(`[stateToElements] INPUT: vel=(${vel.vx.toFixed(6)}, ${vel.vy.toFixed(6)}, ${vel.vz.toFixed(6)}) AU/day, v=${vKmS.toFixed(2)} km/s`);
        console.log(`[stateToElements] INPUT: mu=${mu.toExponential(4)} AU³/day²`);
    }

    // Specific angular momentum: h = r × v
    const hx = pos.y * vel.vz - pos.z * vel.vy;
    const hy = pos.z * vel.vx - pos.x * vel.vz;
    const hz = pos.x * vel.vy - pos.y * vel.vx;
    const h = Math.sqrt(hx * hx + hy * hy + hz * hz);

    // DEBUG: Log angular momentum (critical for orbit direction)
    if (soiDebugEnabled) {
        console.log(`[stateToElements] ANGULAR MOMENTUM: h=(${hx.toFixed(6)}, ${hy.toFixed(6)}, ${hz.toFixed(6)}), |h|=${h.toFixed(6)}`);
        console.log(`[stateToElements] ANGULAR MOMENTUM: h_z ${hz > 0 ? '> 0 → PROGRADE' : hz < 0 ? '< 0 → RETROGRADE' : '= 0 → EQUATORIAL'}`);
    }

    // Node vector: n = k × h (where k = [0,0,1])
    const nx = -hy;
    const ny = hx;
    const n = Math.sqrt(nx * nx + ny * ny);

    // Semi-major axis from vis-viva equation: v² = μ(2/r - 1/a)
    // Solving for a: a = -μ / (2 * energy)
    // For elliptic orbits: energy < 0, so a > 0
    // For hyperbolic orbits: energy > 0, so a < 0
    const energy = v2 / 2 - mu / r;  // Specific orbital energy

    // DEBUG: Log orbital energy - determines if orbit is bound
    if (soiDebugEnabled) {
        const escapeVel = Math.sqrt(2 * mu / r);
        const escapeVelKmS = escapeVel * 1731.46;
        console.log(`[stateToElements] ENERGY: specific energy=${energy.toExponential(4)}, escape vel at r=${escapeVelKmS.toFixed(2)} km/s`);
        console.log(`[stateToElements] ENERGY: ${energy < 0 ? 'BOUND (elliptical)' : energy > 0 ? 'UNBOUND (hyperbolic)' : 'PARABOLIC'}`);
    }

    let a;
    if (Math.abs(energy) < 1e-15) {
        // Near-parabolic: use very large semi-major axis
        a = r * 1000;  // Approximate with large value
    } else {
        a = -mu / (2 * energy);
        // a is negative for hyperbolic (energy > 0), positive for elliptic (energy < 0)
    }

    // Eccentricity vector: e = (v × h)/μ - r̂
    // Or equivalently: e = ((v² - μ/r)r - (r·v)v) / μ
    const rdotv = pos.x * vel.vx + pos.y * vel.vy + pos.z * vel.vz;
    const coeff1 = v2 / mu - 1 / r;
    const coeff2 = rdotv / mu;
    const ex = coeff1 * pos.x - coeff2 * vel.vx;
    const ey = coeff1 * pos.y - coeff2 * vel.vy;
    const ez = coeff1 * pos.z - coeff2 * vel.vz;
    let e = Math.sqrt(ex * ex + ey * ey + ez * ez);

    // No longer clamping eccentricity - hyperbolic orbits (e >= 1) are now supported!
    // Only clamp to minimum for numerical stability with circular orbits
    e = Math.max(0, e);

    // FM7 FIX: Parabolic orbits (e = 1 exactly) cause division by zero in Kepler solvers.
    // Nudge exactly-parabolic orbits slightly hyperbolic to avoid singularity.
    // This is physically reasonable: true parabolic orbits are infinitely rare.
    if (e >= 0.9999 && e <= 1.0001) {
        e = e < 1 ? 0.9999 : 1.0001;
    }

    // Determine if orbit is hyperbolic
    const isHyperbolic = e >= 1;

    // Inclination: cos(i) = h_z / |h|
    let i = 0;
    if (h > 1e-15) {
        i = Math.acos(clamp(hz / h, -1, 1));
    }

    // Longitude of ascending node (Ω)
    let Omega = 0;
    if (n > 1e-10) {
        Omega = Math.acos(clamp(nx / n, -1, 1));
        if (ny < 0) {
            Omega = 2 * Math.PI - Omega;
        }
    }

    // Argument of periapsis (ω)
    let omega = 0;
    if (e > 1e-10 && n > 1e-10) {
        const edotn = (ex * nx + ey * ny) / (e * n);
        omega = Math.acos(clamp(edotn, -1, 1));
        if (ez < 0) {
            omega = 2 * Math.PI - omega;
        }
    } else if (e > 1e-10) {
        // Equatorial orbit: measure ω from x-axis
        omega = Math.atan2(ey, ex);
        if (omega < 0) omega += 2 * Math.PI;
    }

    // True anomaly (ν)
    // F1 FIX: For hyperbolic orbits, ν can be negative (range is -ν_max to +ν_max)
    let nu = 0;
    if (e > 1e-10) {
        const edotr = (ex * pos.x + ey * pos.y + ez * pos.z) / (e * r);
        nu = Math.acos(clamp(edotr, -1, 1));

        // F1 FIX: Different handling for elliptic vs hyperbolic
        if (isHyperbolic) {
            // Hyperbolic: ν ∈ (-ν_max, +ν_max), negative when approaching periapsis
            if (rdotv < 0) {
                nu = -nu;  // Approaching periapsis
            }
        } else {
            // Elliptic: ν ∈ [0, 2π)
            if (rdotv < 0) {
                nu = 2 * Math.PI - nu;
            }
        }
    } else {
        // Circular orbit: measure from ascending node or x-axis
        if (n > 1e-10) {
            const ndotr = (nx * pos.x + ny * pos.y) / (n * r);
            nu = Math.acos(clamp(ndotr, -1, 1));
            if (pos.z < 0) {
                nu = 2 * Math.PI - nu;
            }
        } else {
            // Equatorial circular: measure from x-axis
            nu = Math.atan2(pos.y, pos.x);
            if (nu < 0) nu += 2 * Math.PI;
        }
    }

    // Convert true anomaly to mean anomaly (depends on orbit type)
    let M0;

    if (isHyperbolic) {
        // Hyperbolic orbit: use hyperbolic anomaly H
        // Formula: tanh(H/2) = sqrt((e-1)/(e+1)) * tan(ν/2)
        const tanNuHalf = Math.tan(nu / 2);
        const factor = Math.sqrt((e - 1) / (e + 1));
        let tanhHalf = factor * tanNuHalf;

        // FM1 FIX: Clamp to valid atanh domain
        const ATANH_LIMIT = 0.9999999;
        if (Math.abs(tanhHalf) >= ATANH_LIMIT) {
            if (soiDebugEnabled) {
                console.warn(`[stateToElements] True anomaly near asymptote, clamping atanh input`);
            }
            tanhHalf = Math.sign(tanhHalf) * ATANH_LIMIT;
        }

        const H = 2 * Math.atanh(tanhHalf);

        // Hyperbolic Kepler equation: M = e*sinh(H) - H
        M0 = e * Math.sinh(H) - H;
        // M0 can be any real number for hyperbolic orbits (not normalized)

    } else {
        // Elliptic orbit: use eccentric anomaly E
        let E;
        if (e < 1e-10) {
            E = nu;
        } else {
            const cosNu = Math.cos(nu);
            const sinNu = Math.sin(nu);
            E = Math.atan2(
                Math.sqrt(1 - e * e) * sinNu,
                e + cosNu
            );
        }

        // Elliptic Kepler equation: M = E - e*sin(E)
        M0 = E - e * Math.sin(E);
        // Normalize to [0, 2π) for elliptic orbits
        if (M0 < 0) M0 += 2 * Math.PI;
        if (M0 >= 2 * Math.PI) M0 -= 2 * Math.PI;
    }

    // Semi-major axis handling:
    // - For elliptic: a > 0, apply minimum threshold
    // - For hyperbolic: a < 0, preserve sign, apply minimum magnitude
    let finalA;
    if (isHyperbolic) {
        // Hyperbolic: a should be negative
        // Apply minimum magnitude (1e-6 AU for planetary SOIs, 1e-4 AU otherwise)
        const minMagnitude = Math.abs(a) < 0.001 ? 1e-6 : 1e-4;
        finalA = Math.sign(a) * Math.max(Math.abs(a), minMagnitude);
        if (finalA > 0) finalA = -minMagnitude;  // Ensure negative for hyperbolic
    } else {
        // Elliptic: a should be positive
        finalA = Math.max(1e-6, a);
        if (!isFinite(finalA) || finalA <= 0) {
            finalA = r;  // Fallback to current radius
        }
    }

    const result = {
        a: finalA,
        e: e,
        i: i,
        Ω: Omega,
        ω: omega,
        M0: M0,
        epoch: epoch,
        μ: mu
    };

    // DEBUG: Log computed orbital elements (gated)
    if (soiDebugEnabled) {
        const iDeg = i * 180 / Math.PI;
        const OmegaDeg = Omega * 180 / Math.PI;
        const omegaDeg = omega * 180 / Math.PI;
        const nuDeg = nu * 180 / Math.PI;
        const periapsis = Math.abs(result.a) * (1 - result.e);
        const apoapsis = isHyperbolic ? Infinity : result.a * (1 + result.e);
        console.log(`[stateToElements] OUTPUT: a=${result.a.toFixed(6)} AU, e=${result.e.toFixed(4)}, i=${iDeg.toFixed(2)}° [${isHyperbolic ? 'HYPERBOLIC' : 'ELLIPTIC'}]`);
        console.log(`[stateToElements] OUTPUT: Ω=${OmegaDeg.toFixed(2)}°, ω=${omegaDeg.toFixed(2)}°, ν=${nuDeg.toFixed(2)}°, M0=${(M0*180/Math.PI).toFixed(2)}°`);
        console.log(`[stateToElements] OUTPUT: periapsis=${periapsis.toFixed(6)} AU, apoapsis=${isHyperbolic ? '∞' : apoapsis.toFixed(6) + ' AU'}`);
        console.log(`[stateToElements] DIRECTION: r·v=${rdotv.toFixed(6)} (${rdotv > 0 ? 'OUTBOUND' : 'INBOUND'})`);
    }

    return result;
}

/**
 * Clamp a value between min and max.
 * @param {number} val - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}
