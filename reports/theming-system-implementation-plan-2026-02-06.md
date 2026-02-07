# Theming System Implementation Plan

**Date:** 2026-02-06
**Status:** Draft
**Feature:** Complete UI Theming System with Customization

## 0. File Impact Summary

### Files to CREATE:
1. `src/js/core/themeEngine.js` - Core theme management engine (color abstraction, CSS injection, theme storage)
2. `src/js/ui/themeSelector.js` - Theme selector modal component with preview and import/export
3. `src/themes/default.json` - Default coral theme (current colors)
4. `src/themes/deep-space-blue.json` - DS9-inspired dark blue theme
5. `src/themes/wing-commander.json` - Military HUD orange/green theme
6. `src/themes/cyberpunk-neon.json` - High-contrast neon theme
7. `src/themes/solar-wind.json` - Yellow/orange solar theme
8. `src/themes/void-black.json` - Pure black minimal theme
9. `src/themes/ice-hauler.json` - Cool blue/white outer system theme
10. `src/themes/mars-runner.json` - Red/orange inner system theme
11. `src/themes/nav-chart-classic.json` - Vintage navigation chart theme
12. `src/themes/smuggler-green.json` - Low-light green tactical theme
13. `src/themes/high-contrast.json` - Accessibility WCAG AAA theme
14. `src/themes/index.json` - Theme registry with metadata

### Files to EDIT:
1. `src/index.html` - Add theme selector button, modal markup, `<style id="theme-vars">` injection point
2. `src/css/main.css` - Expand CSS variables, replace hardcoded colors, add font variables
3. `src/js/config.js` - Add COLOR_PALETTE constant for default theme
4. `src/js/ui/renderer.js` - Replace hardcoded colors with `getColor()` calls
5. `src/js/ui/controls.js` - Add keyboard shortcut `T` for theme selector
6. `src/js/core/saveState.js` - Include active theme in save/load state
7. `src/js/core/gameState.js` - Add theme state management
8. `src/js/main.js` - Import themeEngine, apply saved theme on startup

### Files to DELETE:
- None

## 1. Problem Statement

### 1.1 Description

The current UI has hardcoded colors scattered across CSS and JavaScript, making it impossible for users to customize the visual experience. Sailors pride themselves on their star charts, but the game provides no way to personalize the display to match individual aesthetic preferences or accessibility needs.

**Core Problems:**
1. Colors hardcoded in 100+ locations across CSS and renderer.js
2. No way to save/load/share visual themes
3. No accessibility options (high-contrast mode)
4. Aesthetic locked to single coral/dark theme
5. Font families hardcoded 98+ times in CSS
6. No preview of visual changes before applying
7. Game world aesthetic (early space travel, DS9, cyberpunk) not reflected in theme options

### 1.2 Root Cause

The game was built without a theming system - colors were chosen during initial development and hardcoded directly into rendering logic. No abstraction layer exists between color values and their usage.

**Specific issues:**
- CSS custom properties exist but are inconsistently used
- Canvas rendering uses raw RGB/RGBA strings
- No single source of truth for color palette
- Font families copied/pasted across stylesheet
- No user-facing customization UI

### 1.3 Constraints

**Technical:**
- Must maintain 60 FPS rendering performance (gradient cache, efficient CSS updates)
- Must work on mobile (theme selector responsive design)
- Must support all modern browsers (CSS variables supported)
- LocalStorage size limits (~5-10MB, theme JSONs ~5-10KB each)

**Design:**
- No fluff - every color must serve a purpose
- Themes must reflect game world aesthetic (early space travel, DS9, cyberpunk, Wing Commander)
- Star colors remain realistic (user directive: "don't touch stars unless making them better")
- Planet colors can be overridden but default to realistic

**User Experience:**
- Theme changes must apply instantly (no page reload)
- Theme must persist across sessions
- Import/export must be simple (drag-drop JSON)
- Preview changes before applying

**Code Quality:**
- No function removal (user directive)
- Follow existing patterns (gameState, saveState, ui-components)
- Atomic, testable units of work
- No over-engineering

## 2. Solution Architecture

### 2.1 High-Level Design

```
┌──────────────────────────────────────────────────────────────┐
│                     THEME LAYER                              │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │         Theme Definition (JSON)                    │    │
│  │  {                                                 │    │
│  │    name: "Deep Space Blue",                        │    │
│  │    colors: {                                       │    │
│  │      ui: { primary: "#4c8de8", ... },              │    │
│  │      canvas: { grid: "#4c8de8", ... },             │    │
│  │      bodies: { EARTH: "#4c9ee8", ... },            │    │
│  │      ships: { player: "#00d9ff", ... }             │    │
│  │    },                                              │    │
│  │    fonts: { primary: "...", header: "..." }        │    │
│  │  }                                                 │    │
│  └────────────────────────────────────────────────────┘    │
│                           │                                 │
│                           ▼                                 │
│  ┌────────────────────────────────────────────────────┐    │
│  │         themeEngine.js                             │    │
│  │  • loadTheme(json)                                 │    │
│  │  • applyTheme(name)                                │    │
│  │  • getColor(path, alpha)                           │    │
│  │  • exportTheme(name) → JSON                        │    │
│  │  • importTheme(json)                               │    │
│  │  • saveCustomTheme(json)                           │    │
│  │  • getAvailableThemes() → list                     │    │
│  └────────────────────────────────────────────────────┘    │
│         │                                         │         │
│         ▼                                         ▼         │
│  ┌──────────────┐                    ┌─────────────────┐   │
│  │ CSS Layer    │                    │ Canvas Layer    │   │
│  │ (DOM)        │                    │ (renderer.js)   │   │
│  │              │                    │                 │   │
│  │ Inject CSS   │                    │ getColor() API  │   │
│  │ variables    │                    │ replaces RGBA   │   │
│  │ into <style> │                    │ hardcoding      │   │
│  └──────────────┘                    └─────────────────┘   │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                    USER INTERFACE                            │
│  ┌────────────────────────────────────────────────────┐     │
│  │         themeSelector.js                           │     │
│  │  • Theme list (built-in + custom)                  │     │
│  │  • Preview panel (live rendering sample)           │     │
│  │  • Apply/Reset buttons                             │     │
│  │  • Import/Export buttons                           │     │
│  │  • "Save as Custom" for modifications              │     │
│  └────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                     PERSISTENCE                              │
│  • localStorage: 'activeTheme' (current theme name)          │
│  • localStorage: 'userThemes' (array of custom themes)       │
│  • saveState: include theme in exported game state           │
└──────────────────────────────────────────────────────────────┘
```

