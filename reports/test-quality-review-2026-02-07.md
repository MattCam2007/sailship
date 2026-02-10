# Test Quality Review and Standards
**Date:** 2026-02-07
**Reviewer:** Claude Sonnet 4.5 (Best Practices Expert)
**Scope:** All test files in `/src/js/**/*.test.js`
**Total Test Files:** 16

---

## Executive Summary

The test suite demonstrates **strong physics validation** and **comprehensive coverage** of orbital mechanics, but suffers from **inconsistent quality patterns** that reduce reliability and maintainability. The project needs standardized testing conventions to ensure tests are trustworthy indicators of code correctness.

**Key Findings:**
- ✅ Excellent physics validation and round-trip verification
- ✅ Good use of epsilon comparisons for floating-point math
- ❌ Mixed assertion patterns (strict equality vs. epsilon comparisons)
- ❌ Inconsistent error handling across test files
- ❌ No standardized test structure or naming conventions
- ❌ State pollution risks between tests

**Overall Grade:** C+ (Good intent, inconsistent execution)

---

## 1. Test Quality Issues (Categorized by Severity)

### CRITICAL: Silent Failures

**Issue:** Tests that catch errors but don't properly fail the test.

**Examples Found:**
```javascript
// trajectory-predictor.test.js:262
try {
    const trajectory = predictTrajectory(...);
    allPassed &= assert(trajectory.length > 0, 'Returns non-empty trajectory');
} catch (e) {
    error = e;
    allPassed = false;  // ⚠️ SILENT: Doesn't re-throw, just sets flag
}
allPassed &= assert(error === null, `No errors thrown (${error?.message || 'none'})`);
```

**Problem:**
- Test framework (console-based) doesn't know test failed
- No stack trace available for debugging
- Manual result aggregation is error-prone

**Recommended Pattern:**
```javascript
// Option 1: Let errors propagate naturally
function testHyperbolicOrbit() {
    const trajectory = predictTrajectory(...);  // Throws on error
    assert(trajectory.length > 0, 'Returns non-empty trajectory');
}

// Option 2: Explicit error testing with re-throw
function testHyperbolicOrbit() {
    let errorThrown = false;
    try {
        const trajectory = predictTrajectory(...);
        assert(trajectory.length > 0, 'Returns non-empty trajectory');
    } catch (e) {
        errorThrown = true;
        console.error('Unexpected error:', e);
        throw e;  // ✅ Re-throw for visibility
    }
}
```

**Files Affected:**
- `trajectory-predictor.test.js` (testHyperbolicOrbit)
- `intersectionDetector.crossing.test.js` (all tests use try-catch-log pattern)

---

### HIGH: Mixed Floating-Point Comparison Strategies

**Issue:** Some tests use strict equality (`===`, `strictEqual`), others use epsilon comparisons (`approxEqual`), creating inconsistent reliability.

**Examples:**
```javascript
// orbital.test.js:35 - ✅ GOOD: Uses strictEqual for exact constant
assert.strictEqual(J2000, 2451545.0);

// orbital.test.js:64 - ❌ BAD: Uses strictEqual for computed value
assert.strictEqual(pressureAtZero, pressureAtMin);  // May fail due to rounding

// orbital.test.js:103 - ✅ GOOD: Uses epsilon for physics calculation
assert.ok(approxEqual(E, M, 1e-10));
```

**Problem:**
- Strict equality on floating-point calculations is fragile
- Different tolerances across files (1e-6, 1e-10, 0.01)
- No documented rationale for tolerance choices

**Current Tolerance Usage:**
| File | Default Tolerance | Rationale |
|------|------------------|-----------|
| `orbital.test.js` | 1e-6 | Position accuracy (AU scale) |
| `orbital-maneuvers.test.js` | 1e-6 | Thrust calculations |
| `soi.test.js` | 1e-10 | Frame transformations (high precision) |
| `intersectionDetector.crossing.test.js` | 0.01 | Orbital radius (coarse, 0.01 AU ≈ 1.5M km) |

