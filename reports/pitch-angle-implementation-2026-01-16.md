# Implementation Report: Adding Pitch/Elevation Sail Angle for 3D Ship Movement

**Generated:** 2026-01-16
**Project:** Sailship - Solar System Navigation Game

---

## Executive Summary

This report outlines the implementation plan for adding a second sail angle (pitch/elevation) to enable full 3D ship movement. The current system uses a single "yaw" angle that rotates thrust within the orbital plane. Adding a pitch angle will allow thrust to be directed out of the orbital plane, enabling inclination changes and true 3D navigation.

**Key Finding:** The underlying physics engine (Gauss variational equations) already fully supports 3D thrust vectors. Only the thrust direction calculation and UI need modification.

---

## 1. Current Implementation Analysis

### 1.1 Sail State Structure

**Location:** `src/js/config.js:70-76`

```javascript
export const DEFAULT_SAIL = {
    area: 3000000,           // m² (3 km²)
    reflectivity: 0.9,       // 90% reflective
    angle: 0.6,              // ~35° yaw angle (radians)
    deploymentPercent: 100,  // Fully deployed
    condition: 100,          // Perfect condition
};
```

### 1.2 Current Angle Semantics

| Angle Value | Behavior |
|-------------|----------|
| 0° | Sail faces sun directly → radial thrust (pushes away from sun) |
| +45° | Prograde component → raises orbit (increases semi-major axis) |
| -45° | Retrograde component → lowers orbit (decreases semi-major axis) |
| ±90° | Sail edge-on to sun → zero thrust |

### 1.3 Current Thrust Direction Calculation

**Location:** `src/js/lib/orbital-maneuvers.js:95-138`

The current implementation constructs thrust direction using:
1. **Radial vector (R):** Points away from the sun
2. **Tangential vector (T):** Perpendicular to R, in the orbital plane (prograde direction)
3. **Rotation:** `thrust = cos(angle) × R + sin(angle) × T`

This produces thrust vectors that always lie in the orbital plane (Normal component = 0).

### 1.4 What Already Works for 3D

| Component | Status | Notes |
|-----------|--------|-------|
| RTN Frame Conversion | ✅ Ready | `eclipticToRTN()` decomposes any 3D thrust |
| Gauss Variational Equations | ✅ Ready | All 6 orbital elements computed |
| Inclination Rate | ✅ Ready | `di/dt = (r × cos(θ) / h) × N` accepts non-zero N |
| Ascending Node Rate | ✅ Ready | `dΩ/dt` equation implemented |

---

## 2. Proposed Design

### 2.1 Naming Convention

| Parameter | Name | Symbol | Range | Purpose |
|-----------|------|--------|-------|---------|
| Existing | Yaw Angle | `angle` | -90° to +90° | Rotation in orbital plane (R↔T) |
| **New** | Pitch Angle | `pitchAngle` | -90° to +90° | Rotation out of orbital plane (toward ±N) |

### 2.2 Physical Interpretation

| Yaw | Pitch | Thrust Direction | Effect |
|-----|-------|------------------|--------|
| 0° | 0° | Pure radial (away from sun) | Pushes outward, minimal orbit change |
| 45° | 0° | Prograde in orbital plane | Raises orbit (increases a) |
| -45° | 0° | Retrograde in orbital plane | Lowers orbit (decreases a) |
| 0° | 45° | Angled "up" out of plane | Increases inclination |
| 0° | -45° | Angled "down" out of plane | Decreases inclination |
| 45° | 30° | Combined prograde + out-of-plane | Raises orbit AND changes inclination |

### 2.3 Mathematical Model

The new thrust direction uses a two-rotation model in the RTN (Radial-Transverse-Normal) frame:

```
Given:
  R = radial unit vector (away from sun)
  T = transverse unit vector (prograde, in orbital plane)
  N = normal unit vector (perpendicular to orbital plane, h-direction)
  α = yaw angle (existing "angle" parameter)
  β = pitch angle (new parameter)

Thrust direction:
  d = cos(β) × [cos(α) × R + sin(α) × T] + sin(β) × N

Thrust magnitude formula (updated):
  F = 2 × P(r) × A × cos²(α) × cos²(β) × ρ

The cos²(β) factor accounts for reduced solar flux when sail is
pitched away from the sun-ship plane.
```

