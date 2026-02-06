/**
 * Launch Window Analysis (E+B Hybrid)
 *
 * Finds ideal departure dates by scanning future coast-then-thrust scenarios.
 * Zero code duplication: all trajectory evaluation flows through course-solver's
 * evaluateCandidate().
 *
 * Phase 1 (Scan): Test ~25 sail strategies at each departure date (~2-4s)
 * Phase 2 (Verify): Run 91-point coarse sweep on top 3 windows (~15-25s)
 *
 * All functions accept explicit parameters -- no module-level state, no
 * getJulianDate() calls. Pure computation.
 */

import { evaluateCandidate, coarseSweep } from './course-solver.js';
import { MU_SUN, meanMotion } from './orbital.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Scan parameters for Phase 1 departure sweep.
 */
const SCAN_CONFIG = {
    // Departure date sampling
    defaultMaxCoastDays: 1095,  // 3 years of coast options
    defaultIntervalDays: 30,    // Sample every 30 days

    // Flight duration horizons per departure
    flightHorizons: [365, 730],  // Test 1-year and 2-year transfers

    // Extended horizons for outer planets (semi-major axis > 3 AU)
    outerPlanetThreshold: 3.0,   // AU
    outerFlightHorizons: [730, 1095, 1460],  // 2, 3, 4 year transfers

    // Window grouping: consecutive departures within this gap are one window
    windowGapDays: 60,  // If gap between intercept departures > 60 days, it's a new window

    // Verification limits
    maxVerifyWindows: 3,
    verifyTimeout: 120000,  // 120 second timeout for entire computation

    // Yield frequency (prevent UI blocking)
    yieldFrequency: 10,
};

/**
 * Sail strategies for Phase 1 scanning.
 * Covers major transfer geometries without duplicating NAV_STRATEGIES.
 * ~25 configs: yaw sweep + pitch variations for inclined targets.
 */
export const LAUNCH_WINDOW_STRATEGIES = [
    // In-plane strategies (pitch = 0) - 11 configs
    { yawDeg: -55, pitchDeg: 0, deployment: 100 },
    { yawDeg: -45, pitchDeg: 0, deployment: 100 },
    { yawDeg: -35, pitchDeg: 0, deployment: 100 },
    { yawDeg: -25, pitchDeg: 0, deployment: 100 },
    { yawDeg: -15, pitchDeg: 0, deployment: 100 },
    { yawDeg:   0, pitchDeg: 0, deployment: 0 },     // Coast (baseline)
    { yawDeg:  15, pitchDeg: 0, deployment: 100 },
    { yawDeg:  25, pitchDeg: 0, deployment: 100 },
    { yawDeg:  35, pitchDeg: 0, deployment: 100 },
    { yawDeg:  45, pitchDeg: 0, deployment: 100 },
    { yawDeg:  55, pitchDeg: 0, deployment: 100 },

    // Out-of-plane strategies for inclined targets - 8 configs
    { yawDeg:   0, pitchDeg:  15, deployment: 100 },
    { yawDeg:   0, pitchDeg: -15, deployment: 100 },
    { yawDeg:   0, pitchDeg:  30, deployment: 100 },
    { yawDeg:   0, pitchDeg: -30, deployment: 100 },
    { yawDeg:  35, pitchDeg:  15, deployment: 100 },
    { yawDeg:  35, pitchDeg: -15, deployment: 100 },
    { yawDeg: -35, pitchDeg:  15, deployment: 100 },
    { yawDeg: -35, pitchDeg: -15, deployment: 100 },

    // Combined raise/lower + inclination - 6 configs
    { yawDeg:  35, pitchDeg:  30, deployment: 100 },
    { yawDeg:  35, pitchDeg: -30, deployment: 100 },
    { yawDeg: -35, pitchDeg:  30, deployment: 100 },
    { yawDeg: -35, pitchDeg: -30, deployment: 100 },
    { yawDeg:  45, pitchDeg:  15, deployment: 100 },
    { yawDeg: -45, pitchDeg:  15, deployment: 100 },
];

// ============================================================================
// PHASE 1: FAST DEPARTURE SWEEP
// ============================================================================

/**
 * Scan departure dates to find launch windows.
 *
 * For each departure date (coast 0, 30, 60... days), tests all strategies
 * and records the best result. Returns an array of per-departure evaluations
 * sorted by quality.
 *
 * @param {Object} ship - Ship object (frozen snapshot with orbitalElements, sail, mass)
 * @param {Object} target - Target body (with elements)
 * @param {number} startJD - Julian date at computation start (snapshot)
 * @param {Object} options - Optional overrides {maxCoastDays, intervalDays}
 * @param {Function} onProgress - Progress callback ({phase, progress, message})
 * @returns {Promise<Array>} Per-departure results sorted by total time for intercepts
 */
