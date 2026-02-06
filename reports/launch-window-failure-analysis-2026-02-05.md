# Launch Window Analysis: Failure Analyst Review

**Date**: 2026-02-05
**Reviewer**: Failure Analyst
**Scope**: 5 implementation options for "Launch Window Analysis" feature

---

## Methodology

This review is grounded in examination of the actual codebase, specifically:
- `course-solver.js` (v3.7): Current solver architecture, async patterns, cache behavior
- `trajectory-predictor.js`: Trajectory simulation, 200-step default, cache TTL (500ms base / 2000ms stable)
- `shipPhysics.js`: Frame-rate physics updates, SOI transitions, extreme eccentricity handling
- `orbital-maneuvers.js`: Thrust application via state vectors, NaN guards, eccentricity limits
- `intersectionDetector.js`: Radius crossing detection, bisection refinement, zoom-adaptive precision
- `config.js`: SOI radii, trajectory config (max 1825 days, 12 steps/day, max 6000 steps)
- `gameState.js`: Cache management, transit state, intersection cache with adaptive TTL
- `main.js`: Single-threaded game loop (updatePositions -> render -> updateUI)

All computation runs on the main thread. The existing course solver takes 30-45 seconds for full search and uses `setTimeout(resolve, 0)` yields to prevent blocking.

---

## OPTION A: Phase Angle Coast Timer

### Risk Matrix

| Category | Risk | Severity | Likelihood |
|----------|------|----------|------------|
| Edge Case | Ship in SOI (no heliocentric orbit to compute synodic period from) | Critical | High |
| Edge Case | Ship on hyperbolic orbit (e >= 1): period is undefined, `sqrt(a^3)` yields NaN for a < 0 | Critical | Medium |
| Edge Case | Targeting Pluto (e=0.25): circular orbit assumption off by ~50% in period | Important | High |
| Numerical | `sqrt(a^3/mu)` with negative `a` produces NaN, propagates to UI display | Critical | Medium |
| Numerical | Phase angle calculation near 0 or 360 degrees: ambiguous wrap-around | Important | Medium |
| Performance | <1ms computation, zero frame rate impact | None | N/A |
| Player-Facing | Shows "launch in 221 days" when real window is 180 days due to eccentricity | Important | High |
| Player-Facing | No verification that the window actually works -- player follows advice, misses | Critical | High |
| State Corruption | Ship orbital elements change during display (thrust applied), stale timer | Nice-to-have | Medium |
| Cancellation | Trivial -- no long computation to cancel | None | N/A |

### Specific Concerns

**1. Ship in SOI (Critical)**
When `ship.soiState.isInSOI === true`, the ship's orbital elements are planetocentric, not heliocentric. The synodic period calculation requires the ship's heliocentric orbital period. The code would need to either convert the ship's orbit back to heliocentric or refuse to compute. The existing `stateToElements()` function in `soi.js` handles this conversion, but it requires the planet's heliocentric state vector, which adds complexity. If this is not handled, `meanMotion()` will compute a planetocentric period (e.g., ~27 days for a low Earth orbit) and produce a meaningless launch window.

**2. Hyperbolic orbit NaN propagation (Critical)**
From `orbital.js` line 54: `meanMotion(a, mu)` computes `sqrt(mu / abs(a)^3)`. For hyperbolic orbits, `a < 0`, and while `abs(a)` prevents NaN here, the *synodic period formula* `T_synodic = 1 / |1/T_ship - 1/T_target|` requires `T_ship = 2*PI/n`. For hyperbolic orbits, there is no period. The result would be a meaningless or infinite value. The UI would display "NaN days" or "Infinity days" unless explicitly guarded.

**3. Misleading results for eccentric targets (Important)**
Mercury (e=0.206, i=7 degrees), Mars (e=0.093), and Pluto (e=0.25) have orbits where the Hohmann transfer assumption breaks down. The phase angle for a Hohmann transfer to Mars differs from the actual required phase angle by 5-15 degrees depending on eccentricity and argument of periapsis. For Pluto, the error is extreme -- the "optimal" departure time could be off by months.

**4. No intercept verification (Critical)**
This is the deepest failure mode. The feature tells the player "depart in X days" but never checks if a viable trajectory actually exists at that time. The existing `course-solver.js` shows that even with the correct phase angle, many departure windows produce `NO_CROSSING` or `PHASE_MISS` results. A coast timer without verification is an educated guess presented as fact.