### 2.4 Diagram: RTN Reference Frame

```
                    N (normal, out of orbital plane)
                    │
                    │
                    │     ╱ Thrust with pitch > 0
                    │   ╱
                    │ ╱ β (pitch angle)
                    │╱_______________  T (transverse, prograde)
                   ╱        α (yaw angle)
                 ╱
               ╱
             R (radial, away from Sun)
            ↓
          [Sun]
```

---

## 3. Implementation Plan

### 3.1 Files to Modify

| File | Changes Required | Complexity |
|------|------------------|------------|
| `src/js/config.js` | Add `pitchAngle: 0` to DEFAULT_SAIL | Trivial |
| `src/js/data/ships.js` | Add `setSailPitch()` function + update `getCurrentThrustAccel()` | Simple |
| `src/js/lib/orbital-maneuvers.js` | Update thrust direction + magnitude | Medium |
| `src/js/ui/controls.js` | Add pitch slider handler + keyboard controls + slider initialization | Medium |
| `src/index.html` | Add pitch angle slider to UI | Simple |

### 3.2 Estimated Lines of Code

- New code: ~90-110 lines
- Modified code: ~40-50 lines
- Total impact: ~130-160 lines across 5 files

---

## 4. Detailed Implementation

### Step 1: Update Configuration

**File:** `src/js/config.js`

```javascript
// Around line 70-76, modify DEFAULT_SAIL:
export const DEFAULT_SAIL = {
    area: 3000000,
    reflectivity: 0.9,
    angle: 0.6,              // Yaw angle (radians) - in orbital plane
    pitchAngle: 0,           // NEW: Pitch angle (radians) - out of orbital plane
    deploymentPercent: 100,
    condition: 100,
};
```

---

### Step 2: Add Pitch Setter Function

**File:** `src/js/data/ships.js`

Add after `setSailAngle()` (around line 136):

```javascript
/**
 * Set the sail pitch angle (out-of-plane thrust direction)
 * @param {Object} ship - Ship object
 * @param {number} pitch - Pitch angle in radians (-π/2 to π/2)
 */
export function setSailPitch(ship, pitch) {
    if (ship.sail) {
        ship.sail.pitchAngle = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
    }
}
```

Update exports at top of file to include `setSailPitch`.

---

### Step 2.5: Update UI Thrust Display Function

**File:** `src/js/data/ships.js`

The `getCurrentThrustAccel()` function (around lines 156-178) calculates thrust for UI display. It must be updated to include the pitch factor, otherwise the displayed thrust will be incorrect when pitch ≠ 0.

Update the function:

```javascript
/**
 * Get current sail thrust magnitude for display purposes.
 *
 * @param {Object} ship - Ship object with sail state and position
 * @returns {number} Current thrust acceleration in m/s² (for UI display)
 */
export function getCurrentThrustAccel(ship) {
    if (!ship.sail || !ship.orbitalElements) {
        return 0;
    }

    // Calculate distance from sun
    const r = Math.sqrt(ship.x ** 2 + ship.y ** 2 + ship.z ** 2);
    if (r < 0.01) return 0;

    // Solar pressure at this distance
    const P = SOLAR_PRESSURE_1AU / (r * r);

    // Effective area
    const { area, reflectivity, angle, pitchAngle = 0, deploymentPercent, condition } = ship.sail;
    const effectiveArea = area * (deploymentPercent / 100) * (condition / 100);

    // Thrust magnitude: F = 2 * P * A * cos²(yaw) * cos²(pitch) * ρ
    const cosAngle = Math.cos(angle);
    const cosPitch = Math.cos(pitchAngle);
    const thrustN = 2 * P * effectiveArea * cosAngle * cosAngle * cosPitch * cosPitch * reflectivity;

    // Acceleration in m/s²
    return thrustN / (ship.mass || DEFAULT_SHIP_MASS);
}
```

