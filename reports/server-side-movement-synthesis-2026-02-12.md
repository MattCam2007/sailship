# Server-Side Movement: Cross-Perspective Synthesis & 10 Architecture Options

**Date**: 2026-02-12
**Input**: 7 reviewer reports (Physicist, Solar Sailing Expert, Architect, Functional Tester, Failure Analyst, Best Practices, Regression Checker)
**User Priorities**: Performance and Accuracy

---

## Part 1: What All 7 Reviewers Agree On

These findings were confirmed by every perspective:

### 1. The Physics Libraries Are Already Server-Ready

The pure-function libraries in `src/js/lib/` have zero DOM dependencies:
- `orbital.js` -- zero imports, pure Kepler math
- `orbital-maneuvers.js` -- imports only orbital.js, soi.js, config.js
- `soi.js` -- imports only orbital.js, config.js
- `config.js` -- imports only J2000 constant from orbital.js

All `typeof window` checks gracefully no-op in Node.js. These already run in Web Workers. **No modification needed to share them with a server.**

### 2. Trajectory Prediction Must Stay Client-Side

The trajectory predictor runs up to 8,760 RK4 steps per frame for visualization. All 7 reviewers agree this is purely visual and must not burden the server. The green spiral line, encounter markers, closest approaches, and node crossings are all derived from the trajectory prediction.

### 3. SOI Transitions Are the #1 Risk

Every reviewer flagged SOI transitions as the most dangerous failure mode. When the ship crosses a planet's sphere of influence, the entire coordinate frame changes (heliocentric -> planetocentric). If client and server disagree on when this happens, the ship's position becomes meaningless -- coordinates in the wrong frame produce ~1 AU errors.

### 4. Node.js Is the Right Server Language (If a Server Is Built)

Code sharing with zero duplication. Same V8 engine guarantees identical `Math.sin/cos/sqrt` results. No transpilation, no build step. One `ws` dependency (8KB, zero transitive deps).

### 5. Time Warp Is the Hardest Challenge

At 500Mx, one frame = 96.5 game-days. Network latency of 100ms = 2,312 game-days of positional uncertainty. The 50 sub-step cap produces ~2-day integration steps (23x larger than the designed 2-hour steps), degrading accuracy severely.

---

## Part 2: Where Reviewers Disagree

### Fundamental Question: Should We Even Build a Server?

**Best Practices** argues strongly AGAINST server-side physics:
> "Server-side authoritative physics would be the most expensive, most disruptive, and least necessary solution to the anti-cheat problem. Replay validation achieves comparable integrity guarantees at 1/10th the complexity."

They note it violates: zero npm dependencies, static-site deployment, GitHub Pages compatibility, offline-first architecture, and the `python3 -m http.server` deployment story.

**Architect** and **Physicist** argue FOR it, noting the physics libraries are already environment-agnostic and the server is an overlay, not a replacement. Offline mode would continue to work with graceful degradation.

**Resolution**: This is a spectrum, not a binary choice. The 10 options below range from "no server" to "full server authority," allowing you to choose the right tradeoff.

### Integration Method: RK2 on Elements vs. RK4 on State Vectors

**Physicist** and **Solar Sailing Expert** both discovered that `shipPhysics.js` uses RK2 on orbital elements while `trajectory-predictor.js` uses RK4 on state vectors. The comments claim they match -- they don't.

> Physicist: "These two methods will produce different trajectories for the same initial conditions."
> Solar Sailing Expert: "This is causing encounter marker inaccuracy TODAY."

Both recommend unifying on RK4 state vectors. This is a **pre-existing bug** independent of any server migration.

**Resolution**: Unifying the integration method is valuable regardless of which architecture option is chosen. It fixes the existing trajectory predictor divergence and improves accuracy.

### Authoritative State: Orbital Elements vs. State Vectors

**Physicist** recommends state vectors `{x, y, z, vx, vy, vz}` as the canonical server representation (avoids roundtrip conversion errors).

**Architect** and **Regression Checker** recommend orbital elements (compact, analytical extrapolation between updates, matches existing client data flow).

**Resolution**: For performance, the server should *integrate* using state vectors (RK4) but *store and transmit* orbital elements (converted after each physics tick). This gives integration accuracy without changing the client's data model. The conversion happens once per server tick, not per sub-step.

---

## Part 3: Performance Analysis (User Priority #1)

### CPU Cost Per Player

From the **Failure Analyst's** detailed trace through `updateShipPhysics()`:

