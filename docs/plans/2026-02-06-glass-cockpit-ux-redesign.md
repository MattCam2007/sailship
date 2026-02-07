# Glass Cockpit UX Redesign

**Date:** 2026-02-06
**Status:** Design
**Author:** Claude Sonnet 4.5 (with user direction)

## Problem Statement

Current UI suffers from three critical issues:
1. **Looks like garbage** - Generic buttons/inputs, no visual hierarchy, Windows 95 aesthetic
2. **Clunky interactions** - Boring sliders and checkboxes, nothing feels smooth or premium
3. **Poor discoverability** - Controls are hard to find, unclear what does what

Current information density is good. Problem is presentation, not content.

## Design Vision

Transform the interface into a **glass cockpit HUD** - holographic projection meets retro CRT terminal. Old school feel with modern aesthetic.

### Aesthetic Pillars

**Visual Treatment:**
- Glassmorphic panels: Semi-transparent backgrounds with backdrop-blur
- Hard edges: Sharp corners with 1px borders, no roundedness
- CRT scan lines: Subtle animated horizontal scan lines on all panels
- Depth: Inner glow and shadows for floating effect
- Corner brackets: `┌─` style decorations that pulse when active
- Theme-aware: All colors use CSS variables from theme engine

**Interaction Philosophy:**
- Keyboard shortcuts enhance but aren't required
- Mouse/touch is primary interaction method
- Intuitive discovery through good affordances
- Tooltips on hover provide detail without hand-holding
- Sail trimming is THE core interaction - must feel premium

## Layout Architecture

### Four-Zone Cockpit Layout

**TOP-LEFT: Time/Speed Control**
- Current date/time display
- Speed multiplier control with preset grid
- Pause indicator
- Compact, always visible

**TOP-RIGHT: Sail Control (Premium Zone)**
- Vertical slider for deployment (prominent, tall)
- Dual rotary controls for yaw/pitch angles
- Live thrust vector visualization with animated arrow
- Glows bright when sail deployed
- Direct manipulation: click-drag rotary controls
- Screen-native design (not skeuomorphic knobs)

**BOTTOM-LEFT: Display Layers**
- Icon grid for visibility toggles (orbits, labels, grid, etc)
- Icons glow when layer active
- Smart visibility: dim = auto-hidden, bright = force-shown
- Radial menu alternate access (hold V key)

**BOTTOM-RIGHT: Navigation Data**
- Target name and distance (large, primary)
- Time to intercept with live countdown
- Delta-v remaining with inline fuel bar
- Expandable orbital elements (collapsed by default)

### Center Canvas
- Remains largely unchanged
- Corner overlays for scale/view/tracking (existing)
- Clean, unobstructed view of solar system

## Interaction Design

### Sail Controls (Premium Interaction)

**Deployment Slider:**
- Vertical slider (80-120px tall)
- Click-drag or click-to-position
- Live percentage display
- Glows when not at 100%
- Smooth value animation

**Yaw/Pitch Rotary Controls:**
- Circular touch targets (60-80px diameter)
- Click-drag to rotate (like turning a dial)
- Shows current angle with visual indicator line
- Center displays numeric value
- Screen-native design: clean circles with angle indicators, not fake 3D knobs
- Smooth rotation animation
- Color changes based on thrust direction

**Thrust Visualization:**
- Animated arrow showing thrust vector
- Length indicates magnitude
- Color from theme (success color for efficient thrust)
- Updates in real-time as angles change

**Direct Manipulation Alternative:**
- Click-drag predicted trajectory line to adjust sail angles
- Natural, spatial interaction
- Shows temporary ghost trajectory while dragging

### Display Layers

**Primary: Icon Grid**
- 8-10 small icons in compact grid
- Click to toggle layer visibility
- Glow effect when active
- Dim effect when auto-hidden
- Tooltip shows layer name + hotkey

**Secondary: Radial Menu**
- Hold V (for "view") to show radial menu
- All display layers in radial layout
- Click or release on layer to toggle
- Faster for keyboard-first users

**Smart Visibility:**
- Orbits appear on planet hover (can override)
- Labels appear at certain zoom levels (can override)
- Grid appears when panning/navigating (can override)
- User overrides persist until cleared

### Data Presentation

**Animated Numbers:**
- Values increment/decrement smoothly (not snap)
- Easing function for natural feel
- Updates at 60fps when changing

**Inline Visualizations:**
- Delta-v has horizontal fuel bar below value
- Thrust has direction arrow
- Time has countdown indicator
- Distance has scale reference

**Contextual Highlighting:**
- Low fuel: red glow + pulsing
- Good intercept window: green glow
- Critical warnings: orange/red + pulsing
- Uses theme colors for consistency

