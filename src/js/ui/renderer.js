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
import { SOI_RADII, BODY_DISPLAY, SCALE_RENDERING_CONFIG, TRAJECTORY_RENDER_CONFIG } from '../config.js';
import { predictTrajectory } from '../lib/trajectory-predictor.js';
import { drawStarfield, initStarfield } from '../lib/starfield.js';

let canvas, ctx;

// Debug flag for renderer logging
let rendererDebugEnabled = false;
let rendererFrameCount = 0;

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

    // Debounced resize handler to prevent cache thrashing
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            resizeCanvas();
        }, 300); // 300ms debounce
    });

    // Handle WebGL context loss (GPU driver crash/reset)
    canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        clearGradientCache();
        console.warn('[RENDERER] WebGL context lost, gradient cache cleared');
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

        ctx.strokeStyle = `rgba(232, 93, 76, ${finalAlpha})`;
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
            grad.addColorStop(0, 'rgba(232, 93, 76, 0.1)');
            grad.addColorStop(fadeStart / maxRadius, 'rgba(232, 93, 76, 0.1)');
            grad.addColorStop(fadeEnd / maxRadius, 'rgba(232, 93, 76, 0.02)');
            grad.addColorStop(1, 'rgba(232, 93, 76, 0)');
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

    // Hide orbits at extreme zoom - they're sun-centered and become visually confusing
    // when zoomed close to a planet (planet appears centered but orbit doesn't)
    if (camera.zoom > 50) return;

    const { a, e, i, Ω, ω } = body.elements;

    // ZOOM-ADAPTIVE SEGMENTS: At high zoom, increase segment count for smooth curves
    // This prevents ghost planets from appearing off the orbital path at tactical zoom
    const effectiveZoom = scale * camera.zoom;
    const orbitRadiusPixels = a * effectiveZoom;
    const orbitCircumPixels = 2 * Math.PI * orbitRadiusPixels;

    // Target ~20 pixels per segment for smooth appearance, min 64, max 512
    const segments = Math.max(64, Math.min(512, Math.ceil(orbitCircumPixels / 20)));

    ctx.strokeStyle = body.type === 'moon' ? 'rgba(232, 93, 76, 0.15)' : 'rgba(232, 93, 76, 0.3)';
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
 * Draw SOI boundaries for planets
 */
