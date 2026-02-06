# Course Plotter Accuracy & Performance Analysis

**Date**: 2026-02-06
**Problem**: Course plotter finds courses labeled "INTERCEPT" but ship doesn't actually reach planet SOI during gameplay.

---

## Executive Summary

The course plotter has **one critical bug** and **several compounding accuracy issues** that together explain why computed courses don't achieve actual SOI entry. The critical bug alone causes a 2x error in what the solver considers "close enough."

---

## CRITICAL BUG: Intercept Threshold Mismatch (2x error)

### The Problem

The course solver and the gameplay navigation system use **different definitions** of what constitutes an "intercept":

| System | Threshold | Code Location |
|--------|-----------|---------------|
| **Course Solver** | Full SOI radius | `course-solver.js:279` — `return soi;` |
| **Gameplay/Navigation** | SOI / 2 | `navigation.js:27` — `intercept: soiRadius / 2` |

### Impact by Planet

| Planet | SOI (AU) | Solver thinks "INTERCEPT" at | Game requires | Gap |
|--------|----------|------------------------------|---------------|-----|
| Mercury | 0.00112 | < 0.00112 AU | < 0.00056 AU | 2x |
| Venus | 0.00411 | < 0.00411 AU | < 0.002055 AU | 2x |
| Earth | 0.00620 | < 0.00620 AU | < 0.00310 AU | 2x |
| Mars | 0.00386 | < 0.00386 AU | < 0.00193 AU | 2x |
| Jupiter | 0.3219 | < 0.3219 AU | < 0.16095 AU | 2x |

### Consequence

The solver declares "INTERCEPT" and stops optimizing. The player applies the course expecting to hit the planet. In actual gameplay, the ship passes through the outer half of the SOI zone — classified as "NEAR MISS" by the navigation display, and possibly not triggering SOI entry depending on actual closest approach.

### Fix

`course-solver.js:279`: Change `return soi;` to `return soi / 2;` — or better, `return soi * 0.4;` to give margin for simulation drift (see below).

---

## COMPOUNDING ISSUE #1: Solver Simulation Resolution vs. Reality

### The Problem

The solver's `evaluateCandidate()` simulates trajectories at **much lower resolution** than what actually happens in gameplay:

| Context | Steps/Day | Segment Duration | Code |
|---------|-----------|------------------|------|
| **Course solver** (evaluateCandidate) | ~1 step/day (365 steps / 365 days) | **24 hours** | `course-solver.js:302` |
| **Trajectory predictor** (display) | 12 steps/day | **2 hours** | `config.js:250` |
| **Actual game physics** | ~5,184,000 steps/day at 1x (60 FPS) | **16.7 ms** | per-frame |

The solver uses `maxDays / steps` where steps defaults to `min(maxSteps, max(minSteps, maxDays * stepsPerDay))`. For a 365-day horizon at 12 steps/day, that's `min(6000, max(200, 4380))` = **4380 steps**. But the effective time step is `365 / 4380` ≈ **2 hours per step**.

However at high time warp (100000x+), the actual game physics deltaTime is `100000 / (86400 * 60)` ≈ 0.019 days/frame ≈ **28 minutes per step**. This means:

- The solver's simulation and the actual game physics use **different step sizes** for applying Gauss's variational equations
- Since solar sail thrust direction changes continuously as the ship moves along its orbit, larger steps "hold" the thrust direction constant for longer
- This causes **trajectory divergence** — the solver's prediction of where the ship will be doesn't match where it actually ends up
- The divergence grows over time, especially for multi-month transfers

### Magnitude

For a typical inner planet transfer (Mars, 365 days), the divergence between 1-step/day and 12-steps/day propagation can be **0.001-0.01 AU** — which is on the order of planetary SOI radii. This means even a course the solver computes correctly might miss by ~1 SOI radius in practice.

### Fix Options

1. **Match solver resolution to predictor**: Use `stepsPerDay: 12` in evaluateCandidate (already configured, but maxSteps cap of 6000 limits long horizons)
2. **Use tighter intercept threshold**: Target SOI/3 or SOI/4 to provide margin for drift
3. **Re-evaluate after applying**: Auto-run a high-resolution check after applying course

---

## COMPOUNDING ISSUE #2: Nelder-Mead Early Termination

### The Problem

The Nelder-Mead optimizer **stops as soon as** any vertex achieves distance < interceptThreshold:

```javascript
// course-solver.js:724
if (simplex[0].value < interceptThreshold) {
    break;
}
```

Because the threshold is the full SOI (too loose), the optimizer stops at the first "good enough" solution instead of continuing to minimize. A course that barely skims the SOI boundary gets the same "INTERCEPT" label as one that hits dead center.

### Fix

- Use a much tighter early-termination threshold (e.g., SOI/4)
- Or remove early termination entirely and let Nelder-Mead converge to tolerance

