# Planet Visual Upgrade - Design Document

**Date:** 2026-01-21
**Status:** Approved
**Primary Goal:** Visual immersion through scale-accurate planet rendering

---

## 1. Overview

### 1.1 Problem Statement
Currently, planets render at fixed pixel sizes (e.g., Earth = 6px) regardless of zoom level or distance. This breaks visual immersion, especially compared to the date-accurate starfield. Players cannot see planets grow as they approach, making the scale feel artificial.

### 1.2 Solution Summary
Implement **hybrid rendering** that smoothly transitions from fixed-size (when small) to scale-accurate (when large) based on screen size. Planets will naturally grow as you zoom in or approach them, maintaining visual clarity at system scale while providing immersive realism at close range.

### 1.3 Design Principles
- **Pure rendering concern** - No changes to physics, orbital mechanics, or game logic
- **Smooth transitions** - Gradual blend prevents jarring visual pops
- **Consistent rules** - Same logic applies to all bodies (planets, moons)
- **Future-proof** - Architecture supports progressive detail enhancement (future project)
- **Real data baseline** - Start with actual astronomical radii, easy to tune later

---

## 2. High-Level Architecture

### 2.1 Current State
- Planets use fixed pixel sizes from `BODY_DISPLAY` config
- Renderer uses `project3D()` for coordinate conversion
- Gradient cache system for performance optimization
- Radial gradients create 3D appearance for small orbs

### 2.2 Proposed System

**Hybrid Rendering Mode:**
For each body, calculate two radius values:
- **Fixed radius**: Current pixel size from config (visual clarity when small)
- **Scaled radius**: Physical size in km → AU → screen pixels

**Screen-Size Based Blending:**
- **< 20px**: Pure fixed size (current behavior)
- **20-100px**: Smooth interpolation from fixed to scaled
- **> 100px**: Pure scaled size (astronomical accuracy)

**Special Cases:**
- **Sun**: Always uses scaled rendering (body is massive, always visual anchor)
- **Moons**: Follow same rules as planets (consistent behavior)

### 2.3 Rendering Pipeline
```
1. project3D(body position) → screen coordinates
2. calculateScaledRadius(physical size, zoom) → scaled pixel radius
3. calculateBlendFactor(screen size) → interpolation weight (0-1)
4. lerp(fixed radius, scaled radius, blend factor) → final render radius
5. Draw with existing gradient system using calculated radius
```

---

## 3. Data Model

### 3.1 Physical Radius Data
Add `physicalRadiusKm` to `BODY_DISPLAY` in `config.js`:

```javascript
export const BODY_DISPLAY = {
    SOL:      { radius: 15, color: '#ffdd44', physicalRadiusKm: 696000 },
    MERCURY:  { radius: 4,  color: '#b5b5b5', physicalRadiusKm: 2440 },
    VENUS:    { radius: 6,  color: '#e8c44c', physicalRadiusKm: 6052 },
    EARTH:    { radius: 6,  color: '#4c9ee8', physicalRadiusKm: 6371 },
    MARS:     { radius: 5,  color: '#e85d4c', physicalRadiusKm: 3390 },
    JUPITER:  { radius: 12, color: '#d4a574', physicalRadiusKm: 69911 },
    CERES:    { radius: 4,  color: '#777777', physicalRadiusKm: 476 },
    LUNA:     { radius: 3,  color: '#888888', physicalRadiusKm: 1737 },
    PHOBOS:   { radius: 2,  color: '#666666', physicalRadiusKm: 11 },
    GANYMEDE: { radius: 4,  color: '#999999', physicalRadiusKm: 2634 },
};
```

**Field Meanings:**
- `radius`: Fixed pixel size for small/distant rendering (unchanged)
- `physicalRadiusKm`: Actual astronomical radius for scale calculations (new)
- `color`: Visual color (unchanged)

### 3.2 Scale Rendering Configuration
New constants in `config.js`:

