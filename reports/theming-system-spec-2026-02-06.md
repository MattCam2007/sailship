# Theming System Specification

**Date:** 2026-02-06
**Status:** Discovery Complete
**Feature:** Complete UI Theming System with Customization

## 1. Executive Summary

Implement a comprehensive theming system for Sailship that allows users to customize every aspect of the visual experience - UI colors, canvas rendering colors, fonts, and visual effects. The system includes 10 pre-built themes reflecting the aesthetic of early space travel (Deep Space Nine vibe, cyberpunk, Wing Commander), a visual theme editor, and import/export functionality for sharing custom themes.

**Core Philosophy:** Sailors pride themselves on their star charts. The game screen is beautiful, detailed, configurable, and exact. No fluff - every visual element serves a purpose.

**Visual Direction:**
- Early days of space travel - people sailing the stars for years
- Deep Space Nine aesthetic (imperfect future, not utopian TNG/VOY)
- Cyberpunk influences, Wing Commander movie/games feel
- 3D dimensional, beautiful planet views, clear/expandable UX
- Charts and gauges that display real data with meaning
- Blunt honesty, pride of independence

## 1.1 Estimated File Impact

### Files to CREATE:
- `src/js/core/themeEngine.js` - Core theme management, color abstraction, CSS variable injection
- `src/js/ui/themeSelector.js` - Theme selector modal component with preview
- `src/themes/default.json` - Original coral/dark theme
- `src/themes/deep-space-blue.json` - Dark blue, DS9-inspired
- `src/themes/wing-commander.json` - Military orange/green HUD
- `src/themes/cyberpunk-neon.json` - High-contrast neon accents
- `src/themes/solar-wind.json` - Yellow/orange solar theme
- `src/themes/void-black.json` - Pure black space theme
- `src/themes/ice-hauler.json` - Cool blue/white outer system
- `src/themes/mars-runner.json` - Red/orange inner system
- `src/themes/nav-chart-classic.json` - Vintage navigation chart
- `src/themes/smuggler-green.json` - Low-light green tactical
- `src/themes/high-contrast.json` - Accessibility theme
- `src/themes/index.json` - Theme registry with metadata
- `reports/theming-system-implementation-plan-2026-02-06.md` - Implementation plan
- `reports/theming-system-review-2026-02-06.md` - Review report
- `reports/theming-system-verification-2026-02-06.md` - Verification report

### Files to EDIT:
- `src/index.html` - Add theme selector button, modal markup, style injection point
- `src/css/main.css` - Expand CSS variables, replace hardcoded colors, add font variables
- `src/js/config.js` - Add COLOR_PALETTE and FONT_CONFIG objects
- `src/js/ui/renderer.js` - Replace hardcoded colors with theme engine calls
- `src/js/ui/controls.js` - Add keyboard shortcut for theme selector
- `src/js/core/saveState.js` - Include active theme in save/load
- `src/js/core/gameState.js` - Add theme state management
- `src/js/lib/starfield.js` - Potentially make star colors themeable (optional)
- `src/js/lib/planetTextures.js` - Consider themeable atmosphere glows (optional)

### Files to DELETE:
- None

## 2. Current State Analysis

### 2.1 Existing Systems

| System | Location | Purpose | Current State |
|--------|----------|---------|---------------|
| **UI Structure** | `src/index.html` | Single-file layout with inline styles | 717 lines, three-column flex layout |
| **CSS Styling** | `src/css/main.css` | Monolithic stylesheet | 2929 lines, partial CSS variable use |
| **Canvas Rendering** | `src/js/ui/renderer.js` | All visual rendering logic | 1460 lines, hardcoded RGB/RGBA colors |
| **UI Components** | `src/js/ui/ui-components.js` | Reusable UI widgets | Expandable panels, tab groups, mobile panels |
| **State Management** | `src/js/core/gameState.js` | Game state and display options | Module-level state objects with getters/setters |
| **Persistence** | LocalStorage | User preferences | Multiple keys (panelState, tabState, bodyFilters) |
| **Save/Load** | `src/js/core/saveState.js` | Complete game state export/import | JSON serialization with validation |
| **Configuration** | `src/js/config.js` | Game constants and display config | BODY_DISPLAY (planet colors), SHIP_COLORS |
| **Gradient Cache** | `src/js/ui/renderer.js` | Canvas gradient optimization | LRU cache (100 entries), needs invalidation on theme change |

### 2.2 Color Architecture (Current Problems)

