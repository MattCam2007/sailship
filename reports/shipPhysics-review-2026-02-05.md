# shipPhysics.js Review

**Date:** 2026-02-05
**Scope:** `src/js/core/shipPhysics.js` — post-commit cleanup after SOI entry false-positive fix
**Reviewer:** Four-perspective automated review (physicist, architect, functional-tester, failure-analyst)

---

## 0. Critical Fix Applied

**SyntaxError: Identifier 'soiRadius' has already been declared (at shipPhysics.js:845)**

**Root Cause:** Commit `a2e5dd5` ("Fix SOI entry false positives and console spam after Venus flyby") added a new safety check at the top of `handleSOIEntry()` that declared `const soiRadius = getSOIRadius(planetName)` at line 804. The pre-existing identical declaration at line 845 was not removed, creating a duplicate `const` in the same block scope.

**Fix:** Removed the duplicate declaration at line 845. The `soiRadius` variable declared at line 804 is already in scope for the entire function body.

**Additional cleanup:** Removed dead variables `lastFlybyLogTime`, `lastFlybyBody`, and `FLYBY_LOG_COOLDOWN` — declared but never referenced anywhere in the codebase.

---

## 1. Physics/Realism

### Findings
- Orbital energy calculation at line 849 (`v²/2 - μ/r`) is correct — specific orbital energy using vis-viva
- The 1731.46 factor for AU/day → km/s conversion appears frequently. Correct value: 1 AU/day = 149,597,870.7 km / 86400 s ≈ 1731.457 km/s. The truncation to 1731.46 introduces negligible error (~0.002 km/s at 1 AU/day)
- SOI entry safety check uses 1.05× SOI radius tolerance (line 810) — reasonable for catching numerical overshoot from trajectory intersection detection
- SOI exit hysteresis uses 1.01× (in soi.js:136) — standard hysteresis approach
- Collision prevention correctly distinguishes hyperbolic vs. elliptic orbits: raises periapsis for hyperbolic, circularizes for elliptic
- Extreme eccentricity threshold (e > 50) triggers linear interpolation — physically sound for near-straight-line flybys where Kepler equation becomes ill-conditioned
- Sail thrust correctly computed in heliocentric frame even when ship is in planetocentric SOI (lines 324-349)

### Concerns

| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| P1 | Nice-to-have | Magic number 1731.46 (AU/day to km/s) repeated 15+ times throughout the file without a named constant | Define `const AU_PER_DAY_TO_KM_PER_S = 149597870.7 / 86400` in config.js |
| P2 | Nice-to-have | `checkAndPreventCollision` auto-circularizes at planet radius × 1.1 — doesn't account for atmosphere (Venus surface ≈ 6052km, atmosphere extends to ~6250km) | Consider adding atmosphere thickness to BODY_DISPLAY for gas giants and Venus |

### Domain Confidence: 8/10

### Key Validation Points
- Vis-viva equation correctly applied for energy calculation
- Gauss variational equations delegated to orbital-maneuvers.js (not duplicated)
- SOI patched-conic approach correctly separates heliocentric/planetocentric frames
- Hyperbolic orbit handling preserves sign of semi-major axis

---

## 2. Functionality

### Findings
- `handleSOIEntry` correctly validates ship is within SOI boundary before proceeding (the new safety check that caused the duplicate variable bug)
- SOI transition cooldown correctly tracks per-body to prevent rapid cycling between different planets
- Transit state is properly cleared on SOI entry at destination planet (line 882-888)
- `updateCachedStateInSOI` correctly converts planetocentric position to heliocentric for rendering
- `checkSOIEntryTrajectory` uses line-sphere intersection for fast-moving ships — correctly handles the case where ship travels through SOI in a single frame
- Extreme flyby state vector stored for linear interpolation when e > 50, cleaned up on SOI exit (line 1028-1030)

### Concerns

| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| F1 | Important | `handleSOIEntry` computes `relPosMag` (line 839) and then `r` (line 847) — both are `sqrt(pos.x² + pos.y² + pos.z²)`, identical computations on the same data | Remove `relPosMag`, reuse `r` for the debug log |
| F2 | Important | `handleSOIEntry` computes `relVelMag` (line 838) and then `relVelKmS` (line 857) — both compute the same velocity magnitude in km/s from the same `vel` object | Remove duplicate, reuse `relVelMag` |
| F3 | Nice-to-have | `checkSOIEntryTrajectory` returns `entryVel: velocity` (the original velocity), not the velocity at the entry point. For high-curvature trajectories, this is an approximation | Acceptable for current linear trajectory model |

