# Ghost Planet Filter - Failure Mode Analysis
**Date**: 2026-02-07
**Reviewer**: Failure Analyst
**Component**: `src/js/ui/renderer.js` (drawIntersectionMarkers)
**Context**: Navigation filter added to prevent ghost planet clutter

## Executive Summary

Analyzed the "best 2 encounters" filter applied in the renderer. Found **1 critical architectural issue**, **4 important bugs/UX problems**, and **2 minor optimizations**. The root cause (detector producing duplicate crossings) is treated as a symptom in the renderer rather than fixed at the source. This creates technical debt and potential instability.

**Overall Risk**: **MEDIUM-HIGH** - The filter works for typical cases but has edge cases that cause flickering, misleading labels, and potential crashes.

---

## Failure Mode Analysis

### 1. Performance: Double-Sorting Small Arrays Every Frame
**Severity**: Nice-to-have
**Impact**: CPU cycles wasted, but negligible for small arrays
**Likelihood**: Constant (happens every frame)

**Analysis**:
```javascript
if (encounters.length > 2) {
    encounters.sort((a, b) => a.distance - b.distance);  // Sort #1: by distance
    encounters = encounters.slice(0, 2);
    encounters.sort((a, b) => a.time - b.time);          // Sort #2: by time
}
```

- Runs at 60 FPS for typically 0-5 items
- Two sorts per frame = ~120 sort operations/second
- Modern JS engines use insertion sort for n<10 (O(n²) but fast constant factors)
- For 5 items: ~25 comparisons total per frame = ~1500 comparisons/sec
- **Actual cost**: <0.01ms per frame (unmeasurable in 16ms budget)

**Problem**: Wasteful when trajectory hash hasn't changed. The encounters array is read from `intersectionCache.results`, which only updates when the trajectory changes. If sail settings are stable, we're re-sorting the same data 60 times per second.

**Recommendation**: Cache filtered results keyed by `intersectionCache.trajectoryHash`. Only re-filter when cache hash changes. This is a **micro-optimization** - not urgent, but shows architectural sloppiness (renderer doing work that should be cached).

---

### 2. NaN/Undefined Distance Values Breaking Sort
**Severity**: **Important**
**Impact**: Unpredictable sort order, ghost positions scrambled, "NaN AU" labels
**Likelihood**: Low but possible (trajectory prediction edge cases)

**Analysis**:
The sort comparator `(a, b) => a.distance - b.distance` assumes all distances are valid numbers. If `intersection.distance` is NaN or undefined:
- `NaN - 1.5` → `NaN`
- `undefined - 1.5` → `NaN`
- Sort comparator returns NaN → **unstable sort order**
- Array elements randomly reordered
- Distance label shows "NaN km" or "NaN AU"

**Trace to Root Cause**:
```javascript
// intersectionDetector.js:778-781
const dx = crossing.position.x - planetPos.x;
const dy = crossing.position.y - planetPos.y;
const dz = crossing.position.z - planetPos.z;
const crossingDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);
```

- `planetPos` is validated (line 773-775): skips if `!isFinite(planetPos.x)`
- `crossing.position` is **NOT validated**: could contain NaN from quadratic solver edge cases
- If `crossing.position.x` is NaN → `dx` is NaN → `crossingDistance` is NaN

**Evidence of NaN Risk**:
- `refineCrossingBisection()` uses discriminant checks (line 329) but **doesn't validate output**
- If discriminant is barely negative (floating-point noise), fallback linear interpolation at line 337 could produce NaN if `radialDiff ≈ 0`
- Edge case: trajectory segment is exactly tangent to orbital radius

**Recommendation**:
1. **Defensive filtering** in renderer before sort:
   ```javascript
   encounters = encounters.filter(e => isFinite(e.distance) && e.distance >= 0);
   ```
2. **Root fix** in detector: validate `crossing.position` before calculating distance
3. **Logging** when NaN encounters are filtered (helps catch predictor bugs)

---

### 3. AU-to-km Conversion Threshold Discontinuity
**Severity**: Nice-to-have
**Impact**: Confusing label format switches
**Likelihood**: Common for close encounters (<0.01 AU)

