/**
 * Orbital Maneuvers Library
 * 
 * A pure function library for calculating thrust effects on Keplerian orbits.
 * Implements solar sail physics and Gauss's variational equations.
 * No state, no side effects, no dependencies except orbital.js.
 * 
 * Units: AU for distance, days for time, radians for angles.
 * 
 * References:
 * - Vallado, D.A. "Fundamentals of Astrodynamics and Applications" (4th ed.)
 * - Battin, R.H. "An Introduction to the Mathematics and Methods of Astrodynamics"
 * - McInnes, C.R. "Solar Sailing: Technology, Dynamics and Mission Applications"
 */

import {
    MU_SUN,
    meanMotion,
    propagateMeanAnomaly,
    solveKepler,
    eccentricToTrueAnomaly,
    orbitalRadius,
    getPosition,
    getVelocity
} from './orbital.js';

import { stateToElements } from './soi.js';

import {
    SOLAR_PRESSURE_1AU,
    ACCEL_CONVERSION,
    TRAJECTORY_ROBUSTNESS,
} from '../config.js';


// Re-export constants for backward compatibility
export { SOLAR_PRESSURE_1AU, ACCEL_CONVERSION };

// ============================================================================
// Solar Sail Physics
// ============================================================================

/**
 * Calculate solar radiation pressure at a given distance from the sun.
 * 
 * Formula: P(r) = P₁ * (1/r)²
 * 
 * Pressure follows inverse square law with distance from the sun.
 * 
 * @param {number} distanceFromSun - Distance from sun in AU
 * @returns {number} Solar radiation pressure in N/m²
 */
export function getSolarPressure(distanceFromSun) {
    const r = Math.max(distanceFromSun, 0.01); // Avoid division by zero
    return SOLAR_PRESSURE_1AU / (r * r);
}

/**
 * Calculate the unit vector pointing from the sun to the ship (radial direction).
 * 
 * This is the direction of incoming sunlight, and the base direction
 * from which sail thrust is calculated.
 * 
 * @param {Object} position - Ship position {x, y, z} in AU
 * @returns {Object} Unit vector {x, y, z} pointing away from sun
 */
export function getSunDirection(position) {
    const r = Math.sqrt(position.x ** 2 + position.y ** 2 + position.z ** 2);
    if (r < 1e-10) {
        return { x: 1, y: 0, z: 0 }; // Default if at origin
    }
    return {
        x: position.x / r,
        y: position.y / r,
        z: position.z / r
    };
}

/**
 * Calculate sail thrust direction in 3D using RTN frame.
 *
 * The thrust direction is computed by:
 * 1. Starting with the radial direction (R, away from sun)
 * 2. Rotating by yaw angle in the orbital plane (toward T)
 * 3. Rotating by pitch angle out of the orbital plane (toward N)
 *
 * The sail can only thrust in directions away from the sun-line.
 * - yaw = 0, pitch = 0: thrust directly away from sun (radial)
 * - yaw = π/4, pitch = 0: thrust at 45° in orbital plane (optimal for orbit raising)
 * - yaw = 0, pitch = π/4: thrust 45° out of orbital plane (changes inclination)
 * - yaw or pitch = π/2: sail edge-on to sun, no thrust
 *
 * @param {Object} shipPosition - Ship position {x, y, z} in AU (ecliptic frame)
 * @param {Object} shipVelocity - Ship velocity {vx, vy, vz} in AU/day (ecliptic frame)
 * @param {number} yawAngle - Yaw angle in radians (in-plane rotation, 0 = face sun)
 * @param {number} pitchAngle - Pitch angle in radians (out-of-plane rotation), default 0
 * @returns {Object} Unit vector {x, y, z} for thrust direction (ecliptic frame)
 */
// Track last known angular momentum direction to detect flips
let lastHDir = null;
let thrustDirDebugEnabled = false;

export function setThrustDirDebug(enabled) {
    thrustDirDebugEnabled = enabled;
    console.log(`[THRUST_DIR] Debug logging: ${enabled ? 'ENABLED' : 'DISABLED'}`);
}
if (typeof window !== 'undefined') {
    window.setThrustDirDebug = setThrustDirDebug;
}

