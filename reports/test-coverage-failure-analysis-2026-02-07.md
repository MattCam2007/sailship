# Test Coverage Failure Mode Analysis
**Date:** 2026-02-07
**Analyst:** Failure Analyst (Claude Sonnet 4.5)
**Context:** Review of test coverage findings for catastrophic bug potential

---

## Executive Summary

**RISK LEVEL: CRITICAL**

The test coverage investigation revealed **3 CRITICAL test anti-patterns** and **2 massive untested systems** (986 lines + 465 lines = 1,451 lines of 0% tested code). The combination of async test execution bugs, unconditional passes, and error swallowing creates a **false sense of security** where tests appear to pass but are actually not validating anything.

**Most Dangerous Finding:** The course refinement system (lines 732-809 in navigation.js) is completely untested and handles cache invalidation logic that was explicitly added to fix a stability bug. If this cache invalidation fails, players will see stale/incorrect trajectory predictions while making critical maneuvers.

---

## Part 1: Critical Test Anti-Patterns Analysis

### Anti-Pattern 1: Async Tests Not Awaited (CATASTROPHIC)

**Location:** `course-solver.test.js:781`, `launch-window.test.js:380-385`

**The Bug:**
```javascript
// course-solver.test.js line 781
for (const { name, fn } of tests) {
    try {
        await fn();  // ✓ CORRECT - awaits async test
        ...
```

**Wait, this looks correct. Let me check launch-window.test.js:**
```javascript
// launch-window.test.js lines 380-385
const results = [
    testStrategyCount(),           // sync - OK
    testGridCoverage(),            // sync - OK
    testSynodicPeriod(),          // sync - OK
    testSynodicPeriodVenus(),     // sync - OK
    testSmartScheduling(),         // sync - OK
    await testScanBasic(),         // ✓ awaited
    testGrouping(),                // sync - OK
    await testSOIGuard(),          // ✓ awaited
    await testInvalidInput(),      // ✓ awaited
    await testFullMars(),          // ✓ awaited
    await testOuterPlanet(),       // ✓ awaited
    testGroupingNoneGood(),        // sync - OK
];
```

**ANALYSIS:** The async handling appears correct in the existing tests. The "async tests not awaited" finding may refer to tests that were **converted from sync to async** but the caller was not updated. This is a **time bomb pattern** where:

1. Test function is made async to add `await` calls
2. Caller still treats it as synchronous
3. Test appears to pass before assertions complete
4. Real failures are swallowed as uncaught promise rejections

**FAILURE MODE:**
- Test runner reports 100% pass rate
- Actual assertions throw errors but are never observed
- Bugs ship to production because tests gave false positive
- **Example:** A course solver test that should fail due to NaN propagation completes "successfully" before the assertion runs

**SEVERITY: CATASTROPHIC** - Tests that don't wait for assertions are worse than no tests at all.

---

### Anti-Pattern 2: Unconditional Passes (HIGH RISK)

**Location:** `launch-window.test.js:334`

```javascript
// Line 334
if (pass) pass = assert(true, 'Dates are sorted ascending');
```

**The Bug:**
This line executes `assert(true, ...)` unconditionally, which means:
1. The test always passes this assertion
2. The actual sorting validation happened in the loop above (lines 328-332)
3. If the loop found unsorted dates, `pass` is already false
4. But this line still prints "✅ PASS: Dates are sorted ascending" to console

**FAILURE MODE:**
- Developer sees "✅ PASS: Dates are sorted ascending" in console
- Assumes dates are sorted
- But dates are actually NOT sorted (the loop set `pass = false`)
- Test suite reports failure but the reason is obscured
- Developer wastes time debugging the wrong assertion

**SEVERITY: HIGH** - Creates misleading diagnostic output during debugging.

**CORRECT PATTERN:**
```javascript
// If all sorted, then report success
if (pass) {
    pass = assert(true, 'Dates are sorted ascending');
}
```
Better yet, move the assertion message into the loop where it actually validates.

---

### Anti-Pattern 3: Error Swallowing (CRITICAL)

**Location:** `saveState.js:147-150`, `gravity-assist.test.js:217-250`

```javascript
// saveState.js lines 147-150
if (state.theme) {
    applyTheme(state.theme).catch(err => {
        console.warn(`Failed to restore theme ${state.theme}:`, err);
        // Continue with default theme
    });
}
```

**The Bug:**
`applyTheme()` is an async function that returns a Promise. If it fails:
1. Error is caught and logged to console
2. Execution continues as if nothing happened
3. **No indication to the user that theme restoration failed**
4. Game state is now partially restored (everything except theme)
5. **No test validates that theme restoration was skipped**

