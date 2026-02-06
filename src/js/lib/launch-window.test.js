/**
 * Console-based tests for launch-window.js
 *
 * Run in browser console after loading the game:
 *   import('/js/lib/launch-window.test.js').then(m => m.runAllTests())
 *
 * Or run individual tests:
 *   import('/js/lib/launch-window.test.js').then(m => m.testScanBasic())
 */

import { scanLaunchWindows, groupIntoWindows, verifyTopWindows, findLaunchWindows, estimateSynodicPeriod, computeDepartureSchedule, LAUNCH_WINDOW_STRATEGIES } from './launch-window.js';
import { MU_SUN, J2000 } from './orbital.js';

// ============================================================================
// Test utilities
// ============================================================================

function assert(condition, message) {
    if (!condition) {
        console.error(`❌ FAIL: ${message}`);
        return false;
    }
    console.log(`✅ PASS: ${message}`);
    return true;
}

function assertApprox(actual, expected, tolerance, message) {
    const diff = Math.abs(actual - expected);
    if (diff > tolerance) {
        console.error(`❌ FAIL: ${message} (expected ${expected}, got ${actual}, diff ${diff})`);
        return false;
    }
    console.log(`✅ PASS: ${message}`);
    return true;
}

// ============================================================================
// Test data
// ============================================================================

// Earth-like orbit at 1 AU
const EARTH_ORBIT = {
    a: 1.0,
    e: 0.017,
    i: 0.0,
    Ω: 0,
    ω: 1.8,
    M0: 0,
    epoch: J2000 + 7305,
    μ: MU_SUN
};

// Mars orbit
const MARS_ORBIT = {
    a: 1.524,
    e: 0.093,
    i: 0.032,
    Ω: 0.864,
    ω: 5.001,
    M0: 0.338,
    epoch: J2000 + 7305,
    μ: MU_SUN
};

// Venus orbit
const VENUS_ORBIT = {
    a: 0.723,
    e: 0.007,
    i: 0.059,
    Ω: 1.338,
    ω: 0.959,
    M0: 0.874,
    epoch: J2000 + 7305,
    μ: MU_SUN
};

// Jupiter orbit (outer planet)
const JUPITER_ORBIT = {
    a: 5.203,
    e: 0.049,
    i: 0.023,
    Ω: 1.753,
    ω: 4.779,
    M0: 0.6,
    epoch: J2000 + 7305,
    μ: MU_SUN
};

// Mock ship near Earth orbit
const MOCK_SHIP = {
    orbitalElements: { ...EARTH_ORBIT },
    sail: {
        area: 3000000,
        reflectivity: 0.9,
        angle: 0.6,
        pitchAngle: 0,
        deploymentPercent: 100,
        condition: 100,
        sailCount: 1
    },
    mass: 10000,
    soiState: { isInSOI: false }
};

// Ship in SOI (should trigger guard)
const SOI_SHIP = {
    ...MOCK_SHIP,
    soiState: { isInSOI: true, currentBody: 'EARTH' }
};

const START_JD = J2000 + 7305;

// ============================================================================
// Tests
// ============================================================================

/**
 * Test 1: Strategy grid has expected size (9 yaw × 5 pitch = 45 probes)
 */
export function testStrategyCount() {
    console.log('\n--- Test: Strategy Grid Count ---');
    return assert(
        LAUNCH_WINDOW_STRATEGIES.length === 45,
        `Strategy count is ${LAUNCH_WINDOW_STRATEGIES.length} (expected 45 = 9×5 grid)`
    );
}

/**
 * Test 1b: Strategy grid covers the full parameter space systematically
 */
export function testGridCoverage() {
    console.log('\n--- Test: Grid Coverage ---');
    const yawValues = new Set(LAUNCH_WINDOW_STRATEGIES.map(s => s.yawDeg));
    const pitchValues = new Set(LAUNCH_WINDOW_STRATEGIES.map(s => s.pitchDeg));

    let pass = true;
    pass = assert(yawValues.size === 9, `9 unique yaw values (got ${yawValues.size})`) && pass;
    pass = assert(pitchValues.size === 5, `5 unique pitch values (got ${pitchValues.size})`) && pass;
    pass = assert(yawValues.has(-60) && yawValues.has(60), 'Covers ±60° yaw') && pass;
    pass = assert(pitchValues.has(-30) && pitchValues.has(30), 'Covers ±30° pitch') && pass;

    // Check coast baseline exists
    const coastEntry = LAUNCH_WINDOW_STRATEGIES.find(s => s.yawDeg === 0 && s.pitchDeg === 0);
    pass = assert(coastEntry && coastEntry.deployment === 0, 'Has coast baseline (0,0) with deployment=0') && pass;

    // Check other entries have deployment=100
    const thrustEntries = LAUNCH_WINDOW_STRATEGIES.filter(s => !(s.yawDeg === 0 && s.pitchDeg === 0));
    pass = assert(thrustEntries.every(s => s.deployment === 100), 'All non-coast entries have deployment=100') && pass;

    return pass;
}