### Domain Confidence: 3/10
The physics model is too simplified for the game's actual orbital mechanics. It would only be useful as a rough "FYI" indicator, not as actionable guidance.

---

## OPTION B: Discrete Coast-Then-Solve Grid Search

### Risk Matrix

| Category | Risk | Severity | Likelihood |
|----------|------|----------|------------|
| Performance | N=25 x 30s = 12.5 minutes blocking/near-blocking computation | Critical | Certain |
| Performance | Memory: 25 full trajectory arrays (each up to 6000 points x 5 floats) = ~3MB | Important | Certain |
| Player-Facing | UI unresponsive for 12+ minutes even with yields (setTimeout(0) only yields ~4ms) | Critical | Certain |
| Player-Facing | User changes destination mid-computation: results become stale | Critical | High |
| Edge Case | Ship in SOI: "coast" means continue planetocentric orbit, but coasting should mean heliocentric coast after SOI exit | Critical | Medium |
| Edge Case | Ship on hyperbolic escape trajectory: coast extrapolation diverges rapidly | Critical | Medium |
| Edge Case | Very high time acceleration during coast: orbital elements drift due to thrust still being active | Important | Medium |
| Numerical | Coast propagation over 1000+ days accumulates floating-point drift in M0 | Important | Medium |
| State Corruption | `getJulianDate()` returns current game time; if game time advances during async computation, departure dates shift | Critical | Certain |
| State Corruption | Course solver reads `ship.orbitalElements` at each evaluation; if physics updates elements during async gap, simulation starts from wrong state | Critical | Certain |
| Cancellation | No abort mechanism in current `solveCourse()`: once started, runs to completion or timeout (90s) | Critical | High |

### Specific Concerns

**1. Main thread starvation (Critical)**
The existing `yieldToMainThread()` in `course-solver.js` uses `setTimeout(resolve, 0)`. In practice, this yields for ~4ms (browser minimum timer resolution). With N=25 sequential solves, each taking 30-45 seconds, the total wall time is 12-19 minutes. During this time, the game loop in `main.js` can only run during the ~4ms gaps between yields. At 60 FPS, a frame is ~16ms. The yield frequency is every 10 evaluations, and each `evaluateCandidate` builds a full trajectory (up to 6000 steps of `getPosition()` + `getVelocity()` + `applyThrust()`). A single evaluation takes ~10-50ms depending on step count. The UI will stutter severely.

**2. Game state mutation during async computation (Critical)**
The course solver reads `getJulianDate()` at line 433 of `course-solver.js` at the start of each `evaluateCandidate()` call. But the game loop continues advancing time via `advanceTime()` in `main.js` line 80. Over a 12-minute computation, at 100000x speed, the game could advance `100000 * 720 / 86400 = 833 days`. The departure dates computed early in the search would be stale by hundreds of days relative to the current game state when the search completes.

This is the same fundamental race condition that exists in the current course solver, but amplified 25x by the grid search.

**3. Coast propagation for SOI ships (Critical)**
When the ship is inside a planetary SOI, "coasting" to a future departure date requires:
1. Computing when the ship exits the SOI (depends on eccentricity, could be hours or never for captured orbits)
2. Converting to heliocentric elements at SOI exit
3. Propagating the heliocentric orbit forward

Step 1 requires the full SOI exit detection logic from `shipPhysics.js` (lines 274-308), including collision prevention. None of this exists in the course solver. Naively propagating planetocentric elements to a future heliocentric departure date would produce garbage coordinates.

**4. Memory accumulation (Important)**
Each solver invocation builds a trajectory array of up to 6000 `{x, y, z, time}` objects. With 25 invocations, that is 150,000 objects created. While each individual array is garbage-collected after evaluation, the peak memory during gradient descent (which evaluates 5 candidates per iteration x 50 iterations = 250 evaluations per solve) could spike. More concerning is that the trajectory cache in `trajectory-predictor.js` and intersection cache in `gameState.js` will be constantly invalidated and rebuilt during the computation, since the game loop continues running.

