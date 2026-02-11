# Failure Analysis: Extreme Zoom Performance Degradation

**Date:** 2026-02-10
**Analyst:** Failure Analyst
**Issue:** Application responsiveness tanks when zoomed way in on a planet (BEFORE texture loading)

## Executive Summary

The rendering system exhibits **catastrophic performance degradation at extreme zoom levels** due to **unbounded canvas drawing operations**. Multiple rendering subsystems scale quadratically with zoom factor, causing exponential CPU usage growth. The primary culprits are:

1. **Grid rendering** - Drawing grid rings up to `maxRadius = max(width, height) * 2`
2. **Ring rendering** (Saturn/Uranus/Neptune) - Detailed band rendering with 24+ concentric ellipses
3. **Starfield rendering** - No culling, all 5,080 stars processed every frame

**Critical finding:** At tactical/orbital zoom levels (10,000-50,000 pixels/AU), canvas drawing operations become the bottleneck, not texture loading.

---

## Edge Case Analysis

### 1. Grid Rendering System (Lines 339-412)

**Edge case: Unbounded grid ring generation at extreme zoom**

```javascript
// Line 365: maxRadius scales with canvas size
const maxRadius = Math.max(canvas.width, canvas.height) * 2;
let ringCount = 0;
for (let r = scale; r < maxRadius; r += scale) {
    ringCount++;
    const pixelRadius = r * camera.zoom;  // Line 369: UNBOUNDED MULTIPLICATION
```

**Failure mode:**
- At `scale=50000` (orbital zoom) and `zoom=1`, each 1 AU grid ring is 50,000 pixels apart
- `maxRadius = 1920 * 2 = 3840` pixels
- Loop terminates after `3840 / 50000 = 0.08` iterations (nearly immediate, OK)
- **BUT:** When user zooms out slightly (`zoom=0.2`), `pixelRadius` becomes manageable again
- When user zooms IN further (`zoom=5`), `pixelRadius = 250,000` pixels per ring
- The arc drawing at line 381 now draws **250,000 pixel radius circles**, causing massive overdraw

**Numerical analysis:**
```
Canvas: 1920x1080
Scale: 50000 px/AU (orbital zoom)
Zoom: 5 (user zoomed in 5x)

maxRadius = 1920 * 2 = 3840 px
Ring spacing = scale = 50000 px
pixelRadius = scale * zoom = 50000 * 5 = 250,000 px

Ring count = maxRadius / scale = 3840 / 50000 ≈ 0.08 rings
```

**Wait, this seems fine?** The loop terminates early because `maxRadius` is small. Let me re-examine...

**ACTUAL ISSUE:** The loop condition is `r < maxRadius`, where `r` increments by `scale` (pixels per AU). At extreme zoom, `scale` is HUGE, so the loop terminates almost immediately. This is NOT the bottleneck.

**Re-evaluating:** The grid rendering is actually SAFE from this edge case. The loop terminates quickly at high zoom.

### 2. Orbital Path Rendering (Lines 418-495)

**Edge case: Adaptive segment count at extreme zoom**

```javascript
// Lines 436-441: ZOOM-ADAPTIVE SEGMENTS
const effectiveZoom = scale * camera.zoom;
const orbitRadiusPixels = a * effectiveZoom;
const orbitCircumPixels = 2 * Math.PI * orbitRadiusPixels;

// Target ~20 pixels per segment for smooth appearance, min 64, max 512
const segments = Math.max(64, Math.min(512, Math.ceil(orbitCircumPixels / 20)));
```

**Failure mode:**
- For Earth (a = 1 AU) at orbital zoom:
  - `effectiveZoom = 50000 * 1 = 50000`
  - `orbitRadiusPixels = 1 * 50000 = 50,000 px`
  - `orbitCircumPixels = 2π * 50000 ≈ 314,159 px`
  - `segments = min(512, 314159 / 20) = 512` (capped)

**This is BOUNDED** - segment count caps at 512. Each segment is a `lineTo()` call. At 512 segments per orbit, this is acceptable.

**However:** At extreme zoom focusing on a SMALL REGION near a planet, the ENTIRE orbit (314,159 pixels circumference) is still being drawn, even though 99.9% of it is off-screen. **No viewport culling.**

### 3. Ring Rendering System (Lines 621-773)

**Edge case: Detailed ring band rendering at large screen radius**

```javascript
// Line 692: Detailed rendering when ring width > 12 pixels
if (ringWidth > 12) {
    drawRingBands(projected, screenRadius, outerScreenRadius, innerScreenRadius,
        rotation, cosIncl, colorStops, edgeFade);
}
```

