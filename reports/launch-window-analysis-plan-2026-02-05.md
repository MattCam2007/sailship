# Launch Window Analysis -- Implementation Options Report

**Date:** 2026-02-05
**Status:** Reviewed (6 perspectives, iterated)
**Feature:** Find ideal launch window (coast at 0% deployment, then depart)

---

## Executive Summary

The player furls sails (0% deployment), coasts on their current Keplerian orbit, and the system calculates when the best time to unfurl and begin a transfer to a target planet would be. Core question: **"If we coast for 6 months, can we save 1.5 years?"**

Five implementation options were designed and reviewed by all six project reviewers (Physicist, Architect, Functional Tester, Failure Analyst, Regression Checker, Best Practices). Each option was iterated based on cross-reviewer feedback. This report presents the final state of each option with consolidated findings.

---

## Cross-Cutting Prerequisites (All Options)

All reviewers identified these shared requirements regardless of which option is chosen:

### P0: `getJulianDate()` Parameterization
**Severity: CRITICAL (affects Options B, C, D, E)**

`simulateWithStrategy()` (navigation.js:309) and `evaluateCandidate()` (course-solver.js:433) both hardcode `const startTime = getJulianDate()`. Any option that evaluates trajectories from future departure dates must refactor these to accept an optional `startJulianDate` parameter with fallback to `getJulianDate()`. This is a one-line change per function but affects the core simulation pipeline.

### P1: SOI Guard
**Severity: CRITICAL (affects all options)**

When the ship is inside a planetary SOI, orbital elements are planetocentric, not heliocentric. All five options assume heliocentric elements. A guard must check `ship.soiState?.isInSOI` and either:
- Convert to heliocentric elements for analysis, or
- Display "Exit SOI before analyzing launch windows"

### P2: Hohmann Transfer Inapplicability
**Severity: CRITICAL (affects Options A, D)**

The Physicist reviewer identified that Hohmann transfer phase angles do NOT apply to solar sail continuous-thrust spiral transfers. The optimal departure geometry for a solar sail is fundamentally different from an impulsive two-burn Hohmann ellipse. Options A and D must not use Hohmann phase angles as primary output; they may use synodic period geometry for window *spacing* but not window *quality*.

### P3: State Snapshot
**Severity: IMPORTANT (affects Options B, C, D, E)**

Async computations must snapshot `julianDate` and `orbitalElements` at computation start. If the player adjusts time warp during analysis, the global `julianDate` drifts, corrupting results.

---

## Option A: Phase Angle Coast Timer

### Concept
Calculate the synodic period between ship's orbit and target orbit. Track phase angle evolution during coast. Report when phase geometry is favorable for transfer.

### How It Works
1. Compute synodic period: `T_syn = 1/|1/T_ship - 1/T_target|`
2. Track current phase angle between ship and target (existing `calculatePhaseAngle()`)
3. Compute phase drift rate from orbital period difference
4. Report: "Next favorable geometry in X days, repeats every Y days"

### Post-Review Iteration
After the Physicist flagged that Hohmann phase angles are wrong for solar sails, Option A was revised to **not** output a specific "optimal departure angle." Instead, it reports **synodic period and phase geometry** -- when the ship and target are approaching favorable relative positions. The player interprets this as "the universe of possible windows" without a specific "best" departure.

### Reviewer Consensus

| Reviewer | Score | Key Finding |
|----------|-------|-------------|
| Physicist | 3/10 | Hohmann formula inapplicable to continuous low-thrust; synodic period is valid but gives false periodicity |
| Architect | 8/10 | Cleanest architecture, pure math in lib/, minimal touchpoints |
| Functional Tester | 7/10 | Too simple to answer "do I save time?"; partial goal achievement |
| Failure Analyst | 3/10 | No intercept verification; misleading for eccentric/inclined targets |
| Regression Checker | 9/10 | Safest option; zero regression risk |
| Best Practices | A | Most project-idiomatic; pure functions in lib/ |

### Consolidated Concerns

| ID | Severity | Source | Description |
|----|----------|--------|-------------|
| A-P1 | Critical | Physicist | Hohmann phase angle inapplicable to solar sail transfers |
| A-P2 | Important | Physicist | Assumes circular coplanar orbits; fails for Mercury (e=0.21), Pluto (e=0.25) |
| A-F1 | Critical | Functional | Does not answer core question ("do I save time?") |
| A-FM1 | Critical | Failure | No verification that window produces actual intercept |
| A-FM2 | Important | Failure | Ship in SOI produces meaningless synodic periods |
| A-BP1 | Low | Best Practices | Duplicates existing `calculatePhaseAngle()` in navigation.js |

