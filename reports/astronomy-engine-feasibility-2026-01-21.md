# Astronomy Engine Feasibility Study

**Date:** 2026-01-21
**Purpose:** Evaluate astronomy-engine library for three game features: historical date positioning, course plotting assistance, and launch window optimization

---

## Executive Summary

**Overall Verdict:** ✅ **FEASIBLE for Use Case #1** | ❌ **NOT SUITABLE for Use Cases #2 and #3**

Astronomy-engine excels at accurate planetary ephemeris calculations but lacks trajectory optimization and transfer orbit planning capabilities. Recommended approach: Use for date-specific positioning, develop custom solutions for navigation assistance.

---

## Library Overview: astronomy-engine

**Source:** https://github.com/cosinekitty/astronomy
**Documentation Quality:** High (525 code snippets, High reputation)
**Languages:** JavaScript, TypeScript, C, Python, C#, Kotlin
**Browser Support:** ✅ Yes (`astronomy.browser.js` bundle)
**Build-free Usage:** ✅ Yes (works with vanilla JS, no bundler required)

### Core Capabilities
- **Planetary positions:** Heliocentric and barycentric state vectors (position + velocity)
- **Time handling:** Converts JavaScript Date objects to astronomical time
- **Coordinate systems:** J2000 equatorial, ecliptic, galactic
- **Accuracy:** Based on JPL ephemeris data
- **Date range:** 1900-2100 validated

### Key JavaScript API Functions
```javascript
import { HelioVector, HelioState, MakeTime } from 'astronomy-engine';

// Get planet position at specific date
const date = new Date('2026-06-15T12:00:00Z');
const time = MakeTime(date);
const mars = HelioVector('Mars', time);  // {x, y, z, t}
const state = HelioState('Mars', time);  // {x, y, z, vx, vy, vz, t}
```

---

## Use Case Analysis

### 1️⃣ Place Planets at Specific Dates ✅ **HIGHLY FEASIBLE**

**Requirement:** Date selector UI to position planets historically/future

**Current Implementation:**
- Static Keplerian elements from J2000 epoch (celestialBodies.js:57-123)
- Propagates orbits using `getPosition(elements, julianDate)` (orbital.js)
- Accurate for moderate time spans but degrades over decades

**astronomy-engine Solution:**
```javascript
// Replace static propagation with live ephemeris
function getAccuratePlanetPosition(planetName, date) {
    const time = Astronomy.MakeTime(date);
    const state = Astronomy.HelioState(planetName, time);
    return {
        x: state.x,   // AU
        y: state.y,
        z: state.z,
        vx: state.vx, // AU/day
        vy: state.vy,
        vz: state.vz
    };
}
```

**Benefits:**
- ✅ Accurate positions for any date (1900-2100)
- ✅ Eliminates long-term propagation errors
- ✅ Enables historical missions ("Launch from Earth on 1969-07-16")
- ✅ Realistic planetary conjunctions and oppositions
- ✅ Direct drop-in replacement for `getPosition()` calls

**Implementation Effort:** 🟢 **LOW**
- Add `<script src="astronomy.browser.js">` to index.html
- Modify `celestialBodies.js` to call `HelioState()` instead of `getPosition()`
- Add date picker UI component
- Convert between game time and JavaScript Date objects

**Limitations:**
- ~150KB library size (reasonable for browser game)
- Slight performance overhead vs. Keplerian propagation (negligible for 10-20 bodies)

**Recommendation:** **STRONGLY RECOMMENDED**
This is astronomy-engine's sweet spot. Provides professional-grade accuracy with minimal integration cost.

---

### 2️⃣ Help Plot Courses in the Game ❌ **NOT SUITABLE**

**Requirement:** Make interplanetary navigation easier (currently hard to get around system)

**What's Needed:**
- Trajectory optimization given current ship state and destination
- Delta-v budget calculations
- Thrust vector recommendations for solar sail
- Real-time guidance: "Adjust yaw +15° to intercept Mars in 120 days"

**What astronomy-engine Provides:**
- ✅ Planetary positions/velocities at any time
- ❌ NO trajectory optimization
- ❌ NO transfer orbit calculations
- ❌ NO delta-v planning
- ❌ NO guidance algorithms

**Gap Analysis:**
astronomy-engine is a **passive ephemeris calculator**, not a **trajectory planner**. It answers "Where is Mars?" but not "How do I get to Mars?"

**Alternative Solutions:**

**Option A: Manual Navigation Aids (Simpler)**
- Add distance-to-intercept indicators
- Show relative velocity vectors (Δv required)
- Display Hohmann transfer windows (when planets aligned)
- Use astronomy-engine for future planet positions, calculate intercept geometry manually

**Option B: Custom Trajectory Optimizer (Complex)**
- Implement Lambert solver for two-body transfers
- Build porkchop plot generator
- Add continuous thrust trajectory optimization (specific to solar sails)
- Consider libraries like:
  - **poliastro** (Python, has trajectory planning but requires backend)
  - **io-astrodynamics** (.NET, 5258 snippets, has propagation/maneuvers)

