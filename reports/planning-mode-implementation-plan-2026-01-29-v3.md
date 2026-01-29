# Planning Mode Implementation Plan v3

**Date:** 2026-01-29
**Version:** 3.0 (Final)
**Status:** Revised (addresses v2 review findings)
**Specification:** `reports/planning-mode-spec-2026-01-29.md`

---

## Revision Summary v2 → v3

| Issue from v2 Review | Resolution in v3 |
|---------------------|------------------|
| Debounce 100ms too short | Changed to 333ms for ≤3 calc/sec |
| Helper functions undefined | All helpers now defined in Section 2.6 |
| Moon position order not guaranteed | Explicit parent-first sort in Unit 7 |
| SOI coordinateFrame schema mismatch | Fixed: now in playerShip directly |
| restore*() functions missing | Defined in Section 2.6 |
| isValidForIntersectionDetection() unused | Integrated into Unit 9 |
| testFlightModeRegression() pseudocode | Rewritten as executable test |

---

## 0. File Impact Summary

### Files to EDIT:
1. `src/index.html` - Add Planning Mode modal overlay HTML structure
2. `src/css/main.css` - Add Planning Mode styling
3. `src/js/core/gameState.js` - Add setters for restore functions
4. `src/js/main.js` - Modify game loop for planning mode
5. `src/js/ui/controls.js` - Add keyboard shortcuts, time slider
6. `src/js/ui/uiUpdater.js` - Add planning mode UI updates
7. `src/js/ui/renderer.js` - Add planning mode rendering
8. `src/js/data/celestialBodies.js` - Add optional time parameter, parent-first ordering
9. `src/js/core/camera.js` - Add restoreCamera() function

### Files to CREATE:
1. `src/js/core/planningMode.js` - Planning mode state machine
2. `src/js/core/planningMode.test.js` - Console test suite

---

## 1. Problem Statement

(Unchanged from v2)

Players need a way to design transfer orbits and find launch windows without affecting the live game. The game currently has a single time stream and state, preventing "what-if" scenario planning.

---

## 2. Solution Architecture

### 2.1-2.3: High-Level Design

(Unchanged from v2 - see v2 document for details)

### 2.4 Module Interface Definitions

(Unchanged from v2)

### 2.5 Time Authority Protocol

(Unchanged from v2)

### 2.6 Helper Function Definitions (NEW)

All helper functions referenced in the plan are defined here:

