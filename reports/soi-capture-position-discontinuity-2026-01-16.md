# SOI Capture Position Discontinuity Bug Report

**Date:** 2026-01-16
**File:** `src/js/core/shipPhysics.js`
**Lines:** 510-517
**Severity:** High (causes visible ship teleportation)

---

## What is the Bug?

When a ship enters a planet's Sphere of Influence (SOI) with high velocity (resulting in a hyperbolic or near-escape trajectory), the "forced capture" logic artificially changes the orbital elements to create a stable orbit. However, this changes the ship's **computed position** without preserving its **actual position**, causing the ship to visually teleport.

### Evidence from Logs

```
[SOI ENTRY] Relative pos: (0.046059, -0.000638, -0.000598) AU, dist=0.046068 AU
...
SOI CAPTURE (forced): EARTH - original e=0.990, relative velocity 1.6 km/s
[SOI ENTRY] FINAL: a=0.036854 AU, e=0.1000 (NEAR-CIRCULAR)
[SOI ENTRY] VERIFY pos from elements: (0.018277, -0.027678, 0.000000) AU
```

The ship entered at `(0.046, -0.001, -0.001)` but the new orbital elements compute a position of `(0.018, -0.028, 0.000)` - a jump of approximately **0.04 AU (6 million kilometers)**.

Additionally, the orbit direction flipped from **PROGRADE** (`i=0.06°`) to **RETROGRADE** (`i=115.75°`).

---

## What Causes the Bug?

The bug is in the forced capture logic at lines 510-517:

```javascript
// SIMPLE MODE: Force capture into stable orbit regardless of velocity
// If eccentricity is too high (would escape), force a circular orbit
if (newElements.e > 0.7 || orbitalEnergy >= 0) {
    // Force into a nice circular orbit at current distance
    newElements.e = 0.1;  // Nearly circular
    newElements.a = Math.max(r * 0.8, soiRadius * 0.1);  // Reasonable orbit size
}
```

The code modifies `e` (eccentricity) and `a` (semi-major axis) directly, but leaves the other orbital elements unchanged:
- `i` (inclination)
- `Ω` (longitude of ascending node)
- `ω` (argument of periapsis)
- `M0` (mean anomaly at epoch)

### The Problem

Orbital elements are **interdependent**. The position in space is computed from **all six elements together**:

```
position = f(a, e, i, Ω, ω, M0, time)
```

When you change `a` and `e` without adjusting the other elements, you get a **different position** for the same time. The elements no longer describe the ship's actual location - they describe some other point in space.

This is analogous to changing someone's latitude without changing their longitude and expecting them to still be in the same city.

---

## Why This Bug Happens

### Root Cause: Inconsistent Element Modification

The `stateToElements()` function correctly computes orbital elements from a position and velocity such that:
- Computing position from those elements returns the original position
- Computing velocity from those elements returns the original velocity

But the forced capture code breaks this consistency by cherry-picking which elements to modify.

### The Orbital Mechanics

For a given position `r` on an orbit:

1. **Eccentricity** determines the *shape* of the ellipse
2. **Semi-major axis** determines the *size* of the ellipse
3. **ω (argument of periapsis)** determines *where* along the ellipse periapsis is
4. **M0 (mean anomaly)** determines *where* on the ellipse the ship is at a given time

When `e` changes from 0.99 to 0.1:
- The orbit shape changes from highly elongated to nearly circular
- But `ω` and `M0` still describe a position on the *old* orbit shape
- Computing position with new `a,e` but old `ω,M0` gives a position that was never on either orbit

### Visual Analogy

Imagine two ellipses sharing the same center:
- Ellipse A: very elongated (e=0.99), large (a=0.05 AU)
- Ellipse B: nearly circular (e=0.1), smaller (a=0.037 AU)

A point 30° around Ellipse A is in a completely different location than a point 30° around Ellipse B.

---

## How to Fix the Bug

### Correct Approach: Preserve Position, Modify Velocity

Instead of modifying orbital elements directly, compute what velocity would give the desired orbit while keeping position fixed:

```javascript
if (newElements.e > 0.7 || orbitalEnergy >= 0) {
    // Keep position fixed, compute new velocity for circular orbit
    const r = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);

    // Circular orbit velocity magnitude: v = sqrt(μ/r)
    const vCircular = Math.sqrt(mu / r);

    // Velocity direction: perpendicular to position (prograde)
    // Using angular momentum direction to maintain orbit orientation
    const hx = pos.y * vel.vz - pos.z * vel.vy;
    const hy = pos.z * vel.vx - pos.x * vel.vz;
    const hz = pos.x * vel.vy - pos.y * vel.vx;
    const hMag = Math.sqrt(hx*hx + hy*hy + hz*hz);

    // Normal to orbital plane
    const nx = hx / hMag;
    const ny = hy / hMag;
    const nz = hz / hMag;

    // Velocity direction: n × r_hat (perpendicular to radius, in orbital plane)
    const rx = pos.x / r;
    const ry = pos.y / r;
    const rz = pos.z / r;

    const vDir = {
        x: ny * rz - nz * ry,
        y: nz * rx - nx * rz,
        z: nx * ry - ny * rx
    };

    // New velocity for circular orbit
    const newVel = {
        vx: vCircular * vDir.x,
        vy: vCircular * vDir.y,
        vz: vCircular * vDir.z
    };

    // Convert (same position, new velocity) to orbital elements
    newElements = stateToElements(pos, newVel, mu, julianDate);
}
```

### Why This Works

1. **Position is unchanged** - the ship stays exactly where it is
2. **Velocity is modified** to match a circular orbit at that radius
3. **`stateToElements()`** computes consistent orbital elements from the state vector
4. **All elements are self-consistent** - computing position from elements returns the original position

### Alternative: Aerobraking/Gravity Assist Animation

For a more realistic game mechanic, instead of instant capture:
1. Detect the high-eccentricity entry
2. Gradually reduce velocity over several frames (simulating atmospheric drag or gravity assist)
3. Each frame, use `stateToElements(pos, reducedVel, mu)` to update elements
4. Ship visibly spirals into stable orbit instead of teleporting

---

## Summary

| Aspect | Description |
|--------|-------------|
| **Bug** | Ship teleports when entering planetary SOI with high velocity |
| **Cause** | Forced capture modifies `e` and `a` without adjusting other elements |
| **Why** | Position depends on ALL orbital elements; changing some breaks consistency |
| **Fix** | Preserve position, compute new velocity for desired orbit, use `stateToElements()` |

This is the same class of bug that was fixed in `applyThrust()` - the solution is always to use the state-vector approach: keep position fixed, modify velocity, then convert back to elements.
