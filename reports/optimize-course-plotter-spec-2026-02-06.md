# Optimize Course Plotter Specification

**Date:** 2026-02-06
**Feature:** Artillery Bracket Search for Course Solver

## 1. Executive Summary

Replace the brute-force grid search in the course solver with an intelligent bracket-convergence algorithm inspired by artillery fire adjustment. The current solver evaluates ~6000 candidates across 6 horizons (30-45 seconds). The new approach uses strategic reconnaissance, directional bracketing, and Nelder-Mead simplex convergence to find solutions in ~100-150 evaluations (~1-3 seconds). Also adds deployment variation (multi-sail awareness) and adaptive precision scaling based on transfer time.

## 1.1 Estimated File Impact

### Files to EDIT:
- `src/js/lib/course-solver.js` - Replace search algorithm, keep evaluation infrastructure

### Files to CREATE:
- `reports/optimize-course-plotter-spec-2026-02-06.md` - This spec
- `reports/optimize-course-plotter-implementation-plan-2026-02-06.md` - Implementation plan
- `src/js/lib/course-solver.test.js` - Update/extend tests

## 2. Current State Analysis

### 2.1 Existing Systems

| System | Location | Purpose |
|--------|----------|---------|
| Course Solver v3.7 | `src/js/lib/course-solver.js` | Automatic course plotting |
| evaluateCandidate() | course-solver.js:408 | Single trajectory evaluation (GOOD - keep) |
| coarseSweep() | course-solver.js:699 | 91-point grid search (REPLACE) |
| fineSearch() | course-solver.js:811 | 8-candidate × ±8° grid (REPLACE) |
| ultraFinePolish() | course-solver.js:877 | ±2° at 0.1° steps (REPLACE) |
| uberFinePolish() | course-solver.js:928 | ±0.2° at 0.01° steps (REPLACE) |
| gradientDescentPolish() | course-solver.js:979 | 50-iteration gradient descent (REPLACE) |
| solveMultiHorizon() | course-solver.js:1121 | Tests all 6 horizons (REPLACE) |
| buildSolution() | course-solver.js:1423 | Output formatting (KEEP) |
| Crossing detection | course-solver.js:272-334 | Radius crossing finder (KEEP) |
| Quality metrics | course-solver.js:1420-1508 | SOI-based quality (KEEP) |

### 2.2 Data Flow

```
solveCourse()
  → solveWithRefinement()
    → solveMultiHorizon() [6 horizons × full search each]
      → solveForHorizon() [per horizon]
        → coarseSweep() [91 evals, 5° grid]
        → fineSearch() [~405 evals, 2° grid around top 8]
        → ultraFinePolish() [~1600 evals, 0.1° grid ±2°]
        → uberFinePolish() [~1600 evals, 0.01° grid ±0.2°]
        → gradientDescentPolish() [~200 evals, 50 iters × 4]
    → [retry with expanded bounds if marginal]
  → buildSolution()
```

**Total: ~6000+ evaluations. Each evaluation runs a full trajectory sim (~5-7ms). Total: 30-45 seconds.**

### 2.3 Key Problems

1. **Grid search is unintelligent**: Evaluates every point on a grid regardless of results. Doesn't learn from previous evaluations.
2. **Deployment never varied**: Always 100%. Ship may have sailCount > 1 but solver ignores deployment as a search variable.
3. **No precision scaling**: 3-year Jupiter transfer gets 0.01° precision. Wasteful - course refinements will happen later.
4. **All horizons searched equally**: 180-day horizon for Jupiter is pointless. 1460-day horizon for Venus is wasteful.

## 3. Gap Analysis

### 3.1 Missing Capabilities
- [ ] Intelligent search direction selection based on evaluation feedback
- [ ] Deployment as a search variable
- [ ] Adaptive precision based on transfer time
- [ ] Smart horizon pre-screening
- [ ] Convergence-based termination (stop when "good enough")

### 3.2 Required Changes
- [ ] Replace grid search phases with bracket-convergence algorithm
- [ ] Add deployment sweep after angle optimization
- [ ] Scale convergence tolerance to transfer duration
- [ ] Add horizon scouting phase (1-2 evals per horizon) before deep search

## 4. Open Questions
- [x] Is the evaluation landscape smooth enough for Nelder-Mead? → Yes, sail angle changes produce smooth trajectory changes. Crossing selection can cause mild non-smoothness but the overall trend is smooth.
- [x] Should we search deployment jointly with angles or sequentially? → Sequentially. Angles dominate trajectory shape; deployment scales thrust magnitude. Best to find optimal angles first, then optimal deployment.
