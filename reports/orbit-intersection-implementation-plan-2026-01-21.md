# Orbit Intersection Display - Implementation Plan

**Date:** 2026-01-21
**Status:** Draft
**Specification:** `orbit-intersection-spec-2026-01-21.md`

---

## 1. Problem Statement

### 1.1 Description

Players need to know whether their predicted trajectory will result in an actual encounter with a target planet. Currently, the predicted trajectory (magenta spiral) and planetary orbits (ellipses) are both drawn, but there's no indication of WHERE planets will be WHEN the ship arrives at orbit intersection points. This makes it impossible to visually validate trajectory timing.

**Example scenario:**
- Player sets course toward Mars
- Trajectory crosses Mars orbit at X,Y,Z
- But Mars won't be at that position for another 200 days
- Player wastes delta-v on a trajectory that misses the target

### 1.2 Root Cause

The system renders:
- Celestial bodies at **current game time** (solid, bright)
- Predicted trajectory with **future timestamps** (magenta spiral)

These two time frames are never correlated in the visualization, creating a temporal mismatch that obscures navigation planning.

### 1.3 Constraints

- Must not impact frame rate (< 5ms computation per frame)
- Must use existing `orbital.js` functions (no new orbital math)
- Must integrate with existing display toggle system
- Must follow architecture pattern: `data/ → lib/ → core/ → ui/`
- No external dependencies (vanilla JavaScript only)

---

## 2. Solution Architecture

### 2.1 High-Level Design

```
┌─────────────────────────────────────────────────────────────────┐
│ INPUT: Predicted Trajectory (array of {x,y,z,time})            │
│        Celestial Bodies (array of {name, elements})              │
└────────────────────┬────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ INTERSECTION DETECTOR (new module: lib/intersectionDetector.js) │
│                                                                   │
│  For each trajectory segment:                                    │
│    For each celestial body:                                      │
│      1. Calculate body positions at segment start/end times      │
│      2. Compute closest approach in 3D                           │
│      3. If distance < threshold: Record intersection event       │
│                                                                   │
│  Return: Array of intersection events                            │
└────────────────────┬────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ CACHE LAYER (core/gameState.js)                                 │
│  - Store: intersectionCache = { hash, results, timestamp }      │
│  - Invalidate: When trajectory changes or 500ms elapsed          │
└────────────────────┬────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ RENDERER (ui/renderer.js)                                        │
│  - Draw ghost planets at intersection positions (50% alpha)     │
│  - Draw time-offset labels (e.g., "MARS +87d 6h")               │
│  - Apply same 3D projection as current-time bodies              │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Design Principles

**Principle 1: Separation of Concerns**
- **Detection logic** lives in `lib/` (pure computation, no state)
- **Caching** lives in `core/` (state management)
- **Rendering** lives in `ui/` (visual presentation)

**Principle 2: Performance First**
- Cache results with same TTL as trajectory predictor (500ms)
- Use squared distances to avoid expensive `sqrt()` calls until final filter
- Early exit for segments beyond max trajectory time

**Principle 3: Reuse Existing Infrastructure**
- Use `orbital.js:getPosition()` for body positions
- Use same hash function as trajectory predictor for cache keys
- Follow display toggle pattern from existing options

**Principle 4: Graceful Degradation**
- If intersection calculation fails, don't crash renderer
- If no intersections found, simply render nothing
- Performance timeout: If calculation exceeds 10ms, cache partial results

### 2.3 Key Algorithms

#### Algorithm 1: Closest Approach Calculation

Given a trajectory segment (P1 → P2) and body motion (B1 → B2), find closest approach.

**Method:** Parameterize both paths by time, minimize distance function.

```
Trajectory segment: T(s) = P1 + s(P2 - P1),  s ∈ [0, 1]
Body motion:        B(s) = B1 + s(B2 - B1),  s ∈ [0, 1]

Distance squared: D²(s) = ||T(s) - B(s)||²

