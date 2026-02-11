# Zigzag Bug: Comprehensive Multi-Perspective Analysis

**Date:** 2026-02-10
**Commit Analyzed:** 530a1d9 (Add adaptive trajectory resolution)
**Status:** Fix Failed - Bug Persists

## Executive Summary

The adaptive trajectory resolution fix (commit 530a1d9) **did not solve the zigzag bug** because:

1. **THE FIX NEVER EXECUTES** - All production callers explicitly pass the `steps` parameter, completely bypassing the new adaptive calculation logic
2. **THE FIX ADDRESSES THE WRONG PROBLEM** - Even if executed, it wouldn't solve the root cause
3. **THE ROOT CAUSE IS MULTI-LAYERED** - Three distinct issues contribute to the visual zigzag artifact

This report synthesizes analyses from seven independent review perspectives to explain why the bug persists and what actually needs to be fixed.

---

## Critical Finding #1: The Adaptive Fix Is Dead Code

### The Smoking Gun (Identified by: Architect, Failure Analyst, Best Practices, Regression Checker)

**In `trajectory-predictor.js` (lines 243-247):**
```javascript
const adaptiveSteps = steps !== undefined
    ? steps
    : calculateAdaptiveSteps(orbitalElements, duration, soiState);
```

The adaptive calculation only runs when `steps === undefined`. However:

**In `renderer.js` (lines 1162-1177):**
```javascript
const rawSteps = Math.round(duration * TRAJECTORY_RENDER_CONFIG.stepsPerDay);
const steps = Math.min(TRAJECTORY_RENDER_CONFIG.maxSteps,
                      Math.max(TRAJECTORY_RENDER_CONFIG.minSteps, rawSteps));

const trajectory = predictTrajectory({
    ...
    steps: steps,  // ← ALWAYS DEFINED - bypasses adaptive logic
    ...
});
```

**In `main.js` (lines 165-177):**
```javascript
const intersectionSteps = Math.min(INTERSECTION_CONFIG.maxSteps,
                                   Math.max(INTERSECTION_CONFIG.minSteps, rawSteps));

const highResTrajectory = predictTrajectory({
    ...
    steps: intersectionSteps,  // ← ALWAYS DEFINED - bypasses adaptive logic
    ...
});
```

### Architectural Violation

**The renderer (VIEW layer) is making MODEL decisions.** This is a textbook separation-of-concerns violation where the presentation layer micromanages physics simulation parameters.

**Result:** The adaptive resolution system exists entirely as unreachable code in production.

---

## Critical Finding #2: Even If Executed, The Fix Wouldn't Work

### Mathematical Equivalence (Identified by: Regression Checker)

For a 60-day Earth orbit trajectory:

**Explicit calculation (what actually runs):**
```
steps = clamp(60 * 12, 200, 8760) = 720
```

**Adaptive calculation (what would run if enabled):**
```
stepsFromDuration = ceil(60 * 12) = 720
orbitsInDuration = 60 / 365.26 = 0.164
stepsFromPeriod = ceil(0.164 * 50) = 9
adaptiveSteps = max(720, 9) = 720
result = clamp(720, 200, 8760) = 720
```

**They produce the SAME result** because both use `stepsPerDay: 12` from the same config. The adaptive logic's "50 steps per orbit" constraint is dominated by the "12 steps per day" constraint for all typical orbital scenarios.

### Misdiagnosed Problem

The commit message states:
> "Fixes zigzag trajectory bug caused by integration resolution mismatch (200 fixed steps vs ~216,000 physics steps per 60 days)."

**This diagnosis is incorrect:**
- The trajectory was NEVER using 200 fixed steps
- The "216,000 physics steps" refers to the game loop (60 FPS at high speed), which is irrelevant to trajectory prediction
- The actual step count was already 720 steps for 60-day predictions (2-hour time resolution)

---

## The Actual Root Causes: A Three-Layer Problem

### Layer 1: Physics Integration Error (Identified by: Physicist, Solar Sailing Expert)

**RTN Frame Rotation + State-Vector Roundtrip Errors**

The trajectory predictor uses a state-vector approach:
1. Convert orbital elements → position + velocity
2. Apply thrust as ΔV in the RTN reference frame
3. Convert (position, new_velocity) → new orbital elements

**The Problem:**

The RTN (Radial-Transverse-Normal) reference frame rotates continuously as the ship orbits:
- Earth orbit (1 AU): Frame rotates ~1°/day
- Mercury orbit: Frame rotates ~4°/day

At 12 steps/day (2-hour timesteps), the RTN frame rotates:
- Earth: 0.083° per step
- Mercury: 0.33° per step

Between integration steps, thrust direction is held constant in the ecliptic frame, but the RTN frame has rotated. This creates a **lag** between actual thrust direction and where it should be.

**The State-Vector Roundtrip Amplifies Errors:**

The `stateToElements()` conversion involves:
- Angular momentum calculation
- Eccentricity vector calculation
- Trigonometric inversions (arccos, arctan2)
- Kepler's equation solution

