# Planning Mode Implementation Plan v4 (FINAL)

**Date:** 2026-01-29
**Version:** 4.0 (Final - Airtight)
**Status:** Ready for Implementation

---

## Revision Summary v3 → v4

| Issue from v3 Review | Resolution in v4 |
|---------------------|------------------|
| Core state machine functions missing | Section 2.6 now includes ALL functions |
| celestialBodies update timing unclear | Explicit in updatePlanningFrame() |
| clearTrajectoryCache/clearIntersectionCache undefined | Added import references |
| propagateElements() unit assumptions | Clarified: uses same units as orbital.js |

---

## 0. File Impact Summary

(Same as v3)

---

## 2. Solution Architecture

### 2.6 Complete Function Definitions (FINAL)

**ALL functions referenced in the plan are defined here.**

```javascript
// ============================================================
// planningMode.js - COMPLETE MODULE IMPLEMENTATION
// ============================================================

import { getPosition } from '../lib/orbital.js';
import { getTime, setTime, getJulianDate, setJulianDate,
         getDisplayOptions, restoreDisplayOptions,
         getTrajectoryConfig, restoreTrajectoryConfig,
         getAutoPilotState, restoreAutoPilotState,
         clearIntersectionCache } from './gameState.js';
import { getPlayerShip } from '../data/ships.js';
import { getCamera, restoreCamera } from './camera.js';
import { celestialBodies, updateCelestialPositions } from '../data/celestialBodies.js';
import { predictTrajectory, clearTrajectoryCache, getTrajectoryHash } from '../lib/trajectory-predictor.js';
import { detectIntersections } from '../lib/intersectionDetector.js';

// --- Module State ---
let active = false;
let snapshot = null;
let sandboxTimeOffset = 0;  // Days from snapshot time
let mode = 'FIXED';  // 'FIXED' | 'DRIFT'

// --- Caches ---
let cachedPlanningTrajectory = null;
let cachedPlanningTrajectoryHash = null;
let planningIntersectionCache = null;
let trajectoryValidationStatus = null;

// ============================================================
// CORE STATE MACHINE FUNCTIONS
// ============================================================

/**
 * Check if planning mode is currently active
 * @returns {boolean}
 */
export function isActive() {
    return active;
}

/**
 * Get the effective Julian date for all time-dependent calculations.
 * In planning mode: returns sandbox time (snapshot + offset)
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
 * Clamps to valid range [0, 730]
 * @param {number} days - Offset from snapshot time
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
        invalidatePlanningCaches();
    }
}

/**
 * Get the current snapshot (read-only access)
 * @returns {PlanningSnapshot|null}
 */
export function getSnapshot() {
    return snapshot;
}

/**
 * Enter planning mode
 * - Creates snapshot of current game state
 * - Resets sandbox time to 0
 * - Sets mode to FIXED
 * - Sets active flag
 */
export function enterPlanningMode() {
    if (active) return;  // Already in planning mode

    snapshot = createSnapshot();
    sandboxTimeOffset = 0;
    mode = 'FIXED';
    active = true;
    invalidatePlanningCaches();

    // Show modal
    const modal = document.getElementById('planningModal');
    if (modal) modal.style.display = 'flex';
}

/**
 * Exit planning mode
 * - Restores game state from snapshot
 * - Clears snapshot and caches
 * - Resets active flag
 */
export function exitPlanningMode() {
    if (!active) return;  // Not in planning mode

    if (snapshot) {
        restoreSnapshot(snapshot);
    }

    snapshot = null;
    sandboxTimeOffset = 0;
    active = false;
    invalidatePlanningCaches();

    // Hide modal
    const modal = document.getElementById('planningModal');
    if (modal) modal.style.display = 'none';
}

// ============================================================
// SNAPSHOT FUNCTIONS
// ============================================================

/**
 * Create deep copy snapshot of current game state
 * Uses structuredClone() for complete isolation
 * @returns {PlanningSnapshot}
 */
export function createSnapshot() {
    const player = getPlayerShip();
    const playerPos = player.position || getPosition(player.orbitalElements, getJulianDate());

    // Always compute heliocentric position for consistent storage
    const isInSOI = player.soiState?.isInSOI;
    const heliocentricPosition = isInSOI
        ? convertToHeliocentric(playerPos, player.soiState.currentBody)
        : { x: playerPos.x, y: playerPos.y, z: playerPos.z };

    return {
        time: getTime(),
        julianDate: getJulianDate(),
        playerShip: {
            orbitalElements: structuredClone(player.orbitalElements),
            visualOrbitalElements: structuredClone(player.visualOrbitalElements),
            sail: structuredClone(player.sail),
            soiState: structuredClone(player.soiState),
            mass: player.mass,
            coordinateFrame: isInSOI ? 'PLANETOCENTRIC' : 'HELIOCENTRIC',
            heliocentricPosition: heliocentricPosition
        },
        camera: structuredClone(getCamera()),
        displayOptions: structuredClone(getDisplayOptions()),
        trajectoryConfig: structuredClone(getTrajectoryConfig()),
        autoPilotState: structuredClone(getAutoPilotState())
    };
}

/**
 * Restore game state from snapshot
 * Uses property-by-property assignment via helper functions to avoid reference sharing
 * @param {PlanningSnapshot} snap
 */
export function restoreSnapshot(snap) {
    if (!snap) return;

    // Restore time
    setTime(snap.time);
    setJulianDate(snap.julianDate);

    // Restore player ship
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

    // Clear all caches - these are imported from their respective modules
    clearTrajectoryCache();      // From trajectory-predictor.js
    clearIntersectionCache();    // From gameState.js
}

// ============================================================
// FRAME UPDATE FUNCTIONS
// ============================================================

/**
 * Update planning mode state - called each frame when active
 * Orchestrates celestial updates, trajectory prediction, and intersection detection
 */
export function updatePlanningFrame() {
    if (!active || !snapshot) return;

    const sandboxTime = getEffectiveTime();

    // CRITICAL: Update celestial positions at sandbox time FIRST
    // This ensures planets are at correct positions for all subsequent calculations
    updateCelestialPositions(sandboxTime);

    // Get ship elements based on mode
    const shipElements = mode === 'DRIFT'
        ? propagateElements(snapshot.playerShip.orbitalElements, sandboxTime)
        : snapshot.playerShip.orbitalElements;

    // Generate trajectory hash for cache validation
    const hash = getTrajectoryHash();

    // Only recalculate if hash changed
    if (hash !== cachedPlanningTrajectoryHash) {
        cachedPlanningTrajectory = predictTrajectory({
            orbitalElements: shipElements,
            sail: snapshot.playerShip.sail,
            mass: snapshot.playerShip.mass,
            soiState: snapshot.playerShip.soiState,
            startTime: sandboxTime,
            duration: getTrajectoryConfig().durationDays
        });
        cachedPlanningTrajectoryHash = hash;

        // Check for truncation
        updateTrajectoryWarning(cachedPlanningTrajectory);

        // Update intersections with trajectory
        updatePlanningIntersections(cachedPlanningTrajectory, sandboxTime);
    }
}

/**
 * Get cached planning trajectory for rendering
 * @returns {Array|null}
 */
export function getPlanningTrajectory() {
    return cachedPlanningTrajectory;
}

// ============================================================
// INTERSECTION DETECTION
// ============================================================

/**
 * Update intersection markers for planning mode
 * CRITICAL: Must use sandbox time, not live time
 */
function updatePlanningIntersections(trajectory, sandboxTime) {
    trajectoryValidationStatus = validateTrajectoryForIntersections(trajectory);

    if (!trajectoryValidationStatus.valid) {
        planningIntersectionCache = [];
        return;
    }

    const player = snapshot?.playerShip;
    const soiBody = player?.soiState?.isInSOI ? player.soiState.currentBody : null;

    // CRITICAL: Pass sandboxTime, NOT getJulianDate()
    planningIntersectionCache = detectIntersections(
        trajectory,
        celestialBodies,
        sandboxTime,  // ← THE CRITICAL PARAMETER
        soiBody
    );

    // Mark intersections if trajectory was truncated
    if (trajectoryValidationStatus.reason) {
        planningIntersectionCache = planningIntersectionCache.map(i => ({
            ...i,
            reliability: trajectoryValidationStatus.reason === 'HYPERBOLIC_PARTIAL' ? 'PARTIAL' : 'FULL'
        }));
    }
}

/**
 * Get intersection cache for rendering
 * @returns {Array}
 */
export function getPlanningIntersectionCache() {
    return planningIntersectionCache || [];
}

/**
 * Get trajectory validation status for UI warning
 * @returns {{valid: boolean, reason: string|null}}
 */
export function getTrajectoryValidationStatus() {
    return trajectoryValidationStatus;
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Invalidate all planning-related caches
 */
function invalidatePlanningCaches() {
    cachedPlanningTrajectory = null;
    cachedPlanningTrajectoryHash = null;
    planningIntersectionCache = null;
    trajectoryValidationStatus = null;
}

/**
 * Get ship position based on current mode
 * Always returns HELIOCENTRIC coordinates
 * @returns {{x: number, y: number, z: number}|null}
 */
export function getShipPosition() {
    if (!active || !snapshot) return null;

    if (mode === 'FIXED') {
        return snapshot.playerShip.heliocentricPosition;
    } else {
        const sandboxTime = getEffectiveTime();
        const position = getPosition(snapshot.playerShip.orbitalElements, sandboxTime);

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
 * @param {string} parentBodyName - Name of parent body
 * @returns {Object} Heliocentric position
 */
function convertToHeliocentric(position, parentBodyName) {
    const parentBody = celestialBodies[parentBodyName];
    if (!parentBody?.position) {
        console.warn(`Cannot convert: parent ${parentBodyName} not found`);
        return position;
    }
    return {
        x: parentBody.position.x + position.x,
        y: parentBody.position.y + position.y,
        z: parentBody.position.z + position.z
    };
}

/**
 * Propagate orbital elements to a new time using Kepler's equation
 * Pure Keplerian propagation - NO thrust applied
 * NOTE: Uses same unit conventions as orbital.js (μ in km³/s², a in km)
 * @param {Object} elements - Orbital elements
 * @param {number} julianDate - Target Julian date
 * @returns {Object} Elements with updated M0 and epoch
 */
function propagateElements(elements, julianDate) {
    // Get position at new time - this is more reliable than manual propagation
    // because getPosition() already handles all unit conversions correctly
    const newPos = getPosition(elements, julianDate);

    // For DRIFT mode, we just need the new mean anomaly
    // Calculate time delta in days
    const dt = julianDate - elements.epoch;

    // Mean motion: n = sqrt(μ/a³)
    // orbital.js uses consistent units internally
    const a3 = Math.pow(elements.a, 3);
    const n = Math.sqrt(elements.μ / a3);

    // Convert to radians per day (n is in rad/s, multiply by 86400)
    const nPerDay = n * 86400;

    // New mean anomaly
    let M0_new = elements.M0 + nPerDay * dt;
    // Normalize to [0, 2π]
    M0_new = M0_new % (2 * Math.PI);
    if (M0_new < 0) M0_new += 2 * Math.PI;

    return {
        ...elements,
        M0: M0_new,
        epoch: julianDate
    };
}

/**
 * Validate trajectory for intersection detection
 * @param {Array} trajectory
 * @returns {{valid: boolean, reason: string|null}}
 */
function validateTrajectoryForIntersections(trajectory) {
    if (!trajectory || trajectory.length === 0) {
        return { valid: false, reason: 'EMPTY_TRAJECTORY' };
    }

    const lastPoint = trajectory[trajectory.length - 1];
    if (lastPoint?.truncated === 'ECCENTRIC_INSTABILITY') {
        return { valid: true, reason: 'HYPERBOLIC_PARTIAL' };
    }
    if (lastPoint?.truncated) {
        return { valid: true, reason: lastPoint.truncated };
    }

    return { valid: true, reason: null };
}

/**
 * Update trajectory warning display
 * @param {Array} trajectory
 */
function updateTrajectoryWarning(trajectory) {
    const warningEl = document.getElementById('trajectoryWarning');
    if (!warningEl) return;

    const lastPoint = trajectory[trajectory.length - 1];
    if (lastPoint?.truncated) {
        warningEl.textContent = `Warning: ${lastPoint.truncated}`;
        warningEl.style.display = 'block';
    } else {
        warningEl.style.display = 'none';
    }
}

/**
 * Update time display in UI (called immediately on slider change)
 * @param {number} days - Offset in days
 */
export function updateTimeDisplay(days) {
    const offsetEl = document.getElementById('timeOffsetDisplay');
    const dateEl = document.getElementById('sandboxDateDisplay');

    if (offsetEl) {
        offsetEl.textContent = `+${days} days`;
    }

    if (dateEl && snapshot) {
        const sandboxJD = snapshot.julianDate + days;
        dateEl.textContent = julianToDateString(sandboxJD);
    }
}

/**
 * Convert Julian date to human-readable string
 * @param {number} jd - Julian date
 * @returns {string} Format: "YYYY Mon DD"
 */
function julianToDateString(jd) {
    // Julian date to calendar date conversion
    const z = Math.floor(jd + 0.5);
    const f = (jd + 0.5) - z;
    let a = z;
    if (z >= 2299161) {
        const alpha = Math.floor((z - 1867216.25) / 36524.25);
        a = z + 1 + alpha - Math.floor(alpha / 4);
    }
    const b = a + 1524;
    const c = Math.floor((b - 122.1) / 365.25);
    const d = Math.floor(365.25 * c);
    const e = Math.floor((b - d) / 30.6001);

    const day = b - d - Math.floor(30.6001 * e);
    const month = e < 14 ? e - 1 : e - 13;
    const year = month > 2 ? c - 4716 : c - 4715;

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    return `${year} ${months[month - 1]} ${day}`;
}
```

