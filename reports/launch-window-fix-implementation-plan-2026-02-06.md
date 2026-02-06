# Launch Window Finder Fix - Implementation Plan

**Date:** 2026-02-06
**Status:** In Progress

## 0. File Impact Summary

### Files to EDIT:
1. `src/js/lib/launch-window.js` - Replace strategies with grid, add smart scheduling, adaptive refinement
2. `src/js/lib/launch-window.test.js` - Update strategy count test, add new tests

### Files to CREATE:
- None

### Files to DELETE:
- None

## 1. Problem Statement

### 1.1 Description
Launch window finder misses valid departure windows. Course plotter finds 358-day Venus intercept departing now; window finder reports "NO CROSSING" for now and only finds a window 1.6 years out.

### 1.2 Root Cause
25 fixed sail strategies don't cover the yaw/pitch parameter space systematically. The crossing-aware evaluation is highly discontinuous, so small angle gaps cause complete misses. Additionally, departure dates are sampled by brute-force uniform intervals with no orbital mechanics guidance.

### 1.3 Constraints
- Must not break existing test suite
- Must maintain async/yield pattern for UI responsiveness
- Must keep computation time reasonable (under 2 minutes)
- Zero code duplication: continue using evaluateCandidate() for all evaluations
- Must preserve backward-compatible exports (LAUNCH_WINDOW_STRATEGIES)

## 2. Solution Architecture

### 2.1 High-Level Design

Three changes to the scanning algorithm:

1. **Systematic mini-grid** replaces fixed strategies (45 probes, 15° steps)
2. **Synodic-period-aware scheduling** replaces uniform 30-day intervals
3. **Adaptive refinement phase** fills in around promising departure dates

### 2.2 Key Algorithms

**Mini-Grid Generation:**
```
yaw: [-60, -45, -30, -15, 0, 15, 30, 45, 60] (9 values)
pitch: [-30, -15, 0, 15, 30] (5 values)
Total: 45 probes per departure date per horizon
Special case: yaw=0, pitch=0 uses deployment=0 (coast baseline)
```

**Smart Departure Scheduling:**
```
1. Calculate synodic period T_syn = 2π / |n_ship - n_target|
2. Calculate phase angle θ(t) = atan2(target_y, target_x) - atan2(ship_y, ship_x)
3. Compute phase angle rate: dθ/dt ≈ n_target - n_ship
4. Predict favorable phase region (where θ changes most per day)
5. Dense sampling (every T_syn/36 days, ~16 days) near predicted favorable dates
6. Sparse sampling (every T_syn/12 days, ~49 days) elsewhere
7. Ensure total scan range ≥ min(maxCoastDays, 1.5 × T_syn)
```

**Adaptive Refinement (Phase 1.5):**
```
1. After Phase 1, identify departure dates with crossings found
2. For each promising date, add ±30 day fill-in samples at 10-day intervals
3. Re-evaluate with mini-grid at each fill-in date
4. Update window grouping with refined data
```

## 3. Units of Work

### Unit 1: Replace Fixed Strategies with Systematic Mini-Grid
**Description:** Replace LAUNCH_WINDOW_STRATEGIES array with a grid generator function. Keep the export name for backward compatibility but change its content.
**Files:** `src/js/lib/launch-window.js`
**Acceptance Criteria:**
- [ ] LAUNCH_WINDOW_STRATEGIES contains 45 systematic grid probes
- [ ] Grid covers [-60,60] yaw × [-30,30] pitch at 15° steps
- [ ] yaw=0/pitch=0 entry uses deployment=0 (coast baseline)
- [ ] All other entries use deployment=100
- [ ] scanLaunchWindows() works with new grid

### Unit 2: Add Synodic-Period-Aware Departure Scheduling
**Description:** Add computeDepartureSchedule() that uses orbital mechanics to guide sampling density.
**Files:** `src/js/lib/launch-window.js`
**Acceptance Criteria:**
- [ ] Calculates synodic period between ship and target orbits
- [ ] Computes phase angles to predict favorable departure regions
- [ ] Dense sampling near favorable phases, sparse elsewhere
- [ ] Scan range covers at least 1.5 synodic periods (capped at maxCoastDays)
- [ ] Falls back to uniform sampling if synodic period calculation fails

### Unit 3: Add Adaptive Refinement Phase
**Description:** After Phase 1 coarse scan, add Phase 1.5 that fills in around promising dates.
**Files:** `src/js/lib/launch-window.js`
**Acceptance Criteria:**
- [ ] Identifies departure dates where crossings were found
- [ ] Adds 10-day fill-in samples within ±30 days of promising dates
- [ ] Does not duplicate already-scanned dates
- [ ] Merged results used for window grouping
- [ ] Progress callback reports refinement phase

### Unit 4: Update Tests
**Description:** Update launch-window.test.js for new grid-based approach.
**Files:** `src/js/lib/launch-window.test.js`
**Acceptance Criteria:**
- [ ] Strategy count test updated for 45-probe grid
- [ ] Existing tests still pass
- [ ] Add test for grid coverage (verifies systematic coverage)

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| 45 probes increase scan time | Low | Low | 1.8× more probes but still fast (~4-6s vs ~2-4s) |
| Synodic calculation edge case (same orbit) | Low | Medium | Guard against division by zero, fallback to uniform |
| Adaptive refinement adds too many dates | Low | Low | Cap at 20 fill-in dates |
| Phase angle prediction is inaccurate | Medium | Low | Used for density guidance only, not as filter |

## 5. Testing Strategy

### 5.1 Unit Tests
- Updated launch-window.test.js (all existing + new)

### 5.2 Manual Verification
- Test Venus from Earth orbit: should now find "depart now" window
- Test Mars: should still find windows
- Test Jupiter: should work with outer planet horizons
- Compare window finder results with course plotter for consistency
