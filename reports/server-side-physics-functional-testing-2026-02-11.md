# Functional Testing Report: Server-Side Physics Migration

**Date**: 2026-02-11
**Reviewer**: Functional Tester
**Scope**: Testing requirements for moving physics from client to server

---

## Executive Summary

The Sailship game currently runs all physics client-side in `shipPhysics.js`, using Keplerian orbital mechanics with Gauss's variational equations for continuous solar sail thrust. Moving physics to a server introduces **seven major testing domains**: determinism verification, network failure resilience, time warp synchronization, SOI transition consistency, cheat detection, regression coverage, and end-to-end integration. This report defines concrete test cases with inputs, expected outputs, and tolerance thresholds for each domain.

The existing test suite covers pure orbital math well (orbital.js, orbital-maneuvers.js, soi.js, trajectory-predictor.js, intersectionDetector.js) but has zero coverage for stateful game loop behavior, network protocols, or multi-client synchronization. A new server-side test infrastructure must be built from scratch.

---

## 1. Determinism Testing

### 1.1 Problem Statement

The client currently performs physics via RK2 sub-stepping in `updateShipPhysics()` (shipPhysics.js:360-464). The trajectory predictor in `trajectory-predictor.js` uses the same RK2 midpoint integration. For server-authoritative physics, the client must be able to predict the server's output to provide smooth visual interpolation, and divergence between client prediction and server truth must stay within defined tolerances.

**Critical code paths that must produce identical results on both sides:**
- `solveKepler()` / `solveKeplerHyperbolic()` (orbital.js) -- Newton-Raphson iteration
- `applyThrust()` using Gauss's variational equations (orbital-maneuvers.js)
- `calculateSailThrust()` with cos^2(theta) force model (orbital-maneuvers.js)
- `stateToElements()` for SOI frame conversion (soi.js)
- `getPosition()` / `getVelocity()` from orbital elements (orbital.js)

### 1.2 Tolerance Thresholds

Tolerances must be defined per quantity. Based on the current physics precision:

| Quantity | Tolerance | Justification |
|----------|-----------|---------------|
| Position (heliocentric) | 100 km (6.68e-7 AU) | Sub-pixel at all zoom levels. At `tactical` zoom (10,000 px/AU), 100 km = 0.0067 px |
| Position (planetocentric) | 10 km (6.68e-8 AU) | Needed for accurate SOI rendering at approach zoom |
| Velocity | 0.01 km/s (5.78e-6 AU/day) | Below sail thrust resolution (~0.5 mm/s^2) |
| Orbital element: a | 1e-6 AU | Current rounding precision in trajectory cache hash |
| Orbital element: e | 1e-6 | Current rounding precision in trajectory cache hash |
| Orbital element: angles | 1e-4 rad (0.006 deg) | Current rounding precision in trajectory cache hash |
| Time | 1 second (1.16e-5 days) | Needed for accurate encounter marker timing |

### 1.3 Test Cases

#### TC-D1: Identical Integration for Zero-Thrust Orbit
```
Input:
  orbitalElements: { a: 1.0, e: 0.0167, i: 0.001, omega: 0, Omega: 0, M0: 0,
                     epoch: 2461083, mu: 2.9591e-4 }
  sail: { deploymentPercent: 0 }
  deltaTime: 0.001157 days (100 seconds at 1x speed)

Client action: updateShipPhysics(ship, deltaTime)
Server action: same function with same inputs

Expected: Position after 100 steps (10,000 game-seconds) matches to < 100 km
Verification: |pos_client - pos_server| < 6.68e-7 AU for x, y, z
```

#### TC-D2: RK2 Sub-Stepping Consistency Under Thrust
```
Input:
  orbitalElements: { a: 0.95, e: 0.02, i: 0.001, omega: 0, Omega: 0, M0: PI/4,
                     epoch: 2461083, mu: 2.9591e-4 }
  sail: { area: 3e6, reflectivity: 0.9, angle: 0.6, pitchAngle: 0,
          deploymentPercent: 100, condition: 100, sailCount: 1 }
  mass: 10000 kg
  deltaTime: 0.193 days (at 10M x time warp: 10000000 / 5184000 per frame)

Expected after 100 frames:
  - Position divergence < 100 km
  - Semi-major axis divergence < 1e-6 AU
  - Eccentricity divergence < 1e-6

Critical: Both client and server must use the SAME sub-step size (1/12 day = 2 hours)
          as defined by MAX_SUBSTEP in shipPhysics.js:367 and trajectory-predictor.js
```

#### TC-D3: Floating-Point Reproducibility Across Platforms
```
Input: Same as TC-D2 but run on:
  - Server (Node.js on Linux x64)
  - Client (Chrome on Windows)
  - Client (Safari on macOS ARM)
  - Client (Chrome on Android)

Expected: All produce position within 100 km tolerance
Risk: IEEE 754 double precision should be identical, but Math.sin/cos/sqrt
      may differ by 1-2 ULP between implementations. Accumulates over
      thousands of frames.

Mitigation test: Run 10,000 frame simulation, verify final divergence < 1000 km
```

