# Course Refinement Implementation Plan

**Date:** 2026-02-04
**Status:** Approved with Conditions (Review findings F1, FM1 addressed)

## 0. File Impact Summary

### Files to EDIT:
1. `src/js/core/gameState.js` - Add transit state tracking
2. `src/js/core/navigation.js` - Track applied course, detect refinement mode
3. `src/js/lib/course-solver.js` - Add refinement search mode (narrow bounds, seed-centered)
4. `src/js/ui/controls.js` - Update button text to show refinement mode

### Files to CREATE:
- `reports/course-refinement-review-2026-02-04.md` - Review documentation
- `reports/course-refinement-verification-2026-02-04.md` - Verification report

### Files to DELETE:
- None

## 1. Problem Statement

### 1.1 Description

When a player computes and applies a course to a destination, the trajectory inevitably drifts slightly from the solver's prediction due to:
- Orbital mechanics approximations
- Accumulated numerical precision errors
- Time passage changing relative positions

Currently, re-computing a course starts from scratch with a full 91-point coarse grid search. This is inefficient when the player only needs a small adjustment to their existing course.

### 1.2 Root Cause

The course solver has no concept of "current state" - it always explores the full parameter space regardless of whether the player already has a reasonable course set.

### 1.3 Constraints

- Must not regress existing full-search functionality
- UI must clearly indicate when refinement mode is active
- Refinement must still find good solutions (not get stuck in local optima)
- Must handle destination changes gracefully (switch back to full search)

## 2. Solution Architecture

### 2.1 High-Level Design