**Key change:** Added `pitchAngle = 0` to destructuring and `cosPitch * cosPitch` to the thrust formula.

---

### Step 3: Update Thrust Direction Calculation

**File:** `src/js/lib/orbital-maneuvers.js`

Replace `getSailThrustDirection()` function (lines 95-138):

```javascript
/**
 * Calculate sail thrust direction in 3D using RTN frame
 *
 * The thrust direction is computed by:
 * 1. Starting with the radial direction (R, away from sun)
 * 2. Rotating by yaw angle in the orbital plane (toward T)
 * 3. Rotating by pitch angle out of the orbital plane (toward N)
 *
 * @param {Object} shipPosition - {x, y, z} in AU (ecliptic frame)
 * @param {Object} shipVelocity - {vx, vy, vz} in AU/day (ecliptic frame)
 * @param {number} yawAngle - Yaw angle in radians (in-plane rotation)
 * @param {number} pitchAngle - Pitch angle in radians (out-of-plane rotation), default 0
 * @returns {Object} Unit vector {x, y, z} for thrust direction (ecliptic frame)
 */
export function getSailThrustDirection(shipPosition, shipVelocity, yawAngle, pitchAngle = 0) {
    // Get the radial unit vector R (pointing away from sun)
    const sunDir = getSunDirection(shipPosition);

    // Compute angular momentum vector: h = r × v
    const hx = shipPosition.y * shipVelocity.vz - shipPosition.z * shipVelocity.vy;
    const hy = shipPosition.z * shipVelocity.vx - shipPosition.x * shipVelocity.vz;
    const hz = shipPosition.x * shipVelocity.vy - shipPosition.y * shipVelocity.vx;
    const hMag = Math.sqrt(hx ** 2 + hy ** 2 + hz ** 2);

    // Normal unit vector N (perpendicular to orbital plane, along h)
    let Nx, Ny, Nz;
    if (hMag > 1e-10) {
        Nx = hx / hMag;
        Ny = hy / hMag;
        Nz = hz / hMag;
    } else {
        // Fallback to ecliptic normal for degenerate orbits
        Nx = 0;
        Ny = 0;
        Nz = 1;
    }

    // Transverse unit vector T = N × R (prograde direction in orbital plane)
    const Tx = Ny * sunDir.z - Nz * sunDir.y;
    const Ty = Nz * sunDir.x - Nx * sunDir.z;
    const Tz = Nx * sunDir.y - Ny * sunDir.x;

    // Compute thrust direction with both yaw and pitch rotations
    const cosYaw = Math.cos(yawAngle);
    const sinYaw = Math.sin(yawAngle);
    const cosPitch = Math.cos(pitchAngle);
    const sinPitch = Math.sin(pitchAngle);

    // Step 1: In-plane direction (yaw rotation from R toward T)
    // d_planar = cos(yaw) * R + sin(yaw) * T
    const planarX = cosYaw * sunDir.x + sinYaw * Tx;
    const planarY = cosYaw * sunDir.y + sinYaw * Ty;
    const planarZ = cosYaw * sunDir.z + sinYaw * Tz;

    // Step 2: Add pitch rotation (rotate toward N)
    // d = cos(pitch) * d_planar + sin(pitch) * N
    return {
        x: cosPitch * planarX + sinPitch * Nx,
        y: cosPitch * planarY + sinPitch * Ny,
        z: cosPitch * planarZ + sinPitch * Nz
    };
}
```

---

### Step 4: Update Thrust Magnitude Calculation

**File:** `src/js/lib/orbital-maneuvers.js`

Update `calculateSailThrust()` function (around lines 175-204):

