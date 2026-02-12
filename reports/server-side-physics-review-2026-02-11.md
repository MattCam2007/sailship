# Server-Side Movement Architecture: Physics Review

**Reviewer**: Physicist Perspective
**Date**: 2026-02-11
**Scope**: Analysis of moving orbital mechanics and ship physics from client to server

---

## Executive Summary

Moving the physics simulation server-side introduces seven categories of technical risk. The most severe are **numerical determinism** (client/server divergence in Kepler solvers), **time-warp integration cost** (97-day frames at 500Mx require efficient batch propagation), and **SOI transition oscillation** (coordinate transform rounding at boundaries). This report quantifies each risk, identifies the exact code paths affected, and provides specific mitigation strategies with formulas and computational cost estimates.

**Overall Confidence**: MODERATE (0.6/1.0). The physics can be moved server-side, but three critical issues must be resolved first: the integration method mismatch between `shipPhysics.js` (RK2 on orbital elements) and `trajectory-predictor.js` (RK4 on state vectors), the Newton-Raphson convergence non-determinism in Kepler's equation, and the 50-substep cap at extreme time warps.

---

## 1. Numerical Determinism

### The Core Problem

The game currently uses two different integration methods in the same codebase:

- **`shipPhysics.js`** (lines 364-464): RK2 midpoint integration applied to *orbital elements* via the `applyThrust()` function. Each substep calls `getPosition()` and `getVelocity()` (Kepler equation solver), applies thrust as delta-v, then calls `stateToElements()` to convert back to orbital elements.

- **`trajectory-predictor.js`** (lines 467-496): RK4 integration on *state vectors* (position + velocity) using `integrateStateRK4()` at `/home/user/sailship/src/js/lib/orbital-maneuvers.js` lines 759-804. This includes gravitational acceleration directly (`-mu * r / r^3`) and never touches orbital elements during propagation.

**These two methods will produce different trajectories for the same initial conditions.** The ship physics accumulates roundtrip error from the elements-to-state-to-elements conversion at every substep (each call to `applyThrust()` at line 394 does `getPosition()` -> delta-v -> `stateToElements()`), while the trajectory predictor integrates state vectors directly.

### Quantifying the Divergence

For a typical solar sail scenario at 1 AU with characteristic acceleration ~2.5e-3 m/s^2:

- **State-vector RK4 local truncation error**: O(dt^5). At dt = 1/12 day (2 hours), this is approximately (1/12)^5 * d^5x/dt^5. For near-circular orbits, the fifth derivative of position is dominated by the mean motion cubed: error ~ n^5 * a * dt^5 / 120 ~ (0.0172)^5 * 1 * (0.0833)^5 / 120 ~ 5.3e-16 AU per step. Negligible.

- **Element-roundtrip RK2 error**: The conversion chain `elements -> state -> delta-v -> stateToElements` introduces error at each step from:
  1. Kepler equation solver tolerance (1e-12 radians, per `solveKepler()` at `/home/user/sailship/src/js/lib/orbital.js` line 99)
  2. Trigonometric function accumulation (6 trig calls in `rotateToEcliptic()`, 6 more in velocity computation)
  3. The `stateToElements()` reconstruction uses `acos(clamp(...))` (line 298, 304, 314, 329 of `/home/user/sailship/src/js/lib/soi.js`) which introduces discontinuous derivatives at the clamp boundaries

  Empirical estimate: ~1e-10 AU per step from roundtrip, accumulating as sqrt(N) * 1e-10 over N steps. Over 200 days at 12 steps/day: sqrt(2400) * 1e-10 ~ 5e-9 AU ~ 750 meters.

### Cross-Platform IEEE 754 Concerns

If the server runs in a different language (Rust, Go, C++), the following operations will produce different last-bit results:

| Operation | Risk Level | Affected Functions |
|-----------|-----------|-------------------|
| `Math.sin()`, `Math.cos()` | HIGH | `solveKepler()`, `rotateToEcliptic()`, `eccentricToTrueAnomaly()` |
| `Math.atan2()` | HIGH | `stateToElements()` true anomaly computation, `getSailThrustDirection()` |
| `Math.sqrt()` | MEDIUM | `meanMotion()`, angular momentum, radius calculations |
| `Math.sinh()`, `Math.cosh()` | HIGH | `solveKeplerHyperbolic()` - only for hyperbolic orbits |
| Fused multiply-add (FMA) | HIGH | Many — compiler may fuse `a*b + c` into single instruction with different rounding |

The Newton-Raphson iteration in `solveKepler()` (lines 99-127 of `/home/user/sailship/src/js/lib/orbital.js`) is especially dangerous: a 1-ULP difference in the initial guess `E = e < 0.8 ? M : Math.PI` can cause the iteration to converge in a different number of steps, producing a result that differs by up to the tolerance (1e-12 radians). For near-parabolic orbits (e ~ 0.95-1.05), the code routes through the universal variable formulation (`propagateStateUniversal()` at line 348), which has its own convergence behavior.

### Recommendation

**Canonical state representation must be state vectors (position + velocity), not orbital elements.** The server should:

1. Store authoritative state as `{x, y, z, vx, vy, vz, mu, epoch}` (Julian date when state was recorded)
2. Integrate using RK4 on state vectors (matching the trajectory predictor, not the ship physics RK2)
3. Use orbital elements only for display purposes (orbit ellipse rendering), derived from state vectors on the client
4. Establish a fixed-point arithmetic library or mandate identical `libm` implementations if cross-platform determinism is required

If the server is also JavaScript (Node.js), use the same V8 engine version as the client to guarantee identical `Math.*` results. This is the simplest path to determinism.

---

## 2. Integration Accuracy and Step Size

### Current Step Budget

The ship physics (`shipPhysics.js` lines 365-368) uses:
```
MAX_SUBSTEP = 1/12  (2 hours in days)
MAX_SUBSTEPS = 50
subDt = deltaTime / numSubSteps
```

At the maximum time warp of 500,000,000x:
```
deltaTime per frame = 500000000 / (86400 * 60) = 96.45 days
numSubSteps = min(50, ceil(96.45 / 0.0833)) = min(50, 1158) = 50
subDt = 96.45 / 50 = 1.929 days per substep
```

**At maximum time warp, each substep covers 1.93 days.** This is 23x larger than the designed 2-hour step size. For an Earth-like orbit (period ~365 days), this means ~5.3 substeps per orbit — far too few for accurate integration. The true anomaly changes by ~1.9 degrees per substep at best, but the sail thrust direction (computed in the RTN frame) changes continuously, so holding it constant for 1.93 days introduces significant error.

### Error Estimate at Maximum Time Warp

For RK2 with dt = 1.93 days on an orbit with period T = 365 days:

Mean motion n = 2*pi/365 = 0.0172 rad/day. The local truncation error of RK2 is O(dt^3):
```
error_per_step ~ (1/6) * d^3x/dt^3 * dt^3
              ~ (1/6) * n^3 * a * dt^3
              ~ (1/6) * (0.0172)^3 * 1.0 * (1.93)^3
              ~ 6.1e-6 AU per step
              ~ 912 km per step
```

Over 50 steps: cumulative error ~ 50 * 912 km = ~45,600 km per frame. At 60 FPS this compounds. This matches the comment in the code (lines 354-358): "~2M km positional error at Mars orbit" for 10Mx time warp.

### Server-Side Implications

The server must handle the same time-warp levels. With 100 concurrent players all at 500Mx, the server must perform:
```
100 players * 50 substeps/frame * 60 frames/sec = 300,000 RK2 evaluations per second
```

