# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Browser-based solar system navigation game where players pilot a light sail ship between planets. Built with vanilla JavaScript (ES6 modules), HTML5 Canvas, and CSS3. No build system, no bundler, zero npm dependencies.

---

## Development Process

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

### Phase 1: Discovery

**Goal:** Understand the current state before proposing changes.

**Deliverable:** Feature Specification Document
**Location:** `[FEATURE_NAME]_SPEC.md` (root) or `reports/[feature]-spec-[DATE].md`

**Contents:**
1. **Existing Systems Analysis** - What code currently exists in this domain?
2. **Architecture Mapping** - File structure and dependencies
3. **Gap Analysis** - What's missing for the new feature?

**Template:**
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

## 3. Gap Analysis

### 3.1 Missing Capabilities
- [ ] ...

### 3.2 Required Changes
- [ ] ...

## 4. Open Questions
- [ ] ...
```

### Phase 2: Planning

**Goal:** Design the solution and break it into testable units.

**Deliverable:** Implementation Plan
**Location:** `reports/[feature]-implementation-plan-[DATE].md`

**Unit of Work Definition:**
Each unit must be:
- **Atomic:** Cannot be meaningfully subdivided
- **Testable:** Has clear pass/fail criteria
- **Independent:** Works without subsequent units
- **Reversible:** Can be rolled back cleanly

**Template:**
```markdown
# [Feature Name] Implementation Plan

**Date:** YYYY-MM-DD
**Status:** Draft | Review | Approved | In Progress | Complete

## 0. File Impact Summary

### Files to EDIT:
1. `path/to/file1.js` - Description of changes

### Files to CREATE:
1. `path/to/newfile.js` - Purpose

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

### 2.3 Key Algorithms
[Mathematical formulas, pseudocode, etc.]

## 3. Units of Work

### Unit 1: [Name]
**Description:** [What this unit accomplishes]
**Files:** [Files to modify/create]
**Acceptance Criteria:**
- [ ] Criterion 1
**Test Method:** [How to verify]

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

### Phase 3: Review (7 Perspectives)

**Goal:** Validate the plan from multiple perspectives before implementation.

**Deliverable:** Review Report
**Location:** `reports/[feature]-review-[DATE].md`

#### 1. Physics/Realism Review
- Are formulas mathematically correct?
- Are units consistent?
- Does it match real-world behavior?
- Are there numerical edge cases?

#### 2. Solar Sailing Expert Review
- Are any traditional spaceflight assumptions applied incorrectly?
- Thrust is continuous (from sunlight), not impulsive
- Transfer windows differ from chemical rockets
- Trajectories are spirals under constant thrust, not ballistic conic sections
- Deceleration and orbit capture are gradual, not braking burns
- Delta-v budgets and coast phases are chemical-rocket concepts
- Thrust scales with 1/r² and depends on sail attitude

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
- Does the module structure follow one-concept-per-file?

#### 7. Regression Risk Review
- What existing features could break from these changes?
- Which test suites are affected?
- Are there shared modules or state that could cause side effects?
- What manual verification is needed for adjacent features?

**Review Output Template:**
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
[Same structure]

## 3. Functionality
[Same structure]

## 4. Architecture
[Same structure]

## 5. Failure Modes
[Same structure]

## 6. Best Practices
### Compliance Summary
| Category | Status | Notes |
|----------|--------|-------|
| Imports | Compliant/Issues | ... |

### Violations
| ID | Severity | Category | Description | Fix |
|----|----------|----------|-------------|-----|
| BP1 | Important | ... | ... | ... |

## 7. Regression Risk
### Impact Analysis
- Files changed: [list]
- Features affected: [list]

### Risk Assessment
| Existing Feature | Risk Level | Rationale |
|------------------|------------|-----------|
| ... | Low/Med/High | ... |

## 8. Summary
### Confidence Rating: X/10

### Critical Issues (Must Fix)
1. ...

### Important Issues (Should Fix)
1. ...