### Domain Confidence: 6/10
The approach is conceptually sound (try multiple departure dates), but the implementation complexity of coast propagation, state synchronization, and computation time make it impractical without fundamental architectural changes (Web Workers).

---

## OPTION C: Porkchop Plot

### Risk Matrix

| Category | Risk | Severity | Likelihood |
|----------|------|----------|------------|
| Performance | 2500 evaluations x 10ms = 25 seconds main thread computation | Critical | Certain |
| Performance | Canvas heatmap rendering: 2500 rectangles on separate canvas or overlay | Important | Medium |
| Performance | Interaction with existing canvas rendering pipeline (single canvas in `renderer.js`) | Critical | High |
| Player-Facing | Color mapping failure: all cells near-identical distance -> uniform heatmap, no visible contrast | Important | Medium |
| Player-Facing | Click accuracy on 50x50 grid: cells may be as small as 4x4 pixels on mobile | Important | High |
| Edge Case | Ship in SOI: all departure dates require SOI exit simulation | Critical | Medium |
| Edge Case | Target at extreme distance (Pluto): flight durations of 10+ years exceed max trajectory config (1825 days) | Important | Medium |
| Numerical | Distance values spanning 0.001 to 50 AU: logarithmic color scale needed, linear produces white-out | Important | High |
| State Corruption | Porkchop data computed at time T0; by time user clicks a cell, game is at T0+dt; selected window is stale | Important | High |
| State Corruption | Shared canvas: porkchop overlay drawn on same `navCanvas` as game, clears on next render frame | Critical | High |
| Cancellation | User changes destination while 25-second computation runs: results for wrong target | Critical | Medium |

### Specific Concerns

**1. Canvas architecture conflict (Critical)**
The game uses a single `<canvas id="navCanvas">` (main.js line 41). The render pipeline in `renderer.js` clears and redraws the entire canvas every frame. A porkchop plot would need to either:
- Use a separate overlay canvas (requires HTML/CSS changes, z-index management, click event routing)
- Be drawn as part of the existing render pipeline (requires renderer modifications, cleared every frame)
- Replace the main view temporarily (loses situational awareness)

None of these are trivial. The existing renderer has no concept of modal overlays or secondary views. Adding one introduces interaction complexity (mouse events are currently handled by `controls.js` for pan/zoom/click-on-bodies).

**2. Evaluation accuracy vs. cost tradeoff (Important)**
Each cell in the porkchop plot requires a trajectory simulation. The "quick trajectory sim (400 steps)" mentioned in the option description is less accurate than the existing solver's 6000-step simulations. At 400 steps for a 365-day trajectory, each step is ~22 hours. The existing `INTERSECTION_CONFIG.stepsPerDay = 12` (2-hour intervals) was chosen because longer intervals cause thrust direction errors that accumulate into AU-scale trajectory divergence over months. A 400-step sim would underestimate or overestimate distances by 0.1-0.5 AU, making the heatmap unreliable.

Increasing to accurate step counts (4380 steps for 365 days) would change the evaluation time from ~2ms to ~10ms, and total time from 25s to 125s -- a 2-minute computation.

**3. Color scale edge cases (Important)**
When all grid cells produce similar distances (e.g., all > 1 AU for an outer planet with no viable window), the heatmap becomes a uniform color with no useful information. The inverse also fails: when multiple cells are at `INTERCEPT` quality (< SOI radius), they all appear as the minimum color, hiding the distinction between a 0.001 AU and 0.005 AU approach.

A robust implementation needs:
- Logarithmic color scaling
- Adaptive range (auto-scale to data min/max)
- Distinct "no data" color for cells where simulation broke down
- Contour lines or iso-distance curves for readability

**4. Mobile/responsive display (Important)**
On a phone screen (~375px wide), a 50x50 grid produces cells of ~7.5px each. Finger tap precision is ~44px (Apple HIG). The user cannot reliably select individual cells. The existing game already has mobile controls (`initMobileControls()` in main.js), so the infrastructure exists, but a porkchop plot is fundamentally a precision-pointing UI element that is hostile to touch interaction.

### Domain Confidence: 5/10
Porkchop plots are the gold standard for mission design, but the single-threaded canvas architecture, evaluation accuracy requirements, and UI complexity make this a substantial implementation challenge. The result could be impressive but fragile.

---