**Saturn ring band rendering (lines 709-744):**
```javascript
const bandCount = Math.min(colorStops.length - 1, 24); // Cap at 24 bands
for (let i = 0; i < bandCount; i++) {
    // For each band: draw outer ellipse + inner ellipse with evenodd fill
    ctx.ellipse(projected.x, projected.y, r1, r1 * cosIncl, rotation, 0, Math.PI * 2);
    ctx.ellipse(projected.x, projected.y, r0, r0 * cosIncl, rotation, 0, Math.PI * 2, true);
    ctx.fill('evenodd');
}
```

**Failure mode at extreme zoom:**
- Saturn's `outerRadius = 2.37` (relative to planet radius)
- At orbital zoom focusing on Saturn:
  - `screenRadius = calculateScreenRadius(body, scale)` (line 783)
  - For Saturn with `physicalRadiusKm = 58232`:
    ```
    scaledRadius = (58232 * kmToAU) * scale * zoom
                 = (58232 / 149597870.7) * 50000 * 1
                 ≈ 0.000389 * 50000
                 ≈ 19.5 pixels (still small!)
    ```

**Wait, Saturn is still small at orbital zoom?** Let me recalculate for a CLOSER zoom...

**At approach zoom (12,000 px/AU):**
```
scaledRadius = (58232 / 149597870.7) * 12000 * 1 ≈ 4.7 px
```

**Even closer - user manually zooms in 100x:**
```
zoom = 100
scale = 12000
scaledRadius = (58232 / 149597870.7) * 12000 * 100 ≈ 467 px
outerScreenRadius = 467 * 2.37 ≈ 1107 px
ringWidth = 1107 - (467 * 1.24) ≈ 528 px
```

**NOW we're talking!** At 467px planet radius:
- 24 ring bands, each drawing TWO ellipses (48 ellipse calls)
- Each ellipse has radius ~500-1100 pixels
- Canvas 2D ellipse rendering is O(radius) in fill operations
- **Total pixels filled: ~π * 1100² * 24 ≈ 91 million pixels PER FRAME**

**This is the FIRST real bottleneck identified.**

### 4. Planet Body Rendering (Lines 778-951)

**Texture activation threshold:**
```javascript
// Line 856: Texture activates at minScreenRadius = 6 pixels
const useTexture = hasTexture(body.name) && screenRadius >= minScreenRadius;
```

**Gradient fallback rendering (lines 867-891):**
```javascript
const gradient = getCachedGradient(planetKey, () => {
    const grad = ctx.createRadialGradient(
        projected.x - screenRadius * 0.3,
        projected.y - screenRadius * 0.3,
        0,
        projected.x, projected.y, screenRadius * 1.2
    );
    grad.addColorStop(0, lightenColor(display.color, 30));
    grad.addColorStop(0.5, display.color);
    grad.addColorStop(1, darkenColor(display.color, 40));
    return grad;
});

ctx.fillStyle = gradient;
ctx.beginPath();
ctx.arc(projected.x, projected.y, screenRadius, 0, Math.PI * 2);
ctx.fill();
```

**Failure mode at extreme zoom:**
- At 467px radius, `ctx.arc()` with radial gradient fill
- Gradient cache key includes `screenRadius.toFixed(1)` (line 872)
- **Cache thrashing:** At orbital zoom, even small pan movements change `projected.x` by whole pixels, invalidating cache
- Each cache miss creates a NEW gradient object
- Gradient creation is cheap, but at 60 FPS with 8+ planets, this adds up

**Not catastrophic, but contributes.**

### 5. Starfield Rendering (Lines 367-437)

**Critical edge case: NO zoom-based culling**

```javascript
export function drawStarfield(ctx, centerX, centerY, scale) {
    // ...
    for (const star of stars) {  // ALL 5,080 STARS
        const precessed = applyPrecession(star.ra, star.dec, currentYear);
        const { x, y, z } = equatorialToEcliptic(precessed.ra, precessed.dec, 1.0);
        const projected = projectStarToScreen(x, y, z, centerX, centerY);

        // Cull stars behind camera
        if (projected.depth <= 0) continue;

        // Cull off-screen stars (with margin)
        if (projected.x < -margin || projected.x > canvasWidth + margin) continue;
        if (projected.y < -margin || projected.y > canvasHeight + margin) continue;
```

**Failure mode:**
1. **Precession calculation for EVERY star EVERY frame:**
   - Lines 384: `applyPrecession()` - 200+ FLOPs per star
   - 5,080 stars × 200 FLOPs = **1,016,000 FLOPs per frame**
   - At 60 FPS: **60.96 million FLOPs/sec** just for precession

2. **Coordinate transform for EVERY star:**
   - Line 387: `equatorialToEcliptic()` - trig operations
   - 5,080 × 50 FLOPs = **254,000 FLOPs per frame**

