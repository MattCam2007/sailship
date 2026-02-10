/**
 * Test suite for adaptive trajectory resolution
 *
 * Validates that calculateAdaptiveSteps() produces appropriate step counts
 * for different orbital scenarios (inner planets, outer planets, high-e, hyperbolic)
 */

import { predictTrajectory, debugTrajectorySteps } from './trajectory-predictor.js';
import { MU_SUN } from './orbital.js';

/**
 * Helper: Calculate orbital period from semi-major axis
 */
function orbitalPeriod(a) {
    return 2 * Math.PI * Math.sqrt((a * a * a) / MU_SUN);
}

/**
 * Test 1: Mercury orbit (fast inner planet)
 * Period: ~88 days
 * For 60-day prediction: should get ~720 steps (12 steps/day constraint)
 */
export function testMercuryOrbit() {
    console.log('\n=== TEST 1: Mercury Orbit ===');
    const mercuryElements = {
        a: 5.79e10,      // 0.387 AU
        e: 0.2056,
        i: 0.122,
        Ω: 0.843,
        ω: 0.508,
        M0: 0
    };

    const sail = { angle: 0, pitchAngle: 0, deploymentPercent: 100 };
    const duration = 60;

    const result = predictTrajectory({
        orbitalElements: mercuryElements,
        sail,
        startTime: Date.now() / 1000,
        duration
    });

    const period = orbitalPeriod(mercuryElements.a) / (24 * 3600);
    const expectedStepsPerDay = 12;
    const expectedSteps = Math.ceil(duration * expectedStepsPerDay);

    console.log(`Orbital period: ${period.toFixed(1)} days`);
    console.log(`Duration: ${duration} days`);
    console.log(`Expected steps: ${expectedSteps} (12 steps/day constraint)`);
    console.log(`Actual steps: ${result.points.length}`);
    console.log(`Status: ${result.points.length >= expectedSteps ? 'PASS' : 'FAIL'}`);

    return result.points.length >= expectedSteps;
}

/**
 * Test 2: Earth orbit (baseline)
 * Period: ~365 days
 * For 60-day prediction: should get ~720 steps (12 steps/day constraint)
 */
export function testEarthOrbit() {
    console.log('\n=== TEST 2: Earth Orbit ===');
    const earthElements = {
        a: 1.496e11,     // 1.0 AU
        e: 0.0167,
        i: 0,
        Ω: 0,
        ω: 1.796,
        M0: 0
    };

    const sail = { angle: 0, pitchAngle: 0, deploymentPercent: 100 };
    const duration = 60;

    const result = predictTrajectory({
        orbitalElements: earthElements,
        sail,
        startTime: Date.now() / 1000,
        duration
    });

    const period = orbitalPeriod(earthElements.a) / (24 * 3600);
    const expectedStepsPerDay = 12;
    const expectedSteps = Math.ceil(duration * expectedStepsPerDay);

    console.log(`Orbital period: ${period.toFixed(1)} days`);
    console.log(`Duration: ${duration} days`);
    console.log(`Expected steps: ${expectedSteps} (12 steps/day constraint)`);
    console.log(`Actual steps: ${result.points.length}`);
    console.log(`Status: ${result.points.length >= expectedSteps ? 'PASS' : 'FAIL'}`);

    return result.points.length >= expectedSteps;
}

/**
 * Test 3: Mars orbit (slower outer planet, but still inner system)
 * Period: ~687 days
 * For 60-day prediction: should get ~720 steps (12 steps/day constraint dominates)
 */
export function testMarsOrbit() {
    console.log('\n=== TEST 3: Mars Orbit ===');
    const marsElements = {
        a: 2.279e11,     // 1.524 AU
        e: 0.0934,
        i: 0.0323,
        Ω: 0.865,
        ω: 5.865,
        M0: 0
    };

    const sail = { angle: 0, pitchAngle: 0, deploymentPercent: 100 };
    const duration = 60;

    const result = predictTrajectory({
        orbitalElements: marsElements,
        sail,
        startTime: Date.now() / 1000,
        duration
    });

    const period = orbitalPeriod(marsElements.a) / (24 * 3600);
    const expectedStepsPerDay = 12;
    const expectedSteps = Math.ceil(duration * expectedStepsPerDay);

    console.log(`Orbital period: ${period.toFixed(1)} days`);
    console.log(`Duration: ${duration} days`);
    console.log(`Expected steps: ${expectedSteps} (12 steps/day constraint)`);
    console.log(`Actual steps: ${result.points.length}`);
    console.log(`Status: ${result.points.length >= expectedSteps ? 'PASS' : 'FAIL'}`);

    return result.points.length >= expectedSteps;
}

/**
 * Test 4: Jupiter orbit (very long period outer planet)
 * Period: ~4,333 days
 * For 365-day prediction: 50 steps/orbit constraint should dominate
 * 365 days = 0.084 orbits → need ~4.2 steps (floored to minSteps=200)
 * But 12 steps/day = 4,380 steps, so that should dominate
 */
