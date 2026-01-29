/**
 * Unit tests for sail count feature
 *
 * Tests the setSailCount function and related thrust multiplier functionality.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { setSailCount, getCurrentThrustAccel } from './ships.js';
import { DEFAULT_SAIL, DEFAULT_SHIP_MASS } from '../config.js';

const TOLERANCE = 1e-6;

function approxEqual(actual, expected, tolerance = TOLERANCE) {
    return Math.abs(actual - expected) < tolerance;
}

describe('setSailCount', () => {
    let mockShip;

    beforeEach(() => {
        mockShip = {
            sail: { ...DEFAULT_SAIL }
        };
    });

    it('sets sail count to valid integer value', () => {
        setSailCount(mockShip, 5);
        assert.strictEqual(mockShip.sail.sailCount, 5);
    });

    it('clamps to minimum of 1', () => {
        setSailCount(mockShip, 0);
        assert.strictEqual(mockShip.sail.sailCount, 1);

        setSailCount(mockShip, -5);
        assert.strictEqual(mockShip.sail.sailCount, 1);
    });

    it('clamps to maximum of 20', () => {
        setSailCount(mockShip, 21);
        assert.strictEqual(mockShip.sail.sailCount, 20);

        setSailCount(mockShip, 100);
        assert.strictEqual(mockShip.sail.sailCount, 20);
    });

    it('rounds fractional values to nearest integer', () => {
        setSailCount(mockShip, 3.4);
        assert.strictEqual(mockShip.sail.sailCount, 3);

        setSailCount(mockShip, 7.6);
        assert.strictEqual(mockShip.sail.sailCount, 8);

        setSailCount(mockShip, 5.5);
        assert.strictEqual(mockShip.sail.sailCount, 6);
    });

    it('handles edge case of exactly 1', () => {
        setSailCount(mockShip, 1);
        assert.strictEqual(mockShip.sail.sailCount, 1);
    });

    it('handles edge case of exactly 20', () => {
        setSailCount(mockShip, 20);
        assert.strictEqual(mockShip.sail.sailCount, 20);
    });

    it('does nothing if ship has no sail', () => {
        const shipWithoutSail = { x: 0, y: 0, z: 0 };
        setSailCount(shipWithoutSail, 5);
        assert.strictEqual(shipWithoutSail.sail, undefined);
    });

    it('allows all valid integer values from 1 to 20', () => {
        for (let i = 1; i <= 20; i++) {
            setSailCount(mockShip, i);
            assert.strictEqual(mockShip.sail.sailCount, i);
        }
    });

    it('handles negative fractional values', () => {
        setSailCount(mockShip, -2.7);
        assert.strictEqual(mockShip.sail.sailCount, 1); // Clamped to minimum
    });

    it('handles very large values', () => {
        setSailCount(mockShip, 1000000);
        assert.strictEqual(mockShip.sail.sailCount, 20); // Clamped to maximum
    });
});

describe('getCurrentThrustAccel with sailCount', () => {
    let mockShip;

    beforeEach(() => {
        mockShip = {
            x: 1.0,  // 1 AU from sun
            y: 0,
            z: 0,
            orbitalElements: {
                a: 1.0,
                e: 0.0,
                i: 0.0,
                Ω: 0,
                ω: 0,
                M0: 0,
                epoch: 2451545.0,
                μ: 1.32712440018e20
            },
            mass: DEFAULT_SHIP_MASS,
            sail: {
                area: 1000000,  // 1 km² for easier math
                reflectivity: 0.9,
                angle: 0,       // Face-on to sun
                pitchAngle: 0,
                deploymentPercent: 100,
                condition: 100,
                sailCount: 1
            }
        };
    });

    it('returns baseline thrust with sailCount = 1', () => {
        mockShip.sail.sailCount = 1;
        const thrust1 = getCurrentThrustAccel(mockShip);
        assert.ok(thrust1 > 0, 'Thrust should be positive');
    });

    it('doubles thrust with sailCount = 2', () => {
        mockShip.sail.sailCount = 1;
        const thrust1 = getCurrentThrustAccel(mockShip);

        mockShip.sail.sailCount = 2;
        const thrust2 = getCurrentThrustAccel(mockShip);

        assert.ok(approxEqual(thrust2, thrust1 * 2, 1e-10));
    });

    it('triples thrust with sailCount = 3', () => {
        mockShip.sail.sailCount = 1;
        const thrust1 = getCurrentThrustAccel(mockShip);

        mockShip.sail.sailCount = 3;
        const thrust3 = getCurrentThrustAccel(mockShip);

        assert.ok(approxEqual(thrust3, thrust1 * 3, 1e-10));
    });

    it('scales linearly for all sail counts 1-20', () => {
        mockShip.sail.sailCount = 1;
        const baseThrust = getCurrentThrustAccel(mockShip);

        for (let count = 2; count <= 20; count++) {
            mockShip.sail.sailCount = count;
            const scaledThrust = getCurrentThrustAccel(mockShip);
            const expected = baseThrust * count;

            assert.ok(
                approxEqual(scaledThrust, expected, 1e-10),
                `Thrust with ${count} sails should be ${count}x baseline`
            );
        }
    });

    it('works correctly with partial deployment', () => {
        mockShip.sail.deploymentPercent = 50;
        mockShip.sail.sailCount = 1;
        const thrust1 = getCurrentThrustAccel(mockShip);

        mockShip.sail.sailCount = 5;
        const thrust5 = getCurrentThrustAccel(mockShip);

        assert.ok(approxEqual(thrust5, thrust1 * 5, 1e-10));
    });

    it('works correctly with angled sail', () => {
        mockShip.sail.angle = Math.PI / 4; // 45 degrees
        mockShip.sail.sailCount = 1;
        const thrust1 = getCurrentThrustAccel(mockShip);

        mockShip.sail.sailCount = 4;
        const thrust4 = getCurrentThrustAccel(mockShip);

        assert.ok(approxEqual(thrust4, thrust1 * 4, 1e-10));
    });

    it('works correctly with pitched sail', () => {
        mockShip.sail.pitchAngle = Math.PI / 6; // 30 degrees
        mockShip.sail.sailCount = 1;
        const thrust1 = getCurrentThrustAccel(mockShip);

        mockShip.sail.sailCount = 7;
        const thrust7 = getCurrentThrustAccel(mockShip);

        assert.ok(approxEqual(thrust7, thrust1 * 7, 1e-10));
    });

    it('defaults to sailCount = 1 if not specified', () => {
        delete mockShip.sail.sailCount;
        const thrustDefault = getCurrentThrustAccel(mockShip);

        mockShip.sail.sailCount = 1;
        const thrust1 = getCurrentThrustAccel(mockShip);

        assert.ok(approxEqual(thrustDefault, thrust1, 1e-10));
    });

    it('returns zero thrust when sailCount = 1 and deployment = 0', () => {
        mockShip.sail.deploymentPercent = 0;
        mockShip.sail.sailCount = 1;
        const thrust = getCurrentThrustAccel(mockShip);
        assert.strictEqual(thrust, 0);
    });

    it('returns zero thrust when sailCount = 20 and deployment = 0', () => {
        mockShip.sail.deploymentPercent = 0;
        mockShip.sail.sailCount = 20;
        const thrust = getCurrentThrustAccel(mockShip);
        assert.strictEqual(thrust, 0);
    });

    it('produces maximum thrust with sailCount = 20', () => {
        mockShip.sail.sailCount = 1;
        const thrust1 = getCurrentThrustAccel(mockShip);

        mockShip.sail.sailCount = 20;
        const thrust20 = getCurrentThrustAccel(mockShip);

        assert.ok(approxEqual(thrust20, thrust1 * 20, 1e-10));
        assert.ok(thrust20 > thrust1 * 19, 'Should be greater than 19x');
    });

    it('thrust scales correctly at different distances from sun', () => {
        // At 2 AU, thrust should be 1/4 (inverse square law)
        mockShip.x = 2.0;
        mockShip.y = 0;
        mockShip.z = 0;

        mockShip.sail.sailCount = 1;
        const thrust1at2AU = getCurrentThrustAccel(mockShip);

        mockShip.sail.sailCount = 6;
        const thrust6at2AU = getCurrentThrustAccel(mockShip);

        assert.ok(approxEqual(thrust6at2AU, thrust1at2AU * 6, 1e-10));
    });

    it('produces consistent results with combined sail parameters', () => {
        mockShip.sail.sailCount = 8;
        mockShip.sail.deploymentPercent = 75;
        mockShip.sail.angle = Math.PI / 6;        // 30 degrees yaw
        mockShip.sail.pitchAngle = Math.PI / 12;  // 15 degrees pitch
        mockShip.sail.condition = 90;

        const thrust = getCurrentThrustAccel(mockShip);
        assert.ok(thrust > 0, 'Thrust should be positive with combined parameters');

        // Verify it's less than face-on, full deployment
        mockShip.sail.angle = 0;
        mockShip.sail.pitchAngle = 0;
        mockShip.sail.deploymentPercent = 100;
        mockShip.sail.condition = 100;
        const maxThrust = getCurrentThrustAccel(mockShip);

        assert.ok(thrust < maxThrust, 'Angled/partial deployment should produce less thrust');
    });
});

describe('sailCount physics validation', () => {
    let mockShip;

    beforeEach(() => {
        mockShip = {
            x: 1.0,
            y: 0,
            z: 0,
            orbitalElements: {
                a: 1.0,
                e: 0.0,
                i: 0.0,
                Ω: 0,
                ω: 0,
                M0: 0,
                epoch: 2451545.0,
                μ: 1.32712440018e20
            },
            mass: DEFAULT_SHIP_MASS,
            sail: {
                area: 1000000,
                reflectivity: 0.9,
                angle: 0,
                pitchAngle: 0,
                deploymentPercent: 100,
                condition: 100,
                sailCount: 1
            }
        };
    });

    it('thrust increases monotonically with sail count', () => {
        let previousThrust = 0;

        for (let count = 1; count <= 20; count++) {
            mockShip.sail.sailCount = count;
            const thrust = getCurrentThrustAccel(mockShip);

            assert.ok(
                thrust > previousThrust,
                `Thrust at count ${count} should be greater than count ${count - 1}`
            );
            previousThrust = thrust;
        }
    });

    it('thrust remains proportional regardless of mass', () => {
        const masses = [5000, 10000, 20000, 50000];

        for (const mass of masses) {
            mockShip.mass = mass;
            mockShip.sail.sailCount = 1;
            const thrust1 = getCurrentThrustAccel(mockShip);

            mockShip.sail.sailCount = 10;
            const thrust10 = getCurrentThrustAccel(mockShip);

            const ratio = thrust10 / thrust1;
            assert.ok(
                approxEqual(ratio, 10, 1e-10),
                `Thrust ratio should be 10x regardless of mass (${mass} kg)`
            );
        }
    });

    it('very small sail count edge case', () => {
        // Test boundary: what happens if someone forces sailCount = 0.1?
        // setSailCount should clamp it, but test direct assignment
        mockShip.sail.sailCount = 0.1;
        const thrust = getCurrentThrustAccel(mockShip);

        mockShip.sail.sailCount = 1;
        const thrust1 = getCurrentThrustAccel(mockShip);

        // With sailCount = 0.1 (if not clamped), thrust should be 1/10th
        assert.ok(approxEqual(thrust, thrust1 * 0.1, 1e-10));
    });

    it('handles floating point precision for large sail counts', () => {
        mockShip.sail.sailCount = 1;
        const thrust1 = getCurrentThrustAccel(mockShip);

        mockShip.sail.sailCount = 20;
        const thrust20 = getCurrentThrustAccel(mockShip);

        // Verify no accumulated floating point error
        const expectedRatio = 20.0;
        const actualRatio = thrust20 / thrust1;

        assert.ok(
            approxEqual(actualRatio, expectedRatio, 1e-9),
            'Should maintain precision at maximum sail count'
        );
    });
});

// Export test runner
export function runAllTests() {
    console.log('Running sail count tests...');
    console.log('Tests are executed via node:test framework');
    console.log('Run with: node --test src/js/data/ships.sailcount.test.js');
}
