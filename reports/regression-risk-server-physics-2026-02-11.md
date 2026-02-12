# Regression Risk Analysis: Server-Side Physics Migration

**Reviewer**: Regression Checker
**Date**: 2026-02-11
**Scope**: Impact analysis of moving physics computation to a server, assessed against all existing client-side features

---

## Executive Summary

Moving physics to a server introduces regression risk across every major subsystem. The current architecture is built on a fundamental assumption: **physics, trajectory prediction, and rendering all share the same in-process state and the same integration code, executing synchronously within a single 60 FPS game loop**. Breaking this assumption creates divergence risks, latency artifacts, and coupling breakages that span the entire codebase.

The highest-severity risk is **trajectory predictor divergence** -- the encounter marker system's correctness depends on predicted and actual physics being mathematically identical. The most pervasive risk is **state mutation pattern disruption** -- 40+ call sites read `getPlayerShip()` by reference every frame.

---

## 1. State Mutation Pattern Analysis

### Current Architecture

The ship object lives in the `ships` array (`/home/user/sailship/src/js/data/ships.js`, line 49). `getPlayerShip()` (line 94) returns a **direct reference** -- not a copy. Every system reads and writes this same object:

```
updateShipPhysics()  -> mutates ship.orbitalElements, ship.x/y/z, ship.velocity
updateAutoPilot()    -> reads ship state, calls fireThruster() which mutates ship
updateCameraTarget() -> reads ship.x/y/z
render()             -> reads ship.x/y/z, ship.orbitalElements, ship.visualOrbitalElements
updateUI()           -> reads ship position, velocity, sail state, SOI state
updateTripometer()   -> reads ship.x/y/z, computes position delta
```

`updateCachedState()` (`/home/user/sailship/src/js/core/shipPhysics.js`, line 1096) sets `ship.x/y/z` and `ship.velocity` directly. `updateCachedStateInSOI()` (line 1117) does the same but converts planetocentric to heliocentric first, using the parent planet's cached position.

### Server Update Options -- Risk Assessment

| Strategy | Regression Risk | Why |
|----------|----------------|-----|
| **Server sends orbital elements, client replaces** | MEDIUM | Client can derive position/velocity locally. `visualOrbitalElements` lerping still works. But SOI state must also be synchronized (planetocentric vs heliocentric reference frame). |
| **Server sends position/velocity, client derives elements** | HIGH | `stateToElements()` is lossy for extreme eccentricities (e > 50). The `extremeFlybyState` linear interpolation fallback (`shipPhysics.js` lines 259-271) would need client-side replication of server decisions. |
| **Server sends delta, client applies** | VERY HIGH | Accumulation of deltas over network drops = permanent drift. No way to self-correct. |

**Recommended approach**: Server sends complete orbital elements + SOI state + extremeFlybyState. Client replaces `ship.orbitalElements` and derives position/velocity locally using existing `getPosition()`/`getVelocity()`. This preserves the most existing code paths.

### Specific Mutation Points That Must Be Redirected

| Location | What It Mutates | Risk |
|----------|----------------|------|
| `shipPhysics.js:462` | `ship.orbitalElements = newElements` (thrust sub-stepping loop) | CRITICAL -- this is the authoritative physics step. Must become server-authoritative. |
| `shipPhysics.js:898` | `ship.orbitalElements = newElements` (SOI entry) | CRITICAL -- reference frame change must be atomic with SOI state change. |
| `shipPhysics.js:960-ish` | `ship.orbitalElements = newElements` (SOI exit) | Same as above. |
| `controls.js:1692` | `fireThruster()` called by autopilot | HIGH -- chemical burns modify elements directly. Server must authorize. |
| `shipPhysics.js:534` | `updateVisualOrbitalElements(ship)` | LOW -- visual-only, can stay client-side. |

---

## 2. Trajectory Predictor Coupling -- HIGHEST RISK

### The Divergence Problem

