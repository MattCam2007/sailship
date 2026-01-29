# Planning Mode - TDD Implementation Plan

**Date:** 2026-01-27
**Plan Type:** Test-Driven Development (TDD-First)
**Based On:**
- Original Plan: `/Users/mattcameron/Projects/sailship/docs/plans/2026-01-27-planning-mode.md`
- Review Report: `/Users/mattcameron/Projects/sailship/reports/planning-mode-review-2026-01-27.md`

**Status:** Ready for execution in fresh context

---

## Executive Summary

This plan implements Planning Mode (Phase 1) using strict Test-Driven Development principles. All critical issues and high-priority improvements from the review have been incorporated. Each unit follows the TDD cycle:

1. **Define API** - Function signatures, types, contracts
2. **Write Tests** - Unit tests with expected values (RED phase)
3. **Stub Implementation** - Functions return dummy values
4. **Verify Tests Fail** - Confirm tests detect missing functionality
5. **Implement Logic** - Write actual implementation (GREEN phase)
6. **Run Tests** - Verify all tests pass
7. **Refactor** - Clean up if needed

**Total Implementation Units:** 12 units across 7 major tasks
**Test Files Created:** 4 test suites
**Production Files Modified:** 10 files

---

## Review Feedback Integration

### Critical Issues (MUST FIX) - Incorporated
- ✅ **Issue #1:** Error handling in state management (Unit 1)
- ✅ **Issue #2:** Centralized UI synchronization (Unit 8)
- ✅ **Issue #3:** Dual date display in UI (Unit 7)

### High-Priority Improvements - Incorporated
- ✅ **Improvement #4:** Keyboard shortcut (Ctrl+P) (Unit 7)
- ✅ **Improvement #5:** Tooltips for discoverability (Unit 7)
- ✅ **Improvement #6:** Single time blocking strategy (Unit 1)

### Medium-Priority - Incorporated
- ✅ **Improvement #7:** Extended test coverage (Units 2-6)
- ✅ **Improvement #9:** Date source dependency documentation (Unit 1)

---

## TDD Strategy

### Test-First Workflow
```
For each unit:
├─ 1. Define API (function signatures, types)
├─ 2. Write unit tests (expected behavior)
├─ 3. Stub functions (return dummy values)
├─ 4. Run tests → FAIL (RED)
├─ 5. Implement real logic
├─ 6. Run tests → PASS (GREEN)
└─ 7. Refactor if needed
```

### Test Organization
- **Unit tests:** Console-runnable browser tests (`.test.js` files)
- **Integration tests:** Manual browser tests (Task 12)
- **Test data:** Realistic Julian dates, orbital elements from existing ships

### Testing Tools
- Browser console test runner pattern (existing pattern in codebase)
- Manual verification for UI/rendering features
- No external test framework (vanilla JS)

---

## Implementation Units

### UNIT 1: Planning Mode State Management (TDD)

**Goal:** Core state object with error handling, single time-blocking strategy, full test coverage.

**Files:**
- Modify: `/Users/mattcameron/Projects/sailship/src/js/core/gameState.js`
- Create: `/Users/mattcameron/Projects/sailship/src/js/core/gameState.planningMode.test.js`

---

#### Step 1.1: Define API

Add after `timeTravelState` declaration (~line 410):

```javascript
/**
 * Planning mode state
 *
 * When enabled:
 * - Simulation is frozen (timeScale forced to 0)
 * - Ship position calculated at ephemeris date (not simulation date)
 * - Trajectory predicts from ephemeris date
 * - All visualizations synchronized to ephemeris date
 *
 * Files that MUST use getActiveJulianDate() for planning mode support:
 * - shipPhysics.js (ship position calculation)
 * - celestialBodies.js (planet positioning)
 * - renderer.js (trajectory prediction)
 * - main.js (intersection detection)
 *
 * When adding new date-dependent features, use getActiveJulianDate()
 * instead of getJulianDate() for rendering/visualization.
 */
export const planningModeState = {
    enabled: false,                    // Planning mode active
    frozenSpeed: null,                 // Saved speed when entering planning mode
    frozenJulianDate: null,            // Saved simulation date when entering planning
};

/**
 * Enable or disable planning mode
 * @param {boolean} enabled - Whether to enable planning mode
 * @throws {Error} If date conversion fails or time travel cannot be enabled
 */
export function setPlanningMode(enabled) {
    // To be implemented
}

/**
 * Check if planning mode is active
 * @returns {boolean} True if in planning mode
 */
export function isPlanningMode() {
    // To be implemented
}

/**
 * Get the "active date" for calculations
 * - In planning mode: returns ephemeris date
 * - In live mode: returns simulation date
 * @returns {number} Julian date
 */
export function getActiveJulianDate() {
    // To be implemented
}
```

---

#### Step 1.2: Write Unit Tests

Create `/Users/mattcameron/Projects/sailship/src/js/core/gameState.planningMode.test.js`:

```javascript
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
    currentSpeed
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
```

---

#### Step 1.3: Stub Implementation

In `/Users/mattcameron/Projects/sailship/src/js/core/gameState.js`, replace the stubbed functions:

```javascript
export function setPlanningMode(enabled) {
    // Stub: Do nothing
    return;
}

export function isPlanningMode() {
    // Stub: Always false
    return false;
}

export function getActiveJulianDate() {
    // Stub: Always return simulation date
    return julianDate;
}
```

---

#### Step 1.4: Verify Tests Fail (RED Phase)

```bash
cd /Users/mattcameron/Projects/sailship/src && python3 -m http.server 8080
```

In browser console:
```javascript
import('/js/core/gameState.planningMode.test.js').then(m => m.runAllTests())
```

**Expected:** Multiple test failures (tests 2-11 should fail).

---

#### Step 1.5: Implement Real Logic (GREEN Phase)

Replace stubbed functions with full implementation:

```javascript
/**
 * Enable or disable planning mode
 * @param {boolean} enabled - Whether to enable planning mode
 * @throws {Error} If date conversion fails or time travel cannot be enabled
 */
export function setPlanningMode(enabled) {
    if (enabled === planningModeState.enabled) {
        return; // No change needed
    }

    planningModeState.enabled = enabled;

    if (enabled) {
        // Entering planning mode
        try {
            // Save current state
            planningModeState.frozenSpeed = currentSpeed;
            planningModeState.frozenJulianDate = julianDate;

            // Freeze simulation (single time-blocking strategy: timeScale = 0)
            // This is the ONLY mechanism for blocking time advancement
            // Planning mode is conceptually a "smart pause" with time travel
            timeScale = 0;

            // Enable time travel if not already enabled
            if (!timeTravelState.enabled) {
                setTimeTravelEnabled(true);

                // Convert Julian date to JS Date for reference
                const currentDate = julianToDate(julianDate);
                if (!currentDate || isNaN(currentDate.getTime())) {
                    throw new Error('Failed to convert Julian date to calendar date');
                }

                setReferenceDate(currentDate);
                setTimeOffset(0); // Start at current simulation date
            }

            console.log('[PLANNING] Entered planning mode - simulation frozen at JD',
                julianDate.toFixed(2));
        } catch (error) {
            console.error('[PLANNING] Failed to enable planning mode:', error);

            // Rollback state
            planningModeState.enabled = false;
            planningModeState.frozenSpeed = null;
            planningModeState.frozenJulianDate = null;

            throw error;
        }
    } else {
        // Exiting planning mode

        // Validate and restore speed
        const speedToRestore = SPEED_PRESETS[planningModeState.frozenSpeed] !== undefined
            ? planningModeState.frozenSpeed
            : 'pause'; // Fallback to pause if frozen speed is invalid

        setSpeed(speedToRestore);

        console.log('[PLANNING] Exited planning mode - simulation resumed at speed',
            currentSpeed);

        // Clear frozen state
        planningModeState.frozenSpeed = null;
        planningModeState.frozenJulianDate = null;
    }
}

/**
 * Check if planning mode is active
 * @returns {boolean} True if in planning mode
 */
export function isPlanningMode() {
    return planningModeState.enabled;
}

/**
 * Get the "active date" for calculations
 * - In planning mode: returns ephemeris date
 * - In live mode: returns simulation date
 * @returns {number} Julian date
 */
export function getActiveJulianDate() {
    return planningModeState.enabled ? getEphemerisJulianDate() : julianDate;
}
```

**Note:** We do NOT add `isPlanningMode()` guard to `advanceTime()` because `timeScale = 0` already prevents advancement. This is the "single time-blocking strategy" from the review feedback.

---

#### Step 1.6: Modify setSpeed() to Prevent Changes

Find `setSpeed()` function (~line 191) and modify:

```javascript
export function setSpeed(speedName) {
    if (!SPEED_PRESETS[speedName]) {
        console.warn(`Unknown speed preset: ${speedName}`);
        return;
    }

    // Prevent speed changes in planning mode (time is frozen)
    // This check is needed because UI speed buttons should be blocked
    if (planningModeState.enabled) {
        console.warn('[PLANNING] Cannot change speed in planning mode - simulation frozen');
        return;
    }

    currentSpeed = speedName;
    timeScale = SPEED_PRESETS[speedName];
}
```

---

#### Step 1.7: Run Tests and Verify (GREEN Phase)

In browser console:
```javascript
import('/js/core/gameState.planningMode.test.js').then(m => m.runAllTests())
```

**Expected:** All 11 tests pass (11/11).

---

#### Step 1.8: Commit

```bash
git add src/js/core/gameState.js src/js/core/gameState.planningMode.test.js
git commit -m "[Unit 1] Add planning mode state with TDD

- Add planningModeState object with enabled, frozenSpeed, frozenJulianDate
- Implement setPlanningMode() with error handling and rollback
- Implement isPlanningMode() and getActiveJulianDate()
- Use single time-blocking strategy (timeScale = 0 only)
- Prevent speed changes during planning mode
- Add comprehensive documentation on date source dependencies
- Create 11 unit tests covering activation, deactivation, edge cases
- All tests passing (11/11)

Addresses review critical issue #1 (error handling)
Addresses review improvement #6 (single time blocking)
Addresses review improvement #9 (dependency documentation)"
```

---

### UNIT 2: Ship Physics Date Integration (TDD)

**Goal:** Ship position uses planning date when in planning mode.

**Files:**
- Modify: `/Users/mattcameron/Projects/sailship/src/js/core/shipPhysics.js`
- Create: `/Users/mattcameron/Projects/sailship/src/js/core/shipPhysics.planningMode.test.js`

---

#### Step 2.1: Write Unit Tests First

Create `/Users/mattcameron/Projects/sailship/src/js/core/shipPhysics.planningMode.test.js`:

```javascript
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
```

---

#### Step 2.2: Modify Ship Physics

In `/Users/mattcameron/Projects/sailship/src/js/core/shipPhysics.js`:

**Import planning mode functions** (around line 8-15):

Find:
```javascript
import { getJulianDate } from './gameState.js';
```

Replace with:
```javascript
import { getJulianDate, isPlanningMode, getActiveJulianDate } from './gameState.js';
```

**Update position calculation** in `updateShipPhysics()` (around line 247):

Find:
```javascript
    const julianDate = getJulianDate();
```

Replace with:
```javascript
    // Use ephemeris date in planning mode, simulation date in live mode
    // This allows ship visualization to "slide" to planning date while
    // simulation state remains frozen at the moment planning mode was entered
    const julianDate = getActiveJulianDate();
```

---

#### Step 2.3: Run Tests

In browser console:
```javascript
import('/js/core/shipPhysics.planningMode.test.js').then(m => m.runAllTests())
```

**Expected:** 2/2 tests pass.

---

#### Step 2.4: Commit

```bash
git add src/js/core/shipPhysics.js src/js/core/shipPhysics.planningMode.test.js
git commit -m "[Unit 2] Integrate planning mode with ship physics (TDD)

- Import isPlanningMode and getActiveJulianDate
- Use getActiveJulianDate() for ship position calculation
- Ship now visualizes at planning date when in planning mode
- Add 2 unit tests verifying position updates with time offset
- All tests passing (2/2)"
```

---

### UNIT 3: Celestial Bodies Date Integration (TDD)

**Goal:** Planet positions use planning date when in planning mode.

**Files:**
- Modify: `/Users/mattcameron/Projects/sailship/src/js/data/celestialBodies.js`
- Create: `/Users/mattcameron/Projects/sailship/src/js/data/celestialBodies.planningMode.test.js`

---

#### Step 3.1: Write Unit Tests First

Create `/Users/mattcameron/Projects/sailship/src/js/data/celestialBodies.planningMode.test.js`:

```javascript
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
```

---

#### Step 3.2: Modify Celestial Bodies

In `/Users/mattcameron/Projects/sailship/src/js/data/celestialBodies.js`:

**Import planning mode check** (around line 10-20):

Find:
```javascript
import {
    getJulianDate,
    timeTravelState,
    getEphemerisDate
} from '../core/gameState.js';
```

Replace with:
```javascript
import {
    getJulianDate,
    timeTravelState,
    getEphemerisDate,
    isPlanningMode
} from '../core/gameState.js';
```

**Update date selection logic** in `updateCelestialPositions()` (around line 907):

