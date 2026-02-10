# Planet Rings Implementation Plan

**Date:** 2026-02-10
**Status:** In Progress
**Spec:** reports/planet-rings-spec-2026-02-10.md

## 0. File Impact Summary

### Files to EDIT:
1. `src/js/config.js` - Add `RING_CONFIG` constant with per-body ring geometry and colors
2. `src/js/ui/renderer.js` - Add `drawRings()` function, integrate into `drawBody()` with two-pass z-ordering

### Files to CREATE:
- `reports/planet-rings-implementation-plan-2026-02-10.md` - This document
- `reports/planet-rings-review-2026-02-10.md` - Review report

### Files to DELETE:
- None

## 1. Problem Statement

### 1.1 Description
Saturn, Uranus, and Neptune all have ring systems, but the game renders them as plain spheres. Saturn's rings are arguably the most iconic visual feature in the solar system and their absence is jarring when zooming in. Uranus has dramatic sideways rings (97.77 deg tilt) and Neptune's rings add completeness.

### 1.2 Root Cause
The renderer was built for spherical bodies only. No ring geometry, projection math, or multi-pass rendering was needed until now.

### 1.3 Constraints
- **Browser performance**: Must run at 60 FPS. Only 3 bodies have rings, so per-frame cost must be < 1ms total.
- **No build system**: Vanilla JS, no shaders beyond existing planetTextures.js WebGL.
- **Orthographic projection**: Camera uses orthographic (no perspective), which simplifies ring ellipse math.
- **Existing z-sort**: Bodies are sorted by depth as whole units. Ring z-ordering must be handled within `drawBody()`.
- **Visual quality**: Rings should be visually striking, especially Saturn's bands and Cassini Division.

## 2. Solution Architecture

### 2.1 High-Level Design

```
drawBody(body) {
    if (body has rings AND screenRadius >= threshold) {
        compute ring ellipse from axial tilt + camera
        draw BACK half of ring (behind planet)
    }

    draw planet sphere (existing code, unchanged)

    if (body has rings AND screenRadius >= threshold) {
        draw FRONT half of ring (in front of planet)
    }
}
```

Ring ellipse geometry is computed from the body's axial tilt (already in PLANET_TEXTURE_CONFIG) transformed through camera rotations. The 2D Canvas `ellipse()` API draws the projected ring, clipped to half for correct z-ordering.

### 2.2 Design Principles

1. **Minimal invasion**: Ring code is self-contained in a new `drawRings()` function. The only change to existing `drawBody()` is two conditional calls around the planet sphere draw.
2. **Data-driven**: All ring geometry (radii, colors, opacity) is in config.js. Adding a ring to another body is just a config entry.
3. **Progressive detail**: Rings scale from a simple line hint at 10px to full gradient bands at 80px+.
4. **Performance-first**: No expensive operations. Ellipse drawing is GPU-accelerated on canvas. Gradient caching via existing system.

### 2.3 Key Algorithms

#### Ring Ellipse Projection

The ring lies in the body's equatorial plane. Its normal vector (pole direction) in ecliptic coordinates:

```
// Simplified: ring normal tilted from ecliptic north by axial tilt
// Full model would use pole RA/Dec, but axial tilt is sufficient for visual
poleEcliptic = { x: 0, y: -sin(tilt), z: cos(tilt) }
```

After camera rotation (same transforms as project3D):
```
// Rotate pole by camera.angleZ (around Z)
px1 = pole.x * cos(αZ) - pole.y * sin(αZ)
py1 = pole.x * sin(αZ) + pole.y * cos(αZ)

// Rotate by camera.angleX (around X)
py2 = py1 * cos(αX) - pole.z * sin(αX)
pz2 = py1 * sin(αX) + pole.z * cos(αX)

// The projected pole in screen space is (px1, -py2) [Y flipped]
// Ring ellipse semi-minor axis = semi-major * |pz2| (foreshortening)
// Ring rotation angle = atan2(-py2, px1) + 90 deg (perpendicular to pole)
```

The ring ellipse parameters:
- **Center**: planet screen position (projected.x, projected.y)
- **Semi-major axis**: ringOuterRadius in screen pixels (same scaling as planet)
- **Semi-minor axis**: semiMajor * |pz2| (cosine of tilt relative to camera view direction)
- **Rotation**: angle of the projected equatorial plane on screen

#### Two-Pass Clipping

To draw the back half behind the planet and front half in front:
- The "dividing line" is the planet's equatorial diameter projected on screen
- **Back half**: The half-ellipse farther from camera (where ring depth > planet depth)
- **Front half**: The half-ellipse closer to camera

