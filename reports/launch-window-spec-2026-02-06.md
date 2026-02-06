# Launch Window Analysis Specification

## 1. Executive Summary

A launch window analyzer that lets the player furl sails (0% deployment), coast on their current Keplerian orbit, and find the ideal departure date to begin a transfer to a target planet. Answers: "If I coast for X days, how much total trip time does it save?" Uses the E+B hybrid approach: fast strategy sweep for window identification, then deeper evaluation of top windows.

## 1.1 Estimated File Impact

### Files to EDIT:
- `src/js/lib/course-solver.js` - Parameterize `evaluateCandidate()` to accept optional start time
- `src/js/core/navigation.js` - Add `computeLaunchWindows()` orchestrator
- `src/js/ui/controls.js` - Add FIND WINDOWS button handler
- `src/js/ui/uiUpdater.js` - Cache new DOM elements, display results
- `src/index.html` - Add launch window UI section in AUTO tab

### Files to CREATE:
- `src/js/lib/launch-window.js` - Core scanning and verification logic
- `src/js/lib/launch-window.test.js` - Console test suite

## 2. Current State Analysis

### 2.1 Existing Systems
| System | Location | Purpose |
|--------|----------|---------|
| Course Solver | `lib/course-solver.js` | Multi-horizon sail settings optimizer (30-45s) |
| evaluateCandidate() | `lib/course-solver.js:408` | Single trajectory evaluation (~2-3ms) |
| Navigation Plan | `core/navigation.js:413` | Quick 10-strategy comparison (< 1s) |
| simulateWithStrategy() | `core/navigation.js:300` | Single strategy simulation (private) |
| Trajectory Predictor | `lib/trajectory-predictor.js` | Predicted path with continuous thrust |
| NAV_STRATEGIES | `core/navigation.js:276` | 10 predefined sail configs |
| Course Plotter UI | `ui/controls.js:1108` | PLOT COURSE button + progress display |
| Julian Date System | `core/gameState.js` | Game time as Julian dates |

### 2.2 Data Flow
```
User clicks FIND WINDOWS
  → navigation.computeLaunchWindows()
    → launch-window.scanLaunchWindows()
      → For each departure date:
        → Coast: same elements, advance Julian date
        → course-solver.evaluateCandidate() x N strategies
      → Return ranked departure windows
    → launch-window.verifyTopWindows()
      → For top 3 windows:
        → course-solver coarse sweep (91-point grid)
      → Return verified windows with exact sail settings
    → Display in UI
```

### 2.3 Relevant Code
- `course-solver.js:408` - `evaluateCandidate(yawDeg, pitchDeg, ship, target, options)` -- hardcodes `getJulianDate()` at line 433
- `course-solver.js:699` - `coarseSweep(ship, target, options, onProgress)` -- 91-point grid sweep
- `navigation.js:276` - `NAV_STRATEGIES` -- 10 predefined sail configurations
- `navigation.js:300` - `simulateWithStrategy()` -- private, reads module state
- `navigation.js:765` - `computeOptimalCourse()` -- async pattern with progress, cache, concurrent guard

## 3. Gap Analysis

### 3.1 Missing Capabilities
- [x] No way to evaluate trajectories from future departure dates (evaluateCandidate hardcodes current time)
- [x] No launch window scanning logic
- [x] No UI for launch window results
- [x] No SOI guard for launch window analysis

### 3.2 Required Changes
- [x] Parameterize `evaluateCandidate()` start time (1-line change)
- [x] New `launch-window.js` module with scan + verify functions
- [x] Navigation orchestrator following `computeOptimalCourse()` pattern
- [x] UI button, progress display, results display

## 4. Open Questions
- [x] Resolved: Use E+B hybrid (fast scan + deep verify of top windows)
- [x] Resolved: Place in AUTO tab alongside COURSE PLOTTER
- [x] Resolved: Manual trigger button (like PLOT COURSE)
- [x] Resolved: 0% deployment coast only (no partial deployment variants)
