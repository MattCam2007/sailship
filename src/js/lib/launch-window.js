/**
 * Launch Window Analysis (Synodic-Adaptive Hybrid)
 *
 * Finds ideal departure dates by scanning future coast-then-thrust scenarios.
 * Zero code duplication: all trajectory evaluation flows through course-solver's
 * evaluateCandidate().
 *
 * Algorithm:
 *   Phase 0 (Schedule): Synodic-period-aware departure date selection
 *     - Computes phase angles to identify favorable geometry regions
 *     - Dense sampling near favorable phases, sparse elsewhere
 *   Phase 1 (Scan): Systematic 45-probe grid at each departure date
 *     - 15° grid over ±60° yaw × ±30° pitch (no narrow valleys missed)
 *   Phase 1.5 (Refine): Adaptive fill-in around promising dates
 *     - 10-day intervals within ±30 days of dates with crossings
 *   Phase 2 (Verify): 91-point coarse sweep on top 3 windows
 *
 * All functions accept explicit parameters -- no module-level state, no
 * getJulianDate() calls. Pure computation.
 */

import { evaluateCandidate, coarseSweep } from './course-solver.js';
import { MU_SUN, meanMotion, getPosition } from './orbital.js';

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
 * Systematic scan grid for Phase 1 scanning.
 *
 * REPLACED fixed 25-strategy list with a systematic 15° grid.
 * The crossing-aware evaluation is highly discontinuous: small angle
 * changes shift WHEN the trajectory crosses the target's orbit, creating
 * large jumps in distance. Fixed strategies fell between the narrow
 * "valleys" of favorable crossings, causing missed windows.
 *
 * 15° grid over ±60° yaw × ±30° pitch = 9 × 5 = 45 probes.
 * This ensures every 15°×15° cell in parameter space is sampled,
 * matching the course solver's 10° density closely enough for detection.
 */
function generateScanGrid() {
    const strategies = [];
    for (let yaw = -60; yaw <= 60; yaw += 15) {
        for (let pitch = -30; pitch <= 30; pitch += 15) {
            strategies.push({
                yawDeg: yaw,
                pitchDeg: pitch,
                // yaw=0, pitch=0 is the coast (no thrust) baseline
                deployment: (yaw === 0 && pitch === 0) ? 0 : 100,
            });
        }
    }
    return strategies;
}

export const LAUNCH_WINDOW_STRATEGIES = generateScanGrid();

// ============================================================================
// SYNODIC-PERIOD-AWARE DEPARTURE SCHEDULING
// ============================================================================

/**
 * Compute phase angle between ship and target at a given Julian date.
 * Returns the angle in radians [-π, π] from ship to target (positive = target ahead).
 *
 * @param {Object} shipElements - Ship orbital elements
 * @param {Object} targetElements - Target orbital elements
 * @param {number} julianDate - Julian date
 * @returns {number} Phase angle in radians
 */
function computePhaseAngle(shipElements, targetElements, julianDate) {
    const shipPos = getPosition(shipElements, julianDate);
    const targetPos = getPosition(targetElements, julianDate);

    if (!isFinite(shipPos.x) || !isFinite(targetPos.x)) return 0;

    const shipAngle = Math.atan2(shipPos.y, shipPos.x);
    const targetAngle = Math.atan2(targetPos.y, targetPos.x);

    let phase = targetAngle - shipAngle;
    // Normalize to [-π, π]
    while (phase > Math.PI) phase -= 2 * Math.PI;
    while (phase < -Math.PI) phase += 2 * Math.PI;

    return phase;
}

/**
 * Compute departure date schedule using synodic period and phase angle analysis.
 *
 * Instead of uniform 30-day intervals, this function:
 * 1. Calculates the synodic period between ship and target orbits
 * 2. Samples phase angles to find where favorable geometry occurs
 * 3. Samples densely near favorable phases, sparsely elsewhere
 * 4. Ensures coverage of at least 1.5 synodic periods
 *
 * For a solar sail transfer, favorable departure occurs when the phase angle
 * allows the trajectory to cross the target's orbit while the target is nearby.
 * The exact optimal phase depends on transfer duration and sail performance,
 * so we use phase angle RATE OF CHANGE as a proxy for "interesting" periods
 * and sample more densely where the geometry is changing.
 *
 * @param {Object} shipElements - Ship orbital elements
 * @param {Object} targetElements - Target orbital elements
 * @param {number} startJD - Julian date at computation start
 * @param {number} maxCoastDays - Maximum coast duration
 * @returns {Array<number>} Array of coast days to evaluate
 */
