# Course Plotter Accuracy Fix - Implementation Plan

**Date:** 2026-02-06
**Status:** In Progress
**Based on:** `reports/course-plotter-analysis-2026-02-06.md`

## 0. File Impact Summary

### Files to EDIT:
1. `src/js/lib/course-solver.js` - Fix threshold, early termination, eccentric orbits, phase angle filter, adaptive resolution, verification step
2. `src/js/core/navigation.js` - Add post-apply verification, auto-refine after applying course

### Files to CREATE:
1. `reports/course-plotter-fix-implementation-plan-2026-02-06.md` - This plan
2. `reports/course-plotter-fix-review-2026-02-06.md` - Review report
3. `reports/course-plotter-fix-verification-2026-02-06.md` - Verification report

### Files to DELETE:
- None

## 1. Problem Statement

### 1.1 Description
The course plotter computes courses labeled "INTERCEPT" that don't actually reach the planet's SOI during gameplay. Players follow the computed course but end up with "NEAR MISS" results.

### 1.2 Root Cause
A 2x intercept threshold mismatch between the solver and gameplay, compounded by simulation drift, premature optimization termination, circular-orbit assumptions, and aggressive filtering.

### 1.3 Constraints
- No build system / no npm — vanilla JS only
- Solver must remain responsive (~3-5 seconds)
- Cannot change the fundamental Gauss variational equations approach
- Must maintain backward compatibility with existing test exports

## 2. Solution Architecture

### 2.1 High-Level Design
Seven targeted fixes organized by priority:
- **P0**: Fix the threshold mismatch and early termination (instant accuracy gain)
- **P1**: Add adaptive resolution and post-solve verification (reduce simulation drift)
- **P2**: Improve crossing detection for eccentric orbits and soften phase angle filter
- **P3**: Auto-refine after course application (best possible accuracy)

### 2.2 Design Principles
- **Minimal invasive changes**: Modify existing functions, don't restructure
- **Consistent thresholds**: Solver and gameplay use the same definition of "intercept"
- **Tiered precision**: Coarse search, fine verify — don't slow the whole search
- **Graceful degradation**: If verification fails, warn user rather than crash

### 2.3 Key Algorithms

**Eccentric orbit crossing detection**: Instead of using only `target.elements.a` (semi-major axis), compute perihelion `a*(1-e)` and aphelion `a*(1+e)` radii, then detect crossings at all three radii. Pick the crossing where the ship is closest to the planet's actual position.

**Phase angle penalty**: Replace hard cutoff `angularSep > maxPhaseAngle → skip` with a weighted distance: `effectiveDistance = crossingDistance * (1 + phaseAnglePenalty * angularSep / π)`. This preserves crossing information while penalizing poor timing.

**Adaptive resolution**: During search, use reduced step count (`maxSteps / 2` cap). For the final best candidate, re-evaluate at full resolution (`maxSteps` cap). This gives ~2x speedup during search with no accuracy loss on final result.

**Post-solve verification**: After `solveCourse()` returns, re-run `evaluateCandidate()` at high resolution (2x steps). If the verified distance is worse than the threshold, downgrade the quality label.

## 3. Units of Work

