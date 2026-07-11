# Closed-Loop Solar-Sail Autopilot Specification

**Date:** 2026-07-11
**Feature:** `autopilot` (continuous sail-steering cruise autopilot with destination selection and arrival options)
**Phase:** 1 — Discovery
**Status:** Complete → input to `/planning autopilot`

---

## 1. Executive Summary

Players should be able to select a destination planet, review one or more computed arrival options (ETA, transfer duration, arrival approach speed), pick one, and have the ship fly itself there — with sail yaw, pitch, and deployment continuously re-computed from the ship's *current real state* every physics step, the way a real solar-sail mission is flown. On entering the target's sphere of influence, control hands off to the existing (working, independent) thruster-based capture/slingshot autopilot.

Every prior attempt at this feature (course-solver v1/v2, gradient descent, hybrid search, multi-horizon search, mid-flight "course refinement") failed for the same structural reason: they searched for a **single fixed (yaw, pitch, deployment) tuple held for the entire transfer**. Because the sail's RTN steering frame rotates with the ship's orbit, a fixed angle is a *continuously changing* inertial thrust program, and any months-long open-loop prediction of it diverges compoundingly from reality (documented in `reports/ghost-planet-drift-investigation-2026-02-09.md`). The correct solution shape is a **time-varying feedback steering law**: at each integration step, compute the sail attitude that most decreases a scalar "distance to target orbit + phase" function, given the ship's actual current state. This requires no long-horizon prediction in the control loop at all, so the divergence problem that killed every previous attempt stops mattering.

This spec documents the current code state (which has changed substantially since the course plotter was deleted in commit `d99f08d`), confirms which known physics bugs are still live, inventories what is reusable, and defines the gaps the plan must close.

---

## 1.1 Estimated File Impact

### Files to CREATE:
- `src/js/lib/sail-steering.js` — pure steering-law math: Lyapunov gradient, ideal-sail cone-angle clamp, phasing bias, per-step attitude computation. Worker-safe, no DOM, no game state.
- `src/js/lib/sail-steering.test.js` — console test suite for the steering math.
- `src/js/lib/autopilot-rollout.js` — pure closed-loop transfer simulation (steering law + RK4 state integration) used to generate arrival options and the engaged-autopilot path preview. Worker-safe.
- `src/js/lib/autopilot-rollout.test.js` — console test suite for rollouts.
- `src/js/workers/rollout-worker.js` — thin worker wrapper around `autopilot-rollout.js` (same pattern as `eval-worker.js`).

### Files to EDIT:
- `src/js/core/shipPhysics.js` — invoke the steering hook inside the thrust substep loop when the sail autopilot is engaged; suppress wrong-planet capture during engaged transit.
- `src/js/core/gameState.js` — new `sailAutopilotState` (engaged flag, target, chosen option, tuning config); integration with existing `autoPilotState`.
- `src/js/core/saveState.js` — persist/restore sail-autopilot engagement.
- `src/js/ui/controls.js` — engage/disengage wiring, manual-override disconnect, `updateAutoPilot()` phase text.
- `src/js/ui/uiUpdater.js` — autopilot status display (phase, target, ETA, current commanded angles).
- `src/js/ui/renderer.js` — when engaged, render the rollout path instead of (or alongside) the fixed-settings predicted path.
- `src/js/main.js` — kick off/refresh background rollouts; route rollout polyline to renderer/intersection detector.
- `src/js/config.js` — `AUTOPILOT_CONFIG` (gains, weights, effectivity threshold, slew rate, arrival corridor, rollout horizons).
- `index.html` / CSS — NAV-tab autopilot section (destination already exists; add PLAN/ENGAGE UI and option cards).
- `src/js/lib/trajectory-predictor.js` — **bug fixes only** (P1/P2 below) so the manual-flight predicted path stops lying; the autopilot itself does not depend on this module.

