# Server Architecture Review: Sailship Authoritative Physics Server

**Date:** 2026-02-11
**Reviewer:** Architect
**Scope:** Design proposal for server-authoritative ship physics to prevent cheating

---

## Executive Summary

After thorough analysis of the Sailship codebase, I propose a **Node.js WebSocket server** using a **client-predicted, server-authoritative** model. The architecture exploits the project's strongest asset: the pure-function physics libraries (`orbital.js`, `orbital-maneuvers.js`, `soi.js`) that are already Node.js-compatible. The design preserves offline single-player as a first-class mode and requires no build system.

---

## 1. Technology Choice: Node.js with Native WebSocket

### Recommendation: Node.js (v22+ with built-in WebSocket)

**Rationale:**

| Option | Code Sharing | Complexity | Performance | Verdict |
|--------|-------------|------------|-------------|---------|
| **Node.js** | Direct `import` of orbital.js, orbital-maneuvers.js, soi.js | Minimal -- same language, same modules | Sufficient for orbital math | **Selected** |
| Python | Must rewrite ~1,500 lines of orbital math | High -- two codebases to maintain | Adequate | Rejected |
| Rust/Go | Must rewrite all physics; can't share code | Very high -- cross-language validation | Overkill for this problem | Rejected |

**Why Node.js specifically:**
- The three pure math libraries (`orbital.js`, `orbital-maneuvers.js`, `soi.js`) have **zero DOM dependencies**. Their only `typeof window` checks are for debug helpers (`window.setThrustDebug`, `window.setSOIDebug`) -- these gracefully no-op in Node.js.
- They import only from each other and from `config.js`. The config file imports only `J2000` from `orbital.js` -- a pure constant. The entire physics dependency chain is: `orbital.js` (zero imports) -> `soi.js` (imports orbital.js, config.js) -> `orbital-maneuvers.js` (imports orbital.js, soi.js, config.js). **No circular dependencies. No DOM. No browser APIs.**
- Node.js 22+ has native WebSocket support via `WebSocket` and `WebSocketServer` (from the `ws`-compatible built-in). For zero-dependency purity, use `node:http` to upgrade connections manually, or accept the single dependency of the `ws` package (8KB, zero transitive deps).

**Transport: WebSocket (not HTTP polling, not SSE)**

| Transport | Latency | Bidirectional | Complexity | Verdict |
|-----------|---------|---------------|------------|---------|
| WebSocket | Low (persistent connection) | Yes | Moderate | **Selected** |
| HTTP Polling | High (request overhead) | No (client-initiated only) | Low | Too slow for time warp |
| SSE | Low | No (server-to-client only) | Low | Can't receive sail inputs |

WebSocket is the correct choice because:
1. Sail control changes need low-latency delivery to the server
2. The server needs to push authoritative state updates without client polling
3. At high time warp (10M x), the server must push updates at ~2 Hz minimum; polling would require the client to hammer the server
4. Time warp synchronization requires bidirectional negotiation

---

## 2. Code Sharing Strategy

### Current Pure-Function Library Analysis

```
orbital.js          -- 0 imports, 0 side effects, pure math
                       Exports: MU_SUN, J2000, meanMotion, propagateMeanAnomaly,
                                solveKepler, eccentricToTrueAnomaly, orbitalRadius,
                                getPosition, getVelocity

orbital-maneuvers.js -- Imports: orbital.js, soi.js, config.js
                        Side effects: typeof window checks (harmless in Node)
                        Exports: getSolarPressure, getSunDirection, getSailThrustDirection,
                                 calculateSailThrust, applyThrust, applyThrusterBurn,
                                 eclipticToRTN, characteristicAcceleration

soi.js              -- Imports: orbital.js, config.js
                        Side effects: console.log on load, typeof window check
                        Exports: getSOIRadius, getGravitationalParam, checkSOIEntry,
                                 checkSOIExit, helioToPlanetocentric, planetocentricToHelio,
                                 stateToElements

config.js           -- Imports: orbital.js (for J2000 constant only)
                        Pure data: constants, thresholds, display settings
                        Server needs: SOLAR_PRESSURE_1AU, ACCEL_CONVERSION, SAIL_MASS_PER_UNIT,
                                      GRAVITATIONAL_PARAMS, SOI_RADII, TRAJECTORY_ROBUSTNESS,
                                      PHYSICS_CONFIG, GAME_START_EPOCH, TIME_CONFIG, SPEED_PRESETS,
                                      DEFAULT_SAIL, DEFAULT_SHIP_MASS, DEFAULT_THRUSTER
```