Expand:
D²(s) = ||(P1 - B1) + s(ΔP - ΔB)||²
      where ΔP = P2 - P1, ΔB = B2 - B1

D²(s) = ||W + s·V||²
      where W = P1 - B1, V = ΔP - ΔB

D²(s) = (W + sV)·(W + sV)
      = W·W + 2s(W·V) + s²(V·V)

Minimize: dD²/ds = 2(W·V) + 2s(V·V) = 0

Solution: s* = -(W·V) / (V·V)

Clamp s* to [0, 1] (intersection only within segment)
```

**If `V·V ≈ 0`:** Relative motion is negligible → use distance at s=0.

**Return:**
```javascript
{
    time: t1 + s * (t2 - t1),      // Julian date of closest approach
    distance: sqrt(D²(s*)),         // AU
    trajectoryPos: T(s*),           // Ship position
    bodyPos: B(s*)                  // Body position
}
```

#### Algorithm 2: Threshold Filtering

**Threshold categories:**
1. **SOI Encounter:** `distance < SOI_RADIUS * 2`
2. **Close Approach:** `distance < 0.1 AU` (15 million km)
3. **Visual Crossing:** `distance < 0.5 AU` (only show if < 3 encounters found)

**Priority system:**
- Always show SOI encounters
- Show up to 3 closest approaches per body
- Limit total markers to 20 (prevent visual clutter)

#### Algorithm 3: Cache Invalidation

**Hash function** (same as trajectory predictor):
```javascript
function calculateIntersectionHash(player, celestialBodies) {
    return JSON.stringify({
        elements: player.orbitalElements,
        sail: player.sail,
        soiState: player.soiState,
        duration: getTrajectoryDuration(),
        bodyElements: celestialBodies.map(b => b.elements)
    });
}
```

**Cache structure:**
```javascript
intersectionCache = {
    hash: string,
    results: [
        {
            bodyName: 'MARS',
            time: 2451645.3,
            bodyPosition: {x, y, z},
            trajectoryPosition: {x, y, z},
            distance: 0.00234  // AU
        },
        ...
    ],
    timestamp: performance.now()
}
```

**Invalidation triggers:**
- Trajectory hash changes
- 500ms elapsed since last calculation
- Display toggle changed
- Manual `clearIntersectionCache()` call

---

## 3. Units of Work

### Unit 1: Create Intersection Detector Module (Foundation)

**Description:** Create new module with closest-approach algorithm and basic data structures.

**Files:**
- Create: `src/js/lib/intersectionDetector.js`

**Implementation:**
```javascript
// Vector math utilities
function dot3D(a, b) { return a.x*b.x + a.y*b.y + a.z*b.z; }
function subtract3D(a, b) { return {x: a.x-b.x, y: a.y-b.y, z: a.z-b.z}; }
function add3D(a, b) { return {x: a.x+b.x, y: a.y+b.y, z: a.z+b.z}; }
function scale3D(v, s) { return {x: v.x*s, y: v.y*s, z: v.z*s}; }
function magnitude3D(v) { return Math.sqrt(dot3D(v, v)); }

// Core algorithm
export function calculateClosestApproach(
    trajPoint1, trajPoint2,
    bodyPos1, bodyPos2
) {
    // Implementation of Algorithm 1
}

// Test function (console verification)
export function testClosestApproach() {
    // Simple test cases
}
```

**Acceptance Criteria:**
- [ ] `dot3D()` returns correct scalar
- [ ] `calculateClosestApproach()` returns object with `{time, distance, trajectoryPos, bodyPos}`
- [ ] Test with known cases: parallel motion, perpendicular motion, intersecting paths
- [ ] Performance: < 0.01ms per call

**Test Method:**
```javascript
import('/js/lib/intersectionDetector.js').then(m => m.testClosestApproach())
```

---

### Unit 2: Add Intersection Detection Function

**Description:** Implement main detection loop that processes full trajectory.

**Files:**
- Modify: `src/js/lib/intersectionDetector.js`

**Implementation:**
```javascript
import { getPosition } from './orbital.js';
import { getCelestialBodies } from '../data/celestialBodies.js';
import { SOI_RADII } from '../config.js';

