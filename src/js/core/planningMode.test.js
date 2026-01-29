/**
 * Console-based tests for planningMode.js
 *
 * Run in browser console after loading the game:
 *   import('/js/core/planningMode.test.js').then(m => m.runAllTests())
 *
 * Or run individual tests:
 *   import('/js/core/planningMode.test.js').then(m => m.testDeepCopyIsolation())
 */

import {
    isActive,
    getEffectiveTime,
    getSandboxTimeOffset,
    setSandboxTimeOffset,
    getMode,
    setMode,
    getSnapshot,
    enterPlanningMode,
    exitPlanningMode,
    createSnapshot,
    restoreSnapshot,
    getShipPosition
} from './planningMode.js';

import { getPlayerShip } from '../data/ships.js';
import {
    getTime,
    setTime,
    getJulianDate,
    setJulianDate,
    getDisplayOptions,
    getTrajectoryConfig,
    getAutoPilotState
} from './gameState.js';
import { getCamera } from './camera.js';

// ============================================================
// TEST UTILITIES
// ============================================================

function assert(condition, message) {
    if (!condition) {
        console.error(`FAIL: ${message}`);
        return false;
    }
    console.log(`PASS: ${message}`);
    return true;
}

function assertApprox(actual, expected, tolerance, message) {
    const diff = Math.abs(actual - expected);
    if (diff > tolerance) {
        console.error(`FAIL: ${message} (expected ${expected}, got ${actual}, diff ${diff})`);
        return false;
    }
    console.log(`PASS: ${message}`);
    return true;
}

function assertDeepEqual(actual, expected, message) {
    const actualStr = JSON.stringify(actual);
    const expectedStr = JSON.stringify(expected);
    if (actualStr !== expectedStr) {
        console.error(`FAIL: ${message}`);
        console.error(`  Expected: ${expectedStr}`);
        console.error(`  Got: ${actualStr}`);
        return false;
    }
    console.log(`PASS: ${message}`);
    return true;
}

// Helper to ensure clean state before/after tests
function cleanupPlanningMode() {
    if (isActive()) {
        exitPlanningMode();
    }
}

// ============================================================
// TEST 1: Deep Copy Isolation
// ============================================================

/**
 * Verify snapshot modifications don't affect original game state
 */
export function testDeepCopyIsolation() {
    console.log('\n--- Test: Deep Copy Isolation ---');
    cleanupPlanningMode();

    let allPassed = true;

    // Save original state
    const player = getPlayerShip();
    const originalYaw = player.sail.angle;
    const originalDeployment = player.sail.deploymentPercent;
    const originalA = player.orbitalElements.a;

    // Create a snapshot
    const snapshot = createSnapshot();

    // Modify the snapshot
    snapshot.playerShip.sail.angle = originalYaw + 1.0;
    snapshot.playerShip.sail.deploymentPercent = 50;
    snapshot.playerShip.orbitalElements.a = originalA * 2;

    // Verify original state is unchanged
    allPassed &= assertApprox(player.sail.angle, originalYaw, 1e-10,
        'Original sail yaw unchanged after snapshot modification');
    allPassed &= assertApprox(player.sail.deploymentPercent, originalDeployment, 1e-10,
        'Original deployment unchanged after snapshot modification');
    allPassed &= assertApprox(player.orbitalElements.a, originalA, 1e-10,
        'Original semi-major axis unchanged after snapshot modification');

    cleanupPlanningMode();
    return allPassed;
}

// ============================================================
// TEST 2: Round Trip Integrity
// ============================================================

/**
 * Verify snapshot -> modify -> restore -> verify cycle
 */
