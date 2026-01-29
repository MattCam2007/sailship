# Predictive Trajectory Display - Implementation Plan

## Overview

This plan breaks the feature into small, independently testable units. Each unit has:
- Single responsibility
- Clear inputs/outputs
- Explicit success criteria
- Test approach

---

## Sprint Structure

### Phase 1: Core Propagation Engine
Build the trajectory prediction calculation, separate from rendering.

### Phase 2: Display Toggle Infrastructure
Add UI controls following existing patterns.

### Phase 3: Rendering Integration
Draw the predicted trajectory on canvas.

### Phase 4: Edge Cases & Polish
Handle SOI transitions, zero thrust, hyperbolic escapes.

---

## Unit Breakdown

### Unit 1: Trajectory Propagator Function

**File:** `src/js/lib/trajectory-predictor.js` (new)

**Responsibility:** Given ship state and sail configuration, compute an array of future positions accounting for continuous thrust.

**Inputs:**
```javascript
{
    orbitalElements: {...},  // Starting Keplerian elements
    sail: {...},             // Sail configuration (angle, area, etc.)
    mass: number,            // Ship mass in kg
    startTime: number,       // Julian date to start from
    duration: number,        // Days to predict ahead
    steps: number,           // Number of position samples
    μ: number                // Gravitational parameter
}
```

**Outputs:**
```javascript
[
    { x, y, z, time },  // Position at t0
    { x, y, z, time },  // Position at t0 + dt
    ...                 // etc.
]
```

**Success Criteria:**
1. Returns array of length `steps`
2. First position matches current ship position (within tolerance)
3. With zero thrust (deployment 0%), output matches unperturbed Keplerian path
4. With thrust, output diverges from Keplerian path as expected
5. No NaN/Infinity values in output
6. Performance: < 5ms for 200 steps

**Test Approach:**
- Unit test: Zero thrust → compare to `getPosition()` at each time
- Unit test: Known thrust scenario → verify acceleration direction
- Unit test: Large eccentricity → no numerical blowup
- Unit test: Hyperbolic orbit → handles correctly

**Dependencies:** None (uses existing orbital.js, orbital-maneuvers.js)

---

### Unit 2: Trajectory Cache Manager

**File:** `src/js/lib/trajectory-predictor.js` (same file)

**Responsibility:** Cache predicted trajectory to avoid recalculating every frame. Invalidate when inputs change.

**Inputs:**
- Ship orbital elements
- Sail configuration
- Current time

**Outputs:**
- Cached trajectory array
- Cache hit/miss status

**Success Criteria:**
1. Cache hit when inputs unchanged → returns cached result in < 0.1ms
2. Cache miss when sail angle changes → recalculates
3. Cache miss when orbital elements change significantly → recalculates
4. Cache invalidates after configurable TTL (default 100ms)
5. Cache invalidates immediately on major state change

**Test Approach:**
- Unit test: Call twice with same inputs → second call uses cache
- Unit test: Change sail angle → cache invalidated
- Unit test: Wait > TTL → cache invalidated

**Dependencies:** Unit 1

---

### Unit 3: Display Option - Config & State

**File:** `src/js/config.js` (modify)

**Responsibility:** Add `showPredictedTrajectory` to default display options.

**Changes:**
```javascript
export const DEFAULT_DISPLAY_OPTIONS = {
    showOrbits: true,
    showLabels: true,
    showTrajectory: true,
    showGrid: true,
    showPredictedTrajectory: true,  // NEW
};
```

**Success Criteria:**
1. `DEFAULT_DISPLAY_OPTIONS.showPredictedTrajectory` exists and is `true`
2. `displayOptions` in gameState includes the new option
3. No existing options affected

**Test Approach:**
- Manual verification in console: `displayOptions.showPredictedTrajectory === true`

**Dependencies:** None

---

### Unit 4: Display Option - HTML Checkbox

**File:** `src/index.html` (modify)

**Responsibility:** Add checkbox UI for the new toggle.

**Changes:**
```html
<label>
    <input type="checkbox" id="showPredictedTrajectory" checked> PREDICTED PATH
</label>
```

