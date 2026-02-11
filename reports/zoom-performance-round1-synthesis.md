# Zoom Performance Investigation - Round 1 Synthesis
**Date:** 2026-02-10
**Problem:** Application responsiveness tanks when zoomed way in on a planet, BEFORE texture loading

## Round 1 Findings Summary

### Architect Review
**Primary Bottleneck:** Zoom-adaptive orbit segment calculation (renderer.js:434-441)
- At high zoom: up to 512 segments per orbit × 15 visible objects = 307,200 segment calculations/sec
- Each segment: ~50-100 floating point ops → 15-30 million operations/second
- Ring rendering: 24 concentric ellipse bands for Saturn/Uranus/Neptune
- Gradient cache invalidation with floating-point keys
- Trajectory subdivision runs every frame (no caching)
- **Estimated frame time at tactical zoom on Saturn: 878ms (52.7x too slow)**

**Critical Code Locations:**
- renderer.js:434-441, 1012-1019 (zoom-adaptive segments)
- renderer.js:467-493 (orbit segment rendering loop)
- renderer.js:709-744 (ring band rendering)
- renderer.js:1204-1246 (trajectory subdivision)

### Functional Tester Review
**Root Cause:** O(zoom²) complexity explosion
- **Orbital path rendering: 10-15ms/frame** (target: <2ms)
- **Trajectory subdivision: 8-12ms/frame** (target: <1ms)
- Ghost planet text: 1-2ms/frame
- **Total: 24-35ms/frame = 28-42 FPS** (target: 16.67ms = 60 FPS)

**Top optimizations:**
1. Cap segment count by visible arc, not total orbit → 4x improvement
2. Cache trajectory subdivision → 5-8x improvement
3. Throttle text rendering → 10-15% improvement

### Failure Analyst Review
**CATASTROPHIC:** Trajectory subdivision memory explosion
- At orbital zoom: **1.2 million points per frame**
- **38 MB allocation every frame = 2.3 GB/sec allocation rate**
- Garbage collector crushed, causing stuttering
- No cap on subdivision count

**SEVERE:** Starfield processing without culling
- All 5,080 stars processed every frame
- 1.78 million FLOPs per frame wasted at tactical zoom
- No zoom-based culling

**SIGNIFICANT:** Ring rendering at large radii
- 24 concentric ellipse bands when planet > 467px
- 48 ellipse calls at 500-1100px radius
- 91 million pixels filled per frame

### Best Practices Review
**Missing Viewport Culling:** 60-80% of frame time wasted rendering off-screen objects
- Grid system: 400+ circles rendered when Sun is off-screen (10-15ms)
- Orbit paths: 64-512 segments drawn regardless of visibility (5-8ms)
- Planetary rings: 24 bands rendered even when off-screen (2-5ms each)
- Trajectory subdivision: entire path interpolated (3-8ms)
- Intersection detection: 14-34ms spikes every 200ms at high time warp

**Canvas state thrashing:** 3-4 save/restore pairs per planet

**Tier 1 fixes (40-60% improvement):**
- Grid viewport culling (10-15ms savings)
- Orbit frustum culling (5-8ms savings)
- Reduce trajectory subdivision (3-5ms savings)
- Stagger intersection detection (10-15ms savings)

### Physicist Review
**Root Cause:** NOT physics calculations - it's rendering
- At zoom > 5x: **2048 segments per orbit** (vs 512 at lower zoom)
- **36,864 sin/cos operations per frame** for 9 orbits
- Hard threshold at zoom = 5 causes instant 4x cost increase
- Trajectory prediction cache thrashes when adjusting sails

**Physics is actually fine:**
- Ship position: ~14 trig ops/frame (negligible)
- Kepler solver: numerically stable
- No numerical instability issues

**Key insight:** Users zoom in for precision maneuvers → frequently adjust sails → cache invalidation → feedback loop

## Convergent Findings

### Unanimous Agreement
1. **Orbit segment rendering is the primary bottleneck**
   - All reviewers identified this
   - Cost: 10-15ms per frame minimum
   - Zoom-adaptive algorithm scales to 512-2048 segments

2. **Trajectory subdivision is a major secondary issue**
   - Runs every frame with no caching
   - Can create memory explosion (1.2M points at extreme zoom)
   - Cost: 8-12ms per frame

3. **No viewport culling is crippling performance**
   - Renders entire solar system regardless of camera position
   - Wastes 60-80% of frame budget on off-screen objects

### Key Disagreements/Clarifications Needed
1. **Maximum segment count:** Architect says 512, Physicist says 2048
   - Need to verify actual code behavior at different zoom levels

2. **Trajectory subdivision severity:**
   - Functional Tester: 8-12ms per frame
   - Failure Analyst: 38MB/frame memory explosion
   - Need to measure actual behavior at different zoom levels

3. **Starfield impact:**
   - Failure Analyst: 1.78M FLOPs wasted
   - Other reviewers didn't mention starfield
   - Need to verify if starfield is actually a bottleneck

## Questions for Round 2
1. What is the ACTUAL max segment count in production code? (512 vs 2048 discrepancy)
2. Is trajectory subdivision capped? If not, what is the actual max point count?
3. Does starfield rendering have zoom-based culling?
4. What is the actual frame time breakdown? (need profiling data)
5. Which optimizations will have the most impact with least implementation risk?
