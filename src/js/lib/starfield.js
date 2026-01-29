/**
 * Starfield rendering with date-accurate precession (1800-2500)
 *
 * Renders background star field using Yale Bright Star Catalog (BSC5).
 * Stars are positioned using equatorial coordinates (RA/Dec) converted to
 * ecliptic frame, with IAU precession corrections applied based on date.
 *
 * Coordinate transforms:
 * - Equatorial (RA/Dec J2000) → Ecliptic (x,y,z) for 3D projection
 * - Precession applied using simplified IAU formula for 1800-2500 range
 *
 * Visual properties:
 * - Star color mapped from B-V color index (blue → white → yellow → red)
 * - Brightness mapped from visual magnitude (-1.5 to +6.0)
 */

import { camera } from '../core/camera.js';
import { getJulianDate } from '../core/gameState.js';

// ============================================================================
// Star Catalog Data
// ============================================================================

let stars = null;
let starCatalogLoaded = false;

/**
 * Load star catalog asynchronously
 * @returns {Promise<Array>} Array of processed star objects
 */
export async function loadStarCatalog() {
    if (starCatalogLoaded && stars) {
        console.log('[STARFIELD] Catalog already loaded:', stars.length, 'stars');
        return stars;
    }

    console.log('[STARFIELD] Loading star catalog from data/stars/bsc5-processed.json');
    try {
        const response = await fetch('data/stars/bsc5-processed.json');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        stars = await response.json();
        starCatalogLoaded = true;
        console.log(`[STARFIELD] Successfully loaded ${stars.length} stars`);
        console.log('[STARFIELD] Sample star:', stars[0]);
        return stars;
    } catch (error) {
        console.error('[STARFIELD] Failed to load star catalog:', error);
        stars = [];
        starCatalogLoaded = false;
        return stars;
    }
}

// ============================================================================
// Precession Calculations (500-3500)
// ============================================================================

/**
 * Obliquity of the ecliptic at J2000.0 (angle between equatorial and ecliptic planes)
 * ε₀ = 23.4392911° = 0.409092804 radians
 */
const ECLIPTIC_OBLIQUITY = 23.4392911 * Math.PI / 180;

/**
 * Apply IAU precession corrections to equatorial coordinates
 *
 * Uses IAU 1976 precession formula with cubic terms.
 * Valid for ~±1500 years from J2000 (approximately 500-3500 AD).
 *
 * Precession effects:
 * - ζ (zeta): rotation about z-axis
 * - z: rotation about original z-axis
 * - θ (theta): rotation about intermediate axis
 *
 * Formula from Astronomical Almanac (IAU 1976):
 * ζ = 2306.2181"T + 0.30188"T² + 0.017998"T³
 * z = 2306.2181"T + 1.09468"T² + 0.018203"T³
 * θ = 2004.3109"T - 0.42665"T² - 0.041833"T³
 *
 * where T = (target_year - 2000) / 100 (centuries from J2000)
 *
 * Accuracy: Excellent for ±5 centuries (1500-2500), good for ±10 centuries
 * (1000-3000), acceptable for visual display at ±15 centuries (500-3500).
 * Beyond this range, higher-order terms and nutation become significant.
 *
 * @param {number} ra - Right Ascension in degrees (J2000)
 * @param {number} dec - Declination in degrees (J2000)
 * @param {number} targetYear - Target year for precession (500-3500 recommended)
 * @returns {{ra: number, dec: number}} Precessed coordinates in degrees
 */
