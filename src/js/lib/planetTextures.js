/**
 * Offscreen WebGL planet texture renderer.
 *
 * Creates a hidden WebGL canvas, loads equirectangular planet textures,
 * and renders textured spheres with lighting. The rendered result is
 * composited onto the main 2D canvas via ctx.drawImage().
 *
 * Textures: Solar System Scope (CC-BY 4.0)
 * https://www.solarsystemscope.com/textures/
 *
 * Architecture:
 *   - Single offscreen WebGL2 canvas shared by all planet renders
 *   - One texture per planet body, loaded asynchronously
 *   - Fragment shader does analytic ray-sphere intersection
 *   - Equirectangular texture sampling with Lambertian lighting
 *   - Rendered sphere cached to an offscreen 2D canvas per body,
 *     invalidated when rotation or light direction changes significantly
 */

import { PLANET_TEXTURE_CONFIG } from '../config.js';

// ============================================================================
// Module State
// ============================================================================

/** @type {HTMLCanvasElement} Hidden WebGL canvas */
let glCanvas = null;

/** @type {WebGL2RenderingContext} */
let gl = null;

/** @type {WebGLProgram} */
let shaderProgram = null;

/** @type {Object<string, WebGLTexture>} Loaded textures keyed by body name */
const textures = {};

/** @type {Object<string, HTMLCanvasElement>} Cached rendered spheres per body */
const renderCache = {};

/** @type {Object<string, string>} Cache keys for invalidation (rotation + light hash) */
const cacheKeys = {};

/** @type {Set<string>} Bodies currently loading textures */
const loading = new Set();

/** @type {Set<string>} Bodies that failed to load */
const failed = new Set();

/** Whether the WebGL system initialized successfully */
let initialized = false;

/** Uniform locations */
let uniforms = {};

/** Vertex buffer (fullscreen quad) */
let quadVAO = null;

// ============================================================================
// Shaders
// ============================================================================