Each conversion accumulates O(10⁻¹⁵) floating-point errors in angular elements (Ω, ω, M), which manifest as O(10⁻⁶ AU) position errors when projected back to Cartesian coordinates.

**Over 720 integration steps, these O(10⁻⁶ AU) errors accumulate coherently (not randomly), creating visible trajectory deviation.**

**Why RK2 Doesn't Save Us:**

The RK2 midpoint integration assumes the thrust vector field is smoothly varying. But when the RTN frame rotates discontinuously due to the elements→state→elements roundtrip, the midpoint thrust is not representative of the average thrust over the interval.

**Solar Sailing Specificity:**

This is a **solar sail-specific challenge**:
- Chemical rockets: Impulsive thrust (no integration needed)
- Ion drives: Continuous thrust in fixed inertial direction (easier to integrate)
- Solar sails: Continuous thrust AND direction changes continuously as RTN frame rotates

The integration method needs to account for the coupling between thrust application → orbit changes → velocity vector changes → RTN frame rotates → thrust direction changes.

### Layer 2: Rendering Artifact (Identified by: Functional Tester)

**Straight Lines vs. Smooth Curves**

Even if the physics calculation were perfect, the visual zigzag would persist because:

**In `renderer.js` (lines 1209-1244):**
```javascript
ctx.beginPath();
ctx.moveTo(proj1.x, proj1.y);
ctx.lineTo(proj2.x, proj2.y);  // STRAIGHT LINE between points
ctx.stroke();
```

The trajectory is rendered as **straight line segments** connecting discrete points. Canvas `lineTo()` draws a straight line, not a curve.

**At low zoom (viewing entire solar system):**
- Trajectory spans thousands of pixels
- Only 720 line segments attempt to represent a curved spiral
- Each straight line creates a visible "corner" where it meets the next → zigzag appearance

**At high zoom (tactical view near planet):**
- Same 720 points over smaller screen area
- More line segments per pixel → smoother appearance
- The polygonal approximation is less visible

**This is independent of physics accuracy.** Even perfectly calculated trajectory points will show zigzag when connected with straight lines at insufficient screen-space density.

### Layer 3: Cache Invalidation Bug (Identified by: Failure Analyst)

**Hash Calculated Before Adaptive Steps Determined**

**In `trajectory-predictor.js` (line 252):**
```javascript
const hash = hashInputs(params);
```

The hash is calculated from the **original** `params` object, which contains the caller's explicit `steps` parameter (or undefined). The adaptive step count is calculated AFTER hashing, so it never makes it into the cache key.

**Result:**
- Different orbits that need different adaptive step counts can collide in cache
- Cache may return trajectories calculated with wrong step counts
- Explicit steps override defeats the cache's ability to track configuration changes

---

## Why Each Fix Component Failed

### 1. Adaptive Step Calculation (`calculateAdaptiveSteps()`)
- ✗ Never executed (bypassed by explicit parameters)
- ✗ Would produce same results anyway (config values cause mathematical equivalence)
- ✗ Doesn't address RTN frame rotation lag
- ✗ Doesn't address rendering straight-line segments

### 2. RK2 Midpoint Integration
- ✓ Correct second-order method for smooth vector fields
- ✗ RTN frame rotation creates discontinuous directional changes
- ✗ Midpoint sampling doesn't capture continuous frame rotation

### 3. Adaptive Sub-Stepping (lines 565-645)
- ✓ Handles large element changes from high-thrust maneuvers
- ✗ Only triggers when Δe > 10% or Δa/a > 20%
- ✗ Normal solar sail spiraling has Δe ~ 10⁻⁵, well below threshold
- ✗ Sub-stepping never activates for typical trajectories

---

## Recommendations from All Reviewers

### Immediate Fix (Required to Make Commit 530a1d9 Actually Work)

**Remove explicit `steps` parameters from all callers:**

```javascript
// In renderer.js - DELETE lines 1162-1166
// In main.js - DELETE lines 165-170

// Replace with:
const trajectory = predictTrajectory({
    orbitalElements: ship.orbitalElements,
    sail: ship.sail,
    mass: ship.mass || 10000,
    startTime: startTime,
    duration: duration,
    // NO steps parameter - let predictor decide
    soiState: ship.soiState,
    extremeFlybyState: ship.extremeFlybyState
});
```

**However**, this alone won't fix the zigzag because of Layer 1 and Layer 2 issues.

### Physics Integration Fixes (Layer 1)

**Option A: Direct Gauss Variational Equations** (Physicist recommendation)
- Compute element rates directly: `da/dt`, `de/dt`, `di/dt`, etc.
- Avoids state-vector roundtrip entirely
- Challenge: Numerically stiff near perihelion and at high eccentricity

**Option B: State-Vector Integration** (Physicist recommendation)
- Store (x, y, z, vx, vy, vz) as primary state
- Only convert to elements for display
- How NASA's SPICE toolkit works
- Downside: Lose compact orbital element representation

**Option C: RTN-Aware Integration** (Solar Sailing Expert recommendation)
- Integrate thrust in RTN frame directly
- Convert ΔV_RTN to inertial frame AFTER integration
- Accounts for frame rotation analytically rather than numerically

