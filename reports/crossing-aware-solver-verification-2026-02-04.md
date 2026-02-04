# Crossing-Aware Course Solver Verification Report

**Date:** 2026-02-04
**Implementation:** Commits 7897756, 20b60db
**Branch:** claude/fix-autopilot-ghost-planet-QFbH6

---

## Implementation Summary

### Upgrade 1: Crossing-Aware Course Solver

**Location:** `src/js/lib/course-solver.js`

**Changes:**
- Added `findRadiusCrossingsInTrajectory()` function (lines 142-200)
- Added `calculateAngularSeparation()` function (lines 113-129)
- Added `distance3D()` helper function (lines 210-215)
- Rewrote `evaluateCandidate()` to use crossing-based evaluation (lines 221-496)
- Updated CONFIG with crossing-aware parameters (lines 82-97)

**Algorithm:**
1. Simulate trajectory with given sail settings
2. Build trajectory array storing all positions
3. Detect all orbital radius crossings (where r crosses target's semi-major axis)
4. For each crossing:
   - Compute planet's actual position at crossing time
   - Calculate distance between ship and planet
   - Calculate angular separation (phase constraint)
5. Return the best crossing that passes phase constraint

### Upgrade 3: Phase-Constrained Optimization

**Phase Constraint Logic:**
```javascript
// Skip crossings where planet is too far angularly
if (angularSep > CONFIG.maxPhaseAngle) {
    continue;  // Planet is on the other side of its orbit
}
```

**Configuration:**
- `maxPhaseAngle: 0.79` (~45 degrees) - allows reasonable transfer windows
- Can be tuned tighter (30°) for more accurate results or looser (60°) for more options

### New Status Types

| Status | Meaning |
|--------|---------|
| `INTERCEPT` | Distance < 0.01 AU at crossing, good phase |
| `NEAR_MISS` | Distance 0.01-0.05 AU at crossing, good phase |
| `MARGINAL` | Distance 0.05-0.2 AU at crossing, good phase |
| `NO_INTERCEPT` | Distance > 0.2 AU at crossing, good phase |
| `PHASE_MISS` | Crossed orbit but planet was >45° away |
| `NO_CROSSING` | Trajectory never crosses target's orbital radius |

### Solution Output

New fields in course solution object:
```javascript
crossingInfo: {
    crossingIndex: 0,           // Which crossing (0-indexed)
    totalCrossings: 2,          // Total crossings detected
    angularSeparationDeg: 12.5, // Phase angle at crossing
    crossingDirection: 'outbound', // or 'inbound'
    usedCrossingAware: true     // v3.0 algorithm used
}
```

### UI Updates

**Location:** `src/js/ui/controls.js:displayCourseResult()`

New display rows:
- **CROSSING**: Shows which crossing is targeted (e.g., "#1/2 ↑")
- **PHASE**: Shows angular separation in degrees

---

## Test Cases

### Manual Testing Checklist

- [ ] Plot course to Venus - verify crossing index shown
- [ ] Plot course with multiple crossings - verify correct crossing selected
- [ ] Plot course where planet is on opposite side - verify PHASE_MISS status
- [ ] Plot course to outer planet (can't reach) - verify NO_CROSSING status
- [ ] Verify ghost planet position matches solver target crossing
- [ ] Verify UI displays crossing and phase information

### Expected Behavior

**Before (v2.0):**
- Solver finds global minimum distance
- Result may target wrong ghost planet
- No phase awareness

**After (v3.0):**
- Solver finds best crossing with good phase
- Result directly corresponds to displayed ghost
- Phase constraint prevents false positives

---

## Known Limitations

1. **Single crossing selection**: Automatically picks best crossing, no user control
   - Future: Upgrade 2 would add multi-crossing selection UI

2. **Fixed phase constraint**: 45° threshold is hardcoded
   - Can be changed in CONFIG.maxPhaseAngle

3. **Linear interpolation for crossing time**: Uses linear approximation
   - intersectionDetector uses quadratic, but linear is adequate for solver

---

## Performance

No significant performance impact expected:
- Crossing detection is O(n) over trajectory
- Angular separation is O(1) per crossing
- Additional memory: ~1000 trajectory points stored temporarily

---

## Files Changed

| File | Lines Changed | Description |
|------|---------------|-------------|
| `src/js/lib/course-solver.js` | +597 | Crossing-aware evaluation |
| `src/js/ui/controls.js` | +29 | Display crossing info |
| `reports/*.md` | +271 | Documentation |

---

## Verdict

[x] Implementation Complete
[ ] Requires Additional Work

The crossing-aware solver (Upgrades 1+3) is fully implemented. The solver now:
1. Targets specific orbital crossings instead of global minimum
2. Applies phase constraint to ensure planet is actually nearby
3. Reports which crossing is targeted and the phase angle
4. Falls back gracefully when no valid crossings exist
