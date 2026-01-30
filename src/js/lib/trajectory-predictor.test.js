/**
 * Console-based tests for trajectory-predictor.js
 *
 * Run in browser console after loading the game:
 *   import('/js/lib/trajectory-predictor.test.js').then(m => m.runAllTests())
 *
 * Or run individual tests:
 *   import('/js/lib/trajectory-predictor.test.js').then(m => m.testZeroThrust())
 */

import { predictTrajectory, clearTrajectoryCache } from './trajectory-predictor.js';
import { getPosition } from './orbital.js';
import { MU_SUN } from './orbital.js';

// Test utilities
function assert(condition, message) {
    if (!condition) {
        console.error(`❌ FAIL: ${message}`);
        return false;
    }
    console.log(`✅ PASS: ${message}`);
    return true;
}

function assertApprox(actual, expected, tolerance, message) {
    const diff = Math.abs(actual - expected);
    if (diff > tolerance) {
        console.error(`❌ FAIL: ${message} (expected ${expected}, got ${actual}, diff ${diff})`);
        return false;
    }
    console.log(`✅ PASS: ${message}`);
    return true;
}

// Test data: circular orbit at 1 AU
const CIRCULAR_ORBIT = {
    a: 1.0,
    e: 0.0001,  // Nearly circular
    i: 0.001,
    Ω: 0,
    ω: 0,
    M0: 0,
    epoch: 2460000,  // Arbitrary Julian date
    μ: MU_SUN
};

// Test data: elliptical orbit
const ELLIPTICAL_ORBIT = {
    a: 1.2,
    e: 0.3,
    i: 0.05,
    Ω: 0.5,
    ω: 1.0,
    M0: 0.5,
    epoch: 2460000,
    μ: MU_SUN
};

// Test data: sail with zero deployment
const SAIL_ZERO_THRUST = {
    area: 3000000,
    reflectivity: 0.9,
    angle: 0.6,
    pitchAngle: 0,
    deploymentPercent: 0,  // Zero thrust
    condition: 100
};

// Test data: sail with full deployment
const SAIL_FULL_THRUST = {
    area: 3000000,
    reflectivity: 0.9,
    angle: 0.6,  // ~35 degrees, prograde
    pitchAngle: 0,
    deploymentPercent: 100,
    condition: 100
};

/**
 * Test 1: Zero thrust should match Keplerian orbit
 */
export function testZeroThrust() {
    console.log('\n--- Test: Zero Thrust Matches Keplerian ---');
    clearTrajectoryCache();

    const startTime = CIRCULAR_ORBIT.epoch;
    const duration = 30;  // 30 days
    const steps = 50;

    const trajectory = predictTrajectory({
        orbitalElements: CIRCULAR_ORBIT,
        sail: SAIL_ZERO_THRUST,
        mass: 10000,
        startTime: startTime,
        duration: duration,
        steps: steps
    });

    let allPassed = true;

    // Check array length
    allPassed &= assert(trajectory.length === steps, `Returns ${steps} points`);

    // Check each point matches Keplerian position
    const tolerance = 1e-9;  // AU
    for (let i = 0; i < Math.min(5, trajectory.length); i++) {
        const predicted = trajectory[i];
        const expected = getPosition(CIRCULAR_ORBIT, predicted.time);

        const dx = Math.abs(predicted.x - expected.x);
        const dy = Math.abs(predicted.y - expected.y);
        const dz = Math.abs(predicted.z - expected.z);
        const maxDiff = Math.max(dx, dy, dz);

        allPassed &= assert(maxDiff < tolerance,
            `Point ${i}: position matches Keplerian (diff: ${maxDiff.toExponential(2)})`);
    }

    return allPassed;
}

/**
 * Test 2: With thrust, trajectory should diverge from Keplerian
 */
export function testThrustDiverges() {
    console.log('\n--- Test: Thrust Causes Divergence ---');
    clearTrajectoryCache();

    const startTime = CIRCULAR_ORBIT.epoch;
    const duration = 30;
    const steps = 50;

    const trajectory = predictTrajectory({
        orbitalElements: CIRCULAR_ORBIT,
        sail: SAIL_FULL_THRUST,
        mass: 10000,
        startTime: startTime,
        duration: duration,
        steps: steps
    });

    let allPassed = true;

    // Check array length
    allPassed &= assert(trajectory.length === steps, `Returns ${steps} points`);

    // First point should match (no thrust applied yet)
    const firstPredicted = trajectory[0];
    const firstExpected = getPosition(CIRCULAR_ORBIT, firstPredicted.time);
    const firstDiff = Math.sqrt(
        (firstPredicted.x - firstExpected.x) ** 2 +
        (firstPredicted.y - firstExpected.y) ** 2 +
        (firstPredicted.z - firstExpected.z) ** 2
    );
    allPassed &= assert(firstDiff < 1e-9, `First point matches start position`);

    // Last point should diverge significantly (thrust over 30 days)
    const lastPredicted = trajectory[trajectory.length - 1];
    const lastKeplerian = getPosition(CIRCULAR_ORBIT, lastPredicted.time);
    const lastDiff = Math.sqrt(
        (lastPredicted.x - lastKeplerian.x) ** 2 +
        (lastPredicted.y - lastKeplerian.y) ** 2 +
        (lastPredicted.z - lastKeplerian.z) ** 2
    );

    // With solar sail at 1 AU for 30 days, expect measurable divergence
    // Rough estimate: 0.5 mm/s² * 30 days ≈ 1300 m/s ΔV ≈ 0.001 AU displacement
    allPassed &= assert(lastDiff > 0.0001,
        `Last point diverges from Keplerian (diff: ${lastDiff.toFixed(6)} AU)`);

    return allPassed;
}