### Sharing Approach: Direct Import (No Transpilation)

The server can import these files directly using Node.js ES module support:

```javascript
// server/physics-engine.js
import { getPosition, getVelocity, MU_SUN } from '../src/js/lib/orbital.js';
import { calculateSailThrust, applyThrust } from '../src/js/lib/orbital-maneuvers.js';
import { checkSOIEntry, checkSOIExit, helioToPlanetocentric, planetocentricToHelio, stateToElements } from '../src/js/lib/soi.js';
import { SOLAR_PRESSURE_1AU, PHYSICS_CONFIG, SOI_RADII, GAME_START_EPOCH, TIME_CONFIG, SPEED_PRESETS } from '../src/js/config.js';
```

**No code duplication. No build step. Single source of truth for physics.**

The `typeof window !== 'undefined'` guards in `soi.js` and `orbital-maneuvers.js` already handle the Node.js case correctly -- the debug functions simply don't attach to `window`, and the module loads without error.

**One modification needed:** `config.js` exports display-only constants (`BODY_DISPLAY`, `RING_CONFIG`, `PLANET_TEXTURE_CONFIG`, `SHIP_COLORS`) that reference texture paths and pixel sizes. These are harmless -- the server simply ignores them. No change required.

### What Cannot Be Shared

The `shipPhysics.js` module in `core/` **cannot** be used directly on the server because:
1. It imports from `data/celestialBodies.js`, which uses an in-memory array mutated by `updateCelestialPositions()` -- a browser-global side effect
2. It calls `getJulianDate()` from `gameState.js`, which is client-local mutable state
3. It contains visual-only code (visual orbital elements lerping, debug logging to `window`)

**However**, 95% of the physics logic in `updateShipPhysics()` is just orchestration of the pure functions. The server needs to reimplement this orchestration (~100 lines) without the visual smoothing or DOM coupling.

---

## 3. State Authority Model

### Recommendation: Client-Predicted + Server-Authoritative (Hybrid)

```
CLIENT (renderer + predictor)          SERVER (authority)
==================================     ==================================
Runs full physics locally              Runs identical physics
  - Immediate visual feedback            - Source of truth
  - Trajectory prediction                - Validates all state changes
  - Encounter markers                    - Applies sail commands
  - Smooth 60 FPS rendering              - Ticks at controlled rate

Sends: sail commands, time warp req    Sends: authoritative orbital elements
Receives: corrections                 Receives: player inputs
```

**Why hybrid, not pure server-authoritative:**

1. **Time warp creates variable tick rates.** At 10M x time warp, the simulation advances ~115 game-days per real second. The server must advance physics in lockstep, but the client needs smooth rendering at 60 FPS. With pure server authority, the client would render stale data between server ticks.

2. **Trajectory prediction must run on the client.** The predicted path (green spiral) requires running `predictTrajectory()` with the current orbital elements forward in time for up to 1,825 days. This is a client-side visualization concern -- the server should not waste cycles computing display-only data.

3. **Encounter markers, intersection detection, and closest-approach calculations** are all derived from the trajectory prediction. These are purely visual and must stay client-side.

4. **The physics is deterministic.** Given identical orbital elements and sail state, `calculateSailThrust()` and `applyThrust()` produce identical results on client and server. This means client prediction will match server authority *exactly* when no cheating occurs, minimizing correction snapping.

### Authority Rules

| State | Owner | Rationale |
|-------|-------|-----------|
| Orbital elements (a, e, i, Omega, omega, M0, epoch, mu) | **Server** | Core anti-cheat requirement |
| Sail state (angle, pitch, deployment, sailCount) | **Server** (validated) | Client requests, server validates bounds |
| Thruster fuel (deltaVRemaining) | **Server** | Prevents infinite fuel cheat |
| SOI state (currentBody, isInSOI) | **Server** | Transition detection is physics-critical |
| Julian date / time scale | **Server** | Prevents time manipulation |
| Camera, display options, zoom | **Client** | Pure visual, no gameplay impact |
| Trajectory prediction cache | **Client** | Derived from server-authoritative elements |
| Autopilot decisions | **Server** | Autopilot modifies sail settings, which modify orbit |

