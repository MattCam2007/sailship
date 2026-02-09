# Ghost Planet Meaningful Filtering - Failure Modes Analysis

**Date:** 2026-02-09
**Reviewer:** Failure Analyst
**Component:** `intersectionDetector.js`, `renderer.js`, `config.js`
**Spec:** `reports/ghost-planet-filtering-spec-2026-02-09.md`
**Plan:** `reports/ghost-planet-filtering-implementation-plan-2026-02-09.md`

---

## Executive Summary

Analyzed the proposed angular separation filter for ghost planet encounter markers. Found **1 critical failure mode**, **3 high-severity issues**, **2 medium-severity issues**, and **1 negligible concern**. The critical issue is that the hard cutoff in `detectIntersections()` permanently discards crossings BEFORE the closest approach refinement in `main.js` can correct their angular separation — meaning genuinely close encounters can be silently hidden from the player. Several other issues echo the historical flickering and snapping problems this codebase has already battled extensively.

**Overall Risk: HIGH** — The filtering concept is sound, but the proposed placement of the hard cutoff (inside the detector, before refinement) inverts the data pipeline and will hide valid encounters. The opacity fade in the renderer is well-designed and low-risk.

---

## Failure Mode 1: Hard Cutoff Hides Encounters That Refinement Would Rescue

**Severity: CRITICAL**
**Likelihood: HIGH (common for any planet within 10x SOI)**
**Impact: Player misses genuine intercept opportunities, defeating the feature's purpose**

### Analysis

The proposed change adds a hard cutoff in `detectIntersections()` at line ~895 (after angular separation is computed):

```
if (angularSeparation > maxAngularSeparation) continue;  // PROPOSED
```

But the closest approach refinement in `main.js` (lines 216-246) runs AFTER `detectIntersections()` returns:

```javascript
// main.js lines 216-246 — runs AFTER detectIntersections()
for (const intersection of intersections) {
    const ca = closestApproaches.find(c => c.bodyName === intersection.bodyName);
    if (ca.minDistance < soiRadius * 10 && ca.minDistance < intersection.distance) {
        intersection.bodyPosition = ca.bodyPos;        // REPLACES position
        intersection.time = ca.time;                    // REPLACES time
        intersection.angularSeparation = Math.acos(...); // RECALCULATES angular sep
    }
}
```

The refinement changes `bodyPosition`, `time`, AND `angularSeparation`. A crossing that has 55 degrees angular separation at the radius-crossing point could have 3 degrees angular separation at the closest approach point. But with the proposed filter, it would never survive to reach the refinement step.

### Concrete Scenario

1. Ship trajectory crosses Mars's orbital radius at day +400
2. At that crossing point, Mars is 50 degrees ahead in its orbit (angularSeparation = 0.873 rad > pi/4)
3. **Proposed filter discards this crossing**
4. Meanwhile, `detectClosestApproaches()` finds that at day +430, Mars passes within 0.02 AU of the trajectory (well within 10x SOI)
5. The refinement logic in `main.js` would have replaced the crossing data with the closest approach data, giving angularSeparation of ~2 degrees
6. But the crossing was already discarded — the player never sees the ghost, never knows Mars is reachable

### Why This Is Common

The radius crossing detection finds where the ship crosses a planet's orbital *radius* (distance from Sun). The planet's angular position at that time can be anywhere on its orbit. For planets with long orbital periods (Mars: 687 days, Jupiter: 4333 days), the planet barely moves during the ship's transit through its orbital zone. The angular separation at radius crossing is essentially random relative to the planet's phase — it depends on when the player launched, not on their trajectory quality.

The closest approach, by contrast, measures the actual minimum distance, which is what navigation cares about. The two measurements can diverge enormously.

### Recommendation

**Move the filter to AFTER refinement in main.js**, or apply it only in the renderer (as the opacity fade already does). The detector should not discard data that downstream logic depends on. Alternatively, skip the hard cutoff entirely and rely solely on the opacity fade in the renderer — this provides the visual decluttering benefit without silently hiding data.

---

## Failure Mode 2: Boundary Flickering at 45-Degree Threshold

**Severity: HIGH**
**Likelihood: HIGH (guaranteed during active sail tuning)**
**Impact: Ghosts pop in/out as player adjusts sail, repeating the exact flickering bug the project spent weeks fixing**

### Analysis

