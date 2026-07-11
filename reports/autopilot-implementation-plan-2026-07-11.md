# Closed-Loop Solar-Sail Autopilot Implementation Plan

**Date:** 2026-07-11
**Status:** Review
**Spec:** `reports/autopilot-spec-2026-07-11.md`
**Prior failure analysis:** `reports/ghost-planet-drift-investigation-2026-02-09.md`, task brief lineage (course-solver v1/v2, gradient descent, hybrid, multi-horizon, course refinement — all fixed-angle, all failed)

---

## 0. File Impact Summary

### Files to CREATE:
1. `src/js/lib/sail-steering.js` — pure steering-law math (orbit vectors, Lyapunov gradient, ideal-sail attitude solver, phasing bias, per-step command)
2. `src/js/lib/sail-steering.test.js` — node:test suite
3. `src/js/lib/autopilot-rollout.js` — pure closed-loop transfer simulator (worker-safe)
4. `src/js/lib/autopilot-rollout.test.js` — node:test suite
5. `src/js/workers/rollout-worker.js` — worker wrapper for rollouts

### Files to EDIT:
1. `src/js/config.js` — `AUTOPILOT_CONFIG` block (weights, gains, thresholds, presets, horizons)
2. `src/js/lib/trajectory-predictor.js` — fix P1 (zero-thrust freeze) and P2 (in-SOI μ/frame mismatch)
3. `src/js/lib/trajectory-predictor.test.js` — new cases pinning P1/P2 fixes
4. `src/js/core/gameState.js` — `sailAutopilotState` + accessors
5. `src/js/core/saveState.js` — persist/restore sail-autopilot engagement
6. `src/js/core/shipPhysics.js` — steering hook inside the thrust substep loop; run substeps while engaged even at zero deployment
7. `src/js/ui/controls.js` — engage/disengage, manual-override disconnect, wrong-planet capture suppression in `determineAutopilotPhase`, status text
8. `src/js/ui/uiUpdater.js` — autopilot status display (phase, ETA)
9. `src/js/ui/renderer.js` — engaged-mode path preview + target-at-ETA ghost
10. `src/js/main.js` — background rollout refresh scheduling; suppress fixed-settings encounter markers while engaged
11. `index.html` + CSS — NAV-tab autopilot section (PLAN / option cards / ENGAGE)

### Files to DELETE:
- None. (`transitState` in `gameState.js` is left untouched but documented as deprecated; retirement is future cleanup, not part of this feature — minimizes regression surface.)

---

## 1. Problem Statement

### 1.1 Description
Give the player a destination-select → see arrival options → pick one → ship flies itself there capability, with sail yaw/pitch/deployment continuously adjusted over the whole transfer by a feedback law computed from the ship's actual current state, handing off to the existing thruster capture/slingshot autopilot at target SOI entry.

### 1.2 Root Cause (why prior attempts failed)
Every prior solver optimized a **single constant (yaw, pitch, deployment)** held for the whole transfer. Two compounding consequences:
1. Structurally wrong solution shape: the RTN frame rotates with the orbit, so continuous-thrust rendezvous needs a *time-varying* control; no constant exists that both shapes the orbit and phases the arrival for most geometries.
2. Fragile evaluation: judging a constant angle requires a months-long open-loop forward simulation, whose divergence from reality compounds (RTN-rotation integration error feeding back through trajectory→thrust-direction→trajectory), amplified by live physics bugs P1/P2/P3.

A per-step feedback law eliminates both: there is no constant to find and no long-lived prediction inside the control loop.

### 1.3 Constraints
- **C1** Per-step steering must be closed-form — comparable in cost to the existing per-substep thrust calculation; no candidate-simulation search in the game loop.
- **C2** Batch planning work (arrival options) runs off-thread on the existing worker-pool pattern.
- **C3** No fifth integration path: rollouts reuse `integrateStateRK4` (+ `propagateStateUniversal` for pure coasts).
- **C4** Vanilla ES6 modules, no dependencies, named exports, `.js` extensions, config-driven tunables (CLAUDE.md).
- **C5** The working SOI thruster autopilot is integrated *around*, never modified internally.
- **C6** Valid across the game's full envelope: β ≈ 0.42 (1 sail) to β ≈ 21 (50 sails), targets Mercury→Neptune, warp 1×→5×10⁸×.
- **C7** Sail model as implemented is ground truth: thrust dir `(cosγcosβ, sinγcosβ, sinβ)` in RTN, magnitude ∝ `cos²γcos²β`, i.e. exactly the ideal-sail cone-angle law with `cosα = cosγcosβ`.

---

## 2. Solution Architecture

### 2.1 High-Level Design

