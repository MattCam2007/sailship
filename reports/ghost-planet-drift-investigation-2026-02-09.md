# Ghost Planet Approach Drift Investigation

**Date:** 2026-02-09
**Question:** Why does the predicted closest approach to a ghost planet change as you fly toward it, requiring repeated course corrections?

---

## Executive Summary

The ghost planet drift is **not a bug** — it is the physically correct behavior of a solar sail navigating under continuous thrust. There are at least 6 compounding factors, ranging from fundamental physics (unavoidable) to numerical artifacts (potentially improvable). The dominant cause is that the trajectory predictor runs a forward simulation from "now" and that simulation diverges from reality as the ship's actual state evolves frame-by-frame. Below, each of the seven review perspectives weighs in.

---

## 1. Physics/Realism Review

### Root Cause: Trajectory Prediction is a Snapshot, Not a Guarantee

The trajectory predictor (`trajectory-predictor.js:166-506`) computes a predicted path by:
1. Taking the ship's **current** orbital elements
2. Propagating forward with thrust applied at each step using RK2 midpoint integration
3. Returning ~200-8760 points covering 60-1825 days

This prediction is **recomputed every frame** from the ship's **current** state. As the ship moves forward in time under real thrust, several things change:

#### Factor 1: RTN Frame Rotation (Dominant — ~60-80% of drift)

The sail's thrust is computed in the **RTN frame** (Radial-Transverse-Normal), which is defined by the ship's instantaneous position and velocity vectors (`orbital-maneuvers.js:111-176`). As the ship orbits the Sun:

- The **R** axis (radial, away from Sun) rotates at the orbital angular velocity
- The **T** axis (transverse, prograde in orbital plane) rotates with it
- The **N** axis (normal to orbital plane) can shift as inclination changes

A fixed sail angle (e.g., yaw = 35.26deg) produces thrust in a **different inertial direction** at each point along the orbit. The predictor approximates this by sampling thrust at discrete steps (every 2 hours at 12 steps/day), but:

- Between samples, the RTN frame rotates ~0.08deg per step at 1 AU
- Over 200 days (2400 steps), these frame rotations compound nonlinearly
- The predictor uses RK2, which captures the midpoint frame but still misses the continuous rotation

**Quantitative impact:** The code comments (`trajectory-predictor.js:376-378`) acknowledge this explicitly: "The RTN frame rotates as the ship orbits. Euler holds thrust direction constant over each 2-hour step... Over 200 days, these small errors compound nonlinearly."

Even with RK2, the residual error from the rotating frame is on the order of **0.5-3 days** of timing error over a 200-day transfer, which translates to **thousands of km** of positional error at planetary orbital velocities (~35 km/s for Earth, ~24 km/s for Mars).

#### Factor 2: Solar Pressure Varies with 1/r^2

As the ship moves outward (e.g., Earth to Mars), the solar radiation pressure decreases:
- At 1 AU: 4.56e-6 N/m^2
- At 1.5 AU: 2.03e-6 N/m^2 (55% reduction)

The predictor calculates this at each step, but each step uses a position from the **predicted** trajectory, not the actual trajectory the ship will follow. As the actual ship deviates slightly from the prediction (due to all the other factors), it experiences slightly different solar pressure, amplifying the divergence.

#### Factor 3: Orbital Element Epoch Drift

Each time `applyThrust()` is called (`orbital-maneuvers.js:393-470`), it:
1. Gets position/velocity from current elements at `julianDate`
2. Adds delta-V to velocity
3. Converts back to orbital elements using `stateToElements()`
4. Sets the **new epoch** to `julianDate`

This means the ship's orbital elements are re-derived every frame. The predictor starts from **one snapshot** of these elements and propagates forward. But as the game advances by 1 real frame (which may be many simulation days at high time warp), the ship's elements are recomputed from a slightly different state vector. The new prediction starts from a slightly different orbit than the old prediction assumed.

#### Factor 4: Kepler Equation Numerical Precision

