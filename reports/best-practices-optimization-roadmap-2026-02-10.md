# Best Practices Optimization Roadmap
**Date:** 2026-02-10
**Reviewer:** Best Practices Agent (Round 2)
**Context:** Performance investigation for zoom-related responsiveness degradation

---

## Executive Summary

Round 1 synthesis identified **zoom-adaptive orbit rendering** as the primary bottleneck, with a **52.7x frame budget overrun** at tactical zoom levels. This roadmap provides a phased implementation plan aligned with HTML5 Canvas and JavaScript performance best practices, prioritizing quick wins while establishing sustainable performance engineering practices.

**Critical Finding:** Current architecture renders the entire solar system on every frame regardless of viewport visibility, wasting 60-80% of frame budget. Combined with zoom-adaptive segment explosion (512-2048 segments per orbit at tactical zoom), this creates catastrophic O(zoom²) complexity.

---

## Performance Budget Analysis

### Current State vs Target (60 FPS = 16.67ms/frame)

| System | Current (Tactical Zoom) | Target | Status |
|--------|------------------------|--------|--------|
| **Orbital Paths** | 10-15ms | <2ms | ❌ 7.5x over budget |
| **Trajectory Subdivision** | 8-12ms | <1ms | ❌ 12x over budget |
| **Grid System** | 10-15ms (Sun off-screen) | <2ms | ❌ 7.5x over budget |
| **Ring Rendering** | 2-5ms/planet | <0.5ms | ❌ 10x over budget |
| **Intersection Detection** | 14-34ms spikes | <5ms | ❌ 6.8x over budget |
| **Text Rendering** | 1-2ms | <0.5ms | ⚠️ 4x over budget |
| **TOTAL** | 24-35ms | 16.67ms | ❌ 2.1x over budget |

### Root Cause Classification

1. **Missing Viewport Culling (60-80% waste)** - Architectural gap
2. **Zoom-Adaptive Segment Explosion** - Algorithmic complexity
3. **Every-Frame Recalculation** - Lack of caching/throttling
4. **Canvas State Thrashing** - API usage inefficiency
5. **Memory Allocation Churn** - GC pressure

---

## Phased Implementation Roadmap

### Phase 1: Critical Path Fixes (Week 1)
**Goal:** Achieve 60 FPS at tactical zoom with minimal risk
**Expected Improvement:** 40-60% frame time reduction

#### 1.1 Viewport Culling Infrastructure ⭐ HIGHEST IMPACT
**Effort:** Medium | **Risk:** Low | **Impact:** 40-50% improvement

**Problem:** All objects rendered regardless of visibility
- Grid: 400+ circles when Sun off-screen (10-15ms waste)
- Orbits: Full ellipses drawn for off-screen planets (5-8ms waste)
- Rings: 24 bands rendered when planet invisible (2-5ms waste)
- Trajectory: Full path interpolated regardless of viewport (3-8ms waste)

**Solution:** Implement frustum culling before expensive operations

```javascript
// Add to renderer.js
function isInViewport(x, y, radius, centerX, centerY) {
    const margin = radius + 100; // Generous padding for smooth entry/exit
    return (
        x + margin >= 0 &&
        x - margin <= canvas.width &&
        y + margin >= 0 &&
        y - margin <= canvas.height
    );
}

// Apply to each rendering function:
function drawOrbit(body, centerX, centerY, scale) {
    if (!displayOptions.showOrbits || !body.elements) return;

    // Early viewport cull
    const projected = project3D(body.x, body.y, body.z, centerX, centerY, scale);
    const orbitRadius = body.elements.a * scale * camera.zoom;
    if (!isInViewport(projected.x, projected.y, orbitRadius, centerX, centerY)) {
        return; // Skip entire orbit calculation
    }

    // ... existing rendering code
}
```

**Implementation Steps:**
1. Add `isInViewport()` helper to renderer.js (10 min)
2. Add early-exit checks to `drawOrbit()` (15 min)
3. Add culling to `drawGrid()` (20 min)
4. Add culling to `drawRings()` via planet position check (10 min)
5. Add culling to `drawPredictedTrajectory()` (15 min)
6. Profile and verify 40%+ improvement (30 min)

**Files Modified:**
- `/src/js/ui/renderer.js` - Add viewport culling