**Data Flow:**

1. **Startup:**
   - main.js loads themeEngine
   - themeEngine reads `activeTheme` from localStorage (or uses "default")
   - themeEngine loads theme JSON (from bundled themes or userThemes)
   - themeEngine applies theme (inject CSS vars, expose color palette)

2. **Runtime:**
   - renderer.js calls `getColor('canvas.grid', 0.1)` → returns `rgba(...)`
   - CSS references `var(--color-primary)` → resolved from injected vars

3. **Theme Change:**
   - User selects theme in themeSelector
   - themeEngine applies new theme
   - CSS variables update instantly (browser re-paints DOM)
   - Gradient cache clears (canvas gradients regenerate)
   - Renderer.js calls `getColor()` → returns new colors
   - Next frame draws with new theme

4. **Custom Theme:**
   - User modifies colors in theme editor
   - User saves as custom theme
   - themeEngine stores in `userThemes` localStorage
   - Theme appears in theme selector

5. **Import/Export:**
   - User exports theme → themeEngine serializes to JSON → downloads file
   - User imports theme → file reader → themeEngine validates → adds to userThemes

### 2.2 Design Principles

**1. Single Source of Truth**
- **Principle:** Theme JSON is the sole definition of all colors and fonts
- **Rationale:** Avoids drift between CSS, JS config, and renderer
- **Implementation:** All color references go through themeEngine.getColor()

**2. Separation of Concerns**
- **Principle:** Theme definition, theme engine, and theme UI are independent modules
- **Rationale:** Testable, maintainable, extensible
- **Implementation:** Three modules (themeEngine.js, themeSelector.js, theme JSONs)

**3. Progressive Enhancement**
- **Principle:** Themes enhance visuals but don't break core functionality
- **Rationale:** Invalid theme shouldn't crash game
- **Implementation:** Validation + fallback to default theme on error

**4. Performance First**
- **Principle:** Theme changes must not degrade performance
- **Rationale:** 60 FPS rendering is critical for smooth gameplay
- **Implementation:** Efficient CSS variable updates, gradient cache invalidation

**5. Aesthetic Authenticity**
- **Principle:** Themes reflect game world (early space travel, DS9, cyberpunk)
- **Rationale:** Visual identity reinforces world-building
- **Implementation:** 10 curated themes matching aesthetic pillars

**6. User Empowerment**
- **Principle:** Users control their visual experience completely
- **Rationale:** Sailors pride themselves on their star charts
- **Implementation:** Full customization + import/export for sharing