/**
 * Test 2: Synodic period for Earth-Mars
 */
export function testSynodicPeriod() {
    console.log('\n--- Test: Synodic Period ---');
    const period = estimateSynodicPeriod(1.0, 1.524);
    // Earth-Mars synodic period is ~780 days
    return assertApprox(period, 780, 20, `Earth-Mars synodic period: ${period.toFixed(0)} days (expected ~780)`);
}

/**
 * Test 3: Synodic period for Earth-Venus
 */
export function testSynodicPeriodVenus() {
    console.log('\n--- Test: Synodic Period Venus ---');
    const period = estimateSynodicPeriod(1.0, 0.723);
    // Earth-Venus synodic period is ~584 days
    return assertApprox(period, 584, 15, `Earth-Venus synodic period: ${period.toFixed(0)} days (expected ~584)`);
}

/**
 * Test 4: Basic scan returns results
 */
export async function testScanBasic() {
    console.log('\n--- Test: Basic Scan ---');
    const results = await scanLaunchWindows(
        MOCK_SHIP,
        { elements: MARS_ORBIT, name: 'MARS' },
        START_JD,
        { maxCoastDays: 90, intervalDays: 30 }  // Short scan for speed
    );

    let pass = true;
    pass = assert(Array.isArray(results), 'Returns array') && pass;
    pass = assert(results.length > 0, `Has results (${results.length})`) && pass;
    pass = assert(results[0].coastDays !== undefined, 'Results have coastDays') && pass;
    pass = assert(results[0].totalDays !== undefined, 'Results have totalDays') && pass;
    pass = assert(results[0].minDistance !== undefined, 'Results have minDistance') && pass;
    pass = assert(isFinite(results[0].minDistance), 'minDistance is finite') && pass;
    return pass;
}

/**
 * Test 5: Window grouping
 */
export function testGrouping() {
    console.log('\n--- Test: Window Grouping ---');
    // Mock scan results with two clusters
    const mockResults = [
        { coastDays: 0, totalDays: 500, minDistance: 0.5, status: 'NO_INTERCEPT' },
        { coastDays: 30, totalDays: 480, minDistance: 0.04, status: 'NEAR_MISS' },
        { coastDays: 60, totalDays: 460, minDistance: 0.02, status: 'INTERCEPT' },
        { coastDays: 90, totalDays: 450, minDistance: 0.03, status: 'NEAR_MISS' },
        // Gap > 60 days
        { coastDays: 300, totalDays: 400, minDistance: 0.01, status: 'INTERCEPT' },
        { coastDays: 330, totalDays: 410, minDistance: 0.02, status: 'INTERCEPT' },
    ];

    const windows = groupIntoWindows(mockResults, 0.05);

    let pass = true;
    pass = assert(windows.length === 2, `Two windows found (got ${windows.length})`) && pass;
    pass = assert(windows[0].windowStart <= 90, 'First window starts early') && pass;
    pass = assert(windows[1].windowStart >= 300, 'Second window starts late') && pass;
    return pass;
}

/**
 * Test 6: SOI guard
 */
export async function testSOIGuard() {
    console.log('\n--- Test: SOI Guard ---');
    const result = await findLaunchWindows(
        SOI_SHIP,
        { elements: MARS_ORBIT, name: 'MARS' },
        START_JD
    );

    let pass = true;
    pass = assert(result.error === 'EXIT_SOI', `Error is EXIT_SOI (got ${result.error})`) && pass;
    pass = assert(result.windows.length === 0, 'No windows returned') && pass;
    return pass;
}

/**
 * Test 7: Invalid input guard
 */
export async function testInvalidInput() {
    console.log('\n--- Test: Invalid Input Guard ---');
    const result = await findLaunchWindows(
        { orbitalElements: null },
        { elements: MARS_ORBIT, name: 'MARS' },
        START_JD
    );

    return assert(result.error === 'INVALID_INPUT', `Error is INVALID_INPUT (got ${result.error})`);
}

/**
 * Test 8: Full findLaunchWindows for Mars (integration test)
 */
export async function testFullMars() {
    console.log('\n--- Test: Full Mars Launch Windows ---');
    const startMs = Date.now();

    const result = await findLaunchWindows(
        MOCK_SHIP,
        { elements: MARS_ORBIT, name: 'MARS' },
        START_JD,
        { maxCoastDays: 365, intervalDays: 30 }  // 1 year scan
    );

    const elapsed = Date.now() - startMs;
    console.log(`  Compute time: ${(elapsed / 1000).toFixed(1)}s`);
    console.log(`  Windows found: ${result.windows.length}`);
    console.log(`  Baseline total: ${result.baseline ? Math.round(result.baseline.totalDays) + 'd' : 'N/A'}`);

    if (result.windows.length > 0) {
        const best = result.windows[0];
        console.log(`  Best window: coast ${best.coastDays}d + flight ${Math.round(best.flightDays)}d = ${Math.round(best.totalDays)}d total`);
    }

    let pass = true;
    pass = assert(!result.error, `No error (${result.error || 'OK'})`) && pass;
    pass = assert(result.baseline !== null, 'Has baseline') && pass;
    pass = assert(result.windows.length > 0, 'Found at least one window') && pass;
    pass = assert(result.computeTimeMs > 0, 'Tracked compute time') && pass;
    pass = assert(elapsed < 120000, `Completed within timeout (${elapsed}ms)`) && pass;
    return pass;
}

