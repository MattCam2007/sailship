# Camera-Responsive Planet Rotation Implementation Plan

**Date:** 2026-02-10  
**Feature:** Make planet textures respond to camera rotation for "look around" effect  
**Status:** Design Complete - Ready for Implementation

---

## Problem Statement

### Current Behavior
When the player rotates the camera view (Q/E keys for Z-axis rotation, W/S for X-axis tilt, or right-click drag), planets do not rotate in response. The player always sees the same hemisphere of each planet, creating a static "billboard" effect that breaks immersion.

### Desired Behavior
When the camera rotates right (angleZ increases), planets should appear to rotate left, showing different hemispheres. This simulates the player "flying around" the planet and seeing it from different angles, similar to orbiting a planet in real space.

### Technical Context
- **Current rotation source:** Planet textures only rotate based on `gameDays` (planetary spin)
- **Camera system:** `camera.angleZ` (rotation around Z-axis) and `camera.angleX` (tilt from above)
- **Shader pipeline:** Fragment shader applies `uRotation` uniform for Y-axis planet spin
- **Transform chain (current):** `planet_rotation(Y-axis) → axial_tilt(X-axis)`
- **Cache system:** Rendered spheres cached with keys including rotation and sun angle

---

## Root Cause Analysis

### Current Transform Chain
The fragment shader in `planetTextures.js` applies transformations in this order:

```glsl
// Lines 119-136 of planetTextures.js
vec3 normal = normalize(hitPos);

// 1. Apply axial tilt (rotate normal around X axis)
vec3 tiltedNormal = rotateX(normal, uAxialTilt);

// 2. Apply planet rotation (around Y axis)
vec3 rotatedNormal = rotateY(tiltedNormal, uRotation);
```

**Problem:** Camera rotation happens in the screen-space projection (`project3D()` in camera.js), not in the sphere rendering. The shader receives the same world-space light direction and rotation regardless of camera orientation.

### Why Planets Don't Respond to Camera
1. `sunAngle` parameter (lines 899-904 of renderer.js) is calculated in **screen space** from projected positions
2. Screen-space `sunAngle` already accounts for camera rotation via `project3D()`
3. The shader converts this back to a 3D light vector, but has **no information about camera orientation**
4. Planet rotation (`uRotation`) is driven only by `gameDays`, independent of camera

**Key Insight:** The shader needs camera rotation angles as additional uniforms to apply a "view rotation" transform before planet spin.

---

## Mathematical Solution

### Transform Order
To achieve the "look around" effect, we need to apply camera rotation **before** planet rotation in the transform chain:

```
camera_rotation → planet_rotation → axial_tilt
```

This order ensures:
1. **Camera rotation** orients the sphere relative to the viewer's perspective
2. **Planet rotation** applies the day/night cycle spin
3. **Axial tilt** positions the poles correctly

### Rotation Matrices

**Camera Z-rotation (view azimuth):**
```glsl
vec3 rotateZ(vec3 v, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return vec3(
        v.x * c - v.y * s,
        v.x * s + v.y * c,
        v.z
    );
}
```

**Camera X-rotation (view elevation):**
```glsl
vec3 rotateX(vec3 v, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return vec3(
        v.x,
        v.y * c - v.z * s,
        v.y * s + v.z * c
    );
}
```

### Direction Convention
- **Camera rotation direction:** When `camera.angleZ` increases (rotate right), apply **negative** rotation to planet normals so they appear to rotate left
- **Camera tilt direction:** When `camera.angleX` increases (tilt down/top view), apply **negative** rotation to planet normals

This creates the natural inverse relationship: rotating the camera right makes the planet appear to rotate left (showing the hemisphere that was previously on the right side).

---

## Implementation Plan

### Unit 1: Add Camera Uniforms to Shader
**File:** `src/js/lib/planetTextures.js`

**Changes:**
1. Add new uniform declarations in fragment shader (line ~91):
   ```glsl
   uniform float uCameraAngleZ;  // Camera rotation around Z
   uniform float uCameraAngleX;  // Camera tilt
   ```

