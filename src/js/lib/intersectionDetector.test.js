/**
 * Comprehensive test suite for intersection detector
 *
 * Run in browser console:
 * import('/js/lib/intersectionDetector.test.js').then(m => m.runAllTests())
 */

import { calculateClosestApproach, detectIntersections } from './intersectionDetector.js';
import { getPosition } from './orbital.js';
import { J2000, MU_SUN } from '../config.js';

/**
 * Run all intersection detector tests
 */
export function runAllTests() {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║  INTERSECTION DETECTOR TEST SUITE                ║');
    console.log('╚══════════════════════════════════════════════════╝\n');

    let totalPassed = 0;
    let totalFailed = 0;

    const results = [
        testVectorMath(),
        testClosestApproachParallel(),
        testClosestApproachIntersecting(),
        testClosestApproachPerpendicular(),
        testClosestApproachDiverging(),
        testFullDetectionEmpty(),
        testFullDetectionWithIntersection(),
        testPastIntersectionFiltering(),
        testSOIMode(),
        testPerformance()
    ];

    results.forEach(r => {
        totalPassed += r.passed;
        totalFailed += r.failed;
    });

    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║  TEST SUMMARY                                    ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log(`Total Passed: ${totalPassed}`);
    console.log(`Total Failed: ${totalFailed}`);

    if (totalFailed === 0) {
        console.log('\n✅ ALL TESTS PASSED!');
    } else {
        console.log(`\n❌ ${totalFailed} TEST(S) FAILED`);
    }

    return { passed: totalPassed, failed: totalFailed };
}

/**
 * Test helper: Assert with custom message
 */
function assert(condition, message) {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
}

/**
 * Test 1: Vector Math Utilities
 */
function testVectorMath() {
    console.log('📋 Test 1: Vector Math Utilities');

    let passed = 0;
    let failed = 0;

    try {
        // Test basic operations (via calculateClosestApproach internals)
        const p1 = { x: 1, y: 2, z: 3, time: 0 };
        const p2 = { x: 4, y: 5, z: 6, time: 1 };
        const b1 = { x: 0, y: 0, z: 0 };
        const b2 = { x: 1, y: 1, z: 1 };

        const result = calculateClosestApproach(p1, p2, b1, b2);

        assert(result.hasOwnProperty('time'), 'Result has time property');
        assert(result.hasOwnProperty('distance'), 'Result has distance property');
        assert(result.hasOwnProperty('trajectoryPos'), 'Result has trajectoryPos');
        assert(result.hasOwnProperty('bodyPos'), 'Result has bodyPos');
        assert(isFinite(result.distance), 'Distance is finite');

        console.log('  ✅ PASS: Vector operations produce valid results\n');
        passed++;
    } catch (e) {
        console.log(`  ❌ FAIL: ${e.message}\n`);
        failed++;
    }

    return { passed, failed };
}

/**
 * Test 2: Parallel Motion
 */
function testClosestApproachParallel() {
    console.log('📋 Test 2: Closest Approach - Parallel Motion');

    let passed = 0;
    let failed = 0;

    try {
        const p1 = { x: 0, y: 0, z: 0, time: 0 };
        const p2 = { x: 1, y: 0, z: 0, time: 1 };
        const b1 = { x: 0, y: 2, z: 0 };
        const b2 = { x: 1, y: 2, z: 0 };

        const result = calculateClosestApproach(p1, p2, b1, b2);

        console.log(`  Expected: distance ≈ 2.0`);
        console.log(`  Got: distance = ${result.distance.toFixed(4)}`);

        assert(Math.abs(result.distance - 2.0) < 0.01, 'Distance should be 2.0');

        console.log('  ✅ PASS: Parallel motion maintains constant distance\n');
        passed++;
    } catch (e) {
        console.log(`  ❌ FAIL: ${e.message}\n`);
        failed++;
    }

    return { passed, failed };
}

/**
 * Test 3: Intersecting Paths
 */
function testClosestApproachIntersecting() {
    console.log('📋 Test 3: Closest Approach - Intersecting Paths');

    let passed = 0;
    let failed = 0;

    try {
        const p1 = { x: 0, y: 0, z: 0, time: 0 };
        const p2 = { x: 1, y: 0, z: 0, time: 1 };
        const b1 = { x: 0.5, y: 1, z: 0 };
        const b2 = { x: 0.5, y: -1, z: 0 };

        const result = calculateClosestApproach(p1, p2, b1, b2);

        console.log(`  Expected: distance ≈ 0, time ≈ 0.5`);
        console.log(`  Got: distance = ${result.distance.toFixed(4)}, time = ${result.time.toFixed(4)}`);

        assert(Math.abs(result.distance) < 0.1, 'Distance should be near zero');
        assert(Math.abs(result.time - 0.5) < 0.01, 'Time should be 0.5');

        console.log('  ✅ PASS: Intersecting paths cross at correct time\n');
        passed++;
    } catch (e) {
        console.log(`  ❌ FAIL: ${e.message}\n`);
        failed++;
    }

    return { passed, failed };
}

