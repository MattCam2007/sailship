/**
 * Trajectory Evaluation Web Worker
 *
 * Runs evaluateCandidate() in a separate thread for parallel computation.
 * Used by both the course solver (recon grid) and launch window analyzer
 * (departure scanning).
 *
 * Protocol:
 *   Main → Worker: { type: 'batch', id, items: [{yawDeg, pitchDeg, options}], context: {ship, target} }
 *   Worker → Main: { type: 'results', id, results: [...] }
 *   Worker → Main: { type: 'ready' }
 */

import { evaluateCandidate } from '../lib/evaluate-trajectory.js';

// Signal readiness
self.postMessage({ type: 'ready' });

self.onmessage = function(e) {
    const { type, id, items, context } = e.data;

    if (type === 'batch') {
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

        self.postMessage({ type: 'results', id, results });
    }
};