const VERTEX_SHADER = `#version 300 es
precision highp float;

// Fullscreen quad: two triangles covering [-1,1] clip space
const vec2 positions[6] = vec2[6](
    vec2(-1, -1), vec2( 1, -1), vec2( 1,  1),
    vec2(-1, -1), vec2( 1,  1), vec2(-1,  1)
);

out vec2 vUV;

void main() {
    vec2 pos = positions[gl_VertexID];
    vUV = pos * 0.5 + 0.5; // [0,1] range
    gl_Position = vec4(pos, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uTexture;
uniform float uRotation;      // Y-axis rotation in radians (planet spin)
uniform float uAxialTilt;     // Axial tilt in radians
uniform vec3 uLightDir;       // Direction TO the sun (normalized)
uniform float uAmbient;       // Ambient light level

// Analytic ray-sphere intersection.
// Ray origin at (0,0,-2), direction toward pixel on near plane.
// Sphere centered at origin with radius 1.
void main() {
    // Map UV [0,1] to [-1,1] centered on sphere
    vec2 ndc = vUV * 2.0 - 1.0;

    // Ray from camera through this pixel
    // Camera at z = -2.5, looking at origin
    vec3 ro = vec3(0.0, 0.0, -2.5);
    vec3 rd = normalize(vec3(ndc.x, ndc.y, 2.0));

    // Analytic sphere intersection: |ro + t*rd|^2 = 1
    float a = dot(rd, rd);
    float b = 2.0 * dot(ro, rd);
    float c = dot(ro, ro) - 1.0;
    float discriminant = b * b - 4.0 * a * c;

    if (discriminant < 0.0) {
        fragColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
    }

    float t = (-b - sqrt(discriminant)) / (2.0 * a);
    vec3 hitPos = ro + t * rd;
    vec3 normal = normalize(hitPos);

    // Apply axial tilt (rotate normal around X axis)
    float cosT = cos(uAxialTilt);
    float sinT = sin(uAxialTilt);
    vec3 tiltedNormal = vec3(
        normal.x,
        normal.y * cosT - normal.z * sinT,
        normal.y * sinT + normal.z * cosT
    );

    // Apply planet rotation (around Y axis)
    float cosR = cos(uRotation);
    float sinR = sin(uRotation);
    vec3 rotatedNormal = vec3(
        tiltedNormal.x * cosR + tiltedNormal.z * sinR,
        tiltedNormal.y,
        -tiltedNormal.x * sinR + tiltedNormal.z * cosR
    );

    // Convert to spherical coordinates for texture sampling
    // longitude = atan(x, z), latitude = asin(y)
    float lon = atan(rotatedNormal.x, rotatedNormal.z);
    float lat = asin(clamp(rotatedNormal.y, -1.0, 1.0));

    // Map to UV: lon [-PI, PI] -> [0, 1], lat [-PI/2, PI/2] -> [0, 1]
    vec2 texCoord = vec2(
        lon / (2.0 * 3.14159265) + 0.5,
        -lat / 3.14159265 + 0.5
    );

    vec4 texColor = texture(uTexture, texCoord);

    // Lambertian lighting using the untilted normal for light calculation
    // (light comes from the sun direction in world space)
    float NdotL = dot(normal, uLightDir);
    float diffuse = max(NdotL, 0.0);

    // Smooth terminator (soften day/night boundary)
    float terminator = smoothstep(-0.1, 0.15, NdotL);

    float lighting = uAmbient + (1.0 - uAmbient) * diffuse * terminator;

    fragColor = vec4(texColor.rgb * lighting, 1.0);

    // Soft edge anti-aliasing: fade out at sphere rim
    float edgeDist = length(ndc);
    float rimFade = 1.0 - smoothstep(0.85, 1.0, edgeDist);
    fragColor.a *= rimFade;
}
`;

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the offscreen WebGL planet texture system.
 * Creates the hidden canvas, compiles shaders, sets up geometry.
 * Call once during game init.
 *
 * @returns {boolean} True if WebGL2 is available and init succeeded
 */
export function initPlanetTextures() {
    try {
        const size = PLANET_TEXTURE_CONFIG.renderSize;

        // Create hidden canvas
        glCanvas = document.createElement('canvas');
        glCanvas.width = size;
        glCanvas.height = size;
        glCanvas.style.display = 'none';

        // Get WebGL2 context
        gl = glCanvas.getContext('webgl2', {
            alpha: true,
            premultipliedAlpha: false,
            antialias: false,
            preserveDrawingBuffer: true,
        });

        if (!gl) {
            console.warn('[PLANET_TEXTURES] WebGL2 not available, falling back to gradient rendering');
            return false;
        }

        // Compile shaders
        const vs = compileShader(gl.VERTEX_SHADER, VERTEX_SHADER);
        const fs = compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
        if (!vs || !fs) return false;

        shaderProgram = gl.createProgram();
        gl.attachShader(shaderProgram, vs);
        gl.attachShader(shaderProgram, fs);
        gl.linkProgram(shaderProgram);

        if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
            console.error('[PLANET_TEXTURES] Shader link failed:', gl.getProgramInfoLog(shaderProgram));
            return false;
        }

        // Get uniform locations
        gl.useProgram(shaderProgram);
        uniforms = {
            uTexture: gl.getUniformLocation(shaderProgram, 'uTexture'),
            uRotation: gl.getUniformLocation(shaderProgram, 'uRotation'),
            uAxialTilt: gl.getUniformLocation(shaderProgram, 'uAxialTilt'),
            uLightDir: gl.getUniformLocation(shaderProgram, 'uLightDir'),
            uAmbient: gl.getUniformLocation(shaderProgram, 'uAmbient'),
        };

        // Create VAO for fullscreen quad (uses gl_VertexID, no actual buffer needed)
        quadVAO = gl.createVertexArray();
        gl.bindVertexArray(quadVAO);
        gl.bindVertexArray(null);

        // Enable blending for soft edges
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        initialized = true;
        console.log('[PLANET_TEXTURES] Initialized WebGL2 offscreen renderer');

        // Start loading textures asynchronously
        loadAllTextures();

        return true;
    } catch (err) {
        console.error('[PLANET_TEXTURES] Init failed:', err);
        return false;
    }
}

