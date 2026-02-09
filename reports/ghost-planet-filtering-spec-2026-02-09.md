# Ghost Planet Meaningful Filtering Specification

**Date:** 2026-02-09
**Phase:** Discovery

## 1. Executive Summary

Ghost planets (encounter markers) currently appear whenever the predicted trajectory crosses a planet's orbital radius, regardless of how far the planet actually is from the crossing point. This produces misleading markers — a ghost Earth at 0.95 AU distance is visual noise, not a navigation aid. We need guardrails to ensure only "meaningful" ghosts are displayed.

## 1.1 Estimated File Impact

### Files to EDIT:
- `src/js/lib/intersectionDetector.js` — Add angular separation filtering to `detectIntersections()`
- `src/js/ui/renderer.js` — Add opacity scaling based on angular separation
- `src/js/config.js` — Add configurable threshold constant

### Files to CREATE:
- None

## 2. Current State Analysis

### 2.1 Existing Systems

| System | Location | Purpose |
|--------|----------|---------|
| Intersection Detector | `src/js/lib/intersectionDetector.js` | Finds radius crossings, computes angular separation |
| Closest Approach | `src/js/lib/intersectionDetector.js` | Finds minimum ship-to-planet distance |
| Ghost Rendering | `src/js/ui/renderer.js:1123-1270` | Draws ghost planets with labels, CLOSE indicator |
| CA Refinement | `src/js/main.js:216-246` | Replaces crossing with closest approach when within 10x SOI |
| Config | `src/js/config.js` | SOI_RADII, display options, intersection config |

### 2.2 Data Flow

```
detectIntersections() → intersections with angular separation
    ↓
main.js closest approach refinement (only within 10x SOI)
    ↓
setIntersectionCache() → cached with hash
    ↓
renderer.drawIntersectionMarkers() → filters by destination, draws all
```

### 2.3 Current Filtering Layers

1. **Pre-filter**: Bodies outside trajectory radial range are skipped
2. **Deduplication**: Multi-radius crossings merged into one per transit
3. **Destination filter** (renderer): Only show ghosts for current destination
4. **Finite check** (renderer): Skip non-finite distances
5. **Category filter** (renderer): Respect body category toggles

**MISSING**: No filter based on angular separation or absolute distance. A ghost at 0.95 AU from the planet is shown identically to one at 0.001 AU.

### 2.4 Angular Separation Already Computed

The detection algorithm already computes `angularSeparation` (radians) and `isAhead` for every crossing at `intersectionDetector.js:874-895`. This data flows to the renderer and is used for the EARLY/LATE label. But it is never used as a filter criterion.

## 3. Gap Analysis

### 3.1 Problem Scenario

Player is near Earth's orbit, plotting a trajectory that crosses 1 AU. Earth is on the other side of its orbit (~0.95 AU away, ~57° angular separation). A ghost planet appears at Earth's position, showing "EARTH +XXd [0.95 AU] LATE 57°". While technically correct, this ghost is:

- Not actionable (can't steer to intercept from 57° away with a solar sail)
- Visual noise that obscures more useful information
- Confusing (player expects ghost = viable intercept opportunity)

### 3.2 Missing Capabilities

- [ ] Maximum angular separation threshold to suppress distant ghosts
- [ ] Visual fade for ghosts near the threshold (graceful degradation)
- [ ] Configurable threshold in config.js

### 3.3 Required Changes

- [ ] Add `GHOST_PLANET_CONFIG` to config.js with max angular separation
- [ ] Filter crossings in detectIntersections after angular separation computation
- [ ] Add opacity scaling in renderer based on angular separation

## 4. Open Questions

- [x] What angular separation threshold? → Analysis below suggests 45° as default
- [x] Should the filter be in the detector or renderer? → Detector (avoid unnecessary computation)
- [x] Should there be opacity fading? → Yes, graceful degradation is better than hard cutoff
- [x] Should the threshold be different per planet? → No, angular separation is already scale-independent

## 5. Threshold Analysis

### Why Angular Separation (Not Distance)?

Distance in AU varies wildly by planet. 0.1 AU is a near-miss for Mercury but effectively nothing for Jupiter. Angular separation is dimensionless and represents the same navigational challenge at any orbital radius: "how much do I need to adjust my orbital phasing?"

### Practical Thresholds

| Threshold | Earth (a=1 AU) Distance | Mars (a=1.52 AU) Distance | Navigational Meaning |
|-----------|------------------------|--------------------------|---------------------|
| 15° | 0.26 AU | 0.40 AU | Fine-tuning range, highly actionable |
| 30° | 0.52 AU | 0.79 AU | Moderate adjustment, still useful |
| 45° | 0.76 AU | 1.16 AU | Major course change needed |
| 60° | 1.00 AU | 1.52 AU | ~1/6 of orbit, marginal utility |
| 90° | 1.41 AU | 2.15 AU | Quarter orbit, not useful |

### Recommended: 45° Default

- Covers meaningful planning range for solar sails
- The user's 0.95 AU / ~57° case would be filtered out
- Phase differences up to ~45° can potentially be addressed by adjusting sail settings over time
- Beyond 45°, the planet is essentially "on the wrong side" of its orbit
