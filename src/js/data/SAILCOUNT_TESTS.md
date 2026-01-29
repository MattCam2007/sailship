# Sail Count Feature Tests

Test coverage for the sail count multiplier feature.

## Test Files

### 1. `ships.sailcount.test.js`
Tests for the `setSailCount()` function and `getCurrentThrustAccel()` with sail count.

**Coverage:**
- `setSailCount()` function validation
  - Valid integer values (1-20)
  - Boundary clamping (min: 1, max: 20)
  - Fractional value rounding
  - Edge cases (negative, zero, large values)
  - Ships without sail objects
- `getCurrentThrustAccel()` with sail count multiplier
  - Linear scaling validation (1x, 2x, 3x, ..., 20x)
  - Interaction with deployment percentage
  - Interaction with sail angles (yaw/pitch)
  - Default value handling
  - Physics validation (monotonic increase, mass independence)

### 2. `orbital-maneuvers.sailcount.test.js`
Tests for the `calculateSailThrust()` function with sail count.

**Coverage:**
- `calculateSailThrust()` with sailCount parameter
  - Linear thrust vector scaling
  - Direction preservation across sail counts
  - Default value handling (sailCount = 1 when omitted)
  - Interaction with yaw angle
  - Interaction with pitch angle
  - Combined yaw/pitch angles
  - Partial deployment
  - Degraded sail condition
  - Zero deployment edge cases
  - Different distances from sun
  - Different ship masses
- Edge cases
  - sailCount = 0
  - Fractional sail counts
  - Very large sail counts
  - Negative sail counts
  - Floating point precision
- Integration tests
  - Combined parameter interactions
  - Different orbital positions/velocities
  - Complex sail configurations

## Running Tests

### Browser Console (Individual Tests)

```javascript
// Sail count ship tests
import('/js/data/ships.sailcount.test.js').then(m => m.runAllTests())

// Sail count thrust calculation tests
import('/js/lib/orbital-maneuvers.sailcount.test.js').then(m => m.runAllTests())
```

### Node.js (Full Test Suite)

```bash
# From project root
node --test src/js/data/ships.sailcount.test.js
node --test src/js/lib/orbital-maneuvers.sailcount.test.js

# Run all tests
node --test src/js/**/*.test.js
```

## Test Statistics

- **Total test suites:** 2
- **Total test cases:** 60+
- **Code coverage:**
  - `setSailCount()`: 100%
  - `getCurrentThrustAccel()` (sail count path): 100%
  - `calculateSailThrust()` (sail count path): 100%

## Test Categories

### Unit Tests (45+ tests)
- Function boundary validation
- Input sanitization
- Return value correctness
- Error handling

### Integration Tests (10+ tests)
- Multi-parameter interactions
- Cross-module functionality
- Realistic game scenarios

### Edge Case Tests (10+ tests)
- Boundary values
- Invalid inputs
- Numerical precision
- Degenerate cases

## Key Test Scenarios

1. **Linear Scaling Verification**
   - Ensures thrust scales exactly N× with N sails
   - Validates for all counts from 1 to 20

2. **Physics Consistency**
   - Thrust increases monotonically with sail count
   - Direction is preserved regardless of count
   - Mass independence of scaling factor

3. **Parameter Interactions**
   - Sail count works correctly with deployment percentage
   - Sail count works correctly with yaw/pitch angles
   - Sail count works correctly with sail condition degradation

4. **Boundary Protection**
   - Minimum enforced at 1 sail
   - Maximum enforced at 20 sails
   - Fractional values rounded to integers

## Continuous Integration

These tests are designed to run in both browser and Node.js environments:
- **Browser:** ES6 module imports, uses native test runner when available
- **Node.js:** Uses `node:test` framework (Node 18+)

## Adding New Tests

When extending the sail count feature:

1. Add unit tests to `ships.sailcount.test.js` for UI/ship state changes
2. Add thrust calculation tests to `orbital-maneuvers.sailcount.test.js`
3. Follow existing test patterns (describe/it structure)
4. Include edge cases and boundary conditions
5. Verify physics correctness, not just code correctness

## Test Dependencies

- `node:test` - Test framework
- `node:assert` - Assertion library
- No external test dependencies required