#### **CSS Colors** (main.css)
- ✅ **Some CSS custom properties defined** (lines 9-38):
  - `--coral`, `--coral-dim`, `--coral-bright`
  - `--orange`, `--green`, `--blue`
  - `--bg-dark`, `--bg-darker`, `--bg-panel`, `--bg-panel-raised`
  - `--grid-line`, `--text-dim`
  - `--cyan`, `--cyan-dim`, `--purple`
  - Glow effects: `--glow-sm`, `--glow-md`, `--glow-lg`, `--glow-xl`

- ❌ **Inconsistent variable usage** - Many places bypass variables and hardcode colors
- ❌ **RGB/RGBA scattered throughout** - Difficult to maintain
- ❌ **No font variables** - Font families hardcoded 98+ times

**Examples of hardcoded colors:**
```css
/* Grid lines (should use variable) */
background: linear-gradient(rgba(232, 93, 76, 0.1) 1px, transparent 1px);

/* Orbit path colors (should use variable) */
stroke: rgba(232, 93, 76, 0.3);

/* Sun gradient (should be themeable) */
background: radial-gradient(circle, #ffffff, #ffee88, #ffdd44, #ff9922);
```

#### **JavaScript Canvas Colors** (renderer.js)
- ❌ **Completely hardcoded** - Every rendering function uses RGB/RGBA strings
- ❌ **No abstraction layer** - Direct color values in drawing code
- ❌ **Multiple representations** - Same logical color has different values in different places

**Examples:**
```javascript
// Grid (line 313)
ctx.strokeStyle = `rgba(232, 93, 76, ${finalAlpha})`;

// Orbits (line 377)
ctx.strokeStyle = 'rgba(232, 93, 76, 0.3)';

// Ship orbit (line 758)
ctx.strokeStyle = 'rgba(76, 232, 141, 0.5)';

// Predicted trajectory (line 974)
ctx.strokeStyle = `rgba(200, 100, 255, ${alpha})`;

// Sun gradient (lines 517-520)
grad.addColorStop(0, '#ffffff');
grad.addColorStop(0.3, '#ffee88');
grad.addColorStop(0.7, '#ffdd44');
grad.addColorStop(1, '#ff9922');
```

#### **Configuration-Based Colors** (config.js)
```javascript
export const BODY_DISPLAY = {
    SOL:      { radius: 15, color: '#ffdd44', physicalRadiusKm: 696000 },
    MERCURY:  { radius: 4,  color: '#b5b5b5', physicalRadiusKm: 2440 },
    VENUS:    { radius: 6,  color: '#e8c44c', physicalRadiusKm: 6052 },
    EARTH:    { radius: 6,  color: '#4c9ee8', physicalRadiusKm: 6371 },
    MARS:     { radius: 5,  color: '#e85d4c', physicalRadiusKm: 3390 },
    // ... 40+ celestial bodies
};

export const SHIP_COLORS = {
    player: '#4ce88d',
};
```

**Problem:** These colors are data-driven but not themeable. Need to separate:
- **Intrinsic colors** - Realistic planet colors (Earth is blue-green, Mars is red)
- **Themeable UI colors** - Orbit lines, labels, backgrounds

### 2.3 Font System (Current State)

**External fonts loaded:**
```css
@import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700&display=swap');
```

**Usage:**
- `'Share Tech Mono', monospace` - 98 instances in CSS (primary monospace font)
- `'Orbitron', sans-serif` - 18 instances in CSS (headers, titles)

**Problem:** All font families hardcoded. No CSS variables for fonts. Changing fonts requires manual find/replace across entire stylesheet.

### 2.4 Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                        USER INPUT                           │
│          (Mouse, Keyboard, Touch, Button Clicks)            │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  controls.js                                │
│              (Event Handlers)                               │
└────────┬───────────────────────────────┬────────────────────┘
         │                               │
         ▼                               ▼
┌──────────────────────┐      ┌──────────────────────────────┐
│   gameState.js       │      │   shipPhysics.js             │
│   (State Updates)    │      │   (Physics Calculations)     │
└──────┬───────────────┘      └──────────┬───────────────────┘
       │                                 │
       │                                 │
       ▼                                 ▼
┌─────────────────────────────────────────────────────────────┐
│                      main.js                                │
│                   (Game Loop)                               │
│   updatePositions() → render() → updateUI()                 │
└───────┬────────────────────────────┬────────────────────────┘
        │                            │
        ▼                            ▼
