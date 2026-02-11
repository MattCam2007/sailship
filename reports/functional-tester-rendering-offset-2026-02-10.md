# Functional Testing Report: Planet/Orbital Path Rendering Offset Bug

**Date:** 2026-02-10
**Reporter:** Functional Tester Agent
**Issue:** When zooming in on a planet in tactical view, the planet visually separates from its orbital path line just before it starts to grow

---

## Root Cause Analysis

### The Bug

The planet appears to "come off" its orbital path at specific zoom levels during tactical zoom. This is a **rendering precision mismatch** between two independent calculation systems:

1. **Planet Position:** Calculated once per frame via `updateCelestialPositions()` using Keplerian orbital mechanics
2. **Orbital Path:** Drawn using parametric sweep with adaptive segmentation based on current zoom level

### The Problem: Segment Resolution Threshold

**File:** `src/js/ui/renderer.js`
**Lines:** 434-441 (orbital paths) and 1012-1019 (ship orbits)

```javascript
// ZOOM-ADAPTIVE SEGMENTS: At high zoom, increase segment count for smooth curves
const effectiveZoom = scale * camera.zoom;
const orbitRadiusPixels = a * effectiveZoom;
const orbitCircumPixels = 2 * Math.PI * orbitRadiusPixels;

// Target ~20 pixels per segment for smooth appearance, min 64, max 512
const segments = Math.max(64, Math.min(512, Math.ceil(orbitCircumPixels / 20)));
```

**What happens during zoom:**

1. At low zoom (system view), orbit uses minimum 64 segments
2. As you zoom IN, `orbitCircumPixels` increases linearly with zoom
3. Segment count increases: 64 → 128 → 256 → 512 segments
4. **CRITICAL:** Segment count changes in STEPS (discrete jumps at 20-pixel intervals)

### The Timing Issue

**Game Loop Order** (`main.js:269-283`):
```
1. updatePositions()      // Planet gets exact Keplerian position
2. updateCameraTarget()   // Camera follows
3. render()              // Draws orbit with current segment count
4. updateUI()
```

**Both calculations happen in the SAME frame**, so timing is not the issue. The problem is **geometric approximation error**.

### Why It Appears "Just Before Growth"

The hybrid rendering system for planets (`renderer.js:312-333`) transitions between:
- **Fixed size** (small zoom): Planet drawn at constant pixel radius
- **Scaled size** (large zoom): Planet drawn at physically-accurate radius

The transition happens in the `minScreenSize` to `maxScreenSize` range (config: 12-24 pixels).

**The sequence:**
1. You zoom toward a planet
2. Planet is still in "fixed size" mode (e.g., 8 pixels)
3. Orbital path segment count is increasing (64 → 128 → 256)
4. **Each segment jump introduces up to ±10 pixels of error** at segment boundaries
5. Since planet is SMALL (8px) but orbit error is LARGE (±10px), the offset is visible
6. Once planet enters "scaled size" mode (>12px), it grows FASTER than the orbit error, masking the issue

---

## Reproduction Steps

### Minimal Reproduction Case

1. **Setup:**
   - Start game at default zoom (system view)
   - Select any planet as destination (e.g., Earth)
   - Enable "ORBITAL PATHS" display option

2. **Zoom In (gradually):**
   - Use mouse wheel or zoom controls
   - Zoom toward the planet until it fills ~10-20% of screen
   - **Critical zoom range:** When `orbitRadiusPixels` is ~1280-2560 pixels
     - This is when segments jump from 64 → 128 or 128 → 256

3. **Observe:**
   - Planet position is stable (exact Keplerian position)
   - Orbital path line appears to "shift" slightly
   - Planet and path visually separate by 5-15 pixels

4. **Continue Zooming:**
   - Once planet enters "scaled size" mode, it grows large
   - Offset becomes less noticeable (planet is 50+ pixels, error is still ~10px)

### Zoom Level Math

For Earth (a = 1 AU):
- `scale` = 100 pixels/AU (example)
- Orbit circumference in pixels = 2π × 1 × 100 × zoom = 628 × zoom

| Zoom | Circum (px) | Segments | Error/Segment |
|------|-------------|----------|---------------|
| 1.0  | 628         | 64       | ~10 px        |
| 2.0  | 1256        | 64       | ~20 px        |
| 2.1  | 1319        | 128      | ~10 px ⚠️ JUMP |
| 4.0  | 2512        | 128      | ~20 px        |
| 4.1  | 2575        | 256      | ~10 px ⚠️ JUMP |

**Visual impact:** The segment jump causes the orbit line to "snap" to a new approximation, creating the appearance of planet/path separation.

