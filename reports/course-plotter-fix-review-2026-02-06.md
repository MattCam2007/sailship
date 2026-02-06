# Course Plotter Accuracy Fix - Review Report

**Date:** 2026-02-06
**Plan:** `reports/course-plotter-fix-implementation-plan-2026-02-06.md`

## 1. Physics/Realism

### Findings
- SOI/2 threshold is physically meaningful — requires ship in inner half of gravitational influence zone
- Perihelion/aphelion formulas `a*(1-e)` and `a*(1+e)` are exactly correct for elliptical orbits
- Phase angle penalty is a heuristic, not physics-derived, but serves optimization purpose well
- Adaptive step resolution is valid — coarse search + fine verify follows Richardson extrapolation principle
- 2x verification provides good convergence testing for Gauss's variational equations

### Concerns
| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| P1 | Critical | Hyperbolic orbits (e≥1) make `a*(1-e)` negative. Must guard Unit 5. | Add guard: skip eccentric handling when e ≥ 0.95 |
| P2 | Low | Phase penalty factor 2.0 is arbitrary. | Document as tunable heuristic, add code comment |
| P3 | Low | Mercury SOI/4 (42km) near precision limits. | Monitor, acceptable for now |

## 2. Functionality

### Findings
- All seven units address real problems identified in the analysis
- Units 1-2 (threshold fix) provide the highest-impact improvement for minimal code change
- Units 3-4 (adaptive resolution + verification) provide meaningful accuracy improvement
- Units 5-6 (eccentric orbits + phase angle) improve coverage for edge-case targets
- Unit 7 (auto-refine) provides the best UX for course confirmation

### Concerns
| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| F1 | Important | Tighter thresholds may find fewer "INTERCEPT" results overall. | This is correct behavior — solver should be honest. Add NEAR_MISS display improvements if needed later |
| F2 | Important | No retry if adaptive resolution verification fails (high-res shows worse than search). | If verified distance > 2× search distance, log warning. Don't retry — too expensive. |

## 3. Architecture

### Concerns
| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| A1 | Important | New config values (searchMaxSteps) should stay in course-solver's internal CONFIG, not in config.js INTERSECTION_CONFIG. | Keep solver-specific config in course-solver.js CONFIG object |
| A2 | Important | Verification logic should live inside solveCourse(), not navigation.js. | Move post-solve verification into solveCourse(). Unit 7 auto-refine uses evaluateCandidate imported from solver — keep it simple. |
| A3 | Minor | CONFIG.maxPhaseAngle semantics change from cutoff to penalty threshold. | Rename to phaseAnglePenaltyThreshold, add new phaseAnglePenaltyWeight config |

## 4. Failure Modes

### Concerns
| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| FM1 | Critical | Auto-refine (Unit 7) blocks UI if synchronous — evaluateCandidate takes ~100-500ms at high resolution. | Keep it synchronous but at normal resolution (not 2×). Single eval at 6000 steps is <200ms. |
| FM2 | Critical | Hyperbolic orbit crash — e≥1 produces invalid radii. | Guard with e < 0.95 check (same as P1). |
| FM3 | Important | NaN propagation in phase penalty if angularSep is invalid. | Add `if (!isFinite(angularSep)) angularSep = Math.PI` fallback |
| FM4 | Low | Eccentric orbit 3-radius detection could produce many crossings. | Already capped by minCrossingGap=5. Acceptable. |

## 5. Summary

### Confidence Rating: 8/10

### Critical Issues (Must Fix Before Implementation)
1. **P1/FM2**: Guard eccentric orbit handling against hyperbolic trajectories (e ≥ 0.95)
2. **A2**: Keep verification inside solveCourse(), not scattered across navigation.js

### Important Issues (Fix During Implementation)
1. **A1**: Keep new config in course-solver's internal CONFIG
2. **FM1**: Keep auto-refine evaluation at normal resolution, not 2×
3. **FM3**: Add NaN guard in phase penalty calculation
4. **A3**: Rename maxPhaseAngle config for clarity

### Recommendations
1. Units 1-2 are safe to implement immediately (1-line changes, huge impact)
2. Unit 5 needs hyperbolic guard (must fix)
3. Unit 4 verification should be inside solveCourse() (architecture fix)
4. Unit 7 auto-refine should use normal-res evaluateCandidate (performance)

### Verdict
[x] Approved with conditions
- Address critical issues P1/FM2 and A2 during implementation
- All units are sound in principle; review concerns are about implementation details
