# Physics/Realism Review: Encounter Marker Timing Accuracy

**Date:** 2026-02-07
**Reviewer:** Physics/Realism Perspective
**Scope:** Ghost planet timing for eccentric orbits (Mars case study)
**Timestamp:** 2026-02-07T00:00:00Z

---

## Executive Summary

The encounter marker system has three compounding physics errors that cause Mars's ghost planet to appear at the wrong time/position. The dominant error is **Finding 1** (using a fixed radius instead of Mars's instantaneous orbital radius), which alone can shift the ghost by up to **71 days and 0.96 AU** in the worst case. A physically correct fix exists that satisfies the user's constraint (ghost anchored to a point the ship actually passes through) while eliminating the largest error source.

---

## Finding 1: Fixed Radius vs. Instantaneous Radius

**Severity: CRITICAL**

### The Problem

The intersection detector (`intersectionDetector.js`, line 500) checks whether the ship crosses the **semi-major axis** of the target body:

```javascript
const crossing = findRadiusCrossing(p1, p2, r1, r2, a);
```

For Mars: `a = 1.523679 AU` (fixed constant).

But Mars's actual heliocentric distance varies continuously according to the conic section equation:

```
r_mars(t) = a(1 - e^2) / (1 + e * cos(nu(t)))
```

where `nu(t)` is Mars's true anomaly at time `t`.

### Quantified Error for Mars

Mars orbital parameters:
- `a = 1.523679 AU`
- `e = 0.0934`
- `a(1 - e^2) = 1.523679 * (1 - 0.008724) = 1.510389 AU` (semi-latus rectum)

Orbital radius range:
- **Perihelion:** `r_p = a(1-e) = 1.523679 * 0.9066 = 1.3812 AU`
- **Aphelion:** `r_a = a(1+e) = 1.523679 * 1.0934 = 1.6661 AU`
- **Semi-major axis:** `a = 1.5237 AU`

Maximum deviation from semi-major axis: `+/- e*a = +/- 0.1424 AU`

### Timing Error Calculation

For a solar sail spiraling outward from Earth toward Mars, the radial velocity through Mars's orbital zone is typically 0.001-0.003 AU/day (continuous low thrust). Using a mid-estimate of 0.002 AU/day:

**Worst case: Mars near perihelion (r = 1.381 AU)**

The ship actually enters Mars's orbital neighborhood at r = 1.381 AU, but the detector doesn't trigger until r = 1.524 AU:

```
Radial distance gap: 1.524 - 1.381 = 0.143 AU
Time to traverse gap: 0.143 / 0.002 = 71.5 days
```

During those 71.5 days, Mars moves:
```
Mars mean angular velocity: 360 deg / 686.97 days = 0.5240 deg/day
Mars angular motion: 71.5 * 0.5240 = 37.5 degrees
```

The positional error (chord distance at ~1.5 AU):
```
d = 2 * r * sin(theta/2) = 2 * 1.5 * sin(18.75 deg) = 2 * 1.5 * 0.3214 = 0.964 AU
```

**That is 144 million km of error.** The ghost planet is placed where Mars was 71 days too early (or too late, depending on crossing direction).

**Worst case: Mars near aphelion (r = 1.666 AU)**

```
Radial distance gap: 1.666 - 1.524 = 0.142 AU
Timing error: 0.142 / 0.002 = 71 days
Angular displacement: 71 * 0.524 = 37.2 degrees
Positional error: ~0.96 AU
```

**Average case: Mars at quadrature (nu ~ 90 deg, r ~ 1.51 AU)**

```
Radial distance gap: |1.524 - 1.510| = 0.014 AU
Timing error: 0.014 / 0.002 = 7 days
Angular displacement: 7 * 0.524 = 3.7 degrees
Positional error: ~0.097 AU (~14.5 million km)
```

### The Physically Correct Approach