2. Get uniform locations during init (line ~221):
   ```javascript
   uniforms = {
       uTexture: gl.getUniformLocation(shaderProgram, 'uTexture'),
       uRotation: gl.getUniformLocation(shaderProgram, 'uRotation'),
       uAxialTilt: gl.getUniformLocation(shaderProgram, 'uAxialTilt'),
       uLightDir: gl.getUniformLocation(shaderProgram, 'uLightDir'),
       uAmbient: gl.getUniformLocation(shaderProgram, 'uAmbient'),
       uCameraAngleZ: gl.getUniformLocation(shaderProgram, 'uCameraAngleZ'),  // NEW
       uCameraAngleX: gl.getUniformLocation(shaderProgram, 'uCameraAngleX'),  // NEW
   };
   ```

**Estimated effort:** 15 minutes  
**Risk:** Low - additive change only

---

### Unit 2: Update Shader Transform Chain
**File:** `src/js/lib/planetTextures.js` (fragment shader)

**Changes:**
Replace lines 119-136 with new transform chain:

```glsl
void main() {
    // ... ray-sphere intersection code (lines 96-118) unchanged ...
    
    vec3 normal = normalize(hitPos);
    
    // NEW TRANSFORM CHAIN:
    // 1. Apply camera rotation (INVERSE of camera.angleZ for "look around" effect)
    float cosZ = cos(-uCameraAngleZ);
    float sinZ = sin(-uCameraAngleZ);
    vec3 cameraRotatedZ = vec3(
        normal.x * cosZ - normal.y * sinZ,
        normal.x * sinZ + normal.y * cosZ,
        normal.z
    );
    
    // 2. Apply camera tilt (INVERSE of camera.angleX)
    float cosX = cos(-uCameraAngleX);
    float sinX = sin(-uCameraAngleX);
    vec3 cameraRotated = vec3(
        cameraRotatedZ.x,
        cameraRotatedZ.y * cosX - cameraRotatedZ.z * sinX,
        cameraRotatedZ.y * sinX + cameraRotatedZ.z * cosX
    );
    
    // 3. Apply axial tilt (unchanged)
    float cosT = cos(uAxialTilt);
    float sinT = sin(uAxialTilt);
    vec3 tiltedNormal = vec3(
        cameraRotated.x,
        cameraRotated.y * cosT - cameraRotated.z * sinT,
        cameraRotated.y * sinT + cameraRotated.z * cosT
    );
    
    // 4. Apply planet rotation (unchanged)
    float cosR = cos(uRotation);
    float sinR = sin(uRotation);
    vec3 rotatedNormal = vec3(
        tiltedNormal.x * cosR + tiltedNormal.z * sinR,
        tiltedNormal.y,
        -tiltedNormal.x * sinR + tiltedNormal.z * cosR
    );
    
    // ... texture sampling code (lines 138-147) unchanged ...
    
    // IMPORTANT: Use ORIGINAL normal for lighting (not camera-rotated)
    // Lighting should respond to real sun direction, not camera view
    float NdotL = dot(normal, uLightDir);
    
    // ... rest of shader (lines 154-166) unchanged ...
}
```

**Key decision:** Lighting uses the **original** `normal`, not the camera-rotated normal. This ensures the day/night terminator stays aligned with the real sun direction in 3D space, even as the texture rotates with camera movement.

**Estimated effort:** 30 minutes  
**Risk:** Medium - core rendering logic, requires careful testing

---

### Unit 3: Pass Camera Angles to Render Function
**File:** `src/js/lib/planetTextures.js`

**Changes:**

1. Update `renderPlanetTexture()` signature (line 367):
   ```javascript
   export function renderPlanetTexture(bodyName, screenRadius, gameDays, sunAngle, cameraAngleZ, cameraAngleX) {
   ```

2. Quantize camera angles for cache stability (line ~392):
   ```javascript
   // Quantize sun angle for cache stability (~1 degree)
   const quantizedSunAngle = Math.round(sunAngle * 57.3) / 57.3;
   
   // NEW: Quantize camera angles for cache stability (~1 degree)
   const quantizedCameraZ = Math.round(cameraAngleZ * 57.3) / 57.3;
   const quantizedCameraX = Math.round(cameraAngleX * 57.3) / 57.3;
   ```

3. Update cache key (line 395):
   ```javascript
   const key = `${bodyName}_${quantizedSize}_${quantizedRotation.toFixed(3)}_${quantizedSunAngle.toFixed(2)}_${quantizedCameraZ.toFixed(2)}_${quantizedCameraX.toFixed(2)}`;
   ```