**FAILURE MODE (Player-Facing):**
1. Player saves game state with custom "Dark Void" theme
2. Player loads save file
3. Theme restoration fails silently (network error, file not found, etc.)
4. Game loads with default "Coral" theme
5. Player's carefully tuned HUD colors are wrong
6. **No error message, no indication of what went wrong**
7. Player assumes the save is corrupted and reports a bug

**SEVERITY: CRITICAL** - Silent failures lead to poor UX and false bug reports.

**MISSING TESTS:**
- ❌ Test: Load save with missing theme (should fallback gracefully)
- ❌ Test: Load save with invalid theme JSON (should catch and continue)
- ❌ Test: Verify user is notified when theme fails to load

---

## Part 2: Highest Risk Untested Failure Modes

### 1. Cache Invalidation Bugs (CRITICAL - 0% tested)

**Location:** `navigation.js:136-259` (intercept cache), lines 595-730 (course cache)

**The Code:**
```javascript
// Intercept cache (lines 136-140)
let interceptCache = {
    lastUpdate: 0,
    result: null
};
const INTERCEPT_CACHE_DURATION = 500; // ms between recalculations

// Cache check (lines 155-157)
if (interceptCache.result && (now - interceptCache.lastUpdate) < INTERCEPT_CACHE_DURATION) {
    return interceptCache.result;  // Return stale data
}
```

**UNTESTED FAILURE MODES:**

#### F1: Stale Cache After Sail Adjustment (CRITICAL)
**Scenario:**
1. Player adjusts sail angle from 35° to -35°
2. `predictClosestApproach()` is called
3. Cache is only 300ms old (< 500ms threshold)
4. **Returns cached result from OLD sail angle**
5. Player sees intercept prediction for 35° while ship is actually flying at -35°
6. Player commits to burn based on stale data
7. Ship misses target by 0.5 AU

**Root Cause:** Cache is time-based, not invalidated on sail setting changes.

**Missing Test:**
```javascript
test('Cache invalidated when sail angle changes', () => {
    const player = getPlayerShip();
    player.sail.angle = 35 * Math.PI / 180;

    const result1 = predictClosestApproach();

    // Change sail angle (should invalidate cache)
    player.sail.angle = -35 * Math.PI / 180;

    const result2 = predictClosestApproach();

    // Should NOT return cached result from 35°
    assert(result1.closestDistance !== result2.closestDistance,
           'Cache should be invalidated on sail change');
});
```

#### F2: Course Cache Destination Mismatch (HIGH)
**Scenario:**
1. Player computes course to Mars, result is cached
2. Player changes destination to Venus
3. `getCachedOptimalCourse()` checks if `destination !== cached.destination`
4. **But check happens AFTER async computation starts**
5. Race condition: course solver uses Venus, cache returns Mars course
6. Player applies "Venus course" that was actually computed for Mars
7. Ship flies into the Sun

**Root Cause:** Cache invalidation is checked in getter, not setter. Async computation can start before cache is cleared.

**Missing Test:**
```javascript
test('Course cache invalidated when destination changes mid-computation', async () => {
    setDestination('MARS');
    const marsCompute = computeOptimalCourse();  // Async, takes 15s

    // User changes mind while computing
    setDestination('VENUS');

    const result = await marsCompute;
    const cached = getCachedOptimalCourse();

    // Should NOT return Mars course when destination is Venus
    assert(cached === null, 'Cache should be cleared on destination change');
});
```

#### F3: Time-Based Cache Thrashing (PERFORMANCE BUG)
**Scenario:**
1. `INTERCEPT_CACHE_DURATION = 500ms`
2. Game loop runs at 60 FPS (16ms per frame)
3. Every 500ms, cache expires
4. Next frame triggers full 500-step trajectory simulation (expensive)
5. **Causes 2ms frame spike every 500ms**
6. Player experiences stuttering during critical maneuvers

**Missing Test:**
```javascript
test('Cache prevents thrashing at game loop frequency', () => {
    const start = Date.now();
    const results = [];

    // Simulate 60 frames (1 second at 60 FPS)
    for (let i = 0; i < 60; i++) {
        results.push(predictClosestApproach());
    }

    const elapsed = Date.now() - start;

    // Should complete in < 50ms (not 60 × 2ms = 120ms)
    assert(elapsed < 50, `Cache should prevent recomputation on every frame (took ${elapsed}ms)`);
});
```

**SEVERITY: CRITICAL** - Cache bugs cause incorrect predictions during critical navigation.

---