### Discovery & Learning

**Intuitive by Design:**
- Visual affordances indicate interactivity (glow on hover)
- Related controls grouped spatially
- Clear visual hierarchy (size + brightness = importance)
- Consistent interaction patterns

**Tooltips:**
- Appear on 500ms hover delay
- Show control name, function, keyboard shortcut
- Minimal, clean design matching panel aesthetic
- Position intelligently (avoid covering content)

## Technical Architecture

### Visual System

**Glassmorphic Panels:**
```css
.hud-panel {
  background: rgba(var(--bg-dark-rgb), 0.7);
  backdrop-filter: blur(10px);
  border: 1px solid var(--primary);
  box-shadow:
    inset 0 0 20px rgba(var(--primary-rgb), 0.1),
    0 4px 12px rgba(0, 0, 0, 0.5);
}
```

**Scan Line Overlay:**
```css
.scan-lines::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(var(--primary-rgb), 0.03) 2px,
    rgba(var(--primary-rgb), 0.03) 4px
  );
  pointer-events: none;
  animation: scan 8s linear infinite;
}
```

**Corner Brackets:**
- SVG or CSS-based corner decorations
- Animate on panel state change (active/inactive)
- Use theme primary color

### Component Architecture

**New Components:**
- `ui/hud/` - New directory for HUD components
  - `TimeSpeedControl.js` - Top-left cluster
  - `SailControl.js` - Top-right premium controls
  - `LayersPanel.js` - Bottom-left display toggles
  - `NavDataPanel.js` - Bottom-right telemetry
  - `RadialMenu.js` - Reusable radial menu component
  - `RotaryControl.js` - Reusable rotary input component
  - `VerticalSlider.js` - Reusable vertical slider component

**Styling:**
- `css/hud.css` - New stylesheet for HUD components
- Uses existing theme variables from theme engine
- Modular, component-scoped styles

**State Management:**
- Reuse existing `gameState.js` for data
- Add `hudState.js` for UI-specific state (panel positions, overrides)
- Event-driven updates for smooth animations

### Animation System

**Smooth Value Transitions:**
- Use requestAnimationFrame for 60fps updates
- Lerp (linear interpolation) for numeric values
- Easing functions for natural feel
- Separate animation loop from game loop

**Visual Feedback:**
- Glow intensity changes on hover/active states
- Pulsing for critical alerts (keyframe animations)
- Scan line animation (continuous, slow)
- Thrust arrow rotation/scaling

### Performance Considerations

- Minimize DOM updates (batch changes)
- Use CSS transforms for animations (GPU-accelerated)
- Debounce hover events (500ms delay)
- Throttle value updates (60fps max)
- Lazy-render collapsed panels

## Migration Strategy

### Phase 1: New HUD Components (No Breaking Changes)
- Build new HUD components alongside existing UI
- Feature flag to toggle between old/new UI
- Allows A/B testing and gradual rollout

### Phase 2: Wire Up Data
- Connect new components to existing game state
- Ensure feature parity with old UI
- Test all interactions work correctly

### Phase 3: Polish & Tune
- Animation timing adjustments
- Color/contrast refinement
- Tooltip positioning
- Accessibility (keyboard nav, ARIA labels)

### Phase 4: Deprecate Old UI
- Remove old panels and controls
- Remove feature flag
- Update documentation
- Clean up dead CSS

## Success Criteria

**Visual:**
- [ ] Looks premium, not generic
- [ ] Clear visual hierarchy
- [ ] Theme colors applied consistently
- [ ] Smooth animations at 60fps

**Interaction:**
- [ ] Sail controls feel satisfying to use
- [ ] All controls discoverable through exploration
- [ ] Tooltips helpful without being intrusive
- [ ] Keyboard shortcuts work as enhancement

**Functional:**
- [ ] Feature parity with existing UI
- [ ] No regressions in game functionality
- [ ] Performance is smooth (no jank)
- [ ] Works on desktop (mobile later)

**User Feedback:**
- [ ] "This doesn't suck anymore"
- [ ] "Sail control feels premium"
- [ ] "I can find what I need"

## Future Extensibility

Design accommodates future features:
- Additional mini-HUDs can dock to edges
- Radial menu can expand to more categories
- Context panels can slide in for detailed config
- Direct manipulation can extend to other visualizations
- Layout is flexible for new data displays

## Open Questions

None - user authorized "coolest choice" for any decisions during implementation.

## References

- Star Trek transporter/helm controls (vertical/rotary sliders)
- Fighter jet HUD overlays (minimal, contextual)
- Retro CRT terminal aesthetic (scan lines, hard edges)
- Modern glassmorphism (Apple, Fluent Design)
- Existing theme engine for color system