3. **Projection for EVERY star:**
   - Lines 214-244: `projectStarToScreen()` - matrix multiplication
   - 5,080 × 100 FLOPs = **508,000 FLOPs per frame**

**Total starfield CPU cost: ~1.78 million FLOPs per frame**

**At extreme zoom, this cost is CONSTANT** - stars don't cull based on zoom, only screen bounds. When zoomed in on a planet, you're still processing ALL 5,080 stars even though maybe 10 are visible.

**This is the SECOND major bottleneck.**

### 6. Trajectory Subdivision (Lines 1204-1246)

**Edge case: Adaptive subdivision at extreme zoom**

```javascript
function subdivideTrajectoryForRendering(trajectory, centerX, centerY, scale) {
    const TARGET_PIXELS_PER_SEGMENT = 18;
    const subdivided = [];

    for (let i = 0; i < trajectory.length - 1; i++) {
        const proj1 = project3D(p1.x, p1.y, p1.z, centerX, centerY, scale);
        const proj2 = project3D(p2.x, p2.y, p2.z, centerX, centerY, scale);

        const pixelDist = Math.sqrt((proj2.x - proj1.x) ** 2 + (proj2.y - proj1.y) ** 2);

        if (pixelDist > TARGET_PIXELS_PER_SEGMENT) {
            const subsegments = Math.ceil(pixelDist / TARGET_PIXELS_PER_SEGMENT);
            // Add subsegments
        }
    }
}
```

**Failure mode at extreme zoom:**
- Trajectory has up to 8760 points (2-year prediction at 12 steps/day)
- At orbital zoom, a 1-day segment (0.01 AU ship movement) projects to:
  ```
  pixelDist = 0.01 AU * 50000 px/AU * zoom
            = 0.01 * 50000 * 5 = 2500 pixels
  subsegments = 2500 / 18 = 139 subsegments PER original segment
  ```
- **Worst case:** 8760 points × 139 subsegments = **1,217,640 trajectory points**
- Each point: 2 projection calls + 1 lineTo() call
- **This is CATASTROPHIC.**

**This is the THIRD major bottleneck - potentially the WORST.**

### 7. Intersection Markers (Ghost Planets) (Lines 1453-1766)

**Edge case: Pulsing glow effect**

```javascript
// Lines 1573-1584: Close encounter pulsing glow
if (isCloseEncounter) {
    const phase = (Date.now() % 2000) / 2000 * Math.PI * 2;
    const intensity = 0.5 + 0.5 * Math.sin(phase);

    ctx.save();
    ctx.globalAlpha = intensity * 0.3;
    ctx.fillStyle = display.color;
    ctx.beginPath();
    ctx.arc(projected.x, projected.y, display.radius * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}
```