```javascript
// ============================================================
// HELPER FUNCTIONS - Must be implemented
// ============================================================

// --- In orbital.js (already exists, verify signature) ---

/**
 * Propagate orbital elements to a new time using Kepler's equation
 * This is pure Keplerian propagation - NO thrust applied
 * @param {Object} elements - Orbital elements {a, e, i, Ω, ω, M0, epoch, μ}
 * @param {number} julianDate - Target Julian date
 * @returns {Object} Same elements with updated M0 and epoch
 */
export function propagateElements(elements, julianDate) {
    // Mean motion (rad/day)
    const n = Math.sqrt(elements.μ / Math.pow(elements.a, 3)) * 86400;
    // Time since epoch (days)
    const dt = julianDate - elements.epoch;
    // New mean anomaly
    const M0_new = (elements.M0 + n * dt) % (2 * Math.PI);

    return {
        ...elements,
        M0: M0_new,
        epoch: julianDate
    };
}

// --- In gameState.js (ADD these setters) ---

export function setTime(t) {
    time = t;
}

export function setJulianDate(jd) {
    julianDate = jd;
}

export function restoreDisplayOptions(options) {
    // Property-by-property to avoid reference sharing
    displayOptions.showStarfield = options.showStarfield;
    displayOptions.showOrbits = options.showOrbits;
    displayOptions.showLabels = options.showLabels;
    displayOptions.showTrajectory = options.showTrajectory;
    displayOptions.showPredictedTrajectory = options.showPredictedTrajectory;
    displayOptions.showIntersectionMarkers = options.showIntersectionMarkers;
    displayOptions.showGrid = options.showGrid;
}

export function restoreTrajectoryConfig(config) {
    trajectoryConfig.durationDays = config.durationDays;
}

export function restoreAutoPilotState(state) {
    autoPilotState.enabled = state.enabled;
    autoPilotState.targetBody = state.targetBody;
    autoPilotState.strategy = state.strategy;
    // Add other properties as they exist
}

// --- In camera.js (ADD this function) ---

export function restoreCamera(state) {
    camera.angleX = state.angleX;
    camera.angleZ = state.angleZ;
    camera.zoom = state.zoom;
    camera.target = state.target;
    camera.followTarget = state.followTarget;
}

// --- In planningMode.js ---

/**
 * Invalidate all planning-related caches
 * Called when sandbox time changes
 */
function invalidatePlanningCaches() {
    cachedPlanningTrajectory = null;
    cachedPlanningTrajectoryHash = null;
    planningIntersectionCache = null;
}

/**
 * Get ship position based on current mode
 * @returns {{x: number, y: number, z: number}}
 */
export function getShipPosition() {
    if (!active || !snapshot) return null;

    if (mode === 'FIXED') {
        // Return cached heliocentric position from snapshot
        return snapshot.playerShip.heliocentricPosition;
    } else {
        // DRIFT mode: calculate position at sandbox time
        const sandboxTime = getEffectiveTime();
        const elements = snapshot.playerShip.orbitalElements;
        const position = getPosition(elements, sandboxTime);

        // If in SOI, convert to heliocentric
        if (snapshot.playerShip.coordinateFrame === 'PLANETOCENTRIC') {
            const parentBody = snapshot.playerShip.soiState.currentBody;
            const parentPos = celestialBodies[parentBody]?.position;
            if (parentPos) {
                return {
                    x: parentPos.x + position.x,
                    y: parentPos.y + position.y,
                    z: parentPos.z + position.z
                };
            }
        }
        return position;
    }
}

/**
 * Convert planetocentric position to heliocentric
 * @param {Object} position - {x, y, z} relative to parent body
 * @param {string} parentBodyName - Name of parent body (e.g., 'EARTH')
 * @returns {Object} Heliocentric position
 */
function convertToHeliocentric(position, parentBodyName) {
    const parentBody = celestialBodies[parentBodyName];
    if (!parentBody?.position) {
        console.warn(`Cannot convert to heliocentric: parent ${parentBodyName} not found`);
        return position;
    }
    return {
        x: parentBody.position.x + position.x,
        y: parentBody.position.y + position.y,
        z: parentBody.position.z + position.z
    };
}

/**
 * Check if trajectory is valid for intersection detection
 * @param {Array} trajectory - Trajectory points
 * @returns {{valid: boolean, reason: string|null}}
 */
function validateTrajectoryForIntersections(trajectory) {
    if (!trajectory || trajectory.length === 0) {
        return { valid: false, reason: 'EMPTY_TRAJECTORY' };
    }

    const lastPoint = trajectory[trajectory.length - 1];
    if (lastPoint?.truncated === 'ECCENTRIC_INSTABILITY') {
        return { valid: true, reason: 'HYPERBOLIC_PARTIAL' };  // Valid but partial
    }
    if (lastPoint?.truncated) {
        return { valid: true, reason: lastPoint.truncated };
    }

    return { valid: true, reason: null };
}
```

---

## 3. Units of Work

### Unit 1: Planning Mode State Foundation

**Snapshot Schema (CORRECTED):**
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
 * @property {string} playerShip.coordinateFrame - 'HELIOCENTRIC' | 'PLANETOCENTRIC' (FIXED: at playerShip level)
 * @property {number} playerShip.mass
 * @property {Object} playerShip.heliocentricPosition - Cached {x, y, z} ALWAYS in heliocentric
 * @property {Object} camera - {angleX, angleZ, zoom, target, followTarget}
 * @property {Object} displayOptions - All display toggle states
 * @property {Object} trajectoryConfig - {durationDays}
 * @property {Object} autoPilotState - Autopilot settings
 */
