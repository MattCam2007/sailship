# Ghost Planet (Encounter Marker) Placement - Bug Discovery Spec

**Date:** 2026-02-06
**Status:** Discovery Complete

## 1. Executive Summary

Ghost planets (encounter markers) display incorrect positions, making the primary navigation tool unreliable. Three distinct bugs identified across the intersection detector and renderer. The most impactful bug affects ALL planets with eccentric orbits (Mars, Mercury, Jupiter, etc.) by using only the semi-major axis for crossing detection instead of accounting for orbital eccentricity. Two additional bugs make moon ghost positions completely wrong.

## 1.1 Estimated File Impact

### Files to EDIT:
- `src/js/lib/intersectionDetector.js` - Fix crossing detection for eccentric orbits; fix moon heliocentric conversion; fix closest approach bodyPos accuracy
- `src/js/ui/renderer.js` - Fix moon ghost rendering coordinate transform

### Files to CREATE:
- `reports/ghost-planet-spec-2026-02-06.md` - This spec
- `reports/ghost-planet-implementation-plan-2026-02-06.md` - Implementation plan

## 2. Current State Analysis

### 2.1 Existing Systems

| System | Location | Purpose |
|--------|----------|---------|
| Intersection Detector | `src/js/lib/intersectionDetector.js` | Detects trajectory crossings of orbital radii |
| Closest Approach Detector | `src/js/lib/intersectionDetector.js:735` | Finds minimum distance to each planet |
| Trajectory Predictor | `src/js/lib/trajectory-predictor.js` | Generates predicted ship path with thrust |
| Ghost Renderer | `src/js/ui/renderer.js:1109` | Draws ghost planets at encounter positions |
| Trajectory Evaluator | `src/js/lib/evaluate-trajectory.js` | Course solver evaluation (has correct multi-radius logic) |
| Cache System | `src/js/core/gameState.js:326` | Caches intersection and closest approach results |
| Main Loop | `src/js/main.js:101` | Orchestrates trajectory + intersection detection |

### 2.2 Data Flow

```
main.js (game loop)
  → predictTrajectory() → heliocentric trajectory points
  → detectIntersections(trajectory, bodies) → crossing events with bodyPosition
  → detectClosestApproaches(trajectory, bodies) → min-distance events with bodyPos
  → setIntersectionCache() / setClosestApproachCache()

renderer.js (drawIntersectionMarkers)
  → PREFER closestApproachCache (more accurate)
  → FALLBACK intersectionCache (radius crossing)
  → Filter to destination body only
  → Apply moon coordinate transform
  → project3D() → draw ghost + label
```

### 2.3 Relevant Code

- `intersectionDetector.js:428-438` - `findOrbitalPlaneCrossing()`: Only uses `a` for crossing radius
- `intersectionDetector.js:573-704` - `detectIntersections()`: Main detection loop
- `intersectionDetector.js:679` - `getPosition(body.elements, crossing.time)` for moon = parent-relative
- `intersectionDetector.js:735-797` - `detectClosestApproaches()`: Returns interpolated bodyPos
- `intersectionDetector.js:749` - Explicitly skips moons ("would need coordinate transform")
- `intersectionDetector.js:379` - `ECCENTRICITY_THRESHOLD = 0.05` defined but NEVER USED
- `renderer.js:1109-1251` - `drawIntersectionMarkers()`: Ghost rendering
- `renderer.js:1174-1181` - Moon transform uses `parent.x/y/z` (CURRENT time, not crossing time)
- `evaluate-trajectory.js:246-256` - Course solver CORRECTLY checks perihelion/a/aphelion

## 3. Bug Analysis

### 3.1 BUG #1: Crossing detection uses only semi-major axis (CRITICAL - Planets)

**Location:** `intersectionDetector.js:428-438`

**Problem:** `findOrbitalPlaneCrossing()` always uses `body.elements.a` as the target radius. But eccentric orbits have actual distances ranging from `a*(1-e)` to `a*(1+e)`.

**Mars example** (e=0.0934):
- Semi-major axis: a = 1.524 AU
- Perihelion: 1.381 AU
- Aphelion: 1.666 AU
- Range: 0.285 AU (42.6 million km)

If Mars is near perihelion (1.38 AU), the detector fires when you cross 1.524 AU - which is 0.14 AU (21M km) BEFORE you reach Mars. Ghost shows Mars's position at the wrong time.

**Mercury** (e=0.206) is even worse: range 0.307-0.467 AU.

**Evidence:** `evaluate-trajectory.js:246-256` already implements the correct multi-radius logic:
```javascript
if (targetE > 0.05 && targetE < 0.95) {
    targetRadii = [perihelion, targetA, aphelion];
}
```
But `intersectionDetector.js` doesn't. The `ECCENTRICITY_THRESHOLD = 0.05` constant at line 379 was clearly intended for this but never used.

### 3.2 BUG #2: Moon positions not converted to heliocentric (CRITICAL - Moons)

**Location:** `intersectionDetector.js:679`

**Problem:** `getPosition(body.elements, crossing.time)` for moons returns position relative to the parent body (e.g., Luna's position relative to Earth). But the result is stored in the intersection cache as if it were heliocentric.

**Impact:** Moon ghost positions are centered around the Sun's origin instead of their parent planet.

### 3.3 BUG #3: Renderer uses parent's CURRENT position for moon offset (CRITICAL - Moons)

**Location:** `renderer.js:1174-1181`

**Problem:** The renderer attempts to fix Bug #2 by adding the parent's position:
```javascript
renderX += parent.x;  // parent.x is position at CURRENT game time
renderY += parent.y;
renderZ += parent.z;
```
But `parent.x/y/z` are updated by `updateCelestialPositions()` at the CURRENT game time, not at the future crossing time. This creates a time mismatch.

**Impact:** Moon ghost = moon-at-crossing-time + parent-at-current-time. The parent could have moved significantly between now and crossing time.

### 3.4 BUG #4: Closest approach bodyPos uses linear interpolation (MEDIUM - All)

**Location:** `intersectionDetector.js:770-785`

**Problem:** `calculateClosestApproach()` returns `bodyPos` as linearly interpolated between segment endpoints: `bodyPos1 + s * (bodyPos2 - bodyPos1)`. This is an approximation. While accurate for ~2hr segments (~16km error), using `getPosition()` at the exact closest-approach time would be exact.

**Impact:** Small positional error per segment, but with consistent bias.

### 3.5 BUG #5: Intersection distance always stored as 0 (MINOR)

**Location:** `intersectionDetector.js:693`

**Problem:** `distance: 0` is hardcoded for all crossings. The actual ship-to-planet distance at crossing time is not computed, so the renderer can't show proximity indicators for intersection data.

## 4. Open Questions

- [x] Why does the renderer prefer closest approach over intersection data? → Because closest approach gives actual planet-to-ship distance, more useful for navigation
- [x] Does the closest approach cache always have results for planets? → Yes, `detectClosestApproaches` processes all non-moon bodies
- [x] Is `ECCENTRICITY_THRESHOLD` used anywhere? → No, defined but never referenced in detection code
