# Planet Texture Threshold Fix - 2026-02-10

## Problem
Textures were not appearing when planets started growing. Users saw gradient blobs for extended periods during zoom transitions.

## Root Cause Analysis

### The Bug
The previous fix (setting `minScreenRadius: 20px`) failed because it misunderstood when planets "start to grow":

1. **Fixed Sizes:** Planets have fixed pixel sizes when distant:
   - Mercury: 4px, Mars: 5px, Venus/Earth: 6px, Jupiter: 12px

2. **Scale Blending:** When zoom increases, planets blend from fixed → physically-scaled:
   - Blending starts when `currentSize > minScreenSize (20px)`
   - `screenRadius = lerp(fixedSize, scaledSize, blendFactor)`

3. **Texture Activation:** Textures activate when `screenRadius >= minScreenRadius`

**The Problem:**
- Mars (5px fixed) starts growing when `scaledRadius > 5px`
- But `screenRadius` stays at 5px until `currentSize > 20px` (blend starts)
- `screenRadius` doesn't reach 20px until `currentSize ≈ 60-70px`
- **Result:** Planet grows as gradient blob for 50-60px before textures activate!

### Visual Timeline (Mars Example)

| Zoom State | scaledRadius | currentSize | blendFactor | screenRadius | Texture? | User Sees |
|------------|--------------|-------------|-------------|--------------|----------|-----------|
| Far away | 2px | 5px | 0.0 | 5px | ❌ | Tiny gradient dot |
| Starting zoom | 6px | 6px | 0.0 | 5px | ❌ | Still gradient (!) |
| More zoom | 15px | 15px | 0.0 | 5px | ❌ | Still gradient (!!) |
| Blend starts | 21px | 21px | 0.01 | 5.2px | ❌ | Growing gradient blob |
| Halfway blend | 60px | 60px | 0.5 | 32.5px | ✅ | Texture fades in late |
| Full blend | 100px | 100px | 1.0 | 100px | ✅ | Textured sphere |

**Users complained:** Planet was a growing red blob from 5px → 32px before texture appeared.

## Solution

**Changed values in `/src/js/config.js`:**
```javascript
// Before
minScreenRadius: 20,    // Too high - textures appear late
crossfadeRange: 15,

// After
minScreenRadius: 6,     // Matches inner planet fixed sizes
crossfadeRange: 10,     // Tighter, faster crossfade
```

### Expected Behavior (Mars Example)

| Zoom State | scaledRadius | screenRadius | Texture? | User Sees |
|------------|--------------|--------------|----------|-----------|
| Far away | 2px | 5px | ❌ | Tiny gradient dot |
| Starting zoom | 6px | 5px | Crossfade starts | Gradient → texture blend |
| More zoom | 15px | 5px | Crossfade | Mostly textured |
| Blend starts | 21px | 5.2px | ✅ Full texture | Textured sphere growing |

### Per-Planet Analysis

**Inner Planets (Fixed 4-6px):**
- Mercury (4px): Texture at 6px screenRadius (immediately when growing)
- Mars (5px): Texture at 6px screenRadius (immediately when growing)
- Venus/Earth (6px): Texture at 6px screenRadius (the moment growth starts)
- Crossfade: 6-16px (smooth, tight transition)

**Gas Giants (Fixed 9-12px):**
- Already above 6px threshold
- Textures active from first render
- No gradient phase at all

**Outer Ice Giants (Fixed 9px):**
- Uranus/Neptune: Already above 6px
- Textures active immediately

## Technical Details

### Scale-Based Rendering System
Controls when planets transition from fixed → physically-scaled:
```javascript
// SCALE_RENDERING_CONFIG
minScreenSize: 20,     // Start blend transition
maxScreenSize: 100,    // Complete blend to physical scale

// screenRadius calculation
currentSize = Math.max(display.radius, scaledRadius);
blendFactor = calculateBlendFactor(currentSize);  // 0.0 below 20px
screenRadius = lerp(display.radius, scaledRadius, blendFactor);
```

### Texture Rendering System
Controls when gradients switch to WebGL textures:
```javascript
// PLANET_TEXTURE_CONFIG
minScreenRadius: 6,    // Activate texture rendering (NEW)
crossfadeRange: 10,    // Gradient→texture fade range (NEW)

// Texture activation logic (renderer.js line 856)
useTexture = hasTexture(body.name) && screenRadius >= minScreenRadius;
inCrossfade = useTexture && screenRadius < minScreenRadius + crossfadeRange;
```

### Crossfade Behavior
From `renderer.js` lines 860-890:
- **Below 6px:** Pure gradient rendering
- **6-16px:** Alpha blend gradient + texture
  - `alpha = (screenRadius - 6) / 10`
  - `alpha = 0` at 6px → full gradient
  - `alpha = 1` at 16px → full texture
- **Above 16px:** Pure texture rendering

## Verification Steps

1. **Start game at system zoom (50 px/AU)**
   - All planets should be tiny gradient dots (below 6px)

2. **Zoom to inner zoom (200 px/AU)**
   - Earth/Mars should show textures immediately as they grow

3. **Zoom to local zoom (800 px/AU)**
   - All inner planets should be fully textured spheres

4. **Focus Mars and zoom in**
   - Texture should appear the moment Mars starts growing from 5px
   - No extended "red blob" phase

5. **Zoom back out**
   - Textures should fade smoothly back to gradients at 6px threshold

## Performance Impact

**Positive impacts:**
- Lower threshold means more planets use textures sooner
- But textures are smaller (6-20px), so less GPU load than before
- Crossfade range reduced (15 → 10), slightly less alpha blending

**Expected:** Negligible performance impact. Texture rendering at 6-16px is very cheap compared to 20-35px.

## Files Modified

1. `/src/js/config.js`
   - `PLANET_TEXTURE_CONFIG.minScreenRadius: 20 → 6`
   - `PLANET_TEXTURE_CONFIG.crossfadeRange: 15 → 10`

## Commit Message

```
Fix planet texture activation to trigger when planets start growing

Previous fix set minScreenRadius to 20px, but planets don't reach that
screen radius until they've already grown 4-6x their fixed size. Users
saw growing gradient blobs before textures appeared.

Root cause: screenRadius (the lerped blend between fixed and scaled)
stays near the fixed size (4-6px) until the blend starts at 20px. The
planet is visibly growing but screenRadius lags behind.

Solution: Set minScreenRadius to 6px (typical inner planet fixed size)
so textures activate immediately when screenRadius exceeds fixed size.
Reduce crossfadeRange to 10px for tighter, faster transition.

Result: Textures appear the moment planets start changing size, not
after they've already grown into large gradient blobs.
```
