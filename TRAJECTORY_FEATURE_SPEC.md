# Predictive Trajectory Display - Feature Specification

## Discovery Phase Summary

This document records the findings from exploring the sailship codebase to understand how to implement a predictive trajectory display (spiral path) alongside the existing Keplerian orbit indicator.

---

## 1. Current Orbit Indicator System

### How It Works

The **green orbit indicator** displays the instantaneous Keplerian orbit - where the ship would go if thrust stopped immediately.

**Key files:**
- `src/js/ui/renderer.js` - Rendering logic (`drawShipOrbit()` function, lines 205-379)
- `src/js/core/shipPhysics.js` - Visual smoothing (`visualOrbitalElements`)
- `src/js/lib/orbital.js` - Orbital mechanics calculations

### Rendering Flow

```
ship.orbitalElements (actual orbit)
    ↓
ship.visualOrbitalElements (smoothed for display)
    ↓
drawShipOrbit() in renderer.js
    ↓
For each of 64 points:
    1. Calculate true anomaly (0 to 2π for elliptic)
    2. Compute orbital radius: r = a(1-e²)/(1+e·cos(ν))
    3. Get position in orbital plane
    4. Apply 3D rotation (ω, i, Ω)
    5. Project to screen via project3D()
    ↓
Draw connected line segments with dashing
```

### Visual Smoothing System

To prevent orbit visualization from jumping during rapid thrust changes:

1. **`visualOrbitalElements`** - A copy of orbital elements that lerps toward actual values
2. **Lerp rate:** 0.25 per frame (25% closer each frame)
3. **Orbit type changes** (elliptic ↔ hyperbolic): Snap immediately
4. **Large changes** (Δa > 20% or Δe > 0.3): Snap 50% of the way
5. **Angle interpolation:** Uses shortest-arc lerp to avoid 350°→10° wraparound

### Hyperbolic Orbit Handling

- Only renders from `-ν_max` to `+ν_max` where `ν_max = arccos(-1/e)`
- Uses 95% of max to avoid asymptote rendering issues
- Cyan dashed line for escape trajectories
- Maximum render distance enforced (2 AU heliocentric, 1.5× SOI if planetocentric)

### Styling

| Ship Type | Color | Width | Pattern |
|-----------|-------|-------|---------|
| Player (heliocentric) | Green `rgba(100, 255, 100, 0.8)` | 1.5px | Dashed [4,4] |
| Player (in SOI) | Blue `rgba(100, 200, 255, 0.8)` | 1.5px | Dashed [4,4] |
| Player (hyperbolic) | Cyan `rgba(0, 255, 255, 0.8)` | 1.5px | Dashed [6,3] |
| NPC | Orange `rgba(255, 150, 50, 0.6)` | 1px | Dashed [4,4] |

---

## 2. Ship State & Physics Model

### Ship Data Structure

```javascript
{
    // Keplerian orbital elements (source of truth)
    orbitalElements: {
        a: 0.95,              // Semi-major axis (AU)
        e: 0.02,              // Eccentricity
        i: 0.001,             // Inclination (radians)
        Ω: 0,                 // Longitude of ascending node
        ω: 0,                 // Argument of periapsis
        M0: Math.PI/4,        // Mean anomaly at epoch
        epoch: GAME_START_EPOCH,
        μ: MU_SUN             // Gravitational parameter
    },

    // Solar sail configuration
    sail: {
        area: 3000000,           // m² (3 km²)
        reflectivity: 0.9,       // 90%
        angle: 0.6,              // Yaw (in-plane), radians
        pitchAngle: 0,           // Pitch (out-of-plane)
        deploymentPercent: 100,  // 0-100%
        condition: 100           // 0-100%
    },

    mass: 10000,                 // kg

    // Cached position/velocity (derived each frame)
    x: 0, y: 0, z: 0,
    velocity: { x: 0, y: 0, z: 0 },

    // Smoothed elements for orbit display
    visualOrbitalElements: { ... }
}
```

### Physics Update Loop

Each frame in `updateShipPhysics()`:

1. Get position/velocity from `orbitalElements` at current Julian date
2. Calculate solar sail thrust (direction from RTN frame, magnitude from solar pressure)
3. Apply thrust using **state-vector approach**:
   - Keep position unchanged
   - Add ΔV to velocity: `v_new = v + thrust * dt`
   - Convert (position, v_new) back to orbital elements
4. Cache position/velocity for rendering
5. Update `visualOrbitalElements` via smooth lerp

### Thrust Model

**Solar sail force:**
```
F = 2 * P(r) * A * cos²(yaw) * cos²(pitch) * ρ

Where:
  P(r) = 4.56e-6 / r² N/m² (solar pressure at distance r AU)
  A = sail area (m²)
  yaw = in-plane angle (0 = face sun)
  pitch = out-of-plane angle
  ρ = reflectivity (0-1)
```