/**
 * Compile a WebGL shader.
 * @param {number} type - gl.VERTEX_SHADER or gl.FRAGMENT_SHADER
 * @param {string} source - GLSL source code
 * @returns {WebGLShader|null}
 */
function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const label = type === gl.VERTEX_SHADER ? 'vertex' : 'fragment';
        console.error(`[PLANET_TEXTURES] ${label} shader compile failed:`, gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }

    return shader;
}

// ============================================================================
// Texture Loading
// ============================================================================

/**
 * Start loading all configured planet textures.
 * Loads asynchronously — planets render with gradients until textures are ready.
 */
function loadAllTextures() {
    const { baseUrl, textures: textureMap } = PLANET_TEXTURE_CONFIG;

    for (const [bodyName, filename] of Object.entries(textureMap)) {
        if (loading.has(bodyName) || failed.has(bodyName) || textures[bodyName]) continue;

        loading.add(bodyName);
        const url = baseUrl + filename;

        const img = new Image();

        img.onload = () => {
            loading.delete(bodyName);
            const tex = createTextureFromImage(img);
            if (tex) {
                textures[bodyName] = tex;
                console.log(`[PLANET_TEXTURES] Loaded texture: ${bodyName} (${img.width}x${img.height})`);
            }
        };

        img.onerror = () => {
            loading.delete(bodyName);
            failed.add(bodyName);
            console.warn(`[PLANET_TEXTURES] Failed to load texture: ${bodyName} from ${url}`);
        };

        img.src = url;
    }
}

/**
 * Create a WebGL texture from an HTMLImageElement.
 * @param {HTMLImageElement} img
 * @returns {WebGLTexture|null}
 */
function createTextureFromImage(img) {
    if (!gl) return null;

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);

    // Upload image
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

    // Generate mipmaps for better filtering at small sizes
    gl.generateMipmap(gl.TEXTURE_2D);

    // Filtering
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // Wrap modes (equirectangular wraps horizontally, clamps vertically)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindTexture(gl.TEXTURE_2D, null);

    return tex;
}

// ============================================================================
// Rendering
// ============================================================================

/**
 * Check if a textured render is available for a given body.
 *
 * @param {string} bodyName - e.g. 'EARTH', 'MARS'
 * @returns {boolean} True if texture is loaded and system is ready
 */
export function hasTexture(bodyName) {
    return initialized && !!textures[bodyName];
}

/**
 * Render a textured planet sphere and return it as an ImageBitmap-like source
 * suitable for ctx.drawImage().
 *
 * Uses a per-body 2D canvas cache. Re-renders only when rotation or
 * light direction has changed significantly since last render.
 *
 * @param {string} bodyName - Body name (e.g. 'EARTH')
 * @param {number} screenRadius - Desired screen radius in pixels
 * @param {number} gameDays - Current game time in Julian days (for rotation)
 * @param {number} sunAngle - Angle from body to sun in radians (in the screen plane)
 * @returns {HTMLCanvasElement|null} Cached 2D canvas with the rendered sphere, or null
 */