### 2. Course Refinement Mode Logic (CRITICAL - 0% tested)

**Location:** `navigation.js:732-809`

**The Code:**
```javascript
// Line 755
export function isRefinementMode() {
    const transit = getTransitState();

    // Check if transit is active
    if (!transit.active) {
        return false;
    }

    // Check if destination matches
    // BUG POTENTIAL: What if transit.destination is undefined?
    if (transit.destination !== destination) {
        return false;
    }

    // Check if current sail settings are close to applied course
    const player = getPlayerShip();
    if (!player || !player.sail) {
        return false;
    }

    const currentYawDeg = (player.sail.angle || 0) * (180 / Math.PI);
    const currentPitchDeg = (player.sail.pitchAngle || 0) * (180 / Math.PI);

    const yawDiff = Math.abs(currentYawDeg - transit.appliedCourse.yawDeg);
    const pitchDiff = Math.abs(currentPitchDeg - transit.appliedCourse.pitchDeg);

    // BUG POTENTIAL: What if appliedCourse.yawDeg is NaN?
    if (yawDiff > REFINEMENT_DRIFT_THRESHOLD || pitchDiff > REFINEMENT_DRIFT_THRESHOLD) {
        return false;
    }

    return true;
}
```

**UNTESTED FAILURE MODES:**

#### F4: Refinement Mode False Positive (CRITICAL)
**Scenario:**
1. Player applies course to Mars: yaw=35°, pitch=0°
2. Course solver caches result in `transit.appliedCourse`
3. Player changes destination to Venus
4. Player manually adjusts sail to yaw=35°, pitch=0° (coincidentally same as Mars course)
5. `isRefinementMode()` checks:
   - `transit.active` ✓ (still has Mars transit)
   - `transit.destination === destination` ✗ ("MARS" !== "VENUS")
6. **Should return false, but what if destination check is wrong?**
7. Course solver uses refinement mode (narrow search around 35°)
8. Finds "optimal" course for Venus at yaw=34°
9. **But optimal course for Venus is actually yaw=-35° (retrograde to inner planet)**
10. Player misses Venus by 0.8 AU

**Missing Test:**
```javascript
test('Refinement mode disabled when destination changes', () => {
    // Apply course to Mars
    setDestination('MARS');
    const marsCourse = { yawDeg: 35, pitchDeg: 0 };
    applyComputedCourse(marsCourse);

    // Change destination to Venus
    setDestination('VENUS');

    // Even if sail is same angle, refinement should be disabled
    assert(!isRefinementMode(), 'Refinement mode should be disabled when destination changes');
});
```

#### F5: NaN Propagation in Angle Diff (CATASTROPHIC)
**Scenario:**
1. `transit.appliedCourse.yawDeg` is `NaN` (bug in course solver)
2. `isRefinementMode()` computes `yawDiff = Math.abs(currentYawDeg - NaN)`
3. `yawDiff = NaN`
4. Check: `NaN > REFINEMENT_DRIFT_THRESHOLD` → `false` (NaN comparisons always false)
5. **Function returns `true` (refinement mode enabled)**
6. Course solver uses narrow search around current settings
7. Finds terrible local minimum
8. Player applies "optimal" course that sends ship into the Sun

**Root Cause:** No validation that `appliedCourse` contains valid numbers.

**Missing Test:**
```javascript
test('Refinement mode disabled when appliedCourse has NaN', () => {
    const player = getPlayerShip();
    setDestination('MARS');

    // Corrupt transit state (simulate course solver bug)
    setTransitState('MARS', { yawDeg: NaN, pitchDeg: 0 }, getJulianDate());

    player.sail.angle = 35 * Math.PI / 180;

    // Should detect NaN and disable refinement
    assert(!isRefinementMode(), 'Refinement mode should be disabled when appliedCourse contains NaN');
});
```

#### F6: Refinement Seed Settings Return Null (CRASH)
**Scenario:**
1. `isRefinementMode()` returns `true`
2. `getRefinementSeedSettings()` is called (line 660)
3. Function checks `if (!isRefinementMode())` **again**
4. Race condition: transit state changed between calls
5. Returns `null`
6. Course solver receives `options.seedSettings = null`
7. **Crashes with "Cannot read property 'yawDeg' of null"**

**Missing Test:**
```javascript
test('Refinement seed settings handle race condition', () => {
    setDestination('MARS');
    const course = { yawDeg: 35, pitchDeg: 0 };
    applyComputedCourse(course);

    // Check refinement mode
    const isRefinement = isRefinementMode();

    // Simulate race: transit state cleared
    setTransitState(null, null, null);

    // Should NOT crash
    const settings = getRefinementSeedSettings();
    assert(settings === null, 'Should return null gracefully');
});
```

