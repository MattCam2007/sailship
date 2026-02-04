# Crossing-Aware Course Solver Implementation Plan

**Date:** 2026-02-04
**Status:** In Progress

---

## 0. File Impact Summary

### Files to EDIT:
1. `src/js/lib/course-solver.js` - Replace global minimum with crossing-based evaluation

### Files to CREATE:
1. `src/js/lib/course-solver.test.js` - Test suite for crossing-aware solver (if not exists, extend)

### Files to DELETE:
- None

---

## 1. Problem Statement

### 1.1 Description
The course solver optimizes for **global closest approach** to the target planet, but ghost planets show **where the planet will be at each orbital crossing**. This mismatch causes the solver to target the wrong ghost.

### 1.2 Root Cause
In `evaluateCandidate()`, the code tracks:
```javascript
if (dist < minDistance) {
    minDistance = dist;
    minDistanceTime = i * timeStep;
}
```
This finds the global minimum distance at any time, not the distance at orbital crossing times.

### 1.3 Constraints
- Must maintain performance (< 90 second total solve time)
- Must be backward compatible (existing UI still works)
- Cannot break existing intersection detection system

---

## 2. Solution Architecture

### 2.1 High-Level Design

Replace the evaluation metric from:
```
CURRENT: min(distance_to_planet) for all t ∈ [0, maxDays]
```

To:
```
NEW: min(distance_at_crossing) for each orbital radius crossing
     + phase_constraint: angular_separation < MAX_PHASE_ANGLE
```

### 2.2 Design Principles

1. **Crossing Detection in Solver**: Reuse the radius-crossing logic from intersectionDetector
2. **Phase Constraint**: At each crossing, compute angular separation between ship and planet
3. **Best Crossing Selection**: Track the best crossing (lowest distance + passing phase constraint)
4. **Fallback**: If no crossings found, fall back to global minimum (for edge cases)

### 2.3 Key Algorithm

```javascript
function evaluateCandidateCrossingAware(yawDeg, pitchDeg, ship, target, options) {
    // 1. Simulate trajectory (same as before)
    const trajectory = simulateTrajectory(ship, yaw, pitch, maxDays, steps);

    // 2. Detect orbital radius crossings
    const targetRadius = target.elements.a;  // Semi-major axis
    const crossings = findAllRadiusCrossings(trajectory, targetRadius);

    // 3. For each crossing, evaluate intercept quality
    let bestCrossing = null;
    for (const crossing of crossings) {
        // Get planet position at crossing time
        const planetPos = getPosition(target.elements, crossing.time);

        // Calculate distance at crossing
        const distance = dist3D(crossing.position, planetPos);

        // Calculate angular separation (phase constraint)
        const angularSep = calculateAngularSeparation(crossing.position, planetPos);

        // Apply phase constraint: reject if planet is too far angularly
        if (angularSep > MAX_PHASE_ANGLE) {
            continue;  // Skip this crossing
        }

        // Track best crossing
        if (!bestCrossing || distance < bestCrossing.distance) {
            bestCrossing = { crossing, distance, angularSep, planetPos };
        }
    }

    // 4. Return result based on best crossing
    if (bestCrossing) {
        return {
            minDistance: bestCrossing.distance,
            timeToClosest: bestCrossing.crossing.time - startTime,
            crossingIndex: bestCrossing.index,
            angularSeparation: bestCrossing.angularSep,
            // ... other fields
        };
    }

    // Fallback: no valid crossings
    return { minDistance: Infinity, status: 'NO_CROSSING' };
}
```

### 2.4 Phase Constraint Formula

Angular separation between two points P1 and P2 from origin:
```
θ = arccos( (P1 · P2) / (|P1| × |P2|) )
```

Where:
- P1 = ship position at crossing (on the orbital radius shell)
- P2 = planet position at crossing time
- θ = angular separation (in radians)

**Constraint**: θ < 30° (0.52 radians) for valid intercept candidate

This ensures the planet is actually "nearby" when we cross its orbital radius, not on the opposite side of the orbit.