## OPTION D: Synodic Window + Verification Hybrid

### Risk Matrix

| Category | Risk | Severity | Likelihood |
|----------|------|----------|------------|
| Edge Case | Ship in SOI: synodic period undefined (same as Option A) | Critical | High |
| Edge Case | Hyperbolic ship orbit: no period, filter produces NaN | Critical | Medium |
| Edge Case | Analytical filter false negatives: rejects valid window due to eccentricity | Important | High |
| Edge Case | Analytical filter false positives: passes 20 candidates, verification takes 100+ seconds | Important | Medium |
| Performance | 5 verifications x ~5s = 25 seconds (acceptable per user expectation) | Important | Certain |
| Performance | If filter passes 15+ candidates (eccentric orbits), time balloons to 75+ seconds | Critical | Medium |
| Numerical | Phase angle wrap-around near 0/360 degrees: filter may miss windows at boundary | Important | Medium |
| Player-Facing | "Two physics models disagree" -- filter says good window, solver says NO_CROSSING | Important | High |
| Player-Facing | Filter shows 5 windows but verification confirms 0: "No viable launch windows" after 25s wait | Important | Medium |
| State Corruption | Same as Option B: game state mutates during async verification | Critical | Certain |
| State Corruption | Synodic filter computed at T0, verifications run at T0+dt due to async delays | Important | High |
| Cancellation | Verification is sequential; partial results available but how to display 3/5 verified? | Important | Medium |

### Specific Concerns

**1. Physics model disagreement (Important)**
The analytical filter uses Hohmann transfer assumptions (circular coplanar orbits), while the verification solver uses the full `evaluateCandidate()` from `course-solver.js` which accounts for:
- Continuous thrust (not impulsive)
- Solar sail physics (cos^2 thrust law, not arbitrary thrust vectors)
- Eccentric target orbits
- 3D inclination effects

A solar sail cannot perform a Hohmann transfer -- it applies continuous low thrust with a cos^2(angle) efficiency profile. The Hohmann phase angle is meaningless for solar sails because the transfer is not a conic section. The analytical filter will predict optimal departure windows that have zero relationship to the actual optimal windows for continuous-thrust solar sail transfers. This is not a refinement problem; it is a fundamental physics mismatch.

**Example**: For an Earth-to-Venus transfer:
- Hohmann optimal phase angle: ~54 degrees (for impulsive thrust)
- Solar sail optimal "phase angle": depends entirely on sail yaw, pitch, deployment, and transfer duration. There is no single angle.

The filter would reject departure dates where the phase angle is > 60 degrees, but some of those dates may have viable spiral transfers at yaw=35 degrees that take 540 days instead of the 146-day Hohmann transfer.

**2. False negative problem (Important)**
This is worse than false positives. If the filter rejects a valid window, the player never sees it. The existing course solver already searches 6 horizons (180, 365, 540, 730, 1095, 1460 days) specifically because optimal solar sail transfers often occur at non-Hohmann timescales. A synodic filter tuned for Hohmann transfers would reject most of these.

**3. Variable verification count (Important)**
The number of candidates passing the filter depends on the synodic period and filter tolerance. For Earth-Venus (synodic ~584 days), looking ahead 5 years might produce 3 candidates. For Earth-Mars (synodic ~780 days), 2-3 candidates. For Earth-Jupiter (synodic ~399 days), 4-5 candidates. But with a loose filter (to avoid false negatives), the count could double. There is no deterministic computation time bound, which makes progress reporting to the user unreliable.

### Domain Confidence: 4/10
The fundamental problem is that Hohmann phase angles are the wrong model for solar sail transfers. The analytical filter saves time by pre-screening, but it pre-screens against the wrong criteria. This would need a sail-specific analytical model to be reliable.

---

## OPTION E: Incremental Departure Sweep

### Risk Matrix