/**
 * Test 4: Perpendicular Crossing
 */
function testClosestApproachPerpendicular() {
    console.log('📋 Test 4: Closest Approach - Perpendicular Paths');

    let passed = 0;
    let failed = 0;

    try {
        const p1 = { x: -1, y: 0, z: 0, time: 0 };
        const p2 = { x: 1, y: 0, z: 0, time: 1 };
        const b1 = { x: 0, y: -1, z: 0 };
        const b2 = { x: 0, y: 1, z: 0 };

        const result = calculateClosestApproach(p1, p2, b1, b2);

        console.log(`  Expected: distance ≈ 0 (at origin)`);
        console.log(`  Got: distance = ${result.distance.toFixed(4)}`);

        assert(Math.abs(result.distance) < 0.1, 'Distance should be near zero');

        console.log('  ✅ PASS: Perpendicular paths cross correctly\n');
        passed++;
    } catch (e) {
        console.log(`  ❌ FAIL: ${e.message}\n`);
        failed++;
    }

    return { passed, failed };
}

/**
 * Test 5: Diverging Paths
 */
function testClosestApproachDiverging() {
    console.log('📋 Test 5: Closest Approach - Diverging Paths');

    let passed = 0;
    let failed = 0;

    try {
        const p1 = { x: 0, y: 0, z: 0, time: 0 };
        const p2 = { x: 1, y: 1, z: 0, time: 1 };
        const b1 = { x: 0, y: 0.1, z: 0 };
        const b2 = { x: -1, y: 1, z: 0 };

        const result = calculateClosestApproach(p1, p2, b1, b2);

        console.log(`  Expected: minimum distance near start`);
        console.log(`  Got: distance = ${result.distance.toFixed(4)}, time = ${result.time.toFixed(4)}`);

        assert(result.distance > 0, 'Distance should be positive');
        assert(result.time >= 0 && result.time <= 1, 'Time should be in [0,1]');

        console.log('  ✅ PASS: Diverging paths handled correctly\n');
        passed++;
    } catch (e) {
        console.log(`  ❌ FAIL: ${e.message}\n`);
        failed++;
    }

    return { passed, failed };
}

/**
 * Test 6: Full Detection - Empty Result
 */
function testFullDetectionEmpty() {
    console.log('📋 Test 6: Full Detection - No Intersections');

    let passed = 0;
    let failed = 0;

    try {
        // Trajectory far from any bodies
        const trajectory = [];
        for (let i = 0; i < 50; i++) {
            trajectory.push({
                x: 10 + i * 0.1,  // Way out at 10+ AU
                y: 0,
                z: 0,
                time: J2000 + i
            });
        }

        // Mock Earth at 1 AU
        const mockBodies = [{
            name: 'EARTH',
            elements: {
                a: 1.0,
                e: 0.0167,
                i: 0,
                Ω: 0,
                ω: 0,
                M0: 0,
                epoch: J2000,
                μ: MU_SUN
            }
        }];

        const intersections = detectIntersections(trajectory, mockBodies, J2000, null);

        console.log(`  Expected: 0 intersections`);
        console.log(`  Got: ${intersections.length} intersections`);

        assert(intersections.length === 0, 'Should find no intersections');

        console.log('  ✅ PASS: No false positives for distant trajectory\n');
        passed++;
    } catch (e) {
        console.log(`  ❌ FAIL: ${e.message}\n`);
        failed++;
    }

    return { passed, failed };
}

/**
 * Test 7: Full Detection - With Intersection
 */
function testFullDetectionWithIntersection() {
    console.log('📋 Test 7: Full Detection - With Intersections');

    let passed = 0;
    let failed = 0;

    try {
        // Trajectory crossing Earth orbit
        const trajectory = [];
        for (let i = 0; i < 100; i++) {
            const t = i / 100;
            trajectory.push({
                x: 0.9 + t * 0.2,  // Move from 0.9 to 1.1 AU (crosses Earth)
                y: 0,
                z: 0,
                time: J2000 + i
            });
        }

        // Mock Earth
        const mockBodies = [{
            name: 'EARTH',
            elements: {
                a: 1.0,
                e: 0.0167,
                i: 0,
                Ω: 0,
                ω: 0,
                M0: 0,
                epoch: J2000,
                μ: MU_SUN
            }
        }];

        const intersections = detectIntersections(trajectory, mockBodies, J2000, null);

        console.log(`  Expected: At least 1 intersection`);
        console.log(`  Got: ${intersections.length} intersection(s)`);

        assert(intersections.length > 0, 'Should find at least one intersection');

        if (intersections.length > 0) {
            console.log(`  First intersection: ${intersections[0].bodyName} at distance ${intersections[0].distance.toFixed(4)} AU`);
        }

        console.log('  ✅ PASS: Detected trajectory crossing Earth orbit\n');
        passed++;
    } catch (e) {
        console.log(`  ❌ FAIL: ${e.message}\n`);
        failed++;
    }

    return { passed, failed };
}

/**
 * Test 8: Past Intersection Filtering
 */
