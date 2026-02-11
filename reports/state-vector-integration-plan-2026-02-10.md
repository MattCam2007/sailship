# State-Vector Integration Implementation Plan

**Date:** 2026-02-10
**Branch:** `feature/state-vector-integration`
**Status:** Draft - Awaiting Approval
**Estimated Time:** 4-6 hours

---

## 0. File Impact Summary

### Files to EDIT:
1. `src/js/lib/orbital-maneuvers.js` - Add RK4 state-vector integration function
2. `src/js/lib/trajectory-predictor.js` - Change integration loop to use state
3. `src/js/core/shipPhysics.js` - Update per-frame physics to use state integration
4. `src/js/data/ships.js` - Add state field to ship data, derive elements from state
5. `src/js/lib/orbital.js` - Export gravitational acceleration function for RK4
6. `src/js/config.js` - (Optional) Increase maxSteps if needed

### Files to CREATE:
1. `reports/state-vector-integration-plan-2026-02-10.md` - This file
2. `reports/state-vector-verification-2026-02-10.md` - Verification report (after implementation)

### Files to DELETE:
- None

---

## 1. Problem Statement

### 1.1 Description

The predicted trajectory displays a visible zigzag pattern due to accumulated numerical errors in the physics integration. Two previous fix attempts (commits 530a1d9 and 4ade3d8) addressed secondary symptoms but failed to fix the root cause.

### 1.2 Root Cause

The current integration method uses a **state-vector roundtrip approach**:
```
Orbital Elements → Position + Velocity → Apply Thrust → New Velocity → New Orbital Elements
```

This creates two sources of error:
1. **RTN frame rotation lag**: Thrust direction held constant for 2-hour timesteps while the RTN reference frame rotates 0.083°/step (Earth orbit)
2. **Numerical conversion errors**: `stateToElements()` involves trigonometric inversions (arccos, arctan2) and Kepler equation solution, accumulating O(10⁻⁶ AU) position errors per conversion

Over 720 integration steps (60-day prediction), these errors accumulate to **~180,000 km deviation**, creating visible zigzag.

### 1.3 Constraints

- Must maintain physics accuracy (< 10,000 km error for 60-day predictions)
- Must maintain 60 FPS performance
- Must support all existing features (SOI transitions, extreme flybys, autopilot)
- Must be backward-compatible with save data (optional - no save system currently exists)
- Must not break existing UI, rendering, or game loop

---

## 2. Solution Architecture

### 2.1 High-Level Design

**Switch from element-based to state-based physics representation:**

**Before (Current):**
```
Primary representation: Orbital elements {a, e, i, Ω, ω, M}
Physics integration: Elements → State → Apply Thrust → State → Elements
Display: Elements → Position (via getPosition())
```

**After (Proposed):**
```
Primary representation: State vector {x, y, z, vx, vy, vz}
Physics integration: State → Apply Thrust → New State (RK4)
Display: State → Elements (via stateToElements()) → Render
```

**Key Insight:** Elements become a **derived quantity** for display, not the source of truth for physics.

### 2.2 Design Principles

#### Principle 1: State as Source of Truth
**Rationale:** Eliminates elements→state→elements roundtrip errors. Position and velocity are integrated directly using classical mechanics.

#### Principle 2: RK4 for High-Order Accuracy
**Rationale:** RK4 (4th-order Runge-Kutta) provides O(Δt⁴) local error vs. current RK2's O(Δt²), reducing errors by factor of 100-1000 for typical timesteps.

#### Principle 3: Minimal Conversions
**Rationale:** Only convert state→elements when needed for display (orbital period, apsis markers, navigation UI), not every physics step.

#### Principle 4: Incremental Migration
**Rationale:** Change integration method without breaking existing features. Start with trajectory predictor, then migrate main game loop.

### 2.3 Key Algorithms

#### RK4 State-Vector Integration

For a state vector `y = (x, y, z, vx, vy, vz)` with derivative `dy/dt = f(t, y)`:

```javascript
function integrateStateRK4(state, thrust, dt, mu) {
    // dy/dt = f(t, y) = (vx, vy, vz, ax, ay, az)
    // where a = -μ*r/|r|³ + thrust

    const r = Math.sqrt(state.x**2 + state.y**2 + state.z**2);
    const grav = {
        x: -mu * state.x / (r**3),
        y: -mu * state.y / (r**3),
        z: -mu * state.z / (r**3)
    };

    // k1 = f(t, y)
    const k1 = {
        x: state.vx,
        y: state.vy,
        z: state.vz,
        vx: grav.x + thrust.x,
        vy: grav.y + thrust.y,
        vz: grav.z + thrust.z
    };

    // k2 = f(t + dt/2, y + k1*dt/2)
    const y2 = {
        x: state.x + k1.x * dt/2,
        y: state.y + k1.y * dt/2,
        z: state.z + k1.z * dt/2,
        vx: state.vx + k1.vx * dt/2,
        vy: state.vy + k1.vy * dt/2,
        vz: state.vz + k1.vz * dt/2
    };
    const r2 = Math.sqrt(y2.x**2 + y2.y**2 + y2.z**2);
    const grav2 = {
        x: -mu * y2.x / (r2**3),
        y: -mu * y2.y / (r2**3),
        z: -mu * y2.z / (r2**3)
    };
    const thrust2 = calculateSailThrust(y2, ...);  // Recalculate at midpoint
    const k2 = {
        x: y2.vx,
        y: y2.vy,
        z: y2.vz,
        vx: grav2.x + thrust2.x,
        vy: grav2.y + thrust2.y,
        vz: grav2.z + thrust2.z
    };

    // k3 = f(t + dt/2, y + k2*dt/2) - similar
    // k4 = f(t + dt, y + k3*dt) - similar

    // Final update: y_new = y + (k1 + 2*k2 + 2*k3 + k4) * dt/6
    return {
        x: state.x + (k1.x + 2*k2.x + 2*k3.x + k4.x) * dt/6,
        y: state.y + (k1.y + 2*k2.y + 2*k3.y + k4.y) * dt/6,
        z: state.z + (k1.z + 2*k2.z + 2*k3.z + k4.z) * dt/6,
        vx: state.vx + (k1.vx + 2*k2.vx + 2*k3.vx + k4.vx) * dt/6,
        vy: state.vy + (k1.vy + 2*k2.vy + 2*k3.vy + k4.vy) * dt/6,
        vz: state.vz + (k1.vz + 2*k2.vz + 2*k3.vz + k4.vz) * dt/6
    };
}
```

**Computational Cost:**
- 4 thrust evaluations per step (vs. current 2 for RK2)
- 2× computational cost, but 100× more accurate
- Trade-off: Worth it for trajectory prediction (offline), may need optimization for main game loop

#### Sail Thrust Calculation from State

Modify `calculateSailThrust()` to accept state vector instead of orbital elements:

```javascript
export function calculateSailThrustFromState(state, sail, sunPosition = {x: 0, y: 0, z: 0}) {
    // Relative position to sun:
    const rx = state.x - sunPosition.x;
    const ry = state.y - sunPosition.y;
    const rz = state.z - sunPosition.z;
    const r = Math.sqrt(rx**2 + ry**2 + rz**2);

    // Velocity (for RTN frame):
    const vx = state.vx;
    const vy = state.vy;
    const vz = state.vz;

    // Build RTN frame from state:
    const R = {x: rx/r, y: ry/r, z: rz/r};  // Radial
    const h = cross({x: rx, y: ry, z: rz}, {x: vx, y: vy, z: vz});  // Angular momentum
    const N = normalize(h);  // Normal
    const T = cross(N, R);  // Transverse

    // Rest is same as current implementation...
    const thrustMagnitude = SOLAR_PRESSURE * sailArea * reflectivity / (r * r);
    const thrustRTN = {
        R: thrustMagnitude * Math.cos(angle) * Math.cos(pitchAngle),
        T: thrustMagnitude * Math.sin(angle) * Math.cos(pitchAngle),
        N: thrustMagnitude * Math.sin(pitchAngle)
    };

    // Convert RTN to ecliptic:
    return {
        x: thrustRTN.R * R.x + thrustRTN.T * T.x + thrustRTN.N * N.x,
        y: thrustRTN.R * R.y + thrustRTN.T * T.y + thrustRTN.N * N.y,
        z: thrustRTN.R * R.z + thrustRTN.T * T.z + thrustRTN.N * N.z
    };
}
```

