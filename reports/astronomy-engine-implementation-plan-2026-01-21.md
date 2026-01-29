# Time Travel Feature Implementation Plan

**Date:** 2026-01-21
**Status:** Approved
**Feature Spec:** `ASTRONOMY_ENGINE_FEATURE_SPEC.md`

## 1. Problem Statement

### 1.1 Description

Players cannot easily explore the solar system at different dates. Current Keplerian orbit propagation degrades over long time spans, and there's no UI to jump to specific dates or explore planetary configurations.

### 1.2 Root Cause

- Static orbital elements from J2000 epoch (2000-01-01)
- Two-body Keplerian propagation ignores perturbations
- No date manipulation UI exists
- Time only moves forward via simulation

### 1.3 Constraints

- Must work offline (no external APIs)
- Vanilla JS only (no build tools, no npm)
- Must not break existing simulation time system
- Performance target: <10ms per frame
- Browser bundle size: <200KB acceptable

## 2. Solution Architecture

### 2.1 High-Level Design

```
┌─────────────────────────────────────────────────────────────┐
│                    TIME TRAVEL SYSTEM                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐         ┌───────────────┐                │
│  │ Date Picker  │────────▶│ Reference Date│                │
│  └──────────────┘         │  (referenceDateOffset = timeScale.center(referenceDate)  │
│                            └───────┬───────┘                │
│  ┌──────────────┐                 │                        │
│  │ Scale Select │────────▶┌───────▼────────┐               │
│  │ (±1 month)   │         │ Time Offset    │               │
│  └──────────────┘         │ (slider value) │               │
│                            └───────┬────────┘               │
│  ┌──────────────┐                 │                        │
│  │ Slider (-100 │────────────────▶│                        │
│  │  to +100%)   │                 │                        │
│  └──────────────┘         ┌───────▼────────┐               │
│                            │ Absolute Date  │               │
│                            │ = ref + offset │               │
│                            └───────┬────────┘               │
│                                    │                        │
│                            ┌───────▼────────┐               │
│                            │  Julian Date   │               │
│                            │   Converter    │               │
│                            └───────┬────────┘               │
│                                    │                        │
│  ┌─────────────────────────────────▼────────────────────┐  │
│  │          astronomy-engine (HelioState)               │  │
│  └─────────────────────────┬────────────────────────────┘  │
│                             │                               │
│                    ┌────────▼─────────┐                     │
│                    │ Planet Positions │                     │
│                    │   {x, y, z, vx,  │                     │
│                    │    vy, vz}       │                     │
│                    └──────────────────┘                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Design Principles

1. **Separation of Concerns**
   - Ephemeris date ≠ Simulation time
   - UI state → Date state → Astronomy calculation → Position
   - Each module has single responsibility

2. **Performance First**
   - Cache astronomy-engine results when slider not moving
   - Throttle calculations during drag (60fps max)
   - Only recalculate on actual date change

3. **Graceful Degradation**
   - Feature toggle: astronomy-engine ON/OFF
   - Falls back to Keplerian if library fails to load
   - Error boundaries prevent UI crashes

4. **Minimal Invasion**
   - Add to existing systems, don't replace
   - Use existing state management patterns
   - Follow existing CSS/HTML conventions

### 2.3 Key Algorithms

#### Date Offset Calculation

```javascript
// Convert slider percentage (-100 to +100) to time offset
function calculateTimeOffset(sliderPercent, scale) {
    const scaleInDays = {
        'hour': 1/24,
        'day': 1,
        'week': 7,
        'month': 30,
        'year': 365
    };

    const range = scaleInDays[scale];
    return (sliderPercent / 100) * range;  // days
}

// Get absolute date
const absoluteDate = new Date(referenceDate.getTime() + offsetDays * 86400000);
```

#### Julian Date Conversion

```javascript
// JavaScript Date → Julian Date
function dateToJulian(date) {
    return (date.getTime() / 86400000) + 2440587.5;
}

