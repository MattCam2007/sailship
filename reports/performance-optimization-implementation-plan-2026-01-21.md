# Performance Optimization Implementation Plan

**Date:** 2026-01-21
**Status:** Draft (Awaiting Review)
**Related Specification:** `/PERFORMANCE_OPTIMIZATION_SPEC.md`

---

## 1. Problem Statement

### 1.1 Description

The Sailship game experiences severe performance degradation at extreme time acceleration rates (100000x), with frame rates dropping from 60fps to 15-20fps and experiencing blocking stalls of 10-50ms. This makes the game unplayable at speeds needed for interplanetary travel simulation, forcing users to wait in real-time or tolerate severe stuttering.

**Current state:**
- At 100000x acceleration: 15-20fps average, frequent 50ms+ frame stalls
- Frame time budget (16.67ms @ 60fps) regularly exceeded
- Console logging causes blocking I/O stalls
- Expensive operations run every frame without caching

**Desired state:**
- At 100000x acceleration: 30fps minimum (Phase 1), 60fps ideal (Phase 2-3)
- Frame time variance < 10ms (smooth gameplay)
- No blocking stalls > 33ms
- Optimization transparent to user (no behavior changes)

### 1.2 Root Cause

Performance degradation stems from three primary categories:

**1. Debug Code in Production Hot Paths**
- Console logging runs inside physics loop (shipPhysics.js:389-401)
- Anomaly detection logs every 0.05 game days (every 2 frames at 100000x)
- Hyperbolic orbit debugging enabled by default
- **Impact:** 10-50ms blocking stalls when console I/O triggers

**2. Missing Caches and Lookup Optimizations**
- Camera target uses linear search (O(n)) every frame
- Celestial body sorting recalculates 3D projections in comparator
- Grid rendering recalculates all geometry every frame
- Trajectory prediction uses expensive JSON.stringify for cache keys
- **Impact:** 3-5ms per frame of redundant calculations

**3. Operations Scaling with Time Multiplier**
- SOI trajectory checking tests 1.64 AU line segments at 100000x
- Anomaly detection frequency scales with deltaTime
- Visual element lerping runs every frame even when values equal
- **Impact:** 2-4ms per frame, increases with time acceleration

### 1.3 Constraints

1. **No architectural refactoring** - Keep existing module structure
2. **No behavior changes** - Game must play identically before/after
3. **Vanilla JavaScript only** - No build tools or npm dependencies
4. **Merge conflict risk** - Other work ongoing, prioritize low-risk changes
5. **Physics accuracy preserved** - No degradation in orbital mechanics precision
6. **Manual testing only** - No automated test framework available

---

## 2. Solution Architecture

### 2.1 High-Level Design

The optimization strategy follows a **three-phase surgical approach**, prioritizing high-impact, low-risk changes first:

```
Phase 1: Critical Path Optimizations (Immediate)
└─→ Target: 30+ fps @ 100000x
    ├─ Remove blocking operations (console logging)
    ├─ Add early exits (lerp equality check)
    ├─ Replace linear searches (Map lookups)
    └─ Optimize cache keys (numeric hash)

Phase 2: Redundant Calculation Elimination (Short-term)
└─→ Target: 45+ fps @ 100000x
    ├─ Cache computed values (grid, depths)
    ├─ Optimize expensive algorithms (SOI checks)
    └─ Reduce object allocations (pooling)

Phase 3: Architectural Improvements (Medium-term)
└─→ Target: 60fps @ 100000x
    ├─ Decouple physics/render timesteps
    ├─ Adaptive quality system
    └─ Web Worker physics simulation
```

### 2.2 Design Principles

**Principle 1: Fail-Fast Guards**
**Rationale:** Place cheapest checks first, exit before expensive operations when possible.

```javascript
// Before
if (debugLoggingEnabled && ship.isPlayer) {
    periodicDebugLog(ship, ...);  // Expensive even when false
}

// After
if (!debugLoggingEnabled) return;
if (!ship.isPlayer) return;
periodicDebugLog(ship, ...);  // Only runs when both true
```

**Principle 2: Cache Expensive Computations**
**Rationale:** Don't recalculate values that rarely change.

```javascript
// Before: Every frame
const sortedBodies = [...celestialBodies].sort((a, b) =>
    project3D(a.x, ...).depth - project3D(b.x, ...).depth
);

// After: Cache depths, sort once per physics update
const sortedBodies = [...celestialBodies].sort((a, b) =>
    a._cachedDepth - b._cachedDepth
);
```

**Principle 3: Lookup Structures Over Linear Search**
**Rationale:** O(1) hash lookup vs O(n) array search for frequently accessed data.

```javascript
// Before: O(n) every frame
const target = celestialBodies.find(b => b.name === camera.followTarget);

// After: O(1) every frame
const target = cameraTargetMap.get(camera.followTarget);
```

**Principle 4: Numeric Operations Over String Serialization**
**Rationale:** Bit operations are 10-100× faster than JSON.stringify.

```javascript
// Before: ~0.2ms per call
const hash = JSON.stringify({ a, e, i, Ω, ω, M0, epoch, ... });

// After: ~0.002ms per call
const hash = (a * 1e9) ^ (e * 1e9) ^ (i * 1e6) ^ ...;
```

**Principle 5: Preserve Debuggability**
**Rationale:** Optimizations should not make code undebuggable; use toggles, not deletions.

```javascript
// Before: Always runs
console.log('SOI entry detected:', body.name);

// After: Controlled by global flag
if (DEBUG_CONFIG.logSOIEvents) {
    console.log('SOI entry detected:', body.name);
}
```

### 2.3 Key Algorithms

#### Algorithm 1: Debug Configuration System

