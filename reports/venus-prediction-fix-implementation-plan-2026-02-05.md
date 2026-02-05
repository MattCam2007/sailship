# Venus Ghost Planet Prediction Accuracy Fix

**Date:** 2026-02-05
**Status:** In Progress

## 0. File Impact Summary

### Files to EDIT:
1. `src/js/lib/intersectionDetector.js` - Increase bisection iterations for better crossing time precision

### Files to CREATE:
- None

### Files to DELETE:
- None

## 1. Problem Statement

### 1.1 Description
Ghost planet (encounter marker) for Venus shows in the wrong position - user expected to arrive behind Venus but the ghost showed front approach. The actual trajectory was correct (Venus SOI was hit), but the ghost planet position was inaccurate.

### 1.2 Root Cause
The bisection refinement algorithm uses zoom-adaptive precision:
- **High zoom (>2.0):** 10 iterations → ~7 second precision → ~245 km Venus position error
- **Low zoom (<2.0):** 4 iterations → ~27 minute precision → ~57,000 km Venus position error

Venus moves at ~35 km/s. At low zoom precision (27 minutes), the ghost planet position error is ~57,000 km - enough to display on the wrong side of the actual encounter point.

### 1.3 Constraints
- Must maintain smooth frame rate (intersection detection has 16ms timeout)
- Higher iterations = more CPU usage per crossing refinement
- Need balance between precision and performance

## 2. Solution Architecture

### 2.1 High-Level Design
Increase bisection iterations at both zoom levels to improve crossing time precision:
- Low zoom: 4 → 8 iterations (improve from ~27 min to ~28 sec precision)
- High zoom: 10 → 12 iterations (improve from ~7 sec to ~1.8 sec precision)

### 2.2 Design Principles
- **Minimal change:** Only modify iteration counts, not algorithm structure
- **Proportional improvement:** Double iterations at low zoom for 16x precision improvement
- **Safety margin:** High zoom already adequate, but small increase provides buffer

### 2.3 Key Calculations

**Bisection precision formula:** `initial_segment / 2^iterations`

Initial segment = 2 hours (from 12 steps/day trajectory)

| Iterations | Precision | Venus Error (35 km/s) |
|------------|-----------|----------------------|
| 4          | ~27 min   | ~57,000 km           |
| 8          | ~28 sec   | ~980 km              |
| 10         | ~7 sec    | ~245 km              |
| 12         | ~1.8 sec  | ~63 km               |

### 2.4 Trade-off Analysis

Each bisection iteration adds:
- 1 midpoint calculation (3 additions, 3 divisions)
- 1 radius calculation (3 squares, 2 additions, 1 sqrt)
- 1 comparison

Cost per iteration: ~15-20 floating point operations
Cost per crossing: ~120-240 additional ops for +4 iterations

With typical 2-5 crossings per frame, this adds ~1000 ops total - negligible vs 16ms frame budget.

## 3. Units of Work

### Unit 1: Increase Bisection Iterations
**Description:** Modify REFINEMENT_CONFIG in intersectionDetector.js
**Files:** `src/js/lib/intersectionDetector.js`
**Acceptance Criteria:**
- [ ] `bisectionIterationsLow` increased from 4 to 8
- [ ] `bisectionIterationsHigh` increased from 10 to 12
- [ ] Comments updated to reflect new precision values
**Test Method:** Manual verification in browser - Venus ghost should show correct encounter side

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Performance degradation | Low | Low | Only 8 extra iterations per crossing (~1000 ops) |
| No visible improvement | Low | Medium | User report indicates issue resolved by higher precision |
| Regression in other planets | Very Low | Low | Algorithm unchanged, only precision increased |

## 5. Testing Strategy

### 5.1 Manual Verification
1. Set course for Venus intercept
2. Verify ghost planet shows correct encounter geometry (front/behind)
3. Check ghost position stability during sail adjustments
4. Verify frame rate remains smooth

### 5.2 Edge Cases
- Very distant crossings (>1 year out)
- Multiple crossings of same planet
- Low zoom vs high zoom display consistency
