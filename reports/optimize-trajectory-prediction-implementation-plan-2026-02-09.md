# Optimize Trajectory Prediction — Implementation Plan

**Date:** 2026-02-09
**Status:** In Progress
**Discovery:** `reports/performance-analysis-2026-02-09.md`

## 0. File Impact Summary

### Files to EDIT:
1. `src/js/lib/trajectory-predictor.js` — Replace JSON.stringify hash with numeric hash
2. `src/js/main.js` — Throttle recomputation cascade, stagger cache cleanup
3. `src/js/ui/controls.js` — Remove console.log from slider handlers, add debouncing
4. `src/js/ui/uiUpdater.js` — Add dirty-flag optimization to DOM updates
5. `src/js/lib/intersectionDetector.js` — Pre-compute body positions for closest approach

### Files to CREATE:
- None

### Files to DELETE:
- None

## 1. Problem Statement

### 1.1 Description
The game exhibits frame rate degradation at high time warp speeds (1M x and above). Trajectory prediction and intersection detection form a synchronous cascade that can consume 14-34ms per frame on cache misses — exceeding the 16.6ms frame budget at 60 FPS.

### 1.2 Root Cause
At high time warp, orbital elements change rapidly enough to invalidate the trajectory cache hash every 1-2 frames. Each cache miss triggers a synchronous cascade of: trajectory prediction (720 RK2 steps) + intersection detection (720 x 50 body scans) + closest approach detection (11,520 getPosition calls) + node crossing detection.

### 1.3 Constraints
- No build system or bundler — vanilla JS, no compilation
- No external dependencies — cannot add lodash/debounce etc.
- Physics accuracy must be preserved — optimizations must not change trajectory output
- Browser console tests must continue to pass
- Changes must be backwards-compatible with existing save/load

## 2. Solution Architecture

### 2.1 High-Level Design
Seven independent optimizations targeting different layers of the performance stack:
1. **Hashing layer** — faster cache key computation
2. **Hot path cleanup** — remove unnecessary work from event handlers
3. **Scheduling layer** — throttle recomputation frequency
4. **Cleanup layer** — stagger cache eviction
5. **Algorithm layer** — reduce redundant getPosition() calls
6. **Input layer** — batch rapid slider events
7. **UI layer** — skip unnecessary DOM updates

### 2.2 Design Principles
- **No physics changes** — trajectory output must be bit-identical
- **Backwards-compatible** — no API changes, no new files
- **Independently testable** — each unit can be verified in isolation
- **Progressive improvement** — each unit improves performance independently

## 3. Units of Work

### Unit 1: Replace JSON.stringify Hash with Numeric Hash
**Description:** Replace the `JSON.stringify()` call in `hashInputs()` with a fast numeric hash (FNV-1a style multiply-XOR of rounded values). Eliminates string allocation and JSON serialization overhead on every frame.
**Files:** `src/js/lib/trajectory-predictor.js`
**Acceptance Criteria:**
- [ ] hashInputs() returns a number instead of a string
- [ ] Cache hit/miss behavior identical (same rounding logic)
- [ ] No string allocation in hash path
- [ ] Trajectory predictor test suite passes unchanged
**Test Method:** Run trajectory predictor tests in browser console. Visual comparison of predicted path before/after.

### Unit 2: Remove console.log from Slider Hot Paths
**Description:** Remove `console.log()` calls with velocity magnitude calculations from the yaw and pitch slider input handlers. These fire on every pixel of slider movement and console logging is ~0.5ms per call.
**Files:** `src/js/ui/controls.js`
**Acceptance Criteria:**
- [ ] No console.log in yaw slider input handler
- [ ] No console.log in pitch slider input handler
- [ ] Slider functionality unchanged (values still update correctly)
**Test Method:** Drag yaw/pitch sliders, verify no console output. Verify sail display updates correctly.

### Unit 3: Throttle Recomputation Cascade
**Description:** Add a minimum interval between trajectory recomputations in the game loop. When cache misses, only recompute if at least 200ms has elapsed since the last computation. Uses stale cached data in between.
**Files:** `src/js/main.js`
**Acceptance Criteria:**
- [ ] Recomputation cascade runs at most 5x per second (200ms interval)
- [ ] Stale intersection/closest-approach data displayed between updates
- [ ] No visual artifacts at normal speeds (cache TTL still governs at low warp)
- [ ] At high warp, frame rate remains smooth
**Test Method:** Add performance.now() timing. Run at 1M x speed and verify no frame drops. Run at 1x speed and verify ghost planets still update responsively.

