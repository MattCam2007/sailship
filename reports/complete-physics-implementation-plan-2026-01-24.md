# Complete Physics System Implementation Plan

**Date:** 2026-01-24
**Status:** Draft
**Based on:** `reports/physics-review-2026-01-24.md`

---

## 0. File Impact Summary

### Files to EDIT:
1. `src/js/core/shipPhysics.js` - Add collision detection, refactor SOI handling, integrate gravity assist calculations
2. `src/js/lib/trajectory-predictor.js` - Extend prediction through SOI boundaries with planetocentric segments
3. `src/js/lib/intersectionDetector.js` - Add periapsis calculation for encounter markers
4. `src/js/config.js` - Add physics configuration constants (eccentricity threshold, cooldown, etc.)
5. `src/js/ui/uiUpdater.js` - Add gravity assist info panel (v∞, turning angle, ΔV prediction)
6. `src/index.html` - Add gravity assist UI elements to right panel
7. `src/js/lib/soi.js` - Add multi-SOI resolution logic, move SOI transition functions here
8. `src/js/lib/orbital.js` - Add periapsis/apoapsis helper functions
9. `src/js/ui/renderer.js` - Render gravity assist vectors and info overlays
10. `src/css/main.css` - Style gravity assist panel

### Files to CREATE:
1. `src/js/lib/gravity-assist.js` - Core gravity assist calculations (v∞, turning angle, ΔV prediction)
2. `src/js/lib/gravity-assist.test.js` - Unit tests for gravity assist math
3. `src/js/lib/soi.test.js` - Unit tests for SOI transitions and frame conversions
4. `src/js/core/shipPhysics.test.js` - Unit tests for collision detection and physics updates
5. `src/js/lib/perturbations.js` - Multi-body perturbation forces (optional, for completeness)
6. `src/js/lib/lambert.js` - Lambert solver for 2-point boundary value problems (optional)
7. `reports/complete-physics-review-2026-01-24.md` - Final review before implementation
8. `reports/complete-physics-verification-2026-01-24.md` - Post-implementation verification

### Files to DELETE:
- None

---

## 1. Problem Statement

### 1.1 Description

The game implements patched conics (2-body physics) with SOI transitions and hyperbolic orbit support, but **gravitational slingshots are not functional**. While ships CAN achieve hyperbolic trajectories and exit planetary SOIs with velocity changes, these changes are uncontrolled and unpredictable. Players cannot:
- See approach velocity or hyperbolic excess velocity (v∞)
- Predict turning angle or exit velocity vector
- Calculate ΔV gained from a flyby
- Plan trajectory through SOI before committing
- Target specific periapsis for optimal assists

Additionally, several stability and architecture issues exist:
- No collision detection (ships fly through planets)
- Enlarged SOI radii cause extreme eccentricity flybys
- Magic numbers hard-coded instead of in config
- 170-line physics update function handles too many concerns
- Multi-SOI overlap resolution is non-deterministic

### 1.2 Root Cause

**Missing gravity assist calculations:** The code tracks orbital elements and detects hyperbolic orbits, but never calculates the fundamental parameters needed for gravity assist planning:
- v∞ (hyperbolic excess velocity) - not tracked
- δ (turning angle) - not calculated
- Predicted exit velocity - not computed
- B-plane targeting - no concept

**Incomplete trajectory prediction:** The trajectory predictor stops at SOI boundaries (line 64 in `trajectory-predictor.js` explicitly says "prediction stops at SOI boundaries"). This makes it impossible to visualize flyby paths.

**2-body simplification:** The patched conics model intentionally ignores simultaneous multi-body forces. This is valid for mission planning but limits accuracy for long-term predictions.

**Defensive programming gaps:** No periapsis checks, no collision detection, no multi-SOI disambiguation.

### 1.3 Constraints

- **Must maintain patched conics:** No n-body numerical integration (performance, complexity)
- **Backward compatibility:** Existing ships/saves must continue working
- **Vanilla JS:** No external libraries (keep zero-dependency architecture)
- **Performance:** Trajectory predictor must stay <10ms for 200-point paths
- **UI space:** Gravity assist info must fit in existing panel layout
- **File structure:** Follow existing patterns (lib/, core/, ui/, data/)

---

## 2. Solution Architecture

### 2.1 High-Level Design

