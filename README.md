# Sailship

A browser-based solar system navigation game where players pilot a light sail ship between planets. Navigate using solar radiation pressure — no fuel, no engines, just photons and geometry.

Built with vanilla JavaScript (ES6 modules), HTML5 Canvas, and CSS3. No build system, no bundler, zero frontend npm dependencies.

## Quick Start

```bash
docker compose up --build
```

That's it. All services start automatically.

### Services

| Service | URL | Description |
|---------|-----|-------------|
| **Frontend** | http://localhost:8080 | Game client (nginx serving static files) |
| **Backoffice** | http://localhost:3009 | Admin API + UI (Express.js) |
| **Hardhat Node** | http://localhost:8545 | Local Ethereum blockchain |
| **Contracts Deploy** | *(exits after deploy)* | One-shot contract deployer |

### Stopping

```bash
docker compose down        # Stop all services
docker compose down -v     # Stop and reset blockchain state
```

### Running in Background

```bash
docker compose up -d --build   # Detached mode
docker compose logs -f         # Tail logs
```

## How It Works

Your ship exists on real Keplerian orbits. A solar sail catches photon pressure from the Sun to gradually modify your trajectory using Gauss's variational equations. There's no "go faster" button — you adjust sail angle and deployment to shape your orbit over time.

- Solar pressure: 4.56e-6 N/m² at 1 AU, scales with 1/r²
- Default sail: 1 km² area, 90% reflectivity
- Typical acceleration: ~0.5 mm/s²

Trajectories are continuous spirals under constant thrust, not the instant burns of chemical rockets.

## Controls

### Sail Controls

| Key | Action |
|-----|--------|
| `1` / `2` / `3` | Select DEPLOYMENT / YAW / PITCH |
| `Up` / `Down` | Adjust selected control |
| `F` | Cycle resolution (COARSE / NORMAL / FINE / ULTRA / UBER) |
| `[` / `]` | Adjust yaw ±5° |
| `{` / `}` | Adjust pitch ±5° |
| `-` / `=` | Adjust deployment ±10% |

### Camera

| Key | Action |
|-----|--------|
| `Q` / `E` | Rotate view |
| `W` / `S` | Tilt view |
| `R` | Reset view |
| Mouse wheel | Zoom |
| Left-click drag | Pan |
| Right-click drag | Rotate |

### Navigation

| Key | Action |
|-----|--------|
| `A` | Toggle autopilot |
| `Ctrl+1` / `Cmd+1` | Switch to SAIL tab |
| `Ctrl+2` / `Cmd+2` | Switch to NAV tab |

## Tests

### Node.js tests

```bash
npm test             # All tests
npm run test:lib     # Library tests only
npm run test:core    # Core module tests only
```

### Browser console tests

Open http://localhost:8080 and run in the developer console:

```javascript
// Orbital mechanics
import('/js/lib/orbital.test.js').then(m => m.runAllTests())

// Orbital maneuvers (thrust)
import('/js/lib/orbital-maneuvers.test.js').then(m => m.runAllTests())

// Trajectory predictor
import('/js/lib/trajectory-predictor.test.js').then(m => m.runAllTests())

// Intersection detector
import('/js/lib/intersectionDetector.crossing.test.js').then(m => m.runAllTests())

// Starfield
import('/js/lib/starfield.test.js').then(m => m.runAllTests())
```

## Project Structure

```
src/js/
├── main.js                # Entry point, game loop
├── core/                  # Game logic
│   ├── camera.js          # 3D projection, view state
│   ├── gameState.js       # Time, zoom, display options
│   ├── navigation.js      # Destination/distance tracking
│   └── shipPhysics.js     # Per-frame physics updates
├── data/                  # Game data
│   ├── celestialBodies.js # Planets, moons, asteroids
│   └── ships.js           # Player and NPC vessels
├── lib/                   # Utility libraries
│   ├── orbital.js         # Orbital mechanics calculations
│   ├── orbital-maneuvers.js    # Sail thrust, Gauss variational equations
│   ├── trajectory-predictor.js # Predicted trajectory with continuous thrust
│   ├── intersectionDetector.js # Orbit crossing detection
│   └── starfield.js       # Background star rendering
└── ui/                    # Rendering and interaction
    ├── controls.js        # Input handlers
    ├── renderer.js        # Canvas drawing
    └── uiUpdater.js       # DOM panel updates

contracts/                 # Solidity smart contracts (Hardhat)
backoffice/                # Admin API + UI (Express.js)
```

## Blockchain Layer

The game includes an on-chain layer for ship ownership and resource management:

- **ShipNFT** (ERC-721 + ERC-6551) — Ships are NFTs with token-bound accounts
- **ResourceToken** (ERC-20) — CH4, O2, H2O, CO2, N2 resource tokens
- **CelestialBodyRegistry** — Factory for celestial body contracts
- **GameRegistry** — Central contract registry

The backoffice at http://localhost:3009 provides an admin UI for minting ships, managing resources, and creating celestial bodies.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Vanilla JS (ES6 modules), HTML5 Canvas, CSS3 |
| Backoffice | Node.js, Express.js, ethers.js v6 |
| Blockchain | Solidity, Hardhat, OpenZeppelin |
| Serving | nginx (frontend), Docker Compose |
