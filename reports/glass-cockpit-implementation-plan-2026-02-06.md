# Glass Cockpit UX Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the UI from generic Windows 95 aesthetic into a premium glass cockpit HUD with holographic panels, smooth animations, and satisfying interactions.

**Architecture:** Build new HUD components alongside existing UI with feature flag. Use glassmorphic styling, custom rotary/vertical slider controls, and animation system. Reuse existing gameState for data, add hudState for UI-specific state.

**Tech Stack:** Vanilla JavaScript ES6 modules, CSS3 (backdrop-filter, animations, transforms), HTML5 Canvas (existing), requestAnimationFrame for smooth animations.

---

## Task 1: Foundation - HUD State Management & Animation System

**Files:**
- Create: `src/js/core/hudState.js`
- Create: `src/js/lib/animation.js`

**Step 1: Create hudState module for UI-specific state**

Create `src/js/core/hudState.js`:

```javascript
/**
 * HUD State Management
 * UI-specific state separate from game logic
 */

// HUD visibility and panel states
export const hudState = {
  // Feature flag for new HUD
  enabled: true,

  // Display layer overrides (null = auto, true = force show, false = force hide)
  layerOverrides: {
    orbits: null,
    labels: null,
    grid: null,
    starfield: null,
    trajectory: null,
    predictedPath: null,
    encounterMarkers: null,
  },

  // Panel collapse states
  panelStates: {
    timeSpeed: true,
    sailControl: true,
    layers: true,
    navData: true,
  },

  // Tooltip state
  tooltip: {
    visible: false,
    content: '',
    x: 0,
    y: 0,
  },
};

/**
 * Set layer override (null = auto, true = force, false = hide)
 */
export function setLayerOverride(layer, state) {
  if (!(layer in hudState.layerOverrides)) {
    console.warn(`Unknown layer: ${layer}`);
    return;
  }
  hudState.layerOverrides[layer] = state;
}

/**
 * Get effective layer visibility (considering overrides and auto rules)
 */
export function getLayerVisibility(layer, autoValue) {
  const override = hudState.layerOverrides[layer];
  return override === null ? autoValue : override;
}

/**
 * Toggle panel collapsed state
 */
export function togglePanel(panelName) {
  if (!(panelName in hudState.panelStates)) {
    console.warn(`Unknown panel: ${panelName}`);
    return;
  }
  hudState.panelStates[panelName] = !hudState.panelStates[panelName];
}

/**
 * Show tooltip at position
 */
export function showTooltip(content, x, y) {
  hudState.tooltip.visible = true;
  hudState.tooltip.content = content;
  hudState.tooltip.x = x;
  hudState.tooltip.y = y;
}

/**
 * Hide tooltip
 */
export function hideTooltip() {
  hudState.tooltip.visible = false;
}
```

**Step 2: Create animation utilities**

Create `src/js/lib/animation.js`:

```javascript
/**
 * Animation Utilities
 * Smooth value transitions and easing functions
 */

/**
 * Linear interpolation
 * @param {number} start - Start value
 * @param {number} end - End value
 * @param {number} t - Progress (0-1)
 * @returns {number} Interpolated value
 */
export function lerp(start, end, t) {
  return start + (end - start) * t;
}

/**
 * Ease out cubic
 * @param {number} t - Progress (0-1)
 * @returns {number} Eased value (0-1)
 */
export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Ease in out cubic
 * @param {number} t - Progress (0-1)
 * @returns {number} Eased value (0-1)
 */
export function easeInOutCubic(t) {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Animated Value - smoothly transitions between values
 */
export class AnimatedValue {
  constructor(initialValue, duration = 300) {
    this.current = initialValue;
    this.target = initialValue;
    this.start = initialValue;
    this.duration = duration; // ms
    this.startTime = null;
    this.easingFn = easeOutCubic;
  }

  /**
   * Set new target value
   */
  setTarget(value) {
    if (this.target === value) return;

    this.start = this.current;
    this.target = value;
    this.startTime = performance.now();
  }

  /**
   * Update current value (call every frame)
   * @returns {boolean} True if animating, false if complete
   */
  update() {
    if (this.current === this.target) return false;
    if (this.startTime === null) {
      this.current = this.target;
      return false;
    }

    const elapsed = performance.now() - this.startTime;
    const progress = Math.min(elapsed / this.duration, 1);
    const eased = this.easingFn(progress);

    this.current = lerp(this.start, this.target, eased);

    if (progress >= 1) {
      this.current = this.target;
      this.startTime = null;
      return false;
    }

    return true;
  }

  /**
   * Get current value
   */
  getValue() {
    return this.current;
  }

  /**
   * Snap to target immediately
   */
  snap() {
    this.current = this.target;
    this.startTime = null;
  }
}

/**
 * Animation Loop Manager
 * Manages requestAnimationFrame loop separate from game loop
 */
class AnimationLoopManager {
  constructor() {
    this.callbacks = [];
    this.isRunning = false;
    this.rafId = null;
  }

  /**
   * Register animation callback
   * @param {Function} callback - Called every frame with deltaTime
   * @returns {Function} Unregister function
   */
  register(callback) {
    this.callbacks.push(callback);

    if (!this.isRunning) {
      this.start();
    }

    return () => {
      const index = this.callbacks.indexOf(callback);
      if (index !== -1) {
        this.callbacks.splice(index, 1);
      }

      if (this.callbacks.length === 0) {
        this.stop();
      }
    };
  }

  start() {
    this.isRunning = true;
    this.lastTime = performance.now();
    this.loop();
  }

  stop() {
    this.isRunning = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  loop = () => {
    const now = performance.now();
    const deltaTime = now - this.lastTime;
    this.lastTime = now;

    for (const callback of this.callbacks) {
      callback(deltaTime);
    }

    if (this.isRunning) {
      this.rafId = requestAnimationFrame(this.loop);
    }
  };
}

export const animationLoop = new AnimationLoopManager();
```

**Step 3: Commit foundation**

```bash
git add src/js/core/hudState.js src/js/lib/animation.js
git commit -m "feat(hud): add HUD state management and animation utilities

- HUD state for layer overrides, panel states, tooltips
- Animation utilities: lerp, easing, AnimatedValue class
- Animation loop manager separate from game loop

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Visual Foundation - HUD CSS & Base Styles

**Files:**
- Create: `src/css/hud.css`
- Modify: `src/index.html` - Add link to hud.css

**Step 1: Create HUD stylesheet with glassmorphic base styles**

Create `src/css/hud.css`:

```css
/**
 * Glass Cockpit HUD Styles
 * Glassmorphic panels, scan lines, corner brackets
 */

/* ============================================================================
   Base HUD Panel
   ============================================================================ */

.hud-panel {
  position: fixed;
  background: rgba(var(--ui-bgDark-rgb), 0.7);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--ui-primary);
  box-shadow:
    inset 0 0 20px rgba(var(--ui-primary-rgb), 0.1),
    0 4px 12px rgba(0, 0, 0, 0.5);
  padding: 12px;
  font-family: var(--font-primary);
  color: var(--ui-textPrimary);
  transition: opacity 0.2s ease;
}

.hud-panel.collapsed {
  opacity: 0.6;
  pointer-events: none;
}

/* ============================================================================
   Scan Lines Overlay
   ============================================================================ */

.scan-lines {
  position: relative;
  overflow: hidden;
}

.scan-lines::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(var(--ui-primary-rgb), 0.03) 2px,
    rgba(var(--ui-primary-rgb), 0.03) 4px
  );
  pointer-events: none;
  animation: scan 8s linear infinite;
  z-index: 10;
}