---

## 3. Units of Work

### Unit 1: Add State-Vector RK4 Integration Function

**Description:** Implement `integrateStateRK4()` in orbital-maneuvers.js

**Files:** `src/js/lib/orbital-maneuvers.js`

**Changes:**
- Add new export: `integrateStateRK4(state, thrust, dt, mu)`
- Full RK4 implementation with 4 stages
- Include inline documentation explaining algorithm

**Acceptance Criteria:**
- [ ] Function exported from orbital-maneuvers.js
- [ ] Takes state {x, y, z, vx, vy, vz}, thrust {x, y, z}, dt, mu
- [ ] Returns new state {x, y, z, vx, vy, vz}
- [ ] RK4 stages correctly implemented (k1, k2, k3, k4)

**Test Method:**
```javascript
// Console test - circular orbit should maintain constant radius:
const state = {x: 1, y: 0, z: 0, vx: 0, vy: 6.283, vz: 0};  // 1 AU, circular
const thrust = {x: 0, y: 0, z: 0};
const newState = integrateStateRK4(state, thrust, 1/365.26, SUN.mu);
const r = Math.sqrt(newState.x**2 + newState.y**2 + newState.z**2);
console.log(`Radius: ${r} AU (should be ~1.0)`);
```

---

### Unit 2: Add Thrust Calculation from State

**Description:** Add `calculateSailThrustFromState()` function

**Files:** `src/js/lib/orbital-maneuvers.js`

**Changes:**
- Add new export: `calculateSailThrustFromState(state, sail, sunPosition)`
- Build RTN frame from position and velocity vectors
- Convert thrust from RTN to ecliptic coordinates

**Acceptance Criteria:**
- [ ] Function takes state vector + sail config
- [ ] Computes RTN frame from state (not from elements)
- [ ] Returns thrust in ecliptic coordinates {x, y, z}
- [ ] Matches existing `calculateSailThrust()` output for same orbit

**Test Method:**
```javascript
// Compare thrust from elements vs. thrust from state:
const elements = {a: 1.0, e: 0.017, i: 0, ...};
const state = elementsToState(elements);
const thrust1 = calculateSailThrust(elements, sail);
const thrust2 = calculateSailThrustFromState(state, sail);
console.log(`Difference: ${distance(thrust1, thrust2)} (should be < 1e-10)`);
```

---

### Unit 3: Modify Trajectory Predictor Integration Loop

**Description:** Change `predictTrajectory()` to use state-vector integration

**Files:** `src/js/lib/trajectory-predictor.js`

**Changes:**
- Convert initial orbital elements to state at start
- Replace element integration loop with state integration loop
- Convert state to elements for trajectory points (display only)
- Cache remains keyed by input elements (hash calculation unchanged)

**Acceptance Criteria:**
- [ ] Convert initial elements to state using `elementsToState()`
- [ ] Integration loop uses `integrateStateRK4()` instead of `applyThrust()`
- [ ] Each trajectory point includes state {x, y, z, vx, vy, vz, time}
- [ ] SOI transitions still handled correctly
- [ ] Extreme flyby state still handled correctly

**Test Method:**
```javascript
// Visual test: Load game, enable PREDICTED PATH, should be smooth spiral
// Console test: Verify trajectory points have state fields
const traj = predictTrajectory({...});
console.log(traj[0]);  // Should have: {x, y, z, vx, vy, vz, time}
```

---

### Unit 4: Update Ship Data Structure

**Description:** Add `state` field to ships, make `orbitalElements` derived

**Files:** `src/js/data/ships.js`

**Changes:**
- Add `state: {x, y, z, vx, vy, vz}` field to player ship
- Keep `orbitalElements` field (derived from state for display)
- Update ship initialization to compute state from initial elements

