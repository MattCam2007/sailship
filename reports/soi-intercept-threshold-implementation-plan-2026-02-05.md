# SOI/2 Intercept Threshold Implementation Plan

**Date:** 2026-02-05
**Status:** Complete

## 0. File Impact Summary

### Files to EDIT:
1. `src/js/ui/uiUpdater.js` - Change intercept status thresholds from fixed values to SOI/2 based
2. `src/js/core/navigation.js` - Update fallback intercept prediction and navigation plan computation

### Files to CREATE:
- None

### Files to DELETE:
- None

## 1. Problem Statement

### 1.1 Description
The intercept detection thresholds are currently fixed values that don't account for the different sphere of influence (SOI) sizes of various celestial bodies. A 0.01 AU "intercept" threshold makes sense for inner planets like Venus (SOI = 0.00411 AU), but is inadequate for Jupiter (SOI = 0.3219 AU).

### 1.2 Root Cause
The original implementation used simplified fixed thresholds:
- INTERCEPT: < 0.01 AU
- NEAR MISS: < 0.05 AU
- WIDE MISS: < 0.2 AU
- NO INTERCEPT: >= 0.2 AU

These values were reasonable for inner planet navigation but don't scale to outer planets or provide meaningful feedback for precise intercepts.

### 1.3 Constraints
- Must work with existing SOI_RADII configuration from config.js
- Should provide sensible defaults for bodies without defined SOI
- Status labels (INTERCEPT, NEAR MISS, etc.) should remain the same for UI consistency

## 2. Solution Architecture

### 2.1 High-Level Design
Replace fixed thresholds with SOI-based thresholds:

| Status | Old Threshold | New Threshold |
|--------|---------------|---------------|
| INTERCEPT | < 0.01 AU | < SOI/2 |
| NEAR MISS | < 0.05 AU | < SOI |
| WIDE MISS | < 0.2 AU | < SOI * 5 |
| NO INTERCEPT | >= 0.2 AU | >= SOI * 5 |

### 2.2 Design Principles
- **SOI/2 as intercept threshold**: Getting within half the sphere of influence means you're within the gravitational capture zone with margin
- **SOI as near miss**: Just outside capture but within the gravitational influence region
- **SOI * 5 as wide miss**: Observable approach that could be course-corrected

### 2.3 Key Algorithm
```javascript
// Get SOI radius for destination, with fallback
const soiRadius = SOI_RADII[destination] || 0.02;  // Default 0.02 AU for unknown bodies

// Calculate dynamic thresholds
const interceptThreshold = soiRadius / 2;  // SOI/2
const nearMissThreshold = soiRadius;       // SOI
const wideMissThreshold = soiRadius * 5;   // SOI * 5

// Determine status
if (closestDistance < interceptThreshold) {
    status = 'INTERCEPT';
} else if (closestDistance < nearMissThreshold) {
    status = 'NEAR MISS';
} else if (closestDistance < wideMissThreshold) {
    status = 'WIDE MISS';
} else {
    status = 'NO INTERCEPT';
}
```

### 2.4 SOI Values Reference
| Body | SOI (AU) | SOI/2 (AU) | SOI/2 (km) |
|------|----------|------------|------------|
| MERCURY | 0.00112 | 0.00056 | ~84,000 km |
| VENUS | 0.00411 | 0.002055 | ~307,000 km |
| EARTH | 0.00620 | 0.0031 | ~464,000 km |
| MARS | 0.00386 | 0.00193 | ~289,000 km |
| JUPITER | 0.3219 | 0.16095 | ~24 million km |

## 3. Units of Work

### Unit 1: Update intercept threshold logic in uiUpdater.js
**Description:** Modify the intercept status determination to use SOI-based thresholds
**Files:** `src/js/ui/uiUpdater.js`
**Acceptance Criteria:**
- [x] Import SOI_RADII from config.js
- [x] Calculate SOI-based thresholds for current destination
- [x] Apply thresholds to determine INTERCEPT/NEAR MISS/WIDE MISS/NO INTERCEPT status
- [x] Provide sensible default for bodies without defined SOI
**Test Method:** Load game, navigate toward Venus, verify INTERCEPT shows at ~0.002 AU instead of 0.01 AU

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Bodies without SOI defined won't work | Medium | Low | Use fallback default of 0.02 AU |
| Outer planet thresholds too large | Low | Low | SOI values are physically meaningful |
| Status flapping near boundaries | Low | Low | Thresholds have natural hysteresis from distance changes |

## 5. Testing Strategy

### 5.1 Manual Verification
- Set destination to Venus, adjust sail to approach
- Verify INTERCEPT status shows when within ~0.002 AU (SOI/2)
- Verify NEAR MISS shows between 0.002 and 0.00411 AU
- Set destination to Jupiter, verify larger thresholds apply

### 5.2 Edge Cases
- Bodies without SOI_RADII entry (should use default)
- Sun/moons (handled by default)