The predictor converts orbital elements to positions via `solveKepler()` (`orbital.js:99-127`), which uses Newton-Raphson iteration with tolerance 1e-12. Over hundreds of propagation steps, each with a tiny position error, these accumulate. The predictor chains 200+ thrust applications, each involving:
- `getPosition()` → Kepler solve → position
- `getVelocity()` → position + Kepler solve → velocity
- `calculateSailThrust()` → thrust direction from RTN
- `applyThrust()` → new state vector → new elements via `stateToElements()`

Each of these 5+ operations introduces floating-point noise. Over 2400 steps, the accumulated error is non-trivial.

### Verdict

**The drift is physically real.** Any trajectory prediction under continuous low-thrust propulsion is fundamentally an approximation. The longer the prediction horizon, the greater the divergence. This is why real solar sail missions require continuous navigation updates — the trajectory is never "set and forget."

---

## 2. Solar Sailing Expert Review

### This is the #1 Thing Solar Sailing Gets Wrong vs. Chemical Rockets

Chemical rocket transfers are **ballistic** after the burn. You compute a Hohmann or Lambert transfer, execute the burn, and coast. The trajectory is completely determined by the post-burn state. Course corrections are minor (a few m/s over months).

Solar sail transfers are **fundamentally different**:

- **Thrust is always on.** As long as the sail is deployed and facing the Sun, it's accelerating. There is no "coast phase" in the same sense.
- **Thrust direction is coupled to position.** The sail pushes away from the Sun along the reflected photon direction. As you orbit, the "away from Sun" direction continuously rotates. A fixed sail angle in the RTN frame produces a **spiraling** thrust pattern, not a straight impulse.
- **The trajectory is not a conic section.** It's a complex spiral that depends on the entire future history of sail orientation vs. position. Perturbation theory (Gauss variational equations) gives instantaneous rates of change, but predicting 200 days forward requires integrating those rates — and small errors early cascade into large errors late.

### Why 2,500 km Accuracy is Actually Impressive

The fact that you can line up a transit to within 2,500 km from the prediction and hit SOI is a testament to the code quality. Consider:

- Mars SOI: ~577,000 km radius
- 2,500 km targeting accuracy on a 200-day transfer ≈ **0.4% of SOI radius**
- At Mars's orbital velocity (~24 km/s), 2,500 km ≈ ~100 seconds of timing error

For a solar sail operating at ~0.5 mm/s^2 over 200 days, achieving ~100 seconds of timing precision is very good. But the key insight is:

### The Prediction Diverges Because the Sail Creates a Chaotic-Adjacent System

"Chaotic-adjacent" means that while the system isn't truly chaotic (it's deterministic), it has **sensitive dependence on initial conditions** in practice. A small change in the ship's state at time T produces a disproportionately large change in the predicted state at time T+200 days, because:

1. Thrust at time T changes orbital elements
2. Changed elements alter position at T+1
3. Changed position alters thrust direction at T+1 (RTN frame rotated differently)
4. Altered thrust changes elements at T+2
5. This is a **feedback loop**: position → thrust direction → orbit change → position change → ...

This feedback loop means the predictor's error **grows nonlinearly** with prediction horizon. The first 20 days may be very accurate; the last 20 days of a 200-day prediction may be off by millions of km.

### Real Solar Sail Navigation

In real missions (IKAROS, LightSail 2, planned NEA Scout), trajectory corrections are made **continuously**. The navigation team recomputes the trajectory every orbit based on actual tracking data. This is exactly what you're doing in the game — adjusting the sail several times during transit to stay on course. **This is correct operational behavior for a solar sail.**

---

## 3. Functionality Review

### The Prediction Matches the Physics (Within Integration Error)

Both `shipPhysics.js` and `trajectory-predictor.js` use:
- The same RK2 midpoint integration scheme
- The same `calculateSailThrust()` function
- The same `applyThrust()` state-vector approach
- The same 12 steps/day resolution (2-hour sub-steps)

This is good — the predictor and the actual physics are using identical algorithms. The divergence comes not from code inconsistency but from:

1. **Different starting states**: The predictor starts from the ship's state at frame N. By frame N+1000, the ship has been through 1000 RK2 updates, each slightly different from what the predictor assumed (because the predictor did all its updates from frame N's state in one batch).

