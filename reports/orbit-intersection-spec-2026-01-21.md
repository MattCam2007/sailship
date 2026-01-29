# Orbit Intersection Display Specification

**Date:** 2026-01-21
**Status:** Draft
**Feature:** Display planets/objects at predicted trajectory intersection points

---

## 1. Executive Summary

Add a new display option that shows where celestial bodies (planets, moons, asteroids) will be in their orbits at the time when the predicted trajectory intersects their orbital paths. This provides a critical navigational aid by answering the question: "If I maintain this trajectory, will I actually encounter the target planet, or will I arrive at an empty point in space?"

**Value Proposition:** Enables players to visually validate trajectory planning by showing temporal alignment between ship arrival and planet position.

---

## 2. Current State Analysis

### 2.1 Existing Systems

| System | Location | Purpose |
|--------|----------|---------|
| Predicted Trajectory | `trajectory-predictor.js` | Calculates spiral path with continuous thrust (30-730 days) |
| Celestial Position Updates | `celestialBodies.js:updateCelestialPositions()` | Computes planet positions at current game time using Keplerian orbits |
| Orbital Path Rendering | `renderer.js:drawOrbit()` | Draws elliptical orbits for all bodies |
| Display Options | `gameState.js:displayOptions` | Toggle system for visual elements |

### 2.2 Data Flow

```
Player adjusts sail → Trajectory Predictor calculates path → Renderer draws spiral
                                                                     ↓
                                    (no connection currently)
                                                                     ↓
Celestial Bodies update position at current time → Renderer draws orbits + bodies
```

**Gap:** No calculation of where bodies will be at future trajectory times.

### 2.3 Relevant Code

**Trajectory Data Structure** (`trajectory-predictor.js:76-197`):
```javascript
[
  { x: number, y: number, z: number, time: number },  // Julian date
  ...
]
```
Each point has a **timestamp** (Julian date), but celestial bodies are only rendered at **current game time**.

**Celestial Position Calculation** (`orbital.js:488-531`):
- `getPosition(elements, julianDate)` - Can calculate position at ANY Julian date
- Currently only called with `gameState.julianDate` (current time)

**Orbit Intersection Detection** - **MISSING**
- No existing algorithm to detect where trajectory crosses orbital paths
- Closest related code: SOI boundary checking in trajectory predictor

**Rendering System** (`renderer.js`):
- `drawOrbit()` - Draws orbital ellipse (lines 138-196)
- `drawPredictedTrajectory()` - Draws spiral path (lines 559-696)
- No function to draw "future body positions"

---

## 3. Gap Analysis

### 3.1 Missing Capabilities

- [ ] Algorithm to detect 2D/3D intersections between predicted trajectory and orbital paths
- [ ] Function to calculate celestial body position at a specific Julian date (exists in `orbital.js` but not integrated)
- [ ] Data structure to store intersection events: `{ bodyName, time, bodyPosition, trajectoryPosition, distance }`
- [ ] Rendering function to draw markers at intersection points
- [ ] Display toggle for showing/hiding these markers
- [ ] UI controls (HTML checkbox + handler)

### 3.2 Required Changes

**Data Layer:**
- [ ] New module: `intersectionDetector.js` in `lib/`
  - Detect 2D orbital plane crossings
  - Calculate closest approach in 3D
  - Filter results by proximity threshold

**Core Layer:**
- [ ] Extend `gameState.js` to add `displayOptions.showIntersectionMarkers`
- [ ] Cache intersection results (invalidate when trajectory changes)

**UI Layer:**
- [ ] Add `drawIntersectionMarkers()` in `renderer.js`
- [ ] Add checkbox toggle in `index.html`
- [ ] Register handler in `controls.js`

**Integration:**
- [ ] Call intersection detector after trajectory prediction updates
- [ ] Pass results to renderer in render loop

---

## 4. Open Questions

### 4.1 Intersection Definition

**Q1:** What counts as an "intersection"?
- **Option A:** Trajectory crosses orbital path within threshold (e.g., < 0.01 AU)
- **Option B:** Trajectory passes within threshold of actual body position at that time
- **Recommendation:** Use Option B (actual close approach), as it's more relevant for navigation

**Q2:** Should we show ALL crossings or only meaningful ones?
- **Option A:** Show every crossing (could be many for inner planets)
- **Option B:** Filter by closest approach distance (e.g., < 0.1 AU or < 2× planet SOI)
- **Recommendation:** Option B with configurable threshold

### 4.2 Rendering Strategy

**Q3:** How to visualize intersection markers?
- **Option A:** Draw small planet icon at future position
- **Option B:** Draw circle/dot with body color + connecting line
- **Option C:** Draw ghost/transparent planet at future position
- **Recommendation:** Option C (ghost planet) - most intuitive for players

**Q4:** Should markers show time-to-encounter?
- **Yes:** Add label with "Δt = +42 days" or arrival date
- **No:** Keep visual minimal
- **Recommendation:** Yes, but only when hovering or zoomed in

### 4.3 Performance Considerations