### Verdict
[ ] Approved
[ ] Approved with conditions
[ ] Requires revision
```

### Phase 4: Implementation

**Goal:** Execute units of work with verification at each step.

**Process:**
```
For each Unit:
  1. Mark as "In Progress"
  2. Implement the changes
  3. Run acceptance criteria tests
  4. Best practices check (best-practices agent)
  5. Regression check (regression-checker agent)
  6. If all checks pass: Commit and mark "Complete"
  7. If checks fail: Fix issues and return to step 3
  8. Proceed to next unit
```

**Commit Message Format:**
```
[Unit N] Brief description of unit

- Bullet point of specific changes
- Another change

Files: file1.js, file2.js
```

**Git Workflow:**
```bash
# Start feature branch
git checkout -b feature/[feature-name]

# Per unit
git add [files]
git commit -m "[Unit N] Description"

# After all units complete
git push origin feature/[feature-name]
```

### Phase 5: Verification

**Goal:** Ensure the complete feature works as intended.

**Verification Steps:**
1. **Integration Testing** - Run full application, test all new functionality
2. **Edge Case Validation** - Verify all identified edge cases from review
3. **Full Regression Check** - Invoke regression-checker agent
4. **Best Practices Audit** - Invoke best-practices agent
5. **User Acceptance** - Does it meet original requirements?

**Agent Verification Matrix:**
| Agent | Phase 5 Role |
|-------|-------------|
| `regression-checker` | Full regression suite across all modified and adjacent features |
| `best-practices` | Final compliance audit of all code changes |
| `functional-tester` | Verify feature achieves stated goals end-to-end |
| `failure-analyst` | Validate identified edge cases are handled |
| `physicist` | Confirm physics calculations produce correct results |
| `solar-sailing-expert` | Verify sail-specific behavior matches expectations |
| `architect` | Confirm final code structure follows patterns |

**Verification Report Template:**
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

## Verdict
[ ] Feature Complete
[ ] Requires Additional Work
```

---

## Agentic Development Framework

This project uses a modular framework of skills and subagents for structured development.

### Skills

Located in `.claude/skills/[name]/SKILL.md`:

| Skill | Purpose |
|-------|---------|
| `/discovery [feature]` | Analyze existing systems, map architecture, identify gaps → Feature Spec |
| `/planning [feature]` | Design solution, break into atomic units, assess risks → Implementation Plan |
| `/review [feature]` | Orchestrate 7-perspective review → Review Report |
| `/implement [feature] [unit]` | Execute a single atomic unit of work |
| `/verify [feature]` | Integration testing, edge case validation → Verification Report |

### Subagents

Located in `.claude/agents/[name].md`:

**Review Perspectives (Phase 3):**
| Agent | Focus |
|-------|-------|
| `physicist` | Physics/realism validation (formulas, units, accuracy) |
| `solar-sailing-expert` | Solar sail propulsion assumptions (continuous thrust, not chemical rocket heuristics) |
| `functional-tester` | Functionality verification (code paths, test coverage) |
| `architect` | Architecture evaluation (patterns, separation, extensibility) |
| `failure-analyst` | Failure modes (edge cases, instability, performance) |
| `best-practices` | Code standards and conventions compliance |
| `regression-checker` | Verify changes don't break existing functionality |

### Example Workflow

```
/discovery autopilot → reports/autopilot-spec-2026-01-29.md
/planning autopilot → reports/autopilot-implementation-plan-2026-01-29.md
/review autopilot → reports/autopilot-review-2026-01-29.md
/implement autopilot all → code changes committed
/verify autopilot → reports/autopilot-verification-2026-01-29.md
```

### Quick Reference

**File Naming Convention:**
| Document | Location |
|----------|----------|
| Feature Spec | `[FEATURE]_SPEC.md` or `reports/[feature]-spec-[DATE].md` |
| Implementation Plan | `reports/[feature]-implementation-plan-[DATE].md` |
| Review Report | `reports/[feature]-review-[DATE].md` |
| Verification Report | `reports/[feature]-verification-[DATE].md` |