/**
 * Test 9: Outer planet detection (Jupiter uses longer horizons)
 */
export async function testOuterPlanet() {
    console.log('\n--- Test: Outer Planet Detection ---');
    const result = await scanLaunchWindows(
        MOCK_SHIP,
        { elements: JUPITER_ORBIT, name: 'JUPITER' },
        START_JD,
        { maxCoastDays: 60, intervalDays: 30 }  // Minimal scan for speed
    );

    let pass = true;
    pass = assert(result.length > 0, 'Has results for Jupiter') && pass;
    // Outer planets should use longer horizons (730+ days)
    if (result.length > 0) {
        pass = assert(
            result[0].horizonUsed >= 730,
            `Used long horizon (${result[0].horizonUsed}d) for outer planet`
        ) && pass;
    }
    return pass;
}

/**
 * Test 10: Smart departure scheduling uses synodic period
 */
export function testSmartScheduling() {
    console.log('\n--- Test: Smart Departure Scheduling ---');

    // Venus from Earth: synodic period ~584 days
    const schedule = computeDepartureSchedule(EARTH_ORBIT, VENUS_ORBIT, START_JD, 1095);

    let pass = true;
    pass = assert(Array.isArray(schedule), 'Returns array') && pass;
    pass = assert(schedule.length > 0, `Has departure dates (${schedule.length})`) && pass;
    pass = assert(schedule[0] === 0, 'First date is day 0 (depart now)') && pass;

    // Should have more than the uniform 37 dates (1095/30) due to dense sampling
    // but also not be absurdly many
    pass = assert(schedule.length >= 20, `Enough dates for coverage (${schedule.length} >= 20)`) && pass;
    pass = assert(schedule.length <= 150, `Not too many dates (${schedule.length} <= 150)`) && pass;

    // Dates should be sorted
    for (let i = 1; i < schedule.length; i++) {
        if (schedule[i] <= schedule[i - 1]) {
            pass = assert(false, `Dates not sorted at index ${i}: ${schedule[i-1]}, ${schedule[i]}`);
            break;
        }
    }
    if (pass) pass = assert(true, 'Dates are sorted ascending');

    // Last date should be near the max coast days
    pass = assert(schedule[schedule.length - 1] <= 1095, `Last date within range (${schedule[schedule.length - 1]})`) && pass;

    console.log(`  Schedule: ${schedule.length} departure dates over ${schedule[schedule.length - 1]} days`);
    console.log(`  Avg interval: ${(schedule[schedule.length - 1] / schedule.length).toFixed(1)} days`);

    return pass;
}

/**
 * Test 11: Grouping with no good results returns best anyway
 */
export function testGroupingNoneGood() {
    console.log('\n--- Test: Grouping No Good Results ---');
    const mockResults = [
        { coastDays: 0, totalDays: 500, minDistance: 0.8, status: 'NO_INTERCEPT' },
        { coastDays: 30, totalDays: 480, minDistance: 0.6, status: 'NO_INTERCEPT' },
    ];

    const windows = groupIntoWindows(mockResults, 0.05);
    let pass = true;
    pass = assert(windows.length === 1, `Returns 1 window (got ${windows.length})`) && pass;
    pass = assert(windows[0].bestDeparture.minDistance === 0.6, 'Picks best (closest) result') && pass;
    return pass;
}

// ============================================================================
// Runner
// ============================================================================

/**
 * Run all tests
 */
export async function runAllTests() {
    console.log('='.repeat(50));
    console.log('LAUNCH WINDOW ANALYSIS TESTS');
    console.log('='.repeat(50));

    const results = [
        testStrategyCount(),
        testGridCoverage(),
        testSynodicPeriod(),
        testSynodicPeriodVenus(),
        testSmartScheduling(),
        await testScanBasic(),
        testGrouping(),
        await testSOIGuard(),
        await testInvalidInput(),
        await testFullMars(),
        await testOuterPlanet(),
        testGroupingNoneGood(),
    ];

    const passed = results.filter(r => r).length;
    const total = results.length;

    console.log('\n' + '='.repeat(50));
    console.log(`RESULTS: ${passed}/${total} tests passed`);
    console.log('='.repeat(50));

    return passed === total;
}

// Export for browser console access
if (typeof window !== 'undefined') {
    window.launchWindowTests = {
        runAllTests,
        testStrategyCount,
        testGridCoverage,
        testSynodicPeriod,
        testSynodicPeriodVenus,
        testSmartScheduling,
        testScanBasic,
        testGrouping,
        testSOIGuard,
        testInvalidInput,
        testFullMars,
        testOuterPlanet,
        testGroupingNoneGood,
    };
}
