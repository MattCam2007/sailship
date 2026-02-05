# Launch Window Analysis - Regression Check Report

**Date:** 2026-02-05
**Reviewer:** Regression Checker
**Feature:** Launch Window Analysis (5 implementation options)

---

## Executive Summary

This report evaluates five implementation options for a "Launch Window Analysis" feature against the existing Sailship codebase. Each option is assessed for its potential to introduce regressions in the 12 existing features and 6 test suites.

**Key findings:**
- **Option A** (Phase Angle Coast Timer) has the lowest regression risk -- purely additive with minimal touchpoints.
- **Option B** (Coast-Then-Solve Grid Search) has significant concurrent operation risk due to `solveCourse()` guard logic.
- **Option C** (Porkchop Plot) has the highest regression surface area, touching renderer.js, HTML structure, and adding a new canvas.
- **Option D** (Synodic Window + Verification Hybrid) has moderate risk, primarily through trajectory predictor cache interactions.
- **Option E** (Incremental Departure Sweep) has moderate risk from internal function exposure in navigation.js.

---

## Architecture Baseline (Observed From Code)

### Critical Integration Points Identified

1. **Concurrent computation guard** (`navigation.js:767`): `optimalCourseCache.computing` boolean prevents overlapping `solveCourse()` calls. Any new feature that also calls `solveCourse()` must respect this guard.

2. **Cache hierarchy**: Three-level cache chain in game loop:
   - `trajectoryCache` in `trajectory-predictor.js` (hash-validated, 500-2000ms TTL)
   - `intersectionCache` in `gameState.js` (trajectory-hash-coupled, 500-2000ms TTL)
   - `closestApproachCache` / `nodeCrossingsCache` in `gameState.js` (trajectory-hash-coupled, 1000ms TTL)
   - `interceptCache` in `navigation.js` (500ms TTL)
   - `navPlanCache` in `navigation.js` (2000ms TTL)

3. **Game loop budget**: `updatePositions()` in `main.js` already performs per-frame trajectory prediction and intersection detection. Adding computation here risks frame drops.

4. **Memory cleanup**: Periodic cleanup every 3600 frames clears ALL caches. Any new cache must be registered in `performMemoryCleanup()` or it becomes a memory leak.

5. **Module-private functions**: `simulateWithStrategy()` in `navigation.js` (line 300) is NOT exported -- it is a module-private function used by `computeNavigationPlan()`.

6. **Tab system**: Right panel uses SAIL/NAV/AUTO tabs via `initTabGroup('rightPanelTabs', 'sail')`. Adding UI to any tab must follow the existing tab-panel pattern (`class="tab-panel"`, `id="*Panel"`).

7. **HTML structure**: `index.html` has a rigid left-panel / canvas / right-panel layout. The right panel has three tab panels (`sailPanel`, `navPanel`, `autoPanel`). Adding new UI must fit within this structure.

---

## OPTION A: Phase Angle Coast Timer

**Files affected:** New `lib/launch-window.js`, edit `uiUpdater.js` (add display), possibly `navigation.js`
**Declared risk:** LOW

### 1. Impact Analysis

| Feature | Risk Level | Rationale |
|---------|-----------|-----------|
| Ship rendering | NONE | No changes to position calculation or render pipeline |
| Sail controls | NONE | No changes to sail state or physics |
| Orbital paths | NONE | No changes to orbit drawing |
| Predicted trajectory | NONE | No changes to trajectory predictor |
| Encounter markers | NONE | No changes to intersection detection |
| Course solver | NONE | Does not call `solveCourse()` |
| Autopilot | NONE | No changes to autopilot phases |
| Navigation plan | LOW | If phase angle data is added to navigation.js, existing `computeNavigationPlan()` exports/caches must not be affected |
| Camera controls | NONE | No canvas or input changes |
| Time controls | NONE | No time state changes |
| Tab system | LOW | New display elements need correct placement |
| Display toggles | NONE | No new toggle required |