export async function scanLaunchWindows(ship, target, startJD, options = {}, onProgress = null) {
    const maxCoastDays = options.maxCoastDays || SCAN_CONFIG.defaultMaxCoastDays;
    const intervalDays = options.intervalDays || SCAN_CONFIG.defaultIntervalDays;

    // Choose flight horizons based on target distance
    const isOuterPlanet = target.elements.a > SCAN_CONFIG.outerPlanetThreshold;
    const flightHorizons = isOuterPlanet
        ? SCAN_CONFIG.outerFlightHorizons
        : SCAN_CONFIG.flightHorizons;

    const departureDates = [];
    for (let coast = 0; coast <= maxCoastDays; coast += intervalDays) {
        departureDates.push(coast);
    }

    const totalEvals = departureDates.length * LAUNCH_WINDOW_STRATEGIES.length * flightHorizons.length;
    let evalCount = 0;

    const results = [];

    for (const coastDays of departureDates) {
        const departureJD = startJD + coastDays;

        let bestForDeparture = null;

        for (const horizon of flightHorizons) {
            for (const strategy of LAUNCH_WINDOW_STRATEGIES) {
                const result = evaluateCandidate(
                    strategy.yawDeg,
                    strategy.pitchDeg,
                    ship,
                    target,
                    {
                        startJulianDate: departureJD,
                        maxDays: horizon,
                        deployment: strategy.deployment,
                    }
                );

                // Track best result for this departure date
                if (!bestForDeparture || result.minDistance < bestForDeparture.minDistance) {
                    bestForDeparture = {
                        ...result,
                        coastDays,
                        flightDays: result.timeToClosest,
                        totalDays: coastDays + result.timeToClosest,
                        horizonUsed: horizon,
                        strategyUsed: strategy,
                    };
                }

                evalCount++;
                if (evalCount % SCAN_CONFIG.yieldFrequency === 0) {
                    onProgress?.({
                        phase: 'scanning',
                        progress: evalCount / totalEvals,
                        message: `Scanning departures... (${Math.round(evalCount / totalEvals * 100)}%)`,
                    });
                    await yieldToMainThread();
                }
            }
        }

        if (bestForDeparture) {
            results.push(bestForDeparture);
        }
    }

    return results;
}

// ============================================================================
// WINDOW GROUPING
// ============================================================================

/**
 * Group consecutive departure results into discrete launch windows.
 *
 * Consecutive departures that achieve intercept/near-miss (within gapDays)
 * form one window. The best departure within each window is selected as
 * the window representative.
 *
 * @param {Array} scanResults - Results from scanLaunchWindows()
 * @param {number} interceptThreshold - Distance threshold for "good" result (AU)
 * @returns {Array} Grouped windows, each with best departure and window span
 */
export function groupIntoWindows(scanResults, interceptThreshold = 0.05) {
    if (!scanResults || scanResults.length === 0) return [];

    // Filter to results that are at least near-miss quality
    const goodResults = scanResults.filter(r => r.minDistance < interceptThreshold);

    if (goodResults.length === 0) {
        // No good windows found -- return the single best result as the only "window"
        const best = scanResults.reduce((a, b) => a.minDistance < b.minDistance ? a : b);
        return [{
            bestDeparture: best,
            windowStart: best.coastDays,
            windowEnd: best.coastDays,
            windowSpan: 0,
            quality: best.status,
        }];
    }

    // Sort by coast days for grouping
    const sorted = [...goodResults].sort((a, b) => a.coastDays - b.coastDays);

    const windows = [];
    let currentWindow = {
        departures: [sorted[0]],
        start: sorted[0].coastDays,
    };

    for (let i = 1; i < sorted.length; i++) {
        const gap = sorted[i].coastDays - sorted[i - 1].coastDays;

        if (gap <= SCAN_CONFIG.windowGapDays) {
            // Same window
            currentWindow.departures.push(sorted[i]);
        } else {
            // New window -- finalize current
            windows.push(finalizeWindow(currentWindow));
            currentWindow = {
                departures: [sorted[i]],
                start: sorted[i].coastDays,
            };
        }
    }

    // Finalize last window
    windows.push(finalizeWindow(currentWindow));

    // Sort windows by best total trip time
    windows.sort((a, b) => a.bestDeparture.totalDays - b.bestDeparture.totalDays);

    return windows;
}