```javascript
export const SCALE_RENDERING_CONFIG = {
    minScreenSize: 20,      // Start blend transition (pixels)
    maxScreenSize: 100,     // End blend transition (pixels)
    sunAlwaysScaled: true,  // Sun bypasses fixed rendering
    kmToAU: 1 / 149597870.7 // km to AU conversion constant
};
```

### 3.3 Extended Zoom Levels
Add closer zoom levels to support high orbit scale:

```javascript
export const ZOOM_LEVELS = {
    system: 50,       // Existing: whole solar system view
    inner: 200,       // Existing: inner planets
    local: 800,       // Existing: single planet region
    tactical: 3000,   // Existing: close tactical view
    approach: 12000,  // NEW: Planet approach scale
    orbital: 50000,   // NEW: High orbit scale (~50,000-200,000 km altitude)
};
```

---

## 4. Rendering Calculations

### 4.1 Screen Radius Calculation
Main function that determines final render radius:

```javascript
function calculateScreenRadius(body, scale) {
    const display = getBodyDisplay(body);

    // Sun always uses scaled rendering
    if (body.name === 'SOL') {
        return calculateScaledRadius(display.physicalRadiusKm, scale);
    }

    // Calculate scaled radius
    const scaledRadius = calculateScaledRadius(display.physicalRadiusKm, scale);

    // Determine current screen size (larger of fixed or scaled)
    const currentSize = Math.max(display.radius, scaledRadius);

    // Get blend factor based on screen size
    const blendFactor = calculateBlendFactor(currentSize);

    // Interpolate between fixed and scaled
    return lerp(display.radius, scaledRadius, blendFactor);
}
```

### 4.2 Scaled Radius Formula
Convert physical size to screen pixels:

```javascript
function calculateScaledRadius(radiusKm, scale) {
    const { kmToAU } = SCALE_RENDERING_CONFIG;

    // km → AU → screen pixels
    const radiusAU = radiusKm * kmToAU;
    return radiusAU * scale * camera.zoom;
}
```

**Example calculations:**
- Earth at system zoom (scale=50, zoom=1): 6371 km → 0.0000426 AU → 2.1 px (uses fixed 6px)
- Earth at orbital zoom (scale=50, zoom=1000): 6371 km → 0.0000426 AU → 2130 px (fully scaled)

### 4.3 Blend Factor (Smoothstep Interpolation)
Calculate interpolation weight between fixed and scaled:

```javascript
function calculateBlendFactor(screenSize) {
    const { minScreenSize, maxScreenSize } = SCALE_RENDERING_CONFIG;

    if (screenSize <= minScreenSize) return 0.0; // Pure fixed
    if (screenSize >= maxScreenSize) return 1.0; // Pure scaled

    // Smooth hermite interpolation (smoothstep)
    const t = (screenSize - minScreenSize) / (maxScreenSize - minScreenSize);
    return t * t * (3 - 2 * t);
}
```

**Smoothstep advantages:**
- C1 continuous (smooth derivatives at boundaries)
- No visible "pop" at transition points
- Well-tested in computer graphics

### 4.4 Linear Interpolation Helper
Standard lerp for blending radii:

```javascript
function lerp(a, b, t) {
    return a + (b - a) * t;
}
```

---

## 5. Integration with Existing Renderer

### 5.1 Modifications to `drawBody()`
Replace direct use of `display.radius` with calculated radius:

