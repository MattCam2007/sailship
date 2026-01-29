# AGENTS.md - Solar Sail Ship Navigation Game

## Project Overview

Browser-based solar system navigation game where players pilot a light sail ship between planets. Built with vanilla JavaScript (ES6 modules), HTML5 Canvas, and CSS3. No build system, no bundler, zero npm dependencies.

## Directory Structure

```
src/
├── index.html              # Entry point
├── css/main.css            # All styles, CSS variables for theming
└── js/
    ├── main.js             # Entry point, game loop
    ├── core/               # Game logic
    │   ├── camera.js       # 3D projection, view state
    │   ├── gameState.js    # Time, zoom levels, display options
    │   └── navigation.js   # Flight paths, burn state machine
    ├── data/               # Game data (extend for external APIs)
    │   ├── celestialBodies.js  # Planets, moons, asteroids
    │   └── ships.js        # Player and NPC vessels
    ├── lib/                # Utility libraries
    │   └── orbital.js      # Orbital mechanics calculations
    └── ui/                 # Rendering and interaction
        ├── controls.js     # Input handlers (keyboard, mouse, buttons)
        ├── renderer.js     # Canvas drawing functions
        └── uiUpdater.js    # DOM panel updates
```

## Running the Project

```bash

# Open http://localhost:8080
```

**Note**: `npx serve` has issues with clean URLs. Use Python's http.server.

## Build/Lint/Test Commands

**No build tooling exists.** This is a vanilla JS project:
- No compilation needed - runs directly in browser
- No linting configured (consider ESLint if adding)
- No test framework (consider Vitest if adding)

## Code Style Guidelines

### Imports

- **Always use `.js` extensions** in import paths
- Use named exports, not default exports
- Group imports: external deps (none currently), then internal by path depth

```javascript
// Good
import { camera, project3D } from '../core/camera.js';
import { celestialBodies } from '../data/celestialBodies.js';

// Bad - missing .js extension, using default export
import camera from '../core/camera';
```

### Naming Conventions

| Element | Convention | Examples |
|---------|------------|----------|
| Functions | camelCase with verb prefix | `getPlayerShip()`, `updateCelestialPositions()`, `drawFlightPath()` |
| State objects | camelCase | `navState`, `camera`, `displayOptions` |
| Constants (primitives) | UPPER_SNAKE | `MAX_ZOOM`, `DEFAULT_SCALE` |
| Files | camelCase | `gameState.js`, `celestialBodies.js` |
| CSS classes | kebab-case | `.nav-panel`, `.burn-button` |
| DOM IDs | camelCase | `navCanvas`, `pathPreview` |

### Function Documentation

Use JSDoc for all exported functions:

```javascript
/**
 * Project 3D coordinates to 2D screen space
 * @param {number} x - X coordinate in AU
 * @param {number} y - Y coordinate in AU
 * @param {number} z - Z coordinate in AU
 * @param {number} centerX - Screen center X
 * @param {number} centerY - Screen center Y
 * @param {number} scale - Pixels per AU
 * @returns {{x: number, y: number, depth: number}} Projected coordinates
 */
export function project3D(x, y, z, centerX, centerY, scale) { }
```

### Module Structure

- One concept per file
- Export state objects and functions, not classes
- Avoid circular dependencies: `data/ -> core/ -> ui/`

### CSS Guidelines

All colors and theme values in `:root`:

```css
:root {
    --coral: #e85d4c;
    --coral-dim: #a83d30;
    --green: #4ce88d;
    --bg-dark: #0a0a0a;
    --bg-panel: #111111;
}
```

Use section comments for major UI areas. Use flexbox/grid for layouts.

### HTML Guidelines

- IDs for JS-targeted elements
- Classes for styling
- Data attributes for JS config (`data-zoom="system"`)

## Key Patterns

### Game Loop (`src/js/main.js`)

```javascript
function gameLoop() {
    updatePositions();  // Physics/state
    render();           // Canvas drawing
    updateUI();         // DOM updates
    requestAnimationFrame(gameLoop);
}
```

### Navigation State Machine (`src/js/core/navigation.js`)

States: `IDLE -> BURNING -> FLIP -> DECELERATING -> ARRIVED`

```javascript
export const navState = {
    status: 'IDLE',     // Current state
    progress: 0,        // 0-1 along flight path
    currentAccel: 0,    // Current acceleration in g's
    targetAccel: 0.3,   // Target acceleration
};
```

### 3D Projection (`src/js/core/camera.js`)

All positions in AU (Astronomical Units). Use `project3D()` for screen coords:

```javascript
const projected = project3D(body.x, body.y, body.z, centerX, centerY, scale);
ctx.arc(projected.x, projected.y, radius, 0, Math.PI * 2);
```

## Adding New Content

### New Celestial Body (`src/js/data/celestialBodies.js`)

```javascript
{
    name: 'SATURN',
    type: 'planet',         // 'star', 'planet', 'moon', 'asteroid'
    orbitRadius: 9.58,      // AU from sun
    orbitInclination: 2.49 * Math.PI / 180,
    orbitPeriod: 10759,     // Earth days
    angle: Math.random() * Math.PI * 2,
    radius: 10,             // Display size in pixels
    color: '#e8d4a8'
}
```

### New Ship (`src/js/data/ships.js`)

```javascript
{
    name: 'SHIP_NAME',
    type: 'ship',
    x: 1.0, y: 0.5, z: 0,   // Position in AU
    velocity: { x: 0.001, y: 0, z: 0 },
    color: '#hexcolor',
    isPlayer: false
}
```

## Common Issues

1. **Blank page**: Check browser console for module load errors
2. **CORS errors**: Must use local server, not `file://` protocol
3. **Canvas not rendering**: Check `resizeCanvas()` is called on init

## Future Architecture Notes

The `data/` directory is designed for external API integration:
- Weather data -> solar wind effects on sail
- Traffic data -> space traffic/congestion
- Keep data fetching separate from game logic