**Acceptance Criteria:**
- [ ] Player ship has `state` field
- [ ] `orbitalElements` field still exists (backward compatibility)
- [ ] Ship position getters use state (not elements)
- [ ] Game loads without errors

**Test Method:**
```javascript
// Console check:
console.log(ships[0].state);  // Should show {x, y, z, vx, vy, vz}
console.log(ships[0].orbitalElements);  // Should still exist
```

---

### Unit 5: Update Ship Physics Loop

**Description:** Use state-vector integration in main game loop

**Files:** `src/js/core/shipPhysics.js`

**Changes:**
- Replace element-based physics with state-based physics
- Use `integrateStateRK4()` for thrust application
- Update `orbitalElements` field from state after integration (for display)

**Acceptance Criteria:**
- [ ] Ship state updated using RK4 integration
- [ ] Orbital elements derived from state each frame (for UI display)
- [ ] Ship position matches state.x, state.y, state.z
- [ ] Time acceleration works correctly
- [ ] Sail controls update thrust correctly

**Test Method:**
```javascript
// Visual test:
// 1. Set time scale to 10000x
// 2. Watch ship orbit for 60 seconds
// 3. Should complete smooth orbit, no drift
// 4. Compare final position to predicted trajectory - should match
```

---

### Unit 6: Increase maxSteps (OPTIONAL - If Performance Allows)

**Description:** Raise trajectory resolution cap for long-duration predictions

**Files:** `src/js/config.js`

**Changes:**
```javascript
TRAJECTORY_RENDER_CONFIG: {
    stepsPerDay: 12,
    minSteps: 200,
    maxSteps: 21900,  // Was 8760 - supports 5 years at 12 steps/day
}
```

**Acceptance Criteria:**
- [ ] 5-year trajectory uses 21,900 steps (12/day for full duration)
- [ ] 60 FPS maintained during trajectory calculation
- [ ] Cache TTL prevents recalculation spam

**Test Method:**
```javascript
// Set trajectory duration to 1825 days (5 years)
// Enable PREDICTED PATH
// Monitor FPS - should stay at 60
// Check browser console for trajectory cache hits
```

**Decision Point:** Only implement if Units 1-5 still show visible zigzag at long durations.

---

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| RK4 too slow for 60 FPS | Medium | High | Use RK4 for trajectory prediction, keep RK2 for main loop initially |
| State drift over long timescales | Low | Medium | RK4 has better energy conservation than RK2, test with multi-year integrations |
| SOI transitions break | Low | High | Test Mercury/Venus flybys, verify state conversion at SOI boundary |
| Autopilot breaks | Low | Medium | Autopilot uses trajectory prediction (already state-based after Unit 3) |
| Rendering breaks | Low | High | Trajectory points still have position {x, y, z}, rendering unchanged |
| Cache invalidation | Low | Low | Cache key still based on input elements, hash unchanged |

---

## 5. Testing Strategy

### 5.1 Unit Tests

**Energy Conservation Test:**
```javascript
// Integrate circular orbit for 1 orbital period
// Energy should remain constant (no thrust)
const energies = [];
for (let i = 0; i < 365; i++) {
    const E = (state.vx**2 + state.vy**2 + state.vz**2)/2 - SUN.mu/r;
    energies.push(E);
    state = integrateStateRK4(state, {x:0,y:0,z:0}, 1.0, SUN.mu);
}
const variance = stddev(energies);
console.log(`Energy variance: ${variance} (should be < 1e-10)`);
```

**Thrust Direction Test:**
```javascript
// Verify thrust calculation from state matches thrust from elements
const elements = ships[0].orbitalElements;
const state = ships[0].state;
const thrust1 = calculateSailThrust(elements, ships[0].sail);
const thrust2 = calculateSailThrustFromState(state, ships[0].sail);
const diff = Math.sqrt((thrust1.x-thrust2.x)**2 + ...);
console.log(`Thrust difference: ${diff} (should be < 1e-12)`);
```

### 5.2 Integration Tests

