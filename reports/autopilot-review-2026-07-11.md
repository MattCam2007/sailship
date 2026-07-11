# Closed-Loop Solar-Sail Autopilot Review

**Date:** 2026-07-11
**Plan Version:** `reports/autopilot-implementation-plan-2026-07-11.md`
**Spec Version:** `reports/autopilot-spec-2026-07-11.md`
**Reviewer:** Orchestrating agent, all seven perspectives performed inline. (Subagent dispatch was attempted for all 7 reviewers and failed on session usage limits; the review below independently re-derived the plan's math and re-checked its claims against source rather than trusting the plan text. Findings marked ✅ were verified by derivation or by reading the referenced code.)

---

## 1. Physics/Realism

### Findings
- ✅ **Lyapunov gradient formula verified by independent derivation.** From `ḣ⃗ = r⃗×f⃗` and `ė⃗ = (f⃗×h⃗ + v⃗×(r⃗×f⃗))/μ`, each triple product was rearranged (a⃗·(b⃗×c⃗) = c⃗·(a⃗×b⃗)) and the plan's `D⃗ = (2w_h/|h_T|²)(Δh⃗×r⃗) + (2w_e/μ)[h⃗×Δe⃗ + (Δe⃗×v⃗)×r⃗]` is correct, including signs. `Q̇ = D⃗·f⃗` holds exactly for any perturbing acceleration (gravity conserves both vectors).
- ✅ **Cone-angle optimum verified.** `d/dα[cos²α·cos(θ̃−α)] = 0 ⇒ tan(θ̃−α) = 2tanα ⇒ 2tanθ̃·t² + 3t − tanθ̃ = 0`. Limit checks pass: θ̃→0 ⇒ α*→0; θ̃=90° ⇒ α* = atan(1/√2) = 35.264°, matching the known optimal-transverse-thrust result and `optimalSailAngle()` in `orbital-maneuvers.js:570`.
- ✅ **The game's sail law is exactly the ideal-sail cone-angle law.** Direction `(cosγcosβ, sinγcosβ, sinβ)` has radial cosine `cosα = cosγ·cosβ`, and the magnitude factor `cos²γ·cos²β = (cosγcosβ)² = cos²α` identically. The (α, δ) → (γ, β) conversion in the plan (`sinβ = sinα·sinδ`, `γ = atan2(sinα·cosδ, cosα)`) reproduces the direction and satisfies `sin²γ+cos²γ = 1` — verified algebraically.
- ✅ **Near-circular `da/dt ≈ 2f_T/n`** follows from Gauss's equation `da/dt = (2a²/h)(e·sinν·f_R + (p/r)·f_T)` with e→0, p≈r≈a, h = na². Phase-loop linearization `Δφ̇ ≈ −(3/2)·n_T·k_φ·sat(·)` is correct via `dn/da = −(3/2)n/a`.
- Units audit: all formulas dimensionally consistent in AU/day/rad; `a_max(r) = 2·P₁AU·A_eff·ρ·sailCount/(m·r²)·ACCEL_CONVERSION` matches `calculateSailThrustFromState`.

### Concerns
| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| P1 | Important | The quadratic root formula divides by `tanθ̃`, singular at θ̃ = 90° (a common case — pure transverse demand), and `tanθ̃` overflows near it. Plan says "evaluate both roots' objectives" but doesn't address the singularity itself. | Implement the solver in a tan-free form or special-case `|θ̃ − 90°| < ε` → α* = atan(1/√2). Add explicit test at θ̃ = 90° ± 1e-9. |
| P2 | Important | Phase-loop stability argument assumes time-scale separation: the orbit-tracking inner loop must converge faster than the phase outer loop. At low thrust authority (1 sail at 5+ AU, where a_max is 27×+ weaker than at 1 AU), the inner loop is slow and the phasing can overshoot/limit-cycle. Gain scheduling by `n_T` alone doesn't capture this. | Schedule `k_φ` by both `n_T` and available thrust authority (e.g., scale by `min(1, T_phase/T_orbitConverge)` using the plan's own analytic rates), and verify in Unit 12 S4; add a Jupiter-at-1-sail rollout case (slowest-authority corner) to the scenario battery. |
| P3 | Nice-to-have | `T_go ≈ |Δa|·n/(2·0.385·a_max)` ignores the 1/r² weakening of `a_max` along an outward spiral — underestimates T_go for outer targets, weakening anticipation. | Evaluate `a_max` at the geometric mean radius √(r·a_T) instead of current r; document as heuristic either way. |
| P4 | Nice-to-have | `e⃗` for near-parabolic ship states (|e⃗| ≈ 1 during aggressive spirals at β≈21) makes `Δe⃗` direction noisy near the parabolic boundary. Gradient stays finite (no division by e), so this is a convergence-quality issue, not a blowup. | Note in code; rely on effectivity/hysteresis; covered if Unit 12 S4 passes. |

