# Solar Sail Physics - MVP Specification

## Overview

This document specifies the minimum viable physics for a solar sail spacecraft simulation. The goal is realistic photon-pressure propulsion where players control sail angle to navigate the inner solar system.

## Core Concept

Solar sails work by reflecting photons from the Sun. When light bounces off the sail, momentum transfers to the spacecraft. This creates a small but continuous thrust that requires no fuel.

**Key constraint:** A solar sail can only push AWAY from the Sun. You cannot thrust toward the Sun directly. However, by angling the sail, you can direct some of that outward thrust along or against your orbital velocity, allowing you to raise or lower your orbit.

---

## Ship Parameters

Based on previous calculations for a 200-ton cargo freighter:

| Parameter | Value | Notes |
|-----------|-------|-------|
| Ship mass | 200,000 kg | Total loaded mass including cargo |
| Sail area | 4,000,000 m² | Four 1 km² panels |
| Sail reflectivity | 0.9 | 90% reflective (realistic high-performance) |
| Target acceleration | 0.00039 m/s² | Achieves ~6 month Earth-Mars transit |

---

## Physics Constants

| Constant | Value | Unit | Notes |
|----------|-------|------|-------|
| Solar radiation pressure at 1 AU | 9.08 × 10⁻⁶ | N/m² | This is photon pressure, NOT solar wind |
| 1 AU | 149,597,870.7 | km | Astronomical Unit |

---

## Core Equations

### 1. Solar Radiation Pressure vs Distance

Pressure follows inverse square law:

```
P(r) = P₀ × (1 AU / r)²
```

Where:
- `P(r)` = pressure at distance r
- `P₀` = 9.08 × 10⁻⁶ N/m² (pressure at 1 AU)
- `r` = distance from Sun in AU

**Example values:**
| Distance | Pressure (N/m²) | Relative to Earth |
|----------|-----------------|-------------------|
| 0.39 AU (Mercury) | 5.97 × 10⁻⁵ | 6.6× stronger |
| 1.0 AU (Earth) | 9.08 × 10⁻⁶ | baseline |
| 1.52 AU (Mars) | 3.93 × 10⁻⁶ | 0.43× weaker |
| 5.2 AU (Jupiter) | 3.36 × 10⁻⁷ | 0.037× weaker |

### 2. Sail Thrust Force

```
F = 2 × P(r) × A × cos²(θ) × reflectivity
```

Where:
- `F` = force in Newtons
- `P(r)` = solar pressure at current distance
- `A` = sail area in m²
- `θ` = angle between sail normal and sun-line (0° = facing sun directly)
- `reflectivity` = 0.0 to 1.0 (0.9 typical)

**Why cos²(θ)?**
- First cosine: effective sail area decreases as you tilt (projected area)
- Second cosine: reflected photons transfer less momentum at an angle

**Example at 1 AU with our freighter (θ = 0°):**
```
F = 2 × 9.08×10⁻⁶ × 4,000,000 × 1 × 0.9
F = 65.4 N
```

### 3. Acceleration

```
a = F / m
```

Where:
- `a` = acceleration in m/s²
- `F` = force from equation above
- `m` = ship mass in kg

**Example with our freighter at 1 AU (θ = 0°):**
```
a = 65.4 / 200,000
a = 0.000327 m/s² (0.327 mm/s²)
```

---

## Sail Angle and Thrust Direction

This is the key to navigation. The sail angle determines WHERE your thrust goes.

### Coordinate System

For 2D simulation in the ecliptic plane:
- Sun is at origin (0, 0)
- Ship position is (x, y) in km
- `sunward_vector` = unit vector pointing from ship toward Sun
- `prograde_vector` = unit vector pointing along orbital velocity (perpendicular to sunward, in direction of motion)

### Sail Angle Definition

The sail angle `θ` is measured from the sun-line:
- `θ = 0°`: Sail faces Sun directly, maximum thrust directly away from Sun
- `θ = 45°`: Sail tilted, thrust has both radial and tangential components
- `θ = 90°`: Sail edge-on to Sun, effectively zero thrust

### Thrust Vector Calculation

The thrust direction is determined by the sail normal (which equals the reflection direction for a perfect mirror).

For a sail tilted at angle `θ` toward prograde:

```
thrust_magnitude = 2 × P(r) × A × cos²(θ) × reflectivity / m

thrust_direction = cos(θ) × anti_sunward_vector + sin(θ) × prograde_vector
```

For a sail tilted at angle `θ` toward retrograde:

```
thrust_direction = cos(θ) × anti_sunward_vector - sin(θ) × prograde_vector
```

### Practical Effects

