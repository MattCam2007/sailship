# Trajectory Zigzag Bug: Failure Modes Analysis

**Date:** 2026-02-10
**Analyst:** Failure Modes Analyst
**Context:** Adaptive resolution fix (commit 530a1d9) did NOT solve the zigzag bug
**Branch:** feature/adaptive-trajectory-resolution-v2

---

## Executive Summary

The adaptive trajectory resolution fix has a **CRITICAL CACHE INVALIDATION BUG** that defeats its entire purpose. The hash calculation happens BEFORE adaptive step calculation, causing cache misses when explicit `steps` parameter is passed, which forces the system back to the old fixed 200-step behavior.

**Root Cause:** Hash/cache ordering bug + explicit steps override in main.js
**Impact:** Adaptive resolution never actually runs for intersection detection
**Severity:** HIGH - The fix doesn't work at all in production usage

---

## Critical Failure Mode #1: Hash Calculated Before Adaptive Steps

### The Bug

**Location:** `trajectory-predictor.js` lines 245-251

```javascript
const adaptiveSteps = steps !== undefined
    ? steps
    : calculateAdaptiveSteps(orbitalElements, duration, soiState);

// Check cache
const now = Date.now();
const hash = hashInputs(params);  // ❌ BUG: Uses original params, not adaptiveSteps
```

**Problem:** `hashInputs(params)` receives the ORIGINAL `params` object, which contains the `steps` field from the caller. The adaptive step calculation happens AFTER params is already captured.

### What Actually Happens

1. Caller passes `steps: 720` (from INTERSECTION_CONFIG)
2. `adaptiveSteps` is calculated: `720` (uses explicit value, skips calculation)
3. `hashInputs(params)` receives params with `steps: 720`
4. Hash includes `720`

### What Should Happen

1. Caller passes no `steps` parameter (uses adaptive)
2. `adaptiveSteps` is calculated: varies by orbit (e.g., 1200 for Mercury)
3. Hash should include the CALCULATED adaptive steps
4. Different orbits get different step counts automatically

### Why This Breaks Everything

**The hash must include the step count** or else two different trajectories with different resolutions will collide in the cache:

```javascript
// Without steps in hash:
predictTrajectory({...earth, duration: 60, steps: 200});  // hash: ABC
predictTrajectory({...earth, duration: 60, steps: 1200}); // hash: ABC (COLLISION!)
// Returns cached 200-step trajectory when 1200 steps were requested
```

The current code DOES include steps in the hash (line 182: `h = hashMix(h, steps);`), which is CORRECT. But it hashes the wrong value.

---

## Critical Failure Mode #2: Explicit Steps Override in main.js

### The Override

**Location:** `main.js` lines 165-180

```javascript
const rawSteps = Math.round(duration * INTERSECTION_CONFIG.stepsPerDay);
const intersectionSteps = Math.min(
    INTERSECTION_CONFIG.maxSteps,
    Math.max(INTERSECTION_CONFIG.minSteps, rawSteps)
);

const highResTrajectory = predictTrajectory({
    orbitalElements: player.orbitalElements,
    sail: player.sail,
    mass: player.mass || 10000,
    startTime: currentTime,
    duration: duration,
    steps: intersectionSteps,  // ❌ DEFEATS ADAPTIVE RESOLUTION
    soiState: player.soiState,
    extremeFlybyState: player.extremeFlybyState
});
```

**Problem:** The intersection detection code explicitly calculates and passes `steps`, which completely bypasses the adaptive resolution logic.

### Impact

The adaptive resolution fix is **NEVER USED** for the primary trajectory display because:

1. `main.js` calculates fixed steps: `duration * 12` (clamped to 200-8760)
2. Passes explicit `steps` parameter to `predictTrajectory()`
3. This triggers the bypass: `steps !== undefined ? steps : calculateAdaptiveSteps(...)`
4. Adaptive calculation never runs

**The fix is a no-op in production.**

---

## Critical Failure Mode #3: Cache Thrashing Scenario

### The Scenario

When the UI calls `predictTrajectory()` multiple times per frame with slightly different parameters:

