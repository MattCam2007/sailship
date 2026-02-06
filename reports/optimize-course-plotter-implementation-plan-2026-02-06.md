# Optimize Course Plotter Implementation Plan

**Date:** 2026-02-06
**Status:** In Progress

## 0. File Impact Summary

### Files to EDIT:
1. `src/js/lib/course-solver.js` - Replace search algorithm with bracket-convergence

### Files to CREATE:
1. `reports/optimize-course-plotter-spec-2026-02-06.md` - Discovery spec
2. `reports/optimize-course-plotter-implementation-plan-2026-02-06.md` - This plan

## 1. Problem Statement

### 1.1 Description
The course solver takes 30-45 seconds using brute-force grid search (~6000 evaluations). It doesn't make intelligent decisions about where to search next based on previous results. It also ignores deployment as a search variable and applies maximum precision regardless of transfer duration.

### 1.2 Root Cause
The algorithm uses fixed grids (5° → 2° → 0.1° → 0.01°) that evaluate every point regardless of results. It doesn't "learn" from evaluations to focus search.

### 1.3 Constraints
- Must maintain same `evaluateCandidate()` function (proven correct)
- Must maintain same output format (`buildSolution()`)
- Must maintain crossing-aware evaluation and SOI-based thresholds
- Must yield to main thread periodically (no UI blocking)
- Must support both full mode and refinement mode

## 2. Solution Architecture

### 2.1 High-Level Design: "Artillery Bracket Search"

```
Phase 0: HORIZON SCOUT (new)
├─ 1-2 strategic evals per horizon
├─ Pick top 2 horizons for deep search
└─ Eliminates 4 horizons immediately (~3x reduction)

Phase 1: STRATEGIC RECONNAISSANCE (replaces coarse sweep)
├─ 7-9 strategic shots: center, ±yaw, ±pitch, diagonals
├─ Map the landscape direction
└─ Identify promising quadrant

Phase 2: NELDER-MEAD CONVERGENCE (replaces fine/ultra/uber/gradient)
├─ Start simplex at best 3 points from recon
├─ Reflect, expand, contract operations
├─ Converge to adaptive precision target
└─ Typically 20-40 iterations

Phase 3: DEPLOYMENT SWEEP (new)
├─ At best angle, test deployment levels
├─ 100%, 75%, 50%, 25% (4 evals)
└─ Honors multi-sail reality

Phase 4: OPTIONAL MULTI-START (safety net)
├─ If result is MARGINAL or worse, restart from different quadrant
├─ Prevents local minima trapping
└─ Only triggers on poor results
```

### 2.2 Design Principles

1. **Every evaluation should inform the next**: No blind grid searches. Each result tells us where to look next.
2. **Precision proportional to need**: 2+ year transfers → 2° is fine. <6 month → 0.01°.
3. **Early termination on success**: Stop immediately when INTERCEPT quality found.
4. **Deployment matters**: Varying deployment can improve solutions.

### 2.3 Key Algorithm: Nelder-Mead Simplex

The Nelder-Mead method uses a triangle (simplex) of 3 points in 2D space:

```
1. ORDER: Sort vertices by f(v): best, good, worst
2. CENTROID: c = (best + good) / 2
3. REFLECT: r = c + α(c - worst), α=1.0
   - If best < f(r) < good: accept reflection
4. EXPAND: If f(r) < best: try e = c + γ(r - c), γ=2.0
   - If f(e) < f(r): accept expansion, else accept reflection
5. CONTRACT: If f(r) ≥ good:
   - Outside: try oc = c + ρ(r - c), ρ=0.5
   - Inside: try ic = c + ρ(worst - c), ρ=0.5
6. SHRINK: If contraction fails, shrink toward best
   - good = best + σ(good - best), σ=0.5
   - worst = best + σ(worst - best)
7. REPEAT until convergence

Convergence: simplex diameter < tolerance
```

This IS artillery bracketing in mathematical form:
- "Too far left" → reflect right
- "Not far enough" → expand further
- "Overshot" → contract back
- "Lost" → shrink the search area

### 2.4 Adaptive Precision Targets

| Transfer Duration | Angle Tolerance | Rationale |
|-------------------|----------------|-----------|
| > 730 days (2yr+) | 2.0° | Course refinements will happen |
| 365-730 days | 0.5° | Moderate precision |
| 180-365 days | 0.1° | Good precision needed |
| < 180 days | 0.01° | Approaching, need accuracy |

### 2.5 Evaluation Budget

