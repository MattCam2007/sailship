# Ghost Planet Encounter Markers - Failure Modes Review

**Date:** 2026-02-07
**Reviewer:** Failure Analyst
**Scope:** intersectionDetector.js, evaluate-trajectory.js, trajectory-predictor.js, config.js
**Status:** Current code uses semi-major-axis-only detection (Option A fix applied)

---

## Executive Summary

The ghost planet system has a fundamental tension: semi-major-axis-only detection is stable but inaccurate for eccentric orbits, while multi-radius detection is accurate but unstable due to discrete winner-selection. This review identifies 14 failure modes across 5 focus areas, with 3 rated CRITICAL. The core problem is that **deduplication converts a continuous multi-valued function into a discontinuous single-valued one**, and no amount of merge-window tuning can fix that structural issue.

---

## 1. Why Multi-Radius Deduplication Failed

### 1.1 The 208-Day Merge Window is Both Too Large and Too Small

**Severity: CRITICAL**

The formula `Math.max(40, e * a * 365.25 * 4)` for Mars gives 208 days. This is analyzed against two failure scenarios:

**Too large -- merges legitimate separate orbit transits:**
A ship on an eccentric orbit can cross Mars's radial band (1.38-1.67 AU) twice in one prediction window: once outbound, once inbound (e.g., on a return leg). Mars's orbital period is 687 days. If the ship spirals out to ~2 AU and then curves back inward, the outbound crossing at day ~340 and the inbound crossing at day ~540 are only 200 days apart -- within the 208-day window. The deduplication would merge these into a single ghost, destroying information about the return encounter.

**Too small to serve its purpose -- can't prevent snapping:**
The 208-day window was designed to merge the perihelion/a/aphelion crossings of a single transit into one ghost. But the time spread between those crossings depends entirely on the ship's radial velocity, not on Mars's orbital parameters. A fast radial transit might cross all three radii in 30 days; a slow spiral might take 150 days. The formula is a heuristic estimate that cannot reliably distinguish "same transit, different radii" from "different transits, same radius."

**Concrete numeric analysis:**
- Mars radial band width: 2 * 0.0934 * 1.524 = 0.285 AU
- Ship radial velocity through band: 0.2-0.5 AU/year typical for solar sail
- At 0.2 AU/yr: band crossing takes ~520 days (3 crossings spread over ~520 days)
- At 0.5 AU/yr: band crossing takes ~208 days (3 crossings spread over ~208 days)
- The formula targets the 0.5 AU/yr case -- any slower and crossings fall outside the window, causing them to be treated as separate encounters, where they will each be stable individually (no snapping, but now showing 3 ghosts).

**Finding:** The merge window is calibrated for one specific radial velocity. Slower transits break the deduplication (crossings split into separate groups), faster transits keep them merged. This means the number of visible ghosts changes with trajectory geometry, which is itself a form of visual instability.

### 1.2 Winner-Takes-All Creates a Hard Decision Boundary

**Severity: CRITICAL**

The deduplication selects the crossing with `c.distance < best.distance`. When two crossings within a merge group have similar ship-to-planet distances, tiny trajectory changes flip the winner. This is a classic discrete-selection instability.

**Quantifying the boundary sensitivity:**
From the investigation report, at pitch -31.2, the aphelion crossing wins at 0.20 AU. At pitch -31.3, the perihelion crossing wins at 0.38 AU. The aphelion crossing either disappeared or degraded to >0.38 AU. The crossings are 96 days apart in time, meaning Mars moves ~52 degrees around its orbit between them.

**Root cause chain:**
1. Small pitch change (0.1 deg) shifts trajectory by ~0.01 AU at the 400-day mark
2. This 0.01 AU shift either (a) moves the trajectory below the 1.67 AU aphelion threshold so the crossing vanishes, or (b) changes the crossing geometry enough to degrade the distance metric
3. The winner flips from the aphelion crossing (day 437) to the perihelion crossing (day 337)
4. Planet position at day 337 vs day 437 differs by ~52 degrees = massive visual snap

