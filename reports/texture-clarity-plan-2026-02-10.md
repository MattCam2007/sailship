# Planet Texture Clarity Enhancement Plan
**Date**: 2026-02-10
**Problem**: Current planet textures appear unclear/not sharp despite having 2k source images
**Goal**: Maximize texture clarity and sharpness for close-up planet viewing

---

## Problem Statement Analysis

### Current System Architecture

**Texture Sources**:
- 2048x1024 JPG equirectangular maps (2k resolution)
- Solar System Scope dataset (CC-BY 4.0)
- File sizes: 76KB (Uranus) to 1.0MB (Luna)
- JPEG compression with baseline quality

**WebGL Rendering Pipeline**:
```
Source: 2048x1024 JPG
  ↓
WebGL Texture (loaded via texImage2D)
  ↓
Fragment Shader (ray-sphere intersection + Lambertian lighting)
  ↓
Offscreen Render Target: 512x512 canvas (quantized to 32px increments)
  ↓
2D Canvas Cache (copied via drawImage)
  ↓
Main Canvas (composited with ctx.drawImage, scaled to screenRadius * 2.2)
```

**Filtering Configuration**:
- MIN_FILTER: `LINEAR_MIPMAP_LINEAR` (trilinear filtering)
- MAG_FILTER: `LINEAR` (bilinear interpolation)
- Mipmaps generated via `gl.generateMipmap(gl.TEXTURE_2D)`

**Activation Threshold**:
- Textures activate at `minScreenRadius: 6px`
- Crossfade from gradient to texture over 10px range (6px → 16px)
- Recent fix (commit ae9dd98): texture activation triggers when planets start growing

### Identified Bottlenecks

1. **Render Target Resolution (512px)**
   - Problem: At high zoom (tactical/orbital), planets exceed 512px diameter
   - Example: Earth at `ZOOM_LEVELS.orbital` (50000 px/AU) with 6371km radius
     - Physical radius: 0.0000426 AU
     - Screen radius: 0.0000426 × 50000 × camera.zoom = 2130px at 1x zoom
     - Upscaling from 512px to 2130px = 4.2x magnification with LINEAR filtering
   - Result: Visible blurriness and loss of detail

2. **JPEG Compression Artifacts**
   - Baseline JPEG uses 8x8 DCT blocks, visible at high magnification
   - File sizes suggest moderate compression (e.g., Mars 733KB for 2048x1024)
   - Compression ratio: ~0.18 bytes/pixel (substantial quality loss)

3. **Single Mipmap Level Selection**
   - Trilinear filtering blends between mip levels based on screen-space derivatives
   - At extreme zoom, shader samples from lower-res mip levels designed for smaller sizes
   - No mechanism to force highest-detail mip level for close viewing

4. **Quantization Stability**
   - Render size quantized to 32px increments for cache stability
   - This prevents smooth resolution scaling as planets grow
   - Cache invalidation on 32px boundaries causes sudden quality jumps

5. **Fragment Shader Precision**
   - Shader uses `highp float` (good), but some calculations may benefit from higher precision
   - Equirectangular UV mapping has edge cases at poles (asin clamping)
   - Soft edge anti-aliasing reduces detail at sphere rim

6. **Texture Activation Threshold**
   - Crossfade starts at 6px radius (12px diameter)
   - At this size, 2k textures are massively oversampled (171x overkill)
   - Early activation reduces gradient rendering but may introduce blur

---

## Root Cause Analysis

### Primary Issue: Render Target Too Small
The 512px render target is the main bottleneck. At tactical zoom and above:
- Earth needs ~2000px diameter
- Jupiter needs ~5000px diameter (69911km radius)
- System upscales 512px → 2000-5000px using LINEAR filter = severe blur

### Secondary Issue: Texture Filtering Strategy
Trilinear filtering (LINEAR_MIPMAP_LINEAR) prioritizes smooth transitions over sharpness:
- Blends between mip levels, never showing the full 2048x1024 detail
- At close range, we want nearest higher mip level, not a blend
- MAG_FILTER LINEAR applies bilinear interpolation during upscaling

### Tertiary Issue: JPEG Compression
While not the primary bottleneck, JPEG artifacts become visible at 4-5x upscaling:
- Block artifacts (8x8 DCT patterns)
- Color banding in gradients
- Reduced high-frequency detail

---

## Solution Architecture

