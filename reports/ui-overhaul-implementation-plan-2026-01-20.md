# UI Overhaul Implementation Plan

**Date:** 2026-01-20
**Status:** Draft - Pending Review
**Spec:** UI_OVERHAUL_SPEC.md

---

## 1. Problem Statement

### 1.1 Description

The current UI is functional but cluttered, with all controls always visible regardless of relevance. The trajectory prediction is hardcoded to 60 days which is insufficient for long-term planning. The visual style, while adequate, lacks the polish and immersion of professional flight interfaces like those in The Expanse.

### 1.2 Root Cause

- UI was built incrementally without a cohesive design system
- Display options were implemented as simple toggles without configuration
- No component abstraction for common UI patterns
- Trajectory predictor duration was set for testing, not gameplay

### 1.3 Constraints

- No build tools or npm dependencies
- Must maintain 60 FPS performance
- Cannot break existing functionality
- Must preserve keyboard shortcuts

---

## 2. Solution Architecture

### 2.1 High-Level Design

```
Phase A: Foundation (Units 1-4)
├── Trajectory configuration state
├── Trajectory config exposed in predictor
└── Basic UI for trajectory config

Phase B: Panel System (Units 5-9)
├── Expandable panel component
├── Apply to left panel sections
└── State persistence

Phase C: Tab System (Units 10-13)
├── Tab component
├── Restructure right panel
└── Content migration

Phase D: Visual Enhancement (Units 14-19)
├── Enhanced body rendering
├── SOI boundary visualization
├── Grid improvements
├── Trajectory rendering polish

Phase E: Polish (Units 20-22)
├── Animations and transitions
├── Final styling pass
└── Integration testing
```

### 2.2 Design Principles

1. **Progressive Enhancement:** Each unit adds value without breaking previous work
2. **Minimal DOM Changes:** Restructure thoughtfully to minimize HTML churn
3. **CSS-First Animation:** Use CSS transitions where possible for performance
4. **State Centralization:** All UI state in gameState.js for consistency
5. **Component Reuse:** Expandable and tab patterns used consistently

### 2.3 Key Algorithms

**Expandable Panel Toggle:**
```javascript
function togglePanel(panelId) {
    const state = uiState.panels[panelId];
    state.expanded = !state.expanded;
    const el = document.getElementById(panelId);
    el.classList.toggle('collapsed', !state.expanded);
    saveUIState(); // localStorage
}
```

**Trajectory Duration Scaling:**
```javascript
// Steps scale with duration for consistent visual density
const steps = Math.min(300, Math.max(100, duration * 2.5));
```

---

## 3. Units of Work

### Phase A: Trajectory Configuration Foundation

---

#### Unit 1: Add Trajectory Configuration State

**Description:** Add configurable trajectory parameters to game state

**Files:**
- `src/js/config.js` - Add DEFAULT_TRAJECTORY_CONFIG
- `src/js/core/gameState.js` - Add trajectoryConfig state and setters

**Changes:**
```javascript
// config.js
export const DEFAULT_TRAJECTORY_CONFIG = {
    durationDays: 60,
    minDays: 30,
    maxDays: 730,  // 2 years
};

// gameState.js
import { DEFAULT_TRAJECTORY_CONFIG } from '../config.js';
export const trajectoryConfig = { ...DEFAULT_TRAJECTORY_CONFIG };
export function setTrajectoryDuration(days) {
    trajectoryConfig.durationDays = Math.max(
        trajectoryConfig.minDays,
        Math.min(trajectoryConfig.maxDays, days)
    );
}
```

**Acceptance Criteria:**
- [ ] `trajectoryConfig` exported from gameState.js
- [ ] `setTrajectoryDuration()` clamps to valid range
- [ ] Default value is 60 days

**Test Method:** Browser console: `import { trajectoryConfig, setTrajectoryDuration } from '/js/core/gameState.js'` - verify values

---

#### Unit 2: Wire Trajectory Duration to Predictor

**Description:** Pass configurable duration from state to trajectory predictor call in renderer

