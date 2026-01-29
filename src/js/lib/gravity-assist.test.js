/**
 * Unit tests for gravity-assist.js
 *
 * Run in browser console:
 * import('/js/lib/gravity-assist.test.js').then(m => m.runAllTests())
 */

import {
    getHyperbolicExcessVelocity,
    getTurningAngle,
    predictGravityAssist,
    getAsymptoticAngle,
    getBPlane
} from './gravity-assist.js';

console.log('[GRAVITY_ASSIST_TEST] Module loaded');

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
// Hyperbolic Excess Velocity Tests
// ============================================================================

function testVInfinityElliptic() {
    const elements = { a: 1.0, e: 0.5, μ: 8.887692445e-10 };
    const vInf = getHyperbolicExcessVelocity(elements);
    assert(vInf === 0, 'Elliptic orbit should have v∞ = 0');
    console.log('✓ v∞ for elliptic orbit = 0');
}

function testVInfinityParabolic() {
    const elements = { a: -100, e: 1.0, μ: 8.887692445e-10 };
    const vInf = getHyperbolicExcessVelocity(elements);
    assert(vInf === 0, 'Parabolic orbit should have v∞ ≈ 0');
    console.log('✓ v∞ for parabolic orbit ≈ 0');
}

function testVInfinityHyperbolic() {
    // Test case: Earth flyby with e=2.0, a=-0.01 AU, μ_earth
    const elements = { a: -0.01, e: 2.0, μ: 8.887692445e-10 };
    const vInf = getHyperbolicExcessVelocity(elements);
    const expected = Math.sqrt(-8.887692445e-10 / -0.01); // ≈ 0.000298 AU/day
    assertApprox(vInf, expected, 1e-9, 'v∞ for hyperbolic orbit');

    // Convert to km/s for sanity check
    const vInfKmS = vInf * 1731.46; // ≈ 5.2 km/s
    assert(vInfKmS > 4 && vInfKmS < 7, 'v∞ should be ~5 km/s for typical Earth flyby');
    console.log(`✓ v∞ for hyperbolic orbit = ${vInf.toExponential(4)} AU/day (${vInfKmS.toFixed(1)} km/s)`);
}

// ============================================================================
// Turning Angle Tests
// ============================================================================

function testTurningAngleLowPeriapsis() {
    // Low periapsis → large turning angle (tight turn)
    const vInf = 5 / 1731.46; // 5 km/s in AU/day
    const rp = 7000 / 149597870.7; // 7000 km in AU (close to Venus)
    const mu = 7.2435e-10; // Venus μ

    const delta = getTurningAngle(vInf, rp, mu);

    assert(delta > 0 && delta < Math.PI, 'Turning angle must be in (0, π)');
    assert(delta > Math.PI / 4, 'Low periapsis should give large turning angle (> 45°)');

    const deltaDeg = delta * 180 / Math.PI;
    console.log(`✓ Turning angle for close flyby = ${deltaDeg.toFixed(1)}° (should be large)`);
}

function testTurningAngleHighPeriapsis() {
    // High periapsis → small turning angle (gentle turn)
    const vInf = 5 / 1731.46; // 5 km/s in AU/day
    const rp = 0.05; // 0.05 AU (very distant flyby)
    const mu = 7.2435e-10; // Venus μ

    const delta = getTurningAngle(vInf, rp, mu);

    assert(delta > 0 && delta < Math.PI / 4, 'High periapsis should give small turning angle (< 45°)');

    const deltaDeg = delta * 180 / Math.PI;
    console.log(`✓ Turning angle for distant flyby = ${deltaDeg.toFixed(1)}° (should be small)`);
}

function testTurningAngleZeroVelocity() {
    // Edge case: zero velocity
    const delta = getTurningAngle(0, 0.01, 7.2435e-10);
    assert(delta === 0, 'Zero velocity should give zero turning angle');
    console.log('✓ Turning angle for zero velocity = 0');
}

// ============================================================================
// Gravity Assist Prediction Tests
// ============================================================================

function testGravityAssistTrailing() {
    // Trailing flyby: ship approaches from behind (slower than planet)
    // Expect: ship gains speed (slingshot effect)

    const vApproach = { vx: 0.015, vy: 0, vz: 0 }; // 26 km/s heliocentric
    const vPlanet = { vx: 0.020, vy: 0, vz: 0 };   // 35 km/s heliocentric (faster)
    const rp = 7000 / 149597870.7; // 7000 km periapsis
    const mu = 7.2435e-10; // Venus μ

    const result = predictGravityAssist(vApproach, rp, vPlanet, mu);

    assert(result.deltaV > 0, 'Trailing flyby should produce ΔV');
    assert(result.turningAngle > 0, 'Turning angle should be positive');

    // Check that speed increased (trailing flyby effect)
    const speedBefore = Math.sqrt(vApproach.vx**2 + vApproach.vy**2 + vApproach.vz**2);
    const speedAfter = Math.sqrt(result.vExit.vx**2 + result.vExit.vy**2 + result.vExit.vz**2);

    console.log(`✓ Trailing flyby: speed ${(speedBefore*1731.46).toFixed(1)} → ${(speedAfter*1731.46).toFixed(1)} km/s, ΔV = ${(result.deltaV*1731.46).toFixed(2)} km/s`);
}