### Verdict
**Architecturally perfect, physically insufficient.** Useful as a supplementary display (synodic period info) but cannot stand alone as a launch window finder.

---

## Option B: Discrete Coast-Then-Solve Grid Search

### Concept
Sample N departure times over a configurable window (e.g., 0-730 days). At each departure, propagate ship orbit (coast, 0% deployment), then run the course solver to find best sail settings and transfer time. Compare total mission time (coast + transfer) across departures.

### How It Works
1. Snapshot current ship elements and Julian date
2. For each departure time (0, 30, 60... 730 days):
   a. Keplerian coast: elements unchanged, mean anomaly advances via `n * coastDays`
   b. Run `solveCourse()` (or lighter variant) from coasted state
   c. Record: {coast_days, sail_settings, closest_approach, transfer_days, total_time, status}
3. Rank by total mission time, prioritizing INTERCEPT results
4. Display: "Coast 180d + sail 320d = 500d total (INTERCEPT)" vs "Depart now + sail 850d (NEAR MISS)"

### Post-Review Iteration
After the Failure Analyst flagged 12-19 minute compute time as disqualifying, Option B was revised to use a **lighter evaluation** per departure:
- **Revised approach:** Use `evaluateCandidate()` with a coarse 5-degree grid (same as course-solver Phase 1) instead of the full multi-phase solver. This reduces per-departure cost from 30-45s to ~2-3s.
- **25 departures x 3s = 75 seconds** -- feasible with progress reporting.
- Top 2-3 windows can then be verified with the full solver if desired.

### Reviewer Consensus

| Reviewer | Score | Key Finding |
|----------|-------|-------------|
| Physicist | 9/10 | Most physically rigorous; uses full validated physics stack |
| Architect | 7/10 | Correct patterns but needs `evaluateCandidate()` start-time refactoring |
| Functional Tester | 8/10 | Best goal achievement; directly answers "do I save time?" |
| Failure Analyst | 6/10 | Compute time (even revised) and SOI guard are major concerns |
| Regression Checker | 7/10 | Medium risk; concurrent computation guard conflicts with course solver |
| Best Practices | B+ | Follows async/yield patterns, appropriate complexity |

### Consolidated Concerns

| ID | Severity | Source | Description |
|----|----------|--------|-------------|
| B-P0 | Critical | All | `evaluateCandidate()` hardcodes `getJulianDate()` as start time |
| B-FM1 | Critical | Failure | Game time drift during async computation corrupts results |
| B-A1 | Important | Architect | Tight coupling to `evaluateCandidate()` return shape |
| B-R1 | Important | Regression | `optimalCourseCache.computing` guard prevents overlapping solver calls |
| B-R2 | Important | Regression | Trajectory cache thrashing during analysis causes predicted path flicker |
| B-FM2 | Important | Failure | SOI ships cannot be coasted without SOI exit simulation |
| B-F1 | Important | Functional | Even revised, 75 seconds is substantial; needs cancel support |

### Verdict
**Highest accuracy, highest cost.** The revised lighter approach (coarse sweep per departure) makes it feasible but still the most computationally expensive option. Best reserved as a "deep analysis" mode.

---

## Option C: Porkchop Plot (Departure x Duration Heatmap)

### Concept
Classic astrodynamics visualization. 2D grid of (departure_date x flight_duration), color-coded by closest approach distance. Rendered as a canvas heatmap. Click to select a window.

### How It Works
1. Generate grid: M departure dates x K flight durations
2. For each cell: coast ship to departure date, simulate trajectory for K days with a quick sail optimization (test ~50 candidate angles per cell)
3. Color-code by minimum distance metric (blue = close, red = far)
4. Render as canvas heatmap overlay or modal
5. Click cell to select departure + duration, then run full solver

### Post-Review Iteration
After the Architect flagged that a second canvas breaks the single-canvas architecture, and the Best Practices reviewer scored it D+, Option C was revised to use a **modal overlay** rather than an inline canvas. This isolates it from the main render pipeline and canvas event handlers. After the Physicist flagged that "20 angles" was too coarse, the candidate count was increased to 50 per cell.

### Reviewer Consensus

| Reviewer | Score | Key Finding |
|----------|-------|-------------|
| Physicist | 6/10 | Sound concept but "flight duration" is emergent for sails, not independently settable |
| Architect | 5/10 | Breaks existing patterns; new rendering paradigm, highest complexity |
| Functional Tester | 6/10 | Beautiful but computation-to-accuracy tradeoff is very unfavorable |
| Failure Analyst | 5/10 | Canvas conflicts, color scale edge cases, enormous implementation scope |
| Regression Checker | 8/10 (risk) | CRITICAL HTML layout breakage risk; canvas event handler conflicts |
| Best Practices | D+ | Most convention violations; over-engineering for the feature need |

