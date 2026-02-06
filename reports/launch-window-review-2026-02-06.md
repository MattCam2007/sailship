# Launch Window Analysis Review

**Date:** 2026-02-06
**Plan Version:** `reports/launch-window-implementation-plan-2026-02-06.md`
**Spec Version:** `reports/launch-window-spec-2026-02-06.md`
**Reviewer:** Four-perspective review (Physicist, Architect, Functional Tester, Failure Analyst)

---

## 1. Physics/Realism

### Findings

- **Keplerian coast model is physically correct.** At 0% sail deployment, the ship experiences no thrust and follows an unperturbed Keplerian orbit. The orbital elements remain constant; only the mean anomaly advances with time. Passing a future Julian date to `getPosition(elements, futureJD)` correctly computes the ship's coasted position. No separate "coast simulation" is needed. This is the right physics.

- **Solar sail thrust model is correctly delegated.** The plan makes no attempt to model thrust independently -- all trajectory simulation flows through `evaluateCandidate()`, which uses the existing Gauss variational equations via `calculateSailThrust()` and `applyThrust()`. This preserves the continuous low-thrust physics that are fundamental to solar sails. Hohmann transfers are correctly identified as inapplicable.

- **The 1-line change is physically sound.** Changing `const startTime = getJulianDate()` to `const startTime = options.startJulianDate || getJulianDate()` shifts the simulation origin in time. Since the ship's orbital elements are cloned at the start of `evaluateCandidate()`, the simulation begins from the ship's Keplerian position at the specified future date and applies thrust from that point forward. The target planet's position is also correctly computed at each simulation timestep relative to this new start time. The physics chain is: coast (implicit via future JD) then thrust (explicit via simulation). This is correct.

- **Strategy coverage of 25 configurations is reasonable.** The yaw range [-55, +55] with pitch variations at key yaws covers the main thrust geometries for a solar sail: orbit raising (~35 deg), lowering (~-35 deg), steep maneuvers (~55 deg), and inclination changes (pitch != 0). This is denser than the NAV_STRATEGIES set (10 configs) and sparser than the coarse sweep (91 configs, at 5 deg steps). For a Phase 1 scan intended to identify windows rather than optimize, 25 is a good balance.

- **Departure date spacing is underspecified.** The plan says "~37 departure dates" but does not define the range or interval. For inner planets (Venus, Mars), a 2-year scan with 20-day intervals gives ~37 dates. For outer planets, longer scans may be needed. The physics of synodic periods should inform the scan range: Earth-Mars synodic period is ~780 days, Earth-Venus is ~584 days, Earth-Jupiter is ~399 days. A 2-year scan covers at least one full synodic period for all major targets.

- **Dynamic step calculation is inherited correctly.** `evaluateCandidate()` computes steps dynamically: `min(maxSteps, max(minSteps, days * stepsPerDay))`. With `stepsPerDay = 12` (from shared INTERSECTION_CONFIG), a 365-day simulation uses ~4380 steps, giving ~2-hour intervals. This is adequate for solar sail thrust integration accuracy.

### Concerns

| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| P1 | Important | **Ship orbital elements not snapshoted at computation start.** During async computation (2-30 seconds), the game loop continues advancing the ship. Each call to `evaluateCandidate(yaw, pitch, ship, target, options)` clones `ship.orbitalElements` at invocation time. If time warp is high, the ship's elements drift between evaluations, meaning earlier departure dates are evaluated with slightly different initial conditions than later ones. This introduces inconsistency in window comparison. | Snapshot `ship.orbitalElements` into a frozen copy at computation start in `computeLaunchWindows()`. Pass this snapshot (as a synthetic ship object) to all `evaluateCandidate()` calls. The existing course solver has this same latent issue but it's more impactful here because launch window scans evaluate across a wide range of departure dates where initial condition consistency matters more. |
| P2 | Nice-to-have | **Strategy set lacks pure pitch-only configurations at larger yaws.** The set includes pitch variations at yaw=0 and yaw=35, but no pitch-only configs at yaw=-35 (lowering + inclination change). For destinations with significant inclination differences (e.g., Pluto, Ceres), lowering orbit while changing inclination may be optimal. | Consider adding 2-3 strategies: yaw=-35 with pitch=+/-30. This increases the set to ~28 without meaningful performance cost. |
| P3 | Nice-to-have | **Synodic period awareness could improve scan efficiency.** The plan does not mention tailoring the scan range or density to the target's synodic period with respect to the ship's current orbit. Near-optimal windows tend to cluster around specific phase angles that repeat at the synodic period. | For Phase 1, this is not critical since the brute-force scan is already fast (~2-3s). Could be a future optimization for outer planets where wider scan ranges are needed. |

