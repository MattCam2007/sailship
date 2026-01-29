# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Browser-based solar system navigation game where players pilot a light sail ship between planets. Built with vanilla JavaScript (ES6 modules), HTML5 Canvas, and CSS3. No build system, no bundler, zero npm dependencies.


## Project Instructions

### Report Generation
When asked to "make a report" or "generate a report", always:
- Write the output to a file (default: `reports/report-YYYY-MM-DD.md` unless specified)
- Create the reports directory if it doesn't exist
- Use markdown formatting
- Include a timestamp in the file

### Reviews
When asked for a review, review the implementation plan using four separate perspectives:

1. PHYSICS/REALISM: Validate orbital mechanics, solar radiation pressure model,
   delta-v calculations, astronomical accuracy, and any other math/physics
2. FUNCTIONALITY: Test code paths, verify game logic works as intended
3. ARCHITECTURE: Evaluate code structure, separation of concerns, extensibility
4. FAILURE MODES: Identify edge cases, numerical instability risks, performance
   bottlenecks, and potential player-facing bugs

Write a detailed report to reports/implementation-review-[DATE].md

Then provide a CLI summary with:
- Top 3 concerns per category
- Overall confidence rating
- Recommended next steps

## Running the Project

```bash
cd src && python3 -m http.server 8080
# Open http://localhost:8080
```

**Note**: `npx serve` has issues with clean URLs. Use Python's http.server.

## Build/Lint/Test

No build tooling exists. This is a vanilla JS project that runs directly in browser with no compilation, linting, or test framework configured.

## Architecture

```
src/js/
├── main.js             # Entry point, game loop
├── core/               # Game logic
│   ├── camera.js       # 3D projection, view state
│   ├── gameState.js    # Time, zoom, display options, planning mode
│   ├── navigation.js   # Destination/distance tracking
│   └── shipPhysics.js  # Per-frame physics updates
├── data/               # Game data (designed for external API integration)
│   ├── celestialBodies.js  # Planets, moons, asteroids
│   ├── ships.js        # Player and NPC vessels with orbital elements
│   └── stars/          # Star catalog data
│       └── bsc5-processed.json  # Yale Bright Star Catalog (5,080 stars)
├── lib/                # Utility libraries
│   ├── orbital.js      # Orbital mechanics calculations
│   ├── orbital-maneuvers.js  # Sail thrust, Gauss variational equations
│   ├── trajectory-predictor.js  # Predicted trajectory with continuous thrust
│   ├── intersectionDetector.js  # Orbit crossing detection for trajectory planning
│   └── starfield.js    # Background star rendering with date-accurate precession
└── ui/                 # Rendering and interaction
    ├── controls.js     # Input handlers (keyboard, mouse, buttons)
    ├── renderer.js     # Canvas drawing functions
    └── uiUpdater.js    # DOM panel updates
```

### Game Loop Pattern (`main.js`)

```javascript
function gameLoop() {
    updatePositions();  // Physics/state
    render();           // Canvas drawing
    updateUI();         // DOM updates
    requestAnimationFrame(gameLoop);
}
```

### Dependency Flow

Avoid circular dependencies: `data/ -> core/ -> ui/`

### Physics System

Ship exists on actual Keplerian orbits. Solar sail thrust modifies orbit using Gauss's variational equations. Position derived from orbital elements, not path interpolation.

- Solar pressure: 4.56e-6 N/m² at 1 AU, scales with 1/r²
- Default sail: 1 km² area, 90% reflectivity
- Typical acceleration: ~0.5 mm/s² (~0.00005 g)

## Code Style

### Imports

**Always use `.js` extensions** in import paths. Use named exports, not default exports.

```javascript
// Good
import { camera, project3D } from '../core/camera.js';

// Bad
import camera from '../core/camera';
```

### Naming Conventions

| Element | Convention | Examples |
|---------|------------|----------|
| Functions | camelCase with verb prefix | `getPlayerShip()`, `updateCelestialPositions()` |
| State objects | camelCase | `navState`, `camera` |
| Constants (primitives) | UPPER_SNAKE | `MAX_ZOOM`, `DEFAULT_SCALE` |
| Files | camelCase | `gameState.js`, `celestialBodies.js` |
| CSS classes | kebab-case | `.nav-panel`, `.burn-button` |
| DOM IDs | camelCase | `navCanvas`, `pathPreview` |

### Module Structure

One concept per file. Export state objects and functions, not classes.

## Display Options

The UI includes toggles for various display elements:

| Option | Description |
|--------|-------------|
| STAR MAP | Background starfield with 5,080 stars, date-accurate precession (500-3500 AD) |
| ORBITAL PATHS | Show orbit ellipses for planets and ships (Keplerian) |
| LABELS | Show names for celestial bodies and ships |
| FLIGHT PATH | Show navigation waypoints to destination |
| PREDICTED PATH | Show where ship will go with current thrust (spiral) |
| ENCOUNTER MARKERS | Show ghost planets at orbital crossing points (trajectory planning) |
| GRID | Show distance reference grid |

The **Predicted Path** shows the actual trajectory accounting for continuous sail thrust,
while **Orbital Paths** shows the instantaneous Keplerian orbit (where ship would go if thrust stopped).

### Encounter Markers (Orbit Intersection Feature)

**Encounter Markers** are ghost planets displayed at orbital path crossings. When your predicted trajectory crosses a planet's orbital radius, a semi-transparent ghost planet appears showing where that planet will actually be at the crossing time.

**Purpose**: Visual trajectory planning. Adjust sail settings and watch ghost positions shift in time as your orbit crossing timing changes.

**How it works**:
- Detects when trajectory crosses each planet's orbital radius (semi-major axis)
- Shows planet's actual position at that crossing time with time offset label
- Example: "VENUS +221d 4h" means Venus will be at that position 221 days from now
- "CLOSE" indicator appears when planet is near trajectory at crossing time (good intercept)

**Usage**:
1. Enable "ENCOUNTER MARKERS" toggle (requires "ORBITAL PATHS" also enabled)
2. Adjust sail yaw/pitch/deployment
3. Watch ghost positions update in real-time
4. Fine-tune for intercepts when ghost shows "CLOSE"

**Technical details**:
- One ghost per orbital crossing (if you cross Earth twice, you see 2 Earth ghosts)
- Uses linear interpolation for exact crossing time calculation
- Moon positions automatically transformed from parent-relative to heliocentric coordinates
- Performance: <10ms detection for typical 200-point trajectory

### Star Map (Background Starfield)

**Star Map** renders a date-accurate background starfield using the Yale Bright Star Catalog (BSC5). The starfield provides atmospheric depth and astronomical accuracy.