function testPastIntersectionFiltering() {
    console.log('📋 Test 8: Past Intersection Filtering');

    let passed = 0;
    let failed = 0;

    try {
        // Trajectory in the past
        const trajectory = [];
        for (let i = 0; i < 50; i++) {
            trajectory.push({
                x: 1.0,
                y: 0,
                z: 0,
                time: J2000 - 100 + i  // 100 days in the past
            });
        }

        // Mock Earth
        const mockBodies = [{
            name: 'EARTH',
            elements: {
                a: 1.0,
                e: 0.0167,
                i: 0,
                Ω: 0,
                ω: 0,
                M0: 0,
                epoch: J2000,
                μ: MU_SUN
            }
        }];

        // Current time is J2000 (trajectory is in past)
        const intersections = detectIntersections(trajectory, mockBodies, J2000, null);

        console.log(`  Expected: 0 intersections (all in past)`);
        console.log(`  Got: ${intersections.length} intersections`);

        assert(intersections.length === 0, 'Past intersections should be filtered');

        console.log('  ✅ PASS: Past intersections correctly filtered\n');
        passed++;
    } catch (e) {
        console.log(`  ❌ FAIL: ${e.message}\n`);
        failed++;
    }

    return { passed, failed };
}

/**
 * Test 9: SOI Mode Filtering
 */
function testSOIMode() {
    console.log('📋 Test 9: SOI Mode - Body Filtering');

    let passed = 0;
    let failed = 0;

    try {
        // Simple trajectory
        const trajectory = [];
        for (let i = 0; i < 50; i++) {
            trajectory.push({
                x: 0.01,
                y: 0,
                z: 0,
                time: J2000 + i
            });
        }

        // Mock Earth and Mars
        const mockBodies = [
            {
                name: 'EARTH',
                elements: {
                    a: 1.0,
                    e: 0.0167,
                    i: 0,
                    Ω: 0,
                    ω: 0,
                    M0: 0,
                    epoch: J2000,
                    μ: MU_SUN
                }
            },
            {
                name: 'MARS',
                elements: {
                    a: 1.524,
                    e: 0.0934,
                    i: 0.0322,
                    Ω: 0.865,
                    ω: 5.865,
                    M0: 0.338,
                    epoch: J2000,
                    μ: MU_SUN
                }
            }
        ];

        // In Earth SOI - should only check Earth
        const intersections = detectIntersections(trajectory, mockBodies, J2000, 'EARTH');

        console.log(`  Expected: Only Earth checked (no Mars intersections)`);
        console.log(`  Got: ${intersections.length} intersection(s)`);

        // Verify no Mars intersections
        const marsIntersections = intersections.filter(i => i.bodyName === 'MARS');
        assert(marsIntersections.length === 0, 'Mars should not appear in Earth SOI mode');

        console.log('  ✅ PASS: SOI mode filters other bodies correctly\n');
        passed++;
    } catch (e) {
        console.log(`  ❌ FAIL: ${e.message}\n`);
        failed++;
    }

    return { passed, failed };
}

/**
 * Test 10: Performance Benchmark
 */
function testPerformance() {
    console.log('📋 Test 10: Performance Benchmark');

    let passed = 0;
    let failed = 0;

    try {
        // Create realistic trajectory (200 points)
        const trajectory = [];
        for (let i = 0; i < 200; i++) {
            const angle = i * 0.05;
            trajectory.push({
                x: Math.cos(angle),
                y: Math.sin(angle),
                z: 0,
                time: J2000 + i * 0.3
            });
        }

        // Mock 9 bodies (realistic count)
        const mockBodies = [];
        for (let i = 0; i < 9; i++) {
            mockBodies.push({
                name: `BODY${i}`,
                elements: {
                    a: 0.5 + i * 0.3,
                    e: 0.01,
                    i: 0,
                    Ω: 0,
                    ω: 0,
                    M0: i * 0.5,
                    epoch: J2000,
                    μ: MU_SUN
                }
            });
        }

        // Benchmark
        const iterations = 10;
        const times = [];

        for (let i = 0; i < iterations; i++) {
            const t0 = performance.now();
            detectIntersections(trajectory, mockBodies, J2000, null);
            const elapsed = performance.now() - t0;
            times.push(elapsed);
        }

        const avgTime = times.reduce((a, b) => a + b, 0) / iterations;
        const minTime = Math.min(...times);
        const maxTime = Math.max(...times);

        console.log(`  Trajectory: 200 segments × 9 bodies`);
        console.log(`  Average: ${avgTime.toFixed(2)}ms`);
        console.log(`  Min: ${minTime.toFixed(2)}ms`);
        console.log(`  Max: ${maxTime.toFixed(2)}ms`);
        console.log(`  Target: < 10ms`);

        assert(avgTime < 10, `Average time (${avgTime.toFixed(2)}ms) exceeds 10ms target`);

        console.log('  ✅ PASS: Performance within target\n');
        passed++;
    } catch (e) {
        console.log(`  ❌ FAIL: ${e.message}\n`);
        failed++;
    }

    return { passed, failed };
}