**Files:**
- `src/js/ui/renderer.js` - Import trajectoryConfig, use in predictTrajectory call

**Changes:**
```javascript
// renderer.js - import
import { trajectoryConfig } from '../core/gameState.js';

// renderer.js - in drawPredictedTrajectory()
const duration = trajectoryConfig.durationDays;
const steps = Math.min(300, Math.max(100, Math.round(duration * 2.5)));

const trajectory = predictTrajectory({
    // ...existing params
    duration: duration,
    steps: steps,
    // ...
});
```

**Acceptance Criteria:**
- [ ] Changing trajectoryConfig.durationDays changes rendered trajectory length
- [ ] Steps scale appropriately (longer duration = more steps, capped at 300)

**Test Method:** Console: `setTrajectoryDuration(180)` - trajectory should extend to ~6 months

---

#### Unit 3: Add Trajectory Config UI Section (HTML)

**Description:** Add new panel section for trajectory configuration

**Files:**
- `src/index.html` - Add TRAJECTORY CONFIG section after DISPLAY OPTIONS

**Changes:**
```html
<div class="panel-section" id="trajectoryConfigPanel">
    <div class="panel-header">TRAJECTORY CONFIG</div>
    <div class="trajectory-config">
        <div class="config-row">
            <span class="data-label">PREDICTION</span>
            <span class="data-value" id="trajectoryDurationValue">60 days</span>
        </div>
        <input type="range" class="config-slider" id="trajectoryDuration"
               min="30" max="730" value="60" step="10">
        <div class="config-presets">
            <button class="preset-btn" data-days="30">30d</button>
            <button class="preset-btn" data-days="60">60d</button>
            <button class="preset-btn" data-days="180">6mo</button>
            <button class="preset-btn" data-days="365">1yr</button>
            <button class="preset-btn" data-days="730">2yr</button>
        </div>
    </div>
</div>
```

**Acceptance Criteria:**
- [ ] New section visible in left panel
- [ ] Slider and preset buttons present
- [ ] Value display shows "60 days"

**Test Method:** Visual inspection - section appears correctly

---

#### Unit 4: Wire Trajectory Config UI

**Description:** Connect trajectory config UI to state

**Files:**
- `src/js/ui/controls.js` - Add trajectory config handlers
- `src/css/main.css` - Styles for trajectory config UI

**Changes:**
```javascript
// controls.js
function initTrajectoryConfig() {
    const slider = document.getElementById('trajectoryDuration');
    const valueDisplay = document.getElementById('trajectoryDurationValue');

    slider?.addEventListener('input', (e) => {
        const days = parseInt(e.target.value);
        setTrajectoryDuration(days);
        valueDisplay.textContent = formatDuration(days);
    });

    document.querySelectorAll('.preset-btn[data-days]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const days = parseInt(e.target.dataset.days);
            slider.value = days;
            setTrajectoryDuration(days);
            valueDisplay.textContent = formatDuration(days);
        });
    });
}

function formatDuration(days) {
    if (days >= 365) return `${(days/365).toFixed(1)}yr`;
    if (days >= 30) return `${Math.round(days/30)}mo`;
    return `${days}d`;
}
```

**Acceptance Criteria:**
- [ ] Moving slider updates trajectory in real-time
- [ ] Preset buttons set slider position
- [ ] Value display updates with appropriate format

**Test Method:** Interactive - slide and click, observe trajectory update

---

### Phase B: Expandable Panel System

---

#### Unit 5: Create Expandable Panel Component

**Description:** Create reusable expandable panel logic

**Files:**
- `src/js/ui/ui-components.js` (new file)