---

## Test Cases for Verification

### Test 1: Segment Boundary Detection
**Purpose:** Confirm that offset occurs at segment count transitions

**Steps:**
1. Add debug logging to `drawOrbit()`:
```javascript
if (body.name === 'EARTH') {
    console.log(`Segments: ${segments}, Zoom: ${camera.zoom.toFixed(2)}, Offset pixels: ${orbitCircumPixels}`);
}
```
2. Zoom from 1.0x to 5.0x gradually
3. Record segment count at each zoom level
4. Verify jumps occur at: 64→128 (zoom ~2.0), 128→256 (zoom ~4.0), 256→512 (zoom ~8.0)

**Expected Result:** Offset is most visible IMMEDIATELY AFTER segment count jumps

---

### Test 2: Planet vs Orbit Position Consistency
**Purpose:** Measure actual pixel-space error between planet center and nearest orbit point

**Setup:**
```javascript
// In render(), after drawing orbit and planet
const planetPos = project3D(body.x, body.y, body.z, centerX, centerY, scale);
const orbitTestPoint = project3D(/* orbit point at body's true anomaly */, centerX, centerY, scale);
const error = Math.sqrt((planetPos.x - orbitTestPoint.x)**2 + (planetPos.y - orbitTestPoint.y)**2);
console.log(`Planet-Orbit Error: ${error.toFixed(2)}px at ${segments} segments`);
```

**Expected Result:**
- Error increases with zoom until segment count jumps
- Error resets after segment jump, then grows again
- Sawtooth pattern: error grows linearly, then drops at segment boundaries

---

### Test 3: Fixed Segment Count Test
**Purpose:** Verify that offset disappears with constant high segment count

**Modification:**
```javascript
// Replace adaptive segments with fixed 512:
const segments = 512;  // Force maximum resolution
```

**Expected Result:** Offset should disappear or become imperceptible (<2 pixels) at all zoom levels

---

### Test 4: Cross-Platform Consistency
**Purpose:** Confirm bug appears on all platforms/browsers

**Matrix:**
- Chrome (Mac/Windows/Linux)
- Firefox (Mac/Windows/Linux)
- Safari (Mac/iOS)
- Mobile browsers (iOS Safari, Chrome Mobile)

**Test:** Zoom to Earth at zoom=2.5x (segment boundary), measure offset
**Expected Result:** Bug appears consistently across all platforms (pure rendering math issue)

---

### Test 5: Multiple Planet Test
**Purpose:** Verify bug affects all orbiting bodies equally

**Steps:**
1. Enable all planet orbits
2. Zoom to show 3-4 planets at tactical scale (e.g., inner planets)
3. Observe offset for Mercury, Venus, Earth, Mars simultaneously

**Expected Result:** ALL planets show offset at their respective segment boundaries

---

### Test 6: Ship Orbit Verification
**Purpose:** Confirm player ship orbit exhibits same behavior

**Steps:**
1. Start game with player ship in Earth orbit
2. Enable "ORBITAL PATHS" (ship orbit should show)
3. Zoom in on ship position until zoom ~2-4x
4. Observe ship triangle vs green dashed orbit line

**Expected Result:** Ship also appears off its orbit line at segment boundaries (same `drawShipOrbit()` code path)

---

## Edge Cases and Special Conditions

### Edge Case 1: Extreme Eccentricity
**Scenario:** Highly elliptical orbit (e.g., Pluto, e=0.25)

**Risk:** At periapsis, orbit curvature is very high → larger approximation error
**Test:** Zoom in on Pluto at periapsis, check if offset is MORE pronounced

---

### Edge Case 2: Moon Orbits
**Scenario:** Moons orbiting planets (parent-relative coordinates)

**Risk:** Moon position undergoes TWO coordinate transforms:
1. Parent-relative Keplerian position
2. Heliocentric offset by parent position

**Test:**
1. Navigate to Jupiter
2. Enable minor moon visibility
3. Zoom in on Io until zoom ~10x (moon orbits are tiny)
4. Check if offset appears for moon vs its orbit around Jupiter

**Expected Result:** Same offset behavior (moon uses same `drawOrbit()` code)

---

### Edge Case 3: Camera Rotation
**Scenario:** View orbit from different angles (camera.angleX, camera.angleZ)

**Risk:** 3D projection might amplify/hide offset depending on view angle

**Test:**
1. Zoom to Earth at zoom=2.5x (segment boundary)
2. Rotate camera using Q/E keys (angleZ) and W/S keys (angleX)
3. Measure offset at different camera orientations

**Expected Result:** Offset magnitude changes with view angle (projection introduces perspective distortion)

