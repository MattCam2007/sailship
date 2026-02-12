# Phase 1: Blockchain Layer & Backoffice — Architecture Proposal

**Date:** 2026-02-11
**Status:** PENDING APPROVAL
**Lead Coordinator:** Claude Sonnet 4.5

---

## Executive Summary

This document proposes the complete architecture for Phase 1 of the blockchain integration. It includes smart contract design, backoffice tooling, team structure, and testing strategy.

**Core Principle:** The blockchain is the ledger. The game backend is the authority.

---

## 1. Contract Architecture

### 1.1 Contract Hierarchy

```
GameRegistry (central contract)
├── ResourceToken (ERC-20)
│   ├── Methane (CH4)
│   ├── Oxygen (O2)
│   └── Water (H2O)
├── ShipNFT (ERC-721 + ERC-6551)
│   └── Token Bound Accounts (one per ship)
├── CelestialBodyRegistry
│   ├── CelestialBody (individual planet/moon contracts)
│   └── ResourceEmissionProfile
└── Access Control (admin wallet permissions)
```

### 1.2 Core Contracts

#### **GameRegistry.sol**
**Purpose:** Central registry for all game contracts
**Responsibilities:**
- Store addresses of all deployed contracts (ships, resources, celestial bodies)
- Admin access control (only deployer can update addresses)
- Version tracking for contract upgrades

**Why:** Single source of truth for contract addresses. Backoffice queries this to find everything else.

---

#### **ResourceToken.sol** (ERC-20)
**Purpose:** Fungible resource tokens (CH₄, O₂, H₂O)
**Key Features:**
- Standard ERC-20 implementation
- Admin-only minting (`onlyOwner` modifier)
- Burnable (for future consumption mechanics)
- Metadata: name, symbol, icon URI

**Tokens to deploy:**
1. **Methane (CH4)** - Symbol: `CH4`, Decimals: 18
2. **Oxygen (O2)** - Symbol: `O2`, Decimals: 18
3. **Water (H2O)** - Symbol: `H2O`, Decimals: 18
4. **Carbon Dioxide (CO2)** - Symbol: `CO2`, Decimals: 18
5. **Nitrogen (N2)** - Symbol: `N2`, Decimals: 18

**Admin Functions:**
```solidity
function mint(address to, uint256 amount) external onlyOwner;
function burn(uint256 amount) external;
```

**Rationale:** Simple ERC-20. Admin-only minting ensures game backend controls resource creation.

---

#### **ShipNFT.sol** (ERC-721 + ERC-6551)
**Purpose:** Ships as NFTs with Token Bound Accounts
**Key Features:**
- ERC-721 standard compliance
- ERC-6551 TBA creation on mint
- Ship metadata stored on-chain (upgradable via tokenURI for off-chain storage later)
- Admin-only minting
- Ship stats stored in struct

**Ship Data Structure:**
```solidity
struct ShipStats {
    uint256 mass;              // kg (e.g., 10000)
    uint256 sailArea;          // m² (e.g., 3000000 = 3 km²)
    uint256 sailReflectivity;  // Basis points (9000 = 0.9 = 90%)
    uint256 maxSailCount;      // Max number of sails (1-20)
    uint256 cargoCapacity;     // Max resource units ship can hold
    string className;          // Ship class name (e.g., "HELIOS-CLASS")
    uint256 condition;         // Ship condition 0-10000 (10000 = perfect)
}
```

**Admin Functions:**
```solidity
function mintShip(
    address to,
    string memory className,
    uint256 mass,
    uint256 sailArea,
    uint256 sailReflectivity,
    uint256 maxSailCount,
    uint256 cargoCapacity
) external onlyOwner returns (uint256 tokenId);

function getShipStats(uint256 tokenId) external view returns (ShipStats memory);
function getShipTBA(uint256 tokenId) external view returns (address);
```

**ERC-6551 Integration:**
- On mint, create a Token Bound Account for the ship
- Use ERC-6551 reference implementation from OpenZeppelin
- TBA address deterministic from: `(chainId, tokenContract, tokenId, implementationAddress, salt)`

