# Performance Analysis Report: High Time Warp & Trajectory Prediction

**Date**: 2026-02-09
**Scope**: Game loop performance at high time warp (1M x), trajectory prediction system bottlenecks
**Files analyzed**: main.js, gameState.js, shipPhysics.js, trajectory-predictor.js, intersectionDetector.js, renderer.js, uiUpdater.js, controls.js, config.js

---

## Executive Summary

The game performs well at normal speeds but exhibits performance degradation at high time warp (1M x). The root causes are **not** the physics tick cost (which is constant per frame), but rather:

1. **Trajectory cache thrashing** at high warp speeds — orbital elements change fast enough to invalidate the hash every frame
2. **Cascade recomputation** — a single cache miss triggers trajectory prediction + intersection detection + closest approach + node crossings, all synchronously on the main thread
3. **Dual trajectory computation** — `predictTrajectory()` is called twice per frame (main.js for intersections + renderer.js for drawing), relying on cache to avoid redundant work
4. **No throttling on the recomputation cascade** — everything runs every frame if the cache misses

---

## Topic 1: High Time Warp Performance Pain Points

### 1.1 Cache Invalidation Accelerates with Time Warp

**The core problem**: The trajectory cache invalidates based on a hash of rounded orbital elements (`trajectory-predictor.js:64-94`). At high time warp, orbital elements change rapidly between frames because the physics applies a large timestep each frame:

| Speed | Days per frame | Element drift per frame | Cache behavior |
|-------|---------------|------------------------|----------------|
| 1x | 1.9e-7 days | Negligible | Stable (cache TTL expires before elements change) |
| 100,000x | 0.019 days | Small | Occasional misses |
| 1,000,000x | 0.193 days | Moderate | **Misses every few frames** |
| 10,000,000x | 1.93 days | Large | **Misses nearly every frame** |

The hash rounds `a` and `e` to 6 decimal places and angles to 4 decimal places (`trajectory-predictor.js:69-76`). At 1M x, the ship's semi-major axis shifts by ~0.0001 AU per frame with active thrust — enough to change the 6th decimal digit every 1-2 frames.

**Impact**: Every cache miss triggers the full recomputation cascade (see 1.3).

### 1.2 Single Large Timestep (No Sub-stepping)

The game applies the entire frame's time delta in a single physics step regardless of speed (`shipPhysics.js:235-372`):

```
At 1M x: updateShipPhysics(player, 0.193)  // one 0.193-day step
At 10M x: updateShipPhysics(player, 1.93)  // one 1.93-day step
```

This has two consequences:
- **Numerical accuracy risk**: Gauss's variational equations assume small perturbations. A 1.93-day step is not "small" — the RTN frame rotates significantly during that interval.
- **SOI detection gaps**: At extreme speeds, the ship can jump through an entire SOI in one frame, completely missing the entry/exit transitions. The trajectory-based SOI check (`checkSOIEntryTrajectory`) helps but can still miss at the highest speeds.

**However**, this is *not* a framerate bottleneck — it's a simulation accuracy issue. The physics computation itself is O(1) per frame regardless of speed.

### 1.3 Recomputation Cascade on Cache Miss

When the trajectory cache invalidates (`main.js:126-192`), a synchronous cascade runs:

1. **`predictTrajectory()`** — 720+ steps of RK2 integration (2 thrust calculations per step = 1440+ thrust evaluations)
2. **`detectIntersections()`** — scan 720 trajectory segments x ~50 bodies
3. **`detectClosestApproaches()`** — scan 720 segments x ~50 bodies, with `getPosition()` calls at each segment endpoint
4. **`detectNodeCrossings()`** — scan 720 segments for plane crossings

All of this runs synchronously in `updatePositions()` before the frame renders. At high time warp with cache misses every 1-2 frames, this cascade runs 30-60 times per second.

**Estimated cost per cascade**:
- `predictTrajectory`: ~5-15ms (720 steps x 2 thrust calculations x `getPosition`/`getVelocity`)
- `detectIntersections`: ~3-8ms (with refinement passes for eccentric orbits)
- `detectClosestApproaches`: ~5-10ms (720 x ~8 planets x 2 `getPosition` calls)
- `detectNodeCrossings`: ~1ms
- **Total: ~14-34ms per frame** when cache misses (budget is 16.6ms at 60 FPS)