export function detectIntersections(trajectory, celestialBodies) {
    const intersections = [];

    // For each trajectory segment
    for (let i = 0; i < trajectory.length - 1; i++) {
        const p1 = trajectory[i];
        const p2 = trajectory[i + 1];

        // For each body
        for (const body of celestialBodies) {
            if (!body.elements) continue;  // Skip Sun

            // Calculate body positions at segment times
            const bodyPos1 = getPosition(body.elements, p1.time);
            const bodyPos2 = getPosition(body.elements, p2.time);

            // Find closest approach
            const approach = calculateClosestApproach(p1, p2, bodyPos1, bodyPos2);

            // Check threshold (2× SOI or 0.1 AU)
            const threshold = SOI_RADII[body.name]
                ? SOI_RADII[body.name] * 2
                : 0.1;

            if (approach.distance < threshold) {
                intersections.push({
                    bodyName: body.name,
                    time: approach.time,
                    bodyPosition: approach.bodyPos,
                    trajectoryPosition: approach.trajectoryPos,
                    distance: approach.distance
                });
            }
        }
    }

    // Sort by time, limit to 20 closest
    return intersections
        .sort((a, b) => a.time - b.time)
        .slice(0, 20);
}
```

**Acceptance Criteria:**
- [ ] Returns empty array for trajectory with no close approaches
- [ ] Detects Earth encounter for trajectory aimed at Earth
- [ ] Respects SOI thresholds (closer check for bodies with SOI)
- [ ] Performance: < 5ms for 200-point trajectory × 9 bodies
- [ ] Handles edge case: body with no orbital elements (Sun)

**Test Method:**
```javascript
// In browser console
import('/js/lib/intersectionDetector.js').then(async (m) => {
    const { detectIntersections } = m;
    const { predictTrajectory } = await import('/js/lib/trajectory-predictor.js');
    const { getPlayerShip } = await import('/js/data/ships.js');
    const { getCelestialBodies } = await import('/js/data/celestialBodies.js');
    const player = getPlayerShip();
    const trajectory = predictTrajectory({...player.orbitalElements, sail: player.sail, ...});
    const intersections = detectIntersections(trajectory, getCelestialBodies());
    console.log('Found intersections:', intersections);
});
```

---

### Unit 3: Add Display Option to Config and State

**Description:** Extend display options with new toggle for intersection markers.

**Files:**
- Modify: `src/js/config.js` (add default)
- Modify: `src/js/core/gameState.js` (add cache management)

**Changes to config.js** (line ~180):
```javascript
export const DEFAULT_DISPLAY_OPTIONS = {
    showOrbits: true,
    showLabels: true,
    showTrajectory: true,
    showGrid: true,
    showPredictedTrajectory: true,
    showIntersectionMarkers: true,  // NEW
};
```

**Changes to gameState.js** (add after trajectory cache):
```javascript
// Intersection cache
let intersectionCache = {
    hash: null,
    results: [],
    timestamp: 0
};

export function getIntersectionCache() {
    return intersectionCache;
}

export function setIntersectionCache(hash, results) {
    intersectionCache = {
        hash,
        results,
        timestamp: performance.now()
    };
}

export function clearIntersectionCache() {
    intersectionCache = { hash: null, results: [], timestamp: 0 };
}