4. Set uniforms before rendering (line ~417):
   ```javascript
   // Set uniforms
   gl.uniform1f(uniforms.uRotation, quantizedRotation);
   gl.uniform1f(uniforms.uAxialTilt, tilt);
   gl.uniform1f(uniforms.uAmbient, 0.08);
   gl.uniform1f(uniforms.uCameraAngleZ, quantizedCameraZ);  // NEW
   gl.uniform1f(uniforms.uCameraAngleX, quantizedCameraX);  // NEW
   ```

**Estimated effort:** 20 minutes  
**Risk:** Low - straightforward parameter passing

---

### Unit 4: Update Renderer Call Site
**File:** `src/js/ui/renderer.js`

**Changes:**
Update the call to `renderPlanetTexture()` at line 907:

```javascript
// Current (line 907):
const texCanvas = renderPlanetTexture(body.name, screenRadius, gameDays, sunAngle);

// NEW:
const texCanvas = renderPlanetTexture(
    body.name, 
    screenRadius, 
    gameDays, 
    sunAngle,
    camera.angleZ,  // NEW: camera rotation
    camera.angleX   // NEW: camera tilt
);
```

**Estimated effort:** 5 minutes  
**Risk:** Low - single line change with clear semantics

---

### Unit 5: Update Cache Clearing on Camera Change
**File:** `src/js/ui/controls.js`

**Changes:**
Clear planet texture cache when camera rotation changes significantly. Add cache clear calls after camera angle updates:

1. In `handleKeyboardShortcuts()` (lines 766-787):
   ```javascript
   case 'q':
   case 'Q':
       camera.angleZ -= rotationStep;
       if (camera.angleZ < 0) camera.angleZ += 2 * Math.PI;
       clearPlanetTextureCache();  // NEW
       break;
   case 'e':
   case 'E':
       camera.angleZ += rotationStep;
       camera.angleZ = camera.angleZ % (2 * Math.PI);
       clearPlanetTextureCache();  // NEW
       break;
   ```

2. In `handleRotateDrag()` (line ~962):
   ```javascript
   function handleRotateDrag(deltaX, deltaY) {
       const sensitivity = 0.005;
       camera.angleZ += deltaX * sensitivity;
       camera.angleZ = camera.angleZ % (2 * Math.PI);
       if (camera.angleZ < 0) camera.angleZ += 2 * Math.PI;
       camera.angleX -= deltaY * sensitivity;
       camera.angleX = Math.max(minTilt, Math.min(maxTilt, camera.angleX));
       clearPlanetTextureCache();  // NEW
   }
   ```

3. In `handleTouchRotate()` (line ~1027):
   ```javascript
   function handleTouchRotate(deltaX, deltaY) {
       const sensitivity = 0.01;
       camera.angleZ += deltaX * sensitivity;
       camera.angleZ = camera.angleZ % (2 * Math.PI);
       if (camera.angleZ < 0) camera.angleZ += 2 * Math.PI;
       camera.angleX -= deltaY * sensitivity;
       camera.angleX = Math.max(0, Math.min(Math.PI / 2, camera.angleX));
       clearPlanetTextureCache();  // NEW
   }
   ```

4. Add import at top of file:
   ```javascript
   import { clearPlanetTextureCache } from '../lib/planetTextures.js';
   ```

**Alternative approach (more efficient):** Instead of clearing the entire cache, implement cache invalidation based on angle deltas. Only clear if the quantized angle has changed by more than the quantization threshold (~1 degree). This would reduce unnecessary re-renders.

**Estimated effort:** 15 minutes (basic approach), 45 minutes (delta-based approach)  
**Risk:** Low for basic approach, Medium for delta-based (requires testing edge cases)

---

## Performance Considerations

### Cache Hit Rate Impact
**Current cache key:** `${bodyName}_${size}_${rotation}_${sunAngle}`  
**New cache key:** `${bodyName}_${size}_${rotation}_${sunAngle}_${cameraZ}_${cameraX}`

**Analysis:**
- Adding camera angles to the cache key increases the key space significantly
- With 1-degree quantization: 360 possible Z-angles × 90 possible X-angles = 32,400 combinations per planet
- **Expected impact:** Cache hit rate will drop from ~95% to ~60-70% during active camera rotation
- **Mitigation:** The cache automatically evicts old entries (LRU with max 100 entries per body), so memory footprint stays bounded