### Consolidated Concerns

| ID | Severity | Source | Description |
|----|----------|--------|-------------|
| C-A1 | Critical | Architect | Introduces entirely new rendering paradigm (2D heatmap) with no precedent |
| C-A2 | Critical | Architect/BP | Highest complexity: 500-700 lines, 5-8 file edits, new HTML, new canvas |
| C-P1 | Important | Physicist | Classical porkchop semantics (Lambert) don't map to continuous thrust |
| C-P2 | Important | Physicist | 50 angles per cell still coarse; 50x50 grid x 50 angles = 125,000 sims |
| C-R1 | Critical | Regression | HTML flexbox layout breakage risk with new canvas element |
| C-R2 | Important | Regression | Canvas event handler conflicts with camera controls |
| C-FM1 | Important | Failure | Color scale fails when values span 4 orders of magnitude or are uniform |
| C-BP1 | High | Best Practices | Over-engineering; premature abstraction for game context |

### Verdict
**Gold standard visualization, wrong context.** A porkchop plot is the professional astrodynamics tool, but introducing a second canvas rendering system into a vanilla JS game built on simplicity is disproportionate. Would be a great V2 feature after the core launch window logic is proven.

---

## Option D: Synodic Window + Verification Hybrid

### Concept
Quick analytical pre-filter finds candidate departure windows using orbital geometry, then verifies each candidate with the actual trajectory simulator to account for solar sail dynamics.

### How It Works
1. **Analytical filter:** Compute synodic period, identify candidate departure dates where orbital geometry is favorable (phase angle approaching transfer range)
2. **Verification pass:** For each candidate window (+-30 days), run `simulateWithStrategy()` or lightweight trajectory sim with 10-20 angle candidates
3. **Rank:** Sort verified windows by achievable closest approach
4. **Output:** "3 windows found: [95d INTERCEPT] [460d NEAR MISS] [830d INTERCEPT]"

### Post-Review Iteration
After the Physicist flagged that Hohmann phase angles produce wrong candidate windows for solar sails, Option D was revised:
- **Revised analytical filter:** Instead of Hohmann phase angle, use **phase angle sweep** -- sample phase angle evolution every 30 days and identify dates where the ship-target geometry is within 60 degrees of opposition/conjunction (depending on inner/outer transfer). This is a geometric screen, not a transfer-specific one.
- **Expanded verification window:** +-60 days (was +-30) to compensate for analytical imprecision
- **Increased verification angles:** 30 candidates (was 10) across yaw [-60, 60] in 4-degree steps

After the Failure Analyst flagged unpredictable compute time, a **maximum candidate cap of 5** was added with a timeout.

### Reviewer Consensus

| Reviewer | Score | Key Finding |
|----------|-------|-------------|
| Physicist | 5/10 | Analytical pre-filter based on wrong model (Hohmann) undermines hybrid |
| Architect | 8/10 | Best architectural fit; mirrors existing coarse-then-fine pattern |
| Functional Tester | 7/10 | Good balance of speed and accuracy; verified windows are trustworthy |
| Failure Analyst | 4/10 | Variable candidate count makes time unpredictable; false negatives from filter |
| Regression Checker | 8/10 | Moderate risk; trajectory cache invalidation during verification |
| Best Practices | B+ | Appropriate complexity; two-phase has codebase precedent |

### Consolidated Concerns

| ID | Severity | Source | Description |
|----|----------|--------|-------------|
| D-P1 | Critical | Physicist | Analytical pre-filter (even revised) may miss valid sail-transfer windows |
| D-FM1 | Important | Failure | Variable candidate count (2-15) makes compute time unpredictable |
| D-FM2 | Important | Failure | False negatives: analytical filter rejects valid non-standard windows |
| D-A1 | Important | Architect | Verification needs `simulateWithStrategy()` which is module-private |
| D-R1 | Important | Regression | Trajectory cache invalidation during verification causes flicker |
| D-P2 | Important | Physicist | +-60 day window may still not contain optimal departure for solar sails |

### Verdict
**Elegant architecture, unreliable pre-filter.** The hybrid approach is sound in principle (the codebase already uses coarse-then-fine in course-solver), but the analytical step's inability to reliably identify solar sail windows undermines the whole pipeline. Could work well if the pre-filter is replaced with a fast simulation-based screen (see Option E+D hybrid in recommendations).

