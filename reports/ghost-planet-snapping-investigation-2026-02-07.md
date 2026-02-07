# Ghost Planet Position Snapping - Investigation Report

**Date:** 2026-02-07
**Status:** Root cause identified, fix recommended

## 1. Problem Statement

### 1.1 Description
Small sail parameter changes (0.1 degree pitch) cause ghost planet markers to "snap" to completely different positions on the screen. This makes fine-tuning intercept trajectories effectively impossible.

### 1.2 Observed Behavior
From user screenshots (Mars encounter, 2yr prediction, ULTRA resolution):

| Pitch | Ghost 1 (stable) | Ghost 2 (jumping) |
|-------|-------------------|-------------------|
| -31.1 | MARS +518d 15h [0.11 AU] | MARS +437d 3h [0.19 AU] |
| -31.2 | MARS +518d 2h [0.11 AU] | MARS +433d 15h [0.20 AU] |
| -31.3 | MARS +517d 13h [0.10 AU] | **MARS +337d 13h [0.38 AU]** |

Ghost 1 is stable (shifts ~1 day per 0.1 pitch). Ghost 2 **jumps 96 days and 0.18 AU** between -31.2 and -31.3. Mars moves ~52 degrees around its orbit in 96 days, which is why the ghost snaps to a completely different screen position.

### 1.3 Not User Error
This is a code-level issue. The trajectory itself (green dashed line) changes smoothly with pitch adjustments. The discontinuity is in the **crossing detection and deduplication logic**, not in the trajectory prediction.

## 2. Root Cause Analysis

### 2.1 The Multi-Radius + Deduplication Interaction

The root cause is the interaction between two features in `intersectionDetector.js`:

**Feature 1: Multi-radius crossing detection** (added 2026-02-06, lines 496-504)

For eccentric orbits (e > 0.05), the code checks THREE radii per body:
- Perihelion radius: `a * (1 - e)` = 1.381 AU for Mars
- Semi-major axis: `a` = 1.524 AU for Mars
- Aphelion radius: `a * (1 + e)` = 1.666 AU for Mars

**Feature 2: Deduplication with large merge window** (lines 396-432)

Crossings within a merge window are grouped, keeping only the one with the **smallest ship-to-planet distance**:

```
mergeWindow = max(40, e * a * 365.25 * 4)
Mars: max(40, 0.0934 * 1.524 * 365.25 * 4) = 208 days
```

### 2.2 How the Snap Occurs

When the trajectory spirals outward through Mars's orbital zone, it crosses three radii at different times:

```
Trajectory crosses perihelion (1.38 AU) at ~ day 337   Mars distance: 0.38 AU
Trajectory crosses semi-major  (1.52 AU) at ~ day 400   Mars distance: ~0.25 AU
Trajectory crosses aphelion    (1.67 AU) at ~ day 437   Mars distance: 0.20 AU
```

All three crossings fall within the 208-day merge window. The deduplication picks the one with smallest distance:

- At pitch -31.2: **Aphelion crossing wins** (0.20 AU is best) - ghost shows at +433d
- At pitch -31.3: The trajectory shifts slightly. The aphelion crossing either disappears (trajectory no longer reaches 1.67 AU at this geometry) or its distance degrades past the perihelion crossing's distance. **Perihelion crossing wins** (0.38 AU) - ghost shows at +337d

The "winner" switching from aphelion to perihelion crossing moves the **displayed time by 96 days**, which moves Mars **52 degrees** around its orbit - producing the dramatic position snap.

### 2.3 Why This Affects All Controls

The same mechanism applies to yaw and deployment changes. Any small trajectory shift that changes which radius crossing "wins" the deduplication will produce a discontinuous jump. The effect is worst for:
- Mars (e=0.093, merge window=208d, radial band=0.285 AU)
- Mercury (e=0.206, merge window=116d, radial band=0.160 AU)
- Less severe for Venus (e=0.007 < 0.05, only checks semi-major axis)

### 2.4 Contributing Factor: Winner-Takes-All Selection

The deduplication uses a "pick the closest" strategy (`c.distance < best.distance ? c : best`). This creates a hard decision boundary. When two crossings have similar distances, tiny trajectory changes can flip the winner, causing the displayed result to jump between them.

## 3. The Data Pipeline

```
Sail parameter change (0.1 pitch)
  |
  v
predictTrajectory() - 6000 steps over 730 days (~2.9 hour segments)
  |
  v
detectIntersections() - scans trajectory for radius crossings
  |
  v
findOrbitalPlaneCrossings() - checks 3 radii for Mars (perihelion, a, aphelion)
  |                          - finds 3 crossings per orbit transit
  v
deduplicateBodyCrossings() - 208-day merge window
  |                        - picks smallest distance
  |                        - DISCONTINUITY INTRODUCED HERE
  v
Ghost planet rendered at winner's time/position
```

## 4. Solution Options

### Option A: Remove Multi-Radius Checking (Quick Fix)

**Change:** Only check semi-major axis, not perihelion/aphelion.

```javascript
// intersectionDetector.js:499-504
// Remove this block:
if (e > ECCENTRICITY_THRESHOLD && e < 0.95) {
    const perihelion = a * (1 - e);
    const aphelion = a * (1 + e);
    targetRadii.push(perihelion, aphelion);
}
```

**Pros:** Simple, eliminates the root cause entirely. Returns to pre-Feb-6 behavior which didn't have this snapping issue.

**Cons:** Ghost might show at slightly wrong time for eccentric orbits (checking at 1.52 AU when Mars is actually at 1.38 or 1.67 AU). But for navigation purposes, the semi-major axis crossing is a reasonable approximation.

