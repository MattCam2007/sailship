# Plotter Performance Optimization Plan

**Date:** 2026-02-06
**Target Systems:** Launch Window Analyzer, Course Solver
**Core Strategy:** Web Worker parallelization of embarrassingly-parallel evaluation loops

---

## Problem Statement

Both plotters are **single-threaded** and CPU-bound. They call `evaluateCandidate()` hundreds to thousands of times in serial loops, with only `setTimeout(resolve, 0)` yielding to prevent UI freeze. No actual parallelism exists.

| System | Evaluations | Wall Time | Hot Function |
|--------|------------|-----------|--------------|
| **Launch Window** | ~8,000 | 12-18s | `evaluateCandidate()` in 3-deep nested loop |
| **Course Solver** | ~100-150 | 1-3s | `evaluateCandidate()` in Nelder-Mead + grid |

95% of CPU time is spent inside `evaluateCandidate()`, which runs a tight loop of Kepler equation solves (Newton-Raphson) and Gauss variational equation thrust applications. This function is **pure** -- it takes inputs and returns a result with no side effects. That makes it ideal for Worker offloading.

---

## Architecture: Worker Pool

### Design

```
Main Thread                          Worker Pool (N workers)
-----------                          ----------------------
                                     ┌─────────────────┐
  scanLaunchWindows()  ──batch──►    │ Worker 1         │
  or solveCourse()                   │  evaluateCandidate│
                       ──batch──►    │ Worker 2         │
                                     │  evaluateCandidate│
                       ──batch──►    │ Worker 3         │
                                     │  evaluateCandidate│
                       ──batch──►    │ Worker 4         │
                                     │  evaluateCandidate│
                                     └─────────────────┘
                       ◄──results──  (Promise.all)
```

**Worker count:** `navigator.hardwareConcurrency || 4` (typically 4-16 on modern hardware)

**Worker type:** ES Module Workers (`new Worker(url, { type: 'module' })`) -- compatible with the project's existing ES module imports, no bundler needed.

### File Structure

```
src/js/
├── workers/
│   ├── eval-worker.js          # Worker entry point (imports orbital/maneuver libs)
│   └── worker-pool.js          # Pool manager (dispatch, batching, lifecycle)
├── lib/
│   ├── course-solver.js        # Modified: dispatches to pool
│   └── launch-window.js        # Modified: dispatches to pool
```

---

## Implementation Units

### Unit 1: Evaluation Worker (`eval-worker.js`)

A module worker that imports the existing pure math functions and exposes `evaluateCandidate()` over `postMessage`.

**What it does:**
- Imports `getPosition`, `getVelocity` from `orbital.js`
- Imports `calculateSailThrust`, `applyThrust` from `orbital-maneuvers.js`
- Listens for batches of `{yawDeg, pitchDeg, ship, target, options}` messages
- Runs `evaluateCandidate()` for each item in the batch
- Posts results back

**Key detail:** `evaluateCandidate()` currently lives in `course-solver.js` alongside solver logic. The core evaluation loop (lines 335-500) needs to be **extracted** into a standalone function that both the worker and the main-thread solver can call. This avoids code duplication.

```
New file: src/js/lib/evaluate-trajectory.js
  - Contains the pure evaluateCandidate() function
  - Imported by both course-solver.js and eval-worker.js
```

**Estimated speedup:** N/A alone -- this is the building block.

---

### Unit 2: Worker Pool Manager (`worker-pool.js`)

Manages a pool of eval workers with batch dispatch and result collection.

**API:**
```javascript
import { WorkerPool } from '../workers/worker-pool.js';

const pool = new WorkerPool(navigator.hardwareConcurrency || 4);

// Dispatch a batch of evaluations, get results back
const results = await pool.evaluateBatch([
    { yawDeg: 10, pitchDeg: 0, ship, target, options },
    { yawDeg: 20, pitchDeg: 0, ship, target, options },
    // ... hundreds more
]);

pool.terminate(); // Clean up when done
```

**Internals:**
- Round-robin or shortest-queue dispatch
- Each worker gets a slice of the batch (e.g., 4 workers, 400 items = 100 each)
- Returns `Promise` that resolves when all workers report back
- Handles worker errors (restart crashed worker, retry failed batch)
- Lazy initialization: workers only spawn on first use, terminate after idle timeout

**Estimated speedup:** N/A alone -- this is infrastructure.

---

### Unit 3: Parallelize Launch Window Scanning (biggest win)

**Current bottleneck:** Triple-nested serial loop in `scanLaunchWindows()`:
```
for each departure date (30-60):        ← PARALLELIZABLE
    for each flight horizon (2-3):       ← inner loop, keep serial per-date
        for each strategy (45):          ← inner loop, keep serial per-date
            evaluateCandidate(...)       ← the expensive call
```

Each departure date is **completely independent** -- different start time, same ship/target. This is embarrassingly parallel.

**Approach:** Batch all evaluations for all departure dates, dispatch to worker pool, collect results.