export function isIntersectionCacheValid(currentHash) {
    if (!intersectionCache.hash) return false;
    if (intersectionCache.hash !== currentHash) return false;
    const age = performance.now() - intersectionCache.timestamp;
    return age < 500;  // 500ms TTL (same as trajectory)
}
```

**Acceptance Criteria:**
- [ ] `displayOptions.showIntersectionMarkers` exists and defaults to `true`
- [ ] Cache functions don't throw errors
- [ ] Cache invalidates after 500ms
- [ ] Cache invalidates when hash changes

**Test Method:**
```javascript
// In browser console
import('/js/core/gameState.js').then(m => {
    console.log('Display options:', m.displayOptions);
    console.assert(m.displayOptions.showIntersectionMarkers === true);

    m.setIntersectionCache('test-hash', [{bodyName: 'EARTH', time: 2451545}]);
    console.assert(m.isIntersectionCacheValid('test-hash') === true);
    console.assert(m.isIntersectionCacheValid('different-hash') === false);
});
```

---

### Unit 4: Add HTML Toggle UI

**Description:** Add checkbox to display options panel.

**Files:**
- Modify: `src/index.html` (add checkbox)

**Changes** (after showPredictedTrajectory checkbox, ~line 86):
```html
<label>
    <input type="checkbox" id="showIntersectionMarkers" checked> ENCOUNTER MARKERS
</label>
```

**Acceptance Criteria:**
- [ ] Checkbox appears in DISPLAY OPTIONS panel
- [ ] Label text is "ENCOUNTER MARKERS"
- [ ] Checkbox is checked by default
- [ ] ID matches config property name

**Test Method:**
- Open browser
- Verify checkbox appears in left panel under "PREDICTED PATH"
- Verify it's checked by default

---

### Unit 5: Wire Toggle to Controls

**Description:** Register event handler for new checkbox.

**Files:**
- Modify: `src/js/ui/controls.js` (add to initDisplayOptions)

**Changes** (in `initDisplayOptions()` options map, ~line 113):
```javascript
const options = {
    'showOrbits': 'showOrbits',
    'showLabels': 'showLabels',
    'showTrajectory': 'showTrajectory',
    'showPredictedTrajectory': 'showPredictedTrajectory',
    'showGrid': 'showGrid',
    'showIntersectionMarkers': 'showIntersectionMarkers',  // NEW
};
```

**Acceptance Criteria:**
- [ ] Clicking checkbox updates `displayOptions.showIntersectionMarkers`
- [ ] State persists across checkbox toggles
- [ ] No console errors

**Test Method:**
```javascript
// In browser console
import('/js/core/gameState.js').then(m => {
    console.log('Initial state:', m.displayOptions.showIntersectionMarkers);
    // Click checkbox in UI
    // Verify state changes
});
```

---

### Unit 6: Integrate Detection into Game Loop

**Description:** Call intersection detector when trajectory updates, store results in cache.

**Files:**
- Modify: `src/js/main.js` (add to updatePositions)

**Changes** (after trajectory prediction update):
```javascript
import {
    getIntersectionCache,
    setIntersectionCache,
    clearIntersectionCache,
    isIntersectionCacheValid
} from './core/gameState.js';
import { detectIntersections } from './lib/intersectionDetector.js';
import { getCelestialBodies } from './data/celestialBodies.js';

function updatePositions() {
    // ... existing position updates

    // Update predicted trajectory (existing code)
    // ...

    // NEW: Update intersection cache
    const trajectory = getCachedTrajectory();
    if (trajectory && trajectory.length > 0) {
        const currentHash = JSON.stringify({
            trajectory: trajectory.length,
            bodies: getCelestialBodies().map(b => b.name).join(','),
            time: Math.floor(julianDate)
        });

        if (!isIntersectionCacheValid(currentHash)) {
            const intersections = detectIntersections(trajectory, getCelestialBodies());
            setIntersectionCache(currentHash, intersections);
        }
    }
}
```

**Acceptance Criteria:**
- [ ] Intersections calculated when trajectory changes
- [ ] Cache prevents redundant calculations (verify with console.time)
- [ ] No performance regression (frame time < 16ms at 60fps)
- [ ] Cache clears when trajectory predictor cache clears

**Test Method:**
```javascript
// In browser console
import('/js/core/gameState.js').then(m => {
    setInterval(() => {
        const cache = m.getIntersectionCache();
        console.log('Intersection count:', cache.results.length);
    }, 1000);
});
// Adjust sail settings and verify count updates
```

---

### Unit 7: Render Ghost Planets

**Description:** Draw semi-transparent planets at intersection positions.

**Files:**
- Modify: `src/js/ui/renderer.js` (add new function)

**Implementation** (add after `drawPredictedTrajectory`, ~line 697):
```javascript
import { getIntersectionCache } from '../core/gameState.js';
import { BODY_DISPLAY } from '../config.js';

