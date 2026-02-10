# Adaptive Distance Display Implementation Plan

**Date:** 2026-02-10
**Status:** In Progress

## 0. File Impact Summary

### Files to EDIT:
1. `src/js/ui/uiUpdater.js` - Add `formatDistance()`, update display calls

### Files to CREATE:
- None (reports only)

### Files to DELETE:
- None

## 1. Problem Statement

### 1.1 Description
Distance to closest approach and destination distance display as fixed `X.XXX AU`, which
is too coarse at close zoom levels. Players trimming sail settings see no change for
multiple adjustments, then a sudden jump, making it impossible to determine trim direction.

### 1.2 Root Cause
`.toFixed(3)` provides ~150,000 km resolution. The display never adapts units or precision
based on the viewing context (zoom, resolution mode).

### 1.3 Constraints
- No build system, no npm dependencies
- Must follow existing scale display pattern (AU / M km / K km / km)
- Must not break existing data flow
- Performance: called every frame, must be lightweight

## 2. Solution Architecture

### 2.1 High-Level Design
Create a `formatDistance(distanceAU)` function in uiUpdater.js that:
1. Picks the best unit based on distance magnitude (primary factor)
2. Adds extra precision when zoom level is high or resolution mode is fine (secondary)
3. Returns a formatted string like "8.98 M km" or "0.0603 AU"

### 2.2 Design Principles
- **Distance magnitude is primary**: Unit selection based on the value itself, just like
  the scale bar. This ensures the display is always meaningful regardless of zoom.
- **Zoom/resolution adds precision**: At high zoom or fine resolution, show extra decimal
  places within the chosen unit to reflect the user's intent to fine-tune.
- **Consistent with scale bar**: Use the same unit tiers (AU, M km, K km, km).

### 2.3 Key Algorithm

```
KM_PER_AU = 149597870.7
km = distanceAU * KM_PER_AU
effectiveScale = getScale() * camera.zoom  (pixels per AU)

Base formatting (by distance magnitude):
  >= 1 AU       → "X.XX AU"        (2 decimals)
  0.1 - 1 AU    → "X.XXX AU"       (3 decimals)
  1M - 15M km   → "X.XX M km"      (millions of km)
  10K - 1M km   → "XXX K km"       (thousands of km)
  < 10K km      → "X,XXX km"       (km)

Precision boost (additive decimals):
  If effectiveScale > 2000 (deep tactical+): +1 decimal to chosen unit
  If effectiveScale > 10000 (approach+): +2 decimals
  If resolution is FINE/ULTRA/UBER: +1 decimal
```

The thresholds for switching from AU to km-based units:
- 0.1 AU = ~15M km: below this, M km is more intuitive
- 0.007 AU = ~1M km: below this, K km
- 0.00007 AU = ~10K km: below this, plain km

## 3. Units of Work

### Unit 1: Create formatDistance function
**Description:** Add `formatDistance(distanceAU)` to uiUpdater.js
**Files:** src/js/ui/uiUpdater.js
**Acceptance Criteria:**
- [ ] Function accepts distance in AU
- [ ] Returns formatted string with appropriate unit
- [ ] Scales AU → M km → K km → km based on magnitude
- [ ] Adds precision based on effective zoom and resolution mode
- [ ] Performance: < 0.01ms per call (no allocations beyond string)

### Unit 2: Apply to distance displays
**Description:** Replace `.toFixed(3) + ' AU'` with `formatDistance()` calls
**Files:** src/js/ui/uiUpdater.js
**Acceptance Criteria:**
- [ ] DISTANCE display uses formatDistance
- [ ] CLOSEST APPROACH display uses formatDistance
- [ ] Displays update correctly at all zoom levels
- [ ] No visual jank or layout issues

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Layout shift from longer text | Low | Low | Column widths are flexible in CSS |
| Precision loss at unit boundaries | Low | Med | Ensure smooth transitions between units |
| Performance regression | Very Low | Low | Simple math, no allocations |

## 5. Testing Strategy

### 5.1 Manual Verification
- At system zoom: verify AU display with reasonable decimals
- At inner zoom: verify AU transitions to M km when appropriate
- At tactical zoom: verify K km / km display
- Toggle resolution modes: verify extra precision appears
- Trim sail settings: verify displayed value changes with each adjustment
