# Glass Cockpit HUD System Architecture

**Version:** 1.0
**Date:** 2026-02-07
**Status:** Production Ready

---

## Overview

The Glass Cockpit HUD is a glassmorphic, sci-fi inspired heads-up display that replaces the traditional panel-based UI. It provides an immersive spaceflight experience with premium controls, smooth animations, and theme-aware styling.

**Key Features:**
- Four-zone corner layout (minimal visual obstruction)
- Glassmorphic panels with backdrop blur and scan lines
- Premium vertical sliders and rotary controls
- Smooth value animations with easing
- Theme-aware styling (works with all game themes)
- Accessibility support (reduced motion, keyboard navigation)

---

## Architecture

### Component Hierarchy

```
main.js (initialization)
  ├── hudState.js (shared state)
  ├── animation.js (value transitions)
  └── HUD Components
      ├── SailControl.js (top-right)
      │   ├── VerticalSlider.js × 2
      │   └── RotaryControl.js × 2
      ├── TimeSpeedControl.js (top-left)
      ├── LayersPanel.js (bottom-left)
      ├── NavDataPanel.js (bottom-right)
      └── Tooltip.js (global overlay)
```

### Data Flow

```
User Interaction
    ↓
HUD Component (DOM event)
    ↓
Core State Update (gameState.js, ships.js)
    ↓
Game Loop (main.js)
    ↓
Physics Update (shipPhysics.js)
    ↓
HUD Component Update (via updateTimeSpeedControl(), etc.)
    ↓
Animated Value Transition (animation.js)
    ↓
DOM Update (smooth visual change)
```

**Key Principles:**
1. **HUD reads from core state** - Never duplicates physics/game data
2. **Core state is source of truth** - HUD is a view layer only
3. **Animations are presentation layer** - Physics runs at full precision
4. **Components are independent** - No direct inter-component communication

---

## Component API

### SailControl

**Location:** `src/js/ui/hud/SailControl.js`

**Purpose:** Premium sail trimming interface with vertical sliders and rotary controls.

**Initialization:**
```javascript
import { initSailControl } from './ui/hud/SailControl.js';

initSailControl(); // Auto-wires to DOM and state
```

**DOM Structure:**
```html
<div id="hud-sail-panel" class="hud-panel hud-top-right">
  <!-- Deployment slider -->
  <div data-control="deployment" class="sail-control-row">
    <div class="vertical-slider-container">...</div>
  </div>

  <!-- Yaw rotary -->
  <div data-control="yaw" class="sail-control-row">
    <div class="rotary-control-container">...</div>
  </div>

  <!-- Pitch rotary -->
  <div data-control="pitch" class="sail-control-row">
    <div class="rotary-control-container">...</div>
  </div>

  <!-- Efficiency slider -->
  <div data-control="efficiency" class="sail-control-row">
    <div class="vertical-slider-container">...</div>
  </div>
</div>
```

**State Binding:**
- Reads from: `getPlayerShip().sail`
- Writes to: `updatePlayerSail()` (in ships.js)
- Updates: On user drag/click

**Events:**
- User drags slider → immediate state update → physics applies next frame
- Value changes → AnimatedValue transition → smooth visual update

---

### TimeSpeedControl

**Location:** `src/js/ui/hud/TimeSpeedControl.js`

**Purpose:** Date display and time speed presets.

**Initialization:**
```javascript
import { initTimeSpeedControl, updateTimeSpeedControl } from './ui/hud/TimeSpeedControl.js';

initTimeSpeedControl(); // Wire up event handlers

// In game loop:
updateTimeSpeedControl(); // Update date display
```

**DOM Structure:**
```html
<div id="hud-time-panel" class="hud-panel hud-top-left">
  <div class="hud-date-display">2025-06-15 12:30:45 UTC</div>
  <div class="hud-speed-presets">
    <button data-speed="pause">⏸</button>
    <button data-speed="1">1×</button>
    <button data-speed="10">10×</button>
    <!-- ... more speeds ... -->
  </div>
</div>
```

**State Binding:**
- Reads from: `getJulianDate()`, `timeScale`
- Writes to: `setTimeScale()` (in gameState.js)
- Updates: 60Hz in game loop

---

### LayersPanel

**Location:** `src/js/ui/hud/LayersPanel.js`

**Purpose:** Icon grid for toggling display layers (star map, orbits, labels, etc.).

**Initialization:**
```javascript
import { initLayersPanel } from './ui/hud/LayersPanel.js';

initLayersPanel(); // Auto-syncs with displayOptions
```

**DOM Structure:**
```html
<div id="hud-layers-panel" class="hud-panel hud-bottom-left">
  <div class="layers-grid">
    <button data-layer="starMap" class="layer-button active">
      <span class="layer-icon">✦</span>
      <span class="layer-label">STARS</span>
    </button>
    <!-- ... more layers ... -->
  </div>
</div>
```

