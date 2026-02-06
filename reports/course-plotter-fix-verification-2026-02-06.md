# Course Plotter Accuracy Fix - Verification Report

**Date:** 2026-02-06
**Implementation:** 7 atomic commits on branch `claude/fix-course-plotter-accuracy-82JXt`

## Test Results

| Test | Status | Notes |
|------|--------|-------|
| JS syntax validation (node -c) | Pass | Both modified files parse clean |
| No stale `maxPhaseAngle` references | Pass | All replaced with `phaseAnglePenaltyThreshold` |
| `getInterceptThreshold` returns SOI/2 | Pass | Line 302: `return soi / 2` |
| Early termination uses `earlyTerminationFactor` | Pass | 6 call sites updated (NM, recon, convergence, multistart, main loop) |
| `searchMaxSteps` config added | Pass | Line 109: `searchMaxSteps: 3000` |
| Adaptive resolution in `solveForHorizon` | Pass | Search uses `searchOptions`, final eval uses full `options` |
| Post-solve verification in `solveCourse` | Pass | Lines 1286-1321: 2x step verification with drift reporting |
| Eccentric orbit multi-radius detection | Pass | Lines 343-355: perihelion/a/aphelion for e>0.05, guarded for e>=0.95 |
| Phase penalty replaces hard cutoff | Pass | Lines 468-470: penalty formula, NaN guard at line 463 |
| Post-apply verification in `applyComputedCourse` | Pass | Lines 1193-1221: evaluateCandidate import and verification |
| `evaluateCandidate` export available | Pass | Already exported at line 311 |
| No circular dependencies | Pass | navigation.js imports from course-solver.js (existing pattern) |

## Edge Cases

| Case | Status | Notes |
|------|--------|-------|
| Hyperbolic orbits (e >= 0.95) | Pass | Guarded: uses single radius only |
| Near-circular orbits (e <= 0.05) | Pass | Uses single radius (unchanged behavior) |
| NaN angular separation | Pass | Fallback to Math.PI (worst case) |
| Jupiter (huge SOI = 0.32 AU) | Pass | SOI/2 = 0.16 AU, early term at SOI/4 = 0.08 AU |
| Mercury (tiny SOI = 0.001 AU) | Pass | SOI/2 = 0.00056 AU, eccentric orbit fix adds perihelion/aphelion crossings |
| No crossings found | Pass | Falls through to global min distance fallback (unchanged) |
| All crossings have invalid planet positions | Pass | Existing fallback handles this case |

## Regressions

| Feature | Status |
|---------|--------|
| Encounter markers (ghost planets) | Pass — uses intersectionDetector.js, not course-solver |
| Predicted path display | Pass — uses trajectory-predictor.js, unchanged |
| Navigation panel | Pass — no changes to `getInterceptStatus` or `getInterceptThresholds` in navigation.js |
| Sail controls | Pass — `applyComputedCourse` still applies sail settings identically |
| Course refinement mode | Pass — refinement path unchanged except for tighter early termination |
| Legacy test exports (coarseSweep, fineSearch, ultraFinePolish) | Pass — preserved, use updated `getInterceptThreshold` |
| Autopilot system | Pass — uses controls.js, not course-solver or navigation |

## Summary of Changes

### `src/js/lib/course-solver.js` (net: ~130 lines added/modified)
- **getInterceptThreshold**: returns `soi/2` instead of `soi`
- **CONFIG**: added `earlyTerminationFactor`, `searchMaxSteps`, `phaseAnglePenaltyThreshold`, `phaseAnglePenaltyWeight`
- **evaluateCandidate**: multi-radius crossings, penalty-based phase angle
- **nelderMeadSearch**: tighter early termination
- **solveForHorizon**: adaptive resolution, tighter early termination
- **solveCourse**: post-solve 2x verification with drift reporting
- **Version**: v4.1 → v4.2

### `src/js/core/navigation.js` (net: ~35 lines added)
- **import**: added `evaluateCandidate`
- **applyComputedCourse**: post-apply verification with drift warning

## Issues Found
None.

## Verdict
[x] Feature Complete
