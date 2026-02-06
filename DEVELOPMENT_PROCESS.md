# Development Process Blueprint

This document codifies the development methodology used for the Sailship project. It serves as the template for all new features.

---

## Overview

The process follows a **Plan → Review → Implement → Verify** cycle with atomic units of work.

```
┌─────────────────────────────────────────────────────────────────────┐
│  PHASE 1: DISCOVERY                                                 │
│  ├── Understand existing systems                                    │
│  ├── Document current architecture                                  │
│  └── Identify gaps and constraints                                  │
├─────────────────────────────────────────────────────────────────────┤
│  PHASE 2: PLANNING                                                  │
│  ├── Define problem statement                                       │
│  ├── Design solution architecture                                   │
│  ├── Break into atomic units of work                                │
│  └── Identify risks and edge cases                                  │
├─────────────────────────────────────────────────────────────────────┤
│  PHASE 3: REVIEW (7 Perspectives)                                   │
│  ├── Physics/Realism validation                                     │
│  ├── Solar Sailing expert review                                    │
│  ├── Functionality verification                                     │
│  ├── Architecture evaluation                                        │
│  ├── Failure modes analysis                                         │
│  ├── Best practices compliance                                      │
│  └── Regression risk assessment                                     │
├─────────────────────────────────────────────────────────────────────┤
│  PHASE 4: IMPLEMENTATION                                            │
│  ├── Execute units sequentially                                     │
│  ├── Best practices check per unit                                  │
│  ├── Regression check after each unit                               │
│  └── Atomic commits per unit                                        │
├─────────────────────────────────────────────────────────────────────┤
│  PHASE 5: VERIFICATION                                              │
│  ├── Integration testing                                            │
│  ├── Edge case validation                                           │
│  ├── Full regression check (regression-checker agent)               │
│  ├── Best practices audit (best-practices agent)                    │
│  └── User acceptance                                                │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Discovery

**Goal:** Understand the current state before proposing changes.

### Deliverable: Feature Specification Document

Location: `[FEATURE_NAME]_SPEC.md` (root) or `reports/[feature]-spec-[DATE].md`

### Contents

1. **Existing Systems Analysis**
   - What code currently exists in this domain?
   - What modules/functions are involved?
   - What is the data flow?

2. **Architecture Mapping**
   - File structure and dependencies
   - Key interfaces and contracts
   - State management patterns

3. **Gap Analysis**
   - What's missing for the new feature?
   - What needs to change vs. extend?
   - Open questions to resolve

### Template

```markdown
# [Feature Name] Specification

## 1. Executive Summary
[One paragraph describing the feature and its value]

## 1.1 Estimated File Impact
### Files to EDIT:
- `path/to/file.js` - Brief description

### Files to CREATE:
- `path/to/newfile.js` - Brief description

## 2. Current State Analysis

### 2.1 Existing Systems
| System | Location | Purpose |
|--------|----------|---------|
| ... | ... | ... |

### 2.2 Data Flow
[Diagram or description of current data flow]

### 2.3 Relevant Code
- `file.js:function()` - description
- ...

## 3. Gap Analysis

### 3.1 Missing Capabilities
- [ ] ...

### 3.2 Required Changes
- [ ] ...

## 4. Open Questions
- [ ] ...
```

---

## Phase 2: Planning

**Goal:** Design the solution and break it into testable units.

### Deliverable: Implementation Plan

Location: `reports/[feature]-implementation-plan-[DATE].md`

### Contents

1. **Problem Statement**
   - What problem are we solving?
   - What's the root cause?
   - What are the constraints?

2. **Solution Architecture**
   - High-level design
   - Design principles/rationale
   - Key algorithms or formulas

3. **Units of Work**
   - Atomic, testable pieces
   - Each unit is independently verifiable
   - Clear acceptance criteria per unit

4. **Risk Assessment**
   - What could go wrong?
   - How do we mitigate?

### Unit of Work Definition

Each unit must be:
- **Atomic:** Cannot be meaningfully subdivided
- **Testable:** Has clear pass/fail criteria
- **Independent:** Works without subsequent units (may do nothing useful, but doesn't break)
- **Reversible:** Can be rolled back cleanly

### File Impact Analysis

Before diving into units of work, identify all files that will be affected:

**Files to EDIT:**
- List existing files that will be modified
- Include file paths relative to project root
- Brief note on what changes (e.g., "Add caching system")

**Files to CREATE:**
- List new files to be created
- Include both source files and documentation
- Specify purpose of each new file

**Files to DELETE:**
- List any files being removed (rare)
- Note migration path if applicable

### Template

```markdown
# [Feature Name] Implementation Plan