@keyframes scan {
  0% {
    transform: translateY(0);
  }
  100% {
    transform: translateY(4px);
  }
}

/* ============================================================================
   Corner Brackets
   ============================================================================ */

.corner-brackets {
  position: relative;
}

.corner-brackets::before,
.corner-brackets::after,
.corner-brackets .corner-tl,
.corner-brackets .corner-tr,
.corner-brackets .corner-bl,
.corner-brackets .corner-br {
  position: absolute;
  width: 12px;
  height: 12px;
  border: 1px solid var(--ui-primary);
  pointer-events: none;
}

/* Top-left */
.corner-brackets::before,
.corner-brackets .corner-tl {
  content: '';
  top: -1px;
  left: -1px;
  border-right: none;
  border-bottom: none;
}

/* Top-right */
.corner-brackets::after,
.corner-brackets .corner-tr {
  content: '';
  top: -1px;
  right: -1px;
  border-left: none;
  border-bottom: none;
}

/* Bottom-left */
.corner-brackets .corner-bl {
  bottom: -1px;
  left: -1px;
  border-right: none;
  border-top: none;
}

/* Bottom-right */
.corner-brackets .corner-br {
  bottom: -1px;
  right: -1px;
  border-left: none;
  border-top: none;
}

.corner-brackets.active::before,
.corner-brackets.active::after,
.corner-brackets.active .corner-tl,
.corner-brackets.active .corner-tr,
.corner-brackets.active .corner-bl,
.corner-brackets.active .corner-br {
  animation: bracketPulse 2s ease-in-out infinite;
}

@keyframes bracketPulse {
  0%, 100% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
}

/* ============================================================================
   Panel Positions (Four-Zone Layout)
   ============================================================================ */

.hud-top-left {
  top: 60px;
  left: 20px;
}

.hud-top-right {
  top: 60px;
  right: 20px;
}

.hud-bottom-left {
  bottom: 20px;
  left: 20px;
}

.hud-bottom-right {
  bottom: 20px;
  right: 20px;
}

/* ============================================================================
   Typography
   ============================================================================ */

.hud-label {
  font-size: var(--font-sizeSmall);
  color: var(--ui-textDim);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 4px;
}

.hud-value {
  font-size: var(--font-sizeMedium);
  color: var(--ui-textPrimary);
  font-weight: bold;
}

.hud-value.highlight {
  color: var(--ui-success);
  text-shadow: 0 0 8px rgba(var(--ui-success-rgb), 0.5);
}

.hud-value.warning {
  color: var(--ui-warning);
  text-shadow: 0 0 8px rgba(var(--ui-warning-rgb), 0.5);
}

.hud-value.danger {
  color: var(--ui-danger);
  text-shadow: 0 0 8px rgba(var(--ui-danger-rgb), 0.5);
  animation: dangerPulse 1s ease-in-out infinite;
}

@keyframes dangerPulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

/* ============================================================================
   Tooltips
   ============================================================================ */

