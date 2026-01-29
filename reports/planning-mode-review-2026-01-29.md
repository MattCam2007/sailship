# Planning Mode Implementation Review

**Date:** 2026-01-29
**Status:** Review Complete
**Specification:** `reports/planning-mode-spec-2026-01-29.md`
**Implementation Plan:** `reports/planning-mode-implementation-plan-2026-01-29.md`

---

## Executive Summary

Four specialized reviewers analyzed the Planning Mode implementation plan:

| Reviewer | Confidence | Key Finding |
|----------|------------|-------------|
| **Physicist** | MEDIUM (65%) | Physics framework sound; deep copy and element epoch need verification |
| **Architect** | MEDIUM | Solid foundation but module interfaces and time authority unclear |
| **Functional Tester** | MEDIUM | Happy path defined; critical gaps in state isolation testing |
| **Failure Analyst** | MEDIUM (65%) | Ghost planet time filtering bug is critical blocker |

**Overall Confidence: MEDIUM (60-65%)**

The plan demonstrates solid understanding of existing systems and a sound approach to state isolation. However, several critical issues must be addressed before implementation.

---

## Critical Issues (Must Address)

### 1. Ghost Planet Time Filtering Bug (CRITICAL)

**Source:** Failure Analyst, Physicist

**Issue:** The intersection detection in `main.js` passes live game time (`getJulianDate()`) to filter out "past" crossings. In Planning Mode, if sandbox time is +100 days ahead but we pass live time, ALL trajectory points are filtered as "past" → **zero ghost planets displayed**.

**Current Code:**
```javascript
const currentTime = getJulianDate();  // ← LIVE GAME TIME
const intersections = detectIntersections(trajectory, celestialBodies, currentTime, soiBody);
```

**Fix Required:**
```javascript
const relevantTime = planningMode.isActive() ?
    planningMode.getSandboxTime() : getJulianDate();
const intersections = detectIntersections(trajectory, celestialBodies, relevantTime, soiBody);
```

**Risk if not fixed:** Core feature completely broken - no ghost planets in Planning Mode.

---

### 2. Deep Copy Implementation Not Specified (HIGH)

**Source:** All four reviewers

**Issue:** Plan calls for "deep copy" of game state but doesn't specify implementation. JavaScript object spread (`{...obj}`) creates shallow copies. Nested objects like `orbitalElements`, `sail`, `soiState` would share references.

**Leakage Example:**
```javascript
// WRONG (shallow)
snapshot.playerShip.orbitalElements = playerShip.orbitalElements;
snapshot.playerShip.orbitalElements.a = 2.0;  // Modifies BOTH!

// CORRECT (deep)
snapshot.playerShip.orbitalElements = structuredClone(playerShip.orbitalElements);
```

**Recommendation:** Use `structuredClone()` (modern browsers) or `JSON.parse(JSON.stringify())` for all nested objects.

---

### 3. Module Integration Not Defined (HIGH)

**Source:** Architect

**Issue:** Plan modifies 7 files but doesn't document import/export relationships or prove no circular dependencies exist.

**Unclear Points:**
- How does `main.js` call planning mode? `planningMode.update()`? `planningMode.getActive()`?
- Does `celestialBodies.updateCelestialPositions()` accept optional time parameter?
- What's the time authority protocol? Both `gameState.js` and `planningMode.js` manage time.

**Recommendation:** Create explicit module interface before implementation:
```javascript
// planningMode.js exports:
export function isActive() { }
export function getSandboxTime() { }
export function activatePlanning(snapshot) { }
export function deactivatePlanning() { }
export function setSandboxTimeOffset(days) { }
export function updatePlanningFrame() { }
```

---

### 4. No State Isolation Tests (HIGH)

**Source:** Functional Tester

**Issue:** No tests verify that Planning Mode changes don't leak back to Flight Mode.

**Required Tests:**
1. Snapshot creates independent copy (modify snapshot, verify original unchanged)
2. Round-trip test (snapshot → modify → restore → compare)
3. SOI state restoration verification
4. Camera state restoration verification

---

## High-Priority Concerns