**State Binding:**
- Reads from: `displayOptions` (in gameState.js)
- Writes to: `toggleDisplayOption()` (in gameState.js)
- Updates: On user click

**Layer Overrides:**
- Uses `hudState.layerOverrides` to force layers on/off when HUD needs them
- Example: Course solver forces "PREDICTED PATH" on while running

---

### NavDataPanel

**Location:** `src/js/ui/hud/NavDataPanel.js`

**Purpose:** Real-time telemetry for current navigation target.

**Initialization:**
```javascript
import { initNavDataPanel } from './ui/hud/NavDataPanel.js';

initNavDataPanel(); // Auto-updates from navState
```

**DOM Structure:**
```html
<div id="hud-nav-panel" class="hud-panel hud-bottom-right">
  <div class="nav-data-row">
    <span class="nav-data-label">TARGET</span>
    <span class="nav-data-value">MARS</span>
  </div>
  <div class="nav-data-row">
    <span class="nav-data-label">DISTANCE</span>
    <span class="nav-data-value">1.52 AU</span>
  </div>
  <!-- ... more telemetry ... -->
</div>
```

**State Binding:**
- Reads from: `destination`, `navState`, celestial body data
- Updates: Continuously in game loop (via reactive DOM updates)
- No writes: Read-only display

**Performance:**
- Uses `AnimatedValue` for smooth counter transitions
- Only updates changed values (diff-based rendering)

---

### Tooltip System

**Location:** `src/js/ui/hud/Tooltip.js`

**Purpose:** Contextual help overlay for HUD controls.

**Initialization:**
```javascript
import { initTooltip } from './ui/hud/Tooltip.js';

initTooltip(); // Listens for data-tooltip attributes
```

**Usage:**
```html
<button data-tooltip="Pause simulation">⏸</button>
```

**Features:**
- Auto-positioning (stays within viewport)
- 200ms delay before showing (prevents flicker)
- Hides on click/scroll
- Theme-aware styling

---

## Reusable Controls

### VerticalSlider

**Location:** `src/js/ui/hud/VerticalSlider.js`

**API:**
```javascript
import { createVerticalSlider } from './ui/hud/VerticalSlider.js';

const slider = createVerticalSlider({
  container: document.querySelector('#my-slider'),
  min: 0,
  max: 100,
  value: 50,
  step: 1,
  unit: '%',
  precision: 0,
  onChange: (newValue) => {
    console.log('Slider changed:', newValue);
  }
});

// Update programmatically
slider.setValue(75);

// Clean up
slider.destroy();
```

**Features:**
- Smooth dragging with visual fill indicator
- Click-to-set support
- Animated value label
- Touch-friendly (large hit area)

---

### RotaryControl

**Location:** `src/js/ui/hud/RotaryControl.js`

**API:**
```javascript
import { createRotaryControl } from './ui/hud/RotaryControl.js';

const rotary = createRotaryControl({
  container: document.querySelector('#my-rotary'),
  min: -180,
  max: 180,
  value: 0,
  step: 5,
  unit: '°',
  precision: 1,
  onChange: (newValue) => {
    console.log('Rotary changed:', newValue);
  }
});

// Update programmatically
rotary.setValue(45);

// Clean up
rotary.destroy();
```

**Features:**
- SVG-based circular indicator
- Drag to rotate (full 360° or clamped range)
- Visual angle indicator line
- Smooth animations

---

## State Management

### hudState.js

**Location:** `src/js/core/hudState.js`

**Purpose:** UI-specific state that doesn't belong in core game state.

**Exports:**
```javascript
export const hudState = {
  isPanelCollapsed: {
    sail: false,
    time: false,
    layers: false,
    nav: false
  },

  layerOverrides: {
    // Force layers on/off regardless of user toggle
    // Example: { predictedPath: true } forces path on during autopilot
  },

  selectedControl: null, // For keyboard navigation
  fineTuneResolution: 'NORMAL' // COARSE, NORMAL, FINE, ULTRA, UBER
};

export function togglePanelCollapse(panelName) { /* ... */ }
export function setLayerOverride(layerName, value) { /* ... */ }
export function clearLayerOverrides() { /* ... */ }
```

**Usage:**
```javascript
import { hudState, setLayerOverride } from './core/hudState.js';

// Force predicted path on during autopilot
if (autopilotActive) {
  setLayerOverride('predictedPath', true);
} else {
  clearLayerOverrides();
}
```

---

## Animation System

### animation.js

**Location:** `src/js/lib/animation.js`

**Purpose:** Smooth value transitions with easing functions.

