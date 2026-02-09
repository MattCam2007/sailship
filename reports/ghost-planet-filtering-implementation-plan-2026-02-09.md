# Ghost Planet Meaningful Filtering - Implementation Plan

**Date:** 2026-02-09
**Status:** Draft
**Spec:** `reports/ghost-planet-filtering-spec-2026-02-09.md`

## 0. File Impact Summary

### Files to EDIT:
1. `src/js/config.js` — Add GHOST_PLANET_CONFIG with angular separation thresholds
2. `src/js/lib/intersectionDetector.js` — Filter crossings by angular separation in detectIntersections()
3. `src/js/ui/renderer.js` — Add opacity scaling based on angular separation

### Files to CREATE:
- None

### Files to DELETE:
- None

## 1. Problem Statement

### 1.1 Description
Ghost planets appear for every trajectory-orbit radius crossing, including cases where the planet is far away (e.g., 0.95 AU / 57° angular separation). These distant ghosts are visual noise, not navigation aids.

### 1.2 Root Cause
No maximum angular separation filter exists in the detection or rendering pipeline. The system correctly computes angular separation but never uses it to suppress distant ghosts.

### 1.3 Constraints
- Must not break existing close-encounter ghost behavior
- Must not affect closest approach refinement logic in main.js
- Should degrade gracefully (fade, not pop in/out)
- Must be performant (filter is applied per crossing, not per frame)
- Threshold must be physically motivated for solar sailing

## 2. Solution Architecture

### 2.1 High-Level Design

Add a two-layer filtering system:

1. **Hard cutoff in detector**: Crossings with angular separation > max threshold are discarded before returning results. This avoids unnecessary computation downstream (closest approach refinement, caching).

2. **Opacity fade in renderer**: Ghosts with angular separation between fade-start and max-threshold have reduced opacity, creating a smooth visual transition instead of pop-in/out.

```
detectIntersections() → compute angular separation → FILTER HERE → return
                                                         |
                                                    discard if > 45°
                                                         |
renderer.drawIntersectionMarkers() → FADE HERE → draw ghost
                                         |
                                    opacity scales from 1.0 at 0°
                                    to 0.2 at 45°
```

### 2.2 Design Principles
- **Angular separation is scale-independent**: Works for all planets equally
- **Filter in detector, fade in renderer**: Separation of concerns
- **Configurable**: Threshold in config.js, easy to tune
- **Physically motivated**: 45° represents roughly the limit of orbital phasing adjustment with continuous low-thrust propulsion

### 2.3 Key Algorithm

**Opacity scaling formula:**
```javascript
// Linear fade from full opacity to min opacity over the fade range
const fadeStart = maxAngSep * 0.5;  // Start fading at 50% of threshold
const fadeRange = maxAngSep - fadeStart;
const opacity = angSep < fadeStart ? 1.0
    : 1.0 - 0.8 * ((angSep - fadeStart) / fadeRange);
// Clamp to [0.2, 1.0] — never fully invisible within threshold
```

For 45° max threshold:
- 0°-22.5°: Full opacity (1.0)
- 22.5°-45°: Fades from 1.0 to 0.2
- >45°: Not shown (filtered in detector)

## 3. Units of Work

### Unit 1: Add Configuration Constants
**Description:** Add GHOST_PLANET_CONFIG to config.js with angular separation thresholds.
**Files:** `src/js/config.js`
**Acceptance Criteria:**
- [ ] GHOST_PLANET_CONFIG exported with maxAngularSeparation (radians) and fadeStartFraction
- [ ] Default maxAngularSeparation = Math.PI / 4 (45°)
- [ ] Default fadeStartFraction = 0.5 (fade starts at 22.5°)
- [ ] JSDoc comments explain the values and their physical motivation
**Test Method:** Import config and verify values exist

### Unit 2: Add Angular Separation Filter to Detector
**Description:** Filter out crossings with angular separation exceeding the configured threshold in detectIntersections().
**Files:** `src/js/lib/intersectionDetector.js`
**Acceptance Criteria:**
- [ ] Import GHOST_PLANET_CONFIG from config.js
- [ ] After computing angularSeparation for each crossing, skip if > maxAngularSeparation
- [ ] Filter applied BEFORE pushing to bodyCrossings array
- [ ] Existing test suites still pass (crossing detection math unchanged)
**Test Method:** Run intersectionDetector.crossing.test.js; manually verify with Earth scenario from the bug report

### Unit 3: Add Opacity Scaling to Renderer
**Description:** Scale ghost planet opacity based on angular separation for smooth visual degradation.
**Files:** `src/js/ui/renderer.js`
**Acceptance Criteria:**
- [ ] Import GHOST_PLANET_CONFIG from config.js
- [ ] angularSeparation data flows to renderer (already in intersection data)
- [ ] Ghost opacity scales from 0.5 (base) at low angular sep to 0.1 at threshold
- [ ] Label opacity scales similarly
- [ ] Close encounters (within 2x SOI) are unaffected (always full opacity)
- [ ] Pulsing glow for close encounters unchanged
**Test Method:** Visual verification with various trajectory angles

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Threshold too aggressive (hides useful ghosts) | Medium | Medium | 45° is conservative; configurable if needed |
| Threshold too permissive (doesn't filter enough) | Low | Low | User's 57° case is filtered; can tune down later |
| Opacity fade causes visual artifacts | Low | Low | Minimum opacity of 0.2 keeps ghost visible but subdued |
| Breaks existing close encounter behavior | Low | High | Close encounters skip the fade entirely |
| Performance regression from config import | Very Low | Very Low | Config is a static import, negligible cost |

## 5. Testing Strategy

### 5.1 Unit Tests
- Run `intersectionDetector.crossing.test.js` — all existing tests pass
- Run `intersectionDetector.edge-cases.test.js` — no regressions

### 5.2 Integration Tests
- Verify ghost planets still appear for close encounters
- Verify the user's Earth scenario (crossing at ~57°) is now filtered out
- Verify ghosts near the threshold (30-45°) show with reduced opacity

### 5.3 Manual Verification
- Set destination to Earth from near-Earth orbit
- Adjust sail to cross Earth's orbit at various angles
- Confirm: <22.5° ghosts are bright, 22.5-45° ghosts fade, >45° ghosts absent