**Assessment:** Good quick fix. The multi-radius feature was added Feb 6 and introduced this regression. Semi-major-axis-only detection worked well before.

### Option B: Show All Crossings Instead of Deduplicating (Best UX)

**Change:** Skip deduplication for multi-radius crossings. Show each crossing as a separate ghost.

The user would see up to 3 ghosts per orbit transit (one at perihelion radius, one at semi-major, one at aphelion). Each would be stable because there's no winner-selection discontinuity.

**Pros:** Most informative. Each ghost is individually stable. User can see the full picture of the encounter geometry.

**Cons:** More visual clutter (3 ghosts per transit instead of 1). May need visual distinction (e.g., smaller markers for perihelion/aphelion crossings).

**Assessment:** Best for experienced users doing trajectory planning. Could combine with Option D (reduced merge window) to still merge genuine duplicates from numerical issues while preserving distinct radius crossings.

### Option C: Temporal Coherence in Deduplication (Smooth Transitions)

**Change:** When deduplicating, prefer the crossing that is closest in time to the previous frame's result, not the closest in distance. This maintains temporal coherence.

```javascript
// Instead of: keep smallest distance
result.push(group.reduce((best, c) => c.distance < best.distance ? c : best));

// Use: keep closest to previous frame's time (if available), else smallest distance
const previousTime = previousFrameResults?.[body.name]?.time;
if (previousTime) {
    result.push(group.reduce((best, c) =>
        Math.abs(c.time - previousTime) < Math.abs(best.time - previousTime) ? c : best));
} else {
    result.push(group.reduce((best, c) => c.distance < best.distance ? c : best));
}
```

**Pros:** Smooth transitions. Ghost slides along orbit rather than jumping.

**Cons:** More complex. Requires tracking previous frame results. Could "lock onto" a suboptimal crossing and resist switching to a better one. Needs hysteresis logic to eventually transition.

**Assessment:** Sophisticated but adds state management complexity. Better as a follow-up improvement.

### Option D: Reduce Merge Window (Moderate Fix)

**Change:** Reduce the merge window to separate distinct radius crossings while still merging numerical duplicates.

The current formula `max(40, e * a * 365.25 * 4)` gives 208 days for Mars. The actual time between perihelion and aphelion radius crossings for a radial solar sail trajectory is roughly proportional to the band width divided by radial velocity. For a typical inbound/outbound transit, the three crossings might be spread over 20-60 days.

A much smaller window (e.g., 10-20 days) would merge genuine numerical duplicates from the same radius crossing while keeping perihelion/semi-major/aphelion crossings separate:

```javascript
const mergeWindow = Math.max(5, e * a * 365.25 * 0.5); // ~26 days for Mars
```

**Pros:** Simple change. Keeps multi-radius feature but reduces deduplication aggressiveness.

**Cons:** Might show 2-3 ghosts per transit (similar to Option B). Doesn't fully solve the "winner switching" problem if crossings are still within the window.

**Assessment:** Reasonable compromise. Effectively turns into Option B for most cases.

### Option E: Weighted Average Position (Smooth but Physically Questionable)

**Change:** Instead of picking a winner, blend all crossings in a group using distance-weighted interpolation.

**Pros:** Smooth transitions as weights shift.

**Cons:** The "blended" position doesn't correspond to any real crossing time. Physically misleading for navigation. A ghost between the perihelion and aphelion crossings doesn't represent a real encounter opportunity.

**Assessment:** Not recommended. Sacrifices physical accuracy for visual smoothness.

## 5. Recommended Approach

### Immediate Fix: Option A (Remove Multi-Radius Checking)

This is the safest immediate fix. The multi-radius checking was added Feb 6 and introduced this regression. Reverting to semi-major-axis-only detection:
- Eliminates the snapping entirely
- Returns to proven behavior
- Semi-major axis crossing is a good approximation for navigation
- Low risk of introducing new issues

### Follow-Up Enhancement: Option B + D (Show All Crossings with Small Merge Window)

As a second phase, re-introduce multi-radius checking but **without aggressive deduplication**:
1. Keep perihelion/semi-major/aphelion crossings as separate markers
2. Use a small merge window (~5-10 days) only to remove numerical duplicates
3. Visually distinguish the different crossing types (e.g., smaller dots for perihelion/aphelion, or different opacity levels)
4. Optionally add a "best encounter" indicator on the crossing with smallest distance

This preserves the benefit of multi-radius checking (more accurate encounter timing for eccentric orbits) while eliminating the discontinuity from winner-selection deduplication.

## 6. Files Affected

| File | Change | Option |
|------|--------|--------|
| `src/js/lib/intersectionDetector.js:496-504` | Remove or modify multi-radius block | A |
| `src/js/lib/intersectionDetector.js:396-432` | Reduce merge window | D |
| `src/js/lib/intersectionDetector.js:424` | Change deduplication strategy | B, C |

## 7. Verification Plan

After applying the fix:
1. Set destination to Mars with 2yr trajectory prediction
2. Slowly adjust pitch in ULTRA (0.1) mode from -31.0 to -32.0
3. Verify ghost planet moves smoothly without snapping
4. Repeat with yaw and deployment adjustments
5. Check Venus, Mercury, Jupiter encounters for similar behavior
6. Run intersection detector test suites:
   ```javascript
   import('/js/lib/intersectionDetector.crossing.test.js').then(m => m.runAllTests())
   import('/js/lib/intersectionDetector.edge-cases.test.js').then(m => m.runAllTests())
   ```
