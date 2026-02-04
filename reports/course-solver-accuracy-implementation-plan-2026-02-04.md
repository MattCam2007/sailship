# Course Solver Accuracy Improvements Implementation Plan

**Date:** 2026-02-04
**Status:** In Progress
**Feature:** Enhanced Course Solver for Improved Intercept Accuracy

## 0. File Impact Summary

### Files to EDIT:
1. `src/js/lib/course-solver.js` - Core algorithm improvements (all 6 changes)
2. `src/js/config.js` - Extend trajectory config to 5 years (1825 days)
3. `src/index.html` - Update UI slider max and add presets for 3yr, 5yr
4. `src/js/ui/controls.js` - Update trajectory duration display formatting
5. `src/js/core/navigation.js` - Align navigation prediction with new config

### Files to CREATE:
1. `reports/course-solver-accuracy-verification-2026-02-04.md` - Verification report

### Files to DELETE:
- None

## 1. Problem Statement

### 1.1 Description
The current course solver achieves a closest approach of 0.1586 AU to Venus, which is classified as "MARGINAL" (0.05-0.2 AU). This is insufficient for gameplay intercepts which require < 0.01 AU.

### 1.2 Root Cause
Multiple limitations in the search algorithm:
1. **Coarse grid too sparse**: 10° steps miss narrow optima between grid points
2. **Ultra-fine window too small**: ±0.5° can't escape local optima
3. **Fixed 365-day horizon**: May miss optimal phase alignments
4. **Low simulation resolution**: 200 steps over 365 days = 1.825 days/step
5. **No continuous optimization**: Grid search can't find values between grid points
6. **No iterative refinement**: Single-pass search doesn't retry with expanded bounds

### 1.3 Constraints
- User accepts longer compute time (30-60 seconds acceptable)
- Must maintain non-blocking UI (async with yields)
- Must align with trajectory predictor for consistency
- Should use 800-1000 simulation steps for solar sail accuracy

## 2. Solution Architecture

### 2.1 High-Level Design

Implement 6 improvements to the course solver:

```
┌─────────────────────────────────────────────────────────────────────┐
│  ENHANCED COURSE SOLVER                                             │
├─────────────────────────────────────────────────────────────────────┤
│  1. DENSER COARSE SWEEP (5° → 325 evaluations)                     │
│  2. MULTI-HORIZON SEARCH (180, 365, 540, 730, 1095, 1460 days)     │
│  3. GRADIENT DESCENT POLISH (50 iterations post-grid)              │
│  4. HIGH SIMULATION RESOLUTION (1000 steps)                        │
│  5. EXPANDED ULTRA-FINE WINDOW (±2° at 0.1° steps)                 │
│  6. ITERATIVE REFINEMENT (retry with expanded bounds if marginal)  │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Design Principles
- **Accuracy over speed**: User accepts 30-60 second compute time
- **Solar sail physics**: High step count (1000) for accurate thrust integration
- **Consistency**: Course solver matches trajectory predictor behavior
- **Graceful degradation**: Early termination on intercept found

### 2.3 Key Algorithms

#### Gradient Descent Polish
```javascript
for (let i = 0; i < maxIterations; i++) {
    // Compute numerical gradient
    const dYaw = (eval(yaw + h) - eval(yaw - h)) / (2 * h);
    const dPitch = (eval(pitch + h) - eval(pitch - h)) / (2 * h);

    // Update with adaptive learning rate
    yaw -= learningRate * dYaw;
    pitch -= learningRate * dPitch;

    // Reduce learning rate if no improvement
    if (newDist >= bestDist) learningRate *= 0.5;
}
```

#### Multi-Horizon Search
```javascript
const horizons = [180, 365, 540, 730, 1095, 1460]; // up to 4 years
let overallBest = { minDistance: Infinity };

