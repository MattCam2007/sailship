# Planning Mode & Time Travel Feature Removal - Discovery Report

**Date:** 2026-01-29
**Phase:** 1 - Discovery
**Status:** Complete

## 1. Executive Summary

This document outlines the scope of removing the Planning Mode and Time Travel features from the Sailship navigation game. These features are intertwined and non-functional, requiring a clean removal to establish a stable baseline for future development.

**Key finding:** The time travel and planning mode features are deeply integrated across 8 source files, 6 test files, 1 library, and 1 vendor dependency. Removal is straightforward but requires careful attention to avoid breaking core orbital mechanics.

## 1.1 Estimated File Impact

### Files to EDIT:
| File | Lines | Changes |
|------|-------|---------|
| `src/js/core/gameState.js` | ~622 | Remove ~200 lines (time travel state, planning mode functions) |
| `src/js/core/shipPhysics.js` | ~1375 | Remove 2 imports, ~5 lines of planning mode logic |
| `src/js/data/celestialBodies.js` | ~900+ | Remove ephemeris integration, simplify updateCelestialPositions() |
| `src/js/ui/controls.js` | ~1169 | Remove ~200 lines (initTimeTravelControls, related functions) |
| `src/js/ui/uiUpdater.js` | ~545 | Remove ~60 lines (syncPlanningModeUI, planning mode UI sync) |
| `src/js/ui/renderer.js` | ~1230 | Remove 4 imports, replace getActiveJulianDate with getJulianDate |
| `src/js/main.js` | ~192 | Remove 4 imports, replace getActiveJulianDate with getJulianDate |
| `src/index.html` | ~400 | Remove ~70 lines (time travel controls HTML section) |
| `src/css/main.css` | ~2306 | Remove ~450 lines (time travel and planning mode styles) |

### Files to DELETE:
| File | Purpose |
|------|---------|
| `src/js/lib/ephemeris.js` | astronomy-engine wrapper (time travel only) |
| `src/js/lib/ephemeris.test.js` | Ephemeris tests |
| `src/js/core/timeTravel.test.js` | Time travel date conversion tests |
| `src/js/core/gameState.planningMode.test.js` | Planning mode state tests |
| `src/js/core/shipPhysics.planningMode.test.js` | Ship physics planning mode tests |
| `src/js/data/celestialBodies.planningMode.test.js` | Celestial bodies planning mode tests |

### Vendor Dependencies to Consider:
| File | Notes |
|------|-------|
| `src/js/vendor/astronomy.browser.js` | Only used for time travel ephemeris |

---

## 2. Current State Analysis

### 2.1 Feature Architecture

**Planning Mode** was designed as a "smart pause" that:
1. Freezes simulation time (timeScale = 0)
2. Auto-enables time travel
3. Synchronizes all visualizations to ephemeris date
4. Allows exploring launch windows by sliding through time

**Time Travel** was designed to:
1. Show accurate planetary positions using JPL ephemeris (astronomy-engine)
2. Allow historical/future date exploration (1900-2100 AD range)
3. Integrate with the starfield for date-accurate star positions

### 2.2 Data Flow

```
Current Flow (with time travel):
┌──────────────────┐     ┌───────────────────┐
│ User enables     │────▶│ timeTravelState   │
│ time travel      │     │ .enabled = true   │
└──────────────────┘     └─────────┬─────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │ updateCelestialPositions()  │
                    │ checks timeTravelState      │
                    └──────────────┬──────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                    ▼
┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐
│ If enabled:         │ │ If disabled:        │ │ If planning mode:   │
│ Use ephemeris.js    │ │ Use Keplerian       │ │ Use ephemeris +     │
│ (astronomy-engine)  │ │ propagation         │ │ getActiveJulianDate │
└─────────────────────┘ └─────────────────────┘ └─────────────────────┘
```

**Target Flow (after removal):**
```
┌──────────────────┐
│ Game Loop        │
│ advanceTime()    │
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────┐
│ updateCelestialPositions()   │
│ Uses Keplerian propagation   │
│ based on getJulianDate()     │
└──────────────────────────────┘
```

### 2.3 Key Integration Points

#### gameState.js (Central Hub)
```javascript
// TO REMOVE:
export const timeTravelState = { enabled, referenceDate, offsetDays, scale }
export const planningModeState = { enabled, frozenSpeed, frozenJulianDate }
export const TIME_SCALES = { hour, day, week, month, year, decade, century }
export function setPlanningMode(enabled)
export function isPlanningMode()
export function getActiveJulianDate()  // Critical - used in 4 files
export function setTimeTravelEnabled(enabled)
export function setReferenceDate(date)
export function setTimeOffset(days)
export function setTimeScale(scale)
export function getEphemerisDate()
export function getEphemerisJulianDate()
export function julianToDate(jd)
export function dateToJulian(date)

// TO MODIFY:
export function setSpeed(speedName) {
    // Remove planning mode check (lines 370-374)
}
```

#### celestialBodies.js (Planet Positioning)
```javascript
// Line 10 - Remove these imports:
import { getJulianDate, timeTravelState, getEphemerisDate, isPlanningMode, bodyFilters } from '../core/gameState.js';

// Should become:
import { getJulianDate, bodyFilters } from '../core/gameState.js';

// Line 12 - Remove:
import { getHeliocentricPosition } from '../lib/ephemeris.js';

// Line 905-930 - Simplify updateCelestialPositions():
// Remove: const useEphemeris = timeTravelState.enabled || isPlanningMode();
// Remove: All ephemeris data fetching code
// Keep: Pure Keplerian propagation using getJulianDate()
```

