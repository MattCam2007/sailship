# Solar System Population Feature - Implementation Plan
**Date:** 2026-01-24
**Status:** Ready for Implementation

## Overview

Populate the solar system with all celestially significant bodies that affect ship flight through gravitational influence. Add filtering UI to manage visual noise while maintaining complete physics simulation.

## Requirements

### Functional Requirements
1. Add ~70-80 celestial bodies to the solar system
2. All bodies must affect ship physics (SOI detection, gravity, collisions)
3. Bodies can be filtered from display without affecting physics
4. Filter state persists across sessions
5. Maintain existing astronomy-engine integration for time travel mode

### Body Categories & Counts
- **Planets (8)**: Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune
- **Dwarf Planets (5)**: Pluto, Ceres, Eris, Makemake, Haumea
- **Major Moons (~25)**: Bodies with mass > 10^19 kg or navigation interest
  - Examples: Luna, Io, Europa, Ganymede, Callisto, Titan, Triton, Charon, etc.
- **Minor Moons (~30)**: Smaller moons of outer planets
  - Examples: Phobos, Deimos, Mimas, Tethys, Dione, Miranda, Ariel, etc.
- **Asteroids (~15)**: Main belt, near-Earth, Trojans
  - Examples: Vesta, Pallas, Hygiea, Juno, Eros, etc.

### Physics Requirements
- **ALL bodies always active for physics**: Position updates, SOI detection, gravity, collisions
- **Filter only affects display**: Rendering, labels, orbital paths, navigation dropdown, encounter markers
- Bodies without astronomy-engine support use Keplerian orbital elements (existing pattern)

## Architecture

### Data Model Changes

**Add `category` field to celestialBodies:**
```javascript
{
    name: 'EUROPA',
    type: 'moon',           // Existing field (keep for compatibility)
    category: 'major-moon', // NEW: filter category
    parent: 'JUPITER',
    elements: { ... }
}
```

**Category values:**
- `'planet'` - 8 major planets
- `'dwarf-planet'` - 5 IAU dwarf planets
- `'major-moon'` - Significant moons (mass/interest)
- `'minor-moon'` - Smaller planetary moons
- `'asteroid'` - Asteroids and minor bodies

### State Management

**Add to gameState.js:**
```javascript
export const bodyFilters = {
    planet: true,          // Visible by default
    'dwarf-planet': true,  // Visible by default
    'major-moon': true,    // Visible by default
    'minor-moon': false,   // Hidden by default (too noisy)
    asteroid: false        // Hidden by default (too noisy)
};
```

**LocalStorage persistence:**
- Key: `'bodyFilters'`
- Format: JSON string of bodyFilters object
- Load on initialization, save on every change

### Filtering Logic

**Core principle: Visual filtering ONLY, physics always active**

```javascript
// In celestialBodies.js

// ALWAYS update ALL bodies (for physics)
export function updateCelestialPositions() {
    celestialBodies.forEach(body => {
        // NO FILTERING HERE - always calculate positions
        // ... existing position calculation
    });
}

// NEW: Pre-filtered list for display consumers only
export function getVisibleBodies() {
    return celestialBodies.filter(body =>
        !body.category || bodyFilters[body.category]
    );
}
```

**Display consumers (use `getVisibleBodies()`):**
- `renderer.js` - drawing bodies, orbits, labels
- `navigation.js` - target dropdown population
- `intersectionDetector.js` - encounter marker display (ghost planets)

**Physics consumers (use full `celestialBodies` array):**
- `shipPhysics.js` - SOI detection, gravity calculations, collisions
- Position updates - always run for all bodies

## Implementation Steps

### Step 1: Add Filter State to gameState.js

**Location:** `src/js/core/gameState.js`

**Add export:**
```javascript
export const bodyFilters = {
    planet: true,
    'dwarf-planet': true,
    'major-moon': true,
    'minor-moon': false,
    asteroid: false
};
```

**Add persistence functions:**
```javascript
// Save filter state to localStorage
export function saveBodyFilters() {
    localStorage.setItem('bodyFilters', JSON.stringify(bodyFilters));
}

// Load filter state from localStorage
export function loadBodyFilters() {
    const saved = localStorage.getItem('bodyFilters');
    if (saved) {
        const parsed = JSON.parse(saved);
        Object.assign(bodyFilters, parsed);
    }
}
```

