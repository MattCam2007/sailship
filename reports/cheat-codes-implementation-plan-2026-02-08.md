# Cheat Codes Implementation Plan

**Date:** 2026-02-08
**Status:** In Progress

## 0. File Impact Summary

### Files to EDIT:
1. `src/index.html` - Add CHEAT CODES panel section to left sidebar
2. `src/css/main.css` - Add cheat codes panel styles
3. `src/js/core/shipPhysics.js` - Add `nudgeShipAlongOrbit()` function
4. `src/js/ui/controls.js` - Wire up button handlers and keyboard shortcuts

### Files to CREATE:
- None (all changes fit in existing files)

### Files to DELETE:
- None

## 1. Problem Statement

### 1.1 Description
Players need a way to manually reposition their ship along its current orbit to eyeball good transit departure times. Currently the only way to reach a different orbital position is to wait (potentially a long time at real speed) or use time warp.

### 1.2 Root Cause
No debug/god-mode tool exists for orbit position manipulation.

### 1.3 Constraints
- Sails must be fully retracted (0% deployment) to use cheat codes
- Only moves ship along orbit - does NOT change orbit shape
- No fuel cost, no physics consequences - pure position teleport
- Must work in both heliocentric and planetocentric (SOI) reference frames

## 2. Solution Architecture

### 2.1 High-Level Design
Add a collapsible "CHEAT CODES" panel to the left sidebar below BODIES. It contains:
- Forward/backward nudge buttons at different step sizes (1d, 10d, 30d)
- Status indicator showing whether cheats are active (sails must be furled)

The nudge operation modifies M0 (mean anomaly at epoch) and resets epoch to current Julian date.

### 2.2 Design Principles
- Minimal code changes - reuse existing panel patterns
- No new modules - add function to shipPhysics.js
- Guard against accidental use during active sailing

### 2.3 Key Algorithm

```
function nudgeShipAlongOrbit(ship, daysToNudge):
    elements = ship.orbitalElements
    julianDate = getJulianDate()

    // Step 1: Calculate current mean anomaly at this instant
    n = meanMotion(elements.a, elements.mu)
    currentM = elements.M0 + n * (julianDate - elements.epoch)

    // Step 2: Add nudge (daysToNudge worth of orbital travel)
    nudgeAngle = n * daysToNudge
    newM = currentM + nudgeAngle

    // Step 3: Reset epoch to now with new M0
    elements.M0 = newM % (2 * PI)  // Normalize for elliptic
    elements.epoch = julianDate

    // Step 4: Update cached position
    position = getPosition(elements, julianDate)
    ship.x = position.x
    ship.y = position.y
    ship.z = position.z
```

## 3. Units of Work

### Unit 1: Add nudgeShipAlongOrbit function to shipPhysics.js
**Description:** Core function that repositions ship along its orbit
**Files:** `src/js/core/shipPhysics.js`
**Acceptance Criteria:**
- [ ] Function accepts ship object and days-to-nudge parameter
- [ ] Correctly modifies M0 and resets epoch
- [ ] Updates cached position (ship.x, ship.y, ship.z)
- [ ] Works for both elliptic and hyperbolic orbits
- [ ] Handles SOI state (planetocentric positions)
- [ ] Resets visual orbital elements for immediate feedback
- [ ] Returns false if sails are not fully retracted
**Test Method:** Call from browser console

### Unit 2: Add CHEAT CODES HTML panel
**Description:** Add the panel markup to index.html
**Files:** `src/index.html`
**Acceptance Criteria:**
- [ ] Panel appears below BODIES section in left sidebar
- [ ] Contains forward/backward buttons at 1d, 10d, 30d steps
- [ ] Shows status text for enabled/disabled state
**Test Method:** Visual inspection in browser

### Unit 3: Add CSS styles
**Description:** Style the cheat codes panel with debug visual treatment
**Files:** `src/css/main.css`
**Acceptance Criteria:**
- [ ] Panel uses distinct color (amber/warning style) to signal debug feature
- [ ] Disabled state visually grayed out
- [ ] Buttons follow existing project button patterns
**Test Method:** Visual inspection

### Unit 4: Wire up controls
**Description:** Connect buttons and add keyboard shortcuts
**Files:** `src/js/ui/controls.js`
**Acceptance Criteria:**
- [ ] Buttons call nudgeShipAlongOrbit with correct parameters
- [ ] Keyboard shortcuts: `,`/`.` for small nudge, `<`/`>` for large nudge
- [ ] UI updates enabled/disabled state based on sail deployment
- [ ] Status text updates on sail deployment changes
**Test Method:** Interactive testing in browser

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| M0 normalization issues | Low | Medium | Use modulo 2PI for elliptic, leave unclamped for hyperbolic |
| SOI position offset bugs | Low | Medium | Use same updateCachedStateInSOI pattern as existing code |
| Accidental nudge during sailing | Medium | Low | Guard: require 0% deployment |

## 5. Testing Strategy

### 5.1 Manual Verification
- Nudge forward 10 days, verify ship moves prograde along orbit
- Nudge backward 10 days, verify ship moves retrograde along orbit
- Verify orbit shape (a, e, i) doesn't change after nudge
- Verify nudge is disabled when sails are deployed
- Verify works in SOI (orbit around planet)
- Verify encounter markers update after nudge