### 1.4 Dual Trajectory Computation

`predictTrajectory()` is called in two places:
- `main.js:142` — generates high-res trajectory for intersection detection
- `renderer.js:939` — generates trajectory for visual rendering

Both use the same step configuration (`stepsPerDay: 12`, `maxSteps: 8760`), so the cache sharing works when the hash hasn't changed between calls in the same frame. But at high warp, the hash *can* change between these two calls if `advanceTime()` has caused sufficient orbital element drift.

### 1.5 Periodic Memory Cleanup Nukes All Caches

Every 3600 frames (~60 seconds), `performMemoryCleanup()` (`main.js:60-78`) clears ALL caches simultaneously:

```javascript
clearTrajectoryCache();
clearIntersectionCache();
clearClosestApproachCache();
clearNodeCrossingsCache();
clearGradientCache();
clearPlanetTextureCache();
```

This causes a guaranteed frame spike every 60 seconds as every cache rebuilds from scratch. At high time warp, this is particularly noticeable because the rebuild cascade is expensive.

### 1.6 `detectClosestApproaches` is the Hidden Bottleneck

`detectClosestApproaches()` (`intersectionDetector.js:930-1001`) calls `getPosition()` twice per body per trajectory segment:

```javascript
for (const body of celestialBodies) {
    for (let i = 0; i < trajectory.length - 1; i++) {
        const bodyPos1 = getPosition(body.elements, p1.time);  // Expensive!
        const bodyPos2 = getPosition(body.elements, p2.time);  // Expensive!
    }
}
```

For 720 segments x 8 planets = 11,520 `getPosition()` calls. Each involves Kepler equation solving (iterative), trigonometric functions, and 3D rotation matrices. This alone can cost 5-10ms.

### Recommendations for High Time Warp

| Priority | Recommendation | Expected Impact |
|----------|---------------|-----------------|
| **P0** | **Throttle the recomputation cascade** — instead of running every frame on cache miss, limit to once every 200-500ms regardless of cache state | Eliminates frame spikes, caps cascade cost to 2-5x per second |
| **P0** | **Decouple intersection detection from frame loop** — run `detectIntersections` + `detectClosestApproaches` on a timer (e.g. every 500ms) or via `requestIdleCallback`, not synchronously in `updatePositions()` | Removes 10-20ms from frame budget |
| **P1** | **Cache `getPosition()` results by body+time** — in `detectClosestApproaches`, body positions at trajectory timestamps are computed redundantly across bodies. Pre-compute all body positions once, then scan all bodies against pre-computed positions | 5-10x reduction in `getPosition()` calls |
| **P1** | **Stagger cleanup** — instead of clearing all caches at once, clear one cache per cleanup cycle (rotating), or use a more gradual cache aging policy | Eliminates 60-second spikes |
| **P2** | **Adaptive time sub-stepping** — for speeds above 100,000x, subdivide the physics step into smaller sub-steps (e.g. max 0.01 days per sub-step). This improves simulation accuracy, not framerate, but prevents orbital element corruption that causes NaN cascades | Improves simulation stability |
| **P2** | **Wider hash rounding at high warp** — dynamically adjust the hash rounding precision based on time warp speed. At 1M x, round to 4 decimal places instead of 6, extending effective cache lifetime from 1-2 frames to 10-20 frames | Reduces cache miss frequency 5-10x |

---

## Topic 2: Trajectory Prediction Pain Points

### 2.1 RK2 Integration Doubles Thrust Computation Cost

The trajectory predictor uses RK2 (midpoint) integration (`trajectory-predictor.js:317-456`). For each of the 720 steps:

1. Calculate thrust at start of step (1x `calculateSailThrust` + 1x `getVelocity`)
2. Propagate to midpoint (`applyThrust` for half-step)
3. Get midpoint position and velocity (1x `getPosition` + 1x `getVelocity`)
4. Calculate thrust at midpoint (1x `calculateSailThrust`)
5. Apply midpoint thrust for full step (1x `applyThrust`)

**Per step cost**: 2x `calculateSailThrust` + 2x `getVelocity` + 1x `getPosition` + 2x `applyThrust`

