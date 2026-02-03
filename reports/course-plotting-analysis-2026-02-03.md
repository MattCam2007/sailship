# Automatic Course Plotting: Multi-Perspective Analysis

**Date:** 2026-02-03
**Problem:** Calculate optimal sail settings to intercept a target planet
**Status:** Design Discussion

---

## The Core Problem

You have:
- **Ship** at position A with known orbital elements
- **Target** (e.g., Venus) on a known Keplerian orbit
- **Control variables**: yaw (-90° to 90°), pitch (-90° to 90°), deployment (0-100%)
- **Trajectory predictor** that shows where you'll go with current settings
- **Intersection detector** that finds orbital crossings

You want:
- Sail settings that make your purple line **intercept** the target when it arrives

This is the **inverse problem**: instead of "given controls, where do I go?" you need "given destination, what controls?"

---

## Panel Discussion

### 1. PHYSICS/MATH PERSPECTIVE (Orbital Mechanics Expert)

**The Fundamental Challenge:**

Solar sails create *continuous low thrust* (~0.5 mm/s²). This is fundamentally different from chemical rockets that provide impulsive Δv. The math is harder because:

1. **No closed-form solution exists** for optimal continuous-thrust transfers
2. **The trajectory is a spiral**, not a conic section
3. **Thrust direction changes** as your position relative to the Sun changes
4. **You can't "point at" the target** - thrust is always related to Sun direction

**Key Insight - What Actually Matters:**

For planetary intercepts with solar sails, you're really solving for:

```
Find (yaw, pitch, deployment, duration) such that:
  ||ship_position(t_intercept) - planet_position(t_intercept)|| < threshold
```

The yaw angle primarily controls **orbital energy**:
- Positive yaw (0° to 60°): Adds energy, raises orbit, ship moves slower
- Negative yaw (-60° to 0°): Removes energy, lowers orbit, ship moves faster
- At yaw = 35°, thrust is optimally split between radial and tangential

The pitch angle controls **orbital plane**:
- Changes inclination for out-of-plane targets
- Usually 0° for in-ecliptic transfers

**Mathematical Reality Check:**

The search space is manageable:
- Yaw: ~120 meaningful values (-60° to +60° in 1° steps)
- Pitch: ~60 meaningful values (-30° to +30°, most targets near ecliptic)
- Deployment: 100% for fastest transfer (no reason to reduce)
- That's ~7,200 combinations to test

Each trajectory prediction takes ~5-15ms. Full sweep: 36-108 seconds.
With smart pruning: 1-5 seconds is achievable.

**Verdict:** Brute force is viable. Optimization is better.

---

### 2. ARCHITECTURE PERSPECTIVE (Software Architect)

**Current System Analysis:**

The existing code is well-structured for this feature:

```
trajectory-predictor.js  →  "What happens if I use these settings?"
intersectionDetector.js  →  "When/where do I cross this orbit?"
navigation.js            →  Already tests 10 discrete strategies
```

**Design Principles:**

1. **Separation of Concerns**
   - Solver: computes optimal settings (pure math, no UI)
   - Controller: applies settings over time (autopilot integration)
   - Display: shows computed course (UI layer)

2. **Incremental Computation**
   - Don't recompute everything when target changes
   - Cache intermediate trajectory results
   - Use existing trajectory cache infrastructure

3. **Non-Blocking Execution**
   - Heavy computation must not freeze the game
   - Use requestIdleCallback or Web Workers
   - Show "Computing..." indicator during search

**Recommended Module Structure:**

```
src/js/lib/
├── course-solver.js      # Core algorithm: (ship, target) → settings
├── course-optimizer.js   # Gradient descent / search strategies
└── course-planner.js     # High-level API, manages computation

src/js/core/
└── navigation.js         # Add: applyCourse(), courseState
```

**Integration Points:**
- `navigation.js:computeNavigationPlan()` - extend or replace
- `gameState.js:autoPilotState` - add computed course
- `controls.js` - add "PLOT COURSE" button
- `uiUpdater.js` - display ETA, course quality