---

## 3. Units of Work

### Unit 1: Add Crossing Detection to Course Solver

**Description:** Add helper functions to detect orbital radius crossings within a simulated trajectory.

**Files:** `src/js/lib/course-solver.js`

**Changes:**
- Add `findRadiusCrossingsInTrajectory(trajectory, targetRadius)` function
- Reuse logic from intersectionDetector's `findRadiusCrossing()`

**Acceptance Criteria:**
- [ ] Function detects all radius crossings in a trajectory array
- [ ] Returns array of {index, time, position} for each crossing
- [ ] Handles edge cases (no crossings, single crossing, multiple crossings)

**Test Method:** Console test with known trajectory

---

### Unit 2: Add Angular Separation Calculator

**Description:** Add function to compute angular separation between two 3D positions.

**Files:** `src/js/lib/course-solver.js`

**Changes:**
- Add `calculateAngularSeparation(pos1, pos2)` function
- Returns angle in radians

**Acceptance Criteria:**
- [ ] Returns 0 for identical positions
- [ ] Returns π for opposite positions
- [ ] Handles edge cases (zero vectors)

**Test Method:** Unit test with known vectors

---

### Unit 3: Create Crossing-Aware Evaluation Function

**Description:** Create new `evaluateCandidateCrossingAware()` that uses crossings instead of global minimum.

**Files:** `src/js/lib/course-solver.js`

**Changes:**
- Add new evaluation function alongside existing one
- Integrate crossing detection and phase constraint
- Add CONFIG options for MAX_PHASE_ANGLE

**Acceptance Criteria:**
- [ ] Evaluates candidates based on crossing distance, not global minimum
- [ ] Applies phase constraint to filter poor crossings
- [ ] Returns crossing metadata (index, angular separation)
- [ ] Falls back gracefully when no crossings exist

**Test Method:** Compare results with old evaluator on known cases

---

### Unit 4: Integrate into Search Pipeline

**Description:** Wire the new evaluator into the coarse/fine/ultra search phases.

**Files:** `src/js/lib/course-solver.js`

**Changes:**
- Update `coarseSweep()` to use crossing-aware evaluator
- Update `fineSearch()` to use crossing-aware evaluator
- Update `ultraFinePolish()` to use crossing-aware evaluator
- Update `gradientDescentPolish()` to use crossing-aware evaluator

**Acceptance Criteria:**
- [ ] All search phases use crossing-aware evaluation
- [ ] Results include crossing index and angular separation
- [ ] Performance remains acceptable (< 90 seconds)

**Test Method:** Full course solve with timing

---

### Unit 5: Update Solution Output

**Description:** Update the solution object to include crossing-specific information.

**Files:** `src/js/lib/course-solver.js`

**Changes:**
- Add `crossingIndex`, `angularSeparationDeg` to solution object
- Update `buildSolution()` to include new fields
- Update status determination to account for phase constraint

**Acceptance Criteria:**
- [ ] Solution includes which crossing is targeted
- [ ] Solution includes angular separation at that crossing
- [ ] UI can display this information

**Test Method:** Verify solution object structure

---

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| No crossings found for some targets | Medium | High | Fallback to global minimum |
| Performance regression | Low | Medium | Reuse efficient crossing detection |
| Phase constraint too strict | Medium | Medium | Make MAX_PHASE_ANGLE configurable |
| Breaking existing functionality | Low | High | Keep old evaluator as fallback |

---

## 5. Testing Strategy

### 5.1 Unit Tests
- `findRadiusCrossingsInTrajectory()` with synthetic trajectories
- `calculateAngularSeparation()` with known vectors
- `evaluateCandidateCrossingAware()` comparison with old behavior

### 5.2 Integration Tests
- Full `solveCourse()` targeting Venus, Mars, Mercury
- Verify crossing index matches displayed ghost planet

### 5.3 Manual Verification
- Plot course to Venus, verify solution targets visible ghost
- Adjust trajectory duration, verify correct crossing selected
- Test with multiple crossings (outbound + inbound)