| Time Warp | Sub-steps/Frame | Cost/Player/Frame | Players per Core @ 60 Hz |
|-----------|----------------|-------------------|--------------------------|
| 1x | 1 | ~50 us | 333 |
| 10,000x | ~1 | ~50 us | 333 |
| 1,000,000x | ~14 | ~0.7 ms | 24 |
| 10,000,000x | 50 (capped) | ~2.5 ms | 6 |
| 500,000,000x | 50 (capped) | ~2.5 ms | 6 |

### Key Performance Optimizations (All Reviewers Agree)

1. **0% deployment = analytical Kepler propagation**: When sails are retracted, `getPosition(elements, futureTime)` gives exact results instantly regardless of time span. Players often retract sails while waiting. This is the single biggest optimization.

2. **Batch computation, not 60 Hz ticks**: The server doesn't need to match the client's frame rate. Between sail changes, the trajectory is fully determined. The server computes forward to the next input or SOI boundary, then idles.

3. **Remove the 50 sub-step cap on server**: No frame-rate constraint. At 500Mx, compute all ~1,158 sub-steps at proper 2-hour resolution. This dramatically improves accuracy.

4. **Adaptive tick rate**: Low warp = infrequent updates (1-2 Hz). High warp = more frequent updates (10 Hz). Extreme warp = checkpoint-based updates (on input change or every N game-days).

### Scaling Estimate (Batch Model)

| Players | Avg Cost (mixed warps) | Cores Needed |
|---------|----------------------|--------------|
| 10 | ~5 ms/sec | <1 |
| 100 | ~50 ms/sec | <1 |
| 1,000 | ~500 ms/sec | 1 |
| 10,000 | ~5 sec/sec | 5 |

**Verdict**: Performance is NOT the bottleneck for any reasonable player count. A single commodity server handles thousands of players.

---

## Part 4: Accuracy Analysis (User Priority #2)

### Current Accuracy Problems (Pre-Existing)

1. **Integration mismatch**: Ship physics (RK2 elements) diverges from trajectory predictor (RK4 state vectors). Encounter markers are already positioned based on a different trajectory than the ship actually follows.

2. **50 sub-step cap**: At 500Mx, sub-steps are 1.93 days (23x larger than designed). Position error: ~45,000 km per frame, compounding.

3. **Kepler solver initial guess discontinuity**: Sharp branch at e=0.8 in `solveKepler()` can cause different convergence paths for nearly identical inputs.

4. **Near-parabolic singularity**: The nudge at e~1.0 in `stateToElements()` can cause one side to classify an orbit as elliptic and the other as hyperbolic.

### Accuracy Improvements Enabled by Server Migration

1. **Unified RK4 integration**: Server and client trajectory predictor both use `integrateStateRK4()`. Ship actually goes where the green line predicts.

2. **No sub-step cap**: Server computes all necessary steps at 2-hour resolution regardless of time warp.

3. **Universal variable formulation**: Route all propagation through `propagateStateUniversal()` (already in the code at orbital.js:348) to handle all orbit types without branching on eccentricity.

4. **Deterministic state**: Server is the single source of truth. No disagreement on orbit type, SOI state, or reference frame.

### Accuracy Improvements WITHOUT a Server

Several accuracy fixes can be made client-side only:
- Unify integration method (RK4 state vectors for both ship physics and trajectory predictor)
- Increase sub-step cap for high time warps
- Use universal variable formulation
- Fix the Kepler solver initial guess

---

## Part 5: Cross-Perspective Iteration

After reviewing all 7 reports, here is the synthesis with each perspective's reaction:

### Round 1: The "Best Practices" Challenge

**Best Practices** argues replay validation is sufficient. Let's stress-test this:

- **Physicist**: "Replay validation works for deterministic physics. But the physics is only deterministic if client and server use identical floating-point operations. JavaScript satisfies this within a single engine version."
- **Solar Sailing Expert**: "Replay is fine for post-hoc validation. But it cannot prevent real-time cheating during a live competitive race. If two ships are racing to Mars, one player can't wait for post-hoc validation."
- **Failure Analyst**: "Replay validation has zero network failure modes. That's a massive advantage. Every other option introduces at least 7 new failure categories."

**Verdict**: Replay validation is the **best ROI** option. But if real-time competitive integrity is needed (e.g., live racing), it's insufficient. The choice depends on the game mode.

### Round 2: The "Accuracy vs. Performance" Tradeoff

**Physicist** and **Solar Sailing Expert** want maximum accuracy (RK4, no sub-step cap, universal variables). **Failure Analyst** warns this increases server CPU load.

