# Course Solver Implementation Plan

**Date:** 2026-02-03
**Status:** Draft

## 0. File Impact Summary

### Files to EDIT:
1. `src/js/core/navigation.js` - Add `computeOptimalCourse()` wrapper, integrate results
2. `src/js/ui/uiUpdater.js` - Display course solution in AUTO panel
3. `src/js/ui/controls.js` - Add PLOT COURSE button handler
4. `src/index.html` - Add PLOT COURSE button to AUTO tab

### Files to CREATE:
1. `src/js/lib/course-solver.js` - Core hybrid search algorithm
2. `src/js/lib/course-solver.test.js` - TDD test suite

### Files to DELETE:
- None

---

## 1. Problem Statement

### 1.1 Description

Players must manually adjust sail yaw, pitch, and deployment to intercept target planets. The current navigation system only tests 10 discrete strategies, often missing optimal solutions. Players need an automatic course calculator that searches the continuous parameter space.

### 1.2 Root Cause

The inverse problem (destination → sail settings) has no closed-form solution for continuous low-thrust trajectories. The current `computeNavigationPlan()` uses a small discrete set of strategies, which is fast but imprecise.

### 1.3 Constraints

- **Performance:** Must complete in <5 seconds
- **Accuracy:** Find solution within 0.01 AU of target (intercept threshold)
- **Non-blocking:** Should not freeze UI during computation
- **Integration:** Must work with existing autopilot system

---

## 2. Solution Architecture

### 2.1 High-Level Design

