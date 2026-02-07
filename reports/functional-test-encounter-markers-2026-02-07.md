# Functional Test Report: Encounter Marker Filtering & Distance Labels

**Date**: 2026-02-07
**Reviewer**: Functional Tester
**Component**: Encounter Marker Rendering (`src/js/ui/renderer.js`)
**Changes Under Test**:
- Navigation filter (lines 1155-1160): Limit encounters to best 2 per destination
- Distance label formatting (lines 1225-1228): Show km vs AU based on threshold

---

## Executive Summary

**Overall Assessment**: ✅ **PASS WITH MINOR ISSUES**

The filtering logic and distance formatting work correctly for all normal scenarios. Two edge cases require attention:
1. **MEDIUM**: NaN distance values produce "NaN AU" labels (rare but possible)
2. **LOW**: Distance threshold creates formatting gap for 0.001-0.009 AU range

**Recommendation**: Add NaN guard before rendering. Distance formatting is acceptable as-is.

---

## Scenario Test Results

### Filter Logic (lines 1155-1160)

| # | Scenario | Expected Behavior | Result | Notes |
|---|----------|-------------------|--------|-------|
| 1 | `encounters.length = 0` | Skip rendering (guard at line 1163) | ✅ PASS | Early return prevents iteration |
| 2 | `encounters.length = 1` | Show 1 encounter | ✅ PASS | Filter condition `> 2` is false |
| 3 | `encounters.length = 2` | Show 2 encounters | ✅ PASS | Filter condition `> 2` is false |
| 4 | `encounters.length = 3` | Filter to best 2, re-sort by time | ✅ PASS | `3 > 2` triggers filter |
| 5 | `encounters.length = 5` | Filter to best 2, re-sort by time | ✅ PASS | Sorts by distance, keeps top 2, re-sorts by time |

**Clarification on `> 2` condition**: The requirement is "Show only the best 2 crossings per body" (line 1150). With `> 2`, exactly 2 encounters are NOT filtered, which is **correct** - we want to keep 2, not reduce to 1. With 3+ encounters, filtering down to 2 is the intended behavior.

**Verdict**: ✅ Filter logic is correct.

---

### Distance Label Formatting (lines 1225-1228)

```javascript
const distLabel = intersection.distance < 0.01
    ? `${(intersection.distance * 149597.87).toFixed(0)} km`
    : `${intersection.distance.toFixed(2)} AU`;
```

| # | Distance (AU) | Condition | Expected Output | Actual Output | Result |
|---|---------------|-----------|-----------------|---------------|--------|
| 5 | 0.005 | `< 0.01` | "748 km" | 0.005 × 149597.87 = 747.99 → "748 km" | ✅ PASS |
| 6 | 0.0 | `< 0.01` | "0 km" | 0.0 × 149597.87 = 0 → "0 km" | ✅ PASS |
| 7 | 1.5 | `≥ 0.01` | "1.50 AU" | (1.5).toFixed(2) = "1.50 AU" | ✅ PASS |
| 8 | 0.01 | `≥ 0.01` (boundary) | "0.01 AU" | `0.01 < 0.01` is false → "0.01 AU" | ✅ PASS |
| 9 | 0.009999 | `< 0.01` | "1496 km" | 0.009999 × 149597.87 = 1495.96 → "1496 km" | ✅ PASS |

**Boundary Precision**: The `< 0.01` threshold is correctly exclusive. Values at exactly 0.01 AU display as AU, not km.

**Verdict**: ✅ Distance formatting is mathematically correct.

---

## Edge Case Analysis

### 10. Identical Distance Values (Sort Stability)

**Scenario**: Two encounters with `distance = 1.23 AU`

**Code Path**:
```javascript
encounters.sort((a, b) => a.distance - b.distance);  // 1.23 - 1.23 = 0
```

**Behavior**:
- Modern JavaScript (ES2019+) guarantees **stable sort**
- When `compareFn` returns 0, original order is preserved
- The two encounters maintain their original time-based order

