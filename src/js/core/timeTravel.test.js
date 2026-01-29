/**
 * Console-based tests for time travel features in gameState.js
 *
 * Run in browser console after loading the game:
 *   import('/js/core/timeTravel.test.js').then(m => m.runAllTests())
 */

import {
    timeTravelState,
    TIME_SCALES,
    setTimeTravelEnabled,
    setReferenceDate,
    setTimeOffset,
    setTimeScale,
    getEphemerisDate,
    getEphemerisJulianDate,
    julianToDate,
    dateToJulian
} from './gameState.js';

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

// ============================================================================
// Tests
// ============================================================================

/**
 * Test: Date to Julian date conversion
 */
export function testDateToJulian() {
    console.log('\n--- Test: Date to Julian conversion ---');
    let passed = true;

    // J2000 epoch: 2000-01-01 12:00:00 UTC = JD 2451545.0
    const j2000Date = new Date('2000-01-01T12:00:00Z');
    const jd = dateToJulian(j2000Date);

    passed &= assertApprox(jd, 2451545.0, 0.01, 'J2000 should convert to JD 2451545.0');

    // Unix epoch: 1970-01-01 00:00:00 UTC = JD 2440587.5
    const unixEpoch = new Date('1970-01-01T00:00:00Z');
    const jdUnix = dateToJulian(unixEpoch);

    passed &= assertApprox(jdUnix, 2440587.5, 0.01, 'Unix epoch should convert to JD 2440587.5');

    return passed;
}

/**
 * Test: Julian date to Date conversion
 */
export function testJulianToDate() {
    console.log('\n--- Test: Julian to Date conversion ---');
    let passed = true;

    // JD 2451545.0 = 2000-01-01 12:00:00 UTC
    const date = julianToDate(2451545.0);
    const expected = new Date('2000-01-01T12:00:00Z');

    passed &= assertApprox(date.getTime(), expected.getTime(), 60000, 'JD 2451545.0 should convert to J2000');

    return passed;
}

/**
 * Test: Round-trip date conversion
 */
export function testDateConversionRoundTrip() {
    console.log('\n--- Test: Round-trip date conversion ---');
    let passed = true;

    const originalDate = new Date('2020-06-15T14:30:00Z');
    const jd = dateToJulian(originalDate);
    const convertedDate = julianToDate(jd);

    passed &= assertApprox(
        convertedDate.getTime(),
        originalDate.getTime(),
        1000, // 1 second tolerance
        'Date should survive round-trip conversion'
    );

    return passed;
}

/**
 * Test: Time travel state initialization
 */
export function testTimeTravelStateInit() {
    console.log('\n--- Test: Time travel state initialization ---');
    let passed = true;

    passed &= assert(timeTravelState.enabled === false, 'Should start disabled');
    passed &= assert(timeTravelState.scale === 'month', 'Default scale should be month');
    passed &= assert(timeTravelState.offsetDays === 0, 'Default offset should be 0');
    passed &= assert(timeTravelState.referenceDate instanceof Date, 'Reference date should be Date object');

    return passed;
}

/**
 * Test: Enable/disable time travel
 */
export function testEnableDisable() {
    console.log('\n--- Test: Enable/disable time travel ---');
    let passed = true;

    const originalState = timeTravelState.enabled;

    setTimeTravelEnabled(true);
    passed &= assert(timeTravelState.enabled === true, 'Should enable');

    setTimeTravelEnabled(false);
    passed &= assert(timeTravelState.enabled === false, 'Should disable');

    // Restore original state
    setTimeTravelEnabled(originalState);

    return passed;
}

/**
 * Test: Set reference date
 */
export function testSetReferenceDate() {
    console.log('\n--- Test: Set reference date ---');
    let passed = true;

    const testDate = new Date('2020-07-04T00:00:00Z');
    setReferenceDate(testDate);

    passed &= assert(
        timeTravelState.referenceDate.getTime() === testDate.getTime(),
        'Reference date should be set'
    );

    return passed;
}

/**
 * Test: Set time offset
 */
export function testSetTimeOffset() {
    console.log('\n--- Test: Set time offset ---');
    let passed = true;

    setTimeOffset(30); // +30 days
    passed &= assert(timeTravelState.offsetDays === 30, 'Offset should be 30 days');

    setTimeOffset(-15); // -15 days
    passed &= assert(timeTravelState.offsetDays === -15, 'Offset should be -15 days');

    setTimeOffset(0); // Reset
    passed &= assert(timeTravelState.offsetDays === 0, 'Offset should reset to 0');

    return passed;
}

/**
 * Test: Set time scale
 */
export function testSetTimeScale() {
    console.log('\n--- Test: Set time scale ---');
    let passed = true;

    setTimeScale('year');
    passed &= assert(timeTravelState.scale === 'year', 'Scale should be year');

    setTimeScale('day');
    passed &= assert(timeTravelState.scale === 'day', 'Scale should be day');

    setTimeScale('month'); // Reset to default
    passed &= assert(timeTravelState.scale === 'month', 'Scale should reset to month');

    return passed;
}

