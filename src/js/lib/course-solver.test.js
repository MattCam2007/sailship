/**
 * Course Solver Test Suite
 *
 * TDD tests for automatic course plotting algorithm.
 * Run in browser console:
 *   import('/js/lib/course-solver.test.js').then(m => m.runAllTests())
 */

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Create a mock ship object for testing
 * @param {Object} overrides - Override default values
 * @returns {Object} Mock ship
 */
export function createMockShip(overrides = {}) {
    return {
        name: 'TestShip',
        x: 1.0,  // 1 AU from Sun (Earth orbit)
        y: 0,
        z: 0,
        mass: 10000,
        orbitalElements: {
            a: 1.0,      // Semi-major axis (AU)
            e: 0.017,    // Eccentricity (Earth-like)
            i: 0,        // Inclination (rad)
            Ω: 0,        // Longitude of ascending node (rad)
            ω: 0,        // Argument of periapsis (rad)
            M0: 0,       // Mean anomaly at epoch (rad)
            ...overrides.orbitalElements
        },
        sail: {
            area: 3000000,
            reflectivity: 0.9,
            angle: 0,
            pitchAngle: 0,
            deploymentPercent: 100,
            condition: 100,
            sailCount: 1,
            ...overrides.sail
        },
        ...overrides
    };
}

/**
 * Create a mock target (planet) for testing
 * @param {string} name - Planet name
 * @returns {Object} Mock target
 */
export function createMockTarget(name = 'VENUS') {
    const targets = {
        VENUS: {
            name: 'VENUS',
            elements: {
                a: 0.723,    // Semi-major axis (AU)
                e: 0.007,    // Eccentricity
                i: 0.059,    // Inclination (rad, ~3.4°)
                Ω: 1.338,    // Longitude of ascending node (rad)
                ω: 0.958,    // Argument of periapsis (rad)
                M0: 0.874,   // Mean anomaly (rad)
            }
        },
        MARS: {
            name: 'MARS',
            elements: {
                a: 1.524,    // Semi-major axis (AU)
                e: 0.093,    // Eccentricity
                i: 0.032,    // Inclination (rad, ~1.85°)
                Ω: 0.865,    // Longitude of ascending node (rad)
                ω: 5.000,    // Argument of periapsis (rad)
                M0: 0.338,   // Mean anomaly (rad)
            }
        },
        JUPITER: {
            name: 'JUPITER',
            elements: {
                a: 5.203,    // Semi-major axis (AU)
                e: 0.049,    // Eccentricity
                i: 0.023,    // Inclination (rad, ~1.3°)
                Ω: 1.753,    // Longitude of ascending node (rad)
                ω: 4.779,    // Argument of periapsis (rad)
                M0: 0.334,   // Mean anomaly (rad)
            }
        }
    };
    return targets[name] || targets.VENUS;
}

/**
 * Simple assertion helper
 */
function assert(condition, message) {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
}

/**
 * Assert value is within range
 */
function assertInRange(value, min, max, message) {
    if (value < min || value > max) {
        throw new Error(`${message}: ${value} not in range [${min}, ${max}]`);
    }
}

/**
 * Assert value is approximately equal
 */
function assertApprox(actual, expected, tolerance, message) {
    if (Math.abs(actual - expected) > tolerance) {
        throw new Error(`${message}: ${actual} not approximately ${expected} (tolerance: ${tolerance})`);
    }
}

// ============================================================================
// TEST CASES
// ============================================================================

const tests = [];

function test(name, fn) {
    tests.push({ name, fn });
}

// Unit 1: Module loads
test('testModuleLoads', async () => {
    const module = await import('./course-solver.js');
    assert(module !== null, 'Module should load');
    assert(typeof module.evaluateCandidate === 'function', 'evaluateCandidate should be exported');
});