```
                        ┌──────────────────────────────────────────────┐
                        │ lib/sail-steering.js (PURE)                  │
                        │  orbitVectors(state) → h⃗, e⃗                 │
                        │  steeringGradient(state, targetVecs, w)→ D⃗  │
                        │  idealSailAttitude(q̂, state) → γ, β, η      │
                        │  phaseBiasedTarget(state, tgtElems, jd, cfg) │
                        │  computeSailCommand(...) → {γ, β, deploy,    │
                        │        phase, effectivity}                   │
                        └──────┬───────────────────────┬───────────────┘
                               │ (same functions)      │
              ┌────────────────▼──────────┐   ┌────────▼─────────────────────┐
              │ core/shipPhysics.js       │   │ lib/autopilot-rollout.js     │
              │ substep loop:             │   │ (PURE, worker-safe)          │
              │  if engaged:              │   │ closed-loop sim w/ RK4:      │
              │   cmd = computeSailCommand│   │  ETA, arrival rel-speed,     │
              │   ship.sail ← slew(cmd)   │   │  preview polyline, quality   │
              │  existing thrust substep  │   └────────┬─────────────────────┘
              └────────────▲──────────────┘            │
                           │                  ┌────────▼─────────────┐
              ┌────────────┴─────────────┐    │ workers/rollout-     │
              │ core/gameState.js        │    │ worker.js (3 presets)│
              │ sailAutopilotState       │    └────────▲─────────────┘
              └────────────▲─────────────┘             │
                           │ engage/disengage/status   │ plan request
              ┌────────────┴──────────────────────────┴──────────────┐
              │ ui/controls.js + uiUpdater.js + renderer.js + NAV tab │
              │ PLAN → option cards → ENGAGE → status/preview         │
              └───────────────────────────────────────────────────────┘
                           │ on target-SOI entry: feather sail
                           ▼
              existing thruster capture/slingshot autopilot (unchanged)
```

Dependency flow stays `data/ → lib/ → core/ → ui/`; `sail-steering.js` and `autopilot-rollout.js` depend only on `orbital.js`, `orbital-maneuvers.js`, `config.js` (mirrors `evaluate-trajectory.js`).

### 2.2 Design Principles
- **Feedback, not prediction:** the control loop consumes only the current state and the target's analytic ephemeris. Rollouts exist solely for *display* (options, ETA, preview) — never in the control path.
- **One law, two consumers:** the live hook and the rollout call the identical `computeSailCommand`, so the preview is a rollout *of the thing that will actually fly*. Residual preview error (integrator/timestep differences, P3) is absorbed by the closed loop en route.
- **Singularity-free state description:** steer on (h⃗, e⃗) vectors, defined for circular, equatorial, and hyperbolic states alike — no e=0/i=0 blowups, no equinoctial-element machinery.
- **Bang-bang deployment with hysteresis:** for a fixed direction, dQ/dt is linear in thrust magnitude, so optimal deployment is 0% or 100%; hysteresis + slew-rate limits prevent chatter and look right.
- **Hook lives at substep cadence:** steering stays stable at 5×10⁸× warp because it re-evaluates every physics substep (~1.9 game-days worst case), not once per frame (~96 game-days worst case).
- **Fail passive:** any invalid input (NaN, degenerate h, unknown target) → feather sail, set fault status, never write garbage to `ship.sail`.

### 2.3 Key Algorithms

Units: AU, days, radians. μ☉ = `MU_SUN` (AU³/day²). All vectors ecliptic-heliocentric.

**(a) Orbit vectors.** For ship state (r⃗, v⃗):
- `h⃗ = r⃗ × v⃗`
- `e⃗ = (v⃗ × h⃗)/μ − r̂`

Target vectors `h⃗_T, e⃗_T` computed from the (phase-biased) target elements once per control update: from elements → (r⃗_T, v⃗_T) at current jd via `getPosition`/`getVelocity` → same formulas. (Cheaper closed forms exist; this reuses tested code.)

**(b) Lyapunov function and gradient.**
```
Q = w_h·|h⃗ − h⃗_T|²/|h⃗_T|² + w_e·|e⃗ − e⃗_T|²
```
Under perturbing acceleration f⃗: `ḣ⃗ = r⃗×f⃗`, `ė⃗ = (f⃗×h⃗ + v⃗×(r⃗×f⃗))/μ`. Both linear in f⃗, so `Q̇ = D⃗·f⃗` with
```
D⃗ = (2w_h/|h⃗_T|²)·(Δh⃗ × r⃗) + (2w_e/μ)·[ h⃗ × Δe⃗ + (Δe⃗ × v⃗) × r⃗ ]
```
where Δh⃗ = h⃗−h⃗_T, Δe⃗ = e⃗−e⃗_T. (Derivation: a⃗·(b⃗×c⃗) = c⃗·(a⃗×b⃗) applied to each term.) Desired thrust direction: `q̂ = −D⃗/|D⃗|`. Six cross products + a few dots. Defaults `w_h = 1, w_e = 1` (config).