.hud-tooltip {
  position: fixed;
  background: rgba(var(--ui-bgDarker-rgb), 0.95);
  border: 1px solid var(--ui-primary);
  padding: 6px 10px;
  font-size: var(--font-sizeSmall);
  color: var(--ui-textSecondary);
  pointer-events: none;
  z-index: 10000;
  white-space: nowrap;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.hud-tooltip.visible {
  opacity: 1;
}

.hud-tooltip .shortcut {
  color: var(--ui-textDim);
  margin-left: 8px;
  font-size: 10px;
}

/* ============================================================================
   Interactive Elements
   ============================================================================ */

.hud-interactive {
  cursor: pointer;
  transition: all 0.15s ease;
}

.hud-interactive:hover {
  filter: brightness(1.2);
  box-shadow: 0 0 12px rgba(var(--ui-primary-rgb), 0.4);
}

.hud-interactive:active {
  filter: brightness(0.9);
  transform: translateY(1px);
}

/* ============================================================================
   Feature Flag - Hide Old UI When HUD Enabled
   ============================================================================ */

.hud-enabled .left-panel,
.hud-enabled .right-panel,
.hud-enabled .header-bar {
  display: none;
}
```

**Step 2: Link HUD stylesheet in HTML**

Modify `src/index.html` - add after main.css:

```html
<link rel="stylesheet" href="css/main.css">
<link rel="stylesheet" href="css/hud.css">
```

**Step 3: Commit CSS foundation**

```bash
git add src/css/hud.css src/index.html
git commit -m "feat(hud): add glassmorphic panel styles and base CSS

- Glassmorphic panels with backdrop-blur
- Animated scan line overlays
- Corner bracket decorations
- Four-zone cockpit positioning
- Interactive hover states
- Tooltip styling

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Reusable Controls - Vertical Slider Component

**Files:**
- Create: `src/js/ui/hud/VerticalSlider.js`
- Modify: `src/css/hud.css` - Add vertical slider styles

**Step 1: Create VerticalSlider component**

Create `src/js/ui/hud/VerticalSlider.js`:

```javascript
/**
 * Vertical Slider Component
 * Premium vertical slider with smooth animations
 */

import { AnimatedValue } from '../../lib/animation.js';

export class VerticalSlider {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - Parent element
   * @param {string} options.label - Slider label
   * @param {number} options.min - Minimum value
   * @param {number} options.max - Maximum value
   * @param {number} options.value - Initial value
   * @param {string} options.unit - Unit suffix (e.g., '%', '°')
   * @param {number} options.height - Slider height in pixels (default: 100)
   * @param {Function} options.onChange - Callback when value changes
   * @param {Function} options.formatValue - Optional value formatter
   */
  constructor(options) {
    this.options = {
      height: 100,
      formatValue: (val) => val.toFixed(1),
      ...options,
    };

    this.animatedValue = new AnimatedValue(options.value, 150);
    this.isDragging = false;

    this.createElement();
    this.attachEvents();
  }

  createElement() {
    const { label, height, unit, formatValue, value } = this.options;

    this.element = document.createElement('div');
    this.element.className = 'vertical-slider';
    this.element.innerHTML = `
      <div class="slider-label">${label}</div>
      <div class="slider-track-container" style="height: ${height}px">
        <div class="slider-track"></div>
        <div class="slider-fill"></div>
        <div class="slider-thumb"></div>
      </div>
      <div class="slider-value">${formatValue(value)}${unit}</div>
    `;

    this.track = this.element.querySelector('.slider-track-container');
    this.fill = this.element.querySelector('.slider-fill');
    this.thumb = this.element.querySelector('.slider-thumb');
    this.valueDisplay = this.element.querySelector('.slider-value');

    this.options.container.appendChild(this.element);
    this.updateVisuals();
  }

  attachEvents() {
    // Mouse/touch drag
    this.track.addEventListener('mousedown', this.handleStart.bind(this));
    this.track.addEventListener('touchstart', this.handleStart.bind(this), { passive: false });

    // Global mouse/touch move and up
    document.addEventListener('mousemove', this.handleMove.bind(this));
    document.addEventListener('touchmove', this.handleMove.bind(this), { passive: false });
    document.addEventListener('mouseup', this.handleEnd.bind(this));
    document.addEventListener('touchend', this.handleEnd.bind(this));
  }

  handleStart(e) {
    e.preventDefault();
    this.isDragging = true;
    this.element.classList.add('dragging');
    this.updateFromEvent(e);
  }

  handleMove(e) {
    if (!this.isDragging) return;
    e.preventDefault();
    this.updateFromEvent(e);
  }

  handleEnd(e) {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.element.classList.remove('dragging');
  }

  updateFromEvent(e) {
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const rect = this.track.getBoundingClientRect();

    // Calculate position from bottom (inverted Y)
    const relativeY = rect.bottom - clientY;
    const fraction = Math.max(0, Math.min(1, relativeY / rect.height));

    const { min, max } = this.options;
    const newValue = min + fraction * (max - min);

    this.setValue(newValue, false); // Don't animate during drag
  }

  setValue(value, animate = true) {
    const { min, max, onChange } = this.options;
    const clamped = Math.max(min, Math.min(max, value));

    if (animate) {
      this.animatedValue.setTarget(clamped);
    } else {
      this.animatedValue.setTarget(clamped);
      this.animatedValue.snap();
    }

    this.updateVisuals();

    if (onChange) {
      onChange(clamped);
    }
  }

  updateVisuals() {
    const { min, max, unit, formatValue } = this.options;
    const value = this.animatedValue.getValue();
    const fraction = (value - min) / (max - min);
    const percent = fraction * 100;

    this.fill.style.height = `${percent}%`;
    this.thumb.style.bottom = `calc(${percent}% - 8px)`;
    this.valueDisplay.textContent = `${formatValue(value)}${unit}`;
  }

  getValue() {
    return this.animatedValue.getValue();
  }

  destroy() {
    this.element.remove();
  }
}
```

**Step 2: Add vertical slider styles to hud.css**

Add to `src/css/hud.css`:

```css
/* ============================================================================
   Vertical Slider
   ============================================================================ */

.vertical-slider {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.slider-label {
  font-size: var(--font-sizeSmall);
  color: var(--ui-textDim);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.slider-track-container {
  position: relative;
  width: 32px;
  cursor: pointer;
}

.slider-track {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: 4px;
  height: 100%;
  background: rgba(var(--ui-primary-rgb), 0.2);
  border-radius: 2px;
}

.slider-fill {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: 0;
  width: 4px;
  height: 0%;
  background: var(--ui-primary);
  border-radius: 2px;
  box-shadow: 0 0 8px rgba(var(--ui-primary-rgb), 0.6);
  transition: height 0.15s ease-out;
}

.slider-thumb {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: 0;
  width: 16px;
  height: 16px;
  background: var(--ui-primary);
  border: 2px solid var(--ui-bgDark);
  border-radius: 50%;
  box-shadow: 0 0 12px rgba(var(--ui-primary-rgb), 0.8);
  cursor: grab;
  transition: bottom 0.15s ease-out, transform 0.15s ease;
}

.slider-thumb:hover {
  transform: translateX(-50%) scale(1.15);
}

.vertical-slider.dragging .slider-thumb {
  cursor: grabbing;
  transform: translateX(-50%) scale(1.25);
  box-shadow: 0 0 16px rgba(var(--ui-primary-rgb), 1);
}

.slider-value {
  font-size: var(--font-sizeMedium);
  color: var(--ui-textPrimary);
  font-weight: bold;
  min-width: 60px;
  text-align: center;
}
```

**Step 3: Commit vertical slider**

```bash
git add src/js/ui/hud/VerticalSlider.js src/css/hud.css
git commit -m "feat(hud): add premium vertical slider component

- Click-drag or click-to-position interaction
- Smooth animations with AnimatedValue
- Glowing fill and thumb
- Inverted Y axis (bottom = min, top = max)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Reusable Controls - Rotary Control Component

**Files:**
- Create: `src/js/ui/hud/RotaryControl.js`
- Modify: `src/css/hud.css` - Add rotary control styles

**Step 1: Create RotaryControl component**

Create `src/js/ui/hud/RotaryControl.js`:

```javascript
/**
 * Rotary Control Component
 * Screen-native circular dial for angle input
 */

import { AnimatedValue } from '../../lib/animation.js';

export class RotaryControl {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - Parent element
   * @param {string} options.label - Control label
   * @param {number} options.min - Minimum angle (degrees)
   * @param {number} options.max - Maximum angle (degrees)
   * @param {number} options.value - Initial value (degrees)
   * @param {number} options.size - Diameter in pixels (default: 70)
   * @param {Function} options.onChange - Callback when value changes
   */
  constructor(options) {
    this.options = {
      size: 70,
      ...options,
    };

    this.animatedValue = new AnimatedValue(options.value, 150);
    this.isDragging = false;
    this.dragStartAngle = 0;
    this.dragStartValue = 0;

    this.createElement();
    this.attachEvents();
  }

  createElement() {
    const { label, size, value } = this.options;

    this.element = document.createElement('div');
    this.element.className = 'rotary-control';
    this.element.innerHTML = `
      <div class="rotary-label">${label}</div>
      <div class="rotary-dial" style="width: ${size}px; height: ${size}px">
        <svg class="rotary-ring" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="45" class="rotary-track" />
          <circle cx="50" cy="50" r="45" class="rotary-progress" />
        </svg>
        <div class="rotary-indicator"></div>
        <div class="rotary-value">${value.toFixed(1)}°</div>
      </div>
    `;

    this.dial = this.element.querySelector('.rotary-dial');
    this.indicator = this.element.querySelector('.rotary-indicator');
    this.valueDisplay = this.element.querySelector('.rotary-value');
    this.progress = this.element.querySelector('.rotary-progress');

    this.options.container.appendChild(this.element);
    this.updateVisuals();
  }

  attachEvents() {
    this.dial.addEventListener('mousedown', this.handleStart.bind(this));
    this.dial.addEventListener('touchstart', this.handleStart.bind(this), { passive: false });

    document.addEventListener('mousemove', this.handleMove.bind(this));
    document.addEventListener('touchmove', this.handleMove.bind(this), { passive: false });
    document.addEventListener('mouseup', this.handleEnd.bind(this));
    document.addEventListener('touchend', this.handleEnd.bind(this));
  }

  handleStart(e) {
    e.preventDefault();
    this.isDragging = true;
    this.element.classList.add('dragging');

    const rect = this.dial.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    this.dragStartAngle = this.getAngleFromPoint(clientX, clientY, centerX, centerY);
    this.dragStartValue = this.animatedValue.getValue();
  }

  handleMove(e) {
    if (!this.isDragging) return;
    e.preventDefault();

    const rect = this.dial.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const currentAngle = this.getAngleFromPoint(clientX, clientY, centerX, centerY);
    const angleDelta = currentAngle - this.dragStartAngle;

    const newValue = this.dragStartValue + angleDelta;
    this.setValue(newValue, false);
  }

  handleEnd(e) {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.element.classList.remove('dragging');
  }

  getAngleFromPoint(x, y, centerX, centerY) {
    const dx = x - centerX;
    const dy = y - centerY;
    let angle = Math.atan2(dy, dx) * (180 / Math.PI);
    // Convert to 0-360 range
    if (angle < 0) angle += 360;
    // Convert to -180 to 180 range
    if (angle > 180) angle -= 360;
    return angle;
  }

  setValue(value, animate = true) {
    const { min, max, onChange } = this.options;
    const clamped = Math.max(min, Math.min(max, value));

    if (animate) {
      this.animatedValue.setTarget(clamped);
    } else {
      this.animatedValue.setTarget(clamped);
      this.animatedValue.snap();
    }

    this.updateVisuals();

    if (onChange) {
      onChange(clamped);
    }
  }

  updateVisuals() {
    const { min, max } = this.options;
    const value = this.animatedValue.getValue();

    // Rotate indicator line (0° = right, positive = clockwise)
    this.indicator.style.transform = `rotate(${value}deg)`;

    // Update progress circle (arc length)
    const fraction = (value - min) / (max - min);
    const circumference = 2 * Math.PI * 45;
    const dashOffset = circumference * (1 - fraction);
    this.progress.style.strokeDasharray = `${circumference}`;
    this.progress.style.strokeDashoffset = `${dashOffset}`;

    // Update value display
    this.valueDisplay.textContent = `${value.toFixed(1)}°`;
  }

  getValue() {
    return this.animatedValue.getValue();
  }

  destroy() {
    this.element.remove();
  }
}
```

**Step 2: Add rotary control styles to hud.css**

Add to `src/css/hud.css`:

```css
/* ============================================================================
   Rotary Control
   ============================================================================ */

.rotary-control {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.rotary-label {
  font-size: var(--font-sizeSmall);
  color: var(--ui-textDim);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.rotary-dial {
  position: relative;
  cursor: pointer;
  user-select: none;
}

.rotary-ring {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.rotary-track {
  fill: none;
  stroke: rgba(var(--ui-primary-rgb), 0.2);
  stroke-width: 3;
}

.rotary-progress {
  fill: none;
  stroke: var(--ui-primary);
  stroke-width: 3;
  stroke-linecap: round;
  filter: drop-shadow(0 0 4px rgba(var(--ui-primary-rgb), 0.8));
  transition: stroke-dashoffset 0.15s ease-out;
}

.rotary-indicator {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 50%;
  height: 2px;
  background: var(--ui-primary);
  transform-origin: left center;
  box-shadow: 0 0 8px rgba(var(--ui-primary-rgb), 0.8);
  transition: transform 0.15s ease-out;
}

.rotary-indicator::after {
  content: '';
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 6px;
  height: 6px;
  background: var(--ui-primary);
  border-radius: 50%;
  box-shadow: 0 0 6px rgba(var(--ui-primary-rgb), 1);
}

.rotary-value {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: var(--font-sizeSmall);
  color: var(--ui-textPrimary);
  font-weight: bold;
  pointer-events: none;
}

.rotary-control.dragging .rotary-dial {
  cursor: grabbing;
}

.rotary-control.dragging .rotary-indicator {
  box-shadow: 0 0 12px rgba(var(--ui-primary-rgb), 1);
}

.rotary-dial:hover .rotary-indicator {
  box-shadow: 0 0 12px rgba(var(--ui-primary-rgb), 1);
}
```

**Step 3: Commit rotary control**

```bash
git add src/js/ui/hud/RotaryControl.js src/css/hud.css
git commit -m "feat(hud): add screen-native rotary control component

- Circular dial with angle indicator line
- Click-drag to rotate
- Animated progress ring
- Smooth value transitions
- Glowing indicator and ring

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Sail Control Panel (Premium Interaction)

**Files:**
- Create: `src/js/ui/hud/SailControl.js`
- Modify: `src/css/hud.css` - Add sail control specific styles
- Modify: `src/index.html` - Add sail control container

**Step 1: Create SailControl HUD panel**

Create `src/js/ui/hud/SailControl.js`:

```javascript
/**
 * Sail Control HUD Panel
 * Premium sail trimming interface - top-right position
 */

import { VerticalSlider } from './VerticalSlider.js';
import { RotaryControl } from './RotaryControl.js';
import { AnimatedValue, animationLoop } from '../../lib/animation.js';
import { getPlayerShip } from '../../data/ships.js';

export class SailControl {
  constructor() {
    this.container = document.getElementById('hudSailControl');
    if (!this.container) {
      console.error('Sail control container not found');
      return;
    }

    this.thrustArrowRotation = new AnimatedValue(0, 200);
    this.thrustArrowLength = new AnimatedValue(0, 200);

    this.createControls();
    this.setupAnimationLoop();
  }

  createControls() {
    // Clear container
    this.container.innerHTML = '';

    // Create controls container
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'sail-controls-grid';
    this.container.appendChild(controlsDiv);

    const ship = getPlayerShip();

    // Deployment slider (vertical, prominent)
    this.deploymentSlider = new VerticalSlider({
      container: controlsDiv,
      label: 'DEPLOY',
      min: 0,
      max: 100,
      value: ship.sailDeployment * 100,
      unit: '%',
      height: 120,
      onChange: (value) => {
        ship.sailDeployment = value / 100;
      },
    });

    // Yaw rotary control
    this.yawControl = new RotaryControl({
      container: controlsDiv,
      label: 'YAW',
      min: -90,
      max: 90,
      value: ship.sailAngle,
      size: 70,
      onChange: (value) => {
        ship.sailAngle = value;
      },
    });

    // Pitch rotary control
    this.pitchControl = new RotaryControl({
      container: controlsDiv,
      label: 'PITCH',
      min: -90,
      max: 90,
      value: ship.sailPitch,
      size: 70,
      onChange: (value) => {
        ship.sailPitch = value;
      },
    });

    // Thrust visualization
    const thrustViz = document.createElement('div');
    thrustViz.className = 'thrust-visualization';
    thrustViz.innerHTML = `
      <div class="thrust-label">THRUST VECTOR</div>
      <div class="thrust-display">
        <svg class="thrust-arrow" viewBox="0 0 100 100">
          <line x1="50" y1="50" x2="50" y2="20" class="thrust-line" />
          <polygon points="50,15 55,25 45,25" class="thrust-head" />
        </svg>
      </div>
      <div class="thrust-magnitude">
        <span class="data-label">ACCEL</span>
        <span class="data-value highlight" id="thrustValue">0.00 mm/s²</span>
      </div>
    `;
    this.container.appendChild(thrustViz);

    this.thrustArrow = thrustViz.querySelector('.thrust-arrow');
    this.thrustValue = thrustViz.querySelector('#thrustValue');
  }

  setupAnimationLoop() {
    this.unregister = animationLoop.register((deltaTime) => {
      // Update slider/rotary visuals
      this.deploymentSlider.animatedValue.update();
      this.deploymentSlider.updateVisuals();

      this.yawControl.animatedValue.update();
      this.yawControl.updateVisuals();

      this.pitchControl.animatedValue.update();
      this.pitchControl.updateVisuals();

      // Update thrust visualization
      this.updateThrustVisualization();
    });
  }

  updateThrustVisualization() {
    const ship = getPlayerShip();

    // Calculate thrust direction from yaw/pitch
    // Simplified: use yaw as rotation angle
    const targetRotation = ship.sailAngle;
    this.thrustArrowRotation.setTarget(targetRotation);
    this.thrustArrowRotation.update();

    // Calculate thrust magnitude
    const thrust = ship.sailDeployment * Math.cos(ship.sailAngle * Math.PI / 180);
    const targetLength = Math.abs(thrust) * 30; // Scale for visualization
    this.thrustArrowLength.setTarget(targetLength);
    this.thrustArrowLength.update();

    // Apply rotation to arrow
    const rotation = this.thrustArrowRotation.getValue();
    this.thrustArrow.style.transform = `rotate(${rotation}deg)`;

    // Update thrust value display
    // Get actual thrust from ship physics (if available)
    const thrustAccel = 0.5; // Placeholder - get from shipPhysics
    this.thrustValue.textContent = `${thrustAccel.toFixed(2)} mm/s²`;

    // Color based on efficiency
    const efficiency = Math.abs(Math.cos(ship.sailAngle * Math.PI / 180));
    if (efficiency > 0.8) {
      this.thrustValue.className = 'data-value highlight';
    } else if (efficiency > 0.5) {
      this.thrustValue.className = 'data-value warning';
    } else {
      this.thrustValue.className = 'data-value danger';
    }
  }

  destroy() {
    if (this.unregister) {
      this.unregister();
    }
    this.deploymentSlider.destroy();
    this.yawControl.destroy();
    this.pitchControl.destroy();
  }
}

let sailControlInstance = null;

export function initSailControl() {
  if (sailControlInstance) {
    sailControlInstance.destroy();
  }
  sailControlInstance = new SailControl();
}
```

**Step 2: Add sail control styles**

Add to `src/css/hud.css`:

```css
/* ============================================================================
   Sail Control Panel
   ============================================================================ */

#hudSailControl {
  min-width: 240px;
}

.sail-controls-grid {
  display: grid;
  grid-template-columns: auto auto auto;
  gap: 16px;
  align-items: end;
  margin-bottom: 16px;
}

.thrust-visualization {
  border-top: 1px solid rgba(var(--ui-primary-rgb), 0.3);
  padding-top: 12px;
}

.thrust-label {
  font-size: var(--font-sizeSmall);
  color: var(--ui-textDim);
  text-transform: uppercase;
  text-align: center;
  margin-bottom: 8px;
}

.thrust-display {
  width: 80px;
  height: 80px;
  margin: 0 auto 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.thrust-arrow {
  width: 60px;
  height: 60px;
  transition: transform 0.2s ease-out;
}

.thrust-line {
  stroke: var(--ui-success);
  stroke-width: 2;
  stroke-linecap: round;
  filter: drop-shadow(0 0 4px rgba(var(--ui-success-rgb), 0.8));
}

.thrust-head {
  fill: var(--ui-success);
  filter: drop-shadow(0 0 4px rgba(var(--ui-success-rgb), 0.8));
}

.thrust-magnitude {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.data-label {
  font-size: var(--font-sizeSmall);
  color: var(--ui-textDim);
  text-transform: uppercase;
}

.data-value {
  font-size: var(--font-sizeMedium);
  font-weight: bold;
}
```

**Step 3: Add sail control container to HTML**

Modify `src/index.html` - add before closing `</body>`:

```html
<!-- Glass Cockpit HUD -->
<div class="hud-container">
  <!-- Top-right: Sail Control -->
  <div id="hudSailControl" class="hud-panel hud-top-right scan-lines corner-brackets"></div>
</div>
```

**Step 4: Commit sail control panel**

```bash
git add src/js/ui/hud/SailControl.js src/css/hud.css src/index.html
git commit -m "feat(hud): add premium sail control panel

- Vertical deployment slider (120px tall)
- Dual rotary controls for yaw/pitch
- Animated thrust vector visualization
- Real-time updates via animation loop
- Top-right cockpit position

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Time/Speed Control Panel

**Files:**
- Create: `src/js/ui/hud/TimeSpeedControl.js`
- Modify: `src/css/hud.css` - Add time/speed styles
- Modify: `src/index.html` - Add time/speed container

**Step 1: Create TimeSpeedControl panel**

Create `src/js/ui/hud/TimeSpeedControl.js`:

```javascript
/**
 * Time/Speed Control HUD Panel
 * Compact time display and speed presets - top-left position
 */

import { julianDate, timeScale, speedPresets, setTimeScale } from '../../core/gameState.js';
import { julianToDate } from '../../lib/orbital.js';

export class TimeSpeedControl {
  constructor() {
    this.container = document.getElementById('hudTimeSpeed');
    if (!this.container) {
      console.error('Time/speed container not found');
      return;
    }

    this.createPanel();
    this.attachEvents();
  }

  createPanel() {
    this.container.innerHTML = `
      <div class="time-display">
        <div class="time-label">DATE</div>
        <div class="time-value" id="hudDateValue">2020-01-01</div>
      </div>
      <div class="speed-presets">
        <div class="speed-label">SPEED</div>
        <div class="speed-grid" id="speedGrid">
          <button class="speed-btn" data-speed="pause">⏸</button>
          <button class="speed-btn active" data-speed="1x">1x</button>
          <button class="speed-btn" data-speed="100x">100x</button>
          <button class="speed-btn" data-speed="10000x">10K</button>
          <button class="speed-btn" data-speed="100000x">100K</button>
          <button class="speed-btn" data-speed="1000000x">1M</button>
        </div>
        <div class="speed-indicator" id="speedIndicator">1x</div>
      </div>
    `;

    this.dateValue = this.container.querySelector('#hudDateValue');
    this.speedIndicator = this.container.querySelector('#speedIndicator');
    this.speedButtons = this.container.querySelectorAll('.speed-btn');
  }

  attachEvents() {
    this.speedButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const speedKey = btn.dataset.speed;

        if (speedKey === 'pause') {
          setTimeScale(0);
        } else {
          const scale = speedPresets[speedKey];
          if (scale !== undefined) {
            setTimeScale(scale);
          }
        }

        this.updateSpeedIndicator(speedKey);
      });
    });
  }

  updateSpeedIndicator(activeSpeed) {
    this.speedButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.speed === activeSpeed);
    });

    if (activeSpeed === 'pause') {
      this.speedIndicator.textContent = 'PAUSED';
    } else {
      this.speedIndicator.textContent = activeSpeed.toUpperCase();
    }
  }

  update() {
    // Update date display
    const date = julianToDate(julianDate);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    this.dateValue.textContent = dateStr;
  }

  destroy() {
    // Cleanup if needed
  }
}

