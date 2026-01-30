# 3D Flight Cockpit - Issue Register
**Date:** 2026-01-30  
**Total Issues:** 18  
**Critical:** 2 | **High:** 7 | **Medium:** 5 | **Low:** 4

---

## CRITICAL ISSUES (Block Release)

### ISSUE-001: Missing Depth Guards in Projection
**File:** `src/js/core/camera.js` (lines 84-108)  
**Severity:** CRITICAL  
**Likelihood:** LOW (requires specific geometry)  
**Impact:** NaN propagation, rendering crashes

**Description:**
The `project3D()` function doesn't check for zero or near-zero depth values. If a future perspective projection mode is implemented, division by `z2` when `z2 ≈ 0` causes Infinity or NaN.

**Current Code:**
```javascript
return {
    x: centerX + x1 * scale * camera.zoom,
    y: centerY - y2 * scale * camera.zoom,
    depth: z2
};
```

**Fix Required:**
```javascript
if (depth < 0.001) return null;  // Cull near objects
if (depth < 0) return null;      // Cull behind camera
```

**Test Case:**
```
ship.x = camera.target.x
ship.y = camera.target.y
ship.z = camera.target.z + 0.0001  // Almost at camera position
→ Expected: null or safe cull
→ Current: Returns valid (OK for orthographic, breaks for perspective)
```

---

### ISSUE-002: Canvas Element Not Validated
**File:** `src/js/main.js` (line 30)  
**Severity:** CRITICAL  
**Likelihood:** MEDIUM (deployment error)  
**Impact:** Immediate crash on missing HTML element

**Description:**
Code assumes `#navCanvas` element exists without checking. Missing HTML element causes immediate crash when calling `.getContext()`.

**Current Code:**
```javascript
const navCanvas = document.getElementById('navCanvas');
// No validation before use in render loop
```

**Fix Required:**
```javascript
const navCanvas = document.getElementById('navCanvas');
if (!navCanvas) {
    throw new Error('[INIT] Canvas element #navCanvas not found in DOM!');
}
if (!navCanvas.getContext) {
    throw new Error('[INIT] Canvas does not support 2D context');
}
```

**Test Case:**
```
1. Remove <canvas id="navCanvas"> from index.html
2. Load page
→ Expected: Helpful error message
→ Current: TypeError: Cannot read property 'getContext' of null
```

---

## HIGH PRIORITY ISSUES (Fix This Week)

### ISSUE-003: Orthographic vs Perspective Mismatch
**File:** `src/js/core/camera.js` (line 102-107)  
**Severity:** HIGH  
**Likelihood:** HIGH (fundamental design issue)  
**Impact:** Doesn't deliver promised "3D cockpit" view

**Description:**
Code claims "perspective projection" in comments but implements orthographic projection. Objects don't shrink with distance—unrealistic for claimed cockpit view.

**Evidence:**
```javascript
// No focal length, no perspective divide
return {
    x: centerX + x1 * scale * camera.zoom,  // Linear scaling, not 1/depth
    y: centerY - y2 * scale * camera.zoom,
    depth: z2  // Calculated but unused
};
```

**Expected Behavior:**
```javascript
const focalLength = 800;  // Pixels corresponding to focal length
const screenX = centerX + (focalLength * x1) / z2;  // Perspective divide
const screenY = centerY - (focalLength * y2) / z2;
```

**Impact:**
- Objects appear flat (top-down map view, not cockpit)
- No depth perception despite claiming 3D
- Future "cockpit mode" feature blocked

---

### ISSUE-004: Display Option Dependencies Not Enforced
**File:** `src/js/core/gameState.js` (setDisplayOption function)  
**Severity:** HIGH  
**Likelihood:** HIGH (user error possibility)  
**Impact:** Invalid UI state, user confusion

**Description:**
Display options can be enabled in invalid combinations:
- `showIntersectionMarkers` requires `showOrbits`
- `showPredictedTrajectory` requires `showOrbits`