**Domain confidence: 8/10** — the load-bearing math is verified by independent derivation; residual risk is tuning dynamics, not correctness, and the finite-difference test (Unit 2) pins the one formula that matters most.

---

## 2. Solar Sailing Expert

### Findings
- The design is a genuine sail steering law, not rocket thinking in disguise: locally-optimal force-direction clamping to the ideal-sail bubble is the canonical approach (McInnes' locally optimal laws; Q-law adaptations for sails), and "coast" here means *feathered because thrusting is momentarily counterproductive*, which is exactly how real sails coast — no ballistic-arc assumptions anywhere.
- Inward transfers work through the correct mechanism: negative-yaw attitudes produce negative transverse thrust (energy removal) with the unavoidable positive radial component; the gradient law discovers this automatically because `D⃗` weights the transverse direction when Δh⃗ demands angular-momentum reduction. The Venus rollout test (Unit 6) pins it.
- The sunward-thrust impossibility is respected structurally (envelope clamp), not by ad-hoc clamps on the demand vector — with the effectivity/coast fallback when the whole achievable bubble is useless. Correct.
- Continuous re-steering from real state each substep is precisely the "continuous navigation updates" operating model the 2026-02-09 investigation said real sail missions use. This is the first plan in the repo's lineage with the right solution shape.
- ETA is presented as approximate and re-anchored by periodic rollout refresh — honest for a sail, where arrival time is emergent, not commanded.

### Concerns
| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| SS1 | Important | Feathering through the arrival corridor throws away the sail's ability to bleed approach v∞ during the last weeks. For hot arrivals this shifts the whole burden to thruster ΔV. Not wrong (50 km/s budget is huge, and the law converges toward velocity matching anyway), but it's the one place the plan is less sail-like than it could be. | Keep v1 as planned; record a v2 enhancement: in APPROACH phase, steer q̂ = −v̂_rel (locally optimal v∞ reduction) instead of feathering, when effectivity permits. |
| SS2 | Important | Phasing authority differs by ~2 orders of magnitude across targets (Mercury n = 4.09°/day vs Neptune n = 0.006°/day) and the bias cap ±0.15·a_T has very different phase-rate meaning at each. A single preset table may fly Mars beautifully and dither at Mercury/Neptune. | Make `k_φ`, `φ_sat`, `biasMax` per-target-class in `AUTOPILOT_CONFIG` (inner/mid/outer), tuned in Unit 12; do not ship a single global tuple. |
| SS3 | Nice-to-have | At β≈21 (50 sails) trajectories are strongly non-Keplerian; osculating h⃗/e⃗ swing rapidly, so the "SPIRAL vs PHASING" phase labels (thresholded on Δa) may flicker even while control is fine. Cosmetic. | Hysteresis on the phase *label*, not just deployment. |
| SS4 | Nice-to-have | Slew limit 90°/game-day: physically reasonable for a km-scale sail, but at 1× time it means imperceptible motion. Fine — just document it as a realism feature, not a bug, in the UI status ("slewing…"). | Doc note + status text. |

**Domain confidence: 8/10** — correct solution family, correct treatment of the envelope; remaining risk concentrated in per-target phasing tuning, which the plan already isolates in config + Unit 12.

---

## 3. Functionality

### Findings
- The 12 units cover the full promise: select (existing UI) → options (U6/U7/U10) → pick (U10) → autonomous flight (U5/U8/U9) → SOI handoff (U9 + existing capture autopilot) → truthful preview (U11).
- Traced the user journey against `controls.js` input paths: the plan's manual-override list must cover legacy keys (`[`,`]`,`{`,`}`,`-`,`=`), fine-tune (`1/2/3`, arrows, `F` — F changes resolution only, should NOT disconnect), mouse control rows, and mobile buttons (`initMobileControls` — `mobileAutopilot` exists and must map to disengage/engage sensibly).
- Rollout quality labels are the guard against over-promising: an option is only shown as ARRIVES if the *same law* reached the SOI in simulation; the live loop then corrects residual divergence. The one systematic gap is targets where the law arrives but capture fails (fuel) — capture is out of the sail autopilot's control and the option card's "arrival rel-speed" is the honest signal.

### Concerns
| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| F1 | Important | Destination changed mid-transfer is unspecified: NAV `destination` and `sailAutopilotState.targetName` diverge silently (navigation.js `setDestination` is called from canvas clicks too — easy to hit accidentally). | Add to Unit 10 AC: engaged autopilot keeps its snapshot target; UI shows both when they differ, with a RETARGET button = disengage + auto-PLAN for new destination. |
| F2 | Important | Mobile autopilot button (`controls.js:1793-1922`) toggles `autoPilotState.enabled`; with the sail autopilot engaged this can strand the capture handoff (sail arrives, thrusters disabled). Same issue for keyboard `A`. | Define: disabling thruster autopilot while sail autopilot is engaged prompts/flashes a warning status; ENGAGE re-asserts `enabled = true` (already planned) and arrival re-asserts it once (add to Unit 9). |
| F3 | Important | Double-ENGAGE, ENGAGE-during-PLAN, and PLAN-while-engaged flows are unspecified (stale rollout results racing an engaged flight). | Unit 10 AC: ENGAGE idempotent; PLAN cancels/ignores in-flight results when superseded (tag requests with a sequence id, drop stale); PLAN while engaged allowed but ENGAGE from new cards requires confirm-disengage. |
| F4 | Important | Unit 12 S3 "passes or is consciously descoped" is not a pass/fail criterion — this is where scope rot starts. | Make it binary: S3 passes if PATIENT preset ARRIVES within 1200 days in rollout AND live flight enters Mercury SOI; otherwise Mercury ships as NO_ARRIVAL-labeled (still engageable) and that behavior is itself the tested acceptance. |
| F5 | Nice-to-have | `F` (resolution cycle) and camera/time keys correctly excluded from disconnect, but the plan doesn't say so explicitly — an implementer may over-disconnect. | Enumerate non-disconnecting inputs in Unit 10. |
| F6 | Nice-to-have | Vague band "100-500 days" in Unit 6 AC weakens the test. | Pin to a tolerance around the tuned baseline once Unit 12 fixes gains (e.g., BALANCED Mars = X ± 20%), asserting on the recorded value. |

**Domain confidence: 7/10** — end-to-end coverage is real; the gaps are lifecycle/interaction edges, all cheap to close in Unit 9/10 ACs before implementation.

---

## 4. Architecture

### Findings
- Module placement respects `data/ → lib/ → core/ → ui/`: both new lib modules depend only on `orbital.js`/`orbital-maneuvers.js`/`config.js`, mirroring `evaluate-trajectory.js` (the proven worker-safe pattern). No new cycles: `shipPhysics` already imports from `gameState`; `gameState` gains no lib/steering imports.
- The substep-level hook is the right call and the plan's justification (96 game-days/frame at max warp vs ~1.9-day substeps) is arithmetically correct from `SPEED_PRESETS` and `MAX_SUBSTEPS`. A per-frame hook in `main.js` would be exactly the kind of stale-geometry control that killed prior attempts, just on a shorter horizon.
- Keeping `autoPilotState` (thruster/SOI phases) separate from `sailAutopilotState` (cruise steering) matches the existing "two independent subsystems" reality and avoids touching the working capture code — correct conservatism. The wrong-planet guard belongs in `determineAutopilotPhase` since that's the single phase-decision point.
- Leaving `transitState` deprecated-in-place is defensible for regression surface, and consistent with the plan's "one owner" rule since nothing new writes it.

### Concerns
| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| A1 | Important | Physics module consulting UI-adjacent global state: the hook reads `sailAutopilotState` and *writes `ship.sail`* inside `updateShipPhysics`. Acceptable coupling, but the write path must go through `ships.js` setters and the hook must be a single small function call (e.g., `applySailAutopilot(ship, absPos, absVel, stepTime, subDt)`) so `shipPhysics` gains one line per call site, not inlined control logic. | Add to Unit 9 AC: hook body lives in `sail-steering.js`-adjacent glue (or a small `core/sailAutopilot.js`), not inline in the substep loop. |
| A2 | Important | "WorkerPool-style management" for rollouts is vague and risks a duplicated second pool implementation. `WorkerPool` hardcodes `eval-worker.js` in `getWorkerUrl()`. | Generalize `WorkerPool` to accept a worker URL + message type (2-line change), reuse it for rollouts; do not fork the class. Fold into Unit 7 AC. |
| A3 | Nice-to-have | `sailAutopilotState` global vs per-ship `ship.autopilot`: global matches the existing pattern but bakes in single-player-ship assumptions. | Accept global for v1 (consistency); note per-ship migration as future work in code comment. |
| A4 | Nice-to-have | Unit 11 pushes renderer toward reading feature state (`lastRollout.path`) directly from gameState — consistent with how predicted path already works, but keep the "which path to draw" decision in one place. | Single selector function (e.g., `getActivePreviewPath()`) consumed by renderer; renderer stays dumb. |

**Domain confidence: 8/10** — follows the repo's own proven patterns; the two Important items are scoping clarifications, not redesigns.

---

## 5. Failure Modes

### Findings
- **Performance claim in the plan is overstated and was corrected during review:** `computeSailCommand` as specified calls `getPosition`/`getVelocity` for the (biased) target — Newton–Raphson Kepler solves — up to twice per substep, on top of the planet-position solve for Δφ/corridor. At the 50-substep cap that's up to ~200 extra Kepler solves/frame, roughly doubling substep cost at max warp. Not a freeze risk (existing loop already does 2 solves/substep), but it violates the spirit of the budget constraint. **Fix identified:** compute `h⃗_T`, `e⃗_T` analytically from the biased elements — `|h_T| = √(μa(1−e²))`, ĥ_T from (i, Ω), ê_T from (e, i, Ω, ω) via the standard rotation — zero Kepler solves; only ONE planet-position solve per control update remains (needed for Δφ/corridor regardless). This must be written into Unit 2/4 as the required implementation.
- **Arrival tunneling at high warp is the worst player-facing failure:** at 5×10⁸× (1.93-day substeps), a ship near intercept covers ~0.03 AU/substep — larger than the whole arrival corridor (3×SOI_Mars ≈ 0.012 AU) and far larger than Mars's SOI (0.00386 AU). The corridor check *and* SOI detection can both skip the encounter; `checkSOIEntryTrajectory`'s line-sphere sweep uses a straight chord across a 96-day frame, which is a poor approximation of a curved spiral. Result: "autopilot flew straight past Mars at max warp" — precisely the bug report this feature cannot afford. This is a **must-fix condition**: while engaged and within `warpGuardDistance` of the target (e.g., 20×SOI), clamp the physics step (effective `deltaTime` cap per frame, surfaced in UI as "AUTO-SLOW near target"). Existing manual play has the same exposure, but the autopilot *aims* at SOIs, so it converts a latent issue into a certain one.
- `applyThrust`'s silent-rejection path (returns original elements on degenerate output, `orbital-maneuvers.js:451-454`) is benign under feedback: the controller re-evaluates from actual state next substep; no divergence accumulates. Verified reasoning, no action needed.
- The engaged-but-feathered loop change (`effectiveThrust || engaged`) is safe *only if* the steering call precedes the existing `if (thrustMag < 1e-20) continue;` guard (`shipPhysics.js:410`) — the guard then correctly skips thrust application while steering still ran. Ordering documented here so the implementer can't get it wrong.
- Extreme-flyby mode (e > 50, linear interpolation) and SOI cooldowns: hook feathers inside any SOI, so no interaction with the flyby path; on SOI exit the elements are rebuilt and `ctl` continuity only affects slew (angles resume from current sail state — no snap).
- Preview-refresh hitch in serial fallback (no workers): a 1825-day rollout on the main thread is tens of ms. Mitigation: in fallback mode refresh only on engage/preset-change, not periodically.

### Concerns
| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| FM1 | **Critical (condition)** | High-warp arrival tunneling: corridor/SOI can be skipped entirely in one substep near intercept; guaranteed player-visible mission failure at high warp. | Add warp guard to Unit 9 (physics-side deltaTime clamp within 20×SOI of engaged target + UI "AUTO-SLOW" status). Ship the feature only with this in place. |
| FM2 | Important | Hot-path Kepler solves (plan §2.3-f as written) double substep cost at max warp. | Mandate analytic target-orbit vectors (no getPosition for h⃗_T/e⃗_T); one planet ephemeris solve per control update; micro-benchmark AC in Unit 5 stays. |
| FM3 | Important | Δφ wrap chatter at ±π: with the planet nearly opposite the ship, `sat(Δφ_pred)` flips sign frame-to-frame, flip-flopping the a-bias (visible as deployment/attitude dithering). | Hysteresis band around |Δφ_pred| = π (hold previous bias sign within ±10° of π); test in Unit 4 AC (already partially there — make the hysteresis explicit). |
| FM4 | Important | `ctl` (hysteresis/slew memory) lifecycle across SOI transitions, save/load, disengage/re-engage is scattered through Units 5/8/9. A stale `thrusting` flag or angle memory after frame changes produces one-frame command spikes. | Centralize: `resetSailControlState(ship)` called on engage, load, and SOI transitions; single owner in `sailAutopilotState.ctl`. |
| FM5 | Important | Sun-dive guard: gradient descent toward a strongly biased inner target (Mercury, PATIENT mispredicted) could steer through the r < 0.02 AU cutoff region where other code truncates. | Command-level guard: if periapsis of current osculating orbit < `minPerihelion` (config, e.g. 0.25 AU for Mercury-class targets), suppress further energy-lowering demand (zero the inward component of D⃗ or feather); test with an adversarial biased-target case. |
| FM6 | Nice-to-have | NaN discipline: plan says fail-passive, but the fault branch must also *clear* deployment via setters so the ship doesn't keep old thrust with a faulted controller. | Fold into Unit 5 fault AC explicitly. |
| FM7 | Nice-to-have | ETA jump between preview refreshes (10 game-days apart) can look glitchy if phasing is still converging. | Display ETA with "~" and smooth card updates; no mechanism change. |

**Domain confidence: 7/10** — two substantive design corrections came out of this pass (FM1, FM2); with them folded in as conditions, the remaining failure surface is well-bounded and mostly cosmetic.

---

## 6. Best Practices

### Compliance Summary
| Category | Status | Notes |
|----------|--------|-------|
| Imports | Compliant | Plan specifies named exports, `.js` extensions, pure-lib isolation (matches `evaluate-trajectory.js` exemplar) |
| Naming (files) | Issues | CLAUDE.md says camelCase files, but `lib/` reality is kebab-case for multi-word modules (`orbital-maneuvers.js`, `evaluate-trajectory.js`, `trajectory-predictor.js`, `gravity-assist.js`, `worker-pool.js`). Plan's `sail-steering.js`/`autopilot-rollout.js` follow the *dominant local* convention — correct choice; the CLAUDE.md table is what's stale |
| Naming (functions) | Issues | `orbitVectors` lacks verb prefix; rest compliant (`computeSailCommand`, `applySlewLimit`, `simulateTransfer`, `planTransferOptions`) |
| Config discipline | Compliant (with BP2) | `AUTOPILOT_CONFIG` planned; some derived constants risk being inlined |
| State pattern | Compliant | Plain state object + accessor functions in `gameState.js` matches `autoPilotState` pattern; no classes |
| Tests | Compliant | node:test `describe/it` per `orbital-maneuvers.test.js`; browser-console import pattern to be added to docs (see BP3) |
| Docs | Issues | CLAUDE.md updates missing from the plan's file-impact list entirely |

### Violations
| ID | Severity | Category | Description | Fix |
|----|----------|----------|-------------|-----|
| BP1 | Important | Naming | `orbitVectors`, and any similar noun-named helpers, break the verb-prefix convention | `computeOrbitVectors`, `computeTargetOrbitVectors`, `computeSteeringGradient`, `computeIdealSailAttitude`, `computePhaseBiasedTarget` |
| BP2 | Important | Constants | 0.385 (= 2/(3√3)), 35.264° (= atan(1/√2)), corridor factor, and the km/s conversion 1731.46 must not appear as bare literals in new code (audit E8 already flags 1731.46 sprawl) | Module-level derived consts with derivation comments (`const MAX_TRANSVERSE_FRACTION = 2 / (3 * Math.sqrt(3));`); take corridor/thresholds from `AUTOPILOT_CONFIG`; define `KMS_PER_AU_DAY` locally pending audit UOW-10 centralization |
| BP3 | Important | Docs | CLAUDE.md is not in the plan's edit list: needs Console Tests additions (2 new suites), NAV-tab/autopilot usage section, keyboard note (`A` semantics unchanged, manual-input disconnect), Display Options note (engaged-mode preview replaces predicted path) | Add CLAUDE.md to Unit 10/11 file lists; make doc-update an AC |
| BP4 | Nice-to-have | Over-engineering watch | `phaseTimeline` in rollout results has no consumer in v1 UI | Drop it from the v1 payload; add when a UI consumes it |
| BP5 | Nice-to-have | Consistency | Scratch-object allocation-free style is used in some hot paths but not codified | One comment block in `sail-steering.js` explaining the scratch-vector pattern; keep it out of non-hot paths |

**Domain confidence: 8/10** — plan is idiomatic for this repo; violations are naming/docs hygiene, all trivially fixable at implementation time.

---

## 7. Regression Risk

### Impact Analysis
- **Files changed:** `trajectory-predictor.js` (+test), `config.js`, `gameState.js`, `saveState.js`, `shipPhysics.js`, `controls.js`, `uiUpdater.js`, `renderer.js`, `main.js`, `index.html`/CSS; new files additive.
- **Features affected:** manual sail flight (hook gate change), predicted-path display + ghost planets (P1/P2 fixes change predictor output), SOI transitions & thruster capture autopilot (new phase guard), save/load (new persisted block), NAV panel, mobile controls (autopilot button semantics), keyboard handling (disconnect hooks).
- **Shared modules touched:** `shipPhysics.js` and `controls.js` are the highest-traffic shared files; `orbital-maneuvers.js` deliberately untouched.

### Risk Assessment
| Existing Feature | Risk Level | Rationale |
|------------------|------------|-----------|
| Manual (disengaged) sail flight | Med | Substep-loop gate changes from `effectiveThrust` to `effectiveThrust \|\| engaged`; must be provably identical when disengaged (engaged=false short-circuits) |
| Predicted path & encounter markers | Med | P1 fix un-freezes zero-thrust paths → coasting players suddenly see a real path and possibly *new* ghost planets (behavioral change, desirable but visible); P2 fix changes all in-SOI previews; intersection suites + manual furl-sails check required |
| Thruster capture/slingshot autopilot | Med | New guard in `determineAutopilotPhase`; must not alter behavior when sail autopilot is disengaged (guard predicated on engaged) |
| Save/load | Low-Med | Additive block; malformed/legacy saves must load with autopilot disengaged (default) |
| SOI entry/exit mechanics | Low | Untouched logic; hook feathers inside SOIs; FM1 warp guard adds a deltaTime clamp — must apply only when engaged |
| Renderer (disengaged) | Low | Preview switch predicated on engaged; disengaged path must be pixel-identical |
| Mobile controls / keyboard | Low-Med | Disconnect wiring touches many handlers; each must be individually spot-checked |
| Cheat codes / tripometer / starfield / textures | None-Low | Untouched; tripometer reads positions only |

### Recommended Regression Tests (per unit)
- [ ] **Baseline (recorded this review):** `npm test` = **209/209 pass, 46 suites, 0 fail** on branch base. Any post-unit run must stay ≥ this bar; new failures are the unit's fault by definition.
- [ ] Unit 1: `npm run test:lib`; browser suites `trajectory-predictor.test.js`, `intersectionDetector.crossing.test.js`, `intersectionDetector.edge-cases.test.js`; manual: sails furled → path tracks orbit; ghost planets sane while coasting; in-SOI preview no longer explodes.
- [ ] Units 2-6: `npm run test:lib` (new suites additive; zero edits to existing modules — confirm with `git diff --stat`).
- [ ] Unit 7: browser worker smoke on localhost path; serial-fallback parity test.
- [ ] Unit 8: `npm run test:core`; save→load→save roundtrip diff; legacy save (no autopilot block) loads clean.
- [ ] Unit 9: **full `npm test`**; manual A/B: disengaged flight vs main branch at 1× and 10⁶× (same elements after 60 game-days within float noise); SOI entry/exit under manual flight unchanged; capture autopilot still fires (existing behavior) with sail autopilot disengaged.
- [ ] Unit 10: manual input matrix — every sail input disconnects; every non-sail input (camera QWESR, time, `F`, tabs, cheats) does not; `A` and mobile autopilot button behavior per F2 resolution.
- [ ] Unit 11: disengaged rendering screenshot-identical; engaged toggle on/off restores markers/predicted path.
- [ ] Unit 12: scenario suite green; then full `npm test` + the complete browser console suite list from CLAUDE.md.

**Domain confidence: 8/10** — risk is concentrated in exactly two shared files with clear predicated-off-when-disengaged designs; the P1 behavioral change is the only player-visible regression vector and it's an intended fix.

---

## 8. Summary

### Confidence Rating: 7/10

The steering-law core — the part every prior attempt got structurally wrong — is verified correct by independent derivation (gradient formula, cone-angle optimum, envelope equivalence, phasing linearization). The architecture reuses the repo's own proven patterns and the unit decomposition is genuinely atomic. The deductions are for: one Critical operational gap found during failure analysis (FM1 warp tunneling), one overstated performance claim requiring a specified fix (FM2 analytic target vectors), and phasing-tuning risk across the target envelope that only Unit 12 can retire empirically.

### Critical Issues (Must Fix — conditions of approval)
1. **FM1 — High-warp arrival tunneling.** Add the engaged-mode warp guard (deltaTime clamp within ~20×SOI of target + "AUTO-SLOW" status) to Unit 9 scope and acceptance criteria. Without it the feature's headline scenario fails at the time scales players actually use.
2. **FM2 — Replace `getPosition`/`getVelocity`-based target-orbit vectors with analytic construction** from elements in `computeSailCommand` (Units 2/4). Keeps the hot path within the stated budget (≤1 Kepler solve per control update, for the planet ephemeris only).

### Important Issues (Should Fix during implementation)
1. P1: tan-free/special-cased cone-angle solver at θ̃ = 90° (+ test).
2. P2/SS2: gain scheduling by target class *and* thrust authority; per-class config; add Jupiter-at-1-sail rollout corner.
3. F1/F3: mid-transfer destination-change semantics (RETARGET flow), idempotent ENGAGE, stale-PLAN result discard.
4. F2: `A`-key / mobile-button interplay with engaged sail autopilot (re-assert `enabled` at arrival; warn on manual disable).
5. FM3/FM4/FM5: Δφ = ±π bias hysteresis; centralized `ctl` reset on engage/load/SOI transition; minimum-perihelion guard.
6. A1/A2: hook as a single glue call, not inline logic; generalize `WorkerPool` (URL parameter) instead of forking it.
7. BP1/BP2/BP3: verb-prefix names; derived-constant discipline; CLAUDE.md doc updates added to the plan's file impact.
8. F4: make Unit 12 S3 (Mercury) binary as specified in §3.

### Recommendations
1. Fold the two Critical conditions and the Important fixes into the plan as amendments *before* `/implement` begins (they are AC-level edits, not redesign — the implementation agent should treat plan §2.3-f as amended by FM2, and Unit 9 as amended by FM1).
2. Implement Unit 2's finite-difference `Q̇ = D⃗·f⃗` test *first* within that unit — it is the single test that catches a wrong sign anywhere in the core math.
3. Keep the verification phase's scenario battery (Unit 12) as the gate for tuning defaults; do not hand-tune against Mars only.

### Verdict
- [ ] Approved
- [x] **Approved with conditions** (FM1, FM2 mandatory; Important list to be addressed during implementation)
- [ ] Requires revision