The trajectory predictor (`/home/user/sailship/src/js/lib/trajectory-predictor.js`) uses **RK4 state-vector integration** (line 293+) to predict where the ship will go. Meanwhile, `updateShipPhysics()` uses **RK2 midpoint integration on orbital elements** (lines 402-464). These are already different algorithms but are tuned to produce matching results (the comment at line 352 explicitly states this is intentional for consistency).

If physics moves to a server:
- The server runs "actual" physics (whatever algorithm it uses)
- The client still needs to run `predictTrajectory()` locally for responsive encounter marker updates
- **Any difference in integration method, step size, floating-point behavior, or numerical precision between server and client will cause the predicted trajectory to diverge from actual physics**

### Cascade Effects of Divergence

1. **Encounter markers show wrong positions** (`main.js` lines 183-264): Ghost planets are positioned based on where the predicted trajectory crosses planetary orbital radii. If the predicted trajectory diverges from actual physics by even 0.001 AU, crossing times shift by hours, and ghost positions shift by thousands of km.

2. **"CLOSE" indicator becomes unreliable** (`main.js` lines 214-244): The closest-approach ghost refinement computes angular separation between predicted ship position and planet position at crossing time. Divergent predictions make this indicator lie.

3. **Node crossing detection breaks** (`main.js` lines 256-264): Orbital plane crossing points for the destination body depend on accurate trajectory prediction.

4. **Course solver produces wrong results** (`/home/user/sailship/src/js/lib/evaluate-trajectory.js`): The course solver uses the same `calculateSailThrust()` and `applyThrust()` functions. If the server uses different physics, the solver optimizes for the wrong trajectory.

### Severity: CRITICAL

This is not a cosmetic issue. Players use encounter markers to plan maneuvers. If markers are wrong, players will adjust sail settings based on incorrect information, leading to missed intercepts. The entire gameplay loop depends on this coupling being exact.

### Mitigation

The ONLY safe mitigation is to ensure the client trajectory predictor uses **exactly the same** physics code as the server. Options:
- Ship the same physics code to both client and server (shared library)
- Server periodically sends a "reference trajectory" that the client uses instead of computing its own
- Client computes trajectory locally but server sends correction checksums at intervals

---

## 3. Autopilot Integration

### Current Flow

```
main.js:114       ->  updateAutoPilot(timeScale)
controls.js:1651  ->  reads getPlayerShip() state
controls.js:1658  ->  determineAutopilotPhase() reads ship.soiState, position
controls.js:1692  ->  fireThruster(player, direction) mutates ship.orbitalElements
```

The autopilot in `controls.js` (line 1651) currently:
1. Reads the player ship's SOI state to determine phase (CRUISE / APPROACH / CAPTURE / ESCAPE / SLINGSHOT)
2. In CAPTURE and SLINGSHOT phases, computes a burn plan
3. Calls `fireThruster()` which directly mutates the ship's orbital elements

### Server Migration Impact

| If autopilot runs on... | Implications |
|------------------------|--------------|
| **Client** | Client sends sail commands and thruster fire requests to server. Server validates and applies. Round-trip latency means autopilot reactions are delayed. At 500Mx time warp, a 50ms round-trip = ~290 simulated days of delay. Autopilot periapsis burns (`plan.nearPeriapsis` check at line 1684) require sub-frame timing precision that network latency destroys. |
| **Server** | Autopilot logic (phase determination, burn planning) must be extracted from `controls.js` (a UI file!) and moved to server. The autopilot currently calls `computeCapturePlan()` and `computeSlingshotPlan()` from `navigation.js`, which depend on `celestialBodies` positions. All of this state must be available server-side. |

### Severity: HIGH

The autopilot's thruster burns at periapsis are timing-critical. At high eccentricity, periapsis passage takes seconds of game time. At high time warp, that's a fraction of a frame. Network latency makes client-side autopilot unreliable; but moving it to the server requires extracting significant navigation logic.

---

## 4. Time Warp Behavior

### Current Implementation