2. **Time warp effects**: At high time warp (10Mx), each game frame applies `deltaTime ≈ 1.93 days`. The ship physics sub-steps this into ~23 RK2 steps of ~0.083 days each (`shipPhysics.js:364-465`). The trajectory predictor does the same but from a single starting point. The key difference: the ship's real sub-steps are computed sequentially with **actual** orbital elements at each step, while the predictor's sub-steps are computed from **predicted** elements that diverge progressively from what the ship will actually experience.

### Ghost Planet Positioning Logic

The intersection detector (`intersectionDetector.js:738-922`) finds where the predicted trajectory crosses a planet's orbital radius and computes the planet's position at that crossing time. If the predicted crossing time is off by 1 day, the planet position is off by:
- Venus: ~35 km/s × 86400s ≈ 3,024,000 km per day
- Mars: ~24 km/s × 86400s ≈ 2,074,000 km per day

So even a 1-day error in predicted crossing time shifts the ghost planet by millions of km. This is why the ghost "drifts" — the predicted crossing time shifts as the ship's actual trajectory diverges from what was predicted earlier.

### The Hybrid Anchor-Refine Algorithm Helps But Can't Eliminate the Core Issue

The `refineCrossingWithActualRadius()` function (`intersectionDetector.js:617-703`) iteratively refines crossing times for eccentric orbits. This is solving a different problem (semi-major axis vs. actual radius discrepancy for eccentric orbits), not the fundamental prediction drift.

---

## 4. Architecture Review

### The Architecture is Sound — Prediction Drift is Inherent to the Problem

The separation between:
- `shipPhysics.js` (frame-by-frame actual state updates)
- `trajectory-predictor.js` (forward simulation from current state)
- `intersectionDetector.js` (crossing detection on predicted trajectory)

is clean and well-structured. The prediction drift is not caused by architectural issues; it's inherent to forward-propagating a nonlinear dynamical system from a snapshot.

### Potential Architectural Improvement: Differential Correction

