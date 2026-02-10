/**
 * Quick Test Suite for Adaptive Resolution
 *
 * Run in browser console:
 * import('/js/lib/trajectory-predictor-adaptive-test.js').then(m => m.runAdaptiveTests())
 */

import { predictTrajectory } from './trajectory-predictor.js';
import { MU_SUN } from './orbital.js';

/**
 * Test adaptive step calculation with various orbit types
 */
export function runAdaptiveTests() {
    console.log('\n========== ADAPTIVE RESOLUTION TEST SUITE ==========\n');

    const testCases = [
        {
            name: 'Mercury Orbit (fast rotation)',
            elements: { a: 0.387, e: 0.206, i: 0.122, Ω: 0.843, ω: 0.508, M0: 0, epoch: 0, μ: MU_SUN },
            duration: 60,
            expectedMinSteps: 700,  // Should use many steps due to fast rotation
        },
        {
            name: 'Earth Orbit (moderate)',
            elements: { a: 1.0, e: 0.017, i: 0, Ω: 0, ω: 0, M0: 0, epoch: 0, μ: MU_SUN },
            duration: 60,
            expectedMinSteps: 600,  // Should use ~720 steps
        },
        {
            name: 'Mars Orbit (slower)',
            elements: { a: 1.524, e: 0.093, i: 0.032, Ω: 0.865, ω: 5.865, M0: 0, epoch: 0, μ: MU_SUN },
            duration: 60,
            expectedMinSteps: 500,
        },
        {
            name: 'Jupiter Orbit (very slow)',
            elements: { a: 5.204, e: 0.049, i: 0.023, Ω: 1.755, ω: 0.257, M0: 0, epoch: 0, μ: MU_SUN },
            duration: 60,
            expectedMinSteps: 200,  // Should clamp to minimum (rotation is very slow)
        },
        {
            name: 'High Eccentricity (e=0.7)',
            elements: { a: 1.2, e: 0.7, i: 0, Ω: 0, ω: 0, M0: 0, epoch: 0, μ: MU_SUN },
            duration: 60,
            expectedMinSteps: 700,  // Fast at perihelion → more steps needed
        },
        {
            name: 'Hyperbolic Flyby (e=2.0)',
            elements: { a: -1.0, e: 2.0, i: 0, Ω: 0, ω: 0, M0: 0, epoch: 0, μ: MU_SUN },
            duration: 60,
            expectedMinSteps: 600,  // Duration-based calculation
        },
    ];

    const sail = {
        area: 3000000,
        reflectivity: 0.9,
        angle: 0.6,
        pitchAngle: 0,
        deploymentPercent: 100,
        condition: 100,
        sailCount: 1,
    };

    let passCount = 0;
    let failCount = 0;

    testCases.forEach((test, index) => {
        console.log(`\n--- Test ${index + 1}: ${test.name} ---`);

        const startTime = performance.now();
        const trajectory = predictTrajectory({
            orbitalElements: test.elements,
            sail: sail,
            mass: 10000,
            startTime: 2451545.0,  // J2000
            duration: test.duration,
            // Don't pass 'steps' - let it calculate adaptively
        });
        const endTime = performance.now();
        const computeTime = (endTime - startTime).toFixed(2);

        const actualSteps = trajectory.length;
        const passed = actualSteps >= test.expectedMinSteps;

        console.log(`  Orbital elements: a=${test.elements.a.toFixed(3)}, e=${test.elements.e.toFixed(3)}`);
        console.log(`  Expected min steps: ${test.expectedMinSteps}`);
        console.log(`  Actual steps: ${actualSteps}`);
        console.log(`  Compute time: ${computeTime}ms`);
        console.log(`  Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);

        if (passed) {
            passCount++;
        } else {
            failCount++;
        }

        // Verify trajectory is smooth (no NaN, no huge jumps)
        let maxJump = 0;
        for (let i = 1; i < trajectory.length; i++) {
            const dx = trajectory[i].x - trajectory[i-1].x;
            const dy = trajectory[i].y - trajectory[i-1].y;
            const dz = trajectory[i].z - trajectory[i-1].z;
            const jump = Math.sqrt(dx*dx + dy*dy + dz*dz);

            if (!isFinite(jump)) {
                console.warn(`  ⚠️ NaN detected at step ${i}`);
                failCount++;
                passCount--;
                break;
            }

            maxJump = Math.max(maxJump, jump);
        }

        if (maxJump > 0.1) {
            console.warn(`  ⚠️ Large position jump detected: ${maxJump.toFixed(6)} AU`);
        } else {
            console.log(`  Max position jump: ${maxJump.toFixed(6)} AU (smooth ✅)`);
        }
    });

    console.log('\n========== TEST SUMMARY ==========');
    console.log(`Total tests: ${testCases.length}`);
    console.log(`Passed: ${passCount} ✅`);
    console.log(`Failed: ${failCount} ❌`);
    console.log(`Success rate: ${((passCount / testCases.length) * 100).toFixed(1)}%`);
    console.log('==================================\n');

    if (failCount === 0) {
        console.log('🎉 All tests passed! Adaptive resolution is working correctly.');
    } else {
        console.error('⚠️ Some tests failed. Review the output above for details.');
    }

    return { passed: passCount, failed: failCount };
}

console.log('[TEST] Adaptive resolution test suite loaded');
console.log('[TEST] Run with: import(\'/js/lib/trajectory-predictor-adaptive-test.js\').then(m => m.runAdaptiveTests())');