**(c) Ideal-sail attitude solver (the envelope clamp).** Sail thrust in RTN is `a(α)·n̂` with `|a| = a_max(r)·cos²α`, n̂ at cone angle α from R̂, free clock angle δ. Given q̂ at angle θ̃ from R̂ (`cosθ̃ = q̂·R̂`):
- Clock angle: δ* = clock angle of q̂'s (T, N)-plane component — `δ* = atan2(q̂·N̂, q̂·T̂)`.
- Cone angle: maximize `cos²α·cos(θ̃−α)` ⇒ `tan(θ̃−α*) = 2·tanα*` ⇒ roots of `2·tanθ̃·t² + 3t − tanθ̃ = 0`, `t = tanα*`:
```
tanα* = (−3 + √(9 + 8tan²θ̃)) / (4tanθ̃)        (θ̃ < 90°)
tanα* = (−3 − √(9 + 8tan²θ̃)) / (4tanθ̃)        (θ̃ > 90°, pick root with α ∈ (θ̃−90°, 90°))
```
Implementation evaluates both roots' objective values and picks the max (robust near θ̃ = 90°, where α* → 35.264° = atan(1/√2), consistent with the known optimal-transverse result). θ̃ → 0 ⇒ α* → 0 (thrust radial).
- Convert (α*, δ*) → controls: `sinβ = sinα*·sinδ*`; `γ = atan2(sinα*·cosδ*, cosα*)`. Clamps ±π/2 already enforced by `setSailAngle`/`setSailPitch`.
- Effectivity: `η = −Q̇* / (|D⃗|·a_max(r))` ∈ [0, 1], where `Q̇* = a_max·cos²α*·(D⃗·n̂*)`. η measures "how useful is thrusting right now vs. the best conceivable thruster."

**(d) Coast logic (bang-bang with hysteresis).**
```
if coasting:  deploy 100% when η > η_on   (default 0.15)
if thrusting: deploy 0%   when η < η_off  (default 0.08)
```
Also feather when `Q < Q_arrival` (matched + phased — drift in), when inside any SOI, or on fault.

**(e) Phasing bias (turns orbit-matching into rendezvous).**
- Phase error: signed angle from ship to planet around the target's orbit normal, `Δφ = atan2((r̂_ship × r̂_T)·ĥ_T, r̂_ship·r̂_T)` — positive = planet ahead.
- Time-to-go estimate (analytic, no simulation): near-circular `da/dt ≈ 2f_T/n`, max transverse sail accel `f_T,max ≈ 0.385·a_max(r)`, so
  `T_go ≈ |a_T − a| · n_ship / (2·0.385·a_max(r))`, clamped to `[0, T_go,max]`.
- Anticipated phase at arrival: `Δφ_pred = wrap(Δφ + (n_T − n_ship)·T_go)`.
- Biased target: `a_tgt = a_T·(1 − k_φ·sat(Δφ_pred/φ_sat))`, bias clamped to ±`biasMax` (default 0.15·a_T), other target elements unchanged; rebuild `h⃗_T, e⃗_T` from the biased elements. Planet ahead ⇒ aim lower ⇒ shorter period ⇒ catch up; bias → 0 as Δφ_pred → 0 ⇒ converges to true rendezvous. Closed-loop phase dynamics `Δφ̇ ≈ −(3/2)·n·k_φ·sat(Δφ_pred/φ_sat)` — first-order stable for k_φ > 0.
- Gain scheduling: `k_φ` per preset (see (g)); `φ_sat` default 60°.

**(f) Per-step command (top level).**
```
computeSailCommand(shipState, targetElems, jd, cfg, ctl):
  validate inputs               → fault ⇒ {feather, phase:'FAULT'}
  if inside any SOI             → {feather, phase: target? 'ARRIVED':'COAST'}
  relDist = |r⃗ − r⃗_planet(jd)|
  if relDist < corridor·SOI_T and closing → {feather, phase:'APPROACH'}
  biasedTarget = phaseBiasedTarget(...)
  D⃗ = steeringGradient(state, orbitVectors(biasedTarget), w)
  if |D⃗| < εD → {feather, phase:'HOLD'}          (matched orbit; drift)
  (γ, β, η) = idealSailAttitude(−D̂, state)
  deploy = hysteresis(η, ctl)
  return {γ, β, deploy, phase: |Δa| big ? 'SPIRAL' : 'PHASING', η}
```
The caller (physics hook / rollout) applies a slew-rate limit `|Δangle| ≤ slewRate·dt` (default 90°/game-day) before writing `ship.sail`.
Budget: ~6 cross products, ~15 dot/scale ops, ~10 trig calls, two `getPosition`/`getVelocity` evaluations — same order as one existing `calculateSailThrust` substep. No allocation in the hot path (module-scope scratch vectors).

