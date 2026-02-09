/**
 * intersectionDetector.js
 *
 * Orbit Intersection Detector - Visual Trajectory Planning Tool
 *
 * PURPOSE:
 * Detects when predicted ship trajectory crosses planetary orbital paths and shows
 * "ghost planets" at their actual positions at those crossing times. This enables
 * visual trajectory planning: adjust sail settings and watch ghost positions shift
 * in time as your orbit crossing timing changes.
 *
 * ALGORITHM:
 * For each celestial body:
 *   1. Use semi-major axis (a) as orbital radius
 *   2. Check each trajectory segment for crossing: (r1 < a && r2 > a) || (r1 > a && r2 < a)
 *   3. Solve quadratic equation for exact crossing time/position (NOT linear interpolation!)
 *      - When P(t) = P1 + t*(P2-P1), the radius r(t) = ||P(t)|| is NOT linear
 *      - Must solve ||P(t)||² = R² which gives a*t² + b*t + c = 0
 *   4. Get planet's actual position at that crossing time
 *   5. Render as semi-transparent "ghost" with time offset label
 *
 * FEATURES:
 * - One ghost per orbital crossing (not per close approach)
 * - Shows where planet WILL BE when you cross its orbit, even if far away
 * - Real-time updates as you adjust sail angles/deployment
 * - Moon coordinate transformation (parent-relative → heliocentric)
 * - Full precision at all zoom levels for accurate navigation
 * - Stable detection: Consistent results prevent flickering
 *
 * USAGE:
 * Called from game loop when trajectory cache updates. Results cached and
 * synchronized via trajectory hash to prevent redundant calculations.
 */

import { getPosition } from './orbital.js';
import { SOI_RADII } from '../config.js';

// ============================================================================
// CROSSING REFINEMENT CONFIGURATION
// ============================================================================

/**
 * Configuration for crossing point refinement.
 * Sub-segment bisection improves accuracy of crossing time detection.
 *
 * Always uses maximum precision for accurate encounter planning.
 */
const REFINEMENT_CONFIG = {
    /**
     * Number of bisection iterations for crossing refinement at HIGH zoom.
     * Each iteration halves the uncertainty interval.
     * 12 iterations: 2 hours → ~1.8 seconds precision (~63 km for Venus)
     */
    bisectionIterationsHigh: 12,

    /**
     * Number of bisection iterations at LOW zoom (system view).
     * 8 iterations: 2 hours → ~28 seconds precision (~1000 km for Venus)
     *
     * Increased from 4 (27 min, 57000 km error) to prevent ghost planets
     * from appearing on wrong side of encounter point.
     */
    bisectionIterationsLow: 8,

    /**
     * Zoom threshold for switching between low/high precision.
     * Below this: use low precision (faster)
     * Above this: use high precision (more accurate)
     */
    zoomThreshold: 2.0,

    /**
     * Minimum segment duration (days) below which refinement stops.
     * Prevents excessive computation for already-precise segments.
     * 0.001 days = ~86 seconds
     */
    minSegmentDuration: 0.001,

    /**
     * Enable/disable refinement (for debugging/performance comparison)
     */
    enabled: true
};

/**
 * Get the number of bisection iterations.
 * Always returns the maximum precision value for accurate crossing detection.
 *
 * Previously zoom-adaptive (fewer iterations at low zoom), but this caused
 * ghost position "jumping" when zooming and reduced accuracy for navigation.
 * The performance cost of max iterations is negligible (~12 iterations of
 * simple arithmetic per crossing).
 */
function getBisectionIterations() {
    return REFINEMENT_CONFIG.bisectionIterationsHigh;
}

// ============================================================================
// VECTOR MATH UTILITIES
// ============================================================================

/**
 * Calculate dot product of two 3D vectors
 * @param {Object} a - Vector {x, y, z}
 * @param {Object} b - Vector {x, y, z}
 * @returns {number} Scalar dot product
 */
