# Ship Trajectory Cutoff — Robustness Improvements Specification

**Generated:** 2026-02-10

## 1. Executive Summary

The trajectory predictor currently truncates predictions prematurely due to numerical instability in the state-vector-to-orbital-elements conversion, an arbitrary 10 AU distance cap, and Kepler solver singularities near parabolic orbits. Four targeted improvements will extend prediction range to the full classical solar system (50 AU), recover from integration instability via adaptive sub-stepping, prevent element corruption via clamping, and eliminate the e=1 singularity via universal variable formulation.

## 1.1 Estimated File Impact

### Files to EDIT:
- `src/js/lib/trajectory-predictor.js` — Adaptive sub-stepping, raise AU limit, updated eccentricity thresholds
- `src/js/lib/orbital-maneuvers.js` — Element validation clamping in `applyThrust()`
- `src/js/lib/soi.js` — Element clamping in `stateToElements()`
- `src/js/lib/orbital.js` — Universal variable (Stumpff) functions for near-parabolic orbits
- `src/js/lib/evaluate-trajectory.js` — Match updated eccentricity threshold and distance limits
- `src/js/config.js` — Updated physics config constants

### Files to CREATE:
- None

## 2. Current State Analysis

### 2.1 Existing Systems

| System | Location | Purpose |
|--------|----------|---------|
| Trajectory Predictor | `trajectory-predictor.js` | RK2 midpoint integration loop, cache, truncation logic |
| Orbital Maneuvers | `orbital-maneuvers.js` | `applyThrust()` — state-vector approach (pos + ΔV → new elements) |
| State-to-Elements | `soi.js:stateToElements()` | Cartesian (r,v) → Keplerian elements conversion |
| Kepler Solvers | `orbital.js` | Elliptic/hyperbolic anomaly solvers, position/velocity from elements |
| Trajectory Evaluator | `evaluate-trajectory.js` | Simplified predictor for course solver (same instability issues) |

### 2.2 Integration Flow

```
predictTrajectory() loop:
  for each step:
    1. getPosition(simElements, time) → position
    2. getVelocity(simElements, time) → velocity
    3. calculateSailThrust(sail, pos, vel, dist, mass) → thrust vector
    4. RK2 midpoint:
       a. applyThrust(elements, thrustStart, dt/2, time) → midElements
       b. calculateSailThrust(sail, midPos, midVel, ...) → thrustMid
       c. applyThrust(elements, thrustMid, dt, time) → newElements
    5. Validate newElements; if invalid → truncate
    6. simElements = newElements
```

Each `applyThrust()` call:
```
  getPosition(elements, t) → pos
  getVelocity(elements, t) → vel
  vel_new = vel + thrust * dt
  stateToElements(pos, vel_new, μ, t) → newElements
```

### 2.3 Failure Points

| Location | Issue | Consequence |
|----------|-------|-------------|
| `soi.js:252` | `energy = v²/2 - μ/r` near zero | `a = -μ/(2*energy)` → ±∞ |
| `soi.js:279-290` | Eccentricity computed from vectors | Can jump discontinuously |
| `soi.js:288-290` | Parabolic nudge (0.9999/1.0001) | Doesn't prevent downstream solver issues |
| `orbital.js:99-127` | Kepler solver for e→1 | Convergence issues near parabolic |
| `trajectory-predictor.js:28` | `MAX_HELIOCENTRIC_RADIUS = 10` | Can't predict beyond Jupiter |
| `trajectory-predictor.js:430,495` | Hard `e > 50` truncation | Kills trajectory instead of recovering |

## 3. Gap Analysis

### 3.1 Missing Capabilities
- [ ] No adaptive timestep — fixed dt can't handle rapid orbital changes
- [ ] No element clamping — bad elements propagate until NaN/truncation
- [ ] 10 AU limit prevents outer solar system trajectories
- [ ] No universal variable formulation — Kepler solver has e=1 singularity

### 3.2 Required Changes
- [ ] Adaptive sub-stepping when Δe or Δa/a exceed thresholds per step
- [ ] Clamp elements in `stateToElements()` and validate more intelligently in `applyThrust()`
- [ ] Raise `MAX_HELIOCENTRIC_RADIUS` from 10 to 50 AU
- [ ] Add Stumpff C(z)/S(z) functions and universal Kepler solver for 0.95 < e < 1.05

## 4. Open Questions
- [x] Does `evaluate-trajectory.js` need the same fixes? → Yes, same patterns
- [x] Will raising AU limit affect performance? → No, it's just a comparison check
- [x] Cache impact of adaptive sub-stepping? → None if output point count unchanged (internal-only sub-steps)
