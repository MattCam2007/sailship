# Ship Trajectory Cutoff — Implementation Plan

**Generated:** 2026-02-10

## Implementation Units

### Unit 1: Raise Heliocentric Limit (trivial)
**File:** `trajectory-predictor.js:28`, `evaluate-trajectory.js:323`
- Change `MAX_HELIOCENTRIC_RADIUS` from 10 to 50 AU
- Update `evaluate-trajectory.js` sun approach check to use same constant
- Update comment

### Unit 2: Element Clamping in stateToElements/applyThrust
**Files:** `soi.js`, `orbital-maneuvers.js`, `config.js`
- In `stateToElements()`: clamp `a` to `[1e-6, 1000]` for elliptic, `[-1000, -1e-6]` for hyperbolic
- In `stateToElements()`: clamp `e` to `[0, 200]` (generous upper bound catches runaway without killing valid hyperbolic)
- In `applyThrust()`: replace silent return-original-elements with clamped elements + warning
- Add `TRAJECTORY_ROBUSTNESS` config to `config.js`

### Unit 3: Adaptive Sub-stepping
**File:** `trajectory-predictor.js`
- After each RK2 step, check `|Δe| > threshold` or `|Δa/a| > threshold`
- If triggered, redo that step with N sub-steps (4)
- Sub-steps are internal only — output trajectory point count unchanged
- Max 1 retry per step to bound worst-case perf (2x cost on bad steps, ~1% of steps)

### Unit 4: Universal Variable for Near-Parabolic Orbits
**File:** `orbital.js`
- Add Stumpff functions C(z) and S(z)
- Add `solveKeplerUniversal(r0, vr0, α, dt, μ)` using universal variable χ
- In `getPosition()`/`getVelocity()`: route through universal solver when `0.95 < e < 1.05`
- Keep existing fast paths for normal elliptic/hyperbolic

## Execution Order
1. Unit 1 (AU limit) — independent, trivial
2. Unit 2 (clamping) — independent, foundational
3. Unit 4 (universal variable) — depends on understanding orbital.js
4. Unit 3 (adaptive sub-stepping) — benefits from units 2+4 being in place

## Risk Assessment
- **Unit 1:** Zero risk — just a constant change
- **Unit 2:** Low risk — clamping only activates on already-failing trajectories
- **Unit 3:** Medium risk — must not change output point count or cache will break
- **Unit 4:** Medium risk — new math path, must match existing results for e < 0.95
