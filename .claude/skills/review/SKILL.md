# /review [feature]

Orchestrate a seven-perspective review of an implementation plan.

## Purpose

The review skill validates an Implementation Plan from seven specialized perspectives before implementation begins. It invokes subagents for each perspective and aggregates their findings into a unified Review Report. This includes five domain reviewers (physicist, solar-sailing-expert, architect, functional-tester, failure-analyst) plus two quality reviewers (best-practices, regression-checker).

## Invocation

```
/review [feature-name]
```

**Prerequisites:** An Implementation Plan should exist from `/planning [feature]`

**Examples:**
- `/review autopilot-system`
- `/review multiplayer-sync`
- `/review fuel-consumption`

## Process

### Step 1: Locate Documents
- Find the Implementation Plan: `reports/[feature]-implementation-plan-*.md`
- Find the Feature Specification: `reports/[feature]-spec-*.md`
- Verify both exist and are current

### Step 2: Invoke Specialized Reviewers
Dispatch seven subagents in parallel:

**Domain Reviewers:**

1. **Physicist** (`.claude/agents/physicist.md`)
   - Reviews physics/realism aspects
   - Validates formulas, units, real-world accuracy

2. **Solar Sailing Expert** (`.claude/agents/solar-sailing-expert.md`)
   - Reviews solar sail propulsion assumptions
   - Catches errors from treating continuous solar thrust like chemical rocket burns
   - Validates that transfer windows, trajectories, and maneuvers account for constant sunlight-driven thrust
   - Flags Hohmann transfers, coast phases, impulsive delta-v, and other conventional spaceflight concepts used incorrectly

3. **Architect** (`.claude/agents/architect.md`)
   - Reviews architecture aspects
   - Evaluates patterns, separation of concerns, extensibility

4. **Functional Tester** (`.claude/agents/functional-tester.md`)
   - Reviews functionality aspects
   - Verifies code paths, test coverage, logic

5. **Failure Analyst** (`.claude/agents/failure-analyst.md`)
   - Reviews failure modes
   - Identifies edge cases, instability risks, performance issues

**Quality Reviewers:**

6. **Best Practices** (`.claude/agents/best-practices.md`)
   - Reviews compliance with CLAUDE.md project standards
   - Checks import conventions, naming, code style, module structure
   - Flags over-engineering, unnecessary abstractions, or convention violations

7. **Regression Checker** (`.claude/agents/regression-checker.md`)
   - Assesses regression risk from proposed changes
   - Identifies which existing features and test suites are affected
   - Maps file changes to feature impact areas
   - Recommends specific regression tests to run during implementation

### Step 3: Aggregate Findings
- Collect structured outputs from each subagent
- Merge into unified concerns table
- Identify cross-cutting issues (issues that span multiple perspectives)
- Assign overall severity to each finding

### Step 4: Calculate Confidence Rating
Based on findings:
- 9-10: Ready to implement as-is
- 7-8: Minor issues to address
- 5-6: Significant concerns, needs revision
- 3-4: Major problems, requires rethink
- 1-2: Fundamentally flawed

### Step 5: Formulate Verdict
- **Approved:** Proceed to implementation
- **Approved with conditions:** Proceed but address specific items
- **Requires revision:** Return to planning phase

### Step 6: Generate Review Report
- Output the aggregated review following the template

## Output

**Deliverable:** Review Report

**Location:** `reports/[feature]-review-[DATE].md`

### Template (from CLAUDE.md)

```markdown
# [Feature Name] Review

**Date:** YYYY-MM-DD
**Plan Version:** [link to plan]
**Reviewer:** Orchestrated review with specialized subagents

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

## Subagent Dispatch

Each subagent receives:
- The Implementation Plan
- The Feature Specification
- Relevant source files (as identified in plan)
- Their specific review prompt

Each subagent returns:
- Structured findings (bullet list)
- Concerns table (ID, Severity, Description, Recommendation)
- Confidence score for their domain (1-10)

## Severity Levels

| Level | Meaning | Action |
|-------|---------|--------|
| Critical | Blocks implementation or causes major failure | Must fix before proceeding |
| Important | Significant issue but workaround exists | Should fix during implementation |
| Nice-to-have | Improvement opportunity | Fix if time permits |

## CLI Summary

After writing the report, output to CLI:
```
=== REVIEW SUMMARY: [feature-name] ===

TOP 3 CONCERNS PER CATEGORY:
  Physics/Realism:
    1. [severity] description
    2. ...
  Solar Sailing Expert:
    1. ...
  Functionality:
    1. ...
  Architecture:
    1. ...
  Failure Modes:
    1. ...
  Best Practices:
    1. ...
  Regression Risk:
    1. ...

CONFIDENCE RATING: X/10

VERDICT: [Approved | Approved with conditions | Requires revision]

NEXT STEPS:
  1. ...
  2. ...

Full report: reports/[feature]-review-[DATE].md
```

## Tools Used

This skill primarily uses:
- **Read** - Load plans and specs
- **Task** - Dispatch subagent reviewers
- **Write** - Output review report

## Quality Criteria

A successful review:
- [ ] Invokes all seven perspectives (5 domain + 2 quality)
- [ ] Each perspective provides substantive findings
- [ ] Concerns are prioritized by severity
- [ ] Confidence rating reflects actual concerns
- [ ] Verdict is actionable
- [ ] Critical issues have clear recommendations

## Failure Modes

| Failure | Detection | Recovery |
|---------|-----------|----------|
| Missing plan | File not found | Run /planning first |
| Shallow review | Few findings, all "Nice-to-have" | Prompt for deeper analysis |
| Conflicting findings | Perspectives contradict each other | Reconcile in summary |
| Scope too broad | Review takes too long | Focus on highest-risk units |

## Integration

- **Follows:** `/planning [feature]`
- **Precedes:** `/implement [feature] [unit]`
- **Invokes:** physicist, solar-sailing-expert, architect, functional-tester, failure-analyst, best-practices, regression-checker subagents (all 7)

## Reference

See CLAUDE.md Development Process → Phase 3: Review for the canonical process definition.