**Recommended Standard:**
```javascript
// Define tolerance hierarchy with documentation
const TOLERANCE = {
    EXACT: 0,                    // Integer/constant values only
    ULTRA_PRECISE: 1e-12,        // Frame transformations, coordinate math
    PRECISE: 1e-10,              // Kepler solver, orbital elements
    PHYSICS: 1e-6,               // Position/velocity (AU/day scale)
    GAMEPLAY: 1e-3,              // User-facing values (distances shown in UI)
    COARSE: 0.01                 // Orbit crossing detection (0.01 AU ≈ 1.5M km)
};

// Usage
function assertApprox(actual, expected, tolerance, message) {
    const diff = Math.abs(actual - expected);
    if (diff > tolerance) {
        throw new Error(`${message}: expected ${expected}, got ${actual}, diff ${diff}`);
    }
}

// Example
assertApprox(crossRadius, 1.0, TOLERANCE.COARSE, 'Crossing at Earth orbit');
```

---

### HIGH: Async Tests Not Properly Awaited

**Issue:** Async tests return promises that may not be awaited, hiding failures.

**Example:**
```javascript
// launch-window.test.js:369
export async function runAllTests() {
    const results = [
        testStrategyCount(),           // Sync - OK
        testGridCoverage(),            // Sync - OK
        await testScanBasic(),         // ✅ Properly awaited
        testGrouping(),                // Sync - OK
        await testSOIGuard(),          // ✅ Properly awaited
        await testInvalidInput(),      // ✅ Properly awaited
        await testFullMars(),          // ✅ Properly awaited
        await testOuterPlanet(),       // ✅ Properly awaited
        testGroupingNoneGood(),        // Sync - OK
    ];
    // ...
}
```

**Status:** ✅ **GOOD** - This file correctly awaits async tests.

**Warning Pattern to Avoid:**
```javascript
// ❌ BAD: Mixing sync/async without await
const results = [
    testSyncTest(),
    testAsyncTest(),  // Returns promise, not result!
];
```

**Files Affected:**
- `launch-window.test.js` - ✅ Correctly implemented

---

### MEDIUM: Missing Assertions (Testing "Didn't Throw" Not "Correct Result")

**Issue:** Tests that pass if code doesn't throw, without verifying correctness.

**Examples:**
```javascript
// trajectory-predictor.test.js:82
export function testZeroThrust() {
    const trajectory = predictTrajectory({...});  // Just calls function

    let allPassed = true;
    allPassed &= assert(trajectory.length === steps, 'Returns correct length');
    // ✅ Good: Verifies correctness

    for (let i = 0; i < 5; i++) {
        const predicted = trajectory[i];
        const expected = getPosition(CIRCULAR_ORBIT, predicted.time);
        const maxDiff = Math.max(dx, dy, dz);
        allPassed &= assert(maxDiff < tolerance, 'Position matches Keplerian');
    }
    // ✅ Good: Verifies results match expected physics
}

// ❌ BAD: Hypothetical weak test
export function testTrajectoryComputes() {
    const trajectory = predictTrajectory({...});  // Doesn't throw = PASS?
    assert(trajectory !== null, 'Returns something');  // Too weak!
}
```

**Status:** ✅ **GOOD** - Most tests include strong assertions.

**Weak Assertions to Avoid:**
```javascript
// ❌ TOO WEAK
assert(result !== null);
assert(result !== undefined);
assert(result.length > 0);  // Without checking contents

// ✅ STRONG
assert(result.length === expectedLength);
assert(result.every(item => isFinite(item.value)));
assert(Math.abs(result.finalValue - expectedValue) < tolerance);
```

---

### MEDIUM: State Pollution Between Tests

**Issue:** Tests that modify shared state without cleanup.

**Analysis:**
```javascript
// gameState.test.js:153
describe('setDisplayOption', () => {
    it('sets valid display option', () => {
        const original = displayOptions.showOrbits;
        setDisplayOption('showOrbits', !original);
        assert.strictEqual(displayOptions.showOrbits, !original);
        // Reset
        setDisplayOption('showOrbits', original);  // ✅ GOOD: Cleanup
    });
});
```

**Status:** ✅ **GOOD** - Most tests clean up after themselves.