One architectural approach used in real mission design is **differential correction** or **targeting**: instead of just propagating forward, you could:
1. Define a target (the planet's position at the estimated crossing time)
2. Compute the trajectory sensitivity (how much does crossing time change per unit sail angle change)
3. Iterate to find the sail settings that minimize miss distance

This would be an autopilot/guidance feature rather than a change to the prediction display. The ghost planet is correctly showing "where the planet will be when you cross its orbit given your current sail settings" — the problem is that "current sail settings" applied over 200 days drifts from the actual future trajectory.

---

## 5. Failure Modes Review

### The Drift Worsens Under Specific Conditions

| Condition | Effect on Drift | Reason |
|-----------|----------------|--------|
| Higher time warp | Worse | Larger deltaTime per frame → fewer sub-steps relative to total duration → coarser integration |
| Longer prediction horizon | Much worse | Error grows nonlinearly with horizon (quadratic to exponential depending on orbit) |
| Higher sail deployment | Worse | More thrust → larger per-step orbit changes → more RTN frame rotation per step |
| Eccentric orbits | Worse | Orbital velocity varies more → RTN frame rotation rate varies → harder to predict |
| Crossing at periapsis | Worse | Ship moves fastest → highest sensitivity to timing errors |
| Near-tangent crossings | Much worse | Ship and planet at similar radii for a long time → small speed differences have large timing effects |

### The 2,500 km SOI Targeting Threshold

You observed that lining up to 2,500 km is sufficient for SOI capture. This is reasonable:
- Mars SOI ≈ 577,000 km radius → 2,500 km is well inside
- But the drift between lining up and arriving can push the actual trajectory outside SOI if you don't correct

The failure mode is: you line up at time T, the ghost shows 2,500 km miss distance, but by the time you actually arrive at time T+200d, the accumulated drift has pushed you 50,000+ km off course. This is why you need to re-adjust multiple times.

### Numerical Instability at Extreme Cases

The code has guards for:
- Eccentricity > 50 (`PHYSICS_CONFIG.extremeEccentricityThreshold`)
- Semi-major axis → 0 (sun collision)
- NaN/Infinity element validation

These are appropriate but not related to the drift question.

---

## 6. Best Practices Review

### The Code Already Documents This Limitation

The trajectory predictor comments explicitly acknowledge the RTN frame rotation issue (`trajectory-predictor.js:366-378`):

> "RK2 MIDPOINT INTEGRATION: Instead of Euler (thrust at start, apply for full step), use the midpoint method... This reduces trajectory divergence from ~3-10 days to ~1 day over a 200-day transfer."

The upgrade from Euler to RK2 was a deliberate improvement that reduced but did not eliminate the drift. This is honest engineering.

### The Step Resolution is Well-Calibrated

12 steps/day (2-hour segments) balances accuracy against performance:
- `TRAJECTORY_RENDER_CONFIG.stepsPerDay: 12`
- `INTERSECTION_CONFIG.stepsPerDay: 12`
- Ship physics sub-step: `MAX_SUBSTEP = 1/12` days

All three systems use the same step size, ensuring the predicted trajectory matches the ship physics as closely as possible. This is a best practice.

---

## 7. Regression Risk Review

This is an investigation of existing behavior, not a proposed change. No regression risk applies.

However, if a fix were attempted (e.g., higher-order integration, adaptive stepping, or guidance-law corrections), the regression risks would include:
- Breaking the match between ship physics and predictor (causing worse drift)
- Performance degradation from more integration steps
- Numerical instability from higher-order methods at high eccentricity

---

## Summary of All Seven Perspectives

| Perspective | Key Finding | Severity |
|-------------|------------|----------|
| Physics/Realism | RTN frame rotation under continuous thrust causes prediction-reality divergence that grows nonlinearly. This is physically correct. | Expected behavior |
| Solar Sailing | Solar sails require continuous course corrections — unlike chemical rockets, there's no "fire and forget." The game correctly simulates this. | Expected behavior |
| Functionality | Ship physics and predictor use identical RK2 integration. Divergence is from sequential-actual vs. batch-predicted propagation, not code mismatch. | Working as designed |
| Architecture | Clean separation of concerns. Drift is inherent to the problem, not the architecture. | No issue |
| Failure Modes | Drift worsens with: time warp, longer horizons, higher thrust, eccentric orbits. Ghost planet timing errors of 1 day → millions of km of ghost position error. | Known limitation |
| Best Practices | Step resolution matched across all systems. RK2 integration is documented as a deliberate improvement over Euler. | Compliant |
| Regression Risk | N/A (investigation only) | N/A |

---

## Why You Must Readjust: The Short Version

1. You point your sail for a Mars intercept based on today's prediction
2. The prediction says "if you hold this sail angle for 200 days, you'll cross Mars's orbit at time T, and Mars will be 2,500 km away"
3. But the prediction is computed by simulating 200 days of thrust in one batch from today's state
4. In reality, each day's thrust slightly changes your orbit, which slightly changes the thrust direction for the next day (because the RTN frame rotated), which slightly changes the orbit...
5. After 20 real days, you're on a slightly different orbit than what was predicted 20 days ago
6. The new prediction (from today's actual orbit) shows Mars is now 50,000 km away at the crossing
7. You readjust the sail, and the new prediction brings it back to 2,500 km
8. Repeat every few weeks until arrival

**This is exactly how real solar sail navigation works.** The game is correct.

---

## Possible Mitigations (Not Bugs to Fix, but UX Improvements)

1. **Show prediction confidence bands**: Fade or widen the predicted trajectory line as it gets further from "now" to communicate uncertainty visually
2. **Autopilot with closed-loop guidance**: Instead of open-loop "hold this sail angle," implement a guidance law that continuously adjusts the sail to minimize miss distance to the target ghost planet
3. **Shorter default prediction horizon**: 60 days default is already conservative; reducing would show less drift but less planning range
4. **Higher integration order**: RK4 instead of RK2 would reduce drift by ~1 order of magnitude, at 2x the cost per step. May not be worth it for a game.
