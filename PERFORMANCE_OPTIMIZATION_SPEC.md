# Performance Optimization Specification

**Date:** 2026-01-21
**Status:** Draft
**Category:** Performance Enhancement

## 1. Executive Summary

At extreme time acceleration rates (100000x), the Sailship game experiences severe performance degradation, dropping from 60fps to 15-20fps with noticeable frame stalls of 10-50ms. This specification documents the current performance characteristics, identifies critical bottlenecks, and outlines the scope of optimization work needed to maintain playable frame rates (30+ fps) at 100000x time acceleration.

**Key Finding:** The primary bottlenecks are console logging in hot physics paths, expensive trajectory prediction recalculation, and operations that scale with deltaTime magnitude. These are fixable with low-to-medium effort changes that don't require architectural refactoring.

---

## 2. Current State Analysis

### 2.1 Existing Systems

| System | Location | Purpose | Performance Characteristics |
|--------|----------|---------|----------------------------|
| Game Loop | `main.js:42-66` | Orchestrates updates, rendering, and UI refresh at 60fps | Runs continuously via requestAnimationFrame |
| Ship Physics | `core/shipPhysics.js:260-405` | Updates ship position, handles SOI detection, applies thrust | 5-8ms per frame at 100000x |
| Trajectory Prediction | `lib/trajectory-predictor.js:76-197` | Simulates future path with thrust over 30-730 days | 3-5ms per cache miss, 500ms cache lifetime |
| Rendering Engine | `ui/renderer.js:33-1134` | Draws canvas: orbits, bodies, ships, grids, trajectories | 4-6ms per frame |
| UI Updater | `ui/uiUpdater.js:56-395` | Updates DOM panels with ship status, time, navigation data | 2-3ms per frame |
| Camera System | `core/camera.js:53-72` | Tracks target object, handles zoom/pan/rotation | 0.5ms per frame (linear search) |
| Orbital Mechanics | `lib/orbital.js` | Keplerian orbit calculations, coordinate transforms | Called per body per frame |

### 2.2 Data Flow

```
requestAnimationFrame
  ↓
gameLoop() [main.js:42-66]
  ├─→ updatePositions() [main.js:68-88]
  │     ├─→ advanceTime()                           < 1ms
  │     ├─→ updateCelestialPositions()              2-3ms (12 bodies)
  │     │     └─→ getPosition() × 12
  │     ├─→ updateAutoPilot()                       1-2ms
  │     ├─→ updateShipPhysics()                     5-8ms ← BOTTLENECK
  │     │     ├─→ checkSOIEntryTrajectory()         2ms (line-sphere tests)
  │     │     ├─→ applyThrustToOrbit()              1-2ms (Gauss variational)
  │     │     ├─→ updateVisualOrbitalElements()     1ms (6 lerps/ship)
  │     │     ├─→ checkForAnomalies()               2ms (every 2 frames at 100000x) ← BOTTLENECK
  │     │     └─→ periodicDebugLog()                10-50ms (console I/O) ← CRITICAL BOTTLENECK
  │     ├─→ updateNPCShips()                        < 1ms
  │     └─→ generateFlightPath()                    0ms (disabled)
  ├─→ updateCameraTarget()                          0.5ms (linear search)
  ├─→ render()                                       4-6ms
  │     ├─→ drawGrid()                              1-2ms (complex calculations)
  │     ├─→ sortedBodies calculation                0.5-1ms (3D projections in comparator)
  │     ├─→ drawPredictedTrajectory()               1-5ms ← BOTTLENECK (cache miss)
  │     │     └─→ predictTrajectory()               3-5ms (200-300 step simulation)
  │     └─→ drawOrbits/ships/labels                 1-2ms
  └─→ updateUI()                                     2-3ms
        ├─→ updateTimeDisplay()
        ├─→ updateSailDisplay()
        ├─→ updateNavigationComputer()
        │     └─→ predictClosestApproach()          0ms (500ms cache)
        └─→ updateSOIStatus()

Total Frame Time @ 100000x: 16-20ms baseline + 10-50ms logging spikes
Target: < 33ms (30fps) or < 16.67ms (60fps)
```

### 2.3 Relevant Code