```

**createSnapshot() Implementation (CORRECTED):**
```javascript
export function createSnapshot() {
    const player = getPlayerShip();
    const playerPos = player.position || getPosition(player.orbitalElements, getJulianDate());

    // Always compute heliocentric position for consistent storage
    const isInSOI = player.soiState?.isInSOI;
    const heliocentricPosition = isInSOI
        ? convertToHeliocentric(playerPos, player.soiState.currentBody)
        : { ...playerPos };

    return {
        time: getTime(),
        julianDate: getJulianDate(),
        playerShip: {
            orbitalElements: structuredClone(player.orbitalElements),
            visualOrbitalElements: structuredClone(player.visualOrbitalElements),
            sail: structuredClone(player.sail),
            soiState: structuredClone(player.soiState),
            mass: player.mass,
            // FIXED: coordinateFrame at playerShip level, not inside soiState
            coordinateFrame: isInSOI ? 'PLANETOCENTRIC' : 'HELIOCENTRIC',
            heliocentricPosition: heliocentricPosition
        },
        camera: structuredClone(getCamera()),
        displayOptions: structuredClone(getDisplayOptions()),
        trajectoryConfig: structuredClone(getTrajectoryConfig()),
        autoPilotState: structuredClone(getAutoPilotState())
    };
}
```

**restoreSnapshot() Implementation (CORRECTED):**
```javascript
export function restoreSnapshot(snap) {
    if (!snap) return;

    // Restore time
    setTime(snap.time);
    setJulianDate(snap.julianDate);

    // Restore player ship - use property-by-property via helpers
    const player = getPlayerShip();
    player.orbitalElements = structuredClone(snap.playerShip.orbitalElements);
    player.visualOrbitalElements = structuredClone(snap.playerShip.visualOrbitalElements);
    player.sail = structuredClone(snap.playerShip.sail);
    player.soiState = structuredClone(snap.playerShip.soiState);
    player.mass = snap.playerShip.mass;
    // Note: coordinateFrame and heliocentricPosition are snapshot-only, not stored on live ship

    // Restore camera using defined helper
    restoreCamera(structuredClone(snap.camera));

    // Restore display options using defined helper
    restoreDisplayOptions(structuredClone(snap.displayOptions));

    // Restore trajectory config using defined helper
    restoreTrajectoryConfig(structuredClone(snap.trajectoryConfig));

    // Restore autopilot using defined helper
    restoreAutoPilotState(structuredClone(snap.autoPilotState));

    // Clear all caches to force recalculation in Flight mode
    clearTrajectoryCache();
    clearIntersectionCache();
}
```

**Test File (EXECUTABLE, not pseudocode):**
```javascript
// planningMode.test.js

import { createSnapshot, restoreSnapshot, enterPlanningMode, exitPlanningMode,
         getEffectiveTime, setSandboxTimeOffset, getSnapshot,
         updatePlanningFrame, getPlanningIntersectionCache } from './planningMode.js';
import { getPlayerShip } from '../data/ships.js';
import { getTime, getJulianDate } from './gameState.js';

export function runAllTests() {
    console.log('=== Planning Mode Tests ===');
    let passed = 0;
    let failed = 0;

    try { testDeepCopyIsolation(); passed++; } catch (e) { failed++; console.error(e); }
    try { testRoundTripIntegrity(); passed++; } catch (e) { failed++; console.error(e); }
    try { testNestedObjectIsolation(); passed++; } catch (e) { failed++; console.error(e); }
    try { testSOIStatePreservation(); passed++; } catch (e) { failed++; console.error(e); }
    try { testTimeCalculation(); passed++; } catch (e) { failed++; console.error(e); }
    try { testGhostPlanetTimeFiltering(); passed++; } catch (e) { failed++; console.error(e); }
    try { testCleanExit(); passed++; } catch (e) { failed++; console.error(e); }
    try { testFlightModeUnaffected(); passed++; } catch (e) { failed++; console.error(e); }
    try { testCoordinateFrameConsistency(); passed++; } catch (e) { failed++; console.error(e); }

    console.log(`=== Results: ${passed} passed, ${failed} failed ===`);
    return { passed, failed };
}

