# Mars Intercept Accuracy - Expert Review

**Date:** 2026-02-07
**Phase:** Review (Phase 3) - 5 perspectives
**Constraint:** Ghost must stay anchored to orbital path. Closest-approach-only already tried and rejected (4 AU ghosts in empty space).

---

## Revised Understanding

The original investigation identified three root causes. After expert review, the picture has sharpened significantly, with one cause promoted to dominant and a new design approach emerging.

### What Changed From the Original Investigation

1. **The "wrong radius" problem is worse than initially stated.** It's not just "semi-major axis vs actual distance" -- it's that the timing at the semi-major axis can be off by 15-70 days depending on Mars's orbital phase.
2. **The trajectory predictor step resolution is actually fine** for intersection detection. Main.js uses 12 steps/day (2-hour segments) for the intersection trajectory, not the default 200 steps. The Solar Sailing expert's concern about 24-hour steps was for the rendering trajectory, not the detection trajectory.
3. **The thrust integration error is real but secondary.** ~3-10 days over a 200-day transfer from Euler integration divergence. Significant but not the dominant error.
4. **A hybrid approach emerged** that satisfies both constraints: ghost stays on orbit AND timing is accurate.

---

## Expert Consensus: The Dominant Problem

All five experts agree: **checking only the semi-major axis radius is the #1 error source.**

Mars ranges from 1.381 AU to 1.666 AU. The detector always checks 1.524 AU. When Mars is near perihelion (1.381 AU), your ship crosses 1.524 AU potentially weeks after passing through Mars's actual vicinity. The ghost shows Mars at its position at 1.524-AU-crossing time, which can be 0.96 AU (144 million km) from where the real encounter happens.

### But The Previous Fix (Multi-Radius) Failed

The Feb 6 attempt to check perihelion/a/aphelion was the right physical intuition but created the snapping problem:
- Three crossings per transit, all within a 208-day merge window
- Winner-takes-all deduplication creates a knife-edge decision boundary
- Tiny sail changes flip the winner, jumping the ghost by 96+ days

### And Pure Closest-Approach Failed

Closest-approach produces ghosts at 4 AU in empty space -- places the ship will never visit.

---

## The Recommended Solution: Hybrid Anchor-Refine

**Architecture expert proposed this; Physics, Solar Sailing, and Functionality experts endorsed it.**

### How It Works

**Step 1 - Anchor Detection (unchanged):** Use semi-major axis to detect that the trajectory crosses the target's orbital zone. This gives a stable, non-snapping detection point on the orbital path.

**Step 2 - Timing Refinement (new):** After finding the semi-major axis crossing at time T_nominal:
1. Look up Mars's actual heliocentric distance at T_nominal: `r_mars = getPosition(mars.elements, T_nominal)` → compute `||r_mars||`
2. Search the trajectory segments *near* T_nominal for a crossing at `r_mars`
3. If found, use that refined time T_refined instead
4. Place the ghost at `getPosition(mars.elements, T_refined)`

### Why This Works

- **One detection radius** (semi-major axis) → no deduplication snapping
- **One refinement step** per crossing → no chasing problem
- **Ghost stays on the orbital path** (placed at planet position, which is on the orbit)
- **Timing is accurate** because it uses Mars's actual distance, not the average

### Why It Doesn't Have the Old Problems

| Old Approach | Problem | Hybrid Avoids It Because |
|--------------|---------|--------------------------|
| Semi-major only | Wrong timing for eccentric orbits | Refinement step corrects the timing |
| Multi-radius | Ghost snapping from winner-switching | Only one detection radius, no deduplication needed |
| Closest-approach | 4 AU ghosts in empty space | Anchored to radius crossing |
| Instantaneous radius | Chasing problem, micro-crossings, 48K getPosition calls | Only refines already-detected crossings (few per body) |

---

## All Findings by Expert

### Physics/Realism

| ID | Severity | Finding |
|----|----------|---------|
| P1 | Critical | Semi-major axis check is wrong for eccentric orbits. Mars ghost timing off by up to 71 days, ghost position off by up to 0.96 AU |
| P2 | Important | Trajectory predictor Euler integration diverges ~3 days over 200-day transfer |
| P3 | Important | Multi-radius was right physics, wrong math implementation. Hybrid refinement is the correct approach |

### Solar Sailing Expert

| ID | Severity | Finding |
|----|----------|---------|
| SS1 | Critical | Thrust direction error compounds nonlinearly for spirals. RTN frame rotates ~1 deg/day but predictor holds thrust constant per step. Produces 2-5 days timing error |
| SS2 | High | The radius-crossing anchor IS correct for solar sails (spirals approach by expanding radius). But must use the right radius |
| SS3 | Medium-High | Thrust direction error could be halved by using midpoint (RK2) integration instead of Euler. One extra `calculateSailThrust` call per step |
| SS4 | Medium | No adaptive stepping -- dynamics are most nonlinear near Sun where integration errors accumulate fastest |
| SS5 | Advisory | Iterative radius refinement is the solar-sail-correct approach: refine using planet's actual distance at predicted crossing time |