**Call `loadBodyFilters()` in initialization** (wherever other localStorage loads happen)

### Step 2: Add getVisibleBodies() to celestialBodies.js

**Location:** `src/js/data/celestialBodies.js`

**Add at end of file (before legacy compatibility section):**
```javascript
import { bodyFilters } from '../core/gameState.js';

/**
 * Get only the bodies that should be displayed based on current filter settings.
 * NOTE: Physics systems should use the full celestialBodies array, not this.
 * This is for rendering, labels, navigation dropdown, etc.
 *
 * @returns {Array} Filtered array of celestial bodies
 */
export function getVisibleBodies() {
    return celestialBodies.filter(body =>
        !body.category || bodyFilters[body.category]
    );
}
```

### Step 3: Update Renderers to Use getVisibleBodies()

**Files to update:**
- `src/js/ui/renderer.js`
- `src/js/core/navigation.js`
- `src/js/lib/intersectionDetector.js` (for display only, not detection logic)

**Pattern:**
```javascript
// OLD
import { celestialBodies } from '../data/celestialBodies.js';
celestialBodies.forEach(body => { /* render */ });

// NEW
import { getVisibleBodies } from '../data/celestialBodies.js';
getVisibleBodies().forEach(body => { /* render */ });
```

**IMPORTANT:** Do NOT change physics code in `shipPhysics.js` - it must use full array

### Step 4: Populate celestialBodies Array

**Location:** `src/js/data/celestialBodies.js`