### Files NOT touched (deliberately):
- `src/js/lib/orbital-maneuvers.js` thrust/RTN primitives (reused as-is; one small pure helper may be exported).
- `src/js/core/navigation.js` capture/slingshot planning (`computeCapturePlan`, `computeSlingshotPlan`) — the SOI autopilot is already working and independent.
- `src/js/lib/evaluate-trajectory.js` — retained for crossing-aware scoring reuse (see §2.3), not modified.

---

## 2. Current State Analysis

### 2.1 Existing Systems

| System | Location | Purpose | State |
|--------|----------|---------|-------|
| Sail thrust law | `lib/orbital-maneuvers.js:213` (`calculateSailThrust`), `:647` (`calculateSailThrustFromState`) | `F = 2·P(r)·A·cos²(yaw)·cos²(pitch)·ρ·sailCount`, direction from yaw/pitch in RTN | ✅ Correct, reusable |
| RTN frame construction | `lib/orbital-maneuvers.js:111` (`getSailThrustDirection`), inline in `calculateSailThrustFromState:684-712` | R away from sun, N along h, T = N×R | ✅ Correct, reusable |
| State-vector RK4 integrator | `lib/orbital-maneuvers.js:751` (`integrateStateRK4`) | Gravity + sail thrust, 4th order | ✅ Correct, reusable |
| Universal-variable Kepler propagation | `lib/orbital.js:348` (`propagateStateUniversal`) | Analytic zero-thrust propagation | ✅ Available for coast arcs |
| Live ship physics | `core/shipPhysics.js:235` (`updateShipPhysics`) | Per-frame update: RK2-midpoint substeps (≤50, target 2 h each) applying thrust as impulsive ΔV over orbital elements via `applyThrust` | ⚠️ Works, but is a *different integrator* from the predictor (P3) |
| Trajectory predictor | `lib/trajectory-predictor.js:231` (`predictTrajectory`) | Fixed-settings forward sim for the PREDICTED PATH display | ❌ Two confirmed critical bugs (P1, P2) |
| Candidate scoring | `lib/evaluate-trajectory.js:218` (`evaluateCandidate`) | Crossing-aware, phase-angle-penalized scoring of a fixed-angle trajectory | ✅ Pure/worker-safe; embeds hard-won lessons; but simulates with its own (Euler-over-elements) integration |
| Closest-approach forecast | `core/navigation.js:151` (`predictClosestApproach`) | NAV-panel intercept status | ⚠️ Yet another fixed-settings Euler-over-elements sim (4th integration path) |
| Worker pool | `workers/worker-pool.js`, `workers/eval-worker.js` | Batch off-thread evaluation, serial fallback | ✅ Preserved for batch planning |
| SOI thruster autopilot | `core/gameState.js:90-172` (`autoPilotState`, phases), `ui/controls.js:1655` (`determineAutopilotPhase`), `:1705` (`updateAutoPilot`), `core/navigation.js:362` (`computeCapturePlan`) + `computeSlingshotPlan` | Auto-fires impulsive thruster burns at periapsis for capture/slingshot inside an SOI. **Never touches sail settings.** | ✅ Working; hand-off target |
| Transit state (leftover) | `core/gameState.js:659` (`transitState`) | Records the course applied by the (deleted) course plotter; cleared on target-SOI arrival (`shipPhysics.js:908`) | ⚠️ Orphaned producer — only `saveState`/arrival-clear consume it |
| Destination selection | `core/navigation.js:53-64`, `ui/controls.js:1280` | Player picks destination (click / NAV panel) | ✅ Reusable entry point |
| Sail setters | `data/ships.js:120-163` (`setSailAngle`, `setSailPitch`, `setSailDeployment`, `setSailCount`) | Clamped mutation of `ship.sail` | ✅ Autopilot writes through these |
| Encounter markers | `lib/intersectionDetector.js` + `main.js:130+` | Ghost planets at predicted-trajectory orbit crossings | ✅ Accepts any trajectory polyline → can consume rollout path |
| Time system | `config.js` `SPEED_PRESETS` (up to 5×10⁸×), `gameState.advanceTime` | Frame-based clock; at max warp one frame ≈ **96.4 game-days** | ⚠️ Dictates where the control hook must live (see §3.2-G4) |

