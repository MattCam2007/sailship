/**
 * Console-based tests for ephemeris.js (astronomy-engine wrapper)
 *
 * Run in browser console after loading the game:
 *   import('/js/lib/ephemeris.test.js').then(m => m.runAllTests())
 */

import { getHeliocentricPosition, isEphemerisAvailable } from './ephemeris.js';

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
 * Test: astronomy-engine library is loaded
 */
export function testLibraryLoaded() {
    console.log('\n--- Test: astronomy-engine library loaded ---');
    let passed = true;

    passed &= assert(isEphemerisAvailable(), 'astronomy-engine should be available');
    passed &= assert(typeof Astronomy !== 'undefined', 'Astronomy global should exist');

    return passed;
}

/**
 * Test: Sun position is always at origin
 */
export function testSunAtOrigin() {
    console.log('\n--- Test: Sun at origin ---');
    let passed = true;

    const date = new Date('2020-01-01T00:00:00Z');
    const sun = getHeliocentricPosition('SOL', date);

    passed &= assert(sun !== null, 'Should return position for Sun');
    passed &= assertApprox(sun.x, 0, 1e-10, 'Sun x should be 0');
    passed &= assertApprox(sun.y, 0, 1e-10, 'Sun y should be 0');
    passed &= assertApprox(sun.z, 0, 1e-10, 'Sun z should be 0');

    return passed;
}

/**
 * Test: Mars position on J2000 epoch
 * Known position from JPL Horizons for 2000-01-01 12:00:00 TT
 */
export function testMarsJ2000() {
    console.log('\n--- Test: Mars position at J2000 epoch ---');
    let passed = true;

    // J2000 = 2000-01-01 12:00:00 TT ≈ 2000-01-01 11:58:56 UTC
    const date = new Date('2000-01-01T12:00:00Z');
    const mars = getHeliocentricPosition('MARS', date);

    passed &= assert(mars !== null, 'Should return position for Mars');
    passed &= assert(Math.abs(mars.x) < 2, 'Mars x should be reasonable (< 2 AU)');
    passed &= assert(Math.abs(mars.y) < 2, 'Mars y should be reasonable (< 2 AU)');
    passed &= assert(Math.abs(mars.z) < 0.5, 'Mars z should be reasonable (< 0.5 AU)');

    // Distance from Sun should be near Mars orbit (~1.5 AU)
    const r = Math.sqrt(mars.x * mars.x + mars.y * mars.y + mars.z * mars.z);
    passed &= assert(r > 1.3 && r < 1.7, `Mars distance should be ~1.5 AU (got ${r.toFixed(3)})`);

    return passed;
}

/**
 * Test: Earth position on specific date
 */
export function testEarthPosition() {
    console.log('\n--- Test: Earth position ---');
    let passed = true;

    const date = new Date('2020-06-21T00:00:00Z'); // Summer solstice
    const earth = getHeliocentricPosition('EARTH', date);

    passed &= assert(earth !== null, 'Should return position for Earth');

    // Earth distance should be ~1 AU
    const r = Math.sqrt(earth.x * earth.x + earth.y * earth.y + earth.z * earth.z);
    passed &= assertApprox(r, 1.0, 0.05, `Earth distance should be ~1 AU (got ${r.toFixed(3)})`);

    // Velocity magnitude should be ~Earth orbital velocity (~0.0172 AU/day)
    const v = Math.sqrt(earth.vx * earth.vx + earth.vy * earth.vy + earth.vz * earth.vz);
    passed &= assertApprox(v, 0.0172, 0.002, `Earth velocity should be ~0.0172 AU/day (got ${v.toFixed(4)})`);

    return passed;
}

/**
 * Test: All planets return valid positions
 */
export function testAllPlanets() {
    console.log('\n--- Test: All planets return valid positions ---');
    let passed = true;

    const date = new Date('2020-01-01T00:00:00Z');
    const planets = ['MERCURY', 'VENUS', 'EARTH', 'MARS', 'JUPITER', 'SATURN'];

    for (const planet of planets) {
        const pos = getHeliocentricPosition(planet, date);
        passed &= assert(pos !== null, `${planet} should return position`);
        passed &= assert(isFinite(pos.x), `${planet} x should be finite`);
        passed &= assert(isFinite(pos.y), `${planet} y should be finite`);
        passed &= assert(isFinite(pos.z), `${planet} z should be finite`);
        passed &= assert(isFinite(pos.vx), `${planet} vx should be finite`);
        passed &= assert(isFinite(pos.vy), `${planet} vy should be finite`);
        passed &= assert(isFinite(pos.vz), `${planet} vz should be finite`);
    }

    return passed;
}

/**
 * Test: Unknown body returns null
 */
export function testUnknownBody() {
    console.log('\n--- Test: Unknown body returns null ---');
    let passed = true;

    const date = new Date('2020-01-01T00:00:00Z');
    const result = getHeliocentricPosition('FAKE_PLANET', date);

    passed &= assert(result === null, 'Unknown planet should return null');

    return passed;
}

/**
 * Test: Caching improves performance
 */
export function testCaching() {
    console.log('\n--- Test: Position caching ---');
    let passed = true;

    const date = new Date('2020-01-01T00:00:00Z');

    // First call (cache miss)
    const start1 = performance.now();
    getHeliocentricPosition('MARS', date);
    const time1 = performance.now() - start1;

    // Second call (cache hit)
    const start2 = performance.now();
    getHeliocentricPosition('MARS', date);
    const time2 = performance.now() - start2;

    console.log(`  First call: ${time1.toFixed(2)}ms, Second call: ${time2.toFixed(2)}ms`);
    passed &= assert(time2 < time1, 'Cached call should be faster');

    return passed;
}

/**
 * Test: Date range validation (1900-2100)
 */
export function testDateRange() {
    console.log('\n--- Test: Date range (1900-2100) ---');
    let passed = true;

    // Test minimum date
    const minDate = new Date('1900-01-01T00:00:00Z');
    const posMin = getHeliocentricPosition('EARTH', minDate);
    passed &= assert(posMin !== null, 'Should work at minimum date (1900)');

    // Test maximum date
    const maxDate = new Date('2100-12-31T23:59:59Z');
    const posMax = getHeliocentricPosition('EARTH', maxDate);
    passed &= assert(posMax !== null, 'Should work at maximum date (2100)');

    return passed;
}

// ============================================================================
// Run All Tests
// ============================================================================

export function runAllTests() {
    console.log('========================================');
    console.log('  EPHEMERIS TESTS');
    console.log('========================================');

    const tests = [
        testLibraryLoaded,
        testSunAtOrigin,
        testMarsJ2000,
        testEarthPosition,
        testAllPlanets,
        testUnknownBody,
        testCaching,
        testDateRange
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
