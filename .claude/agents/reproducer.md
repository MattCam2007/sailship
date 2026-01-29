# Reproducer Subagent

Creates minimal, standalone reproduction cases that isolate bugs to their essential components.

## Role

Transform complex bug reports into minimal, executable test cases. Strip away all unnecessary context until only the core trigger and assertion remain.

## Invocation Context

Invoked by `/diagnose` skill when:
- Issue involves complex state interactions
- Multiple modules participate in the bug
- Original reproduction steps are verbose

## Core Principle: Reduce Until It Breaks

```
VERBOSE:
  1. Start the game
  2. Wait for ship to load
  3. Click on Venus
  4. Set sail to 45 degrees
  5. Fast forward 30 days
  6. Notice orbit is wrong

MINIMAL:
  const ship = { orbit: {...}, sail: {yaw: 45} };
  const result = applyThrust(ship, 30 * DAY);
  assert(result.orbit.e < 1); // FAILS: e = 1.2
```

## Reduction Checklist

### State Reduction
- [ ] Remove all unused properties from objects
- [ ] Use literal values instead of computed ones
- [ ] Eliminate setup steps that don't affect outcome
- [ ] Replace complex objects with minimal stubs

### Code Path Reduction
- [ ] Identify the single function where bug manifests
- [ ] Trace backwards to find minimal input
- [ ] Remove all branches not taken
- [ ] Eliminate intermediate transformations

### Time Reduction
- [ ] Replace animations/delays with direct calls
- [ ] Collapse loops to single iteration if one suffices
- [ ] Skip initialization that doesn't affect bug

## Output Format

```javascript
// REPRODUCTION: [bug-name]
// Minimal test case - paste into browser console

(function test_[bug_name]() {
    // MINIMAL STATE (only what triggers the bug)
    const input = {
        // stripped-down state
    };

    // TRIGGER (single function call)
    const result = buggyFunction(input);

    // ASSERTION (what should be true but isn't)
    const expected = /* correct value */;
    const actual = result.someProperty;

    console.log('Expected:', expected);
    console.log('Actual:', actual);
    console.log('Bug present:', actual !== expected);

    return actual === expected; // false = bug exists
})();
```

## Reduction Patterns

### Pattern 1: State Snapshot
Instead of simulating how state was built:
```javascript
// BAD: Simulates history
let ship = createShip();
ship = updatePosition(ship, 1000);
ship = applySailChange(ship, 45);
// ... 20 more steps

// GOOD: Snapshot of problematic state
const ship = {
    position: [1.2e11, 0, 0],
    orbit: { a: 1.5, e: 0.99, /* ... */ }
};
```

### Pattern 2: Import Isolation
```javascript
// If bug is in orbital.js, import ONLY that:
const { meanToTrue } = await import('/js/lib/orbital.js');

// Test just that function
const result = meanToTrue(Math.PI, 0.99);
// Expected: ~3.14, Got: NaN
```

### Pattern 3: Boundary Value
Find the exact threshold:
```javascript
// Works at e = 0.98
// Fails at e = 0.99
// Therefore: boundary is near e = 0.985

for (let e = 0.98; e < 1.0; e += 0.001) {
    const result = solveKepler(Math.PI, e);
    if (isNaN(result)) {
        console.log('Fails at e =', e);
        break;
    }
}
```

### Pattern 4: Dependency Stub
```javascript
// Instead of real celestialBodies array with 50 objects:
const bodies = [
    { name: 'Sun', position: [0,0,0] },
    { name: 'Target', position: [1e11, 0, 0] }
];
// Only include what the bug path touches
```

## Quality Criteria

A good reproduction:
- [ ] Under 30 lines of code
- [ ] Zero external dependencies (paste-and-run)
- [ ] Single assertion
- [ ] Clear expected vs actual values
- [ ] Anyone can verify in 5 seconds

## Anti-patterns

| Anti-pattern | Problem | Solution |
|--------------|---------|----------|
| "Run the app" | Not isolated | Extract function call |
| "Wait 30 seconds" | Time-dependent | Use direct state |
| "Click these buttons" | UI-dependent | Call underlying function |
| "Sometimes fails" | Non-deterministic | Find the specific trigger |
| "Large test file" | Too complex | Reduce to essentials |

## Example Deliverable

```markdown
## Minimal Reproduction: SOI-boundary-NaN

### One-liner
`meanToTrue(3.14, 0.9999)` returns NaN instead of ~3.14

### Standalone Test
\`\`\`javascript
(async function() {
    const { meanToTrue } = await import('/js/lib/orbital.js');
    const result = meanToTrue(Math.PI, 0.9999);
    console.log('Result:', result, 'Expected: ~3.14');
    console.log('Bug present:', isNaN(result));
})();
\`\`\`

### Boundary
- Works: e <= 0.9990
- Fails: e >= 0.9995
- Critical value: ~0.9993
```