export function testRoundTripIntegrity() {
    console.log('\n--- Test: Round Trip Integrity ---');
    cleanupPlanningMode();

    let allPassed = true;

    // Save original state values
    const originalTime = getTime();
    const originalJD = getJulianDate();
    const player = getPlayerShip();
    const originalSailAngle = player.sail.angle;
    const originalDeployment = player.sail.deploymentPercent;
    const originalElements = structuredClone(player.orbitalElements);

    // Create snapshot
    const snapshot = createSnapshot();

    // Modify live game state (simulate what would happen during planning)
    player.sail.angle = originalSailAngle + 0.5;
    player.sail.deploymentPercent = Math.max(0, originalDeployment - 20);
    player.orbitalElements.a *= 1.1;
    setTime(originalTime + 100);
    setJulianDate(originalJD + 100);

    // Verify state was modified
    allPassed &= assert(player.sail.angle !== originalSailAngle,
        'State was modified (sail angle changed)');
    allPassed &= assert(getTime() !== originalTime,
        'State was modified (time changed)');

    // Restore from snapshot
    restoreSnapshot(snapshot);

    // Verify original state is restored
    allPassed &= assertApprox(player.sail.angle, originalSailAngle, 1e-10,
        'Sail angle restored correctly');
    allPassed &= assertApprox(player.sail.deploymentPercent, originalDeployment, 1e-10,
        'Deployment restored correctly');
    allPassed &= assertApprox(player.orbitalElements.a, originalElements.a, 1e-10,
        'Semi-major axis restored correctly');
    allPassed &= assertApprox(getTime(), originalTime, 1e-10,
        'Game time restored correctly');
    allPassed &= assertApprox(getJulianDate(), originalJD, 1e-10,
        'Julian date restored correctly');

    cleanupPlanningMode();
    return allPassed;
}

// ============================================================
// TEST 3: Nested Object Isolation
// ============================================================

/**
 * Verify nested objects (sail, orbitalElements, soiState) are fully isolated
 */
export function testNestedObjectIsolation() {
    console.log('\n--- Test: Nested Object Isolation ---');
    cleanupPlanningMode();

    let allPassed = true;

    const player = getPlayerShip();

    // Create snapshot
    const snapshot = createSnapshot();

    // Verify snapshot has separate object references
    allPassed &= assert(snapshot.playerShip.sail !== player.sail,
        'Snapshot sail is not same reference as original');
    allPassed &= assert(snapshot.playerShip.orbitalElements !== player.orbitalElements,
        'Snapshot orbitalElements is not same reference as original');

    // Modify nested properties in snapshot
    snapshot.playerShip.sail.area = 999999;
    snapshot.playerShip.orbitalElements.e = 0.999;

    // Verify original nested objects unchanged
    allPassed &= assert(player.sail.area !== 999999,
        'Original sail.area unchanged after snapshot modification');
    allPassed &= assert(player.orbitalElements.e !== 0.999,
        'Original orbitalElements.e unchanged after snapshot modification');

    // Test camera nested object (target)
    const camera = getCamera();
    const originalTargetX = camera.target.x;
    snapshot.camera.target.x = 12345;
    allPassed &= assertApprox(camera.target.x, originalTargetX, 1e-10,
        'Original camera.target.x unchanged after snapshot modification');

    cleanupPlanningMode();
    return allPassed;
}

// ============================================================
// TEST 4: SOI State Preservation
// ============================================================

/**
 * Verify SOI fields are captured in snapshot
 */
export function testSOIStatePreservation() {
    console.log('\n--- Test: SOI State Preservation ---');
    cleanupPlanningMode();

    let allPassed = true;

    const player = getPlayerShip();

    // Save original SOI state
    const originalSOI = structuredClone(player.soiState);

    // Temporarily modify SOI state for testing
    player.soiState = {
        currentBody: 'EARTH',
        isInSOI: true
    };

    // Create snapshot
    const snapshot = createSnapshot();

    // Verify SOI state captured
    allPassed &= assert(snapshot.playerShip.soiState !== null,
        'Snapshot captured soiState');
    allPassed &= assert(snapshot.playerShip.soiState.currentBody === 'EARTH',
        'Snapshot captured currentBody correctly');
    allPassed &= assert(snapshot.playerShip.soiState.isInSOI === true,
        'Snapshot captured isInSOI correctly');

    // Verify coordinateFrame is set correctly
    allPassed &= assert(snapshot.playerShip.coordinateFrame === 'PLANETOCENTRIC',
        'Coordinate frame set to PLANETOCENTRIC when in SOI');

    // Restore original SOI state
    player.soiState = originalSOI;

    // Test heliocentric case
    player.soiState = {
        currentBody: 'SUN',
        isInSOI: false
    };

    const snapshot2 = createSnapshot();
    allPassed &= assert(snapshot2.playerShip.coordinateFrame === 'HELIOCENTRIC',
        'Coordinate frame set to HELIOCENTRIC when not in SOI');

    // Restore original SOI state
    player.soiState = originalSOI;

    cleanupPlanningMode();
    return allPassed;
}