**Changes:**
```javascript
/**
 * UI Components - Expandable panels and tabs
 */

export function initExpandablePanel(panelId, defaultExpanded = true) {
    const panel = document.getElementById(panelId);
    if (!panel) return;

    const header = panel.querySelector('.panel-header');
    const content = panel.querySelector('.panel-content');

    if (!header || !content) {
        console.warn(`[UI] Panel ${panelId} missing header or content`);
        return;
    }

    // Add expand indicator
    const indicator = document.createElement('span');
    indicator.className = 'expand-indicator';
    indicator.textContent = defaultExpanded ? '▼' : '►';
    header.insertBefore(indicator, header.firstChild);

    // Set initial state
    panel.classList.toggle('collapsed', !defaultExpanded);

    // Click handler
    header.addEventListener('click', () => {
        const isExpanded = !panel.classList.contains('collapsed');
        panel.classList.toggle('collapsed', isExpanded);
        indicator.textContent = isExpanded ? '►' : '▼';
        savePanelState(panelId, !isExpanded);
    });

    return {
        expand: () => { panel.classList.remove('collapsed'); indicator.textContent = '▼'; },
        collapse: () => { panel.classList.add('collapsed'); indicator.textContent = '►'; },
        toggle: () => header.click()
    };
}

function savePanelState(panelId, expanded) {
    try {
        const state = JSON.parse(localStorage.getItem('panelState') || '{}');
        state[panelId] = expanded;
        localStorage.setItem('panelState', JSON.stringify(state));
    } catch (e) { /* localStorage unavailable */ }
}

export function loadPanelState(panelId) {
    try {
        const state = JSON.parse(localStorage.getItem('panelState') || '{}');
        return state[panelId];
    } catch (e) { return undefined; }
}
```

**Acceptance Criteria:**
- [ ] `initExpandablePanel()` exported
- [ ] Adds click handler to header
- [ ] Adds expand indicator (▼/►)
- [ ] Saves state to localStorage

**Test Method:** Console import and test functions

---

#### Unit 6: Add Panel Content Wrappers (HTML)

**Description:** Wrap existing panel contents in `.panel-content` divs for expandable behavior

**Files:**
- `src/index.html` - Add wrapper divs to left panel sections

**Changes:**
```html
<!-- Example for ZOOM LEVEL section -->
<div class="panel-section" id="zoomPanel">
    <div class="panel-header">ZOOM LEVEL</div>
    <div class="panel-content">
        <div class="zoom-controls">
            <!-- existing content -->
        </div>
    </div>
</div>
```

Apply to: zoomPanel, speedPanel, orbitPanel, displayPanel, trajectoryConfigPanel

**Acceptance Criteria:**
- [ ] All left panel sections have `id` attributes
- [ ] All have `.panel-content` wrapper inside
- [ ] Visual appearance unchanged

**Test Method:** Visual inspection - UI looks identical

---

#### Unit 7: Add Expandable Panel CSS

**Description:** CSS for expandable panel animations

**Files:**
- `src/css/main.css` - Add collapsed state styles

**Changes:**
```css
/* Expandable Panels */
.panel-header {
    cursor: pointer;
    user-select: none;
    display: flex;
    align-items: center;
    gap: 6px;
}

.expand-indicator {
    font-size: 8px;
    width: 10px;
    transition: transform 0.2s;
}

.panel-content {
    overflow: hidden;
    max-height: 500px;
    transition: max-height 0.3s ease, opacity 0.2s ease, padding 0.2s ease;
    opacity: 1;
}

.panel-section.collapsed .panel-content {
    max-height: 0;
    opacity: 0;
    padding-top: 0;
    padding-bottom: 0;
}

.panel-header:hover {
    color: var(--coral-bright);
}
```

**Acceptance Criteria:**
- [ ] Collapsed panels animate to height 0
- [ ] Expand indicator visible
- [ ] Smooth transition on toggle

**Test Method:** Add `.collapsed` class manually, observe animation

---

#### Unit 8: Initialize Expandable Panels

**Description:** Wire up expandable panels on page load

**Files:**
- `src/js/ui/controls.js` - Import and call init
- `src/js/main.js` - Ensure init called

**Changes:**
```javascript
// controls.js
import { initExpandablePanel, loadPanelState } from './ui-components.js';

function initExpandablePanels() {
    const panels = ['zoomPanel', 'speedPanel', 'orbitPanel', 'displayPanel', 'trajectoryConfigPanel'];

    panels.forEach(id => {
        const savedState = loadPanelState(id);
        const defaultExpanded = savedState !== undefined ? savedState : true;
        initExpandablePanel(id, defaultExpanded);
    });
}

// Call in initControls()
export function initControls() {
    // ... existing code
    initExpandablePanels();
}
```