// Unit 2: evaluateCandidate tests
test('testEvaluateCandidateReturnsValidStructure', async () => {
    const { evaluateCandidate } = await import('./course-solver.js');
    const ship = createMockShip();
    const target = createMockTarget('VENUS');

    const result = await evaluateCandidate(35, 0, ship, target);

    assert(result !== null, 'Result should not be null');
    assert(typeof result.yawDeg === 'number', 'Result should have yawDeg');
    assert(typeof result.pitchDeg === 'number', 'Result should have pitchDeg');
    assert(typeof result.minDistance === 'number', 'Result should have minDistance');
    assert(typeof result.timeToClosest === 'number', 'Result should have timeToClosest');
    assert(result.minDistance >= 0, 'minDistance should be non-negative');
    assert(result.timeToClosest >= 0, 'timeToClosest should be non-negative');
});

test('testEvaluateCandidateDistanceVariesWithYaw', async () => {
    const { evaluateCandidate } = await import('./course-solver.js');
    const ship = createMockShip();
    const target = createMockTarget('VENUS');

    const result1 = await evaluateCandidate(35, 0, ship, target);
    const result2 = await evaluateCandidate(-35, 0, ship, target);

    // Different yaw angles should produce different results
    // (35° raises orbit, -35° lowers orbit toward Venus)
    assert(result1.minDistance !== result2.minDistance,
        `Different yaw should give different distance: ${result1.minDistance} vs ${result2.minDistance}`);
});

test('testEvaluateCandidateNegativeYawBetterForVenus', async () => {
    const { evaluateCandidate } = await import('./course-solver.js');
    const ship = createMockShip();
    const target = createMockTarget('VENUS');

    const raiseOrbit = await evaluateCandidate(35, 0, ship, target);
    const lowerOrbit = await evaluateCandidate(-35, 0, ship, target);

    // Lowering orbit (negative yaw) should be better for Venus (inner planet)
    assert(lowerOrbit.minDistance < raiseOrbit.minDistance,
        `Lower orbit (${lowerOrbit.minDistance}) should be closer to Venus than raise orbit (${raiseOrbit.minDistance})`);
});

// Unit 3: Coarse sweep tests
test('testCoarseSweepReturnsCorrectCount', async () => {
    const { coarseSweep } = await import('./course-solver.js');
    const ship = createMockShip();
    const target = createMockTarget('VENUS');

    const results = await coarseSweep(ship, target);

    // Yaw: -60 to 60 in 10° steps = 13 values
    // Pitch: -30 to 30 in 10° steps = 7 values
    // Total: 13 * 7 = 91
    assert(results.length === 91, `Expected 91 results, got ${results.length}`);
});

test('testCoarseSweepSortedByDistance', async () => {
    const { coarseSweep } = await import('./course-solver.js');
    const ship = createMockShip();
    const target = createMockTarget('VENUS');

    const results = await coarseSweep(ship, target);

    for (let i = 1; i < results.length; i++) {
        assert(results[i].minDistance >= results[i - 1].minDistance,
            `Results should be sorted: ${results[i - 1].minDistance} <= ${results[i].minDistance}`);
    }
});

test('testCoarseSweepFindsReasonableCandidate', async () => {
    const { coarseSweep } = await import('./course-solver.js');
    const ship = createMockShip();
    const target = createMockTarget('VENUS');

    const results = await coarseSweep(ship, target);
    const best = results[0];

    // Best coarse candidate should get within 0.5 AU of Venus
    assert(best.minDistance < 0.5,
        `Best coarse candidate should be < 0.5 AU from Venus, got ${best.minDistance}`);
});

// Unit 4: Fine search tests
test('testFineSearchImprovesOnCoarse', async () => {
    const { coarseSweep, fineSearch } = await import('./course-solver.js');
    const ship = createMockShip();
    const target = createMockTarget('VENUS');

    const coarseResults = await coarseSweep(ship, target);
    const topCandidates = coarseResults.slice(0, 5);

    const refined = await fineSearch(topCandidates, ship, target);

    // Fine search should improve or maintain best distance
    assert(refined.minDistance <= topCandidates[0].minDistance,
        `Fine search (${refined.minDistance}) should improve on coarse (${topCandidates[0].minDistance})`);
});

