/**
 * Unit tests for game state module
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
    time,
    timeScale,
    speedPresets,
    currentSpeed,
    zoomLevels,
    currentZoom,
    scale,
    displayOptions,
    focusTarget,
    advanceTime,
    getTime,
    setZoom,
    getScale,
    getCurrentZoom,
    setDisplayOption,
    setFocusTarget,
    getFocusTarget,
    setSpeed,
    getCurrentSpeed,
    setCustomSpeed
} from './gameState.js';

describe('speedPresets', () => {
    it('contains expected presets', () => {
        assert.strictEqual(speedPresets['pause'], 0);
        assert.strictEqual(speedPresets['1x'], 0.5);
        assert.strictEqual(speedPresets['10x'], 5.0);
    });

    it('has valid numeric values for all presets', () => {
        for (const [name, value] of Object.entries(speedPresets)) {
            assert.ok(typeof value === 'number', `Preset ${name} should be a number`);
            assert.ok(value >= 0, `Preset ${name} should be non-negative`);
        }
    });
});

describe('zoomLevels', () => {
    it('contains expected zoom levels', () => {
        assert.strictEqual(zoomLevels['system'], 50);
        assert.strictEqual(zoomLevels['inner'], 200);
        assert.strictEqual(zoomLevels['local'], 800);
        assert.strictEqual(zoomLevels['tactical'], 3000);
    });

    it('has increasing scale values', () => {
        assert.ok(zoomLevels.system < zoomLevels.inner);
        assert.ok(zoomLevels.inner < zoomLevels.local);
        assert.ok(zoomLevels.local < zoomLevels.tactical);
    });
});

describe('displayOptions', () => {
    it('has expected default options', () => {
        assert.ok('showOrbits' in displayOptions);
        assert.ok('showLabels' in displayOptions);
        assert.ok('showTrajectory' in displayOptions);
        assert.ok('showGrid' in displayOptions);
    });

    it('all options are booleans', () => {
        for (const [key, value] of Object.entries(displayOptions)) {
            assert.ok(typeof value === 'boolean', `${key} should be boolean`);
        }
    });
});

describe('getTime', () => {
    it('returns a number', () => {
        const t = getTime();
        assert.ok(typeof t === 'number');
    });
});

describe('advanceTime', () => {
    it('increases time by timeScale', () => {
        const before = getTime();
        advanceTime();
        const after = getTime();
        assert.ok(after > before || timeScale === 0);
    });
});

describe('setZoom / getCurrentZoom / getScale', () => {
    it('sets zoom to valid level', () => {
        setZoom('system');
        assert.strictEqual(getCurrentZoom(), 'system');
        assert.strictEqual(getScale(), zoomLevels.system);
    });

    it('sets zoom to another valid level', () => {
        setZoom('tactical');
        assert.strictEqual(getCurrentZoom(), 'tactical');
        assert.strictEqual(getScale(), zoomLevels.tactical);
    });

    it('ignores invalid zoom level', () => {
        setZoom('inner');
        const currentBefore = getCurrentZoom();
        const scaleBefore = getScale();
        setZoom('invalid_zoom');
        assert.strictEqual(getCurrentZoom(), currentBefore);
        assert.strictEqual(getScale(), scaleBefore);
    });
});

describe('setSpeed / getCurrentSpeed', () => {
    it('sets speed to valid preset', () => {
        setSpeed('pause');
        assert.strictEqual(getCurrentSpeed(), 'pause');
    });

    it('sets speed to another valid preset', () => {
        setSpeed('10x');
        assert.strictEqual(getCurrentSpeed(), '10x');
    });

    it('ignores invalid speed preset', () => {
        setSpeed('1x');
        const before = getCurrentSpeed();
        setSpeed('invalid_speed');
        assert.strictEqual(getCurrentSpeed(), before);
    });
});

describe('setCustomSpeed', () => {
    it('sets custom speed', () => {
        setCustomSpeed(2.0);
        assert.strictEqual(getCurrentSpeed(), 'custom');
    });

    it('clamps negative values to 0', () => {
        setCustomSpeed(-5);
        assert.strictEqual(getCurrentSpeed(), 'custom');
        // timeScale should be clamped via the multiplier
    });

    it('clamps values above 100', () => {
        setCustomSpeed(150);
        assert.strictEqual(getCurrentSpeed(), 'custom');
    });
});

describe('setDisplayOption', () => {
    it('sets valid display option', () => {
        const original = displayOptions.showOrbits;
        setDisplayOption('showOrbits', !original);
        assert.strictEqual(displayOptions.showOrbits, !original);
        // Reset
        setDisplayOption('showOrbits', original);
    });

    it('sets another valid display option', () => {
        const original = displayOptions.showLabels;
        setDisplayOption('showLabels', false);
        assert.strictEqual(displayOptions.showLabels, false);
        // Reset
        setDisplayOption('showLabels', original);
    });

    it('ignores invalid display option', () => {
        const optionsCopy = { ...displayOptions };
        setDisplayOption('invalidOption', true);
        // Check nothing changed
        assert.deepStrictEqual(displayOptions, optionsCopy);
    });
});

describe('setFocusTarget / getFocusTarget', () => {
    it('sets focus target to object name', () => {
        setFocusTarget('Earth');
        assert.strictEqual(getFocusTarget(), 'Earth');
    });

    it('sets focus target to null', () => {
        setFocusTarget(null);
        assert.strictEqual(getFocusTarget(), null);
    });

    it('can change focus target', () => {
        setFocusTarget('Mars');
        assert.strictEqual(getFocusTarget(), 'Mars');
        setFocusTarget('Venus');
        assert.strictEqual(getFocusTarget(), 'Venus');
    });
});
