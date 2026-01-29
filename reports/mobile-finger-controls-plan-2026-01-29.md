# Mobile Finger Controls Implementation Plan

## Overview

Implement touch gesture controls for the canvas: one-finger pan, two-finger rotate, and pinch-to-zoom.

## Implementation Units

### Unit 1: Add Touch State Object

**File:** `src/js/ui/controls.js`
**Location:** After `rotateState` (line ~43)

Add state tracking for touch gestures:

```javascript
// Touch state for mobile gestures
const touchState = {
    touches: [],           // Active touch points
    gestureMode: null,     // 'pan' | 'rotate' | null
    initialPinchDist: 0,   // Distance at pinch start
    initialZoom: 1,        // Zoom at pinch start
    lastCenter: { x: 0, y: 0 }
};
```

**Estimated lines:** ~10
**Dependencies:** None

---

### Unit 2: Implement Touch Pan Handler

**File:** `src/js/ui/controls.js`
**Location:** After `handleRotation()` function

Create `handleTouchPan(touch)` that mirrors `handlePan()`:
- Calculate delta from last position
- Apply inverse rotation matrix for world-space movement
- Update camera.target

```javascript
function handleTouchPan(touch) {
    const deltaX = touch.clientX - touchState.lastCenter.x;
    const deltaY = touch.clientY - touchState.lastCenter.y;

    const scale = getScale();
    const effectiveScale = scale * camera.zoom;

    const viewDeltaX = -deltaX / effectiveScale;
    const viewDeltaY = deltaY / effectiveScale;

    const cosZ = Math.cos(camera.angleZ);
    const sinZ = Math.sin(camera.angleZ);

    camera.target.x += viewDeltaX * cosZ + viewDeltaY * sinZ;
    camera.target.y += -viewDeltaX * sinZ + viewDeltaY * cosZ;

    touchState.lastCenter.x = touch.clientX;
    touchState.lastCenter.y = touch.clientY;
}
```

**Estimated lines:** ~25
**Dependencies:** Unit 1

---

### Unit 3: Implement Touch Rotate Handler

**File:** `src/js/ui/controls.js`
**Location:** After `handleTouchPan()`

Create `handleTouchRotate(touches)` that mirrors `handleRotation()`:
- Calculate center point of two touches
- Track delta movement of center point
- Apply rotation sensitivity (may need adjustment for touch)

```javascript
function handleTouchRotate(touches) {
    const centerX = (touches[0].clientX + touches[1].clientX) / 2;
    const centerY = (touches[0].clientY + touches[1].clientY) / 2;

    const deltaX = centerX - touchState.lastCenter.x;
    const deltaY = centerY - touchState.lastCenter.y;

    const sensitivity = 0.005;

    camera.angleZ += deltaX * sensitivity;
    camera.angleZ = camera.angleZ % (2 * Math.PI);
    if (camera.angleZ < 0) camera.angleZ += 2 * Math.PI;

    camera.angleX -= deltaY * sensitivity;
    camera.angleX = Math.max(0, Math.min(Math.PI / 2, camera.angleX));

    touchState.lastCenter.x = centerX;
    touchState.lastCenter.y = centerY;
}
```

**Estimated lines:** ~25
**Dependencies:** Unit 1

---

### Unit 4: Implement Pinch Zoom Handler

**File:** `src/js/ui/controls.js`
**Location:** After `handleTouchRotate()`

Create `handlePinchZoom(touches)`:
- Calculate current distance between two fingers
- Compare to initial distance to get scale factor
- Apply to initial zoom level with clamping

```javascript
function handlePinchZoom(touches) {
    const dx = touches[1].clientX - touches[0].clientX;
    const dy = touches[1].clientY - touches[0].clientY;
    const currentDist = Math.sqrt(dx * dx + dy * dy);

    if (touchState.initialPinchDist > 0) {
        const scale = currentDist / touchState.initialPinchDist;
        camera.zoom = touchState.initialZoom * scale;
        camera.zoom = Math.max(0.1, Math.min(1000, camera.zoom));
    }
}
```

**Estimated lines:** ~15
**Dependencies:** Unit 1

---

