# Autopilot Upgrade Proposals

**Date:** 2026-02-04
**Status:** Analysis Complete - Ready for Planning

---

## Executive Summary

The autopilot course solver (v2.0) has two fundamental issues:

1. **Wrong Ghost Planet Targeting**: The solver finds the globally-closest approach to a planet, but this may correspond to a different orbital crossing than what the user visually sees. When the trajectory crosses a planet's orbit twice, the solver might optimize for crossing #2 while the prominent ghost on screen is for crossing #1.

2. **Insufficient Intercept Accuracy**: Even when targeting the correct crossing, results around 0.1 AU are common when < 0.01 AU is needed for actual intercepts.

### Root Cause Analysis

The core architectural mismatch:

| Component | What It Does | Gap |
|-----------|--------------|-----|
| **Ghost Planets** (intersectionDetector.js) | Shows where planet WILL BE when you cross its orbital radius | Time-indexed to each crossing |
| **Course Solver** (course-solver.js) | Minimizes global distance to planet across entire trajectory | Not aware of which crossing it's optimizing |

**Example Scenario:**
- Ship trajectory crosses Venus orbit at day 45 (outbound) and day 120 (inbound)
- Ghost #1 at day 45: Venus position = (0.5, 0.4, 0.01) AU
- Ghost #2 at day 120: Venus position = (-0.3, 0.6, -0.01) AU
- Solver finds closest approach at day 118 (near Ghost #2) at 0.08 AU
- But the ship passes THROUGH Ghost #1's screen position at day 45
- User sees: "I passed right through the ghost, why no intercept?"
- Reality: That ghost was for a DIFFERENT time; the planet wasn't there then

---

## Proposed Upgrades

### Upgrade 1: Crossing-Aware Course Solver

**Problem Solved:** Wrong ghost planet targeting (Issue #1)

**Description:**
Instead of minimizing global closest approach, the solver should specifically target orbital crossing events. For each crossing of the target's orbital radius, calculate where the planet actually will be at that exact crossing time, and minimize distance to THAT specific position.

**Algorithm Change:**
```
Current:  min(distance_to_planet) over all t ∈ [0, maxDays]
Proposed: min(distance_at_crossing) for each crossing event
```

**Implementation Approach:**
1. Detect all orbital crossings in candidate trajectory (similar to intersectionDetector)
2. For each crossing, compute planet position at crossing time
3. Calculate ship-to-planet distance at that moment
4. Track which crossing has best intercept potential
5. Return solution annotated with crossing index

**Files to Modify:**
- `src/js/lib/course-solver.js` - Add crossing detection to evaluateCandidate()

**Expected Impact:**
- Solver results will directly correspond to displayed ghost planets
- User can trust that optimizing to a ghost will actually work
- Eliminates the "passed through wrong ghost" confusion

**Complexity:** Medium (requires integrating intersectionDetector logic into solver)

---

### Upgrade 2: Multi-Crossing Selection UI

**Problem Solved:** User can't control which crossing to target

**Description:**
When multiple crossings exist, provide UI to select which one to optimize for. Display all crossings with their times and expected distances, let user pick the best window.

**User Flow:**
1. Click "PLOT COURSE"
2. Solver detects 3 Venus crossings at +45d, +120d, +280d
3. UI shows: "Select transfer window:"
   - Window 1: +45d (outbound) - Est. 0.08 AU
   - Window 2: +120d (inbound) - Est. 0.12 AU
   - Window 3: +280d (outbound) - Est. 0.03 AU ← RECOMMENDED
4. User selects Window 3
5. Solver optimizes specifically for that crossing

**Files to Create:**
- UI components in `src/js/ui/auto-panel.js` for window selection

**Files to Modify:**
- `src/js/lib/course-solver.js` - Return all crossing options
- `src/js/ui/controls.js` - Handle window selection

**Expected Impact:**
- User gains strategic control over transfer timing
- Can choose faster vs. more accurate transfers
- Matches how real mission planning works

**Complexity:** Medium-High (new UI state management)

---

### Upgrade 3: Phase-Constrained Optimization

**Problem Solved:** Insufficient intercept accuracy (Issue #2)

**Description:**
Add a hard constraint that the target planet must be within a maximum angular distance from the crossing point. This ensures we only accept solutions where the planet is actually "there" when we arrive.

**Constraint Definition:**
```
At crossing time T:
  - Ship position: P_ship (on the orbital radius)
  - Planet position: P_planet
  - Angular separation: θ = arccos(P_ship · P_planet / |P_ship||P_planet|)

Constraint: θ < MAX_PHASE_ERROR (e.g., 15°)
```

**Why This Helps:**
- Current solver can find "close" approaches where ship and planet are on opposite sides of the orbit
- This constraint forces solutions where they're actually near each other angularly
- Eliminates false positives from the distance metric

**Implementation:**
1. In evaluateCandidate(), compute angular separation at each crossing
2. If separation > threshold, apply penalty or discard
3. Return both linear distance AND angular separation

**Files to Modify:**
- `src/js/lib/course-solver.js` - Add phase constraint logic

**Expected Impact:**
- Dramatic improvement in actual intercept quality
- Solutions will be physically sensible
- Reduces search space to viable transfers only

**Complexity:** Low-Medium

---

### Upgrade 4: Departure Time Optimization

**Problem Solved:** Insufficient intercept accuracy (Issue #2)

**Description:**
Currently the solver assumes departure "now". But optimal transfers depend heavily on planetary phase alignment. Add ability to search over departure times to find launch windows.

**Concept:**
A Venus intercept might be impossible today, but waiting 30 days could provide a perfect transfer window. The solver should search:
- Sail angles (yaw, pitch): Current 2D search
- Departure delay: New dimension (0-180 days)

**Algorithm:**
1. For each candidate departure delay (0, 15, 30, 45, ... days)
2. Run current multi-horizon sail angle search
3. Track best result across all departure windows
4. Return recommended "wait time" along with sail settings

**User Impact:**
- "PLOT COURSE" might return: "Optimal transfer in 42 days. Set reminder?"
- Player can choose to wait for better window or accept suboptimal current transfer
- Matches real space mission planning

**Files to Modify:**
- `src/js/lib/course-solver.js` - Add departure time dimension
- `src/js/ui/controls.js` - Display wait recommendation

**Expected Impact:**
- Enables finding transfers that are currently impossible
- Could improve intercept distances by 10x or more
- More realistic mission planning experience

**Complexity:** High (expands search space significantly)

---

### Upgrade 5: Staged Trajectory Planning (Mid-Course Corrections)

**Problem Solved:** Both issues - enables more precise intercepts

**Description:**
Currently the solver assumes fixed sail settings for the entire journey. In reality, optimal transfers often require trajectory shaping:
- Phase 1: Raise/lower orbit to match target's orbital radius
- Phase 2: Coast to align phase angle
- Phase 3: Final approach corrections

**Multi-Stage Approach:**
Instead of single (yaw, pitch) for entire trip, solve for:
- Stage 1: (yaw₁, pitch₁) for t ∈ [0, T₁]
- Stage 2: (yaw₂, pitch₂) for t ∈ [T₁, T₂]
- Stage 3: (yaw₃, pitch₃) for t ∈ [T₂, arrival]

**Simplified Version (2 stages):**
1. Stage 1: Orbit matching (get to same semi-major axis)
2. Stage 2: Intercept refinement (adjust timing/approach)

**Implementation:**
1. First pass: Find settings that match target orbital radius
2. At radius-match point, switch to intercept-optimizing settings
3. Search over: (yaw₁, pitch₁, switchTime, yaw₂, pitch₂)

**Files to Create:**
- `src/js/lib/staged-trajectory-solver.js` - Multi-stage optimization

**Files to Modify:**
- `src/js/core/navigation.js` - Support staged course application
- `src/js/ui/auto-panel.js` - Display multi-stage plan

**Expected Impact:**
- Enables intercepts that are impossible with single-stage approach
- Matches how real solar sail missions are planned
- Dramatically improves accuracy for outer planet transfers

**Complexity:** Very High (significant new architecture)

---

## Recommendation: Implementation Order

Based on impact-to-complexity ratio:

| Priority | Upgrade | Why |
|----------|---------|-----|
| **1** | **Crossing-Aware Solver** | Directly fixes Issue #1 with moderate effort |
| **2** | **Phase-Constrained Optimization** | Low complexity, high impact on Issue #2 |
| **3** | **Multi-Crossing Selection UI** | Gives user control, moderate complexity |
| **4** | **Departure Time Optimization** | High impact but high complexity |
| **5** | **Staged Trajectory Planning** | Transformative but very complex |

**Suggested MVP:**
Implement Upgrades 1 + 2 together as they're complementary. This would resolve the "wrong ghost planet" issue completely.

---

## Appendix: Current Code Analysis

### Course Solver (v2.0) - Key Limitation

From `course-solver.js:136-159`:
```javascript
for (let i = 0; i <= steps; i++) {
    // ... get positions ...
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Track closest approach (GLOBAL minimum, not per-crossing)
    if (dist < minDistance) {
        minDistance = dist;
        minDistanceTime = i * timeStep;
    }
}
```

This tracks the global minimum distance, which may occur at any point - not necessarily at an orbital crossing. The ghost planets show crossing-specific positions.

### Intersection Detector - What Ghost Planets Represent

From `intersectionDetector.js:557-688`:
```javascript
// Use radius crossing detection - reliably finds when trajectory
// crosses the planet's orbital distance from the Sun
const crossing = findOrbitalPlaneCrossing(p1, p2, body.elements);

if (crossing) {
    // Get planet's actual position at crossing time
    const planetPos = getPosition(body.elements, crossing.time);
    // THIS is what the ghost shows - planet position at CROSSING time
}
```

The ghost planet is at `getPosition(elements, crossing.time)` - the planet's actual position when we cross its orbital radius. The solver needs to minimize distance to THIS position at THIS time, not the global minimum.