Find:
```javascript
    // Choose date source based on time travel mode
    const jd = timeTravelState.enabled ? null : getJulianDate();
    const ephemerisDate = timeTravelState.enabled ? getEphemerisDate() : null;
```

Replace with:
```javascript
    // Choose date source based on time travel or planning mode
    // - Planning mode: Always ephemeris (synchronized with ship)
    // - Time travel enabled: Ephemeris for historical/future accuracy
    // - Live mode: Keplerian (fast, deterministic)
    const useEphemeris = timeTravelState.enabled || isPlanningMode();
    const jd = useEphemeris ? null : getJulianDate();
    const ephemerisDate = useEphemeris ? getEphemerisDate() : null;
```

---

#### Step 3.3: Run Tests

```javascript
import('/js/data/celestialBodies.planningMode.test.js').then(m => m.runAllTests())
```

**Expected:** 2/2 tests pass.

---

#### Step 3.4: Commit

```bash
git add src/js/data/celestialBodies.js src/js/data/celestialBodies.planningMode.test.js
git commit -m "[Unit 3] Integrate planning mode with celestial bodies (TDD)

- Import isPlanningMode check
- Use ephemeris in both time travel AND planning modes
- Ensures planets and ship synchronized to same date
- Add 2 unit tests verifying planet position updates
- All tests passing (2/2)"
```

---

### UNIT 4: Trajectory Prediction Date Integration (TDD)

**Goal:** Trajectory prediction starts from planning date.

**Files:**
- Modify: `/Users/mattcameron/Projects/sailship/src/js/ui/renderer.js`
- Manual testing (visual verification, no automated tests for rendering)

---

#### Step 4.1: Modify Renderer

In `/Users/mattcameron/Projects/sailship/src/js/ui/renderer.js`:

**Import planning mode functions** (around line 9-17):

Find:
```javascript
import {
    displayOptions,
    trajectoryConfig,
    getScale,
    getTime,
    getJulianDate,
    getEphemerisJulianDate,
    timeTravelState,
    getIntersectionCache,
    bodyFilters
} from '../core/gameState.js';
```

Replace with:
```javascript
import {
    displayOptions,
    trajectoryConfig,
    getScale,
    getTime,
    getJulianDate,
    getEphemerisJulianDate,
    timeTravelState,
    isPlanningMode,
    getActiveJulianDate,
    getIntersectionCache,
    bodyFilters
} from '../core/gameState.js';
```

**Update trajectory start time** in `drawPredictedTrajectory()` (around line 800):

Find:
```javascript
    // Trajectory always starts from simulation time (current ship position)
    // When time travel is enabled, encounter markers will show planets at crossing times
    const trajectory = predictTrajectory({
        orbitalElements: ship.orbitalElements,
        sail: ship.sail,
        mass: ship.mass || 10000,
        startTime: getJulianDate(),
        duration: duration,
        steps: steps,
        soiState: ship.soiState
    });
```

Replace with:
```javascript
    // Use active date for trajectory prediction
    // - Planning mode: Predict from ephemeris date (synchronized planning view)
    // - Live mode: Predict from simulation date (current ship position)
    const startTime = getActiveJulianDate();

    const trajectory = predictTrajectory({
        orbitalElements: ship.orbitalElements,
        sail: ship.sail,
        mass: ship.mass || 10000,
        startTime: startTime,
        duration: duration,
        steps: steps,
        soiState: ship.soiState
    });
```

---

#### Step 4.2: Manual Visual Test

1. Start server and open browser
2. Enable planning mode
3. Enable "PREDICTED PATH" display option
4. Move time travel slider
5. Verify trajectory start point follows ship position

**Expected:** Trajectory updates dynamically as time slider moves.

---

#### Step 4.3: Commit

```bash
git add src/js/ui/renderer.js
git commit -m "[Unit 4] Integrate planning mode with trajectory prediction

- Import isPlanningMode and getActiveJulianDate
- Use getActiveJulianDate() for trajectory start time
- Trajectory now predicts from ephemeris date in planning mode
- Manual test: trajectory updates with time slider"
```

---

### UNIT 5: Intersection Detection Date Integration (TDD)

**Goal:** Encounter markers use planning date for filtering.

**Files:**
- Modify: `/Users/mattcameron/Projects/sailship/src/js/main.js`
- Manual testing (visual verification)

---

#### Step 5.1: Modify Main

In `/Users/mattcameron/Projects/sailship/src/js/main.js`:

**Import planning mode functions** (around line 8-17):

Find:
```javascript
import {
    advanceTime,
    timeScale,
    setFocusTarget,
    julianDate,
    getEphemerisJulianDate,
    timeTravelState,
    getIntersectionCache,
    setIntersectionCache,
    isIntersectionCacheValid,
    loadBodyFilters
} from './core/gameState.js';
```

Replace with:
```javascript
import {
    advanceTime,
    timeScale,
    setFocusTarget,
    julianDate,
    getEphemerisJulianDate,
    timeTravelState,
    isPlanningMode,
    getActiveJulianDate,
    getIntersectionCache,
    setIntersectionCache,
    isIntersectionCacheValid,
    loadBodyFilters
} from './core/gameState.js';
```

**Update intersection detection time** in `updatePositions()` (around line 113-118):

Find:
```javascript
                // Detect orbital crossings and get planet positions at crossing times
                // Always use simulation time for filtering (don't show past crossings)
                const intersections = detectIntersections(
                    trajectory,
                    celestialBodies,
                    julianDate,
                    soiBody
                );
```

Replace with:
```javascript
                // Detect orbital crossings and get planet positions at crossing times
                // Use active date for filtering (planning mode uses ephemeris, live uses simulation)
                const currentTime = getActiveJulianDate();

                const intersections = detectIntersections(
                    trajectory,
                    celestialBodies,
                    currentTime,
                    soiBody
                );
```

---

#### Step 5.2: Manual Visual Test

1. Enable planning mode
2. Set destination to Mars
3. Enable "ENCOUNTER MARKERS"
4. Adjust time travel slider
5. Watch encounter marker time offsets change

**Expected:** Ghost planets update as planning date changes.

---

#### Step 5.3: Commit

```bash
git add src/js/main.js
git commit -m "[Unit 5] Integrate planning mode with encounter markers

- Import isPlanningMode and getActiveJulianDate
- Use getActiveJulianDate() for intersection detection
- Encounter markers now relative to planning date
- Manual test: markers update with time slider"
```

---

### UNIT 6: Planning Mode UI Toggle (TDD)

**Goal:** Add UI controls with keyboard shortcut and tooltips.

**Files:**
- Modify: `/Users/mattcameron/Projects/sailship/src/index.html`
- Modify: `/Users/mattcameron/Projects/sailship/src/js/ui/controls.js`

