# Implementation Plan: Side-View Projection Toggle (#4)

**Date:** 2026-01-31
**Priority:** Medium
**Estimated Effort:** Medium-High

## Overview

Add a camera view option that shows the solar system from the "side" (edge-on to the ecliptic), making orbital inclinations visible. Currently, the top-down view hides all vertical (Z) information.

## Problem Statement

The current ecliptic top-down view projects all Z-coordinates away, making it impossible to see:
- How much an orbit is tilted (Ceres at 10.6° looks the same as Earth at 0°)
- Whether your trajectory is above or below the ecliptic
- The vertical gap between your ship and inclined targets

## Proposed Solution

### View Options

Add a view toggle or selector:

```
Current: VIEW: ECLIPTIC +15°
Options:
- ECLIPTIC (current, top-down with tilt)
- SIDE VIEW (edge-on, shows inclination)
- FREE (manual control)
```

### Camera Implementation

The existing camera system uses `tilt` angle. A "side view" is essentially `tilt = 90°` (looking from the side).

```javascript
// In camera.js
const VIEW_PRESETS = {
    ECLIPTIC: { tilt: 15 * Math.PI / 180, rotation: 0 },
    SIDE: { tilt: 90 * Math.PI / 180, rotation: 0 },
    // Could add more: SIDE_ANGLED: { tilt: 75, rotation: 45 }
};

function setViewPreset(presetName) {
    const preset = VIEW_PRESETS[presetName];
    if (preset) {
        camera.tilt = preset.tilt;
        camera.rotation = preset.rotation;
    }
}
```

### UI Controls

Option A: **Toggle Button**
```html
<button id="viewToggle" class="view-btn">
    VIEW: <span id="viewName">ECLIPTIC</span>
</button>
```
- Click cycles: ECLIPTIC → SIDE → ECLIPTIC

Option B: **Dropdown/Select**
```html
<select id="viewSelect" class="view-select">
    <option value="ecliptic">ECLIPTIC</option>
    <option value="side">SIDE VIEW</option>
</select>
```

Option C: **Keyboard Shortcut**
- Press `V` to cycle views
- Fits with existing keyboard controls

**Recommendation:** Option A (toggle button) with Option C (keyboard shortcut)

## File Changes

### 1. `src/js/core/camera.js`
```javascript
// Add view presets
export const VIEW_PRESETS = {
    ECLIPTIC: { tilt: 0.26, rotation: 0, name: 'ECLIPTIC' },  // ~15°
    SIDE: { tilt: Math.PI / 2, rotation: 0, name: 'SIDE' }     // 90°
};

// Current view preset
let currentViewPreset = 'ECLIPTIC';

// Set view by preset name
export function setViewPreset(presetName) {
    const preset = VIEW_PRESETS[presetName];
    if (preset) {
        camera.tilt = preset.tilt;
        currentViewPreset = presetName;
    }
}

// Cycle to next view
export function cycleView() {
    const presets = Object.keys(VIEW_PRESETS);
    const currentIndex = presets.indexOf(currentViewPreset);
    const nextIndex = (currentIndex + 1) % presets.length;
    setViewPreset(presets[nextIndex]);
    return presets[nextIndex];
}

export function getCurrentViewPreset() {
    return currentViewPreset;
}
```

### 2. `src/index.html`
Add view indicator/toggle to the top bar (near existing VIEW display):
```html
<div class="view-info">
    VIEW: <span id="viewPreset">ECLIPTIC</span> <span id="viewTilt">+15°</span>
    <button id="viewToggle" class="view-toggle-btn" title="Cycle view (V)">⇄</button>
</div>
```

### 3. `src/js/ui/controls.js`
```javascript
// Add keyboard handler
case 'KeyV':
    const newView = cycleView();
    updateViewDisplay(newView);
    break;

// Add button click handler
document.getElementById('viewToggle')?.addEventListener('click', () => {
    const newView = cycleView();
    updateViewDisplay(newView);
});
```

### 4. `src/js/ui/uiUpdater.js`
```javascript
function updateViewDisplay(viewName) {
    const viewPresetEl = document.getElementById('viewPreset');
    if (viewPresetEl) {
        viewPresetEl.textContent = viewName;
    }
}
```

### 5. `src/css/main.css`
```css
.view-toggle-btn {
    background: transparent;
    border: 1px solid var(--primary);
    color: var(--primary);
    padding: 2px 8px;
    cursor: pointer;
    font-family: monospace;
}

.view-toggle-btn:hover {
    background: rgba(76, 158, 232, 0.2);
}
```

## Visual Considerations

### Side View Rendering

When viewed from the side:
- Orbital ellipses appear as lines (edge-on)
- Inclined orbits appear at an angle
- Z-position becomes the vertical axis on screen

The existing `project3D` function should handle this automatically based on camera tilt.

### Label Positioning

In side view, labels may overlap differently. Consider:
- Adjusting label offsets based on view
- Using adaptive label positioning

### Grid Reference

The current grid is in the XY plane. For side view, may want:
- Option to show XZ plane grid instead
- Or show both grids at reduced opacity

## Testing

```javascript
// Console test
import('./js/core/camera.js').then(m => {
    m.setViewPreset('SIDE');
    // Observe: inclined orbits should appear tilted
    setTimeout(() => m.setViewPreset('ECLIPTIC'), 3000);
});
```

## Edge Cases

1. **Manual tilt override** - If user tilts manually, what happens to preset indicator?
   - Option: Show "CUSTOM" when tilt doesn't match any preset

2. **Zoom behavior** - Side view may need different default zoom
   - Consider auto-adjusting zoom when switching views

3. **Animation** - Should view switch be instant or animated?
   - Animated transition (lerp over 0.5s) would feel smoother

## Dependencies

- None (uses existing camera system)
- Enhances value of Tools #1 and #2 (inclination becomes visible)
