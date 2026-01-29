/**
 * Celestial Bodies Planning Mode Tests (TDD)
 *
 * Run in browser console:
 * import('/js/data/celestialBodies.planningMode.test.js').then(m => m.runAllTests())
 */

import { celestialBodies, updateCelestialPositions } from './celestialBodies.js';
import { setPlanningMode, setTimeOffset } from '../core/gameState.js';

function assert(condition, message) {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
}

export function runAllTests() {
    console.log('=== CELESTIAL BODIES PLANNING MODE TESTS ===\n');

    let passed = 0;
    let failed = 0;

    // Test 1: Planet positions update with time offset in planning mode
    console.log('Test 1: Planet positions should update with time offset');
    try {
        setPlanningMode(true);
        setTimeOffset(0);

        const earth = celestialBodies.find(b => b.id === 'earth');
        updateCelestialPositions();
        const pos1 = { ...earth.position };

        // Move forward 90 days (1/4 orbit)
        setTimeOffset(90);
        updateCelestialPositions();
        const pos2 = { ...earth.position };

        const distance = Math.sqrt(
            Math.pow(pos2.x - pos1.x, 2) +
            Math.pow(pos2.y - pos1.y, 2) +
            Math.pow(pos2.z - pos1.z, 2)
        );

        // Earth should have moved significantly (~1/4 orbit = large distance)
        assert(distance > 1e10,
            `Earth should have moved significantly in 90 days (distance: ${distance.toExponential(2)} m)`);

        console.log(`  Distance moved: ${distance.toExponential(2)} m`);
        console.log('✓ Test 1 passed');
        passed++;

        // Clean up
        setPlanningMode(false);
        setTimeOffset(0);
    } catch (error) {
        console.error('✗ Test 1 failed:', error.message);
        failed++;
    }

    // Test 2: All major bodies update consistently
    console.log('\nTest 2: All planets should update with time offset');
    try {
        setPlanningMode(true);
        setTimeOffset(0);
        updateCelestialPositions();

        const bodies = ['mercury', 'venus', 'earth', 'mars'];
        const positions1 = {};

        bodies.forEach(id => {
            const body = celestialBodies.find(b => b.id === id);
            positions1[id] = { ...body.position };
        });

        // Move forward 180 days
        setTimeOffset(180);
        updateCelestialPositions();

        bodies.forEach(id => {
            const body = celestialBodies.find(b => b.id === id);
            const pos1 = positions1[id];
            const pos2 = body.position;

            const distance = Math.sqrt(
                Math.pow(pos2.x - pos1.x, 2) +
                Math.pow(pos2.y - pos1.y, 2) +
                Math.pow(pos2.z - pos1.z, 2)
            );

            assert(distance > 1e9,
                `${id} should have moved (distance: ${distance.toExponential(2)} m)`);
        });

        console.log('  All planets updated');
        console.log('✓ Test 2 passed');
        passed++;

        // Clean up
        setPlanningMode(false);
        setTimeOffset(0);
    } catch (error) {
        console.error('✗ Test 2 failed:', error.message);
        failed++;
    }

    // Summary
    setTimeout(() => {
        console.log('\n=== TEST SUMMARY ===');
        console.log(`Passed: ${passed}/2`);
        console.log(`Failed: ${failed}/2`);

        if (failed === 0) {
            console.log('\n✅ ALL TESTS PASSED');
        } else {
            console.error('\n❌ SOME TESTS FAILED');
        }
    }, 100);
}
