# UI Overhaul Implementation Review

**Date:** 2026-01-20
**Plan Version:** reports/ui-overhaul-implementation-plan-2026-01-20.md
**Reviewer:** Claude (Automated)

---

## 1. Physics/Realism Review

### Findings

The UI overhaul is primarily a presentation-layer change. The only physics-adjacent changes involve trajectory prediction duration.

| Aspect | Assessment |
|--------|------------|
| Trajectory duration extension | Sound - longer predictions useful for planning |
| Steps scaling formula | `min(300, max(100, duration * 2.5))` is reasonable |
| SOI truncation behavior | Preserved - correct to stop at SOI boundaries |
| Max heliocentric distance | Unchanged at 10 AU - appropriate |

### Concerns

| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| P1 | Nice-to-have | Longer trajectories (730 days) may accumulate numerical error | Consider adding accuracy warning for >1 year predictions |
| P2 | Nice-to-have | Steps capped at 300 may undersample 2-year trajectories | Consider `duration * 0.5` as minimum step count |

---

## 2. Functionality Review

### Findings

| Feature | Status | Notes |
|---------|--------|-------|
| Trajectory configuration | Well-defined | Clear state management |
| Expandable panels | Well-defined | localStorage persistence good |
| Tab system | Well-defined | Three-tab structure appropriate |
| Visual enhancements | Moderately defined | Some specifics TBD during implementation |

### Concerns

| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| F1 | Important | Unit 11 (HTML restructure) may break existing DOM queries | Audit all `getElementById` calls before restructure |
| F2 | Important | Tab panel IDs must match pattern `${tabId}Panel` exactly | Document ID convention clearly |
| F3 | Important | Missing: uiUpdater.js may need updates for new DOM structure | Add to Unit 11 or create separate unit |
| F4 | Nice-to-have | No keyboard shortcut for tab switching | Consider adding Ctrl+1/2/3 |
| F5 | Nice-to-have | No keyboard shortcut for panel expand/collapse | Consider adding shortcuts |

---

## 3. Architecture Review

### Findings

| Aspect | Assessment |
|--------|------------|
| New file: ui-components.js | Appropriate - reusable components belong in separate module |
| State in gameState.js | Consistent with existing pattern |
| localStorage usage | Appropriate for UI preferences |
| Dependency flow | Correct - ui-components.js has no dependencies on game logic |

### Concerns

| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| A1 | Important | ui-components.js should be imported before controls.js uses it | Verify import order in controls.js |
| A2 | Nice-to-have | Consider exporting formatDuration from a utility module | Centralize formatting functions |
| A3 | Nice-to-have | Panel/tab state could share localStorage key structure | Use consistent `ui.panels.{id}` and `ui.tabs.{id}` keys |
| A4 | Nice-to-have | Color manipulation (lighten/darken) not defined | Add helper functions or use CSS filters |

---

## 4. Failure Modes Review

### Findings

| Mode | Risk | Notes |
|------|------|-------|
| localStorage unavailable | Low | Gracefully handled with try/catch |
| Performance degradation | Medium | Enhanced rendering adds GPU load |
| DOM structure mismatch | Medium | Restructuring could break queries |
| Animation jank | Low | CSS transitions typically performant |

### Concerns

| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| FM1 | Critical | Existing uiUpdater.js references DOM IDs that will change | Audit and update uiUpdater.js in parallel with Unit 11 |
| FM2 | Important | Radial gradients expensive on large circles | Limit gradient usage to bodies <50px radius |
| FM3 | Important | shadowBlur performance varies by browser | Profile on Chrome and Firefox, remove if slow |
| FM4 | Important | Tab content may flash during load before JS initializes | Add CSS to hide inactive tabs by default |
| FM5 | Nice-to-have | Long trajectory (730 days) prediction may cause frame skip | Consider async/chunked prediction for >365 days |

---

## 5. Summary

### Confidence Rating: 7.5/10

The plan is well-structured with clear atomic units. Main concerns are around DOM restructuring impacts and performance of enhanced rendering.

### Critical Issues (Must Fix Before Implementation)

1. **FM1:** Audit `uiUpdater.js` for DOM ID dependencies before restructuring. This is essential to prevent runtime errors.

### Important Issues (Should Fix During Implementation)

1. **F1:** Create a comprehensive list of all DOM ID references before Unit 11
2. **F3:** Add uiUpdater.js updates to the plan (new Unit 11b or integrate into Unit 11)
3. **FM2/FM3:** Add performance checks after Units 14-15, with simple fallbacks ready
4. **FM4:** Add default CSS to hide `.tab-panel:not(.active)` to prevent flash

### Nice-to-Have Improvements

1. Keyboard shortcuts for tabs and panel collapse
2. Async trajectory prediction for very long durations
3. Centralized formatting utilities
4. Accuracy warning for >1 year predictions

### Recommended Next Steps

1. **Before starting:** Run a quick audit of uiUpdater.js to identify all DOM queries
2. **Modify plan:** Add Unit 11b for uiUpdater.js updates
3. **Add to Unit 12:** Include `.tab-panel { display: none; }` as default
4. **Proceed with Phase A:** Low risk, provides immediate user value

### Verdict

- [ ] Approved
- [x] Approved with conditions (address FM1 before Phase C)
- [ ] Requires revision

---

## Appendix: DOM ID Audit Required

Before Unit 11, verify these files for DOM queries:

1. `src/js/ui/uiUpdater.js` - All `getElementById` and `querySelector` calls
2. `src/js/ui/controls.js` - All ID references
3. `src/js/main.js` - Canvas and container references

Create mapping: `old ID -> new ID/location` for any changes.