```
┌─────────────────────────────────────────────────────────────────┐
│                      Transit State Tracking                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ transitState = {                                          │   │
│  │   active: boolean,         // Course has been applied     │   │
│  │   destination: string,     // Target at time of apply     │   │
│  │   appliedCourse: {         // Settings when applied       │   │
│  │     yawDeg, pitchDeg, deployment                          │   │
│  │   },                                                      │   │
│  │   appliedAt: number        // Julian date when applied    │   │
│  │ }                                                         │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Refinement Mode Detection                     │
│                                                                  │
│  isRefinementMode() returns true when:                           │
│    1. transitState.active === true                               │
│    2. Current destination === transitState.destination           │
│    3. Current sail settings within ±20° of applied course        │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Course Solver (Modified)                       │
│                                                                  │
│  solveCourse(ship, target, {                                     │
│    refinementMode: true,                                         │
│    seedSettings: { yawDeg, pitchDeg, deployment }                │
│  })                                                              │
│                                                                  │
│  If refinementMode:                                              │
│    - Skip coarse sweep                                           │
│    - Start fine search centered on seedSettings                  │
│    - Use ±15° yaw, ±10° pitch bounds around seed                 │
│    - Single horizon (use current trajectory duration)            │
│    - Still apply ultra-fine + gradient descent polish            │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Design Principles

1. **Automatic Detection**: Refinement mode activates automatically when conditions are met
2. **Conservative Bounds**: Refinement searches ±15° yaw, ±10° pitch (not too narrow)
3. **Escape Hatch**: Full coarse search still available for major course changes
4. **Clear UI Feedback**: Button shows "REFINE COURSE" vs "PLOT COURSE"

### 2.3 Key Algorithm

**Refinement Search (Replaces Coarse Sweep)**

```javascript
async function refinementSearch(ship, target, seedSettings, options) {
    const { yawDeg, pitchDeg } = seedSettings;

    // Narrower bounds centered on current settings
    const refineBounds = {
        yawMin: Math.max(-60, yawDeg - 15),
        yawMax: Math.min(60, yawDeg + 15),
        pitchMin: Math.max(-30, pitchDeg - 10),
        pitchMax: Math.min(30, pitchDeg + 10)
    };

    // Grid search at 2° resolution (instead of 5°)
    // This gives ~120 evaluations in the ±15° x ±10° window
    const candidates = [];
    for (let yaw = refineBounds.yawMin; yaw <= refineBounds.yawMax; yaw += 2) {
        for (let pitch = refineBounds.pitchMin; pitch <= refineBounds.pitchMax; pitch += 2) {
            candidates.push({ yaw, pitch });
        }
    }

    // Evaluate and return sorted by distance
    // ... (same as coarse sweep evaluation)
}
```

## 3. Units of Work

### Unit 1: Add Transit State to gameState.js
**Description:** Add state object to track when a course has been applied and with what settings.
**Files:** `src/js/core/gameState.js`
**Acceptance Criteria:**
- [ ] `transitState` object exists with active, destination, appliedCourse, appliedAt fields
- [ ] `setTransitState(destination, course)` function works
- [ ] `clearTransitState()` function works
- [ ] `getTransitState()` function works
- [ ] State clears when destination changes
**Test Method:** Console: `import { getTransitState } from './core/gameState.js'; getTransitState()`

### Unit 2: Track Applied Course in navigation.js
**Description:** Update `applyComputedCourse()` to record transit state when course is applied.
**Files:** `src/js/core/navigation.js`
**Acceptance Criteria:**
- [ ] `applyComputedCourse()` calls `setTransitState()` with destination and course
- [ ] Transit state is set after successful course application
**Test Method:** Apply a course, verify `getTransitState().active === true`

### Unit 3: Add Refinement Mode Detection
**Description:** Add function to detect when refinement mode should be used.
**Files:** `src/js/core/navigation.js`
**Acceptance Criteria:**
- [ ] `isRefinementMode()` returns true when transit active AND same destination
- [ ] `isRefinementMode()` returns false when destination changed
- [ ] `isRefinementMode()` returns false when no transit active
- [ ] **(F1)** Returns false if current sail settings differ from applied course by >20° (manual adjustment detection)
**Test Method:** Apply course, check `isRefinementMode()` returns true; manually adjust sails >20°, verify returns false

### Unit 4: Add Refinement Search Mode to Course Solver
**Description:** Add `refinementSearch()` function and integrate with main solver.
**Files:** `src/js/lib/course-solver.js`
**Acceptance Criteria:**
- [ ] `solveCourse()` accepts `refinementMode` and `seedSettings` options
- [ ] When `refinementMode: true`, uses narrower search bounds
- [ ] Refinement search evaluates ~120 candidates (vs ~91 for coarse)
- [ ] Still applies ultra-fine and gradient descent polish
- [ ] Returns same solution format as full search
**Test Method:** Call `solveCourse()` with refinementMode, verify faster completion and similar quality

### Unit 5: Integrate Refinement Mode with computeOptimalCourse
**Description:** Update `computeOptimalCourse()` to automatically use refinement mode when appropriate.
**Files:** `src/js/core/navigation.js`
**Acceptance Criteria:**
- [ ] Checks `isRefinementMode()` before computing
- [ ] Passes `refinementMode: true` and `seedSettings` to solver when appropriate
- [ ] Logs whether refinement or full mode was used
**Test Method:** Apply course, re-run "PLOT COURSE", verify log shows refinement mode

### Unit 6: Update UI to Show Refinement Mode
**Description:** Change button text to indicate when refinement mode is active.
**Files:** `src/js/ui/controls.js`
**Acceptance Criteria:**
- [ ] Button shows "REFINE COURSE" when `isRefinementMode()` returns true
- [ ] Button shows "PLOT COURSE" when full search will be used
- [ ] Button text updates dynamically when transit state changes
**Test Method:** Apply course, verify button changes to "REFINE COURSE"

### Unit 7: Clear Transit State on Destination Change
**Description:** Ensure transit state clears when player selects a new destination.
**Files:** `src/js/core/navigation.js` or `src/js/ui/controls.js`
**Acceptance Criteria:**
- [ ] Selecting new destination calls `clearTransitState()`
- [ ] Button reverts to "PLOT COURSE" after destination change
**Test Method:** Apply course to Mars, change destination to Venus, verify "PLOT COURSE" shown

### Unit 8: Clear Transit State on Arrival (FM1)
**Description:** Clear transit state when player enters destination's SOI.
**Files:** `src/js/core/shipPhysics.js` (SOI transition handler)
**Acceptance Criteria:**
- [ ] When ship enters destination's SOI, `clearTransitState()` is called
- [ ] Transit state cleared on arrival prevents stale refinement mode
**Test Method:** Apply course, fast-forward to arrival, verify transit state is cleared

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Refinement gets stuck in local minimum | Medium | Medium | Use ±15° bounds (wide enough to escape), keep gradient descent |
| UI button state out of sync | Low | Low | Derive button text from state, don't cache |
| Transit state persists incorrectly | Low | Medium | Clear on destination change, arrival, and manual sail adjustment |
| Performance regression from extra state checks | Very Low | Low | State checks are O(1), negligible cost |

## 5. Testing Strategy

### 5.1 Unit Tests
- Transit state get/set/clear functions
- Refinement mode detection logic
- Solver bounds calculation

### 5.2 Integration Tests
- Full workflow: plot course → apply → change settings slightly → re-plot → verify refinement used
- Destination change clears transit state

### 5.3 Manual Verification
1. Plot course to Mars, apply, wait 10 game-days
2. Re-plot course - should show "REFINE COURSE" and complete faster
3. Verify refined course is similar quality (close intercept)
4. Change destination to Venus - should show "PLOT COURSE"
5. Change back to Mars - should show "PLOT COURSE" (transit cleared)