#### shipPhysics.js (Ship Position)
```javascript
// Line 16 - Remove isPlanningMode, getActiveJulianDate:
import { getJulianDate, isPlanningMode, getActiveJulianDate } from './gameState.js';

// Should become:
import { getJulianDate } from './gameState.js';

// Line ~250 - Replace getActiveJulianDate() with getJulianDate()
```

#### renderer.js (Trajectory Prediction)
```javascript
// Lines 10-21 - Remove these imports:
getEphemerisJulianDate, timeTravelState, isPlanningMode, getActiveJulianDate

// Line 803 - Replace:
const startTime = getActiveJulianDate();
// With:
const startTime = getJulianDate();
```

#### main.js (Intersection Detection)
```javascript
// Lines 13-20 - Remove these imports:
getEphemerisJulianDate, timeTravelState, isPlanningMode, getActiveJulianDate

// Line 118 - Replace:
const currentTime = getActiveJulianDate();
// With:
const currentTime = getJulianDate();
```

#### controls.js (UI Controls)
```javascript
// Line 6 - Massive import list to clean up
// Lines 957-1169 - Remove entire initTimeTravelControls() function
// Lines 447-456 - Remove Ctrl+P keyboard shortcut
// Lines 1085-1168 - Remove helper functions
```

#### uiUpdater.js (UI Updates)
```javascript
// Line 6 - Remove planning mode imports
// Line 9 - Remove updateTimeTravelDisplay import
// Lines 58-125 - Remove syncPlanningModeUI() and formatPlanningDate()
// Line 137-141 - Remove updateTimeTravelDisplay() and syncPlanningModeUI() calls
```

---

## 3. Gap Analysis

### 3.1 Potential Issues

| ID | Severity | Issue | Mitigation |
|----|----------|-------|------------|
| P1 | Critical | `getActiveJulianDate()` used in 4 files | Replace all calls with `getJulianDate()` |
| P2 | High | `updateCelestialPositions()` has complex branching | Simplify to pure Keplerian only |
| P3 | High | setSpeed() has planning mode guard | Remove the guard clause |
| P4 | Medium | astronomy.browser.js in index.html | Remove script tag |
| P5 | Medium | Starfield may use ephemeris for precession | Verify - likely uses own calculation |
| P6 | Low | CLAUDE.md references Planning Mode | Update documentation |
| P7 | Low | CSS has ~450 lines of time travel styles | Clean removal |

### 3.2 Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking orbital mechanics | Low | Critical | Replace getActiveJulianDate with getJulianDate carefully |
| Missing an import/export | Medium | High | Grep for all occurrences before removal |
| UI elements orphaned | Low | Medium | Remove HTML before JS |
| Test files causing issues | Low | Low | Delete all related test files |

### 3.3 Dependencies to Verify

1. **Starfield Precession:** Check if `starfield.js` uses ephemeris.js
   - Finding: Starfield uses its own IAU 1976 precession formula, NOT ephemeris.js
   - No changes needed to starfield.js

2. **Intersection Detection:** Uses `getActiveJulianDate()`
   - Must replace with `getJulianDate()` in main.js line 118

3. **Trajectory Predictor:** Uses `getActiveJulianDate()`
   - Must replace with `getJulianDate()` in renderer.js line 803

---

## 4. Open Questions

- [x] Does starfield.js depend on ephemeris.js? **No - uses own precession calculation**
- [x] Can astronomy.browser.js be safely removed? **Yes - only used for time travel**
- [x] Are there any console tests that will break? **Yes - 4 planning mode test files to delete**
- [ ] Should julianToDate/dateToJulian be kept for future use? **Recommend: Remove for clean slate**

---

## 5. Recommended Removal Sequence

### Unit 1: Delete Test Files First
Delete all 6 test files to prevent console import errors.

### Unit 2: Clean Up HTML
Remove the time travel controls section from index.html.
Remove the astronomy.browser.js script tag.

### Unit 3: Clean Up CSS
Remove time travel and planning mode styles from main.css.

### Unit 4: Clean gameState.js
Remove all time travel and planning mode state/functions.
This will cause import errors in other files.

### Unit 5: Fix Dependent Files
Update imports in: controls.js, uiUpdater.js, renderer.js, main.js, shipPhysics.js, celestialBodies.js

### Unit 6: Delete ephemeris.js
Remove the ephemeris wrapper library.

### Unit 7: Update CLAUDE.md
Remove Planning Mode and Time Travel documentation.

### Unit 8: Verify
Run the application and verify orbital mechanics still work.

---

## 6. Summary

**Total Lines to Remove:** ~1,000+ across 9 files
**Files to Delete:** 7 (6 test files + 1 library)
**Vendor Files to Remove:** 1 (astronomy.browser.js reference)
**Estimated Complexity:** Medium
**Risk Level:** Low-Medium (well-isolated feature)

The removal is straightforward because:
1. Time travel/planning mode are self-contained features
2. Clear separation between ephemeris and Keplerian paths
3. `getActiveJulianDate()` is a simple wrapper that defaults to `getJulianDate()`
4. No other features depend on astronomy-engine

**Next Step:** Proceed to Phase 2 (Planning) or directly to Implementation.