### 5. SOI Coordinate Frame Mismatch (HIGH)

**Source:** Physicist, Failure Analyst

**Issue:** When ship is in planetary SOI, `orbitalElements` are planetocentric. If restore doesn't preserve coordinate frame context, ship teleports to wrong location.

**Scenario:**
- Player orbits Earth, opens Planning
- Snapshot captures planetocentric elements
- On restore, `getPosition()` returns Earth-relative position
- Renderer treats this as heliocentric → ship at wrong location

---

### 6. Time Authority Split (MEDIUM-HIGH)

**Source:** Architect

**Issue:** Both `gameState.js` (`julianDate`) and `planningMode.js` (`sandboxTime`) manage time. Need explicit protocol for which takes precedence.

**Recommendation:** Modify `updateCelestialPositions()` signature:
```javascript
export function updateCelestialPositions(overrideTime = null) {
    const jd = overrideTime ?? getJulianDate();
    // ... use jd
}
```

---

### 7. Hyperbolic Orbit Handling (MEDIUM-HIGH)

**Source:** Physicist, Failure Analyst

**Issue:** For hyperbolic orbits (e > 1), semi-major axis `a < 0`. Intersection detection uses `orbitalRadius = body.elements.a`, causing crossing logic to fail silently.

**Impact:** No ghost planets for escape trajectories.

---

### 8. Performance with Long Trajectories (MEDIUM)

**Source:** Failure Analyst, Functional Tester

**Issue:** 730-day trajectories may cause:
- Intersection detection timeout (>10ms limit)
- Cache thrashing with rapid slider movement
- No adaptive resolution scaling

**Recommendation:** Add debounce to slider (100ms) and scale trajectory steps with duration.

---

## Medium-Priority Concerns

### 9. Trajectory Truncation Not Displayed (MEDIUM)

**Source:** Failure Analyst

**Issue:** When trajectory predictor truncates due to numerical instability, it sets a `truncated` flag but renderer doesn't check it. Player sees partial trajectory without warning.

---

### 10. Moon Coordinate Transform (MEDIUM)

**Source:** Physicist, Failure Analyst

**Issue:** Plan says "moon transformation already handled" but doesn't verify it works with sandbox time. If moon elements are parent-relative, ghost planet detection may fail.

---

### 11. Element Epoch Mismatch (MEDIUM)

**Source:** Physicist

**Issue:** Trajectory uses snapshot ship elements, but ghost planets use live celestial body elements. Different epochs could cause inconsistencies over extended play sessions.

---

### 12. Regression Tests Missing (MEDIUM)

**Source:** Functional Tester

**Issue:** No tests verify Flight Mode still works correctly after Planning Mode changes. Game loop modification (Unit 4) could break normal time progression.

---

## Validated Aspects

All reviewers validated these positive aspects of the plan:

| Aspect | Validation |
|--------|------------|
| **Julian Date Arithmetic** | Correct - scalar addition for time offset |
| **getPosition() Function** | Pure function works for arbitrary times within 2-year window |
| **Trajectory Prediction Framework** | Sound physics approach with Gauss variational equations |
| **Snapshot Isolation Concept** | Deep copy approach is architecturally correct |
| **Code Reuse Strategy** | Excellent leverage of existing orbital.js, trajectory-predictor.js |
| **Modal UI Choice** | Provides clear separation from Flight mode |
| **Implementation Order** | Logical sequence (state → UI → integration → features) |
| **Drift Mode Physics** | Keplerian propagation without thrust is exact |
| **Happy Path Workflow** | Main use case (find launch window) is well-defined |

---

## Recommended Actions

### Before Implementation (Tier 1 - Blockers)

1. **Fix Ghost Planet Time Parameter**
   - Unit 9 must explicitly pass `sandboxJulianDate` to intersection detection
   - Add validation test: ghost planets visible at sandbox time

2. **Implement Deep Clone**
   - Document snapshot schema with deep-clone annotations
   - Use `structuredClone()` for all nested objects
   - Write round-trip integrity test

3. **Define Module Interface**
   - Create import/export diagram
   - Prove no circular dependencies
   - Document time authority protocol