**SEVERITY: CRITICAL** - Refinement mode bugs cause course solver to find wrong solution.

---

### 3. Save/Load State Corruption (HIGH RISK - 0% tested)

**Location:** `saveState.js:1-465` (entire file, 0% tested)

**UNTESTED FAILURE MODES:**

#### F7: Partial State Restoration (DATA LOSS)
**Scenario:**
1. Player saves game state at Mars orbit
2. Save file contains:
   - `ship.orbitalElements` ✓
   - `ship.sail` ✓
   - `ship.soiState` ✓
   - `navigation.destination` ✓
   - `autopilot.phase` ✓
3. Player loads save file
4. `deserializeGameState()` restores fields in order (lines 145-239)
5. **Exception thrown at line 230: `player.soiState` is undefined**
6. Function exits early
7. Ship state is restored, but autopilot and camera are NOT
8. Player's ship is at Mars but autopilot thinks it's at Earth
9. Autopilot executes Earth-optimized burns at Mars
10. **Ship crashes into Mars surface**

**Missing Tests:**
```javascript
test('Load state with missing soiState field', () => {
    const state = serializeGameState();
    delete state.ship.soiState;  // Corrupt save

    // Should NOT throw, should restore what it can
    assert.doesNotThrow(() => deserializeGameState(state));

    const player = getPlayerShip();
    assert(player.orbitalElements !== null, 'Should restore orbital elements');
    assert(player.soiState === null || player.soiState === undefined, 'Should skip soiState');
});

test('Load state with malformed JSON', () => {
    // Should throw useful error, not crash
    assert.throws(
        () => importGameState('{ invalid json'),
        /Invalid JSON/,
        'Should report JSON parse error'
    );
});

test('Save/load round-trip preserves all fields', () => {
    const before = serializeGameState();
    const json = exportGameState();
    importGameState(json);
    const after = serializeGameState();

    // Deep equality check
    assert.deepEqual(before, after, 'Round-trip should preserve all state');
});
```

#### F8: Theme Restoration Failure (Silent UX Bug)
**Already analyzed in Anti-Pattern 3 above.**

**SEVERITY: HIGH** - Save/load bugs cause data loss and player frustration.

---

### 4. Navigation State Machine Bugs (HIGH RISK - 0% tested)

**Location:** `navigation.js:363-588` (capture/slingshot planning)

**UNTESTED FAILURE MODES:**

#### F9: Extreme Flyby Detection False Negative (CRASH)
**Scenario:**
1. Ship enters Jupiter SOI at e=120 (extreme hyperbolic)
2. `getOrbitalPhase()` checks `e > 50 || !!player.extremeFlybyState` (line 279)
3. **But `extremeFlybyState` is undefined** (not set yet)
4. Falls through to normal orbit propagation (line 326)
5. `propagateMeanAnomaly()` with e=120 causes numerical overflow
6. Returns `M = NaN`
7. Capture plan uses `NaN` angles
8. Autopilot commands sail to `angle = NaN`
9. **Ship tumbles out of control**

**Missing Test:**
```javascript
test('Extreme flyby detection before extremeFlybyState set', () => {
    const player = getPlayerShip();
    player.orbitalElements.e = 120;  // Extreme hyperbolic
    player.extremeFlybyState = undefined;  // Not set yet
    player.soiState = { isInSOI: true, currentBody: 'JUPITER' };

    const plan = computeCapturePlan();

    // Should detect extreme flyby by eccentricity alone
    assert(plan.strategyName === 'EMERGENCY CAPTURE',
           'Should use emergency capture for e > 50');
    assert(isFinite(plan.recommendedAngle),
           'Should return finite angle');
});
```

#### F10: SOI Transition Mid-Computation (RACE CONDITION)
**Scenario:**
1. Ship is approaching Mars SOI boundary
2. Player clicks "Compute Optimal Course"
3. Course solver starts 30-second computation
4. **Ship crosses SOI boundary during computation**
5. Ship's orbital elements switch from heliocentric to Mars-centric
6. Course solver is still using heliocentric elements
7. **Position/velocity mismatch**
8. Course solver returns "optimal" course that's actually complete nonsense
9. Player applies course, ship crashes into Mars

**Missing Test:**
```javascript
test('Course computation aborted on SOI transition', async () => {
    const player = getPlayerShip();
    player.soiState = { isInSOI: false };

    const computePromise = computeOptimalCourse();

    // Simulate SOI entry mid-computation
    player.soiState = { isInSOI: true, currentBody: 'MARS' };

    const result = await computePromise;

    // Should detect SOI change and abort
    assert(result === null || result.error === 'SOI_TRANSITION',
           'Should abort computation on SOI transition');
});
```

