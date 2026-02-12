# Best Practices Review: Server-Side Movement for Sailship

**Reviewer**: Best Practices Agent
**Date**: 2026-02-11
**Scope**: Evaluating server-side physics/anti-cheat against project conventions

---

## Executive Summary

Server-side authoritative physics is **architecturally incompatible** with Sailship's foundational design philosophy. The project is a single-player, zero-dependency, serve-and-play browser game with no build system. Adding server-side physics would violate nearly every convention that makes this project elegant. Instead, I recommend a **checkpoint validation** approach that preserves the game's offline-first architecture while enabling competitive integrity when needed.

**Verdict**: Do not pursue server-side authoritative physics. Use replay/checkpoint validation if anti-cheat is needed.

---

## 1. Zero-Dependency Philosophy

### Current State (Excellent)

The project demonstrates exceptional discipline:

- `package.json` has zero `dependencies` and zero `devDependencies`
- No `node_modules/` directory exists
- Tests run with `node --test` (Node.js built-in test runner)
- Served with `python3 -m http.server 8080`
- All physics/math is implemented from scratch in pure ES6 modules
- Web Workers used for parallel computation without any library

This is not accidental minimalism. It is a deliberate architectural choice that keeps the project portable, auditable, and maintainable.

### Server Runtime Analysis

| Option | Dependencies | Complexity | Philosophy Match |
|--------|-------------|------------|------------------|
| **Node.js built-in HTTP + WebSocket** | 0 npm packages | HIGH - raw WebSocket framing is 200+ lines of low-level binary protocol code | Moderate - no npm deps but requires implementing RFC 6455 by hand |
| **Python asyncio + websockets** | 1 pip package (`websockets`) | MODERATE - but introduces Python as a runtime dependency for game logic | Poor - game physics in JavaScript cannot share code with Python server |
| **Deno** | 0 packages | LOW - built-in WebSocket, runs ES modules natively | Best of the server options - but still adds a mandatory server process |
| **No server** | 0 | ZERO | Perfect match |

### Recommendation

None of the server options achieve zero-dependency parity with the current design. The least-bad option is Deno (runs the same ES modules, no package manager), but even this fundamentally changes the deployment model from "open an HTML file" to "run a server process + open a client."

**The zero-dependency philosophy is not about counting packages. It is about the deployment story**: `cd src && python3 -m http.server 8080` serves a complete, functional game. Adding a required game server transforms this from a static site into a distributed system.

---

## 2. Code Sharing Analysis

### Current Module Purity

The lib/ directory contains genuinely pure function libraries:

```
orbital.js          - Zero imports. Pure math. No side effects.
orbital-maneuvers.js - Imports only orbital.js and soi.js. Pure functions + 2 debug window bindings.
evaluate-trajectory.js - Pure functions. Already runs in Web Workers.
intersectionDetector.js - Pure geometry.
soi.js              - Pure reference frame transforms + config lookups.
```

These modules already run in two contexts:
1. **Main thread** (browser) - for real-time physics
2. **Web Workers** (browser) - for parallel trajectory evaluation

The `eval-worker.js` and `worker-pool.js` demonstrate that the pure function libraries are already environment-agnostic. The only browser-specific code is guarded with `typeof window !== 'undefined'` checks (found in `orbital-maneuvers.js`, `soi.js`, `trajectory-predictor.js`).

### Would a `shared/` Directory Help?

**No.** The current structure already cleanly separates shared-capable code:

```
lib/         - Pure functions (already shareable, already proven in Workers)
core/        - Game state management (browser-specific: DOM, localStorage)
ui/          - Rendering (browser-specific: Canvas, DOM)
data/        - Game data (pure data, already shareable)
config.js    - Constants (pure data, already shareable)
```

Creating a `shared/` directory would:
- Duplicate the existing `lib/` concept
- Break the established `data/ -> core/ -> ui/` dependency flow
- Add a directory that serves no purpose unless a server exists
- Create an import path change across every file that references shared code

The lib/ directory IS the shared code. The architecture already got this right.

### Coupling Concern

If server code imports `lib/orbital.js` directly, it creates a coupling where changes to physics must be validated in two runtime contexts. This is manageable (the Web Worker precedent proves it), but it means:

- Physics changes must be tested server-side AND client-side
- The test story becomes more complex (browser console tests + Node.js tests + server integration tests)
- The "one concept per file" principle gets stretched when a file serves three masters

---

## 3. Module Structure for Server Code

### If a Server Were Added (Hypothetical)

The least-disruptive structure would be:

```
server/
  server.js           - HTTP + WebSocket server (entry point)
  gameLoop.js          - Server-side tick loop
  sessionManager.js    - Connection/session tracking
  protocol.js          - Message format definitions
  validator.js         - State validation logic
```

This keeps server code completely outside `src/`, preserving the "src/ is a static site" invariant.

### Critical Convention: Do NOT Mirror Client Structure

The server does not need `core/`, `ui/`, or `data/` directories. The server's job is narrower:
1. Accept inputs (sail angle, deployment, pitch)
2. Run physics forward
3. Validate results
4. Broadcast authoritative state

It should import from `src/js/lib/` and `src/js/data/` and `src/js/config.js` directly, using those as read-only dependencies.

### Protocol Definition Location

The protocol definition should live in `src/js/lib/protocol.js` (if it needs to be shared) or in `server/protocol.js` (if server-only). Given the project's "one concept per file" standard, a single `protocol.js` defining message shapes as plain objects would be appropriate.

---

## 4. Complexity Budget

### What Server-Side Physics Actually Requires

| Component | Estimated LOC | Complexity | New Patterns Introduced |
|-----------|--------------|------------|-------------------------|
| WebSocket server (Node.js built-in) | 200-300 | HIGH | Binary protocol framing, HTTP upgrade |
| WebSocket server (Deno) | 40-60 | LOW | Deno runtime |
| Connection management | 100-150 | MODERATE | Session lifecycle, heartbeat |
| Server game loop | 80-120 | MODERATE | setInterval-based tick, per-session state |
| State synchronization protocol | 150-250 | HIGH | Message serialization, delta compression, interpolation |
| Client-side prediction + reconciliation | 200-400 | VERY HIGH | Prediction buffer, rollback, interpolation, jitter handling |
| Error handling (network) | 100-200 | HIGH | Reconnection, state recovery, timeout handling |
| Authentication/sessions | 50-100 | MODERATE | Token generation, session mapping |
| **Total new code** | **920-1580** | | |

### Current Codebase Size (Approximate)

```
lib/          ~2800 lines (pure physics/math)
core/         ~1400 lines (game state)
ui/           ~3000 lines (rendering, controls, UI)
data/         ~600 lines (celestial bodies, ships)
config.js     ~700 lines
main.js       ~330 lines
workers/      ~300 lines
```

Total: approximately 9,100 lines of JavaScript.

Adding server-side physics would increase the codebase by 10-17%, and that new code would be **the most complex code in the project** -- networking code with race conditions, timing sensitivity, and failure modes that pure orbital mechanics never faces.

### Is It Justified?

**For anti-cheat in a solar sailing navigation game? No.**

The game's competitive value (if any) comes from skill in orbital mechanics -- finding optimal sail angles, timing transfers, executing gravity assists. The physics is deterministic: given the same inputs, orbital.js produces the same outputs. This determinism is the key insight that enables much simpler anti-cheat.

---

## 5. Offline Mode and the Deployment Story

### What Makes This Project Special

The current architecture has a property that is extremely rare and valuable:

```bash
cd src && python3 -m http.server 8080
# Game is running. No database. No backend. No API keys. No Docker.
```

This is not just convenient -- it makes the project:
- **Forkable**: Anyone can clone and run it
- **Deployable anywhere**: GitHub Pages, any static host, a USB drive
- **Inspectable**: All game logic is visible in the browser's devtools
- **Archivable**: The game will still work in 20 years without any server

Adding a required server would:
- Require two processes to play (server + client)
- Make GitHub Pages deployment impossible (no server-side execution)
- Require documentation for server setup, configuration, and troubleshooting
- Introduce the concept of "the game is down" for the first time
- Make offline play impossible without additional complexity (service workers, offline detection, mode switching)

### Dual-Mode Complexity

If the game must work both with and without a server, the client needs:

```javascript
// Every physics update becomes conditional
if (serverConnected) {
    sendInputToServer(sailAngle, deployment, pitch);
    applyServerState(lastServerUpdate);
} else {
    updateShipPhysics(player, timeScale);
}
```