**(g) Presets (the "arrival options").**
| Preset | k_φ | η_off/η_on | Character |
|---|---|---|---|
| DIRECT | 0.9 | 0.03/0.08 | Thrust almost always; fastest, hotter arrival |
| BALANCED | 0.5 | 0.08/0.15 | Default |
| PATIENT | 0.25 | 0.15/0.25 | More coasting; slower, gentlest arrival |

PLAN runs one rollout per preset in workers; cards show ETA date, transfer duration, arrival relative speed (km/s via 1731.46), and quality (`ARRIVES` / `NO ARRIVAL WITHIN HORIZON`). ENGAGE stores the preset in `sailAutopilotState`.

**(h) Rollout (display only).** From the live ship state: loop `t += dt` (dt = 1/12 day; beyond 730 days dt = 1/4 day), each step `computeSailCommand` (+slew) → `integrateStateRK4` (deployment 0 steps may use `propagateStateUniversal`); terminate on target-SOI entry (ARRIVED), horizon, sun-dive, or |r|>50 AU; return `{eta, durationDays, arrivalRelSpeed, quality, path[≤600 pts], phaseTimeline}`. Horizons: inner planets 1825 d; Jupiter/Saturn 3650 d; Uranus/Neptune 7300 d. Worst case ≈ 30k steps ≈ tens of ms in a worker.

**(i) SOI handoff & wrong-planet suppression.**
- Target SOI entry: sail feathers (command logic (f)); engage flow has already set `autoPilotState.enabled = true`, so the existing capture/slingshot autopilot acts. Sail autopilot stays engaged but passive (phase ARRIVED); if the ship exits the target SOI uncaptured, phase returns to CRUISE and steering resumes — missed passes self-correct.
- Non-target SOI (en-route flyby): command logic feathers through it; `determineAutopilotPhase` (`controls.js`) gains one guard — if sail autopilot is engaged and `soiState.currentBody ≠ target`, return CRUISE instead of CAPTURE/SLINGSHOT, so no thruster fuel is wasted at the wrong planet.

---

## 3. Units of Work

### Unit 1: Fix trajectory-predictor P1 + P2
**Description:** Always advance `simState` (zero-thrust ⇒ pure gravity via RK4 or `propagateStateUniversal`); in-SOI integration switches to planetocentric state with the planet's μ at the origin (sail thrust still computed sun-relative by passing the planet's heliocentric position as `sunPosition` to `calculateSailThrustFromState`). Matches audit UOW-1/UOW-2. Independent of all later units; makes the manual-mode preview truthful.
**Files:** `lib/trajectory-predictor.js`, `lib/trajectory-predictor.test.js`
**Acceptance Criteria:**
- [ ] Sails furled ⇒ predicted path follows the Keplerian orbit (≤1e-6 AU vs `getPosition` over 60 days)
- [ ] In-SOI, zero-thrust, circular planetocentric orbit stays circular over one period (bounded drift)
- [ ] Existing predictor tests green
**Test Method:** `npm run test:lib`; manual: furl sails in game, path follows orbit ellipse.

### Unit 2: Config + orbit-vector/Lyapunov gradient math
**Description:** Add `AUTOPILOT_CONFIG` to `config.js`. Create `sail-steering.js` with `orbitVectors(state, mu)`, `targetOrbitVectors(elements, jd)`, `lyapunovQ`, `steeringGradient` returning D⃗ (formula 2.3-b), all allocation-free via scratch objects.
**Files:** `config.js`, `lib/sail-steering.js`, `lib/sail-steering.test.js`
**Acceptance Criteria:**
- [ ] h⃗, e⃗ match analytic values for circular, elliptic (e=0.2), and hyperbolic (e=1.5) test states
- [ ] Q = 0 ⟺ ship orbit ≡ target orbit; Q > 0 otherwise
- [ ] Finite-difference check: `Q̇ ≈ D⃗·f⃗` within 1e-6 relative for random states/thrusts (the load-bearing correctness test)
**Test Method:** `npm run test:lib` (new suite).

### Unit 3: Ideal-sail attitude solver
**Description:** `idealSailAttitude(qhat, state)` — RTN frame construction (reuse the logic pattern of `calculateSailThrustFromState`), θ̃/δ decomposition, closed-form cone-angle roots, (α, δ) → (yaw, pitch), effectivity η.
**Files:** `lib/sail-steering.js`, `lib/sail-steering.test.js`
**Acceptance Criteria:**
- [ ] q̂ = R̂ ⇒ γ=β=0; q̂ = T̂ ⇒ γ=35.264°±0.01°, β=0; q̂ = N̂ ⇒ β=35.264°±0.01°, γ=0
- [ ] Brute-force cross-check: for 1000 random q̂, closed-form thrust-along-q̂ ≥ every candidate on a 1° grid of (γ, β)
- [ ] θ̃ > 90° cases return the correct branch (verified against grid); θ̃ → 180° ⇒ η → 0
- [ ] Degenerate h (radial trajectory) falls back safely (radial thrust or feather; no NaN)
**Test Method:** `npm run test:lib`.