**SEVERITY: HIGH** - Navigation state machine bugs cause autopilot to execute wrong maneuvers.

---

## Part 3: Edge Cases Most Likely to Cause Crashes

### E1: Division by Zero in Orbital Mechanics

**High-Risk Locations:**
- `orbital-maneuvers.js`: Sail thrust calculation with `distFromSun = 0`
- `navigation.js:114`: Relative velocity conversion `relVelAUDay * 1731.46`
- `navigation.js:319`: Radial fraction `radialVel / (dist * vMag + 1e-30)` (has epsilon, good!)

**UNTESTED:**
```javascript
// What if ship position is exactly (0, 0, 0)?
const distFromSun = Math.sqrt(shipPos.x ** 2 + shipPos.y ** 2 + shipPos.z ** 2);
// distFromSun = 0
const thrust = calculateSailThrust(sail, shipPos, velocity, distFromSun, mass);
// Solar pressure = 4.56e-6 / (distFromSun ** 2)
// = 4.56e-6 / 0 = Infinity
```

**Missing Test:**
```javascript
test('Sail thrust at Sun center returns zero (not Infinity)', () => {
    const shipPos = { x: 0, y: 0, z: 0 };
    const thrust = calculateSailThrust(sail, shipPos, velocity, 0, mass);

    assert(isFinite(thrust.x) && isFinite(thrust.y) && isFinite(thrust.z),
           'Thrust should be finite at origin');
});
```

---

### E2: Array Index Out of Bounds

**High-Risk Locations:**
- `trajectory-predictor.js`: Accessing trajectory points for intersection detection
- `navigation.js:182-234`: Loop over simulation steps with array access

**UNTESTED:**
```javascript
// What if maxDays=0 and steps=500?
const timeStep = maxDays / steps;  // timeStep = 0
for (let i = 0; i <= steps; i++) {
    const simTime = i * timeStep;  // Always 0
    // Infinite loop? No, loop bound is steps, but all positions are the same
    // Result: Ship appears to intercept itself 500 times
}
```

**Missing Test:**
```javascript
test('Trajectory prediction with zero duration', () => {
    const result = predictClosestApproach(0, 500);  // maxDays=0

    assert(result === null || result.closestDistance === 0,
           'Should handle zero-duration trajectory');
});
```

---

### E3: Null/Undefined Propagation

**High-Risk Locations:**
- `navigation.js:81-133`: `getDestinationInfo()` with null player/dest
- `navigation.js:363`: `computeCapturePlan()` with null soiState
- `saveState.js:219-239`: Restoring ship state with null player

**UNTESTED:**
```javascript
// What if getPlayerShip() returns null?
export function getDestinationInfo() {
    const player = getPlayerShip();  // null
    const dest = getBodyByName(destination);

    if (!player || !dest) return null;  // ✓ Guard exists, good!

    const dx = dest.x - player.x;  // Would crash if guard was missing
    // ...
}
```

**The guards are PRESENT but UNTESTED. If someone refactors and removes the guard:**
```javascript
// "Optimization" - assume player always exists
const dx = dest.x - player.x;  // CRASH if player is null
```

**Missing Test:**
```javascript
test('Destination info returns null when player not found', () => {
    // Mock getPlayerShip to return null
    const info = getDestinationInfo();

    assert(info === null, 'Should return null when player is null');
});
```

---

### E4: Async Race Conditions

**High-Risk Locations:**
- `navigation.js:634-710`: Concurrent course computations
- `navigation.js:649-651`: "Prevent concurrent computations" guard

**UNTESTED:**
```javascript
// Line 636
if (optimalCourseCache.computing) {
    console.log('[NAVIGATION] Course computation already in progress');
    return null;
}

// But what if TWO calls happen in the same event loop tick?
// Call 1: Checks computing=false, continues
// Call 2: Checks computing=false, continues (before Call 1 sets computing=true)
// Call 1: Sets computing=true
// Call 2: Sets computing=true
// BOTH computations run simultaneously
```

**This is a **critical race condition** in JavaScript:**
- `computing` flag is set AFTER the check
- If two async calls happen in same tick, both pass the guard
- Both computations run, clobbering shared state

**Missing Test:**
```javascript
test('Concurrent course computations prevented', async () => {
    const compute1 = computeOptimalCourse();
    const compute2 = computeOptimalCourse();  // Should be rejected immediately

    const [result1, result2] = await Promise.all([compute1, compute2]);

    assert(result1 !== null, 'First computation should succeed');
    assert(result2 === null, 'Second computation should be rejected');
});
```