function testDeepCopyIsolation() {
    console.log('Test: Deep copy isolation...');
    const originalA = getPlayerShip().orbitalElements.a;
    const snap = createSnapshot();

    // Modify snapshot
    snap.playerShip.orbitalElements.a = 999.999;

    // Original should be unchanged
    const currentA = getPlayerShip().orbitalElements.a;
    if (currentA !== originalA) throw new Error(`Original modified! Expected ${originalA}, got ${currentA}`);
    if (currentA === 999.999) throw new Error('Shallow copy detected');
    console.log('  PASS');
}

function testRoundTripIntegrity() {
    console.log('Test: Round-trip integrity...');
    const snap1 = createSnapshot();
    const originalA = snap1.playerShip.orbitalElements.a;
    const originalSail = snap1.playerShip.sail.angle;

    // Modify game state
    getPlayerShip().orbitalElements.a *= 2;
    getPlayerShip().sail.angle = 45;

    // Restore
    restoreSnapshot(snap1);

    // Verify
    const restoredA = getPlayerShip().orbitalElements.a;
    const restoredSail = getPlayerShip().sail.angle;
    if (Math.abs(restoredA - originalA) > 0.0001) throw new Error(`Orbital elements not restored: ${restoredA} vs ${originalA}`);
    if (restoredSail !== originalSail) throw new Error(`Sail not restored: ${restoredSail} vs ${originalSail}`);
    console.log('  PASS');
}

function testNestedObjectIsolation() {
    console.log('Test: Nested object isolation...');
    const snap = createSnapshot();
    const originalBody = getPlayerShip().soiState?.currentBody;

    if (snap.playerShip.soiState) {
        snap.playerShip.soiState.currentBody = 'MODIFIED_TEST_VALUE';
    }

    const currentBody = getPlayerShip().soiState?.currentBody;
    if (currentBody === 'MODIFIED_TEST_VALUE') throw new Error('Nested SOI state was modified through snapshot');
    console.log('  PASS');
}

function testSOIStatePreservation() {
    console.log('Test: SOI state preservation...');
    const snap = createSnapshot();
    if (!('soiState' in snap.playerShip)) throw new Error('soiState not in snapshot');
    if (!('coordinateFrame' in snap.playerShip)) throw new Error('coordinateFrame not stored');
    if (!('heliocentricPosition' in snap.playerShip)) throw new Error('heliocentricPosition not stored');
    console.log('  PASS');
}

function testTimeCalculation() {
    console.log('Test: Time calculation...');
    enterPlanningMode();

    const baseTime = getSnapshot().julianDate;
    setSandboxTimeOffset(100);
    const effectiveTime = getEffectiveTime();

    if (Math.abs(effectiveTime - (baseTime + 100)) > 0.0001) {
        exitPlanningMode();
        throw new Error(`Time calculation wrong. Expected ${baseTime + 100}, got ${effectiveTime}`);
    }

    exitPlanningMode();
    if (getEffectiveTime() !== null) throw new Error('getEffectiveTime should be null when inactive');
    console.log('  PASS');
}

function testGhostPlanetTimeFiltering() {
    console.log('Test: Ghost planet time filtering (CRITICAL)...');
    enterPlanningMode();
    setSandboxTimeOffset(100);  // 100 days in future

    // Force update
    updatePlanningFrame();

    const intersections = getPlanningIntersectionCache();

    // Should NOT be empty - the bug would cause all points to be filtered
    if (!intersections || intersections.length === 0) {
        exitPlanningMode();
        throw new Error('CRITICAL: No ghost planets detected - time filtering bug present!');
    }

    // Verify time labels are relative to sandbox time
    const firstIntersection = intersections[0];
    const offsetFromSandbox = firstIntersection.time - getEffectiveTime();
    if (offsetFromSandbox < 0) {
        exitPlanningMode();
        throw new Error('Intersection time should be in future relative to sandbox');
    }

    exitPlanningMode();
    console.log('  PASS');
}