**Date:** YYYY-MM-DD
**Status:** Draft | Review | Approved | In Progress | Complete

## 0. File Impact Summary

### Files to EDIT:
1. `path/to/file1.js` - Description of changes
2. `path/to/file2.js` - Description of changes

### Files to CREATE:
1. `path/to/newfile.js` - Purpose
2. `reports/feature-review-YYYY-MM-DD.md` - Review documentation

### Files to DELETE:
- None (or list if applicable)

## 1. Problem Statement

### 1.1 Description
[What problem are we solving?]

### 1.2 Root Cause
[Why does this problem exist?]

### 1.3 Constraints
- ...

## 2. Solution Architecture

### 2.1 High-Level Design
[Architecture diagram or description]

### 2.2 Design Principles
- Principle 1: Rationale
- ...

### 2.3 Key Algorithms
[Mathematical formulas, pseudocode, etc.]

## 3. Units of Work

### Unit 1: [Name]
**Description:** [What this unit accomplishes]
**Files:** [Files to modify/create]
**Acceptance Criteria:**
- [ ] Criterion 1
- [ ] Criterion 2
**Test Method:** [How to verify]

### Unit 2: [Name]
...

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| ... | Low/Med/High | Low/Med/High | ... |

## 5. Testing Strategy

### 5.1 Unit Tests
- ...

### 5.2 Integration Tests
- ...

### 5.3 Manual Verification
- ...
```

---

## Phase 3: Review

**Goal:** Validate the plan from multiple perspectives before implementation.

### Deliverable: Review Report

Location: `reports/[feature]-review-[DATE].md`

### Seven Perspectives

#### 1. Physics/Realism Review
- Are formulas mathematically correct?
- Are units consistent?
- Does it match real-world behavior (where applicable)?
- Are there numerical edge cases?

#### 2. Solar Sailing Expert Review
- Are any traditional spaceflight assumptions applied incorrectly?
- Thrust is continuous (from sunlight), not impulsive — no "burn for X minutes then coast"
- Transfer windows differ from chemical rockets — Hohmann/Lambert windows don't directly apply
- Trajectories are spirals under constant thrust, not ballistic conic sections
- Deceleration and orbit capture are gradual sail-orientation maneuvers, not braking burns
- Delta-v budgets, coast phases, and instantaneous orbit insertion are chemical-rocket concepts
- Thrust scales with 1/r² and depends on sail attitude, not just on/off state
- Algorithms and solvers must not assume impulsive maneuvers or arbitrary thrust direction

#### 3. Functionality Review
- Does the design achieve the stated goals?
- Are all code paths covered?
- What's the test coverage?
- Are there missing features?

#### 4. Architecture Review
- Does it follow existing patterns?
- Is separation of concerns maintained?
- Is it extensible?
- Is there code duplication?

#### 5. Failure Modes Review
- What happens with invalid input?
- Are there numerical instability risks?
- What are the performance implications?
- What player-facing bugs could occur?

#### 6. Best Practices Review
- Does code follow project conventions from CLAUDE.md?
- Are imports using `.js` extensions and named exports?
- Do naming conventions match (camelCase functions, UPPER_SNAKE constants)?
- Is code minimal and focused, avoiding over-engineering?
- Are there unnecessary abstractions, error handling, or feature flags?
- Does the module structure follow one-concept-per-file?

#### 7. Regression Risk Review
- What existing features could break from these changes?
- Which test suites are affected?
- Are there shared modules or state that could cause side effects?
- What manual verification is needed for adjacent features?
- Is the change isolated enough to avoid cascading failures?

### Review Output

```markdown
# [Feature Name] Review