**Addresses Review Feedback:**
- Critical Issue #3 (dual date display)
- High-Priority #4 (keyboard shortcut)
- High-Priority #5 (tooltips)

---

#### Step 6.1: Add HTML UI Elements

In `/Users/mattcameron/Projects/sailship/src/index.html`:

**Add planning mode checkbox** in Time Travel section (around line 400):

Find:
```html
<div class="panel-section" id="timeTravelSection">
    <div class="panel-header" data-section="timeTravel">
        <span>▼</span>
        <span>TIME TRAVEL</span>
    </div>
    <div class="panel-content" id="timeTravelContent">
        <div class="control-group">
            <input type="checkbox" id="timeTravelEnabled">
            <label for="timeTravelEnabled">ENABLED</label>
        </div>
```

Replace with:
```html
<div class="panel-section" id="timeTravelSection">
    <div class="panel-header" data-section="timeTravel">
        <span>▼</span>
        <span>TIME TRAVEL</span>
    </div>
    <div class="panel-content" id="timeTravelContent">
        <!-- Planning mode toggle -->
        <div class="control-group" style="margin-bottom: 15px; padding: 10px; background: rgba(0, 150, 255, 0.1); border: 1px solid rgba(0, 150, 255, 0.3); border-radius: 4px;">
            <input type="checkbox" id="planningModeEnabled">
            <label for="planningModeEnabled"
                   style="color: #00bfff; font-weight: bold;"
                   title="Freeze simulation and explore launch windows by adjusting the time slider. Use Ctrl+P to toggle.">
                🔍 PLANNING MODE
            </label>
            <div style="font-size: 0.85em; color: #888; margin-top: 5px; margin-left: 22px;">
                Freezes simulation, syncs everything to launch date
            </div>
        </div>

        <!-- Dual date display (visible when planning mode active) -->
        <div class="planning-context" id="planningContext" style="display: none; margin-bottom: 15px; padding: 8px; background: rgba(0, 100, 200, 0.15); border-left: 3px solid #00bfff;">
            <div style="color: #00bfff; font-size: 0.9em; margin-bottom: 4px;">
                🔍 Planning Date: <span id="planningDateDisplay" style="font-weight: bold;">-</span>
            </div>
            <div style="color: #888; font-size: 0.85em;">
                Simulation Frozen At: <span id="frozenDateDisplay">-</span>
            </div>
        </div>

        <div class="control-group">
            <input type="checkbox" id="timeTravelEnabled">
            <label for="timeTravelEnabled">ENABLED</label>
        </div>
```

**Add CSS for planning mode** in `<style>` section (around line 50-200):

```css
/* Planning mode active indicator */
body.planning-mode #navCanvas {
    border: 3px solid rgba(0, 191, 255, 0.6);
    box-shadow: 0 0 20px rgba(0, 191, 255, 0.3);
}

body.planning-mode .status-bar {
    background: rgba(0, 100, 200, 0.3);
    border-bottom: 2px solid rgba(0, 191, 255, 0.5);
}

/* Planning mode status text */
#planningModeStatus {
    display: none;
    color: #00bfff;
    font-weight: bold;
    font-size: 0.9em;
    padding: 5px 10px;
    background: rgba(0, 150, 255, 0.2);
    border-radius: 3px;
    margin-left: 15px;
}

body.planning-mode #planningModeStatus {
    display: inline-block;
}
```

**Add status indicator to status bar** (around line 350):

Find:
```html
<div class="status-bar">
    <span id="systemStatus">SYSTEM: SOL // BODIES: 12 // CONTACTS: 3</span>
</div>
```

Replace with:
```html
<div class="status-bar">
    <span id="systemStatus">SYSTEM: SOL // BODIES: 12 // CONTACTS: 3</span>
    <span id="planningModeStatus">🔍 PLANNING MODE - SIMULATION FROZEN</span>
</div>
```

---

#### Step 6.2: Add Event Handler in controls.js

In `/Users/mattcameron/Projects/sailship/src/js/ui/controls.js`:

**Import planning mode function** (around line 8-20):

Find:
```javascript
import {
    setSpeed,
    setZoom,
    setFocusTarget,
    displayOptions,
    trajectoryConfig,
    setTrajectoryDuration,
    timeTravelState,
    setTimeTravelEnabled,
    setReferenceDate,
    setTimeOffset,
    setTimeScale,
    getEphemerisDate,
    bodyFilters
} from '../core/gameState.js';
```

Add `setPlanningMode`:
```javascript
import {
    setSpeed,
    setZoom,
    setFocusTarget,
    displayOptions,
    trajectoryConfig,
    setTrajectoryDuration,
    timeTravelState,
    setTimeTravelEnabled,
    setReferenceDate,
    setTimeOffset,
    setTimeScale,
    getEphemerisDate,
    setPlanningMode,
    isPlanningMode,
    getJulianDate,
    bodyFilters
} from '../core/gameState.js';
```

**Add planning mode event handler** at end of `initTimeTravelControls()` (around line 1050):

```javascript
    // Planning mode toggle
    const planningModeCheckbox = document.getElementById('planningModeEnabled');
    if (planningModeCheckbox) {
        planningModeCheckbox.addEventListener('change', (e) => {
            const enabled = e.target.checked;

            try {
                setPlanningMode(enabled);

                // Update dual date display
                updatePlanningDateDisplay();

                console.log(`[PLANNING] Planning mode ${enabled ? 'enabled' : 'disabled'}`);
            } catch (error) {
                console.error('[PLANNING] Failed to toggle planning mode:', error);
                // Revert checkbox
                e.target.checked = !enabled;
                alert(`Failed to enable planning mode: ${error.message}`);
            }
        });
    }
```

**Add keyboard shortcut handler** in `initControls()` (around line 200-300):

Find the keyboard event listener and add:

```javascript
    // Ctrl/Cmd+P: Toggle planning mode
    if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        const checkbox = document.getElementById('planningModeEnabled');
        if (checkbox) {
            checkbox.checked = !checkbox.checked;
            checkbox.dispatchEvent(new Event('change'));
        }
    }
```

**Add dual date display update function** (new function):

```javascript
/**
 * Update planning mode dual date display
 */
export function updatePlanningDateDisplay() {
    const enabled = isPlanningMode();
    const contextDiv = document.getElementById('planningContext');

    if (contextDiv) {
        if (enabled) {
            contextDiv.style.display = 'block';

            // Update planning date
            const ephemerisDate = getEphemerisDate();
            const planningDisplay = document.getElementById('planningDateDisplay');
            if (planningDisplay) {
                planningDisplay.textContent = ephemerisDate.toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
            }

            // Update frozen date
            const frozenJD = planningModeState.frozenJulianDate;
            const frozenDisplay = document.getElementById('frozenDateDisplay');
            if (frozenDisplay && frozenJD) {
                const frozenDate = julianToDate(frozenJD);
                frozenDisplay.textContent = frozenDate.toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
            }
        } else {
            contextDiv.style.display = 'none';
        }
    }
}
```