### 2.7 External Function References

These functions are imported from existing modules (must exist):

| Function | Module | Notes |
|----------|--------|-------|
| `getPosition()` | orbital.js | Already exists |
| `predictTrajectory()` | trajectory-predictor.js | Already exists |
| `getTrajectoryHash()` | trajectory-predictor.js | Already exists |
| `clearTrajectoryCache()` | trajectory-predictor.js | Already exists |
| `detectIntersections()` | intersectionDetector.js | Already exists |
| `getTime()`, `setTime()` | gameState.js | getTime exists, add setTime |
| `getJulianDate()`, `setJulianDate()` | gameState.js | getJulianDate exists, add setJulianDate |
| `getDisplayOptions()`, `restoreDisplayOptions()` | gameState.js | Add both |
| `getTrajectoryConfig()`, `restoreTrajectoryConfig()` | gameState.js | Add both |
| `getAutoPilotState()`, `restoreAutoPilotState()` | gameState.js | Add both |
| `clearIntersectionCache()` | gameState.js | Already exists |
| `getCamera()`, `restoreCamera()` | camera.js | getCamera exists, add restoreCamera |
| `getPlayerShip()` | ships.js | Already exists |
| `celestialBodies`, `updateCelestialPositions()` | celestialBodies.js | Already exists |