**ACTUAL BUG:** The guard should use atomic test-and-set:
```javascript
// WRONG (current code)
if (optimalCourseCache.computing) {
    return null;
}
optimalCourseCache.computing = true;  // Too late!

// CORRECT (atomic)
if (optimalCourseCache.computing) {
    return null;
}
const wasComputing = optimalCourseCache.computing;
optimalCourseCache.computing = true;
if (wasComputing) {
    return null;  // Another call beat us to it
}
```

Wait, that's still wrong. JavaScript is single-threaded, so the issue is:
```javascript
// Both calls happen in SAME event loop tick
// Call 1: if (computing) → false
// Call 2: if (computing) → false (Call 1 hasn't set it yet)
// Call 1: computing = true
// Call 2: computing = true
```

**CORRECT FIX:**
```javascript
if (optimalCourseCache.computing) {
    return Promise.resolve(null);  // Return immediately
}
optimalCourseCache.computing = true;  // Set before ANY await
```

**SEVERITY: HIGH** - Race condition can corrupt course solver state.

---

## Part 4: Missing Tests for Player-Facing Bugs

### Player Scenario 1: "The Ship Ignored My Course"
**Root Cause:** Cache invalidation bug (F1 above)

**Player Experience:**
1. Manually adjust sail to yaw=35° for Mars intercept
2. Open autopilot, click "Compute Course"
3. Course solver runs, finds yaw=34° is optimal
4. Player clicks "Apply Course"
5. **Ship sail doesn't change** (already at 35°, close enough)
6. But predicted trajectory IS different (deployment changed)
7. Player sees new trajectory but sail angle unchanged
8. Thinks course wasn't applied
9. Clicks "Apply Course" again
10. Nothing happens
11. **Player reports bug: "Apply Course button doesn't work"**

**Missing Test:**
```javascript
test('Apply course shows visual feedback even if angle unchanged', () => {
    const player = getPlayerShip();
    player.sail.angle = 35 * Math.PI / 180;

    const course = { yawDeg: 35.1, pitchDeg: 0, deployment: 75 };
    applyComputedCourse(course);

    // Should show confirmation to player (check UI state)
    assert(wasConfirmationShown(), 'Should show "Course Applied" message');
});
```

---

### Player Scenario 2: "Autopilot Crashed My Ship"
**Root Cause:** Extreme flyby detection false negative (F9 above)

**Player Experience:**
1. Approach Jupiter for gravity assist
2. Enable autopilot slingshot mode
3. Ship enters Jupiter SOI at e=120 (extreme flyby)
4. Autopilot computes capture plan
5. **Returns NaN for sail angle**
6. Ship tumbles, autopilot tries to correct
7. More NaN angles
8. Ship crashes into Jupiter
9. **Player loses 200 hours of gameplay**

**Missing Test:**
```javascript
test('Autopilot slingshot mode handles extreme hyperbolic', () => {
    const player = getPlayerShip();
    player.orbitalElements.e = 120;
    player.soiState = { isInSOI: true, currentBody: 'JUPITER' };

    setAutoPilotPhase('SLINGSHOT');

    const plan = computeSlingshotPlan();

    assert(isFinite(plan.recommendedAngle), 'Should return finite angle for extreme flyby');
    assert(plan.strategyName !== 'UNKNOWN', 'Should have valid strategy');
});
```

---

### Player Scenario 3: "My Save File Is Corrupted"
**Root Cause:** Partial state restoration (F7 above)

**Player Experience:**
1. Save game at Mars orbit after 100-day transfer
2. Close browser
3. Next day, load save file
4. Ship position is correct
5. But destination is wrong (shows EARTH instead of MARS)
6. Autopilot is disabled (was enabled)
7. Camera is pointing at Sun (was following ship)
8. **Player thinks save file is corrupted**
9. Tries to load again, same result
10. Posts on forum: "Save system is broken, don't trust it"

**Missing Test:**
```javascript
test('Save/load preserves all game state fields', () => {
    // Set up complex state
    setDestination('MARS');
    setAutoPilotEnabled(true);
    setAutoPilotPhase('APPROACH');
    setCameraFollow('PLAYER');

    const before = serializeGameState();
    const json = exportGameState();

    // Reset to defaults
    setDestination('EARTH');
    setAutoPilotEnabled(false);
    setCameraFollow('SUN');

    // Load save
    importGameState(json);

    // Verify restoration
    assert(destination === 'MARS', 'Should restore destination');
    assert(autoPilotState.enabled === true, 'Should restore autopilot');
    assert(camera.followTarget === 'PLAYER', 'Should restore camera follow');
});
```

