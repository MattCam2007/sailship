/**
 * Unit tests for sail count in orbital maneuvers
 *
 * Tests the calculateSailThrust function with sail count multiplier
 * and mass scaling (diminishing returns from additional sail mass).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
    calculateSailThrust,
    getSolarPressure,
    ACCEL_CONVERSION,
    SOLAR_PRESSURE_1AU
} from './orbital-maneuvers.js';
import { SAIL_MASS_PER_UNIT } from '../config.js';

const TOLERANCE = 1e-6;

function approxEqual(actual, expected, tolerance = TOLERANCE) {
    return Math.abs(actual - expected) < tolerance;
}

function vectorMagnitude(v) {
    return Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2);
}

/**
 * Expected acceleration ratio for N sails vs 1 sail.
 * With mass scaling: thrust scales by N, but mass increases too.
 * ratio = N * shipMass / (shipMass + max(0, N - 1) * SAIL_MASS_PER_UNIT)
 */
function expectedRatio(sailCount, shipMass) {
    return sailCount * shipMass / (shipMass + Math.max(0, sailCount - 1) * SAIL_MASS_PER_UNIT);
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

    it('scales thrust with mass-adjusted ratio for sailCount = 2', () => {
        const shipMass = 10000;
        baseSailState.sailCount = 1;
        const thrust1 = calculateSailThrust(baseSailState, position, velocity, 1.0, shipMass);

        baseSailState.sailCount = 2;
        const thrust2 = calculateSailThrust(baseSailState, position, velocity, 1.0, shipMass);

        const ratio = expectedRatio(2, shipMass);
        assert.ok(approxEqual(thrust2.x, thrust1.x * ratio, 1e-10));
        assert.ok(approxEqual(thrust2.y, thrust1.y * ratio, 1e-10));
        assert.ok(approxEqual(thrust2.z, thrust1.z * ratio, 1e-10));
    });

    it('shows diminishing returns for sail counts 1-20', () => {
        const shipMass = 10000;
        baseSailState.sailCount = 1;
        const thrust1 = calculateSailThrust(baseSailState, position, velocity, 1.0, shipMass);
        const baseMagnitude = vectorMagnitude(thrust1);

        for (let count = 2; count <= 20; count++) {
            baseSailState.sailCount = count;
            const thrust = calculateSailThrust(baseSailState, position, velocity, 1.0, shipMass);
            const magnitude = vectorMagnitude(thrust);
            const ratio = expectedRatio(count, shipMass);
            const expected = baseMagnitude * ratio;

            assert.ok(
                approxEqual(magnitude, expected, 1e-10),
                `Thrust magnitude with ${count} sails should be ${ratio.toFixed(4)}x baseline (mass-scaled)`
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
        const shipMass = 10000;
        baseSailState.angle = Math.PI / 4;  // 45 degrees
        baseSailState.sailCount = 1;
        const thrust1 = calculateSailThrust(baseSailState, position, velocity, 1.0, shipMass);

        baseSailState.sailCount = 8;
        const thrust8 = calculateSailThrust(baseSailState, position, velocity, 1.0, shipMass);

        const mag1 = vectorMagnitude(thrust1);
        const mag8 = vectorMagnitude(thrust8);
        const ratio = expectedRatio(8, shipMass);

        assert.ok(approxEqual(mag8, mag1 * ratio, 1e-10));
    });

    it('works with pitch angle', () => {
        const shipMass = 10000;
        baseSailState.pitchAngle = Math.PI / 6;  // 30 degrees
        baseSailState.sailCount = 1;
        const thrust1 = calculateSailThrust(baseSailState, position, velocity, 1.0, shipMass);

        baseSailState.sailCount = 12;
        const thrust12 = calculateSailThrust(baseSailState, position, velocity, 1.0, shipMass);

        const mag1 = vectorMagnitude(thrust1);
        const mag12 = vectorMagnitude(thrust12);
        const ratio = expectedRatio(12, shipMass);

        assert.ok(approxEqual(mag12, mag1 * ratio, 1e-10));
    });

    it('works with combined yaw and pitch angles', () => {
        const shipMass = 10000;
        baseSailState.angle = Math.PI / 6;       // 30 degrees yaw
        baseSailState.pitchAngle = Math.PI / 9;  // 20 degrees pitch
        baseSailState.sailCount = 1;
        const thrust1 = calculateSailThrust(baseSailState, position, velocity, 1.0, shipMass);

        baseSailState.sailCount = 7;
        const thrust7 = calculateSailThrust(baseSailState, position, velocity, 1.0, shipMass);

        const mag1 = vectorMagnitude(thrust1);
        const mag7 = vectorMagnitude(thrust7);
        const ratio = expectedRatio(7, shipMass);

        assert.ok(approxEqual(mag7, mag1 * ratio, 1e-10));
    });

    it('works with partial deployment', () => {
        const shipMass = 10000;
        baseSailState.deploymentPercent = 50;
        baseSailState.sailCount = 1;
        const thrust1 = calculateSailThrust(baseSailState, position, velocity, 1.0, shipMass);

        baseSailState.sailCount = 6;
        const thrust6 = calculateSailThrust(baseSailState, position, velocity, 1.0, shipMass);

        const mag1 = vectorMagnitude(thrust1);
        const mag6 = vectorMagnitude(thrust6);
        const ratio = expectedRatio(6, shipMass);

        assert.ok(approxEqual(mag6, mag1 * ratio, 1e-10));
    });

    it('works with degraded sail condition', () => {
        const shipMass = 10000;
        baseSailState.condition = 75;
        baseSailState.sailCount = 1;
        const thrust1 = calculateSailThrust(baseSailState, position, velocity, 1.0, shipMass);

        baseSailState.sailCount = 9;
        const thrust9 = calculateSailThrust(baseSailState, position, velocity, 1.0, shipMass);

        const mag1 = vectorMagnitude(thrust1);
        const mag9 = vectorMagnitude(thrust9);
        const ratio = expectedRatio(9, shipMass);

        assert.ok(approxEqual(mag9, mag1 * ratio, 1e-10));
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
        const shipMass = 10000;
        const distance2AU = 2.0;
        baseSailState.sailCount = 1;
        const thrust1 = calculateSailThrust(baseSailState, position, velocity, distance2AU, shipMass);

        baseSailState.sailCount = 11;
        const thrust11 = calculateSailThrust(baseSailState, position, velocity, distance2AU, shipMass);

        const mag1 = vectorMagnitude(thrust1);
        const mag11 = vectorMagnitude(thrust11);
        const ratio = expectedRatio(11, shipMass);

        assert.ok(approxEqual(mag11, mag1 * ratio, 1e-10));
    });

    it('mass scaling produces different ratios for different ship masses', () => {
        const lightShip = 5000;   // kg
        const heavyShip = 50000;  // kg

        baseSailState.sailCount = 1;
        const thrustLight1 = calculateSailThrust(baseSailState, position, velocity, 1.0, lightShip);
        const thrustHeavy1 = calculateSailThrust(baseSailState, position, velocity, 1.0, heavyShip);

        baseSailState.sailCount = 5;
        const thrustLight5 = calculateSailThrust(baseSailState, position, velocity, 1.0, lightShip);
        const thrustHeavy5 = calculateSailThrust(baseSailState, position, velocity, 1.0, heavyShip);

        // Verify each scales by its expected mass-adjusted ratio
        const lightRatio = vectorMagnitude(thrustLight5) / vectorMagnitude(thrustLight1);
        const heavyRatio = vectorMagnitude(thrustHeavy5) / vectorMagnitude(thrustHeavy1);

        assert.ok(approxEqual(lightRatio, expectedRatio(5, lightShip), 1e-10),
            `Light ship ratio should be ${expectedRatio(5, lightShip).toFixed(4)}`);
        assert.ok(approxEqual(heavyRatio, expectedRatio(5, heavyShip), 1e-10),
            `Heavy ship ratio should be ${expectedRatio(5, heavyShip).toFixed(4)}`);

        // Heavy ship should benefit MORE from extra sails (less mass penalty proportionally)
        assert.ok(heavyRatio > lightRatio,
            'Heavier ship should get better ratio from extra sails');
    });

    it('produces mass-scaled maximum thrust at sailCount = 20', () => {
        const shipMass = 10000;
        baseSailState.sailCount = 20;
        const thrustMax = calculateSailThrust(baseSailState, position, velocity, 1.0, shipMass);
        const magMax = vectorMagnitude(thrustMax);

        baseSailState.sailCount = 1;
        const thrust1 = calculateSailThrust(baseSailState, position, velocity, 1.0, shipMass);
        const mag1 = vectorMagnitude(thrust1);

        const ratio = expectedRatio(20, shipMass);
        assert.ok(approxEqual(magMax, mag1 * ratio, 1e-10));
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

    it('handles fractional sailCount values with mass scaling', () => {
        const shipMass = 10000;
        baseSailState.sailCount = 2.5;
        const thrustFractional = calculateSailThrust(baseSailState, position, velocity, 1.0, shipMass);

        baseSailState.sailCount = 1;
        const thrust1 = calculateSailThrust(baseSailState, position, velocity, 1.0, shipMass);

        const magFractional = vectorMagnitude(thrustFractional);
        const mag1 = vectorMagnitude(thrust1);
        const ratio = expectedRatio(2.5, shipMass);

        assert.ok(approxEqual(magFractional, mag1 * ratio, 1e-10));
    });

    it('handles very large sailCount values with mass scaling', () => {
        const shipMass = 10000;
        baseSailState.sailCount = 1000;
        const thrustLarge = calculateSailThrust(baseSailState, position, velocity, 1.0, shipMass);

        baseSailState.sailCount = 1;
        const thrust1 = calculateSailThrust(baseSailState, position, velocity, 1.0, shipMass);

        const magLarge = vectorMagnitude(thrustLarge);
        const mag1 = vectorMagnitude(thrust1);
        const ratio = expectedRatio(1000, shipMass);

        assert.ok(approxEqual(magLarge, mag1 * ratio, 1e-8));
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
        const shipMass = 10000;
        baseSailState.sailCount = 1;
        const thrust1 = calculateSailThrust(baseSailState, position, velocity, 1.0, shipMass);
        const mag1 = vectorMagnitude(thrust1);

        baseSailState.sailCount = 20;
        const thrust20 = calculateSailThrust(baseSailState, position, velocity, 1.0, shipMass);
        const mag20 = vectorMagnitude(thrust20);

        const ratio = mag20 / mag1;
        const expected = expectedRatio(20, shipMass);

        assert.ok(approxEqual(ratio, expected, 1e-12));
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
        const shipMass = 10000;
        const complexSailState = {
            area: 3e6,                    // 3 km²
            reflectivity: 0.85,           // 85%
            angle: Math.PI / 8,           // 22.5 degrees yaw
            pitchAngle: Math.PI / 12,     // 15 degrees pitch
            deploymentPercent: 80,        // 80% deployed
            condition: 95,                // 95% condition
            sailCount: 1
        };

        const thrust1 = calculateSailThrust(complexSailState, position, velocity, 1.0, shipMass);
        const mag1 = vectorMagnitude(thrust1);

        complexSailState.sailCount = 13;
        const thrust13 = calculateSailThrust(complexSailState, position, velocity, 1.0, shipMass);
        const mag13 = vectorMagnitude(thrust13);

        const ratio = expectedRatio(13, shipMass);
        assert.ok(approxEqual(mag13, mag1 * ratio, 1e-10));
    });

    it('sailCount multiplies thrust and scales mass together', () => {
        const shipMass = 10000;
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
        const thrust1 = calculateSailThrust(sailState, position, velocity, 1.0, shipMass);

        // Now set sailCount = 4 and recalculate
        sailState.sailCount = 4;
        const thrust4 = calculateSailThrust(sailState, position, velocity, 1.0, shipMass);

        // All components should scale by mass-adjusted ratio
        const ratio = expectedRatio(4, shipMass);
        assert.ok(approxEqual(thrust4.x, thrust1.x * ratio, 1e-10));
        assert.ok(approxEqual(thrust4.y, thrust1.y * ratio, 1e-10));
        assert.ok(approxEqual(thrust4.z, thrust1.z * ratio, 1e-10));
    });

    it('works in different orbital positions and velocities', () => {
        const shipMass = 10000;
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
            const thrust1 = calculateSailThrust(sailState, pos, vel, distance, shipMass);

            sailState.sailCount = 16;
            const thrust16 = calculateSailThrust(sailState, pos, vel, distance, shipMass);

            const mag1 = vectorMagnitude(thrust1);
            const mag16 = vectorMagnitude(thrust16);
            const ratio = expectedRatio(16, shipMass);

            assert.ok(
                approxEqual(mag16, mag1 * ratio, 1e-10),
                `Should scale correctly at position ${i}`
            );
        }
    });
});

describe('mass scaling diminishing returns', () => {
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

    it('each additional sail gives less marginal acceleration', () => {
        const shipMass = 10000;
        let prevAccel = 0;
        let prevMarginal = Infinity;

        for (let count = 1; count <= 20; count++) {
            baseSailState.sailCount = count;
            const thrust = calculateSailThrust(baseSailState, position, velocity, 1.0, shipMass);
            const accel = vectorMagnitude(thrust);
            const marginal = accel - prevAccel;

            if (count > 2) {
                assert.ok(marginal < prevMarginal,
                    `Marginal gain from sail ${count} (${marginal.toExponential(3)}) should be less than sail ${count - 1} (${prevMarginal.toExponential(3)})`);
            }

            prevMarginal = marginal;
            prevAccel = accel;
        }
    });

    it('5 sails gives roughly 1.92x, not 5x', () => {
        const shipMass = 10000;
        baseSailState.sailCount = 1;
        const thrust1 = calculateSailThrust(baseSailState, position, velocity, 1.0, shipMass);
        const mag1 = vectorMagnitude(thrust1);

        baseSailState.sailCount = 5;
        const thrust5 = calculateSailThrust(baseSailState, position, velocity, 1.0, shipMass);
        const mag5 = vectorMagnitude(thrust5);

        const ratio = mag5 / mag1;
        const expected = expectedRatio(5, shipMass);
        // 5 * 10000 / (10000 + 4 * 4000) = 50000 / 26000 ≈ 1.923
        assert.ok(approxEqual(ratio, expected, 1e-6));
        assert.ok(ratio < 2.0, '5 sails should give less than 2x acceleration');
        assert.ok(ratio > 1.9, '5 sails should give more than 1.9x acceleration');
    });

    it('heavier hull mass reduces diminishing returns effect', () => {
        // With a 100,000 kg hull, additional sail mass (4000 kg each) is less significant
        const heavyShip = 100000;
        baseSailState.sailCount = 1;
        const thrust1 = calculateSailThrust(baseSailState, position, velocity, 1.0, heavyShip);
        const mag1 = vectorMagnitude(thrust1);

        baseSailState.sailCount = 5;
        const thrust5 = calculateSailThrust(baseSailState, position, velocity, 1.0, heavyShip);
        const mag5 = vectorMagnitude(thrust5);

        const ratio = mag5 / mag1;
        // 5 * 100000 / (100000 + 4 * 4000) = 500000 / 116000 ≈ 4.31
        // Much closer to linear 5x than the 1.92x for a 10,000 kg ship
        assert.ok(ratio > 4.0, `Heavy ship should get ratio > 4.0, got ${ratio.toFixed(4)}`);
        assert.ok(ratio < 5.0, `Heavy ship should still be less than linear 5.0`);
    });
});

// Export test runner
export function runAllTests() {
    console.log('Running orbital-maneuvers sail count tests...');
    console.log('Tests are executed via node:test framework');
    console.log('Run with: node --test src/js/lib/orbital-maneuvers.sailcount.test.js');
}
