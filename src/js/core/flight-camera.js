/**
 * Flight Camera System
 * Perspective projection for 3D cockpit view
 */

// Camera state - Euler angles only (no direction/up vectors)
export const flightCamera = {
    position: { x: 0, y: 0, z: 0 },
    yaw: 0,      // Horizontal rotation (radians)
    pitch: 0,    // Vertical rotation (radians)
    fov: 60,     // Field of view (degrees)
    manualOverride: false
};

const PITCH_LIMIT = 85 * Math.PI / 180;

/**
 * Initialize flight camera
 */
export function initFlightCamera(canvas) {
    flightCamera.yaw = 0;
    flightCamera.pitch = 0;
    flightCamera.fov = 60;
    flightCamera.manualOverride = false;
    console.log('[FLIGHT_CAMERA] Initialized');
}

/**
 * Compute view direction from angles (on-demand, never stored)
 */
export function getCameraDirection() {
    const cosPitch = Math.cos(flightCamera.pitch);
    return {
        x: cosPitch * Math.cos(flightCamera.yaw),
        y: cosPitch * Math.sin(flightCamera.yaw),
        z: Math.sin(flightCamera.pitch)
    };
}

/**
 * Update camera position from ship state
 */
export function updateCameraFromShip(ship) {
    if (!ship) return;

    flightCamera.position.x = ship.x;
    flightCamera.position.y = ship.y;
    flightCamera.position.z = ship.z;

    // Default view: velocity direction (if not manual override)
    if (!flightCamera.manualOverride && ship.velocity) {
        const vMag = Math.sqrt(
            ship.velocity.x ** 2 +
            ship.velocity.y ** 2 +
            ship.velocity.z ** 2
        );
        if (vMag > 1e-10) {
            const vx = ship.velocity.x / vMag;
            const vy = ship.velocity.y / vMag;
            const vz = ship.velocity.z / vMag;
            flightCamera.yaw = Math.atan2(vy, vx);
            flightCamera.pitch = Math.asin(Math.max(-1, Math.min(1, vz)));
        }
    }
}

/**
 * Rotate camera by delta angles
 */
export function rotateCamera(deltaYaw, deltaPitch) {
    flightCamera.manualOverride = true;
    flightCamera.yaw += deltaYaw;
    flightCamera.yaw = ((flightCamera.yaw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    flightCamera.pitch += deltaPitch;
    flightCamera.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, flightCamera.pitch));
}

/**
 * Reset camera to follow velocity
 */
export function resetCameraView() {
    flightCamera.manualOverride = false;
}

/**
 * Project 3D world coordinates to 2D screen using perspective
 */
export function projectPerspective(worldX, worldY, worldZ, centerX, centerY, canvasHeight) {
    if (!isFinite(worldX) || !isFinite(worldY) || !isFinite(worldZ)) return null;

    const dx = worldX - flightCamera.position.x;
    const dy = worldY - flightCamera.position.y;
    const dz = worldZ - flightCamera.position.z;

    const cosYaw = Math.cos(flightCamera.yaw);
    const sinYaw = Math.sin(flightCamera.yaw);
    const cosPitch = Math.cos(flightCamera.pitch);
    const sinPitch = Math.sin(flightCamera.pitch);

    // Rotate around Z (yaw)
    const x1 = dx * cosYaw + dy * sinYaw;
    const y1 = -dx * sinYaw + dy * cosYaw;
    const z1 = dz;

    // Rotate around Y (pitch)
    const depth = x1 * cosPitch + z1 * sinPitch;
    const localY = y1;
    const localZ = -x1 * sinPitch + z1 * cosPitch;

    // Depth guards
    const MIN_DEPTH = 0.0001;
    if (depth <= 0 || depth < MIN_DEPTH) return null;

    // Focal length from FOV
    const fovRad = flightCamera.fov * Math.PI / 180;
    const halfFovTan = Math.tan(fovRad / 2);
    if (halfFovTan <= 0) return null;
    const focalLength = (canvasHeight / 2) / halfFovTan;

    // Perspective projection
    const screenX = centerX + (focalLength * localY) / depth;
    const screenY = centerY - (focalLength * localZ) / depth;

    // Output guards
    const MAX_SCREEN = 100000;
    if (Math.abs(screenX) > MAX_SCREEN || Math.abs(screenY) > MAX_SCREEN) return null;
    if (!isFinite(screenX) || !isFinite(screenY)) return null;

    return { x: screenX, y: screenY, depth, scale: focalLength / depth };
}

/**
 * Calculate pixel diameter for celestial body (EXACT formula)
 */
export function calculateAngularSize(physicalRadiusKm, distanceAU, canvasHeight) {
    if (!isFinite(distanceAU) || distanceAU <= 0) return 2;
    if (!isFinite(physicalRadiusKm) || physicalRadiusKm <= 0) return 2;
    if (!isFinite(canvasHeight) || canvasHeight <= 0) return 2;

    const radiusAU = physicalRadiusKm / 149597870.7;
    const angularDiameter = 2 * Math.atan(radiusAU / distanceAU);

    const fovRad = flightCamera.fov * Math.PI / 180;
    const focalLength = (canvasHeight / 2) / Math.tan(fovRad / 2);
    const pixelDiameter = 2 * focalLength * Math.tan(angularDiameter / 2);

    return Math.max(2, Math.min(pixelDiameter, canvasHeight));
}
