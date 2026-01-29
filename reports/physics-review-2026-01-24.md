# Physics & Gravity Mechanics Review
**Date:** 2026-01-24
**Focus:** SOI mechanics, gravitational slingshots, multi-body physics accuracy

---

## Executive Summary

The game implements **patched conics (2-body physics)** with full SOI transitions and hyperbolic orbit support, but **gravitational slingshots are not functional** because multi-body forces and gravity assist calculations are missing. The math that IS implemented appears correct. SOI radii are enlarged 10-100× for gameplay, which causes extreme eccentricity flybys.

**Current State:**
- ✅ SOI detection and transitions (heliocentric ↔ planetocentric)
- ✅ Hyperbolic orbit math (e ≥ 1 supported)
- ✅ Escape velocity detection
- ✅ Extreme flyby handling (e > 50 linear interpolation)
- ❌ Multi-body gravity (no simultaneous forces)
- ❌ Gravity assist ΔV calculations
- ❌ Hyperbolic excess velocity (v∞) tracking
- ❌ Perturbation forces from other bodies

---

## 1. PHYSICS/REALISM PERSPECTIVE

### ✅ What's Correct

**Keplerian Mechanics (`src/js/lib/orbital.js`)**
- Kepler equation solver: Newton-Raphson with 1e-12 tolerance, 50 iterations ✓
- Hyperbolic Kepler equation: `M = e*sinh(H) - H` correctly implemented ✓
- True anomaly conversions: Both elliptic and hyperbolic cases handled ✓
- Mean motion: `n = √(μ/|a|³)` uses absolute value for hyperbolic orbits ✓

**SOI Mechanics (`src/js/lib/soi.js`)**
- Frame conversions: Heliocentric ↔ planetocentric math is correct ✓
- State vector → orbital elements: Standard algorithm properly implemented ✓
- Hyperbolic support: Handles negative semi-major axis, unbounded M0 ✓
- Energy check: `E = v²/2 - μ/r` correctly determines orbit type ✓

**Solar Sail Physics (`src/js/lib/orbital-maneuvers.js`)**
- Solar pressure: `P(r) = P₁ × (1/r)²` correct inverse-square law ✓
- Thrust formula: `F = 2 × P × A × cos²(θ) × ρ` correct for perfect reflector ✓
- Gauss's variational equations: Correctly modifies orbital elements from thrust ✓
- State-vector method: Position continuity guaranteed (only velocity changes) ✓

**Constants**
- μ_sun = 2.959122e-4 AU³/day² ✓
- Solar pressure at 1 AU = 4.56e-6 N/m² ✓
- Unit conversions (AU, days, kg, m/s²) ✓

### ⚠️ What's Simplified (Gameplay vs Realism)

**SOI Radii (config.js:143-149)**
```javascript
SOI_RADII = {
    MERCURY: 0.1 AU,    // Realistic: 0.00112 AU (89× larger)
    VENUS: 0.1 AU,      // Realistic: 0.00411 AU (24× larger)
    EARTH: 0.1 AU,      // Realistic: 0.00620 AU (16× larger)
    MARS: 0.1 AU,       // Realistic: 0.00386 AU (26× larger)
    JUPITER: 0.4 AU,    // Realistic: 0.3219 AU (1.2× larger)
}
```

**Impact:** Enlarged SOIs cause:
- Ships enter SOI at higher velocities → extreme hyperbolic flybys (e > 50)
- Numerical instability at periapsis requires linear interpolation fallback (shipPhysics.js:264-276)
- Unrealistic "straight-line" flybys instead of curved trajectories

**Physics Model: Patched Conics Only**
- Inside SOI: Only planet's gravity acts (no Sun perturbation)
- Outside SOI: Only Sun's gravity acts (no planetary perturbations)
- At SOI boundary: Instantaneous frame switch (no transition zone)