function drawSOIBoundaries(centerX, centerY, scale) {
    if (!displayOptions.showOrbits) return;

    Object.entries(SOI_RADII).forEach(([bodyName, radius]) => {
        const body = celestialBodies.find(b => b.name === bodyName);
        if (!body) return;

        const projected = project3D(body.x, body.y, body.z, centerX, centerY, scale);
        const pixelRadius = radius * scale;

        // Only draw if radius is meaningful on screen
        if (pixelRadius < 5 || pixelRadius > 2000) return;

        const display = getBodyDisplay(body);

        ctx.strokeStyle = `${display.color}44`;  // 26% opacity
        ctx.setLineDash([4, 8]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(projected.x, projected.y, pixelRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
    });
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
        // Enhanced planet rendering with 3D appearance (cached)
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

        // Subtle glow
        ctx.shadowColor = display.color;
        ctx.shadowBlur = screenRadius * 0.5;
        ctx.beginPath();
        ctx.arc(projected.x, projected.y, screenRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    // Label with background pill
    if (displayOptions.showLabels) {
        drawLabel(body.name, projected.x + screenRadius + 5, projected.y + 3, 'rgba(232, 93, 76, 0.8)', false);
    }
}

/**
 * Draw a label with background pill for better readability
 */
function drawLabel(text, x, y, color, isPlayer = false) {
    ctx.font = isPlayer ? 'bold 10px "Share Tech Mono"' : '10px "Share Tech Mono"';
    const metrics = ctx.measureText(text);

    // Background pill
    ctx.fillStyle = 'rgba(10, 10, 10, 0.7)';
    const padding = 3;
    const pillHeight = 14;
    ctx.fillRect(
        x - padding,
        y - 10,
        metrics.width + padding * 2,
        pillHeight
    );

    // Text
    ctx.fillStyle = color;
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

    // Hide orbits at extreme zoom (same as planet orbits)
    if (camera.zoom > 50) return;

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

    // Target ~20 pixels per segment for smooth appearance, min 64, max 512
    const segments = Math.max(64, Math.min(512, Math.ceil(orbitCircumPixels / 20)));

    // Detect hyperbolic orbit
    const isHyperbolic = e >= 1;

    // Use different color when in planetary SOI
    const isInSOI = ship.soiState?.isInSOI;


    // Set visual style based on orbit type
    if (isHyperbolic) {
        // Hyperbolic: cyan dashed line to indicate escape trajectory
        ctx.strokeStyle = ship.isPlayer ? 'rgba(100, 200, 255, 0.7)' : 'rgba(100, 200, 255, 0.4)';
        ctx.setLineDash([5, 5]);
    } else if (ship.isPlayer) {
        ctx.strokeStyle = isInSOI ? 'rgba(76, 141, 232, 0.6)' : 'rgba(76, 232, 141, 0.5)';
        ctx.setLineDash([4, 4]);
    } else {
        ctx.strokeStyle = 'rgba(232, 93, 76, 0.3)';
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
    // Use high-resolution steps for accurate trajectory prediction
    // Low resolution causes thrust to be held constant over large time steps,
    // leading to trajectory divergence (ship doesn't end up where predicted)
    const rawSteps = Math.round(duration * TRAJECTORY_RENDER_CONFIG.stepsPerDay);
    const steps = Math.min(
        TRAJECTORY_RENDER_CONFIG.maxSteps,
        Math.max(TRAJECTORY_RENDER_CONFIG.minSteps, rawSteps)
    );

    // Use current simulation date for trajectory prediction
    const startTime = getJulianDate();

    const trajectory = predictTrajectory({
        orbitalElements: ship.orbitalElements,
        sail: ship.sail,
        mass: ship.mass || 10000,
        startTime: startTime,
        duration: duration,
        steps: steps,
        soiState: ship.soiState,  // For SOI boundary detection
        extremeFlybyState: ship.extremeFlybyState  // For extreme eccentricity linear interpolation
    });

    if (!trajectory || trajectory.length < 2) {
        // Diagnostic logging for missing trajectory
        if (ship.isPlayer && rendererFrameCount % 300 === 0) {
            console.warn('[RENDER] Predicted trajectory too short or missing:', {
                trajectoryLength: trajectory?.length || 0,
                hasOrbitalElements: !!ship.orbitalElements,
                hasSail: !!ship.sail,
                soiState: ship.soiState
            });
        }
        return;
    }


    // NOTE: trajectory-predictor.js now outputs heliocentric coordinates always.
    // When in SOI, it internally converts planetocentric → heliocentric.
    // DO NOT add parent offset here - it's already included in trajectory positions.

    // Draw trajectory with gradient fade
    ctx.lineWidth = 2;
    ctx.setLineDash([]);  // Solid line (not dashed like Keplerian)

    // Draw in segments with decreasing alpha for time direction indication
    const segmentCount = trajectory.length - 1;

    for (let i = 0; i < segmentCount; i++) {
        const progress = i / segmentCount;
        const alpha = 0.8 - progress * 0.6;  // Fade from 0.8 to 0.2

        // Magenta/purple color to distinguish from green Keplerian orbit
        ctx.strokeStyle = `rgba(200, 100, 255, ${alpha})`;

        const p1 = trajectory[i];
        const p2 = trajectory[i + 1];

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
        glowGradient.addColorStop(0, `rgba(200, 100, 255, ${0.6 * pulseIntensity})`);
        glowGradient.addColorStop(1, 'rgba(200, 100, 255, 0)');
        ctx.fillStyle = glowGradient;
        ctx.beginPath();
        ctx.arc(startProj.x, startProj.y, 6, 0, Math.PI * 2);
        ctx.fill();

        // Core marker
        ctx.fillStyle = 'rgba(200, 100, 255, 0.9)';
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

    const cache = getIntersectionCache();
    if (!cache.results || cache.results.length === 0) return;

    const player = getPlayerShip();
    if (!player) return;

    // Filter to only show ghost planets for the currently targeted destination
    // and respect body filters
    const targetedIntersections = cache.results.filter(intersection => {
        if (intersection.bodyName !== destination) return false;

        // Check if body is visible based on category filter
        const body = celestialBodies.find(b => b.name === intersection.bodyName);
        if (body && body.category && !bodyFilters[body.category]) return false;

        return true;
    });

    for (const intersection of targetedIntersections) {
        const bodyPos = intersection.bodyPosition;

        // Handle coordinate transformation for body positions
        let renderX = bodyPos.x;
        let renderY = bodyPos.y;
        let renderZ = bodyPos.z;

        // CRITICAL: Moons (Phobos, Luna, Ganymede) have positions relative to their parent
        // We must add the parent's heliocentric position to render them correctly
        const body = celestialBodies.find(b => b.name === intersection.bodyName);
        if (body && body.parent && body.parent !== 'SUN') {
            // This is a moon - add parent body's position
            const parent = celestialBodies.find(b => b.name === body.parent);
            if (parent) {
                renderX += parent.x;
                renderY += parent.y;
                renderZ += parent.z;
            }
        }

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

        // VISUAL POLISH: Pulsing glow for imminent encounters (< 24 hours)
        if (deltaDays < 1 && deltaDays > 0) {
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

        // Draw ghost planet (50% transparent)
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = display.color;
        ctx.beginPath();
        ctx.arc(projected.x, projected.y, display.radius, 0, Math.PI * 2);
        ctx.fill();

        // Draw subtle outline (70% transparent for visibility)
        ctx.strokeStyle = display.color;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.7;
        ctx.stroke();

        ctx.restore();

        // Draw time-offset label
        const timeOffset = formatTimeOffset(julianDate, intersection.time);
        const labelText = `${intersection.bodyName} ${timeOffset}`;

        ctx.save();
        ctx.globalAlpha = 0.8;
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