**Test Case:**
```
1. Uncheck "ORBITAL PATHS"
2. Check "ENCOUNTER MARKERS"
→ Expected: ENCOUNTER MARKERS also checks ORBITAL PATHS (or prevented)
→ Current: Ghost planets draw without orbit lines (confusing)
```

**Fix Location:**
```javascript
export function setDisplayOption(name, value) {
    // Add constraint checking:
    if (name === 'showIntersectionMarkers' && value && !displayOptions.showOrbits) {
        console.warn('[UI] Intersection markers require orbits');
        displayOptions.showOrbits = true;
    }
    displayOptions[name] = value;
}
```

---

### ISSUE-005: Animation Frame Never Cancelled
**File:** `src/js/main.js` (game loop)  
**Severity:** HIGH  
**Likelihood:** MEDIUM (mobile navigation)  
**Impact:** Memory leak, background processing

**Description:**
Game loop uses `requestAnimationFrame(gameLoop)` but never cancels RAF. If user navigates away or closes tab, RAF continues running in background, consuming CPU/memory.

**Evidence:**
```javascript
function gameLoop() {
    updatePositions();
    render();
    updateUI();
    requestAnimationFrame(gameLoop);  // Never cancelled
}

// Called once at startup:
gameLoop();
```

**Fix Required:**
```javascript
let gameLoopId = null;

export function startGameLoop() {
    if (gameLoopId !== null) return;
    gameLoopId = requestAnimationFrame(gameLoop);
}

export function stopGameLoop() {
    if (gameLoopId !== null) {
        cancelAnimationFrame(gameLoopId);
        gameLoopId = null;
    }
}

window.addEventListener('beforeunload', stopGameLoop);
window.addEventListener('pagehide', stopGameLoop);
```

---

### ISSUE-006: Projection System Tightly Coupled
**File:** `src/js/core/camera.js` (project3D function)  
**Severity:** HIGH  
**Likelihood:** HIGH (future feature work)  
**Impact:** Blocks "cockpit vs map view" toggle feature

**Description:**
`project3D()` is hard-coded to orthographic + global camera object. Cannot switch projection modes at runtime or support multiple camera systems.

**Impact on Future Work:**
- Cannot implement "cockpit mode" toggle
- Cannot reuse projection for different views
- Forces refactoring if requirements change

**Fix Strategy:**
Create projection mode abstraction with pluggable implementations.

---

### ISSUE-007: Depth Sorting Unstable
**File:** `src/js/ui/renderer.js` (lines 1218-1222)  
**Severity:** HIGH  
**Likelihood:** MEDIUM (object overlap scenarios)  
**Impact:** Visual flicker when ships dock with planets

**Description:**
Depth-based sorting is unstable when two objects have identical or very close depth values. This causes undefined rendering order and flicker.

**Test Case:**
```
1. Place two ships at identical position
2. Enable ORBITAL PATHS
→ Expected: Consistent rendering order
→ Current: Flickers as sort order becomes unstable
```

**Fix:**
```javascript
return projA.depth - projB.depth || a.name.localeCompare(b.name);  // Tie-breaker
```

---

### ISSUE-008: NaN Silently Truncates Trajectories
**File:** `src/js/lib/trajectory-predictor.js` (line 164)  
**Severity:** HIGH  
**Likelihood:** MEDIUM (extreme eccentricity/time scales)  
**Impact:** Silent data loss, prediction stops working without warning

**Description:**
When orbital elements become NaN (from numerical instability), trajectory prediction silently breaks trajectory and returns truncated array without warning.

**Evidence:**
```javascript
if (!isFinite(position.x) || !isFinite(position.y) || !isFinite(position.z)) {
    break;  // Silently stops prediction
}
```

**Impact:**
- User doesn't know prediction failed
- Ghost planets disappear mid-trajectory
- Debugging difficulty

**Fix:**
```javascript
if (!isFinite(position.x) || !isFinite(position.y) || !isFinite(position.z)) {
    console.warn('[TRAJECTORY] NaN detected at step', i, 'truncating prediction');
    break;
}
```

---