**Verdict:** Clean integration path exists. Modular design enables iteration.

---

### 3. GAME UX PERSPECTIVE (Game Designer)

**Player Experience Goals:**

1. **Reduce Frustration**: Manual sail adjustment is tedious
2. **Maintain Agency**: Player should feel in control, not passive
3. **Teach Orbital Mechanics**: Help players understand *why* the solution works
4. **Provide Feedback**: Show progress toward intercept

**UX Anti-Patterns to Avoid:**

- "Magic autopilot" that just works (boring, no learning)
- "Optimal solution" that player can't understand
- Long computation delays with no feedback
- Solutions that take 5 years of game time

**Recommended UX Flow:**

```
1. Player selects destination (existing NAV panel)
2. Player clicks "PLOT COURSE" button
3. System shows: "Computing intercept..." (1-3 sec)
4. System displays:
   - Recommended sail settings
   - Predicted arrival time
   - Course quality (OPTIMAL / GOOD / MARGINAL / NO SOLUTION)
5. Player can:
   - "APPLY" - autopilot uses computed settings
   - "PREVIEW" - show trajectory without applying
   - "REFINE" - run longer computation for better solution
   - "MANUAL" - ignore and adjust manually
```

**Visual Feedback During Flight:**

- Show target marker on predicted trajectory crossing
- Display countdown to intercept
- Show "OFF COURSE" warning if deviation detected
- Allow mid-course corrections

**Difficulty Progression:**

- Easy targets (Mars, Venus): Usually have solutions
- Hard targets (Mercury, outer planets): May require patience
- Moons: Require two-phase planning (approach planet, then capture)

**Verdict:** "Assisted manual" is better than "full auto". Show the math, let player decide.

---

### 4. JAVASCRIPT IMPLEMENTATION PERSPECTIVE (JS Expert)

**Performance Constraints:**

- 60 FPS = 16.67ms per frame budget
- Trajectory prediction: 5-15ms per call
- Full parameter sweep: 5,000-10,000 predictions
- Cannot block main thread for >100ms

**Recommended Implementation Patterns:**

**Pattern A: Chunked Computation**
```javascript
async function* sweepParameters(ship, target) {
  for (let yaw = -60; yaw <= 60; yaw += 5) {
    for (let pitch = -30; pitch <= 30; pitch += 5) {
      const result = evaluateSettings(ship, target, yaw, pitch);
      yield result;
      await new Promise(r => setTimeout(r, 0)); // Yield to main thread
    }
  }
}
```

**Pattern B: Web Worker**
```javascript
// course-solver.worker.js
self.onmessage = ({ data: { ship, target, options } }) => {
  const solution = solveCourse(ship, target, options);
  self.postMessage(solution);
};
```

**Pattern C: Iterative Refinement**
```javascript
function solveCourseIteratively(ship, target, callback) {
  // Coarse pass: 10° steps, find approximate solution
  // Fine pass: 1° steps around best coarse result
  // Ultra pass: 0.1° steps for final refinement
}
```

**Data Structures:**

```javascript
// Course solution
const courseSolution = {
  valid: true,
  settings: { yaw: 32.5, pitch: 0, deployment: 100 },
  prediction: {
    interceptTime: 180,        // days
    closestApproach: 0.001,    // AU
    crossingPosition: {x, y, z},
    confidence: 0.95
  },
  searchMetrics: {
    candidatesEvaluated: 1440,
    computeTimeMs: 2340,
    convergenceIterations: 3
  }
};
```

**Caching Strategy:**

- Cache trajectory results by (orbital_elements_hash, sail_settings_hash)
- Invalidate when ship orbit changes significantly
- Pre-compute for common destinations (Venus, Mars)

**Verdict:** Web Worker for heavy lifting, iterative refinement for responsiveness.

---

## Five Course-Plotting Options

### OPTION 1: Parametric Grid Search (Brute Force)