### Domain Confidence: 9/10

### Key Validation Points
- Keplerian coast physics validated: constant orbital elements + advanced Julian date = correct coasted position
- Solar sail continuous thrust correctly delegated to existing Gauss variational equation stack
- No Hohmann transfer assumptions present -- plan correctly treats this as a continuous thrust problem
- Dynamic step calculation inherited from shared config ensures adequate integration resolution
- The `startJulianDate` parameterization preserves all existing crossing-aware evaluation logic (radius crossing detection, phase constraint, SOI-based intercept thresholds)

---

## 2. Functionality

### Findings

- **Feature achieves its stated goal.** The plan enables players to answer "should I coast before departing?" by comparing trajectories from multiple future departure dates. The two-phase scan-then-verify approach finds windows quickly (Phase 1) then refines them precisely (Phase 2). The "depart now" baseline comparison gives the player immediate context.

- **The zero-code-duplication approach is validated.** Every trajectory evaluation goes through `evaluateCandidate()` in course-solver.js. The new `launch-window.js` module is a pure consumer of this existing function. This means all existing physics, crossing detection, phase constraints, SOI thresholds, and status classification are automatically available to launch window analysis. No risk of physics divergence.

- **Data flow is clear and testable.** User click -> `computeLaunchWindows()` -> `findLaunchWindows()` -> Phase 1 (scan) -> Phase 2 (verify) -> display results. Each stage has a well-defined input/output contract. The `findLaunchWindows()` orchestrator can be tested in isolation with mock ship/target data.

- **SOI guard has defense in depth.** Three layers: (1) `launch-window.js` returns error result if ship is in SOI, (2) `navigation.js` returns null with console warning, (3) button disabled in controls.js with tooltip. This is thorough.

- **Progress reporting follows established patterns.** The plan uses the same async/yield/progress callback pattern as `computeOptimalCourse()` and `solveCourse()`. Users see real-time progress updates during the 20-30 second computation.

- **Cache invalidation is handled.** Cache clears on destination change, matching the existing `optimalCourseCache` pattern.

### Concerns

| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| F1 | Important | **Departure date range and interval are not specified.** The plan says "~37 departure dates" but does not define the scan range (e.g., 0 to 730 days) or interval (e.g., every 20 days). These parameters critically affect whether windows are found. For Mars, a 20-day interval over 2 years catches the broad windows. For Jupiter, the same interval over 2 years may be too sparse to catch the narrower optimal windows at that distance. | Define explicitly in the plan: scan range = `[0, maxScanDays]` where `maxScanDays` defaults to 730 (2 years) for inner planets and 1095 (3 years) for outer planets. Interval = `maxScanDays / 36` (giving ~37 points). These should be configurable in the options object. |
| F2 | Important | **Window grouping algorithm is not specified.** The plan says "Group consecutive departures that achieve intercept/near-miss into windows. Report the best departure within each window." But it doesn't define what "consecutive" means -- is a 20-day gap between two intercept-finding departure dates still "consecutive"? How is the grouping threshold determined? | Specify: a window is a set of consecutive scan dates (within 2x interval spacing) where any strategy achieves intercept or near-miss status. The best date within each window is the one with the lowest `minDistance`. Non-consecutive dates start new windows. |
| F3 | Important | **Concurrent execution with PLOT COURSE is underspecified.** The plan says "separate computation guard" but does not clarify whether FIND WINDOWS and PLOT COURSE can run simultaneously. Both call `evaluateCandidate()` (which is stateless and safe for concurrency), but the UI has only one progress area in each section. The real concern is user confusion, not technical conflict. | Specify: FIND WINDOWS and PLOT COURSE have independent computation guards. They CAN run simultaneously (no shared mutable state). If PLOT COURSE is running when FIND WINDOWS is clicked, show a warning but allow it. Document this in the UI interaction design. |
| F4 | Nice-to-have | **No explicit handling of destination change during computation.** If the player changes destination while a launch window scan is running, the computation continues for the old destination. The cache will be invalidated when results arrive (destination mismatch). But the player sees a progress bar for a stale computation. | Add a check at each yield point: if destination has changed, abort computation early and return null. This matches the user's intent. |
| F5 | Nice-to-have | **Verification phase horizon selection not specified for outer planets.** Phase 2 runs "full coarse sweep (91-point grid)" via `coarseSweep()`. But `coarseSweep` uses `options.maxDays` which defaults to 365. For Jupiter+ transfers, the horizon needs to be much longer (1000+ days). | Pass the horizon from Phase 1's best result (or a target-appropriate default) as `maxDays` in the Phase 2 options. |