**Rationale:** Ships are the core NFT. TBAs automatically hold cargo. Transfer ship = transfer cargo.

---

#### **CelestialBody.sol**
**Purpose:** Represents planets/moons as on-chain entities with resource emission
**Key Features:**
- Each celestial body has a name and emission profile
- Emission profile maps resource → emission rate
- Admin-only harvest function

**Data Structure:**
```solidity
struct EmissionProfile {
    address resourceToken;  // ERC-20 token address
    uint256 ratePerSecond;  // Base emission rate (18 decimals)
    bool isActive;          // Can be disabled
}

struct CelestialBodyData {
    string name;            // "TITAN", "EUROPA", etc.
    string bodyType;        // "planet", "moon", "asteroid"
    EmissionProfile[] emissions;
}
```

**Admin Functions:**
```solidity
function harvest(
    address shipTBA,
    address resourceToken,
    uint256 amount
) external onlyOwner;

function setEmissionRate(
    address resourceToken,
    uint256 newRate
) external onlyOwner;

function addResource(
    address resourceToken,
    uint256 ratePerSecond
) external onlyOwner;
```

**Rationale:**
- One contract per celestial body? Or a factory/registry pattern?
- **Proposed:** Use a `CelestialBodyRegistry.sol` that creates individual `CelestialBody` contracts via a factory pattern. Registry maintains mapping `name => contract address`.

---

#### **CelestialBodyRegistry.sol**
**Purpose:** Factory and registry for celestial bodies
**Key Features:**
- Deploy new celestial body contracts
- Maintain name → address mapping
- Admin access control

**Admin Functions:**
```solidity
function createCelestialBody(
    string memory name,
    string memory bodyType
) external onlyOwner returns (address);

function getCelestialBody(string memory name) external view returns (address);
function getAllBodies() external view returns (address[] memory);
```

**Rationale:** Factory pattern keeps it flexible. Can add/remove bodies without redeploying core contracts.

---

### 1.3 Access Control

**Strategy:** Use OpenZeppelin's `Ownable` for Phase 1.
- Deployer = owner
- Owner can mint ships, resources, harvest from planets
- Owner can update registry addresses

**Future:** Migrate to role-based access control (RBAC) when multiple backend servers need different permissions.

---

### 1.4 Deployment Order

1. **GameRegistry**
2. **ResourceToken** (CH4, O2, H2O) → register addresses in GameRegistry
3. **ShipNFT** → register in GameRegistry
4. **CelestialBodyRegistry** → register in GameRegistry
5. **CelestialBody instances** (Titan, Europa, Mars, etc.) → created via registry

**Deployment Script Output:**
```json
{
  "chainId": 1337,
  "gameRegistry": "0x...",
  "resources": {
    "CH4": "0x...",
    "O2": "0x...",
    "H2O": "0x..."
  },
  "shipNFT": "0x...",
  "celestialBodyRegistry": "0x...",
  "celestialBodies": {
    "TITAN": "0x...",
    "EUROPA": "0x...",
    "MARS": "0x..."
  }
}
```

This JSON is consumed by the backoffice.

---

## 2. Backoffice Architecture

### 2.1 Tech Stack

- **Backend:** Node.js + Express.js
- **Blockchain Interaction:** ethers.js v6
- **Frontend:** Native ES6 JavaScript (no frameworks)
- **Styling:** CSS3 with dark theme
- **Configuration:** Environment variables (`.env`)

### 2.2 Directory Structure

