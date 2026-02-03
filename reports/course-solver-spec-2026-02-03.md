# Course Solver Specification

## 1. Executive Summary

Implement a hybrid coarse-to-fine search algorithm that automatically calculates optimal sail settings (yaw, pitch, deployment) to intercept a target planet. The solver searches the sail parameter space, simulates trajectories for each candidate, and returns the settings that achieve the closest approach to the destination.

## 1.1 Estimated File Impact

### Files to EDIT:
- `src/js/core/navigation.js` - Add `computeOptimalCourse()` function and integrate with autopilot
- `src/js/ui/uiUpdater.js` - Display computed course results in AUTO panel
- `src/js/ui/controls.js` - Add "PLOT COURSE" button handler

### Files to CREATE:
- `src/js/lib/course-solver.js` - Core algorithm: hybrid coarse-to-fine search
- `src/js/lib/course-solver.test.js` - TDD test suite

## 2. Current State Analysis

### 2.1 Existing Systems

| System | Location | Purpose |
|--------|----------|---------|
| Trajectory Predictor | `src/js/lib/trajectory-predictor.js` | Forward simulation with sail thrust |
| Navigation Planner | `src/js/core/navigation.js` | Tests 10 discrete strategies |
| Intersection Detector | `src/js/lib/intersectionDetector.js` | Finds orbital crossings |
| Sail Thrust | `src/js/lib/orbital-maneuvers.js` | Calculates thrust from sail settings |
| Autopilot | `src/js/core/gameState.js` | Gradual sail adjustment toward target |

### 2.2 Data Flow

```
Current flow:
  Player adjusts sail → predictTrajectory() → renderer shows purple line
  computeNavigationPlan() → tests 10 strategies → shows best discrete option

Proposed flow:
  Player clicks PLOT COURSE → computeOptimalCourse()
  → Coarse sweep (10° steps)
  → Find top candidates
  → Fine search (1° steps)
  → Return optimal {yaw, pitch, deployment}
  → Display result and enable "APPLY" button
```

### 2.3 Relevant Code

- `trajectory-predictor.js:predictTrajectory()` - Simulates forward trajectory with sail settings
- `navigation.js:computeNavigationPlan()` - Current 10-strategy discrete search
- `navigation.js:simulateWithStrategy()` - Tests one sail configuration
- `orbital-maneuvers.js:calculateSailThrust()` - Converts sail angles to thrust vector
- `gameState.js:autoPilotState` - Stores autopilot configuration

## 3. Gap Analysis

### 3.1 Missing Capabilities

- [ ] Continuous parameter space search (current: 10 discrete strategies)
- [ ] Multi-resolution refinement (coarse → fine → ultra)
- [ ] Convergence detection and quality metrics
- [ ] Non-blocking computation for long searches
- [ ] Course solution data structure

### 3.2 Required Changes

- [ ] New `course-solver.js` module with hybrid search algorithm
- [ ] Extend `computeNavigationPlan()` or add `computeOptimalCourse()`
- [ ] Add UI for "PLOT COURSE" button and result display
- [ ] Integrate with autopilot to apply computed course

## 4. Open Questions

- [x] Search bounds for yaw? → -60° to +60° (beyond this, thrust is negligible)
- [x] Search bounds for pitch? → -45° to +45° (most targets near ecliptic)
- [x] Deployment always 100%? → Yes, for fastest transfer
- [x] What is "close enough"? → < 0.01 AU = intercept, < 0.05 AU = near miss
- [ ] Should we search over trajectory duration? → v1: fixed at 365 days