---

### Edge Case 4: High Time Warp
**Scenario:** Game running at 1000x time scale

**Risk:** Rapid position updates might cause temporal aliasing

**Test:**
1. Set time scale to maximum (1000x)
2. Zoom to Earth at segment boundary
3. Observe if offset "flickers" or changes rapidly

**Expected Result:** Offset is STABLE (both position and orbit use same Julian date, updated together)

---

## Performance Considerations

### Current Performance Profile

**Orbit Drawing Cost** (`drawOrbit()` at 512 segments):
- 512 iterations of coordinate transforms (rotation matrix math)
- 512 `project3D()` calls
- 512 `ctx.lineTo()` canvas operations

**Estimated cost per orbit:** ~0.5-1ms at 512 segments (rough estimate)

**Total cost:** If 20 orbits visible → 10-20ms per frame (16.6ms budget for 60 FPS)

### Risk of Increasing Segment Count

**Current max:** 512 segments
**Proposed fix might require:** 1024-2048 segments for sub-pixel accuracy at extreme zoom

**Impact:**
- 2x-4x increase in orbit drawing cost
- Could push frame time over 16.6ms → frame drops
- Especially problematic on mobile devices

---

## Recommended Testing Tools

### Console Utilities to Add

**1. Segment Count Monitor:**
```javascript
window.debugOrbitSegments = (bodyName) => {
    // Add to drawOrbit()
    // Logs segment count for specific body each frame
};
```

**2. Offset Measurement Tool:**
```javascript
window.measurePlanetOrbitOffset = (bodyName) => {
    // Returns pixel distance between planet center and nearest orbit point
};
```

**3. Segment Boundary Highlighter:**
```javascript
window.highlightSegmentBoundaries = true;
// Draws red dots at orbit segment points
```

---

## Functional Test Checklist

Before any fix is merged:

- [ ] Test 1: Segment boundary detection (confirm sawtooth error pattern)
- [ ] Test 2: Pixel-space error measurement (<5px at all zoom levels)
- [ ] Test 3: Fixed high segment count (offset disappears)
- [ ] Test 4: Cross-platform consistency (Chrome/Firefox/Safari)
- [ ] Test 5: Multiple planets (all show offset)
- [ ] Test 6: Ship orbit (same behavior as planets)
- [ ] Edge Case 1: Pluto periapsis (high eccentricity)
- [ ] Edge Case 2: Moon orbits (coordinate transform)
- [ ] Edge Case 3: Camera rotation (view angle dependence)
- [ ] Edge Case 4: High time warp (temporal stability)
- [ ] Performance: Frame rate remains 60 FPS with fix applied
- [ ] Visual quality: No visible "snapping" during zoom transitions

---

## Proposed Fix Validation

Once a fix is implemented, use these criteria:

### Success Criteria

1. **Visual:**
   - Planet stays centered on orbital path at ALL zoom levels
   - No visible "snap" or "shift" during zoom transitions
   - Offset <2 pixels at extreme zoom (10x+)

2. **Performance:**
   - Frame rate remains 60 FPS with 20+ orbits visible
   - No frame drops during zoom or camera rotation
   - Mobile devices maintain 30+ FPS

3. **Consistency:**
   - Fix works for planets, moons, ships, and asteroids
   - Fix works at all camera angles
   - Fix works at all time scales

### Failure Modes to Watch

1. **Overcorrection:** Orbit becomes "too smooth" but costs 30+ ms to render
2. **New artifacts:** Orbit line becomes jagged or discontinuous
3. **Memory leak:** Excessive segment count causes heap growth
4. **Browser crash:** Canvas path becomes too complex (>10,000 points)

---

## Summary for Developer

**The bug is a GEOMETRIC APPROXIMATION ERROR caused by adaptive segment resolution.**

**Key insight:** The planet position is mathematically exact (Keplerian orbital mechanics), but the orbital path is drawn using linear segments. As zoom increases, segment count jumps discretely (64→128→256→512), causing the orbit line to "snap" to a new approximation. Since the planet is still small (fixed size mode), the snap is visually obvious.

**Not a timing issue:** Both planet and orbit are calculated in the same frame using the same Julian date.

**Not a coordinate system issue:** Both use the same `project3D()` function with identical camera transforms.

**The fix must balance:**
- Geometric accuracy (more segments = smaller error)
- Performance cost (more segments = slower rendering)
- Visual smoothness (avoid discrete jumps in segment count)

**Test-driven approach:** Use Test 2 (pixel error measurement) to quantify improvement. Aim for <2px error at all zoom levels while maintaining 60 FPS.