```
┌─────────────────────────────────────────────────────────────┐
│  HYBRID COARSE-TO-FINE SEARCH                               │
├─────────────────────────────────────────────────────────────┤
│  Phase 1: COARSE SWEEP                                      │
│  ├── Yaw: -60° to +60° in 10° steps (13 values)            │
│  ├── Pitch: -30° to +30° in 10° steps (7 values)           │
│  ├── Total: 91 trajectory evaluations                       │
│  └── Output: Top 5 candidates by miss distance              │
├─────────────────────────────────────────────────────────────┤
│  Phase 2: FINE SEARCH (around each top candidate)          │
│  ├── Yaw: ±8° in 2° steps (9 values)                       │
│  ├── Pitch: ±8° in 2° steps (9 values)                     │
│  ├── Total: 81 evaluations per candidate × 5 = 405         │
│  └── Output: Best candidate with refined settings           │
├─────────────────────────────────────────────────────────────┤
│  Phase 3: ULTRA-FINE POLISH                                 │
│  ├── Yaw: ±1.5° in 0.5° steps (7 values)                   │
│  ├── Pitch: ±1.5° in 0.5° steps (7 values)                 │
│  ├── Total: 49 evaluations                                  │
│  └── Output: Final optimized settings                       │
├─────────────────────────────────────────────────────────────┤
│  TOTAL: ~545 trajectory evaluations @ 10ms = ~5.5 seconds  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Design Principles

1. **Hierarchical Refinement:** Start broad, focus on promising regions
2. **Early Termination:** Stop if perfect intercept found in coarse pass
3. **Deterministic:** Same inputs always produce same output (no randomness)
4. **Reuse Existing Code:** Use `simulateWithStrategy()` pattern from navigation.js

### 2.3 Key Algorithms

**Trajectory Evaluation (per candidate):**
```javascript
function evaluateCandidate(yawDeg, pitchDeg, ship, target, maxDays) {
  // Clone ship elements
  let simElements = { ...ship.orbitalElements };
  const sail = { ...ship.sail, angle: yawDeg * DEG_TO_RAD, pitchAngle: pitchDeg * DEG_TO_RAD, deploymentPercent: 100 };

  // Forward simulation
  let minDistance = Infinity;
  let minTime = 0;

  for (let day = 0; day < maxDays; day += timeStep) {
    const shipPos = simulateStep(simElements, sail, day);
    const targetPos = getPosition(target.elements, startTime + day);
    const dist = distance3D(shipPos, targetPos);

    if (dist < minDistance) {
      minDistance = dist;
      minTime = day;
    }
  }

  return { yawDeg, pitchDeg, minDistance, minTime };
}
```

**Coarse-to-Fine Search:**
```javascript
function solveCourse(ship, target, options) {
  // Phase 1: Coarse sweep
  const coarseResults = [];
  for (let yaw = -60; yaw <= 60; yaw += 10) {
    for (let pitch = -30; pitch <= 30; pitch += 10) {
      coarseResults.push(evaluateCandidate(yaw, pitch, ship, target, 365));
    }
  }

  // Sort by miss distance, take top 5
  coarseResults.sort((a, b) => a.minDistance - b.minDistance);
  const topCandidates = coarseResults.slice(0, 5);

  // Early termination: if best is intercept, skip refinement
  if (topCandidates[0].minDistance < 0.01) {
    return topCandidates[0];
  }

  // Phase 2: Fine search around each candidate
  let best = topCandidates[0];
  for (const candidate of topCandidates) {
    for (let yaw = candidate.yawDeg - 8; yaw <= candidate.yawDeg + 8; yaw += 2) {
      for (let pitch = candidate.pitchDeg - 8; pitch <= candidate.pitchDeg + 8; pitch += 2) {
        const result = evaluateCandidate(yaw, pitch, ship, target, 365);
        if (result.minDistance < best.minDistance) {
          best = result;
        }
      }
    }
  }

  // Phase 3: Ultra-fine polish
  for (let yaw = best.yawDeg - 1.5; yaw <= best.yawDeg + 1.5; yaw += 0.5) {
    for (let pitch = best.pitchDeg - 1.5; pitch <= best.pitchDeg + 1.5; pitch += 0.5) {
      const result = evaluateCandidate(yaw, pitch, ship, target, 365);
      if (result.minDistance < best.minDistance) {
        best = result;
      }
    }
  }

  return best;
}
```

---

## 3. Units of Work

### Unit 1: Test Infrastructure

**Description:** Create test file with helper functions and first failing test
**Files:** `src/js/lib/course-solver.test.js`
**Acceptance Criteria:**
- [ ] Test file exists and can be imported in browser console
- [ ] `runAllTests()` function exists and runs
- [ ] First test: `testModuleLoads()` passes
- [ ] Helper function to create mock ship/target objects
**Test Method:** Run in browser console: `import('/js/lib/course-solver.test.js').then(m => m.runAllTests())`

### Unit 2: Module Scaffold with evaluateCandidate()

**Description:** Create course-solver.js with basic trajectory evaluation
**Files:** `src/js/lib/course-solver.js`
**Acceptance Criteria:**
- [ ] Module exports `evaluateCandidate(yawDeg, pitchDeg, ship, target, options)`
- [ ] Returns `{ yawDeg, pitchDeg, minDistance, timeToClosest, status }`
- [ ] Test: evaluating (35, 0) returns reasonable distance for Mars
- [ ] Test: evaluating (-35, 0) returns different distance
**Test Method:** Unit tests verify return structure and basic behavior

### Unit 3: Coarse Sweep Implementation

**Description:** Implement Phase 1 coarse grid search
**Files:** `src/js/lib/course-solver.js`
**Acceptance Criteria:**
- [ ] Export `coarseSweep(ship, target, options)` function
- [ ] Searches yaw -60° to +60° in 10° steps
- [ ] Searches pitch -30° to +30° in 10° steps
- [ ] Returns array of 91 results sorted by minDistance
- [ ] Test: coarse sweep finds at least one candidate < 0.5 AU for Venus
**Test Method:** Unit tests verify grid coverage and sorting

### Unit 4: Fine Search Implementation

**Description:** Implement Phase 2 local refinement around top candidates
**Files:** `src/js/lib/course-solver.js`
**Acceptance Criteria:**
- [ ] Export `fineSearch(candidates, ship, target, options)` function
- [ ] Takes top N candidates from coarse sweep
- [ ] Searches ±8° around each in 2° steps
- [ ] Returns single best result
- [ ] Test: fine search improves on coarse result
**Test Method:** Unit tests verify refinement improves distance

### Unit 5: Ultra-Fine Polish Implementation

**Description:** Implement Phase 3 final polishing
**Files:** `src/js/lib/course-solver.js`
**Acceptance Criteria:**
- [ ] Export `ultraFinePolish(candidate, ship, target, options)` function
- [ ] Searches ±1.5° around best in 0.5° steps
- [ ] Returns final optimized settings
- [ ] Test: polish further improves result (or maintains if already optimal)
**Test Method:** Unit tests verify final precision

### Unit 6: Main Solver Function

**Description:** Combine phases into single `solveCourse()` function
**Files:** `src/js/lib/course-solver.js`
**Acceptance Criteria:**
- [ ] Export `solveCourse(ship, target, options)` function
- [ ] Orchestrates coarse → fine → ultra phases
- [ ] Early termination if intercept found in coarse pass
- [ ] Returns complete solution object with metadata
- [ ] Test: solveCourse finds intercept for Venus from Earth orbit
**Test Method:** Integration test with full search

### Unit 7: Solution Quality Metrics

**Description:** Add confidence rating and status classification
**Files:** `src/js/lib/course-solver.js`
**Acceptance Criteria:**
- [ ] Solution includes `quality` field: 'INTERCEPT' | 'NEAR_MISS' | 'MARGINAL' | 'NO_SOLUTION'
- [ ] Solution includes `confidence` field (0-1 based on search coverage)
- [ ] Solution includes `searchMetrics` with timing and candidate counts
- [ ] Test: quality ratings match distance thresholds
**Test Method:** Unit tests verify quality classification

### Unit 8: Navigation Integration

**Description:** Add `computeOptimalCourse()` wrapper in navigation.js
**Files:** `src/js/core/navigation.js`
**Acceptance Criteria:**
- [ ] Export `computeOptimalCourse()` function
- [ ] Calls `solveCourse()` with current ship and destination
- [ ] Caches result (expensive calculation)
- [ ] Returns null if no valid solution
- [ ] Test: calling from console returns valid course
**Test Method:** Manual test in browser console

### Unit 9: UI Button and Handler

**Description:** Add PLOT COURSE button to AUTO tab
**Files:** `src/index.html`, `src/js/ui/controls.js`
**Acceptance Criteria:**
- [ ] PLOT COURSE button appears in AUTO tab
- [ ] Clicking button calls `computeOptimalCourse()`
- [ ] Button shows "Computing..." state during search
- [ ] Disabled when no destination selected
**Test Method:** Manual UI test

### Unit 10: Results Display

**Description:** Show computed course in AUTO panel
**Files:** `src/js/ui/uiUpdater.js`, `src/index.html`
**Acceptance Criteria:**
- [ ] Display recommended yaw, pitch, deployment
- [ ] Display predicted arrival time and closest approach
- [ ] Display quality rating
- [ ] APPLY button to set sail to computed values
**Test Method:** Manual UI test

### Unit 11: Apply Course Action

**Description:** Apply computed course to ship sail
**Files:** `src/js/ui/controls.js`, `src/js/core/navigation.js`
**Acceptance Criteria:**
- [ ] APPLY button sets sail yaw, pitch, deployment to computed values
- [ ] Trajectory preview updates immediately
- [ ] Autopilot can be enabled to maintain course
**Test Method:** Manual gameplay test

---

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Search takes >5 seconds | Medium | High | Reduce grid density, add progress callback |
| No solution exists for some destinations | Medium | Medium | Return "NO_SOLUTION" with helpful message |
| Local minimum found instead of global | Low | Medium | Test top 5 candidates, not just best |
| Trajectory predictor edge cases | Low | High | Reuse existing validated simulation code |
| UI freezes during computation | Medium | High | Use chunked computation or Web Worker |

---

## 5. Testing Strategy

### 5.1 Unit Tests (course-solver.test.js)

```javascript
// Test cases
testEvaluateCandidateReturnsValidStructure()
testEvaluateCandidateDistanceVariesWithYaw()
testCoarseSweepReturns91Results()
testCoarseSweepSortedByDistance()
testFineSearchImprovesOnCoarse()
testUltraFinePolishMaintainsOrImproves()
testSolveCourseFindsInterceptForVenus()
testSolveCourseHandlesOuterPlanets()
testSolveCourseEarlyTerminationOnIntercept()
testQualityRatingsMatchThresholds()
```

### 5.2 Integration Tests

- Start at Earth orbit, solve for Venus → expect INTERCEPT
- Start at Earth orbit, solve for Mars → expect INTERCEPT or NEAR_MISS
- Start at Earth orbit, solve for Jupiter → expect solution exists
- Verify computed course actually achieves predicted result

### 5.3 Manual Verification

1. Open game in browser
2. Select Venus as destination
3. Click PLOT COURSE
4. Verify computation completes in <5 seconds
5. Click APPLY
6. Enable time acceleration
7. Verify ship approaches Venus as predicted

---

## 6. Performance Budget

| Phase | Grid Size | Evaluations | Est. Time |
|-------|-----------|-------------|-----------|
| Coarse | 13 × 7 | 91 | 910ms |
| Fine | 9 × 9 × 5 | 405 | 4050ms |
| Ultra | 7 × 7 | 49 | 490ms |
| **Total** | - | **545** | **~5.5s** |

If performance is too slow:
- Option A: Reduce fine search to top 3 candidates (243 evals → 2.4s savings)
- Option B: Skip ultra-fine for non-intercepts
- Option C: Use Web Worker for background computation
