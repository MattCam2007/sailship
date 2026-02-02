/**
 * Flight View Entry Point
 *
 * CRITICAL: Only ONE game loop runs when flight.html is loaded.
 * main.js does NOT run - separate page isolation.
 */

import { updateCelestialPositions, celestialBodies } from './data/celestialBodies.js';
import { ships, getPlayerShip, initializePlayerShip } from './data/ships.js';
import { advanceTime, timeScale, loadBodyFilters, getDisplayOption } from './core/gameState.js';
import { updateShipPhysics } from './core/shipPhysics.js';
import { initFlightCamera, updateCameraFromShip } from './core/flight-camera.js';
import { initFlightRenderer, renderFlightView } from './ui/flight-renderer.js';
import { initFlightControls } from './ui/flight-controls.js';

const flightCanvas = document.getElementById('flightCanvas');
let gameLoopId = null;

/**
 * Update all game state (same physics as main.js)
 */
function updatePositions() {
    advanceTime();
    updateCelestialPositions();

    const player = getPlayerShip();
    if (player) {
        updateShipPhysics(player, timeScale);
    }
}

/**
 * Main game loop
 */
function gameLoop() {
    updatePositions();

    const player = getPlayerShip();
    if (player) {
        updateCameraFromShip(player);
    }

    renderFlightView();
    gameLoopId = requestAnimationFrame(gameLoop);
}

/**
 * Start game loop
 */
function startGameLoop() {
    if (gameLoopId !== null) return;
    gameLoopId = requestAnimationFrame(gameLoop);
}

/**
 * Stop game loop
 */
function stopGameLoop() {
    if (gameLoopId !== null) {
        cancelAnimationFrame(gameLoopId);
        gameLoopId = null;
    }
}

/**
 * Initialize flight view
 */
function init() {
    console.log('[FLIGHT] Initializing flight view...');

    if (!flightCanvas) {
        console.error('[FLIGHT] Canvas element #flightCanvas not found!');
        document.body.innerHTML = '<h1 style="color: #e85d4c; font-family: monospace; padding: 20px;">Error: Flight canvas not found</h1>';
        return;
    }

    loadBodyFilters();
    initializePlayerShip();

    initFlightCamera(flightCanvas);
    initFlightRenderer(flightCanvas);
    initFlightControls(flightCanvas);

    startGameLoop();
    console.log('[FLIGHT] Flight view initialized');
}

// Cleanup on page unload
window.addEventListener('beforeunload', stopGameLoop);
window.addEventListener('pagehide', stopGameLoop);

// Start when DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