#### TC-D4: Kepler Solver Convergence Edge Cases
```
Inputs testing solver convergence:
  1. Near-parabolic: e = 0.9999 (forced to 0.9999 by soi.js:288)
  2. High eccentricity hyperbolic: e = 5.0, M = 10.0
  3. Near-circular: e = 1e-10 (short-circuits to E = M)
  4. Extreme M: M = 100*PI (large wrap-around)

Expected: Client and server produce identical E (eccentric anomaly) to 1e-12 tolerance
          (matching the default solveKepler tolerance in orbital.js:99)
```

### 1.4 Determinism Testing Infrastructure

**Required:**
1. Shared physics module importable by both client and server (the current `orbital.js`, `orbital-maneuvers.js`, `soi.js` are already pure functions with no DOM dependency)
2. A "physics replay" test harness that takes a sequence of inputs (orbital elements + sail state + deltaTime for each frame) and outputs final state
3. Golden file tests: record a 1000-frame physics trace from one platform, replay on others, compare

---

## 2. Network Failure Path Testing

### 2.1 Current Architecture (No Network)

Currently in `main.js:107-128`:
```javascript
function updatePositions() {
    advanceTime();
    updateCelestialPositions();
    updateAutoPilot(timeScale);
    updateShipPhysics(player, timeScale);
    updateTripometer();
    generateFlightPath();
    // ... intersection detection ...
}
```

Everything is synchronous, in-process, and infallible. Every code path downstream of `updateShipPhysics()` assumes the ship's position is always available and fresh.

### 2.2 Test Cases

#### TC-N1: Server Goes Down Mid-Flight
```
Scenario:
  1. Client is running at 10000x time warp (1 frame = 0.001929 days)
  2. Ship is in heliocentric orbit with sail deployed
  3. Server stops responding (no state updates arrive)

Expected behavior:
  - Client continues to predict position locally using last-known orbital elements
  - Visual display does NOT freeze or show ship at (0,0,0)
  - After 60 seconds of no server response, show "CONNECTION LOST" indicator
  - After 300 seconds, pause game time to prevent excessive local-only drift

Failure to test: Without this, a server crash causes the ship to visually stop
while game time advances, then snap to a very different position on reconnect.

Specific code paths affected:
  - render() in renderer.js expects ship.x/y/z to be valid numbers
  - updateUI() in uiUpdater.js reads ship.orbitalElements
  - Tripometer accumulates distance from position deltas (tripometer.js:42-54)
    -- will accumulate zero distance if position freezes, or huge distance on snap
```

#### TC-N2: 5-Second Latency Spike
```
Scenario:
  1. Client at 100x time warp (deltaTime = 1.93e-5 days/frame)
  2. Server update arrives 5 seconds late (300 frames at 60fps)
  3. During the 5 seconds, client has predicted 300 frames forward locally

Expected behavior:
  - Ship position should not visibly jump when server update arrives
  - Client should smoothly reconcile using visual orbital element lerping
    (currently implemented in shipPhysics.js:117-216 for visual smoothing)
  - Position divergence during gap < 100 km for zero-thrust orbit
  - Position divergence during gap < 1000 km for thrust orbit at 100x

Test procedure:
  1. Record client predicted state after 300 frames
  2. Record server authoritative state after 300 frames
  3. Verify |predicted - authoritative| < threshold
  4. Apply server correction, verify no visible jump in canvas rendering
```

#### TC-N3: Packets Arrive Out of Order
```
Scenario:
  Server sends state updates at t=100, t=101, t=102.
  Client receives them in order: t=102, t=100, t=101.

Expected behavior:
  - Client applies t=102 (newest), discards t=100 and t=101
  - Ship position reflects t=102 state, not oscillate between states

Implementation note: Each server packet must include a monotonic sequence number
or Julian date timestamp. Client must track highest-seen timestamp and discard
packets older than current authoritative state.
```

#### TC-N4: Client Reconnects After Disconnect
```
Scenario:
  1. Client disconnects at Julian date 2461100.0
  2. Ship was at orbital elements { a: 1.05, e: 0.03, ... } with sail at 35 deg
  3. Client reconnects 30 minutes later (real time)
  4. Server has been advancing time at whatever rate was set

Expected behavior:
  - Server sends full state snapshot on reconnect
  - Client replaces all local state: orbitalElements, soiState, sail, time, julianDate
  - Caches are invalidated: trajectoryCache, intersectionCache, closestApproachCache
    (currently done via clearTrajectoryCache(), clearIntersectionCache(), etc. in gameState.js)
  - UI updates: sail angles, deployment, speed buttons, zoom level
  - saveState.js:deserializeGameState() is a model for what must be restored

Test procedure:
  1. Start game, configure sail, set destination to Mars, enable autopilot
  2. Disconnect client
  3. Wait 5 minutes real time (server runs at 100000x: ~57 game days pass)
  4. Reconnect
  5. Verify: all UI panels reflect server state (sail angles, autopilot status,
     destination, current position, SOI state)
  6. Verify: trajectory prediction recalculates from new orbital elements
  7. Verify: encounter markers update for new trajectory
```

