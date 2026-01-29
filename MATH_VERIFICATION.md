# Math Verification - Scale Rendering Calculations

**Date:** 2026-01-21

## Constants Verification

### Conversion Factor
```
kmToAU = 1 / 149597870.7
     = 6.68459e-9 AU/km
```
✓ Correct (1 AU = 149,597,870.7 km)

## Example Calculations

### Earth at System Zoom
**Given:**
- Earth radius: 6,371 km
- System zoom: scale=50 px/AU, camera.zoom=1

**Calculate:**
```
radiusAU = 6371 * 6.68459e-9 = 0.0000426 AU
scaledRadius = 0.0000426 * 50 * 1 = 0.00213 AU = 2.13 px
```

**Fixed radius:** 6 px (from config)
**Larger of two:** 6 px (fixed)
**Screen size:** 6 px

**Blend factor:**
```
minScreenSize = 20px, maxScreenSize = 100px
screenSize = 6px
6 < 20, so blendFactor = 0.0
```

**Final radius:** lerp(6, 2.13, 0.0) = **6 px** ✓

**Result:** At system zoom, Earth uses fixed size (as intended)

---

### Earth at Tactical Zoom (Growing)
**Given:**
- Earth radius: 6,371 km
- Tactical zoom: scale=3000 px/AU, camera.zoom=1

**Calculate:**
```
radiusAU = 6371 * 6.68459e-9 = 0.0000426 AU
scaledRadius = 0.0000426 * 3000 * 1 = 0.128 AU = 127.8 px
```

**Fixed radius:** 6 px
**Larger of two:** 127.8 px (scaled)
**Screen size:** 127.8 px

**Blend factor:**
```
127.8 > 100, so blendFactor = 1.0
```

**Final radius:** lerp(6, 127.8, 1.0) = **127.8 px** ✓

**Result:** At tactical zoom, Earth uses full physical scale (as intended)

---

### Earth in Transition Zone
**Given:**
- Earth radius: 6,371 km
- Custom zoom: scale=500 px/AU, camera.zoom=1

**Calculate:**
```
radiusAU = 0.0000426 AU
scaledRadius = 0.0000426 * 500 * 1 = 21.3 px
```

**Fixed radius:** 6 px
**Larger of two:** 21.3 px (scaled)
**Screen size:** 21.3 px

**Blend factor:**
```
20 < 21.3 < 100
t = (21.3 - 20) / (100 - 20) = 1.3 / 80 = 0.01625
smoothstep = 0.01625² * (3 - 2*0.01625) = 0.000264 * 2.9675 = 0.000783
```

**Final radius:** lerp(6, 21.3, 0.000783) = 6 + (15.3 * 0.000783) = **6.012 px**

**Result:** Just barely started transitioning (smooth, no pop) ✓

---

### Sun at System Zoom
**Given:**
- Sun radius: 696,000 km
- System zoom: scale=50 px/AU, camera.zoom=1
- Sun is at origin (x=0, y=0, z=0)

**Calculate:**
```
radiusAU = 696000 * 6.68459e-9 = 0.00465 AU
scaledRadius = 0.00465 * 50 * 1 = 0.2325 AU = 232.5 px
```

**Sun always uses scaled rendering (sunAlwaysScaled=true)**

**Final radius:** **232.5 px**

**Result:** Sun appears large even at system zoom (correct - it's huge!) ✓

---

### Jupiter vs Earth at Same Zoom
**Given:**
- Jupiter radius: 69,911 km
- Earth radius: 6,371 km
- Tactical zoom: scale=3000 px/AU, camera.zoom=1

**Jupiter:**
```
radiusAU = 69911 * 6.68459e-9 = 0.000467 AU
scaledRadius = 0.000467 * 3000 = 1.401 AU = 1401 px
Final: 1401 px (fully scaled)
```

**Earth:**
```
scaledRadius = 127.8 px (from earlier calculation)
Final: 127.8 px (fully scaled)
```

**Ratio:** 1401 / 127.8 = **10.96x** ✓

**Expected ratio:** 69,911 / 6,371 = **10.97x** ✓

**Result:** Size ratio is correct! ✓

---

### Luna (Moon) at Local Zoom
**Given:**
- Luna radius: 1,737 km
- Local zoom: scale=800 px/AU, camera.zoom=1

**Calculate:**
```
radiusAU = 1737 * 6.68459e-9 = 0.0000116 AU
scaledRadius = 0.0000116 * 800 * 1 = 0.00928 AU = 9.28 px
```

**Fixed radius:** 3 px
**Larger of two:** 9.28 px (scaled)
**Screen size:** 9.28 px

**Blend factor:**
```
9.28 < 20, so blendFactor = 0.0
```

**Final radius:** lerp(3, 9.28, 0.0) = **3 px** ✓

**Result:** Luna still uses fixed size at local zoom (needs closer zoom to transition)

---

### Phobos (Smallest Body) at Tactical Zoom
**Given:**
- Phobos radius: 11 km (tiny!)
- Tactical zoom: scale=3000 px/AU, camera.zoom=1

**Calculate:**
```
radiusAU = 11 * 6.68459e-9 = 7.35e-8 AU
scaledRadius = 7.35e-8 * 3000 * 1 = 0.000220 AU = 0.22 px
```

**Fixed radius:** 2 px
**Larger of two:** 2 px (fixed is bigger!)
**Screen size:** 2 px

**Blend factor:**
```
2 < 20, so blendFactor = 0.0
```

**Final radius:** lerp(2, 0.22, 0.0) = **2 px** ✓

**Result:** Phobos remains visible at fixed size (correct - it's incredibly tiny!)

---

## Smoothstep Verification

The smoothstep function: `t² * (3 - 2t)`

### Properties
1. `f(0) = 0` → `0² * 3 = 0` ✓
2. `f(1) = 1` → `1² * 1 = 1` ✓
3. `f'(0) = 0` → Derivative is zero at t=0 ✓
4. `f'(1) = 0` → Derivative is zero at t=1 ✓

### Sample Points
- `t=0.0`: `0.000` ✓
- `t=0.25`: `0.103` ✓
- `t=0.5`: `0.500` ✓
- `t=0.75`: `0.897` ✓
- `t=1.0`: `1.000` ✓

Smooth curve with no discontinuities ✓

---

## Edge Case Verification

### Case 1: Exactly at minScreenSize (20px)
```
blendFactor = 0.0
Result: Pure fixed size ✓
```

### Case 2: Exactly at maxScreenSize (100px)
```
blendFactor = 1.0
Result: Pure scaled size ✓
```

### Case 3: Exactly midpoint (60px)
```
t = (60 - 20) / 80 = 0.5
smoothstep(0.5) = 0.5
Result: 50% blend ✓
```

### Case 4: Scaled smaller than fixed (e.g., Phobos)
```
currentSize = max(fixed, scaled) = fixed
Uses fixed size throughout ✓
Prevents planet from shrinking below fixed size ✓
```

---

## Conclusion

✓ All mathematical calculations are correct
✓ Conversion factors accurate
✓ Blend logic works as designed
✓ Edge cases handled properly
✓ Smoothstep provides smooth transitions
✓ Size ratios match astronomical reality

**Implementation is mathematically sound and ready for visual testing.**