---

## 4. Client-Server Protocol

### Message Format: JSON over WebSocket

JSON is chosen over binary for debuggability and because the message rate is low (~2-10 messages/second). The orbital math is the bottleneck, not serialization.

### Client -> Server Messages

```javascript
// Sail control change
{
    type: "SAIL_UPDATE",
    seq: 1042,                    // Sequence number for ordering
    sail: {
        angle: 0.6,              // Yaw in radians
        pitchAngle: 0.1,         // Pitch in radians
        deploymentPercent: 100,   // 0-100
        sailCount: 1              // 1-20
    }
}

// Time warp request
{
    type: "TIME_WARP",
    seq: 1043,
    speed: "10000x"              // Must be one of SPEED_PRESETS keys
}

// Thruster burn request
{
    type: "THRUSTER_BURN",
    seq: 1044,
    direction: "prograde",       // "prograde" | "retrograde"
    burnSize: 2.0                // km/s (clamped server-side to 0.1-10.0)
}

// Autopilot toggle
{
    type: "AUTOPILOT",
    seq: 1045,
    enabled: true,
    mode: "ORBITAL_INSERTION",   // "ORBITAL_INSERTION" | "GRAVITY_SLINGSHOT"
    destination: "MARS"          // Target body name
}

// Orbit nudge (cheat code -- server validates sails at 0%)
{
    type: "NUDGE",
    seq: 1046,
    days: 1                      // +1 or -1 or +10 or -10
}

// Heartbeat / keepalive
{
    type: "PING",
    clientTime: 1707667200000    // Client Date.now() for latency measurement
}
```

### Server -> Client Messages

```javascript
// Authoritative state update (sent every server tick -- see tick rate below)
{
    type: "STATE",
    tick: 58320,                 // Server tick counter
    julianDate: 2461083.5,       // Authoritative game time
    timeScale: 0.00192901,       // Current days-per-frame
    ship: {
        orbitalElements: {
            a: 0.952, e: 0.021, i: 0.0012,
            Ω: 0.001, ω: 0.523, M0: 1.234,
            epoch: 2461083.5, μ: 2.959122e-4
        },
        sail: { angle: 0.6, pitchAngle: 0.1, deploymentPercent: 100, sailCount: 1, condition: 100, reflectivity: 0.9, area: 3000000 },
        thruster: { deltaVRemaining: 48.0, deltaVMax: 50.0, burnSize: 2.0 },
        soiState: { currentBody: "SUN", isInSOI: false },
        position: { x: 0.673, y: 0.672, z: 0.001 },
        velocity: { vx: -0.0115, vy: 0.0115, vz: 0.0 }
    },
    autopilot: { enabled: false, phase: "CRUISE", mode: "ORBITAL_INSERTION" }
}

// Acknowledgment of client action
{
    type: "ACK",
    seq: 1042,                   // Echoes client seq number
    accepted: true               // false if validation failed
}

// Rejection with reason
{
    type: "REJECT",
    seq: 1046,
    reason: "NUDGE requires sails at 0% deployment"
}

// Heartbeat response
{
    type: "PONG",
    clientTime: 1707667200000,   // Echoed back for RTT calculation
    serverTime: 1707667200050
}

// SOI transition event (important for client to snap visual elements)
{
    type: "SOI_TRANSITION",
    tick: 58325,
    direction: "ENTRY",          // "ENTRY" | "EXIT"
    body: "EARTH",
    ship: { /* full ship state as in STATE message */ }
}
```

### Tick Rate and Update Frequency

The server tick rate must adapt to time warp:

| Time Warp | Game Days/Real Sec | Server Ticks/Sec | Physics Sub-steps/Tick |
|-----------|-------------------|-------------------|----------------------|
| 1x | 1/86400 | 2 | 1 |
| 100x | 0.00116 | 2 | 1 |
| 10,000x | 0.116 | 5 | 1 |
| 100,000x | 1.157 | 10 | ~6 (2-hour sub-steps) |
| 1,000,000x | 11.57 | 10 | ~60 |
| 10,000,000x | 115.7 | 10 | ~600 |
| 100,000,000x | 1157.4 | 10 | ~6000 |