#### TC-N5: Network Jitter During SOI Transition
```
Scenario:
  1. Ship approaching Mars at 10000x time warp
  2. Network has 200ms jitter (updates arrive 0-400ms after transmission)
  3. Ship crosses Mars SOI boundary (SOI radius: 0.00386 AU)

Expected behavior:
  - SOI transition is AUTHORITATIVE: only server determines when SOI entry occurs
  - Client does NOT attempt local SOI transitions (these change reference frame)
  - If client's predicted position is inside SOI but server hasn't sent SOI entry:
    client continues rendering in heliocentric frame until server confirms
  - Frame conversion (helioToPlanetocentric) happens ONCE per server instruction

Risk: If both client and server independently detect SOI entry at slightly
different times, the coordinate frame conversion produces different orbital
elements. Current implementation has a 0.1 day cooldown (PHYSICS_CONFIG.soiTransitionCooldown)
that would not be synchronized between client and server.
```

---

## 3. Time Warp Testing

### 3.1 Current Time System

From `config.js`:
```javascript
const REAL_TIME_RATE = 1 / (86400 * 60);  // 1 frame = 1/5184000 day at 1x

SPEED_PRESETS = {
    pause: 0,
    '1x': REAL_TIME_RATE,                    // ~1.93e-7 days/frame
    '100x': 100 * REAL_TIME_RATE,            // ~1.93e-5 days/frame
    '10000x': 10000 * REAL_TIME_RATE,        // ~1.93e-3 days/frame
    '100000x': 100000 * REAL_TIME_RATE,      // ~1.93e-2 days/frame
    '1000000x': 1000000 * REAL_TIME_RATE,    // ~0.193 days/frame
    '10000000x': 10000000 * REAL_TIME_RATE,  // ~1.93 days/frame
    '100000000x': 100000000 * REAL_TIME_RATE,// ~19.3 days/frame
    '500000000x': 500000000 * REAL_TIME_RATE // ~96.5 days/frame
};
```

### 3.2 Test Cases

#### TC-T1: Server Handles Time Warp Change Command
```
Scenario:
  1. Client sends "setSpeed('10000000x')" command
  2. Server validates: is 10000000x a valid preset? Yes.
  3. Server applies new timeScale immediately
  4. Server sends acknowledgment with new timeScale value
  5. Client confirms match

Expected:
  - Server validates speed name against SPEED_PRESETS keys
  - Server rejects unknown speed names (e.g., "999999x")
  - Server confirms new timeScale within 1 network round-trip
  - Client timeScale matches server timeScale exactly (same constant values)

Edge case: Client sends "setCustomSpeed(999999)" -- server must validate
  the multiplier is within [0, 500000000] range
```

#### TC-T2: State Accuracy at Extreme Time Warps
```
Input:
  orbitalElements: Earth-like orbit at 1 AU
  sail: deployed at 35 deg
  timeScale: 500000000x (96.5 days/frame)

At 500M x:
  - deltaTime = 96.5 days per frame
  - Sub-stepping: min(50, ceil(96.5 / 0.0833)) = 50 sub-steps of 1.93 days each
  - Each sub-step is ~1.93 days (much larger than the 2-hour target)

Expected behavior:
  - Server must use finer sub-stepping than MAX_SUBSTEPS=50 allows
  - OR server must cap effective time warp to prevent > 2-hour sub-steps
  - Position accuracy degrades significantly at 500M x due to MAX_SUBSTEPS cap

Test:
  1. Run 100 frames at 500M x (9,650 game days total)
  2. Compare final position to reference computed with 0.01-day time steps
  3. Verify position divergence < 0.01 AU (1.5 million km)
  4. Document accuracy degradation curve vs time warp level

Note: At 500M x with 50 sub-steps, each sub-step is 1.93 days, which is 23x
larger than the 2-hour target. Thrust direction changes significantly over
1.93 days as the ship moves along its orbit. This is a known accuracy limitation
already present in the client code.
```

#### TC-T3: Client-Server Sync Across Time Warp Changes
```
Scenario:
  1. Server running at 10000x, client in sync
  2. Client requests speed change to 1000000x
  3. Server applies change at Julian date 2461100.5
  4. Client receives confirmation at its local time = 2461100.3 (200ms latency)

Expected:
  - Client must retroactively apply the speed change at JD 2461100.5
  - OR server sends "your time should be X now" with each speed change
  - Client adjusts its local Julian date to match server's
  - No position snap: client was predicting at old rate, server jumped ahead

Test procedure:
  1. Record client JD and ship position at moment of speed change request
  2. Record server JD and ship position when change is applied
  3. Record client JD and ship position when confirmation arrives
  4. Verify: after applying server's authoritative JD, position divergence < 1000 km
```

