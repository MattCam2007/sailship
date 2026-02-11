/**
 * Canvas rendering functions
 */

import { camera, project3D } from '../core/camera.js';
import { celestialBodies, getBodyDisplay, getVisibleBodies } from '../data/celestialBodies.js';
import { ships, getPlayerShip } from '../data/ships.js';
import { flightPath, destination } from '../core/navigation.js';
import {
    displayOptions,
    trajectoryConfig,
    getScale,
    getTime,
    getJulianDate,
    getIntersectionCache,
    getNodeCrossingsCache,
    bodyFilters
} from '../core/gameState.js';
import { SOI_RADII, BODY_DISPLAY, SCALE_RENDERING_CONFIG, TRAJECTORY_RENDER_CONFIG, PLANET_TEXTURE_CONFIG, INTERSECTION_CONFIG, RING_CONFIG } from '../config.js';
import { meanMotion, MU_SUN } from '../lib/orbital.js';
import { predictTrajectory } from '../lib/trajectory-predictor.js';
import { drawStarfield, initStarfield } from '../lib/starfield.js';
import { hasTexture, renderPlanetTexture, clearPlanetTextureCache, initPlanetTextures } from '../lib/planetTextures.js';
// Default color palette (formerly from theme engine)
const COLORS = {
    canvas: {
        grid: '#e85d4c',
        gridAlpha: 0.1,
        orbitPrimary: '#e85d4c',
        orbitPrimaryAlpha: 0.3,
        orbitMoon: '#e85d4c',
        orbitMoonAlpha: 0.15,
        shipOrbitElliptic: '#4ce88d',
        shipOrbitEllipticAlpha: 0.5,
        shipOrbitHyperbolic: '#64c8ff',
        shipOrbitHyperbolicAlpha: 0.7,
        shipOrbitSOI: '#4c8de8',
        shipOrbitSOIAlpha: 0.6,
        trajectory: '#c864ff',
        trajectoryAlpha: 0.8,
        trajectoryPoint: '#c864ff',
        label: '#e85d4c',
        labelAlpha: 0.8,
        labelBg: '#0a0a0a',
        labelBgAlpha: 0.7,
    }
};

/**
 * Get a color with optional alpha override
 * @param {string} path - Dot-separated path to color (e.g., 'canvas.grid')
 * @param {number} [alpha] - Optional alpha override (0-1)
 * @returns {string} - Color in rgba(...) or rgb(...) format
 */
function getColor(path, alpha = null) {
    const parts = path.split('.');
    let color = COLORS;
    for (const part of parts) {
        color = color?.[part];
    }

    if (!color) {
        console.warn(`Color not found: ${path}, using fallback`);
        color = COLORS.canvas.grid;
    }

    // Check for alpha property
    const alphaProp = path + 'Alpha';
    const parts2 = alphaProp.split('.');
    let defaultAlpha = COLORS;
    for (const part of parts2) {
        defaultAlpha = defaultAlpha?.[part];
    }

    const finalAlpha = alpha ?? defaultAlpha ?? 1;

    // Parse hex color to RGB
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    if (finalAlpha === 1) {
        return `rgb(${r}, ${g}, ${b})`;
    }
    return `rgba(${r}, ${g}, ${b}, ${finalAlpha})`;
}

let canvas, ctx;

// Debug flag for renderer logging
let rendererDebugEnabled = false;
let rendererFrameCount = 0;

// SOI rendering diagnostics - tracks orbit type changes for player
let lastRenderedOrbitType = null;
let lastRenderedSOIState = false;

// ============================================================================
// Gradient Cache System
// ============================================================================

// Gradient cache to reuse gradient objects across frames
const gradientCache = new Map();
const MAX_CACHE_SIZE = 100;

// Cache statistics for debugging
let cacheHits = 0;
let cacheMisses = 0;

/**
 * Enable/disable renderer debug logging.
 * Call from console: window.setRendererDebug(true)
 */
export function setRendererDebug(enabled) {
    rendererDebugEnabled = enabled;
    rendererFrameCount = 0;
    console.log(`[RENDERER_DEBUG] ${enabled ? 'ENABLED' : 'DISABLED'}`);
}
if (typeof window !== 'undefined') {
    window.setRendererDebug = setRendererDebug;
}

/**
 * Clear the gradient cache.
 * Called on canvas resize and during periodic memory cleanup.
 */
export function clearGradientCache() {
    const size = gradientCache.size;
    gradientCache.clear();
    cacheHits = 0;
    cacheMisses = 0;

    if (rendererDebugEnabled || size > 0) {
        console.log(`[GRADIENT_CACHE] Cleared ${size} cached gradients`);
    }
}

/**
 * Get gradient cache statistics for debugging.
 * Call from console: window.getGradientCacheStats()
 */
export function getGradientCacheStats() {
    return {
        size: gradientCache.size,
        maxSize: MAX_CACHE_SIZE,
        hits: cacheHits,
        misses: cacheMisses,
        hitRate: cacheHits + cacheMisses > 0
            ? (cacheHits / (cacheHits + cacheMisses) * 100).toFixed(1) + '%'
            : 'N/A'
    };
}
if (typeof window !== 'undefined') {
    window.getGradientCacheStats = getGradientCacheStats;
}

/**
 * Get or create a cached gradient.
 *
 * @param {string} key - Unique cache key for this gradient
 * @param {function} createFn - Function that creates the gradient if not cached
 * @returns {CanvasGradient} Cached or newly created gradient
 */
function getCachedGradient(key, createFn) {
    // Check cache first
    if (gradientCache.has(key)) {
        cacheHits++;
        return gradientCache.get(key);
    }

    // Cache miss - create new gradient
    cacheMisses++;
    const gradient = createFn();

    // Enforce max cache size with LRU eviction
    if (gradientCache.size >= MAX_CACHE_SIZE) {
        // Remove oldest entry (first key in Map)
        const firstKey = gradientCache.keys().next().value;
        gradientCache.delete(firstKey);

        if (rendererDebugEnabled) {
            console.log(`[GRADIENT_CACHE] Evicted oldest entry: ${firstKey}`);
        }
    }

    // Store in cache
    gradientCache.set(key, gradient);

    if (rendererDebugEnabled) {
        console.log(`[GRADIENT_CACHE] Created and cached: ${key}`);
    }

    return gradient;
}

/**
 * Initialize the renderer
 * @param {HTMLCanvasElement} canvasElement
 */
export function initRenderer(canvasElement) {
    canvas = canvasElement;
    ctx = canvas.getContext('2d');
    resizeCanvas();

    // Initialize starfield (loads star catalog asynchronously)
    initStarfield();

    // Initialize planet texture system (WebGL offscreen renderer)
    initPlanetTextures();

    // Debounced resize handler to prevent cache thrashing
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            resizeCanvas();
            clearPlanetTextureCache();
        }, 300); // 300ms debounce
    });

    // Handle WebGL context loss (GPU driver crash/reset)
    canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        clearGradientCache();
        clearPlanetTextureCache();
        console.warn('[RENDERER] WebGL context lost, caches cleared');
    });

    canvas.addEventListener('webglcontextrestored', () => {
        console.log('[RENDERER] WebGL context restored');
    });

}

/**
 * Resize canvas to fit container and clear gradient cache
 */
export function resizeCanvas() {
    if (!canvas) return;
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    // Clear gradient cache on resize (gradients are position-dependent)
    clearGradientCache();
}

/**
 * Get canvas dimensions
 * @returns {{width: number, height: number}}
 */
export function getCanvasDimensions() {
    return { width: canvas.width, height: canvas.height };
}

// ============================================================================
// Scale-Based Rendering System
// ============================================================================

/**
 * Linear interpolation between two values.
 * @param {number} a - Start value
 * @param {number} b - End value
 * @param {number} t - Interpolation factor (0-1)
 * @returns {number} Interpolated value
 */
function lerp(a, b, t) {
    return a + (b - a) * t;
}

/**
 * Calculate physically-scaled radius in screen pixels.
 * Converts physical radius (km) to screen pixels based on current zoom and scale.
 *
 * @param {number} radiusKm - Physical radius in kilometers
 * @param {number} scale - Current scale (pixels per AU)
 * @returns {number} Radius in screen pixels
 */
function calculateScaledRadius(radiusKm, scale) {
    const { kmToAU } = SCALE_RENDERING_CONFIG;

    // km → AU → screen pixels
    const radiusAU = radiusKm * kmToAU;
    return radiusAU * scale * camera.zoom;
}

/**
 * Calculate blend factor for transitioning between fixed and scaled rendering.
 * Uses smoothstep (hermite interpolation) for smooth visual transitions.
 *
 * @param {number} screenSize - Current screen size in pixels
 * @returns {number} Blend factor (0 = pure fixed, 1 = pure scaled)
 */
function calculateBlendFactor(screenSize) {
    const { minScreenSize, maxScreenSize } = SCALE_RENDERING_CONFIG;

    if (screenSize <= minScreenSize) return 0.0; // Pure fixed
    if (screenSize >= maxScreenSize) return 1.0; // Pure scaled

    // Smooth hermite interpolation (smoothstep)
    const t = (screenSize - minScreenSize) / (maxScreenSize - minScreenSize);
    return t * t * (3 - 2 * t);
}