```javascript
/**
 * Calculate sail thrust vector given sail state and orbital position
 *
 * Thrust magnitude: F = 2 * P * A * cos²(yaw) * cos²(pitch) * reflectivity
 * - Factor of 2 accounts for reflection (momentum transfer)
 * - cos²(yaw) and cos²(pitch) account for reduced cross-section
 *
 * @param {Object} sailState - Sail configuration {area, reflectivity, angle, pitchAngle, ...}
 * @param {Object} shipPosition - {x, y, z} in AU
 * @param {Object} shipVelocity - {vx, vy, vz} in AU/day
 * @param {number} distanceFromSun - Distance in AU
 * @param {number} shipMass - Ship mass in kg (default 10000)
 * @returns {Object} Thrust acceleration vector {x, y, z} in AU/day²
 */
export function calculateSailThrust(sailState, shipPosition, shipVelocity, distanceFromSun, shipMass = 10000) {
    const {
        area,
        reflectivity,
        angle,           // Yaw angle
        pitchAngle = 0,  // Pitch angle (default 0 for backward compatibility)
        deploymentPercent,
        condition
    } = sailState;

    // Calculate effective sail area
    const effectiveArea = area * (deploymentPercent / 100) * (condition / 100);

    // Solar radiation pressure at current distance (N/m²)
    const pressure = getSolarPressure(distanceFromSun);

    // Thrust magnitude with both angle factors
    // F = 2 * P * A * cos²(yaw) * cos²(pitch) * reflectivity
    const cosYaw = Math.cos(angle);
    const cosPitch = Math.cos(pitchAngle);
    const thrustMagnitudeN = 2 * pressure * effectiveArea *
                             cosYaw * cosYaw *
                             cosPitch * cosPitch *
                             reflectivity;

    // Convert to acceleration (m/s²)
    const accelMS2 = thrustMagnitudeN / shipMass;

    // Convert to AU/day²
    const accelAUDay2 = accelMS2 * ACCEL_CONVERSION;

    // Get thrust direction using both angles
    const thrustDir = getSailThrustDirection(shipPosition, shipVelocity, angle, pitchAngle);

    // Return thrust acceleration vector in AU/day²
    return {
        x: accelAUDay2 * thrustDir.x,
        y: accelAUDay2 * thrustDir.y,
        z: accelAUDay2 * thrustDir.z
    };
}
```

---

### Step 5: Add UI Controls

**File:** `src/index.html`

Add after the existing sail angle slider in the sail controls panel:

```html
<!-- Existing yaw angle control -->
<div class="control-row">
    <label for="sailAngle">Yaw (In-Plane):</label>
    <input type="range" id="sailAngle" min="-90" max="90" value="35">
    <span id="angleValue">35°</span>
</div>

<!-- NEW: Pitch angle control -->
<div class="control-row">
    <label for="sailPitch">Pitch (Out-of-Plane):</label>
    <input type="range" id="sailPitch" min="-90" max="90" value="0">
    <span id="pitchValue">0°</span>
</div>
```

---

### Step 6: Add Control Handlers

**File:** `src/js/ui/controls.js`

Add import for new function:

```javascript
import { getPlayerShip, setSailAngle, setSailPitch, setSailDeployment } from '../data/ships.js';
```

#### 6.1 Initialize Pitch Slider from Ship State

In `initSailControls()`, add initialization for the pitch slider (following the existing pattern for yaw angle, around lines 136-145):

```javascript
function initSailControls() {
    const deploySlider = document.getElementById('sailDeployment');
    const angleSlider = document.getElementById('sailAngle');
    const pitchSlider = document.getElementById('sailPitch');       // NEW
    const deployValue = document.getElementById('sailDeployValue');
    const angleValue = document.getElementById('sailAngleValue');
    const pitchValue = document.getElementById('pitchValue');       // NEW

    const player = getPlayerShip();

    // Initialize slider values from current ship state
    if (player && player.sail) {
        if (deploySlider) {
            deploySlider.value = player.sail.deploymentPercent;
        }
        if (angleSlider) {
            // Convert radians to degrees for display
            angleSlider.value = Math.round(player.sail.angle * 180 / Math.PI);
        }
        // NEW: Initialize pitch slider
        if (pitchSlider) {
            pitchSlider.value = Math.round((player.sail.pitchAngle || 0) * 180 / Math.PI);
        }
        if (pitchValue) {
            pitchValue.textContent = `${Math.round((player.sail.pitchAngle || 0) * 180 / Math.PI)}°`;
        }
    }

    // ... existing slider handlers follow ...
}
```