export function getSailThrustDirection(shipPosition, shipVelocity, yawAngle, pitchAngle = 0) {
    // Get the radial unit vector R (pointing away from sun)
    const sunDir = getSunDirection(shipPosition);

    // Compute angular momentum vector: h = r × v
    const hx = shipPosition.y * shipVelocity.vz - shipPosition.z * shipVelocity.vy;
    const hy = shipPosition.z * shipVelocity.vx - shipPosition.x * shipVelocity.vz;
    const hz = shipPosition.x * shipVelocity.vy - shipPosition.y * shipVelocity.vx;
    const hMag = Math.sqrt(hx ** 2 + hy ** 2 + hz ** 2);

    // Normal unit vector N (perpendicular to orbital plane, along h)
    let Nx, Ny, Nz;
    if (hMag > 1e-10) {
        Nx = hx / hMag;
        Ny = hy / hMag;
        Nz = hz / hMag;
    } else {
        // Fallback to ecliptic normal for degenerate orbits
        // This is expected during trajectory prediction when orbit changes significantly
        Nx = 0;
        Ny = 0;
        Nz = 1;
    }

    // Track angular momentum direction for debugging (flip detection removed -
    // flips are expected during trajectory prediction as orbit changes)
    lastHDir = { x: Nx, y: Ny, z: Nz };

    // Transverse unit vector T = N × R (prograde direction in orbital plane)
    const Tx = Ny * sunDir.z - Nz * sunDir.y;
    const Ty = Nz * sunDir.x - Nx * sunDir.z;
    const Tz = Nx * sunDir.y - Ny * sunDir.x;

    // Compute thrust direction with both yaw and pitch rotations
    const cosYaw = Math.cos(yawAngle);
    const sinYaw = Math.sin(yawAngle);
    const cosPitch = Math.cos(pitchAngle);
    const sinPitch = Math.sin(pitchAngle);

    // Step 1: In-plane direction (yaw rotation from R toward T)
    // d_planar = cos(yaw) * R + sin(yaw) * T
    const planarX = cosYaw * sunDir.x + sinYaw * Tx;
    const planarY = cosYaw * sunDir.y + sinYaw * Ty;
    const planarZ = cosYaw * sunDir.z + sinYaw * Tz;

    // Step 2: Add pitch rotation (rotate toward N)
    // d = cos(pitch) * d_planar + sin(pitch) * N
    const result = {
        x: cosPitch * planarX + sinPitch * Nx,
        y: cosPitch * planarY + sinPitch * Ny,
        z: cosPitch * planarZ + sinPitch * Nz
    };

    if (thrustDirDebugEnabled) {
        const yawDeg = (yawAngle * 180 / Math.PI).toFixed(1);
        const pitchDeg = (pitchAngle * 180 / Math.PI).toFixed(1);
        console.log(`[THRUST_DIR] yaw=${yawDeg}° pitch=${pitchDeg}°`);
        console.log(`[THRUST_DIR] h=(${hx.toExponential(3)}, ${hy.toExponential(3)}, ${hz.toExponential(3)}) |h|=${hMag.toExponential(3)}`);
        console.log(`[THRUST_DIR] R=(${sunDir.x.toFixed(4)}, ${sunDir.y.toFixed(4)}, ${sunDir.z.toFixed(4)})`);
        console.log(`[THRUST_DIR] T=(${Tx.toFixed(4)}, ${Ty.toFixed(4)}, ${Tz.toFixed(4)})`);
        console.log(`[THRUST_DIR] N=(${Nx.toFixed(4)}, ${Ny.toFixed(4)}, ${Nz.toFixed(4)})`);
        console.log(`[THRUST_DIR] dir=(${result.x.toFixed(4)}, ${result.y.toFixed(4)}, ${result.z.toFixed(4)})`);
    }

    return result;
}

