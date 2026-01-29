# Planning Mode (Nav Screen) Specification

**Date:** 2026-01-29
**Phase:** Discovery Complete

## 1. Executive Summary

Planning Mode is a dedicated mission planning screen that allows players to design transfer orbits and find launch windows without affecting the live game state. The "Flight" screen pauses while the "Nav" screen is open, providing a sandbox environment for trajectory planning. Key features include a Time Machine slider for temporal navigation and Ghost Planet encounter markers that update in real-time as planning parameters change.

## 1.1 Estimated File Impact

### Files to EDIT:
- `src/js/core/gameState.js` - Add snapshot/restore functions, planning mode state
- `src/js/main.js` - Modify game loop for planning mode pause
- `src/js/ui/controls.js` - Add keyboard shortcuts, planning mode toggle
- `src/js/ui/renderer.js` - Add planning mode rendering (separate from Flight)
- `src/js/ui/uiUpdater.js` - Add planning mode UI update logic
- `src/index.html` - Add planning mode UI elements (modal or tab)
- `src/css/style.css` - Add planning mode styling

### Files to CREATE:
- `src/js/core/planningMode.js` - Planning mode state management, time machine logic
- `reports/planning-mode-implementation-plan-2026-01-29.md` - Implementation plan

## 2. Current State Analysis

### 2.1 Existing Systems

| System | Location | Purpose |
|--------|----------|---------|
| Game State | `src/js/core/gameState.js` | Central time, display options, caches |
| Game Loop | `src/js/main.js` | 60fps update cycle: physics → render → UI |
| Ship Physics | `src/js/core/shipPhysics.js` | Orbital element propagation with sail thrust |
| Trajectory Predictor | `src/js/lib/trajectory-predictor.js` | Future path calculation |
| Intersection Detector | `src/js/lib/intersectionDetector.js` | Ghost planet orbit crossing detection |
| Renderer | `src/js/ui/renderer.js` | Canvas drawing, 3D projection |
| Tab System | `src/js/ui/ui-components.js` | Persistent tab groups (SAIL/NAV/AUTO) |
| Controls | `src/js/ui/controls.js` | Keyboard shortcuts, event handling |

### 2.2 Data Flow