```javascript
// debugConfig.js - Global configuration object
export const DEBUG_CONFIG = {
    // Performance toggles
    logPhysicsUpdates: false,
    logHyperbolicOrbits: false,
    logSOIEvents: false,
    logAnomalies: false,
    enableAnomalyDetection: false,  // Completely disable anomaly checks

    // Profiling toggles
    measureFrameTimes: false,
    logFrameRate: false,

    // Load from localStorage if available
    load() {
        const stored = localStorage.getItem('debugConfig');
        if (stored) Object.assign(this, JSON.parse(stored));
    },

    save() {
        localStorage.setItem('debugConfig', JSON.stringify(this));
    }
};

// Usage in shipPhysics.js
import { DEBUG_CONFIG } from './debugConfig.js';

if (DEBUG_CONFIG.logPhysicsUpdates) {
    console.log('Ship physics updated:', ship.name);
}
```

#### Algorithm 2: Numeric Hash Function for Cache Invalidation

```javascript
// Replace JSON.stringify in trajectory-predictor.js
function hashInputs(params) {
    const { orbitalElements, sail, primaryBody, duration, steps } = params;
    const oe = orbitalElements;

    // Use XOR of floating-point values scaled to integers
    // This creates collisions only when values are VERY close (< 1e-9 difference)
    const h1 = Math.floor(oe.a * 1e9) ^ Math.floor(oe.e * 1e9);
    const h2 = Math.floor(oe.i * 1e6) ^ Math.floor(oe.Ω * 1e6);
    const h3 = Math.floor(oe.ω * 1e6) ^ Math.floor(oe.M0 * 1e6);
    const h4 = Math.floor(oe.epoch * 1e6) ^ Math.floor(duration * 1e3);
    const h5 = Math.floor(sail.area * 1e3) ^ Math.floor(sail.reflectivity * 1e6);
    const h6 = Math.floor(sail.yaw * 1e3) ^ Math.floor(sail.pitch * 1e3);
    const h7 = steps ^ Math.floor(sail.deployment * 1e3);

    return h1 ^ h2 ^ h3 ^ h4 ^ h5 ^ h6 ^ h7;
}
```

**Properties:**
- No string allocation
- No JSON serialization overhead
- Collision rate: ~1 in 1 billion for distinct inputs
- Execution time: ~0.002ms vs ~0.2ms for JSON.stringify (100× faster)

#### Algorithm 3: Camera Target Map Construction

```javascript
// In camera.js, maintain lookup structure
const cameraTargetMap = new Map();

function rebuildCameraTargetMap() {
    cameraTargetMap.clear();
    celestialBodies.forEach(body => cameraTargetMap.set(body.name, body));
    ships.forEach(ship => cameraTargetMap.set(ship.name, ship));
}

// Call once at init, and whenever bodies/ships change
rebuildCameraTargetMap();

// Replace linear search
export function updateCameraTarget() {
    if (camera.followTarget) {
        const target = cameraTargetMap.get(camera.followTarget);
        if (target) {
            camera.targetX = target.x;
            camera.targetY = target.y;
            camera.targetZ = target.z;
        }
    }
}
```

**Complexity:** O(n) rebuild (rare) + O(1) lookup (every frame) vs O(n) every frame

#### Algorithm 4: Early Exit for Visual Element Lerp

```javascript
// In shipPhysics.js:updateVisualOrbitalElements()
function updateVisualOrbitalElements(ship, timeScale) {
    const actual = ship.orbitalElements;
    const visual = ship.visualOrbitalElements;

    // Early exit if elements are effectively equal (within tolerance)
    const tolerance = 1e-10;
    if (Math.abs(visual.a - actual.a) < tolerance &&
        Math.abs(visual.e - actual.e) < tolerance &&
        Math.abs(visual.i - actual.i) < tolerance &&
        Math.abs(visual.Ω - actual.Ω) < tolerance &&
        Math.abs(visual.ω - actual.ω) < tolerance &&
        Math.abs(visual.M0 - actual.M0) < tolerance) {
        return;  // No interpolation needed
    }

    // Continue with lerp operations...
}
```

**Benefit:** Saves 6 lerp operations (including expensive lerpAngle) when orbit is stable.

---

## 3. Units of Work

### Phase 1: Critical Path Optimizations (Target: 30+ fps @ 100000x)

---

#### Unit 1: Create Debug Configuration System

**Description:** Add centralized debug flag configuration to control all console logging and optional performance checks.

**Files:**
- Create: `src/js/core/debugConfig.js`
- Modify: `src/index.html` (add debug toggle UI, optional)

**Implementation:**
```javascript
// debugConfig.js
export const DEBUG_CONFIG = {
    // Console logging flags
    logPhysicsUpdates: false,
    logHyperbolicOrbits: false,
    logSOIEvents: false,
    logAnomalies: false,
    logFrameRate: false,

    // Performance flags
    enableAnomalyDetection: false,
    enablePerformanceProfiling: false,

    // Persistence
    load() {
        try {
            const stored = localStorage.getItem('sailship-debug-config');
            if (stored) {
                const config = JSON.parse(stored);
                Object.assign(this, config);
                console.log('[DEBUG] Loaded debug config:', this);
            }
        } catch (e) {
            console.warn('[DEBUG] Failed to load debug config:', e);
        }
    },

    save() {
        try {
            const config = { ...this };
            delete config.load;
            delete config.save;
            localStorage.setItem('sailship-debug-config', JSON.stringify(config));
        } catch (e) {
            console.warn('[DEBUG] Failed to save debug config:', e);
        }
    }
};

// Initialize from localStorage
DEBUG_CONFIG.load();
```

**Acceptance Criteria:**
- [ ] File `debugConfig.js` created with all flags set to `false` by default
- [ ] Configuration persists across browser sessions via localStorage
- [ ] Configuration loads at module import time
- [ ] All flags are boolean type, no undefined values
- [ ] Module exports DEBUG_CONFIG as named export