### ISSUE-009: Grid Rendering Infinite Loop Risk
**File:** `src/js/ui/renderer.js` (lines 288-306)  
**Severity:** HIGH  
**Likelihood:** LOW (extreme user input)  
**Impact:** Browser freeze, unresponsive UI

**Description:**
Grid rendering loop has no upper bound check. At extreme zoom levels (e.g., `camera.zoom = 10^6`), the loop condition `r < maxRadius` may never terminate.

**Test Case:**
```
1. Open console: camera.zoom = 1000000
2. Pan camera
→ Expected: Grid rendering optimization
→ Current: Browser may freeze or slow dramatically
```

**Fix:**
```javascript
const maxRadius = Math.min(10000, Math.max(canvas.width, canvas.height) * 2);
const maxRingCount = 1000;  // Hard limit on rings
for (let r = scale, ringCount = 0; r < maxRadius && ringCount < maxRingCount; r += scale, ringCount++) {
    // ... draw ring
}
```

---

## MEDIUM PRIORITY ISSUES (Fix This Month)

### ISSUE-010: Input Validation Missing in calculateScaledRadius
**File:** `src/js/ui/renderer.js` (lines 203-209)  
**Severity:** MEDIUM  
**Likelihood:** MEDIUM (data corruption)  
**Impact:** Visual glitches, potential render crashes

**Description:**
Function doesn't validate input parameters, can return NaN silently.

**Test Cases:**
```
calculateScaledRadius(undefined, 100)  → NaN ✗
calculateScaledRadius(-696000, 100)    → Negative radius ✗
calculateScaledRadius(0, 100)          → 0 (visually bad) ✗
```

**Fix:**
```javascript
function calculateScaledRadius(radiusKm, scale) {
    if (!isFinite(radiusKm) || radiusKm <= 0) return 2;
    if (!isFinite(scale) || scale <= 0) return 2;
    if (!isFinite(camera.zoom) || camera.zoom <= 0) return 2;
    const radiusAU = radiusKm * kmToAU;
    return Math.max(2, radiusAU * scale * camera.zoom);
}
```

---

### ISSUE-011: State Management Fragmented
**File:** `src/js/core/gameState.js`  
**Severity:** MEDIUM  
**Likelihood:** MEDIUM (refactoring risk)  
**Impact:** Complex state debugging, maintenance burden

**Description:**
Game state scattered across multiple sources:
- `gameState.js` - displayOptions, bodyFilters, trajectoryConfig
- `camera.js` - camera position/rotation
- DOM - checkbox states
- localStorage - persistence

**Impact:**
- State synchronization bugs likely
- Debugging requires checking multiple files
- Refactoring becomes complex

---

### ISSUE-012: Starfield Performance Tight
**File:** `src/js/lib/starfield.js`  
**Severity:** MEDIUM  
**Likelihood:** MEDIUM (extreme settings)  
**Impact:** Frame rate drops at extreme zoom/time scale

**Description:**
Starfield rendering costs ~3-5ms per frame with 5,080 stars. Performance degrades multiplicatively with zoom + time scale.

**Bottleneck:**
- 5,080 × (precession calc + coord transform + projection)
- Per-frame cost: ~0.3-0.8ms CPU + ~2-4ms GPU

**Acceptable for normal use, but:**
- Vulnerable at zoom > 100
- Performance monitoring not implemented

---

### ISSUE-013: Extreme Value Handling Unprotected
**Files:** Multiple  
**Severity:** MEDIUM  
**Likelihood:** MEDIUM (user can input extreme values)  
**Impact:** Numerical instability, prediction failures

**Description:**
No clamping on user-adjustable values:
- `camera.zoom` - can exceed reasonable bounds
- Time scales - 1000000x untested at scale
- Trajectory duration - can be set to extreme values

**Recommendation:**
Add reasonable bounds:
```javascript
camera.zoom = Math.max(0.1, Math.min(1000, camera.zoom));
trajectoryConfig.durationDays = Math.max(1, Math.min(730, durationDays));
```

---