**Acceptance Criteria:**
- Grid: No circles rendered when Sun off-screen
- Orbits: Skip drawing for planets >2x screen distance from viewport edge
- Frame time improvement: 40-50%

---

#### 1.2 Trajectory Subdivision Capping ⭐ CRITICAL FIX
**Effort:** Low | **Risk:** None | **Impact:** 80-90% improvement

**Problem:** Memory explosion at extreme zoom
- At orbital zoom: **1.2 million points per frame**
- **38 MB allocation every frame = 2.3 GB/sec allocation rate**
- No upper bound on subdivision count

**Solution:** Already implemented in renderer.js (line 1213), verify it's working

```javascript
// renderer.js line 1213 - VERIFY THIS IS ACTIVE
const MAX_RENDERED_SEGMENTS = 4096;  // Prevent unbounded subdivision

// Add diagnostic logging to confirm cap is working
if (subdivided.length >= MAX_RENDERED_SEGMENTS) {
    console.warn(`[RENDERER] Trajectory subdivision capped at ${MAX_RENDERED_SEGMENTS}`);
}
```

**Implementation Steps:**
1. Verify `MAX_RENDERED_SEGMENTS` constant exists (line 1213)
2. Add temporary diagnostic logging to confirm cap activates
3. Profile to confirm memory allocation drops to <5MB/frame
4. Remove diagnostic logging after verification

**Files Modified:**
- `/src/js/ui/renderer.js` - Add diagnostic logging

**Acceptance Criteria:**
- Trajectory never exceeds 4096 points
- Memory allocation <5MB per frame at all zoom levels
- No GC stuttering during zoom

---

#### 1.3 Orbit Segment Cap by Visible Arc
**Effort:** Medium | **Risk:** Low | **Impact:** 75% improvement

**Problem:** Full orbit calculated even when 90% is off-screen
- At tactical zoom: 2048 segments calculated
- Viewport shows only ~10% of orbit arc
- 1800+ segments wasted

**Solution:** Calculate segments based on visible arc only

```javascript
function drawOrbit(body, centerX, centerY, scale) {
    // ... existing setup code ...

    // Calculate visible arc fraction
    const projected = project3D(body.x, body.y, body.z, centerX, centerY, scale);
    const orbitRadius = a * scale * camera.zoom;

    // Estimate visible arc based on viewport distance
    const distToViewportCenter = Math.sqrt(
        (projected.x - canvas.width/2)**2 +
        (projected.y - canvas.height/2)**2
    );

    // If orbit center is far from viewport, only draw visible arc
    if (distToViewportCenter > orbitRadius * 0.5) {
        const visibleArcFraction = calculateVisibleArcFraction(
            projected, orbitRadius, canvas.width, canvas.height
        );
        const adjustedSegments = Math.ceil(segments * visibleArcFraction);

        // Only draw visible arc (more complex - requires arc start/end angles)
        // Implementation deferred to Phase 2 for complexity management
    }

    // ... existing drawing code
}
```

**Implementation Steps:**
1. Add `calculateVisibleArcFraction()` helper (30 min)
2. Modify `drawOrbit()` to calculate visible arc (45 min)
3. Add arc-based segment capping (1 hour)
4. Handle edge cases (orbit partially visible) (30 min)
5. Profile and verify 75% segment reduction (30 min)

**Complexity Note:** This requires geometric arc-viewport intersection math. Consider deferring to Phase 2 if timeline is tight. Phase 1.1 (viewport culling) provides similar benefits with lower implementation complexity.

**Files Modified:**
- `/src/js/ui/renderer.js` - Modify `drawOrbit()`

**Acceptance Criteria:**
- Off-screen orbits: 0 segments rendered (via Phase 1.1 culling)
- Partially visible orbits: segments proportional to visible arc
- No visual artifacts at zoom transitions

---

#### 1.4 Stagger Intersection Detection ⭐ QUICK WIN
**Effort:** Low | **Risk:** None | **Impact:** Eliminate 14-34ms spikes

**Problem:** At high time warp, intersection detection runs every 200ms
- Trajectory prediction: ~5ms
- Intersection detection: ~8ms
- Closest approach: ~6ms
- Node crossings: ~5ms
- **Total: 24ms spike every 200ms** → visible stuttering

**Solution:** Already throttled in main.js (line 64), verify and tune