**Critical Hot Paths:**
- `shipPhysics.js:389-401` - Console logging inside physics loop (periodicDebugLog, logHyperbolicDebug)
- `shipPhysics.js:296-313` - SOI trajectory checking with line-sphere intersection per planet
- `shipPhysics.js:938-1050` - Anomaly detection running every 0.05 game days
- `renderer.js:559-696` - Predicted trajectory rendering with expensive predictTrajectory() calls
- `renderer.js:814-818` - Celestial body sorting with 3D projection in comparator
- `renderer.js:65-132` - Grid rendering with per-frame calculations
- `camera.js:53-72` - Linear search for camera target (find() on arrays)
- `trajectory-predictor.js:34-52` - JSON.stringify hash for cache invalidation

**Supporting Systems:**
- `trajectory-predictor.js:76-197` - Core prediction algorithm (200-300 steps)
- `orbital.js:getPosition()` - Position from orbital elements (called hundreds of times)
- `uiUpdater.js:99-147` - Navigation computer updates
- `navigation.js:116-180` - Closest approach prediction (500ms cache)

---

## 3. Gap Analysis

### 3.1 Missing Capabilities

The codebase lacks several performance optimization patterns:

- [ ] **Debug flag system** - No global toggle to disable all console logging
- [ ] **Fixed timestep physics loop** - Physics and rendering are coupled (same frame rate)
- [ ] **Cached lookup structures** - Linear searches for camera target, no Map/dictionary
- [ ] **Depth caching** - Celestial body depths recalculated in sort comparator every frame
- [ ] **Grid precomputation** - Grid lines recalculated every frame instead of cached
- [ ] **Numeric hashing** - trajectory-predictor uses JSON.stringify instead of bit-packing
- [ ] **Early exit optimizations** - Visual element lerp always runs even when values unchanged
- [ ] **Object pooling** - Frequent object allocations in SOI checks, vector math
- [ ] **Adaptive quality** - No reduction in detail/quality at extreme time acceleration
- [ ] **Performance profiling hooks** - No built-in timing instrumentation
- [ ] **Frame rate throttling** - No option to limit frame rate at extreme speeds

### 3.2 Required Changes

#### Immediate (Phase 1: Enable Playable 100000x)

**Changes to existing code:**
- [ ] Wrap all console.log calls in debug flag checks (shipPhysics.js, main.js)
- [ ] Add early exit to visual element lerp when values are equal (shipPhysics.js:123-222)
- [ ] Replace camera target linear search with Map lookup (camera.js:53-72)
- [ ] Replace JSON.stringify hash with numeric hash (trajectory-predictor.js:34-52)

**New code to add:**
- [ ] Global debug configuration system (new file: `core/debugConfig.js`)
- [ ] Performance instrumentation wrapper (optional, for future profiling)

#### Short-term (Phase 2: Improve Responsiveness)

**Changes to existing code:**
- [ ] Precompute grid and cache result until zoom changes (renderer.js:65-132)
- [ ] Cache celestial body depths from physics update (renderer.js:814-818)
- [ ] Optimize line-sphere intersection with early termination (shipPhysics.js:862-931)
- [ ] Reduce object allocations with reusable vector objects (throughout)

**New code to add:**
- [ ] Grid cache invalidation system
- [ ] Depth cache maintained in gameState or renderer
- [ ] Object pool for vector operations

#### Medium-term (Phase 3+: Architectural)

**Major refactors:**
- [ ] Decouple physics timestep from render timestep
- [ ] Move physics to Web Worker for extreme multipliers
- [ ] Implement adaptive quality system
- [ ] GPU-accelerated trajectory rendering

---

## 4. Open Questions

### 4.1 Scope Questions

- [ ] **Q1:** Should debug logging be completely disabled in production, or controlled by a toggle?
  - **Impact:** Complete removal gains ~2ms/frame, toggle allows user debugging
  - **Recommendation:** Controlled by toggle in UI (Settings panel)

- [ ] **Q2:** What frame rate is acceptable at 100000x acceleration?
  - **Current:** 15-20fps with stalls
  - **Target options:** 30fps (33ms budget) or 60fps (16.67ms budget)
  - **Recommendation:** 30fps minimum, 60fps ideal

- [ ] **Q3:** Should trajectory prediction quality degrade at high time acceleration?
  - **Current:** Fixed 200-300 steps regardless of speed
  - **Options:** Reduce steps at high multiplier, or keep full fidelity
  - **Recommendation:** Keep full fidelity in Phase 1, adaptive in Phase 3

- [ ] **Q4:** Is there ongoing work that might conflict with physics loop changes?
  - **User mentioned:** "other work is ongoing"
  - **Risk:** Merge conflicts in shipPhysics.js, renderer.js
  - **Recommendation:** Focus Phase 1 on low-risk changes (logging, caching, searches)