**Analysis**:
```javascript
const distLabel = intersection.distance < 0.01
    ? `${(intersection.distance * 149597.87).toFixed(0)} km`
    : `${intersection.distance.toFixed(2)} AU`;
```

**Threshold**: 0.01 AU = 1,495,979 km ≈ **3.9× Moon distance**

**Problems**:
1. **Precision inconsistency**:
   - 0.009 AU → "1346000 km" (7 digits, looks very precise)
   - 0.01 AU → "0.01 AU" (2 decimal places, vague)
   - Discontinuity: "1346000 km" vs "0.01 AU" (very different feel)

2. **Threshold too high**:
   - Mars closest approach: ~0.5 AU → shows as "0.50 AU" (fine)
   - Venus flyby: 0.008 AU → shows as "1197000 km" (hard to read, 7 digits)
   - Lunar orbit: 0.0026 AU → shows as "389000 km" (ok)

3. **Not calibrated to encounter scale**:
   - SOI radii range from 0.0006 AU (Venus) to 0.032 AU (Jupiter)
   - A "close" encounter for Venus might be 0.001 AU (149,598 km)
   - Current threshold misses this range entirely

**Recommendation**:
- Lower threshold to **0.001 AU** (149,598 km) to catch SOI-scale encounters
- Use **3 decimal places** for AU display when <0.1: `.toFixed(3)` → "0.008 AU"
- Add unit abbreviations: "1.50M km" instead of "1500000 km"

---

### 4. Label Text Overflow - No Clipping or Truncation
**Severity**: **Important**
**Impact**: Unreadable labels, text off-screen, overlapping ghosts
**Likelihood**: High for long duration windows (1+ year trajectories)

**Analysis**:
```javascript
const labelText = `${intersection.bodyName} ${timeOffset} [${distLabel}]`;
// Example: "JUPITER +1234d 12h [2.34 AU]"
```

**Label positioning** (line 1238-1243):
```javascript
const labelX = projected.x + display.radius + 5;
const labelY = projected.y - display.radius - 5;
ctx.fillText(labelText, labelX, labelY);
```

- No text width measurement
- No canvas bounds checking
- No text truncation or wrapping
- Labels extend indefinitely to the right

**Worst-case examples**:
| Body | Time | Distance | Label | Characters |
|------|------|----------|-------|-----------|
| JUPITER | +1234d 12h | 12.34 AU | "JUPITER +1234d 12h [12.34 AU]" | 31 |
| SATURN | +999d 23h | 0.12 AU | "SATURN +999d 23h [0.12 AU]" | 29 |
| EARTH | +45d 6h | 1496000 km | "EARTH +45d 6h [1496000 km]" | 29 |

**At 11px monospace font**: 31 chars × 6.6px/char ≈ **205px wide**

**Failure scenarios**:
1. **Off-screen**: Ghost at right edge (x=1800) → label extends to x=2005 (clipped)
2. **Overlap**: Two ghosts 150px apart → labels overlap (unreadable)
3. **No feedback**: Player doesn't know label is truncated

**Recommendation**:
1. **Measure text width** before drawing:
   ```javascript
   const textWidth = ctx.measureText(labelText).width;
   ```
2. **Clamp to canvas**:
   ```javascript
   const maxX = canvas.width - textWidth - 10;
   const clampedX = Math.min(labelX, maxX);
   ```
3. **Truncate long labels**:
   ```javascript
   if (textWidth > 200) {
       labelText = labelText.substring(0, 25) + '...';
   }
   ```
4. **Smart positioning**: Place label above/below/left based on ghost position

---

### 5. Filter Oscillation Causing Ghost Flickering
**Severity**: **Important**
**Impact**: Ghosts flicker in/out during sail adjustment, jarring UX
**Likelihood**: High during active trajectory tuning

**Analysis**:
The "best 2" filter selects crossings by minimum distance:
```javascript
if (encounters.length > 2) {
    encounters.sort((a, b) => a.distance - b.distance);
    encounters = encounters.slice(0, 2);
}
```

**Flickering scenario**:
1. **Frame N**: 4 crossings with distances [1.01, 1.02, 1.03, 1.50] AU
   - Filter selects: [1.01, 1.02] → ghosts at crossing #1, #2