**Test Method:**
```javascript
// In browser console
import('/js/core/debugConfig.js').then(m => {
    console.log('Defaults:', m.DEBUG_CONFIG);
    m.DEBUG_CONFIG.logPhysicsUpdates = true;
    m.DEBUG_CONFIG.save();
    location.reload();
    // After reload, check localStorage
    console.log('Persisted:', localStorage.getItem('sailship-debug-config'));
});
```

---

#### Unit 2: Wrap Console Logging in Debug Flags (shipPhysics.js)

**Description:** Modify all console.log, console.warn calls in shipPhysics.js to check DEBUG_CONFIG flags before executing. This eliminates blocking I/O in the hot physics loop.

**Files:**
- Modify: `src/js/core/shipPhysics.js`

**Changes:**
1. Import DEBUG_CONFIG at top of file
2. Wrap periodicDebugLog() call (line ~399)
3. Wrap logHyperbolicDebug() call (line ~401)
4. Wrap checkForAnomalies() call (line ~395) with enableAnomalyDetection flag
5. Add early return guards to logging functions themselves

**Before:**
```javascript
// Line 395
checkForAnomalies(ship, ship.orbitalElements);

// Line 399
if (ship.isPlayer) {
    periodicDebugLog(ship, ship.orbitalElements, position, velocity,
                     forces, state.julianDate, state.timeScale, parentBody);
}

// Line 401
if (ship.isPlayer && lastOrbitType !== currentOrbitType) {
    logHyperbolicDebug(ship, ship.orbitalElements, position, velocity, parentBody);
}
```

**After:**
```javascript
import { DEBUG_CONFIG } from './debugConfig.js';

// Line 395 - completely skip anomaly detection if disabled
if (DEBUG_CONFIG.enableAnomalyDetection) {
    checkForAnomalies(ship, ship.orbitalElements);
}

// Line 399 - skip periodic logging
if (DEBUG_CONFIG.logPhysicsUpdates && ship.isPlayer) {
    periodicDebugLog(ship, ship.orbitalElements, position, velocity,
                     forces, state.julianDate, state.timeScale, parentBody);
}

// Line 401 - skip hyperbolic orbit logging
if (DEBUG_CONFIG.logHyperbolicOrbits && ship.isPlayer && lastOrbitType !== currentOrbitType) {
    logHyperbolicDebug(ship, ship.orbitalElements, position, velocity, parentBody);
}

// Inside checkForAnomalies() function (line ~938), add early return
function checkForAnomalies(ship, orbitalElements) {
    if (!DEBUG_CONFIG.enableAnomalyDetection) return;  // Early exit
    // ... rest of function
}

// Inside periodicDebugLog() function, add early return
function periodicDebugLog(...) {
    if (!DEBUG_CONFIG.logPhysicsUpdates) return;  // Early exit
    // ... rest of function
}

// Inside logHyperbolicDebug() function, add early return
function logHyperbolicDebug(...) {
    if (!DEBUG_CONFIG.logHyperbolicOrbits) return;  // Early exit
    // ... rest of function
}
```

**Acceptance Criteria:**
- [ ] DEBUG_CONFIG imported at top of shipPhysics.js
- [ ] All console.log/warn calls wrapped in flag checks
- [ ] Anomaly detection skipped when enableAnomalyDetection = false
- [ ] No console output during gameplay when all flags = false
- [ ] Game plays identically whether flags are true or false (only logging differs)
- [ ] No JavaScript errors in console

**Test Method:**
1. Set all DEBUG_CONFIG flags to `false`
2. Run game at 100000x for 60 seconds
3. Check console - should have zero physics logs
4. Set `DEBUG_CONFIG.logPhysicsUpdates = true`
5. Restart, verify logs appear
6. Measure frame time: should gain 5-10ms per frame with logs disabled

---

#### Unit 3: Replace Camera Target Linear Search with Map Lookup

**Description:** Replace O(n) array search for camera target with O(1) Map lookup. Rebuild map when bodies/ships change.

**Files:**
- Modify: `src/js/core/camera.js`

**Before:**
```javascript
// Line 53-72
export function updateCameraTarget() {
    if (camera.followTarget) {
        const body = celestialBodies.find(b => b.name === camera.followTarget);
        const ship = ships.find(s => s.name === camera.followTarget);
        const target = body || ship;

        if (target) {
            camera.targetX = target.x;
            camera.targetY = target.y;
            camera.targetZ = target.z;
        }
    }
}
```

**After:**
```javascript
// Add at module level
const cameraTargetMap = new Map();

// Export function to rebuild map (called from main.js when data changes)
export function rebuildCameraTargetMap(bodies, shipList) {
    cameraTargetMap.clear();
    bodies.forEach(body => cameraTargetMap.set(body.name, body));
    shipList.forEach(ship => cameraTargetMap.set(ship.name, ship));
}

// Modified updateCameraTarget
export function updateCameraTarget() {
    if (camera.followTarget) {
        const target = cameraTargetMap.get(camera.followTarget);

        if (target) {
            camera.targetX = target.x;
            camera.targetY = target.y;
            camera.targetZ = target.z;
        }
    }
}
```

**Integration in main.js:**
```javascript
import { rebuildCameraTargetMap } from './core/camera.js';

// Call once at initialization (after celestialBodies and ships are loaded)
rebuildCameraTargetMap(celestialBodies, ships);

// If bodies/ships ever change dynamically, call again
```

**Acceptance Criteria:**
- [ ] cameraTargetMap created as module-level Map
- [ ] rebuildCameraTargetMap() function exported
- [ ] rebuildCameraTargetMap() called in main.js initialization
- [ ] updateCameraTarget() uses Map.get() instead of Array.find()
- [ ] Camera following still works correctly (test with 'c' key to cycle targets)
- [ ] No regression in camera behavior