4. **Modify updateCelestialPositions()**
   - Add optional `overrideTime` parameter
   - Test backwards compatibility

### During Implementation (Tier 2)

5. **Add State Isolation Tests**
   - Snapshot/restore round-trip
   - SOI state preservation
   - No reference sharing

6. **Add Regression Tests**
   - Flight mode time progression unchanged
   - Trajectory cache works in both modes

7. **Handle SOI Coordinate Frames**
   - Preserve frame context in snapshot
   - Verify position calculation after restore

8. **Debounce Slider Movement**
   - 100ms debounce to prevent cache thrashing
   - Loading indicator during recalculation

### Post-Implementation (Tier 3)

9. **Trajectory Truncation UI** - Show warning when incomplete
10. **Hyperbolic Orbit Handling** - Document limitation or implement fix
11. **Performance Optimization** - Adaptive resolution for long durations
12. **Moon Ghost Planets** - Verify coordinate transformation

---

## Test Requirements

### Unit Tests (Add to Plan)

```javascript
// planningMode.state.test.js
describe('Snapshot State Isolation', () => {
    it('creates independent copy of orbital elements', () => {
        const snapshot = createSnapshot();
        snapshot.playerShip.orbitalElements.a = 999;
        assert(getPlayerShip().orbitalElements.a !== 999);
    });

    it('round-trip preserves all values', () => {
        const original = deepClone(getGameState());
        const snapshot = createSnapshot();
        modifyGameState();
        restoreSnapshot(snapshot);
        assert.deepEqual(getGameState(), original);
    });
});
```

### Integration Tests (Add to Plan)

```javascript
// planningMode.integration.test.js
describe('Planning Mode Integration', () => {
    it('ghost planets visible at sandbox time', () => {
        enterPlanningMode();
        moveTimeSlider(100);
        const ghosts = getIntersectionMarkers();
        assert(ghosts.length > 0);
    });

    it('Flight mode unchanged after exit', () => {
        const before = deepClone(getGameState());
        enterPlanningMode();
        moveTimeSlider(200);
        exitPlanningMode();
        assert.deepEqual(getGameState(), before);
    });
});
```

---

## Risk Matrix Update

| Risk | Original | After Review | Notes |
|------|----------|--------------|-------|
| Ghost planet bugs | High | **CRITICAL** | Time filtering bug confirmed |
| State leakage | High | **HIGH** | Deep copy unspecified |
| Performance | Medium | Medium | Debounce needed |
| UI complexity | Medium | Low | Modal approach validated |
| Canvas rendering | Low | Low | Reuses existing functions |

---

## Conclusion

The Planning Mode implementation plan is **architecturally sound** but has **critical gaps** that must be addressed before implementation:

1. **Ghost planet time filtering** is a show-stopper bug waiting to happen
2. **Deep copy implementation** is essential but unspecified
3. **Module interfaces** need explicit definition
4. **Test coverage** for state isolation is missing

**Recommendation:** Address Tier 1 issues (especially #1 and #2) before starting implementation. The physics framework and code reuse strategy are solid foundations to build upon.

**Path to HIGH Confidence:**
- Implement explicit deep clone with tests
- Fix intersection detection time parameter
- Add state isolation test suite
- Document module interfaces

---

## Appendix: Reviewer Details

### Physicist Review Summary
- Validated: Julian date arithmetic, getPosition() accuracy, drift mode physics
- Concerns: Deep copy, element epoch mismatch, moon transforms
- Confidence: MEDIUM (65%)

### Architect Review Summary
- Validated: Snapshot isolation pattern, code reuse, modal UI
- Concerns: Module integration unclear, time authority split, 7-file integration risk
- Confidence: MEDIUM

### Functional Tester Review Summary
- Validated: Physics tests comprehensive, happy path defined
- Concerns: No state isolation tests, vague acceptance criteria, missing integration tests
- Confidence: MEDIUM

### Failure Analyst Review Summary
- Validated: Architecture sound for spike
- Concerns: Critical time filtering bug, hyperbolic orbits, performance
- Confidence: MEDIUM (65%)
