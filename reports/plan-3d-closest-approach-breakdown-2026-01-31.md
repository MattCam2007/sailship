# Implementation Plan: 3D Closest Approach Breakdown (#5)

**Date:** 2026-01-31
**Priority:** High (Low effort, high impact)
**Estimated Effort:** Low

## Overview

Break down the "closest approach" distance into in-plane and out-of-plane components. This tells pilots WHETHER their miss is a timing issue (adjust yaw) or an inclination issue (adjust pitch).

## Problem Statement

Currently, "CLOSEST APPROACH: 0.15 AU" is a single number. Pilots don't know:
- Is this because I'm arriving at the wrong TIME? (planet is elsewhere in orbit)
- Is this because I'm at the wrong INCLINATION? (planet is above/below me)

These require different corrections (yaw vs pitch), so the distinction is critical.

## Proposed Solution

### UI Display

Modify the existing closest approach display:

**Before:**
```
CLOSEST APPROACH    0.150 AU
TIME TO CLOSEST     45d 6h
STATUS              WIDE MISS
```

**After:**
```
CLOSEST APPROACH    0.150 AU
├─ IN-PLANE (Δxy)   0.082 AU    ← timing issue
└─ OUT-OF-PLANE (Δz) 0.126 AU   ← inclination issue
TIME TO CLOSEST     45d 6h
DIAGNOSIS           INCLINATION MISMATCH
```

### Data Structure

Extend the closest approach result:

```javascript
// Currently in detectClosestApproaches result:
{
    bodyName: 'CERES',
    minDistance: 0.150,      // Total 3D distance
    time: 2458934.5,
    shipPos: {x, y, z},
    bodyPos: {x, y, z},
    daysFromNow: 45.25
}

// Add these fields:
{
    ...existing,
    inPlaneDistance: 0.082,   // Distance in XY plane
    outOfPlaneDistance: 0.126, // Absolute Z difference
    diagnosis: 'INCLINATION'   // 'TIMING' | 'INCLINATION' | 'BOTH' | 'ON_TARGET'
}
```

### Algorithm

```javascript
function calculateApproachBreakdown(shipPos, bodyPos) {
    // In-plane distance (XY only)
    const dx = bodyPos.x - shipPos.x;
    const dy = bodyPos.y - shipPos.y;
    const inPlane = Math.sqrt(dx * dx + dy * dy);

    // Out-of-plane distance (Z difference)
    const dz = bodyPos.z - shipPos.z;
    const outOfPlane = Math.abs(dz);

    // Total distance (for verification)
    const total = Math.sqrt(inPlane * inPlane + outOfPlane * outOfPlane);

    // Diagnosis based on which component dominates
    let diagnosis;
    if (total < 0.02) {
        diagnosis = 'ON_TARGET';
    } else if (outOfPlane > inPlane * 2) {
        diagnosis = 'INCLINATION';  // Out-of-plane dominates
    } else if (inPlane > outOfPlane * 2) {
        diagnosis = 'TIMING';       // In-plane dominates
    } else {
        diagnosis = 'BOTH';         // Mixed
    }

    return { inPlane, outOfPlane, diagnosis };
}
```

## File Changes

### 1. `src/js/lib/intersectionDetector.js`

Modify `detectClosestApproaches()` to include breakdown:

```javascript
// In the closestApproach object creation:
closestApproach = {
    bodyName: body.name,
    minDistance: approach.distance,
    time: approach.time,
    shipPos: approach.trajectoryPos,
    bodyPos: approach.bodyPos,
    daysFromNow: approach.time - currentTime,
    // NEW: Add breakdown
    ...calculateApproachBreakdown(approach.trajectoryPos, approach.bodyPos)
};
```

### 2. `src/index.html`

Add breakdown display elements:

```html
<div class="data-row">
    <span class="data-label">CLOSEST APPROACH</span>
    <span class="data-value" id="closestDist">---</span>
</div>
<div class="data-row sub-row">
    <span class="data-label">├─ IN-PLANE</span>
    <span class="data-value" id="inPlaneDist">---</span>
</div>
<div class="data-row sub-row">
    <span class="data-label">└─ OUT-OF-PLANE</span>
    <span class="data-value" id="outOfPlaneDist">---</span>
</div>
<div class="data-row">
    <span class="data-label">DIAGNOSIS</span>
    <span class="data-value highlight" id="approachDiagnosis">---</span>
</div>
```

### 3. `src/js/ui/uiUpdater.js`

Update the closest approach display to show breakdown:

```javascript
// In updateDestinationDisplay() or similar:
if (cachedApproach) {
    // Existing code...
    elements.closestDist.textContent = closestDistance.toFixed(3) + ' AU';

    // NEW: Breakdown display
    if (elements.inPlaneDist && cachedApproach.inPlane !== undefined) {
        elements.inPlaneDist.textContent = cachedApproach.inPlane.toFixed(3) + ' AU';
    }
    if (elements.outOfPlaneDist && cachedApproach.outOfPlane !== undefined) {
        elements.outOfPlaneDist.textContent = cachedApproach.outOfPlane.toFixed(3) + ' AU';
    }
    if (elements.approachDiagnosis && cachedApproach.diagnosis) {
        elements.approachDiagnosis.textContent = getDiagnosisText(cachedApproach.diagnosis);
        // Color code based on diagnosis
        updateDiagnosisColor(elements.approachDiagnosis, cachedApproach.diagnosis);
    }
}

function getDiagnosisText(diagnosis) {
    switch (diagnosis) {
        case 'ON_TARGET': return 'ON TARGET';
        case 'TIMING': return 'ADJUST TIMING (yaw)';
        case 'INCLINATION': return 'ADJUST INCLINATION (pitch)';
        case 'BOTH': return 'ADJUST BOTH';
        default: return '---';
    }
}
```

### 4. `src/css/main.css`

Style for sub-rows and diagnosis colors:

```css
.data-row.sub-row {
    padding-left: 1em;
    font-size: 0.9em;
    opacity: 0.85;
}

.diagnosis-timing {
    color: var(--orange) !important;
}

.diagnosis-inclination {
    color: var(--coral) !important;
}

.diagnosis-both {
    color: var(--coral-dim) !important;
}

.diagnosis-on-target {
    color: var(--green) !important;
}
```

## Testing

```javascript
// Console test
const breakdown = calculateApproachBreakdown(
    {x: 1.0, y: 0.5, z: 0.01},   // ship near ecliptic
    {x: 1.1, y: 0.6, z: 0.15}    // Ceres above ecliptic
);
console.log(breakdown);
// Expected: { inPlane: ~0.14, outOfPlane: 0.14, diagnosis: 'BOTH' }
```

## Edge Cases

1. **Target at ecliptic** (Earth) - outOfPlane will be ~0, diagnosis always 'TIMING'
2. **Perfect intercept** - Both near 0, show 'ON_TARGET'
3. **No closest approach data** - Hide breakdown section or show "---"

## Diagnosis Color Logic

| Diagnosis | Color | Meaning |
|-----------|-------|---------|
| ON_TARGET | Green | You're good, intercept likely |
| TIMING | Orange | Adjust yaw to change arrival timing |
| INCLINATION | Red/Coral | Adjust pitch to match plane |
| BOTH | Dim red | Both adjustments needed |

## Dependencies

- Uses existing `detectClosestApproaches()` function
- Enhances Tool #1 (Inclination Display) by explaining WHY inclination matters
