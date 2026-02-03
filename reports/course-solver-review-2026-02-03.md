# Course Solver Review

**Date:** 2026-02-03
**Plan Version:** `reports/course-solver-implementation-plan-2026-02-03.md`
**Reviewer:** Orchestrated review with specialized perspectives

---

## 1. Physics/Realism

### Findings

- Algorithm correctly identifies that continuous low-thrust trajectories have no closed-form solution
- Uses existing validated `simulateWithStrategy()` pattern which applies Gauss variational equations
- Search bounds are physically reasonable:
  - Yaw ±60°: Beyond this, cos²(yaw) drops thrust to <25%
  - Pitch ±45°: Sufficient for ecliptic-inclined targets
- 365-day simulation horizon is appropriate for inner planet transfers
- Miss distance thresholds (0.01 AU = intercept, 0.05 AU = near miss) match existing navigation.js conventions

### Concerns

| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| P1 | Important | Fixed 365-day horizon may miss longer optimal transfers | Add configurable `maxDays` option, default to trajectory config duration |
| P2 | Nice-to-have | Doesn't account for time-of-flight optimization | Future enhancement: search over duration as 4th dimension |
| P3 | Nice-to-have | Assumes deployment=100% always optimal | True for minimum time; add fuel-optimal mode later |

### Confidence: 9/10

The physics foundation is solid - it reuses proven trajectory simulation code.

---

## 2. Functionality

### Findings

- Unit decomposition follows TDD: test file first, then implementation
- Each unit has clear acceptance criteria with checkboxes
- Units are properly ordered: infrastructure → algorithm → integration → UI
- Test strategy covers unit, integration, and manual verification
- Reuses `simulateWithStrategy()` pattern from navigation.js (proven code)

### Concerns

| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| F1 | Important | No test for early termination behavior | Add test: `testSolveCourseEarlyTerminationOnIntercept()` - verify it actually skips fine/ultra phases |
| F2 | Important | No test for edge case: ship already at destination | Add test: `testSolveCourseWhenAlreadyAtTarget()` |
| F3 | Nice-to-have | Test file naming inconsistency | Use `.test.js` suffix consistently (plan does this correctly) |
| F4 | Nice-to-have | No progress callback for UI updates during search | Consider adding optional `onProgress(phase, percent)` callback |

### Confidence: 8/10

Solid test coverage planned. Add edge case tests noted above.

---

## 3. Architecture

### Findings

- Clean separation: `course-solver.js` is pure algorithm, no UI dependencies
- Follows project patterns: named exports, .js extensions in imports
- Integrates via `navigation.js` wrapper, maintaining existing module boundaries
- Cache strategy matches existing `navPlanCache` pattern
- No new dependencies introduced

### Concerns

| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| A1 | Important | `evaluateCandidate()` duplicates `simulateWithStrategy()` logic | Consider refactoring to share simulation core, or explicitly document why duplication is acceptable |
| A2 | Nice-to-have | No clear module boundary for search phases | Export individual phase functions for testability (plan already does this) |
| A3 | Nice-to-have | Solution object structure not formally typed | Add JSDoc typedef for CourseSolution |

### Confidence: 8/10

Architecture is sound. Minor duplication concern is acceptable for isolation.

---

## 4. Failure Modes

### Findings

- Plan identifies key risks: performance, no solution, local minima
- Mitigation strategies are reasonable
- Uses top 5 candidates instead of just best to avoid local minima trap
- Performance budget is detailed and realistic

### Concerns

| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| FM1 | Critical | **UI BLOCKING**: 5.5 seconds of synchronous computation will freeze browser | **MUST address**: Use `requestIdleCallback()` or chunk computation with `setTimeout(..., 0)` between phases |
| FM2 | Important | No handling for invalid ship state (missing elements) | Add early validation, return null with error message |
| FM3 | Important | Outer planet searches may need longer horizon | Auto-extend horizon for targets beyond Mars (a > 1.7 AU) |
| FM4 | Nice-to-have | No cancel mechanism for long-running search | Add `AbortController` support for cancellation |
| FM5 | Nice-to-have | Cache invalidation unclear | Document when to clear course cache (destination change, ship position change) |

### Confidence: 7/10

**FM1 is critical** - must be addressed before implementation. Blocking the main thread for 5+ seconds is unacceptable UX.

---

## 5. Summary

### Confidence Rating: 8/10

The plan is well-structured with solid physics and clear unit decomposition. One critical issue must be addressed.

### Critical Issues (Must Fix)

1. **FM1**: UI blocking during computation. 5.5 seconds of synchronous work will freeze the browser. Solution: chunk computation using `requestIdleCallback()` or `setTimeout(..., 0)` between phases, with "Computing... Phase 1/3" UI feedback.

### Important Issues (Should Fix)

1. **A1**: Consider extracting shared simulation core to avoid duplication with `simulateWithStrategy()`
2. **F1/F2**: Add edge case tests for early termination and already-at-target scenarios
3. **P1**: Use configurable duration from `trajectoryConfig` instead of hardcoded 365 days
4. **FM2**: Add validation for invalid ship state
5. **FM3**: Auto-extend search horizon for outer planets

### Recommendations

1. **Unit 2 modification**: Make `evaluateCandidate()` return a Promise and yield between candidates using `setTimeout(..., 0)`
2. **Unit 6 modification**: Add phase progress callbacks: `onProgress('COARSE', 50)` etc.
3. **Unit 9 modification**: Show phase progress in button text: "Computing... (2/3)"

### Verdict

[x] **Approved with conditions**

Proceed with implementation, but:
1. **REQUIRED**: Address FM1 (UI blocking) in Units 2-6 by making computation non-blocking
2. **RECOMMENDED**: Add edge case tests (F1, F2) in Unit 1

---

## Appendix: Suggested Non-Blocking Implementation

```javascript
// Chunked evaluation using setTimeout for main thread yielding
async function evaluateCandidatesChunked(candidates, ship, target, options, onProgress) {
  const results = [];
  const total = candidates.length;

  for (let i = 0; i < candidates.length; i++) {
    results.push(evaluateCandidate(candidates[i].yaw, candidates[i].pitch, ship, target, options));

    // Yield to main thread every 10 evaluations
    if (i % 10 === 0) {
      onProgress?.(i / total);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  return results;
}
```

This allows the browser to handle UI updates and remain responsive during computation.