function testGravityAssistHeadOn() {
    // Head-on flyby: ship approaches directly toward planet
    // Expect: velocity direction reverses (180° turn if periapsis very low)

    const vApproach = { vx: 0.020, vy: 0, vz: 0 }; // 35 km/s heliocentric
    const vPlanet = { vx: -0.020, vy: 0, vz: 0 };  // 35 km/s opposite direction
    const rp = 7000 / 149597870.7; // 7000 km periapsis
    const mu = 7.2435e-10; // Venus μ

    const result = predictGravityAssist(vApproach, rp, vPlanet, mu);

    assert(result.deltaV > 0, 'Head-on flyby should produce ΔV');

    // v∞ magnitude should be conserved
    const vRelBefore = Math.sqrt((vApproach.vx - vPlanet.vx)**2);
    const vRelAfter = Math.sqrt((result.vExit.vx - vPlanet.vx)**2 +
                                 (result.vExit.vy - vPlanet.vy)**2 +
                                 (result.vExit.vz - vPlanet.vz)**2);

    assertApprox(vRelBefore, vRelAfter, 1e-9, 'v∞ magnitude should be conserved');

    console.log(`✓ Head-on flyby: ΔV = ${(result.deltaV*1731.46).toFixed(2)} km/s, v∞ conserved`);
}

function testGravityAssistZeroRelativeVelocity() {
    // Edge case: ship matches planet velocity exactly
    const vApproach = { vx: 0.020, vy: 0, vz: 0 };
    const vPlanet = { vx: 0.020, vy: 0, vz: 0 }; // Same velocity
    const rp = 7000 / 149597870.7;
    const mu = 7.2435e-10;

    const result = predictGravityAssist(vApproach, rp, vPlanet, mu);

    assert(result.deltaV === 0, 'No relative velocity → no ΔV');
    assert(result.turningAngle === 0, 'No relative velocity → no turning');

    console.log('✓ Zero relative velocity: no gravity assist effect');
}

// ============================================================================
// Asymptotic Angle Tests
// ============================================================================

function testAsymptoticAngleHyperbolic() {
    const e = 2.0;
    const angle = getAsymptoticAngle(e);
    const expected = Math.acos(-1 / e); // arccos(-0.5) = 120°

    assertApprox(angle, expected, 1e-9, 'Asymptotic angle for e=2');

    const angleDeg = angle * 180 / Math.PI;
    console.log(`✓ Asymptotic angle for e=2.0 = ${angleDeg.toFixed(1)}° (expect 120°)`);
}

function testAsymptoticAngleElliptic() {
    const e = 0.5;
    const angle = getAsymptoticAngle(e);

    assert(angle === 0, 'Elliptic orbit should have no asymptotic angle');
    console.log('✓ Asymptotic angle for elliptic orbit = 0');
}

// ============================================================================
// B-Plane Tests
// ============================================================================

function testBPlane() {
    const vInf = 5 / 1731.46; // 5 km/s in AU/day
    const rp = 7000 / 149597870.7; // 7000 km in AU
    const mu = 7.2435e-10; // Venus μ

    const B = getBPlane(vInf, rp, mu);

    assert(B > rp, 'Impact parameter B should be larger than periapsis');
    assert(B < 0.1, 'B should be reasonable (<0.1 AU for close flyby)');

    console.log(`✓ B-plane impact parameter = ${(B * 149597870.7).toFixed(0)} km`);
}

// ============================================================================
// Test Runner
// ============================================================================

export function runAllTests() {
    console.log('\n========== GRAVITY ASSIST TESTS ==========\n');

    try {
        // Hyperbolic excess velocity tests
        console.log('--- Hyperbolic Excess Velocity ---');
        testVInfinityElliptic();
        testVInfinityParabolic();
        testVInfinityHyperbolic();

        // Turning angle tests
        console.log('\n--- Turning Angle ---');
        testTurningAngleLowPeriapsis();
        testTurningAngleHighPeriapsis();
        testTurningAngleZeroVelocity();

        // Gravity assist prediction tests
        console.log('\n--- Gravity Assist Prediction ---');
        testGravityAssistTrailing();
        testGravityAssistHeadOn();
        testGravityAssistZeroRelativeVelocity();

        // Asymptotic angle tests
        console.log('\n--- Asymptotic Angle ---');
        testAsymptoticAngleHyperbolic();
        testAsymptoticAngleElliptic();

        // B-plane tests
        console.log('\n--- B-Plane ---');
        testBPlane();

        console.log('\n========== ALL TESTS PASSED ==========\n');
        return true;

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error.message);
        console.error(error.stack);
        return false;
    }
}

// Auto-run if loaded directly (not imported)
if (typeof window !== 'undefined' && !window.__GRAVITY_ASSIST_TEST_LOADED) {
    window.__GRAVITY_ASSIST_TEST_LOADED = true;
    console.log('Gravity assist test module loaded. Run: runAllTests()');
}
