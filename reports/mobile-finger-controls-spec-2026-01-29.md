# Mobile Finger Controls Specification

## 1. Executive Summary

Add touch gesture controls to the game canvas for mobile devices, enabling intuitive navigation through one-finger pan, two-finger rotate, and pinch-to-zoom gestures. This completes the mobile experience by providing direct manipulation of the view that mirrors the existing mouse controls.

## 1.1 Estimated File Impact

### Files to EDIT:
- `src/js/ui/controls.js` - Add touch event handlers and gesture recognition

### Files to CREATE:
- None required

## 2. Current State Analysis

### 2.1 Existing Systems

| System | Location | Purpose |
|--------|----------|---------|
| Mouse Controls | `controls.js:602-670` | Handle wheel zoom, left-drag pan, right-drag rotate |
| Camera System | `camera.js:1-108` | Manage view state (angleX, angleZ, zoom, target) |
| Mobile UI | `ui-components.js:170-298` | Slide-in panels with swipe gestures on panels only |
| Mobile Quick Actions | `controls.js:945-1101` | Touch buttons for zoom presets, speed, autopilot |

### 2.2 Data Flow

```
Touch Event → Gesture Detection → Camera State Update → Render Loop
                                       ↓
                               camera.target.x/y (pan)
                               camera.angleX/Z (rotate)
                               camera.zoom (pinch)
```

### 2.3 Relevant Code

**Mouse control patterns to mirror:**
- `controls.js:24-42` - `dragState` and `rotateState` objects track drag gestures
- `controls.js:539-566` - `handlePan()` applies inverse rotation matrix for world-space panning
- `controls.js:572-596` - `handleRotation()` adjusts camera angles with sensitivity scaling
- `controls.js:607-612` - Wheel zoom with clamping (0.1 to 1000)

**Camera manipulation:**
- `camera.js:5-16` - Camera state object with angleX, angleZ, zoom, target
- `camera.js:35-37` - `stopFollowing()` called on manual pan to detach from follow target

**Mobile detection:**
- `ui-components.js:295-297` - `isMobileView()` checks viewport width <= 768px

## 3. Gap Analysis

### 3.1 Missing Capabilities

- [ ] Touch event listeners on canvas (touchstart, touchmove, touchend, touchcancel)
- [ ] Single-touch drag for panning (equivalent to left-click drag)
- [ ] Two-touch drag for rotation (equivalent to right-click drag)
- [ ] Pinch gesture for zoom (equivalent to mouse wheel)
- [ ] Touch state tracking (active touches, gesture mode, initial positions)

### 3.2 Required Changes

- [ ] Add `touchState` object to track active touches and gesture mode
- [ ] Add `initTouchControls(canvas)` function with touch event handlers
- [ ] Implement `handleTouchPan()` mirroring `handlePan()` logic
- [ ] Implement `handleTouchRotate()` mirroring `handleRotation()` logic
- [ ] Implement `handlePinchZoom()` for two-finger pinch gesture
- [ ] Call `initTouchControls(canvas)` from `initControls()`
- [ ] Add `{ passive: false }` to prevent scroll interference on canvas

## 4. Technical Design

### 4.1 Gesture Detection Strategy

| Touches | Gesture | Action |
|---------|---------|--------|
| 1 | Drag | Pan camera (move target) |
| 2 | Drag together | Rotate camera (change angleX/Z) |
| 2 | Pinch in/out | Zoom camera (change zoom) |

### 4.2 Touch State Structure

```javascript
const touchState = {
    touches: [],           // Array of active touch objects
    gestureMode: null,     // 'pan' | 'rotate' | 'pinch' | null
    initialPinchDist: 0,   // Distance between fingers at gesture start
    initialZoom: 1,        // Zoom level at gesture start
    lastCenter: { x: 0, y: 0 }  // Center point of touches
};
```

### 4.3 Implementation Notes

1. **Passive: false** - Required to call `preventDefault()` and stop page scrolling
2. **Gesture transitions** - Handle finger add/remove gracefully (1→2 fingers, 2→1 finger)
3. **Rotation sensitivity** - May need different sensitivity than mouse (larger movements)
4. **Pinch threshold** - Require minimum distance change to trigger zoom (avoid jitter)

## 5. Open Questions

- [x] Should one-finger pan or two-finger pan? → One-finger pan is standard for maps/views
- [x] Should rotation use twist gesture or two-finger drag? → Two-finger drag is more reliable
- [x] Need to prevent zoom while interacting with UI panels? → Panels are separate from canvas, not an issue