This is a **valid simplified model** (used by real mission planners for initial trajectory design), but it means:
- No n-body chaos effects
- No tidal forces
- No gravitational perturbations between planets
- Orbits are perfectly Keplerian within each SOI

### ❌ What's Missing for Gravity Assists

**1. Multi-body Forces**
- Current: 2-body only (ship + current SOI parent)
- Needed: Simultaneous forces from Sun + planets
- File: `shipPhysics.js:315-346` calculates thrust but ignores planetary perturbations

**2. Hyperbolic Excess Velocity (v∞)**
- Current: Not tracked
- Needed: `v∞ = √(-μ/a)` for hyperbolic orbits
- Purpose: Measures asymptotic velocity far from planet
- Critical for: Determining gravity assist ΔV magnitude

**3. Turning Angle (δ)**
- Current: Not calculated
- Needed: `δ = 2 × arcsin(1/(1 + r_p × v∞²/μ))`
- Purpose: How much the trajectory bends around the planet
- Critical for: Predicting exit velocity vector

**4. Gravity Assist ΔV**
- Current: No calculation
- Needed: `|Δv| = 2 × v∞ × sin(δ/2)`
- Purpose: Speed change from flyby
- Critical for: Mission planning, trajectory optimization

**5. B-plane Targeting**
- Current: No concept of aim point
- Needed: B-vector (impact parameter) for precision flybys
- Purpose: Control where the flyby bends the trajectory

**6. Tisserand Parameter**
- Current: Not conserved or tracked
- Needed: Orbital invariant for 3-body problem
- Purpose: Validate orbit changes, detect encounters

### 🔍 Math Verification Results

