# Ghost Planet Placement Fix - Implementation Plan

**Date:** 2026-02-06
**Status:** Approved

## 0. File Impact Summary

### Files to EDIT:
1. `src/js/lib/intersectionDetector.js` - Fix crossing detection, moon positions, closest approach accuracy
2. `src/js/ui/renderer.js` - Fix moon ghost rendering coordinate transform

### Files to CREATE:
- None (pure bug fixes in existing files)

### Files to DELETE:
- None

## 1. Problem Statement

### 1.1 Description
Ghost planets (encounter markers) show at wrong positions, making the primary navigation tool unreliable for trajectory planning and interception.

### 1.2 Root Causes
1. Crossing detection only checks semi-major axis radius, ignoring orbital eccentricity
2. Moon positions computed in parent-relative frame, stored as heliocentric
3. Moon ghost rendering adds parent's current-time position instead of crossing-time position
4. Closest approach body position uses linear interpolation instead of exact orbital calculation

### 1.3 Constraints
- No build system: changes must work directly in browser
- Performance: intersection detection runs every frame, must stay under 16ms
- Cache synchronization: changes must not break trajectory hash coupling
- Backward compatibility: existing intersection test suites must pass

## 2. Solution Architecture

### 2.1 High-Level Design
Fix each bug at its source with minimal code changes. Mirror the multi-radius approach already proven in `evaluate-trajectory.js`.

### 2.2 Key Algorithm Change
For `findOrbitalPlaneCrossing`, check crossings at multiple radii for eccentric orbits:
- e > 0.05: check perihelion, semi-major axis, aphelion
- e <= 0.05: check semi-major axis only (circular enough)

This matches the existing logic in `evaluate-trajectory.js:246-256`.

## 3. Units of Work

### Unit 1: Fix crossing detection for eccentric orbits
**Description:** Modify `findOrbitalPlaneCrossing` to check perihelion/aphelion crossings for eccentric bodies
**Files:** `src/js/lib/intersectionDetector.js`
**Acceptance Criteria:**
- Mars crossings detected at perihelion (1.381 AU) and aphelion (1.666 AU) in addition to a (1.524 AU)
- Mercury crossings detected at all three radii
- Existing tests still pass
**Test Method:** Console tests: `intersectionDetector.crossing.test.js`

### Unit 2: Fix moon position calculation in detector
**Description:** Convert moon positions to heliocentric in `detectIntersections`
**Files:** `src/js/lib/intersectionDetector.js`
**Acceptance Criteria:**
- Moon ghost positions include parent's position at crossing time (not current time)
- `getPosition(parent.elements, crossing.time)` used for parent offset
**Test Method:** Manual verification with Luna/Phobos encounter markers

### Unit 3: Fix moon ghost rendering in renderer
**Description:** Remove incorrect parent offset in renderer (now handled in detector)
**Files:** `src/js/ui/renderer.js`
**Acceptance Criteria:**
- Moon ghosts render at correct heliocentric position
- No double-offset of parent position
**Test Method:** Manual verification

### Unit 4: Fix closest approach bodyPos accuracy
**Description:** Use `getPosition()` at exact closest-approach time instead of linear interpolation
**Files:** `src/js/lib/intersectionDetector.js`
**Acceptance Criteria:**
- `bodyPos` in closest approach results computed with `getPosition(body.elements, exactTime)`
- No change to distance calculation (still uses segment analysis for FINDING the minimum)
**Test Method:** Console tests

### Unit 5: Compute actual distance for intersection events
**Description:** Calculate ship-to-planet distance at crossing time instead of hardcoding 0
**Files:** `src/js/lib/intersectionDetector.js`
**Acceptance Criteria:**
- `distance` field contains actual 3D distance from trajectory crossing point to planet position
- Used by renderer for proximity indicators
**Test Method:** Console tests

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Multiple radii causing duplicate ghosts | Medium | Low | Use same dedup logic (crossingTimes Set) |
| Performance regression from extra crossing checks | Low | Low | Only adds 2 extra checks per eccentric body per segment |
| Breaking existing intersection tests | Medium | High | Run all test suites after each unit |
| Moon coordinate double-offset | Medium | High | Units 2 and 3 must be deployed together |

## 5. Testing Strategy

### 5.1 Console Tests
```javascript
import('/js/lib/intersectionDetector.crossing.test.js').then(m => m.runAllTests())
import('/js/lib/intersectionDetector.edge-cases.test.js').then(m => m.runAllTests())
import('/js/lib/intersectionDetector.test.js').then(m => m.runAllTests())
```

### 5.2 Manual Verification
- Set destination to Mars, verify ghost appears near Mars's actual future position
- Check Mercury ghost positions (highest eccentricity planet)
- Enable moon display, check Luna ghost positions relative to Earth
