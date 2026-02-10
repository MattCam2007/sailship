# Adaptive Distance Display Specification

## 1. Executive Summary

The distance displays (DISTANCE and CLOSEST APPROACH in the NAV panel) currently show all
values as `X.XXX AU` with 3 fixed decimal places. At close zoom levels, this provides
insufficient granularity - values like 0.060 AU persist across many sail adjustments before
jumping to 0.061 AU, making it impossible to tell whether adjustments are improving or
worsening the approach. The display should adapt units based on the distance magnitude,
zoom level, scroll zoom, and sail resolution mode.

## 1.1 Estimated File Impact

### Files to EDIT:
- `src/js/ui/uiUpdater.js` - Add `formatDistance()` function, update display calls

### Files to CREATE:
- `reports/distance-display-spec-2026-02-10.md` - This spec
- `reports/distance-display-implementation-plan-2026-02-10.md` - Implementation plan

## 2. Current State Analysis

### 2.1 Existing Systems
| System | Location | Purpose |
|--------|----------|---------|
| Destination distance display | uiUpdater.js:226 | Shows `info.distance.toFixed(3) + ' AU'` |
| Closest approach display | uiUpdater.js:282 | Shows `closestDistance.toFixed(3) + ' AU'` |
| Scale display | uiUpdater.js:133-175 | Already adapts: AU / M km / K km / km |
| Zoom state | gameState.js:44-45 | `currentZoom`, `scale` (px/AU) |
| Camera zoom | camera.js:8 | `camera.zoom` (0.1-1000 multiplier) |
| Resolution mode | controls.js:139-143 | `fineTuneState.resolutionMode` (COARSE-UBER) |

### 2.2 Data Flow
```
navigation.js:getDestinationInfo() → distance in AU
  ↓
gameState.js:getClosestApproachForBody() → closestDistance in AU
  ↓
uiUpdater.js:updateDestinationDisplay() → .toFixed(3) + ' AU' → DOM
```

### 2.3 The Problem in Detail
- `0.06 AU` = 8,975,872 km. At `.toFixed(3)`, values from 0.0595 to 0.0605 AU all show "0.060"
- That's a range of ~150,000 km where the display is identical
- When fine-tuning sail settings, the player cannot tell if adjustments are converging
- The scale bar already solves this for its own display - we need the same approach for distances

## 3. Gap Analysis

### 3.1 Missing Capabilities
- [ ] No `formatDistance()` utility function
- [ ] Distance display ignores zoom level context
- [ ] Distance display ignores resolution mode
- [ ] No unit scaling below AU

### 3.2 Required Changes
- [ ] Create adaptive `formatDistance()` function
- [ ] Apply it to both DISTANCE and CLOSEST APPROACH displays
- [ ] Factor in effective zoom and resolution mode for precision

## 4. Open Questions
- [x] Should coordinates display also be adapted? → No, keep AU for coordinates (positional reference)
- [x] What units? → Follow the scale bar: AU, M km, K km, km