// Unit 5: Ultra-fine polish tests
test('testUltraFinePolishMaintainsOrImproves', async () => {
    const { coarseSweep, fineSearch, ultraFinePolish } = await import('./course-solver.js');
    const ship = createMockShip();
    const target = createMockTarget('VENUS');

    const coarseResults = await coarseSweep(ship, target);
    const refined = await fineSearch(coarseResults.slice(0, 5), ship, target);
    const polished = await ultraFinePolish(refined, ship, target);

    // Ultra-fine should maintain or improve
    assert(polished.minDistance <= refined.minDistance,
        `Ultra polish (${polished.minDistance}) should improve on fine (${refined.minDistance})`);
});

// Unit 6: Main solver tests
test('testSolveCourseReturnsValidSolution', async () => {
    const { solveCourse } = await import('./course-solver.js');
    const ship = createMockShip();
    const target = createMockTarget('VENUS');

    const solution = await solveCourse(ship, target);

    assert(solution !== null, 'Solution should not be null');
    assert(typeof solution.yawDeg === 'number', 'Should have yawDeg');
    assert(typeof solution.pitchDeg === 'number', 'Should have pitchDeg');
    assert(typeof solution.minDistance === 'number', 'Should have minDistance');
    assert(typeof solution.quality === 'string', 'Should have quality rating');
});

test('testSolveCourseFindsInterceptForVenus', async () => {
    const { solveCourse } = await import('./course-solver.js');
    const ship = createMockShip();
    const target = createMockTarget('VENUS');

    const solution = await solveCourse(ship, target);

    // Should find intercept or near miss for Venus
    assert(solution.minDistance < 0.1,
        `Should find close approach to Venus, got ${solution.minDistance} AU`);
});

test('testSolveCourseHandlesMars', async () => {
    const { solveCourse } = await import('./course-solver.js');
    const ship = createMockShip();
    const target = createMockTarget('MARS');

    const solution = await solveCourse(ship, target);

    // Mars is further but should still find reasonable solution
    assert(solution !== null, 'Should return solution for Mars');
    assert(solution.minDistance < 0.5,
        `Should get within 0.5 AU of Mars, got ${solution.minDistance}`);
});

// Unit 7: Quality metrics tests
test('testQualityRatingsMatchThresholds', async () => {
    const { solveCourse } = await import('./course-solver.js');
    const ship = createMockShip();
    const target = createMockTarget('VENUS');

    const solution = await solveCourse(ship, target);

    // Verify quality rating matches distance
    if (solution.minDistance < 0.01) {
        assert(solution.quality === 'INTERCEPT', `Should be INTERCEPT at ${solution.minDistance} AU`);
    } else if (solution.minDistance < 0.05) {
        assert(solution.quality === 'NEAR_MISS', `Should be NEAR_MISS at ${solution.minDistance} AU`);
    } else if (solution.minDistance < 0.2) {
        assert(solution.quality === 'MARGINAL', `Should be MARGINAL at ${solution.minDistance} AU`);
    } else {
        assert(solution.quality === 'NO_SOLUTION', `Should be NO_SOLUTION at ${solution.minDistance} AU`);
    }
});

test('testSolutionIncludesSearchMetrics', async () => {
    const { solveCourse } = await import('./course-solver.js');
    const ship = createMockShip();
    const target = createMockTarget('VENUS');

    const solution = await solveCourse(ship, target);

    assert(solution.searchMetrics !== undefined, 'Should have searchMetrics');
    assert(typeof solution.searchMetrics.totalEvaluations === 'number', 'Should have totalEvaluations');
    assert(typeof solution.searchMetrics.computeTimeMs === 'number', 'Should have computeTimeMs');
});

