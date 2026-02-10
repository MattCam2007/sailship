# Planet Rings Specification

## 1. Executive Summary

Add visible ring systems to Saturn (primary) and optionally Uranus and Neptune, which also possess ring systems. Saturn's rings are its most iconic visual feature and currently absent from the game. When the player zooms in on Saturn, they see only a featureless sphere (gradient or textured), missing the single most recognizable feature in the solar system. Rings should render correctly in 3D, accounting for axial tilt, camera angle, and sun illumination, and should gracefully degrade at small screen sizes.

## 1.1 Estimated File Impact

### Files to EDIT:
- `src/js/config.js` - Add `RING_CONFIG` data (ring radii, colors, opacity per body)
- `src/js/ui/renderer.js` - Add ring drawing in `drawBody()`, split into behind/in-front passes
- `src/js/lib/planetTextures.js` - Potentially extend WebGL shader to render rings as part of the textured sphere pipeline (alternative approach)

### Files to CREATE:
- `src/textures/2k_saturn_ring_alpha.png` - Saturn ring texture (radial strip, 1D or 2D)
- `reports/planet-rings-spec-2026-02-10.md` - This document
- `reports/planet-rings-implementation-plan-2026-02-10.md` - Implementation plan (Phase 2)

## 2. Current State Analysis

### 2.1 Existing Systems

| System | Location | Purpose |
|--------|----------|---------|
| Body Data | `src/js/data/celestialBodies.js` | Keplerian orbital elements per body. No ring data. |
| Display Config | `src/js/config.js` `BODY_DISPLAY` | Per-body radius, color, physicalRadiusKm. No ring properties. |
| Body Renderer | `src/js/ui/renderer.js` `drawBody()` | Draws sphere (gradient or textured) + glow + label. No ring pass. |
| WebGL Textures | `src/js/lib/planetTextures.js` | Offscreen ray-sphere shader for textured planets. Sphere only. |
| Camera/Projection | `src/js/core/camera.js` `project3D()` | Orthographic 3D->2D with Z/X rotation. Returns `{x, y, depth}`. |
| Scale Rendering | `src/js/ui/renderer.js` `calculateScreenRadius()` | Hybrid fixed/scaled planet sizes with smoothstep blend. |
| Texture Config | `src/js/config.js` `PLANET_TEXTURE_CONFIG` | Axial tilts, rotation rates, texture filenames per body. Saturn tilt: 26.73 deg. |

### 2.2 Data Flow

```
gameLoop() -> render() -> drawBody(body, centerX, centerY, scale)
  -> project3D(body.x, body.y, body.z) -> {screenX, screenY, depth}
  -> calculateScreenRadius(body, scale) -> screenRadius (pixels)
  -> if SOL: draw sun gradient + corona
  -> else: draw gradient sphere OR textured sphere (crossfade)
  -> draw atmospheric glow
  -> draw label
```

Bodies are sorted by depth before drawing, so farther bodies render first. This per-body sort does NOT handle the ring z-ordering problem (ring parts in front of AND behind the planet body).

### 2.3 Relevant Code

- `renderer.js:drawBody()` (line 510-663) - Main body rendering function. This is where ring drawing must be inserted.
- `renderer.js:calculateScreenRadius()` (line 257-276) - Computes screen pixel radius. Ring outer radius would be a multiple of this.
- `camera.js:project3D()` (line 84-108) - Orthographic projection with camera rotation. Ring ellipse geometry depends on this.
- `config.js:PLANET_TEXTURE_CONFIG.axialTilts` (line 616-626) - Saturn's axial tilt (26.73 deg) determines ring plane orientation.
- `config.js:BODY_DISPLAY.SATURN` (line 450) - Saturn's physical radius: 58,232 km. Rings extend to ~140,000 km (2.4x planet radius).
- `planetTextures.js` fragment shader (ray-sphere intersection) - Currently only intersects a unit sphere. Would need ring-plane intersection for WebGL approach.

### 2.4 Camera System Details

The camera uses **orthographic projection** (no perspective foreshortening). This simplifies ring rendering because:
- A circular ring in 3D projects to an **ellipse** in 2D
- The ellipse axes are determined solely by the ring plane's tilt relative to the camera
- No perspective tapering (near side of ring same size as far side)