**Layer 1: Core Math Library (`src/js/lib/gravity-assist.js`)**
```
Pure functions for gravity assist calculations:
- getHyperbolicExcessVelocity(elements) → v∞
- getTurningAngle(v∞, r_p, μ) → δ
- predictGravityAssist(v_approach, r_p, v_planet, μ) → {v_exit, ΔV, δ}
- getAsymptoticAngle(v∞, μ, a) → angle from periapsis
- getBPlane(v_approach, r_p) → impact parameter
```

**Layer 2: Physics Integration (`src/js/core/shipPhysics.js`)**
```
- Detect SOI entry → call gravity-assist.js to predict flyby
- Store prediction in ship.gravityAssistPrediction
- Check periapsis vs planet radius → collision detection
- On SOI exit → log actual vs predicted ΔV (verification)
```

**Layer 3: Trajectory Prediction (`src/js/lib/trajectory-predictor.js`)**
```
Current: [heliocentric points] → STOP at SOI
New:     [heliocentric points] → [planetocentric arc through SOI] → [heliocentric exit]

Algorithm:
1. Propagate heliocentric orbit until SOI entry
2. Convert to planetocentric frame
3. Propagate hyperbolic arc (or elliptic if captured)
4. Detect SOI exit
5. Convert back to heliocentric
6. Continue heliocentric propagation
```

**Layer 4: UI Display (`src/js/ui/uiUpdater.js` + `src/index.html`)**
```
New panel in right column:
┌─────────────────────────────┐
│ GRAVITY ASSIST              │
├─────────────────────────────┤
│ Target: VENUS               │
│ Approach v∞: 5.2 km/s       │
│ Periapsis: 6,752 km         │
│ Turning angle: 42.3°        │
│ Exit v∞: 5.2 km/s           │
│ ΔV gained: 3.8 km/s         │
│ Closest approach: 4h 12m    │
└─────────────────────────────┘
```

**Layer 5: Enhanced Rendering (`src/js/ui/renderer.js`)**
```
- Draw predicted exit velocity vector at encounter marker
- Show periapsis point with altitude label
- Highlight trajectory red if r_p < planet radius (collision)
- Animate asymptotic approach/departure lines
```

### 2.2 Design Principles

**Principle 1: Pure Functions**
- Rationale: All gravity assist math is stateless, testable in isolation
- Implementation: `gravity-assist.js` has no imports except `orbital.js` constants

**Principle 2: Separation of Concerns**
- Rationale: Physics math ≠ game logic ≠ rendering
- Implementation:
  - `gravity-assist.js` = math only
  - `shipPhysics.js` = game state updates
  - `uiUpdater.js` = display formatting
  - `renderer.js` = canvas drawing

**Principle 3: Incremental Enhancement**
- Rationale: Existing code must work during implementation
- Implementation: Each unit adds functionality without breaking previous units

**Principle 4: Configuration over Constants**
- Rationale: Tuning should not require code edits
- Implementation: Move all magic numbers to `config.js`

**Principle 5: Fail-Safe Defaults**
- Rationale: Invalid states should degrade gracefully
- Implementation: Collision detection → auto-circularize at safe altitude

### 2.3 Key Algorithms

**Algorithm 1: Hyperbolic Excess Velocity**
```javascript
// For hyperbolic orbits (e >= 1), v∞ is the asymptotic velocity far from planet
function getHyperbolicExcessVelocity(orbitalElements) {
    const { a, e, μ } = orbitalElements;
    if (e < 1.0) return 0; // Only hyperbolic orbits have v∞

    // Formula: v∞ = √(-μ/a)
    // (a is negative for hyperbolic, so -μ/a is positive)
    return Math.sqrt(-μ / a);
}
```

**Algorithm 2: Turning Angle**
```javascript
// The angle through which the trajectory bends
function getTurningAngle(vInfinity, periapsis, mu) {
    // Formula: δ = 2 × arcsin(1 / (1 + r_p × v∞² / μ))
    const ratio = periapsis * vInfinity * vInfinity / mu;
    return 2 * Math.asin(1 / (1 + ratio));
}
```

**Algorithm 3: Gravity Assist ΔV Prediction**
```javascript
function predictGravityAssist(vApproach, rPeriapsis, vPlanet, mu) {
    // 1. Convert to planet frame
    const vRel = subtract(vApproach, vPlanet);
    const vInfinity = magnitude(vRel);

    // 2. Compute turning angle
    const delta = getTurningAngle(vInfinity, rPeriapsis, mu);

    // 3. v∞ magnitude is conserved, only direction changes
    // Rotate v∞_in by δ around periapsis normal vector
    const vInfinityOut = rotateVector(vRel, delta, periapsisNormal);

    // 4. Convert back to heliocentric frame
    const vExit = add(vInfinityOut, vPlanet);

    // 5. Compute ΔV
    const deltaV = subtract(vExit, vApproach);

    return { vExit, deltaV: magnitude(deltaV), turningAngle: delta };
}
```