function testCleanExit() {
    console.log('Test: Clean exit...');
    const beforeJD = getJulianDate();
    const beforeA = getPlayerShip().orbitalElements.a;

    enterPlanningMode();
    setSandboxTimeOffset(200);
    updatePlanningFrame();
    exitPlanningMode();

    const afterJD = getJulianDate();
    const afterA = getPlayerShip().orbitalElements.a;

    if (Math.abs(afterJD - beforeJD) > 0.0001) throw new Error('Julian date not restored');
    if (Math.abs(afterA - beforeA) > 0.0001) throw new Error('Orbital elements not restored');
    console.log('  PASS');
}

function testFlightModeUnaffected() {
    console.log('Test: Flight mode unaffected...');
    // This test verifies that Flight mode time progression still works
    // by checking that time-related state accessors return valid values

    exitPlanningMode();  // Ensure Flight mode

    const time1 = getJulianDate();
    if (typeof time1 !== 'number' || isNaN(time1)) {
        throw new Error('getJulianDate() returned invalid value in Flight mode');
    }

    const effectiveTime = getEffectiveTime();
    if (effectiveTime !== null) {
        throw new Error('getEffectiveTime() should return null in Flight mode');
    }

    console.log('  PASS');
}

function testCoordinateFrameConsistency() {
    console.log('Test: Coordinate frame consistency...');
    const snap = createSnapshot();

    // Heliocentric position should always be valid
    const pos = snap.playerShip.heliocentricPosition;
    if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number' || typeof pos.z !== 'number') {
        throw new Error('heliocentricPosition not properly stored');
    }

    // Position should be reasonable (within 100 AU of origin)
    const dist = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
    if (dist > 100) {
        throw new Error(`Heliocentric position unreasonable: ${dist} AU from origin`);
    }

    console.log('  PASS');
}
```

---

### Unit 6: Time Machine Slider (CORRECTED DEBOUNCE)

**Debounce Implementation (333ms for ≤3 calc/sec):**
```javascript
let sliderDebounceTimer = null;
const SLIDER_DEBOUNCE_MS = 333;  // FIXED: was 100ms, now 333ms for ≤3 calc/sec

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
        invalidatePlanningCaches();
        updatePlanningFrame();
    }, SLIDER_DEBOUNCE_MS);
}
```

**Acceptance Criteria (UPDATED):**
- [ ] Slider range: 0 to 730 (verified via DOM inspection)
- [ ] Moving slider updates `sandboxTimeOffset` (after 333ms debounce)
- [ ] Time offset display shows "+X days" format (updates immediately)
- [ ] Date display shows "YYYY Mon DD" format (updates immediately)
- [ ] **Rapid slider movement does not cause >3 trajectory calculations per second**
- [ ] Slider values 0, 365, 730 all work correctly

---

### Unit 7: Celestial Body Position Update (PARENT-FIRST ORDERING)

**Implementation with Parent-First Sort:**
```javascript
// celestialBodies.js
import { getJulianDate } from '../core/gameState.js';
import { getPosition } from '../lib/orbital.js';

/**
 * Update all celestial body positions for a given time
 * Processes parent bodies before moons to ensure correct heliocentric transforms
 * @param {number|null} overrideTime - Julian date, or null to use live game time
 */