---

## COMPOUNDING ISSUE #3: Crossing-Based Evaluation Approximation

### The Problem

The solver's crossing-aware evaluation (`evaluateCandidate`) measures accuracy by:

1. Finding when trajectory crosses the target's **orbital radius** (semi-major axis)
2. Computing where the **planet** is at that crossing time
3. Measuring the 3D distance between crossing point and planet position

This uses `target.elements.a` (semi-major axis) as the orbital radius, which is only exact for circular orbits. For eccentric orbits:

| Planet | Eccentricity | Perihelion (AU) | Aphelion (AU) | Semi-major axis (AU) |
|--------|-------------|-----------------|---------------|---------------------|
| Mercury | 0.2056 | 0.307 | 0.467 | 0.387 |
| Mars | 0.0934 | 1.381 | 1.666 | 1.524 |

For Mercury, the actual orbital radius varies by ±21% from the semi-major axis. The solver might detect a "crossing" at 0.387 AU when Mercury is actually at 0.307 AU (perihelion), leading to a distance error of up to 0.08 AU in the crossing calculation.

### Fix

- For eccentric targets, compute **multiple crossings** at different radii (perihelion and aphelion)
- Or use actual distance-to-body tracking instead of radius-crossing detection
- The current approach works well for near-circular orbits (Venus, Earth, Jupiter) but poorly for Mercury and Mars

---

## COMPOUNDING ISSUE #4: Phase Angle Filter Too Aggressive

### The Problem

`course-solver.js:125`: `maxPhaseAngle: 0.79` (~45 degrees)

Crossings where the angular separation between the ship's crossing point and the planet exceeds 45 degrees are **discarded entirely** (line 417-419). This means the solver ignores timing information from crossings that are "too far off," falling back to the less-accurate global minimum distance.

For long transfers where the phase angle is large, the solver may discard all crossing data and fall back to a brute-force closest-approach calculation that doesn't account for where the planet is relative to the crossing.

### Fix

- Instead of discarding, penalize high phase angle crossings (weighted score)
- Or increase the threshold to 90+ degrees (any crossing is better than no crossing data)

---

## COMPOUNDING ISSUE #5: predictClosestApproach vs. evaluateCandidate Discrepancy

### The Problem

After the course is applied, the NAV panel shows intercept predictions from `predictClosestApproach()` in `navigation.js`. This function:

- Uses **500 steps over 365 days** (~0.73 day/step) — different from solver's 4380 steps
- Uses the **actual ship's current orbital elements** (which have drifted since course was applied)
- Applies the **current sail settings** (which are the applied course, but small floating-point differences exist)

The solver predicted the outcome based on the ship's state at computation time. By the time the player applies the course (even immediately), the ship has moved, and the prediction was for a slightly different starting position.

### Fix

- Run predictClosestApproach at the same resolution as the solver after applying course
- Or re-solve at high resolution after applying to verify the result

---

## MINOR ISSUE: No Post-Solve Verification

After the solver finds a course and the player applies it, there's no automatic verification step that runs the trajectory predictor (high-resolution) to confirm the solution actually works. The solver's low-resolution simulation diverges from reality, and the player only discovers this later when the "INTERCEPT" label changes to "NEAR MISS" in the nav panel.

### Fix

- After applying course, immediately run a high-res trajectory check
- If it shows the course won't actually intercept, warn the user or auto-refine

---

## PERFORMANCE NOTES

The solver is already fast (~3-5 seconds, ~500 evaluations). The main performance concern is that **increasing step resolution** in evaluateCandidate would slow each evaluation. Current: ~4380 steps/eval. At 12 steps/day for 1460 days (max horizon): 17,520 steps. This would ~4x the computation time.

**Mitigation**: Use adaptive resolution — high resolution only for final verification, not the full search. The reconnaissance (91 probes) and Nelder-Mead (80 iterations) can use coarser steps, then the final best candidate gets re-evaluated at full resolution.

---

## RECOMMENDED FIX PRIORITY

| Priority | Fix | Impact | Effort |
|----------|-----|--------|--------|
| **P0** | Fix intercept threshold: `course-solver.js:279` — use `soi / 2` | Eliminates 2x error | 1 line |
| **P0** | Tighten Nelder-Mead early termination to `soi / 4` | Forces optimizer to find better solutions | 1 line |
| **P1** | Add post-solve high-resolution verification | Catches simulation drift before player commits | ~30 lines |
| **P1** | Use adaptive step resolution (coarse search, fine verify) | Reduces trajectory divergence | ~20 lines |
| **P2** | Handle eccentric orbits in crossing detection | Fixes Mercury/Mars targeting | ~40 lines |
| **P2** | Soften phase angle filter (penalty instead of discard) | Better handling of long transfers | ~15 lines |
| **P3** | Auto-refine after applying course | Best possible accuracy | ~50 lines |
