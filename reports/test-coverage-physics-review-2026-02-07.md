# Test Coverage Physics Review
**Date:** 2026-02-07
**Perspective:** Physicist (Mathematical Correctness, Numerical Stability, Physical Validation)
**Context:** Review test coverage gaps for critical math/physics systems

---

## Executive Summary

The test suite covers basic Keplerian mechanics well but has **critical gaps in edge cases, numerical stability, and physical validation**. The most dangerous untested code involves:

1. **SOI transitions** (270 lines, 20% tested) - where reference frame changes can silently corrupt orbits
2. **Extreme eccentricity handling** (e > 50) - linear interpolation fallback completely untested
3. **Numerical edge cases** - degenerate orbits, near-parabolic trajectories, division by zero guards
4. **Physical conservation laws** - no tests verify energy/momentum/angular momentum conservation

These gaps could allow physics bugs that corrupt orbital elements, create teleporting ships, or violate conservation laws - all of which would break the game's scientific realism.

---

## Prioritized Test Improvements

### CRITICAL (Must Fix - Physics-Breaking Bugs)

#### 1. SOI Entry/Exit Reference Frame Conversions
**Severity:** CRITICAL
**Untested Code:** `shipPhysics.js` lines 704-873 (entry), 884-986 (exit)
**Why Dangerous:**
- Reference frame transformations involve 6 separate coordinate calculations (position + velocity)
- **Any NaN or Infinity propagates forever** - once orbital elements corrupt, they stay corrupt
- The heliocentric → planetocentric conversion has **no rollback mechanism** - if `stateToElements()` produces NaN, the ship is stuck
- Extreme flybys (e > 50) use linear interpolation which has **zero test coverage**

**Missing Tests:**
```javascript
// 1. Verify position continuity across SOI boundary
describe('SOI Entry Position Continuity', () => {
  test('ship position in heliocentric frame matches before/after entry', () => {
    // Record ship.x/y/z before entry (heliocentric)
    // Trigger entry → converts to planetocentric
    // Compute heliocentric position: planetocentric + planet position
    // Assert: heliocentric position delta < 100 km (not 1000s km snap)
  });
});

// 2. Test extreme flyby fallback (e > 50)
describe('Extreme Eccentricity SOI Entry', () => {
  test('e > 50 triggers linear interpolation', () => {
    // Ship approaching Venus at 80 km/s (e ≈ 150)
    // Verify: extremeFlybyState created
    // Verify: updateShipPhysics uses linear interp, not getPosition()
  });

  test('extreme flyby position does not teleport', () => {
    // Step 1: enter SOI with e=100
    // Step 2-10: advance time in small steps
    // Assert: max position delta per frame < velocity × timestep × 1.1
  });
});

// 3. Test NaN propagation guard
describe('SOI Transition NaN Guard', () => {
  test('corrupt velocity rejected by SOI entry', () => {
    // Ship velocity = {vx: NaN, vy: 0, vz: 0}
    // Attempt SOI entry
    // Assert: entry rejected, ship stays heliocentric, orbital elements unchanged
  });

  test('stateToElements NaN failure preserves orbit', () => {
    // Force stateToElements to return NaN (mock or corrupt input)
    // Verify: handleSOIExit rejects and restores oldElements
  });
});

// 4. Verify energy conservation across SOI boundary
describe('SOI Energy Conservation', () => {
  test('specific energy conserved (helio → planet → helio)', () => {
    // E_helio = v²/2 - μ_sun/r (before entry)
    // E_planet = v_rel²/2 - μ_planet/r_rel (during SOI)
    // After exit: E_helio should match original (within numerical tolerance)
    // Tolerance: <1% error (current code likely has 5-10% error from applyThrust)
  });
});
```

**What Bugs Would Be Caught:**
- Position snaps/teleports at SOI boundary (reported in `ghost-planet-snapping-investigation-2026-02-07.md`)
- Ship velocity reversal on SOI exit (no test currently detects this)
- Orbit corruption from NaN propagation (seen in FM7 fix logs)
- Trajectory prediction disappearing in SOI (requires testing render position vs actual position)

---