#### TC-T4: Pause Behavior
```
Scenario: Client requests pause (timeScale = 0)

Expected:
  - Server stops advancing game time immediately
  - All connected clients receive pause notification
  - Ship position does NOT change while paused
  - Visual orbital elements continue to lerp toward actual (shipPhysics.js:242-244)
  - Un-pause resumes from exact pause point (no time skipped)

Edge case: What if client A pauses and client B sends a sail adjustment?
  - Server should queue the sail change and apply it when time resumes
  - OR sail changes take effect immediately but no physics update occurs until un-pause
```

#### TC-T5: Time Warp at Maximum with SOI Body
```
Scenario:
  Ship is in Mars SOI (Mars mu = 9.55e-11 AU^3/day^2)
  Time warp set to 100000000x

At this warp:
  - deltaTime = 19.3 days/frame
  - Mars orbit period at 0.001 AU: T = 2*PI*sqrt(0.001^3/9.55e-11) = ~2025 days
  - One frame jumps ship ~1% of its orbit -- acceptable

  But at 0.0001 AU altitude (very tight orbit):
  - T = ~64 days
  - One frame jumps 30% of orbit -- unacceptable, will miss periapsis

Expected: Server must enforce maximum time warp based on current orbital period.
Test: Verify server auto-caps time warp when period < 10 * deltaTime
```

---

## 4. SOI Transition Testing

### 4.1 Current SOI System

SOI transitions involve coordinate frame changes (soi.js:152-189) and orbital element re-computation (soi.js:217-457). The current client-side implementation has:

- Entry detection via distance check + ray-sphere intersection (shipPhysics.js:548-680)
- Exit detection via hysteresis (1.01x SOI radius, soi.js:125-137)
- 0.1 day cooldown between transitions per body (shipPhysics.js:810-813)
- Extreme eccentricity fallback for e > 50 (shipPhysics.js:259-266)

### 4.2 Test Cases

#### TC-S1: Server-Client SOI Entry Disagreement
```
Scenario:
  1. Ship approaching Earth SOI (0.00620 AU radius) at 30 km/s
  2. At 30 km/s, ship crosses ~388 km/frame at 1x (at 60 fps, but SOI is ~928,000 km)
  3. At 10000x time warp, ship crosses ~3.88M km/frame -- can overshoot SOI boundary
  4. Server detects entry at JD 2461100.500
  5. Client, running 200ms behind, detects entry at JD 2461100.498

Expected:
  - Server's detection time is authoritative
  - Server sends SOI entry event: { type: 'SOI_ENTRY', body: 'EARTH',
    julianDate: 2461100.500, newElements: {...}, soiState: {currentBody: 'EARTH', isInSOI: true} }
  - Client applies server's orbital elements directly (NOT re-computing stateToElements locally)
  - Client's local SOI detection is disabled while server is authoritative

Test:
  1. Set up approach trajectory at various speeds (10, 30, 50 km/s relative to Earth)
  2. At each speed, verify server and client detect SOI entry within 0.01 days of each other
  3. After server correction, verify client position matches server within 10 km
```

#### TC-S2: SOI Exit with Frame Conversion
```
Scenario:
  1. Ship in Mars orbit, raises orbit until exiting SOI
  2. planetocentricToHelio() converts state (soi.js:176-189)
  3. stateToElements() converts Cartesian to Keplerian (soi.js:217-457)

Expected:
  - Position in heliocentric frame is continuous across exit (no visible jump)
  - Velocity in heliocentric frame is continuous across exit
  - New heliocentric orbital elements produce the same position when queried
    at the exit Julian date: |getPosition(newElements, exitJD) - exitPos| < 10 km

Test:
  1. Record ship planetocentric state at frame before exit
  2. Record ship planetocentric state at frame of exit
  3. Convert both to heliocentric using planetocentricToHelio()
  4. Verify positions differ by < 10 km
  5. Convert exit heliocentric state to orbital elements
  6. Verify getPosition(elements, exitJD) matches exit position to < 10 km
```

#### TC-S3: SOI Boundary Oscillation Prevention
```
Scenario:
  Ship is exactly at SOI boundary (distance = SOI radius * 1.005)
  Small perturbations cause entry/exit cycling

Current mitigation:
  - Exit threshold at 1.01x SOI radius (hysteresis, soi.js:136)
  - 0.1 day cooldown per body (PHYSICS_CONFIG.soiTransitionCooldown)

Test:
  1. Place ship at distance = SOI_RADIUS * 0.999 (just inside)
  2. Apply radial thrust that would push ship outward by 0.002 * SOI_RADIUS per frame
  3. Run for 100 frames
  4. Verify: exactly 1 SOI exit occurs (not multiple entry/exit cycles)
  5. Verify: cooldown prevents re-entry for 0.1 days even if ship drifts back

Server consideration: The cooldown timer must be tracked server-side. If client
disconnects and reconnects during cooldown, cooldown state must be restored.
```

