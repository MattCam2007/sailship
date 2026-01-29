/**
 * Unit tests for camera module
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
    camera,
    setCameraFollow,
    stopFollowing,
    updateCameraTarget,
    project3D
} from './camera.js';

const TOLERANCE = 1e-6;

function approxEqual(actual, expected, tolerance = TOLERANCE) {
    return Math.abs(actual - expected) < tolerance;
}

describe('camera state', () => {
    beforeEach(() => {
        // Reset camera state before each test
        camera.angleX = 15 * Math.PI / 180;
        camera.angleZ = 0;
        camera.zoom = 1;
        camera.target.x = 0;
        camera.target.y = 0;
        camera.target.z = 0;
        camera.followTarget = null;
    });

    it('has default angle values', () => {
        assert.ok(approxEqual(camera.angleX, 15 * Math.PI / 180, 1e-10));
        assert.strictEqual(camera.angleZ, 0);
    });

    it('has default zoom of 1', () => {
        assert.strictEqual(camera.zoom, 1);
    });

    it('has default target at origin', () => {
        assert.strictEqual(camera.target.x, 0);
        assert.strictEqual(camera.target.y, 0);
        assert.strictEqual(camera.target.z, 0);
    });
});

describe('setCameraFollow', () => {
    beforeEach(() => {
        camera.target.x = 5;
        camera.target.y = 5;
        camera.target.z = 5;
        camera.followTarget = null;
    });

    it('sets followTarget to object name', () => {
        setCameraFollow('Earth');
        assert.strictEqual(camera.followTarget, 'Earth');
    });

    it('resets target to origin when set to null', () => {
        camera.target.x = 5;
        camera.target.y = 5;
        camera.target.z = 5;
        setCameraFollow(null);
        assert.strictEqual(camera.followTarget, null);
        assert.strictEqual(camera.target.x, 0);
        assert.strictEqual(camera.target.y, 0);
        assert.strictEqual(camera.target.z, 0);
    });

    it('does not reset target when setting to a name', () => {
        camera.target.x = 5;
        setCameraFollow('Mars');
        assert.strictEqual(camera.target.x, 5); // Target not reset until updateCameraTarget
    });
});

describe('stopFollowing', () => {
    beforeEach(() => {
        camera.followTarget = 'Earth';
        camera.target.x = 1.5;
        camera.target.y = 0;
        camera.target.z = 0;
    });

    it('clears followTarget', () => {
        stopFollowing();
        assert.strictEqual(camera.followTarget, null);
    });

    it('preserves current target position', () => {
        stopFollowing();
        assert.strictEqual(camera.target.x, 1.5);
        assert.strictEqual(camera.target.y, 0);
        assert.strictEqual(camera.target.z, 0);
    });
});

describe('updateCameraTarget', () => {
    const celestialBodies = [
        { name: 'Sun', x: 0, y: 0, z: 0 },
        { name: 'Earth', x: 1.0, y: 0, z: 0 },
        { name: 'Mars', x: 1.5, y: 0.3, z: 0.1 }
    ];

    const ships = [
        { name: 'PlayerShip', x: 0.9, y: 0.1, z: 0 },
        { name: 'Cargo1', x: 2.0, y: 0, z: 0 }
    ];

    beforeEach(() => {
        camera.target.x = 0;
        camera.target.y = 0;
        camera.target.z = 0;
        camera.followTarget = null;
    });

    it('does nothing when followTarget is null', () => {
        updateCameraTarget(celestialBodies, ships);
        assert.strictEqual(camera.target.x, 0);
        assert.strictEqual(camera.target.y, 0);
        assert.strictEqual(camera.target.z, 0);
    });

    it('updates target to celestial body position', () => {
        camera.followTarget = 'Earth';
        updateCameraTarget(celestialBodies, ships);
        assert.strictEqual(camera.target.x, 1.0);
        assert.strictEqual(camera.target.y, 0);
        assert.strictEqual(camera.target.z, 0);
    });

    it('updates target to ship position', () => {
        camera.followTarget = 'PlayerShip';
        updateCameraTarget(celestialBodies, ships);
        assert.strictEqual(camera.target.x, 0.9);
        assert.strictEqual(camera.target.y, 0.1);
        assert.strictEqual(camera.target.z, 0);
    });

    it('prioritizes celestial bodies over ships with same name', () => {
        const bodiesWithShipName = [...celestialBodies, { name: 'PlayerShip', x: 100, y: 100, z: 100 }];
        camera.followTarget = 'PlayerShip';
        updateCameraTarget(bodiesWithShipName, ships);
        // Should find celestial body first
        assert.strictEqual(camera.target.x, 100);
    });

    it('handles non-existent target gracefully', () => {
        camera.followTarget = 'NonExistent';
        camera.target.x = 5;
        updateCameraTarget(celestialBodies, ships);
        // Target unchanged if object not found
        assert.strictEqual(camera.target.x, 5);
    });
});

describe('project3D', () => {
    beforeEach(() => {
        camera.angleX = 0;
        camera.angleZ = 0;
        camera.zoom = 1;
        camera.target.x = 0;
        camera.target.y = 0;
        camera.target.z = 0;
    });

    it('projects origin to screen center', () => {
        const result = project3D(0, 0, 0, 400, 300, 100);
        assert.strictEqual(result.x, 400);
        assert.strictEqual(result.y, 300);
    });

    it('applies scale factor correctly', () => {
        const result = project3D(1, 0, 0, 400, 300, 100);
        // With no rotation, x=1 AU at scale 100 pixels/AU → +100 pixels
        assert.strictEqual(result.x, 500);
        assert.strictEqual(result.y, 300);
    });

    it('applies zoom factor correctly', () => {
        camera.zoom = 2;
        const result = project3D(1, 0, 0, 400, 300, 100);
        // With zoom=2, x=1 AU at scale 100 → +200 pixels
        assert.strictEqual(result.x, 600);
    });

    it('flips Y axis for screen coordinates', () => {
        const result = project3D(0, 1, 0, 400, 300, 100);
        // Y=1 should project to y < 300 (up on screen)
        assert.ok(result.y < 300);
    });

    it('offsets by camera target', () => {
        camera.target.x = 1;
        camera.target.y = 0;
        camera.target.z = 0;
        const result = project3D(1, 0, 0, 400, 300, 100);
        // Object at (1,0,0) with target at (1,0,0) should appear at center
        assert.strictEqual(result.x, 400);
        assert.strictEqual(result.y, 300);
    });

    it('returns depth for z-sorting', () => {
        const resultFront = project3D(0, 0, 1, 400, 300, 100);
        const resultBack = project3D(0, 0, -1, 400, 300, 100);
        assert.ok(typeof resultFront.depth === 'number');
        // With no rotation, z=1 should have different depth than z=-1
        assert.notStrictEqual(resultFront.depth, resultBack.depth);
    });

    it('rotates around Z axis correctly', () => {
        camera.angleZ = Math.PI / 2; // 90°
        const result = project3D(1, 0, 0, 400, 300, 100);
        // After 90° rotation around Z, (1,0,0) becomes (0,1,0)
        // Then Y=1 projects up (negative screen Y)
        assert.ok(approxEqual(result.x, 400, 1));
        assert.ok(result.y < 300);
    });

    it('rotates around X axis (tilt) correctly', () => {
        camera.angleX = Math.PI / 2; // 90° tilt
        const result = project3D(0, 0, 1, 400, 300, 100);
        // After 90° X rotation, z becomes -y in view space
        // This affects the y coordinate of projection
        assert.ok(approxEqual(result.x, 400, 1));
    });

    it('handles combined transformations', () => {
        camera.angleX = Math.PI / 6; // 30°
        camera.angleZ = Math.PI / 4; // 45°
        camera.zoom = 1.5;
        camera.target.x = 0.5;
        const result = project3D(1.5, 0.5, 0.2, 400, 300, 100);
        // Just verify it returns valid coordinates
        assert.ok(typeof result.x === 'number' && !isNaN(result.x));
        assert.ok(typeof result.y === 'number' && !isNaN(result.y));
        assert.ok(typeof result.depth === 'number' && !isNaN(result.depth));
    });
});