let timeSpeedInstance = null;

export function initTimeSpeedControl() {
  if (timeSpeedInstance) {
    timeSpeedInstance.destroy();
  }
  timeSpeedInstance = new TimeSpeedControl();
  return timeSpeedInstance;
}

export function updateTimeSpeedControl() {
  if (timeSpeedInstance) {
    timeSpeedInstance.update();
  }
}
```

**Step 2: Add time/speed styles**

Add to `src/css/hud.css`:

```css
/* ============================================================================
   Time/Speed Control Panel
   ============================================================================ */

#hudTimeSpeed {
  min-width: 200px;
}

.time-display {
  margin-bottom: 12px;
}

.time-label {
  font-size: var(--font-sizeSmall);
  color: var(--ui-textDim);
  text-transform: uppercase;
  margin-bottom: 4px;
}

.time-value {
  font-size: var(--font-sizeMedium);
  color: var(--ui-textPrimary);
  font-weight: bold;
  font-family: var(--font-primary);
}

.speed-presets {
  border-top: 1px solid rgba(var(--ui-primary-rgb), 0.3);
  padding-top: 8px;
}

.speed-label {
  font-size: var(--font-sizeSmall);
  color: var(--ui-textDim);
  text-transform: uppercase;
  margin-bottom: 6px;
}