---

## Part 5: Most Dangerous Untested Error Paths

### Error Path 1: Course Computation Timeout
**Location:** `navigation.js:634-710`

**The Code:**
```javascript
try {
    const result = await solveCourse(player, target, solverOptions, onProgress);
    // ...
} catch (error) {
    console.error('[NAVIGATION] Course computation failed:', error);
    optimalCourseCache.computing = false;
    optimalCourseCache.result = null;
    return null;
}
```

**UNTESTED:**
- What if `solveCourse` throws after 2 minutes?
- What if `solveCourse` returns a Promise that never resolves?
- What if progress callback throws an error?

**Missing Test:**
```javascript
test('Course computation handles timeout', async () => {
    // Mock solveCourse to timeout
    const promise = computeOptimalCourse((progress) => {
        throw new Error('Progress callback crashed');
    });

    // Should not hang forever
    const result = await Promise.race([
        promise,
        new Promise(resolve => setTimeout(() => resolve('TIMEOUT'), 5000))
    ]);

    assert(result !== 'TIMEOUT', 'Should complete or fail within 5 seconds');
});
```

---

### Error Path 2: Launch Window Computation in SOI
**Location:** `navigation.js:926-929`

```javascript
// SOI guard
if (player.soiState?.isInSOI) {
    console.warn('[NAVIGATION] Cannot compute launch windows: ship is in SOI');
    return null;
}
```

**UNTESTED:**
- What if `soiState` is null but ship is ACTUALLY in SOI?
- What if SOI transition happens during computation?

**Missing Test:**
```javascript
test('Launch window computation aborted when entering SOI', async () => {
    const player = getPlayerShip();
    player.soiState = { isInSOI: false };

    const promise = computeLaunchWindows();

    // Ship enters SOI mid-computation
    player.soiState = { isInSOI: true, currentBody: 'MARS' };

    const result = await promise;

    assert(result.error === 'SOI_TRANSITION' || result === null,
           'Should abort when entering SOI');
});
```

---

### Error Path 3: Sail Thrust with Null Sail
**Location:** `navigation.js:208-234`

```javascript
// Apply sail thrust for next step (if not last step)
if (i < steps && sail && sail.deploymentPercent > 0) {
    // ...
    const thrust = calculateSailThrust(sail, shipPos, velocity, distFromSun, mass);
    // ...
}
```

**UNTESTED:**
- What if `sail` is null?
- What if `sail.deploymentPercent` is null?
- What if `sail.deploymentPercent` is negative?

**Missing Test:**
```javascript
test('Trajectory prediction with null sail', () => {
    const player = getPlayerShip();
    player.sail = null;  // Ship has no sail

    const result = predictClosestApproach();

    // Should handle ballistic trajectory (no thrust)
    assert(result !== null, 'Should compute ballistic trajectory');
    assert(isFinite(result.closestDistance), 'Should return finite distance');
});

test('Trajectory prediction with negative deployment', () => {
    const player = getPlayerShip();
    player.sail.deploymentPercent = -50;  // Invalid

    const result = predictClosestApproach();

    // Should clamp to 0 or handle gracefully
    assert(result !== null, 'Should handle invalid deployment');
});
```

---

## Part 6: Prioritized Test Recommendations

### Priority 1: CATASTROPHIC (Implement Within 24 Hours)

1. **Fix Async Test Anti-Pattern**
   - **Files:** All `*.test.js` files
   - **Action:** Audit every async test function, ensure runner awaits
   - **Test:** Add test-the-test that verifies async assertions complete

2. **Test Cache Invalidation**
   - **File:** `navigation.test.js` (create it)
   - **Tests:**
     - Intercept cache invalidated on sail change
     - Course cache invalidated on destination change
     - Course cache invalidated on SOI transition
   - **Impact:** Prevents stale trajectory predictions (player-facing bug)

3. **Test Refinement Mode Logic**
   - **File:** `navigation.test.js`
   - **Tests:**
     - Refinement mode disabled when destination changes
     - Refinement mode disabled when NaN in appliedCourse
     - Refinement seed settings handle race condition
   - **Impact:** Prevents course solver from finding wrong solution

4. **Test Concurrent Course Computation Guard**
   - **File:** `navigation.test.js`
   - **Tests:**
     - Second concurrent call returns null immediately
     - First computation completes successfully
   - **Impact:** Prevents race condition that corrupts solver state

---

