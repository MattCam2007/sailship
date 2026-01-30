# 3D Flight Cockpit View - Final Implementation Plan

**Version:** 2.0 (Reviewed)
**Date:** 2026-01-30
**Status:** APPROVED FOR IMPLEMENTATION

---

## Executive Summary

This plan creates a first-person 3D cockpit view (`flight.html`) for the sailship solar system navigation game. All critical issues from review have been addressed.

### Review Results

| Reviewer | Status | Confidence |
|----------|--------|------------|
| **Physics/Realism** | PASS | 92% |
| **Architecture** | PASS | 85% |
| **Functionality** | PLAN APPROVED | Ready to implement |
| **Failure Modes** | PLAN APPROVED | All guards designed |

### Critical Issues Resolved

1. **Double Physics Execution** → Tab-based design (separate pages)
2. **Camera State Redundancy** → Euler angles only (no direction/up vectors)
3. **Angular Size Approximation** → Exact tan formula
4. **Depth Guards Missing** → Comprehensive validation added
5. **Input Handler Duplication** → Separate control modules

---

## Architecture

### File Structure

```
src/
├── flight.html              # Standalone cockpit view page
├── js/
│   ├── flight-main.js       # Entry point (ONLY game loop running)
│   ├── core/
│   │   └── flight-camera.js # Perspective camera (Euler angles only)
│   └── ui/
│       ├── flight-renderer.js    # Scene and HUD rendering
│       └── flight-controls.js    # Flight-specific controls only
```

### Page Isolation Principle

```
index.html                     flight.html
    │                              │
    ▼                              ▼
main.js (game loop)           flight-main.js (game loop)
    │                              │
    ▼                              ▼
renderer.js (2D ortho)        flight-renderer.js (3D persp)
    │                              │
    └────────► SHARED DATA ◄───────┘
              (ships.js, celestialBodies.js, gameState.js)
```

**Key:** Only ONE game loop runs at a time. No double physics.

---

## Implementation Units

### Unit 1: Flight Camera (`flight-camera.js`)

**Camera State - Euler Angles Only:**
```javascript
export const flightCamera = {
    position: { x: 0, y: 0, z: 0 },
    yaw: 0,      // Horizontal rotation (radians)
    pitch: 0,    // Vertical rotation (radians), clamped ±85°
    fov: 60,     // Field of view (degrees)
};
```

**Perspective Projection with Guards:**
```javascript
export function projectPerspective(worldX, worldY, worldZ, centerX, centerY, canvasHeight) {
    // Input validation
    if (!isFinite(worldX) || !isFinite(worldY) || !isFinite(worldZ)) return null;

    // Vector from camera to point
    const dx = worldX - flightCamera.position.x;
    const dy = worldY - flightCamera.position.y;
    const dz = worldZ - flightCamera.position.z;

    // Rotation (Rz then Ry)
    const cosYaw = Math.cos(flightCamera.yaw);
    const sinYaw = Math.sin(flightCamera.yaw);
    const cosPitch = Math.cos(flightCamera.pitch);
    const sinPitch = Math.sin(flightCamera.pitch);

    const x1 = dx * cosYaw + dy * sinYaw;
    const y1 = -dx * sinYaw + dy * cosYaw;
    const z1 = dz;

    const depth = x1 * cosPitch + z1 * sinPitch;
    const localY = y1;
    const localZ = -x1 * sinPitch + z1 * cosPitch;

    // Depth guards
    if (depth <= 0.0001) return null;  // Behind or too close

    // Focal length from FOV
    const fovRad = flightCamera.fov * Math.PI / 180;
    const focalLength = (canvasHeight / 2) / Math.tan(fovRad / 2);

    // Perspective projection
    const screenX = centerX + (focalLength * localY) / depth;
    const screenY = centerY - (focalLength * localZ) / depth;

    // Output guards
    if (!isFinite(screenX) || !isFinite(screenY)) return null;
    if (Math.abs(screenX) > 100000 || Math.abs(screenY) > 100000) return null;

    return { x: screenX, y: screenY, depth, scale: focalLength / depth };
}
```