```
backoffice/
├── server/
│   ├── index.js              # Express server entry point
│   ├── routes/
│   │   ├── deploy.js         # Contract deployment routes
│   │   ├── ships.js          # Ship management routes
│   │   ├── resources.js      # Resource management routes
│   │   └── celestialBodies.js # Celestial body routes
│   ├── services/
│   │   ├── blockchain.js     # Ethers.js provider/signer setup
│   │   ├── contracts.js      # Contract instance factory
│   │   └── validation.js     # Input validation
│   └── config.js             # Load .env, export config
├── public/
│   ├── index.html            # Main admin UI
│   ├── css/
│   │   └── style.css         # Dark theme, layout
│   ├── js/
│   │   ├── main.js           # Frontend entry point
│   │   ├── api.js            # Fetch wrapper for backend routes
│   │   ├── ui/
│   │   │   ├── deploy.js     # Deployment UI
│   │   │   ├── ships.js      # Ship configurator UI
│   │   │   ├── resources.js  # Resource management UI
│   │   │   └── celestialBodies.js # Planet management UI
│   │   └── utils.js          # Formatting, validation
│   └── abis/                 # Contract ABIs (generated by Team A)
│       ├── GameRegistry.json
│       ├── ShipNFT.json
│       ├── ResourceToken.json
│       ├── CelestialBody.json
│       └── CelestialBodyRegistry.json
├── tests/
│   ├── integration/          # API integration tests
│   │   ├── deploy.test.js
│   │   ├── ships.test.js
│   │   └── resources.test.js
│   └── unit/                 # Service unit tests
│       ├── blockchain.test.js
│       └── validation.test.js
├── .env.example              # Example environment config
├── package.json
└── README.md
```

### 2.3 Backend API Routes

**Base URL:** `http://localhost:3000/api`

#### **Deployment (`POST /api/deploy`)**
- Deploy all contracts to the configured chain
- Returns deployment JSON (addresses)
- **Test-first:** Write test that mocks ethers.js deployment, then implement route

#### **Ships (`/api/ships`)**
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/ships/mint` | Mint a new ship |
| `GET` | `/ships/:tokenId` | Get ship stats and TBA balance |
| `GET` | `/ships` | List all ships |
| `GET` | `/ships/:tokenId/tba` | Get TBA address and balances |

**Example Request:**
```json
POST /api/ships/mint
{
  "to": "0x...",
  "className": "HELIOS-CLASS",
  "mass": 10000,
  "sailArea": 3000000,
  "sailReflectivity": 9000,
  "maxSailCount": 5,
  "cargoCapacity": 1000000
}
```

#### **Resources (`/api/resources`)**
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/resources/mint` | Mint resources to a TBA |
| `GET` | `/resources/balances/:address` | Get all resource balances for address |

**Example Request:**
```json
POST /api/resources/mint
{
  "resourceSymbol": "CH4",
  "to": "0x... (TBA address)",
  "amount": "1000000000000000000000" // 1000 CH4 (18 decimals)
}
```

#### **Celestial Bodies (`/api/celestial-bodies`)**
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/celestial-bodies/create` | Deploy a new celestial body |
| `POST` | `/celestial-bodies/:name/add-resource` | Add resource to emission profile |
| `POST` | `/celestial-bodies/:name/harvest` | Harvest resources to ship TBA |
| `GET` | `/celestial-bodies` | List all bodies |
| `GET` | `/celestial-bodies/:name` | Get body details and emission profile |

**Example Harvest Request:**
```json
POST /api/celestial-bodies/TITAN/harvest
{
  "shipTokenId": 1,
  "resourceSymbol": "CH4",
  "amount": "5000000000000000000000" // 5000 CH4
}
```

### 2.4 Frontend UI (Dark Theme)

**Color Palette:**
```css
:root {
  --bg-dark: #0a0a0f;
  --bg-panel: #1a1a2e;
  --bg-input: #252540;
  --border: #3a3a5c;
  --text-primary: #e0e0e8;
  --text-secondary: #a0a0b0;
  --accent-teal: #4ee8c4;
  --accent-amber: #ffb84d;
  --accent-blue: #4d9fff;
  --accent-red: #ff5555;
  --success: #4ce88d;
  --warning: #ffb84d;
  --danger: #e85d4c;
}
```

**Layout:**
- Top nav bar: Logo, chain connection status, admin wallet address
- Sidebar: Tabs for Deploy, Ships, Resources, Celestial Bodies
- Main content area: Forms, tables, data displays
- Footer: Chain URL, block number, network status

**Key UX Patterns:**
- **Loading states:** Spinner while transactions confirm
- **Success/error toasts:** Visual feedback for operations
- **Copy buttons:** For addresses, transaction hashes
- **Collapsible sections:** For emission profiles, ship stats
- **Data tables:** Sortable, searchable for ships/resources

### 2.5 Configuration (`.env`)

```bash
# Blockchain
CHAIN_URL=http://localhost:8545
CHAIN_ID=1337
ADMIN_PRIVATE_KEY=0x...