**Option D: Symplectic Integrator** (Physicist recommendation)
- Use Leapfrog or Verlet for state vector
- Preserves long-term energy conservation
- Convert to osculating elements only for display

### Rendering Fixes (Layer 2)

**Option A: Increase Point Density for Rendering** (Functional Tester)
- Calculate 5000+ points specifically for visual smoothness
- Trade-off: Higher CPU cost, more memory

**Option B: Adaptive Screen-Space Rendering** (Functional Tester)
- Use existing 720 physics points
- When projecting to screen, subdivide segments longer than threshold (e.g., 20 pixels)
- Only add visual detail where needed (zoom-dependent)

**Option C: Canvas Curve Rendering** (Functional Tester)
- Use `ctx.quadraticCurveTo()` or `ctx.bezierCurveTo()` instead of `lineTo()`
- Interpolate smooth curves between trajectory points
- Maintains physics accuracy while adding visual smoothness

### Config Fixes (Layer 3)

**Fix maxSteps Constraint** (Failure Analyst)
- Current: 8760 max steps caps at 2-year predictions at full resolution
- For 5-year predictions: Degrades to 4.8 steps/day
- Recommendation: Increase to 21,900 (supports 5 years at 12 steps/day) or document degradation

**Fix Hash Calculation** (Failure Analyst)
- Calculate adaptive steps FIRST
- Create resolved params object with actual step count
- Hash the RESOLVED params, not the input params

---

## Reviewer Confidence Ratings

| Reviewer | Confidence | Key Insight |
|----------|-----------|-------------|
| Physicist | 9/10 | RTN frame rotation + state-vector roundtrip errors are root cause |
| Solar Sailing Expert | 8/10 | Solar sail-specific integration challenge, not physics formula error |
| Functional Tester | 8/10 | Rendering artifact from straight lines vs. curves |
| Architect | 10/10 | **SMOKING GUN** - renderer overrides adaptive calculation |
| Failure Analyst | 10/10 | Identified TWO critical bugs preventing fix from working |
| Best Practices | 9/10 | Dead code path from parameter passing logic error |
| Regression Checker | 10/10 | Adaptive fix has ZERO behavioral change (mathematical equivalence) |

---

## Conclusion: Why the Last PR Did Not Fix the Issue

The adaptive trajectory resolution fix (commit 530a1d9) failed because:

### Immediate Cause (Why Fix Doesn't Execute)
1. **Architectural violation**: Renderer and main.js explicitly pass `steps` parameter
2. **Dead code path**: Adaptive calculation is bypassed by `steps !== undefined` check
3. **Parameter design flaw**: Implicit "omit parameter" API without documentation

### Underlying Cause (Why Fix Wouldn't Work Anyway)
1. **Mathematical equivalence**: Adaptive calculation produces same result as explicit calculation for typical orbits
2. **Wrong diagnosis**: Commit message claimed "200 fixed steps" but code was already using 720 steps
3. **Wrong problem targeted**: Increased steps don't solve RTN frame rotation lag or rendering artifacts

### Root Causes (Why Zigzag Actually Exists)
1. **Physics integration error**: RTN frame rotation + state-vector roundtrip creates O(10⁻⁶ AU) position errors that accumulate over 720 steps
2. **Rendering artifact**: Canvas `lineTo()` draws straight lines between points, creating visible corners at low zoom
3. **Cache invalidation bug**: Hash calculated before adaptive steps, causing potential cache collisions

### Required Fixes (In Order of Impact)

**Priority 1: Make the existing fix actually execute**
- Remove explicit `steps` from renderer.js and main.js

**Priority 2: Fix the physics integration**
- Implement RTN-aware integration OR state-vector integration OR direct Gauss equations

**Priority 3: Fix the rendering**
- Implement adaptive screen-space subdivision OR canvas curve rendering OR increase point density

**Priority 4: Fix the cache**
- Calculate adaptive steps before hashing, hash resolved parameters

Only addressing **all four layers** will completely eliminate the zigzag artifact.

---

## Appendices

### A. Test Plan for Validation

1. **Verify adaptive execution**: Add console.log to `calculateAdaptiveSteps()`, confirm it runs
2. **Compare step counts**: Log `adaptiveSteps` vs explicit calculation for various orbits
3. **Visual regression test**: Screenshot trajectories before/after at multiple zoom levels
4. **Physics accuracy test**: Compare trajectory end position with high-resolution reference
5. **Cache validation test**: Verify cache key includes actual step count used

### B. Performance Considerations

Current: 720 steps × 60 FPS = 43,200 calculations/second at 1x speed
Proposed (5000 points): 5000 steps × 60 FPS = 300,000 calculations/second

Mitigation: Cache with longer TTL, or separate physics points (720) from render points (5000)

### C. Related Issues

- Intersection detection uses same trajectory cache (coupled invalidation)
- Encounter markers depend on trajectory resolution (may need separate config)
- Autopilot uses trajectory prediction (need to verify performance impact)

---

**Generated by multi-agent analysis system**
**Agents:** physicist, solar-sailing-expert, functional-tester, architect, failure-analyst, best-practices, regression-checker