function applyPrecession(ra, dec, targetYear) {
    // Convert target year to centuries from J2000.0
    const T = (targetYear - 2000.0) / 100.0;

    // Precession angles in arcseconds, converted to radians
    const arcsecToRad = Math.PI / (180 * 3600);

    const zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T * T * T) * arcsecToRad;
    const z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T * T * T) * arcsecToRad;
    const theta = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T * T * T) * arcsecToRad;

    // Convert RA/Dec to radians
    const raRad = ra * Math.PI / 180;
    const decRad = dec * Math.PI / 180;

    // Convert to Cartesian coordinates (unit sphere)
    const cosRa = Math.cos(raRad);
    const sinRa = Math.sin(raRad);
    const cosDec = Math.cos(decRad);
    const sinDec = Math.sin(decRad);

    const x0 = cosDec * cosRa;
    const y0 = cosDec * sinRa;
    const z0 = sinDec;

    // Apply precession rotations (three successive rotations)
    const cosZeta = Math.cos(zeta);
    const sinZeta = Math.sin(zeta);
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);
    const cosZ = Math.cos(z);
    const sinZ = Math.sin(z);

    // Rotation matrix multiplication (R_z(−z) · R_y(θ) · R_z(−ζ))
    const x1 = x0 * cosZeta + y0 * sinZeta;
    const y1 = -x0 * sinZeta + y0 * cosZeta;
    const z1 = z0;

    const x2 = x1 * cosTheta - z1 * sinTheta;
    const y2 = y1;
    const z2 = x1 * sinTheta + z1 * cosTheta;

    const x3 = x2 * cosZ + y2 * sinZ;
    const y3 = -x2 * sinZ + y2 * cosZ;
    const z3 = z2;

    // Convert back to spherical coordinates
    const raPrecessed = Math.atan2(y3, x3) * 180 / Math.PI;
    const decPrecessed = Math.asin(z3) * 180 / Math.PI;

    // Normalize RA to [0, 360)
    const raNormalized = ((raPrecessed % 360) + 360) % 360;

    return { ra: raNormalized, dec: decPrecessed };
}

/**
 * Get current year for precession calculation
 * Uses game simulation time (Julian date)
 * @returns {number} Year as decimal (e.g., 2024.5)
 */
function getCurrentYear() {
    // Convert Julian date to year
    // J2000 epoch (JD 2451545.0) = year 2000.0
    const jd = getJulianDate();
    return 2000.0 + (jd - 2451545.0) / 365.25;
}

// ============================================================================
// Coordinate Transforms
// ============================================================================

/**
 * Convert equatorial coordinates (RA/Dec) to ecliptic Cartesian (x,y,z)
 *
 * The ecliptic plane is the fundamental plane for solar system dynamics.
 * Equatorial coordinates use Earth's equator as fundamental plane.
 *
 * Transform accounts for obliquity of the ecliptic (ε ≈ 23.44°).
 *
 * Stars are placed at fixed radius (1000 AU) to act as background.
 *
 * @param {number} ra - Right Ascension in degrees
 * @param {number} dec - Declination in degrees
 * @param {number} radius - Distance in AU (default 1000 for background)
 * @returns {{x: number, y: number, z: number}} Ecliptic coordinates in AU
 */
function equatorialToEcliptic(ra, dec, radius = 1000) {
    const raRad = ra * Math.PI / 180;
    const decRad = dec * Math.PI / 180;
    const epsilon = ECLIPTIC_OBLIQUITY;

    // Convert to equatorial Cartesian
    const xEq = radius * Math.cos(decRad) * Math.cos(raRad);
    const yEq = radius * Math.cos(decRad) * Math.sin(raRad);
    const zEq = radius * Math.sin(decRad);

    // Rotate by obliquity to get ecliptic coordinates
    // x stays same (vernal equinox direction)
    // y,z rotate by ε
    const xEcl = xEq;
    const yEcl = yEq * Math.cos(epsilon) + zEq * Math.sin(epsilon);
    const zEcl = -yEq * Math.sin(epsilon) + zEq * Math.cos(epsilon);

    return { x: xEcl, y: yEcl, z: zEcl };
}

// ============================================================================
// Star Projection (Fixed Background)
// ============================================================================

/**
 * Project star to screen coordinates
 *
 * Stars are at "infinity" so they don't translate with camera position.
 * Only camera rotation is applied to create the fixed background effect.
 *
 * This is different from project3D() which offsets by camera.target.
 *
 * @param {number} x - Ecliptic X coordinate (AU)
 * @param {number} y - Ecliptic Y coordinate (AU)
 * @param {number} z - Ecliptic Z coordinate (AU)
 * @param {number} centerX - Canvas center X
 * @param {number} centerY - Canvas center Y
 * @param {number} scale - Scale factor (not used for stars at infinity)
 * @returns {{x: number, y: number}} Screen coordinates
 */