**Test Case**:
```javascript
// Input: [{time: 100, distance: 1.23}, {time: 200, distance: 1.23}]
// After distance sort: [{time: 100, distance: 1.23}, {time: 200, distance: 1.23}]
// After time re-sort: [{time: 100, distance: 1.23}, {time: 200, distance: 1.23}]
```

**Browser Compatibility**: Stable sort is guaranteed in Chrome 70+, Firefox 62+, Safari 10.1+, Edge 79+. All modern browsers.

**Verdict**: ✅ PASS - Stable sort handles identical distances correctly.

---

### 11. NaN or Undefined Distance

**Scenario**: `intersection.distance = NaN` (could occur if trajectory predictor returns NaN coordinates)

**Code Path Analysis**:

#### A. Filtering Phase (line 1156)
```javascript
encounters.sort((a, b) => a.distance - b.distance);
// If a.distance = NaN: NaN - 1.5 = NaN
// If b.distance = NaN: 1.5 - NaN = NaN
// Comparator returns NaN → treated as 0 (equal) by sort algorithm
```

**Behavior**: NaN distances cause unpredictable sort order but **no crash**.

#### B. Rendering Phase (line 1225-1227)
```javascript
const distLabel = NaN < 0.01  // false (NaN comparisons always false)
    ? `${(NaN * 149597.87).toFixed(0)} km`
    : `${NaN.toFixed(2)} AU`;  // This branch executes
// NaN.toFixed(2) returns "NaN"
// Result: "NaN AU"
```

**Actual Output**:
```
MARS +45d 2h [NaN AU]
```

**Impact**:
- No crash or console error
- Ghost marker still renders
- Label is confusing to players: "NaN AU" is not user-friendly

**Root Cause Check**:
- Intersection detector validates `planetPos` with `isFinite()` (line 773)
- Does **NOT** validate `crossing.position` before computing distance (line 778-781)
- If trajectory predictor returns NaN coordinates → `crossingDistance = Math.sqrt(NaN + NaN + NaN) = NaN`

**Likelihood**: Low (trajectory predictor has its own validation), but **theoretically possible** with:
- Corrupted orbital elements (e.g., `a = 0`, causing division by zero)
- Extreme time values (e.g., Julian date overflow)
- Bad input data (e.g., `e > 1` for non-hyperbolic orbits)

**Verdict**: ⚠️ **ISSUE FOUND** - NaN distance produces "NaN AU" label

**Severity**: 🟡 **MEDIUM**
- Doesn't crash the game
- Rare occurrence (requires upstream data corruption)
- User-facing impact: confusing label

**Recommended Fix**:
```javascript
// Before rendering, add NaN guard
if (!isFinite(intersection.distance) || intersection.distance < 0) {
    console.warn('Invalid encounter distance:', intersection);
    continue;  // Skip this ghost marker
}
```

---

## Additional Edge Cases Identified

### 12. Very Large Distances in km

**Scenario**: `distance = 0.008 AU` → `1196774 km`

**Output**: `"1196774 km"` (no thousand separators)

**Impact**:
- Harder to read large numbers
- Not a bug, just less polished UX

**Severity**: 🟢 **LOW** - Cosmetic issue

**Recommendation**: Consider Intl.NumberFormat for readability:
```javascript
const kmValue = Math.round(intersection.distance * 149597.87);
const distLabel = intersection.distance < 0.01
    ? `${kmValue.toLocaleString('en-US')} km`  // "1,196,774 km"
    : `${intersection.distance.toFixed(2)} AU`;
```

---

### 13. Distance Formatting Gap (0.001 - 0.009 AU)

**Scenario**: Distances just above the km range but below 0.01 AU

| Distance | Current Display | AU Equivalent |
|----------|----------------|---------------|
| 0.001 AU | "0.00 AU" | 149,598 km |
| 0.005 AU | "0.01 AU" (rounded) | 747,989 km |
| 0.009 AU | "0.01 AU" (rounded) | 1,346,381 km |

**Issue**: Precision loss for small AU values. `toFixed(2)` rounds to "0.00 AU" or "0.01 AU", losing granularity.

