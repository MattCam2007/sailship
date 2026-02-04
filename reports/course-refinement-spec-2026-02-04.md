# Course Refinement Feature Specification

**Date:** 2026-02-04
**Status:** Draft

## 1. Executive Summary

Implement a course refinement capability that allows players to fine-tune their trajectory during transit. When recalculating a course while actively following a previously computed course, the solver will use the current sail settings as a starting point for optimization rather than performing a full grid search. This enables efficient mid-course corrections as the ship approaches its destination.

## 1.1 Estimated File Impact

### Files to EDIT:
- `src/js/lib/course-solver.js` - Add refinement-mode search starting from current settings
- `src/js/core/gameState.js` - Add transit state tracking (course applied, target, settings)
- `src/js/core/navigation.js` - Integrate transit state with course application
- `src/js/ui/controls.js` - Update UI to show refinement mode and status

### Files to CREATE:
- `reports/course-refinement-implementation-plan-2026-02-04.md` - Implementation plan
- `reports/course-refinement-review-2026-02-04.md` - Review document

## 2. Current State Analysis

### 2.1 Existing Systems

| System | Location | Purpose |
|--------|----------|---------|
| Course Solver | `src/js/lib/course-solver.js` | Multi-phase optimization for sail settings |
| Navigation | `src/js/core/navigation.js` | Destination tracking, course application |
| Game State | `src/js/core/gameState.js` | Time management, display options, course precision window |
| UI Controls | `src/js/ui/controls.js` | Button handlers, solver invocation |

### 2.2 Data Flow

```
User clicks "PLOT COURSE"
    → computeOptimalCourse() in controls.js
    → solveCourse() in course-solver.js (FULL grid search)
    → displayCourseResult() shows recommendation

User clicks "APPLY COURSE"
    → applyComputedCourse() in navigation.js
    → Updates ship.sail.angle, pitchAngle, deploymentPercent
    → markCourseApplied() for precision tracking

CURRENTLY: Re-plotting course always starts from scratch
```

### 2.3 Relevant Code

**Course Solver Entry Point** (`course-solver.js:1033-1059`):
```javascript
export async function solveCourse(ship, target, options = {}, onProgress = null) {
    // Always runs solveWithRefinement which does:
    // 1. Multi-horizon search (180-1460 days)
    // 2. For each horizon: coarse → fine → ultra → gradient descent
    // 3. Iterative refinement if marginal
}
```

**Coarse Sweep** (`course-solver.js:615-645`):
- Sweeps yaw -60° to +60°, pitch -30° to +30° in 5° steps
- ~91 evaluations per horizon
- No concept of "starting point"

**Course Application** (`navigation.js:812-827`):
```javascript
export function applyComputedCourse(course) {
    player.sail.angle = course.yawDeg * Math.PI / 180;
    player.sail.pitchAngle = course.pitchDeg * Math.PI / 180;
    player.sail.deploymentPercent = course.deployment;
}
```

**Precision Window** (`gameState.js:586-597`):
```javascript
export function markCourseApplied() {
    lastCourseApplyTime = Date.now();
}

export function isCourseRecentlyApplied() {
    return Date.now() - lastCourseApplyTime < COURSE_PRECISION_WINDOW_MS;  // 5 minutes
}
```

## 3. Gap Analysis

### 3.1 Missing Capabilities

- [ ] **Transit State Tracking**: No system tracks whether we're actively following a computed course
- [ ] **Course Memory**: When a course is applied, its parameters aren't stored for reference
- [ ] **Refinement Mode**: Solver always does full grid search, can't start from existing settings
- [ ] **UI Indication**: No visual feedback that refinement mode is active

### 3.2 Required Changes

1. **Transit State Object**: Store when a course is applied, to which target, and with what settings
2. **Refinement Search Mode**: New solver mode that:
   - Starts from current sail settings
   - Uses tighter search bounds (±15° instead of ±60°)
   - Skips multi-horizon search (use current trajectory duration)
   - Still applies gradient descent polish
3. **Mode Detection**: Automatically detect when refinement mode should be used:
   - Same destination as applied course
   - Course was applied (transit active)
   - Current sail settings near applied course settings
4. **UI Updates**: Show "REFINE" vs "PLOT COURSE" based on state

## 4. Open Questions

- [x] Should refinement be automatic or user-selectable? **Answer: Automatic when conditions met**
- [x] How tight should refinement bounds be? **Answer: ±15° yaw, ±10° pitch around current**
- [x] Should we allow full recompute during transit? **Answer: Yes, via "FULL RECOMPUTE" button or similar**
- [x] What happens if user changes destination mid-transit? **Answer: Clears transit state, uses full search**
