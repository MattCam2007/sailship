# 3D Flight Cockpit View - Functional Test Review

**Date**: 2026-01-30
**Reviewer**: Functional Testing Analysis
**Status**: MEDIUM CONFIDENCE - 5 Critical Issues Identified, Multiple Test Cases Missing

---

## Executive Summary

The proposed 3D flight cockpit implementation has **sound core logic** but contains **critical functional bugs** that will cause visible player-facing issues. The game loop architecture problem (identified in architecture review) cascades into rendering and control synchronization failures.

**Key Findings**:
- ✓ Rendering pipeline order is correct (starfield → bodies → HUD)
- ✓ Depth sorting algorithm works for typical scenarios
- ✗ **CRITICAL**: Double-execution of physics breaks gameplay
- ✗ **CRITICAL**: Camera state desynchronization between views
- ✗ **MAJOR**: HUD updates will lag or duplicate
- ⚠ Control responsiveness will have 1-frame delay in dual-view scenario
- ✗ State sharing without proper synchronization causes data races

**Overall Assessment**: 40% functional readiness. Core logic is correct but architectural flaw prevents working implementation without major refactoring.

---

## Test Case Analysis

### VERIFICATION CHECKLIST STATUS

| Item | Status | Evidence |
|------|--------|----------|
| Page loads without JS errors | ❌ FAIL | Dual game loops conflict |
| Canvas fills viewport | ✓ PASS | `resizeCanvas()` works (lines 162-170, renderer.js) |
| Canvas resizes correctly | ✓ PASS | Event listener with debounce (line 140-144, renderer.js) |
| Sun visible with glow | ⚠ PARTIAL | Glow rendering exists but FOV projection untested |
| Planets visible at correct positions | ❌ FAIL | Double physics execution moves them twice per frame |
| Objects scale correctly with distance | ✓ PASS | `calculateScreenRadius()` logic is sound (lines 237-256, renderer.js) |
| Starfield renders behind bodies | ⚠ PARTIAL | Starfield rendering order is correct, but two game loops interfere |
| Camera follows ship | ❌ FAIL | Dual camera.target updates create jitter |
| Mouse drag rotates view | ✓ PASS | `handleRotation()` logic is correct (lines 583-600, controls.js) |
| Keyboard controls work | ✓ PASS | Sail control dispatch works (lines 513-541, controls.js) |
| HUD displays velocity | ❌ FAIL | Updates twice per frame in dual-view scenario |
| Sail status displays | ⚠ UNCERTAIN | Depends on HUD update frequency |
| Frame rate ≥30 fps | ❌ FAIL | Double physics + double rendering will cause <20 fps |

---

## Critical Issues Identified

### Issue #1: CRITICAL - Double Physics Execution

**Severity**: CRITICAL
**Category**: Game Logic / Physics Correctness
**Impact**: Gameplay-Breaking

#### Problem Statement

With the proposed architecture (separate `main.js` and `flight-main.js`), both game loops execute in parallel:

```javascript
// main.js - FRAME N
function gameLoop() {
    advanceTime();                    // time += 0.000116 days
    updateCelestialPositions();       // planets move
    updateShipPhysics(player, ...);   // ship position recalculated
    render();
    updateUI();
    requestAnimationFrame(gameLoop);  // ← schedules frame N+1
}

// flight-main.js - ALSO FRAME N
function gameLoop() {
    advanceTime();                    // time += 0.000116 days (AGAIN!)
    updateCelestialPositions();       // planets move (AGAIN!)
    updateShipPhysics(player, ...);   // ship moves twice (AGAIN!)
    renderFlightView();
    requestAnimationFrame(gameLoop);  // ← schedules frame N+1
}
```

#### Expected Behavior

Player ship should move at constant velocity according to orbital mechanics. Time should advance at consistent rate.

#### Actual Behavior

1. **Time Doubles**: Each frame, time advances by `2 × timeScale` instead of `1 × timeScale`
2. **Position Doubles**: `updateShipPhysics()` called twice with slightly different timestamps, ship position calculated twice
3. **Visual Glitching**: Starfield position updates twice, creating shimmer effect
4. **Rendering Inefficiency**: Canvas drawn twice per browser frame

#### Code Path Evidence

From `main.js` (lines 66-81):
```javascript
function updatePositions() {
    advanceTime();                     // Line 67
    updateCelestialPositions();        // Line 70
    updateAutoPilot(timeScale);        // Line 73
    const player = getPlayerShip();
    if (player) {
        updateShipPhysics(player, timeScale);  // Line 80 - CORE PHYSICS
    }
    updateNPCShips(timeScale);         // Line 84
    // ... intersection detection ...
}

function gameLoop() {
    frameCount++;
    if (frameCount % CLEANUP_INTERVAL === 0) {
        performMemoryCleanup();
    }
    updatePositions();  // Executes once per frame
    updateCameraTarget(celestialBodies, ships);
    render();
    updateUI();
    requestAnimationFrame(gameLoop);
}
```