#### TC-S4: SOI Entry During Disconnect
```
Scenario:
  1. Ship approaching Venus SOI at 100000x time warp
  2. Client disconnects for 10 seconds
  3. During disconnect, server detects SOI entry and converts to planetocentric frame
  4. Client reconnects

Expected:
  - Server sends complete state including soiState: { currentBody: 'VENUS', isInSOI: true }
  - Client receives planetocentric orbital elements
  - Client correctly renders ship relative to Venus, not the Sun
  - All caches cleared and rebuilt for new reference frame

Test:
  1. Start approach trajectory that enters Venus SOI after ~5 seconds at 100000x
  2. Disconnect client at T+3s
  3. Reconnect at T+7s (ship is now inside Venus SOI)
  4. Verify: client shows ship orbiting Venus, not in heliocentric space
  5. Verify: trajectory prediction works in planetocentric frame
  6. Verify: encounter markers update for new reference frame
```

#### TC-S5: Extreme Eccentricity Flyby
```
Scenario:
  Ship enters Jupiter SOI at high velocity, producing e > 50
  (triggers extreme flyby linear interpolation in shipPhysics.js:259-266)

Expected:
  - Server detects extreme eccentricity and stores extremeFlybyState
  - Linear interpolation used instead of Kepler solver (numerically stable)
  - Ship exits SOI within expected time
  - Post-exit heliocentric elements are physical (a > 0 or negative for escape)

Test:
  1. Set ship on high-speed collision course with Jupiter
  2. Enter SOI, verify e > 50 detected
  3. Verify ship position tracks linearly (not on hyperbolic trajectory)
  4. Verify SOI exit occurs within reasonable time
  5. After exit, verify heliocentric orbit is physical
```

---

## 5. Cheat Detection Testing

### 5.1 Attack Surface

With server-authoritative physics, the primary cheats involve sending manipulated commands. The server receives:
- Sail angle changes (yaw, pitch, deployment)
- Speed/time warp changes
- Destination changes
- Thruster burn commands
- Save/load requests

### 5.2 Test Cases

#### TC-C1: Impossible Sail Angles
```
Attack: Client sends sail yaw = 180 degrees (PI radians)
Valid range: -PI/2 to PI/2 (setSailAngle() in ships.js:121-124 clamps)

Expected:
  - Server rejects or clamps the angle to valid range
  - Server logs the violation
  - Client receives the clamped value

Test matrix:
  | Input yaw (deg) | Expected server action |
  |------------------|-----------------------|
  | 35               | Accept (valid)        |
  | 89               | Accept (valid)        |
  | 90               | Accept (boundary)     |
  | 91               | Clamp to 90           |
  | 180              | Clamp to 90           |
  | -91              | Clamp to -90          |
  | NaN              | Reject, keep current  |
  | Infinity         | Reject, keep current  |
  | "abc"            | Reject, keep current  |

Same matrix for pitchAngle.
For deploymentPercent: valid range [0, 100].
For sailCount: valid range [1, 20], must be integer.
```

#### TC-C2: Client Claims Wrong Position
```
Attack: Client sends position update claiming ship is at (1.5, 0, 0) AU
when server calculates it should be at (1.0, 0, 0) AU.

Expected:
  - Server NEVER accepts position from client (server-authoritative)
  - Client's claimed position is ignored entirely
  - Server only accepts COMMANDS (sail angle, speed, destination)
  - Server computes all positions internally

Test:
  1. Client sends fabricated position in a message
  2. Verify server ignores it
  3. Verify next server state update shows correct position
```

#### TC-C3: Client Manipulates Time
```
Attack: Client sends "setTime(julianDate + 1000)" to jump 1000 days forward

Expected:
  - Server NEVER accepts time changes from client
  - Time is advanced only by server's game loop at server-controlled timeScale
  - Client can only request speed changes (which server validates)

Test:
  1. Client sends time manipulation command
  2. Verify server rejects it
  3. Verify server Julian date is unchanged
```

#### TC-C4: Thruster Fuel Manipulation
```
Attack: Client sends thruster burn with deltaVRemaining set to 999 km/s

Expected:
  - Server tracks thruster fuel state independently
  - Server validates burn size <= ship.thruster.burnSize (2.0 km/s from config)
  - Server validates deltaVRemaining >= burn size before executing burn
  - Server decrements its own fuel counter after valid burn

Test:
  1. Ship starts with 50 km/s delta-V (DEFAULT_THRUSTER.deltaVMax)
  2. Client sends 25 valid burns of 2 km/s each (total 50 km/s)
  3. Client sends 26th burn -- server rejects (fuel empty)
  4. Client sends burn with negative delta-V -- server rejects
```

#### TC-C5: Rapid-Fire Commands (Rate Limiting)
```
Attack: Client sends 1000 sail angle changes per second to overload server

Expected:
  - Server rate-limits commands per client
  - Reasonable limit: 60 commands/second (matching frame rate)
  - Excess commands dropped silently or queued and applied at frame rate
  - Ship state reflects the last accepted command for each control

Test:
  1. Send 1000 setSailAngle commands in 1 second
  2. Verify server processes at most 60
  3. Verify final sail angle matches the last accepted command
  4. Verify no server performance degradation
```