When in SOI, there's additional overhead for parent body position/velocity lookups (4 extra `getPosition`/`getVelocity` calls per step for coordinate transforms).

**Total for 720-step trajectory**: ~5,040 orbital mechanics function calls (in heliocentric mode), ~8,640 in SOI mode.

### 2.2 Step Count Scales Linearly with Duration

The step count is `duration * 12 steps/day`, capped at 8,760:

| Duration | Steps | Integration calls | Approx time |
|----------|-------|-------------------|-------------|
| 60 days | 720 | ~5,040 | ~5ms |
| 180 days | 2,160 | ~15,120 | ~15ms |
| 365 days | 4,380 | ~30,660 | ~30ms |
| 730 days (2yr) | 8,760 | ~61,320 | **~60ms** |
| 1825 days (5yr) | 8,760 (capped) | ~61,320 | **~60ms** |

At 2-year or longer durations, trajectory prediction alone can exceed the 16.6ms frame budget. The 8,760 step cap prevents it from getting worse, but 60ms is already 3.6 frames of latency.

### 2.3 No Incremental Update Capability

When the trajectory changes slightly (e.g., sail angle adjusted by 1 degree), the entire trajectory is recomputed from scratch. There's no mechanism to:
- Reuse the first N steps that haven't changed
- Compute only the divergent portion
- Use the previous trajectory as a warm start

This is a fundamental architectural limitation. Incremental updates would be complex because thrust at step N depends on state at step N-1, making the chain non-independent.

### 2.4 `JSON.stringify` for Cache Hashing

The cache hash uses `JSON.stringify()` on a constructed object (`trajectory-predictor.js:78-93`):

```javascript
return JSON.stringify({
    ...roundedElements,
    sailAngle: ...,
    sailPitch: ...,
    // ... 14 fields total
});
```

`JSON.stringify` is relatively expensive for a function called every frame. A numeric hash (XOR/FNV) of the rounded values would be ~10x faster.

### 2.5 Object Allocation Pressure

Each trajectory computation allocates:
- 720 trajectory point objects `{x, y, z, time}` (trajectory array)
- 720 velocity objects from `getVelocity()` (intermediate)
- 720 position objects from `getPosition()` (intermediate)
- 720+ thrust vector objects from `calculateSailThrust()` (intermediate)
- 720 intermediate `simElements` clones
- 1 hash string from `JSON.stringify`

**Total: ~3,600 object allocations per trajectory computation.** These all become garbage immediately, creating GC pressure. At high warp with cache misses every frame, this is ~216,000 allocations per second.

### 2.6 Intersection Detection Refinement Cost

For eccentric orbits (e > 0.05), `refineCrossingWithActualRadius()` (`intersectionDetector.js:613-680`) performs a secondary search over nearby trajectory segments:

```javascript
const searchWindow = Math.max(50, Math.ceil(traverseDays * stepsPerDay * 1.5));
for (let idx = startIdx; idx <= endIdx; idx++) {
    // ... findRadiusCrossing for each segment
}
```

For Mars (e=0.094), the search window can be 100+ segments, each with a full bisection refinement (12 iterations). If there are 4 crossings of Mars's orbit, that's 400+ segments × 12 iterations = 4,800 bisection steps.

### 2.7 Closest Approach Detection is O(N*M) with Expensive Inner Loop

`detectClosestApproaches()` is the most expensive detection function because it calls `getPosition()` twice per segment per body. With 720 segments and 8 major planets, that's 11,520 `getPosition()` calls. Unlike `detectIntersections()` (which uses pre-computed trajectory positions for radius checks), closest approach needs the body's actual position at each trajectory timestamp.

### Recommendations for Trajectory Prediction