### Domain Confidence: 8/10

### Coverage Analysis
- Core logic test coverage: Unit 7 plans console tests for `scanLaunchWindows()`, `verifyTopWindows()`, SOI guard, and edge cases. Good coverage of the new module.
- Code paths analyzed: Happy path (windows found), no-windows path, SOI guard path, concurrent execution path.
- Missing tests: No planned test for concurrent execution with course solver. No test for destination change during computation. No test for time warp effects during computation.

---

## 3. Architecture

### Findings

- **Zero code duplication is the strongest architectural decision in this plan.** By parameterizing `evaluateCandidate()` with a single `startJulianDate` option rather than creating a parallel simulation pipeline, the plan eliminates the most common source of bugs in trajectory analysis: physics divergence between two implementations. Every improvement to `evaluateCandidate()` (better crossing detection, SOI thresholds, dynamic resolution) automatically benefits launch window analysis. This is textbook good architecture.

- **Module placement follows project conventions.** `launch-window.js` in `lib/` (computation library), orchestration in `core/navigation.js`, UI interaction in `ui/controls.js`. The dependency flow is clean: `lib/ -> lib/` (launch-window imports course-solver), `core/ -> lib/` (navigation imports launch-window), `ui/ -> core/` (controls imports navigation). No violations.

- **The new module is stateless.** `launch-window.js` exports pure functions with no module-level state. All state (cache, computation guard, progress) lives in `navigation.js` where it belongs. This makes the computation functions easy to test and reason about.

- **Pattern consistency is maintained.** `computeLaunchWindows()` follows the exact pattern of `computeOptimalCourse()`: cache check, concurrent guard, async computation with progress callback, result storage. A developer familiar with one will immediately understand the other.

- **Named exports with `.js` extensions** are used throughout, matching the project's import conventions.

### Concerns

| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| A1 | Important | **Display logic placement ambiguity.** The File Impact Summary says `uiUpdater.js` handles "Cache DOM elements, display launch window results." But Unit 6 places `displayLaunchWindowResults()` inside `controls.js` within `initLaunchWindowFinder`. This contradicts the file impact list. The existing course plotter pattern puts display logic in controls.js (inside `initCoursePlotter`), so Unit 6's approach is pattern-consistent. | Clarify in the plan: `uiUpdater.js` caches DOM element references only (matching its existing role for course plotter elements). Display logic lives in `controls.js` within `initLaunchWindowFinder`, consistent with the `initCoursePlotter` pattern. Update the File Impact Summary to reflect this. |
| A2 | Nice-to-have | **launch-window.js imports both `evaluateCandidate` and `coarseSweep` from course-solver.js.** This creates coupling to two exported functions rather than one. If `coarseSweep` changes its signature or behavior, launch-window.js must adapt. However, both are stable, well-documented APIs that have been unchanged through multiple course-solver versions (v3.0 through v3.7). The coupling is acceptable given the zero-duplication benefit. | Document in launch-window.js that it depends on `evaluateCandidate` and `coarseSweep` from course-solver.js. If these APIs change, launch-window.js must be updated. |
| A3 | Nice-to-have | **Configuration constants (scan range, interval, strategy set) are defined in launch-window.js.** The project has a central `config.js` for tunable parameters. Some launch window parameters (scan range, max windows to verify) could live there for consistency. | Consider whether scan range and strategy count should be in `config.js`. The existing course-solver keeps its CONFIG object internal, so keeping launch window config internal is also consistent. Either approach is fine. |

### Domain Confidence: 9/10

### Pattern Analysis
- Game loop pattern: Not directly involved (launch window is triggered by button click, not per-frame). Correct.
- Dependency flow: Clean. `lib/ -> lib/`, `core/ -> lib/`, `ui/ -> core/`. No violations.
- Module structure: One concept per file (launch-window.js = launch window computation). Good.
- Code duplication: Zero. All simulation through existing `evaluateCandidate()`. Excellent.

---

## 4. Failure Modes

### Findings