# Server
PORT=3000
NODE_ENV=development

# Contract Addresses (populated after deployment)
GAME_REGISTRY_ADDRESS=
SHIP_NFT_ADDRESS=
CELESTIAL_BODY_REGISTRY_ADDRESS=
CH4_TOKEN_ADDRESS=
O2_TOKEN_ADDRESS=
H2O_TOKEN_ADDRESS=
```

**Deployment workflow:**
1. Admin sets `CHAIN_URL`, `CHAIN_ID`, `ADMIN_PRIVATE_KEY`
2. Clicks "Deploy Contracts" in UI
3. Backend deploys contracts, writes addresses to `.env`
4. UI refreshes with deployed contract data

---

## 3. Team Structure & File Ownership

### Team A: Contracts Team

**Owned Directories:**
- `/contracts/**` (all Solidity files)
- `/test/contracts/**` (contract tests)
- `/scripts/**` (deployment scripts)
- `/hardhat.config.js` or `/foundry.toml`
- `/backoffice/public/abis/**` (generated ABIs)

**Agents:**
- **Lead:** `architect.md` (contract architecture decisions)
- **Implementation:** `blockchain-solidity-expert.md` (write all Solidity)
- **Testing:** `functional-tester.md` (write contract tests)
- **Review:** `physicist.md` + `solar-sailing-expert.md` (validate ship stats make physical sense)

**Deliverables:**
1. All contracts deployed to local test chain
2. Test suite with >90% coverage
3. Deployment script that outputs JSON with addresses
4. ABI files written to `/backoffice/public/abis/`

**TDD Workflow Example (for ShipNFT):**
```javascript
// test/ShipNFT.test.js
describe("ShipNFT", function () {
  it("should mint a ship with correct stats", async function () {
    // RED: Write failing test
    const tx = await shipNFT.mintShip(
      owner.address, "HELIOS-CLASS", 10000, 3000000, 9000, 5, 1000000
    );
    const receipt = await tx.wait();
    const tokenId = receipt.events[0].args.tokenId;

    const stats = await shipNFT.getShipStats(tokenId);
    expect(stats.className).to.equal("HELIOS-CLASS");
    expect(stats.mass).to.equal(10000);
    // ... more assertions
  });

  // GREEN: Implement ShipNFT.mintShip() until test passes
  // REFACTOR: Clean up implementation
});
```

---

### Team B: Backoffice Team

**Owned Directories:**
- `/backoffice/**` (except `/backoffice/public/abis/`)

**Agents:**
- **Backend Lead:** `backend-nodejs-expert.md`
- **Frontend Lead:** `native-js-expert.md`
- **UI/UX:** `scifi-ui-ux-expert.md` (dark theme design)
- **Testing:** `functional-tester.md` (API tests, frontend tests)

**Deliverables:**
1. Node.js backend with all API routes
2. Frontend admin UI (dark theme, functional)
3. Integration test suite for all routes
4. Documentation for API endpoints

**TDD Workflow Example (for Ships API):**
```javascript
// tests/integration/ships.test.js
describe("POST /api/ships/mint", function () {
  it("should mint a ship and return tokenId", async function () {
    // RED: Write failing test
    const response = await request(app)
      .post("/api/ships/mint")
      .send({
        to: testAddress,
        className: "TEST-CLASS",
        mass: 10000,
        sailArea: 3000000,
        sailReflectivity: 9000,
        maxSailCount: 5,
        cargoCapacity: 1000000
      });

    expect(response.status).to.equal(200);
    expect(response.body).to.have.property("tokenId");
    expect(response.body).to.have.property("txHash");
    // ... more assertions
  });

  // GREEN: Implement route until test passes
  // REFACTOR: Clean up route handler
});
```

---

### Handshake Points (Critical Coordination)

#### **Handshake #1: Contract ABIs**
- **What:** Team A writes ABIs to `/backoffice/public/abis/`
- **When:** After each contract is written and tested
- **How:** Hardhat/Foundry automatically generates ABIs on compile
- **Team B needs:** ABI files to instantiate contract instances in backend

**Process:**
1. Team A compiles contracts → ABIs generated
2. Team A copies ABIs to `/backoffice/public/abis/`
3. Team A commits and notifies lead
4. Team B pulls latest ABIs, updates backend contract instances

#### **Handshake #2: Ship Configurator UI**
- **What:** Frontend form to mint ships with stats
- **When:** After Team A deploys ShipNFT and Team B builds ships API route
- **How:** Team B reads `ShipNFT.json` ABI to know function signatures

**Dependencies:**
- Team A: `ShipNFT.sol` deployed, `mintShip()` function tested
- Team B: `POST /api/ships/mint` route implemented

**Integration Test:**
1. Team B: Write integration test that calls `POST /api/ships/mint`
2. Team B: Build frontend form that calls the API
3. Team A: Provide test contract address for Team B to use

---

## 4. Testing Strategy (TDD Mandatory)

### 4.1 Contract Tests (Team A)

**Framework:** Hardhat + Chai (or Foundry if preferred)

**Coverage Requirements:**
- All public/external functions tested
- Happy paths and failure cases
- Access control (admin-only functions reject non-admins)
- ERC standards compliance (ERC-20, ERC-721, ERC-6551)

**Critical Test Cases:**
```javascript
// ShipNFT.sol
✓ Should mint ship with correct stats
✓ Should create TBA on mint
✓ Should reject non-admin mint
✓ Should transfer ship and cargo together
✓ Should emit ShipMinted event

// CelestialBody.sol
✓ Should harvest resources to ship TBA
✓ Should reject harvest from non-admin
✓ Should enforce emission rate limits
✓ Should disable/enable resources

// ResourceToken.sol
✓ Should mint tokens to address
✓ Should reject mint from non-admin
✓ Should allow burning
```

### 4.2 Backoffice Tests (Team B)

**Framework:** Mocha + Chai + Supertest (API), Jest (frontend unit tests)

**Coverage Requirements:**
- All API routes tested (happy path + error cases)
- Service functions unit tested
- Critical frontend logic unit tested (validation, formatting)

**Critical Test Cases:**
```javascript
// API Routes
✓ POST /api/deploy should deploy contracts
✓ POST /api/ships/mint should mint ship and return tokenId
✓ GET /api/ships/:tokenId should return ship stats
✓ GET /api/ships/:tokenId/tba should return TBA balances
✓ POST /api/resources/mint should mint to TBA
✓ POST /api/celestial-bodies/TITAN/harvest should transfer resources

// Error Cases
✓ Should reject invalid ship stats (negative mass, etc.)
✓ Should reject harvest with insufficient emission rate
✓ Should return 404 for non-existent ship
```

### 4.3 Integration Tests (End-to-End)

**Owner:** Lead coordinator (me)

**Critical Flows:**
1. **Deploy → Mint Ship → View TBA Balance**
   - Deploy all contracts
   - Mint a HELIOS-CLASS ship
   - Check ship has empty TBA
   - Verify TBA address is correct

2. **Harvest Resources → Verify Balance**
   - Create TITAN celestial body
   - Add CH4 to emission profile
   - Harvest 5000 CH4 to ship TBA
   - Verify TBA balance increased

3. **Transfer Ship → Cargo Follows**
   - Mint ship to address A
   - Harvest resources to ship TBA
   - Transfer ship NFT to address B
   - Verify TBA now owned by address B
   - Verify resources still in TBA

---

## 5. Planet Resource Profiles (Initial Data)

**For Phase 1, implement these bodies:**

| Body | Resources | Emission Rate (per second) | Notes |
|------|-----------|---------------------------|-------|
| **TITAN** | CH₄ | 100/s | Saturn's moon, methane lakes |
| **EUROPA** | H₂O | 100/s | Jupiter's moon, subsurface ocean |
| **MARS** | CO₂, H₂O | CO₂: 50/s, H₂O: 10/s | Thin atmosphere, polar ice |
| **VENUS** | CO₂, N₂ | CO₂: 80/s, N₂: 30/s | Thick atmosphere, cloud mining |

**Phase 2 candidates (don't implement yet):**
- Jupiter (H₂, He)
- Saturn (H₂, He)
- Mercury (extreme conditions)

**Rationale:** Start small. 3 bodies, 3 primary resources. Prove the architecture works before expanding.

---

## 6. Definition of Done (Phase 1 Checklist)

### Contracts (Team A)
- [ ] All contracts compiled without errors
- [ ] All contracts deployed to local test chain (e.g., Hardhat Network)
- [ ] Test suite passes with >90% coverage
- [ ] ABIs written to `/backoffice/public/abis/`
- [ ] Deployment script outputs JSON with addresses

### Backoffice (Team B)
- [ ] Node.js server runs without errors
- [ ] All API routes functional
- [ ] Frontend loads and connects to backend
- [ ] Dark theme implemented and looks professional
- [ ] Chain URL configurable via `.env`
- [ ] Integration tests pass

### Integration (Lead)
- [ ] Can deploy contracts from backoffice UI
- [ ] Can mint a ship with custom stats
- [ ] Ship has a Token Bound Account
- [ ] Can harvest CH₄ from TITAN to ship TBA
- [ ] Can view ship TBA balance in UI
- [ ] Transferring ship transfers cargo with it
- [ ] Full test suite (contracts + backoffice) passes

---

## 7. Timeline & Milestones

**Phase 1 is time-boxed to be a proof of concept. Estimate: 3-5 days of development time.**

### Milestone 1: Architecture Approval (Day 0)
- This document reviewed and approved
- Team assignments confirmed

### Milestone 2: Contracts Foundation (Day 1-2)
- Team A: Contract architecture finalized, ABIs generated
- All contract tests written (RED phase of TDD)

### Milestone 3: Backoffice Foundation (Day 1-2)
- Team B: Backend scaffolded, routes stubbed
- All API tests written (RED phase of TDD)
- Frontend scaffolded with dark theme

### Milestone 4: GREEN Phase (Day 2-3)
- Team A: All contract tests passing
- Team B: All API tests passing
- Handshake #1 complete (ABIs shared)

### Milestone 5: Integration (Day 3-4)
- Backoffice UI functional
- Can perform all critical flows end-to-end
- Handshake #2 complete (Ship configurator working)

### Milestone 6: Verification & Cleanup (Day 4-5)
- All tests passing
- Code reviewed and refactored
- Documentation complete
- Demo ready

---

## 8. Open Questions & Decisions Needed

### Q1: Hardhat or Foundry?
**Decision needed from user.**

**Recommendation:** Hardhat (JS ecosystem, easier Team B integration)

### Q2: ERC-6551 Implementation
**Options:**
1. Use OpenZeppelin's implementation (if available)
2. Use tokenbound.org reference implementation
3. Roll our own (NOT recommended for Phase 1)

**Recommendation:** Use tokenbound.org reference implementation.

### Q3: Cargo Capacity Enforcement
**Question:** Should contracts enforce cargo capacity limits, or is that a backend concern?

**Recommendation:** Contracts should NOT enforce capacity in Phase 1. The backend validates before calling harvest. Keeps contracts simple. Add on-chain enforcement in Phase 2 if needed.

### Q4: Resource Units
**Question:** How many decimal places for resources? (ERC-20 standard is 18)

**Recommendation:** 18 decimals (standard). 1 unit = 1e18 smallest units.

### Q5: Chain Selection for Testing
**Options:**
1. Local Hardhat Network (ephemeral)
2. Local Ganache (ephemeral)
3. Testnet (Sepolia, etc.)
4. Private chain (persistent)

**Recommendation:** Local Hardhat Network for development. Provide instructions for deploying to private chain.

---

## 9. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| ERC-6551 integration complexity | Medium | High | Use battle-tested reference implementation, write thorough tests |
| Team A/B sync issues (file conflicts) | Low | Medium | Strict file ownership, handshake protocols |
| Contract gas costs too high | Low | Low | Phase 1 is proof of concept, optimize in Phase 2 |
| Backend security (private key exposure) | Medium | High | Use `.env`, add to `.gitignore`, document best practices |
| Frontend complexity creep | Medium | Medium | Stick to native JS, no frameworks, keep it simple |

---

## 10. Next Steps (Pending Approval)

**If this architecture is approved:**

1. **User confirms:**
   - Hardhat or Foundry?
   - Any changes to contract design?
   - Any changes to planet resource profiles?

2. **Lead spawns agent teams:**
   - Team A (Contracts): 3-4 agents
   - Team B (Backoffice): 3-4 agents

3. **Teams begin RED phase:**
   - Write failing tests first
   - No implementation until tests exist

4. **Lead monitors handshake points:**
   - ABIs shared on schedule
   - Integration blockers resolved immediately

---

## Appendix A: Ship Stat Mapping (Game → Blockchain)

**Current game ship stats (from `ships.js`):**

| Game Property | Blockchain Property | Type | Notes |
|---------------|---------------------|------|-------|
| `mass` | `mass` | `uint256` | kg (e.g., 10000) |
| `sail.area` | `sailArea` | `uint256` | m² (e.g., 3000000) |
| `sail.reflectivity` | `sailReflectivity` | `uint256` | Basis points (9000 = 0.9) |
| `sail.sailCount` | `maxSailCount` | `uint256` | Max sails ship can deploy (1-20) |
| — | `cargoCapacity` | `uint256` | NEW: Max resource units |
| — | `className` | `string` | NEW: Ship class name |
| `sail.condition` | `condition` | `uint256` | 0-10000 (10000 = perfect) |

**Not stored on-chain (gameplay state):**
- `orbitalElements` (position calculated in game client)
- `sail.angle`, `sail.pitchAngle`, `sail.deploymentPercent` (player control inputs)
- `velocity`, `x`, `y`, `z` (derived from orbital mechanics)

**Rationale:** Blockchain stores identity and capabilities. Game client stores state and position.

---

## Appendix B: Contract Interfaces (Proposed)

### IGameRegistry
```solidity
interface IGameRegistry {
    function getShipNFT() external view returns (address);
    function getCelestialBodyRegistry() external view returns (address);
    function getResourceToken(string memory symbol) external view returns (address);
}
```

### IShipNFT
```solidity
interface IShipNFT {
    struct ShipStats {
        uint256 mass;
        uint256 sailArea;
        uint256 sailReflectivity;
        uint256 maxSailCount;
        uint256 cargoCapacity;
        string className;
        uint256 condition;
    }

    function mintShip(
        address to,
        string memory className,
        uint256 mass,
        uint256 sailArea,
        uint256 sailReflectivity,
        uint256 maxSailCount,
        uint256 cargoCapacity
    ) external returns (uint256 tokenId);

    function getShipStats(uint256 tokenId) external view returns (ShipStats memory);
    function getShipTBA(uint256 tokenId) external view returns (address);
}
```

### ICelestialBody
```solidity
interface ICelestialBody {
    function harvest(
        address shipTBA,
        address resourceToken,
        uint256 amount
    ) external;

    function addResource(address resourceToken, uint256 ratePerSecond) external;
    function setEmissionRate(address resourceToken, uint256 newRate) external;
    function getEmissionProfile() external view returns (EmissionProfile[] memory);
}
```

---

**END OF ARCHITECTURE PROPOSAL**

**Status:** ✅ APPROVED (2026-02-11)
**Decisions:**
- Build tool: Hardhat
- Contract architecture: Approved as proposed
- Initial bodies: TITAN, EUROPA, MARS, VENUS (added per user request)
- Cargo capacity: Backend validation for Phase 1
- Next Action: Initialize project structure and spawn agent teams
