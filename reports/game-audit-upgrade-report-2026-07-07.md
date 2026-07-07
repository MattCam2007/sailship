# Game Audit & Upgrade Report

**Date:** 2026-07-07
**Scope:** Mathematical/physical accuracy, runtime efficiency, test coverage
**Status:** Findings + high-level unit-of-work plans (detailed plans to be produced per-unit via `/planning`)

---

## 1. Executive Summary

The core orbital mechanics library (`orbital.js`) and the state↔elements conversion (`soi.js`) are **mathematically sound**: Kepler solvers (elliptic, hyperbolic, universal-variable/Stumpff), frame rotations, vis-viva velocities, the Vallado `stateToElements` formulation, and all unit conversions (`MU_SUN`, `ACCEL_CONVERSION`, GM table, SOI radii) were verified and check out. The ideal-sail cos²(cone-angle) thrust model is self-consistent between magnitude and direction, and yaw is correctly clamped to ±90°.

However, the audit found **two critical physics bugs in the trajectory predictor** (the green "predicted path" line), a **misleading green test signal** (`npm test` passes 209/209 while 7 assertions fail in suites it never runs), a **frame-rate-dependent simulation clock**, and several efficiency wins in the render/physics hot paths that don't affect gameplay.

**Test evidence (run during this audit, Node v-current):**

| Suite | Runner | Result |
|-------|--------|--------|
| orbital, orbital-maneuvers (+sailcount), soi, gravity-assist, shipPhysics, camera, gameState, ships.sailcount | `node --test` (`npm test`) | ✅ 209/209 pass |
| trajectory-predictor.test.js | console-style (`runAllTests()`) | ❌ 4/6 (zero-thrust + SOI truncation fail) |
| intersectionDetector.crossing.test.js | console-style | ❌ 12 pass / 5 assertion failures |
| intersectionDetector.test.js (legacy) | console-style | ✅ 10/10 |
| intersectionDetector.edge-cases.test.js | console-style | ✅ 12/12 |
| starfield.test.js | console-style | ⚠️ cannot run headless (browser `fetch` dependency) |

---

## 2. Physics / Mathematical Accuracy Findings

### P1 — CRITICAL: Predicted trajectory is frozen when thrust is zero

`src/js/lib/trajectory-predictor.js:352-529`. The simulation state `simState` is only advanced inside the `if (... && effectiveThrust ...)` block (line 465). With sails furled (deployment 0%, or area/condition 0), `simState` never updates, so every trajectory point is the ship's starting position. Verified: `testZeroThrust` fails with error growing ~0.01 AU/step (Keplerian motion vs. frozen point). The docstring's claim "With zero thrust, this matches the Keplerian orbit exactly" was true of the old elements-based propagator and was broken by the RK4 state-vector migration (see `reports/state-vector-integration-plan-2026-02-10.md`).

**Player impact:** furl the sails and the predicted-path line collapses to a dot; encounter markers computed from that trajectory become meaningless.

### P2 — CRITICAL: In-SOI prediction applies the planet's μ to a heliocentric radius

`src/js/lib/trajectory-predictor.js:474-517`. When in an SOI, the code converts `simState` to a **heliocentric** state (`thrustState`), then calls `integrateStateRK4(thrustState, sail, dt, mass, mu)` with `mu = getGravitationalParam(currentBody)`. Inside RK4, `gravitationalAcceleration` computes `-μ·r/|r|³` about the **origin** — so the planet's tiny μ is applied at ~1 AU toward the *Sun*. Planet gravity is effectively absent (wrong by a factor of (r_helio/r_planeto)² ≈ 10⁴–10⁶) and solar gravity is dropped entirely. Predicted paths inside an SOI are dynamically wrong whenever thrust is active (and frozen when it isn't, per P1).

**Correct form:** integrate the **planetocentric** state with the planet's μ (gravity toward origin = planet), while computing sail thrust from the heliocentric position (sun-relative), which `calculateSailThrustFromState` already supports via its `sunPosition` parameter.

### P3 — IMPORTANT: Actual ship physics and predictor use different integrators

- Ship (live): RK2-midpoint over **orbital elements** via ΔV-impulse `applyThrust` substeps, 2-hour target step, hard cap `MAX_SUBSTEPS = 50` (`src/js/core/shipPhysics.js:349-465`).
- Predictor: RK4 over **state vectors** (`trajectory-predictor.js`).