### 2. Integration Risk: LOW
- New `lib/launch-window.js` is a standalone calculation module.
- `calculatePhaseAngle()` already exists as a private function in `navigation.js` (line 389). Option A could either export this existing function or duplicate the calculation. Exporting is safer (single source of truth) but creates a new export from navigation.js.
- Adding display in `uiUpdater.js` requires new DOM element IDs in `index.html` and corresponding references in `elements = {}` (line 19). This is a well-established pattern with zero risk if following convention.

### 3. Concurrent Operation Risk: NONE
- Phase angle is a pure geometric calculation (atan2 of two positions). No async operations, no cache contention.

### 4. Cache Invalidation Risk: NONE
- Phase angle is computed fresh each frame (trivially cheap). No caching needed.

### 5. UI Regression Risk: LOW
- **Concern:** Adding DOM elements to the NAV tab could affect panel layout if CSS sizes are wrong.
- **Severity:** Nice-to-have
- **Mitigation:** Follow existing `data-row` pattern exactly.

### 6. Test Suite Impact: NONE
- Existing tests will pass unchanged. New tests should be added for the phase angle calculation (pure math, easy to test).

### 7. State Management Risk: NONE
- Read-only access to ship and body positions. No state mutation.

**Domain Confidence: 9/10**

### Specific Concerns

| # | Concern | Severity | Detail |
|---|---------|----------|--------|
| A1 | Duplicating `calculatePhaseAngle()` | Nice-to-have | If the new module duplicates rather than exports the existing private function in navigation.js, divergence risk over time |
| A2 | DOM element placement in NAV tab | Nice-to-have | Adding data-rows to the NAV panel could push existing elements off-screen on small viewports if not positioned carefully |

---

## OPTION B: Discrete Coast-Then-Solve Grid Search

**Files affected:** New `lib/launch-window.js`, edit `navigation.js` (integrate), edit `uiUpdater.js`, edit `controls.js` (button)
**Declared risk:** MEDIUM

### 1. Impact Analysis

| Feature | Risk Level | Rationale |
|---------|-----------|-----------|
| Ship rendering | NONE | No changes to position pipeline |
| Sail controls | NONE | No changes to sail state |
| Orbital paths | NONE | No changes to orbit rendering |
| Predicted trajectory | LOW | If launch window simulation uses `predictTrajectory()`, may interact with trajectory cache |
| Encounter markers | LOW | If trajectory cache is corrupted by launch window simulations, ghost planets could flicker |
| **Course solver** | **HIGH** | Calls `solveCourse()` which has a **concurrent computation guard** (`optimalCourseCache.computing`). If user triggers launch window search while course solver is running, or vice versa, one will be silently rejected |
| Autopilot | LOW | Autopilot calls `computeNavigationPlan()`, which shares the same cache. If navigation.js is restructured, autopilot could get stale data |
| **Navigation plan** | **MEDIUM** | Direct edits to navigation.js. `computeNavigationPlan()` and its cache could be affected |
| Camera controls | NONE | No canvas changes |
| Time controls | LOW | Grid search over departure dates manipulates virtual time, must not modify actual `julianDate` state |
| Tab system | LOW | New button needs correct tab placement |
| Display toggles | NONE | No new toggles |

### 2. Integration Risk: MEDIUM-HIGH
- **Critical concern:** `computeOptimalCourse()` (navigation.js:765) has a boolean lock `optimalCourseCache.computing`. If the launch window feature calls `solveCourse()` for multiple departure dates, it will hit this guard. Either the guard must be modified (risky -- allows concurrent computation that was previously prevented) or the launch window must use a separate solver instance (code duplication risk).
- The `solveCourse()` function in `course-solver.js` is async and yields to prevent UI blocking (line 150). Running multiple instances sequentially is safe but could take 30-45 seconds per evaluation point. A grid of even 10 departure dates = 5-7 minutes total compute.