### 2.2 Data Flow (current, per frame — `main.js:107` `updatePositions`)

```
advanceTime()
  → updateCelestialPositions()          (planets from elements)
  → updateAutoPilot(timeScale)          (thruster autopilot; no-op outside SOI)
  → updateShipPhysics(player, timeScale)
       - SOI entry/exit checks & frame conversion
       - if sail thrust: ≤50 RK2-midpoint substeps over orbital elements
         (each substep: getPosition/getVelocity → calculateSailThrust → applyThrust ΔV)
  → tripometer, flight path
  → predictTrajectory() [cached ~0.5-2 s] → intersectionDetector → ghost planets
render() → updateUI()
```

Sail settings are only ever written by the player (keyboard/mouse via `controls.js` → `ships.js` setters). Nothing in the loop steers the sail.

### 2.3 Relevant Code — verified findings

**P1 — CONFIRMED STILL PRESENT (critical).** `trajectory-predictor.js:465`: the state advance is gated on `effectiveThrust`:
```js
if (i < adaptiveSteps - 1 && effectiveThrust && !tooCloseToSun && !useLinearInterpolation) {
    ... integrateStateRK4 ...
}
```
With `deploymentPercent === 0`, `simState` is never advanced — the predicted path is the start point repeated. Any coast-phase preview is silently wrong.

**P2 — CONFIRMED STILL PRESENT (critical).** `trajectory-predictor.js:477-496`: when in a planet's SOI, the code builds a **heliocentric** `thrustState` and then calls `integrateStateRK4(thrustState, sail, timeStep, mass, mu)` with `mu = getGravitationalParam(currentBody)` — the planet's μ applied to a heliocentric radius (error factor 10⁴-10⁶ in gravity), and the Sun's gravity omitted entirely.

**P3 — CONFIRMED STILL PRESENT (important).** Live ship: RK2-midpoint over orbital elements with impulsive ΔV substeps (`shipPhysics.js:350-465`). Predictor: RK4 over state vectors (`orbital-maneuvers.js:751`). The comment at `shipPhysics.js:353-359` still claims they match ("Matches the trajectory predictor's RK2 midpoint integration method") — stale since the predictor's RK4 rewrite.

**New finding — a fourth divergent integration path.** `navigation.js:151` (`predictClosestApproach`) and `evaluate-trajectory.js:218` (`evaluateCandidate`) each run their own plain-Euler-over-elements simulation (single `applyThrust` per step, no midpoint). So the repo currently has *four* codepaths that integrate "the same" physics differently: live ship (RK2/elements), predictor (RK4/state), `evaluateCandidate` (Euler/elements), `predictClosestApproach` (Euler/elements). Any new planning/preview code must not become a fifth.

