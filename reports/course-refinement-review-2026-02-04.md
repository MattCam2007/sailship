# Course Refinement Review

**Date:** 2026-02-04
**Plan Version:** `reports/course-refinement-implementation-plan-2026-02-04.md`
**Reviewer:** Claude (Multi-perspective)

## 1. Physics/Realism

### Findings

- The refinement feature does not introduce any new physics calculations - it reuses the existing `evaluateCandidate()` function which already implements correct orbital mechanics
- Solar sail thrust model remains unchanged (4.56e-6 N/m² at 1 AU, 1/r² scaling)
- Gauss variational equations for orbit modification are preserved
- The narrower search bounds (±15° yaw, ±10° pitch) are physically reasonable for mid-course corrections

### Concerns

| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| P1 | Nice-to-have | Refinement assumes current settings are near optimal, but accumulated drift might require larger corrections | Keep bounds at ±15°/±10° which is wide enough for typical drift; ±20° would be safer but slower |

**Physics/Realism Score: 9/10** - No physics concerns; existing validated algorithms are reused.

## 2. Functionality

### Findings

- The design correctly detects refinement mode based on transit state and destination match
- Full search remains available as fallback when conditions aren't met
- The 2° grid resolution in refinement mode (~120 evaluations) provides good coverage
- Ultra-fine polish and gradient descent are retained for final precision

### Concerns

| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| F1 | Important | Design doesn't specify what happens if player manually adjusts sails significantly after applying course | Add check: if current sail settings differ from appliedCourse by >20°, use full search |
| F2 | Nice-to-have | Multi-horizon search is skipped in refinement mode, but long-term transfers might need it | Accept this trade-off for speed; user can change destination and back to force full search |
| F3 | Nice-to-have | No "FULL RECOMPUTE" button to force full search while in refinement mode | Could add Shift+Click or separate button; not critical for MVP |

**Functionality Score: 8/10** - Core functionality is sound; F1 should be addressed.

## 3. Architecture

### Findings

- State management follows existing patterns (gameState.js for state, navigation.js for logic)
- Clean separation: transit state in gameState, detection logic in navigation, search logic in course-solver
- UI changes are minimal and localized to controls.js
- No new dependencies or circular imports introduced

### Concerns

| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| A1 | Nice-to-have | Transit state could be part of navigation.js instead of gameState.js since it's navigation-specific | Either location works; gameState.js chosen for consistency with other course tracking (markCourseApplied) |
| A2 | Nice-to-have | `isRefinementMode()` checks could be extracted to a separate function in navigation.js | Plan already specifies this in Unit 3 |

**Architecture Score: 9/10** - Clean design following existing patterns.

## 4. Failure Modes

### Findings

- Transit state has clear lifecycle: set on apply, cleared on destination change
- Refinement bounds are wide enough (±15°/±10°) to handle typical drift scenarios
- Gradient descent polish helps escape local minima in the narrower search space
- UI button state is derived from transit state, not cached separately

### Concerns

| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| FM1 | Important | If player flies past the destination and transit state is still active, refinement might search in wrong direction | Clear transit state when player enters destination SOI or passes crossing point |
| FM2 | Nice-to-have | Very long transits (>1 year) might accumulate enough drift that ±15° bounds are too narrow | For v1, accept this limitation; users can change destination and back to force full search |
| FM3 | Nice-to-have | Transit state persists across page reload (localStorage) or not? | Not critical; could persist for better UX but starting fresh is also acceptable |

**Failure Modes Score: 7/10** - FM1 should be addressed to prevent confusing behavior.

## 5. Summary

### Confidence Rating: 8/10

The plan is well-designed and follows existing patterns. Two concerns should be addressed before implementation:

### Critical Issues (Must Fix)
None

### Important Issues (Should Fix)
1. **F1**: Add check for manual sail adjustment - if current settings differ from applied course by >20°, fall back to full search
2. **FM1**: Clear transit state when player enters destination SOI (arrival detection)

### Recommendations
1. Add sail-drift check to `isRefinementMode()`: compare current sail settings to `appliedCourse`
2. Listen for SOI entry events to clear transit state on arrival
3. Consider persisting transit state to localStorage for session continuity (optional)

### Verdict
[x] Approved with conditions

**Conditions:**
- Implement F1: Manual sail adjustment detection
- Implement FM1: Clear transit state on arrival (SOI entry)