**Acceptance Criteria:**
- [ ] All panels collapsible on click
- [ ] State persists across page reload
- [ ] Indicators update correctly

**Test Method:** Click headers, refresh page, verify state persists

---

#### Unit 9: Expandable Panel Polish

**Description:** Visual refinements for expandable panels

**Files:**
- `src/css/main.css` - Enhanced styling

**Changes:**
```css
/* Enhanced panel header styling */
.panel-section {
    transition: border-color 0.2s;
}

.panel-section:hover {
    border-color: var(--coral);
}

.panel-section.collapsed {
    border-color: var(--coral-dim);
}

.panel-section.collapsed .panel-header {
    border-bottom: none;
    margin-bottom: 0;
    padding-bottom: 4px;
}

/* Hover effect for expand indicator */
.panel-header:hover .expand-indicator {
    color: var(--coral-bright);
}
```

**Acceptance Criteria:**
- [ ] Hover effects on panel headers
- [ ] Border styling changes on collapse
- [ ] Professional appearance

**Test Method:** Visual inspection, interaction test

---

### Phase C: Tab System (Right Panel)

---

#### Unit 10: Create Tab Component

**Description:** Create reusable tab component logic

**Files:**
- `src/js/ui/ui-components.js` - Add tab functions

**Changes:**
```javascript
export function initTabGroup(containerId, defaultTab = null) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const tabs = container.querySelectorAll('.tab-btn');
    const panels = container.querySelectorAll('.tab-panel');

    function activateTab(tabId) {
        tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
        panels.forEach(p => p.classList.toggle('active', p.id === `${tabId}Panel`));
        saveTabState(containerId, tabId);
    }

    tabs.forEach(tab => {
        tab.addEventListener('click', () => activateTab(tab.dataset.tab));
    });

    // Set initial tab
    const savedTab = loadTabState(containerId);
    const initialTab = savedTab || defaultTab || tabs[0]?.dataset.tab;
    if (initialTab) activateTab(initialTab);

    return { activateTab };
}

function saveTabState(containerId, tabId) {
    try {
        const state = JSON.parse(localStorage.getItem('tabState') || '{}');
        state[containerId] = tabId;
        localStorage.setItem('tabState', JSON.stringify(state));
    } catch (e) { /* localStorage unavailable */ }
}

function loadTabState(containerId) {
    try {
        const state = JSON.parse(localStorage.getItem('tabState') || '{}');
        return state[containerId];
    } catch (e) { return undefined; }
}
```

**Acceptance Criteria:**
- [ ] `initTabGroup()` exported
- [ ] Tab activation shows correct panel
- [ ] State saved to localStorage

**Test Method:** Console import and test

---

#### Unit 11: Restructure Right Panel HTML

**Description:** Convert right panel to tabbed layout

**Files:**
- `src/index.html` - Restructure right panel

**Changes:**
```html
<div class="right-panel" id="rightPanelTabs">
    <div class="tab-bar">
        <button class="tab-btn active" data-tab="sail">SAIL</button>
        <button class="tab-btn" data-tab="nav">NAV</button>
        <button class="tab-btn" data-tab="auto">AUTO</button>
    </div>

    <div class="tab-content">
        <!-- SAIL tab -->
        <div class="tab-panel active" id="sailPanel">
            <!-- Existing sail control + thrust display content -->
        </div>

        <!-- NAV tab -->
        <div class="tab-panel" id="navPanel">
            <!-- Existing navigation data + nav computer content -->
        </div>

        <!-- AUTO tab -->
        <div class="tab-panel" id="autoPanel">
            <!-- Existing autopilot content -->
        </div>
    </div>
</div>
```

**Acceptance Criteria:**
- [ ] Three tabs visible at top of right panel
- [ ] Content correctly distributed
- [ ] Only one panel visible at a time

**Test Method:** Visual inspection