Instead of checking `r_ship(t) = a_mars` (constant), check `r_ship(t) = r_mars(t)` (time-varying).

**Algorithm:**

For each trajectory segment `[t_i, t_{i+1}]`, compute:
1. `r_ship(t)` = ship's heliocentric distance (from trajectory points, linear interpolation)
2. `r_mars(t)` = Mars's heliocentric distance at time `t` = `getPosition(mars_elements, t)` then take magnitude

Find where `delta(t) = r_ship(t) - r_mars(t)` changes sign. The crossing time `t*` is when the ship is at the **same heliocentric distance as Mars at that instant**.

This satisfies the user's constraint: the ghost is placed at a radius the ship actually crosses through. But the radius is Mars's real instantaneous distance, not an arbitrary average.

**Implementation note:** This requires evaluating `r_mars(t)` at each trajectory segment endpoint (two `getPosition()` calls per segment per body). For the current ~2400 segments and ~8 bodies, this is ~38,400 extra `getPosition()` calls. At ~1 microsecond each, that is ~38ms -- potentially tight but feasible. An optimization: only evaluate `r_mars(t)` for bodies where the trajectory is in the right radial neighborhood (the existing pre-filter handles this).

**Why this is NOT the same as closest approach:** The closest-approach algorithm (already implemented in `detectClosestApproaches()`) minimizes the 3D distance between ship and planet. This can place the ghost at positions far from any radius the ship reaches (the user's complaint about "ghosts at 4 AU"). The instantaneous-radius-match approach instead finds the moment when ship and planet share the same solar distance -- the ship WILL be at that radius, but the ghost shows Mars's actual angular position at that shared-radius moment.

### Comparison Table

| Method | Ghost anchored to ship path? | Timing accuracy | Notes |
|--------|-----|-----|-----|
| Fixed `a` (current) | Yes (at a) | 0-71 days error | Ignores eccentricity |
| Multi-radius perihelion/a/aphelion (reverted) | Yes | 0-35 days error | Causes UI snapping |
| Closest approach (rejected) | NO | Best | Ghost can be at unreachable radius |
| **Instantaneous radius match** | **Yes (at r_mars(t))** | **< 1 day error** | **Correct physics** |

---

## Finding 2: Trajectory Predictor Step Size Divergence

**Severity: IMPORTANT**

### The Problem

The trajectory predictor (`trajectory-predictor.js`, line 150) and the real-time game loop (`main.js` + `shipPhysics.js`) both use Euler integration to propagate orbital elements under continuous sail thrust, but at very different step sizes.

**Trajectory predictor (for intersection detection):**
- `stepsPerDay = 12` (from `INTERSECTION_CONFIG`)
- Step size: `h_pred = 1/12 day = 2 hours = 7200 seconds`

**Game loop at typical Mars-transfer speed (100,000x):**
- `REAL_TIME_RATE = 1/(86400 * 60) = 1.929e-7 days/frame`
- At 100,000x: `timeScale = 100000 * 1.929e-7 = 0.01929 days/frame`
- Step size: `h_game = 0.01929 days = 27.8 minutes = 1667 seconds`

**Step size ratio:** `h_pred / h_game = 0.0833 / 0.01929 = 4.32x`

### Error Quantification

Both systems use first-order Euler integration of the Gauss variational equations (the `applyThrust()` function). For Euler's method applied to an ODE:
- Local truncation error: `O(h^2)`
- Global truncation error after time `T`: `O(T * h)`

The sail acceleration at Mars distance (~1.5 AU):
```
Solar pressure at 1.5 AU: P = 4.56e-6 * (1/1.5)^2 = 2.027e-6 N/m^2
Force (1 km^2 sail, 90% reflectivity): F = 2.027e-6 * 1e6 * 1.9 = 3.85 N
Acceleration: a = 3.85 / 10000 kg = 3.85e-4 m/s^2 = 0.385 mm/s^2
```

Over a 200-day transfer, the cumulative effect of this acceleration:
```
Delta-v per predictor step (2hr): dv = 3.85e-4 * 7200 = 2.77 m/s
Total predictor steps: 200 * 12 = 2400
Total delta-v (both methods): ~6650 m/s (identical total impulse)
```

The ERROR comes from the thrust direction and magnitude being evaluated at the wrong orbital position when the step is too large. With 2-hour steps, the ship has moved:
```
Mars-crossing ship velocity: ~25 km/s (typical for solar sail at 1.5 AU)
Distance per step: 25 * 7200 = 180,000 km
Angular displacement per step: ~0.07 rad (4 degrees)
```

The thrust direction error per step is proportional to this angular displacement. Over 2400 steps, these directional errors partially cancel (random walk), but systematic bias accumulates.

**Estimated position divergence after 200 days:**

Using standard Euler error analysis for orbital mechanics (Montenbruck & Gill, "Satellite Orbits"):
```
Global error ~ T * h * |f'| / 2
```

Where `|f'|` is the rate of change of the right-hand side. For solar sail thrust perturbing semi-major axis at ~0.001 AU/day:

```
Predictor error: E_pred ~ 200 * 0.0833 * 0.001 / 2 = 0.0083 AU
Game loop error: E_game ~ 200 * 0.0193 * 0.001 / 2 = 0.0019 AU
```

**Differential error (predictor vs game loop):** `~0.006 AU` = ~900,000 km

This translates to a timing error at the crossing:
```
Crossing time shift: 0.006 AU / 0.002 AU/day = 3 days
Mars angular displacement: 3 * 0.524 = 1.6 degrees
Positional error: 2 * 1.5 * sin(0.8 deg) = 0.042 AU = ~6.3 million km
```

### Assessment

This is significantly smaller than Finding 1 (0.042 AU vs 0.96 AU), but still meaningful for navigation. At higher time warp speeds (1,000,000x), the game loop step size increases to ~4.6 hours, approaching the predictor's 2-hour steps, which actually *reduces* this particular divergence source (both become equally inaccurate).

**At 10,000,000x speed:**
```
h_game = 10,000,000 * 1.929e-7 = 1.929 days/frame
```
This is **worse** than the predictor (1.93 days vs 0.083 days). At extreme time warp, the game loop itself becomes the less accurate integrator, and the trajectory predictor is actually more faithful. The divergence flips sign.

---

## Finding 3: The Multi-Radius Approach Was Correctly Diagnosed but Incorrectly Solved

**Severity: IMPORTANT**

### History

The code comments and investigation report (`ghost-planet-snapping-investigation-2026-02-07.md`) document a clear progression:

1. **Original:** Check only semi-major axis `a` (simple, stable, but physically wrong for eccentric orbits)
2. **Feb 6 fix attempt:** Check perihelion, `a`, and aphelion (correct physics intuition, but caused UI snapping)
3. **Feb 7 revert:** Back to semi-major axis only (stable UI, but physics error remains)

### Why Multi-Radius Failed

The investigation correctly identifies the root cause: deduplication's winner-takes-all strategy creates discontinuities when different radius crossings compete. For Mars:
- Perihelion crossing at day ~337 (distance 0.38 AU)
- Semi-major axis crossing at day ~400 (distance 0.25 AU)
- Aphelion crossing at day ~437 (distance 0.20 AU)

All three fall within the 208-day merge window. Small sail changes flip the winner, causing 96-day jumps.

### Why Instantaneous Radius is the Correct Fix

The multi-radius approach discretized a continuous problem into three fixed radii. The instantaneous-radius approach (`r_ship(t) = r_mars(t)`) avoids this entirely:

- There is exactly **one** crossing per transit direction (outbound or inbound)
- The crossing radius varies smoothly with trajectory changes (no discretization artifacts)
- No deduplication needed (eliminating the source of snapping)
- The radius automatically matches Mars's actual position (eliminating the timing error)

This is not three competing signals with a noisy selector; it is a single smooth signal.

### The evaluate-trajectory.js Solver Also Has This Issue

The course solver (`evaluate-trajectory.js`, lines 246-256) uses the same multi-radius approach:
```javascript
if (targetE > 0.05 && targetE < 0.95) {
    const perihelion = targetA * (1 - targetE);
    const aphelion = targetA * (1 + targetE);
    targetRadii = [perihelion, targetA, aphelion];
}
```

This means the solver optimizes for crossing at one of three fixed radii, introducing the same timing ambiguity. The solver should use instantaneous-radius matching for consistency with the corrected intersection detector.

---

## Finding 4: Bisection Refinement Precision is Mismatched to Underlying Accuracy

**Severity: NICE-TO-HAVE**

### The Problem

The crossing refinement algorithm (`refineCrossingBisection()`, lines 263-371) achieves impressive precision:
- High zoom: 12 iterations --> 2 hours / 2^12 = **1.8 seconds**
- Low zoom: 8 iterations --> 2 hours / 2^8 = **28 seconds**

But this precision is applied to a crossing detection against a **fixed radius** (Finding 1) using a **trajectory with multi-day cumulative errors** (Finding 2).

### Quantified Mismatch

| Error source | Timing contribution |
|---|---|
| Fixed radius vs instantaneous (Finding 1) | 0 - 71 days |
| Trajectory divergence (Finding 2) | ~3 days |
| Bisection refinement precision | ~0.00002 days (1.8 sec) |

The refinement precision is **6 orders of magnitude** better than the dominant error. This is the equivalent of measuring the position of a dart with a micrometer when the dart missed the board by a meter.

### Assessment

The bisection refinement is not harmful (it's fast, ~12 iterations), but it creates a false sense of precision. The displayed time labels ("MARS +221d 4h") imply hour-level accuracy when the true uncertainty is days to weeks.

After fixing Findings 1 and 2, this refinement becomes appropriately matched. No code change needed here -- just awareness that the displayed precision exceeds the actual accuracy until the upstream issues are resolved.

---

## Finding 5: Mars's Orbital Inclination is Ignored in Radius Crossing

**Severity: NICE-TO-HAVE**

### The Problem

Mars's orbit is inclined 1.85 degrees to the ecliptic. The radius-crossing algorithm treats all orbits as coplanar, checking only heliocentric distance. For Mars, this introduces a small out-of-plane error.

### Quantified Impact

The maximum out-of-plane displacement of Mars's orbit:
```
z_max = a * sin(i) = 1.524 * sin(1.85 deg) = 1.524 * 0.0323 = 0.049 AU
```

This means when the ship "crosses Mars's orbital radius," the ship might be 0.049 AU above or below Mars's orbital plane. The actual 3D distance between ship and Mars at the crossing is:

```
d_3D = sqrt(d_planar^2 + z_offset^2)
```

For a crossing where Mars's ghost shows "CLOSE" (d_planar ~ 0.05 AU), the true distance is:
```
d_3D = sqrt(0.05^2 + 0.049^2) = sqrt(0.0025 + 0.0024) = 0.070 AU
```

An additional 0.02 AU (~3 million km) error. Not negligible for close encounters, but much smaller than Finding 1.

For bodies with higher inclination (Ceres: 10.6 deg, Pluto: 17.1 deg), this becomes more significant.

---

## Recommended Fix Priority

### Priority 1 (CRITICAL): Implement Instantaneous Radius Matching

Replace the fixed-radius crossing detection in `findOrbitalPlaneCrossings()` with simultaneous radius matching:

```
For each trajectory segment [p1, p2]:
    r_ship_1 = |p1|    (heliocentric distance of ship at t1)
    r_ship_2 = |p2|    (heliocentric distance of ship at t2)
    r_mars_1 = |getPosition(mars.elements, t1)|
    r_mars_2 = |getPosition(mars.elements, t2)|

    delta_1 = r_ship_1 - r_mars_1
    delta_2 = r_ship_2 - r_mars_2

    if sign(delta_1) != sign(delta_2):
        // Ship and Mars are at the same solar distance somewhere in this segment
        // Binary search or interpolate for exact crossing time
        t_cross = bisection(t1, t2, |r_ship(t) - r_mars(t)|)
        // Ghost: Mars's position at t_cross
```

**Expected improvement:** Eliminates 0-71 day timing error. Eliminates multi-radius snapping. Single smooth crossing per transit.

**Performance cost:** ~2x `getPosition()` calls per body per segment. Mitigated by existing radial pre-filter.

### Priority 2 (IMPORTANT): Apply Same Fix to evaluate-trajectory.js

Update `evaluateCandidate()` to use instantaneous radius matching instead of the fixed multi-radius array `[perihelion, a, aphelion]`.

### Priority 3 (NICE-TO-HAVE): Consider Higher-Order Integration

Replace Euler integration in the trajectory predictor with a symplectic or RK4 integrator for the Gauss variational equations. This would reduce Finding 2's ~3-day timing error to ~minutes, making the trajectory predictor much more faithful to the game loop's evolution.

---

## Appendix A: Mars Orbital Radius vs. True Anomaly

| True Anomaly (nu) | r (AU) | Deviation from a | Phase |
|---|---|---|---|
| 0 deg (perihelion) | 1.3812 | -0.143 | Closest to Sun |
| 45 deg | 1.4198 | -0.104 | |
| 90 deg | 1.5104 | -0.013 | |
| 135 deg | 1.6011 | +0.077 | |
| 180 deg (aphelion) | 1.6661 | +0.142 | Farthest from Sun |
| 225 deg | 1.6011 | +0.077 | |
| 270 deg | 1.5104 | -0.013 | |
| 315 deg | 1.4198 | -0.104 | |

Computed via `r = 1.510389 / (1 + 0.0934 * cos(nu))`

## Appendix B: Time Step Comparison Across Speed Settings

| Speed Setting | Game Loop dt (days) | Predictor dt (days) | Ratio | Which is more accurate? |
|---|---|---|---|---|
| 1x | 1.93e-7 | 0.0833 | 432,000:1 | Game loop (vastly) |
| 100x | 1.93e-5 | 0.0833 | 4,320:1 | Game loop |
| 10,000x | 0.00193 | 0.0833 | 43:1 | Game loop |
| 100,000x | 0.0193 | 0.0833 | 4.3:1 | Game loop |
| 1,000,000x | 0.193 | 0.0833 | 0.43:1 | Predictor |
| 10,000,000x | 1.93 | 0.0833 | 0.043:1 | Predictor (vastly) |

At extreme time warp (>1M x), the trajectory predictor is actually MORE accurate than the game loop. The divergence favors the predictor.

## Appendix C: Error Budget Summary

For a 200-day Earth-to-Mars transfer, ghost planet timing errors:

| Error Source | Timing Error | Angular Error | Position Error (AU) | Severity |
|---|---|---|---|---|
| Fixed radius (Finding 1) | 0 - 71 days | 0 - 37 deg | 0 - 0.96 | CRITICAL |
| Integration divergence (Finding 2) | ~3 days | ~1.6 deg | ~0.042 | IMPORTANT |
| Inclination neglect (Finding 5) | N/A | N/A | 0.02 (3D offset) | Nice-to-have |
| Bisection refinement (Finding 4) | -0.00002 days | -0.00001 deg | Negligible | Noise floor |
| **Total worst case** | **~74 days** | **~39 deg** | **~1.02** | |
| **Total typical case** | **~10 days** | **~5 deg** | **~0.13** | |

"Typical case" assumes Mars is at a random orbital phase (average deviation from semi-major axis is ~0.09 AU).
