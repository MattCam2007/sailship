# /implement [feature] [unit]

Execute a single atomic unit of work from an implementation plan.

## Purpose

The implement skill executes one unit of work at a time, following the acceptance criteria defined in the Implementation Plan. It ensures each unit is completed, tested, and committed before proceeding.

## Invocation

```
/implement [feature-name] [unit-number]
/implement [feature-name] all
```

**Prerequisites:**
- Implementation Plan exists from `/planning [feature]`
- Review completed from `/review [feature]` (recommended)

**Examples:**
- `/implement autopilot-system 1` - Execute Unit 1 only
- `/implement autopilot-system 3` - Execute Unit 3 only
- `/implement autopilot-system all` - Execute all units sequentially

## Process

### Step 1: Load Implementation Plan
- Read `reports/[feature]-implementation-plan-*.md`
- Parse the specified unit(s) of work
- Verify unit exists and has not been marked complete

### Step 2: Mark Unit In Progress
- Update plan status if tracking in document
- Begin work on the unit

### Step 3: Execute Unit
Based on unit type:

**For Code Units:**
- Read target files
- Make required changes
- Follow project code style (CLAUDE.md)
- Avoid over-engineering

**For Documentation Units:**
- Create/update markdown files
- Follow templates from DEVELOPMENT_PROCESS.md

**For Test Units:**
- Add test cases
- Verify tests pass

### Step 4: Verify Acceptance Criteria
For each criterion in the unit:
- Run specified test method
- Confirm pass/fail
- Document any issues

If criteria fail:
- Fix issues
- Re-verify
- Loop until passing

### Step 5: Commit Changes
```bash
git add [specific-files]
git commit -m "[Unit N] Description

- Specific change 1
- Specific change 2

Files: file1.js, file2.js"
```

### Step 6: Mark Unit Complete
- Update unit status
- Report completion
- Proceed to next unit (if `all` mode)

## Output

**Primary:** Code changes committed to feature branch

**Secondary:** Status updates in CLI:
```
=== UNIT [N] COMPLETE ===
Description: [unit description]
Files modified: file1.js, file2.js
Acceptance criteria: 3/3 passing
Commit: abc1234

Next: /implement [feature] [N+1]
```

## Unit Execution Guidelines

### Code Quality
- Follow CLAUDE.md code style exactly
- Use .js extensions in imports
- Named exports, not default
- camelCase functions with verb prefixes
- Don't add unnecessary error handling
- Don't over-engineer

### Safety Checks
- Read files before editing
- Verify edits are correct
- Don't introduce security vulnerabilities
- Test after each change

### Commit Discipline
- One commit per unit
- Specific files only (no `git add -A`)
- Descriptive commit message
- Never skip hooks without permission

### Error Handling
If a unit cannot be completed:
1. Document the blocker
2. Do not commit partial work
3. Report the issue
4. Await user guidance

## Handling Unit Dependencies

### Independent Units
- Can be executed in any order
- No special handling needed

### Dependent Units
- Must execute in order
- Earlier unit provides foundation
- Later unit builds on it

### Blocked Units
- If dependency fails, skip this unit
- Report the dependency chain
- Await user decision

## Rollback Procedure

If a unit needs to be undone:
```bash
git revert [commit-hash]
```

Or if not yet committed:
```bash
git checkout -- [files]
```

## Tools Used

This skill uses (for code units):
- **Read** - Load files before editing
- **Edit** - Make precise changes
- **Write** - Create new files
- **Bash** - Git operations, running tests

Note: This skill DOES create/modify code files (unlike the framework build itself).

## Quality Criteria

A successful unit implementation:
- [ ] All acceptance criteria pass
- [ ] Code follows project style
- [ ] Changes are minimal and focused
- [ ] Commit message is descriptive
- [ ] No regressions introduced

## Failure Modes

| Failure | Detection | Recovery |
|---------|-----------|----------|
| Criteria unclear | Can't determine pass/fail | Ask for clarification |
| Technical blocker | Implementation not possible | Report and await guidance |
| Test failure | Tests don't pass | Debug and fix |
| Merge conflict | Git conflict on commit | Resolve manually |

## Integration

- **Follows:** `/review [feature]` (recommended)
- **Precedes:** `/verify [feature]` (after all units)
- **May invoke:** regression-checker after each unit
- **Loops:** Repeats for each unit until all complete

## Unit Types Reference

| Type | Description | Typical Criteria |
|------|-------------|------------------|
| Scaffolding | Create structure, stubs | Files exist, no errors |
| Data | Add data structures | Data accessible |
| Logic | Implement algorithm | Correct output for inputs |
| Integration | Wire components | Components communicate |
| UI | Add interface elements | Elements render correctly |
| Test | Add test coverage | Tests pass |
| Polish | Edge cases, cleanup | Edge cases handled |

## Reference

See DEVELOPMENT_PROCESS.md Phase 4: Implementation for the canonical process definition.