function drawIntersectionMarkers(centerX, centerY, scale) {
    if (!displayOptions.showIntersectionMarkers) return;
    if (!displayOptions.showOrbits) return;  // Parent toggle

    const cache = getIntersectionCache();
    if (!cache.results || cache.results.length === 0) return;

    for (const intersection of cache.results) {
        const bodyPos = intersection.bodyPosition;

        // Handle SOI offset (same logic as current body rendering)
        const player = getPlayerShip();
        let renderX = bodyPos.x;
        let renderY = bodyPos.y;
        let renderZ = bodyPos.z;

        if (player.soiState.isInSOI) {
            const parent = getCelestialBodies().find(
                b => b.name === player.soiState.currentBody
            );
            if (parent) {
                renderX += parent.x;
                renderY += parent.y;
                renderZ += parent.z;
            }
        }

        // Project to screen
        const projected = project3D(renderX, renderY, renderZ, centerX, centerY, scale);
        if (!projected) continue;

        // Get body display properties
        const display = BODY_DISPLAY[intersection.bodyName];
        if (!display) continue;

        // Draw ghost planet (50% transparent)
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = display.color;
        ctx.beginPath();
        ctx.arc(projected.x, projected.y, display.radius, 0, Math.PI * 2);
        ctx.fill();

        // Draw subtle outline
        ctx.strokeStyle = display.color;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.7;
        ctx.stroke();

        ctx.restore();
    }
}
```

**Call in render() function** (after `drawPredictedTrajectory`, ~line 805):
```javascript
drawIntersectionMarkers(centerX, centerY, scale);
```

**Acceptance Criteria:**
- [ ] Ghost planets render at correct 3D positions
- [ ] Alpha = 0.5 (semi-transparent)
- [ ] Use correct body colors from BODY_DISPLAY
- [ ] Respect parent toggle (showOrbits)
- [ ] Handle SOI offset correctly
- [ ] No render when toggle is OFF

**Test Method:**
- Open game in browser
- Set trajectory toward Earth
- Verify semi-transparent Earth appears ahead on trajectory
- Toggle "ENCOUNTER MARKERS" - ghost should appear/disappear
- Change trajectory - ghost position updates

---

### Unit 8: Add Time-Offset Labels

**Description:** Draw labels showing time until encounter (e.g., "MARS +87d 6h").

**Files:**
- Modify: `src/js/ui/renderer.js` (extend `drawIntersectionMarkers`)

**Add helper function** (near other time formatting):
```javascript
function formatTimeOffset(currentTime, futureTime) {
    const deltaDays = futureTime - currentTime;
    const days = Math.floor(deltaDays);
    const hours = Math.floor((deltaDays - days) * 24);

    if (days > 0) {
        return `+${days}d ${hours}h`;
    } else {
        return `+${hours}h`;
    }
}
```

**Extend ghost planet loop** (after drawing circle):
```javascript
// Draw time label
const timeOffset = formatTimeOffset(julianDate, intersection.time);
const labelText = `${intersection.bodyName} ${timeOffset}`;

ctx.save();
ctx.globalAlpha = 0.8;
ctx.font = '11px monospace';
ctx.fillStyle = display.color;
ctx.strokeStyle = 'rgba(0,0,0,0.7)';
ctx.lineWidth = 3;