### Domain Confidence: 8/10

### Coverage Analysis
- Core SOI entry/exit paths analyzed: both work correctly
- Cooldown mechanism prevents rapid cycling: verified
- Extreme eccentricity fallback: verified
- No automated test suite exists for shipPhysics.js — all testing is manual/browser

---

## 3. Architecture

### Findings
- File correctly lives in `core/` — physics logic with no rendering dependencies
- Imports follow dependency rules: `core/` imports from `lib/`, `data/`, and `config.js`
- Named exports used throughout (no default exports)
- Module exposes diagnostic functions via `window` for console debugging — appropriate for development
- `soiDiag` state object is module-scoped, not exported directly — accessed via `getSOIDiagnostics()` getter

### Concerns

| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| A1 | Important | Excessive unconditional `console.log` in `handleSOIEntry` (17 log calls) and `handleSOIExit` (14 log calls). These fire every SOI transition even in production | Gate behind a debug flag like the existing `soiDebugEnabled` or `debugLoggingEnabled` |
| A2 | Important | The file has grown to ~1670 lines with 6 distinct concerns: visual lerping, main physics loop, trajectory detection, SOI diagnostics, SOI transitions, and debug utilities | Consider extracting SOI diagnostic logging to a separate module |
| A3 | Nice-to-have | `console.log('[SHIP_PHYSICS] Module loaded')` at line 1146 — module load announcement is a development artifact | Remove or gate behind debug flag |

### Domain Confidence: 7/10

### Pattern Analysis
- Game loop pattern: Followed — `updateShipPhysics` is called per-frame
- Dependency flow: Clean — no circular imports detected
- Module structure: Functional but growing large; single concept per file principle strained

---

## 4. Failure Modes

### Findings
- NaN validation on SOI exit (lines 1012-1019) prevents corrupt orbital elements from propagating — good defensive check
- SOI entry safety check (lines 802-818) now prevents false positives from trajectory intersection edge cases
- Cooldown mechanism prevents infinite SOI enter/exit loops at boundaries
- Extreme flyby state provides stability for near-singular Keplerian solutions

### Concerns

| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| FM1 | Important | `checkSOIEntryTrajectory` false positive rejection uses `soiRadius * 1.02` (line 550) while `handleSOIEntry` uses `soiRadius * 1.05` (line 810). A trajectory detection could pass at 1.02× but then be rejected by handleSOIEntry at 1.05× — the ship would skip physics for that frame (line 305) due to the "entry blocked by cooldown" path, and this would repeat | Align thresholds: both should use 1.05× or handleSOIEntry should be ≤ the trajectory check |
| FM2 | Important | If `getBodyByName` returns a body without `.x`/`.y`/`.z` cached positions, `updateCachedStateInSOI` would produce NaN positions (line 1100-1102). No null check on `parent.x` | Add position validity check before using cached planet position |
| FM3 | Nice-to-have | The 17 unconditional `console.log` calls in `handleSOIEntry` could cause performance degradation if SOI transitions happen at high time warp (many transitions per second) | Gate behind debug flag |

### Domain Confidence: 8/10

### Risk Matrix
| Risk Category | Level | Key Concerns |
|---------------|-------|--------------|
| Numerical Stability | Low | Extreme eccentricity handled, NaN checks in place |
| Performance | Medium | Unconditional debug logging in hot paths |
| Player Experience | Low | SOI transitions work correctly after duplicate var fix |

---

## 5. Summary

### Confidence Rating: 7/10

### Critical Issues (Must Fix)
1. **FIXED:** Duplicate `const soiRadius` declaration causing SyntaxError — module could not load

### Important Issues (Should Fix)
1. **F1/F2:** Duplicate distance/velocity computations in `handleSOIEntry` (redundant work)
2. **A1:** 31+ unconditional `console.log/warn` calls across SOI entry/exit functions — console spam during normal gameplay
3. **FM1:** Mismatched SOI boundary thresholds between detection (1.02×) and validation (1.05×) could cause edge-case frame skips

### Recommendations
1. Gate SOI transition logging behind `soiDebugEnabled` flag (already exists in soi.js)
2. Eliminate duplicate computations in `handleSOIEntry`
3. Align false-positive rejection thresholds
4. Consider extracting SOI diagnostics into a separate module as the file grows

### Verdict
- [x] Approved with conditions
- Fix applied makes the module loadable. Console spam and duplicate computations are non-blocking but should be addressed.
