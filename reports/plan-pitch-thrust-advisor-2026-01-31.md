# Implementation Plan: Pitch Thrust Advisor (#3)

**Date:** 2026-01-31
**Priority:** High
**Estimated Effort:** Medium

## Overview

The Pitch Thrust Advisor tells pilots WHEN to apply pitch thrust and in WHICH DIRECTION for efficient plane change maneuvers. Without this guidance, pilots waste energy applying pitch at inefficient orbital positions.

## Problem Statement

Plane changes are most efficient at orbital nodes (where your orbit crosses the target's plane). Applying pitch thrust elsewhere requires more delta-v for the same inclination change. Currently, pilots have no visibility into:
- When they're approaching a node
- Whether they should apply positive or negative pitch
- How efficient their current position is for plane changes

## Proposed Solution

### UI Display (NAV Panel)

Add a new section after "ORBITAL PLANE":

```
PLANE CHANGE ADVISOR
├─ NEXT NODE:      AN in 12d 4h
├─ REC. PITCH:     +15° (raise plane)
├─ EFFICIENCY:     ████████░░ 82%
└─ STATUS:         APPROACHING NODE
```

### Data Model

```javascript
// In gameState.js or navigation.js
const planeChangeAdvisor = {
    nextNode: {
        type: 'AN',           // 'AN' | 'DN' | null
        timeToNode: 12.17,    // days until node crossing
        position: {x, y, z}   // node position for rendering
    },
    recommendedPitch: 15,     // degrees, positive = raise inclination
    efficiency: 0.82,         // 0-1, based on proximity to node
    status: 'APPROACHING'     // 'AT_NODE' | 'APPROACHING' | 'RECEDING' | 'MATCHED'
};
```

### Algorithm

```javascript
function calculatePlaneChangeAdvice(playerElements, targetElements, nodeCrossings, currentTime) {
    // 1. Find the next upcoming node crossing
    const upcomingNodes = nodeCrossings.filter(n => n.time > currentTime);
    if (upcomingNodes.length === 0) return null;

    const nextNode = upcomingNodes[0];
    const timeToNode = nextNode.time - currentTime;

    // 2. Calculate efficiency based on proximity to node
    // At node: 100% efficient. Far from node: low efficiency
    // Use cosine of true anomaly relative to node
    const efficiency = calculateNodeProximityEfficiency(playerElements, nextNode);

    // 3. Determine recommended pitch direction
    // AN crossing with target incl > ship incl → need positive pitch (raise plane)
    // DN crossing with target incl > ship incl → need negative pitch
    const deltaI = targetElements.i - playerElements.i;
    let recommendedPitch;

    if (Math.abs(deltaI) < 0.001) {
        recommendedPitch = 0; // Planes already matched
    } else if (nextNode.type === 'AN') {
        recommendedPitch = deltaI > 0 ? 15 : -15;
    } else { // DN
        recommendedPitch = deltaI > 0 ? -15 : 15;
    }

    // 4. Determine status
    let status;
    if (Math.abs(deltaI) < 0.001) {
        status = 'MATCHED';
    } else if (efficiency > 0.9) {
        status = 'AT_NODE';
    } else if (timeToNode < 30) {
        status = 'APPROACHING';
    } else {
        status = 'RECEDING';
    }

    return { nextNode, timeToNode, recommendedPitch, efficiency, status };
}
```

## File Changes

### 1. `src/index.html`
- Add PLANE CHANGE ADVISOR section to NAV panel
- Elements: `nextNodeTime`, `recPitch`, `planeEfficiency`, `planeStatus`

### 2. `src/js/core/gameState.js`
- Add `planeChangeCache` for advisor calculations
- Add get/set/clear functions for cache

### 3. `src/js/core/navigation.js` (or new `planeChangeAdvisor.js`)
- Add `calculatePlaneChangeAdvice()` function
- Add `calculateNodeProximityEfficiency()` helper

### 4. `src/js/ui/uiUpdater.js`
- Add `updatePlaneChangeAdvisor()` function
- Add DOM element references to `initUI()`
- Call from `updateUI()`

### 5. `src/js/main.js`
- Integrate plane change calculation into game loop
- Use node crossings cache as input

### 6. `src/css/main.css`
- Style for efficiency bar (progress indicator)
- Color coding for status (green=at node, yellow=approaching, etc.)

## Edge Cases

1. **No upcoming nodes** - Show "NO NODE DATA" or hide section
2. **Planes already matched** - Show "PLANES MATCHED" status, 0° recommended pitch
3. **Target has no inclination** - Hide advisor (not needed for ecliptic targets)
4. **Very far from node** - May want to show "COAST TO NODE" recommendation

## Testing

```javascript
// Console test
import('./js/core/navigation.js').then(m => {
    const advice = m.calculatePlaneChangeAdvice(playerElements, ceresElements, nodeCrossings, jd);
    console.log('Plane change advice:', advice);
});
```

## Dependencies

- Requires Tool #2 (Node Crossing Indicator) - uses `nodeCrossings` cache
- Requires Tool #1 (Inclination Display) - shares inclination calculations