/**
 * Calculate final screen radius for a celestial body.
 * Blends between fixed pixel size (when small) and physically-scaled size (when large).
 *
 * @param {Object} body - Celestial body object
 * @param {number} scale - Current scale (pixels per AU)
 * @returns {number} Final radius in screen pixels
 */
function calculateScreenRadius(body, scale) {
    const display = getBodyDisplay(body);

    // Sun always uses scaled rendering
    if (body.name === 'SOL') {
        return calculateScaledRadius(display.physicalRadiusKm, scale);
    }

    // Calculate scaled radius
    const scaledRadius = calculateScaledRadius(display.physicalRadiusKm, scale);

    // Determine current screen size (larger of fixed or scaled)
    const currentSize = Math.max(display.radius, scaledRadius);

    // Get blend factor based on screen size
    const blendFactor = calculateBlendFactor(currentSize);

    // Interpolate between fixed and scaled
    return lerp(display.radius, scaledRadius, blendFactor);
}

/**
 * Draw the grid overlay
 * Grid always radiates from Sun (origin) regardless of camera target
 */
function drawGrid(centerX, centerY, scale) {
    if (!displayOptions.showGrid) return;

    // Project Sun position (always at origin) to get grid center
    const sunProjected = project3D(0, 0, 0, centerX, centerY, scale);

    // Fade calculation for edges
    const fadeStart = Math.min(canvas.width, canvas.height) * 0.35;
    const fadeEnd = Math.min(canvas.width, canvas.height) * 0.5;

    // Helper to calculate alpha based on distance from sun
    function getAlpha(x, y) {
        const dx = x - sunProjected.x;
        const dy = y - sunProjected.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < fadeStart) return 0.1;
        if (dist > fadeEnd) return 0.02;

        const fadeRatio = (dist - fadeStart) / (fadeEnd - fadeStart);
        return 0.1 - (fadeRatio * 0.08);
    }

    ctx.lineWidth = 1;

    // Concentric circles for distance reference (centered on Sun)
    const maxRadius = Math.max(canvas.width, canvas.height) * 2;
    let ringCount = 0;
    for (let r = scale; r < maxRadius; r += scale) {
        ringCount++;
        const pixelRadius = r * camera.zoom;

        // Calculate alpha at this radius
        const edgeX = sunProjected.x + pixelRadius;
        const alpha = getAlpha(edgeX, sunProjected.y);

        // Slightly brighter for 1 AU marks
        const is1AU = (ringCount % 1 === 0 && r === scale);
        const finalAlpha = is1AU ? alpha * 1.5 : alpha;

        ctx.strokeStyle = getColor('canvas.grid', finalAlpha);
        ctx.beginPath();
        ctx.arc(sunProjected.x, sunProjected.y, pixelRadius, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Radial lines from Sun
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 6) {
        const endX = sunProjected.x + Math.cos(angle) * maxRadius;
        const endY = sunProjected.y + Math.sin(angle) * maxRadius;

        // Create gradient along the line for fade (cached)
        // Round positions to 2 decimals to prevent floating-point cache misses
        const cacheKey = `linear_${sunProjected.x.toFixed(2)}_${sunProjected.y.toFixed(2)}_${endX.toFixed(2)}_${endY.toFixed(2)}_${fadeStart.toFixed(2)}_${fadeEnd.toFixed(2)}_${maxRadius.toFixed(2)}`;

        const gradient = getCachedGradient(cacheKey, () => {
            const grad = ctx.createLinearGradient(
                sunProjected.x, sunProjected.y,
                endX, endY
            );
            grad.addColorStop(0, getColor('canvas.grid', 0.1));
            grad.addColorStop(fadeStart / maxRadius, getColor('canvas.grid', 0.1));
            grad.addColorStop(fadeEnd / maxRadius, getColor('canvas.grid', 0.02));
            grad.addColorStop(1, getColor('canvas.grid', 0));
            return grad;
        });

        ctx.strokeStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(sunProjected.x, sunProjected.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();
    }
}

/**
 * Draw an orbital path using Keplerian elements.
 * Draws the full ellipse with proper orientation in 3D space.
 */
function drawOrbit(body, centerX, centerY, scale) {
    if (!displayOptions.showOrbits || !body.elements) return;

    // Filter to show only target orbit when enabled
    if (displayOptions.showTargetOrbitOnly) {
        // Show orbit if: body is destination, body is parent of destination, or destination is a moon of this body
        const isTarget = body.name === destination;
        const isTargetParent = body.name === celestialBodies.find(b => b.name === destination)?.parent;
        const targetBody = celestialBodies.find(b => b.name === destination);
        const isParentOfTarget = targetBody && targetBody.parent === body.name;

        if (!isTarget && !isTargetParent && !isParentOfTarget) return;
    }

    const { a, e, i, Ω, ω } = body.elements;

    // ZOOM-ADAPTIVE SEGMENTS: At high zoom, increase segment count for smooth curves
    // This prevents ghost planets from appearing off the orbital path at tactical zoom
    const effectiveZoom = scale * camera.zoom;
    const orbitRadiusPixels = a * effectiveZoom;
    const orbitCircumPixels = 2 * Math.PI * orbitRadiusPixels;

    // Zoom-adaptive segment cap: use higher resolution at tactical zoom (>5x) for precision
    // At tactical zoom, planets appear offset from paths with 512 segments due to discretization error
    // 2048 segments reduces offset from ~10px to <2px, critical for encounter marker alignment
    const maxSegments = camera.zoom > 5 ? 2048 : 512;
    const segments = Math.max(64, Math.min(maxSegments, Math.ceil(orbitCircumPixels / 20)));

    ctx.strokeStyle = body.type === 'moon' ? getColor('canvas.orbitMoon') : getColor('canvas.orbitPrimary');
    ctx.lineWidth = body.type === 'moon' ? 0.5 : 1;
    ctx.setLineDash([]);
    
    // Get parent position for moons
    let parentX = 0, parentY = 0, parentZ = 0;
    if (body.parent) {
        const parent = celestialBodies.find(b => b.name === body.parent);
        if (parent) {
            parentX = parent.x;
            parentY = parent.y;
            parentZ = parent.z;
        }
    }
    
    // Precompute rotation matrix components
    const cosΩ = Math.cos(Ω);
    const sinΩ = Math.sin(Ω);
    const cosω = Math.cos(ω);
    const sinω = Math.sin(ω);
    const cosi = Math.cos(i);
    const sini = Math.sin(i);
    
    ctx.beginPath();
    for (let j = 0; j <= segments; j++) {
        // True anomaly sweeps full orbit
        const trueAnomaly = (j / segments) * Math.PI * 2;
        
        // Orbital radius at this true anomaly
        const r = e < 1e-10 ? a : (a * (1 - e * e)) / (1 + e * Math.cos(trueAnomaly));
        
        // Position in orbital plane
        const xOrbital = r * Math.cos(trueAnomaly);
        const yOrbital = r * Math.sin(trueAnomaly);
        
        // Rotate to ecliptic frame (same as orbital.js rotateToEcliptic)
        const x = parentX + xOrbital * (cosΩ * cosω - sinΩ * sinω * cosi) 
                         - yOrbital * (cosΩ * sinω + sinΩ * cosω * cosi);
        const y = parentY + xOrbital * (sinΩ * cosω + cosΩ * sinω * cosi) 
                         - yOrbital * (sinΩ * sinω - cosΩ * cosω * cosi);
        const z = parentZ + xOrbital * (sinω * sini) 
                         + yOrbital * (cosω * sini);
        
        const projected = project3D(x, y, z, centerX, centerY, scale);
        
        if (j === 0) {
            ctx.moveTo(projected.x, projected.y);
        } else {
            ctx.lineTo(projected.x, projected.y);
        }
    }
    ctx.stroke();
}

/**
 * Helper: Lighten a hex color
 */
function lightenColor(hex, percent) {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, (num >> 16) + amt);
    const G = Math.min(255, ((num >> 8) & 0x00FF) + amt);
    const B = Math.min(255, (num & 0x0000FF) + amt);
    return `#${(1 << 24 | R << 16 | G << 8 | B).toString(16).slice(1)}`;
}

/**
 * Helper: Darken a hex color
 */
function darkenColor(hex, percent) {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max(0, (num >> 16) - amt);
    const G = Math.max(0, ((num >> 8) & 0x00FF) - amt);
    const B = Math.max(0, (num & 0x0000FF) - amt);
    return `#${(1 << 24 | R << 16 | G << 8 | B).toString(16).slice(1)}`;
}

/**
 * Draw SOI boundary for the targeted (destination) planet only.
 * Scales correctly with camera zoom.
 */