| Category | Risk | Severity | Likelihood |
|----------|------|----------|------------|
| Performance | 350 simulations x ~2ms = ~700ms total: excellent, within single frame budget | None | N/A |
| Edge Case | Only 10 predefined strategies: optimal at yaw=42 degrees missed entirely | Critical | High |
| Edge Case | All 10 strategies fail for outer planet targets (Jupiter+): "no window found" when one exists | Critical | High |
| Edge Case | Ship in SOI: same departure propagation issues as Options B/D | Critical | Medium |
| Edge Case | Strategy that works at departure T but fails at T+30d: discontinuous results confuse player | Important | Medium |
| Numerical | 400-step simulations at ~2ms: step size is `duration/400` = ~0.15 days for 60-day duration, fine; but for 1825-day duration, step size is ~4.6 days (thrust direction error accumulates) | Important | High |
| Player-Facing | "Best window: depart in 145 days, estimated approach: 0.3 AU" when real solver gets 0.005 AU at yaw=42 | Critical | High |
| Player-Facing | Results shown as "window" but confidence is low; player may not understand limitations | Important | High |
| State Corruption | 700ms computation fits in ~42 frames at 60fps; minimal state drift | Nice-to-have | Low |
| Cancellation | 700ms is fast enough that cancellation is unnecessary | None | N/A |

### Specific Concerns

**1. Strategy grid resolution (Critical)**
The option mentions "10 predefined angles." The current course solver (`course-solver.js`) searches yaw from -60 to +60 in 5-degree steps and pitch from -30 to +30 in 5-degree steps, producing 25 x 13 = 325 coarse candidates. It then refines with fine (2-degree), ultra-fine (0.1-degree), and uber-fine (0.01-degree) phases. The optimal sail angle for a given transfer is often unique to within 0.1 degrees.

With only 10 strategies, the chance of including the optimal angle is approximately `10 / 325 = 3%`. Even if the strategies are well-chosen (e.g., optimal Hohmann angle, prograde, retrograde, +/- 15 degrees, etc.), they will miss the specific angle needed for a given departure date and target combination.

**Concrete failure scenario**: The player targets Venus. The optimal transfer from the current orbit requires yaw=37.2 degrees, pitch=-4.8 degrees. The 10 strategies include 0, 10, 20, 30, 40, 50, -10, -20, -30 degrees yaw at pitch=0. The closest strategy (yaw=40) produces a 0.15 AU approach. The actual optimal produces 0.004 AU. The launch window analysis reports "MARGINAL" instead of "INTERCEPT," causing the player to skip a viable window.

**2. Duration vs. accuracy tradeoff (Important)**
At 400 steps, the accuracy depends heavily on the trajectory duration:
- 60-day trajectory: 0.15-day steps (3.6 hours) -- adequate, matches existing `stepsPerDay: 12`
- 365-day trajectory: 0.9-day steps (21.6 hours) -- poor, thrust direction errors compound
- 1825-day trajectory: 4.6-day steps -- catastrophic, each step applies thrust in a fixed direction for 4.6 days while the ship moves ~0.05 AU

For outer planet transfers, the 400-step limitation makes the trajectory prediction unreliable. Increasing steps improves accuracy but pushes computation time beyond the 700ms target.

**3. Discontinuous results (Important)**
Because different strategies work for different departure dates, the results can be highly non-smooth. Departure at day 100 might show strategy #3 (yaw=20) as best with 0.08 AU approach, while departure at day 130 shows strategy #7 (yaw=-10) as best with 0.12 AU approach. This produces a jagged, hard-to-interpret results set. The player sees "windows" that flicker in quality as they scan departure dates, with no clear pattern.

**4. False "no window" for outer planets (Critical)**
For Jupiter (a=5.2 AU), a solar sail transfer from Earth orbit (a=1.0 AU) requires precise yaw angles sustained over 2-3 years. The 10 predefined strategies are unlikely to include the exact angle that achieves the spiral trajectory needed. All 35 departure dates would show "NO_CROSSING" for all strategies, and the player would conclude "no launch window exists for Jupiter" -- which is false.

The existing course solver handles this by searching 325 coarse candidates across 6 horizons (up to 1460 days), precisely because outer planet transfers require both the right angle AND the right duration to be found simultaneously.

### Domain Confidence: 7/10
The performance characteristics are excellent, and the approach is sound for a "quick estimate" feature. However, the 10-strategy limitation creates an unacceptably high false-negative rate for outer planets and transfers requiring non-obvious sail angles. This could be mitigated by increasing the strategy count to 50-100 (still fast at ~3.5-7 seconds), but at that point it converges toward a simplified version of the existing course solver.

---

## Cross-Cutting Concerns (All Options)

