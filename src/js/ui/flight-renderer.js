/**
 * Flight View Renderer
 * Renders first-person perspective from ship cockpit
 */

import { flightCamera, projectPerspective, calculateAngularSize, getCameraDirection } from '../core/flight-camera.js';
import { celestialBodies, getVisibleBodies } from '../data/celestialBodies.js';
import { ships, getPlayerShip } from '../data/ships.js';
import { BODY_DISPLAY } from '../config.js';
import { getJulianDate } from '../core/gameState.js';

let canvas, ctx;
let canvasWidth, canvasHeight;

/**
 * Initialize the flight renderer
 */
export function initFlightRenderer(canvasElement) {
    if (!canvasElement) {
        throw new Error('[FLIGHT_RENDERER] Canvas element is null!');
    }

    canvas = canvasElement;
    ctx = canvas.getContext('2d');

    resizeFlightCanvas();
    window.addEventListener('resize', resizeFlightCanvas);

    console.log('[FLIGHT_RENDERER] Initialized');
}

/**
 * Resize canvas to fill container
 */
function resizeFlightCanvas() {
    if (!canvas) return;
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    canvasWidth = canvas.width;
    canvasHeight = canvas.height;
}

/**
 * Main render function
 */
export function renderFlightView() {
    if (!canvas || !ctx) return;

    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;

    // Clear to space black
    ctx.fillStyle = '#000008';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Draw starfield
    drawStarfield();

    // Collect and project all objects
    const renderList = [];

    // Add celestial bodies
    const visibleBodies = getVisibleBodies ? getVisibleBodies() : celestialBodies;
    for (const body of visibleBodies) {
        if (body.x === undefined) continue;

        const projected = projectPerspective(
            body.x, body.y, body.z,
            centerX, centerY, canvasHeight
        );

        if (projected) {
            const display = BODY_DISPLAY[body.name];
            const pixelRadius = display
                ? calculateAngularSize(display.physicalRadiusKm || 1000, projected.depth, canvasHeight)
                : 4;

            renderList.push({
                type: 'body',
                name: body.name,
                projected,
                pixelRadius: Math.max(2, pixelRadius),
                color: display?.color || '#ffffff',
                isStar: body.name === 'SOL'
            });
        }
    }

    // Add other ships (not player)
    for (const ship of ships) {
        if (ship.isPlayer) continue;
        if (ship.x === undefined) continue;

        const projected = projectPerspective(
            ship.x, ship.y, ship.z,
            centerX, centerY, canvasHeight
        );

        if (projected) {
            renderList.push({
                type: 'ship',
                name: ship.name,
                projected,
                pixelRadius: Math.max(4, 10 * projected.scale),
                color: ship.color || '#00ff00'
            });
        }
    }

    // Depth sort (furthest first for painter's algorithm)
    renderList.sort((a, b) => {
        const depthDiff = b.projected.depth - a.projected.depth;
        if (Math.abs(depthDiff) > 1e-10) return depthDiff;
        return a.name.localeCompare(b.name);
    });

    // Render all objects
    for (const item of renderList) {
        if (item.type === 'body') {
            drawCelestialBody(item);
        } else if (item.type === 'ship') {
            drawShip(item);
        }
    }

    // HUD overlay (always on top)
    drawHUD();
}

/**
 * Draw simple starfield background
 */