- **The async computation model is the primary failure surface.** The 20-30 second computation runs asynchronously while the game loop continues. Ship position advances, Julian date advances, and the player can interact with UI. The plan addresses the Julian date drift with "Snapshot Julian date at computation start" but the ship orbital elements drift issue (P1) remains.

- **`evaluateCandidate()` has robust internal guards.** It validates inputs (returns INVALID status on bad data), guards against non-finite positions (`if (!isFinite(shipPos.x))` break), guards against too-close-to-sun (`if (distFromSun < 0.02)` break), and validates new orbital elements after each thrust step. These guards protect against numerical instability in the launch window context as well.

- **The `||` fallback in `options.startJulianDate || getJulianDate()` is safe for Julian dates.** Julian dates are always large positive numbers (~2451545+). The only falsy Julian date would be 0, which is not a valid astronomical date (4713 BC). The fallback correctly handles `undefined`, `null`, and missing values.

- **Memory usage is bounded.** Phase 1 creates ~925 trajectory arrays (37 dates x 25 strategies). Each trajectory has `min(6000, max(500, days * 12))` points. For a 365-day simulation, that's ~4380 points per trajectory. At ~32 bytes per point (x, y, z, time as doubles), that's ~140KB per trajectory. 925 trajectories would be ~130MB if all held simultaneously. BUT `evaluateCandidate()` is synchronous -- each trajectory is created, evaluated, and discarded before the next. Only the result object (~200 bytes) is retained. Peak memory is one trajectory (~140KB) + results array (~200KB). This is safe.

- **The options object is passed by reference through the call chain.** `coarseSweep(ship, target, options)` passes `options` to `evaluateCandidate(yaw, pitch, ship, target, options)`. If `launch-window.js` sets `startJulianDate` on the options object and then passes it to `coarseSweep`, all evaluations within that sweep will use the same `startJulianDate`. This is correct behavior. But if the caller mutates `options.startJulianDate` between calls, intermediate state could leak. Since the plan creates fresh option objects per departure date, this should not be an issue.

### Concerns

| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| FM1 | Important | **Time warp during computation causes inconsistent results.** At high time warp (1,000,000x+), the game advances ~11.6 days per real second. During a 3-second Phase 1 scan, the game advances ~35 days. The Julian date snapshot protects against this, but the ship's orbital elements (modified by thrust each frame in the game loop) change during computation. Early evaluations use orbital elements from time T, while late evaluations use elements from time T+35d. This creates an apples-to-oranges comparison between departure dates. | Same mitigation as P1: snapshot ship orbital elements at computation start. Alternatively, pause time warp during computation (simpler but changes gameplay). The snapshot approach is preferred. |
| FM2 | Important | **No timeout for launch window computation.** The existing course solver has `maxSolveTimeMs: 90000` (90 seconds). The launch window computation calls `evaluateCandidate()` and `coarseSweep()` which inherit this timeout. However, the overall `findLaunchWindows()` orchestrator has no top-level timeout. If Phase 1 takes longer than expected (edge case: very slow machine, many strategies), the computation could run for minutes without the user being able to cancel. | Add a top-level timeout to `findLaunchWindows()` (e.g., 120 seconds). Check elapsed time at each yield point and abort if exceeded. Return partial results if available. |
| FM3 | Important | **Phase 2 verification could fail silently for outer planets.** Phase 2 calls `coarseSweep()` with options that may default to `maxDays: 365`. For Jupiter+ targets, the optimal transfer duration could be 1000+ days. If Phase 2 uses a 365-day horizon, it may not find the intercept that Phase 1 found (Phase 1 likely used a longer horizon). The verification would report worse results than the scan, confusing the player. | Ensure Phase 2 passes the horizon from Phase 1's best result as `maxDays` in options. This is also noted as F5. |
| FM4 | Nice-to-have | **Display of NaN/Infinity not guarded.** If `evaluateCandidate()` returns `minDistance: Infinity` (no crossings found) or `timeToClosest: NaN` (edge case), the display function `displayLaunchWindowResults()` could show "Infinity AU" or "NaN days" to the player. | Add display guards: check `isFinite()` on distance and time values before formatting. Show "N/A" or "---" for invalid values. |
| FM5 | Nice-to-have | **No cancellation mechanism.** Once the user clicks FIND WINDOWS, there's no way to cancel the 20-30 second computation. The button shows "SCANNING..." but is disabled. If the user wants to change destination mid-scan, they have to wait. | Add an abort mechanism: clicking the button during computation cancels it (set a flag checked at yield points). This matches UX patterns for long-running operations. Low priority since the existing PLOT COURSE also lacks cancellation. |
| FM6 | Nice-to-have | **SOI entry during computation.** If the ship enters a planet's SOI during the async computation (e.g., approaching destination at high time warp), the results become invalid because the ship's orbital reference frame changes. The SOI guard only checks at computation start. | Add a check at yield points: if `getPlayerShip().soiState?.isInSOI` has changed since computation started, abort and return null with a warning. |