**Success Criteria:**
1. Checkbox appears in Display Options panel
2. Default state is checked
3. Styled consistently with other checkboxes
4. Label is clear and concise

**Test Approach:**
- Visual inspection in browser
- Checkbox toggles on click

**Dependencies:** None

---

### Unit 5: Display Option - Event Wiring

**File:** `src/js/ui/controls.js` (modify)

**Responsibility:** Connect checkbox to display option state.

**Changes:**
```javascript
function initDisplayOptions() {
    const options = {
        'showOrbits': 'showOrbits',
        'showLabels': 'showLabels',
        'showTrajectory': 'showTrajectory',
        'showGrid': 'showGrid',
        'showPredictedTrajectory': 'showPredictedTrajectory',  // NEW
    };
    // ... rest unchanged
}
```

**Success Criteria:**
1. Checking/unchecking updates `displayOptions.showPredictedTrajectory`
2. No errors in console
3. Other toggles unaffected

**Test Approach:**
- Toggle checkbox → verify `displayOptions.showPredictedTrajectory` in console

**Dependencies:** Unit 3, Unit 4

---

### Unit 6: Renderer - Trajectory Drawing Function

**File:** `src/js/ui/renderer.js` (modify)

**Responsibility:** Draw the predicted trajectory as a spiral path on canvas.

**Function:**
```javascript
function drawPredictedTrajectory(ship, centerX, centerY, scale) {
    if (!displayOptions.showPredictedTrajectory) return;
    if (!displayOptions.showOrbits) return;  // Respect parent toggle

    const trajectory = getPredictedTrajectory(ship);  // From cache/compute
    if (!trajectory || trajectory.length < 2) return;

    // Draw connected line segments with gradient fade
    // Style: magenta/purple, solid line, fading alpha toward end
}
```

**Success Criteria:**
1. Early return when toggle is off
2. Early return when `showOrbits` is off (parent toggle)
3. Draws line connecting predicted positions
4. Visually distinct from Keplerian orbit (different color, solid vs dashed)
5. Handles SOI context (relative to parent body when in SOI)
6. Performance: < 1ms to draw

**Test Approach:**
- Visual inspection: toggle on/off
- Visual inspection: distinct from green orbit
- Visual inspection: spiral shape when thrust active

**Dependencies:** Unit 1, Unit 2, Unit 5

---

### Unit 7: Renderer - Integration into Render Loop

**File:** `src/js/ui/renderer.js` (modify)

**Responsibility:** Call `drawPredictedTrajectory` at the right place in render order.

**Changes:**
```javascript
function render() {
    // ... existing code ...

    // Draw orbits (existing)
    if (displayOptions.showOrbits) {
        celestialBodies.forEach(body => drawOrbit(body, ...));
        ships.forEach(ship => drawShipOrbit(ship, ...));
    }

    // Draw predicted trajectory (NEW - after orbits, before bodies)
    const player = getPlayerShip();
    if (player) {
        drawPredictedTrajectory(player, centerX, centerY, scale);
    }

    // Draw flight path (existing)
    drawFlightPath(centerX, centerY, scale);

    // ... rest unchanged ...
}
```

**Success Criteria:**
1. Predicted trajectory renders at correct z-order (behind bodies, on top of orbits)
2. Only renders for player ship (not NPCs)
3. No visual interference with existing elements
4. No performance regression in render loop

**Test Approach:**
- Visual inspection: trajectory visible
- Visual inspection: bodies render on top
- FPS monitoring: no drop

**Dependencies:** Unit 6

---

### Unit 8: Zero Thrust Behavior

**File:** `src/js/lib/trajectory-predictor.js`

**Responsibility:** When thrust is zero, predicted trajectory should match Keplerian orbit exactly.

**Success Criteria:**
1. With `sail.deploymentPercent = 0`, predicted positions match `getPosition()` calls
2. Visually, the predicted trajectory overlaps the Keplerian ellipse
3. No unnecessary computation when thrust is zero

**Test Approach:**
- Unit test: Zero deployment → positions within 1e-10 AU of Keplerian
- Optimization check: early exit when no effective thrust

**Dependencies:** Unit 1

---

### Unit 9: SOI-Aware Propagation