export function computeDepartureSchedule(shipElements, targetElements, startJD, maxCoastDays) {
    const synodicPeriod = estimateSynodicPeriod(shipElements.a, targetElements.a);

    // Fallback to uniform sampling if synodic period is unreasonable
    if (!isFinite(synodicPeriod) || synodicPeriod > 10000 || synodicPeriod < 30) {
        return uniformSchedule(maxCoastDays, SCAN_CONFIG.defaultIntervalDays);
    }

    // Scan range is capped at maxCoastDays. The default 1095 days (3 years) covers
    // at least 1.5 synodic periods for all inner planets (Venus: 584d, Mars: 780d).
    const scanRange = maxCoastDays;

    // Phase 1: Sample phase angles at regular intervals to map the landscape
    const phaseMapInterval = Math.max(10, Math.floor(synodicPeriod / 36)); // ~10-16 days
    const phaseAngles = [];
    for (let d = 0; d <= scanRange; d += phaseMapInterval) {
        const jd = startJD + d;
        const phase = computePhaseAngle(shipElements, targetElements, jd);
        phaseAngles.push({ day: d, phase });
    }

    // Phase 2: Identify regions of high phase angle rate of change.
    // These are where geometry is shifting fastest and windows open/close.
    // Also identify where phase angle crosses zero (closest approach in angle).
    const denseInterval = Math.max(10, Math.floor(synodicPeriod / 36));  // ~16 days for Venus
    const sparseInterval = Math.max(30, Math.floor(synodicPeriod / 12)); // ~49 days for Venus

    const departureDays = new Set();
    departureDays.add(0); // Always evaluate "depart now"

    for (let i = 0; i < phaseAngles.length; i++) {
        const { day, phase } = phaseAngles[i];

        // Calculate local phase rate (how fast the geometry is changing)
        let phaseRate = 0;
        if (i > 0) {
            let dPhase = phase - phaseAngles[i - 1].phase;
            // Handle wrap-around
            if (dPhase > Math.PI) dPhase -= 2 * Math.PI;
            if (dPhase < -Math.PI) dPhase += 2 * Math.PI;
            const dt = day - phaseAngles[i - 1].day;
            phaseRate = dt > 0 ? Math.abs(dPhase) / dt : 0;
        }

        // Dense sampling near phase angle zero crossings and high rate regions
        // Phase ~0 means target is roughly aligned with ship angularly
        const nearZeroCrossing = Math.abs(phase) < Math.PI / 4; // within 45°
        const highRate = phaseRate > (2 * Math.PI / synodicPeriod) * 1.5; // 1.5× average rate

        if (nearZeroCrossing || highRate) {
            // Dense: sample at fine intervals around this point
            const start = Math.max(0, day - denseInterval);
            const end = Math.min(scanRange, day + denseInterval);
            for (let d = start; d <= end; d += denseInterval) {
                departureDays.add(d);
            }
        } else {
            // Sparse: just sample at this point
            departureDays.add(day);
        }
    }

    // Ensure we don't have huge gaps: fill any gap > sparseInterval
    const sorted = [...departureDays].sort((a, b) => a - b);
    const filled = new Set(sorted);
    for (let i = 1; i < sorted.length; i++) {
        const gap = sorted[i] - sorted[i - 1];
        if (gap > sparseInterval) {
            // Fill the gap at sparse intervals
            for (let d = sorted[i - 1] + sparseInterval; d < sorted[i]; d += sparseInterval) {
                filled.add(Math.round(d));
            }
        }
    }

    return [...filled].sort((a, b) => a - b);
}

/**
 * Generate uniform departure schedule (fallback).
 */
function uniformSchedule(maxCoastDays, intervalDays) {
    const dates = [];
    for (let d = 0; d <= maxCoastDays; d += intervalDays) {
        dates.push(d);
    }
    return dates;
}

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

    // Choose flight horizons based on target distance
    const isOuterPlanet = target.elements.a > SCAN_CONFIG.outerPlanetThreshold;
    const flightHorizons = isOuterPlanet
        ? SCAN_CONFIG.outerFlightHorizons
        : SCAN_CONFIG.flightHorizons;

    // Use synodic-period-aware scheduling instead of uniform intervals.
    // Falls back to uniform if intervalDays is explicitly provided (backward compat).
    const departureDates = options.intervalDays
        ? uniformSchedule(maxCoastDays, options.intervalDays)
        : computeDepartureSchedule(ship.orbitalElements, target.elements, startJD, maxCoastDays);

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
// PHASE 1.5: ADAPTIVE REFINEMENT
// ============================================================================

/**
 * Refine scan results by filling in around promising departure dates.
 *
 * After the coarse Phase 1 scan, this function identifies dates where crossings
 * were found and adds 10-day-interval fill-in samples within ±30 days.
 * This refines window boundaries without the cost of full verification.
 *
 * @param {Array} scanResults - Results from Phase 1 scanLaunchWindows()
 * @param {Object} ship - Ship object (frozen snapshot)
 * @param {Object} target - Target body
 * @param {number} startJD - Julian date at computation start
 * @param {Array} flightHorizons - Flight horizons to test
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Array>} Combined results (original + fill-in)
 */