function drawSOIBoundaries(centerX, centerY, scale) {
    if (!displayOptions.showOrbits) return;
    if (!destination) return;

    const soiRadius = SOI_RADII[destination];
    if (!soiRadius) return;

    const body = celestialBodies.find(b => b.name === destination);
    if (!body) return;

    const projected = project3D(body.x, body.y, body.z, centerX, centerY, scale);
    const pixelRadius = soiRadius * scale * camera.zoom;

    // Only draw if radius is at least visible on screen
    if (pixelRadius < 3) return;

    const display = getBodyDisplay(body);

    // Draw SOI circle
    ctx.strokeStyle = `${display.color}66`;  // 40% opacity
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(projected.x, projected.y, pixelRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw SOI label at top of circle
    if (pixelRadius > 20) {
        ctx.font = '10px monospace';
        ctx.fillStyle = `${display.color}88`;  // 53% opacity
        ctx.textAlign = 'center';
        const soiKm = (soiRadius * 149597870.7).toFixed(0);
        const label = `SOI ${Number(soiKm).toLocaleString()} km`;
        ctx.fillText(label, projected.x, projected.y - pixelRadius - 6);
        ctx.textAlign = 'left';  // Reset
    }
}

// ============================================================================
// Ring Rendering System
// ============================================================================

/**
 * Compute the projected ring ellipse parameters for a ringed body.
 *
 * The ring lies in the body's equatorial plane, whose normal (pole) is tilted
 * from the ecliptic north by the body's axial tilt. After applying camera
 * rotations, we get the projected ellipse shape on screen.
 *
 * @param {string} bodyName - Name of the body (for axial tilt lookup)
 * @returns {{ rotation: number, cosIncl: number, visible: boolean }}
 *   rotation: angle of ring major axis on screen (radians)
 *   cosIncl: foreshortening factor (0 = edge-on, 1 = face-on)
 *   visible: false if ring is too edge-on to render
 */
function computeRingProjection(bodyName) {
    const tiltDeg = PLANET_TEXTURE_CONFIG.axialTilts[bodyName] || 0;
    const tilt = tiltDeg * Math.PI / 180;

    // Ring pole in ecliptic coordinates (simplified: tilt from ecliptic north)
    // Pole points along +Z (ecliptic north) rotated by tilt around X axis
    let px = 0;
    let py = -Math.sin(tilt);
    let pz = Math.cos(tilt);

    // Apply camera Z rotation (same as project3D)
    const cosZ = Math.cos(camera.angleZ);
    const sinZ = Math.sin(camera.angleZ);
    const px1 = px * cosZ - py * sinZ;
    const py1 = px * sinZ + py * cosZ;

    // Apply camera X rotation (tilt view)
    const cosX = Math.cos(camera.angleX);
    const sinX = Math.sin(camera.angleX);
    const py2 = py1 * cosX - pz * sinX;
    const pz2 = py1 * sinX + pz * cosX;

    // pz2 is the component of the pole pointing toward the camera.
    // |pz2| determines foreshortening: 0 = edge-on, 1 = face-on.
    // The projected pole direction on screen is (px1, -py2) [Y flipped for screen].
    // The ring major axis is perpendicular to the projected pole.

    const cosIncl = Math.abs(pz2);

    // Skip rendering when nearly edge-on (rings are ~10m thick, invisible)
    if (cosIncl < 0.03) {
        return { rotation: 0, cosIncl: 0, visible: false };
    }

    // Ring major axis angle: perpendicular to the projected pole
    const rotation = Math.atan2(-py2, px1) + Math.PI / 2;

    return { rotation, cosIncl, visible: true };
}

/**
 * Draw planetary rings for a body, rendering either the back or front half.
 *
 * Uses canvas ellipse() with clipping to draw half the ring at a time,
 * allowing correct z-ordering (back half behind planet, front half in front).
 *
 * @param {Object} projected - Screen position {x, y}
 * @param {number} screenRadius - Planet screen radius in pixels
 * @param {Object} ringConfig - Ring config from RING_CONFIG
 * @param {Object} ringProj - From computeRingProjection()
 * @param {boolean} drawFront - true for front half, false for back half
 */
function drawRings(projected, screenRadius, ringConfig, ringProj, drawFront) {
    const { rotation, cosIncl } = ringProj;
    const { innerRadius, outerRadius, colorStops } = ringConfig;

    const outerScreenRadius = screenRadius * outerRadius;
    const innerScreenRadius = screenRadius * innerRadius;

    // Compute ring band width in pixels for detail decisions
    const ringWidth = outerScreenRadius - innerScreenRadius;

    ctx.save();

    // Set up clip region for the correct half.
    // We clip along the ring's major axis (the equatorial diameter).
    // Rotate a clip rectangle to align with the ring plane.
    ctx.beginPath();
    const clipSize = outerScreenRadius + 4; // Generous padding
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);

    // Build a half-plane clip region rotated to align with ring major axis.
    // "Front" half is the half closer to camera. The sign of pz2 from
    // computeRingProjection determines which side that is.
    // With our rotation, the clip is simple: one side of the line through center.
    const sign = drawFront ? 1 : -1;

    // Perpendicular to major axis (along the pole projection) determines the half
    const perpX = -sin;
    const perpY = cos;

    // Draw a large clipping polygon covering just one half
    ctx.moveTo(
        projected.x + cos * (-clipSize),
        projected.y + sin * (-clipSize)
    );
    ctx.lineTo(
        projected.x + cos * clipSize,
        projected.y + sin * clipSize
    );
    ctx.lineTo(
        projected.x + cos * clipSize + perpX * sign * clipSize * 2,
        projected.y + sin * clipSize + perpY * sign * clipSize * 2
    );
    ctx.lineTo(
        projected.x + cos * (-clipSize) + perpX * sign * clipSize * 2,
        projected.y + sin * (-clipSize) + perpY * sign * clipSize * 2
    );
    ctx.closePath();
    ctx.clip();

    // Smooth opacity fade near edge-on viewing to prevent flicker
    let edgeFade = 1.0;
    if (cosIncl < 0.15) {
        edgeFade = (cosIncl - 0.03) / 0.12; // Fade from 0.03 to 0.15
    }

    // Draw ring bands using concentric filled ellipses (from outer to inner).
    // We use multiple concentric ellipse fills with per-band colors for a
    // smooth, visually rich ring appearance.
    if (ringWidth > 12) {
        // Detailed rendering: multiple concentric ellipses matching color stops
        drawRingBands(projected, screenRadius, outerScreenRadius, innerScreenRadius,
            rotation, cosIncl, colorStops, edgeFade);
    } else {
        // Simple rendering: single filled ellipse ring for small sizes
        drawRingSimple(projected, outerScreenRadius, innerScreenRadius,
            rotation, cosIncl, colorStops, edgeFade);
    }

    ctx.restore();
}

/**
 * Draw detailed ring bands using multiple concentric ellipse fills.
 * Called when ring is large enough on screen for visible band detail.
 */
function drawRingBands(projected, screenRadius, outerR, innerR, rotation, cosIncl, colorStops, edgeFade) {
    const bandCount = Math.min(colorStops.length - 1, 24); // Cap segments
    const ringWidth = outerR - innerR;

    for (let i = 0; i < bandCount; i++) {
        const stop0 = colorStops[i];
        const stop1 = colorStops[i + 1];

        // Interpolate radius for this band
        const r0 = innerR + stop0[0] * ringWidth;
        const r1 = innerR + stop1[0] * ringWidth;

        // Average color/alpha for this band
        const r = (stop0[1] + stop1[1]) >> 1;
        const g = (stop0[2] + stop1[2]) >> 1;
        const b = (stop0[3] + stop1[3]) >> 1;
        const a = ((stop0[4] + stop1[4]) / 2) * edgeFade;

        if (a < 0.01) continue; // Skip invisible bands

        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
        ctx.beginPath();

        // Outer edge of band
        ctx.ellipse(projected.x, projected.y, r1, r1 * cosIncl, rotation, 0, Math.PI * 2);

        // Inner edge of band (counter-clockwise to create a ring/donut shape)
        ctx.moveTo(
            projected.x + Math.cos(rotation) * r0,
            projected.y + Math.sin(rotation) * r0
        );
        ctx.ellipse(projected.x, projected.y, r0, r0 * cosIncl, rotation, 0, Math.PI * 2, true);

        ctx.fill('evenodd');
    }
}

/**
 * Draw a simple ring as a single filled annulus.
 * Used at small screen sizes where band detail isn't visible.
 */
