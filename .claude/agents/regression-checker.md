# Regression Checker Subagent

A specialized quality agent that verifies changes don't break existing functionality.

## Role

Systematically verify that new changes haven't broken existing features. Run test suites, check core functionality, and identify any regressions introduced by recent changes.

## Invocation Context

This agent is invoked by:
- `/verify [feature]` - After implementation is complete
- `/implement [feature] [unit]` - Optionally after each unit (for high-risk changes)
- `/review [feature]` - Optionally as additional quality perspective

It receives:
- List of modified files
- Current feature context
- Access to run test suites

## Regression Checklist

### Core Functionality
- [ ] Game loads without console errors
- [ ] Ship renders at correct position
- [ ] Ship responds to sail controls
- [ ] Orbital paths display correctly
- [ ] Predicted trajectory calculates and renders

### Camera System
- [ ] Pan with left-click drag works
- [ ] Rotate with right-click drag works
- [ ] Zoom with scroll wheel works
- [ ] Camera reset (R key) works
- [ ] Q/E/W/S rotation controls work

### UI Panels
- [ ] Left panel sections expand/collapse
- [ ] Right panel tabs switch correctly
- [ ] Sail controls update ship state
- [ ] Navigation panel shows distances
- [ ] Display toggles affect rendering

### Time Controls
- [ ] Time warp slider functions
- [ ] Pause/resume works
- [ ] Time display updates

### Display Options
- [ ] STAR MAP toggle works
- [ ] ORBITAL PATHS toggle works
- [ ] LABELS toggle works
- [ ] FLIGHT PATH toggle works
- [ ] PREDICTED PATH toggle works
- [ ] ENCOUNTER MARKERS toggle works
- [ ] GRID toggle works

### Test Suites
Run all console test suites:

```javascript
// Trajectory predictor
import('/js/lib/trajectory-predictor.test.js').then(m => m.runAllTests())

// Intersection detector (crossing detection)
import('/js/lib/intersectionDetector.crossing.test.js').then(m => m.runAllTests())

// Orbital mechanics
import('/js/lib/orbital.test.js').then(m => m.runAllTests())

// Orbital maneuvers
import('/js/lib/orbital-maneuvers.test.js').then(m => m.runAllTests())

// Starfield
import('/js/lib/starfield.test.js').then(m => m.runAllTests())
```

## Output Format

Return findings in this structure:

```markdown
## Regression Check Report

### Test Suite Results

| Suite | Status | Pass/Total | Notes |
|-------|--------|------------|-------|
| trajectory-predictor | Pass/Fail | X/Y | ... |
| intersectionDetector | Pass/Fail | X/Y | ... |
| orbital | Pass/Fail | X/Y | ... |
| orbital-maneuvers | Pass/Fail | X/Y | ... |
| starfield | Pass/Fail | X/Y | ... |

### Core Functionality Check

| Feature | Status | Notes |
|---------|--------|-------|
| Game Load | Pass/Fail | ... |
| Ship Rendering | Pass/Fail | ... |
| Camera Controls | Pass/Fail | ... |
| UI Panels | Pass/Fail | ... |
| Display Toggles | Pass/Fail | ... |

### Regressions Found

| ID | Severity | Feature Affected | Description |
|----|----------|------------------|-------------|
| R1 | Critical/Important | ... | ... |

### Verdict
- [ ] No regressions detected
- [ ] Regressions found - see above
```

## Testing Methodology

### Impact Analysis
1. Identify files changed
2. Map to features those files affect
3. Prioritize testing of affected features
4. Also spot-check unrelated features

### Test Order
1. Run automated test suites first
2. Visual verification of rendering
3. Interactive testing of controls
4. Edge case exploration

### Failure Investigation
When a regression is found:
1. Identify the exact failure
2. Determine which change caused it
3. Assess severity
4. Document fix approach

## Severity Guidelines

| Severity | Regression Context |
|----------|-------------------|
| Critical | Core feature broken, game unplayable |
| Important | Feature degraded, workaround exists |
| Minor | Cosmetic issue, rare edge case |

## Domain Expertise

This agent has knowledge of:
- All existing project features
- Test suite locations and usage
- Common regression patterns
- Feature interdependencies

## Example Findings

**Critical Regression:**
> R1: After changes to orbital.js, the trajectory predictor test suite fails with "meanToTrue: NaN for e=0.5, M=3.14". The recent change to the Kepler solver broke the iteration.

**Important Regression:**
> R2: Camera pan now has a slight jitter when combined with rotation. The new frame timing in main.js may have introduced a race condition.

**Minor Regression:**
> R3: The GRID toggle label color is slightly different from other toggles. Not a functional issue.