**Prior-art worth keeping** (from `evaluate-trajectory.js`): crossing-aware scoring (score against the planet's position at the *orbital-radius crossing time*, not the global minimum distance) and the phase-angle penalty (`phaseAnglePenaltyThreshold ≈ 0.79 rad`). These lessons apply to how arrival options are *presented and validated*, even though the new controller does not do fixed-angle search.

**Thrust envelope facts** (drive the steering-law math):
- Thrust direction in RTN: `(cosγ·cosβ, sinγ·cosβ, sinβ)` for yaw γ, pitch β (`calculateSailThrustFromState:715-717`).
- Magnitude ∝ `cos²γ·cos²β`. Since `cosα = cosγ·cosβ` where α is the total cone angle from the sun line, the game's law is **exactly the ideal-sail law** `|F| ∝ cos²α` along a direction at cone angle α — meaning the classical ideal-sail locally-optimal steering results (McInnes, *Solar Sailing*, §4) apply in closed form.
- Radial thrust component is ≥ 0 always (a sail can never push sunward); the sail attains at most ≈ 0.385·F_max of purely transverse thrust at the optimum cone angle 35.26°.
- Default ship: 3 km² sail, 10 t → characteristic acceleration ≈ 2.5 mm/s² ≈ 1.23×10⁻⁴ AU/day², i.e. **lightness number β ≈ 0.42** (sail accel ≈ 42% of solar gravity at any r, since both scale 1/r²). With `sailCount` up to 50, β ≈ 21 — thrust can exceed solar gravity by 20×. The steering law must not assume "small perturbation" thrust.

**Ephemeris access is pure.** Planets are positioned by `getPosition(elements, jd)` — deterministic, closed-form, available in workers by passing `target.elements` (the `eval-worker.js` pattern). The steering law can know exactly where the target will be at any time without any forward simulation.

### 2.4 What was deleted, and what survived

Commit `d99f08d` (2026-02-10, "Cleanup sprint") deleted `lib/course-solver.js`, `lib/launch-window.js` and their tests — the fixed-angle search machinery. Deliberately preserved: `evaluate-trajectory.js`, `workers/eval-worker.js`, `workers/worker-pool.js`, and `gameState.js` `transitState` (now orphaned on the producer side). The SOI thruster autopilot was never part of the deleted system and still works.

---

## 3. Gap Analysis

### 3.1 Missing Capabilities

- [ ] **G1 — A steering law.** Nothing in the codebase maps (current ship state, target orbit) → (yaw, pitch, deployment). All prior mappings were "one angle forever," which is the documented failure mode.
- [ ] **G2 — Phasing/rendezvous logic.** Matching the target's orbit is insufficient — the ship must arrive *when the planet is there*. Once periods match, phase error freezes; phasing must be actively controlled during the transfer.
- [ ] **G3 — Arrival options generation.** The feature requires showing the player encounter windows before committing. There is no machinery to produce candidate transfers under closed-loop control (the old machinery produced fixed-angle candidates and was deleted).
- [ ] **G4 — A control hook at the right cadence.** Sail settings are only mutated by UI events. At 5×10⁸× warp a frame is ~96 game-days and `shipPhysics` sub-steps at ~1.9 game-days; a per-frame (pre-physics) autopilot poke would steer on geometry up to ~96 days stale. The hook must run **inside the substep loop**.
- [ ] **G5 — Engaged-mode truthful preview.** The PREDICTED PATH and ghost planets assume *fixed current sail settings*; with an autopilot continuously re-steering, that display becomes actively misleading.
- [ ] **G6 — Wrong-planet capture suppression.** `determineAutopilotPhase` (`controls.js:1655`) treats *any* SOI as CAPTURE/SLINGSHOT. An engaged transfer that grazes a non-target SOI (e.g., Earth flyby en route to Mars) would trigger thruster capture burns at the wrong planet.
- [ ] **G7 — Autopilot state lifecycle.** Engagement, target, chosen option, manual-override disconnect, save/load persistence, arrival handoff, and disengage-on-anomaly are all undefined.

### 3.2 Required Changes

- [ ] **R1** Create pure steering-law module (fills G1, G2) — closed-form per-step computation within the budget of "a handful of vector ops and trig calls" (see §4 recommendation). Must be exact for the game's cos²-law envelope, singularity-free at e≈0 / i≈0 (where all target planets live), and valid at both β=0.42 and β=21.
- [ ] **R2** Create closed-loop rollout simulator (fills G3, G5) reusing `integrateStateRK4` + the *same* steering functions, run on the existing worker pool; returns ETA, arrival relative speed, and a preview polyline. **The option preview and the live flight execute the same law**, so preview↔reality mismatch is bounded by integrator differences and then absorbed by the closed loop — root causes 1 and 2 of the prior failures die together.
- [ ] **R3** Hook steering into `shipPhysics.js` substep loop (fills G4): when engaged, before each substep's thrust evaluation, update `ship.sail` angles/deployment from the steering law using that substep's state. No-op when disengaged.
- [ ] **R4** Autopilot lifecycle state + UI (fills G7): `sailAutopilotState` in `gameState.js`; NAV-tab plan/engage flow; status text; disconnect on manual sail input; saveState round-trip.
- [ ] **R5** Suppress non-target capture while engaged (fills G6): while in transit to X, thruster autopilot acts only in X's SOI; sail feathers through other SOIs.
- [ ] **R6** Fix predictor bugs P1/P2 (truthful manual-mode preview; also lets the rollout share the "advance state always" semantics). P3 (integrator unification) is **mitigated rather than required**: the closed loop re-steers off real state, so live-vs-preview integrator differences no longer accumulate into mission failure; full unification stays on the audit's roadmap (UOW-3) and is out of scope here.
- [ ] **R7** Config for all tunables (`config.js`), per project convention.

### 3.3 Constraints (inherited, non-negotiable)

1. **Per-step steering must be closed-form** — no candidate-angle mini-simulations in the frame loop (the performance guardrail; the render/physics loop already has limited headroom per `reports/game-audit-upgrade-report-2026-07-07.md` §3 E1-E9).
2. **Batch work off-thread** — option generation uses the worker pool (the original browser-freeze lesson).
3. **No new integration path** — rollouts reuse `integrateStateRK4`; coast arcs may use `propagateStateUniversal`.
4. **Vanilla ES6, no dependencies, named exports, `.js` import extensions** (CLAUDE.md).
5. **Do not touch the working SOI thruster autopilot's internals** — integrate around it.

---

## 4. Recommended Design Direction (input to /planning)

The plan will detail this; recorded here because it shapes the gap list above.

**Steering law: Lyapunov steepest-descent over the orbit's (h⃗, e⃗) vectors, with an ideal-sail cone-angle clamp and a phase-bias for rendezvous.**

- Define `Q = w_h·|h⃗−h⃗_T|²/h_T² + w_e·|e⃗−e⃗_T|²` where h⃗ = r⃗×v⃗ (angular momentum) and e⃗ = (v⃗×h⃗)/μ − r̂ (eccentricity vector). Together they encode all five shape/orientation elements **with no singularities at e=0 or i=0** — unlike classical-element Q-laws, which are singular exactly in this game's regime.
- Both derivatives are *linear in the thrust vector f⃗*: `dh⃗/dt = r⃗×f⃗`, `de⃗/dt = (f⃗×h⃗ + v⃗×(r⃗×f⃗))/μ`. Hence `dQ/dt = D⃗·f⃗` with `D⃗` computable from ~6 cross products. The steepest-descent thrust direction is `q̂ = −D̂`.
- The sail cannot thrust along arbitrary q̂; the achievable set is the ideal-sail bubble. The attitude maximizing thrust along q̂ has the classical closed form: with θ̃ = angle(q̂, r̂), the optimal cone angle solves `tan(θ̃−α) = 2·tanα` → `tanα* = (−3+√(9+8tan²θ̃))/(4tanθ̃)` (McInnes). Convert (α*, clock angle of q̂) → (yaw, pitch). Zero iteration, ~20 flops + a few trig calls per control update.
- **Phasing:** bias the target orbit's semi-major axis by a saturated proportional term on the (anticipated) phase error, `a_tgt = a_planet·(1 − k·sat(Δλ_pred))` — behind the planet → aim lower/faster; ahead → higher/slower. Bias → 0 as phase closes, so the law converges to true rendezvous. This closes the loop that "achieve the orbit" alone cannot.
- **Coast/feather logic:** if the best achievable `dQ/dt` is not meaningfully negative on the current orbit arc (effectivity below threshold), furl to 0% deployment (with hysteresis) — sail-correct "coasting," and legible to the player.
- **Arrival corridor:** when close and closing on the target, feather and drift into the SOI; existing capture autopilot takes over.

**Why not the alternatives:**
- *Full Petropoulos Q-law* — needs max-element-rate normalizations derived for fixed-magnitude thrust (wrong for a cos²-law sail) and is singular at e→0, i→0; more math for less robustness here.
- *Open-loop optimal control (collocation / Pontryagin BVP)* — implementation-heavy in dependency-free JS, and reintroduces the long-lived-prediction fragility this design exists to eliminate. Revisit only if the feedback law proves insufficient for gameplay.
- *Per-frame candidate search* — explicitly banned by the performance guardrail; it's the freeze bug amortized.

---

## 5. Open Questions (to resolve in /planning)

- [ ] **Q1 — Option differentiation.** What distinguishes the 2-3 arrival options shown to the player? Recommended: phasing-gain presets (aggressive/balanced/patient) yielding different ETA / arrival-speed trade-offs, each validated by its own worker rollout. Deployment caps are *not* a good differentiator (for a fixed direction, Q̇ is linear in thrust magnitude — bang-bang 0/100% is optimal; caps only slow everything down).
- [ ] **Q2 — Rollout horizon for outer planets.** Config caps prediction at 1825 days; Jupiter+ rendezvous may exceed it. Options: longer autopilot-specific horizon with coarser far-future steps, or "ETA beyond horizon" honest labeling. Must be decided per target class.
- [ ] **Q3 — Supported targets, v1.** Recommended: the 8 planets (SOI + capture autopilot exist). Moons, dwarf planets, asteroids: defer (no SOI entries → no capture handoff; moon targeting needs planetocentric terminal logic).
- [ ] **Q4 — Engage-while-in-SOI.** Recommended v1: refuse engagement while inside a non-target SOI (message: escape first); allow engage inside *target* SOI to mean "capture only."
- [ ] **Q5 — Manual override semantics.** Recommended: any manual sail input while engaged disconnects the autopilot (aviation-style), with a status flash; camera/time controls never disconnect.
- [ ] **Q6 — `transitState` disposition.** Reuse the orphaned `transitState` for the new engagement record, or retire it and let `sailAutopilotState` own the lifecycle (recommended: retire — one owner).
- [ ] **Q7 — Phase-gain scheduling.** Gains must scale with target mean motion (Mercury: fast phase dynamics, tiny SOI; Neptune: glacial). Plan must specify the scaling rule and the worst-case test pair (Mercury at 1 sail, Neptune at 50 sails).
- [ ] **Q8 — Extreme-warp accuracy.** At 5×10⁸× warp, substeps are ~1.9 game-days (Mercury moves ~8°/substep). Existing physics already degrades identically; accept and document, or clamp warp while engaged? Recommended: accept + document (no new regression), revisit after audit UOW-5.

---

## 6. Reuse Map (explicit)

| Reused as-is | For |
|---|---|
| `calculateSailThrustFromState`, `getSailThrustDirection`, `gravitationalAcceleration`, `integrateStateRK4` | Rollout propagation; RTN frame + envelope facts for the steering law |
| `propagateStateUniversal` (`orbital.js:348`) | Analytic coast arcs in rollouts |
| `getPosition`/`getVelocity` on `target.elements` | Target ephemeris everywhere, incl. workers |
| `WorkerPool` / worker pattern | Off-thread option rollouts |
| `evaluateCandidate` crossing-aware + phase-penalty concepts | Validating/annotating rollout results for display (not for control) |
| SOI thruster autopilot (`computeCapturePlan`, `updateAutoPilot`) | Terminal capture/slingshot after SOI entry |
| `intersectionDetector` | Ghost planets driven by the rollout polyline when engaged |
| Sail setters (`ships.js`) | The only mutation path the autopilot uses |
| `SPEED_PRESETS`, substep machinery | Cadence host for the steering hook |