// Julian Date → JavaScript Date
function julianToDate(jd) {
    return new Date((jd - 2440587.5) * 86400000);
}
```

#### astronomy-engine Integration

```javascript
import * as Astronomy from './vendor/astronomy.browser.js';

function getPlanetPosition(planetName, date) {
    const time = Astronomy.MakeTime(date);
    const state = Astronomy.HelioState(planetName, time);
    return {
        x: state.x,   // AU
        y: state.y,
        z: state.z,
        vx: state.vx, // AU/day
        vy: state.vy,
        vz: state.vz
    };
}
```

## 3. Units of Work

### Unit 1: Add astronomy-engine Library

**Description:** Download and integrate astronomy-engine browser bundle

**Files:**
- `src/js/vendor/astronomy.browser.js` (new)
- `src/js/vendor/astronomy.browser.min.js` (new)

**Acceptance Criteria:**
- [ ] Library file exists in vendor directory
- [ ] Can be imported as ES module or global
- [ ] `Astronomy.MakeTime()` and `Astronomy.HelioState()` accessible
- [ ] Test call returns valid Mars position

**Test Method:**
```javascript
// Browser console
import('/js/vendor/astronomy.browser.js').then(A => {
    const time = A.MakeTime(new Date());
    const mars = A.HelioState('Mars', time);
    console.log('Mars position:', mars);
});
```

---

### Unit 2: Create Time Travel State Management

**Description:** Add state variables and functions for time travel feature

**Files:**
- `src/js/core/gameState.js` (modify)

**Acceptance Criteria:**
- [ ] `timeTravelState` object with `{ enabled, referenceDate, offsetDays, scale }`
- [ ] `setReferenceDate(date)` function
- [ ] `setTimeOffset(days)` function
- [ ] `setTimeScale(scale)` function
- [ ] `getEphemerisDate()` returns absolute date
- [ ] `getEphemerisJulianDate()` returns Julian date

**Test Method:**
```javascript
// Browser console
import { setReferenceDate, setTimeOffset, getEphemerisDate } from '/js/core/gameState.js';
setReferenceDate(new Date('2020-01-01'));
setTimeOffset(30);  // +30 days
console.log(getEphemerisDate());  // Should be 2020-01-31
```

---

### Unit 3: Build Time Travel UI Components

**Description:** Add HTML/CSS for date picker, slider, and scale selector

**Files:**
- `src/index.html` (modify - bottom bar section)
- `src/css/main.css` (modify - add time-travel-controls styles)

**Acceptance Criteria:**
- [ ] Date picker input in bottom bar
- [ ] Scale dropdown with options (hour, day, week, month, year)
- [ ] Slider with -100 to +100 range
- [ ] Visual labels showing "NOW" at center, ±scale at ends
- [ ] Current ephemeris date display
- [ ] Styled consistently with existing UI
- [ ] Mobile responsive (if applicable)

**Test Method:**
- Open `index.html` in browser
- Verify all controls visible in bottom bar
- Check styling matches game aesthetic
- Drag slider, change date, change scale manually

---

### Unit 4: Integrate astronomy-engine with Celestial Bodies

**Description:** Modify celestial bodies to use astronomy-engine for positions

**Files:**
- `src/js/data/celestialBodies.js` (modify)
- `src/js/lib/ephemeris.js` (new - wrapper for astronomy-engine)

**Acceptance Criteria:**
- [ ] `ephemeris.js` provides `getHeliocentricPosition(bodyName, julianDate)`
- [ ] `celestialBodies.js` checks `timeTravelState.enabled`
- [ ] If enabled: use ephemeris, else: use Keplerian propagation
- [ ] Supported bodies: Mercury, Venus, Earth, Mars, Jupiter
- [ ] Returns same format as `getPosition()`: `{x, y, z}`
- [ ] Moon positions (if any) handled correctly

**Test Method:**
```javascript
// Browser console
import { timeTravelState } from '/js/core/gameState.js';
import { updateCelestialPositions } from '/js/data/celestialBodies.js';

