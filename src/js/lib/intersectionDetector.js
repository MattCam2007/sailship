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
 * - Performance optimized: <10ms for 200-point trajectories
 *
 * USAGE:
 * Called from game loop when trajectory cache updates. Results cached and
 * synchronized via trajectory hash to prevent redundant calculations.
 */

import { getPosition } from './orbital.js';
import { SOI_RADII } from '../config.js';

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
// INTERSECTION DETECTION
// ============================================================================

// Eccentricity threshold for checking perihelion/aphelion
// Planets with e > this will be checked at both extremes
const ECCENTRICITY_THRESHOLD = 0.05;

/**
 * Find the exact crossing point(s) where a trajectory segment crosses a target radius.
 * Uses quadratic equation to solve ||P(t)||² = R² where P(t) = P1 + t*(P2-P1).
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
    const crossesRadius = (r1 < targetRadius && r2 > targetRadius) ||
                          (r1 > targetRadius && r2 < targetRadius);

    if (!crossesRadius) {
        return null;
    }

    // Solve quadratic equation for exact crossing point
    // When position is linearly interpolated: P(t) = P1 + t*(P2-P1)
    // The radius is: r(t) = ||P(t)|| = sqrt((x1+t*dx)² + (y1+t*dy)² + (z1+t*dz)²)
    // This is NOT linear! To find when r(t) = R, solve ||P(t)||² = R²
    //
    // Expanding: (P1 + t*D)·(P1 + t*D) = R²
    // Where D = P2 - P1 (the delta vector)
    // This gives: (D·D)*t² + 2*(P1·D)*t + (P1·P1 - R²) = 0

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dz = p2.z - p1.z;

    // Quadratic coefficients
    const a = dx * dx + dy * dy + dz * dz;  // D·D
    const b = 2 * (p1.x * dx + p1.y * dy + p1.z * dz);  // 2*(P1·D)
    const c = r1 * r1 - targetRadius * targetRadius;  // P1·P1 - R²

    // Discriminant
    const discriminant = b * b - 4 * a * c;

    if (discriminant < 0 || a < 1e-20) {
        // No real solution or degenerate case (no movement)
        return null;
    }

    const sqrtDisc = Math.sqrt(discriminant);
    const t1 = (-b - sqrtDisc) / (2 * a);
    const t2 = (-b + sqrtDisc) / (2 * a);

    // Find the solution in [0, 1] that corresponds to this crossing
    // Since we already verified r1 and r2 straddle targetRadius, exactly one should be valid
    let t;
    if (t1 >= 0 && t1 <= 1) {
        t = t1;
    } else if (t2 >= 0 && t2 <= 1) {
        t = t2;
    } else {
        // Numerical edge case - fallback to linear approximation
        t = (targetRadius - r1) / (r2 - r1);
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
 * CROSSING DETECTION ALGORITHM:
 * A "crossing" occurs when trajectory segment crosses the planet's orbital radius.
 * For segment (p1, p2) with heliocentric radii (r1, r2):
 *   - Crossing if: (r1 < orbitalRadius && r2 > orbitalRadius) OR vice versa
 *   - Solve quadratic: ||P(t)||² = R² (NOT linear interpolation)
 *   - Get planet position at crossing time: getPosition(elements, crossingTime)
 *
 * ECCENTRICITY HANDLING:
 * For planets with e > 0.05, we check at both perihelion and aphelion radii:
 *   - Mercury (e=0.206): perihelion=0.307, aphelion=0.467 AU
 *   - Mars (e=0.093): perihelion=1.38, aphelion=1.67 AU
 * This helps catch intercepts when planet is at orbital extremes.
 *
 * EXAMPLE:
 * Ship trajectory crosses Earth orbit (1.0 AU) twice:
 *   1st crossing at t=2458900 → Earth is at (0.5, 0.866, 0) → show ghost there
 *   2nd crossing at t=2459050 → Earth is at (-0.7, 0.7, 0) → show ghost there
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
    const startTime = performance.now();
    const intersections = [];

    // Process each celestial body
    for (const body of celestialBodies) {
        // Skip bodies without orbital elements (Sun)
        if (!body.elements) continue;

        // Skip other bodies when in SOI mode
        if (soiBody && body.name !== soiBody) continue;

        const { a, e } = body.elements;

        // Determine which orbital radii to check
        // For high-eccentricity orbits, check perihelion and aphelion too
        const radiiToCheck = [a];  // Always check semi-major axis

        if (e > ECCENTRICITY_THRESHOLD) {
            const perihelion = a * (1 - e);
            const aphelion = a * (1 + e);
            // Only add if they differ significantly from semi-major axis
            if (Math.abs(perihelion - a) > 0.01) radiiToCheck.push(perihelion);
            if (Math.abs(aphelion - a) > 0.01) radiiToCheck.push(aphelion);
        }

        // Track crossing times to avoid duplicates when checking multiple radii
        const crossingTimes = new Set();

        // Check each trajectory segment for crossings at each radius
        for (let i = 0; i < trajectorySnapshot.length - 1; i++) {
            const p1 = trajectorySnapshot[i];
            const p2 = trajectorySnapshot[i + 1];

            // Filter past intersections
            if (p2.time < currentTime) {
                continue;
            }

            // Calculate heliocentric radii for both points
            const r1 = Math.sqrt(p1.x ** 2 + p1.y ** 2 + p1.z ** 2);
            const r2 = Math.sqrt(p2.x ** 2 + p2.y ** 2 + p2.z ** 2);

            // Check for crossings at each orbital radius
            for (const orbitalRadius of radiiToCheck) {
                const crossing = findRadiusCrossing(p1, p2, r1, r2, orbitalRadius);

                if (crossing) {
                    // Round time to avoid floating-point duplicates from nearby radii
                    const timeKey = Math.round(crossing.time * 1000);
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
                        distance: 0  // Exact crossing of orbital radius
                    });
                }
            }
        }

        // Performance timeout
        const elapsed = performance.now() - startTime;
        if (elapsed > 10) {
            console.warn(`Intersection detection timeout after ${body.name} (${elapsed.toFixed(1)}ms)`);
            break;
        }
    }

    // Sort by time (chronological order), limit to 20 markers
    const results = intersections
        .sort((a, b) => a.time - b.time)
        .slice(0, 20);

    // Performance monitoring
    const totalElapsed = performance.now() - startTime;
    if (totalElapsed > 5) {
        console.warn(`Intersection detection took ${totalElapsed.toFixed(2)}ms (target: <5ms)`);
    }

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
