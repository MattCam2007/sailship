# Course Plotter and Launch Windows Feature Removal

**Date:** 2026-02-10
**Branch:** feature/adaptive-trajectory-resolution-v2

## Summary

Successfully removed Course Plotter and Launch Windows features from the UI and backend while preserving shared trajectory evaluation code used by autopilot and trajectory prediction systems.

## Files Modified

### UI Layer

1. **src/index.html** (lines 349-394 removed)
   - Removed Course Plotter section (SAILS controls, PLOT COURSE button, result display, APPLY COURSE/RESET buttons, worker count controls)
   - Removed Launch Windows section (FIND WINDOWS button, result display, worker count controls)

2. **src/css/main.css** (lines 1885-2146 removed)
   - Removed `.worker-control` and all worker control styles
   - Removed `.course-plotter-section` and all course plotter styles
   - Removed `.course-btn`, `.course-result`, `.course-settings`, `.course-row`, `.course-label`, `.course-value`, `.course-quality` styles
   - Removed `.apply-course-btn`, `.reset-course-btn`, `.course-action-buttons` styles
   - Removed `.course-sail-count` and related sail count picker styles

3. **src/js/ui/controls.js**
   - Removed imports: `computeOptimalCourse`, `getCachedOptimalCourse`, `applyComputedCourse`, `getCourseComputationState`, `isRefinementMode`, `clearOptimalCourseCache`, `computeLaunchWindows`, `getLaunchWindowState`
   - Removed function: `initCoursePlotter()` (lines 1418-1595)
   - Removed function: `displayCourseResult()` (lines 1602-1689)
   - Removed function: `initLaunchWindowFinder()` (lines 1694-1765)
   - Removed function: `displayLaunchWindowResults()` (lines 1782-1852)
   - Removed helper: `formatDays()` (lines 1770-1775)
   - Removed export: `updatePlotButtonText()` (lines 1320-1341)
   - Removed export: `getCoursePlotterSailCount()` (lines 1430-1432)
   - Removed variable: `coursePlotterSailCount` (line 1424)
   - Removed initialization calls from `setupControls()` (lines 250-251)

### Backend Layer

4. **src/js/core/navigation.js**
   - Removed imports: `solveCourse` from `course-solver.js`, `findLaunchWindows` from `launch-window.js`
   - Changed import: Now imports `evaluateCandidate` directly from `evaluate-trajectory.js` (shared utility)
   - Removed all course computation functions (~390 lines):
     - `computeOptimalCourse()`
     - `getCachedOptimalCourse()`
     - `clearOptimalCourseCache()`
     - `getCourseComputationState()`
     - `isRefinementMode()`
     - `getRefinementSeedSettings()`
     - `applyComputedCourse()`
     - `optimalCourseCache` object
   - Removed all launch window functions (~90 lines):
     - `computeLaunchWindows()`
     - `getCachedLaunchWindows()`
     - `clearLaunchWindowCache()`
     - `getLaunchWindowState()`
     - `launchWindowCache` object
   - Replaced with comment: "Course Plotter and Launch Windows features have been removed."

## Files NOT Deleted (Preserved for Other Features)

### Shared Backend Code

1. **src/js/lib/evaluate-trajectory.js**
   - **PRESERVED** - Contains `evaluateCandidate()` function used by:
     - Trajectory predictor (predicted path rendering)
     - Autopilot system (SOI navigation)
     - Worker pool for parallel trajectory computation
   - This module is SHARED and cannot be removed

2. **src/js/workers/eval-worker.js**
   - **PRESERVED** - Web Worker that calls `evaluateCandidate()` for parallel computation
   - Used by autopilot and future course planning features

3. **src/js/workers/worker-pool.js**
   - **PRESERVED** - Worker pool manager that dispatches `evaluateCandidate()` calls
   - Generic utility used by other systems

### Optional: Can Be Deleted Later