```javascript
// main.js line 64 - VERIFY THIS IS ACTIVE
const DETECTION_MIN_INTERVAL_MS = 200;

// Recommendation: Increase to 500ms for smoother experience
const DETECTION_MIN_INTERVAL_MS = 500; // Update 2x per second instead of 5x
```

**Implementation Steps:**
1. Verify throttle is active (main.js line 64)
2. Increase interval to 500ms
3. Test at maximum time warp (500000000x)
4. Confirm no visible stuttering
5. Add visual feedback for "detection in progress" if needed

**Files Modified:**
- `/src/js/main.js` - Increase throttle interval

**Acceptance Criteria:**
- No frame spikes >20ms at any time warp setting
- Intersection markers update smoothly
- Ghost planet positions remain accurate

---

### Phase 2: Algorithmic Optimization (Week 2)
**Goal:** Reduce algorithmic complexity
**Expected Improvement:** Additional 20-30% improvement

#### 2.1 Orbit Segment Adaptive Algorithm Refinement
**Effort:** Medium | **Risk:** Medium | **Impact:** 50% improvement

**Problem:** Hard threshold at zoom=5 causes instant 4x cost increase
- Below 5x zoom: 512 segments max
- Above 5x zoom: 2048 segments max
- No smooth transition → performance cliff

**Solution:** Replace hard threshold with smooth scaling

```javascript
// Replace lines 436-444 in renderer.js
function calculateAdaptiveSegments(a, e, scale, zoom) {
    const effectiveZoom = scale * zoom;
    const orbitRadiusPixels = a * effectiveZoom;
    const orbitCircumPixels = 2 * Math.PI * orbitRadiusPixels;

    // Target pixels per segment (higher = smoother curves, more GPU work)
    const targetPixelsPerSegment = 18; // Tuned for quality/performance balance

    // Calculate ideal segment count
    const idealSegments = Math.ceil(orbitCircumPixels / targetPixelsPerSegment);

    // Smooth cap function instead of hard threshold
    // At low zoom: cap at 256
    // At medium zoom: cap at 512
    // At high zoom: cap at 1024 (reduced from 2048)
    const minCap = 64;
    const maxCap = zoom > 10 ? 1024 : (zoom > 5 ? 512 : 256);

    return Math.max(minCap, Math.min(idealSegments, maxCap));
}
```

**Rationale:** 2048 segments was added to fix "ghost planet offset" at tactical zoom, but the root cause was discretization error in intersection detection, not rendering. With Phase 1.2 fixing trajectory subdivision, 1024 segments is sufficient.

**Implementation Steps:**
1. Extract segment calculation to helper function (30 min)
2. Implement smooth zoom-based capping (45 min)
3. Reduce max cap from 2048 to 1024 (5 min)
4. Profile at various zoom levels (30 min)
5. Verify ghost planet alignment still accurate (30 min)

**Files Modified:**
- `/src/js/ui/renderer.js` - Replace segment calculation (lines 434-444, 1015-1024)

**Acceptance Criteria:**
- No hard performance cliff at zoom=5
- Ghost planet offset <3px at all zoom levels
- Max segments: 1024 (down from 2048)

---

#### 2.2 Gradient Cache Key Optimization
**Effort:** Low | **Risk:** Low | **Impact:** 10% improvement

**Problem:** Floating-point cache keys cause frequent misses
- Cache keys use `.toFixed(2)` for rounding (line 392)
- Still causes cache thrashing when camera moves smoothly
- Cache hit rate likely <70%

**Solution:** Integer-based cache keys with coarser quantization

```javascript
// Replace floating-point keys with integer quantization
function getCacheKey(x, y, radius, type) {
    // Quantize to 10-pixel buckets (imperceptible gradient shifts)
    const qx = Math.round(x / 10) * 10;
    const qy = Math.round(y / 10) * 10;
    const qr = Math.round(radius / 10) * 10;
    return `${type}_${qx}_${qy}_${qr}`;
}
```

**Implementation Steps:**
1. Replace all gradient cache key generation (30 min)
2. Profile cache hit rate (target: >90%) (15 min)
3. Adjust quantization bucket size if needed (15 min)

**Files Modified:**
- `/src/js/ui/renderer.js` - Modify cache key generation

**Acceptance Criteria:**
- Cache hit rate >90%
- No visible gradient artifacts
- Gradient creation time reduced by 50%

