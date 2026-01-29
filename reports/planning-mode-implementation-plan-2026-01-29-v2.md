# Planning Mode Implementation Plan v2

**Date:** 2026-01-29
**Version:** 2.0
**Status:** Revised (addresses review findings)
**Specification:** `reports/planning-mode-spec-2026-01-29.md`
**Previous Review:** `reports/planning-mode-review-2026-01-29.md`

---

## Revision Summary

This version addresses all critical issues from the four-perspective review:

| Issue | Resolution |
|-------|------------|
| Ghost planet time filtering bug | Explicit sandbox time parameter in Unit 9 |
| Deep copy not specified | Full snapshot schema with `structuredClone()` in Unit 1 |
| Module interfaces undefined | New Section 2.4 with complete interface definitions |
| State isolation tests missing | Explicit test code in Unit 1 and Section 5 |
| SOI coordinate frame mismatch | Addressed in Unit 1 and Unit 14 |
| Time authority split | Defined in Section 2.5 |
| updateCelestialPositions() coupling | Signature change in Unit 7 |
| Slider debouncing | Added to Unit 6 |
| Vague acceptance criteria | All criteria now measurable |

---

## 0. File Impact Summary

### Files to EDIT:
1. `src/index.html` - Add Planning Mode modal overlay HTML structure
2. `src/css/main.css` - Add Planning Mode styling (modal, time slider, controls)
3. `src/js/core/gameState.js` - Export time getters, no snapshot logic here
4. `src/js/main.js` - Modify game loop to handle planning mode pause
5. `src/js/ui/controls.js` - Add Planning Mode keyboard shortcut, time slider controls
6. `src/js/ui/uiUpdater.js` - Add planning mode UI update function
7. `src/js/ui/renderer.js` - Add planning mode rendering (reuse existing functions)
8. `src/js/data/celestialBodies.js` - Add optional time parameter to updateCelestialPositions()

### Files to CREATE:
1. `src/js/core/planningMode.js` - Planning mode state machine, snapshot/restore, sandbox logic
2. `src/js/core/planningMode.test.js` - Console test suite for state isolation

### Files to DELETE:
- None

---

## 1. Problem Statement

### 1.1 Description
Players need a way to design transfer orbits and find launch windows without affecting the live game. Currently, adjusting sail settings immediately affects the ship, making it difficult to experiment with "what-if" scenarios or plan future maneuvers.

### 1.2 Root Cause
The game has a single time stream and single state. There's no concept of a "sandbox" where players can:
- Advance time independently to see where planets will be
- Test different sail configurations without committing
- Find optimal launch windows by scrubbing through time

### 1.3 Constraints
- **No build system:** Must use vanilla JS, no compilation
- **Performance:** Planning mode calculations should not affect Flight mode
- **State isolation:** Changes in Planning must not leak to Flight
- **Existing features:** Ghost planets must work correctly with time slider
- **This is a SPIKE:** Focus on core functionality, polish later

---

## 2. Solution Architecture

### 2.1 High-Level Design

```
┌─────────────────────────────────────────────────────────────────────────┐
│  FLIGHT MODE (existing)                                                  │
│  ├─ Game time advances continuously                                      │
│  ├─ Ship physics update each frame                                       │
│  └─ All current features work as-is                                      │
└─────────────────────────────────────────────────────────────────────────┘
                                ↕ [P key toggles]
┌─────────────────────────────────────────────────────────────────────────┐
│  PLANNING MODE (new)                                                     │
│  ├─ Flight time PAUSED (snapshot saved)                                  │
│  ├─ Sandbox time controlled by Time Machine slider                       │
│  ├─ Planets move to sandbox time positions                               │
│  ├─ Ship trajectory predicted from snapshot state                        │
│  ├─ Ghost planets show where bodies are at orbit crossings               │
│  └─ On exit: restore snapshot, Flight resumes                            │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Design Principles

1. **Snapshot Isolation:** Flight state frozen via `structuredClone()`, not references
2. **Deterministic Positions:** Use `getPosition(elements, julianDate)` with sandbox time
3. **Reuse Rendering:** Same canvas, same render functions, different time input
4. **Single Time Authority:** `planningMode.getEffectiveTime()` is the ONLY time source during planning
5. **Clean Exit:** Restore snapshot completely - no state leakage

### 2.3 Key Algorithms

**Time Machine Calculation:**
```javascript
// sandboxTime is offset from snapshot time
sandboxJulianDate = snapshot.julianDate + timeSliderDays;

// In FIXED mode: ship stays at snapshot position
shipElements = snapshot.playerShip.orbitalElements;

// In DRIFT mode: ship follows its orbit (no thrust applied)
// Position calculated from elements at sandboxJulianDate
shipPosition = getPosition(shipElements, sandboxJulianDate);
```

**Ghost Planet Update in Planning Mode (CRITICAL FIX):**
```javascript
// 1. Predict trajectory from snapshot ship state
const trajectory = predictTrajectory({
    orbitalElements: snapshot.playerShip.orbitalElements,
    sail: snapshot.playerShip.sail,
    startTime: sandboxJulianDate,  // Use sandbox time
    duration: trajectoryDuration
});