.speed-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  margin-bottom: 8px;
}

.speed-btn {
  background: rgba(var(--ui-primary-rgb), 0.1);
  border: 1px solid rgba(var(--ui-primary-rgb), 0.3);
  color: var(--ui-textPrimary);
  padding: 6px 8px;
  font-size: var(--font-sizeSmall);
  font-family: var(--font-primary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.speed-btn:hover {
  background: rgba(var(--ui-primary-rgb), 0.2);
  border-color: var(--ui-primary);
}

.speed-btn.active {
  background: var(--ui-primary);
  color: var(--ui-bgDark);
  box-shadow: 0 0 8px rgba(var(--ui-primary-rgb), 0.6);
}

.speed-indicator {
  font-size: var(--font-sizeSmall);
  color: var(--ui-textPrimary);
  text-align: center;
  font-weight: bold;
}
```

**Step 3: Add time/speed container to HTML**

Modify `src/index.html` - add to hud-container:

```html
<!-- Glass Cockpit HUD -->
<div class="hud-container">
  <!-- Top-left: Time/Speed Control -->
  <div id="hudTimeSpeed" class="hud-panel hud-top-left scan-lines corner-brackets"></div>

  <!-- Top-right: Sail Control -->
  <div id="hudSailControl" class="hud-panel hud-top-right scan-lines corner-brackets"></div>
</div>
```

**Step 4: Commit time/speed control**

```bash
git add src/js/ui/hud/TimeSpeedControl.js src/css/hud.css src/index.html
git commit -m "feat(hud): add time/speed control panel

- Current date display
- Speed preset grid (pause, 1x, 100x, 10K, 100K, 1M)
- Active speed indicator
- Compact top-left position

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Display Layers Panel (Icon Grid)

**Files:**
- Create: `src/js/ui/hud/LayersPanel.js`
- Modify: `src/css/hud.css` - Add layers panel styles
- Modify: `src/index.html` - Add layers panel container

**Step 1: Create LayersPanel with icon grid**

Create `src/js/ui/hud/LayersPanel.js`:

```javascript
/**
 * Display Layers Panel
 * Icon grid for visibility toggles - bottom-left position
 */

import { displayOptions } from '../../core/gameState.js';
import { setLayerOverride, getLayerVisibility, hudState } from '../../core/hudState.js';
import { showTooltip, hideTooltip } from '../../core/hudState.js';

const LAYERS = [
  { id: 'starfield', icon: '✦', label: 'Star Map', key: 'showStarfield' },
  { id: 'orbits', icon: '○', label: 'Orbital Paths', key: 'showOrbits' },
  { id: 'labels', icon: 'T', label: 'Labels', key: 'showLabels' },
  { id: 'trajectory', icon: '⟶', label: 'Flight Path', key: 'showTrajectory' },
  { id: 'predictedPath', icon: '◈', label: 'Predicted Path', key: 'showPredictedTrajectory' },
  { id: 'encounterMarkers', icon: '⊕', label: 'Encounter Markers', key: 'showIntersectionMarkers' },
  { id: 'grid', icon: '▦', label: 'Grid', key: 'showGrid' },
];

export class LayersPanel {
  constructor() {
    this.container = document.getElementById('hudLayers');
    if (!this.container) {
      console.error('Layers panel container not found');
      return;
    }

    this.createPanel();
    this.attachEvents();
  }

  createPanel() {
    this.container.innerHTML = `
      <div class="layers-header">LAYERS</div>
      <div class="layers-grid" id="layersGrid"></div>
    `;

    this.grid = this.container.querySelector('#layersGrid');

    LAYERS.forEach(layer => {
      const btn = document.createElement('button');
      btn.className = 'layer-toggle';
      btn.dataset.layer = layer.id;
      btn.innerHTML = `<span class="layer-icon">${layer.icon}</span>`;
      btn.title = `${layer.label} (${this.getHotkey(layer.id)})`;

      // Set initial state
      const isActive = displayOptions[layer.key];
      if (isActive) {
        btn.classList.add('active');
      }

      this.grid.appendChild(btn);
    });

    this.buttons = this.grid.querySelectorAll('.layer-toggle');
  }

  attachEvents() {
    this.buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const layerId = btn.dataset.layer;
        this.toggleLayer(layerId, btn);
      });

      // Tooltip on hover
      btn.addEventListener('mouseenter', (e) => {
        const layerId = btn.dataset.layer;
        const layer = LAYERS.find(l => l.id === layerId);
        if (layer) {
          const rect = btn.getBoundingClientRect();
          showTooltip(
            `${layer.label} <span class="shortcut">${this.getHotkey(layerId)}</span>`,
            rect.left + rect.width / 2,
            rect.top - 8
          );
        }
      });

      btn.addEventListener('mouseleave', () => {
        hideTooltip();
      });
    });
  }

  toggleLayer(layerId, btn) {
    const layer = LAYERS.find(l => l.id === layerId);
    if (!layer) return;

    // Toggle in displayOptions
    displayOptions[layer.key] = !displayOptions[layer.key];

    // Update button state
    btn.classList.toggle('active', displayOptions[layer.key]);

    // Set override in hudState (force current state)
    setLayerOverride(layerId, displayOptions[layer.key]);
  }

  getHotkey(layerId) {
    // Placeholder - actual hotkeys would be defined elsewhere
    const hotkeys = {
      starfield: 'S',
      orbits: 'O',
      labels: 'L',
      trajectory: 'F',
      predictedPath: 'P',
      encounterMarkers: 'E',
      grid: 'G',
    };
    return hotkeys[layerId] || '?';
  }

  destroy() {
    // Cleanup
  }
}

let layersPanelInstance = null;

export function initLayersPanel() {
  if (layersPanelInstance) {
    layersPanelInstance.destroy();
  }
  layersPanelInstance = new LayersPanel();
}
```

**Step 2: Add layers panel styles**

Add to `src/css/hud.css`:

```css
/* ============================================================================
   Display Layers Panel
   ============================================================================ */

#hudLayers {
  min-width: 200px;
}

.layers-header {
  font-size: var(--font-sizeSmall);
  color: var(--ui-textDim);
  text-transform: uppercase;
  margin-bottom: 8px;
  text-align: center;
}

.layers-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.layer-toggle {
  width: 40px;
  height: 40px;
  background: rgba(var(--ui-primary-rgb), 0.1);
  border: 1px solid rgba(var(--ui-primary-rgb), 0.3);
  color: var(--ui-textDim);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.layer-toggle:hover {
  background: rgba(var(--ui-primary-rgb), 0.2);
  border-color: var(--ui-primary);
  color: var(--ui-textPrimary);
}

.layer-toggle.active {
  background: rgba(var(--ui-primary-rgb), 0.3);
  border-color: var(--ui-primary);
  color: var(--ui-textPrimary);
  box-shadow:
    inset 0 0 8px rgba(var(--ui-primary-rgb), 0.4),
    0 0 12px rgba(var(--ui-primary-rgb), 0.3);
}

.layer-toggle.active .layer-icon {
  filter: drop-shadow(0 0 4px rgba(var(--ui-primary-rgb), 0.8));
}

.layer-icon {
  font-size: 18px;
  line-height: 1;
}
```

**Step 3: Add layers panel container to HTML**

Modify `src/index.html` - add to hud-container:

```html
<!-- Glass Cockpit HUD -->
<div class="hud-container">
  <!-- Top-left: Time/Speed Control -->
  <div id="hudTimeSpeed" class="hud-panel hud-top-left scan-lines corner-brackets"></div>

  <!-- Top-right: Sail Control -->
  <div id="hudSailControl" class="hud-panel hud-top-right scan-lines corner-brackets"></div>

  <!-- Bottom-left: Display Layers -->
  <div id="hudLayers" class="hud-panel hud-bottom-left scan-lines corner-brackets"></div>
</div>
```

**Step 4: Commit layers panel**

```bash
git add src/js/ui/hud/LayersPanel.js src/css/hud.css src/index.html
git commit -m "feat(hud): add display layers icon grid panel

- 7 layer toggles (starfield, orbits, labels, etc)
- Icon-based compact design
- Glow effect when active
- Tooltips with hotkeys
- Bottom-left position

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Navigation Data Panel

**Files:**
- Create: `src/js/ui/hud/NavDataPanel.js`
- Modify: `src/css/hud.css` - Add nav data styles
- Modify: `src/index.html` - Add nav data container

**Step 1: Create NavDataPanel**

Create `src/js/ui/hud/NavDataPanel.js`:

```javascript
/**
 * Navigation Data Panel
 * Target info, distance, intercept time, delta-v - bottom-right position
 */

import { AnimatedValue, animationLoop } from '../../lib/animation.js';
import { navState } from '../../core/navigation.js';
import { getPlayerShip } from '../../data/ships.js';

export class NavDataPanel {
  constructor() {
    this.container = document.getElementById('hudNavData');
    if (!this.container) {
      console.error('Nav data container not found');
      return;
    }

    this.animatedDistance = new AnimatedValue(0, 300);
    this.animatedDeltaV = new AnimatedValue(0, 300);

    this.createPanel();
    this.setupAnimationLoop();
  }

  createPanel() {
    this.container.innerHTML = `
      <div class="nav-target">
        <div class="target-label">TARGET</div>
        <div class="target-name" id="targetName">NONE</div>
      </div>
      <div class="nav-data-grid">
        <div class="nav-data-row">
          <span class="data-label">DISTANCE</span>
          <span class="data-value" id="distanceValue">-- AU</span>
        </div>
        <div class="nav-data-row">
          <span class="data-label">INTERCEPT</span>
          <span class="data-value" id="interceptValue">--</span>
        </div>
        <div class="nav-data-row">
          <span class="data-label">DELTA-V</span>
          <span class="data-value" id="deltaVValue">
            <span class="dv-bar-container">
              <span class="dv-bar-fill" id="dvBarFill" style="width: 100%"></span>
            </span>
            5.0 km/s
          </span>
        </div>
      </div>
    `;

    this.targetName = this.container.querySelector('#targetName');
    this.distanceValue = this.container.querySelector('#distanceValue');
    this.interceptValue = this.container.querySelector('#interceptValue');
    this.deltaVValue = this.container.querySelector('#deltaVValue');
    this.dvBarFill = this.container.querySelector('#dvBarFill');
  }

  setupAnimationLoop() {
    this.unregister = animationLoop.register((deltaTime) => {
      this.update();
    });
  }

  update() {
    // Update target name
    const target = navState.destination;
    if (target) {
      this.targetName.textContent = target.name.toUpperCase();
    } else {
      this.targetName.textContent = 'NONE';
    }

    // Update distance (with animation)
    const distance = navState.distanceToDestination || 0;
    this.animatedDistance.setTarget(distance);
    this.animatedDistance.update();
    const displayDistance = this.animatedDistance.getValue();
    this.distanceValue.textContent = `${displayDistance.toFixed(3)} AU`;

    // Update intercept time
    const interceptDays = navState.timeToIntercept;
    if (interceptDays !== null && interceptDays !== Infinity) {
      const days = Math.floor(interceptDays);
      const hours = Math.floor((interceptDays - days) * 24);
      this.interceptValue.textContent = `${days}d ${hours}h`;
    } else {
      this.interceptValue.textContent = '--';
    }

    // Update delta-v with fuel bar
    const ship = getPlayerShip();
    const deltaV = ship.thrusterDeltaV || 5.0;
    const maxDeltaV = 10.0; // Max possible

    this.animatedDeltaV.setTarget(deltaV);
    this.animatedDeltaV.update();
    const displayDeltaV = this.animatedDeltaV.getValue();

    const percent = (displayDeltaV / maxDeltaV) * 100;
    this.dvBarFill.style.width = `${percent}%`;

    // Color based on remaining fuel
    if (percent > 60) {
      this.dvBarFill.style.background = 'var(--ui-success)';
    } else if (percent > 30) {
      this.dvBarFill.style.background = 'var(--ui-warning)';
    } else {
      this.dvBarFill.style.background = 'var(--ui-danger)';
    }

    // Update text
    const dvText = this.deltaVValue.querySelector('span:last-child') || this.deltaVValue;
    if (dvText.tagName !== 'SPAN') {
      this.deltaVValue.innerHTML = `
        <span class="dv-bar-container">
          <span class="dv-bar-fill" id="dvBarFill" style="width: ${percent}%"></span>
        </span>
        ${displayDeltaV.toFixed(1)} km/s
      `;
      this.dvBarFill = this.container.querySelector('#dvBarFill');
    } else {
      dvText.textContent = `${displayDeltaV.toFixed(1)} km/s`;
    }
  }

  destroy() {
    if (this.unregister) {
      this.unregister();
    }
  }
}

let navDataInstance = null;

export function initNavDataPanel() {
  if (navDataInstance) {
    navDataInstance.destroy();
  }
  navDataInstance = new NavDataPanel();
}
```

**Step 2: Add nav data styles**

Add to `src/css/hud.css`:

```css
/* ============================================================================
   Navigation Data Panel
   ============================================================================ */

#hudNavData {
  min-width: 220px;
}

.nav-target {
  margin-bottom: 12px;
}

.target-label {
  font-size: var(--font-sizeSmall);
  color: var(--ui-textDim);
  text-transform: uppercase;
  margin-bottom: 4px;
}

.target-name {
  font-size: var(--font-sizeMedium);
  color: var(--ui-textPrimary);
  font-weight: bold;
  text-shadow: 0 0 8px rgba(var(--ui-primary-rgb), 0.5);
}

.nav-data-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-top: 1px solid rgba(var(--ui-primary-rgb), 0.3);
  padding-top: 12px;
}