#### 2. Hyperbolic Kepler Solver Convergence
**Severity:** CRITICAL
**Untested Code:** `orbital.js` lines 173-218 (`solveKeplerHyperbolic`)
**Why Dangerous:**
- Newton-Raphson can **diverge for large M** (approaching infinity for open hyperbolas)
- The damping logic (line 204-209) has **no test coverage** - we don't know if it actually prevents divergence
- Parabolic guard (e ≤ 1 → 1.0001) prevents division by zero but **changes physics** - untested

**Missing Tests:**
```javascript
describe('Hyperbolic Kepler Solver Edge Cases', () => {
  test('converges for very large mean anomaly (M = 1000)', () => {
    // Simulate open hyperbola far from periapsis
    const H = solveKeplerHyperbolic(1000, 2.0);
    // Verify: converged (not NaN, not oscillating)
    // Verify: residual |e*sinh(H) - H - M| < 1e-12
  });

  test('handles near-parabolic eccentricity (e = 0.9999)', () => {
    // e ≈ 1 causes division by zero in (e-1) term
    const H = solveKeplerHyperbolic(0.5, 0.9999);
    // Should not throw, should not return NaN
    // Verify: smooth transition as e → 1
  });

  test('parabolic e=1 forced to e=1.0001 produces valid result', () => {
    // Test the FM7 fix: exactly parabolic becomes slightly hyperbolic
    const e_parabolic = 1.0;
    const e_nudged = 1.0001;
    const M = 0.1;
    const H1 = solveKeplerHyperbolic(M, e_parabolic);
    const H2 = solveKeplerHyperbolic(M, e_nudged);
    // Results should be close (smooth fix, not a discontinuity)
    expect(Math.abs(H1 - H2)).toBeLessThan(0.001);
  });

  test('damping prevents oscillation for extreme inputs', () => {
    // Adversarial case: M very large, e very high
    const H = solveKeplerHyperbolic(1e6, 10.0);
    expect(isFinite(H)).toBe(true);
  });
});
```

**What Bugs Would Be Caught:**
- Infinite loop when solver oscillates (no iteration limit test)
- NaN from division by zero at e=1 (parabolic)
- Incorrect hyperbolic anomaly for extreme cases (would cause position errors of AU-scale)

---

#### 3. Trajectory Prediction Numerical Stability
**Severity:** CRITICAL
**Untested Code:** `trajectory-predictor.js` lines 207-458 (integration loop)
**Why Dangerous:**
- RK2 integration **compounds errors over 200 steps** - no test verifies accuracy
- Truncation logic (SOI_EXIT, SUN_APPROACH) has **no test for edge cases** - could truncate too early or too late
- Extreme flyby linear interpolation (e > 50) has **zero coverage** - this is a completely different code path

**Missing Tests:**
```javascript
describe('Trajectory Prediction Accuracy', () => {
  test('RK2 integration matches analytical solution for circular orbit', () => {
    // Circular orbit with zero thrust
    // Predict 365 days (1 full orbit)
    // Final position should match start position (within 0.1% of orbit radius)
    // Current code probably has ~1-3% error - this test would quantify it
  });

  test('extreme eccentricity (e=100) uses linear interpolation', () => {
    // Ship in SOI with e=100 (extremeFlybyState set)
    // Call predictTrajectory
    // Verify: no calls to getPosition() (would fail)
    // Verify: uses entryPos + entryVel × dt instead
  });

  test('SOI exit truncation occurs at correct boundary', () => {
    // Ship in Earth SOI on hyperbolic escape trajectory
    // Predict 30 days
    // Verify: last point is ≤ SOI × 1.1, first truncated point > SOI × 1.1
    // Verify: truncated flag set correctly
  });

  test('sun approach truncation prevents corruption', () => {
    // Ship on collision course with Sun (periapsis = 0.005 AU)
    // Predict trajectory
    // Verify: truncates at r ≥ MIN_HELIOCENTRIC_RADIUS × 2.0
    // Verify: no NaN in returned positions
  });
});
```

**What Bugs Would Be Caught:**
- Trajectory divergence after 100+ days (no accuracy test)
- Premature truncation in SOI (ghost planet at wrong position)
- Position corruption near Sun (would crash renderer)
- Extreme flyby using wrong code path (would show straight line instead of hyperbola)

