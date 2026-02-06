# Ship 3D Model Libraries Research

**Date:** 2026-02-06

## Executive Summary

This report catalogs free, open-source 3D model libraries suitable for adding ship models to the solar sail game. It also covers the technical approach needed to render 3D models in the current Canvas 2D + WebGL hybrid architecture, including a "zoom to ship" feature.

---

## Part 1: Free 3D Model Libraries

### Tier 1 — Best Fit (Space-themed, web-ready, permissive license)

| Library | License | Formats | Ship Models? | Link |
|---------|---------|---------|-------------|------|
| **Kenney Space Kit** | CC0 1.0 (public domain) | OBJ, FBX | ~10 ships + modular parts | [kenney.nl/assets/space-kit](https://kenney.nl/assets/space-kit) |
| **Kenney Space Station Kit** | CC0 1.0 | OBJ, FBX | Station modules + ships | [kenney.nl/assets/space-station-kit](https://kenney.nl/assets/space-station-kit) |
| **Sketchfab (CC-licensed)** | CC-BY / CC0 (per model) | glTF, OBJ, FBX | Thousands of spaceships | [sketchfab.com/tags/spaceship](https://sketchfab.com/tags/spaceship) |
| **NASA 3D Resources** | Public domain (US govt) | Various + glTF via Sketchfab | Solar sails, probes, satellites | [nasa3d.arc.nasa.gov/models](https://nasa3d.arc.nasa.gov/models) |

**Notable find:** NASA has a **Solar Sail concept model** on Sketchfab — directly relevant to this game:
- [Solar Sail-concept1](https://sketchfab.com/3d-models/solar-sail-concept1-7273ca0a8f6641d5bda09088e017401e) (CC-BY, glTF download available)

### Tier 2 — Large General Libraries (filter for spaceships)

| Library | License | Formats | Notes | Link |
|---------|---------|---------|-------|------|
| **Free3D** | Varies per model | OBJ, FBX, 3DS, glTF | 500+ spaceship models, check individual licenses | [free3d.com/3d-models/spaceship](https://free3d.com/3d-models/spaceship) |
| **TurboSquid (free)** | Varies per model | glTF, OBJ, FBX | 500+ free spaceships, 500+ free glTF models | [turbosquid.com](https://www.turbosquid.com/Search/3D-Models/free/spaceship) |
| **OpenGameArt** | CC0 / CC-BY / GPL | Various | Community-submitted game assets | [opengameart.org](https://opengameart.org/art-search-advanced?keys=spaceship&type=3d) |
| **Clara.io** | Varies per model | OBJ, FBX, Three.js JSON | Direct Three.js format export | [clara.io/library?query=Spaceship](https://clara.io/library?query=Spaceship) |

### Tier 3 — Curated Collections & Frameworks

| Resource | Description | Link |
|----------|-------------|------|
| **Poly Haven** | CC0 HDRIs, textures, and some models | [polyhaven.com](https://polyhaven.com) |
| **Poimandres Market** | glTF models curated for web/React Three Fiber | [market.pmnd.rs](https://market.pmnd.rs) |
| **threex.spaceships** | Three.js extension with ready-to-use ship models | [github.com/jeromeetienne/threex.spaceships](https://github.com/jeromeetienne/threex.spaceships) |
| **Khronos glTF Samples** | Reference glTF models (not ships, but good for testing loaders) | [github.com/KhronosGroup/glTF-Sample-Assets](https://github.com/KhronosGroup/glTF-Sample-Assets) |

---

## Part 2: Recommended Model Format

**glTF 2.0 (.gltf / .glb)** is the best format for this project:

- **Web-native**: Designed for efficient browser delivery
- **Compact**: Binary .glb variant is a single file with embedded textures
- **Standardized**: Maintained by Khronos Group (same org as WebGL/OpenGL)
- **Wide support**: Three.js GLTFLoader, Babylon.js, raw WebGL parsers
- **PBR materials**: Built-in physically-based rendering material model
- **Sketchfab exports**: All Sketchfab downloads include glTF option

OBJ/FBX from Kenney can be converted to glTF using:
- [gltf-pipeline](https://github.com/CesiumGS/gltf-pipeline) (CLI tool)
- [FBX2glTF](https://github.com/facebookincubator/FBX2glTF) (Facebook's converter)
- Blender (import OBJ/FBX → export glTF)

---

## Part 3: Technical Integration — Zoom to Ship

### Current State

The game currently renders ships as **fixed-size 2D triangles** (~12px) on a Canvas 2D context. Ships don't scale with zoom and have no 3D geometry. The rendering stack is:

- **Primary**: Canvas 2D (`ctx = canvas.getContext('2d')`)
- **Secondary**: WebGL 2.0 offscreen canvas (planet textures only, in `planetTextures.js`)
- **Projection**: Orthographic (no perspective)
- **Ship drawing**: `renderer.js:1334-1359` — hardcoded triangle path

### Proposed Approach: Hybrid WebGL Ship Rendering

Extend the existing WebGL offscreen canvas pattern (already used for planet textures) to render 3D ship models when zoomed in.

#### How It Works

```
Zoom Level     | Ship Rendering
---------------|--------------------------------------------------
Far (default)  | 2D triangle icon (current behavior, unchanged)
Medium         | Larger 2D icon with orientation arrow
Close          | 3D model rendered via WebGL offscreen canvas,
               | composited onto main Canvas 2D (same as planets)
```

#### Architecture

```
src/js/
├── lib/
│   ├── planetTextures.js    # EXISTING - WebGL offscreen for planets
│   └── shipModels.js        # NEW - WebGL offscreen for ship 3D models
├── data/
│   └── models/              # NEW - glTF/glb ship model files
│       ├── solar-sail.glb
│       └── cargo-ship.glb
```

#### Key Components Needed

1. **glTF Loader** — Parse .glb files into vertex buffers, textures, materials
   - Option A: Minimal custom loader (~500 lines, no dependencies)
   - Option B: Three.js GLTFLoader (~600KB added dependency)
   - Option C: [glTF-Transform](https://gltf-transform.dev/) for preprocessing, custom WebGL renderer

2. **Ship WebGL Renderer** — Similar to `planetTextures.js` pattern
   - Offscreen WebGL canvas renders ship model
   - Vertex/fragment shaders for PBR or simple Phong lighting
   - Sun-direction lighting (already computed for planets)
   - Result composited to main canvas via `ctx.drawImage()`

3. **Zoom-Triggered LOD** — Switch rendering based on zoom level
   - Far: current 2D triangle (cheap)
   - Close: 3D model render (expensive but only 1-2 ships visible at close zoom)

4. **Camera Enhancement** — Add perspective when zoomed to ship
   - Current orthographic projection works for solar system view
   - Ship close-up benefits from perspective projection
   - Could interpolate between ortho and perspective based on zoom

#### Implementation Without Three.js (Zero Dependencies)

Since the project has a zero-dependency philosophy, a minimal approach:

```javascript
// shipModels.js - sketch of the pattern

const shipGL = document.createElement('canvas').getContext('webgl2');

// Load .glb (binary glTF) - it's just a binary container
async function loadGLB(url) {
    const buffer = await fetch(url).then(r => r.arrayBuffer());
    // Parse glTF JSON chunk + binary chunk
    // Extract vertex positions, normals, UVs, indices
    // Create WebGL buffers
}

// Render ship model to offscreen canvas
function renderShipModel(model, sunDirection, rotation, size) {
    // Set viewport to desired output size
    // Apply model-view-projection matrix
    // Draw with lighting shader
    // Return canvas for compositing
}
```

#### Implementation With Three.js

If the zero-dependency constraint is relaxed for this feature:

```javascript
import * as THREE from 'three';  // CDN import possible
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const renderer = new THREE.WebGLRenderer({ alpha: true });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

const loader = new GLTFLoader();
loader.load('models/solar-sail.glb', (gltf) => {
    scene.add(gltf.scene);
});

// Render to offscreen canvas, composite to main canvas
function renderShipCloseup(shipRotation, sunDir, outputSize) {
    renderer.setSize(outputSize, outputSize);
    renderer.render(scene, camera);
    // ctx.drawImage(renderer.domElement, x, y, w, h);
}
```

Three.js can be loaded from CDN without npm:
```html
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.170/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170/examples/jsm/"
  }
}
</script>
```

---

## Part 4: Recommendations

### Quick Win — Ship Models to Start With

1. **NASA Solar Sail concept** (Sketchfab, CC-BY) — Perfect thematic match
2. **Kenney Space Kit ships** (CC0) — Good low-poly ships for NPCs
3. **Sketchfab "low poly spaceship" filter** — Many CC0/CC-BY options

### Integration Path

| Phase | Work | Complexity |
|-------|------|------------|
| 1 | Add glTF loader (minimal or Three.js via CDN importmap) | Medium |
| 2 | Create `shipModels.js` WebGL offscreen renderer | Medium |
| 3 | Add zoom-triggered LOD in `renderer.js` | Low |
| 4 | Download/convert ship models to .glb | Low |
| 5 | Add ship rotation based on velocity vector | Low |
| 6 | Add perspective camera mode for close zoom | Medium |

### Recommended Starting Point

The lowest-friction path: **Three.js via CDN import map + GLTFLoader**. This avoids npm/bundler dependencies while giving access to the entire Three.js ecosystem of loaders, materials, and lighting. The existing `planetTextures.js` WebGL pattern proves the offscreen-render-and-composite approach already works in this codebase.