**Pattern to Follow:**
```javascript
// Option 1: Manual cleanup
it('modifies state', () => {
    const original = getState();
    setState(newValue);
    assert(verifyNewState());
    setState(original);  // Restore
});

// Option 2: beforeEach/afterEach (if using test framework)
describe('state tests', () => {
    let originalState;

    beforeEach(() => {
        originalState = getState();
    });

    afterEach(() => {
        setState(originalState);
    });

    it('test 1', () => { /* ... */ });
    it('test 2', () => { /* ... */ });
});

// Option 3: Isolated state (best for pure functions)
it('computes result', () => {
    const state = createFreshState();
    const result = compute(state);
    assert(result === expected);
});
```

---

### LOW: Performance Tests Mixed with Correctness Tests

**Issue:** Performance benchmarks in the same suite as correctness tests.

**Example:**
```javascript
// trajectory-predictor.test.js:208
export function testPerformance() {
    console.log('\n--- Test: Performance ---');
    clearTrajectoryCache();

    const iterations = 10;
    const times = [];

    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        predictTrajectory({...});
        const end = performance.now();
        times.push(end - start);
    }

    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    return assert(avgTime < 10, `Average time < 10ms`);
}
```

**Status:** ⚠️ **ACCEPTABLE** but should be separated.

**Recommendation:**
- Separate performance tests into `*.perf.test.js` files
- Run performance tests separately from CI/correctness checks
- Use statistical analysis (median, p95) not just average
- Document expected performance characteristics

```javascript
// trajectory-predictor.perf.test.js
export function benchmarkTrajectoryPrediction() {
    const WARMUP = 5;
    const ITERATIONS = 100;

    // Warmup JIT
    for (let i = 0; i < WARMUP; i++) {
        predictTrajectory({...});
    }

    // Measure
    const times = [];
    for (let i = 0; i < ITERATIONS; i++) {
        const start = performance.now();
        predictTrajectory({...});
        times.push(performance.now() - start);
    }

    // Statistical analysis
    times.sort((a, b) => a - b);
    const median = times[Math.floor(ITERATIONS / 2)];
    const p95 = times[Math.floor(ITERATIONS * 0.95)];

    console.log(`Median: ${median.toFixed(2)}ms, P95: ${p95.toFixed(2)}ms`);
    return { median, p95 };
}
```

---

## 2. Good Patterns Found (Keep These!)

### ✅ Round-Trip Verification

**Example from soi.test.js:**
```javascript
function testFrameConversionRoundTrip() {
    // Start with heliocentric state
    const shipPosHelio = { x: 1.5, y: 0.5, z: 0.1 };
    const shipVelHelio = { vx: 0.01, vy: 0.02, vz: 0.005 };

    // Convert to planetocentric
    const planetocentric = helioToPlanetocentric(shipPosHelio, shipVelHelio, planetPos, planetVel);

    // Convert back to heliocentric
    const helioAgain = planetocentricToHelio(planetocentric.pos, planetocentric.vel, planetPos, planetVel);

    // Should get original values back
    assertApprox(helioAgain.pos.x, shipPosHelio.x, 1e-10, 'Round-trip x position');
    assertApprox(helioAgain.vel.vx, shipVelHelio.vx, 1e-10, 'Round-trip x velocity');
}
```

**Why This Is Good:**
- Validates invertibility of coordinate transformations
- Catches accumulated numerical errors
- Doesn't require "correct" answer, just consistency

**Apply To:**
- All coordinate transformations
- Encoding/decoding functions
- State serialization/deserialization

---

### ✅ Physics Validation Against Known Laws

**Example from orbital-maneuvers.test.js:**
```javascript
it('velocity magnitude satisfies vis-viva equation', () => {
    const pos = getPosition(elements, julianDate);
    const vel = getVelocity(elements, julianDate);

    const r = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);
    const v = Math.sqrt(vel.vx ** 2 + vel.vy ** 2 + vel.vz ** 2);

    // vis-viva: v² = μ(2/r - 1/a)
    const expectedV2 = MU_SUN * (2 / r - 1 / elements.a);
    const actualV2 = v * v;

    assert.ok(approxEqual(actualV2, expectedV2, 1e-8));
});
```

**Why This Is Good:**
- Tests against fundamental physics, not just "expected output"
- Catches subtle bugs in orbital mechanics
- Self-documenting (explains the physics)