### 2.3 Theme JSON Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["name", "version", "colors"],
  "properties": {
    "name": {
      "type": "string",
      "description": "Human-readable theme name",
      "example": "Deep Space Blue"
    },
    "version": {
      "type": "string",
      "description": "Theme format version (semver)",
      "example": "1.0.0"
    },
    "author": {
      "type": "string",
      "description": "Theme creator name (optional)",
      "example": "MattCam2007"
    },
    "description": {
      "type": "string",
      "description": "Brief theme description (optional)",
      "example": "DS9-inspired dark blue theme for deep space operations"
    },
    "tags": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Theme categories (optional)",
      "example": ["dark", "blue", "ds9", "military"]
    },
    "colors": {
      "type": "object",
      "required": ["ui", "canvas"],
      "properties": {
        "ui": {
          "type": "object",
          "description": "CSS/DOM colors",
          "properties": {
            "primary": { "type": "string", "format": "color" },
            "primaryDim": { "type": "string", "format": "color" },
            "primaryBright": { "type": "string", "format": "color" },
            "secondary": { "type": "string", "format": "color" },
            "success": { "type": "string", "format": "color" },
            "warning": { "type": "string", "format": "color" },
            "danger": { "type": "string", "format": "color" },
            "bgDark": { "type": "string", "format": "color" },
            "bgDarker": { "type": "string", "format": "color" },
            "bgPanel": { "type": "string", "format": "color" },
            "bgPanelRaised": { "type": "string", "format": "color" },
            "textPrimary": { "type": "string", "format": "color" },
            "textSecondary": { "type": "string", "format": "color" },
            "textDim": { "type": "string", "format": "color" },
            "textBright": { "type": "string", "format": "color" },
            "borderPrimary": { "type": "string", "format": "color" },
            "borderSecondary": { "type": "string", "format": "color" },
            "cyan": { "type": "string", "format": "color" },
            "cyanDim": { "type": "string", "format": "color" },
            "purple": { "type": "string", "format": "color" },
            "orange": { "type": "string", "format": "color" },
            "green": { "type": "string", "format": "color" },
            "blue": { "type": "string", "format": "color" }
          }
        },
        "canvas": {
          "type": "object",
          "description": "Canvas rendering colors",
          "properties": {
            "grid": { "type": "string", "format": "color" },
            "gridAlpha": { "type": "number", "minimum": 0, "maximum": 1 },
            "orbitPrimary": { "type": "string", "format": "color" },
            "orbitPrimaryAlpha": { "type": "number", "minimum": 0, "maximum": 1 },
            "orbitSecondary": { "type": "string", "format": "color" },
            "orbitSecondaryAlpha": { "type": "number", "minimum": 0, "maximum": 1 },
            "orbitMoon": { "type": "string", "format": "color" },
            "orbitMoonAlpha": { "type": "number", "minimum": 0, "maximum": 1 },
            "shipOrbitElliptic": { "type": "string", "format": "color" },
            "shipOrbitEllipticAlpha": { "type": "number", "minimum": 0, "maximum": 1 },
            "shipOrbitHyperbolic": { "type": "string", "format": "color" },
            "shipOrbitHyperbolicAlpha": { "type": "number", "minimum": 0, "maximum": 1 },
            "shipOrbitSOI": { "type": "string", "format": "color" },
            "shipOrbitSOIAlpha": { "type": "number", "minimum": 0, "maximum": 1 },
            "trajectory": { "type": "string", "format": "color" },
            "trajectoryAlpha": { "type": "number", "minimum": 0, "maximum": 1 },
            "trajectoryPoint": { "type": "string", "format": "color" },
            "label": { "type": "string", "format": "color" },
            "labelAlpha": { "type": "number", "minimum": 0, "maximum": 1 },
            "labelBg": { "type": "string", "format": "color" },
            "labelBgAlpha": { "type": "number", "minimum": 0, "maximum": 1 },
            "intersectionMarker": { "type": "string", "format": "color" },
            "intersectionMarkerAlpha": { "type": "number", "minimum": 0, "maximum": 1 },
            "intersectionLabel": { "type": "string", "format": "color" },
            "soiBoundary": { "type": "string", "format": "color" },
            "soiBoundaryAlpha": { "type": "number", "minimum": 0, "maximum": 1 },
            "shipIcon": { "type": "string", "format": "color" }
          }
        },
        "bodies": {
          "type": "object",
          "description": "Celestial body colors (optional overrides)",
          "patternProperties": {
            "^[A-Z_]+$": { "type": "string", "format": "color" }
          },
          "example": {
            "SOL": "#ffdd44",
            "EARTH": "#4c9ee8",
            "MARS": "#e85d4c"
          }
        },
        "ships": {
          "type": "object",
          "description": "Ship colors",
          "properties": {
            "player": { "type": "string", "format": "color" }
          }
        }
      }
    },
    "fonts": {
      "type": "object",
      "description": "Font configuration",
      "properties": {
        "primary": { "type": "string", "example": "'Share Tech Mono', monospace" },
        "header": { "type": "string", "example": "'Orbitron', sans-serif" },
        "sizeBase": { "type": "string", "example": "11px" },
        "sizeSmall": { "type": "string", "example": "10px" },
        "sizeMedium": { "type": "string", "example": "12px" },
        "sizeHeader": { "type": "string", "example": "14px" }
      }
    },
    "effects": {
      "type": "object",
      "description": "Visual effects",
      "properties": {
        "glowSm": { "type": "string", "example": "0 0 5px" },
        "glowMd": { "type": "string", "example": "0 0 10px" },
        "glowLg": { "type": "string", "example": "0 0 20px" },
        "glowXl": { "type": "string", "example": "0 0 40px" }
      }
    }
  }
}
```

**Example Theme (Default Coral):**
```json
{
  "name": "Default Coral",
  "version": "1.0.0",
  "author": "MattCam2007",
  "description": "Original coral/dark theme - the first star charts",
  "tags": ["dark", "coral", "original", "default"],
  "colors": {
    "ui": {
      "primary": "#e85d4c",
      "primaryDim": "#a83d30",
      "primaryBright": "#ff6f5e",
      "secondary": "#4c9ee8",
      "success": "#4ce88d",
      "warning": "#e8944c",
      "danger": "#e84c4c",
      "bgDark": "#0a0a0a",
      "bgDarker": "#050505",
      "bgPanel": "#111111",
      "bgPanelRaised": "#1a1a1a",
      "textPrimary": "#e85d4c",
      "textSecondary": "#ffffff",
      "textDim": "#a83d30",
      "textBright": "#ff6f5e",
      "borderPrimary": "#e85d4c",
      "borderSecondary": "#4c9ee8",
      "cyan": "#00d9ff",
      "cyanDim": "#0088aa",
      "purple": "#b53dff",
      "orange": "#e8944c",
      "green": "#4ce88d",
      "blue": "#4c9ee8"
    },
    "canvas": {
      "grid": "#e85d4c",
      "gridAlpha": 0.1,
      "orbitPrimary": "#e85d4c",
      "orbitPrimaryAlpha": 0.3,
      "orbitSecondary": "#e85d4c",
      "orbitSecondaryAlpha": 0.15,
      "orbitMoon": "#e85d4c",
      "orbitMoonAlpha": 0.15,
      "shipOrbitElliptic": "#4ce88d",
      "shipOrbitEllipticAlpha": 0.5,
      "shipOrbitHyperbolic": "#64c8ff",
      "shipOrbitHyperbolicAlpha": 0.7,
      "shipOrbitSOI": "#4c8de8",
      "shipOrbitSOIAlpha": 0.6,
      "trajectory": "#c864ff",
      "trajectoryAlpha": 0.8,
      "trajectoryPoint": "#c864ff",
      "label": "#e85d4c",
      "labelAlpha": 0.8,
      "labelBg": "#0a0a0a",
      "labelBgAlpha": 0.7,
      "intersectionMarker": "#e85d4c",
      "intersectionMarkerAlpha": 0.3,
      "intersectionLabel": "#e85d4c",
      "soiBoundary": "#4ce88d",
      "soiBoundaryAlpha": 0.2,
      "shipIcon": "#4ce88d"
    },
    "bodies": {},
    "ships": {
      "player": "#4ce88d"
    }
  },
  "fonts": {
    "primary": "'Share Tech Mono', monospace",
    "header": "'Orbitron', sans-serif",
    "sizeBase": "11px",
    "sizeSmall": "10px",
    "sizeMedium": "12px",
    "sizeHeader": "14px"
  },
  "effects": {
    "glowSm": "0 0 5px",
    "glowMd": "0 0 10px",
    "glowLg": "0 0 20px",
    "glowXl": "0 0 40px"
  }
}
```

### 2.4 Theme Engine API

**themeEngine.js exports:**

```javascript
/**
 * Load a theme definition into the engine.
 * @param {object} themeDefinition - Parsed theme JSON
 * @throws {Error} if theme is invalid
 */
export function loadTheme(themeDefinition);

/**
 * Apply a theme by name (built-in or custom).
 * Updates CSS variables and canvas color palette.
 * @param {string} themeName - Name of theme to apply
 * @throws {Error} if theme not found
 */
export function applyTheme(themeName);

/**
 * Get a color from the active theme.
 * Supports nested paths (e.g., 'canvas.grid', 'ui.primary').
 * Optionally override alpha channel.
 * @param {string} path - Dot-separated path to color
 * @param {number} [alpha] - Optional alpha override (0-1)
 * @returns {string} - Color in rgba(...) or hex format
 * @example
 *   getColor('canvas.grid', 0.5) → 'rgba(232, 93, 76, 0.5)'
 *   getColor('ui.primary') → '#e85d4c'
 */
export function getColor(path, alpha);

/**
 * Get the currently active theme definition.
 * @returns {object} - Active theme JSON
 */
export function getActiveTheme();

/**
 * Get list of all available themes (built-in + custom).
 * @returns {Array<{name, author, description, tags, builtin}>}
 */
export function getAvailableThemes();

/**
 * Save a custom theme to localStorage.
 * @param {object} themeDefinition - Theme JSON
 * @throws {Error} if validation fails
 */
export function saveCustomTheme(themeDefinition);

/**
 * Delete a custom theme from localStorage.
 * @param {string} themeName - Name of custom theme to delete
 * @throws {Error} if theme is built-in or not found
 */
export function deleteCustomTheme(themeName);

/**
 * Export a theme as JSON string.
 * @param {string} themeName - Theme to export
 * @returns {string} - JSON string
 */
export function exportTheme(themeName);

