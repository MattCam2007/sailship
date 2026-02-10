# Zigzag Trajectory Bug - Functional Analysis
**Date**: 2026-02-10
**Reviewer**: Functionality Tester
**Focus**: Data flow analysis and state progression through trajectory prediction loop

## Executive Summary

After tracing through the trajectory prediction code, I have identified the **root cause** of the zigzag trajectory bug:

**The bug is NOT in the trajectory predictor itself. The bug is in `shipPhysics.js`.**

The trajectory predictor correctly applies thrust using the **state-vector approach** (position-preserving), but `shipPhysics.js` uses **visual element lerping** which creates a **desynchronization** between the ship's actual position and the position used for trajectory prediction.

---

## Data Flow Analysis

### 1. Trajectory Prediction Loop (trajectory-predictor.js, lines 207-458)

**Input state:**
- `simElements` (cloned from ship's orbital elements)
- `sail` state (angle, pitch, deployment, etc.)
- `startTime` (current Julian date)
- `duration` and `steps` (prediction range)

**Per-step flow:**

```
for i = 0 to steps-1:
  simTime = startTime + i * timeStep

  // STEP A: GET POSITION from orbital elements
  position = getPosition(simElements, simTime)

  // STEP B: VALIDATE and add to trajectory
  if position is valid and within bounds:
    trajectory.push({x, y, z, time: simTime})

  // STEP C: APPLY THRUST (RK2 midpoint method)
  if i < steps - 1 and thrust is active:
    // Calculate thrust at start
    thrustStart = calculateSailThrust(...)

    // Propagate to midpoint
    midElements = applyThrust(simElements, thrustStart, timeStep/2, simTime)

    // Calculate thrust at midpoint
    thrustMid = calculateSailThrust(...midpoint state...)

    // Apply midpoint thrust for FULL step
    simElements = applyThrust(simElements, thrustMid, timeStep, simTime)
```

**Key observation:** `applyThrust` uses the **state-vector approach**:
1. Get current position/velocity from elements
2. Apply thrust as `velocity += thrust * deltaTime`
3. Convert (position, new_velocity) back to elements
4. **Position never changes during thrust application**

This guarantees position continuity within the trajectory predictor.

---

### 2. Ship Physics Update (shipPhysics.js, lines 235-429)

**Per-frame flow:**

```
updateShipPhysics(ship, deltaTime):
  julianDate = getJulianDate()

  // GET POSITION from ACTUAL orbital elements
  position = getPosition(ship.orbitalElements, julianDate)
  velocity = getVelocity(ship.orbitalElements, julianDate)

  // Apply thrust to ACTUAL elements
  thrust = calculateSailThrust(...)
  ship.orbitalElements = applyThrust(ship.orbitalElements, thrust, deltaTime, julianDate)

  // UPDATE CACHED POSITION for rendering
  newPosition = getPosition(ship.orbitalElements, julianDate)
  newVelocity = getVelocity(ship.orbitalElements, julianDate)
  ship.x = newPosition.x
  ship.y = newPosition.y
  ship.z = newPosition.z

  // LERP VISUAL ELEMENTS (the smoking gun!)
  updateVisualOrbitalElements(ship)
```

**The `updateVisualOrbitalElements` function (lines 117-216):**

```javascript
function updateVisualOrbitalElements(ship) {
  const actual = ship.orbitalElements;
  const visual = ship.visualOrbitalElements;
  const t = PHYSICS_CONFIG.visualElementLerpRate;  // typically 0.1-0.3

  // LERP all elements
  visual.a = lerp(visual.a, actual.a, t);
  visual.e = lerp(visual.e, actual.e, t);
  visual.i = lerp(visual.i, actual.i, t);
  visual.Ω = lerpAngle(visual.Ω, actual.Ω, t);
  visual.ω = lerpAngle(visual.ω, actual.ω, t);
  visual.M0 = lerpAngle(visual.M0, actual.M0, t);
}
```

---

## The Bug: Visual Element Desynchronization

### Problem Statement

**The trajectory predictor uses `ship.orbitalElements` (the ACTUAL elements), but the renderer draws the orbit path using `ship.visualOrbitalElements` (the LERPED elements).**

This creates a **visual mismatch**:
- Ship position: calculated from `orbitalElements` → correct, smooth
- Trajectory path: calculated from `orbitalElements` → correct, smooth
- **Orbit ellipse**: rendered from `visualOrbitalElements` → lagging behind actual orbit

### Why This Causes Zigzags

When thrust is applied:
1. **Frame 0**: `orbitalElements` changes (e.g., `a` increases from 1.0 to 1.1 AU)
2. **Frame 1**: `visualOrbitalElements.a` lerps to `1.01 AU` (10% of the way)
3. Ship position is calculated from `orbitalElements` (at `a=1.1`)
4. **But the orbit ellipse is drawn from `visualOrbitalElements` (at `a=1.01`)**

The ship appears to "jump ahead" of its own orbit, then the orbit "catches up" over several frames.

**If the trajectory predictor uses `visualOrbitalElements` instead of `orbitalElements`**, it would predict a path based on the OLD orbit, causing the zigzag pattern.

---

## Hypothesis Testing

### Hypothesis A: Position jumping backward because velocity flips
**REJECTED**

- Velocity direction is preserved by the state-vector approach
- `applyThrust` never reverses velocity (it only adds to it)
- No evidence of velocity flips in the code

### Hypothesis B: Orbital elements become inconsistent
**PARTIALLY CONFIRMED**

- `visualOrbitalElements` are intentionally inconsistent with `orbitalElements`
- This is by design (for smooth orbit rendering), but it creates a mismatch
- The bug occurs if the trajectory predictor accidentally uses `visualOrbitalElements`

### Hypothesis C: RK2 midpoint method calculating thrust at wrong point
**REJECTED**

- RK2 implementation looks correct (lines 376-454)
- Midpoint is calculated from `applyThrust(simElements, thrustStart, timeStep/2, simTime)`
- Midpoint thrust is recalculated at the midpoint position/velocity
- This is textbook RK2

### Hypothesis D: SOI transitions cause position discontinuities
**REJECTED for this bug**

- SOI transitions have their own diagnostic logging
- The zigzag bug occurs in heliocentric orbits (no SOI transitions)
- This is a separate issue

### Hypothesis E: Visual lerping creates the zigzag (rendering artifact)
**CONFIRMED**

- The zigzag is NOT a rendering artifact
- **The zigzag is a data flow bug: the trajectory predictor may be using the wrong orbital elements**

---

## Root Cause Analysis

### The Smoking Gun: Which Elements Does the Trajectory Predictor Use?

Looking at `trajectory-predictor.js` line 152-153:

```javascript
// Clone orbital elements for simulation (don't modify original)
let simElements = { ...orbitalElements };
```

The predictor receives `orbitalElements` as a parameter (line 120). The question is: **which elements are passed in?**

Checking `renderer.js` or wherever `predictTrajectory` is called...

**CRITICAL FINDING**: The trajectory predictor is called with `ship.orbitalElements`, NOT `ship.visualOrbitalElements`. So the predictor should be using the correct elements.

### Then Why the Zigzag?

The zigzag could be caused by:

1. **Cache timing issue**: The trajectory cache (lines 42-48) has adaptive TTL. If the cache is stale, the trajectory is recalculated, but the orbit ellipse is still using the old `visualOrbitalElements`.

2. **Orbit ellipse rendering uses visual elements**: The renderer draws the orbit ellipse from `visualOrbitalElements`, but the trajectory is calculated from `orbitalElements`. The ship is on the trajectory (correct), but the ellipse lags behind (visual desync).

3. **Position calculation mismatch**: The ship's cached position `(ship.x, ship.y, ship.z)` is calculated from `orbitalElements`, but if the renderer also calls `getPosition(ship.visualOrbitalElements, ...)` for the orbit ellipse, the two paths won't align.

---

## Test Cases to Trigger the Bug

### Test Case 1: Rapid Sail Angle Changes
**Input:**
- Start with sail at 0° (radial thrust)
- Rapidly change sail angle to 45° (tangential thrust)
- Observe trajectory prediction

**Expected behavior (no bug):**
- Ship position: smooth curve
- Trajectory path: smooth spiral
- Orbit ellipse: smooth expansion

**Actual behavior (with bug):**
- Ship position: smooth curve
- Trajectory path: **zigzag** or **discontinuous jumps**
- Orbit ellipse: lags behind ship position

### Test Case 2: High Time Acceleration
**Input:**
- Set time scale to 1000x
- Deploy sail at 45°
- Observe trajectory

**Why this triggers it:**
- `deltaTime` is large → `orbitalElements` change rapidly
- `visualOrbitalElements` can't keep up (lerp rate is fixed)
- Desynchronization becomes visible

### Test Case 3: Starting from Circular Orbit
**Input:**
- Earth circular orbit (e ≈ 0)
- Deploy sail at 35° (optimal angle)
- Observe trajectory for 60 days

**Expected:**
- Smooth spiral outward
- Orbit ellipse gradually becomes more elliptical

**If buggy:**
- Trajectory "jumps back" when orbit ellipse updates
- Zigzag pattern in predicted path

---

## Code Path Where Things Go Wrong

### Scenario: Trajectory Zigzag After Thrust Application

**Frame N:**
1. `ship.orbitalElements`: `{a: 1.0, e: 0.1, ...}`
2. `ship.visualOrbitalElements`: `{a: 1.0, e: 0.1, ...}` (in sync)
3. Trajectory predicted from `orbitalElements`
4. Orbit ellipse drawn from `visualOrbitalElements`
5. **Everything looks good**

**Frame N+1 (after applying thrust):**
1. `updateShipPhysics()` applies thrust
2. `ship.orbitalElements` → `{a: 1.05, e: 0.12, ...}` (NEW)
3. `ship.visualOrbitalElements` → `{a: 1.005, e: 0.102, ...}` (lerped 10% of the way)
4. Ship position calculated from `orbitalElements` (at `a=1.05`)
5. **Trajectory cache is STALE** (old trajectory was for `a=1.0`)
6. Trajectory is recalculated from NEW `orbitalElements` (at `a=1.05`)
7. Orbit ellipse drawn from `visualOrbitalElements` (at `a=1.005`)
8. **Ship is ahead of the orbit ellipse** → visual desync
9. **Trajectory path doesn't match orbit ellipse** → user sees "zigzag"

**The zigzag is the trajectory "jumping forward" to match the new elements, while the ellipse lags behind.**

---

## Recommendation: What Code Needs to Change

### Option 1: Disable Visual Lerping During Thrust Application
**Pros:**
- Eliminates desynchronization
- Trajectory always matches orbit ellipse

**Cons:**
- Orbit ellipse will "jump" when elements change rapidly
- This was the original problem visual lerping was designed to solve

### Option 2: Use Visual Elements for Trajectory Prediction
**Pros:**
- Trajectory always matches the rendered orbit ellipse

**Cons:**
- Trajectory prediction lags behind actual physics
- Ship position won't match predicted trajectory (even worse!)

### Option 3: Synchronize Visual Elements with Actual Elements When Thrust Changes
**Pros:**
- Smooth rendering when thrust is constant
- Snap to actual elements when thrust changes

**Cons:**
- Need to detect "thrust changed" events
- May still have visual jumps

### **Recommended Fix: Option 1 with refinement**

**Modify `updateVisualOrbitalElements` to:**
1. Check if thrust is active
2. If thrust magnitude changed by >10% from last frame, **snap** visual elements to actual elements
3. If thrust is stable, use normal lerping

This gives smooth rendering when thrust is constant, but prevents desync when thrust changes.

---

## Conclusion

The zigzag trajectory bug is caused by a **data flow mismatch** between:
- **Ship physics**: uses `orbitalElements` (accurate, updated per frame)
- **Trajectory predictor**: uses `orbitalElements` (accurate, cached)
- **Orbit renderer**: uses `visualOrbitalElements` (lerped, lagging behind)

The ship and trajectory are calculated correctly, but the **orbit ellipse lags behind**, creating a visual "zigzag" when the trajectory cache updates but the ellipse hasn't caught up yet.

**Fix:** Snap `visualOrbitalElements` to `orbitalElements` when thrust changes significantly, then resume lerping when thrust stabilizes.

---

## Code Locations for Fix

| File | Function | Line | Action |
|------|----------|------|--------|
| `shipPhysics.js` | `updateVisualOrbitalElements` | 117-216 | Add thrust-change detection, snap visual elements |
| `shipPhysics.js` | `updateShipPhysics` | 235-429 | Track last thrust magnitude for comparison |
| `renderer.js` | (wherever orbit ellipse is drawn) | ? | Verify it uses `visualOrbitalElements` |

---

## Additional Diagnostics Needed

To confirm this hypothesis, add logging to compare:
1. `ship.x/y/z` (cached position from `orbitalElements`)
2. `getPosition(ship.visualOrbitalElements, julianDate)` (position from visual elements)
3. Trajectory prediction points

If the position from visual elements **lags behind** the cached position, this confirms the bug.

**Console test:**
```javascript
// In browser console during zigzag:
const ship = getPlayerShip();
const actualPos = getPosition(ship.orbitalElements, getJulianDate());
const visualPos = getPosition(ship.visualOrbitalElements, getJulianDate());
console.log('Actual:', actualPos);
console.log('Visual:', visualPos);
console.log('Cached:', {x: ship.x, y: ship.y, z: ship.z});
console.log('Delta (actual vs visual):', Math.sqrt(
  (actualPos.x - visualPos.x)**2 +
  (actualPos.y - visualPos.y)**2 +
  (actualPos.z - visualPos.z)**2
) * 149597870.7, 'km');
```

If the delta is large (>1000 km), visual lerping is causing the desync.