### 3. Concurrent Operation Risk: **CRITICAL**
- **Concern:** User clicks "PLOT COURSE" (existing), then immediately clicks "ANALYZE LAUNCH WINDOWS" (new). Or vice versa. The existing guard at line 767 will silently drop the second request. If the launch window feature bypasses this guard, two concurrent `solveCourse()` calls could produce corrupt results (shared state in `course-solver.js` internal variables).
- **Concern:** If autopilot is running while launch window analysis is computing, autopilot calls `computeNavigationPlan()` every frame. This reads `navPlanCache` which could be stale if navigation.js is mid-restructure.
- **Severity:** Critical

### 4. Cache Invalidation Risk: MEDIUM
- If launch window simulations pass different `startTime` values to `predictTrajectory()`, the trajectory cache will be invalidated each time, destroying the cached trajectory used for the current predicted path display. The player's purple spiral path could flicker or disappear during analysis.
- The intersection cache (`gameState.js:298`) is coupled to the trajectory hash. Changing trajectory input parameters will cascade-invalidate intersection cache, potentially causing ghost planet flicker.
- **Severity:** Important

### 5. UI Regression Risk: LOW
- Adding a button to `controls.js` follows the established `initCoursePlotter()` pattern. Risk is mainly cosmetic (button placement, CSS).
- Adding display to `uiUpdater.js` follows `updateNavigationComputer()` pattern.

### 6. Test Suite Impact: LOW
- Existing `course-solver.test.js` tests should still pass since the solver interface is unchanged.
- New tests needed for launch window integration logic.
- **Risk:** If `solveCourse()` internal state is not properly isolated between calls, existing solver tests could become flaky in concurrent test scenarios.

### 7. State Management Risk: MEDIUM
- The launch window feature must simulate future states WITHOUT modifying actual game state (`julianDate`, ship orbital elements, etc.). `simulateWithStrategy()` in navigation.js already clones orbital elements (line 311: `let simElements = { ...player.orbitalElements }`), but the clone is shallow. If orbital elements ever gain nested objects, this becomes a bug.
- **Severity:** Important

**Domain Confidence: 7/10**

### Specific Concerns

| # | Concern | Severity | Detail |
|---|---------|----------|--------|
| B1 | Concurrent computation guard conflict with existing PLOT COURSE | Critical | `optimalCourseCache.computing` boolean prevents simultaneous solves. Launch window calling `solveCourse()` multiple times sequentially blocks the UI for minutes. Calling it concurrently requires disabling the guard, risking existing course solver stability |
| B2 | Trajectory cache thrashing during grid search | Important | Each simulated departure date invalidates the trajectory cache, causing the player's predicted path to flicker during analysis. The intersection cache cascade-invalidates, causing ghost planet flicker |
| B3 | Game time state contamination | Important | Grid search over future departure dates must NOT mutate `julianDate` in gameState.js. If any code path accidentally calls `advanceTime()` or `setJulianDate()`, the entire game clock shifts |
| B4 | solveCourse() 30-45 sec per evaluation | Important | Even 10 departure dates = 5-7 minutes of blocking computation. UI will be unresponsive unless significant architectural changes are made (Web Workers, chunked async) |

---

## OPTION C: Porkchop Plot

**Files affected:** New `lib/launch-window.js`, new `ui/porkchop-renderer.js`, edit `index.html`, edit `renderer.js`, edit `uiUpdater.js`, edit `controls.js`
**Declared risk:** HIGH

### 1. Impact Analysis

