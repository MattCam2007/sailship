# UI Overhaul Feature Specification

**Date:** 2026-01-20
**Status:** Discovery Phase

---

## 1. Executive Summary

Transform the current functional but dense UI into a sleek, Expanse-inspired flight interface. Add configurable trajectory prediction controls, implement expandable/collapsible panels to reduce clutter, and enhance the solar system visualization quality. The goal is a professional, immersive experience that supports the core gameplay loop: observe, adjust, observe, adjust.

---

## 2. Current State Analysis

### 2.1 Existing UI Systems

| System | Location | Purpose | Issues |
|--------|----------|---------|--------|
| Left Panel | `index.html:29-84` | Zoom, Speed, Orbit, Display | 200px wide, always expanded, cluttered |
| Right Panel | `index.html:104-229` | Sail, Autopilot, Nav Data, Nav Computer | 220px wide, always expanded, very dense |
| Canvas Overlay | `index.html:88-101` | Scale, View, Origin, Coords | Functional but basic |
| Header Bar | `index.html:10-26` | System title, status lights | Good, minor polish needed |
| Bottom Bar | `index.html:232-235` | System info, time | Functional |

### 2.2 Trajectory Prediction (Current)

| Parameter | Value | Location | Configurable? |
|-----------|-------|----------|---------------|
| Duration | 60 days | `trajectory-predictor.js:17`, `renderer.js:406` | No - hardcoded |
| Steps | 200/150 | `trajectory-predictor.js:18`, `renderer.js:407` | No - hardcoded |
| SOI Truncation | Yes | `trajectory-predictor.js:134-152` | N/A (correct behavior) |
| Max Distance | 10 AU | `trajectory-predictor.js:22` | No - hardcoded |
| Cache TTL | 100ms | `trajectory-predictor.js:20` | No - hardcoded |

**User Pain Point:** 60 days is too short. User wants to see trajectory evolve over longer periods to plan maneuvers.

### 2.3 Display Options (Current)

```javascript
// config.js:167-173
DEFAULT_DISPLAY_OPTIONS = {
    showOrbits: true,
    showLabels: true,
    showTrajectory: true,
    showGrid: true,
    showPredictedTrajectory: true,
};
```

These are simple on/off toggles. No configuration for visual appearance or behavior.

### 2.4 CSS Architecture

| Aspect | Current Approach | Notes |
|--------|------------------|-------|
| Colors | CSS variables in `:root` | Good pattern to extend |
| Typography | Orbitron + Share Tech Mono | Sci-fi appropriate |
| Layout | Fixed sidebars + flex canvas | Works, but rigid |
| Animations | Keyframes for pulse/blink | Minimal, could enhance |
| Responsiveness | None | Desktop only (acceptable) |

### 2.5 Rendering System

| Feature | Implementation | Quality |
|---------|----------------|---------|
| Bodies | Filled circles with glow | Basic |
| Orbits | Stroke ellipses | Functional |
| Predicted Path | Alpha-gradient segments | Good |
| Grid | Simple lines | Basic |
| Labels | Text overlay | Functional |
| SOI Boundaries | Not visualized | Missing |

---

## 3. Requirements Analysis

### 3.1 User-Stated Requirements

1. **Trajectory Configuration Panel**
   - Configurable prediction duration (30 days to 2 years+)
   - Visual feedback on prediction length
   - Maintains SOI truncation behavior

2. **UI Decluttering**
   - Expandable/collapsible sections
   - Tab-based organization
   - "The Expanse" inspired aesthetic

3. **Visual Enhancements**
   - "Better" / "higher quality" graphics
   - Leverage pan/tilt/zoom capability
   - More professional appearance

4. **Workflow Support**
   - Watch approach → adjust → watch → adjust cycle
   - Controls for fine-grained adjustments
   - Clear visual feedback

### 3.2 Inferred Requirements

| Requirement | Rationale |
|-------------|-----------|
| Smooth animations | Professional feel, matches Expanse aesthetic |
| Consistent interaction patterns | Expandable sections should work identically |
| Performance preservation | Don't sacrifice frame rate for visuals |
| Keyboard shortcuts preserved | Power users rely on these |
| State persistence | Remember which panels are expanded |

### 3.3 Constraints

| Constraint | Impact |
|------------|--------|
| No build system | CSS/JS must work directly in browser |
| No npm dependencies | Can't use React, Vue, etc. |
| Vanilla JS only | All interactions hand-coded |
| Existing architecture | Must integrate, not replace |

---

## 4. Gap Analysis

### 4.1 Missing Capabilities

- [ ] Trajectory duration slider/input
- [ ] Expandable panel component
- [ ] Tab component
- [ ] Enhanced body rendering (gradients, better glow)
- [ ] SOI boundary visualization
- [ ] Panel state persistence
- [ ] Animation system for UI transitions
- [ ] Configurable display options (not just on/off)

### 4.2 Required Changes

| Component | Change Type | Complexity |
|-----------|-------------|------------|
| trajectory-predictor.js | Expose duration as parameter | Low |
| renderer.js | Pass configurable duration | Low |
| gameState.js | Add trajectory config state | Low |
| index.html | Restructure panels | Medium |
| main.css | New panel styles, animations | Medium |
| controls.js | New interaction handlers | Medium |
| New: ui-components.js | Reusable expandable/tab logic | Medium |
| renderer.js | Enhanced graphics | Medium-High |

---

## 5. Proposed Solution Architecture

### 5.1 UI Structure Redesign