**Algorithm 4: Trajectory Through SOI**
```javascript
function predictTrajectoryThroughSOI(helioElements, planet, julianDate, duration) {
    const points = [];
    let currentElements = helioElements;
    let currentFrame = 'helio';

    for (let t = 0; t < duration; t += timeStep) {
        const pos = getPosition(currentElements, julianDate + t);

        // Check SOI transition
        if (currentFrame === 'helio' && distanceToPlanet(pos, planet) < SOI_RADIUS) {
            // Entry: convert to planetocentric
            currentElements = helioToPlanetocentric(currentElements, planet, julianDate + t);
            currentFrame = 'planet';
        } else if (currentFrame === 'planet' && distanceToPlanet(pos, planet) > SOI_RADIUS) {
            // Exit: convert to heliocentric
            currentElements = planetocentricToHelio(currentElements, planet, julianDate + t);
            currentFrame = 'helio';
        }

        // Store point (always convert to heliocentric for rendering)
        const helioPos = currentFrame === 'helio' ? pos : planetocentricToHelioPos(pos, planet);
        points.push(helioPos);
    }

    return points;
}
```

**Algorithm 5: Collision Detection**
```javascript
function checkPeriapsisCollision(ship, planet) {
    if (!ship.soiState.isInSOI || ship.soiState.currentBody !== planet.name) {
        return null; // Not in this planet's SOI
    }

    const { a, e } = ship.orbitalElements;
    const periapsis = Math.abs(a) * (1 - e); // Works for both elliptic and hyperbolic
    const safeAltitude = planet.physicalRadiusKm * 1.1; // 10% margin

    if (periapsis < safeAltitude / AU_TO_KM) {
        return {
            periapsisAltitude: periapsis * AU_TO_KM - planet.physicalRadiusKm,
            safeAltitude: safeAltitude,
            willCollide: true
        };
    }

    return null;
}
```

---

## 3. Units of Work

### PHASE 1: FOUNDATION (Setup & Configuration)

#### Unit 1: Move Constants to Config
**Description:** Extract all magic numbers from physics code to `config.js` for centralized tuning
**Files:** `src/js/config.js`, `src/js/core/shipPhysics.js`, `src/js/lib/soi.js`
**Acceptance Criteria:**
- [ ] `PHYSICS_CONFIG` object added to config.js with all constants
- [ ] `shipPhysics.js` imports and uses config constants
- [ ] No hard-coded 50, 0.1, 0.25 values in physics code
- [ ] Existing game behavior unchanged (same values, different location)
**Test Method:**
```javascript
import { PHYSICS_CONFIG } from './config.js';
console.assert(PHYSICS_CONFIG.extremeEccentricityThreshold === 50);
console.assert(PHYSICS_CONFIG.soiTransitionCooldown === 0.1);
console.assert(PHYSICS_CONFIG.visualElementLerpRate === 0.25);
```

#### Unit 2: Add Orbital Helper Functions
**Description:** Create periapsis/apoapsis calculation functions in `orbital.js`
**Files:** `src/js/lib/orbital.js`
**Acceptance Criteria:**
- [ ] `getPeriapsis(elements)` returns periapsis distance (AU)
- [ ] `getApoapsis(elements)` returns apoapsis distance (AU or Infinity for hyperbolic)
- [ ] Functions handle both elliptic (e < 1) and hyperbolic (e >= 1) orbits
- [ ] Export functions for use in other modules
**Test Method:**
```javascript
const elliptic = { a: 1.0, e: 0.5 };  // Periapsis = 0.5 AU, Apoapsis = 1.5 AU
console.assert(getPeriapsis(elliptic) === 0.5);
console.assert(getApoapsis(elliptic) === 1.5);

const hyperbolic = { a: -1.0, e: 1.5 }; // Periapsis = 0.5 AU, Apoapsis = ∞
console.assert(getPeriapsis(hyperbolic) === 0.5);
console.assert(getApoapsis(hyperbolic) === Infinity);
```

---

### PHASE 2: GRAVITY ASSIST MATH (Core Calculations)