#### TC-C6: Save State Injection
```
Attack: Client sends a save state with modified orbital elements
(e.g., a = 0.0001 to teleport near Sun, or a = 100 to jump to outer solar system)

Expected:
  - Server validates save state before applying
  - Orbital elements range-checked: a in [minSemiMajorAxis, maxSemiMajorAxis]
    (currently 1e-6 to 1000 AU from TRAJECTORY_ROBUSTNESS config)
  - Eccentricity range-checked: e in [0, maxEccentricity] (currently 200)
  - Save state can only be loaded by the same player session

Test:
  1. Create valid save state
  2. Modify orbitalElements.a to 0.00001 (inside Sun)
  3. Send save load request
  4. Verify server rejects or clamps the elements
```

---

## 6. Regression Testing

### 6.1 Existing Test Suite Status

| Test File | Framework | Coverage | Server Impact |
|-----------|-----------|----------|---------------|
| `orbital.test.js` | Node.js `node:test` | Core Kepler math (pure functions) | Must pass unchanged on server |
| `orbital-maneuvers.test.js` | Node.js `node:test` | Thrust calculations (pure functions) | Must pass unchanged on server |
| `shipPhysics.test.js` | Node.js `node:test` | getOrbitalInfo, getThrustInfo only | Limited -- updateShipPhysics untested |
| `trajectory-predictor.test.js` | Browser console | Zero-thrust matching, energy change | Must pass -- trajectory prediction continues client-side |
| `intersectionDetector.crossing.test.js` | Browser console | Crossing detection algorithm | Must pass -- intersection detection stays client-side |
| `intersectionDetector.edge-cases.test.js` | Browser console | Flickering bug regression | Must pass |
| `intersectionDetector.test.js` | Browser console | Legacy closest approach | Must pass |
| `soi.test.js` | Browser console | SOI radius, entry/exit, frame conversion, stateToElements | Critical -- SOI logic may move to server |
| `starfield.test.js` | Browser console | Star rendering (unaffected) | N/A |
| `gravity-assist.test.js` | Browser console | Gravity assist math | Must pass on server if slingshot computed there |

### 6.2 Required Regression Test Execution

**Before any server-side code is written:**
1. Run ALL existing tests and record baseline results
2. Document any test that uses hardcoded SOI radii (soi.test.js uses 0.1 AU, but config.js defines 0.00620 for Earth) -- these tests may need updating as the values diverged from the test expectations

**After server-side physics module is created:**
1. Run orbital.test.js and orbital-maneuvers.test.js in Node.js -- these already use `node:test` and should work
2. Convert browser console tests (trajectory-predictor, intersectionDetector, soi) to Node.js test framework
3. Verify every test passes identically on server

### 6.3 Missing Test Coverage (Current Gaps)

The following code paths have ZERO test coverage and are critical for server migration:

| Code Path | File | Why It Matters |
|-----------|------|----------------|
| `updateShipPhysics()` main loop | shipPhysics.js:235-534 | THE core physics function -- completely untested |
| RK2 sub-stepping under thrust | shipPhysics.js:360-464 | Determines whether predicted trajectory matches actual |
| `checkSOIEntryTrajectory()` ray-sphere | shipPhysics.js:548-680 | Fast-moving SOI detection -- could miss entries |
| `handleSOIEntry()` full path | shipPhysics.js:809-899 | Converts frame and sets new elements |
| `handleSOIExit()` full path | shipPhysics.js (not shown) | Reverse frame conversion |
| Autopilot logic | controls.js:`updateAutoPilot()` | Makes sail decisions -- if moved to server, must be tested |
| Course solver evaluation | evaluate-trajectory.js | Simulates trajectories for optimization |
| Save/load round-trip | saveState.js | Serialization/deserialization of full game state |
| Tripometer accumulation | tripometer.js:36-64 | Depends on frame-by-frame position deltas |
| Visual element lerping | shipPhysics.js:117-216 | Client-only, but affects user experience on server corrections |

---

## 7. Integration Test Scenarios

### 7.1 End-to-End Pipeline Tests

#### ITC-1: Basic Flight -- Earth to Mars Transfer
```
Setup:
  - Ship in Earth-like orbit (a=0.95 AU)
  - Sail at yaw=35 deg, deployment=100%, pitch=0
  - Destination: Mars
  - Time warp: 1000000x

Sequence:
  1. Client sends sail configuration to server
  2. Server validates and applies sail state
  3. Server runs physics at 1M x (deltaTime=0.193 days/frame)
  4. Server sends state updates every 100ms (real time)
  5. Client interpolates between updates for smooth rendering
  6. Run for 300 game days (~90 seconds real time at 1M x)

Verification at each server update:
  - ship.orbitalElements.a is increasing (orbit raising with prograde sail)
  - Position is on or near predicted trajectory (within 1000 km)
  - Encounter markers update as trajectory changes
  - No NaN or Infinity in any field

End conditions:
  - Semi-major axis has increased from 0.95 to > 1.0 AU
  - Eccentricity remains physical (0 <= e < 1 for heliocentric)
  - Total energy conservation check: |E_final - E_expected| / |E_expected| < 1%
    where E_expected accounts for cumulative thrust work
```

