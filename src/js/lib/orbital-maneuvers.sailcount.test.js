/**
 * Unit tests for sail count in orbital maneuvers
 *
 * Tests the calculateSailThrust function with sail count multiplier.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
    calculateSailThrust,
    getSolarPressure,
    ACCEL_CONVERSION,
    SOLAR_PRESSURE_1AU
} from './orbital-maneuvers.js';

const TOLERANCE = 1e-6;

function approxEqual(actual, expected, tolerance = TOLERANCE) {
    return Math.abs(actual - expected) < tolerance;
}

function vectorMagnitude(v) {
    return Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2);
}

describe('calculateSailThrust with sailCount', () => {
    let baseSailState;
    let position;
    let velocity;

    beforeEach(() => {
        baseSailState = {
            area: 1e6,           // 1 km²
            reflectivity: 0.9,
            angle: 0,            // Face-on to sun
            pitchAngle: 0,
            deploymentPercent: 100,
            condition: 100,
            sailCount: 1
        };

        position = { x: 1.0, y: 0, z: 0 };  // 1 AU on +x axis
        velocity = { vx: 0, vy: 0.01720, vz: 0 };  // Circular orbit velocity
    });

    it('produces baseline thrust with sailCount = 1', () => {
        const thrust = calculateSailThrust(baseSailState, position, velocity, 1.0, 10000);
        const magnitude = vectorMagnitude(thrust);

        assert.ok(magnitude > 0, 'Thrust magnitude should be positive');
    });

    it('doubles thrust vector with sailCount = 2', () => {
        baseSailState.sailCount = 1;
        const thrust1 = calculateSailThrust(baseSailState, position, velocity, 1.0, 10000);

        baseSailState.sailCount = 2;
        const thrust2 = calculateSailThrust(baseSailState, position, velocity, 1.0, 10000);

        assert.ok(approxEqual(thrust2.x, thrust1.x * 2, 1e-10));
        assert.ok(approxEqual(thrust2.y, thrust1.y * 2, 1e-10));
        assert.ok(approxEqual(thrust2.z, thrust1.z * 2, 1e-10));
    });

    it('scales thrust magnitude linearly for all sail counts 1-20', () => {
        baseSailState.sailCount = 1;
        const thrust1 = calculateSailThrust(baseSailState, position, velocity, 1.0, 10000);
        const baseMagnitude = vectorMagnitude(thrust1);

        for (let count = 2; count <= 20; count++) {
            baseSailState.sailCount = count;
            const thrust = calculateSailThrust(baseSailState, position, velocity, 1.0, 10000);
            const magnitude = vectorMagnitude(thrust);
            const expected = baseMagnitude * count;

            assert.ok(
                approxEqual(magnitude, expected, 1e-10),
                `Thrust magnitude with ${count} sails should be ${count}x baseline`
            );
        }
    });

    it('preserves thrust direction with different sail counts', () => {
        baseSailState.sailCount = 1;
        const thrust1 = calculateSailThrust(baseSailState, position, velocity, 1.0, 10000);
        const mag1 = vectorMagnitude(thrust1);
        const dir1 = { x: thrust1.x / mag1, y: thrust1.y / mag1, z: thrust1.z / mag1 };

        baseSailState.sailCount = 15;
        const thrust15 = calculateSailThrust(baseSailState, position, velocity, 1.0, 10000);
        const mag15 = vectorMagnitude(thrust15);
        const dir15 = { x: thrust15.x / mag15, y: thrust15.y / mag15, z: thrust15.z / mag15 };

        assert.ok(approxEqual(dir1.x, dir15.x, 1e-10), 'X direction should be preserved');
        assert.ok(approxEqual(dir1.y, dir15.y, 1e-10), 'Y direction should be preserved');
        assert.ok(approxEqual(dir1.z, dir15.z, 1e-10), 'Z direction should be preserved');
    });

    it('defaults to sailCount = 1 when not specified', () => {
        const sailStateWithoutCount = { ...baseSailState };
        delete sailStateWithoutCount.sailCount;

        const thrustDefault = calculateSailThrust(sailStateWithoutCount, position, velocity, 1.0, 10000);

        baseSailState.sailCount = 1;
        const thrust1 = calculateSailThrust(baseSailState, position, velocity, 1.0, 10000);

        assert.ok(approxEqual(thrustDefault.x, thrust1.x, 1e-10));
        assert.ok(approxEqual(thrustDefault.y, thrust1.y, 1e-10));
        assert.ok(approxEqual(thrustDefault.z, thrust1.z, 1e-10));
    });

    it('works with angled sail (yaw angle)', () => {
        baseSailState.angle = Math.PI / 4;  // 45 degrees
        baseSailState.sailCount = 1;
        const thrust1 = calculateSailThrust(baseSailState, position, velocity, 1.0, 10000);

        baseSailState.sailCount = 8;
        const thrust8 = calculateSailThrust(baseSailState, position, velocity, 1.0, 10000);

        const mag1 = vectorMagnitude(thrust1);
        const mag8 = vectorMagnitude(thrust8);

        assert.ok(approxEqual(mag8, mag1 * 8, 1e-10));
    });

    it('works with pitch angle', () => {
        baseSailState.pitchAngle = Math.PI / 6;  // 30 degrees
        baseSailState.sailCount = 1;
        const thrust1 = calculateSailThrust(baseSailState, position, velocity, 1.0, 10000);

        baseSailState.sailCount = 12;
        const thrust12 = calculateSailThrust(baseSailState, position, velocity, 1.0, 10000);

        const mag1 = vectorMagnitude(thrust1);
        const mag12 = vectorMagnitude(thrust12);

        assert.ok(approxEqual(mag12, mag1 * 12, 1e-10));
    });

    it('works with combined yaw and pitch angles', () => {
        baseSailState.angle = Math.PI / 6;       // 30 degrees yaw
        baseSailState.pitchAngle = Math.PI / 9;  // 20 degrees pitch
        baseSailState.sailCount = 1;
        const thrust1 = calculateSailThrust(baseSailState, position, velocity, 1.0, 10000);

        baseSailState.sailCount = 7;
        const thrust7 = calculateSailThrust(baseSailState, position, velocity, 1.0, 10000);

        const mag1 = vectorMagnitude(thrust1);
        const mag7 = vectorMagnitude(thrust7);

        assert.ok(approxEqual(mag7, mag1 * 7, 1e-10));
    });

    it('works with partial deployment', () => {
        baseSailState.deploymentPercent = 50;
        baseSailState.sailCount = 1;
        const thrust1 = calculateSailThrust(baseSailState, position, velocity, 1.0, 10000);

        baseSailState.sailCount = 6;
        const thrust6 = calculateSailThrust(baseSailState, position, velocity, 1.0, 10000);

        const mag1 = vectorMagnitude(thrust1);
        const mag6 = vectorMagnitude(thrust6);

        assert.ok(approxEqual(mag6, mag1 * 6, 1e-10));
    });

    it('works with degraded sail condition', () => {
        baseSailState.condition = 75;
        baseSailState.sailCount = 1;
        const thrust1 = calculateSailThrust(baseSailState, position, velocity, 1.0, 10000);

        baseSailState.sailCount = 9;
        const thrust9 = calculateSailThrust(baseSailState, position, velocity, 1.0, 10000);

        const mag1 = vectorMagnitude(thrust1);
        const mag9 = vectorMagnitude(thrust9);

        assert.ok(approxEqual(mag9, mag1 * 9, 1e-10));
    });

    it('returns zero when deployment is 0, regardless of sail count', () => {
        baseSailState.deploymentPercent = 0;

        baseSailState.sailCount = 1;
        const thrust1 = calculateSailThrust(baseSailState, position, velocity, 1.0, 10000);

        baseSailState.sailCount = 20;
        const thrust20 = calculateSailThrust(baseSailState, position, velocity, 1.0, 10000);

        assert.strictEqual(vectorMagnitude(thrust1), 0);
        assert.strictEqual(vectorMagnitude(thrust20), 0);
    });

    it('works at different distances from sun', () => {
        const distance2AU = 2.0;
        baseSailState.sailCount = 1;
        const thrust1 = calculateSailThrust(baseSailState, position, velocity, distance2AU, 10000);

        baseSailState.sailCount = 11;
        const thrust11 = calculateSailThrust(baseSailState, position, velocity, distance2AU, 10000);

        const mag1 = vectorMagnitude(thrust1);
        const mag11 = vectorMagnitude(thrust11);

        assert.ok(approxEqual(mag11, mag1 * 11, 1e-10));
    });

    it('scales correctly with different ship masses', () => {
        const lightShip = 5000;   // kg
        const heavyShip = 50000;  // kg

        baseSailState.sailCount = 1;
        const thrustLight1 = calculateSailThrust(baseSailState, position, velocity, 1.0, lightShip);
        const thrustHeavy1 = calculateSailThrust(baseSailState, position, velocity, 1.0, heavyShip);

        baseSailState.sailCount = 5;
        const thrustLight5 = calculateSailThrust(baseSailState, position, velocity, 1.0, lightShip);
        const thrustHeavy5 = calculateSailThrust(baseSailState, position, velocity, 1.0, heavyShip);

        // Verify both scale by same factor
        const lightRatio = vectorMagnitude(thrustLight5) / vectorMagnitude(thrustLight1);
        const heavyRatio = vectorMagnitude(thrustHeavy5) / vectorMagnitude(thrustHeavy1);

        assert.ok(approxEqual(lightRatio, 5, 1e-10));
        assert.ok(approxEqual(heavyRatio, 5, 1e-10));
        assert.ok(approxEqual(lightRatio, heavyRatio, 1e-10));
    });

    it('produces maximum thrust at sailCount = 20', () => {
        baseSailState.sailCount = 20;
        const thrustMax = calculateSailThrust(baseSailState, position, velocity, 1.0, 10000);
        const magMax = vectorMagnitude(thrustMax);

        baseSailState.sailCount = 1;
        const thrust1 = calculateSailThrust(baseSailState, position, velocity, 1.0, 10000);
        const mag1 = vectorMagnitude(thrust1);

        assert.ok(approxEqual(magMax, mag1 * 20, 1e-10));
    });
});

describe('sailCount edge cases in calculateSailThrust', () => {
    let baseSailState;
    let position;
    let velocity;

    beforeEach(() => {
        baseSailState = {
            area: 1e6,
            reflectivity: 0.9,
            angle: 0,
            pitchAngle: 0,
            deploymentPercent: 100,
            condition: 100,
            sailCount: 1
        };

        position = { x: 1.0, y: 0, z: 0 };
        velocity = { vx: 0, vy: 0.01720, vz: 0 };
    });

    it('handles sailCount = 0 (produces zero thrust)', () => {
        baseSailState.sailCount = 0;
        const thrust = calculateSailThrust(baseSailState, position, velocity, 1.0, 10000);
        const magnitude = vectorMagnitude(thrust);

        assert.strictEqual(magnitude, 0);
    });

    it('handles fractional sailCount values', () => {
        baseSailState.sailCount = 2.5;
        const thrustFractional = calculateSailThrust(baseSailState, position, velocity, 1.0, 10000);

        baseSailState.sailCount = 1;
        const thrust1 = calculateSailThrust(baseSailState, position, velocity, 1.0, 10000);

        const magFractional = vectorMagnitude(thrustFractional);
        const mag1 = vectorMagnitude(thrust1);

        assert.ok(approxEqual(magFractional, mag1 * 2.5, 1e-10));
    });

    it('handles very large sailCount values', () => {
        baseSailState.sailCount = 1000;
        const thrustLarge = calculateSailThrust(baseSailState, position, velocity, 1.0, 10000);

        baseSailState.sailCount = 1;
        const thrust1 = calculateSailThrust(baseSailState, position, velocity, 1.0, 10000);

        const magLarge = vectorMagnitude(thrustLarge);
        const mag1 = vectorMagnitude(thrust1);

        assert.ok(approxEqual(magLarge, mag1 * 1000, 1e-8));
    });

    it('handles negative sailCount (should produce negative thrust)', () => {
        baseSailState.sailCount = -5;
        const thrustNegative = calculateSailThrust(baseSailState, position, velocity, 1.0, 10000);

        baseSailState.sailCount = 5;
        const thrustPositive = calculateSailThrust(baseSailState, position, velocity, 1.0, 10000);

        // Should be opposite direction
        assert.ok(approxEqual(thrustNegative.x, -thrustPositive.x, 1e-10));
        assert.ok(approxEqual(thrustNegative.y, -thrustPositive.y, 1e-10));
        assert.ok(approxEqual(thrustNegative.z, -thrustPositive.z, 1e-10));
    });

    it('maintains precision with maximum realistic sail count', () => {
        baseSailState.sailCount = 1;
        const thrust1 = calculateSailThrust(baseSailState, position, velocity, 1.0, 10000);
        const mag1 = vectorMagnitude(thrust1);

        baseSailState.sailCount = 20;
        const thrust20 = calculateSailThrust(baseSailState, position, velocity, 1.0, 10000);
        const mag20 = vectorMagnitude(thrust20);

        const ratio = mag20 / mag1;

        // Should be exactly 20.0 within floating point precision
        assert.ok(approxEqual(ratio, 20.0, 1e-12));
    });
});

describe('sailCount integration with all sail parameters', () => {
    let position;
    let velocity;

    beforeEach(() => {
        position = { x: 1.0, y: 0, z: 0 };
        velocity = { vx: 0, vy: 0.01720, vz: 0 };
    });

    it('combines sailCount with all other parameters correctly', () => {
        const complexSailState = {
            area: 3e6,                    // 3 km²
            reflectivity: 0.85,           // 85%
            angle: Math.PI / 8,           // 22.5 degrees yaw
            pitchAngle: Math.PI / 12,     // 15 degrees pitch
            deploymentPercent: 80,        // 80% deployed
            condition: 95,                // 95% condition
            sailCount: 1
        };

        const thrust1 = calculateSailThrust(complexSailState, position, velocity, 1.0, 10000);
        const mag1 = vectorMagnitude(thrust1);

        complexSailState.sailCount = 13;
        const thrust13 = calculateSailThrust(complexSailState, position, velocity, 1.0, 10000);
        const mag13 = vectorMagnitude(thrust13);

        assert.ok(approxEqual(mag13, mag1 * 13, 1e-10));
    });

    it('sailCount multiplies final thrust after all other calculations', () => {
        const sailState = {
            area: 1e6,
            reflectivity: 0.9,
            angle: Math.PI / 4,
            pitchAngle: Math.PI / 6,
            deploymentPercent: 50,
            condition: 75,
            sailCount: 1
        };

        // Calculate with sailCount = 1
        const thrust1 = calculateSailThrust(sailState, position, velocity, 1.0, 10000);

        // Now set sailCount = 4 and recalculate
        sailState.sailCount = 4;
        const thrust4 = calculateSailThrust(sailState, position, velocity, 1.0, 10000);

        // All components should be exactly 4x
        assert.ok(approxEqual(thrust4.x, thrust1.x * 4, 1e-10));
        assert.ok(approxEqual(thrust4.y, thrust1.y * 4, 1e-10));
        assert.ok(approxEqual(thrust4.z, thrust1.z * 4, 1e-10));
    });

    it('works in different orbital positions and velocities', () => {
        const positions = [
            { x: 1.0, y: 0, z: 0 },
            { x: 0, y: 1.5, z: 0 },
            { x: 0.7, y: 0.7, z: 0.1 },
            { x: -1.0, y: 0, z: 0 }
        ];

        const velocities = [
            { vx: 0, vy: 0.01720, vz: 0 },
            { vx: -0.01405, vy: 0, vz: 0 },
            { vx: 0.01, vy: -0.01, vz: 0.002 },
            { vx: 0, vy: -0.01720, vz: 0 }
        ];

        const sailState = {
            area: 1e6,
            reflectivity: 0.9,
            angle: 0,
            pitchAngle: 0,
            deploymentPercent: 100,
            condition: 100,
            sailCount: 1
        };

        for (let i = 0; i < positions.length; i++) {
            const pos = positions[i];
            const vel = velocities[i];
            const distance = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);

            sailState.sailCount = 1;
            const thrust1 = calculateSailThrust(sailState, pos, vel, distance, 10000);

            sailState.sailCount = 16;
            const thrust16 = calculateSailThrust(sailState, pos, vel, distance, 10000);

            const mag1 = vectorMagnitude(thrust1);
            const mag16 = vectorMagnitude(thrust16);

            assert.ok(
                approxEqual(mag16, mag1 * 16, 1e-10),
                `Should scale correctly at position ${i}`
            );
        }
    });
});

// Export test runner
export function runAllTests() {
    console.log('Running orbital-maneuvers sail count tests...');
    console.log('Tests are executed via node:test framework');
    console.log('Run with: node --test src/js/lib/orbital-maneuvers.sailcount.test.js');
}