#### Unit 3: Create Gravity Assist Library Stub
**Description:** Create `gravity-assist.js` with exports and documentation, no implementation yet
**Files:** `src/js/lib/gravity-assist.js`
**Acceptance Criteria:**
- [ ] File created with module structure
- [ ] All functions exported with JSDoc signatures
- [ ] Functions return placeholder values (0, null, etc.)
- [ ] No import errors when loaded
**Test Method:**
```javascript
import * as GA from './lib/gravity-assist.js';
console.assert(typeof GA.getHyperbolicExcessVelocity === 'function');
console.assert(typeof GA.getTurningAngle === 'function');
console.assert(typeof GA.predictGravityAssist === 'function');
```

#### Unit 4: Implement Hyperbolic Excess Velocity
**Description:** Calculate v∞ = √(-μ/a) for hyperbolic orbits
**Files:** `src/js/lib/gravity-assist.js`
**Acceptance Criteria:**
- [ ] Returns 0 for elliptic orbits (e < 1)
- [ ] Returns correct v∞ for hyperbolic orbits
- [ ] Handles edge case: e = 1.0 (parabolic) → returns √(2μ/r)
- [ ] Units consistent: returns AU/day if a is in AU, μ in AU³/day²
**Test Method:**
```javascript
// Test case: Earth flyby with e=2.0, a=-0.01 AU, μ_earth
const elements = { a: -0.01, e: 2.0, μ: 8.887692445e-10 };
const vInf = getHyperbolicExcessVelocity(elements);
const expected = Math.sqrt(-8.887692445e-10 / -0.01); // ≈ 0.000298 AU/day ≈ 5.2 km/s
console.assert(Math.abs(vInf - expected) < 1e-9);
```

#### Unit 5: Implement Turning Angle Calculation
**Description:** Calculate δ = 2 × arcsin(1 / (1 + r_p × v∞² / μ))
**Files:** `src/js/lib/gravity-assist.js`
**Acceptance Criteria:**
- [ ] Returns angle in radians
- [ ] Handles low periapsis (large δ, tight turn)
- [ ] Handles high periapsis (small δ, gentle turn)
- [ ] Guards against arcsin domain errors (clamp to [-1, 1])
**Test Method:**
```javascript
// Test case: Venus flyby, v∞ = 5 km/s, r_p = 7000 km
const vInf = 5 / 1731.46; // Convert km/s to AU/day
const rp = 7000 / 149597870.7; // Convert km to AU
const mu = 7.2435e-10; // Venus μ
const delta = getTurningAngle(vInf, rp, mu);
console.assert(delta > 0 && delta < Math.PI); // Must be valid angle
console.assert(delta < Math.PI / 2); // For typical flybys, δ < 90°
```

#### Unit 6: Implement Gravity Assist Predictor (Simplified)
**Description:** Predict exit velocity for head-on/trailing flyby (simplified 2D case)
**Files:** `src/js/lib/gravity-assist.js`
**Acceptance Criteria:**
- [ ] Takes v_approach (heliocentric), r_periapsis, v_planet, μ
- [ ] Returns v_exit (heliocentric) and ΔV magnitude
- [ ] Conserves v∞ magnitude (|v∞_in| = |v∞_out|)
- [ ] Turning angle applied correctly (trailing flyby gains speed, leading loses speed)
**Test Method:**
```javascript
// Trailing flyby: ship approaches from behind planet's orbit
// Expect: ship gains speed (slingshot effect)
const vApproach = { vx: 30, vy: 0, vz: 0 }; // 30 km/s heliocentric
const vPlanet = { vx: 35, vy: 0, vz: 0 }; // Planet faster
const result = predictGravityAssist(vApproach, rp, vPlanet, mu);
console.assert(result.deltaV > 0); // Must gain speed
console.assert(result.vExit.vx > vApproach.vx); // Exit faster than entry
```

#### Unit 7: Create Gravity Assist Unit Tests
**Description:** Comprehensive test suite for gravity-assist.js
**Files:** `src/js/lib/gravity-assist.test.js`
**Acceptance Criteria:**
- [ ] Test v∞ calculation for elliptic, parabolic, hyperbolic orbits
- [ ] Test turning angle for various periapsis altitudes
- [ ] Test ΔV predictor for head-on, trailing, leading flybys
- [ ] Test edge cases: e=1.0, r_p → 0, v∞ → 0
- [ ] All tests pass when run in console
**Test Method:**
```javascript
import('/js/lib/gravity-assist.test.js').then(m => m.runAllTests())
// Should log: "All gravity assist tests passed"
```

---

### PHASE 3: PHYSICS INTEGRATION (Collision & SOI)