**Angular Size - Exact Formula:**
```javascript
export function calculateAngularSize(physicalRadiusKm, distanceAU, canvasHeight) {
    if (!isFinite(distanceAU) || distanceAU <= 0) return 2;
    if (!isFinite(physicalRadiusKm) || physicalRadiusKm <= 0) return 2;

    const radiusAU = physicalRadiusKm / 149597870.7;
    const angularDiameter = 2 * Math.atan(radiusAU / distanceAU);

    const fovRad = flightCamera.fov * Math.PI / 180;
    const focalLength = (canvasHeight / 2) / Math.tan(fovRad / 2);
    const pixelDiameter = 2 * focalLength * Math.tan(angularDiameter / 2);

    return Math.max(2, Math.min(pixelDiameter, canvasHeight));
}
```

### Unit 2: Flight Renderer (`flight-renderer.js`)

**Rendering Order:**
1. Clear canvas (black)
2. Draw starfield background
3. Collect visible objects + project
4. Depth sort (furthest first, stable)
5. Render celestial bodies (Sun with corona)
6. Render HUD overlay

**Depth Sorting (Stable):**
```javascript
renderList.sort((a, b) => {
    const depthDiff = b.projected.depth - a.projected.depth;
    if (Math.abs(depthDiff) > 1e-10) return depthDiff;
    return a.name.localeCompare(b.name);  // Stable tie-breaker
});
```

### Unit 3: Flight Controls (`flight-controls.js`)

| Input | Action |
|-------|--------|
| Mouse drag | Rotate camera (yaw/pitch) |
| Scroll | Adjust FOV (10-120°) |
| `[` / `]` | Sail yaw ±5° |
| `{` / `}` | Sail pitch ±5° |
| `-` / `=` | Sail deployment ±10% |
| `R` | Reset camera to velocity |
| `ESC` | Return to navigation view |

### Unit 4: Flight Main (`flight-main.js`)

**Single Game Loop:**
```javascript
let gameLoopId = null;

function updatePositions() {
    advanceTime();
    updateCelestialPositions();
    const player = getPlayerShip();
    if (player) updateShipPhysics(player, timeScale);
    updateNPCShips(timeScale);
}

function gameLoop() {
    updatePositions();
    updateCameraFromShip(getPlayerShip());
    renderFlightView();
    gameLoopId = requestAnimationFrame(gameLoop);
}

// Cleanup on navigation
window.addEventListener('beforeunload', () => {
    if (gameLoopId) cancelAnimationFrame(gameLoopId);
});
```

### Unit 5: Flight HTML (`flight.html`)

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <title>FLIGHT VIEW // COCKPIT</title>
    <link rel="stylesheet" href="css/main.css">
</head>
<body>
    <div class="flight-container">
        <canvas id="flightCanvas"></canvas>
    </div>
    <button class="flight-nav-button" onclick="location.href='index.html'">
        ← NAVIGATION VIEW
    </button>
    <div class="flight-help">
        DRAG: Look | SCROLL: Zoom | ESC: Exit
    </div>
    <script type="module" src="js/flight-main.js"></script>
</body>
</html>
```

---

## Verification Checklist

- [ ] Page loads without errors
- [ ] Canvas fills viewport
- [ ] Sun visible with corona
- [ ] Planets visible at correct positions
- [ ] Objects scale with distance (perspective)
- [ ] Mouse drag rotates view
- [ ] Keyboard controls work
- [ ] HUD displays ship data
- [ ] ESC returns to nav view
- [ ] No console errors
- [ ] 60 FPS maintained

---

## Risk Assessment

| Risk | Severity | Status |
|------|----------|--------|
| Double physics | CRITICAL | MITIGATED (separate pages) |
| Division by zero | CRITICAL | MITIGATED (depth guards) |
| Gimbal lock | MEDIUM | MITIGATED (±85° clamp) |
| State loss on nav | LOW | ACCEPTABLE |

---

## Implementation Order

1. `flight-camera.js` - Camera + projection math
2. `flight.html` - Page structure
3. `flight-main.js` - Game loop
4. `flight-renderer.js` - Scene rendering
5. `flight-controls.js` - Input handling
6. Navigation button in `index.html`

**Estimated Total: 4-5 hours**