async function adaptiveRefinement(scanResults, ship, target, startJD, flightHorizons, onProgress = null) {
    // Identify departure dates where crossings were found (any status except NO_CROSSING)
    const promisingDates = new Set();
    const scannedDates = new Set();

    for (const result of scanResults) {
        scannedDates.add(result.coastDays);
        if (result.status !== 'NO_CROSSING' && result.status !== 'NO_INTERCEPT') {
            promisingDates.add(result.coastDays);
        }
        // Also consider near-misses as promising
        if (result.minDistance < 0.3) {
            promisingDates.add(result.coastDays);
        }
    }

    if (promisingDates.size === 0) {
        return scanResults; // Nothing to refine
    }

    // Generate fill-in dates: ±30 days around each promising date at 10-day intervals
    const fillInDates = new Set();
    const REFINE_RADIUS = 30;
    const REFINE_INTERVAL = 10;
    const MAX_FILL_INS = 30; // Cap to prevent excessive computation

    for (const date of promisingDates) {
        for (let d = date - REFINE_RADIUS; d <= date + REFINE_RADIUS; d += REFINE_INTERVAL) {
            if (d >= 0 && !scannedDates.has(d)) {
                fillInDates.add(d);
            }
        }
    }

    // Cap fill-ins
    const sortedFillIns = [...fillInDates].sort((a, b) => a - b).slice(0, MAX_FILL_INS);

    if (sortedFillIns.length === 0) {
        return scanResults;
    }

    const strategies = LAUNCH_WINDOW_STRATEGIES;
    const totalEvals = sortedFillIns.length * strategies.length * flightHorizons.length;
    let evalCount = 0;
    const newResults = [];

    for (const coastDays of sortedFillIns) {
        const departureJD = startJD + coastDays;
        let bestForDeparture = null;

        for (const horizon of flightHorizons) {
            for (const strategy of strategies) {
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
                        phase: 'refining',
                        progress: evalCount / totalEvals,
                        message: `Refining windows... (${Math.round(evalCount / totalEvals * 100)}%)`,
                    });
                    await yieldToMainThread();
                }
            }
        }

        if (bestForDeparture) {
            newResults.push(bestForDeparture);
        }
    }

    // Merge with original results
    return [...scanResults, ...newResults];
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
                progress: p.progress * 0.25,  // Phase 1 is 25% of total
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
        // PHASE 1.5: Adaptive refinement around promising dates
        // ============================================================
        onProgress?.({ phase: 'refining', progress: 0.25, message: 'Refining around promising dates...' });

        const refinedResults = await adaptiveRefinement(
            scanResults, frozenShip, target, startJD, baselineHorizons,
            (p) => onProgress?.({
                ...p,
                progress: 0.25 + p.progress * 0.1,  // Phase 1.5 is 10% of total
            })
        );

        // Check timeout
        if (Date.now() - startTimeMs > SCAN_CONFIG.verifyTimeout) {
            return {
                windows: groupIntoWindows(refinedResults, baseline?.interceptThreshold || 0.05),
                baseline,
                computeTimeMs: Date.now() - startTimeMs,
                error: 'TIMEOUT',
                errorMessage: 'Refinement complete but verification skipped (timeout)',
            };
        }

        // ============================================================
        // GROUP into windows
        // ============================================================
        const interceptThreshold = baseline?.interceptThreshold || 0.05;
        const windows = groupIntoWindows(refinedResults, interceptThreshold);

        // ============================================================
        // PHASE 2: Verify top windows
        // ============================================================
        onProgress?.({ phase: 'verifying', progress: 0.35, message: 'Verifying top windows...' });

        const verified = await verifyTopWindows(
            frozenShip, target, startJD, windows, options,
            (p) => onProgress?.({
                ...p,
                progress: 0.35 + p.progress * 0.65,  // Phase 2 is 65% of total
            })
        );

        const computeTimeMs = Date.now() - startTimeMs;

        onProgress?.({ phase: 'complete', progress: 1, message: 'Analysis complete' });

        return {
            windows: verified,
            baseline,
            computeTimeMs,
            scanResultCount: scanResults.length,
            refinedResultCount: refinedResults.length,
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
 * Used by computeDepartureSchedule() to guide departure date sampling density,
 * and available for informational display.
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

console.log('[LAUNCH_WINDOW] Module loaded - Synodic-adaptive hybrid: 45-probe grid + phase-aware scheduling + adaptive refinement');
