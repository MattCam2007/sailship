# /discovery [feature]

Analyze existing systems, map architecture, and identify gaps for a proposed feature.

## Purpose

The discovery skill performs comprehensive codebase analysis to understand the current state before proposing changes. It outputs a Feature Specification document that serves as the foundation for planning.

## Invocation

```
/discovery [feature-name]
```

**Examples:**
- `/discovery autopilot-system`
- `/discovery multiplayer-sync`
- `/discovery fuel-consumption`

## Process

### Step 1: Understand the Feature Request
- Parse the feature name/description
- Identify the domain (physics, UI, data, rendering, etc.)
- List initial assumptions and questions

### Step 2: Analyze Existing Systems
- Search for related code using patterns:
  - Function names matching feature domain
  - File names in relevant directories
  - Comments mentioning related concepts
- Map the current architecture in the domain
- Document data flow between components

### Step 3: Map Dependencies
- Identify files that would be affected
- Trace import/export relationships
- Document state management patterns in use
- Note any external dependencies

### Step 4: Identify Gaps
- Compare current capabilities to feature requirements
- List what's missing
- Determine what needs modification vs. extension
- Flag potential conflicts or constraints

### Step 5: Generate Specification
- Output a Feature Specification document following the template

## Output

**Deliverable:** Feature Specification Document

**Location:** `reports/[feature]-spec-[DATE].md`

### Template (from DEVELOPMENT_PROCESS.md)

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

## Tools Used

This skill primarily uses:
- **Glob** - Find files by pattern
- **Grep** - Search code for keywords
- **Read** - Examine file contents
- **Task (Explore)** - Deep codebase exploration

## Quality Criteria

A successful discovery produces a spec that:
- [ ] Accurately maps existing systems in the domain
- [ ] Identifies all files likely to be affected
- [ ] Lists concrete gaps between current and desired state
- [ ] Surfaces questions that need answers before planning
- [ ] Provides enough context for the /planning skill to proceed

## Failure Modes

| Failure | Detection | Recovery |
|---------|-----------|----------|
| Incomplete search | Key files discovered later during planning | Re-run discovery with broader search |
| Misunderstood domain | Planning reveals gaps in understanding | Return to discovery with refined scope |
| Scope creep | Spec covers more than feature requires | Narrow focus to essential functionality |

## Integration

- **Follows:** User request or issue identification
- **Precedes:** `/planning [feature]`
- **May invoke:** Task (Explore) subagent for deep analysis

## Reference

See DEVELOPMENT_PROCESS.md Phase 1: Discovery for the canonical process definition.
