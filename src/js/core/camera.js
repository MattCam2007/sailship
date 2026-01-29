/**
 * Camera system for 3D projection
 */

export const camera = {
    angleX: 15 * Math.PI / 180,  // Tilt from above
    angleZ: 0,                    // Rotation around Z
    zoom: 1,
    // Target tracking - camera centers on this position
    target: {
        x: 0,
        y: 0,
        z: 0
    },
    followTarget: null  // Name of object to follow, or null for origin
};

/**
 * Set camera to follow a named object
 * @param {string|null} objectName - Name of object to follow, or null for origin
 */
export function setCameraFollow(objectName) {
    camera.followTarget = objectName;
    if (!objectName) {
        camera.target.x = 0;
        camera.target.y = 0;
        camera.target.z = 0;
    }
}

/**
 * Stop following any object but keep current camera position
 * Use this for manual panning to preserve the current view
 */
export function stopFollowing() {
    camera.followTarget = null;
}

/**
 * Reset camera view to default orientation
 */
export function resetCamera() {
    camera.angleX = 15 * Math.PI / 180;
    camera.angleZ = 0;
    camera.zoom = 1;
}

/**
 * Update camera target position based on followed object
 * @param {Array} celestialBodies - Array of celestial bodies
 * @param {Array} ships - Array of ships
 */
export function updateCameraTarget(celestialBodies, ships) {
    if (!camera.followTarget) return;
    
    // Search in celestial bodies first
    const body = celestialBodies.find(b => b.name === camera.followTarget);
    if (body) {
        camera.target.x = body.x;
        camera.target.y = body.y;
        camera.target.z = body.z;
        return;
    }
    
    // Search in ships
    const ship = ships.find(s => s.name === camera.followTarget);
    if (ship) {
        camera.target.x = ship.x;
        camera.target.y = ship.y;
        camera.target.z = ship.z;
    }
}

/**
 * Project 3D coordinates to 2D screen space
 * @param {number} x - X coordinate in AU
 * @param {number} y - Y coordinate in AU
 * @param {number} z - Z coordinate in AU
 * @param {number} centerX - Screen center X
 * @param {number} centerY - Screen center Y
 * @param {number} scale - Pixels per AU
 * @returns {{x: number, y: number, depth: number}} Projected coordinates
 */
export function project3D(x, y, z, centerX, centerY, scale) {
    // Offset by camera target (center view on target)
    x -= camera.target.x;
    y -= camera.target.y;
    z -= camera.target.z;
    
    // Rotate around Z axis
    const cosZ = Math.cos(camera.angleZ);
    const sinZ = Math.sin(camera.angleZ);
    const x1 = x * cosZ - y * sinZ;
    const y1 = x * sinZ + y * cosZ;
    
    // Rotate around X axis (tilt view)
    const cosX = Math.cos(camera.angleX);
    const sinX = Math.sin(camera.angleX);
    const y2 = y1 * cosX - z * sinX;
    const z2 = y1 * sinX + z * cosX;
    
    // Project to 2D (simple orthographic for now)
    return {
        x: centerX + x1 * scale * camera.zoom,
        y: centerY - y2 * scale * camera.zoom,  // Flip Y for screen coords
        depth: z2  // Keep depth for sorting/effects
    };
}