export function testJupiterOrbit() {
    console.log('\n=== TEST 4: Jupiter Orbit ===');
    const jupiterElements = {
        a: 7.785e11,     // 5.2 AU
        e: 0.0489,
        i: 0.0227,
        Ω: 1.755,
        ω: 0.257,
        M0: 0
    };

    const sail = { angle: 0, pitchAngle: 0, deploymentPercent: 100 };
    const duration = 365; // 1 year

    const result = predictTrajectory({
        orbitalElements: jupiterElements,
        sail,
        startTime: Date.now() / 1000,
        duration
    });

    const period = orbitalPeriod(jupiterElements.a) / (24 * 3600);
    const orbitsInDuration = duration / period;
    const stepsFromPeriod = Math.ceil(orbitsInDuration * 50);
    const stepsFromDuration = Math.ceil(duration * 12);

    console.log(`Orbital period: ${period.toFixed(1)} days`);
    console.log(`Duration: ${duration} days (${orbitsInDuration.toFixed(3)} orbits)`);
    console.log(`Steps from period (50/orbit): ${stepsFromPeriod}`);
    console.log(`Steps from duration (12/day): ${stepsFromDuration}`);
    console.log(`Expected: max(${stepsFromPeriod}, ${stepsFromDuration}) = ${Math.max(stepsFromPeriod, stepsFromDuration)}`);
    console.log(`Actual steps: ${result.points.length}`);
    console.log(`Status: ${result.points.length >= Math.max(stepsFromPeriod, stepsFromDuration) ? 'PASS' : 'FAIL'}`);

    return result.points.length >= Math.max(stepsFromPeriod, stepsFromDuration);
}

/**
 * Test 5: High-eccentricity orbit (comet-like)
 * e = 0.9 → should handle without crashing
 * Very elliptical orbit means varying speeds → needs good resolution
 */
export function testHighEccentricityOrbit() {
    console.log('\n=== TEST 5: High Eccentricity Orbit ===');
    const cometElements = {
        a: 3.0e11,       // ~2 AU
        e: 0.9,          // Highly elliptical
        i: 0.5,
        Ω: 1.0,
        ω: 2.0,
        M0: 0
    };

    const sail = { angle: 0, pitchAngle: 0, deploymentPercent: 100 };
    const duration = 120;

    const result = predictTrajectory({
        orbitalElements: cometElements,
        sail,
        startTime: Date.now() / 1000,
        duration
    });

    const period = orbitalPeriod(cometElements.a) / (24 * 3600);

    console.log(`Orbital period: ${period.toFixed(1)} days`);
    console.log(`Eccentricity: ${cometElements.e}`);
    console.log(`Duration: ${duration} days`);
    console.log(`Steps generated: ${result.points.length}`);
    console.log(`Status: ${result.points.length >= 200 ? 'PASS (no crash, min steps met)' : 'FAIL'}`);

    return result.points.length >= 200;
}

/**
 * Test 6: Hyperbolic orbit (escape trajectory)
 * e > 1 → no orbital period, should use duration-based steps only
 */
export function testHyperbolicOrbit() {
    console.log('\n=== TEST 6: Hyperbolic Orbit ===');
    const escapeElements = {
        a: -1.5e11,      // Negative for hyperbolic
        e: 1.2,          // e > 1
        i: 0.1,
        Ω: 0.5,
        ω: 1.5,
        M0: 0
    };

    const sail = { angle: 0, pitchAngle: 0, deploymentPercent: 100 };
    const duration = 90;

    const result = predictTrajectory({
        orbitalElements: escapeElements,
        sail,
        startTime: Date.now() / 1000,
        duration
    });

    const expectedSteps = Math.ceil(duration * 12); // Should use duration-based only

    console.log(`Eccentricity: ${escapeElements.e} (hyperbolic)`);
    console.log(`Duration: ${duration} days`);
    console.log(`Expected steps: ${expectedSteps} (12 steps/day, no period constraint)`);
    console.log(`Actual steps: ${result.points.length}`);
    console.log(`Status: ${result.points.length >= Math.min(expectedSteps, 8760) ? 'PASS' : 'FAIL'}`);

    return result.points.length >= Math.min(expectedSteps, 8760);
}

/**
 * Run all tests
 */
export function runAllTests() {
    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║  ADAPTIVE TRAJECTORY RESOLUTION TEST SUITE        ║');
    console.log('╚════════════════════════════════════════════════════╝');

    const results = {
        mercury: testMercuryOrbit(),
        earth: testEarthOrbit(),
        mars: testMarsOrbit(),
        jupiter: testJupiterOrbit(),
        highE: testHighEccentricityOrbit(),
        hyperbolic: testHyperbolicOrbit()
    };

    const passCount = Object.values(results).filter(r => r).length;
    const totalCount = Object.keys(results).length;

    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log(`║  RESULTS: ${passCount}/${totalCount} tests passed${' '.repeat(28 - passCount.toString().length - totalCount.toString().length)}║`);
    console.log('╚════════════════════════════════════════════════════╝');

    if (passCount === totalCount) {
        console.log('✅ All tests passed!');
    } else {
        console.log('❌ Some tests failed');
        console.log('Failed tests:', Object.entries(results)
            .filter(([_, passed]) => !passed)
            .map(([name, _]) => name)
            .join(', '));
    }

    return results;
}