- At 500Mx with no sub-step cap: 1,158 RK4 steps per frame vs. 50 RK2 steps currently
- Each RK4 step costs ~4x an RK2 step (4 derivative evaluations vs 2)
- Total cost increase: ~46x per player at 500Mx

**But**: The batch computation model makes this irrelevant. The server doesn't need to compute per-frame -- it computes per-sail-change. Between changes, no work is done. The question is how fast a player can change sail settings at 500Mx, and the answer is "once every few seconds of real time."

**Verdict**: Use RK4 with no sub-step cap. The accuracy gain is massive and the performance cost is absorbed by the batch model.

### Round 3: The "SOI Transition" Protocol

All reviewers agree SOI transitions must be server-authoritative. The debate is about the protocol:

- **Architect**: "Client sends SOI proximity warning, server decides."
- **Failure Analyst**: "Server sends SOI_TRANSITION event, client must ACK before server advances."
- **Regression Checker**: "The transition must be atomic: orbital elements + soiState + extremeFlybyState in one message."

**Verdict**: Combine all three. Server detects proximity, performs transition atomically, sends complete new state, waits for ACK. Client freezes local SOI detection during the proximity window.

---

## Part 6: The 10 Architecture Options

Ordered from lightest to heaviest. Each includes estimated complexity, performance impact, accuracy impact, and anti-cheat effectiveness.

---

### Option 1: Do Nothing (Status Quo)

**What**: Keep everything client-side. No server.

**Complexity**: 0 lines of code
**Performance**: Maximum (no network overhead, no server CPU)
**Accuracy**: Current level (RK2/RK4 mismatch exists, 50 sub-step cap)
**Anti-Cheat**: None. Player can modify any value in the browser console.
**Deployment**: `python3 -m http.server 8080` (unchanged)

**Best for**: Single-player, no competitive features.

---

### Option 2: Fix Pre-Existing Accuracy Bugs (Client-Only)

**What**: Unify integration method to RK4 state vectors. Remove 50 sub-step cap. Use universal variable formulation. Fix Kepler solver initial guess.

**Complexity**: ~200-400 lines changed in shipPhysics.js, orbital.js
**Performance**: Slightly more CPU per frame at extreme time warps (RK4 is ~2x RK2 per step, but accuracy allows larger steps). Net neutral.
**Accuracy**: Major improvement. Ship goes where the green line predicts. Encounter markers become reliable. Near-parabolic orbits handled cleanly.
**Anti-Cheat**: None.
**Deployment**: Unchanged.

**Best for**: Everyone, regardless of whether a server is added later. This is pure improvement.

---

### Option 3: Statistical Anomaly Detection (Offline Analysis)

**What**: Pure-function library that analyzes save states or flight logs for physically impossible maneuvers. Checks: acceleration exceeding sail limits, velocity changes without thrust history, position discontinuities, impossible intercept times.

