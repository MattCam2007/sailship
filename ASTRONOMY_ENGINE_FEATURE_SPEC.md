# Time Travel Feature Specification

## 1. Executive Summary

Add interactive time travel controls allowing players to position planets at any date using accurate ephemeris data from astronomy-engine. Players can use a slider to move forward/backward in time, select time scale ranges, and pick specific dates.

## 2. Current State Analysis

### 2.1 Existing Systems

| System | Location | Purpose |
|--------|----------|---------|
| Time Management | `src/js/core/gameState.js` | Manages game time, Julian date, time scale |
| Celestial Positioning | `src/js/data/celestialBodies.js` | Static Keplerian elements, propagated from J2000 |
| Time Display | `src/index.html:295` | Bottom bar showing current time |
| Config | `src/js/config.js:19` | GAME_START_EPOCH (J2000 + 7305) |

### 2.2 Data Flow

```
gameState.julianDate (J2000 + 7305 + time)
    ↓
getPosition(elements, julianDate)  [orbital.js]
    ↓
celestialBodies position update
    ↓
renderer draws planets
```

### 2.3 Relevant Code

- `gameState.js:23` - `julianDate` variable (current simulation time)
- `gameState.js:137-140` - `advanceTime()` function
- `celestialBodies.js:41-67` - Planet orbital elements
- `orbital.js:54-57` - `meanMotion()` calculation
- `orbital.js:73-84` - `propagateMeanAnomaly()` propagation
- `config.js:19` - `GAME_START_EPOCH` constant
- `index.html:295` - Bottom bar time display

## 3. Gap Analysis

### 3.1 Missing Capabilities

- [ ] Accurate planetary ephemeris (current: Keplerian propagation degrades over decades)
- [ ] Date picker UI component
- [ ] Time travel slider UI
- [ ] Time scale dropdown (hours, days, months, years)
- [ ] Reference date ("now") management
- [ ] astronomy-engine library integration
- [ ] Conversion between Julian date and JavaScript Date

### 3.2 Required Changes

- [ ] Add astronomy-engine browser bundle to project
- [ ] Create new state management for reference date and time offset
- [ ] Add time travel controls to bottom bar UI
- [ ] Add CSS styling for new controls
- [ ] Modify `celestialBodies.js` to optionally use astronomy-engine
- [ ] Add feature toggle between Keplerian and ephemeris modes
- [ ] Update time display to show absolute date

## 4. Open Questions

- [x] Should we completely replace Keplerian propagation? **Answer: No, make it toggleable**
- [x] What date range should we support? **Answer: 1900-2100 (astronomy-engine validated range)**
- [x] Should slider be continuous or stepped? **Answer: Continuous with scale-dependent resolution**
- [x] What time scales to offer? **Answer: Hours, Days, Weeks, Months, Years**
- [x] Where to place UI controls? **Answer: Bottom bar, between system info and time display**

## 5. Feature Requirements

### 5.1 Functional Requirements

1. **Slider Control**
   - Range: -100% to +100% (relative to selected scale)
   - Center position (0) = reference date ("now")
   - Continuous drag updates planet positions in real-time
   - Smooth UI response (<50ms perceived latency)

2. **Time Scale Dropdown**
   - Options: 1 hour, 1 day, 1 week, 1 month, 1 year
   - Defines how much ±100% slider movement represents
   - Example: 1 month scale → slider at +50% = +15 days from "now"

3. **Date Picker**
   - Sets reference date ("now" = slider center)
   - Default: Today's date (JavaScript `new Date()`)
   - Range: 1900-01-01 to 2100-12-31
   - Updates all planet positions on change

4. **Integration with Existing Time System**
   - Does NOT affect game simulation time (separate concern)
   - Game can run normally while time travel is active
   - Time travel = ephemeris date, game time = simulation progression

### 5.2 Non-Functional Requirements

- Performance: <10ms for full planetary position update
- Accuracy: astronomy-engine ephemeris data (JPL-validated)
- Compatibility: Works offline (no external API calls)
- Accessibility: Keyboard navigable, ARIA labels

### 5.3 UI Layout

```
┌────────────────────────────────────────────────────────────────┐
│ Bottom Bar                                                     │
├────────────────────────────────────────────────────────────────┤
│ SYSTEM: SOL // BODIES: 12                                     │
│                                                                 │
│ TIME TRAVEL: [Date Picker: 2026-01-21]  [Scale: ▼ 1 Month]    │
│              [◄────────●─────────►]                             │
│              -1 month    NOW    +1 month                        │
│                                                                 │
│ EPHEMERIS DATE: 2026-02-06 14:23:07 UTC                       │
└────────────────────────────────────────────────────────────────┘
```

## 6. Success Criteria

- [ ] Planets accurately positioned for any date 1900-2100
- [ ] Slider smoothly adjusts time ±range based on scale
- [ ] Date picker updates reference date
- [ ] Time scale dropdown changes slider range
- [ ] UI is responsive and intuitive
- [ ] No performance degradation (<10ms/frame)
- [ ] Feature can be toggled on/off (fallback to Keplerian)

## 7. Out of Scope

- Trajectory planning using astronomy-engine (separate feature)
- Launch window calculations
- Historical event markers ("Apollo 11 launch")
- Time travel for player ship (ship stays in current simulation time)
- Relativistic effects (obviously)
