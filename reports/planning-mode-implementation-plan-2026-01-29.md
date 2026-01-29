# Planning Mode Implementation Plan

**Date:** 2026-01-29
**Status:** Draft
**Specification:** `reports/planning-mode-spec-2026-01-29.md`

## 0. File Impact Summary

### Files to EDIT:
1. `src/index.html` - Add Planning Mode modal overlay HTML structure
2. `src/css/main.css` - Add Planning Mode styling (modal, time slider, controls)
3. `src/js/core/gameState.js` - Add planning state, snapshot/restore functions
4. `src/js/main.js` - Modify game loop to handle planning mode pause
5. `src/js/ui/controls.js` - Add Planning Mode keyboard shortcut, time slider controls
6. `src/js/ui/uiUpdater.js` - Add planning mode UI update function
7. `src/js/ui/renderer.js` - Add planning mode rendering (reuse existing functions)

### Files to CREATE:
1. `src/js/core/planningMode.js` - Planning mode state machine, sandbox logic
2. `reports/planning-mode-review-2026-01-29.md` - Review documentation (after planning)

### Files to DELETE:
- None

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

**UI Layout (Full-screen Modal):**
```
┌─────────────────────────────────────────────────────────────────────────┐
│  PLANNING MODE // MISSION COMPUTER                          [X] CLOSE   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│                     [MAIN CANVAS - Full width]                           │
│                     Same rendering as Flight                             │
│                     but with sandbox time                                │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│  TIME MACHINE                                                            │
│  [NOW] ═══════════════════════●═════════════════════════════ [+2 YRS]   │
│        <  >     Current: +127 days    Date: 2351 Jun 14                  │
│                                                                          │
│  MODE: [FIXED SHIP] [DRIFT]    COORDS: X: 1.23 Y: 0.45 Z: 0.00 AU       │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Design Principles

1. **Snapshot Isolation:** Flight state is frozen via deep copy, not paused references
2. **Deterministic Positions:** Use existing `getPosition(elements, julianDate)` with sandbox time
3. **Reuse Rendering:** Same canvas, same render functions, different time input
4. **Minimal State:** Planning mode adds few new variables, mostly reuses existing
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

**Ghost Planet Update in Planning Mode:**
```javascript
// 1. Predict trajectory from snapshot ship state
const trajectory = predictTrajectory({
    orbitalElements: sandboxShipElements,
    sail: sandboxSailSettings,
    startTime: sandboxJulianDate,
    duration: trajectoryDuration
});

// 2. Detect intersections (same algorithm, different time base)
const intersections = detectIntersections(
    trajectory,
    celestialBodies,
    sandboxJulianDate  // Critical: use sandbox time, not live time
);