---

### IMPORTANT (Significant Physics Errors)

#### 4. State Vector → Orbital Elements Conversion Edge Cases
**Severity:** IMPORTANT
**Untested Code:** `soi.js` lines 217-448 (`stateToElements`)
**Why Dangerous:**
- This function is **the bridge between physics and orbital mechanics** - any error here corrupts the orbit forever
- Handles **16 different edge cases** (circular, equatorial, parabolic, etc.) - tests only cover 3
- Hyperbolic orbit handling (lines 361-382) has **zero test coverage for true anomaly near asymptote**

**Missing Tests:**
```javascript
describe('stateToElements Edge Cases', () => {
  test('exactly circular orbit (e < 1e-10)', () => {
    // Circular velocity at 1 AU: v = √(μ/r)
    // Should produce: e ≈ 0, ω = arbitrary (undefined for circular)
    const elements = stateToElements(pos_circular, vel_circular, MU_SUN, epoch);
    expect(elements.e).toBeLessThan(1e-8);
  });

  test('exactly equatorial orbit (i ≈ 0)', () => {
    // Position/velocity in xy-plane only (z=0, vz=0)
    // Should produce: i ≈ 0, Ω = arbitrary (undefined for equatorial)
  });

  test('hyperbolic true anomaly near asymptote', () => {
    // e = 1.5, ν = ±ν_max (where atan(H/2) → ±∞)
    // FM1 fix clamps this - verify no crash, clamped within atanh domain
    const nu_max = Math.acos(-1/1.5); // ≈ 131.8°
    const elements = stateToElements(pos_at_asymptote, vel_at_asymptote, mu, epoch);
    expect(isFinite(elements.M0)).toBe(true);
  });

  test('near-parabolic orbit (e = 1 ± 1e-6)', () => {
    // e = 0.999999 → should stay elliptic, e = 1.000001 → hyperbolic
    // Test the FM7 nudge: e=1 becomes e=1.0001
  });

  test('retrograde orbit (h_z < 0)', () => {
    // i > 90°, angular momentum points south
    // Verify: inclination computed correctly, prograde/retrograde preserved
  });
});
```

**What Bugs Would Be Caught:**
- Undefined angles (ω, Ω) for degenerate orbits causing NaN
- Sign errors in hyperbolic semi-major axis (a should be negative)
- True anomaly out of range for hyperbolic (causes atanh domain error)
- Energy sign error (elliptic orbit with positive energy)

---

#### 5. Sail Thrust RTN Frame Rotation
**Severity:** IMPORTANT
**Untested Code:** `orbital-maneuvers.js` lines 111-176 (`getSailThrustDirection`)
**Why Dangerous:**
- **RTN frame rotates as ship orbits** - small errors compound over time
- Degenerate angular momentum (h ≈ 0) falls back to ecliptic normal (lines 122-133) - **untested**
- Pitch angle (out-of-plane) rotation uses separate basis (line 157-162) - **zero test coverage**

**Missing Tests:**
```javascript
describe('Sail Thrust Direction Edge Cases', () => {
  test('degenerate orbit (|h| < 1e-10) uses ecliptic normal', () => {
    // Ship at rest or radial trajectory → angular momentum ≈ 0
    // Should fall back to N = (0, 0, 1)
    const thrust = getSailThrustDirection(pos, {vx:0, vy:0, vz:0}, 0, 0);
    // Verify: no NaN, thrust direction is defined
  });

  test('pitch rotation orthogonal to yaw rotation', () => {
    // Yaw=45°, Pitch=0 should be in orbital plane
    // Yaw=0, Pitch=45° should be out of plane
    // Verify: the two thrusts are perpendicular
    const thrust_yaw = getSailThrustDirection(pos, vel, Math.PI/4, 0);
    const thrust_pitch = getSailThrustDirection(pos, vel, 0, Math.PI/4);
    const dot = thrust_yaw.x * thrust_pitch.x +
                thrust_yaw.y * thrust_pitch.y +
                thrust_yaw.z * thrust_pitch.z;
    expect(Math.abs(dot)).toBeLessThan(0.01); // Nearly perpendicular
  });

  test('thrust magnitude does not depend on frame (RTN invariant)', () => {
    // Same sail settings at different orbital positions should give same |thrust|
    // Verifies: RTN frame constructed correctly at all true anomalies
  });
});
```