#### 6.2 Add Pitch Slider Event Handler

Add pitch slider handler (near the existing angle slider handler):

```javascript
// Pitch angle slider
const pitchSlider = document.getElementById('sailPitch');
const pitchValueDisplay = document.getElementById('pitchValue');

if (pitchSlider) {
    pitchSlider.addEventListener('input', (e) => {
        const pitchDegrees = parseInt(e.target.value);
        const pitchRadians = pitchDegrees * Math.PI / 180;

        const ship = getPlayerShip();
        if (ship) {
            setSailPitch(ship, pitchRadians);
        }

        if (pitchValueDisplay) {
            pitchValueDisplay.textContent = `${pitchDegrees}°`;
        }

        updateSailDisplay();  // Update thrust display
    });
}
```

#### 6.3 Add Keyboard Controls

Add keyboard controls in `initKeyboardShortcuts()`:

```javascript
// Pitch angle adjustments with Shift+[ and Shift+] (which produce { and })
if (e.key === '{' && pitchSlider) {
    pitchSlider.value = Math.max(-90, parseInt(pitchSlider.value) - 5);
    pitchSlider.dispatchEvent(new Event('input'));
}
if (e.key === '}' && pitchSlider) {
    pitchSlider.value = Math.min(90, parseInt(pitchSlider.value) + 5);
    pitchSlider.dispatchEvent(new Event('input'));
}
```

---

## 5. Keyboard Controls Summary

| Key | Action | Adjustment |
|-----|--------|------------|
| `[` | Decrease yaw angle | -5° (more retrograde) |
| `]` | Increase yaw angle | +5° (more prograde) |
| `{` (Shift+[) | Decrease pitch angle | -5° (thrust more "down") |
| `}` (Shift+]) | Increase pitch angle | +5° (thrust more "up") |
| `-` | Decrease deployment | -10% |
| `=` | Increase deployment | +10% |

---

## 6. Testing Plan

### 6.1 Unit Tests (Manual Verification)

| Test | Yaw | Pitch | Expected Behavior |
|------|-----|-------|-------------------|
| Baseline | 0° | 0° | Thrust purely radial, minimal orbital change |
| Prograde | 45° | 0° | Orbit raises (a increases) |
| Retrograde | -45° | 0° | Orbit lowers (a decreases) |
| Pitch up | 0° | 45° | Inclination increases |
| Pitch down | 0° | -45° | Inclination decreases |
| Combined | 45° | 30° | Both a and i change |
| Edge case | 90° | 0° | Zero thrust (sail edge-on) |
| Edge case | 0° | 90° | Thrust purely normal to orbit |

### 6.2 Integration Tests

**Test 1: Inclination Change Maneuver**
1. Start in Earth's orbital plane (i ≈ 0°)
2. Set pitch to +45° or higher
3. Run simulation for several orbital periods
4. Verify inclination increases over time
5. Verify longitude of ascending node also changes

**Test 2: Plane Change at Optimal Location**
- Plane changes are most efficient when thrust is applied at orbital nodes
- Gauss equation: `di/dt = (r × cos(θ) / h) × N`
- Maximum di/dt occurs at θ = 0° or 180° (at nodes)
- Verify inclination changes faster near nodes

**Test 3: Thrust Magnitude Verification**
1. Set yaw = 45°, pitch = 0° → Thrust = F × cos²(45°) = 0.5F
2. Set yaw = 0°, pitch = 45° → Thrust = F × cos²(45°) = 0.5F
3. Set yaw = 45°, pitch = 45° → Thrust = F × cos⁴(45°) = 0.25F
4. Verify acceleration values match expected reductions

### 6.3 Visual Verification (with 3D view)

- Rotate view to see orbital plane edge-on
- Apply positive pitch angle
- Verify ship's orbital path tilts relative to original plane
- Verify orbit visualization updates to show new inclination

---

## 7. Physics Notes

### 7.1 Gauss Variational Equations (Already Implemented)

The existing implementation handles these orbital element rates:

| Element | Rate Equation | Component |
|---------|---------------|-----------|
| Semi-major axis (a) | `da/dt = (2a²/h) × (e×sin(ν)×R + (p/r)×T)` | R, T |
| Eccentricity (e) | `de/dt = (1/h) × (...)` | R, T |
| **Inclination (i)** | `di/dt = (r×cos(θ)/h) × N` | **N only** |
| **Ascending node (Ω)** | `dΩ/dt = (r×sin(θ)/(h×sin(i))) × N` | **N only** |
| Arg. of periapsis (ω) | `dω/dt = (...)` | R, T, N |

**Key insight:** Inclination and ascending node changes require Normal (N) thrust component. This is exactly what the pitch angle provides.

### 7.2 Optimal Plane Change Strategy

For efficient plane changes:
1. Apply pitch thrust near **orbital nodes** (where orbit crosses target plane)
2. Positive pitch at **ascending node** → increases inclination
3. Negative pitch at **descending node** → increases inclination (opposite direction)
4. Magnitude decreases with cos(θ) away from nodes

### 7.3 Coupled Effects

When applying pitch, other orbital elements may also change:
- **Longitude of ascending node (Ω):** Rotates due to normal thrust
- **Argument of periapsis (ω):** May precess
- **Semi-major axis (a):** Slightly affected if pitch reduces in-plane thrust

The Gauss equations handle all coupling automatically.

---

## 8. Backward Compatibility

The implementation maintains full backward compatibility:

1. **Default pitch = 0:** Existing behavior unchanged
2. **Old save data:** Ships without `pitchAngle` default to 0
3. **Existing controls:** Yaw angle controls unchanged
4. **Physics engine:** No changes to Gauss equations needed

---

## 9. Future Enhancements (Out of Scope)

These could be added later but are not part of this implementation:

1. **Optimal Pitch Indicator** - Show recommended pitch based on position relative to nodes
2. **Automatic Plane Change Mode** - Autopilot that optimizes pitch throughout orbit
3. **3D Thrust Vector Visualization** - Render thrust arrow in 3D view
4. **Pitch scheduling** - Vary pitch automatically during orbit for efficiency

---

## 10. Summary

| Aspect | Details |
|--------|---------|
| **New parameter** | `pitchAngle` (-90° to +90°) |
| **Physics change** | Thrust can now have Normal (N) component |
| **UI additions** | Pitch slider, `{`/`}` keyboard shortcuts, slider initialization |
| **Files modified** | 5 files (~130-160 lines total) |
| **Backward compatible** | Yes (pitchAngle defaults to 0) |
| **Physics engine changes** | None (Gauss equations already support 3D) |

The implementation enables true 3D orbital maneuvering while preserving the existing 2D control scheme as a subset (pitch = 0).

---

## 11. Implementation Checklist

Based on review feedback, ensure the following are completed:

### Pre-Implementation
- [ ] Review existing `getCurrentThrustAccel()` function

### During Implementation
- [ ] Step 1: Add `pitchAngle: 0` to DEFAULT_SAIL (config.js)
- [ ] Step 2: Add `setSailPitch()` function (ships.js)
- [ ] Step 2.5: Update `getCurrentThrustAccel()` with pitch factor (ships.js) ⚠️ **Review item #1**
- [ ] Step 3: Update `getSailThrustDirection()` (orbital-maneuvers.js)
- [ ] Step 4: Update `calculateSailThrust()` (orbital-maneuvers.js)
- [ ] Step 5: Add pitch slider to HTML (index.html)
- [ ] Step 6.1: Add slider initialization (controls.js) ⚠️ **Review item #2**
- [ ] Step 6.2: Add slider event handler (controls.js)
- [ ] Step 6.3: Add keyboard shortcuts (controls.js)
- [ ] Update imports (controls.js)

### Post-Implementation
- [ ] Verify pitch=0 produces identical behavior to current code (regression test)
- [ ] Verify inclination increases with positive pitch
- [ ] Verify thrust display updates correctly with pitch changes
- [ ] Test keyboard shortcuts

---

*End of Implementation Report*