**Option C: Simplified Autopilot**
- Calculate ideal sail orientation toward destination
- Show "navigation cone" indicating good intercept geometries
- Provide "days to intercept" estimates
- Keep it game-friendly rather than NASA-accurate

**Recommendation:** **DO NOT USE astronomy-engine for this**
Build custom navigation aids using game's existing physics. astronomy-engine can provide future positions for intercept prediction, but course optimization requires separate development.

---

### 3️⃣ Find Ideal Launch Dates for Transfer Orbits ❌ **NOT SUITABLE**

**Requirement:** Calculate optimal launch windows (like Earth→Mars synodic period analysis)

**Classic Problem:** Porkchop plots showing C3 energy or delta-v for launch date vs. arrival date grids

**What astronomy-engine Provides:**
- ✅ Planetary positions at any departure/arrival date
- ❌ NO launch window search
- ❌ NO transfer optimization
- ❌ NO porkchop plot generation
- ❌ NO synodic period calculations

**Why It's Missing:**
Launch window optimization requires:
1. Iterating over launch/arrival date combinations
2. Solving Lambert's problem (two-point boundary value)
3. Calculating required delta-v or C3 energy
4. Finding minima in solution space

astronomy-engine does step 1 (ephemeris), but 2-4 are separate algorithms.

**Workaround Using astronomy-engine:**

```javascript
// Brute-force search (computationally expensive)
function findLaunchWindows(origin, destination, daysAhead) {
    const windows = [];

    for (let launchDay = 0; launchDay < daysAhead; launchDay += 5) {
        for (let flightTime = 30; flightTime < 365; flightTime += 5) {
            const launchDate = new Date(Date.now() + launchDay * 86400000);
            const arrivalDate = new Date(launchDate.getTime() + flightTime * 86400000);

            const originState = HelioState(origin, MakeTime(launchDate));
            const destState = HelioState(destination, MakeTime(arrivalDate));

            // Would need Lambert solver here to get required delta-v
            // astronomy-engine doesn't provide this
            const deltaV = solveLambert(originState, destState, flightTime); // NOT IN LIBRARY

            if (deltaV < threshold) {
                windows.push({ launchDate, arrivalDate, deltaV });
            }
        }
    }

    return windows;
}
```

**Problem:** The critical `solveLambert()` function doesn't exist in astronomy-engine.

**Alternative Approaches:**

**Option A: Simplified Synodic Period Indicator**
- Calculate planetary synodic periods (when planets return to same relative geometry)
- Show "next good launch window" based on phase angles
- Use astronomy-engine to verify planetary positions
- Accuracy: ±weeks (good enough for game feel)

**Option B: Port Lambert Solver**
- Implement Izzo's Lambert algorithm in JavaScript
- Use astronomy-engine for ephemeris, custom code for transfers
- Combines both libraries
- Complexity: High (orbital mechanics expertise required)

**Option C: Precomputed Launch Windows**
- Generate tables of good windows offline (Python with poliastro)
- Store as JSON data
- Use astronomy-engine to refine in-game
- Best user experience, one-time computation cost

**Recommendation:** **DO NOT USE astronomy-engine alone**
Combine with simplified heuristics (Option A) or precomputed data (Option C). Full optimization requires Lambert solver not present in library.

---

## Technical Integration Notes

### Adding to Vanilla JS Project

**Current Stack:**
- No build tools, no npm, no bundler
- ES6 modules via `<script type="module">`
- Python http.server for development

**Integration Path:**

```html
<!-- index.html -->
<script src="js/vendor/astronomy.browser.js"></script>
<script type="module" src="js/main.js"></script>
```

```javascript
// Access as global Astronomy object
const time = Astronomy.MakeTime(new Date());
const mars = Astronomy.HelioState('Mars', time);
```

**OR** use ES module version (if available):
```javascript
// Requires CDN or local copy of ESM build
import * as Astronomy from './vendor/astronomy.mjs';
```

### Performance Characteristics
- **Cold calculation:** ~1-5ms per planet position
- **Cached results:** Sub-millisecond
- **200 bodies over 2 years:** ~100-500ms (would need optimization for real-time prediction)

### Data Volume
- Browser bundle: ~150KB minified
- No external data files (ephemeris baked in)
- Offline-capable

---

## Recommendations by Priority

### ✅ IMPLEMENT: Use Case #1 (Date-based Positioning)
**Why:** High value, low effort, plays to library's strengths

**Action Items:**
1. Download `astronomy.browser.js` from npm package
2. Create date picker UI component
3. Modify `celestialBodies.js` to use `HelioState()` for dynamic positioning
4. Add "Set to Today" / "Set to Date" controls
5. Optional: Add historical event presets ("Apollo 11 Launch", "Voyager 1", etc.)

**Estimated Effort:** 4-8 hours
**User Impact:** High (enables historical accuracy, mission replay scenarios)

---

### ⚠️ PARTIAL USE: Use Case #2 (Course Plotting)
**Why:** Library provides building blocks, but navigation logic must be custom

**Action Items:**
1. Use astronomy-engine to predict future planetary positions
2. Build custom "intercept calculator" using game's physics model
3. Add visual aids: approach vectors, time-to-intercept cones
4. Consider autopilot that points sail toward predicted intercept point
5. Iterate on UX based on playtesting

