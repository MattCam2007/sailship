/**
 * Unit tests for orbital maneuvers library
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
    SOLAR_PRESSURE_1AU,
    ACCEL_CONVERSION,
    getSolarPressure,
    getSunDirection,
    getSailThrustDirection,
    calculateSailThrust,
    characteristicAcceleration,
    eclipticToRTN,
    applyThrust,
    optimalSailAngle,
    estimateDeltaAPerOrbit
} from './orbital-maneuvers.js';
import { MU_SUN, J2000 } from './orbital.js';

const TOLERANCE = 1e-6;

function approxEqual(actual, expected, tolerance = TOLERANCE) {
    return Math.abs(actual - expected) < tolerance;
}

function vectorMagnitude(v) {
    return Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2);
}

describe('orbital-maneuvers constants', () => {
    it('SOLAR_PRESSURE_1AU should be approximately 4.56e-6 N/m²', () => {
        assert.ok(approxEqual(SOLAR_PRESSURE_1AU, 4.56e-6, 1e-8));
    });

    it('ACCEL_CONVERSION should convert m/s² to AU/day²', () => {
        // 1 m/s² * ACCEL_CONVERSION should give AU/day²
        assert.ok(ACCEL_CONVERSION > 0);
    });
});

describe('getSolarPressure', () => {
    it('returns SOLAR_PRESSURE_1AU at 1 AU distance', () => {
        const pressure = getSolarPressure(1.0);
        assert.ok(approxEqual(pressure, SOLAR_PRESSURE_1AU, 1e-10));
    });

    it('returns 4x pressure at 0.5 AU (inverse square law)', () => {
        const pressure = getSolarPressure(0.5);
        const expected = SOLAR_PRESSURE_1AU * 4;
        assert.ok(approxEqual(pressure, expected, 1e-10));
    });

    it('returns 1/4 pressure at 2 AU', () => {
        const pressure = getSolarPressure(2.0);
        const expected = SOLAR_PRESSURE_1AU / 4;
        assert.ok(approxEqual(pressure, expected, 1e-10));
    });

    it('clamps minimum distance to 0.01 AU to avoid infinity', () => {
        const pressureAtZero = getSolarPressure(0);
        const pressureAtMin = getSolarPressure(0.01);
        assert.strictEqual(pressureAtZero, pressureAtMin);
    });
});

describe('getSunDirection', () => {
    it('returns unit vector pointing away from sun', () => {
        const position = { x: 1, y: 0, z: 0 };
        const dir = getSunDirection(position);
        const mag = vectorMagnitude(dir);
        assert.ok(approxEqual(mag, 1.0, 1e-10));
    });

    it('returns (1, 0, 0) for position on +x axis', () => {
        const position = { x: 5, y: 0, z: 0 };
        const dir = getSunDirection(position);
        assert.ok(approxEqual(dir.x, 1, 1e-10));
        assert.ok(approxEqual(dir.y, 0, 1e-10));
        assert.ok(approxEqual(dir.z, 0, 1e-10));
    });

    it('returns (0, 1, 0) for position on +y axis', () => {
        const position = { x: 0, y: 3, z: 0 };
        const dir = getSunDirection(position);
        assert.ok(approxEqual(dir.x, 0, 1e-10));
        assert.ok(approxEqual(dir.y, 1, 1e-10));
        assert.ok(approxEqual(dir.z, 0, 1e-10));
    });

    it('returns normalized vector for arbitrary position', () => {
        const position = { x: 3, y: 4, z: 0 };
        const dir = getSunDirection(position);
        assert.ok(approxEqual(dir.x, 0.6, 1e-10));
        assert.ok(approxEqual(dir.y, 0.8, 1e-10));
    });

    it('returns default (1, 0, 0) at origin', () => {
        const position = { x: 0, y: 0, z: 0 };
        const dir = getSunDirection(position);
        assert.ok(approxEqual(dir.x, 1, 1e-10));
        assert.ok(approxEqual(dir.y, 0, 1e-10));
        assert.ok(approxEqual(dir.z, 0, 1e-10));
    });
});

describe('getSailThrustDirection', () => {
    const position = { x: 1, y: 0, z: 0 };
    const velocity = { vx: 0, vy: 0.01720, vz: 0 }; // Prograde on +x axis

    it('returns sun direction when sail angle is 0', () => {
        const dir = getSailThrustDirection(position, velocity, 0);
        const sunDir = getSunDirection(position);
        assert.ok(approxEqual(dir.x, sunDir.x, 1e-10));
        assert.ok(approxEqual(dir.y, sunDir.y, 1e-10));
        assert.ok(approxEqual(dir.z, sunDir.z, 1e-10));
    });

    it('returns unit vector for any angle', () => {
        const angles = [0, Math.PI / 6, Math.PI / 4, Math.PI / 3];
        for (const angle of angles) {
            const dir = getSailThrustDirection(position, velocity, angle);
            const mag = vectorMagnitude(dir);
            assert.ok(approxEqual(mag, 1.0, 1e-10), `Failed for angle ${angle}`);
        }
    });

    it('rotates thrust direction based on sail angle', () => {
        const dir0 = getSailThrustDirection(position, velocity, 0);
        const dir45 = getSailThrustDirection(position, velocity, Math.PI / 4);
        // Directions should be different
        const dot = dir0.x * dir45.x + dir0.y * dir45.y + dir0.z * dir45.z;
        assert.ok(dot < 1.0); // Not parallel
        assert.ok(dot > 0); // Still pointing roughly away from sun
    });
});

describe('calculateSailThrust', () => {
    const sailState = {
        area: 1e6, // 1 km²
        reflectivity: 0.9,
        angle: 0,
        deploymentPercent: 100,
        condition: 100
    };
    const position = { x: 1, y: 0, z: 0 };
    const velocity = { vx: 0, vy: 0.01720, vz: 0 };
    const distanceFromSun = 1.0;

    it('returns non-zero thrust for deployed sail', () => {
        const thrust = calculateSailThrust(sailState, position, velocity, distanceFromSun);
        const mag = vectorMagnitude(thrust);
        assert.ok(mag > 0);
    });

    it('returns zero thrust when sail is stowed (deployment = 0)', () => {
        const stowedSail = { ...sailState, deploymentPercent: 0 };
        const thrust = calculateSailThrust(stowedSail, position, velocity, distanceFromSun);
        const mag = vectorMagnitude(thrust);
        assert.ok(approxEqual(mag, 0, 1e-20));
    });

    it('returns zero thrust when sail angle is 90° (edge-on)', () => {
        const edgeOnSail = { ...sailState, angle: Math.PI / 2 };
        const thrust = calculateSailThrust(edgeOnSail, position, velocity, distanceFromSun);
        const mag = vectorMagnitude(thrust);
        assert.ok(approxEqual(mag, 0, 1e-15));
    });

    it('thrust decreases with sail angle (cos² factor)', () => {
        const thrust0 = calculateSailThrust({ ...sailState, angle: 0 }, position, velocity, distanceFromSun);
        const thrust45 = calculateSailThrust({ ...sailState, angle: Math.PI / 4 }, position, velocity, distanceFromSun);
        const mag0 = vectorMagnitude(thrust0);
        const mag45 = vectorMagnitude(thrust45);
        // At 45°, cos²(45°) = 0.5, so thrust should be about half
        assert.ok(mag45 < mag0);
        assert.ok(approxEqual(mag45 / mag0, 0.5, 0.01));
    });

    it('thrust scales with effective area', () => {
        const halfDeployed = { ...sailState, deploymentPercent: 50 };
        const thrustFull = calculateSailThrust(sailState, position, velocity, distanceFromSun);
        const thrustHalf = calculateSailThrust(halfDeployed, position, velocity, distanceFromSun);
        const magFull = vectorMagnitude(thrustFull);
        const magHalf = vectorMagnitude(thrustHalf);
        assert.ok(approxEqual(magHalf / magFull, 0.5, 0.01));
    });

    it('thrust increases closer to sun', () => {
        const thrustAt1AU = calculateSailThrust(sailState, position, velocity, 1.0);
        const thrustAt05AU = calculateSailThrust(sailState, { x: 0.5, y: 0, z: 0 }, velocity, 0.5);
        const mag1AU = vectorMagnitude(thrustAt1AU);
        const mag05AU = vectorMagnitude(thrustAt05AU);
        // At 0.5 AU, pressure is 4x, so thrust should be 4x
        assert.ok(approxEqual(mag05AU / mag1AU, 4.0, 0.1));
    });
});

describe('characteristicAcceleration', () => {
    it('returns positive acceleration for valid parameters', () => {
        const accel = characteristicAcceleration(1e6, 0.9, 10000);
        assert.ok(accel > 0);
    });

    it('scales linearly with area', () => {
        const accel1 = characteristicAcceleration(1e6, 0.9, 10000);
        const accel2 = characteristicAcceleration(2e6, 0.9, 10000);
        assert.ok(approxEqual(accel2 / accel1, 2.0, 0.01));
    });

    it('scales inversely with mass', () => {
        const accel1 = characteristicAcceleration(1e6, 0.9, 10000);
        const accel2 = characteristicAcceleration(1e6, 0.9, 20000);
        assert.ok(approxEqual(accel2 / accel1, 0.5, 0.01));
    });

    it('scales linearly with reflectivity', () => {
        const accel1 = characteristicAcceleration(1e6, 1.0, 10000);
        const accel2 = characteristicAcceleration(1e6, 0.5, 10000);
        assert.ok(approxEqual(accel2 / accel1, 0.5, 0.01));
    });
});

describe('eclipticToRTN', () => {
    const position = { x: 1, y: 0, z: 0 }; // On +x axis
    const velocity = { vx: 0, vy: 0.01720, vz: 0 }; // Moving in +y (prograde)

    it('converts radial thrust correctly', () => {
        const thrust = { x: 1, y: 0, z: 0 }; // Purely radial
        const rtn = eclipticToRTN(thrust, position, velocity);
        assert.ok(approxEqual(rtn.R, 1.0, 1e-10));
        assert.ok(approxEqual(rtn.T, 0, 1e-10));
        assert.ok(approxEqual(rtn.N, 0, 1e-10));
    });

    it('converts transverse thrust correctly', () => {
        const thrust = { x: 0, y: 1, z: 0 }; // Purely prograde
        const rtn = eclipticToRTN(thrust, position, velocity);
        assert.ok(approxEqual(rtn.R, 0, 1e-10));
        assert.ok(approxEqual(rtn.T, 1.0, 1e-10));
        assert.ok(approxEqual(rtn.N, 0, 1e-10));
    });

    it('converts normal thrust correctly', () => {
        const thrust = { x: 0, y: 0, z: 1 }; // Out of orbital plane
        const rtn = eclipticToRTN(thrust, position, velocity);
        assert.ok(approxEqual(rtn.R, 0, 1e-10));
        assert.ok(approxEqual(rtn.T, 0, 1e-10));
        assert.ok(approxEqual(rtn.N, 1.0, 1e-10));
    });

    it('preserves thrust magnitude', () => {
        const thrust = { x: 0.5, y: 0.5, z: 0.7071 };
        const rtn = eclipticToRTN(thrust, position, velocity);
        const originalMag = vectorMagnitude(thrust);
        const rtnMag = Math.sqrt(rtn.R ** 2 + rtn.T ** 2 + rtn.N ** 2);
        assert.ok(approxEqual(rtnMag, originalMag, 1e-6));
    });
});

describe('applyThrust', () => {
    const baseElements = {
        a: 1.0,
        e: 0.1,
        i: 0.05,
        Ω: 0,
        ω: 0,
        M0: 0,
        epoch: J2000,
        μ: MU_SUN
    };

    it('returns unchanged elements for zero thrust', () => {
        const thrust = { x: 0, y: 0, z: 0 };
        const newElements = applyThrust(baseElements, thrust, 1.0, J2000);
        assert.ok(approxEqual(newElements.a, baseElements.a, 1e-10));
        assert.ok(approxEqual(newElements.e, baseElements.e, 1e-10));
    });

    it('increases semi-major axis with prograde thrust', () => {
        // Prograde thrust at +x position (velocity is +y)
        const thrust = { x: 0, y: 1e-8, z: 0 };
        const newElements = applyThrust(baseElements, thrust, 1.0, J2000);
        assert.ok(newElements.a > baseElements.a);
    });

    it('decreases semi-major axis with retrograde thrust', () => {
        const thrust = { x: 0, y: -1e-8, z: 0 };
        const newElements = applyThrust(baseElements, thrust, 1.0, J2000);
        assert.ok(newElements.a < baseElements.a);
    });

    it('clamps semi-major axis to minimum 0.01 AU', () => {
        // Strong retrograde thrust
        const thrust = { x: 0, y: -1e-3, z: 0 };
        const newElements = applyThrust(baseElements, thrust, 100.0, J2000);
        assert.ok(newElements.a >= 0.01);
    });

    it('clamps eccentricity to [0, 0.99]', () => {
        // Thrust that would increase eccentricity beyond 1
        const highEElements = { ...baseElements, e: 0.95 };
        const thrust = { x: 1e-6, y: 0, z: 0 };
        const newElements = applyThrust(highEElements, thrust, 100.0, J2000);
        assert.ok(newElements.e <= 0.99);
        assert.ok(newElements.e >= 0);
    });

    it('normalizes angles to [0, 2π)', () => {
        const thrust = { x: 0, y: 0, z: 1e-8 };
        const newElements = applyThrust(baseElements, thrust, 1.0, J2000);
        assert.ok(newElements.Ω >= 0 && newElements.Ω < 2 * Math.PI);
        assert.ok(newElements.ω >= 0 && newElements.ω < 2 * Math.PI);
    });

    it('preserves μ and epoch', () => {
        const thrust = { x: 0, y: 1e-8, z: 0 };
        const newElements = applyThrust(baseElements, thrust, 1.0, J2000);
        assert.strictEqual(newElements.μ, baseElements.μ);
        assert.strictEqual(newElements.epoch, baseElements.epoch);
    });
});

describe('optimalSailAngle', () => {
    it('returns approximately 35.26° (arctan(1/√2))', () => {
        const angle = optimalSailAngle();
        const expectedDegrees = 35.26;
        const actualDegrees = angle * 180 / Math.PI;
        assert.ok(approxEqual(actualDegrees, expectedDegrees, 0.1));
    });

    it('returns approximately 0.6155 radians', () => {
        const angle = optimalSailAngle();
        assert.ok(approxEqual(angle, 0.6155, 0.001));
    });
});

describe('estimateDeltaAPerOrbit', () => {
    it('returns positive delta for outward spiral (positive sail angle)', () => {
        const charAccel = characteristicAcceleration(1e6, 0.9, 10000);
        const sailAngle = optimalSailAngle();
        const deltaA = estimateDeltaAPerOrbit(1.0, charAccel, sailAngle);
        assert.ok(deltaA > 0);
    });

    it('returns zero delta for edge-on sail (angle = 0 or π/2)', () => {
        const charAccel = characteristicAcceleration(1e6, 0.9, 10000);
        // At angle = 0, thrust is purely radial, no tangential component
        const deltaA0 = estimateDeltaAPerOrbit(1.0, charAccel, 0);
        // At angle = π/2, no thrust at all
        const deltaA90 = estimateDeltaAPerOrbit(1.0, charAccel, Math.PI / 2);
        assert.ok(approxEqual(deltaA0, 0, 1e-10));
        assert.ok(approxEqual(deltaA90, 0, 1e-10));
    });

    it('delta per orbit increases with larger semi-major axis (longer period)', () => {
        const charAccel = characteristicAcceleration(1e6, 0.9, 10000);
        const sailAngle = optimalSailAngle();
        const deltaA1 = estimateDeltaAPerOrbit(1.0, charAccel, sailAngle);
        const deltaA2 = estimateDeltaAPerOrbit(2.0, charAccel, sailAngle);
        // Delta per orbit increases because orbital period is longer
        // (more time for thrust to act, even though acceleration is lower)
        assert.ok(deltaA2 > deltaA1);
    });
});