---

#### Unit 12: Add Tab CSS

**Description:** Styling for tabs

**Files:**
- `src/css/main.css` - Tab styles

**Changes:**
```css
/* Tab Bar */
.tab-bar {
    display: flex;
    border-bottom: 1px solid var(--coral-dim);
    margin-bottom: 12px;
}

.tab-btn {
    flex: 1;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--text-dim);
    font-family: 'Orbitron', sans-serif;
    font-size: 10px;
    letter-spacing: 1px;
    padding: 8px 4px;
    cursor: pointer;
    transition: all 0.2s;
}

.tab-btn:hover {
    color: var(--coral);
}

.tab-btn.active {
    color: var(--coral-bright);
    border-bottom-color: var(--coral);
}

/* Tab Content */
.tab-content {
    position: relative;
}

.tab-panel {
    display: none;
    animation: tabFadeIn 0.2s ease;
}

.tab-panel.active {
    display: block;
}

@keyframes tabFadeIn {
    from { opacity: 0; transform: translateY(-5px); }
    to { opacity: 1; transform: translateY(0); }
}
```

**Acceptance Criteria:**
- [ ] Tabs styled appropriately
- [ ] Active tab highlighted
- [ ] Smooth fade animation on switch

**Test Method:** Visual inspection, click through tabs

---

#### Unit 13: Initialize Tabs

**Description:** Wire up tabs on page load

**Files:**
- `src/js/ui/controls.js` - Import and call initTabGroup

**Changes:**
```javascript
import { initTabGroup } from './ui-components.js';

function initRightPanelTabs() {
    initTabGroup('rightPanelTabs', 'sail');
}

// Call in initControls()
```

**Acceptance Criteria:**
- [ ] Tabs functional on page load
- [ ] State persists across reload
- [ ] Default tab is SAIL

**Test Method:** Click tabs, refresh, verify persistence

---

### Phase D: Visual Enhancement

---

#### Unit 14: Enhanced Sun Rendering

**Description:** Improve sun visual with radial gradient and corona effect

**Files:**
- `src/js/ui/renderer.js` - Update drawBody for Sun

**Changes:**
```javascript
function drawBody(body, centerX, centerY, scale) {
    // ... existing projection code ...

    if (body.name === 'SOL') {
        // Radial gradient for sun body
        const gradient = ctx.createRadialGradient(
            projected.x, projected.y, 0,
            projected.x, projected.y, display.radius
        );
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(0.3, '#ffee88');
        gradient.addColorStop(0.7, '#ffdd44');
        gradient.addColorStop(1, '#ff9922');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(projected.x, projected.y, display.radius, 0, Math.PI * 2);
        ctx.fill();

        // Corona glow
        const corona = ctx.createRadialGradient(
            projected.x, projected.y, display.radius,
            projected.x, projected.y, display.radius * 2.5
        );
        corona.addColorStop(0, 'rgba(255, 200, 100, 0.4)');
        corona.addColorStop(1, 'rgba(255, 200, 100, 0)');
        ctx.fillStyle = corona;
        ctx.beginPath();
        ctx.arc(projected.x, projected.y, display.radius * 2.5, 0, Math.PI * 2);
        ctx.fill();
    } else {
        // Existing planet rendering
    }
}
```

**Acceptance Criteria:**
- [ ] Sun has gradient core
- [ ] Corona glow extends beyond body
- [ ] Other bodies unchanged

**Test Method:** Visual inspection of sun

---

#### Unit 15: Enhanced Planet Rendering

**Description:** Add subtle gradients and shadows to planets

**Files:**
- `src/js/ui/renderer.js` - Update drawBody for planets

**Changes:**
```javascript
// For non-sun bodies
const gradient = ctx.createRadialGradient(
    projected.x - display.radius * 0.3,
    projected.y - display.radius * 0.3,
    0,
    projected.x, projected.y, display.radius * 1.2
);
gradient.addColorStop(0, lightenColor(display.color, 30));
gradient.addColorStop(0.5, display.color);
gradient.addColorStop(1, darkenColor(display.color, 40));

ctx.fillStyle = gradient;
ctx.beginPath();
ctx.arc(projected.x, projected.y, display.radius, 0, Math.PI * 2);
ctx.fill();

// Subtle glow
ctx.shadowColor = display.color;
ctx.shadowBlur = display.radius * 0.5;
// Draw again for glow effect
ctx.fill();
ctx.shadowBlur = 0;
```