/**
 * Calculate solar sail thrust vector.
 *
 * The thrust from a solar sail depends on:
 * 1. Solar radiation pressure (decreases with distance²)
 * 2. Sail area and reflectivity
 * 3. Sail angle relative to sunlight
 * 4. Sail deployment and condition
 *
 * Thrust magnitude formula for an ideal flat sail:
 * F = 2 * P * A * cos²(θ) * ρ
 *
 * Where:
 * - P = solar radiation pressure at current distance
 * - A = effective sail area (area * deployment%)
 * - θ = sail angle relative to sun-line
 * - ρ = reflectivity (0-1)
 * - Factor of 2 accounts for reflection (momentum transfer = 2 for perfect reflection)
 *
 * The cos²(θ) factor comes from:
 * - cos(θ) for the projected area facing the sun
 * - cos(θ) for the thrust component in the sail normal direction
 *
 * @param {Object} sailState - Sail state object
 * @param {number} sailState.area - Sail area in m²
 * @param {number} sailState.reflectivity - Reflectivity (0-1)
 * @param {number} sailState.angle - Sail angle in radians (0 = face sun)
 * @param {number} sailState.deploymentPercent - Deployment percentage (0-100)
 * @param {number} sailState.condition - Condition percentage (0-100)
 * @param {Object} shipPosition - Ship position {x, y, z} in AU
 * @param {Object} shipVelocity - Ship velocity {vx, vy, vz} in AU/day
 * @param {number} distanceFromSun - Distance from sun in AU
 * @param {number} shipMass - Ship mass in kg (default 10000 kg for a small sail ship)
 * @returns {Object} Thrust vector {x, y, z} in AU/day²
 */
export function calculateSailThrust(sailState, shipPosition, shipVelocity, distanceFromSun, shipMass = 10000) {
    const {
        area,
        reflectivity,
        angle,              // Yaw angle (in-plane)
        pitchAngle = 0,     // Pitch angle (out-of-plane), default 0 for backward compatibility
        deploymentPercent,
        condition,
        sailCount = 1       // Number of sails (thrust multiplier), default 1
    } = sailState;

    // Calculate effective sail area
    const effectiveArea = area * (deploymentPercent / 100) * (condition / 100);

    // Solar radiation pressure at current distance
    const pressure = getSolarPressure(distanceFromSun);

    // Thrust magnitude: F = 2 * P * A * cos²(yaw) * cos²(pitch) * ρ * sailCount
    // The cos² terms come from projected area * thrust efficiency for each angle
    const cosYaw = Math.cos(angle);
    const cosPitch = Math.cos(pitchAngle);
    const thrustMagnitudeN = 2 * pressure * effectiveArea *
                             cosYaw * cosYaw * cosPitch * cosPitch * reflectivity * sailCount;

    // Convert to acceleration in m/s²
    const accelMS2 = thrustMagnitudeN / shipMass;

    // Convert to AU/day²
    const accelAUDay2 = accelMS2 * ACCEL_CONVERSION;

    // Get thrust direction using both yaw and pitch angles
    const thrustDir = getSailThrustDirection(shipPosition, shipVelocity, angle, pitchAngle);

    // Return thrust vector in AU/day²
    return {
        x: accelAUDay2 * thrustDir.x,
        y: accelAUDay2 * thrustDir.y,
        z: accelAUDay2 * thrustDir.z
    };
}

/**
 * Calculate the characteristic acceleration of a solar sail.
 * 
 * This is the maximum acceleration at 1 AU with sail face-on to the sun.
 * Useful for mission planning and comparing different sail designs.
 * 
 * Formula: a₀ = 2 * P₁ * A * ρ / M
 * 
 * @param {number} area - Sail area in m²
 * @param {number} reflectivity - Reflectivity (0-1)
 * @param {number} mass - Ship mass in kg
 * @returns {number} Characteristic acceleration in AU/day²
 */
export function characteristicAcceleration(area, reflectivity, mass) {
    const thrustN = 2 * SOLAR_PRESSURE_1AU * area * reflectivity;
    const accelMS2 = thrustN / mass;
    return accelMS2 * ACCEL_CONVERSION;
}

// ============================================================================
// Coordinate Frame Transformations
// ============================================================================

/**
 * Convert a thrust vector from ecliptic coordinates to RTN (Radial-Transverse-Normal) frame.
 * 
 * The RTN frame is centered on the spacecraft with:
 * - R (Radial): Points away from the central body (along position vector)
 * - T (Transverse): Perpendicular to R, in the direction of orbital motion
 * - N (Normal): Perpendicular to the orbital plane (R × T)
 * 
 * This is the natural frame for applying Gauss's variational equations.
 * 
 * @param {Object} thrust - Thrust vector in ecliptic frame {x, y, z} in AU/day²
 * @param {Object} position - Position vector {x, y, z} in AU
 * @param {Object} velocity - Velocity vector {vx, vy, vz} in AU/day
 * @returns {Object} Thrust in RTN frame {R, T, N} in AU/day²
 */