At extreme time warps, the server does more sub-stepping per tick (matching `shipPhysics.js` RK2 sub-stepping at 12 steps/day) but caps the network message rate at 10 Hz to avoid flooding the client.

The client interpolates between server state updates at 60 FPS using the locally predicted physics. On each server STATE message, the client snaps its local orbital elements to the server's authoritative values. Because the physics is deterministic, this snap is imperceptible when no cheating occurs.

---

## 5. Proposed File Structure

```
sailship/
├── src/                          # Existing client code (unchanged)
│   ├── index.html
│   ├── js/
│   │   ├── main.js               # Modified: adds WebSocket client
│   │   ├── core/
│   │   │   ├── serverSync.js     # NEW: WebSocket client, state reconciliation
│   │   │   ├── shipPhysics.js    # Modified: accepts server corrections
│   │   │   ├── gameState.js      # Modified: time authority from server
│   │   │   └── ...
│   │   ├── lib/                  # UNCHANGED: pure math, shared with server
│   │   │   ├── orbital.js
│   │   │   ├── orbital-maneuvers.js
│   │   │   ├── soi.js
│   │   │   └── ...
│   │   ├── data/                 # UNCHANGED
│   │   └── ui/                   # UNCHANGED
│   └── ...
│
├── server/                       # NEW: server-side code
│   ├── server.js                 # Entry point: HTTP server + WebSocket upgrade
│   ├── physics-engine.js         # Server physics loop (imports from src/js/lib/)
│   ├── session.js                # Per-player session state management
│   ├── validator.js              # Input validation and bounds checking
│   └── celestial-state.js        # Planet position calculator (imports from src/js/lib/)
│
├── package.json                  # NEW: minimal -- only "type": "module", maybe ws dep
└── ...
```

### Key Design Decisions in This Layout

1. **`src/js/lib/` is the shared physics layer.** Both client and server import from it. No duplication, no transpilation. The server uses relative imports like `import { getPosition } from '../src/js/lib/orbital.js'`.

2. **`server/physics-engine.js` reimplements `updateShipPhysics()` without DOM coupling.** It's approximately 100 lines: the RK2 sub-stepping loop, SOI transition handling, and sail thrust application. It calls the same pure functions the client calls.

3. **`server/celestial-state.js` maintains planet positions.** It imports `celestialBodies` data and uses `getPosition()` from `orbital.js` to compute planet positions at the server's Julian date. This replaces the client-side `updateCelestialPositions()` call.