### Unit 4: Stagger Periodic Cache Cleanup
**Description:** Instead of clearing all caches simultaneously every 60 seconds, rotate cleanup across 6 cycles (one cache per 10-second interval). This spreads the rebuild cost.
**Files:** `src/js/main.js`
**Acceptance Criteria:**
- [ ] Each cache cleared individually on its own cycle
- [ ] All caches still cleared within 60 seconds total
- [ ] No frame spike at any single cleanup point
- [ ] Memory cleanup console log still fires (at reduced frequency per cache)
**Test Method:** Monitor console for cleanup messages. Run for >60 seconds and verify no frame stutters.

### Unit 5: Pre-compute Body Positions in detectClosestApproaches
**Description:** Before scanning trajectory segments, compute all body positions at all trajectory timestamps once and store in a lookup table. Currently, getPosition() is called 2x per segment per body (11,520 calls for 8 planets x 720 segments). With pre-computation, this drops to 720 x 8 = 5,760 calls (positions computed once per timestamp, shared across the body scan).
**Files:** `src/js/lib/intersectionDetector.js`
**Acceptance Criteria:**
- [ ] Closest approach results identical to before (same distances, same times)
- [ ] getPosition() called once per body per trajectory timestamp, not twice
- [ ] Intersection detector test suite passes unchanged
**Test Method:** Run intersection detector tests. Compare closest approach results with before-values for a known trajectory.

### Unit 6: Debounce Slider Input Events
**Description:** Wrap sail slider (deployment, yaw, pitch, sail count) and trajectory duration slider input handlers with a requestAnimationFrame-based debounce. Only the last value in each animation frame is applied.
**Files:** `src/js/ui/controls.js`
**Acceptance Criteria:**
- [ ] At most one sail update per animation frame during slider drag
- [ ] Final slider value always applied (no value loss)
- [ ] Slider responsiveness still feels immediate to user
- [ ] Trajectory duration slider similarly debounced
**Test Method:** Drag sliders rapidly. Verify values update smoothly, final position is correct. Verify predicted path and ghost planets still update.

### Unit 7: Add Dirty-Flag Optimization to UI Updates
**Description:** Add value comparison to uiUpdater.js so DOM updates only execute when the underlying value has actually changed. Cache previous values and skip textContent/classList updates when unchanged.
**Files:** `src/js/ui/uiUpdater.js`
**Acceptance Criteria:**
- [ ] DOM updates skipped when values unchanged between frames
- [ ] All displays still update correctly when values do change
- [ ] No visual lag or stale displays
- [ ] getElementById calls for mobile elements cached (called once, not per-frame)
**Test Method:** Verify all UI panels update correctly during gameplay. Change speed, zoom, sail settings and verify displays respond.

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Numeric hash collisions cause false cache hits | Low | High | Use large prime multiplier, test with known edge cases |
| Throttle interval too long, ghost planets feel laggy | Medium | Medium | Use 200ms (5 updates/sec), tunable constant |
| Debounce drops final slider value | Low | Medium | Use rAF-based approach that always applies latest value |
| Dirty-flag comparison misses a changed value | Low | High | Compare all fields explicitly, no deep-equal shortcuts |
| Pre-computed positions use more memory | Low | Low | 720 timestamps x 8 bodies x 3 coords = ~138KB (negligible) |

## 5. Testing Strategy

### 5.1 Console Test Suites
- Trajectory predictor tests: `import('/js/lib/trajectory-predictor.test.js').then(m => m.runAllTests())`
- Intersection detector tests: `import('/js/lib/intersectionDetector.crossing.test.js').then(m => m.runAllTests())`
- Orbital mechanics tests: `import('/js/lib/orbital.test.js').then(m => m.runAllTests())`

### 5.2 Manual Verification
- Run at 1x, 100,000x, 1,000,000x speeds
- Toggle all display options
- Adjust sail sliders during each speed
- Verify ghost planets update correctly
- Verify predicted path renders correctly
- Monitor frame rate via DevTools Performance panel