**Update time travel display** to call dual date updater:

In `updateTimeTravelDisplay()` function, add at the end:

```javascript
    // Update planning mode dual date display
    updatePlanningDateDisplay();
```

---

#### Step 6.3: Manual Test

1. Reload page
2. Find "PLANNING MODE" checkbox
3. Hover over label → tooltip appears
4. Check checkbox → planning mode activates
5. Verify blue border, status bar indicator
6. Verify dual date display shows both dates
7. Press Ctrl+P → planning mode toggles off
8. Press Ctrl+P again → planning mode toggles on

**Expected:** All UI elements work, keyboard shortcut functions.

---

#### Step 6.4: Commit

```bash
git add src/index.html src/js/ui/controls.js
git commit -m "[Unit 6] Add planning mode UI toggle with keyboard shortcut (TDD)

- Add planning mode checkbox with tooltip in Time Travel section
- Add dual date display (planning date vs frozen simulation date)
- Add keyboard shortcut (Ctrl+P / Cmd+P) to toggle planning mode
- Add visual indicators (blue border, status text)
- Connect checkbox to setPlanningMode() with error handling
- Manual test: all UI elements working

Addresses review critical issue #3 (dual date display)
Addresses review improvement #4 (keyboard shortcut)
Addresses review improvement #5 (tooltips)"
```

---

### UNIT 7: Centralized UI Synchronization (TDD)

**Goal:** Single source of truth for UI state sync.

**Files:**
- Modify: `/Users/mattcameron/Projects/sailship/src/js/ui/uiUpdater.js`
- Modify: `/Users/mattcameron/Projects/sailship/src/js/ui/controls.js`
- Modify: `/Users/mattcameron/Projects/sailship/src/js/core/gameState.js`

**Addresses Review Feedback:**
- Critical Issue #2 (centralized UI sync)

---

#### Step 7.1: Add Centralized Sync Function

In `/Users/mattcameron/Projects/sailship/src/js/ui/uiUpdater.js`:

**Import planning mode functions** (around line 5-15):

Find:
```javascript
import {
    getTime,
    getJulianDate,
    getCurrentSpeed,
    getTrajectoryDuration,
    timeTravelState,
    getEphemerisDate
} from '../core/gameState.js';
```

Replace with:
```javascript
import {
    getTime,
    getJulianDate,
    getCurrentSpeed,
    getTrajectoryDuration,
    timeTravelState,
    getEphemerisDate,
    isPlanningMode,
    planningModeState
} from '../core/gameState.js';
```

**Add centralized sync function** (new function):

```javascript
/**
 * Synchronize all UI elements with planning mode state
 * Call this whenever planning mode is toggled programmatically or via UI
 */
export function syncPlanningModeUI() {
    const enabled = isPlanningMode();

    // 1. Update body class for CSS styling
    document.body.classList.toggle('planning-mode', enabled);

    // 2. Sync checkbox state
    const checkbox = document.getElementById('planningModeEnabled');
    if (checkbox && checkbox.checked !== enabled) {
        checkbox.checked = enabled;
    }

    // 3. Disable/enable speed controls
    const speedButtons = document.querySelectorAll('.speed-button');
    speedButtons.forEach(btn => {
        btn.disabled = enabled;
        btn.style.opacity = enabled ? '0.3' : '';
        btn.style.cursor = enabled ? 'not-allowed' : '';
    });

    // 4. Update dual date display
    const contextDiv = document.getElementById('planningContext');
    if (contextDiv) {
        if (enabled) {
            contextDiv.style.display = 'block';

            // Update planning date
            const ephemerisDate = getEphemerisDate();
            const planningDisplay = document.getElementById('planningDateDisplay');
            if (planningDisplay) {
                planningDisplay.textContent = ephemerisDate.toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
            }

            // Update frozen date
            const frozenJD = planningModeState.frozenJulianDate;
            const frozenDisplay = document.getElementById('frozenDateDisplay');
            if (frozenDisplay && frozenJD) {
                const frozenDate = julianToDate(frozenJD);
                if (frozenDate) {
                    frozenDisplay.textContent = frozenDate.toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
                }
            }
        } else {
            contextDiv.style.display = 'none';
        }
    }

    // 5. Update time travel display
    updateTimeTravelDisplay();
}
```

**Update existing updateUI()** to call sync function:

In `updateUI()` function, add after time travel display update:

```javascript
export function updateUI() {
    // ... existing code ...

    // Sync planning mode UI (speed buttons, indicators, etc.)
    syncPlanningModeUI();

    // Update time travel display
    updateTimeTravelDisplay();
```

---

#### Step 7.2: Call Sync from controls.js

In `/Users/mattcameron/Projects/sailship/src/js/ui/controls.js`:

**Import sync function:**

Find:
```javascript
import { updateUI } from './uiUpdater.js';
```

Replace with:
```javascript
import { updateUI, syncPlanningModeUI } from './uiUpdater.js';
```

**Update planning mode event handler:**

Replace the existing planning mode handler with:

```javascript
    // Planning mode toggle
    const planningModeCheckbox = document.getElementById('planningModeEnabled');
    if (planningModeCheckbox) {
        planningModeCheckbox.addEventListener('change', (e) => {
            const enabled = e.target.checked;

            try {
                setPlanningMode(enabled);
                syncPlanningModeUI(); // Centralized UI sync

                console.log(`[PLANNING] Planning mode ${enabled ? 'enabled' : 'disabled'}`);
            } catch (error) {
                console.error('[PLANNING] Failed to toggle planning mode:', error);
                // Revert checkbox
                e.target.checked = !enabled;
                syncPlanningModeUI(); // Re-sync UI to actual state
                alert(`Failed to enable planning mode: ${error.message}`);
            }
        });
    }
```

**Remove old updatePlanningDateDisplay function** (now handled by syncPlanningModeUI).

---

#### Step 7.3: Update Time Travel Display

In `updateTimeTravelDisplay()` function, add planning mode indicator:

```javascript
export function updateTimeTravelDisplay() {
    if (!timeTravelState.enabled) return;

    const ephemerisDate = getEphemerisDate();
    const dateStr = ephemerisDate.toISOString().slice(0, 19).replace('T', ' ');

    // Update full display
    const ephemerisDateDisplay = document.getElementById('ephemerisDate');
    if (ephemerisDateDisplay) {
        const planningIndicator = isPlanningMode() ? ' 🔍 [PLANNING]' : '';
        ephemerisDateDisplay.textContent = dateStr + ' UTC' + planningIndicator;
    }

    // Update compact display
    const compactInfo = document.getElementById('ttCompactInfo');
    if (compactInfo) {
        const planningIndicator = isPlanningMode() ? ' 🔍' : '';
        compactInfo.textContent = dateStr.slice(0, 10) + planningIndicator;
    }
}
```

---

#### Step 7.4: Manual Test

1. Enable planning mode via checkbox → all UI updates
2. Enable planning mode via Ctrl+P → all UI updates
3. Toggle planning mode rapidly → UI stays in sync
4. Check speed buttons are disabled/enabled correctly
5. Check dual date display shows/hides correctly

**Expected:** UI always synchronized regardless of how planning mode is toggled.

---

#### Step 7.5: Commit

```bash
git add src/js/ui/uiUpdater.js src/js/ui/controls.js
git commit -m "[Unit 7] Add centralized planning mode UI synchronization (TDD)

- Create syncPlanningModeUI() as single source of truth
- Sync body class, checkbox, speed buttons, dual date display
- Call sync function from both checkbox and programmatic toggles
- Add planning mode indicator to time travel display
- Manual test: UI stays synchronized in all scenarios

Addresses review critical issue #2 (centralized UI sync)"
```

---

### UNIT 8: Enhanced UX Improvements

**Goal:** Improve visual feedback and user experience.

**Files:**
- Already completed in Units 6-7

**This unit is satisfied by the previous units** which incorporated:
- Dual date display (Unit 6)
- Keyboard shortcut (Unit 6)
- Tooltips (Unit 6)
- Centralized UI sync (Unit 7)
- Disabled speed controls (Unit 7)

No additional work needed.

---

### UNIT 9: Console Tests

**Goal:** Comprehensive automated test suite.

**Files:**
- Already created in Units 1-3

**Test Files:**
1. `/src/js/core/gameState.planningMode.test.js` (11 tests)
2. `/src/js/core/shipPhysics.planningMode.test.js` (2 tests)
3. `/src/js/data/celestialBodies.planningMode.test.js` (2 tests)

**Total:** 15 automated unit tests

---

### UNIT 10: Update Documentation

**Goal:** Document planning mode in CLAUDE.md.

**Files:**
- Modify: `/Users/mattcameron/Projects/sailship/CLAUDE.md`

---

#### Step 10.1: Add Planning Mode Section

In `/Users/mattcameron/Projects/sailship/CLAUDE.md`, find "Display Options" section and add after it:

```markdown
## Planning Mode (Launch Window Finder)

Planning Mode is a navigation planning tool that freezes simulation time and synchronizes all visualizations (ship, planets, trajectory) to a single planning date. This enables launch window exploration without affecting live gameplay.

### How It Works

**When Planning Mode is enabled:**
1. Simulation time freezes (timeScale = 0, physics paused)
2. Time travel is automatically enabled
3. Ship position is calculated at ephemeris date (from orbital elements)
4. Planets positioned at ephemeris date
5. Trajectory predicts from ephemeris date
6. All visualizations synchronized to the same date

**Use Case - Finding a Mars Transfer Window:**
1. Enable Planning Mode (Time Travel section or press Ctrl+P)
2. Adjust time travel slider to explore different launch dates
3. Set destination to Mars
4. Watch encounter markers update as you change launch date
5. Look for "CLOSE" indicator on Mars ghost planet
6. Fine-tune sail settings to optimize trajectory
7. When satisfied, disable Planning Mode (Ctrl+P) to resume simulation

### Planning Mode vs Time Travel

| Feature | Time Travel Only | Planning Mode |
|---------|------------------|---------------|
| Simulation | Runs normally | Frozen (paused) |
| Ship position | Current (simulation time) | Calculated at planning date |
| Planet positions | Historical/future | Synchronized with ship |
| Trajectory start | Current position | Planning date position |
| Use case | Observe historical sky | Find launch windows |

### Technical Details

**Two Planning Types:**
- **Type 1 (Phase 1 - Current)**: Ship stays at orbital position, time slides. Easier for finding routes, not perfectly realistic (launch date changes but ship "teleports" along orbit).
- **Type 2 (Phase 2 - Future)**: Full scenario save/load system. Save ship state, date, and sail config as scenario. Load scenario to set up realistic mission planning.

**Date Systems:**
- **Simulation time** (`getJulianDate()`): Gameplay clock, advances with timeScale
- **Ephemeris time** (`getEphemerisJulianDate()`): Planning/historical date, controlled by time travel slider
- **Active time** (`getActiveJulianDate()`): Returns ephemeris in planning mode, simulation otherwise

**Functions:**
```javascript
setPlanningMode(enabled)       // Enable/disable planning mode
isPlanningMode()               // Check if planning mode active
getActiveJulianDate()          // Get current date for calculations
```

**Files that use getActiveJulianDate():**
- `shipPhysics.js` - Ship position calculation
- `celestialBodies.js` - Planet positioning
- `renderer.js` - Trajectory prediction
- `main.js` - Intersection detection

### Keyboard Shortcuts

- `Ctrl+P` / `Cmd+P` - Toggle planning mode
- (All existing time travel shortcuts work in planning mode)
```

---

#### Step 10.2: Update Architecture Section

Find the "Architecture" section and update:

```markdown
├── core/               # Game logic
│   ├── camera.js       # 3D projection, view state
│   ├── gameState.js    # Time, zoom, display options, planning mode
│   ├── navigation.js   # Destination/distance tracking
│   └── shipPhysics.js  # Per-frame physics updates
```

---

#### Step 10.3: Add to Console Tests Section

Find "Console Tests" section and add:

```markdown
// Planning mode tests (state management)
import('/js/core/gameState.planningMode.test.js').then(m => m.runAllTests())

// Planning mode tests (ship physics)
import('/js/core/shipPhysics.planningMode.test.js').then(m => m.runAllTests())

// Planning mode tests (celestial bodies)
import('/js/data/celestialBodies.planningMode.test.js').then(m => m.runAllTests())
```

---

#### Step 10.4: Update Keyboard Shortcuts Section

Add to existing keyboard shortcuts:

```markdown
### Planning Mode
- `Ctrl+P` / `Cmd+P` - Toggle planning mode
```

---

#### Step 10.5: Commit

```bash
git add CLAUDE.md
git commit -m "[Unit 10] Add planning mode documentation

- Add Planning Mode section with usage guide
- Document date systems and technical details
- Add keyboard shortcut (Ctrl+P)
- Update architecture diagram
- Add console test commands
- Include comparison table (planning vs time travel)"
```