Camera state:
- `angleX`: Tilt from above (default 15 deg) - this is what makes rings visible as ellipses rather than edge-on lines
- `angleZ`: Rotation around the Z-axis (user panning)
- `zoom`: Zoom multiplier

### 2.5 Rendering Order Context

Bodies are sorted by depth and drawn back-to-front. However, rings create an intra-body z-ordering challenge:
- The **back half** of the ring (farther from camera) should render **behind** the planet sphere
- The **front half** of the ring (closer to camera) should render **in front of** the planet sphere

This requires splitting ring rendering into two passes around the planet body draw, or using a single-pass WebGL approach with proper depth testing.

## 3. Gap Analysis

### 3.1 Missing Capabilities

- [ ] **Ring data** - No ring geometry defined anywhere (inner/outer radii, tilt, opacity, color)
- [ ] **Ring rendering** - No code to draw rings (neither 2D Canvas ellipse nor WebGL)
- [ ] **Ring z-ordering** - No mechanism to draw part of a body's decoration behind and part in front
- [ ] **Ring texture** - No ring texture asset (Saturn's rings have distinct bands: A, B, C, Cassini Division)
- [ ] **Ring illumination** - No lighting model for ring brightness (rings are lit by the Sun, cast shadows)
- [ ] **Ring scaling** - No logic for how rings appear at different zoom levels (fixed vs scaled)
- [ ] **Planet shadow on rings** - Saturn casts a shadow on its own rings (visible from certain angles)

### 3.2 Required Changes

- [ ] Add ring configuration data to `config.js` (radii, colors, opacity per ringed body)
- [ ] Add ring rendering to `renderer.js:drawBody()` with two-pass approach (back ring, planet, front ring)
- [ ] Compute ring ellipse projection from axial tilt + camera angles
- [ ] Scale ring rendering consistently with planet size (hybrid fixed/scaled)
- [ ] Create or source a Saturn ring texture (radial color/opacity strip)
- [ ] Optionally extend WebGL shader for high-quality ring rendering at large screen sizes

## 4. Ring Geometry & Physics Reference

### 4.1 Saturn's Ring System

| Ring | Inner Radius (km) | Outer Radius (km) | Inner (x planet R) | Outer (x planet R) | Notes |
|------|-------------------:|-------------------:|--------------------:|--------------------:|-------|
| D Ring | 66,900 | 74,510 | 1.15 | 1.28 | Very faint, innermost |
| C Ring | 74,658 | 92,000 | 1.28 | 1.58 | Dim, translucent |
| B Ring | 92,000 | 117,580 | 1.58 | 2.02 | Brightest, most opaque |
| Cassini Division | 117,580 | 122,170 | 2.02 | 2.10 | Dark gap |
| A Ring | 122,170 | 136,775 | 2.10 | 2.35 | Bright, contains Encke Gap |
| F Ring | 140,180 | 140,680 | 2.41 | 2.42 | Narrow, shepherded |

**Key ratio**: Rings extend from ~1.15x to ~2.42x Saturn's equatorial radius. For visual purposes, inner edge at ~1.2x and outer edge at ~2.4x is a good simplification.

**Axial tilt**: 26.73 deg (already in `PLANET_TEXTURE_CONFIG.axialTilts.SATURN`)

**Ring plane**: Aligned with Saturn's equatorial plane, which is tilted 26.73 deg from the ecliptic. The ring's normal vector is Saturn's polar axis.

### 4.2 Uranus Ring System

| Property | Value |
|----------|-------|
| Inner edge | ~38,000 km (1.50x R) |
| Outer edge | ~51,149 km (2.02x R) |
| Axial tilt | 97.77 deg (nearly sideways!) |
| Visibility | Very dark, narrow rings - barely visible |

Uranus's rings are extremely faint and dark. Including them is optional and would be a subtle detail.

### 4.3 Neptune Ring System

| Property | Value |
|----------|-------|
| Inner edge | ~41,900 km (1.70x R) |
| Outer edge | ~62,933 km (2.56x R) |
| Axial tilt | 28.32 deg |
| Visibility | Very faint, clumpy arcs |

Neptune's rings are also extremely faint. Optional inclusion.

### 4.4 Jupiter Ring System

| Property | Value |
|----------|-------|
| Inner edge | ~92,000 km (1.32x R) |
| Outer edge | ~226,000 km (3.23x R) |
| Axial tilt | 3.13 deg |
| Visibility | Extremely faint, only detected by spacecraft |

Jupiter's rings are effectively invisible and should probably be excluded.

## 5. Rendering Approach Analysis

### 5.1 Approach A: 2D Canvas Ellipse (Recommended for MVP)

**Technique**: Draw ring as a pair of concentric ellipses on the 2D canvas, with the ellipse axes computed from Saturn's axial tilt transformed through the camera projection.

**How it works**:
1. Compute ring plane normal from Saturn's axial tilt (26.73 deg from ecliptic pole)
2. Transform normal through camera rotations (angleZ, angleX)
3. The projected ring is an ellipse:
   - Semi-major axis = outer ring radius in screen pixels (same as planet scaling)
   - Semi-minor axis = semi-major * |sin(tilt_angle_to_camera)|
4. Draw as stroked/filled ellipse with gradient for ring bands
5. Split into back-half and front-half for correct z-ordering

**Pros**:
- Simple implementation, no WebGL changes
- Works at all zoom levels
- Fast (ellipse drawing is cheap)
- Easy to add color bands via gradient or multiple ellipses

**Cons**:
- No per-pixel ring texture detail (bands are approximated)
- Shadow of planet on rings is harder (but can be approximated with a clipping region)
- Ring transparency requires careful compositing

**Estimated complexity**: Medium. ~150-250 lines of new code.

### 5.2 Approach B: WebGL Ring Shader

**Technique**: Extend the `planetTextures.js` fragment shader to also ray-trace a flat disk (ring plane) in addition to the sphere, with proper depth ordering per-pixel.

**How it works**:
1. In the fragment shader, after sphere intersection, also intersect ray with the ring plane (y=0 in tilted coordinates)
2. If ring hit is closer than sphere hit, render ring pixel
3. If ring hit is farther, render sphere pixel (ring is behind planet)
4. Sample a 1D ring texture based on radial distance from planet center
5. Apply lighting and shadow from planet (sphere occlusion test)

**Pros**:
- Pixel-perfect z-ordering (no split-pass needed)
- Can use actual ring texture for detailed band structure
- Planet shadow on rings comes naturally (ray-sphere occlusion)
- Ring shadow on planet is also possible
- Visually superior result

**Cons**:
- Requires modifying the WebGL shader (more complex)
- Only active when screen radius > 30px (texture threshold)
- Need a fallback for small screen sizes anyway
- Ring extends beyond sphere bounds, so the render target needs to be larger
- Cache key complexity increases

**Estimated complexity**: High. ~100-150 lines shader changes + ~50 lines JS orchestration.

### 5.3 Approach C: Hybrid (Recommended)

**Technique**: Use 2D Canvas ellipses at all zoom levels for the basic ring shape, and optionally enhance with WebGL at high zoom. This gives a good visual at every scale.

**Implementation**:
- **Small scale** (< 30px screen radius): Simple ellipse outline in ring color
- **Medium scale** (30-100px): Filled ellipse with gradient bands, two-pass z-ordering
- **Large scale** (> 100px): Full textured rings via extended WebGL shader OR high-detail canvas gradient

**Recommended**: Start with Approach A (2D Canvas) as the MVP. It covers all zoom levels and is self-contained. Approach B can be added later as a visual enhancement if desired.

## 6. Key Technical Challenges

### 6.1 Ring Ellipse Projection

The ring lies in Saturn's equatorial plane. Its normal vector in ecliptic coordinates is:

```
// Saturn's pole direction (simplified - ignoring precession)
// Tilt = 26.73 deg, pole RA = 40.589 deg, pole Dec = 83.537 deg
// In ecliptic frame (simplified): pole tilted 26.73 deg from ecliptic north
ringNormal = { x: 0, y: -sin(26.73 deg), z: cos(26.73 deg) }
           = { x: 0, y: -0.4497, z: 0.8932 }
```

After camera rotation (angleZ then angleX), the projected ellipse has:
- **Semi-major axis**: Always equal to the ring's screen radius (ring is circular, orthographic projection preserves one axis)
- **Semi-minor axis**: Compressed by the cosine of the angle between the ring normal and the camera view direction
- **Rotation angle**: Determined by the projected ring normal orientation on screen

### 6.2 Z-Ordering (Two-Pass Approach)

For the 2D canvas approach, rings must be drawn in two passes:

```
Pass 1: Draw the BACK half of the ring (the half farther from camera)
Pass 2: Draw the planet sphere (gradient or textured)
Pass 3: Draw the FRONT half of the ring (the half closer to camera)
```

This can be achieved by clipping the ellipse draw to the top or bottom half (depending on which side faces the camera). The dividing line is the planet's equatorial diameter projected on screen.

### 6.3 Ring Appearance at Different Scales

| Screen Radius | Ring Treatment |
|---------------|----------------|
| < 8px | No ring (too small to be meaningful) |
| 8-20px | Simple line/stroke ellipse hint |
| 20-50px | Filled ellipse with basic color bands |
| 50-100px | Detailed gradient with Cassini Division gap |
| > 100px | Full detail with optional texture |

### 6.4 Ring Color and Opacity

Saturn's rings vary in color and opacity across their radial extent:
- **C Ring**: Grayish, semi-transparent (opacity ~0.2-0.4)
- **B Ring**: Creamy white/tan, opaque (opacity ~0.8-1.0) - brightest
- **Cassini Division**: Dark gap (opacity ~0.05)
- **A Ring**: Lighter tan, moderately opaque (opacity ~0.4-0.7)

A radial gradient can approximate this banding pattern using 6-8 color stops.

### 6.5 Performance Considerations

- Ring ellipse drawing is cheap on 2D canvas (~0.1ms per body)
- Only 1-3 bodies have rings (Saturn always, Uranus/Neptune optional)
- Gradient caching can be reused (same as planet gradient cache)
- At system zoom (50 px/AU), Saturn's ring screen radius is ~0.003px - well below the 8px minimum, so no extra rendering occurs at wide zoom levels
- Performance impact is negligible

## 7. Planets That Should Have Rings

| Planet | Ring Visibility | Priority | Recommendation |
|--------|----------------|----------|----------------|
| **Saturn** | Highly visible, iconic | **Must have** | Full ring rendering with band detail |
| Uranus | Very faint, narrow, dark | Nice-to-have | Subtle thin line at 97.77 deg tilt (dramatic sideways angle) |
| Neptune | Very faint, incomplete arcs | Optional | Omit or very subtle hint |
| Jupiter | Invisible to naked eye | Skip | Not worth rendering |

## 8. Open Questions

- [ ] **Ring texture asset**: Should we source a Saturn ring texture (radial strip image) for high-zoom detail, or use procedural gradients only? A texture gives better visual fidelity but adds an asset dependency. Procedural gradients are self-contained.
- [ ] **Planet shadow on rings**: Should the planet's shadow be rendered on the rings? This is a nice visual detail but adds complexity (computing the shadow cone projection on the ring plane). Could be deferred to a later enhancement.
- [ ] **Ring shadow on planet**: At certain Sun angles, the rings cast a shadow band across Saturn's surface. This would require extending the WebGL shader. Definitely a later enhancement.
- [ ] **Uranus/Neptune rings**: Should these be included in the MVP, or deferred? Given their faintness, they could be simple single-color ellipses added after Saturn works.
- [ ] **Encounter markers / ghost planets**: When ghost Saturns appear at trajectory crossings, should they also show rings? Probably yes for visual consistency, but this adds a rendering path.
- [ ] **Edge-on viewing**: When the camera tilt aligns exactly with the ring plane (ring appears as a line), should we render a thin line or skip rendering? Saturn's rings are razor-thin (~10m thick) and essentially disappear edge-on.

## 9. Recommendation

**Start with Approach A (2D Canvas Ellipses)** for these reasons:

1. It covers all zoom levels with a single technique
2. No WebGL shader changes needed (lower risk, lower complexity)
3. Saturn's rings are immediately visible and recognizable
4. The two-pass z-ordering is straightforward with canvas clipping
5. Color banding via gradients gives a convincing approximation
6. Can be enhanced later with WebGL detail at high zoom (Approach C)

The implementation should be structured as:
1. **Unit 1**: Add ring configuration data to `config.js`
2. **Unit 2**: Compute ring ellipse projection from axial tilt + camera
3. **Unit 3**: Draw basic ring ellipse (single pass, no z-ordering)
4. **Unit 4**: Implement two-pass z-ordering (back ring, planet, front ring)
5. **Unit 5**: Add radial gradient for ring band detail (B ring, Cassini Division, A ring)
6. **Unit 6**: Scale-aware rendering (skip at small sizes, detail at large)
7. **Unit 7**: Optional Uranus/Neptune subtle rings