export function eclipticToRTN(thrust, position, velocity) {
    // Calculate position magnitude
    const r = Math.sqrt(position.x ** 2 + position.y ** 2 + position.z ** 2);
    
    // Radial unit vector (R)
    const Rx = position.x / r;
    const Ry = position.y / r;
    const Rz = position.z / r;
    
    // Angular momentum vector h = r × v
    const hx = position.y * velocity.vz - position.z * velocity.vy;
    const hy = position.z * velocity.vx - position.x * velocity.vz;
    const hz = position.x * velocity.vy - position.y * velocity.vx;
    const hMag = Math.sqrt(hx ** 2 + hy ** 2 + hz ** 2);
    
    // Normal unit vector (N) = h / |h|
    const Nx = hMag > 1e-10 ? hx / hMag : 0;
    const Ny = hMag > 1e-10 ? hy / hMag : 0;
    const Nz = hMag > 1e-10 ? hz / hMag : 1;
    
    // Transverse unit vector (T) = N × R
    const Tx = Ny * Rz - Nz * Ry;
    const Ty = Nz * Rx - Nx * Rz;
    const Tz = Nx * Ry - Ny * Rx;
    
    // Project thrust onto RTN axes
    const R = thrust.x * Rx + thrust.y * Ry + thrust.z * Rz;
    const T = thrust.x * Tx + thrust.y * Ty + thrust.z * Tz;
    const N = thrust.x * Nx + thrust.y * Ny + thrust.z * Nz;
    
    return { R, T, N };
}

// ============================================================================
// Gauss's Variational Equations
// ============================================================================

/**
 * Apply thrust to modify orbital elements using Gauss's variational equations.
 * 
 * Gauss's variational equations describe how perturbing accelerations
 * affect each orbital element. They are the foundation for low-thrust
 * trajectory optimization.
 * 
 * For thrust components (R = radial, T = transverse, N = normal):
 * 
 * Semi-major axis:
 *   da/dt = (2a²/h) * (e*sin(ν)*R + (p/r)*T)
 * 
 * Eccentricity:
 *   de/dt = (1/h) * (p*sin(ν)*R + ((p+r)*cos(ν) + r*e)*T)
 * 
 * Inclination:
 *   di/dt = (r*cos(θ)/h) * N
 * 
 * Longitude of ascending node:
 *   dΩ/dt = (r*sin(θ)/(h*sin(i))) * N
 * 
 * Argument of periapsis:
 *   dω/dt = (1/(h*e)) * (-p*cos(ν)*R + (p+r)*sin(ν)*T) - cos(i)*dΩ/dt
 * 
 * Mean anomaly (adjusted for semi-major axis change):
 *   The mean anomaly at epoch is adjusted to maintain orbital phase
 * 
 * Where:
 *   h = specific angular momentum = √(μp) = √(μa(1-e²))
 *   p = semi-latus rectum = a(1-e²)
 *   ν = true anomaly
 *   θ = argument of latitude = ω + ν
 *   r = orbital radius
 * 
 * Reference: Vallado, "Fundamentals of Astrodynamics" 4th ed., Section 9.6
 * 
 * @param {Object} elements - Current orbital elements
 * @param {number} elements.a - Semi-major axis (AU)
 * @param {number} elements.e - Eccentricity
 * @param {number} elements.i - Inclination (radians)
 * @param {number} elements.Ω - Longitude of ascending node (radians)
 * @param {number} elements.ω - Argument of periapsis (radians)
 * @param {number} elements.M0 - Mean anomaly at epoch (radians)
 * @param {number} elements.epoch - Julian date of epoch
 * @param {number} elements.μ - Gravitational parameter (AU³/day²)
 * @param {Object} thrust - Thrust vector {x, y, z} in AU/day² (ecliptic frame)
 * @param {number} deltaTime - Time step in days
 * @param {number} julianDate - Current Julian date
 * @returns {Object} New orbital elements after thrust applied
 */
// Debug flag for thrust logging - controlled externally
let thrustDebugEnabled = false;
export function setThrustDebug(enabled) {
    thrustDebugEnabled = enabled;
    console.log(`Thrust debug logging: ${enabled ? 'ENABLED' : 'DISABLED'}`);
}
if (typeof window !== 'undefined') {
    window.setThrustDebug = setThrustDebug;
}