### Unit 4: Phasing bias controller
**Description:** `phaseBiasedTarget(shipState, targetElements, jd, cfg)` — Δφ, T_go estimate, Δφ_pred, saturated a-bias, biased target vectors (formula 2.3-e). Gain presets in config.
**Files:** `lib/sail-steering.js`, `lib/sail-steering.test.js`
**Acceptance Criteria:**
- [ ] Sign correctness: planet ahead ⇒ a_tgt < a_T; behind ⇒ a_tgt > a_T; Δφ_pred = 0 ⇒ a_tgt = a_T
- [ ] Bias magnitude clamped to `biasMax` for all Δφ
- [ ] Wrap correctness at Δφ = ±π (no discontinuity flip-flop across the boundary given hysteresis-free inputs)
- [ ] T_go finite and clamped for a→a_T and for zero-thrust-authority inputs
**Test Method:** `npm run test:lib`.

### Unit 5: Integrated per-step command
**Description:** `computeSailCommand(...)` per 2.3-f: input validation, SOI/corridor/hold/fault branches, gradient → attitude → hysteresis deployment, phase labels; plus exported `applySlewLimit(prev, cmd, dt, cfg)`. Persistent controller state (`ctl`) is a small caller-owned object (thrusting flag, previous angles).
**Files:** `lib/sail-steering.js`, `lib/sail-steering.test.js`
**Acceptance Criteria:**
- [ ] NaN/undefined inputs ⇒ feather + FAULT (never NaN outputs)
- [ ] η hysteresis: crossing η_on/η_off boundaries toggles deployment exactly once per crossing (no chatter in a synthetic η oscillation)
- [ ] Corridor branch triggers at `corridor·SOI` while closing; not while receding
- [ ] Slew limit: max per-step angle change ≤ slewRate·dt
- [ ] Command cost: ≥100k calls/sec in the node bench (sanity perf gate ≈ 10 µs/call budget, ~100× headroom over need)
**Test Method:** `npm run test:lib` incl. a micro-benchmark assertion.

### Unit 6: Closed-loop rollout simulator
**Description:** `simulateTransfer(shipSnapshot, targetElements, targetName, presetCfg)` in `autopilot-rollout.js` per 2.3-h, reusing `integrateStateRK4`/`propagateStateUniversal` + Unit-5 command. Returns summary + downsampled path. Pure; no imports outside lib/config.
**Files:** `lib/autopilot-rollout.js`, `lib/autopilot-rollout.test.js`
**Acceptance Criteria:**
- [ ] Earth-vicinity (0.95 AU) → Mars, default sail, BALANCED: quality ARRIVES with duration in a plausible 100-500 day band; arrival rel-speed < 10 km/s
- [ ] Same → Venus (inward transfer) ARRIVES (validates negative-yaw energy removal)
- [ ] Determinism: identical inputs ⇒ identical outputs
- [ ] Horizon exceeded ⇒ quality NO_ARRIVAL with partial path (no throw)
- [ ] Runtime: 1825-day rollout < 250 ms in node on CI hardware
**Test Method:** `npm run test:lib`.

### Unit 7: Rollout worker + pool wiring
**Description:** `rollout-worker.js` (protocol mirroring `eval-worker.js`: `{type:'rollout', id, shipSnapshot, targetElements, targetName, presets[]}` → `{type:'rollout-results', id, results[]}`), plus a `planTransferOptions()` helper (in `autopilot-rollout.js` or thin `core/` glue) that dispatches the 3 presets via `WorkerPool`-style management with main-thread serial fallback.
**Files:** `workers/rollout-worker.js`, `lib/autopilot-rollout.js` (export), `ui/controls.js` (call site added in Unit 10)
**Acceptance Criteria:**
- [ ] 3 presets dispatched concurrently; results correlate by id; UI thread never blocks > 1 frame
- [ ] Serial fallback produces identical results when workers unavailable
- [ ] Worker imports only pure modules (no window/document references transitively)
**Test Method:** Browser console smoke test (both localhost and file paths per existing worker URL logic); node test for the serial path.