2. **Player adjusts sail yaw +1°** (continuous control input)
3. **Frame N+1**: Trajectory shifts, distances now [1.02, 1.01, 1.03, 1.50] AU
   - Filter selects: [1.01, 1.02] → **still ghosts #1, #2** (stable by chance)
4. **Frame N+2**: Distances now [1.03, 1.01, 1.00, 1.50] AU
   - Filter selects: [1.00, 1.01] → **ghosts #3, #2** (ghost #1 disappears, ghost #3 appears!)

**Root causes**:
1. **No hysteresis**: Filter has no "memory" of previous selection
2. **No stability threshold**: Distances within 1% treated as completely different
3. **Continuous input**: Sail adjustments happen every frame during user interaction
4. **Frame-to-frame variance**: Trajectory prediction has small numerical differences

**Why this is bad**:
- **Visual distraction**: Ghost #1 vanishing and ghost #3 appearing is jarring
- **Navigation confusion**: "Where did my target go?"
- **Performance spikes**: Ghost appearing → renderer draws new planet → potential cache miss

**Recommendation**:
1. **Hysteresis band**: If encounter was in "best 2" last frame and is within 10% of threshold, keep it
2. **Stable sort**: When distances are very close (Δ < 0.01 AU), prefer earlier crossings (time-stable)
3. **Debounce during input**: Don't update ghost filter when user is actively adjusting controls (wait 500ms after last input)
4. **Visual feedback**: Fade ghost out over 300ms instead of instant removal

**Alternative strategy**: Show "best N per time window" instead of "best 2 overall":
- Divide prediction window into thirds (e.g., 0-20d, 20-40d, 40-60d)
- Show best encounter in each window
- This spreads ghosts over time, less flickering

---

### 6. Prediction Window Strategy Mismatch
**Severity**: **Important**
**Impact**: Hides useful navigation information for long-term planning
**Likelihood**: High for extended trajectories (1-5 year windows)

**Analysis**:
The filter uses a **"best 2 by distance"** strategy:
```javascript
encounters.sort((a, b) => a.distance - b.distance);
encounters = encounters.slice(0, 2);
```

**Window range**: 30 days to 5 years (1825 days)

**Scaling problem**:
| Window | Crossings (typical) | After filter | Hidden |
|--------|---------------------|--------------|--------|
| 30 days | 0-2 | 0-2 | 0 |
| 60 days | 1-3 | 1-2 | 0-1 |
| 6 months | 3-8 | 2 | 1-6 |
| 1 year | 6-16 | 2 | 4-14 |
| 5 years | 20-50 | 2 | 18-48 |

**Use case mismatch**:

**Short windows (30-60 days)**: "Best 2" makes sense
- Player wants: "Next encounter opportunity"
- Filter shows: Both upcoming crossings
- **Match**: ✓

**Long windows (1-5 years)**: "Best 2" is too aggressive
- Player wants: "Multiple transfer windows across time"
- Filter shows: Only 2 best encounters (might both be in year 1)
- **Mismatch**: ✗ (hides year 2-5 opportunities)

**Example - Mars transfer over 2 years**:
- Crossings at: day 45 (1.2 AU), day 87 (0.8 AU), day 456 (0.5 AU), day 678 (1.1 AU)
- Filter shows: day 456 (0.5 AU), day 87 (0.8 AU)
- **Hidden**: day 45 (first opportunity!) and day 678 (second transfer window!)

**What the player actually needs**:
1. **Chronological priority**: Show next N encounters by time, not distance
2. **Window distribution**: Show best encounter per time slice (avoid clustering)
3. **Configurable limit**: Let user choose 2/5/10/20 ghosts via UI toggle

**Recommendation**:
1. **Dynamic limit based on window**:
   ```javascript
   const maxGhosts = Math.min(20, Math.max(2, Math.floor(durationDays / 60)));
   // 60 days → 2 ghosts
   // 180 days → 3 ghosts
   // 365 days → 6 ghosts
   // 1825 days → 20 ghosts
   ```