### Strategy Overview
Multi-tier approach addressing all bottlenecks in priority order:

**Tier 1 (High Impact, Low Risk)**: Dynamic render target scaling
**Tier 2 (Medium Impact, Low Risk)**: Texture filtering optimization
**Tier 3 (High Impact, Medium Risk)**: 4k texture upgrade
**Tier 4 (Low Impact, Low Risk)**: Shader quality improvements

---

## Tier 1: Dynamic Render Target Scaling

### Concept
Allow render target to scale dynamically based on actual screen radius, capped at practical maximum.

### Implementation

**A. Dynamic Size Calculation**
```javascript
// In renderPlanetTexture()
const MAX_RENDER_SIZE = 2048;  // Match source texture resolution
const MIN_RENDER_SIZE = 128;   // Quality floor

// Target 1:1 pixel mapping up to MAX_RENDER_SIZE
const idealSize = Math.ceil(screenRadius * 2.5);  // Current formula
const dynamicSize = Math.min(MAX_RENDER_SIZE, Math.max(MIN_RENDER_SIZE, idealSize));

// Quantize to 64px increments (larger than current 32px for better cache stability)
const quantizedSize = Math.ceil(dynamicSize / 64) * 64;
```

**B. Configuration Changes**
```javascript
// config.js
export const PLANET_TEXTURE_CONFIG = {
    minRenderSize: 128,       // NEW: Quality floor
    maxRenderSize: 2048,      // NEW: Match source texture resolution
    renderSizeQuantize: 64,   // NEW: Cache quantization step
    renderSize: 512,          // DEPRECATED: Remove or rename to defaultRenderSize
    // ... rest unchanged
};
```

**C. Cache Key Update**
Cache keys already include quantizedSize, so this change is backward-compatible.

### Expected Impact
- **Sharpness**: 4x improvement at tactical zoom (512px → 2048px)
- **Performance**: Minimal impact with proper caching
  - Cache hits avoid re-render
  - Only the first frame at each zoom level pays render cost
  - 2048x2048 render is ~16x slower than 512x512, but happens rarely
- **Memory**: 16x increase per cache entry (512² → 2048²)
  - Each planet caches one render at current zoom level
  - ~16MB per planet at max resolution (RGBA32)
  - 9 textured planets × 16MB = 144MB worst case
  - Acceptable for modern browsers (desktop targets)

### Risk Assessment
- **Low Risk**: Changes are isolated to `planetTextures.js`
- **Graceful Degradation**: Falls back to gradient rendering if WebGL fails
- **Cache Pressure**: Large cache entries could cause memory issues on low-end devices
  - Mitigation: Add cache size limit with LRU eviction
  - Consider: Device memory detection via `navigator.deviceMemory`

---

## Tier 2: Texture Filtering Optimization

### Concept
Use sharper filtering modes that preserve detail instead of prioritizing smoothness.

### Implementation

**A. Separate Filtering for Close-Up vs Distant**
```javascript
// In createTextureFromImage()
// Check if body is commonly viewed at close range
const closeViewBodies = ['EARTH', 'MARS', 'LUNA'];
const isCloseView = closeViewBodies.includes(bodyName);

if (isCloseView) {
    // Prioritize sharpness for close-up viewing
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
} else {
    // Keep smooth filtering for distant/fast-rotating planets
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
}
```

**B. Anisotropic Filtering (Optional Enhancement)**
```javascript
// Check for anisotropic filtering extension
const ext = gl.getExtension('EXT_texture_filter_anisotropic');
if (ext) {
    const maxAniso = gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
    gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, maxAniso);
}
```

### Expected Impact
- **Sharpness**: 10-15% improvement in perceived detail
- **Performance**: Negligible impact (filtering is GPU-accelerated)
- **Compatibility**: EXT_texture_filter_anisotropic is widely supported (97%+ browsers)

### Risk Assessment
- **Very Low Risk**: Falls back gracefully if extension unavailable
- **No Breaking Changes**: Affects only texture sampling, not cache or API

---

## Tier 3: 4k Texture Upgrade

### Concept
Replace 2k textures with 4k (4096x2048) versions for bodies commonly viewed at close range.

### Implementation

