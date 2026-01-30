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
 * - ZOOM-ADAPTIVE: Reduces precision at low zoom for performance
 * - Stable detection: Consistent results prevent flickering
 *
 * USAGE:
 * Called from game loop when trajectory cache updates. Results cached and
 * synchronized via trajectory hash to prevent redundant calculations.
 */

import { getPosition } from './orbital.js';
import { SOI_RADII } from '../config.js';
import { camera } from '../core/camera.js';

// ============================================================================
// CROSSING REFINEMENT CONFIGURATION
// ============================================================================

/**
 * Configuration for crossing point refinement.
 * Sub-segment bisection improves accuracy of crossing time detection.
 *
 * ZOOM-ADAPTIVE: These values are scaled based on camera zoom level.
 * At low zoom (system view): Less precision needed, faster computation.
 * At high zoom (fine-tuning): Full precision for accurate encounter planning.
 */
const REFINEMENT_CONFIG = {
    /**
     * Number of bisection iterations for crossing refinement at HIGH zoom.
     * Each iteration halves the uncertainty interval.
     * 10 iterations: 7.2 hours → ~25 seconds precision
     */
    bisectionIterationsHigh: 10,

    /**
     * Number of bisection iterations at LOW zoom (system view).
     * 4 iterations: 7.2 hours → ~27 minutes precision (adequate for visual)
     */
    bisectionIterationsLow: 4,

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
 * Get the number of bisection iterations based on current zoom level.
 * Higher zoom = more precision needed = more iterations.
 */
function getBisectionIterations() {
    const zoom = camera?.zoom ?? 1;
    if (zoom < REFINEMENT_CONFIG.zoomThreshold) {
        return REFINEMENT_CONFIG.bisectionIterationsLow;
    }
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
 * Precision improvement:
 * - Initial segment: ~7.2 hours (200 steps / 60 days)
 * - After 10 iterations: ~7.2 hours / 2^10 ≈ 25 seconds
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
const ECCENTRICITY_THRESHOLD = 0.05;

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
 * Find where a trajectory segment crosses a body's orbital plane.
 * This is more accurate than spherical radius crossing for inclined orbits.
 *
 * Uses a HYBRID approach:
 * - For inclined orbits (i > ~0.5°): Use orbital plane crossing detection
 * - For nearly coplanar orbits: Fall back to radius crossing
 *
 * This hybrid approach ensures:
 * - Accurate visual alignment for inclined orbits (Venus, Mercury) at tactical zoom
 * - Correct detection for coplanar orbits (Earth, Mars) where trajectory is in the orbital plane
 *
 * Algorithm:
 * 1. Calculate orbital plane normal from body's inclination and longitude of ascending node
 * 2. Check if trajectory segment meaningfully crosses this plane
 * 3. If segment is nearly coplanar, fall back to radius crossing
 * 4. Otherwise, find plane crossing and verify radial distance is in range
 *
 * @param {Object} p1 - Start point {x, y, z, time}
 * @param {Object} p2 - End point {x, y, z, time}
 * @param {Object} elements - Body's orbital elements {a, e, i, Ω, ω}
 * @returns {Object|null} Crossing info {t, time, position} or null if no crossing
 */
function findOrbitalPlaneCrossing(p1, p2, elements) {
    const { a, e, i, Ω } = elements;

    // Threshold for "significant" inclination (in radians)
    // ~0.5° = 0.0087 radians - below this, use radius crossing for better accuracy
    const INCLINATION_THRESHOLD = 0.0087;

    // For low-inclination orbits, use radius crossing method
    // This handles Earth, Mars, and other nearly-ecliptic bodies correctly
    if (Math.abs(i) < INCLINATION_THRESHOLD) {
        // Calculate heliocentric radii
        const r1 = Math.sqrt(p1.x ** 2 + p1.y ** 2 + p1.z ** 2);
        const r2 = Math.sqrt(p2.x ** 2 + p2.y ** 2 + p2.z ** 2);

        // Use semi-major axis as target radius
        return findRadiusCrossing(p1, p2, r1, r2, a);
    }

    // Get the orbital plane normal for inclined orbits
    const normal = getOrbitalPlaneNormal(i, Ω);

    // Calculate signed distance from orbital plane for both points
    // d = n · P (plane passes through origin/Sun)
    const d1 = normal.x * p1.x + normal.y * p1.y + normal.z * p1.z;
    const d2 = normal.x * p2.x + normal.y * p2.y + normal.z * p2.z;

    // Check if segment crosses the plane (signs differ)
    // Include case where one point is exactly on plane (d=0)
    if (d1 * d2 > 0) {
        return null; // Both on same side, no crossing
    }

    // Calculate segment length for coplanarity check
    const segmentLength = Math.sqrt(
        (p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2 + (p2.z - p1.z) ** 2
    );

    // If both points are very close to the plane relative to segment length,
    // the trajectory is nearly coplanar - fall back to radius crossing
    const planeDistanceThreshold = 0.001 * segmentLength; // 0.1% of segment length
    if (Math.abs(d1) < planeDistanceThreshold && Math.abs(d2) < planeDistanceThreshold) {
        // Nearly coplanar - use radius crossing
        const r1 = Math.sqrt(p1.x ** 2 + p1.y ** 2 + p1.z ** 2);
        const r2 = Math.sqrt(p2.x ** 2 + p2.y ** 2 + p2.z ** 2);
        return findRadiusCrossing(p1, p2, r1, r2, a);
    }

    // Find crossing parameter t where d(t) = 0
    // d(t) = d1 + t * (d2 - d1) = 0
    // t = -d1 / (d2 - d1)
    const dDiff = d2 - d1;
    if (Math.abs(dDiff) < 1e-15) {
        return null; // Parallel to plane
    }

    const t = -d1 / dDiff;

    // Clamp t to [0, 1] for safety (should already be there due to sign check)
    const tClamped = Math.max(0, Math.min(1, t));

    // Calculate crossing position
    const crossingPos = {
        x: p1.x + tClamped * (p2.x - p1.x),
        y: p1.y + tClamped * (p2.y - p1.y),
        z: p1.z + tClamped * (p2.z - p1.z)
    };

    // Calculate radial distance at crossing point
    const rCrossing = Math.sqrt(
        crossingPos.x ** 2 + crossingPos.y ** 2 + crossingPos.z ** 2
    );

    // Check if crossing is within the orbital radius range
    const perihelion = a * (1 - e);
    const aphelion = a * (1 + e);

    // Add small tolerance for numerical precision
    const tolerance = 0.005; // 0.005 AU tolerance
    if (rCrossing < perihelion - tolerance || rCrossing > aphelion + tolerance) {
        return null; // Crossing is outside the orbital radius range
    }

    // Calculate crossing time
    const crossingTime = p1.time + tClamped * (p2.time - p1.time);

    return {
        t: tClamped,
        time: crossingTime,
        position: crossingPos
    };
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
 * Detect when trajectory crosses orbital paths and show planet positions at those times
 *
 * CROSSING DETECTION ALGORITHM (ORBITAL PLANE METHOD):
 * A "crossing" occurs when trajectory segment crosses the planet's ORBITAL PLANE
 * (not just a spherical radius). This ensures visual alignment at high zoom.
 *
 * For segment (p1, p2):
 *   1. Calculate orbital plane normal from body's inclination (i) and ascending node (Ω)
 *   2. Find where segment pierces this plane (signed distance changes sign)
 *   3. Check if crossing point's radial distance is within [perihelion, aphelion]
 *   4. Get planet position at crossing time: getPosition(elements, crossingTime)
 *
 * WHY ORBITAL PLANE (not spherical radius):
 * At tactical zoom, planets with non-zero inclination (Venus 3.4°, Mercury 7°)
 * have visibly tilted orbital paths. A trajectory crossing r=0.723 AU might be
 * in the ecliptic plane while Venus's orbit is 3.4° above/below. The orbital
 * plane method ensures the crossing point is actually on the drawn orbital path.
 *
 * ZOOM-ADAPTIVE OPTIMIZATION:
 * - At low zoom: Skip segments (check every Nth), fewer bisection iterations
 * - At high zoom: Full resolution for accurate encounter planning
 * - Pre-filters bodies by radial range to skip impossible crossings
 *
 * EXAMPLE:
 * Ship trajectory crosses Venus's orbital plane at two points:
 *   1st crossing: trajectory pierces plane, r=0.72 AU → show ghost at Venus's position
 *   2nd crossing: trajectory pierces plane again, r=0.71 AU → show second ghost
 * As you adjust sails, crossing times shift, ghost positions update in real-time.
 *
 * @param {Array} trajectory - Array of {x, y, z, time} points (ship path from trajectory predictor)
 * @param {Array} celestialBodies - Array of body objects with {name, elements, parent}
 * @param {number} currentTime - Current game Julian date (filters out past crossings)
 * @param {string|null} soiBody - Current SOI body name (null = heliocentric mode)
 * @returns {Array} Intersection events sorted by time: [{bodyName, time, bodyPosition, trajectoryPosition, distance}, ...]
 */
export function detectIntersections(trajectory, celestialBodies, currentTime, soiBody = null) {
    // Guard: Empty or invalid trajectory
    if (!trajectory || trajectory.length < 2) {
        return [];
    }

    const trajectorySnapshot = trajectory;
    const intersections = [];

    // ========================================================================
    // ZOOM-ADAPTIVE OPTIMIZATION
    // ========================================================================
    // At low zoom (viewing entire system), we don't need to check every segment.
    // Skip segments to reduce computation while still catching all crossings.
    const zoom = camera?.zoom ?? 1;
    const isLowZoom = zoom < REFINEMENT_CONFIG.zoomThreshold;

    // Segment skip factor: check every Nth segment at low zoom
    // At zoom < 0.5: check every 4th segment
    // At zoom 0.5-2: check every 2nd segment
    // At zoom >= 2: check every segment
    let segmentSkip = 1;
    if (zoom < 0.5) {
        segmentSkip = 4;
    } else if (zoom < 2) {
        segmentSkip = 2;
    }

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

        // Track crossing times to avoid duplicates
        const crossingTimes = new Set();

        // ====================================================================
        // SCAN TRAJECTORY FOR ORBITAL PLANE CROSSINGS
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

            // Use orbital plane crossing detection for accurate alignment
            // This ensures the ghost planet appears where trajectory visually
            // crosses the drawn orbital path, accounting for orbital inclination
            const crossing = findOrbitalPlaneCrossing(p1, p2, body.elements);

            if (crossing) {
                // Round time to avoid floating-point duplicates
                // Use coarser rounding at low zoom (1 day) vs high zoom (0.001 day)
                const timeRoundFactor = isLowZoom ? 1 : 1000;
                const timeKey = Math.round(crossing.time * timeRoundFactor);
                if (crossingTimes.has(timeKey)) {
                    continue;  // Skip duplicate crossing
                }
                crossingTimes.add(timeKey);

                // Get planet's actual position at crossing time
                const planetPos = getPosition(body.elements, crossing.time);

                // Validate position
                if (!isFinite(planetPos.x) || !isFinite(planetPos.y) || !isFinite(planetPos.z)) {
                    continue;
                }

                // Add intersection
                intersections.push({
                    bodyName: body.name,
                    time: crossing.time,
                    bodyPosition: planetPos,
                    trajectoryPosition: crossing.position,
                    distance: 0  // Exact crossing of orbital plane
                });
            }
        }
    }

    // Sort by time (chronological order), limit to 20 markers
    const results = intersections
        .sort((a, b) => a.time - b.time)
        .slice(0, 20);

    return results;
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