**Date:** YYYY-MM-DD
**Plan Version:** [link to plan]
**Reviewer:** [name/agent]

## 1. Physics/Realism

### Findings
- ...

### Concerns
| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| P1 | Critical | ... | ... |

## 2. Solar Sailing Expert

### Findings
- ...

### Concerns
| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| SS1 | Critical | ... | ... |

## 3. Functionality

### Findings
- ...

### Concerns
| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| F1 | Important | ... | ... |

## 4. Architecture

### Findings
- ...

### Concerns
| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| A1 | Nice-to-have | ... | ... |

## 5. Failure Modes

### Findings
- ...

### Concerns
| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| FM1 | Critical | ... | ... |

## 6. Best Practices

### Compliance Summary
| Category | Status | Notes |
|----------|--------|-------|
| Imports | Compliant/Issues | ... |
| Naming | Compliant/Issues | ... |
| Code Style | Compliant/Issues | ... |
| Architecture | Compliant/Issues | ... |

### Violations
| ID | Severity | Category | Description | Fix |
|----|----------|----------|-------------|-----|
| BP1 | Important | ... | ... | ... |

## 7. Regression Risk

### Impact Analysis
- Files changed: [list]
- Features affected: [list]
- Shared modules touched: [list]

### Risk Assessment
| Existing Feature | Risk Level | Rationale |
|------------------|------------|-----------|
| ... | Low/Med/High | ... |

### Recommended Regression Tests
- [ ] Test suite 1
- [ ] Manual verification 1

## 8. Summary

### Confidence Rating: X/10

### Critical Issues (Must Fix)
1. ...

### Important Issues (Should Fix)
1. ...

### Recommendations
1. ...

### Verdict
[ ] Approved
[ ] Approved with conditions
[ ] Requires revision
```

---

## Phase 4: Implementation

**Goal:** Execute units of work with verification at each step.

### Process

```
For each Unit:
  1. Mark as "In Progress"
  2. Implement the changes
  3. Run acceptance criteria tests
  4. Best practices check (best-practices agent)
     - Verify code follows CLAUDE.md conventions
     - Check imports, naming, module structure
  5. Regression check (regression-checker agent)
     - Run affected test suites
     - Verify adjacent features still work
  6. If all checks pass:
     - Commit with message: "[Unit N] Description"
     - Mark as "Complete"
  7. If checks fail:
     - Fix issues
     - Return to step 3
  8. Proceed to next unit
```

### Agent Validation Per Unit

| Agent | When | Purpose |
|-------|------|---------|
| `best-practices` | After code changes, before commit | Verify code style and conventions |
| `regression-checker` | After code changes, before commit | Verify no existing features broken |

### Commit Message Format

```
[Unit N] Brief description of unit

- Bullet point of specific changes
- Another change

Files: file1.js, file2.js
```

### Git Workflow

```bash
# Start feature branch
git checkout -b feature/[feature-name]

# Per unit
git add [files]
git commit -m "[Unit N] Description"