function dot3D(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

/**
 * Subtract two 3D vectors (a - b)
 * @param {Object} a - Vector {x, y, z}
 * @param {Object} b - Vector {x, y, z}
 * @returns {Object} Result vector {x, y, z}
 */
function subtract3D(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/**
 * Add two 3D vectors (a + b)
 * @param {Object} a - Vector {x, y, z}
 * @param {Object} b - Vector {x, y, z}
 * @returns {Object} Result vector {x, y, z}
 */
function add3D(a, b) {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/**
 * Scale a 3D vector by scalar (v * s)
 * @param {Object} v - Vector {x, y, z}
 * @param {number} s - Scalar multiplier
 * @returns {Object} Scaled vector {x, y, z}
 */
function scale3D(v, s) {
    return { x: v.x * s, y: v.y * s, z: v.z * s };
}

/**
 * Calculate magnitude (length) of 3D vector
 * @param {Object} v - Vector {x, y, z}
 * @returns {number} Magnitude in AU
 */
function magnitude3D(v) {
    return Math.sqrt(dot3D(v, v));
}

// ============================================================================
// CLOSEST APPROACH ALGORITHM
// ============================================================================

/**
 * Calculate closest approach between trajectory segment and body motion
 *
 * Uses parameterized line segments:
 *   Trajectory: T(s) = P1 + s(P2 - P1), s ∈ [0,1]
 *   Body:       B(s) = B1 + s(B2 - B1), s ∈ [0,1]
 *
 * Minimizes distance: D²(s) = ||T(s) - B(s)||²
 * Solution: s* = -(W·V) / (V·V) where W = P1-B1, V = (P2-P1)-(B2-B1)
 *
 * Note: Linear interpolation of body motion introduces <1.5% error per segment
 * for high-eccentricity orbits like Mercury. Acceptable for visualization.
 *
 * @param {Object} trajPoint1 - Start of trajectory segment {x, y, z, time} (AU, Julian date)
 * @param {Object} trajPoint2 - End of trajectory segment {x, y, z, time}
 * @param {Object} bodyPos1 - Body position at trajPoint1.time {x, y, z} (AU)
 * @param {Object} bodyPos2 - Body position at trajPoint2.time {x, y, z}
 * @returns {Object} {time, distance, trajectoryPos, bodyPos}
 */
export function calculateClosestApproach(
    trajPoint1, trajPoint2,
    bodyPos1, bodyPos2
) {
    // Vector from trajectory start to body start
    const W = subtract3D(trajPoint1, bodyPos1);

    // Relative velocity vector
    const trajDelta = subtract3D(trajPoint2, trajPoint1);
    const bodyDelta = subtract3D(bodyPos2, bodyPos1);
    const V = subtract3D(trajDelta, bodyDelta);

    // Solve for minimum distance parameter s
    const VdotV = dot3D(V, V);
    let s;

    if (VdotV < 1e-20) {
        // Degenerate case: parallel motion (no relative velocity)
        // Distance remains constant - use start position
        s = 0;
    } else {
        // Standard case: solve dD²/ds = 0
        s = -dot3D(W, V) / VdotV;
        // Clamp to segment bounds [0, 1]
        s = Math.max(0, Math.min(1, s));
    }

    // Calculate positions at closest approach
    const trajectoryPos = add3D(trajPoint1, scale3D(trajDelta, s));
    const bodyPos = add3D(bodyPos1, scale3D(bodyDelta, s));

    // Calculate separation distance
    const separation = subtract3D(trajectoryPos, bodyPos);
    const distance = magnitude3D(separation);

    // Calculate time (Julian date)
    const time = trajPoint1.time + s * (trajPoint2.time - trajPoint1.time);

    return {
        time,
        distance,
        trajectoryPos,
        bodyPos
    };
}

// ============================================================================
// CROSSING REFINEMENT ALGORITHM
// ============================================================================

/**
 * Refine a crossing point using binary search bisection.
 *
 * When a crossing is detected in a coarse segment, this function recursively
 * bisects the segment to find a more precise crossing time. This significantly
 * reduces "jumping" when sail adjustments cause the trajectory to shift.
 *
 * Algorithm:
 * 1. Start with coarse segment [p1, p2] that crosses target radius
 * 2. Calculate midpoint using linear interpolation
 * 3. Determine which half contains the crossing (by checking radii)
 * 4. Recurse into that half
 * 5. Continue until reaching precision threshold or max iterations
 *
 * Precision improvement (at 12 steps/day = 2-hour segments):
 * - Low zoom (8 iterations): 2 hours / 2^8 ≈ 28 seconds
 * - High zoom (12 iterations): 2 hours / 2^12 ≈ 1.8 seconds
 *
 * @param {Object} p1 - Start point {x, y, z, time}
 * @param {Object} p2 - End point {x, y, z, time}
 * @param {number} targetRadius - Orbital radius to find crossing for
 * @param {number} maxIterations - Maximum bisection iterations
 * @returns {Object} Refined crossing {t, time, position}
 */
function refineCrossingBisection(p1, p2, targetRadius, maxIterations = null) {
    // Use zoom-adaptive iterations if not specified
    if (maxIterations === null) {
        maxIterations = getBisectionIterations();
    }
    // Calculate initial radii
    let r1 = Math.sqrt(p1.x ** 2 + p1.y ** 2 + p1.z ** 2);
    let r2 = Math.sqrt(p2.x ** 2 + p2.y ** 2 + p2.z ** 2);

    // Current segment bounds
    let low = { ...p1 };
    let high = { ...p2 };
    let rLow = r1;
    let rHigh = r2;

    // Binary search bisection
    for (let iter = 0; iter < maxIterations; iter++) {
        // Check if segment is already precise enough
        const segmentDuration = high.time - low.time;
        if (segmentDuration < REFINEMENT_CONFIG.minSegmentDuration) {
            break;
        }

        // Calculate midpoint (linear interpolation)
        const mid = {
            x: (low.x + high.x) / 2,
            y: (low.y + high.y) / 2,
            z: (low.z + high.z) / 2,
            time: (low.time + high.time) / 2
        };
        const rMid = Math.sqrt(mid.x ** 2 + mid.y ** 2 + mid.z ** 2);

        // Determine which half contains the crossing
        // Crossing occurs when radius changes from one side of target to the other
        // FIX: Use <= and >= to handle boundary cases consistently with findRadiusCrossing
        const lowCrossesTarget = (rLow <= targetRadius && rMid >= targetRadius) ||
                                  (rLow >= targetRadius && rMid <= targetRadius);

        if (lowCrossesTarget) {
            // Crossing is in [low, mid]
            high = mid;
            rHigh = rMid;
        } else {
            // Crossing is in [mid, high]
            low = mid;
            rLow = rMid;
        }
    }

    // Final precise crossing calculation using quadratic solver on refined segment
    const dx = high.x - low.x;
    const dy = high.y - low.y;
    const dz = high.z - low.z;

    // Quadratic coefficients for ||P(t)||² = R²
    const a = dx * dx + dy * dy + dz * dz;
    const b = 2 * (low.x * dx + low.y * dy + low.z * dz);
    const c = rLow * rLow - targetRadius * targetRadius;

    // Solve quadratic
    const discriminant = b * b - 4 * a * c;

    let t;
    // FIX: Use epsilon tolerance for discriminant check to handle floating-point
    // precision issues where discriminant oscillates near zero between frames.
    // A small negative discriminant (> -1e-10) is treated as zero (tangent case).
    const DISCRIMINANT_EPSILON = 1e-10;
    if (discriminant < -DISCRIMINANT_EPSILON || a < 1e-20) {
        // Fallback: linear interpolation (guarded against division by zero)
        const radialDiff = rHigh - rLow;
        if (Math.abs(radialDiff) < 1e-15) {
            t = 0.5;  // Midpoint if radii are essentially equal
        } else {
            t = (targetRadius - rLow) / radialDiff;
        }
        t = Math.max(0, Math.min(1, t));
    } else {
        // Handle near-zero discriminant as tangent (single root at t = -b/(2a))
        const safeDisc = Math.max(0, discriminant);  // Clamp tiny negatives to zero
        const sqrtDisc = Math.sqrt(safeDisc);
        const t1 = (-b - sqrtDisc) / (2 * a);
        const t2 = (-b + sqrtDisc) / (2 * a);

        // Pick the solution in [0, 1]
        if (t1 >= 0 && t1 <= 1) {
            t = t1;
        } else if (t2 >= 0 && t2 <= 1) {
            t = t2;
        } else {
            // Fallback
            t = (targetRadius - rLow) / (rHigh - rLow);
            t = Math.max(0, Math.min(1, t));
        }
    }

    // Calculate final crossing position and time
    const crossingTime = low.time + t * (high.time - low.time);
    const crossingPos = {
        x: low.x + t * dx,
        y: low.y + t * dy,
        z: low.z + t * dz
    };

    return {
        t,
        time: crossingTime,
        position: crossingPos
    };
}

// ============================================================================
// INTERSECTION DETECTION
// ============================================================================

// Eccentricity threshold for checking perihelion/aphelion
// Planets with e > this will be checked at both extremes

/**
 * Deduplicate multi-radius crossings for a single body.
 *
 * When eccentricity causes us to check perihelion/a/aphelion radii, a single
 * orbit transit can produce 2-3 crossings. These are clustered in time and
 * represent the same navigation event. We merge nearby crossings, keeping
 * the one with smallest ship-to-planet distance (best intercept).
 *
 * Crossings far apart in time (e.g., outbound vs return leg) are preserved
 * as separate encounters.
 *
 * @param {Array} crossings - Array of crossing objects for one body
 * @param {Object} elements - Body's orbital elements {a, e}
 * @returns {Array} Deduplicated crossings (one per distinct orbit transit)
 */
function deduplicateBodyCrossings(crossings, elements) {
    if (crossings.length <= 1) return crossings;

    // Sort by time
    crossings.sort((a, b) => a.time - b.time);

    // Merge window: time for ship to traverse the perihelion-aphelion band.
    // Band width = 2*e*a AU. Solar sail radial velocity through the band is
    // typically 0.2-0.5 AU/year (continuous low thrust, NOT chemical rocket speeds).
    // Using 4 * e * a * 365.25 assumes ~0.5 AU/year at the slow end, giving a
    // conservative window that keeps all crossings from a single zone transit
    // in one group while still separating genuine return-leg transits.
    //
    // Examples: Mars (e=0.094, a=1.52) → 209 days, Mercury (e=0.21, a=0.39) → 116 days
    // Minimum 40 days handles numerical duplicates for near-circular orbits.
    // (Bodies with e < 0.05 only check semi-major axis, so large minimums
    // are unnecessary and would over-merge fast orbiters like Mercury.)
    const { a, e } = elements;
    const mergeWindow = Math.max(40, e * a * 365.25 * 4);

    const result = [];
    let group = [crossings[0]];

    for (let i = 1; i < crossings.length; i++) {
        if (crossings[i].time - group[0].time < mergeWindow) {
            group.push(crossings[i]);
        } else {
            // Keep the crossing with smallest ship-to-planet distance
            result.push(group.reduce((best, c) => c.distance < best.distance ? c : best));
            group = [crossings[i]];
        }
    }
    // Last group
    result.push(group.reduce((best, c) => c.distance < best.distance ? c : best));

    return result;
}

/**
 * Calculate the orbital plane normal vector from orbital elements.
 * The normal is perpendicular to the orbital plane in ecliptic coordinates.
 *
 * The orbital plane is defined by:
 * - Inclination (i): tilt from the ecliptic
 * - Longitude of ascending node (Ω): where the orbit crosses the ecliptic going "up"
 *
 * @param {number} i - Inclination in radians
 * @param {number} Ω - Longitude of ascending node in radians
 * @returns {Object} Normal vector {x, y, z} (unit vector)
 */
function getOrbitalPlaneNormal(i, Ω) {
    // The normal vector to the orbital plane in ecliptic coordinates
    // Derived from the rotation matrices: rotate by Ω around z, then by i around new x
    return {
        x: Math.sin(Ω) * Math.sin(i),
        y: -Math.cos(Ω) * Math.sin(i),
        z: Math.cos(i)
    };
}

/**
 * Find where a trajectory segment crosses a body's orbital radius.
 *
 * DESIGN DECISION (2026-01-30):
 * Always use RADIUS CROSSING for detection, regardless of orbital inclination.
 *
 * The previous "orbital plane crossing" algorithm required the trajectory to
 * pierce the body's tilted orbital plane AT the correct radial distance.
 * This failed for most trajectories because:
 * - Plane crossing and radius crossing happen at different points in space
 * - A trajectory might cross Venus's plane at r=0.9 AU but cross r=0.72 AU
 *   while NOT piercing the plane - these are independent conditions
 *
 * Radius crossing reliably detects when you cross a planet's orbital distance.
 * The ghost planet is then placed at the planet's ACTUAL position at that time,
 * which correctly shows where the planet will be when you reach that radius.
 *
 * For navigation, this is what matters: "When I reach Venus's orbital radius,
 * where will Venus actually be?" - not "Did I pierce Venus's tilted plane?"
 *
 * ECCENTRICITY FIX (2026-02-06):
 * For eccentric orbits (e > 0.05), also check crossings at perihelion and
 * aphelion radii. Previously only checked semi-major axis, which meant the
 * ghost planet was placed at the wrong time for planets like Mars (e=0.094)
 * whose actual distance ranges from 1.381-1.666 AU but was only checked at
 * 1.524 AU. This matches the multi-radius logic in evaluate-trajectory.js.
 *
 * @param {Object} p1 - Start point {x, y, z, time}
 * @param {Object} p2 - End point {x, y, z, time}
 * @param {Object} elements - Body's orbital elements {a, e, i, Ω, ω}
 * @returns {Array} Array of crossing info objects {t, time, position}, may be empty
 */
function findOrbitalPlaneCrossings(p1, p2, elements) {
    const { a, e } = elements;

    // Calculate heliocentric radii
    const r1 = Math.sqrt(p1.x ** 2 + p1.y ** 2 + p1.z ** 2);
    const r2 = Math.sqrt(p2.x ** 2 + p2.y ** 2 + p2.z ** 2);

    // Check only the semi-major axis radius.
    // Multi-radius checking (perihelion/aphelion) was removed because it causes
    // ghost planet position snapping: small sail adjustments flip which radius
    // crossing "wins" deduplication, jumping the ghost by 50-100+ days.
    // See reports/ghost-planet-snapping-investigation-2026-02-07.md
    const crossings = [];
    const crossing = findRadiusCrossing(p1, p2, r1, r2, a);
    if (crossing) {
        crossings.push(crossing);
    }

    return crossings;
}

/**
 * Find the exact crossing point(s) where a trajectory segment crosses a target radius.
 * Uses quadratic equation with optional bisection refinement for high precision.
 *
 * When refinement is enabled, this achieves ~25 second precision instead of
 * the base ~7 hour precision of coarse trajectory segments. This significantly
 * reduces "jumping" when sail adjustments shift the trajectory.
 *
 * @param {Object} p1 - Start point {x, y, z, time}
 * @param {Object} p2 - End point {x, y, z, time}
 * @param {number} r1 - Heliocentric radius at p1
 * @param {number} r2 - Heliocentric radius at p2
 * @param {number} targetRadius - Orbital radius to detect crossing
 * @returns {Object|null} Crossing info {t, time, position} or null if no crossing
 */
function findRadiusCrossing(p1, p2, r1, r2, targetRadius) {
    // Check if this segment crosses the target radius
    // FIX: Use <= and >= to handle boundary cases where r equals targetRadius exactly
    // This prevents flickering when trajectory endpoints land exactly on orbital radius
    // due to floating-point variations between frames
    const crossesRadius = (r1 <= targetRadius && r2 >= targetRadius) ||
                          (r1 >= targetRadius && r2 <= targetRadius);

    // Exclude the degenerate case where both endpoints are exactly at the target
    // (trajectory is tangent to orbit, not crossing it)
    if (!crossesRadius || (r1 === targetRadius && r2 === targetRadius)) {
        return null;
    }

    // Use bisection refinement for higher precision if enabled
    if (REFINEMENT_CONFIG.enabled) {
        return refineCrossingBisection(p1, p2, targetRadius);
    }

    // Fallback: Direct quadratic solution (original algorithm)
    // Solve ||P(t)||² = R² where P(t) = P1 + t*(P2-P1)
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dz = p2.z - p1.z;

    // Quadratic coefficients
    const a = dx * dx + dy * dy + dz * dz;  // D·D
    const b = 2 * (p1.x * dx + p1.y * dy + p1.z * dz);  // 2*(P1·D)
    const c = r1 * r1 - targetRadius * targetRadius;  // P1·P1 - R²

    // Discriminant with epsilon tolerance for floating-point stability
    const discriminant = b * b - 4 * a * c;
    const DISCRIMINANT_EPSILON = 1e-10;

    if (discriminant < -DISCRIMINANT_EPSILON || a < 1e-20) {
        // No real solution or degenerate case (no movement)
        return null;
    }

    // Clamp tiny negatives to zero (handles floating-point near-tangent cases)
    const safeDisc = Math.max(0, discriminant);
    const sqrtDisc = Math.sqrt(safeDisc);
    const t1 = (-b - sqrtDisc) / (2 * a);
    const t2 = (-b + sqrtDisc) / (2 * a);

    // Find the solution in [0, 1] that corresponds to this crossing
    let t;
    if (t1 >= 0 && t1 <= 1) {
        t = t1;
    } else if (t2 >= 0 && t2 <= 1) {
        t = t2;
    } else {
        // Numerical edge case - fallback to linear approximation (guarded)
        const radialDiff = r2 - r1;
        if (Math.abs(radialDiff) < 1e-15) {
            t = 0.5;  // Midpoint if radii essentially equal
        } else {
            t = (targetRadius - r1) / radialDiff;
        }
        t = Math.max(0, Math.min(1, t));
    }

    const crossingTime = p1.time + t * (p2.time - p1.time);

    // Interpolate crossing position
    const crossingPos = {
        x: p1.x + t * dx,
        y: p1.y + t * dy,
        z: p1.z + t * dz
    };

    return {
        t,
        time: crossingTime,
        position: crossingPos
    };
}

/**
 * Refine a crossing time using the planet's actual heliocentric radius.
 *
 * HYBRID ANCHOR-REFINE ALGORITHM:
 * The semi-major axis crossing gives a stable detection point (no snapping),
 * but for eccentric orbits (Mars e=0.094, Mercury e=0.206), the planet's
 * actual distance from the Sun at crossing time can differ significantly
 * from the semi-major axis. This refinement step corrects the timing.
 *
 * Algorithm:
 * 1. Start with crossing at semi-major axis at time T_nominal
 * 2. Look up planet's actual heliocentric radius at T_nominal
 * 3. Search nearby trajectory segments for crossing at that actual radius
 * 4. If found, return refined crossing; otherwise return original
 *
 * This avoids the multi-radius snapping problem because:
 * - Detection uses ONE radius (semi-major axis) → no deduplication needed
 * - Refinement is a single step, not multiple competing radii
 * - If refinement fails, gracefully falls back to original crossing
 *
 * @param {Object} nominalCrossing - Original crossing {time, position, t}
 * @param {Object} bodyElements - Body's orbital elements
 * @param {Array} trajectory - Full trajectory array
 * @param {number} nominalIdx - Trajectory index where nominal crossing was found
 * @param {number} segmentSkip - Current segment skip factor
 * @returns {Object} Refined crossing {time, position} or original if refinement not needed
 */
function refineCrossingWithActualRadius(nominalCrossing, bodyElements, trajectory, nominalIdx, segmentSkip) {
    const { a, e } = bodyElements;

    // Only refine for eccentric orbits where the radius difference matters
    // For near-circular orbits (e < 0.05), semi-major axis is accurate enough
    if (e < 0.05) {
        return nominalCrossing;
    }

    // Get planet's actual heliocentric radius at the nominal crossing time
    const planetPos = getPosition(bodyElements, nominalCrossing.time);
    if (!isFinite(planetPos.x) || !isFinite(planetPos.y) || !isFinite(planetPos.z)) {
        return nominalCrossing;
    }
    const actualRadius = Math.sqrt(planetPos.x ** 2 + planetPos.y ** 2 + planetPos.z ** 2);

    // If the actual radius is close to semi-major axis, no refinement needed
    const radiusDifference = Math.abs(actualRadius - a);
    if (radiusDifference < 0.01) {  // < 0.01 AU difference (~1.5M km)
        return nominalCrossing;
    }

    // Search nearby trajectory segments for a crossing at the actual radius.
    // The window must be large enough to cover the radial distance between
    // semi-major axis and actual radius. For Mars (e=0.094), this can be
    // up to 0.142 AU, which at typical solar sail speeds (~0.3-0.5 AU/year)
    // takes 100+ days to traverse.
    //
    // Calculate window based on actual trajectory step density:
    // stepsPerDay ≈ trajectory.length / totalDurationDays
    // traverseTime ≈ radiusDifference / radialVelocity (conservative 0.2 AU/year)
    const totalDuration = trajectory.length > 1
        ? trajectory[trajectory.length - 1].time - trajectory[0].time
        : 1;
    const stepsPerDay = trajectory.length / Math.max(totalDuration, 1);
    const traverseDays = radiusDifference / 0.2 * 365.25;  // Conservative: 0.2 AU/year radial speed
    const searchWindow = Math.max(50, Math.ceil(traverseDays * stepsPerDay * 1.5));
    const startIdx = Math.max(0, nominalIdx - searchWindow);
    const endIdx = Math.min(trajectory.length - 2, nominalIdx + searchWindow);

    let bestRefinedCrossing = null;
    let bestTimeDifference = Infinity;

    for (let idx = startIdx; idx <= endIdx; idx++) {
        const p1 = trajectory[idx];
        const p2 = trajectory[idx + 1];

        const r1 = Math.sqrt(p1.x ** 2 + p1.y ** 2 + p1.z ** 2);
        const r2 = Math.sqrt(p2.x ** 2 + p2.y ** 2 + p2.z ** 2);

        const refined = findRadiusCrossing(p1, p2, r1, r2, actualRadius);
        if (refined) {
            // Prefer the crossing closest in time to the nominal crossing
            const timeDiff = Math.abs(refined.time - nominalCrossing.time);
            if (timeDiff < bestTimeDifference) {
                bestTimeDifference = timeDiff;
                bestRefinedCrossing = refined;
            }
        }
    }

    // If we found a refined crossing, use it; otherwise keep the nominal
    if (bestRefinedCrossing) {
        return bestRefinedCrossing;
    }

    return nominalCrossing;
}

/**
 * Detect when trajectory crosses orbital paths and show planet positions at those times
 *
 * CROSSING DETECTION ALGORITHM (HYBRID ANCHOR-REFINE):
 * Detection uses the semi-major axis for stable, snap-free crossing identification.
 * For eccentric orbits, a refinement step corrects the timing using the planet's
 * actual heliocentric distance at the crossing time.
 *
 * For segment (p1, p2) with heliocentric radii (r1, r2):
 *   1. Check if segment crosses target radius: (r1 < a && r2 > a) || (r1 > a && r2 < a)
 *   2. Solve quadratic equation for exact crossing point (not linear interpolation)
 *   3. REFINE: For eccentric orbits, find crossing at planet's actual radius near that time
 *   4. Get planet position at refined crossing time: getPosition(elements, refinedTime)
 *   5. Compute angular separation between ship crossing point and planet position
 *   6. Display ghost at planet's actual position with time offset and early/late label
 *
 * WHY HYBRID ANCHOR-REFINE:
 * - Semi-major-axis-only: Stable but wrong timing for eccentric orbits (up to 70 days off)
 * - Multi-radius: Correct physics but causes ghost snapping from deduplication
 * - Closest-approach: Produces 4 AU ghosts in empty space
 * - Hybrid: Stable detection (one radius) + accurate timing (refine with actual radius)
 *
 * ZOOM-ADAPTIVE OPTIMIZATION:
 * - At low zoom: Skip segments (check every Nth), fewer bisection iterations
 * - At high zoom: Full resolution for accurate encounter planning
 * - Pre-filters bodies by radial range to skip impossible crossings
 *
 * @param {Array} trajectory - Array of {x, y, z, time} points (ship path from trajectory predictor)
 * @param {Array} celestialBodies - Array of body objects with {name, elements, parent}
 * @param {number} currentTime - Current game Julian date (filters out past crossings)
 * @param {string|null} soiBody - Current SOI body name (null = heliocentric mode)
 * @returns {Array} Intersection events sorted by time: [{bodyName, time, bodyPosition, trajectoryPosition, distance, angularSeparation, isAhead}, ...]
 */
export function detectIntersections(trajectory, celestialBodies, currentTime, soiBody = null) {
    // Guard: Empty or invalid trajectory
    if (!trajectory || trajectory.length < 2) {
        return [];
    }

    const trajectorySnapshot = trajectory;
    const intersections = [];

    // ========================================================================
    // FULL RESOLUTION - NO SEGMENT SKIPPING
    // ========================================================================
    // Always check every segment for crossing detection. Previously used
    // zoom-adaptive skipping (every 2nd-4th segment at low zoom) but this
    // reduced accuracy and could miss crossings entirely for long trajectories.
    // The performance cost of checking all segments is negligible (<5ms).
    const segmentSkip = 1;

    // ========================================================================
    // PRE-FILTER: Calculate trajectory radial range
    // ========================================================================
    // Find min/max radius of entire trajectory to pre-filter bodies
    let trajMinRadius = Infinity;
    let trajMaxRadius = 0;

    for (let i = 0; i < trajectorySnapshot.length; i++) {
        const p = trajectorySnapshot[i];
        const r = Math.sqrt(p.x ** 2 + p.y ** 2 + p.z ** 2);
        if (r < trajMinRadius) trajMinRadius = r;
        if (r > trajMaxRadius) trajMaxRadius = r;
    }

    // Add small margin to account for segment interpolation
    const margin = 0.02;  // 0.02 AU margin
    trajMinRadius = Math.max(0, trajMinRadius - margin);
    trajMaxRadius = trajMaxRadius + margin;

    // ========================================================================
    // PROCESS BODIES (Inner planets first for priority)
    // ========================================================================
    // Sort bodies by orbital radius to process inner planets first
    // This ensures we get the most relevant crossings even if we hit timeout
    const sortedBodies = [...celestialBodies]
        .filter(b => b.elements)  // Only bodies with orbital elements
        .sort((a, b) => a.elements.a - b.elements.a);

    for (const body of sortedBodies) {
        // Skip other bodies when in SOI mode
        if (soiBody && body.name !== soiBody) continue;

        const { a, e, i } = body.elements;

        // ====================================================================
        // PRE-FILTER: Skip bodies outside trajectory radial range
        // ====================================================================
        const perihelion = a * (1 - e);
        const aphelion = a * (1 + e);

        // If body's entire orbital range is outside trajectory range, skip it
        if (aphelion < trajMinRadius || perihelion > trajMaxRadius) {
            continue;  // No possible crossing
        }

        // Track crossing times to avoid floating-point duplicates
        const crossingTimes = new Set();
        // Collect per-body crossings before deduplication
        const bodyCrossings = [];

        // ====================================================================
        // SCAN TRAJECTORY FOR ORBITAL RADIUS CROSSINGS
        // ====================================================================
        // Use segment skip for performance at low zoom
        for (let idx = 0; idx < trajectorySnapshot.length - 1; idx += segmentSkip) {
            const p1 = trajectorySnapshot[idx];
            // When skipping segments, use the next available point (not idx+1)
            const nextIdx = Math.min(idx + segmentSkip, trajectorySnapshot.length - 1);
            const p2 = trajectorySnapshot[nextIdx];

            // Filter past intersections
            if (p2.time < currentTime) {
                continue;
            }

            // Use radius crossing detection - reliably finds when trajectory
            // crosses the planet's orbital distance from the Sun.
            // For eccentric orbits, refines timing using planet's actual radius.
            const crossings = findOrbitalPlaneCrossings(p1, p2, body.elements);

            for (const nominalCrossing of crossings) {
                // HYBRID ANCHOR-REFINE: For eccentric orbits, refine the
                // crossing time using the planet's actual heliocentric radius.
                // This corrects timing errors of up to 70 days for Mars.
                const crossing = refineCrossingWithActualRadius(
                    nominalCrossing, body.elements, trajectorySnapshot, idx, segmentSkip
                );

                // Round time to avoid floating-point duplicates
                // Always use high precision (0.001 day ≈ 86 seconds)
                const timeRoundFactor = 1000;
                const timeKey = Math.round(crossing.time * timeRoundFactor);
                if (crossingTimes.has(timeKey)) {
                    continue;  // Skip duplicate crossing
                }
                crossingTimes.add(timeKey);

                // Get planet's actual position at (refined) crossing time
                let planetPos = getPosition(body.elements, crossing.time);

                // For moons, convert parent-relative position to heliocentric
                // getPosition() returns position relative to the parent body for moons,
                // so we must add the parent's position at the crossing time (NOT current time)
                if (body.parent && body.parent !== 'SUN') {
                    const parent = celestialBodies.find(b => b.name === body.parent);
                    if (parent && parent.elements) {
                        const parentPos = getPosition(parent.elements, crossing.time);
                        planetPos = {
                            x: planetPos.x + parentPos.x,
                            y: planetPos.y + parentPos.y,
                            z: planetPos.z + parentPos.z
                        };
                    }
                }

                // Validate position
                if (!isFinite(planetPos.x) || !isFinite(planetPos.y) || !isFinite(planetPos.z)) {
                    continue;
                }

                // Calculate actual ship-to-planet distance at crossing point
                const dx = crossing.position.x - planetPos.x;
                const dy = crossing.position.y - planetPos.y;
                const dz = crossing.position.z - planetPos.z;
                const crossingDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);

                // Calculate angular separation between ship crossing point
                // and planet position (viewed from Sun). This tells the player
                // whether Mars is AHEAD or BEHIND at the crossing time.
                const shipMag = Math.sqrt(
                    crossing.position.x ** 2 + crossing.position.y ** 2 + crossing.position.z ** 2
                );
                const planetMag = Math.sqrt(
                    planetPos.x ** 2 + planetPos.y ** 2 + planetPos.z ** 2
                );
                let angularSeparation = 0;
                let isAhead = false;
                if (shipMag > 1e-10 && planetMag > 1e-10) {
                    const dotProd = crossing.position.x * planetPos.x +
                                    crossing.position.y * planetPos.y +
                                    crossing.position.z * planetPos.z;
                    const cosAngle = Math.max(-1, Math.min(1, dotProd / (shipMag * planetMag)));
                    angularSeparation = Math.acos(cosAngle);

                    // Determine if planet is AHEAD or BEHIND ship in its orbit.
                    // Use 2D cross product in ecliptic plane (z-component of 3D cross product).
                    // Positive cross product means planet is ahead (counter-clockwise from ship).
                    const cross = crossing.position.x * planetPos.y - crossing.position.y * planetPos.x;
                    isAhead = cross > 0;
                }

                bodyCrossings.push({
                    bodyName: body.name,
                    time: crossing.time,
                    bodyPosition: planetPos,
                    trajectoryPosition: crossing.position,
                    distance: crossingDistance,
                    angularSeparation,
                    isAhead
                });
            }
        }

        // Deduplicate multi-radius crossings for this body.
        // Checking perihelion/a/aphelion can produce 2-3 crossings for a single
        // orbit transit. Merge nearby ones, keeping the best intercept.
        const deduped = deduplicateBodyCrossings(bodyCrossings, body.elements);
        intersections.push(...deduped);
    }

    // Sort by time (chronological order), limit to 20 markers
    const results = intersections
        .sort((a, b) => a.time - b.time)
        .slice(0, 20);

    return results;
}

// ============================================================================
// CLOSEST APPROACH DETECTION
// ============================================================================

/**
 * Detect the closest approach between trajectory and each celestial body.
 *
 * Unlike orbital crossing detection (which shows where you cross orbital radii),
 * this function answers the direct navigation question:
 * "What's my minimum distance to each planet, and when does it occur?"
 *
 * This is more useful for actual intercepts because:
 * - You might cross a planet's orbital radius while the planet is elsewhere
 * - What matters is: will you actually get CLOSE to the planet?
 *
 * ALGORITHM:
 * For each body, scan trajectory segments and track the minimum distance
 * between the ship position and the planet's position (at each moment in time).
 * Uses the calculateClosestApproach() function for accurate segment analysis.
 *
 * PERFORMANCE:
 * O(segments × bodies) - typically ~720 × 8 = 5,760 calculations
 * Each calculation is O(1), total time <5ms for typical trajectories.
 *
 * @param {Array} trajectory - Array of {x, y, z, time} points
 * @param {Array} celestialBodies - Array of body objects with {name, elements}
 * @param {number} currentTime - Current game Julian date
 * @returns {Array} Closest approaches: [{bodyName, minDistance, time, shipPos, bodyPos}, ...]
 */
export function detectClosestApproaches(trajectory, celestialBodies, currentTime) {
    // Guard: Empty or invalid trajectory
    if (!trajectory || trajectory.length < 2) {
        return [];
    }

    // Filter to eligible bodies (planets with orbital elements, not moons)
    const bodies = [];
    for (const body of celestialBodies) {
        if (!body.elements) continue;
        if (body.parent && body.parent !== 'SUN') continue;
        bodies.push(body);
    }
    if (bodies.length === 0) return [];

    // Find the first trajectory index at or after currentTime
    let startIdx = 0;
    for (let i = 0; i < trajectory.length; i++) {
        if (trajectory[i].time >= currentTime) {
            startIdx = Math.max(0, i - 1);
            break;
        }
    }

    const results = [];

    // Process each body with pre-computed positions along trajectory.
    // Previously, getPosition() was called 2x per segment per body in
    // the inner loop (11,520 calls for 8 planets x 720 segments).
    // Now we compute positions once per trajectory point per body,
    // reusing p2's position as p1's position for the next segment.
    // This halves getPosition() calls to ~5,760.
    for (const body of bodies) {
        let minDistance = Infinity;
        let closestApproach = null;

        // Compute body position at the first trajectory point
        let bodyPos1 = getPosition(body.elements, trajectory[startIdx].time);
        if (!isFinite(bodyPos1.x)) continue;

        // Scan trajectory segments, reusing previous endpoint
        for (let i = startIdx; i < trajectory.length - 1; i++) {
            const p1 = trajectory[i];
            const p2 = trajectory[i + 1];

            // Compute body position at next trajectory point
            const bodyPos2 = getPosition(body.elements, p2.time);

            // Validate and skip if invalid
            if (!isFinite(bodyPos2.x)) {
                bodyPos1 = bodyPos2;
                continue;
            }

            // Calculate closest approach for this segment
            const approach = calculateClosestApproach(p1, p2, bodyPos1, bodyPos2);

            // Track the minimum
            if (approach.distance < minDistance) {
                minDistance = approach.distance;
                closestApproach = {
                    bodyName: body.name,
                    minDistance: approach.distance,
                    time: approach.time,
                    shipPos: approach.trajectoryPos,
                    bodyPos: approach.bodyPos,
                    daysFromNow: approach.time - currentTime
                };
            }

            // Reuse p2's body position as p1's for next segment
            bodyPos1 = bodyPos2;
        }

        // Only include if we found a valid approach
        if (closestApproach && isFinite(closestApproach.minDistance)) {
            // Recompute bodyPos with getPosition() at exact closest approach time
            // instead of using the linearly-interpolated position from segment analysis.
            const exactBodyPos = getPosition(body.elements, closestApproach.time);
            if (isFinite(exactBodyPos.x) && isFinite(exactBodyPos.y) && isFinite(exactBodyPos.z)) {
                closestApproach.bodyPos = exactBodyPos;
            }
            results.push(closestApproach);
        }
    }

    // Sort by minimum distance (closest first)
    results.sort((a, b) => a.minDistance - b.minDistance);

    return results;
}

// ============================================================================
// NODE CROSSING DETECTION (for plane change maneuvers)
// ============================================================================

/**
 * Detect where the trajectory crosses a target body's orbital plane.
 * These "node crossings" are the optimal points for plane change maneuvers.
 *
 * ORBITAL MECHANICS CONTEXT:
 * Changing orbital inclination is expensive (requires thrust perpendicular to
 * your orbital velocity). The most efficient points to change planes are at
 * the "nodes" - where your orbit crosses the target's orbital plane.
 *
 * At the ascending node (AN): trajectory crosses from below to above target plane
 * At the descending node (DN): trajectory crosses from above to below target plane
 *
 * @param {Array} trajectory - Array of {x, y, z, time} points
 * @param {Object} targetElements - Target body's orbital elements {i, Ω, ...}
 * @param {number} currentTime - Current game Julian date
 * @returns {Array} Node crossings: [{type: 'AN'|'DN', time, position, daysFromNow}, ...]
 */
export function detectNodeCrossings(trajectory, targetElements, currentTime) {
    // Guard: Empty or invalid trajectory
    if (!trajectory || trajectory.length < 2) {
        return [];
    }

    // Guard: No valid target elements
    if (!targetElements || targetElements.i === undefined) {
        return [];
    }

    const { i, Ω } = targetElements;

    // If target has negligible inclination, nodes are meaningless
    if (Math.abs(i) < 0.001) {  // < 0.06°
        return [];
    }

    // Get the normal vector to the target's orbital plane
    const normal = getOrbitalPlaneNormal(i, Ω);

    const crossings = [];

    // Scan trajectory for plane crossings
    for (let idx = 0; idx < trajectory.length - 1; idx++) {
        const p1 = trajectory[idx];
        const p2 = trajectory[idx + 1];

        // Skip past segments
        if (p2.time < currentTime) continue;

        // Calculate signed distance from target's orbital plane for both points
        // d = n · P (positive = above plane, negative = below)
        const d1 = normal.x * p1.x + normal.y * p1.y + normal.z * p1.z;
        const d2 = normal.x * p2.x + normal.y * p2.y + normal.z * p2.z;

        // Check if segment crosses the plane (signs differ or one is zero)
        if (d1 * d2 > 0) {
            continue; // Both on same side, no crossing
        }

        // Avoid division by zero for segments parallel to plane
        const dDiff = d2 - d1;
        if (Math.abs(dDiff) < 1e-15) {
            continue;
        }

        // Find crossing parameter t where d(t) = 0
        const t = -d1 / dDiff;
        const tClamped = Math.max(0, Math.min(1, t));

        // Calculate crossing position
        const crossingPos = {
            x: p1.x + tClamped * (p2.x - p1.x),
            y: p1.y + tClamped * (p2.y - p1.y),
            z: p1.z + tClamped * (p2.z - p1.z)
        };

        // Calculate crossing time
        const crossingTime = p1.time + tClamped * (p2.time - p1.time);

        // Determine node type based on direction of crossing
        // AN: going from negative (below) to positive (above) → d1 < 0, d2 > 0
        // DN: going from positive (above) to negative (below) → d1 > 0, d2 < 0
        const nodeType = d1 < d2 ? 'AN' : 'DN';

        crossings.push({
            type: nodeType,
            time: crossingTime,
            position: crossingPos,
            daysFromNow: crossingTime - currentTime
        });
    }

    // Sort by time (chronological order)
    crossings.sort((a, b) => a.time - b.time);

    return crossings;
}

// ============================================================================
// CONSOLE TESTS & DIAGNOSTICS
// ============================================================================

/**
 * Debug function: Show current intersection detection results
 * Execute in browser console: window.debugIntersections()
 */
export function debugIntersections(trajectory, celestialBodies, currentTime, soiBody) {
    console.log('=== INTERSECTION DEBUG ===');
    console.log(`Trajectory segments: ${trajectory ? trajectory.length - 1 : 'none'}`);
    console.log(`Current time: ${currentTime}`);
    console.log(`SOI body: ${soiBody || 'HELIOCENTRIC'}`);

    if (!trajectory || trajectory.length < 2) {
        console.log('No trajectory to check');
        return;
    }

    console.log(`Trajectory time range: ${trajectory[0].time} to ${trajectory[trajectory.length-1].time}`);
    console.log('\nChecking bodies:');

    for (const body of celestialBodies) {
        if (!body.elements) continue;
        if (soiBody && body.name !== soiBody) continue;

        const threshold = SOI_RADII[body.name] ? SOI_RADII[body.name] * 2 : 0.1;
        console.log(`\n${body.name}: threshold = ${threshold.toFixed(4)} AU`);

        let minDistance = Infinity;
        let minSegment = -1;

        // Check each segment
        for (let i = 0; i < trajectory.length - 1; i++) {
            const p1 = trajectory[i];
            const p2 = trajectory[i + 1];

            const bodyPos1 = { x: 0, y: 0, z: 0 }; // Would need actual calculation
            const bodyPos2 = { x: 0, y: 0, z: 0 };

            // This is simplified - full version would calculate actual positions
            // Just showing the structure for now
        }

        console.log(`  Closest approach: ${minDistance.toFixed(4)} AU at segment ${minSegment}`);
        console.log(`  ${minDistance < threshold ? '✓ DETECTED' : '✗ NOT DETECTED'}`);
    }

    const results = detectIntersections(trajectory, celestialBodies, currentTime, soiBody);
    console.log(`\n=== FINAL RESULTS: ${results.length} intersections ===`);
    results.forEach((r, idx) => {
        console.log(`${idx+1}. ${r.bodyName} at t=${r.time.toFixed(2)} (${r.distance.toFixed(4)} AU)`);
    });
}

/**
 * Run basic tests for closest approach algorithm
 * Execute in browser console: import('/js/lib/intersectionDetector.js').then(m => m.testClosestApproach())
 */
export function testClosestApproach() {
    console.log('=== Closest Approach Algorithm Tests ===\n');

    let passed = 0;
    let failed = 0;

    // Test 1: Intersecting paths (perpendicular crossing)
    console.log('Test 1: Intersecting Paths');
    const p1 = { x: 0, y: 0, z: 0, time: 0 };
    const p2 = { x: 1, y: 0, z: 0, time: 1 };
    const b1 = { x: 0.5, y: 1, z: 0 };
    const b2 = { x: 0.5, y: -1, z: 0 };

    const result1 = calculateClosestApproach(p1, p2, b1, b2);
    console.log('  Expected: s≈0.5, distance≈0, time≈0.5');
    console.log('  Got:', result1);

    if (Math.abs(result1.distance) < 0.01 && Math.abs(result1.time - 0.5) < 0.01) {
        console.log('  ✓ PASS\n');
        passed++;
    } else {
        console.log('  ✗ FAIL\n');
        failed++;
    }

    // Test 2: Parallel motion (constant separation)
    console.log('Test 2: Parallel Motion');
    const p3 = { x: 0, y: 0, z: 0, time: 0 };
    const p4 = { x: 1, y: 0, z: 0, time: 1 };
    const b3 = { x: 0, y: 1, z: 0 };
    const b4 = { x: 1, y: 1, z: 0 };

    const result2 = calculateClosestApproach(p3, p4, b3, b4);
    console.log('  Expected: distance=1.0 (constant)');
    console.log('  Got:', result2);

    if (Math.abs(result2.distance - 1.0) < 0.01) {
        console.log('  ✓ PASS\n');
        passed++;
    } else {
        console.log('  ✗ FAIL\n');
        failed++;
    }

    // Test 3: Diverging paths (minimum at segment start)
    console.log('Test 3: Diverging Paths');
    const p5 = { x: 0, y: 0, z: 0, time: 0 };
    const p6 = { x: 1, y: 1, z: 0, time: 1 };
    const b5 = { x: 0, y: 0.1, z: 0 };
    const b6 = { x: -1, y: 1, z: 0 };

    const result3 = calculateClosestApproach(p5, p6, b5, b6);
    console.log('  Expected: distance≈0.1 (at start), s≈0');
    console.log('  Got:', result3);

    if (Math.abs(result3.distance - 0.1) < 0.05 && result3.time < 0.2) {
        console.log('  ✓ PASS\n');
        passed++;
    } else {
        console.log('  ✗ FAIL\n');
        failed++;
    }

    // Test 4: 3D crossing
    console.log('Test 4: 3D Crossing');
    const p7 = { x: 0, y: 0, z: 0, time: 0 };
    const p8 = { x: 1, y: 1, z: 1, time: 1 };
    const b7 = { x: 1, y: 0, z: 0 };
    const b8 = { x: 0, y: 1, z: 1 };

    const result4 = calculateClosestApproach(p7, p8, b7, b8);
    console.log('  Expected: distance≈0 (crossing), s≈0.5');
    console.log('  Got:', result4);

    if (Math.abs(result4.distance) < 0.1) {
        console.log('  ✓ PASS\n');
        passed++;
    } else {
        console.log('  ✗ FAIL\n');
        failed++;
    }

    // Performance test
    console.log('Test 5: Performance');
    const iterations = 10000;
    const t0 = performance.now();

    for (let i = 0; i < iterations; i++) {
        calculateClosestApproach(p1, p2, b1, b2);
    }

    const elapsed = performance.now() - t0;
    const avgTime = elapsed / iterations;
    console.log(`  ${iterations} iterations in ${elapsed.toFixed(2)}ms`);
    console.log(`  Average: ${avgTime.toFixed(4)}ms per call`);

    if (avgTime < 0.01) {
        console.log('  ✓ PASS (target: <0.01ms)\n');
        passed++;
    } else {
        console.log('  ✗ FAIL (too slow)\n');
        failed++;
    }

    // Summary
    console.log('=== Test Summary ===');
    console.log(`Passed: ${passed}/5`);
    console.log(`Failed: ${failed}/5`);

    if (failed === 0) {
        console.log('✓ All tests passed!');
    } else {
        console.log('✗ Some tests failed');
    }
}