**Data source:** JPL Horizons System (https://ssd.jpl.nasa.gov/horizons/)
- Query each body for osculating orbital elements at J2000 epoch (JD 2451545.0)
- Reference frame: Ecliptic and Mean Equinox of J2000
- Use heliocentric coordinates for planets/asteroids/dwarf planets
- Use planet-centric coordinates for moons

**Data format for each body:**
```javascript
{
    name: 'BODY_NAME',
    type: 'planet|moon|asteroid',
    category: 'planet|dwarf-planet|major-moon|minor-moon|asteroid',
    parent: 'PARENT_NAME',  // Only for moons
    elements: {
        a: 0.000,           // Semi-major axis (AU)
        e: 0.000,           // Eccentricity
        i: deg2rad(0.0),    // Inclination (convert from degrees)
        Ω: deg2rad(0.0),    // Longitude of ascending node
        ω: deg2rad(0.0),    // Argument of periapsis
        M0: deg2rad(0.0),   // Mean anomaly at epoch
        epoch: J2000,
        μ: MU_SUN           // Or GRAVITATIONAL_PARAMS.parent for moons
    }
}
```

**Bodies to add (organized by category):**

**Dwarf Planets (add 3, Pluto/Ceres already exist):**
- Eris
- Makemake
- Haumea

**Major Moons (add ~22, Luna/Ganymede/Phobos already exist):**
- Jovian: Io, Europa, Callisto
- Saturnian: Titan, Rhea, Iapetus, Dione, Tethys, Enceladus, Mimas
- Uranian: Titania, Oberon, Umbriel, Ariel, Miranda
- Neptunian: Triton, Proteus
- Plutonian: Charon
- Martian: Deimos

**Minor Moons (~30):**
- Jovian: Amalthea, Himalia, Thebe, Elara, Pasiphae, Metis, Carme, Sinope
- Saturnian: Hyperion, Phoebe, Janus, Epimetheus, Prometheus, Pandora
- Uranian: Puck, Portia, Juliet, Belinda, Cressida, Rosalind
- Neptunian: Nereid, Larissa, Galatea, Despina, Thalassa, Naiad

**Asteroids (~15):**
- Main Belt: Vesta, Pallas, Hygiea, Juno, Astraea, Hebe, Iris, Flora, Metis
- Near-Earth: Eros, Gaspra
- Trojans: 588 Achilles, 617 Patroclus, 624 Hektor

**Organization in file:**
```javascript
export const celestialBodies = [
    // Sun (existing)

    // ========================================================================
    // Planets (existing 5 + add 3)
    // ========================================================================
    // Add: Saturn, Uranus, Neptune

    // ========================================================================
    // Dwarf Planets (existing 1 + add 3)
    // ========================================================================
    // Ceres exists, add: Pluto, Eris, Makemake, Haumea

    // ========================================================================
    // Major Moons (existing 3 + add ~22)
    // ========================================================================
    // Organize by parent planet

    // ========================================================================
    // Minor Moons (add ~30)
    // ========================================================================
    // Organize by parent planet

    // ========================================================================
    // Asteroids (add ~15)
    // ========================================================================
    // Organize by orbital region (Main Belt, NEA, Trojans)
];
```

### Step 5: Expand config.js

**Location:** `src/js/config.js`

**Add to GRAVITATIONAL_PARAMS:**
```javascript
export const GRAVITATIONAL_PARAMS = {
    sun: 0.0002959122,     // Existing
    earth: 8.997e-10,      // Existing
    mars: 9.55e-11,        // Existing
    jupiter: 2.825e-7,     // Existing
    saturn: 8.459e-8,      // NEW - for Saturnian moons
    uranus: 1.292e-8,      // NEW - for Uranian moons
    neptune: 1.524e-8,     // NEW - for Neptunian moons
    pluto: 1.96e-12        // NEW - for Charon
};
```

**Add to BODY_DISPLAY (all ~70 new bodies):**

**Color strategy:**
- Planets: Realistic (Mars = #cd5c5c, Jupiter = #c88b3a, Saturn = #fad5a5, etc.)
- Dwarf planets: Gray/brown (#888888, #7a6f5d)
- Major moons: Light versions of parent color
- Minor moons: Dim gray (#777777)
- Asteroids: Gray/brown (#665544)

**Size strategy:**
- Planets: 4-12 pixels (existing)
- Dwarf planets: 3-5 pixels
- Major moons: 2-4 pixels
- Minor moons: 2 pixels
- Asteroids: 2-3 pixels

### Step 6: Add UI Controls

**Location:** `src/index.html`

**Add after existing display options in left panel:**
```html
<div class="panel-section" id="bodyFiltersSection">
    <h3 class="collapsible-header">BODIES</h3>
    <div class="collapsible-content">
        <label>
            <input type="checkbox" id="filterPlanet" checked>
            Planets
        </label>
        <label>
            <input type="checkbox" id="filterDwarfPlanet" checked>
            Dwarf Planets
        </label>
        <label>
            <input type="checkbox" id="filterMajorMoon" checked>
            Major Moons
        </label>
        <label>
            <input type="checkbox" id="filterMinorMoon">
            Minor Moons
        </label>
        <label>
            <input type="checkbox" id="filterAsteroid">
            Asteroids
        </label>
    </div>
</div>
```

**Location:** `src/js/ui/controls.js`

**Add event handlers in initialization:**
```javascript
import { bodyFilters, saveBodyFilters } from '../core/gameState.js';

// Wire up body filter checkboxes
document.getElementById('filterPlanet').addEventListener('change', (e) => {
    bodyFilters.planet = e.target.checked;
    saveBodyFilters();
});

document.getElementById('filterDwarfPlanet').addEventListener('change', (e) => {
    bodyFilters['dwarf-planet'] = e.target.checked;
    saveBodyFilters();
});

document.getElementById('filterMajorMoon').addEventListener('change', (e) => {
    bodyFilters['major-moon'] = e.target.checked;
    saveBodyFilters();
});

document.getElementById('filterMinorMoon').addEventListener('change', (e) => {
    bodyFilters['minor-moon'] = e.target.checked;
    saveBodyFilters();
});

document.getElementById('filterAsteroid').addEventListener('change', (e) => {
    bodyFilters.asteroid = e.target.checked;
    saveBodyFilters();
});

// Initialize checkbox states from loaded filters
document.getElementById('filterPlanet').checked = bodyFilters.planet;
document.getElementById('filterDwarfPlanet').checked = bodyFilters['dwarf-planet'];
document.getElementById('filterMajorMoon').checked = bodyFilters['major-moon'];
document.getElementById('filterMinorMoon').checked = bodyFilters['minor-moon'];
document.getElementById('filterAsteroid').checked = bodyFilters.asteroid;
```

**Add collapsible behavior** (reuse existing pattern from other panel sections)

### Step 7: Update Navigation Dropdown

**Location:** `src/js/core/navigation.js` (or wherever target dropdown is populated)

**Change:**
```javascript
// OLD
import { celestialBodies } from '../data/celestialBodies.js';

// NEW
import { getVisibleBodies } from '../data/celestialBodies.js';

// When populating dropdown options
getVisibleBodies().forEach(body => {
    // ... add to dropdown
});
```

### Step 8: Update Encounter Markers

**Location:** `src/js/lib/intersectionDetector.js` or wherever encounter markers are rendered

**Pattern:**
- Detection logic uses full `celestialBodies` array (physics must know about all crossings)
- Display logic uses `getVisibleBodies()` to filter which ghosts to render

## Testing Checklist

### Visual Filtering Tests
- [ ] Toggle "Planets" - all planets disappear/reappear
- [ ] Toggle "Dwarf Planets" - Pluto, Ceres, etc. disappear/reappear
- [ ] Toggle "Major Moons" - Luna, Titan, etc. disappear/reappear
- [ ] Toggle "Minor Moons" - Phobos, Deimos, etc. disappear/reappear
- [ ] Toggle "Asteroids" - Vesta, Pallas, etc. disappear/reappear
- [ ] Filter state persists after page refresh

### Physics Tests (Critical)
- [ ] Filtered planet still captures ship in SOI
- [ ] Filtered moon still exerts gravity
- [ ] Collision detection works on filtered bodies
- [ ] Ship trajectory accounts for filtered bodies

### Navigation Tests
- [ ] Dropdown only shows visible bodies
- [ ] Can still navigate to bodies after filtering on then off
- [ ] Encounter markers respect filters (no ghosts for filtered planets)

### Performance Tests
- [ ] Frame rate acceptable with all ~80 bodies enabled
- [ ] Frame rate acceptable with all filters off (only planets visible)
- [ ] No lag when toggling filters

### Console Tests
```javascript
// Test filter function
import { getVisibleBodies } from '/js/data/celestialBodies.js';
import { bodyFilters } from '/js/core/gameState.js';

// Should return only planets + dwarf planets + major moons
console.log(getVisibleBodies().length);

// Disable everything
bodyFilters.planet = false;
bodyFilters['dwarf-planet'] = false;
bodyFilters['major-moon'] = false;
console.log(getVisibleBodies().length); // Should be ~0

// Re-enable
bodyFilters.planet = true;
bodyFilters['major-moon'] = true;
console.log(getVisibleBodies().length); // Should show planets + major moons
```

## Data Collection Script (Optional)

For bulk data collection from JPL Horizons, you can use this pattern:

```python
# horizons_query.py - Query JPL Horizons for orbital elements
# Usage: python3 horizons_query.py BODY_ID

import sys
from astroquery.jplhorizons import Horizons

body_id = sys.argv[1]  # e.g., '501' for Io
obj = Horizons(id=body_id, location='@sun', epochs=2451545.0)  # J2000
el = obj.elements()

print(f"a: {el['a'][0]}")      # AU
print(f"e: {el['e'][0]}")
print(f"i: {el['incl'][0]}")   # degrees
print(f"Ω: {el['Omega'][0]}")  # degrees
print(f"ω: {el['w'][0]}")      # degrees
print(f"M0: {el['M'][0]}")     # degrees
```

Or query manually via web interface: https://ssd.jpl.nasa.gov/horizons/app.html

## Notes

- **Existing bodies**: Don't delete MERCURY, VENUS, EARTH, MARS, JUPITER - keep them, just add `category: 'planet'`
- **Ceres**: Already exists as asteroid, change to `category: 'dwarf-planet'`
- **Moon positions**: Always use parent-relative Keplerian even in time travel mode (astronomy-engine doesn't provide moon ephemeris)
- **Performance**: With ~80 bodies, expect slight frame drop. If problematic, consider LOD (level of detail) system based on zoom
- **Future expansion**: Easy to add more asteroids/moons by appending to celestialBodies array with appropriate category

## Success Criteria

✅ All physics calculations include all bodies regardless of filter state
✅ Display respects filter settings (bodies truly invisible when filtered)
✅ Filter state persists across sessions
✅ UI controls are intuitive and match existing display options style
✅ No performance degradation with full body catalog
✅ Existing features (SOI, navigation, encounter markers) work with new bodies