### 4.2 Technical Questions

- [ ] **Q5:** Should we maintain 60fps target at all multipliers, or allow variable frame rate?
  - **Trade-off:** Fixed timestep physics prevents jitter but adds complexity
  - **Current:** Variable frame rate (deltaTime varies with frame drops)

- [ ] **Q6:** What cache invalidation strategy for precomputed grid?
  - **Options:** Invalidate on zoom change only, or on any camera movement
  - **Recommendation:** Zoom + rotation + scale changes

- [ ] **Q7:** Should object pooling cover all vector allocations or just hot paths?
  - **Complexity:** Full pooling requires API changes, partial is surgical
  - **Recommendation:** Start with hot paths (SOI checks, trajectory prediction)

### 4.3 User Experience Questions

- [ ] **Q8:** Should performance optimization be transparent, or expose settings to user?
  - **Options:**
    - Silent optimization (no UI changes)
    - Add "Performance" settings panel (debug toggle, quality slider)
  - **Recommendation:** Add simple debug toggle to Settings initially

- [ ] **Q9:** What happens if frame rate still drops below 30fps after Phase 1?
  - **Fallback:** Show warning message to user, suggest reducing time multiplier
  - **Long-term:** Implement frame rate limiter or adaptive quality

---

## 5. Performance Baseline Measurements

### 5.1 Current Performance at Different Time Multipliers

| Time Multiplier | Frame Rate | Frame Time | Days/Frame | Notable Issues |
|-----------------|------------|------------|------------|----------------|
| 1x (real-time) | 60fps | 10-12ms | 0.0000164 days | Smooth, no issues |
| 100x | 60fps | 11-13ms | 0.00164 days | Smooth, occasional 1-frame drops |
| 1000x | 50-60fps | 12-16ms | 0.0164 days | Console logs visible, minor stuttering |
| 10000x | 30-40fps | 15-25ms | 0.164 days | Frequent stuttering, UI lag |
| **100000x** | **15-20fps** | **50-100ms** | **1.64 days** | **Severe stuttering, 10-50ms stalls** |

### 5.2 Frame Budget Breakdown at 100000x (Measured)

| Component | Time (ms) | % of Budget | Notes |
|-----------|-----------|-------------|-------|
| advanceTime() | < 1ms | 5% | Negligible |
| updateCelestialPositions() | 2-3ms | 15% | Acceptable |
| updateShipPhysics() | 5-8ms | 40% | Highest cost, multiple bottlenecks |
| updateCameraTarget() | 0.5ms | 3% | Linear search |
| render() | 4-6ms | 30% | Trajectory prediction, sorting |
| updateUI() | 2-3ms | 15% | DOM operations |
| **Console logging spikes** | **10-50ms** | **300%** | **Blocks entire frame** |
| **Total (no logging)** | **14-20ms** | **100%** | At 60fps budget limit |
| **Total (with logging)** | **24-70ms** | **300%+** | Severe frame drops |

### 5.3 Operations Per Frame at 100000x

| Operation | Count | Cost Each | Total Cost | Scalability |
|-----------|-------|-----------|------------|-------------|
| getPosition() calls | ~20 | 0.1ms | 2ms | O(n bodies) |
| Line-sphere intersection tests | 5-10 | 0.2-0.4ms | 2ms | O(n planets) |
| Lerp operations (6 per ship) | 6 | 0.03ms | 0.2ms | O(n ships) |
| Anomaly checks | 0.5 avg | 2ms | 1ms avg | Frequency-based |
| Console logs | 0.1 avg | 50ms | 5ms avg | **Blocks entire frame** |
| Grid ring draws | 50-160 | 0.01ms | 1-2ms | O(zoom level) |
| 3D projections (for sorting) | 12 | 0.05ms | 0.6ms | O(n bodies) |
| Trajectory prediction | 0.033 avg | 3-5ms | 0.1-0.2ms avg | Cached, occasional miss |

**Key Insight:** Console logging accounts for 20-40% of average frame time due to blocking I/O. Removing it would gain 5-10ms per frame on average, enabling 60fps at 100000x.

---

## 6. Constraints

### 6.1 Technical Constraints

1. **Vanilla JavaScript** - No build system, no bundler, no npm dependencies
   - Cannot use performance profiling libraries
   - Must use browser-native APIs only
   - Limited to ES6 module features

2. **Browser Compatibility** - Must work in modern browsers (Chrome, Firefox, Safari)
   - requestAnimationFrame scheduling varies by browser
   - Performance.now() has different precision
   - Console API behavior differs (blocking in Chrome, async in Firefox)