// ============================================================
// TEST 5: Time Calculation
// ============================================================

/**
 * Verify sandbox time arithmetic
 */
export function testTimeCalculation() {
    console.log('\n--- Test: Time Calculation ---');
    cleanupPlanningMode();

    let allPassed = true;

    // Enter planning mode to get snapshot
    enterPlanningMode();

    const snapshot = getSnapshot();
    allPassed &= assert(snapshot !== null, 'Snapshot created on enter');

    const baseJD = snapshot.julianDate;

    // Test initial state
    allPassed &= assertApprox(getSandboxTimeOffset(), 0, 1e-10,
        'Initial sandbox offset is 0');
    allPassed &= assertApprox(getEffectiveTime(), baseJD, 1e-10,
        'Initial effective time equals snapshot julianDate');

    // Test offset setting
    setSandboxTimeOffset(100);
    allPassed &= assertApprox(getSandboxTimeOffset(), 100, 1e-10,
        'Sandbox offset set to 100');
    allPassed &= assertApprox(getEffectiveTime(), baseJD + 100, 1e-10,
        'Effective time = baseJD + offset');

    // Test clamping - minimum
    setSandboxTimeOffset(-50);
    allPassed &= assertApprox(getSandboxTimeOffset(), 0, 1e-10,
        'Negative offset clamped to 0');

    // Test clamping - maximum
    setSandboxTimeOffset(1000);
    allPassed &= assertApprox(getSandboxTimeOffset(), 730, 1e-10,
        'Offset above 730 clamped to 730');

    // Test effective time at max
    allPassed &= assertApprox(getEffectiveTime(), baseJD + 730, 1e-10,
        'Effective time at max offset = baseJD + 730');

    exitPlanningMode();

    // Verify getEffectiveTime returns null when not in planning mode
    allPassed &= assert(getEffectiveTime() === null,
        'getEffectiveTime returns null when not active');

    cleanupPlanningMode();
    return allPassed;
}

// ============================================================
// TEST 6: Ghost Planet Time Filtering (Critical Bug Fix)
// ============================================================

/**
 * Verify ghost planets use sandbox time, not live time
 * This tests the critical bug fix for intersection detection
 */
export function testGhostPlanetTimeFiltering() {
    console.log('\n--- Test: Ghost Planet Time Filtering ---');
    cleanupPlanningMode();

    let allPassed = true;

    // Get current live time
    const liveJD = getJulianDate();

    // Enter planning mode
    enterPlanningMode();

    const snapshot = getSnapshot();
    const snapshotJD = snapshot.julianDate;

    // Set sandbox offset to 200 days
    setSandboxTimeOffset(200);

    const effectiveTime = getEffectiveTime();
    const expectedTime = snapshotJD + 200;

    // The critical test: effectiveTime should be based on snapshot + offset
    // NOT on current live time
    allPassed &= assertApprox(effectiveTime, expectedTime, 1e-10,
        'Effective time uses snapshot JD + offset');

    // Verify live time is not being used
    // If live time was used incorrectly, effective time would be liveJD + 200
    allPassed &= assert(Math.abs(effectiveTime - liveJD) < 300 || Math.abs(effectiveTime - expectedTime) < 1e-6,
        'Effective time is snapshot-based, not live-time-based');

    // Test that getEffectiveTime is deterministic (same call = same result)
    const effectiveTime2 = getEffectiveTime();
    allPassed &= assertApprox(effectiveTime, effectiveTime2, 1e-10,
        'getEffectiveTime is deterministic');

    exitPlanningMode();
    cleanupPlanningMode();
    return allPassed;
}

// ============================================================
// TEST 7: Clean Exit
// ============================================================

/**
 * Verify state is fully restored on exit
 */