| Feature | Risk Level | Rationale |
|---------|-----------|-----------|
| Ship rendering | LOW | If renderer.js changes affect the `render()` draw order, ship could render behind new overlay |
| Sail controls | NONE | No sail state changes |
| **Orbital paths** | **MEDIUM** | If porkchop plot uses a canvas overlay on top of the main canvas, z-ordering with orbit paths must be managed |
| Predicted trajectory | MEDIUM | If porkchop computation uses trajectory predictor, cache interactions (see Option B concerns) |
| Encounter markers | MEDIUM | Same cache cascade concern as Option B |
| Course solver | MEDIUM | If porkchop evaluations call solveCourse(), same concurrent guard issue as Option B |
| Autopilot | NONE | No autopilot changes |
| Navigation plan | LOW | May add display elements to NAV panel |
| Camera controls | **MEDIUM** | If porkchop adds a canvas overlay, mouse/touch events must not be captured by the overlay when it should go to the main canvas, or vice versa |
| Time controls | NONE | No time state changes |
| **Tab system** | **MEDIUM** | Adding significant new UI (a chart canvas) to a tab requires careful sizing. The right panel has constrained width (~300px). A porkchop plot needs at least 300x300px to be readable |
| **Display toggles** | LOW | May need a new toggle to show/hide the porkchop |

### 2. Integration Risk: HIGH
- **renderer.js** is the most sensitive file in the UI layer. It manages a single canvas context (`ctx`), draws in a specific layer order (starfield -> grid -> orbits -> trajectory -> markers -> flight path -> bodies -> SOI -> ships), and uses a gradient cache system. Any modification risks breaking the draw order.
- Adding a new canvas or overlay requires modifying `index.html`'s layout structure. The current layout uses CSS flexbox (`main-container` with left-panel, canvas-container, right-panel). Adding an overlay or secondary canvas requires careful z-index management.
- `porkchop-renderer.js` as a new file is fine architecturally, but if it imports from `renderer.js` (e.g., `project3D`, `getCanvasDimensions`), it creates a new dependency that could cause issues if renderer.js internals change.

### 3. Concurrent Operation Risk: MEDIUM
- If porkchop computation runs in the background while the game loop continues, it must not modify any shared state. The game loop calls `render()` 60 times per second; if the porkchop renderer also draws to the same canvas, frame tearing or visual corruption could occur.
- If a separate canvas is used (safer), the game loop is unaffected.

### 4. Cache Invalidation Risk: MEDIUM
- Same concerns as Option B regarding trajectory cache if porkchop evaluations use `predictTrajectory()`.
- Additionally, the gradient cache in renderer.js (`gradientCache`, max 100 entries) could be stressed if porkchop rendering creates many gradients. The periodic cleanup in `main.js` calls `clearGradientCache()`, which would also clear porkchop gradients.

### 5. UI Regression Risk: **HIGH**
- **HTML structure changes** are the primary concern. The `index.html` layout is carefully crafted with CSS flexbox. Adding a new canvas, modal, or overlay could break:
  - Panel collapse/expand behavior (expandable panels use `panel-content` height transitions)
  - Mobile responsive layout (CSS media queries at specific breakpoints)
  - Tab panel sizing (fixed-height sections within tabs)
  - Save/Load modal z-index layering (currently `z-index` managed by `.save-load-modal.active`)
- **Canvas event handling**: The main canvas has mousedown, mousemove, mouseup, wheel, touchstart, touchmove, touchend handlers (controls.js:954-1022). If a porkchop canvas is overlaid or added nearby, event propagation must be carefully managed to prevent pan/zoom gestures from reaching the wrong canvas.
- **Severity:** Critical for HTML changes, Important for canvas event conflicts.

### 6. Test Suite Impact: LOW
- Existing tests run in isolation (browser console import) and do not test UI rendering. They will pass unchanged.
- However, there is no existing test infrastructure for canvas rendering, so the new porkchop renderer would be untested.

### 7. State Management Risk: LOW
- If porkchop is purely a visualization, it reads state without modifying it.
- Risk increases if clicking on the porkchop sets departure time or destination (state mutation from a new input source).

**Domain Confidence: 8/10**

### Specific Concerns