/**
 * Finalize a window group: pick the best departure.
 */
function finalizeWindow(windowGroup) {
    const best = windowGroup.departures.reduce((a, b) =>
        a.minDistance < b.minDistance ? a : b
    );

    return {
        bestDeparture: best,
        windowStart: windowGroup.start,
        windowEnd: windowGroup.departures[windowGroup.departures.length - 1].coastDays,
        windowSpan: windowGroup.departures[windowGroup.departures.length - 1].coastDays - windowGroup.start,
        quality: best.status,
    };
}

// ============================================================================
// PHASE 2: VERIFY TOP WINDOWS
// ============================================================================

/**
 * Verify top windows with deeper evaluation (91-point coarse sweep).
 *
 * For each window, runs the full coarse sweep from the course solver to find
 * the exact optimal sail settings at that departure date.
 *
 * @param {Object} ship - Ship object (frozen snapshot)
 * @param {Object} target - Target body
 * @param {number} startJD - Julian date at computation start
 * @param {Array} windows - Windows from groupIntoWindows()
 * @param {Object} options - Optional overrides
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Array>} Verified windows with exact sail settings
 */
export async function verifyTopWindows(ship, target, startJD, windows, options = {}, onProgress = null) {
    const maxVerify = options.maxVerifyWindows || SCAN_CONFIG.maxVerifyWindows;
    const toVerify = windows.slice(0, maxVerify);

    const verified = [];

    for (let i = 0; i < toVerify.length; i++) {
        const window = toVerify[i];
        const departureJD = startJD + window.bestDeparture.coastDays;
        const horizon = window.bestDeparture.horizonUsed;

        onProgress?.({
            phase: 'verifying',
            progress: i / toVerify.length,
            message: `Verifying window ${i + 1}/${toVerify.length} (coast ${window.bestDeparture.coastDays}d)...`,
            windowIndex: i,
        });

        // Run coarse sweep at this departure date
        const coarseResults = await coarseSweep(
            ship,
            target,
            { startJulianDate: departureJD, maxDays: horizon },
            (p) => {
                onProgress?.({
                    phase: 'verifying',
                    progress: (i + p) / toVerify.length,
                    message: `Verifying window ${i + 1}/${toVerify.length}...`,
                    windowIndex: i,
                });
            }
        );

        const best = coarseResults[0];

        verified.push({
            coastDays: window.bestDeparture.coastDays,
            flightDays: best.timeToClosest,
            totalDays: window.bestDeparture.coastDays + best.timeToClosest,
            windowStart: window.windowStart,
            windowEnd: window.windowEnd,
            windowSpan: window.windowSpan,
            // Verified sail settings
            yawDeg: best.yawDeg,
            pitchDeg: best.pitchDeg,
            deployment: 100,
            // Verified outcome
            minDistance: best.minDistance,
            status: best.status,
            quality: best.status,
            horizonUsed: horizon,
            // Crossing metadata
            crossingInfo: {
                crossingIndex: best.crossingIndex,
                totalCrossings: best.totalCrossings,
                angularSeparationDeg: best.angularSeparationDeg,
                crossingDirection: best.crossingDirection,
                interceptThreshold: best.interceptThreshold,
            },
            verified: true,
        });
    }

    // Sort by total days (shortest trip first)
    verified.sort((a, b) => a.totalDays - b.totalDays);

    return verified;
}

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================

/**
 * Find launch windows: scan departures, group into windows, verify top ones.
 *
 * This is the main entry point. Combines Phase 1 (fast scan) and Phase 2
 * (deep verification) into a single async operation with progress reporting.
 *
 * @param {Object} ship - Ship object (will be frozen/snapshot internally)
 * @param {Object} target - Target body
 * @param {number} startJD - Julian date (snapshot at computation start)
 * @param {Object} options - Optional overrides
 * @param {Function} onProgress - Progress callback ({phase, progress, message})
 * @returns {Promise<Object>} { windows, baseline, computeTimeMs, error? }
 */