### Domain Confidence: 8/10

### Risk Matrix

| Risk Category | Level | Key Concerns |
|---------------|-------|--------------|
| Numerical Stability | Low | Inherits all guards from `evaluateCandidate()`. No new numerical code. |
| Performance | Low-Medium | ~925 evaluations in Phase 1 (~3s), Phase 2 could be 15-25s. Total under 30s. Memory bounded. |
| Player Experience | Medium | Long computation without cancellation. Potential confusion if concurrent with PLOT COURSE. Time warp drift during computation. |
| State Corruption | Low | No global state mutation. Separate computation guard from course solver. Options passed by value semantics. |

---

## 5. Summary

### Confidence Rating: 8/10

This is a well-designed plan with a strong central architectural decision (zero code duplication via `evaluateCandidate()` parameterization). The physics are correct, the module structure is clean, and the existing codebase provides robust infrastructure that the new feature inherits automatically. The main gaps are operational: underspecified scan parameters, ship state drift during async computation, and missing timeout/cancellation mechanisms.

### Critical Issues (Must Fix)

None. There are no critical issues that would block implementation.

### Important Issues (Should Fix)

1. **P1/FM1: Snapshot ship orbital elements at computation start.** The ship's orbital elements change during the 2-30 second async computation due to the game loop applying thrust. This creates inconsistent comparisons between departure dates. Fix: capture `{ ...ship.orbitalElements }` at computation start and pass a synthetic ship object to all evaluations.

2. **F1: Define departure date scan range and interval explicitly.** The plan says "~37 departure dates" without specifying the range or interval. These are critical parameters that determine whether windows are found. Define: range = 0 to 730 days (inner) or 1095 days (outer), interval = range/36.

3. **F2: Define window grouping algorithm.** "Group consecutive departures" needs a precise definition to implement correctly. Define: consecutive = within 2x interval spacing, best = lowest minDistance within group.

4. **A1: Clarify display logic placement.** File Impact Summary conflicts with Unit 6. Resolve: display logic in controls.js (matching course plotter pattern), DOM caching in uiUpdater.js.

5. **FM2: Add top-level computation timeout.** Without a timeout, edge cases could leave the computation running indefinitely. Add 120-second timeout with partial result return.

6. **F5/FM3: Pass appropriate horizon to Phase 2 verification.** Phase 2 must use the horizon that Phase 1 found successful, not the default 365 days. Critical for outer planet targets.

### Recommendations

1. **Address P1/FM1 first during implementation.** The ship orbital elements snapshot is the most impactful fix and should be incorporated into Unit 2 or Unit 3. It requires creating a frozen copy of the ship object at computation start.

2. **Define scan parameters as configurable constants in Unit 2.** The scan range, interval, and strategy set should be clearly defined constants at the top of `launch-window.js`, similar to how `course-solver.js` has its `CONFIG` object.

3. **Consider adding F4 (early abort on destination change) during implementation.** It's low effort (check at yield points) and significantly improves UX.

4. **The 1-line change to `evaluateCandidate()` (Unit 1) is validated and safe.** Proceed with confidence. The `||` fallback handles all edge cases correctly for Julian date values.

5. **Test with both inner planets (Venus, Mars) and outer planets (Jupiter) early.** The Phase 2 horizon issue (FM3) will only surface with outer planet targets. Catching it during Unit 2 development is much cheaper than finding it during Unit 6 integration.

### Verdict

- [ ] Approved
- [x] Approved with conditions
- [ ] Requires revision

**Conditions for approval:**
1. Address P1/FM1 (ship orbital elements snapshot) in Unit 2 or Unit 3
2. Define explicit scan parameters (F1) before implementing Unit 2
3. Define window grouping algorithm (F2) before implementing Unit 2
4. Resolve display logic placement ambiguity (A1) before implementing Units 5-6
5. Ensure Phase 2 uses appropriate horizon for outer planets (F5/FM3) in Unit 2

All conditions are straightforward additions to the existing plan and do not require architectural rethinking. The core design is sound.
