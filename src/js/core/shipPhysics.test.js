/**
 * Unit tests for ship physics module
 *
 * Tests focus on pure functions (getOrbitalInfo, getThrustInfo).
 * Update functions are harder to test due to external dependencies.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
    getOrbitalInfo,
    getThrustInfo
} from './shipPhysics.js';
import { MU_SUN, J2000 } from '../lib/orbital.js';

const TOLERANCE = 1e-6;

function approxEqual(actual, expected, tolerance = TOLERANCE) {
    return Math.abs(actual - expected) < tolerance;
}

describe('getOrbitalInfo', () => {
    const mockShip = {
        x: 1.0,
        y: 0,
        z: 0,
        orbitalElements: {
            a: 1.0,        // 1 AU
            e: 0.0167,     // Earth-like eccentricity
            i: 0,          // No inclination
            Ω: 0,
            ω: 0,
            M0: 0,
            epoch: J2000,
            μ: MU_SUN
        }
    };

    it('returns null for ship without orbital elements', () => {
        const noElementsShip = { x: 0, y: 0, z: 0 };
        const info = getOrbitalInfo(noElementsShip);
        assert.strictEqual(info, null);
    });

    it('returns orbital info object for valid ship', () => {
        const info = getOrbitalInfo(mockShip);
        assert.ok(info !== null);
        assert.ok(typeof info === 'object');
    });

    it('includes semi-major axis', () => {
        const info = getOrbitalInfo(mockShip);
        assert.ok(approxEqual(info.semiMajorAxis, 1.0, 1e-10));
    });

    it('includes eccentricity', () => {
        const info = getOrbitalInfo(mockShip);
        assert.ok(approxEqual(info.eccentricity, 0.0167, 1e-10));
    });

    it('includes inclination in degrees', () => {
        const info = getOrbitalInfo(mockShip);
        assert.ok(approxEqual(info.inclination, 0, 1e-10));
    });

    it('calculates correct period for Earth-like orbit', () => {
        const info = getOrbitalInfo(mockShip);
        // Earth orbital period ~365.25 days
        assert.ok(approxEqual(info.period, 365.25, 1));
        assert.ok(approxEqual(info.periodYears, 1.0, 0.01));
    });

    it('calculates correct periapsis', () => {
        const info = getOrbitalInfo(mockShip);
        const expected = mockShip.orbitalElements.a * (1 - mockShip.orbitalElements.e);
        assert.ok(approxEqual(info.periapsis, expected, 1e-10));
    });

    it('calculates correct apoapsis', () => {
        const info = getOrbitalInfo(mockShip);
        const expected = mockShip.orbitalElements.a * (1 + mockShip.orbitalElements.e);
        assert.ok(approxEqual(info.apoapsis, expected, 1e-10));
    });

    it('calculates current distance from sun', () => {
        const info = getOrbitalInfo(mockShip);
        const expected = Math.sqrt(mockShip.x ** 2 + mockShip.y ** 2 + mockShip.z ** 2);
        assert.ok(approxEqual(info.currentDistance, expected, 1e-10));
    });

    it('handles eccentric orbit correctly', () => {
        const eccentricShip = {
            x: 0.5,
            y: 0,
            z: 0,
            orbitalElements: {
                a: 1.5,
                e: 0.5,
                i: Math.PI / 6, // 30°
                Ω: 0,
                ω: 0,
                M0: 0,
                epoch: J2000,
                μ: MU_SUN
            }
        };
        const info = getOrbitalInfo(eccentricShip);

        assert.ok(approxEqual(info.semiMajorAxis, 1.5, 1e-10));
        assert.ok(approxEqual(info.eccentricity, 0.5, 1e-10));
        assert.ok(approxEqual(info.inclination, 30, 0.1));
        assert.ok(approxEqual(info.periapsis, 0.75, 1e-10));  // a*(1-e) = 1.5*0.5
        assert.ok(approxEqual(info.apoapsis, 2.25, 1e-10));   // a*(1+e) = 1.5*1.5
    });
});

describe('getThrustInfo', () => {
    const mockShipWithSail = {
        x: 1.0,
        y: 0,
        z: 0,
        mass: 10000,
        orbitalElements: {
            a: 1.0,
            e: 0.0167,
            i: 0,
            Ω: 0,
            ω: 0,
            M0: 0,
            epoch: J2000,
            μ: MU_SUN
        },
        sail: {
            area: 1e6,          // 1 km²
            reflectivity: 0.9,
            angle: 0,
            deploymentPercent: 100,
            condition: 100
        }
    };

    it('returns null for ship without sail', () => {
        const noSailShip = {
            x: 1.0,
            y: 0,
            z: 0,
            orbitalElements: mockShipWithSail.orbitalElements
        };
        const info = getThrustInfo(noSailShip);
        assert.strictEqual(info, null);
    });

    it('returns null for ship without orbital elements', () => {
        const noElementsShip = {
            x: 1.0,
            y: 0,
            z: 0,
            sail: mockShipWithSail.sail
        };
        const info = getThrustInfo(noElementsShip);
        assert.strictEqual(info, null);
    });

    it('returns null for ship at origin (r < 0.01)', () => {
        const atOriginShip = {
            ...mockShipWithSail,
            x: 0,
            y: 0,
            z: 0
        };
        const info = getThrustInfo(atOriginShip);
        assert.strictEqual(info, null);
    });

    it('returns thrust info object for valid ship', () => {
        const info = getThrustInfo(mockShipWithSail);
        assert.ok(info !== null);
        assert.ok(typeof info === 'object');
    });

    it('includes thrust in Newtons', () => {
        const info = getThrustInfo(mockShipWithSail);
        assert.ok(typeof info.thrustNewtons === 'number');
        assert.ok(info.thrustNewtons > 0);
    });

    it('includes acceleration in m/s²', () => {
        const info = getThrustInfo(mockShipWithSail);
        assert.ok(typeof info.accelerationMS2 === 'number');
        assert.ok(info.accelerationMS2 > 0);
    });

    it('includes acceleration in Gs', () => {
        const info = getThrustInfo(mockShipWithSail);
        assert.ok(typeof info.accelerationG === 'number');
        // Solar sail acceleration is very small, << 1g
        assert.ok(info.accelerationG < 0.001);
        assert.ok(info.accelerationG > 0);
    });

    it('includes sail angle in degrees', () => {
        const info = getThrustInfo(mockShipWithSail);
        assert.ok(approxEqual(info.sailAngleDeg, 0, 1e-10));
    });

    it('includes effective area in km²', () => {
        const info = getThrustInfo(mockShipWithSail);
        assert.ok(approxEqual(info.effectiveAreaKM2, 1.0, 1e-10));
    });

    it('includes solar pressure at current distance', () => {
        const info = getThrustInfo(mockShipWithSail);
        // At 1 AU, pressure ≈ 4.56e-6 N/m²
        assert.ok(approxEqual(info.solarPressureNM2, 4.56e-6, 1e-8));
    });

    it('includes distance in AU', () => {
        const info = getThrustInfo(mockShipWithSail);
        assert.ok(approxEqual(info.distanceAU, 1.0, 1e-10));
    });

    it('calculates zero thrust when sail is stowed', () => {
        const stowedSailShip = {
            ...mockShipWithSail,
            sail: {
                ...mockShipWithSail.sail,
                deploymentPercent: 0
            }
        };
        const info = getThrustInfo(stowedSailShip);
        assert.ok(approxEqual(info.thrustNewtons, 0, 1e-15));
        assert.ok(approxEqual(info.accelerationMS2, 0, 1e-15));
    });

    it('calculates zero thrust when sail is edge-on (90°)', () => {
        const edgeOnSailShip = {
            ...mockShipWithSail,
            sail: {
                ...mockShipWithSail.sail,
                angle: Math.PI / 2
            }
        };
        const info = getThrustInfo(edgeOnSailShip);
        assert.ok(approxEqual(info.thrustNewtons, 0, 1e-10));
    });

    it('reduces thrust with sail condition', () => {
        const damagedSailShip = {
            ...mockShipWithSail,
            sail: {
                ...mockShipWithSail.sail,
                condition: 50
            }
        };
        const fullInfo = getThrustInfo(mockShipWithSail);
        const damagedInfo = getThrustInfo(damagedSailShip);
        assert.ok(approxEqual(damagedInfo.thrustNewtons / fullInfo.thrustNewtons, 0.5, 0.01));
    });

    it('increases thrust closer to sun', () => {
        const closerShip = {
            ...mockShipWithSail,
            x: 0.5,
            y: 0,
            z: 0
        };
        const farInfo = getThrustInfo(mockShipWithSail);
        const closeInfo = getThrustInfo(closerShip);
        // At 0.5 AU, pressure is 4x, so thrust should be 4x
        assert.ok(approxEqual(closeInfo.thrustNewtons / farInfo.thrustNewtons, 4.0, 0.1));
    });

    it('uses default mass when not specified', () => {
        const noMassShip = {
            x: 1.0,
            y: 0,
            z: 0,
            orbitalElements: mockShipWithSail.orbitalElements,
            sail: mockShipWithSail.sail
        };
        const info = getThrustInfo(noMassShip);
        // Should still calculate using default 10000 kg mass
        assert.ok(info.accelerationMS2 > 0);
    });
});

describe('thrust physics consistency', () => {
    const ship = {
        x: 1.0,
        y: 0,
        z: 0,
        mass: 10000,
        orbitalElements: {
            a: 1.0,
            e: 0,
            i: 0,
            Ω: 0,
            ω: 0,
            M0: 0,
            epoch: J2000,
            μ: MU_SUN
        },
        sail: {
            area: 1e6,
            reflectivity: 0.9,
            angle: 0,
            deploymentPercent: 100,
            condition: 100
        }
    };

    it('F = ma relationship holds', () => {
        const info = getThrustInfo(ship);
        const calculatedAccel = info.thrustNewtons / ship.mass;
        assert.ok(approxEqual(info.accelerationMS2, calculatedAccel, 1e-15));
    });

    it('acceleration in G = acceleration in m/s² / 9.81', () => {
        const info = getThrustInfo(ship);
        const calculatedG = info.accelerationMS2 / 9.81;
        assert.ok(approxEqual(info.accelerationG, calculatedG, 1e-15));
    });
});
