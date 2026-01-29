# Memory Optimization Specification

## 1. Executive Summary

Browser crashes after extended gameplay due to unbounded memory accumulation from canvas gradient objects and high-frequency cache churn. This feature implements gradient object caching and periodic memory cleanup to reduce memory pressure by ~80% and enable stable multi-hour gameplay sessions.

## 1.1 Estimated File Impact

### Files to EDIT:
- `src/js/ui/renderer.js` - Add gradient caching system
- `src/js/main.js` - Add periodic memory cleanup

### Files to CREATE:
- `reports/memory-optimization-spec-2026-01-21.md` - This document
- `reports/memory-optimization-implementation-plan-2026-01-21.md` - Implementation plan
- `reports/memory-optimization-review-2026-01-21.md` - Review report
- `reports/memory-optimization-verification-2026-01-21.md` - Verification report

## 2. Current State Analysis

### 2.1 Existing Systems

| System | Location | Purpose |
|--------|----------|---------|
| Canvas Rendering | `src/js/ui/renderer.js` | Renders game visuals every frame (60 FPS) |
| Game Loop | `src/js/main.js` | Main loop calling render/update functions |
| Trajectory Cache | `src/js/lib/trajectory-predictor.js` | Caches predicted trajectories (500ms TTL) |
| Intersection Cache | `src/js/core/gameState.js` | Caches orbit crossing detection results |

### 2.2 Data Flow

```
Game Loop (60 FPS)
  ↓
updatePositions()
  ↓
render()
  ├─ drawGrid() → Creates 12 gradient objects
  ├─ drawBody() → Creates 2 gradient objects per celestial body
  └─ drawPredictedTrajectory() → Creates 1 gradient object
```

**Current allocation rate:**
- Grid: 12 gradients/frame × 60 FPS = 720/sec = 43,200/min
- Bodies: ~20 gradients/frame × 60 FPS = 1,200/sec = 72,000/min
- Trajectory: 1 gradient/frame × 60 FPS = 60/sec = 3,600/min

**Total:** ~119,000 gradient objects/minute, ~7 million/hour

### 2.3 Relevant Code

- `renderer.js:drawGrid()` (lines 72-139) - Creates radial line gradients every frame
- `renderer.js:drawBody()` (lines 260-341) - Creates sun/planet gradients every frame
- `renderer.js:drawPredictedTrajectory()` (lines 566-703) - Creates glow gradients
- `main.js:gameLoop()` (lines 97-103) - Main render loop
- `trajectory-predictor.js:CACHE_TTL_MS` (line 20) - Cache time-to-live constant
- `gameState.js:isIntersectionCacheValid()` (lines 292-299) - Cache validation

## 3. Gap Analysis

### 3.1 Missing Capabilities

- [ ] Gradient object reuse mechanism
- [ ] Gradient cache invalidation on resize
- [ ] Periodic memory cleanup system
- [ ] Cleanup event logging/observability
- [ ] Cache size limits to prevent unbounded growth

### 3.2 Required Changes

- [ ] Add module-level gradient cache Map in renderer.js
- [ ] Replace gradient creation with cache lookups
- [ ] Add cache clear function in renderer.js
- [ ] Add frame counter in main.js
- [ ] Add periodic cleanup function in main.js
- [ ] Hook cleanup into game loop
- [ ] Add resize event handler to clear gradient cache

## 4. Open Questions

- [x] Should we cache trajectory glow gradients? **Decision: No - complexity not worth the small gain**
- [x] What cleanup interval is appropriate? **Decision: 3600 frames (60 seconds @ 60fps)**
- [x] Should gradient cache have max size? **Decision: Yes, 100 entries with LRU eviction**
- [x] Should cleanup be configurable? **Decision: Yes, via constant for now, could add UI later**

## 5. Success Criteria

**Memory Performance:**
- Gradient allocation rate reduced from ~119K/min to <100/min (>99% reduction)
- Stable memory usage over 2+ hour sessions
- No memory-related crashes in typical gameplay

**Behavioral:**
- Zero visual differences in rendering
- No performance regression (frame rate unchanged)
- No new bugs introduced

**Observability:**
- Cleanup events logged to console
- Cache statistics available for debugging