#### Unit 8: Add Collision Detection to shipPhysics
**Description:** Check periapsis vs planet radius, auto-circularize if collision detected
**Files:** `src/js/core/shipPhysics.js`
**Acceptance Criteria:**
- [ ] Detects when periapsis < planet radius × 1.1
- [ ] Logs warning: "COLLISION PREVENTED: Circularized at [altitude]"
- [ ] Sets ship to circular orbit at 1.1× planet radius
- [ ] Only applies when in planetary SOI
**Test Method:**
Manual test:
1. Enter Venus SOI with hyperbolic trajectory
2. Adjust sail to lower periapsis below 6,700 km (Venus radius + 10%)
3. Observe console log: "COLLISION PREVENTED"
4. Check ship.orbitalElements.e ≈ 0 (circular)
5. Check periapsis = Venus radius × 1.1

#### Unit 9: Add Multi-SOI Resolution
**Description:** When multiple SOIs overlap, choose dominant body (largest μ/r²)
**Files:** `src/js/lib/soi.js`
**Acceptance Criteria:**
- [ ] `checkSOIEntry()` modified to check all overlapping SOIs
- [ ] Returns SOI with largest gravitational acceleration (μ/r²)
- [ ] Logs "Multiple SOIs detected, choosing [body]" when applicable
- [ ] Existing behavior unchanged when only one SOI present
**Test Method:**
Manual test:
1. Create test scenario: ship equidistant from Venus (0.1 AU SOI) and Earth (0.1 AU SOI)
2. Position at 0.08 AU from both planets
3. Observe which SOI captures ship (should be the closer one)
4. Verify via console log

#### Unit 10: Refactor SOI Transition to soi.js
**Description:** Move `handleSOIEntry()` and `handleSOIExit()` from shipPhysics.js to soi.js
**Files:** `src/js/lib/soi.js`, `src/js/core/shipPhysics.js`
**Acceptance Criteria:**
- [ ] Functions moved to soi.js
- [ ] shipPhysics.js imports and calls them (no logic duplication)
- [ ] Function signatures unchanged (backward compatible)
- [ ] All SOI transitions still work correctly
**Test Method:**
Play game, enter/exit Venus SOI, observe:
- Console logs match previous behavior
- No regressions in SOI mechanics
- ship.soiState updates correctly

#### Unit 11: Add SOI Transition Unit Tests
**Description:** Test suite for SOI entry/exit frame conversions
**Files:** `src/js/lib/soi.test.js`
**Acceptance Criteria:**
- [ ] Test heliocentric → planetocentric conversion
- [ ] Test planetocentric → heliocentric conversion
- [ ] Verify state vector continuity (position/velocity unchanged in inertial frame)
- [ ] Test hyperbolic vs elliptic orbit classification
- [ ] All tests pass
**Test Method:**
```javascript
import('/js/lib/soi.test.js').then(m => m.runAllTests())
```

---

### PHASE 4: TRAJECTORY PREDICTION (SOI Integration)

#### Unit 12: Extend Trajectory Predictor Data Structure
**Description:** Modify trajectory points to include frame metadata
**Files:** `src/js/lib/trajectory-predictor.js`
**Acceptance Criteria:**
- [ ] Each trajectory point has `{x, y, z, time, frame: 'helio'|'planet', parentBody}`
- [ ] Existing code still works (backward compatible)
- [ ] Frame switches marked in trajectory
**Test Method:**
```javascript
const traj = predictTrajectory(ship, 60);
console.assert(traj.every(p => p.frame === 'helio' || p.frame === 'planet'));
console.assert(traj.some(p => p.frame === 'planet')); // If flyby predicted
```

#### Unit 13: Implement SOI Boundary Detection in Predictor
**Description:** Detect when predicted trajectory crosses SOI radius
**Files:** `src/js/lib/trajectory-predictor.js`
**Acceptance Criteria:**
- [ ] For each timestep, check distance to all planets with SOI
- [ ] Mark SOI entry/exit points
- [ ] Store which body's SOI was entered
- [ ] Don't stop prediction at boundary (continue through SOI)
**Test Method:**
Manual inspection of trajectory array:
```javascript
const traj = predictTrajectory(ship, 60);
const transitions = traj.filter((p, i) => i > 0 && p.frame !== traj[i-1].frame);
console.log('SOI transitions:', transitions.length);
```