### Unit 1: Fix Intercept Threshold Mismatch
**Description:** Change `getInterceptThreshold()` to return `soi / 2` (matching gameplay's definition) instead of full SOI.
**Files:** `src/js/lib/course-solver.js`
**Acceptance Criteria:**
- [ ] `getInterceptThreshold()` returns `soi / 2` for all planets
- [ ] Comment updated to explain the rationale
**Test Method:** Read the function, verify return value

### Unit 2: Tighten Nelder-Mead Early Termination
**Description:** Change early termination in Nelder-Mead and solveForHorizon to use `interceptThreshold / 2` (SOI/4) so the optimizer continues refining past the first "good enough" solution.
**Files:** `src/js/lib/course-solver.js`
**Acceptance Criteria:**
- [ ] Nelder-Mead early termination uses `interceptThreshold / 2`
- [ ] solveForHorizon early terminations use `interceptThreshold / 2`
- [ ] Reconnaissance early termination uses `interceptThreshold / 2`
**Test Method:** Read the code, verify thresholds

### Unit 3: Add Adaptive Step Resolution
**Description:** During search phases (recon, Nelder-Mead), use a reduced maxSteps cap for speed. For final evaluation, use full resolution.
**Files:** `src/js/lib/course-solver.js`
**Acceptance Criteria:**
- [ ] New config value `searchMaxSteps` = 3000 (half of 6000)
- [ ] `solveForHorizon` passes reduced maxSteps during search
- [ ] Final best result is re-evaluated at full resolution
- [ ] Re-evaluation result replaces search result
**Test Method:** Console log step counts during search vs. verification

### Unit 4: Add Post-Solve High-Resolution Verification
**Description:** After `solveCourse()` finds the best result, re-evaluate at 2x the normal step count. If verified distance is worse than threshold, downgrade quality label. Attach verification data to solution.
**Files:** `src/js/lib/course-solver.js`
**Acceptance Criteria:**
- [ ] Verification runs after best result is selected
- [ ] Solution includes `verification` field with verified distance
- [ ] Quality label reflects verified distance, not search distance
- [ ] Log output shows verified vs. search distance
**Test Method:** Console logs during course computation show verification step

### Unit 5: Handle Eccentric Orbits in Crossing Detection
**Description:** Compute crossings at perihelion, semi-major axis, and aphelion radii. Evaluate all crossings against actual planet position and keep the best.
**Files:** `src/js/lib/course-solver.js`
**Acceptance Criteria:**
- [ ] `evaluateCandidate` computes target eccentricity
- [ ] For `e > 0.05`, crossings detected at perihelion, a, and aphelion
- [ ] All crossings evaluated; best (closest to planet) selected
- [ ] Near-circular orbits (e ≤ 0.05) unchanged (single radius)
**Test Method:** Manual test targeting Mercury (e=0.2056) — should show more crossings in logs

### Unit 6: Soften Phase Angle Filter
**Description:** Replace the hard phase angle cutoff with a penalty-weighted distance. Crossings beyond 45° are penalized but not discarded.
**Files:** `src/js/lib/course-solver.js`
**Acceptance Criteria:**
- [ ] New config value `phaseAnglePenaltyFactor` (default 2.0)
- [ ] Crossings within `maxPhaseAngle` are unpenalized
- [ ] Crossings beyond `maxPhaseAngle` have distance multiplied by penalty
- [ ] No crossing data is discarded
**Test Method:** Test long-transfer targets where crossings exceed 45° — should use crossing data instead of fallback

### Unit 7: Auto-Refine After Applying Course
**Description:** After `applyComputedCourse()`, run a fast verification check. If the verified distance exceeds the intercept threshold, log a warning and store it for UI display.
**Files:** `src/js/core/navigation.js`
**Acceptance Criteria:**
- [ ] `applyComputedCourse` triggers verification after applying
- [ ] Verification uses `evaluateCandidate` at high resolution
- [ ] Warning logged if verification shows worse distance than predicted
- [ ] Verification result stored on the course object for UI access
**Test Method:** Apply a course, check console for verification log

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Tighter thresholds → solver finds fewer "INTERCEPT" results | Medium | Low | This is correct behavior — solver should be honest about quality |
| Adaptive resolution → slight overhead from re-evaluation | Low | Low | Only one extra evaluation at full res, negligible time |
| Eccentric orbit crossings → more crossings to evaluate | Low | Low | At most 3x crossings, still O(n) per evaluation |
| Phase angle penalty → changes existing solver behavior | Medium | Medium | Penalty factor tuned conservatively (2.0); within maxPhaseAngle behavior unchanged |
| Post-apply verification → delays course application | Low | Low | Verification is synchronous single evaluation, <50ms |

## 5. Testing Strategy

### 5.1 Console Tests
- Run existing test suites (orbital, trajectory-predictor, intersection detector) to verify no regressions

### 5.2 Manual Verification
- Start game, set destination to Mars
- Compute course, apply it
- Verify console shows verification step
- Time-warp and observe if ship actually enters Mars SOI
- Repeat for Mercury (eccentric orbit test) and Jupiter (large SOI test)

### 5.3 Regression
- Existing encounter markers should still work
- Predicted path display should be unaffected
- Navigation panel intercept status should be consistent with solver's quality label
