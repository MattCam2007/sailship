# Server-Side Physics: Failure Mode Analysis

**Date**: 2026-02-11
**Reviewer**: Failure Analyst
**Scope**: Network-related failure modes introduced by moving physics from client-side to server-side

---

## Executive Summary

Moving Sailship's physics engine from client-side to server-side introduces seven categories of failure modes that range from "annoying visual glitches" to "game-breaking desynchronization cascades." The core challenge is that orbital mechanics is a **chaotic deterministic system** -- tiny input differences produce exponentially diverging outputs, especially near SOI boundaries and at high eccentricities. Network latency, jitter, and packet loss transform these from theoretical numerical concerns into guaranteed player-facing bugs.

This analysis quantifies each failure mode with concrete numbers derived from the actual codebase, identifies the specific code paths where failures manifest, and recommends mitigations ranked by risk/effort.

**Overall Risk Rating**: HIGH -- Three failure modes are potentially game-breaking without mitigation.

---

## 1. Network Latency Impact on Gameplay

### The Fundamental Problem

The game loop in `main.js` (line 275-289) runs at 60 FPS with a tight `requestAnimationFrame(gameLoop)` cycle:
```
updatePositions() -> render() -> updateUI() -> requestAnimationFrame()
```

Each frame, `updateShipPhysics()` in `shipPhysics.js` (line 235) advances the ship's orbital elements by `deltaTime` (= `timeScale`, which equals days-per-frame). At 60 FPS, a single frame is 16.7ms of wall-clock time. Typical internet latency is 20-100ms, meaning the server's authoritative state is always 1-6 frames behind what the player sees.

### Concrete Numbers by Time Warp

| Speed Preset | `timeScale` (days/frame) | Game-Time per 100ms Latency | Position Error at 1 AU |
|---|---|---|---|
| 1x | 1.93e-7 | 0.0012 sec game | ~0.03 km | Imperceptible |
| 100x | 1.93e-5 | 1.67 sec game | ~3 km | Imperceptible |
| 10,000x | 1.93e-3 | 167 sec game | ~300 km | Barely visible |
| 100,000x | 0.0193 | 0.46 day game | ~3,000 km | Visible on tactical zoom |
| 1,000,000x | 0.193 | 4.6 days game | ~50,000 km | Visible on local zoom |
| 10,000,000x | 1.93 | 46 days game | ~500,000 km | Clearly visible |
| 100,000,000x | 19.3 | 463 days game | ~5M km | Ship teleports on correction |
| 500,000,000x | 96.5 | 2,312 days game | ~25M km | Ship jumps across orbit arcs |

Position error is computed as: orbital velocity (~30 km/s at 1 AU for Earth-like orbit) multiplied by the game-time equivalent of the latency.

### Failure Scenario: Rubber-banding at High Time Warp

At 10Mx time warp, 100ms of latency = 46 game days of positional uncertainty. The ship traverses ~13% of its orbit in that interval. When the server correction arrives, the client must reconcile a ship position that has moved ~2 degrees around the orbit from where the client predicted it. The visual `lerp` system (`visualOrbitalElements` in shipPhysics.js lines 117-216) smooths element changes at 25% per frame (line 243: `visualElementLerpRate: 0.25`), but this was designed for thrust-induced changes of fractions of a degree per frame, not 2-degree server corrections.

**Result**: The orbit visualization "breathes" -- expanding and contracting as corrections arrive, with the rendered orbit shape oscillating between client-predicted and server-corrected values. The ship itself appears to slide along the orbit path in jumps rather than smooth motion.

### Mitigation

**Client-side dead reckoning with server reconciliation.** The client runs its own copy of the physics at the current time warp, rendering predictions locally. The server sends authoritative orbital elements periodically (not every frame). The client blends corrections using the existing `visualOrbitalElements` lerp, but with a dynamic lerp rate:
- Small corrections (< 0.1% element change): Use current rate (0.25/frame)
- Medium corrections (0.1-1%): Use 0.1/frame (4-second blend)
- Large corrections (> 1%): Snap immediately (desync indicates a fundamental divergence)