// 2. Detect intersections - MUST USE SANDBOX TIME
// This is the critical fix from the review
const intersections = detectIntersections(
    trajectory,
    celestialBodies,
    sandboxJulianDate,  // CRITICAL: sandbox time, NOT getJulianDate()
    soiBody
);

// 3. Render ghost planets (same function, correct data)
drawIntersectionMarkers(ctx, intersections, camera, scale);
```

### 2.4 Module Interface Definitions

**Import/Export Graph (No Circular Dependencies):**
```
data/celestialBodies.js ─────────────────────────────────────────┐
        ↓                                                         │
data/ships.js ───────────────────────────────────────────────────┤
        ↓                                                         │
core/gameState.js ───────────────────────────────────────────────┤
        ↓                                                         │
core/planningMode.js ←── imports from above, exports to below ───┤
        ↓                                                         │
lib/trajectory-predictor.js ─────────────────────────────────────┤
lib/intersectionDetector.js ─────────────────────────────────────┤
        ↓                                                         │
ui/renderer.js ──────────────────────────────────────────────────┤
ui/uiUpdater.js ─────────────────────────────────────────────────┤
ui/controls.js ──────────────────────────────────────────────────┤
        ↓                                                         │
main.js ←── imports all, orchestrates game loop ─────────────────┘
```

**planningMode.js Interface:**
```javascript
// ============================================================
// planningMode.js - Complete Interface Definition
// ============================================================

// --- State ---
let active = false;
let snapshot = null;
let sandboxTimeOffset = 0;  // Days from snapshot time
let mode = 'FIXED';  // 'FIXED' | 'DRIFT'

// --- Exported Functions ---

/**
 * Check if planning mode is active
 * @returns {boolean}
 */
export function isActive() {
    return active;
}

/**
 * Get the effective Julian date for all time-dependent calculations.
 * In planning mode: returns sandbox time
 * In flight mode: returns null (caller should use getJulianDate())
 * @returns {number|null}
 */
export function getEffectiveTime() {
    if (!active || !snapshot) return null;
    return snapshot.julianDate + sandboxTimeOffset;
}

/**
 * Get the sandbox time offset in days
 * @returns {number}
 */
export function getSandboxTimeOffset() {
    return sandboxTimeOffset;
}

/**
 * Set the sandbox time offset (from slider)
 * @param {number} days - Offset from snapshot time (0-730)
 */
export function setSandboxTimeOffset(days) {
    sandboxTimeOffset = Math.max(0, Math.min(730, days));
}

/**
 * Get current mode
 * @returns {'FIXED'|'DRIFT'}
 */
export function getMode() {
    return mode;
}

/**
 * Set planning mode (FIXED or DRIFT)
 * @param {'FIXED'|'DRIFT'} newMode
 */
export function setMode(newMode) {
    if (newMode === 'FIXED' || newMode === 'DRIFT') {
        mode = newMode;
    }
}

/**
 * Create deep copy snapshot of current game state
 * Uses structuredClone() for complete isolation
 * @returns {PlanningSnapshot}
 */
export function createSnapshot() {
    // Implementation in Unit 1
}

/**
 * Restore game state from snapshot
 * @param {PlanningSnapshot} snap
 */
export function restoreSnapshot(snap) {
    // Implementation in Unit 1
}

/**
 * Enter planning mode - creates snapshot, sets active
 */
export function enterPlanningMode() {
    snapshot = createSnapshot();
    sandboxTimeOffset = 0;
    mode = 'FIXED';
    active = true;
}

/**
 * Exit planning mode - restores snapshot, clears state
 */
export function exitPlanningMode() {
    if (snapshot) {
        restoreSnapshot(snapshot);
    }
    snapshot = null;
    sandboxTimeOffset = 0;
    active = false;
}

/**
 * Get the snapshot (read-only access for trajectory prediction)
 * @returns {PlanningSnapshot|null}
 */
export function getSnapshot() {
    return snapshot;
}

/**
 * Update planning mode state (called each frame when active)
 * Debounced internally to prevent thrashing
 */
export function updatePlanningFrame() {
    // Implementation in Unit 8
}
```

**celestialBodies.js Interface Change:**
```javascript
// BEFORE (current):
export function updateCelestialPositions() {
    const jd = getJulianDate();
    // ...
}

// AFTER (with optional override):
/**
 * Update all celestial body positions
 * @param {number|null} overrideTime - Julian date to use, or null for live time
 */
export function updateCelestialPositions(overrideTime = null) {
    const jd = overrideTime ?? getJulianDate();
    // ... rest unchanged
}
```

### 2.5 Time Authority Protocol

**Rule:** During planning mode, ALL time-dependent calculations MUST use sandbox time.

| Module | Flight Mode Time Source | Planning Mode Time Source |
|--------|------------------------|---------------------------|
| `celestialBodies.updateCelestialPositions()` | `getJulianDate()` | `planningMode.getEffectiveTime()` |
| `trajectory-predictor.predictTrajectory()` | `getJulianDate()` | `planningMode.getEffectiveTime()` |
| `intersectionDetector.detectIntersections()` | `getJulianDate()` | `planningMode.getEffectiveTime()` |
| `uiUpdater.updateUI()` time display | `getJulianDate()` | `planningMode.getEffectiveTime()` |
| `renderer.js` ghost planet labels | `getJulianDate()` | `planningMode.getEffectiveTime()` |

**Implementation Pattern:**
```javascript
// In main.js game loop:
import { isActive, getEffectiveTime } from './core/planningMode.js';
import { getJulianDate } from './core/gameState.js';

