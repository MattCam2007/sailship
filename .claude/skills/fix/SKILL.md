# /fix [issue]

Quickly fix a diagnosed bug with immediate verification.

## Purpose

The fix skill is a lightweight alternative to the full planning cycle for small, well-understood bugs. It applies a fix and immediately verifies using the diagnostic test.

## Invocation

```
/fix [issue-name]
```

**Prerequisites:** A diagnosis should exist from `/diagnose [issue]`

**Examples:**
- `/fix orbit-calculation-drift`
- `/fix ship-disappears-at-soi-boundary`

## When to Use /fix vs /planning

| Scenario | Use |
|----------|-----|
| Single function bug | `/fix` |
| One file change | `/fix` |
| Clear root cause | `/fix` |
| Multi-file refactor | `/planning` |
| Unclear cause | `/diagnose` first |
| Architecture change | `/planning` |

## Process

### Step 1: Load Diagnosis
- Read `reports/[issue]-diagnosis-*.md`
- Extract the quantifiable test
- Verify the test currently FAILS (confirms bug exists)

### Step 2: Run Pre-Fix Test
```javascript
// Run diagnostic test - should show failures
// This confirms we're testing the right thing
```

Document the pre-fix state:
- X/Y checks failing
- Specific values observed

### Step 3: Apply Fix
- Read the file(s) to modify
- Apply minimal change to fix root cause
- Follow code style (CLAUDE.md)

### Step 4: Run Post-Fix Test
```javascript
// Run same diagnostic test - should now pass
```

Document the post-fix state:
- All checks passing
- Values now correct

### Step 5: Run Regression Tests
Check that fix didn't break anything:
```javascript
// Run relevant test suite
import('/js/lib/[relevant].test.js').then(m => m.runAllTests())
```

### Step 6: Commit with Verification

```bash
git add [specific-files]
git commit -m "Fix: [issue-name]

Root cause: [brief description]
Fix: [what was changed]

Verified:
- Diagnostic test: PASS (was FAIL)
- Regression tests: X/X passing

Files: file1.js"
```

## Output

**Primary:** Code fix committed

**Secondary:** CLI summary:
```
=== FIX APPLIED: [issue-name] ===

Pre-fix:  2/5 checks passing
Post-fix: 5/5 checks passing

Regression tests: 23/23 passing

Commit: abc1234

Run diagnostic test to verify:
[paste test code or import command]
```

## Delta Verification Pattern

The key insight: **same test, different result**

```
BEFORE FIX:
┌─────────────────────────────────┐
│ Diagnostic Test                 │
│ Check 1: FAIL (got NaN)        │
│ Check 2: FAIL (got undefined)  │
│ Check 3: PASS                   │
│ Result: 1/3                     │
└─────────────────────────────────┘

AFTER FIX:
┌─────────────────────────────────┐
│ Diagnostic Test                 │
│ Check 1: PASS (got 1.5)        │
│ Check 2: PASS (got {orbit:..}) │
│ Check 3: PASS                   │
│ Result: 3/3                     │
└─────────────────────────────────┘
```

This is the "quantifiable measurement" - the exact same test code produces a different, measurable result.

## Subagent Dispatch

Invoke `delta-verifier` agent to:
- Capture pre-fix test state
- Capture post-fix test state
- Generate comparison report
- Confirm no regressions

## Tools Used

- **Read** - Load diagnosis, examine code
- **Edit** - Apply fix
- **Bash** - Run tests, git commit
- **Task (delta-verifier)** - Verify fix worked

## Quality Criteria

A successful fix:
- [ ] Diagnostic test was FAILING before fix
- [ ] Diagnostic test is PASSING after fix
- [ ] No regressions in related tests
- [ ] Commit includes verification evidence
- [ ] Change is minimal and focused

## Failure Modes

| Failure | Detection | Recovery |
|---------|-----------|----------|
| Test still fails | Post-fix test shows failures | Debug and retry |
| Regression introduced | Other tests now fail | Revert, analyze |
| Wrong root cause | Fix doesn't help | Return to /diagnose |
| Test was already passing | Pre-fix shows pass | Diagnosis was wrong |

## Integration

- **Follows:** `/diagnose [issue]`
- **Precedes:** Push to remote
- **Invokes:** delta-verifier subagent
- **Alternative to:** `/planning` for simple bugs