At low time warp (1x-10,000x), server updates can be infrequent (once per second). At high time warp (> 100,000x), the server sends updates more frequently or the client falls back to sending sail-change intents and receiving trajectory "segments" (pre-computed orbital elements at checkpoints) rather than per-frame state.

---

## 2. Desynchronization Cascade

### The Chain Reaction

This is the most dangerous failure mode. It proceeds as follows:

**Step 1: Small Divergence in Orbital Elements**
Client and server diverge by tiny floating-point amounts. This is inevitable because:
- The RK2 sub-stepping in `shipPhysics.js` (lines 360-465) computes up to 50 sub-steps per frame
- Each sub-step calls `getPosition()` -> `solveKepler()` (Newton-Raphson, 50 max iterations at tolerance 1e-12)
- The Kepler solver (orbital.js line 99-127) initial guess is `E = M` for low eccentricity and `E = pi` for high eccentricity -- different iteration paths from slightly different initial M will converge to slightly different E values
- `applyThrust()` (orbital-maneuvers.js line 394-472) converts elements -> state vector -> applies delta-V -> converts back to elements. This round-trip introduces conversion errors, particularly near singularities (i ~ 0, e ~ 0) where `stateToElements()` (soi.js lines 217-457) has multiple degenerate code paths

**Step 2: SOI Transition Timing Diverges**
The SOI boundary check uses `checkSOIEntryTrajectory()` (shipPhysics.js lines 548-680), which does a line-sphere intersection test. The line segment endpoints come from position + velocity * deltaTime. A 1e-10 AU difference in position (15 meters) near an SOI boundary of 928,000 km (Earth) is negligible -- but at high time warp with large `deltaTime`, the ray-sphere intersection `tEntry` parameter (line 616) shifts, causing:
- Client detects SOI entry at frame N
- Server detects SOI entry at frame N+1 (or vice versa)

**Step 3: Reference Frame Fork**
Once one side enters the SOI and the other hasn't:
- Client: Ship elements are now planetocentric (mu = mu_Earth = 8.89e-10 AU^3/day^2)
- Server: Ship elements are still heliocentric (mu = mu_Sun = 2.96e-4 AU^3/day^2)

These are COMPLETELY DIFFERENT reference frames. The position (x,y,z) values mean entirely different things. The ship's `soiState.currentBody` differs between client and server.

**Step 4: Massive Position Jump on Correction**
When the server correction arrives, the client must:
1. Realize the reference frame is different
2. Convert from its current frame to the server's frame
3. Apply the correction

But if the client is in planetocentric space and receives heliocentric coordinates (or vice versa), a naive application would place the ship at a completely wrong location. The heliocentric position of a ship orbiting Earth at ~6,000 km altitude is ~1.00004 AU from the Sun, while a planetocentric position of 6,000 km from Earth is ~4e-5 AU. Applying one as the other produces a position error of approximately 1 AU -- the ship teleports to a random point in the solar system.

### Quantified Risk

At Earth's SOI boundary (0.0062 AU = 928,000 km), a ship traveling at 5 km/s crosses the boundary in approximately 185,000 seconds of game time. At 100,000x time warp, this corresponds to ~35 minutes of real time. At 10Mx time warp, this corresponds to ~21 seconds of real time. At 500Mx, it happens in 0.4 seconds -- faster than a round-trip network packet.

**Probability of desync at SOI boundary**: Near-certain at time warp >= 10,000,000x with latency >= 50ms.

### The SOI Cooldown Makes It Worse

The existing `soiTransitionCooldown` (config.js line 236: 0.1 game days = 2.4 hours) prevents rapid cycling. If the client enters the SOI but the server doesn't, the client applies the cooldown -- and then when the server's correction forces an exit, the client's cooldown prevents re-entry, causing the ship to be stuck in heliocentric space near the SOI boundary, oscillating.