function getTimeForCalculations() {
    return isActive() ? getEffectiveTime() : getJulianDate();
}

// Use getTimeForCalculations() everywhere time is needed
```

---

## 3. Units of Work

### Unit 1: Planning Mode State Foundation (CRITICAL)

**Description:** Create the planning mode module with state machine and snapshot system

**Files:**
- CREATE `src/js/core/planningMode.js`
- CREATE `src/js/core/planningMode.test.js`

**Snapshot Schema (MUST deep clone all):**
```javascript
/**
 * @typedef {Object} PlanningSnapshot
 * @property {number} time - Game time counter
 * @property {number} julianDate - Julian date at snapshot
 * @property {Object} playerShip - Deep clone of player ship
 * @property {Object} playerShip.orbitalElements - {a, e, i, Ω, ω, M0, epoch, μ}
 * @property {Object} playerShip.visualOrbitalElements - For smooth rendering
 * @property {Object} playerShip.sail - {angle, pitchAngle, deploymentPercent, area, reflectivity}
 * @property {Object} playerShip.soiState - {currentBody, isInSOI, entryTime, entryPosition}
 * @property {string} playerShip.soiState.coordinateFrame - 'HELIOCENTRIC' | 'PLANETOCENTRIC'
 * @property {number} playerShip.mass
 * @property {Object} playerShip.position - Cached {x, y, z} in HELIOCENTRIC coordinates
 * @property {Object} camera - {angleX, angleZ, zoom, target, followTarget}
 * @property {Object} displayOptions - All display toggle states
 * @property {Object} trajectoryConfig - {durationDays}
 * @property {Object} autoPilotState - Autopilot settings
 */
```

**Deep Clone Implementation:**
```javascript
export function createSnapshot() {
    const player = getPlayerShip();

    // Ensure we have heliocentric position cached
    const heliocentricPosition = player.soiState?.isInSOI
        ? convertToHeliocentric(player.position, player.soiState.currentBody)
        : { ...player.position };

    return {
        time: getTime(),
        julianDate: getJulianDate(),
        playerShip: {
            // structuredClone handles nested objects
            orbitalElements: structuredClone(player.orbitalElements),
            visualOrbitalElements: structuredClone(player.visualOrbitalElements),
            sail: structuredClone(player.sail),
            soiState: structuredClone(player.soiState),
            mass: player.mass,
            position: heliocentricPosition,
            // Store coordinate frame explicitly
            coordinateFrame: player.soiState?.isInSOI ? 'PLANETOCENTRIC' : 'HELIOCENTRIC'
        },
        camera: structuredClone(getCamera()),
        displayOptions: structuredClone(getDisplayOptions()),
        trajectoryConfig: structuredClone(getTrajectoryConfig()),
        autoPilotState: structuredClone(getAutoPilotState())
    };
}

export function restoreSnapshot(snap) {
    if (!snap) return;

    // Restore time
    setTime(snap.time);
    setJulianDate(snap.julianDate);

    // Restore player ship (deep clone back to prevent reference sharing)
    const player = getPlayerShip();
    player.orbitalElements = structuredClone(snap.playerShip.orbitalElements);
    player.visualOrbitalElements = structuredClone(snap.playerShip.visualOrbitalElements);
    player.sail = structuredClone(snap.playerShip.sail);
    player.soiState = structuredClone(snap.playerShip.soiState);
    player.mass = snap.playerShip.mass;

    // Restore camera
    restoreCamera(structuredClone(snap.camera));

    // Restore display options
    restoreDisplayOptions(structuredClone(snap.displayOptions));

    // Restore trajectory config
    restoreTrajectoryConfig(structuredClone(snap.trajectoryConfig));

    // Restore autopilot
    restoreAutoPilotState(structuredClone(snap.autoPilotState));

    // Clear caches to force recalculation
    clearTrajectoryCache();
    clearIntersectionCache();
}
```

**Acceptance Criteria:**
- [ ] `planningMode.isActive()` returns boolean
- [ ] `createSnapshot()` returns object with all fields defined in schema
- [ ] `restoreSnapshot(snap)` restores all state to snapshot values
- [ ] `getEffectiveTime()` returns `snapshot.julianDate + offset` when active, null when inactive
- [ ] Snapshot uses `structuredClone()` - verify no shared references
- [ ] SOI coordinate frame stored and restored correctly
- [ ] All console tests pass (see test file)

**Test File: `planningMode.test.js`**
```javascript
export function runAllTests() {
    console.log('=== Planning Mode State Tests ===');

    testDeepCopyIsolation();
    testRoundTripIntegrity();
    testNestedObjectIsolation();
    testSOIStatePreservation();
    testTimeCalculation();

    console.log('=== All tests complete ===');
}