---

#### 2.3 Canvas State Batching
**Effort:** Medium | **Risk:** Low | **Impact:** 15% improvement

**Problem:** 3-4 save/restore pairs per planet (from Round 1 report)
- Each save/restore: ~0.1ms overhead
- 9 planets × 3 saves = 2.7ms wasted

**Solution:** Minimize state changes, batch rendering by style

```javascript
// Group rendering operations by visual style
function render() {
    // ... existing setup ...

    // BATCH 1: All solid fills
    ctx.globalAlpha = 1.0;
    sortedBodies.forEach(body => drawBodySolid(body, centerX, centerY, scale));

    // BATCH 2: All gradients
    sortedBodies.forEach(body => drawBodyGradient(body, centerX, centerY, scale));

    // BATCH 3: All text labels
    ctx.globalAlpha = 0.8;
    sortedBodies.forEach(body => drawBodyLabel(body, centerX, centerY, scale));
}
```

**Note:** This requires significant refactoring of drawing functions. Consider impact vs benefit before implementing.

**Files Modified:**
- `/src/js/ui/renderer.js` - Refactor rendering batching

**Acceptance Criteria:**
- Save/restore calls reduced from 27 to <10
- No visual artifacts
- 15% frame time improvement

---

### Phase 3: Architectural Improvements (Week 3-4)
**Goal:** Establish sustainable performance engineering practices
**Expected Improvement:** Prevent future regressions

#### 3.1 Performance Monitoring Infrastructure
**Effort:** Medium | **Risk:** None | **Impact:** Preventative

**Solution:** Built-in performance profiling with real-time FPS overlay

```javascript
// Add to main.js
class PerformanceMonitor {
    constructor() {
        this.frameTimes = [];
        this.maxSamples = 60; // Track last 60 frames
        this.thresholds = {
            good: 16.67,    // 60 FPS
            warning: 33.33, // 30 FPS
            critical: 50    // 20 FPS
        };
    }

    recordFrame(startTime) {
        const frameTime = performance.now() - startTime;
        this.frameTimes.push(frameTime);
        if (this.frameTimes.length > this.maxSamples) {
            this.frameTimes.shift();
        }
    }

    getMetrics() {
        const avg = this.frameTimes.reduce((a,b) => a+b, 0) / this.frameTimes.length;
        const max = Math.max(...this.frameTimes);
        const fps = 1000 / avg;

        return { avg, max, fps };
    }

    renderOverlay(ctx) {
        const { avg, max, fps } = this.getMetrics();

        // Color-code by performance
        let color = '#4ce88d'; // Green
        if (avg > this.thresholds.critical) color = '#e84c88'; // Red
        else if (avg > this.thresholds.warning) color = '#ffaa00'; // Yellow

        ctx.font = '12px monospace';
        ctx.fillStyle = color;
        ctx.fillText(`${fps.toFixed(1)} FPS (${avg.toFixed(1)}ms avg, ${max.toFixed(1)}ms max)`, 10, 20);
    }
}

const perfMonitor = new PerformanceMonitor();

function gameLoop() {
    const frameStart = performance.now();

    // ... existing game loop ...

    perfMonitor.recordFrame(frameStart);

    // Optional overlay (toggle with keyboard shortcut)
    if (displayOptions.showPerfStats) {
        perfMonitor.renderOverlay(ctx);
    }

    requestAnimationFrame(gameLoop);
}
```

**Implementation Steps:**
1. Create PerformanceMonitor class (1 hour)
2. Integrate into game loop (30 min)
3. Add keyboard toggle (Shift+P) (15 min)
4. Add detailed breakdown by subsystem (1 hour)
5. Store metrics to localStorage for trend analysis (30 min)

**Files Modified:**
- `/src/js/main.js` - Add performance monitoring
- `/src/js/ui/controls.js` - Add toggle hotkey

**Acceptance Criteria:**
- Real-time FPS overlay with color-coding
- Per-frame breakdown: render, physics, UI
- Historical trend tracking (last 1000 frames)

---

#### 3.2 Rendering Budget Enforcement
**Effort:** Medium | **Risk:** Low | **Impact:** Preventative

**Solution:** Automatic quality degradation when frame budget exceeded