**Apply To:**
- Energy conservation tests
- Momentum conservation tests
- Angular momentum invariants
- Kepler's laws verification

---

### ✅ Comprehensive Epsilon Comparisons

**Example from orbital-maneuvers.test.js:**
```javascript
describe('eclipticToRTN', () => {
    it('converts radial thrust correctly', () => {
        const thrust = { x: 1, y: 0, z: 0 };
        const rtn = eclipticToRTN(thrust, position, velocity);
        assert.ok(approxEqual(rtn.R, 1.0, 1e-10));
        assert.ok(approxEqual(rtn.T, 0, 1e-10));
        assert.ok(approxEqual(rtn.N, 0, 1e-10));
    });

    it('preserves thrust magnitude', () => {
        const thrust = { x: 0.5, y: 0.5, z: 0.7071 };
        const rtn = eclipticToRTN(thrust, position, velocity);
        const originalMag = vectorMagnitude(thrust);
        const rtnMag = Math.sqrt(rtn.R ** 2 + rtn.T ** 2 + rtn.N ** 2);
        assert.ok(approxEqual(rtnMag, originalMag, 1e-6));
    });
});
```

**Why This Is Good:**
- All floating-point comparisons use epsilon
- Tests both individual components AND invariants (magnitude)
- Appropriate tolerance for coordinate transforms (1e-10)

---

### ✅ Edge Case Documentation

**Example from intersectionDetector.crossing.test.js:**
```javascript
/**
 * Test 14: Quadratic vs Linear Accuracy (Critical Bug Fix Verification)
 *
 * This test demonstrates the critical bug that was fixed:
 * When trajectory curves (non-radial motion), linear interpolation of radius
 * gives WRONG crossing time. The quadratic solution is mathematically correct.
 *
 * Example: Trajectory from (1.0, 0, 0) to (0, 0.72, 0) crossing Venus orbit (0.723 AU)
 * - Linear method: r(t) = r1 + t*(r2-r1) → t ≈ 0.99, wrong!
 * - Quadratic method: solve ||P(t)||² = R² → t ≈ 0.31, correct!
 */
function testQuadraticVsLinearAccuracy() {
    // Test implementation...
}
```

**Why This Is Good:**
- Documents WHY the test exists (explains the bug it caught)
- Provides mathematical context
- Includes numerical examples
- Future-proofs against regression

**Apply To:**
- All tests for bug fixes
- Edge cases with non-obvious behavior
- Tests that validate specific numerical methods

---

## 3. Anti-Patterns to Fix First (Priority Order)

### Priority 1: Standardize Floating-Point Comparisons

**Impact:** HIGH - Affects test reliability across the entire suite.

**Action Items:**
1. Create `test-utils.js` with standardized tolerance constants
2. Replace all `strictEqual` on computed values with `approxEqual`
3. Document tolerance choices in constants

**Implementation:**
```javascript
// src/js/lib/test-utils.js
export const TOLERANCE = {
    EXACT: 0,                    // Integer/constant values only
    ULTRA_PRECISE: 1e-12,        // Frame transformations
    PRECISE: 1e-10,              // Kepler solver, orbital elements
    PHYSICS: 1e-6,               // Position/velocity (AU/day scale)
    GAMEPLAY: 1e-3,              // User-facing values
    COARSE: 0.01                 // Orbit crossing detection
};

export function approxEqual(actual, expected, tolerance = TOLERANCE.PHYSICS) {
    if (!isFinite(actual) || !isFinite(expected)) {
        return false;
    }
    return Math.abs(actual - expected) < tolerance;
}

export function assertApprox(actual, expected, tolerance, message) {
    if (!approxEqual(actual, expected, tolerance)) {
        throw new Error(
            `${message}: expected ${expected}, got ${actual}, ` +
            `diff ${Math.abs(actual - expected).toExponential(2)}, ` +
            `tolerance ${tolerance.toExponential(2)}`
        );
    }
}
```

**Files to Update:**
- All 16 test files should import from `test-utils.js`
- Estimated effort: 4-6 hours

---

### Priority 2: Eliminate Silent Failures

**Impact:** HIGH - Silent failures hide bugs and reduce trust in tests.