function testDeepCopyIsolation() {
    console.log('Test: Deep copy isolation...');
    const snap = createSnapshot();
    const originalA = getPlayerShip().orbitalElements.a;

    // Modify snapshot
    snap.playerShip.orbitalElements.a = 999.999;

    // Original should be unchanged
    const currentA = getPlayerShip().orbitalElements.a;
    console.assert(currentA === originalA,
        `FAIL: Original modified! Expected ${originalA}, got ${currentA}`);
    console.assert(currentA !== 999.999,
        'FAIL: Shallow copy detected - snapshot modification affected original');
    console.log('  PASS: Snapshot modification did not affect original');
}

function testRoundTripIntegrity() {
    console.log('Test: Round-trip integrity...');
    const snap1 = createSnapshot();
    const originalState = JSON.stringify(snap1);

    // Modify game state
    getPlayerShip().orbitalElements.a *= 2;
    getPlayerShip().sail.angle = 45;

    // Restore
    restoreSnapshot(snap1);

    // Create new snapshot and compare
    const snap2 = createSnapshot();
    const restoredState = JSON.stringify(snap2);

    // Compare key values (JSON comparison has limitations but catches most issues)
    console.assert(snap2.playerShip.orbitalElements.a === snap1.playerShip.orbitalElements.a,
        'FAIL: Orbital elements not restored correctly');
    console.assert(snap2.playerShip.sail.angle === snap1.playerShip.sail.angle,
        'FAIL: Sail settings not restored correctly');
    console.log('  PASS: State restored correctly after modification');
}

function testNestedObjectIsolation() {
    console.log('Test: Nested object isolation...');
    const snap = createSnapshot();

    // Modify deeply nested property
    if (snap.playerShip.soiState) {
        snap.playerShip.soiState.currentBody = 'MODIFIED';
    }

    // Original should be unchanged
    const currentSOI = getPlayerShip().soiState?.currentBody;
    console.assert(currentSOI !== 'MODIFIED',
        'FAIL: Nested SOI state was modified through snapshot');
    console.log('  PASS: Nested objects are properly isolated');
}

function testSOIStatePreservation() {
    console.log('Test: SOI state preservation...');
    const snap = createSnapshot();

    // Verify SOI fields captured
    console.assert('soiState' in snap.playerShip, 'FAIL: soiState not in snapshot');
    console.assert('coordinateFrame' in snap.playerShip, 'FAIL: coordinateFrame not stored');
    console.log('  PASS: SOI state fields present in snapshot');
}

function testTimeCalculation() {
    console.log('Test: Time calculation...');
    enterPlanningMode();

    const baseTime = getSnapshot().julianDate;
    setSandboxTimeOffset(100);
    const effectiveTime = getEffectiveTime();

    console.assert(Math.abs(effectiveTime - (baseTime + 100)) < 0.0001,
        `FAIL: Effective time calculation wrong. Expected ${baseTime + 100}, got ${effectiveTime}`);

    exitPlanningMode();
    console.assert(getEffectiveTime() === null, 'FAIL: getEffectiveTime should be null when inactive');
    console.log('  PASS: Time calculations correct');
}
```

---

### Unit 2: Planning Mode HTML Structure

**Description:** Add modal overlay HTML for Planning Mode

**Files:** EDIT `src/index.html`

**Acceptance Criteria:**
- [ ] Modal container with id `planningModal` exists
- [ ] Header contains text "PLANNING MODE // MISSION COMPUTER"
- [ ] Close button with id `closePlanningMode` exists
- [ ] Canvas container with id `planningCanvasContainer` exists
- [ ] Time slider with id `timeSlider` has `min="0"` `max="730"` `value="0"`
- [ ] Time offset display with id `timeOffsetDisplay` exists
- [ ] Date display with id `sandboxDateDisplay` exists
- [ ] Mode buttons: `fixedModeBtn` and `driftModeBtn` exist
- [ ] Coordinate display with id `sandboxCoords` exists
- [ ] Truncation warning with id `trajectoryWarning` exists (hidden by default)
- [ ] Modal has `style="display: none"` by default

---

### Unit 3: Planning Mode CSS Styling

**Description:** Style the Planning Mode modal

**Files:** EDIT `src/css/main.css`

**Acceptance Criteria:**
- [ ] `.planning-modal` covers viewport with `rgba(0,0,0,0.8)` backdrop
- [ ] `.planning-content` max-width 95vw, max-height 95vh
- [ ] Time slider styled with accent color (`#00ff88`)
- [ ] Mode buttons have `.active` state styling
- [ ] Warning message styled with yellow/orange color
- [ ] Close button positioned absolute top-right
- [ ] All hover states defined

---

### Unit 4: Game Loop Integration

**Description:** Modify game loop to pause during Planning Mode

**Files:** EDIT `src/js/main.js`

**Implementation:**
```javascript
import { isActive, updatePlanningFrame, getEffectiveTime } from './core/planningMode.js';

function gameLoop() {
    frameCount++;

    if (frameCount % CLEANUP_INTERVAL === 0) {
        performMemoryCleanup();
    }

    if (isActive()) {
        // Planning mode: use sandbox time, skip live updates
        updatePlanningFrame();
    } else {
        // Flight mode: normal updates
        updatePositions();
    }

    updateCameraTarget(celestialBodies, ships);
    render();
    updateUI();
    requestAnimationFrame(gameLoop);
}
```