| Phase | Full Mode | Refinement Mode |
|-------|-----------|-----------------|
| Horizon Scout | 12-24 (2 per × 6 horizons) | 0 (single horizon) |
| Reconnaissance | 7-9 per horizon × 2 | 7-9 |
| Nelder-Mead | 20-50 per horizon × 2 | 20-50 |
| Deployment Sweep | 4 | 4 |
| Multi-start (if needed) | 30-50 | 30-50 |
| **Total** | **~80-150** | **~60-115** |
| **vs. Current** | **~6000** | **~1000** |
| **Speedup** | **~40-75x** | **~9-17x** |

## 3. Units of Work

### Unit 1: Core Bracket Search (Nelder-Mead + Reconnaissance)
**Description:** Implement the Nelder-Mead simplex optimization and strategic reconnaissance functions.
**Files:** `src/js/lib/course-solver.js`
**Acceptance Criteria:**
- [ ] `strategicReconnaissance()` evaluates 7-9 strategic points and returns sorted results
- [ ] `nelderMeadSearch()` takes initial simplex and converges to tolerance
- [ ] Both functions yield to main thread periodically
- [ ] Both functions respect search bounds (yaw ±60°, pitch ±30°)
**Test Method:** Unit test with known ship/target, verify convergence

### Unit 2: Smart Horizon Scouting
**Description:** Replace exhaustive multi-horizon search with quick horizon scout.
**Files:** `src/js/lib/course-solver.js`
**Acceptance Criteria:**
- [ ] `scoutHorizons()` evaluates 1-2 candidates per horizon
- [ ] Returns top 2 horizons ranked by potential
- [ ] Total scout evaluations ≤ 24
**Test Method:** Verify correct horizon selection for inner/outer planet targets

### Unit 3: Adaptive Precision Scaling
**Description:** Scale convergence tolerance based on transfer duration.
**Files:** `src/js/lib/course-solver.js`
**Acceptance Criteria:**
- [ ] `getConvergenceTolerance()` returns appropriate tolerance for horizon
- [ ] >730d → 2°, 365-730d → 0.5°, 180-365d → 0.1°, <180d → 0.01°
- [ ] Nelder-Mead uses this tolerance for termination
**Test Method:** Verify tolerance values for different horizons

### Unit 4: Deployment Sweep
**Description:** After angle optimization, sweep deployment levels.
**Files:** `src/js/lib/course-solver.js`
**Acceptance Criteria:**
- [ ] `deploymentSweep()` tests multiple deployment percentages at best angle
- [ ] Tests at least 4 levels (100%, 75%, 50%, 25%)
- [ ] Returns best (angle, deployment) combination
- [ ] Respects ship's sailCount in thrust calculation (already in evaluateCandidate)
**Test Method:** Verify deployment sweep finds non-100% optima when appropriate

### Unit 5: Integration - New Solver Pipeline
**Description:** Wire up new phases into `solveForHorizon()` and `solveCourse()`.
**Files:** `src/js/lib/course-solver.js`
**Acceptance Criteria:**
- [ ] `solveForHorizon()` uses recon → Nelder-Mead → deployment sweep
- [ ] `solveCourse()` uses horizon scout → deep search on top 2
- [ ] Refinement mode uses narrower recon around seed settings
- [ ] Early termination on INTERCEPT quality
- [ ] Progress callbacks still work
- [ ] Output format unchanged (buildSolution compatibility)
**Test Method:** Full solve for Venus/Mars, verify solutions comparable to old solver

### Unit 6: Tests
**Description:** Update test file for new solver algorithm.
**Files:** `src/js/lib/course-solver.test.js`
**Acceptance Criteria:**
- [ ] Tests for strategicReconnaissance
- [ ] Tests for nelderMeadSearch convergence
- [ ] Tests for horizon scouting
- [ ] Tests for deployment sweep
- [ ] Integration test: full solve finds reasonable solution
**Test Method:** Run in browser console

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Non-smooth landscape traps Nelder-Mead | Medium | Medium | Multi-start from different quadrants |
| Nelder-Mead misses global optimum | Low | High | Recon phase covers full space; restart on poor results |
| Faster solver finds worse solutions | Medium | High | Compare with old solver on test cases before replacing |
| Breaking existing test suite | Low | Low | Keep evaluateCandidate unchanged, only replace search |

## 5. Testing Strategy

### 5.1 Unit Tests
- Each new function tested independently
- Known inputs → expected outputs

### 5.2 Integration Tests
- Full solve for Venus, Mars, Jupiter
- Compare quality to old solver baseline

### 5.3 Manual Verification
- Run in browser, trigger course solve
- Verify UI progress reporting works
- Verify result quality matches or exceeds old solver