Time warp is instant. `gameState.js` line 177:
```javascript
export function advanceTime() {
    time += timeScale;
    julianDate += timeScale;
}
```

`timeScale` is set synchronously by `setSpeed()`. All systems immediately use the new rate on the next frame. The game loop (`main.js` line 275) is a tight synchronous cycle: `updatePositions() -> render() -> updateUI()`.

### Server Migration Impact

| Scenario | Risk |
|----------|------|
| Client changes time warp, server acknowledges | During the RTT, client and server are at different speeds. Client position diverges from server position. On acknowledgment, position must be reconciled -- potential visible snap. |
| Pause/unpause | If client pauses but server hasn't received the message yet, server continues simulating for RTT duration. On unpause, server and client are at different Julian dates. |
| Very high time warp (500Mx) | At 500Mx, each frame advances ~96.5 days. A 50ms network RTT = several thousand simulated days of potential desync. This is catastrophic for gameplay. |

### Severity: HIGH

The speed presets go up to 500Mx (`config.js` line 62). At that rate, even milliseconds of latency translate to meaningful simulation time. The time warp system fundamentally assumes synchronous local execution.

### Mitigation

- **Lock-step protocol**: Client sends time warp request, waits for server confirmation before advancing local time. This introduces input lag but prevents desync.
- **Predictive execution**: Client continues at old rate until server confirms, then fast-forwards or rewinds. Risk of visible snapping.
- **Server-authoritative time**: Server controls the clock entirely. Client interpolates between server state updates. Time warp changes are sent as requests.

---

## 5. Camera and Rendering

### Current Flow

`camera.js` line 53:
```javascript
export function updateCameraTarget(celestialBodies, ships) {
    // ...
    const ship = ships.find(s => s.name === camera.followTarget);
    if (ship) {
        camera.target.x = ship.x;
        camera.target.y = ship.y;
        camera.target.z = ship.z;
    }
}
```

Camera reads `ship.x/y/z` every frame (60 FPS). These values are set by `updateCachedState()` in `shipPhysics.js`.

### Server Migration Impact

If ship position comes from the server instead of local physics:
- Server sends position updates at network frequency (10-30 Hz typical)
- Camera reads position at 60 FPS
- Between server updates, camera position is stale
- **Result: jerky camera movement, especially noticeable when zoomed in (tactical view)**

### Existing Interpolation Infrastructure

The `visualOrbitalElements` system (`shipPhysics.js` lines 117-216) already implements smooth lerping for orbit visualization. This proves the codebase has a pattern for handling discontinuous state changes. However:
- Visual elements lerp orbital parameters (a, e, i, omega, Omega, M0), not position directly
- Position is derived from elements via `getPosition()`, which is nonlinear
- Lerping elements and then computing position is NOT the same as lerping positions

### Severity: MEDIUM

The visual element lerping pattern can be extended to handle server state updates. The key insight is that if the server sends orbital elements (not positions), the client can compute positions locally at 60 FPS between server updates. This is the recommended approach and would have minimal camera regression.

---

## 6. Test Suite Validity

### Existing Tests (14 test files)

| Test File | Tests | Server Impact |
|-----------|-------|---------------|
| `orbital.test.js` | Kepler solver, position/velocity math | SAFE -- pure math, no state |
| `orbital-maneuvers.test.js` | Thrust calculation, Gauss equations | SAFE -- pure functions |
| `orbital-maneuvers.sailcount.test.js` | Multi-sail thrust scaling | SAFE -- pure functions |
| `trajectory-predictor.test.js` | Forward trajectory integration | AT RISK -- tests that predicted matches actual only hold if both use same code |
| `intersectionDetector.crossing.test.js` | Orbit crossing detection | SAFE -- pure geometry, depends on trajectory input |
| `intersectionDetector.edge-cases.test.js` | Flickering bug tests | AT RISK -- depends on trajectory cache behavior which may change |
| `intersectionDetector.test.js` | Legacy closest approach | SAFE -- pure math |
| `shipPhysics.test.js` | Ship physics integration | AT RISK -- tests direct mutation behavior |
| `camera.test.js` | Camera projection | SAFE -- pure math |
| `gameState.test.js` | State management | AT RISK -- time advancement may become server-controlled |
| `ships.sailcount.test.js` | Sail count configuration | SAFE -- data model |
| `gravity-assist.test.js` | Gravity assist mechanics | SAFE -- pure math |
| `soi.test.js` | SOI coordinate transforms | SAFE -- pure math |
| `starfield.test.js` | Star catalog, precession | SAFE -- unrelated to physics |

