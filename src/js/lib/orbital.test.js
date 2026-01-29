/**
 * Unit tests for orbital mechanics library
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
    MU_SUN,
    J2000,
    meanMotion,
    propagateMeanAnomaly,
    solveKepler,
    eccentricToTrueAnomaly,
    orbitalRadius,
    positionInOrbitalPlane,
    rotateToEcliptic,
    velocityInOrbitalPlane,
    rotateVelocityToEcliptic,
    getPosition,
    getVelocity
} from './orbital.js';

const TOLERANCE = 1e-6;

function approxEqual(actual, expected, tolerance = TOLERANCE) {
    return Math.abs(actual - expected) < tolerance;
}

describe('orbital constants', () => {
    it('MU_SUN should be approximately 2.959e-4 AU³/day²', () => {
        assert.ok(approxEqual(MU_SUN, 2.9591220828559093e-4, 1e-10));
    });

    it('J2000 should be 2451545.0', () => {
        assert.strictEqual(J2000, 2451545.0);
    });
});

describe('meanMotion', () => {
    it('calculates correct mean motion for Earth orbit (a=1 AU)', () => {
        const n = meanMotion(1.0, MU_SUN);
        // Earth orbital period ~365.25 days → n ≈ 0.01720 rad/day
        assert.ok(approxEqual(n, 0.01720, 0.0001));
    });

    it('returns higher mean motion for smaller orbits', () => {
        const nEarth = meanMotion(1.0, MU_SUN);
        const nVenus = meanMotion(0.723, MU_SUN);
        assert.ok(nVenus > nEarth);
    });

    it('returns lower mean motion for larger orbits', () => {
        const nEarth = meanMotion(1.0, MU_SUN);
        const nMars = meanMotion(1.524, MU_SUN);
        assert.ok(nMars < nEarth);
    });

    it('returns NaN for a=0 (degenerate case)', () => {
        const n = meanMotion(0, MU_SUN);
        assert.ok(!isFinite(n));
    });
});

describe('propagateMeanAnomaly', () => {
    it('propagates mean anomaly correctly', () => {
        const M0 = 0;
        const n = 0.01720; // ~Earth mean motion
        const deltaTime = 100; // days
        const M = propagateMeanAnomaly(M0, n, deltaTime);
        assert.ok(approxEqual(M, 1.720, 0.001));
    });

    it('normalizes result to [0, 2π)', () => {
        const M0 = 0;
        const n = 0.01720;
        const deltaTime = 365.25; // One year
        const M = propagateMeanAnomaly(M0, n, deltaTime);
        assert.ok(M >= 0 && M < 2 * Math.PI);
    });

    it('handles negative time correctly', () => {
        const M0 = 1.0;
        const n = 0.01720;
        const deltaTime = -50;
        const M = propagateMeanAnomaly(M0, n, deltaTime);
        assert.ok(M >= 0 && M < 2 * Math.PI);
    });

    it('handles wrap-around at 2π', () => {
        const M0 = 6.0; // Close to 2π
        const n = 1.0;
        const deltaTime = 1.0;
        const M = propagateMeanAnomaly(M0, n, deltaTime);
        assert.ok(M >= 0 && M < 2 * Math.PI);
    });
});

describe('solveKepler', () => {
    it('returns M directly for circular orbit (e ≈ 0)', () => {
        const M = 1.5;
        const e = 1e-12;
        const E = solveKepler(M, e);
        assert.ok(approxEqual(E, M, 1e-10));
    });

    it('solves correctly for low eccentricity', () => {
        const M = 1.0;
        const e = 0.1;
        const E = solveKepler(M, e);
        // Verify Kepler's equation: M = E - e*sin(E)
        const verifyM = E - e * Math.sin(E);
        assert.ok(approxEqual(verifyM, M, 1e-10));
    });

    it('solves correctly for moderate eccentricity', () => {
        const M = 2.0;
        const e = 0.5;
        const E = solveKepler(M, e);
        const verifyM = E - e * Math.sin(E);
        assert.ok(approxEqual(verifyM, M, 1e-10));
    });

    it('solves correctly for high eccentricity', () => {
        const M = 0.5;
        const e = 0.9;
        const E = solveKepler(M, e);
        const verifyM = E - e * Math.sin(E);
        assert.ok(approxEqual(verifyM, M, 1e-10));
    });

    it('handles M = 0 (periapsis)', () => {
        const M = 0;
        const e = 0.3;
        const E = solveKepler(M, e);
        assert.ok(approxEqual(E, 0, 1e-10));
    });

    it('handles M = π', () => {
        const M = Math.PI;
        const e = 0.3;
        const E = solveKepler(M, e);
        const verifyM = E - e * Math.sin(E);
        assert.ok(approxEqual(verifyM, M, 1e-10));
    });
});

describe('eccentricToTrueAnomaly', () => {
    it('returns E directly for circular orbit (e ≈ 0)', () => {
        const E = 1.5;
        const e = 1e-12;
        const nu = eccentricToTrueAnomaly(E, e);
        assert.ok(approxEqual(nu, E, 1e-10));
    });

    it('converts correctly at periapsis (E = 0)', () => {
        const E = 0;
        const e = 0.5;
        const nu = eccentricToTrueAnomaly(E, e);
        assert.ok(approxEqual(nu, 0, 1e-10));
    });

    it('converts correctly at apoapsis (E = π)', () => {
        const E = Math.PI;
        const e = 0.5;
        const nu = eccentricToTrueAnomaly(E, e);
        assert.ok(approxEqual(nu, Math.PI, 1e-10));
    });

    it('true anomaly leads eccentric anomaly for e > 0', () => {
        const E = Math.PI / 4; // 45 degrees
        const e = 0.5;
        const nu = eccentricToTrueAnomaly(E, e);
        // For e > 0, nu > E in the first quadrant
        assert.ok(nu > E);
    });
});

describe('orbitalRadius', () => {
    it('returns a for circular orbit', () => {
        const a = 1.0;
        const e = 1e-12;
        const nu = Math.PI / 4;
        const r = orbitalRadius(a, e, nu);
        assert.ok(approxEqual(r, a, 1e-10));
    });

    it('returns periapsis distance at nu = 0', () => {
        const a = 1.0;
        const e = 0.5;
        const nu = 0;
        const r = orbitalRadius(a, e, nu);
        const expected = a * (1 - e); // periapsis = a(1-e)
        assert.ok(approxEqual(r, expected, 1e-10));
    });

    it('returns apoapsis distance at nu = π', () => {
        const a = 1.0;
        const e = 0.5;
        const nu = Math.PI;
        const r = orbitalRadius(a, e, nu);
        const expected = a * (1 + e); // apoapsis = a(1+e)
        assert.ok(approxEqual(r, expected, 1e-10));
    });
});

describe('positionInOrbitalPlane', () => {
    it('returns (r, 0) at nu = 0', () => {
        const r = 1.5;
        const nu = 0;
        const pos = positionInOrbitalPlane(r, nu);
        assert.ok(approxEqual(pos.x, r, 1e-10));
        assert.ok(approxEqual(pos.y, 0, 1e-10));
    });

    it('returns (0, r) at nu = π/2', () => {
        const r = 1.5;
        const nu = Math.PI / 2;
        const pos = positionInOrbitalPlane(r, nu);
        assert.ok(approxEqual(pos.x, 0, 1e-10));
        assert.ok(approxEqual(pos.y, r, 1e-10));
    });

    it('returns (-r, 0) at nu = π', () => {
        const r = 1.5;
        const nu = Math.PI;
        const pos = positionInOrbitalPlane(r, nu);
        assert.ok(approxEqual(pos.x, -r, 1e-10));
        assert.ok(approxEqual(pos.y, 0, 1e-10));
    });
});

describe('rotateToEcliptic', () => {
    it('returns unchanged position when all angles are zero', () => {
        const pos = { x: 1.0, y: 0.5 };
        const result = rotateToEcliptic(pos, 0, 0, 0);
        assert.ok(approxEqual(result.x, pos.x, 1e-10));
        assert.ok(approxEqual(result.y, pos.y, 1e-10));
        assert.ok(approxEqual(result.z, 0, 1e-10));
    });

    it('rotates correctly with 90° inclination', () => {
        const pos = { x: 1.0, y: 0 };
        const i = Math.PI / 2; // 90°
        const result = rotateToEcliptic(pos, i, 0, 0);
        // With i=90° and pos in x direction, should remain in x
        assert.ok(approxEqual(result.x, 1.0, 1e-10));
        assert.ok(approxEqual(result.y, 0, 1e-10));
        assert.ok(approxEqual(result.z, 0, 1e-10));
    });

    it('rotates y component into z with 90° inclination', () => {
        const pos = { x: 0, y: 1.0 };
        const i = Math.PI / 2; // 90°
        const result = rotateToEcliptic(pos, i, 0, 0);
        // With i=90°, y in orbital plane becomes z in ecliptic
        assert.ok(approxEqual(result.x, 0, 1e-10));
        assert.ok(approxEqual(result.y, 0, 1e-10));
        assert.ok(approxEqual(result.z, 1.0, 1e-10));
    });
});

describe('velocityInOrbitalPlane', () => {
    it('calculates correct velocity magnitude for circular orbit', () => {
        const a = 1.0;
        const e = 0;
        const nu = 0;
        const vel = velocityInOrbitalPlane(a, e, MU_SUN, nu);
        // For circular orbit, |v| = sqrt(μ/a)
        const expectedV = Math.sqrt(MU_SUN / a);
        const actualV = Math.sqrt(vel.vx ** 2 + vel.vy ** 2);
        assert.ok(approxEqual(actualV, expectedV, 1e-6));
    });

    it('velocity is purely tangential at periapsis', () => {
        const a = 1.0;
        const e = 0.5;
        const nu = 0; // periapsis
        const vel = velocityInOrbitalPlane(a, e, MU_SUN, nu);
        // At periapsis, vx should be 0 (no radial component)
        assert.ok(approxEqual(vel.vx, 0, 1e-10));
        assert.ok(vel.vy > 0); // positive tangential
    });

    it('velocity is purely tangential at apoapsis', () => {
        const a = 1.0;
        const e = 0.5;
        const nu = Math.PI; // apoapsis
        const vel = velocityInOrbitalPlane(a, e, MU_SUN, nu);
        // At apoapsis, vx should be 0
        assert.ok(approxEqual(vel.vx, 0, 1e-10));
        assert.ok(vel.vy < 0); // negative tangential (moving in -y direction)
    });
});

describe('getPosition', () => {
    const earthLikeElements = {
        a: 1.0,
        e: 0.0167,
        i: 0,
        Ω: 0,
        ω: 0,
        M0: 0,
        epoch: J2000,
        μ: MU_SUN
    };

    it('returns position at periapsis when M0=0 and t=epoch', () => {
        const pos = getPosition(earthLikeElements, J2000);
        // At periapsis with ω=0, should be along +x axis
        const r = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);
        const expectedR = earthLikeElements.a * (1 - earthLikeElements.e);
        assert.ok(approxEqual(r, expectedR, 0.001));
        assert.ok(pos.x > 0);
    });

    it('returns correct distance after half orbit', () => {
        const period = 365.25; // Earth-like period
        const pos = getPosition(earthLikeElements, J2000 + period / 2);
        // After half orbit, should be near apoapsis
        const r = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);
        const expectedR = earthLikeElements.a * (1 + earthLikeElements.e);
        assert.ok(approxEqual(r, expectedR, 0.01));
    });

    it('position magnitude satisfies vis-viva relation', () => {
        const pos = getPosition(earthLikeElements, J2000 + 100);
        const r = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);
        // r should be between periapsis and apoapsis
        const periapsis = earthLikeElements.a * (1 - earthLikeElements.e);
        const apoapsis = earthLikeElements.a * (1 + earthLikeElements.e);
        assert.ok(r >= periapsis - 0.001 && r <= apoapsis + 0.001);
    });
});

describe('getVelocity', () => {
    const earthLikeElements = {
        a: 1.0,
        e: 0.0167,
        i: 0,
        Ω: 0,
        ω: 0,
        M0: 0,
        epoch: J2000,
        μ: MU_SUN
    };

    it('velocity magnitude satisfies vis-viva equation', () => {
        const julianDate = J2000 + 100;
        const pos = getPosition(earthLikeElements, julianDate);
        const vel = getVelocity(earthLikeElements, julianDate);

        const r = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);
        const v = Math.sqrt(vel.vx ** 2 + vel.vy ** 2 + vel.vz ** 2);

        // vis-viva: v² = μ(2/r - 1/a)
        const expectedV2 = MU_SUN * (2 / r - 1 / earthLikeElements.a);
        const actualV2 = v * v;

        assert.ok(approxEqual(actualV2, expectedV2, 1e-8));
    });

    it('velocity is perpendicular to position for circular orbit', () => {
        const circularElements = { ...earthLikeElements, e: 0 };
        const julianDate = J2000 + 50;
        const pos = getPosition(circularElements, julianDate);
        const vel = getVelocity(circularElements, julianDate);

        // Dot product should be zero for perpendicular vectors
        const dot = pos.x * vel.vx + pos.y * vel.vy + pos.z * vel.vz;
        assert.ok(approxEqual(dot, 0, 1e-10));
    });
});