**This failure mode is structural, not parametric.** No merge window value fixes it. Even a perfect merge window that always groups the right crossings together will still have the winner-flipping problem whenever two crossings within a group have similar distances.

### 1.3 The Merge Window Compares Against Group Start, Not Neighbors

**Severity: MODERATE**

The grouping logic at line 419 compares each crossing against `group[0].time` (the first crossing in the group), not the previous crossing:

```javascript
if (crossings[i].time - group[0].time < mergeWindow) {
    group.push(crossings[i]);
}
```

This means a chain of crossings at days 100, 200, 300 with a 210-day window would group the first two (100, 200) together, but crossing at day 300 starts a new group (300 - 100 = 200 < 210, wait -- actually 300 - 100 = 200 < 210, so all three would be grouped). However, if the window were 190, crossing at day 100 and 200 group together, but 300 - 100 = 200 > 190, so 300 starts a new group. But 300 - 200 = 100, which would logically be "close" to crossing 200.

This is a minor issue because the current code only generates 1 crossing per radius per transit (not a chain), but it would become relevant if the segment-skip optimization at low zoom causes the same crossing to be detected in two non-adjacent segments.

---

## 2. The Snapping Failure Mode in Detail

### 2.1 Mechanism: Crossing Appearance/Disappearance at Threshold Radii

**Severity: CRITICAL**

When checking 3 radii (perihelion/a/aphelion), a small trajectory change can cause a crossing to appear or disappear at the outermost or innermost radius. This is because the trajectory's maximum/minimum heliocentric radius may hover right at the perihelion or aphelion threshold.

**Example scenario (Mars, aphelion = 1.666 AU):**
- Pitch -31.2: Trajectory reaches max radius of 1.670 AU -- crosses aphelion radius, creating a crossing at day 437
- Pitch -31.3: Trajectory reaches max radius of 1.664 AU -- does NOT cross aphelion radius, no crossing generated

The semi-major axis crossing (1.524 AU) is always present because the trajectory always passes through 1.524 AU on the way out. The perihelion crossing (1.381 AU) is also always present. But the aphelion crossing is conditional on the trajectory actually reaching 1.666 AU.

When the aphelion crossing exists and has the best distance, it wins. When it vanishes, the winner jumps to the next-best crossing (perihelion or semi-major), which is at a very different time.

### 2.2 Can Hysteresis Fix This?

**Severity: N/A (analysis of proposed fix)**

Hysteresis would mean: "once a crossing is established, keep showing it even if it technically disappears, until it's been gone for N frames." This addresses crossing appearance/disappearance but NOT the winner-flipping problem.

**Failure modes of hysteresis:**
1. **Stale ghost:** If hysteresis keeps showing a ghost at the old position for 10 frames while the trajectory has clearly moved past that radius, the ghost appears "stuck" and then suddenly jumps when hysteresis expires. This trades one type of snap for a delayed snap.
2. **State management complexity:** Requires tracking per-body, per-crossing history across frames. The current intersection detector is stateless (called fresh each frame from trajectory cache). Adding frame-to-frame state breaks this clean architecture.
3. **Interaction with zoom-adaptive precision:** The zoom-adaptive segment skip (lines 662-667) changes which segments are checked at different zoom levels. At low zoom, every 4th segment is checked. Zooming in/out changes which crossings are detected, triggering hysteresis transitions that fight the precision change.

**Assessment:** Hysteresis partially helps but introduces new failure modes. It delays snaps rather than eliminating them.

### 2.3 Can Smoothing (Option E from Investigation) Fix This?

Weighted-average blending between crossings would smooth the transition but produces ghost positions that don't correspond to any real crossing time. A ghost at a blended position shows the planet where it won't actually be when the ship arrives at any real crossing. This is physically misleading and defeats the purpose of encounter markers for navigation planning.

---

## 3. Instantaneous Orbital Radius Approach -- Failure Mode Analysis

### 3.1 Concept

Instead of checking fixed radii (perihelion/a/aphelion), check: "does the trajectory cross the distance that Mars currently IS from the Sun at each point in time?" This means the target radius becomes a function of time: `R(t) = |r_Mars(t)|`.