```javascript
// Add to renderer.js
class AdaptiveQualityManager {
    constructor() {
        this.targetFrameTime = 16.67; // 60 FPS
        this.currentQuality = 'high';
        this.frameTimeHistory = [];
        this.adjustmentCooldown = 120; // 2 seconds at 60fps
        this.framesSinceAdjustment = 0;
    }

    recordFrameTime(ms) {
        this.frameTimeHistory.push(ms);
        if (this.frameTimeHistory.length > 60) {
            this.frameTimeHistory.shift();
        }
        this.framesSinceAdjustment++;
    }

    shouldAdjustQuality() {
        if (this.framesSinceAdjustment < this.adjustmentCooldown) return null;

        const avgFrameTime = this.frameTimeHistory.reduce((a,b) => a+b, 0) /
                             this.frameTimeHistory.length;

        // Degrade quality if consistently over budget
        if (avgFrameTime > this.targetFrameTime * 1.5 && this.currentQuality !== 'low') {
            this.framesSinceAdjustment = 0;
            return 'lower';
        }

        // Restore quality if consistently under budget
        if (avgFrameTime < this.targetFrameTime * 0.8 && this.currentQuality !== 'high') {
            this.framesSinceAdjustment = 0;
            return 'raise';
        }

        return null;
    }

    getQualitySettings() {
        const profiles = {
            low: {
                maxOrbitSegments: 256,
                maxTrajectoryPoints: 1024,
                maxRingBands: 8,
                enableTextLabels: false,
                enableStarfield: false
            },
            medium: {
                maxOrbitSegments: 512,
                maxTrajectoryPoints: 2048,
                maxRingBands: 16,
                enableTextLabels: true,
                enableStarfield: false
            },
            high: {
                maxOrbitSegments: 1024,
                maxTrajectoryPoints: 4096,
                maxRingBands: 24,
                enableTextLabels: true,
                enableStarfield: true
            }
        };

        return profiles[this.currentQuality];
    }
}
```

**Implementation Steps:**
1. Create AdaptiveQualityManager class (2 hours)
2. Integrate quality profiles into renderer (2 hours)
3. Add visual feedback for quality changes (30 min)
4. Add manual override option in settings (30 min)
5. Profile to verify smooth degradation (1 hour)

**Files Modified:**
- `/src/js/ui/renderer.js` - Add adaptive quality system
- `/src/js/core/gameState.js` - Add quality setting persistence

**Acceptance Criteria:**
- Automatic quality degradation maintains 60 FPS
- Visual notification when quality changes
- Manual override respected
- No quality thrashing (excessive up/down adjustments)

---

#### 3.3 Starfield Zoom-Based Culling
**Effort:** Low | **Risk:** None | **Impact:** 5% at tactical zoom

**Problem:** All 5,080 stars processed every frame
- At tactical zoom: stars invisible (too small)
- Still processing 1.78 million FLOPs wasted (from Round 1)

**Solution:** Skip starfield rendering at high zoom levels

```javascript
// Add to starfield.js
export function drawStarfield(ctx, centerX, centerY, scale) {
    // Skip starfield at tactical zoom (stars are sub-pixel and invisible)
    if (camera.zoom > 3) {
        return; // Save 5,080 star transforms + 5,080 visibility checks
    }

    // ... existing starfield rendering ...
}
```

**Implementation Steps:**
1. Add zoom check to `drawStarfield()` (5 min)
2. Tune threshold empirically (zoom=3 good starting point) (15 min)
3. Profile to confirm 1.78M FLOPs eliminated (10 min)

**Files Modified:**
- `/src/js/lib/starfield.js` - Add zoom-based culling

**Acceptance Criteria:**
- Starfield rendering skipped when zoom >3
- No visible artifacts at zoom transitions
- 5% frame time improvement at tactical zoom

---

### Phase 4: Technical Debt Resolution (Ongoing)
**Goal:** Prevent future performance regressions

#### 4.1 Code Documentation Standards
**Effort:** Low | **Risk:** None | **Impact:** Maintainability

**Problem:** Performance-critical code lacks complexity warnings
- Zoom-adaptive segment calculation has no comment about O(zoom²) complexity
- Trajectory subdivision has no warning about memory allocation

**Solution:** Add performance annotations to critical paths