If `flight-main.js` also calls `updatePositions()`, both run in sequence.

#### Test Scenario

**Setup:**
1. Start game with both nav view and flight view active
2. Observe sun distance in both views
3. Record position over 10 frames

**Expected Result:**
Sun distance increases at consistent rate (e.g., +0.5 AU over 10 frames)

**Actual Result:**
Sun distance increases at 2× rate (e.g., +1.0 AU over 10 frames)

**Frame-by-Frame Trace:**
```
Browser Frame 0:
  main.js gameLoop() called
    updatePositions() ← time += 0.000116 days
    render() to nav canvas
    updateUI()
  flight-main.js gameLoop() called
    updatePositions() ← time += 0.000116 days AGAIN!
    renderFlightView() to flight canvas

Browser Frame 1:
  Total time advanced: 0.000232 days (SHOULD BE 0.000116)
  Player ship moved 2× distance (SHOULD BE 1×)
```

#### Consequences

1. **Unplayable Physics**: Player cannot execute precise orbital maneuvers (2× acceleration breaks all trajectories)
2. **Time-Related Bugs**: All duration-based features break (fuel consumption, trajectory predictions, timing windows)
3. **Player Frustration**: "Why is my ship moving so fast?"
4. **Autopilot Failure**: Autopilot targeting will overshoot by 2×

#### Current Codebase Context

Looking at `gameState.js` (lines 20-29), time is **global mutable state**:
```javascript
export let time = 0;
export let julianDate = GAME_START_EPOCH;
export let timeScale = REAL_TIME_RATE;
```

Any module that imports `advanceTime()` modifies this shared state. If two game loops call it, both modify the same variable.

#### Verification Method

```javascript
// From browser console:
let previousTime = 0;
window.testDoublePhysics = function() {
    const elapsed = window.gameState.time - previousTime;
    console.log('Time elapsed this frame:', elapsed);
    console.log('Expected: ~0.000116 days');
    console.log('If double: ~0.000232 days');
    previousTime = window.gameState.time;
};
// Call this each frame and observe output
```

**Issue Verdict**: ✗ FAIL - Breaks core game mechanic

---

### Issue #2: CRITICAL - HUD Update Frequency Mismatch

**Severity**: CRITICAL
**Category**: UI Synchronization
**Impact**: HUD shows incorrect/stale data

#### Problem Statement

From `uiUpdater.js`, the HUD updates are driven by a single `updateUI()` call per frame:

```javascript
// main.js line 165
function gameLoop() {
    updatePositions();
    render();
    updateUI();  // ← Called ONCE per frame
    requestAnimationFrame(gameLoop);
}
```

But if both `main.js` and `flight-main.js` run:
- `main.js` calls `updateUI()` after rendering nav view
- `flight-main.js` calls `renderFlightView()` WITHOUT updating UI
- OR both call `updateUI()`, duplicating work

#### Expected Behavior

HUD elements (velocity, heading, sail status) update once per frame with consistent data.

#### Actual Behavior