### 3.2 Frame-to-Frame Instability from Moving Target

**Severity: HIGH**

Mars's heliocentric distance changes over its 687-day orbit:
- Near perihelion: dr/dt ~ 0.001 AU/day (Mars moving toward/away from Sun)
- Peak radial velocity: ~0.003 AU/day

The trajectory predictor runs at 12 steps/day (2-hour segments). Each segment checks if the trajectory crosses a target radius. But between frames, Mars has moved, changing the target radius.

**Worst case scenario:**
At simulation time t, Mars is at r = 1.500 AU, moving outward at 0.002 AU/day. The trajectory segment spans 2 hours (0.083 days). Ship is at r = 1.499 AU going outward slowly.

- Frame N: Target radius is 1.500 AU. Ship at 1.499 -> 1.501. Crossing detected at t.
- Next simulation step: Target radius is now 1.500166 AU (Mars moved 0.002 * 0.083 days). Ship at 1.501 -> 1.503. Crossing detected again because we re-crossed the new slightly higher radius.

This produces numerical duplicate crossings that the deduplication would need to handle. But more critically, when the ship and Mars have similar radial velocities (both spiraling outward), the "crossing" can appear and disappear between frames as the relative radial velocity oscillates near zero.

### 3.3 Computational Cost

**Severity: MODERATE**

Currently, the target radius is a constant per body, so the crossing check is a simple comparison: `(r1 < a && r2 > a)`. With instantaneous radius, we need `getPosition(Mars, t)` at each trajectory step to get Mars's current radius. This is already done in `evaluateCandidate()` (evaluate-trajectory.js, line 282-283) but NOT in the intersection detector.

Adding `getPosition()` calls for every body at every trajectory step would change the intersection detector from O(segments * bodies * constant) to O(segments * bodies * getPosition_cost). With 6000 segments and 8 planets, that's 48,000 `getPosition()` calls per frame, each involving Kepler equation solving. This could easily exceed the 16ms frame budget.

### 3.4 The "Chasing" Problem

**Severity: HIGH**

When the ship and target planet have similar heliocentric distances and are both moving outward, the instantaneous radius keeps receding ahead of the ship. The trajectory may never "cross" Mars's radius because Mars is always a bit further out. Yet the ship might pass very close to Mars in physical space.

This is the inverse of the problem the approach tries to solve: instead of checking a fixed radius that Mars isn't at, we check a moving radius that the ship can't catch. Neither approach captures the actual encounter geometry.

### 3.5 Multi-Crossing Fragmentation

**Severity: MODERATE**

For a trajectory that spirals outward through Mars's radial band over 100+ days, the instantaneous radius approach could produce dozens of micro-crossings as the ship and Mars radii weave around each other. Each would be a valid "crossing" but would represent noise rather than navigation-relevant events. The deduplication window would need to be very aggressive to merge these, re-introducing the snapping problem.

**Assessment:** The instantaneous radius approach trades one set of problems for a worse set. It is NOT recommended as a fix.

---

## 4. Trajectory Predictor Divergence

### 4.1 Discretization Error Accumulation

**Severity: HIGH**

The trajectory predictor applies thrust as discrete impulses at each step: `v_new = v + a * dt`. For the default 12 steps/day configuration, each step is 2 hours. During those 2 hours, the thrust direction is held constant even though the ship has moved (changing the sun angle, orbital velocity direction, etc.).

**Error sources per step:**
1. **Thrust direction staleness:** Sail thrust direction depends on the RTN frame (radial, transverse, normal), which rotates as the ship moves. Over 2 hours at 1 AU, the ship moves ~1.7 degrees in true anomaly. The thrust direction error from holding it constant is ~1.7 degrees * sin(sail_angle).
2. **Inverse-square pressure change:** At 1 AU, moving 0.003 AU radially changes pressure by ~0.6%. Over 200 days (2400 steps), these errors compound.
3. **Gauss equation linearization:** The `applyThrust()` function converts position+velocity to elements, applies delta-v, and converts back. Each conversion introduces floating-point rounding at ~1e-15 relative precision. Over 2400 conversions, this accumulates to ~1e-12 AU, which is negligible.