**Acceptance Criteria:**
- [ ] When `isActive() === true`, `updatePositions()` is NOT called
- [ ] When `isActive() === true`, `updatePlanningFrame()` IS called
- [ ] When `isActive() === false`, normal game loop executes
- [ ] `render()` and `updateUI()` always called regardless of mode
- [ ] No console errors when toggling modes rapidly (5+ times in 1 second)

**Regression Test:**
```javascript
// Verify Flight mode still works
function testFlightModeRegression() {
    exitPlanningMode();  // Ensure flight mode
    const time1 = getJulianDate();
    // Simulate 10 frames
    for (let i = 0; i < 10; i++) {
        gameLoop();  // Would need to mock requestAnimationFrame
    }
    const time2 = getJulianDate();
    console.assert(time2 > time1, 'FAIL: Time should advance in flight mode');
}
```

---

### Unit 5: Keyboard Shortcut Toggle

**Description:** Add `P` key to toggle Planning Mode

**Files:** EDIT `src/js/ui/controls.js`

**Acceptance Criteria:**
- [ ] `P` key calls `enterPlanningMode()` when not active
- [ ] `P` key calls `exitPlanningMode()` when active
- [ ] `Escape` key calls `exitPlanningMode()` when active
- [ ] `Escape` key does nothing when not active
- [ ] Modal visibility toggles with planning state
- [ ] Double-press P (within 100ms) does not cause errors

---

### Unit 6: Time Machine Slider

**Description:** Implement time slider functionality with debouncing

**Files:**
- EDIT `src/js/ui/controls.js` (event handlers)
- EDIT `src/js/core/planningMode.js` (time state)

**Debounce Implementation:**
```javascript
let sliderDebounceTimer = null;
const SLIDER_DEBOUNCE_MS = 100;

function onTimeSliderChange(event) {
    const days = parseInt(event.target.value, 10);

    // Update display immediately for responsiveness
    updateTimeDisplay(days);

    // Debounce the expensive calculations
    if (sliderDebounceTimer) {
        clearTimeout(sliderDebounceTimer);
    }

    sliderDebounceTimer = setTimeout(() => {
        setSandboxTimeOffset(days);
        // Trigger trajectory/intersection recalculation
        invalidatePlanningCaches();
    }, SLIDER_DEBOUNCE_MS);
}
```

**Acceptance Criteria:**
- [ ] Slider range: 0 to 730 (verified via DOM inspection)
- [ ] Moving slider updates `sandboxTimeOffset` (after 100ms debounce)
- [ ] Time offset display shows "+X days" format (updates immediately)
- [ ] Date display shows "YYYY Mon DD" format (updates immediately)
- [ ] Arrow buttons adjust by ±1 day (left/right) and ±7 days (with shift)
- [ ] Rapid slider movement (drag) does not cause >3 trajectory calculations per second
- [ ] Slider value of 0 shows "+0 days" (not empty)
- [ ] Slider value of 730 shows "+730 days" (2 years)

---

### Unit 7: Celestial Body Position Update

**Description:** Update celestial positions based on sandbox time

**Files:**
- EDIT `src/js/data/celestialBodies.js`
- EDIT `src/js/core/planningMode.js`

**Signature Change:**
```javascript
// celestialBodies.js
import { getJulianDate } from '../core/gameState.js';

/**
 * Update all celestial body positions for a given time
 * @param {number|null} overrideTime - Julian date, or null to use live game time
 */
export function updateCelestialPositions(overrideTime = null) {
    const jd = overrideTime ?? getJulianDate();

    for (const body of Object.values(celestialBodies)) {
        if (body.elements) {
            const pos = getPosition(body.elements, jd);
            body.position = pos;

            // Handle moons - transform to heliocentric
            if (body.parent && celestialBodies[body.parent]) {
                const parentPos = celestialBodies[body.parent].position;
                body.heliocentricPosition = {
                    x: parentPos.x + pos.x,
                    y: parentPos.y + pos.y,
                    z: parentPos.z + pos.z
                };
            } else {
                body.heliocentricPosition = pos;
            }
        }
    }
}
```

**Acceptance Criteria:**
- [ ] `updateCelestialPositions()` with no argument uses `getJulianDate()` (backwards compatible)
- [ ] `updateCelestialPositions(jd)` uses provided Julian date
- [ ] Moon `heliocentricPosition` property is set correctly (parent position + relative)
- [ ] In planning mode, planets move when slider changes (verify visually)
- [ ] Position change from 0 to 365 days moves Earth ~1 full orbit (visual check)
- [ ] Moon position relative to Earth is correct at all time offsets

**Test:**
```javascript
function testCelestialPositionOverride() {
    const jd1 = 2451545.0;  // J2000
    const jd2 = 2451545.0 + 365.25;  // One year later

    updateCelestialPositions(jd1);
    const earthPos1 = celestialBodies.EARTH.position;

    updateCelestialPositions(jd2);
    const earthPos2 = celestialBodies.EARTH.position;

    // Earth should have moved significantly (nearly full orbit)
    const distance = Math.sqrt(
        (earthPos2.x - earthPos1.x) ** 2 +
        (earthPos2.y - earthPos1.y) ** 2
    );
    console.assert(distance > 0.1, 'FAIL: Earth should move significantly in 1 year');
}
```

