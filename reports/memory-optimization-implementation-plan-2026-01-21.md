# Memory Optimization Implementation Plan

**Date:** 2026-01-21
**Status:** Draft

## 0. File Impact Summary

### Files to EDIT:
1. `src/js/ui/renderer.js` - Add gradient cache system with Map storage, cache key generation, and invalidation
2. `src/js/main.js` - Add frame counter, periodic cleanup function, and cleanup invocation in game loop

### Files to CREATE:
1. `reports/memory-optimization-spec-2026-01-21.md` - Feature specification
2. `reports/memory-optimization-implementation-plan-2026-01-21.md` - This document
3. `reports/memory-optimization-review-2026-01-21.md` - Review report
4. `reports/memory-optimization-verification-2026-01-21.md` - Verification report

### Files to DELETE:
- None

## 1. Problem Statement

### 1.1 Description

Browser crashes after 1-2 hours of gameplay due to memory exhaustion. The rendering system creates thousands of canvas gradient objects per second that accumulate in memory without being garbage collected efficiently.

### 1.2 Root Cause

Canvas gradient objects (`CanvasGradient`) created via `ctx.createLinearGradient()` and `ctx.createRadialGradient()` hold GPU resources that don't get released promptly. The game loop creates new gradient objects every frame (60 FPS) for the same visual elements, leading to:

- **Grid rendering:** 12 new gradients per frame = 720/sec
- **Body rendering:** ~20 new gradients per frame = 1,200/sec
- **Trajectory rendering:** 1 new gradient per frame = 60/sec

Total: ~2,000 gradient objects/second, ~7 million/hour

### 1.3 Constraints

- **Zero visual change:** Game must look identical before/after
- **No performance regression:** Must maintain 60 FPS
- **Vanilla JavaScript:** No external dependencies
- **Browser compatibility:** Must work in Chrome, Firefox, Safari
- **Non-invasive:** Minimal changes to existing render code

## 2. Solution Architecture

### 2.1 High-Level Design

**Two Independent Systems:**

1. **Gradient Cache Manager** (renderer.js)
   - Module-level `Map<string, CanvasGradient>` for gradient reuse
   - Cache keys based on gradient type and parameters
   - Automatic invalidation on canvas resize
   - LRU eviction when cache exceeds 100 entries

2. **Periodic Memory Cleanup** (main.js)
   - Frame counter increments each game loop iteration
   - Cleanup triggered every 3600 frames (60 seconds @ 60fps)
   - Clears all caches (gradient, trajectory, intersection)
   - Resets canvas state to release GPU resources

**Data Flow:**

```
Before:
render() → drawGrid() → ctx.createLinearGradient() × 12
                     → new CanvasGradient objects created
                     → memory accumulates

After:
render() → drawGrid() → getCachedGradient(key)
                     → cache hit: reuse existing gradient
                     → cache miss: create + store + return
                     → memory stable

Cleanup (every 60s):
gameLoop() → frameCount % 3600 === 0
          → clearGradientCache()
          → clearTrajectoryCache()
          → clearIntersectionCache()
          → ctx.save/restore
          → memory freed
```

### 2.2 Design Principles

1. **Lazy caching:** Only cache gradients that are expensive to create
2. **Fail-safe:** If caching fails, fall back to creating new gradient
3. **Observable:** Log cache stats and cleanup events
4. **Tunable:** Constants for intervals and limits
5. **Defensive:** Validate cache entries before use

### 2.3 Key Algorithms

**Gradient Cache Key Generation:**

```javascript
// For radial gradients (sun, planets)
key = `radial_${x}_${y}_${r1}_${r2}_${colorStops}`

// For linear gradients (grid lines)
key = `linear_${x1}_${y1}_${x2}_${y2}_${colorStops}`

// Example:
// "radial_400_300_0_10_#ffffff,#ffee88,#ffdd44,#ff9922"
```

**LRU Cache Eviction:**

```javascript
if (gradientCache.size >= MAX_CACHE_SIZE) {
    // Remove oldest entry (first key in Map)
    const firstKey = gradientCache.keys().next().value;
    gradientCache.delete(firstKey);
}
```

## 3. Units of Work

### Unit 1: Add Gradient Cache Infrastructure

**Description:** Create the gradient cache system in renderer.js without integrating it yet.

**Files:** `src/js/ui/renderer.js`

**Acceptance Criteria:**
- [ ] Module-level `gradientCache` Map declared
- [ ] `clearGradientCache()` function exists and works
- [ ] `getCachedGradient()` helper function exists
- [ ] Cache size limit enforced (MAX_CACHE_SIZE = 100)
- [ ] Console logging shows cache operations when debug enabled
- [ ] Game runs without errors (cache not used yet)

**Test Method:**
1. Run game in browser
2. Open console, call `clearGradientCache()`
3. Verify no errors
4. Verify cache Map exists in module scope