/**
 * Test: Get ephemeris date (reference + offset)
 */
export function testGetEphemerisDate() {
    console.log('\n--- Test: Get ephemeris date ---');
    let passed = true;

    const refDate = new Date('2020-01-01T00:00:00Z');
    setReferenceDate(refDate);
    setTimeOffset(30); // +30 days

    const ephDate = getEphemerisDate();
    const expected = new Date('2020-01-31T00:00:00Z');

    passed &= assertApprox(
        ephDate.getTime(),
        expected.getTime(),
        1000,
        'Ephemeris date should be reference + 30 days'
    );

    // Reset
    setTimeOffset(0);

    return passed;
}

/**
 * Test: Get ephemeris Julian date
 */
export function testGetEphemerisJulianDate() {
    console.log('\n--- Test: Get ephemeris Julian date ---');
    let passed = true;

    const refDate = new Date('2000-01-01T12:00:00Z'); // J2000
    setReferenceDate(refDate);
    setTimeOffset(0);

    const jd = getEphemerisJulianDate();

    passed &= assertApprox(jd, 2451545.0, 0.01, 'Should convert to Julian date correctly');

    return passed;
}

/**
 * Test: Negative time offset
 */
export function testNegativeOffset() {
    console.log('\n--- Test: Negative time offset ---');
    let passed = true;

    const refDate = new Date('2020-02-15T00:00:00Z');
    setReferenceDate(refDate);
    setTimeOffset(-15); // -15 days

    const ephDate = getEphemerisDate();
    const expected = new Date('2020-01-31T00:00:00Z');

    passed &= assertApprox(
        ephDate.getTime(),
        expected.getTime(),
        1000,
        'Ephemeris date should be reference - 15 days'
    );

    // Reset
    setTimeOffset(0);

    return passed;
}

/**
 * Test: Large time offset
 */
export function testLargeOffset() {
    console.log('\n--- Test: Large time offset (1 year) ---');
    let passed = true;

    const refDate = new Date('2020-01-01T00:00:00Z');
    setReferenceDate(refDate);
    setTimeOffset(365); // +1 year

    const ephDate = getEphemerisDate();
    const expected = new Date('2021-01-01T00:00:00Z');

    passed &= assertApprox(
        ephDate.getTime(),
        expected.getTime(),
        86400000, // 1 day tolerance (leap year)
        'Ephemeris date should be ~1 year ahead'
    );

    // Reset
    setTimeOffset(0);

    return passed;
}

/**
 * Test: Time scale values
 */
export function testTimeScaleValues() {
    console.log('\n--- Test: Time scale values ---');
    let passed = true;

    passed &= assertApprox(TIME_SCALES.hour, 1/24, 0.001, 'Hour scale should be 1/24 day');
    passed &= assertApprox(TIME_SCALES.day, 1, 0.001, 'Day scale should be 1 day');
    passed &= assertApprox(TIME_SCALES.week, 7, 0.001, 'Week scale should be 7 days');
    passed &= assertApprox(TIME_SCALES.month, 30, 0.001, 'Month scale should be 30 days');
    passed &= assertApprox(TIME_SCALES.year, 365, 0.001, 'Year scale should be 365 days');

    return passed;
}

/**
 * Test: Date range clamping (1900-2100)
 */
export function testDateRangeClamping() {
    console.log('\n--- Test: Date range clamping ---');
    let passed = true;

    // Try to set date before 1900
    const tooEarly = new Date('1800-01-01T00:00:00Z');
    setReferenceDate(tooEarly);
    const clampedEarly = timeTravelState.referenceDate;
    passed &= assert(
        clampedEarly.getFullYear() >= 1900,
        'Date before 1900 should be clamped to 1900'
    );

    // Try to set date after 2100
    const tooLate = new Date('2200-01-01T00:00:00Z');
    setReferenceDate(tooLate);
    const clampedLate = timeTravelState.referenceDate;
    passed &= assert(
        clampedLate.getFullYear() <= 2100,
        'Date after 2100 should be clamped to 2100'
    );

    // Reset to valid date
    setReferenceDate(new Date());

    return passed;
}

// ============================================================================
// Run All Tests
// ============================================================================

export function runAllTests() {
    console.log('========================================');
    console.log('  TIME TRAVEL STATE TESTS');
    console.log('========================================');

    const tests = [
        testDateToJulian,
        testJulianToDate,
        testDateConversionRoundTrip,
        testTimeTravelStateInit,
        testEnableDisable,
        testSetReferenceDate,
        testSetTimeOffset,
        testSetTimeScale,
        testGetEphemerisDate,
        testGetEphemerisJulianDate,
        testNegativeOffset,
        testLargeOffset,
        testTimeScaleValues,
        testDateRangeClamping
    ];

    let totalPassed = 0;
    let totalTests = tests.length;

    for (const test of tests) {
        if (test()) {
            totalPassed++;
        }
    }

    console.log('\n========================================');
    console.log(`  RESULTS: ${totalPassed}/${totalTests} tests passed`);
    console.log('========================================');

    return totalPassed === totalTests;
}
