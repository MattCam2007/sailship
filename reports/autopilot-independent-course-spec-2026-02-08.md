# Autopilot Independent Course Specification

## 1. Executive Summary

Investigation into whether the thruster autopilot can function independently from the automatic course plotter. The user plans to remove the course plotter and wants the autopilot to work with manually-set sail courses. After thorough analysis, the two systems are **architecturally independent** with no functional dependencies. Minor documentation and comment cleanup is needed to make the separation explicit.

## 1.1 Estimated File Impact

### Files to EDIT:
- `src/js/main.js` - Fix misleading comment about autopilot (line 89)
- `src/js/core/navigation.js` - Remove course plotter import dependency from autopilot functions (line 16)

### Files to CREATE:
- `reports/autopilot-independent-course-spec-2026-02-08.md` - This spec
- `reports/autopilot-independent-course-implementation-plan-2026-02-08.md` - Implementation plan

## 2. Current State Analysis

### 2.1 Existing Systems

| System | Location | Purpose |
|--------|----------|---------|
| Autopilot State | `core/gameState.js:79-172` | Phase/mode/enabled state management |
| Autopilot Loop | `ui/controls.js:2127-2186` | Per-frame thruster firing at periapsis |
| Capture Planning | `core/navigation.js:363-475` | Retrograde burn strategy inside SOI |
| Slingshot Planning | `core/navigation.js:496-588` | Prograde burn strategy inside SOI |
| Thruster Firing | `core/shipPhysics.js:1574-1688` | `fireThruster()` orbital element modification |
| Course Solver | `lib/course-solver.js` | Async grid-bracket-convergence sail optimizer |
| Course Application | `core/navigation.js:821-874` | `applyComputedCourse()` modifies ship.sail |
| Course UI | `ui/controls.js:1405-1595` | Plot/Apply/Refine buttons and display |

### 2.2 Data Flow

```
COURSE PLOTTER (sail optimization - ASYNC)          AUTOPILOT (thruster automation - PER FRAME)
┌──────────────────────────────────┐                ┌──────────────────────────────────┐
│ User clicks "PLOT COURSE"        │                │ Game loop calls updateAutoPilot()│
│   → solveCourse() [3-45 sec]     │                │   → determineAutopilotPhase()    │
│   → displayCourseResult()        │                │   → computeCapturePlan()         │
│ User clicks "APPLY COURSE"       │                │     OR computeSlingshotPlan()    │
│   → applyComputedCourse()        │                │   → fireThruster() if NOW        │
│   → modifies ship.sail.*         │                │   → updateAutoPilotStatusText()  │
└──────────┬───────────────────────┘                └──────────┬───────────────────────┘
           │                                                   │
           │ Writes: ship.sail.angle                           │ Writes: ship.orbitalElements
           │         ship.sail.pitchAngle                      │ (via applyThrusterBurn)
           │         ship.sail.deploymentPercent                │
           │         ship.sail.sailCount                       │ Reads: ship.orbitalElements
           ↓                                                   │        ship.soiState
    ┌──────────────┐                                           │        ship.thruster
    │ Ship Sail    │ ← Manual user adjustments also write here │
    │ Settings     │                                           │
    └──────────────┘                                           │
           │                                                   ↓
           │                                            ┌──────────────┐
           └────────────────────────────────────────────│ Ship Orbital │
                 Physics reads sail for thrust calc     │ Elements     │
                                                        └──────────────┘
```

### 2.3 Relevant Code

**Autopilot (thruster) chain:**
- `main.js:90` - `updateAutoPilot(timeScale)` called every frame
- `controls.js:2127` - `updateAutoPilot()` main loop
- `controls.js:2077` - `determineAutopilotPhase()` uses `getDestinationInfo()` + SOI state
- `navigation.js:363` - `computeCapturePlan()` reads orbital elements, returns thruster action
- `navigation.js:496` - `computeSlingshotPlan()` reads orbital elements, returns thruster action
- `shipPhysics.js:1574` - `fireThruster()` applies burn to orbital elements
- `gameState.js:108` - `autoPilotState` object (enabled, phase, mode)

**Course plotter chain (independent):**
- `controls.js:1419` - `initCoursePlotter()` UI setup
- `navigation.js:634` - `computeOptimalCourse()` async solver wrapper
- `lib/course-solver.js` - `solveCourse()` grid-bracket-convergence algorithm
- `navigation.js:821` - `applyComputedCourse()` writes ship.sail settings

**No cross-references between chains.** The autopilot never calls course plotter functions. The course plotter never calls autopilot functions. They share `getPlayerShip()` but write to different properties.

## 3. Gap Analysis

### 3.1 Missing Capabilities
- None. The autopilot already works independently.

### 3.2 Required Changes (minor cleanup)
- [ ] Fix misleading comment in `main.js:89` ("adjusts sail settings" → "fires thrusters")
- [ ] Verify `navigation.js` import of `course-solver.js` doesn't affect autopilot functions (it doesn't - only used by `computeOptimalCourse()`)

### 3.3 Confirmed Independence Points

| Autopilot Function | Depends On | Course Plotter Reference |
|-------------------|------------|--------------------------|
| `updateAutoPilot()` | `isAutoPilotEnabled()`, `getPlayerShip()` | None |
| `determineAutopilotPhase()` | `player.soiState`, `getDestinationInfo()` | None |
| `computeCapturePlan()` | `player.orbitalElements`, `player.soiState` | None |
| `computeSlingshotPlan()` | `player.orbitalElements`, `player.soiState` | None |
| `fireThruster()` | `ship.orbitalElements`, `ship.thruster` | None |
| `initAutoPilotControls()` | DOM `#autoPilotToggle` | None |
| `initEncounterModeControls()` | DOM `#modeOrbitalInsertion`, `#modeGravitySlingshot` | None |

### 3.4 Destination Independence

`determineAutopilotPhase()` calls `getDestinationInfo()` which reads the `destination` variable. This is set by the user through the NAV panel destination selector (`setDestination()`), NOT by the course plotter. The course plotter reads the destination but never sets it.

### 3.5 Recommended Sail Settings (informational only)

`computeCapturePlan()` and `computeSlingshotPlan()` return `recommendedAngle`, `recommendedPitch`, and `recommendedDeployment` in their plan objects. These values are **never applied automatically** by the autopilot. They are computed but effectively unused. The autopilot only reads `plan.thrusterAction` to decide when and how to fire.

## 4. Open Questions
- [x] Does the autopilot depend on course plotter state? **No.**
- [x] Does the autopilot modify sail settings? **No, only fires thrusters.**
- [x] Will removing course-solver.js break autopilot? **No, it's only imported by `computeOptimalCourse()`.**
- [x] Is the destination set by the course plotter? **No, set by user in NAV panel.**
- [x] Are the recommended sail settings from capture/slingshot plans applied? **No, unused.**

## 5. Conclusion

The autopilot thruster system is **already functionally independent** from the course plotter. The only changes needed are:
1. Fix a misleading comment in `main.js` that says autopilot "adjusts sail settings"
2. Optionally clean up unused recommended sail settings from plan objects (low priority)

The user can safely remove the course plotter without any impact on autopilot thruster functionality.