| # | Concern | Severity | Detail |
|---|---------|----------|--------|
| C1 | HTML layout breakage from new canvas/overlay element | Critical | The `main-container` flexbox layout with `canvas-container` is tightly coupled. Adding elements risks breaking panel widths, canvas sizing, or mobile layout |
| C2 | Canvas event handler conflicts | Important | Main canvas has 7+ event handlers for pan/rotate/zoom/touch. A porkchop canvas overlay could intercept or leak events, breaking camera controls |
| C3 | renderer.js draw order corruption | Important | Modifying `render()` function or its imports could break the back-to-front draw layering (starfield -> grid -> orbits -> trajectory -> markers -> bodies -> ships) |
| C4 | Gradient cache pressure | Nice-to-have | If porkchop uses many `createRadialGradient()` or `createLinearGradient()` calls, the 100-entry gradient cache may thrash. Periodic cleanup would clear porkchop gradients |
| C5 | Mobile layout regression | Important | The mobile floating sail widget (`mobileSailWidget`) and mobile quick actions already occupy bottom-of-screen space. A porkchop overlay could conflict |
| C6 | Tab panel height overflow | Important | Right panel tabs have constrained height. A porkchop plot (300x300px minimum) would overflow the tab panel on typical screen sizes |

---

## OPTION D: Synodic Window + Verification Hybrid

**Files affected:** New `lib/launch-window.js`, edit `navigation.js`, edit `uiUpdater.js`, edit `controls.js`
**Declared risk:** MEDIUM

### 1. Impact Analysis

| Feature | Risk Level | Rationale |
|---------|-----------|-----------|
| Ship rendering | NONE | No position pipeline changes |
| Sail controls | NONE | No sail state changes |
| Orbital paths | NONE | No orbit rendering changes |
| **Predicted trajectory** | **MEDIUM** | Verification step calls trajectory predictor, which has caching. Cache interactions could affect the live predicted path display |
| **Encounter markers** | **MEDIUM** | If trajectory cache is invalidated by verification, intersection cache cascade-invalidates, ghost planets may flicker |
| Course solver | LOW | Lighter integration than Option B; may not call `solveCourse()` directly |
| Autopilot | NONE | No autopilot changes |
| **Navigation plan** | **MEDIUM** | Edits to navigation.js could affect `computeNavigationPlan()` behavior or cache |
| Camera controls | NONE | No canvas changes |
| Time controls | NONE | No time state changes |
| Tab system | LOW | Button placement in existing tab |
| Display toggles | NONE | No new toggles |

### 2. Integration Risk: MEDIUM
- The synodic period calculation is pure orbital mechanics (a formula involving two semi-major axes). This part is safe and additive.
- The verification step is where risk increases: it needs to simulate the trajectory at a future departure date. If this calls `predictTrajectory()` from `trajectory-predictor.js`, the trajectory cache will be invalidated because the `startTime` parameter will differ from the current game time. This invalidation cascades to the intersection cache.
- If verification uses a separate simulation (like `simulateWithStrategy()` in navigation.js), it avoids cache issues but requires either exporting the private function or duplicating the simulation logic.

### 3. Concurrent Operation Risk: LOW
- Synodic calculation is synchronous and fast (pure math).
- Verification simulation is heavier but does not use the `solveCourse()` concurrent guard. It would use simpler trajectory simulation similar to `simulateWithStrategy()`.
- Risk: If verification runs while autopilot is adjusting sail settings, the verification uses stale sail settings. This is cosmetic, not functional.

### 4. Cache Invalidation Risk: **IMPORTANT**
- **Primary concern:** Verification calls `predictTrajectory()` with `startTime` set to a future departure date. This changes the trajectory hash, invalidating the current trajectory cache. On the next game loop frame, the predicted trajectory for the player's current position must be recomputed.
- The cascade: trajectory invalidation -> intersection invalidation -> ghost planet flicker (1-2 frames of missing/wrong ghost positions).
- **Mitigation:** The verification step could use a separate `predictTrajectory()` call that does NOT update the cache (pass a flag or use a separate function). This requires modifying trajectory-predictor.js.
- **Severity:** Important