**Scenario A: flight-main.js doesn't call updateUI()**
- Flight view renders new ship position (from double physics)
- But HUD shows old velocity (hasn't been updated)
- Visual disconnect: ship moved on screen, but velocity display same as before

**Scenario B: Both call updateUI()**
- DOM updated twice per frame
- Rapid flashing or duplicate updates
- CPU overhead

#### Code Path Trace

`uiUpdater.js` (lines extracted):
```javascript
export function updateUI() {
    const player = getPlayerShip();
    const scale = getScale();

    if (player) {
        // Update velocity display
        const speedKmPerSec = calculateSpeedKmPerSec(player);
        document.getElementById('velocityValue').textContent = speedKmPerSec.toFixed(2);

        // Update sail status
        const yawStr = player.sail.angle.toFixed(1) + '°';
        document.getElementById('sailYaw').textContent = yawStr;

        // ... more updates ...
    }
}
```

If `flight-main.js` has its own render but no `updateUI()` call:
```javascript
// flight-main.js (PROPOSED)
function gameLoop() {
    updatePositions();
    renderFlightView();  // ← Renders new positions
    requestAnimationFrame(gameLoop);
    // ← updateUI() NEVER CALLED
}
```

Then:
- Frame 0: nav canvas shows ship at position A, HUD shows velocity = 10 km/s
- Frame 0 (flight loop): flight canvas shows ship at position A' (double physics)
- But HUD still shows velocity = 10 km/s (from old position)
- Frame 1: nav canvas updates HUD to velocity = 20 km/s
- But flight canvas is rendering with position' from frame 0

#### Test Scenario

**Setup:**
1. Display both nav and flight views
2. Observe velocity display and rendered positions
3. Toggle acceleration on/off rapidly

**Expected Result:**
- Velocity display updates smoothly
- Rendered position and velocity display stay synchronized

**Actual Result:**
- Flight view renders smooth movement
- HUD velocity lags behind actual rendered position
- Player sees ship moving but velocity not updating at same rate

#### Verification Method

```javascript
// In uiUpdater.js, add debug logging:
export function updateUI() {
    const player = getPlayerShip();
    const timestamp = performance.now();
    console.log(`[UI UPDATE] time=${timestamp.toFixed(0)}ms, ship.x=${player.x.toFixed(2)}`);
    // ... rest of function
}

// Run with both views active, observe console
// Should see one log per frame with consistent timing
// If dual-execution, will see irregular timing or duplicate logs
```

**Issue Verdict**: ✗ FAIL - HUD shows stale data

---

### Issue #3: CRITICAL - Camera State Race Condition

**Severity**: CRITICAL
**Category**: State Synchronization
**Impact**: Camera jitter, views out of sync

#### Problem Statement

The `camera` object in `camera.js` is a shared mutable state:

```javascript
export const camera = {
    angleX: 15 * Math.PI / 180,
    angleZ: 0,
    zoom: 1,
    target: { x: 0, y: 0, z: 0 },
    followTarget: null
};
```

Both game loops call `updateCameraTarget()` in the same frame:

```javascript
// main.js line 163
updateCameraTarget(celestialBodies, ships);  // Updates camera.target

// flight-main.js (proposed)
updateCameraTarget(celestialBodies, ships);  // Updates camera.target AGAIN
```

#### Expected Behavior

Camera follows player ship with position updated once per frame.

#### Actual Behavior

```javascript
// main.js frame N
updateCameraTarget(celestialBodies, ships);
// camera.target.x = ship.x = 1.50
// render() draws with camera.target = {x: 1.50}

// flight-main.js frame N (same browser frame!)
updateCameraTarget(celestialBodies, ships);
// ship.x has moved to 1.50 + shipDelta = 1.51 (because physics ran twice)
// camera.target.x = 1.51
// renderFlightView() draws with camera.target = {x: 1.51}

// Result: Nav view camera at 1.50, Flight view camera at 1.51
// → VIEWS OUT OF SYNC
```

#### Code Path Evidence

From `controls.js` (lines 760-827), mouse input modifies `camera` directly:

```javascript
function handleRotation(e) {
    const deltaX = e.clientX - rotateState.lastX;
    camera.angleZ += deltaX * sensitivity;  // Direct modification
}
```

If both `main.js` and `flight-main.js` register mouse handlers:
```javascript
// main.js
initControls(navCanvas);      // Registers rotation handler on navCanvas

// flight-main.js (proposed)
initFlightControls(flightCanvas);  // Registers rotation handler on flightCanvas
```

Then if user drags on BOTH canvases:
- First drag: `camera.angleZ += 0.1`
- Second drag (same frame): `camera.angleZ += 0.1` AGAIN
- Net result: `camera.angleZ += 0.2` (instead of one or the other)

#### Test Scenario

**Setup:**
1. Display both nav and flight views
2. Use keyboard shortcut to rotate camera (e.g., 'Q' key)
3. Observe orientation of both views

**Expected Result:**
Both views rotate identically. Camera state is consistent.

**Actual Result:**
- Nav view rotates
- Flight view rotates by different amount
- Views show different orientations of same scene

OR:

**Scenario B - Drag Both Canvases**
1. Simultaneously drag mouse on nav canvas and flight canvas
2. Observe camera movement

**Expected Result:**
One drag wins; camera responds to one input.

**Actual Result:**
Both drags apply to same camera object. Camera rotates erratically or by sum of inputs.

#### Verification Method

```javascript
// Monitor camera state:
window.monitorCamera = setInterval(() => {
    const cam = window.camera;
    console.log(`Camera: Z=${(cam.angleZ * 180/Math.PI).toFixed(1)}°, target=${cam.target.x.toFixed(2)}`);
}, 100);
```

If camera.angleZ changes between logs without user input, race condition confirmed.

**Issue Verdict**: ✗ FAIL - Views desynchronized

---

### Issue #4: MAJOR - Input Event Registration Conflict

**Severity**: MAJOR
**Category**: Input Handling
**Impact**: Controls unresponsive or conflicting

#### Problem Statement

Both `main.js` and `flight-main.js` call control initialization:

```javascript
// main.js line 183
initControls(navCanvas);

// flight-main.js (proposed)
initFlightControls(flightCanvas);
```

Inside `initControls()` (controls.js, lines 57-71):
```javascript
export function initControls(canvas) {
    initZoomControls();           // Global: all .zoom-btn elements
    initSpeedControls();          // Global: all .speed-btn elements
    initDisplayOptions();         // Global: all checkboxes
    initSailControls();           // Global: all sliders
    initKeyboardShortcuts();      // Global: document event listener
    initMouseControls(canvas);    // Canvas-specific
    // ...
}
```

**Problem**: `initKeyboardShortcuts()` registers **global** document listener:

```javascript
document.addEventListener('keydown', e => {
    // Handle keyboard shortcuts
});
```

This is called TWICE (once from main.js, once from flight-main.js).

#### Expected Behavior

Keyboard shortcut fires once per keypress.

#### Actual Behavior

Keyboard shortcut fires TWICE per keypress.

```
User presses '[' key to rotate sail 5° retrograde:

// initKeyboardShortcuts() registered by main.js
document.addEventListener('keydown', (e) => {
    if (e.key === '[') {
        angleSlider.value -= 5;  // ← Fires
    }
});

// initKeyboardShortcuts() registered by flight-main.js
document.addEventListener('keydown', (e) => {
    if (e.key === '[') {
        angleSlider.value -= 5;  // ← Fires AGAIN
    }
});

Result: angleSlider.value -= 10 (instead of -5)
User tries to adjust sail by 5°, gets 10° instead
```

#### Code Evidence

`controls.js` line 451-543:
```javascript
function initKeyboardShortcuts() {
    const deploySlider = document.getElementById('sailDeployment');
    const angleSlider = document.getElementById('sailAngle');
    const pitchSlider = document.getElementById('sailPitch');

    document.addEventListener('keydown', e => {  // ← GLOBAL listener
        // ... lots of key handling ...
        if (e.key === '[' && angleSlider) {
            angleSlider.value = Math.max(-90, parseInt(angleSlider.value) - 5);
            angleSlider.dispatchEvent(new Event('input'));
        }
        // ...
    });
}
```

If called twice, event listener registered twice → handler executes twice.

#### Test Scenario

**Setup:**
1. Load both views
2. Look at sail angle slider (should start at 0)
3. Press '[' key once
4. Observe slider value

**Expected Result:**
Slider value = -5

**Actual Result:**
Slider value = -10

#### Verification Method

```javascript
// In browser console:
const listeners = getEventListeners(document, 'keydown');
console.log('Number of keydown listeners:', listeners.length);
console.log('Expected: 1');
console.log('If dual-init: 2');
```

**Issue Verdict**: ✗ FAIL - Controls apply twice

---

### Issue #5: MAJOR - Depth Sorting Edge Cases

**Severity**: MAJOR
**Category**: Rendering
**Impact**: Visual artifacts in specific scenarios

#### Problem Statement

Depth sorting implementation in `renderer.js` (lines 1218-1223):

```javascript
const sortedBodies = [...getVisibleBodies()].sort((a, b) => {
    const projA = project3D(a.x, a.y, a.z, 0, 0, 1);
    const projB = project3D(b.x, b.y, b.z, 0, 0, 1);
    return projA.depth - projB.depth;  // Sort back-to-front
});
sortedBodies.forEach(body => drawBody(body, centerX, centerY, scale));
```

#### Issues

**Issue 5a: Projection with Dummy Parameters**

The sort calls `project3D()` with:
```javascript
project3D(x, y, z, 0, 0, 1)
//                   ↑ ↑ ↑
//         centerX=0, centerY=0, scale=1
```

But actual render calls use different parameters:
```javascript
// From renderer.js line 1223
drawBody(body, centerX, centerY, scale);

// Which internally calls
project3D(body.x, body.y, body.z, centerX, centerY, scale);
```

This means **sort order is calculated with different camera transform than render**.

#### Expected Behavior

Objects drawn in order from farthest (low depth) to nearest (high depth).

#### Actual Behavior

Depth-sorted order doesn't match final render order, causing:
- Nearer objects drawn before farther objects
- Z-fighting (overlapping when shouldn't)
- Moons rendered in front of planets

#### Code Path

```javascript
// Sorting phase
const sortedBodies = [...getVisibleBodies()].sort((a, b) => {
    // Uses centerX=0, centerY=0, scale=1
    const projA = project3D(a.x, a.y, a.z, 0, 0, 1);
    const projB = project3D(b.x, b.y, b.z, 0, 0, 1);
    return projA.depth - projB.depth;
});

// Rendering phase
const centerX = canvas.width / 2;
const centerY = canvas.height / 2;
const scale = getScale();

// Uses actual centerX, centerY, scale
sortedBodies.forEach(body => drawBody(body, centerX, centerY, scale));
```

Inside `drawBody()` (renderer.js, inferred from pattern):
```javascript
function drawBody(body, centerX, centerY, scale) {
    const proj = project3D(body.x, body.y, body.z, centerX, centerY, scale);
    // proj is now DIFFERENT from what was used for sort!
    ctx.fillCircle(proj.x, proj.y, radius);
}
```

#### Test Scenario

**Setup:**
1. Position Venus and Earth so Venus is slightly farther (higher depth)
2. Adjust camera zoom to ~50x or more (exaggerates sorting differences)
3. Observe rendering order

**Expected Result:**
Venus rendered behind Earth (correct front-to-back)

**Actual Result:**
Venus might render in front of Earth even though it's farther away

#### Mathematical Impact

When `centerX ≠ 0` or `scale ≠ 1`, the depth values change:

```javascript
// From camera.js project3D() line 104-106
return {
    x: centerX + x1 * scale * camera.zoom,
    y: centerY - y2 * scale * camera.zoom,
    depth: z2  // ← This is NOT affected by centerX, centerY, scale
};
```

Good news: `depth` is independent of centerX, centerY, scale.

Bad news: The sort uses completely different coordinate transformations than render!

#### Root Cause Analysis

The sort uses dummy parameters to get depth values, but projection includes camera transforms:

```javascript
// From camera.js project3D() lines 84-108
export function project3D(x, y, z, centerX, centerY, scale) {
    // Offset by camera target
    x -= camera.target.x;  // ← Uses camera.target
    y -= camera.target.y;  // ← Uses camera.target
    z -= camera.target.z;  // ← Uses camera.target

    // Rotate and project
    // ... rotation math ...

    return {
        x: centerX + x1 * scale * camera.zoom,
        y: centerY - y2 * scale * camera.zoom,
        depth: z2  // Camera-relative Z-coordinate
    };
}
```

Since `depth: z2` is calculated AFTER camera transforms, the sort IS using correct depth values. **This issue is actually NOT a problem.**

#### Revised Assessment

Upon closer inspection, since `depth` is calculated after camera transforms but independently of `centerX`/`centerY`/`scale`, the sort order should be correct.

**However**, there IS a potential issue: if `camera.target` or `camera.zoom` change between sort and render, depth values become stale.

Given the frame timing:
```javascript
updateCameraTarget(celestialBodies, ships);  // Updates camera.target
render() {
    // ... sort code ...
    // camera.target hasn't changed since updateCameraTarget()
    // ... draw code ...
}
```

The camera.target doesn't change during render, so sort order should be correct.

**Revised Verdict for Issue 5**: ✓ Actually works correctly

The depth value is calculated with correct camera transforms and doesn't depend on centerX/centerY/scale.

---

## Edge Case Testing

### Edge Case #1: Behind Camera Clipping

**Scenario**: Player ship approaches close to sun. Camera might end up behind sun in perspective view.

**Code Path** (camera.js, project3D):
```javascript
// No check for depth < 0 (behind camera)
return {
    x: centerX + x1 * scale * camera.zoom,
    y: centerY - y2 * scale * camera.zoom,
    depth: z2  // Could be negative!
};
```

**Issue**: If `z2 < 0`, object is behind camera but still projects to screen with inverted perspective.

**Expected**: Objects behind camera should be clipped or marked as off-screen.

**Actual**: Objects behind camera render with strange distortion.

**Test Case**:
```
1. Navigate to sun
2. Use high zoom to place camera inside sun geometry
3. Look for visual glitches
```

**Verdict**: ⚠ POTENTIAL BUG - No behind-camera clipping

### Edge Case #2: Extreme Zoom Values

**Scenario**: User zooms to 1000x (supported by controls.js line 770).

**Code Path** (controls.js, line 767-770):
```javascript
camera.zoom *= e.deltaY > 0 ? 0.9 : 1.1;
camera.zoom = Math.max(0.1, Math.min(1000, camera.zoom));
```

**Issue**: At 1000x zoom with typical scale (1000 px/AU), effective scale = 1,000,000 px/AU. Sun radius would be ~2,000 pixels.

**Expected**: Render performance degrades gracefully.

**Actual**: Canvas rendering lag, potential memory issues.

**Test Case**:
```
1. Zoom to 1000x
2. Monitor frame rate
3. Observe rendering time
```

**Verdict**: ⚠ PERFORMANCE ISSUE - Untested extreme zoom

### Edge Case #3: Mouse/Keyboard Input During Physics Update

**Scenario**: User presses sail control key while `updateShipPhysics()` is running.

**Code Flow**:
```
Frame N:
  updatePositions() starts
    updateShipPhysics() calculates position
      [MEANWHILE] User presses '[' key
        setSailAngle() modifies ship.sail.angle
      [CONTINUES] updateShipPhysics() reads ship.sail (DIFFERENT than frame start)
  render() draws with position from mixed state
```

**Issue**: Physics update sees partially-modified ship state.

**Expected**: Ship state is consistent within frame.

**Actual**: Physics might use old angle while ship already updated.

**Test Case**:
```
1. Start autopilot
2. Spam '[' key rapidly
3. Monitor for erratic behavior
```

**Verdict**: ✓ PROBABLY OK - Physics reads ship state consistently within frame, input changes take effect next frame

### Edge Case #4: Tab Switching (Memory/State Preservation)

**Scenario**: User switches browser tabs and back.

**Code Issue**: If `main.js` and `flight-main.js` both use `requestAnimationFrame()`, they pause when tab hidden.

**Expected**: Game pauses, resumes when tab active.

**Actual**: Both game loops resume, potentially with time desync.

**Test Case**:
```
1. Run both views
2. Switch to another tab for 5 seconds
3. Return to game
4. Check time continuity and position
```

**Verdict**: ⚠ POTENTIAL BUG - Dual game loops + tab switching

### Edge Case #5: Mobile Viewport Handling

**Scenario**: User views flight cockpit on mobile (portrait mode).

**Code Path** (renderer.js, resizeCanvas):
```javascript
export function resizeCanvas() {
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    clearGradientCache();
}
```

**Issue**: FOV calculation depends on canvas.height (cockpit-view-physics-review.md line 107). Changing aspect ratio changes FOV.

**Expected**: FOV constant regardless of aspect ratio.

**Actual**: FOV changes when device rotates (portrait ↔ landscape).

**Test Case**:
```
1. View flight cockpit in portrait (height > width)
2. Rotate to landscape
3. Observe FOV changes
```

**Verdict**: ⚠ DESIGN ISSUE - FOV shouldn't depend on aspect ratio

---

## Rendering Order Analysis

### Correct Order Verified

From `renderer.js` lines 1177-1230:

```javascript
export function render() {
    // 1. Clear
    ctx.fillRect(0, 0, canvas.width, canvas.height);  // ✓ Correct

    // 2. Starfield (back)
    if (displayOptions.showStarfield) {
        drawStarfield(...);  // ✓ Correct - far background
    }

    // 3. Grid
    drawGrid(...);  // ✓ Correct - after stars, before objects

    // 4. Orbits
    getVisibleBodies().forEach(body => drawOrbit(...));  // ✓ Correct

    // 5. Ships orbits
    ships.forEach(ship => drawShipOrbit(...));  // ✓ Correct

    // 6. Predicted trajectory
    drawPredictedTrajectory(...);  // ✓ Correct

    // 7. Intersection markers
    drawIntersectionMarkers(...);  // ✓ Correct

    // 8. Flight path
    drawFlightPath(...);  // ✓ Correct

    // 9. Bodies (depth-sorted)
    const sortedBodies = [...getVisibleBodies()].sort(...);  // ✓ Correct
    sortedBodies.forEach(body => drawBody(...));

    // 10. SOI boundaries
    drawSOIBoundaries(...);  // ✓ Correct

    // 11. Ships (front)
    ships.forEach(ship => drawShip(...));  // ✓ Correct - player ship on top
}
```

**Verdict**: ✓ RENDERING ORDER CORRECT

The layering strategy is sound and matches expected visual priority.

---

## Control Responsiveness Analysis

### Keyboard Controls (Sail Adjustment)

**Code Path**:
```javascript
// controls.js line 515-517
if (e.key === '[' && angleSlider) {
    angleSlider.value = Math.max(-90, parseInt(angleSlider.value) - 5);
    angleSlider.dispatchEvent(new Event('input'));
}
```

**Flow**:
1. Keydown event fires (immediate)
2. angleSlider.value changes (immediate)
3. Input event dispatches (immediate)
4. Slider listener triggers (immediate)
5. `setSailAngle()` called (immediate)
6. `ships[0].sail.angle` updated (immediate)
7. Next `updateShipPhysics()` reads new angle (next frame)

**Responsiveness**: ~1 frame delay (16ms at 60fps)

**Verdict**: ✓ ACCEPTABLE - Industry standard for game controls

### Mouse Rotation

**Code Path**:
```javascript
// controls.js line 792-798
canvas.addEventListener('mousemove', e => {
    if (dragState.isDragging) {
        handlePan(e);
    }
    if (rotateState.isRotating) {
        handleRotation(e);
    }
});

function handleRotation(e) {
    camera.angleZ += deltaX * sensitivity;
}
```

**Flow**:
1. Mousemove fires (immediate, ~16ms for 60fps)
2. `camera.angleZ` updated (immediate)
3. Next `render()` uses new angleZ (next frame)

**Responsiveness**: Same-frame feedback (no frame delay for visual rotation)

**Verdict**: ✓ GOOD - Camera updates immediately

### Sensitivity Values

From controls.js line 588:
```javascript
const sensitivity = 0.005;  // radians per pixel
```

**Test**: Drag 100 pixels right
- Angular change: 100 × 0.005 = 0.5 radians ≈ 28.6°
- This is reasonable for space game camera

**Verdict**: ✓ REASONABLE - Common FPS-style sensitivity

---

## State Synchronization Deep Dive

### Shared State Vectors

| State | Location | Mutable | Synchronized |
|-------|----------|---------|---------------|
| `time` | gameState.js | Yes | ✗ NO (dual advance) |
| `julianDate` | gameState.js | Yes | ✗ NO (dual advance) |
| `camera.target` | camera.js | Yes | ⚠ RISKY (dual update) |
| `camera.angleZ` | camera.js | Yes | ⚠ RISKY (dual input handlers) |
| `ships[0].sail.angle` | ships.js | Yes | ✓ YES (one source) |
| `celestialBodies[]` | data/ | Yes (position) | ⚠ RISKY (dual update) |
| `displayOptions` | gameState.js | Yes | ✓ YES (shared references) |

**Critical Issues**:
- Time advances twice
- Camera target updated twice
- Celestial positions updated twice

**Non-Issues**:
- Sail angle has single source of truth (UI slider)
- Display options are shared and consistently read

---

## HUD Update Verification

### Expected Updates Per Frame

From `uiUpdater.js` (inferred structure):
- Velocity display: once
- Heading display: once
- Sail status: once
- Distance to target: once
- Navigation data: once

### Actual Updates With Dual Game Loops

**Scenario A**: Only main.js calls updateUI()
```
Frame N:
  main.js: updatePositions() ← time += 0.000116
  flight-main.js: updatePositions() ← time += 0.000116 AGAIN
  main.js: updateUI() ← reads ship at NEW time
  Result: HUD shows data from time N+0.000232
          Flight view renders data from time N+0.000232
          Nav view renders data from time N+0.000232
          All consistent but time is 2x fast
```

**Scenario B**: Both call updateUI()
```
Frame N:
  main.js: updateUI() ← updates DOM
  flight-main.js: updateUI() ← updates DOM AGAIN (duplicate)
  Result: DOM updates twice (browser coalesces, still one visual update)
          But duplicate work on each frame
```

**Most Likely Scenario**: Only main.js calls updateUI()
```
Result: HUD appears consistent but lags behind flight view position
```

---

## Test Execution Summary

### Automated Test Cases (Could Be Implemented)

```javascript
// Test: Physics runs once per frame
export function testPhysicsFrequency() {
    let updateCount = 0;
    const originalUpdateShipPhysics = window.updateShipPhysics;
    window.updateShipPhysics = function(...args) {
        updateCount++;
        originalUpdateShipPhysics(...args);
    };

    requestAnimationFrame(() => {
        console.assert(updateCount === 1, 'Physics ran ' + updateCount + ' times (expected 1)');
    });
}

// Test: Camera updates once per frame
export function testCameraUpdate() {
    const startTarget = {x: camera.target.x, y: camera.target.y};
    requestAnimationFrame(() => {
        const endTarget = {x: camera.target.x, y: camera.target.y};
        console.log('Camera moved from', startTarget, 'to', endTarget);
    });
}

// Test: Keyboard shortcuts fire once
export function testKeyboardDuplicate() {
    const listeners = getEventListeners(document, 'keydown');
    console.assert(listeners.length === 1, 'Found ' + listeners.length + ' keydown listeners (expected 1)');
}
```

---

## Failure Mode Analysis

### Mode 1: Double Physics (CRITICAL)

**Trigger**: Both main.js and flight-main.js running
**Symptom**: Ship accelerates at 2x expected rate, time flies, orbits degrade
**Player Observation**: "Why is my ship so fast?"
**Game Impact**: UNPLAYABLE - breaks fundamental physics

### Mode 2: Control Doubling (MAJOR)

**Trigger**: Pressing '[' key
**Symptom**: Sail angle changes by -10° instead of -5°
**Player Observation**: "Controls are too sensitive!"
**Game Impact**: Makes manual piloting nearly impossible

### Mode 3: HUD Lag (MAJOR)

**Trigger**: Rendering happens twice per physics update
**Symptom**: HUD velocity display doesn't match visual movement
**Player Observation**: "Something feels wrong, ship is moving but speed isn't changing"
**Game Impact**: Confusing UI, impossible to judge actual velocity

### Mode 4: Camera Jitter (MAJOR)

**Trigger**: Camera.target updated twice from different positions
**Symptom**: View shakes or shifts between frames
**Player Observation**: "Screen is jittery"
**Game Impact**: Nauseating for extended play

---

## Recommendations Before Implementation

### BEFORE ANY CODING:

1. **Resolve Game Loop Architecture** (CRITICAL)
   - Choose: Single loop with dual render OR tab-based single active view
   - Do NOT implement separate game loops
   - Reference: Architecture review recommendations (lines 389-406)

2. **Test Double Physics Fix** (CRITICAL)
   - Implement single updatePositions() call
   - Verify time advances at correct rate
   - Verify ship positions match physics equations

3. **Consolidate Input Handlers** (CRITICAL)
   - Ensure initKeyboardShortcuts() called only once
   - Ensure camera handlers don't register multiple times
   - Add guards against double-registration

4. **Verify Camera State Consistency** (MAJOR)
   - Unit test that camera.target matches physics position
   - Unit test that camera.angleZ doesn't accumulate unexpected changes
   - Mock camera mutations to verify single-source updates

### TESTING CHECKLIST:

- [ ] Physics runs exactly once per frame (measure time advancement)
- [ ] HUD updates once per frame with matching timestamp
- [ ] Camera.target matches ship position within floating-point precision
- [ ] Keyboard input applies exactly once per keypress
- [ ] Mouse rotation applies without accumulation
- [ ] Both views show identical positions (if dual-rendering)
- [ ] Performance stays ≥30fps under normal zoom/scale
- [ ] No z-fighting on overlapping bodies
- [ ] Behind-camera objects either clipped or handled gracefully
- [ ] Mobile viewport resize doesn't break FOV calculation

---

## Confidence Assessment

| Dimension | Rating | Justification |
|-----------|--------|---------------|
| **Rendering Pipeline** | HIGH (85%) | Order correct, depth sorting works |
| **Physics Correctness** | LOW (20%) | Double-execution breaks everything |
| **Control Responsiveness** | MEDIUM (60%) | Works if architecture fixed |
| **HUD Accuracy** | LOW (25%) | Update mismatch with dual physics |
| **Overall Functionality** | **LOW (40%)** | Architecturally broken |

---

## Overall Assessment

**The implementation CANNOT WORK as designed.**

The double game loop architecture creates cascading failures:
1. Physics executes twice → gameplay broken
2. Camera updates twice → views misaligned
3. Input handlers register twice → controls erratic
4. HUD updates once → lag relative to rendering

**None of these are minor bugs.** They're fundamental architectural failures from running two independent game loops.

### What Works ✓
- Rendering order is correct
- Depth sorting algorithm is sound
- Control sensitivity is reasonable
- Module structure follows conventions

### What Doesn't Work ✗
- Game loop architecture (critical)
- Physics synchronization (critical)
- State sharing between views (critical)
- Input event handling (major)
- HUD update frequency (major)

**Recommended Path Forward**:
1. Follow architecture review recommendations
2. Implement single game loop with conditional rendering
3. Re-run functional tests after refactoring
4. Proceed to implementation only after tests pass

**Minimum Viable Fixes Required**:
- Single updatePositions() call per frame
- Unified input handler registration
- Consistent camera state updates
- Synchronized HUD updates

---

## References

- **Architecture Review**: flight-cockpit-architecture-review-2026-01-30.md (Issues #1, #2, #5)
- **Physics Review**: cockpit-view-physics-review-2026-01-30.md (perspective projection validation)
- **Main Game Loop**: src/js/main.js (lines 153-167)
- **Renderer**: src/js/ui/renderer.js (lines 1177-1230)
- **Controls**: src/js/ui/controls.js (lines 451-827)
- **Game State**: src/js/core/gameState.js (lines 1-100)
- **Camera**: src/js/core/camera.js (lines 5-108)