This dual-mode pattern would touch `main.js`, `shipPhysics.js`, `controls.js`, `gameState.js`, and `uiUpdater.js` -- essentially every core module. The complexity is not additive; it is multiplicative. Every feature must now be tested in online and offline modes.

---

## 6. Testing Patterns

### Current Testing (Clean and Consistent)

The project uses two testing approaches that match its philosophy:

**1. Node.js built-in test runner** (for pure lib/ functions):
```javascript
// orbital.test.js - uses node:test and node:assert
import { describe, it } from 'node:test';
import assert from 'node:assert';
```

Run with: `node --test src/js/**/*.test.js`

**2. Browser console tests** (for integration/rendering):
```javascript
import('/js/lib/orbital.test.js').then(m => m.runAllTests())
```

Both approaches: zero dependencies, instant feedback, no configuration.

### What Server Code Would Require

Server testing needs:
- **WebSocket client simulation** -- testing message handling requires a WebSocket client, which is either browser-only (`new WebSocket()`) or requires a library
- **Async test patterns** -- server code is inherently asynchronous (connections, message passing, timeouts)
- **Integration tests** -- verifying that client + server agree on physics outcomes requires running both simultaneously
- **Network failure simulation** -- testing reconnection, timeout, and partial message scenarios

The Node.js built-in test runner can handle async tests, but WebSocket testing without a library is painful. You would need to implement a test WebSocket client using Node's `net` module and the WebSocket framing protocol -- essentially writing a second WebSocket implementation just for testing.

### Recommendation

If server code is ever added, tests should follow the existing pattern:
- Pure validation logic: `node:test` with `node:assert` (same as orbital.test.js)
- Server integration: A separate test script that spawns the server, connects, and validates
- No test framework dependencies (no Jest, Mocha, Vitest)

---

## 7. Alternative Anti-Cheat Approaches

### Approach A: Replay Validation (RECOMMENDED)

**Concept**: The client records all inputs (sail angle changes + timestamps). The server replays them deterministically to verify the trajectory.

**Why it fits Sailship perfectly**:

1. **The physics is deterministic.** `orbital.js` and `orbital-maneuvers.js` are pure functions. Same inputs always produce same outputs. This is already proven by the Web Worker architecture -- workers compute trajectories identically to the main thread.

2. **Inputs are minimal.** A solar sail ship has only three controls: yaw angle, pitch angle, and deployment percentage. Plus time warp speed. The input stream is tiny -- perhaps one event per few seconds of real time.

3. **Zero runtime coupling.** The game plays exactly as it does today. Validation happens asynchronously after a session ends (or at checkpoints).

4. **Implementation is small:**

```javascript
// Client-side: record inputs (add to controls.js)
const inputLog = [];
function recordInput(type, value, gameTime) {
    inputLog.push({ type, value, t: gameTime });
}

// Server-side: replay and validate (pure functions, no WebSocket needed)
function validateReplay(inputLog, startState, claimedEndState) {
    let state = { ...startState };
    for (const input of inputLog) {
        advancePhysicsTo(state, input.t);  // uses orbital.js
        applyInput(state, input);           // uses orbital-maneuvers.js
    }
    return statesMatch(state, claimedEndState);
}
```

5. **Can be a simple HTTP endpoint.** No WebSocket needed. The client POSTs the replay log, the server responds with pass/fail. This could even be a serverless function (Cloudflare Workers, AWS Lambda) -- truly zero infrastructure.

**Estimated complexity**: 50-100 lines client-side, 100-200 lines server-side. One order of magnitude simpler than authoritative physics.

### Approach B: Signed Checkpoints

**Concept**: The server issues signed tokens at key moments (orbit insertions, planet encounters). The client must present valid tokens to claim achievements.

**Implementation**:
- Server provides a challenge on game start (random seed + timestamp)
- Client sends periodic state snapshots (orbital elements, game time)
- Server validates each snapshot against known physics
- Server signs valid snapshots with HMAC

**Pros**: Very low bandwidth. Server can be stateless (just validates + signs).
**Cons**: Doesn't prevent real-time cheating, only validates milestones. Sufficient for leaderboards but not for head-to-head competition.

**Estimated complexity**: 80-120 lines per side. Requires a shared secret for HMAC.