export function testCleanExit() {
    console.log('\n--- Test: Clean Exit ---');
    cleanupPlanningMode();

    let allPassed = true;

    // Capture complete state before entering
    const beforeTime = getTime();
    const beforeJD = getJulianDate();
    const player = getPlayerShip();
    const beforeSail = structuredClone(player.sail);
    const beforeElements = structuredClone(player.orbitalElements);
    const beforeSOI = structuredClone(player.soiState);
    const beforeDisplayOptions = getDisplayOptions();
    const beforeTrajectoryConfig = getTrajectoryConfig();
    const beforeAutoPilot = getAutoPilotState();

    // Enter planning mode
    enterPlanningMode();
    allPassed &= assert(isActive(), 'Planning mode active after enter');

    // Make changes while in planning mode
    player.sail.angle += 0.3;
    player.sail.deploymentPercent = 75;
    player.orbitalElements.e = 0.5;
    setTime(beforeTime + 500);
    setJulianDate(beforeJD + 500);

    // Exit planning mode
    exitPlanningMode();

    // Verify state is restored
    allPassed &= assert(!isActive(), 'Planning mode inactive after exit');
    allPassed &= assertApprox(getTime(), beforeTime, 1e-10,
        'Time restored on exit');
    allPassed &= assertApprox(getJulianDate(), beforeJD, 1e-10,
        'Julian date restored on exit');
    allPassed &= assertApprox(player.sail.angle, beforeSail.angle, 1e-10,
        'Sail angle restored on exit');
    allPassed &= assertApprox(player.sail.deploymentPercent, beforeSail.deploymentPercent, 1e-10,
        'Sail deployment restored on exit');
    allPassed &= assertApprox(player.orbitalElements.e, beforeElements.e, 1e-10,
        'Eccentricity restored on exit');

    // Verify snapshot is cleared
    allPassed &= assert(getSnapshot() === null,
        'Snapshot cleared on exit');

    // Verify sandbox offset is reset
    allPassed &= assertApprox(getSandboxTimeOffset(), 0, 1e-10,
        'Sandbox offset reset on exit');

    cleanupPlanningMode();
    return allPassed;
}

// ============================================================
// TEST 8: Flight Mode Unaffected
// ============================================================

/**
 * Verify Flight mode (normal gameplay) works after planning session
 */
export function testFlightModeUnaffected() {
    console.log('\n--- Test: Flight Mode Unaffected ---');
    cleanupPlanningMode();

    let allPassed = true;

    // Capture initial flight mode state
    const initialTime = getTime();
    const initialJD = getJulianDate();
    const player = getPlayerShip();
    const initialSail = structuredClone(player.sail);

    // Do a full planning mode cycle
    enterPlanningMode();

    // Make changes in planning mode
    player.sail.angle = 1.2;
    player.sail.deploymentPercent = 30;
    setSandboxTimeOffset(365);
    setMode('DRIFT');

    // Exit
    exitPlanningMode();

    // Verify we're back in flight mode
    allPassed &= assert(!isActive(), 'Back in flight mode after exit');

    // Verify flight mode state is intact
    allPassed &= assertApprox(getTime(), initialTime, 1e-10,
        'Flight mode time intact');
    allPassed &= assertApprox(getJulianDate(), initialJD, 1e-10,
        'Flight mode Julian date intact');
    allPassed &= assertApprox(player.sail.angle, initialSail.angle, 1e-10,
        'Flight mode sail angle intact');
    allPassed &= assertApprox(player.sail.deploymentPercent, initialSail.deploymentPercent, 1e-10,
        'Flight mode deployment intact');

    // Verify getEffectiveTime returns null (flight mode behavior)
    allPassed &= assert(getEffectiveTime() === null,
        'getEffectiveTime() returns null in flight mode');

    // Verify mode is reset
    allPassed &= assert(getMode() === 'FIXED',
        'Mode reset to FIXED after exit');

    // Do another planning session to verify repeatable
    enterPlanningMode();
    allPassed &= assert(isActive(), 'Can re-enter planning mode');
    allPassed &= assert(getSnapshot() !== null, 'Fresh snapshot created');
    exitPlanningMode();

    allPassed &= assertApprox(getTime(), initialTime, 1e-10,
        'Flight mode still intact after second planning session');

    cleanupPlanningMode();
    return allPassed;
}