#### Unit 14: Implement Planetocentric Trajectory Segment
**Description:** When in SOI, propagate orbit in planetocentric frame
**Files:** `src/js/lib/trajectory-predictor.js`
**Acceptance Criteria:**
- [ ] On SOI entry, convert to planetocentric elements
- [ ] Propagate using planet's μ
- [ ] Convert each point back to heliocentric for rendering
- [ ] On SOI exit, convert back to heliocentric elements
- [ ] Continuous path (no jumps at SOI boundary)
**Test Method:**
Visual inspection:
1. Set up Venus flyby trajectory
2. Enable PREDICTED PATH display
3. Observe continuous curve through Venus SOI (no jump/discontinuity)
4. Measure closest approach distance (should match periapsis)

#### Unit 15: Add Encounter Marker Periapsis Display
**Description:** Show periapsis altitude for each encounter marker
**Files:** `src/js/lib/intersectionDetector.js`, `src/js/ui/renderer.js`
**Acceptance Criteria:**
- [ ] Encounter marker data includes periapsis distance
- [ ] Periapsis calculated from trajectory arc in SOI
- [ ] Renderer displays altitude in km (e.g., "6,752 km alt")
- [ ] Red warning if periapsis < planet radius × 1.1 (collision)
**Test Method:**
Visual verification:
1. Enable ENCOUNTER MARKERS
2. Set up Venus flyby
3. Observe encounter marker shows "Periapsis: 7,200 km"
4. Lower periapsis below safe altitude
5. Observe marker turns red with "COLLISION!" warning

---

### PHASE 5: UI INTEGRATION (Display & Controls)

#### Unit 16: Add Gravity Assist Panel HTML
**Description:** Create UI panel in right column for gravity assist info
**Files:** `src/index.html`
**Acceptance Criteria:**
- [ ] Panel added to right column (near SAIL/NAV/AUTO tabs)
- [ ] Includes fields: Target, Approach v∞, Periapsis, Turning Angle, Exit v∞, ΔV, Time to Closest Approach
- [ ] Initially hidden (shown when SOI entry detected)
- [ ] Styled consistently with existing panels
**Test Method:**
Open game in browser, inspect HTML:
- Panel exists in DOM
- CSS classes match existing panels
- Fields have appropriate IDs for JS updates

#### Unit 17: Populate Gravity Assist Panel in uiUpdater
**Description:** Update panel fields with live gravity assist data
**Files:** `src/js/ui/uiUpdater.js`
**Acceptance Criteria:**
- [ ] On SOI entry, call `predictGravityAssist()` and store result
- [ ] Update panel every frame with current values
- [ ] Format velocities in km/s, distances in km, angles in degrees
- [ ] Show time to closest approach (countdown timer)
- [ ] Hide panel when not in SOI
**Test Method:**
Manual verification:
1. Fly into Venus SOI
2. Observe panel appears with values
3. Verify v∞ matches ship's planet-relative velocity
4. Verify periapsis matches orbital elements calculation
5. Exit SOI, panel disappears

#### Unit 18: Add Gravity Assist Vector Rendering
**Description:** Draw predicted exit velocity vector at encounter marker
**Files:** `src/js/ui/renderer.js`
**Acceptance Criteria:**
- [ ] Arrow shows exit velocity direction and magnitude
- [ ] Color-coded: green = ΔV gain, red = ΔV loss
- [ ] Scales with zoom (always visible)
- [ ] Only shown when PREDICTED PATH enabled
**Test Method:**
Visual verification:
1. Enable PREDICTED PATH and ENCOUNTER MARKERS
2. Set up trailing Venus flyby (should gain speed)
3. Observe green arrow at encounter marker
4. Arrow points in exit direction
5. Arrow length proportional to ΔV magnitude

