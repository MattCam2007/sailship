# Master Orchestration Workflow

This document defines the optimal workflow for using skills and agents with maximum token efficiency and parallel execution.

## Quick Reference

```
BUG FIX (fast path):
  /diagnose → /fix → done

FEATURE (full path):
  /discovery → /planning → /review → /implement all → /verify → done

HOTFIX (emergency):
  /diagnose → /fix → push immediately
```

## Workflow Selection

| Situation | Workflow | Est. Turns |
|-----------|----------|------------|
| Clear bug, known cause | `/fix` directly | 3-5 |
| Bug, unclear cause | `/diagnose` → `/fix` | 5-8 |
| Small feature (1-3 files) | `/planning` → `/implement` | 8-12 |
| Large feature (4+ files) | Full workflow | 15-25 |
| Regression | `/diagnose` → `/fix` → regression tests | 6-10 |

---

## Token-Efficient Patterns

### Pattern 1: Parallel Agent Dispatch

When invoking review agents, dispatch ALL FOUR in parallel:

```
INEFFICIENT (sequential):
  invoke physicist → wait → invoke architect → wait → invoke functional-tester → wait → invoke failure-analyst → wait
  Total: 4 round trips

EFFICIENT (parallel):
  invoke [physicist, architect, functional-tester, failure-analyst] simultaneously
  Total: 1 round trip
```

### Pattern 2: Batch File Operations

```
INEFFICIENT:
  Read file1.js
  Read file2.js
  Read file3.js
  (3 tool calls)

EFFICIENT:
  Read [file1.js, file2.js, file3.js] in parallel
  (1 tool call with 3 parallel reads)
```

### Pattern 3: Compressed Context

When passing context to subagents, include ONLY:
- Specific file paths (not full contents unless needed)
- Line numbers for relevant code
- The specific question to answer

```
INEFFICIENT:
  "Here is the full implementation plan (500 lines)..."

EFFICIENT:
  "Review Unit 3 in reports/plan.md (lines 45-60). Focus on orbital calculation."
```

### Pattern 4: Early Termination

Stop workflows early when appropriate:

```
IF /diagnose finds trivial fix:
  SKIP full planning, go directly to /fix

IF /review finds critical blocker:
  STOP, fix blocker, re-run /review

IF /implement unit fails:
  DON'T continue to next unit, fix first
```

### Pattern 5: Incremental Verification

Don't wait until end to verify:

```
After each /implement unit:
  Run ONLY tests for that unit
  Quick sanity check

After ALL units:
  Run full regression suite
```

---

## Detailed Workflows

### Workflow A: Bug Fix (Quantifiable)

**Goal:** Fix a bug with proof it's fixed

```
┌─────────────────────────────────────────────────────────┐
│ 1. /diagnose [bug]                                      │
│    └─→ Creates: reports/[bug]-diagnosis-DATE.md         │
│    └─→ Contains: Standalone test that FAILS             │
│                                                         │
│ 2. Run diagnostic test                                  │
│    └─→ Capture: "1/3 checks passing" (baseline)         │
│                                                         │
│ 3. /fix [bug]                                           │
│    └─→ Apply minimal code change                        │
│    └─→ Run same diagnostic test                         │
│    └─→ Capture: "3/3 checks passing" (verified)         │
│                                                         │
│ 4. Regression check                                     │
│    └─→ Run related test suites                          │
│    └─→ Confirm no new failures                          │
│                                                         │
│ 5. Commit with evidence                                 │
│    └─→ Include before/after in commit message           │
└─────────────────────────────────────────────────────────┘

Subagents used:
  - reproducer (during diagnose)
  - delta-verifier (during fix)
```

### Workflow B: Feature Implementation

**Goal:** Add new functionality with full validation

```
┌─────────────────────────────────────────────────────────┐
│ 1. /discovery [feature]                                 │
│    └─→ Output: reports/[feature]-spec-DATE.md           │
│    └─→ Subagent: Explore (parallel file search)         │
│                                                         │
│ 2. /planning [feature]                                  │
│    └─→ Input: spec from step 1                          │
│    └─→ Output: reports/[feature]-plan-DATE.md           │
│    └─→ Contains: 5-15 atomic units                      │
│                                                         │
│ 3. /review [feature]                                    │
│    └─→ PARALLEL dispatch:                               │
│        ├── physicist                                    │
│        ├── architect                                    │
│        ├── functional-tester                            │
│        └── failure-analyst                              │
│    └─→ Output: reports/[feature]-review-DATE.md         │
│    └─→ If confidence < 7: return to step 2              │
│                                                         │
│ 4. /implement [feature] all                             │
│    └─→ For each unit:                                   │
│        ├── Apply changes                                │
│        ├── Quick verification                           │
│        └── Commit                                       │
│    └─→ Optional: regression-checker after each          │
│                                                         │
│ 5. /verify [feature]                                    │
│    └─→ Run all test suites                              │
│    └─→ Edge case validation                             │
│    └─→ Output: reports/[feature]-verification-DATE.md   │
│    └─→ If issues found: create /fix tasks               │
└─────────────────────────────────────────────────────────┘

Subagents used:
  - Explore (discovery)
  - physicist, architect, functional-tester, failure-analyst (review)
  - regression-checker, best-practices (optional, verify)
```