```javascript
function drawBody(body, centerX, centerY, scale) {
    const projected = project3D(body.x, body.y, body.z, centerX, centerY, scale);
    const display = getBodyDisplay(body);

    // NEW: Calculate screen radius
    const screenRadius = calculateScreenRadius(body, scale);

    // Enhanced sun rendering (use screenRadius throughout)
    if (body.name === 'SOL') {
        const sunKey = `radial_sun_${projected.x.toFixed(2)}_${projected.y.toFixed(2)}_${screenRadius.toFixed(1)}`;
        const gradient = getCachedGradient(sunKey, () => {
            const grad = ctx.createRadialGradient(
                projected.x, projected.y, 0,
                projected.x, projected.y, screenRadius  // was: display.radius
            );
            // ... color stops unchanged
            return grad;
        });

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(projected.x, projected.y, screenRadius, 0, Math.PI * 2);
        ctx.fill();

        // Corona (scale with radius)
        // ... use screenRadius instead of display.radius
    }
    // Planets and moons
    else {
        const planetKey = `radial_planet_${body.name}_${projected.x.toFixed(2)}_${projected.y.toFixed(2)}_${screenRadius.toFixed(1)}`;
        // ... same pattern, replace display.radius with screenRadius
    }

    // Labels (adjust offset)
    if (displayOptions.showLabels) {
        drawLabel(body.name, projected.x + screenRadius + 5, projected.y + 3, ...);
    }
}
```

### 5.2 Gradient Cache Updates
Cache keys must include `screenRadius` (rounded to prevent thrashing):

**Before:**
```javascript
const cacheKey = `radial_planet_${body.name}_${projected.x.toFixed(2)}_${projected.y.toFixed(2)}_${display.radius}`;
```

**After:**
```javascript
const cacheKey = `radial_planet_${body.name}_${projected.x.toFixed(2)}_${projected.y.toFixed(2)}_${screenRadius.toFixed(1)}`;
```

**Cache behavior:**
- At system zoom: radius stable, cache hits high
- During zoom transition: some cache misses, regenerates as needed
- At orbital zoom: radius changes slowly, cache effective

### 5.3 No Changes Required
These systems remain unchanged:
- `drawOrbit()` - orbital paths unaffected
- `drawShipOrbit()` - ship rendering unchanged
- `project3D()` - coordinate projection unchanged
- `updateCelestialPositions()` - position calculations unchanged
- All physics and orbital mechanics - completely separate

---

## 6. Implementation Units

### Unit 1: Add Physical Radius Data
**Files:** `src/js/config.js`
- Add `physicalRadiusKm` to all entries in `BODY_DISPLAY`
- Use real astronomical data

**Acceptance Criteria:**
- [ ] All bodies have `physicalRadiusKm` field
- [ ] Values match real astronomical radii

### Unit 2: Add Scale Rendering Config
**Files:** `src/js/config.js`
- Add `SCALE_RENDERING_CONFIG` constant
- Add new zoom levels (`approach`, `orbital`)

**Acceptance Criteria:**
- [ ] Config exports properly
- [ ] No import errors

### Unit 3: Implement Helper Functions
**Files:** `src/js/ui/renderer.js`
- Implement `calculateScaledRadius()`
- Implement `calculateBlendFactor()`
- Implement `lerp()`
- Implement `calculateScreenRadius()`

**Acceptance Criteria:**
- [ ] Functions defined and exported
- [ ] Mathematical correctness verified
- [ ] Works with test values in console

### Unit 4: Integrate into drawBody()
**Files:** `src/js/ui/renderer.js`
- Replace `display.radius` with `calculateScreenRadius()`
- Update sun rendering section
- Update planet/moon rendering section
- Update label offset calculation

**Acceptance Criteria:**
- [ ] No runtime errors
- [ ] Bodies still render correctly
- [ ] Sun uses scaled rendering

### Unit 5: Update Gradient Cache Keys
**Files:** `src/js/ui/renderer.js`
- Update cache key generation to use `screenRadius`
- Round to 1 decimal to prevent thrashing

**Acceptance Criteria:**
- [ ] Cache still functions correctly
- [ ] No memory leaks
- [ ] Performance remains stable

### Unit 6: Visual Testing & Tuning
**Files:** Testing only, potential config adjustments
- Test at all zoom levels
- Verify smooth transitions
- Check all body types
- Tune `minScreenSize`/`maxScreenSize` if needed