#### ITC-2: SOI Entry, Orbit, and Exit Sequence
```
Setup:
  - Ship on Mars intercept trajectory
  - Approaching Mars SOI at ~10 km/s relative

Sequence:
  1. Server detects SOI entry
  2. Server converts to planetocentric frame
  3. Server sends SOI entry event to client
  4. Client transitions display to Mars-centered view
  5. Ship orbits Mars in hyperbolic trajectory (e > 1)
  6. Player deploys thrusters for orbital insertion (2 km/s retrograde burns)
  7. Server validates and applies thruster burns
  8. After burns, orbit becomes elliptical (e < 1)
  9. Player raises orbit to exit Mars SOI
  10. Server detects SOI exit
  11. Server converts back to heliocentric frame
  12. Server sends SOI exit event to client

Verification:
  Step 2: stateToElements() produces valid planetocentric elements
  Step 3: Client displays ship relative to Mars (not Sun)
  Step 6: Server deducts thruster fuel correctly
  Step 8: Eccentricity drops below 1.0, orbit type changes to elliptic
  Step 11: stateToElements() produces valid heliocentric elements
  Step 12: Ship position in heliocentric frame is continuous

Position continuity across transitions:
  |helio_pos_before_entry - (planeto_pos + planet_pos)| < 10 km
  |helio_pos_after_exit - (planeto_pos + planet_pos)| < 10 km
```

#### ITC-3: Autopilot Full Mission
```
Setup:
  - Ship in Earth orbit (a=0.95 AU)
  - Destination: Venus
  - Autopilot enabled
  - Time warp: 10000000x

Sequence:
  1. Autopilot adjusts sail for orbit lowering (retrograde angle)
  2. Server applies autopilot-computed sail angles
  3. Semi-major axis decreases toward Venus orbit (~0.72 AU)
  4. Ship enters Venus SOI
  5. Autopilot switches to APPROACH phase
  6. Autopilot switches to CAPTURE phase (fires retrograde thrusters)
  7. Ship captured into Venus orbit (e < 1 planetocentric)

Verification:
  - Autopilot phase transitions logged and correct
  - Sail angles change smoothly (no oscillation)
  - SOI entry detected correctly
  - Post-capture orbit is stable (run 100 more frames, verify no exit)

Server consideration: If autopilot runs on server, it needs access to
  destination info and planet positions. If autopilot runs on client,
  it sends sail angle commands to server (treated as player input).
```

#### ITC-4: Multi-Client Observation
```
Setup:
  - Two clients connected, observing the same ship
  - Client A controls the ship
  - Client B is a spectator

Sequence:
  1. Client A adjusts sail angle to 45 deg
  2. Server applies change
  3. Both Client A and Client B receive state update
  4. Both render ship at same position (within tolerance)

Verification:
  - Client B's rendered ship position matches Client A's within 100 km
  - Both clients show same orbital elements in UI panels
  - Both clients show same encounter markers
  - Sail angle change appears on Client B within 500ms
```

#### ITC-5: Time Warp Change During Trajectory
```
Setup:
  - Ship under thrust at 1000000x
  - Client requests speed change to pause, then to 100x, then to 10000000x

Sequence:
  1. Running at 1M x, server sending updates
  2. Client requests pause -- server stops time
  3. Verify: ship position frozen for 5 real seconds
  4. Client requests 100x -- server resumes slowly
  5. Verify: ship position changes very slowly
  6. Client requests 10M x -- server advances rapidly
  7. Verify: ship position changes rapidly, trajectory prediction updates

Verification:
  - At each speed, position delta per server update is proportional to timeScale
  - No position jumps on speed transitions
  - Trajectory prediction recalculates at each speed (cache invalidated by time change)
```

#### ITC-6: Save/Load Round-Trip Through Server
```
Sequence:
  1. Configure ship: specific sail angles, destination, autopilot, camera position
  2. Advance time 200 game days
  3. Client requests save
  4. Server serializes state (mirroring serializeGameState() in saveState.js)
  5. Client requests load of saved state
  6. Server deserializes and applies (mirroring deserializeGameState())
  7. Server sends full state update to client

Verification:
  - All fields match: orbitalElements, sail, soiState, thruster, destination,
    autopilot, time, julianDate
  - Ship position after load matches position at save time
  - Trajectory prediction after load matches prediction at save time
  - No stale cache artifacts (encounter markers from before load are cleared)
```

#### ITC-7: Trajectory Prediction Remains Client-Side
```
The trajectory predictor (trajectory-predictor.js) and intersection detector
(intersectionDetector.js) should remain client-side for performance (they run
every frame for rendering). They must produce accurate results using the
server's authoritative orbital elements.

Sequence:
  1. Server sends authoritative state at T=0
  2. Client runs predictTrajectory() locally with server's orbital elements
  3. Server advances 60 game days
  4. Client compares prediction for T+60 days against server's actual position

Verification:
  - |predicted_position(T+60) - server_actual_position(T+60)| < 1000 km
    for zero-thrust (should be < 1 km for Keplerian)
  - |predicted_position(T+60) - server_actual_position(T+60)| < 10,000 km
    for full thrust (RK2 integration drift is expected)

This test validates that the trajectory predictor can run independently
on the client using server-provided orbital elements.
```