```
Current Game Loop (Flight Mode):
┌────────────────────────────────────────────────────────────────────────┐
│  gameLoop()                                                             │
│  ├─ updatePositions()                                                   │
│  │   ├─ advanceTime()              ← julianDate += timeScale           │
│  │   ├─ updateCelestialPositions() ← position = f(elements, julianDate)│
│  │   ├─ updateShipPhysics()        ← orbitalElements modified by thrust│
│  │   └─ detectIntersections()      ← cached with trajectory hash       │
│  ├─ render()                        ← draws all visible elements        │
│  └─ updateUI()                      ← DOM updates                       │
│  └─ requestAnimationFrame(gameLoop)                                     │
└────────────────────────────────────────────────────────────────────────┘

Proposed Planning Mode Flow:
┌────────────────────────────────────────────────────────────────────────┐
│  gameLoop() [Flight PAUSED]                                             │
│  ├─ if (planningMode.active) {                                          │
│  │   ├─ planningLoop()           ← separate update cycle               │
│  │   │   ├─ updatePlanningTime()  ← sandbox julianDate from slider     │
│  │   │   ├─ updateCelestialPositions(planningTime)  ← planets move    │
│  │   │   ├─ predictTrajectory(sandboxShip)  ← "what-if" trajectory    │
│  │   │   └─ detectIntersections() ← ghost planets update              │
│  │   ├─ renderPlanning()         ← draw planning canvas                │
│  │   └─ updatePlanningUI()       ← slider, coordinates, etc.          │
│  │ } else {                                                             │
│  │   normal gameLoop...                                                 │
│  │ }                                                                    │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Relevant Code

**State Management:**
- `gameState.js:advanceTime()` - Increments `time` and `julianDate` by `timeScale`
- `gameState.js:julianDate` - Central time reference for all position calculations
- `gameState.js:timeScale` - Days per frame (0 = paused)

**Position Calculation:**
- `orbital.js:getPosition(elements, julianDate)` - Pure function: same inputs → same position
- `celestialBodies.js:updateCelestialPositions()` - Updates all body positions from elements
- `shipPhysics.js:updateShipPhysics(ship, timeScale)` - Applies thrust, modifies orbital elements

**Trajectory & Intersections:**
- `trajectory-predictor.js:predictTrajectory()` - Propagates ship forward with thrust
- `trajectory-predictor.js:getTrajectoryHash()` - Hash for cache invalidation
- `intersectionDetector.js:detectIntersections()` - Finds orbit crossings
- `renderer.js:drawIntersectionMarkers()` - Renders ghost planets (lines 971-1082)

**UI Systems:**
- `ui-components.js:initTabGroup()` - Handles tab persistence to localStorage
- `controls.js:initKeyboardShortcuts()` - Ctrl+1/2/3 for tabs
- `uiUpdater.js:updateUI()` - Called every frame for DOM updates

### 2.4 Key State Objects to Snapshot

```javascript
// Must clone for Planning Mode sandbox:
snapshot = {
    // Time
    time: number,
    julianDate: number,

    // Player Ship (deep clone)
    playerShip: {
        orbitalElements: { a, e, i, Ω, ω, M0, epoch, μ },
        visualOrbitalElements: { ... },
        soiState: { currentBody, isInSOI },
        sail: { angle, pitchAngle, deploymentPercent, area, reflectivity },
        mass: number
    },

    // Camera (for restoring view)
    camera: { angleX, angleZ, zoom, target, followTarget },

    // Display options
    displayOptions: { ... },
    trajectoryConfig: { durationDays }
}
```

## 3. Gap Analysis

### 3.1 Missing Capabilities

- [ ] **Snapshot/Restore System** - No way to save/restore game state
- [ ] **Sandboxed Time** - No independent time cursor for planning
- [ ] **Planning Mode Toggle** - No mechanism to pause Flight and enter Planning
- [ ] **Time Machine UI** - No slider/date picker for temporal navigation
- [ ] **Position Mode** - No way to manually position ship for "what if" scenarios
- [ ] **Drift Mode** - No toggle to let ship follow orbit during time advance
- [ ] **Coordinate Readout** - No way to read ship coordinates (needed for Position Mode)
- [ ] **Planning Canvas** - May need separate canvas or rendering mode

### 3.2 Required Changes

- [ ] Add `planningMode` state object to `gameState.js`
- [ ] Create `createGameSnapshot()` and `restoreGameSnapshot()` functions
- [ ] Modify game loop to check planning mode flag
- [ ] Add Time Machine slider component (30 days to 2 years range)
- [ ] Add keyboard shortcut to toggle Planning Mode (e.g., `P` key)
- [ ] Ensure ghost planets update when:
  - Time Machine slider moves
  - Sail settings change in planning mode
  - Drift Mode advances ship along orbit
- [ ] Add coordinate readout to Flight screen (prerequisite for Position Mode)

### 3.3 Existing Features to Leverage

- **Ghost Planets (Encounter Markers)** - Already implemented on Flight screen
  - `intersectionDetector.js` handles orbit crossing detection
  - `renderer.js:drawIntersectionMarkers()` renders ghosts
  - Cache system with trajectory hash prevents stale data
  - Moon coordinate transformation already handled

- **Trajectory Prediction** - Already implemented
  - `trajectory-predictor.js:predictTrajectory()` propagates with thrust
  - Returns array of {x, y, z, time} points
  - Configurable duration via `trajectoryConfig`

- **Tab System** - Ready to add new tab
  - `ui-components.js:initTabGroup()` auto-persists to localStorage
  - Pattern established with SAIL/NAV/AUTO tabs

## 4. Open Questions

### 4.1 UX Design Decisions

- [ ] **Modal vs Tab:** Should Planning Mode be a full-screen modal overlay or a new tab in the right panel?
  - Modal: More immersive, clearer separation from Flight
  - Tab: Consistent with existing UI, lower implementation effort

- [ ] **Separate Canvas:** Should Planning Mode use a separate canvas or share the main one?
  - Separate: Clean isolation, could show both Flight and Planning simultaneously
  - Shared: Simpler implementation, consistent rendering

- [ ] **Time Machine Default:** What's the default time range for the slider?
  - Suggestion: 0 to 730 days (matches trajectory config)

### 4.2 Technical Decisions

- [ ] **Position Mode Coordinates:** What coordinate system for manual positioning?
  - Heliocentric Cartesian (x, y, z in AU)
  - Heliocentric spherical (r, θ, φ)
  - Or orbital elements directly?

- [ ] **Drift Mode Physics:** When drifting, should thrust still be calculated?
  - Option A: Pure Keplerian drift (no thrust)
  - Option B: Drift with current sail settings (shows trajectory evolution)

### 4.3 Edge Cases to Clarify

- [ ] What happens if ship is in SOI (e.g., Earth orbit) when Planning Mode opens?
- [ ] Should Planning Mode allow changing sail settings, or only viewing trajectories?
- [ ] How to handle very long planning durations (e.g., 2 years) - performance?

## 5. Dependencies

### 5.1 Feature Prerequisites

| Prerequisite | Status | Notes |
|--------------|--------|-------|
| Trajectory Predictor | Complete | Already has duration config |
| Intersection Detector | Complete | Ghost planets work on Flight |
| Tab System | Complete | Pattern established |
| Orbital Mechanics | Complete | `getPosition()` is pure function |

### 5.2 External Dependencies

None - all features use existing vanilla JS architecture.

## 6. Risk Assessment (Preliminary)

| Risk | Impact | Notes |
|------|--------|-------|
| Ghost planet bugs from previous implementations | High | Sprint notes warn about this specifically |
| Performance with long time ranges | Medium | May need to limit trajectory resolution |
| State leakage between Flight/Planning | High | Must ensure clean snapshot/restore |
| UI complexity | Medium | Time Machine + modes could overwhelm players |

## 7. Recommended Next Steps

1. **Planning Phase:** Create detailed implementation plan with atomic units
2. **Decision:** Resolve modal vs tab question before implementing
3. **Prototype:** Start with Time Machine slider and snapshot system
4. **Ghost Planets:** Carefully test intersection detection with time slider
5. **Modes:** Add Drift Mode and Position Mode incrementally