**Quantitative worst case (200 days):**
- Steps: 2400 (at 12/day)
- Per-step angular error: ~1.7 degrees * sin(35 deg) ~ 1 degree
- Accumulated position error after 200 days: Difficult to bound analytically, but empirically observed as 0.01-0.05 AU for typical solar sail trajectories. This comes primarily from the thrust direction being slightly wrong at each step.

### 4.2 High Thrust / Aggressive Sail Angle Scenarios

**Severity: HIGH**

With 20 sails at full deployment, the characteristic acceleration is ~5.7 mm/s^2 (~5.7x baseline). At 0.5 AU from the Sun, this quadruples to ~23 mm/s^2. With an aggressive sail angle near 0 degrees (face-on to sun), the thrust is purely radial and large.

**Failure cascade:**
1. High radial thrust rapidly changes semi-major axis and eccentricity
2. The orbit shape changes significantly between steps
3. The RTN frame rotates rapidly, making the fixed-direction-per-step assumption worse
4. At 0.5 AU, the orbital period is ~129 days, so 2-hour steps are ~0.65 degrees of true anomaly -- still acceptable but the higher thrust makes each step's error matter more.

**Near-sun passes (< 0.3 AU):**
The inverse-square pressure law means thrust at 0.3 AU is ~11x thrust at 1 AU. The angular velocity is also much higher (Kepler's 2nd law: v ~ 1/sqrt(r)). This combination means:
- Higher thrust per step (larger delta-v impulse)
- Faster orbital motion (more angular change per step)
- Stronger coupling between thrust direction and orbital phase

The trajectory predictor has a MIN_HELIOCENTRIC_RADIUS of 0.01 AU (line 29) and truncates at 2x that (0.02 AU, line 277). But dangerous divergence begins well before that, around 0.1-0.2 AU, where the trajectory predictor's 2-hour steps become too coarse for the high angular velocity.

**Estimated divergence at 0.2 AU over 200 days:**
- Orbital period at 0.2 AU: ~33 days
- True anomaly per 2-hour step: ~2.2 degrees
- Thrust direction error per step: ~2.2 * sin(35) ~ 1.3 degrees
- With high-thrust multi-sail: position error could reach 0.1-0.5 AU over 200 days

### 4.3 Step Count Cap Creates Resolution Degradation

**Severity: MODERATE**

The INTERSECTION_CONFIG.maxSteps is 6000, and stepsPerDay is 12. For trajectories up to 500 days, this gives full 12 steps/day resolution. Beyond that:
- 730 days (2 years): 6000/730 = 8.2 steps/day = ~2.9 hour segments
- 1095 days (3 years): 6000/1095 = 5.5 steps/day = ~4.4 hour segments
- 1825 days (5 years): 6000/1825 = 3.3 steps/day = ~7.3 hour segments

For outer planet transfers at 5 years, the 7.3-hour segments mean each trajectory step spans ~3.5 degrees at 1 AU, ~1.8 degrees at 2 AU, and ~0.7 degrees at 5 AU. The ship-to-Sun distance doesn't change much per step at Jupiter's distance, so thrust errors are smaller. But the coarse segments mean crossing detection has lower time resolution.

**Impact on crossing detection:**
The bisection refinement (12 iterations) narrows a 7.3-hour segment to ~6.4 seconds, which is excellent. The primary risk is not precision but MISSED CROSSINGS: if the trajectory crosses a radius and crosses back within a single 7.3-hour segment, neither sub-crossing is detected. This is unlikely for slow outer-planet transfers but possible for eccentric transfer orbits with high radial velocity.

### 4.4 Trajectory vs. Actual Ship Physics Divergence

**Severity: HIGH**

The trajectory predictor and the actual game loop (`shipPhysics.js`) both use `applyThrust()` but with different time steps. The game loop applies thrust once per frame (~16ms at 60fps), while the trajectory predictor uses 2-hour steps.

At game speed 100000x, the game loop advances 100000/86400/60 ~ 0.0193 days per frame ~ 28 minutes. The trajectory predictor uses 0.083 days per step ~ 2 hours. These different step sizes mean the thrust is applied at different cadences, causing the predicted trajectory to diverge from the actual trajectory over time.

**Over 200 days at 100000x game speed:**
The game loop processes ~10,368 frames to cover 200 days (200 / 0.0193). The trajectory predictor uses 2400 steps. The game loop's finer time resolution means it captures thrust direction changes more accurately, so the predicted trajectory will DIVERGE from the actual ship trajectory. The ship will arrive at a crossing point earlier or later than predicted.

**This is a systemic limitation.** The ghost planet shows where you WOULD be if you maintained current thrust, computed with 2-hour resolution. The actual ship evolves with finer resolution. The ghost becomes progressively less accurate as prediction time increases. For 200+ day encounters, the ghost position should be treated as approximate guidance, not a precise intercept marker.

---

## 5. Edge Cases by Planet

### 5.1 Venus (e = 0.007, a = 0.723 AU)

**Current behavior:** Semi-major-axis-only check at 0.723 AU. Venus's actual range is 0.718-0.728 AU.

**Failure modes:**
- **Radial band is only 0.010 AU wide.** The trajectory predictor's 2-hour segments at 1 AU cover ~0.003 AU of radial change per step for a typical solar sail. This means Venus's radial band is only ~3 segments wide. A fast radial transit could cross all of Venus's range in one segment.
- **Semi-major-axis-only detection is EXCELLENT for Venus.** The maximum error from checking 0.723 AU instead of Venus's actual radius is at most 0.005 AU (the difference between a and perihelion/aphelion). This translates to ~1-2 days of timing error, moving Venus's ghost by ~3 degrees. Negligible for navigation.
- **Multi-radius checking would provide no benefit** and would risk the snapping problem with a merge window of `max(40, 0.007 * 0.723 * 365.25 * 4) = max(40, 7.4) = 40 days`. The 40-day minimum floor is fine for Venus since all three crossings (if checked) would be within ~2-3 days of each other.

**Risk level: LOW.** Venus is the best-behaved planet for this algorithm.

### 5.2 Mercury (e = 0.206, a = 0.387 AU)

**Current behavior:** Semi-major-axis-only check at 0.387 AU. Mercury's actual range is 0.307-0.467 AU.

**Failure modes:**
- **Radial band is 0.160 AU wide.** This is proportionally huge -- Mercury's orbit varies by 41% of its semi-major axis. Checking only at 0.387 AU could miss the actual encounter geometry by a significant margin.
- **Timing error:** If the ship crosses 0.387 AU at day 50 but Mercury is actually at 0.32 AU (near perihelion), the ghost shows Mercury's position at day 50, which could be significantly different from when the ship actually reaches 0.32 AU (perhaps day 35 or day 65). At Mercury's orbital velocity (~48 km/s), 15 days of timing error moves Mercury ~65 degrees around its orbit. This is a **large** positional error.
- **Multi-radius merge window:** `max(40, 0.206 * 0.387 * 365.25 * 4) = max(40, 116) = 116 days`. Mercury's orbital period is only 88 days. A 116-day merge window spans more than one full orbit! This would merge crossings from completely separate orbits.
- **Mercury's high eccentricity + small orbit = fast radial velocity.** The ship's trajectory crosses Mercury's radial band quickly (the ship is also moving fast this close to the Sun). The three radius crossings would be close together in time (~5-15 days), making deduplication less problematic but making the winner-flipping problem acute because all three crossings have similar time-of-flight.

**Risk level: HIGH.** Mercury is the worst case for semi-major-axis-only detection. The 0.080 AU error between the checked radius and actual position is 20% of the semi-major axis.

**If multi-radius were re-enabled:** The 116-day merge window is catastrophically wrong for Mercury. It must be capped at something much less than the orbital period (88 days), perhaps 30 days maximum for Mercury.

### 5.3 Mars (e = 0.093, a = 1.524 AU)

**Current behavior:** Semi-major-axis-only check at 1.524 AU. Mars's actual range is 1.381-1.666 AU.

**Failure modes:**
- **This is the known problem case.** The 0.143 AU error between semi-major axis and actual radius translates to 20-40 days of timing error, moving Mars's ghost by 10-20 degrees.
- **For the typical Earth-to-Mars transfer:** The ship spirals outward, crossing 1.524 AU at an angle. The semi-major axis crossing provides a reasonable approximation because Mars spends most of its time near the semi-major axis distance (by Kepler's second law, it moves slowest near aphelion).
- **The investigation report shows the multi-radius approach was worse** due to the snapping problem. The semi-major-axis approximation, while imprecise, is at least stable.

**Risk level: MODERATE.** Known issue, manageable with current semi-major-axis-only approach. The timing error is tolerable for visual trajectory planning.

### 5.4 Jupiter (e = 0.049, a = 5.204 AU)

**Current behavior:** Semi-major-axis-only check at 5.204 AU. Jupiter's actual range is 4.950-5.458 AU.

**Failure modes:**
- **Long transfer time (2-3 years) amplifies trajectory predictor divergence.** Over 730 days at 12 steps/day (capped to 6000 steps -> 8.2 steps/day), the predicted trajectory accumulates significant error. The ghost position reliability decreases substantially.
- **Step resolution at Jupiter distance:** At 5 AU, the orbital velocity is ~2.6 AU/yr. With 8.2 steps/day, each step covers ~0.0013 AU. The radial band is 0.508 AU wide, so the trajectory crosses Jupiter's radial zone over ~390 segments -- excellent resolution.
- **The eccentricity is below 0.05,** so even if multi-radius were re-enabled, only the semi-major axis would be checked. This is correct for Jupiter.
- **Phase angle becomes critical.** At Jupiter's distance, the encounter geometry is dominated by phase angle (where Jupiter is in its orbit when you arrive). The ghost marker is most useful here not for its exact position but for indicating approximately when you cross Jupiter's orbital distance. The ship-to-planet distance shown on the ghost is the key navigation metric.

**Risk level: LOW for detection accuracy, HIGH for prediction reliability.** The ghost will be placed at approximately the right orbital distance, but the predicted crossing time may be off by days or weeks due to trajectory predictor divergence over 2+ years.

### 5.5 Saturn, Uranus, Neptune (e ~ 0.05, a > 9 AU)

**Failure modes:**
- **Trajectory prediction is fundamentally unreliable at these time scales.** A 5-year prediction with 3.3 steps/day accumulates enormous thrust-direction errors. The predicted trajectory is more of a general trend than a navigation plan.
- **maxSteps cap (6000) severely limits resolution.** For a 5-year trajectory targeting Saturn at 9.5 AU, steps are every 7.3 hours. At Saturn's distance, this is acceptable for crossing detection (slow radial motion), but the trajectory itself has diverged so much that the crossing time is unreliable.
- **The ghost markers serve a different purpose at these distances.** For outer planets, they indicate whether the transfer is even geometrically feasible (phase angle), not precise intercept timing. The current semi-major-axis approach is adequate for this coarser purpose.

**Risk level: LOW for practical impact** (ghosts are inherently approximate at these distances), **HIGH for theoretical accuracy** (divergence can be 0.5+ AU over 5 years).

---

## 6. Divergence Between intersectionDetector.js and evaluate-trajectory.js

### 6.1 Algorithm Mismatch

**Severity: MODERATE**

The course solver (`evaluate-trajectory.js`) still uses multi-radius checking for eccentric orbits (lines 247-256):

```javascript
if (targetE > 0.05 && targetE < 0.95) {
    targetRadii = [perihelion, targetA, aphelion];
}
```

But the intersection detector (`intersectionDetector.js`) now only checks the semi-major axis (lines 494-506 after the Option A fix).

This means:
- The course solver might find a solution where the best encounter occurs at perihelion/aphelion radius
- When the user applies this solution, the intersection detector shows the ghost at the semi-major axis crossing, which is a different time/position
- The ghost marker won't match what the course solver optimized for

This is a consistency failure mode. The user sets a course, the solver says "INTERCEPT at 0.05 AU," but the ghost shows "0.15 AU" because it's checking a different radius.

### 6.2 evaluate-trajectory.js Uses No Deduplication

**Severity: LOW**

The course solver collects ALL crossings from all three radii and picks the best one globally (lines 337-377), without any time-based deduplication. This is actually the correct approach for optimization (find the absolute best intercept), but it means the solver can find solutions at aphelion/perihelion crossings that the intersection detector won't display.

---

## 7. Summary of Findings

| # | Finding | Severity | Area |
|---|---------|----------|------|
| F1 | 208-day merge window merges legitimate separate orbit transits | CRITICAL | Deduplication |
| F2 | Winner-takes-all selection creates hard decision boundary causing snaps | CRITICAL | Deduplication |
| F3 | Crossing appearance/disappearance at threshold radii is discontinuous | CRITICAL | Multi-radius |
| F4 | Hysteresis delays snaps but doesn't eliminate them, adds state complexity | MODERATE | Proposed fix |
| F5 | Instantaneous orbital radius causes frame-to-frame instability and "chasing" | HIGH | Proposed fix |
| F6 | Instantaneous radius adds O(segments * bodies) getPosition() calls | MODERATE | Performance |
| F7 | Trajectory predictor diverges 0.01-0.5 AU over 200 days depending on thrust | HIGH | Prediction |
| F8 | Near-sun passes (< 0.3 AU) cause 2-hour steps to be too coarse | HIGH | Prediction |
| F9 | Mercury semi-major-axis-only detection has 0.08 AU / 20% error | HIGH | Edge case |
| F10 | Mercury merge window (116 days) exceeds Mercury's orbital period (88 days) | HIGH | Edge case |
| F11 | Step count cap degrades resolution for > 500-day predictions | MODERATE | Prediction |
| F12 | Trajectory predictor and game loop use different step sizes, causing divergence | HIGH | Systemic |
| F13 | Course solver uses multi-radius but intersection detector doesn't (after fix) | MODERATE | Consistency |
| F14 | 5-year predictions for outer planets have AU-scale trajectory divergence | HIGH | Edge case |

---

## 8. Recommendations

### Immediate (no code changes needed)
1. **Accept the semi-major-axis approximation** as a pragmatic choice. The existing investigation report correctly identified Option A as the safest fix. The ghost markers are visual aids, not precision instruments.
2. **Document the expected accuracy** of ghost positions vs prediction window. Users need to understand that a 200-day ghost is approximate and a 1000-day ghost is very approximate.

### Short-term (targeted fixes)
3. **Align evaluate-trajectory.js with intersectionDetector.js** -- either both should use semi-major-axis-only, or both should use multi-radius. The current mismatch (F13) will confuse users who apply computed courses.
4. **For Mercury specifically**, consider a body-specific radius override that uses the instantaneous radius at a single reference time (e.g., prediction midpoint) instead of the fixed semi-major axis. This is a one-time calculation per body per prediction, not per-segment, so the performance impact is negligible. It would improve Mercury's ghost accuracy from +/-0.08 AU to +/-0.02 AU without introducing frame-to-frame instability.

### Medium-term (architectural changes)
5. **Replace deduplication with "show all crossings"** (Option B from the investigation). Each radius crossing gets its own ghost, each individually stable. Use visual differentiation (opacity, size, border) to indicate which crossing has the best intercept distance. This preserves all information while maintaining stability.
6. **Add a trajectory confidence indicator** that decays with prediction distance. At 60 days, show "HIGH" confidence. At 200 days, show "MODERATE." At 500+ days, show "LOW." This sets correct user expectations about ghost accuracy (addresses F7, F12, F14).

### Long-term (significant rework)
7. **Adaptive step size for trajectory predictor.** Instead of fixed 12 steps/day, use smaller steps when close to the Sun or when thrust is high, and larger steps at distance. This directly addresses F7 and F8 without increasing total step count.
8. **Consider closest-approach-constrained-to-orbit** as an alternative algorithm: find the closest approach between trajectory and planet, then project the ghost to the nearest point on the planet's orbital path. This anchors the ghost to the orbit (satisfying the critical constraint) while using actual encounter geometry rather than radius crossings.
