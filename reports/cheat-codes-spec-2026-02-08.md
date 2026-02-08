# Cheat Codes - Debug Feature Specification

## 1. Executive Summary

Add a "CHEAT CODES" debug panel to the left sidebar that allows the player to manually nudge the ship forward or backward along its current orbit. This is a god-mode repositioning tool for eyeballing good transit times without altering the orbit shape. The feature requires sails to be fully retracted (0% deployment) to prevent accidental use during active sailing.

## 1.1 Estimated File Impact

### Files to EDIT:
- `src/index.html` - Add CHEAT CODES panel section to left sidebar
- `src/css/main.css` - Add styles for cheat codes panel
- `src/js/core/shipPhysics.js` - Add `nudgeShipAlongOrbit()` function
- `src/js/ui/controls.js` - Wire up cheat code button handlers and keyboard shortcuts

### Files to CREATE:
- `reports/cheat-codes-spec-2026-02-08.md` - This spec
- `reports/cheat-codes-implementation-plan-2026-02-08.md` - Implementation plan

## 2. Current State Analysis

### 2.1 Existing Systems

| System | Location | Purpose |
|--------|----------|---------|
| Ship orbital elements | `src/js/data/ships.js` | M0 (mean anomaly) controls position along orbit |
| Ship physics | `src/js/core/shipPhysics.js` | Per-frame orbit updates, SOI transitions |
| Orbital mechanics | `src/js/lib/orbital.js` | `getPosition(elements, julianDate)` derives position from M0 |
| UI Controls | `src/js/ui/controls.js` | All button/keyboard event handlers |
| Game State | `src/js/core/gameState.js` | Display options, state management |
| Left Panel | `src/index.html` | Expandable panel sections (ZOOM, SPEED, ORBIT CONTROL, DISPLAY, BODIES) |

### 2.2 Data Flow

```
User presses nudge button/key
  → controls.js calls nudgeShipAlongOrbit(direction)
  → shipPhysics.js modifies ship.orbitalElements.M0
  → shipPhysics.js resets epoch to current julianDate
  → Next frame: getPosition() derives new position from updated M0
  → Ship appears at new position along same orbit
```

### 2.3 Relevant Code

- `ships.js:createCircularOrbit()` - M0 parameter sets initial position
- `orbital.js:getPosition()` - Propagates M0 forward: M = M0 + n*deltaTime
- `shipPhysics.js:updateShipPhysics()` - Main per-frame physics loop
- `controls.js:initControls()` - Master initialization function
- `ships.js:getPlayerShip()` - Gets player ship reference

### 2.4 How Repositioning Works

The mean anomaly M0 defines where the ship is along its orbit at the epoch time. To reposition:

1. Set `ship.orbitalElements.epoch = currentJulianDate` (reset epoch to now)
2. Compute current mean anomaly: `M = M0 + n * (julianDate - oldEpoch)`
3. Add/subtract nudge amount to M
4. Set `ship.orbitalElements.M0 = normalizedM`

This moves the ship along its orbit without changing orbital shape (a, e, i, Omega, omega stay constant).

## 3. Gap Analysis

### 3.1 Missing Capabilities
- [ ] No cheat codes panel in UI
- [ ] No function to reposition ship along orbit
- [ ] No guard checking sail deployment for cheat activation

### 3.2 Required Changes
- [ ] Add CHEAT CODES expandable panel to left sidebar HTML
- [ ] Add forward/backward nudge buttons with configurable step size
- [ ] Add `nudgeShipAlongOrbit()` function that modifies M0
- [ ] Add sail deployment check (must be 0%)
- [ ] Add keyboard shortcuts for quick nudging
- [ ] Style the panel with a distinct "debug/cheat" visual treatment

## 4. Open Questions
- [x] Step size for nudge? → Use configurable amounts: 1 day, 10 days, 30 days of orbital travel
- [x] Should this work in SOI? → Yes, move along planetocentric orbit too
- [x] Visual indicator when cheats are disabled? → Show "FURL SAILS TO ENABLE" message