Each RK2 substep in the current code involves:
1. `getPosition()` - Kepler solver (~10 Newton-Raphson iterations) + trig transforms: ~50 FLOPs
2. `getVelocity()` - same complexity: ~50 FLOPs
3. `calculateSailThrust()` - cross products, normalization, trig: ~40 FLOPs
4. `applyThrust()` - another getPosition + getVelocity + stateToElements: ~200 FLOPs
5. Each midpoint evaluation doubles this: ~680 FLOPs per substep

Total: 300,000 * 680 = 204 million FLOPs/second. This is well within the capability of a single modern CPU core (~10 GFLOPS for double precision). **Computation is not the bottleneck; network synchronization is.**

### Recommendation

**The server should use adaptive step sizing, not a fixed cap of 50 substeps.** For large time jumps (> 10 days), switch from per-step integration to analytical propagation:

1. **For zero-thrust coasting**: Use the Kepler equation directly. `getPosition(elements, futureTime)` gives exact results with no integration error, regardless of time span.

2. **For constant sail settings over long periods**: Use the averaged variational equations. Over one orbit, the secular rates of change of orbital elements under constant sail thrust can be computed analytically (McInnes, "Solar Sailing", Ch. 5). This reduces a 365-day propagation from 4380 steps to ~1 evaluation.

3. **For changing sail settings**: Record a sequence of `{timestamp, sail_state}` events. Propagate between events using the appropriate method above.

---

## 3. Time Warp Challenges

### The Fundamental Tension

At 500Mx, one frame represents 96.45 days. The player expects instantaneous visual feedback when adjusting sail angles. But accurate physics requires many small steps. The current 50-step cap is a compromise that sacrifices accuracy for performance.

### Server Architecture Options

**Option A: Real-time simulation tick (server runs at 60 Hz)**

The server maintains a simulation clock and advances it at the requested time warp rate. At 500Mx, the server must compute 96.45 days of physics per tick (16.7ms wall time). With the current algorithm (50 substeps of ~1.93 days each), this takes approximately:
```
50 substeps * 680 FLOPs / substep / (10^9 FLOPS/core) = 34 microseconds
```
Easily achievable per player. For 100 players: 3.4ms per tick. The server can handle this.

**However**, this means the server is computing inaccurate physics (1.93-day substeps) just like the client. The anti-cheat benefit is limited to preventing players from modifying orbital elements directly, but the physics simulation quality doesn't improve.

**Option B: Event-driven simulation (server catches up on demand)**

The server stores the last known authoritative state and the sail configuration. When the client requests a state update (or when the server needs to validate), it propagates forward from the last known state to the current time. For long intervals, this uses the analytical methods from Section 2.

Benefits:
- No wasted computation for idle players
- Can use higher-accuracy methods (adaptive RK4-5, Dormand-Prince) since there's no 16.7ms deadline per player per frame
- Scales better (O(active_players) not O(total_players))

Risks:
- Catch-up computation for players returning after long periods could spike
- Must handle the case where a player changes sail settings rapidly — each change creates a new propagation segment

**Option C: Hybrid (server validates, client predicts)**

The client continues to run its own physics (exactly as now) for visual feedback. The server runs authoritative physics in the background and periodically sends corrections. The client smoothly interpolates toward the server state.

