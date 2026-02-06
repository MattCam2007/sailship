# Launch Window Analysis Implementation Plan

**Date:** 2026-02-06
**Status:** Draft

## 0. File Impact Summary

### Files to EDIT:
1. `src/js/lib/course-solver.js` - Add `startJulianDate` option to `evaluateCandidate()`
2. `src/js/core/navigation.js` - Add `computeLaunchWindows()` orchestrator
3. `src/js/ui/controls.js` - Add FIND WINDOWS button handler
4. `src/js/ui/uiUpdater.js` - Cache DOM elements, display launch window results
5. `src/index.html` - Add launch window section in AUTO tab

### Files to CREATE:
1. `src/js/lib/launch-window.js` - Core scanning and verification logic
2. `src/js/lib/launch-window.test.js` - Console test suite

## 1. Problem Statement

### 1.1 Description
Players need to know whether coasting (furled sails) before departing produces better transfer windows to their destination. Currently the only option is "depart now" via PLOT COURSE. There's no way to compare "depart now" vs "coast 180 days then depart."

### 1.2 Root Cause
`evaluateCandidate()` hardcodes `getJulianDate()` as start time. No mechanism to evaluate trajectories from future departure dates.

### 1.3 Constraints
- Zero code duplication: all trajectory simulation uses existing `evaluateCandidate()`
- Must not interfere with active course solving (concurrent computation guard)
- Must not mutate global game state (Julian date, orbital elements)
- Ship must be in heliocentric space (not inside a planetary SOI)
- Async with progress reporting, following established patterns

## 2. Solution Architecture

### 2.1 High-Level Design
E+B hybrid: two-phase scan-then-verify approach.

**Phase 1 (Scan, ~2-4s):** Test ~25 sail strategies at each of ~37 departure dates. Identify windows where any strategy achieves intercept or near miss. Uses `evaluateCandidate()` with a parameterized start time.

**Phase 2 (Verify, ~15-25s):** For the top 3 windows from Phase 1, run the full coarse sweep (91-point grid) to find exact optimal sail settings. Uses `coarseSweep()` with parameterized start time.

### 2.2 Design Principles
- **No code duplication:** All simulation flows through existing `evaluateCandidate()`
- **Parameterize, don't copy:** Add `startJulianDate` option to existing function
- **Follow established patterns:** Same async/yield/progress/cache as course solver
- **Separate computation from UI:** lib/launch-window.js is pure computation; navigation.js orchestrates; UI displays

### 2.3 Key Algorithms

**Keplerian Coast:** Ship at 0% deployment follows unperturbed Keplerian orbit. Same orbital elements, different Julian date produces different position. No simulation needed -- just pass a future Julian date to `evaluateCandidate()`.

**Strategy Set (25 configs):**
```
Yaw: [-55, -45, -35, -25, -15, 0, 15, 25, 35, 45, 55]
Pitch: [0] for each yaw, plus pitch [±15, ±30] for yaw [0, 35]
= ~25 strategies covering major transfer geometries
```

**Window Identification:** Group consecutive departures that achieve intercept/near-miss into windows. Report the best departure within each window.

## 3. Units of Work

### Unit 1: Parameterize evaluateCandidate() Start Time
**Description:** Add `startJulianDate` option to `evaluateCandidate()` so it can simulate trajectories from any departure date, not just the current game time.
**Files:** `src/js/lib/course-solver.js`
**Changes:** Line 433: `const startTime = options.startJulianDate || getJulianDate();`
**Acceptance Criteria:**
- [ ] `evaluateCandidate(0, 0, ship, target, {})` still uses current Julian date (backward compatible)
- [ ] `evaluateCandidate(0, 0, ship, target, {startJulianDate: jd + 365})` evaluates from 1 year in the future
- [ ] All existing course solver tests pass unchanged
**Test Method:** Existing console test suite + manual verification

### Unit 2: Create launch-window.js Core Module
**Description:** New library module with scan and verify functions. Pure computation, no UI, no module-level state.
**Files:** `src/js/lib/launch-window.js` (CREATE)
**Exports:**
- `scanLaunchWindows(ship, target, startJD, options, onProgress)` - Fast sweep
- `verifyTopWindows(ship, target, startJD, windows, options, onProgress)` - Deep verify
- `findLaunchWindows(ship, target, startJD, options, onProgress)` - Orchestrator (scan + verify)
- `LAUNCH_WINDOW_STRATEGIES` - The 25 strategy configs
**Acceptance Criteria:**
- [ ] `scanLaunchWindows()` returns array of departure windows sorted by quality
- [ ] `verifyTopWindows()` returns refined results with exact sail settings
- [ ] `findLaunchWindows()` orchestrates both phases with progress
- [ ] All functions accept start Julian date as parameter (no `getJulianDate()` calls)
- [ ] Functions are async with yields for UI responsiveness
- [ ] SOI guard: returns error result if ship is in SOI
**Test Method:** Console test suite (launch-window.test.js)