/**
 * Import a theme from JSON string.
 * Validates and adds to custom themes.
 * @param {string} jsonString - Theme JSON
 * @returns {string} - Name of imported theme
 * @throws {Error} if invalid JSON or validation fails
 */
export function importTheme(jsonString);

/**
 * Reset to default theme and clear custom themes.
 */
export function resetToDefault();

/**
 * Initialize theme engine on startup.
 * Loads saved theme from localStorage or uses default.
 */
export function initThemeEngine();
```

### 2.5 Color Abstraction Layer

**Conversion logic:**

```javascript
// Internal helper: parse color string to RGBA object
function parseColor(colorString) {
  // Handle hex: #rrggbb or #rgb
  // Handle rgb(r, g, b) or rgba(r, g, b, a)
  // Returns: { r, g, b, a }
}

// Internal helper: convert RGBA object to string
function rgbaToString(rgba) {
  const { r, g, b, a } = rgba;
  if (a === 1) return `rgb(${r}, ${g}, ${b})`;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// Public API: get color with optional alpha override
export function getColor(path, alpha = null) {
  const color = getNestedProperty(activeTheme.colors, path);
  if (!color) {
    console.warn(`Color not found: ${path}, using fallback`);
    return 'rgba(232, 93, 76, 1)'; // Fallback to default primary
  }

  // If color is already defined with alpha (e.g., canvas.gridAlpha)
  const alphaProp = path + 'Alpha';
  const defaultAlpha = getNestedProperty(activeTheme.colors, alphaProp) ?? 1;

  const rgba = parseColor(color);
  rgba.a = alpha ?? defaultAlpha;

  return rgbaToString(rgba);
}
```

**CSS variable injection:**

```javascript
function injectCSSVariables(theme) {
  const root = document.documentElement;
  const { ui, effects } = theme.colors;
  const { fonts } = theme;

  // Inject UI colors
  Object.entries(ui).forEach(([key, value]) => {
    const varName = camelToKebab(key); // 'primaryDim' → 'primary-dim'
    root.style.setProperty(`--${varName}`, value);
  });

  // Inject fonts
  Object.entries(fonts).forEach(([key, value]) => {
    const varName = camelToKebab(key);
    root.style.setProperty(`--font-${varName}`, value);
  });

  // Inject effects
  Object.entries(effects).forEach(([key, value]) => {
    const varName = camelToKebab(key);
    root.style.setProperty(`--${varName}`, value);
  });
}
```

**Gradient cache invalidation:**

```javascript
// In renderer.js
import { onThemeChange } from '../core/themeEngine.js';

// Subscribe to theme changes
onThemeChange(() => {
  clearGradientCache();
});
```

## 3. Units of Work

### Unit 1: Theme Engine Core
**Description:** Create themeEngine.js with color abstraction and theme loading.

**Files:**
- CREATE: `src/js/core/themeEngine.js`

**Implementation:**
1. Define `activeTheme` module-level state
2. Implement `parseColor()` and `rgbaToString()` helpers
3. Implement `getColor(path, alpha)` with nested property lookup
4. Implement `loadTheme(themeDefinition)` with validation
5. Implement `applyTheme(themeName)` (no CSS injection yet, just state update)
6. Implement `getActiveTheme()` getter
7. Add unit tests (importable test module)

**Acceptance Criteria:**
- [ ] `getColor('ui.primary')` returns hex color from loaded theme
- [ ] `getColor('canvas.grid', 0.5)` returns rgba with alpha override
- [ ] `loadTheme()` throws error on invalid theme (missing required fields)
- [ ] `applyTheme()` updates `activeTheme` state
- [ ] Console tests pass (color parsing, alpha override)

**Test Method:**
```javascript
// Browser console
import { loadTheme, getColor } from '/js/core/themeEngine.js';
const testTheme = { name: "Test", version: "1.0.0", colors: { ui: { primary: "#ff0000" }, canvas: {} } };
loadTheme(testTheme);
console.assert(getColor('ui.primary') === '#ff0000', 'Primary color should be red');
```

---

### Unit 2: Default Theme JSON
**Description:** Create default.json with current theme colors extracted from CSS/renderer.js.

**Files:**
- CREATE: `src/themes/default.json`

**Implementation:**
1. Extract all CSS variable values from main.css (:root)
2. Extract all hardcoded colors from renderer.js (grid, orbits, labels, etc.)
3. Map to theme JSON schema
4. Add metadata (name, author, description, tags)
5. Validate JSON syntax and schema compliance

**Acceptance Criteria:**
- [ ] JSON is valid and parses without errors
- [ ] All required fields present (name, version, colors.ui, colors.canvas)
- [ ] Colors match current visual appearance
- [ ] Can be loaded by themeEngine (Unit 1)

**Test Method:**
```javascript
// Browser console
fetch('/themes/default.json')
  .then(r => r.json())
  .then(theme => {
    console.log('Default theme loaded:', theme.name);
    loadTheme(theme);
    console.log('Primary color:', getColor('ui.primary'));
  });
```

---

### Unit 3: Theme Storage and Retrieval
**Description:** Add localStorage persistence for theme preference and custom themes.

**Files:**
- MODIFY: `src/js/core/themeEngine.js`

**Implementation:**
1. Add `BUILT_IN_THEMES` constant (array of bundled theme names)
2. Implement `getAvailableThemes()` - list built-in + custom themes
3. Implement `saveCustomTheme(themeDefinition)` - save to `localStorage['userThemes']`
4. Implement `deleteCustomTheme(themeName)` - remove from userThemes
5. Implement `loadThemeFromStorage(themeName)` - fetch built-in (from /themes/) or custom (from userThemes)
6. Update `applyTheme(themeName)` to:
   - Load theme from storage
   - Update activeTheme state
   - Save active theme name to `localStorage['activeTheme']`
7. Implement `initThemeEngine()` - load saved theme on startup (or default)

**Acceptance Criteria:**
- [ ] `saveCustomTheme()` stores theme in localStorage
- [ ] `getAvailableThemes()` returns both built-in and custom themes
- [ ] `applyTheme('default')` loads from /themes/default.json
- [ ] `applyTheme('My Custom')` loads from userThemes
- [ ] `initThemeEngine()` restores last used theme
- [ ] localStorage usage is <1KB per theme

**Test Method:**
```javascript
// Browser console
const customTheme = { ...defaultTheme, name: "My Custom" };
saveCustomTheme(customTheme);
console.log(getAvailableThemes()); // Should include "My Custom"
applyTheme('My Custom');
console.assert(getActiveTheme().name === 'My Custom', 'Custom theme should be active');
```

---

### Unit 4: CSS Variable Injection
**Description:** Inject theme colors into CSS custom properties at runtime.

**Files:**
- MODIFY: `src/js/core/themeEngine.js`
- MODIFY: `src/index.html` (add `<style id="theme-vars"></style>` injection point)

**Implementation:**
1. Add `injectCSSVariables(theme)` function
2. Generate CSS custom property declarations from theme.colors.ui
3. Inject into `<style id="theme-vars">` element
4. Call from `applyTheme()` after loading theme
5. Add theme change event emitter (`onThemeChange(callback)`)

**Acceptance Criteria:**
- [ ] CSS variables injected into DOM on theme change
- [ ] `getComputedStyle(document.documentElement).getPropertyValue('--primary')` returns theme color
- [ ] CSS rules using `var(--primary)` update instantly
- [ ] Multiple theme switches work correctly (no variable leaks)

**Test Method:**
```javascript
// Browser console
applyTheme('default');
const primary = getComputedStyle(document.documentElement).getPropertyValue('--primary');
console.log('CSS --primary:', primary); // Should match theme.colors.ui.primary
```

---

### Unit 5: CSS Refactoring - Variables
**Description:** Expand CSS custom properties and replace hardcoded colors in main.css.

**Files:**
- MODIFY: `src/css/main.css`

**Implementation:**
1. Expand `:root` variable declarations (add all ui.* colors from theme schema)
2. Add font variables (`--font-primary`, `--font-header`, `--font-size-*`)
3. Replace all hardcoded hex/rgb colors with `var(...)` references
   - Example: `color: #e85d4c` → `color: var(--primary)`
   - Example: `background: rgba(232, 93, 76, 0.6)` → `background: rgba(var(--primary-rgb), 0.6)`
   - Note: For rgba with opacity, need separate RGB variables (e.g., `--primary-rgb: 232, 93, 76`)
4. Replace all font-family declarations with `var(--font-primary)` or `var(--font-header)`
5. Test visual parity (no appearance changes yet, just refactoring)

**Acceptance Criteria:**
- [ ] No hardcoded hex/rgb colors remain in main.css (search for `#` and `rgb(`)
- [ ] All colors use `var(--...)` references
- [ ] All fonts use `var(--font-...)` references
- [ ] Visual appearance identical to before refactoring
- [ ] Theme changes propagate to all UI elements

**Test Method:**
- Visual inspection (UI should look identical)
- grep check: `grep -E '#[0-9a-f]{3,6}|rgba?\(' src/css/main.css` (should return minimal matches)

---

### Unit 6: Renderer Color Abstraction
**Description:** Replace hardcoded colors in renderer.js with getColor() calls.

**Files:**
- MODIFY: `src/js/ui/renderer.js`

**Implementation:**
1. Import `{ getColor } from '../core/themeEngine.js'`
2. Replace all hardcoded colors:
   - Grid: `rgba(232, 93, 76, ${alpha})` → `getColor('canvas.grid', alpha)`
   - Orbits: `rgba(232, 93, 76, 0.3)` → `getColor('canvas.orbitPrimary')`
   - Ship orbit: `rgba(76, 232, 141, 0.5)` → `getColor('canvas.shipOrbitElliptic')`
   - Trajectory: `rgba(200, 100, 255, ${alpha})` → `getColor('canvas.trajectory', alpha)`
   - Labels: `rgba(232, 93, 76, 0.8)` → `getColor('canvas.label')`
   - All other canvas colors (~30+ locations)
3. Update gradient construction (sun, corona) to use `getColor()`
4. Test visual parity (appearance should be identical)

**Acceptance Criteria:**
- [ ] No hardcoded rgba/hex strings remain in renderer.js (search for `'rgba('` and `'#'`)
- [ ] All colors retrieved via `getColor()`
- [ ] Visual appearance identical to before refactoring
- [ ] Theme changes affect canvas rendering immediately

**Test Method:**
- Visual inspection (canvas should look identical)
- grep check: `grep -E "'rgba?\\(|'#[0-9a-f]{3,6}" src/js/ui/renderer.js` (should return minimal matches)
- Switch themes and verify canvas colors change

---

### Unit 7: Gradient Cache Invalidation
**Description:** Clear gradient cache when theme changes to regenerate gradients with new colors.

**Files:**
- MODIFY: `src/js/ui/renderer.js`
- MODIFY: `src/js/core/themeEngine.js`

**Implementation:**
1. Export `clearGradientCache()` from renderer.js
2. In themeEngine.js, import `clearGradientCache()`
3. Call `clearGradientCache()` in `applyTheme()` after CSS injection
4. Emit `onThemeChange` event after cache clear
5. Test that gradients regenerate with new colors

**Acceptance Criteria:**
- [ ] Gradient cache cleared on theme change
- [ ] Gradients regenerate with new theme colors
- [ ] No visual artifacts (stale gradients with old colors)
- [ ] Performance remains 60 FPS (cache regeneration is fast)

**Test Method:**
- Switch themes and verify sun/corona colors change immediately
- Check performance (FPS should remain stable)

---

### Unit 8: Theme Selector Modal - Structure
**Description:** Create themeSelector.js with modal HTML and basic open/close logic.

**Files:**
- CREATE: `src/js/ui/themeSelector.js`
- MODIFY: `src/index.html` (add modal markup)

**Implementation:**
1. Add theme selector modal HTML to index.html (after `.save-load-modal`)
   - Modal backdrop
   - Modal container with close button
   - Theme list container (empty, populated by JS)
   - Action buttons (Apply, Reset, Import, Export)
2. Create themeSelector.js with `initThemeSelector()` function
3. Implement modal open/close logic
4. Add ESC key to close modal
5. Add backdrop click to close modal
6. Export `openThemeSelector()` and `closeThemeSelector()`

**Acceptance Criteria:**
- [ ] Modal opens when `openThemeSelector()` called
- [ ] Modal closes when close button clicked
- [ ] Modal closes on ESC key press
- [ ] Modal closes on backdrop click
- [ ] Modal is mobile-responsive (slides up on mobile)

**Test Method:**
```javascript
// Browser console
import { openThemeSelector } from '/js/ui/themeSelector.js';
openThemeSelector(); // Modal should appear
// Press ESC or click backdrop → modal should close
```

---

### Unit 9: Theme List Rendering
**Description:** Populate theme selector modal with list of available themes.

**Files:**
- MODIFY: `src/js/ui/themeSelector.js`

**Implementation:**
1. Import `{ getAvailableThemes, getActiveTheme } from '../core/themeEngine.js'`
2. Create `renderThemeList()` function
3. Fetch available themes and render as list items
4. Highlight currently active theme
5. Add click handlers to select theme (update selection state, don't apply yet)
6. Show theme metadata (name, author, description, tags)
7. Add "Built-in" vs "Custom" badges

**Acceptance Criteria:**
- [ ] Theme list populates on modal open
- [ ] Active theme is highlighted
- [ ] Built-in themes show "Built-in" badge
- [ ] Custom themes show "Custom" badge (and delete button)
- [ ] Clicking theme updates selection (visual feedback)

**Test Method:**
- Open theme selector → should see list of themes
- Active theme should be highlighted
- Click different theme → selection should update

---

### Unit 10: Theme Preview
**Description:** Show live preview of selected theme before applying.

**Files:**
- MODIFY: `src/js/ui/themeSelector.js`
- MODIFY: `src/index.html` (add preview panel to modal)

**Implementation:**
1. Add preview panel to modal (shows sample UI and canvas elements)
2. Create `renderThemePreview(theme)` function
3. On theme selection, load theme and render preview
4. Preview shows:
   - Sample UI colors (primary, secondary, backgrounds)
   - Sample canvas elements (grid line, orbit, trajectory, label)
   - Font samples
5. Update preview on theme selection change

**Acceptance Criteria:**
- [ ] Preview panel shows sample UI elements
- [ ] Preview updates when theme selection changes
- [ ] Preview accurately represents theme colors
- [ ] Preview is responsive (works on mobile)

**Test Method:**
- Select different themes → preview should update
- Compare preview to actual theme (should match)

---

### Unit 11: Apply Theme Button
**Description:** Wire up "Apply" button to activate selected theme.

**Files:**
- MODIFY: `src/js/ui/themeSelector.js`

**Implementation:**
1. Add click handler to "Apply" button
2. Get selected theme name from selection state
3. Call `applyTheme(themeName)` from themeEngine
4. Update UI to reflect active theme
5. Close modal after applying
6. Show confirmation toast (optional, "Theme applied: [name]")

**Acceptance Criteria:**
- [ ] "Apply" button activates selected theme
- [ ] UI and canvas update with new colors
- [ ] Modal closes after applying
- [ ] Active theme persists to localStorage

**Test Method:**
- Open theme selector, select theme, click Apply
- UI should update with new colors
- Refresh page → theme should persist

---

### Unit 12: Import/Export Buttons
**Description:** Add import/export functionality for theme JSON files.

**Files:**
- MODIFY: `src/js/ui/themeSelector.js`

**Implementation:**
1. Import `{ importTheme, exportTheme } from '../core/themeEngine.js'`
2. Add "Export" button click handler:
   - Get selected theme
   - Call `exportTheme(themeName)` → JSON string
   - Create download link with JSON blob
   - Trigger download (`[theme-name].json`)
3. Add "Import" button click handler:
   - Open file picker (accept .json)
   - Read file as text
   - Call `importTheme(jsonString)`
   - Refresh theme list (include newly imported theme)
   - Show success toast
4. Add drag-and-drop import:
   - Listen for drag-over and drop events on modal
   - Read dropped file
   - Import theme
5. Add error handling (invalid JSON, validation failures)

**Acceptance Criteria:**
- [ ] "Export" button downloads theme JSON file
- [ ] "Import" button opens file picker and imports theme
- [ ] Drag-and-drop file onto modal imports theme
- [ ] Invalid JSON shows error message
- [ ] Imported theme appears in theme list
- [ ] Imported theme is saved to localStorage (userThemes)

**Test Method:**
- Export theme → file should download
- Import exported file → theme should appear in list
- Drag-drop JSON file → theme should import
- Import invalid JSON → error message should appear

---

### Unit 13: Reset to Default
**Description:** Add "Reset to Default" button to clear custom themes and revert to default.

**Files:**
- MODIFY: `src/js/ui/themeSelector.js`

**Implementation:**
1. Add "Reset to Default" button click handler
2. Show confirmation dialog ("This will delete all custom themes. Continue?")
3. If confirmed:
   - Call `resetToDefault()` from themeEngine
   - Clear userThemes from localStorage
   - Apply default theme
   - Refresh theme list
   - Show success toast
4. If cancelled, do nothing

**Acceptance Criteria:**
- [ ] "Reset to Default" button shows confirmation dialog
- [ ] Confirming resets to default theme
- [ ] All custom themes are deleted
- [ ] Theme list updates to show only built-in themes
- [ ] Cancelling does nothing

**Test Method:**
- Create custom theme, click "Reset to Default"
- Confirm → should revert to default, custom theme should be gone

---

### Unit 14: Keyboard Shortcut
**Description:** Add keyboard shortcut `T` to open theme selector.

**Files:**
- MODIFY: `src/js/ui/controls.js`

**Implementation:**
1. Import `{ openThemeSelector } from './themeSelector.js'`
2. Add key listener for `T` key
3. Call `openThemeSelector()` on `T` press
4. Ensure shortcut doesn't conflict with existing shortcuts
5. Add to keyboard shortcuts help (if help screen exists)

**Acceptance Criteria:**
- [ ] Pressing `T` opens theme selector modal
- [ ] Shortcut works from main game view
- [ ] Shortcut documented in CLAUDE.md

**Test Method:**
- Press `T` → theme selector should open

---

### Unit 15: Save State Integration
**Description:** Include active theme in game save/load system.

**Files:**
- MODIFY: `src/js/core/saveState.js`
- MODIFY: `src/js/core/gameState.js`

**Implementation:**
1. Add `activeThemeName` to gameState.js exports
2. In saveState.js `exportGameState()`:
   - Include `activeTheme: getActiveTheme().name` in exported JSON
3. In saveState.js `importGameState()`:
   - Extract `activeTheme` from imported JSON
   - Call `applyTheme(activeTheme)` if theme exists
   - Fall back to 'default' if theme not found
4. Test save/load preserves theme

**Acceptance Criteria:**
- [ ] Exporting game state includes active theme name
- [ ] Importing game state restores active theme
- [ ] If imported theme doesn't exist, falls back to default (no crash)
- [ ] Save/load workflow unchanged (backward compatible)

**Test Method:**
- Apply theme, export game state
- Inspect JSON → should include theme name
- Import game state → theme should be restored

---

### Unit 16: Main.js Initialization
**Description:** Initialize theme engine on game startup.

**Files:**
- MODIFY: `src/js/main.js`

**Implementation:**
1. Import `{ initThemeEngine } from './core/themeEngine.js'`
2. Call `initThemeEngine()` before game loop starts
3. Ensure theme loaded before first render
4. Handle errors gracefully (fall back to default theme)

**Acceptance Criteria:**
- [ ] Theme engine initializes on page load
- [ ] Saved theme applied before first render
- [ ] Default theme applied if no saved theme
- [ ] No FOUC (flash of unstyled content)

**Test Method:**
- Reload page → saved theme should be active immediately
- Clear localStorage, reload → default theme should apply

---

### Unit 17: Create 10 Bundled Themes
**Description:** Use sub-agents to create 10 diverse theme JSON files matching game aesthetic.

**Files:**
- CREATE: `src/themes/deep-space-blue.json`
- CREATE: `src/themes/wing-commander.json`
- CREATE: `src/themes/cyberpunk-neon.json`
- CREATE: `src/themes/solar-wind.json`
- CREATE: `src/themes/void-black.json`
- CREATE: `src/themes/ice-hauler.json`
- CREATE: `src/themes/mars-runner.json`
- CREATE: `src/themes/nav-chart-classic.json`
- CREATE: `src/themes/smuggler-green.json`
- CREATE: `src/themes/high-contrast.json`

**Implementation:**
1. Spawn 10 parallel sub-agents, each creating one theme
2. Each agent receives:
   - Theme JSON schema
   - Default theme as reference
   - Aesthetic requirements (game world, DS9, cyberpunk, etc.)
   - Specific theme brief (e.g., "DS9-inspired dark blue theme")
3. Agents create complete theme JSON with:
   - Cohesive color palette
   - Appropriate metadata (name, description, tags)
   - All required fields
4. Validate each theme JSON
5. Save to src/themes/

**Acceptance Criteria:**
- [ ] 10 theme JSON files created
- [ ] Each theme has unique, cohesive aesthetic
- [ ] All themes validate against JSON schema
- [ ] Themes reflect game world aesthetic (early space, DS9, cyberpunk)
- [ ] High-contrast theme meets WCAG AAA standards

**Test Method:**
- Load each theme and verify visual cohesion
- Check high-contrast theme with accessibility tools

---

### Unit 18: Theme Registry
**Description:** Create index.json theme registry with metadata for all bundled themes.

**Files:**
- CREATE: `src/themes/index.json`

**Implementation:**
1. Create index.json with array of theme metadata
2. Each entry includes:
   - `name` - Theme name (matches theme JSON)
   - `file` - Filename (e.g., "default.json")
   - `author` - Creator name
   - `description` - Brief description
   - `tags` - Array of tags (e.g., ["dark", "blue", "ds9"])
   - `featured` - Boolean (highlight in UI)
3. Update `getAvailableThemes()` to fetch from index.json

**Acceptance Criteria:**
- [ ] index.json lists all bundled themes
- [ ] Metadata is accurate and descriptive
- [ ] `getAvailableThemes()` uses index.json
- [ ] Theme selector shows metadata correctly

**Test Method:**
```javascript
fetch('/themes/index.json')
  .then(r => r.json())
  .then(index => console.log('Themes:', index));
// Should list all 11 themes (default + 10 new)
```

---

### Unit 19: Mobile Responsive Theme Selector
**Description:** Ensure theme selector modal works on mobile devices.

**Files:**
- MODIFY: `src/css/main.css` (theme selector styles)
- MODIFY: `src/js/ui/themeSelector.js`

**Implementation:**
1. Add mobile-specific CSS (modal slides up from bottom on mobile)
2. Adjust preview panel for mobile (stack vertically)
3. Touch gesture support (swipe to close modal)
4. Test on various viewport sizes (320px - 768px)
5. Ensure theme list is scrollable on mobile

**Acceptance Criteria:**
- [ ] Theme selector opens on mobile (slides up animation)
- [ ] Theme list scrollable on mobile
- [ ] Preview panel adapts to narrow screens
- [ ] Touch gestures work (swipe to close)
- [ ] Buttons are touch-friendly (44px min tap target)

**Test Method:**
- Resize browser to 375px width
- Open theme selector → should slide up from bottom
- Scroll theme list → should work smoothly
- Swipe down → modal should close

---

### Unit 20: Documentation and Polish
**Description:** Update CLAUDE.md, add inline documentation, final testing.

**Files:**
- MODIFY: `CLAUDE.md` (document theming system)
- MODIFY: `src/js/core/themeEngine.js` (JSDoc comments)
- MODIFY: `src/js/ui/themeSelector.js` (JSDoc comments)

**Implementation:**
1. Add "Theming System" section to CLAUDE.md:
   - Keyboard shortcut (`T`)
   - How to create custom themes
   - How to import/export themes
   - Theme JSON schema reference
2. Add JSDoc comments to all public functions
3. Add inline comments for complex logic
4. Create `THEME_CREATION_GUIDE.md` (optional, for advanced users)
5. Final visual regression testing
6. Final performance testing

**Acceptance Criteria:**
- [ ] CLAUDE.md documents theming system
- [ ] All public functions have JSDoc comments
- [ ] Code is well-commented and maintainable
- [ ] Visual regression tests pass (no unintended changes)
- [ ] Performance tests pass (60 FPS maintained)

**Test Method:**
- Read CLAUDE.md → should be clear and complete
- Review code → should be well-documented
- Run all console tests → should pass
- Visual inspection → should look polished

---

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **CSS variable browser compatibility** | Low | High | CSS variables supported in all modern browsers (Safari 9.1+, Chrome 49+, Firefox 31+). No polyfill needed. |
| **LocalStorage size limits** | Medium | Medium | Limit custom themes to 20 max. Monitor localStorage usage. Each theme ~5-10KB, 20 themes ~100-200KB (well within 5MB limit). |
| **Performance degradation from CSS updates** | Low | High | CSS variable updates are GPU-accelerated and very fast. Gradient cache clearing is one-time cost. Test maintains 60 FPS. |
| **Gradient cache invalidation bugs** | Medium | Medium | Clear cache on theme change. Add visual regression tests. |
| **Theme JSON validation failures** | Medium | Low | Robust validation with helpful error messages. Fall back to default theme on errors. |
| **Import/export UX confusion** | Medium | Low | Clear labels, drag-and-drop support, confirmation dialogs. User testing. |
| **Theme conflicts with game state** | Low | Medium | Theme is separate from game state. If imported theme missing, fall back to default. |
| **Mobile theme selector UX** | Medium | Medium | Dedicated mobile testing, touch gestures, responsive design. |
| **Color contrast accessibility** | Medium | High | Include high-contrast theme (WCAG AAA). Test with accessibility tools. |
| **Theme creation complexity** | High | Low | Provide detailed theme creation guide. Start with "clone and modify" workflow. |
| **Breaking changes to theme format** | Low | High | Include version field in theme JSON. Handle version migrations gracefully. |

## 5. Testing Strategy

### 5.1 Unit Tests

**themeEngine.js:**
- [ ] Color parsing (hex, rgb, rgba) → RGBA object
- [ ] RGBA object → string conversion
- [ ] `getColor()` with nested paths
- [ ] `getColor()` with alpha override
- [ ] Theme validation (missing required fields)
- [ ] Theme validation (invalid color formats)
- [ ] Theme loading and applying
- [ ] Custom theme save/load
- [ ] Theme import/export (JSON serialization)

**themeSelector.js:**
- [ ] Modal open/close
- [ ] Theme list rendering
- [ ] Theme selection state
- [ ] Preview rendering
- [ ] Import/export file handling

### 5.2 Integration Tests

**Full workflow tests:**
- [ ] Apply theme → UI and canvas update
- [ ] Switch theme → colors change immediately
- [ ] Save custom theme → appears in theme list
- [ ] Export theme → downloads JSON
- [ ] Import theme → adds to custom themes
- [ ] Delete custom theme → removed from list
- [ ] Reset to default → clears custom themes
- [ ] Save game state → includes theme
- [ ] Load game state → restores theme
- [ ] Page reload → theme persists

**Cross-module tests:**
- [ ] themeEngine + renderer → canvas colors update
- [ ] themeEngine + CSS → CSS variables update
- [ ] themeEngine + saveState → theme in save file
- [ ] themeSelector + themeEngine → apply theme workflow

### 5.3 Visual Regression Tests

- [ ] Default theme matches original appearance (pixel-perfect comparison)
- [ ] All 11 themes render without artifacts
- [ ] Theme changes don't break layout
- [ ] Mobile responsive theme selector
- [ ] High-contrast theme is readable

### 5.4 Performance Tests

- [ ] Theme switch completes in <100ms
- [ ] Gradient cache regeneration doesn't cause FPS drop
- [ ] CSS variable updates are instant
- [ ] LocalStorage read/write is fast (<10ms)
- [ ] Theme selector modal opens in <50ms

### 5.5 Accessibility Tests

- [ ] High-contrast theme meets WCAG AAA (4.5:1 text contrast, 3:1 UI component contrast)
- [ ] Theme selector keyboard navigable (Tab, Enter, ESC)
- [ ] Screen reader friendly (ARIA labels)
- [ ] Color-blind friendly (don't rely on color alone for critical info)

### 5.6 Manual Verification

**Checklist:**
- [ ] Open theme selector (keyboard shortcut `T`)
- [ ] Browse themes (scroll list)
- [ ] Select theme (click, see preview)
- [ ] Apply theme (click Apply button)
- [ ] Verify UI colors changed
- [ ] Verify canvas colors changed (grid, orbits, labels, trajectories)
- [ ] Switch to different theme (repeat)
- [ ] Create custom theme (modify colors in editor - future enhancement)
- [ ] Save custom theme
- [ ] Export custom theme (download JSON)
- [ ] Import custom theme (drag-drop or file picker)
- [ ] Delete custom theme
- [ ] Reset to default (confirm all custom themes deleted)
- [ ] Save game state
- [ ] Reload page (verify theme persists)
- [ ] Load game state (verify theme restores)
- [ ] Test on mobile (viewport ≤768px)
- [ ] Test all 11 themes for visual cohesion

## 6. Implementation Order

**Phase 1: Foundation** (Units 1-3)
- Unit 1: Theme Engine Core (color abstraction API)
- Unit 2: Default Theme JSON (baseline theme)
- Unit 3: Theme Storage and Retrieval (localStorage persistence)

**Phase 2: CSS Integration** (Units 4-5)
- Unit 4: CSS Variable Injection (runtime CSS updates)
- Unit 5: CSS Refactoring - Variables (replace hardcoded colors)

**Phase 3: Canvas Integration** (Units 6-7)
- Unit 6: Renderer Color Abstraction (getColor() in renderer.js)
- Unit 7: Gradient Cache Invalidation (clear cache on theme change)

**Phase 4: UI Components** (Units 8-13)
- Unit 8: Theme Selector Modal - Structure (HTML, open/close logic)
- Unit 9: Theme List Rendering (populate theme list)
- Unit 10: Theme Preview (live preview panel)
- Unit 11: Apply Theme Button (activate selected theme)
- Unit 12: Import/Export Buttons (JSON file handling)
- Unit 13: Reset to Default (clear custom themes)

**Phase 5: Integration** (Units 14-16)
- Unit 14: Keyboard Shortcut (T key opens theme selector)
- Unit 15: Save State Integration (include theme in save/load)
- Unit 16: Main.js Initialization (load theme on startup)

**Phase 6: Content** (Units 17-18)
- Unit 17: Create 10 Bundled Themes (sub-agents create theme JSONs)
- Unit 18: Theme Registry (index.json with metadata)

**Phase 7: Polish** (Units 19-20)
- Unit 19: Mobile Responsive Theme Selector (mobile UX)
- Unit 20: Documentation and Polish (CLAUDE.md, JSDoc, final testing)

**Total estimated units:** 20
**Estimated time per unit:** 30-60 minutes
**Total estimated time:** 10-20 hours (can be parallelized with sub-agents)

## 7. Open Questions for Review

**Q1:** Should we add a "Theme Editor" UI for advanced customization?
- **Trade-off:** Increases scope but provides better UX for power users
- **Recommendation:** Phase 2 enhancement, not in initial implementation

**Q2:** Should themes override realistic planet colors?
- **Current approach:** Themes can optionally override (bodies object in theme JSON)
- **Alternative:** Keep planet colors always realistic, only theme UI/orbit colors
- **Recommendation:** Hybrid - allow override but default themes use realistic colors

**Q3:** Should we support theme-specific fonts (custom web fonts)?
- **Trade-off:** Flexibility vs complexity (need to load fonts dynamically)
- **Recommendation:** Initial implementation uses Google Fonts already loaded, Phase 2 can add dynamic font loading

**Q4:** Should we add color picker UI for theme customization?
- **Trade-off:** Better UX vs increased scope
- **Recommendation:** Phase 2 enhancement (for now, users edit JSON directly or clone themes)

**Q5:** Should we add theme screenshots/thumbnails?
- **Trade-off:** Better preview vs storage cost
- **Recommendation:** Phase 2 enhancement (initial implementation uses color swatches in preview)

---

**End of Planning Phase**
Next Deliverable: `reports/theming-system-review-2026-02-06.md`