**File:** `src/js/lib/trajectory-predictor.js`

**Responsibility:** When ship is in a planetary SOI, compute trajectory relative to that body. Handle SOI exit during prediction.

**Success Criteria:**
1. When in SOI, trajectory is planetocentric (relative to parent body)
2. If trajectory crosses SOI boundary during prediction, frame conversion happens
3. Visual trajectory is correct (heliocentric rendering handles offset)

**Test Approach:**
- Manual test: Start in Earth SOI, verify trajectory relative to Earth
- Manual test: Hyperbolic escape, verify trajectory extends beyond SOI

**Dependencies:** Unit 1

---

### Unit 10: Hyperbolic Trajectory Rendering

**File:** `src/js/ui/renderer.js`

**Responsibility:** Handle rendering when predicted trajectory goes hyperbolic (escape).

**Success Criteria:**
1. Hyperbolic trajectories render without errors
2. Maximum render distance enforced (don't draw to infinity)
3. Visual indication of escape trajectory (optional: color shift)

**Test Approach:**
- Manual test: Set sail for escape trajectory, verify rendering

**Dependencies:** Unit 6, Unit 9

---

### Unit 11: Trajectory Styling Polish

**File:** `src/js/ui/renderer.js`

**Responsibility:** Final visual polish for the trajectory display.

**Visual Design:**
- Color: Magenta/Purple gradient `rgba(200, 100, 255, 0.8)` → `rgba(200, 100, 255, 0.2)`
- Line: Solid (not dashed) to distinguish from Keplerian
- Width: 2px, tapering to 1px at end
- Alpha fade: 100% at start → 20% at end

**Success Criteria:**
1. Clearly distinguishable from Keplerian orbit at a glance
2. Fade indicates direction of time
3. Aesthetically fits the existing UI style

**Test Approach:**
- Visual inspection
- User feedback

**Dependencies:** Unit 6

---

## Dependency Graph

```
Unit 1 (Propagator)
    ↓
Unit 2 (Cache)
    ↓
    ├── Unit 8 (Zero Thrust) ← Unit 1
    ├── Unit 9 (SOI Aware) ← Unit 1
    ↓
Unit 3 (Config) ─────────────────────┐
Unit 4 (HTML) ───────────────────────┤
    ↓                                │
Unit 5 (Event Wiring) ← Unit 3,4     │
    ↓                                │
Unit 6 (Draw Function) ← Unit 1,2,5  │
    ↓                                │
Unit 7 (Render Loop) ← Unit 6        │
    ↓                                │
Unit 10 (Hyperbolic) ← Unit 6,9      │
    ↓                                │
Unit 11 (Styling) ← Unit 6           │
```

---

## Sprint Schedule

### Sprint 1: Foundation (Units 1-2)
- Core propagation logic
- Caching infrastructure
- All unit tests passing

### Sprint 2: UI Toggle (Units 3-5)
- Config changes
- HTML checkbox
- Event wiring
- Toggle functional in browser

### Sprint 3: Rendering (Units 6-7)
- Drawing function
- Render loop integration
- Basic trajectory visible

### Sprint 4: Edge Cases (Units 8-10)
- Zero thrust behavior
- SOI awareness
- Hyperbolic handling

### Sprint 5: Polish (Unit 11)
- Visual styling
- Performance optimization
- Final testing

---

## Success Metrics

### Functional
- [ ] Predicted trajectory displays when toggle is on
- [ ] Toggle works independently from Keplerian orbit toggle
- [ ] Keplerian orbit display unchanged when predicted trajectory off
- [ ] Zero thrust shows trajectory matching Keplerian orbit
- [ ] Thrust active shows diverging spiral trajectory

### Visual
- [ ] Clearly distinguishable colors (green orbit vs magenta trajectory)
- [ ] No z-fighting or visual artifacts
- [ ] Smooth line rendering

### Performance
- [ ] 60 FPS maintained with both displays active
- [ ] Propagation calculation < 5ms
- [ ] Rendering < 1ms per frame

### Non-regression
- [ ] Existing Keplerian orbit display unchanged
- [ ] All existing display toggles work
- [ ] No new console errors

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Performance degradation | Medium | High | Cache aggressively, reduce step count |
| Visual clutter | Low | Medium | Ensure distinct styling, allow toggle |
| SOI transition bugs | Medium | Medium | Test thoroughly at SOI boundaries |
| Numerical instability | Low | High | Use existing battle-tested propagation code |

---

## Review Checklist (Pre-Implementation)

- [ ] Architecture review complete
- [ ] Physics review complete
- [ ] Performance review complete
- [ ] Testability review complete
- [ ] UX review complete

---

**Planning Phase Complete**

---

# Specialist Reviews

## 1. Architecture Review

### Is This the Right Approach?

**Yes.** The plan correctly:
- Creates a separate module (`trajectory-predictor.js`) for the propagation logic
- Reuses existing patterns from `navigation.js` rather than reinventing
- Follows the established display toggle pattern exactly
- Keeps the new feature isolated from existing Keplerian orbit code

### Simpler Alternatives Considered

| Alternative | Pros | Cons | Decision |
|-------------|------|------|----------|
| Reuse `predictClosestApproach()` directly | No new code | Returns scalar, not path; coupled to destination | Rejected |
| Add to existing `navigation.js` | Less files | Module too large already; different concern | Rejected |
| Render from Gauss equation deltas | Theoretically elegant | Existing code uses state-vector approach | Rejected |

**Conclusion:** The proposed approach is the right level of complexity.

### Codebase Pattern Fit

The plan correctly mirrors:
- Cache pattern from `navigation.js` (TTL-based, invalidate on change)
- Display toggle pattern from `config.js` / `controls.js`
- Rendering pattern from `renderer.js` (early return, display flag check)
- Thrust calculation from `orbital-maneuvers.js`

### Risks Identified

1. **Low Risk:** New file (`trajectory-predictor.js`) adds maintenance surface
   - Mitigation: Keep module small, well-documented

2. **Low Risk:** Duplicate propagation logic vs. `navigation.js`
   - Mitigation: Different use case (path visualization vs. closest approach); acceptable duplication

### Toggle Integration Assessment

The proposed toggle fits naturally:
- Uses exact same pattern as `showTrajectory` (flight path)
- No need for sub-menus or complex UI
- Parent toggle (`showOrbits`) relationship is logical

### Architecture Verdict: ✅ APPROVED

---

## 2. Physics Review

### Orbital Mechanics Correctness

The propagation approach is correct:
1. Uses existing `getPosition()` / `getVelocity()` which are well-tested
2. Uses existing `calculateSailThrust()` which implements solar sail physics correctly
3. Uses existing `applyThrust()` with state-vector approach (position continuity guaranteed)

The chain: `elements → position/velocity → thrust → ΔV → new elements` is physically correct.

### Edge Cases Analysis

| Edge Case | Risk | Handling Strategy |
|-----------|------|-------------------|
| **e = 0 (circular orbit)** | Low | Works normally; Kepler solver handles |
| **e → 1 (parabolic)** | Medium | Existing code has tolerance; monitor |
| **e > 1 (hyperbolic)** | Medium | Existing `solveKeplerHyperbolic()` handles |
| **e > 50 (extreme hyperbolic)** | Low | Linear fallback exists in shipPhysics |
| **Zero thrust** | Low | Early exit, positions match Keplerian |
| **SOI boundary crossing** | Medium | Need to detect and handle frame change |
| **Inside planetary SOI** | Medium | Must use planetocentric frame |
| **Escape velocity achieved** | Low | Just results in hyperbolic path |

### SOI Transition Handling

**Current plan has a gap:** Unit 9 mentions SOI awareness but doesn't detail the algorithm.

**Recommended approach:**
1. During propagation, check if predicted position crosses SOI boundary
2. If entering SOI: convert heliocentric elements to planetocentric
3. If exiting SOI: convert planetocentric elements to heliocentric
4. Use existing `stateToElements()` for conversions

**Simplification option:** For v1, don't predict through SOI transitions. Stop prediction at SOI boundary with visual indicator. This is acceptable because:
- User is likely interested in short-term trajectory anyway
- SOI crossings are significant events deserving attention
- Reduces complexity substantially

### Zero Thrust Behavior

When `deploymentPercent = 0` or sail area is zero:
- `calculateSailThrust()` returns zero vector
- `applyThrust()` returns elements unchanged (early exit at thrustMag < 1e-20)
- Each step: position = getPosition(sameElements, t) = unperturbed Keplerian

**This is correct.** The predicted trajectory naturally collapses to the Keplerian orbit.

### Numerical Stability

Potential issues:
1. **Accumulation error over long propagation:** 200 steps × 1.8 days = 1 year. Error accumulates.
   - Mitigation: Limit prediction horizon to 60-90 days; accuracy decreases with time anyway

2. **Large timesteps:** If predicting 365 days with 200 steps = 1.8 days/step
   - Mitigation: Use adaptive steps or finer resolution for short-term

3. **Position continuity:** State-vector approach in `applyThrust()` guarantees this.

### Physics Verdict: ✅ APPROVED with recommendations

**Recommendations:**
1. Default prediction horizon: 60 days (not 365)
2. For v1: Stop prediction at SOI boundary rather than crossing
3. Add visual indicator at SOI boundary if prediction truncated

---

## 3. Performance Review

### Target: 60 FPS

At 60 FPS, we have ~16.7ms per frame. Current render loop uses ~5-8ms typically.

### Calculation Cost Analysis

**Propagation (per cache miss):**
- 200 steps × (getPosition + getVelocity + calculateSailThrust + applyThrust)
- Each step: ~5-10 μs
- Total: ~1-2ms for 200 steps

**Rendering (per frame):**
- 200 line segments, each with project3D
- project3D: ~1μs
- Line drawing: ~2μs
- Total: ~0.6ms

### With Cache (expected scenario):

| Operation | Cost | Frequency |
|-----------|------|-----------|
| Cache check | <0.1ms | Every frame |
| Propagation | ~2ms | Every 100ms (cache TTL) |
| Rendering | ~0.6ms | Every frame |

**Amortized per-frame cost:** ~0.7ms ✅

### Worst Case (no cache):

| Operation | Cost |
|-----------|------|
| Propagation | ~2ms |
| Rendering | ~0.6ms |
| **Total** | ~2.6ms |

Still well within 16.7ms budget ✅

### Memory Impact

- 200 positions × 4 numbers × 8 bytes = ~6.4 KB
- One trajectory cached = negligible

### Both Modes Active

When showing both Keplerian orbit AND predicted trajectory:
- Keplerian: ~0.3ms (64 points, simpler math)
- Predicted: ~0.6ms (200 points)
- Total: ~0.9ms ✅

### Performance Verdict: ✅ APPROVED

**Recommendations:**
1. Cache TTL of 100ms is appropriate
2. 200 steps is appropriate for 60-day horizon
3. Consider reducing steps to 100 if performance issues arise

---

## 4. Testability Review

### Unit 1 (Propagator) - Testability: ✅ EXCELLENT

**Pure function with clear inputs/outputs:**
```javascript
// Test: Zero thrust
const result = predictTrajectory(elements, {deploymentPercent: 0}, ...);
assert(result[i] ≈ getPosition(elements, time_i));

// Test: Known thrust
const result = predictTrajectory(circularOrbit, progradeThrust, ...);
assert(result[end].a > result[0].a); // Orbit should be raised
```

### Unit 2 (Cache) - Testability: ✅ GOOD

**State-dependent but controllable:**
```javascript
// Test: Cache hit
const t1 = getTrajectory(ship);
const t2 = getTrajectory(ship);
assert(t1 === t2); // Same reference

// Test: Cache invalidation
getTrajectory(ship);
ship.sail.angle += 0.1;
const t2 = getTrajectory(ship);
assert(t1 !== t2); // Recalculated
```

### Units 3-5 (Display Toggle) - Testability: ✅ GOOD

**Integration test pattern:**
```javascript
// Manual test in browser console:
displayOptions.showPredictedTrajectory = false;
// Verify: trajectory not visible

document.getElementById('showPredictedTrajectory').click();
// Verify: state toggled
```

### Units 6-7 (Rendering) - Testability: ⚠️ MODERATE

**Canvas rendering is hard to unit test.**

Recommended approach:
1. Extract position → screen coordinate logic to testable function
2. Visual inspection for rendering
3. Snapshot testing if needed (overkill for this project)

### Units 8-11 (Edge Cases) - Testability: ✅ GOOD

Each is testable:
- Zero thrust: Unit test propagator output
- SOI: Manual test with ship in Earth SOI
- Hyperbolic: Manual test with escape trajectory
- Styling: Visual inspection

### Test Infrastructure Gap

**The project has no test framework.** CLAUDE.md states: "no compilation, linting, or test framework configured."

**Options:**
1. **Manual testing** - Document test procedures
2. **Console tests** - Write test functions callable from browser console
3. **Add test framework** - Out of scope for this feature

**Recommendation:** Use console-based test functions for Units 1-2, manual testing for the rest. Document test procedures in CLAUDE.md.

### Testability Verdict: ✅ APPROVED with notes

**Notes:**
- No test framework exists; tests will be manual or console-based
- Rendering tested via visual inspection
- Document test procedures for future regression testing

---

## 5. UX Review

### Toggle Discoverability: ✅ GOOD

- Located in "DISPLAY OPTIONS" panel alongside other toggles
- Same visual style as existing toggles
- Label "PREDICTED PATH" is clear and concise
- Natural grouping with "ORBITAL PATHS" suggests relationship

### Visual Distinguishability: ✅ GOOD

| Element | Color | Style | Purpose |
|---------|-------|-------|---------|
| Keplerian orbit | Green | Dashed | "Where I'd go without thrust" |
| Predicted trajectory | Magenta/Purple | Solid, fading | "Where I'm actually going" |

The choice of:
- Different hue (green vs purple) provides instant recognition
- Different line style (dashed vs solid) reinforces distinction
- Fade effect on predicted trajectory shows time direction

### Default Recommendation

**Both ON by default.**

Rationale:
1. New users benefit from seeing how thrust transforms the orbit
2. Keplerian orbit = "safety net" if engines fail
3. Predicted trajectory = actual navigation path
4. Both serve different purposes; neither is redundant
5. Users who find it cluttered can toggle off

### Cognitive Load

Having both displayed simultaneously:
- **Pro:** Complete information at a glance
- **Con:** Two overlapping paths may confuse new users
- **Mitigation:** Clear color distinction, tooltip/help text

### Edge Case UX

| Scenario | UX Behavior |
|----------|-------------|
| Zero thrust | Predicted path overlaps Keplerian (expected, not confusing) |
| Escape trajectory | Predicted path extends away; Keplerian shows hyperbola |
| SOI boundary | Prediction stops at boundary (v1); clear "end" marker |

### UX Verdict: ✅ APPROVED

**Recommendations:**
1. Default: Both toggles ON
2. Add brief tooltip: "Show where ship will go with current thrust"
3. Consider adding keyboard shortcut (P?) for quick toggle

---

## Review Summary

| Review | Status | Key Findings |
|--------|--------|--------------|
| Architecture | ✅ APPROVED | Correct approach, follows patterns |
| Physics | ✅ APPROVED | Sound mechanics, recommend 60-day horizon |
| Performance | ✅ APPROVED | Well within budget with caching |
| Testability | ✅ APPROVED | Manual/console tests; no framework |
| UX | ✅ APPROVED | Both toggles ON by default |

### Plan Revisions Based on Reviews

1. **Unit 1:** Change default prediction horizon from 365 days to 60 days
2. **Unit 9:** Simplify SOI handling - stop at boundary for v1, add visual marker
3. **Add Unit 12:** Console test functions for propagator validation
4. **Success Metrics:** Add "prediction stops cleanly at SOI boundary"

---

## Review Checklist (Updated)

- [x] Architecture review complete
- [x] Physics review complete
- [x] Performance review complete
- [x] Testability review complete
- [x] UX review complete

---

**Review Phase Complete**

All reviews passed. Ready to proceed to Implementation Phase with TDD approach.

---

# Implementation Complete

## Commits Made

1. `859035e` - RED: Add trajectory predictor stub and failing tests
2. `6452ac9` - GREEN: Implement trajectory predictor to pass tests
3. `a76c75a` - REFACTOR: Extract constants in trajectory predictor
4. `03daedf` - Add display toggle for predicted trajectory (Units 3-5)
5. `340f30b` - Add predicted trajectory rendering (Units 6-7)
6. `37b1ea7` - Add edge case handling and visual polish (Units 8-11)
7. `fbecb1e` - Add SOI truncation test for integration verification

## Files Created/Modified

### Created
- `src/js/lib/trajectory-predictor.js` - Core prediction logic with caching
- `src/js/lib/trajectory-predictor.test.js` - Console-based test suite

### Modified
- `src/js/config.js` - Added `showPredictedTrajectory` display option
- `src/index.html` - Added "PREDICTED PATH" checkbox
- `src/js/ui/controls.js` - Wired up new toggle
- `src/js/ui/renderer.js` - Added `drawPredictedTrajectory()` function
- `CLAUDE.md` - Updated architecture and documentation

## Verification Checklist

### Functional
- [x] Predicted trajectory displays when toggle is on
- [x] Toggle works independently from Keplerian orbit toggle
- [x] Keplerian orbit display unchanged when predicted trajectory off
- [x] Zero thrust shows trajectory matching Keplerian orbit
- [x] Thrust active shows diverging spiral trajectory

### Visual
- [x] Clearly distinguishable colors (green orbit vs magenta trajectory)
- [x] No z-fighting or visual artifacts
- [x] Smooth line rendering with alpha fade
- [x] Start marker (purple circle) at current position
- [x] End marker (orange X) at SOI/distance boundary

### Performance
- [x] 60 FPS maintained with both displays active
- [x] Propagation calculation < 5ms (cached)
- [x] Rendering < 1ms per frame

### Non-regression
- [x] Existing Keplerian orbit display unchanged
- [x] All existing display toggles work
- [x] No new console errors

## How to Test

```bash
cd src && python3 -m http.server 8080
# Open http://localhost:8080
```

Run automated tests in browser console:
```javascript
import('/js/lib/trajectory-predictor.test.js').then(m => m.runAllTests())
```

---

# QA Guide for New Sessions

## Quick Visual Check

When the game loads, you should see:
- **Green dashed ellipse** = Keplerian orbit (instantaneous, if thrust stopped)
- **Magenta solid line with fade** = Predicted trajectory (where ship actually goes)
- **Small purple circle** = Start of predicted path (at ship position)

The magenta path should:
- Start at the ship's current position
- Spiral outward/inward depending on sail angle
- Fade from bright (0.8 alpha) to dim (0.2 alpha) showing time direction
- Be solid (not dashed) to distinguish from Keplerian

## Test Scenarios

### Scenario 1: Zero Thrust
**Setup:** Set sail deployment to 0% (slider all the way left)
**Expected:** Magenta predicted path overlaps green Keplerian exactly
**Why:** With no thrust, the ship follows its natural Keplerian orbit

### Scenario 2: Prograde Thrust (Raise Orbit)
**Setup:** Set sail angle to +35° (prograde), deployment 100%
**Expected:** Magenta path spirals OUTWARD from green ellipse
**Why:** Prograde thrust adds energy, raising the orbit

### Scenario 3: Retrograde Thrust (Lower Orbit)
**Setup:** Set sail angle to -35° (retrograde), deployment 100%
**Expected:** Magenta path spirals INWARD from green ellipse
**Why:** Retrograde thrust removes energy, lowering the orbit

### Scenario 4: Toggle Independence
**Setup:**
1. Uncheck "PREDICTED PATH"
2. Verify magenta path disappears, green remains
3. Uncheck "ORBITAL PATHS"
4. Verify both disappear
5. Check "ORBITAL PATHS", leave "PREDICTED PATH" unchecked
6. Verify only green appears
**Expected:** Each toggle works independently, predicted respects parent toggle

### Scenario 5: SOI Entry (Advanced)
**Setup:**
1. Set destination to EARTH
2. Use autopilot or manual sail to intercept Earth
3. When ship enters Earth's SOI (status shows "PLANETOCENTRIC")
**Expected:**
- Both paths now drawn relative to Earth, not Sun
- If on escape trajectory from planet, magenta path ends with orange X at SOI boundary

### Scenario 6: Hyperbolic Escape
**Setup:**
1. While in planetary SOI, set sail for strong prograde (raise orbit aggressively)
2. Watch for eccentricity > 1 (shown in debug or orbit changes to cyan dashed)
**Expected:**
- Green Keplerian becomes cyan dashed (hyperbolic indicator)
- Magenta predicted path extends outward
- Magenta path ends with orange X when it hits SOI boundary

### Scenario 7: Time Warp
**Setup:** Increase speed to 100Kx or higher
**Expected:**
- Predicted path updates smoothly (cache handles this)
- No flickering or jumps
- Performance stays at 60 FPS

## Debug Tools

### Console Functions
```javascript
// Run all trajectory tests
import('/js/lib/trajectory-predictor.test.js').then(m => m.runAllTests())

// Run individual tests
import('/js/lib/trajectory-predictor.test.js').then(m => m.testZeroThrust())
import('/js/lib/trajectory-predictor.test.js').then(m => m.testThrustDiverges())
import('/js/lib/trajectory-predictor.test.js').then(m => m.testPerformance())

// Enable renderer debug logging (every 60 frames)
window.setRendererDebug(true)

// Enable thrust direction debug
window.setThrustDirDebug(true)

// Check display options state
displayOptions.showPredictedTrajectory  // should be true by default

// Manually clear trajectory cache (forces recalculation)
import('/js/lib/trajectory-predictor.js').then(m => m.clearTrajectoryCache())
```

### What Debug Logs Show
With `setRendererDebug(true)`:
- `[RENDER] Ship orbit: e=X.XXXX a=X.XXXX isHyperbolic=true/false`
- Orbital element values for verification
- Hyperbolic orbit details when applicable

## Common Issues and Fixes

### Issue: Magenta path not visible
**Check:**
1. Is `displayOptions.showPredictedTrajectory` true? (console)
2. Is `displayOptions.showOrbits` true? (parent toggle)
3. Does ship have `orbitalElements` and `sail`?
4. Check console for errors

### Issue: Magenta path doesn't update when sail changes
**Check:**
1. Cache should invalidate when sail.angle changes
2. Try `clearTrajectoryCache()` manually
3. Check if `CACHE_TTL_MS` (100ms) is being respected

### Issue: Path looks wrong / doesn't spiral
**Check:**
1. Is thrust actually being applied? (deployment > 0, condition > 0)
2. Check sail angle - 0° = radial (not much orbital effect)
3. Optimal spiral angle is ~35° prograde or retrograde

### Issue: Performance drop
**Check:**
1. Is cache working? (should recalc only every 100ms)
2. Run `testPerformance()` - should be < 5ms for 200 steps
3. Check if steps count is reasonable (150 default in renderer)

### Issue: Path ends abruptly with orange X
**Expected behavior when:**
1. Ship is in SOI and predicted to escape (SOI_EXIT truncation)
2. Heliocentric and going beyond 10 AU (MAX_DISTANCE truncation)
**This is correct** - we stop at boundaries rather than crossing them

## Key Files for Debugging

| File | Purpose |
|------|---------|
| `src/js/lib/trajectory-predictor.js` | Core prediction logic |
| `src/js/ui/renderer.js:394-501` | `drawPredictedTrajectory()` function |
| `src/js/config.js:167-173` | Display option defaults |
| `src/js/ui/controls.js:109-123` | Toggle wiring |

## Visual Reference

**Correct appearance:**
```
     .-"""-.                 Green dashed = Keplerian
   .'  ___  '.               Magenta solid = Predicted (spiraling out)
  /   /   \   \
 |   |  *  |   | ~~~>        * = Ship with purple start marker
  \   \___/   /              ~~~> = Magenta path fading toward end
   '.       .'
     '-...-'
```

**When thrust is zero:**
```
     .-"""-.
   .'       '.               Green and magenta overlap exactly
  /           \              (both follow same Keplerian ellipse)
 |      *      |
  \           /
   '.       .'
     '-...-'
```

---

**Implementation Phase Complete**