**Features**:
- 5,080 stars (magnitude ≤ 6.0, naked-eye visibility)
- Realistic star colors mapped from B-V color index (blue → white → yellow → red)
- Brightness scaling from visual magnitude (brighter stars are larger/more visible)
- Date-accurate precession (500-3500 AD using IAU 1976 formula)
- Fixed background effect (stars rotate with camera but don't translate with panning)

**How it works**:
- Stars use equatorial coordinates (RA/Dec) converted to ecliptic frame
- IAU precession formula accounts for Earth's axial wobble (~50 arcsec/year)
- Only visible hemisphere rendered (back-face culling for performance)
- Stars update with time travel slider to show historical/future night sky

**Usage**:
1. Toggle "STAR MAP" in Display Options
2. Stars appear as subtle colored points in background
3. Enable time travel and adjust slider to see precession over centuries
4. Brighter stars (Sirius, Vega, etc.) appear larger with subtle glow

**Technical details**:
- Data source: Yale Bright Star Catalog (BSC5), processed to 275KB JSON
- Coordinate transform: Equatorial (RA/Dec J2000) → Ecliptic (XYZ)
- Projection: Custom skybox projection (rotation only, no camera position offset)
- Performance: ~5,000 stars rendered at 60 FPS with view frustum culling
- Date range: Stars support 500-3500 AD (IAU 1976 precession), planets limited to 1900-2100 (astronomy-engine constraint)

## Planning Mode (Launch Window Finder)

Planning Mode is a navigation planning tool that freezes simulation time and synchronizes all visualizations (ship, planets, trajectory) to a single planning date. This enables launch window exploration without affecting live gameplay.

### How It Works

**When Planning Mode is enabled:**
1. Simulation time freezes (timeScale = 0, physics paused)
2. Time travel is automatically enabled
3. Ship position is calculated at ephemeris date (from orbital elements)
4. Planets positioned at ephemeris date
5. Trajectory predicts from ephemeris date
6. All visualizations synchronized to the same date

**Use Case - Finding a Mars Transfer Window:**
1. Enable Planning Mode (Time Travel section or press Ctrl+P)
2. Adjust time travel slider to explore different launch dates
3. Set destination to Mars
4. Watch encounter markers update as you change launch date
5. Look for "CLOSE" indicator on Mars ghost planet
6. Fine-tune sail settings to optimize trajectory
7. When satisfied, disable Planning Mode (Ctrl+P) to resume simulation

### Planning Mode vs Time Travel

| Feature | Time Travel Only | Planning Mode |
|---------|------------------|---------------|
| Simulation | Runs normally | Frozen (paused) |
| Ship position | Current (simulation time) | Calculated at planning date |
| Planet positions | Historical/future | Synchronized with ship |
| Trajectory start | Current position | Planning date position |
| Use case | Observe historical sky | Find launch windows |

### Technical Details

**Two Planning Types:**
- **Type 1 (Phase 1 - Current)**: Ship stays at orbital position, time slides. Easier for finding routes, not perfectly realistic (launch date changes but ship "teleports" along orbit).
- **Type 2 (Phase 2 - Future)**: Full scenario save/load system. Save ship state, date, and sail config as scenario. Load scenario to set up realistic mission planning.

**Date Systems:**
- **Simulation time** (`getJulianDate()`): Gameplay clock, advances with timeScale
- **Ephemeris time** (`getEphemerisJulianDate()`): Planning/historical date, controlled by time travel slider
- **Active time** (`getActiveJulianDate()`): Returns ephemeris in planning mode, simulation otherwise

**Functions:**
```javascript
setPlanningMode(enabled)       // Enable/disable planning mode
isPlanningMode()               // Check if planning mode active
getActiveJulianDate()          // Get current date for calculations
```

**Files that use getActiveJulianDate():**
- `shipPhysics.js` - Ship position calculation
- `celestialBodies.js` - Planet positioning
- `renderer.js` - Trajectory prediction
- `main.js` - Intersection detection

### Keyboard Shortcuts

- `Ctrl+P` / `Cmd+P` - Toggle planning mode
- (All existing time travel shortcuts work in planning mode)

## UI Components

### Expandable Panels
Left panel sections can be collapsed/expanded by clicking their headers. Panel state persists across sessions via localStorage.

### Tab Groups
The right panel uses a tab system (SAIL/NAV/AUTO) for organizing controls and data. Tab state persists across sessions.

### Trajectory Configuration
The predicted trajectory duration can be adjusted from 30 days to 2 years (730 days). Use the slider or preset buttons for quick selection. The RESET button returns to default (60 days).

## Keyboard Shortcuts

### Sail Controls
- `[` / `]` - Adjust sail yaw angle ±5°
- `-` / `=` - Adjust deployment ±10%
- `{` / `}` - Adjust pitch angle ±5°

### Camera Controls
- `Q` / `E` - Rotate view
- `W` / `S` - Tilt view
- `R` - Reset view
- Left-click drag - Pan camera
- Right-click drag - Rotate camera
- Mouse wheel - Zoom

### Navigation
- `A` - Toggle autopilot
- `Ctrl+P` / `Cmd+P` - Toggle planning mode
- `Ctrl+1` / `Cmd+1` - Switch to SAIL tab
- `Ctrl+2` / `Cmd+2` - Switch to NAV tab
- `Ctrl+3` / `Cmd+3` - Switch to AUTO tab

## Console Tests

Run test suites in browser console:

```javascript
// Trajectory predictor tests
import('/js/lib/trajectory-predictor.test.js').then(m => m.runAllTests())

// Intersection detector tests - LEGACY (old closest approach algorithm)
import('/js/lib/intersectionDetector.test.js').then(m => m.runAllTests())

// Intersection detector tests - CROSSING DETECTION (new algorithm, use this one)
import('/js/lib/intersectionDetector.crossing.test.js').then(m => m.runAllTests())

// Orbital mechanics tests
import('/js/lib/orbital.test.js').then(m => m.runAllTests())

// Orbital maneuvers tests (thrust application)
import('/js/lib/orbital-maneuvers.test.js').then(m => m.runAllTests())

// Time travel feature tests
import('/js/core/timeTravel.test.js').then(m => m.runAllTests())

// Ephemeris tests (astronomy-engine wrapper)
import('/js/lib/ephemeris.test.js').then(m => m.runAllTests())

// Starfield tests (star catalog, precession, coordinate transforms)
import('/js/lib/starfield.test.js').then(m => m.runAllTests())

// Planning mode tests (state management)
import('/js/core/gameState.planningMode.test.js').then(m => m.runAllTests())

// Planning mode tests (ship physics)
import('/js/core/shipPhysics.planningMode.test.js').then(m => m.runAllTests())

// Planning mode tests (celestial bodies)
import('/js/data/celestialBodies.planningMode.test.js').then(m => m.runAllTests())
```