**API:**
```javascript
import { AnimatedValue, easeOutCubic } from './lib/animation.js';

// Create animated value
const animValue = new AnimatedValue({
  initialValue: 0,
  duration: 300, // milliseconds
  easing: easeOutCubic,
  onChange: (current) => {
    element.textContent = current.toFixed(2);
  }
});

// Update target value (animates smoothly)
animValue.setTarget(100);

// Get current value (mid-transition)
console.log(animValue.getCurrentValue()); // e.g., 47.3

// Clean up
animValue.stop();
```

**Easing Functions:**
- `linear(t)` - Constant speed
- `easeOutCubic(t)` - Fast start, slow end (default for values)
- `easeInOutCubic(t)` - Slow start, fast middle, slow end (smooth)

**Performance:**
- Uses `requestAnimationFrame` (GPU-accelerated)
- Auto-stops when target reached
- No memory leaks (clean cancellation)

---

## Styling System

### hud.css

**Location:** `src/css/hud.css`

**Theme Integration:**

All HUD styles use CSS custom properties from the theme engine:

```css
/* Theme variables (auto-injected by themeEngine.js) */
:root {
  --primary: #00ff88;
  --primary-rgb: 0, 255, 136;
  --bg-dark: #0a0e14;
  --bg-dark-rgb: 10, 14, 20;
  --text-primary: #e0e0e0;
  /* ... */
}

/* HUD styles reference theme vars */
.hud-panel {
  background: rgba(var(--bg-dark-rgb), 0.7);
  border: 1px solid var(--primary);
  color: var(--text-primary);
}
```

**Visual Effects:**
- **Glassmorphism:** `backdrop-filter: blur(10px)` + semi-transparent background
- **Scan lines:** Repeating gradient animation (8s cycle)
- **Corner brackets:** Pulsing border decorations (2s cycle)
- **Glow effects:** `box-shadow` with theme RGB values

**Accessibility:**
```css
@media (prefers-reduced-motion: reduce) {
  .scan-lines::before,
  .corner-brackets.active::before,
  .corner-brackets.active::after {
    animation: none; /* Disable animations */
  }
}
```

---

## Extension Guide

### Adding a New HUD Panel

**Step 1: Create component file**

`src/js/ui/hud/MyNewPanel.js`:
```javascript
import { hudState } from '../../core/hudState.js';

let panelElement = null;

export function initMyNewPanel() {
  panelElement = document.getElementById('hud-mynew-panel');
  if (!panelElement) {
    console.error('MyNewPanel: DOM element not found');
    return;
  }

  // Wire up event handlers
  const button = panelElement.querySelector('.my-button');
  button.addEventListener('click', handleButtonClick);
}

export function updateMyNewPanel() {
  if (!panelElement) return;

  // Update display from game state
  const value = getSomeGameState();
  panelElement.querySelector('.my-value').textContent = value;
}

function handleButtonClick() {
  // Update game state
  setSomeGameState(newValue);
}
```

**Step 2: Add HTML structure**

`src/index.html`:
```html
<div id="hud-mynew-panel" class="hud-panel hud-bottom-center scan-lines corner-brackets">
  <div class="hud-panel-title">MY PANEL</div>
  <button class="my-button">DO THING</button>
  <div class="my-value">0</div>
</div>
```

**Step 3: Add positioning**

`src/css/hud.css`:
```css
.hud-bottom-center {
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
}
```

**Step 4: Initialize in main.js**

```javascript
import { initMyNewPanel, updateMyNewPanel } from './ui/hud/MyNewPanel.js';

async function init() {
  // ... existing inits ...
  initMyNewPanel();
}

function gameLoop() {
  // ... existing updates ...
  updateMyNewPanel();
}
```

---

### Adding a New Layer Toggle

**Step 1: Define layer in gameState.js**

```javascript
export const displayOptions = {
  // ... existing layers ...
  myNewLayer: true
};
```

**Step 2: Handle rendering in renderer.js**

```javascript
function render() {
  // ... existing rendering ...

  if (displayOptions.myNewLayer) {
    drawMyNewLayer(ctx);
  }
}
```

**Step 3: Add layer button**

LayersPanel will auto-detect new layers if you add to `LAYER_CONFIG`:

`src/js/ui/hud/LayersPanel.js`:
```javascript
const LAYER_CONFIG = [
  // ... existing layers ...
  { key: 'myNewLayer', icon: '◆', label: 'MY LAYER' }
];
```

---

### Theming a New Component

**Use theme variables for all colors:**

```css
.my-component {
  color: var(--text-primary);
  background: rgba(var(--bg-dark-rgb), 0.8);
  border: 1px solid var(--primary);
  box-shadow: 0 0 10px rgba(var(--primary-rgb), 0.3);
}

.my-component.warning {
  border-color: var(--warning);
  box-shadow: 0 0 10px rgba(var(--warning-rgb), 0.5);
}
```

