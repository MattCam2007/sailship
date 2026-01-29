/**
 * Orbit Crossing Detection Test Suite
 *
 * Tests the NEW crossing detection algorithm (not the old closest approach).
 * These tests validate the core trajectory planning feature that shows ghost
 * planets when trajectory crosses orbital paths.
 *
 * Run in browser console:
 * import('/js/lib/intersectionDetector.crossing.test.js').then(m => m.runAllTests())
 */

import { detectIntersections } from './intersectionDetector.js';
import { J2000, MU_SUN } from '../config.js';

/**
 * Run all crossing detection tests
 */
export function runAllTests() {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║  ORBIT CROSSING DETECTION TEST SUITE            ║');
    console.log('╚══════════════════════════════════════════════════╝\n');

    let totalPassed = 0;
    let totalFailed = 0;

    const results = [
        testSingleCrossingInbound(),
        testSingleCrossingOutbound(),
        testDoubleCrossing(),
        testNoCrossingInside(),
        testNoCrossingOutside(),
        testTangentTrajectory(),
        testMultipleBodiesCrossings(),
        testInterpolationAccuracy(),
        testStartingInsideOrbit(),
        testEndingInsideOrbit(),
        testExactlyAtOrbitalRadius(),
        testHighEccentricityApproximation(),
        testCrossingOrder(),
        testRealWorldScenario()
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
 * Helper: Create mock body
 */
function createMockBody(name, semiMajorAxis) {
    return {
        name,
        elements: {
            a: semiMajorAxis,
            e: 0.01,  // Low eccentricity (circular approximation valid)
            i: 0,
            Ω: 0,
            ω: 0,
            M0: 0,
            epoch: J2000,
            μ: MU_SUN
        }
    };
}

/**
 * Test 1: Single Crossing - Inbound (outside → inside)
 */
function testSingleCrossingInbound() {
    console.log('📋 Test 1: Single Crossing - Inbound');

    let passed = 0;
    let failed = 0;

    try {
        // Trajectory: 1.5 AU → 0.5 AU (crosses Earth orbit at 1.0 AU going inward)
        const trajectory = [];
        for (let i = 0; i < 20; i++) {
            const t = i / 20;
            const r = 1.5 - t * 1.0;  // 1.5 → 0.5
            trajectory.push({
                x: r,
                y: 0,
                z: 0,
                time: J2000 + i
            });
        }

        const bodies = [createMockBody('EARTH', 1.0)];
        const intersections = detectIntersections(trajectory, bodies, J2000, null);

        console.log(`  Expected: 1 crossing (inbound at 1.0 AU)`);
        console.log(`  Got: ${intersections.length} crossing(s)`);

        assert(intersections.length === 1, 'Should detect exactly 1 crossing');
        assert(intersections[0].bodyName === 'EARTH', 'Should be Earth crossing');

        // Verify crossing is near 1.0 AU
        const crossPos = intersections[0].trajectoryPosition;
        const crossRadius = Math.sqrt(crossPos.x ** 2 + crossPos.y ** 2 + crossPos.z ** 2);
        console.log(`  Crossing radius: ${crossRadius.toFixed(4)} AU`);
        assert(Math.abs(crossRadius - 1.0) < 0.01, 'Crossing should be at 1.0 AU');

        console.log('  ✅ PASS: Inbound crossing detected correctly\n');
        passed++;
    } catch (e) {
        console.log(`  ❌ FAIL: ${e.message}\n`);
        failed++;
    }

    return { passed, failed };
}

/**
 * Test 2: Single Crossing - Outbound (inside → outside)
 */
function testSingleCrossingOutbound() {
    console.log('📋 Test 2: Single Crossing - Outbound');

    let passed = 0;
    let failed = 0;

    try {
        // Trajectory: 0.5 AU → 1.5 AU (crosses Earth orbit at 1.0 AU going outward)
        const trajectory = [];
        for (let i = 0; i < 20; i++) {
            const t = i / 20;
            const r = 0.5 + t * 1.0;  // 0.5 → 1.5
            trajectory.push({
                x: r,
                y: 0,
                z: 0,
                time: J2000 + i
            });
        }

        const bodies = [createMockBody('EARTH', 1.0)];
        const intersections = detectIntersections(trajectory, bodies, J2000, null);

        console.log(`  Expected: 1 crossing (outbound at 1.0 AU)`);
        console.log(`  Got: ${intersections.length} crossing(s)`);

        assert(intersections.length === 1, 'Should detect exactly 1 crossing');

        console.log('  ✅ PASS: Outbound crossing detected correctly\n');
        passed++;
    } catch (e) {
        console.log(`  ❌ FAIL: ${e.message}\n`);
        failed++;
    }

    return { passed, failed };
}

/**
 * Test 3: Double Crossing (user's Earth example)
 */
function testDoubleCrossing() {
    console.log('📋 Test 3: Double Crossing (Cross Same Orbit Twice)');

    let passed = 0;
    let failed = 0;

    try {
        // Trajectory: 0.8 → 1.2 → 0.8 AU (crosses Earth orbit twice)
        const trajectory = [];
        for (let i = 0; i < 30; i++) {
            const t = i / 30;
            let r;
            if (t < 0.5) {
                r = 0.8 + t * 0.8;  // 0.8 → 1.2
            } else {
                r = 1.2 - (t - 0.5) * 0.8;  // 1.2 → 0.8
            }
            trajectory.push({
                x: r,
                y: 0,
                z: 0,
                time: J2000 + i
            });
        }

        const bodies = [createMockBody('EARTH', 1.0)];
        const intersections = detectIntersections(trajectory, bodies, J2000, null);

        console.log(`  Expected: 2 crossings (outbound + inbound)`);
        console.log(`  Got: ${intersections.length} crossing(s)`);

        assert(intersections.length === 2, 'Should detect exactly 2 crossings');

        // Verify first is outbound, second is inbound
        const r1 = Math.sqrt(
            intersections[0].trajectoryPosition.x ** 2 +
            intersections[0].trajectoryPosition.y ** 2 +
            intersections[0].trajectoryPosition.z ** 2
        );
        const r2 = Math.sqrt(
            intersections[1].trajectoryPosition.x ** 2 +
            intersections[1].trajectoryPosition.y ** 2 +
            intersections[1].trajectoryPosition.z ** 2
        );

        console.log(`  First crossing: ${r1.toFixed(4)} AU`);
        console.log(`  Second crossing: ${r2.toFixed(4)} AU`);

        assert(Math.abs(r1 - 1.0) < 0.01, 'First crossing at 1.0 AU');
        assert(Math.abs(r2 - 1.0) < 0.01, 'Second crossing at 1.0 AU');

        console.log('  ✅ PASS: Double crossing detected correctly\n');
        passed++;
    } catch (e) {
        console.log(`  ❌ FAIL: ${e.message}\n`);
        failed++;
    }

    return { passed, failed };
}

/**
 * Test 4: No Crossing - Trajectory Stays Inside
 */
function testNoCrossingInside() {
    console.log('📋 Test 4: No Crossing - Trajectory Inside Orbit');

    let passed = 0;
    let failed = 0;

    try {
        // Trajectory: 0.5 → 0.7 AU (entirely inside Earth's 1.0 AU orbit)
        const trajectory = [];
        for (let i = 0; i < 20; i++) {
            const t = i / 20;
            const r = 0.5 + t * 0.2;
            trajectory.push({
                x: r,
                y: 0,
                z: 0,
                time: J2000 + i
            });
        }

        const bodies = [createMockBody('EARTH', 1.0)];
        const intersections = detectIntersections(trajectory, bodies, J2000, null);

        console.log(`  Expected: 0 crossings (stays inside)`);
        console.log(`  Got: ${intersections.length} crossing(s)`);

        assert(intersections.length === 0, 'Should detect no crossings');

        console.log('  ✅ PASS: No false positive for interior trajectory\n');
        passed++;
    } catch (e) {
        console.log(`  ❌ FAIL: ${e.message}\n`);
        failed++;
    }

    return { passed, failed };
}

/**
 * Test 5: No Crossing - Trajectory Stays Outside
 */
function testNoCrossingOutside() {
    console.log('📋 Test 5: No Crossing - Trajectory Outside Orbit');

    let passed = 0;
    let failed = 0;

    try {
        // Trajectory: 1.5 → 2.0 AU (entirely outside Earth's 1.0 AU orbit)
        const trajectory = [];
        for (let i = 0; i < 20; i++) {
            const t = i / 20;
            const r = 1.5 + t * 0.5;
            trajectory.push({
                x: r,
                y: 0,
                z: 0,
                time: J2000 + i
            });
        }

        const bodies = [createMockBody('EARTH', 1.0)];
        const intersections = detectIntersections(trajectory, bodies, J2000, null);

        console.log(`  Expected: 0 crossings (stays outside)`);
        console.log(`  Got: ${intersections.length} crossing(s)`);

        assert(intersections.length === 0, 'Should detect no crossings');

        console.log('  ✅ PASS: No false positive for exterior trajectory\n');
        passed++;
    } catch (e) {
        console.log(`  ❌ FAIL: ${e.message}\n`);
        failed++;
    }

    return { passed, failed };
}

/**
 * Test 6: Tangent Trajectory (barely touches orbit)
 */
function testTangentTrajectory() {
    console.log('📋 Test 6: Tangent Trajectory');

    let passed = 0;
    let failed = 0;

    try {
        // Trajectory approaches 1.0 AU but turns away before crossing
        const trajectory = [];
        for (let i = 0; i < 30; i++) {
            const t = i / 30;
            let r;
            if (t < 0.5) {
                r = 0.8 + t * 0.4;  // 0.8 → 1.0
            } else {
                r = 1.0 - (t - 0.5) * 0.4;  // 1.0 → 0.8
            }
            trajectory.push({
                x: r * Math.cos(t * 0.5),
                y: r * Math.sin(t * 0.5),
                z: 0,
                time: J2000 + i
            });
        }

        const bodies = [createMockBody('EARTH', 1.0)];
        const intersections = detectIntersections(trajectory, bodies, J2000, null);

        console.log(`  Expected: 0 crossings (tangent, doesn't cross)`);
        console.log(`  Got: ${intersections.length} crossing(s)`);

        // Tangent might produce 0 or 2 crossings depending on discretization
        // Either is acceptable - key is it shouldn't produce 1
        assert(
            intersections.length === 0 || intersections.length === 2,
            'Tangent should produce 0 or 2 crossings, not 1'
        );

        console.log('  ✅ PASS: Tangent trajectory handled correctly\n');
        passed++;
    } catch (e) {
        console.log(`  ❌ FAIL: ${e.message}\n`);
        failed++;
    }

    return { passed, failed };
}

/**
 * Test 7: Multiple Bodies with Different Crossings
 */
function testMultipleBodiesCrossings() {
    console.log('📋 Test 7: Multiple Bodies Crossings');

    let passed = 0;
    let failed = 0;

    try {
        // Trajectory: 0.3 → 2.0 AU (crosses Mercury, Venus, Earth, Mars)
        const trajectory = [];
        for (let i = 0; i < 50; i++) {
            const t = i / 50;
            const r = 0.3 + t * 1.7;  // 0.3 → 2.0
            trajectory.push({
                x: r,
                y: 0,
                z: 0,
                time: J2000 + i
            });
        }

        const bodies = [
            createMockBody('MERCURY', 0.387),
            createMockBody('VENUS', 0.723),
            createMockBody('EARTH', 1.0),
            createMockBody('MARS', 1.524)
        ];

        const intersections = detectIntersections(trajectory, bodies, J2000, null);

        console.log(`  Expected: 4 crossings (one per planet)`);
        console.log(`  Got: ${intersections.length} crossing(s)`);

        assert(intersections.length === 4, 'Should detect 4 crossings');

        // Verify all bodies are present
        const bodyNames = intersections.map(i => i.bodyName);
        assert(bodyNames.includes('MERCURY'), 'Should include Mercury');
        assert(bodyNames.includes('VENUS'), 'Should include Venus');
        assert(bodyNames.includes('EARTH'), 'Should include Earth');
        assert(bodyNames.includes('MARS'), 'Should include Mars');

        // Verify chronological order (Mercury first, Mars last)
        assert(intersections[0].bodyName === 'MERCURY', 'Mercury should be first');
        assert(intersections[3].bodyName === 'MARS', 'Mars should be last');

        console.log('  ✅ PASS: Multiple bodies detected in correct order\n');
        passed++;
    } catch (e) {
        console.log(`  ❌ FAIL: ${e.message}\n`);
        failed++;
    }

    return { passed, failed };
}

/**
 * Test 8: Interpolation Accuracy
 */
function testInterpolationAccuracy() {
    console.log('📋 Test 8: Crossing Time/Position Interpolation Accuracy');

    let passed = 0;
    let failed = 0;

    try {
        // Create trajectory with known crossing point
        // Segment: (0.9, 0, 0) at t=0 → (1.1, 0, 0) at t=10
        // Should cross 1.0 AU at t=5 (midpoint)
        const trajectory = [
            { x: 0.9, y: 0, z: 0, time: J2000 },
            { x: 1.1, y: 0, z: 0, time: J2000 + 10 }
        ];

        const bodies = [createMockBody('EARTH', 1.0)];
        const intersections = detectIntersections(trajectory, bodies, J2000, null);

        assert(intersections.length === 1, 'Should detect 1 crossing');

        const crossing = intersections[0];
        const crossRadius = Math.sqrt(
            crossing.trajectoryPosition.x ** 2 +
            crossing.trajectoryPosition.y ** 2 +
            crossing.trajectoryPosition.z ** 2
        );
        const crossTime = crossing.time;

        console.log(`  Expected radius: 1.0000 AU`);
        console.log(`  Got radius: ${crossRadius.toFixed(4)} AU`);
        console.log(`  Expected time: ${J2000 + 5}`);
        console.log(`  Got time: ${crossTime.toFixed(2)}`);

        assert(Math.abs(crossRadius - 1.0) < 0.0001, 'Crossing radius should be 1.0 AU');
        assert(Math.abs(crossTime - (J2000 + 5)) < 0.01, 'Crossing time should be t=5');

        console.log('  ✅ PASS: Interpolation is accurate\n');
        passed++;
    } catch (e) {
        console.log(`  ❌ FAIL: ${e.message}\n`);
        failed++;
    }

    return { passed, failed };
}

/**
 * Test 9: Trajectory Starting Inside Orbit
 */
function testStartingInsideOrbit() {
    console.log('📋 Test 9: Trajectory Starting Inside Orbit');

    let passed = 0;
    let failed = 0;

    try {
        // Start at 0.5 AU, go to 1.5 AU (start inside, cross going out)
        const trajectory = [];
        for (let i = 0; i < 20; i++) {
            const t = i / 20;
            const r = 0.5 + t * 1.0;
            trajectory.push({
                x: r,
                y: 0,
                z: 0,
                time: J2000 + i
            });
        }

        const bodies = [createMockBody('EARTH', 1.0)];
        const intersections = detectIntersections(trajectory, bodies, J2000, null);

        console.log(`  Expected: 1 crossing (outbound from inside)`);
        console.log(`  Got: ${intersections.length} crossing(s)`);

        assert(intersections.length === 1, 'Should detect 1 crossing');

        console.log('  ✅ PASS: Starting inside orbit handled correctly\n');
        passed++;
    } catch (e) {
        console.log(`  ❌ FAIL: ${e.message}\n`);
        failed++;
    }

    return { passed, failed };
}

/**
 * Test 10: Trajectory Ending Inside Orbit
 */
function testEndingInsideOrbit() {
    console.log('📋 Test 10: Trajectory Ending Inside Orbit');

    let passed = 0;
    let failed = 0;

    try {
        // Start at 1.5 AU, go to 0.5 AU (start outside, cross going in, end inside)
        const trajectory = [];
        for (let i = 0; i < 20; i++) {
            const t = i / 20;
            const r = 1.5 - t * 1.0;
            trajectory.push({
                x: r,
                y: 0,
                z: 0,
                time: J2000 + i
            });
        }

        const bodies = [createMockBody('EARTH', 1.0)];
        const intersections = detectIntersections(trajectory, bodies, J2000, null);

        console.log(`  Expected: 1 crossing (inbound to inside)`);
        console.log(`  Got: ${intersections.length} crossing(s)`);

        assert(intersections.length === 1, 'Should detect 1 crossing');

        console.log('  ✅ PASS: Ending inside orbit handled correctly\n');
        passed++;
    } catch (e) {
        console.log(`  ❌ FAIL: ${e.message}\n`);
        failed++;
    }

    return { passed, failed };
}

/**
 * Test 11: Trajectory Exactly At Orbital Radius (Edge Case)
 */
function testExactlyAtOrbitalRadius() {
    console.log('📋 Test 11: Trajectory Exactly At Orbital Radius');

    let passed = 0;
    let failed = 0;

    try {
        // Trajectory stays exactly at 1.0 AU (shouldn't count as crossing)
        const trajectory = [];
        for (let i = 0; i < 20; i++) {
            const angle = i * 0.1;
            trajectory.push({
                x: Math.cos(angle),
                y: Math.sin(angle),
                z: 0,
                time: J2000 + i
            });
        }

        const bodies = [createMockBody('EARTH', 1.0)];
        const intersections = detectIntersections(trajectory, bodies, J2000, null);

        console.log(`  Expected: 0 crossings (trajectory at orbital radius, not crossing)`);
        console.log(`  Got: ${intersections.length} crossing(s)`);

        // Should be 0 because trajectory never crosses (always at radius)
        assert(intersections.length === 0, 'Should not detect crossings when always at radius');

        console.log('  ✅ PASS: Edge case handled correctly\n');
        passed++;
    } catch (e) {
        console.log(`  ❌ FAIL: ${e.message}\n`);
        failed++;
    }

    return { passed, failed };
}

/**
 * Test 12: High Eccentricity Orbit (Circular Approximation Limitation)
 */
function testHighEccentricityApproximation() {
    console.log('📋 Test 12: High Eccentricity Orbit (Known Limitation)');

    let passed = 0;
    let failed = 0;

    try {
        // Trajectory crosses between perihelion and aphelion of high-e orbit
        // Semi-major axis = 1.5, e = 0.5 → perihelion = 0.75, aphelion = 2.25
        // Trajectory at 1.0 AU crosses the orbit path but not semi-major axis
        const trajectory = [];
        for (let i = 0; i < 20; i++) {
            trajectory.push({
                x: 1.0,  // Constant radius
                y: i * 0.05,
                z: 0,
                time: J2000 + i
            });
        }

        const bodies = [{
            name: 'ECCENTRIC',
            elements: {
                a: 1.5,
                e: 0.5,  // High eccentricity
                i: 0,
                Ω: 0,
                ω: 0,
                M0: 0,
                epoch: J2000,
                μ: MU_SUN
            }
        }];

        const intersections = detectIntersections(trajectory, bodies, J2000, null);

        console.log(`  Body: a=1.5 AU, e=0.5 (perihelion=0.75, aphelion=2.25)`);
        console.log(`  Trajectory: constant 1.0 AU`);
        console.log(`  Expected: 0 crossings (uses semi-major axis 1.5, not actual path)`);
        console.log(`  Got: ${intersections.length} crossing(s)`);

        // This is a KNOWN LIMITATION - we use circular approximation
        // Trajectory at 1.0 AU doesn't cross 1.5 AU semi-major axis
        assert(intersections.length === 0, 'Circular approximation misses this case');

        console.log('  ✅ PASS: Known limitation documented (circular approximation)\n');
        console.log('  ℹ️  Note: High-e orbits may miss crossings between perihelion/aphelion\n');
        passed++;
    } catch (e) {
        console.log(`  ❌ FAIL: ${e.message}\n`);
        failed++;
    }

    return { passed, failed };
}

/**
 * Test 13: Crossing Order (Chronological Sorting)
 */
function testCrossingOrder() {
    console.log('📋 Test 13: Crossing Order (Chronological)');

    let passed = 0;
    let failed = 0;

    try {
        // Multiple crossings should be sorted by time
        const trajectory = [];
        for (let i = 0; i < 40; i++) {
            const t = i / 40;
            let r;
            // Create wavy trajectory: 0.5 → 1.5 → 0.5 → 1.5
            if (t < 0.25) {
                r = 0.5 + t * 4 * 1.0;
            } else if (t < 0.5) {
                r = 1.5 - (t - 0.25) * 4 * 1.0;
            } else if (t < 0.75) {
                r = 0.5 + (t - 0.5) * 4 * 1.0;
            } else {
                r = 1.5 - (t - 0.75) * 4 * 1.0;
            }
            trajectory.push({
                x: r,
                y: 0,
                z: 0,
                time: J2000 + i
            });
        }

        const bodies = [createMockBody('EARTH', 1.0)];
        const intersections = detectIntersections(trajectory, bodies, J2000, null);

        console.log(`  Expected: 4 crossings in chronological order`);
        console.log(`  Got: ${intersections.length} crossing(s)`);

        assert(intersections.length === 4, 'Should detect 4 crossings');

        // Verify chronological order
        for (let i = 1; i < intersections.length; i++) {
            assert(
                intersections[i].time >= intersections[i - 1].time,
                `Crossing ${i} should be after crossing ${i - 1}`
            );
        }

        console.log('  Times:', intersections.map(i => i.time.toFixed(2)).join(', '));
        console.log('  ✅ PASS: Crossings sorted chronologically\n');
        passed++;
    } catch (e) {
        console.log(`  ❌ FAIL: ${e.message}\n`);
        failed++;
    }

    return { passed, failed };
}

/**
 * Test 14: Real-World Scenario (User's Venus Intercept)
 */
function testRealWorldScenario() {
    console.log('📋 Test 14: Real-World Scenario (Venus Intercept)');

    let passed = 0;
    let failed = 0;

    try {
        // Simulate user's trajectory: Earth → Venus
        // Start near Earth (1.0 AU), spiral in to Venus (0.723 AU)
        const trajectory = [];
        for (let i = 0; i < 100; i++) {
            const t = i / 100;
            const r = 1.0 - t * 0.277;  // 1.0 → 0.723
            const angle = t * Math.PI * 0.5;  // Quarter orbit
            trajectory.push({
                x: r * Math.cos(angle),
                y: r * Math.sin(angle),
                z: 0,
                time: J2000 + i
            });
        }

        const bodies = [
            createMockBody('MERCURY', 0.387),
            createMockBody('VENUS', 0.723),
            createMockBody('EARTH', 1.0)
        ];

        const intersections = detectIntersections(trajectory, bodies, J2000, null);

        console.log(`  Expected: Earth (outbound), Venus (inbound), maybe Mercury`);
        console.log(`  Got: ${intersections.length} crossing(s)`);

        // Should cross Earth (going outward initially) and Venus (arriving)
        const bodyNames = intersections.map(i => i.bodyName);
        console.log(`  Bodies: ${bodyNames.join(', ')}`);

        // At minimum should detect Venus crossing
        assert(bodyNames.includes('VENUS'), 'Should detect Venus crossing');

        console.log('  ✅ PASS: Real-world scenario works correctly\n');
        passed++;
    } catch (e) {
        console.log(`  ❌ FAIL: ${e.message}\n`);
        failed++;
    }

    return { passed, failed };
}