**Typical acceleration at 1 AU:** ~0.5 mm/s² for default sail

---

## 3. Display Options System

### Current Architecture

**Storage:** `src/js/core/gameState.js`
```javascript
export const displayOptions = { ...DEFAULT_DISPLAY_OPTIONS };

export function setDisplayOption(option, value) {
    if (option in displayOptions) {
        displayOptions[option] = value;
    }
}
```

**Defaults:** `src/js/config.js`
```javascript
export const DEFAULT_DISPLAY_OPTIONS = {
    showOrbits: true,
    showLabels: true,
    showTrajectory: true,  // Flight path to destination
    showGrid: true,
};
```

**UI Controls:** `src/js/ui/controls.js`
```javascript
function initDisplayOptions() {
    const options = {
        'showOrbits': 'showOrbits',
        'showLabels': 'showLabels',
        'showTrajectory': 'showTrajectory',
        'showGrid': 'showGrid'
    };

    Object.entries(options).forEach(([elementId, optionName]) => {
        const element = document.getElementById(elementId);
        if (element) {
            element.addEventListener('change', e =>
                setDisplayOption(optionName, e.target.checked));
        }
    });
}
```

**HTML:** `src/index.html`
```html
<div class="panel-section">
    <div class="panel-header">DISPLAY OPTIONS</div>
    <div class="display-options">
        <label><input type="checkbox" id="showOrbits" checked> ORBITAL PATHS</label>
        <label><input type="checkbox" id="showLabels" checked> LABELS</label>
        <label><input type="checkbox" id="showTrajectory" checked> FLIGHT PATH</label>
        <label><input type="checkbox" id="showGrid" checked> GRID</label>
    </div>
</div>
```

**Renderer Usage:**
```javascript
function drawOrbit(body, centerX, centerY, scale) {
    if (!displayOptions.showOrbits) return;  // Early exit if disabled
    // ... rendering code
}
```

### Pattern for New Toggle

1. Add to `DEFAULT_DISPLAY_OPTIONS` in config.js
2. Add HTML checkbox with matching ID
3. Register in `initDisplayOptions()`
4. Check `displayOptions.newOption` in rendering function

---

## 4. Existing Trajectory Prediction Code

### Navigation System (`src/js/core/navigation.js`)

The codebase already has trajectory prediction for navigation purposes:

**`predictClosestApproach(maxDays, steps)`** (lines 200-280):
- Clones ship's orbital elements
- Steps forward in time, applying sail thrust each step
- Tracks minimum distance to destination
- Caches result for 500ms
- Returns `{closestDistance, timeToClosest, status, approaching}`

**`simulateWithStrategy(sailOverride, maxDays, steps)`** (lines 340-410):
- Similar propagation loop
- Allows testing different sail configurations
- Used by navigation computer to recommend strategies

**`computeNavigationPlan()`** (lines 450-550):
- Tests 10 different sail strategies over 1 year
- Each with 200 propagation steps
- Caches result for 2000ms

### Key Propagation Pattern

```javascript
function simulateForward(elements, sail, days, steps) {
    let currentElements = deepClone(elements);
    const dt = days / steps;  // Time step in days
    const positions = [];

    for (let i = 0; i < steps; i++) {
        const time = startTime + i * dt;
        const pos = getPosition(currentElements, time);
        positions.push(pos);

        // Calculate thrust at this position
        const thrust = calculateSailThrust(sail, pos, vel, distance, mass);

        // Apply thrust to modify orbit
        currentElements = applyThrust(currentElements, thrust, dt, time);
    }

    return positions;
}
```

---

## 5. Physics Utilities Available

### Orbital Mechanics (`src/js/lib/orbital.js`)

| Function | Purpose |
|----------|---------|
| `getPosition(elements, julianDate)` | 3D position from Keplerian elements |
| `getVelocity(elements, julianDate)` | 3D velocity from Keplerian elements |
| `meanMotion(a, μ)` | Mean angular velocity |
| `propagateMeanAnomaly(M0, n, dt, hyperbolic)` | Advance mean anomaly |
| `solveKepler(M, e)` | Eccentric anomaly from mean anomaly |
| `orbitalRadius(a, e, ν)` | Radius at true anomaly |
| `rotateToEcliptic(pos, i, Ω, ω)` | Orbital plane to ecliptic frame |

### Maneuvers (`src/js/lib/orbital-maneuvers.js`)

