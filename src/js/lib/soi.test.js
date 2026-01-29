/**
 * Unit tests for soi.js
 *
 * Run in browser console:
 * import('/js/lib/soi.test.js').then(m => m.runAllTests())
 */

import {
    getSOIRadius,
    getGravitationalParam,
    checkSOIEntry,
    checkSOIExit,
    helioToPlanetocentric,
    planetocentricToHelio,
    stateToElements
} from './soi.js';
import { MU_SUN } from './orbital.js';

console.log('[SOI_TEST] Module loaded');

// ============================================================================
// Test Helpers
// ============================================================================

function assertApprox(actual, expected, tolerance, message) {
    const diff = Math.abs(actual - expected);
    if (diff > tolerance) {
        throw new Error(`${message}: expected ${expected}, got ${actual}, diff ${diff}`);
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
}

// ============================================================================
// SOI Radius and Gravitational Parameter Tests
// ============================================================================

function testGetSOIRadius() {
    const earthSOI = getSOIRadius('EARTH');
    assert(earthSOI === 0.1, 'Earth SOI should be 0.1 AU');

    const jupiterSOI = getSOIRadius('JUPITER');
    assert(jupiterSOI === 0.4, 'Jupiter SOI should be 0.4 AU');

    const unknownSOI = getSOIRadius('PLUTO');
    assert(unknownSOI === 0, 'Unknown body should return 0');

    console.log('✓ getSOIRadius() returns correct values');
}

function testGetGravitationalParam() {
    const sunMu = getGravitationalParam('SUN');
    assertApprox(sunMu, MU_SUN, 1e-15, 'Sun μ');

    const earthMu = getGravitationalParam('EARTH');
    assertApprox(earthMu, 8.887692445e-10, 1e-15, 'Earth μ');

    console.log('✓ getGravitationalParam() returns correct values');
}

// ============================================================================
// SOI Entry/Exit Tests
// ============================================================================

function testCheckSOIEntry() {
    // Mock bodies for testing
    const bodies = [
        { name: 'EARTH', x: 1.0, y: 0, z: 0 },
        { name: 'VENUS', x: 0.7, y: 0, z: 0 }
    ];

    // Ship inside Earth's SOI (0.1 AU radius)
    const shipInEarthSOI = { x: 1.05, y: 0, z: 0 }; // 0.05 AU from Earth
    const result1 = checkSOIEntry(shipInEarthSOI, bodies);
    assert(result1 !== null, 'Should detect Earth SOI entry');
    assert(result1.body === 'EARTH', 'Should return Earth');

    // Ship outside all SOIs
    const shipOutside = { x: 0.5, y: 0, z: 0 };
    const result2 = checkSOIEntry(shipOutside, bodies);
    assert(result2 === null, 'Should not detect SOI entry');

    console.log('✓ checkSOIEntry() detects SOI correctly');
}

function testCheckSOIExit() {
    // Ship inside SOI radius
    const posInside = { x: 0.05, y: 0, z: 0 }; // 0.05 AU from center
    const exit1 = checkSOIExit(posInside, 'EARTH'); // SOI radius = 0.1
    assert(exit1 === false, 'Should not exit when inside SOI');

    // Ship outside SOI radius (with hysteresis)
    const posOutside = { x: 0.11, y: 0, z: 0 }; // 0.11 AU from center (> 0.1 × 1.01)
    const exit2 = checkSOIExit(posOutside, 'EARTH');
    assert(exit2 === true, 'Should exit when outside SOI × 1.01');

    console.log('✓ checkSOIExit() detects exit correctly');
}

function testMultiSOIResolution() {
    // Test case where ship is in overlapping SOIs
    // Ship at (0.75, 0, 0) - equidistant from Earth (1.0, 0, 0) and Venus (0.7, 0, 0)?
    // Actually, let's make ship very close to Earth so Earth's gravity dominates
    const bodies = [
        { name: 'EARTH', x: 1.0, y: 0, z: 0 },
        { name: 'VENUS', x: 0.9, y: 0, z: 0 } // Overlapping SOIs (both 0.1 AU radius)
    ];

    const shipPos = { x: 0.95, y: 0, z: 0 }; // 0.05 from Earth, 0.05 from Venus
    const result = checkSOIEntry(shipPos, bodies);

    // Both have same μ roughly? No, Earth has larger μ
    // At equal distance, Earth (μ = 8.89e-10) beats Venus (μ = 7.24e-10)
    assert(result !== null, 'Should detect SOI entry');
    assert(result.body === 'EARTH', 'Should choose Earth (larger μ/r²)');

    console.log('✓ Multi-SOI resolution chooses dominant body');
}

// ============================================================================
// Frame Conversion Tests
// ============================================================================

function testHelioToPlanetocentric() {
    // Ship and planet at known positions
    const shipPos = { x: 1.5, y: 0.5, z: 0 };
    const shipVel = { vx: 0.01, vy: 0.02, vz: 0 };
    const planetPos = { x: 1.0, y: 0, z: 0 };
    const planetVel = { vx: 0.015, vy: 0.01, vz: 0 };

    const result = helioToPlanetocentric(shipPos, shipVel, planetPos, planetVel);

    // Expected: relative position = ship - planet
    assertApprox(result.pos.x, 0.5, 1e-10, 'Relative x position');
    assertApprox(result.pos.y, 0.5, 1e-10, 'Relative y position');
    assertApprox(result.pos.z, 0, 1e-10, 'Relative z position');

    // Expected: relative velocity = ship - planet
    assertApprox(result.vel.vx, -0.005, 1e-10, 'Relative x velocity');
    assertApprox(result.vel.vy, 0.01, 1e-10, 'Relative y velocity');

    console.log('✓ helioToPlanetocentric() converts frame correctly');
}

function testPlanetocentricToHelio() {
    // Reverse conversion
    const shipPos = { x: 0.5, y: 0.5, z: 0 };
    const shipVel = { vx: -0.005, vy: 0.01, vz: 0 };
    const planetPos = { x: 1.0, y: 0, z: 0 };
    const planetVel = { vx: 0.015, vy: 0.01, vz: 0 };

    const result = planetocentricToHelio(shipPos, shipVel, planetPos, planetVel);

    // Expected: absolute position = relative + planet
    assertApprox(result.pos.x, 1.5, 1e-10, 'Absolute x position');
    assertApprox(result.pos.y, 0.5, 1e-10, 'Absolute y position');

    // Expected: absolute velocity = relative + planet
    assertApprox(result.vel.vx, 0.01, 1e-10, 'Absolute x velocity');
    assertApprox(result.vel.vy, 0.02, 1e-10, 'Absolute y velocity');

    console.log('✓ planetocentricToHelio() converts frame correctly');
}

function testFrameConversionRoundTrip() {
    // Start with heliocentric state
    const shipPosHelio = { x: 1.5, y: 0.5, z: 0.1 };
    const shipVelHelio = { vx: 0.01, vy: 0.02, vz: 0.005 };
    const planetPos = { x: 1.0, y: 0, z: 0 };
    const planetVel = { vx: 0.015, vy: 0.01, vz: 0 };

    // Convert to planetocentric
    const planetocentric = helioToPlanetocentric(shipPosHelio, shipVelHelio, planetPos, planetVel);

    // Convert back to heliocentric
    const helioAgain = planetocentricToHelio(planetocentric.pos, planetocentric.vel, planetPos, planetVel);

    // Should get original values back
    assertApprox(helioAgain.pos.x, shipPosHelio.x, 1e-10, 'Round-trip x position');
    assertApprox(helioAgain.pos.y, shipPosHelio.y, 1e-10, 'Round-trip y position');
    assertApprox(helioAgain.pos.z, shipPosHelio.z, 1e-10, 'Round-trip z position');
    assertApprox(helioAgain.vel.vx, shipVelHelio.vx, 1e-10, 'Round-trip x velocity');
    assertApprox(helioAgain.vel.vy, shipVelHelio.vy, 1e-10, 'Round-trip y velocity');
    assertApprox(helioAgain.vel.vz, shipVelHelio.vz, 1e-10, 'Round-trip z velocity');

    console.log('✓ Frame conversion round-trip preserves state');
}

// ============================================================================
// State Vector to Orbital Elements Tests
// ============================================================================

function testStateToElementsElliptic() {
    // Circular orbit at 1 AU
    const pos = { x: 1.0, y: 0, z: 0 };
    const v_circular = Math.sqrt(MU_SUN / 1.0); // Circular orbit velocity
    const vel = { vx: 0, vy: v_circular, vz: 0 };

    const elements = stateToElements(pos, vel, MU_SUN, 2451545.0);

    assertApprox(elements.a, 1.0, 1e-6, 'Semi-major axis should be 1 AU');
    assertApprox(elements.e, 0.0, 1e-6, 'Eccentricity should be 0 (circular)');
    assert(elements.μ === MU_SUN, 'μ should be preserved');

    console.log('✓ stateToElements() handles circular orbit');
}

function testStateToElementsHyperbolic() {
    // Hyperbolic escape trajectory
    const pos = { x: 0.01, y: 0, z: 0 }; // Close to Earth
    const mu_earth = 8.887692445e-10;
    const v_escape = Math.sqrt(2 * mu_earth / 0.01);
    const v_hyperbolic = v_escape * 1.5; // 50% above escape velocity
    const vel = { vx: 0, vy: v_hyperbolic, vz: 0 };

    const elements = stateToElements(pos, vel, mu_earth, 2451545.0);

    assert(elements.e >= 1.0, 'Eccentricity should be >= 1 for hyperbolic');
    assert(elements.a < 0, 'Semi-major axis should be negative for hyperbolic');

    console.log(`✓ stateToElements() handles hyperbolic orbit (e=${elements.e.toFixed(2)})`);
}

function testStateToElementsPreservesVelocityMagnitude() {
    // Arbitrary elliptic orbit
    const pos = { x: 0.8, y: 0.6, z: 0 };
    const vel = { vx: 0.02, vy: -0.015, vz: 0.01 };

    const elements = stateToElements(pos, vel, MU_SUN, 2451545.0);

    // Compute velocity magnitude from elements (using vis-viva)
    const r = Math.sqrt(pos.x**2 + pos.y**2 + pos.z**2);
    const v_expected = Math.sqrt(MU_SUN * (2/r - 1/elements.a));
    const v_actual = Math.sqrt(vel.vx**2 + vel.vy**2 + vel.vz**2);

    assertApprox(v_actual, v_expected, 1e-6, 'Velocity magnitude via vis-viva');

    console.log('✓ stateToElements() velocity matches vis-viva equation');
}

// ============================================================================
// Test Runner
// ============================================================================

export function runAllTests() {
    console.log('\n========== SOI TESTS ==========\n');

    try {
        // SOI radius and gravitational parameter
        console.log('--- SOI Configuration ---');
        testGetSOIRadius();
        testGetGravitationalParam();

        // SOI entry/exit detection
        console.log('\n--- SOI Detection ---');
        testCheckSOIEntry();
        testCheckSOIExit();
        testMultiSOIResolution();

        // Frame conversions
        console.log('\n--- Frame Conversions ---');
        testHelioToPlanetocentric();
        testPlanetocentricToHelio();
        testFrameConversionRoundTrip();

        // State vector to orbital elements
        console.log('\n--- State to Elements ---');
        testStateToElementsElliptic();
        testStateToElementsHyperbolic();
        testStateToElementsPreservesVelocityMagnitude();

        console.log('\n========== ALL TESTS PASSED ==========\n');
        return true;

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error.message);
        console.error(error.stack);
        return false;
    }
}

// Auto-load message
if (typeof window !== 'undefined' && !window.__SOI_TEST_LOADED) {
    window.__SOI_TEST_LOADED = true;
    console.log('SOI test module loaded. Run: runAllTests()');
}