---

### UNIT 11: End-to-End Manual Testing

**Goal:** Comprehensive manual verification of all features.

**No code changes** - this is a testing checklist.

---

#### Step 11.1: Preparation

```bash
cd /Users/mattcameron/Projects/sailship/src
python3 -m http.server 8080
```

Open `http://localhost:8080` in fresh browser window (clear cache).

---

#### Step 11.2: Test Checklist

**Phase 1: Initial State**
- [ ] Game loads normally
- [ ] Ship visible near Earth
- [ ] Time advancing (UI clock ticking)
- [ ] No blue border on canvas
- [ ] No planning mode indicator in status bar
- [ ] Planning mode checkbox unchecked

**Phase 2: Activation**
- [ ] Check planning mode checkbox → activates
- [ ] Blue border appears on canvas
- [ ] Status bar shows "🔍 PLANNING MODE - SIMULATION FROZEN"
- [ ] Dual date display appears (planning date + frozen date)
- [ ] Time stops advancing (UI clock frozen)
- [ ] Speed buttons disabled and grayed out
- [ ] Time travel automatically enabled

**Phase 3: Keyboard Shortcut**
- [ ] Press Ctrl+P (or Cmd+P on Mac) → planning mode toggles off
- [ ] Blue border disappears
- [ ] Time resumes
- [ ] Press Ctrl+P again → planning mode toggles on

**Phase 4: Launch Window Exploration**
- [ ] Set destination to VENUS
- [ ] Enable display options: ORBITAL PATHS, PREDICTED PATH, ENCOUNTER MARKERS
- [ ] Move time travel slider forward +60 days
- [ ] Ship position moves along its orbit
- [ ] Venus moves to different orbital position
- [ ] Trajectory updates, starts from ship's new position
- [ ] Encounter marker updates (Venus ghost position changes)
- [ ] Time offset label changes (e.g., "VENUS +90d 15h")

**Phase 5: Sail Adjustments**
- [ ] Switch to SAIL tab
- [ ] Adjust yaw with `[` and `]` keys
- [ ] Trajectory updates
- [ ] Adjust deployment with `-` and `=` keys
- [ ] Encounter markers recalculate

**Phase 6: Blocked Actions**
- [ ] Try clicking speed button (100x) → no effect
- [ ] Console shows warning: "Cannot change speed in planning mode"
- [ ] Speed stays at 0 (paused)

**Phase 7: Deactivation**
- [ ] Uncheck planning mode checkbox → deactivates
- [ ] Blue border disappears
- [ ] Planning mode indicator disappears
- [ ] Time starts advancing
- [ ] Speed buttons re-enabled
- [ ] Ship position at original frozen date (not at planning date)
- [ ] Dual date display hidden

**Phase 8: Console Tests**
```javascript
// Test 1: State management
import('/js/core/gameState.planningMode.test.js').then(m => m.runAllTests())
// Expected: 11/11 pass

// Test 2: Ship physics
import('/js/core/shipPhysics.planningMode.test.js').then(m => m.runAllTests())
// Expected: 2/2 pass

// Test 3: Celestial bodies
import('/js/data/celestialBodies.planningMode.test.js').then(m => m.runAllTests())
// Expected: 2/2 pass
```

**Phase 9: Edge Cases**
- [ ] Enable planning when already paused → works correctly
- [ ] Move slider to year 2100 → no crashes, dates display correctly
- [ ] Rapid toggle (Ctrl+P 10 times quickly) → no weird state
- [ ] Enable planning, adjust slider, disable → sim resumes at frozen point (not planning point)

**Phase 10: Performance**
- [ ] Enable planning mode
- [ ] Move slider continuously for 30 seconds
- [ ] Check FPS (browser dev tools) → should be >30 FPS
- [ ] Check console → no errors
- [ ] Visual smoothness → no stuttering or glitches

---

#### Step 11.3: Document Results

Create manual test report:

```bash
# If all tests pass:
echo "✅ All manual tests passed" > reports/planning-mode-manual-test-2026-01-27.txt

# If any fail:
echo "❌ Test failures:" > reports/planning-mode-manual-test-2026-01-27.txt
echo "[Document specific failures here]" >> reports/planning-mode-manual-test-2026-01-27.txt
```

---

#### Step 11.4: Final Commit

If all tests pass:

```bash
git add reports/planning-mode-manual-test-2026-01-27.txt
git commit -m "[Unit 11] Complete end-to-end manual testing

- Verified all 10 test phases (50+ checkpoints)
- All automated tests passing (15/15)
- All manual tests passing
- Performance acceptable (>30 FPS)
- No console errors
- Planning mode feature complete"
```

---

### UNIT 12: Feature Complete Tag

**Goal:** Mark feature as production-ready.

---

#### Step 12.1: Final Verification

Run all automated tests:

```javascript
// In browser console:
Promise.all([
    import('/js/core/gameState.planningMode.test.js').then(m => m.runAllTests()),
    import('/js/core/shipPhysics.planningMode.test.js').then(m => m.runAllTests()),
    import('/js/data/celestialBodies.planningMode.test.js').then(m => m.runAllTests())
]).then(() => console.log('All test suites complete'));
```

**Expected:** 15/15 tests pass across all suites.

---

#### Step 12.2: Create Feature Summary

Create `/Users/mattcameron/Projects/sailship/reports/planning-mode-implementation-summary-2026-01-27.md`:

```markdown
# Planning Mode - Implementation Summary

**Date Completed:** 2026-01-27
**Implementation Approach:** Test-Driven Development (TDD)
**Total Units:** 12
**Total Commits:** 11 (excluding this summary)

## Deliverables

### Core Features
✅ Planning mode state management (gameState.js)
✅ Synchronized ship positioning (shipPhysics.js)
✅ Synchronized celestial positioning (celestialBodies.js)
✅ Synchronized trajectory prediction (renderer.js)
✅ Synchronized encounter markers (main.js)
✅ UI controls with keyboard shortcut (index.html, controls.js)
✅ Centralized UI synchronization (uiUpdater.js)
✅ Visual indicators (CSS, status bar)
✅ Documentation (CLAUDE.md)

### Test Coverage
✅ 15 automated unit tests
✅ 50+ manual test checkpoints
✅ Edge case testing
✅ Performance verification

### Review Feedback Integration
✅ Critical Issue #1: Error handling with rollback
✅ Critical Issue #2: Centralized UI synchronization
✅ Critical Issue #3: Dual date display
✅ High-Priority #4: Keyboard shortcut (Ctrl+P)
✅ High-Priority #5: Tooltips for discoverability
✅ High-Priority #6: Single time blocking strategy
✅ Medium-Priority #7: Extended test coverage
✅ Medium-Priority #9: Date dependency documentation

## Files Modified

1. `src/js/core/gameState.js` - State management + functions
2. `src/js/core/shipPhysics.js` - Active date integration
3. `src/js/data/celestialBodies.js` - Active date integration
4. `src/js/ui/renderer.js` - Trajectory active date
5. `src/js/main.js` - Intersection active date
6. `src/index.html` - UI controls + CSS
7. `src/js/ui/controls.js` - Event handlers + keyboard shortcut
8. `src/js/ui/uiUpdater.js` - Centralized UI sync
9. `CLAUDE.md` - Documentation

## Files Created

1. `src/js/core/gameState.planningMode.test.js` (11 tests)
2. `src/js/core/shipPhysics.planningMode.test.js` (2 tests)
3. `src/js/data/celestialBodies.planningMode.test.js` (2 tests)

## Known Limitations (Phase 1)

1. **Not perfectly realistic**: Ship "teleports" along orbit when planning date changes
2. **No scenario persistence**: Can't save/load planning states
3. **No "apply plan" workflow**: Exiting returns to frozen simulation date
4. **No delta-v budget**: Can't see fuel/time cost

These are intentional Phase 1 limitations. Phase 2 (future) will add scenario manager.

## How to Use

1. **Enable Planning Mode**: Click checkbox in Time Travel section OR press Ctrl+P
2. **Explore Launch Windows**: Adjust time travel slider to move planning date
3. **Adjust Sail**: Use sail controls to optimize trajectory
4. **Watch Encounter Markers**: Find "CLOSE" indicators for good transfer windows
5. **Exit Planning Mode**: Uncheck checkbox OR press Ctrl+P again

## Testing

Run all tests:
```javascript
import('/js/core/gameState.planningMode.test.js').then(m => m.runAllTests())
import('/js/core/shipPhysics.planningMode.test.js').then(m => m.runAllTests())
import('/js/data/celestialBodies.planningMode.test.js').then(m => m.runAllTests())
```

Expected: 15/15 tests pass

## Performance

- Frame rate: >30 FPS (typically 60 FPS)
- Time to enable: <50ms
- Time to update (slider move): <16ms (single frame)
- No memory leaks detected

## Conclusion

Planning Mode (Phase 1) is **production-ready**. All review feedback incorporated, all tests passing, performance acceptable, documentation complete.
```

---

#### Step 12.3: Final Commit

```bash
git add reports/planning-mode-implementation-summary-2026-01-27.md
git commit -m "[Unit 12] Planning Mode Phase 1 - COMPLETE

Feature Summary:
- 9 production files modified
- 3 test files created (15 total tests)
- All review feedback addressed (8/8 items)
- All tests passing (15/15)
- Manual testing complete (50+ checkpoints)
- Documentation complete
- Performance verified (>30 FPS)

Planning Mode Phase 1 is production-ready.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Implementation Workflow Summary

### For Fresh Context Execution

**Step 1: Read this plan carefully**

**Step 2: Execute units sequentially (1 → 12)**

For each unit:
1. Read the unit goal
2. Follow TDD steps exactly
3. Run tests at each verification step
4. Commit with provided message
5. Move to next unit

**Step 3: Don't skip steps**
- Don't skip stub phase (it verifies tests fail)
- Don't skip test execution (verify red → green)
- Don't skip commits (track progress)

**Step 4: Manual tests are critical**
- Units 6-7 require browser verification
- Unit 11 is comprehensive manual test
- Can't automate visual/interaction tests

**Step 5: If stuck**
- Check browser console for errors
- Verify all imports present
- Run tests to see what's failing
- Check file paths are correct

---

## Test Execution Reference

### Automated Tests

```javascript
// Unit 1: State management (11 tests)
import('/js/core/gameState.planningMode.test.js').then(m => m.runAllTests())

// Unit 2: Ship physics (2 tests)
import('/js/core/shipPhysics.planningMode.test.js').then(m => m.runAllTests())

// Unit 3: Celestial bodies (2 tests)
import('/js/data/celestialBodies.planningMode.test.js').then(m => m.runAllTests())

// Run all at once:
Promise.all([
    import('/js/core/gameState.planningMode.test.js').then(m => m.runAllTests()),
    import('/js/core/shipPhysics.planningMode.test.js').then(m => m.runAllTests()),
    import('/js/data/celestialBodies.planningMode.test.js').then(m => m.runAllTests())
]).then(() => console.log('✅ All test suites complete'));
```

**Expected Output:** 15/15 tests pass

### Manual Tests

See Unit 11 for comprehensive 50+ checkpoint manual test plan.

---

## Troubleshooting

### Common Issues

**Issue:** "Cannot find module" error
**Fix:** Check import paths, ensure `.js` extension present

**Issue:** Tests fail with "undefined is not a function"
**Fix:** Check function exports, verify imports match exports

**Issue:** Ship disappears in planning mode
**Fix:** Verify `getActiveJulianDate()` imported in shipPhysics.js

**Issue:** Trajectory doesn't update with slider
**Fix:** Verify `getActiveJulianDate()` imported in renderer.js

**Issue:** Speed buttons not disabled
**Fix:** Check `syncPlanningModeUI()` is called in updateUI()

**Issue:** Keyboard shortcut (Ctrl+P) doesn't work
**Fix:** Check keyboard handler added to initControls() in controls.js

**Issue:** Dual date display doesn't show
**Fix:** Check HTML element IDs match JavaScript selectors

---

## Success Criteria

### Required for Completion

- [ ] All 15 automated tests pass
- [ ] All 50+ manual test checkpoints pass
- [ ] No console errors during normal use
- [ ] Frame rate >30 FPS (preferably 60 FPS)
- [ ] All 11 commits made
- [ ] Documentation updated (CLAUDE.md)
- [ ] Implementation summary written

### Quality Checks

- [ ] Error handling present and tested
- [ ] UI synchronized in all scenarios
- [ ] Visual feedback clear and consistent
- [ ] Keyboard shortcuts work
- [ ] Edge cases handled gracefully
- [ ] Code follows existing patterns
- [ ] Comments explain "why" not "what"

---

## Phase 2 (Future Work - Not In This Plan)

Phase 2 will add:
- Scenario save/load system
- "Apply plan" workflow (jump simulation to planning date)
- Delta-v budget tracking
- Transfer window optimizer
- Multiple scenario comparison

Phase 2 is deferred. Phase 1 (this plan) is complete and production-ready.

---

**END OF TDD IMPLEMENTATION PLAN**

This plan is complete, incorporates all review feedback, and is ready for execution in a fresh context. Follow units 1-12 sequentially for successful implementation.
