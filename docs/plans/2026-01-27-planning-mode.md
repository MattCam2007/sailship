# Planning Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Planning Mode that freezes simulation time and synchronizes ship/planet/trajectory visualization to a single planning date, enabling launch window exploration without affecting live gameplay.

**Architecture:** Planning Mode is a pause-like state where time travel becomes the primary date controller. When enabled, it freezes simulation (`timeScale = 0`), calculates ship position at ephemeris date using orbital propagation, and synchronizes all visualizations (ship, planets, trajectory) to that date. This creates a "frozen snapshot" view where the user can adjust the launch date to find optimal transfer windows. The system preserves existing time travel functionality while adding mode-aware behavior to ship rendering and trajectory prediction.

**Tech Stack:** Vanilla JavaScript (ES6 modules), HTML5, astronomy-engine library, existing orbital mechanics (orbital.js)

**Key Design Decisions:**
1. **Non-destructive**: Planning mode doesn't modify simulation state, only freezes it
2. **Simple first**: Phase 1 implements "ship stays at orbital position, time slides" (easier route finding)
3. **Future extensible**: Architecture supports Phase 2 realistic planning (save/load scenarios)
4. **Visual clarity**: Strong UI distinction between Planning and Live modes

---

## Phase 1: Core Planning Mode (Simple Launch Window Finder)

### Task 1: Add Planning Mode State to gameState.js

**Goal:** Add planning mode flag and control functions to game state management.

**Files:**
- Modify: `/Users/mattcameron/Projects/sailship/src/js/core/gameState.js` (lines 389-500 - near timeTravelState)

**Step 1: Add planning mode state object**

After `timeTravelState` declaration (around line 410), add:

```javascript
/**
 * Planning mode state
 *
 * When enabled:
 * - Simulation is frozen (timeScale forced to 0)
 * - Ship position calculated at ephemeris date (not simulation date)
 * - Trajectory predicts from ephemeris date
 * - All visualizations synchronized to ephemeris date
 *
 * This enables "launch window planning" - user adjusts time travel
 * slider to find optimal transfer opportunities without affecting
 * live simulation state.
 */
export const planningModeState = {
    enabled: false,                    // Planning mode active
    frozenSpeed: null,                 // Saved speed when entering planning mode
    frozenJulianDate: null,            // Saved simulation date when entering planning
};
```

**Step 2: Add planning mode control functions**

After time travel functions (around line 500), add:

```javascript
/**
 * Enable or disable planning mode
 * @param {boolean} enabled - Whether to enable planning mode
 */
export function setPlanningMode(enabled) {
    if (enabled === planningModeState.enabled) return; // No change

    planningModeState.enabled = enabled;

    if (enabled) {
        // Entering planning mode

        // Save current speed and freeze simulation
        planningModeState.frozenSpeed = currentSpeed;
        planningModeState.frozenJulianDate = julianDate;

        // Force time scale to 0 (pause simulation)
        timeScale = 0;

        // Enable time travel if not already enabled
        if (!timeTravelState.enabled) {
            setTimeTravelEnabled(true);
            // Set reference date to current simulation date
            const currentDate = julianToDate(julianDate);
            setReferenceDate(currentDate);
            setTimeOffset(0); // Start at "now"
        }

        console.log('[PLANNING] Entered planning mode - simulation frozen at JD', julianDate.toFixed(2));
    } else {
        // Exiting planning mode

        // Restore previous speed (or pause if was paused)
        if (planningModeState.frozenSpeed && planningModeState.frozenSpeed !== 'pause') {
            setSpeed(planningModeState.frozenSpeed);
        } else {
            setSpeed('pause');
        }

        console.log('[PLANNING] Exited planning mode - simulation resumed at speed', currentSpeed);

        // Clear frozen state
        planningModeState.frozenSpeed = null;
        planningModeState.frozenJulianDate = null;
    }
}

/**
 * Check if planning mode is active
 * @returns {boolean} True if in planning mode
 */
export function isPlanningMode() {
    return planningModeState.enabled;
}

/**
 * Get the "active date" for calculations
 * - In planning mode: returns ephemeris date
 * - In live mode: returns simulation date
 * @returns {number} Julian date
 */
export function getActiveJulianDate() {
    return planningModeState.enabled ? getEphemerisJulianDate() : julianDate;
}
```

**Step 3: Prevent time advancement in planning mode**

Modify `advanceTime()` function (around line 175) to check planning mode:

Find this function:
```javascript
export function advanceTime() {
    const dt = timeScale;
    time += dt;
    julianDate += dt;
}
```

Replace with:
```javascript
export function advanceTime() {
    // Don't advance time in planning mode
    if (planningModeState.enabled) {
        return;
    }

    const dt = timeScale;
    time += dt;
    julianDate += dt;
}
```

**Step 4: Prevent speed changes in planning mode**

Modify `setSpeed()` function (around line 191) to block changes:

Find:
```javascript
export function setSpeed(speedName) {
    if (!SPEED_PRESETS[speedName]) {
        console.warn(`Unknown speed preset: ${speedName}`);
        return;
    }

    currentSpeed = speedName;
    timeScale = SPEED_PRESETS[speedName];
}
```