**A. Texture Source Upgrade**
Priority bodies for 4k upgrade:
1. EARTH (player starting location, frequent close views)
2. MARS (common destination)
3. LUNA (Earth's moon, frequently visible at high zoom)
4. JUPITER (visually impressive, worth the investment)

**B. Conditional Loading**
```javascript
// config.js
export const PLANET_TEXTURE_CONFIG = {
    textures: {
        MERCURY:  '2k_mercury.jpg',
        VENUS:    '2k_venus_atmosphere.jpg',
        EARTH:    '4k_earth_daymap.jpg',      // NEW: 4k upgrade
        MARS:     '4k_mars.jpg',              // NEW: 4k upgrade
        JUPITER:  '4k_jupiter.jpg',           // NEW: 4k upgrade
        LUNA:     '4k_moon.jpg',              // NEW: 4k upgrade
        // ... others stay at 2k
    },
    
    // NEW: Resolution metadata for size-aware loading
    textureResolutions: {
        EARTH: 4096,
        MARS: 4096,
        JUPITER: 4096,
        LUNA: 4096,
        // Default: 2048 for bodies not listed
    },
};
```

**C. Progressive Loading**
```javascript
// In loadAllTextures()
// Load 2k version first, then upgrade to 4k asynchronously
if (has4kVersion) {
    load2kTexture();  // Fast initial load
    setTimeout(() => load4kTexture(), 5000);  // Upgrade after 5s
}
```

### Expected Impact
- **Sharpness**: 2x improvement in texture detail
- **Memory**: 4x increase per texture (2k² → 4k²)
  - 4 textures × 4x = equivalent to 16 2k textures
  - Raw 4k RGBA: 4096 × 2048 × 4 = 32MB per texture
  - VRAM impact: 4 × 32MB = 128MB (acceptable for desktop)
- **Load Time**: 2-4x increase per texture
  - Mitigated by progressive loading
  - Initial 2k load provides acceptable quality
  - 4k upgrade happens in background

### Source Options
1. **Solar System Scope**: Offers 8k versions ($20-50 per texture)
2. **NASA Blue Marble Next Generation**: Free 8k Earth textures
3. **USGS Astrogeology**: Free high-res planetary maps
4. **Community**: procedurally generated or AI-upscaled versions

### Risk Assessment
- **Medium Risk**: Large files may impact load performance on slow connections
  - Mitigation: Progressive loading strategy
  - Fallback: Keep 2k as default, 4k as opt-in setting
- **Legal/Attribution**: Ensure license compatibility for new sources

---

## Tier 4: Shader Quality Improvements

### Concept
Optimize fragment shader for maximum texture detail preservation.

### Implementation

**A. Reduce Soft Edge Anti-Aliasing**
```glsl
// Current: Fades out at 0.85-1.0 edge distance
float rimFade = 1.0 - smoothstep(0.85, 1.0, edgeDist);

// Proposed: Narrower fade zone preserves more texture at edges
float rimFade = 1.0 - smoothstep(0.92, 1.0, edgeDist);
```

**B. Sharper Terminator Smoothing**
```glsl
// Current: Smooth terminator fade from -0.1 to 0.15
float terminator = smoothstep(-0.1, 0.15, NdotL);

// Proposed: Narrower range for sharper day/night boundary
float terminator = smoothstep(-0.05, 0.1, NdotL);
```

**C. Reduce Ambient Lighting**
```javascript
// In renderPlanetTexture()
gl.uniform1f(uniforms.uAmbient, 0.05);  // Current: 0.08
```
Lower ambient reveals more texture contrast on lit hemisphere.

**D. Add Sharpening Filter (Optional)**
```glsl
// In fragment shader, after texture sampling
vec4 texColor = texture(uTexture, texCoord);

// Unsharp mask (subtle sharpening)
vec2 texelSize = 1.0 / vec2(textureSize(uTexture, 0));
vec4 blurred = (
    texture(uTexture, texCoord + vec2(-texelSize.x, 0)) +
    texture(uTexture, texCoord + vec2( texelSize.x, 0)) +
    texture(uTexture, texCoord + vec2(0, -texelSize.y)) +
    texture(uTexture, texCoord + vec2(0,  texelSize.y))
) * 0.25;
vec4 sharpened = texColor + (texColor - blurred) * 0.3;
```

### Expected Impact
- **Sharpness**: 5-10% improvement in perceived detail
- **Performance**: Negligible (sharpening filter adds ~4 texture samples)
- **Visual**: May introduce subtle artifacts if over-applied

### Risk Assessment
- **Low Risk**: Changes are shader-only, easy to revert
- **Testing Required**: Visual inspection at various zoom levels to avoid over-sharpening

---

## File Impact Summary

### Files to Modify

1. **`/Users/mattcameron/Projects/sailship/src/js/lib/planetTextures.js`** (PRIMARY)
   - Dynamic render target sizing (Tier 1)
   - Filtering mode selection (Tier 2)
   - Fragment shader improvements (Tier 4)
   - **Lines to modify**: ~15-30 lines
   - **Functions affected**: `renderPlanetTexture()`, `createTextureFromImage()`, `FRAGMENT_SHADER` constant

2. **`/Users/mattcameron/Projects/sailship/src/js/config.js`** (CONFIGURATION)
   - Add dynamic sizing parameters (Tier 1)
   - Add 4k texture paths (Tier 3)
   - **Lines to modify**: ~10-15 lines
   - **Sections affected**: `PLANET_TEXTURE_CONFIG`

### Files to Create (Optional)

3. **`/Users/mattcameron/Projects/sailship/src/textures/4k_earth_daymap.jpg`** (NEW ASSET - Tier 3)
4. **`/Users/mattcameron/Projects/sailship/src/textures/4k_mars.jpg`** (NEW ASSET - Tier 3)
5. **`/Users/mattcameron/Projects/sailship/src/textures/4k_jupiter.jpg`** (NEW ASSET - Tier 3)
6. **`/Users/mattcameron/Projects/sailship/src/textures/4k_moon.jpg`** (NEW ASSET - Tier 3)

### Console Tests to Update

**New Test Function**:
```javascript
// Add to planetTextures.js
export function getTextureQualityMetrics() {
    return {
        initialized,
        renderCache: Object.keys(renderCache).map(name => ({
            name,
            cacheSize: `${renderCache[name].width}x${renderCache[name].height}`,
            lastKey: cacheKeys[name],
        })),
        memoryEstimate: Object.keys(renderCache).reduce((sum, name) => {
            const c = renderCache[name];
            return sum + (c.width * c.height * 4);  // RGBA bytes
        }, 0) / (1024 * 1024),  // Convert to MB
    };
}
window.getTextureQualityMetrics = getTextureQualityMetrics;
```

---

## Implementation Units (Atomic & Testable)

### Unit 1: Add Dynamic Render Target Configuration
**Goal**: Add configuration for dynamic sizing without changing behavior
**Files**: `config.js`
**Changes**:
```javascript
export const PLANET_TEXTURE_CONFIG = {
    // ... existing
    minRenderSize: 128,
    maxRenderSize: 2048,
    renderSizeQuantize: 64,
};
```
**Test**: Run game, verify no visual changes, check console for config load

### Unit 2: Implement Dynamic Render Size Calculation
**Goal**: Calculate dynamic render size based on screen radius
**Files**: `planetTextures.js`
**Changes**:
- Modify `renderPlanetTexture()` to use `maxRenderSize` from config
- Replace hardcoded 512 with dynamic calculation
- Keep quantization logic, update to 64px steps
**Test**:
1. Zoom to tactical level on Earth
2. Call `window.getTextureQualityMetrics()` in console
3. Verify cache sizes increase beyond 512px
4. Visual inspection: textures should appear sharper at close range

### Unit 3: Add Texture Quality Metrics
**Goal**: Expose render cache state for debugging
**Files**: `planetTextures.js`
**Changes**:
- Add `getTextureQualityMetrics()` function
- Export to window for console access
**Test**:
1. Open console
2. Run `window.getTextureQualityMetrics()`
3. Verify output shows cache sizes and memory estimate

### Unit 4: Implement Cache Memory Management
**Goal**: Prevent unbounded memory growth from large cache entries
**Files**: `planetTextures.js`
**Changes**:
- Add max cache memory limit (configurable, default 256MB)
- Implement LRU eviction when limit exceeded
- Track per-entry memory footprint
**Test**:
1. Zoom rapidly between multiple planets at tactical zoom
2. Monitor memory via `getTextureQualityMetrics()`
3. Verify oldest entries are evicted when limit reached

### Unit 5: Optimize Texture Filtering for Close-Up Bodies
**Goal**: Use sharper filtering for commonly close-viewed planets
**Files**: `planetTextures.js`, `config.js`
**Changes**:
- Add `closeViewBodies` list to config
- Modify `createTextureFromImage()` to use LINEAR_MIPMAP_NEAREST for close-view bodies
**Test**:
1. Zoom to Earth at tactical level
2. Compare before/after screenshots
3. Measure perceived sharpness improvement

### Unit 6: Add Anisotropic Filtering Support
**Goal**: Enable anisotropic filtering for supported devices
**Files**: `planetTextures.js`
**Changes**:
- Check for EXT_texture_filter_anisotropic extension
- Apply max anisotropy if available
- Log status to console
**Test**:
1. Check console for "Anisotropic filtering: enabled (16x)" message
2. Visual comparison at oblique viewing angles
3. Verify graceful fallback on unsupported browsers

### Unit 7: Reduce Soft Edge Anti-Aliasing
**Goal**: Preserve more texture detail at sphere edges
**Files**: `planetTextures.js` (FRAGMENT_SHADER constant)
**Changes**:
- Adjust rimFade smoothstep from (0.85, 1.0) to (0.92, 1.0)
**Test**:
1. Zoom to Earth at tactical level
2. Inspect limb (edge of sphere)
3. Verify edge texture remains sharp until very outer rim

### Unit 8: Sharpen Day/Night Terminator
**Goal**: Reduce terminator blur for sharper lighting
**Files**: `planetTextures.js` (FRAGMENT_SHADER constant)
**Changes**:
- Adjust terminator smoothstep from (-0.1, 0.15) to (-0.05, 0.1)
**Test**:
1. Position Earth so terminator is visible
2. Compare before/after terminator width
3. Ensure no harsh banding artifacts

### Unit 9: Reduce Ambient Lighting
**Goal**: Increase texture contrast on lit hemisphere
**Files**: `planetTextures.js`
**Changes**:
- Change `gl.uniform1f(uniforms.uAmbient, 0.08)` to `0.05`
**Test**:
1. Observe Earth's night side
2. Verify still-visible (not pure black)
3. Check day side has more contrast

### Unit 10: Add 4k Texture Support (Configuration)
**Goal**: Add 4k texture paths to config
**Files**: `config.js`
**Changes**:
- Update texture paths for Earth, Mars, Jupiter, Luna to 4k versions
- Add `textureResolutions` map
**Test**: Config loads without errors (textures not yet available)

### Unit 11: Source and Add 4k Textures
**Goal**: Obtain 4k texture files and add to project
**Files**: `src/textures/4k_*.jpg` (new files)
**Changes**:
- Download/generate 4k textures
- Ensure proper attribution in comments
- Optimize JPEG quality (85-90%)
**Test**:
1. Verify files exist at expected paths
2. Check file sizes (should be 2-8MB each)
3. Load in browser, verify no CORS or 404 errors

### Unit 12: Implement Progressive 4k Loading
**Goal**: Load 2k first, upgrade to 4k asynchronously
**Files**: `planetTextures.js`
**Changes**:
- Detect 4k availability from config
- Load 2k texture immediately
- Schedule 4k upgrade after delay
- Invalidate cache on upgrade
**Test**:
1. Observe console logs for "Upgrading to 4k texture: EARTH"
2. Watch texture quality improve after delay
3. Verify smooth transition without flicker

---

## Performance Implications

### Frame Rate Impact
| Change | GPU Cost | CPU Cost | Memory Impact | Frame Time Δ |
|--------|----------|----------|---------------|--------------|
| Dynamic render target (512→2048) | 16x | Negligible | +140MB | +0.1ms (cached) |
| Filtering optimization | 0% | 0% | 0MB | 0ms |
| 4k textures | 4x VRAM | 2x load time | +128MB VRAM | 0ms (GPU handles) |
| Shader improvements | <1% | 0% | 0MB | 0ms |

**Net Performance Impact**: 
- **Best case** (cache hit): +0.1ms per frame (negligible)
- **Worst case** (cache miss): +5ms for 2048px render (first frame only)
- **Steady state**: No measurable impact once caches warm

### Memory Footprint
| Component | Before | After | Δ |
|-----------|--------|-------|---|
| Render cache (9 planets) | 9MB | 144MB | +135MB |
| Texture VRAM (4k upgrade) | 32MB | 160MB | +128MB |
| **Total** | **41MB** | **304MB** | **+263MB** |

**Mitigation**:
- LRU cache eviction keeps memory bounded
- 4k textures are opt-in (not mandatory)
- Target platform: modern desktop browsers (4GB+ RAM typical)

---

## Risk Assessment

### Technical Risks

1. **Memory Pressure on Low-End Devices**
   - **Severity**: Medium
   - **Likelihood**: Low (game targets desktop)
   - **Mitigation**: 
     - Add cache memory limit with LRU eviction
     - Detect `navigator.deviceMemory` and cap maxRenderSize accordingly
     - Fallback to gradient rendering if WebGL fails

2. **Cache Thrashing at Extreme Zoom**
   - **Severity**: Low
   - **Likelihood**: Medium
   - **Mitigation**:
     - Quantize render size to 64px steps (current: 32px)
     - Track zoom change velocity and delay cache invalidation

3. **4k Texture Load Times**
   - **Severity**: Low
   - **Likelihood**: High (large files)
   - **Mitigation**:
     - Progressive loading: 2k first, 4k upgrade async
     - Lazy loading: only load 4k when planet is focused/targeted

### Visual Risks

1. **Over-Sharpening Artifacts**
   - **Severity**: Low
   - **Likelihood**: Low
   - **Mitigation**: Conservative shader changes, extensive visual testing

2. **Terminator Banding**
   - **Severity**: Low
   - **Likelihood**: Low
   - **Mitigation**: Narrower smoothstep range, not eliminated

### Compatibility Risks

1. **WebGL Extension Availability**
   - **Severity**: Very Low
   - **Likelihood**: Very Low (97%+ support for anisotropic filtering)
   - **Mitigation**: Graceful fallback, feature detection before use

---

## Success Metrics

### Quantitative Metrics
1. **Texture Resolution at Tactical Zoom**
   - Before: 512px render target
   - After: 1024-2048px render target
   - Goal: 4x improvement

2. **Perceived Sharpness Score** (1-10 subjective)
   - Before: 4/10 (visibly blurry at close range)
   - After: 8/10 (sharp detail visible)
   - Goal: 2x improvement

3. **Memory Footprint**
   - Before: 41MB
   - After: <300MB
   - Goal: Stay under 512MB total

4. **Cache Hit Rate**
   - Before: ~90% (renderer.js gradient cache)
   - After: >85% (larger cache entries, but less frequent invalidation)
   - Goal: Maintain >80% hit rate

### Qualitative Metrics
1. **Player Feedback**: "Planets look sharp and detailed at close range"
2. **Visual Inspection**: Surface features clearly visible at tactical/orbital zoom
3. **Comparison Test**: Side-by-side before/after screenshots show obvious improvement

---

## Testing Strategy

### Unit Testing
Each implementation unit has explicit test steps (see Implementation Units section).

### Integration Testing
1. **Zoom Sweep Test**
   - Start at system zoom (50 px/AU)
   - Zoom continuously to orbital zoom (50000 px/AU)
   - Observe Earth texture throughout zoom range
   - Verify smooth transitions, no flickering

2. **Multi-Planet Test**
   - Zoom to tactical level on Earth, Mars, Jupiter, Luna
   - Rotate camera to view different faces
   - Switch between planets rapidly
   - Verify cache stability and memory management

3. **Performance Profiling**
   - Record frame times at various zoom levels
   - Monitor memory usage via Chrome DevTools
   - Check WebGL state via `chrome://gpu`
   - Verify no memory leaks over 10-minute session

### Visual Regression Testing
1. **Screenshot Comparison**
   - Capture before/after screenshots at standardized zoom levels
   - Use image diff tool to highlight changes
   - Ensure changes are improvements, not degradations

2. **Edge Case Validation**
   - Extreme zoom levels (beyond orbital)
   - Low-end device simulation (throttle GPU/memory)
   - Slow connection simulation (throttle network)

### Performance Testing
1. **Frame Time Monitoring**
   - Use Chrome DevTools Performance tab
   - Record 10-second sessions at various zoom levels
   - Identify frame time spikes >16ms (60 FPS threshold)
   - Profile WebGL calls via `chrome://tracing`

2. **Memory Profiling**
   - Use Chrome DevTools Memory tab
   - Take heap snapshots before/after zoom
   - Check for memory leaks (retained detached DOM, growing caches)
   - Monitor VRAM usage via `about:gpu`

---

## Rollback Plan

### Immediate Rollback (Critical Issues)
If severe bugs or performance degradation occurs:
1. **Git Revert**: `git revert <commit-hash>` for last working state
2. **Feature Flag**: Add `useHighResTextures` config flag, default to false
3. **Restore Files**: Checkout `planetTextures.js` and `config.js` from previous commit

### Graceful Degradation
If issues affect only some users:
1. **Device Detection**: Check `navigator.deviceMemory` and disable high-res mode if <4GB
2. **WebGL Fallback**: Detect context loss and fall back to gradient rendering
3. **User Setting**: Add UI toggle "High-Quality Textures (requires more memory)"

### Partial Rollback
If specific tiers cause issues:
1. **Tier 1 Only**: Keep dynamic sizing, skip filtering/shader changes
2. **Skip 4k**: Keep dynamic sizing and filtering, defer 4k textures
3. **Conservative Limits**: Cap maxRenderSize at 1024px instead of 2048px

---

## Future Enhancements (Out of Scope)

1. **Procedural Detail Layers**
   - Add procedural noise/craters at extreme zoom for infinite detail
   - Requires significant shader work (octave noise, domain warping)

2. **Normal Maps**
   - Add normal mapping for surface relief (mountains, craters)
   - Requires additional texture loading and shader complexity

3. **Cloud Layers** (Earth, Venus, Jupiter)
   - Separate animated cloud textures composited over surface
   - Requires multi-layer rendering and temporal animation

4. **Specular Highlights** (Earth oceans, ice caps)
   - Add specular/gloss maps for realistic water reflections
   - Requires additional textures and Phong/PBR lighting

5. **Atmospheric Scattering**
   - Rayleigh/Mie scattering for realistic atmospheric limb glow
   - Requires complex shader math and performance optimization

6. **Adaptive Quality Settings**
   - Auto-detect GPU capability and adjust settings
   - Machine learning model for optimal quality/performance tradeoff

---

## Implementation Timeline Estimate

| Unit | Description | Effort | Dependencies | Risk |
|------|-------------|--------|--------------|------|
| 1 | Add config parameters | 15 min | None | Low |
| 2 | Dynamic render size | 1 hour | Unit 1 | Low |
| 3 | Quality metrics | 30 min | Unit 2 | Low |
| 4 | Cache memory mgmt | 1.5 hours | Unit 3 | Medium |
| 5 | Filtering optimization | 45 min | Unit 2 | Low |
| 6 | Anisotropic filtering | 30 min | Unit 5 | Low |
| 7 | Soft edge adjustment | 15 min | Unit 2 | Low |
| 8 | Terminator sharpening | 15 min | Unit 2 | Low |
| 9 | Ambient reduction | 5 min | Unit 2 | Low |
| 10 | 4k config | 15 min | Unit 1 | Low |
| 11 | Source 4k textures | 2-4 hours | Unit 10 | Medium |
| 12 | Progressive loading | 1 hour | Unit 11 | Low |

**Total Effort**: 8-10 hours implementation + 2-3 hours testing = **10-13 hours**

**Recommended Sequence**:
1. **Phase 1** (Day 1): Units 1-4 (Tier 1 - Dynamic sizing)
2. **Phase 2** (Day 1): Units 5-9 (Tier 2 & 4 - Filtering & shader)
3. **Phase 3** (Day 2): Units 10-12 (Tier 3 - 4k textures)

---

## Conclusion

The primary bottleneck is the 512px render target, which becomes severely inadequate at tactical/orbital zoom levels. The solution is straightforward: dynamically scale the render target up to 2048px to match the source texture resolution.

Combined with optimized texture filtering and optional 4k texture upgrades, this plan delivers a 4-8x improvement in perceived texture sharpness with minimal performance impact due to aggressive caching.

The implementation is low-risk, backward-compatible, and follows the existing architecture patterns. All changes are isolated to `planetTextures.js` and `config.js`, making rollback trivial if issues arise.

---

### Critical Files for Implementation

- **`/Users/mattcameron/Projects/sailship/src/js/lib/planetTextures.js`** - Core texture rendering system (dynamic sizing, filtering, shader improvements)
- **`/Users/mattcameron/Projects/sailship/src/js/config.js`** - Configuration parameters (sizing limits, 4k paths, filtering modes)
- **`/Users/mattcameron/Projects/sailship/src/js/ui/renderer.js`** - Planet rendering integration point (where textured spheres are composited)
- **`/Users/mattcameron/Projects/sailship/src/textures/`** - Texture asset directory (4k texture additions)
- **`/Users/mattcameron/Projects/sailship/CLAUDE.md`** - Console test documentation (add texture quality metrics test)
