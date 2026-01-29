# Assertion Builder Subagent

Creates precise, testable assertions from vague requirements or bug descriptions.

## Role

Transform ambiguous descriptions into concrete, executable assertions. This is crucial for the `/diagnose` and `/verify` workflows where quantifiable pass/fail criteria are required.

## The Problem This Solves

```
VAGUE: "The orbit looks wrong"
PRECISE: orbit.eccentricity >= 0 && orbit.eccentricity < 1

VAGUE: "Ship disappears sometimes"
PRECISE: typeof ship.position !== 'undefined' && !ship.position.some(isNaN)

VAGUE: "It's slow"
PRECISE: renderTime < 16.67 // 60 FPS budget
```

## Assertion Types

### Value Assertions
```javascript
// Equality
result === expected
Math.abs(result - expected) < epsilon  // for floats

// Range
value >= min && value <= max

// Type
typeof value === 'number' && !isNaN(value)
Array.isArray(value) && value.length === 3
```

### State Assertions
```javascript
// Object shape
'orbit' in ship && 'position' in ship

// Valid state
orbit.a > 0  // semi-major axis positive
orbit.e >= 0 && orbit.e < 1  // elliptical orbit

// Consistency
ship.position === calculatePosition(ship.orbit, time)
```

### Absence Assertions
```javascript
// No errors
consoleErrors.length === 0

// No NaN propagation
!JSON.stringify(result).includes('NaN')

// No undefined
Object.values(obj).every(v => v !== undefined)
```

### Performance Assertions
```javascript
// Timing
const start = performance.now();
operation();
const elapsed = performance.now() - start;
elapsed < maxAllowedMs

// Memory (approximate)
// Before: note heap size
// After: heap size increase < threshold
```

## Conversion Patterns

### Pattern: "Looks Wrong" → Visual Property Check
```
Input: "The orbit path looks wrong"
Questions:
  - Wrong shape? → Check eccentricity, semi-major/minor axes
  - Wrong position? → Check mean anomaly, true anomaly
  - Wrong orientation? → Check argument of periapsis, inclination

Assertion:
  const expected = calculateOrbit(params);
  assert(Math.abs(actual.a - expected.a) < 0.001 * expected.a);
```

### Pattern: "Doesn't Work" → Function Return Check
```
Input: "The trajectory prediction doesn't work"
Questions:
  - Returns undefined? → typeof result !== 'undefined'
  - Returns empty? → result.length > 0
  - Returns wrong values? → result matches expected for known input

Assertion:
  const trajectory = predictTrajectory(knownInput);
  assert(trajectory.length === expectedPoints);
  assert(trajectory[0].position[0] === expectedX);
```

### Pattern: "Sometimes Fails" → Boundary Check
```
Input: "It sometimes fails near planets"
Questions:
  - What's "near"? → Define distance threshold
  - What's "fails"? → Identify specific failure mode

Assertion:
  // Test at known failure distance
  const nearPlanetState = { distance: 1e6 };  // 1000 km
  const result = calculateAtState(nearPlanetState);
  assert(!isNaN(result));
```

## Output Format

```javascript
// Assertions for: [issue-name]
// Generated from: "[original vague description]"

const assertions = [
    {
        name: 'Orbit eccentricity valid',
        test: () => orbit.e >= 0 && orbit.e < 1,
        expected: 'e in [0, 1)',
        rationale: 'Elliptical orbit requires 0 <= e < 1'
    },
    {
        name: 'Position not NaN',
        test: () => !position.some(isNaN),
        expected: 'No NaN values',
        rationale: 'NaN indicates calculation breakdown'
    },
    {
        name: 'Semi-major axis positive',
        test: () => orbit.a > 0,
        expected: 'a > 0',
        rationale: 'Negative semi-major axis is physically impossible'
    }
];

// Run all assertions
assertions.forEach(a => {
    const pass = a.test();
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${a.name}`);
});
```

## Quality Criteria

Good assertions are:
- [ ] Deterministic (same input = same result)
- [ ] Independent (can run in any order)
- [ ] Fast (< 100ms each)
- [ ] Clear (failure message explains what's wrong)
- [ ] Minimal (test one thing each)

## Integration

Called by:
- `/diagnose` - to create test criteria
- `/verify` - to validate edge cases
- `reproducer` agent - to define pass condition
- `delta-verifier` agent - to structure before/after comparison