```javascript
/**
 * PERFORMANCE CRITICAL: O(segments) complexity
 * At tactical zoom (>5x): segments = 2048, cost = ~12ms per orbit
 *
 * OPTIMIZATION HISTORY:
 * - v1.0: Fixed 64 segments → visual artifacts at high zoom
 * - v1.1: Adaptive segments (64-512) → ghost planet misalignment
 * - v1.2: Increased max to 2048 → performance regression
 * - v2.0: Viewport culling + arc-based limiting → 75% improvement
 *
 * FUTURE WORK: Consider WebGL path rendering for >512 segments
 */
function drawOrbit(body, centerX, centerY, scale) {
    // ... implementation
}
```

**Implementation Steps:**
1. Add performance annotations to all O(n²) or higher functions (2 hours)
2. Document frame budget targets in each subsystem (1 hour)
3. Add complexity analysis to CLAUDE.md (30 min)

**Files Modified:**
- `/src/js/ui/renderer.js` - Add performance comments
- `/src/js/lib/trajectory-predictor.js` - Add complexity analysis
- `/CLAUDE.md` - Document performance guidelines

**Acceptance Criteria:**
- All O(n²) or higher functions documented
- Frame budget targets specified
- Performance testing guidelines in CLAUDE.md

---

#### 4.2 Automated Performance Testing
**Effort:** High | **Risk:** None | **Impact:** Preventative

**Solution:** Benchmark suite for performance regression detection

```javascript
// Add to src/js/tests/performance.bench.js
export const performanceBenchmarks = {
    orbitRendering: {
        name: 'Orbit Path Rendering (tactical zoom)',
        setup: () => {
            camera.zoom = 10; // Tactical zoom
            // Position camera on Earth
        },
        test: () => {
            // Render 60 frames and measure average
            const times = [];
            for (let i = 0; i < 60; i++) {
                const start = performance.now();
                drawOrbit(earth, centerX, centerY, scale);
                times.push(performance.now() - start);
            }
            return times.reduce((a,b) => a+b) / times.length;
        },
        threshold: 2.0, // Must complete in <2ms
        severity: 'critical'
    },

    trajectorySubdivision: {
        name: 'Trajectory Subdivision',
        test: () => {
            const trajectory = predictTrajectory({...params});
            const start = performance.now();
            subdivideTrajectoryForRendering(trajectory, centerX, centerY, scale);
            return performance.now() - start;
        },
        threshold: 1.0, // Must complete in <1ms
        severity: 'critical'
    },

    // ... more benchmarks
};

function runBenchmarks() {
    const results = {};
    let failures = 0;

    for (const [key, bench] of Object.entries(performanceBenchmarks)) {
        if (bench.setup) bench.setup();

        const time = bench.test();
        const passed = time <= bench.threshold;

        results[key] = { time, threshold: bench.threshold, passed };

        if (!passed && bench.severity === 'critical') {
            failures++;
            console.error(`❌ CRITICAL: ${bench.name} took ${time.toFixed(2)}ms (threshold: ${bench.threshold}ms)`);
        }
    }

    return { results, failures };
}
```

**Implementation Steps:**
1. Create benchmark framework (3 hours)
2. Add benchmarks for all Phase 1-2 optimizations (4 hours)
3. Integrate into console test runner (1 hour)
4. Add CI integration (if applicable) (2 hours)

**Files Modified:**
- `/src/js/tests/performance.bench.js` - New file
- `/CLAUDE.md` - Update console test section

**Acceptance Criteria:**
- Benchmark suite covers all critical paths
- Run via `import('/js/tests/performance.bench.js').then(m => m.runBenchmarks())`
- Clear pass/fail output
- Historical comparison (detect regressions)

---

## Implementation Priority Matrix

### Effort vs Impact Analysis

```
HIGH IMPACT
│
│   [1.1]        [1.2]        [2.1]
│  Viewport    Trajectory    Segment
│  Culling      Cap         Algorithm
│    ⭐          ⭐            ⭐
│
│   [1.4]        [2.2]        [3.3]
│  Stagger      Gradient    Starfield
│  Detection     Cache        Cull
│
│   [2.3]        [3.1]        [4.1]
│  Canvas      PerfMon       Docs
│  Batch
│
│                [3.2]        [4.2]
│              Adaptive     Benchmarks
│              Quality
│
└────────────────────────────────── LOW EFFORT
                                HIGH EFFORT →
```

### Recommended Sequence