### Unit 5: Implement Touch Event Handlers

**File:** `src/js/ui/controls.js`
**Location:** After pinch zoom handler

Create `initTouchControls(canvas)` with event listeners:

**touchstart:**
- Store active touches
- Detect gesture mode (1 touch = pan, 2 touches = rotate+pinch)
- Initialize pinch distance and zoom
- Call stopFollowing() on pan start

**touchmove:**
- Call appropriate handler based on gesture mode
- Prevent default to stop scrolling

**touchend/touchcancel:**
- Update active touches
- Transition gesture mode if fingers removed
- Reset state when all fingers lifted

```javascript
function initTouchControls(canvas) {
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        touchState.touches = Array.from(e.touches);

        if (touchState.touches.length === 1) {
            touchState.gestureMode = 'pan';
            touchState.lastCenter.x = touchState.touches[0].clientX;
            touchState.lastCenter.y = touchState.touches[0].clientY;
            stopFollowing();
        } else if (touchState.touches.length >= 2) {
            touchState.gestureMode = 'rotate';
            // Initialize pinch
            const dx = touchState.touches[1].clientX - touchState.touches[0].clientX;
            const dy = touchState.touches[1].clientY - touchState.touches[0].clientY;
            touchState.initialPinchDist = Math.sqrt(dx * dx + dy * dy);
            touchState.initialZoom = camera.zoom;
            // Set center
            touchState.lastCenter.x = (touchState.touches[0].clientX + touchState.touches[1].clientX) / 2;
            touchState.lastCenter.y = (touchState.touches[0].clientY + touchState.touches[1].clientY) / 2;
        }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        touchState.touches = Array.from(e.touches);

        if (touchState.gestureMode === 'pan' && touchState.touches.length === 1) {
            handleTouchPan(touchState.touches[0]);
        } else if (touchState.gestureMode === 'rotate' && touchState.touches.length >= 2) {
            handleTouchRotate(touchState.touches);
            handlePinchZoom(touchState.touches);
        }
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
        touchState.touches = Array.from(e.touches);
        if (touchState.touches.length === 0) {
            touchState.gestureMode = null;
            touchState.initialPinchDist = 0;
        } else if (touchState.touches.length === 1) {
            // Transition from rotate to pan
            touchState.gestureMode = 'pan';
            touchState.lastCenter.x = touchState.touches[0].clientX;
            touchState.lastCenter.y = touchState.touches[0].clientY;
        }
    }, { passive: false });

    canvas.addEventListener('touchcancel', () => {
        touchState.touches = [];
        touchState.gestureMode = null;
        touchState.initialPinchDist = 0;
    }, { passive: false });
}
```

**Estimated lines:** ~60
**Dependencies:** Units 1-4

---

### Unit 6: Wire Up Touch Controls

**File:** `src/js/ui/controls.js`
**Location:** Inside `initControls()` function

Add call to `initTouchControls(canvas)` after `initMouseControls(canvas)`:

```javascript
export function initControls(canvas) {
    // ... existing code ...
    initMouseControls(canvas);
    initTouchControls(canvas);  // Add this line
    // ... existing code ...
}
```

**Estimated lines:** ~1
**Dependencies:** Unit 5

---

## Execution Order

1. Unit 1 - Touch state object
2. Unit 2 - Touch pan handler
3. Unit 3 - Touch rotate handler
4. Unit 4 - Pinch zoom handler
5. Unit 5 - Touch event handlers
6. Unit 6 - Wire up in initControls

## Testing Plan

1. Open on mobile device or use Chrome DevTools device emulation
2. Test one-finger drag - should pan view
3. Test two-finger drag - should rotate view
4. Test pinch in/out - should zoom in/out
5. Test gesture transitions (add/remove fingers mid-gesture)
6. Verify page doesn't scroll when touching canvas
7. Verify UI panels still work (slide-in, swipe-to-close)

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Touch sensitivity too high/low | Medium | Add tunable sensitivity constants |
| Jittery pinch zoom | Low | Add minimum distance threshold |
| Conflict with UI panels | Low | Canvas and panels are separate elements |
| Browser compatibility | Low | Touch events are well-supported |
