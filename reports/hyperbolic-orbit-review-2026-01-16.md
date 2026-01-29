# Implementation Review: Hyperbolic Orbit Support

**Date:** 2026-01-16
**Reviewer:** Claude
**Plan Under Review:** `reports/hyperbolic-orbit-implementation-plan-2026-01-16.md`

---

## Executive Summary

The implementation plan for hyperbolic orbit support is **well-structured and mathematically sound**. The root cause analysis is correct, the proposed formulas are standard orbital mechanics, and the phased approach is sensible. However, there are several issues that need attention before implementation—particularly around edge cases near e=1, the atanh domain handling, and some missing pieces in the plan.

**Overall Confidence Rating: 7.5/10** - Good plan with gaps that need addressing.

---

## 1. PHYSICS/REALISM Review

### 1.1 Correct Analysis

The plan correctly identifies:

- **Eccentricity clamping** at line 251 of `soi.js` (`e = Math.max(0, Math.min(0.99, e))`) as the root cause
- **Semi-major axis sign convention**: negative for hyperbolic orbits (a = -μ/2E where E > 0)
- **Mean motion formula** needs `|a|` for hyperbolic orbits
- **Anomaly equations** differ fundamentally between elliptic and hyperbolic

### 1.2 Formula Verification

| Formula | Plan's Version | Standard Reference | Status |
|---------|---------------|-------------------|--------|
| Hyperbolic Kepler | `M = e*sinh(H) - H` | Vallado eq. 2-39 | ✅ Correct |
| True anomaly from H | `tan(ν/2) = √((e+1)/(e-1)) * tanh(H/2)` | Battin eq. 4.37 | ✅ Correct |
| Semi-latus rectum | `p = a(1-e²)` for all conics | Standard | ✅ Correct |
| Orbital radius | `r = p / (1 + e*cos(ν))` | Universal | ✅ Correct |

### 1.3 Physics Concerns

#### CONCERN P1: True Anomaly Limits Are Stricter Than Stated (MEDIUM)

The plan states `ν_max = arccos(-1/e)` which is correct. However, the formula `r = p / (1 + e*cos(ν))` becomes **negative** when `cos(ν) < -1/e`, not just infinite. The plan's 95% safety margin is reasonable but arbitrary.

**Recommendation:** Use 99% of ν_max for calculations, 95% for rendering. Document why.

#### CONCERN P2: Parabolic Case (e ≈ 1) Is Hand-Waved (HIGH)

The plan mentions parabolic orbits but treats them as edge cases to clamp away. In practice, a ship applying thrust can pass through e = 1 when transitioning between bound and unbound orbits.

The proposed clamping `e ∈ [0, 0.999] ∪ [1.001, ∞)` creates a forbidden zone that a physical trajectory would cross.