### 5. UI Regression Risk: LOW
- Same pattern as Option A for DOM additions.
- Button follows `initCoursePlotter()` pattern.

### 6. Test Suite Impact: LOW
- `trajectory-predictor.test.js` tests will pass (they test the predictor in isolation).
- `orbital.test.js` tests will pass (synodic calculation is new, pure math).
- New tests needed for synodic period formula and verification logic.

### 7. State Management Risk: LOW
- Synodic calculation is stateless.
- Verification simulation clones orbital elements. Same shallow-clone concern as Option B (line 311 in navigation.js), but lower severity since it is a simpler simulation.

**Domain Confidence: 8/10**

### Specific Concerns

| # | Concern | Severity | Detail |
|---|---------|----------|--------|
| D1 | Trajectory cache invalidation during verification | Important | Calling `predictTrajectory()` with future start times invalidates the current trajectory cache, causing 1-2 frames of predicted path flicker and ghost planet flicker |
| D2 | `simulateWithStrategy()` is module-private | Important | If verification needs this function, it must either be exported (changing navigation.js's public API) or duplicated (maintenance burden) |
| D3 | navPlanCache staleness | Nice-to-have | If navigation.js is edited to add launch window state, ensure `navPlanCache` invalidation logic (line 416) still works correctly. Cache is keyed on destination and timestamp; adding launch window state to navigation.js could accidentally change cache invalidation behavior |
| D4 | Memory cleanup registration | Nice-to-have | If new caches are added for launch window results, they must be cleared in `performMemoryCleanup()` (main.js:57). Missing registration = slow memory leak |

---

## OPTION E: Incremental Departure Sweep

**Files affected:** Possibly extend `navigation.js` or new `lib/launch-window.js`, edit `uiUpdater.js`
**Declared risk:** LOW-MEDIUM

### 1. Impact Analysis

| Feature | Risk Level | Rationale |
|---------|-----------|-----------|
| Ship rendering | NONE | No position pipeline changes |
| Sail controls | NONE | No sail state changes |
| Orbital paths | NONE | No orbit rendering changes |
| Predicted trajectory | LOW | If sweep uses `predictTrajectory()` with different start times, cache interactions (lighter than Options B/D since sweep can be batched) |
| Encounter markers | LOW | Potential for cache cascade if sweep invalidates trajectory cache |
| Course solver | NONE | Does not call `solveCourse()` |
| Autopilot | NONE | No autopilot changes |
| **Navigation plan** | **MEDIUM** | Reuses `simulateWithStrategy()` which is PRIVATE. Must either export it, refactor it, or duplicate it |
| Camera controls | NONE | No canvas changes |
| Time controls | NONE | No time state changes |
| Tab system | LOW | Display added to existing tab |
| Display toggles | NONE | No new toggles |

### 2. Integration Risk: MEDIUM
- **Key concern:** `simulateWithStrategy()` (navigation.js:300) is a module-private function. It reads `destination` (module-level `let`, line 53) and calls `getPlayerShip()`, `getBodyByName(destination)`, `getJulianDate()`, and `getPosition()/getVelocity()`.
- If Option E exports `simulateWithStrategy()`, the function's dependency on module-level `destination` variable becomes an implicit coupling. Callers from outside navigation.js would need to set the destination first or the function needs refactoring to accept destination as a parameter.
- If refactored to accept parameters, the internal callers (`computeNavigationPlan()` at line 440) must be updated too. This is a broader refactor of navigation.js.
- If duplicated into `lib/launch-window.js`, the simulation logic must be kept in sync with navigation.js. Currently 80 lines of non-trivial orbital simulation code.

### 3. Concurrent Operation Risk: LOW
- `simulateWithStrategy()` is synchronous. No async guards needed.
- However, if the sweep runs many iterations in a tight loop, it could block the game loop for several seconds (10 strategies x 10 departure dates x 400 steps = 40,000 orbital mechanic steps). The game would freeze during this computation.
- **Mitigation:** Async iteration with `requestAnimationFrame` or `setTimeout` yields. This is how `solveCourse()` avoids blocking (line 150 in course-solver.js, yield frequency every 10 evaluations).

### 4. Cache Invalidation Risk: LOW
- `simulateWithStrategy()` does NOT use the trajectory predictor cache. It performs its own simulation with cloned elements. The existing caches remain untouched.
- This is a significant advantage over Options B and D.

### 5. UI Regression Risk: LOW
- Adding display to `uiUpdater.js` follows established patterns.
- No HTML structure changes needed.
- No canvas modifications.

### 6. Test Suite Impact: LOW
- Existing tests pass unchanged.
- If `simulateWithStrategy()` is exported, new tests can be written against it. Currently it is untestable from outside navigation.js.
- **Benefit:** Exporting the function actually improves testability of existing code.

### 7. State Management Risk: LOW
- `simulateWithStrategy()` clones orbital elements (`let simElements = { ...player.orbitalElements }`, line 311). It creates a temporary sail object (`const sail = player.sail ? { ...player.sail, ... }`, line 315). Neither modifies ship state.
- For departure sweep: must modify `julianDate` parameter passed to `getPosition()` without modifying the global game clock. The function already accepts `julianDate` from `getJulianDate()` at the start (line 308), so passing a different date is safe if the function is refactored to accept it as a parameter.

**Domain Confidence: 8/10**

### Specific Concerns

| # | Concern | Severity | Detail |
|---|---------|----------|--------|
| E1 | `simulateWithStrategy()` is module-private and depends on module-level `destination` | Important | Exporting requires adding `destination` as a parameter or accepting the implicit coupling. Refactoring changes the function signature, requiring updates to all internal callers (lines 440-448) |
| E2 | UI thread blocking during sweep | Important | Synchronous sweep of 10+ departure dates could freeze UI for 2-5 seconds. Must add async yields (following `solveCourse()` pattern) |
| E3 | Shallow clone of orbital elements | Nice-to-have | `{ ...player.orbitalElements }` is a shallow clone. Currently safe because orbital elements are flat (all primitive values). If elements gain nested objects in the future, this becomes a bug. Applies equally to existing `computeNavigationPlan()` |
| E4 | Memory cleanup for sweep results | Nice-to-have | If sweep results are cached, must register in `performMemoryCleanup()`. If not cached (computed on-demand), no concern |

---

## Comparative Risk Matrix

| Risk Category | Option A | Option B | Option C | Option D | Option E |
|--------------|----------|----------|----------|----------|----------|
| **Impact on existing features** | NONE | HIGH (course solver conflict) | MEDIUM (renderer, canvas events) | MEDIUM (trajectory cache) | LOW-MEDIUM (navigation.js refactor) |
| **Integration risk** | LOW | MEDIUM-HIGH | HIGH | MEDIUM | MEDIUM |
| **Concurrent operation risk** | NONE | **CRITICAL** | MEDIUM | LOW | LOW |
| **Cache invalidation risk** | NONE | MEDIUM | MEDIUM | **IMPORTANT** | LOW |
| **UI regression risk** | LOW | LOW | **HIGH** | LOW | LOW |
| **Test suite impact** | NONE | LOW | LOW | LOW | LOW |
| **State management risk** | NONE | MEDIUM | LOW | LOW | LOW |
| **Overall regression risk** | **LOW** | **HIGH** | **HIGH** | **MEDIUM** | **LOW-MEDIUM** |

---

## Cross-Cutting Concerns (All Options)

### CC1: Memory Cleanup Registration
- **Severity:** Important
- **Detail:** Any new cache must be registered in `performMemoryCleanup()` in `main.js` (line 57). The cleanup runs every 3600 frames (~60 seconds). An unregistered cache will grow unbounded.
- **Applies to:** All options that introduce caching (B, D, E potentially).

### CC2: Game Loop Frame Budget
- **Severity:** Important
- **Detail:** The game loop (`main.js:197`) must complete within ~16ms for 60fps. Currently, `updatePositions()` includes trajectory prediction and intersection detection, already consuming a significant portion of the frame budget. Any synchronous computation added to the game loop risks frame drops.
- **Applies to:** Options B, D, E if they add per-frame computation.

### CC3: Shallow Clone Pattern
- **Severity:** Nice-to-have
- **Detail:** Multiple locations use `{ ...player.orbitalElements }` for cloning. This is currently safe (all values are primitives) but fragile. If orbital elements ever gain nested objects (e.g., `soiState`), all clones become shallow-copy bugs.
- **Applies to:** All options that simulate trajectories.

### CC4: `destination` Module Variable Coupling
- **Severity:** Important
- **Detail:** `navigation.js` uses a module-level `let destination = 'MARS'` (line 53) that is read by multiple functions including `simulateWithStrategy()`, `computeNavigationPlan()`, and `predictClosestApproach()`. Any new feature in navigation.js inherits this coupling. Functions that need to evaluate different destinations must temporarily change this variable (dangerous) or be refactored to accept it as a parameter.
- **Applies to:** Options B, D, E.

### CC5: Import Path Convention
- **Severity:** Nice-to-have
- **Detail:** All imports must use `.js` extensions per project convention. A new `lib/launch-window.js` file must be imported with the full path: `import { ... } from '../lib/launch-window.js'`.
- **Applies to:** All options.

---

## Test Suite Gap Analysis

The existing test suites cover:
- `orbital.test.js` -- Keplerian orbital mechanics (position, velocity calculations)
- `orbital-maneuvers.test.js` -- Thrust application, Gauss variational equations
- `trajectory-predictor.test.js` -- Multi-step trajectory prediction with thrust
- `intersectionDetector.crossing.test.js` -- Orbital crossing detection algorithm
- `intersectionDetector.edge-cases.test.js` -- Flickering bug regression tests
- `starfield.test.js` -- Star catalog, precession, coordinate transforms
- `course-solver.test.js` -- Course plotting algorithm

**Notable gaps:**
1. **No tests for `navigation.js` functions** (`computeNavigationPlan`, `simulateWithStrategy`, `predictClosestApproach`). Any refactoring of these functions for launch window integration is untested.
2. **No tests for concurrent operations** (two `solveCourse()` calls, autopilot + solver interaction).
3. **No tests for cache invalidation cascades** (trajectory -> intersection -> closest approach).
4. **No UI/DOM tests** at all. UI regressions must be caught visually.

**Recommendation:** Before implementing any option that modifies `navigation.js`, add regression tests for `computeNavigationPlan()` and `simulateWithStrategy()` (which would need to be exported or tested indirectly).

---

## Recommendation

**Safest to most risky:** A > E > D > B > C

1. **Option A** is the clear winner for regression safety. Purely additive, no interaction with existing caches or concurrent systems. Ship it with confidence.

2. **Option E** is the next safest. The `simulateWithStrategy()` refactor is the main risk, but it is contained within navigation.js and actually improves the codebase by making a testable function accessible. Add async yields to prevent UI freezing.

3. **Option D** is moderate risk. The synodic calculation is safe, but the verification step's interaction with the trajectory cache requires careful architecture (either a non-caching trajectory prediction path, or accepting 1-2 frames of visual flicker).

4. **Option B** has a critical concurrent operation risk that would require significant architectural changes to address safely. The `solveCourse()` guard is there for good reason; working around it introduces fragility.

5. **Option C** has the highest regression surface area across multiple critical files (renderer.js, index.html, controls.js). The porkchop plot is the most valuable feature but should be implemented only after thorough architecture planning, particularly around canvas management and event handling.

---

*Report generated: 2026-02-05T00:00:00Z*