The comment block at `shipPhysics.js:350-359` still claims both use RK2 "so ghost planets stay accurate" — stale since the RK4 migration. Consequences: (a) systematic actual-vs-predicted divergence over long arcs; (b) at extreme warp (≥ ~10⁷x, frame steps > ~4 days) the 50-substep cap stretches substeps well past 2 hours, so the live ship silently loses accuracy relative to the prediction. This is precisely the divergence the code comments say was fixed.

### P4 — IMPORTANT: 5 failing assertions in orbit-crossing detection suite

`intersectionDetector.crossing.test.js`: failures include "Should detect exactly 2 crossings", "Should detect 4 crossings", "Should detect Venus crossing", "Should not detect crossings when always at radius", and "Time variation too large: 217.10 minutes". Either the crossing detector (primary algorithm behind encounter markers) has regressed, or the tests encode outdated expectations. Needs triage — encounter markers are a headline feature and currently have no trustworthy green signal.

### P5 — IMPORTANT: Simulation clock assumes exactly 60 FPS

`src/js/core/gameState.js:177-180` (`advanceTime()` adds a fixed `timeScale` per `requestAnimationFrame` callback) with `TIME_CONFIG.assumedFPS = 60` (`config.js:40-62`). On a 120 Hz display the whole simulation — including "1x real time" — runs 2× fast; on a struggling machine it runs slow. All speed presets are mislabeled off 60 Hz. Fix by deriving the per-frame step from the rAF timestamp delta (clamped), making `timeScale` days-per-real-second.

### P6 — MINOR: Solar pressure constant inconsistent with its own derivation

`config.js:104-113`: comment derives P = 1361/c ≈ 4.54e-6 N/m², but the constant is `4.56e-6` (corresponds to the older 1367 W/m² solar constant). ~0.5% thrust bias. Pick one (recommend 4.54e-6 with the modern 1361 W/m² TSI) and align comment + `orbital-maneuvers.test.js` expectation.

### P7 — MINOR: `estimateDeltaAPerOrbit` uses the wrong tangential-thrust law

`orbital-maneuvers.js:587-603`: tangential acceleration uses `cos(α)·sin(α)`; the ideal-sail model used everywhere else has magnitude ∝ cos²(α), so the tangential component is `cos²(α)·sin(α)`. The function (and `optimalSailAngle`) is **unused by the app** — fix or delete (see E6).

### P8 — MINOR: Documentation drift on physics behavior

- `applyThrust` docstring (`orbital-maneuvers.js:329-388`) documents Gauss's variational equations; the implementation is a state-vector ΔV + `stateToElements` roundtrip.
- `CLAUDE.md` says "Default sail: 1 km² area … typical acceleration ~0.5 mm/s²"; `config.js` `DEFAULT_SAIL.area = 3,000,000 m²` (3 km², ~2.5 mm/s² per its own comment). The inline comment `// m² (1 km² = 1,000,000 m²)` invites misreading.

### P9 — MINOR: Eccentricity clamps hardcoded and mutually inconsistent

`shipPhysics.js` RK2 loop hardcodes `e > 50` rejection (lines 414-419, 460-461) while config defines `TRAJECTORY_ROBUSTNESS.maxEccentricity = 200` and `PHYSICS_CONFIG.extremeEccentricityThreshold = 50`. `applyThrust` validates against 200. Unify through config so live physics and predictor truncate identically.

### P10 — VERIFIED CORRECT (no action)

Kepler solvers incl. near-parabolic universal-variable routing; hyperbolic anomaly handling; rotation matrices (position & velocity); vis-viva; eccentricity-vector `stateToElements`; RTN frame construction (both element-based and state-based paths agree); cos²-cone-angle sail thrust with sailCount linearity; unit constants `MU_SUN`, `ACCEL_CONVERSION`, planetary GM table, SOI radii (Laplace r_SOI = a(m/M)^{2/5} — note: comments call it "Hill sphere", worth a one-word doc fix); ±90° yaw/pitch clamps preventing unphysical sunward thrust; AU/day↔km/s factor 1731.46.

---

## 3. Efficiency Findings (no gameplay degradation)

### E1 — `project3D` recomputes camera trig per point

`core/camera.js:84-108` computes `Math.cos/sin(camera.angleZ/angleX)` on **every call**. It is called for every orbit segment (up to 1024/body — `renderer.js:478-481`), every trajectory point (up to thousands), every star, body, and label, every frame → tens of thousands of redundant trig calls/frame. Hoist a per-frame camera basis (compute once in `render()`, or memoize on angle change).

### E2 — Orbit ellipses fully re-sampled every frame