| Priority | Recommendation | Expected Impact |
|----------|---------------|-----------------|
| **P0** | **Pre-compute body position lookup table** — before running `detectClosestApproaches`, compute each body's position at every trajectory timestamp once and store in a lookup table. Currently the same `getPosition(Mars, t=2451545.5)` is computed independently for each body scan. A shared lookup eliminates redundant calls. | Reduces `getPosition()` calls in closest approach from 11,520 to ~5,760 (body positions shared across segments) |
| **P0** | **Move heavy detection to async/idle** — run `detectClosestApproaches` and `detectNodeCrossings` via `requestIdleCallback` or on a timer, not in the synchronous frame pipeline. `detectIntersections` is the only one needed for visual rendering (ghost planets). | Removes 5-15ms from critical path |
| **P1** | **Reduce step count for intersection detection at high durations** — for trajectories > 365 days, use 6 steps/day instead of 12. The bisection refinement already handles sub-segment precision, so coarser base trajectory has minimal accuracy impact | 2x fewer integration steps for long trajectories |
| **P1** | **Replace `JSON.stringify` hash with numeric hash** — compute a fast numeric hash (e.g., multiply-XOR of rounded values) instead of constructing a JSON string each frame | Eliminates ~0.1ms per frame and 1 string allocation |
| **P2** | **Object pooling for trajectory points** — pre-allocate a fixed-size array of trajectory point objects and reuse them instead of creating new `{x, y, z, time}` objects each computation. Reset values in-place. | Eliminates ~3,600 allocations per trajectory computation |
| **P2** | **Euler integration option at high warp** — at speeds > 100,000x, visual trajectory accuracy is less important. Use single-step Euler instead of RK2, cutting thrust computation cost in half | 2x faster trajectory prediction during fast-forward |
| **P2** | **Adaptive step density** — use finer steps near the start of the trajectory (where accuracy matters for near-term navigation) and coarser steps toward the end (where uncertainty dominates anyway). E.g., 12 steps/day for first 60 days, 4 steps/day thereafter | Reduces total steps while preserving near-term accuracy |
| **P3** | **Web Worker offloading** — move trajectory prediction and intersection detection to a Web Worker. Post orbital elements and sail state; receive computed trajectory and intersections asynchronously. Display stale data until fresh results arrive. | Eliminates all trajectory computation from the main thread |

---

## Additional Findings

### UI Update Waste

`uiUpdater.js` runs ~30 DOM updates per frame without checking if values have changed:

- `updateScaleDisplay()` computes `Math.log10()` every frame even when zoom hasn't changed
- `updateSailDisplay()` calls `document.getElementById()` 4 times per frame for mobile elements
- `updateInclinationDisplay()` recalculates angles every frame even if ship/target haven't moved
- `updateDestinationDisplay()` calls `getClosestApproachForBody()` (array `.find()`) every frame

**Recommendation**: Add dirty flags or value comparison. Only update DOM when the underlying value has actually changed. This won't fix the high-warp issue but reduces baseline frame cost by ~1-2ms.

### Slider Input Events Lack Debouncing

Sail angle, deployment, and trajectory duration sliders fire `input` events on every pixel of slider movement with no debouncing (`controls.js:562-652`). Each event triggers `updateSailDisplay()` and implicitly invalidates the trajectory cache (because orbital elements change when deployment changes).

Dragging the deployment slider from 0% to 100% can fire 50-100 events in one second, each causing a trajectory cache invalidation on the next frame.

**Recommendation**: Debounce slider inputs by 100-200ms or batch updates to one per animation frame using `requestAnimationFrame`.

### Console Logging in Hot Paths

The yaw and pitch slider handlers include `console.log()` with velocity magnitude calculations on every input event (`controls.js:604-615`). Console logging is surprisingly expensive in browsers (~0.5ms per call) and should not be in event handlers for production use.

---

## Summary: Top Recommendations

### Quick Wins (High Impact, Low Effort)
1. **Throttle recomputation cascade** to max once per 200-500ms
2. **Move `detectClosestApproaches` and `detectNodeCrossings` off the frame path**
3. **Replace `JSON.stringify` hash with numeric hash**
4. **Remove `console.log` from slider event handlers**
5. **Debounce slider input events**

### Medium-Term (High Impact, Medium Effort)
6. **Pre-compute body position lookup table for detection functions**
7. **Stagger periodic cache cleanup** instead of clearing everything at once
8. **Add dirty-flag optimization to UI updates**
9. **Adaptive hash rounding at high warp speeds**

### Architectural (Highest Impact, Highest Effort)
10. **Web Worker for trajectory + intersection computation**
11. **Adaptive time sub-stepping for simulation accuracy at extreme speeds**
12. **Object pooling for trajectory point arrays**