4. **`server/session.js` holds per-player state.** Each connected player gets a session with their ship state object (identical shape to the client's ship object in `ships.js`).

5. **`server/validator.js` enforces bounds.** Sail angle clamped to [-pi/2, pi/2], deployment to [0, 100], sail count to [1, 20], time warp to valid presets, thruster burn size to [0.1, 10.0], nudge requires 0% deployment.

---

## 6. Data Flow Diagram

```
                    CLIENT                                          SERVER
                    ======                                          ======

User Input                                                   ┌─────────────────┐
    │                                                        │ physics-engine.js│
    ▼                                                        │                 │
┌──────────┐    sail/time/burn     ┌──────────────┐         │  Same functions: │
│controls.js├───────────────────►  │  serverSync.js├────────►│  getPosition()  │
└──────────┘                      │  (WebSocket)  │  WS     │  applyThrust()  │
                                  └───────┬───────┘         │  calculateSail  │
                                          │                  │  Thrust()       │
                      ┌───────────────────┤                  │  checkSOIEntry()│
                      │  STATE msg        │                  └────────┬────────┘
                      ▼                   │                           │
               ┌──────────────┐           │                    ┌──────┴──────┐
               │ shipPhysics.js│◄─────────┘                    │ session.js  │
               │ (prediction)  │  Server corrections           │ (ship state)│
               └──────┬───────┘                                └─────────────┘
                      │                                               ▲
                      ▼                                               │
               ┌──────────────┐                                       │
               │trajectory-   │                               ┌──────┴──────┐
               │predictor.js  │                               │validator.js │
               │(client only) │                               │(input bounds│
               └──────────────┘                               │ checking)   │
                      │                                        └─────────────┘
                      ▼
               ┌──────────────┐
               │ renderer.js  │
               │ uiUpdater.js │
               └──────────────┘


        SHARED PHYSICS LAYER (src/js/lib/)
        ===================================
        orbital.js ──── orbital-maneuvers.js ──── soi.js ──── config.js
        │                        │                    │
        │    Imported by BOTH client and server       │
        │    No duplication, no build step             │
        └─────────────────────────────────────────────┘
```

---

## 7. Single-Player vs. Multiplayer Considerations

### Current Scope: Single-Player with Server Authority

The architecture should be designed for **one player per server session**. This is sufficient for anti-cheat (the stated goal) and avoids the massive complexity of:
- Conflict resolution between multiple players modifying the same time scale
- Broadcasting N ship states to N clients
- Deterministic lockstep across variable-latency connections

### Future Multiplayer Extension Points

The design naturally extends to multiplayer by:

1. **`session.js` already isolates per-player state.** Multiple sessions can coexist.
2. **Time warp becomes consensus.** The server must arbitrate: either all players share one time scale (simplest), or each player has their own simulation instance (resource-intensive but avoids the "one player's 10M x breaks everyone else" problem).
3. **STATE messages add a `ships` array** instead of a single `ship` object, broadcasting all player positions.
4. **The physics engine runs one `updateShipPhysics()` per player per tick.**

**Recommendation:** Do NOT design for multiplayer now. The server should handle exactly one session. Adding `session.js` as a module provides the extension point when needed, without paying complexity cost today.

---

## 8. Backward Compatibility: Offline Mode

### Critical Requirement: Game Must Work Without Server

The zero-dependency philosophy and the existing deployment model (`python3 -m http.server`) demand that the game remains fully functional without the Node.js server.

### Implementation: Graceful Degradation in `serverSync.js`

```javascript
// src/js/core/serverSync.js

let ws = null;
let serverAuthoritative = false;

export function connectToServer(url = 'ws://localhost:8081') {
    try {
        ws = new WebSocket(url);
        ws.onopen = () => {
            serverAuthoritative = true;
            console.log('[SERVER] Connected -- server-authoritative mode');
        };
        ws.onclose = () => {
            serverAuthoritative = false;
            console.log('[SERVER] Disconnected -- falling back to local physics');
        };
        ws.onerror = () => {
            serverAuthoritative = false;
            // Silently degrade -- game works fine without server
        };
        ws.onmessage = handleServerMessage;
    } catch {
        // WebSocket not available or connection refused
        serverAuthoritative = false;
    }
}

export function isServerAuthoritative() {
    return serverAuthoritative;
}

export function sendSailUpdate(sail) {
    if (!serverAuthoritative) return; // Local-only mode: skip
    ws.send(JSON.stringify({ type: 'SAIL_UPDATE', seq: nextSeq(), sail }));
}
```

**Key principle:** Every `serverSync` function is a no-op when disconnected. The existing physics pipeline runs unchanged. The server is an **overlay**, not a replacement.

### Mode Detection

| Scenario | Mode | Physics Authority |
|----------|------|-------------------|
| `python3 -m http.server` only | Offline | Client |
| `node server/server.js` + browser | Online | Server |
| Server crashes mid-game | Graceful fallback | Client (continues from last known state) |

---

## 9. Deployment

### Development

```bash
# Terminal 1: Serve static files (unchanged)
cd src && python3 -m http.server 8080

# Terminal 2: Run physics server
node server/server.js
# Listens on ws://localhost:8081
```

### Production (simple)

The server can also serve the static files, eliminating the need for two processes:

```javascript
// server/server.js
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws'; // or native Node 22+ API

const server = http.createServer((req, res) => {
    // Serve static files from src/
    const filePath = path.join(import.meta.dirname, '..', 'src', req.url === '/' ? 'index.html' : req.url);
    // ... standard static file serving with correct MIME types
});

const wss = new WebSocketServer({ server });
wss.on('connection', handleConnection);

server.listen(8080, () => console.log('Sailship server on http://localhost:8080'));
```

This single process replaces both the Python HTTP server and adds WebSocket support. The `package.json` is minimal:

```json
{
    "name": "sailship-server",
    "type": "module",
    "dependencies": {
        "ws": "^8.0.0"
    }
}
```

One dependency. Zero build tools. Zero bundlers.

---

## 10. Server Physics Engine Implementation Sketch

```javascript
// server/physics-engine.js
import { getPosition, getVelocity, MU_SUN } from '../src/js/lib/orbital.js';
import { calculateSailThrust, applyThrust } from '../src/js/lib/orbital-maneuvers.js';
import { checkSOIEntry, checkSOIExit, helioToPlanetocentric, planetocentricToHelio, stateToElements, getGravitationalParam, getSOIRadius } from '../src/js/lib/soi.js';
import { PHYSICS_CONFIG, GAME_START_EPOCH, TIME_CONFIG, SPEED_PRESETS } from '../src/js/config.js';

/**
 * Server-side physics tick.
 *
 * Mirrors the core logic of client's updateShipPhysics() without:
 * - Visual orbital element lerping
 * - Debug logging to window
 * - DOM dependencies
 *
 * @param {Object} ship - Ship state (mutated)
 * @param {number} deltaTime - Time step in days
 * @param {number} julianDate - Current Julian date
 * @param {Array} planets - Planet positions [{name, x, y, z, elements}, ...]
 */
export function serverUpdateShipPhysics(ship, deltaTime, julianDate, planets) {
    if (!ship.orbitalElements || deltaTime <= 0) return;

    const position = getPosition(ship.orbitalElements, julianDate);
    const velocity = getVelocity(ship.orbitalElements, julianDate);

    // SOI transitions (identical logic to client)
    // ... checkSOIEntry/Exit, frame conversion ...

    // Sail thrust with RK2 sub-stepping (identical to client)
    const effectiveThrust = ship.sail && ship.sail.deploymentPercent > 0 &&
                            ship.sail.area > 0 &&
                            (ship.sail.condition || 100) > 0;

    if (effectiveThrust) {
        const MAX_SUBSTEP = 1 / 12;  // 2-hour steps matching client
        const MAX_SUBSTEPS = 50;
        const numSubSteps = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(deltaTime / MAX_SUBSTEP)));
        const subDt = deltaTime / numSubSteps;

        for (let step = 0; step < numSubSteps; step++) {
            // ... identical RK2 midpoint integration from shipPhysics.js lines 371-464 ...
        }
    }

    // Update cached position/velocity
    ship.x = getPosition(ship.orbitalElements, julianDate).x;
    // ... etc
}
```

The point here is clear: `serverUpdateShipPhysics` is a **thin orchestrator** around the same pure functions the client uses. The physics math is not duplicated.

---

## 11. Reconciliation Strategy (Client-Side)

When the client receives a `STATE` message from the server:

```javascript
function reconcileServerState(serverState) {
    const player = getPlayerShip();
    const serverElements = serverState.ship.orbitalElements;
    const localElements = player.orbitalElements;

    // Compare orbital elements
    const aDiff = Math.abs(serverElements.a - localElements.a) / Math.abs(serverElements.a);
    const eDiff = Math.abs(serverElements.e - localElements.e);

    if (aDiff < 0.001 && eDiff < 0.001) {
        // Client prediction matches server -- no visible correction needed
        // Just accept server values silently (keeps authority clean)
        Object.assign(player.orbitalElements, serverElements);
    } else {
        // Divergence detected -- snap to server state
        // This should only happen if client was tampered with
        console.warn(`[SYNC] Server correction: a diff=${(aDiff*100).toFixed(2)}%, e diff=${eDiff.toFixed(4)}`);
        Object.assign(player.orbitalElements, serverElements);
        // Reset visual elements to avoid lerping from wrong state
        player.visualOrbitalElements = { ...serverElements };
    }

    // Always accept authoritative non-physics state
    player.sail = serverState.ship.sail;
    player.thruster = serverState.ship.thruster;
    player.soiState = serverState.ship.soiState;

    // Sync game time
    setJulianDate(serverState.julianDate);
}
```

---

## 12. Risk Assessment and Concerns

### Risk 1: Time Warp Synchronization (HIGH)

The game supports time warps from 1x to 500,000,000x. At extreme warps, the server must perform thousands of physics sub-steps per real-time second. A single server tick at 500M x advances ~5,787 game-days, requiring ~69,444 sub-steps (at 12/day). This takes measurable CPU time.

**Mitigation:**
- Cap server-side sub-steps at 500 per tick (same order as client's `MAX_SUBSTEPS = 50` per frame, but server ticks are larger)
- At extreme warps, reduce physics fidelity (larger sub-steps) -- acceptable because at 500M x the player is fast-forwarding, not fine-tuning sail angles
- Consider capping server-supported warp at 10M x and requiring offline mode for faster warps

### Risk 2: Determinism Across Platforms (MEDIUM)

JavaScript floating-point arithmetic is IEEE 754 double precision on all platforms, but the order of operations in `Math.sin()`, `Math.cos()`, `Math.sqrt()` can vary across V8 versions. Two identical `calculateSailThrust()` calls might produce results that differ in the last few ULP (Unit of Least Precision).

**Mitigation:**
- This is acceptable. The reconciliation strategy tolerates small differences (0.1% threshold). ULP-level drift will not trigger visible corrections.
- The real threat is memory hacking / DevTools console manipulation, which produces LARGE divergences that the server trivially detects.

### Risk 3: Autopilot on Server (MEDIUM)

The autopilot (`controls.js: updateAutoPilot()`) currently runs on the client and modifies sail settings based on intersection detection, closest approaches, and destination info. Moving it to the server requires also moving intersection detection, which is expensive and currently client-side.

**Mitigation:**
- Keep autopilot as a client-side advisor that sends `SAIL_UPDATE` messages to the server
- The server validates sail bounds but doesn't need to know WHY the sail was set to a particular angle
- This preserves the client's role as the "smart display" while the server enforces physics integrity

### Risk 4: Reconnection and State Recovery (LOW)

If the WebSocket disconnects and reconnects, the client needs the full authoritative state.

**Mitigation:**
- Server sends full STATE message on connection (not just diffs)
- Client replaces all local state with server state on reconnect
- The save/load system (`saveState.js`) already knows how to serialize and deserialize the complete game state -- the reconnection handler can reuse this machinery

---

## 13. What Not to Do

1. **Do not split `config.js` into server and client versions.** The server can import the full config and ignore display-only constants. Splitting creates drift risk.

2. **Do not add a build step.** The zero-dependency, zero-bundler philosophy is a feature, not a limitation. The server should use native ES modules (`"type": "module"` in package.json) and import directly from `src/js/lib/`.

3. **Do not move trajectory prediction to the server.** It's a pure visualization concern (the green spiral line, encounter markers, closest approaches). The server needs only the authoritative orbital elements; the client derives everything visual from those.

4. **Do not implement delta compression for STATE messages.** The full ship state is ~500 bytes of JSON. At 10 Hz that's 5 KB/s. Network bandwidth is not a concern for a single-player game.

5. **Do not attempt to make the server stateless / REST-ful.** The physics simulation is inherently stateful (orbital elements evolve continuously). WebSocket's persistent connection maps naturally to this.

---

## 14. Implementation Priority

| Phase | Scope | Files Changed | Effort |
|-------|-------|---------------|--------|
| 1 | Server skeleton: HTTP + WS, serve static files | `server/server.js`, `package.json` | 1 day |
| 2 | Server physics engine: import shared libs, run physics loop | `server/physics-engine.js`, `server/celestial-state.js` | 2 days |
| 3 | Input validation | `server/validator.js` | 0.5 day |
| 4 | Client sync module: connect, send inputs, receive state | `src/js/core/serverSync.js` | 1 day |
| 5 | Client integration: wire sync into main.js, shipPhysics.js, controls.js | Modify 3 existing files | 1 day |
| 6 | Session management and graceful fallback | `server/session.js`, test offline mode | 1 day |
| 7 | Time warp synchronization and edge cases | Cross-cutting | 1.5 days |
| **Total** | | **4 new files, 3 modified files** | **~8 days** |

---

## 15. Summary

The proposed architecture exploits the codebase's best structural decision: isolating physics into pure-function libraries with no DOM coupling. By running `orbital.js`, `orbital-maneuvers.js`, and `soi.js` on both client and server with zero modification, we get deterministic physics authority without code duplication.

The hybrid client-predicted, server-authoritative model gives the best of both worlds: instant visual feedback for the player, and a server that can detect and correct any client-side manipulation. The WebSocket protocol is simple (6 message types), the server is small (~4 new files), and the existing game continues to work perfectly without a server.

The architecture respects the project's philosophy: minimal dependencies, no build tools, and the client remains a fully functional standalone application.