### New Tests Required

| Test Category | What to Test | Why |
|--------------|-------------|-----|
| **Physics agreement** | Server and client produce identical trajectories for same inputs | Encounter marker accuracy |
| **State reconciliation** | Client handles server state updates without visible snapping | Camera smoothness |
| **SOI transition sync** | SOI entry/exit events arrive atomically (elements + soiState + extremeFlybyState) | Reference frame consistency |
| **Time warp sync** | Time warp changes don't cause Julian date divergence | Simulation correctness |
| **Autopilot latency** | Autopilot thruster burns succeed despite network RTT | Periapsis timing |
| **Offline fallback** | All features work without server connection | Backward compatibility |
| **Tripometer continuity** | Position deltas don't spike during state reconciliation | `updateTripometer()` guards against jumps > 1 AU but subtler spikes would corrupt distance |
| **Cache invalidation** | Trajectory cache hash still invalidates correctly with server state | Stale ghost planets |
| **Save/load roundtrip** | `serializeGameState()` / `importGameState()` work with server-derived state | State persistence |

---

## 7. Backward Compatibility (Offline/Local Mode)

### Feasibility Assessment

The current architecture can support a dual-mode design if implemented carefully:

```
if (serverConnection.active) {
    // Server-authoritative: receive orbital elements from server
    ship.orbitalElements = serverState.orbitalElements;
    ship.soiState = serverState.soiState;
    ship.extremeFlybyState = serverState.extremeFlybyState;
} else {
    // Local-authoritative: existing updateShipPhysics() path
    updateShipPhysics(ship, deltaTime);
}
```

### What Must Be Preserved for Offline Mode

| Component | Current Location | Notes |
|-----------|-----------------|-------|
| Physics integration | `shipPhysics.js:updateShipPhysics()` | Must remain functional as-is |
| SOI transitions | `shipPhysics.js:handleSOIEntry/Exit()` | Complex state machine, cannot be easily stubbed |
| Thrust calculation | `orbital-maneuvers.js:calculateSailThrust()` | Pure functions, already reusable |
| Trajectory prediction | `trajectory-predictor.js:predictTrajectory()` | Must work in both modes |
| Autopilot | `controls.js:updateAutoPilot()` | Must work locally for offline |
| Course solver | `evaluate-trajectory.js` + web workers | Already runs in workers, architecture compatible |
| Save/load | `saveState.js` | Must handle both server and local state |

### Severity: MEDIUM

Dual-mode is feasible because the physics code is largely pure-functional (orbital math) with a thin mutation layer on top. The mutation layer is the only part that needs to be swappable. However, the autopilot and SOI transition handlers are deeply entangled with direct mutation, making the swap non-trivial.

---

## Regression Risk Matrix