`renderer.js:445-535` (`drawOrbit`) recomputes r(ν), two trig calls, and the 3×2 rotation per segment, per body, per frame — yet planetary elements never change. Cache each body's sampled orbit polyline in body-local/ecliptic space (keyed by elements + segment count); per frame only add parent offset and project. Same pattern applies to `drawShipOrbit` when visual elements are stable.

### E3 — Always-on console logging in hot paths

- SOI entry/exit dump ~20 `console.log` lines unconditionally (`shipPhysics.js:844-975`, 1004-1088).
- `[TRAJ_DIAG]`, `[SOI_DIAG]` frame logs run without a debug flag.
- Module-load logs (`[SHIP_PHYSICS]`, `[TRAJECTORY_PREDICTOR]`, `[SOI]`).
- `checkForAnomalies` allocates state objects every 0.05 game days always-on.

Console I/O with DevTools open costs milliseconds per burst and pollutes the console. Gate everything behind the existing debug-flag pattern (`setThrustDebug` et al.), one shared `DEBUG` config object.

### E4 — O(n) body lookup in per-frame/per-substep loops

`getBodyByName` is `Array.find` (`celestialBodies.js:935-937`). Called up to 4× per substep × 50 substeps in `updateShipPhysics`, plus a dozen call sites per frame in `renderer.js` (some via repeated `celestialBodies.find` inline, e.g. lines 452-453, 490). Replace with a `Map` built once (and on any body-list mutation).

### E5 — Dead per-frame call

`generateFlightPath()` runs every frame from `main.js:128` but its body only clears an array (`navigation.js:70-72`). Remove the per-frame call (or the function) — the comment "for destination info display" no longer matches reality.

### E6 — Dead/legacy code inflating the physics surface

Unused by the app: `estimateDeltaAPerOrbit` (also wrong, P7), `optimalSailAngle`, `lastHDir` tracking in `getSailThrustDirection`, legacy closest-approach algorithm in `intersectionDetector.js` (kept alongside the crossing algorithm) + its suite. Confirm `eclipticToRTN` usage before touching. Deleting shrinks audit/maintenance surface; keep the legacy test only if the legacy path stays.

### E7 — Triplicated SOI frame-conversion block; wasted post-loop thrust calc

`updateShipPhysics` repeats the planetocentric→heliocentric conversion three times (lines 321-341, 383-399, 430-448) — extract a helper. It also recomputes `calculateSailThrust` after the substep loop purely for diagnostics (lines 468-477) even when all debug flags are off — compute lazily.

### E8 — Magic constants duplicated ~30×

`1731.46` (km/s per AU/day) appears ~20 times; `149597870.7` (km/AU) ~10 times, plus `SCALE_RENDERING_CONFIG.kmToAU` as a third spelling. Extract `KM_PER_AU`, `KMS_PER_AU_DAY` into `orbital.js`/`config.js`. Consistency/typo-proofing rather than speed.

### E9 — Already good (keep)

Trajectory cache with adaptive TTL + FNV hashing; 500 ms intersection-detection throttle; staggered cache cleanup; viewport culling and zoom-adaptive segment caps; gradient/texture caches. No action.

---

## 4. Test Coverage Findings

### T1 — CRITICAL (process): `npm test` is green while physics tests fail

`package.json`'s `node --test` only executes node:test-style suites (209 pass). The console-style suites — **trajectory-predictor (2 failures, incl. the P1 bug), intersectionDetector.crossing (5 failures, P4), intersectionDetector, edge-cases, starfield** — export `runAllTests()` and are invisible to the runner. The project's only automated signal actively hides its known failures. All five console suites *do* run under plain Node (verified in this audit) — they just need node:test wrappers.

### T2 — No CI

No `.github/workflows/`. Nothing runs tests on push/PR.

### T3 — Untested modules (by risk)

| Module | Lines | Risk |
|--------|------:|------|
| `lib/evaluate-trajectory.js` | 476 | Course-solver scoring — silent quality regressions |
| `core/navigation.js` | 591 | Destination/SOI-aware distance logic |
| `core/saveState.js` | 451 | Save/load — corruption loses player progress |
| `core/tripometer.js` | ~100 | Distance accumulation drift |
| `data/celestialBodies.js` | 991 | No data-sanity validation (element ranges, parent refs, μ table alignment) |

### T4 — Critical physics paths without tests

- SOI entry/exit transitions in `shipPhysics.js` (frame-conversion roundtrip error bounds, cooldown behavior, extreme-flyby path) — the most bug-prone code in the repo per its own diagnostic scaffolding.
- Actual-vs-predicted consistency: no test propagates the live RK2 path and the predictor over the same window and bounds the divergence (the exact regression P3 describes).
- In-SOI predictor branch (would have caught P2).
- Conservation regression: zero-thrust propagation preserves a, e, energy over full orbits.