#### Unit 19: Add CSS Styling for Gravity Assist Panel
**Description:** Style the new UI panel to match existing design
**Files:** `src/css/main.css`
**Acceptance Criteria:**
- [ ] Panel uses consistent colors (dark background, cyan text)
- [ ] Fields have proper spacing and alignment
- [ ] Warning color (red) for collision risk
- [ ] Responsive layout (doesn't break at different window sizes)
**Test Method:**
Visual inspection at multiple screen sizes

---

### PHASE 6: OPTIONAL COMPLETENESS (Advanced Physics)

#### Unit 20: Create Perturbations Module Stub (Optional)
**Description:** Stub for multi-body perturbation forces (future enhancement)
**Files:** `src/js/lib/perturbations.js`
**Acceptance Criteria:**
- [ ] Module created with function signatures
- [ ] Returns zero perturbations (no effect on gameplay yet)
- [ ] Documented for future implementation
- [ ] Can be imported without errors
**Test Method:**
```javascript
import { getPerturbationAcceleration } from './lib/perturbations.js';
const accel = getPerturbationAcceleration(ship, planets);
console.assert(accel.x === 0 && accel.y === 0 && accel.z === 0); // Stub returns zero
```

#### Unit 21: Create Lambert Solver Stub (Optional)
**Description:** Stub for 2-point boundary value problem solver (future autopilot)
**Files:** `src/js/lib/lambert.js`
**Acceptance Criteria:**
- [ ] Module created with function signature
- [ ] Documented with algorithm references (Battin, Gooding)
- [ ] Returns null (not implemented yet)
- [ ] Ready for future development
**Test Method:**
```javascript
import { solveLambert } from './lib/lambert.js';
const solution = solveLambert(r1, r2, tof, mu);
console.assert(solution === null); // Stub returns null
```

---

### PHASE 7: TESTING & VERIFICATION

#### Unit 22: Add shipPhysics Unit Tests
**Description:** Test collision detection and physics update loop
**Files:** `src/js/core/shipPhysics.test.js`
**Acceptance Criteria:**
- [ ] Test collision detection triggers at correct periapsis
- [ ] Test auto-circularization creates valid orbit
- [ ] Test SOI entry/exit updates ship state correctly
- [ ] Test extreme eccentricity fallback (e > 50)
- [ ] All tests pass
**Test Method:**
```javascript
import('/js/core/shipPhysics.test.js').then(m => m.runAllTests())
```

#### Unit 23: Integration Test - Complete Flyby
**Description:** End-to-end test of Venus flyby with gravity assist
**Files:** Manual browser testing
**Acceptance Criteria:**
- [ ] Ship approaches Venus at 40 km/s heliocentric
- [ ] SOI entry detected, gravity assist panel appears
- [ ] Predicted trajectory shows hyperbolic arc through SOI
- [ ] Periapsis displays correct altitude
- [ ] Ship exits SOI with predicted ΔV (within 5% error)
- [ ] No console errors or warnings (except intentional debug logs)
**Test Method:**
Manual playtest:
1. Start game
2. Set ship on Venus intercept course
3. Time warp to approach
4. Observe all UI elements update correctly
5. Compare predicted vs actual exit velocity

#### Unit 24: Edge Case Validation
**Description:** Test all identified edge cases from review
**Files:** Manual browser testing
**Acceptance Criteria:**
- [ ] Parabolic escape (e = 1.0) handled gracefully
- [ ] Retrograde orbit in SOI works correctly
- [ ] Multi-SOI overlap chooses correct body
- [ ] Collision below planet radius triggers auto-circularization
- [ ] Extreme eccentricity (e > 50) uses linear interpolation
- [ ] SOI boundary oscillation prevented by cooldown
**Test Method:**
Manual test each case, document pass/fail in verification report

#### Unit 25: Performance Verification
**Description:** Verify trajectory predictor stays <10ms with SOI integration
**Files:** Manual browser profiling
**Acceptance Criteria:**
- [ ] 200-point trajectory with 1 SOI flyby: <10ms
- [ ] 200-point trajectory with 2 SOI flybys: <15ms
- [ ] No frame drops during normal gameplay
- [ ] Memory usage stable (no leaks)
**Test Method:**
```javascript
console.time('trajectory');
const traj = predictTrajectory(ship, 730); // 2-year prediction
console.timeEnd('trajectory');
// Should log: trajectory: 8.234ms (or similar)
```

---

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Trajectory predictor performance degradation** | Medium | High | Profile early (Unit 25), optimize if >10ms, consider point reduction |
| **SOI frame conversion numerical errors** | Low | High | Extensive unit tests (Unit 11), use existing proven stateToElements() |
| **Gravity assist ΔV prediction inaccurate** | Medium | Medium | Compare to known missions (Voyager, Cassini), validate with published data |
| **UI clutter from new panel** | Low | Low | Use collapsible panel, only show when in SOI |
| **Backward compatibility break** | Low | High | Test existing saves load correctly, no function signature changes |
| **Complex vector rotation math errors** | Medium | Medium | Unit tests with known solutions, visual verification with rendered arrows |
| **Periapsis calculation wrong for hyperbolic** | Low | High | Unit test with both e<1 and e>=1 cases, verify p = |a|(1-e) |
| **Multi-SOI ambiguity not fully resolved** | Medium | Low | Use μ/r² dominance rule, log warnings for overlaps |

---

## 5. Testing Strategy

### 5.1 Unit Tests

**Math Libraries (gravity-assist.js, orbital.js, soi.js):**
- Pure function tests with known inputs/outputs
- Edge case coverage: e=0, e=0.999, e=1.0, e=2.0, e=50
- Numerical precision checks (tolerance ±1e-9)
- Console-runnable test suites

**Physics Logic (shipPhysics.js):**
- Mock ship objects with controlled orbital elements
- Verify state transitions (SOI entry/exit)
- Test collision detection triggers
- Test auto-circularization creates valid orbit

### 5.2 Integration Tests

**Complete Flyby Scenario:**
1. Set up ship approaching Venus
2. Verify predicted trajectory shows hyperbolic arc
3. Verify gravity assist panel displays correct values
4. Verify ship exits with predicted ΔV (±5%)
5. Verify no console errors

**Multi-SOI Scenario:**
1. Position ship between two overlapping SOIs
2. Verify correct SOI chosen (dominant gravity)
3. Verify smooth transition (no oscillation)

**Collision Scenario:**
1. Set periapsis below planet radius
2. Verify auto-circularization at 1.1× radius
3. Verify console warning logged

### 5.3 Manual Verification

**Visual Inspection:**
- Trajectory continuity through SOI (no jumps)
- Encounter markers show correct periapsis altitudes
- Exit velocity arrows point in correct direction
- UI panels display formatted values correctly

**Performance:**
- No frame drops during flybys
- Trajectory predictor <10ms for 200 points
- Memory stable over 30-minute play session

**Edge Cases:**
- Test all 24 edge cases from verification checklist
- Document any failures in verification report

---

## 6. Success Criteria

**Implementation Complete When:**
- [ ] All 25 units have passing acceptance criteria
- [ ] All unit tests pass (gravity-assist.test.js, soi.test.js, shipPhysics.test.js)
- [ ] Integration test (complete Venus flyby) passes
- [ ] Edge case validation checklist 100% pass
- [ ] Performance targets met (<10ms trajectory prediction)
- [ ] No console errors or warnings (except debug logs)
- [ ] Gravity assist panel displays accurate real-time values
- [ ] Predicted ΔV matches actual ΔV within 5%
- [ ] Verification report documents all test results

**Physics System is "Complete and Accurate" When:**
- [ ] Gravitational slingshots are functional and predictable
- [ ] Players can target specific periapsis for optimal ΔV
- [ ] Trajectory predictor shows complete path through SOIs
- [ ] Collision detection prevents unrealistic planet impacts
- [ ] All orbital mechanics math validated against published formulas
- [ ] No known numerical stability issues remain
- [ ] Code architecture supports future enhancements (perturbations, Lambert solver)

---

## 7. Implementation Timeline Estimate

| Phase | Units | Estimated Time | Dependencies |
|-------|-------|----------------|--------------|
| **Phase 1: Foundation** | 1-2 | 3 hours | None |
| **Phase 2: Gravity Assist Math** | 3-7 | 8 hours | Phase 1 |
| **Phase 3: Physics Integration** | 8-11 | 7 hours | Phase 2 |
| **Phase 4: Trajectory Prediction** | 12-15 | 6 hours | Phase 3 |
| **Phase 5: UI Integration** | 16-19 | 5 hours | Phase 4 |
| **Phase 6: Optional Completeness** | 20-21 | 2 hours | None (parallel) |
| **Phase 7: Testing & Verification** | 22-25 | 6 hours | Phases 1-5 |
| **TOTAL** | **25 units** | **37 hours** | Sequential |

*Note: Excludes optional advanced features (perturbations, Lambert solver implementation)*

---

## 8. Git Workflow

```bash
# Create feature branch
git checkout -b feature/complete-physics-system

# Per unit (example: Unit 1)
# ... make changes ...
git add src/js/config.js src/js/core/shipPhysics.js
git commit -m "[Unit 1] Move constants to config

- Add PHYSICS_CONFIG object to config.js
- Import PHYSICS_CONFIG in shipPhysics.js
- Replace hard-coded 50, 0.1, 0.25 with config values
- Verify game behavior unchanged

Files: config.js, shipPhysics.js"

# After all units complete
git push origin feature/complete-physics-system

# Create PR or merge to main
```

---

## 9. Next Steps

1. **Review this plan** using 4-perspective method (PHASE 3 of DEVELOPMENT_PROCESS.md)
2. **Create review report:** `reports/complete-physics-review-2026-01-24.md`
3. **Address any concerns** from review
4. **Begin implementation** starting with Unit 1
5. **Test each unit** before proceeding to next
6. **Document progress** in verification report after completion

---

**Status:** Ready for review
**Confidence:** Plan covers all identified physics gaps and provides atomic, testable units
