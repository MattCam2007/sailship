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
import { getCachedTrajectory, getTrajectoryHash, clearTrajectoryCache, predictTrajectory } from './lib/trajectory-predictor.js';
import { detectIntersections } from './lib/intersectionDetector.js';
import { clearIntersectionCache, trajectoryConfig } from './core/gameState.js';
import { INTERSECTION_CONFIG } from './config.js';

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
    // Uses a HIGH-RESOLUTION trajectory separate from the rendering trajectory
    // for more accurate crossing time detection (reduces "ghost planet jumping").
    //
    // Resolution improvement:
    // - Rendering trajectory: ~150-300 steps (visual density)
    // - Intersection trajectory: ~720+ steps (12 steps/day × 60 days)
    // - Combined with bisection refinement: ~25 second crossing time precision
    //
    // Cache invalidation:
    // - If trajectory hash changes (sail settings, time, etc.) → recalculate
    // - If cache timestamp > 500ms old → recalculate

    let trajectoryHash = getTrajectoryHash();

    // Check if intersection cache needs update
    // FIX: Also recalculate when trajectoryHash is null (trajectory cache expired)
    // This prevents the "hash null window" where intersection detection skips entirely
    // and old ghost planet positions persist
    const needsUpdate = !trajectoryHash || !isIntersectionCacheValid(trajectoryHash);

    if (needsUpdate) {
        const player = getPlayerShip();
        if (player && player.orbitalElements && player.sail) {
            const soiBody = player.soiState?.isInSOI ? player.soiState.currentBody : null;
            const currentTime = getJulianDate();

            // Calculate HIGH-RESOLUTION trajectory for intersection detection
            // This is separate from the rendering trajectory for better accuracy
            const duration = trajectoryConfig.durationDays;
            const rawSteps = Math.round(duration * INTERSECTION_CONFIG.stepsPerDay);
            const intersectionSteps = Math.min(
                INTERSECTION_CONFIG.maxSteps,
                Math.max(INTERSECTION_CONFIG.minSteps, rawSteps)
            );

            const highResTrajectory = predictTrajectory({
                orbitalElements: player.orbitalElements,
                sail: player.sail,
                mass: player.mass || 10000,
                startTime: currentTime,
                duration: duration,
                steps: intersectionSteps,
                soiState: player.soiState,
                extremeFlybyState: player.extremeFlybyState
            });

            // After predictTrajectory, the cache is updated - get fresh hash
            trajectoryHash = getTrajectoryHash();

            if (highResTrajectory && highResTrajectory.length > 1 && trajectoryHash) {
                // Detect orbital crossings using high-resolution trajectory
                const intersections = detectIntersections(
                    highResTrajectory,
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