### T5 — starfield suite can't run headless

Depends on browser `fetch` for the BSC5 catalog. Under node:test, load the JSON from disk so it joins CI.

---

## 5. Upgrade Plan — Units of Work

Ordered by priority. Each unit is atomic, independently shippable, and sized for one `/planning` → `/implement` cycle. **Opus will produce the detailed plan for each unit**; the notes below fix scope, approach, and acceptance criteria.

### UOW-1: Fix zero-thrust trajectory prediction (P1) — Critical
**Files:** `lib/trajectory-predictor.js`, `lib/trajectory-predictor.test.js`
**Plan:** Always advance `simState` each step: run `integrateStateRK4` regardless of thrust (RK4 with zero thrust is pure two-body gravity), or short-circuit to analytic Kepler propagation (`propagateStateUniversal`) when `!effectiveThrust` for speed + exactness. Keep truncation checks unchanged.
**Acceptance:** `testZeroThrust` passes at ≤1e-9 AU (analytic) or a documented RK4 tolerance; performance test still <10 ms; predicted path visibly follows the Keplerian orbit with sails furled.

### UOW-2: Fix in-SOI prediction frame/μ mismatch (P2) — Critical
**Files:** `lib/trajectory-predictor.js`
**Plan:** Integrate the **planetocentric** state with the planet's μ (gravity about the planet at origin); pass the planet's heliocentric position as `sunPosition` to `calculateSailThrustFromState` so thrust stays sun-relative. Delete the helio↔planeto shuffle around `integrateStateRK4`. Re-derive the SOI-exit truncation and revisit the failing SOI-truncation test's expectations (a start point outside the SOI should arguably return the boundary segment, not an empty array).
**Acceptance:** New test: circular planetocentric orbit, zero thrust → stays on orbit; with thrust → bounded divergence; SOI truncation test green with documented semantics.

### UOW-3: Unify live-ship and predictor integration (P3, P9) — Important
**Files:** `core/shipPhysics.js`, `lib/trajectory-predictor.js`, `config.js`
**Plan:** Extract one shared propagation routine (state-vector RK4 with the same substep policy) used by both the per-frame ship update and the predictor; source all eccentricity clamps from config; replace the stale RK2 comment block; define and document behavior at the substep cap (either raise cap with budget guard or accept + surface the accuracy loss at extreme warp).
**Acceptance:** New consistency test: propagate both paths 60 days at a warp that stresses substeps; positional divergence under an explicit bound (e.g. < 0.001 AU at 1 AU). Existing 209 node tests stay green.

### UOW-4: Triage crossing-detection failures (P4) — Important
**Files:** `lib/intersectionDetector.js`, `lib/intersectionDetector.crossing.test.js`
**Plan:** Reproduce each of the 5 failures; bisect whether detector behavior or test expectations changed (suspect interaction with adaptive-steps / cache changes). Fix code or update tests deliberately, with rationale recorded in the commit.
**Acceptance:** Crossing suite fully green under the unified runner (UOW-6); ghost-planet timing variation back under the suite's threshold.

### UOW-5: Frame-rate-independent simulation clock (P5) — Important
**Files:** `core/gameState.js`, `config.js`, `main.js`, `ui/controls.js` (speed UI)
**Plan:** Pass the rAF timestamp into the loop; `advanceTime(dtSeconds)` computes game-days from real seconds × preset multiplier; clamp max frame delta (tab-switch protection); remove `assumedFPS`. Presets keep their labels but become honest.
**Acceptance:** Simulated-clock test at mocked 30/60/120 FPS keeps game-time rate within 1%; no change to preset semantics at 60 FPS.