```
┌─────────────────────────────────────────────────────────────────────────┐
│  HEADER BAR (unchanged structure, visual polish)                        │
├─────────────┬───────────────────────────────────────────────┬───────────┤
│ LEFT PANEL  │                                               │ RIGHT     │
│ (collapsible│           CANVAS                              │ PANEL     │
│  sections)  │                                               │ (tabbed)  │
│             │                                               │           │
│ [▼] ZOOM    │     Enhanced rendering with:                  │ [SAIL]    │
│     ...     │     - Better gradients                        │ [NAV]     │
│             │     - SOI boundaries                          │ [AUTO]    │
│ [►] SPEED   │     - Improved trajectory vis                 │           │
│             │     - Better label placement                  │ Content   │
│ [▼] DISPLAY │                                               │ for       │
│     ...     │                                               │ active    │
│             │                                               │ tab       │
│ [►] PREDICT │                                               │           │
│     (NEW)   │                                               │           │
├─────────────┴───────────────────────────────────────────────┴───────────┤
│  BOTTOM BAR (unchanged)                                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Component Hierarchy

```
UI Components
├── ExpandablePanel
│   ├── header (clickable)
│   ├── indicator (▼/►)
│   └── content (animated show/hide)
│
├── TabGroup
│   ├── tab-bar
│   │   └── tab-buttons
│   └── tab-content
│       └── panels
│
└── ConfigSlider (for trajectory duration, etc.)
    ├── label
    ├── value display
    └── range input
```

### 5.3 State Management

```javascript
// New state in gameState.js or new ui-state.js
export const uiState = {
    panels: {
        zoom: { expanded: true },
        speed: { expanded: false },
        display: { expanded: true },
        predict: { expanded: true },
    },
    rightTab: 'sail', // 'sail' | 'nav' | 'auto'
};

export const trajectoryConfig = {
    durationDays: 60,     // User configurable: 30 - 730 (2 years)
    steps: 200,           // Could make configurable
    showEndMarker: true,
    fadeAlpha: true,
};
```

### 5.4 Visual Enhancement Approach

| Element | Current | Enhanced |
|---------|---------|----------|
| Sun | Yellow circle + glow | Radial gradient + corona |
| Planets | Solid color circles | Slight gradient + shadow |
| Orbits | Single stroke | Subtle gradient along path |
| Grid | Simple lines | Fade at edges, subtle glow |
| Labels | Plain text | Background pill, better placement |
| Predicted Path | Alpha segments | Particle trail effect (optional) |
| SOI Boundaries | None | Dashed circles with planet color |

---

## 6. Open Questions

### 6.1 Design Decisions

- [ ] **Q1:** Should expanded/collapsed state persist across sessions (localStorage)?
- [ ] **Q2:** Tab placement on right panel - top or side?
- [ ] **Q3:** Maximum trajectory duration - 1 year? 2 years? Unlimited?
- [ ] **Q4:** Should trajectory steps scale with duration or stay fixed?

### 6.2 Technical Questions

- [ ] **Q5:** Canvas rendering budget - how much visual enhancement before performance degrades?
- [ ] **Q6:** Animation approach - CSS transitions vs JS animations?
- [ ] **Q7:** Touch support - needed? (Currently desktop-focused)

---

## 7. Reference: The Expanse UI Style

Key characteristics from The Expanse interfaces:

1. **Color Palette**
   - Deep blacks and dark grays
   - Accent colors: cyan, orange, red for warnings
   - Minimal white, high contrast elements

2. **Typography**
   - Sans-serif, often condensed
   - All caps for labels
   - Tabular numerics

3. **Elements**
   - Thin borders, often with corner accents
   - Subtle gradients
   - Pulsing indicators for active states
   - Holographic transparency effects

4. **Motion**
   - Smooth transitions
   - Slide animations
   - Fade in/out for state changes
   - Subtle continuous animations (scanning lines, etc.)

---

## 8. Success Criteria

| Criterion | Measure |
|-----------|---------|
| Trajectory configurable | Duration adjustable 30-730 days |
| Panels collapsible | All left panel sections collapse/expand |
| Right panel tabbed | 3 tabs with smooth transitions |
| Visual quality improved | Subjective but measurable improvement |
| Performance maintained | 60 FPS on moderate hardware |
| No regressions | All existing features work |
| Keyboard shortcuts work | All documented shortcuts still function |

---

## 9. Next Steps

1. **Create Implementation Plan** - Break into atomic units
2. **Review Plan** - Four-perspective analysis
3. **Implement** - Unit by unit with verification
4. **Verify** - Full integration testing

---

## Appendix A: File Inventory

### Files to Modify

| File | Changes |
|------|---------|
| `src/index.html` | Panel structure, new controls |
| `src/css/main.css` | New styles, animations |
| `src/js/config.js` | Trajectory config defaults |
| `src/js/core/gameState.js` | UI state, trajectory config |
| `src/js/ui/controls.js` | New interaction handlers |
| `src/js/ui/renderer.js` | Enhanced graphics, configurable trajectory |
| `src/js/lib/trajectory-predictor.js` | Accept duration parameter (already does) |

### Files to Create

| File | Purpose |
|------|---------|
| `src/js/ui/ui-components.js` | Expandable panel, tab logic |
| `src/js/ui/ui-state.js` | UI state management (optional, could be in gameState) |

### Files Unchanged

| File | Reason |
|------|--------|
| `src/js/main.js` | Core loop unchanged |
| `src/js/lib/orbital.js` | Physics unchanged |
| `src/js/lib/orbital-maneuvers.js` | Physics unchanged |
| `src/js/data/*` | Data unchanged |