**Recommendation:** Either:
1. Implement true parabolic formulas (Barker's equation), or
2. Use a smaller gap (e.g., 0.9999 to 1.0001) with linear interpolation between the two regimes

#### CONCERN P3: Mean Anomaly Sign Convention for Hyperbolic (LOW)

For hyperbolic orbits, the mean anomaly can be negative (approaching) or positive (departing). The plan correctly notes M is not periodic, but the initial guess formula for Newton-Raphson:

```javascript
H = Math.sign(M) * Math.log(2 * Math.abs(M) / e)
```

This is correct but the transition at M = 0 should be smooth. Consider:
```javascript
H = Math.asinh(M / e)  // Better initial guess from series expansion
```

### 1.4 Missing Physics

The plan doesn't address:
- **Time of flight to SOI exit**: For hyperbolic orbits, this is finite and predictable
- **Excess velocity (v∞)**: Useful for UI display, formula is `v∞ = √(μ/|a|)`
- **Impact parameter**: May be needed for future gravity assist features

---

## 2. FUNCTIONALITY Review

### 2.1 Code Path Analysis

I traced the data flow for SOI entry:

```
checkSOIEntry() → helioToPlanetocentric() → stateToElements() → [ship.orbitalElements updated]
         ↓
getPosition()/getVelocity() ← [later frames read elements]
```

The plan correctly identifies all functions in this path that need modification.

### 2.2 Functionality Concerns

#### CONCERN F1: `stateToElements` True Anomaly Calculation for e > 1 (CRITICAL)

Current code (lines 284-289 of soi.js):
```javascript
const edotr = (ex * pos.x + ey * pos.y + ez * pos.z) / (e * r);
nu = Math.acos(clamp(edotr, -1, 1));
if (rdotv < 0) {
    nu = 2 * Math.PI - nu;
}
```

For hyperbolic orbits, true anomaly is **not** in [0, 2π] but rather in [-ν_max, +ν_max]. The `2π - nu` adjustment is incorrect for e > 1.

**Fix:** For hyperbolic orbits:
```javascript
if (e >= 1) {
    // Hyperbolic: ν can be negative (approaching periapsis)
    if (rdotv < 0) {
        nu = -nu;  // Approaching periapsis, negative anomaly
    }
    // No 2π normalization - hyperbolic ν ∈ [-ν_max, +ν_max]
} else {
    // Elliptic: normalize to [0, 2π)
    if (rdotv < 0) {
        nu = 2 * Math.PI - nu;
    }
}
```

#### CONCERN F2: Visual Elements Interpolation May Fight Hyperbolic (MEDIUM)

`renderer.js:189` uses `ship.visualOrbitalElements` for smooth rendering. If the actual orbit is hyperbolic but visual elements are interpolating from elliptic, there could be visual glitches.

**Recommendation:** When orbit type changes (e crosses 1.0), reset visual elements to actual elements immediately rather than interpolating.

#### CONCERN F3: Incomplete Test Coverage in Plan (MEDIUM)

The plan's unit tests verify:
- Kepler solver convergence
- Anomaly round-trip

Missing tests:
- State vector round-trip **across multiple time steps** (drift accumulation)
- SOI transition continuity with hyperbolic entry
- Thrust application on hyperbolic orbit
- Edge case: e = 1.0001 (barely hyperbolic)

### 2.3 Missing Functionality

The plan doesn't address:
- **SOI exit prediction**: When will the ship leave the SOI? (Need to solve for ν when r = r_SOI)
- **Orbit type indicator in UI**: Players need to know they're on an escape trajectory
- **Warning when approaching SOI boundary**: Prevent surprise exits

---

## 3. ARCHITECTURE Review

### 3.1 Code Organization

The plan maintains the existing architecture well:
- New functions added to `orbital.js` follow existing patterns
- No new files created unnecessarily
- Modifications are localized to affected functions

### 3.2 Architecture Concerns

#### CONCERN A1: Orbit Type Detection Is Scattered (MEDIUM)

The plan proposes `getOrbitType(e)` but doesn't specify where it lives or ensure consistent usage. Multiple places check `e < 1` or `e >= 1` independently.

**Recommendation:** Add `getOrbitType()` to `orbital.js` and use it everywhere. Consider adding it to the elements object:
```javascript
return {
    ...elements,
    isHyperbolic: e >= 1,
    orbitType: getOrbitType(e)
};
```

#### CONCERN A2: Duplication in Renderer (LOW)

`drawOrbit()` and `drawShipOrbit()` will have nearly identical hyperbolic handling code. The plan shows full hyperbolic rendering code only for `drawOrbit()` with "Same changes to `drawShipOrbit()`".

**Recommendation:** Extract shared orbit rendering logic:
```javascript
function getOrbitPoints(elements, parentPos, isHyperbolic) { ... }
// Used by both drawOrbit and drawShipOrbit
```

#### CONCERN A3: No Abstraction for Kepler Solver Selection (LOW)

The plan has `getPosition()` branch on `e < 1`:
```javascript
if (e < 1) {
    E = solveKepler(M, e);
    ν = eccentricToTrueAnomaly(E, e);
} else {
    H = solveKeplerHyperbolic(M, e);
    ν = hyperbolicToTrueAnomaly(H, e);
}
```

This pattern repeats in `getVelocity()`.

**Recommendation:** Create a unified `solveForTrueAnomaly(M, e)` function that handles both cases internally.

### 3.3 Dependency Flow

The plan maintains the correct dependency order:
```
orbital.js (no deps) → soi.js (imports orbital.js) → orbital-maneuvers.js (imports both)
```

No circular dependency risks introduced.

---

## 4. FAILURE MODES Review

### 4.1 Numerical Stability

#### CONCERN FM1: `atanh` Domain Error (HIGH RISK)

The plan acknowledges this but the proposed fix has issues:
```javascript
const clampedTanh = Math.max(-0.9999, Math.min(0.9999, tanhHalf));
const H = 2 * Math.atanh(clampedTanh);
```

When `|tanhHalf| >= 1`, we're at or beyond the asymptote. Clamping to 0.9999 produces `H ≈ ±4.95` which maps to `ν ≈ ±0.997 * ν_max`. This is reasonable for rendering but **not for physics calculations**.

**Impact:** A ship at the asymptote angle would have its position incorrectly calculated.

**Mitigation:** Before clamping, detect this case and handle it explicitly:
```javascript
if (Math.abs(tanhHalf) >= 0.9999) {
    console.warn(`[stateToElements] True anomaly near asymptote limit`);
    // Use direct geometric calculation instead of anomaly-based
}
```

#### CONCERN FM2: Newton-Raphson Non-Convergence (MEDIUM RISK)

For highly eccentric hyperbolic orbits (e > 10) with large M, the Newton-Raphson may converge slowly or oscillate.

The plan uses 50 iterations max, which should be sufficient, but there's no divergence detection.

**Recommendation:** Add Halley's method fallback or bisection for stubborn cases:
```javascript
if (Math.abs(delta) > Math.abs(prevDelta)) {
    // Diverging - switch to bisection
}
```

#### CONCERN FM3: Semi-Major Axis Near Zero (MEDIUM RISK)

The plan clamps `|a| < 0.0001 AU` to the current radius. For planetary SOIs, this is ~15,000 km. A hyperbolic flyby could legitimately have `|a| ≈ 0.0001 AU`.

**Recommendation:** Scale the minimum by the SOI context:
```javascript
const minA = isInSOI ? 1e-7 : 1e-4;  // Smaller threshold for planetary orbits
```

#### CONCERN FM4: Division by Zero in Gauss Equations (LOW RISK)

While the plan uses state-vector approach for `applyThrust()`, the Gauss equations comments remain. If anyone re-enables them, there are divisions by `h` and `e` without guards.

**Recommendation:** Remove or clearly mark as deprecated the Gauss equation comments if not used.

### 4.2 Performance

#### CONCERN FM5: Hyperbolic Kepler Solver Hot Path (LOW RISK)

`solveKeplerHyperbolic()` uses `Math.sinh()` and `Math.cosh()` in a loop. These are slower than `sin/cos`. For 100 ships at 60fps, this could matter.

**Benchmark needed:** Profile before optimizing. If slow, consider:
- Caching sinh/cosh together (computed from same exp())
- Using Taylor series for small H

### 4.3 Player-Facing Issues

#### CONCERN FM6: No Graceful Degradation (HIGH RISK)

If hyperbolic calculations produce NaN, the ship may:
- Disappear (position NaN)
- Stop updating (physics breaks)
- Corrupt save state

**Recommendation:** Add validation wrapper:
```javascript
function safeGetPosition(elements, time) {
    const pos = getPosition(elements, time);
    if (!isFinite(pos.x) || !isFinite(pos.y) || !isFinite(pos.z)) {
        console.error('[ORBIT] NaN position detected', elements);
        return lastKnownGoodPosition; // Fallback
    }
    return pos;
}
```

#### CONCERN FM7: Confusing UI for Hyperbolic Orbits (MEDIUM)

The rendered hyperbolic arc shows where the ship *will go* but not where it *came from*. This may confuse players.

**Recommendation:** Draw full hyperbola from entry point to exit point, with the ship's current position marked.

---

## 5. Summary Tables

### Top 3 Concerns by Category

#### PHYSICS/REALISM
| # | Concern | Severity |
|---|---------|----------|
| 1 | Parabolic case (e ≈ 1) hand-waved with forbidden zone | HIGH |
| 2 | True anomaly limits need explicit documentation | MEDIUM |
| 3 | Initial guess for hyperbolic solver could be improved | LOW |

#### FUNCTIONALITY
| # | Concern | Severity |
|---|---------|----------|
| 1 | True anomaly sign wrong for hyperbolic in `stateToElements()` | CRITICAL |
| 2 | Visual elements interpolation may glitch on orbit type change | MEDIUM |
| 3 | Missing test coverage for edge cases | MEDIUM |

#### ARCHITECTURE
| # | Concern | Severity |
|---|---------|----------|
| 1 | Orbit type detection scattered, no single source of truth | MEDIUM |
| 2 | Duplicated rendering logic in drawOrbit/drawShipOrbit | LOW |
| 3 | Kepler solver selection repeated in getPosition/getVelocity | LOW |

#### FAILURE MODES
| # | Concern | Severity |
|---|---------|----------|
| 1 | `atanh` domain error at asymptotic angles | HIGH |
| 2 | No graceful degradation for NaN positions | HIGH |
| 3 | Semi-major axis minimum too large for planetary SOIs | MEDIUM |

---

## 6. Recommendations

### Critical (Must Fix Before Implementation)

1. **Fix true anomaly sign for hyperbolic orbits** in `stateToElements()` (F1)
2. **Handle atanh domain correctly** with explicit asymptote detection (FM1)
3. **Add validation for NaN outputs** in position/velocity functions (FM6)

### Important (Should Fix During Implementation)

4. Create unified `solveForTrueAnomaly()` function (A3)
5. Extract shared orbit rendering logic (A2)
6. Add orbit type to elements object (A1)
7. Reset visual elements on orbit type change (F2)

### Nice to Have (Consider for Polish)

8. Implement SOI exit time prediction
9. Add v∞ display for hyperbolic orbits
10. Improve initial guess for hyperbolic Kepler solver (P3)
11. Handle parabolic case properly (P2)

---

## 7. Test Cases to Add

### Unit Tests

```javascript
// Test hyperbolic Kepler solver edge cases
test('solveKeplerHyperbolic handles e=1.001 (barely hyperbolic)', () => { ... });
test('solveKeplerHyperbolic handles e=10 (highly hyperbolic)', () => { ... });
test('solveKeplerHyperbolic handles negative M (approaching)', () => { ... });

// Test state vector round-trip for hyperbolic
test('stateToElements preserves hyperbolic orbit through round-trip', () => {
    const pos = { x: 0.001, y: 0.0005, z: 0 };  // Close to Earth
    const vel = { vx: 0.01, vy: 0.005, vz: 0 }; // Fast - hyperbolic
    const elements = stateToElements(pos, vel, MU_EARTH, epoch);
    expect(elements.e).toBeGreaterThan(1);
    const posBack = getPosition(elements, epoch);
    expect(posBack.x).toBeCloseTo(pos.x, 6);
});

// Test true anomaly limits
test('hyperbolicToTrueAnomaly respects asymptote limit', () => {
    const e = 1.5;
    const nuMax = Math.acos(-1/e);
    const H = 10; // Large H
    const nu = hyperbolicToTrueAnomaly(H, e);
    expect(Math.abs(nu)).toBeLessThan(nuMax);
});
```

### Integration Tests

```javascript
// Test SOI transition continuity
test('Ship position is continuous through SOI entry on hyperbolic trajectory', () => {
    // Set up ship approaching Earth faster than escape velocity
    // Step through SOI boundary
    // Verify position change < threshold between frames
});

// Test rendering doesn't crash
test('drawShipOrbit handles hyperbolic elements without error', () => {
    const hyperbolicElements = { a: -0.01, e: 1.5, ... };
    ship.orbitalElements = hyperbolicElements;
    expect(() => render()).not.toThrow();
});
```

---

## 8. Conclusion

The implementation plan demonstrates strong understanding of the underlying physics and correctly identifies the root cause. The proposed solution architecture is sound. However, several edge cases around the parabolic boundary and asymptotic limits need more careful handling to prevent numerical issues.

**Recommended Action:** Address the three critical issues (F1, FM1, FM6) before proceeding with Phase 1. The other improvements can be integrated during implementation.

**Estimated Additional Effort:**
- Critical fixes: ~30 lines of code
- Important improvements: ~50 lines of code
- Full test coverage: ~100 lines of test code

---

*End of Review Report*