function projectStarToScreen(x, y, z, centerX, centerY) {
    // Stars are at infinity - only direction matters
    // Apply exact same rotation as project3D, but no camera.target offset

    // Rotate around Z axis (same as project3D line 91-94)
    const cosZ = Math.cos(camera.angleZ);
    const sinZ = Math.sin(camera.angleZ);
    const x1 = x * cosZ - y * sinZ;
    const y1 = x * sinZ + y * cosZ;

    // Rotate around X axis / tilt view (same as project3D line 97-100)
    const cosX = Math.cos(camera.angleX);
    const sinX = Math.sin(camera.angleX);
    const y2 = y1 * cosX - z * sinX;
    const z2 = y1 * sinX + z * cosX;

    // Project to screen (same pattern as project3D line 104-105)
    // But use fixed scale instead of variable scale * zoom
    // Scale large enough so stars extend well beyond canvas edges
    // This ensures we see stars in all directions (full sky coverage)
    const starScale = Math.max(centerX, centerY) * 2.0;

    return {
        x: centerX + x1 * starScale,
        y: centerY - y2 * starScale,  // Flip Y for screen coords
        depth: z2
    };
}

// ============================================================================
// Visual Properties
// ============================================================================

/**
 * Map B-V color index to RGB color
 *
 * B-V index measures star color (blue magnitude minus visual magnitude):
 * - B-V < 0: Hot blue-white stars (O, B type) - 10,000+ K
 * - B-V ≈ 0.0: White stars (A type) - 7,500-10,000 K
 * - B-V ≈ 0.6: Yellow stars like Sun (G type) - 5,000-6,000 K
 * - B-V ≈ 1.5: Orange-red stars (K type) - 3,500-5,000 K
 * - B-V > 2: Deep red stars (M type) - < 3,500 K
 *
 * Color mapping based on blackbody radiation and stellar spectra.
 *
 * @param {number} bv - B-V color index (-0.3 to +2.0 typical)
 * @returns {string} RGB color string (e.g., "rgb(155, 176, 255)")
 */
