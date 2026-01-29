/**
 * Ship Physics Planning Mode Tests (TDD)
 *
 * Run in browser console:
 * import('/js/core/shipPhysics.planningMode.test.js').then(m => m.runAllTests())
 */

import { updateShipPhysics, getPlayerShip } from './shipPhysics.js';
import { setPlanningMode, setTimeOffset, getActiveJulianDate } from './gameState.js';

function assert(condition, message) {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
}

export function runAllTests() {
    console.log('=== SHIP PHYSICS PLANNING MODE TESTS ===\n');

    let passed = 0;
    let failed = 0;

    // Test 1: Ship position updates in planning mode
    console.log('Test 1: Ship position should update with time offset in planning mode');
    try {
        const ship = getPlayerShip();

        // Enable planning mode
        setPlanningMode(true);
        setTimeOffset(0);

        // Record initial position
        updateShipPhysics();
        const pos1 = { ...ship.position };

        // Move time offset forward 30 days
        setTimeOffset(30);
        updateShipPhysics();
        const pos2 = { ...ship.position };

        // Position should have changed (ship moved along orbit)
        const distance = Math.sqrt(
            Math.pow(pos2.x - pos1.x, 2) +
            Math.pow(pos2.y - pos1.y, 2) +
            Math.pow(pos2.z - pos1.z, 2)
        );

        assert(distance > 1e6, `Ship should have moved significantly (distance: ${distance.toExponential(2)} m)`);

        console.log(`  Initial: (${pos1.x.toExponential(2)}, ${pos1.y.toExponential(2)}, ${pos1.z.toExponential(2)})`);
        console.log(`  After +30d: (${pos2.x.toExponential(2)}, ${pos2.y.toExponential(2)}, ${pos2.z.toExponential(2)})`);
        console.log(`  Distance: ${distance.toExponential(2)} m`);
        console.log('✓ Test 1 passed');
        passed++;

        // Clean up
        setPlanningMode(false);
    } catch (error) {
        console.error('✗ Test 1 failed:', error.message);
        failed++;
    }

    // Test 2: Ship position uses simulation date in live mode
    console.log('\nTest 2: Ship position should use simulation date in live mode');
    try {
        setPlanningMode(false);
        const ship = getPlayerShip();

        updateShipPhysics();
        const pos1 = { ...ship.position };

        // Set time offset (should not affect ship in live mode)
        setTimeOffset(30);
        updateShipPhysics();
        const pos2 = { ...ship.position };

        // Position might change slightly due to physics, but not by orbital amounts
        const distance = Math.sqrt(
            Math.pow(pos2.x - pos1.x, 2) +
            Math.pow(pos2.y - pos1.y, 2) +
            Math.pow(pos2.z - pos1.z, 2)
        );

        // In live mode with paused time, position should be nearly identical
        assert(distance < 1e3, `Ship should not have moved significantly in live mode (distance: ${distance})`);

        console.log(`  Distance: ${distance.toFixed(2)} m`);
        console.log('✓ Test 2 passed');
        passed++;

        // Clean up
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