| Feature | Severity | Likelihood | Impact | Mitigation Difficulty |
|---------|----------|-----------|--------|----------------------|
| **Trajectory predictor divergence** | CRITICAL | HIGH | Encounter markers show wrong positions; gameplay broken | HARD -- requires shared physics code or periodic server trajectory sync |
| **SOI transition atomicity** | CRITICAL | MEDIUM | Ship enters SOI on server but client doesn't know; reference frame mismatch causes ship to teleport | MEDIUM -- bundle SOI transitions as atomic state updates |
| **Autopilot periapsis timing** | HIGH | HIGH | Burns fire at wrong orbital phase; capture fails | HARD -- requires server-side autopilot or latency compensation |
| **Time warp desync** | HIGH | HIGH | Julian date divergence accumulates; all orbital positions wrong | MEDIUM -- server-authoritative clock with client interpolation |
| **Camera jerkiness** | MEDIUM | MEDIUM | Ship appears to teleport between server updates | LOW -- extend existing visual lerp system |
| **Tripometer accuracy** | MEDIUM | LOW | Position deltas spike during state reconciliation; trip distance inflated | LOW -- add reconciliation guard in `updateTripometer()` |
| **Course solver mismatch** | MEDIUM | MEDIUM | Solver optimizes for client physics, server uses different physics; solutions are suboptimal | HARD -- solver runs in web workers, must use server-compatible physics |
| **Save/load compatibility** | LOW | LOW | Saved state format changes | LOW -- versioned save format already exists |
| **Keyboard shortcuts / UI** | LOW | LOW | Sail control inputs must become requests rather than direct mutations | LOW -- thin wrapper over existing functions |
| **Cheat codes (nudge)** | LOW | LOW | `nudgeShipAlongOrbit()` directly mutates elements | LOW -- disable when server-authoritative or route through server |
| **Display option toggles** | NONE | NONE | Client-only rendering concern | N/A |
| **Star map / starfield** | NONE | NONE | Independent of physics | N/A |

---

## Recommended Migration Strategy

### Phase 1: Abstraction Layer (LOW RISK)
Introduce a `PhysicsProvider` interface that wraps the existing local physics. All mutation sites call through this interface. Existing behavior is unchanged -- this is pure refactoring.

```
// Before
ship.orbitalElements = newElements;

// After
physicsProvider.updateOrbitalElements(ship, newElements);
```

### Phase 2: Server Connection (MEDIUM RISK)
Implement server physics provider that receives state updates. Run in parallel with local physics for validation. Log divergences without affecting gameplay.

### Phase 3: Server Authority (HIGH RISK)
Switch to server-authoritative mode. Client trajectory predictor uses server-provided physics parameters. Autopilot moves to server. Time warp becomes server-controlled.

### Phase 4: Offline Fallback (MEDIUM RISK)
Ensure local physics provider still works when server is unavailable. Save/load handles both modes.

---

## Critical Coupling Points Summary

The following call chain is the backbone of the game and must remain coherent across any migration:

```
advanceTime()                    [gameState.js:177]
  -> updateCelestialPositions()  [celestialBodies.js]
  -> updateAutoPilot()           [controls.js:1651]
  -> updateShipPhysics()         [shipPhysics.js:235]
       -> getPosition/Velocity() [orbital.js]
       -> calculateSailThrust()  [orbital-maneuvers.js]
       -> applyThrust()          [orbital-maneuvers.js]
       -> checkSOIEntry/Exit()   [soi.js]
       -> updateCachedState()    [shipPhysics.js:1096]
  -> updateTripometer()          [tripometer.js:36]
  -> predictTrajectory()         [trajectory-predictor.js:231]
  -> detectIntersections()       [intersectionDetector.js]
  -> updateCameraTarget()        [camera.js:53]
  -> render()                    [renderer.js]
  -> updateUI()                  [uiUpdater.js]
```

Every function in this chain reads or writes the ship object. Introducing network latency between any two steps breaks the synchronous invariant that the entire codebase assumes.

---

## Overall Confidence Rating

**Confidence that migration can be done without regression: 40%** (without significant architectural changes)
**Confidence with phased approach and shared physics code: 75%**
**Confidence with dual-mode (offline fallback) preserved: 65%**

The biggest unknown is whether the server physics implementation will be numerically identical to the client. JavaScript floating-point on different engines (browser vs Node.js vs Rust/Go server) can produce subtly different results due to FMA instructions, rounding modes, and optimization levels. Even a 1 ULP difference in a tight integration loop compounds over thousands of steps into visible trajectory divergence.