function getStarColor(bv) {
    // Clamp to reasonable range
    const clampedBV = Math.max(-0.4, Math.min(2.0, bv));

    let r, g, b;

    if (clampedBV < -0.2) {
        // Deep blue (hot O-type stars)
        r = 155; g = 176; b = 255;
    } else if (clampedBV < 0.0) {
        // Blue-white (B-type)
        const t = (clampedBV + 0.2) / 0.2;
        r = Math.round(155 + t * 45);  // 155 → 200
        g = Math.round(176 + t * 54);  // 176 → 230
        b = 255;
    } else if (clampedBV < 0.3) {
        // White (A-type)
        const t = clampedBV / 0.3;
        r = Math.round(200 + t * 35);  // 200 → 235
        g = Math.round(230 + t * 20);  // 230 → 250
        b = 255;
    } else if (clampedBV < 0.6) {
        // White-yellow (F-type)
        const t = (clampedBV - 0.3) / 0.3;
        r = Math.round(235 + t * 20);  // 235 → 255
        g = Math.round(250 + t * 5);   // 250 → 255
        b = Math.round(255 - t * 15);  // 255 → 240
    } else if (clampedBV < 1.0) {
        // Yellow (G-type, like Sun)
        const t = (clampedBV - 0.6) / 0.4;
        r = 255;
        g = Math.round(255 - t * 11);  // 255 → 244
        b = Math.round(240 - t * 6);   // 240 → 234
    } else if (clampedBV < 1.5) {
        // Orange (K-type)
        const t = (clampedBV - 1.0) / 0.5;
        r = 255;
        g = Math.round(244 - t * 40);  // 244 → 204
        b = Math.round(234 - t * 123); // 234 → 111
    } else {
        // Red (M-type)
        const t = Math.min(1.0, (clampedBV - 1.5) / 0.5);
        r = Math.round(255 - t * 55);  // 255 → 200
        g = Math.round(204 - t * 104); // 204 → 100
        b = Math.round(111 - t * 61);  // 111 → 50
    }

    return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Map visual magnitude to star rendering properties
 *
 * Visual magnitude scale (logarithmic brightness):
 * - Mag -1.5: Sirius (brightest star)
 * - Mag 0: Vega, Arcturus
 * - Mag 1: Spica, Antares
 * - Mag 3: Moderately bright stars
 * - Mag 6: Faintest naked-eye stars
 *
 * Returns radius (pixels) and alpha (opacity 0-1) for rendering.
 * Brighter stars = larger + more opaque.
 *
 * @param {number} mag - Visual magnitude (-1.5 to 6.0)
 * @returns {{radius: number, alpha: number}} Rendering properties
 */
function getStarBrightness(mag) {
    // Clamp to catalog range
    const clampedMag = Math.max(-1.5, Math.min(6.0, mag));

    // Map magnitude to radius (1.0 to 2.5 pixels)
    // Brighter (lower mag) = larger radius
    const radius = 2.5 - (clampedMag + 1.5) * 0.2;  // -1.5→2.5px, 6.0→1.0px

    // Map magnitude to alpha (0.2 to 0.9)
    // Exponential falloff for natural appearance
    const alpha = 0.9 * Math.pow(2.512, -(clampedMag + 1.5) / 3);  // -1.5→0.9, 6.0→0.2

    return {
        radius: Math.max(0.5, radius),
        alpha: Math.max(0.15, Math.min(0.95, alpha))
    };
}

// ============================================================================
// Rendering
// ============================================================================

/**
 * Draw starfield background
 *
 * Renders all visible stars with:
 * - Date-accurate precession (1800-2500)
 * - Color mapped from B-V index
 * - Brightness mapped from visual magnitude
 * - Camera-aware culling (only draw stars in view)
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} centerX - Canvas center X
 * @param {number} centerY - Canvas center Y
 * @param {number} scale - Pixels per AU
 */
export function drawStarfield(ctx, centerX, centerY, scale) {
    if (!starCatalogLoaded || !stars || stars.length === 0) {
        console.warn('[STARFIELD] Catalog not loaded:', { starCatalogLoaded, starCount: stars?.length });
        return;
    }

    const currentYear = getCurrentYear();
    const canvasWidth = ctx.canvas.width;
    const canvasHeight = ctx.canvas.height;

    // Debug: log first render
    if (Math.random() < 0.01) {  // 1% sampling to avoid spam
        console.log('[STARFIELD] Rendering:', { stars: stars.length, currentYear, canvasWidth, canvasHeight, scale });
    }

    let renderedCount = 0;
    let culledCount = 0;

    // Draw stars
    for (const star of stars) {
        // Apply precession to get current epoch coordinates
        const precessed = applyPrecession(star.ra, star.dec, currentYear);

        // Convert to ecliptic Cartesian coordinates (at unit sphere)
        const { x, y, z } = equatorialToEcliptic(precessed.ra, precessed.dec, 1.0);

        // Project to screen using custom star projection (no camera position offset)
        const projected = projectStarToScreen(x, y, z, centerX, centerY);

        // Cull stars behind camera (back-face culling)
        // Only render stars we're facing (depth > 0 means in front of camera)
        if (projected.depth <= 0) {
            culledCount++;
            continue;
        }

        // Cull off-screen stars (with margin for large/bright stars)
        const margin = 10;
        if (projected.x < -margin || projected.x > canvasWidth + margin) {
            culledCount++;
            continue;
        }
        if (projected.y < -margin || projected.y > canvasHeight + margin) {
            culledCount++;
            continue;
        }

        // Get visual properties
        const color = getStarColor(star.bv);
        const { radius, alpha } = getStarBrightness(star.mag);

        // Draw star as filled circle with glow
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;

        // Main star point
        ctx.beginPath();
        ctx.arc(projected.x, projected.y, radius, 0, Math.PI * 2);
        ctx.fill();

        // Subtle glow for brighter stars (mag < 3)
        if (star.mag < 3.0) {
            const glowAlpha = alpha * 0.3;
            const glowRadius = radius * 1.8;
            ctx.globalAlpha = glowAlpha;
            ctx.beginPath();
            ctx.arc(projected.x, projected.y, glowRadius, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
        renderedCount++;
    }

    // Debug log
    if (Math.random() < 0.01) {
        console.log('[STARFIELD] Rendered:', renderedCount, 'Culled:', culledCount);
    }
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize starfield (call this once at app startup)
 * Loads star catalog asynchronously
 */
export async function initStarfield() {
    await loadStarCatalog();
}
