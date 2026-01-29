# /diagnose [issue]

Reproduce, isolate, and create a quantifiable test case for a bug or issue.

## Purpose

The diagnose skill takes a reported issue and reduces it to a minimal, reproducible test case with measurable pass/fail criteria. This enables verification that fixes actually work.

## Invocation

```
/diagnose [issue-description]
/diagnose [issue-id]
```

**Examples:**
- `/diagnose orbit-calculation-drift`
- `/diagnose ship-disappears-at-soi-boundary`
- `/diagnose trajectory-shows-nan`

## Process

### Step 1: Understand the Issue
- Parse the issue description
- Identify the symptom (what goes wrong?)
- Identify the trigger (when does it happen?)
- Categorize: logic error, edge case, state corruption, calculation error

### Step 2: Locate the Problem Domain
- Identify which modules are involved
- Map the code path from trigger to symptom
- Note key functions and state variables

### Step 3: Create Reproduction Steps

**Reduce to minimal inputs:**
```javascript
// Example: Function-level reproduction
const input = { /* minimal state that triggers bug */ };
const result = functionUnderTest(input);
// Expected: X, Actual: Y
```

**For UI issues, reduce to state + function:**
```javascript
// Instead of "click button X, then Y happens"
// Reduce to the underlying state change:
state.someValue = triggerValue;
updateFunction(state);
// Assert: expected state vs actual
```

### Step 4: Define Quantifiable Criteria

**Every diagnosis MUST include measurable assertions:**

| Assertion Type | Example | Pass Condition |
|----------------|---------|----------------|
| Value equality | `result === expected` | Exact match |
| Range check | `value > 0 && value < 1` | Within bounds |
| Type check | `typeof result !== 'undefined'` | Not undefined/NaN |
| State check | `ship.orbit.e < 1` | Valid orbital state |
| No-throw | `() => fn()` doesn't throw | No exception |
| Console clean | No error logs | Zero errors |

### Step 5: Create Standalone Test

Output a test that can be run in browser console:

```javascript
// Diagnostic test for: [issue-name]
// Run: copy-paste into browser console

(async function diagnose_[issue_name]() {
    const tests = [];

    // Setup: minimal state reproduction
    const state = { /* ... */ };

    // Test 1: [what we're checking]
    const result1 = someFunction(state);
    tests.push({
        name: 'description of check',
        pass: result1 === expectedValue,
        expected: expectedValue,
        actual: result1
    });

    // Test 2: [another check]
    // ...

    // Report
    console.log('=== DIAGNOSIS: [issue-name] ===');
    tests.forEach(t => {
        const status = t.pass ? 'PASS' : 'FAIL';
        console.log(`[${status}] ${t.name}`);
        if (!t.pass) {
            console.log(`  Expected: ${t.expected}`);
            console.log(`  Actual: ${t.actual}`);
        }
    });

    const passed = tests.filter(t => t.pass).length;
    console.log(`\nResult: ${passed}/${tests.length} checks passing`);

    return tests.every(t => t.pass);
})();
```

### Step 6: Generate Diagnosis Report

Output findings to reports directory.

## Output

**Deliverable:** Diagnosis Report with embedded test

**Location:** `reports/[issue]-diagnosis-[DATE].md`

### Template

```markdown
# [Issue] Diagnosis

**Date:** YYYY-MM-DD
**Status:** Reproduced | Cannot Reproduce | Partial

## Symptom
[What the user observes]

## Root Cause
[Identified cause, or hypotheses if uncertain]

## Reproduction

### Minimal Trigger
[Code snippet that triggers the bug]

### Affected Code Path
1. `file.js:function()` - description
2. `file.js:function()` - where bug manifests

## Quantifiable Test

\`\`\`javascript
// Paste this into browser console to verify bug exists
// After fix, same test should pass

[standalone diagnostic test code]
\`\`\`

### Pass Criteria
| Check | Current | Expected | Status |
|-------|---------|----------|--------|
| Check 1 | value | value | FAIL |
| Check 2 | value | value | FAIL |

## Recommended Fix
[Brief description of fix approach]

## Files to Modify
- `path/to/file.js` - description of change
```

## Key Principle: Reduce to Assertions

**Never diagnose with:**
- "It looks wrong" (not measurable)
- "The UI shows..." (requires visual inspection)
- "Sometimes it..." (not reproducible)

**Always diagnose with:**
- `value === expected` (measurable)
- `typeof x !== 'undefined'` (testable)
- `array.length === N` (quantifiable)
- `error.message.includes('X')` (searchable)

## Subagent Dispatch

Invoke the `reproducer` agent to help create minimal test cases when:
- The issue involves complex state
- Multiple modules interact
- Timing/sequence matters

## Tools Used

- **Grep** - Find related code
- **Read** - Examine implementations
- **Task (reproducer)** - Create minimal reproductions
- **Write** - Output diagnosis report

## Quality Criteria

A successful diagnosis:
- [ ] Issue is reproducible with provided code
- [ ] Pass/fail is measurable (no visual inspection needed)
- [ ] Test can run in browser console standalone
- [ ] Root cause is identified or hypotheses listed
- [ ] Fix approach is clear

## Integration

- **Follows:** Bug report or issue identification
- **Precedes:** `/fix [issue]` or `/planning [issue]`
- **Invokes:** reproducer subagent
- **Outputs:** Diagnosis report with embedded test