### Mitigation

**SOI transitions MUST be server-authoritative with client lockout.** When the server detects that the ship is within 110% of any SOI radius, it enters a "SOI proximity" mode:

1. Server increases its physics tick rate for this player (or reduces sub-step size)
2. Server sends a "SOI imminent" warning to the client
3. Client freezes local SOI detection and waits for the server to declare entry/exit
4. Server performs the transition and sends the complete new state (elements, soiState, reference frame) as a single atomic update
5. Client applies the new state with a visual snap (using `initVisualOrbitalElements()`, which already snaps visual elements on SOI transition -- shipPhysics.js line 283)

Additionally, the state update message must include a `referenceFrame` field that the client uses to validate that it's interpreting the coordinates correctly. If there's a frame mismatch, the client requests a full state resync.

---

## 3. Server Performance Under Load

### Per-Player Computation Cost

Tracing through one frame of `updateShipPhysics()` for a player at 500Mx time warp:

1. **Time step**: `timeScale` = 96.5 days/frame (at 500Mx)
2. **Sub-steps**: `numSubSteps = min(50, ceil(96.5 / 0.0833)) = 50` (capped)
3. **Per sub-step** (from shipPhysics.js lines 371-464):
   - `getPosition()`: Calls `solveKepler()` with up to 50 Newton-Raphson iterations. Typical: 5-8 iterations. Cost: ~5us
   - `getVelocity()`: Same Kepler solve + velocity formula. Cost: ~5us
   - Heliocentric conversion (if in SOI): 2 additional `getPosition()`/`getVelocity()` calls for planet. Cost: ~10us
   - `calculateSailThrust()`: Trigonometry (cos, sin, sqrt), cross products. Cost: ~3us
   - `applyThrust()` (RK2 midpoint): Gets position/velocity, applies delta-V, calls `stateToElements()`. Cost: ~15us
   - Midpoint evaluation: Another position/velocity + thrust calculation. Cost: ~20us
   - Total per sub-step in SOI: ~58us
   - Total per sub-step heliocentric: ~48us

4. **Total per frame**: 50 sub-steps * 50us = **~2.5ms per player per frame**

5. **Additional per-frame costs**:
   - SOI boundary check (`checkSOIEntryTrajectory()`): Iterates over all planets. Cost: ~20us
   - Anomaly detection: Cost: ~5us
   - Visual element update: ~2us (can skip server-side)

### Scaling Analysis

| Players | Cost per Tick (60 Hz) | Available Time | Verdict |
|---|---|---|---|
| 1 | 2.5 ms | 16.7 ms | Easy |
| 5 | 12.5 ms | 16.7 ms | Tight |
| 7 | 17.5 ms | 16.7 ms | Over budget |
| 10 | 25 ms | 16.7 ms | Fails |
| 100 | 250 ms | 16.7 ms | Fails catastrophically |

**At 60 Hz server tick rate, a single core can support approximately 6 players at 500Mx time warp.**

### Critical Insight: Not All Players Need 60 Hz

The 60 Hz tick rate is driven by the client's rendering framerate, but the server doesn't need to match it. The key realization from the codebase is that the physics is **deterministic given inputs** (orbital elements + sail state + time). The server's job is to:
1. Accept sail/thruster input changes
2. Advance physics to the point of the next input change or SOI boundary
3. Send authoritative orbital elements at that point

Between input changes, the trajectory is fully determined by the current orbital elements and sail state. The server doesn't need to compute every frame -- it can compute the result of applying thrust for N seconds in one batch.

### Batch Computation Model

Instead of running 60 ticks/second per player:
1. When a player changes sail settings, the server computes the trajectory forward to the next scheduled checkpoint (e.g., every 10 game-days, or at SOI boundaries)
2. Between input changes, the client extrapolates locally using its copy of the orbital elements
3. The server only recomputes when: (a) sail/thruster input changes, (b) SOI boundary is crossed, or (c) checkpoint interval expires