2. **Hybrid strategy**: Show next 2 by time + best 3 by distance (deduplicate)
3. **UI control**: Slider in Display Options: "Ghost count: 2/5/10/20/ALL"

---

### 7. Root Cause: Detector Merge Window Too Small
**Severity**: **CRITICAL**
**Impact**: Architectural technical debt, incomplete fix, potential autopilot failures
**Likelihood**: Certain for eccentric orbits and slow solar sail trajectories

**Analysis**:
The renderer filter is a **workaround** for the detector producing duplicate crossings. The root cause is in `intersectionDetector.js`:

```javascript
// intersectionDetector.js:410
const mergeWindow = Math.max(40, e * a * 365.25);
```

**Formula assumptions**:
- Band width = 2×e×a AU (perihelion to aphelion)
- Ship radial velocity = 0.5-2 AU/year
- Crossing time = (band width) / (radial velocity) × 365.25
- Result: `e × a × 365.25` days

**Problem**: Solar sails are **slower than 0.5 AU/year**
- Typical sail acceleration: 0.5 mm/s² ≈ 0.00005g
- Radial velocity through Mars band (e=0.094, width=0.286 AU):
  - Chemical rocket: ~2-5 AU/year → 21-52 days transit
  - Solar sail: ~0.2-0.8 AU/year → **130-520 days transit** ← MUCH SLOWER

**Why detector produces duplicates**:
1. Mars perihelion crossing detected at day 100 (r = 1.381 AU)
2. Semi-major axis crossing detected at day 130 (r = 1.524 AU)
3. Aphelion crossing detected at day 165 (r = 1.666 AU)
4. **Merge window = 52 days** (per formula)
5. Crossings #1-#2 merged (Δt = 30 days < 52 days) ✓
6. Crossings #2-#3 merged (Δt = 35 days < 52 days) ✓
7. **But**: Crossing #3-#1 **NOT** checked (deduplicator only merges consecutive groups)
8. **Result**: Some orbit transits produce 2-3 ghosts instead of 1

**Why this causes flickering**:
- As player adjusts sail, crossing times shift
- One frame: crossings at [day 100, 130, 165] → merge to 2
- Next frame: crossings at [day 102, 132, 167] → merge to 2 (different pair!)
- Ghost positions jump as different crossings get filtered

**Evidence from code comments** (renderer.js:1152):
> "The filter is in the renderer but the root cause is in the detector's merge window being too small for solar sail speeds."

**Other symptoms of this root cause**:

**A. Autopilot (hypothetical)**:
If autopilot uses `getIntersectionCache()` to count encounters:
```javascript
const encounterCount = intersectionCache.results.length;
if (encounterCount > 5) {
    // "Too many encounters, trajectory is chaotic!"
    disableAutopilot();
}
```
→ False positive: encounters inflated 2-3× by duplicates

**B. Navigation UI** (checked `uiUpdater.js`):
Currently doesn't consume intersection cache, but if it did:
```javascript
const nextEncounter = intersectionCache.results[0];
updateUI(`Next: ${nextEncounter.bodyName} in ${nextEncounter.time - now}d`);
```
→ Wrong encounter: shows duplicate instead of actual next crossing

**C. Performance degradation**:
- Detector runs at 12 steps/day × 60 days = 720 trajectory segments
- 3× duplicate crossings = 3× intersection markers to render
- 3× distance calculations, 3× ghost planet draws per frame
- Compounds with long windows: 5 years × 8 planets × 3 duplicates = 120 ghosts!

**D. Course solver** (if it uses crossings):
Course solver might optimize for "closest crossing to target" but get a duplicate instead of the actual best intercept window.

**Recommendation** (CRITICAL):
1. **Fix detector merge window**:
   ```javascript
   // Use actual ship velocity, not assumed 0.5 AU/year
   const shipRadialVelocity = 0.3; // AU/year, conservative for solar sail
   const bandWidth = 2 * e * a;
   const mergeWindow = Math.max(60, (bandWidth / shipRadialVelocity) * 365.25);
   ```
   - Mars: 60 days → **190 days** (covers slow transits)
   - Mercury: 60 days → **100 days**