### Approach C: Statistical Anomaly Detection

**Concept**: Post-hoc analysis of trajectories for physically impossible maneuvers.

**Checks**:
- Acceleration exceeding sail physics limits
- Velocity changes without matching thrust history
- Teleportation (position discontinuities)
- Impossible intercept times (faster than light-sail physics allows)

**Pros**: Can be applied retroactively to any saved game state. Zero impact on gameplay.
**Cons**: Can only detect gross cheating, not subtle parameter tweaking.

**Estimated complexity**: 100-200 lines. Pure functions operating on save state data.

### Approach D: Client-Side Obfuscation

**Do not pursue this.** It violates the project's transparency ethos (all code visible in devtools), provides negligible security, and adds complexity. The codebase is openly hosted on GitHub. Obfuscation would be purely cosmetic.

### Anti-Cheat Recommendation Matrix

| Approach | Complexity | Effectiveness | Philosophy Match | Deployment Impact |
|----------|-----------|---------------|------------------|-------------------|
| **Replay Validation** | Low | High | Excellent | Minimal (HTTP POST) |
| **Signed Checkpoints** | Low | Moderate | Good | Minimal (HTTP API) |
| **Statistical Detection** | Low | Low-Moderate | Excellent | None (offline-capable) |
| **Server-Side Physics** | Very High | Very High | Poor | Severe (requires server) |
| **Obfuscation** | Low | Negligible | Poor | None |

---

## 8. Specific Convention Violations from Server-Side Physics

If server-side authoritative physics were implemented, it would violate these established project conventions:

| # | Convention | Violation |
|---|-----------|-----------|
| 1 | Zero npm dependencies | WebSocket libraries nearly always needed for robust server-side WS |
| 2 | No build system | Server code may need different module resolution |
| 3 | `python3 -m http.server` deployment | Requires a separate game server process |
| 4 | Static site deployable (GitHub Pages) | Server execution required |
| 5 | data/ -> core/ -> ui/ dependency flow | Server creates a parallel dependency tree |
| 6 | One concept per file | Network synchronization cross-cuts every module |
| 7 | Export state objects and functions, not classes | Connection/session management naturally gravitates toward class patterns |
| 8 | Browser console tests | Server code needs different test infrastructure |
| 9 | "Avoid over-engineering" (implicit) | Distributed physics is the most complex possible solution to anti-cheat |

---

## 9. Final Recommendations

### If Anti-Cheat is Required

1. **Implement Replay Validation** (Approach A). It leverages the project's greatest strength -- deterministic pure-function physics -- and requires no changes to the game's runtime architecture.

2. **Add statistical anomaly detection** (Approach C) as a complement. It can be implemented as a pure function library in `lib/` and tested with the existing `node:test` infrastructure.

3. **Use signed checkpoints** (Approach B) only if a leaderboard system is planned and milestone verification is sufficient.

### If Anti-Cheat is Not Required

**Do nothing.** The current architecture is clean, fast, and maintainable. Adding server-side physics to a single-player orbital mechanics game is solving a problem that does not exist.

### If Multiplayer is the Goal

If the actual goal is multiplayer (not just anti-cheat), then the architectural discussion changes fundamentally. But even for multiplayer, the recommendation would be:

1. Start with **shared-state via simple HTTP polling** (each player posts state, polls others' states). This is the absolute minimum viable multiplayer with zero infrastructure.
2. Graduate to **WebSocket for real-time updates** only after validating that multiplayer is fun and desired.
3. Never run authoritative physics on the server unless competitive integrity demands it AND simpler approaches have proven insufficient.

---

## Summary

The Sailship codebase is an exemplar of minimalist game architecture. Its pure-function physics libraries, zero-dependency philosophy, and static-site deployment model are not limitations to work around -- they are design strengths to preserve. Server-side authoritative physics would be the most expensive, most disruptive, and least necessary solution to the anti-cheat problem. Replay validation achieves comparable integrity guarantees at 1/10th the complexity, with zero impact on the game's beautiful simplicity.

**Overall Confidence**: 95% -- The deterministic physics engine makes replay validation a natural fit. The only uncertainty is whether the specific anti-cheat requirements demand real-time prevention (server-side physics) vs. post-hoc detection (replay/checkpoint). For a solar sailing game, post-hoc detection should be sufficient.