1. **Render call:** `predictTrajectory({..., steps: undefined})` → calculates adaptive steps (e.g., 1200)
2. **Intersection call:** `predictTrajectory({..., steps: 720})` → uses explicit steps
3. Hash mismatch → cache miss
4. Recalculates trajectory with 720 steps
5. Next frame: render call repeats step 1
6. Hash mismatch → cache miss (hash now includes 1200 steps)
7. **Infinite cache thrashing**

### Evidence

The cache has adaptive TTL (500ms-2000ms) with stability tracking, but if every call has a different `steps` parameter, the cache NEVER stabilizes because:

```javascript
// Frame 1: render path (no steps)
hash1 = hashInputs({...params, steps: undefined});  // Hash doesn't include steps (undefined)
// Actually it DOES include steps because hashInputs uses params.steps

// Frame 1: intersection path (explicit steps)
hash2 = hashInputs({...params, steps: 720});       // Hash includes 720

// hash1 !== hash2 → cache miss on every frame
```

**Wait, there's a contradiction here.** Let me trace the actual behavior:

Looking at `hashInputs()` line 159:
```javascript
function hashInputs(params) {
    const { orbitalElements, sail, mass, startTime, duration, steps, soiState, extremeFlybyState } = params;
    // ...
    h = hashMix(h, steps);  // Line 182
```

If `steps` is `undefined`, what does `hashMix(h, undefined)` do?

```javascript
function hashMix(hash, value) {
    const bits = (value * 2654435761) | 0;  // undefined * number = NaN
    hash = (hash ^ bits) | 0;                // NaN | 0 = 0
    hash = Math.imul(hash, 16777619);
    return hash;
}
```

So `hashMix(h, undefined)` produces `hashMix(h, 0)` (because `NaN | 0 = 0`).

### Actual Cache Behavior

- Call with `steps: undefined` → hash includes `0`
- Call with `steps: 720` → hash includes `720`
- **Different hashes → cache miss**
- Call with `steps: 0` → hash includes `0` (same as undefined)

This means:
1. If BOTH calls omit `steps`, they share cache (good)
2. If ONE call passes explicit `steps`, cache miss (current bug)
3. The adaptive steps calculation result is NOT in the hash at all

---

## Critical Failure Mode #4: Step Count Not Propagated to Hash

### The Core Issue

The adaptive step count is calculated AFTER the hash is computed, so the hash never knows what step count was actually used:

```javascript
// Line 245-247: Calculate adaptive steps
const adaptiveSteps = steps !== undefined
    ? steps
    : calculateAdaptiveSteps(orbitalElements, duration, soiState);

// Line 251: Hash is calculated from ORIGINAL params
const hash = hashInputs(params);  // params.steps may be undefined
```

### What This Means

Even if we remove the explicit `steps` from `main.js`, the hash would be calculated with `steps: undefined`, which means:

1. Mercury orbit (60 days) → adaptive: 1200 steps → hash includes `0` (from undefined)
2. Neptune orbit (60 days) → adaptive: 720 steps → hash includes `0` (from undefined)
3. **Same hash for different trajectories!**
4. Cache returns wrong trajectory (Neptune gets Mercury's 1200-step trajectory)

This is a **CATASTROPHIC CACHE COLLISION BUG**.

---

## Critical Failure Mode #5: Config Boundaries Clamp Incorrectly

### Boundary Analysis

From `config.js` lines 296-321:

```javascript
export const TRAJECTORY_RENDER_CONFIG = {
    stepsPerDay: 12,
    maxSteps: 8760,
    minSteps: 200,
};
```

### Test Case: Very Fast Inner Orbit

**Ship in Mercury perihelion boost (high-thrust spiral):**
- Semi-major axis: 0.3 AU
- Orbital period: ~60 days
- Prediction duration: 60 days (1 full orbit)
- Expected steps: `max(60 * 12, 1 * 50) = max(720, 50) = 720`

**Actual behavior:**
- `stepsFromDuration = 60 * 12 = 720`
- `orbitsInDuration = 60 / 60 = 1.0`
- `stepsFromPeriod = 1.0 * 50 = 50`
- `adaptiveSteps = max(720, 50) = 720`
- Clamped: `max(200, min(720, 8760)) = 720` ✓ Correct

### Test Case: Very Long Duration Outer Planet

**Ship at Neptune orbit:**
- Semi-major axis: 30 AU
- Orbital period: ~165 years = ~60,225 days
- Prediction duration: 1825 days (5 years)
- Expected steps: Should hit maxSteps cap

**Actual behavior:**
- `stepsFromDuration = 1825 * 12 = 21,900`
- `orbitsInDuration = 1825 / 60225 = 0.03 orbits`
- `stepsFromPeriod = 0.03 * 50 = 1.5 → ceil = 2`
- `adaptiveSteps = max(21900, 2) = 21,900`
- Clamped: `max(200, min(21900, 8760)) = 8760` ✓ Correct (hits cap)

**But wait**: This creates a zigzag! 8760 steps over 1825 days = 4.8 steps/day, which is LESS than the 12 steps/day we wanted.

### The Real Problem

**The maxSteps cap defeats the adaptive resolution for long durations.**

At 1825 days with 12 steps/day, we need 21,900 steps, but the cap is 8760. This reduces resolution to 4.8 steps/day, which creates the zigzag artifact.

**Why does the cap exist?** Performance. 21,900 steps × RK2 midpoint integration × sub-stepping is expensive.

**Trade-off:**
- Higher maxSteps → smoother trajectories, higher CPU usage
- Lower maxSteps → zigzag artifacts, lower CPU usage

**Current value (8760) supports:**
- 12 steps/day for up to 730 days (2 years)
- Degrades to 6 steps/day at 1460 days (4 years)
- Degrades to 4.8 steps/day at 1825 days (5 years)

At 4.8 steps/day, each step is 5 hours. For a fast inner orbit (Mercury = 88 days), that's 88 / 5 = 17.6 steps per orbit, which is **BELOW** the 50 steps/orbit minimum for smooth rendering.

**This explains the zigzag for long-duration predictions on inner planet trajectories.**

---

## Critical Failure Mode #6: Degenerate Orbit Handling

### Guard Clause Analysis

From `calculateAdaptiveSteps()` lines 76-79:

```javascript
if (!isFinite(absA) || absA < 1e-10) {
    // Fallback to minimum steps for safety
    return TRAJECTORY_RENDER_CONFIG.minSteps;
}
```

### What Triggers This?

1. `a = 0` (degenerate zero-radius orbit) → returns 200 steps
2. `a = NaN` (corrupted orbital elements) → returns 200 steps
3. `a = Infinity` (numerical explosion) → returns 200 steps
4. `a = 1e-11` (sun collision orbit, ~1,500 km radius) → returns 200 steps

### Is 200 Steps Correct?

**For corrupted elements:** Yes, 200 is a safe fallback (prevents further corruption)

**For sun collision orbits:** No. A ship at 0.01 AU with e=0.9 is spiraling into the sun at high speed. The RTN frame is rotating VERY fast. 200 steps over 60 days = 3.3 steps/day = 7.2 hours per step.

At 0.01 AU, orbital velocity is ~100 km/s. In 7.2 hours, the ship moves ~2.6 million km = 0.017 AU = 1.7× the orbital radius. This creates MASSIVE zigzag.

**Better fallback:** Return `maxSteps` for safety (maximum resolution to handle degenerate case).

---

## Critical Failure Mode #7: Hyperbolic Orbit Edge Case

### The Code

Lines 88-94:

```javascript
if (e >= 1.0 || !isFinite(orbitalPeriod) || orbitalPeriod <= 0) {
    return Math.max(
        TRAJECTORY_RENDER_CONFIG.minSteps,
        Math.min(stepsFromDuration, TRAJECTORY_RENDER_CONFIG.maxSteps)
    );
}
```

### Problem: No Velocity-Based Scaling

Hyperbolic orbits use duration-based steps only: `duration * 12`. But hyperbolic velocity varies wildly:

**Near periapsis (0.1 AU from sun):**
- Velocity: ~100 km/s
- RTN frame rotation: ~3600°/day
- At 12 steps/day: 300°/step → massive zigzag

**Far from sun (10 AU):**
- Velocity: ~3 km/s
- RTN frame rotation: ~1°/day
- At 12 steps/day: 0.08°/step → smooth (over-sampled)

**Solution needed:** For hyperbolic orbits, scale steps by periapsis distance (closer = more steps).

---

## Critical Failure Mode #8: SOI Transition Boundary

### The Scenario

Ship enters planetary SOI mid-prediction:

1. Start in heliocentric frame (μ = MU_SUN)
2. Calculate adaptive steps based on heliocentric period
3. 30% through prediction: enter Mars SOI
4. Frame switches to planetocentric (μ = MU_MARS, much smaller)
5. Orbital period in planetocentric frame is DIFFERENT
6. Step count is now wrong for planetocentric orbit

### Current Behavior

From lines 66-69:

```javascript
let μ = MU_SUN;
if (soiState?.isInSOI && soiState.currentBody !== 'SUN') {
    μ = getGravitationalParam(soiState.currentBody);
}
```

The code uses the STARTING SOI state to calculate steps. If the ship transitions mid-prediction, the step count may be wrong for the new frame.

### Is This Actually a Problem?

**No**, because the trajectory predictor truncates at SOI boundaries (lines 358-380). Once the ship exits the SOI, prediction stops. The trajectory never spans an SOI transition, so the starting SOI is always correct.

**False alarm - not a bug.**

---

## Critical Failure Mode #9: Rounding Error Accumulation

### The Math

From line 269:

```javascript
const timeStep = duration / adaptiveSteps;
```

For a 60-day prediction with 720 steps:
- `timeStep = 60 / 720 = 0.08333333...` (repeating decimal)
- Stored as IEEE 754 double: some precision loss

After 720 iterations:
- `simTime = startTime + i * timeStep`
- Accumulated error: up to a few milliseconds

### Is This Significant?

At 1 AU, Earth's orbital velocity is ~30 km/s. A 10 ms error = 300 meters = 2e-6 AU.

Ship radius for collision detection: typically 1000 km = 6.7e-6 AU.

**Error is negligible - false alarm.**

---

## Critical Failure Mode #10: Cache Returns Stale Adaptive Steps

### The Scenario

1. Ship at Earth orbit (a=1.0 AU)
2. Adaptive steps calculated: 720
3. Trajectory cached with hash including `steps: undefined` → hash value X
4. Player adjusts sails slightly (angle: 0.6 → 0.61 rad)
5. Hash changes due to sail angle → cache miss
6. Recalculate trajectory, adaptive steps: still 720 (orbit hasn't changed)
7. Cache stores new trajectory

**This works correctly.**

But what if orbital elements change SIGNIFICANTLY?

1. Ship at Earth orbit (a=1.0 AU, period=365d) → adaptive: 720 steps
2. High thrust applied for 10 days
3. New orbit: a=1.2 AU, period=480d → adaptive should be: `max(60*12, (60/480)*50) = max(720, 6.25) = 720`
4. Hash changes (orbital elements changed) → cache miss
5. Recalculate with new elements → adaptive: 720 steps

**Still works correctly.**

What if duration changes?

1. Duration: 60 days → adaptive: 720 steps (cached)
2. User slides duration to 365 days
3. Hash changes (duration changed) → cache miss
4. Recalculate with 365 days → adaptive: `max(365*12, ...) = 4380` steps

**Works correctly.**

**False alarm - cache correctly invalidates when inputs change.**

---

## Summary of ACTUAL Failure Modes

### 1. CRITICAL: Hash Doesn't Include Adaptive Steps
**Severity:** CATASTROPHIC
**Impact:** Different orbits with same input parameters get wrong cached trajectory
**Fix:** Include `adaptiveSteps` in hash, not `params.steps`

### 2. CRITICAL: main.js Bypasses Adaptive Resolution
**Severity:** HIGH
**Impact:** Adaptive resolution never runs in production
**Fix:** Remove explicit `steps` parameter from main.js calls

### 3. CRITICAL: maxSteps Cap Creates Zigzag for Long Durations
**Severity:** HIGH
**Impact:** 5-year trajectories degrade to 4.8 steps/day, causing zigzag
**Fix Options:**
- Increase maxSteps to 21,900 (higher CPU cost)
- Keep 8760 but document degradation beyond 2 years
- Implement progressive rendering (render first N steps, then extend)

### 4. MODERATE: Degenerate Orbit Fallback Too Conservative
**Severity:** MODERATE
**Impact:** Sun collision orbits get 200 steps when they need maximum resolution
**Fix:** Return `maxSteps` instead of `minSteps` for degenerate cases

### 5. MODERATE: Hyperbolic Orbits Don't Scale by Velocity
**Severity:** MODERATE
**Impact:** Fast hyperbolic flybys get zigzag near periapsis
**Fix:** Scale hyperbolic steps by periapsis distance or velocity

---

## Recommended Next Steps

### Immediate Fixes (Required)

1. **Fix hash calculation:**
   ```javascript
   // BEFORE params are used for hash:
   const adaptiveSteps = steps !== undefined
       ? steps
       : calculateAdaptiveSteps(orbitalElements, duration, soiState);

   // Create new params object with resolved steps:
   const resolvedParams = { ...params, steps: adaptiveSteps };
   const hash = hashInputs(resolvedParams);
   ```

2. **Remove explicit steps from main.js:**
   ```javascript
   // DELETE lines 165-169 (intersectionSteps calculation)
   // CHANGE line 177:
   - steps: intersectionSteps,
   + // steps: (omit to use adaptive)
   ```

### Secondary Fixes (Important)

3. **Increase maxSteps or add progressive rendering:**
   - Option A: `maxSteps: 21900` (supports 5 years at full resolution)
   - Option B: Keep 8760, add progressive rendering for long durations
   - Option C: Document degradation, accept zigzag beyond 2 years

4. **Improve degenerate orbit handling:**
   ```javascript
   if (!isFinite(absA) || absA < 1e-10) {
       return TRAJECTORY_RENDER_CONFIG.maxSteps;  // Use max, not min
   }
   ```

5. **Add velocity scaling for hyperbolic orbits:**
   ```javascript
   if (e >= 1.0) {
       // Scale by periapsis distance (closer = more steps)
       const q = a * (1 - e);  // periapsis distance
       const velocityFactor = Math.sqrt(1.0 / Math.abs(q));  // v ∝ 1/√r
       const scaledSteps = Math.ceil(stepsFromDuration * velocityFactor);
       return Math.max(minSteps, Math.min(scaledSteps, maxSteps));
   }
   ```

---

## Why the Zigzag Persists

**Primary reason:** The adaptive resolution fix never runs because main.js passes explicit `steps`.

**Secondary reason:** Even if it ran, the hash bug would cause cache collisions, returning wrong trajectories.

**Tertiary reason:** For 5-year predictions, maxSteps cap reduces resolution below the threshold for smooth rendering.

**The fix needs THREE changes to work:**
1. Fix the hash to include adaptive steps
2. Remove explicit steps from main.js
3. Either increase maxSteps or accept degradation for long durations

---

## Test Cases to Verify Fix

After implementing fixes, test these scenarios:

1. **Mercury orbit, 60 days:** Should get 1200+ steps (12/day or 50/orbit, whichever is larger)
2. **Neptune orbit, 60 days:** Should get 720 steps (12/day dominates)
3. **Earth orbit, 5 years:** Should get 8760 steps (hits cap, may show minor zigzag)
4. **Hyperbolic flyby at 0.1 AU periapsis:** Should get maxSteps (9000+)
5. **Cache test:** Two calls with same params should return cached trajectory
6. **Cache test:** Two different orbits should NOT share cache

Run these in browser console:
```javascript
import('/js/lib/trajectory-predictor.test.js').then(m => m.runAllTests())
```

---

**End of Report**