**Algorithm:**
```
FOR yaw FROM -60° TO 60° STEP 5°:
  FOR pitch FROM -30° TO 30° STEP 5°:
    trajectory = predictTrajectory(ship, yaw, pitch, 100%)
    crossing = findTargetCrossing(trajectory, target)
    IF crossing.distance < best.distance:
      best = {yaw, pitch, crossing}
RETURN best
```

**Pros:**
- Simple to implement (~100 lines)
- Guaranteed to find global optimum within step resolution
- Easy to parallelize
- No convergence issues

**Cons:**
- Slow: ~7,200 evaluations at 5° resolution = 36-108 seconds
- Resolution tradeoff: finer grid = slower computation
- Wastes time evaluating obviously bad combinations

**Implementation Effort:** Low (1-2 days)

**Best For:** Prototype, fallback when optimization fails

---

### OPTION 2: Gradient Descent Optimization

**Algorithm:**
```
current = initialGuess(ship, target)  // e.g., phase-angle heuristic
FOR iteration FROM 1 TO maxIterations:
  gradient = estimateGradient(current, target)
  current = current - learningRate * gradient
  IF converged(current):
    BREAK
RETURN current
```

**Gradient Estimation (Finite Differences):**
```
∂loss/∂yaw ≈ (loss(yaw+ε) - loss(yaw-ε)) / (2ε)
```

**Loss Function:**
```
loss = w1 * missDistance + w2 * transferTime + w3 * (1 - confidence)
```

**Pros:**
- Fast convergence: typically 10-30 iterations
- Can reach arbitrary precision
- Handles continuous parameter space

**Cons:**
- May converge to local minima (multiple "good enough" solutions exist)
- Requires careful tuning (learning rate, convergence criteria)
- Gradient estimation needs 6 trajectory evaluations per iteration

**Implementation Effort:** Medium (3-5 days)

**Best For:** Real-time course updates, responsive UI

---

### OPTION 3: Hybrid Coarse-to-Fine Search

**Algorithm:**
```
// Phase 1: Coarse sweep (10° steps)
coarseResults = gridSearch(ship, target, step=10°)
topCandidates = coarseResults.sortByQuality().slice(0, 5)

// Phase 2: Fine search around best candidates
FOR candidate IN topCandidates:
  refined = localSearch(candidate, step=1°, radius=15°)
  IF refined.quality > best.quality:
    best = refined

// Phase 3: Ultra-fine polish
final = gradientDescent(best, tolerance=0.1°)
RETURN final
```

**Pros:**
- Best of both worlds: global search + local refinement
- Predictable performance: ~500 evaluations typical
- Handles multiple local optima (tests top 5)
- Progressive: can return early with "good enough" solution

**Cons:**
- More complex implementation
- May miss optimal if it's narrow and between coarse grid points
- Three-phase logic adds complexity

**Implementation Effort:** Medium-High (4-6 days)

**Best For:** Production quality, balance of speed and accuracy

---

### OPTION 4: Phase-Angle Heuristics + Targeting

**Algorithm:**
```
// Step 1: Compute phase angle
φ = currentPhaseAngle(ship, target)
φ_optimal = hohmannPhaseAngle(ship.orbit, target.orbit)

// Step 2: Choose strategy based on phase
IF φ < φ_optimal:
  strategy = "RAISE_ORBIT"  // Go slower, let target catch up
ELSE:
  strategy = "LOWER_ORBIT"  // Go faster, catch up to target

// Step 3: Compute yaw angle for strategy
yaw = strategyToYaw(strategy, ship.orbit)

// Step 4: Verify with trajectory prediction
trajectory = predictTrajectory(ship, yaw, 0, 100%)
crossing = findTargetCrossing(trajectory, target)

// Step 5: Fine-tune if needed
WHILE crossing.distance > threshold:
  yaw = adjustYaw(yaw, crossing)
  // Recalculate
```

**Pros:**
- Physics-intuitive: uses orbital mechanics principles
- Fast: O(10) trajectory evaluations typical
- Educational: helps players understand "why"
- Works well for Hohmann-like transfers