export async function findLaunchWindows(ship, target, startJD, options = {}, onProgress = null) {
    const startTimeMs = Date.now();

    // SOI guard
    if (ship.soiState?.isInSOI) {
        return {
            windows: [],
            baseline: null,
            computeTimeMs: 0,
            error: 'EXIT_SOI',
            errorMessage: 'Exit planetary SOI before analyzing launch windows',
        };
    }

    // Validate inputs
    if (!ship?.orbitalElements || !target?.elements) {
        return {
            windows: [],
            baseline: null,
            computeTimeMs: 0,
            error: 'INVALID_INPUT',
            errorMessage: 'Missing ship or target orbital data',
        };
    }

    // Snapshot ship elements (freeze to prevent drift during async computation)
    const frozenShip = {
        ...ship,
        orbitalElements: { ...ship.orbitalElements },
        sail: ship.sail ? { ...ship.sail } : null,
    };

    try {
        // ============================================================
        // BASELINE: Evaluate "depart now" scenario
        // ============================================================
        onProgress?.({ phase: 'baseline', progress: 0, message: 'Evaluating departure now...' });

        const isOuter = target.elements.a > SCAN_CONFIG.outerPlanetThreshold;
        const baselineHorizons = isOuter
            ? SCAN_CONFIG.outerFlightHorizons
            : SCAN_CONFIG.flightHorizons;

        let baseline = null;
        for (const horizon of baselineHorizons) {
            for (const strategy of LAUNCH_WINDOW_STRATEGIES) {
                const result = evaluateCandidate(
                    strategy.yawDeg,
                    strategy.pitchDeg,
                    frozenShip,
                    target,
                    { startJulianDate: startJD, maxDays: horizon, deployment: strategy.deployment }
                );
                if (!baseline || result.minDistance < baseline.minDistance) {
                    baseline = {
                        ...result,
                        coastDays: 0,
                        flightDays: result.timeToClosest,
                        totalDays: result.timeToClosest,
                        horizonUsed: horizon,
                        strategyUsed: strategy,
                    };
                }
            }
        }

        // ============================================================
        // PHASE 1: Scan departure dates
        // ============================================================
        const scanResults = await scanLaunchWindows(
            frozenShip, target, startJD, options,
            (p) => onProgress?.({
                ...p,
                progress: p.progress * 0.3,  // Phase 1 is 30% of total
            })
        );

        // Check timeout
        if (Date.now() - startTimeMs > SCAN_CONFIG.verifyTimeout) {
            return {
                windows: groupIntoWindows(scanResults, baseline?.interceptThreshold || 0.05),
                baseline,
                computeTimeMs: Date.now() - startTimeMs,
                error: 'TIMEOUT',
                errorMessage: 'Scan complete but verification skipped (timeout)',
            };
        }

        // ============================================================
        // GROUP into windows
        // ============================================================
        const interceptThreshold = baseline?.interceptThreshold || 0.05;
        const windows = groupIntoWindows(scanResults, interceptThreshold);

        // ============================================================
        // PHASE 2: Verify top windows
        // ============================================================
        onProgress?.({ phase: 'verifying', progress: 0.3, message: 'Verifying top windows...' });

        const verified = await verifyTopWindows(
            frozenShip, target, startJD, windows, options,
            (p) => onProgress?.({
                ...p,
                progress: 0.3 + p.progress * 0.7,  // Phase 2 is 70% of total
            })
        );

        const computeTimeMs = Date.now() - startTimeMs;

        onProgress?.({ phase: 'complete', progress: 1, message: 'Analysis complete' });

        return {
            windows: verified,
            baseline,
            computeTimeMs,
            scanResultCount: scanResults.length,
        };

    } catch (error) {
        console.error('[LAUNCH_WINDOW] Error:', error);
        return {
            windows: [],
            baseline: null,
            computeTimeMs: Date.now() - startTimeMs,
            error: 'COMPUTATION_ERROR',
            errorMessage: error.message,
        };
    }
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Estimate synodic period between two orbits.
 * Useful for informational display -- not used for window finding.
 *
 * @param {number} a1 - Semi-major axis of orbit 1 (AU)
 * @param {number} a2 - Semi-major axis of orbit 2 (AU)
 * @returns {number} Synodic period in days
 */
export function estimateSynodicPeriod(a1, a2) {
    const n1 = meanMotion(a1, MU_SUN);  // rad/day
    const n2 = meanMotion(a2, MU_SUN);
    const diff = Math.abs(n1 - n2);
    if (diff < 1e-15) return Infinity;  // Same orbit
    return (2 * Math.PI) / diff;
}

/**
 * Yield to main thread to prevent UI blocking.
 */
function yieldToMainThread() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

console.log('[LAUNCH_WINDOW] Module loaded - E+B hybrid launch window analysis');
