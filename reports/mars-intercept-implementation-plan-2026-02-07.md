# Mars Intercept Accuracy - Implementation Plan

**Date:** 2026-02-07
**Status:** In Progress

## 0. File Impact Summary

### Files to EDIT:
1. `src/js/lib/intersectionDetector.js` - Add hybrid anchor-refine algorithm, compute angular separation
2. `src/js/ui/renderer.js` - Display early/late indicator on encounter labels
3. `src/js/lib/trajectory-predictor.js` - Upgrade Euler to RK2 midpoint integration
4. `src/js/lib/evaluate-trajectory.js` - Extract shared crossing utilities

### Files to CREATE:
- None

### Files to DELETE:
- None

## 1. Problem Statement

### 1.1 Description
Encounter markers (ghost planets) predict Mars intercept timing inaccurately. Mars arrives at the encounter point before the player.

### 1.2 Root Cause
1. **Wrong radius checked:** Detector uses semi-major axis (1.524 AU) but Mars ranges 1.38-1.67 AU
2. **No directional feedback:** Ghost shows WHERE Mars is, not whether Mars is AHEAD or BEHIND
3. **Trajectory divergence:** Euler integration compounds ~3-10 days error over 200-day transfer
4. **Solver mismatch:** Course solver checks 3 radii, encounter markers check 1

### 1.3 Constraints
- Ghost MUST stay anchored to orbital path (closest-approach-only gives 4 AU ghosts)
- Multi-radius checking causes snapping (winner-switching in deduplication)
- Must work for Venus (e=0.007), Mars (e=0.094), Mercury (e=0.206), Jupiter (e=0.049)

## 2. Solution Architecture

### 2.1 High-Level Design: Hybrid Anchor-Refine

```
Step 1: DETECT crossing at semi-major axis (stable, one per transit)
Step 2: REFINE - look up planet's actual radius at crossing time
Step 3: Search nearby trajectory for crossing at THAT radius
Step 4: Place ghost at planet position at refined time
```

### 2.2 Design Principles
- One detection radius = no deduplication snapping
- One refinement step = no chasing problem
- Ghost anchored to orbit = no 4 AU ghosts
- Angular separation = player knows early/late

### 2.3 Key Algorithms

**Anchor-Refine (Phase 1):**
```
T_nominal = time when trajectory crosses semi-major axis
r_mars = ||getPosition(mars.elements, T_nominal)||  // Mars's actual radius at that time
Search trajectory near T_nominal for crossing at r_mars
T_refined = refined crossing time
Ghost position = getPosition(mars.elements, T_refined)
```

**Early/Late Indicator (Phase 2):**
```
ship_angle = atan2(crossing.y, crossing.x)  // Ship's angle at crossing
mars_angle = atan2(mars.y, mars.x)          // Mars's angle at crossing time
angular_sep = mars_angle - ship_angle       // Positive = Mars ahead, negative = behind
```

**RK2 Midpoint Integration (Phase 3):**
```
// Current Euler: thrust at start, apply for full step
thrust_0 = calculateSailThrust(elements_0, ...)
elements_1 = applyThrust(elements_0, thrust_0, dt, t)

// RK2: thrust at start, propagate to midpoint, recalculate, use for full step
thrust_0 = calculateSailThrust(elements_0, ...)
elements_mid = applyThrust(elements_0, thrust_0, dt/2, t)
pos_mid = getPosition(elements_mid, t + dt/2)
vel_mid = getVelocity(elements_mid, t + dt/2)
thrust_mid = calculateSailThrust(sail, pos_mid, vel_mid, ...)
elements_1 = applyThrust(elements_0, thrust_mid, dt, t)
```

## 3. Units of Work

### Unit 1: Hybrid Anchor-Refine in intersectionDetector.js
**Description:** After detecting semi-major axis crossing, refine timing using planet's actual heliocentric distance.
**Files:** `src/js/lib/intersectionDetector.js`
**Acceptance Criteria:**
- [ ] For near-circular orbits (e < 0.05), no refinement (semi-major axis is accurate enough)
- [ ] For eccentric orbits (e >= 0.05), refine crossing time using planet's actual radius
- [ ] Only one crossing per transit (no snapping)
- [ ] Ghost position uses refined time
- [ ] No performance regression (refinement only runs for detected crossings)
**Test Method:** Visual - Mars ghost should match actual Mars arrival more closely. Console tests pass.

### Unit 2: Angular Separation / Early-Late Indicator
**Description:** Compute angular separation between ship and planet at crossing, pass to renderer, display as early/late text.
**Files:** `src/js/lib/intersectionDetector.js`, `src/js/ui/renderer.js`
**Acceptance Criteria:**
- [ ] Each intersection result includes `angularSeparation` (radians) and `isAhead` (boolean)
- [ ] Renderer displays "EARLY" or "LATE" indicator when angular separation > threshold
- [ ] SOI-distance-based "CLOSE" indicator (replaces time-based < 24h check)
**Test Method:** Visual - ghost label shows directional feedback.

### Unit 3: RK2 Midpoint Integration in trajectory-predictor.js
**Description:** Replace Euler integration with midpoint method (RK2) for trajectory prediction.
**Files:** `src/js/lib/trajectory-predictor.js`
**Acceptance Criteria:**
- [ ] Trajectory prediction uses midpoint thrust evaluation
- [ ] Same number of steps, one extra `calculateSailThrust` call per step
- [ ] Predicted trajectory diverges less from actual ship physics
- [ ] No performance regression exceeding 2x (extra thrust call per step is bounded)
**Test Method:** Existing trajectory-predictor tests pass. Visual comparison of predicted vs actual path.

### Unit 4: Solver-Ghost Consistency
**Description:** Ensure evaluate-trajectory.js and intersectionDetector.js use consistent radius logic.
**Files:** `src/js/lib/evaluate-trajectory.js`, `src/js/lib/intersectionDetector.js`
**Acceptance Criteria:**
- [ ] Both systems produce similar crossing times for the same trajectory
- [ ] Computed course intercept matches displayed ghost position
**Test Method:** Console comparison of solver results vs ghost positions.

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Refinement doesn't converge for high eccentricity | Low | Medium | Fallback to unrefined crossing time |
| RK2 breaks edge cases (SOI transitions, extreme flybys) | Low | High | Only apply RK2 to heliocentric non-extreme segments |
| Angular separation confuses players | Medium | Low | Use clear, simple labels ("EARLY 15d", "LATE 8d") |
| Performance regression from extra thrust calls | Low | Medium | RK2 adds 1 extra call per step; refinement is O(crossings) not O(segments) |