.nav-data-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
}

.dv-bar-container {
  display: inline-block;
  width: 60px;
  height: 4px;
  background: rgba(var(--ui-primary-rgb), 0.2);
  border-radius: 2px;
  overflow: hidden;
  vertical-align: middle;
  margin-right: 8px;
}

.dv-bar-fill {
  display: block;
  height: 100%;
  background: var(--ui-success);
  border-radius: 2px;
  transition: width 0.3s ease, background 0.3s ease;
  box-shadow: 0 0 4px currentColor;
}
```

**Step 3: Add nav data container to HTML**

Modify `src/index.html` - add to hud-container:

```html
<!-- Glass Cockpit HUD -->
<div class="hud-container">
  <!-- Top-left: Time/Speed Control -->
  <div id="hudTimeSpeed" class="hud-panel hud-top-left scan-lines corner-brackets"></div>

  <!-- Top-right: Sail Control -->
  <div id="hudSailControl" class="hud-panel hud-top-right scan-lines corner-brackets"></div>

  <!-- Bottom-left: Display Layers -->
  <div id="hudLayers" class="hud-panel hud-bottom-left scan-lines corner-brackets"></div>

  <!-- Bottom-right: Navigation Data -->
  <div id="hudNavData" class="hud-panel hud-bottom-right scan-lines corner-brackets"></div>