### ISSUE-014: Browser Compatibility Error Handling
**File:** `src/js/lib/starfield.js` (lines 31-48)  
**Severity:** MEDIUM  
**Likelihood:** LOW (modern browsers)  
**Impact:** Silent failure, confusing user experience

**Description:**
Starfield catalog load failure silently returns empty array without user notification.

**Improved Error Handling:**
```javascript
catch (error) {
    console.error('[STARFIELD] Failed to load:', error.message);
    if (document.getElementById('loadingStatus')) {
        document.getElementById('loadingStatus').textContent =
            'Warning: Starfield unavailable (may be blocked by ad blocker)';
    }
    return [];
}
```

---

## LOW PRIORITY ISSUES (Next Release)

### ISSUE-015: Precession Formula Bounds Not Checked
**File:** `src/js/lib/starfield.js` (lines 88-97)  
**Severity:** LOW  
**Likelihood:** LOW (game set to ~2020)  
**Impact:** Inaccurate star positions outside 500-3500 AD range

**Description:**
IAU 1976 precession formula is valid for 500-3500 AD. Game currently uses ~2020, which is safe, but no guard for extreme dates.

**Recommendation:**
```javascript
if (targetYear < 500 || targetYear > 3500) {
    console.warn(`Year ${targetYear} outside safe precession range`);
}
```

---

### ISSUE-016: Performance Monitoring Not Implemented
**File:** `src/js/ui/renderer.js`  
**Severity:** LOW  
**Likelihood:** LOW (not critical for functionality)  
**Impact:** Difficult to diagnose performance issues

**Recommendation:**
Add optional performance profiler:
```javascript
export function enablePerformanceMetrics(enabled) {
    metricsEnabled = enabled;
    if (enabled) {
        console.time('starfield');
        // ... render
        console.timeEnd('starfield');
    }
}
```

---

### ISSUE-017: Projection Mode Abstraction Missing
**File:** `src/js/core/camera.js`  
**Severity:** LOW  
**Likelihood:** MEDIUM (future features)  
**Impact:** Limits flexibility for view modes

**Description:**
Hard-coded orthographic projection prevents easy addition of perspective mode.

**Future Work:**
Create projection abstraction with switchable implementations.

---

### ISSUE-018: Error Message Clarity Could Improve
**Multiple files**  
**Severity:** LOW  
**Likelihood:** LOW (not critical)  
**Impact:** User debugging difficulty

**Examples:**
- Console errors could specify exact file/function
- User-facing errors could provide recovery steps
- Performance warnings could suggest mitigation

---

## ISSUE CROSS-REFERENCE BY FILE

| File | Critical | High | Medium | Low |
|------|----------|------|--------|-----|
| `camera.js` | 1 | 2 | 0 | 1 |
| `renderer.js` | 0 | 2 | 2 | 1 |
| `starfield.js` | 0 | 0 | 1 | 2 |
| `main.js` | 1 | 1 | 0 | 0 |
| `gameState.js` | 0 | 1 | 1 | 0 |
| `trajectory-predictor.js` | 0 | 1 | 0 | 0 |
| `controls.js` | 0 | 0 | 0 | 0 |
| Multiple | 0 | 0 | 1 | 1 |
| **TOTAL** | **2** | **7** | **5** | **4** |

---

## REMEDIATION EFFORT ESTIMATE

| Severity | Count | Avg Hours | Total Hours |
|----------|-------|-----------|-------------|
| Critical | 2 | 1.5 | 3 |
| High | 7 | 1.0 | 7 |
| Medium | 5 | 0.5 | 2.5 |
| Low | 4 | 0.25 | 1 |
| **TOTAL** | **18** | - | **13.5** |

**Recommended timeline:** 8-12 hours (working with testing/review)

---

## SUCCESS CRITERIA

After fixes, review should achieve:
- [ ] Zero CRITICAL issues
- [ ] Zero HIGH-priority issues blocking release
- [ ] 90%+ confidence in numerical stability
- [ ] All edge cases handled gracefully
- [ ] Passed full test plan checklist
- [ ] Performance profile documented

**Target Confidence After Fixes: 85%+**