**Action Items:**
1. Replace try-catch-log pattern with explicit error testing
2. Use test framework's built-in error handling (or migrate to one)
3. Ensure all test functions either pass or throw

**Pattern to Replace:**
```javascript
// ❌ BEFORE: Silent failure
let passed = 0, failed = 0;
try {
    // Test code
    assert(condition, 'message');
    passed++;
} catch (e) {
    console.log(`❌ FAIL: ${e.message}`);
    failed++;
}
return { passed, failed };

// ✅ AFTER: Explicit failure
function testFeature() {
    // Test code - throws on failure
    assert(condition, 'message');
}
```

**Files to Update:**
- `intersectionDetector.crossing.test.js` (17 tests)
- `intersectionDetector.edge-cases.test.js` (12 tests)
- `soi.test.js` (13 tests)
- `trajectory-predictor.test.js` (6 tests)

**Estimated effort:** 6-8 hours

---

### Priority 3: Consolidate Test Framework Choice

**Impact:** MEDIUM - Multiple test patterns (Node.js test runner vs. console-based) create confusion.

**Current State:**
- Some tests use Node.js `test` module (`describe`, `it`)
- Others use custom console-based harness
- No consistent test runner

**Recommendation:**
Choose ONE approach:

**Option A: Migrate to Node.js Test Runner (Recommended)**
- ✅ Built-in, no dependencies
- ✅ Standard assertion library
- ✅ Better error reporting
- ❌ Requires Node.js environment (can't run in browser)

**Option B: Keep Console-Based Tests**
- ✅ Runs in browser (good for debugging)
- ✅ No build step required
- ❌ Custom assertion library needed
- ❌ Manual result aggregation

**Hybrid Approach (Best for this project):**
```javascript
// test-runner.js - Universal test harness
export function runTest(name, testFn) {
    try {
        testFn();
        console.log(`✅ ${name}`);
        return true;
    } catch (e) {
        console.error(`❌ ${name}: ${e.message}`);
        console.error(e.stack);
        return false;
    }
}

export function runTests(tests) {
    const results = tests.map(({ name, fn }) => runTest(name, fn));
    const passed = results.filter(r => r).length;
    console.log(`\n${passed}/${results.length} tests passed`);
    return passed === results.length;
}

// Usage
import { runTests } from './test-runner.js';

runTests([
    { name: 'Zero thrust matches Keplerian', fn: testZeroThrust },
    { name: 'Thrust causes divergence', fn: testThrustDiverges },
    // ...
]);
```

**Estimated effort:** 8-10 hours

---

## 4. Test Structure Conventions to Establish

### Convention 1: File Naming

**Standard:**
```
<module>.test.js          - Correctness tests
<module>.perf.test.js     - Performance benchmarks
<module>.edge-cases.test.js - Edge case regression tests
```

**Current State:** ✅ Already follows this pattern
- `intersectionDetector.test.js` (legacy closest approach)
- `intersectionDetector.crossing.test.js` (new algorithm)
- `intersectionDetector.edge-cases.test.js` (bug regression tests)

---

### Convention 2: Test Function Naming

**Standard:**
```javascript
// Format: test<Feature><Behavior>
testZeroThrustMatchesKeplerian()
testThrustCausesOrbitalDivergence()
testHyperbolicOrbitDoesNotCrash()
testInvalidInputReturnsError()

// For Node.js test runner
describe('predictTrajectory', () => {
    it('matches Keplerian orbit with zero thrust', () => { ... });
    it('diverges from Keplerian with sail thrust', () => { ... });
});
```

**Current State:** ⚠️ Mixed naming (some good, some generic)

**Examples to Improve:**
```javascript
// ❌ VAGUE
testScanBasic()
testGrouping()

// ✅ SPECIFIC
testScanReturnsLaunchWindowsForMars()
testGroupingCombinesAdjacentDepartureDates()
```

---

### Convention 3: Test Organization (AAA Pattern)

**Standard: Arrange-Act-Assert**
```javascript
function testFeature() {
    // ARRANGE: Set up test data
    const orbit = {
        a: 1.0,
        e: 0.0167,
        // ...
    };
    const sail = {
        deploymentPercent: 100,
        // ...
    };

    // ACT: Execute the function under test
    const trajectory = predictTrajectory({
        orbitalElements: orbit,
        sail: sail,
        // ...
    });

    // ASSERT: Verify results
    assert(trajectory.length === 50, 'Returns 50 points');
    assertApprox(trajectory[0].x, 1.0, TOLERANCE.PHYSICS, 'Starts at 1 AU');
}
```

**Current State:** ✅ Most tests follow this pattern implicitly

---

### Convention 4: Test Independence

**Standard:**
- Each test should be runnable in isolation
- No shared mutable state between tests
- Test order should not matter

**Current State:** ✅ Tests are mostly independent

**Pattern to Enforce:**
```javascript
// ❌ BAD: Shared mutable state
let globalOrbit = { a: 1.0, e: 0.1 };

function test1() {
    globalOrbit.e = 0.2;  // Modifies shared state!
    // ...
}

function test2() {
    // Depends on globalOrbit.e value - FRAGILE!
}

// ✅ GOOD: Isolated state
function test1() {
    const orbit = { a: 1.0, e: 0.2 };
    // ...
}

function test2() {
    const orbit = { a: 1.0, e: 0.1 };
    // ...
}
```

---

## 5. Test Quality Checklist for Future Tests

### Pre-Commit Checklist

Before adding a new test, verify:

- [ ] **Test Name is Descriptive**
  - ✅ `testThrustIncreasesOrbitalEnergy()`
  - ❌ `testThrust()`

- [ ] **Uses Appropriate Tolerance**
  - [ ] `TOLERANCE.EXACT` for integers/constants
  - [ ] `TOLERANCE.PRECISE` for Kepler solver
  - [ ] `TOLERANCE.PHYSICS` for positions/velocities
  - [ ] `TOLERANCE.GAMEPLAY` for UI values

- [ ] **Strong Assertions**
  - [ ] Tests correctness, not just "doesn't crash"
  - [ ] Verifies output matches expected behavior
  - [ ] Checks invariants (conservation laws, round-trips)

- [ ] **No State Pollution**
  - [ ] Test cleans up after itself
  - [ ] Test doesn't depend on other tests
  - [ ] Test is idempotent (can run multiple times)

- [ ] **Proper Error Handling**
  - [ ] Errors propagate (no silent failures)
  - [ ] Expected errors use explicit try-catch
  - [ ] Error messages are descriptive

- [ ] **Documentation**
  - [ ] Complex tests have comments explaining WHY
  - [ ] Bug regression tests reference issue/bug
  - [ ] Edge cases explain the scenario

---

### Code Review Checklist

When reviewing tests:

- [ ] **Coverage**: Does the test verify the feature thoroughly?
- [ ] **Edge Cases**: Are boundary conditions tested?
- [ ] **Clarity**: Is it obvious what the test is checking?
- [ ] **Maintainability**: Will this test be easy to update?
- [ ] **Performance**: Does the test run quickly? (< 1s per test)

---

## 6. Standardized Test Template

### For Pure Functions (Recommended)

```javascript
/**
 * Tests for <module> - <description>
 *
 * Run in browser console:
 *   import('/js/lib/<module>.test.js').then(m => m.runAllTests())
 */

import { functionToTest } from './<module>.js';
import { TOLERANCE, assertApprox } from './test-utils.js';

// ============================================================================
// Test Cases
// ============================================================================

/**
 * Test: <Feature> <Expected Behavior>
 *
 * Verifies that [specific behavior] when [conditions].
 */
function testFeatureBehavior() {
    // ARRANGE: Set up test data
    const input = {
        // ...
    };
    const expectedOutput = {
        // ...
    };

    // ACT: Execute function
    const actualOutput = functionToTest(input);

    // ASSERT: Verify results
    assertApprox(
        actualOutput.value,
        expectedOutput.value,
        TOLERANCE.PHYSICS,
        'Output value matches expected'
    );
}

/**
 * Test: <Feature> <Edge Case>
 *
 * Edge case: [describe the edge case and why it matters]
 */
function testFeatureEdgeCase() {
    // ...
}

// ============================================================================
// Test Runner
// ============================================================================

export function runAllTests() {
    console.log('='.repeat(50));
    console.log('<MODULE> TESTS');
    console.log('='.repeat(50));

    const tests = [
        { name: 'Feature behavior', fn: testFeatureBehavior },
        { name: 'Feature edge case', fn: testFeatureEdgeCase },
    ];

    let passed = 0;
    for (const { name, fn } of tests) {
        try {
            fn();
            console.log(`✅ ${name}`);
            passed++;
        } catch (e) {
            console.error(`❌ ${name}: ${e.message}`);
            console.error(e.stack);
        }
    }

    console.log('\n' + '='.repeat(50));
    console.log(`RESULTS: ${passed}/${tests.length} tests passed`);
    console.log('='.repeat(50));

    return passed === tests.length;
}

// Export individual tests for debugging
export { testFeatureBehavior, testFeatureEdgeCase };
```

---

### For Stateful/Async Functions

```javascript
/**
 * Test: <Feature> <Async Behavior>
 */
async function testAsyncFeature() {
    // ARRANGE
    const input = { /* ... */ };

    // ACT
    const result = await asyncFunction(input);

    // ASSERT
    assert(result.success === true, 'Operation succeeded');
    assertApprox(result.value, expectedValue, TOLERANCE.PHYSICS, 'Result value');
}

/**
 * Test Runner (async)
 */
export async function runAllTests() {
    const tests = [
        { name: 'Async feature', fn: testAsyncFeature },
    ];

    let passed = 0;
    for (const { name, fn } of tests) {
        try {
            await fn();  // ✅ Await async tests
            console.log(`✅ ${name}`);
            passed++;
        } catch (e) {
            console.error(`❌ ${name}: ${e.message}`);
        }
    }

    return passed === tests.length;
}
```

---

## 7. Recommended Standards to Adopt

### Floating-Point Comparison Standard

**Decision: Adopt tiered tolerance system**

```javascript
// test-utils.js
export const TOLERANCE = {
    EXACT: 0,                    // Integer/constant comparisons only
    ULTRA_PRECISE: 1e-12,        // Frame transformations, coordinate math
    PRECISE: 1e-10,              // Kepler solver, orbital elements
    PHYSICS: 1e-6,               // Position/velocity at AU scale
    GAMEPLAY: 1e-3,              // User-facing gameplay values
    COARSE: 0.01                 // Orbit crossing (0.01 AU ≈ 1.5M km)
};
```

**Rationale:**
- `ULTRA_PRECISE` (1e-12): For coordinate transforms that should be exact within machine precision
- `PRECISE` (1e-10): For Kepler solver (converges to 1e-10), orbital elements
- `PHYSICS` (1e-6): For position/velocity (1e-6 AU ≈ 150 km, acceptable error)
- `GAMEPLAY` (1e-3): For UI values (1e-3 AU ≈ 150,000 km, coarse but acceptable for display)
- `COARSE` (0.01): For orbit crossing detection (0.01 AU ≈ 1.5M km, intentionally loose)

---

### Error Handling Standard

**Decision: Let errors propagate naturally, explicit testing for expected errors**

```javascript
// ✅ GOOD: Default case - let errors propagate
function testValidInput() {
    const result = functionThatMightThrow(validInput);
    assert(result.success === true, 'Operation succeeded');
}

// ✅ GOOD: Testing for expected error
function testInvalidInputThrows() {
    let errorThrown = false;
    try {
        functionThatShouldThrow(invalidInput);
    } catch (e) {
        errorThrown = true;
        assert(e.message.includes('Invalid'), 'Error message mentions invalid input');
    }
    assert(errorThrown === true, 'Function threw expected error');
}

// ❌ BAD: Silent catch
function testFeature() {
    try {
        functionToTest();
        passed++;
    } catch (e) {
        failed++;  // ❌ Silent failure!
    }
}
```

---

### Test Isolation Standard

**Decision: Each test creates its own data, no shared mutable state**

```javascript
// ✅ GOOD: Factory function for test data
function createMockOrbit(overrides = {}) {
    return {
        a: 1.0,
        e: 0.0167,
        i: 0,
        Ω: 0,
        ω: 0,
        M0: 0,
        epoch: J2000,
        μ: MU_SUN,
        ...overrides
    };
}

function testCircularOrbit() {
    const orbit = createMockOrbit({ e: 0.001 });
    // Test uses its own orbit instance
}

function testEllipticalOrbit() {
    const orbit = createMockOrbit({ e: 0.5 });
    // Test uses its own orbit instance
}
```

---

### Test Documentation Standard

**Decision: Document WHY for complex/regression tests**

```javascript
/**
 * Test: Quadratic interpolation for curved trajectories
 *
 * Bug Fix: #123 - Ghost planets showed incorrect encounter times
 *
 * When a trajectory curves (non-radial motion), linear interpolation
 * of radius gives incorrect crossing time. The quadratic solution
 * solves ||P(t)||² = R² exactly.
 *
 * Example: Trajectory (1.0, 0, 0) → (0, 0.72, 0) crossing Venus (0.723 AU)
 * - Linear: t ≈ 0.99 (WRONG - says crossing at end of segment)
 * - Quadratic: t ≈ 0.31 (CORRECT - crossing happens early)
 *
 * Error impact: 1-3 day timing error per 60-day segment
 */
function testQuadraticInterpolationAccuracy() {
    // ...
}
```

---

## 8. Migration Plan

### Phase 1: Critical Fixes (1 week)

**Week 1 Goals:**
1. Create `test-utils.js` with standardized tolerances
2. Fix silent failures in crossing detection tests
3. Document existing test patterns

**Estimated Effort:** 16-20 hours

**Deliverables:**
- `src/js/lib/test-utils.js` with TOLERANCE constants
- Updated `intersectionDetector.crossing.test.js` (no silent failures)
- Updated `trajectory-predictor.test.js` (no silent failures)
- Test quality checklist document

---

### Phase 2: Standardization (2 weeks)

**Week 2-3 Goals:**
1. Migrate all tests to use `test-utils.js`
2. Replace strict equality on floats with `approxEqual`
3. Standardize test naming conventions
4. Add missing test documentation

**Estimated Effort:** 24-30 hours

**Deliverables:**
- All 16 test files use standardized tolerances
- All test names follow `test<Feature><Behavior>` pattern
- All regression tests include bug context

---

### Phase 3: Infrastructure (1 week)

**Week 4 Goals:**
1. Create unified test runner
2. Add performance test separation
3. Create test template
4. Update project documentation

**Estimated Effort:** 12-16 hours

**Deliverables:**
- Universal test runner (works in browser + Node.js)
- `*.perf.test.js` files for benchmarks
- Test template in `CLAUDE.md`
- Updated test running instructions

---

## 9. Conclusion

### Current State: C+ (70/100)

**Strengths:**
- Strong physics validation
- Good edge case coverage
- Comprehensive epsilon comparisons in some files
- Excellent documentation in recent tests

**Weaknesses:**
- Inconsistent floating-point comparison strategies
- Mixed test patterns (Node.js vs. console-based)
- Some silent failures hiding bugs
- No standardized test structure

---

### Target State: A (90/100)

**After Implementation:**
- ✅ Standardized tolerance system across all tests
- ✅ No silent failures - all errors visible
- ✅ Unified test runner (works in browser + Node.js)
- ✅ Consistent test structure (AAA pattern, clear naming)
- ✅ Performance tests separated from correctness tests
- ✅ Test quality checklist enforced in reviews

---

### Success Metrics

**Quantitative:**
- 0 silent failures (catch blocks that don't re-throw)
- 0 strict equality on floating-point calculations
- 100% of tests use standardized tolerances
- 100% of async tests properly awaited

**Qualitative:**
- Tests are self-documenting (clear names + comments)
- New developers can write tests following template
- Test failures provide actionable debugging info
- Confidence in test suite as regression safety net

---

**Next Steps:**
1. Review this report with team
2. Prioritize fixes (recommend Priority 1 & 2 first)
3. Create `test-utils.js` (1-2 hours)
4. Begin migration starting with most critical tests

**Estimated Total Effort:** 50-60 hours over 4 weeks

---

**Reviewed by:** Claude Sonnet 4.5 (Best Practices Expert)
**Date:** 2026-02-07
**Status:** Recommendations ready for implementation