timeTravelState.enabled = true;
timeTravelState.referenceDate = new Date('1969-07-16');  // Apollo 11
updateCelestialPositions();
console.log(celestialBodies.find(b => b.name === 'EARTH'));
// Verify Earth position is different from J2000 propagation
```

---

### Unit 5: Connect UI to State Management

**Description:** Wire up event listeners for date picker, slider, and scale dropdown

**Files:**
- `src/js/ui/controls.js` (modify)

**Acceptance Criteria:**
- [ ] Date picker `change` event updates reference date
- [ ] Slider `input` event updates time offset
- [ ] Scale dropdown `change` event updates scale and redraws slider labels
- [ ] Slider updates are throttled to 60fps
- [ ] Ephemeris date display updates in real-time
- [ ] Keyboard shortcuts work (if applicable)

**Test Method:**
- Change date picker → verify planets move
- Drag slider → verify smooth position updates
- Change scale → verify slider range changes
- Check performance (FPS should stay 60)

---

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| astronomy-engine too large/slow | Low | High | Benchmark first; accept 150KB for quality |
| Date calculations off by timezone | Medium | High | Always use UTC; test edge cases |
| Slider performance issues | Medium | Medium | Throttle updates; cache calculations |
| Feature toggle breaks existing code | Low | High | Comprehensive testing; default to OFF initially |
| astronomy-engine planet names mismatch | Medium | Low | Create name mapping layer |
| Moon positions break | Medium | Medium | Special handling for satellite bodies |

## 5. Testing Strategy

### 5.1 Unit Tests

- `ephemeris.js`: Verify Mars position on known date matches JPL data
- `gameState.js`: Verify date offset calculations
- Date/Julian conversions: Test J2000 epoch (known value)

### 5.2 Integration Tests

- Set date to 1969-07-16, verify Earth position different
- Drag slider ±100%, verify planets move correctly
- Change scale, verify offset recalculated
- Toggle feature on/off, verify smooth transition

### 5.3 Manual Verification

- Visual check: Do planets look correctly positioned?
- Performance: FPS stays 60 during slider drag
- UI/UX: Is slider intuitive? Is date picker obvious?
- Edge cases: Year 1900, year 2100, leap years

### 5.4 Known Dates to Verify

| Date | Event | Expected Behavior |
|------|-------|-------------------|
| 2000-01-01 | J2000 epoch | Matches current Keplerian propagation |
| 1969-07-16 | Apollo 11 launch | Earth-Moon different from now |
| 2026-01-21 | Today | Default reference date |
| 2030-01-01 | Future | Planets in different config |

## 6. Implementation Order

1. **Unit 1** (foundational) → Download library
2. **Unit 2** (state layer) → Add state management
3. **Unit 4** (calculation layer) → Integrate astronomy-engine
4. **Unit 3** (UI layer) → Build UI components
5. **Unit 5** (wiring) → Connect everything

Rationale: Bottom-up approach. Verify calculations work before building UI.

## 7. Rollback Plan

If feature fails or causes issues:
1. Set `timeTravelState.enabled = false` by default
2. Remove UI components from `index.html`
3. Revert `celestialBodies.js` changes
4. Keep library in vendor/ for future use

Code remains but feature is invisible/inactive.

## 8. Future Enhancements (Out of Scope)

- Historical event markers ("Voyager 1 flyby")
- Animated time-lapse mode
- Save/load date bookmarks
- "Today" quick reset button
- Time travel for player ship (separate from ephemeris)
- Integration with trajectory predictor for launch windows

---

## Quick Reference: Files Modified

| File | Change Type | Purpose |
|------|-------------|---------|
| `src/js/vendor/astronomy.browser.js` | NEW | astronomy-engine library |
| `src/js/lib/ephemeris.js` | NEW | Wrapper for astronomy-engine |
| `src/js/core/gameState.js` | MODIFY | Add time travel state |
| `src/js/data/celestialBodies.js` | MODIFY | Use ephemeris when enabled |
| `src/js/ui/controls.js` | MODIFY | Add event listeners |
| `src/index.html` | MODIFY | Add time travel UI to bottom bar |
| `src/css/main.css` | MODIFY | Style time travel controls |