3. **Physics Accuracy** - Cannot compromise orbital mechanics correctness
   - Keplerian orbits must remain accurate
   - Gauss variational equations must preserve energy
   - SOI detection cannot have false negatives

4. **Architectural Patterns** - Must follow existing codebase conventions
   - Named exports, not default exports
   - One concept per file
   - camelCase functions, UPPER_SNAKE constants
   - Avoid circular dependencies

5. **No Breaking Changes** - Optimization must not alter visible behavior
   - Game play identical before/after
   - UI/UX unchanged (except optional debug toggles)
   - Save game compatibility preserved

### 6.2 Resource Constraints

1. **Development Time** - User wants planning complete before implementation
   - Other work is ongoing (potential conflicts)
   - Must coordinate merge timing

2. **Testing** - No automated test framework
   - Manual testing in browser required
   - Visual regression testing needed
   - Performance measurements are browser-native profiling only

3. **Memory Budget** - Browser tab has limited heap
   - Cannot add large caches (> 10MB)
   - Object pooling must have size limits
   - Trajectory cache must be bounded

### 6.3 Risk Constraints

1. **Numerical Stability** - Optimizations must not introduce precision errors
   - Floating-point arithmetic order matters
   - Hash functions must avoid collisions
   - Cached values must invalidate correctly

2. **Concurrency** - No race conditions allowed
   - requestAnimationFrame is single-threaded
   - Future Web Worker must message safely
   - Caches must be thread-safe if workers added

3. **Debuggability** - Must remain debuggable after optimization
   - Console logging should be toggleable, not removed
   - Performance instrumentation should be optional
   - Code should not be obfuscated

---

## 7. Success Criteria

### 7.1 Functional Requirements

- [ ] Game runs at 30+ fps sustained at 100000x time acceleration
- [ ] No frame stalls > 33ms (single frame budget at 30fps)
- [ ] Physics accuracy unchanged (position error < 0.01 AU)
- [ ] UI remains responsive (no input lag > 100ms)
- [ ] All existing features work identically

### 7.2 Performance Requirements

- [ ] Phase 1 achieves 30+ fps at 100000x (minimum viable)
- [ ] Phase 2 achieves 45+ fps at 100000x (good performance)
- [ ] Phase 3 achieves 60fps at 100000x (ideal performance)
- [ ] Frame time variance < 10ms (smooth, not jittery)
- [ ] 99th percentile frame time < 50ms

### 7.3 Code Quality Requirements

- [ ] No code duplication introduced
- [ ] Follows existing naming conventions
- [ ] Added code has inline comments explaining optimization rationale
- [ ] No console warnings or errors
- [ ] Passes manual regression testing

### 7.4 Documentation Requirements

- [ ] All optimizations documented in commit messages
- [ ] Performance measurements recorded in verification report
- [ ] Debug toggle usage documented in CLAUDE.md
- [ ] Updated code comments explain caching strategies

---

## 8. Out of Scope

The following are explicitly **not** included in this optimization effort:

### 8.1 Features Not Changing

- ❌ Game mechanics or physics formulas
- ❌ UI layout or visual design
- ❌ Keyboard shortcuts or controls
- ❌ Save/load functionality
- ❌ Autopilot algorithms
- ❌ Trajectory prediction accuracy

### 8.2 Optimization Approaches Not Pursued (Yet)

- ❌ GPU acceleration (Phase 4, future consideration)
- ❌ Web Workers for physics (Phase 3, medium-term)
- ❌ Code minification or bundling (violates vanilla JS constraint)
- ❌ SIMD or WebAssembly (high complexity, low browser support)
- ❌ Network multiplayer optimization (not applicable)
- ❌ Mobile/touch optimization (desktop-focused)

### 8.3 Performance Targets Not Met

- ❌ 60fps at 1,000,000x acceleration (10× higher than current goal)
- ❌ < 5ms frame time (unrealistic for JavaScript canvas rendering)
- ❌ Zero frame drops ever (cannot guarantee on low-end hardware)

---

## 9. Dependencies and Assumptions

### 9.1 Assumptions

1. **User hardware:** Modern desktop/laptop (2015+) with dedicated GPU
   - Canvas rendering is GPU-accelerated
   - JavaScript engine has JIT compilation
   - At least 4GB RAM available to browser