### Unit 8: Autopilot lifecycle state + persistence
**Description:** `sailAutopilotState` in `gameState.js`: `{engaged, targetName, preset, engagedAt, phase, lastRollout: {eta, arrivalRelSpeed, path, computedAt}, ctl}` with accessors (`engageSailAutopilot`, `disengageSailAutopilot(reason)`, `setSailAutopilotPhase`, getters). Engaging also sets `autoPilotState.enabled = true` (capture handoff) and records preset config snapshot. `saveState.js` persists `{engaged, targetName, preset, engagedAt}` and re-engages on load (rollout/preview recomputed lazily). Deprecation comment on `transitState`.
**Files:** `core/gameState.js`, `core/saveState.js`
**Acceptance Criteria:**
- [ ] Engage/disengage round-trips through save/load (mid-transfer save restores engaged flight)
- [ ] Disengage resets `ctl` and leaves `ship.sail` at last commanded values (no snap)
- [ ] Existing `gameState.test.js` and save/load behavior green
**Test Method:** `npm run test:core`; manual save/load mid-transfer.

### Unit 9: Physics hook + wrong-planet capture suppression
**Description:** In `shipPhysics.js`: run the substep loop when `effectiveThrust || sailAutopilotEngaged` (a feathered autopilot must still evaluate steering to know when to redeploy — thrust application itself still gated on actual thrust). At each substep, if engaged: build heliocentric substep state (already computed as absPos/absVel), call `computeSailCommand` + `applySlewLimit`, write via `setSailAngle`/`setSailPitch`/`setSailDeployment`, update `sailAutopilotState.phase`. In `controls.js` `determineAutopilotPhase`: engaged && in SOI of non-target ⇒ CRUISE (no capture burns at the wrong planet).
**Files:** `core/shipPhysics.js`, `ui/controls.js`
**Acceptance Criteria:**
- [ ] Disengaged: zero behavior change (regression: existing `shipPhysics.test.js` green, manual flight identical)
- [ ] Engaged at 1× and 5×10⁸× warp: commands update every substep; no NaN elements after 1000 frames at max warp
- [ ] Feathered-engaged ship re-deploys when η recovers (the redeploy path works)
- [ ] Engaged transit passing through Earth's SOI en route to Mars: no thruster fires; sail feathered inside, resumes outside
- [ ] Target SOI entry: sail feathered, existing capture autopilot fires burns as today
**Test Method:** `npm run test:core` + scripted node scenario driving `updateShipPhysics`; manual SOI flyby test.

### Unit 10: NAV-tab plan/engage UI
**Description:** NAV tab section: destination (existing selector) + PLAN TRANSFER button → spinner → 3 option cards (preset name, ETA date, duration, arrival rel-speed, quality) → ENGAGE on a card; DISENGAGE button while engaged; status line (phase, target, ETA, preset). Manual sail input (legacy keys, fine-tune keys, sliders) while engaged ⇒ `disengageSailAutopilot('manual override')` + status flash. `A` key continues to toggle `autoPilotState.enabled` (thruster part) — engaging via card sets it true; disengaging sail autopilot leaves it as-is.
**Files:** `index.html`, CSS, `ui/controls.js`, `ui/uiUpdater.js`
**Acceptance Criteria:**
- [ ] Plan → options render without blocking UI; re-plan replaces cards
- [ ] Engage from a card starts steering (visible sail slider movement); disengage stops writes immediately
- [ ] Every manual sail-control path disconnects the autopilot (enumerated: `[`,`]`,`{`,`}`,`-`,`=`, arrow fine-tune, mouse rows, deployment buttons)
- [ ] Status shows phase transitions SPIRAL→PHASING→APPROACH→ARRIVED
- [ ] Non-planet destinations: PLAN disabled with tooltip (v1 scope: 8 planets)
**Test Method:** Manual browser checklist (no DOM test framework exists).