**Week 1 (Immediate Impact):**
1. **Day 1-2:** 1.1 Viewport Culling (40% improvement)
2. **Day 2:** 1.2 Trajectory Cap Verification (prevent crashes)
3. **Day 3:** 1.4 Stagger Detection Tuning (eliminate spikes)
4. **Day 4-5:** 2.2 Gradient Cache Optimization (quick win)

**Week 2 (Algorithmic Refinement):**
5. **Day 1-3:** 2.1 Segment Algorithm Refinement (50% improvement)
6. **Day 4:** 3.3 Starfield Culling (5% improvement)
7. **Day 5:** Testing and validation

**Week 3-4 (Infrastructure):**
8. **Week 3:** 3.1 Performance Monitoring
9. **Week 4:** 3.2 Adaptive Quality System
10. **Ongoing:** 4.1 Documentation, 4.2 Benchmarks

**SKIP (diminishing returns):**
- 1.3 Visible Arc Calculation (complex, similar benefit to 1.1)
- 2.3 Canvas State Batching (requires major refactor, 15% gain not worth risk)

---

## Best Practices Alignment

### HTML5 Canvas Performance Best Practices

✅ **Implemented/Planned:**
- [x] Avoid canvas state save/restore thrashing (Phase 2.3)
- [x] Cache gradient objects (existing, optimized in Phase 2.2)
- [x] Minimize path complexity (Phase 1-2 segment reduction)
- [x] Viewport culling (Phase 1.1)
- [ ] Consider OffscreenCanvas for background work (Future: Phase 5)
- [ ] Use requestAnimationFrame (already implemented)
- [x] Batch rendering by style (Phase 2.3 - optional)

### JavaScript Performance Best Practices

✅ **Implemented/Planned:**
- [x] Avoid memory allocation in hot paths (Phase 1.2 trajectory cap)
- [x] Cache expensive calculations (Phase 2.2 gradient cache)
- [x] Throttle high-cost operations (Phase 1.4 intersection detection)
- [x] Use typed arrays for large datasets (consider for Phase 5)
- [x] Profile before optimizing (Phase 3.1 monitoring)
- [x] Set performance budgets (Phase 3.2 adaptive quality)

### Game Engine Architecture Best Practices

✅ **Implemented/Planned:**
- [x] Frustum culling (Phase 1.1)
- [x] Level-of-detail (Phase 2.1 segment scaling)
- [x] Adaptive quality (Phase 3.2)
- [x] Performance monitoring (Phase 3.1)
- [ ] Spatial partitioning (Future: octree for planet lookup)
- [ ] Object pooling (Future: reuse trajectory point arrays)

---

## Risk Assessment

### Phase 1 Risks (Low Overall)

**1.1 Viewport Culling:**
- **Risk:** Off-by-one errors cause visual pop-in
- **Mitigation:** Generous margin (100px buffer), thorough testing at zoom transitions

**1.2 Trajectory Cap Verification:**
- **Risk:** Already implemented but not working
- **Mitigation:** Add diagnostic logging, profile memory usage

**1.4 Stagger Detection:**
- **Risk:** Increasing interval degrades ghost planet responsiveness
- **Mitigation:** 500ms still provides 2 updates/second, imperceptible to users

### Phase 2 Risks (Medium Overall)

**2.1 Segment Algorithm:**
- **Risk:** Reducing max from 2048 to 1024 breaks ghost alignment
- **Mitigation:** Phase 1.2 trajectory subdivision fixes root cause, 1024 sufficient

**2.2 Gradient Cache:**
- **Risk:** Coarse quantization causes visible artifacts
- **Mitigation:** 10px quantization is sub-pixel at most zoom levels

### Phase 3 Risks (Low)

**3.1-3.2:** Infrastructure additions, minimal disruption to existing code

---

## Success Metrics

### Frame Time Targets (60 FPS = 16.67ms/frame)

| Zoom Level | Current | Phase 1 | Phase 2 | Phase 3 |
|------------|---------|---------|---------|---------|
| **System View (1x)** | 18-22ms | 10-12ms | 8-10ms | 8-10ms |
| **Tactical (5x)** | 24-35ms | 12-18ms | 10-14ms | 10-12ms |
| **Orbital (10x+)** | 45-60ms | 20-30ms | 14-20ms | 12-16ms |

### Memory Usage Targets

