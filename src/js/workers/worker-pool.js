/**
 * Worker Pool - Manages a pool of evaluation Web Workers
 *
 * Provides batch dispatch of evaluateCandidate() calls across multiple
 * workers for parallel trajectory evaluation.
 *
 * Usage:
 *   const pool = new WorkerPool(4);
 *   const results = await pool.evaluateBatch(items, { ship, target });
 *   pool.terminate();
 *
 * Falls back to main-thread serial execution when:
 *   - workerCount <= 1
 *   - Module Workers not supported
 *   - Worker initialization fails
 */

import { evaluateCandidate } from '../lib/evaluate-trajectory.js';

/**
 * Detect whether the browser supports module workers.
 * Caches the result after the first check.
 */
let moduleWorkerSupported = null;
function supportsModuleWorkers() {
    if (moduleWorkerSupported !== null) return moduleWorkerSupported;
    try {
        // Feature-detect by checking if Worker accepts type option
        // We can't fully test without actually creating one, so we check
        // for the basic Worker constructor and assume module support in
        // modern browsers (Chrome 80+, Firefox 114+, Safari 15+)
        moduleWorkerSupported = typeof Worker !== 'undefined';
    } catch {
        moduleWorkerSupported = false;
    }
    return moduleWorkerSupported;
}

/**
 * Resolve the worker script URL relative to the current page.
 * Handles both localhost (cd src && python -m http.server) and GitHub Pages.
 */
function getWorkerUrl() {
    const base = window.location.hostname.includes('github.io') ? '/src' : '';
    return `${base}/js/workers/eval-worker.js`;
}

export class WorkerPool {
    /**
     * @param {number} workerCount - Number of workers (1 = serial fallback)
     */
    constructor(workerCount = 4) {
        this.requestedCount = Math.max(1, workerCount);
        this.workers = [];
        this.readyWorkers = new Set();
        this.pendingCallbacks = new Map();
        this.nextId = 0;
        this.initialized = false;
        this.initFailed = false;
    }

    /**
     * Lazily initialize workers on first use.
     * Returns true if workers are available, false for serial fallback.
     */
    async _ensureInitialized() {
        if (this.initialized) return !this.initFailed;
        if (this.initFailed) return false;
        if (this.requestedCount <= 1) {
            this.initialized = true;
            this.initFailed = true; // Use serial path
            return false;
        }
        if (!supportsModuleWorkers()) {
            console.warn('[WORKER_POOL] Module workers not supported, using serial fallback');
            this.initialized = true;
            this.initFailed = true;
            return false;
        }

        const workerUrl = getWorkerUrl();

        try {
            const readyPromises = [];

            for (let i = 0; i < this.requestedCount; i++) {
                const worker = new Worker(workerUrl, { type: 'module' });

                const readyPromise = new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        reject(new Error('Worker init timeout'));
                    }, 5000);

                    const onMessage = (e) => {
                        if (e.data.type === 'ready') {
                            clearTimeout(timeout);
                            worker.removeEventListener('message', onMessage);
                            // Install the permanent message handler
                            worker.addEventListener('message', (evt) => this._onWorkerMessage(i, evt));
                            this.readyWorkers.add(i);
                            resolve();
                        }
                    };

                    worker.addEventListener('message', onMessage);
                    worker.addEventListener('error', (err) => {
                        clearTimeout(timeout);
                        reject(err);
                    });
                });

                this.workers.push(worker);
                readyPromises.push(readyPromise);
            }

            await Promise.all(readyPromises);
            this.initialized = true;
            console.log(`[WORKER_POOL] Initialized ${this.workers.length} workers`);
            return true;

        } catch (error) {
            console.warn('[WORKER_POOL] Failed to initialize workers, using serial fallback:', error.message);
            // Clean up any partially created workers
            for (const w of this.workers) {
                try { w.terminate(); } catch {}
            }
            this.workers = [];
            this.readyWorkers.clear();
            this.initialized = true;
            this.initFailed = true;
            return false;
        }
    }

    /**
     * Handle messages from workers.
     */
    _onWorkerMessage(workerIndex, event) {
        const { type, id, results } = event.data;

        if (type === 'results') {
            const callback = this.pendingCallbacks.get(id);
            if (callback) {
                this.pendingCallbacks.delete(id);
                callback(results);
            }
        }
    }

    /**
     * Send a batch to a single worker and return a promise for its results.
     */
    _sendToWorker(workerIndex, items, context) {
        return new Promise((resolve) => {
            const id = this.nextId++;
            this.pendingCallbacks.set(id, resolve);
            this.workers[workerIndex].postMessage({
                type: 'batch',
                id,
                items,
                context
            });
        });
    }

    /**
     * Evaluate a batch of candidates across the worker pool.
     *
     * Each item: { yawDeg, pitchDeg, options: { startJulianDate, maxDays, deployment, steps } }
     * Context: { ship, target } (shared across all items in the batch)
     *
     * Returns results in the same order as input items.
     *
     * @param {Array} items - Evaluation parameters per candidate
     * @param {Object} context - Shared ship/target data
     * @returns {Promise<Array>} Results array matching input order
     */
    async evaluateBatch(items, context) {
        if (items.length === 0) return [];

        const useWorkers = await this._ensureInitialized();

        if (!useWorkers) {
            // Serial fallback on main thread
            return this._evaluateSerial(items, context);
        }

        const workerCount = this.workers.length;
        const chunkSize = Math.ceil(items.length / workerCount);
        const promises = [];
        const chunkMap = []; // Track which chunk goes to which worker

        for (let w = 0; w < workerCount; w++) {
            const start = w * chunkSize;
            if (start >= items.length) break;
            const end = Math.min(start + chunkSize, items.length);
            const chunk = items.slice(start, end);

            chunkMap.push({ start, end });
            promises.push(this._sendToWorker(w, chunk, context));
        }

        const chunkResults = await Promise.all(promises);

        // Reassemble in original order
        const results = new Array(items.length);
        for (let c = 0; c < chunkResults.length; c++) {
            const { start } = chunkMap[c];
            const chunk = chunkResults[c];
            for (let i = 0; i < chunk.length; i++) {
                results[start + i] = chunk[i];
            }
        }

        return results;
    }

    /**
     * Serial fallback - runs evaluateCandidate on the main thread.
     */
    _evaluateSerial(items, context) {
        const { ship, target } = context;
        const results = new Array(items.length);

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            results[i] = evaluateCandidate(
                item.yawDeg,
                item.pitchDeg,
                ship,
                target,
                item.options
            );
        }

        return results;
    }

    /**
     * Terminate all workers and clean up.
     */
    terminate() {
        for (const worker of this.workers) {
            try { worker.terminate(); } catch {}
        }
        this.workers = [];
        this.readyWorkers.clear();
        this.pendingCallbacks.clear();
        this.initialized = false;
        this.initFailed = false;
    }

    /**
     * Get the effective number of parallel workers.
     * Returns 1 if using serial fallback.
     */
    get effectiveWorkerCount() {
        if (this.initFailed || !this.initialized) return 1;
        return this.workers.length || 1;
    }
}