function drawRingSimple(projected, outerR, innerR, rotation, cosIncl, colorStops, edgeFade) {
    // Use the brightest stop as the ring color
    let maxAlpha = 0;
    let bestStop = colorStops[0];
    for (const stop of colorStops) {
        if (stop[4] > maxAlpha) {
            maxAlpha = stop[4];
            bestStop = stop;
        }
    }

    const a = Math.min(maxAlpha * 0.7, 0.6) * edgeFade; // Slightly muted for small sizes
    if (a < 0.01) return;

    ctx.fillStyle = `rgba(${bestStop[1]}, ${bestStop[2]}, ${bestStop[3]}, ${a.toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(projected.x, projected.y, outerR, outerR * cosIncl, rotation, 0, Math.PI * 2);
    ctx.moveTo(
        projected.x + Math.cos(rotation) * innerR,
        projected.y + Math.sin(rotation) * innerR
    );
    ctx.ellipse(projected.x, projected.y, innerR, innerR * cosIncl, rotation, 0, Math.PI * 2, true);
    ctx.fill('evenodd');
}

/**
 * Draw a celestial body
 */
function drawBody(body, centerX, centerY, scale) {
    const projected = project3D(body.x, body.y, body.z, centerX, centerY, scale);
    const display = getBodyDisplay(body);

    // Calculate screen radius (hybrid fixed/scaled rendering)
    const screenRadius = calculateScreenRadius(body, scale);

    // Enhanced sun rendering
    if (body.name === 'SOL') {
        // Radial gradient for sun body (cached)
        const sunKey = `radial_sun_${projected.x.toFixed(2)}_${projected.y.toFixed(2)}_${screenRadius.toFixed(1)}`;
        const gradient = getCachedGradient(sunKey, () => {
            const grad = ctx.createRadialGradient(
                projected.x, projected.y, 0,
                projected.x, projected.y, screenRadius
            );
            grad.addColorStop(0, '#ffffff');
            grad.addColorStop(0.3, '#ffee88');
            grad.addColorStop(0.7, '#ffdd44');
            grad.addColorStop(1, '#ff9922');
            return grad;
        });

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(projected.x, projected.y, screenRadius, 0, Math.PI * 2);
        ctx.fill();

        // Corona glow (cached)
        const coronaKey = `radial_corona_${projected.x.toFixed(2)}_${projected.y.toFixed(2)}_${screenRadius.toFixed(1)}`;
        const corona = getCachedGradient(coronaKey, () => {
            const grad = ctx.createRadialGradient(
                projected.x, projected.y, screenRadius,
                projected.x, projected.y, screenRadius * 2.5
            );
            grad.addColorStop(0, 'rgba(255, 200, 100, 0.4)');
            grad.addColorStop(1, 'rgba(255, 200, 100, 0)');
            return grad;
        });

        ctx.fillStyle = corona;
        ctx.beginPath();
        ctx.arc(projected.x, projected.y, screenRadius * 2.5, 0, Math.PI * 2);
        ctx.fill();
    } else if (body.type === 'star') {
        // Glow effect for other stars
        const gradient = ctx.createRadialGradient(
            projected.x, projected.y, 0,
            projected.x, projected.y, screenRadius * 3
        );
        gradient.addColorStop(0, display.color);
        gradient.addColorStop(0.3, display.color + '88');
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(projected.x, projected.y, screenRadius * 3, 0, Math.PI * 2);
        ctx.fill();

        // Body itself
        ctx.fillStyle = display.color;
        ctx.beginPath();
        ctx.arc(projected.x, projected.y, screenRadius, 0, Math.PI * 2);
        ctx.fill();
    } else {
        // Check for ring system (Saturn, Uranus, Neptune)
        const ringConfig = RING_CONFIG[body.name];
        let ringProj = null;
        if (ringConfig && screenRadius >= ringConfig.minScreenRadius) {
            ringProj = computeRingProjection(body.name);
            // Draw BACK half of ring (behind planet)
            if (ringProj.visible) {
                drawRings(projected, screenRadius, ringConfig, ringProj, false);
            }
        }

        // Planet rendering: textured sphere (when available and large enough)
        // or gradient fallback with crossfade transition between the two
        const { minScreenRadius, crossfadeRange } = PLANET_TEXTURE_CONFIG;
        const useTexture = hasTexture(body.name) && screenRadius >= minScreenRadius;
        const inCrossfade = hasTexture(body.name) &&
            screenRadius >= minScreenRadius &&
            screenRadius < minScreenRadius + crossfadeRange;

        // Calculate texture alpha for crossfade (0 at minScreenRadius, 1 at minScreenRadius + crossfadeRange)
        const textureAlpha = inCrossfade
            ? (screenRadius - minScreenRadius) / crossfadeRange
            : (useTexture ? 1.0 : 0.0);

        // Draw gradient sphere (always, or as crossfade underlay)
        if (textureAlpha < 1.0) {
            const gradAlpha = 1.0 - textureAlpha;
            ctx.save();
            if (textureAlpha > 0) ctx.globalAlpha = gradAlpha;

            const planetKey = `radial_planet_${body.name}_${projected.x.toFixed(2)}_${projected.y.toFixed(2)}_${screenRadius.toFixed(1)}`;
            const gradient = getCachedGradient(planetKey, () => {
                const grad = ctx.createRadialGradient(
                    projected.x - screenRadius * 0.3,
                    projected.y - screenRadius * 0.3,
                    0,
                    projected.x, projected.y, screenRadius * 1.2
                );
                grad.addColorStop(0, lightenColor(display.color, 30));
                grad.addColorStop(0.5, display.color);
                grad.addColorStop(1, darkenColor(display.color, 40));
                return grad;
            });

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(projected.x, projected.y, screenRadius, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }

        // Draw textured sphere (when texture loaded and planet large enough)
        if (textureAlpha > 0) {
            // Calculate sun direction angle in screen space
            // Sun is at origin (0,0,0), body is at (body.x, body.y, body.z)
            const sunProjected = project3D(0, 0, 0, centerX, centerY, scale);
            const dx = sunProjected.x - projected.x;
            const dy = sunProjected.y - projected.y;
            const sunAngle = Math.atan2(-dy, dx); // Flip Y for screen coords

            const gameDays = getJulianDate();
            const texCanvas = renderPlanetTexture(body.name, screenRadius, gameDays, sunAngle);

            if (texCanvas) {
                ctx.save();
                if (textureAlpha < 1.0) ctx.globalAlpha = textureAlpha;

                // Draw the rendered sphere centered on the body position
                const drawSize = screenRadius * 2.2; // Slightly larger to cover sphere + soft edges
                ctx.drawImage(
                    texCanvas,
                    projected.x - drawSize / 2,
                    projected.y - drawSize / 2,
                    drawSize,
                    drawSize
                );

                ctx.restore();
            }
        }

        // Draw FRONT half of ring (in front of planet)
        if (ringProj && ringProj.visible) {
            drawRings(projected, screenRadius, ringConfig, ringProj, true);
        }

        // Subtle atmospheric glow (always, works with both modes)
        // Shadow requires a non-transparent fill to cast, so we draw the body color
        // at very low alpha underneath. The shadowBlur creates the colored halo.
        ctx.save();
        ctx.shadowColor = display.color;
        ctx.shadowBlur = screenRadius * 0.5;
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = display.color;
        ctx.beginPath();
        ctx.arc(projected.x, projected.y, screenRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // Label with background pill — offset by ring extent for ringed planets
    if (displayOptions.showLabels) {
        const ringConfig = RING_CONFIG[body.name];
        const labelOffset = (ringConfig && screenRadius >= ringConfig.minScreenRadius)
            ? screenRadius * ringConfig.outerRadius + 5
            : screenRadius + 5;
        drawLabel(body.name, projected.x + labelOffset, projected.y + 3, 'rgba(232, 93, 76, 0.8)', false);
    }
}

/**
 * Draw a label with background pill for better readability
 */
function drawLabel(text, x, y, color, isPlayer = false) {
    ctx.font = isPlayer ? 'bold 10px "Share Tech Mono"' : '10px "Share Tech Mono"';
    const metrics = ctx.measureText(text);

    // Background pill
    ctx.fillStyle = getColor('canvas.labelBg');
    const padding = 3;
    const pillHeight = 14;
    ctx.fillRect(
        x - padding,
        y - 10,
        metrics.width + padding * 2,
        pillHeight
    );

    // Text (use provided color or default to theme label color)
    ctx.fillStyle = color || getColor('canvas.label');
    ctx.fillText(text, x, y);
}

/**
 * Draw the ship's current orbit using its Keplerian elements.
 * Similar to drawOrbit but uses ship.visualOrbitalElements for smooth rendering.
 *
 * The visualOrbitalElements are interpolated versions of the actual orbital
 * elements, preventing visual jumps when elements change rapidly due to thrust.
 *
 * When the ship is inside a planetary SOI, the orbit is drawn relative
 * to that planet's position. Otherwise, it's drawn relative to the Sun (origin).
 *
 * Supports both elliptic (e < 1) and hyperbolic (e >= 1) orbits.
 */
function drawShipOrbit(ship, centerX, centerY, scale) {
    if (!displayOptions.showOrbits) {
        return;
    }
    if (!ship.orbitalElements) {
        if (ship.isPlayer && rendererFrameCount % 300 === 0) {
            console.warn('[RENDER] Player ship has no orbitalElements!');
        }
        return;
    }

    // Use visual elements for smooth rendering, fall back to actual if not available
    const elements = ship.visualOrbitalElements || ship.orbitalElements;

    // Validate elements
    if (!elements || !isFinite(elements.a) || !isFinite(elements.e)) {
        if (ship.isPlayer && rendererFrameCount % 300 === 0) {
            console.warn('[RENDER] Player ship has invalid orbital elements:', elements);
        }
        return;
    }

    const { a, e, i, Ω, ω } = elements;

    // ZOOM-ADAPTIVE SEGMENTS: At high zoom, increase segment count for smooth curves
    // This ensures orbital paths align precisely with ghost planet positions at tactical zoom
    const effectiveZoom = scale * camera.zoom;
    const orbitRadiusPixels = a * effectiveZoom;
    const orbitCircumPixels = 2 * Math.PI * orbitRadiusPixels;

    // Zoom-adaptive segment cap: use higher resolution at tactical zoom (>5x) for precision
    // Critical for ship orbit alignment during autopilot and manual thrust maneuvers
    const maxSegments = camera.zoom > 5 ? 2048 : 512;
    const segments = Math.max(64, Math.min(maxSegments, Math.ceil(orbitCircumPixels / 20)));

    // Detect hyperbolic orbit
    const isHyperbolic = e >= 1;

    // Use different color when in planetary SOI
    const isInSOI = ship.soiState?.isInSOI;

    // SOI DIAGNOSTIC: Log orbit type changes for player (one-shot on change)
    if (ship.isPlayer) {
        const currentOrbitType = isHyperbolic ? 'HYPERBOLIC' : 'ELLIPTIC';
        const soiChanged = isInSOI !== lastRenderedSOIState;
        const orbitChanged = currentOrbitType !== lastRenderedOrbitType;

        if (soiChanged || orbitChanged) {
            const body = isInSOI ? ship.soiState.currentBody : 'SUN';
            console.log(
                `[RENDER_DIAG] Orbit render change: ${lastRenderedOrbitType || 'NONE'}→${currentOrbitType} | ` +
                `SOI: ${lastRenderedSOIState ? 'YES' : 'NO'}→${isInSOI ? 'YES' : 'NO'} (${body}) | ` +
                `visual e=${e.toFixed(4)} a=${a.toFixed(6)} | ` +
                `actual e=${ship.orbitalElements.e.toFixed(4)} a=${ship.orbitalElements.a.toFixed(6)} | ` +
                `color=${isHyperbolic ? 'CYAN_DASH' : (isInSOI ? 'BLUE_DASH' : 'GREEN_DASH')}`
            );
        }
        lastRenderedOrbitType = currentOrbitType;
        lastRenderedSOIState = isInSOI;
    }

    // Set visual style based on orbit type
    if (isHyperbolic) {
        // Hyperbolic: cyan dashed line to indicate escape trajectory
        ctx.strokeStyle = ship.isPlayer ? getColor('canvas.shipOrbitHyperbolic') : getColor('canvas.shipOrbitHyperbolic', 0.4);
        ctx.setLineDash([5, 5]);
    } else if (ship.isPlayer) {
        ctx.strokeStyle = isInSOI ? getColor('canvas.shipOrbitSOI') : getColor('canvas.shipOrbitElliptic');
        ctx.setLineDash([4, 4]);
    } else {
        ctx.strokeStyle = getColor('canvas.orbitPrimary');
        ctx.setLineDash([4, 4]);
    }
    ctx.lineWidth = ship.isPlayer ? 1.5 : 1;

    // Get parent position (Sun at origin, or planet position if in SOI)
    let parentX = 0, parentY = 0, parentZ = 0;
    if (isInSOI && ship.soiState.currentBody !== 'SUN') {
        const parent = celestialBodies.find(b => b.name === ship.soiState.currentBody);
        if (parent) {
            parentX = parent.x;
            parentY = parent.y;
            parentZ = parent.z;
        }
    }

    // Precompute rotation matrix components
    const cosΩ = Math.cos(Ω);
    const sinΩ = Math.sin(Ω);
    const cosω = Math.cos(ω);
    const sinω = Math.sin(ω);
    const cosi = Math.cos(i);
    const sini = Math.sin(i);

    ctx.beginPath();

    if (isHyperbolic) {
        // Hyperbolic orbit: draw from -ν_max to +ν_max
        // ν_max = arccos(-1/e), use 95% to avoid asymptote rendering issues

        // Safety check for valid eccentricity
        if (!isFinite(e) || e <= 1) {
            if (rendererDebugEnabled) {
                console.warn(`[RENDER] Invalid hyperbolic eccentricity: e=${e}`);
            }
            ctx.setLineDash([]);
            return;
        }

        const nuMax = Math.acos(-1 / e) * 0.95;

        // Semi-latus rectum for hyperbolic: p = |a| * (e² - 1)
        const p = Math.abs(a) * (e * e - 1);

        // Safety check for valid semi-latus rectum
        if (!isFinite(p) || p <= 0) {
            if (rendererDebugEnabled) {
                console.warn(`[RENDER] Invalid semi-latus rectum: p=${p}, a=${a}, e=${e}`);
            }
            ctx.setLineDash([]);
            return;
        }

        // Determine maximum render distance:
        // - If in SOI, limit to 1.5x SOI radius (show a bit beyond boundary)
        // - If heliocentric, limit to 2 AU (reasonable display distance)
        let maxRenderRadius = 2.0; // Default for heliocentric
        if (isInSOI && ship.soiState?.currentBody) {
            const soiRadius = SOI_RADII[ship.soiState.currentBody] || 0.1;
            maxRenderRadius = soiRadius * 1.5;
            if (rendererDebugEnabled && ship.isPlayer && rendererFrameCount % 60 === 0) {
                console.log(`[RENDER] Limiting hyperbolic render to ${maxRenderRadius.toFixed(4)} AU (SOI=${soiRadius})`);
            }
        }

        let firstPoint = true;
        let validPoints = 0;
        for (let j = 0; j <= segments; j++) {
            const trueAnomaly = -nuMax + (j / segments) * 2 * nuMax;

            // Orbital radius at this true anomaly
            const denominator = 1 + e * Math.cos(trueAnomaly);
            if (Math.abs(denominator) < 0.001) continue;  // Skip near-asymptote points

            const r = p / denominator;

            // Skip invalid points or points beyond max render radius
            if (!isFinite(r) || r < 0 || r > maxRenderRadius) continue;

            // Position in orbital plane
            const xOrbital = r * Math.cos(trueAnomaly);
            const yOrbital = r * Math.sin(trueAnomaly);

            // Rotate to ecliptic frame and add parent offset
            const x = parentX + xOrbital * (cosΩ * cosω - sinΩ * sinω * cosi)
                             - yOrbital * (cosΩ * sinω + sinΩ * cosω * cosi);
            const y = parentY + xOrbital * (sinΩ * cosω + cosΩ * sinω * cosi)
                             - yOrbital * (sinΩ * sinω - cosΩ * cosω * cosi);
            const z = parentZ + xOrbital * (sinω * sini)
                             + yOrbital * (cosω * sini);

            const projected = project3D(x, y, z, centerX, centerY, scale);

            if (firstPoint) {
                ctx.moveTo(projected.x, projected.y);
                firstPoint = false;
            } else {
                ctx.lineTo(projected.x, projected.y);
            }
            validPoints++;
        }

        // Debug log if we didn't draw anything
        if (rendererDebugEnabled && ship.isPlayer && validPoints === 0) {
            console.warn(`[RENDER] Hyperbolic orbit: no valid points rendered! e=${e.toFixed(4)} a=${a.toFixed(4)} p=${p.toFixed(6)}`);
        }
    } else {
        // Elliptic orbit: sweep full 2π
        for (let j = 0; j <= segments; j++) {
            const trueAnomaly = (j / segments) * Math.PI * 2;

            // Orbital radius at this true anomaly
            const r = e < 1e-10 ? a : (a * (1 - e * e)) / (1 + e * Math.cos(trueAnomaly));

            // Position in orbital plane
            const xOrbital = r * Math.cos(trueAnomaly);
            const yOrbital = r * Math.sin(trueAnomaly);

            // Rotate to ecliptic frame and add parent offset
            const x = parentX + xOrbital * (cosΩ * cosω - sinΩ * sinω * cosi)
                             - yOrbital * (cosΩ * sinω + sinΩ * cosω * cosi);
            const y = parentY + xOrbital * (sinΩ * cosω + cosΩ * sinω * cosi)
                             - yOrbital * (sinΩ * sinω - cosΩ * cosω * cosi);
            const z = parentZ + xOrbital * (sinω * sini)
                             + yOrbital * (cosω * sini);

            const projected = project3D(x, y, z, centerX, centerY, scale);

            if (j === 0) {
                ctx.moveTo(projected.x, projected.y);
            } else {
                ctx.lineTo(projected.x, projected.y);
            }
        }
    }

    ctx.stroke();
    ctx.setLineDash([]);
}

/**
 * Subdivide trajectory for smooth rendering at all zoom levels.
 * Interpolates between physics points to ensure ~18 pixels per segment.
 * Pattern adapted from drawOrbit() zoom-adaptive segments.
 *
 * This is purely visual smoothing - no physics cost. The physics points
 * remain unchanged; we only add interpolated points for rendering.
 */
function subdivideTrajectoryForRendering(trajectory, centerX, centerY, scale) {
    if (!trajectory || trajectory.length < 2) return trajectory;

    const TARGET_PIXELS_PER_SEGMENT = 18;
    const MAX_RENDERED_SEGMENTS = 4096;  // Prevent unbounded subdivision at extreme zoom
    const subdivided = [];

    for (let i = 0; i < trajectory.length - 1; i++) {
        // Stop subdivision if we've hit the cap (prevents 960ms frames at extreme zoom)
        if (subdivided.length >= MAX_RENDERED_SEGMENTS) {
            break;
        }

        const p1 = trajectory[i];
        const p2 = trajectory[i + 1];

        // Project to screen space to measure pixel distance
        const proj1 = project3D(p1.x, p1.y, p1.z, centerX, centerY, scale);
        const proj2 = project3D(p2.x, p2.y, p2.z, centerX, centerY, scale);

        const pixelDist = Math.sqrt(
            (proj2.x - proj1.x) ** 2 + (proj2.y - proj1.y) ** 2
        );

        // Always add first point
        subdivided.push(p1);

        // If segment is long in screen space, subdivide it
        if (pixelDist > TARGET_PIXELS_PER_SEGMENT) {
            const subsegments = Math.ceil(pixelDist / TARGET_PIXELS_PER_SEGMENT);

            // Linear interpolation in 3D space
            for (let j = 1; j < subsegments; j++) {
                // Check cap again inside subdivision loop
                if (subdivided.length >= MAX_RENDERED_SEGMENTS) {
                    break;
                }

                const t = j / subsegments;
                subdivided.push({
                    x: p1.x + (p2.x - p1.x) * t,
                    y: p1.y + (p2.y - p1.y) * t,
                    z: p1.z + (p2.z - p1.z) * t,
                    time: p1.time + (p2.time - p1.time) * t,
                });
            }
        }
    }

    // Add final point (if we haven't hit the cap)
    if (subdivided.length < MAX_RENDERED_SEGMENTS) {
        subdivided.push(trajectory[trajectory.length - 1]);
    }

    return subdivided;
}

/**
 * Draw the predicted trajectory (spiral path) showing where the ship
 * will actually go with continuous thrust.
 *
 * This is ADDITIVE to the Keplerian orbit display (green ellipse).
 * The predicted trajectory shows the actual path accounting for
 * ongoing sail thrust, producing a spiral that diverges from the
 * instantaneous Keplerian orbit.
 *
 * Visual style: Magenta/purple solid line with alpha fade toward the end
 * to indicate time direction.
 */
function drawPredictedTrajectory(ship, centerX, centerY, scale) {
    // Check both toggles - parent (showOrbits) and specific (showPredictedTrajectory)
    if (!displayOptions.showOrbits) return;
    if (!displayOptions.showPredictedTrajectory) return;
    if (!ship.orbitalElements || !ship.sail) return;

    // Get predicted trajectory with configurable duration
    const duration = trajectoryConfig.durationDays;

    // Use current simulation date for trajectory prediction
    const startTime = getJulianDate();

    // Let trajectory-predictor.js calculate adaptive steps based on orbit characteristics
    const trajectory = predictTrajectory({
        orbitalElements: ship.orbitalElements,
        sail: ship.sail,
        mass: ship.mass || 10000,
        startTime: startTime,
        duration: duration,
        soiState: ship.soiState,  // For SOI boundary detection
        extremeFlybyState: ship.extremeFlybyState  // For extreme eccentricity linear interpolation
    });

    if (!trajectory || trajectory.length < 2) {
        // SOI DIAGNOSTIC: Log missing/short trajectory (throttled)
        if (ship.isPlayer && rendererFrameCount % 60 === 0) {
            const inSOI = ship.soiState?.isInSOI;
            const body = ship.soiState?.currentBody || 'SUN';
            console.warn(
                `[RENDER_DIAG] ⚠️ NO PREDICTED PATH: ${trajectory?.length || 0} points | ` +
                `SOI=${inSOI ? body : 'NO'} | ` +
                `e=${ship.orbitalElements?.e?.toFixed(4) || 'N/A'} | ` +
                `extremeFlyby=${!!ship.extremeFlybyState}`
            );
        }
        return;
    }


    // NOTE: trajectory-predictor.js now outputs heliocentric coordinates always.
    // When in SOI, it internally converts planetocentric → heliocentric.
    // DO NOT add parent offset here - it's already included in trajectory positions.

    // Subdivide trajectory for smooth rendering at all zoom levels
    // This adds interpolated points purely for visual quality - zero physics cost
    const renderTrajectory = subdivideTrajectoryForRendering(trajectory, centerX, centerY, scale);

    // Draw trajectory with gradient fade
    ctx.lineWidth = 2;
    ctx.setLineDash([]);  // Solid line (not dashed like Keplerian)

    // Draw in segments with decreasing alpha for time direction indication
    const segmentCount = renderTrajectory.length - 1;

    for (let i = 0; i < segmentCount; i++) {
        const progress = i / segmentCount;
        const alpha = 0.8 - progress * 0.6;  // Fade from 0.8 to 0.2

        // Magenta/purple color to distinguish from green Keplerian orbit
        ctx.strokeStyle = getColor('canvas.trajectory', alpha);

        const p1 = renderTrajectory[i];
        const p2 = renderTrajectory[i + 1];

        // Trajectory positions are already heliocentric (no offset needed)
        const x1 = p1.x;
        const y1 = p1.y;
        const z1 = p1.z;
        const x2 = p2.x;
        const y2 = p2.y;
        const z2 = p2.z;

        const proj1 = project3D(x1, y1, z1, centerX, centerY, scale);
        const proj2 = project3D(x2, y2, z2, centerX, centerY, scale);

        // Skip segments that go off-screen or have invalid projections
        if (!isFinite(proj1.x) || !isFinite(proj2.x)) continue;

        ctx.beginPath();
        ctx.moveTo(proj1.x, proj1.y);
        ctx.lineTo(proj2.x, proj2.y);
        ctx.stroke();
    }

    // Draw start marker with subtle pulsing glow
    if (trajectory.length > 0) {
        const start = trajectory[0];
        const startProj = project3D(
            start.x,
            start.y,
            start.z,
            centerX, centerY, scale
        );

        // Subtle pulsing effect (use time-based sine wave)
        const pulsePhase = (Date.now() / 1000) % 2;  // 2 second cycle
        const pulseIntensity = 0.5 + 0.5 * Math.sin(pulsePhase * Math.PI);

        // Outer glow
        const glowGradient = ctx.createRadialGradient(
            startProj.x, startProj.y, 0,
            startProj.x, startProj.y, 6
        );
        glowGradient.addColorStop(0, getColor('canvas.trajectoryPoint', 0.6 * pulseIntensity));
        glowGradient.addColorStop(1, getColor('canvas.trajectoryPoint', 0));
        ctx.fillStyle = glowGradient;
        ctx.beginPath();
        ctx.arc(startProj.x, startProj.y, 6, 0, Math.PI * 2);
        ctx.fill();

        // Core marker
        ctx.fillStyle = getColor('canvas.trajectoryPoint', 0.9);
        ctx.beginPath();
        ctx.arc(startProj.x, startProj.y, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    // Draw end marker if trajectory was truncated (SOI boundary or max distance)
    if (trajectory.length > 0) {
        const last = trajectory[trajectory.length - 1];
        if (last.truncated) {
            const endProj = project3D(
                last.x,
                last.y,
                last.z,
                centerX, centerY, scale
            );

            // More prominent SOI exit marker with circle outline
            ctx.strokeStyle = 'rgba(255, 150, 100, 0.9)';
            ctx.lineWidth = 2;

            // Circle outline
            ctx.beginPath();
            ctx.arc(endProj.x, endProj.y, 7, 0, Math.PI * 2);
            ctx.stroke();

            // X marker at truncation point
            const size = 5;
            ctx.beginPath();
            ctx.moveTo(endProj.x - size, endProj.y - size);
            ctx.lineTo(endProj.x + size, endProj.y + size);
            ctx.moveTo(endProj.x + size, endProj.y - size);
            ctx.lineTo(endProj.x - size, endProj.y + size);
            ctx.stroke();
        }
    }
}

/**
 * Format time offset for intersection labels
 *
 * FIX (F3): Only called for future intersections
 * (past intersections are filtered in detectIntersections)
 *
 * @param {number} currentTime - Current game Julian date
 * @param {number} futureTime - Intersection Julian date
 * @returns {string} Formatted offset (e.g., "+87d 6h" or "+6h" or "+42m")
 */
function formatTimeOffset(currentTime, futureTime) {
    const deltaDays = futureTime - currentTime;

    // Safety check (should not happen due to filtering, but guard anyway)
    if (deltaDays < 0) {
        return 'PAST';
    }

    const days = Math.floor(deltaDays);
    const hours = Math.floor((deltaDays - days) * 24);

    // For very imminent encounters, show minutes
    if (days === 0 && hours === 0) {
        const minutes = Math.floor(deltaDays * 24 * 60);
        return `+${minutes}m`;
    }

    // Standard format
    if (days > 0) {
        return `+${days}d ${hours}h`;
    } else {
        return `+${hours}h`;
    }
}

/**
 * Draw ghost planets at predicted trajectory intersection points
 *
 * Shows where celestial bodies will be when ship's trajectory crosses their orbits.
 * Provides critical navigational feedback for timing encounters.
 *
 * Visual style: 50% transparent planets with subtle outline, using body's normal color.
 * Time labels show offset from current time (e.g., "MARS +87d 6h")
 */
function drawIntersectionMarkers(centerX, centerY, scale) {
    // Check toggles - requires both parent (showOrbits) and specific toggle
    if (!displayOptions.showIntersectionMarkers) return;
    if (!displayOptions.showOrbits) return;

    const player = getPlayerShip();
    if (!player) return;

    // Use radius-crossing (intersection) data for ghost placement.
    // Radius-crossing shows where the planet will be each time your trajectory
    // crosses its orbital radius, sorted chronologically. This is the information
    // needed for navigation: "where is the planet when I get to its orbit?"
    //
    // Previously this preferred closest-approach data, which finds the single
    // minimum-distance point across the entire prediction window. The problem:
    // the "best" encounter might be weeks in the future while the player is
    // approaching a nearer radius crossing NOW. The ghost would show the planet
    // at its far-future position, causing the player to navigate toward a point
    // where the planet won't be when they arrive at the orbital radius.
    const intersectionCache = getIntersectionCache();

    // Only show ghosts for actual trajectory radius crossings.
    // No fallback to closest-approach — a ghost with no real crossing
    // would mislead the player into flying toward a position where
    // the planet won't be when they arrive.
    let encounters = [];

    // Tier 2 phase indicators (45-90°) are drawn at the trajectory crossing point
    const guidanceMaxAngSep = INTERSECTION_CONFIG.guidanceMaxAngularSeparation;
    const tier1MaxAngSep = INTERSECTION_CONFIG.maxAngularSeparation;
    let phaseIndicators = [];

    if (intersectionCache.results && intersectionCache.results.length > 0) {
        const filtered = intersectionCache.results
            .filter(intersection => {
                if (intersection.bodyName !== destination) return false;
                if (!isFinite(intersection.distance)) return false;
                const body = celestialBodies.find(b => b.name === intersection.bodyName);
                if (body && body.category && !bodyFilters[body.category]) return false;
                // Filter out beyond guidance threshold (90°)
                if ((intersection.angularSeparation || 0) > guidanceMaxAngSep) return false;
                return true;
            });

        for (const intersection of filtered) {
            const angSep = intersection.angularSeparation || 0;
            if (angSep <= tier1MaxAngSep) {
                // Tier 1: standard ghost planet
                encounters.push({
                    bodyName: intersection.bodyName,
                    bodyPosition: intersection.bodyPosition,
                    time: intersection.time,
                    distance: intersection.distance,
                    angularSeparation: angSep,
                    isAhead: intersection.isAhead || false
                });
            } else {
                // Tier 2: phase indicator at trajectory crossing point
                phaseIndicators.push({
                    bodyName: intersection.bodyName,
                    bodyPosition: intersection.bodyPosition,
                    trajectoryPosition: intersection.trajectoryPosition,
                    time: intersection.time,
                    distance: intersection.distance,
                    angularSeparation: angSep,
                    isAhead: intersection.isAhead || false
                });
            }
        }
    }

    if (encounters.length === 0 && phaseIndicators.length === 0) return;

    for (const intersection of encounters) {
        const bodyPos = intersection.bodyPosition;

        // bodyPosition is already in heliocentric coordinates.
        // The intersection detector converts moon positions to heliocentric
        // using the parent's position at crossing time (not current time).
        // The closest approach detector also returns heliocentric positions.
        // No additional coordinate transform needed here.
        let renderX = bodyPos.x;
        let renderY = bodyPos.y;
        let renderZ = bodyPos.z;

        // Project to screen
        const projected = project3D(renderX, renderY, renderZ, centerX, centerY, scale);
        if (!projected) continue;

        // Cull off-screen markers (performance optimization)
        if (projected.x < -50 || projected.x > canvas.width + 50) continue;
        if (projected.y < -50 || projected.y > canvas.height + 50) continue;

        // Get body display properties
        const display = BODY_DISPLAY[intersection.bodyName];
        if (!display) continue;

        // Calculate time until encounter for visual effects
        const julianDate = getJulianDate();
        const deltaDays = intersection.time - julianDate;

        // ANGULAR SEPARATION OPACITY FADE
        // Ghosts near the max angular separation threshold fade out smoothly
        // to avoid abrupt pop-in/pop-out as sail adjustments shift the trajectory.
        // Close encounters (within 2x SOI) are always at full opacity.
        const angSep = intersection.angularSeparation || 0;
        const maxAngSep = INTERSECTION_CONFIG.maxAngularSeparation;
        const fadeStart = maxAngSep * INTERSECTION_CONFIG.fadeStartFraction;
        let fadeAlpha = 1.0;
        if (angSep > fadeStart) {
            const fadeRange = maxAngSep - fadeStart;
            fadeAlpha = 1.0 - 0.8 * Math.min(1, (angSep - fadeStart) / fadeRange);
        }

        // VISUAL POLISH: Pulsing glow when within SOI distance (good intercept)
        // Uses SOI radius for body-appropriate threshold instead of arbitrary 24h
        const soiRadius = SOI_RADII[intersection.bodyName] || 0.01;
        const isCloseEncounter = intersection.distance < soiRadius * 2;
        // Close encounters always at full opacity regardless of angular separation
        if (isCloseEncounter) fadeAlpha = 1.0;
        if (isCloseEncounter) {
            const phase = (Date.now() % 2000) / 2000 * Math.PI * 2;
            const intensity = 0.5 + 0.5 * Math.sin(phase);

            ctx.save();
            ctx.globalAlpha = intensity * 0.3;
            ctx.fillStyle = display.color;
            ctx.beginPath();
            ctx.arc(projected.x, projected.y, display.radius * 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Draw ghost planet (50% base transparency, modulated by angular separation fade)
        ctx.save();
        ctx.globalAlpha = 0.5 * fadeAlpha;
        ctx.fillStyle = display.color;
        ctx.beginPath();
        ctx.arc(projected.x, projected.y, display.radius, 0, Math.PI * 2);
        ctx.fill();

        // Draw subtle outline (70% base transparency, modulated by fade)
        ctx.strokeStyle = display.color;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.7 * fadeAlpha;
        ctx.stroke();

        ctx.restore();

        // Draw time-offset label with distance and early/late indicator
        const timeOffset = formatTimeOffset(julianDate, intersection.time);
        const KM_PER_AU = 149597870.7;
        const distKm = intersection.distance * KM_PER_AU;
        const distLabel = intersection.distance < 0.01
            ? `${Math.round(distKm).toLocaleString()} km`
            : `${intersection.distance.toFixed(2)} AU`;

        // Early/late indicator: tells player if planet is ahead or behind at crossing
        // Angular separation in degrees, with direction
        let phaseLabel = '';
        const angSepDeg = (intersection.angularSeparation || 0) * (180 / Math.PI);
        if (angSepDeg > 2) {  // Only show when separation is significant (> 2 degrees)
            const direction = intersection.isAhead ? 'EARLY' : 'LATE';
            phaseLabel = isCloseEncounter ? ' CLOSE' : ` ${direction} ${Math.round(angSepDeg)}°`;
        } else {
            phaseLabel = ' CLOSE';
        }

        const labelText = `${intersection.bodyName} ${timeOffset} [${distLabel}]${phaseLabel}`;

        ctx.save();
        ctx.globalAlpha = 0.8 * fadeAlpha;
        ctx.font = '11px monospace';
        ctx.fillStyle = display.color;
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 3;

        // Position label above and to the right of ghost planet
        const labelX = projected.x + display.radius + 5;
        const labelY = projected.y - display.radius - 5;

        // Draw text with outline for readability
        ctx.strokeText(labelText, labelX, labelY);
        ctx.fillText(labelText, labelX, labelY);

        ctx.restore();
    }

    // ====================================================================
    // TIER 2: Phase Indicators (45-90°)
    // ====================================================================
    // Drawn at the trajectory crossing point (where ship crosses target's
    // orbital radius), NOT at the planet's position. Shows a directional
    // chevron pointing toward the planet with phase gap and orbit estimate.
    for (const indicator of phaseIndicators) {
        const crossingPos = indicator.trajectoryPosition;
        if (!crossingPos) continue;

        // Project the ship's crossing point to screen
        const crossingProjected = project3D(
            crossingPos.x, crossingPos.y, crossingPos.z,
            centerX, centerY, scale
        );
        if (!crossingProjected) continue;

        // Cull off-screen
        if (crossingProjected.x < -50 || crossingProjected.x > canvas.width + 50) continue;
        if (crossingProjected.y < -50 || crossingProjected.y > canvas.height + 50) continue;

        const display = BODY_DISPLAY[indicator.bodyName];
        if (!display) continue;

        // Calculate direction from crossing point to planet position (in 2D ecliptic)
        // This gives the chevron its pointing direction
        const dx = indicator.bodyPosition.x - crossingPos.x;
        const dy = indicator.bodyPosition.y - crossingPos.y;
        const dirMag = Math.sqrt(dx * dx + dy * dy);
        if (dirMag < 1e-10) continue;

        // Project the planet position to get screen-space direction
        const planetProjected = project3D(
            indicator.bodyPosition.x, indicator.bodyPosition.y, indicator.bodyPosition.z,
            centerX, centerY, scale
        );
        if (!planetProjected) continue;

        const screenDx = planetProjected.x - crossingProjected.x;
        const screenDy = planetProjected.y - crossingProjected.y;
        const screenDirMag = Math.sqrt(screenDx * screenDx + screenDy * screenDy);
        // Normalized screen direction (use fallback if planet projects to same point)
        const ndx = screenDirMag > 1 ? screenDx / screenDirMag : 1;
        const ndy = screenDirMag > 1 ? screenDy / screenDirMag : 0;

        // Draw chevron (open arrow) pointing toward planet
        const chevronSize = 8;
        const cx = crossingProjected.x;
        const cy = crossingProjected.y;

        // Chevron tip is offset from crossing point in the planet direction
        const tipX = cx + ndx * chevronSize * 2;
        const tipY = cy + ndy * chevronSize * 2;

        // Perpendicular for chevron wings
        const perpX = -ndy;
        const perpY = ndx;

        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = display.color;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Draw chevron shape (open arrow: two lines from wings to tip)
        ctx.beginPath();
        ctx.moveTo(cx + perpX * chevronSize - ndx * chevronSize * 0.5,
                   cy + perpY * chevronSize - ndy * chevronSize * 0.5);
        ctx.lineTo(tipX, tipY);
        ctx.lineTo(cx - perpX * chevronSize - ndx * chevronSize * 0.5,
                   cy - perpY * chevronSize - ndy * chevronSize * 0.5);
        ctx.stroke();

        // Draw small circle at crossing point (distinct from ghost planet circle)
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();

        // Estimate orbits to close the phase gap
        // Phase closure rate = difference in mean motions between ship and target
        const angSepDeg = indicator.angularSeparation * (180 / Math.PI);
        const targetBody = celestialBodies.find(b => b.name === indicator.bodyName);
        let orbitEstimate = '';
        if (targetBody && targetBody.elements) {
            const shipRadius = Math.sqrt(
                crossingPos.x ** 2 + crossingPos.y ** 2 + crossingPos.z ** 2
            );
            if (shipRadius > 0.01) {
                // Ship's mean motion at crossing radius (approximate circular orbit)
                const nShip = meanMotion(shipRadius, MU_SUN);
                // Target's mean motion
                const nTarget = meanMotion(targetBody.elements.a, MU_SUN);
                const phaseDiffRate = Math.abs(nShip - nTarget); // rad/day
                if (phaseDiffRate > 1e-10) {
                    const daysToClose = indicator.angularSeparation / phaseDiffRate;
                    const targetPeriod = 2 * Math.PI / nTarget;
                    const orbits = Math.ceil(daysToClose / targetPeriod);
                    orbitEstimate = orbits === 1 ? ' ~1 orbit' : ` ~${orbits} orbits`;
                }
            }
        }

        // Draw label
        const direction = indicator.isAhead ? 'AHEAD' : 'BEHIND';
        const labelText = `${indicator.bodyName} ${Math.round(angSepDeg)}° ${direction}${orbitEstimate}`;

        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.font = '10px monospace';
        ctx.fillStyle = display.color;
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 3;

        // Position label offset from chevron tip
        const labelX = tipX + ndx * 8 + 5;
        const labelY = tipY + ndy * 8;

        ctx.strokeText(labelText, labelX, labelY);
        ctx.fillText(labelText, labelX, labelY);

        ctx.restore();
    }
}

/**
 * Draw node crossing markers (AN/DN) on the trajectory
 * Shows where trajectory crosses the target's orbital plane - optimal for plane changes
 *
 * Visual style: Diamond markers with "AN" or "DN" labels and time offset
 */
function drawNodeMarkers(centerX, centerY, scale) {
    // Check toggles - requires predicted path to be visible
    if (!displayOptions.showPredictedPath) return;

    const cache = getNodeCrossingsCache();
    if (!cache.results || cache.results.length === 0) return;

    const player = getPlayerShip();
    if (!player) return;

    const julianDate = getJulianDate();

    // Colors for node markers
    const AN_COLOR = '#4ce88d';  // Green for ascending node
    const DN_COLOR = '#e84c88';  // Pink for descending node

    for (const node of cache.results) {
        // Project node position to screen
        const projected = project3D(node.position.x, node.position.y, node.position.z, centerX, centerY, scale);
        if (!projected) continue;

        // Cull off-screen markers
        if (projected.x < -50 || projected.x > canvas.width + 50) continue;
        if (projected.y < -50 || projected.y > canvas.height + 50) continue;

        const color = node.type === 'AN' ? AN_COLOR : DN_COLOR;
        const markerSize = 8;

        // Draw diamond marker
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.moveTo(projected.x, projected.y - markerSize);  // Top
        ctx.lineTo(projected.x + markerSize, projected.y);  // Right
        ctx.lineTo(projected.x, projected.y + markerSize);  // Bottom
        ctx.lineTo(projected.x - markerSize, projected.y);  // Left
        ctx.closePath();
        ctx.stroke();

        // Fill with semi-transparent color
        ctx.globalAlpha = 0.3;
        ctx.fill();

        ctx.restore();

        // Draw label with time offset
        const timeOffset = formatTimeOffset(julianDate, node.time);
        const labelText = `${node.type} ${timeOffset}`;

        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.font = 'bold 10px monospace';
        ctx.fillStyle = color;
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 3;

        // Position label to the right of marker
        const labelX = projected.x + markerSize + 4;
        const labelY = projected.y + 3;

        // Draw text with outline for readability
        ctx.strokeText(labelText, labelX, labelY);
        ctx.fillText(labelText, labelX, labelY);

        ctx.restore();
    }
}

/**
 * Draw a ship
 */
function drawShip(ship, centerX, centerY, scale) {
    const projected = project3D(ship.x, ship.y, ship.z, centerX, centerY, scale);
    
    // Ship icon (triangle)
    ctx.fillStyle = ship.color;
    ctx.beginPath();
    ctx.moveTo(projected.x, projected.y - 8);
    ctx.lineTo(projected.x + 5, projected.y + 6);
    ctx.lineTo(projected.x, projected.y + 2);
    ctx.lineTo(projected.x - 5, projected.y + 6);
    ctx.closePath();
    ctx.fill();
    
    // Glow for player ship
    if (ship.isPlayer) {
        ctx.shadowColor = ship.color;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
    }
    
    // Label with background pill
    if (displayOptions.showLabels) {
        drawLabel(ship.name, projected.x + 10, projected.y + 3, ship.color, ship.isPlayer);
    }
}

/**
 * Draw the flight path trajectory to destination
 */
function drawFlightPath(centerX, centerY, scale) {
    if (!displayOptions.showTrajectory || flightPath.length < 2) return;

    const time = getTime();

    // Draw trajectory (dashed line to destination)
    ctx.strokeStyle = '#4ce88d';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();

    for (let i = 0; i < flightPath.length; i++) {
        const point = flightPath[i];
        const projected = project3D(point.x, point.y, point.z, centerX, centerY, scale);
        if (i === 0) {
            ctx.moveTo(projected.x, projected.y);
        } else {
            ctx.lineTo(projected.x, projected.y);
        }
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw waypoints
    ctx.fillStyle = '#4ce88d';
    for (let i = 0; i < flightPath.length; i += 10) {
        const point = flightPath[i];
        const projected = project3D(point.x, point.y, point.z, centerX, centerY, scale);
        ctx.beginPath();
        ctx.arc(projected.x, projected.y, 2, 0, Math.PI * 2);
        ctx.fill();
    }

    // Draw destination marker
    if (flightPath.length > 0) {
        const destPoint = flightPath[flightPath.length - 1];
        const projected = project3D(destPoint.x, destPoint.y, destPoint.z, centerX, centerY, scale);

        // Pulsing ring at destination
        ctx.strokeStyle = '#e85d4c';
        ctx.lineWidth = 1;
        const pulseSize = 10 + Math.sin(time * 0.5) * 3;
        ctx.beginPath();
        ctx.arc(projected.x, projected.y, pulseSize, 0, Math.PI * 2);
        ctx.stroke();
    }
}

/**
 * Main render function
 */
export function render() {
    const scale = getScale();

    // Increment frame counter for debug logging
    rendererFrameCount++;

    // Clear
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    // Draw layers (back to front)
    // 1. Starfield background (fixed stars at infinity)
    if (displayOptions.showStarfield) {
        drawStarfield(ctx, centerX, centerY, scale);
    }

    // 2. Grid overlay
    drawGrid(centerX, centerY, scale);
    
    // Draw orbits
    getVisibleBodies().forEach(body => drawOrbit(body, centerX, centerY, scale));

    // Draw ship orbits (Keplerian - instantaneous orbit)
    ships.forEach(ship => drawShipOrbit(ship, centerX, centerY, scale));

    // Draw predicted trajectory for player ship (spiral path with thrust)
    const player = getPlayerShip();
    if (player) {
        drawPredictedTrajectory(player, centerX, centerY, scale);
    }

    // Draw intersection markers (ghost planets at future encounter points)
    drawIntersectionMarkers(centerX, centerY, scale);

    // Draw node crossing markers (AN/DN for plane change opportunities)
    drawNodeMarkers(centerX, centerY, scale);

    // Draw flight path
    drawFlightPath(centerX, centerY, scale);

    // Draw bodies (sorted by depth for proper overlap)
    const sortedBodies = [...getVisibleBodies()].sort((a, b) => {
        const projA = project3D(a.x, a.y, a.z, 0, 0, 1);
        const projB = project3D(b.x, b.y, b.z, 0, 0, 1);
        return projA.depth - projB.depth;
    });
    sortedBodies.forEach(body => drawBody(body, centerX, centerY, scale));

    // Draw SOI boundaries
    drawSOIBoundaries(centerX, centerY, scale);

    // Draw ships
    ships.forEach(ship => drawShip(ship, centerX, centerY, scale));
}