**Test Coverage:**
- ✅ `orbital.test.js` - Kepler solver, mean motion, anomaly conversions
- ✅ `orbital-maneuvers.test.js` - Sail thrust, Gauss equations
- ✅ `trajectory-predictor.test.js` - Path prediction
- ✅ `intersectionDetector.crossing.test.js` - Encounter detection
- ✅ `ephemeris.test.js` - Planetary position accuracy
- ⚠️ No tests for multi-body physics (because it doesn't exist)
- ⚠️ No tests for gravity assist calculations

**Known Issues Found in Code:**
1. **Extreme Eccentricity Fallback** (shipPhysics.js:517):
   ```javascript
   const EXTREME_ECCENTRICITY_THRESHOLD = 50;
   ```
   When e > 50, uses linear interpolation instead of Keplerian math
   - Reason: Hyperbolic asymptote approaches infinity, atanh domain errors
   - Fix: This is correct numerical stability handling

2. **Visual Element Lag** (shipPhysics.js:122-222):
   - Visual orbital elements lerp toward actual elements at 25%/frame
   - Can cause visual orbit to lag behind actual orbit during rapid changes
   - Not a physics error, just rendering smoothing

3. **SOI Cycling Cooldown** (shipPhysics.js:511-514):
   ```javascript
   const SOI_TRANSITION_COOLDOWN = 0.1; // ~2.4 hours
   ```
   - Prevents rapid entry/exit oscillation at SOI boundary
   - Band-aid for enlarged SOI instability

---

## 2. FUNCTIONALITY PERSPECTIVE

### ✅ What Works

**SOI Entry (shipPhysics.js:534-633)**
- Detects boundary crossing ✓
- Converts heliocentric → planetocentric state ✓
- Computes new orbital elements in planet's frame ✓
- Detects hyperbolic vs elliptic orbit ✓
- Logs "HYPERBOLIC TRAJECTORY" warning for flybys ✓
- Handles extreme flybys (e > 50) with linear path approximation ✓

**SOI Exit (shipPhysics.js:644-713)**
- Detects exit at 1.01× SOI radius (hysteresis) ✓
- Converts planetocentric → heliocentric state ✓
- Computes new orbital elements in Sun's frame ✓
- Clears extreme flyby state ✓

**Trajectory Crossing Detection (shipPhysics.js:419-509)**
- Line-sphere intersection test catches fast ships ✓
- Prevents "skipping over" SOI in single frame ✓
- Projects trajectory linearly over timestep ✓

**Hyperbolic Orbit Propagation (orbital.js:172-244)**
- Solves hyperbolic Kepler equation with Newton-Raphson ✓
- Converts H → true anomaly with atanh clamping (FM1 fix) ✓
- Handles negative true anomaly (approaching periapsis) ✓
- Position/velocity calculations work for e >= 1 ✓

### ⚠️ What's Incomplete

**Gravity Assists:**
- Ship CAN enter planetary SOI ✓
- Ship CAN achieve hyperbolic orbit (e >= 1) ✓
- Ship CAN exit SOI on hyperbolic trajectory ✓
- Ship's heliocentric velocity DOES change after exit ✓
- BUT: Velocity change is purely from frame conversion, not optimized for ΔV
- RESULT: Slingshots happen accidentally, not controllably

**Example Flow (current implementation):**
```
1. Ship approaches Venus at 40 km/s heliocentric
2. Enters SOI → converts to Venus-relative frame (say, 15 km/s relative)
3. Flies hyperbolic trajectory (e = 2.5, periapsis 20,000 km)
4. Exits SOI → converts back to heliocentric frame
5. New heliocentric velocity might be 42 km/s (gained 2 km/s)
```

**What's missing:**
- No targeting: Can't aim for specific periapsis to maximize ΔV
- No prediction: Can't see exit velocity before committing to flyby
- No optimization: Can't plan multi-flyby tours (Cassini-style)
- No visualization: Encounter markers show position, not velocity change

**Trajectory Predictor (trajectory-predictor.js:64)**
```javascript
// "prediction stops at SOI boundaries (v1 behavior)"
```
- Predicted path terminates at SOI entry
- Does NOT predict the hyperbolic flyby path through the SOI
- Does NOT show the exit trajectory
- CANNOT be used to plan gravity assists

### ❌ What Doesn't Work

**Multi-body Optimization:**
- Can't plan Venus → Earth → Mars tour
- Can't balance thrust + gravity assist for fuel efficiency
- Can't use Oberth effect (low-altitude thrust boost)

**Resonant Orbits:**
- Can't set up 2:3 resonance with planet for multiple flybys
- Can't use gravity assists to "pump" orbit over multiple encounters

**Trajectory Validation:**
- Can't verify if a planned path is physically possible
- Can't check if enough ΔV to capture at destination

---

## 3. ARCHITECTURE PERSPECTIVE

### ✅ Strengths

**Separation of Concerns:**
```
data/           → Game state (ships, planets, orbital elements)
core/           → Game logic (physics updates, time, camera)
lib/            → Pure math (orbital mechanics, SOI, thrust)
ui/             → Rendering and input
```
Clean separation ✓

**Pure Functions:**
- `orbital.js` is stateless, testable ✓
- `soi.js` has only debug state, no game state ✓
- `orbital-maneuvers.js` doesn't mutate inputs ✓

**State Management:**
- Ship orbital elements stored in `ship.orbitalElements` ✓
- SOI state tracked in `ship.soiState` ✓
- Extreme flyby state cached in `ship.extremeFlybyState` ✓
- Visual elements separate from actual: `ship.visualOrbitalElements` ✓

**Modularity:**
- SOI mechanics isolated to `soi.js` (426 lines)
- Keplerian math isolated to `orbital.js` (600+ lines)
- Thrust application isolated to `orbital-maneuvers.js`

### ⚠️ Areas for Improvement

**Physics Loop in shipPhysics.js:**
- `updateShipPhysics()` is 170 lines (lines 241-405)
- Handles: position update, SOI check, thrust calc, element update, caching, debug logging
- **Suggestion:** Extract SOI logic to separate function:
  ```javascript
  updateShipPhysics(ship, deltaTime) {
      updatePosition(ship);
      handleSOITransitions(ship);  // ← New function
      applyThrust(ship, deltaTime);
      updateCachedState(ship);
  }
  ```

**Hard-coded Constants:**
- `EXTREME_ECCENTRICITY_THRESHOLD = 50` (line 517)
- `SOI_TRANSITION_COOLDOWN = 0.1` (line 514)
- `VISUAL_ELEMENT_LERP_RATE = 0.25` (line 37)
- **Suggestion:** Move to `config.js` for tuning

**Trajectory Predictor Coupling:**
- Stops at SOI boundaries (hard-coded behavior)
- Doesn't use SOI entry/exit logic (duplicates distance checks)
- **Suggestion:** Refactor to reuse SOI detection from `shipPhysics.js`

**Missing Abstraction:**
- No "GravityModel" interface to swap 2-body ↔ n-body
- Hard to add perturbations without rewriting `updateShipPhysics()`
- **Suggestion:** Introduce force accumulator pattern:
  ```javascript
  function computeTotalAcceleration(ship) {
      let accel = computeCentralBodyGravity(ship);
      accel = addSailThrust(ship, accel);
      accel = addPerturbations(ship, accel);  // Future
      return accel;
  }
  ```

### ✅ Extensibility

**Easy to Add:**
- New celestial bodies (just add to `celestialBodies.js`)
- New ships with orbital elements (add to `ships.js`)
- Different SOI radii (edit `config.js`)
- Different sail configurations (edit `DEFAULT_SAIL`)

**Hard to Add:**
- Multi-body physics (requires rewrite of `updateShipPhysics()`)
- Gravity assist planning UI (no data model for v∞, δ, etc.)
- Trajectory optimization (no optimizer framework)
- N-body chaos detection (no Lyapunov exponent calculation)

---

## 4. FAILURE MODES PERSPECTIVE

### 🔍 Numerical Instability Risks

**1. Extreme Eccentricity (e > 50)**
- **When:** High-velocity entry into enlarged SOI
- **Why:** Hyperbolic asymptote → atanh domain errors
- **Current Fix:** Linear interpolation fallback (shipPhysics.js:264-276) ✓
- **Risk:** Ship position might diverge from actual Keplerian path over long flybys
- **Mitigation:** Only affects extreme cases, cooldown limits re-entry ✓

**2. SOI Boundary Oscillation**
- **When:** Ship velocity near tangent to SOI sphere
- **Why:** Numerical error causes rapid entry/exit cycles
- **Current Fix:** 2.4-hour cooldown + 1.01× exit hysteresis (lines 109, 514) ✓
- **Risk:** Ship "stuck" outside SOI for 2.4 hours if velocity error causes early exit
- **Mitigation:** Cooldown is per-body, allows entry to other SOIs ✓

**3. Kepler Solver Non-convergence**
- **When:** Very high eccentricity or near-parabolic orbits
- **Why:** Newton-Raphson divergence
- **Current Fix:** 50 iteration limit, returns best estimate (orbital.js:109-126) ✓
- **Risk:** Position error if solver doesn't converge
- **Observed:** No reported failures in testing ✓

**4. Mean Anomaly Overflow**
- **When:** Very long simulation times (thousands of orbits)
- **Why:** Floating-point precision loss in `M = M0 + n*Δt`
- **Current Fix:** None (modulo normalization only for elliptic)
- **Risk:** Low for solar sail game (orbits take months, not milliseconds)

**5. Precision Loss in Frame Conversions**
- **When:** Very small planet-relative velocities (<0.001 km/s)
- **Why:** Subtracting two large heliocentric velocities
- **Current Fix:** None (uses double precision throughout)
- **Risk:** Minimal (JavaScript uses 64-bit floats) ✓
- **Test:** Could add unit test for Earth flyby at 11 km/s (Earth's orbital velocity ≈ 30 km/s)

### 🐛 Edge Cases & Bugs

**1. Ship Inside Planet Radius**
- **Test:** Set ship position at 0.00001 AU from planet center
- **Behavior:** Physics undefined (r → 0, gravity → ∞)
- **Current Protection:** None
- **Recommendation:** Add minimum radius check (e.g., 1.1× planet radius)

**2. Retrograde Orbit in SOI**
- **Test:** Enter Venus SOI with retrograde velocity
- **Behavior:** Should work (orbital.js handles negative h_z)
- **Verification:** Debug logs show "RETROGRADE" warning ✓
- **Status:** Appears functional

**3. Parabolic Escape (e = 1.0)**
- **Test:** Ship achieves exactly escape velocity
- **Behavior:** `energy = 0`, `a → ∞` (line 236-239 in soi.js handles this) ✓
- **Fallback:** Sets `a = r * 1000` for near-parabolic
- **Status:** Handled ✓

**4. Collision with Planet**
- **Test:** Hyperbolic trajectory with periapsis < planet radius
- **Behavior:** Ship flies through planet (no collision detection)
- **Current Protection:** None
- **Recommendation:** Add periapsis check, fail-safe to circular orbit at surface

**5. SOI-within-SOI (Moon)**
- **Test:** Enter Ganymede's SOI while in Jupiter's SOI
- **Behavior:** Code only tracks one SOI at a time (`ship.soiState.currentBody`)
- **Status:** Moons don't have SOI radii defined (config.js only has planets)
- **Result:** Works by omission (moons can't capture ships)

**6. Multiple SOI Overlap**
- **Test:** Ship at point equidistant from Venus (0.1 AU SOI) and Earth (0.1 AU SOI)
- **Behavior:** `checkSOIEntry()` returns first match in array order (soi.js:67)
- **Risk:** Non-deterministic if planet array order changes
- **Recommendation:** Add "dominant SOI" logic (closest periapsis, or largest μ/r²)

### 📊 Performance Bottlenecks

**1. Trajectory Predictor**
- 200 timesteps × 60 days = 12,000 steps for 2-year prediction
- Each step: position calc + orbit crossing check
- **Status:** "< 10ms" claimed in CLAUDE.md
- **Verification:** No profiling data in code

**2. Star Catalog Rendering**
- 5,080 stars × every frame
- Each star: precession calc + coordinate transform + projection
- **Status:** Claims "60 FPS" in CLAUDE.md
- **Mitigation:** View frustum culling implemented ✓

**3. Hyperbolic Debug Logging**
- When enabled: logs every frame (60× per second)
- Lines 796-932: comprehensive state dump
- **Risk:** Console spam could slow browser
- **Mitigation:** Gated behind `hyperbolicDebugEnabled` flag ✓

---

## ACTION ITEMS

### Priority 1: Fix Gravity Assists (Slingshots)

#### A1.1 - Implement Hyperbolic Excess Velocity Tracking
**File:** `src/js/lib/gravity-assist.js` (new)
**Effort:** 2 hours
**Description:** Calculate v∞ for hyperbolic orbits
```javascript
export function getHyperbolicExcessVelocity(orbitalElements) {
    if (orbitalElements.e < 1) return 0;
    return Math.sqrt(-orbitalElements.μ / orbitalElements.a);
}
```

#### A1.2 - Add Turning Angle Calculation
**File:** `src/js/lib/gravity-assist.js`
**Effort:** 1 hour
**Formula:**
```javascript
export function getTurningAngle(vInfinity, periapsis, mu) {
    return 2 * Math.asin(1 / (1 + periapsis * vInfinity * vInfinity / mu));
}
```

#### A1.3 - Add Gravity Assist ΔV Predictor
**File:** `src/js/lib/gravity-assist.js`
**Effort:** 3 hours
**Description:** Given approach velocity, periapsis, planet velocity, compute exit velocity vector
```javascript
export function predictGravityAssist(vApproach, rPeriapsis, vPlanet, mu) {
    // 1. Compute v∞_in in planet frame
    // 2. Compute turning angle δ
    // 3. Rotate v∞_in by δ around periapsis normal
    // 4. Convert v∞_out back to heliocentric frame
    // 5. Return {vExit, deltaV}
}
```

#### A1.4 - Extend Trajectory Predictor Through SOI
**File:** `src/js/lib/trajectory-predictor.js`
**Effort:** 4 hours
**Description:** Don't stop at SOI boundary; switch to planetocentric frame, predict hyperbolic arc, switch back
- Requires integrating SOI entry/exit logic from `shipPhysics.js`
- Show complete flyby path in visualization

#### A1.5 - Add Gravity Assist UI Panel
**File:** `src/index.html`, `src/js/ui/uiUpdater.js`
**Effort:** 3 hours
**Display:**
- Approach velocity (v∞_in)
- Periapsis altitude
- Turning angle (δ)
- Exit velocity (v∞_out)
- Predicted ΔV magnitude and direction
- Closest approach time

**Estimated Total:** 13 hours

---

### Priority 2: Fix Numerical Stability Issues

#### A2.1 - Make SOI Radii Configurable at Runtime
**File:** `src/js/config.js`, UI settings panel
**Effort:** 2 hours
**Why:** Allow players to use realistic SOI radii (reduces extreme eccentricity flybys)

#### A2.2 - Add Planet Collision Detection
**File:** `src/js/core/shipPhysics.js`
**Effort:** 1 hour
**Check:** If `periapsis < planet.radius × 1.1`, force circular parking orbit at 1.1× radius
**Log:** "IMPACT PREVENTED: Circularized at safe altitude"

#### A2.3 - Add Multi-SOI Resolution
**File:** `src/js/lib/soi.js`
**Effort:** 2 hours
**Logic:** When multiple SOIs overlap, choose body with largest `μ/r²` (dominant gravity)

**Estimated Total:** 5 hours

---

### Priority 3: Improve Architecture

#### A3.1 - Extract SOI Transition Logic
**File:** `src/js/core/shipPhysics.js` → `src/js/lib/soi.js`
**Effort:** 2 hours
**Refactor:** Move `handleSOIEntry()` and `handleSOIExit()` to `soi.js`

#### A3.2 - Move Magic Constants to Config
**File:** `src/js/config.js`
**Effort:** 30 minutes
**Add:**
```javascript
export const PHYSICS_CONFIG = {
    extremeEccentricityThreshold: 50,
    soiTransitionCooldown: 0.1,  // days
    visualElementLerpRate: 0.25,
    minPeriapsisMultiplier: 1.1, // × planet radius
};
```

#### A3.3 - Add Force Accumulator Pattern (Optional)
**File:** `src/js/core/shipPhysics.js`
**Effort:** 4 hours
**Benefit:** Makes multi-body gravity easier to add later

**Estimated Total:** 6.5 hours

---

### Priority 4: Add Missing Mechanics (For AI Nav Computer)

#### A4.1 - Implement Perturbation Forces
**File:** `src/js/lib/perturbations.js` (new)
**Effort:** 8 hours
**Description:** Add simultaneous Sun + planetary gravity
- Requires switching from Gauss equations to numerical integration (RK4)
- Adds ~5-10% orbital precession for realistic mechanics

#### A4.2 - Add Oberth Effect Calculations
**File:** `src/js/lib/orbital-maneuvers.js`
**Effort:** 2 hours
**Formula:** ΔV_effective = ΔV × (v_current / v_circular) for low-altitude burns

#### A4.3 - Add Lambert Solver
**File:** `src/js/lib/lambert.js` (new)
**Effort:** 12 hours
**Description:** Solve 2-point boundary value problem (how to get from A to B in time T)
- Critical for autopilot ("go to Mars in 200 days")

#### A4.4 - Add Trajectory Optimizer
**File:** `src/js/lib/optimizer.js` (new)
**Effort:** 20 hours
**Description:** Gradient descent to minimize ΔV or time for multi-body tour
- Uses gravity assist ΔV predictions
- Optimizes periapsis altitude, approach angle

**Estimated Total:** 42 hours

---

### Priority 5: Testing & Validation

#### A5.1 - Add Gravity Assist Test Cases
**File:** `src/js/lib/gravity-assist.test.js` (new)
**Effort:** 3 hours
**Cases:**
- Venus flyby with known v∞ → verify turning angle
- Compare to NASA mission data (Voyager 2, Cassini)

#### A5.2 - Add SOI Transition Regression Tests
**File:** `src/js/lib/soi.test.js` (new)
**Effort:** 2 hours
**Cases:**
- Entry at various speeds, angles
- Exit verification (state continuity)
- Extreme eccentricity handling

#### A5.3 - Add Collision Detection Test
**File:** `src/js/core/shipPhysics.test.js` (new)
**Effort:** 1 hour

**Estimated Total:** 6 hours

---

## Summary of Action Items

| Priority | Focus | Estimated Effort | Unlocks |
|----------|-------|------------------|---------|
| **P1** | Gravity Assists | **13 hours** | **Functional slingshots** |
| **P2** | Stability Fixes | **5 hours** | Fewer crashes, realistic SOI |
| **P3** | Code Quality | **6.5 hours** | Maintainability |
| **P4** | Advanced Physics | **42 hours** | AI autopilot, mission planning |
| **P5** | Testing | **6 hours** | Confidence in math |
| **TOTAL** | | **72.5 hours** | |

---

## Recommendations

**For playable slingshots:** Complete **P1 (13 hours)** to make gravity assists functional.

**For AI nav computer:** Complete **P1 + P4** (55 hours total). The AI needs:
- Gravity assist prediction (P1.3)
- Lambert solver to plan routes (P4.3)
- Trajectory optimizer to minimize ΔV (P4.4)

**Quick wins:**
- **A2.2** (1 hour): Prevent planet crashes
- **A3.2** (30 min): Move constants to config for easier tuning
- **A1.1** (2 hours): Show v∞ in UI so players can see "slingshot energy"

---

## Appendix: Math Verification

### Validated Formulas

| Formula | Location | Verified | Notes |
|---------|----------|----------|-------|
| Kepler Eq. (elliptic) | orbital.js:99 | ✓ | Newton-Raphson, 1e-12 tolerance |
| Kepler Eq. (hyperbolic) | orbital.js:173 | ✓ | asinh initial guess |
| E → ν (elliptic) | orbital.js:141 | ✓ | atan2 formulation |
| H → ν (hyperbolic) | orbital.js:246 | ✓ | atanh clamping for FM1 |
| State → Elements | soi.js:190 | ✓ | Standard algorithm |
| Semi-major axis | soi.js:221 | ✓ | a = -μ/(2E) |
| Eccentricity vector | soi.js:245 | ✓ | e = (v×h)/μ - r̂ |
| Inclination | soi.js:262 | ✓ | cos(i) = h_z/|h| |
| Solar pressure | orbital-maneuvers.js:53 | ✓ | P = P₁/r² |
| Sail thrust | orbital-maneuvers.js | ✓ | F = 2PA cos²θ ρ |
| Gauss eq. (semi-major) | Implied in applyThrust | ✓ | State-vector method |

### Missing Formulas (Needed for Gravity Assists)

| Formula | Purpose | Priority |
|---------|---------|----------|
| v∞ = √(-μ/a) | Hyperbolic excess velocity | **P1.1** |
| δ = 2 arcsin(1/(1 + r_p v∞²/μ)) | Turning angle | **P1.2** |
| Δv = 2v∞ sin(δ/2) | Gravity assist ΔV | **P1.3** |
| B·B = r_p² + 2r_p μ/v∞² | B-plane targeting | **P4** |
| T = (1/a_i)(a_i/a_f)^(2/3) + ... | Tisserand parameter | **P4** |

---

**End of Report**

*Generated: 2026-01-24*
*Next Steps: Review with team, prioritize action items, begin implementation*
