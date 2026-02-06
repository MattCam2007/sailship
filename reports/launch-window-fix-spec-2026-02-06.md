# Launch Window Finder Bug Fix - Discovery Specification

## 1. Executive Summary

The launch window finder fails to detect valid departure windows that the course plotter finds successfully. Specifically, when targeting Venus, the window finder reports "NO CROSSING" for departing now, while the course plotter finds a 358-day intercept at yaw=-16.5°, pitch=11°. The window finder only finds a window 1.6 years out. This is caused by sparse angle sampling (25 fixed strategies) missing the narrow "valleys" in the crossing-aware evaluation landscape. Additionally, departure dates are sampled uniformly (brute force) with no orbital mechanics guidance.

## 1.1 Estimated File Impact

### Files to EDIT:
- `src/js/lib/launch-window.js` - Replace fixed strategies with systematic grid, add smart scheduling
- `src/js/lib/launch-window.test.js` - Update tests for new grid-based approach

### Files to CREATE:
- None

## 2. Root Cause Analysis

### 2.1 The Bug: Fixed Strategies Miss Optimal Angles

The `LAUNCH_WINDOW_STRATEGIES` array contains 25 hand-picked sail configurations:
- 11 in-plane (yaw varies, pitch=0)
- 8 out-of-plane (limited yaw/pitch combos)
- 6 combined strategies

The course plotter found Venus intercept at **yaw=-16.5°, pitch=11°**. The closest strategies are:
- yaw=-15, pitch=0 (close in yaw, wrong pitch)
- yaw=0, pitch=15 (close in pitch, wrong yaw)
- yaw=-35, pitch=15 (both nonzero, but yaw too far)

**None of these are close enough.** The crossing-aware evaluation is highly discontinuous (noted in course-solver.js comments): small angle changes shift WHEN the trajectory crosses the target's orbit, creating large jumps in distance. The course plotter's 91-point grid (10° steps) finds the narrow valley; the 25 fixed strategies fall between the cracks.

### 2.2 The Inefficiency: Uniform Brute Force Sampling

Departure dates are sampled uniformly every 30 days across 3 years = 37 dates. No consideration of:
- Synodic period (when favorable geometry repeats)
- Phase angle (whether departure geometry is favorable)
- Adaptive density (refining around promising dates)

This wastes evaluations on unfavorable dates while potentially under-sampling near favorable alignments.

### 2.3 Why the Course Plotter Succeeds

The course plotter (`solveCourse`) uses:
1. **91-point grid** at 10° steps (vs 25 fixed strategies)
2. **Nelder-Mead optimization** to converge on exact angles
3. **6 horizon durations** (180-1460 days) with intelligent scouting
4. **Multi-start** fallback if first search fails

The launch window finder's Phase 1 scan is too coarse to detect crossings at many departure dates, causing it to classify them as "NO CROSSING" even when excellent intercepts exist.

## 3. Solution Design

### 3.1 Fix 1: Systematic Mini-Grid (Bug Fix)

Replace the 25 fixed strategies with a systematic 15° grid:
- Yaw: [-60, -45, -30, -15, 0, 15, 30, 45, 60] (9 values)
- Pitch: [-30, -15, 0, 15, 30] (5 values)
- Total: 45 probes (1.8x more but systematic coverage)

This ensures no narrow valleys are missed because every 15°×15° cell in parameter space is sampled.

### 3.2 Fix 2: Synodic-Period-Aware Scheduling (Intelligence)

Replace uniform 30-day sampling with synodic-period-guided scheduling:
1. Calculate synodic period between ship orbit and target orbit
2. Compute phase angle at candidate departure dates
3. Sample densely around predicted favorable phase angles
4. Sample sparsely during unfavorable phases
5. Ensure scan covers at least 1.5 synodic periods

### 3.3 Fix 3: Adaptive Refinement (Intelligence)

After Phase 1 coarse scan, add Phase 1.5:
1. Identify departure dates where crossings were found (promising dates)
2. Fill in 10-day-interval samples around promising dates
3. This refines window boundaries without full verification cost

## 4. Comparison: Before vs After

| Aspect | Before | After |
|--------|--------|-------|
| Angle sampling | 25 fixed strategies | 45-probe systematic grid |
| Departure sampling | Uniform 30-day intervals | Synodic-period-guided adaptive |
| Refinement | None between scan and verify | Adaptive fill-in around promising dates |
| Coverage guarantee | No guarantee | Every 15°×15° cell covered |
| Venus NOW detection | MISS (NO CROSSING) | DETECT (systematic grid catches it) |