**Acceptance Criteria:**
- [ ] Planets grow smoothly when zooming in
- [ ] No visual pops or discontinuities
- [ ] Sun is always scaled
- [ ] Moons behave consistently
- [ ] Performance is acceptable

---

## 7. Testing Strategy

### 7.1 Visual Tests
1. **System zoom test**: Planets should be tiny, fixed size
2. **Zoom toward Earth**: Smooth growth from 6px → hundreds of pixels
3. **Orbital zoom test**: Earth fills 30-50% of screen
4. **Jupiter comparison**: Noticeably larger than Earth (11× radius)
5. **Moon test**: Luna transitions smoothly like planets
6. **Sun test**: Huge when close, tiny when far, always scaled
7. **Transition smoothness**: No visible pops during zoom

### 7.2 Performance Tests
- Monitor FPS at various zoom levels
- Check gradient cache hit rate (should remain high)
- Verify no memory leaks during extended zoom sessions
- Profile frame time (should be negligible impact)

### 7.3 Edge Cases
- Very small bodies (Phobos at 11km radius)
- Very large bodies (Jupiter, Sun)
- Rapid zoom changes
- Multiple bodies at different distances
- Bodies near screen edge

---

## 8. Future Enhancement Path

This design explicitly supports future progressive detail enhancements:

### Phase 2 (Next Project): Enhanced Gradients
```javascript
function calculateScreenRadius(body, scale) {
    const screenSize = /* calculate */;
    const detailLevel = getDetailLevel(screenSize);

    switch(detailLevel) {
        case 'tiny':    // < 20px - fixed size + glow
        case 'small':   // 20-100px - blend to scaled (CURRENT)
        case 'medium':  // 100-500px - scaled + enhanced shading (FUTURE)
        case 'large':   // 500px+ - scaled + terminator effects (FUTURE)
    }
}
```

### Potential Enhancements
- Hemisphere shading based on Sun position
- Day/night terminator line
- Atmospheric glow for planets with atmospheres
- Texture mapping (far future)
- Cloud layers (far future)

**Key point:** Current architecture provides clean dispatch point for LOD system.

---

## 9. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Small bodies disappear | Medium | Medium | Use real data first, tune if needed. Can add minimum size enforcement. |
| Transition visible as "pop" | Low | Medium | Smoothstep interpolation prevents this. Wide blend range (20-100px). |
| Performance degradation | Low | Low | Simple math, gradient cache handles dynamic radii. |
| Cache thrashing during zoom | Low | Low | Round screenRadius to 1 decimal in cache key. |
| Sun rendering breaks | Low | High | Test sun specifically, it's always-scaled logic is simple. |
| Gradient artifacts at large sizes | Medium | Medium | Current gradients should scale fine. Monitor in testing. |

**Overall confidence:** High (8/10)
- Design is simple and well-understood
- Low coupling with existing systems
- Easy to tune if behavior doesn't feel right
- Clear rollback path (revert to fixed size)

---

## 10. Success Criteria

### Visual Immersion
- [ ] Planets grow naturally as you zoom in
- [ ] Scale feels realistic compared to starfield
- [ ] Transitions are invisible (no pops or jumps)

### Technical Quality
- [ ] No performance regression
- [ ] No visual artifacts or glitches
- [ ] Works for all body types (planets, moons, sun)

### Maintainability
- [ ] Code is clean and well-documented
- [ ] Easy to tune parameters
- [ ] Future enhancement path is clear

---

## 11. Out of Scope

**Not included in this project:**
- Enhanced lighting/shading (next project)
- Texture mapping
- Atmospheric effects
- Surface details
- Planetary rotation
- Eclipses or shadows
- Performance optimizations (current system is already fast)

---

## References

- **DEVELOPMENT_PROCESS.md** - Process framework
- **CLAUDE.md** - Project conventions
- **src/js/ui/renderer.js** - Current rendering system
- **src/js/config.js** - Configuration management
- Smoothstep function: https://en.wikipedia.org/wiki/Smoothstep