# After all units complete
git push origin feature/[feature-name]
```

---

## Phase 5: Verification

**Goal:** Ensure the complete feature works as intended.

### Integration Testing

- Run the full application
- Test all new functionality
- Test interactions with existing features
- Verify no regressions

### Edge Case Validation

Verify all identified edge cases from the review:
- [ ] Edge case 1
- [ ] Edge case 2

### Full Regression Check

Invoke the **regression-checker** agent (`.claude/agents/regression-checker.md`) for comprehensive coverage:
- Run all console test suites
- Verify core functionality (game load, ship rendering, camera, UI panels)
- Check display toggles and time controls
- Confirm no regressions from the full feature implementation

### Best Practices Audit

Invoke the **best-practices** agent (`.claude/agents/best-practices.md`) for final quality gate:
- Review all code changes across the feature
- Verify compliance with CLAUDE.md conventions
- Check import patterns, naming, module structure
- Ensure no over-engineering or unnecessary complexity was introduced

### User Acceptance

- Does it meet the original requirements?
- Is the UX acceptable?
- Are there any surprises?

### Agent Verification Matrix

| Agent | Phase 5 Role |
|-------|-------------|
| `regression-checker` | Full regression suite across all modified and adjacent features |
| `best-practices` | Final compliance audit of all code changes |
| `functional-tester` | Verify feature achieves stated goals end-to-end |
| `failure-analyst` | Validate identified edge cases are handled |
| `physicist` | Confirm physics calculations produce correct results |
| `solar-sailing-expert` | Verify sail-specific behavior matches expectations |
| `architect` | Confirm final code structure follows patterns |

### Deliverable: Verification Report

```markdown
# [Feature Name] Verification Report

**Date:** YYYY-MM-DD
**Implementation:** [link to commits]

## Test Results

| Test | Status | Notes |
|------|--------|-------|
| ... | Pass/Fail | ... |

## Edge Cases

| Case | Status | Notes |
|------|--------|-------|
| ... | Pass/Fail | ... |

## Regressions (regression-checker agent)

| Feature | Status |
|---------|--------|
| Existing Feature 1 | Pass |
| ... | ... |

## Best Practices Compliance (best-practices agent)

| Category | Status | Notes |
|----------|--------|-------|
| Imports | Compliant/Issues | ... |
| Naming | Compliant/Issues | ... |
| Code Style | Compliant/Issues | ... |

## Agent Verification Summary

| Agent | Status | Key Findings |
|-------|--------|-------------|
| regression-checker | Pass/Fail | ... |
| best-practices | Pass/Fail | ... |
| functional-tester | Pass/Fail | ... |
| failure-analyst | Pass/Fail | ... |
| physicist | Pass/Fail/N/A | ... |
| solar-sailing-expert | Pass/Fail/N/A | ... |
| architect | Pass/Fail | ... |

## Issues Found
1. ...

## Verdict
[ ] Feature Complete
[ ] Requires Additional Work
```

---

## Quick Reference

### File Naming Convention

| Document | Location |
|----------|----------|
| Feature Spec | `[FEATURE]_SPEC.md` or `reports/[feature]-spec-[DATE].md` |
| Implementation Plan | `reports/[feature]-implementation-plan-[DATE].md` |
| Review Report | `reports/[feature]-review-[DATE].md` |
| Verification Report | `reports/[feature]-verification-[DATE].md` |

### Severity Levels

| Level | Meaning | Action |
|-------|---------|--------|
| Critical | Blocks implementation or causes major failure | Must fix before proceeding |
| Important | Significant issue but workaround exists | Should fix during implementation |
| Nice-to-have | Improvement opportunity | Fix if time permits |

### Confidence Rating Scale

| Rating | Meaning |
|--------|---------|
| 9-10 | Ready to implement as-is |
| 7-8 | Minor issues to address |
| 5-6 | Significant concerns, needs revision |
| 3-4 | Major problems, requires rethink |
| 1-2 | Fundamentally flawed |

---

## Example: Trajectory Predictor Feature

This feature followed the process:

1. **Discovery:** `TRAJECTORY_FEATURE_SPEC.md`
2. **Planning:** `reports/hyperbolic-orbit-implementation-plan-2026-01-16.md`
3. **Review:** `reports/hyperbolic-orbit-review-2026-01-16.md`
4. **Implementation:** 11 units across multiple commits
5. **Verification:** Browser testing, edge case validation

Units breakdown:
- Units 1-2: Planning & Discovery
- Units 3-5: Display toggle (HTML, state, controls)
- Units 6-7: Rendering integration
- Units 8-11: Edge cases and polish

Each unit was independently testable and committed atomically.