**Never hardcode colors:**
```css
/* ❌ BAD */
.my-component {
  color: #00ff88;
  background: rgba(10, 14, 20, 0.8);
}

/* ✅ GOOD */
.my-component {
  color: var(--primary);
  background: rgba(var(--bg-dark-rgb), 0.8);
}
```

---

## Performance Considerations

### Rendering Optimization

1. **Minimal DOM Updates:**
   - Only update changed values (diff-based)
   - Use `textContent` over `innerHTML`
   - Batch DOM reads/writes

2. **Animation Performance:**
   - All animations use `transform` or `opacity` (GPU-accelerated)
   - Scan lines use `transform: translateY()` (no layout thrashing)
   - Avoid animating `width`, `height`, `left`, `top`

3. **Event Handling:**
   - Passive event listeners for scroll/touch
   - Debounce rapid updates (e.g., drag events)
   - Use event delegation where possible

### Memory Management

1. **Component Cleanup:**
   - All controls provide `destroy()` method
   - Remove event listeners on destroy
   - Cancel pending animations

2. **Cache Invalidation:**
   - AnimatedValue auto-stops when idle
   - Tooltip hides after 5 seconds of no interaction

---

## Testing Checklist

### Visual Testing

- [ ] All four panels visible and positioned correctly
- [ ] Glassmorphic effect renders (backdrop blur visible)
- [ ] Scan lines animate smoothly (8s cycle)
- [ ] Corner brackets pulse when panel active (2s cycle)
- [ ] Theme switching updates all colors instantly

### Functional Testing

- [ ] Sail sliders update ship state immediately
- [ ] Speed buttons change time scale correctly
- [ ] Layer toggles show/hide canvas elements
- [ ] Nav data updates in real-time (distance, velocity, etc.)
- [ ] Tooltips appear on hover with correct positioning

### Interaction Testing

- [ ] Vertical sliders respond to drag and click
- [ ] Rotary controls rotate smoothly
- [ ] Buttons provide visual feedback on click
- [ ] Keyboard shortcuts still work with HUD enabled

### Accessibility Testing

- [ ] Reduced motion disables all animations
- [ ] Focus indicators visible on keyboard navigation
- [ ] High contrast mode maintains readability
- [ ] Screen reader announces control changes

### Performance Testing

- [ ] 60 FPS maintained with HUD visible
- [ ] No console errors or warnings
- [ ] Memory usage stable over time (no leaks)
- [ ] Smooth animations even during physics calculations

---

## Troubleshooting

### HUD Not Visible

**Symptom:** HUD panels don't appear after enabling `hud-enabled` class.

**Solution:**
1. Check console for initialization errors
2. Verify all HUD components initialized in `main.js`
3. Confirm `hud.css` loaded (check Network tab)
4. Verify theme engine initialized before HUD components

### Theme Colors Not Applied

**Symptom:** HUD panels show browser default colors instead of theme colors.

**Solution:**
1. Check that theme CSS variables injected: `getComputedStyle(document.documentElement).getPropertyValue('--primary')`
2. Verify `initThemeEngine()` called before HUD init
3. Look for CSS syntax errors (invalid `var()` usage)

### Animations Stuttering

**Symptom:** Scan lines or value animations judder/skip frames.

**Solution:**
1. Check for heavy game loop operations (profile with DevTools)
2. Verify `requestAnimationFrame` used (not `setInterval`)
3. Reduce number of active animations simultaneously
4. Check GPU usage (backdrop-filter can be expensive on weak GPUs)

### Controls Not Responding

**Symptom:** Sliders/rotaries don't respond to mouse/touch input.

**Solution:**
1. Check for `pointer-events: none` in CSS
2. Verify event listeners attached (check `initSailControl()` called)
3. Look for JavaScript errors in console (breaks event flow)
4. Confirm control elements not covered by higher z-index elements

---

## Future Enhancements

**Planned Features:**
- [ ] Panel collapse/expand animations
- [ ] Mini-map overlay in corner
- [ ] Alert notifications (SOI entry/exit, low fuel warnings)
- [ ] Customizable panel positions (drag to reposition)
- [ ] HUD color themes independent of main theme
- [ ] Voice command integration (Web Speech API)

**Under Consideration:**
- [ ] AR mode (WebXR integration for VR headsets)
- [ ] Mobile-optimized layout (single panel swipe-to-switch)
- [ ] Accessibility audio cues (sonification of values)

---

## References

**Related Documentation:**
- `CLAUDE.md` - Project overview and conventions
- `docs/theming-system-spec.md` - Theme engine documentation
- `reports/glass-cockpit-implementation-plan-2026-02-06.md` - Implementation plan

**External References:**
- [MDN: Backdrop Filter](https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter)
- [MDN: Web Animations API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)

---

**Document Version:** 1.0
**Last Updated:** 2026-02-07
**Maintained By:** Claude Sonnet 4.5
