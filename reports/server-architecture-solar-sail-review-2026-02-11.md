# Server-Side Architecture Review: Solar Sail Physics
## Expert Perspective: Solar Sailing Specialist
**Date:** 2026-02-11
**Reviewer Role:** Solar Sailing Expert -- catching errors from treating the solar sail like a conventional spacecraft

---

## Executive Summary

Moving solar sail physics to the server is fundamentally different from moving chemical rocket physics to a server. Chemical rockets fire discrete burns that can be validated as events. A solar sail is **always thrusting** whenever light hits it. This means the server cannot simply validate "burn commands" -- it must **continuously integrate** a low-thrust trajectory in real time (or simulated time). This report analyzes seven aspects of this migration from the perspective of continuous-thrust propulsion physics.

---

## 1. The Continuous Thrust Problem

### What Makes Solar Sails Different

Chemical rockets produce impulsive delta-V events. Between burns, the ship follows a ballistic (Keplerian) arc that can be computed analytically. A server only needs to validate the burn parameters and then propagate the orbit analytically until the next burn.

A solar sail **never stops thrusting** (unless deployment is 0%). Sunlight continuously pushes the sail. The thrust magnitude varies continuously with:
- Distance from the Sun (inverse square: `P(r) = 4.56e-6 / r^2`)
- The sail's orientation (yaw, pitch) relative to the RTN frame, which itself rotates as the ship orbits
- The RTN frame changes as the orbit changes from the thrust

This creates a **coupled feedback loop**: thrust modifies the orbit, which modifies the RTN frame, which modifies the thrust direction, which modifies the orbit. There is no closed-form solution. You must numerically integrate.

### Current Implementation

The codebase currently has **two different integration methods** that are supposed to match:

| System | Method | Representation | Step Size | Location |
|--------|--------|---------------|-----------|----------|
| `shipPhysics.js` (actual physics) | RK2 midpoint on **orbital elements** | Keplerian elements modified via `applyThrust()` | 2-hour sub-steps (1/12 day) | `shipPhysics.js:364-464` |
| `trajectory-predictor.js` (prediction) | RK4 on **state vectors** | Cartesian position + velocity via `integrateStateRK4()` | Adaptive (duration/steps) | `trajectory-predictor.js:466-517` |

### Critical Finding: Integration Method Mismatch Already Exists

The comments in `shipPhysics.js:352` say "Matches the trajectory predictor's RK2 midpoint integration method" -- but **the trajectory predictor has been upgraded to RK4 state-vector integration** (`trajectory-predictor.js:293-297`). The actual physics still uses RK2 on elements. This means:

1. The ship's actual trajectory (RK2 element-based) **already diverges** from the predicted trajectory (RK4 state-vector-based)
2. Ghost planets/encounter markers are positioned based on the RK4 prediction, not the RK2 actual physics
3. The divergence grows with time and is worst for high-thrust scenarios (multiple sails, close to Sun)

### Server Architecture Recommendation

**The server MUST use state-vector integration (the `integrateStateRK4` approach), not the element-based RK2 approach.** Reasons:

1. **State vectors avoid roundtrip errors.** The current `shipPhysics.js` approach does: elements -> position/velocity -> compute thrust -> apply delta-V -> convert back to elements. Each `stateToElements()` call introduces floating-point errors, especially near singularities (circular orbits where e~0, equatorial orbits where i~0). State-vector integration avoids this entirely.

2. **RK4 is the better integrator.** RK4 has O(dt^4) local error vs O(dt^2) for RK2. For the same 2-hour step size, RK4 is ~100-1000x more accurate. The trajectory predictor was upgraded to RK4 for good reason.

3. **One integration method, one source of truth.** The server should use `integrateStateRK4()` as the authoritative physics. Store ship state as (x, y, z, vx, vy, vz) on the server, not as orbital elements. Convert to elements only when needed for display purposes.