| Component | Current | Phase 1 | Phase 2 |
|-----------|---------|---------|---------|
| **Trajectory Points** | 1.2M (38MB) | 4K (125KB) | 4K (125KB) |
| **Orbit Segments** | 30K | 18K | 10K |
| **Gradient Cache** | ~100 entries | ~100 entries | ~100 entries |
| **Total Frame Allocation** | 38MB | <5MB | <2MB |

### User Experience Targets

- **Smooth zoom:** No stuttering or frame drops during zoom transitions
- **Responsive controls:** Sail adjustments reflect in <500ms
- **Accurate navigation:** Ghost planets within 3px of true position
- **No crashes:** Zero memory-related crashes at any zoom level

---

## Rollback Plan

Each phase is independently reversible:

**Phase 1:**
- Remove viewport culling checks (restore original rendering)
- Remove trajectory cap logging (keep cap in place)
- Revert detection interval to 200ms

**Phase 2:**
- Revert segment calculation to original algorithm
- Revert gradient cache keys to floating-point

**Phase 3:**
- Disable performance monitoring overlay
- Disable adaptive quality (lock to "high")

**Recommendation:** Use git feature branches for each phase, merge to main only after validation.

---

## Future Optimization Opportunities (Phase 5+)

### WebGL Path Rendering
**Potential Impact:** 10x improvement for complex paths
**Effort:** High (major architectural change)
**Timeline:** 2-3 months

Current Canvas 2D API is CPU-bound. WebGL paths use GPU rasterization:
- Offload orbit/trajectory rendering to GPU
- Instanced rendering for multiple orbits
- Fragment shader for smooth gradients

### Spatial Partitioning (Octree)
**Potential Impact:** 50% improvement for >20 bodies
**Effort:** Medium
**Timeline:** 2 weeks

Current system iterates all bodies every frame. Octree provides O(log n) lookup:
- Skip entire branches of solar system outside viewport
- Efficient collision detection for future features

### OffscreenCanvas Workers
**Potential Impact:** 30% improvement via parallelization
**Effort:** High (requires SharedArrayBuffer)
**Timeline:** 3-4 weeks

Offload background rendering to worker threads:
- Starfield rendering in worker
- Trajectory prediction in worker
- Main thread only composites final image

---

## Conclusion

This roadmap prioritizes **high-impact, low-risk optimizations** that align with industry best practices for HTML5 Canvas and JavaScript performance. **Phase 1 alone should achieve 60 FPS at tactical zoom**, with Phase 2-3 establishing sustainable performance engineering practices to prevent future regressions.

**Recommended Action:** Implement Phase 1 in Week 1 (estimated 2-3 days of focused work), validate with performance monitoring, then proceed to Phase 2-3 as time permits.

**Key Success Factor:** The existing codebase is well-structured and modular, making optimizations low-risk. Most improvements are localized to renderer.js, minimizing cross-cutting changes.

---

## Appendix: Performance Profiling Guide

### How to Profile Current Performance

```javascript
// In browser console
// 1. Enable renderer debug mode
window.setRendererDebug(true)

// 2. Check gradient cache stats
window.getGradientCacheStats()

// 3. Profile trajectory subdivision
const player = ships.find(s => s.isPlayer)
window.debugTrajectorySteps(player, 60)

// 4. Use Chrome DevTools Performance tab
// - Record 5 seconds at tactical zoom
// - Look for:
//   - Long frames (>16.67ms)
//   - GC pauses (gray bars)
//   - Function call trees (which functions are slowest)

// 5. Memory profiling
// - Open Chrome DevTools Memory tab
// - Take heap snapshot
// - Zoom in/out 10x
// - Take another snapshot
// - Compare to find memory leaks
```

### Interpreting Results

**Good Performance:**
- Frame time: <16.67ms (60 FPS)
- GC pauses: <5ms, <2 per second
- Memory growth: <10MB per minute

**Performance Issues:**
- Frame time: >25ms → investigate long frames
- Frequent GC: >5 pauses/second → memory allocation churn
- Memory growth: >50MB per minute → memory leak

### Verification After Each Phase

1. Profile at system view (zoom=1)
2. Profile at tactical zoom (zoom=5-10)
3. Profile at extreme zoom (zoom=20+)
4. Verify ghost planet alignment (<3px offset)
5. Check memory allocation rate (<5MB/frame)

---

**End of Report**