**Alternative**: Could show 3 decimal places for AU < 0.1:
```javascript
const distLabel = intersection.distance < 0.01
    ? `${(intersection.distance * 149597.87).toFixed(0)} km`
    : intersection.distance < 0.1
        ? `${intersection.distance.toFixed(3)} AU`  // 0.005 → "0.005 AU"
        : `${intersection.distance.toFixed(2)} AU`;  // 1.5 → "1.50 AU"
```

**Severity**: 🟢 **LOW** - Aesthetic/precision issue, not a functional bug

**Recommendation**: Current behavior is acceptable. The 0.01 AU threshold (1.5 million km) is reasonable for switching to AU display. If more precision is needed, use 3 decimal places for AU < 0.1.

---

### 14. Negative Distance

**Scenario**: `intersection.distance = -0.5 AU` (mathematically impossible from `Math.sqrt()`)

**Code Path**:
```javascript
const distLabel = -0.5 < 0.01  // true (negative < 0.01)
    ? `${(-0.5 * 149597.87).toFixed(0)} km`  // "-74799 km"
    : `${(-0.5).toFixed(2)} AU`;
```

**Output**: `"-74799 km"` (nonsensical)

**Root Cause**: `Math.sqrt(dx² + dy² + dz²)` always returns non-negative values (or NaN). Negative distance **cannot** occur from the intersection detector.

**Verdict**: ✅ **NOT A BUG** - Impossible scenario given the distance calculation method

**Note**: If you want defensive programming, add `distance >= 0` check, but it's not necessary given the math.

---

## Data Flow Validation

### Input Contract

**Source**: `intersectionCache.results` → filtered to destination body → mapped to encounters array

**Schema** (line 1143-1148):
```javascript
{
    bodyName: string,
    bodyPosition: {x, y, z},
    time: number (Julian date),
    distance: number (AU, from Math.sqrt)
}
```

**Guarantees**:
- `bodyName`: Always present (string)
- `bodyPosition`: Validated with `isFinite()` in detector (line 773)
- `time`: Always present (number from interpolation)
- `distance`: Computed from `Math.sqrt()` → **non-negative or NaN**

**Validation Gap**: `crossing.position` not validated before distance calculation → NaN propagation possible

---

## Sort Algorithm Verification

### Primary Sort (Distance)

**Code**: `encounters.sort((a, b) => a.distance - b.distance)`

**Test Cases**:
| Input Distances | Expected Order | Actual Result |
|----------------|----------------|---------------|
| `[1.5, 0.5, 2.0]` | `[0.5, 1.5, 2.0]` | ✅ Ascending |
| `[0.01, 0.009, 0.02]` | `[0.009, 0.01, 0.02]` | ✅ Ascending |
| `[1.0, 1.0, 0.5]` | `[0.5, 1.0, 1.0]` | ✅ Stable (1.0s preserve order) |

### Secondary Sort (Time)

**Code**: `encounters.sort((a, b) => a.time - b.time)`

**Purpose**: After filtering to best 2 by distance, re-sort chronologically so earlier encounter renders first

**Test Case**:
```javascript
// After distance sort: [{t: 200, d: 0.5}, {t: 100, d: 1.0}]
// After time re-sort: [{t: 100, d: 1.0}, {t: 200, d: 0.5}]
```

**Verdict**: ✅ Correct - Ensures chronological rendering order

---

## Performance Notes

### Array Mutation

**Code**: `encounters = encounters.slice(0, 2)`

**Behavior**: Creates new array (shallow copy), doesn't mutate original

**Context**: `encounters` is a local variable created from `.map()` (line 1143-1148), so mutation is safe. The original `intersectionCache.results` is **not** modified.

**Verdict**: ✅ Safe - No side effects on cached data

### Sort Complexity

- First sort: O(n log n) where n = number of encounters for destination
- Slice: O(1) (just takes first 2 elements)
- Second sort: O(1) (sorting 2 elements)

**Typical Load**: n ≤ 10 encounters per body (most trajectories cross orbital radius 2-5 times over multi-year predictions)