export function applyThrust(elements, thrust, deltaTime, julianDate) {
    const { a, e, i, Ω, ω, M0, epoch, μ } = elements;

    // Handle zero thrust case
    const thrustMag = Math.sqrt(thrust.x ** 2 + thrust.y ** 2 + thrust.z ** 2);
    if (thrustMag < 1e-20) {
        return { ...elements };
    }

    // ========================================================================
    // State Vector Approach
    // ========================================================================
    // Instead of using Gauss's variational equations (which can cause position
    // discontinuities when multiple elements change simultaneously), we:
    // 1. Get current position and velocity from orbital elements
    // 2. Apply thrust as ΔV to velocity (position stays fixed)
    // 3. Convert (position, new_velocity) back to orbital elements
    //
    // This guarantees position continuity because position NEVER changes -
    // only velocity changes from the thrust.

    // Get current position and velocity from orbital elements
    const position = getPosition(elements, julianDate);
    const velocity = getVelocity(elements, julianDate);

    // Validate position and velocity - if orbital elements are already corrupt,
    // getPosition/getVelocity return fallback values (0,0,0) which would create
    // more corrupt elements when passed to stateToElements. Return original
    // elements unchanged to prevent error propagation.
    const posValid = isFinite(position.x) && isFinite(position.y) && isFinite(position.z) &&
                     (position.x !== 0 || position.y !== 0 || position.z !== 0);
    const velValid = isFinite(velocity.vx) && isFinite(velocity.vy) && isFinite(velocity.vz);

    if (!posValid || !velValid) {
        // Elements are corrupt - can't apply thrust meaningfully
        return { ...elements };
    }

    // Apply thrust as delta-v: v_new = v + a * dt
    const newVelocity = {
        vx: velocity.vx + thrust.x * deltaTime,
        vy: velocity.vy + thrust.y * deltaTime,
        vz: velocity.vz + thrust.z * deltaTime
    };

    // Convert state vector back to orbital elements
    // Position is unchanged, so the ship stays in the same place
    // IMPORTANT: Use julianDate as the new epoch, not the old epoch!
    // M0 must correspond to the time when position/velocity were computed.
    const newElements = stateToElements(position, newVelocity, μ, julianDate);

    // Validate new elements to prevent degenerate orbits from propagating.
    // stateToElements now clamps a and e, so this catches only true NaN/Infinity.
    const elementsValid =
        isFinite(newElements.a) && newElements.a !== 0 &&
        isFinite(newElements.e) && newElements.e >= 0 &&
        newElements.e <= TRAJECTORY_ROBUSTNESS.maxEccentricity &&
        isFinite(newElements.i) &&
        isFinite(newElements.Ω) &&
        isFinite(newElements.ω) &&
        isFinite(newElements.M0);

    if (!elementsValid) {
        // Elements are degenerate - return original to prevent error propagation
        return { ...elements };
    }

    // Debug logging for thrust application
    if (thrustDebugEnabled) {
        const dvMag = thrustMag * deltaTime;
        const dvKmS = dvMag * 1731.46; // AU/day to km/s
        console.log(`[THRUST] State-vector approach: ΔV=${dvKmS.toFixed(6)} km/s`);
        console.log(`[THRUST] Before: a=${a.toFixed(6)} AU, e=${e.toFixed(6)}`);
        console.log(`[THRUST] After:  a=${newElements.a.toFixed(6)} AU, e=${newElements.e.toFixed(6)}`);
        console.log(`[THRUST] Position preserved at: (${position.x.toFixed(6)}, ${position.y.toFixed(6)}, ${position.z.toFixed(6)}) AU`);
    }

    return newElements;
}

// ============================================================================
// Thruster Impulse Burns
// ============================================================================

/**
 * Apply an instantaneous thruster burn (impulsive delta-V).
 *
 * Unlike continuous solar sail thrust, chemical thrusters deliver
 * delta-V as an instantaneous velocity change. This function:
 * 1. Gets current position and velocity from orbital elements
 * 2. Computes prograde or retrograde unit vector
 * 3. Applies delta-V as instantaneous velocity change
 * 4. Converts back to orbital elements
 *
 * @param {Object} elements - Current orbital elements
 * @param {number} deltaVKmS - Delta-V magnitude in km/s
 * @param {string} direction - 'prograde' or 'retrograde'
 * @param {number} julianDate - Current Julian date
 * @returns {Object} New orbital elements after burn
 */