</div>
```

**Step 4: Commit nav data panel**

```bash
git add src/js/ui/hud/NavDataPanel.js src/css/hud.css src/index.html
git commit -m "feat(hud): add navigation data panel

- Target name display
- Distance to target (animated)
- Time to intercept countdown
- Delta-v remaining with inline fuel bar
- Color-coded fuel status (green/yellow/red)
- Bottom-right position

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 9: Tooltip System

**Files:**
- Create: `src/js/ui/hud/Tooltip.js`
- Modify: `src/index.html` - Add tooltip container

**Step 1: Create Tooltip component**

Create `src/js/ui/hud/Tooltip.js`:

```javascript
/**
 * Tooltip System
 * Shows contextual help on hover
 */

import { hudState } from '../../core/hudState.js';

export class Tooltip {
  constructor() {
    this.element = document.getElementById('hudTooltip');
    if (!this.element) {
      console.error('Tooltip container not found');
      return;
    }

    this.hideTimeout = null;
    this.updateLoop();
  }

  updateLoop() {
    requestAnimationFrame(() => {
      this.update();
      this.updateLoop();
    });
  }

  update() {
    const { visible, content, x, y } = hudState.tooltip;

    if (visible && content) {
      this.element.innerHTML = content;
      this.element.classList.add('visible');

      // Position tooltip intelligently
      const rect = this.element.getBoundingClientRect();

      // Center horizontally on cursor
      let left = x - rect.width / 2;
      // Position above cursor
      let top = y - rect.height - 12;

      // Keep within viewport
      const margin = 10;
      left = Math.max(margin, Math.min(window.innerWidth - rect.width - margin, left));
      top = Math.max(margin, top);

      this.element.style.left = `${left}px`;
      this.element.style.top = `${top}px`;
    } else {
      this.element.classList.remove('visible');
    }
  }

  destroy() {
    // Cleanup
  }
}

let tooltipInstance = null;

export function initTooltip() {
  if (tooltipInstance) {
    tooltipInstance.destroy();
  }
  tooltipInstance = new Tooltip();
}
```

