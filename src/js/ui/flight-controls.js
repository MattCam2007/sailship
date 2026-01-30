/**
 * Flight View Controls
 * Handles input for cockpit view - separate from main controls.js
 */

import { flightCamera, rotateCamera, resetCameraView } from '../core/flight-camera.js';
import { getPlayerShip } from '../data/ships.js';
import { isAutoPilotEnabled } from '../core/gameState.js';

const dragState = {
    isDragging: false,
    lastX: 0,
    lastY: 0
};

/**
 * Initialize flight controls
 */
export function initFlightControls(canvas) {
    if (!canvas) {
        console.error('[FLIGHT_CONTROLS] Canvas is null!');
        return;
    }

    initMouseControls(canvas);
    initKeyboardControls();

    console.log('[FLIGHT_CONTROLS] Initialized');
}

/**
 * Mouse controls for camera rotation
 */
function initMouseControls(canvas) {
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    // Scroll: Adjust FOV
    canvas.addEventListener('wheel', e => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 5 : -5;
        flightCamera.fov = Math.max(10, Math.min(120, flightCamera.fov + delta));
    }, { passive: false });

    // Mouse down: Start drag
    canvas.addEventListener('mousedown', e => {
        if (e.button === 0) {
            dragState.isDragging = true;
            dragState.lastX = e.clientX;
            dragState.lastY = e.clientY;
            canvas.style.cursor = 'grabbing';
        }
    });

    // Mouse move: Rotate camera
    canvas.addEventListener('mousemove', e => {
        if (!dragState.isDragging) return;

        const deltaX = e.clientX - dragState.lastX;
        const deltaY = e.clientY - dragState.lastY;

        const sensitivity = 0.003;
        rotateCamera(-deltaX * sensitivity, -deltaY * sensitivity);

        dragState.lastX = e.clientX;
        dragState.lastY = e.clientY;
    });

    // Mouse up: Stop drag
    canvas.addEventListener('mouseup', () => {
        dragState.isDragging = false;
        canvas.style.cursor = 'crosshair';
    });

    canvas.addEventListener('mouseleave', () => {
        dragState.isDragging = false;
        canvas.style.cursor = 'crosshair';
    });
}

/**
 * Keyboard controls
 */
function initKeyboardControls() {
    document.addEventListener('keydown', e => {
        // Camera controls
        switch (e.key.toLowerCase()) {
            case 'r':
                if (!e.ctrlKey && !e.metaKey) {
                    resetCameraView();
                }
                return;
            case 'escape':
                window.location.href = 'index.html';
                return;
        }

        // Sail controls (disabled during autopilot)
        if (isAutoPilotEnabled && isAutoPilotEnabled()) return;

        const player = getPlayerShip();
        if (!player || !player.sail) return;

        switch (e.key) {
            case '[':
                player.sail.angle = (player.sail.angle || 0) - 5 * Math.PI / 180;
                break;
            case ']':
                player.sail.angle = (player.sail.angle || 0) + 5 * Math.PI / 180;
                break;
            case '{':
                player.sail.pitchAngle = (player.sail.pitchAngle || 0) - 5 * Math.PI / 180;
                break;
            case '}':
                player.sail.pitchAngle = (player.sail.pitchAngle || 0) + 5 * Math.PI / 180;
                break;
            case '-':
                player.sail.deploymentPercent = Math.max(0, (player.sail.deploymentPercent || 100) - 10);
                break;
            case '=':
                player.sail.deploymentPercent = Math.min(100, (player.sail.deploymentPercent || 100) + 10);
                break;
        }
    });
}
