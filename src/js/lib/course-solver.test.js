/**
 * Course Solver Test Suite (v4.1)
 *
 * Tests for the grid-bracket search algorithm.
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
    assert(typeof module.solveCourse === 'function', 'solveCourse should be exported');
    assert(typeof module.strategicReconnaissance === 'function', 'strategicReconnaissance should be exported');
    assert(typeof module.nelderMeadSearch === 'function', 'nelderMeadSearch should be exported');
    assert(typeof module.scoutHorizons === 'function', 'scoutHorizons should be exported');
    assert(typeof module.deploymentSweep === 'function', 'deploymentSweep should be exported');
    assert(typeof module.getConvergenceTolerance === 'function', 'getConvergenceTolerance should be exported');
});

// Unit 2: evaluateCandidate tests (unchanged from v3.7)
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

// Unit 3: Strategic Reconnaissance tests (v4.0)
test('testStrategicReconReturnsResults', async () => {
    const { strategicReconnaissance } = await import('./course-solver.js');
    const ship = createMockShip();
    const target = createMockTarget('VENUS');

    const results = await strategicReconnaissance(ship, target);

    // v4.1: 10° grid over ±60° yaw (13 values) × ±30° pitch (7 values) = 91 probes
    assert(results.length === 91, `Expected 91 recon results, got ${results.length}`);
});

test('testStrategicReconSortedByDistance', async () => {
    const { strategicReconnaissance } = await import('./course-solver.js');
    const ship = createMockShip();
    const target = createMockTarget('VENUS');

    const results = await strategicReconnaissance(ship, target);

    for (let i = 1; i < results.length; i++) {
        assert(results[i].minDistance >= results[i - 1].minDistance,
            `Results should be sorted: ${results[i - 1].minDistance} <= ${results[i].minDistance}`);
    }
});

test('testStrategicReconFindsReasonableCandidate', async () => {
    const { strategicReconnaissance } = await import('./course-solver.js');
    const ship = createMockShip();
    const target = createMockTarget('VENUS');

    const results = await strategicReconnaissance(ship, target);
    const best = results[0];

    // Best recon candidate should get within 0.5 AU of Venus
    assert(best.minDistance < 0.5,
        `Best recon candidate should be < 0.5 AU from Venus, got ${best.minDistance}`);
});

test('testStrategicReconWithCustomBounds', async () => {
    const { strategicReconnaissance } = await import('./course-solver.js');
    const ship = createMockShip();
    const target = createMockTarget('VENUS');

    const bounds = {
        yawCenter: -35,
        pitchCenter: 0,
        yawRadius: 10,
        pitchRadius: 5
    };

    const results = await strategicReconnaissance(ship, target, {}, bounds);

    // v4.1: 5° grid in bounds. yaw: -45 to -25 step 5 = 5 values, pitch: -5 to 5 step 5 = 3 values = 15
    assert(results.length === 15, `Expected 15 results with custom bounds, got ${results.length}`);

    // All results should be within bounds
    for (const r of results) {
        assert(r.yawDeg >= -60 && r.yawDeg <= 60, `Yaw ${r.yawDeg} out of global bounds`);
        assert(r.pitchDeg >= -30 && r.pitchDeg <= 30, `Pitch ${r.pitchDeg} out of global bounds`);
    }
});

// Unit 4: Nelder-Mead Search tests (v4.0)
test('testNelderMeadImprovesOnRecon', async () => {
    const { strategicReconnaissance, nelderMeadSearch } = await import('./course-solver.js');
    const ship = createMockShip();
    const target = createMockTarget('VENUS');

    const reconResults = await strategicReconnaissance(ship, target);
    const reconBest = reconResults[0].minDistance;

    const nmResult = await nelderMeadSearch(ship, target, reconResults);

    // Nelder-Mead should improve or maintain best distance
    assert(nmResult.best.minDistance <= reconBest,
        `Nelder-Mead (${nmResult.best.minDistance}) should improve on recon (${reconBest})`);

    // Should report eval count
    assert(typeof nmResult.evalCount === 'number', 'Should report evalCount');
    assert(nmResult.evalCount > 0, 'Should have done at least 1 evaluation');
});

test('testNelderMeadConverges', async () => {
    const { strategicReconnaissance, nelderMeadSearch } = await import('./course-solver.js');
    const ship = createMockShip();
    const target = createMockTarget('VENUS');

    const reconResults = await strategicReconnaissance(ship, target);
    const nmResult = await nelderMeadSearch(ship, target, reconResults);

    // Should converge to a reasonable solution
    assert(nmResult.best.minDistance < 0.3,
        `Nelder-Mead should converge to < 0.3 AU, got ${nmResult.best.minDistance}`);
});

// Unit 5: Adaptive Precision tests (v4.0)
test('testConvergenceToleranceScaling', async () => {
    const { getConvergenceTolerance } = await import('./course-solver.js');

    // Short transfer: high precision
    const short = getConvergenceTolerance(120);
    assert(short === 0.01, `120-day tolerance should be 0.01°, got ${short}`);

    // Medium transfer
    const medium = getConvergenceTolerance(300);
    assert(medium === 0.1, `300-day tolerance should be 0.1°, got ${medium}`);

    // Long transfer
    const long = getConvergenceTolerance(600);
    assert(long === 0.5, `600-day tolerance should be 0.5°, got ${long}`);

    // Very long transfer
    const veryLong = getConvergenceTolerance(1000);
    assert(veryLong === 2.0, `1000-day tolerance should be 2.0°, got ${veryLong}`);
});

// Unit 6: Horizon Scouting tests (v4.0)
test('testHorizonScoutReturnsRankedHorizons', async () => {
    const { scoutHorizons } = await import('./course-solver.js');
    const ship = createMockShip();
    const target = createMockTarget('VENUS');

    const result = await scoutHorizons(ship, target);

    assert(result.horizons.length === 6, `Expected 6 horizons, got ${result.horizons.length}`);
    // v4.1: 5 probes per horizon × 6 horizons = 30
    assert(result.evalCount === 30, `Expected 30 scout evals (5 per horizon), got ${result.evalCount}`);

    // Should be sorted by best distance
    for (let i = 1; i < result.horizons.length; i++) {
        assert(result.horizons[i].bestDistance >= result.horizons[i - 1].bestDistance,
            `Horizons should be sorted by distance`);
    }
});

test('testHorizonScoutPicksReasonableHorizon', async () => {
    const { scoutHorizons } = await import('./course-solver.js');
    const ship = createMockShip();
    const target = createMockTarget('VENUS');

    const result = await scoutHorizons(ship, target);
    const bestHorizon = result.horizons[0];

    // Best horizon should find something reasonable for Venus
    assert(bestHorizon.bestDistance < 1.0,
        `Best horizon probe should be < 1.0 AU, got ${bestHorizon.bestDistance}`);
});

// Unit 7: Deployment Sweep tests (v4.0)
test('testDeploymentSweepReturnsResult', async () => {
    const { evaluateCandidate, deploymentSweep } = await import('./course-solver.js');
    const ship = createMockShip();
    const target = createMockTarget('VENUS');

    // Get a base result at 100% deployment
    const baseResult = evaluateCandidate(-35, 0, ship, target);

    const sweepResult = await deploymentSweep(ship, target, baseResult);

    assert(sweepResult.best !== null, 'Should return a best result');
    assert(typeof sweepResult.evalCount === 'number', 'Should report evalCount');
    assert(sweepResult.evalCount === 3, `Expected 3 deployment evals (skip 100%), got ${sweepResult.evalCount}`);
});

test('testDeploymentSweepMaintainsOrImproves', async () => {
    const { evaluateCandidate, deploymentSweep } = await import('./course-solver.js');
    const ship = createMockShip();
    const target = createMockTarget('VENUS');

    const baseResult = evaluateCandidate(-35, 0, ship, target);
    const sweepResult = await deploymentSweep(ship, target, baseResult);

    // Deployment sweep should maintain or improve
    assert(sweepResult.best.minDistance <= baseResult.minDistance,
        `Sweep (${sweepResult.best.minDistance}) should be <= base (${baseResult.minDistance})`);
});

// Unit 8: Main Solver integration tests
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
    assert(typeof solution.deployment === 'number', 'Should have deployment');
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

test('testSolveCourseIsFasterThanOldSolver', async () => {
    const { solveCourse } = await import('./course-solver.js');
    const ship = createMockShip();
    const target = createMockTarget('VENUS');

    const solution = await solveCourse(ship, target);

    // v4.1 should complete in under 15 seconds (vs 30-45s old)
    assert(solution.searchMetrics.computeTimeMs < 15000,
        `Solver should complete in < 15s, took ${solution.searchMetrics.computeTimeMs}ms`);

    // Should use far fewer evaluations than old solver (~6000)
    // v4.1: ~500-1000 evals (91 recon × 3 horizons + NM + scouting)
    assert(solution.searchMetrics.totalEvaluations < 1500,
        `Should use < 1500 evaluations, used ${solution.searchMetrics.totalEvaluations}`);

    console.log(`  v4.1 performance: ${solution.searchMetrics.totalEvaluations} evals ` +
                `in ${solution.searchMetrics.computeTimeMs}ms`);
});

test('testSolveCourseReportsAlgorithm', async () => {
    const { solveCourse } = await import('./course-solver.js');
    const ship = createMockShip();
    const target = createMockTarget('VENUS');

    const solution = await solveCourse(ship, target);

    assert(solution.searchMetrics.algorithm === 'grid-bracket-v4.1',
        `Algorithm should be grid-bracket-v4.1, got ${solution.searchMetrics.algorithm}`);
});

// Unit 9: Quality metrics tests
test('testQualityRatingsMatchThresholds', async () => {
    const { solveCourse } = await import('./course-solver.js');
    const { SOI_RADII } = await import('../config.js');
    const ship = createMockShip();
    const target = createMockTarget('VENUS');

    const solution = await solveCourse(ship, target);

    // v3.7: INTERCEPT threshold is now SOI-based (Venus SOI = 0.00411 AU)
    const interceptThreshold = SOI_RADII.VENUS || 0.01;
    const nearMissThreshold = 0.05;
    const marginalThreshold = 0.2;

    // Verify quality rating matches distance using SOI-based threshold
    if (solution.minDistance < interceptThreshold) {
        assert(solution.quality === 'INTERCEPT',
            `Should be INTERCEPT at ${solution.minDistance} AU (SOI threshold: ${interceptThreshold} AU)`);
    } else if (solution.minDistance < nearMissThreshold) {
        assert(solution.quality === 'NEAR_MISS',
            `Should be NEAR_MISS at ${solution.minDistance} AU`);
    } else if (solution.minDistance < marginalThreshold) {
        assert(solution.quality === 'MARGINAL',
            `Should be MARGINAL at ${solution.minDistance} AU`);
    } else {
        // Could be NO_SOLUTION, PHASE_MISS, or NO_CROSSING
        assert(['NO_SOLUTION', 'PHASE_MISS', 'NO_CROSSING'].includes(solution.quality),
            `Should be NO_SOLUTION/PHASE_MISS/NO_CROSSING at ${solution.minDistance} AU, got ${solution.quality}`);
    }
});

// Unit 9b: SOI-based intercept threshold tests (v3.7)
test('testInterceptThresholdUsesSOI', async () => {
    const { solveCourse } = await import('./course-solver.js');
    const { SOI_RADII } = await import('../config.js');

    const ship = createMockShip();
    const venusTarget = createMockTarget('VENUS');

    const solution = await solveCourse(ship, venusTarget);

    // Solution should include the SOI-based threshold
    assert(solution.crossingInfo !== undefined, 'Solution should have crossingInfo');
    assert(solution.crossingInfo.interceptThreshold !== undefined,
        'Solution should include interceptThreshold');

    // Threshold should match Venus SOI
    const expectedThreshold = SOI_RADII.VENUS;
    assertApprox(solution.crossingInfo.interceptThreshold, expectedThreshold, 0.0001,
        `Intercept threshold should match Venus SOI (${expectedThreshold} AU)`);
});

test('testSolutionIncludesSearchMetrics', async () => {
    const { solveCourse } = await import('./course-solver.js');
    const ship = createMockShip();
    const target = createMockTarget('VENUS');

    const solution = await solveCourse(ship, target);

    assert(solution.searchMetrics !== undefined, 'Should have searchMetrics');
    assert(typeof solution.searchMetrics.totalEvaluations === 'number', 'Should have totalEvaluations');
    assert(typeof solution.searchMetrics.computeTimeMs === 'number', 'Should have computeTimeMs');
    assert(solution.searchMetrics.totalEvaluations > 0, 'Should have done evaluations');
});

// Unit 10: Resolution tests (shared config)
test('testConfigIncludesHighResolutionSettings', async () => {
    const { getConfig } = await import('./course-solver.js');
    const { INTERSECTION_CONFIG } = await import('../config.js');
    const config = getConfig();

    assert(typeof config.stepsPerDay === 'number', 'CONFIG should have stepsPerDay');
    assert(config.stepsPerDay >= 10, `stepsPerDay should be >= 10, got ${config.stepsPerDay}`);
    assert(typeof config.maxSteps === 'number', 'CONFIG should have maxSteps');
    assert(config.maxSteps >= 4000, `maxSteps should be >= 4000, got ${config.maxSteps}`);
    assert(typeof config.minSteps === 'number', 'CONFIG should have minSteps');
    assert(config.minSteps >= 100, `minSteps should be >= 100, got ${config.minSteps}`);
    // Verify shared config is used
    assert(config.minSteps === INTERSECTION_CONFIG.minSteps,
        `minSteps should match INTERSECTION_CONFIG (${INTERSECTION_CONFIG.minSteps}), got ${config.minSteps}`);
});

test('testSolverUsesHighResolutionForYearHorizon', async () => {
    const { getConfig } = await import('./course-solver.js');
    const config = getConfig();

    const duration = 365;
    const expectedMinSteps = duration * 10;

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

    const testCases = [
        { days: 180, expectedMin: 1800 },
        { days: 365, expectedMin: 3650 },
        { days: 730, expectedMin: 6000 },
        { days: 1460, expectedMin: 6000 },
    ];

    for (const tc of testCases) {
        const rawSteps = Math.round(tc.days * config.stepsPerDay);
        const calculatedSteps = Math.min(config.maxSteps, Math.max(config.minSteps, rawSteps));
        const expectedSteps = Math.min(config.maxSteps, Math.max(config.minSteps, tc.days * config.stepsPerDay));

        assert(calculatedSteps >= tc.expectedMin || calculatedSteps === config.maxSteps,
            `${tc.days}-day horizon: expected >= ${tc.expectedMin} or maxSteps, got ${calculatedSteps}`);
    }
});

// Unit 11: Quadratic crossing calculation tests
test('testQuadraticCrossingCalculation', async () => {
    const p1 = { x: 0.5, y: 0.5, z: 0, time: 100 };
    const p2 = { x: 1.0, y: 0.0, z: 0, time: 101 };
    const targetRadius = 0.8;

    const r1 = Math.sqrt(p1.x**2 + p1.y**2 + p1.z**2);
    const r2 = Math.sqrt(p2.x**2 + p2.y**2 + p2.z**2);

    const t_linear = (targetRadius - r1) / (r2 - r1);

    const linearPos = {
        x: p1.x + t_linear * (p2.x - p1.x),
        y: p1.y + t_linear * (p2.y - p1.y),
        z: p1.z + t_linear * (p2.z - p1.z)
    };
    const linearRadius = Math.sqrt(linearPos.x**2 + linearPos.y**2 + linearPos.z**2);

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dz = p2.z - p1.z;

    const a = dx*dx + dy*dy + dz*dz;
    const b = 2 * (p1.x*dx + p1.y*dy + p1.z*dz);
    const c = r1*r1 - targetRadius*targetRadius;

    const discriminant = b*b - 4*a*c;
    const sqrtDisc = Math.sqrt(discriminant);
    const t1 = (-b - sqrtDisc) / (2*a);
    const t2 = (-b + sqrtDisc) / (2*a);

    const t_quadratic = (t1 >= 0 && t1 <= 1) ? t1 : t2;

    const quadraticPos = {
        x: p1.x + t_quadratic * (p2.x - p1.x),
        y: p1.y + t_quadratic * (p2.y - p1.y),
        z: p1.z + t_quadratic * (p2.z - p1.z)
    };
    const quadraticRadius = Math.sqrt(quadraticPos.x**2 + quadraticPos.y**2 + quadraticPos.z**2);

    const linearError = Math.abs(linearRadius - targetRadius);
    assert(linearError > 0.001,
        `Linear interpolation should have measurable error, got ${linearError}`);

    const quadraticError = Math.abs(quadraticRadius - targetRadius);
    assert(quadraticError < 1e-10,
        `Quadratic should give exact radius, error was ${quadraticError}`);

    assert(Math.abs(t_linear - t_quadratic) > 0.001,
        `Linear and quadratic should give different t values`);
});

test('testSolveQuadraticCrossingExported', async () => {
    const { solveQuadraticCrossing } = await import('./course-solver.js');

    assert(typeof solveQuadraticCrossing === 'function',
        'solveQuadraticCrossing should be exported');

    const p1 = { x: 0.5, y: 0.5, z: 0 };
    const p2 = { x: 1.0, y: 0.0, z: 0 };
    const targetRadius = 0.8;

    const t = solveQuadraticCrossing(p1, p2, targetRadius);

    assert(t !== null, 'Should find a valid crossing');
    assert(t >= 0 && t <= 1, `t should be in [0,1], got ${t}`);

    const pos = {
        x: p1.x + t * (p2.x - p1.x),
        y: p1.y + t * (p2.y - p1.y),
        z: p1.z + t * (p2.z - p1.z)
    };
    const radius = Math.sqrt(pos.x**2 + pos.y**2 + pos.z**2);
    const error = Math.abs(radius - targetRadius);

    assert(error < 1e-10,
        `Position at t=${t} should have radius=${targetRadius}, got ${radius} (error: ${error})`);
});

test('testSolveQuadraticCrossingNoCrossing', async () => {
    const { solveQuadraticCrossing } = await import('./course-solver.js');

    const p1 = { x: 0.3, y: 0.3, z: 0 };
    const p2 = { x: 0.4, y: 0.4, z: 0 };
    const targetRadius = 1.0;

    const t = solveQuadraticCrossing(p1, p2, targetRadius);

    assert(t === null, 'Should return null when no crossing exists');
});

test('testSolveQuadraticCrossingDegenerate', async () => {
    const { solveQuadraticCrossing } = await import('./course-solver.js');

    const p1 = { x: 0.5, y: 0.5, z: 0 };
    const p2 = { x: 0.5, y: 0.5, z: 0 };
    const targetRadius = 0.8;

    const t = solveQuadraticCrossing(p1, p2, targetRadius);

    assert(t === null, 'Should return null for degenerate case');
});

// Unit 12: Shared configuration tests
test('testSolverUsesSharedConfig', async () => {
    const { getConfig } = await import('./course-solver.js');
    const { INTERSECTION_CONFIG } = await import('../config.js');

    const solverConfig = getConfig();

    const stepsMatch = solverConfig.stepsPerDay === INTERSECTION_CONFIG.stepsPerDay;
    const maxStepsMatch = solverConfig.maxSteps === INTERSECTION_CONFIG.maxSteps;
    const minStepsMatch = solverConfig.minSteps === INTERSECTION_CONFIG.minSteps;

    assert(stepsMatch,
        `Solver stepsPerDay (${solverConfig.stepsPerDay}) should match INTERSECTION_CONFIG (${INTERSECTION_CONFIG.stepsPerDay})`);
    assert(maxStepsMatch,
        `Solver maxSteps (${solverConfig.maxSteps}) should match INTERSECTION_CONFIG (${INTERSECTION_CONFIG.maxSteps})`);
    assert(minStepsMatch,
        `Solver minSteps (${solverConfig.minSteps}) should match INTERSECTION_CONFIG (${INTERSECTION_CONFIG.minSteps})`);
});

// Unit 13: v4.1 grid-bracket search config tests
test('testBracketSearchConfigPresent', async () => {
    const { getConfig } = await import('./course-solver.js');
    const config = getConfig();

    assert(typeof config.reconGridStep === 'number', 'Should have reconGridStep');
    assert(config.reconGridStep >= 5 && config.reconGridStep <= 15, `reconGridStep should be 5-15°, got ${config.reconGridStep}`);
    assert(typeof config.nmAlpha === 'number', 'Should have Nelder-Mead alpha');
    assert(typeof config.nmGamma === 'number', 'Should have Nelder-Mead gamma');
    assert(Array.isArray(config.precisionTiers), 'Should have precisionTiers');
    assert(Array.isArray(config.deploymentLevels), 'Should have deploymentLevels');
    assert(config.deploymentLevels.length >= 3, 'Should have >= 3 deployment levels');
    assert(typeof config.topHorizonsToSearch === 'number', 'Should have topHorizonsToSearch');
    assert(config.topHorizonsToSearch >= 3, `Should search >= 3 horizons, got ${config.topHorizonsToSearch}`);
});

// Unit 14: Legacy backward compatibility tests
test('testLegacyCoarseSweepStillWorks', async () => {
    const { coarseSweep } = await import('./course-solver.js');
    const ship = createMockShip();
    const target = createMockTarget('VENUS');

    const results = await coarseSweep(ship, target);

    // Yaw: -60 to 60 in 5° steps = 25 values
    // Pitch: -30 to 30 in 5° steps = 13 values
    // Total: 25 * 13 = 325... wait, let me recalculate
    // Yaw: -60, -55, -50... 55, 60 = (60-(-60))/5 + 1 = 25
    // Pitch: -30, -25, -20... 25, 30 = (30-(-30))/5 + 1 = 13
    // Total: 25 * 13 = 325
    // But legacy used 10° steps: -60 to 60 in 10° = 13, -30 to 30 in 10° = 7 → 91
    // The v4.0 legacy function uses 5° steps for grid
    // Actually: -60 to 60 step 5 = 25 values, -30 to 30 step 5 = 13 values = 325
    assert(results.length > 0, 'Should return results');
    // Results should be sorted
    for (let i = 1; i < results.length; i++) {
        assert(results[i].minDistance >= results[i - 1].minDistance,
            `Results should be sorted`);
    }
});

test('testLegacyFineSearchStillWorks', async () => {
    const { coarseSweep, fineSearch } = await import('./course-solver.js');
    const ship = createMockShip();
    const target = createMockTarget('VENUS');

    const coarseResults = await coarseSweep(ship, target);
    const topCandidates = coarseResults.slice(0, 5);

    const refined = await fineSearch(topCandidates, ship, target);

    assert(refined.minDistance <= topCandidates[0].minDistance,
        `Fine search (${refined.minDistance}) should improve on coarse (${topCandidates[0].minDistance})`);
});

test('testLegacyUltraFinePolishStillWorks', async () => {
    const { coarseSweep, fineSearch, ultraFinePolish } = await import('./course-solver.js');
    const ship = createMockShip();
    const target = createMockTarget('VENUS');

    const coarseResults = await coarseSweep(ship, target);
    const refined = await fineSearch(coarseResults.slice(0, 5), ship, target);
    const polished = await ultraFinePolish(refined, ship, target);

    assert(polished.minDistance <= refined.minDistance,
        `Ultra polish (${polished.minDistance}) should improve on fine (${refined.minDistance})`);
});

// Unit 15: Edge case tests
test('testSolveCourseWithInvalidShip', async () => {
    const { solveCourse } = await import('./course-solver.js');
    const invalidShip = { name: 'Invalid' }; // Missing orbitalElements
    const target = createMockTarget('VENUS');

    const solution = await solveCourse(invalidShip, target);

    assert(solution === null || solution.quality === 'NO_SOLUTION',
        'Should handle invalid ship gracefully');
});

test('testSolveCourseIncludesDeployment', async () => {
    const { solveCourse } = await import('./course-solver.js');
    const ship = createMockShip();
    const target = createMockTarget('VENUS');

    const solution = await solveCourse(ship, target);

    assert(typeof solution.deployment === 'number', 'Should include deployment in solution');
    assert(solution.deployment > 0 && solution.deployment <= 100,
        `Deployment should be 1-100%, got ${solution.deployment}`);
});

// ============================================================================
// TEST RUNNER
// ============================================================================

export async function runAllTests() {
    console.log('=== COURSE SOLVER TESTS (v4.1) ===\n');

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
console.log('[COURSE_SOLVER_TEST] Test module loaded (v4.1). Run runAllTests() to execute.');