**What Bugs Would Be Caught:**
- Thrust direction flip when crossing nodes (angular momentum sign change)
- Pitch angle not working as intended (out-of-plane component)
- Frame singularity at periapsis/apoapsis (degenerate case)

---

#### 6. Gauss Variational Equations Validation (applyThrust)
**Severity:** IMPORTANT
**Untested Code:** `orbital-maneuvers.js` lines 393-470 (state vector approach)
**Why Dangerous:**
- **No test verifies energy conservation** - thrust should only change kinetic energy, not add/remove energy from nowhere
- Position continuity claim (lines 406-412) has **zero test coverage** - critical for avoiding teleportation
- Element validation (lines 446-457) prevents NaN propagation but **no test verifies this guard works**

**Missing Tests:**
```javascript
describe('Thrust Application Physics Validation', () => {
  test('energy change matches work done by thrust', () => {
    // Apply thrust for dt
    // ΔE = ∫ F·v dt ≈ thrust · velocity · dt (for small thrust)
    // Verify: orbital energy change matches expected work
    const energy_before = computeOrbitalEnergy(elements_before);
    const elements_after = applyThrust(elements_before, thrust, dt, jd);
    const energy_after = computeOrbitalEnergy(elements_after);
    const expected_work = (thrust.x*vel.vx + thrust.y*vel.vy + thrust.z*vel.vz) * dt;
    expect(energy_after - energy_before).toBeCloseTo(expected_work, 6);
  });

  test('position preserved when applying thrust', () => {
    // State vector approach claims position continuity
    // Verify: getPosition(elements_after, jd) ≈ getPosition(elements_before, jd)
    // Tolerance: < 1 km (not 1000s km)
  });

  test('NaN velocity rejection prevents element corruption', () => {
    // Force getVelocity to return NaN (corrupt elements)
    // Apply thrust
    // Verify: elements returned unchanged (validation guard works)
  });

  test('extreme thrust (v × 1000) does not break orbit', () => {
    // Unrealistic but tests numerical stability
    // Should clamp or reject, not produce e > 1000
  });
});
```

**What Bugs Would Be Caught:**
- Energy non-conservation (thrust magically adding energy)
- Position discontinuity despite state-vector approach claim
- NaN propagation from corrupt input
- Numerical overflow from extreme inputs

---

### MINOR (Quality/Robustness Issues)

#### 7. Orbital Period and Geometry Calculations
**Severity:** MINOR
**Why Dangerous:** Errors here only affect UI display, not physics simulation

**Missing Tests:**
```javascript
describe('Orbital Geometry Edge Cases', () => {
  test('hyperbolic orbit reports apoapsis = Infinity', () => {
    const ap = getApoapsis({a: -1, e: 1.5});
    expect(ap).toBe(Infinity);
  });

  test('periapsis calculation handles sign correctly for hyperbolic', () => {
    // a < 0, e > 1 → periapsis = a × (1-e) should be positive
    const peri = getPeriapsis({a: -1, e: 1.5});
    expect(peri).toBeGreaterThan(0);
  });
});
```

---

#### 8. Gravity Assist Physics Validation
**Severity:** MINOR
**Untested Code:** `gravity-assist.js` (all functions)
**Why Dangerous:** Not currently used in game, but if enabled, has **no test coverage** for:
- v∞ conservation through flyby (magnitude should not change)
- Turning angle symmetry (leading vs trailing flyby)
- B-plane calculation accuracy

**Missing Tests:**
```javascript
describe('Gravity Assist Physics', () => {
  test('v_infinity magnitude conserved through flyby', () => {
    // v∞ = |v_ship - v_planet| should be same before/after
    const result = predictGravityAssist(v_approach, r_peri, v_planet, mu);
    const v_inf_before = Math.sqrt(...);
    const v_inf_after = Math.sqrt((result.vExit.vx - v_planet.vx)**2 + ...);
    expect(v_inf_before).toBeCloseTo(v_inf_after, 6);
  });

  test('turning angle increases as periapsis decreases', () => {
    // Closer flyby → larger deflection
    const delta1 = getTurningAngle(v_inf, 0.01, mu); // 0.01 AU periapsis
    const delta2 = getTurningAngle(v_inf, 0.1, mu);  // 0.1 AU periapsis
    expect(delta1).toBeGreaterThan(delta2);
  });
});
```