```
Before (serial):
  date1: [45 strategies × 2 horizons] → wait →
  date2: [45 strategies × 2 horizons] → wait →
  ...
  date50: [45 strategies × 2 horizons] → wait

After (parallel across N workers):
  All dates batched → dispatch 4500 evals across 4-8 workers → collect
```

**Implementation:**
1. Pre-compute all `{yawDeg, pitchDeg, departureJD, horizon}` tuples upfront
2. Send entire batch to `pool.evaluateBatch()`
3. Pool splits across workers, each crunches its slice
4. Collect results, group by departure date, find best per date
5. Continue with existing `groupIntoWindows()` and `verifyTopWindows()`

**Progress reporting:** Workers post intermediate progress counts; pool aggregates and forwards to `onProgress` callback. UI still updates smoothly.

**Estimated speedup:**
- 4 cores: ~3.5x (overhead from message serialization)
- 8 cores: ~6x
- Wall time: 12-18s → **3-5s on 4 cores, 2-3s on 8 cores**

---

### Unit 4: Parallelize Course Solver Horizon Search

**Current flow:**
```
Phase 0: scoutHorizons() → top 2-3 horizons       (serial, fast: 12-24 evals)
Phase 1: For each top horizon:                      ← PARALLELIZABLE
           strategicReconnaissance() → 91 evals
           nelderMeadSearch() → 50-80 evals
           deploymentSweep() → 4 evals
Phase 2: Verify best                                (serial, fast: 1 eval)
```

The deep-search of each horizon (Phase 1) is independent -- different `maxDays`, same ship/target.

**Approach:**
1. Scout stays on main thread (fast, needs no parallelism)
2. Deep-search of top 2-3 horizons runs **simultaneously** in separate workers
3. Each worker runs the full recon → Nelder-Mead → sweep pipeline for its horizon
4. Main thread collects results, picks best, runs verification

**Challenge:** Nelder-Mead is inherently sequential (each iteration depends on the previous). We can't parallelize *within* a single Nelder-Mead run. But we parallelize *across horizons*.

**Alternative within-horizon parallelism:** The 91-point strategic reconnaissance grid IS embarrassingly parallel. Dispatch all 91 evaluations to the pool simultaneously instead of serial with yields.

**Combined approach:**
- Recon (91 evals) → batched to pool → 91/N_workers parallel
- Nelder-Mead → stays serial on dedicated worker (each iteration needs prior result)
- Multiple horizons → one worker per horizon, running concurrently

**Estimated speedup:**
- Recon phase: 91 serial evals → parallel batch → ~3x faster
- Multi-horizon: 2-3 horizons serial → concurrent → ~2x faster
- Combined: 1-3s → **0.5-1.5s**

---

### Unit 5: Parallelize Launch Window Verification

**Current flow:** `verifyTopWindows()` runs `coarseSweep()` (91 evaluations) sequentially on top 3 windows.

**After:** Dispatch all 3 windows' verification sweeps to the pool simultaneously.

```
Before: window1 (91 evals) → window2 (91 evals) → window3 (91 evals)
After:  [window1 + window2 + window3] → pool → 273 evals / N workers
```

**Estimated speedup:** 3x (three windows run concurrently instead of sequentially)

---

### Unit 6: Structured Cloning Optimization

Web Workers communicate via `postMessage`, which uses the **structured clone algorithm** to copy data. For thousands of evaluations, serialization overhead can eat into the parallelism gains.

**Mitigations:**
1. **Minimal message payloads:** Only send `{yawDeg, pitchDeg, deployment, startJD, maxDays}` per eval, plus ship/target orbital elements once per batch (shared context).
2. **Batch protocol:** Send one message with the full batch array, not one message per eval. This amortizes the serialization overhead.
3. **Result trimming:** Workers return only `{minDistance, timeToClosest, status, crossingData}` -- not the full trajectory array (which can be 6000 points × 4 floats = 96KB per eval).
4. **SharedArrayBuffer (optional, advanced):** If supported, use shared memory for results. Eliminates copy overhead entirely. Requires `Cross-Origin-Isolation` headers (COOP/COEP), which may not be worth the deployment complexity for a dev-served project.

**Expected overhead:** ~0.5ms per 100-evaluation batch (negligible vs. 300-700ms of compute).

---

## Non-Worker Optimizations (Complementary)

These can be done independently and stack with the Worker parallelization.

### A. Kepler Solver Fast Path

**Current:** Newton-Raphson for all eccentricities, 6-10 iterations.

**Optimization:** For low eccentricity (e < 0.1, which covers Earth, Venus, most ship orbits), use a truncated series expansion:

```
E ≈ M + e·sin(M) + (e²/2)·sin(2M)    // 2 terms, < 0.01° error for e < 0.1
```

This replaces 6-10 Newton-Raphson iterations (each with sin + cos) with 2 sin calls. Covers ~70% of evaluations in typical inner-planet transfers.

**Estimated speedup:** 20-30% reduction in `getPosition()` cost.

### B. Lazy Trajectory Construction

**Current:** `evaluateCandidate()` builds a full trajectory array (pushing `{x,y,z,time}` every step) even though the course solver only needs `minDistance` and crossing data.