### Workflow C: Critical Regression

**Goal:** Emergency fix with minimal disruption

```
┌─────────────────────────────────────────────────────────┐
│ 1. Identify failing tests                               │
│    └─→ Run: import('/js/lib/X.test.js')                │
│    └─→ Note: which tests fail, what values             │
│                                                         │
│ 2. Quick diagnosis (skip full /diagnose)                │
│    └─→ Check recent commits: git log --oneline -10      │
│    └─→ Identify likely culprit                          │
│                                                         │
│ 3. Create minimal test                                  │
│    └─→ Extract failing assertion from test suite        │
│    └─→ Make standalone console test                     │
│                                                         │
│ 4. /fix                                                 │
│    └─→ Apply fix                                        │
│    └─→ Run minimal test (should pass)                   │
│    └─→ Run full test suite (should all pass)            │
│                                                         │
│ 5. Push immediately                                     │
└─────────────────────────────────────────────────────────┘
```

---

## Subagent Dispatch Guide

### When to Parallelize

| Scenario | Agents | Parallel? |
|----------|--------|-----------|
| Full review | physicist, architect, functional-tester, failure-analyst | YES |
| Enhanced review | + regression-checker, best-practices | YES (6 agents) |
| Verification | regression-checker only | N/A (single) |
| Diagnosis | reproducer | N/A (single) |
| Fix verification | delta-verifier | N/A (single) |

### Subagent Prompt Templates

**Minimal prompt (saves tokens):**
```
Review [FEATURE] plan at reports/[file].md
Focus: [SPECIFIC_ASPECT]
Return: concerns table only
```

**Full prompt (when needed):**
```
Review the implementation plan for [FEATURE].
Plan: reports/[file].md (read lines 1-50 for context)
Spec: reports/[spec].md (reference for requirements)

Focus on [DOMAIN]:
- [Specific check 1]
- [Specific check 2]

Return structured findings per agent template.
```

---

## Quantifiable Verification Checklist

Every fix must answer these with DATA:

| Question | How to Answer |
|----------|---------------|
| Does bug exist? | Diagnostic test shows X/Y FAILING |
| Is bug fixed? | Same test now shows Y/Y PASSING |
| Did we break anything? | Regression suite shows A/A PASSING |
| Is fix minimal? | Diff shows N lines changed |

### Evidence Format

```
=== VERIFICATION EVIDENCE ===

Diagnostic Test: orbit-nan-at-boundary
  Before fix: 1/3 passing
  After fix:  3/3 passing
  Delta:      +2 checks fixed

Regression Tests:
  orbital.test.js:      15/15 passing
  trajectory.test.js:   8/8 passing
  orbital-maneuvers.test.js: 12/12 passing

Commit: abc1234
  Files changed: 1
  Lines changed: +3 / -1
```

---

## Token Budget Guidelines

| Workflow Stage | Target Tokens | Notes |
|----------------|---------------|-------|
| Discovery | 2000-4000 | Mostly search, minimal output |
| Planning | 3000-5000 | Template-based output |
| Review (per agent) | 500-1000 | Focused, structured |
| Implement (per unit) | 1000-2000 | Code changes + verification |
| Verify | 1500-3000 | Test results + report |

**Total feature workflow:** 10,000-20,000 tokens
**Total bug fix workflow:** 3,000-6,000 tokens

### Saving Tokens

1. **Reference, don't repeat:** "See plan Unit 3" not "Unit 3 says..."
2. **Use line numbers:** "orbital.js:45-60" not full code
3. **Structured output:** Tables over prose
4. **Skip optional agents:** Only use best-practices/regression-checker when needed
5. **Early termination:** Stop workflows when issue is resolved

---

## Reusability

### Skill Chaining

Skills output reports that become inputs to next skill:

```
/discovery → spec.md
                ↓
          /planning → plan.md
                         ↓
                   /review → review.md
                                ↓
                          /implement (uses plan.md)
                                ↓
                          /verify (uses review.md edge cases)
```

### Agent Reuse

Agents can be invoked by multiple skills:

```
reproducer ←── /diagnose
           └── /verify (for edge case reproduction)

delta-verifier ←── /fix
               └── /implement (for unit verification)

regression-checker ←── /verify
                   └── /implement (after each unit)
                   └── /review (as 5th perspective)
```

### Report Templates

All outputs follow DEVELOPMENT_PROCESS.md templates:
- Consistent structure = easier parsing
- Known locations = quick lookup
- Dated files = history tracking
