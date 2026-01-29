# Orbit Intersection Display - Implementation Review

**Date:** 2026-01-21
**Plan Version:** `reports/orbit-intersection-implementation-plan-2026-01-21.md`
**Reviewer:** Claude Opus 4.5

---

## 1. Physics/Realism

### Findings

- **Algorithm 1 (Closest Approach Calculation)** is mathematically correct. The plan correctly parameterizes both ship trajectory and body motion by normalized time `s` in [0,1], treats the distance squared as a quadratic function, and finds the minimum by solving the linear derivative equation.
- The formula `s* = -(W.V) / (V.V)` is the standard minimum-distance-on-line solution and is correctly derived.
- The plan correctly identifies that when `V.V = 0` (parallel motion), the bodies maintain constant distance and `s=0` should be used.
- The `orbitalRadius` function is correctly defined as `r = p / (1 + e*cos(nu))` which matches the conic section equation.
- Existing `getPosition()` in `orbital.js` is well-tested and handles both elliptic and hyperbolic orbits correctly.

### Concerns

| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| P1 | Important | **Linear interpolation assumption for body motion**: The plan interpolates body position linearly between segment start/end times (B(s) = B1 + s*(B2-B1)). For bodies with high eccentricity (Mercury e=0.2) or long time steps, this approximation introduces error. Over a 60-day prediction with 200 steps, each segment is ~0.3 days; Mercury moves ~4.8 degrees per day, so linear approximation should be acceptable (<1.5% arc error per segment). | Document this assumption. Consider adaptive refinement for segments where closest approach is found (binary search within segment). |
| P2 | Nice-to-have | **Distance threshold units unclear in spec**: Plan mentions thresholds like "0.1 AU" and "SOI_RADIUS * 2" but doesn't specify what constitutes a meaningful encounter from a gameplay perspective. Current SOI values are enlarged (0.1 AU for all inner planets) rather than realistic. | Clarify that thresholds are gameplay-tuned, not scientifically accurate. |
| P3 | Nice-to-have | **Time offset calculation uses Julian day difference**: The `formatTimeOffset` function computes days as `futureTime - currentTime`. This is correct since both are Julian dates and the difference is in days. | No action needed, but add JSDoc clarifying units. |

---

## 2. Functionality

### Findings

- The plan correctly identifies the core problem: trajectory and planetary orbits are rendered at different time references, making it impossible to assess encounter timing.
- The solution provides both visual (ghost planets) and textual (time labels) feedback, addressing multiple player learning styles.
- The display toggle follows the existing pattern exactly (`showOrbits`, `showLabels`, etc.) for consistency.
- Cache invalidation logic mirrors the trajectory predictor cache pattern (500ms TTL, hash-based), which is proven to work.
- The parent toggle relationship (`showIntersectionMarkers` requires `showOrbits`) correctly prevents orphan UI elements.

### Concerns

| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| F1 | Critical | **Missing hash field in cache key**: The plan's hash function includes `trajectory.length` but not the actual trajectory positions. If trajectory shape changes without length change (e.g., sail angle adjustment producing same-length but different-path trajectory), stale intersections would be displayed. | Use the trajectory predictor's hash directly or include trajectory endpoint positions in the hash. |
| F2 | Important | **No handling for destination vs. non-destination bodies**: The plan shows intersections for ALL celestial bodies equally. Players likely care most about their destination planet. | Consider highlighting destination intersections differently (brighter, larger, or labeled "TARGET"). |
| F3 | Important | **No negative time offset handling**: If game time advances past an intersection event (player passed the encounter point), `formatTimeOffset` would return a positive string even though the event is in the past. | Add check for `deltaDays < 0` and display "-Xd" or remove stale intersections from display. |
| F4 | Important | **SOI state handling during intersection**: When player is inside planetary SOI, the trajectory is planetocentric. Intersections with OTHER planets would need heliocentric conversion. The plan mentions "Handle SOI offset correctly" but doesn't detail the algorithm. | Clarify: when in SOI, only show intersections with current parent body, skip cross-body intersections. |
| F5 | Nice-to-have | **No intersection sorting for label overlap prevention**: Multiple intersection labels at similar screen positions could overlap. | Consider z-ordering labels or using collision detection for label placement. |

---

## 3. Architecture

### Findings

- The plan correctly follows the existing architecture pattern: `lib/` for pure computation, `core/` for state/cache, `ui/` for rendering.
- Module dependency flow (`data/ -> lib/ -> core/ -> ui/`) is respected.
- The new module `intersectionDetector.js` follows the same pattern as `trajectory-predictor.js` (pure functions, no state).
- Cache management in `gameState.js` follows the established pattern with hash validation and TTL.
- The test file pattern (`intersectionDetector.test.js`) mirrors `trajectory-predictor.test.js` exactly.

### Concerns

| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| A1 | Important | **Redundant body position calculation**: Unit 2 calls `getPosition(body.elements, p1.time)` for every body at every trajectory segment. With 200 segments and 9 bodies, this is 3600 getPosition calls per intersection detection. The trajectory predictor already has body-independent positions at each time. | Consider pre-computing body positions at all trajectory timestamps once, then reusing for closest-approach checks. |
| A2 | Important | **Cache integration point unclear**: Unit 6 integrates with `main.js` in `updatePositions()`. However, the trajectory predictor cache is managed separately in `trajectory-predictor.js`. The plan creates a second, independent cache in `gameState.js`. | Consider whether intersection cache should invalidate when trajectory cache invalidates (they should be tightly coupled). |
| A3 | Nice-to-have | **Vector math utilities are duplicated**: `dot3D`, `subtract3D`, etc. are defined in the new module. `orbital.js` has similar math (implicit in rotation matrices). | Consider extracting common vector utilities to `lib/vector.js` for reuse, or document that duplication is intentional for module independence. |
| A4 | Nice-to-have | **Missing import in Unit 7**: The code references `getPlayerShip()` and `getCelestialBodies()` but the import statements shown in Unit 7 don't include them. | Ensure all imports are documented in the implementation. |

---

## 4. Failure Modes

### Findings

- Edge case handling is well-documented (Unit 9 specifically addresses 6 edge cases).
- The plan correctly identifies `V.V = 0` as a degenerate case and handles it.
- Position validation with `isFinite()` check matches the pattern in `orbital.js`.
- Off-screen marker culling prevents wasted render cycles.
- The 20-marker limit prevents visual clutter and performance issues.

### Concerns

| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| FM1 | Critical | **Race condition between trajectory and intersection updates**: If trajectory predictor cache updates mid-frame while intersection detector is iterating over old trajectory, array indices could be invalid or positions stale. | Ensure trajectory reference is captured once at start of intersection detection, not re-fetched during iteration. |
| FM2 | Important | **Performance timeout not implemented**: The plan mentions "If calculation exceeds 10ms, cache partial results" in Design Principles but Unit 2 implementation doesn't include this safeguard. | Add `performance.now()` check inside the detection loop with early exit and partial result caching. |
| FM3 | Important | **Hyperbolic trajectory extends beyond max distance**: When trajectory is truncated at 10 AU due to `MAX_HELIOCENTRIC_RADIUS`, any intersections beyond that point are missed. Player flying toward Jupiter might not see the encounter marker. | Either extend max radius for intersection detection only, or warn player that trajectory is truncated. |
| FM4 | Important | **NaN propagation from closest approach**: If `calculateClosestApproach` returns NaN (e.g., from sqrt of negative due to floating point error), this NaN would propagate to render coordinates and cause invisible markers. | Add explicit NaN check on `approach.distance` before pushing to intersections array. |
| FM5 | Nice-to-have | **Console spam from performance warnings**: The plan warns to console if detection exceeds 5ms. On slower devices, this could produce console spam every frame. | Use throttled logging (once per 60 frames) or console.warn group. |
| FM6 | Nice-to-have | **Ghost planet depth ordering**: Ghost planets are rendered after trajectory but before solid bodies. If a ghost overlaps with its current-time solid counterpart at different z-depths, visual confusion could result. | Consider rendering ghosts with depth test or always render behind solid bodies. |

---

## 5. Summary

### Confidence Rating: 7/10

The plan is solid and well-structured, following established patterns in the codebase. The core algorithm is mathematically correct and the architecture is clean. However, there are several important issues that should be addressed before implementation to prevent bugs and performance problems.

### Critical Issues (Must Fix)

1. **F1 - Cache hash doesn't include trajectory shape**: This will cause stale intersection data when sail settings change without affecting trajectory length.
2. **FM1 - Race condition between caches**: Trajectory and intersection caches are independent but tightly coupled logically. A mid-frame update could cause index errors.

### Important Issues (Should Fix)

1. **F3 - No negative time handling**: Past intersections would display confusing positive offsets.
2. **F4 - SOI coordinate transformation unclear**: Cross-body intersections while in SOI need coordinate system conversion.
3. **A1 - Redundant position calculations**: 3600 `getPosition` calls per detection is inefficient when positions could be pre-computed.
4. **A2 - Cache coupling unclear**: Intersection cache should invalidate when trajectory cache invalidates.
5. **FM2 - Performance timeout not implemented**: Plan mentions it but code doesn't include it.
6. **FM3 - Truncated trajectory misses distant encounters**: Jupiter encounter could be missed due to 10 AU limit.
7. **FM4 - NaN propagation**: Missing explicit NaN check could cause invisible markers.

### Recommendations

1. Use trajectory predictor's cache hash directly for intersection cache key, or derive intersection hash from trajectory hash.
2. Capture trajectory reference at start of detection, don't re-fetch during iteration.
3. Pre-compute body positions at trajectory timestamps before running closest-approach checks.
4. Add explicit `deltaDays < 0` check to filter or label past intersections.
5. For SOI mode, only show intersections with current parent body (skip cross-body intersections).
6. Implement the performance timeout mentioned in design principles.
7. Add NaN guard after `calculateClosestApproach` return.

### Verdict

**[X] Approved with conditions**

The plan may proceed to implementation after addressing critical issues F1 and FM1. Important issues should be resolved during implementation sessions or documented as known limitations.

---

## End of Review Report