**Trajectory Accuracy Test:**
```javascript
// Compare RK4 state-vector vs. old element-based
// Predict 60-day trajectory with both methods
// Compare endpoints - RK4 should match 10× resolution reference

const traj_STATE = predictTrajectory({..., method: 'state'});
const traj_REF = predictTrajectory({..., steps: 7200, method: 'elements'});
const error = distance(traj_STATE[last], traj_REF[last]);
console.log(`Endpoint error: ${error * 149597870.7} km`);
// EXPECTED: < 10,000 km (vs. current ~180,000 km)
```

**SOI Transition Test:**
```javascript
// Set course for Mercury
// Fly to SOI boundary
// Verify smooth transition (no position/velocity jump)
// Log state before/after SOI entry
```

### 5.3 Manual Verification

**Visual Smoothness:**
1. Load game at Earth
2. Set 60-day trajectory to Mars
3. Zoom to SYSTEM level (view entire solar system)
4. **EXPECTED:** Smooth spiral with no visible zigzag
5. Adjust sail yaw/pitch - trajectory updates smoothly

**Performance:**
1. Set 5-year trajectory (1825 days)
2. Monitor FPS - should stay at 60
3. Check trajectory calculation time in console
4. **EXPECTED:** < 50ms per trajectory recalculation

**Game Loop:**
1. Set time scale to 10,000,000×
2. Let ship orbit for 1 full period (real-time ~3 seconds)
3. **EXPECTED:** Smooth orbit, ship returns to start position
4. Compare to predicted trajectory - should overlap perfectly

---

## 6. Implementation Strategy

**Order of implementation:**
1. Units 1-2 (add integration functions) - isolated, testable
2. Unit 3 (trajectory predictor) - VISUAL FIX OCCURS HERE
3. Test trajectory rendering - should see zigzag eliminated
4. Unit 4-5 (ship data + physics loop) - main game loop migration
5. Unit 6 (increase maxSteps) - only if needed

**Git commits:**
- Commit after each unit: `[Unit N] Description`
- Example: `[Unit 1] Add RK4 state-vector integration`

**Testing checkpoints:**
- After Unit 3: Visual trajectory test (PRIMARY FIX VALIDATION)
- After Unit 5: Game loop integration test
- After Unit 6: Long-duration performance test

---

## 7. Rollback Plan

**If RK4 is too slow:**
- Revert Units 4-5 (keep trajectory predictor with RK4, use RK2 for main loop)
- Hybrid approach: High-accuracy prediction, lighter realtime simulation

**If SOI transitions break:**
- Add state-vector boundary conditions (copy SOI.js logic to state domain)
- Worst case: Revert to elements at SOI boundary, convert back to state after

**If autopilot breaks:**
- Autopilot already uses trajectory prediction (will automatically use state-based after Unit 3)
- No special handling needed

**If visual quality degrades:**
- Unlikely - RK4 is strictly more accurate than RK2
- If occurs, check thrust calculation from state (Unit 2)

---

## 8. Success Criteria

✅ **Fix successful when:**
- Trajectory renders as smooth spiral at all zoom levels
- **NO visible zigzag at SYSTEM zoom** (primary success metric)
- 60 FPS performance maintained
- Trajectory endpoint error < 10,000 km for 60-day predictions (vs. current ~180,000 km)
- Encounter markers still function correctly
- Ship returns to start position after 1 orbital period (circular orbit test)
- Energy conservation: variance < 1e-10 over 1 orbital period
- All existing features work (SOI, autopilot, time acceleration)

---

## 9. References

- **NASA SPICE Toolkit:** Uses state-vector integration for high-accuracy ephemerides
- **Runge-Kutta Methods:** Numerical Recipes in C, Chapter 16.1
- **Previous analysis:** `reports/zigzag-failure-root-cause-analysis-2026-02-10.md`
- **Comprehensive review:** `reports/zigzag-bug-comprehensive-analysis-2026-02-10.md`

---

**Status:** Draft - Ready for review and approval
**Next Step:** Review by all 7 perspectives, then implement if approved