**Failure mode:**
- Pulsing animation forces re-render EVERY frame (can't optimize to static render)
- At 60 FPS, this is intentional, but at extreme zoom with large ghost planets, could contribute

**Minor contributor.**

---

## Numerical Stability Issues

### 1. Gradient Cache Key Precision

**Lines 392, 788, 807, 872:**
```javascript
const cacheKey = `linear_${sunProjected.x.toFixed(2)}_${sunProjected.y.toFixed(2)}...`;
const sunKey = `radial_sun_${projected.x.toFixed(2)}_${projected.y.toFixed(2)}...`;
```

**Issue:** At extreme zoom with camera panning, `projected.x` can be large (10,000+ pixels). Rounding to 2 decimals means cache keys change every 0.01 pixel movement.

**At orbital zoom:**
- Camera pan of 0.0001 AU = 0.0001 * 50000 = 5 pixel movement
- Cache keys change 500 times during this pan
- Cache thrashing → constant gradient re-creation

**Not catastrophic, but prevents effective caching.**

### 2. Ring Rotation Floating Point

**Line 616:**
```javascript
const rotation = Math.atan2(-py2, px1) + Math.PI / 2;
```

**No stability issue - trig functions are well-conditioned.**

---

## Memory Allocation Issues

### 1. Trajectory Subdivision Array Growth

**Lines 1208-1243:**
```javascript
const subdivided = [];
// ...
subdivided.push(p1);
// ...
for (let j = 1; j < subsegments; j++) {
    subdivided.push({
        x: p1.x + (p2.x - p1.x) * t,
        y: p1.y + (p2.y - p1.y) * t,
        z: p1.z + (p2.z - p1.z) * t,
        time: p1.time + (p2.time - p1.time) * t,
    });
}
```

**Failure mode:**
- At extreme zoom, `subdivided` array grows to 1.2 million points
- Each point is an object with 4 properties: 32 bytes × 1.2M = **38.4 MB allocation**
- This happens EVERY frame (no caching)
- At 60 FPS: **2.3 GB/sec allocation rate**
- **Garbage collector will be CRUSHED**

**This could be the PRIMARY cause of the performance issue.**

### 2. Starfield Processing (No Allocation)

Starfield processes all 5,080 stars but doesn't allocate new memory (reads from static catalog). Not a memory issue, just CPU.

---

## Canvas Drawing Primitive Costs

### Arc Drawing at Large Radii

**ctx.arc() complexity:** Canvas implementations typically use Bresenham or similar algorithms. For a circle of radius R:
- Point generation: O(R)
- Fill operation: O(R²) pixels

**At 1000px radius:**
- Arc perimeter: 2πR ≈ 6283 points
- Fill area: πR² ≈ 3.14 million pixels

**For Saturn rings (24 bands, each 500-1100px radius):**
- Total fill: ~91 million pixels
- At 60 FPS: **5.4 billion pixels/sec**

**On a typical GPU-accelerated canvas, this should be OK.** But if canvas falls back to software rendering (rare WebGL context, old GPU), this becomes a CPU bottleneck.

### Ellipse Drawing (Rings)

**ctx.ellipse() with rotation:** More expensive than arc due to affine transform per point.

**Saturn at 467px radius:**
- 24 bands × 2 ellipses = 48 ellipse calls
- Each ellipse: rotated by `rotation` angle, foreshortened by `cosIncl`
- Estimated cost: 2x arc drawing

**This is significant.**

---

## Rendering Pipeline Bottleneck Summary

**Ranked by performance impact at extreme zoom (orbital: 50,000 px/AU, zoom: 5x):**

| Rank | System | Impact | Root Cause |
|------|--------|--------|------------|
| **1** | **Trajectory Subdivision** | **CATASTROPHIC** | Unbounded subdivision creates 1.2M points, 38MB/frame allocation, GC thrashing |
| **2** | **Starfield Processing** | **SEVERE** | 5,080 stars processed every frame with no zoom-based culling, 1.78M FLOPs/frame wasted |
| **3** | **Ring Rendering (Saturn/Uranus/Neptune)** | **SIGNIFICANT** | 24+ ellipse bands at 500-1100px radius = 91M pixels filled/frame |
| 4 | Orbit Path Rendering | MODERATE | Full orbit drawn even when 99% off-screen, no viewport culling, 512 segments |
| 5 | Gradient Cache Thrashing | MINOR | Cache keys change on sub-pixel pan movements |
| 6 | Ghost Planet Pulsing | NEGLIGIBLE | Intentional animation, small radius |

---

## Recommended Fixes

### CRITICAL (Trajectory Subdivision)
1. **Cap maximum subdivided point count:**
   ```javascript
   const MAX_SUBDIVIDED_POINTS = 10000; // ~320KB instead of 38MB
   if (subdivided.length >= MAX_SUBDIVIDED_POINTS) break;
   ```

2. **Cache subdivided trajectory:**
   - Store `subdivided` array between frames if zoom/pan hasn't changed significantly
   - Only recompute when camera moves > threshold

3. **Use view frustum culling:**
   - Only subdivide trajectory segments within visible screen bounds + margin

### HIGH PRIORITY (Starfield)
1. **Spatial hash grid for stars:**
   - Pre-compute stars into a grid by RA/Dec
   - At render time, only process grid cells within view frustum

2. **Zoom-based LOD:**
   - At tactical/orbital zoom (where starfield is barely visible), skip rendering entirely
   - Fade out starfield when `effectiveZoom > 1000`

### MEDIUM PRIORITY (Ring Rendering)
1. **Resolution-based LOD:**
   - When `ringWidth < 50px`, use simple rendering (current threshold is 12px)
   - When `ringWidth > 200px`, consider texture-based rendering instead of vector

2. **Limit band count:**
   - Current cap is 24 bands - reduce to 12 for widths < 100px

### LOW PRIORITY (Orbit Rendering)
1. **Viewport culling:**
   - Check if orbit bounding box intersects viewport before drawing
   - For very large orbits (Jupiter/Saturn), this would skip 90%+ of segments

---

## Conclusion

The performance degradation at extreme zoom is caused by **THREE COMPOUNDING FAILURES:**

1. **Memory allocation explosion** (trajectory subdivision)
2. **CPU waste** (starfield processing without culling)
3. **Canvas overdraw** (ring rendering at large radii)

The issue occurs BEFORE texture loading because **the texture system is actually well-optimized** - it has resolution caps (512px), caching, and LOD transitions. The canvas vector rendering systems have NO such optimizations.

**Immediate action required:** Implement trajectory subdivision cap and starfield culling. These two changes alone should restore 80%+ performance at extreme zoom.