**Severity Levels:**
| Level | Meaning | Action |
|-------|---------|--------|
| Critical | Blocks implementation or causes major failure | Must fix before proceeding |
| Important | Significant issue but workaround exists | Should fix during implementation |
| Nice-to-have | Improvement opportunity | Fix if time permits |

**Confidence Rating Scale:**
| Rating | Meaning |
|--------|---------|
| 9-10 | Ready to implement as-is |
| 7-8 | Minor issues to address |
| 5-6 | Significant concerns, needs revision |
| 3-4 | Major problems, requires rethink |
| 1-2 | Fundamentally flawed |

---

## Running the Project

```bash
cd src && python3 -m http.server 8080
# Open http://localhost:8080
```

**Note**: `npx serve` has issues with clean URLs. Use Python's http.server.

## Build/Lint/Test

No build tooling exists. This is a vanilla JS project that runs directly in browser with no compilation, linting, or test framework configured.

## Architecture

```
src/js/
├── main.js             # Entry point, game loop
├── core/               # Game logic
│   ├── camera.js       # 3D projection, view state
│   ├── gameState.js    # Time, zoom, display options
│   ├── navigation.js   # Destination/distance tracking
│   └── shipPhysics.js  # Per-frame physics updates
├── data/               # Game data (designed for external API integration)
│   ├── celestialBodies.js  # Planets, moons, asteroids
│   ├── ships.js        # Player and NPC vessels with orbital elements
│   └── stars/          # Star catalog data
│       └── bsc5-processed.json  # Yale Bright Star Catalog (5,080 stars)
├── lib/                # Utility libraries
│   ├── orbital.js      # Orbital mechanics calculations
│   ├── orbital-maneuvers.js  # Sail thrust, Gauss variational equations
│   ├── trajectory-predictor.js  # Predicted trajectory with continuous thrust
│   ├── intersectionDetector.js  # Orbit crossing detection for trajectory planning
│   └── starfield.js    # Background star rendering with date-accurate precession
└── ui/                 # Rendering and interaction
    ├── controls.js     # Input handlers (keyboard, mouse, buttons)
    ├── renderer.js     # Canvas drawing functions
    └── uiUpdater.js    # DOM panel updates
```

### Game Loop Pattern (`main.js`)

```javascript
function gameLoop() {
    updatePositions();  // Physics/state
    render();           // Canvas drawing
    updateUI();         // DOM updates
    requestAnimationFrame(gameLoop);
}
```

### Dependency Flow

Avoid circular dependencies: `data/ -> core/ -> ui/`

### Physics System

Ship exists on actual Keplerian orbits. Solar sail thrust modifies orbit using Gauss's variational equations. Position derived from orbital elements, not path interpolation.

- Solar pressure: 4.56e-6 N/m² at 1 AU, scales with 1/r²
- Default sail: 1 km² area, 90% reflectivity
- Typical acceleration: ~0.5 mm/s² (~0.00005 g)

## Code Style

### Imports

**Always use `.js` extensions** in import paths. Use named exports, not default exports.

```javascript
// Good
import { camera, project3D } from '../core/camera.js';

// Bad
import camera from '../core/camera';
```

### Naming Conventions

| Element | Convention | Examples |
|---------|------------|----------|
| Functions | camelCase with verb prefix | `getPlayerShip()`, `updateCelestialPositions()` |
| State objects | camelCase | `navState`, `camera` |
| Constants (primitives) | UPPER_SNAKE | `MAX_ZOOM`, `DEFAULT_SCALE` |
| Files | camelCase | `gameState.js`, `celestialBodies.js` |
| CSS classes | kebab-case | `.nav-panel`, `.burn-button` |
| DOM IDs | camelCase | `navCanvas`, `pathPreview` |

### Module Structure

One concept per file. Export state objects and functions, not classes.

## Display Options

The UI includes toggles for various display elements:

| Option | Description |
|--------|-------------|
| STAR MAP | Background starfield with 5,080 stars, date-accurate precession (500-3500 AD) |
| ORBITAL PATHS | Show orbit ellipses for planets and ships (Keplerian) |
| LABELS | Show names for celestial bodies and ships |
| FLIGHT PATH | Show navigation waypoints to destination |
| PREDICTED PATH | Show where ship will go with current thrust (spiral) |
| ENCOUNTER MARKERS | Show ghost planets at orbital crossing points (trajectory planning) |
| GRID | Show distance reference grid |

The **Predicted Path** shows the actual trajectory accounting for continuous sail thrust, while **Orbital Paths** shows the instantaneous Keplerian orbit (where ship would go if thrust stopped).

### Encounter Markers (Orbit Intersection Feature)

**Encounter Markers** are ghost planets displayed at orbital path crossings. When your predicted trajectory crosses a planet's orbital radius, a semi-transparent ghost planet appears showing where that planet will actually be at the crossing time.

**Purpose**: Visual trajectory planning. Adjust sail settings and watch ghost positions shift in time as your orbit crossing timing changes.

**How it works**:
- Detects when trajectory crosses each planet's orbital radius (semi-major axis)
- Shows planet's actual position at that crossing time with time offset label
- Example: "VENUS +221d 4h" means Venus will be at that position 221 days from now
- "CLOSE" indicator appears when planet is near trajectory at crossing time (good intercept)
- **Tier 1 ghosts** (0-45°): Full ghost planet circle when planet is within 45° of crossing point
- Ghosts fade smoothly from full opacity (< 22.5°) to faint (45°)
- **Tier 2 phase indicators** (45-90°): When planet is 45-90° from crossing point, a directional chevron appears at the crossing point (not at the planet) with a label showing phase gap and estimated orbits to close it (e.g., "MARS 63° AHEAD ~2 orbits")
- Beyond 90°: No indicator shown (fundamentally different transfer)

**Usage**:
1. Enable "ENCOUNTER MARKERS" toggle (requires "ORBITAL PATHS" also enabled)
2. Adjust sail yaw/pitch/deployment
3. Watch ghost positions update in real-time
4. Fine-tune for intercepts when ghost shows "CLOSE"
5. If ghost disappears, look for Tier 2 chevron showing direction to adjust

**Technical details**:
- One ghost per orbital crossing (if you cross Earth twice, you see 2 Earth ghosts)
- Uses linear interpolation for exact crossing time calculation
- Moon positions automatically transformed from parent-relative to heliocentric coordinates
- Performance: <10ms detection for typical 200-point trajectory
- Tier 2 orbit estimate uses mean motion difference between ship's crossing radius and target orbit

### Star Map (Background Starfield)

**Star Map** renders a date-accurate background starfield using the Yale Bright Star Catalog (BSC5). The starfield provides atmospheric depth and astronomical accuracy.