---

## 3. Units of Work

(Same as v3, with Section 2.6 now complete)

---

## 4. Risk Assessment (FINAL)

| Risk | Status |
|------|--------|
| Ghost planet time filtering | **CLOSED** |
| State leakage | **CLOSED** |
| SOI coordinate mismatch | **CLOSED** |
| Performance (debounce) | **CLOSED** (333ms) |
| Module interface confusion | **CLOSED** (all functions defined) |
| Moon position order | **CLOSED** (parent-first sort) |
| Hyperbolic orbit handling | **CLOSED** (validation + marking) |
| Missing function definitions | **CLOSED** (Section 2.6 complete) |

---

## 5. Testing Strategy

(Same as v3)

---

## 6. Implementation Order

```
1. Add setters to gameState.js (setTime, setJulianDate, restore*)
2. Add restoreCamera() to camera.js
3. Create planningMode.js with Section 2.6 code
4. Create planningMode.test.js
5. Run tests: import('/js/core/planningMode.test.js').then(m => m.runAllTests())
6. Proceed with Units 2-14 from v3
```

---

## 7. Verification Checklist

Before implementation is complete, verify:

- [ ] All 9 console tests pass
- [ ] Ghost planets visible at sandbox offset > 0
- [ ] State identical before/after planning session
- [ ] Debounce limits calculations to ≤3/sec
- [ ] Moon ghost planets at correct heliocentric positions
- [ ] SOI ship position correct in both modes
- [ ] Truncation warning displays for partial trajectories
- [ ] Flight mode unaffected after planning exit