---

## Option E: Incremental Departure Sweep (Lightweight Strategy Test)

### Concept
Reuse the existing `simulateWithStrategy()` and 10 `NAV_STRATEGIES`. At each candidate departure time (sampled over 0-1095 days), coast the ship to that date, then test all 10 strategies. Record which departures produce intercepts.

### How It Works
1. Snapshot ship elements and Julian date
2. For each departure (0, 30, 60... 1095 days at 30-day steps = 37 departures):
   a. Keplerian coast: compute ship position at departure date
   b. For each of 10 NAV_STRATEGIES: simulate 365 days of thrust from coasted state
   c. Record best strategy result: {coast_days, strategy_name, closest_approach, transfer_days, status}
3. Display timeline: "Days 90-120: INTERCEPT with RAISE ORBIT"
4. Compare with baseline: "Depart now: 850d NEAR MISS"

### Post-Review Iteration
After the Physicist and Failure Analyst flagged that 10 strategies cover only ~3% of the solver's search space, Option E was revised:
- **Expanded strategies:** Add 15 intermediate strategies (yaw: -45, -25, -15, 15, 25, 45 x pitch: 0, 15, -15) for 25 total strategies. Still fast: 37 departures x 25 strategies = 925 sims x ~2ms = ~2 seconds.
- **Multi-horizon screening:** Test both 365-day and 730-day flight durations per departure (doubles sims to ~1850, still under 4 seconds).
- **Explicit "approximate" label:** UI clearly states "Approximate windows -- use PLOT COURSE for exact settings"

After the Architect flagged that `simulateWithStrategy()` is private and reads module state, the plan was revised to create a **new parameterized function** `evaluateDeparture(shipElements, targetElements, startJD, strategy, maxDays)` that does not read module-level state.

### Reviewer Consensus

| Reviewer | Score | Key Finding |
|----------|-------|-------------|
| Physicist | 8/10 | Correct physics, leverages validated code, extremely fast |
| Architect | 6/10 | Coupling to private functions; module placement tricky |
| Functional Tester | 7/10 | Practical and buildable; 10 strategies limit accuracy (revised to 25) |
| Failure Analyst | 7/10 | Best performance/risk tradeoff; strategy coverage is main weakness |
| Regression Checker | 8/10 | Low risk if new parameterized function created (no touching existing code) |
| Best Practices | B | Best code reuse; module placement question resolved by new lib/ file |

### Consolidated Concerns

| ID | Severity | Source | Description |
|----|----------|--------|-------------|
| E-P0 | Critical | All | `simulateWithStrategy()` hardcodes `getJulianDate()` and module state |
| E-P1 | Important | Physicist | Even 25 strategies may miss optimal angles for certain geometries |
| E-A1 | Important | Architect | `simulateWithStrategy()` is private; needs new parameterized variant |
| E-FM1 | Important | Failure | All strategies may fail for outer planets (Jupiter+), producing false "no window" |
| E-A2 | Important | Architect | Navigation.js already 955 lines; should not add more code there |
| E-FM2 | Low | Failure | 400-step sims at 1825-day duration produce coarse time steps |

### Verdict
**Best practical option.** Fastest computation (~2-4 seconds), correct physics, heavy code reuse, lowest implementation risk. The strategy-coverage limitation is acceptable for a "window finder" (not a course plotter) -- the player would follow up with PLOT COURSE for exact settings. Post-review expansion to 25 strategies significantly improves coverage.

---

## Comparative Matrix

| Criterion | A | B | C | D | E |
|-----------|---|---|---|---|---|
| **Physics accuracy** | 3 | 9 | 6 | 5 | 8 |
| **Answers core question** | Partial | Full | Full | Full | Full |
| **Computation time** | <1s | ~75s | ~120s | ~10-30s | ~2-4s |
| **Implementation complexity** | Low | Medium | Very High | Medium | Low-Medium |
| **Regression risk** | None | Medium | High | Medium | Low |
| **Architecture fit** | Excellent | Good | Poor | Good | Good |
| **Best practices** | A | B+ | D+ | B+ | B |
| **Code reuse** | Low | Medium | Low | Medium | High |
| **New files** | 1 | 1 | 2 | 1 | 1 |
| **File edits** | 1-2 | 2-3 | 5-8 | 2-3 | 2-3 |
| **Estimated LOC** | ~100-150 | ~250-300 | ~500-700 | ~250-350 | ~200-250 |

### Aggregate Reviewer Scores