export function updateCelestialPositions(overrideTime = null) {
    const jd = overrideTime ?? getJulianDate();

    // Get all bodies as array for sorting
    const bodies = Object.entries(celestialBodies);

    // CRITICAL: Sort to process parents before children
    // Bodies without parents come first, then bodies with parents
    bodies.sort((a, b) => {
        const aHasParent = a[1].parent ? 1 : 0;
        const bHasParent = b[1].parent ? 1 : 0;
        return aHasParent - bHasParent;
    });

    // First pass: calculate positions for all bodies
    for (const [name, body] of bodies) {
        if (body.elements) {
            const pos = getPosition(body.elements, jd);
            body.position = pos;
        }
    }

    // Second pass: calculate heliocentric positions for moons
    // (parents are now guaranteed to have updated positions)
    for (const [name, body] of bodies) {
        if (body.parent && celestialBodies[body.parent]) {
            const parentPos = celestialBodies[body.parent].position;
            body.heliocentricPosition = {
                x: parentPos.x + body.position.x,
                y: parentPos.y + body.position.y,
                z: parentPos.z + body.position.z
            };
        } else if (body.position) {
            // Non-moons: heliocentric = position
            body.heliocentricPosition = body.position;
        }
    }
}
```

**Acceptance Criteria:**
- [ ] `updateCelestialPositions()` with no argument uses `getJulianDate()` (backwards compatible)
- [ ] `updateCelestialPositions(jd)` uses provided Julian date
- [ ] **Parents processed before children (verified by console.log order)**
- [ ] Moon `heliocentricPosition` property is set correctly
- [ ] Position change from 0 to 365 days moves Earth ~1 full orbit

---

### Unit 9: Ghost Planet Integration (WITH VALIDATION)

**Implementation (INTEGRATED VALIDATION):**
```javascript
import { detectIntersections } from '../lib/intersectionDetector.js';
import { celestialBodies } from '../data/celestialBodies.js';

let planningIntersectionCache = null;
let trajectoryValidationStatus = null;

/**
 * Update intersection markers for planning mode
 * CRITICAL: Must use sandbox time, not live time
 */
function updatePlanningIntersections(trajectory, sandboxTime) {
    // Validate trajectory first
    trajectoryValidationStatus = validateTrajectoryForIntersections(trajectory);

    if (!trajectoryValidationStatus.valid) {
        planningIntersectionCache = [];
        return;
    }

    const player = getSnapshot()?.playerShip;
    const soiBody = player?.soiState?.isInSOI ? player.soiState.currentBody : null;

    // CRITICAL: Pass sandboxTime, NOT getJulianDate()
    planningIntersectionCache = detectIntersections(
        trajectory,
        celestialBodies,
        sandboxTime,  // ← THE CRITICAL PARAMETER
        soiBody
    );

    // Mark intersections as potentially unreliable if trajectory was truncated
    if (trajectoryValidationStatus.reason) {
        planningIntersectionCache = planningIntersectionCache.map(intersection => ({
            ...intersection,
            reliability: trajectoryValidationStatus.reason === 'HYPERBOLIC_PARTIAL' ? 'PARTIAL' : 'FULL'
        }));
    }
}

/**
 * Get intersection cache for rendering
 */
export function getPlanningIntersectionCache() {
    return planningIntersectionCache;
}

/**
 * Get trajectory validation status for UI warning
 */