**Step 2: Add tooltip container to HTML**

Modify `src/index.html` - add after hud-container:

```html
<!-- Glass Cockpit HUD -->
<div class="hud-container">
  <!-- ... existing panels ... -->
</div>

<!-- Tooltip -->
<div id="hudTooltip" class="hud-tooltip"></div>
```

**Step 3: Commit tooltip system**

```bash
git add src/js/ui/hud/Tooltip.js src/index.html
git commit -m "feat(hud): add tooltip system

- Shows contextual help on hover
- Intelligent positioning (stays in viewport)
- Reads from hudState.tooltip
- Smooth fade in/out

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 10: HUD Initialization & Integration

**Files:**
- Modify: `src/js/main.js` - Initialize HUD system
- Modify: `src/index.html` - Add body class for feature flag

**Step 1: Initialize HUD in main.js**

Modify `src/js/main.js` - add after theme engine init:

```javascript
import { initThemeEngine } from './core/themeEngine.js';
import { initSailControl } from './ui/hud/SailControl.js';
import { initTimeSpeedControl, updateTimeSpeedControl } from './ui/hud/TimeSpeedControl.js';
import { initLayersPanel } from './ui/hud/LayersPanel.js';
import { initNavDataPanel } from './ui/hud/NavDataPanel.js';
import { initTooltip } from './ui/hud/Tooltip.js';

async function init() {
  await initThemeEngine();

  // Initialize HUD components
  initSailControl();
  initTimeSpeedControl();
  initLayersPanel();
  initNavDataPanel();
  initTooltip();

  // ... rest of init
}
```

Modify game loop to update time/speed display:

```javascript
function updateUI() {
  updateTimeSpeedControl();
  // ... existing UI updates
}
```

**Step 2: Enable HUD with body class**

Modify `src/index.html` - add class to body:

```html
<body class="hud-enabled">
```

**Step 3: Test HUD visibility**

Open browser, verify:
- Old UI hidden (left/right panels, header bar)
- Four HUD panels visible at corners
- Sail controls interactive
- Speed buttons work
- Layer toggles work
- Tooltips appear on hover

**Step 4: Commit HUD integration**

```bash
git add src/js/main.js src/index.html
git commit -m "feat(hud): integrate glass cockpit HUD system

- Initialize all HUD panels in main.js
- Enable HUD with body class (hides old UI)
- Update time/speed in game loop
- Feature flag ready for A/B testing

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 11: Polish - Animation Timing & Visual Refinement

**Files:**
- Modify: `src/css/hud.css` - Refine animations and colors

**Step 1: Tune animation timings**

Review and adjust:
- Scan line speed (currently 8s)
- Bracket pulse timing (currently 2s)
- Hover transition speeds (currently 0.15s)
- Value animation durations (AnimatedValue: 150-300ms)

**Step 2: Refine visual hierarchy**

Adjust:
- Panel opacity/blur amounts
- Border brightness
- Glow intensities
- Font sizes for better readability

**Step 3: Test with different themes**

Switch themes (press T), verify:
- All panels use theme colors correctly
- Glows/shadows use RGB variants
- Scan lines visible but subtle
- Corner brackets pulse smoothly

**Step 4: Commit polish**

```bash
git add src/css/hud.css
git commit -m "polish(hud): refine animations and visual hierarchy

- Tune scan line and pulse timings
- Adjust glow intensities for better visibility
- Ensure theme colors applied consistently
- Improve readability across themes

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 12: Documentation & Final Testing

**Files:**
- Modify: `CLAUDE.md` - Document new HUD system
- Create: `docs/hud-system.md` - HUD architecture docs

**Step 1: Update CLAUDE.md**

Add section about Glass Cockpit HUD:

```markdown
## Glass Cockpit HUD

**NEW**: Glassmorphic HUD replaces old panel-based UI.

**Four-Zone Layout:**
- Top-left: Time/Speed Control
- Top-right: Sail Control (premium vertical/rotary sliders)
- Bottom-left: Display Layers (icon grid)
- Bottom-right: Navigation Data

**Feature Flag:** Add `hud-enabled` class to `<body>` to enable HUD.

**Components:** `src/js/ui/hud/`
- `SailControl.js` - Premium sail trimming interface
- `TimeSpeedControl.js` - Date and speed presets
- `LayersPanel.js` - Display layer toggles
- `NavDataPanel.js` - Target telemetry
- `VerticalSlider.js` - Reusable vertical slider
- `RotaryControl.js` - Reusable rotary dial
- `Tooltip.js` - Contextual help system

**Styling:** `src/css/hud.css` - Glassmorphic panels, scan lines, animations

**State:** `src/js/core/hudState.js` - UI-specific state, layer overrides

**Animation:** `src/js/lib/animation.js` - Smooth value transitions, easing
```

**Step 2: Create architecture documentation**

Create `docs/hud-system.md` with component diagrams, state flow, extension guide.

**Step 3: Final testing checklist**

Test:
- [ ] All four panels visible and positioned correctly
- [ ] Sail controls update ship state
- [ ] Speed buttons change time scale
- [ ] Layer toggles show/hide canvas elements
- [ ] Nav data updates in real-time
- [ ] Tooltips appear on hover with correct positioning
- [ ] Animations smooth at 60fps
- [ ] Theme switching updates all HUD colors
- [ ] No console errors
- [ ] Old UI completely hidden with `.hud-enabled`

**Step 4: Commit documentation**

```bash
git add CLAUDE.md docs/hud-system.md
git commit -m "docs(hud): add glass cockpit HUD documentation

- Update CLAUDE.md with HUD overview
- Add architecture documentation
- Document component API and extension points

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Success Criteria Verification

After completing all tasks, verify:

**Visual:**
- [ ] Glassmorphic panels with backdrop-blur
- [ ] Animated scan lines visible but subtle
- [ ] Corner brackets pulse when active
- [ ] Clear visual hierarchy (size + brightness)
- [ ] Theme colors applied consistently

**Interaction:**
- [ ] Vertical slider feels smooth and precise
- [ ] Rotary controls natural to use
- [ ] Layer toggles responsive
- [ ] Tooltips helpful without being intrusive
- [ ] All controls keyboard-accessible

**Functional:**
- [ ] Feature parity with old UI (all controls work)
- [ ] No regressions in game functionality
- [ ] Animations smooth at 60fps
- [ ] Old UI hidden with feature flag

**Performance:**
- [ ] No jank during interactions
- [ ] Animation loop efficient
- [ ] DOM updates batched appropriately

---

## Notes

- **Feature Flag:** The `hud-enabled` class on `<body>` allows A/B testing and gradual rollout
- **Extension:** New panels can be added by following existing component patterns
- **Mobile:** This phase targets desktop; mobile responsiveness is future work
- **Radial Menu:** Deferred to future phase (V key for display layers)
- **Direct Manipulation:** Deferred to future phase (drag trajectory to adjust sail)

---

## Estimated Time

- Tasks 1-4 (Foundation + Controls): 2-3 hours
- Tasks 5-8 (HUD Panels): 2-3 hours
- Tasks 9-10 (Tooltip + Integration): 1 hour
- Tasks 11-12 (Polish + Docs): 1 hour

**Total:** 6-8 hours for complete glass cockpit HUD implementation.