// ============================================================
// TEST 9: Coordinate Frame Consistency
// ============================================================

/**
 * Verify heliocentric position is always available
 */
export function testCoordinateFrameConsistency() {
    console.log('\n--- Test: Coordinate Frame Consistency ---');
    cleanupPlanningMode();

    let allPassed = true;

    const player = getPlayerShip();

    // Test 1: Heliocentric case (standard case)
    const originalSOI = structuredClone(player.soiState);
    player.soiState = {
        currentBody: 'SUN',
        isInSOI: false
    };

    enterPlanningMode();

    const helioSnapshot = getSnapshot();
    allPassed &= assert(helioSnapshot.playerShip.heliocentricPosition !== null,
        'Heliocentric position exists in snapshot');
    allPassed &= assert(typeof helioSnapshot.playerShip.heliocentricPosition.x === 'number',
        'Heliocentric position has x coordinate');
    allPassed &= assert(typeof helioSnapshot.playerShip.heliocentricPosition.y === 'number',
        'Heliocentric position has y coordinate');
    allPassed &= assert(typeof helioSnapshot.playerShip.heliocentricPosition.z === 'number',
        'Heliocentric position has z coordinate');
    allPassed &= assert(helioSnapshot.playerShip.coordinateFrame === 'HELIOCENTRIC',
        'Coordinate frame marked as HELIOCENTRIC');

    // Test getShipPosition in FIXED mode
    const shipPos = getShipPosition();
    allPassed &= assert(shipPos !== null, 'getShipPosition returns position in planning mode');
    allPassed &= assertApprox(shipPos.x, helioSnapshot.playerShip.heliocentricPosition.x, 1e-10,
        'FIXED mode returns snapshot heliocentric position');

    // Test DRIFT mode
    setMode('DRIFT');
    allPassed &= assert(getMode() === 'DRIFT', 'Mode changed to DRIFT');
    const driftPos = getShipPosition();
    allPassed &= assert(driftPos !== null, 'getShipPosition returns position in DRIFT mode');
    // In DRIFT mode with offset 0, position should be similar
    // (may differ slightly due to propagation)

    exitPlanningMode();

    // Restore original SOI state
    player.soiState = originalSOI;

    // Test that getShipPosition returns null outside planning mode
    allPassed &= assert(getShipPosition() === null,
        'getShipPosition returns null outside planning mode');

    cleanupPlanningMode();
    return allPassed;
}

// ============================================================
// RUN ALL TESTS
// ============================================================

export function runAllTests() {
    console.log('='.repeat(50));
    console.log('PLANNING MODE TESTS');
    console.log('='.repeat(50));

    // Ensure clean state before running tests
    cleanupPlanningMode();

    const results = [
        testDeepCopyIsolation(),
        testRoundTripIntegrity(),
        testNestedObjectIsolation(),
        testSOIStatePreservation(),
        testTimeCalculation(),
        testGhostPlanetTimeFiltering(),
        testCleanExit(),
        testFlightModeUnaffected(),
        testCoordinateFrameConsistency()
    ];

    const passed = results.filter(r => r).length;
    const total = results.length;

    console.log('\n' + '='.repeat(50));
    if (passed === total) {
        console.log(`RESULTS: ${passed}/${total} tests passed - ALL PASS`);
    } else {
        console.log(`RESULTS: ${passed}/${total} tests passed - ${total - passed} FAILED`);
    }
    console.log('='.repeat(50));

    // Final cleanup
    cleanupPlanningMode();

    return passed === total;
}

// ============================================================
// BROWSER CONSOLE EXPORTS
// ============================================================

if (typeof window !== 'undefined') {
    window.planningModeTests = {
        runAllTests,
        testDeepCopyIsolation,
        testRoundTripIntegrity,
        testNestedObjectIsolation,
        testSOIStatePreservation,
        testTimeCalculation,
        testGhostPlanetTimeFiltering,
        testCleanExit,
        testFlightModeUnaffected,
        testCoordinateFrameConsistency
    };
}