**Cost model**: At 500Mx, 10 game-days pass in ~1.5 real seconds. Computing 10 game-days at 50 sub-steps per 0.0833-day step = 6,000 sub-steps. At 50us each = 300ms per player per checkpoint. At one checkpoint per 1.5 seconds, the server spends ~300ms / 1.5s = 20% of one core per player.

| Players | Core Usage | Cores Needed |
|---|---|---|
| 10 | 200% | 2 |
| 50 | 1000% | 10 |
| 100 | 2000% | 20 |
| 1000 | 20000% | 200 |

This is much more manageable than the naive 60 Hz model, but still scales linearly with player count.

### Mitigation

1. **Batch computation model** as described above
2. **Time warp budget**: Higher time warps consume more server resources. Could charge "compute credits" or limit maximum time warp based on server load
3. **Tiered physics fidelity**: At extreme time warp, use fewer sub-steps (e.g., 10 instead of 50). The trajectory will be less accurate but the game is already accepting ~97 days per frame at 500Mx -- additional error from fewer sub-steps is proportionally small
4. **Horizontal scaling**: Physics is per-player with no inter-player coupling (there's no collision detection, gravity between players, etc.). Each player's physics can run on any server core independently. This is an embarrassingly parallel workload.

---

## 4. Time Warp Fairness

### The Asymmetry Problem

From `config.js` (lines 52-62), the speed presets range from pause to 500,000,000x. At 500Mx, one real second = 5,787 game-days = 15.85 game-years. A player at this speed traverses multiple orbits per second of real time.

**Scenario**: Player A is at 1x (real time), carefully positioning sails for a Venus intercept. Player B is at 500Mx, covering 15 years of orbital travel per second.

If both players are in a shared universe, Player B's ship must be tracked accurately across those years. Any other player who might encounter B's ship needs to know where it is. But B's position changes so rapidly that by the time an update reaches other clients, B has moved years ahead.

### Sail Change Mid-Warp

The most expensive case: Player B at 500Mx changes sail settings every few seconds of real time. Each change requires the server to:
1. Halt the current trajectory computation at the exact game-time of the input
2. Apply the new sail settings
3. Recompute the trajectory forward from that point

At 500Mx, 2 seconds of real time = 11,574 game-days. The server just computed a trajectory segment covering those days. The player changes sail settings, and the entire segment is invalidated. The server must recompute 11,574 game-days of physics.

**Recomputation cost**: 11,574 days / 0.0833 days per step = 138,888 sub-steps * 50us = **6.9 seconds of CPU time**. But the player's next input arrives in 2 seconds. The server falls behind.

### Input Queuing Failure

If the server can't keep up with trajectory recomputation, inputs queue up. Each queued input adds more recomputation work. The server falls further behind. Eventually:
- The player's client has local predictions that are minutes ahead of the server's authoritative state
- When the server finally catches up, it sends corrections that represent game-years of divergence
- The player sees their ship "rubber-band" across the solar system

### Mitigation

1. **Input throttling at high time warp**: At 500Mx, sail adjustments are rate-limited to once per N game-days (e.g., once per 100 game-days). The UI shows "sail settings locked -- updating in 3.2s" during the server recompute interval. This matches the physical reality that at 500Mx, the player can't meaningfully react to individual orbit segments anyway.

2. **Coarse-grain physics at extreme time warp**: At > 100Mx, switch from per-frame sub-stepping to a simplified propagator that computes the orbit change over an entire orbital period analytically. The solar sail produces a secular change in semi-major axis per orbit that can be approximated (this is already hinted at in `estimateDeltaAPerOrbit()` in orbital-maneuvers.js line 592).

3. **Separate time warp budgets**: Each player has a "compute budget" that limits how fast they can warp based on current server load. If the server is under load, maximum time warp is reduced from 500Mx to 10Mx for all players. This is transparent to gameplay -- the player just experiences slower time acceleration.

4. **Lazy evaluation**: Don't compute a player's trajectory until someone needs to observe it. If Player B is at 500Mx and no other player is near them, the server can defer computation and just record "Player B was at elements X with sail settings Y at time T." Only when another player queries B's position does the server compute where B actually ended up.

---

## 5. State Recovery After Crash

### What State Must Be Persisted?

From the save/load system in `saveState.js` (lines 43-111), the complete game state for one player consists of:

**Minimal authoritative state (what the server MUST persist):**
```javascript
{
    julianDate: number,                    // 8 bytes
    orbitalElements: {                     // 64 bytes
        a, e, i, Omega, omega, M0,        // 6 * 8 bytes = 48 bytes
        epoch, mu                          // 2 * 8 bytes = 16 bytes
    },
    soiState: {                            // ~20 bytes
        currentBody: string,               // e.g., 'EARTH'
        isInSOI: boolean
    },
    sail: {                                // 56 bytes
        area, reflectivity, angle,
        pitchAngle, deploymentPercent,
        condition, sailCount
    },
    thruster: {                            // 24 bytes
        deltaVRemaining, deltaVMax, burnSize
    },
    mass: number,                          // 8 bytes
    extremeFlybyState: null | {            // 0 or ~80 bytes
        entryPos: {x, y, z},
        entryVel: {vx, vy, vz},
        entryTime: number
    }
}
```

**Total per player: ~180-260 bytes.** This is trivially small and can be persisted to disk every second with zero performance impact.

### Hidden State That Is NOT in the Save

Examining the codebase reveals several pieces of hidden state that affect physics but are NOT serialized:

1. **SOI transition cooldown** (`lastSOITransitionTime`, `lastSOITransitionBody` in shipPhysics.js line 789-790): If the server crashes during a cooldown period, recovery might allow an SOI re-entry that would have been blocked. **Risk: LOW** -- cooldown is only 0.1 game-days.

2. **Visual orbital elements** (`ship.visualOrbitalElements`): These are display-only and can be re-initialized from actual elements on recovery. **Risk: NONE** -- `initVisualOrbitalElements()` handles this.

3. **Autopilot state** (`autoPilotState` in gameState.js lines 108-112, `lastAutopilotThrusterTime` in controls.js): Autopilot phase and thruster cooldown are lost. **Risk: MEDIUM** -- if autopilot was mid-capture burn, recovery might miss the periapsis window.

4. **Transit state** (`transitState` in gameState.js lines 659-664): Course refinement history is lost. **Risk: LOW** -- player can re-plot.

5. **Trajectory and intersection caches**: All in-memory caches (`trajectoryCache`, `intersectionCache`, `closestApproachCache`, `nodeCrossingsCache`) are lost. **Risk: NONE** -- they rebuild automatically on the next frame.

6. **Anomaly detector state** (`lastKnownState` referenced in shipPhysics.js line 285): A diagnostic-only state that resets to null on SOI transitions anyway. **Risk: NONE.**

### Recovery Time

Given the minimal state size:

1. **State serialization**: 260 bytes * 1000 players = 260 KB. Writing to disk: <1ms.
2. **State persistence strategy**: Write-ahead log (WAL) with periodic snapshots. Each sail/thruster change appends to the WAL. Snapshots every 10 seconds.
3. **Recovery procedure**:
   - Read latest snapshot: <1ms for 1000 players
   - Replay WAL entries since snapshot: ~0-10 entries * 0.1ms = <1ms
   - Recompute current positions from orbital elements: `getPosition()` per player = 5us * 1000 = 5ms
   - Total recovery: **< 10ms** for 1000 players

4. **Downtime**: The bottleneck is server restart (process loading, network binding), not state recovery. With a hot standby, failover time is dominated by health check intervals (typically 1-5 seconds).

### Crash During SOI Transition

The most dangerous crash timing: server crashes AFTER updating `soiState` but BEFORE persisting the new `orbitalElements`. On recovery, the ship has `soiState.isInSOI = true` with `soiState.currentBody = 'EARTH'` but heliocentric orbital elements.

**Mitigation**: SOI transitions must be atomic in the persistence layer. Use a single transaction that writes both `soiState` and `orbitalElements` together. If the transaction is incomplete, roll back to the pre-transition state.

---

## 6. Edge Case Interactions with Network

### 6.1 Near-Parabolic Orbit + Network Latency

**Scenario**: Ship approaches e = 1.0 (the parabolic singularity). The codebase handles this with a nudge (soi.js line 288-290):
```javascript
if (e >= 0.9999 && e <= 1.0001) {
    e = e < 1 ? 0.9999 : 1.0001;
}
```

If the client computes e = 0.99998 (nudged to 0.9999, elliptic) but the server computes e = 1.00002 (nudged to 1.0001, hyperbolic), the orbits are now in entirely different categories. The elliptic orbit has a finite semi-major axis; the hyperbolic orbit has negative `a`. The mean anomaly handling differs (`propagateMeanAnomaly()` at orbital.js line 73: hyperbolic orbits skip normalization). Different Kepler solvers are invoked (`solveKepler` for elliptic, `solveKeplerHyperbolic` for hyperbolic).

**Consequence**: The client draws a closed ellipse. The server computes a hyperbolic escape. Corrections place the ship on a fundamentally different trajectory shape.

**Severity**: HIGH -- near-parabolic orbits occur naturally during gravity assists. A ship entering Jupiter's SOI with near-escape velocity will have e ~ 1.0 in the planetocentric frame.

**Mitigation**: The server is authoritative for orbit type classification. When e is in the range [0.999, 1.001], the server must include an explicit `isHyperbolic` flag in its state update, overriding the client's local computation. The client must not independently classify orbit type in this range.

### 6.2 SOI Boundary + Packet Loss

**Scenario**: Server sends SOI entry command (packet A). Client doesn't receive it. Server starts computing planetocentric physics. Client continues computing heliocentric physics. Server sends next position update in planetocentric coordinates. Client interprets them as heliocentric -- ship teleports ~1 AU.

**Severity**: CRITICAL -- this is the desync cascade from Section 2, but triggered by a single dropped packet rather than computational divergence.

**Mitigation**: SOI state changes must use reliable delivery (TCP or UDP with application-level ACK). The server must not advance to post-transition physics until the client acknowledges the frame change. If ACK is not received within 2 round-trips, the server re-sends the transition. The transition message must include:
```javascript
{
    type: 'SOI_TRANSITION',
    direction: 'ENTRY' | 'EXIT',
    bodyName: 'EARTH',
    newOrbitalElements: {...},
    newSoiState: {...},
    referenceFrame: 'PLANETOCENTRIC_EARTH' | 'HELIOCENTRIC',
    julianDateOfTransition: 2461083.5,
    sequenceNumber: 42  // For ordering guarantee
}
```

### 6.3 Autopilot + Server Authority

**Problem**: The autopilot in `controls.js` (line 1651-1715) runs client-side. It calls `determineAutopilotPhase()` to decide whether to fire thrusters, then calls `fireThruster()` which applies instantaneous delta-V via `applyThrusterBurn()` (orbital-maneuvers.js line 494-558).

If autopilot runs on the client but physics is authoritative on the server:
1. Client autopilot decides to fire retrograde burn at periapsis
2. Client applies burn locally (optimistic update)
3. Client sends "fire retrograde burn" command to server
4. Server receives command 100ms later
5. In those 100ms at 10Mx time warp, the ship has moved 46 game-days past periapsis
6. Server applies the burn at the WRONG orbital position
7. Instead of circularizing, the burn sends the ship into a different orbit

**Severity**: HIGH -- autopilot capture burns are time-critical. The burn must happen at periapsis for orbit circularization. A burn at the wrong true anomaly has dramatically different orbital effects (Gauss's variational equations are strongly position-dependent).

**Mitigation**: Two options:

**Option A (Server-side autopilot)**: Move autopilot logic to the server. Server detects periapsis approach, computes optimal burn timing, executes burn. Client receives updated elements after the burn. Player sees the burn happen correctly but with a display delay.

**Option B (Scheduled burns)**: Client's autopilot sends a "schedule burn" command: "fire retrograde 2.0 km/s burn when true anomaly reaches nu_target." Server pre-computes when this will occur and applies it at the exact right time. Client shows a "burn scheduled" indicator.

Option B is superior because it eliminates the timing problem entirely and works regardless of latency.

### 6.4 Thruster Burn (Impulse) + Network Latency

**Scenario**: Player manually presses the retrograde burn button. Client applies burn immediately for responsiveness. Server receives command after latency.

From `applyThrusterBurn()` (orbital-maneuvers.js line 494-558), the burn is applied at the current position and velocity:
```javascript
const position = getPosition(elements, julianDate);
const velocity = getVelocity(elements, julianDate);
// ... apply delta-V along velocity direction
```

If `julianDate` differs by 0.01 days (14.4 minutes of game time, achievable at 100,000x with 100ms latency), the position and velocity differ. The prograde/retrograde direction differs. The resulting orbital elements differ.

**Quantified divergence**: At 1 AU, orbital velocity is ~30 km/s. In 14.4 minutes, the ship moves ~25,920 km along its orbit, or about 0.01 degrees of true anomaly. The prograde direction rotates by 0.01 degrees. A 2 km/s burn applied 0.01 degrees off-axis produces a cross-track error of ~0.35 m/s. Over one orbit (~365 days), this accumulates to approximately 10,000 km of position error. Not catastrophic but visible.

**Mitigation**: Thruster burns should be timestamped with the client's `julianDate` at the moment of the button press. The server applies the burn at that exact julianDate, not at the server's current time.

---

## 7. Client-Side Prediction Errors

### Error Budget

From the visual element lerp system (shipPhysics.js lines 117-216):
- **Lerp rate**: 0.25/frame (25% per frame)
- **Convergence**: ~90% of a correction is absorbed in 8 frames = 133ms
- **Full convergence**: ~99% in 16 frames = 267ms

For the player to NOT notice a correction, the visual change must be smaller than the ship's normal per-frame movement. At 10,000x time warp:
- Ship moves ~0.0019 days/frame at ~30 km/s = ~5,000 km per frame
- A correction of < 5,000 km (< 3.3e-5 AU) would be absorbed without visible jump
- This corresponds to ~0.2 seconds of game time error

**Error thresholds by time warp:**

| Time Warp | Max Invisible Error (game time) | Max Invisible Error (km) |
|---|---|---|
| 1x | 180 seconds | 5,400 km |
| 100x | 1.8 seconds | 54 km |
| 10,000x | 0.018 seconds | 0.54 km |
| 1,000,000x | 0.00018 seconds | 0.005 km |

At high time warp, even tiny server corrections produce visible jumps because the per-frame ship movement is so large that corrections represent a smaller fraction of it. Wait -- this is inverted. Let me recalculate.

At high time warp, the ship moves MORE per frame. A 5,000 km correction at 10,000x is invisible because the ship moves 5,000 km per frame anyway. But the same correction at 1x would be visible because the ship only moves 0.5 km per frame.

Corrected thresholds (correction must be < 1 frame of motion):

| Time Warp | Ship Motion per Frame | Max Invisible Correction | In Game Time | In Latency (ms) |
|---|---|---|---|---|
| 1x | 0.5 km | 0.5 km | 0.017 sec | 16.7 |
| 100x | 50 km | 50 km | 1.7 sec | 16.7 |
| 10,000x | 5,000 km | 5,000 km | 167 sec | 16.7 |
| 1,000,000x | 500,000 km | 500,000 km | 16,700 sec | 16.7 |

**Key insight**: At low time warp, corrections are MORE visible. A 50ms latency at 1x produces only 0.85 km of prediction error, which is barely above the 0.5 km invisibility threshold. But at 1x, the player is likely zoomed in and paying close attention to fine orbit details, making even small jumps noticeable.

### Smooth Interpolation vs Snap Correction

The existing codebase already has the right architecture for this:

1. **Small corrections**: Route through `updateVisualOrbitalElements()` with normal lerp rate (0.25/frame). The orbit visualization smoothly adjusts.

2. **Orbit-type changes**: Snap immediately (shipPhysics.js line 183-193). This is correct -- you can't lerp between an ellipse and a hyperbola.

3. **SOI transitions**: Snap via `initVisualOrbitalElements()` (line 283). Also correct -- the reference frame changed.

4. **Large corrections (> 20% semi-major axis or > 0.3 eccentricity change)**: Currently snaps to 50% of the way (line 196-202), which is a reasonable compromise.

**Recommendation**: Add a "medium" category for server corrections of 1-20% semi-major axis change. Use a lerp rate of 0.15/frame (slower than normal but faster than small corrections) to smooth the transition over ~12 frames (200ms). Below 1%, use normal lerp. Above 20%, snap. This matches the existing tiered approach.

---

## Summary of Failure Modes

| # | Failure Mode | Severity | Likelihood at 1x | Likelihood at 500Mx | Mitigation Complexity |
|---|---|---|---|---|---|
| 1 | Network latency rubber-banding | MEDIUM | LOW | HIGH | LOW (dead reckoning) |
| 2 | SOI desynchronization cascade | CRITICAL | VERY LOW | HIGH | HIGH (atomic transitions) |
| 3 | Server overload at scale | HIGH | LOW | MEDIUM | MEDIUM (batch computation) |
| 4 | Time warp fairness exhaustion | MEDIUM | N/A | HIGH | MEDIUM (input throttling) |
| 5 | State loss after crash | LOW | LOW | LOW | LOW (minimal state) |
| 6a | Near-parabolic + latency | HIGH | VERY LOW | MEDIUM | LOW (explicit orbit type flag) |
| 6b | SOI boundary + packet loss | CRITICAL | VERY LOW | HIGH | HIGH (reliable delivery + ACK) |
| 6c | Autopilot + server authority | HIGH | LOW | HIGH | MEDIUM (scheduled burns) |
| 6d | Thruster burn + latency | MEDIUM | LOW | MEDIUM | LOW (timestamped commands) |
| 7 | Client prediction visual errors | LOW | MEDIUM | LOW | LOW (tiered lerp) |

---

## Recommended Implementation Order

### Phase 1: Foundation (Must Have)
1. **SOI transitions as atomic server-authoritative events** (mitigates #2, #6b)
2. **Reliable delivery for state transitions** (mitigates #6b)
3. **Timestamped commands** (mitigates #6d)
4. **Explicit orbit type in state updates** (mitigates #6a)

### Phase 2: Performance (Needed for Scale)
5. **Batch computation model** (mitigates #3)
6. **Input throttling at high time warp** (mitigates #4)
7. **Scheduled burns for autopilot** (mitigates #6c)

### Phase 3: Polish (Improves Experience)
8. **Client-side dead reckoning with adaptive reconciliation** (mitigates #1)
9. **Tiered visual lerp for corrections** (mitigates #7)
10. **WAL-based state persistence** (mitigates #5)

### What NOT to Do
- Do not attempt to run the full 60 Hz physics loop on the server for all players. The math doesn't work past 6 players at max time warp.
- Do not allow clients to independently determine SOI transitions. This is the single biggest source of catastrophic desync.
- Do not send raw position (x, y, z) over the network. Send orbital elements. They are compact (8 numbers), frame-independent, and the client can extrapolate positions locally with perfect accuracy until the next element update.
- Do not ignore the near-parabolic singularity (e ~ 1.0). This edge case, which is rare in single-player, becomes a guaranteed occurrence in multiplayer because different floating-point environments (different CPUs, different optimization levels) will round the nudge differently.