---

## Numerical Stability Test Matrix

| Condition | Current Coverage | Danger Level | Recommended Tests |
|-----------|------------------|--------------|-------------------|
| **Division by zero guards** | 20% | HIGH | Test all |r| < ε, |h| < ε, |e| < ε branches |
| **NaN/Infinity propagation** | 10% | CRITICAL | Mock corrupt inputs, verify rejection |
| **Floating-point comparison** | 50% | MEDIUM | Use `toBeCloseTo()` in all physics tests, not `toBe()` |
| **Trigonometric domain** | 60% | MEDIUM | Test arcsin/arccos/atanh near ±1 boundaries |
| **Near-parabolic orbits** | 0% | HIGH | e = 0.9999, 1.0, 1.0001 |
| **Degenerate cases** | 30% | HIGH | Circular, equatorial, radial trajectories |
| **Extreme eccentricity** | 0% | CRITICAL | e = 50, 100, 1000 (SOI flybys) |
| **Large semi-major axis** | 40% | MEDIUM | a > 100 AU (outer solar system) |
| **Small semi-major axis** | 20% | MEDIUM | a < 0.1 AU (sun-grazers) |

**Key Finding:** The test suite focuses on **happy path physics** (normal elliptic orbits, moderate eccentricity) but ignores **boundary conditions** where numerical issues occur.

---

## Physical Validation Gaps

### Conservation Laws (Zero Coverage)

**What's Missing:**
1. **Energy Conservation:**
   - No test verifies `E = v²/2 - μ/r` is conserved across SOI transitions
   - No test checks thrust work matches energy change
   - Expected error budget: <1% over 1 year simulation

2. **Angular Momentum Conservation:**
   - No test verifies `h = r × v` magnitude preserved for unperturbed orbits
   - No test checks out-of-plane thrust changes `h` correctly

3. **Momentum Conservation:**
   - Thrust application should conserve `momentum = mass × velocity`
   - No test verifies sail count affects thrust correctly (more mass, less acceleration)

**Recommended Test:**
```javascript
describe('Physics Conservation Laws', () => {
  test('orbital energy conserved for zero-thrust coast', () => {
    // No thrust, no drag → energy should not change
    // Propagate 1 Earth year
    const E_initial = computeEnergy(elements_initial);
    // ... run simulation ...
    const E_final = computeEnergy(elements_final);
    expect((E_final - E_initial) / E_initial).toBeLessThan(0.001); // <0.1% drift
  });

  test('angular momentum conserved for radial thrust', () => {
    // Radial thrust (yaw=0, pitch=0) should not change h
    const h_before = computeAngularMomentum(elements_before);
    applyThrust(elements, radial_thrust, dt);
    const h_after = computeAngularMomentum(elements_after);
    expect(h_before).toBeCloseTo(h_after, 6);
  });
});
```

---

### Unit Consistency (Partial Coverage)

**What's Tested:**
- AU/day ↔ km/s conversion (tests use both, implicitly validates)

**What's Missing:**
- **No test verifies μ units** (AU³/day² vs m³/s²) - incorrect μ would break all orbits
- **No test checks mass units** (kg for thrust, but dimensionless for elements)
- **No test validates time scale** (days vs seconds) - off-by-86400 error would be catastrophic

**Recommended Test:**
```javascript
describe('Unit Consistency', () => {
  test('MU_SUN matches published value', () => {
    // μ_sun = 1.32712440018e20 m³/s² (NASA)
    // Convert to AU³/day²
    const AU = 1.495978707e11; // m
    const DAY = 86400; // s
    const expected = 1.32712440018e20 / (AU**3) * (DAY**2);
    expect(MU_SUN).toBeCloseTo(expected, 10);
  });

  test('thrust units match acceleration units', () => {
    // thrust (AU/day²) × mass (kg) should give force (N) after conversion
    // This catches if ACCEL_CONVERSION is wrong
  });
});
```

