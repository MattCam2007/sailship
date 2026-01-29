# /planning [feature]

Design a solution and break it into atomic, testable units of work.

## Purpose

The planning skill transforms a Feature Specification into an actionable Implementation Plan. It designs the solution architecture, decomposes work into atomic units, and assesses risks.

## Invocation

```
/planning [feature-name]
```

**Prerequisites:** A Feature Specification should exist from `/discovery [feature]`

**Examples:**
- `/planning autopilot-system`
- `/planning multiplayer-sync`
- `/planning fuel-consumption`

## Process

### Step 1: Review Feature Specification
- Read the spec from `reports/[feature]-spec-[DATE].md`
- Verify all open questions have answers (or flag blockers)
- Understand the gap analysis

### Step 2: Define Problem Statement
- Articulate what problem we're solving
- Identify the root cause (why does this problem exist?)
- Document constraints (performance, compatibility, scope)

### Step 3: Design Solution Architecture
- Create high-level design
- Document design principles and rationale
- Specify key algorithms or formulas (with units, sources)
- Consider alternatives and explain choices

### Step 4: Decompose into Units of Work
Each unit must be:
- **Atomic:** Cannot be meaningfully subdivided
- **Testable:** Has clear pass/fail criteria
- **Independent:** Works without subsequent units
- **Reversible:** Can be rolled back cleanly

For each unit, define:
- Description of what it accomplishes
- Files to modify/create
- Acceptance criteria (checkboxes)
- Test method

### Step 5: Assess Risks
- Identify what could go wrong
- Rate likelihood and impact
- Define mitigation strategies
- Flag dependencies on external factors

### Step 6: Define Testing Strategy
- Unit tests for individual components
- Integration tests for feature interactions
- Manual verification steps

### Step 7: Generate Implementation Plan
- Output the plan following the template

## Output

**Deliverable:** Implementation Plan

**Location:** `reports/[feature]-implementation-plan-[DATE].md`

### Template (from DEVELOPMENT_PROCESS.md)

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

## Unit of Work Guidelines

### Size Guidelines
- A unit should take 15-60 minutes to implement
- If larger, decompose further
- If smaller, consider combining with related work

### Dependency Ordering
- Order units to minimize dependencies
- Each unit should be committable independently
- Later units build on earlier ones but don't break if skipped

### Example Unit Types
- **Scaffolding Unit:** Create file structure, stubs
- **Data Unit:** Add data structures, constants
- **Logic Unit:** Implement core algorithm
- **Integration Unit:** Wire components together
- **UI Unit:** Add user-facing elements
- **Test Unit:** Add test coverage
- **Polish Unit:** Edge cases, error handling

## Tools Used

This skill primarily uses:
- **Read** - Review existing specs and code
- **Grep** - Find related patterns for design decisions
- **Write** - Output the implementation plan

## Quality Criteria

A successful plan:
- [ ] References the Feature Specification
- [ ] Defines clear problem statement with constraints
- [ ] Provides rationale for design choices
- [ ] Decomposes into 5-15 atomic units
- [ ] Each unit has testable acceptance criteria
- [ ] Identifies and mitigates key risks
- [ ] Ready for review by `/review` skill

## Failure Modes

| Failure | Detection | Recovery |
|---------|-----------|----------|
| Units too large | Implementation takes too long | Decompose during implementation |
| Missing dependencies | Unit fails without prior unit | Reorder or add missing unit |
| Unclear criteria | Can't determine if unit passes | Refine criteria before implementing |
| Scope drift | Plan exceeds spec scope | Return to spec and trim plan |

## Integration

- **Follows:** `/discovery [feature]`
- **Precedes:** `/review [feature]`
- **References:** Feature Specification from discovery

## Reference

See DEVELOPMENT_PROCESS.md Phase 2: Planning for the canonical process definition.