### Unit 2: Integrate Gradient Caching in drawGrid()

**Description:** Replace gradient creation in drawGrid() with cache lookups.

**Files:** `src/js/ui/renderer.js`

**Acceptance Criteria:**
- [ ] Grid radial line gradients use cache
- [ ] Cache keys include gradient parameters
- [ ] Visual appearance unchanged
- [ ] No console errors
- [ ] Cache hit/miss logged when debug enabled
- [ ] Frame rate unchanged

**Test Method:**
1. Run game and observe grid rendering
2. Enable debug mode, verify cache hits after first frame
3. Verify grid looks identical to before
4. Monitor FPS (should be 60)

### Unit 3: Integrate Gradient Caching in drawBody()

**Description:** Replace gradient creation in drawBody() for sun and planets with cache lookups.

**Files:** `src/js/ui/renderer.js`

**Acceptance Criteria:**
- [ ] Sun radial gradient uses cache
- [ ] Sun corona gradient uses cache
- [ ] Planet gradients use cache (if applicable)
- [ ] Visual appearance unchanged
- [ ] No console errors
- [ ] Cache statistics show reuse

**Test Method:**
1. Run game and observe sun/planet rendering
2. Verify sun appearance unchanged
3. Check cache stats showing reuse
4. Test with multiple planets visible

### Unit 4: Add Resize Handler for Cache Invalidation

**Description:** Clear gradient cache when canvas resizes to prevent stale gradients.

**Files:** `src/js/ui/renderer.js`

**Acceptance Criteria:**
- [ ] Resize event listener added
- [ ] Cache cleared on resize
- [ ] Gradients regenerate correctly after resize
- [ ] No visual glitches during resize
- [ ] Console logs cache clear on resize

**Test Method:**
1. Run game
2. Resize browser window
3. Verify cache cleared (console log)
4. Verify rendering correct after resize

### Unit 5: Add Periodic Cleanup System

**Description:** Implement frame counter and periodic cleanup in main.js.

**Files:** `src/js/main.js`

**Acceptance Criteria:**
- [ ] Frame counter increments each loop iteration
- [ ] `performMemoryCleanup()` function exists
- [ ] Cleanup calls clearTrajectoryCache()
- [ ] Cleanup calls clearIntersectionCache()
- [ ] Cleanup calls clearGradientCache()
- [ ] Cleanup performs canvas state reset
- [ ] Cleanup triggered every 3600 frames
- [ ] Console logs cleanup events

**Test Method:**
1. Run game and wait 60 seconds
2. Verify cleanup log appears in console
3. Verify game continues running normally
4. Check memory usage stabilizes over time

### Unit 6: Add Cleanup Configuration Constant

**Description:** Make cleanup interval configurable via constant.

**Files:** `src/js/main.js`

**Acceptance Criteria:**
- [ ] CLEANUP_INTERVAL constant defined
- [ ] Default value: 3600 frames
- [ ] Comment explains calculation (60 sec @ 60fps)
- [ ] Changing constant changes cleanup frequency
- [ ] Cleanup respects new interval

**Test Method:**
1. Change CLEANUP_INTERVAL to 600 (10 seconds)
2. Run game and verify cleanup every 10 seconds
3. Restore to 3600
4. Verify default behavior

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Cache key collisions | Low | Medium | Use specific parameters in keys, validate gradients |
| Memory leak from cache itself | Low | High | Enforce max cache size, clear on cleanup |
| Performance regression | Low | Medium | Profile before/after, optimize cache lookups |
| Visual glitches on resize | Medium | Low | Clear cache on resize, regenerate gradients |
| Cleanup interval too aggressive | Low | Low | Make configurable, default to conservative value |
| Canvas state corruption | Low | Medium | Defensive save/restore, validate context |

## 5. Testing Strategy

### 5.1 Unit Tests

No automated unit tests (vanilla JS, no test framework). Each unit has manual verification steps.

### 5.2 Integration Tests

**Memory Stability Test:**
1. Run game for 2 hours
2. Monitor browser memory usage (Chrome DevTools)
3. Verify memory growth <100MB over 2 hours
4. Verify no crashes

**Visual Regression Test:**
1. Take screenshot before changes
2. Take screenshot after changes
3. Compare pixel-by-pixel (manual)
4. Verify identical appearance

**Performance Test:**
1. Monitor FPS before changes (should be 60)
2. Monitor FPS after changes (should be 60)
3. Verify no frame drops during cleanup

### 5.3 Manual Verification

**Checklist:**
- [ ] Game runs without errors
- [ ] Grid rendering unchanged
- [ ] Sun/planet rendering unchanged
- [ ] Memory usage stable over 1+ hour
- [ ] Cleanup logs appear every 60 seconds
- [ ] Resize works correctly
- [ ] No console errors
- [ ] Frame rate stable at 60 FPS