**Complexity**: ~100-200 lines in a new `lib/anomaly-detector.js`
**Performance**: Zero runtime impact. Runs offline against saved data.
**Accuracy**: Not applicable (doesn't affect simulation).
**Anti-Cheat**: Detects gross cheating (teleportation, infinite thrust). Cannot detect subtle parameter tweaking (e.g., sail area increased by 10%). Post-hoc only.
**Deployment**: Unchanged. Can run in browser or Node.js.

**Best for**: Leaderboard validation where gross cheating is the concern.

---

### Option 4: Signed Checkpoints (Stateless Server)

**What**: Server issues cryptographic challenges. Client sends periodic state snapshots. Server validates against physics and signs valid snapshots with HMAC. Valid signatures required for leaderboard submission.

**Complexity**: ~80-120 lines per side. Simple HTTP endpoint, not WebSocket.
**Performance**: Negligible. One HTTP request every N game-days.
**Accuracy**: Server validates energy conservation and sail physics bounds. Catches large deviations.
**Anti-Cheat**: Moderate. Validates milestones but not real-time behavior. Cannot detect cheating between checkpoints.
**Deployment**: Server needed but can be a serverless function (Lambda/Workers). Game works offline without it.

**Best for**: Achievement/leaderboard systems where periodic validation suffices.

---

### Option 5: Replay Validation (Deterministic Replay)

**What**: Client records all inputs (sail angle changes + timestamps) as a compact event log. Server replays them through identical physics code to verify the trajectory matches the claimed result.

**How it works**:
```
Client records: [{t: JD, type: 'sail', yaw: 0.6, pitch: 0, deploy: 100}, ...]
Server replays: Runs same integrateStateRK4() with same inputs
Server verifies: |replay_end_state - claimed_end_state| < tolerance
```

**Complexity**: ~50-100 lines client-side (input recorder), ~100-200 lines server-side (replay engine). Total: ~200 lines.
**Performance**: Zero real-time impact. Replay runs asynchronously. A 1-year flight replays in milliseconds.
**Accuracy**: Exact (uses identical physics code on same V8 engine). **This is the highest-accuracy validation method.**
**Anti-Cheat**: High. Any modification to physics constants, orbital elements, or time produces a non-matching replay. The only attack vector is modifying the replay log itself, which can be mitigated with server-issued challenges.
**Deployment**: Server can be a simple HTTP endpoint or serverless function. Game works offline.

**Best for**: Competitive leaderboards, time trials, achievement verification. **Best ROI of all options.** Recommended by the Best Practices reviewer.

---

### Option 6: Replay Validation + Live Checkpoints (Hybrid)

**What**: Combines Option 5 (replay validation) with periodic live state checks. The server issues challenges at random intervals during gameplay. Client must respond with a valid state snapshot that passes replay verification from the last checkpoint.

**How it works**:
```
Server: "What is your state at JD 2461200.0?"
Client: sends {orbitalElements, inputLog since last checkpoint}
Server: replays inputLog from last known state, verifies match
```

**Complexity**: ~300-500 lines total. Needs WebSocket for challenge delivery.
**Performance**: Near-zero. One challenge every 30-60 seconds of real time.
**Accuracy**: Same as Option 5 (exact replay).
**Anti-Cheat**: Very high. Real-time cheating is caught within 30-60 seconds. The window of opportunity shrinks with challenge frequency.
**Deployment**: Needs a lightweight WebSocket server. Game degrades gracefully without it.

**Best for**: Live competitive play where cheating must be caught quickly but full server physics is overkill.

---

### Option 7: Thin Validation Server (Energy Conservation Monitor)

**What**: Server receives sail commands and periodic state snapshots. Instead of running full physics, it validates using conservation laws and physics bounds:
- Orbital energy change rate matches expected sail thrust work
- Velocity changes are consistent with sail acceleration at current distance
- SOI transitions are physically possible (approach velocity, entry angle)
- Thruster fuel is correctly decremented

**Complexity**: ~400-600 lines. WebSocket server, but lightweight physics.
**Performance**: Very low server CPU (no integration, just bound checking). Handles tens of thousands of concurrent players.
**Accuracy**: Catches any cheat that violates energy conservation or physics bounds. Cannot catch subtle exploits that stay within bounds (e.g., using the exact right integration step size to extract marginally more energy).
**Anti-Cheat**: Moderate-High. Catches most practical cheats without running full simulation.
**Deployment**: Requires server. Game works offline without it.

**Best for**: Large player bases where running full physics per player is too expensive, but you still need real-time integrity.

---

### Option 8: Event-Driven Server (Lazy Evaluation)

**What**: Server stores the last known authoritative state and sail configuration. Physics is NOT computed continuously. Instead, the server computes forward ONLY when:
- A sail/thruster input changes (recompute from last known state to current time)
- An SOI boundary is crossed (detected by the client, verified by server)
- Another player queries this ship's position (multiplayer)
- A checkpoint interval expires (e.g., every 100 game-days)

Between events, the ship's trajectory is fully determined by its orbital elements + sail state. The server doesn't compute it until someone needs it.

**Complexity**: ~500-800 lines. Server stores events, catches up on demand.
**Performance**: Excellent. Only computes when needed. Idle players cost zero CPU. Active players cost proportional to their sail change frequency, not their time warp.
**Accuracy**: High. Uses full RK4 integration when it does compute. No sub-step cap.
**Anti-Cheat**: High. Server computes authoritative state and compares with client. Divergence flags cheating.
**Deployment**: Requires persistent server. Game works offline without it.

**Best for**: Games with many idle/AFK players and bursty activity. Scales very well.

---

### Option 9: Hybrid Client-Predicted / Server-Authoritative (Recommended by Architect)

**What**: Client continues to run full physics locally for responsive visuals. Server runs identical physics as the source of truth. Server sends authoritative orbital elements periodically. Client reconciles using existing visual element lerping.

**Key design decisions**:
- Server uses `integrateStateRK4()` from the shared `orbital-maneuvers.js`
- Client sends only inputs: {yaw, pitch, deployment, thrusterBurn, timeWarp}
- Server sends: full orbital elements + soiState + sail + thruster state
- SOI transitions are server-authoritative with client lockout
- Server is sole authority for: time, fuel, ship config, SOI state
- Client is authority for: camera, display options, trajectory prediction

**Protocol**: 6 message types over WebSocket (SAIL_UPDATE, TIME_WARP, THRUSTER_BURN, STATE, SOI_TRANSITION, ACK). ~94 bytes per state update.

**Complexity**: ~1,000-1,500 lines. 4 new server files, 3 modified client files. ~8 days of work.
**Performance**: Good. Batch computation model. Single core handles hundreds of players.
**Accuracy**: Best. Unified RK4 integration. No sub-step cap. Universal variable formulation. Deterministic (same V8 engine).
**Anti-Cheat**: Very High. Server computes all physics. Client can only send bounded control inputs.
**Deployment**: Requires server process. Game falls back to local physics when server unavailable.

**File structure**:
```
server/
  server.js              -- HTTP + WebSocket (serves static files too)
  physics-engine.js       -- Imports from src/js/lib/, runs physics
  session.js              -- Per-player state
  validator.js            -- Input bounds checking
  celestial-state.js      -- Planet positions via getPosition()
src/js/core/
  serverSync.js           -- NEW: WebSocket client, state reconciliation
```

**Best for**: Full competitive integrity with responsive gameplay. The "do it right" option.

---

### Option 10: Full Server-Authoritative (Dumb Client)

**What**: ALL physics computation on the server. Client sends inputs, receives position/velocity every frame. Client does zero physics -- it only renders.

**How it works**:
- Server runs at 60 Hz per player
- Server sends `{x, y, z, vx, vy, vz}` every frame (or at server tick rate)
- Client interpolates between position updates for smooth rendering
- Trajectory prediction moves to server (sent as an array of future positions)
- Encounter markers computed server-side and sent to client

**Complexity**: ~2,000-3,000 lines. Major client refactor (remove all physics from client).
**Performance**: Poor. ~2.5ms per player per frame at high warp. 6 players per core at 500Mx. Trajectory prediction for all players adds significant load.
**Accuracy**: Maximum (server is sole source of truth with no reconciliation needed).
**Anti-Cheat**: Maximum. Client literally cannot cheat -- it only renders server-provided positions.
**Deployment**: Server REQUIRED. Game does not function without it. No offline mode.

**Best for**: Tournament/esports scenarios where absolute integrity justifies the infrastructure cost. Overkill for most cases.

---

## Part 7: Recommendation Matrix

| Option | Performance | Accuracy | Anti-Cheat | Complexity | Offline? |
|--------|------------|----------|------------|------------|----------|
| 1. Do Nothing | +++++ | ++ | - | - | Yes |
| 2. Fix Client Bugs | +++++ | ++++ | - | + | Yes |
| 3. Statistical Detection | +++++ | ++ | + | + | Yes |
| 4. Signed Checkpoints | +++++ | ++ | ++ | + | Yes |
| 5. Replay Validation | +++++ | +++++ | ++++ | + | Yes |
| 6. Replay + Live Checks | +++++ | +++++ | +++++ | ++ | Degrades |
| 7. Thin Validation | +++++ | ++ | +++ | ++ | Degrades |
| 8. Event-Driven Server | ++++ | ++++ | ++++ | +++ | Degrades |
| 9. Hybrid (Recommended) | ++++ | +++++ | +++++ | +++ | Degrades |
| 10. Full Server Auth | ++ | +++++ | +++++ | +++++ | No |

## Part 8: What I Would Do

**Phase 1 (immediately)**: Option 2 -- Fix the pre-existing accuracy bugs. Unify on RK4, fix the Kepler solver, remove sub-step cap. This improves the game today.

**Phase 2 (for competitive features)**: Option 5 or 6 -- Replay validation. Enormous anti-cheat bang for minimal complexity. The deterministic physics engine makes this trivially reliable.

**Phase 3 (if multiplayer/live racing is needed)**: Option 9 -- Hybrid server. By this point, Option 2's accuracy fixes are already in place, making the server implementation much cleaner (unified RK4 integration, no element-roundtrip errors).

This phased approach lets you ship improvements at each step without committing to the full server architecture upfront. Each phase is independently valuable.

---

*Generated from 7 reviewer perspectives: Physicist, Solar Sailing Expert, Architect, Functional Tester, Failure Analyst, Best Practices, Regression Checker*