Replace with:
```javascript
export function setSpeed(speedName) {
    if (!SPEED_PRESETS[speedName]) {
        console.warn(`Unknown speed preset: ${speedName}`);
        return;
    }

    // Prevent speed changes in planning mode (time is frozen)
    if (planningModeState.enabled) {
        console.warn('[PLANNING] Cannot change speed in planning mode');
        return;
    }

    currentSpeed = speedName;
    timeScale = SPEED_PRESETS[speedName];
}
```

**Step 5: Verify no test failures**

```bash
cd /Users/mattcameron/Projects/sailship/src && python3 -m http.server 8080
```

Then in browser console:
```javascript
import('/js/core/gameState.test.js').then(m => m?.runAllTests?.() || console.log('No tests found'))
```

Expected: No errors (gameState.js likely has no tests yet - that's fine)

**Step 6: Commit**

```bash
git add src/js/core/gameState.js
git commit -m "feat(planning): add planning mode state and controls

- Add planningModeState with enabled flag
- Add setPlanningMode() to freeze simulation and enable time travel
- Add isPlanningMode() and getActiveJulianDate() helpers
- Prevent time advancement and speed changes in planning mode
- Planning mode auto-enables time travel and freezes at current date"
```

---

### Task 2: Update Ship Physics to Use Planning Date

**Goal:** Make ship position calculation respect planning mode by using ephemeris date instead of simulation date.

**Files:**
- Modify: `/Users/mattcameron/Projects/sailship/src/js/core/shipPhysics.js` (lines 235-270)

**Step 1: Import planning mode functions**

At top of file (around line 8-15 with other imports), find:

```javascript
import { getJulianDate } from './gameState.js';
```

Replace with:

```javascript
import { getJulianDate, isPlanningMode, getActiveJulianDate } from './gameState.js';
```

**Step 2: Update position calculation to use active date**

In `updateShipPhysics()` function, find (around line 247):

```javascript
    const julianDate = getJulianDate();
```

Replace with:

```javascript
    // Use ephemeris date in planning mode, simulation date in live mode
    const julianDate = getActiveJulianDate();
```

**Step 3: Add comment explaining behavior**

Add comment above the line:

```javascript
    // Use ephemeris date in planning mode, simulation date in live mode
    // This allows ship visualization to "slide" to planning date while
    // simulation state remains frozen at the moment planning mode was entered
    const julianDate = getActiveJulianDate();
```

**Step 4: Test ship position changes with time travel**

Manual test in browser:
1. Start server: `cd src && python3 -m http.server 8080`
2. Open `http://localhost:8080`
3. Open browser console
4. Import gameState functions:
   ```javascript
   import('/js/core/gameState.js').then(m => window.gs = m)
   ```
5. Enable planning mode:
   ```javascript
   gs.setPlanningMode(true)
   ```
6. Verify:
   - Time stops advancing (check UI clock)
   - Ship still visible
   - Time travel slider moves ship

Expected: Ship position updates as time travel slider moves, simulation frozen

**Step 5: Commit**

```bash
git add src/js/core/shipPhysics.js
git commit -m "feat(planning): use active date for ship physics

- Import isPlanningMode and getActiveJulianDate
- Use getActiveJulianDate() instead of getJulianDate()
- Ship position now calculated at ephemeris date in planning mode
- Enables ship visualization to slide along orbital path during planning"
```

---

### Task 3: Update Celestial Bodies to Use Planning Date

**Goal:** Ensure celestial body positions respect planning mode consistently.

**Files:**
- Modify: `/Users/mattcameron/Projects/sailship/src/js/data/celestialBodies.js` (lines 905-949)

**Step 1: Import planning mode check**

At top of file (around line 10-20 with other imports), find:

```javascript
import {
    getJulianDate,
    timeTravelState,
    getEphemerisDate
} from '../core/gameState.js';
```

Replace with:

```javascript
import {
    getJulianDate,
    timeTravelState,
    getEphemerisDate,
    isPlanningMode
} from '../core/gameState.js';
```

**Step 2: Update date selection logic**

In `updateCelestialPositions()` function, find (around line 907):

```javascript
    // Choose date source based on time travel mode
    const jd = timeTravelState.enabled ? null : getJulianDate();
    const ephemerisDate = timeTravelState.enabled ? getEphemerisDate() : null;
```

Replace with:

```javascript
    // Choose date source based on time travel or planning mode
    // In planning mode, always use ephemeris for consistency
    const useEphemeris = timeTravelState.enabled || isPlanningMode();
    const jd = useEphemeris ? null : getJulianDate();
    const ephemerisDate = useEphemeris ? getEphemerisDate() : null;
```

**Step 3: Update comment for clarity**

Replace the comment:

```javascript
    // Choose date source based on time travel or planning mode
    // - Planning mode: Always ephemeris (synchronized with ship)
    // - Time travel enabled: Ephemeris for historical/future accuracy
    // - Live mode: Keplerian (fast, deterministic)
    const useEphemeris = timeTravelState.enabled || isPlanningMode();
    const jd = useEphemeris ? null : getJulianDate();
    const ephemerisDate = useEphemeris ? getEphemerisDate() : null;
```

**Step 4: Test celestial synchronization**

Manual test in browser console:
```javascript
import('/js/core/gameState.js').then(m => window.gs = m)
gs.setPlanningMode(true)
// Move time travel slider and observe planets move with ship
```

Expected: Planets and ship move together when slider adjusted

**Step 5: Commit**

```bash
git add src/js/data/celestialBodies.js
git commit -m "feat(planning): sync celestial bodies with planning mode

- Import isPlanningMode check
- Use ephemeris in both time travel AND planning modes
- Ensures planets and ship synchronized to same date
- Maintains existing time travel behavior"
```

---

### Task 4: Update Trajectory Prediction for Planning Mode

**Goal:** Make trajectory prediction start from planning date instead of simulation date.

**Files:**
- Modify: `/Users/mattcameron/Projects/sailship/src/js/ui/renderer.js` (lines 796-804)

**Step 1: Import planning mode functions**

At top of file (around line 9-17), find:

```javascript
import {
    displayOptions,
    trajectoryConfig,
    getScale,
    getTime,
    getJulianDate,
    getEphemerisJulianDate,
    timeTravelState,
    getIntersectionCache,
    bodyFilters
} from '../core/gameState.js';
```

Replace with:

```javascript
import {
    displayOptions,
    trajectoryConfig,
    getScale,
    getTime,
    getJulianDate,
    getEphemerisJulianDate,
    timeTravelState,
    isPlanningMode,
    getActiveJulianDate,
    getIntersectionCache,
    bodyFilters
} from '../core/gameState.js';
```

**Step 2: Update trajectory start time**

In `drawPredictedTrajectory()` function, find (around line 800):

```javascript
    // Trajectory always starts from simulation time (current ship position)
    // When time travel is enabled, encounter markers will show planets at crossing times
    const trajectory = predictTrajectory({
        orbitalElements: ship.orbitalElements,
        sail: ship.sail,
        mass: ship.mass || 10000,
        startTime: getJulianDate(),
        duration: duration,
        steps: steps,
        soiState: ship.soiState  // For SOI boundary detection
    });
```

Replace with:

```javascript
    // Use active date for trajectory prediction
    // - Planning mode: Predict from ephemeris date (synchronized planning view)
    // - Live mode: Predict from simulation date (current ship position)
    const startTime = getActiveJulianDate();

    const trajectory = predictTrajectory({
        orbitalElements: ship.orbitalElements,
        sail: ship.sail,
        mass: ship.mass || 10000,
        startTime: startTime,
        duration: duration,
        steps: steps,
        soiState: ship.soiState  // For SOI boundary detection
    });
```

**Step 3: Test trajectory synchronization**

Manual test:
1. Enable planning mode
2. Set trajectory to Venus
3. Move time travel slider
4. Observe trajectory start point follows ship

Expected: Trajectory always starts from ship position, updates as time slider moves

**Step 4: Commit**

```bash
git add src/js/ui/renderer.js
git commit -m "feat(planning): sync trajectory with planning date

- Import isPlanningMode and getActiveJulianDate
- Use getActiveJulianDate() for trajectory start time
- Trajectory now predicts from ephemeris date in planning mode
- Enables trajectory to update as launch window changes"
```

---

### Task 5: Update Intersection Detection for Planning Mode

**Goal:** Make encounter markers calculate from planning date.

**Files:**
- Modify: `/Users/mattcameron/Projects/sailship/src/js/main.js` (lines 100-124)

**Step 1: Import planning mode functions**

At top of file (around line 8-17), find:

```javascript
import {
    advanceTime,
    timeScale,
    setFocusTarget,
    julianDate,
    getEphemerisJulianDate,
    timeTravelState,
    getIntersectionCache,
    setIntersectionCache,
    isIntersectionCacheValid,
    loadBodyFilters
} from './core/gameState.js';
```

Replace with:

```javascript
import {
    advanceTime,
    timeScale,
    setFocusTarget,
    julianDate,
    getEphemerisJulianDate,
    timeTravelState,
    isPlanningMode,
    getActiveJulianDate,
    getIntersectionCache,
    setIntersectionCache,
    isIntersectionCacheValid,
    loadBodyFilters
} from './core/gameState.js';
```

**Step 2: Update intersection detection time reference**

In `updatePositions()` function, find (around line 113-118):

```javascript
                // Detect orbital crossings and get planet positions at crossing times
                // Always use simulation time for filtering (don't show past crossings)
                const intersections = detectIntersections(
                    trajectory,
                    celestialBodies,
                    julianDate,
                    soiBody
                );
```

Replace with:

```javascript
                // Detect orbital crossings and get planet positions at crossing times
                // Use active date for filtering (planning mode uses ephemeris, live uses simulation)
                const currentTime = getActiveJulianDate();

                const intersections = detectIntersections(
                    trajectory,
                    celestialBodies,
                    currentTime,
                    soiBody
                );
```

**Step 3: Test encounter marker updates**

Manual test:
1. Enable planning mode
2. Set destination to Mars
3. Adjust time travel slider
4. Watch encounter marker time offsets change

Expected: Encounter markers update as launch date changes

**Step 4: Commit**

```bash
git add src/js/main.js
git commit -m "feat(planning): sync encounter markers with planning date

- Import isPlanningMode and getActiveJulianDate
- Use getActiveJulianDate() for intersection detection
- Encounter markers now relative to planning date
- Time offsets update as launch window changes"
```

---

### Task 6: Add Planning Mode UI Toggle

**Goal:** Add UI control to enable/disable planning mode.

**Files:**
- Modify: `/Users/mattcameron/Projects/sailship/src/index.html` (Time Travel section, around line 400-450)
- Modify: `/Users/mattcameron/Projects/sailship/src/js/ui/controls.js` (after time travel controls, around line 1050)

**Step 1: Add planning mode checkbox to HTML**

In `index.html`, find the Time Travel section (around line 400):

```html
<div class="panel-section" id="timeTravelSection">
    <div class="panel-header" data-section="timeTravel">
        <span>▼</span>
        <span>TIME TRAVEL</span>
    </div>
    <div class="panel-content" id="timeTravelContent">
        <div class="control-group">
            <input type="checkbox" id="timeTravelEnabled">
            <label for="timeTravelEnabled">ENABLED</label>
        </div>
```

Add planning mode toggle BEFORE the enabled checkbox:

```html
<div class="panel-section" id="timeTravelSection">
    <div class="panel-header" data-section="timeTravel">
        <span>▼</span>
        <span>TIME TRAVEL</span>
    </div>
    <div class="panel-content" id="timeTravelContent">
        <!-- Planning mode toggle -->
        <div class="control-group" style="margin-bottom: 15px; padding: 10px; background: rgba(0, 150, 255, 0.1); border: 1px solid rgba(0, 150, 255, 0.3); border-radius: 4px;">
            <input type="checkbox" id="planningModeEnabled">
            <label for="planningModeEnabled" style="color: #00bfff; font-weight: bold;">
                🔍 PLANNING MODE
            </label>
            <div style="font-size: 0.85em; color: #888; margin-top: 5px; margin-left: 22px;">
                Freezes simulation, syncs everything to launch date
            </div>
        </div>

        <div class="control-group">
            <input type="checkbox" id="timeTravelEnabled">
            <label for="timeTravelEnabled">ENABLED</label>
        </div>
```

**Step 2: Add CSS for planning mode indicator**

In `index.html`, find the `<style>` section (around line 50-200) and add:

```css
/* Planning mode active indicator */
body.planning-mode {
    /* Add subtle blue tint to entire viewport */
}

body.planning-mode #navCanvas {
    border: 3px solid rgba(0, 191, 255, 0.6);
    box-shadow: 0 0 20px rgba(0, 191, 255, 0.3);
}

body.planning-mode .status-bar {
    background: rgba(0, 100, 200, 0.3);
    border-bottom: 2px solid rgba(0, 191, 255, 0.5);
}

/* Planning mode status text */
#planningModeStatus {
    display: none;
    color: #00bfff;
    font-weight: bold;
    font-size: 0.9em;
    padding: 5px 10px;
    background: rgba(0, 150, 255, 0.2);
    border-radius: 3px;
    margin-left: 15px;
}

body.planning-mode #planningModeStatus {
    display: inline-block;
}
```

**Step 3: Add planning mode status indicator to status bar**

Find the status bar in HTML (around line 350):

```html
<div class="status-bar">
    <span id="systemStatus">SYSTEM: SOL // BODIES: 12 // CONTACTS: 3</span>
</div>
```

Replace with:

```html
<div class="status-bar">
    <span id="systemStatus">SYSTEM: SOL // BODIES: 12 // CONTACTS: 3</span>
    <span id="planningModeStatus">🔍 PLANNING MODE - SIMULATION FROZEN</span>
</div>
```

**Step 4: Add event handler in controls.js**

At the end of `initTimeTravelControls()` function (around line 1050), add:

```javascript
    // Planning mode toggle
    const planningModeCheckbox = document.getElementById('planningModeEnabled');
    if (planningModeCheckbox) {
        planningModeCheckbox.addEventListener('change', (e) => {
            const enabled = e.target.checked;
            setPlanningMode(enabled);

            // Add/remove planning mode class to body for styling
            if (enabled) {
                document.body.classList.add('planning-mode');
            } else {
                document.body.classList.remove('planning-mode');
            }

            console.log(`[PLANNING] Planning mode ${enabled ? 'enabled' : 'disabled'}`);
        });
    }
```

**Step 5: Import setPlanningMode function**

At top of controls.js (around line 8-20), find:

```javascript
import {
    setSpeed,
    setZoom,
    setFocusTarget,
    displayOptions,
    trajectoryConfig,
    setTrajectoryDuration,
    timeTravelState,
    setTimeTravelEnabled,
    setReferenceDate,
    setTimeOffset,
    setTimeScale,
    getEphemerisDate,
    bodyFilters
} from '../core/gameState.js';
```

Add `setPlanningMode`:

```javascript
import {
    setSpeed,
    setZoom,
    setFocusTarget,
    displayOptions,
    trajectoryConfig,
    setTrajectoryDuration,
    timeTravelState,
    setTimeTravelEnabled,
    setReferenceDate,
    setTimeOffset,
    setTimeScale,
    getEphemerisDate,
    setPlanningMode,
    bodyFilters
} from '../core/gameState.js';
```

**Step 6: Test planning mode toggle**

Manual test:
1. Reload page
2. Find "PLANNING MODE" checkbox in Time Travel section
3. Enable it
4. Verify:
   - Simulation freezes (clock stops)
   - Blue border appears on canvas
   - Status bar shows "PLANNING MODE - SIMULATION FROZEN"
   - Time travel slider enabled automatically
5. Move time travel slider → ship and planets move together
6. Disable planning mode → simulation resumes

Expected: All visual indicators work, simulation freezes/resumes correctly

**Step 7: Commit**

```bash
git add src/index.html src/js/ui/controls.js
git commit -m "feat(planning): add planning mode UI toggle

- Add planning mode checkbox in Time Travel section
- Add visual indicator (blue border, status text) when active
- Add body.planning-mode class for styling
- Connect checkbox to setPlanningMode() function
- Auto-enables time travel when planning mode activated"
```

---

### Task 7: Improve Planning Mode UX

**Goal:** Add better visual feedback and prevent confusing states.

**Files:**
- Modify: `/Users/mattcameron/Projects/sailship/src/js/ui/uiUpdater.js` (around line 50-100)
- Modify: `/Users/mattcameron/Projects/sailship/src/js/core/gameState.js` (speed control section)

**Step 1: Disable speed controls in planning mode**

In `uiUpdater.js`, find the `updateUI()` function. Add planning mode check for speed buttons.

Find (around line 60-80):

```javascript
export function updateUI() {
    // ... existing code ...

    // Update time travel display
    updateTimeTravelDisplay();
```

Add before the time travel display update:

```javascript
export function updateUI() {
    // ... existing code ...

    // Disable speed controls in planning mode
    const inPlanningMode = isPlanningMode();
    const speedButtons = document.querySelectorAll('.speed-button');
    speedButtons.forEach(btn => {
        if (inPlanningMode) {
            btn.disabled = true;
            btn.style.opacity = '0.3';
            btn.style.cursor = 'not-allowed';
        } else {
            btn.disabled = false;
            btn.style.opacity = '';
            btn.style.cursor = '';
        }
    });

    // Update time travel display
    updateTimeTravelDisplay();
```

**Step 2: Import isPlanningMode**

At top of uiUpdater.js, add import:

```javascript
import {
    getTime,
    getJulianDate,
    getCurrentSpeed,
    getTrajectoryDuration,
    timeTravelState,
    getEphemerisDate,
    isPlanningMode
} from '../core/gameState.js';
```

**Step 3: Update time travel display to show planning mode**

In `controls.js`, find `updateTimeTravelDisplay()` function (around line 1081).

Add planning mode indicator:

```javascript
export function updateTimeTravelDisplay() {
    if (!timeTravelState.enabled) return;

    const ephemerisDate = getEphemerisDate();
    const dateStr = ephemerisDate.toISOString().slice(0, 19).replace('T', ' ');

    // Update full display
    const ephemerisDateDisplay = document.getElementById('ephemerisDate');
    if (ephemerisDateDisplay) {
        // Show planning mode indicator if active
        const planningIndicator = isPlanningMode() ? ' 🔍 [PLANNING]' : '';
        ephemerisDateDisplay.textContent = dateStr + ' UTC' + planningIndicator;
    }

    // Update compact display
    const compactInfo = document.getElementById('ttCompactInfo');
    if (compactInfo) {
        const planningIndicator = isPlanningMode() ? ' 🔍' : '';
        compactInfo.textContent = dateStr.slice(0, 10) + planningIndicator;
    }
}
```

**Step 4: Add import to controls.js**

At top of controls.js, add to existing imports:

```javascript
import {
    // ... existing imports ...
    isPlanningMode
} from '../core/gameState.js';
```

**Step 5: Test UX improvements**

Manual test:
1. Enable planning mode
2. Verify speed buttons are disabled and grayed out
3. Verify time travel display shows 🔍 indicator
4. Try clicking speed buttons → no effect
5. Disable planning mode → buttons re-enabled

Expected: Clear visual feedback, no confusing interactions

**Step 6: Commit**

```bash
git add src/js/ui/uiUpdater.js src/js/ui/controls.js
git commit -m "feat(planning): improve planning mode UX

- Disable and gray out speed controls in planning mode
- Add planning mode indicator (🔍) to time travel display
- Prevent confusing interactions during planning
- Clear visual feedback of planning state"
```

---

### Task 8: Add Console Tests for Planning Mode

**Goal:** Create manual console tests for planning mode functionality.

**Files:**
- Create: `/Users/mattcameron/Projects/sailship/src/js/core/planningMode.test.js`

**Step 1: Create test file**

```javascript
/**
 * Planning Mode Manual Tests
 *
 * Run in browser console:
 * import('/js/core/planningMode.test.js').then(m => m.runAllTests())
 */

import {
    setPlanningMode,
    isPlanningMode,
    getActiveJulianDate,
    getJulianDate,
    getEphemerisJulianDate,
    timeTravelState,
    timeScale,
    setTimeOffset
} from './gameState.js';

export function runAllTests() {
    console.log('=== PLANNING MODE TESTS ===\n');

    let passed = 0;
    let failed = 0;

    // Test 1: Planning mode activation
    console.log('Test 1: Planning mode activation');
    const initialTimeScale = timeScale;
    setPlanningMode(true);
    if (isPlanningMode() && timeScale === 0) {
        console.log('✓ Planning mode enabled and time frozen');
        passed++;
    } else {
        console.error('✗ Planning mode not properly activated');
        failed++;
    }

    // Test 2: Time travel auto-enabled
    console.log('\nTest 2: Time travel auto-enabled');
    if (timeTravelState.enabled) {
        console.log('✓ Time travel automatically enabled');
        passed++;
    } else {
        console.error('✗ Time travel not enabled');
        failed++;
    }

    // Test 3: Active date uses ephemeris in planning mode
    console.log('\nTest 3: Active date uses ephemeris');
    const activeDate = getActiveJulianDate();
    const ephemerisDate = getEphemerisJulianDate();
    if (Math.abs(activeDate - ephemerisDate) < 0.001) {
        console.log('✓ Active date matches ephemeris date');
        console.log(`  Active: ${activeDate.toFixed(6)}`);
        console.log(`  Ephemeris: ${ephemerisDate.toFixed(6)}`);
        passed++;
    } else {
        console.error('✗ Active date does not match ephemeris');
        console.error(`  Active: ${activeDate}`);
        console.error(`  Ephemeris: ${ephemerisDate}`);
        failed++;
    }

    // Test 4: Simulation date frozen
    console.log('\nTest 4: Simulation date frozen');
    const simDateBefore = getJulianDate();
    // Wait a frame (simulation would normally advance)
    setTimeout(() => {
        const simDateAfter = getJulianDate();
        if (simDateBefore === simDateAfter) {
            console.log('✓ Simulation date frozen');
            console.log(`  Date: ${simDateBefore.toFixed(6)}`);
            passed++;
        } else {
            console.error('✗ Simulation date advanced!');
            console.error(`  Before: ${simDateBefore}`);
            console.error(`  After: ${simDateAfter}`);
            failed++;
        }

        // Test 5: Time offset changes active date
        console.log('\nTest 5: Time offset affects active date');
        const initialActive = getActiveJulianDate();
        setTimeOffset(30); // Move forward 30 days
        const newActive = getActiveJulianDate();
        const expectedDiff = 30;
        const actualDiff = newActive - initialActive;
        if (Math.abs(actualDiff - expectedDiff) < 0.1) {
            console.log('✓ Time offset changes active date');
            console.log(`  Offset: ${expectedDiff} days`);
            console.log(`  Actual diff: ${actualDiff.toFixed(2)} days`);
            passed++;
        } else {
            console.error('✗ Time offset did not change active date correctly');
            console.error(`  Expected diff: ${expectedDiff}`);
            console.error(`  Actual diff: ${actualDiff}`);
            failed++;
        }

        // Reset time offset
        setTimeOffset(0);

        // Test 6: Planning mode deactivation
        console.log('\nTest 6: Planning mode deactivation');
        setPlanningMode(false);
        if (!isPlanningMode() && timeScale !== 0) {
            console.log('✓ Planning mode disabled and time unfrozen');
            console.log(`  Time scale: ${timeScale}`);
            passed++;
        } else {
            console.error('✗ Planning mode not properly deactivated');
            failed++;
        }

        // Test 7: Active date uses simulation after exit
        console.log('\nTest 7: Active date uses simulation after exit');
        const activeAfterExit = getActiveJulianDate();
        const simDate = getJulianDate();
        if (Math.abs(activeAfterExit - simDate) < 0.001) {
            console.log('✓ Active date back to simulation date');
            console.log(`  Active: ${activeAfterExit.toFixed(6)}`);
            console.log(`  Sim: ${simDate.toFixed(6)}`);
            passed++;
        } else {
            console.error('✗ Active date not using simulation date');
            console.error(`  Active: ${activeAfterExit}`);
            console.error(`  Sim: ${simDate}`);
            failed++;
        }

        // Summary
        console.log('\n=== TEST SUMMARY ===');
        console.log(`Passed: ${passed}/7`);
        console.log(`Failed: ${failed}/7`);

        if (failed === 0) {
            console.log('\n✓ ALL TESTS PASSED');
        } else {
            console.error('\n✗ SOME TESTS FAILED');
        }
    }, 100);
}
```

**Step 2: Add test documentation to CLAUDE.md**

In `/Users/mattcameron/Projects/sailship/CLAUDE.md`, add to Console Tests section:

```markdown
// Planning mode tests
import('/js/core/planningMode.test.js').then(m => m.runAllTests())
```

**Step 3: Run tests**

```bash
cd src && python3 -m http.server 8080
```

In browser console:
```javascript
import('/js/core/planningMode.test.js').then(m => m.runAllTests())
```

Expected output:
```
=== PLANNING MODE TESTS ===
...
✓ ALL TESTS PASSED
Passed: 7/7
Failed: 0/7
```

**Step 4: Commit**

```bash
git add src/js/core/planningMode.test.js CLAUDE.md
git commit -m "test(planning): add planning mode console tests

- Create planningMode.test.js with 7 test cases
- Test activation, time freeze, date switching, deactivation
- Add to CLAUDE.md console tests section
- All tests passing"
```

---

### Task 9: Update Documentation

**Goal:** Document planning mode in project documentation.

**Files:**
- Modify: `/Users/mattcameron/Projects/sailship/CLAUDE.md`

**Step 1: Add Planning Mode section to CLAUDE.md**

Find the "Display Options" section (around line 100), and add new section after it:

```markdown
## Planning Mode (Launch Window Finder)

Planning Mode is a navigation planning tool that freezes simulation time and synchronizes all visualizations (ship, planets, trajectory) to a single planning date. This enables launch window exploration without affecting live gameplay.

### How It Works

**When Planning Mode is enabled:**
1. Simulation time freezes (timeScale = 0, physics paused)
2. Time travel is automatically enabled
3. Ship position is calculated at ephemeris date (from orbital elements)
4. Planets positioned at ephemeris date
5. Trajectory predicts from ephemeris date
6. All visualizations synchronized to the same date

**Use Case - Finding a Mars Transfer Window:**
1. Enable Planning Mode (Time Travel section)
2. Adjust time travel slider to explore different launch dates
3. Set destination to Mars
4. Watch encounter markers update as you change launch date
5. Look for "CLOSE" indicator on Mars ghost planet
6. Fine-tune sail settings to optimize trajectory
7. When satisfied, disable Planning Mode to resume simulation

### Planning Mode vs Time Travel

| Feature | Time Travel Only | Planning Mode |
|---------|------------------|---------------|
| Simulation | Runs normally | Frozen (paused) |
| Ship position | Current (simulation time) | Calculated at planning date |
| Planet positions | Historical/future | Synchronized with ship |
| Trajectory start | Current position | Planning date position |
| Use case | Observe historical sky | Find launch windows |

### Technical Details

**Two Planning Types:**
- **Type 1 (Phase 1 - Current)**: Ship stays at orbital position, time slides. Easier for finding routes, not perfectly realistic (launch date changes but ship "teleports" along orbit).
- **Type 2 (Phase 2 - Future)**: Full scenario save/load system. Save ship state, date, and sail config as scenario. Load scenario to set up realistic mission planning.

**Date Systems:**
- **Simulation time** (`getJulianDate()`): Gameplay clock, advances with timeScale
- **Ephemeris time** (`getEphemerisJulianDate()`): Planning/historical date, controlled by time travel slider
- **Active time** (`getActiveJulianDate()`): Returns ephemeris in planning mode, simulation otherwise

**Functions:**
```javascript
setPlanningMode(enabled)       // Enable/disable planning mode
isPlanningMode()               // Check if planning mode active
getActiveJulianDate()          // Get current date for calculations
```

### Keyboard Shortcuts

Planning mode uses existing time travel keyboard shortcuts (none added yet, but could add Ctrl+P to toggle planning).
```

**Step 2: Update Architecture section**

Find the "Architecture" section and add planning mode to core systems:

```markdown
├── core/               # Game logic
│   ├── camera.js       # 3D projection, view state
│   ├── gameState.js    # Time, zoom, display options, planning mode
│   ├── navigation.js   # Destination/distance tracking
│   └── shipPhysics.js  # Per-frame physics updates
```

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add planning mode documentation

- Add Planning Mode section explaining functionality
- Document two planning types (current and future)
- Add technical details on date systems
- Update architecture diagram with planning mode
- Include use case example for Mars transfer"
```

---

## Phase 1 Complete - Testing and Verification

### Task 10: End-to-End Manual Testing

**Goal:** Verify complete planning mode workflow functions correctly.

**Test Scenario: Find Venus Transfer Window**

**Step 1: Start fresh session**

```bash
cd /Users/mattcameron/Projects/sailship/src
python3 -m http.server 8080
```

Open `http://localhost:8080` in browser (fresh, no cache)

**Step 2: Initial state verification**

- [ ] Game loads normally
- [ ] Ship visible near Earth
- [ ] Time advancing (check UI clock)
- [ ] No blue border on canvas
- [ ] No planning mode indicator

**Step 3: Enable planning mode**

1. Expand Time Travel section
2. Check "PLANNING MODE" checkbox

Verify:
- [ ] Blue border appears on canvas
- [ ] Status bar shows "🔍 PLANNING MODE - SIMULATION FROZEN"
- [ ] Time stops advancing (UI clock frozen)
- [ ] Speed buttons disabled and grayed out
- [ ] Time travel automatically enabled

**Step 4: Explore launch windows**

1. Set destination to VENUS (Orbit Control panel)
2. Enable display options:
   - [x] ORBITAL PATHS
   - [x] PREDICTED PATH
   - [x] ENCOUNTER MARKERS
3. Adjust time travel slider left and right

Verify:
- [ ] Ship position moves along its orbit as slider moves
- [ ] Venus moves to different orbital position
- [ ] Trajectory updates, starting from ship's new position
- [ ] Encounter markers update (Venus ghost, time offsets change)
- [ ] When Venus ghost is "CLOSE" to trajectory, you found a transfer window

**Step 5: Test sail adjustments during planning**

1. Go to SAIL tab
2. Adjust yaw angle with `[` and `]` keys
3. Adjust deployment with `-` and `=` keys

Verify:
- [ ] Trajectory updates with new sail settings
- [ ] Encounter markers recalculate
- [ ] Can explore different trajectories at same launch date

**Step 6: Exit planning mode**

1. Uncheck "PLANNING MODE" checkbox

Verify:
- [ ] Blue border disappears
- [ ] Planning mode indicator disappears from status bar
- [ ] Time starts advancing (UI clock resumes)
- [ ] Speed buttons re-enabled
- [ ] Ship position at frozen simulation date (where it was when planning started)
- [ ] Time travel can be toggled independently now

**Step 7: Console test verification**

Open browser console:
```javascript
import('/js/core/planningMode.test.js').then(m => m.runAllTests())
```

Verify:
- [ ] All 7 tests pass
- [ ] No errors in console

**Step 8: Test edge cases**

1. **Enable planning → change speed → verify blocked**
   - Try clicking 100x button while in planning mode
   - Should have no effect (still paused)

2. **Enable planning → adjust slider → disable planning → verify simulation resumes from frozen point**
   - Enable planning at day 100
   - Adjust slider to day 200 (ship moves along orbit)
   - Disable planning
   - Verify: Simulation resumes from day 100, not day 200

3. **Rapid toggle test**
   - Toggle planning mode on/off 5 times quickly
   - Should not crash or get into weird state

**Step 9: Performance check**

With planning mode enabled and slider moving:
- [ ] Frame rate acceptable (>30 FPS)
- [ ] No console errors
- [ ] No visual glitches

**Step 10: Document any issues**

If any test fails, document in issue tracker:
```
Issue: [Brief description]
Steps to reproduce:
1. [Step]
2. [Step]
Expected: [What should happen]
Actual: [What happened]
```

---

## Phase 2 Prep: Future Extensibility (Not Implemented)

This section documents Phase 2 architecture for future implementation.

### Phase 2 Features (Deferred)

**Scenario Manager:**
- Save/load planning scenarios (date + ship state + sail config)
- Quick save slots (1, 2, 3 buttons)
- Scenario naming and management
- localStorage persistence

**Realistic Planning:**
- "Set simulation date" control (jump to arbitrary date)
- "Apply plan" workflow (move simulation to planning date)
- Delta-v budget tracking
- Transfer window optimization

**Enhanced UX:**
- Planning mode auto-suggests optimal launch windows
- Visual timeline showing transfer opportunities
- Comparison mode (multiple scenarios side-by-side)

### Phase 2 Architecture Notes

**File locations for Phase 2:**
```
src/js/core/scenarioManager.js     # Save/load scenario state
src/js/ui/scenarioPanel.js         # UI for scenario management
docs/plans/2026-XX-XX-scenario-manager.md   # Implementation plan
```

**State to save in scenario:**
```javascript
scenario = {
    name: "Venus Transfer - March 2026",
    date: 2460700.5,  // Julian date
    ship: {
        orbitalElements: {...},
        sail: {...},
        soiState: {...},
        mass: 10000
    },
    metadata: {
        created: Date.now(),
        description: "Optimal Venus transfer window"
    }
}
```

---

## Summary

### Phase 1 Deliverables

✓ Planning mode state management (gameState.js)
✓ Synchronized ship positioning (shipPhysics.js)
✓ Synchronized celestial positioning (celestialBodies.js)
✓ Synchronized trajectory prediction (renderer.js)
✓ Synchronized encounter markers (main.js)
✓ UI controls (index.html, controls.js)
✓ Visual indicators (CSS, status bar)
✓ UX improvements (disabled controls, indicators)
✓ Console tests (planningMode.test.js)
✓ Documentation (CLAUDE.md)

### Files Modified (10 files)

1. `src/js/core/gameState.js` - Planning mode state and controls
2. `src/js/core/shipPhysics.js` - Use active date for position
3. `src/js/data/celestialBodies.js` - Use active date for planets
4. `src/js/ui/renderer.js` - Use active date for trajectory
5. `src/js/main.js` - Use active date for intersections
6. `src/index.html` - Planning mode checkbox and styling
7. `src/js/ui/controls.js` - Planning mode event handler
8. `src/js/ui/uiUpdater.js` - Disable controls in planning mode
9. `src/js/core/planningMode.test.js` - Console tests (new file)
10. `CLAUDE.md` - Documentation

### Testing Checklist

- [ ] All 10 implementation tasks completed
- [ ] All commits made with descriptive messages
- [ ] Console tests pass (7/7)
- [ ] End-to-end manual test passes (all checkboxes)
- [ ] No console errors during normal use
- [ ] Frame rate acceptable (>30 FPS)
- [ ] Documentation updated

### Known Limitations (Phase 1)

1. **Not perfectly realistic**: Ship "teleports" along its orbit when planning date changes. Orbital elements don't update, only position calculation changes.

2. **No scenario persistence**: Can't save/load planning states. Must manually configure each time.

3. **No "apply plan" workflow**: Exiting planning mode returns to frozen simulation date. Can't "jump" simulation forward to planning date.

4. **No delta-v budget**: Can't see fuel/time cost of trajectory changes during planning.

These limitations are intentional for Phase 1. Phase 2 will address them with scenario manager and realistic planning features.

---

## Implementation Tips

**For executing this plan:**

1. **Work linearly**: Tasks are ordered to minimize conflicts and enable incremental testing
2. **Test after each commit**: Use console tests and manual checks
3. **Watch for typos**: File paths are absolute, copy carefully
4. **Check imports**: Each task lists required imports explicitly
5. **Commit message format**: Use conventional commits (`feat:`, `test:`, `docs:`)
6. **If stuck**: Check browser console for errors, verify all imports present

**Common issues:**

- **Ship disappears**: Check if `getActiveJulianDate()` is imported in shipPhysics.js
- **Trajectory doesn't update**: Check if `getActiveJulianDate()` is imported in renderer.js
- **Can't change speed**: This is correct behavior in planning mode
- **Planets don't move**: Check if `isPlanningMode()` is imported in celestialBodies.js

**Performance notes:**

- Planning mode should not be slower than normal gameplay
- Trajectory cache still active (500ms TTL)
- Intersection cache still active (synchronized with trajectory)
- If laggy, check for console errors or infinite loops

---

**End of Plan**

This plan is complete and ready for execution using superpowers:executing-plans or superpowers:subagent-driven-development.