export function applyThrusterBurn(elements, deltaVKmS, direction, julianDate) {
    const { μ } = elements;

    // Get current position and velocity
    const position = getPosition(elements, julianDate);
    const velocity = getVelocity(elements, julianDate);

    // Validate
    const posValid = isFinite(position.x) && isFinite(position.y) && isFinite(position.z) &&
                     (position.x !== 0 || position.y !== 0 || position.z !== 0);
    const velValid = isFinite(velocity.vx) && isFinite(velocity.vy) && isFinite(velocity.vz);
    if (!posValid || !velValid) {
        return { ...elements };
    }

    // Compute velocity magnitude
    const vMag = Math.sqrt(velocity.vx ** 2 + velocity.vy ** 2 + velocity.vz ** 2);
    if (vMag < 1e-15) {
        return { ...elements };
    }

    // Prograde unit vector (along velocity)
    const progX = velocity.vx / vMag;
    const progY = velocity.vy / vMag;
    const progZ = velocity.vz / vMag;

    // Convert delta-V from km/s to AU/day
    // 1 AU/day = 1731.46 km/s, so 1 km/s = 1/1731.46 AU/day
    const deltaVAUDay = deltaVKmS / 1731.46;

    // Direction multiplier: +1 for prograde, -1 for retrograde
    const sign = direction === 'retrograde' ? -1 : 1;

    // Apply instantaneous velocity change
    const newVelocity = {
        vx: velocity.vx + sign * deltaVAUDay * progX,
        vy: velocity.vy + sign * deltaVAUDay * progY,
        vz: velocity.vz + sign * deltaVAUDay * progZ
    };

    // Convert back to orbital elements (position unchanged)
    const newElements = stateToElements(position, newVelocity, μ, julianDate);

    // Validate
    const valid = isFinite(newElements.a) && newElements.a !== 0 &&
                  isFinite(newElements.e) && newElements.e >= 0 &&
                  isFinite(newElements.i) &&
                  isFinite(newElements.Ω) &&
                  isFinite(newElements.ω) &&
                  isFinite(newElements.M0);

    if (!valid) {
        return { ...elements };
    }

    // Log the burn
    const oldVKmS = vMag * 1731.46;
    const newVMag = Math.sqrt(newVelocity.vx ** 2 + newVelocity.vy ** 2 + newVelocity.vz ** 2);
    const newVKmS = newVMag * 1731.46;
    console.log(`[THRUSTER] ${direction.toUpperCase()} burn: ΔV=${deltaVKmS.toFixed(3)} km/s`);
    console.log(`[THRUSTER] Velocity: ${oldVKmS.toFixed(2)} → ${newVKmS.toFixed(2)} km/s`);
    console.log(`[THRUSTER] Orbit: a=${elements.a.toFixed(6)} → ${newElements.a.toFixed(6)} AU, e=${elements.e.toFixed(4)} → ${newElements.e.toFixed(4)}`);

    return newElements;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate the optimal sail angle for maximum tangential acceleration.
 * 
 * For orbit raising (or lowering), the optimal sail angle that maximizes
 * the tangential component of thrust is approximately 35.26° (arctan(1/√2)).
 * 
 * This is a simplified model. The actual optimal angle depends on the
 * current position in the orbit and the mission objectives.
 * 
 * @returns {number} Optimal sail angle in radians (~0.6155 rad or ~35.26°)
 */
export function optimalSailAngle() {
    // arctan(1/√2) ≈ 35.26° ≈ 0.6155 radians
    return Math.atan(1 / Math.sqrt(2));
}

/**
 * Calculate the expected change in semi-major axis over one orbit.
 * 
 * For a circular orbit with constant sail orientation, the change in
 * semi-major axis per orbit can be approximated. This is useful for
 * mission planning.
 * 
 * @param {number} a - Current semi-major axis (AU)
 * @param {number} charAccel - Characteristic acceleration at 1 AU (AU/day²)
 * @param {number} sailAngle - Sail angle (radians)
 * @returns {number} Approximate change in semi-major axis per orbit (AU)
 */
export function estimateDeltaAPerOrbit(a, charAccel, sailAngle) {
    // Period of orbit in days
    const T = 2 * Math.PI * Math.sqrt(a * a * a / MU_SUN);
    
    // Average acceleration at this distance (accounting for inverse square)
    const avgAccel = charAccel / (a * a);
    
    // Tangential component of acceleration
    const tanAccel = avgAccel * Math.cos(sailAngle) * Math.sin(sailAngle);
    
    // Change in semi-major axis (simplified circular orbit approximation)
    // Δa ≈ (2a²/h) * T * T_average where T_average is average tangential accel
    const h = Math.sqrt(MU_SUN * a);
    const deltaA = (2 * a * a / h) * tanAccel * T;
    
    return deltaA;
}

// ============================================================================
// State-Vector Integration (RK4)
// ============================================================================

/**
 * Calculate gravitational acceleration from a central body.
 *
 * Formula: a = -μ * r / |r|³
 *
 * @param {Object} state - State vector {x, y, z, vx, vy, vz} in AU, AU/day
 * @param {number} mu - Gravitational parameter (AU³/day²), default SUN
 * @returns {Object} Acceleration vector {x, y, z} in AU/day²
 */
export function gravitationalAcceleration(state, mu = MU_SUN) {
    const r = Math.sqrt(state.x ** 2 + state.y ** 2 + state.z ** 2);
    const r3 = r * r * r;

    if (r < 1e-10) {
        // Avoid division by zero at origin
        return {x: 0, y: 0, z: 0};
    }

    return {
        x: -mu * state.x / r3,
        y: -mu * state.y / r3,
        z: -mu * state.z / r3
    };
}

/**
 * Calculate sail thrust from state vector (without orbital elements).
 *
 * This version computes the RTN frame directly from position and velocity
 * vectors, avoiding the need for orbital element conversion. Used for
 * state-vector integration where elements aren't available.
 *
 * @param {Object} state - State vector {x, y, z, vx, vy, vz}
 * @param {Object} sailState - Sail configuration (area, angle, deployment, etc.)
 * @param {number} shipMass - Ship mass in kg
 * @param {Object} sunPosition - Sun position {x, y, z} in AU (default origin)
 * @returns {Object} Thrust acceleration {x, y, z} in AU/day²
 */
export function calculateSailThrustFromState(state, sailState, shipMass = 10000, sunPosition = {x: 0, y: 0, z: 0}) {
    const {
        area,
        reflectivity,
        angle,              // Yaw angle
        pitchAngle = 0,     // Pitch angle
        deploymentPercent,
        condition,
        sailCount = 1
    } = sailState;

    // Relative position to sun
    const rx = state.x - sunPosition.x;
    const ry = state.y - sunPosition.y;
    const rz = state.z - sunPosition.z;
    const r = Math.sqrt(rx * rx + ry * ry + rz * rz);

    if (r < 1e-10) {
        return {x: 0, y: 0, z: 0};  // No thrust at sun's center
    }

    // Calculate effective sail area
    const effectiveArea = area * (deploymentPercent / 100) * (condition / 100);

    // Solar radiation pressure at current distance
    const pressure = getSolarPressure(r);

    // Thrust magnitude
    const cosYaw = Math.cos(angle);
    const cosPitch = Math.cos(pitchAngle);
    const thrustMagnitudeN = 2 * pressure * effectiveArea *
                             cosYaw * cosYaw * cosPitch * cosPitch * reflectivity * sailCount;

    // Convert to acceleration in AU/day²
    const accelMS2 = thrustMagnitudeN / shipMass;
    const accelAUDay2 = accelMS2 * ACCEL_CONVERSION;

    // Build RTN frame from state vectors
    // R (Radial): Unit vector pointing away from sun
    const R = {x: rx / r, y: ry / r, z: rz / r};

    // Angular momentum: h = r × v
    const hx = ry * state.vz - rz * state.vy;
    const hy = rz * state.vx - rx * state.vz;
    const hz = rx * state.vy - ry * state.vx;
    const h_mag = Math.sqrt(hx * hx + hy * hy + hz * hz);

    if (h_mag < 1e-10) {
        // Degenerate case: radial motion (no angular momentum)
        // Default to thrust in radial direction only
        return {
            x: accelAUDay2 * R.x,
            y: accelAUDay2 * R.y,
            z: accelAUDay2 * R.z
        };
    }

    // N (Normal): Unit vector perpendicular to orbital plane
    const N = {x: hx / h_mag, y: hy / h_mag, z: hz / h_mag};

    // T (Transverse): Completes right-handed frame (T = N × R)
    const T = {
        x: N.y * R.z - N.z * R.y,
        y: N.z * R.x - N.x * R.z,
        z: N.x * R.y - N.y * R.x
    };

    // Apply sail yaw and pitch to get thrust direction in RTN frame
    const thrustR = Math.cos(angle) * Math.cos(pitchAngle);
    const thrustT = Math.sin(angle) * Math.cos(pitchAngle);
    const thrustN = Math.sin(pitchAngle);

    // Convert RTN thrust to ecliptic coordinates
    return {
        x: accelAUDay2 * (thrustR * R.x + thrustT * T.x + thrustN * N.x),
        y: accelAUDay2 * (thrustR * R.y + thrustT * T.y + thrustN * N.y),
        z: accelAUDay2 * (thrustR * R.z + thrustT * T.z + thrustN * N.z)
    };
}

/**
 * Integrate state vector forward in time using RK4 (4th-order Runge-Kutta).
 *
 * This is the primary integration method for state-vector trajectory prediction.
 * RK4 provides O(Δt⁴) local error, making it ~100-1000× more accurate than RK2
 * for the same timestep.
 *
 * The state derivative is: dy/dt = f(t, y) = (vx, vy, vz, ax, ay, az)
 * where acceleration a = -μ*r/|r|³ + thrust
 *
 * RK4 algorithm:
 * 1. k1 = f(t, y)
 * 2. k2 = f(t + dt/2, y + k1*dt/2)
 * 3. k3 = f(t + dt/2, y + k2*dt/2)
 * 4. k4 = f(t + dt, y + k3*dt)
 * 5. y_new = y + (k1 + 2*k2 + 2*k3 + k4) * dt/6
 *
 * @param {Object} state - State vector {x, y, z, vx, vy, vz}
 * @param {Object} sailState - Sail configuration for thrust calculation
 * @param {number} dt - Time step in days
 * @param {number} shipMass - Ship mass in kg
 * @param {number} mu - Gravitational parameter (AU³/day²)
 * @returns {Object} New state vector {x, y, z, vx, vy, vz}
 */
export function integrateStateRK4(state, sailState, dt, shipMass = 10000, mu = MU_SUN) {
    // Helper function: compute state derivative dy/dt = (v, a)
    function derivative(s, sail) {
        const grav = gravitationalAcceleration(s, mu);
        const thrust = calculateSailThrustFromState(s, sail, shipMass);

        return {
            // Position derivative is velocity
            x: s.vx,
            y: s.vy,
            z: s.vz,
            // Velocity derivative is acceleration (gravity + thrust)
            vx: grav.x + thrust.x,
            vy: grav.y + thrust.y,
            vz: grav.z + thrust.z
        };
    }

    // Helper function: add scaled derivative to state
    function add(s, k, scale) {
        return {
            x: s.x + k.x * scale,
            y: s.y + k.y * scale,
            z: s.z + k.z * scale,
            vx: s.vx + k.vx * scale,
            vy: s.vy + k.vy * scale,
            vz: s.vz + k.vz * scale
        };
    }

    // RK4 stages
    const k1 = derivative(state, sailState);
    const k2 = derivative(add(state, k1, dt / 2), sailState);
    const k3 = derivative(add(state, k2, dt / 2), sailState);
    const k4 = derivative(add(state, k3, dt), sailState);

    // Weighted average: (k1 + 2*k2 + 2*k3 + k4) / 6
    return {
        x: state.x + (k1.x + 2 * k2.x + 2 * k3.x + k4.x) * dt / 6,
        y: state.y + (k1.y + 2 * k2.y + 2 * k3.y + k4.y) * dt / 6,
        z: state.z + (k1.z + 2 * k2.z + 2 * k3.z + k4.z) * dt / 6,
        vx: state.vx + (k1.vx + 2 * k2.vx + 2 * k3.vx + k4.vx) * dt / 6,
        vy: state.vy + (k1.vy + 2 * k2.vy + 2 * k3.vy + k4.vy) * dt / 6,
        vz: state.vz + (k1.vz + 2 * k2.vz + 2 * k3.vz + k4.vz) * dt / 6
    };
}
