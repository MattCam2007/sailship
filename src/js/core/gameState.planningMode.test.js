/**
 * Planning Mode State Management Tests (TDD)
 *
 * Run in browser console:
 * import('/js/core/gameState.planningMode.test.js').then(m => m.runAllTests())
 */

import {
    setPlanningMode,
    isPlanningMode,
    getActiveJulianDate,
    getJulianDate,
    getEphemerisJulianDate,
    timeTravelState,
    timeScale,
    setTimeOffset,
    SPEED_PRESETS,
    currentSpeed,
    planningModeState,
    julianToDate
} from './gameState.js';

function assert(condition, message) {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
}

function assertThrows(fn, expectedError, message) {
    try {
        fn();
        throw new Error(`${message} - Expected error but none was thrown`);
    } catch (error) {
        if (!error.message.includes(expectedError)) {
            throw new Error(`${message} - Expected "${expectedError}" but got "${error.message}"`);
        }
    }
}

export function runAllTests() {
    console.log('=== PLANNING MODE STATE TESTS (TDD) ===\n');

    let passed = 0;
    let failed = 0;

    // Test 1: Initial state
    console.log('Test 1: Initial state should be disabled');
    try {
        assert(isPlanningMode() === false, 'Should start disabled');
        assert(planningModeState.enabled === false, 'State flag should be false');
        assert(planningModeState.frozenSpeed === null, 'Frozen speed should be null');
        assert(planningModeState.frozenJulianDate === null, 'Frozen date should be null');
        console.log('✓ Test 1 passed');
        passed++;
    } catch (error) {
        console.error('✗ Test 1 failed:', error.message);
        failed++;
    }

    // Test 2: Activation freezes time
    console.log('\nTest 2: Activation should freeze time');
    try {
        const initialTimeScale = timeScale;
        setPlanningMode(true);

        assert(isPlanningMode() === true, 'Should be enabled');
        assert(timeScale === 0, 'Time scale should be 0');
        assert(planningModeState.frozenSpeed !== null, 'Should save frozen speed');
        assert(planningModeState.frozenJulianDate !== null, 'Should save frozen date');

        console.log('✓ Test 2 passed');
        passed++;
    } catch (error) {
        console.error('✗ Test 2 failed:', error.message);
        failed++;
    }

    // Test 3: Auto-enables time travel
    console.log('\nTest 3: Should auto-enable time travel');
    try {
        assert(timeTravelState.enabled === true, 'Time travel should be enabled');
        console.log('✓ Test 3 passed');
        passed++;
    } catch (error) {
        console.error('✗ Test 3 failed:', error.message);
        failed++;
    }

    // Test 4: getActiveJulianDate() returns ephemeris in planning mode
    console.log('\nTest 4: Active date should use ephemeris in planning mode');
    try {
        const activeDate = getActiveJulianDate();
        const ephemerisDate = getEphemerisJulianDate();
        const diff = Math.abs(activeDate - ephemerisDate);

        assert(diff < 0.001, `Active date should match ephemeris (diff: ${diff})`);
        console.log(`  Active: ${activeDate.toFixed(6)}`);
        console.log(`  Ephemeris: ${ephemerisDate.toFixed(6)}`);
        console.log('✓ Test 4 passed');
        passed++;
    } catch (error) {
        console.error('✗ Test 4 failed:', error.message);
        failed++;
    }

    // Test 5: Simulation date frozen (time blocking strategy)
    console.log('\nTest 5: Simulation date should be frozen');
    setTimeout(() => {
        try {
            const simDateBefore = getJulianDate();

            // Wait for next frame
            requestAnimationFrame(() => {
                const simDateAfter = getJulianDate();
                assert(simDateBefore === simDateAfter,
                    `Simulation date should not advance (before: ${simDateBefore}, after: ${simDateAfter})`);

                console.log(`  Date: ${simDateBefore.toFixed(6)}`);
                console.log('✓ Test 5 passed');
                passed++;
            });
        } catch (error) {
            console.error('✗ Test 5 failed:', error.message);
            failed++;
        }
    }, 50);

    // Test 6: Time offset changes active date
    console.log('\nTest 6: Time offset should change active date');
    try {
        const initialActive = getActiveJulianDate();
        setTimeOffset(30); // Move forward 30 days
        const newActive = getActiveJulianDate();
        const actualDiff = newActive - initialActive;

        assert(Math.abs(actualDiff - 30) < 0.1,
            `Expected 30 day offset, got ${actualDiff.toFixed(2)}`);

        console.log(`  Offset: 30 days`);
        console.log(`  Actual diff: ${actualDiff.toFixed(2)} days`);
        console.log('✓ Test 6 passed');
        passed++;

        // Reset offset
        setTimeOffset(0);
    } catch (error) {
        console.error('✗ Test 6 failed:', error.message);
        failed++;
    }

    // Test 7: Deactivation unfreezes time
    console.log('\nTest 7: Deactivation should unfreeze time');
    try {
        setPlanningMode(false);

        assert(isPlanningMode() === false, 'Should be disabled');
        assert(timeScale !== 0, `Time scale should not be 0 (got ${timeScale})`);
        assert(planningModeState.frozenSpeed === null, 'Frozen speed should be cleared');
        assert(planningModeState.frozenJulianDate === null, 'Frozen date should be cleared');

        console.log(`  Time scale: ${timeScale}`);
        console.log('✓ Test 7 passed');
        passed++;
    } catch (error) {
        console.error('✗ Test 7 failed:', error.message);
        failed++;
    }

    // Test 8: Active date returns simulation date after exit
    console.log('\nTest 8: Active date should use simulation after exit');
    try {
        const activeAfterExit = getActiveJulianDate();
        const simDate = getJulianDate();
        const diff = Math.abs(activeAfterExit - simDate);

        assert(diff < 0.001,
            `Active should match simulation (diff: ${diff})`);

        console.log(`  Active: ${activeAfterExit.toFixed(6)}`);
        console.log(`  Sim: ${simDate.toFixed(6)}`);
        console.log('✓ Test 8 passed');
        passed++;
    } catch (error) {
        console.error('✗ Test 8 failed:', error.message);
        failed++;
    }

    // Test 9: Edge case - already in planning mode
    console.log('\nTest 9: Enabling when already enabled should be no-op');
    try {
        setPlanningMode(true);
        const stateBefore = { ...planningModeState };

        setPlanningMode(true); // Enable again

        assert(planningModeState.enabled === stateBefore.enabled,
            'State should not change');
        assert(planningModeState.frozenSpeed === stateBefore.frozenSpeed,
            'Frozen speed should not change');

        console.log('✓ Test 9 passed');
        passed++;

        setPlanningMode(false); // Clean up
    } catch (error) {
        console.error('✗ Test 9 failed:', error.message);
        failed++;
    }

    // Test 10: Edge case - invalid frozen speed restoration
    console.log('\nTest 10: Should handle invalid frozen speed gracefully');
    try {
        setPlanningMode(true);
        planningModeState.frozenSpeed = 'INVALID_SPEED'; // Corrupt state

        setPlanningMode(false);

        // Should restore to 'pause' as fallback
        assert(currentSpeed === 'pause' || SPEED_PRESETS[currentSpeed] !== undefined,
            'Should restore to valid speed or pause');

        console.log('✓ Test 10 passed');
        passed++;
    } catch (error) {
        console.error('✗ Test 10 failed:', error.message);
        failed++;
    }

    // Test 11: Rapid toggle stress test
    console.log('\nTest 11: Rapid toggle stress test (20 cycles)');
    try {
        for (let i = 0; i < 20; i++) {
            setPlanningMode(true);
            setPlanningMode(false);
        }

        assert(isPlanningMode() === false, 'Should end in disabled state');
        assert(timeScale !== 0, 'Time should be unfrozen');

        console.log('✓ Test 11 passed');
        passed++;
    } catch (error) {
        console.error('✗ Test 11 failed:', error.message);
        failed++;
    }

    // Summary
    setTimeout(() => {
        console.log('\n=== TEST SUMMARY ===');
        console.log(`Passed: ${passed}/11`);
        console.log(`Failed: ${failed}/11`);

        if (failed === 0) {
            console.log('\n✅ ALL TESTS PASSED');
            return true;
        } else {
            console.error('\n❌ SOME TESTS FAILED');
            return false;
        }
    }, 200);
}