---

### Unit 8: Trajectory Prediction in Planning

**Description:** Generate predicted trajectory from sandbox state

**Files:** EDIT `src/js/core/planningMode.js`

**Implementation:**
```javascript
import { predictTrajectory, clearTrajectoryCache, getTrajectoryHash } from '../lib/trajectory-predictor.js';

let cachedPlanningTrajectory = null;
let cachedPlanningTrajectoryHash = null;

export function updatePlanningFrame() {
    if (!active || !snapshot) return;

    const sandboxTime = getEffectiveTime();

    // Update celestial positions at sandbox time
    updateCelestialPositions(sandboxTime);

    // Get ship elements based on mode
    const shipElements = mode === 'DRIFT'
        ? propagateElements(snapshot.playerShip.orbitalElements, sandboxTime)
        : snapshot.playerShip.orbitalElements;

    // Generate trajectory hash for cache validation
    const trajectoryHash = getTrajectoryHash(
        shipElements,
        snapshot.playerShip.sail,
        sandboxTime,
        getTrajectoryConfig().durationDays
    );

    // Only recalculate if hash changed
    if (trajectoryHash !== cachedPlanningTrajectoryHash) {
        cachedPlanningTrajectory = predictTrajectory({
            orbitalElements: shipElements,
            sail: snapshot.playerShip.sail,
            mass: snapshot.playerShip.mass,
            soiState: snapshot.playerShip.soiState,
            startTime: sandboxTime,
            duration: getTrajectoryConfig().durationDays
        });
        cachedPlanningTrajectoryHash = trajectoryHash;

        // Check for truncation and update warning
        updateTrajectoryWarning(cachedPlanningTrajectory);

        // Update intersection cache (Unit 9)
        updatePlanningIntersections(cachedPlanningTrajectory, sandboxTime);
    }
}

function updateTrajectoryWarning(trajectory) {
    const warningEl = document.getElementById('trajectoryWarning');
    if (!warningEl) return;

    const lastPoint = trajectory[trajectory.length - 1];
    if (lastPoint?.truncated) {
        warningEl.textContent = `Trajectory truncated: ${lastPoint.truncated}`;
        warningEl.style.display = 'block';
    } else {
        warningEl.style.display = 'none';
    }
}
```

**Acceptance Criteria:**
- [ ] Trajectory uses `snapshot.playerShip.orbitalElements` (not live ship)
- [ ] Trajectory `startTime` equals `getEffectiveTime()` (sandbox time)
- [ ] Trajectory hash includes sandbox time (verify via logging)
- [ ] Changing slider to different value regenerates trajectory (hash changes)
- [ ] Changing mode (FIXED→DRIFT) regenerates trajectory
- [ ] Truncation warning displays when trajectory is incomplete
- [ ] Truncation warning hidden when trajectory is complete

---

### Unit 9: Ghost Planet Integration (CRITICAL)

**Description:** Make ghost planets work correctly with sandbox time

**Files:**
- EDIT `src/js/core/planningMode.js`
- VERIFY `src/js/lib/intersectionDetector.js` (no changes needed if time param used correctly)

**Critical Implementation (THE FIX):**
```javascript
import { detectIntersections } from '../lib/intersectionDetector.js';
import { celestialBodies } from '../data/celestialBodies.js';

let planningIntersectionCache = null;

/**
 * Update intersection markers for planning mode
 * CRITICAL: Must use sandbox time, not live time
 */
function updatePlanningIntersections(trajectory, sandboxTime) {
    if (!trajectory || trajectory.length === 0) {
        planningIntersectionCache = [];
        return;
    }

    const player = getSnapshot()?.playerShip;
    const soiBody = player?.soiState?.isInSOI ? player.soiState.currentBody : null;

    // CRITICAL FIX: Pass sandboxTime, NOT getJulianDate()
    // This ensures ghost planets show positions relative to sandbox time,
    // not filtered out as "past" events
    planningIntersectionCache = detectIntersections(
        trajectory,
        celestialBodies,
        sandboxTime,  // ← THE CRITICAL PARAMETER
        soiBody
    );
}

/**
 * Get intersection cache for rendering
 * Used by renderer.js to draw ghost planets
 */
export function getPlanningIntersectionCache() {
    return planningIntersectionCache;
}
```

**main.js Integration:**
```javascript
// In the intersection detection section of updatePositions() and render():
function getIntersectionsForRendering() {
    if (isActive()) {
        return getPlanningIntersectionCache();
    } else {
        return getIntersectionCache();  // Live game cache
    }
}
```

**Acceptance Criteria:**
- [ ] `detectIntersections()` receives `sandboxTime` parameter (verify via console.log)
- [ ] At sandbox offset 0, ghost planets match Flight mode positions exactly
- [ ] At sandbox offset +100 days, ghost planet time labels show relative offsets (e.g., "+45d" from sandbox time, not from live time)
- [ ] Moving time slider updates ghost planet positions within 200ms
- [ ] Ghost planets for destination body are visible (filter works)
- [ ] "CLOSE" indicator appears when trajectory passes near planet at crossing time
- [ ] Ghost position accuracy: within 0.01 AU of calculated position
- [ ] Moon ghost planets appear at correct heliocentric positions