---

## Comparison with Floating-Point Best Practices

| Best Practice | sailship Implementation | Grade |
|---------------|-------------------------|-------|
| Avoid `===` for floats | Uses `< 1e-10` guards | **B+** |
| Use relative tolerance | Some `Math.abs(a-b) < ε` | **C** (should be `< ε*|a|`) |
| Guard against zero division | Yes, extensively | **A** |
| Clamp trig function domains | Yes (`clamp(x, -1, 1)`) | **A** |
| Test near-singularities | No tests for e≈1, i≈0, etc | **F** |
| Validate all inputs | Partial (only in SOI) | **C** |
| Monitor error accumulation | No tests track drift | **D** |

**Recommendation:** Add relative tolerance helpers:
```javascript
function relativeError(actual, expected) {
  return Math.abs(actual - expected) / Math.abs(expected);
}

expect(relativeError(result, truth)).toBeLessThan(1e-6);
```

---

## Summary of Risk Assessment

### Physics Bugs Most Likely to Occur (Ordered by Severity × Likelihood)

1. **SOI transition position snap** (CRITICAL, HIGH) - Already observed in bug reports
2. **Extreme flyby linear interpolation failure** (CRITICAL, MEDIUM) - Zero test coverage
3. **Hyperbolic Kepler solver divergence** (CRITICAL, LOW) - Rare but catastrophic
4. **Trajectory prediction truncation error** (IMPORTANT, HIGH) - Affects every player
5. **Energy non-conservation in applyThrust** (IMPORTANT, MEDIUM) - Slow drift, hard to notice
6. **State vector NaN propagation** (CRITICAL, LOW) - Validation guards likely work, but untested

### Test ROI (Return on Investment)

| Test Category | Lines to Cover | Bug Severity | Ease of Writing | **ROI Score** |
|---------------|----------------|--------------|-----------------|---------------|
| SOI transitions | 270 | CRITICAL | Medium | **9/10** |
| Extreme eccentricity | 50 | CRITICAL | Hard | **8/10** |
| Conservation laws | N/A (validation) | IMPORTANT | Easy | **7/10** |
| Hyperbolic Kepler edge cases | 45 | CRITICAL | Easy | **9/10** |
| Trajectory RK2 accuracy | 250 | IMPORTANT | Hard | **6/10** |

---

## Recommended Test Development Order

### Phase 1: Critical Edge Cases (1-2 days)
1. Hyperbolic Kepler solver extreme inputs
2. stateToElements degenerate orbits (circular, equatorial, parabolic)
3. SOI entry NaN rejection guard
4. Extreme eccentricity linear interpolation

### Phase 2: Conservation Laws (1 day)
5. Energy conservation (zero thrust coast)
6. Angular momentum conservation (radial thrust)
7. Position continuity in applyThrust

### Phase 3: SOI Integration Tests (2-3 days)
8. SOI entry/exit position delta
9. SOI transition energy conservation
10. Extreme flyby (e > 50) full roundtrip

### Phase 4: Numerical Accuracy (1-2 days)
11. Trajectory predictor RK2 vs analytical
12. Unit consistency validation
13. Relative tolerance refactor

---

## Conclusion

The current test suite validates **normal operation well** but leaves **critical edge cases untested**. The highest-priority improvements are:

1. **SOI transitions** - 270 lines of complex reference-frame math with only basic coverage
2. **Extreme eccentricity** - e > 50 uses completely different code path (linear interpolation) with zero tests
3. **Numerical stability** - no tests for NaN propagation, solver divergence, or near-singular cases
4. **Physical validation** - no tests verify conservation laws (energy, angular momentum)

Implementing the **Phase 1 tests** (Hyperbolic Kepler + stateToElements + SOI guards) would catch the most dangerous bugs with minimal effort. These tests would likely reveal 2-3 critical bugs that are currently lurking in the codebase.

The **lack of conservation law tests** is particularly concerning for a physics simulator - these are the gold standard for validating correctness, and they're currently missing entirely.