When a crossing's angular separation hovers near the 45-degree threshold (pi/4 = 0.7854 rad), small sail adjustments will cause it to oscillate above and below the cutoff:

```
Frame N:   angularSeparation = 0.782 rad (44.8°) → SHOWN
Frame N+1: angularSeparation = 0.789 rad (45.2°) → FILTERED
Frame N+2: angularSeparation = 0.785 rad (45.0°) → FILTERED (exactly at boundary)
Frame N+3: angularSeparation = 0.780 rad (44.7°) → SHOWN
```

This produces the exact same flicker-on/flicker-off behavior documented in:
- `reports/ghost-planet-flickering-analysis-2026-01-30.md`
- `reports/ghost-filter-failure-analysis-2026-02-07.md` (Failure Mode #5)
- `reports/ghost-planet-snapping-investigation-2026-02-07.md`

The project has extensive history of hard thresholds causing visual discontinuities. The boundary comparison operators in `findRadiusCrossing()` were specifically changed from strict (`<`, `>`) to non-strict (`<=`, `>=`) to prevent a similar flicker bug. This proposed hard cutoff reintroduces the same class of defect.

### Why the Opacity Fade Does Not Fully Mitigate This

The fade applies in the renderer, but the hard cutoff in the detector runs first. A ghost at 44.9 degrees would be drawn at very low opacity (nearly transparent). At 45.1 degrees, it disappears entirely. The visual difference between "nearly invisible" and "gone" is small, but:

1. The label text (e.g., "MARS +400d 6h [0.52 AU] EARLY 45°") would vanish abruptly
2. The pulsing glow effect for close encounters disappears
3. Any downstream consumers (autopilot, course solver) lose the crossing data

### Recommendation

1. **Add hysteresis to the hard cutoff**: Once a crossing passes the threshold, require it to exceed `maxAngularSeparation + hysteresisMargin` (e.g., 50 degrees) before removal. Track previous-frame state per body.
2. **Widen the fade range**: Set `fadeStartFraction` to 0.3 instead of 0.5, so fading begins at 13.5 degrees instead of 22.5 degrees. This ensures ghosts near the boundary are already very faint before the cutoff.
3. **Prefer renderer-only filtering**: Remove the hard cutoff from the detector entirely. Let the renderer handle visual decluttering via opacity. The detector's job is to produce accurate data, not to make display decisions.

---

## Failure Mode 3: Outer Planet Ghosts Permanently Suppressed

**Severity: HIGH**
**Likelihood: CERTAIN for Jupiter, Saturn, Uranus, Neptune**
**Impact: Encounter markers feature is useless for outer planet transfers**

### Analysis

Outer planets have long orbital periods. A ship on a transfer trajectory will cross their orbital radius at a position determined primarily by the ship's starting geometry, not by the planet's position:

| Planet | Orbital Period | Degrees moved per 60d | Degrees moved per 365d | Typical angular separation at crossing |
|--------|---------------|----------------------|----------------------|---------------------------------------|
| Mars | 687 d | 31° | 191° | 10-180° (varies widely) |
| Jupiter | 4,333 d | 5° | 30° | 30-180° (almost always > 45°) |
| Saturn | 10,759 d | 2° | 12° | Nearly random (0-180°) |
| Uranus | 30,687 d | 0.7° | 4° | Nearly random (0-180°) |
| Neptune | 60,190 d | 0.4° | 2° | Nearly random (0-180°) |

For Jupiter, the probability of a radius crossing having angular separation < 45 degrees is roughly 45/180 = 25%. For Saturn and beyond, it approaches a uniform distribution with ~25% chance of being within 45 degrees.

This means:
- **75% of Jupiter crossings will be hidden** by the 45-degree filter
- **~75% of Saturn/Uranus/Neptune crossings will be hidden**
- For multi-year trajectory windows (which specifically exist to support outer planet transfers per `DEFAULT_TRAJECTORY_CONFIG`), the player will rarely see any outer planet ghosts

The entire purpose of the encounter markers feature is trajectory planning. Hiding 75% of outer planet encounters makes the feature useless for its primary long-range navigation use case.

### Recommendation

1. **Scale the threshold by orbital period**: Outer planets need wider thresholds because the angular separation is less meaningful at longer time horizons. Example:
   ```
   effectiveThreshold = maxAngularSeparation * (orbitalPeriod / earthOrbitalPeriod)^0.3
   ```
   This gives Jupiter ~78°, Saturn ~100°, which keeps most crossings visible.

2. **Use a different metric for outer planets**: Instead of angular separation, use "orbital phase error in days" — how many days of orbital motion separate the planet from the crossing point. This scales naturally with orbital period.

3. **At minimum, exempt bodies beyond Mars from the hard cutoff**: Only apply the 45-degree filter to inner planets where angular separation is a meaningful navigation metric.

---

## Failure Mode 4: Opacity Fade Creates Invisible-But-Present Ghosts

**Severity: MEDIUM**
**Likelihood: MODERATE (any crossing between fadeStart and max)**
**Impact: Confusing ghost labels visible without corresponding planet marker**

### Analysis

The proposed opacity scaling is:
```
opacity = baseOpacity * (1 - (angularSep - fadeStart) / (max - fadeStart))
```

Where:
- `baseOpacity` = 0.5 (current ghost planet alpha, renderer.js line 1218)
- `fadeStart` = 0.5 * pi/4 = 22.5 degrees
- `max` = 45 degrees

At 40 degrees angular separation:
```
fade = (40 - 22.5) / (45 - 22.5) = 0.778
opacity = 0.5 * (1 - 0.778) = 0.111
```

An opacity of 0.111 makes the ghost planet body nearly invisible against the dark canvas background. However, the label text is drawn at 0.8 opacity (renderer.js line 1253) and the text outline at 0.7 opacity (line 1258). If the opacity scaling applies only to the ghost planet circle and not to the label:

- The ghost planet is invisible (alpha ~0.11)
- The label "MARS +400d 6h [0.52 AU] EARLY 40°" is fully visible at 0.8 alpha
- This creates a floating label with no corresponding visual marker

If the opacity scaling IS applied to the label:
- At alpha 0.111, the label becomes unreadable against the dark background
- Text stroke rendering at very low alpha produces visual artifacts on some canvas implementations

### The Pulsing Glow Problem

For close encounters (within 2x SOI), the ghost gets a pulsing glow effect (renderer.js lines 1202-1214). If a close encounter also has high angular separation (possible — distance and angular separation are independent metrics), the opacity fade conflicts with the pulsing glow:

```
Pulsing glow alpha: intensity * 0.3 (oscillates 0.0 - 0.3)
Fade alpha: 0.111
Combined: Which wins?
```

The current code uses `ctx.globalAlpha` for both effects. If the fade alpha is applied globally via `ctx.save()/ctx.globalAlpha`, it would multiply with the glow alpha, making close encounters nearly invisible — the opposite of what the player needs.

### Recommendation

1. **Apply opacity scaling to BOTH planet marker and label consistently**
2. **Set a minimum opacity floor** (e.g., 0.15) so faded ghosts are still barely perceptible
3. **Exempt close encounters from opacity fade**: If `isCloseEncounter` is true, always use full opacity regardless of angular separation
4. **Test rendering on dark backgrounds** at very low alpha values — canvas anti-aliasing behaves differently below alpha 0.1

---

## Failure Mode 5: Filter-Before-Deduplication Loses Best Intercept

**Severity: MEDIUM**
**Likelihood: LOW (requires eccentric orbit AND angular separation near threshold)**
**Impact: Best intercept opportunity hidden, replaced by worse one**

### Analysis

In the current code, the processing order within `detectIntersections()` is:

```
1. Find crossings per body (findOrbitalPlaneCrossings)
2. Refine with actual radius (refineCrossingWithActualRadius)
3. Compute angular separation per crossing
4. [PROPOSED] Filter by angular separation
5. Deduplication (deduplicateBodyCrossings)
```

The deduplication algorithm (lines 384-420) groups crossings within a time-based merge window and keeps the one with the **smallest ship-to-planet distance**. If the best-distance crossing is filtered at step 4, the deduplication will pick from remaining crossings, potentially selecting one with much worse distance.

### Scenario

For Mars (e=0.094, currently uses semi-major axis only, but historically had multi-radius):

Even with single-radius detection, the iterative radius refinement (`refineCrossingWithActualRadius`) can shift the crossing time significantly (up to 70 days for Mars). Two crossings at the same radius but different trajectory legs could end up in the same deduplication group. If one has angular separation 44 degrees (kept) and the other has 46 degrees (filtered), but the filtered one had a 0.1 AU distance vs the kept one's 0.8 AU distance, the player sees the worse intercept.

### Likelihood Assessment

This requires:
1. Two crossings of the same body within the merge window
2. The better-distance crossing has angular separation > threshold
3. The worse-distance crossing has angular separation < threshold

With single-radius detection (current code), duplicate crossings for the same body are less common than with multi-radius detection. The risk is real but the probability is low for typical trajectories.

### Recommendation

**Apply the angular separation filter AFTER deduplication**, not before. This ensures the deduplication algorithm has access to all crossings when selecting the best intercept. The filter then removes only the final selected crossing if it exceeds the threshold.

---

## Failure Mode 6: Angular Separation Inflated by Out-of-Plane Component

**Severity: LOW**
**Likelihood: LOW (requires significant ship orbital inclination)**
**Impact: Slightly earlier ghost fade/cutoff than geometrically warranted**

### Analysis

The angular separation is computed as a 3D heliocentric angle:

```javascript
const dotProd = crossing.position.x * planetPos.x +
                crossing.position.y * planetPos.y +
                crossing.position.z * planetPos.z;
const cosAngle = dotProd / (shipMag * planetMag);
angularSeparation = Math.acos(cosAngle);
```

This measures the full 3D angle between the ship's crossing position vector and the planet's position vector, as seen from the Sun. For a ship with significant orbital inclination (achieved via pitch thrust), the crossing position will have a non-zero z-component. This inflates the angular separation compared to the in-plane angle that the player actually cares about.

Example:
- Ship crosses Mars's orbital radius at position (1.2, 0.5, 0.3) — elevated above ecliptic
- Mars is at (1.0, 0.8, 0.0) — in the ecliptic plane
- In-plane angle: ~18 degrees
- 3D angle: ~23 degrees (inflated by out-of-plane component)

The inflation is modest for typical inclinations (planet inclinations are < 7 degrees, ship pitch rarely exceeds 10-15 degrees). But at the threshold boundary, this could push a crossing from "visible" (44 degrees) to "filtered" (46 degrees) when the in-plane geometry is actually navigable.

### Recommendation

This is a minor issue. If a fix is desired, compute angular separation using only the x-y (ecliptic plane) components of the position vectors. But the current 3D computation is physically defensible and the inflation is small.

---

## Failure Mode 7: Import and Comparison Performance

**Severity: NEGLIGIBLE**
**Likelihood: N/A**
**Impact: None measurable**

### Analysis

The proposed change adds:
1. One import of `GHOST_PLANET_CONFIG` from `config.js` (already imported for `SOI_RADII`)
2. One floating-point comparison per crossing (`angularSeparation > maxAngularSeparation`)
3. One opacity calculation per drawn ghost in the renderer

The angular separation is already computed at lines 875-895. The additional comparison adds one `>` operation per crossing. For a typical trajectory with 8 planets and 1-2 crossings per planet, this is ~16 comparisons per detection cycle (every 200ms). Cost: unmeasurable, well under 0.001ms.

The opacity calculation in the renderer adds one subtraction, one division, and one multiplication per ghost per frame. For 2-5 visible ghosts at 60 FPS, this is ~300 arithmetic operations per second. Cost: unmeasurable.

### Recommendation

No performance concerns. This is a non-issue.

---

## Summary Table

| # | Failure Mode | Severity | Likelihood | Impact | Fix Priority |
|---|-------------|----------|------------|--------|-------------|
| 1 | Hard cutoff hides refinable encounters | **CRITICAL** | HIGH | Misses genuine intercepts | **URGENT** |
| 2 | Boundary flickering at 45° threshold | **HIGH** | HIGH | Visual flicker during tuning | **HIGH** |
| 3 | Outer planet ghosts permanently suppressed | **HIGH** | CERTAIN | Feature useless for Jupiter+ | **HIGH** |
| 4 | Invisible-but-present ghost labels | **MEDIUM** | MODERATE | Confusing floating labels | **MEDIUM** |
| 5 | Filter-before-dedup loses best intercept | **MEDIUM** | LOW | Worse intercept shown | **MEDIUM** |
| 6 | Out-of-plane angular separation inflation | **LOW** | LOW | Slightly early cutoff | **LOW** |
| 7 | Performance overhead | **NEGLIGIBLE** | N/A | None | **NONE** |

---

## Recommended Architectural Changes

### Change 1: Remove Hard Cutoff from Detector (Fixes FM1, FM2, FM5)

The detector (`detectIntersections()`) should not filter by angular separation. Its job is to produce accurate crossing data. The angular separation field should remain as computed — it is valuable information — but the detector should not discard crossings based on it.

**Rationale**: The detector runs before main.js closest approach refinement. Any filtering in the detector permanently removes data that refinement could rescue. This has already been established as an anti-pattern in this codebase (see the multi-radius removal, where filtering in the detector caused snapping).

### Change 2: Filter Exclusively in the Renderer (Fixes FM1, FM2, FM3, FM4)

Move ALL angular separation filtering to `drawIntersectionMarkers()` in `renderer.js`. The renderer has access to the fully-refined intersection data (post main.js refinement) and can apply visual effects without destroying data.

Implementation:
```
For each encounter:
  1. Read angularSeparation (already refined by main.js)
  2. If > maxAngularSeparation: skip drawing (but data remains in cache for other consumers)
  3. If between fadeStart and max: scale opacity
  4. If close encounter (distance < 2x SOI): exempt from fade (always full opacity)
```

### Change 3: Scale Threshold by Orbital Period (Fixes FM3)

For outer planets, the 45-degree threshold is too aggressive. Use a body-specific effective threshold:

```javascript
const orbitalPeriodDays = 2 * Math.PI * Math.sqrt(elements.a ** 3 / MU_SUN);
const earthPeriodDays = 365.25;
const periodFactor = Math.pow(orbitalPeriodDays / earthPeriodDays, 0.3);
const effectiveThreshold = maxAngularSeparation * Math.min(periodFactor, 4.0);
```

This gives approximately:
- Venus: 43° (0.95x, slightly tighter — Venus orbits faster)
- Earth: 45° (1.0x, baseline)
- Mars: 54° (1.2x)
- Jupiter: 78° (1.7x)
- Saturn: 100° (2.2x) — capped below pi

### Change 4: Add Hysteresis for Visual Stability (Fixes FM2)

If the hard cutoff remains (against recommendation), add frame-to-frame hysteresis:
- To HIDE a ghost: require angularSeparation > threshold + 5°
- To SHOW a ghost: require angularSeparation < threshold

This creates a 5-degree dead zone where the previous frame's decision is preserved, eliminating threshold flickering. Store previous-frame visibility per body name in the renderer's local state.

---

## Interaction with Existing Bug History

This project has an extensive documented history of ghost planet visual discontinuities:

| Date | Issue | Root Cause | Resolution |
|------|-------|-----------|-----------|
| 2026-01-30 | Ghost flickering | Strict boundary comparisons | Changed to `<=`/`>=` |
| 2026-02-06 | Multi-radius snapping | Deduplication winner flipping | Removed multi-radius detection |
| 2026-02-07 | "Best 2" filter oscillation | Hard cutoff in renderer | Removed "best 2" filter |
| 2026-02-07 | Merge window too small | Solar sail speed assumption | Increased merge window 4x |

The common thread: **hard thresholds applied to continuous parameter spaces cause discontinuities**. Every previous fix involved either removing the hard threshold or converting it to a soft transition. The proposed angular separation filter introduces a new hard threshold in the same pipeline, exposing the system to the same class of bug.

The opacity fade is a step in the right direction (soft transition), but coupling it with a hard cutoff in the detector undermines the fade's purpose.

---

## Confidence Rating

**HIGH** — All failure modes are well-characterized from first-principles analysis of the data pipeline and corroborated by the project's extensive history of similar bugs. Failure modes 1, 2, and 3 are near-certain to manifest in practice.

---

## Recommended Next Steps

1. **URGENT**: Redesign to filter in renderer only, not in detector (addresses FM1, FM2, FM5)
2. **HIGH**: Add orbital-period-scaled thresholds for outer planets (addresses FM3)
3. **HIGH**: Add close-encounter exemption to opacity fade (addresses FM4)
4. **MEDIUM**: Add hysteresis if any hard cutoff is retained (addresses FM2)
5. **LOW**: Consider 2D ecliptic-plane angular separation instead of 3D (addresses FM6)
6. **TEST**: Add edge case test for 45-degree boundary flickering to `intersectionDetector.edge-cases.test.js`
7. **TEST**: Add test for outer planet crossing visibility with angular separation filter

---

https://claude.ai/code/session_01YGFfYLWxaiJecD8xLaGPuT