// Unit 8: Resolution tests (Fix #1 - match intersection detector resolution)
test('testConfigIncludesHighResolutionSettings', async () => {
    const { getConfig } = await import('./course-solver.js');
    const config = getConfig();

    // CONFIG should include dynamic step calculation parameters
    assert(typeof config.stepsPerDay === 'number', 'CONFIG should have stepsPerDay');
    assert(config.stepsPerDay >= 10, `stepsPerDay should be >= 10, got ${config.stepsPerDay}`);
    assert(typeof config.maxSteps === 'number', 'CONFIG should have maxSteps');
    assert(config.maxSteps >= 4000, `maxSteps should be >= 4000, got ${config.maxSteps}`);
    assert(typeof config.minSteps === 'number', 'CONFIG should have minSteps');
    assert(config.minSteps >= 500, `minSteps should be >= 500, got ${config.minSteps}`);
});

test('testSolverUsesHighResolutionForYearHorizon', async () => {
    // For a 365-day horizon, solver should use ~4380 steps (12 steps/day)
    // not the old fixed 1000 steps
    const { getConfig } = await import('./course-solver.js');
    const config = getConfig();

    const duration = 365;
    const expectedMinSteps = duration * 10;  // At least 10 steps/day

    // Calculate what the solver would use
    const rawSteps = Math.round(duration * config.stepsPerDay);
    const calculatedSteps = Math.min(config.maxSteps, Math.max(config.minSteps, rawSteps));

    assert(calculatedSteps >= expectedMinSteps,
        `365-day horizon should use >= ${expectedMinSteps} steps, calculated ${calculatedSteps}`);
    assert(calculatedSteps > 1000,
        `Should use more than old fixed 1000 steps, got ${calculatedSteps}`);
});

test('testSolverCalculatesStepsDynamically', async () => {
    const { getConfig } = await import('./course-solver.js');
    const config = getConfig();

    // Test various durations to verify dynamic calculation
    const testCases = [
        { days: 180, expectedMin: 1800 },   // 180 * 10 = 1800
        { days: 365, expectedMin: 3650 },   // 365 * 10 = 3650
        { days: 730, expectedMin: 6000 },   // Would be 7300 but capped at maxSteps
        { days: 1460, expectedMin: 6000 },  // Would be 14600 but capped at maxSteps
    ];

    for (const tc of testCases) {
        const rawSteps = Math.round(tc.days * config.stepsPerDay);
        const calculatedSteps = Math.min(config.maxSteps, Math.max(config.minSteps, rawSteps));

        // For short durations, should be >= days * 10
        // For long durations, should be capped at maxSteps
        const expectedSteps = Math.min(config.maxSteps, Math.max(config.minSteps, tc.days * config.stepsPerDay));

        assert(calculatedSteps >= tc.expectedMin || calculatedSteps === config.maxSteps,
            `${tc.days}-day horizon: expected >= ${tc.expectedMin} or maxSteps, got ${calculatedSteps}`);
    }
});

// Edge case tests (from review feedback)
test('testSolveCourseWithInvalidShip', async () => {
    const { solveCourse } = await import('./course-solver.js');
    const invalidShip = { name: 'Invalid' }; // Missing orbitalElements
    const target = createMockTarget('VENUS');

    const solution = await solveCourse(invalidShip, target);

    assert(solution === null || solution.quality === 'NO_SOLUTION',
        'Should handle invalid ship gracefully');
});

// ============================================================================
// TEST RUNNER
// ============================================================================

export async function runAllTests() {
    console.log('=== COURSE SOLVER TESTS ===\n');

    let passed = 0;
    let failed = 0;
    const failures = [];

    for (const { name, fn } of tests) {
        try {
            await fn();
            console.log(`  [PASS] ${name}`);
            passed++;
        } catch (error) {
            console.log(`  [FAIL] ${name}: ${error.message}`);
            failures.push({ name, error: error.message });
            failed++;
        }
    }

    console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`);

    if (failures.length > 0) {
        console.log('\nFailures:');
        failures.forEach(f => console.log(`  - ${f.name}: ${f.error}`));
    }

    return { passed, failed, failures };
}

// Run tests if loaded directly
console.log('[COURSE_SOLVER_TEST] Test module loaded. Run runAllTests() to execute.');