**Q5:** How often to recalculate intersections?
- Every frame would be expensive (trajectory has 100-300 points × 9 bodies = up to 2700 checks)
- **Recommendation:** Calculate only when trajectory changes (cache with same TTL as trajectory predictor: 500ms)

**Q6:** Which bodies to check?
- All 9 bodies (planets + moons + asteroids)?
- Only planets?
- **Recommendation:** All bodies, but prioritize player's current navigation target

---

## 5. Design Constraints

### 5.1 Architecture Constraints

- Must follow existing pattern: `data/ → core/ → ui/`
- No circular dependencies
- Use existing `orbital.js` functions (don't reinvent math)
- Cache results for performance

### 5.2 Visual Constraints

- Predicted trajectory already uses magenta/purple
- Celestial body colors are in `BODY_DISPLAY` config
- Don't clutter the display (use transparency)
- Must work at all zoom levels (System to Tactical)

### 5.3 Performance Constraints

- Target <5ms for intersection calculation (similar to trajectory predictor)
- Cache results with 500ms TTL
- Don't block render loop
- Adaptive detail based on trajectory length

---

## 6. Success Criteria

### 6.1 Functional Requirements

- [ ] Toggle ON → see ghost planets at trajectory intersection points
- [ ] Toggle OFF → markers disappear
- [ ] Ghost planets use correct body colors and sizes
- [ ] Positions are mathematically accurate (match Keplerian orbits at those times)
- [ ] Works for all celestial bodies (planets, moons, asteroids)

### 6.2 Performance Requirements

- [ ] Intersection calculation completes in <10ms
- [ ] No frame rate drops when toggle is enabled
- [ ] Cache invalidation works correctly

### 6.3 UX Requirements

- [ ] Visually distinguishable from current-time bodies
- [ ] Does not obstruct critical navigation information
- [ ] Labels show time offset (e.g., "+45d 12h")
- [ ] Works with all camera angles and zoom levels

---

## 7. Out of Scope

The following are explicitly NOT part of this feature:

- Collision avoidance algorithms
- Automatic trajectory optimization to hit encounters
- Gravity assist calculations
- Delta-v requirements to reach encounters
- Warning system for missed encounters
- Time manipulation to adjust encounters

These may be future features but are separate concerns.

---

## 8. Assumptions

1. Player understands orbital mechanics (this is a planning tool, not a tutorial)
2. Predicted trajectory is already accurate (we're not fixing trajectory predictor)
3. Celestial orbital elements are static (no N-body perturbations)
4. Game time scale does not affect intersection calculations (uses Julian dates)
5. SOI transitions in trajectory prediction are already handled correctly

---

## 9. Dependencies

| Dependency | Type | Notes |
|------------|------|-------|
| `orbital.js:getPosition()` | Existing | Used to calculate future planet positions |
| `trajectory-predictor.js` | Existing | Provides trajectory points with timestamps |
| `celestialBodies.js` | Existing | Provides body orbital elements |
| Display toggle system | Existing | Pattern for adding new options |
| Renderer pipeline | Existing | Canvas drawing infrastructure |

No new external dependencies required. This is a pure feature addition using existing infrastructure.

---

## 10. Next Steps

1. **Proceed to Phase 2:** Create implementation plan with atomic units of work
2. **Clarify open questions:** Get user input on:
   - Intersection definition (closest approach vs. orbital crossing)
   - Rendering style (ghost planets vs. markers)
   - Time label format
3. **Design intersection algorithm:** Pseudocode for efficient detection
4. **Break into units:** Identify 6-10 atomic, testable units
5. **Review plan:** Apply 4-perspective review before implementation

---

## Appendix A: Visual Mockup (Textual Description)

**Before (current state):**
```
[Magenta spiral trajectory crosses Mars orbit]
Mars is rendered at its current position (behind the spiral)
Player cannot tell if trajectory will encounter Mars
```

**After (with feature enabled):**
```
[Magenta spiral trajectory crosses Mars orbit]
Mars is at current position (solid, bright)
Ghost Mars appears on trajectory (50% transparent, same color)
Label: "MARS +87d 6h" (time until encounter)
```

This visual feedback immediately shows whether the trajectory timing is correct.

---

## Appendix B: Reference Calculations

**Intersection Detection Algorithm (High-Level):**

```
For each body in celestialBodies:
    For each segment in predictedTrajectory:
        t1 = segment[i].time
        t2 = segment[i+1].time

        // Calculate body orbit positions at these times
        bodyPos1 = getPosition(body.elements, t1)
        bodyPos2 = getPosition(body.elements, t2)

        // Check if trajectory segment approaches body path
        closestApproach = calculateClosestApproach3D(
            segment[i], segment[i+1],
            bodyPos1, bodyPos2
        )

        if (closestApproach.distance < THRESHOLD) {
            intersections.push({
                body: body.name,
                time: closestApproach.time,
                position: getPosition(body.elements, closestApproach.time),
                distance: closestApproach.distance
            })
        }
```

**Complexity:** O(T × B) where T = trajectory segments (100-300), B = bodies (9)
**Estimated cost:** 900-2700 distance calculations per update

---

## End of Specification Document