4. **Step size matters enormously for solar sails.** At 2-hour steps, the RTN frame can rotate significantly for close-in orbits. At Mercury's orbit (~0.387 AU), the orbital period is ~88 days, meaning the RTN frame rotates ~0.98 degrees per 2-hour step. At 0.1 AU (a solar sail can spiral this close), the period is ~11.5 days and the frame rotates ~7.5 degrees per step. RK4 handles this much better than RK2.

**Concrete server design:**
```
Server State per Ship:
  - state: {x, y, z, vx, vy, vz} in AU, AU/day (heliocentric)
  - sail_inputs: {yaw, pitch, deployment} (player-controlled)
  - ship_config: {area, reflectivity, condition, mass, sailCount} (server-authoritative)
  - soi_state: {currentBody, isInSOI}
  - last_update_time: Julian date

Server Tick:
  1. Accept sail input updates from client
  2. For each ship: integrateStateRK4(state, sail, dt, mass, mu)
  3. Broadcast updated states to clients
```

---

## 2. Client Prediction and Server Divergence

### The Core Tension

The client needs to show a smooth, responsive trajectory prediction *before* the server confirms the state. But if physics runs on the server, the client's prediction will inevitably diverge from the server's authoritative state.

### Solar Sail Specifics That Make This Harder

For a chemical rocket game, client prediction is easy: between burns, the orbit is a known Keplerian ellipse. The client can compute it analytically with zero divergence.

For a solar sail, there is **no analytical solution** between control changes. Even if the player holds yaw/pitch/deployment constant, the ship spirals (not Keplerian), and the spiral depends on the exact RTN frame rotation at each integration step. Two integrators with slightly different states will diverge continuously.

### Divergence Sources