**Verification Test:**
```javascript
function testGhostPlanetTimeFiltering() {
    // This test verifies the critical bug fix
    enterPlanningMode();
    setSandboxTimeOffset(100);  // 100 days in future

    // Force update
    updatePlanningFrame();

    const intersections = getPlanningIntersectionCache();

    // Should NOT be empty - the bug would cause all points to be filtered
    console.assert(intersections.length > 0,
        'CRITICAL FAIL: No ghost planets detected - time filtering bug!');

    // Verify time labels are relative to sandbox time
    if (intersections.length > 0) {
        const firstIntersection = intersections[0];
        const offsetFromSandbox = firstIntersection.time - getEffectiveTime();
        console.assert(offsetFromSandbox >= 0,
            'FAIL: Intersection time should be in future relative to sandbox');
    }

    exitPlanningMode();
}
```

---

### Unit 10: Mode Toggle (Fixed Ship / Drift)

**Description:** Implement Fixed Ship and Drift modes

**Files:** EDIT `src/js/core/planningMode.js`

**Acceptance Criteria:**
- [ ] FIXED mode: `getShipPosition()` returns `snapshot.playerShip.position` unchanged
- [ ] DRIFT mode: `getShipPosition()` returns `getPosition(elements, sandboxTime)`
- [ ] Clicking FIXED button sets mode to 'FIXED' and adds `.active` class
- [ ] Clicking DRIFT button sets mode to 'DRIFT' and adds `.active` class
- [ ] Mode change triggers trajectory regeneration within next frame (<17ms)
- [ ] Default mode on enter is FIXED
- [ ] Mode persists during slider movement

---

### Unit 11: Coordinate Readout

**Description:** Display ship coordinates in Planning Mode

**Files:**
- EDIT `src/js/ui/uiUpdater.js`
- HTML element already added in Unit 2

**Acceptance Criteria:**
- [ ] Coordinates display format: "X: 1.234 Y: 0.567 Z: 0.012 AU"
- [ ] Precision: exactly 3 decimal places
- [ ] In FIXED mode: coordinates show snapshot position (constant)
- [ ] In DRIFT mode: coordinates update when slider moves
- [ ] Coordinates are HELIOCENTRIC (even if ship is in SOI)

---

### Unit 12: UI State Synchronization

**Description:** Ensure all UI elements sync with planning state

**Files:** EDIT `src/js/ui/uiUpdater.js`

**Acceptance Criteria:**
- [ ] Bottom bar time display shows sandbox date when in planning mode
- [ ] Sail settings in SAIL tab show snapshot values (read-only appearance)
- [ ] No flickering when slider moves (debounced updates)
- [ ] UI updates complete within 50ms of slider stop
- [ ] Trajectory duration config reflects current setting

---

### Unit 13: Exit and Restore

**Description:** Clean exit from Planning Mode

**Files:** EDIT `src/js/core/planningMode.js`

**Acceptance Criteria:**
- [ ] Close button click calls `exitPlanningMode()`
- [ ] Escape key calls `exitPlanningMode()`
- [ ] On exit: `time` equals snapshot time (within 0.001)
- [ ] On exit: `julianDate` equals snapshot Julian date (within 0.0001)
- [ ] On exit: player ship orbital elements match snapshot exactly
- [ ] On exit: camera state restored
- [ ] On exit: no console errors
- [ ] On exit: trajectory cache cleared
- [ ] On exit: intersection cache cleared
- [ ] Flight mode resumes normal time progression after exit

**Test:**
```javascript
function testCleanExit() {
    const beforeSnap = createSnapshot();

    enterPlanningMode();
    setSandboxTimeOffset(200);
    // Simulate some planning activity
    updatePlanningFrame();
    exitPlanningMode();

    const afterSnap = createSnapshot();

    // Compare key values
    console.assert(
        Math.abs(afterSnap.julianDate - beforeSnap.julianDate) < 0.0001,
        'FAIL: Julian date not restored'
    );
    console.assert(
        afterSnap.playerShip.orbitalElements.a === beforeSnap.playerShip.orbitalElements.a,
        'FAIL: Orbital elements not restored'
    );
    console.assert(
        afterSnap.playerShip.sail.angle === beforeSnap.playerShip.sail.angle,
        'FAIL: Sail settings not restored'
    );
}
```

---

### Unit 14: Edge Cases and Polish

**Description:** Handle edge cases identified in review

**Files:** Multiple (as needed)

**SOI Handling:**
```javascript
// When ship is in SOI, snapshot stores:
// 1. Planetocentric orbital elements
// 2. coordinateFrame = 'PLANETOCENTRIC'
// 3. Heliocentric position (pre-calculated)

// On restore, ensure:
// 1. Elements restored correctly
// 2. Position recalculated in correct frame
// 3. SOI state preserved
```