### UOW-6: Unified test runner + CI (T1, T2, T5) — Important
**Files:** all `*.test.js` console-style suites, `package.json`, new `.github/workflows/test.yml`
**Plan:** Wrap each console suite's cases in `node:test` (`test()` asserting `runAllTests() === true` as a stopgap, proper per-case conversion as the goal); starfield loads BSC5 JSON from disk when `fetch` is absent; keep browser entry points (per CLAUDE.md console workflow) working. Add a GitHub Action running `npm test` on push/PR.
**Acceptance:** One command runs every suite; CI goes **red today** on P1/P4 until UOW-1/2/4 land (that's the point).

### UOW-7: Physics regression test pack (T4) — Important
**Files:** new tests in `core/`, `lib/`
**Plan:** Add: SOI entry/exit roundtrip error bounds + cooldown behavior; zero-thrust conservation of a/e/energy over full orbits; actual-vs-predicted divergence bound (shared with UOW-3); in-SOI predictor sanity (from UOW-2); thrust-model invariants (cos² law vs yaw/pitch sweep, 1/r² scaling) complementing existing sailcount tests.
**Acceptance:** Suite runs in CI; each test documents its physical rationale and tolerance.

### UOW-8: Renderer hot-path optimization (E1, E2) — Medium
**Files:** `core/camera.js`, `ui/renderer.js`
**Plan:** Per-frame (or on-angle-change) hoist of camera rotation basis consumed by `project3D`; cache per-body orbit polylines keyed by elements+segments, reprojecting cached ecliptic points per frame. Measure with `performance.now()` instrumentation before/after at system + tactical zoom.
**Acceptance:** ≥30% reduction in orbit-drawing cost at default view; pixel-identical output (spot-check screenshots); no cache staleness when ship elements change.

### UOW-9: Gate diagnostic logging behind debug flags (E3) — Medium
**Files:** `core/shipPhysics.js`, `lib/trajectory-predictor.js`, `lib/soi.js`, `config.js`
**Plan:** Single `DEBUG` config consumed by the existing `set*Debug` console toggles; SOI entry/exit narration, `[SOI_DIAG]`/`[TRAJ_DIAG]`, module-load logs, and anomaly-detector allocation all become opt-in. Keep `console.warn` for genuine unexpected-state errors.
**Acceptance:** Silent console during normal play incl. SOI transitions at high warp; every existing toggle still re-enables its logs.

### UOW-10: Code health — lookups, dedupe, dead code, constants (E4-E8, P7) — Medium
**Files:** `data/celestialBodies.js`, `core/shipPhysics.js`, `core/navigation.js`, `main.js`, `lib/orbital-maneuvers.js`, `lib/intersectionDetector.js`, `config.js`/`lib/orbital.js`
**Plan:** Map-backed `getBodyByName`; extract shared planeto↔helio conversion helper (3 copies) and lazy diagnostic thrust calc; remove per-frame `generateFlightPath()`; delete or fix unused `estimateDeltaAPerOrbit` (cos²α·sinα if kept), `optimalSailAngle`, `lastHDir`; decide fate of legacy closest-approach algorithm; introduce `KM_PER_AU` / `KMS_PER_AU_DAY` and replace all literals.
**Acceptance:** All suites green; no behavior change (regression-checker pass); grep finds zero remaining `1731.46` literals outside the constant definition.

### UOW-11: Constants & documentation accuracy (P6, P8, P10 note) — Low
**Files:** `config.js`, `lib/orbital-maneuvers.js`, `CLAUDE.md`, `lib/orbital-maneuvers.test.js`
**Plan:** Settle `SOLAR_PRESSURE_1AU` (recommend 4.539e-6 from TSI 1361) and update the test expectation; rewrite `applyThrust` docstring to describe the state-vector method; sync CLAUDE.md sail specs (3 km², ~2.5 mm/s²) and fix the `DEFAULT_SAIL` inline comment; relabel "Hill sphere" → "Laplace SOI" in `SOI_RADII` comment.
**Acceptance:** Docs match code; thrust-magnitude tests updated alongside the constant in the same commit.

### UOW-12: Coverage for support modules (T3) — Low
**Files:** new tests for `core/saveState.js`, `core/tripometer.js`, `core/navigation.js`, `data/celestialBodies.js`, `lib/evaluate-trajectory.js`
**Plan:** saveState serialize→load roundtrip incl. malformed-input handling; tripometer accumulation vs known path; navigation destination/SOI distance math; data-sanity validation test over all bodies (element ranges, parent references resolve, μ/GM table alignment); evaluate-trajectory scoring invariants.
**Acceptance:** Each module has a suite in CI; data test doubles as a guard for future hand-edited body data.

---

## 6. Suggested Sequencing

1. **UOW-6** first (make the red visible), then **UOW-1 → UOW-2 → UOW-4** to turn it green.
2. **UOW-3 + UOW-7** together (shared integrator + the tests that pin it).
3. **UOW-5** (clock) — isolated, high player value.
4. **UOW-9 → UOW-8 → UOW-10** (perf & health, verify with regression-checker after each).
5. **UOW-11, UOW-12** as fill-in.

**Confidence rating: 8/10** — critical findings (P1, P2, T1) are reproduced with failing tests, not inferred; P3/P5 are code-verified; P4 needs the triage built into its own unit.