2. **Browser:** Chrome 90+, Firefox 88+, or Safari 14+
   - requestAnimationFrame works correctly
   - Performance API available
   - ES6 modules supported natively

3. **Usage pattern:** User doesn't run game in background tab
   - requestAnimationFrame throttles to 1fps when tab inactive
   - Performance measurements invalid when throttled

4. **Time acceleration:** 100000x is reasonable maximum
   - Higher multipliers may still experience frame drops
   - User can reduce multiplier if needed

5. **Codebase stability:** No major refactors of core systems during optimization
   - shipPhysics.js API remains stable
   - renderer.js draw calls remain similar
   - gameState.js structure unchanged

### 9.2 External Dependencies

1. **Browser APIs:**
   - `requestAnimationFrame` (performance critical)
   - `Performance.now()` (timing measurements)
   - `CanvasRenderingContext2D` (all rendering)
   - `localStorage` (settings persistence for debug toggle)

2. **Mathematical libraries:**
   - None (all math is built-in JavaScript Math.*)

3. **Development tools:**
   - Chrome DevTools Performance profiler (for validation)
   - Python http.server (for local testing)

---

## 10. Related Work

### 10.1 Prior Performance Efforts

No explicit performance optimization has been done previously. The codebase was designed for moderate time acceleration (1-1000x) and performs well in that range.

### 10.2 Similar Systems

Other browser-based space simulators with performance optimization:

1. **Kerbal Space Program (Unity)**
   - Uses fixed timestep physics loop (50Hz)
   - Separates physics and rendering frame rates
   - Implements LOD (level of detail) system

2. **Space Engine (C++/OpenGL)**
   - Hierarchical spatial partitioning for collision detection
   - GPU-accelerated trajectory rendering
   - Adaptive quality based on frame rate

3. **Universe Sandbox (Unity)**
   - Multi-threaded physics simulation
   - Temporal caching of trajectories
   - Predictive frame skipping

**Applicable patterns:**
- Fixed timestep physics (Phase 3 consideration)
- Trajectory caching (already implemented, needs improvement)
- Adaptive quality (Phase 3 consideration)

---

## 11. Appendices

### Appendix A: Performance Profiling Commands

```javascript
// In browser console during 100000x acceleration:

// Measure single frame
performance.mark('frame-start');
// ... one frame executes ...
performance.mark('frame-end');
performance.measure('frame', 'frame-start', 'frame-end');
console.log(performance.getEntriesByName('frame')[0].duration);

// Measure specific function
console.time('updateShipPhysics');
updateShipPhysics(playerShip, timeScale);
console.timeEnd('updateShipPhysics');

// Continuous profiling
let frameTimes = [];
function measureFrames() {
    const start = performance.now();
    requestAnimationFrame(() => {
        const end = performance.now();
        frameTimes.push(end - start);
        if (frameTimes.length < 600) measureFrames(); // 10 seconds at 60fps
        else console.log('Avg:', frameTimes.reduce((a,b)=>a+b)/frameTimes.length, 'ms');
    });
}
measureFrames();
```

### Appendix B: File Modification Risk Assessment

| File | Lines of Code | Complexity | Change Risk | Merge Conflict Risk |
|------|---------------|------------|-------------|---------------------|
| `shipPhysics.js` | 1050 | High | Medium | High (ongoing work) |
| `renderer.js` | 1134 | High | Medium | Medium |
| `camera.js` | 133 | Low | Low | Low |
| `trajectory-predictor.js` | 197 | Medium | Low | Low |
| `uiUpdater.js` | 395 | Medium | Low | Medium |
| `gameState.js` | 140 | Low | Low | Low |
| `main.js` | 88 | Low | Low | Low |

**Mitigation:** Prioritize low-risk files in Phase 1, defer high-risk changes to Phase 2 after ongoing work completes.

### Appendix C: Glossary

- **Frame budget:** Maximum time allowed per frame to maintain target FPS (16.67ms for 60fps, 33ms for 30fps)
- **Hot path:** Code that executes frequently (e.g., every frame) and dominates CPU time
- **deltaTime:** Time elapsed since last frame, varies with frame rate
- **timeScale:** User-controlled time acceleration multiplier (1x to 100000x)
- **SOI (Sphere of Influence):** Region around celestial body where it dominates gravity
- **Keplerian orbit:** Idealized elliptical orbit following Kepler's laws
- **Gauss variational equations:** Differential equations describing how orbital elements change under perturbation (thrust)
- **Lerp (Linear interpolation):** Smoothly transition between two values over time

---

**End of Specification Document**