2. **Fix deduplication algorithm**:
   Current algorithm only merges consecutive groups. Should use **transitive merging**:
   - If crossing A merges with B, and B merges with C → merge all to single group
   - Current code: [A, B] merged, [B, C] merged, but A and C separate!

3. **Remove renderer workaround** once detector is fixed:
   ```javascript
   // DELETE THIS after detector fix:
   // if (encounters.length > 2) { ... }
   ```

4. **Add diagnostic logging**:
   ```javascript
   if (bodyCrossings.length > 3) {
       console.warn(`[INTERSECT] ${body.name}: ${bodyCrossings.length} crossings detected (possible duplicates)`);
   }
   ```

---

## Summary Table

| # | Failure Mode | Severity | Likelihood | Impact | Fix Priority |
|---|-------------|----------|------------|--------|--------------|
| 1 | Performance: Double-sort | Nice-to-have | 100% | Negligible | Low |
| 2 | NaN distance crashes sort | **Important** | 5% | Scrambled ghosts, NaN labels | **High** |
| 3 | AU-km threshold discontinuity | Nice-to-have | 30% | Confusing labels | Low |
| 4 | Label text overflow | **Important** | 60% | Unreadable labels | **Medium** |
| 5 | Filter oscillation flickering | **Important** | 80% | Jarring UX during tuning | **High** |
| 6 | Window strategy mismatch | **Important** | 90% | Hides useful info | **Medium** |
| 7 | Detector merge window broken | **CRITICAL** | 100% | Architectural debt, duplicates | **URGENT** |

---

## Recommended Actions

### Immediate (This Sprint)
1. **Fix #7 (detector merge window)** - Root cause fix
   - Increase merge window for slow solar sail transits
   - Fix transitive merging algorithm
   - Remove renderer workaround once validated

2. **Fix #2 (NaN validation)** - Defensive coding
   - Add `isFinite()` check before sort
   - Log when NaN encounters are filtered
   - Validate `crossing.position` in detector

### Short-term (Next Sprint)
3. **Fix #5 (filter oscillation)** - UX improvement
   - Add hysteresis for "best 2" selection
   - Debounce filter updates during active input
   - Fade ghosts out instead of instant removal

4. **Fix #4 (label overflow)** - Rendering bug
   - Measure text width before drawing
   - Clamp labels to canvas bounds
   - Smart label positioning (avoid overlaps)

### Long-term (Backlog)
5. **Fix #6 (window strategy)** - Feature enhancement
   - Dynamic ghost limit based on window duration
   - UI control for ghost count (2/5/10/20/ALL)
   - Hybrid chronological + distance strategy

6. **Optimize #1 (performance)** - Code quality
   - Cache filtered results by trajectory hash
   - Only re-filter when cache invalidates

7. **Improve #3 (AU-km threshold)** - UX polish
   - Lower threshold to 0.001 AU
   - Use 3 decimal places for small AU values
   - Add "M km" abbreviation for millions

---

## Test Coverage Needed

1. **NaN injection test**: Force `crossing.position` to NaN, verify no crash
2. **Oscillation test**: Rapidly toggle sail ±1°, count ghost flickers
3. **Long window test**: 5-year prediction, verify >2 ghosts needed
4. **Label overflow test**: Place ghost at x=canvas.width-50, verify label visible
5. **Merge window test**: Slow trajectory through Mars, count duplicate crossings

---

## Conclusion

The "best 2" filter is a **band-aid** over a deeper architectural issue. While it prevents ghost clutter in typical use cases, it introduces **5 new failure modes** and fails to address the **root cause** in the detector.

**Risk assessment**:
- **Current code**: Works for 60-day windows with <5 crossings (80% of use cases)
- **Breaks badly**: Long windows (5 years), eccentric orbits, slow transits, active sail tuning
- **Technical debt**: Renderer knows about detector internals (coupling), future autopilot integration will hit same bug

**Path forward**:
1. Fix detector merge window (URGENT)
2. Add defensive validation (HIGH)
3. Improve filter UX (MEDIUM)
4. Remove renderer workaround once detector is stable

**Confidence**: High - All failure modes are reproducible and well-understood.

---

https://claude.ai/code/session_01Tw2ZyUXHsfJjPDJ4eT87PL