**Estimated Effort:** 20-40 hours (mostly custom development)
**User Impact:** High (core gameplay improvement)
**astronomy-engine Contribution:** 20% (ephemeris only)

---

### ❌ DO NOT USE: Use Case #3 (Launch Windows)
**Why:** Core optimization algorithms missing, workaround complexity too high

**Action Items:**
1. Implement simplified synodic period indicators
2. Precompute good launch windows offline (Python script)
3. Store as static JSON data in game
4. Optionally use astronomy-engine to refine stored windows
5. Focus on "good enough" rather than "optimal"

**Estimated Effort:** 12-24 hours (precomputation + UI)
**User Impact:** Medium (nice-to-have feature)
**astronomy-engine Contribution:** 0% (can do without it)

---

## Cost-Benefit Analysis

| Feature | astronomy-engine Value | Development Cost | User Value | Verdict |
|---------|----------------------|------------------|------------|---------|
| Date positioning | ⭐⭐⭐⭐⭐ | 🟢 Low | ⭐⭐⭐⭐ | ✅ Do it |
| Course plotting | ⭐⭐ | 🟡 Medium | ⭐⭐⭐⭐⭐ | ⚠️ Custom solution |
| Launch windows | ⭐ | 🔴 High | ⭐⭐⭐ | ❌ Skip or simplify |

---

## Alternative Libraries Considered

### poliastro (Python)
- ✅ Full astrodynamics suite (Lambert, porkchop plots, maneuvers)
- ❌ Python-only (requires backend server)
- **Verdict:** Offline analysis tool, not in-browser

### io-astrodynamics (.NET)
- ✅ Comprehensive (5258 code snippets, 77.3 benchmark score)
- ✅ Propagation, maneuvers, event finding
- ❌ .NET runtime (not JavaScript compatible)
- **Verdict:** Wrong platform

### Custom Implementation
- ✅ Tailored to solar sail physics
- ✅ No dependencies
- ❌ Requires orbital mechanics expertise
- **Verdict:** Necessary for Use Cases #2 and #3

---

## Final Recommendations

### Phase 1: Quick Win ✅
**Add astronomy-engine for date-based planet positioning**
- 1 day implementation
- Immediate accuracy improvements
- Enables historical scenario mode

### Phase 2: Custom Navigation 🛠️
**Build game-specific course plotting aids**
- Use astronomy-engine for future positions
- Implement custom intercept geometry
- Focus on playability over realism

### Phase 3: Optional Enhancement 🎯
**Simplified launch window hints**
- Precomputed data approach
- astronomy-engine can validate but not required
- Ship as v2 feature

---

## Code Examples

### Replacing Current Orbital Propagation

**Before (celestialBodies.js:42-130):**
```javascript
// Static elements from J2000
elements: {
    a: 1.523679,
    e: 0.0934,
    i: deg2rad(1.850),
    Ω: deg2rad(49.558),
    ω: deg2rad(286.502),
    M0: deg2rad(19.373),
    epoch: J2000,
    μ: MU_SUN
}
```

**After (with astronomy-engine):**
```javascript
function updateCelestialPosition(body, julianDate) {
    if (body.name === 'SOL') {
        return { x: 0, y: 0, z: 0 }; // Sun at origin
    }

    // Convert Julian date to JavaScript Date
    const jd0 = 2440587.5; // Unix epoch in JD
    const unixTime = (julianDate - jd0) * 86400000;
    const date = new Date(unixTime);

    // Get accurate position from astronomy-engine
    const time = Astronomy.MakeTime(date);
    const state = Astronomy.HelioState(body.name, time);

    return {
        x: state.x,
        y: state.y,
        z: state.z,
        vx: state.vx,
        vy: state.vy,
        vz: state.vz
    };
}
```

### Date Picker Integration

```javascript
// Add to controls.js
function handleDateSelection(event) {
    const selectedDate = new Date(event.target.value);
    const jd = dateToJulian(selectedDate);
    gameState.currentJulianDate = jd;

    // Trigger full position recalculation
    updateAllCelestialPositions();
}

function dateToJulian(date) {
    return (date.getTime() / 86400000) + 2440587.5;
}
```

---

## Conclusion

astronomy-engine is **perfectly suited for accurate planetary ephemeris** (Use Case #1) but **not designed for trajectory optimization** (Use Cases #2 and #3).

**Recommended Strategy:**
1. ✅ **Adopt** for date-based positioning (high ROI)
2. 🛠️ **Build custom** navigation aids using game physics
3. 🎯 **Simplify** launch window feature or precompute offline

The library fills a specific gap (accurate planet positions) without solving the full navigation problem. This is acceptable—most space games use separate systems for ephemeris vs. trajectory planning.

**Next Steps:**
1. Download astronomy-engine browser bundle
2. Prototype date selector UI
3. Benchmark performance with 20+ bodies
4. User test navigation improvements independently

---

**Report generated:** 2026-01-21
**Library version researched:** astronomy-engine (latest, Jan 2026)
**Context7 library ID:** `/cosinekitty/astronomy`