This is the recommended approach. It preserves the current feel while preventing cheating. The correction interval can be adaptive: frequent at low time warp (where cheating matters most for PvP), infrequent at high time warp (where the client's own integration is probably close enough).

### Recommendation

**Use Option C (hybrid prediction/correction) with analytical propagation for large time jumps.** Specifically:

1. Server stores `{orbital_elements, sail_state, timestamp}` as authoritative state
2. Client sends sail change events (not position updates)
3. Server validates that sail parameters are within physical bounds (deployment 0-100%, yaw/pitch within valid range, sail count matches inventory)
4. Server propagates forward using analytical methods for coasting segments, RK4 for thrust segments
5. Server sends authoritative state every 1-5 seconds (real time)
6. Client interpolates toward server state using the visual element lerping already in the code (`updateVisualOrbitalElements()` at lines 117-216 of `shipPhysics.js`)

---

## 4. Kepler Equation Solver Determinism

### Current Implementation Analysis

`solveKepler()` at `/home/user/sailship/src/js/lib/orbital.js` lines 99-127:

- **Tolerance**: 1e-12 radians (line 99)
- **Initial guess**: `E = e < 0.8 ? M : Math.PI` (line 106) -- a sharp branch
- **Max iterations**: 50 (line 109)
- **No convergence guarantee for pathological inputs**: If e > 0.99 and M is near 0 or pi, Newton-Raphson can oscillate

The initial guess is a particular concern. For e = 0.7999 vs e = 0.8001, the initial guess jumps from `E = M` to `E = pi`. This means a tiny change in eccentricity (from integration noise) can change the iteration trajectory dramatically, potentially producing results that differ by more than the tolerance if the solver converges to different local solutions. For well-behaved Kepler equations (e < 0.95), Newton-Raphson always converges to the unique solution, but the number of iterations and the exact final value (to the last ULP) may differ.

`solveKeplerHyperbolic()` at lines 173-218 is worse:
- Uses a damped step when divergence is detected (line 206: `H -= delta * 0.5`)
- The damping condition (`Math.abs(delta) > Math.abs(prevDelta) * 2`) is sensitive to floating-point comparison
- The initial guess branches on `Math.abs(M) < 1` (line 181)

### Parabolic Orbit Singularity

The code has explicit handling for e ~ 1.0 in `stateToElements()` (lines 288-290 of `/home/user/sailship/src/js/lib/soi.js`):
```javascript
if (e >= 0.9999 && e <= 1.0001) {
    e = e < 1 ? 0.9999 : 1.0001;
}
```

And in `solveKeplerHyperbolic()` (line 175):
```javascript
const safeE = e <= 1 ? 1.0001 : e;
```

These guards prevent division by zero but introduce a discontinuity. If the server and client disagree on which side of e = 1.0 an orbit falls (due to floating-point rounding in the eccentricity vector calculation), one will use elliptic math and the other hyperbolic, producing wildly different results.

### Recommendation

1. **Use the universal variable formulation as the primary solver.** The code already has `propagateStateUniversal()` (line 348 of `orbital.js`) which handles all orbit types (elliptic, parabolic, hyperbolic) through Stumpff functions without any branching on eccentricity. Route all propagation through this single code path on the server. Currently it's only used for the near-parabolic band (0.95 < e < 1.05).

2. **Fix the initial guess discontinuity.** Replace the sharp branch at e = 0.8 with a smooth initial guess. Markley's starter (1995) provides a non-iterative initial guess accurate to ~10^-4 radians for all e < 1, reducing Newton-Raphson to 2-3 iterations regardless of eccentricity.

3. **Mandate identical solver iterations.** If server and client must match exactly, enforce a fixed iteration count (e.g., always run exactly 8 Newton-Raphson iterations for e < 0.95, always use universal variables otherwise). This removes the dependence on convergence behavior.

---

## 5. SOI Transition Stability

### Current Implementation

SOI detection in `shipPhysics.js` uses two mechanisms:

1. **Instantaneous distance check** (`checkSOIEntry()` at `/home/user/sailship/src/js/lib/soi.js` line 69): checks if ship position is within SOI radius of any planet.

2. **Trajectory intersection** (`checkSOIEntryTrajectory()` at `shipPhysics.js` line 548): uses line-sphere intersection to detect SOI crossings during the frame's time step. This catches fast-moving ships.

SOI exit uses a hysteresis factor of 1.01x (`checkSOIExit()` at `soi.js` line 136).

The frame conversion (`helioToPlanetocentric` / `planetocentricToHelio`) is a simple vector subtraction (lines 152-189 of `soi.js`), followed by `stateToElements()` to compute new orbital elements in the new reference frame.

### Oscillation Risk

Consider a ship at exactly the SOI boundary of Earth (0.00620 AU from Earth center). The exit threshold is 0.00620 * 1.01 = 0.006262 AU. The entry threshold is exactly 0.00620 AU.

If the ship's orbit in the planetocentric frame has apoapsis at 0.00625 AU (between entry and exit thresholds), the ship will:
1. Be inside SOI (distance < 0.006262, no exit)
2. Orbit normally
3. Never exit because apoapsis < exit threshold

This is correct behavior. But if the apoapsis is at 0.006261 AU (just below exit) and numerical noise pushes the computed distance to 0.006263 AU, the ship exits. On the next frame, the heliocentric distance might be 0.00619 AU (below entry), triggering immediate re-entry.

The code has a cooldown mechanism (`soiTransitionCooldown = 0.1` Julian days = ~2.4 hours in `config.js` line 236), but at 500Mx time warp, one frame is 96.45 days, so the cooldown expires instantly.

### Server-Side Implications

The server and client must agree on SOI transitions **exactly**. If the server thinks the ship is in Earth's SOI but the client thinks it's heliocentric, all subsequent physics will diverge catastrophically (different gravitational parameters, different reference frames).

The planet position used for the SOI check matters critically. The server must use the **same planet position** as the client at the **same Julian date**. Currently, planets are positioned via Keplerian elements (`getPosition(planet.elements, julianDate)`), which is deterministic given identical inputs. But if the server uses a slightly different Julian date (due to time quantization), the planet position shifts, and the SOI boundary check may give a different result.

### Quantifying the Sensitivity

Earth moves at ~29.8 km/s. A timing difference of 1 second shifts Earth's position by ~30 km. Earth's SOI radius is 928,000 km. So a 1-second timing error creates a ~30/928000 = 0.003% uncertainty in the SOI boundary. For a ship right at the boundary, this 30 km shift could make the difference between entry and non-entry.

At 500Mx time warp, 1 frame = 96.45 days. The Julian date must be synchronized to better than 1 second in simulation time, which means the server and client must agree on time to better than:
```
1 second / (500000000x) = 2 nanoseconds of real time
```

This is impossible over a network. The server must be the sole authority on simulation time.

### Recommendation

1. **SOI transitions must be server-authoritative.** The client should not independently decide SOI entry/exit. Instead:
   - Client detects "probable SOI transition" and sends a request to the server
   - Server performs the definitive check at its authoritative time
   - Server responds with new orbital elements in the new frame
   - Client snaps to the server state (using the existing `initVisualOrbitalElements()` snap mechanism)

2. **Increase hysteresis to 5%** (from 1.01x to 1.05x). The current 1% margin is too tight for server-client agreement. A 5% margin means the exit boundary is at 1.05 * SOI_radius. The ship must move 5% beyond the SOI before exiting. This costs some physical realism (the SOI concept is already an approximation) but prevents oscillation.

3. **Use state vectors for SOI transitions.** Instead of converting to orbital elements at the boundary (which introduces `stateToElements()` roundtrip error), pass the state vector `{x, y, z, vx, vy, vz}` to the server. The server performs the frame conversion (vector subtraction), then converts to elements. This ensures both sides agree on the post-transition state.

---

## 6. State Synchronization Protocol

### What Should Be Authoritative?

**Orbital elements** are the natural state representation for this game because:
- Position at any future time is computed analytically (no integration needed for display)
- Compact: 8 numbers fully define the orbit
- Stable: elements change slowly under sail thrust (~0.001 AU/day in semi-major axis)

**State vectors** (position + velocity) are better for:
- Integration accuracy (no roundtrip conversion)
- SOI transitions (frame conversion is a simple vector subtraction)
- Server-side validation (can check energy conservation)

### Recommended Protocol

**Authoritative state**: Orbital elements `{a, e, i, omega, Omega, M0, epoch, mu}` + SOI context `{parentBody}` + sail state `{yaw, pitch, deployment, sailCount}`

**Update frequency**: Adaptive based on activity:
- Sail settings changed: immediate update (client sends new sail state, server acknowledges and recalculates)
- Coasting (no sail changes): server update every 5 seconds real time
- SOI transition: immediate bidirectional sync
- Thruster burn: immediate (these are impulsive events)

**Wire format** (per sync message):
```
Orbital elements:  8 * 8 bytes = 64 bytes
SOI state:         1 byte (body enum) + 1 byte (flags)
Sail state:        4 * 4 bytes = 16 bytes (yaw, pitch, deployment, sailCount as float32)
Timestamp:         8 bytes (Julian date as float64)
Sequence number:   4 bytes
Total:             ~94 bytes per update
```

At 1 update/second for 100 players: 9,400 bytes/second = 75.2 kbps. Negligible bandwidth.

### Client-Side Prediction and Reconciliation

The client should:
1. Continue running its local physics (for responsive visuals)
2. Receive server states and compare with local prediction
3. If divergence < threshold (e.g., 0.01 AU positional difference): smoothly lerp toward server state over 10 frames
4. If divergence > threshold: snap to server state (something is wrong, likely a bug or cheat attempt)

The existing `visualOrbitalElements` lerping system (lines 117-216 of `shipPhysics.js`) already handles smooth transitions. The reconciliation system can reuse this mechanism by treating server-authoritative elements as the "actual" and the client's local prediction as the "visual" elements.

### Cheat Detection

The server should flag anomalies:
- Orbital energy changed without corresponding sail thrust: `E = v^2/2 - mu/r` should only change from sail acceleration. Threshold: `|dE/dt - expected_dE/dt| > 3 * integration_error`
- Semi-major axis outside physical bounds: the sail's maximum characteristic acceleration at the current distance limits how fast `a` can change
- SOI entry velocity exceeding solar system escape velocity (~42 km/s from Earth's orbit)
- Sail parameters outside physical range (deployment < 0 or > 100, negative area, reflectivity > 1)

---

## 7. Performance Analysis

### Computational Cost Breakdown

Per player per server tick (assuming server runs at 20 Hz):

| Operation | FLOPs | Time (ns) | Frequency |
|-----------|-------|-----------|-----------|
| Kepler solver (8 N-R iterations) | ~100 | ~50 | per substep |
| State vector from elements | ~150 | ~75 | per substep |
| Sail thrust calculation | ~80 | ~40 | per substep |
| Elements from state vector | ~200 | ~100 | per substep |
| RK2 midpoint (2x above) | ~1060 | ~530 | per substep |
| SOI boundary check (8 planets) | ~200 | ~100 | per tick |
| Trajectory prediction (200 steps, RK4) | ~30000 | ~15000 | on sail change |

At 50 substeps per tick (high time warp): 50 * 530ns + 100ns = 26.6 microseconds per player.

For 1000 concurrent players: 26.6ms per tick. This exceeds the 50ms budget (20 Hz tick rate). **At 1000 players, the server needs ~2 cores dedicated to physics.**

But this is the worst case (all players at 500Mx time warp simultaneously). In practice, most players will be at lower time warps, and the server can skip physics for paused players. Expected load: 100-300 active players with variable time warps ~ 5-10ms per tick on a single core.

### Trajectory Prediction Cost

The trajectory predictor is expensive: up to 8760 steps of RK4 integration (per `TRAJECTORY_RENDER_CONFIG.maxSteps`). Each step involves 4 derivative evaluations (gravitational acceleration + sail thrust), each ~80 FLOPs:
```
8760 steps * 4 evaluations/step * 80 FLOPs = 2.8 million FLOPs
```
At 10 GFLOPS/core: ~280 microseconds per trajectory prediction.

**The trajectory prediction should remain client-side.** It's purely visual (the green spiral line + ghost planets) and doesn't affect game state. The server only needs to validate orbital elements, not predict future trajectories.

### Memory Footprint

Per player server-side state:
- Orbital elements: 64 bytes
- SOI state: 16 bytes
- Sail state: 32 bytes
- Ship metadata (mass, hull, etc.): ~64 bytes
- History buffer (last 10 states for validation): 640 bytes
- Total: ~816 bytes per player

For 10,000 registered players: ~8 MB. For 1000 concurrent: ~816 KB active state. Negligible.

---

## Critical Issues Summary

### Severity: CRITICAL (must fix before server migration)

1. **Integration method mismatch**: `shipPhysics.js` uses RK2 on orbital elements; `trajectory-predictor.js` uses RK4 on state vectors. The server must pick one canonical method. **Recommendation**: RK4 on state vectors (matching the trajectory predictor) with analytical Kepler propagation for coasting segments.

2. **50-substep cap at extreme time warp**: At 500Mx, substep size is 1.93 days, producing ~45,000 km position error per frame. The server must use adaptive step sizing or analytical propagation for long time jumps.

3. **SOI transition timing**: Server and client must agree on the exact Julian date of SOI transitions. The server must be the sole authority; the client must not independently trigger SOI frame conversions.

### Severity: HIGH (significant accuracy or security impact)

4. **Kepler solver initial guess discontinuity**: The branch at e = 0.8 in `solveKepler()` can cause different convergence paths on server vs client. Use universal variables or a smooth initial guess.

5. **Parabolic orbit singularity**: The e ~ 1.0 nudging in `stateToElements()` can cause server and client to disagree on orbit type (elliptic vs hyperbolic), producing completely different trajectories.

6. **Planet position synchronization**: The SOI boundary check depends on planet positions, which depend on Julian date. A timing skew of 1 second at 500Mx time warp shifts Earth by 30 km relative to the SOI boundary.

### Severity: MEDIUM (correctness or performance concern)

7. **Cross-platform floating point**: If server uses a non-JavaScript language, trigonometric functions may differ at the ULP level. This compounds through Newton-Raphson iterations. Mitigate by using identical V8 runtime (Node.js) or by establishing correction protocols.

8. **Energy drift in RK2 integration**: The current RK2 method doesn't conserve orbital energy exactly. Over long simulations, this causes the orbit to drift. A symplectic integrator (Stormer-Verlet) would preserve energy better for Keplerian motion, but doesn't naturally handle the continuous sail thrust. The RK4 state-vector approach in the trajectory predictor is a better compromise.

9. **Gravitational acceleration in RK4**: The `integrateStateRK4()` function only includes the central body's gravity (`gravitationalAcceleration(s, mu)` at line 762 of `orbital-maneuvers.js`). For heliocentric propagation, this ignores planetary perturbations. For a solar sail game where Keplerian orbits are the baseline, this is acceptable, but it means the server's propagation doesn't account for gravitational assists during close planetary approaches (outside SOI).

---

## Recommended Next Steps

1. **Unify integration method**: Convert `shipPhysics.js` to use RK4 state-vector integration (matching `trajectory-predictor.js`) for authoritative physics. Keep orbital elements for storage and display only.

2. **Implement analytical coasting propagation**: When sail deployment is 0% or sail is edge-on (cos(yaw) ~ 0), use exact Kepler propagation instead of numerical integration. This is exact, fast, and deterministic.

3. **Design the SOI transition protocol**: Server-authoritative transitions with client prediction. Test with the known edge case: ship on a planetocentric orbit with apoapsis near the SOI boundary.

4. **Build a determinism test suite**: Take a set of initial conditions, propagate them for 1000 days with various sail settings, and compare results between:
   - Current client-side `shipPhysics.js` (RK2 on elements)
   - Current client-side `trajectory-predictor.js` (RK4 on state vectors)
   - Proposed server-side implementation

   Acceptable divergence: < 0.001 AU (150,000 km) over 1000 days with active thrust. For coasting: < 1 km over any duration (Kepler propagation is exact).

5. **Implement server-side cheat detection**: Monitor energy changes, validate sail parameters, reject impossible state transitions. Log anomalies for analysis before implementing bans.