**Optimization:** Add a `trajectoryNeeded: false` option. When false, skip the `trajectory.push()` calls and crossing detection. Just track `globalMinDistance`. This halves memory allocation and removes the crossing-detection overhead for the 90%+ of evaluations that are just searching.

Only compute crossings for the final verification pass.

**Estimated speedup:** 15-25% per evaluation (less GC pressure, fewer function calls).

### C. Reduced Step Count with Adaptive Refinement

**Current:** 3000 steps during search, 6000 for verification.

**Optimization:** Use 1500 steps for coarse search (Phase 0/1), 3000 for Nelder-Mead, 6000 for final verification. The coarse search just needs to rank candidates -- precision comes from later phases.

**Estimated speedup:** ~2x for coarse search evaluations.

### D. Launch Window Strategy Reduction

**Current:** 45 strategies per departure date (15 degree grid).

**Optimization:** Use a 2-pass approach:
1. **Coarse pass:** 13 strategies (30 degree grid) -- identifies promising departure dates
2. **Fine pass:** 45 strategies only on dates where coarse pass found near-misses

Most departure dates are geometrically unfavorable. Testing all 45 strategies on bad dates wastes ~60% of evaluations.

**Estimated speedup:** ~2x for Phase 1 scanning (reduces 4500 evals to ~2000).

---

## Combined Impact Estimate

| Optimization | Launch Window | Course Solver |
|-------------|--------------|---------------|
| **Baseline** | **12-18s** | **1-3s** |
| Worker parallelism (4 cores) | 3-5s | 0.5-1.5s |
| + Lazy trajectory | 2.5-4s | 0.4-1.2s |
| + Kepler fast path | 2-3.5s | 0.3-1s |
| + Reduced steps | 1.5-2.5s | 0.3-0.8s |
| + Strategy reduction | **1-2s** | N/A |
| **Worker parallelism (8 cores)** | **0.8-1.5s** | **0.3-0.6s** |

That's a **~10x improvement** on launch windows and **~3-5x** on the course solver with 4 cores, stacking all optimizations.

---

## Implementation Order

| Priority | Unit | Effort | Risk | Impact |
|----------|------|--------|------|--------|
| 1 | Extract `evaluateCandidate()` to standalone module | Low | Low | Prerequisite |
| 2 | Worker pool manager | Medium | Low | Infrastructure |
| 3 | Parallelize launch window scanning | Medium | Low | **Biggest win: 3-4x** |
| 4 | Lazy trajectory (skip array + crossings in search) | Low | Low | 15-25% per eval |
| 5 | Kepler fast path for low eccentricity | Low | Medium | 20-30% on getPosition |
| 6 | Parallelize course solver horizons | Medium | Medium | 2-3x on solver |
| 7 | Launch window strategy reduction (2-pass) | Medium | Medium | ~2x on scanning |
| 8 | Parallelize verification sweeps | Low | Low | 3x on verification |
| 9 | Reduced step counts (adaptive) | Low | Medium | ~2x on coarse evals |

Units 1-3 are the critical path. They deliver the majority of the speedup. Units 4-5 are low-hanging fruit that compound with the parallelism. Units 6-9 are further gains with diminishing returns.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Module Workers not supported in older browsers | Workers won't load | Feature-detect `Worker` + `type: 'module'`; fall back to current serial path |
| Structured clone overhead eats gains for small batches | <2x speedup instead of 4x | Batch evaluations (100+ per message); send shared context once |
| Numerical divergence between main thread and worker | Different results | Same code, same imports -- deterministic. Add verification step. |
| Worker crash (OOM on long trajectories) | Lost batch | Pool restarts crashed worker, retries batch with smaller chunk |
| `SharedArrayBuffer` requires COOP/COEP headers | Can't use shared memory | Don't depend on it. Regular `postMessage` is sufficient for this workload. |
| Course solver Nelder-Mead can't be parallelized internally | Limited solver speedup | Parallelize across horizons instead; batch the recon grid phase |

---

## Browser Compatibility

Module Workers (`new Worker(url, { type: 'module' })`) are supported in:
- Chrome 80+ (Jan 2020)
- Edge 80+
- Firefox 114+ (Jun 2023)
- Safari 15+ (Sep 2021)

This covers 95%+ of current browsers. The fallback is the existing serial path, so there's no regression for unsupported browsers.

---

## Summary

The plotters are slow because they run thousands of independent trajectory evaluations in serial on the main thread. The core evaluation function is pure and stateless -- a textbook case for Web Worker parallelization.

**Phase 1 (Worker Pool + Launch Window):** Extract evaluation function, build worker pool, parallelize launch window scanning. Expected result: **12-18s → 3-5s** on 4 cores.

**Phase 2 (Algorithmic):** Lazy trajectory, Kepler fast path, strategy reduction. Expected result: **3-5s → 1-2s** on 4 cores.

**Phase 3 (Course Solver):** Parallelize horizon search, batch recon grids. Expected result: **1-3s → 0.3-0.8s** on 4 cores.

No quantum computer needed -- just regular parallel processing that's been available in browsers since 2020.