**Cons:**
- Limited to near-circular, near-coplanar orbits
- May not find solutions for complex geometries
- Heuristics can fail for edge cases (high eccentricity, inclination)

**Implementation Effort:** Medium (3-4 days)

**Best For:** Default suggestion, teaching tool

---

### OPTION 5: Multi-Objective Evolutionary Algorithm (MOEA)

**Algorithm:**
```
population = randomPopulation(100)
FOR generation FROM 1 TO 50:
  fitness = evaluateAll(population, target)
  parents = tournamentSelection(population, fitness)
  offspring = crossover(parents) + mutation(parents)
  population = elitism(population, offspring)
RETURN paretoFront(population)
```

**Multiple Objectives:**
1. Minimize miss distance
2. Minimize transfer time
3. Minimize sail adjustments (for multi-phase plans)

**Pros:**
- Handles complex, multi-phase trajectories
- Returns Pareto front: player chooses fast vs. efficient
- No local minima issues (genetic diversity)
- Can optimize for non-differentiable objectives

**Cons:**
- Slow: 50 generations × 100 population = 5,000 evaluations
- Stochastic: different runs give different results
- Complex implementation
- Overkill for simple point-to-point transfers

**Implementation Effort:** High (1-2 weeks)

**Best For:** Advanced mode, multi-leg missions, research

---

## Comparison Matrix

| Criterion | Grid Search | Gradient | Hybrid | Heuristic | Evolutionary |
|-----------|-------------|----------|--------|-----------|--------------|
| **Speed** | Slow | Fast | Medium | Very Fast | Slow |
| **Accuracy** | Grid-limited | High | Very High | Medium | High |
| **Robustness** | Excellent | Local minima | Good | Limited cases | Excellent |
| **Complexity** | Low | Medium | Medium-High | Medium | High |
| **Player Understanding** | No insight | No insight | No insight | Educational | No insight |
| **Implementation Time** | 1-2 days | 3-5 days | 4-6 days | 3-4 days | 1-2 weeks |

---

## Recommendations

### Immediate Implementation (MVP)
**Option 4 (Heuristics) + Option 1 (Grid Search fallback)**

- Start with phase-angle heuristic for instant suggestion
- If no solution found, fall back to coarse grid search
- Display result with "Computing better solution..." while refining

### Production Quality
**Option 3 (Hybrid Coarse-to-Fine)**

- Best balance of speed, accuracy, and reliability
- Can be implemented incrementally
- Web Worker for non-blocking execution

### Full Feature Set
**Option 3 + Option 4**

- Heuristic for instant preview
- Hybrid for verified solution
- Let player see both: "Quick estimate: 180 days, Computed: 176 days"

---

## Implementation Roadmap

```
Week 1: Core Solver
├─ Day 1-2: Basic grid search (Option 1)
├─ Day 3-4: Phase-angle heuristics (Option 4)
└─ Day 5: Combine into courseSolver.js

Week 2: Optimization & Integration
├─ Day 1-2: Hybrid coarse-to-fine (Option 3)
├─ Day 3: Web Worker wrapper
├─ Day 4: UI integration (PLOT COURSE button)
└─ Day 5: Testing & refinement

Week 3: Polish
├─ Day 1-2: Visual feedback (trajectory preview, ETA)
├─ Day 3: Edge case handling (no solution, multiple solutions)
└─ Day 4-5: Player testing & iteration
```

---

## Conclusion

**The good news:** This is a solvable problem with existing code infrastructure.

**The math news:** No closed-form solution exists for low-thrust trajectories, but numerical search is tractable (~7,000 combinations).

**The UX news:** "Assisted manual" beats "full auto" - show the computed solution but let the player apply it.

**Recommended approach:** Start with Option 4 (heuristics) for instant feedback, backed by Option 3 (hybrid search) for accuracy. This gives players both immediate guidance and verified solutions.

The pieces are all there. The purple line just needs a brain to move it.