**Acceptance Criteria:**
- [ ] Planets have 3D appearance
- [ ] Subtle glow around each body
- [ ] Performance acceptable

**Test Method:** Visual inspection, FPS check

---

#### Unit 16: SOI Boundary Visualization

**Description:** Draw SOI boundaries for planets

**Files:**
- `src/js/ui/renderer.js` - New function drawSOIBoundaries

**Changes:**
```javascript
function drawSOIBoundaries(centerX, centerY, scale) {
    if (!displayOptions.showOrbits) return;

    Object.entries(SOI_RADII).forEach(([bodyName, radius]) => {
        const body = celestialBodies.find(b => b.name === bodyName);
        if (!body) return;

        const projected = project3D(body.x, body.y, body.z, centerX, centerY, scale);
        const pixelRadius = radius * scale;

        // Only draw if radius is meaningful on screen
        if (pixelRadius < 5 || pixelRadius > 2000) return;

        const display = getBodyDisplay(body);

        ctx.strokeStyle = `${display.color}44`;  // 26% opacity
        ctx.setLineDash([4, 8]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(projected.x, projected.y, pixelRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
    });
}

// Call in render() after drawing bodies
```

**Acceptance Criteria:**
- [ ] Dashed circles around planets showing SOI
- [ ] Color matches planet
- [ ] Only visible at appropriate zoom levels

**Test Method:** Visual inspection at various zoom levels

---

#### Unit 17: Grid Enhancement

**Description:** Improve grid with fade at edges and subtle styling

**Files:**
- `src/js/ui/renderer.js` - Update drawGrid

**Changes:**
```javascript
function drawGrid(centerX, centerY, scale) {
    if (!displayOptions.showGrid) return;

    // Fade at edges
    const fadeStart = Math.min(canvas.width, canvas.height) * 0.35;
    const fadeEnd = Math.min(canvas.width, canvas.height) * 0.5;

    // ... existing grid logic with gradient alpha based on distance from center

    // Add subtle glow to grid lines at 1 AU marks
    // ...
}
```

**Acceptance Criteria:**
- [ ] Grid fades at canvas edges
- [ ] 1 AU marks slightly brighter
- [ ] Less visual clutter

**Test Method:** Visual inspection

---

#### Unit 18: Trajectory Rendering Polish

**Description:** Enhance predicted trajectory visual

**Files:**
- `src/js/ui/renderer.js` - Update drawPredictedTrajectory

**Changes:**
```javascript
// Add subtle pulsing glow at trajectory start
// Add distance markers along trajectory (optional)
// Improve end marker visualization for SOI truncation
```

**Acceptance Criteria:**
- [ ] Start point has subtle pulse
- [ ] SOI exit marker more prominent
- [ ] Overall trajectory more visible without being distracting

**Test Method:** Visual inspection with various durations

---

#### Unit 19: Label Improvements

**Description:** Better label styling with background pills

**Files:**
- `src/js/ui/renderer.js` - Update label rendering

**Changes:**
```javascript
function drawLabel(text, x, y, color, isPlayer = false) {
    ctx.font = isPlayer ? 'bold 10px "Share Tech Mono"' : '10px "Share Tech Mono"';
    const metrics = ctx.measureText(text);

    // Background pill
    ctx.fillStyle = 'rgba(10, 10, 10, 0.7)';
    const padding = 3;
    ctx.fillRect(
        x - padding,
        y - 10,
        metrics.width + padding * 2,
        14
    );

    // Text
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
}
```

**Acceptance Criteria:**
- [ ] Labels have subtle background
- [ ] Better readability over orbits
- [ ] Consistent styling

**Test Method:** Visual inspection

---