| Sail Angle | Radial Component | Tangential Component | Effect |
|------------|------------------|---------------------|--------|
| 0° (face sun) | 100% outward | 0% | Push directly away from sun |
| 35° prograde | 82% outward | 57% prograde | Optimal for raising orbit |
| 35° retrograde | 82% outward | 57% retrograde | Optimal for lowering orbit |
| 45° | 50% outward | 50% tangential | Balanced |
| 90° (edge-on) | ~0% | ~0% | Coasting / minimal thrust |

**Note:** The "optimal" angle of ~35° maximizes the tangential (orbit-changing) component of thrust. This is because the derivative of cos(θ)×sin(θ) is maximized at θ = 45°, but accounting for cos²(θ) thrust reduction, the optimal is closer to 35°.

---

## Orbital Mechanics Integration

### What Changes When You Thrust

Solar sails don't work like chemical rockets (impulsive burns). They provide continuous low thrust. This means:

1. **Prograde thrust** (sail tilted toward direction of travel):
   - Increases orbital energy
   - Raises orbit over time
   - Ship spirals outward

2. **Retrograde thrust** (sail tilted against direction of travel):
   - Decreases orbital energy
   - Lowers orbit over time
   - Ship spirals inward

3. **Pure radial thrust** (sail facing sun):
   - Pushes ship outward but doesn't efficiently change orbit
   - Mostly just makes orbit slightly more elliptical
   - Not useful for getting places

### Implementation Approach

For the MVP, use Gauss's Variational Equations to convert thrust into orbital element changes. The key orbital elements:

- `a` = semi-major axis (size of orbit)
- `e` = eccentricity (how elliptical)
- `ω` = argument of perihelion (orientation)
- `M` = mean anomaly (position along orbit)

Thrust components:
- `T` = tangential (along velocity vector) - changes energy most efficiently
- `N` = normal (perpendicular to orbital plane) - not used in 2D
- `R` = radial (toward/away from Sun) - changes eccentricity

The variational equations give `da/dt`, `de/dt`, etc. as functions of thrust components.

---

## Player Control

### Input
- Single angle value: -90° to +90°
- Negative = tilted retrograde (fall toward sun)
- Zero = facing sun (coast / maximum radial thrust)
- Positive = tilted prograde (climb away from sun)

### Display (suggested)
- Current sail angle
- Current thrust magnitude (in appropriate units)
- Current acceleration
- Thrust vector visualization

---

## Edge Cases

### θ = 90° (Edge-on)
Thrust approaches zero. In reality there's still some interaction, but for MVP, treat as zero thrust.

### Very Close to Sun (< 0.1 AU)
Sail material would degrade/melt. For MVP, either:
- Prevent player from getting this close, OR
- Cap maximum pressure at some value

### Very Far from Sun (> 5 AU)
Thrust becomes negligible. Solar sails are impractical beyond Jupiter. For MVP, just let the math play out (thrust gets very small).

---

## Validation Checks

Use these to verify implementation:

1. **At 1 AU, θ = 0°, our freighter should have:**
   - Force ≈ 65 N
   - Acceleration ≈ 0.00033 m/s²

2. **At 2 AU, same conditions:**
   - Force ≈ 16 N (1/4 of Earth value)
   - Acceleration ≈ 0.00008 m/s²

3. **At 1 AU, θ = 45°:**
   - Force ≈ 33 N (half of maximum)
   - Thrust direction: ~45° off radial

4. **At 1 AU, θ = 90°:**
   - Force ≈ 0 N
   - Ship should coast with no acceleration from sail

5. **Sustained prograde thrust should:**
   - Increase semi-major axis over time
   - Ship moves to higher orbit

6. **Sustained retrograde thrust should:**
   - Decrease semi-major axis over time
   - Ship falls to lower orbit

---

## Units Summary

| Quantity | Internal Unit | Display Unit |
|----------|---------------|--------------|
| Distance | km | km or AU |
| Time | seconds (or days for long sim) | context-dependent |
| Mass | kg | kg or tons |
| Force | N | N or mN |
| Acceleration | m/s² | mm/s² (more readable) |
| Angle | radians (internal) | degrees (display) |
| Sail area | m² | m² or km² |

---

## What This Spec Does NOT Cover (Future Work)

- NOAA integration for space weather
- Magnetic drag from solar wind
- Radiation storms / sail damage
- Charge buildup / plasma discharge
- 3D orbital mechanics (out-of-plane maneuvers)
- Multiple sail panels with independent angles
- Sail deployment/reefing mechanics
- Secondary propulsion systems

---

## Reference: The Key Formula

If you remember nothing else:

```
acceleration = (2 × 9.08×10⁻⁶ × Area × cos²(angle) × reflectivity) / (mass × distance_AU²)
```

This single equation, plus the thrust direction calculation, is the heart of the entire sail physics system.