---

## 8. Test Infrastructure Requirements

### 8.1 Server-Side Test Framework

**Required components:**
1. **Node.js test runner** using `node:test` (already used by orbital.test.js and orbital-maneuvers.test.js)
2. **Physics replay harness**: Takes JSON input (orbital elements + commands), runs N frames, outputs JSON state
3. **Network simulation**: Mock WebSocket with configurable latency, jitter, packet loss
4. **Determinism comparator**: Runs same scenario on two instances, compares outputs
5. **Golden file tests**: Canonical physics traces for regression detection

### 8.2 Shared Code Architecture

The following modules are pure functions and can be shared between client and server with zero modification:

| Module | Exports Used by Physics |
|--------|------------------------|
| `orbital.js` | getPosition, getVelocity, meanMotion, solveKepler, etc. |
| `orbital-maneuvers.js` | calculateSailThrust, applyThrust, getSailThrustDirection |
| `soi.js` | checkSOIEntry, checkSOIExit, helioToPlanetocentric, stateToElements |
| `config.js` | SPEED_PRESETS, PHYSICS_CONFIG, SOI_RADII, GRAVITATIONAL_PARAMS |
| `celestialBodies.js` | Planet data and positions (needs getPosition, no DOM) |
| `evaluate-trajectory.js` | Already documented as "pure - no state, no side effects, no DOM" |

Modules that CANNOT be shared (DOM dependencies):
| Module | DOM Dependency |
|--------|---------------|
| `renderer.js` | Canvas 2D context |
| `uiUpdater.js` | document.getElementById |
| `controls.js` | Event listeners, DOM manipulation |
| `ui-components.js` | DOM panels |
| `starfield.js` | Canvas rendering |
| `planetTextures.js` | WebGL context |

### 8.3 Test Automation

**Recommended CI pipeline:**
1. On every commit: run all `node:test` tests (orbital.js, orbital-maneuvers.js, shipPhysics.js)
2. Nightly: run determinism golden file comparison (10,000 frame traces)
3. On PR: run integration test suite (ITC-1 through ITC-7) in headless mode
4. Weekly: run network failure simulation suite (TC-N1 through TC-N5)

---

## 9. Risk Assessment

### 9.1 Highest-Risk Code Paths

| Risk | Code Path | Impact | Mitigation |
|------|-----------|--------|------------|
| **CRITICAL** | SOI transitions across network | Ship position jumps, wrong reference frame | Server-authoritative transitions only, full state snapshot on transition |
| **CRITICAL** | RK2 sub-stepping divergence | Client prediction doesn't match server | Share exact same physics code, determinism golden tests |
| **HIGH** | Time warp at 500M x with thrust | 50 sub-steps insufficient, ~2-day steps | Cap effective warp or increase MAX_SUBSTEPS server-side |
| **HIGH** | Reconnect state restoration | Missing fields cause crashes | Model on saveState.js:deserializeGameState(), test every field |
| **MEDIUM** | Tripometer accuracy | Distance tracking wrong with server updates | Reset tripometer on reconnect, accumulate from server positions |
| **MEDIUM** | Cache invalidation on server corrections | Stale trajectory/intersection data | Clear all caches on any server state correction |
| **LOW** | Visual element lerping | Smooth rendering during corrections | Client-only concern, existing code handles this |

### 9.2 Testing Priority Order

1. **Determinism** (TC-D1 through TC-D4) -- foundation for everything else
2. **SOI transitions** (TC-S1 through TC-S5) -- most complex state changes
3. **Regression** (Section 6) -- ensure no existing functionality breaks
4. **Network failures** (TC-N1 through TC-N5) -- resilience
5. **Integration** (ITC-1 through ITC-7) -- end-to-end validation
6. **Time warp** (TC-T1 through TC-T5) -- edge cases
7. **Cheat detection** (TC-C1 through TC-C6) -- security layer

---

## 10. Summary of Deliverables

| # | Test Category | Test Cases | Priority | Infrastructure Needed |
|---|---------------|------------|----------|----------------------|
| 1 | Determinism | TC-D1 to TC-D4 | P0 | Golden file harness |
| 2 | Network Failures | TC-N1 to TC-N5 | P1 | WebSocket mock |
| 3 | Time Warp | TC-T1 to TC-T5 | P1 | Speed preset validation |
| 4 | SOI Transitions | TC-S1 to TC-S5 | P0 | Frame conversion tests |
| 5 | Cheat Detection | TC-C1 to TC-C6 | P2 | Input validation layer |
| 6 | Regression | Existing test suite | P0 | Convert browser tests to Node.js |
| 7 | Integration | ITC-1 to ITC-7 | P1 | Full server + client harness |

**Total: 31 test cases** across 7 categories, requiring a new server-side test infrastructure built on Node.js `node:test` with mock networking capabilities.
