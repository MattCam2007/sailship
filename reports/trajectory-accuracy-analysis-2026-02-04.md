# Trajectory Prediction Accuracy Analysis

**Date:** 2026-02-04
**Issue:** Planet arrives at intercept point before player
**Context:** Recent crossing-aware course solver v3.0 implementation

## Problem Statement

At extreme zoom, the ghost planet (showing predicted intercept) reaches the crossing point before the player's ship does. The player expected simultaneous arrival but arrived late.

## Root Cause Analysis

After investigating the code, I identified **5 key issues** causing timing discrepancies between what the course solver computes and what the player experiences.

---

## Issue #1: Resolution Mismatch Between Course Solver and Display Systems

### Finding
The course solver and intersection detector use **different trajectory resolutions**:

| System | Steps | Duration | Time per Step |
|--------|-------|----------|---------------|
| Course Solver | 1000 | 365+ days | **~8.76 hours** |
| Intersection Detector | up to 6000 | configurable | **~2 hours** (at 12 steps/day) |
| Renderer | up to 1500 | configurable | ~2 hours |

**Location:** `course-solver.js:55` vs `config.js:286`

### Impact
The course solver optimizes for crossing times calculated at **8.76-hour resolution**, but the ghost planets are displayed using crossing times from the intersection detector at **2-hour resolution**. These times differ by up to ±4 hours.

At close approach speeds of ~0.5 AU/day, a 4-hour error = **0.08 AU positional error**.

### Recommendation #1
**Increase course solver simulation resolution to match intersection detector.**

```javascript
// course-solver.js - Change CONFIG.defaultSteps
const CONFIG = {
    // ...
    defaultSteps: 2000,  // Was 1000, now matches ~12 steps/day for 180-day horizon
    // Or better: calculate dynamically based on duration
}
```

Or use the same formula as intersection detector:
```javascript
const steps = Math.min(6000, Math.round(maxDays * 12));
```

---

## Issue #2: Linear vs Quadratic Interpolation for Crossing Time

### Finding
The course solver uses **linear interpolation** to calculate crossing time:

```javascript
// course-solver.js:173-180 (findRadiusCrossingsInTrajectory)
const radialDiff = r2 - r1;
t = (targetRadius - r1) / radialDiff;  // LINEAR!
```

But the intersection detector uses **bisection refinement + quadratic solving**:

```javascript
// intersectionDetector.js:454-455
if (REFINEMENT_CONFIG.enabled) {
    return refineCrossingBisection(p1, p2, targetRadius);  // 10 iterations of bisection!
}
```

### Impact
Linear interpolation assumes radius changes linearly along a trajectory segment, but the actual path is curved. This introduces systematic error, especially on longer time steps.

For an 8.76-hour step with orbital motion:
- Planet travels ~0.01-0.02 AU along its orbit
- Curvature error in linear interpolation: ~1-5% of step
- Time error: ~5-30 minutes

### Recommendation #2
**Use quadratic solving or bisection for crossing time in course solver.**

Add the same refinement function from `intersectionDetector.js` to `course-solver.js`:

```javascript
function refineCrossingTime(p1, p2, targetRadius) {
    // Quadratic solve: ||P(t)||² = R²
    const dx = p2.x - p1.x, dy = p2.y - p1.y, dz = p2.z - p1.z;
    const a = dx*dx + dy*dy + dz*dz;
    const b = 2 * (p1.x*dx + p1.y*dy + p1.z*dz);
    const r1sq = p1.x*p1.x + p1.y*p1.y + p1.z*p1.z;
    const c = r1sq - targetRadius*targetRadius;

    const disc = b*b - 4*a*c;
    if (disc < 0 || a < 1e-20) return null;

    const t1 = (-b - Math.sqrt(disc)) / (2*a);
    const t2 = (-b + Math.sqrt(disc)) / (2*a);

    return (t1 >= 0 && t1 <= 1) ? t1 : (t2 >= 0 && t2 <= 1) ? t2 : null;
}
```

---

## Issue #3: Trajectory Not Shared Between Systems

### Finding
The course solver and intersection detector compute trajectories **independently**:

- Course solver builds trajectory internally in `evaluateCandidate()` (lines 286-355)
- Intersection detector receives trajectory from `main.js` via `predictTrajectory()` (line 141)
- These are completely separate trajectory computations