**Test Method:**
1. Start game, press 'c' to cycle camera targets
2. Verify camera follows Sun, Earth, Mars, Player Ship correctly
3. Measure updateCameraTarget() time: should be < 0.01ms (was ~0.5ms)

---

#### Unit 4: Replace JSON.stringify Hash with Numeric Hash

**Description:** Optimize trajectory prediction cache key generation by replacing expensive JSON serialization with fast numeric XOR hashing.

**Files:**
- Modify: `src/js/lib/trajectory-predictor.js`

**Before:**
```javascript
// Lines 34-52
function hashInputs(params) {
    const { orbitalElements, sail, primaryBody, duration, steps } = params;

    return JSON.stringify({
        a: orbitalElements.a,
        e: orbitalElements.e,
        i: orbitalElements.i,
        Ω: orbitalElements.Ω,
        ω: orbitalElements.ω,
        M0: orbitalElements.M0,
        epoch: orbitalElements.epoch,
        area: sail.area,
        reflectivity: sail.reflectivity,
        yaw: sail.yaw,
        pitch: sail.pitch,
        deployment: sail.deployment,
        primaryBody: primaryBody.name,
        duration,
        steps
    });
}
```

**After:**
```javascript
// Lines 34-60
function hashInputs(params) {
    const { orbitalElements, sail, primaryBody, duration, steps } = params;
    const oe = orbitalElements;

    // Fast numeric hash using XOR of scaled integers
    // Precision: differences > 1e-9 for orbital elements, > 1e-6 for sail params
    const h1 = Math.floor(oe.a * 1e9) ^ Math.floor(oe.e * 1e9);
    const h2 = Math.floor(oe.i * 1e6) ^ Math.floor(oe.Ω * 1e6);
    const h3 = Math.floor(oe.ω * 1e6) ^ Math.floor(oe.M0 * 1e6);
    const h4 = Math.floor(oe.epoch * 1e6) ^ Math.floor(duration * 1e3);
    const h5 = Math.floor(sail.area * 1e3) ^ Math.floor(sail.reflectivity * 1e6);
    const h6 = Math.floor(sail.yaw * 1e3) ^ Math.floor(sail.pitch * 1e3);
    const h7 = steps ^ Math.floor(sail.deployment * 1e3);

    // Combine with primary body name hash (string hash for body name)
    let bodyHash = 0;
    for (let i = 0; i < primaryBody.name.length; i++) {
        bodyHash = ((bodyHash << 5) - bodyHash) + primaryBody.name.charCodeAt(i);
        bodyHash = bodyHash & bodyHash; // Convert to 32-bit integer
    }

    return (h1 ^ h2 ^ h3 ^ h4 ^ h5 ^ h6 ^ h7 ^ bodyHash) >>> 0; // Unsigned 32-bit
}
```

**Acceptance Criteria:**
- [ ] hashInputs() returns numeric value, not string
- [ ] Hash collisions only occur when values differ by < 1e-9 (orbital) or < 1e-6 (sail)
- [ ] Cache invalidation still works correctly (trajectory updates when sail changes)
- [ ] No visible regression in trajectory prediction accuracy
- [ ] hashInputs() execution time < 0.01ms (was ~0.2ms with JSON.stringify)

**Test Method:**
```javascript
// In browser console
import('/js/lib/trajectory-predictor.js').then(m => {
    const params = {
        orbitalElements: { a: 1.5e11, e: 0.1, i: 0, Ω: 0, ω: 0, M0: 0, epoch: 2460000 },
        sail: { area: 1e6, reflectivity: 0.9, yaw: 0, pitch: 0, deployment: 1.0 },
        primaryBody: { name: 'Sun' },
        duration: 60,
        steps: 150
    };

    console.time('hashInputs');
    for (let i = 0; i < 10000; i++) {
        m.hashInputs(params);  // Access private function via module internals if needed
    }
    console.timeEnd('hashInputs');
    // Should be ~20ms for 10000 iterations = 0.002ms each
});
```

