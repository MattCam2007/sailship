# Solar System Population - Filter Tests

## Quick Verification

Open http://localhost:8080 and check:

### Body Count Verification
Open browser console and run:
```javascript
import('/js/data/celestialBodies.js').then(m => {
  console.log('Total bodies:', m.celestialBodies.length);
  console.log('Planets:', m.celestialBodies.filter(b => b.category === 'planet').length);
  console.log('Dwarf Planets:', m.celestialBodies.filter(b => b.category === 'dwarf-planet').length);
  console.log('Major Moons:', m.celestialBodies.filter(b => b.category === 'major-moon').length);
  console.log('Minor Moons:', m.celestialBodies.filter(b => b.category === 'minor-moon').length);
  console.log('Asteroids:', m.celestialBodies.filter(b => b.category === 'asteroid').length);
});
```

**Expected output:**
```
Total bodies: 52
Planets: 8
Dwarf Planets: 5
Major Moons: 22
Minor Moons: 11
Asteroids: 5
```

### Filter Function Test
```javascript
import('/js/data/celestialBodies.js').then(m => {
  import('/js/core/gameState.js').then(g => {
    // Test with all filters on
    console.log('All enabled:', m.getVisibleBodies().length);

    // Disable minor moons and asteroids (default state)
    g.bodyFilters['minor-moon'] = false;
    g.bodyFilters.asteroid = false;
    console.log('Default filters:', m.getVisibleBodies().length); // Should be ~36 (52 - 11 - 5)

    // Disable all
    g.bodyFilters.planet = false;
    g.bodyFilters['dwarf-planet'] = false;
    g.bodyFilters['major-moon'] = false;
    console.log('All disabled:', m.getVisibleBodies().length); // Should be 1 (just SOL)

    // Re-enable for normal use
    g.bodyFilters.planet = true;
    g.bodyFilters['dwarf-planet'] = true;
    g.bodyFilters['major-moon'] = true;
  });
});
```

## Manual UI Tests

### Visual Filtering Tests

1. **Toggle "Planets" OFF**
   - [ ] All 8 planets disappear from canvas
   - [ ] Planet orbital paths disappear
   - [ ] Planets removed from object list (left panel)
   - [ ] Planet labels disappear

2. **Toggle "Dwarf Planets" OFF**
   - [ ] Pluto, Ceres, Eris, Makemake, Haumea disappear
   - [ ] Dwarf planet orbits disappear

3. **Toggle "Major Moons" OFF**
   - [ ] Luna, Titan, Ganymede, etc. disappear
   - [ ] Major moon orbits disappear

4. **Toggle "Minor Moons" ON** (default OFF)
   - [ ] 11 minor moons appear (Phobos, Amalthea, Himalia, etc.)
   - [ ] Minor moon orbits appear

5. **Toggle "Asteroids" ON** (default OFF)
   - [ ] 5 asteroids appear (Vesta, Pallas, Juno, Hygiea, Eros)
   - [ ] Asteroid orbits appear

6. **Filter Persistence**
   - [ ] Change some filters
   - [ ] Refresh page
   - [ ] Filters remain in same state

### Physics Tests (Critical!)

**Test that filtered bodies still affect ship physics**

1. **Navigate to filtered planet:**
   - Toggle "Planets" OFF (planets invisible)
   - Set destination to MARS (use console if not in dropdown)
   - Ship should still be attracted by Mars gravity
   - SOI detection should still work for Mars

   ```javascript
   import('/js/core/navigation.js').then(m => m.setDestination('MARS'));
   ```

2. **Check SOI detection with filtered body:**
   - Filter out major moons
   - Navigate ship near Jupiter
   - Console should show SOI transitions for Ganymede/Callisto even though invisible

3. **Collision detection:**
   - Bodies should still have collision detection even when filtered
   - Physics calculations should use full celestialBodies array

### Performance Tests

1. **All bodies enabled:**
   - Toggle all filters ON
   - Check FPS (should be 60fps)
   - Zoom to outer system (Saturn/Uranus/Neptune)

2. **Minimal bodies:**
   - Toggle all filters OFF except Planets
   - Check FPS improvement with fewer bodies rendered

### Navigation Tests

1. **Object list updates with filters:**
   - [ ] Object list only shows visible bodies
   - [ ] Can still focus on filtered bodies after re-enabling filter

2. **Encounter markers respect filters:**
   - Set destination to a filtered body (e.g., Pluto with dwarf-planets off)
   - Predicted path should still work
   - Encounter markers should not appear for filtered destination

## Expected Behavior Summary

✅ **Display systems use getVisibleBodies():**
- renderer.js: orbit drawing, body rendering
- controls.js: object list population
- renderer.js: intersection markers (ghost planets)

✅ **Physics systems use full celestialBodies:**
- main.js: intersection detection
- shipPhysics.js: SOI detection, gravity, collisions
- celestialBodies.js: position updates (always all bodies)

✅ **Filter state persists:**
- Saves to localStorage on every change
- Loads on page initialization
- Default: Planets, Dwarf Planets, Major Moons ON; Minor Moons, Asteroids OFF

## Body Catalog Reference

### Planets (8) - category: 'planet'
Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune

### Dwarf Planets (5) - category: 'dwarf-planet'
Ceres, Pluto, Eris, Makemake, Haumea

### Major Moons (22) - category: 'major-moon'
- Earth: Luna
- Mars: Phobos, Deimos
- Jupiter: Io, Europa, Ganymede, Callisto
- Saturn: Mimas, Enceladus, Tethys, Dione, Rhea, Titan, Iapetus
- Uranus: Miranda, Ariel, Umbriel, Titania, Oberon
- Neptune: Triton, Proteus
- Pluto: Charon

### Minor Moons (11) - category: 'minor-moon'
- Jupiter: Amalthea, Thebe, Himalia, Elara
- Saturn: Hyperion, Phoebe, Janus, Epimetheus
- Uranus: Puck
- Neptune: Nereid, Larissa

### Asteroids (5) - category: 'asteroid'
Vesta, Pallas, Juno, Hygiea, Eros