| Function | Purpose |
|----------|---------|
| `calculateSailThrust(sail, pos, vel, dist, mass)` | Solar sail thrust vector |
| `applyThrust(elements, thrust, dt, time)` | Modify orbit with thrust |
| `getSolarPressure(distance)` | Pressure at distance from Sun |
| `getSailThrustDirection(pos, vel, yaw, pitch)` | Unit vector in RTN frame |

### SOI & Frame Conversion (`src/js/lib/soi.js`)

| Function | Purpose |
|----------|---------|
| `stateToElements(pos, vel, μ, epoch)` | State vector to Keplerian |
| `checkSOIEntry(shipPos, bodies)` | Detect SOI entry |
| `checkSOIExit(relPos, parent)` | Detect SOI exit |
| `helioToPlanetocentric(...)` | Frame conversion |

---

## 6. Key Architectural Decisions

### Why Keplerian Elements?

The game maintains ships on true Keplerian orbits rather than integrating position/velocity directly:
- Guaranteed energy conservation (no numerical drift)
- Efficient long-time propagation
- Natural hyperbolic/elliptic distinction
- Easy orbit visualization (just sample the ellipse)

### State-Vector Thrust Approach

The codebase switched from Gauss variational equations to a state-vector approach:
1. Get (position, velocity) from elements
2. Apply ΔV to velocity only (position unchanged)
3. Convert back to elements

**Benefit:** Guarantees position continuity - no sudden jumps during thrust.

### Visual Smoothing Philosophy

The `visualOrbitalElements` system exists specifically because:
- During thrust, orbital elements change rapidly
- Drawing the "true" orbit would flicker/jump
- Smoothed display provides better UX while maintaining physics accuracy

---

## 7. Constraints & Considerations

### Performance

- Main rendering at 60 FPS
- Navigation predictions cached (500ms-2000ms)
- Existing orbit drawing: 64 points per orbit
- Multiple ships can be on screen

### Edge Cases

1. **Zero thrust:** Predicted trajectory should collapse to Keplerian orbit
2. **SOI transitions:** Trajectory may cross planetary SOI boundaries
3. **Escape trajectories:** Hyperbolic orbits extend to infinity
4. **Numerical precision:** Long propagation accumulates error

### Visual Clarity

- Current orbit: Green dashed ellipse
- Flight path (waypoints): Cyan dotted line with markers
- New predicted trajectory needs distinct visual style

---

## 8. Recommended Approach

### Default Behavior Recommendation

**Default: Show both Keplerian orbit AND predicted trajectory**

**Rationale:**
1. The Keplerian orbit (ellipse) shows "escape orbit if engines fail" - safety critical
2. The predicted trajectory shows "where I'm actually going" - navigation critical
3. Both serve different purposes; neither fully replaces the other
4. Advanced users may want to toggle off either for clarity
5. New users benefit from seeing how thrust transforms the orbit

### Visual Differentiation

| Display | Style | Purpose |
|---------|-------|---------|
| Keplerian orbit | Green dashed ellipse | "Where I'd go without thrust" |
| Predicted trajectory | Magenta/purple solid spiral | "Where I'm actually going" |

Distinct color and line style ensures no confusion.

### Toggle Options

Add two new toggles to Display Options:
1. **ORBITAL PATHS** (existing) - Controls all orbit displays
2. **PREDICTED PATH** (new) - Controls predicted trajectory specifically

When `showOrbits` is off, neither shows. When on, each sub-option can be toggled.

---

## 9. Files to Modify/Create

### Modify

| File | Changes |
|------|---------|
| `src/js/config.js` | Add `showPredictedTrajectory` to defaults |
| `src/index.html` | Add checkbox for new toggle |
| `src/js/ui/controls.js` | Register new toggle handler |
| `src/js/ui/renderer.js` | Add `drawPredictedTrajectory()` function |
| `src/js/core/gameState.js` | Store predicted trajectory points |

### Create

| File | Purpose |
|------|---------|
| `src/js/lib/trajectory-predictor.js` | Encapsulate trajectory propagation logic |

### Do NOT Modify

- `drawShipOrbit()` function internals - keep existing orbit display intact
- Ship physics update loop - trajectory prediction is display-only
- Orbital mechanics core functions - use them, don't change them

---

## 10. Open Questions

1. **Prediction horizon:** How far ahead should we predict? (Recommend: configurable, default 30 days)
2. **Update frequency:** Every frame, or cached? (Recommend: cache with 100-200ms TTL)
3. **Number of points:** How many segments for the spiral? (Recommend: 100-200)
4. **SOI handling:** Should trajectory prediction cross SOI boundaries? (Recommend: yes, with frame conversion)
5. **Thrust changes:** When sail settings change, invalidate cache immediately?

---

**Discovery Phase Complete**

Findings documented. Ready to proceed to Planning Phase.