// 3. Render ghost planets at their positions at crossing time
// (uses same drawIntersectionMarkers, fed different data)
```

## 3. Units of Work

### Unit 1: Planning Mode State Foundation
**Description:** Create the planning mode module with state machine and snapshot system
**Files:**
- CREATE `src/js/core/planningMode.js`
- EDIT `src/js/core/gameState.js` (export new state)

**Acceptance Criteria:**
- [ ] `planningMode.active` boolean flag exists
- [ ] `createSnapshot()` returns deep copy of game state
- [ ] `restoreSnapshot(snapshot)` restores game state
- [ ] `getSandboxTime()` returns planning time (or live time if not active)
- [ ] Module exports are accessible from main.js

**Test Method:** Console test - create snapshot, modify state, restore, verify original values

---

### Unit 2: Planning Mode HTML Structure
**Description:** Add modal overlay HTML for Planning Mode
**Files:** EDIT `src/index.html`

**Acceptance Criteria:**
- [ ] Modal container with id `planningModal` added
- [ ] Header with title "PLANNING MODE // MISSION COMPUTER"
- [ ] Close button with id `closePlanningMode`
- [ ] Canvas container for planning view
- [ ] Time Machine section with slider
- [ ] Mode toggle buttons (FIXED SHIP / DRIFT)
- [ ] Coordinate readout display
- [ ] Modal hidden by default (`display: none`)

**Test Method:** Load page, inspect DOM, verify elements exist

---

### Unit 3: Planning Mode CSS Styling
**Description:** Style the Planning Mode modal
**Files:** EDIT `src/css/main.css`

**Acceptance Criteria:**
- [ ] Modal covers full viewport with semi-transparent backdrop
- [ ] Content area styled consistently with existing panels
- [ ] Time slider has custom styling matching theme
- [ ] Mode toggle buttons styled as button group
- [ ] Responsive layout for canvas area
- [ ] Close button positioned top-right
- [ ] Hover/active states for interactive elements

**Test Method:** Toggle modal visible, verify visual appearance

---

### Unit 4: Game Loop Integration
**Description:** Modify game loop to pause during Planning Mode
**Files:** EDIT `src/js/main.js`

**Acceptance Criteria:**
- [ ] When `planningMode.active === true`, skip `updatePositions()` (live updates)
- [ ] When active, call `updatePlanningMode()` instead
- [ ] `render()` and `updateUI()` still called (they read state)
- [ ] No errors when toggling between modes

**Test Method:** Set planning mode active via console, verify game pauses

---

### Unit 5: Keyboard Shortcut Toggle
**Description:** Add `P` key to toggle Planning Mode
**Files:** EDIT `src/js/ui/controls.js`

**Acceptance Criteria:**
- [ ] `P` key toggles planning mode on/off
- [ ] On enter: snapshot created, modal shown
- [ ] On exit: snapshot restored, modal hidden
- [ ] `Escape` key also exits planning mode
- [ ] Shortcut documented in controls

**Test Method:** Press P, verify modal appears and game pauses

---

### Unit 6: Time Machine Slider
**Description:** Implement time slider functionality
**Files:**
- EDIT `src/js/ui/controls.js` (event handlers)
- EDIT `src/js/core/planningMode.js` (time state)

**Acceptance Criteria:**
- [ ] Slider range: 0 to 730 days (2 years)
- [ ] Slider value updates sandbox time
- [ ] Current offset displayed (e.g., "+127 days")
- [ ] Date display shows calendar date at sandbox time
- [ ] Arrow buttons for fine adjustment (±1 day, ±7 days)
- [ ] Slider position persists during planning session

**Test Method:** Move slider, verify date display updates

---

### Unit 7: Celestial Body Position Update
**Description:** Update celestial positions based on sandbox time
**Files:**
- EDIT `src/js/core/planningMode.js` (update function)
- EDIT `src/js/data/celestialBodies.js` (accept time parameter)

**Acceptance Criteria:**
- [ ] `updateCelestialPositions()` accepts optional time parameter
- [ ] In planning mode, bodies positioned at sandbox time
- [ ] Planets visibly move when slider changes
- [ ] Moon positions correct (transformed from parent)

**Test Method:** Open planning, move slider, verify planets move

---

### Unit 8: Trajectory Prediction in Planning
**Description:** Generate predicted trajectory from sandbox state
**Files:** EDIT `src/js/core/planningMode.js`

**Acceptance Criteria:**
- [ ] Trajectory uses snapshot ship's orbital elements
- [ ] Trajectory starts from sandbox time
- [ ] Changing slider regenerates trajectory
- [ ] Trajectory hash includes sandbox time for cache validity

**Test Method:** Open planning, verify trajectory renders from ship position

---

### Unit 9: Ghost Planet Integration
**Description:** Make ghost planets work with sandbox time
**Files:**
- EDIT `src/js/core/planningMode.js`
- EDIT `src/js/lib/intersectionDetector.js` (verify time handling)

**Acceptance Criteria:**
- [ ] Ghost planets show at correct positions for sandbox time
- [ ] Moving time slider updates ghost positions
- [ ] Ghost time labels relative to sandbox time (not live time)
- [ ] "CLOSE" indicator still works correctly

**Test Method:** Open planning, move slider, verify ghosts update correctly

---

### Unit 10: Mode Toggle (Fixed Ship / Drift)
**Description:** Implement Fixed Ship and Drift modes
**Files:** EDIT `src/js/core/planningMode.js`

**Acceptance Criteria:**
- [ ] FIXED mode: ship stays at snapshot position, planets move
- [ ] DRIFT mode: ship follows orbit as time advances (no thrust)
- [ ] Toggle buttons switch between modes
- [ ] Trajectory updates when mode changes
- [ ] Default mode is FIXED

**Test Method:** Toggle mode, verify ship behavior changes

---

### Unit 11: Coordinate Readout
**Description:** Display ship coordinates in Planning Mode
**Files:**
- EDIT `src/js/ui/uiUpdater.js`
- EDIT `src/index.html` (coordinate display element)

**Acceptance Criteria:**
- [ ] Shows X, Y, Z coordinates in AU
- [ ] Updates when time slider moves (in DRIFT mode)
- [ ] Updates when ship position changes
- [ ] Formatted to 3 decimal places

**Test Method:** Open planning, verify coordinates display and update

---

### Unit 12: UI State Synchronization
**Description:** Ensure all UI elements sync with planning state
**Files:** EDIT `src/js/ui/uiUpdater.js`

**Acceptance Criteria:**
- [ ] Time display shows sandbox date when in planning mode
- [ ] Sail settings display current (snapshot) values
- [ ] No flickering or stale values
- [ ] UI updates on slider change

**Test Method:** Full walkthrough of planning mode features

---

### Unit 13: Exit and Restore
**Description:** Clean exit from Planning Mode
**Files:** EDIT `src/js/core/planningMode.js`

**Acceptance Criteria:**
- [ ] Close button calls exit function
- [ ] Escape key calls exit function
- [ ] Snapshot fully restored on exit
- [ ] Live game resumes at exact state before planning
- [ ] No trajectory artifacts from planning

**Test Method:** Enter planning, change settings, exit, verify state restored

---

### Unit 14: Edge Cases and Polish
**Description:** Handle edge cases and improve UX
**Files:** Multiple (as needed)

**Acceptance Criteria:**
- [ ] SOI state handled correctly (ship in Earth orbit, etc.)
- [ ] Very long time ranges don't cause performance issues
- [ ] Modal prevents interaction with background
- [ ] Loading state shown during trajectory calculation
- [ ] Helpful tooltips added

**Test Method:** Test with ship in various orbital states

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Ghost planet bugs | High | High | Careful testing of intersection detection with time offset; compare with Flight mode results |
| State leakage | Medium | High | Deep clone all objects; write snapshot/restore tests |
| Performance with long time | Medium | Medium | Limit trajectory resolution for planning; add loading indicator |
| UI complexity overwhelming | Low | Medium | Start with minimal UI; add features incrementally |
| Canvas rendering conflicts | Low | Medium | Use same render functions; only change time input |

## 5. Testing Strategy

### 5.1 Unit Tests (Console)
- `planningMode.createSnapshot()` / `restoreSnapshot()` round-trip
- Time slider value → sandbox date calculation
- Trajectory hash includes sandbox time

### 5.2 Integration Tests (Manual)
- Enter planning → exit → verify no state change
- Move time slider → verify planets move
- Change mode → verify ship behavior
- Ghost planets correct at various time offsets

### 5.3 Manual Verification
- [ ] Full workflow: Enter planning, find launch window, exit
- [ ] Ghost planets match Flight mode results at t=0
- [ ] Performance acceptable with 2-year time range
- [ ] All keyboard shortcuts work
- [ ] Modal prevents background interaction

## 6. Implementation Order

Recommended sequence for minimal viable product:

1. **Unit 1** (State Foundation) - Required for everything
2. **Unit 2** (HTML) - Need structure before styling
3. **Unit 3** (CSS) - Style the structure
4. **Unit 5** (Keyboard) - Need way to enter planning
5. **Unit 4** (Game Loop) - Now can pause game
6. **Unit 6** (Time Slider) - Core planning feature
7. **Unit 7** (Celestial Update) - Planets move with slider
8. **Unit 8** (Trajectory) - Ship path updates
9. **Unit 9** (Ghost Planets) - Critical feature
10. **Unit 10** (Mode Toggle) - Fixed vs Drift
11. **Unit 11** (Coordinates) - Helpful display
12. **Unit 12** (UI Sync) - Polish
13. **Unit 13** (Exit/Restore) - Clean exit
14. **Unit 14** (Edge Cases) - Final polish

## 7. Open Decisions

### Resolved:
- **Modal vs Tab:** Modal chosen - provides clear separation, immersive planning experience
- **Time Range:** 0-730 days (matches existing trajectory config)
- **Default Mode:** FIXED (ship stays put, planets move)

### Deferred (out of scope for spike):
- Position Mode (manual ship placement) - Future enhancement
- Sail adjustment in planning mode - Future enhancement (currently view-only)
- Multiple mission plans / saving - Future enhancement
