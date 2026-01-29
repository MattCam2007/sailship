# /verify [feature]

Perform integration testing and edge case validation for a completed feature.

## Purpose

The verify skill ensures a fully implemented feature works correctly as a whole. It tests integration between components, validates edge cases identified during review, checks for regressions, and confirms user acceptance criteria.

## Invocation

```
/verify [feature-name]
```

**Prerequisites:**
- All units implemented via `/implement [feature] all`
- Implementation Plan with testing strategy
- Review Report with identified edge cases

**Examples:**
- `/verify autopilot-system`
- `/verify multiplayer-sync`
- `/verify fuel-consumption`

## Process

### Step 1: Gather Context
- Read Implementation Plan for testing strategy
- Read Review Report for identified edge cases
- List all files modified during implementation
- Identify test files if they exist

### Step 2: Integration Testing
Verify the feature works as a complete system:

**For UI Features:**
- Start the application (`python3 -m http.server 8080`)
- Navigate to relevant screens
- Test user flows end-to-end
- Verify visual correctness

**For Logic Features:**
- Run console test suites
- Test component interactions
- Verify data flow between modules

**For Physics Features:**
- Validate calculations with known values
- Check edge cases (zero, negative, extreme)
- Compare with reference implementations

### Step 3: Edge Case Validation
For each edge case from the Review Report:
- Set up the condition
- Execute the relevant code path
- Verify behavior matches expectations
- Document pass/fail

### Step 4: Regression Testing
Check that existing functionality still works:
- Run all existing test suites
- Test features adjacent to changes
- Verify no console errors
- Check performance hasn't degraded

**Invoke subagent:** regression-checker for systematic coverage

### Step 5: User Acceptance
Confirm original requirements are met:
- Does it solve the stated problem?
- Is the UX acceptable?
- Are there unexpected behaviors?
- Would a user consider this complete?

### Step 6: Generate Verification Report
- Document all test results
- List issues found (if any)
- Declare feature complete or identify remaining work

## Output

**Deliverable:** Verification Report

**Location:** `reports/[feature]-verification-[DATE].md`

### Template (from DEVELOPMENT_PROCESS.md)

```markdown
# [Feature Name] Verification Report

**Date:** YYYY-MM-DD
**Implementation:** [link to commits or branch]

## Test Results

| Test | Status | Notes |
|------|--------|-------|
| Integration test 1 | Pass/Fail | ... |
| Integration test 2 | Pass/Fail | ... |

## Edge Cases

| Case | Status | Notes |
|------|--------|-------|
| Edge case from review | Pass/Fail | ... |
| ... | ... | ... |

## Regressions

| Feature | Status |
|---------|--------|
| Existing Feature 1 | Pass |
| Existing Feature 2 | Pass |
| ... | ... |

## Console Test Results

| Test Suite | Status | Details |
|------------|--------|---------|
| trajectory-predictor.test.js | Pass/Fail | X/Y tests passing |
| orbital.test.js | Pass/Fail | X/Y tests passing |
| ... | ... | ... |

## Issues Found

### Critical (Blocks release)
- None / List issues

### Important (Should fix)
- None / List issues

### Minor (Nice to fix)
- None / List issues

## User Acceptance

| Requirement | Met? | Notes |
|-------------|------|-------|
| Original goal 1 | Yes/No | ... |
| Original goal 2 | Yes/No | ... |

## Verdict

[ ] Feature Complete - Ready for merge
[ ] Requires Additional Work - See issues above
```

## Test Methods by Feature Type

### Physics/Simulation Features
```javascript
// Run in browser console
import('/js/lib/[feature].test.js').then(m => m.runAllTests())
```
- Verify mathematical correctness
- Check unit consistency
- Test boundary conditions

### UI/Rendering Features
- Manual visual inspection
- Keyboard shortcut testing
- Responsive behavior check
- Toggle functionality

### Data/State Features
- State persistence verification
- Data flow tracing
- Error state handling

## Regression Test Checklist

Core functionality to verify hasn't broken:
- [ ] Game loads without console errors
- [ ] Ship renders and moves correctly
- [ ] Orbital paths display when enabled
- [ ] Predicted trajectory calculates correctly
- [ ] Camera controls work (pan, zoom, rotate)
- [ ] UI panels are interactive
- [ ] Time controls function
- [ ] Display toggles work

## Tools Used

This skill primarily uses:
- **Bash** - Start server, run tests
- **Read** - Load test files and review reports
- **Write** - Output verification report
- **Task** - Invoke regression-checker subagent

## Quality Criteria

A successful verification:
- [ ] All integration tests pass
- [ ] Edge cases validated
- [ ] No regressions detected
- [ ] User acceptance criteria met
- [ ] Issues documented with severity
- [ ] Clear verdict provided

## Failure Modes

| Failure | Detection | Recovery |
|---------|-----------|----------|
| Test fails | Test output shows failure | Debug and fix in new unit |
| Regression found | Existing feature broken | Identify cause, create fix unit |
| Edge case missed | Unexpected behavior discovered | Add to verification, document |
| Performance issue | Slow rendering or calculation | Profile and optimize |

## Integration

- **Follows:** `/implement [feature] all`
- **Precedes:** Merge to main branch
- **May invoke:** regression-checker subagent
- **Outputs:** Verification report for record

## Post-Verification Actions

### If Feature Complete:
1. Ensure all commits are pushed
2. Create pull request (if applicable)
3. Update any documentation
4. Close related issues

### If Additional Work Required:
1. Create new units of work for issues
2. Return to `/implement` skill
3. Re-run `/verify` after fixes

## Reference

See DEVELOPMENT_PROCESS.md Phase 5: Verification for the canonical process definition.