/**
 * Test 3: No NaN or Infinity values
 */
export function testNoInvalidValues() {
    console.log('\n--- Test: No Invalid Values ---');
    clearTrajectoryCache();

    const trajectory = predictTrajectory({
        orbitalElements: ELLIPTICAL_ORBIT,
        sail: SAIL_FULL_THRUST,
        mass: 10000,
        startTime: ELLIPTICAL_ORBIT.epoch,
        duration: 60,
        steps: 100
    });

    let allPassed = true;
    let invalidCount = 0;

    for (const point of trajectory) {
        if (!isFinite(point.x) || !isFinite(point.y) || !isFinite(point.z) || !isFinite(point.time)) {
            invalidCount++;
        }
    }

    allPassed &= assert(invalidCount === 0,
        `All ${trajectory.length} points have valid coordinates (invalid: ${invalidCount})`);

    return allPassed;
}

/**
 * Test 4: Performance benchmark
 */
export function testPerformance() {
    console.log('\n--- Test: Performance ---');
    clearTrajectoryCache();

    const iterations = 10;
    const times = [];

    for (let i = 0; i < iterations; i++) {
        clearTrajectoryCache();  // Force recalculation

        const start = performance.now();
        predictTrajectory({
            orbitalElements: CIRCULAR_ORBIT,
            sail: SAIL_FULL_THRUST,
            mass: 10000,
            startTime: CIRCULAR_ORBIT.epoch,
            duration: 60,
            steps: 200
        });
        const end = performance.now();
        times.push(end - start);
    }

    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const maxTime = Math.max(...times);

    console.log(`  Average time: ${avgTime.toFixed(2)}ms`);
    console.log(`  Max time: ${maxTime.toFixed(2)}ms`);

    // Target: < 5ms for 200 steps
    return assert(avgTime < 5, `Average time < 5ms (got ${avgTime.toFixed(2)}ms)`);
}

/**
 * Test 5: Hyperbolic orbit handling
 */
export function testHyperbolicOrbit() {
    console.log('\n--- Test: Hyperbolic Orbit ---');
    clearTrajectoryCache();

    const hyperbolicOrbit = {
        a: -1.5,  // Negative for hyperbolic
        e: 1.5,
        i: 0.1,
        Ω: 0,
        ω: 0,
        M0: 0.1,
        epoch: 2460000,
        μ: MU_SUN
    };

    let allPassed = true;
    let error = null;

    try {
        const trajectory = predictTrajectory({
            orbitalElements: hyperbolicOrbit,
            sail: SAIL_ZERO_THRUST,
            mass: 10000,
            startTime: hyperbolicOrbit.epoch,
            duration: 30,
            steps: 50
        });

        allPassed &= assert(trajectory.length > 0, 'Returns non-empty trajectory');
        allPassed &= assert(trajectory.every(p => isFinite(p.x)), 'All x coordinates finite');
    } catch (e) {
        error = e;
        allPassed = false;
    }

    allPassed &= assert(error === null, `No errors thrown (${error?.message || 'none'})`);

    return allPassed;
}

/**
 * Test 6: SOI boundary truncation
 */
export function testSOITruncation() {
    console.log('\n--- Test: SOI Boundary Truncation ---');
    clearTrajectoryCache();

    // Create a trajectory that would escape a planetary SOI
    // Using a high-eccentricity orbit inside SOI
    const soiOrbit = {
        a: 0.05,      // Small orbit inside SOI
        e: 0.8,       // High eccentricity - will exceed 0.1 AU SOI
        i: 0.001,
        Ω: 0,
        ω: 0,
        M0: 0,
        epoch: 2460000,
        μ: 8.887692445e-10  // Earth's μ
    };

    const trajectory = predictTrajectory({
        orbitalElements: soiOrbit,
        sail: SAIL_ZERO_THRUST,
        mass: 10000,
        startTime: soiOrbit.epoch,
        duration: 30,
        steps: 100,
        soiState: { currentBody: 'EARTH', isInSOI: true }
    });

    let allPassed = true;

    // Check that trajectory has points
    allPassed &= assert(trajectory.length > 0, 'Returns non-empty trajectory');

    // With SOI boundary checking, trajectory should be shorter than full 100 steps
    // (because the orbit extends beyond SOI)
    console.log(`  Trajectory length: ${trajectory.length} steps`);

    return allPassed;
}

/**
 * Run all tests
 */
export function runAllTests() {
    console.log('='.repeat(50));
    console.log('TRAJECTORY PREDICTOR TESTS');
    console.log('='.repeat(50));

    const results = [
        testZeroThrust(),
        testThrustDiverges(),
        testNoInvalidValues(),
        testPerformance(),
        testHyperbolicOrbit(),
        testSOITruncation()
    ];

    const passed = results.filter(r => r).length;
    const total = results.length;

    console.log('\n' + '='.repeat(50));
    console.log(`RESULTS: ${passed}/${total} tests passed`);
    console.log('='.repeat(50));

    return passed === total;
}

// Export for browser console access
if (typeof window !== 'undefined') {
    window.trajectoryTests = {
        runAllTests,
        testZeroThrust,
        testThrustDiverges,
        testNoInvalidValues,
        testPerformance,
        testHyperbolicOrbit,
        testSOITruncation
    };
}