for (const maxDays of horizons) {
    const result = await solveCourseForHorizon(ship, target, { maxDays });
    if (result.minDistance < overallBest.minDistance) {
        overallBest = { ...result, horizonDays: maxDays };
    }
    if (result.minDistance < interceptThreshold) break;
}
```

## 3. Units of Work

### Unit 1: Update Trajectory Config to 5 Years
**Description:** Extend trajectory prediction maximum from 730 days to 1825 days (5 years)
**Files:** `src/js/config.js`, `src/index.html`, `src/js/ui/controls.js`
**Acceptance Criteria:**
- [ ] `maxDays` in config changed to 1825
- [ ] HTML slider max updated to 1825
- [ ] Preset buttons added for 3yr (1095) and 5yr (1825)
- [ ] Duration display formats years correctly (e.g., "3yr", "5yr")
- [ ] Slider step adjusted for smooth 5-year range
**Test Method:** Open game, verify slider goes to 5 years, verify presets work

### Unit 2: Denser Coarse Sweep (5° resolution)
**Description:** Change coarse grid from 10° to 5° steps
**Files:** `src/js/lib/course-solver.js`
**Acceptance Criteria:**
- [ ] `coarseStep` changed from 10 to 5
- [ ] Coarse sweep now evaluates ~325 candidates (25 yaw × 13 pitch)
- [ ] Phase 1 progress callback still works correctly
**Test Method:** Run PLOT COURSE, verify progress bar reflects more evaluations

### Unit 3: High Simulation Resolution (1000 steps)
**Description:** Increase simulation steps from 200 to 1000 for solar sail accuracy
**Files:** `src/js/lib/course-solver.js`
**Acceptance Criteria:**
- [ ] `defaultSteps` changed from 200 to 1000
- [ ] Trajectory simulation captures thrust changes at ~8.5 hour intervals (for 365 days)
- [ ] No performance degradation beyond acceptable (evaluation time ~10-20ms each)
**Test Method:** Run PLOT COURSE, verify results are more accurate

### Unit 4: Expanded Ultra-Fine Window (±2°)
**Description:** Expand ultra-fine search from ±0.5° to ±2° to escape local optima
**Files:** `src/js/lib/course-solver.js`
**Acceptance Criteria:**
- [ ] `ultraRadius` changed from 0.5 to 2
- [ ] Ultra-fine phase now evaluates 41×41 = 1,681 candidates
- [ ] Grid still uses 0.1° step for precision
**Test Method:** Run PLOT COURSE, verify ultra phase takes longer but finds better solutions

### Unit 5: Multi-Horizon Search
**Description:** Search multiple transfer durations to find optimal phase alignment
**Files:** `src/js/lib/course-solver.js`
**Acceptance Criteria:**
- [ ] New `solveCourseMultiHorizon()` function added
- [ ] Searches horizons: [180, 365, 540, 730, 1095, 1460] days
- [ ] Returns best result with `horizonDays` indicating optimal transfer time
- [ ] Early termination if intercept found
- [ ] Progress callback shows current horizon being searched
**Test Method:** Run PLOT COURSE to Venus, verify it searches multiple horizons

### Unit 6: Gradient Descent Polish
**Description:** Add continuous optimization after grid search
**Files:** `src/js/lib/course-solver.js`
**Acceptance Criteria:**
- [ ] New `gradientDescentPolish()` function added
- [ ] Runs 50 iterations with adaptive learning rate
- [ ] Starts from ultra-fine result
- [ ] Uses finite difference for gradient estimation
- [ ] Returns improved yaw/pitch angles
**Test Method:** Run PLOT COURSE, verify final distance is improved over grid search

### Unit 7: Iterative Refinement
**Description:** Retry search with expanded bounds if result is marginal
**Files:** `src/js/lib/course-solver.js`
**Acceptance Criteria:**
- [ ] If result > 0.05 AU after first pass, expand search bounds by 20%
- [ ] Retry up to 2 additional times with progressively expanded bounds
- [ ] Progress callback shows "Refining search bounds..."
- [ ] Total compute time capped at 60 seconds
**Test Method:** Run PLOT COURSE for difficult geometry, verify retry behavior

### Unit 8: Integrate Multi-Horizon with Main Solver
**Description:** Wire multi-horizon search into main `solveCourse()` function
**Files:** `src/js/lib/course-solver.js`
**Acceptance Criteria:**
- [ ] `solveCourse()` now calls multi-horizon by default
- [ ] Old single-horizon behavior available via option
- [ ] Solution includes `horizonDays` field
- [ ] UI displays recommended transfer duration
**Test Method:** Run PLOT COURSE, verify solution includes horizon info

### Unit 9: Update Navigation to Use Course Solver Duration
**Description:** Align navigation prediction with course solver's recommended duration
**Files:** `src/js/core/navigation.js`
**Acceptance Criteria:**
- [ ] `predictClosestApproach()` accepts maxDays parameter
- [ ] Navigation plan considers course solver's recommended horizon
- [ ] Consistency between manual and auto planning
**Test Method:** Apply course solution, verify trajectory matches predicted

### Unit 10: Final Integration and Testing
**Description:** End-to-end testing of improved course solver
**Files:** All modified files
**Acceptance Criteria:**
- [ ] Venus intercept achievable (< 0.01 AU)
- [ ] Mars intercept achievable
- [ ] Jupiter transfer works with multi-horizon
- [ ] No UI blocking during computation
- [ ] Progress feedback accurate
**Test Method:** Full gameplay test with various destinations

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Compute time exceeds 60s | Medium | Medium | Add timeout, report best-so-far |
| Gradient descent diverges | Low | Low | Use adaptive learning rate, cap iterations |
| Multi-horizon finds no intercept | Medium | Medium | Report best marginal solution with guidance |
| UI appears frozen | Low | High | Yield frequently, show progress bar |
| Numerical instability at long horizons | Medium | Medium | Validate orbital elements each step |

## 5. Testing Strategy

### 5.1 Unit Tests
- Gradient descent converges on test function
- Multi-horizon finds correct optimal for known geometry
- Step count increase doesn't break evaluation

### 5.2 Integration Tests
- Course solver finds Venus intercept from typical Earth orbit
- Mars transfer completes successfully
- Outer planet transfers use appropriate horizon

### 5.3 Manual Verification
- PLOT COURSE button shows progress through phases
- Solution applied correctly updates sail angles
- Predicted trajectory matches course solver output
- 5-year slider works correctly with presets

## 6. Expected Results

| Target | Current Best | Expected After |
|--------|--------------|----------------|
| Venus | 0.1586 AU (MARGINAL) | < 0.01 AU (INTERCEPT) |
| Mars | ~0.1 AU | < 0.01 AU |
| Jupiter | N/A (too far) | < 0.05 AU with multi-horizon |

## 7. Compute Time Budget

| Phase | Evaluations | Est. Time |
|-------|-------------|-----------|
| Coarse (5°) | 325 | ~5s |
| Fine (2°) | ~800 | ~10s |
| Ultra (0.1°, ±2°) | 1,681 | ~15s |
| Gradient descent | 50×4 | ~3s |
| Multi-horizon (×3) | ×3 horizons | ~30s total |
| **Total** | | **~30-45s** |

User has confirmed this is acceptable.
