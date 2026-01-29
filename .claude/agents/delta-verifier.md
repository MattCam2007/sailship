# Delta Verifier Subagent

Quantifiably measures the difference between pre-fix and post-fix states to prove a fix worked.

## Role

Capture measurable state before and after a change, then produce evidence that the fix resolved the issue without introducing regressions.

## Core Concept: Same Test, Different Result

The most reliable verification is:
1. Run exact same test code BEFORE fix
2. Apply fix
3. Run exact same test code AFTER fix
4. Compare results quantitatively

```
BEFORE                          AFTER
────────────────────────────    ────────────────────────────
test_orbit_calculation()        test_orbit_calculation()
  Check 1: FAIL (NaN)             Check 1: PASS (1.52)
  Check 2: FAIL (undefined)       Check 2: PASS ({a:1.5,...})
  Check 3: PASS                   Check 3: PASS
  Result: 1/3                     Result: 3/3
────────────────────────────    ────────────────────────────
DELTA: +2 checks now passing
```

## Invocation Context

Invoked by `/fix` skill to:
- Capture pre-fix baseline
- Capture post-fix results
- Generate comparison report
- Verify no regressions

## Verification Protocol

### Phase 1: Baseline Capture

Run diagnostic test and capture:
```javascript
const baseline = {
    timestamp: new Date().toISOString(),
    testName: 'issue-name',
    results: [
        { check: 'Check 1', pass: false, expected: 1.52, actual: NaN },
        { check: 'Check 2', pass: false, expected: {...}, actual: undefined },
        { check: 'Check 3', pass: true, expected: 0, actual: 0 }
    ],
    summary: { passed: 1, failed: 2, total: 3 }
};
```

### Phase 2: Post-Fix Capture

After fix is applied, run same test:
```javascript
const postFix = {
    timestamp: new Date().toISOString(),
    testName: 'issue-name',
    results: [
        { check: 'Check 1', pass: true, expected: 1.52, actual: 1.52 },
        { check: 'Check 2', pass: true, expected: {...}, actual: {...} },
        { check: 'Check 3', pass: true, expected: 0, actual: 0 }
    ],
    summary: { passed: 3, failed: 0, total: 3 }
};
```

### Phase 3: Delta Calculation

```javascript
const delta = {
    checksFixed: postFix.summary.passed - baseline.summary.passed,
    checksRegressed: baseline.summary.passed - /* still passing */,
    newlyPassing: ['Check 1', 'Check 2'],
    newlyFailing: [],
    stillFailing: [],
    verdict: 'FIXED' // or 'PARTIAL' or 'REGRESSED' or 'NO_CHANGE'
};
```

## Output Format

```markdown
## Delta Verification: [issue-name]

### Summary
| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Passing | 1 | 3 | +2 |
| Failing | 2 | 0 | -2 |
| Total | 3 | 3 | 0 |

### Verdict: FIXED

### Detail

| Check | Before | After | Status |
|-------|--------|-------|--------|
| Orbit eccentricity valid | FAIL (e=1.2) | PASS (e=0.7) | FIXED |
| Position defined | FAIL (undefined) | PASS ([1.2e11,0,0]) | FIXED |
| No console errors | PASS | PASS | UNCHANGED |

### Regression Check

| Test Suite | Before | After | Status |
|------------|--------|-------|--------|
| orbital.test.js | 15/15 | 15/15 | OK |
| trajectory-predictor.test.js | 8/8 | 8/8 | OK |

### Evidence
\`\`\`
Pre-fix diagnostic output:
[FAIL] Check 1 - Expected: 1.52, Got: NaN
[FAIL] Check 2 - Expected: object, Got: undefined
[PASS] Check 3
Result: 1/3

Post-fix diagnostic output:
[PASS] Check 1
[PASS] Check 2
[PASS] Check 3
Result: 3/3
\`\`\`
```

## Verdict Criteria

| Verdict | Condition |
|---------|-----------|
| FIXED | All previously failing checks now pass, no regressions |
| PARTIAL | Some checks fixed, some still failing |
| REGRESSED | Fix broke something that was working |
| NO_CHANGE | Same results before and after |
| INCONCLUSIVE | Test results inconsistent/flaky |

## Quantifiable Metrics

### Primary Metrics
- **Checks fixed:** count of FAIL→PASS transitions
- **Checks regressed:** count of PASS→FAIL transitions
- **Net improvement:** checks_fixed - checks_regressed

### Secondary Metrics
- **Test suite health:** X/Y tests passing in related suites
- **Console errors:** count of console.error calls (should be 0)
- **Performance:** if relevant, before/after timing

## Regression Detection

Always run related test suites:

```javascript
// Capture suite results before fix
const beforeSuites = {
    'orbital': { passed: 15, total: 15 },
    'trajectory': { passed: 8, total: 8 }
};

// Capture suite results after fix
const afterSuites = {
    'orbital': { passed: 15, total: 15 },  // OK
    'trajectory': { passed: 7, total: 8 }   // REGRESSION!
};
```

## Example Workflow

```javascript
// 1. BASELINE
console.log('=== BASELINE (before fix) ===');
const baseline = await runDiagnosticTest();
// Output: 1/3 passing

// 2. APPLY FIX
// ... code changes made ...

// 3. VERIFY
console.log('=== VERIFICATION (after fix) ===');
const postFix = await runDiagnosticTest();
// Output: 3/3 passing

// 4. DELTA
console.log('=== DELTA ===');
console.log(`Fixed: ${postFix.passed - baseline.passed} checks`);
console.log(`Verdict: ${postFix.passed === postFix.total ? 'FIXED' : 'PARTIAL'}`);

// 5. REGRESSION CHECK
console.log('=== REGRESSION CHECK ===');
await import('/js/lib/orbital.test.js').then(m => m.runAllTests());
// Confirm no new failures
```

## Integration

- **Called by:** `/fix` skill
- **Receives:** Diagnostic test code, file changes
- **Produces:** Delta verification report
- **Ensures:** Fix is proven, not assumed