export function renderPlanetTexture(bodyName, screenRadius, gameDays, sunAngle) {
    if (!initialized || !textures[bodyName]) return null;

    // Determine render resolution: at least 2x screenRadius, capped at renderSize
    const size = Math.min(
        PLANET_TEXTURE_CONFIG.renderSize,
        Math.max(64, Math.ceil(screenRadius * 2.5))
    );

    // Round size to nearest power-of-2-friendly value for better cache stability
    const quantizedSize = Math.ceil(size / 32) * 32;

    // Calculate planet rotation angle (mod 2PI for numerical stability)
    // gameDays is a Julian date (~2,460,000+), so raw rotation would overflow precision
    const rotRate = PLANET_TEXTURE_CONFIG.rotationRates[bodyName] || 0;
    const TWO_PI = 2 * Math.PI;
    const rawRotation = (rotRate * gameDays) * Math.PI / 180;
    const rotation = ((rawRotation % TWO_PI) + TWO_PI) % TWO_PI;
    // Quantize rotation to ~0.5 degree steps for cache stability
    const quantizedRotation = Math.round(rotation * 114.59) / 114.59; // 180/PI ≈ 57.3, *2 = 114.59

    // Axial tilt
    const tilt = (PLANET_TEXTURE_CONFIG.axialTilts[bodyName] || 0) * Math.PI / 180;

    // Quantize sun angle for cache stability (~1 degree)
    const quantizedSunAngle = Math.round(sunAngle * 57.3) / 57.3;

    // Build cache key
    const key = `${bodyName}_${quantizedSize}_${quantizedRotation.toFixed(3)}_${quantizedSunAngle.toFixed(2)}`;

    if (cacheKeys[bodyName] === key && renderCache[bodyName]) {
        return renderCache[bodyName];
    }

    // Render to WebGL
    glCanvas.width = quantizedSize;
    glCanvas.height = quantizedSize;
    gl.viewport(0, 0, quantizedSize, quantizedSize);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(shaderProgram);

    // Bind texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textures[bodyName]);
    gl.uniform1i(uniforms.uTexture, 0);

    // Set uniforms
    gl.uniform1f(uniforms.uRotation, quantizedRotation);
    gl.uniform1f(uniforms.uAxialTilt, tilt);
    gl.uniform1f(uniforms.uAmbient, 0.08);

    // Light direction: sun angle determines where light comes from.
    // sunAngle is the angle in screen-space from the body to the sun.
    // Convert to a 3D light direction for the shader.
    const lx = Math.cos(sunAngle);
    const ly = Math.sin(sunAngle);
    const lz = 0.3; // Slight forward bias so face is lit
    const lLen = Math.sqrt(lx * lx + ly * ly + lz * lz);
    gl.uniform3f(uniforms.uLightDir, lx / lLen, ly / lLen, lz / lLen);

    // Draw fullscreen quad
    gl.bindVertexArray(quadVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);

    // Copy to a 2D canvas for caching (drawImage from WebGL canvas can be slow)
    let cache2d = renderCache[bodyName];
    if (!cache2d || cache2d.width !== quantizedSize || cache2d.height !== quantizedSize) {
        cache2d = document.createElement('canvas');
        cache2d.width = quantizedSize;
        cache2d.height = quantizedSize;
        renderCache[bodyName] = cache2d;
    }

    const ctx2d = cache2d.getContext('2d');
    ctx2d.clearRect(0, 0, quantizedSize, quantizedSize);
    ctx2d.drawImage(glCanvas, 0, 0);

    cacheKeys[bodyName] = key;

    return cache2d;
}

/**
 * Clear all cached renders (call on canvas resize or context loss).
 */
export function clearPlanetTextureCache() {
    for (const key of Object.keys(renderCache)) {
        delete renderCache[key];
    }
    for (const key of Object.keys(cacheKeys)) {
        delete cacheKeys[key];
    }
}

/**
 * Get loading status for diagnostics.
 * @returns {Object} Status info
 */
export function getPlanetTextureStatus() {
    return {
        initialized,
        loaded: Object.keys(textures),
        loading: [...loading],
        failed: [...failed],
        cached: Object.keys(renderCache),
    };
}

if (typeof window !== 'undefined') {
    window.getPlanetTextureStatus = getPlanetTextureStatus;
}