// Position label above ghost planet
const labelX = projected.x + display.radius + 5;
const labelY = projected.y - display.radius - 5;

ctx.strokeText(labelText, labelX, labelY);
ctx.fillText(labelText, labelX, labelY);
ctx.restore();
```

**Acceptance Criteria:**
- [ ] Labels show correct time offset (compare to trajectory timestamp)
- [ ] Format: "BODYNAME +Xd Yh"
- [ ] Labels positioned above/beside ghost planets
- [ ] Text has dark outline for readability
- [ ] Labels disappear when toggle OFF

**Test Method:**
- Open game
- Set trajectory toward Mars
- Verify label shows "MARS +XXd XXh"
- Advance game time by 1 day
- Verify offset decreases by 1 day

---

### Unit 9: Handle Edge Cases

**Description:** Add safety checks and handle boundary conditions.

**Files:**
- Modify: `src/js/lib/intersectionDetector.js`
- Modify: `src/js/ui/renderer.js`

**Edge cases to handle:**

1. **No trajectory available:**
```javascript
export function detectIntersections(trajectory, celestialBodies) {
    if (!trajectory || trajectory.length < 2) return [];
    // ... rest of function
}
```

2. **Body with no elements (Sun):**
```javascript
for (const body of celestialBodies) {
    if (!body.elements) continue;  // Skip Sun (already added in Unit 2)
    // ...
}
```

3. **Invalid position calculation:**
```javascript
const bodyPos1 = getPosition(body.elements, p1.time);
if (!isFinite(bodyPos1.x) || !isFinite(bodyPos1.y) || !isFinite(bodyPos1.z)) {
    continue;  // Skip invalid positions
}
```

4. **Zero relative velocity:**
```javascript
const VdotV = dot3D(V, V);
if (VdotV < 1e-20) {
    // Bodies moving in parallel - use distance at segment start
    s = 0;
} else {
    s = Math.max(0, Math.min(1, -(dot3D(W, V) / VdotV)));
}
```

5. **Off-screen markers in renderer:**
```javascript
const projected = project3D(renderX, renderY, renderZ, centerX, centerY, scale);
if (!projected) continue;  // Skip off-screen
if (projected.x < -50 || projected.x > canvas.width + 50) continue;
if (projected.y < -50 || projected.y > canvas.height + 50) continue;
```

6. **Player in SOI during intersection time:**
```javascript
// When rendering, check if intersection is in different SOI than player
// This requires careful offset calculation (existing pattern from current rendering)
```

**Acceptance Criteria:**
- [ ] No console errors when trajectory is empty
- [ ] No crashes when Sun is in celestial bodies list
- [ ] Handles hyperbolic escape trajectories
- [ ] Graceful handling of NaN/Infinity in positions
- [ ] Off-screen markers don't render (performance)

**Test Method:**
- Set trajectory toward Jupiter (hyperbolic escape)
- Zoom in/out rapidly
- Pause trajectory predictor
- Verify no console errors in any state

---

### Unit 10: Performance Optimization and Polish

**Description:** Add performance metrics, optimize bottlenecks, add visual polish.

**Files:**
- Modify: `src/js/lib/intersectionDetector.js` (add timing)
- Modify: `src/js/ui/renderer.js` (add visual enhancements)

**Performance metrics:**
```javascript
export function detectIntersections(trajectory, celestialBodies) {
    const startTime = performance.now();

    // ... detection logic

    const elapsed = performance.now() - startTime;
    if (elapsed > 5) {
        console.warn(`Intersection detection took ${elapsed.toFixed(2)}ms`);
    }

    return intersections;
}
```

**Visual polish:**
1. Add pulsing glow to nearby encounters (< 24 hours):
```javascript
const deltaDays = intersection.time - julianDate;
if (deltaDays < 1) {
    // Pulse effect
    const phase = (Date.now() % 2000) / 2000 * Math.PI * 2;
    const intensity = 0.5 + 0.5 * Math.sin(phase);

    ctx.save();
    ctx.globalAlpha = intensity * 0.3;
    ctx.fillStyle = display.color;
    ctx.beginPath();
    ctx.arc(projected.x, projected.y, display.radius * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}
```

2. Sort intersections by proximity to current time:
```javascript
return intersections
    .sort((a, b) => a.time - b.time)  // Chronological order
    .slice(0, 20);
```

3. Add distance indicator for very close approaches:
```javascript
if (intersection.distance < 0.01) {  // < 1.5 million km
    ctx.fillStyle = '#ff3333';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('CLOSE', labelX, labelY + 12);
}
```

**Acceptance Criteria:**
- [ ] Console warning if detection exceeds 5ms
- [ ] Encounters within 24 hours have pulsing glow
- [ ] Intersections rendered in chronological order
- [ ] Close approaches (<0.01 AU) marked with "CLOSE" indicator
- [ ] No frame rate drops when 20 markers visible

**Test Method:**
- Open browser console
- Monitor performance warnings
- Set trajectory for near-term Earth encounter
- Verify pulsing glow appears when <24h away
- Zoom to tactical view with multiple markers visible
- Use browser FPS counter to verify 60fps maintained

---

### Unit 11: Add Console Test Suite

**Description:** Create comprehensive test file for intersection detector.

**Files:**
- Create: `src/js/lib/intersectionDetector.test.js`

**Implementation:**
```javascript
import { calculateClosestApproach, detectIntersections } from './intersectionDetector.js';
import { getPosition } from './orbital.js';

export function runAllTests() {
    console.log('=== Intersection Detector Tests ===\n');

    testVectorMath();
    testClosestApproachParallel();
    testClosestApproachIntersecting();
    testFullDetection();
    testPerformance();

    console.log('\n=== All Tests Complete ===');
}

function testVectorMath() {
    console.log('Test: Vector Math Utilities');
    // Test dot product, subtraction, etc.
}

function testClosestApproachParallel() {
    console.log('Test: Closest Approach - Parallel Motion');
    // Two objects moving in parallel - distance should remain constant
}

function testClosestApproachIntersecting() {
    console.log('Test: Closest Approach - Intersecting Paths');
    // Two objects crossing - distance should be minimum at crossing
}

function testFullDetection() {
    console.log('Test: Full Intersection Detection');
    // Mock trajectory and bodies, verify intersections found
}

function testPerformance() {
    console.log('Test: Performance');
    // Time 200-point trajectory × 9 bodies
    // Target: < 5ms
}
```

**Acceptance Criteria:**
- [ ] All tests pass with console output
- [ ] Performance test shows < 5ms
- [ ] Can be run in browser: `import('/js/lib/intersectionDetector.test.js').then(m => m.runAllTests())`

**Test Method:**
```javascript
import('/js/lib/intersectionDetector.test.js').then(m => m.runAllTests())
```

---

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Performance degradation** | Medium | High | Cache results with 500ms TTL; add performance monitoring; limit to 20 markers |
| **Visual clutter at system view** | Low | Medium | Use parent toggle (showOrbits); 50% alpha prevents obscuring trajectories |
| **Incorrect SOI offset calculation** | Medium | High | Reuse existing offset logic from current body rendering; extensive testing |
| **NaN/Infinity in calculations** | Low | High | Validate all positions with `isFinite()`; early exit on invalid data |
| **Time format confusion** | Low | Low | Use consistent "+Xd Yh" format; show negative time if encounter passed |
| **Body with no elements crashes** | Low | Medium | Skip Sun explicitly with `if (!body.elements) continue` |
| **Cache hash collisions** | Very Low | Medium | Use detailed hash including trajectory length, body names, time |

**Critical Path Items:**
- Unit 1-2: Intersection detection algorithm (foundation)
- Unit 6: Integration with game loop (required for data flow)
- Unit 7: Rendering ghost planets (user-facing feature)

**Low-Risk Items:**
- Unit 4-5: UI toggle (follows existing pattern)
- Unit 10: Visual polish (nice-to-have enhancements)
- Unit 11: Test suite (validation only)

---

## 5. Testing Strategy

### 5.1 Unit Tests

**Per-function validation:**
- `calculateClosestApproach()`: Known input → expected output
- `detectIntersections()`: Mock trajectory → expected intersection count
- Cache functions: Set → get → invalidate cycle
- Time formatting: Julian date → human-readable string

### 5.2 Integration Tests

**Full system validation:**
1. Set trajectory toward Earth
2. Verify ghost Earth appears on trajectory
3. Verify label shows correct time offset
4. Advance game time by 10 days
5. Verify label decreases by 10 days
6. Toggle display option OFF
7. Verify ghosts disappear
8. Toggle back ON
9. Verify ghosts reappear without recalculation (cache hit)

### 5.3 Manual Verification

**Visual inspection checklist:**
- [ ] Ghost planets use correct colors
- [ ] Transparency is 50% (not too faint, not too bold)
- [ ] Labels don't overlap with solid planets
- [ ] Works at all zoom levels (System → Tactical)
- [ ] Works with camera rotation/tilt
- [ ] Works in SOI vs heliocentric mode
- [ ] Encounters within 24h have pulsing glow
- [ ] No visual artifacts or flickering
- [ ] Performance: 60fps maintained

**Edge case scenarios:**
- [ ] Trajectory with no intersections (empty display)
- [ ] Trajectory intersecting all 9 bodies (clamped to 20 markers)
- [ ] Very short trajectory (30 days)
- [ ] Very long trajectory (730 days)
- [ ] Hyperbolic escape trajectory
- [ ] Paused game (no updates)

---

## 6. Implementation Schedule

**Estimated implementation order:**

**Session 1: Foundation (Units 1-3)**
- Create intersection detector module
- Add detection algorithm
- Extend config/state with new toggle
- **Checkpoint:** Console tests pass, cache functions work

**Session 2: UI Integration (Units 4-6)**
- Add HTML checkbox
- Wire to controls
- Integrate with game loop
- **Checkpoint:** Toggle affects state, intersections calculated

**Session 3: Rendering (Units 7-8)**
- Draw ghost planets
- Add time labels
- **Checkpoint:** Feature visible and functional

**Session 4: Polish (Units 9-11)**
- Handle edge cases
- Optimize performance
- Add test suite
- **Checkpoint:** Production-ready

**Total estimated time:** 4 implementation sessions (with review and testing between each)

---

## 7. Success Metrics

**Functional:**
- ✅ Toggle ON → ghost planets visible
- ✅ Ghost positions match body orbital positions at trajectory times
- ✅ Labels show accurate time offsets
- ✅ Works for all celestial bodies

**Performance:**
- ✅ Intersection detection: < 5ms
- ✅ Frame rate: ≥ 60fps with 20 markers visible
- ✅ Cache hit rate: > 90% during steady-state flight

**User Experience:**
- ✅ Visually distinguishable from solid planets
- ✅ Doesn't obscure trajectory or navigation info
- ✅ Intuitive interpretation (no user manual needed)

---

## 8. Future Enhancements (Out of Scope)

The following are NOT part of this implementation but could be added later:

- **Interactive markers:** Click to set as navigation target
- **Delta-v calculator:** Show required thrust change to hit encounter
- **Encounter window:** Show range of acceptable arrival times
- **Closest approach indicator:** Line connecting ghost to trajectory point
- **Gravity assist planning:** Suggest optimal approach angles
- **Multi-hop planning:** Chain multiple encounters
- **Warning system:** Alert when trajectory will miss target by >0.1 AU

---

## End of Implementation Plan

**Next Step:** Proceed to Phase 3 (Review) for 4-perspective analysis of this plan.