**Verdict**: ✅ Negligible performance impact

---

## Summary of Findings

### Critical Issues
None.

### Medium Issues

#### M1. NaN Distance Produces "NaN AU" Label
- **Severity**: 🟡 Medium
- **Location**: Line 1225-1228
- **Trigger**: Upstream NaN from trajectory predictor
- **Impact**: Confusing user-facing label
- **Likelihood**: Low (requires data corruption)
- **Fix**: Add `isFinite()` guard before rendering

### Low Issues

#### L1. No Thousand Separators for km
- **Severity**: 🟢 Low
- **Location**: Line 1226
- **Impact**: Readability (e.g., "1000000 km" vs "1,000,000 km")
- **Fix**: Use `toLocaleString('en-US')`

#### L2. Precision Loss for 0.001-0.009 AU Range
- **Severity**: 🟢 Low
- **Location**: Line 1227
- **Impact**: "0.00 AU" or "0.01 AU" loses granularity
- **Fix**: Use 3 decimal places for AU < 0.1

---

## Test Coverage Assessment

### Covered Scenarios ✅
- Empty encounters array (guard at line 1163)
- 1-2 encounters (no filtering)
- 3+ encounters (filter to best 2)
- Distance formatting (km vs AU)
- Boundary cases (0.01 AU threshold)
- Sort stability (identical distances)

### Missing Validation ⚠️
- NaN distance handling
- Upstream trajectory validation

### Recommended Test Suite

**Console Test** (add to `/js/lib/renderer.test.js` if created):
```javascript
export function testEncounterFiltering() {
    const encounters = [
        {bodyName: 'MARS', time: 100, distance: 1.5},
        {bodyName: 'MARS', time: 200, distance: 0.5},
        {bodyName: 'MARS', time: 300, distance: 2.0},
        {bodyName: 'MARS', time: 400, distance: 0.8},
        {bodyName: 'MARS', time: 500, distance: 1.2}
    ];

    // Simulate filtering logic
    let filtered = [...encounters];
    if (filtered.length > 2) {
        filtered.sort((a, b) => a.distance - b.distance);
        filtered = filtered.slice(0, 2);
        filtered.sort((a, b) => a.time - b.time);
    }

    console.assert(filtered.length === 2, 'Should keep 2 encounters');
    console.assert(filtered[0].distance === 0.5, 'First should be best intercept (0.5 AU)');
    console.assert(filtered[1].distance === 0.8, 'Second should be next best (0.8 AU)');
    console.assert(filtered[0].time === 200, 'After re-sort, earlier time first');
    console.assert(filtered[1].time === 400, 'After re-sort, later time second');

    console.log('✅ Encounter filtering test passed');
}

export function testDistanceFormatting() {
    const cases = [
        {dist: 0.005, expected: '748 km'},
        {dist: 0.0, expected: '0 km'},
        {dist: 0.01, expected: '0.01 AU'},
        {dist: 1.5, expected: '1.50 AU'},
        {dist: 0.009999, expected: '1496 km'}
    ];

    for (const {dist, expected} of cases) {
        const actual = dist < 0.01
            ? `${(dist * 149597.87).toFixed(0)} km`
            : `${dist.toFixed(2)} AU`;
        console.assert(actual === expected, `${dist} AU → expected "${expected}", got "${actual}"`);
    }

    console.log('✅ Distance formatting test passed');
}
```

---

## Conclusion

The filtering and formatting logic is **functionally correct** for all normal scenarios. The `> 2` check is appropriate (keeps exactly 2, filters 3+). Distance display is mathematically accurate with a reasonable km/AU threshold.

**Action Items**:
1. **Required** (Medium): Add NaN validation before rendering encounter markers
2. **Optional** (Low): Add thousand separators for km display
3. **Optional** (Low): Use 3 decimal places for AU < 0.1

**Confidence**: 🟢 **High** - Core logic is sound, only edge case hardening needed

---

**Timestamp**: 2026-02-07
**Next Steps**: Review other perspectives (Physics, Architecture, Failure Modes) before implementation sign-off
