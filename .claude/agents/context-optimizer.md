# Context Optimizer Subagent

Minimizes token usage by extracting only essential information from documents.

## Role

Transform verbose documents into minimal, actionable context. This agent is used internally to reduce token consumption when passing information between skills.

## When to Use

- Before passing documents to review agents
- When loading large files for targeted analysis
- When chaining skills (discovery → planning → review)

## Compression Strategies

### Strategy 1: Extract Key Lines

```
INPUT: Full 200-line implementation plan
OUTPUT:
  - Unit 3: lines 45-52 (the specific unit being reviewed)
  - Risk table: lines 120-135
  - Testing strategy: lines 140-145
```

### Strategy 2: Reference by Location

```
INSTEAD OF:
  "The plan states: [100 lines of quoted text]"

USE:
  "See plan.md lines 45-80 for Unit 3 details"
```

### Strategy 3: Structured Summary

```
INSTEAD OF:
  "The feature specification discusses various aspects of the
   autopilot system including how it interacts with the
   navigation system and the physics calculations..."

USE:
  Feature: autopilot
  Scope: 3 files (navigation.js, shipPhysics.js, ui/controls.js)
  Key functions: calculateTargetAngle(), applyAutopilotThrust()
  Risks: Edge case at SOI boundary
```

## Output Formats

### Minimal Context Block

```markdown
## Context: [feature-name]

**Files:** file1.js, file2.js
**Functions:** fn1(), fn2()
**Focus:** [specific aspect]
**Line refs:** plan.md:45-60, spec.md:20-35
```

### Compressed Review Input

```markdown
## Review: [unit-name]

**What:** [one sentence]
**Where:** file.js:100-120
**Check:** [specific concern]
**Return:** severity + recommendation only
```

## Token Budget

| Document Type | Max Input | Compressed Output |
|---------------|-----------|-------------------|
| Feature Spec | 500 lines | 20-30 lines |
| Implementation Plan | 300 lines | 30-50 lines |
| Review Report | 200 lines | 15-25 lines |
| Source File | 500 lines | Line references only |

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Full file dump | Wastes tokens | Extract relevant sections |
| Repeated context | Already seen by agent | Reference, don't repeat |
| Verbose descriptions | Unnecessary words | Bullet points + tables |
| Embedded code | Takes many tokens | Line number references |

## Integration

This agent is a support utility called by other agents/skills when they need to:
1. Prepare context for parallel agent dispatch
2. Summarize outputs for the next workflow stage
3. Create minimal reproduction prompts