With orthographic projection, this simplifies to clipping the ellipse at the horizontal line through the planet center (after rotating to align with the ring's projected tilt). We use `ctx.clip()` with a rectangular region covering only the desired half.

The sign of `pz2` (the camera-facing component of the pole) determines which half is "front":
- If `pz2 > 0`: We're looking at the ring from above (north pole toward camera). The bottom half is in front.
- If `pz2 < 0`: We're looking from below. The top half is in front.

#### Ring Color Gradient (Saturn)

Saturn's rings rendered as concentric ellipses with a radial gradient:

```
Ring region (1.2x to 2.3x planet radius):
  0.00 (inner edge)  → rgba(180, 160, 120, 0.15)  C ring (faint)
  0.25               → rgba(210, 190, 155, 0.85)   B ring inner (bright)
  0.45               → rgba(225, 205, 170, 0.90)   B ring peak
  0.54               → rgba(40, 35, 30, 0.10)      Cassini Division (dark gap)
  0.58               → rgba(200, 180, 145, 0.70)   A ring inner
  0.85               → rgba(190, 170, 135, 0.50)   A ring outer (fading)
  1.00 (outer edge)  → rgba(160, 140, 110, 0.05)   F ring (faint edge)
```

## 3. Units of Work

### Unit 1: Ring Configuration Data
**Description:** Add RING_CONFIG to config.js with ring geometry for Saturn, Uranus, and Neptune.
**Files:** `src/js/config.js`
**Acceptance Criteria:**
- [ ] RING_CONFIG exported with entries for SATURN, URANUS, NEPTUNE
- [ ] Each entry has innerRadius, outerRadius (as multiples of planet radius), color stops, and min display threshold
- [ ] No runtime errors on page load

### Unit 2: Ring Ellipse Projection
**Description:** Add `computeRingProjection()` function to renderer.js that computes ring ellipse parameters from a body's axial tilt and the current camera state.
**Files:** `src/js/ui/renderer.js`
**Acceptance Criteria:**
- [ ] Function returns { centerX, centerY, semiMajorOuter, semiMajorInner, semiMinorOuter, semiMinorInner, rotation, poleZ, visible }
- [ ] Ring flattens when viewed edge-on (semiMinor approaches 0)
- [ ] Ring rotates correctly when camera rotates
- [ ] Returns visible=false when ring is too edge-on to render (|poleZ| < 0.05)

### Unit 3: Two-Pass Ring Rendering with Gradient Bands
**Description:** Add `drawRings()` function with back/front half clipping and gradient band coloring. Integrate into `drawBody()`.
**Files:** `src/js/ui/renderer.js`
**Acceptance Criteria:**
- [ ] Saturn shows visible rings when zoomed in
- [ ] Back half renders behind planet, front half in front
- [ ] Saturn ring shows distinct color bands (B ring bright, Cassini Division dark)
- [ ] Rings disappear gracefully at small screen sizes
- [ ] No visual artifacts (no gap between halves, no bleeding)

### Unit 4: Scale-Aware Detail + Uranus/Neptune Rings
**Description:** Add progressive detail levels based on screen radius, and verify Uranus and Neptune rings render correctly.
**Files:** `src/js/ui/renderer.js`, `src/js/config.js`
**Acceptance Criteria:**
- [ ] Rings not drawn below minimum threshold (8px screen radius)
- [ ] At 8-20px: simple line hint
- [ ] At 20px+: full gradient bands
- [ ] Uranus shows thin dark rings at 97.77 deg tilt (nearly sideways!)
- [ ] Neptune shows faint subtle rings
- [ ] Performance: < 1ms total for all 3 ringed bodies per frame

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Ring clipping artifacts | Medium | Medium | Use generous clip region, test edge-on angles |
| Performance at high zoom | Low | Low | Only 3 bodies, ellipse draw is fast, gradient caching |
| Ring/planet overlap seam | Medium | Low | Overlap clip regions slightly (1px) to prevent gap |
| Axial tilt inaccuracy | Low | Low | Using existing PLANET_TEXTURE_CONFIG.axialTilts values |
| Edge-on ring (line artifact) | Medium | Medium | Skip rendering when |poleZ| < 0.05 |

## 5. Testing Strategy

### 5.1 Manual Verification
- Navigate to Saturn and zoom in at various levels
- Rotate camera (Q/E keys) to verify ring projection changes correctly
- Tilt camera (W/S keys) to verify edge-on behavior
- Check Uranus for dramatic sideways rings
- Check Neptune for subtle faint rings
- Verify no performance degradation at system zoom (many bodies visible)
- Verify rings don't appear on non-ringed planets

### 5.2 Edge Cases
- Camera looking exactly edge-on to ring plane
- Extreme zoom levels (both very close and very far)
- Saturn near screen edge (clipping still correct?)
- Ghost Saturn in encounter markers (rings should appear if screen radius is large enough)