### Phase E: Polish and Integration

---

#### Unit 20: Animation System Polish

**Description:** Ensure all animations are smooth and consistent

**Files:**
- `src/css/main.css` - Review and polish animations

**Changes:**
- Verify all transitions use consistent timing
- Add hover states where missing
- Ensure no janky animations

**Acceptance Criteria:**
- [ ] All UI transitions smooth
- [ ] Consistent animation timing (0.2s standard)
- [ ] No layout shifts during animation

**Test Method:** Interactive testing, record video for review

---

#### Unit 21: Final Styling Pass

**Description:** Overall visual consistency check

**Files:**
- `src/css/main.css` - Final adjustments
- `src/index.html` - Any structural cleanup

**Changes:**
- Verify color consistency
- Check spacing and alignment
- Ensure Expanse-like aesthetic

**Acceptance Criteria:**
- [ ] Cohesive visual design
- [ ] No orphaned/unused styles
- [ ] Professional appearance

**Test Method:** Full visual review, comparison to Expanse references

---

#### Unit 22: Integration Testing

**Description:** Full system verification

**Files:** None (testing only)

**Tests:**
1. All keyboard shortcuts work
2. All display toggles work
3. Trajectory config works at all zoom levels
4. Panel state persists correctly
5. Tab state persists correctly
6. Performance at 60 FPS
7. No console errors
8. All existing features functional

**Acceptance Criteria:**
- [ ] All tests pass
- [ ] No regressions
- [ ] Feature complete

**Test Method:** Manual testing checklist

---

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Performance degradation from enhanced rendering | Medium | High | Profile after each visual change, keep simple fallbacks |
| Panel restructuring breaks existing handlers | Low | Medium | Verify all IDs preserved, test incrementally |
| localStorage not available | Low | Low | Graceful fallback, UI still works |
| Animation performance on low-end machines | Medium | Medium | Use CSS transitions, avoid JS animation loops |
| Tab content layout issues | Medium | Medium | Test thoroughly after restructure |

---

## 5. Testing Strategy

### 5.1 Unit Tests

Each unit has inline acceptance criteria. Verify before proceeding.

### 5.2 Integration Tests

After Phase B: Verify all left panel controls still work
After Phase C: Verify all right panel controls still work
After Phase D: Verify rendering performance acceptable

### 5.3 Manual Verification Checklist

```
[ ] Start server, load page
[ ] All panels visible initially
[ ] Zoom buttons work
[ ] Speed buttons work
[ ] Display toggles work
[ ] Trajectory slider changes prediction length
[ ] Trajectory preset buttons work
[ ] All left panels collapse/expand
[ ] Panel state persists on reload
[ ] Right panel tabs switch content
[ ] Tab state persists on reload
[ ] Sail sliders work
[ ] Autopilot button works
[ ] Nav computer displays data
[ ] Keyboard shortcuts: [ ] { } = - Q E W S R A
[ ] Mouse: drag to pan, scroll to zoom (if implemented)
[ ] FPS counter shows 60 (or acceptable)
[ ] No console errors
```

---

## 6. Dependency Graph

```
Unit 1 ─────► Unit 2 ─────► Unit 4
                              │
Unit 3 ──────────────────────►┘

Unit 5 ─────► Unit 8
                │
Unit 6 ────────►┤
                │
Unit 7 ────────►┘ ─────► Unit 9

Unit 10 ────► Unit 13
                │
Unit 11 ───────►┤
                │
Unit 12 ───────►┘

Units 14-19 can proceed in parallel after Phase C complete

Unit 20 ────► Unit 21 ────► Unit 22
```

---

## 7. Estimated Scope

| Phase | Units | Files Modified | Complexity |
|-------|-------|----------------|------------|
| A: Trajectory Config | 4 | 4 | Low |
| B: Expandable Panels | 5 | 4 | Medium |
| C: Tab System | 4 | 4 | Medium |
| D: Visual Enhancement | 6 | 2 | Medium |
| E: Polish | 3 | 2 | Low |
| **Total** | **22** | **~8 unique** | **Medium** |