4. **src/js/lib/course-solver.js** (1250 lines)
   - **CAN BE DELETED** - Exports course solving algorithms:
     - `solveCourse()` - Main solver (not used)
     - `solveCourseSimple()` - Single-horizon solver (not used)
     - `strategicReconnaissance()` - Grid search (not used)
     - `nelderMeadSearch()` - Convergence algorithm (not used)
     - `scoutHorizons()` - Horizon ranking (not used)
     - `deploymentSweep()` - Deployment optimization (not used)
     - `coarseSweep()`, `fineSearch()`, `ultraFinePolish()` - Legacy search (not used)
   - **HOWEVER:** Also re-exports `evaluateCandidate`, `getInterceptThreshold`, `solveQuadraticCrossing` from `evaluate-trajectory.js`
   - **RECOMMENDATION:** Delete this file and update any lingering imports to use `evaluate-trajectory.js` directly

5. **src/js/lib/launch-window.js** (944 lines)
   - **CAN BE DELETED** - Entire launch window analysis module:
     - `findLaunchWindows()` - Main orchestrator (not used)
     - `scanLaunchWindows()` - Departure scanning (not used)
     - `groupIntoWindows()` - Window grouping (not used)
     - `verifyTopWindows()` - Window verification (not used)
     - `computeDepartureSchedule()` - Synodic scheduling (not used)
     - `estimateSynodicPeriod()` - Orbital period calculation (not used)
   - No other systems depend on this code

6. **src/js/lib/course-solver.test.js**
   - **CAN BE DELETED** - Test file for removed feature

7. **src/js/lib/launch-window.test.js**
   - **CAN BE DELETED** - Test file for removed feature

## Import Chain Analysis

### Before Removal
```
navigation.js → course-solver.js → evaluate-trajectory.js
              → launch-window.js → course-solver.js → evaluate-trajectory.js
controls.js → navigation.js → (all of above)
```

### After Removal
```
navigation.js → evaluate-trajectory.js (direct)
controls.js → navigation.js → evaluate-trajectory.js
workers/*.js → evaluate-trajectory.js (direct)
```

## Functionality Preserved

✅ **Trajectory Prediction** - `evaluateCandidate()` still available for predicted path rendering
✅ **Autopilot** - Orbital insertion and slingshot modes use shared trajectory evaluation
✅ **Encounter Markers** - Ghost planet rendering uses trajectory prediction (not course solver)
✅ **Navigation Data** - Closest approach calculation still functional

## Functionality Removed

❌ **Course Plotter** - Automatic sail angle computation
❌ **Launch Windows** - Departure date optimization
❌ **Course Refinement Mode** - Re-plotting with narrow search bounds
❌ **Transit State Tracking** - Applied course verification

## Testing Recommendations

1. Test trajectory prediction (PREDICTED PATH display option)
2. Test autopilot orbital insertion mode
3. Test autopilot gravity slingshot mode
4. Test encounter markers (ghost planets at crossings)
5. Test navigation data panel updates
6. Verify no console errors on page load
7. Verify AUTO tab displays correctly (only ENCOUNTER MODE section remains)

## Future Cleanup

Optional deletion of orphaned backend files:
```bash
rm src/js/lib/course-solver.js
rm src/js/lib/course-solver.test.js
rm src/js/lib/launch-window.js
rm src/js/lib/launch-window.test.js
```

**WARNING:** Before deleting `course-solver.js`, check if any other code imports `evaluateCandidate` from it. If so, update those imports to use `evaluate-trajectory.js` instead.

## Verification Steps

Run in browser console:
```javascript
// Verify evaluateCandidate is available
import('/js/lib/evaluate-trajectory.js').then(m => console.log('evaluateCandidate:', typeof m.evaluateCandidate))

// Verify trajectory prediction works
import('/js/lib/trajectory-predictor.test.js').then(m => m.runAllTests())
```

## Commit Message

```
Remove Course Plotter and Launch Windows features

Removed UI components and backend code for automatic course plotting
and launch window analysis. Preserved shared trajectory evaluation
code (evaluateCandidate) used by autopilot and trajectory prediction.

Modified:
- src/index.html: Removed Course Plotter and Launch Windows sections
- src/css/main.css: Removed course plotter and worker control styles
- src/js/ui/controls.js: Removed UI handlers and helper functions
- src/js/core/navigation.js: Removed computation logic, kept trajectory eval

Preserved:
- src/js/lib/evaluate-trajectory.js: Shared trajectory evaluation
- src/js/workers/*.js: Worker pool for parallel computation
```
