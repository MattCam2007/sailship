# Hyperbolic Orbit Support Implementation Plan

**Date:** 2026-01-16
**Author:** Claude (Implementation Planning)
**Status:** Draft
**Estimated Files Affected:** 4

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Background: Elliptic vs Hyperbolic Orbits](#background-elliptic-vs-hyperbolic-orbits)
3. [Current Code Analysis](#current-code-analysis)
4. [Solution Architecture](#solution-architecture)
5. [Detailed Code Changes](#detailed-code-changes)
6. [Implementation Phases](#implementation-phases)
7. [Testing Strategy](#testing-strategy)
8. [Risk Assessment](#risk-assessment)

---

## Problem Statement

### The Bug

When a ship enters a planetary Sphere of Influence (SOI) with velocity exceeding escape velocity, the system produces incorrect orbital elements, causing:

1. **Position discontinuity** - Ship appears to teleport on SOI entry
2. **Visual/actual divergence** - Rendered orbit doesn't match computed trajectory
3. **Simulation freeze** - Ship stops updating after SOI exit

### Root Cause

The `stateToElements()` function in `src/js/lib/soi.js` explicitly clamps eccentricity:

```javascript
// Line 251 in soi.js
e = Math.max(0, Math.min(0.99, e));  // ← Forces all orbits to be elliptic
```

Additionally, the orbital mechanics functions in `orbital.js` use formulas that are mathematically undefined or incorrect for hyperbolic trajectories (e ≥ 1):

- `sqrt(1 - e²)` becomes imaginary when e > 1
- `M = E - e*sin(E)` is the elliptic Kepler equation, not hyperbolic
- `n = sqrt(μ/a³)` is imaginary when a < 0 (hyperbolic semi-major axis)

### Evidence from Logs

```
[SOI ENTRY] Relative pos: (0.062458, -0.003951, -0.000673) AU
[SOI ENTRY] VERIFY pos from elements: (-0.000046, -0.000624, 0.000000) AU
```

The ship entered at one position but the computed elements resolve to a completely different location ~0.06 AU away.

---

## Background: Elliptic vs Hyperbolic Orbits

### Conic Section Classification

| Property | Elliptic (e < 1) | Parabolic (e = 1) | Hyperbolic (e > 1) |
|----------|------------------|-------------------|---------------------|
| Semi-major axis (a) | a > 0 | undefined (∞) | a < 0 |
| Orbital energy | E < 0 (bound) | E = 0 | E > 0 (unbound) |
| Period | finite | infinite | N/A (open) |
| True anomaly range | 0 to 2π | -π to +π | limited by asymptotes |

### Key Formula Differences

#### Semi-major Axis from Energy

```
Elliptic:    a = -μ / (2E)     where E < 0, so a > 0
Hyperbolic:  a = -μ / (2E)     where E > 0, so a < 0
```

The formula is the same, but the sign of `a` differs.

#### Mean Motion

```
Elliptic:    n = sqrt(μ / a³)           — real when a > 0
Hyperbolic:  n = sqrt(μ / |a|³)         — use absolute value of a
```

#### Anomaly Relationships

**Elliptic** (uses eccentric anomaly E):
```
tan(ν/2) = sqrt((1+e)/(1-e)) * tan(E/2)
M = E - e*sin(E)                          — Kepler's equation
```

**Hyperbolic** (uses hyperbolic anomaly H):
```
tan(ν/2) = sqrt((e+1)/(e-1)) * tanh(H/2)
M = e*sinh(H) - H                         — Hyperbolic Kepler equation
```

#### Orbital Radius

```
Both:  r = a(1 - e²) / (1 + e*cos(ν))    — Same formula
       r = p / (1 + e*cos(ν))             — where p = a(1-e²) = semi-latus rectum
```

Note: For hyperbolic orbits, `a < 0` and `e > 1`, so `a(1-e²)` is still positive.

#### True Anomaly Limits

For hyperbolic orbits, there's a maximum true anomaly beyond which the trajectory doesn't exist:

```
ν_max = arccos(-1/e)
```

For e = 1.5, ν_max ≈ 131.8°. The ship approaches from -ν_max and departs toward +ν_max.

---

## Current Code Analysis

### Affected Files

| File | Functions Affected | Severity |
|------|-------------------|----------|
| `src/js/lib/soi.js` | `stateToElements()` | Critical |
| `src/js/lib/orbital.js` | `meanMotion()`, `solveKepler()`, `eccentricToTrueAnomaly()`, `orbitalRadius()`, `velocityInOrbitalPlane()`, `getPosition()`, `getVelocity()` | Critical |
| `src/js/ui/renderer.js` | `drawOrbit()`, `drawShipOrbit()` | High |
| `src/js/lib/orbital-maneuvers.js` | `applyThrust()` | Medium |

### soi.js Analysis

**`stateToElements(pos, vel, mu, epoch)`** at line 188:

Current issues:
1. **Line 251**: Hard clamps `e` to max 0.99
2. **Lines 306-316**: Uses elliptic eccentric anomaly formula with `sqrt(1-e²)`
3. **Line 319**: Uses elliptic Kepler equation `M = E - e*sin(E)`
4. **Lines 324-327**: Fallback for negative `a` just sets `a = r` (wrong)

### orbital.js Analysis

**`meanMotion(a, μ)`** at line 52:
```javascript
return Math.sqrt(μ / (a * a * a));  // Returns NaN when a < 0
```

**`solveKepler(M, e)`** at line 87:
- Only handles elliptic case (e < 1)
- Kepler equation `M = E - e*sin(E)` is for ellipses only

**`eccentricToTrueAnomaly(E, e)`** at line 129:
```javascript
const y = Math.sqrt(1 - e * e) * sinE;  // NaN when e > 1
```

**`orbitalRadius(a, e, ν)`** at line 157:
```javascript
const p = a * (1 - e * e);  // Works for hyperbolic (a<0, e>1 → p>0)
return p / (1 + e * Math.cos(trueAnomaly));  // ✓ Correct for both
```

**`velocityInOrbitalPlane(a, e, μ, ν)`** at line 249:
```javascript
const p = a * (1 - e * e);  // Works for hyperbolic
const sqrtMuOverP = Math.sqrt(μ / p);  // ✓ Works for both
```

### renderer.js Analysis

**`drawOrbit()`** at line 79:
```javascript
const r = e < 1e-10 ? a : (a * (1 - e * e)) / (1 + e * Math.cos(trueAnomaly));
```

For hyperbolic orbits:
- Iterates true anomaly 0 to 2π (wrong - should be -ν_max to +ν_max)
- At invalid angles, `r` becomes negative or infinite

---

## Solution Architecture

### Design Principles

1. **Single code path where possible** - Use formulas that work for both elliptic and hyperbolic
2. **Explicit orbit type detection** - Check `e >= 1` to branch where necessary
3. **Preserve position continuity** - State vector approach ensures no teleportation
4. **Fail gracefully** - Clamp to valid ranges, log warnings, don't crash

### Orbit Type Enum

```javascript
const OrbitType = {
    CIRCULAR: 'circular',      // e ≈ 0
    ELLIPTIC: 'elliptic',      // 0 < e < 1
    PARABOLIC: 'parabolic',    // e ≈ 1
    HYPERBOLIC: 'hyperbolic'   // e > 1
};

function getOrbitType(e) {
    if (e < 1e-6) return OrbitType.CIRCULAR;
    if (e < 0.999) return OrbitType.ELLIPTIC;
    if (e < 1.001) return OrbitType.PARABOLIC;
    return OrbitType.HYPERBOLIC;
}
```

---

## Detailed Code Changes

### 1. orbital.js Changes

#### 1.1 New Function: `solveKeplerHyperbolic(M, e)`

Solve the hyperbolic Kepler equation: `M = e*sinh(H) - H`

```javascript
/**
 * Solve the hyperbolic Kepler equation for hyperbolic anomaly.
 *
 * Hyperbolic Kepler Equation: M = e*sinh(H) - H
 *
 * @param {number} M - Mean anomaly (can be any real number for hyperbolic)
 * @param {number} e - Eccentricity (must be > 1)
 * @param {number} [tolerance=1e-12] - Convergence tolerance
 * @returns {number} Hyperbolic anomaly H
 */
export function solveKeplerHyperbolic(M, e, tolerance = 1e-12) {
    // Initial guess: H = M for small M, or sign(M) * ln(2|M|/e) for large M
    let H = Math.abs(M) < 1 ? M : Math.sign(M) * Math.log(2 * Math.abs(M) / e);

    const maxIterations = 50;
    for (let i = 0; i < maxIterations; i++) {
        const sinhH = Math.sinh(H);
        const coshH = Math.cosh(H);
        const f = e * sinhH - H - M;
        const fPrime = e * coshH - 1;

        const delta = f / fPrime;
        H -= delta;

        if (Math.abs(delta) < tolerance) {
            return H;
        }
    }

    return H;
}
```

#### 1.2 New Function: `hyperbolicToTrueAnomaly(H, e)`

Convert hyperbolic anomaly to true anomaly.

```javascript
/**
 * Convert hyperbolic anomaly to true anomaly.
 *
 * Formula: tan(ν/2) = sqrt((e+1)/(e-1)) * tanh(H/2)
 *
 * @param {number} H - Hyperbolic anomaly
 * @param {number} e - Eccentricity (must be > 1)
 * @returns {number} True anomaly ν (radians)
 */
export function hyperbolicToTrueAnomaly(H, e) {
    const tanhHalf = Math.tanh(H / 2);
    const factor = Math.sqrt((e + 1) / (e - 1));
    const tanNuHalf = factor * tanhHalf;
    return 2 * Math.atan(tanNuHalf);
}
```

#### 1.3 New Function: `trueToHyperbolicAnomaly(ν, e)`

Convert true anomaly to hyperbolic anomaly (inverse of above).

```javascript
/**
 * Convert true anomaly to hyperbolic anomaly.
 *
 * @param {number} ν - True anomaly (radians)
 * @param {number} e - Eccentricity (must be > 1)
 * @returns {number} Hyperbolic anomaly H
 */
export function trueToHyperbolicAnomaly(ν, e) {
    const tanNuHalf = Math.tan(ν / 2);
    const factor = Math.sqrt((e - 1) / (e + 1));
    const tanhHalf = factor * tanNuHalf;
    return 2 * Math.atanh(tanhHalf);
}
```

#### 1.4 Modify: `meanMotion(a, μ)`

Handle negative semi-major axis for hyperbolic orbits.

```javascript
export function meanMotion(a, μ) {
    // Use absolute value of a for hyperbolic orbits (a < 0)
    const absA = Math.abs(a);
    return Math.sqrt(μ / (absA * absA * absA));
}
```

#### 1.5 Modify: `propagateMeanAnomaly(M0, n, deltaTime)`

For hyperbolic orbits, mean anomaly is not periodic.

```javascript
export function propagateMeanAnomaly(M0, n, deltaTime, isHyperbolic = false) {
    let M = M0 + n * deltaTime;

    if (!isHyperbolic) {
        // Normalize to [0, 2π) for elliptic orbits only
        M = M % (2 * Math.PI);
        if (M < 0) M += 2 * Math.PI;
    }
    // For hyperbolic orbits, M can be any real number

    return M;
}
```

#### 1.6 Modify: `getPosition(elements, julianDate)`

Branch based on orbit type.

```javascript
export function getPosition(elements, julianDate) {
    const { a, e, i, Ω, ω, M0, epoch, μ } = elements;
    const deltaTime = julianDate - epoch;
    const n = meanMotion(a, μ);

    let ν;  // True anomaly

    if (e < 1) {
        // Elliptic orbit
        const M = propagateMeanAnomaly(M0, n, deltaTime, false);
        const E = solveKepler(M, e);
        ν = eccentricToTrueAnomaly(E, e);
    } else {
        // Hyperbolic orbit
        const M = propagateMeanAnomaly(M0, n, deltaTime, true);
        const H = solveKeplerHyperbolic(M, e);
        ν = hyperbolicToTrueAnomaly(H, e);
    }

    const r = orbitalRadius(a, e, ν);
    const posOrbital = positionInOrbitalPlane(r, ν);
    return rotateToEcliptic(posOrbital, i, Ω, ω);
}
```

#### 1.7 Modify: `getVelocity(elements, julianDate)`

Same branching pattern as `getPosition`.

```javascript
export function getVelocity(elements, julianDate) {
    const { a, e, i, Ω, ω, M0, epoch, μ } = elements;
    const deltaTime = julianDate - epoch;
    const n = meanMotion(a, μ);

    let ν;

    if (e < 1) {
        const M = propagateMeanAnomaly(M0, n, deltaTime, false);
        const E = solveKepler(M, e);
        ν = eccentricToTrueAnomaly(E, e);
    } else {
        const M = propagateMeanAnomaly(M0, n, deltaTime, true);
        const H = solveKeplerHyperbolic(M, e);
        ν = hyperbolicToTrueAnomaly(H, e);
    }

    const velOrbital = velocityInOrbitalPlane(a, e, μ, ν);
    return rotateVelocityToEcliptic(velOrbital, i, Ω, ω);
}
```

---

### 2. soi.js Changes

#### 2.1 Modify: `stateToElements(pos, vel, mu, epoch)`

Remove the eccentricity clamp and fix anomaly calculations.

**Remove line 251:**
```javascript
// DELETE THIS LINE:
// e = Math.max(0, Math.min(0.99, e));
```

**Replace lines 305-321 with:**
```javascript
// Convert true anomaly to mean anomaly (depends on orbit type)
let M0;

if (e < 1) {
    // Elliptic orbit: use eccentric anomaly
    let E;
    if (e < 1e-10) {
        E = nu;
    } else {
        const cosNu = Math.cos(nu);
        const sinNu = Math.sin(nu);
        E = Math.atan2(
            Math.sqrt(1 - e * e) * sinNu,
            e + cosNu
        );
    }
    M0 = E - e * Math.sin(E);
    if (M0 < 0) M0 += 2 * Math.PI;
} else {
    // Hyperbolic orbit: use hyperbolic anomaly
    const tanNuHalf = Math.tan(nu / 2);
    const factor = Math.sqrt((e - 1) / (e + 1));
    const tanhHalf = factor * tanNuHalf;
    // Clamp to valid range for atanh (|x| < 1)
    const clampedTanh = Math.max(-0.9999, Math.min(0.9999, tanhHalf));
    const H = 2 * Math.atanh(clampedTanh);
    M0 = e * Math.sinh(H) - H;
}
```

**Replace lines 324-327 with:**
```javascript
// Semi-major axis: keep sign (negative for hyperbolic is correct)
// Only apply minimum magnitude, not positivity constraint
if (!isFinite(a) || Math.abs(a) < 0.0001) {
    // Fallback for near-parabolic
    a = Math.sign(energy) * r;  // Preserve sign based on energy
    if (a === 0) a = r;  // Edge case
}
```

---

### 3. renderer.js Changes

#### 3.1 Modify: `drawOrbit()` and `drawShipOrbit()`

Handle hyperbolic orbit rendering.

```javascript
function drawOrbit(body, centerX, centerY, scale) {
    if (!displayOptions.showOrbits || !body.elements) return;

    const { a, e, i, Ω, ω } = body.elements;
    const isHyperbolic = e >= 1;

    // ... existing parent position code ...

    // Precompute rotation matrix components
    const cosΩ = Math.cos(Ω);
    const sinΩ = Math.sin(Ω);
    const cosω = Math.cos(ω);
    const sinω = Math.sin(ω);
    const cosi = Math.cos(i);
    const sini = Math.sin(i);

    ctx.beginPath();

    if (isHyperbolic) {
        // Hyperbolic orbit: draw from -ν_max to +ν_max
        const nuMax = Math.acos(-1 / e) * 0.95;  // 95% of asymptote for safety
        const segments = 64;

        for (let j = 0; j <= segments; j++) {
            const trueAnomaly = -nuMax + (j / segments) * 2 * nuMax;
            const p = Math.abs(a) * (e * e - 1);  // Semi-latus rectum for hyperbolic
            const r = p / (1 + e * Math.cos(trueAnomaly));

            if (r < 0 || r > 100) continue;  // Skip invalid points

            const xOrbital = r * Math.cos(trueAnomaly);
            const yOrbital = r * Math.sin(trueAnomaly);

            // Rotate to ecliptic frame
            const x = parentX + xOrbital * (cosΩ * cosω - sinΩ * sinω * cosi)
                             - yOrbital * (cosΩ * sinω + sinΩ * cosω * cosi);
            const y = parentY + xOrbital * (sinΩ * cosω + cosΩ * sinω * cosi)
                             - yOrbital * (sinΩ * sinω - cosΩ * cosω * cosi);
            const z = parentZ + xOrbital * (sinω * sini)
                             + yOrbital * (cosω * sini);

            const projected = project3D(x, y, z, centerX, centerY, scale);

            if (j === 0) {
                ctx.moveTo(projected.x, projected.y);
            } else {
                ctx.lineTo(projected.x, projected.y);
            }
        }
    } else {
        // Elliptic orbit: existing code (full 2π sweep)
        const segments = 64;
        for (let j = 0; j <= segments; j++) {
            const trueAnomaly = (j / segments) * Math.PI * 2;
            const r = e < 1e-10 ? a : (a * (1 - e * e)) / (1 + e * Math.cos(trueAnomaly));

            // ... existing position calculation ...
        }
    }

    ctx.stroke();
}
```

#### 3.2 Visual Differentiation

Use different styling for hyperbolic trajectories:

```javascript
if (isHyperbolic) {
    ctx.strokeStyle = 'rgba(100, 200, 255, 0.5)';  // Cyan for hyperbolic
    ctx.setLineDash([5, 5]);  // Dashed line
} else {
    ctx.strokeStyle = 'rgba(232, 93, 76, 0.3)';  // Red for elliptic
    ctx.setLineDash([]);
}
```

---

### 4. orbital-maneuvers.js Changes

#### 4.1 Modify: `applyThrust()`

The current state-vector approach should work for hyperbolic orbits since it relies on `stateToElements()`. After fixing `stateToElements()`, no changes should be needed here.

However, add a warning when thrust would not significantly affect a hyperbolic escape:

```javascript
// After computing newElements
if (newElements.e >= 1) {
    console.log(`[THRUST] Ship on hyperbolic trajectory (e=${newElements.e.toFixed(3)})`);
}
```

---

## Implementation Phases

### Phase 1: Core Math (orbital.js)
**Estimated changes:** ~80 lines added, ~20 modified

1. Add `solveKeplerHyperbolic()` function
2. Add `hyperbolicToTrueAnomaly()` function
3. Add `trueToHyperbolicAnomaly()` function
4. Modify `meanMotion()` to use `|a|`
5. Modify `propagateMeanAnomaly()` to handle non-periodic case
6. Modify `getPosition()` to branch on orbit type
7. Modify `getVelocity()` to branch on orbit type

**Testing:** Unit tests for each new function with known hyperbolic orbit values.

### Phase 2: State Conversion (soi.js)
**Estimated changes:** ~40 lines modified

1. Remove eccentricity clamp
2. Add hyperbolic anomaly calculation branch
3. Fix semi-major axis handling for negative values
4. Update debug logging for hyperbolic case

**Testing:** Round-trip test: `state → elements → state` should return original values for hyperbolic trajectories.

### Phase 3: Visualization (renderer.js)
**Estimated changes:** ~50 lines added, ~20 modified

1. Detect hyperbolic orbits in `drawOrbit()`
2. Calculate ν_max for true anomaly limits
3. Draw hyperbolic arc (not closed curve)
4. Different visual style for hyperbolic trajectories
5. Same changes to `drawShipOrbit()`

**Testing:** Visual verification with test hyperbolic orbit.

### Phase 4: Integration Testing
**Estimated effort:** Manual testing

1. Start ship in heliocentric orbit
2. Approach Earth with >11.2 km/s relative velocity
3. Verify no teleportation on SOI entry
4. Verify hyperbolic trajectory renders correctly
5. Verify ship exits SOI naturally
6. Verify smooth transition back to heliocentric

---

## Testing Strategy

### Unit Tests

#### Hyperbolic Kepler Equation
```javascript
// Test: M = 2.0, e = 1.5
// Expected H ≈ 1.507 (from numerical solution)
const H = solveKeplerHyperbolic(2.0, 1.5);
expect(H).toBeCloseTo(1.507, 2);

// Verify: e*sinh(H) - H should equal M
const M_verify = 1.5 * Math.sinh(H) - H;
expect(M_verify).toBeCloseTo(2.0, 10);
```

#### Anomaly Conversion Round-Trip
```javascript
// For various e > 1 and H values
const e = 2.0;
const H_original = 1.0;
const nu = hyperbolicToTrueAnomaly(H_original, e);
const H_back = trueToHyperbolicAnomaly(nu, e);
expect(H_back).toBeCloseTo(H_original, 10);
```

#### State Vector Round-Trip (Critical)
```javascript
// Position and velocity for hyperbolic orbit
const pos = { x: 0.05, y: 0.02, z: 0.01 };  // AU
const vel = { vx: 0.002, vy: 0.001, vz: 0 };  // AU/day (>escape vel)
const mu = GRAVITATIONAL_PARAMS.earth;
const epoch = 2458850;

const elements = stateToElements(pos, vel, mu, epoch);
const pos_back = getPosition(elements, epoch);
const vel_back = getVelocity(elements, epoch);

expect(pos_back.x).toBeCloseTo(pos.x, 8);
expect(pos_back.y).toBeCloseTo(pos.y, 8);
expect(pos_back.z).toBeCloseTo(pos.z, 8);
expect(vel_back.vx).toBeCloseTo(vel.vx, 8);
expect(vel_back.vy).toBeCloseTo(vel.vy, 8);
expect(vel_back.vz).toBeCloseTo(vel.vz, 8);
```

### Integration Tests

1. **Flyby Continuity Test**
   - Set ship on collision course with planet
   - Record position every frame through SOI transit
   - Verify no position jumps > 0.001 AU between frames

2. **Visualization Test**
   - Create test orbit with known hyperbolic parameters
   - Verify rendered trajectory matches analytical curve

---

## Risk Assessment

### High Risk

| Risk | Mitigation |
|------|------------|
| Numerical instability near e = 1 (parabolic) | Add explicit parabolic handling or clamp to e ∈ [0, 0.999] ∪ [1.001, ∞) |
| `atanh` domain error when \|tanh\| ≥ 1 | Clamp input to 0.9999 |
| Division by zero in formulas | Add epsilon checks throughout |

### Medium Risk

| Risk | Mitigation |
|------|------------|
| Performance impact from additional branching | Profile and optimize hot paths if needed |
| Visual artifacts at hyperbolic asymptotes | Clamp rendering to 95% of ν_max |
| Existing tests may break | Run full test suite after each phase |

### Low Risk

| Risk | Mitigation |
|------|------------|
| Incorrect thrust application on hyperbolic | State-vector approach should handle this automatically |
| UI confusion about "negative semi-major axis" | Don't expose raw `a` value to users; show trajectory type instead |

---

## Summary

### Files to Modify

| File | Lines Added | Lines Modified |
|------|-------------|----------------|
| `src/js/lib/orbital.js` | ~80 | ~30 |
| `src/js/lib/soi.js` | ~20 | ~30 |
| `src/js/ui/renderer.js` | ~50 | ~20 |
| `src/js/lib/orbital-maneuvers.js` | ~5 | ~0 |
| **Total** | **~155** | **~80** |

### Success Criteria

1. Ship enters SOI with no visible position jump
2. Hyperbolic trajectory renders as open curve
3. Ship exits SOI naturally when on escape trajectory
4. All existing elliptic orbit behavior unchanged
5. State-vector round-trip accurate to 1e-8 AU

### Next Steps

1. Review this plan and approve implementation
2. Create feature branch: `feature/hyperbolic-orbits`
3. Implement Phase 1 (orbital.js)
4. Unit test Phase 1
5. Continue through phases sequentially
6. Integration testing
7. Merge to main