### Architecture

| ID | Severity | Finding |
|----|----------|---------|
| A1 | High | evaluate-trajectory.js already solves eccentric orbits correctly (3 radii, actual planet distance, angular separation). Logic should be shared |
| A2 | High | The multi-radius snapping is an architecture problem (bad deduplication), not fundamental. evaluate-trajectory.js checks 3 radii without snapping because it doesn't use temporal merge windows |
| A3 | Medium | Quadratic crossing solver duplicated between intersectionDetector.js and evaluate-trajectory.js. Should be shared utility |
| A4 | Medium | The hybrid anchor-refine approach requires changes only in intersectionDetector.js. Renderer stays unchanged (still reads bodyPosition + time from cache) |
| A5 | Info | Destination-only filter in renderer is a good design choice -- limits refinement cost to one body |

### Functionality

| ID | Severity | Finding |
|----|----------|---------|
| F1 | Critical | No early/late indicator. Ghost shows where Mars IS at crossing time, but not whether Mars is ahead or behind the crossing point. Player can't tell if they're early or late |
| F2 | High | Time label "+221d 4h" is ship-centric (when ship arrives). Missing planet-centric info (when Mars is at the ghost position relative to when ship arrives) |
| F3 | Medium | "CLOSE" pulsing uses time-to-crossing (< 24h), not SOI-based distance. Should pulse when `distance < SOI_radius` |
| F4 | Medium | evaluate-trajectory.js computes `angularSeparationDeg` but this never reaches the renderer. The solver knows intercept quality; the display doesn't |
| F5 | Medium | No tests for Mars-like eccentricity timing or ghost usefulness. Tests verify crossing detection mechanics but not navigation accuracy |

### Failure Modes

| ID | Severity | Finding |
|----|----------|---------|
| FM1 | Critical | Instantaneous orbital radius (pure approach) causes "chasing problem" - ship can never catch a receding target radius. Produces dozens of micro-crossings. NOT recommended |
| FM2 | High | The merge window formula `max(40, e*a*365.25*4)` is broken for Mercury: 116 days exceeds Mercury's 88-day orbital period |
| FM3 | High | evaluate-trajectory.js still uses multi-radius for eccentric orbits while intersectionDetector.js uses semi-major-axis-only. Computed courses will show mismatched ghosts |
| FM4 | Medium | Over 200 days: predicted position diverges 0.01-0.5 AU from actual ship trajectory depending on thrust config |
| FM5 | Medium | Near-sun passes (< 0.3 AU) amplify trajectory divergence due to high angular velocity in 2-hour steps |
| FM6 | Low-Medium | Hysteresis (temporal coherence) delays snaps but doesn't eliminate them. Adds frame-to-frame state to a currently stateless module |

---

## Prioritized Implementation Plan

### Phase 1: Hybrid Anchor-Refine (Fixes the core timing problem)
**Target:** intersectionDetector.js
**Approach:** After detecting semi-major axis crossing, refine timing using Mars's actual radius at the crossing time. One iteration. No deduplication changes needed.
**Expected improvement:** Eliminates the 15-70 day timing error for eccentric orbits.
**Risk:** Low. Single detection radius means no snapping. One refinement step means no chasing. Renderer unchanged.

### Phase 2: Angular Separation / Early-Late Indicator (Fixes the information gap)
**Target:** intersectionDetector.js (compute), renderer.js (display)
**Approach:** Compute angular separation between ship crossing point and planet position (like evaluate-trajectory.js already does). Pass to renderer. Show as "EARLY 15d" or "LATE 8d" on the ghost label.
**Expected improvement:** Player can immediately tell if they need to speed up or slow down.

### Phase 3: Integration Accuracy (Fixes the trajectory divergence)
**Target:** trajectory-predictor.js
**Approach:** Replace Euler with midpoint (RK2) integration. One extra `calculateSailThrust` call per step.
**Expected improvement:** Reduces 3-10 day trajectory divergence to under 1 day.
**Risk:** Low. Same step count, minimal performance impact.

### Phase 4: Solver-Ghost Consistency (Fixes the mismatch)
**Target:** intersectionDetector.js and evaluate-trajectory.js
**Approach:** Extract shared crossing utilities. Ensure both systems use consistent radius logic.
**Expected improvement:** Computed courses match displayed ghosts.

---

## Confidence Rating: 7.5/10

The hybrid approach is well-supported by all five experts and avoids the failure modes of previously-tried approaches. The main risk is that one refinement iteration may not fully converge for very eccentric orbits (Mercury), but for Mars (e=0.094) one iteration should reduce the timing error from ~40 days to ~2-3 days.

---

## Verdict

**Approved with conditions.**

Phase 1 (hybrid anchor-refine) should proceed immediately -- it has the highest impact-to-risk ratio. Phase 2 (early/late indicator) is the critical UX improvement that directly addresses the user's reported experience. Phases 3-4 are important but secondary.
