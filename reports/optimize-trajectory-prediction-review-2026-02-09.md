# Optimize Trajectory Prediction — Review

**Date:** 2026-02-09
**Plan Version:** `reports/optimize-trajectory-prediction-implementation-plan-2026-02-09.md`

## 1. Physics/Realism

### Findings
- No physics calculations are being changed. All units preserve trajectory output bit-for-bit.
- The numeric hash (Unit 1) uses the same rounding logic, just a different serialization.
- Pre-computed body positions (Unit 5) are identical to the current per-segment computation.

### Concerns
| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| P1 | Nice-to-have | Hash collision in numeric hash could theoretically cause a cache hit for different inputs, returning a stale trajectory | Use a well-distributed hash function with 53-bit range (JS safe integer). Risk is negligible in practice. |

## 2. Solar Sailing Expert

### Findings
- No changes to thrust calculations, sail physics, or trajectory integration.
- The throttle (Unit 3) delays *display* of updated trajectories, not the physics simulation itself. Ship physics still runs every frame.
- Solar sail trajectory prediction accuracy is unchanged — same RK2 integration, same step count, same thrust model.

### Concerns
| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| SS1 | Nice-to-have | At high warp with 200ms throttle, ghost planet positions may lag by up to 200ms of real time. At 1M x warp, this represents ~48 game-hours of stale data. | Acceptable for visualization. Ghost planets are planning aids, not precision instruments. |

## 3. Functionality

### Findings
- Unit 1 (hash): Direct replacement, same cache semantics.
- Unit 2 (console.log): Pure removal of debug output, no functional change.
- Unit 3 (throttle): Introduces a delay between recomputations. The stale data path is already handled — the game already uses cached results between invalidations.
- Unit 4 (stagger): Cache clearing order doesn't matter since each cache rebuilds independently on next access.
- Unit 5 (pre-compute): Same algorithm, same results, fewer redundant calls.
- Unit 6 (debounce): rAF-based approach guarantees the final value is always applied.
- Unit 7 (dirty flags): Standard optimization pattern. Risk is skipping a needed update.

### Concerns
| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| F1 | Important | Unit 7 dirty flags must correctly detect first render (no previous values cached yet) | Initialize previous values to a sentinel that never matches, forcing first-frame update |
| F2 | Important | Unit 6 debounce must not prevent the final slider value from being applied when user releases the slider | Use rAF + apply on 'change' event as fallback |

## 4. Architecture

### Findings
- All changes are in-place modifications to existing files. No new modules, no new abstractions.
- The throttle mechanism (Unit 3) adds a timestamp variable and a conditional — minimal complexity.
- Pre-computed positions (Unit 5) use a simple Map lookup table — appropriate for the data structure.
- Dirty flags (Unit 7) add per-value comparison — standard DOM optimization pattern.

### Concerns
| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| A1 | Nice-to-have | The throttle constant (200ms) is a magic number in main.js | Define as a named constant at module scope |

## 5. Failure Modes

### Findings
- Unit 1: FNV-1a style hash has well-studied distribution properties. 53-bit JS integer range gives ~9e15 distinct values — collision probability negligible for this use case.
- Unit 3: If throttle prevents updates entirely, ghost planets freeze. Mitigated by using 200ms (still 5 updates/sec).
- Unit 5: Pre-computed array grows linearly with trajectory length. At max 8,760 steps x 8 bodies x 3 coords = ~210K numbers = ~1.7MB. Acceptable.
- Unit 7: If dirty flag comparison has a bug, a display could show stale values. Mitigated by explicit per-field comparison.

### Concerns
| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| FM1 | Important | Numeric hash: NaN or Infinity in orbital elements would produce NaN hash, which !== any cached hash, so cache would miss every frame | Already handled — trajectory-predictor.js:158-163 validates elements before hashing |
| FM2 | Nice-to-have | If someone extends the hash inputs without updating the numeric hash function, cache could hit incorrectly | Add a comment noting all fields must be included |

## 6. Best Practices

### Compliance Summary
| Category | Status | Notes |
|----------|--------|-------|
| Imports | Compliant | No new imports needed |
| Naming | Compliant | camelCase functions, UPPER_SNAKE constants |
| Code Style | Compliant | Minimal changes, no new abstractions |
| Architecture | Compliant | One concept per file maintained |

### Violations
None anticipated.

## 7. Regression Risk

### Impact Analysis
- Files changed: 5 (trajectory-predictor.js, main.js, controls.js, uiUpdater.js, intersectionDetector.js)
- Features affected: Predicted trajectory display, encounter markers, sail controls, UI panels
- Shared modules touched: trajectory cache, intersection cache

### Risk Assessment
| Existing Feature | Risk Level | Rationale |
|------------------|------------|-----------|
| Predicted trajectory display | Low | Cache semantics unchanged, just faster hashing |
| Encounter markers (ghost planets) | Low | Same detection algorithm, throttled refresh |
| Sail controls | Low | Debouncing preserves final values |
| Orbit display | None | Not touched |
| Star map | None | Not touched |
| Ship physics | None | Not touched |
| Autopilot | None | Not touched |
| SOI transitions | None | Not touched |

### Recommended Regression Tests
- [ ] Trajectory predictor test suite
- [ ] Intersection detector crossing test suite
- [ ] Manual: drag sail sliders, verify trajectory updates
- [ ] Manual: change speed to 1M x, verify smooth framerate
- [ ] Manual: verify ghost planets update at encounter markers

## 8. Summary

### Confidence Rating: 9/10

All changes are performance optimizations that preserve existing behavior. No physics, no new features, no API changes. Each unit is independently reversible.

### Critical Issues (Must Fix)
None.

### Important Issues (Should Fix)
1. F1: Dirty flag initialization must handle first render correctly
2. F2: Slider debounce must apply final value on release

### Recommendations
1. Implement units in order (1-7) — each is independent but earlier units are simpler
2. Run console test suites after Units 1 and 5 (the algorithm-touching units)
3. Manual frame timing check after Unit 3 (the throttle)

### Verdict
[x] Approved