┌───────────────────┐      ┌──────────────────────────────────┐
│   renderer.js     │      │   uiUpdater.js                   │
│   (Canvas Draw)   │      │   (DOM Updates)                  │
└───────────────────┘      └──────────────────────────────────┘
```

**For theming, we need to inject at two points:**
1. **CSS Layer** - Update CSS custom properties (affects DOM rendering)
2. **Canvas Layer** - Provide color palette to renderer.js (affects canvas drawing)

### 2.5 Relevant Code Locations

#### **Core Rendering Functions** (renderer.js)
- `renderer.js:313` - `drawGrid()` - Hardcoded coral grid lines
- `renderer.js:377` - `drawOrbit()` - Hardcoded orbit colors
- `renderer.js:517-520` - Sun gradient construction
- `renderer.js:652` - Label rendering with hardcoded colors
- `renderer.js:753-760` - Ship orbit rendering
- `renderer.js:974` - Predicted trajectory rendering
- `renderer.js:36-130` - Gradient cache system (needs invalidation)

#### **State Management** (gameState.js)
- `gameState.js:displayOptions` - Display toggle settings
- `gameState.js:bodyFilters` - Body visibility filters (persisted)
- `gameState.js:trajectoryConfig` - Trajectory settings (persisted)

#### **Persistence** (saveState.js)
- `saveState.js:exportGameState()` - JSON serialization pattern
- `saveState.js:importGameState()` - JSON deserialization with validation
- **Pattern to replicate for theme import/export**

#### **LocalStorage Usage**
- `ui-components.js` - `panelState`, `tabState` (panel/tab persistence)
- `controls.js` - `coursePlotterWorkers`, `launchWindowWorkers` (worker counts)
- `gameState.js` - `bodyFilters` (body visibility)

#### **UI Components** (ui-components.js)
- `initExpandablePanel()` - Panel collapse/expand with persistence
- `initTabGroup()` - Tab switching with persistence
- `initMobilePanels()` - Mobile slide-in panels
- **Can add `initThemeSelector()` following same pattern**

## 3. Gap Analysis

### 3.1 Missing Capabilities

**Theme Infrastructure:**
- [ ] Theme definition format (JSON schema)
- [ ] Theme storage mechanism (localStorage + bundled themes)
- [ ] Theme loading/applying system
- [ ] Runtime CSS variable injection
- [ ] Canvas color override system
- [ ] Theme validation (color format checks)

**Color Abstraction:**
- [ ] Unified color palette object (single source of truth)
- [ ] Color getter function with alpha override (`getColor('path.to.color', alpha)`)
- [ ] CSS variable bridge (JS palette → CSS custom properties)
- [ ] Canvas color helpers (avoid hardcoded RGB/RGBA in renderer)

**Font Abstraction:**
- [ ] CSS font variables (`--font-primary`, `--font-header`, `--font-size-*`)
- [ ] Font configuration object
- [ ] Dynamic font loading (if custom fonts per theme)

**UI Components:**
- [ ] Theme selector modal (browse themes, preview, apply)
- [ ] Theme editor (advanced customization interface)
- [ ] Color pickers for custom themes
- [ ] Import/export buttons and file handling
- [ ] Theme preview system (show changes before applying)

**Default Themes:**
- [ ] 10 pre-built themes reflecting game aesthetic
- [ ] Theme metadata (name, author, description, tags)
- [ ] Theme screenshots/thumbnails (optional, for preview)

**Integration:**
- [ ] Keyboard shortcut for theme selector (e.g., `T`)
- [ ] Theme selector button in UI
- [ ] Theme persistence in save/load system
- [ ] Gradient cache invalidation on theme change

### 3.2 Required Changes

**CSS Refactoring (main.css):**
- [ ] Expand `:root` CSS variables to cover all colors
- [ ] Replace hardcoded colors with `var(--variable-name)`
- [ ] Add font variables (`--font-primary`, `--font-header`)
- [ ] Replace hardcoded fonts with `var(--font-primary)`
- [ ] Add theme-specific sections (e.g., `.theme-dark`, `.theme-light`)

**JavaScript Refactoring (renderer.js):**
- [ ] Import `getColor()` from themeEngine
- [ ] Replace all hardcoded colors:
  - `'rgba(232, 93, 76, 0.3)'` → `getColor('canvas.orbit.primary', 0.3)`
  - `'#4ce88d'` → `getColor('ships.player')`
- [ ] Update gradient construction to use theme colors
- [ ] Add gradient cache clearing on theme change

**Configuration (config.js):**
- [ ] Add `COLOR_PALETTE` object (default theme colors)
- [ ] Add `FONT_CONFIG` object (default fonts)
- [ ] Make `BODY_DISPLAY` colors reference palette (or keep realistic)
- [ ] Make `SHIP_COLORS` reference palette

**State Management (gameState.js):**
- [ ] Add `themeState` object with `activeTheme` property
- [ ] Add `getActiveTheme()` / `setActiveTheme()` functions
- [ ] Persist theme to localStorage

**Save/Load (saveState.js):**
- [ ] Include `activeTheme` in exported state
- [ ] Restore theme on import (validate theme exists)
- [ ] Handle missing theme gracefully (fallback to default)

### 3.3 New Feature Requirements

**Theme Customization UI:**
1. **Theme Selector Modal**
   - List of available themes (built-in + custom)
   - Theme preview (show colors and sample rendering)
   - "Apply" button to activate theme
   - "Reset to Default" button
   - Import/Export buttons

2. **Theme Editor (Advanced)**
   - Color pickers for each palette entry
   - Real-time preview as colors change
   - "Save as Custom Theme" button
   - "Export Theme" button (download JSON)
   - "Clone Theme" button (duplicate existing theme)

3. **Theme Import/Export**
   - Import from JSON file (drag-and-drop or file picker)
   - Export selected theme as JSON
   - Validate imported themes (check color formats)
   - Share themes with community (copy JSON to clipboard)

**Additional UI Enhancements:**
The user requested:
- [ ] Charts/gauges that display real data (no fluff)
- [ ] Current calendar date display
- [ ] Time since game start display
- [ ] Beautiful planet views when zoomed in (possibly enhanced textures)
- [ ] 3D dimensional feel (possibly enhanced depth effects)

**Note:** These enhancements are separate from theming but should integrate with the theme system.

## 4. Open Questions

### 4.1 Design Decisions

**Q1: Should planet colors be themeable or realistic?**
- **Option A:** Keep planet colors realistic (Earth blue, Mars red) regardless of theme
- **Option B:** Allow themes to override planet colors (e.g., "pure neon" theme makes Earth purple)
- **Recommendation:** Hybrid approach - default to realistic, but allow theme to override if specified

**Q2: Should stars be themeable?**
- **Option A:** Keep stars realistic (derived from B-V color index, magnitude)
- **Option B:** Allow theme to tint stars (e.g., "warm" theme adds red tint)
- **User says:** "Do not touch the stars unless you want to make them look better"
- **Recommendation:** Keep stars realistic, possibly add subtle ambient tint option

**Q3: How many color palette entries?**
- **Option A:** Minimal palette (10-15 core colors, derive variations programmatically)
- **Option B:** Comprehensive palette (50+ entries, explicit control over every color)
- **Recommendation:** Start with comprehensive palette for flexibility, can optimize later

**Q4: Font customization scope?**
- **Option A:** Font family only (e.g., swap "Share Tech Mono" for another monospace)
- **Option B:** Full typography control (family, size, weight, line-height)
- **Recommendation:** Font family + base size initially, expand if needed

**Q5: Theme storage limit?**
- **Option A:** Unlimited custom themes (localStorage permitting)
- **Option B:** Fixed limit (e.g., 20 custom themes max)
- **Recommendation:** Soft limit with warning at 10-15 themes (localStorage size concern)

### 4.2 Technical Constraints

**Q6: CSS variable support?**
- **Answer:** CSS custom properties supported in all modern browsers (Safari 9.1+, Chrome 49+, Firefox 31+)
- **Action:** No polyfill needed, can use freely

**Q7: Gradient cache invalidation performance?**
- **Answer:** Clearing 100-entry cache and regenerating is cheap (one-time cost on theme change)
- **Action:** Call `clearGradientCache()` when theme changes

**Q8: LocalStorage size limits?**
- **Answer:** ~5-10MB across browsers, each theme ~5-10KB JSON
- **Action:** Monitor localStorage usage, warn user if approaching limit

**Q9: Theme versioning and compatibility?**
- **Answer:** Need version field in theme JSON for future compatibility
- **Action:** Include `"version": "1.0"` in theme format, validate on import

### 4.3 User Experience

**Q10: Theme preview before applying?**
- **User expectation:** See changes before committing
- **Action:** Add live preview panel in theme selector (mini canvas + sample UI elements)

**Q11: Theme reset/undo?**
- **User expectation:** Easy way to revert to default
- **Action:** "Reset to Default" button always visible, confirm dialog if custom theme active

**Q12: Theme sharing workflow?**
- **User expectation:** Share themes with friends easily
- **Action:** Export as JSON file + "Copy to Clipboard" button for quick sharing

### 4.4 Implementation Strategy

**Q13: Should we use sub-agents to create 10 themes?**
- **User request:** "Use sub agents to create 10 custom themes/color schemes"
- **Action:** Yes, delegate theme creation to specialized agents (one per theme or batched)
- **Benefit:** Parallel creation, diverse aesthetic perspectives

**Q14: Build order - infrastructure first or themes first?**
- **Option A:** Build theme engine infrastructure, then create themes
- **Option B:** Create themes first (as JSON), then build engine to support them
- **Recommendation:** Option A - infrastructure first ensures themes are well-supported

**Q15: Break into atomic units or build monolithically?**
- **Answer:** Follow DEVELOPMENT_PROCESS.md - break into atomic units
- **Action:** Plan defines units of work, each independently testable

## 5. Success Criteria

The theming system is complete when:

**Core Functionality:**
- ✅ User can switch between 10+ built-in themes with one click
- ✅ User can create custom themes by modifying colors and fonts
- ✅ User can import/export themes as JSON files
- ✅ Theme persists across browser sessions (localStorage)
- ✅ Theme included in game save/load
- ✅ All UI colors respect active theme (CSS + Canvas)

**Code Quality:**
- ✅ No hardcoded colors in renderer.js (all use `getColor()`)
- ✅ All CSS colors use CSS variables (no hardcoded hex/rgb)
- ✅ Single source of truth for colors (theme JSON)
- ✅ Gradient cache invalidates on theme change
- ✅ No performance regressions (60 FPS maintained)

**User Experience:**
- ✅ Theme selector modal is intuitive and responsive
- ✅ Theme preview shows accurate representation
- ✅ Theme changes apply instantly (no page reload)
- ✅ Import/export workflow is smooth
- ✅ Mobile-friendly theme selector

**Aesthetic:**
- ✅ Default themes reflect game world (early space travel, DS9, cyberpunk, Wing Commander)
- ✅ Themes are beautiful, detailed, and serve the "star chart pride" philosophy
- ✅ No fluff - every color has purpose
- ✅ High-contrast accessibility theme available

**Documentation:**
- ✅ Theme creation guide written
- ✅ Theme JSON schema documented
- ✅ Code comments explain theme system architecture

## 6. Out of Scope (For This Phase)

**Deferred to future enhancements:**
- Dynamic theme generation (AI-assisted color palette creation)
- Theme marketplace/sharing platform
- Per-body color overrides (e.g., "make only Mars purple")
- Animated theme transitions (smooth color lerping)
- Theme-specific sound effects or music
- Light mode themes (game is intentionally dark for space aesthetic)
- Theme-based gameplay changes (e.g., "hard mode" theme with dim UI)

## 7. Next Steps

1. **Proceed to Phase 2: Planning**
   - Design theme JSON schema
   - Design themeEngine.js API
   - Break implementation into atomic units
   - Identify risks and edge cases

2. **Delegate Theme Creation**
   - Spawn 10 sub-agents to create theme JSON files
   - Themes to create:
     1. Default Coral (current theme, baseline)
     2. Deep Space Blue (DS9-inspired, dark blue/cyan)
     3. Wing Commander (military HUD, orange/green)
     4. Cyberpunk Neon (high-contrast neon pink/cyan)
     5. Solar Wind (yellow/orange, solar-centric)
     6. Void Black (pure black space, minimal UI)
     7. Ice Hauler (cool blue/white, outer system)
     8. Mars Runner (red/orange, inner system)
     9. Nav Chart Classic (vintage navigation, sepia/parchment)
     10. Smuggler Green (low-light green tactical)
     11. High Contrast (accessibility, WCAG AAA)

3. **Phase 3: Review**
   - Multi-perspective review of implementation plan
   - Validate architecture and color abstraction approach

4. **Phase 4: Implementation**
   - Execute units of work sequentially
   - Verify each unit before proceeding

5. **Phase 5: Verification**
   - Integration testing
   - Visual regression testing (screenshot comparison)
   - Accessibility testing (high-contrast theme)
   - Performance testing (gradient cache, theme switching speed)

---

**End of Discovery Phase**
Next Deliverable: `reports/theming-system-implementation-plan-2026-02-06.md`