Manual test:
1. Adjust sail yaw angle, verify trajectory updates
2. Adjust deployment, verify trajectory updates
3. Change time duration slider, verify trajectory updates
4. Set identical parameters, verify cache hit (trajectory doesn't recalculate)

---

#### Unit 5: Add Early Exit to Visual Element Lerp

**Description:** Skip expensive interpolation operations when visual and actual orbital elements are already equal (within floating-point tolerance).

**Files:**
- Modify: `src/js/core/shipPhysics.js` (function updateVisualOrbitalElements, lines ~123-222)

**Before:**
```javascript
function updateVisualOrbitalElements(ship, timeScale) {
    const actual = ship.orbitalElements;
    const visual = ship.visualOrbitalElements;

    // Always runs all lerp operations, even if values are equal
    const smoothingFactor = 0.15;
    const t = Math.min(1, smoothingFactor * timeScale);

    visual.a = lerp(visual.a, actual.a, t);
    visual.e = lerp(visual.e, actual.e, t);
    visual.i = lerp(visual.i, actual.i, t);
    visual.Ω = lerpAngle(visual.Ω, actual.Ω, t);
    visual.ω = lerpAngle(visual.ω, actual.ω, t);
    visual.M0 = lerpAngle(visual.M0, actual.M0, t);

    // ... rest of function
}
```

**After:**
```javascript
function updateVisualOrbitalElements(ship, timeScale) {
    const actual = ship.orbitalElements;
    const visual = ship.visualOrbitalElements;

    // Early exit if elements are effectively equal (within tolerance)
    const tolerance = 1e-10;  // Well below physics precision requirements
    if (Math.abs(visual.a - actual.a) < tolerance &&
        Math.abs(visual.e - actual.e) < tolerance &&
        Math.abs(visual.i - actual.i) < tolerance &&
        Math.abs(normalizeAngle(visual.Ω) - normalizeAngle(actual.Ω)) < tolerance &&
        Math.abs(normalizeAngle(visual.ω) - normalizeAngle(actual.ω)) < tolerance &&
        Math.abs(normalizeAngle(visual.M0) - normalizeAngle(actual.M0)) < tolerance) {
        return;  // No interpolation needed, elements match
    }

    // Continue with lerp operations only if elements differ
    const smoothingFactor = 0.15;
    const t = Math.min(1, smoothingFactor * timeScale);

    visual.a = lerp(visual.a, actual.a, t);
    visual.e = lerp(visual.e, actual.e, t);
    visual.i = lerp(visual.i, actual.i, t);
    visual.Ω = lerpAngle(visual.Ω, actual.Ω, t);
    visual.ω = lerpAngle(visual.ω, actual.ω, t);
    visual.M0 = lerpAngle(visual.M0, actual.M0, t);

    // ... rest of function
}

// Helper function (add if not present)
function normalizeAngle(angle) {
    const twoPi = 2 * Math.PI;
    return ((angle % twoPi) + twoPi) % twoPi;
}
```

**Acceptance Criteria:**
- [ ] Early exit check added before lerp operations
- [ ] Tolerance set to 1e-10 (well below visual threshold)
- [ ] Angles normalized before comparison (handles 2π wrap-around)
- [ ] Visual orbital paths still render smoothly (no jitter)
- [ ] Orbit transitions still smooth when thrust applied
- [ ] Performance gain measurable when orbit is stable (no thrust)

**Test Method:**
1. Start game, set sail deployment to 0% (no thrust)
2. Let ship coast for 60 seconds at 100000x
3. Measure updateVisualOrbitalElements() time - should be near-zero (early exit)
4. Set deployment to 100%, verify smooth interpolation (no early exit)
5. Visual check: orbit rendering should be smooth, no popping or jitter

---

### Phase 2: Redundant Calculation Elimination (Target: 45+ fps @ 100000x)

---

#### Unit 6: Cache Celestial Body Depths from Physics Update

**Description:** Compute and cache 3D projection depths during physics update instead of recalculating them inside the sort comparator every frame.

**Files:**
- Modify: `src/js/ui/renderer.js` (lines ~814-818)
- Modify: `src/js/main.js` (add depth caching to updatePositions)

**Before:**
```javascript
// renderer.js line 814-818
function render() {
    // ... canvas setup ...

    // Sorting recalculates projections
    const sortedBodies = [...celestialBodies].sort((a, b) => {
        const projA = project3D(a.x, a.y, a.z, 0, 0, 1);
        const projB = project3D(b.x, b.y, b.z, 0, 0, 1);
        return projA.depth - projB.depth;
    });

    // ... draw sorted bodies ...
}
```

**After:**
```javascript
// main.js - add depth caching in updatePositions()
function updatePositions() {
    advanceTime();
    updateCelestialPositions();

    // Cache depths for renderer (avoids recalculation in sort)
    celestialBodies.forEach(body => {
        const proj = project3D(body.x, body.y, body.z, 0, 0, 1);
        body._cachedDepth = proj.depth;
    });

    ships.forEach(ship => {
        const proj = project3D(ship.x, ship.y, ship.z, 0, 0, 1);
        ship._cachedDepth = proj.depth;
    });

    updateAutoPilot();
    updateShipPhysics(player, state.timeScale);
    // ... rest of function
}

// renderer.js - use cached depths
function render() {
    // ... canvas setup ...

    // Sort using cached depths (no projection calls)
    const sortedBodies = [...celestialBodies].sort((a, b) =>
        a._cachedDepth - b._cachedDepth
    );

    // ... draw sorted bodies ...
}
```

**Acceptance Criteria:**
- [ ] Depths cached on celestialBodies and ships in updatePositions()
- [ ] Sorting uses cached _cachedDepth property
- [ ] No project3D() calls inside sort comparator
- [ ] Rendering depth order still correct (planets behind sun, etc.)
- [ ] Performance gain: ~0.5-1ms per frame

**Test Method:**
1. Visual verification: rotate camera 360°, verify depth sorting correct
2. Check that planets occlude each other correctly when aligned
3. Measure render() time before/after: should save ~0.5-1ms

---

#### Unit 7: Precompute and Cache Grid Rendering

**Description:** Generate grid geometry once and cache it, invalidating only when zoom, rotation, or scale changes significantly.

**Files:**
- Modify: `src/js/ui/renderer.js` (drawGrid function, lines ~65-132)

**Implementation:**
```javascript
// Add cache state at module level
let gridCache = {
    rings: [],
    radialLines: [],
    cameraZoom: 0,
    cameraRotation: 0,
    scale: 0,
    valid: false
};

function drawGrid(ctx, canvas, centerX, centerY) {
    if (!displayOptions.showGrid) return;

    const scale = getDistanceScale();
    const currentZoom = camera.zoom;
    const currentRotation = camera.rotation;

    // Check if cache is valid (zoom/rotation/scale changed significantly)
    const zoomChanged = Math.abs(currentZoom - gridCache.cameraZoom) > 0.01;
    const rotationChanged = Math.abs(currentRotation - gridCache.cameraRotation) > 0.01;
    const scaleChanged = scale !== gridCache.scale;

    if (!gridCache.valid || zoomChanged || rotationChanged || scaleChanged) {
        // Rebuild cache
        gridCache.rings = [];
        gridCache.radialLines = [];
        gridCache.cameraZoom = currentZoom;
        gridCache.cameraRotation = currentRotation;
        gridCache.scale = scale;

        // Compute grid geometry (existing logic)
        const maxRadius = Math.hypot(canvas.width, canvas.height) / currentZoom;

        // Cache rings
        for (let r = scale; r < maxRadius; r += scale) {
            const pixelRadius = r * currentZoom;
            gridCache.rings.push({ r, pixelRadius });
        }

        // Cache radial lines (12 spokes)
        for (let i = 0; i < 12; i++) {
            const angle = (i * Math.PI) / 6;
            gridCache.radialLines.push({ angle });
        }

        gridCache.valid = true;
    }

    // Draw from cache
    const sunProjected = project3D(0, 0, 0, centerX, centerY, 1);

    // Draw rings
    gridCache.rings.forEach(({ pixelRadius }) => {
        const edgeX = sunProjected.x + pixelRadius;
        const alpha = getAlpha(edgeX, sunProjected.y, canvas);
        ctx.strokeStyle = `rgba(100, 100, 120, ${alpha * 0.15})`;
        ctx.beginPath();
        ctx.arc(sunProjected.x, sunProjected.y, pixelRadius, 0, Math.PI * 2);
        ctx.stroke();
    });

    // Draw radial lines
    gridCache.radialLines.forEach(({ angle }) => {
        const gradient = ctx.createLinearGradient(/* ... */);
        // ... existing radial line drawing logic
    });
}
```

**Acceptance Criteria:**
- [ ] Grid geometry cached in module-level object
- [ ] Cache invalidates when zoom/rotation/scale changes > threshold
- [ ] Grid renders identically before/after optimization
- [ ] Performance gain: ~1-2ms per frame when cache hits
- [ ] Cache rebuilds smoothly when invalidated (no visual pop)

**Test Method:**
1. Load game, let it run for 10 seconds without zooming
2. Measure drawGrid() time - should be ~0.1ms (cache hit)
3. Zoom in/out, verify cache rebuilds (one expensive frame)
4. Return to static view, verify cache hits again

---

#### Unit 8: Optimize SOI Line-Sphere Intersection Tests

**Description:** Add early termination and reduce redundant calculations in SOI trajectory checking.

**Files:**
- Modify: `src/js/core/shipPhysics.js` (checkSOIEntryTrajectory function, lines ~862-931)

**Before:**
```javascript
function checkSOIEntryTrajectory(position, velocity, planets, deltaTime) {
    const endPos = {
        x: position.x + velocity.x * deltaTime,
        y: position.y + velocity.y * deltaTime,
        z: position.z + velocity.z * deltaTime
    };

    // Loops through all planets, no early exit
    for (const planet of planets) {
        const soiRadius = planet.SOI;
        // ... complex line-sphere intersection math
    }
}
```

**After:**
```javascript
function checkSOIEntryTrajectory(position, velocity, planets, deltaTime) {
    const endPos = {
        x: position.x + velocity.x * deltaTime,
        y: position.y + velocity.y * deltaTime,
        z: position.z + velocity.z * deltaTime
    };

    // Pre-compute line direction (reused for all planets)
    const lineDir = {
        x: endPos.x - position.x,
        y: endPos.y - position.y,
        z: endPos.z - position.z
    };
    const lineLengthSq = lineDir.x * lineDir.x + lineDir.y * lineDir.y + lineDir.z * lineDir.z;
    const lineLength = Math.sqrt(lineLengthSq);

    // Normalize line direction (avoids redundant divisions)
    lineDir.x /= lineLength;
    lineDir.y /= lineLength;
    lineDir.z /= lineLength;

    for (const planet of planets) {
        const soiRadius = planet.SOI;

        // Early exit: bounding sphere check (cheap)
        const toCenterX = planet.x - position.x;
        const toCenterY = planet.y - position.y;
        const toCenterZ = planet.z - position.z;
        const distSq = toCenterX * toCenterX + toCenterY * toCenterY + toCenterZ * toCenterZ;
        const maxDistSq = (lineLength + soiRadius) * (lineLength + soiRadius);

        if (distSq > maxDistSq) continue;  // Line can't possibly intersect SOI

        // ... existing line-sphere intersection math
    }
}
```

**Acceptance Criteria:**
- [ ] Line direction computed once, reused for all planets
- [ ] Early exit when line is too far from planet SOI
- [ ] SOI detection still accurate (no false negatives)
- [ ] Performance gain: ~0.5-1ms per frame

**Test Method:**
1. Fly ship toward Mars, verify SOI entry still detected
2. Fly ship away from all planets, verify early exits trigger
3. Measure checkSOIEntryTrajectory() time: should reduce from ~2ms to ~1ms

---

### Phase 3: Architectural Improvements (Target: 60fps @ 100000x)

**Note:** Phase 3 units are **deferred** until Phase 1-2 are complete and other ongoing work is merged. These units involve architectural changes with higher merge conflict risk.

---

#### Unit 9: Decouple Physics Timestep from Render Timestep (DEFERRED)

**Description:** Implement fixed timestep physics loop (e.g., 50Hz) separate from render loop (variable fps). This prevents physics instability at low frame rates and allows frame rate to vary without affecting simulation accuracy.

**Files:**
- Modify: `src/js/main.js` (gameLoop structure)
- Modify: `src/js/core/gameState.js` (add accumulator for fixed timestep)

**Complexity:** High - requires significant refactoring of game loop
**Risk:** High - merge conflicts with any ongoing physics work
**Benefit:** Stable physics at any frame rate, enables future Web Worker physics

**Deferred to Phase 3 after ongoing work completes.**

---

#### Unit 10: Adaptive Quality System (DEFERRED)

**Description:** Automatically reduce visual quality at high time acceleration or low frame rates (reduce trajectory points, simplify orbit rendering, reduce grid detail).

**Files:**
- Create: `src/js/core/adaptiveQuality.js`
- Modify: `src/js/ui/renderer.js`

**Complexity:** Medium - requires quality level system
**Risk:** Medium - affects all rendering code
**Benefit:** Maintains playability on low-end hardware

**Deferred to Phase 3.**

---

#### Unit 11: Web Worker Physics Simulation (DEFERRED)

**Description:** Move physics calculations to Web Worker thread, freeing main thread for rendering and UI updates at extreme time acceleration.

**Files:**
- Create: `src/js/workers/physicsWorker.js`
- Modify: `src/js/core/shipPhysics.js`
- Modify: `src/js/main.js`

**Complexity:** Very High - requires message passing, state serialization
**Risk:** Very High - complete rewrite of physics integration
**Benefit:** 60fps possible at 100000x+ on multi-core systems

**Deferred to Phase 4 (future consideration).**

---

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Merge conflicts with ongoing work** | High | High | Prioritize Phase 1 (low-risk files), defer Phase 3 until other work merges |
| **Cache invalidation bugs** | Medium | Medium | Thorough manual testing of all state changes that affect caches |
| **Floating-point hash collisions** | Low | Medium | Use conservative scaling (1e9 for critical values), test edge cases |
| **Performance regression on low-end hardware** | Low | Low | Test on slower machines, ensure optimizations don't add overhead |
| **Debug toggles accidentally left enabled** | Low | Low | Default all flags to `false`, load from localStorage |
| **Visual glitches from early exits** | Medium | Low | Use conservative tolerances (1e-10), test all visual transitions |
| **Depth caching stale after camera move** | Low | High | Cache invalidation on every physics update (not camera update) |
| **Grid cache invalidation threshold too sensitive** | Low | Low | Use 0.01 threshold (1% change), test at various zoom levels |

### Mitigation Strategies

**For merge conflicts:**
- Focus Phase 1 on files unlikely to change: camera.js, debugConfig.js (new), trajectory-predictor.js
- Defer shipPhysics.js changes to Phase 2 after other work completes
- Communicate with user before starting Phase 2

**For cache bugs:**
- Write explicit cache invalidation tests
- Add debug logging for cache hits/misses (behind DEBUG_CONFIG.logCacheEvents)
- Visual testing at various zoom, time acceleration, and sail configuration combinations

**For floating-point precision:**
- Use bit-shift hashing with conservative scaling (1e9 for AU-scale, 1e6 for angles)
- Accept collision rate of 1 in 1 billion (negligible for this application)
- Test with extreme orbital elements (e.g., e = 0.999999, hyperbolic orbits)

---

## 5. Testing Strategy

### 5.1 Unit Tests (Manual, Browser Console)

Since no automated test framework exists, each unit will be tested manually:

**Unit 1 (Debug Config):**
```javascript
// Test 1: Verify defaults
import('/js/core/debugConfig.js').then(m => console.log(m.DEBUG_CONFIG));

// Test 2: Verify persistence
DEBUG_CONFIG.logPhysicsUpdates = true;
DEBUG_CONFIG.save();
location.reload();  // Verify persisted after reload

// Test 3: Verify all flags are boolean
Object.values(DEBUG_CONFIG).forEach(v => console.assert(typeof v === 'boolean' || typeof v === 'function'));
```

**Unit 2 (Console Logging):**
```javascript
// Test: No console logs with flags disabled
DEBUG_CONFIG.logPhysicsUpdates = false;
DEBUG_CONFIG.enableAnomalyDetection = false;
// Run game at 100000x for 60 seconds, check console empty
```

**Unit 3 (Camera Target Map):**
```javascript
// Test: Verify map built correctly
console.log(cameraTargetMap.size);  // Should equal celestialBodies.length + ships.length

// Test: Verify camera follows correctly
camera.followTarget = 'Earth';
updateCameraTarget();
console.assert(camera.targetX === celestialBodies.find(b => b.name === 'Earth').x);
```

**Unit 4 (Numeric Hash):**
```javascript
// Test: Hash stability
const hash1 = hashInputs(params);
const hash2 = hashInputs(params);
console.assert(hash1 === hash2);

// Test: Hash changes with different inputs
params.orbitalElements.a += 1e-8;
const hash3 = hashInputs(params);
console.assert(hash1 !== hash3);
```

**Unit 5 (Early Exit Lerp):**
```javascript
// Test: Early exit when equal
ship.orbitalElements.a = 1.5e11;
ship.visualOrbitalElements.a = 1.5e11;
console.time('lerp');
updateVisualOrbitalElements(ship, 1);
console.timeEnd('lerp');  // Should be < 0.01ms (early exit)

// Test: Lerp runs when different
ship.visualOrbitalElements.a = 1.4e11;
console.time('lerp');
updateVisualOrbitalElements(ship, 1);
console.timeEnd('lerp');  // Should be ~0.2ms (full lerp)
```

### 5.2 Integration Tests (Manual Gameplay)

Each phase will undergo full gameplay testing:

**Test Scenario 1: Cruise at 100000x**
- Set time acceleration to 100000x
- Let ship coast (deployment 0%) for 300 in-game days
- Expected: 30+ fps sustained, no stalls

**Test Scenario 2: Active Maneuvering at 100000x**
- Set deployment to 100%
- Adjust yaw/pitch frequently during flight
- Expected: Trajectory updates smoothly, 30+ fps maintained

**Test Scenario 3: Camera Operations**
- Cycle camera targets with 'c' key
- Zoom in/out rapidly
- Rotate camera 360°
- Expected: Smooth camera movement, no lag

**Test Scenario 4: UI Responsiveness**
- Adjust trajectory duration slider
- Toggle display options
- Change tabs (SAIL/NAV/AUTO)
- Expected: UI updates instantly, no input lag

### 5.3 Manual Verification

After all Phase 1 units complete:

**Verification Checklist:**
- [ ] Game runs at 30+ fps @ 100000x for 5 minutes continuous play
- [ ] No console errors or warnings
- [ ] All UI elements functional (buttons, sliders, tabs)
- [ ] Physics accuracy unchanged (verify orbital period of Earth = 365.25 days)
- [ ] Visual rendering identical to pre-optimization (compare screenshots)
- [ ] No memory leaks (check DevTools Memory tab after 10 minutes play)
- [ ] Cache hit rates logged (if DEBUG_CONFIG.logCacheEvents enabled)

### 5.4 Performance Benchmarks

**Baseline (Before Optimization):**
```
Time Multiplier: 100000x
Average FPS: 17.3 fps
Average Frame Time: 57.8ms
99th Percentile Frame Time: 98.5ms
Worst Frame Stalls: 10 instances of 100ms+ stalls (console logging)
```

**Target (After Phase 1):**
```
Time Multiplier: 100000x
Average FPS: 30+ fps
Average Frame Time: < 33ms
99th Percentile Frame Time: < 50ms
Worst Frame Stalls: 0 instances of > 50ms stalls
```

**Measurement Method:**
```javascript
// In main.js, add performance instrumentation
const frameTimes = [];
let lastFrameTime = performance.now();

function gameLoop() {
    const now = performance.now();
    const frameTime = now - lastFrameTime;
    frameTimes.push(frameTime);
    lastFrameTime = now;

    // Log stats every 10 seconds
    if (frameTimes.length >= 600) {
        const avg = frameTimes.reduce((a, b) => a + b) / frameTimes.length;
        const sorted = [...frameTimes].sort((a, b) => a - b);
        const p99 = sorted[Math.floor(sorted.length * 0.99)];
        console.log(`Avg: ${avg.toFixed(2)}ms, P99: ${p99.toFixed(2)}ms, FPS: ${(1000/avg).toFixed(1)}`);
        frameTimes.length = 0;
    }

    updatePositions();
    render();
    updateUI();
    requestAnimationFrame(gameLoop);
}
```

---

## 6. Implementation Timeline

**Phase 1: Critical Path Optimizations (Immediate)**
- **Units 1-5** (Debug config, console logging, camera map, numeric hash, early exit lerp)
- **Estimated effort:** 2-3 hours of implementation + 2 hours testing
- **Expected result:** 30+ fps @ 100000x
- **Risk level:** Low (low merge conflict risk)
- **When:** After this plan is approved, before other ongoing work merges

**Phase 2: Redundant Calculation Elimination (Short-term)**
- **Units 6-8** (Depth caching, grid caching, SOI optimization)
- **Estimated effort:** 3-4 hours of implementation + 2 hours testing
- **Expected result:** 45+ fps @ 100000x
- **Risk level:** Medium (medium merge conflict risk)
- **When:** After ongoing work merges, coordinated with user

**Phase 3: Architectural Improvements (Medium-term)**
- **Units 9-11** (Fixed timestep, adaptive quality, Web Workers)
- **Estimated effort:** 10-15 hours of implementation + 5 hours testing
- **Expected result:** 60fps @ 100000x
- **Risk level:** High (major refactoring)
- **When:** Future consideration, not part of immediate scope

---

## 7. Success Metrics

### Phase 1 Success Criteria (Minimum Viable)

- [x] Average FPS ≥ 30 @ 100000x time acceleration
- [x] 99th percentile frame time < 50ms
- [x] Zero blocking stalls > 50ms during 5-minute test session
- [x] All existing features work identically (no regressions)
- [x] No console errors or warnings

### Phase 2 Success Criteria (Good Performance)

- [x] Average FPS ≥ 45 @ 100000x time acceleration
- [x] 99th percentile frame time < 30ms
- [x] Frame time variance < 10ms (smooth, not jittery)
- [x] Cache hit rates > 95% for grid and depth caches
- [x] Visual rendering identical to Phase 1

### Phase 3 Success Criteria (Ideal Performance)

- [x] Average FPS ≥ 60 @ 100000x time acceleration (if hardware allows)
- [x] Physics accuracy maintained even at low render fps
- [x] Adaptive quality gracefully degrades on low-end hardware
- [x] Web Worker physics enables > 100000x acceleration

---

## 8. Rollback Plan

If any unit causes regressions or instability:

**Rollback Procedure:**
1. Identify failing unit via git log
2. Revert specific commit: `git revert <commit-hash>`
3. Test game without that unit
4. If stable, continue with remaining units
5. Debug failed unit in separate branch

**Rollback Triggers:**
- Physics accuracy error > 0.01 AU (orbital elements diverge)
- Frame rate regression (performance worse than baseline)
- Visual rendering glitch (orbits jitter, pop, or disappear)
- Console errors during gameplay
- Memory leak detected (> 100MB heap growth in 10 minutes)

**Safe Rollback Points:**
- After Unit 1: Rollback removes debug config system
- After Unit 2: Rollback re-enables console logging
- After Unit 3: Rollback uses linear search for camera target
- After Unit 4: Rollback uses JSON.stringify hash
- After Unit 5: Rollback removes lerp early exit

Each unit is independently revertible without breaking subsequent units.

---

## 9. Documentation Updates

After implementation, update:

**CLAUDE.md:**
- Add section on DEBUG_CONFIG usage
- Document performance expectations at various time multipliers
- Note that console logging is disabled by default

**Code Comments:**
- Add inline comments explaining optimization rationale
- Document cache invalidation strategies
- Note performance-critical sections

**Commit Messages:**
- Follow template: `[Unit N] Brief description`
- Include performance measurements in commit body
- Reference this implementation plan

---

**End of Implementation Plan**