### Re-render Frequency
- **Current:** Planets re-render when rotation or sun angle changes (typically every few seconds at normal game speeds)
- **New:** Planets re-render when camera rotates (potentially every frame during drag operations)
- **Performance budget:** WebGL render at 512×512 takes ~2-3ms per planet on modern GPUs
- **Max planets on screen:** Typically 3-5 planets visible at system zoom
- **Worst case:** 5 planets × 3ms = 15ms/frame = 67 FPS (acceptable)

### Optimization Strategies
1. **Quantization tuning:** 1-degree steps balance smoothness vs. cache efficiency
2. **Lazy invalidation:** Only clear cache on rotation deltas > quantization threshold
3. **Selective rendering:** Only update planets above minimum screen radius (already implemented)
4. **Crossfade timing:** Keep gradient rendering until texture is cached (already implemented)

**Verdict:** Performance impact is acceptable. No additional optimizations needed for MVP.

---

## Testing Strategy

### Unit Tests
Create new test file: `src/js/lib/planetTextures.test.js`

**Test cases:**
1. **Camera rotation Z-axis:** Verify texture shifts left when camera rotates right
2. **Camera tilt X-axis:** Verify poles become visible when tilting to top-down view
3. **Combined rotations:** Test Z+X rotation combinations
4. **Lighting preservation:** Ensure terminator stays aligned with sun direction
5. **Cache key generation:** Verify quantization and key uniqueness
6. **Uniform passing:** Mock WebGL calls and verify uniform values

### Integration Tests
**Manual browser testing:**

1. **Basic rotation (Z-axis):**
   - Load game at Earth
   - Rotate camera right (E key or right-drag): Earth should rotate left, showing Africa → Americas → Pacific
   - Rotate camera left (Q key): Reverse direction

2. **Tilt rotation (X-axis):**
   - Tilt camera to top-down view (S key): North pole should come into view
   - Tilt back to default (W key): Equator should return to center

3. **Combined rotation:**
   - Rotate and tilt simultaneously: Texture should respond smoothly in both axes
   - No visual artifacts or "jumping"

4. **Multiple planets:**
   - Zoom to system view with multiple planets visible
   - Rotate camera: All planets should rotate in sync
   - Verify no performance degradation (FPS should stay >30)

5. **Cache behavior:**
   - Rotate camera slowly in small increments
   - Open browser console, check cache hit rate with `window.getPlanetTextureStatus()`
   - Expected: Hit rate drops to ~60-70% during active rotation, recovers to ~90% when stationary

6. **Lighting consistency:**
   - Rotate around Earth: Day/night terminator should stay aligned with sun direction (not rotate with camera)
   - Example: If sun is "left" of Earth, the left hemisphere should be lit regardless of camera angle

7. **Edge cases:**
   - Very fast camera rotation: Ensure no visual tearing or "lag" in texture response
   - Zoom changes during rotation: Texture should scale smoothly without artifacts
   - Planet spin over time: Both camera rotation and planet spin should compound correctly

### Regression Tests
Verify existing functionality still works:
1. Planet spin based on game time (fast-forward to see Mars rotate)
2. Gradient rendering fallback (zoom out until texture deactivates)
3. Axial tilts (Uranus should show extreme pole tilt)
4. Ring rendering (Saturn rings should not be affected by camera rotation)

---

## Rollback Plan

If critical issues arise during implementation:

1. **Shader errors:** Revert fragment shader to original (git checkout for lines 119-136 of planetTextures.js)
2. **Performance issues:** Add feature flag to disable camera-responsive rotation
3. **Visual artifacts:** Temporarily disable texture rendering (reduce `minScreenRadius` to infinity in config)

**Safe state:** Original gradient rendering is always available as a fallback. The worst-case scenario is reverting to the current "billboard" behavior.

---

## Future Enhancements

### V2 Features (Out of Scope)
1. **Interpolated cache transitions:** Blend between cached frames for sub-degree smoothness
2. **Adaptive quantization:** Use coarser quantization (5°) when rotating fast, finer (0.5°) when stationary
3. **Predictive caching:** Pre-render adjacent camera angles during idle frames
4. **Compressed cache:** Use ImageBitmap or OffscreenCanvas for lower memory footprint

### Related Features
- **Planet surface features:** Once rotation is implemented, add surface detail maps (city lights, clouds, ice caps)
- **Atmospheric scattering:** Rayleigh scattering shader for Earth/Mars/Venus atmospheres
- **Shadow casting:** Render moons casting shadows on parent planets