### Unit 3: Navigation Integration
**Description:** Add `computeLaunchWindows()` to navigation.js following the `computeOptimalCourse()` pattern with cache, concurrent guard, and progress.
**Files:** `src/js/core/navigation.js`
**Exports:**
- `computeLaunchWindows(onProgress)` - Async computation with cache
- `getLaunchWindowState()` - Get current computation state
- `getCachedLaunchWindows()` - Get cached results
- `clearLaunchWindowCache()` - Clear cache
**Acceptance Criteria:**
- [ ] Follows `computeOptimalCourse()` pattern (cache, concurrent guard, progress)
- [ ] Reads ship/target from existing module state (destination, getPlayerShip)
- [ ] Snapshots Julian date at computation start
- [ ] Returns null with console warning if ship is in SOI
- [ ] Clears cache on destination change
**Test Method:** Manual testing in browser

### Unit 4: HTML Structure
**Description:** Add LAUNCH WINDOW section to the AUTO tab in index.html.
**Files:** `src/index.html`
**Changes:** Add after the course plotter section in the AUTO tab:
- FIND WINDOWS button (follows PLOT COURSE pattern)
- Results container for window display
- Individual window result rows
**Acceptance Criteria:**
- [ ] New section visible in AUTO tab
- [ ] Follows existing panel-section/panel-header pattern
- [ ] Button styled like PLOT COURSE button
- [ ] Results container ready for dynamic content
- [ ] No layout regression on existing panels
**Test Method:** Visual inspection in browser

### Unit 5: Button Handler and Progress Display
**Description:** Wire up FIND WINDOWS button with async computation and progress display, following the initCoursePlotter() pattern.
**Files:** `src/js/ui/controls.js`
**Changes:** New `initLaunchWindowFinder()` function called from controls initialization.
**Acceptance Criteria:**
- [ ] Button triggers `computeLaunchWindows()` on click
- [ ] Button shows "SCANNING..." during computation
- [ ] Progress updates display in result container
- [ ] Results display when computation completes
- [ ] Button disabled during active computation
- [ ] Disabled when ship is in SOI (with tooltip/message)
**Test Method:** Manual testing in browser

### Unit 6: Results Display
**Description:** Format and display launch window results in the UI.
**Files:** `src/js/ui/controls.js` (display function within initLaunchWindowFinder)
**Changes:** `displayLaunchWindowResults(windows, resultDiv)` function
**Acceptance Criteria:**
- [ ] Each window shows: coast days, transfer days, total days, status, sail settings
- [ ] Windows sorted by total trip time
- [ ] "Depart now" baseline always shown for comparison
- [ ] Status color-coded (INTERCEPT green, NEAR MISS yellow, etc.)
- [ ] Quality labels: "BEST", savings vs baseline shown
**Test Method:** Manual testing with various destinations

### Unit 7: Console Test Suite
**Description:** Browser console test suite for launch-window.js following existing test patterns.
**Files:** `src/js/lib/launch-window.test.js` (CREATE)
**Acceptance Criteria:**
- [ ] Tests `scanLaunchWindows()` with mock ship/target data
- [ ] Tests `verifyTopWindows()` with known good windows
- [ ] Tests SOI guard behavior
- [ ] Tests edge cases: ship at target, no windows found, outer planets
- [ ] Follows `runAllTests()` export pattern
**Test Method:** `import('/js/lib/launch-window.test.js').then(m => m.runAllTests())`

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Strategy coverage misses optimal angles | Medium | Medium | 25 strategies + Phase 2 verification |
| Outer planet windows not found | Medium | Low | Extend flight duration for Jupiter+ |
| Ship in SOI produces garbage | High | High | SOI guard in Unit 2 and Unit 3 |
| Game time drifts during computation | Medium | High | Snapshot Julian date at start |
| Concurrent with PLOT COURSE | Medium | Medium | Separate computation guard |
| evaluateCandidate() API change breaks solver | Low | High | Additive change only (fallback to getJulianDate) |

## 5. Testing Strategy

### 5.1 Unit Tests
- launch-window.test.js console test suite

### 5.2 Integration Tests
- Run existing course-solver tests to verify no regression
- Run existing orbital tests to verify no regression

### 5.3 Manual Verification
- Test with inner planets (Venus, Mars) -- should find windows
- Test with outer planets (Jupiter) -- should find windows with longer horizons
- Test with ship in SOI -- should show guard message
- Test concurrent with PLOT COURSE -- should not interfere
- Test with various time warp speeds during computation