function drawStarfield() {
    // Generate deterministic stars based on camera direction
    const dir = getCameraDirection();
    const seed = Math.floor((dir.x * 1000 + dir.y * 100 + dir.z * 10) * 1000);

    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 200; i++) {
        // Pseudo-random based on seed
        const r1 = Math.sin(seed + i * 1.1) * 0.5 + 0.5;
        const r2 = Math.sin(seed + i * 2.3 + 100) * 0.5 + 0.5;
        const r3 = Math.sin(seed + i * 3.7 + 200) * 0.5 + 0.5;

        const x = r1 * canvasWidth;
        const y = r2 * canvasHeight;
        const size = r3 * 1.5 + 0.5;
        const alpha = r3 * 0.5 + 0.3;

        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

/**
 * Draw a celestial body
 */
function drawCelestialBody(item) {
    const { projected, pixelRadius, color, isStar, name } = item;

    if (isStar) {
        drawSun(projected.x, projected.y, Math.max(pixelRadius, 20));
    } else {
        // Planet with shading
        const gradient = ctx.createRadialGradient(
            projected.x - pixelRadius * 0.3,
            projected.y - pixelRadius * 0.3,
            0,
            projected.x, projected.y,
            pixelRadius * 1.2
        );
        gradient.addColorStop(0, lightenColor(color, 30));
        gradient.addColorStop(0.5, color);
        gradient.addColorStop(1, darkenColor(color, 40));

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(projected.x, projected.y, pixelRadius, 0, Math.PI * 2);
        ctx.fill();
    }

    // Label
    if (pixelRadius > 3) {
        ctx.font = '10px "Share Tech Mono", monospace';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.fillText(name, projected.x + pixelRadius + 5, projected.y + 3);

        // Distance
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.fillText(`${projected.depth.toFixed(2)} AU`, projected.x + pixelRadius + 5, projected.y + 15);
    }
}

/**
 * Draw the Sun with corona
 */
function drawSun(x, y, radius) {
    // Corona glow
    const corona = ctx.createRadialGradient(x, y, radius, x, y, radius * 4);
    corona.addColorStop(0, 'rgba(255, 200, 100, 0.6)');
    corona.addColorStop(0.3, 'rgba(255, 150, 50, 0.3)');
    corona.addColorStop(0.6, 'rgba(255, 100, 0, 0.1)');
    corona.addColorStop(1, 'rgba(255, 100, 0, 0)');
    ctx.fillStyle = corona;
    ctx.beginPath();
    ctx.arc(x, y, radius * 4, 0, Math.PI * 2);
    ctx.fill();

    // Sun body
    const sunGradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    sunGradient.addColorStop(0, '#ffffff');
    sunGradient.addColorStop(0.2, '#ffffcc');
    sunGradient.addColorStop(0.5, '#ffee88');
    sunGradient.addColorStop(0.8, '#ffdd44');
    sunGradient.addColorStop(1, '#ff9922');
    ctx.fillStyle = sunGradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
}

/**
 * Draw a ship marker
 */
function drawShip(item) {
    const { projected, pixelRadius, color, name } = item;
    const size = Math.max(4, pixelRadius);

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(projected.x, projected.y - size);
    ctx.lineTo(projected.x + size * 0.6, projected.y);
    ctx.lineTo(projected.x, projected.y + size);
    ctx.lineTo(projected.x - size * 0.6, projected.y);
    ctx.closePath();
    ctx.fill();

    ctx.font = '10px "Share Tech Mono", monospace';
    ctx.fillStyle = color;
    ctx.fillText(name, projected.x + size + 5, projected.y + 3);
}

/**
 * Draw HUD overlay
 */
function drawHUD() {
    const player = getPlayerShip();
    if (!player) return;

    ctx.font = '12px "Share Tech Mono", monospace';

    // Ship info panel (top left)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(15, 50, 180, 100);
    ctx.strokeStyle = 'rgba(76, 232, 141, 0.5)';
    ctx.strokeRect(15, 50, 180, 100);

    ctx.fillStyle = '#4ce88d';
    ctx.fillText(`SHIP: ${player.name}`, 25, 70);

    // Velocity
    if (player.velocity) {
        const vMag = Math.sqrt(
            player.velocity.x ** 2 +
            player.velocity.y ** 2 +
            player.velocity.z ** 2
        ) * 1731.46;  // AU/day to km/s
        ctx.fillText(`VEL: ${vMag.toFixed(1)} km/s`, 25, 90);
    }

    // Distance from Sun
    const r = Math.sqrt(player.x ** 2 + player.y ** 2 + player.z ** 2);
    ctx.fillText(`DIST: ${r.toFixed(3)} AU`, 25, 110);

    // SOI
    const soi = player.soiState?.isInSOI ? player.soiState.currentBody : 'HELIOCENTRIC';
    ctx.fillText(`SOI: ${soi}`, 25, 130);

    // Sail panel (bottom right)
    if (player.sail) {
        const panelX = canvasWidth - 200;
        const panelY = canvasHeight - 120;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(panelX, panelY, 185, 100);
        ctx.strokeStyle = 'rgba(232, 93, 76, 0.5)';
        ctx.strokeRect(panelX, panelY, 185, 100);

        ctx.fillStyle = '#e85d4c';
        ctx.fillText('SAIL CONTROL', panelX + 10, panelY + 20);

        ctx.fillStyle = '#4ce88d';
        const yawDeg = ((player.sail.angle || 0) * 180 / Math.PI).toFixed(0);
        const pitchDeg = ((player.sail.pitchAngle || 0) * 180 / Math.PI).toFixed(0);
        ctx.fillText(`YAW: ${yawDeg}°`, panelX + 10, panelY + 45);
        ctx.fillText(`PITCH: ${pitchDeg}°`, panelX + 100, panelY + 45);
        ctx.fillText(`DEPLOY: ${player.sail.deploymentPercent || 100}%`, panelX + 10, panelY + 65);
        ctx.fillText(`COND: ${player.sail.condition || 100}%`, panelX + 100, panelY + 65);
    }

    // Crosshair
    const cx = canvasWidth / 2;
    const cy = canvasHeight / 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 25, cy);
    ctx.lineTo(cx - 8, cy);
    ctx.moveTo(cx + 8, cy);
    ctx.lineTo(cx + 25, cy);
    ctx.moveTo(cx, cy - 25);
    ctx.lineTo(cx, cy - 8);
    ctx.moveTo(cx, cy + 8);
    ctx.lineTo(cx, cy + 25);
    ctx.stroke();

    // Small circle
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.stroke();

    // FOV indicator
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fillText(`FOV: ${flightCamera.fov}°`, canvasWidth - 80, canvasHeight - 130);
}

// Helper: Lighten color
function lightenColor(hex, percent) {
    const num = parseInt(hex.replace('#', ''), 16);
    const R = Math.min(255, (num >> 16) + Math.round(2.55 * percent));
    const G = Math.min(255, ((num >> 8) & 0xFF) + Math.round(2.55 * percent));
    const B = Math.min(255, (num & 0xFF) + Math.round(2.55 * percent));
    return `#${(1 << 24 | R << 16 | G << 8 | B).toString(16).slice(1)}`;
}

// Helper: Darken color
function darkenColor(hex, percent) {
    const num = parseInt(hex.replace('#', ''), 16);
    const R = Math.max(0, (num >> 16) - Math.round(2.55 * percent));
    const G = Math.max(0, ((num >> 8) & 0xFF) - Math.round(2.55 * percent));
    const B = Math.max(0, (num & 0xFF) - Math.round(2.55 * percent));
    return `#${(1 << 24 | R << 16 | G << 8 | B).toString(16).slice(1)}`;
}