| Source | Magnitude | Solar Sail Impact |
|--------|-----------|-------------------|
| Floating point differences (different JS engines, client vs server language) | ~1e-15 per step | Accumulates over thousands of integration steps in long predictions |
| Time discretization (client frame rate vs server tick rate) | Depends on sync frequency | With 2-hour sub-steps, a 1-frame timing offset at 60 fps = ~16ms error per step |
| Sail input latency (client changes yaw, server doesn't know for ~50-200ms) | Up to 200ms of "wrong" thrust direction | At ~2.5 mm/s^2 acceleration, 200ms = 0.5 mm/s delta-V error per change. Small per-event, but adds up with rapid adjustments |
| RTN frame rotation | Continuous, cannot be eliminated | The RTN frame is derived from instantaneous position and velocity. Small state differences cause different RTN frames, causing different thrust directions, causing more state divergence (positive feedback loop) |

### Recommendation: Client Predicts Locally, Server Reconciles

1. **Client runs its own trajectory predictor** using the same `integrateStateRK4()` code (shared library). This gives immediate visual feedback when the player adjusts sail settings.

2. **Server sends authoritative state updates** at regular intervals (e.g., every 1-5 seconds of real time, or every N simulation ticks). The client smoothly interpolates from its predicted state to the server's authoritative state.

3. **Snap threshold**: If client and server positions diverge by more than a threshold (e.g., 0.001 AU ~ 150,000 km), hard-snap the client. Below that, lerp smoothly over ~0.5 seconds.

4. **Trajectory prediction remains client-only.** The server does NOT need to run the trajectory predictor (it is purely visual). The client uses its local copy of the ship state (reconciled with server) as the starting point for prediction. This is critical for performance -- the prediction can run up to 8760 steps (5 years at 12 steps/day) and should not burden the server.

5. **Encounter markers may temporarily disagree with actual ship path.** This is acceptable -- the encounter markers are a planning tool, not a guarantee. When the server reconciles the state, the client re-runs prediction and markers self-correct.

### Critical: Share the Integration Code

The most important thing is that **client and server use literally the same integration function.** Since this is a vanilla JS project, the server should also be Node.js (or at minimum use the exact same `integrateStateRK4()`, `calculateSailThrustFromState()`, and `gravitationalAcceleration()` functions). If you rewrite the physics in a different language (Python, Rust, Go), you WILL get different floating-point results and the trajectories will diverge. This is much worse for solar sails than rockets because the divergence compounds continuously.

---

## 3. Sail Control Input Validation

### Inputs the Server Must Accept

The player controls exactly three values:
- **Yaw**: sail angle in the orbital plane, range [-90deg, +90deg] ([-pi/2, pi/2] radians)
- **Pitch**: sail angle out of the orbital plane, range [-90deg, +90deg]
- **Deployment**: sail area percentage, range [0%, 100%]

Plus occasional discrete events:
- **Thruster burns**: direction (prograde/retrograde) and magnitude (km/s), constrained by remaining delta-V

### Validation Rules

**Value clamping (already done client-side in `ships.js:121-164`):**
```
yaw:        clamp(-pi/2, pi/2)
pitch:      clamp(-pi/2, pi/2)
deployment: clamp(0, 100)
```

**Rate limiting -- THIS IS THE CRITICAL NEW VALIDATION:**

Currently, the client can change sail settings instantaneously. In real solar sailing, reorienting a 3 km^2 sail takes time. More importantly for anti-cheat, rate limiting prevents a cheater from:

1. **Oscillating the sail at physically impossible frequencies** to extract more energy than continuous thrust allows. A cheater could, in theory, oscillate yaw between +35deg and -35deg at very high frequency to try to get thrust in both prograde and retrograde directions within a single integration step.

2. **Deployment flickering** to game the cos^2(theta) dependence. Rapidly toggling between 0% and 100% deployment could create integration artifacts if the time step doesn't resolve the toggling.

**Recommended rate limits:**

| Parameter | Max Rate | Rationale |
|-----------|----------|-----------|
| Yaw | 10 deg/second of real time | A 3 km^2 sail has enormous angular inertia. 10 deg/s is generous. |
| Pitch | 10 deg/second of real time | Same rationale as yaw. |
| Deployment | 25%/second of real time | Sail deployment involves unfurling or reeling physical material. |

**Key insight: Rate limits must be in REAL time, not game time.** If the game is running at 1,000,000x time warp, the player cannot physically move the sail faster than real-time UI interaction allows. The server should:
1. Receive (yaw, pitch, deployment) inputs with timestamps
2. Verify that the change from the last accepted input does not exceed the rate limit
3. If it does, clamp the change to the maximum allowed rate
4. Apply the clamped value

**What the server must NOT accept from the client:**
- Sail area (fixed per ship config: 3,000,000 m^2 default)
- Reflectivity (fixed: 0.9)
- Condition (server-managed, could degrade over time as a game mechanic)
- Ship mass (fixed: 10,000 kg)
- Sail count (server-managed, could be an upgrade mechanic)
- Orbital elements or state vectors (server computes these)
- Julian date / simulation time (server is the time authority)

---

## 4. Integration Matching

### The Problem

The trajectory predictor (client-side visual) and the actual physics (moving to server) MUST produce identical results for the same inputs, or:
- Encounter markers show ghosts at wrong positions
- The predicted path (green line) diverges from where the ship actually goes
- Players cannot trust the visual planning tools

### Current State: Already Broken

As noted in Section 1, the game **already has this problem**. `shipPhysics.js` uses RK2 on orbital elements; `trajectory-predictor.js` uses RK4 on state vectors. The comments claim they match, but they don't.

### The Fix (Which Server Migration Enables)

Moving to server-side physics is an opportunity to **unify the integration method.** Here is the recommended approach:

1. **Server uses `integrateStateRK4()` on state vectors** as the authoritative physics.

2. **Client trajectory predictor already uses `integrateStateRK4()` on state vectors.** No change needed there.

3. **Remove the RK2 element-based integration from `shipPhysics.js` entirely.** It becomes dead code once the server handles physics.

4. **Both use the same step size.** The trajectory predictor uses `TRAJECTORY_RENDER_CONFIG.stepsPerDay` (12 steps/day = 2-hour steps). The server should use the same base step size. This means:
   - Server physics tick = 2 hours of game time per integration step
   - At 1x real time: server processes ~0.000278 game-days per real second, so one integration step covers ~7200 real-time seconds. The server barely does any work.
   - At 1,000,000x: server processes ~11.57 game-days per real second, so ~139 integration steps per real second. Very manageable.
   - At 500,000,000x: server processes ~5787 game-days per real second, so ~69,444 integration steps per real second. This is the upper bound and is still computationally feasible for a single ship (each step is ~10 float operations).

5. **Exact floating-point matching**: If client and server both run JavaScript (Node.js), and use the identical `integrateStateRK4()` function with the same double-precision IEEE 754 arithmetic, the results should be bit-for-bit identical for the same inputs. This is the strongest argument for keeping the server in JS/Node.

### Step Size and Accuracy Table

| Integration Step | RTN Rotation at 1 AU | RTN Rotation at 0.3 AU | Position Error per Year |
|------------------|----------------------|------------------------|------------------------|
| 2 hours (current) | 0.082 deg | 0.49 deg | ~100 km (RK4) |
| 6 hours | 0.25 deg | 1.47 deg | ~1,000 km (RK4) |
| 1 day | 0.99 deg | 5.9 deg | ~50,000 km (RK4) |

2-hour steps are well-suited for solar sail accuracy. Do not increase the step size to save server CPU -- the error grows rapidly.

---

## 5. Time Warp and Sail Thrust

### The Problem

The game supports time warp from 1x to 500,000,000x. At extreme time warps, the ship moves years per real-time second. The server must compute thousands of integration steps per second.

### Current Client-Side Approach

From `shipPhysics.js:366-369`:
```javascript
const MAX_SUBSTEP = 1 / 12;  // 2 hours in days
const MAX_SUBSTEPS = 50;     // Cap for extreme time warps
const numSubSteps = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(deltaTime / MAX_SUBSTEP)));
```

At 500M x time warp: deltaTime per frame ~ 96.5 days. With 2-hour sub-steps, that needs 1158 sub-steps, but the cap is 50. **This means at extreme time warps, the physics is already using ~2-day steps, which is terrible for solar sail accuracy.** The RTN frame rotates ~2 degrees per step at 1 AU, and the trajectory will diverge significantly from the predictor.

### Server Design Options

**Option A: Real-Time Simulation with Cached Results (Recommended)**

The server runs the simulation at its own pace and caches results. Clients request state at arbitrary times.

- Server simulation clock advances at `server_tick_rate * time_warp_multiplier` game-time per tick
- Server tick rate: 30-60 Hz (real time)
- At each tick, integrate `N = ceil(game_time_per_tick / 0.0833)` steps using RK4
- Store state snapshots periodically (e.g., every 10 game-days)
- Clients can request "what is the state at Julian date X?" and the server interpolates between cached snapshots

**Scaling analysis:**
| Time Warp | Game-days/real-sec | RK4 Steps/real-sec | CPU per Ship |
|-----------|-------------------|-------------------|-------------|
| 1x | 1.16e-5 | ~0.0001 | Negligible |
| 10,000x | 0.116 | ~1.4 | Negligible |
| 1,000,000x | 11.57 | ~139 | ~0.1 ms/sec |
| 100,000,000x | 1157 | ~13,889 | ~10 ms/sec |
| 500,000,000x | 5787 | ~69,444 | ~50 ms/sec |

At 500M x, a single CPU core can handle ~20 ships at full utilization. This is perfectly acceptable for a small multiplayer game.

**Option B: On-Demand Fast-Forward (Not Recommended)**

The server only integrates when the client requests it ("advance my ship to time T"). Problems:
- Allows timing attacks (request states at advantageous times)
- Client controls the simulation pace, which defeats the anti-cheat purpose
- Server has no authoritative state between requests

### The 50 Sub-Step Cap Must Go

On the server, there is no reason to cap sub-steps. The cap exists in the client to prevent frame drops. The server can take as long as it needs per tick. At 500M x time warp, the server should run all ~1158 sub-steps per frame, not just 50. This eliminates the accuracy degradation at high time warps.

### Solar Sail Specific Concern: Thrust Never Stops During Fast-Forward

When fast-forwarding a chemical rocket, you can analytically propagate the ballistic arc between burns -- instant computation regardless of time span. For a solar sail, **every second of fast-forward requires numerical integration because thrust is always on.** There is no shortcut. The server must do the work.

The only optimization: if deployment is 0% (sail retracted), the orbit is Keplerian and can be propagated analytically. The server should detect this case:

```
if (deployment == 0 && no_thruster_burn_pending):
    propagate analytically (instant, any time span)
else:
    integrate numerically (step by step)
```

This is a huge optimization -- players often retract sails while waiting for transfer windows.

---

## 6. Sail State Cheating Vectors

### Fixed Parameters (Server-Authoritative)

| Parameter | Value | Why It Must Be Server-Side |
|-----------|-------|---------------------------|
| Sail area | 3,000,000 m^2 | Directly multiplies thrust. A cheater doubling area doubles acceleration. |
| Reflectivity | 0.9 | Directly multiplies thrust. Setting to 1.0 gives ~11% more thrust. |
| Condition | 100% | Multiplies effective area. A degradation mechanic would need server authority. |
| Ship mass | 10,000 kg | Inversely affects acceleration. Halving mass doubles acceleration. |
| Sail count | 1-20 | Multiplies thrust (with diminishing returns via `SAIL_MASS_PER_UNIT`). |
| Solar pressure constant | 4.56e-6 N/m^2 | Fundamental physical constant. Cannot be client-trusted. |
| Gravitational parameter | MU_SUN | Fundamental constant. |
| Thruster delta-V remaining | 0-50 km/s | Server must track fuel consumption. Client cannot be trusted to deduct correctly. |

### Player-Controlled Parameters (Validated by Server)

| Parameter | Range | Server Validation |
|-----------|-------|-------------------|
| Yaw angle | [-90deg, +90deg] | Clamp + rate limit |
| Pitch angle | [-90deg, +90deg] | Clamp + rate limit |
| Deployment % | [0%, 100%] | Clamp + rate limit |
| Thruster burn command | prograde/retrograde, up to burn size | Verify delta-V remaining >= requested amount |

### Subtle Cheating Vectors Specific to Solar Sails

**1. RTN Frame Manipulation**

The thrust direction is computed from the RTN frame, which depends on the ship's instantaneous position and velocity. A cheater who can modify their reported position or velocity will get a different RTN frame, causing thrust to be applied in a different (more favorable) direction.

**Mitigation:** Server computes RTN frame from its own authoritative state. Client never sends position/velocity.

**2. Thrust Direction Reversal**

The sail can only push *away* from the Sun-line. The cos^2(yaw) * cos^2(pitch) factor in the thrust formula ensures thrust goes to zero as the sail turns edge-on (90 degrees). A cheater cannot get thrust *toward* the Sun from a solar sail.

**Mitigation:** The `calculateSailThrustFromState()` function naturally enforces this through the cos^2 factors. The server computes thrust direction; the client does not.

However, there is a **subtle issue in the current code**: the thrust *direction* vector in `getSailThrustDirection()` (line 112-176 of `orbital-maneuvers.js`) does not explicitly enforce that the thrust component along the Sun-line is non-negative. The yaw angle can range from -90 to +90, and the resulting thrust direction `d = cos(pitch) * [cos(yaw) * R + sin(yaw) * T] + sin(pitch) * N` has a radial component of `cos(yaw) * cos(pitch)`, which is always non-negative for |yaw| <= 90 and |pitch| <= 90. So the physics is correct -- but the server should verify that client-supplied yaw and pitch are within bounds, because values outside [-90, +90] could produce negative radial thrust (physically impossible for a sail).

**3. Integration Step Manipulation**

A cheater who can control the integration step size could potentially extract more or less energy from the sail. Smaller steps with the same thrust magnitude could yield slightly different total delta-V over time due to numerical integration properties.

**Mitigation:** Server controls the step size (fixed at 2-hour intervals). The client has no influence on how the server integrates.

**4. Time Manipulation**

If the client can influence the simulation time, it could skip unfavorable orbital positions (e.g., when the sail is poorly oriented relative to the desired thrust direction). Solar sails are highly sensitive to orbital position because thrust efficiency varies around the orbit.

**Mitigation:** Server is the sole time authority. Clients cannot request jumps to specific times.

**5. Cheat Codes (Orbit Nudge)**

The current client has "cheat codes" (`,` and `.` keys) that nudge the ship along its orbit when sails are at 0% deployment. These must be removed or made server-side commands:
```
// From CLAUDE.md:
// , / . - Nudge ship backward/forward 1 day along orbit
// < / > - Nudge ship backward/forward 10 days along orbit
```

These directly modify orbital elements (mean anomaly), bypassing physics entirely. The server must either disable these or implement them as server commands with appropriate validation.

---

## 7. Solar Sail Specific Server Concerns

### 7.1 The Sail-Can-Only-Push-Away-From-Sun Constraint

This is the most fundamental physical constraint of solar sailing. The sail reflects photons; photon pressure can only push the sail away from the light source. You cannot "tack into the wind" like a terrestrial sailboat -- there is no medium to provide a reaction force.

**How the current code enforces it:**
The thrust magnitude uses `cos^2(yaw) * cos^2(pitch)`, which is always >= 0. The thrust *direction* has a radial component of `cos(yaw) * cos(pitch) * R_hat`, where R_hat points away from the Sun. For |yaw| <= pi/2 and |pitch| <= pi/2, this is always non-negative.

**Server concern:** This is automatically enforced by the physics math as long as yaw and pitch are clamped to [-pi/2, pi/2]. The server validation in Section 3 handles this. No additional check is needed.

### 7.2 RTN Frame Computation in Planetocentric SOI

When the ship is inside a planetary SOI, the orbital elements and position/velocity are relative to the planet, not the Sun. But sail thrust comes from the **Sun**, so the thrust direction must be computed in the **heliocentric** frame.

The current code handles this correctly (see `shipPhysics.js:316-341` and `trajectory-predictor.js:476-491`): it converts planetocentric state to heliocentric before computing sail thrust.

**Server concern:** The server must do the same transformation. This adds complexity but is straightforward. The key is that `calculateSailThrustFromState()` expects heliocentric coordinates, so the server must always pass heliocentric state to the thrust calculator, even when the primary integration is in a planetocentric frame.

### 7.3 SOI Transitions with Continuous Thrust

SOI transitions are already complex for ballistic trajectories (patched conics). For solar sails, they are harder because:

1. The ship is always thrusting, so the approach trajectory is not a simple conic
2. The thrust direction changes as the ship crosses the SOI boundary (RTN frame changes because the reference body changes)
3. The cooldown mechanism (`PHYSICS_CONFIG.soiTransitionCooldown: 0.1` days) must be server-enforced to prevent rapid SOI boundary oscillation

**Server concern:** SOI transitions must be atomic server operations. The server should:
1. Detect SOI entry/exit (using the existing `checkSOIEntry`/`checkSOIExit` with trajectory crossing check)
2. Convert state vectors between frames (`helioToPlanetocentric`/`planetocentricToHelio`)
3. Enforce cooldown (0.1 game-days)
4. Broadcast the frame change to the client so it can update its visual elements

### 7.4 Degenerate Orbit Protection

Solar sail thrust can create degenerate orbits that crash the integrator:
- Eccentricity approaching 1.0 (parabolic singularity) -- the code already nudges away (`soi.js:288-290`)
- Very small semi-major axis (ship spiraling into the Sun) -- clamped at `1e-6 AU`
- Very large semi-major axis (escaping the solar system) -- clamped at `1000 AU`
- Extreme eccentricity from planetary flybys (`e > 50`) -- triggers linear interpolation fallback

**Server concern:** All these guards must be replicated on the server. The `TRAJECTORY_ROBUSTNESS` config and the clamping in `stateToElements()` must be part of the server physics. Since the recommendation is to use state-vector integration (not element-based), some of these guards change form:
- Instead of clamping semi-major axis, check that `|state.x|, |state.y|, |state.z| < 1000 AU` (boundary check)
- Instead of clamping eccentricity, check that velocity doesn't exceed escape velocity by an unreasonable factor
- The `MIN_HELIOCENTRIC_RADIUS` (0.01 AU) and `MAX_HELIOCENTRIC_RADIUS` (50 AU) checks should be server-enforced boundaries

### 7.5 The Optimal Sail Angle Is Not Trivially Verifiable

For a chemical rocket, you can check if a burn is "reasonable" -- you know the delta-V budget and can verify the burn direction. For a solar sail, the "optimal" yaw angle for orbit raising is ~35.26 degrees (`arctan(1/sqrt(2))`), but:

- The actual optimal angle varies with orbital position
- Different mission objectives require different angles
- A player might intentionally use "non-optimal" angles (e.g., inclination change, orbit lowering)

**This means the server CANNOT validate sail inputs by checking if they are "reasonable" or "optimal."** The server can only validate that inputs are within physical bounds ([-90, +90] degrees) and change rate limits. Any angle within those bounds is a valid player choice. This is the correct approach -- the server enforces physics, not strategy.

---

## Summary of Recommendations

### Highest Priority

1. **Unify integration method.** Server and client trajectory predictor should both use `integrateStateRK4()` on state vectors. Remove the RK2 element-based approach from actual physics.

2. **State-vector representation on server.** Store ship state as `{x, y, z, vx, vy, vz}`, not as orbital elements. Convert to elements only for display.

3. **Server is sole authority for:** ship mass, sail area, reflectivity, condition, sail count, solar pressure constant, gravitational parameters, simulation time, thruster fuel remaining.

4. **Client sends only:** yaw, pitch, deployment, thruster burn commands. Server validates ranges and rate limits.

### Medium Priority

5. **Share integration code between client and server** (identical JS functions) to minimize floating-point divergence.

6. **Remove the 50 sub-step cap on the server.** Compute all necessary steps at the correct 2-hour resolution regardless of time warp speed.

7. **Optimize 0% deployment case.** When sails are retracted, use analytical Keplerian propagation instead of numerical integration. This is the single biggest performance optimization for the server.

8. **Enforce SOI transition cooldown server-side.** Prevent rapid SOI boundary oscillation.

### Lower Priority

9. **Add sail control rate limits** (10 deg/sec real-time for angles, 25%/sec for deployment) to prevent physically impossible sail maneuvers and integration-gaming exploits.

10. **Move cheat codes to server-side commands** or remove them for multiplayer.

11. **Client reconciliation**: implement smooth interpolation from client-predicted state to server-authoritative state, with hard-snap threshold at ~0.001 AU divergence.

---

## Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Integration method mismatch causes trajectory/encounter marker divergence | HIGH | CERTAIN (already happening) | Unify on RK4 state-vector integration |
| Extreme time warp overwhelms server CPU | MEDIUM | LOW | At 500M x, ~70K steps/sec/ship is manageable; cap at a few hundred concurrent ships |
| Floating-point divergence between client prediction and server | MEDIUM | HIGH | Use identical JS code on both sides; reconcile with smooth interpolation |
| SOI transition edge cases cause state corruption | HIGH | MEDIUM | Atomic server-side SOI transitions with cooldown enforcement |
| Cheater modifies sail parameters in flight | HIGH | HIGH (if not mitigated) | Server-authoritative ship config; client only sends 3 control values |
| Sail control rate limit too restrictive for gameplay | LOW | MEDIUM | Tune rate limits through playtesting; err on the generous side initially |

---

## Confidence Rating

**Overall confidence: HIGH** that server-side solar sail physics is feasible and that the recommendations above will produce a correct, cheat-resistant system. The existing codebase is well-structured with clean separation between physics computation and rendering. The `integrateStateRK4()` / `calculateSailThrustFromState()` / `gravitationalAcceleration()` functions are already designed as pure functions with no side effects, making them directly portable to a server context.

The **one concern that warrants immediate attention** regardless of server migration is the integration method mismatch between actual physics (RK2 elements) and trajectory prediction (RK4 state vectors). This is causing encounter marker inaccuracy today.
