/**
 * Main entry point - Solar Sail Ship Navigation Game
 */

import { updateCelestialPositions, celestialBodies } from './data/celestialBodies.js';
import { ships, getPlayerShip, updateNPCShips, initializePlayerShip } from './data/ships.js';
import { generateFlightPath } from './core/navigation.js';
import {
    advanceTime,
    timeScale,
    setFocusTarget,
    getJulianDate,
    getIntersectionCache,
    setIntersectionCache,
    isIntersectionCacheValid,
    loadBodyFilters
} from './core/gameState.js';
import { setCameraFollow, updateCameraTarget } from './core/camera.js';
import { initRenderer, render, clearGradientCache } from './ui/renderer.js';
import { initUI, updateUI } from './ui/uiUpdater.js';
import { initControls, updateAutoPilot, initMobileControls } from './ui/controls.js';
import { initMobilePanels } from './ui/ui-components.js';
import { updateShipPhysics } from './core/shipPhysics.js';
import { getCachedTrajectory, getTrajectoryHash, clearTrajectoryCache } from './lib/trajectory-predictor.js';
import { detectIntersections } from './lib/intersectionDetector.js';
import { clearIntersectionCache } from './core/gameState.js';

// Get canvas element
const navCanvas = document.getElementById('navCanvas');

// ============================================================================
// Periodic Memory Cleanup System
// ============================================================================

// Frame counter for periodic cleanup
let frameCount = 0;

// Cleanup interval: 3600 frames = 60 seconds @ 60fps
const CLEANUP_INTERVAL = 3600;

/**
 * Perform periodic memory cleanup.
 * Clears all caches and resets canvas state to release GPU resources.
 */
function performMemoryCleanup() {
    // Clear all caches
    clearTrajectoryCache();
    clearIntersectionCache();
    clearGradientCache();

    // Get canvas context for state reset
    const ctx = navCanvas.getContext('2d');
    if (ctx) {
        // Canvas state reset releases GPU resources
        ctx.save();
        ctx.restore();
    }

    console.log('[MEMORY] Periodic cleanup performed (frame ' + frameCount + ')');
}

/**
 * Update all game state
 */
function updatePositions() {
    advanceTime();

    // Update celestial body positions (reads Julian date from gameState)
    updateCelestialPositions();

    // Update autopilot (adjusts sail settings before physics)
    updateAutoPilot(timeScale);

    // Update player ship with orbital mechanics and sail physics
    const player = getPlayerShip();

    if (player) {
        // Physics-based update using orbital mechanics
        updateShipPhysics(player, timeScale);
    }
    
    // Update NPC ships (drift)
    updateNPCShips(timeScale);

    // Regenerate flight path (for destination info display)
    generateFlightPath();

    // ========================================================================
    // ORBIT INTERSECTION DETECTION (Encounter Markers Feature)
    // ========================================================================
    // Detects when predicted trajectory crosses planetary orbital paths.
    // Results cached and synchronized with trajectory hash to prevent redundant
    // calculations (intersection detection is ~5ms, trajectory prediction is ~2ms).
    //
    // Cache invalidation:
    // - If trajectory hash changes (sail settings, time, etc.) → recalculate
    // - If cache timestamp > 500ms old → recalculate
    //
    // Rendering: drawIntersectionMarkers() in renderer.js shows ghost planets
    // at their actual positions when trajectory crosses their orbits.

    const trajectory = getCachedTrajectory();

    if (trajectory && trajectory.length > 0) {
        const trajectoryHash = getTrajectoryHash();

        // Check if intersection cache needs update
        if (!isIntersectionCacheValid(trajectoryHash)) {
            const player = getPlayerShip();
            if (player) {
                const soiBody = player.soiState.isInSOI ? player.soiState.currentBody : null;

                // Detect orbital crossings and get planet positions at crossing times
                const currentTime = getJulianDate();

                const intersections = detectIntersections(
                    trajectory,
                    celestialBodies,
                    currentTime,
                    soiBody
                );

                // Store with trajectory hash for synchronization
                setIntersectionCache(trajectoryHash, intersections);
            }
        }
    }
}

/**
 * Main game loop
 */
function gameLoop() {
    // Increment frame counter
    frameCount++;

    // Periodic memory cleanup
    if (frameCount % CLEANUP_INTERVAL === 0) {
        performMemoryCleanup();
    }

    updatePositions();
    updateCameraTarget(celestialBodies, ships);
    render();
    updateUI();
    requestAnimationFrame(gameLoop);
}

/**
 * Initialize the game
 */
function init() {
    // Load body filter state from localStorage
    loadBodyFilters();

    // Initialize renderer
    initRenderer(navCanvas);

    // Initialize UI
    initUI();

    // Initialize controls
    initControls(navCanvas);

    // Initialize mobile UI
    initMobilePanels();
    initMobileControls();

    // Initialize player ship orbital elements
    initializePlayerShip();

    // Generate initial flight path
    generateFlightPath();

    // Default focus to player ship
    const player = getPlayerShip();
    if (player) {
        setFocusTarget(player.name);
        setCameraFollow(player.name);
    }

    // Start game loop
    gameLoop();
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