| Option | Phys | Arch | Func | Fail | Regr | BP | **AVG** |
|--------|------|------|------|------|------|----|---------|
| A | 3 | 8 | 7 | 3 | 9 | 9 | **6.5** |
| B | 9 | 7 | 8 | 6 | 7 | 8 | **7.5** |
| C | 6 | 5 | 6 | 5 | 5* | 4 | **5.2** |
| D | 5 | 8 | 7 | 4 | 8 | 8 | **6.7** |
| E | 8 | 6 | 7 | 7 | 8 | 7 | **7.2** |

*Regression score for C reflects high risk, not confidence.

---

## Recommended Approach: E+B Hybrid

Multiple reviewers independently converged on the same recommendation: **use Option E as a fast screening pass, then verify top windows with Option B's deeper evaluation.**

### Workflow
1. **Fast scan (Option E, ~2-4s):** Sweep 37 departure dates x 25 strategies x 2 horizons = ~1850 sims. Identify the top 3-5 departure windows where any strategy achieves INTERCEPT or NEAR MISS.
2. **Deep verify (Option B lite, ~15-30s):** For the top 3 windows only, run the coarse phase of the course solver (91-point grid) to find exact sail settings and confirm intercept quality.
3. **Display:** Ranked windows with coast time + transfer time + total time + status + recommended sail settings.

### Why This Works
- Option E's speed (~2-4s) gives the player immediate feedback
- Option B's accuracy (course solver coarse phase) confirms the results
- Total time: ~20-35 seconds with progress reporting
- Handles the Physicist's concern (uses validated physics, no Hohmann assumptions)
- Handles the Failure Analyst's concern (fast initial scan, bounded verification)
- Handles the Architect's concern (new parameterized function, no touching existing code)

---

## Implementation Sketch (Not a Rigid Plan)

### New File: `src/js/lib/launch-window.js`
- `evaluateDeparture(shipElements, targetElements, startJD, sailConfig, maxDays, steps)` -- pure simulation function
- `scanLaunchWindows(ship, target, options, onProgress)` -- fast sweep using expanded strategies
- `verifyWindow(ship, target, departureJD, options)` -- deeper evaluation of a single window
- `findLaunchWindows(ship, target, options, onProgress)` -- orchestrator: scan then verify top N

### Edits
- `core/navigation.js` -- add `computeLaunchWindows()` orchestration (follows `computeOptimalCourse()` pattern)
- `ui/uiUpdater.js` -- add launch window results display in NAV or AUTO tab
- `ui/controls.js` -- add "FIND WINDOWS" button alongside "PLOT COURSE"

### Key Design Decisions (Flexible)
- New `evaluateDeparture()` function does NOT call `getJulianDate()` -- receives all state as parameters
- Coast propagation is trivial: same elements, different Julian date for `getPosition()`
- Results cached with destination + ship elements hash, similar to `navPlanCache`
- Async with yields following `course-solver.js` pattern
- Progress callback: `{phase: 'scanning'|'verifying', progress: 0-1, windowsFound: N}`

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Strategy coverage misses optimal angles | Medium | Medium | Expanded to 25 strategies + deep verification of top windows |
| Outer planet windows not found | Medium | Low | Extend flight duration to 1825 days for Jupiter+ targets |
| Ship in SOI produces garbage | High | High | SOI guard: check `isInSOI`, display warning |
| Game time drifts during computation | Medium | High | Snapshot Julian date at computation start |
| Computation > 60 seconds | Low | Medium | Cap at 5 verified windows, abort on timeout |
| Results mislead player | Low | Medium | Label as "approximate"; advise PLOT COURSE for exact settings |
| `evaluateCandidate()` API changes break existing code | Low | High | Create new function instead of modifying existing |

---

## Open Questions

1. **Where in the UI?** NAV tab (alongside navigation computer) or AUTO tab (alongside autopilot)? The functional tester suggested NAV tab for consistency with "PLOT COURSE."

2. **Trigger mechanism?** Manual button press (like PLOT COURSE) or automatic on destination change? Given computation time (~20-35s), manual trigger is safer.

3. **Should partial deployment coast be supported?** The original concept is 0% deployment, but "coast at 10% deployment" is an interesting variant. Leave as future extension.

4. **Interaction with autopilot?** If autopilot is active, should launch window analysis be disabled? Or should it suggest "wait for window, then autopilot"?

5. **How many strategies for the expanded set?** 25 was suggested post-review. More strategies = better coverage but slower scan. The sweet spot is likely 20-30.

---

*Report generated 2026-02-05. Reviewed by: Physicist, Architect, Functional Tester, Failure Analyst, Regression Checker, Best Practices.*