### Impact
Even with identical inputs, numerical floating-point differences accumulate over hundreds of steps. By the time both systems compute a crossing point 200+ days in the future, the positions can differ by kilometers.

### Recommendation #3
**Consider having the course solver use the exact same trajectory that the intersection detector uses, or at minimum ensure identical parameters.**

Option A: Export the solver's trajectory for display:
```javascript
// In course-solver.js
export function getCandidateTrajectory(yawDeg, pitchDeg, ship, target, options) {
    // Returns the trajectory array used during evaluation
}
```

Option B: Have the solver call the intersection detector's crossing-finding function:
```javascript
import { findOrbitalPlaneCrossing } from './intersectionDetector.js';
```

---

## Issue #4: Ghost Planet Shows Detector's Crossing Time, Not Solver's

### Finding
The workflow is:

1. Course solver finds optimal settings, computes crossing time T₁
2. User applies settings via "APPLY COURSE"
3. Intersection detector computes new trajectory, finds crossing time T₂
4. Ghost planet rendered at time T₂

T₁ ≠ T₂ due to Issues #1-3 above.

### Impact
The solver may have optimized for the planet being at position P₁ at time T₁, but the ghost shows the planet at position P₂ at time T₂. If T₂ < T₁, the ghost "arrives early" from the player's perspective.

### Recommendation #4
**Store and display the solver's computed crossing time alongside/instead of the detector's.**

Add to the course solution object:
```javascript
return {
    // ... existing fields
    computedCrossingTime: bestCrossing.time,  // Julian date
    computedCrossingPosition: bestCrossing.position,
    computedPlanetPosition: planetPos
}
```

Then either:
- Display this as the "target intercept point" instead of the detector's ghost
- Or show both and let user see the discrepancy

---

## Issue #5: Extreme Zoom Magnifies Small Errors

### Finding
The intersection detector has **zoom-adaptive precision**:

```javascript
// intersectionDetector.js:57-70
const REFINEMENT_CONFIG = {
    bisectionIterationsHigh: 10,  // At high zoom: ~25 second precision
    bisectionIterationsLow: 4,    // At low zoom: ~27 minute precision
    zoomThreshold: 2.0,
}
```

At low zoom, crossing times have ~27 minute precision. This is fine for system-level visualization but problematic when user zooms in to verify intercept.

### Impact
User sets up intercept at system zoom (low precision), then zooms in to watch the intercept. At high zoom, the rough approximation becomes visually obvious—planet and ship don't converge at the same point.

### Recommendation #5
**Force high precision for intersection detection when course solver is active or recently used.**

```javascript
function getBisectionIterations() {
    // If user recently applied a course solution, use high precision
    // regardless of zoom level
    if (recentlyAppliedCourse && Date.now() - lastCourseApplyTime < 300000) {
        return REFINEMENT_CONFIG.bisectionIterationsHigh;
    }

    const zoom = camera?.zoom ?? 1;
    return zoom < REFINEMENT_CONFIG.zoomThreshold
        ? REFINEMENT_CONFIG.bisectionIterationsLow
        : REFINEMENT_CONFIG.bisectionIterationsHigh;
}
```

---

## Summary of Recommendations

| # | Issue | Fix | Impact | Effort |
|---|-------|-----|--------|--------|
| 1 | Resolution mismatch | Increase solver steps to match detector | High | Low |
| 2 | Linear vs quadratic interpolation | Add quadratic solving to course solver | High | Medium |
| 3 | Separate trajectory computation | Share trajectory or match parameters | Medium | Medium |
| 4 | Different crossing times shown | Display solver's crossing time | Medium | Low |
| 5 | Zoom-adaptive precision | Force high precision after course apply | Low | Low |

## Recommended Implementation Order

1. **Quick win:** #1 (increase steps) + #5 (force precision) — immediate accuracy improvement
2. **Core fix:** #2 (quadratic interpolation) — eliminates systematic error
3. **Integration:** #4 (show solver's time) — ensures displayed info matches optimization
4. **Complete solution:** #3 (shared trajectory) — eliminates all discrepancies

## Files to Modify

- `src/js/lib/course-solver.js` — Recommendations #1, #2
- `src/js/lib/intersectionDetector.js` — Recommendation #5
- `src/js/ui/controls.js` — Recommendation #4 (display solver's crossing info)
- `src/js/config.js` — Recommendation #1 (update defaults)

---

*Analysis by Claude | Session: 012kBVJ9bSqxFxNBSjcPRToB*