---

## Dependencies

### No External Dependencies
All required systems are already in place:
- WebGL2 rendering context (initialized in `initPlanetTextures()`)
- Camera state (tracked in `camera.angleZ` and `camera.angleX`)
- Shader compilation pipeline (working in current system)
- Cache invalidation infrastructure (already used for window resize)

### Coordination Points
**None.** This is a self-contained change within the planet texture rendering system. No coordination with other features or developers needed.

---

## Summary

### Work Breakdown
| Unit | File | Effort | Risk | Dependencies |
|------|------|--------|------|--------------|
| 1 | planetTextures.js | 15 min | Low | None |
| 2 | planetTextures.js (shader) | 30 min | Medium | Unit 1 |
| 3 | planetTextures.js (params) | 20 min | Low | Unit 2 |
| 4 | renderer.js | 5 min | Low | Unit 3 |
| 5 | controls.js | 15 min | Low | Unit 3 |
| **Testing** | Manual + Console | 45 min | N/A | All units |

**Total effort:** ~2.5 hours (including testing)

### Implementation Order
1. Unit 1 → Unit 2 → Unit 3 (complete shader system)
2. Unit 4 (integrate with renderer)
3. Unit 5 (cache optimization)
4. Testing (verify all scenarios)

### Risk Assessment
**Overall risk: LOW**

- Core logic is additive (no removal of existing code)
- Shader changes are isolated to one function
- Fallback to gradient rendering always available
- Performance impact is within acceptable bounds
- Cache system already robust and tested

### Success Criteria
✅ Camera rotation causes planets to show different hemispheres  
✅ Day/night terminator stays aligned with sun direction  
✅ No performance degradation (>30 FPS at system zoom)  
✅ Smooth visual transitions (no "popping" or artifacts)  
✅ Cache hit rate remains >60% during active rotation  

---

## Critical Files for Implementation

The following files are essential for implementing camera-responsive planet rotation:

### 1. `/Users/mattcameron/Projects/sailship/src/js/lib/planetTextures.js`
**Role:** Core rendering logic - shader and cache system  
**Why critical:** Contains all shader code, uniform management, and cache key generation. Units 1, 2, and 3 modify this file extensively.  
**Key sections:**
- Lines 81-168: Fragment shader (transform chain)
- Lines 220-227: Uniform location setup
- Lines 367-451: `renderPlanetTexture()` function (parameters, cache key, uniform setting)

### 2. `/Users/mattcameron/Projects/sailship/src/js/ui/renderer.js`
**Role:** Renderer integration - calls planet texture system  
**Why critical:** Contains the call site for `renderPlanetTexture()`. Unit 4 modifies this file to pass camera angles.  
**Key sections:**
- Lines 898-925: Planet texture rendering in `drawBody()` (line 907 is the call site)
- Line 23: Import statement for `renderPlanetTexture`

### 3. `/Users/mattcameron/Projects/sailship/src/js/ui/controls.js`
**Role:** Camera control handlers  
**Why critical:** Contains all camera rotation event handlers. Unit 5 adds cache invalidation calls here.  
**Key sections:**
- Lines 766-787: Keyboard shortcuts (Q/E/W/S for camera rotation)
- Lines 934-974: `handleRotateDrag()` (right-click drag)
- Lines 1001-1033: `handleTouchRotate()` (touch rotation)
- Line imports: Add `clearPlanetTextureCache` import

### 4. `/Users/mattcameron/Projects/sailship/src/js/core/camera.js`
**Role:** Camera state reference  
**Why critical:** Provides `camera.angleZ` and `camera.angleX` values used as shader inputs. Read-only reference for understanding camera rotation semantics.  
**Key sections:**
- Lines 5-16: `camera` object definition (angleZ, angleX properties)
- Lines 84-108: `project3D()` function (shows how camera rotations are applied to world coordinates)

### 5. `/Users/mattcameron/Projects/sailship/src/js/config.js`
**Role:** Configuration reference - texture and cache settings  
**Why critical:** Documents planet texture configuration (rotation rates, axial tilts, cache parameters). Reference only - no changes needed, but useful for understanding quantization choices and cache sizing.  
**Key sections:**
- Lines 563-627: `PLANET_TEXTURE_CONFIG` (rotation rates, axial tilts, render size)

---

**End of Implementation Plan**