**Hyperbolic Orbit Handling:**
```javascript
// In intersectionDetector.js or planningMode.js
function isValidForIntersectionDetection(trajectory) {
    const lastPoint = trajectory[trajectory.length - 1];
    if (lastPoint?.truncated === 'ECCENTRIC_INSTABILITY') {
        // Trajectory went hyperbolic - ghost planets unreliable
        console.warn('Hyperbolic trajectory - ghost planets may be incomplete');
        return false;
    }
    return true;
}
```

**Acceptance Criteria:**
- [ ] Ship in Earth SOI: planning opens without error, position correct
- [ ] Ship in Earth SOI: drift mode shows correct orbit around Earth
- [ ] Ship in Earth SOI: restore returns ship to correct SOI position
- [ ] 730-day trajectory: renders without timeout (may show fewer points)
- [ ] 730-day trajectory: ghost planets detected (at least for inner planets)
- [ ] Hyperbolic trajectory: warning displayed, partial ghosts shown
- [ ] Modal click on backdrop does NOT close (only X button or Escape)
- [ ] Performance: 60 FPS maintained during slider drag
- [ ] Memory: no memory leak after 100 enter/exit cycles

---

## 4. Risk Assessment (Updated)

| Risk | Likelihood | Impact | Mitigation | Status |
|------|------------|--------|------------|--------|
| Ghost planet time filtering | ~~High~~ | ~~High~~ | Explicit sandbox time in Unit 9 | **MITIGATED** |
| State leakage | ~~Medium~~ | ~~High~~ | structuredClone + tests in Unit 1 | **MITIGATED** |
| SOI coordinate mismatch | ~~Medium~~ | ~~High~~ | Explicit frame tracking in snapshot | **MITIGATED** |
| Performance with long time | Medium | Medium | Debounce + adaptive resolution | Partially mitigated |
| Module interface confusion | ~~Medium~~ | ~~Medium~~ | Complete interface in Section 2.4 | **MITIGATED** |
| Hyperbolic orbit handling | Medium | Low | Warning + partial results | Documented |
| UI complexity | Low | Medium | Start minimal, add incrementally | Acceptable |

---

## 5. Testing Strategy (Updated)

### 5.1 Console Tests (Automated)

Run in browser console:
```javascript
import('/js/core/planningMode.test.js').then(m => m.runAllTests())
```

Tests included:
1. `testDeepCopyIsolation()` - Snapshot modifications don't affect original
2. `testRoundTripIntegrity()` - Snapshot → modify → restore → verify
3. `testNestedObjectIsolation()` - Deep nested objects isolated
4. `testSOIStatePreservation()` - SOI fields captured
5. `testTimeCalculation()` - Sandbox time arithmetic correct
6. `testGhostPlanetTimeFiltering()` - Critical bug fix verified
7. `testCleanExit()` - State fully restored on exit

### 5.2 Integration Tests (Manual)

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Enter/Exit Cycle | Press P, wait 2s, press P | Game state identical before/after |
| Time Slider | Move slider to +365 days | Earth moves ~1 orbit, ghosts update |
| Ghost Planets | Open planning, check ghosts at t=0 | Match Flight mode ghosts exactly |
| Mode Toggle | Switch FIXED→DRIFT→FIXED | Ship position changes appropriately |
| SOI Test | Orbit Earth, open planning | Ship stays in Earth SOI, position correct |
| Long Duration | Set slider to 730 days | Trajectory renders, some ghosts visible |

### 5.3 Regression Tests

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Flight Time | Exit planning, wait 10s at 1x speed | Time advances normally |
| Trajectory Cache | Exit planning, check trajectory | Uses live time, not sandbox |
| Ghost Planets Live | Exit planning, check ghosts | Relative to live time |
| Autopilot | Exit planning, enable autopilot | Sail adjusts normally |

---

## 6. Implementation Order

```
1. Unit 1 (State Foundation) ─────────┐
2. Unit 2 (HTML) ─────────────────────┤
3. Unit 3 (CSS) ──────────────────────┼─► Foundation Phase
4. Unit 5 (Keyboard Toggle) ──────────┤
5. Unit 4 (Game Loop) ────────────────┘

6. Unit 7 (Celestial Update) ─────────┐
7. Unit 6 (Time Slider) ──────────────┼─► Core Feature Phase
8. Unit 8 (Trajectory) ───────────────┤
9. Unit 9 (Ghost Planets) ────────────┘  ◄── CRITICAL

10. Unit 10 (Mode Toggle) ────────────┐
11. Unit 11 (Coordinates) ────────────┼─► Enhancement Phase
12. Unit 12 (UI Sync) ────────────────┤
13. Unit 13 (Exit/Restore) ───────────┘

14. Unit 14 (Edge Cases) ─────────────── Polish Phase
```

---

## 7. Open Decisions

### Resolved:
- **Modal vs Tab:** Modal chosen
- **Time Range:** 0-730 days
- **Default Mode:** FIXED
- **Deep Clone Method:** `structuredClone()`
- **Time Authority:** `planningMode.getEffectiveTime()` is sole source during planning
- **Debounce:** 100ms for slider
- **Ghost Planet Time:** Sandbox time passed explicitly

### Deferred (out of scope for spike):
- Position Mode (manual ship placement)
- Sail adjustment in planning mode
- Multiple mission plans / saving
- Adaptive trajectory resolution for long durations