**Features**:
- 5,080 stars (magnitude ≤ 6.0, naked-eye visibility)
- Realistic star colors mapped from B-V color index (blue → white → yellow → red)
- Brightness scaling from visual magnitude (brighter stars are larger/more visible)
- Date-accurate precession (500-3500 AD using IAU 1976 formula)
- Fixed background effect (stars rotate with camera but don't translate with panning)

**How it works**:
- Stars use equatorial coordinates (RA/Dec) converted to ecliptic frame
- IAU precession formula accounts for Earth's axial wobble (~50 arcsec/year)
- Only visible hemisphere rendered (back-face culling for performance)
- Stars update as simulation time advances to show precession over centuries

**Usage**:
1. Toggle "STAR MAP" in Display Options
2. Stars appear as subtle colored points in background
3. Brighter stars (Sirius, Vega, etc.) appear larger with subtle glow

**Technical details**:
- Data source: Yale Bright Star Catalog (BSC5), processed to 275KB JSON
- Coordinate transform: Equatorial (RA/Dec J2000) → Ecliptic (XYZ)
- Projection: Custom skybox projection (rotation only, no camera position offset)
- Performance: ~5,000 stars rendered at 60 FPS with view frustum culling
- Date range: Stars support 500-3500 AD (IAU 1976 precession)

## UI Components

### Expandable Panels
Left panel sections can be collapsed/expanded by clicking their headers. Panel state persists across sessions via localStorage.

### Tab Groups
The right panel uses a tab system (SAIL/NAV) for organizing controls and data. Tab state persists across sessions.

### Trajectory Configuration
The predicted trajectory duration can be adjusted from 30 days to 5 years (1825 days). Use the slider or preset buttons (60d, 6mo, 1yr, 2yr, 3yr, 5yr) for quick selection. The RESET button returns to default (60 days). Extended range supports outer planet transfers and course solver multi-horizon search.

## Keyboard Shortcuts

### Sail Controls (Legacy)
- `[` / `]` - Adjust sail yaw angle ±5°
- `-` / `=` - Adjust deployment ±10%
- `{` / `}` - Adjust pitch angle ±5°

### Fine-Tune Sail Controls (Accessibility)
For precise orbital insertions and users who need fine motor control:

**Select Control:**
- `1` - Select DEPLOYMENT
- `2` - Select YAW
- `3` - Select PITCH

**Adjust Selected Control:**
- `↑` / `↓` - Increase/decrease selected control

**Resolution Modes (press `F` to cycle):**
| Mode | Angles | Deployment |
|------|--------|------------|
| COARSE | ±10° | ±25% |
| NORMAL | ±5° | ±10% |
| FINE | ±1° | ±1% |
| ULTRA | ±0.1° | ±0.1% |
| UBER | ±0.01° | ±0.01% |

The selected control is highlighted in the SAIL panel. Click control rows or the resolution indicator to change settings with mouse.

### Camera Controls
- `Q` / `E` - Rotate view
- `W` / `S` - Tilt view
- `R` - Reset view
- Left-click drag - Pan camera
- Right-click drag - Rotate camera
- Mouse wheel - Zoom

### Navigation
- `A` - Toggle autopilot
- `Ctrl+1` / `Cmd+1` - Switch to SAIL tab
- `Ctrl+2` / `Cmd+2` - Switch to NAV tab

### Cheat Codes (requires sails at 0% deployment)
- `,` / `.` - Nudge ship backward/forward 1 day along orbit
- `<` / `>` - Nudge ship backward/forward 10 days along orbit

## Console Tests

Run test suites in browser console. The path depends on your environment:
- **localhost:8080** (via `cd src && python3 -m http.server 8080`): Use `/js/lib/...`
- **GitHub Pages** (mattcam2007.github.io): Use `/src/js/lib/...`

```javascript
// First, determine the correct base path for your environment
const BASE = window.location.hostname.includes('github.io') ? '/src' : '';

// Trajectory predictor tests
import(`${BASE}/js/lib/trajectory-predictor.test.js`).then(m => m.runAllTests())

// Intersection detector tests - CROSSING DETECTION (primary algorithm)
import(`${BASE}/js/lib/intersectionDetector.crossing.test.js`).then(m => m.runAllTests())

// Intersection detector edge cases (flickering bug tests)
import(`${BASE}/js/lib/intersectionDetector.edge-cases.test.js`).then(m => m.runAllTests())

// Intersection detector tests - LEGACY (old closest approach algorithm)
import(`${BASE}/js/lib/intersectionDetector.test.js`).then(m => m.runAllTests())

// Orbital mechanics tests
import(`${BASE}/js/lib/orbital.test.js`).then(m => m.runAllTests())

// Orbital maneuvers tests (thrust application)
import(`${BASE}/js/lib/orbital-maneuvers.test.js`).then(m => m.runAllTests())

// Starfield tests (star catalog, precession, coordinate transforms)
import(`${BASE}/js/lib/starfield.test.js`).then(m => m.runAllTests())
```
