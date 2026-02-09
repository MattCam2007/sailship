/**
 * Main entry point - Solar Sail Ship Navigation Game
 */

import { updateCelestialPositions, celestialBodies } from './data/celestialBodies.js';
import { ships, getPlayerShip, initializePlayerShip } from './data/ships.js';
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
import { clearPlanetTextureCache } from './lib/planetTextures.js';
import { initUI, updateUI } from './ui/uiUpdater.js';
import { initControls, updateAutoPilot, initMobileControls } from './ui/controls.js';
import { initMobilePanels } from './ui/ui-components.js';
import { updateShipPhysics } from './core/shipPhysics.js';
import { getCachedTrajectory, getTrajectoryHash, clearTrajectoryCache, predictTrajectory } from './lib/trajectory-predictor.js';
import { detectIntersections, detectClosestApproaches, detectNodeCrossings } from './lib/intersectionDetector.js';
import {
    clearIntersectionCache,
    trajectoryConfig,
    setClosestApproachCache,
    isClosestApproachCacheValid,
    clearClosestApproachCache,
    setNodeCrossingsCache,
    isNodeCrossingsCacheValid,
    clearNodeCrossingsCache
} from './core/gameState.js';
import { destination } from './core/navigation.js';
import { getBodyByName } from './data/celestialBodies.js';
import { INTERSECTION_CONFIG, SOI_RADII } from './config.js';
import { initThemeEngine } from './core/themeEngine.js';
import { initThemeSelector } from './ui/themeSelector.js';

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
    clearClosestApproachCache();
    clearNodeCrossingsCache();
    clearGradientCache();
    clearPlanetTextureCache();

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

                // Detect closest approaches to all bodies
                // This answers "what's my minimum distance to each planet?"
                const closestApproaches = detectClosestApproaches(
                    highResTrajectory,
                    celestialBodies,
                    currentTime
                );
                setClosestApproachCache(trajectoryHash, closestApproaches);

                // ============================================================
                // CLOSEST APPROACH GHOST REFINEMENT
                // ============================================================
                // For near encounters, the closest approach position is more
                // accurate than the radius-crossing position. When the closest
                // approach distance is significantly better than the radius
                // crossing distance for the same body, use the closest approach
                // data for the ghost planet position.
                //
                // This fixes the "ghost says CLOSE but I miss" problem: radius
                // crossing ghosts show where the planet is when you cross its
                // orbital radius, but the closest approach shows where the
                // planet is when you're actually nearest to it.
                for (const intersection of intersections) {
                    const ca = closestApproaches.find(c => c.bodyName === intersection.bodyName);
                    if (!ca) continue;

                    const soiRadius = SOI_RADII[intersection.bodyName] || 0.01;
                    // Only refine when encounter is within 10x SOI (navigation-relevant range)
                    if (ca.minDistance < soiRadius * 10 && ca.minDistance < intersection.distance) {
                        // Use closest approach position and time for this ghost
                        intersection.bodyPosition = ca.bodyPos;
                        intersection.trajectoryPosition = ca.shipPos;
                        intersection.distance = ca.minDistance;
                        intersection.time = ca.time;

                        // Recalculate angular separation with refined positions
                        const shipMag = Math.sqrt(
                            ca.shipPos.x ** 2 + ca.shipPos.y ** 2 + ca.shipPos.z ** 2
                        );
                        const planetMag = Math.sqrt(
                            ca.bodyPos.x ** 2 + ca.bodyPos.y ** 2 + ca.bodyPos.z ** 2
                        );
                        if (shipMag > 1e-10 && planetMag > 1e-10) {
                            const dotProd = ca.shipPos.x * ca.bodyPos.x +
                                            ca.shipPos.y * ca.bodyPos.y +
                                            ca.shipPos.z * ca.bodyPos.z;
                            const cosAngle = Math.max(-1, Math.min(1, dotProd / (shipMag * planetMag)));
                            intersection.angularSeparation = Math.acos(cosAngle);
                            const cross = ca.shipPos.x * ca.bodyPos.y - ca.shipPos.y * ca.bodyPos.x;
                            intersection.isAhead = cross > 0;
                        }
                    }
                }

                // Store refined intersections with trajectory hash for synchronization
                setIntersectionCache(trajectoryHash, intersections);

                // Detect node crossings for the current destination
                // Shows where trajectory crosses target's orbital plane (optimal for plane changes)
                const targetBody = getBodyByName(destination);
                if (targetBody && targetBody.elements && !isNodeCrossingsCacheValid(trajectoryHash, destination)) {
                    const nodeCrossings = detectNodeCrossings(
                        highResTrajectory,
                        targetBody.elements,
                        currentTime
                    );
                    setNodeCrossingsCache(trajectoryHash, destination, nodeCrossings);
                }
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
async function init() {
    // Initialize theme engine first (loads saved theme)
    await initThemeEngine();

    // Initialize theme selector UI
    initThemeSelector();

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