### Unit 11: Engaged-mode truthful preview
**Description:** While engaged: renderer draws `lastRollout.path` (distinct style) instead of the fixed-settings predicted path; draws the target ghost at `getPosition(target.elements, eta)` with an ETA label; suppresses fixed-settings encounter markers (they'd jitter as the autopilot moves the sail every substep). `main.js` refreshes the rollout in the background every `previewRefreshDays` of game time (default 10) or on preset/engage change; stale preview (> 2× refresh) dims.
**Files:** `ui/renderer.js`, `main.js`, `core/gameState.js` (rollout storage from Unit 8)
**Acceptance Criteria:**
- [ ] Engaged: green fixed-settings spiral hidden; rollout path + ETA ghost shown; disengaged: exactly today's rendering (regression)
- [ ] Preview refresh never blocks the frame (worker or idle-sliced serial fallback)
- [ ] ETA ghost tracks refreshed rollouts; label shows "+Nd"
**Test Method:** Manual; renderer diff at disengaged state vs main branch screenshots.

### Unit 12: Envelope tuning + acceptance scenarios
**Description:** Tune default gains/weights against the four corner scenarios; record results in the verification report template. Scenarios: (S1) 0.95 AU → Mars, 1 sail; (S2) → Venus, 1 sail; (S3) → Mercury, 1 sail (hard phasing, small SOI); (S4) → Jupiter, 50 sails (β≈21, fast dynamics, long horizon). Each: rollout ARRIVES, live engaged flight reaches target SOI with capture autopilot achieving bound orbit (e < 1) without exhausting 50 km/s ΔV, at both 10⁶× and max warp.
**Files:** `config.js` (final defaults), scenario script in `lib/autopilot-rollout.test.js`
**Acceptance Criteria:**
- [ ] S1, S2, S4 pass fully automated (node scenario harness driving the same code paths)
- [ ] S3 passes or is consciously descoped with a documented gameplay note (Mercury may need PATIENT preset + more capture ΔV)
- [ ] A forced miss (scripted mid-flight perturbation of ship elements) self-corrects: autopilot re-converges and still arrives
**Test Method:** `npm run test:lib` scenario suite + manual spot checks.

**Sequencing note:** U1 is independent (can land any time, ideally first). U2→U3→U4→U5→U6 are strictly ordered library work. U7, U8 can proceed in parallel after U6/U5 respectively. U9 needs U5+U8. U10 needs U7+U8. U11 needs U8+U9. U12 last. Each unit is separately committable and reversible; skipping any UI unit leaves earlier units inert but harmless (hook no-ops while `engaged` is false).

---

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Phasing heuristic (a-bias + analytic T_go) limit-cycles or converges too slowly for some geometries | Med | Med | Saturated P-control is first-order stable by construction; presets expose gain; rollout quality label is honest (NO_ARRIVAL) so the player is never promised an arrival the law can't fly; U12 tunes corners; anticipation term prevents wrap-chasing |
| Lyapunov local minima / zero-effectivity arcs stall progress (sail can't thrust sunward) | Low-Med | Med | Coast logic waits out bad arcs (standard sail practice); stall ⇒ Q plateau visible in rollout ⇒ NO_ARRIVAL label; energy pumping both directions is achievable via transverse component (verified in U6 Venus test) |
| Preview↔flight mismatch (P3: RK2-elements live vs RK4-state rollout) erodes trust in ETA | Med | Low | Closed loop guarantees arrival regardless; ETA displayed as approximate ("~"); periodic preview refresh re-anchors to real state; full integrator unification remains audit UOW-3 |
| Hook inside substep loop destabilizes existing physics (regression) | Low | High | Hook is strictly additive and gated on `engaged`; disengaged path byte-identical; U9 acceptance includes existing tests + max-warp NaN soak |
| Sail-slider chatter / ugly rapid toggling | Med | Low | Slew-rate limit + deployment hysteresis; both config-tunable |
| Mercury rendezvous infeasible at 1 sail within horizons | Med | Low | Honest labeling + PATIENT preset; conscious descope path defined in U12 |
| Worker payload/structured-clone issues (state snapshots with methods) | Low | Med | Snapshots are plain data (mirror `eval-worker` context pattern); serial fallback always available |
| Save/load mid-transfer restores stale controller state | Low | Med | Persist only durable facts (target/preset/engagedAt); `ctl` and rollouts rebuilt from scratch on load |
| High-β (50-sail) dynamics break near-circular assumptions in T_go/phasing formulas | Med | Med | Formulas used only for *scheduling*, not correctness (gradient math is exact for any β); U12-S4 validates; fallback: clamp T_go, rely on pure gradient descent which remains valid |
| UI scope creep (option cards, ghosts, styles) | Med | Low | v1 card content fixed in 2.3-g; markers simply suppressed while engaged rather than reworked |

---

## 5. Testing Strategy

### 5.1 Unit Tests (node --test, following `orbital-maneuvers.test.js` conventions)
- Finite-difference validation of `Q̇ = D⃗·f⃗` (Unit 2) — the single most load-bearing correctness check.
- Closed-form attitude vs brute-force grid (Unit 3).
- Phasing sign/saturation/wrap (Unit 4); command branches, hysteresis, slew, fault paths (Unit 5).
- Rollout scenario battery incl. determinism, horizons, runtime bound (Units 6, 12).
- Predictor P1/P2 regression pins (Unit 1).

### 5.2 Integration Tests
- Scripted `updateShipPhysics` flight: engage → SPIRAL → PHASING → APPROACH → target SOI entry, asserting phase sequence, no NaN, thruster silence outside target SOI (Unit 9).
- Save/load round-trip mid-transfer (Unit 8).
- Serial-fallback planning equals worker planning (Unit 7).

### 5.3 Manual Verification
- Browser: plan → engage → watch sail sliders steer; time-warp sweep 1×→5×10⁸×; Earth-SOI flyby en route to Mars; manual-override disconnect from every sail input; disengaged rendering identical to main.
- Console suites per CLAUDE.md (`import('/js/lib/sail-steering.test.js')` pattern added to the docs).

### 5.4 Explicit non-goals (v1)
- Moons/dwarf-planets/asteroids as autopilot targets; escape-from-SOI sail steering; time-optimal open-loop trajectories; integrator unification (audit UOW-3); multi-leg gravity-assist planning.

---

## 6. Post-Review Amendments (binding — from `reports/autopilot-review-2026-07-11.md`)

The 7-perspective review verdict is **Approved with conditions**. The following amendments override the corresponding text above; the implementation agent must treat them as part of the plan.

**AM1 (Critical — review FM1). Warp guard near arrival → Unit 9 scope + AC.** While engaged and within `warpGuardDistance` (default 20×SOI of the target), clamp the physics `deltaTime` per frame (config `maxEngagedNearTargetStep`, default 0.5 day) and surface an "AUTO-SLOW" status. Without this, the arrival corridor and even the whole SOI can be tunneled through in a single ~1.9-day substep at 5×10⁸× warp. New Unit 9 AC: at max warp, an engaged Mars arrival still enters the SOI (no fly-past) in the scripted scenario.

**AM2 (Critical — review FM2). Analytic target-orbit vectors → Units 2/4.** `computeSailCommand` must NOT obtain h⃗_T/e⃗_T via `getPosition`/`getVelocity` on the biased elements. Construct them analytically: `|h⃗_T| = √(μ·a(1−e²))` with ĥ_T from (i, Ω); ê_T (magnitude e, direction toward periapsis) from (e, i, Ω, ω) via the standard perifocal→ecliptic rotation. Exactly one Kepler solve per control update remains (target planet position for Δφ/corridor). Unit 5's micro-benchmark AC enforces the budget.

**AM3 (Important — review P1).** Cone-angle solver must be tan-free or special-case `|θ̃ − 90°| < ε` → `α* = atan(1/√2)`; add tests at θ̃ ∈ {0, 90°±1e-9, 135°, 179°}.

**AM4 (Important — review P2/SS2).** `AUTOPILOT_CONFIG` gains (`k_φ`, `φ_sat`, `biasMax`) become per-target-class (inner/mid/outer) and are additionally scaled by available thrust authority (time-scale-separation guard). Unit 12 adds a Jupiter-at-1-sail rollout corner (slowest-authority case).

**AM5 (Important — review F1/F3).** Unit 10 ACs added: engaged autopilot keeps its snapshot target when NAV destination changes (UI shows both + RETARGET = disengage + auto-PLAN); ENGAGE is idempotent; PLAN requests carry a sequence id and stale results are dropped; ENGAGE from new cards while engaged requires confirm-disengage.

**AM6 (Important — review F2).** Arrival (target SOI entry) re-asserts `autoPilotState.enabled = true` once; disabling the thruster autopilot (A key / mobile button) while the sail autopilot is engaged flashes a warning status.

**AM7 (Important — review FM3/FM4/FM5).** Phasing bias holds its previous sign within ±10° of |Δφ_pred| = π (wrap hysteresis); a single `resetSailControlState(ship)` is called on engage, load, and SOI transitions (sole owner of `ctl`); a minimum-perihelion guard (config, default 0.25 AU) suppresses further energy-lowering demand when the osculating perihelion falls below it.

**AM8 (Important — review A1/A2).** The shipPhysics hook is one glue call (`applySailAutopilot(ship, absPos, absVel, stepTime, subDt)`) placed BEFORE the existing `thrustMag < 1e-20 → continue` guard; control logic lives outside `shipPhysics.js`. `WorkerPool` is generalized (worker URL/message-type parameters) and reused for rollouts — no forked pool class.

**AM9 (Important — review BP1/BP2/BP3).** Verb-prefix all exported function names (`computeOrbitVectors`, `computeSteeringGradient`, `computeIdealSailAttitude`, `computePhaseBiasedTarget`); derived constants declared with derivations (`2/(3√3)`, `atan(1/√2)`), no bare 0.385/35.264/1731.46 literals; CLAUDE.md added to Units 10/11 file lists (console-test imports, autopilot usage, keyboard/display notes) with doc-update as an AC. Drop `phaseTimeline` from the v1 rollout payload (no consumer).

**AM10 (Important — review F4).** Unit 12 S3 becomes binary: pass = PATIENT rollout ARRIVES ≤1200 days AND live flight enters Mercury SOI; otherwise Mercury ships engageable with an honest NO_ARRIVAL label, and *that* labeled behavior is the tested acceptance.

**Regression baseline recorded at review time:** `npm test` = 209/209 pass (46 suites). Every unit must keep this bar; Unit 9 additionally requires the disengaged-flight A/B check (identical elements after 60 game-days vs base).