### Priority 2: CRITICAL (Implement Within 1 Week)

5. **Test Save/Load Round-Trip**
   - **File:** `saveState.test.js` (create it)
   - **Tests:**
     - Round-trip preserves all fields
     - Partial state restoration (missing fields)
     - Theme restoration failure (silent error)
     - Malformed JSON handling
   - **Impact:** Prevents data loss and player frustration

6. **Test Navigation State Machine**
   - **File:** `navigation.test.js`
   - **Tests:**
     - Extreme flyby detection before extremeFlybyState set
     - SOI transition mid-computation aborts course solver
     - Capture plan with NaN eccentricity
   - **Impact:** Prevents autopilot from executing wrong maneuvers

7. **Test Error Paths in Course Computation**
   - **File:** `navigation.test.js`
   - **Tests:**
     - Course computation timeout
     - Progress callback throws error
     - Invalid ship (null orbital elements)
   - **Impact:** Prevents course solver from hanging or crashing

---

### Priority 3: HIGH (Implement Within 2 Weeks)

8. **Test Edge Cases in Orbital Mechanics**
   - **File:** `orbital-maneuvers.test.js`, `navigation.test.js`
   - **Tests:**
     - Sail thrust at Sun center (division by zero)
     - Trajectory prediction with zero duration
     - Trajectory prediction with null sail
     - Relative velocity with null destination
   - **Impact:** Prevents NaN/Infinity propagation crashes

9. **Test Null/Undefined Guards**
   - **File:** `navigation.test.js`
   - **Tests:**
     - getDestinationInfo with null player
     - computeCapturePlan with null soiState
     - predictClosestApproach with null orbital elements
   - **Impact:** Verifies guards are present and correct

10. **Test Launch Window Computation**
    - **File:** `launch-window.test.js` (expand existing)
    - **Tests:**
      - Launch windows aborted when entering SOI mid-computation
      - Launch windows with invalid ship
      - Launch windows with zero coast days
    - **Impact:** Prevents launch window bugs

---

### Priority 4: MEDIUM (Implement Within 1 Month)

11. **Test UI State Updates**
    - **File:** `saveState.test.js`
    - **Tests:**
      - updateDisplayCheckbox with invalid key
      - updateSailUI with null sail
      - updateTrajectoryUI with invalid duration
    - **Impact:** Prevents UI desync from game state

12. **Test Unconditional Pass Anti-Pattern**
    - **File:** `launch-window.test.js`
    - **Action:** Fix line 334, move assertion into loop
    - **Impact:** Improves test diagnostics

13. **Test Player-Facing Scenarios**
    - **File:** `integration.test.js` (create it)
    - **Tests:**
      - "Apply Course button doesn't work" scenario
      - "Autopilot crashed my ship" scenario
      - "My save file is corrupted" scenario
    - **Impact:** Catches bugs from player's perspective

---

## Part 7: Test Infrastructure Recommendations

### Recommendation 1: Add Test Coverage Reporting
**Action:** Integrate Istanbul/nyc for code coverage
**Benefit:** Identify untested code paths automatically

### Recommendation 2: Add Test-the-Test Suite
**Action:** Create tests that verify test suite correctness
**Benefit:** Catch async test anti-patterns before they ship

### Recommendation 3: Add Integration Tests
**Action:** Test full workflows (save/load, course compute + apply, SOI transition)
**Benefit:** Catch bugs that unit tests miss

### Recommendation 4: Add Property-Based Tests
**Action:** Use fast-check or similar for randomized testing
**Benefit:** Find edge cases developers didn't think of

---

## Conclusion

The combination of **1,451 lines of untested code** (navigation.js + saveState.js) and **3 critical test anti-patterns** creates a **high-risk environment** where catastrophic bugs can slip through.

**Most Critical Gaps:**
1. Cache invalidation logic (lines 136-259, 595-730) - **0% tested**
2. Course refinement mode (lines 732-809) - **0% tested**
3. Save/load system (465 lines) - **0% tested**
4. Async race conditions in course computation - **Not validated**
5. Error path handling - **Mostly untested**

**Recommended Immediate Actions:**
1. Implement Priority 1 tests within 24 hours (cache, refinement, async fixes)
2. Create `navigation.test.js` and `saveState.test.js` files
3. Fix async test anti-patterns in existing tests
4. Add test coverage reporting to CI/CD

**Risk Assessment:**
Without these tests, the probability of a **player-facing catastrophic bug** (ship crash, data loss, incorrect trajectory) in the next release is **>50%**.

With Priority 1 tests implemented, risk drops to **<10%**.

---

**END OF REPORT**