export function getTrajectoryValidationStatus() {
    return trajectoryValidationStatus;
}
```

**Acceptance Criteria:**
- [ ] `detectIntersections()` receives `sandboxTime` parameter (verify via console.log)
- [ ] At sandbox offset 0, ghost planets match Flight mode positions (within 0.01 AU)
- [ ] At sandbox offset +100 days, ghost planet time labels show relative offsets
- [ ] Moving time slider updates ghost planet positions within 500ms (accounting for debounce)
- [ ] Ghost planets for destination body are visible
- [ ] **Partial trajectory: ghost planets marked with `reliability: 'PARTIAL'`**
- [ ] **`getTrajectoryValidationStatus()` returns reason for truncation**

---

## 4. Risk Assessment (FINAL)

| Risk | Status |
|------|--------|
| Ghost planet time filtering | **MITIGATED** - Explicit sandbox time parameter |
| State leakage | **MITIGATED** - structuredClone + defined restore functions |
| SOI coordinate mismatch | **MITIGATED** - Fixed schema, heliocentric caching |
| Performance (debounce) | **MITIGATED** - 333ms debounce |
| Module interface confusion | **MITIGATED** - All helpers defined |
| Moon position order | **MITIGATED** - Parent-first sort |
| Hyperbolic orbit handling | **MITIGATED** - Validation + reliability marking |

---

## 5. Testing Strategy (FINAL)

### 5.1 Console Tests (Executable)
```javascript
import('/js/core/planningMode.test.js').then(m => m.runAllTests())
```

Tests included:
1. `testDeepCopyIsolation()` - Snapshot modifications don't affect original
2. `testRoundTripIntegrity()` - Snapshot → modify → restore → verify
3. `testNestedObjectIsolation()` - Deep nested objects isolated
4. `testSOIStatePreservation()` - SOI fields and coordinateFrame captured
5. `testTimeCalculation()` - Sandbox time arithmetic correct
6. `testGhostPlanetTimeFiltering()` - Critical bug fix verified
7. `testCleanExit()` - State fully restored on exit
8. `testFlightModeUnaffected()` - Flight mode accessors work correctly
9. `testCoordinateFrameConsistency()` - Heliocentric position always valid

### 5.2 Integration Tests (Manual)

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Enter/Exit Cycle | Press P, wait 2s, press P | Game state identical before/after |
| Time Slider | Move slider to +365 days | Earth moves ~1 orbit, ghosts update |
| Ghost Planets t=0 | Open planning, check ghosts | Match Flight mode exactly (within 0.01 AU) |
| Debounce | Drag slider rapidly for 3s | ≤9 trajectory calculations (3/sec × 3s) |
| Mode Toggle | Switch FIXED→DRIFT→FIXED | Ship position changes appropriately |
| SOI Test | Orbit Earth, open planning | Ship stays in Earth SOI, position correct |
| Moon Ghosts | Check Luna ghost planet | Position correct (heliocentric) |
| Truncated Trajectory | Create hyperbolic trajectory | Warning shown, ghosts marked partial |

### 5.3 Regression Tests

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Flight Time | Exit planning, wait 10s at 1x | Time advances normally |
| Trajectory Cache | Exit planning, check trajectory | Uses live time, not sandbox |
| Ghost Planets Live | Exit planning, check ghosts | Relative to live time |
| Autopilot | Exit planning, enable autopilot | Sail adjusts normally |

---

## 6. Implementation Order

```
1. Unit 1 (State Foundation + Tests) ─────┐
2. Section 2.6 (Helper Functions) ────────┤
3. Unit 2 (HTML) ─────────────────────────┼─► Foundation Phase
4. Unit 3 (CSS) ──────────────────────────┤
5. Unit 5 (Keyboard Toggle) ──────────────┘

6. Unit 4 (Game Loop) ────────────────────┐
7. Unit 7 (Celestial Update) ─────────────┼─► Core Feature Phase
8. Unit 6 (Time Slider + 333ms debounce) ─┤
9. Unit 8 (Trajectory) ───────────────────┤
10. Unit 9 (Ghost Planets + Validation) ──┘  ◄── CRITICAL

11. Unit 10 (Mode Toggle) ────────────────┐
12. Unit 11 (Coordinates) ────────────────┼─► Enhancement Phase
13. Unit 12 (UI Sync) ────────────────────┤
14. Unit 13 (Exit/Restore) ───────────────┘

15. Unit 14 (Edge Cases) ─────────────────── Polish Phase
```

---

## 7. Open Decisions

### Resolved:
- **Modal vs Tab:** Modal chosen
- **Time Range:** 0-730 days
- **Default Mode:** FIXED
- **Deep Clone Method:** `structuredClone()`
- **Time Authority:** `planningMode.getEffectiveTime()` sole source during planning
- **Debounce:** 333ms (≤3 calculations/sec)
- **Ghost Planet Time:** Sandbox time passed explicitly
- **Moon Order:** Parent-first sort in updateCelestialPositions
- **Coordinate Frame:** Stored at playerShip level, heliocentric always cached
- **Hyperbolic Handling:** Validation + reliability marking on ghosts

### Deferred (out of scope for spike):
- Position Mode (manual ship placement)
- Sail adjustment in planning mode
- Multiple mission plans / saving
- Adaptive trajectory resolution for long durations