### 1. Game State Race Conditions
All options except A and E face the fundamental problem that `getJulianDate()` advances continuously during async computation. The course solver already has this bug -- it reads `getJulianDate()` at line 433 of each `evaluateCandidate()` call, meaning candidates evaluated later in the search simulate from a slightly different start time than earlier candidates. For a 45-second search at 100000x speed, this is a ~0.5 day drift per second, or ~22.5 days total. For launch window analysis, this is much worse because the computation spans many departure dates.

**Mitigation**: Snapshot `julianDate` at computation start and pass it explicitly to all evaluations.

### 2. Ship in SOI
Every option must handle the case where the ship is currently inside a planetary SOI. The ship's orbital elements are planetocentric, not heliocentric. Any launch window analysis that assumes heliocentric elements will produce garbage results. Options A, D, and E are particularly vulnerable because they use simplified physics models that have no SOI awareness.

The existing `course-solver.js` has this same limitation -- it always simulates from the current orbital elements without SOI conversion. This works because the solver is typically called while in heliocentric space, but a launch window feature implies "when should I depart?" which could be asked while in orbit around Earth.

### 3. Cancellation Architecture
The current codebase has no cancellation mechanism for async computations. `solveCourse()` runs to completion or hits the 90-second timeout. Any option with > 5 second computation time needs an abort signal (AbortController or similar) that the game loop can trigger when the user changes destination, adjusts sail settings, or navigates away from the UI.

### 4. Cache Interactions
The trajectory cache (500ms / 2000ms TTL in `trajectory-predictor.js`) and intersection cache (500ms / 2000ms TTL in `gameState.js`) will be disrupted by any option that runs trajectory simulations. The periodic memory cleanup in `main.js` (every 3600 frames = 60 seconds) will clear caches during long computations. Launch window results should use a separate cache, not interact with the existing trajectory/intersection cache hierarchy.

### 5. Display of Uncertain Results
None of the options address how to display results with appropriate uncertainty. The existing course solver returns `quality` and `confidence` ratings. Launch window results should similarly convey:
- "Good window, high confidence" (solver verified intercept)
- "Possible window, low confidence" (analytical estimate only)
- "No window found, but search may have missed narrow openings"

Without this, players will either over-trust bad results or under-trust good results.

---

## Comparative Risk Summary

| Option | Computation Time | Accuracy | SOI Handling | NaN Risk | UI Blocking | Overall Risk |
|--------|-----------------|----------|--------------|----------|-------------|--------------|
| A | <1ms | Very Low | Broken | High | None | HIGH (misleading) |
| B | 12-19 minutes | High | Broken | Low | Extreme | CRITICAL (unusable) |
| C | 25-125 seconds | Medium-High | Broken | Medium | Severe | HIGH (complex) |
| D | 25-75 seconds | Medium | Broken | Medium | Moderate | HIGH (wrong model) |
| E | 700ms | Low-Medium | Broken | Low | None | MODERATE (incomplete) |

### Key Observation
All five options share the same critical failure: **SOI handling is completely absent**. If the player asks "when should I launch?" while orbiting Earth, every option produces incorrect or meaningless results. This is the single most important cross-cutting concern and should be resolved before choosing an implementation approach.

### Recommendations

1. **Fix SOI first**: Before implementing any option, add a heliocentric element conversion step that handles ships currently in SOI. This exists in `soi.js` via `planetocentricToHelio()` and `stateToElements()`.

2. **Snapshot game state**: All options should capture `julianDate` and `ship.orbitalElements` at computation start and use those snapshots throughout, not live game state.

3. **Add cancellation**: Implement an AbortController pattern for any computation > 1 second. The current `solveCourse()` should get this too.

4. **Separate cache namespace**: Launch window results should not interact with trajectory/intersection caches. Use a dedicated `launchWindowCache` in `gameState.js`.

5. **Option ranking by risk/reward**:
   - **Best risk profile**: Option E (fast, low blocking, imperfect but usable)
   - **Best accuracy potential**: Option C (porkchop plot, but needs architectural work)
   - **Worst risk profile**: Option B (computation time makes it impractical)
   - **Most deceptive**: Option A (presents low-confidence results as authoritative)

---

*Report generated by Failure Analyst perspective for the Sailship project.*
